# VISION: pnldotfun

## What Is pnldotfun?

**pnldotfun** is an intelligent wallet layer for Solana. It learns who you are from your transaction history and acts on your behalf.

Think of it as **"your wallet's second brain"** — it understands your trading patterns, anticipates your needs, and executes on your behalf.

---

## The Problem

**Current crypto UX is transactional, not intelligent.**

When you use a dapp today:

- You click → it executes
- You ask → it answers
- No memory between sessions
- No understanding of who you are

**The result:** Thousands of apps, all treating you like a stranger.

---

## The Vision

**Every wallet should have an agent that knows it.**

```
Your Wallet ←→ pnldotfun Agent
                   │
                   ├── Learns your patterns
                   ├── Remembers your preferences
                   ├── Acts proactively
                   └── Serves you (and only you)
```

### What This Enables

| Feature | Today (Static) | With pnldotfun (Intelligent) |
|---------|----------------|------------------------------|
| Portfolio check | You open 3 apps to see SPL + perps + LP | "Hey, your SOL is up 5%" |
| Trading | You find the DEX, check prices, execute | "SOL is cheap. Buy 2?" |
| Alerts | Generic notifications for everyone | "XYZ just pumped — you own 10% of it" |
| Insights | None | "You're 60% degen, 40% LP. Consider rebalancing." |

---

## Two Modes of Operation

### 1. Consumer Mode (For End Users)

The agent serves humans:

```
User says:    "What's my trading style?"
Agent does:   Parses last 50 txs → Identifies patterns → Responds:
              "You do 60% degen swaps on Jup, 40% LP on Meteora.
               You're a swing trader with average hold of 12 days."
```

**Capabilities:**

- Voice-first interface (Alexa-style)
- Learns from transaction history
- Proactive notifications (not just alerts, but *relevant* alerts)
- Personalized recommendations

### 2. Service Mode (For Other Agents)

The agent serves AI agents:

```
Other agent asks:  "What is wallet X's trading profile?"
pnldotfun checks:  x402 payment received
Response:          "Wallet X is a degen meme trader.
                   80% of volume on degen coins.
                   Average position: $50-$200.
                   Sells at +50% or -30%."
```

**Capabilities:**

- x402 micropayment endpoint
- Indexed wallet profiles
- Queryable trading history
- Notification subscription service

---

## Why Now?

### The Timing Is Right

1. **Solana is processing 50M+ tx/day** — massive data to learn from
2. **AI agents are maturing** — LLMs can understand transaction patterns
3. **x402 is emerging** — standardized micropayments for agent services
4. **Voice interfaces are improving** — natural language with agents

### The Gap

- 100+ portfolio apps exist, all static
- 100+ trading bots exist, all reactive
- **No one** is building the intelligent layer that learns and adapts

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      pnldotfun                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  tx-parser       │    │   agent-core     │              │
│  │  (standalone)    │    │  (intelligence)  │              │
│  │                  │    │                  │              │
│  │  • Fetch txs     │    │  • User profiles │              │
│  │  • Parse types   │    │  • Proactive     │              │
│  │  • Normalize     │    │    alerts        │              │
│  └──────────────────┘    │  • x402 service  │              │
│                          └──────────────────┘              │
│                                  │                          │
│                          ┌───────▼───────┐                  │
│                          │  Voice Layer  │                  │
│                          │  (frontend)   │                  │
│                          └───────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### packages/tx-parser

**Purpose:** Parse any Solana wallet, identify transaction types, output structured data.

**What it recognizes:**

- DEX swaps (Jup, Raydium, Orca, Meteora)
- Perpetual positions (Drift, Pacific, Mango)
- LP provision (Meteora, Raydium, Sanctum)
- NFT mints/transfers
- DeFi interactions (Kamino, Solend, etc.)

**Output:**

```typescript
interface WalletProfile {
  wallet: string;
  summary: {
    traderType: 'degen' | 'lp' | 'holder' | 'whale' | 'mixed';
    dexPreference: string[];
    activityLevel: 'low' | 'medium' | 'high';
    riskProfile: 'conservative' | 'moderate' | 'aggressive';
  };
  transactions: ParsedTransaction[];
}
```

### packages/agent-core

**Purpose:** Intelligence layer that uses tx-parser and adds value.

**Capabilities:**

- **Profile Learning:** Builds user model from tx history
- **Proactive Alerts:** Monitors tracked wallets, sends relevant notifications
- **x402 Service:** Exposes data to other agents for micropayments
- **Voice Interface:** Natural language interaction

---

## The Differentiator

Every crypto app has:

- Transaction execution ✓
- Portfolio display ✓
- Charts and analytics ✓

**pnldotfun adds:**

- **Memory** — remembers who you are
- **Intelligence** — learns from your behavior
- **Proactivity** — acts before you ask
- **Service Layer** — enables other agents

The voice interface is the **interaction model**, not the product. The product is the intelligence layer underneath.

---

## Long-Term Roadmap

### Phase 1 (Now)

- ✅ tx-parser (standalone)
- ✅ agent-core (basic profiling)
- Advanced user modeling

### Phase 2 (Next)

- ⏳ x402 service layer
- Multi-wallet aggregation

### Phase 3 (Future)

- Predictive insights ("You're likely to sell within 48h based on history")
- Portfolio optimization ("Your LP impermanent loss risk is high. Rebalance?")
- Agent-to-agent coordination

---

## Success Metrics

| Metric | How We Measure |
|--------|----------------|
| **User understanding** | % of tx types correctly classified |
| **Proactive value** | User engagement with alerts |
| **Service revenue** | x402 payments from other agents |
| **Voice adoption** | % of queries via voice vs manual |

---

## References

- **Repo:** <https://github.com/bucketshop69/pnldotfun>
- **Colosseum Agent:** pnldotfunagent (ID: 1065)
- **Related Projects:**
  - AgentPay (agent-to-agent payments)
  - Oracle Sentinel (prediction markets)
  - SIDEX (perp futures trading)

---

*Last updated: Feb 9, 2026*
