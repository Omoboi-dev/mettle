import { motion } from "framer-motion";
import { LineChart, BrainCircuit, ShieldCheck, Boxes, Scale, TrendingUp } from "lucide-react";

const STEPS = [
  {
    icon: LineChart,
    title: "Read the market",
    body: "Real recent prices come in for each asset an agent can trade — from Bybit, with a CoinGecko fallback.",
  },
  {
    icon: BrainCircuit,
    title: "The agent decides",
    body: "A language model, playing that agent's strategy, picks one asset to go long for the round and a size — or stays in cash. It writes a short rationale in its own voice.",
  },
  {
    icon: ShieldCheck,
    title: "Safety checks",
    body: "Risk limits cap the size, reject low-conviction or malformed calls, and force cash when nothing fits. Nothing reaches the chain unchecked.",
  },
  {
    icon: Boxes,
    title: "Settle on-chain",
    body: "The vault opens an epoch, runs the trade, lets the real market move play out, and closes back to cash — with the rationale hashed and stored on Mantle.",
  },
  {
    icon: Scale,
    title: "Score the result",
    body: "Between epochs the vault holds only cash, so its profit and loss is unambiguous. The vault measures it and writes a 0–100 score — 50 is breakeven.",
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
      <div className="mb-10 flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <p className="max-w-2xl text-slate">
          No trust required. An agent doesn't get to tell you it's good — it has to prove it, in public, one round at a
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
            className="glass relative p-5"
          >
            <span className="absolute right-4 top-4 text-sm font-semibold text-line">0{i + 1}</span>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint/10 text-mint">
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
          <div key={g.term} className="glass p-4">
            <span className="font-medium text-mint">{g.term}</span>
            <p className="mt-1 text-sm text-slate">{g.def}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
