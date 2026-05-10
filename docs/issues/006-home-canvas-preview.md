# #006 - Home Canvas Preview

## Problem

The Expo app currently treats Feed, Predict, Trade, and Swap as peer destinations through a persistent custom bottom nav mounted in `apps/hybrid-expo/app/_layout.tsx`. The new mockup in `docs/mockups/home-no-tabs-codex-v2.html` defines a different information architecture: Home should be a single scrolling canvas with Feed, Markets, and Wallet previews. Users should be able to click "See more" from Feed into the full Feed screen, click Polymarket into the existing Predict list, and click Perps into the existing Trade/Perps list.

## Goal

1. Replace `/` with a Home canvas that previews Feed, Markets, and Wallet.
2. Preserve the existing full Feed, Predict, Trade/Perps, Swap, and detail screens as destinations.
3. Remove the persistent bottom nav so Home content owns the screen.

## Dependencies

- None (standalone)

## Scope

- `apps/hybrid-expo/app/_layout.tsx` - remove the global bottom nav mount and register the full Feed route.
- `apps/hybrid-expo/app/index.tsx` - export the new Home screen instead of the full Feed screen.
- `apps/hybrid-expo/app/feed.tsx` - add a full Feed route that preserves the existing feed experience.
- `apps/hybrid-expo/features/home/HomeScreen.tsx` - create the Home canvas with Feed, Markets, and Wallet previews.
- `docs/issues/006-home-canvas-preview.md` - document this implementation issue.

## Changes

### 1. Add Home screen route

Create `features/home/HomeScreen.tsx` and update `app/index.tsx`:

```ts
export { default } from '@/features/home/HomeScreen';
```

Home should render:

- a transparent top area with `AppTopBarLogo` on the left and `AvatarTrigger` on the right
- `Feed` heading
- three latest narrative cards using the existing `FeedCard`
- a "See more" card that routes to `/feed`
- `Markets` heading
- one Polymarket condensed card that routes to `/predict`
- one Perps condensed card that routes to `/trade`
- `Wallet` heading
- hardcoded wallet summary and action cards for now

### 2. Preserve full Feed

Add `app/feed.tsx`:

```ts
export { default } from '@/features/feed/FeedScreen';
```

The Home Feed preview should use `fetchFeedItems(3, 0)` and should not replace `FeedScreen` pagination, refresh, or detail sheet behavior.

### 3. Preserve existing market routes

The Markets preview should not embed `PredictScreen` or `TradeListScreen`. It should fetch small previews independently:

```ts
fetchTrendingMarkets(3)
fetchPerpsMarkets()
```

Polymarket preview card press routes to `/predict`. Perps preview card press routes to `/trade`. Individual rows may route to existing detail pages:

- prediction row -> `/predict-market/[slug]`
- perp row -> `/trade/[symbol]`

### 4. Remove persistent bottom navigation

Remove this global mount from `app/_layout.tsx`:

```tsx
<BottomGlassNav items={BOTTOM_NAV_ITEMS} />
```

Do not delete `BottomGlassNav` yet; keep it available until the navigation migration is fully settled.

### 5. Keep Wallet hardcoded

For this issue, Wallet can use hardcoded display data matching the mockup direction. It should link to existing account surfaces where useful, but it does not need a new `/wallet` route yet.

## Acceptance Criteria

- [ ] `/` opens a Home canvas with Feed, Markets, and Wallet sections.
- [ ] The Home header has no persistent center label and no bottom nav is visible.
- [ ] Feed preview renders up to three real narrative cards from `fetchFeedItems(3, 0)`.
- [ ] The Feed "See more" action routes to `/feed`.
- [ ] `/feed` renders the existing full Feed screen.
- [ ] Polymarket preview routes to `/predict`.
- [ ] Perps preview routes to `/trade`.
- [ ] Existing detail routes such as `/predict-market/[slug]` and `/trade/[symbol]` remain unchanged.
- [ ] Wallet preview renders without requiring live wallet data.
