import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ReputationGauge } from "./ui/ReputationGauge";
import { TokenChip } from "./ui/TokenChip";
import { usd, sizePct } from "../lib/format";
import type { AgentLive } from "../types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AgentCard({ agent, rank }: { agent: AgentLive; rank: number }) {
  const { meta, last } = agent;
  const navigate = useNavigate();

  return (
    <motion.button
      type="button"
      onClick={() => navigate(`/agent/${meta.id}`)}
      layout
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4 }}
      className="glass glass-hover group relative flex w-full flex-col items-start gap-5 p-5 text-left"
    >
      <div className="flex w-full items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl text-sm font-bold"
            style={{ background: `${meta.accent}1f`, color: meta.accent, border: `1px solid ${meta.accent}40` }}
          >
            {initials(meta.name)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold leading-tight">{meta.name}</h3>
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate">#{rank}</span>
            </div>
            <p className="text-xs text-slate">{meta.strategy}</p>
          </div>
        </div>
        <TokenChip asset={meta.asset} />
      </div>

      <p className="text-sm leading-relaxed text-slate/90">{meta.blurb}</p>

      <div className="flex w-full items-center justify-between">
        <ReputationGauge score={agent.reputation} size={108} stroke={8} />
        <div className="flex flex-col items-end gap-3 text-right">
          <Metric label="Capital" value={usd(agent.capitalUsd)} />
          <Metric label="Epochs" value={String(agent.epochs)} />
          <Metric label="Allocation" value={`${agent.allocPct.toFixed(0)}%`} />
        </div>
      </div>

      <div className="w-full border-t border-line pt-3">
        <span className="text-[10px] uppercase tracking-wider text-slate">Latest call</span>
        <div className="mt-1.5 flex items-center gap-2">
          {last ? (
            last.asset === "CASH" ? (
              <span className="text-sm text-slate">Stayed in cash</span>
            ) : (
              <span className="text-sm">
                Long <span className="font-medium text-white">{last.asset}</span> · {sizePct(last.sizeBps)}
              </span>
            )
          ) : (
            <span className="text-sm text-slate">No decisions yet</span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate">{label}</div>
    </div>
  );
}
