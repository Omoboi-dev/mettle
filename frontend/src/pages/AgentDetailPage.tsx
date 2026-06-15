import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ReputationGauge, scoreColor } from "../components/ui/ReputationGauge";
import { TokenChip } from "../components/ui/TokenChip";
import { CopyHash } from "../components/ui/CopyHash";
import { VaultPanel } from "../components/VaultPanel";
import { useMettleData } from "../context/MettleContext";
import { addressUrl, ago, bpsPct, sizePct, txUrl, usd } from "../lib/format";

export function AgentDetailPage() {
  const { id } = useParams();
  const { agents, decisions, loading } = useMettleData();
  const agent = agents.find((a) => a.meta.id === id);

  if (loading && !agent) {
    return <div className="mx-auto max-w-4xl px-5 py-16 text-slate">Loading agent…</div>;
  }
  if (!agent) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-16">
        <p className="text-slate">Agent not found.</p>
        <Link to="/" className="mt-3 inline-flex items-center gap-2 text-mint hover:underline">
          <ArrowLeft size={16} /> Back to all agents
        </Link>
      </div>
    );
  }

  const { meta } = agent;
  const own = decisions.filter((d) => d.vault.toLowerCase() === meta.vault.toLowerCase());

  return (
    <section className="mx-auto max-w-4xl px-5 py-12">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate hover:text-white">
        <ArrowLeft size={16} /> All agents
      </Link>

      {/* Header */}
      <div className="glass flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-center">
        <ReputationGauge score={agent.reputation} size={132} />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{meta.name}</h1>
          </div>
          <p className="mt-1 text-sm text-slate">{meta.strategy}</p>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate/90">{meta.blurb}</p>
          <a
            href={addressUrl(meta.vault)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate hover:text-mint"
          >
            Vault {meta.vault.slice(0, 8)}…{meta.vault.slice(-4)} <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Reputation" value={String(agent.reputation)} color={scoreColor(agent.reputation)} />
        <Stat label="Epochs scored" value={String(agent.epochs)} />
        <Stat label="Capital managed" value={usd(agent.capitalUsd)} />
        <Stat label="Allocation" value={`${agent.allocPct.toFixed(0)}%`} />
      </div>

      {/* Invest */}
      <div className="mt-4">
        <VaultPanel vault={meta.vault} agentName={meta.name} />
      </div>

      {/* Decision history */}
      <h2 className="mb-4 mt-10 text-lg font-semibold">Decision history</h2>
      {own.length === 0 ? (
        <div className="glass p-8 text-center text-slate">No on-chain decisions loaded for this agent yet.</div>
      ) : (
        <div className="space-y-3">
          {own.map((d) => {
            const isCash = d.asset === "CASH";
            return (
              <div key={`${d.txHash ?? d.vault}-${d.timestamp}`} className="glass p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm">
                      {isCash ? (
                        <span className="text-slate">Stayed in cash</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          Long <TokenChip asset={d.asset} /> · {sizePct(d.sizeBps)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 max-w-lg text-sm italic text-white/85">“{d.rationaleURI}”</p>
                    <span className="mt-1 block text-xs text-slate">{ago(d.timestamp)}</span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isCash ? "#94a3b8" : d.moveBps >= 0 ? "#3df5c0" : "#f0617a" }}
                    >
                      {isCash ? "—" : bpsPct(d.moveBps)}
                    </span>
                    <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(d.score) }}>
                      {d.score}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <CopyHash value={d.rationaleHash} label="rationale hash" />
                  {d.txHash && (
                    <a
                      href={txUrl(d.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-slate hover:text-mint"
                    >
                      View transaction <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="glass p-4">
      <div className="text-xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="mt-0.5 text-xs uppercase tracking-wider text-slate">{label}</div>
    </div>
  );
}
