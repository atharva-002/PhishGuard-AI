import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ShieldCheck, Zap, Globe2, Brain, Activity, Lock, ArrowRight,
  Inbox, Filter, Grid3x3, Cpu, ShieldAlert, Sparkles, Languages,
  AlertTriangle, Database, Smartphone, Mic, Mail, Globe,
} from "lucide-react";
import Particles from "../components/Particles";
import Logo from "../components/Logo";
import { api } from "../lib/api";

const LANGUAGES = [
  { name: "English", native: "English", code: "EN", color: "#00E5FF" },
  { name: "Hindi", native: "हिन्दी", code: "HI", color: "#9D4CDD" },
  { name: "Marathi", native: "मराठी", code: "MR", color: "#00FF66" },
  { name: "Tamil", native: "தமிழ்", code: "TA", color: "#FFB000" },
  { name: "Bengali", native: "বাংলা", code: "BN", color: "#FF2A2A" },
  { name: "Telugu", native: "తెలుగు", code: "TE", color: "#00F0FF" },
  { name: "Gujarati", native: "ગુજરાતી", code: "GU", color: "#9D4CDD" },
];

const FEATURES = [
  { icon: Activity, title: "Real-Time Detection", desc: "Sub-second inference across all supported languages with explainable threat scores." },
  { icon: Globe2, title: "Regional Language Support", desc: "Multilingual NLP pipeline trained on Indic scripts and English smishing." },
  { icon: Brain, title: "NLP Text Analysis", desc: "Multilingual TF-IDF + n-gram tokenisation with Indic-aware text cleaning." },
  { icon: Zap, title: "ML Threat Scoring", desc: "Calibrated probability outputs from LogReg, Naive Bayes, and SVM." },
  { icon: ShieldAlert, title: "Smart Scam Classification", desc: "Distinguishes phishing, smishing, and benign content with confidence." },
  { icon: Lock, title: "Privacy First", desc: "On-prem deployable; your messages never leave your environment." },
];

const WORKFLOW = [
  { icon: Inbox, title: "Input Message", desc: "Raw text in any supported language" },
  { icon: Sparkles, title: "Text Cleaning", desc: "Normalise URLs, emails, phones" },
  { icon: Filter, title: "Tokenization", desc: "N-gram tokens across languages" },
  { icon: Filter, title: "Stopword Removal", desc: "Drop low-signal tokens" },
  { icon: Grid3x3, title: "TF-IDF Vectorization", desc: "50K-dim sparse vectors" },
  { icon: Cpu, title: "ML Classification", desc: "LR / NB / SVM ensemble" },
  { icon: ShieldCheck, title: "Threat Prediction", desc: "Label + confidence + signals" },
];

const ROADMAP_ICONS = { globe: Globe, smartphone: Smartphone, brain: Brain, mic: Mic, mail: Mail, shield: ShieldCheck };

function Counter({ target, suffix = "", duration = 1500, decimals = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(eased * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  const formatted = decimals > 0
    ? v.toFixed(decimals)
    : Math.floor(v).toLocaleString();
  return <span>{formatted}{suffix}</span>;
}

export default function Landing() {
  const [accuracy, setAccuracy] = useState(95);
  const [dsSize, setDsSize] = useState(138000);

  useEffect(() => {
    api.metrics().then((d) => {
      if (d.ready && d.metrics) {
        const best = d.metrics.best_model;
        const acc = d.metrics[best]?.accuracy;
        if (acc) setAccuracy(Math.round(acc * 1000) / 10);
        setDsSize(d.metrics.dataset?.total_rows || 138000);
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#05050A] relative overflow-hidden">
      {/* Top Nav */}
      <header className="relative z-30 px-6 lg:px-12 py-5 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm text-[#A1A1AA]">
          <a href="#features" className="hover:text-white transition" data-testid="nav-features">Features</a>
          <a href="#languages" className="hover:text-white transition" data-testid="nav-languages">Languages</a>
          <a href="#workflow" className="hover:text-white transition" data-testid="nav-workflow">ML Workflow</a>
          <a href="#roadmap" className="hover:text-white transition" data-testid="nav-roadmap">Features</a>
        </nav>
        <Link to="/dashboard" className="btn-ghost-neon text-sm" data-testid="nav-signin">Open Dashboard</Link>
      </header>

      {/* HERO */}
      <section className="relative px-6 lg:px-12 pt-12 lg:pt-20 pb-32">
        <div className="cyber-grid absolute inset-0" />
        <Particles count={40} />
        <div className="relative max-w-6xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-[rgba(0,229,255,0.25)] mb-6">
            <span className="h-2 w-2 rounded-full bg-[#00FF66] animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA]">Live ML — {accuracy}% Accuracy</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-heading text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tighter text-white leading-[1.05]"
          >
            AI-Powered <span className="text-gradient-cyber">Multilingual</span><br />
            Phishing Detection
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="text-base sm:text-lg text-[#A1A1AA] max-w-2xl mx-auto mt-6 leading-relaxed"
          >
            Detect phishing, smishing, and scam messages across 7 Indian regional languages — powered by
            classical ML and modern multilingual NLP.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-4 mt-10"
          >
            <Link to="/dashboard" className="btn-neon flex items-center gap-2" data-testid="hero-start-btn">
              Start Detection <ArrowRight size={16} />
            </Link>
            <Link to="/dashboard" className="btn-ghost-neon flex items-center gap-2" data-testid="hero-dashboard-btn">
              View Dashboard
            </Link>
          </motion.div>

          {/* Animated threat preview cards */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { label: "PHISHING", color: "#FF2A2A", text: "URGENT: KYC suspended", conf: 97, glow: "glow-red" },
              { label: "GENUINE", color: "#00FF66", text: "Hi mom, picking up at 6pm", conf: 96, glow: "glow-green" },
              { label: "PHISHING", color: "#FF2A2A", text: "आपका SBI खाता निलंबित…", conf: 94, glow: "glow-red" },
            ].map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className={`glass-strong rounded-xl p-4 text-left border ${c.glow}`}
                style={{ borderColor: `${c.color}40` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono tracking-[0.2em]" style={{ color: c.color }}>{c.label}</span>
                  <span className="text-xs font-mono text-[#71717A]">{c.conf}%</span>
                </div>
                <div className="text-sm text-white truncate">{c.text}</div>
                <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.conf}%`, background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* LANGUAGES */}
      <section id="languages" className="px-6 lg:px-12 py-20 lg:py-28 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-[#00E5FF] mb-3">Languages Supported</div>
            <h2 className="font-heading text-3xl lg:text-5xl font-bold tracking-tight text-white">Built for India's <span className="text-gradient-cyan">linguistic diversity</span></h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {LANGUAGES.map((l, i) => (
              <motion.div
                key={l.code}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                className="glass rounded-2xl p-6 border border-white/5 card-hover relative overflow-hidden group"
                data-testid={`language-card-${l.code.toLowerCase()}`}
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-2xl group-hover:opacity-40 transition-opacity" style={{ background: l.color }} />
                <div className="text-xs font-mono tracking-[0.2em]" style={{ color: l.color }}>{l.code}</div>
                <div className="font-heading text-2xl text-white mt-2">{l.native}</div>
                <div className="text-sm text-[#71717A] mt-1">{l.name}</div>
              </motion.div>
            ))}
            <div className="glass rounded-2xl p-6 border border-white/5 flex items-center justify-center text-center">
              <div>
                <Languages className="mx-auto text-[#9D4CDD]" size={28} />
                <div className="text-xs font-mono text-[#71717A] mt-2">+ More coming</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="px-6 lg:px-12 py-20 lg:py-28 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-[#00E5FF] mb-3">Capabilities</div>
            <h2 className="font-heading text-3xl lg:text-5xl font-bold tracking-tight text-white">An AI defense layer for <span className="text-gradient-cyan">every inbox</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="glass rounded-2xl p-6 border border-white/5 card-hover"
                data-testid={`feature-card-${i}`}
              >
                <div className="h-10 w-10 rounded-lg flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(157,76,221,0.18))" }}>
                  <f.icon size={20} className="text-[#00E5FF]" />
                </div>
                <div className="font-heading text-xl font-semibold text-white">{f.title}</div>
                <div className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW TIMELINE */}
      <section id="workflow" className="px-6 lg:px-12 py-20 lg:py-28 relative overflow-hidden">
        <div className="cyber-grid absolute inset-0 opacity-50" />
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-14">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-[#00E5FF] mb-3">ML Pipeline</div>
            <h2 className="font-heading text-3xl lg:text-5xl font-bold tracking-tight text-white">From raw text to <span className="text-gradient-cyan">threat verdict</span></h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {WORKFLOW.map((w, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative glass rounded-2xl p-5 border border-white/5 card-hover"
              >
                <div className="absolute -top-3 -left-3 h-8 w-8 rounded-lg flex items-center justify-center node-pulse"
                     style={{ background: "linear-gradient(135deg, #00E5FF, #9D4CDD)" }}>
                  <span className="text-xs font-mono font-bold text-[#05050A]">0{i + 1}</span>
                </div>
                <w.icon size={22} className="text-[#00E5FF] mt-2" />
                <div className="font-heading text-base font-semibold text-white mt-3">{w.title}</div>
                <div className="text-xs text-[#71717A] mt-1">{w.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="px-6 lg:px-12 py-20 relative">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { v: accuracy, suf: "%", l: "ML Accuracy", dec: 1 },
            { v: dsSize, suf: "+", l: "Messages Analyzed" },
            { v: 7, suf: "", l: "Languages Supported" },
            { v: 3, suf: "", l: "ML Algorithms" },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass rounded-2xl p-6 border border-white/5 text-center card-hover"
              data-testid={`stat-card-${i}`}
            >
              <div className="font-heading text-4xl lg:text-5xl font-bold text-gradient-cyan">
                <Counter target={s.v} suffix={s.suf} decimals={s.dec || 0} />
              </div>
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA] mt-2">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ROADMAP TEASER */}
      <section id="roadmap" className="px-6 lg:px-12 py-20 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-[#00E5FF] mb-3">Beyond SMS</div>
            <h2 className="font-heading text-3xl lg:text-5xl font-bold tracking-tight text-white">Protection on <span className="text-gradient-cyan">every channel</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Globe, t: "Browser Extension", d: "Badges on Gmail, Outlook & Messages web in Chrome and Firefox.", q: "LIVE", to: "/dashboard/integrations" },
              { icon: Smartphone, t: "Mobile App", d: "Offline on-device model for Android & iOS.", q: "LIVE", to: "/dashboard/integrations" },
              { icon: Brain, t: "BERT / XLM-R", d: "Fine-tuning pipeline for multilingual transformers.", q: "READY TO TRAIN", to: "/dashboard/integrations" },
              { icon: Mic, t: "Voice Phishing", d: "Whisper speech-to-text + scam-call tactic detection.", q: "LIVE", to: "/dashboard/voice" },
              { icon: Mail, t: "Email Scanning", d: "Gmail & Outlook inbox scans and .eml checks.", q: "LIVE", to: "/dashboard/email" },
              { icon: ShieldCheck, t: "Threat Intel Hub", d: "Community database of scam links and numbers.", q: "LIVE", to: "/dashboard/threats" },
            ].map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <Link to={r.to} className="block h-full glass rounded-2xl p-6 border border-white/5 card-hover">
                  <r.icon size={22} className="text-[#9D4CDD]" />
                  <div className="font-heading text-lg font-semibold text-white mt-3">{r.t}</div>
                  <div className="text-sm text-[#A1A1AA] mt-1">{r.d}</div>
                  <div className="text-xs font-mono text-[#00E5FF] mt-3 tracking-wider">{r.q}</div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-12 py-24 relative">
        <div className="max-w-4xl mx-auto glass-strong rounded-3xl p-10 lg:p-16 border border-[rgba(0,229,255,0.25)] text-center relative overflow-hidden pulse-glow">
          <div className="absolute inset-0 cyber-grid opacity-30" />
          <div className="relative">
            <h2 className="font-heading text-3xl lg:text-5xl font-bold tracking-tight text-white">Start hunting <span className="text-gradient-cyan">phish</span> in seconds</h2>
            <p className="text-[#A1A1AA] max-w-xl mx-auto mt-4">Jump straight into the dashboard and analyse messages across 7 languages — no signup required.</p>
            <Link to="/dashboard" className="btn-neon inline-flex items-center gap-2 mt-8" data-testid="cta-launch-btn">
              Launch Dashboard <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-6 lg:px-12 py-10 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo size="sm" />
        <div className="text-xs font-mono text-[#71717A] tracking-wider">PHISHGUARD.AI — © 2026 — POWERED BY ML & MULTILINGUAL NLP</div>
      </footer>
    </div>
  );
}
