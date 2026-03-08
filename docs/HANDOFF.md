# Handoff — 2026-03-08

## What Was Done This Session

### Publisher Brain (packages/brain) — DONE

- `src/publisher.ts` — reads `narratives` (status=draft, score >= 7), runs tool-use loop per narrative, writes to `published_narratives`, marks status published/rejected. Runs every 30min.
- `src/publisher-tools/firecrawl.tools.ts` — `search_news` tool via Firecrawl `/v2/search`. Returns `data.web[]` results.
- `src/publisher-tools/supabase.tools.ts` — `search_published` tool — checks own DB before external search.
- Sports narrative detection via regex in code (`isSportsNarrative()`), passes empty `[]` tools to LLM so sports narratives skip search (still published, just no external research).
- Publisher gives own `publisher_score` — only saves if >= 8, else marks rejected.
- System prompt includes today's date dynamically (`buildSystemPrompt()`).
- Consecutive tool failure fallback — after 3 failures, LLM told to proceed with signal data only.
- `packages/brain/package.json` — added `publisher` script.

### Supabase Tables Added

- `narratives` — analyst output (done in previous session)
- `published_narratives` — publisher output: `narrative_id`, `content_small`, `content_full`, `reasoning`, `tags`, `priority`, `publisher_score`

### Docs

- `docs/issues/023-publisher-brain.md` — PRD written and implemented
- `docs/ARCHITECTURE.md` — updated to reflect Layer 2 (Publisher) complete

---

## What's Next (in order)

1. **Feed API** (issue 025) — REST endpoint serving `published_narratives`. Simple GET /narratives list + GET /narratives/:id full. To be decided: Supabase Edge Function vs standalone Hono/Express server.
2. **Mobile Feed tab** — Expo app reads from Feed API, renders `content_small` cards.
3. **Influencer brain** (issue 024) — X post drafts from published narratives, human approves manually.

---

## Open Items

- VPS: Polymarket collector should still be running. Brain (analyst + publisher) can be moved to VPS once Feed API is live.
- Kalshi, X API, on-chain signals — not started
- Feed API host TBD — could be a simple Hono server in `packages/api` or Supabase Edge Functions

---

## Credentials (in .env files only — never committed)

All credentials live in:

- `packages/collectors/.env`
- `packages/brain/.env`

Both gitignored. See MEMORY.md for values if needed.
