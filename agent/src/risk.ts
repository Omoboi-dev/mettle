import { RISK } from "./config.js";
import type { Decision } from "./brain.js";

/// A decision that has passed risk checks. `symbol === null` means stay in cash this round.
export type ValidatedDecision = {
  symbol: string | null;
  sizeBps: number;
  flags: string[]; // any adjustments the validator made, for transparency
};

/// Enforce the risk limits before a decision is ever executed on-chain: cap the size, drop
/// low-conviction or malformed calls to cash, and reject unknown assets. This is the safeguard
/// against a runaway or nonsensical model output.
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

  // Clamp the size into the allowed range.
  let sizeBps = Math.round(Number(decision.sizeBps));
  if (!Number.isFinite(sizeBps) || sizeBps < 0) {
    flags.push("invalid size -> cash");
    return { symbol: null, sizeBps: 0, flags };
  }
  if (sizeBps > RISK.maxSizeBps) {
    flags.push(`size ${sizeBps} capped to ${RISK.maxSizeBps}`);
    sizeBps = RISK.maxSizeBps;
  }
  if (sizeBps === 0) {
    return { symbol: null, sizeBps: 0, flags };
  }

  return { symbol: decision.asset, sizeBps, flags };
}

/// Keep a price move inside the on-chain score range, mirroring AIRunner's own clamp.
export function clampMove(moveBps: number): number {
  if (moveBps > RISK.maxMoveBps) return RISK.maxMoveBps;
  if (moveBps < -RISK.maxMoveBps) return -RISK.maxMoveBps;
  return Math.round(moveBps);
}
