import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Search, Send, Loader2, ThumbsUp, ThumbsDown, Download, Link2, Phone, Mail, Hash, Globe } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api } from "../lib/api";

const CATEGORIES = [
  ["bank", "Bank / card"], ["kyc", "KYC update"], ["lottery", "Lottery / prize"], ["job", "Job / work-from-home"],
  ["delivery", "Parcel / delivery"], ["loan", "Instant loan"], ["investment", "Investment / crypto"],
  ["government", "Govt / police / tax"], ["utility", "Electricity / bill"], ["tech_support", "Tech support"], ["other", "Other"],
];
const TYPE_ICON = { url: Link2, domain: Globe, phone: Phone, email: Mail, sender_id: Hash };
const STATUS_COLOR = { confirmed: "#FF2A2A", unverified: "#FFB000", false_positive: "#71717A" };

const field = "rounded-xl bg-black/40 border border-white/10 focus:border-[#00E5FF] focus:ring-2 focus:ring-[rgba(0,229,255,0.20)] focus:outline-none text-white placeholder:text-[#71717A] px-4 py-2.5 text-sm";
const input = "w-full rounded-xl bg-black/40 border border-white/10 focus:border-[#00E5FF] focus:ring-2 focus:ring-[rgba(0,229,255,0.20)] focus:outline-none text-white placeholder:text-[#71717A] px-4 py-2.5 text-sm";

function Stat({ label, value, color = "#00E5FF" }) {
  return (
    <div className="glass rounded-2xl p-5 border border-white/5">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717A]">{label}</div>
      <div className="font-heading text-3xl font-bold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

export default function ThreatHub() {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ type: "", category: "", q: "", sort: "recent" });
  const [form, setForm] = useState({ value: "", message: "", category: "bank" });
  const [sending, setSending] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupRes, setLookupRes] = useState(null);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.threats({ ...params, limit: 100 }).then((d) => setItems(d.items || [])).catch(() => {});
    api.threatStats().then(setStats).catch(() => {});
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.value.trim() && !form.message.trim()) {
      toast.error("Add a link / number / sender, or paste the scam message");
      return;
    }
    setSending(true);
    try {
      const r = await api.reportThreat({ value: form.value || null, message: form.message || null, category: form.category });
      toast.success(`Reported ${r.saved.length} indicator${r.saved.length === 1 ? "" : "s"}. Thank you!`);
      setForm({ ...form, value: "", message: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Report failed");
    } finally {
      setSending(false);
    }
  };

  const doLookup = async () => {
    if (lookup.trim().length < 3) return;
    try { setLookupRes(await api.lookupThreat(lookup.trim())); } catch (e) { toast.error(e?.response?.data?.detail || "Lookup failed"); }
  };

  const vote = async (id, dir) => {
    try { await api.voteThreat(id, dir); load(); toast.success("Thanks for the feedback"); } catch { toast.error("Vote failed"); }
  };

  const confirmed = stats?.by_status?.confirmed || 0;
  const weekNew = (stats?.trend || []).slice(-7).reduce((s, d) => s + d.new, 0);

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="threat-hub">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Indicators" value={stats?.total ?? "—"} />
        <Stat label="Community reports" value={stats?.total_reports ?? "—"} color="#9D4CDD" />
        <Stat label="Confirmed scams" value={confirmed} color="#FF2A2A" />
        <Stat label="New this week" value={weekNew} color="#00FF66" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-2xl p-6 border border-white/5 xl:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={16} className="text-[#FF2A2A]" />
            <h2 className="font-heading text-lg font-semibold">Report a scam</h2>
          </div>
          <p className="text-sm text-[#71717A] mb-4">
            Paste the message, or just the link, phone number, e-mail or SMS sender ID (like VM-HDFCBK). Every scan on PhishGuard is checked against these reports.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className={`${input} md:col-span-2`} placeholder="Link, phone, e-mail or sender ID" value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })} data-testid="report-value" />
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="report-category">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v} className="bg-[#0A0F1C]">{l}</option>)}
            </select>
          </div>
          <textarea className={`${input} mt-3 font-mono`} rows={3} placeholder="Optional: paste the whole scam message (any language)"
            value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} data-testid="report-message" />
          <div className="flex justify-end mt-3">
            <button className="btn-neon flex items-center gap-2" onClick={submit} disabled={sending} data-testid="report-submit">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Report
            </button>
          </div>
        </motion.div>

        <div className="glass-strong rounded-2xl p-6 border border-white/5">
          <h2 className="font-heading text-lg font-semibold mb-1">Is this a known scam?</h2>
          <p className="text-sm text-[#71717A] mb-4">Check a link or number before you click or call.</p>
          <div className="flex gap-2">
            <input className={input} placeholder="e.g. sbi-kyc-update.in" value={lookup} onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLookup()} data-testid="lookup-input" />
            <button className="btn-neon px-4" onClick={doLookup} aria-label="Look up" data-testid="lookup-button"><Search size={16} /></button>
          </div>
          {lookupRes && (
            <div className={`mt-4 rounded-xl p-4 border ${lookupRes.found ? "border-[rgba(255,42,42,0.35)] bg-[rgba(255,42,42,0.08)]" : "border-[rgba(0,255,102,0.25)] bg-[rgba(0,255,102,0.06)]"}`} data-testid="lookup-result">
              {lookupRes.found ? (
                <>
                  <div className="font-semibold text-[#FF2A2A]">Reported {lookupRes.matches.reduce((s, m) => s + (m.reports || 0), 0)} time(s)</div>
                  <div className="text-xs text-[#A1A1AA] mt-1">Status: {lookupRes.matches[0].status} · Category: {lookupRes.matches[0].category}</div>
                </>
              ) : (
                <div className="text-sm text-[#00FF66]">Not in the database. That doesn't make it safe, so stay careful.</div>
              )}
            </div>
          )}
          <div className="h-28 mt-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717A] mb-1">New indicators, last 14 days</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.trend || []}>
                <XAxis dataKey="date" hide />
                <YAxis hide allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0A0F1C", border: "1px solid rgba(255,255,255,0.1)" }} />
                <Bar dataKey="new" fill="#00E5FF" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-strong rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-4 flex flex-wrap gap-3 items-center border-b border-white/5">
          <input className={`${field} w-full sm:w-64`} placeholder="Search…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} data-testid="threat-search" />
          <select className={field} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="" className="bg-[#0A0F1C]">All types</option>
            {["url", "domain", "phone", "email", "sender_id"].map((t) => <option key={t} value={t} className="bg-[#0A0F1C]">{t}</option>)}
          </select>
          <select className={field} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="" className="bg-[#0A0F1C]">All categories</option>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v} className="bg-[#0A0F1C]">{l}</option>)}
          </select>
          <select className={field} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            <option value="recent" className="bg-[#0A0F1C]">Most recent</option>
            <option value="reports" className="bg-[#0A0F1C]">Most reported</option>
          </select>
          <a href={api.threatExportUrl("csv")} className="ml-auto text-sm flex items-center gap-2 text-[#A1A1AA] hover:text-[#00E5FF]" data-testid="threat-export">
            <Download size={14} />Export CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717A]">
                <th className="px-4 py-3">Indicator</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Reports</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3">Last seen</th><th className="px-4 py-3">Scam?</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const Icon = TYPE_ICON[t.type] || Globe;
                return (
                  <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.02]" data-testid={`threat-row-${t.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-mono text-white break-all"><Icon size={14} className="text-[#00E5FF] shrink-0" />{t.value}</div>
                      {t.sources?.includes("auto-detector") && <div className="text-[10px] text-[#71717A] font-mono mt-0.5">added by detector</div>}
                    </td>
                    <td className="px-4 py-3 text-[#A1A1AA]">{(CATEGORIES.find(([v]) => v === t.category) || [0, t.category])[1]}</td>
                    <td className="px-4 py-3 font-mono">{t.reports}</td>
                    <td className="px-4 py-3"><span className="text-xs font-mono uppercase" style={{ color: STATUS_COLOR[t.status] }}>{t.status?.replace("_", " ")}</span></td>
                    <td className="px-4 py-3 text-[#71717A] font-mono text-xs">{t.last_seen?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => vote(t.id, "up")} className="p-1.5 rounded-md hover:bg-white/5 text-[#A1A1AA] hover:text-[#FF2A2A]" aria-label="Yes, scam"><ThumbsUp size={14} /></button>
                        <span className="text-xs font-mono text-[#71717A] self-center">{t.votes_up}/{t.votes_down}</span>
                        <button onClick={() => vote(t.id, "down")} className="p-1.5 rounded-md hover:bg-white/5 text-[#A1A1AA] hover:text-[#00FF66]" aria-label="Not a scam"><ThumbsDown size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[#71717A] font-mono text-sm">No indicators yet. Report one above, or scan a phishing message on the Detection page.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
