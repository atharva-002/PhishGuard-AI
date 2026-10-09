// PhishGuard content script: finds message bodies on supported web mail /
// messaging sites, asks the background script to scan them, and adds a badge.
// Site markup changes often; selectors live in one table so they are easy to update.
(() => {
  const ext = globalThis.chrome ?? globalThis.browser; // Firefox also provides chrome.* (callbacks + promises)
  const SITES = [
    { host: /mail\.google\.com$/, name: "Gmail", selector: "div.a3s.aiL, div.a3s" },
    { host: /outlook\.(live|office|office365)\.com$/, name: "Outlook", selector: 'div[aria-label="Message body"], div[role="document"]' },
    { host: /messages\.google\.com$/, name: "Messages", selector: "mws-text-message-part, .text-msg-content" },
    { host: /web\.whatsapp\.com$/, name: "WhatsApp", selector: "div.copyable-text span.selectable-text" },
  ];
  const site = SITES.find((s) => s.host.test(location.hostname));
  if (!site) return;

  const seen = new WeakSet();
  let settings = { autoScan: true, showSafe: false };
  const pretty = (k) => ({ __url__: "link", __phone__: "phone number", __email__: "e-mail address" })[k] || k;
  const COLORS = { Critical: "#ff2a2a", High: "#ff2a2a", Medium: "#ffb000", Low: "#00c853", Safe: "#00c853" };

  function badge(result, text) {
    const el = document.createElement("div");
    el.className = "pg-badge";
    const bad = result.label === "phishing";
    const color = COLORS[result.threat_level] || "#00c853";
    el.style.setProperty("--pg-color", color);
    const known = result.known_threats?.length ? " · reported scam" : "";
    el.innerHTML = "";
    const head = document.createElement("button");
    head.type = "button";
    head.className = "pg-head";
    head.textContent = bad
      ? `⚠ PhishGuard: likely phishing (${result.confidence}%)${known}`
      : `✓ PhishGuard: looks genuine`;
    const details = document.createElement("div");
    details.className = "pg-details";
    details.hidden = true;
    const lines = [
      result.recommendation || (bad ? "Do not click links or share OTPs, PINs or passwords." : "No strong phishing signs."),
      result.suspicious_keywords?.length ? `Signals: ${result.suspicious_keywords.slice(0, 8).map(pretty).join(", ")}` : "",
      `Checked by: ${result.source === "server" ? "PhishGuard server" : "offline on-device model"}`,
    ].filter(Boolean);
    for (const l of lines) {
      const p = document.createElement("div");
      p.textContent = l;
      details.appendChild(p);
    }
    if (bad) {
      const rep = document.createElement("button");
      rep.type = "button";
      rep.className = "pg-report";
      rep.textContent = "Report to Threat Hub";
      rep.onclick = (e) => {
        e.stopPropagation();
        rep.disabled = true;
        ext.runtime.sendMessage({ type: "report", text }, (r) => {
          rep.textContent = r && !r.error ? "Reported. Thank you!" : "Could not report (server offline?)";
        });
      };
      details.appendChild(rep);
    }
    head.onclick = (e) => { e.stopPropagation(); details.hidden = !details.hidden; };
    el.append(head, details);
    return el;
  }

  function scanElement(node) {
    if (seen.has(node)) return;
    seen.add(node);
    const text = (node.innerText || "").trim();
    if (text.length < 15) return;
    ext.runtime.sendMessage({ type: "scan", text }, (result) => {
      if (!result || result.error) return;
      if (result.label !== "phishing" && !settings.showSafe) return;
      if (node.previousElementSibling?.classList?.contains("pg-badge")) return;
      node.parentNode?.insertBefore(badge(result, text), node);
    });
  }

  let timer = null;
  function sweep() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!settings.autoScan) return;
      document.querySelectorAll(site.selector).forEach(scanElement);
    }, 400);
  }

  ext.runtime.sendMessage({ type: "settings" }, (s) => {
    if (s) settings = s;
    sweep();
    new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true });
  });
})();
