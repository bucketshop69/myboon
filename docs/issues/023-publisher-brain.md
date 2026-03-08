# Issue 023 — Publisher Brain

## Goal

Build the publisher brain that takes analyst narrative drafts and turns them into two publishable formats — a short feed card and a full deep-analysis piece — enriched with real-world news context via Firecrawl search. Runs every 30min.

---

## Context

The analyst (Layer 1) writes raw narrative clusters to the `narratives` table with `status='draft'`. The publisher (Layer 2) reads those drafts, enriches them with live news, and publishes two content formats per narrative. The Feed API and mobile app consume published narratives.

---

## Supabase Schema

Two tables:

**`narratives`** — analyst output, unchanged. Publisher marks `status='published'` after processing.

**`published_narratives`** — publisher output (already created in Supabase):
```sql
create table published_narratives (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid references narratives(id),
  content_small text not null,
  content_full text not null,
  reasoning text,
  tags text[],
  priority integer,
  created_at timestamptz not null default now()
);
```

`reasoning` — publisher's internal note: why it picked this narrative, how it linked signals to news, why it set the priority. Not shown to users. Used for debugging and improving the publisher.

---

## What to Build

### 1. Firecrawl search tool (`packages/brain/src/publisher-tools/firecrawl.tools.ts`)

Follow the exact pattern of `packages/brain/src/analyst-tools/polymarket.tools.ts`.

Tool: **`search_news`**
```
Input:  { query: string, limit?: number }
Output: array of { title, url, description, date } from Firecrawl news search
```

Implementation:
- `POST https://api.firecrawl.dev/v2/search`
- Headers: `Authorization: Bearer <FIRECRAWL_API_KEY>`, `Content-Type: application/json`
- Body: `{ query, sources: ["news"], limit: limit ?? 5, tbs: "qdr:d" }` (past 24h news)
- Response shape: `data.web[]` each with `{ title, url, description }`
- On error: return `{ error: string }` — never throw
- `FIRECRAWL_API_KEY` comes from env, injected via config (not hardcoded)

Export: `createFirecrawlTools(apiKey: string): ResearchTool<any>[]`

---

### 2. Publisher brain (`packages/brain/src/publisher.ts`)

Self-contained ESM script, reads `.env` via `dotenv/config`.

**Required env vars:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MINIMAX_API_KEY`
- `FIRECRAWL_API_KEY`

**Flow per run:**

```
1. Fetch all narratives where status='draft' (up to 20)
2. If none → log and skip
3. For each narrative (process sequentially, not in parallel):
   a. Run publisher LLM with tool-use loop
   b. LLM calls search_news for relevant queries (typically 2-3 calls per narrative)
   c. LLM produces structured output (see below)
   d. PATCH narrative in Supabase: content_small, content_full, tags, priority, status='published'
4. Log summary
```

**LLM output format** (JSON, one object per narrative):
```json
{
  "content_small": "2-4 sentence punchy card. No fluff. Lookonchain style. State what's happening, what the bet signals, why it matters.",
  "content_full": "Full analysis paragraph. Connect the prediction market signals to real-world news context. Explain what the odds imply, what news confirms or contradicts, what the meta-narrative is (e.g. Iran conflict cluster → oil price impact).",
  "reasoning": "Internal note: why this narrative was picked, how signals were connected to news, why priority was set this way.",
  "tags": ["iran", "geopolitics", "oil"],
  "priority": 8
}
```

**System prompt:**
```
You are a market intelligence publisher. You receive a narrative cluster from prediction market signals and your job is to produce two content formats.

content_small: Short, punchy, 2-4 sentences. Lookonchain style but smarter. State the position, what it signals, why it matters. No jargon, no filler. Written for a trader who has 5 seconds.

content_full: Deep analysis. Connect the prediction market bets to real-world context. Use search_news to find relevant news from the past 24h before writing. Link related themes (e.g. if bets are on Iran invasion AND oil prices are spiking, connect them). Explain what the market is pricing and what the news confirms or contradicts.

tags: 2-5 lowercase tags that describe the narrative topic (e.g. "iran", "election", "crypto", "oil", "fed", "ai", "geopolitics", "sports").

priority: Integer 1-10. Higher = more urgent/important. Base this on: score from analyst, signal count, news recency, whether the topic is time-sensitive.

Use search_news before writing content_full. Make 2-3 targeted queries. Do not make up news — only reference what the tool returns.
```

**Tool-use loop:** same pattern as narrative-analyst.ts — max 10 iterations, consecutive failure fallback after 3 failures (tell LLM to proceed without news context).

**Supabase writes** after each narrative:
1. INSERT into `published_narratives`: `{ narrative_id, content_small, content_full, reasoning, tags, priority }`
2. PATCH `narratives?id=eq.<id>`: `{ status: 'published' }`

**Runs every 30min** via setInterval.

---

### 3. Package config

**`packages/brain/package.json`** — add script:
```json
"publisher": "tsx src/publisher.ts"
```

**`packages/brain/.env`** — add `FIRECRAWL_API_KEY` (user will fill in value)

---

## Output Example

**content_small:**
> Iran regime change markets are pricing 35% — but one wallet put $50K on Khamenei out by Feb 28 while others loaded up on No. Sophisticated bettors are split. Someone has conviction the market is wrong.

**content_full:**
> Prediction markets currently price Iranian regime change at 35% by March 31. A single large position — $50K on Khamenei out — stands against multiple $5K+ bets on the No side, suggesting deep disagreement among informed participants. News from the past 24h shows [news context here]. The divergence matters: when large, informed bettors disagree this sharply, it typically signals genuine uncertainty at the information frontier rather than noise. Oil futures are also elevated, consistent with markets hedging a disruption scenario. Tags: iran, geopolitics, oil.

---

## What NOT to Build

- Do not build the influencer brain (X posts) — that's issue 024
- Do not build the Feed API — that's issue 025
- Do not add consensus/redundancy (two publishers) — post-MVP
- Do not scrape full article content (markdown) from Firecrawl — snippets are enough, saves credits

---

## Acceptance Criteria

- [ ] `search_news` tool calls Firecrawl news search, returns results or error object
- [ ] Publisher reads `status='draft'` narratives from Supabase
- [ ] For each narrative: LLM calls search_news 2-3 times before writing
- [ ] `content_small` is 2-4 sentences, punchy, no markdown headers
- [ ] `content_full` references actual news from search results
- [ ] `tags` is a non-empty array of lowercase strings
- [ ] `priority` is an integer 1-10
- [ ] Row inserted into `published_narratives` with all fields
- [ ] `reasoning` field explains the publisher's decision
- [ ] Narrative patched to `status='published'` in Supabase after processing
- [ ] Tool failure fallback works (3 consecutive failures → proceed without news)
- [ ] No hardcoded secrets — all from env
- [ ] Reviewer subagent passes before commit
