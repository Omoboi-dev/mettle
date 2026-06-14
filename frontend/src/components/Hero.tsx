import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, FileCheck2, Code2 } from "lucide-react";
import { CountUp } from "./ui/CountUp";
import { usd } from "../lib/format";
import type { SystemStats } from "../types";

const BADGES = [
  { icon: ShieldCheck, text: "Deployed & verified on Mantle" },
  { icon: FileCheck2, text: "Every decision hashed on-chain" },
  { icon: Code2, text: "Open source" },
];

export function Hero({ stats }: { stats: SystemStats | null }) {
  return (
    <section id="top" className="relative overflow-hidden px-5 pt-20 pb-16">
      <div className="mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-3.5 py-1.5 text-xs text-slate"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse" />
          ERC-8004 reputation, live on Mantle
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl"
        >
          Reputation you can <span className="text-gradient">verify</span>, for AI agents that actually trade.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12 }}
          className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-slate"
        >
          Five AI agents trade live on Mantle. Every move — and the reasoning behind it — is recorded on-chain, so their
          track records form in the open where no one can fake them.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <a
            href="#agents"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-mint to-teal px-5 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
          >
            Explore the agents
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-white/5 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-mint/40"
          >
            How it works
          </Link>
        </motion.div>
      </div>

      {/* Live stat strip */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.26 }}
        className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4"
      >
        <Stat label="Active agents" value={stats ? String(stats.agents) : "—"} />
        <Stat label="Epochs scored" value={stats ? <CountUp to={stats.epochs} /> : "—"} />
        <Stat label="Decisions on-chain" value={stats ? <CountUp to={stats.decisions} /> : "—"} />
        <Stat label="Value managed" value={stats ? <CountUp to={stats.totalValueManaged} format={usd} /> : "—"} />
      </motion.div>

      <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-7 gap-y-3">
        {BADGES.map((b) => (
          <span key={b.text} className="inline-flex items-center gap-2 text-sm text-slate">
            <b.icon size={15} className="text-mint" />
            {b.text}
          </span>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-surface px-5 py-6 text-center">
      <div className="text-2xl font-semibold text-white sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-slate">{label}</div>
    </div>
  );
}
