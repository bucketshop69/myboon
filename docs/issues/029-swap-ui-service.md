# Issue 029 — Swap UI + GET Preview Service

## Goal

Build the Swap tab as an interactive preview experience using read-only Jupiter endpoints. No signing, no on-chain execution in this phase.

---

## Context

Swap UI should match the dark MYBOON direction and allow users to:
- select input/output tokens
- enter amount
- see indicative output/rate/impact

Execution remains disabled. CTA is non-transactional (`COMING SOON`).

---

## What to Build

### 1. Swap Feature Structure

Organize swap into:
- `features/swap/SwapScreen.tsx`
- `features/swap/swap.api.ts`
- `features/swap/swap.types.ts`

Requirements:
- Keep network code isolated in service file.
- Keep UI logic/state in screen.

---

### 2. Jupiter Read-Only Service (`swap.api.ts`)

Use `https://api.jup.ag` with optional header:
- `x-api-key: ${EXPO_PUBLIC_JUP_API_KEY}`

Implement methods:

1. `searchSwapTokens(query)`
- `GET /tokens/v2/search?query=...`
- Return normalized token list.
- On empty/no-result return fallback curated tokens.

2. `fetchTokenPrices(mints[])`
- `GET /price/v3?ids=<mint1,mint2,...>`
- Return `Record<mint, usdPrice>`.

3. `fetchSwapQuotePreview(args)`
- `GET /swap/v1/quote`
- Inputs: `inputMint`, `outputMint`, `amount` (atomic), `slippageBps`
- Output: preview object (`inAmount`, `outAmount`, `priceImpactPct`)

Helper requirements:
- UI amount → atomic amount conversion with token decimals
- atomic → UI amount conversion
- strict numeric guardrails for invalid values

---

### 3. Swap Screen UX (`SwapScreen.tsx`)

State + interactions:
- sell token, buy token
- amount input
- half/max buttons (using mock balances)
- swap direction toggle
- slippage selector
- token picker modal with search

Async behavior:
- debounce token search (~300ms)
- debounce quote preview (~350ms)
- load token prices for selected pair
- graceful error fallback in UI when quote/search fails

Display requirements:
- show estimated buy amount
- show USD value conversion
- show rate row (`1 OUT ~ X IN`) from quote or price fallback
- show price impact
- keep CTA as non-functional `COMING SOON`

---

## Endpoints (Consumed)

- `GET https://api.jup.ag/tokens/v2/search?query=...`
- `GET https://api.jup.ag/price/v3?ids=...`
- `GET https://api.jup.ag/swap/v1/quote?...`

---

## Environment

Frontend env keys:
```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_JUP_API_KEY=
```

If Jupiter returns `401`, set `EXPO_PUBLIC_JUP_API_KEY` and restart Expo with cache clear.

---

## What NOT to Build

- No `POST /ultra/v1/execute`
- No `POST /swap/v1/swap`
- No wallet signature request
- No transaction submission to Solana
- No route persistence/history

---

## Acceptance Criteria

- [ ] Swap screen renders with dark mock-aligned layout
- [ ] Token picker search works using Jupiter tokens API
- [ ] Price fetch works using Jupiter price API
- [ ] Quote preview works using Jupiter swap quote API
- [ ] Quote and token errors are surfaced without crashing UI
- [ ] Sell/buy token switching and half/max interactions work
- [ ] CTA remains `COMING SOON` and does not execute swaps
- [ ] All network calls are GET-only in this phase

