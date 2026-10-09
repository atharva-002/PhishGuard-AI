import { ShieldCheck } from "lucide-react";

export default function Logo({ size = "md" }) {
  const sz = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-logo">
      <div className={`${sz} rounded-lg flex items-center justify-center relative`}
           style={{ background: "linear-gradient(135deg, #00E5FF 0%, #9D4CDD 100%)" }}>
        <ShieldCheck className="text-[#05050A]" size={size === "lg" ? 22 : size === "sm" ? 14 : 18} strokeWidth={2.5} />
        <div className="absolute inset-0 rounded-lg glow-cyan opacity-50" />
      </div>
      <div className={`font-heading font-bold ${text} text-white tracking-tight`}>
        Phish<span className="text-gradient-cyan">Guard</span>
        <span className="text-[#A1A1AA] font-mono text-[0.6em] ml-1">.AI</span>
      </div>
    </div>
  );
}
