import OpenAI from "openai";
import type { AssetMarket } from "./market.js";

export type Decision = {
  asset: string; // a tradable symbol, or "CASH" to sit out
  sizeBps: number; // fraction of the book to deploy (0..10000)
  conviction: number; // the model's confidence, 0..1
  rationale: string; // the call in the agent's voice
};

function client(): OpenAI {
  return new OpenAI({
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
  });
}

const CASH: Decision = {
  asset: "CASH",
  sizeBps: 0,
  conviction: 0,
  rationale: "Could not read a clean decision from the model, so sitting this round out in cash.",
};

/// Summarize an asset's recent action into a few plain features the model can reason over.
function features(closes: number[]): string {
  const first = closes[0];
  const last = closes[closes.length - 1];
  const window = closes.length;
  const recentFrom = closes[Math.max(0, window - 6)];
  const totalPct = ((last / first - 1) * 100).toFixed(2);
  const recentPct = ((last / recentFrom - 1) * 100).toFixed(2);

  const rets: number[] = [];
  for (let i = 1; i < window; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const volPct = (Math.sqrt(variance) * 100).toFixed(2);

  return `${window}h trend ${totalPct}%, last 6h ${recentPct}%, hourly volatility ${volPct}%`;
}

/// Pull the first JSON object out of a model response (handles stray prose or code fences).
function parseDecision(text: string): Decision {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return CASH;
  try {
    const raw = JSON.parse(match[0]) as Partial<Decision>;
    return {
      asset: String(raw.asset ?? "CASH"),
      sizeBps: Number(raw.sizeBps ?? 0),
      conviction: Number(raw.conviction ?? 0),
      rationale: String(raw.rationale ?? ""),
    };
  } catch {
    return CASH;
  }
}

export async function decide(
  strategyName: string,
  persona: string,
  market: AssetMarket[],
  homeAsset?: string,
): Promise<Decision> {
  const symbols = market.map((m) => m.symbol);
  const table = market.map((m) => `- ${m.symbol}: ${features(m.contextCloses)}`).join("\n");

  // Each agent knows the market it specializes in, but weighs it on equal terms with the rest —
  // it picks its home asset only when that's genuinely the best call this round, otherwise it
  // takes the better opportunity. No forced preference.
  const homeLine =
    homeAsset && symbols.includes(homeAsset)
      ? `You specialize in ${homeAsset}, but evaluate every asset on its merits this round. ` +
        `Your home asset has no built-in advantage: trade ${homeAsset} when it is the best fit for ` +
        `your strategy, otherwise take the stronger opportunity, or stay in CASH.\n\n`
      : "";

  const system =
    `You are an autonomous on-chain trading agent running the "${strategyName}" strategy on Mantle.\n` +
    `${persona}\n\n` +
    homeLine +
    `Each round you pick ONE asset to go long for the next hour, sized as a fraction of your book, ` +
    `or you stay in CASH if nothing fits your strategy. You only go long (no shorting). Sitting in ` +
    `cash is better than forcing a weak trade; size reflects conviction and risk.\n\n` +
    `Reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:\n` +
    `{"asset": "<one of: ${symbols.join(", ")}, or CASH>", "sizeBps": <integer 0-10000>, ` +
    `"conviction": <number 0-1>, "rationale": "<one short sentence in your voice>"}`;

  const user = `Recent market read:\n${table}\n\nDecide this round and return the JSON.`;

  try {
    const resp = await client().chat.completions.create({
      model: process.env.LLM_MODEL ?? "qwen/qwen-2.5-7b-instruct",
      temperature: 0.6,
      max_tokens: 500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? "";
    return parseDecision(text);
  } catch (err) {
    console.warn(`  ! model call failed: ${(err as Error).message} — staying in cash`);
    return CASH;
  }
}
