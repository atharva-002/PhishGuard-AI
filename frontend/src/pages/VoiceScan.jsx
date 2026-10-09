import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, FileText, Info } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import ScanVerdict from "../components/ScanVerdict";

const LANGS = [["auto", "Auto-detect"], ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["ta", "Tamil"], ["bn", "Bengali"], ["te", "Telugu"], ["gu", "Gujarati"]];
const SAMPLE = "Hello, I am calling from Mumbai Police cyber cell. A parcel in your name has drugs inside. You are under digital arrest. Do not tell anyone and stay on the call. Download AnyDesk so we can verify your bank account, and transfer the security deposit immediately.";
const input = "w-full rounded-xl bg-black/40 border border-white/10 focus:border-[#00E5FF] focus:ring-2 focus:ring-[rgba(0,229,255,0.20)] focus:outline-none text-white placeholder:text-[#71717A] px-4 py-2.5 text-sm";

function fmt(t) {
  const m = Math.floor(t / 60);
  return `${m}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export default function VoiceScan() {
  const [status, setStatus] = useState(null);
  const [lang, setLang] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const fileRef = useRef();

  useEffect(() => { api.voiceStatus().then(setStatus).catch(() => {}); return () => clearInterval(timerRef.current); }, []);

  const sendAudio = async (file) => {
    if (!file) return;
    setLoading(true); setResult(null);
    try {
      setResult(await api.analyzeVoice(file, lang));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not analyse the audio", { duration: 8000 });
    } finally { setLoading(false); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        sendAudio(new File([new Blob(chunks, { type: rec.mimeType })], "recording.webm", { type: rec.mimeType }));
      };
      rec.start();
      recRef.current = rec;
      setRecording(true); setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone permission was denied");
    }
  };

  const stopRec = () => { recRef.current?.stop(); setRecording(false); clearInterval(timerRef.current); };

  const sendTranscript = async () => {
    if (!transcript.trim()) return;
    setLoading(true); setResult(null);
    try { setResult(await api.analyzeTranscript(transcript)); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setLoading(false); }
  };

  const d = result?.delivery || {};
  const meta = [
    ...(result?.stt_language ? [{ k: "LANGUAGE", v: result.stt_language }] : []),
    ...(d.duration_sec ? [{ k: "LENGTH", v: fmt(d.duration_sec) }] : []),
    ...(d.words_per_minute ? [{ k: "WPM", v: d.words_per_minute }] : []),
    ...(d.longest_monologue_sec ? [{ k: "LONGEST MONOLOGUE", v: `${d.longest_monologue_sec}s` }] : []),
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="voice-page">
      {status && !status.stt_installed && (
        <div className="glass rounded-xl p-4 border border-[rgba(255,176,0,0.30)] flex gap-3 text-sm" data-testid="stt-missing">
          <Info size={18} className="text-[#FFB000] shrink-0 mt-0.5" />
          <div>
            <div className="text-white">Speech-to-text is not installed on the server yet.</div>
            <div className="text-[#A1A1AA] mt-1">Run <code className="font-mono text-[#00E5FF]">pip install -r requirements-voice.txt</code> in <code className="font-mono">backend</code> and restart. Until then you can paste a call transcript below.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-strong rounded-2xl p-6 border border-white/5">
          <h2 className="font-heading text-lg font-semibold mb-1">Analyse a call recording</h2>
          <p className="text-sm text-[#71717A] mb-4">Upload a recording (mp3, wav, m4a, ogg) or record from the mic. Whisper transcribes it in any of the 7 languages.</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/10 w-fit mb-4">
            <span className="text-xs font-mono text-[#71717A]">LANGUAGE</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-transparent text-sm text-white focus:outline-none font-mono" data-testid="voice-lang">
              {LANGS.map(([v, l]) => <option key={v} value={v} className="bg-[#0A0F1C]">{l}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-neon flex items-center gap-2" disabled={loading || recording} onClick={() => fileRef.current?.click()} data-testid="voice-upload">
              <Upload size={16} />Upload audio
            </button>
            {!recording ? (
              <button className="px-4 py-2 rounded-lg border border-white/10 text-sm flex items-center gap-2 hover:border-[#FF2A2A] hover:text-[#FF2A2A]" disabled={loading} onClick={startRec} data-testid="voice-record">
                <Mic size={16} />Record
              </button>
            ) : (
              <button className="px-4 py-2 rounded-lg border border-[#FF2A2A] text-[#FF2A2A] text-sm flex items-center gap-2" onClick={stopRec}>
                <Square size={14} />Stop · {fmt(elapsed)}
              </button>
            )}
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.amr" className="hidden" onChange={(e) => sendAudio(e.target.files?.[0])} />
          </div>
          {loading && <div className="mt-4 text-sm text-[#A1A1AA] flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Transcribing and analysing… the first run downloads the speech model.</div>}
          <p className="text-xs text-[#71717A] mt-4">Only record calls where that is legal and the other person has agreed.</p>
        </div>

        <div className="glass-strong rounded-2xl p-6 border border-white/5">
          <h2 className="font-heading text-lg font-semibold mb-1 flex items-center gap-2"><FileText size={16} className="text-[#9D4CDD]" />Or paste what the caller said</h2>
          <textarea className={`${input} font-mono mt-3`} rows={6} placeholder="Type or paste the call transcript…" value={transcript} onChange={(e) => setTranscript(e.target.value)} data-testid="voice-transcript" />
          <div className="flex gap-3 mt-3">
            <button className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-[#00E5FF] hover:text-[#00E5FF] text-[#A1A1AA] font-mono" onClick={() => setTranscript(SAMPLE)}>Load sample</button>
            <button className="btn-neon ml-auto" onClick={sendTranscript} disabled={loading} data-testid="voice-analyze-text">Analyse transcript</button>
          </div>
        </div>
      </div>

      {result && (
        <ScanVerdict result={result} title="Scam tactics heard" signals={[...result.cues, ...(result.delivery_flags || [])]} meta={meta} testId="voice-verdict">
          {result.transcript && (
            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#A1A1AA] mb-3">Transcript</div>
              {result.segments?.length ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-2">
                  {result.segments.map((s, i) => (
                    <div key={i} className="text-sm flex gap-3"><span className="font-mono text-xs text-[#71717A] w-12 shrink-0 pt-0.5">{fmt(s.start)}</span><span className="text-[#D4D4D8]">{s.text}</span></div>
                  ))}
                </div>
              ) : <p className="text-sm text-[#D4D4D8]">{result.transcript}</p>}
            </div>
          )}
        </ScanVerdict>
      )}
    </div>
  );
}
