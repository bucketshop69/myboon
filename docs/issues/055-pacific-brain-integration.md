# #055 — Pacific Brain Integration

## Problem

Analyst agent only processes Polymarket signals. Pacific signals (price moves, funding spikes, volume surges) represent a rich source of trading narratives — but the brain doesn't know how to interpret them.

**Gap:** Analyst needs Pacific awareness. No cross-market narratives (Pacific + Polymarket).

## Goal

Integrate Pacific signals into Analyst agent:

1. Add Pacific signal interpretation logic
2. Add `get_pacific_snapshot()` tool for live data
3. Update Analyst prompt to recognize Pacific signals
4. Enable cross-market clustering (Pacific + Polymarket)

**Outcome:** Analyst generates narratives like "BTC funding at 130% APY while Polymarket trades range-bound — one of these markets is mispricing conviction."

## Dependencies

- Builds on: #051 (Pacific collectors — provides signals)
- Blocked on: #057 (Signal design — defines interpretation rules)

## Files to Change

- `packages/brain/src/analyst/pacific-context.ts` — Signal interpretation
- `packages/brain/src/tools/get-pacific-snapshot.ts` — Live data tool
- `packages/brain/src/analyst/analyst-prompt.ts` — Updated prompt

## Acceptance

- [ ] Analyst fetches both POLYMARKET and PACIFIC signals
- [ ] Narratives include Pacific key_signals with `[source: PACIFIC]` prefix
- [ ] Cross-market narratives cluster Pacific + Polymarket signals
- [ ] `get_pacific_snapshot("BTC")` tool works

## Reference

- `docs/issues/051-pacific-collectors.md` — Pacific signal types
- `packages/brain/src/graphs/analyst-graph.ts` — Existing analyst graph
