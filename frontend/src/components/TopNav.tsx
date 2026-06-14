import { Activity } from "lucide-react";

const LINKS = [
  { href: "#agents", label: "Agents" },
  { href: "#decisions", label: "Decisions" },
  { href: "#allocation", label: "Allocation" },
  { href: "#how", label: "How it works" },
];

export function TopNav({ live }: { live: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-mint to-teal text-ink">
            <Activity size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Mettle</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-slate transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1.5 text-xs text-slate sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-mint" : "bg-slate"} ${live ? "animate-pulse" : ""}`} />
            {live ? "Live on Mantle Sepolia" : "Connecting…"}
          </span>
        </div>
      </div>
    </header>
  );
}
