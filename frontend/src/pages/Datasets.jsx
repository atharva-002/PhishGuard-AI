import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, FileSpreadsheet, Globe } from "lucide-react";
import { api } from "../lib/api";

export default function Datasets() {
  const [data, setData] = useState([]);
  useEffect(() => { api.datasets().then((d) => setData(d.datasets || [])).catch(() => {}); }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {data.map((ds, i) => {
          const ratio = ds.rows ? (ds.spam / ds.rows) * 100 : 0;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass rounded-2xl p-6 border border-white/5 card-hover relative overflow-hidden"
              data-testid={`dataset-card-${i}`}
            >
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-15 blur-3xl" style={{ background: i % 2 ? "#9D4CDD" : "#00E5FF" }} />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.20), rgba(157,76,221,0.20))" }}>
                    <Database size={20} className="text-[#00E5FF]" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[#A1A1AA]">{ds.source}</span>
                </div>
                <div className="font-heading text-xl font-semibold text-white mt-4">{ds.name}</div>
                <div className="text-sm text-[#A1A1AA] mt-1">{ds.description}</div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-black/40 border border-white/5 p-3">
                    <div className="text-xs font-mono text-[#71717A]">Rows</div>
                    <div className="text-lg font-heading font-semibold text-white">{ds.rows.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg bg-black/40 border border-white/5 p-3">
                    <div className="text-xs font-mono text-[#71717A]">Spam</div>
                    <div className="text-lg font-heading font-semibold text-[#FF2A2A]">{ds.spam.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg bg-black/40 border border-white/5 p-3">
                    <div className="text-xs font-mono text-[#71717A]">Ham</div>
                    <div className="text-lg font-heading font-semibold text-[#00FF66]">{ds.ham.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-mono text-[#71717A] mb-1.5">Spam / Ham ratio</div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
                    <div className="h-full" style={{ width: `${ratio}%`, background: "linear-gradient(90deg, #FF2A2A, #FFB000)" }} />
                    <div className="h-full" style={{ width: `${100 - ratio}%`, background: "linear-gradient(90deg, #00FF66, #00E5FF)" }} />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#71717A] mb-2 flex items-center gap-1.5">
                    <Globe size={12} /> Top languages
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(ds.languages || {}).slice(0, 8).map(([k, v]) => (
                      <span key={k} className="text-[10px] font-mono px-2 py-1 rounded-md bg-[rgba(0,229,255,0.06)] border border-[rgba(0,229,255,0.20)] text-[#00E5FF]">
                        {k}: {Number(v).toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
