const ext = globalThis.chrome ?? globalThis.browser;
const $ = (id) => document.getElementById(id);
const DEFAULTS = { server: "http://localhost:8000", dashboard: "http://localhost:3000", autoScan: true, showSafe: false, mode: "server" };

ext.storage.sync.get(DEFAULTS).then((s) => {
  $("server").value = s.server;
  $("dashboard").value = s.dashboard;
  $("autoScan").checked = s.autoScan;
  $("showSafe").checked = s.showSafe;
  $("offline").checked = s.mode === "offline";
});

$("save").onclick = async () => {
  const server = $("server").value.trim().replace(/\/+$/, "") || DEFAULTS.server;
  // Servers other than localhost need host permission (asked once).
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)) {
    try {
      const origin = new URL(server).origin + "/*";
      const ok = await ext.permissions.request({ origins: [origin] });
      if (!ok) { $("msg").style.color = "#ffb000"; $("msg").textContent = "Permission needed to reach that server."; return; }
    } catch { $("msg").style.color = "#ff2a2a"; $("msg").textContent = "That URL doesn't look right."; return; }
  }
  await ext.storage.sync.set({
    server,
    dashboard: $("dashboard").value.trim().replace(/\/+$/, "") || DEFAULTS.dashboard,
    autoScan: $("autoScan").checked,
    showSafe: $("showSafe").checked,
    mode: $("offline").checked ? "offline" : "server",
  });
  $("msg").style.color = "#00ff66";
  $("msg").textContent = "Saved";
};
