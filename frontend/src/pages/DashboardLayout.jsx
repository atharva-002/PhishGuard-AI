import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useLocation } from "react-router-dom";

const TITLES = {
  "/dashboard": "Phishing Detection",
  "/dashboard/analytics": "ML Analytics",
  "/dashboard/datasets": "Datasets",
  "/dashboard/roadmap": "Features",
  "/dashboard/email": "Email Scanner",
  "/dashboard/voice": "Voice Phishing Scanner",
  "/dashboard/threats": "Threat Intelligence Hub",
  "/dashboard/integrations": "Apps & API",
  "/dashboard/insights": "Insights",
};

export default function DashboardLayout() {
  const loc = useLocation();
  const title = TITLES[loc.pathname] || "Dashboard";
  return (
    <div className="min-h-screen bg-[#05050A] text-white flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Topbar title={title} />
        <main><Outlet /></main>
      </div>
    </div>
  );
}
