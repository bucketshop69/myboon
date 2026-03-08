# Issue 028 — Feed UI + Service Layer

## Goal

Implement the Feed tab UI and its client-side service layer in `apps/hybrid-expo`, backed by `packages/api` narrative endpoints.

---

## Context

The backend feed API already exposes published narratives:
- `GET /health`
- `GET /narratives?limit=<n>`
- `GET /narratives/:id`

Mobile Feed should consume this API and render the existing MYBOON card design with loading/error/empty handling.

---

## What to Build

### 1. Feed Feature Structure

Organize feed into:
- `features/feed/FeedScreen.tsx`
- `features/feed/feed.api.ts`
- `features/feed/feed.types.ts`
- `features/feed/feed.mock.ts`
- `features/feed/components/*`

Purpose:
- keep UI composition clean
- keep mapping/network logic out of screen component

---

### 2. Feed Service Layer (`feed.api.ts`)

Implement a thin read-only client for `GET /narratives`.

Requirements:
- Resolve base URL from `EXPO_PUBLIC_API_BASE_URL`.
- Fallback base URL for local development:
  - Android emulator: `http://10.0.2.2:3000`
  - Others: `http://localhost:3000`
- Clamp requested limit to `1..20`.
- Validate response is an array.
- Throw explicit errors for bad status/shape.

Mapping requirements:
- Convert API rows to `FeedItem`.
- Derive display category from tags (`Geopolitics`, `Macro`, `Markets`, `Tech`).
- Derive sentiment from priority.
- Convert `created_at` to relative time (`Xm ago`, `Xh ago`, `Xd ago`).
- Extract `title` and `description` from `content_small` with truncation safeguards.

---

### 3. Feed UI States (`FeedScreen.tsx`)

Implement stateful screen behavior:
- initial loading state
- error state with retry action
- empty state
- success state with feed list

Requirements:
- Pull max 20 items on initial load.
- Retry button re-runs request.
- Keep filter chips visual for MVP (no server-side filter yet).

---

### 4. Navigation Integration

Feed route is root route:
- `app/index.tsx` exports `FeedScreen`
- bottom nav highlights Feed when active
- nav routes wired to Predict/Swap/Trade screens

---

## API Contracts (Consumed)

### `GET /narratives?limit=20`
Expected payload:
```json
[
  {
    "id": "uuid",
    "narrative_id": "uuid",
    "content_small": "string",
    "tags": ["tag"],
    "priority": 10,
    "created_at": "2026-03-08T08:30:42.414855+00:00"
  }
]
```

---

## What NOT to Build

- No detail screen fetch in this issue (`/narratives/:id` reserved for next issue)
- No pagination/infinite scroll
- No client caching or background sync
- No auth headers on feed requests

---

## Acceptance Criteria

- [ ] Feed screen loads data from `GET /narratives`
- [ ] Limit is clamped to max 20 at service layer
- [ ] Loading, error, empty, success states are all handled
- [ ] Retry flow works from error state
- [ ] Mapping from API payload to feed cards is deterministic and type-safe
- [ ] Base URL resolves correctly from env/fallback rules
- [ ] Feed design matches the existing dark mock implementation

