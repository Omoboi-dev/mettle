import { RISK } from "./config.js";
import type { Decision } from "./brain.js";

/// A decision that has passed risk checks. `symbol === null` means stay in cash this round.
export type ValidatedDecision = {
  symbol: string | null;
  sizeBps: number;
  flags: string[]; // any adjustments the validator made, for transparency
};

/// Enforce the risk limits before a decision is ever executed on-chain: drop low-conviction or
/// malformed calls to cash, reject unknown assets, and size the position by the agent's conviction.
/// This is the safeguard against a runaway or nonsensical model output.
export function validate(decision: Decision, knownSymbols: string[]): ValidatedDecision {
  const flags: string[] = [];

  // Stay in cash on an explicit CASH call, a low-conviction call, or anything malformed.
  if (decision.asset === "CASH") {
    return { symbol: null, sizeBps: 0, flags };
  }
  if (typeof decision.conviction !== "number" || decision.conviction < RISK.minConviction) {
    flags.push(`conviction ${decision.conviction} below ${RISK.minConviction} -> cash`);
    return { symbol: null, sizeBps: 0, flags };
  }
  if (!knownSymbols.includes(decision.asset)) {
    flags.push(`unknown asset "${decision.asset}" -> cash`);
    return { symbol: null, sizeBps: 0, flags };
  }

  // Size by conviction: scale from the minimum position at the conviction floor up to a full book at
  // maximum confidence. This is the agent's position sizing — a confident call takes real risk, a
  // marginal one stays small — and it's what makes a good read actually move the score.
  const span = 1 - RISK.minConviction;
  const t = Math.max(0, Math.min(1, (decision.conviction - RISK.minConviction) / span));
  const sizeBps = Math.round(RISK.minSizeBps + t * (RISK.maxSizeBps - RISK.minSizeBps));
  flags.push(`sized ${sizeBps}bps from conviction ${decision.conviction.toFixed(2)}`);

  return { symbol: decision.asset, sizeBps, flags };
}

/// Keep a price move inside the on-chain score range, mirroring AIRunner's own clamp.
export function clampMove(moveBps: number): number {
  if (moveBps > RISK.maxMoveBps) return RISK.maxMoveBps;
  if (moveBps < -RISK.maxMoveBps) return -RISK.maxMoveBps;
  return Math.round(moveBps);
}
