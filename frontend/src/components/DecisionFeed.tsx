import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, ShieldCheck, Search } from "lucide-react";
import { TokenChip } from "./ui/TokenChip";
import { CopyHash } from "./ui/CopyHash";
import { scoreColor } from "./ui/ReputationGauge";
import { RefreshControl } from "./ui/RefreshControl";
import { ago, bpsPct, sizePct, txUrl } from "../lib/format";
import { AGENTS } from "../data/agents";
import type { DecisionView } from "../types";

type TypeFilter = "All" | "Trades" | "Cash";

const PAGE_SIZE = 10;

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function accentFor(name: string) {
  return AGENTS.find((a) => a.name === name)?.accent ?? "#94a3b8";
}

export function DecisionFeed({ decisions, loading }: { decisions: DecisionView[]; loading: boolean }) {
  const [agent, setAgent] = useState("All");
  const [type, setType] = useState<TypeFilter>("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return decisions.filter((d) => {
      if (agent !== "All" && d.agentName !== agent) return false;
      if (type === "Trades" && d.asset === "CASH") return false;
      if (type === "Cash" && d.asset !== "CASH") return false;
      if (query && !`${d.agentName} ${d.asset} ${d.rationaleURI}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [decisions, agent, type, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter change can shrink the list below the current page — clamp back into range.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  // Any filter/search change jumps back to the first page.
  useEffect(() => {
    setPage(1);
  }, [agent, type, query]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goTo = (p: number) => {
    setPage(p);
    document.getElementById("decisions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="decisions" className="mx-auto max-w-5xl px-5 py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse" />
          Live decision log
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Every decision, in the open</h2>
        <p className="mt-3 max-w-2xl text-balance text-slate">
          The live record of what each agent did and why. Every rationale is fingerprinted on-chain, so no one, not
          even us, can rewrite an agent's reasoning after the result is known.
        </p>
        <div className="mt-5">
          <RefreshControl />
        </div>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-mint/20 bg-mint/5 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-mint" />
        <p className="text-sm text-slate">
          <span className="font-medium text-white">Why this matters.</span> Each card links to the on-chain transaction
          and shows the hash of the agent's reasoning. The words were committed before the market move was known, so the
          track record can't be doctored in hindsight.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-white/5 p-0.5">
          {(["All", "Trades", "Cash"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                type === t ? "bg-mint/15 text-mint" : "text-slate hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-white outline-none focus:border-mint/40"
        >
          <option value="All">All agents</option>
          {AGENTS.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="relative flex-1 sm:min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rationales…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate/70 focus:border-mint/40"
          />
        </div>
      </div>

      {loading && decisions.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass h-28 animate-pulse opacity-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass p-10 text-center text-slate">No decisions match these filters.</div>
      ) : (
        <div className="space-y-3">
          {loading && (
            <p className="text-center text-xs text-slate">Showing the latest, loading full on-chain history…</p>
          )}
          <AnimatePresence initial={false}>
            {paged.map((d) => (
              <DecisionRow key={`${d.txHash ?? d.vault}-${d.timestamp}`} d={d} />
            ))}
          </AnimatePresence>

          {pageCount > 1 && (
            <Pagination page={page} pageCount={pageCount} total={filtered.length} onGoTo={goTo} />
          )}
        </div>
      )}
    </section>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  onGoTo,
}: {
  page: number;
  pageCount: number;
  total: number;
  onGoTo: (p: number) => void;
}) {
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="flex flex-col items-center gap-3 pt-6 sm:flex-row sm:justify-between">
      <span className="text-xs text-slate">
        Showing {from}–{to} of {total} decisions
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onGoTo(page - 1)}
          disabled={page === 1}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-sm text-slate transition-colors hover:border-mint/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Prev
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onGoTo(p)}
            aria-current={p === page ? "page" : undefined}
            className={`h-8 w-8 rounded-lg text-sm tabular-nums transition-colors ${
              p === page
                ? "bg-mint/15 font-semibold text-mint"
                : "border border-line bg-white/5 text-slate hover:border-mint/40 hover:text-white"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onGoTo(page + 1)}
          disabled={page === pageCount}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-sm text-slate transition-colors hover:border-mint/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function DecisionRow({ d }: { d: DecisionView }) {
  const accent = accentFor(d.agentName);
  const isCash = d.asset === "CASH";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="glass p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold"
            style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}40` }}
          >
            {initials(d.agentName)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.agentName}</span>
              {isCash ? (
                <span className="text-sm text-slate">stayed in cash</span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-slate">
                  went long <TokenChip asset={d.asset} /> · {sizePct(d.sizeBps)}
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-[15px] italic leading-relaxed text-white/90">“{d.rationaleURI}”</p>
            <span className="mt-1 block text-xs text-slate">{ago(d.timestamp)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5 sm:flex-col sm:items-end sm:gap-1">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate">Real move</div>
            <div
              className="text-sm font-semibold"
              style={{ color: isCash ? "#94a3b8" : d.moveBps >= 0 ? "#3df5c0" : "#f0617a" }}
            >
              {isCash ? "—" : bpsPct(d.moveBps)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate">Score</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: scoreColor(d.score) }}>
              {d.score}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate">
          <ShieldCheck size={13} className="text-mint" /> Reasoning hashed on-chain
        </span>
        <CopyHash value={d.rationaleHash} label="rationale hash" />
        {d.txHash && (
          <a
            href={txUrl(d.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white/5 px-2 py-1 text-[11px] text-slate transition-colors hover:border-mint/40 hover:text-white"
          >
            View transaction <ExternalLink size={11} />
          </a>
        )}
      </div>
    </motion.div>
  );
}
