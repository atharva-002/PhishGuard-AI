import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, AlertTriangle, Database } from "lucide-react";

export const colorMap = {
  Safe: { bg: "rgba(0,255,102,0.10)", ring: "#00FF66", text: "#00FF66", glow: "glow-green" },
  Low: { bg: "rgba(0,255,102,0.10)", ring: "#00FF66", text: "#00FF66", glow: "glow-green" },
  Medium: { bg: "rgba(255,176,0,0.12)", ring: "#FFB000", text: "#FFB000", glow: "" },
  High: { bg: "rgba(255,42,42,0.12)", ring: "#FF2A2A", text: "#FF2A2A", glow: "glow-red" },
  Critical: { bg: "rgba(255,42,42,0.18)", ring: "#FF2A2A", text: "#FF2A2A", glow: "glow-red" },
};

export function CircularMeter({ value, color }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg width="144" height="144" className="threat-ring" style={{ color }}>
        <circle cx="72" cy="72" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
        <circle
          cx="72" cy="72" r={r}
          stroke="currentColor"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-heading font-bold" style={{ color }}>{Math.round(value)}%</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#71717A] mt-1">Threat</div>
      </div>
    </div>
  );
}

export default function ResultCard({ result }) {
  if (!result) return null;
  const c = colorMap[result.threat_level] || colorMap.Safe;
  const isPhish = result.label === "phishing";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`glass-strong rounded-2xl p-6 lg:p-8 border ${isPhish ? "border-[rgba(255,42,42,0.30)]" : "border-[rgba(0,255,102,0.25)]"} ${c.glow}`}
      data-testid="result-card"
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
        <CircularMeter value={result.confidence} color={c.ring} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {isPhish ? <ShieldAlert size={20} className="text-[#FF2A2A]" /> : <ShieldCheck size={20} className="text-[#00FF66]" />}
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">VERDICT</span>
          </div>
          <div className="font-heading text-3xl lg:text-4xl font-bold tracking-tight" data-testid="result-verdict">
            {isPhish ? <span className="text-[#FF2A2A]">PHISHING DETECTED</span> : <span className="text-[#00FF66]">LIKELY GENUINE</span>}
          </div>
          <div className="text-sm text-[#A1A1AA] mt-2 max-w-xl" data-testid="result-recommendation">{result.recommendation}</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 rounded-full text-xs font-mono border border-white/10 bg-white/[0.03] text-[#A1A1AA]">
              MODEL: <span className="text-[#00E5FF]">{result.model_name || result.model_used}</span>
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-mono border border-white/10 bg-white/[0.03] text-[#A1A1AA]">
              LEVEL: <span style={{ color: c.text }}>{result.threat_level}</span>
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-mono border border-white/10 bg-white/[0.03] text-[#A1A1AA]">
              GENUINE: <span className="text-[#00FF66]">{result.genuine_score}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Threat Intel Hub matches */}
      {result.known_threats?.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/5" data-testid="known-threats">
          <div className="flex items-center gap-2 mb-3">
            <Database size={14} className="text-[#FF2A2A]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Already in the Threat Hub</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.known_threats.map((t) => (
              <span key={t.id} className="px-2.5 py-1 rounded-md text-xs font-mono bg-[rgba(255,42,42,0.10)] text-[#FF6B6B] border border-[rgba(255,42,42,0.30)]">
                {t.type}: {t.value} · {t.reports} report{t.reports === 1 ? "" : "s"} · {t.status}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suspicious keywords */}
      {result.suspicious_keywords?.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/5" data-testid="suspicious-keywords">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-[#FFB000]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Suspicious signals</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.suspicious_keywords.map((kw, i) => (
              <span key={i} className="px-2.5 py-1 rounded-md text-xs font-mono bg-[rgba(255,176,0,0.10)] text-[#FFB000] border border-[rgba(255,176,0,0.25)]">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
