import { useEffect, useState } from "react";
import { ScanLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";

export default function LiveFeed() {
  const [feed, setFeed] = useState([]);
  useEffect(() => {
    let mounted = true;
    const load = () => api.feed().then((d) => mounted && setFeed(d.feed || [])).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  return (
    <div className="glass rounded-2xl border border-white/5 overflow-hidden h-full flex flex-col" data-testid="live-feed">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine size={16} className="text-[#00E5FF]" />
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Live scan feed</span>
        </div>
        <span className="h-2 w-2 rounded-full bg-[#00FF66] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs min-h-[300px] max-h-[480px]">
        {feed.length === 0 && <div className="text-[#71717A] text-center py-12">Awaiting scans…</div>}
        {feed.map((s) => {
          const isPhish = s.label === "phishing";
          const color = isPhish ? "#FF2A2A" : "#00FF66";
          return (
            <div key={s.id} className="fade-in-up flex items-start gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/5">
              <span style={{ color }} className="mt-0.5">
                {isPhish ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[#71717A]">{new Date(s.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color }} className="uppercase tracking-wider">[{s.threat_level}]</span>
                  <span className="text-[#71717A]">{s.confidence}%</span>
                </div>
                <div className="text-[#A1A1AA] truncate">{s.text_preview}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
