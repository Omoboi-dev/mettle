import { TopNav } from "./components/TopNav";
import { Hero } from "./components/Hero";
import { Leaderboard } from "./components/Leaderboard";
import { useMettle } from "./hooks/useMettle";
import { CORE } from "./data/deployment";
import { addressUrl } from "./lib/format";

export default function App() {
  const { agents, stats, loading, live } = useMettle();

  return (
    <div className="min-h-screen">
      <TopNav live={live} />
      <main>
        <Hero stats={stats} />
        <Leaderboard agents={agents} loading={loading} />
      </main>

      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-slate sm:flex-row">
          <span>Mettle — trustless reputation for AI trading agents on Mantle.</span>
          <div className="flex items-center gap-5">
            <a href={addressUrl(CORE.AIRunner)} target="_blank" rel="noreferrer" className="hover:text-white">
              AIRunner
            </a>
            <a href={addressUrl(CORE.ValidationRegistry)} target="_blank" rel="noreferrer" className="hover:text-white">
              ValidationRegistry
            </a>
            <a href={addressUrl(CORE.AllocationController)} target="_blank" rel="noreferrer" className="hover:text-white">
              AllocationController
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
