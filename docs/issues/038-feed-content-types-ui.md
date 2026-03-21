# #038 — Feed Content Types UI

> **COMPLETED** — Shipped in #040. Feed card redesign + sports predict block + binary predict block with content_type-aware rendering.

## Problem

Every feed card looks and feels identical. Whether the card is about a whale bet, a multi-day trend, or a real-world event — the UI renders the same card shape with the same neutral styling. This makes the feed feel like a signal log rather than narrative intelligence.

The backend now produces `content_type` (`fomo | signal | news`) per narrative (#037). The UI should surface this distinction visually so users can scan the feed and understand what kind of intelligence each card represents.

## Goal

1. Each feed card has a visual identity tied to its `content_type`
2. The `content_type` is exposed by the API and mapped in the client service layer
3. The NarrativeSheet header reflects the content type

## Dependencies

- Blocked by: #037 (requires `content_type` field in DB and API response)

## Scope

- `packages/api/src/index.ts` — include `content_type` in `GET /narratives` and `GET /narratives/:id`
- `apps/hybrid-expo/features/feed/feed.types.ts` — add `ContentType`, update `FeedItem`
- `apps/hybrid-expo/features/feed/feed.api.ts` — map `content_type` from API response
- `apps/hybrid-expo/features/feed/components/FeedCard.tsx` — visual treatment per type
- `apps/hybrid-expo/features/feed/components/NarrativeSheet.tsx` — header badge per type

## Changes

### 1. API — expose content_type

In `GET /narratives` select:
```
id, narrative_id, content_small, tags, priority, actions, thread_id, created_at, content_type
```

In `GET /narratives/:id` — already selects `*`, no change needed.

### 2. Client types

```ts
// feed.types.ts
export type ContentType = 'fomo' | 'signal' | 'news'

export interface FeedItem {
  id: string
  category: string        // tags[0]
  timeAgo: string
  description: string
  isTop?: boolean
  actions: NarrativeAction[]
  contentType: ContentType  // NEW
}
```

### 3. feed.api.ts mapping

In `mapNarrativeToFeedItem`:
```ts
contentType: (item.content_type as ContentType) ?? 'fomo',
```

### 4. FeedCard visual treatment

Each `content_type` gets a distinct left-edge accent and label:

| content_type | Accent color | Label |
|---|---|---|
| `fomo` | `#C7B770` (gold) | `WHALE` |
| `signal` | `#4A8C6F` (green) | `SIGNAL` |
| `news` | `#7A9AC8` (blue) | `NEWS` |

Implementation: 3px left border on the card container using the accent color. The category pill is replaced by a type badge (`WHALE` / `SIGNAL` / `NEWS`) when `contentType !== 'fomo'`. Category pill remains for fomo cards (current behaviour).

```tsx
const TYPE_CONFIG: Record<ContentType, { color: string; label: string }> = {
  fomo:   { color: '#C7B770', label: 'WHALE' },
  signal: { color: '#4A8C6F', label: 'SIGNAL' },
  news:   { color: '#7A9AC8', label: 'NEWS' },
}
```

Card container style addition:
```tsx
borderLeftWidth: 3,
borderLeftColor: TYPE_CONFIG[item.contentType].color,
```

### 5. NarrativeSheet header

Add a small type badge next to the category pill in the sheet header:

```tsx
<View style={styles.typeBadge}>
  <Text style={[styles.typeBadgeText, { color: TYPE_CONFIG[item.contentType].color }]}>
    {TYPE_CONFIG[item.contentType].label}
  </Text>
</View>
```

Shown only when `contentType !== 'fomo'` to avoid redundancy with the category pill.

## Acceptance Criteria

- [ ] `GET /narratives` response includes `content_type` field on each item
- [ ] Feed cards have a 3px left accent border matching their content type
- [ ] `SIGNAL` and `NEWS` cards show a type badge
- [ ] `fomo` cards show the existing category pill (no regression)
- [ ] NarrativeSheet header shows type badge for non-fomo items
- [ ] `content_type` defaults to `'fomo'` in the client if field is missing (backwards compat during rollout)
