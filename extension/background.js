// PhishGuard background: talks to the PhishGuard API, falls back to the
// on-device model when the server is unreachable, and handles the
// right-click menu.
/* global importScripts */
if (typeof importScripts === "function" && !globalThis.PhishGuardModel) {
  importScripts("lib/model.js"); // Chrome service worker; Firefox loads it via manifest "scripts"
}

const ext = globalThis.chrome ?? globalThis.browser; // Firefox also provides chrome.* (callbacks + promises)
const DEFAULTS = { server: "http://localhost:8000", dashboard: "http://localhost:3000", autoScan: true, showSafe: false, mode: "server" };
const cache = new Map(); // text hash -> result
let localModel = null;

async function settings() {
  const s = await ext.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s, server: (s.server || DEFAULTS.server).replace(/\/+$/, "") };
}

async function getLocalModel() {
  if (!localModel) {
    const res = await fetch(ext.runtime.getURL("models/on_device.json"));
    localModel = globalThis.PhishGuardModel.createModel(await res.json());
  }
  return localModel;
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h);
}

async function scan(text) {
  text = (text || "").trim().slice(0, 8000);
  if (text.length < 8) return null;
  const key = hash(text);
  if (cache.has(key)) return cache.get(key);
  const cfg = await settings();
  let result = null;
  if (cfg.mode !== "offline") {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`${cfg.server}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: "auto" }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.ok) result = { ...(await r.json()), source: "server" };
    } catch (_) { /* fall back below */ }
  }
  if (!result) result = { ...(await getLocalModel()).predict(text), source: "on-device" };
  cache.set(key, result);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return result;
}

async function api(path, opts = {}) {
  const cfg = await settings();
  const r = await fetch(`${cfg.server}/api${path}`, {
    headers: { "Content-Type": "application/json" }, ...opts,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || `HTTP ${r.status}`);
  return body;
}

function notify(title, message) {
  ext.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message: message.slice(0, 250) });
}

function describe(r) {
  if (!r) return "Text too short to scan.";
  const verdict = r.label === "phishing" ? `⚠ Likely PHISHING (${r.confidence}%)` : `✓ Looks genuine (${r.genuine_score ?? Math.round(100 - r.confidence)}% sure)`;
  const why = r.suspicious_keywords?.length ? `\nSignals: ${r.suspicious_keywords.slice(0, 6).join(", ")}` : "";
  const known = r.known_threats?.length ? "\nAlready reported in the Threat Hub!" : "";
  return `${verdict}${known}${why}\n(${r.source === "server" ? "server models" : "offline on-device model"})`;
}

ext.runtime.onInstalled.addListener(() => {
  ext.contextMenus.removeAll(() => {
    ext.contextMenus.create({ id: "pg-scan", title: "Scan selected text with PhishGuard", contexts: ["selection"] });
    ext.contextMenus.create({ id: "pg-lookup", title: "Check this link in the PhishGuard Threat Hub", contexts: ["link"] });
    ext.contextMenus.create({ id: "pg-report", title: "Report this link as a scam", contexts: ["link"] });
  });
});

ext.contextMenus.onClicked.addListener(async (info) => {
  try {
    if (info.menuItemId === "pg-scan") {
      const r = await scan(info.selectionText);
      await ext.storage.local.set({ lastResult: { ...r, text: info.selectionText, at: Date.now() } });
      notify("PhishGuard scan", describe(r));
    } else if (info.menuItemId === "pg-lookup") {
      const r = await api(`/threats/lookup?value=${encodeURIComponent(info.linkUrl)}`);
      notify("PhishGuard Threat Hub", r.found
        ? `⚠ Reported ${r.matches.reduce((s, m) => s + (m.reports || 0), 0)} time(s) as a scam (${r.matches[0].status}).`
        : "Not in the database yet. That doesn't make it safe.");
    } else if (info.menuItemId === "pg-report") {
      await api("/threats/report", { method: "POST", body: JSON.stringify({ value: info.linkUrl, category: "other", source: "extension" }) });
      notify("PhishGuard Threat Hub", "Thanks! The link was reported.");
    }
  } catch (e) {
    notify("PhishGuard", `Could not reach the server: ${e.message}. Check the server URL in the extension options.`);
  }
});

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "scan") {
    scan(msg.text).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg?.type === "report") {
    api("/threats/report", { method: "POST", body: JSON.stringify({ message: msg.text, category: "other", source: "extension" }) })
      .then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg?.type === "health") {
    settings().then((cfg) => fetch(`${cfg.server}/api/health`).then((r) => r.json()))
      .then((h) => sendResponse({ ok: true, ...h }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "settings") {
    settings().then(sendResponse);
    return true;
  }
  return false;
});
