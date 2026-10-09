import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, Upload, Inbox, Loader2, Send, RefreshCw, Unplug, Plug, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import ScanVerdict from "../components/ScanVerdict";

const input = "w-full rounded-xl bg-black/40 border border-white/10 focus:border-[#00E5FF] focus:ring-2 focus:ring-[rgba(0,229,255,0.20)] focus:outline-none text-white placeholder:text-[#71717A] px-4 py-2.5 text-sm";

const SAMPLE = {
  subject: "Your HDFC NetBanking access will be suspended",
  sender: "HDFC Bank <security@hdfc-alerts-team.top>",
  reply_to: "",
  body: "Dear Customer,\n\nWe noticed unusual activity. Your NetBanking will be suspended within 24 hours unless you verify your KYC details here: http://hdfc-kyc-verify.top/login\n\nRegards,\nHDFC Bank Security Team",
};

function Tab({ id, active, onClick, icon: Icon, children }) {
  return (
    <button onClick={() => onClick(id)} data-testid={`email-tab-${id}`}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${active ? "bg-[rgba(0,229,255,0.10)] text-[#00E5FF] border-[rgba(0,229,255,0.25)]" : "text-[#A1A1AA] border-transparent hover:text-white hover:bg-white/5"}`}>
      <Icon size={16} />{children}
    </button>
  );
}

function Verdict({ result }) {
  return (
    <ScanVerdict result={result} title="Why" signals={result.signals}
      meta={[{ k: "LINKS CHECKED", v: result.links_checked }, ...(result.attachments?.length ? [{ k: "ATTACHMENTS", v: result.attachments.length }] : [])]} />
  );
}

export default function EmailScan() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("paste");
  const [form, setForm] = useState({ subject: "", sender: "", reply_to: "", body: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [providers, setProviders] = useState([]);
  const [scanning, setScanning] = useState(null);
  const [inboxResults, setInboxResults] = useState([]);
  const fileRef = useRef();

  const loadProviders = () => api.emailProviders().then((d) => setProviders(d.providers || [])).catch(() => {});
  const loadResults = () => api.emailResults({ limit: 50 }).then((d) => setInboxResults(d.items || [])).catch(() => {});

  useEffect(() => {
    loadProviders();
    loadResults();
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) { toast.success(`${connected === "gmail" ? "Gmail" : "Outlook"} connected`); setTab("inbox"); }
    if (error) { toast.error(`Connection failed: ${error}`); setTab("inbox"); }
    if (connected || error) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyzePaste = async () => {
    if (!form.body.trim() && !form.subject.trim()) { toast.error("Paste at least the subject or body"); return; }
    setLoading(true); setResult(null);
    try { setResult(await api.analyzeEmail(form)); } catch (e) { toast.error(e?.response?.data?.detail || "Scan failed"); } finally { setLoading(false); }
  };

  const analyzeFile = async (file) => {
    if (!file) return;
    setLoading(true); setResult(null);
    try { setResult(await api.analyzeEml(file)); } catch (e) { toast.error(e?.response?.data?.detail || "Could not read that file"); } finally { setLoading(false); }
  };

  const connect = async (id) => {
    try { window.location.href = (await api.emailConnect(id)).auth_url; } catch (e) { toast.error(e?.response?.data?.detail || "Not configured", { duration: 8000 }); }
  };

  const scan = async (id) => {
    setScanning(id);
    try {
      const r = await api.emailScan(id, 25);
      toast[r.flagged ? "error" : "success"](`Scanned ${r.scanned} e-mails, ${r.flagged} look like phishing`);
      loadResults();
    } catch (e) { toast.error(e?.response?.data?.detail || "Scan failed"); } finally { setScanning(null); }
  };

  const disconnect = async (id) => { await api.emailDisconnect(id); loadProviders(); };

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="email-page">
      <div className="flex flex-wrap gap-2">
        <Tab id="paste" active={tab === "paste"} onClick={setTab} icon={Mail}>Paste e-mail</Tab>
        <Tab id="eml" active={tab === "eml"} onClick={setTab} icon={Upload}>Upload .eml</Tab>
        <Tab id="inbox" active={tab === "inbox"} onClick={setTab} icon={Inbox}>Gmail / Outlook</Tab>
      </div>

      {tab === "paste" && (
        <div className="glass-strong rounded-2xl p-6 border border-white/5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={input} placeholder='From, e.g. "HDFC Bank <alerts@…>"' value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} data-testid="email-sender" />
            <input className={input} placeholder="Reply-To (optional)" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
          </div>
          <input className={input} placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="email-subject" />
          <textarea className={`${input} font-mono`} rows={8} placeholder="E-mail body (text or HTML)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="email-body" />
          <div className="flex items-center gap-3">
            <button className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-[#00E5FF] hover:text-[#00E5FF] text-[#A1A1AA] font-mono" onClick={() => setForm(SAMPLE)}>Load sample</button>
            <button className="btn-neon flex items-center gap-2 ml-auto" onClick={analyzePaste} disabled={loading} data-testid="email-analyze">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Scan e-mail
            </button>
          </div>
          <p className="text-xs text-[#71717A]">Tip: to check SPF/DKIM results and attachments, use "Upload .eml" (Gmail: ⋮ → Download message; Outlook: File → Save As).</p>
        </div>
      )}

      {tab === "eml" && (
        <div
          className="glass-strong rounded-2xl p-10 border border-dashed border-white/15 text-center cursor-pointer hover:border-[#00E5FF]"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); analyzeFile(e.dataTransfer.files?.[0]); }}
          data-testid="eml-drop"
        >
          {loading ? <Loader2 className="mx-auto animate-spin text-[#00E5FF]" /> : <Upload className="mx-auto text-[#00E5FF]" />}
          <div className="mt-3 font-heading text-lg">Drop an .eml file here, or click to choose</div>
          <div className="text-sm text-[#71717A] mt-1">Headers, links and attachments are all checked. Nothing is stored.</div>
          <input ref={fileRef} type="file" accept=".eml,message/rfc822" className="hidden" onChange={(e) => analyzeFile(e.target.files?.[0])} />
        </div>
      )}

      {tab === "inbox" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((p) => (
              <div key={p.id} className="glass-strong rounded-2xl p-6 border border-white/5" data-testid={`provider-${p.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-heading text-lg font-semibold">{p.label}</div>
                    <div className="text-xs font-mono text-[#71717A] mt-1">
                      {p.connected ? `Connected${p.account ? `: ${p.account}` : ""}` : p.configured ? "Not connected" : "Needs API keys (see docs/EMAIL_SETUP.md)"}
                    </div>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${p.connected ? "bg-[#00FF66] glow-green" : "bg-[#71717A]"}`} />
                </div>
                <div className="flex gap-2 mt-4">
                  {p.connected ? (
                    <>
                      <button className="btn-neon flex items-center gap-2" onClick={() => scan(p.id)} disabled={scanning === p.id}>
                        {scanning === p.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Scan inbox
                      </button>
                      <button className="px-3 py-2 rounded-lg text-sm text-[#A1A1AA] hover:text-white border border-white/10 flex items-center gap-2" onClick={() => disconnect(p.id)}>
                        <Unplug size={14} />Disconnect
                      </button>
                    </>
                  ) : (
                    <button className="btn-neon flex items-center gap-2" onClick={() => connect(p.id)}><Plug size={16} />Connect {p.label}</button>
                  )}
                </div>
                <p className="text-xs text-[#71717A] mt-3">Read-only access. PhishGuard never sends, deletes or moves mail.</p>
              </div>
            ))}
          </div>

          <div className="glass-strong rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 font-heading font-semibold">Inbox scan results</div>
            {inboxResults.length === 0 && <div className="p-8 text-center text-sm text-[#71717A] font-mono">No inbox scans yet.</div>}
            <ul>
              {inboxResults.map((r) => {
                const bad = r.label === "phishing";
                return (
                  <li key={r.id} className="px-5 py-3 border-t border-white/5 flex items-start gap-3">
                    {bad ? <ShieldAlert size={18} className="text-[#FF2A2A] mt-0.5 shrink-0" /> : <ShieldCheck size={18} className="text-[#00FF66] mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{r.subject || "(no subject)"}</div>
                      <div className="text-xs text-[#71717A] truncate">{r.sender} · {r.provider}</div>
                      {bad && r.signals?.length > 0 && <div className="text-xs text-[#FFB000] mt-1">{r.signals.map((s) => s.detail).slice(0, 2).join(" · ")}</div>}
                    </div>
                    <div className="text-xs font-mono shrink-0" style={{ color: bad ? "#FF2A2A" : "#00FF66" }}>{r.confidence}%</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {tab !== "inbox" && result && <Verdict result={result} />}
    </div>
  );
}
