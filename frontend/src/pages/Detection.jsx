import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Sparkles, Languages } from "lucide-react";
import { api } from "../lib/api";
import ResultCard from "../components/ResultCard";
import LiveFeed from "../components/LiveFeed";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi (हिन्दी)" },
  { code: "mr", name: "Marathi (मराठी)" },
  { code: "ta", name: "Tamil (தமிழ்)" },
  { code: "bn", name: "Bengali (বাংলা)" },
  { code: "te", name: "Telugu (తెలుగు)" },
  { code: "gu", name: "Gujarati (ગુજરાતી)" },
];

const MODELS = [
  { id: "", name: "Best (auto)" },
  { id: "logistic_regression", name: "Logistic Regression" },
  { id: "naive_bayes", name: "Naive Bayes" },
  { id: "svm", name: "SVM (Linear)" },
];

const SAMPLES = [
  "Congratulations! You've won a $1000 Walmart gift card. Click http://bit.ly/claim to claim now. Reply STOP to opt out.",
  "URGENT: Your bank account will be suspended. Verify your KYC immediately at https://hdfc-verify.in/login",
  "Hi mom, can you pick me up from the station around 6pm? Train just arrived.",
  "आपका SBI खाता निलंबित कर दिया गया है। तुरंत KYC अपडेट करें: http://sbi-kyc.in",
];

export default function DetectionPage() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("auto");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, []);

  const onAnalyze = async () => {
    if (!text.trim()) {
      toast.error("Enter a message to analyze");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await api.predict(text, lang, model || null);
      setResult(r);
      if (r.label === "phishing") toast.error(`Phishing detected — ${r.confidence}% confidence`);
      else toast.success(`Message appears genuine — ${r.genuine_score}% confidence`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-2xl p-6 lg:p-8 border border-white/5 relative overflow-hidden" data-testid="detection-panel">
          {loading && <div className="scanline absolute inset-0 z-10" />}
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-[#00E5FF]" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">AI Threat Analyzer</span>
          </div>
          <h2 className="font-heading text-2xl lg:text-3xl font-semibold text-white mb-1">Paste a suspicious message</h2>
          <p className="text-sm text-[#71717A] mb-5">Supports English, Hindi, Marathi, Tamil, Bengali, Telugu, and Gujarati.</p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste SMS / email content here…"
            rows={6}
            data-testid="detection-textarea"
            className="w-full resize-y rounded-xl bg-black/40 border border-white/10 focus:border-[#00E5FF] focus:ring-2 focus:ring-[rgba(0,229,255,0.20)] focus:outline-none text-white placeholder:text-[#71717A] p-4 font-mono text-sm transition-all"
          />

          <div className="flex flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/10">
              <Languages size={14} className="text-[#9D4CDD]" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                data-testid="language-select"
                className="bg-transparent text-sm text-white focus:outline-none font-mono"
              >
                {LANGUAGES.map((l) => <option key={l.code} value={l.code} className="bg-[#0A0F1C]">{l.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/10">
              <span className="text-xs font-mono text-[#71717A]">MODEL</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                data-testid="model-select"
                className="bg-transparent text-sm text-white focus:outline-none font-mono"
              >
                {[...MODELS, ...(health?.transformer_ready ? [{ id: "transformer", name: "Transformer (XLM-R)" }] : [])].map((m) => <option key={m.id} value={m.id} className="bg-[#0A0F1C]">{m.name}</option>)}
              </select>
            </div>
            <button
              onClick={onAnalyze}
              disabled={loading || !health?.model_ready}
              data-testid="analyze-button"
              className="btn-neon flex items-center gap-2 ml-auto"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" />Scanning…</> : <><Send size={16} />Analyze Message</>}
            </button>
          </div>

          <div className="mt-5 pt-5 border-t border-white/5">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#71717A] mb-2">Quick samples</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setText(s)}
                  data-testid={`sample-btn-${i}`}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-[#00E5FF] hover:text-[#00E5FF] text-[#A1A1AA] transition-colors font-mono"
                >
                  Sample {i + 1}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {result && <ResultCard result={result} />}
        {!result && !loading && (
          <div className="glass rounded-2xl p-8 border border-white/5 text-center" data-testid="result-empty">
            <div className="text-[#71717A] font-mono text-sm">Awaiting analysis — results will appear here.</div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <LiveFeed />
      </div>
    </div>
  );
}
