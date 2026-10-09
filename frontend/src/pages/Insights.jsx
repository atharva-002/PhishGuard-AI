import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ShieldAlert, ShieldCheck, Languages, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from "recharts";

const COLORS = ["#FF2A2A", "#00FF66", "#FFB000", "#00E5FF", "#9D4CDD"];

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 border border-white/5 card-hover"
      data-testid={`insight-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#71717A]">{label}</div>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: `${color}22` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div className="font-heading text-3xl font-bold text-white mt-3">{value}</div>
      {sub && <div className="text-xs font-mono text-[#A1A1AA] mt-1">{sub}</div>}
    </motion.div>
  );
}

export default function Insights() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => api.stats().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return <div className="p-8 text-[#71717A] font-mono">Loading insights…</div>;

  const labelPie = [
    { name: "Phishing", value: stats.totals.phishing },
    { name: "Genuine", value: stats.totals.genuine },
  ];
  const threats = stats.threats || [];
  const trend = stats.trend || [];
  const langs = (stats.languages || []).slice(0, 7);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Scans" value={stats.totals.scans.toLocaleString()} color="#00E5FF" />
        <StatCard icon={ShieldAlert} label="Phishing" value={stats.totals.phishing.toLocaleString()} color="#FF2A2A" />
        <StatCard icon={ShieldCheck} label="Genuine" value={stats.totals.genuine.toLocaleString()} color="#00FF66" />
        <StatCard icon={TrendingUp} label="Model Accuracy" value={`${(stats.totals.accuracy * 100).toFixed(1)}%`} color="#9D4CDD" sub={`${stats.totals.dataset_size.toLocaleString()} training rows`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass rounded-2xl p-6 border border-white/5" data-testid="threat-distribution">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA] mb-4">Threat Distribution</div>
          {stats.totals.scans === 0 ? (
            <div className="h-60 flex items-center justify-center text-[#71717A] font-mono text-sm text-center">Run your first scan to see distribution.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={labelPie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                  {labelPie.map((entry, i) => <Cell key={i} fill={i === 0 ? "#FF2A2A" : "#00FF66"} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0A0F1C", border: "1px solid rgba(0,229,255,0.30)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "#A1A1AA" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-2xl p-6 border border-white/5 lg:col-span-2" data-testid="trend-chart">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA] mb-4">7-Day Detection Trend</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0A0F1C", border: "1px solid rgba(0,229,255,0.30)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "#A1A1AA" }} />
              <Line type="monotone" dataKey="phishing" stroke="#FF2A2A" strokeWidth={2} dot={{ r: 3, fill: "#FF2A2A" }} />
              <Line type="monotone" dataKey="genuine" stroke="#00FF66" strokeWidth={2} dot={{ r: 3, fill: "#00FF66" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-6 border border-white/5" data-testid="language-distribution">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA] mb-4 flex items-center gap-2"><Languages size={14} className="text-[#9D4CDD]" />Language-wise scans</div>
          {langs.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-[#71717A] font-mono text-sm">No scans yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={langs}>
                <XAxis dataKey="name" tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0A0F1C", border: "1px solid rgba(0,229,255,0.30)", borderRadius: 8 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {langs.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-2xl p-6 border border-white/5" data-testid="threat-levels">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA] mb-4">Threat Level Breakdown</div>
          {threats.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-[#71717A] font-mono text-sm">No threats logged yet.</div>
          ) : (
            <div className="space-y-3">
              {threats.map((t) => {
                const max = Math.max(...threats.map((x) => x.count));
                const w = (t.count / max) * 100;
                const colorMap = { Critical: "#FF2A2A", High: "#FF2A2A", Medium: "#FFB000", Low: "#00FF66", Safe: "#00FF66" };
                const c = colorMap[t.level] || "#00E5FF";
                return (
                  <div key={t.level}>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-white">{t.level}</span>
                      <span className="text-[#71717A]">{t.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
