# 030 — Feed Card Redesign + Narrative Detail Sheet

## What & Why

The Feed is the core product differentiator. The current FeedCard is underpowered — it splits `content_small` into an artificial title/description, uses a 5px sentiment dot that's impossible to read at scroll speed, and tapping a card does nothing.

This issue rebuilds the card from scratch and adds a narrative detail bottom sheet. The design principle: show only what a user can immediately understand without explanation. No scores, no signal counts, no trade chips — those require context the user doesn't have yet.

**Also in scope:** remove `FilterChips` entirely from `FeedScreen`. Non-functional, adds noise.

---

## Card Design

### Final anatomy

```
┌──────────────────────────────────────────────┐
│  [GEOPOLITICS]  ·  2h ago                    │  ← category pill + time
│                                              │
│  $971K position on Yes (Iran regime          │  ← body text only
│  survives US strikes) hits Polymarket —      │
│  directly contradicting $31M stacked on      │
│  regime fall...                              │
└──────────────────────────────────────────────┘
```

**What's NOT on the card:** no score badge, no signal count, no action chips, no left stripe. Every element removed was something a new user couldn't interpret without explanation.

### Category pill

| Category | Background | Text color |
|---|---|---|
| Geopolitics | `rgba(199,183,112,0.12)` | `#c7b770` |
| Macro | `rgba(90,88,64,0.30)` | `#8A7A50` |
| Markets | `rgba(74,140,111,0.12)` | `#4A8C6F` |
| Tech | `rgba(100,120,200,0.12)` | `#7A9AC8` |

- `height: 18`, `paddingHorizontal: 7`, `borderRadius: tokens.radius.xs (2)`
- `fontSize: tokens.fontSize.xxs (9)`, monospace, uppercase, `letterSpacing: 0.8`

### Time
- `fontSize: tokens.fontSize.xs (10)`, monospace, `color: semantic.text.dim`

### Body text
- `content_small` in full — no title, no truncation, no split
- `fontSize: tokens.fontSize.md (14)`, `color: rgba(208,202,168,0.88)`, `lineHeight: 21`, `letterSpacing: -0.2`

### Top card treatment
First item (`isTop: true`): `borderColor: rgba(199,183,112,0.14)`, `background: rgba(199,183,112,0.025)`

### Tap target
The entire card is tappable and opens the detail sheet. No sub-tap zones.

---

## Detail Bottom Sheet

Opens on card tap. Single snap at `75%` screen height. Not full screen — user stays in feed context.

### Structure

```
┌────────────────────────────────────────┐
│           [drag handle]                │
│                                        │
│  [GEOPOLITICS]  ·  2h ago             │  ← same meta row
│                                        │
│  Full content_full text here.          │  ← scrollable, larger text
│  Multiple paragraphs. Full analyst     │
│  observation and reasoning.            │
│                                        │
│  ────────────────────────────────      │  ← divider (only if predict block)
│                                        │
│  PREDICTION MARKET                     │  ← section label
│  Will the Iranian regime fall by       │  ← market question
│  March 31?                             │
│                                        │
│  YES  ████████████████████  99.9%      │  ← odds bars
│  NO   ░░░░░░░░░░░░░░░░░░░░   0.1%      │
│                                        │
│  $30.9M volume                         │
│                                        │
│  [ Bet YES ]          [ Bet NO ]       │  ← CTAs → navigate to Predict tab
└────────────────────────────────────────┘
```

### Prediction block
Only renders if `actions` contains `type: 'predict'` with a valid slug.

- Fetch live yes/no from `GET /predict/price/:tokenId` using slug's token IDs
- YES bar: `background: rgba(74,140,111,0.18)`, text `#4A8C6F`
- NO bar: `background: rgba(217,79,61,0.12)`, text `#D9534F`
- Bar width = percentage of odds
- Volume: `$` + `M`/`K` formatted
- Bet buttons navigate to `/predict-market/[slug]` — no order execution

### Sheet with no actions
If no predict actions: sheet shows only the full text. No empty blocks, no placeholders.

### Sheet implementation
- Use `Modal` with animated `translateY` (avoid adding `@gorhom/bottom-sheet` dependency unless already present)
- Background: `semantic.background.surface` (`#222318`)
- Handle: `width: 36`, `height: 4`, `borderRadius: 2`, `background: semantic.border.muted`, centered, `marginTop: 12`
- Content: `ScrollView` inside the modal

---

## Data Changes

### 1. Add `signal_count` to API list response
**File:** `packages/api/src/index.ts`

```
# before
select=id,narrative_id,content_small,tags,priority,actions,created_at

# after
select=id,narrative_id,content_small,tags,priority,actions,signal_count,created_at
```

### 2. Update `FeedItem` type
**File:** `apps/hybrid-expo/features/feed/feed.types.ts`

```ts
export interface NarrativeAction {
  type: 'predict' | 'perps';
  asset?: string;  // perps: 'BTC', 'ETH'
  slug?: string;   // predict: polymarket slug
}

export interface FeedItem {
  id: string;
  category: FeedCategory;
  timeAgo: string;
  description: string;
  isTop?: boolean;
  actions: NarrativeAction[];
}
```

Remove: `percent`, `sentiment`, `title`, `image`, `score`, `signalCount` — none used in the new design.

### 3. Update `mapNarrativeToFeedItem` in `feed.api.ts`
Remove `title`/`image` derivation, map `actions` from API response.

---

## Files to Change

| File | Change |
|---|---|
| `packages/api/src/index.ts` | Add `signal_count` to narratives select |
| `apps/hybrid-expo/features/feed/feed.types.ts` | Simplify `FeedItem`, add `NarrativeAction` |
| `apps/hybrid-expo/features/feed/feed.api.ts` | Remove title split, map `actions` |
| `apps/hybrid-expo/features/feed/components/FeedCard.tsx` | Full rebuild per spec |
| `apps/hybrid-expo/features/feed/components/FeedList.tsx` | `ScrollView` → `FlatList`, pass `onCardPress` |
| `apps/hybrid-expo/features/feed/FeedScreen.tsx` | Remove `FilterChips`, add sheet state + `onCardPress` |
| `apps/hybrid-expo/features/feed/components/FilterChips.tsx` | **Delete** |
| `apps/hybrid-expo/features/feed/components/NarrativeSheet.tsx` | **New** — bottom sheet |
| `apps/hybrid-expo/features/feed/feed.mock.ts` | Remove `FILTERS` export |

---

## Out of Scope

- Filter functionality — removed, not deferred
- Bet execution — Bet YES/NO navigates to Predict tab only
- Pull-to-refresh — separate issue
- `predict` type actions from brain — brain currently only writes `perps`. Sheet prediction block will be dormant until that's wired up separately
