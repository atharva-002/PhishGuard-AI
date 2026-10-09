const ext = globalThis.chrome ?? globalThis.browser;
const $ = (id) => document.getElementById(id);
let lastText = "";

function send(msg) {
  return new Promise((resolve) => ext.runtime.sendMessage(msg, resolve));
}

function show(r, text) {
  const box = $("result");
  box.hidden = false;
  if (!r || r.error) {
    $("verdict").textContent = r?.error || "Message too short to scan";
    $("verdict").style.color = "#a1a1aa";
    ["meta", "signals", "advice"].forEach((id) => ($(id).textContent = ""));
    $("report").hidden = true;
    return;
  }
  const bad = r.label === "phishing";
  $("verdict").textContent = bad ? `⚠ Likely phishing · ${r.confidence}%` : `✓ Looks genuine · ${r.genuine_score ?? (100 - r.confidence).toFixed(1)}%`;
  $("verdict").style.color = bad ? "#ff2a2a" : "#00ff66";
  $("meta").textContent = `${r.threat_level} risk · ${r.source === "server" ? "server models" : "offline on-device model"}${r.known_threats?.length ? " · already reported in Threat Hub" : ""}`;
  $("signals").replaceChildren(...(r.suspicious_keywords || []).slice(0, 10).map((k) => {
    const s = document.createElement("span");
    s.textContent = ({ __url__: "link", __phone__: "phone number", __email__: "e-mail address" })[k] || k;
    return s;
  }));
  $("advice").textContent = r.recommendation || (bad ? "Don't click links or share OTPs, PINs or passwords." : "");
  $("report").hidden = !bad;
  $("report").disabled = false;
  $("report").textContent = "Report to Threat Hub";
  lastText = text;
}

$("scan").onclick = async () => {
  const text = $("text").value.trim();
  if (!text) return;
  $("scan").disabled = true;
  show(await send({ type: "scan", text }), text);
  $("scan").disabled = false;
};

$("selection").onclick = async () => {
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    const [res] = await ext.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection()) });
    if (res?.result) { $("text").value = res.result; $("scan").click(); }
  } catch {
    $("text").placeholder = "Couldn't read the selection on this page. Paste the text instead.";
  }
};

$("report").onclick = async () => {
  $("report").disabled = true;
  const r = await send({ type: "report", text: lastText });
  $("report").textContent = r && !r.error ? "Reported. Thank you!" : `Failed: ${r?.error || "server offline"}`;
};

$("options").onclick = (e) => { e.preventDefault(); ext.runtime.openOptionsPage(); };

(async () => {
  const cfg = await send({ type: "settings" });
  $("dashboard").onclick = (e) => { e.preventDefault(); ext.tabs.create({ url: (cfg?.dashboard || "http://localhost:3000") + "/dashboard" }); };
  const h = await send({ type: "health" });
  $("status").textContent = h?.ok ? "server online" : "offline mode";
  $("status").className = `status ${h?.ok ? "ok" : "off"}`;
  const { lastResult } = await ext.storage.local.get("lastResult");
  if (lastResult && Date.now() - lastResult.at < 60000) { $("text").value = lastResult.text; show(lastResult, lastResult.text); }
})();
