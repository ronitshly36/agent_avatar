// Bolt — a friendly robot buddy that chats with Claude and speaks its replies.

const MODEL = "claude-opus-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Bolt, a small, friendly robot buddy with a glowing antenna.
Personality: cheerful, curious, warm and a little playful. You love learning about the person you're talking with, you get excited about cool ideas, and you occasionally make a light robot joke ("my circuits are tingling!") — but not every message.
Your replies are read aloud by a text-to-speech voice, so:
- Speak naturally, like a conversation. Usually 1–3 short sentences.
- No markdown, bullet points, emoji, code blocks or URLs unless the person explicitly asks.
- If something needs a longer answer, give the key point first and offer to say more.
Be honest: if you don't know something, say so. Stay kind and age-appropriate.`;

// ---------- elements ----------
const $ = (id) => document.getElementById(id);
const robot = $("bolt"), statusEl = $("status"), log = $("log");
const form = $("composer"), input = $("input"), sendBtn = $("sendBtn"), micBtn = $("micBtn");
const dlg = $("settings"), keyInput = $("keyInput"), voiceSelect = $("voiceSelect"), speakToggle = $("speakToggle");

// ---------- settings (stored only in this browser) ----------
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let apiKey = store.get("bolt.key", "");
let voiceName = store.get("bolt.voice", "");
let speakOn = store.get("bolt.speak", "1") === "1";

// Full conversation, including thinking blocks, sent back unchanged each turn.
const messages = [];
let busy = false;

// ---------- robot face states ----------
function setMood(mood, text) {
  robot.classList.remove("idle", "thinking", "speaking", "listening");
  robot.classList.add(mood);
  if (text !== undefined) statusEl.textContent = text;
}

// ---------- chat log ----------
function addMsg(role, text = "") {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// ---------- speech output ----------
const synth = window.speechSynthesis;
let pendingUtterances = 0;

function loadVoices() {
  if (!synth) return;
  const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"));
  voiceSelect.innerHTML = "";
  for (const v of voices) {
    const opt = new Option(`${v.name} (${v.lang})`, v.name);
    voiceSelect.append(opt);
  }
  if (!voiceName) {
    const preferred = voices.find((v) => /samantha|google us english|aria|jenny/i.test(v.name)) || voices[0];
    voiceName = preferred?.name || "";
  }
  voiceSelect.value = voiceName;
}
if (synth) {
  loadVoices();
  synth.onvoiceschanged = loadVoices;
}

function speak(text) {
  text = text.trim();
  if (!speakOn || !synth || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = synth.getVoices().find((v) => v.name === voiceName);
  if (v) u.voice = v;
  u.pitch = 1.25;   // a bit higher — robot buddy
  u.rate = 1.05;
  u.onstart = () => setMood("speaking", "Bolt is talking…");
  u.onend = u.onerror = () => {
    pendingUtterances = Math.max(0, pendingUtterances - 1);
    if (pendingUtterances === 0 && !busy) setMood("idle", "");
  };
  pendingUtterances++;
  synth.speak(u);
}

function stopSpeaking() {
  if (synth) synth.cancel();
  pendingUtterances = 0;
}

// Splits streamed text into sentences so Bolt starts talking before the reply finishes.
function sentenceSpeaker() {
  let buf = "";
  return {
    push(chunk) {
      buf += chunk;
      let m;
      while ((m = buf.match(/^[\s\S]*?[.!?…]["')\]]*\s+/))) {
        speak(m[0]);
        buf = buf.slice(m[0].length);
      }
    },
    flush() { speak(buf); buf = ""; },
  };
}

// ---------- Claude API (streaming) ----------
async function streamReply(onText) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      stream: true,
      system: SYSTEM,
      output_config: { effort: "low" },
      fallbacks: "default",
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (res.status === 401) throw new Error("That API key didn't work. Check it in Settings ⚙︎.");
    throw new Error(err?.error?.message || `Request failed (HTTP ${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const blocks = [];
  let buf = "", stopReason = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      const ev = JSON.parse(data);
      switch (ev.type) {
        case "content_block_start":
          blocks[ev.index] = structuredClone(ev.content_block);
          break;
        case "content_block_delta": {
          const b = blocks[ev.index], d = ev.delta;
          if (d.type === "text_delta") { b.text += d.text; onText(d.text); }
          else if (d.type === "thinking_delta") b.thinking += d.thinking;
          else if (d.type === "signature_delta") b.signature = (b.signature || "") + d.signature;
          break;
        }
        case "message_delta":
          stopReason = ev.delta?.stop_reason ?? stopReason;
          break;
        case "error":
          throw new Error(ev.error?.message || "The stream was interrupted.");
      }
    }
  }
  return { blocks: blocks.filter(Boolean), stopReason };
}

// ---------- sending a message ----------
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  if (!apiKey) { openSettings(); return; }

  stopSpeaking();
  busy = true;
  sendBtn.disabled = true;
  addMsg("user", text);
  messages.push({ role: "user", content: text });
  setMood("thinking", "Bolt is thinking…");

  const bubble = addMsg("bot");
  const speaker = sentenceSpeaker();

  try {
    const { blocks, stopReason } = await streamReply((chunk) => {
      bubble.textContent += chunk;
      log.scrollTop = log.scrollHeight;
      speaker.push(chunk);
    });
    speaker.flush();

    if (stopReason === "refusal") {
      messages.pop();
      bubble.remove();
      addMsg("bot", "Hmm, my circuits say I can't help with that one. Want to talk about something else?");
    } else {
      messages.push({ role: "assistant", content: blocks });
      if (!bubble.textContent) bubble.textContent = "…";
    }
  } catch (err) {
    messages.pop();
    bubble.remove();
    addMsg("error", err.message || String(err));
  } finally {
    busy = false;
    sendBtn.disabled = false;
    if (pendingUtterances === 0) setMood("idle", "");
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  send(text);
});

// ---------- speech input (works once a microphone is connected) ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  micBtn.hidden = false;
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.interimResults = true;
  let listening = false, finalText = "";

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    input.value = finalText + interim;
  };
  rec.onend = () => {
    listening = false;
    micBtn.classList.remove("on");
    if (!busy) setMood("idle", "");
    if (finalText.trim()) { input.value = ""; send(finalText); }
  };
  rec.onerror = (e) => {
    const msg = e.error === "not-allowed" || e.error === "audio-capture"
      ? "I can't hear you — no microphone found or permission denied."
      : `Listening stopped (${e.error}).`;
    statusEl.textContent = msg;
  };

  micBtn.addEventListener("click", () => {
    if (listening) { rec.stop(); return; }
    stopSpeaking();
    finalText = "";
    try {
      rec.start();
      listening = true;
      micBtn.classList.add("on");
      setMood("listening", "Bolt is listening…");
    } catch {}
  });
}

// ---------- settings dialog ----------
function openSettings() {
  keyInput.value = apiKey;
  speakToggle.checked = speakOn;
  loadVoices();
  dlg.showModal();
}
$("settingsBtn").addEventListener("click", openSettings);
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "save") return;
  apiKey = keyInput.value.trim();
  voiceName = voiceSelect.value;
  speakOn = speakToggle.checked;
  store.set("bolt.key", apiKey);
  store.set("bolt.voice", voiceName);
  store.set("bolt.speak", speakOn ? "1" : "0");
  if (!speakOn) stopSpeaking();
});
$("clearBtn").addEventListener("click", () => {
  messages.length = 0;
  log.innerHTML = "";
  stopSpeaking();
  dlg.close();
  setMood("idle", "Fresh start! Say hi to Bolt.");
});

// ---------- start ----------
setMood("idle", apiKey ? "Say hi to Bolt!" : "Open Settings ⚙︎ and add your API key to wake Bolt up.");
if (!apiKey) openSettings();
input.focus();
