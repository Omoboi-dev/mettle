# Mettle

Mettle is an on-chain reputation layer for AI trading agents. Five autonomous agents each run their own strategy on Mantle, and every move they make is settled and scored on-chain — together with the reasoning behind it. Over time each agent earns a transparent 0–100 track record that anyone can verify, and capital is routed toward the agents that have actually earned it.

Mettle in one sentence: instead of asking you to trust an agent's marketing, Mettle makes the agent prove itself, in public, trade by trade.

## The problem it solves

"AI trading agent" is one of the easiest things in the world to fake. Anyone can post a screenshot of a green P&L curve, claim an impressive win rate, or wrap a coin-flip in confident language. There is usually no way to tell a genuinely good strategy from a lucky one, or from an outright lie — and by the time you can, your money is already in.

Mettle removes the need to trust any of that. An agent doesn't get to tell you it's good; it has to demonstrate it where no one can edit the result:

- Its trades happen on-chain, inside a vault it cannot withdraw from.
- Its score is computed on-chain from realized profit and loss, not self-reported.
- Its reasoning for every decision is fingerprinted on-chain, so it can't be rewritten after the outcome is known.

What you're left with is a reputation you can audit yourself.

## How it works

Each agent owns one vault. A scoring round (an "epoch") runs like this:

1. **Read the market.** An off-chain service pulls real recent prices for each tradable asset.
2. **Decide.** A language model, prompted to act as that agent's strategy, picks one asset to go long for the round and a size — or chooses to sit in cash. It returns a short rationale in its own voice.
3. **Risk-check.** Off-chain risk limits cap the size, reject low-conviction or malformed calls, and force cash when nothing fits. Nothing reaches the chain unchecked.
4. **Settle on-chain.** The vault opens an epoch, runs the trade through a simple on-chain market, lets the real market move play out, and closes back to cash.
5. **Score.** The vault measures its own realized USD profit and loss for the round and maps it to a 0–100 score (50 is breakeven). It writes that score to the validation registry.
6. **Build reputation.** Scores accumulate into a track record. A separate allocation controller can then route pooled capital toward the agents whose records clear a minimum bar — and away from the underperforming ones.

The agent's rationale is hashed and the hash stored alongside the score, so the words it used to justify a trade are locked in before anyone knows whether the trade worked.

## The core idea: the vault is the validator

Mettle is built on [ERC-8004](https://eips.ethereum.org/), the standard for on-chain agent identity, reputation, and validation. ERC-8004 gives agents an identity (an NFT) and a place to record validation results, but it leaves open the hard question: *who validates a trading agent honestly?*

Mettle's answer is that the vault validates itself, and it can't cheat while doing so. Between epochs the vault holds nothing but USD, so its starting and ending balances are unambiguous. The difference between them is realized profit and loss — there is no oracle to trick and no subjective judgement to game. The vault opens its own ERC-8004 validation request at the start of an epoch and answers it with the measured score at the end. The score is therefore as trustworthy as arithmetic.

This is what makes the reputation meaningful rather than decorative: it is derived, on-chain, from money that genuinely moved.

## The agents and assets

Five agents ship in the seed deployment, each mapped to a Mantle-native asset:

| Agent | Strategy | Asset |
| --- | --- | --- |
| Momentum Alpha | Rides strong trends | mETH |
| Breakout Hunter | Buys breakouts from ranges | fBTC |
| Volatility Harvester | Trades large swings | MNT |
| Steady Yield | Capital preservation | USDY |
| Mean Reversion | Fades overextended moves | MI4 (a Mantle index) |

On testnet the assets are mock ERC-20s priced through Mettle's own market contract, so rounds are deterministic and self-contained. The off-chain brain still reasons over *real* recent price action for the corresponding assets (ETH, BTC, MNT, and a BTC/ETH/SOL blend for the index), sourced from Bybit with a CoinGecko fallback.

## What's in here

- **IdentityRegistry** — ERC-721 identities for agents (the ERC-8004 identity layer).
- **ReputationRegistry** — append-only feedback records keyed to an agent.
- **ValidationRegistry** — validation requests and responses; holds each epoch's score and can summarize an agent's record filtered to a chosen validator.
- **StrategyVault** — a non-custodial, single-agent vault that trades, measures its own realized P&L, and writes its score. The heart of the system.
- **VaultFactory** — launches an agent (mints its identity and deploys its official vault) and tracks which vaults are official.
- **Market** — a minimal on-chain venue that swaps between USD and the tradable tokens at a settable price.
- **AIRunner** — the on-chain operator that takes an AI decision (asset, size, real move, rationale URI and hash), drives one epoch through a vault, and logs the decision.
- **AllocationController** — a pooled USD index that routes capital into official vaults weighted by validation score, behind track-record and quality gates.
- **agent/** — the off-chain service: market data, the model-driven decision brain, the risk layer, and the round runner that executes decisions on-chain.

## Repository layout

```
src/
  IdentityRegistry.sol        ERC-721 agent identities (ERC-8004 identity)
  ReputationRegistry.sol      append-only feedback per agent
  ValidationRegistry.sol      validation requests/responses; holds scores
  StrategyVault.sol           non-custodial vault; the "vault is the validator"
  VaultFactory.sol            launches agents and their official vaults
  Market.sol                  minimal USD <-> token swap venue
  AIRunner.sol                runs one AI decision through a vault, on-chain
  AllocationController.sol    routes pooled capital by validation score
  interfaces/                 registry and market interfaces
  mocks/MockERC20.sol         testnet tokens
script/
  Deploy.s.sol                full-stack deploy + seeds five agents
test/                         Foundry tests for vaults, registries, runner, allocation
agent/
  src/config.ts               chain, addresses, assets, strategy personas, risk limits
  src/market.ts               real price feeds (Bybit primary, CoinGecko fallback)
  src/brain.ts                the model-driven decision per agent
  src/risk.ts                 off-chain risk checks before anything goes on-chain
  src/run.ts                  one full round: decide, check, execute, record
deployed.json                 live Mantle Sepolia addresses
```

## Running it

### Contracts

```shell
forge build
forge test
```

Deploy the full stack and seed the five agents:

```shell
forge script script/Deploy.s.sol --rpc-url mantle_sepolia --account deployer --broadcast --verify
```

### The agent service

```shell
cd agent
npm install
cp .env.example .env   # fill in the LLM endpoint + the operator key
npm run round
```

`npm run round` reads the market, asks the model for each agent's move, runs the risk checks, executes each decision on-chain, and writes a full record of the round (decisions, rationales, scores, transaction hashes) to `agent/rationales/`.

The runner uses a dedicated, low-risk operator key. The operator controls only the AIRunner, and the AIRunner is non-custodial — it can trade inside vaults but can never move anyone's funds out — so this key is deliberately separate from the deployer.

## Live deployment (Mantle Sepolia, chain 5003)

Explorer: https://sepolia.mantlescan.xyz

Core contracts:

| Contract | Address |
| --- | --- |
| Market | `0xba61bbdc03c3df64e256186c5187e52b09262dc2` |
| IdentityRegistry | `0xd279d843ccc1908bbf1f470fe37e2b22155300b1` |
| ReputationRegistry | `0xcd474c41a48ffa6b6296899827f8b274e1c0a56d` |
| ValidationRegistry | `0xd4296d8ced0644fa29615e3d342853ee955e696a` |
| VaultFactory | `0x6c5f6f0e683dad2b318b78d0eb1bef816f55d895` |
| AIRunner | `0xb3b1a270be197a46ab2c63c41e700fdb07be7f6e` |
| AllocationController | `0x5843d11bb0d95cb16ce1ba1fa9448ffac5fcbef5` |

Agent vaults:

| Agent | Vault |
| --- | --- |
| Momentum Alpha | `0x5fe4cdd6c12712968cb90a6e513417d55c0f8cdd` |
| Breakout Hunter | `0x0f3e55fd68a17ad653f51f810728b0c8a60cdf8f` |
| Volatility Harvester | `0x1d665641a18ed29efd6377af56f4510f3f53cd31` |
| Steady Yield | `0xda2392671d08e7f15cad73697ff54cd03755a02b` |
| Mean Reversion | `0x3ea332055fef9545191bff1a11f7eac20cb2141b` |

All token, core, and vault addresses are kept in `deployed.json`.

## Why it's hard to cheat

A reputation system is only as good as the things it refuses to be fooled by. The vault is built to be donation-proof and self-contained:

- **Scores come from accounted P&L, never `balanceOf`.** Someone sending USD straight to a vault cannot inflate its score or its share price.
- **Capital is ring-fenced per epoch.** Only the capital the vault accounts for can be traded; donated tokens can't enter the trade flow.
- **The agent can trade your money but never take it.** The vault has no path to send funds to an arbitrary address — tokens only move vault → market → vault.
- **Allocation reads filtered scores.** The controller counts only a vault's own self-validations and gates on a minimum track record and score, so one lucky epoch or a fabricated score can't draw capital.

## Roadmap

- Allocation-driven competition where capital continuously chases the best live records.
- Richer strategy personas and multi-asset positions per round.
- A swap to live on-chain venues and real assets beyond the testnet mocks.
- A public transparency dashboard for watching agents decide, score, and earn capital in real time.

## License

MIT.
