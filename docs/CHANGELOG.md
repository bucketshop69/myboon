# Changelog

All notable changes are documented here, newest first.

---

## 2026-04-02

### feat(hybrid-expo): Pacific perps Trade tab — full UI (#053)

**New screens:**
- `/trade` — `TradeListScreen`: trending asset strip (top 6 by |24h%|) + full markets table (symbol, price, 24h%, OI). Skeleton loader + error state.
- `/trade/[symbol]` — `MarketDetailScreen`: hero zone (live price via WebSocket, 4 timeframes, mark/funding/OI/maxLev stats) + Market tab + Profile tab.

**Market tab (order zone):**
- Size + Order Type inputs (static, Phase 1)
- Leverage slider (visual, 1–10×)
- Order preview chips (Notional, Fee, Liq Price)

**Profile tab:**
- Wallet card — equity, margin used, available (live from `getAccountInfo` when connected)
- PnL stats placeholder (awaiting Pacific trade history endpoint)
- Open positions — live from `getPositions`, with unrealised PnL calc

**Action dock (V2 UX):**
- Pinned above nav at thumb zone — always reachable
- Not connected: "Connect Wallet" full-width button
- Connected: param chips (Size · Lev · Liq) + side-by-side Short/Long 44px buttons

**Technical:**
- `perps.api.ts` — direct Pacific REST, no `@myboon/shared` dep (not in hybrid-expo)
- `usePerpsWebSocket.ts` — RN-native global WebSocket hook; bypasses `isomorphic-ws`
- Border radii unified to 8px across posRow, walletCard, statsPlaceholder

---

### feat(web): Apple-style sticky scroll — features + newsroom inline (#058)

- `FeaturesScroll`: sticky phone (left 40%) + 4 feature panels scrolling past it. Phone screen crossfades via `AnimatePresence` as user scrolls through feed → predict → trade → swap.
- `FeaturePanel`: each panel `whileInView` animates in from right (`x: 40 → 0`). Mobile: collapses to full-width stacked layout.
- `NewsroomSection`: newsroom canvas embedded inline as page climax — no navigation required.
- `HeroSection`: Framer Motion stagger entrance (logo → headline → subline → CTA → icons → phone group).
- `PhoneFrame`: `AnimatePresence mode="wait"` crossfade on `activeTab` change.
- `page.tsx`: `HeroSection` → `FeaturesScroll` → `NewsroomSection` — page now fully scrollable.
- `/world`: deprecation banner added; route kept alive.
- Removed `Press_Start_2P` font (unused, ~100KB payload eliminated).
- Added `framer-motion` dependency.

---

## Previous

See git log for earlier changes (`git log --oneline`).
