# Nansen CLI — Reference & Integration Guide

## What Is Nansen

Nansen is a blockchain analytics platform with a CLI/API designed for AI agents and developers. It processes **500TB+ data daily**, labels **400M+ addresses**, and tracks **1,000+ entities** across **25+ chains** including Solana, Ethereum, Base, Arbitrum, and more.

- **Install:** `agents.nansen.ai`
- **GitHub:** `github.com/nansen-ai/nansen-cli`
- **Docs:** `docs.nansen.ai`
- **Auth:** API key from `app.nansen.ai/auth/agent-setup`
- **Pricing:** Pay-as-you-go credits at $0.001/credit. Most calls: 1–5 credits. Search: free.

---

## CLI Structure

```
nansen research <category> [options]
nansen trade [quote|execute]
nansen wallet [create|list|show|export|delete|send]
```

### Research Categories

| Command | Alias | What it gives you |
|---|---|---|
| `smart-money` | `sm` | Holdings, netflow, DEX trades, perp trades, DCAs, historical holdings |
| `token` | `tgm` | Token screener — price, volume, smart money participation, holder distribution |
| `profiler` | `prof` | Wallet deep-dive: PnL, portfolio, related addresses, entity labels |
| `portfolio` | `port` | Current holdings + DeFi positions |
| `prediction-market` | `pm` | Prediction market data |
| `perp` | | Hyperliquid perp leaderboards |
| `search` | | Free search across tokens, entities, addresses |
| `points` | | Reward/loyalty tracking |

### Output Formats

- `--output json` — structured for agents
- `--output pretty` — human-readable
- `--output table` — tabular
- `--output ndjson` — streaming (large result sets)

---

## Key Endpoints

### Smart Money

Tracks historically profitable traders and institutional funds on-chain.

```bash
# Smart money holdings for a token on Solana
nansen research sm holdings --chain solana --token <mint_address>

# Net capital flows into/out of a token
nansen research sm netflow --chain solana --token <mint_address>

# Recent DEX trades by smart money wallets
nansen research sm dex-trades --chain solana --limit 50

# Perpetual trades (Hyperliquid)
nansen research sm perp-trades

# DCA strategies (Jupiter on Solana)
nansen research sm dcas --chain solana
```

**Smart money categories you can filter by:**
- `Fund` — institutional/VC funds
- `Smart Trader 30D / 90D / 180D` — wallets that outperformed over each window
- Profitable Hyperliquid traders

---

### Token God Mode (Screener)

```bash
# Screen tokens with smart money participation
nansen research tgm screener --chain solana --sort smart_money_inflow

# Fields returned per token:
# price, market_cap, liquidity, FDV
# buy/sell volume, unique traders
# netflow, inflow/outflow ratio
# top holder percentages + entity labels
```

**Healthy token signals (reference thresholds):**
- Top 10 holders < 40% of supply
- Liquidity: $100K+ (memecoins), $1M+ (established)
- Smart money inflow trending positive

---

### Profiler (Wallet Intelligence)

```bash
# Deep-dive on a wallet
nansen research prof --address <wallet_address>

# Returns:
# Entity label (exchange, fund, market maker, notable investor, degen)
# Portfolio overview + DeFi positions
# PnL by token
# Historical balance snapshots
# Transaction history + counterparty analysis
# Related addresses (first funder, signers, deployed contracts)
```

---

### Prediction Markets (Polymarket Analytics)

Nansen tracks Polymarket specifically. All subcommands take `--market-id` or `--address`.

| Subcommand | What it returns |
|---|---|
| `market-screener` | Browse/filter active prediction markets |
| `event-screener` | Browse/filter prediction market events |
| `ohlcv` | Price candles for a market by ID |
| `orderbook` | Live orderbook for a market |
| `top-holders` | Biggest position holders in a market |
| `trades-by-market` | All trades on a specific market |
| `trades-by-address` | All prediction market trades by a wallet |
| `pnl-by-market` | PnL leaderboard for everyone in a market |
| `pnl-by-address` | Win rate + PnL history for a specific bettor |
| `position-detail` | Current open positions in a market |
| `categories` | All prediction market categories |

```bash
# Screen active prediction markets
nansen research prediction-market market-screener --query "bitcoin"

# Screen events
nansen research prediction-market event-screener --query "election"

# PnL and win rate for a Polymarket bettor
nansen research prediction-market pnl-by-address --address 0x...

# All trades by a whale wallet on Polymarket
nansen research prediction-market trades-by-address --address 0x...

# Top holders (biggest positions) in a market
nansen research prediction-market top-holders --market-id <id>

# All trades on a specific market
nansen research prediction-market trades-by-market --market-id <id>

# Price history for a market
nansen research prediction-market ohlcv --market-id <id>

# PnL leaderboard for a market
nansen research prediction-market pnl-by-market --market-id <id>

# All categories available
nansen research prediction-market categories
```

**Note on `pnl-by-address`:** This directly gives Polymarket bettor win rates — replaces building this manually (see issue #035).

---

### Profiler (Wallet Intelligence)

Full schema available via `nansen schema research`:

```bash
# PnL summary for a wallet
nansen research profiler pnl-summary --address 0x... --chain ethereum --days 30

# Entity labels (fund, smart trader, degen, exchange, etc.)
nansen research profiler labels --address 0x... --chain ethereum

# Current token holdings
nansen research profiler balance --address 0x... --chain ethereum

# Transaction history
nansen research profiler transactions --address 0x... --chain ethereum --days 30

# Top counterparties by volume
nansen research profiler counterparties --address 0x... --chain ethereum --days 30

# Related wallets (first funder, co-signers, deployed contracts)
nansen research profiler related-wallets --address 0x... --chain ethereum

# Batch profile multiple addresses (pipe a list)
nansen research profiler batch --chain ethereum --include labels,balance
```

---

### Search (Free)

```bash
# Search tokens, entities, addresses — no credits consumed
nansen research search --query "SOL"
nansen research search --query "0x..."
```

---

## MCP Integration

Nansen exposes **24 tools** via Model Context Protocol (MCP) using JSON-RPC 2.0 over HTTP with SSE streaming. This means you can give an LLM agent direct access to all Nansen data as tools — no CLI subprocess needed.

MCP server endpoint: configured via `app.nansen.ai/auth/agent-setup`

---

## Historical Data Limits

| Resolution | Max lookback |
|---|---|
| Minute-level | ~130 minutes |
| Hourly | ~50 hours |
| Daily | ~50 days |

---

## Integration Opportunities in pnldotfun

### 1. On-chain Signal Collector (`packages/collectors/src/onchain/`)

This replaces the planned "90 wallet registry / tx-parser output" on-chain stream from ARCHITECTURE.md. Instead of building custom Solana transaction streaming, use Nansen's already-labeled smart wallets.

**New signal types to write to `signals` table:**

| Nansen endpoint | Signal type | Frequency |
|---|---|---|
| `sm dex-trades` (Solana) | `ONCHAIN_WHALE_TRADE` | Every 5min |
| `sm netflow` (Solana) | `TOKEN_NETFLOW` | Every 30min |
| `sm holdings` (Solana) | `SMART_MONEY_POSITION` | Every 2h |
| `tgm screener` (Solana) | `SMART_MONEY_TOKEN` | Every 1h |

**Signal shape (same as existing collectors):**

```typescript
{
  source: 'ONCHAIN',
  type: 'ONCHAIN_WHALE_TRADE' | 'TOKEN_NETFLOW' | 'SMART_MONEY_POSITION' | 'SMART_MONEY_TOKEN',
  topic: string,           // token symbol or name
  weight: 1-10,            // scaled by USD value or smart money count
  metadata: {              // Nansen-specific fields
    token_address: string,
    smart_money_category: string,
    usd_value: number,
    chain: 'solana',
    // ... other Nansen fields
  },
  processed: false
}
```

**File to create:** `packages/collectors/src/onchain/nansen.ts`

---

### 2. Analyst Brain Enrichment (Tool Calling)

The analyst already uses tool calling mid-analysis to fetch live Polymarket odds. Two new tools can be registered in `packages/brain/src/analyst-tools/nansen.tools.ts`:

**Tool A — `nansen_wallet_intelligence`**

```typescript
// Input:  { address: string }
// Calls:  prediction-market pnl-by-address + profiler labels
// Output: win_rate, total_pnl, label (fund/smart_trader/degen), trade_count
// Use:    when analyst sees a WHALE_BET signal — "is this bettor credible?"
```

**Tool B — `nansen_token_context`**

```typescript
// Input:  { token_address: string, chain: string }
// Calls:  token recent-flows-summary
// Output: smart_money_netflow, whale_netflow, exchange_flow, public_figure_flow
// Use:    when analyst clusters a crypto market narrative (BTC/SOL/ETH price bets)
//         — "what is smart money doing on-chain?"
```

**Note:** `nansen_wallet_intelligence` uses `pnl-by-address` from the prediction-market endpoint — this replaces the manual win rate tracking in issue #035.

---

### 3. Publisher Brain Enrichment

When publisher picks narratives with token signals, it can call `sm netflow` to add a "smart money flow" data point to the narrative `actions` array or `signals_snapshot`.

---

### 4. Token Screener as Pull Signal

Run `tgm screener` every hour, diff against previous snapshot, emit `SMART_MONEY_TOKEN` signal when a Solana token crosses a threshold (e.g. smart money inflow > $500K in 1h). This is a new signal surface with no Polymarket equivalent.

---

## Hackathon Narrative

> "Our feed combines Polymarket prediction market whale bets + Nansen on-chain smart money signals → narrative intelligence that no one else has."

Minimum viable integration for hackathon (before Mar 22):

1. `nansen.ts` collector polling smart money DEX trades on Solana every 5min
2. Writes `ONCHAIN` signals to Supabase (same shape — analyst picks them up automatically)
3. No brain changes needed — analyst already reads all unprocessed signals

---

## Reference Issues

- `docs/issues/042-nansen-polymarket-client.md` — Polymarket client via Nansen CLI
- `docs/issues/043-nansen-smart-money-intelligence.md` — Smart money signal collector
