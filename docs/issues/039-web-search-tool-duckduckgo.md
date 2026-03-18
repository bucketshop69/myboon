# #039 — Web Search Tool (DuckDuckGo)

## Problem

The publisher's `search_news` tool (Firecrawl) was disabled when API credits ran out. Without web search, the publisher cannot pull real-world context into narratives — match results, political events, breaking news. This blocks the `news` content type introduced in #037, since news-flavor narratives require external context beyond prediction market signals.

## Goal

1. Re-enable `search_news` as a DuckDuckGo-backed tool
2. Publisher can call it to fetch recent articles/snippets for a topic before writing a news-type narrative
3. If DuckDuckGo scraping is unreliable, the tool fails gracefully (returns empty results, does not crash the publisher run)

## Dependencies

- Related: #037 (publisher uses this tool when producing `content_type: 'news'` narratives)

## Scope

- `packages/brain/src/publisher-tools/search.tools.ts` — replace Firecrawl implementation with DuckDuckGo
- `packages/brain/src/publisher.ts` — re-enable `search_news` in tool list
- `packages/brain/package.json` — add `duck-duck-scrape` dependency

## Changes

### 1. Install dependency

```bash
pnpm --filter @myboon/brain add duck-duck-scrape
```

`duck-duck-scrape` is an unofficial DuckDuckGo scraper that returns organic search results without requiring an API key.

### 2. Replace search implementation

In `packages/brain/src/publisher-tools/search.tools.ts`:

```ts
import { search, SafeSearchType } from 'duck-duck-scrape'

export async function searchNews(query: string): Promise<string> {
  try {
    const results = await search(query, {
      safeSearch: SafeSearchType.OFF,
    })

    if (!results.results?.length) return 'No results found.'

    return results.results
      .slice(0, 5)
      .map(r => `${r.title}\n${r.url}\n${r.description ?? ''}`)
      .join('\n\n')
  } catch (err) {
    console.warn('[search_news] DuckDuckGo search failed:', err)
    return 'Search unavailable.'
  }
}
```

Tool definition (unchanged from Firecrawl version):

```ts
{
  name: 'search_news',
  description: 'Search for recent news and context about a topic. Use when writing a news-type narrative to ground the content in real-world events. Returns up to 5 results with title, URL, and snippet.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g. "UCL Man City Real Madrid result March 2026")' }
    },
    required: ['query']
  }
}
```

### 3. Re-enable in publisher

In `publisher.ts`, un-comment `search_news` from the tool list. Update the system prompt note:

```
search_news: use when writing news-flavor content. Search for the real-world event (match result, political development, announcement) before writing. Do not call for fomo or signal narratives — those derive from on-chain data only.
```

### 4. Fallback behaviour

If `searchNews()` returns `'Search unavailable.'`, the publisher should continue without that context — do not abort the run. The tool result is passed back to the LLM which will write a best-effort narrative using only signal data.

## Acceptance Criteria

- [ ] `duck-duck-scrape` installed in `@myboon/brain`
- [ ] `search_news` tool is active in publisher tool list
- [ ] Publisher can complete a run with `search_news` calls without throwing
- [ ] If DuckDuckGo fails, publisher logs a warning and continues (no crash)
- [ ] At least one published narrative with `content_type = 'news'` appears in DB after a publisher run with live UCL or geopolitics signals
