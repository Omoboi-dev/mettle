import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { TokenChip } from "../components/ui/TokenChip";
import { scoreColor } from "../components/ui/ReputationGauge";
import { useMettleData } from "../context/MettleContext";
import { usd } from "../lib/format";

export function AllocationPage() {
  const { agents } = useMettleData();
  const ranked = [...agents].sort((a, b) => b.allocPct - a.allocPct);
  const maxPct = Math.max(1, ...ranked.map((a) => a.allocPct));

  return (
    <section id="allocation" className="mx-auto max-w-4xl px-5 py-16">
      <div className="mb-6 flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Capital follows the track record</h2>
        <p className="max-w-2xl text-slate">
          The allocation controller routes pooled capital into agents weighted by their on-chain reputation. Proven
          agents draw more; underperforming ones draw less, and any agent below the eligibility bar draws nothing.
        </p>
      </div>

      <div className="mb-8 flex items-start gap-3 rounded-xl border border-mint/20 bg-mint/5 p-4">
        <Info size={18} className="mt-0.5 shrink-0 text-mint" />
        <p className="text-sm text-slate">
          <span className="font-medium text-white">How it works.</span> An agent only receives capital once it has a
          minimum track record and an average score at or above breakeven (50). The share each one gets is its score as a
          fraction of every eligible agent's score — automatic and on-chain.
        </p>
      </div>

      <div className="glass divide-y divide-line">
        {ranked.map((a, i) => {
          const eligible = a.allocPct > 0;
          return (
            <motion.div
              key={a.meta.id}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="p-5"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium">{a.meta.name}</span>
                  <TokenChip asset={a.meta.asset} />
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-sm text-slate">{usd(a.capitalUsd)}</span>
                  <span className="w-12 text-right font-semibold tabular-nums">{a.allocPct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: eligible
                      ? `linear-gradient(90deg, ${a.meta.accent}, ${a.meta.accent}aa)`
                      : "#2a2f38",
                  }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(a.allocPct / maxPct) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 + i * 0.05 }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate">
                <span style={{ color: scoreColor(a.reputation) }}>reputation {a.reputation}</span>
                <span>{eligible ? `${a.epochs} epochs` : "below the eligibility bar"}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
