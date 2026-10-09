// Calls to the PhishGuard FastAPI server (optional: the app works offline without it).
function base(server) {
  return (server || "").trim().replace(/\/+$/, "");
}

async function call(server, path, options = {}, timeoutMs = 8000) {
  const url = `${base(server)}/api${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: ctrl.signal,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.detail || `Server error ${r.status}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

export const serverApi = {
  health: (s) => call(s, "/health", {}, 4000),
  predict: (s, text) => call(s, "/predict", { method: "POST", body: JSON.stringify({ text, language: "auto" }) }),
  report: (s, body) => call(s, "/threats/report", { method: "POST", body: JSON.stringify({ source: "mobile", ...body }) }),
  lookup: (s, value) => call(s, `/threats/lookup?value=${encodeURIComponent(value)}`),
};
