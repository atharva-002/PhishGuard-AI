import { useEffect, useState } from "react";
import { Globe, Smartphone, Brain, Code2, Download, CheckCircle2, CircleDashed } from "lucide-react";
import { api, API } from "../lib/api";

function Card({ icon: Icon, color, title, children, testId }) {
  return (
    <div className="glass-strong rounded-2xl p-6 border border-white/5" data-testid={testId}>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}><Icon size={20} style={{ color }} /></div>
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
      </div>
      <div className="text-sm text-[#A1A1AA] space-y-3">{children}</div>
    </div>
  );
}

const Code = ({ children }) => <pre className="rounded-lg bg-black/50 border border-white/10 p-3 font-mono text-xs text-[#00E5FF] overflow-x-auto whitespace-pre">{children}</pre>;
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);

export default function Integrations() {
  const [metrics, setMetrics] = useState({});
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api.metrics().then((d) => setMetrics(d.metrics || {})).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, []);

  const rows = [["svm", "Linear SVM (server)"], ["logistic_regression", "Logistic Regression (server)"], ["on_device", "On-device model (app & extension)"], ["transformer", metrics.transformer?.name || "Transformer"]];

  return (
    <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-6" data-testid="integrations-page">
      <Card icon={Globe} color="#00E5FF" title="Browser extension (Chrome & Firefox)" testId="int-extension">
        <p>Adds a PhishGuard badge to messages in <b className="text-white">Gmail</b>, <b className="text-white">Outlook</b>, <b className="text-white">Google Messages</b> and <b className="text-white">WhatsApp Web</b>, scans any selected text from the right-click menu, and can report links to the Threat Hub. If the server is offline it falls back to the built-in on-device model.</p>
        <a href="/downloads/phishguard-extension.zip" className="btn-neon inline-flex items-center gap-2 w-fit" download><Download size={16} />Download extension (.zip)</a>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Unzip it. <b className="text-white">Chrome / Edge:</b> open <code className="font-mono text-[#00E5FF]">chrome://extensions</code>, turn on Developer mode, click <i>Load unpacked</i> and pick the folder.</li>
          <li><b className="text-white">Firefox:</b> open <code className="font-mono text-[#00E5FF]">about:debugging#/runtime/this-firefox</code> → <i>Load Temporary Add-on</i> → pick <code className="font-mono">manifest.json</code>.</li>
          <li>Open the extension's options and set the server URL (default <code className="font-mono">http://localhost:8000</code>).</li>
        </ol>
      </Card>

      <Card icon={Smartphone} color="#9D4CDD" title="Mobile app (Android & iOS)" testId="int-mobile">
        <p>An Expo / React Native app. It runs the on-device model, so scans work offline and the message never leaves the phone. When a server URL is set it also asks the full 3-model API and checks the Threat Hub.</p>
        <Code>{`cd mobile
npm install
npx expo start        # scan the QR code with Expo Go`}</Code>
        <p>To build an installable Android APK: <code className="font-mono text-[#00E5FF]">npx eas build -p android --profile preview</code> (free Expo account). On a phone, set the server URL to your PC's network address, e.g. <code className="font-mono">http://192.168.0.105:8000</code>.</p>
      </Card>

      <Card icon={Brain} color="#00FF66" title="Model line-up" testId="int-models">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717A]"><th className="py-2">Model</th><th>Accuracy</th><th>F1</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(([k, name]) => (
                <tr key={k} className="border-t border-white/5">
                  <td className="py-2 text-white">{name}</td>
                  <td className="font-mono">{pct(metrics[k]?.accuracy)}</td>
                  <td className="font-mono">{pct(metrics[k]?.f1)}</td>
                  <td>{(k === "transformer" ? health?.transformer_ready : metrics[k]) ? <CheckCircle2 size={16} className="text-[#00FF66]" /> : <CircleDashed size={16} className="text-[#71717A]" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!health?.transformer_ready && (
          <>
            <p>The transformer needs a GPU to train. Use the free Colab notebook:</p>
            <Code>{`cd backend
python -m ml.make_colab_bundle      # upload this zip in Colab
# open notebooks/train_transformer_colab.ipynb in Colab (T4 GPU)
# unzip transformer_model.zip into backend/ml/models/, then restart`}</Code>
          </>
        )}
      </Card>

      <Card icon={Code2} color="#FFB000" title="Public API" testId="int-api">
        <p>Everything in the dashboard is available over REST. Interactive docs: <a className="text-[#00E5FF] underline" href={`${API.replace(/\/api$/, "")}/docs`} target="_blank" rel="noreferrer">/docs</a></p>
        <Code>{`POST /api/predict              {"text": "...", "language": "auto"}
POST /api/email/analyze-eml    (multipart .eml)
POST /api/voice/analyze        (multipart audio)
POST /api/threats/report       {"value": "sbi-kyc.in", "category": "kyc"}
GET  /api/threats/lookup?value=9876543210
GET  /api/threats/export?format=csv     public threat feed`}</Code>
      </Card>
    </div>
  );
}
