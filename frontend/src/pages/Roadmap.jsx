import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, Smartphone, Brain, Mic, Mail, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";

const ICONS = { globe: Globe, smartphone: Smartphone, brain: Brain, mic: Mic, mail: Mail, shield: ShieldCheck };
const STATUS_COLORS = { live: "#00FF66", "ready-to-train": "#FFB000", planned: "#00E5FF", research: "#9D4CDD" };

export default function Roadmap() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.roadmap().then((d) => setItems(d.items || [])).catch(() => {}); }, []);

  return (
    <div className="p-6 lg:p-8">
      <div className="relative pl-6 lg:pl-10">
        <div className="absolute left-2 lg:left-4 top-0 bottom-0 w-px bg-gradient-to-b from-[#00E5FF] via-[#9D4CDD] to-transparent" />
        <div className="space-y-6">
          {items.map((it, i) => {
            const Icon = ICONS[it.icon] || Globe;
            const color = STATUS_COLORS[it.status] || "#00E5FF";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="relative"
                data-testid={`roadmap-item-${i}`}
              >
                <div className="absolute -left-6 lg:-left-10 top-5 h-4 w-4 rounded-full node-pulse" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
                <div className="glass rounded-2xl p-6 border border-white/5 card-hover">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                        <Icon size={22} style={{ color }} />
                      </div>
                      <div>
                        <div className="font-heading text-xl font-semibold text-white">{it.title}</div>
                        <div className="text-sm text-[#A1A1AA] mt-1 max-w-2xl">{it.desc}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div className="inline-block text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border" style={{ borderColor: `${color}50`, color }}>
                        {it.status.replace(/-/g, " ")}
                      </div>
                      {it.route && <Link to={it.route} className="text-xs font-mono text-[#A1A1AA] hover:text-[#00E5FF]">Open →</Link>}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
