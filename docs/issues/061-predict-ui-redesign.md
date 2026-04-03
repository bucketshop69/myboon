# #061 — Predict UI Redesign

## Problem

The current Predict UI is functional but minimal:
- List screen: working cards but no price history, no discovery beyond curated list
- Detail screen: text-only odds, no chart, no order flow, no live refresh
- No way to discover trending markets outside the curated/sports categories

## Depends On

- **#059 done** — Dome migration
- **#060 done** — API enhancements (trending endpoint, live price poll, history contract)

## Goal

Three focused improvements to the existing screens. No new routes. No order execution (stays locked behind "Connect Wallet" CTA — that's a separate issue).

---

## 1. Trending Discovery Strip (Predict List Screen)

Add a horizontal scroll strip above the filter chips showing top 10 active markets from `GET /predict/trending`. Each card: question (2 lines), yes% pill, 24h volume.

Tapping a trending card navigates to `/predict-market/[slug]` (same as curated cards).

**Why:** Curated list is static and expires. Trending strip gives the screen a live feel and surfaces high-signal markets the analyst brain is actually writing about.

Component: `TrendingStrip` — horizontal `FlatList`, compact card ~140px wide × 100px tall.

---

## 2. Sparkline Chart on Detail Screen

Add an SVG sparkline to both `PredictMarketDetailScreen` and `PredictSportDetailScreen` showing 7-day yes price history.

- Uses `GET /predict/history/:tokenId?interval=1h` — calls `clobTokenIds[0]` (yes token)
- SVG path drawn from `history[].p` values, normalized to container height
- Overlaid on the odds section, above the YES/NO bars
- Time range selector: `1D | 1W` chips (switches between `?interval=1h` and `?interval=1d`)
- No external chart library — raw SVG `<Path>` with react-native-svg (already in Expo deps)

**Why:** Prediction markets are time-sensitive. Traders need to see if odds are moving, not just the current snapshot.

---

## 3. Live Price Refresh on Detail Screen

Auto-refresh yes/no prices every 30s on the detail screen using `GET /predict/markets/:slug/price`.

- `useEffect` with `setInterval(30_000)` — clears on unmount
- Updates only the price display, not the full detail fetch
- Show a subtle "updated Xs ago" timestamp next to the odds

**Why:** Users leaving the detail screen open (comparing markets, researching) see stale odds. 30s refresh keeps it live without hammering the API.

---

## Files to Modify

```
apps/hybrid-expo/features/predict/predict.api.ts
  — add fetchTrendingMarkets(), fetchMarketPrice(slug), fetchPriceHistory(tokenId, interval)

apps/hybrid-expo/features/predict/predict.types.ts
  — add TrendingMarket, PriceHistory, PricePoint types

apps/hybrid-expo/features/predict/PredictScreen.tsx
  — add TrendingStrip above filter chips

apps/hybrid-expo/features/predict/PredictMarketDetailScreen.tsx
  — add sparkline chart + live price refresh

apps/hybrid-expo/features/predict/PredictSportDetailScreen.tsx
  — add sparkline chart (sport outcomes have multiple tokens — chart the leading outcome)
```

## Implementation Notes

### react-native-svg sparkline

```tsx
import Svg, { Path, Line } from 'react-native-svg'

function Sparkline({ points, width, height }: { points: number[]; width: number; height: number }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 0.01
  const step = width / (points.length - 1)

  const d = points.map((p, i) => {
    const x = i * step
    const y = height - ((p - min) / range) * height
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={semantic.text.accent} strokeWidth={1.5} fill="none" />
    </Svg>
  )
}
```

### Time range toggle
```tsx
type HistoryInterval = '1h' | '1d'
const [interval, setInterval] = useState<HistoryInterval>('1h')
```

`1h` interval = hourly candles for 7 days = 168 data points
`1d` interval = daily candles for 7 days = 7 data points

### Live price refresh
```tsx
useEffect(() => {
  const timer = setInterval(() => { void refreshPrice() }, 30_000)
  return () => clearInterval(timer)
}, [slug])
```

## Progress (as of 2026-04-03)

- [x] `TrendingCard` component + horizontal scroll strip on PredictScreen
- [x] `fetchTrendingMarkets(10)` called in parallel with curated/sport loads
- [x] `Sparkline` SVG component on PredictMarketDetailScreen with 1D/1W toggle
- [x] `Sparkline` SVG component on PredictSportDetailScreen with per-outcome color
- [x] Live price refresh via `setInterval(30_000)` + `fetchMarketPrice()`
- [x] Types added: `TrendingMarket`, `PricePoint`, `PriceHistory`, `LivePrice`
- [ ] **"Updated Xs ago" timestamp** — needs verify in detail screen render
- [ ] **Loading skeleton for sparkline** — needs verify
- [ ] **Graceful degradation on history fetch fail** — needs verify

## Acceptance

- [x] Trending strip renders on Predict list screen, pulls from `GET /predict/trending`
- [x] Tapping a trending card navigates to correct market detail
- [x] Sparkline renders on geopolitics detail screen with 1D/1W toggle
- [x] Sparkline renders on sport detail screen (leading outcome token)
- [x] Detail screen yes/no prices refresh every 30s
- [ ] "Updated Xs ago" timestamp shown near odds — **needs verify**
- [ ] Loading skeleton shown while history fetches (sparkline area shows placeholder) — **needs verify**
- [ ] Graceful degradation: if history fetch fails, sparkline area hidden (not an error state) — **needs verify**
- [x] All loading/error states preserved from existing screens
