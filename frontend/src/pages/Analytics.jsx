import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Cpu, BarChart3, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts";

const MODEL_LABELS = {
  logistic_regression: "Logistic Regression",
  naive_bayes: "Naive Bayes",
  svm: "SVM (Linear)",
};

const MODEL_COLORS = {
  logistic_regression: "#00E5FF",
  naive_bayes: "#9D4CDD",
  svm: "#00FF66",
};

function ConfusionMatrix({ matrix, labels, color }) {
  if (!matrix) return null;
  const max = Math.max(...matrix.flat());
  return (
    <div className="grid grid-cols-3 gap-1 text-center font-mono text-xs">
      <div></div>
      {labels.map((l) => <div key={l} className="text-[#71717A] uppercase tracking-wider py-1">{l}</div>)}
      {matrix.map((row, i) => (
        <React.Fragment key={`row-${i}`}>
          <div className="text-[#71717A] uppercase tracking-wider py-1 self-center">{labels[i]}</div>
          {row.map((v, j) => {
            const intensity = max ? v / max : 0;
            const isDiag = i === j;
            const bg = isDiag
              ? `rgba(0, 229, 255, ${0.10 + intensity * 0.50})`
              : `rgba(255, 42, 42, ${0.08 + intensity * 0.45})`;
            return (
              <div key={`${i}-${j}`} className="aspect-square flex flex-col items-center justify-center rounded-md border border-white/5" style={{ background: bg }}>
                <div className="text-white text-base font-semibold">{v.toLocaleString()}</div>
                <div className="text-[#71717A] text-[10px]">{((intensity || 0) * 100).toFixed(0)}%</div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    api.metrics().then((d) => setMetrics(d.metrics)).catch(() => {});
  }, []);

  if (!metrics) {
    return <div className="p-8 text-[#71717A] font-mono">Loading model metrics…</div>;
  }

  const models = ["logistic_regression", "naive_bayes", "svm"];
  const compareData = models.map((k) => ({
    name: MODEL_LABELS[k].split(" ")[0],
    accuracy: +(metrics[k]?.accuracy * 100).toFixed(2),
    precision: +(metrics[k]?.precision * 100).toFixed(2),
    recall: +(metrics[k]?.recall * 100).toFixed(2),
    f1: +(metrics[k]?.f1 * 100).toFixed(2),
    color: MODEL_COLORS[k],
  }));

  const features = metrics.feature_importance || [];
  const featureData = features.slice(0, 15).map((f) => ({ name: f.feature, weight: +f.weight.toFixed(3) }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Algorithm Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {models.map((k, idx) => {
          const m = metrics[k];
          const isBest = metrics.best_model === k;
          return (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={`glass rounded-2xl p-6 border ${isBest ? "border-[rgba(0,229,255,0.40)] glow-cyan" : "border-white/5"}`}
              data-testid={`model-card-${k}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#71717A]">Algorithm</div>
                  <div className="font-heading text-xl font-semibold text-white mt-1">{MODEL_LABELS[k]}</div>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: `${MODEL_COLORS[k]}22` }}>
                  <Cpu size={20} style={{ color: MODEL_COLORS[k] }} />
                </div>
              </div>
              {isBest && (
                <div className="mt-2 inline-block text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-1 rounded-full bg-[rgba(0,229,255,0.10)] text-[#00E5FF] border border-[rgba(0,229,255,0.30)]">
                  ★ Best Model
                </div>
              )}
              <div className="mt-4 space-y-2.5">
                {[
                  { label: "Accuracy", v: m?.accuracy },
                  { label: "Precision", v: m?.precision },
                  { label: "Recall", v: m?.recall },
                  { label: "F1 Score", v: m?.f1 },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-[#A1A1AA]">{s.label}</span>
                      <span className="text-white">{(s.v * 100).toFixed(2)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(s.v || 0) * 100}%` }}
                        transition={{ duration: 1, delay: 0.2 + idx * 0.05 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${MODEL_COLORS[k]}, ${MODEL_COLORS[k]}80)`, boxShadow: `0 0 8px ${MODEL_COLORS[k]}` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Comparison Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-6 border border-white/5" data-testid="comparison-chart">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-[#00E5FF]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Algorithm Comparison</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={compareData}>
              <XAxis dataKey="name" tick={{ fill: "#A1A1AA", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0A0F1C", border: "1px solid rgba(0,229,255,0.30)", borderRadius: 8 }} />
              <Bar dataKey="f1" radius={[8, 8, 0, 0]}>
                {compareData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/5" data-testid="feature-importance">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-[#9D4CDD]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Top Phishing Features (LR weights)</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
            {featureData.map((f, i) => {
              const max = Math.max(...featureData.map((x) => x.weight));
              const w = max > 0 ? (f.weight / max) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-white truncate max-w-[60%]">{f.name}</span>
                    <span className="text-[#71717A]">{f.weight.toFixed(3)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: "linear-gradient(90deg, #9D4CDD, #00E5FF)", boxShadow: "0 0 6px #9D4CDD" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confusion Matrices */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {models.map((k) => (
          <div key={k} className="glass rounded-2xl p-6 border border-white/5" data-testid={`confusion-${k}`}>
            <div className="flex items-center gap-2 mb-4">
              <Brain size={14} style={{ color: MODEL_COLORS[k] }} />
              <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">{MODEL_LABELS[k]} – Confusion Matrix</span>
            </div>
            <ConfusionMatrix matrix={metrics[k]?.confusion_matrix} labels={metrics[k]?.labels || ["ham", "spam"]} color={MODEL_COLORS[k]} />
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs font-mono">
              <div className="px-2 py-1 rounded bg-[rgba(0,229,255,0.08)] text-[#00E5FF]">TP/TN (diag)</div>
              <div className="px-2 py-1 rounded bg-[rgba(255,42,42,0.08)] text-[#FF2A2A]">FP/FN (off-diag)</div>
            </div>
          </div>
        ))}
      </div>

      {/* TF-IDF Explanation */}
      <div className="glass rounded-2xl p-6 lg:p-8 border border-white/5" data-testid="tfidf-panel">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00E5FF] mb-2">TF-IDF + N-Gram</div>
            <h3 className="font-heading text-2xl font-semibold text-white">How we transform messages into ML-ready vectors</h3>
            <p className="text-sm text-[#A1A1AA] mt-3 leading-relaxed">
              Each message is converted into a 50,000-dimensional sparse vector. <span className="text-[#00E5FF]">Term Frequency</span> captures how often a token appears in the message, while
              <span className="text-[#9D4CDD]"> Inverse Document Frequency</span> down-weights tokens that appear everywhere. We use unigrams + bigrams with sublinear TF scaling for better recall on short SMS-style messages.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { l: "Vocab Size", v: "50K" },
                { l: "N-Gram", v: "1 – 2" },
                { l: "Min DF", v: "2" },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-black/40 border border-white/5 p-3 text-center">
                  <div className="text-xs font-mono text-[#71717A]">{x.l}</div>
                  <div className="text-lg font-heading font-semibold text-white">{x.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="font-mono text-xs space-y-2 text-[#A1A1AA]">
            <div className="text-[#71717A] uppercase tracking-[0.2em] mb-3">Pipeline output (sample)</div>
            {[
              "input    >  \"URGENT verify your KYC at hdfc-verify.in\"",
              "clean    >  urgent verify your kyc at __url__",
              "tokens   >  [urgent, verify, your, kyc, at, __url__]",
              "ngrams   >  +bigrams: (urgent verify), (verify your)…",
              "tfidf    >  sparse vector ∈ ℝ^50000",
              "logits   >  spam: 5.21, ham: -3.84",
              "verdict  >  PHISHING (98.7%)",
            ].map((l, i) => (
              <div key={i} className="text-[#A1A1AA]">
                <span className="text-[#00E5FF]">$</span> {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
