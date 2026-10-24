// Gmail + Google Drive access from the browser, using Google Identity Services.
// The access token lives only in memory and expires after about an hour.

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",   // needed to create drafts; Bolt has no send tool
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

const MAX_CHARS = 40000;

let clientId = "";
let tokenClient = null;
let token = null;
let expiresAt = 0;
let onChange = () => {};

export function initGoogle(id, changed) {
  clientId = id;
  tokenClient = null;
  if (changed) onChange = changed;
}

export function isConnected() {
  return !!token && Date.now() < expiresAt - 60_000;
}

// Must be called from a click so the Google sign-in popup isn't blocked.
export function connectGoogle() {
  if (!clientId) return Promise.reject(new Error("Add your Google Client ID first."));
  if (!window.google?.accounts?.oauth2) return Promise.reject(new Error("Google sign-in didn't load. Check your internet connection and reload."));
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPES, callback: () => {} });
    }
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, ...SCOPES.split(" "))) {
        return reject(new Error("Please allow all the Gmail and Drive permissions on Google's screen."));
      }
      token = resp.access_token;
      expiresAt = Date.now() + resp.expires_in * 1000;
      onChange();
      resolve();
    };
    tokenClient.error_callback = (err) => reject(new Error(err?.message || "Google sign-in was closed."));
    tokenClient.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

export function disconnectGoogle() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = null;
  expiresAt = 0;
  onChange();
}

async function api(url, options = {}) {
  if (!isConnected()) {
    throw new Error("Google isn't connected (or the session expired). Ask the user to click Connect Google in Settings.");
  }
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (res.status === 401) {
    token = null;
    onChange();
    throw new Error("The Google session expired. Ask the user to click Connect Google in Settings.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Google request failed (HTTP ${res.status})`);
  }
  return options.raw ? res.text() : res.json();
}

function clip(text) {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + `\n\n[cut off: ${text.length - MAX_CHARS} more characters]` : text;
}

// ---------- base64url helpers ----------
function decodeB64url(data) {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function encodeB64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}

// ---------- Gmail ----------
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function header(msg, name) {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function bodyText(payload) {
  let plain = "", html = "";
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = decodeB64url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = decodeB64url(p.body.data);
    (p.parts || []).forEach(walk);
  })(payload);
  if (plain) return plain;
  if (html) return new DOMParser().parseFromString(html, "text/html").body.innerText || "";
  return "";
}

export async function gmailSearch({ query, max_results = 10 }) {
  const n = Math.min(Math.max(1, Number(max_results) || 10), 25);
  const list = await api(`${GMAIL}/messages?maxResults=${n}&q=${encodeURIComponent(query)}`);
  const ids = (list.messages || []).map((m) => m.id);
  const msgs = await Promise.all(ids.map((id) =>
    api(`${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)));
  return JSON.stringify(msgs.map((m) => ({
    id: m.id,
    from: header(m, "From"),
    to: header(m, "To"),
    subject: header(m, "Subject"),
    date: header(m, "Date"),
    unread: (m.labelIds || []).includes("UNREAD"),
    snippet: m.snippet,
  })));
}

export async function gmailRead({ id }) {
  const m = await api(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`);
  return clip([
    `From: ${header(m, "From")}`,
    `To: ${header(m, "To")}`,
    header(m, "Cc") && `Cc: ${header(m, "Cc")}`,
    `Date: ${header(m, "Date")}`,
    `Subject: ${header(m, "Subject")}`,
    "",
    bodyText(m.payload) || m.snippet || "(no text content)",
  ].filter((l) => l !== "").join("\n"));
}

export async function gmailCreateDraft({ to, subject, body, reply_to_id }) {
  const headers = [`To: ${to}`, `Subject: ${encodeHeader(subject)}`];
  let threadId;
  if (reply_to_id) {
    const orig = await api(`${GMAIL}/messages/${encodeURIComponent(reply_to_id)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`);
    threadId = orig.threadId;
    const mid = header(orig, "Message-ID");
    if (mid) {
      headers.push(`In-Reply-To: ${mid}`);
      headers.push(`References: ${[header(orig, "References"), mid].filter(Boolean).join(" ")}`);
    }
  }
  headers.push("Content-Type: text/plain; charset=UTF-8", "MIME-Version: 1.0");
  const raw = encodeB64url(headers.join("\r\n") + "\r\n\r\n" + body);
  const draft = await api(`${GMAIL}/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw, ...(threadId && { threadId }) } }),
  });
  return `Draft saved in Gmail (draft id ${draft.id}). The user can review and send it from their Drafts folder.`;
}

// ---------- Drive ----------
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const EXPORTS = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export async function driveSearch({ query, max_results = 10 }) {
  const n = Math.min(Math.max(1, Number(max_results) || 10), 25);
  const s = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `(name contains '${s}' or fullText contains '${s}') and trashed = false`;
  const fields = "files(id,name,mimeType,modifiedTime,owners(displayName))";
  const r = await api(`${DRIVE}?pageSize=${n}&orderBy=modifiedTime desc&fields=${encodeURIComponent(fields)}&q=${encodeURIComponent(q)}`);
  return JSON.stringify((r.files || []).map((f) => ({
    id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime, owner: f.owners?.[0]?.displayName,
  })));
}

export async function driveRead({ id }) {
  const fid = encodeURIComponent(id);
  const meta = await api(`${DRIVE}/${fid}?fields=name,mimeType`);
  let text;
  if (EXPORTS[meta.mimeType]) {
    text = await api(`${DRIVE}/${fid}/export?mimeType=${encodeURIComponent(EXPORTS[meta.mimeType])}`, { raw: true });
  } else if (/^text\/|json|xml|csv|markdown/.test(meta.mimeType)) {
    text = await api(`${DRIVE}/${fid}?alt=media`, { raw: true });
  } else {
    throw new Error(`Can't read "${meta.name}" (${meta.mimeType}). Only Google Docs, Sheets, Slides and text files are supported.`);
  }
  return clip(`File: ${meta.name}\n\n${text}`);
}
