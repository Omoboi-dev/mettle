import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Menu, X } from "lucide-react";
import { useMettleData } from "../context/MettleContext";
import { ConnectButton } from "./ConnectButton";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/decisions", label: "Decisions" },
  { to: "/allocation", label: "Allocation" },
  { to: "/how-it-works", label: "How it works" },
];

export function TopNav() {
  const { live } = useMettleData();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-mint to-teal text-ink">
            <Activity size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Mettle</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3.5 py-2 text-[15px] font-medium transition-colors ${
                  isActive ? "bg-white/5 text-white" : "text-slate hover:text-white"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ConnectButton />
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white/5 text-slate md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-line/70 md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-3">
              {LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive ? "bg-white/5 text-white" : "text-slate hover:text-white"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="mt-2 px-3 sm:hidden">
                <ConnectButton />
              </div>
              <span className="mt-2 flex items-center gap-2 px-3 py-1 text-xs text-slate">
                <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-mint animate-pulse" : "bg-slate"}`} />
                {live ? "Live on Mantle Sepolia" : "Connecting…"}
              </span>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
