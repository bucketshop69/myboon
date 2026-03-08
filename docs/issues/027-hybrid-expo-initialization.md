# Issue 027 — Hybrid Expo Initialization

## Goal

Set up the mobile frontend foundation in `apps/hybrid-expo` for a feed-first MVP with the new MYBOON dark visual system, route shell, and shared UI primitives.

---

## Context

We moved away from the default Expo starter structure and aligned the app shell to the current product direction:
- dark-mode locked UI
- MYBOON branding in header
- fixed bottom glass navigation
- route-first app structure for Feed, Predict, Swap, Trade

This issue is foundation only. Business logic stays minimal.

---

## What to Build

### 1. Route Shell (Expo Router)

Configure stack routes in `app/_layout.tsx`:
- `/` → Feed
- `/predict` → Predict
- `/swap` → Swap
- `/trade` → Trade

Requirements:
- Remove tabs/modal routing from MVP shell.
- Keep all route headers hidden.
- Force light status bar content on dark background.

---

### 2. Theme Foundation

Create and enforce tokenized theming:
- `theme/tokens.ts` for raw values (colors, spacing, radius, typography, sizing, opacity, shadows)
- `theme/semantic.ts` for usage-level mapping
- `THEMING.md` rules for component usage

Requirements:
- No hardcoded color literals in feature components.
- Keep global dark palette matched to mock direction.
- Use radius `6` for cards and UI surfaces that were adjusted from earlier versions.

---

### 3. Shared Shell Components

Create reusable shell components used across sections:
- top header with MYBOON wordmark and live pill
- bottom glass nav (visual style + route navigation)

Requirements:
- Bottom nav item order: Feed → Predict → Swap → Trade.
- Predict/Trade can render placeholder content in this phase.
- Bottom nav remains visually consistent across all routes.

---

### 4. Branding Asset Setup

Add and use PNG wordmark assets in app header:
- `assets/branding/myboon-wordmark-small.png`
- `assets/branding/myboon-wordmark-small@2x.png`

Requirements:
- Use PNG in UI to avoid SVG rendering inconsistencies in Expo.
- Keep only required final assets; remove extra design samples.

---

### 5. Environment Bootstrap

Add frontend env keys:
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_JUP_API_KEY`

Document defaults in `.env.example`.

---

## File Structure

```
apps/hybrid-expo/
  app/
    _layout.tsx
    index.tsx
    predict.tsx
    swap.tsx
    trade.tsx
  features/
    feed/components/...
    navigation/SectionPlaceholderScreen.tsx
  theme/
    tokens.ts
    semantic.ts
  assets/branding/
    myboon-wordmark-small.png
    myboon-wordmark-small@2x.png
  .env.example
  THEMING.md
```

---

## What NOT to Build

- No wallet connect flow
- No swap execution/signing flow
- No auth/session layer
- No backend refactor work from frontend scope

---

## Acceptance Criteria

- [ ] `app/_layout.tsx` uses stack routing only (no tab/modal shell)
- [ ] Routes exist for Feed, Predict, Swap, Trade
- [ ] Shared top header and bottom nav render consistently on all routes
- [ ] UI is dark-mode locked and matches current mock direction
- [ ] Theme tokens + semantic mapping exist and are used in feature components
- [ ] Branding uses PNG wordmark assets (no runtime missing-asset errors)
- [ ] `.env.example` includes API base URL and Jupiter API key variables

