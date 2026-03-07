# Issue 022 — Narrative Analyst Tool Calling

## Goal

Give the narrative analyst the ability to call Polymarket tools mid-analysis so it can fetch live market context (current odds, volume, order book) before drawing conclusions. Built on the existing tool infrastructure in `packages/brain/src/research/tools/`.

---

## Problem

The analyst currently works from stale signal metadata only. Example: a WHALE_BET signal says "wallet bet $29k on England" but doesn't include current odds. The analyst concluded "England bias" — but England was trading at 20% odds, making it a contrarian bet. Without odds context, the analyst produces wrong or weak observations.

---

## Context — Existing Tool Infrastructure

`packages/brain/src/research/` already has:
- `types/mcp.ts` — `ResearchTool`, `AnthropicToolDefinition`, `ToolCall`, `ToolResult` types
- `tools/registry.ts` — `createResearchToolRegistry()` pattern
- `tools/data-source.tools.ts` — `get_token_metadata` tool (Jupiter)
- `agent.ts` — research agent that runs tool-use loops with MiniMax

**Do not reinvent this.** The analyst should follow the same pattern.

---

## What to Build

### 1. Polymarket tools (`packages/brain/src/research/tools/polymarket.tools.ts`)

New tool file following the existing `data-source.tools.ts` pattern:

```ts
export function createPolymarketTools(client: PolymarketClient): ResearchTool<any>[]
```

Tools to implement:

**`get_market_snapshot`**
```
Input:  { slug: string }
Output: { yesPrice, noPrice, volume, endDate, title, fetchedAt }
Use:    Analyst calls this when it sees ODDS_SHIFT or WHALE_BET to get current odds
```

**`get_market_by_condition`**
```
Input:  { conditionId: string }
Output: { slug, title, yesPrice, noPrice, volume } or null
Use:    Resolve conditionId from WHALE_BET metadata to get market context
```

Both use `PolymarketClient` from `@pnldotfun/shared` (depends on issue 021).

---

### 2. Analyst tool-use loop (`packages/brain/src/narrative-analyst.ts`)

Upgrade `clusterNarratives()` to support tool calling:

**Current flow:**
```
signals → one LLM call → JSON narratives
```

**New flow:**
```
signals → LLM call with tools →
  if tool_use: execute tools, feed results back →
  next LLM call → ... until stop_reason = end_turn →
  parse final JSON narratives
```

The LLM decides when to call tools. It might call `get_market_snapshot("eng-vs-ind")` before writing its observation on that cluster.

**Prompt addition** — tell the analyst it has tools:
```
You have tools available to fetch live Polymarket data.
Before writing an observation about a market, call get_market_snapshot
to check current odds. If a whale bet on the lower-probability side,
flag it as a contrarian position.
```

**Implementation notes:**
- Use Anthropic `tools` format in the MiniMax request (MiniMax supports this via Anthropic-compatible API)
- Cap tool-use iterations at 10 (same as research agent pattern)
- Tool errors return `{ error: string }` — analyst continues without crashing
- Final response still returns the same JSON narrative array format

---

### 3. Register Polymarket tools

Update `packages/brain/src/research/tools/registry.ts` to include Polymarket tools when a `PolymarketClient` is provided:

```ts
export function createResearchToolRegistry(
  memory: EntityMemory,
  options?: ResearchToolRegistryOptions & { polymarketClient?: PolymarketClient }
)
```

Or — simpler for the analyst — create the tool list inline in the analyst without modifying the research registry (since the analyst doesn't use EntityMemory).

**Recommended:** create a separate `createAnalystToolRegistry()` in the analyst file for now. Keep research tools and analyst tools separate until there's a clear reason to merge.

---

## Where `apps/mcp` Fits (Out of Scope for Now)

`apps/mcp` is a standalone MCP server (Fastify + WebSocket). Its purpose is exposing tools to **external** MCP clients (Claude Desktop, third-party LLM apps). That is a different use case — do not use it for this issue. Leave `apps/mcp` as-is.

---

## Dependencies

- **Issue 021 must be completed first** — analyst tools use `PolymarketClient` from `@pnldotfun/shared`

---

## Acceptance Criteria

- [ ] `get_market_snapshot` tool callable by analyst, returns live yes/no prices
- [ ] `get_market_by_condition` tool resolves conditionId to market context
- [ ] Analyst prompt instructs LLM to use tools before drawing conclusions
- [ ] Tool-use loop runs correctly — tools execute, results feed back into LLM
- [ ] Observations in narratives table reference actual odds (e.g. "whale bet on 20% England — contrarian")
- [ ] Max 10 tool-call iterations enforced
- [ ] Tool failures don't crash the analyst run
- [ ] Reviewer subagent passes before commit
