# Backlog #001 — Resolved Market Fallback in Feed Predict Block

## Current Behaviour

When a narrative's predict action slug points to a resolved or expired market, `PredictBlock` fetches null and renders nothing. The predict section disappears silently.

## Desired Behaviour

Show a small "Market resolved" or "Odds unavailable" state instead of nothing — so the user understands a market existed but is no longer active, rather than seeing a blank gap in the sheet.

## Ideas

- Show a greyed-out pill: "Market closed" with the slug label
- Show final odds (if Gamma returns resolved outcome) — "Resolved: YES (94%)"
- Skip the block entirely but add a note at the bottom of the sheet: "1 market resolved"

## Notes

- Affects sports markets most (matches resolve quickly)
- Geopolitics markets stay active for months so less urgent
- Requires Gamma to return `resolution` field on resolved markets — verify this first
