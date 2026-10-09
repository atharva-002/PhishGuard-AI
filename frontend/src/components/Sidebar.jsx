import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, BarChart3, Database, Rocket, Brain, Home, Mail, Mic, ShieldAlert, Puzzle } from "lucide-react";
import Logo from "./Logo";

const NAV = [
  { to: "/dashboard", label: "Detection", icon: LayoutDashboard, id: "detection" },
  { to: "/dashboard/email", label: "Email Scanner", icon: Mail, id: "email" },
  { to: "/dashboard/voice", label: "Voice Scanner", icon: Mic, id: "voice" },
  { to: "/dashboard/threats", label: "Threat Hub", icon: ShieldAlert, id: "threats" },
  { to: "/dashboard/analytics", label: "ML Analytics", icon: Brain, id: "analytics" },
  { to: "/dashboard/datasets", label: "Datasets", icon: Database, id: "datasets" },
  { to: "/dashboard/integrations", label: "Apps & API", icon: Puzzle, id: "integrations" },
  { to: "/dashboard/roadmap", label: "Features", icon: Rocket, id: "roadmap" },
  { to: "/dashboard/insights", label: "Insights", icon: BarChart3, id: "insights" },
];

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-white/5 glass-strong h-screen sticky top-0" data-testid="dashboard-sidebar">
      <div className="px-6 py-6 border-b border-white/5">
        <Link to="/"><Logo /></Link>
      </div>
      <nav className="flex-1 px-3 py-6 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            data-testid={`nav-${item.id}`}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-[rgba(0,229,255,0.10)] text-[#00E5FF] border border-[rgba(0,229,255,0.25)]"
                : "text-[#A1A1AA] hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-white/5">
        <Link
          to="/"
          data-testid="sidebar-home-link"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#A1A1AA] hover:text-[#00E5FF] hover:bg-white/5 transition-colors"
        >
          <Home size={16} />Back to Landing
        </Link>
      </div>
    </aside>
  );
}
