import Anthropic from "@anthropic-ai/sdk";
import type { AssetMarket } from "./market.js";

export type Decision = {
  asset: string; // a tradable symbol, or "CASH" to sit out
  sizeBps: number; // fraction of the book to deploy (0..10000)
  conviction: number; // Claude's confidence, 0..1
  rationale: string; // the call in the agent's voice
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/// Summarize an asset's recent action into a few plain features Claude can reason over.
function features(closes: number[]): string {
  const first = closes[0];
  const last = closes[closes.length - 1];
  const window = closes.length;
  const recentFrom = closes[Math.max(0, window - 6)];
  const totalPct = ((last / first - 1) * 100).toFixed(2);
  const recentPct = ((last / recentFrom - 1) * 100).toFixed(2);

  // Step-to-step volatility (stdev of hourly returns), as a percent.
  const rets: number[] = [];
  for (let i = 1; i < window; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const volPct = (Math.sqrt(variance) * 100).toFixed(2);

  return `${window}h trend ${totalPct}%, last 6h ${recentPct}%, hourly volatility ${volPct}%`;
}

export async function decide(
  strategyName: string,
  persona: string,
  market: AssetMarket[],
): Promise<Decision> {
  const symbols = market.map((m) => m.symbol);

  const table = market
    .map((m) => `- ${m.symbol}: ${features(m.contextCloses)}`)
    .join("\n");

  const system =
    `You are an autonomous on-chain trading agent running the "${strategyName}" strategy on Mantle.\n` +
    `${persona}\n\n` +
    `Each round you pick ONE asset to go long for the next hour, sized as a fraction of your book, ` +
    `or you stay in CASH if nothing fits your strategy. You only go long (no shorting). Be disciplined: ` +
    `sitting in cash is better than forcing a weak trade. Size reflects conviction and risk.`;

  const user =
    `Here is the recent market read for each asset you can trade:\n${table}\n\n` +
    `Decide this round. Choose one of: ${symbols.join(", ")}, or CASH. ` +
    `Submit your decision with the tool.`;

  const decisionTool: Anthropic.Tool = {
    name: "submit_decision",
    description: "Submit this agent's trade decision for the round.",
    input_schema: {
      type: "object",
      properties: {
        asset: {
          type: "string",
          enum: [...symbols, "CASH"],
          description: "The asset to go long this round, or CASH to stay out.",
        },
        sizeBps: {
          type: "integer",
          minimum: 0,
          maximum: 10_000,
          description: "Fraction of the book to deploy, in basis points (0 if CASH, 10000 = full).",
        },
        conviction: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Your confidence in this call, 0 to 1.",
        },
        rationale: {
          type: "string",
          description: "One or two sentences explaining the call, in your strategy's voice.",
        },
      },
      required: ["asset", "sizeBps", "conviction", "rationale"],
    },
  };

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system,
    tools: [decisionTool],
    tool_choice: { type: "tool", name: "submit_decision" },
    messages: [{ role: "user", content: user }],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Claude did not return a decision");
  }
  return block.input as Decision;
}
