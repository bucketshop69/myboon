# Pacifica Hackathon Submission — myboon

---

## One-Sentence Pitch

myboon is a multi-agent AI that turns prediction market and on-chain signals into scored narratives and lets you act on them instantly — perps, swaps, and predictions in one app.

---

## What does your project do? What problem does it solve? Who is it for?

myboon is a narrative intelligence app for on-chain traders and prediction market participants.

Markets don't move on data — they move on narratives. But finding the signal in 200+ markets, whale wallets, and social feeds is impossible manually. Traders either miss the move or drown in noise.

myboon solves this with a multi-agent AI brain that runs 24/7. Polymarket collectors track odds shifts, whale bets, and market discovery. An Analyst agent clusters these signals into scored narratives every 15 minutes. A Publisher agent stress-tests them and surfaces only what matters — directly to your feed.

Then you act. See a narrative about BTC momentum? Open a perp position on Pacifica. Spot a geopolitical shift? Bet on Polymarket. All without leaving the app.

Four tabs — Feed, Trade, Predict, Swap. One intelligence layer connecting them.

Built on Solana, powered by Pacifica for perpetuals, launching exclusively on Solana Seeker. The feed is the moat — everything else exists because it earns trust.

---

## Core Functionality / Key Features

- **Narrative Intelligence Feed** — Multi-agent AI brain watches prediction markets and on-chain data 24/7, clusters signals into scored narratives, and surfaces only what matters
- **Signal to Trade** — See a narrative, act on it instantly — perps via Pacifica, predictions via Polymarket, swaps via Jupiter — 3 taps from insight to position
- **Gasless Trading** — All perpetual trades relayed through Pacifica's relayer — users never pay gas
- **Solana Seeker Exclusive** — Mobile-first, built for Seeker with MWA wallet integration, targeting dApp Store launch
- **x402 Intelligence API** *(planned)* — Micropayment-gated API on Solana so other agents and apps can pay-per-call for our narrative intelligence and signal data

---

## What makes this unique? Differentiator vs existing tools or approaches.

What makes myboon unique is the feed. Crypto moves fast — new narratives, whale bets, odds shifts — and no one has time to watch it all. Our AI brain does that for you and delivers only what matters, scored and ready to act on. The app itself is deliberately simple — no dashboards, no chart overload. One feed, one tap to trade. Simple enough that someone new to crypto can open it and immediately know what's happening and what to do about it.

---

## How does your project use Pacifica's infrastructure?

myboon uses Pacifica in two ways — as an intelligence source and as an execution layer.

**Intelligence:** Pacifica's perpetuals data — open interest shifts, funding rates, volume spikes across 50+ markets — feeds directly into our AI brain as raw signals. When BTC open interest surges or funding flips negative, that's a narrative signal. Our Analyst agent picks it up, clusters it with prediction market and on-chain data, scores it, and surfaces it to users through the feed and our X account. This kind of perps data changes daily and tells a story that most retail traders miss — myboon makes sure they don't.

**Execution:** Pacifica's SDK powers the entire Trade tab. Real-time WebSocket prices, order placement, position management — TP/SL, close, live PnL — all through Pacifica's API. Gasless via their relayer, so users never pay gas. The signal-to-trade loop is seamless — see a narrative about ETH momentum in your feed, tap through, open a position on Pacifica without leaving the app.

---

## Is there a live app, dashboard, or UI we can access?

Android APK available on request — built with Expo for Solana Seeker. Demo video included with submission. Source: github.com/bucketshop69/myboon

Website: myboon.tech

---

## Why would users adopt this in production?

Crypto traders today are spread across five apps — one for news, one for on-chain alerts, one for prediction markets, one for perps, one for swaps. They're stitching together their own workflow manually and still missing moves because the signal was in a Polymarket odds shift they didn't see or a whale bet they didn't track.

myboon replaces that entire stack with one feed. You open the app, the AI has already done the work — scanned the markets, clustered the signals, scored the narratives. You read what matters, tap to act. No context switching, no second app.

The adoption case is simple: traders who use myboon will consistently see narratives earlier and act faster than those who don't. In crypto, that's the only edge that matters.

---

## If you had more time, what would you build or improve next?

We're actively building — this isn't a hackathon-only project. The core system is live and we're improving it daily. Next priorities: expanding our signal sources beyond Polymarket into Kalshi, on-chain wallet tracking, and X sentiment. Refining the AI brain — adding multi-agent consensus where two analysts must agree before a narrative reaches the feed, reducing noise further. On the product side, enabling live trade execution on Pacifica mainnet and launching on the Solana dApp Store for Seeker. In parallel, we're building our X presence (@myboonapp) as a distribution channel — the same AI brain that powers the feed auto-drafts posts, growing our audience before the app is publicly available. We're not stopping here.

---

## Links

- **Website:** https://www.myboon.tech/
- **GitHub:** https://github.com/bucketshop69/myboon
- **X:** https://x.com/myboonapp
- **Demo Video:** apps/video/out/myboon-demo.mp4
