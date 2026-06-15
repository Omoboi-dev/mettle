# Architecture

This document describes how Mettle is put together: the contracts, the off-chain service that drives them, the data flow of a scoring round, the scoring math, and the design choices that keep the reputation honest. It is meant to match the shipped code in `src/` and `agent/`.

## System overview

Mettle has two halves that meet at a single contract call.

```
                          off-chain                              on-chain (Mantle)
        ┌─────────────────────────────────────────┐   ┌──────────────────────────────────────┐
        │  market.ts   prices (Bybit -> CoinGecko) │   │  AIRunner ── drives ──> StrategyVault │
        │     │                                    │   │     │                       │        │
        │     v                                    │   │     │  startEpoch / trade / settle     │
        │  brain.ts    model picks asset+size      │   │     v                       v        │
        │     │        + rationale                 │   │  Market (price)        ValidationRegistry
        │     v                                    │   │                              ^        │
        │  risk.ts     caps size / forces cash     │   │  VaultFactory            score in     │
        │     │                                    │   │  (official vaults)           │        │
        │     v                                    │   │                       AllocationController
        │  run.ts ──── runEpochAI(...) ────────────┼──>│                       (capital by score)
        └─────────────────────────────────────────┘   └──────────────────────────────────────┘
```

The off-chain service decides *what* an agent should do and why. The on-chain contracts decide *what actually happened* and turn it into a score that nobody can edit. The boundary between them is one function — `AIRunner.runEpochAI` — and everything downstream of that call is trustless.

## On-chain components

### IdentityRegistry (ERC-8004 identity)

An ERC-721 registry. Each agent is a token; the token owner is the agent's owner. Vaults read `ownerOf(agentId)` to recognise the owner, and the rest of the system keys reputation and validation to the agent's numeric id. This is the identity layer of ERC-8004.

### ReputationRegistry

An append-only feedback log keyed to an agent id. It records reputation entries over time and is the standard ERC-8004 reputation surface. Scoring in Mettle flows primarily through validation (below); reputation is the broader history attached to an identity.

### ValidationRegistry

The scoring ledger. It supports the ERC-8004 request/response pattern:

- `validationRequest(operator, agentId, requestURI, requestHash)` opens a validation for an agent. Only the agent's operator may open one.
- `validationResponse(requestHash, score, responseURI, responseHash, tag)` answers it with a 0–100 score and references to the off-chain reasoning.
- `getSummary(agentId, validators, tag)` returns `(count, avg)` over responses, **filtered to a given set of validators**. This filter is what lets the rest of the system trust a score: it can ask "what is this agent's average, counting only validations from *this specific vault*," and ignore any rogue self-scores from elsewhere.

### StrategyVault — the vault is the validator

The most important contract. One vault belongs to one agent. It is non-custodial: depositors get shares, the agent's `trader` key may swap vault funds between USD and whitelisted tokens, but no key — not the trader, not the owner — can send vault funds to an arbitrary address. Funds only move vault → Market → vault.

**Internal accounting is the source of truth, not token balances.** The vault tracks:

- `totalManagedUSD` — principal in/out adjusted by realized epoch P&L. Share price and scoring read this, never `usd.balanceOf`, so a direct USD donation cannot inflate either.
- `tradableUSD` — the USD ring-fenced as spendable in the current epoch. Set to the epoch's starting managed USD; donated USD is not included.
- `accountedHoldings[token]` — units of each token the vault actually bought. Sells move this ledger, and the "is the vault flat?" check reads it (not `balanceOf`), so a dust donation of a token can neither be sold nor used to brick the vault.
- `epochTradePnL` — realized P&L accumulated from the USD legs of trades this epoch: buying debits it by the USD spent, selling credits it by the USD received. Donations never touch it.

**The epoch lifecycle:**

1. `startEpoch(requestURI)` — requires the vault to be flat (all positions closed), snapshots `epochStartUSD = totalManagedUSD`, ring-fences `tradableUSD`, marks the epoch active, and opens the vault's own ERC-8004 validation request via `validationRequest`. Because the vault is the agent's operator, it is allowed to open the request, and it names *itself* as validator.
2. `trade(tokenIn, tokenOut, amountIn, minAmountOut)` — the `trader` key swaps through the Market, checking each side against the ring-fenced ledgers and updating `tradableUSD`, `accountedHoldings`, and `epochTradePnL`.
3. `settleEpoch(responseURI, responseHash)` — requires the vault flat again, reads `realizedPnL = epochTradePnL`, maps it to a score, rolls the P&L into `totalManagedUSD` (clamped at zero), marks the epoch inactive, and answers its own validation request with the score via `validationResponse`.

Between epochs the vault holds only USD, which is exactly why the snapshots are unambiguous and the P&L is real.

### The scoring function

Score maps realized percentage return onto `[0, 100]`, centred at 50 for breakeven:

```solidity
returnBps = (pnl * 10_000) / startUSD;   // realized return in basis points
score     = 50 + returnBps / 100;        // returnBps/100 == percent return
// clamped to [0, 100]
```

So a +50% round scores 100, breakeven scores 50, and −50% (or worse) scores 0. The score is a `uint8`. One consequence worth stating plainly: because the score is whole-number percentage return centred at 50, a round that deploys a small fraction of the book into a small real move barely moves the score off 50. Large, dramatic scores require large moves at large size — they are not manufactured.

### Market

A minimal swap venue between USD and the tradable tokens at a price the deployer/operator can set. On testnet this stands in for a live DEX and keeps rounds deterministic: AIRunner sets the price to a base, has the vault buy, applies the round's real market move to the price, and has the vault sell — so the vault's realized P&L reflects that move, scored honestly through the same `settleEpoch` path a real venue would use.

### VaultFactory

`launchAgent` mints an agent's identity, deploys its official StrategyVault, and wires the vault as the agent's operator so it can open and answer its own validations. The factory records which vaults are official (`isOfficialVault`), which is the anti-impersonation primitive the AllocationController relies on.

### AIRunner

The on-chain operator that turns one AI decision into one scored epoch. `runEpochAI(vault, asset, sizeBps, moveBps, rationaleURI, rationaleHash)`:

1. Rejects sizes above 100% (`sizeBps > 10_000`).
2. Opens the epoch on the vault.
3. If size is non-zero, computes the trade amount as a fraction of the vault's tradable USD, sets the Market price to base, buys the asset, applies the clamped real move (±50% cap), and sells back to USD.
4. Settles the epoch and captures the resulting score.
5. Records the decision (`asset`, `sizeBps`, `moveBps`, `score`, `rationaleHash`, `rationaleURI`, `epoch`, `timestamp`) in `lastDecision[vault]` and emits `DecisionExecuted`.

The runner is `onlyOwner`, owned by the off-chain operator key. It is non-custodial by construction: every effect it has on funds goes through the vault's own ring-fenced, non-custodial logic. A leaked operator key can make agents trade; it cannot withdraw anyone's money.

### AllocationController

A pooled USD index that routes capital toward proven agents. It is the hands-off way to back the whole book: a depositor calls `deposit(amount)` and receives index shares representing a pro-rata claim on total NAV (idle USD plus the value of every deployed position); `withdraw(shares)` burns shares and pays out from idle USD. `allocate(candidates, amount)` deploys idle USD into official vaults weighted by each agent's validation score, and `recall(vaults)` pulls deployed capital back to idle. Eligibility (`_eligibleWeight`) returns a vault's weight only if **all** of the following hold:

- the vault is official (`factory.isOfficialVault`);
- it is not mid-epoch;
- its average score, **read filtered to itself as the only validator**, clears `minScore`;
- it has at least `minEpochs` settled epochs.

Otherwise its weight is zero. The candidate list must be strictly ascending (unique and bounded) so the allocation loop can't be gas-bricked, NAV is computed donation-proof from each vault's `totalAssets`, and both `allocate` and `recall` only touch vaults between epochs (deposits/withdrawals are frozen while a vault's epoch is active). `renounceOwnership` is disabled so allocation can never be permanently frozen.

**Auto-rebalance.** `deposit`/`withdraw`/`recall` are permissionless, but `allocate` is `onlyOwner`. The off-chain runner (as owner) calls `recall` then `allocate` after every round, so the index continuously re-weights toward the agents whose latest scores are strongest — a deposit "follows performance" without anyone choosing an agent. This is the one privileged step in the index; it can only *route* pooled capital among official vaults, never withdraw it to an external address.

## Off-chain components (`agent/`)

The service is TypeScript (run with `tsx`), using `viem` for chain access and an OpenAI-compatible client for the model.

### market.ts

Loads real recent price context per asset. Bybit spot klines are the primary feed; CoinGecko is the fallback for networks where Bybit is blocked. CoinGecko calls are de-duplicated and spaced out to respect its rate limit. For each asset it returns:

- `contextCloses` — the hourly closes the model is allowed to see.
- `realizedMoveBps` — the move over a held-out window *after* the context (48 hours by default), which the model does **not** see and which the on-chain round is scored against. This is a genuine out-of-sample holdout: the model decides on data up to a cutoff, and is judged on what the market did over the next two days. MI4 is an equal-weight BTC/ETH/SOL blend; USDY is modelled as a near-flat yield line. Any asset whose feed fails degrades to a flat series rather than breaking the round.

### brain.ts

For each agent, builds a system prompt from the agent's strategy persona and a compact feature summary (trend, recent move, volatility) of each asset's context, and asks the model to return a single JSON decision: `{ asset, sizeBps, conviction, rationale }`, or `CASH`. The response is parsed defensively — anything malformed falls back to cash. The model never sees the held-out move, so it cannot "decide" with hindsight.

### risk.ts

The safeguard between the model and the chain. It forces cash on an explicit cash call, on conviction below the minimum, or on an unknown asset. For a valid trade it sizes the position by the agent's conviction — scaling from a minimum position at the conviction floor up to a full book at maximum confidence — so a confident read takes real risk while a marginal one stays small. It returns the validated decision plus a list of any adjustments it made, for transparency, and clamps the realized move to the same range the on-chain runner enforces.

### run.ts

Orchestrates one round. It loads the operator account, confirms the operator owns the AIRunner, reads the market, and then for each agent: asks the brain, runs the risk checks, resolves the on-chain asset and the move it will be scored against, simulates `runEpochAI` (which yields the resulting score and guards against a revert), sends it, and waits for the receipt. The on-chain step is wrapped in a retry that rotates across RPC endpoints, so a transient failure on one public node doesn't sink the round. Every decision — call, rationale, validated size, move, score, and transaction hash — is printed and saved to `agent/rationales/round-*.json`.

After the round it calls `rebalanceIndex`, which (if the operator owns the AllocationController) recalls the index's deployed capital and re-allocates idle USD across the eligible vaults by their fresh scores. This step is defensive — it checks ownership, skips cleanly when there's nothing to deploy, and swallows any error so the round is never jeopardised by the index. Set `ROUND_INTERVAL_MINUTES` (or use `npm run loop`) to run round-then-rebalance on a timer; the loop logs and survives a failed cycle and continues on the next tick.

## Data flow of one round

1. `run.ts` calls `market.loadMarket()` → real context and a held-out realized move per asset.
2. For each agent, `brain.decide(...)` → a JSON decision and rationale from the model.
3. `risk.validate(...)` → a checked decision (asset or cash, capped size, adjustment flags).
4. `run.ts` resolves the on-chain asset address and the clamped realized move, and derives `rationaleURI` (truncated rationale) and `rationaleHash = keccak256(rationale)`.
5. `AIRunner.runEpochAI(...)` runs `startEpoch → trade → trade → settleEpoch` on the vault.
6. `StrategyVault.settleEpoch` computes realized P&L, maps it to a score, and writes it to the ValidationRegistry, naming itself validator.
7. The score is now part of the agent's on-chain record, and `AllocationController` can read it (filtered to that vault) when routing capital.
8. `run.ts` then rebalances the index: `AllocationController.recall(...)` pulls deployed capital back to idle, and `allocate(...)` re-deploys it across the eligible vaults weighted by the scores from this round — so pooled deposits track the latest performance automatically.

## Trust model and anti-gaming

The design assumes the off-chain brain could be wrong, biased, or adversarial, and that anyone can send tokens to any contract. It defends the *reputation* against all of that:

- **Scores are arithmetic on accounted P&L.** No oracle, no `balanceOf`, no self-report. Donations move nothing that matters.
- **Capital is ring-fenced per epoch**, so only accounted funds can be traded, and the vault is verified flat (by the accounted ledger) at both ends.
- **The reasoning is committed before the outcome is known.** The rationale hash is stored at decision time; the words can't be changed to fit the result.
- **Allocation trusts only filtered, gated scores.** Official-vault-only, self-validation-only, with track-record and quality minimums — so a lucky epoch or a fabricated score draws no capital.
- **Operator power is bounded.** The operator can make agents trade and route the index's pooled capital among official vaults; the non-custodial vaults and the controller's allocate-only authority mean it can never take funds out to an external address.

## Deployment and seeding

`script/Deploy.s.sol` deploys the full stack and seeds five agents. For each, it launches the agent and its official vault through the factory, deposits seed USD, and runs an opening epoch through `AIRunner.runEpochAI` with a representative move, giving each agent an initial, differentiated track record in the registries. The live Mantle Sepolia (chain 5003) addresses are recorded in `deployed.json` and listed in the README.
