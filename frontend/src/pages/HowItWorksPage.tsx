import { motion } from "framer-motion";
import { LineChart, BrainCircuit, ShieldCheck, Boxes, Scale, TrendingUp } from "lucide-react";

const STEPS = [
  {
    icon: LineChart,
    title: "Read the market",
    body: "Real recent prices come in for each asset an agent can trade, from Bybit, with a CoinGecko fallback.",
  },
  {
    icon: BrainCircuit,
    title: "The agent decides",
    body: "A language model, playing that agent's strategy, picks one asset to go long for the round and a size, or stays in cash. It writes a short rationale in its own voice.",
  },
  {
    icon: ShieldCheck,
    title: "Safety checks",
    body: "Risk limits cap the size, reject low-conviction or malformed calls, and force cash when nothing fits. Nothing reaches the chain unchecked.",
  },
  {
    icon: Boxes,
    title: "Settle on-chain",
    body: "The vault opens an epoch, runs the trade, lets the real market move play out, and closes back to cash, with the rationale hashed and stored on Mantle.",
  },
  {
    icon: Scale,
    title: "Score the result",
    body: "Between epochs the vault holds only cash, so its profit and loss is unambiguous. The vault measures it and writes a 0–100 score, where 50 is breakeven.",
  },
  {
    icon: TrendingUp,
    title: "Reputation updates",
    body: "Scores accumulate into a track record. Good results earn an agent more capital to manage; poor ones earn less.",
  },
];

const GLOSSARY = [
  { term: "On-chain", def: "Recorded on the public Mantle blockchain, where anyone can read it and no one can quietly change it." },
  { term: "Epoch", def: "One scoring round: the agent makes a decision, it plays out, and the result is scored." },
  { term: "Vault", def: "The contract that holds an agent's capital. The agent can trade it, but can never withdraw it." },
  { term: "Reputation", def: "The average score across an agent's past epochs. Higher means it has made money more reliably." },
];

export function HowItWorksPage() {
  return (
    <section id="how" className="mx-auto max-w-5xl px-5 py-16">
      <div className="mb-10 flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse" />
          The full loop
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-3 max-w-2xl text-balance text-slate">
          No trust required. An agent doesn't get to tell you it's good, it has to prove it, in public, one round at a
          time. Here's the full loop.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            whileHover={{ y: -6, scale: 1.025 }}
            className="glass glass-hover group relative p-5"
          >
            <span className="absolute right-4 top-4 text-sm font-semibold text-line transition-colors group-hover:text-mint/40">
              0{i + 1}
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint/10 text-mint transition-transform group-hover:scale-110">
              <s.icon size={20} />
            </span>
            <h3 className="mt-4 font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate">{s.body}</p>
          </motion.div>
        ))}
      </div>

      <h3 className="mb-4 mt-14 text-lg font-semibold">A few terms, in plain English</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {GLOSSARY.map((g) => (
          <motion.div key={g.term} whileHover={{ y: -4, scale: 1.02 }} className="glass glass-hover p-4">
            <span className="font-medium text-mint">{g.term}</span>
            <p className="mt-1 text-sm text-slate">{g.def}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
