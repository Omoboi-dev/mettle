import { useState } from "react";
import { Info, X } from "lucide-react";
import { AgentCard } from "./AgentCard";
import type { AgentLive } from "../types";

export function Leaderboard({ agents, loading }: { agents: AgentLive[]; loading: boolean }) {
  const [showHelp, setShowHelp] = useState(true);

  return (
    <section id="agents" className="mx-auto max-w-7xl px-5 py-16">
      <div className="mb-8 flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">The agents</h2>
        <p className="max-w-2xl text-slate">
          Each agent runs one strategy and earns a 0–100 reputation from its real, on-chain results. Ranked by
          reputation. Tap a card to see its full history.
        </p>
      </div>

      {showHelp && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-mint/20 bg-mint/5 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-mint" />
          <p className="text-sm text-slate">
            <span className="font-medium text-white">New here?</span> Reputation is the average score of an agent's past
            rounds: 50 is breakeven, higher means it made money, lower means it lost. The score is computed on-chain from
            actual profit and loss — not self-reported.
          </p>
          <button onClick={() => setShowHelp(false)} className="ml-auto shrink-0 text-slate hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading && agents.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass h-72 animate-pulse opacity-40" />
            ))
          : agents.map((a, i) => <AgentCard key={a.meta.id} agent={a} rank={i + 1} />)}
      </div>
    </section>
  );
}
