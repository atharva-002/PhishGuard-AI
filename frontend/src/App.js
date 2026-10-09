import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Landing from "./pages/Landing";
import DashboardLayout from "./pages/DashboardLayout";
import Detection from "./pages/Detection";
import Analytics from "./pages/Analytics";
import Datasets from "./pages/Datasets";
import Roadmap from "./pages/Roadmap";
import Insights from "./pages/Insights";
import ThreatHub from "./pages/ThreatHub";
import EmailScan from "./pages/EmailScan";
import VoiceScan from "./pages/VoiceScan";
import Integrations from "./pages/Integrations";

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "rgba(10,15,28,0.92)",
            border: "1px solid rgba(0,229,255,0.30)",
            color: "#FFF",
            backdropFilter: "blur(12px)",
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Detection />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="datasets" element={<Datasets />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="insights" element={<Insights />} />
          <Route path="email" element={<EmailScan />} />
          <Route path="voice" element={<VoiceScan />} />
          <Route path="threats" element={<ThreatHub />} />
          <Route path="integrations" element={<Integrations />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
