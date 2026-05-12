# Handoff — 2026-03-09

## Hackathon Sprint — COMPLETE

The hackathon build is done. All core layers are live and the submission is ready.

### What's Live

| Layer | Component | Status |
|-------|-----------|--------|
| Layer 0 | Polymarket Collector — discovery, stream, whale tracker | Live on VPS |
| Layer 1 | Analyst — clusters signals → narratives (every 15min) | Live on VPS |
| Layer 2 | Publisher — stress-tests → publishes to feed (every 30min) | Live on VPS |
| API | Hono server — /narratives, /predict/*, /predict/sports/* | Live on VPS :3000 |
| Mobile | Expo app — Feed, Predict, Swap, Trade tabs | Built (hybrid-expo) |

### Submission Assets
- `docs/ARCHITECTURE-DIAGRAM.md` — Mermaid system diagram for video
- `docs/demo-script.md` — 7-frame pitch script with voiceover
- `apps/hybrid-expo/eas.json` — dapp-store APK build profile ready
- App rebranded: **myboon** (`xyz.myboon.app`)

---

## What's Next (post-hackathon)

1. **APK build** — `eas build --profile dapp-store --platform android`, back up keystore immediately
2. **Feed quality loop** — evaluate published narratives against outcomes and tighten scoring/editor rules
3. **On-chain signals** — Jupiter swap stream, whale wallet tracker feeding into signals table
4. **x402 monetisation** — Feed API pay-per-call on Solana
5. **Predict/Trade UI polish** — wire up live data, order flow

---

## Credentials (in .env files only — never committed)

All credentials live in:

- `packages/collectors/.env`
- `packages/brain/.env`
- `packages/api/.env`

All gitignored. See MEMORY.md for values if needed.
