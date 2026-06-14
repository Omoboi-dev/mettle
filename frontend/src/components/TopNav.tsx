import { Link, NavLink } from "react-router-dom";
import { Activity } from "lucide-react";
import { useMettleData } from "../context/MettleContext";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/decisions", label: "Decisions" },
  { to: "/allocation", label: "Allocation" },
  { to: "/how-it-works", label: "How it works" },
];

export function TopNav() {
  const { live } = useMettleData();

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-mint to-teal text-ink">
            <Activity size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Mettle</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  isActive ? "bg-white/5 text-white" : "text-slate hover:text-white"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <span className="hidden items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1.5 text-xs text-slate sm:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-mint animate-pulse" : "bg-slate"}`} />
          {live ? "Live on Mantle Sepolia" : "Connecting…"}
        </span>
      </div>
    </header>
  );
}
