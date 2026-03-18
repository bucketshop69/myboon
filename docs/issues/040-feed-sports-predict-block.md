# #040 — Feed UI: Sports Predict Block + Multiple Actions

## Problem

The `NarrativeSheet` predict block is broken for sports narratives:

1. **Wrong endpoint:** `PredictBlock` calls `GET /predict/markets/:slug` for all predict actions. Sports slugs (e.g. `ucl-mnc1-rma1-2026-03-17-mnc1`) are not in the curated geopolitics list — the API returns `{"error":"Not found"}`. The block silently fails and nothing renders.

2. **Only first action rendered:** The sheet renders one `PredictBlock` regardless of how many `predict` actions are in the narrative. A narrative with 5 slugs shows zero blocks (because the first one 404s and the rest are never tried).

3. **Binary-only UI:** `PredictBlock` renders YES/NO bars. Sports markets return multi-outcome arrays (`[{label: "Man City", price: 0.72}, {label: "Real Madrid", price: 0.18}, {label: "Draw", price: 0.10}]`). The binary layout doesn't handle this.

## Goal

1. Detect whether a slug is a sports or geopolitics market from the slug prefix and call the correct endpoint
2. Render up to 3 predict blocks per narrative (first 3 `predict` actions)
3. Sports markets render a multi-outcome layout (outcomes list) instead of YES/NO bars

## Dependencies

- None (frontend-only, API endpoints already exist)

## Scope

- `apps/hybrid-expo/features/feed/feed.api.ts` — add `fetchSportsMarket`, update `fetchPredictMarket` routing
- `apps/hybrid-expo/features/feed/components/NarrativeSheet.tsx` — render multiple blocks, pass market type
- `apps/hybrid-expo/features/feed/feed.types.ts` — extend `PredictMarketData` for outcomes

## Changes

### 1. Slug type detection

Sports slugs start with a known sport prefix followed by `-`:

```ts
const SPORT_PREFIXES = ['ucl', 'epl', 'lol', 'nba', 'nfl', 'ncaa']

export function detectSlugType(slug: string): 'sports' | 'geo' {
  const prefix = slug.split('-')[0].toLowerCase()
  return SPORT_PREFIXES.includes(prefix) ? 'sports' : 'geo'
}

export function extractSport(slug: string): string {
  return slug.split('-')[0].toLowerCase()
}
```

### 2. Updated PredictMarketData type

```ts
export interface PredictOutcome {
  label: string
  price: number   // 0.0–1.0
}

export interface PredictMarketData {
  slug: string
  question: string | null
  marketType: 'binary' | 'multi'
  // binary fields
  yesPrice: number | null
  noPrice: number | null
  // multi fields
  outcomes: PredictOutcome[]
  volume24h: number | null
}
```

### 3. fetchPredictMarket routing in feed.api.ts

```ts
export async function fetchPredictMarket(slug: string): Promise<PredictMarketData | null> {
  const type = detectSlugType(slug)

  if (type === 'sports') {
    return fetchSportsMarket(slug)
  }
  return fetchGeoMarket(slug)
}

async function fetchGeoMarket(slug: string): Promise<PredictMarketData | null> {
  // existing implementation — calls GET /predict/markets/:slug
  // maps to marketType: 'binary'
}

async function fetchSportsMarket(slug: string): Promise<PredictMarketData | null> {
  const sport = extractSport(slug)
  const res = await fetch(`${API_BASE}/predict/sports/${sport}/${slug}`)
  if (!res.ok) return null
  const data = await res.json()

  return {
    slug,
    question: data.title ?? null,
    marketType: 'multi',
    yesPrice: null,
    noPrice: null,
    outcomes: (data.outcomes ?? []).map((o: any) => ({
      label: o.label,
      price: o.price,
    })),
    volume24h: data.volume24h ?? null,
  }
}
```

### 4. NarrativeSheet — render up to 3 predict blocks

Replace single `PredictBlock` render with a mapped list capped at 3:

```tsx
const predictActions = item.actions
  .filter(a => a.type === 'predict' && a.slug)
  .slice(0, 3)

{predictActions.map(action => (
  <PredictBlock key={action.slug} slug={action.slug!} />
))}
```

### 5. PredictBlock — multi-outcome layout

`PredictBlock` already fetches via `fetchPredictMarket`. After fetch, branch on `marketType`:

**Binary (existing):** YES/NO bars + Bet YES / Bet NO buttons → navigate to `/predict-market/[slug]`

**Multi (new):** Outcomes list. Each row: team name left, price % right, colored bar.

```tsx
{market.marketType === 'multi' ? (
  <View style={styles.outcomesContainer}>
    {market.outcomes.map(outcome => (
      <TouchableOpacity
        key={outcome.label}
        style={styles.outcomeRow}
        onPress={() => router.push(`/predict-sport/${extractSport(slug)}/${slug}`)}
      >
        <Text style={styles.outcomeLabel}>{outcome.label}</Text>
        <View style={styles.outcomeBarContainer}>
          <View style={[styles.outcomeBar, { width: `${Math.round(outcome.price * 100)}%` }]} />
        </View>
        <Text style={styles.outcomePrice}>{Math.round(outcome.price * 100)}%</Text>
      </TouchableOpacity>
    ))}
  </View>
) : (
  // existing binary layout
)}
```

## Acceptance Criteria

- [ ] Opening a UCL narrative sheet renders predict blocks (no more 404 silent fail)
- [ ] Sports predict block shows team outcomes with % bars (not YES/NO)
- [ ] Tapping a sports outcome row navigates to `/predict-sport/ucl/[slug]`
- [ ] A narrative with 5 slugs renders exactly 3 predict blocks
- [ ] Geopolitics narratives still render the existing binary YES/NO block (no regression)
- [ ] If any individual market fetch fails (network error, market expired), that block is skipped silently — other blocks still render
