import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, AlertTriangle, Database } from "lucide-react";
import { CircularMeter, colorMap } from "./ResultCard";

const SEV = {
  high: { c: "#FF2A2A", bg: "rgba(255,42,42,0.10)", b: "rgba(255,42,42,0.30)" },
  medium: { c: "#FFB000", bg: "rgba(255,176,0,0.10)", b: "rgba(255,176,0,0.30)" },
  low: { c: "#00E5FF", bg: "rgba(0,229,255,0.08)", b: "rgba(0,229,255,0.25)" },
};

export function Chip({ children, tone = "low" }) {
  const s = SEV[tone] || SEV.low;
  return (
    <span className="px-2.5 py-1 rounded-md text-xs font-mono border" style={{ color: s.c, background: s.bg, borderColor: s.b }}>
      {children}
    </span>
  );
}

/**
 * Verdict card shared by the e-mail and voice scanners.
 * signals: [{ id, label|detail, severity?, matches? }]
 */
export default function ScanVerdict({ result, title = "Signals found", signals = [], meta = [], children, testId = "scan-verdict" }) {
  if (!result) return null;
  const c = colorMap[result.threat_level] || colorMap.Safe;
  const isPhish = result.label === "phishing";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-strong rounded-2xl p-6 lg:p-8 border ${isPhish ? "border-[rgba(255,42,42,0.30)]" : "border-[rgba(0,255,102,0.25)]"} ${c.glow}`}
      data-testid={testId}
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
        <CircularMeter value={result.confidence} color={c.ring} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {isPhish ? <ShieldAlert size={20} className="text-[#FF2A2A]" /> : <ShieldCheck size={20} className="text-[#00FF66]" />}
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">VERDICT</span>
          </div>
          <div className="font-heading text-3xl font-bold tracking-tight">
            {isPhish ? <span className="text-[#FF2A2A]">LIKELY SCAM</span> : <span className="text-[#00FF66]">LIKELY GENUINE</span>}
          </div>
          <div className="text-sm text-[#A1A1AA] mt-2 max-w-xl">{result.recommendation}</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 rounded-full text-xs font-mono border border-white/10 bg-white/[0.03] text-[#A1A1AA]">
              LEVEL: <span style={{ color: c.text }}>{result.threat_level}</span>
            </span>
            {result.model_score != null && (
              <span className="px-3 py-1 rounded-full text-xs font-mono border border-white/10 bg-white/[0.03] text-[#A1A1AA]">
                TEXT MODEL: <span className="text-[#00E5FF]">{result.model_score}%</span>
              </span>
            )}
            {meta.map((m) => (
              <span key={m.k} className="px-3 py-1 rounded-full text-xs font-mono border border-white/10 bg-white/[0.03] text-[#A1A1AA]">
                {m.k}: <span className="text-white">{m.v}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-[#FFB000]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">{title}</span>
          </div>
          <ul className="space-y-2">
            {signals.map((s, i) => {
              const tone = SEV[s.severity] || (s.weight >= 0.45 ? SEV.high : s.weight >= 0.25 ? SEV.medium : SEV.low);
              return (
                <li key={`${s.id}-${i}`} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: tone.c, boxShadow: `0 0 8px ${tone.c}` }} />
                  <div className="min-w-0">
                    <div className="text-white">{s.label || s.detail}</div>
                    {s.label && s.detail && <div className="text-[#A1A1AA] text-xs mt-0.5">{s.detail}</div>}
                    {s.matches?.length > 0 && (
                      <div className="text-xs font-mono text-[#71717A] mt-0.5 break-words">heard: {s.matches.join(", ")}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result.known_threats?.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Database size={14} className="text-[#FF2A2A]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Already in the Threat Hub</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.known_threats.map((t) => (
              <Chip key={t.id} tone="high">{t.type}: {t.value} · {t.status}</Chip>
            ))}
          </div>
        </div>
      )}
      {children}
    </motion.div>
  );
}
