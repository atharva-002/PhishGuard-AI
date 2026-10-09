import { useEffect, useState } from "react";
import { Activity, Wifi } from "lucide-react";
import { api } from "../lib/api";

export default function Topbar({ title }) {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let mounted = true;
    api.health().then((h) => mounted && setHealth(h)).catch(() => {});
    const t = setInterval(() => api.health().then((h) => mounted && setHealth(h)).catch(() => {}), 30000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-white/5 px-6 py-4 flex items-center justify-between" data-testid="dashboard-topbar">
      <div>
        <h1 className="font-heading text-xl sm:text-2xl font-semibold text-white tracking-tight" data-testid="topbar-title">{title}</h1>
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#71717A] mt-0.5">PhishGuard Control Room</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-white/10" data-testid="topbar-model-status">
          <span className={`h-2 w-2 rounded-full ${health?.model_ready ? "bg-[#00FF66] glow-green" : "bg-[#FFB000]"}`} />
          <span className="text-xs font-mono text-[#A1A1AA]">
            {health?.model_ready ? `${health.models_loaded?.length || 0} MODELS LIVE` : "MODELS WARMING"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-white/10">
          <Wifi size={14} className="text-[#00E5FF]" />
          <span className="text-xs font-mono text-[#A1A1AA]">REAL-TIME</span>
        </div>
      </div>
    </header>
  );
}
