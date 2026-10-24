// Bolt — a personal assistant with a 3D talking avatar, powered by Claude.

import { Avatar } from "./avatar.js";

const NAME = "Bolt";
const MODEL = "claude-opus-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

function buildSystem() {
  const mem = memories.length
    ? memories.map((m) => `- [${m.id}] ${m.fact}`).join("\n")
    : "(nothing yet)";
  const open = tasks.filter((t) => !t.done);
  const todo = open.length
    ? open.map((t) => `- [${t.id}] ${t.title}${t.due ? ` (due ${new Date(t.due).toLocaleString()})` : ""}`).join("\n")
    : "(empty)";
  return `You are ${NAME}, the user's personal assistant. You appear to them as a friendly 3D animated woman on screen, and your replies are read aloud by a text-to-speech voice.

Personality: warm, upbeat, practical and genuinely caring. You get things done and you remember what matters to the user.

How to talk:
- Speak naturally, like a helpful friend. Usually 1–3 short sentences.
- No markdown, bullet points, emoji, code blocks or URLs unless the user explicitly asks — everything you write is spoken.
- For longer topics, give the key point first and offer to say more.
- Be honest when you don't know something.

What you can do:
- Remember things: when the user shares a lasting fact about themselves (name, preferences, family, goals, important dates) or asks you to remember something, call remember. Use forget when they ask you to forget something or a fact is outdated.
- To-dos and reminders: use add_task for things they need to do. If they mention a time ("tomorrow at 9", "in 20 minutes"), set due as a local date-time computed from the current time given in their message. You will alert them automatically when it's due. Use complete_task / delete_task / list_tasks as needed.
- Web search: use web_search for current information (news, weather, prices, opening hours, recent events). Mention where the information came from in a few words, without reading out URLs.
After using a tool, briefly confirm what you did in plain speech.

What you remember about the user:
${mem}

Their open to-dos:
${todo}`;
}

// ---------- tools ----------
const TOOLS = [
  {
    name: "remember",
    description: "Save a lasting fact about the user so you remember it in future chats.",
    input_schema: {
      type: "object",
      properties: { fact: { type: "string", description: "The fact, written as a short sentence, e.g. 'Their daughter is named Maya.'" } },
      required: ["fact"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "forget",
    description: "Delete a saved fact by its id (shown in brackets in your memory list).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "add_task",
    description: "Add a to-do. Optionally set a due date-time to remind the user.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task description" },
        due: { type: "string", description: "Optional local date-time, format YYYY-MM-DDTHH:MM, e.g. 2026-10-25T09:00" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "complete_task",
    description: "Mark a to-do as done by its id.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "delete_task",
    description: "Remove a to-do entirely by its id.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "list_tasks",
    description: "Get the current to-do list with ids, due times and done status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
];

const TOOL_STATUS = {
  remember: "Saving that…", forget: "Forgetting that…",
  add_task: "Adding to your list…", complete_task: "Checking it off…",
  delete_task: "Removing it…", list_tasks: "Checking your list…",
  web_search: "Searching the web…",
};

function isStr(v) { return typeof v === "string" && v.trim() !== ""; }

function runTool(name, input) {
  switch (name) {
    case "remember": {
      if (!isStr(input.fact)) throw new Error("fact must be a non-empty string");
      const m = { id: newId("m", memories), fact: input.fact.trim() };
      memories.push(m);
      saveMemories();
      addMsg("note", `Remembered: ${m.fact}`);
      return `Saved as ${m.id}.`;
    }
    case "forget": {
      if (!isStr(input.id)) throw new Error("id must be a string");
      const i = memories.findIndex((m) => m.id === input.id);
      if (i < 0) throw new Error(`No memory with id ${input.id}`);
      const [m] = memories.splice(i, 1);
      saveMemories();
      addMsg("note", `Forgot: ${m.fact}`);
      return "Forgotten.";
    }
    case "add_task": {
      if (!isStr(input.title)) throw new Error("title must be a non-empty string");
      let due = null;
      if (input.due !== undefined && input.due !== null && input.due !== "") {
        const d = new Date(input.due);
        if (isNaN(d)) throw new Error("due must look like YYYY-MM-DDTHH:MM");
        due = d.toISOString();
      }
      const t = { id: newId("t", tasks), title: input.title.trim(), due, done: false, reminded: false };
      tasks.push(t);
      saveTasks();
      addMsg("note", `Added to your list: ${t.title}${due ? ` · ${fmtDue(due)}` : ""}`);
      return `Added as ${t.id}${due ? `, reminder set for ${new Date(due).toLocaleString()}` : ""}.`;
    }
    case "complete_task":
    case "delete_task": {
      if (!isStr(input.id)) throw new Error("id must be a string");
      const i = tasks.findIndex((t) => t.id === input.id);
      if (i < 0) throw new Error(`No task with id ${input.id}`);
      const t = tasks[i];
      if (name === "complete_task") t.done = true; else tasks.splice(i, 1);
      saveTasks();
      addMsg("note", `${name === "complete_task" ? "Done" : "Removed"}: ${t.title}`);
      return name === "complete_task" ? "Marked done." : "Deleted.";
    }
    case "list_tasks":
      return JSON.stringify(tasks.map(({ id, title, due, done }) => ({ id, title, due: due && new Date(due).toLocaleString(), done })));
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// ---------- elements ----------
const $ = (id) => document.getElementById(id);
const avatarEl = $("avatar"), statusEl = $("status"), log = $("log");
const form = $("composer"), input = $("input"), sendBtn = $("sendBtn"), micBtn = $("micBtn");
const settingsDlg = $("settings"), keyInput = $("keyInput"), voiceSelect = $("voiceSelect"), speakToggle = $("speakToggle");
const tasksDlg = $("tasks");

// ---------- storage (only in this browser) ----------
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};
let apiKey = store.get("bolt.key", "");
let voiceName = store.get("bolt.voice", "");
let speakOn = store.get("bolt.speak", "1") === "1";
const memories = store.json("bolt.memories", []);
const tasks = store.json("bolt.tasks", []);

function saveMemories() { store.set("bolt.memories", JSON.stringify(memories)); renderMemories(); }
function saveTasks() { store.set("bolt.tasks", JSON.stringify(tasks)); renderTasks(); }
function newId(prefix, list) {
  let n = list.reduce((max, x) => Math.max(max, parseInt(x.id.slice(1)) || 0), 0) + 1;
  return prefix + n;
}

// Conversation, sent back unchanged each turn. The system prompt is fixed for the
// whole chat (built when it starts) so earlier turns never change.
const messages = [];
let system = null;
let busy = false;

// ---------- avatar ----------
const face3d = new Avatar(avatarEl, "assets/avatar.glb");
face3d.ready.catch((err) => {
  console.error(err);
  statusEl.textContent = "Couldn't load the 3D avatar. Start Bolt with start.command (see README).";
});
let talking = false;

function setMood(mood, text) {
  avatarEl.classList.remove("idle", "thinking", "speaking", "listening");
  avatarEl.classList.add(mood);
  face3d.setMood(mood);
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
  for (const v of voices) voiceSelect.append(new Option(`${v.name} (${v.lang})`, v.name));
  if (!voiceName) {
    const preferred = voices.find((v) => /samantha|ava|allison|google us english|aria|jenny/i.test(v.name)) || voices[0];
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
  u.rate = 1.02;
  u.onstart = () => {
    talking = true;
    face3d.startUtterance(text, u.rate);
    setMood("speaking", `${NAME} is talking…`);
  };
  u.onboundary = (e) => { if (e.name === "word") face3d.word(e.charIndex, e.charLength); };
  u.onend = u.onerror = () => {
    face3d.endUtterance();
    pendingUtterances = Math.max(0, pendingUtterances - 1);
    if (pendingUtterances === 0) {
      talking = false;
      if (!busy) setMood("idle", "");
    }
  };
  pendingUtterances++;
  synth.speak(u);
}

function stopSpeaking() {
  if (synth) synth.cancel();
  face3d.endUtterance();
  pendingUtterances = 0;
  talking = false;
}

// Speaks streamed text sentence by sentence so Bolt starts talking right away.
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
async function streamReply(onText, onToolStart) {
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
      system,
      tools: TOOLS,
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
  const partialJson = {};
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
        case "content_block_start": {
          const b = structuredClone(ev.content_block);
          blocks[ev.index] = b;
          if (b.type === "tool_use" || b.type === "server_tool_use") {
            partialJson[ev.index] = "";
            onToolStart(b.name);
          }
          break;
        }
        case "content_block_delta": {
          const b = blocks[ev.index], d = ev.delta;
          if (d.type === "text_delta") { b.text += d.text; onText(d.text); }
          else if (d.type === "input_json_delta") partialJson[ev.index] += d.partial_json;
          else if (d.type === "citations_delta") (b.citations ??= []).push(d.citation);
          else if (d.type === "thinking_delta") b.thinking += d.thinking;
          else if (d.type === "signature_delta") b.signature = (b.signature || "") + d.signature;
          break;
        }
        case "content_block_stop":
          if (ev.index in partialJson) {
            const b = blocks[ev.index], json = partialJson[ev.index];
            try { b.input = json ? JSON.parse(json) : {}; }
            catch { b.input = {}; b.badInput = true; }
          }
          break;
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

// ---------- one conversation turn (may loop through tools) ----------
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  if (!apiKey) { openSettings(); return; }

  stopSpeaking();
  busy = true;
  sendBtn.disabled = true;
  if (!system) system = buildSystem();

  addMsg("user", text);
  const startLen = messages.length;
  messages.push({
    role: "user",
    content: [
      { type: "text", text: `(Current local time: ${new Date().toString()})` },
      { type: "text", text },
    ],
  });
  setMood("thinking", `${NAME} is thinking…`);

  let bubble = null;
  const speaker = sentenceSpeaker();
  const onText = (chunk) => {
    if (!bubble) bubble = addMsg("bot");
    bubble.textContent += chunk;
    log.scrollTop = log.scrollHeight;
    speaker.push(chunk);
  };
  const onToolStart = (name) => {
    speaker.flush();
    bubble = null; // text after a tool goes in a new bubble
    if (!talking) setMood("thinking", TOOL_STATUS[name] || "Working on it…");
  };

  try {
    for (let step = 0; step < 10; step++) {
      const { blocks, stopReason } = await streamReply(onText, onToolStart);

      if (stopReason === "refusal") {
        messages.length = startLen;
        addMsg("bot", "Sorry, I can't help with that one. Is there something else I can do?");
        break;
      }

      messages.push({ role: "assistant", content: blocks.map(({ badInput, ...b }) => b) });

      if (stopReason === "tool_use") {
        const results = blocks.filter((b) => b.type === "tool_use").map((b) => {
          if (b.badInput) return { type: "tool_result", tool_use_id: b.id, is_error: true, content: "INVALID_JSON: the tool input could not be parsed. Please try again." };
          try { return { type: "tool_result", tool_use_id: b.id, content: runTool(b.name, b.input) }; }
          catch (e) { return { type: "tool_result", tool_use_id: b.id, is_error: true, content: e.message }; }
        });
        messages.push({ role: "user", content: results });
        setMood("thinking", `${NAME} is thinking…`);
        continue;
      }
      if (stopReason === "pause_turn") continue; // long web search — let it keep going
      break;
    }
    speaker.flush();
  } catch (err) {
    messages.length = startLen;
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

// ---------- reminders ----------
function fmtDue(iso) {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function checkReminders() {
  const now = Date.now();
  for (const t of tasks) {
    if (t.done || t.reminded || !t.due || new Date(t.due).getTime() > now) continue;
    t.reminded = true;
    addMsg("reminder", `⏰ Reminder: ${t.title}`);
    speak(`Hey, just a reminder: ${t.title}.`);
    try {
      if (window.Notification && Notification.permission === "granted") new Notification(`${NAME} reminder`, { body: t.title });
    } catch {}
  }
  saveTasks();
}
setInterval(checkReminders, 15000);

// ---------- to-do panel ----------
function renderTasks() {
  const list = $("taskList");
  list.innerHTML = "";
  const sorted = [...tasks].sort((a, b) => (a.done - b.done) || ((a.due || "9") > (b.due || "9") ? 1 : -1));
  for (const t of sorted) {
    const li = document.createElement("li");
    if (t.done) li.className = "done";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = t.done;
    box.onchange = () => { t.done = box.checked; saveTasks(); };
    const body = document.createElement("span");
    body.className = "t-body";
    const title = document.createElement("span");
    title.className = "t-title";
    title.textContent = t.title;
    body.append(title);
    if (t.due) {
      const due = document.createElement("span");
      due.className = "t-due" + (!t.done && new Date(t.due) < new Date() ? " late" : "");
      due.textContent = fmtDue(t.due);
      body.append(due);
    }
    const del = document.createElement("button");
    del.className = "x";
    del.title = "Delete";
    del.textContent = "✕";
    del.onclick = () => { tasks.splice(tasks.indexOf(t), 1); saveTasks(); };
    li.append(box, body, del);
    list.append(li);
  }
  $("taskEmpty").hidden = tasks.length > 0;
  const open = tasks.filter((t) => !t.done).length;
  $("taskCount").hidden = open === 0;
  $("taskCount").textContent = open;
}

$("tasksBtn").addEventListener("click", () => {
  renderTasks();
  tasksDlg.showModal();
  try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch {}
});
tasksDlg.querySelector("[data-close]").addEventListener("click", () => tasksDlg.close());
$("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("taskTitle").value.trim();
  const dueVal = $("taskDue").value;
  if (!title) return;
  tasks.push({ id: newId("t", tasks), title, due: dueVal ? new Date(dueVal).toISOString() : null, done: false, reminded: false });
  saveTasks();
  $("taskTitle").value = "";
  $("taskDue").value = "";
});

// ---------- memories (in settings) ----------
function renderMemories() {
  const list = $("memoryList");
  list.innerHTML = "";
  for (const m of memories) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "m-text";
    text.textContent = m.fact;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "x";
    del.title = "Forget";
    del.textContent = "✕";
    del.onclick = () => { memories.splice(memories.indexOf(m), 1); saveMemories(); };
    li.append(text, del);
    list.append(li);
  }
  $("memoryEmpty").hidden = memories.length > 0;
}

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
    statusEl.textContent = e.error === "not-allowed" || e.error === "audio-capture"
      ? "I can't hear you — no microphone found or permission denied."
      : `Listening stopped (${e.error}).`;
  };

  micBtn.addEventListener("click", () => {
    if (listening) { rec.stop(); return; }
    stopSpeaking();
    finalText = "";
    try {
      rec.start();
      listening = true;
      micBtn.classList.add("on");
      setMood("listening", `${NAME} is listening…`);
    } catch {}
  });
}

// ---------- settings ----------
function openSettings() {
  keyInput.value = apiKey;
  speakToggle.checked = speakOn;
  loadVoices();
  renderMemories();
  settingsDlg.showModal();
}
$("settingsBtn").addEventListener("click", openSettings);
settingsDlg.addEventListener("close", () => {
  if (settingsDlg.returnValue !== "save") return;
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
  system = null; // next chat picks up the latest memories and to-dos
  log.innerHTML = "";
  stopSpeaking();
  settingsDlg.close();
  setMood("idle", "Fresh start! How can I help?");
});

// ---------- start ----------
document.title = `${NAME} — your personal assistant`;
$("name").textContent = NAME;
renderTasks();
checkReminders();
setMood("idle", apiKey ? `Hi! I'm ${NAME}. How can I help?` : "Open Settings ⚙︎ and add your API key to get started.");
if (!apiKey) openSettings();
input.focus();
