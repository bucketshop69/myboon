# Entity Memory Browser PRD

Status: draft for review
Date: 2026-07-08
Owner: myboon internal tools

## Purpose

Build a simple internal database browser for myboon entity memory.

The tool should make the `entities` and `entity_memories` tables easier to use
than the Supabase table UI. It should feel like opening folders:

```text
entity folders
  -> selected entity
  -> recent-to-old memory timeline
  -> related entities and evidence
  -> raw database references when needed
```

This is not a pipeline dashboard. The first version should focus only on
understanding what entities exist, what has been saved about them, how memories
changed over time, and which other entities are related.

## Problem

Supabase is useful for direct database inspection, but it is not a good working
interface for entity memory.

The current data is spread across relational rows and JSON fields:

- `entities` stores the durable subject.
- `entity_memories` stores notes, signals, events, evidence, mentions, metrics,
  and context.
- `published_narratives` and `entity_published_history` can show which memories
  eventually became visible feed output.

The raw table UI makes it hard to answer practical questions:

```text
Which entities do we currently know about?
What has changed recently for this entity?
What evidence was saved?
Which memories are market signals, news events, or research notes?
Which entities are connected to this one?
Is this entity becoming useful, noisy, duplicated, or stale?
```

The internal user needs a clean reading surface, not a full admin console.

## Goals

- Provide a dark-mode, read-only entity browser for internal use.
- Show entities as folder-like items that can be searched, filtered, and opened.
- Show a selected entity's memory timeline from newest to oldest.
- Show related entities inferred from memory mentions, evidence, context, and
  published history.
- Keep raw database identifiers visible enough for debugging without making the
  UI feel like a table editor.
- Protect the tool behind internal API authentication.

## Non-Goals

- Do not build a full Supabase replacement.
- Do not expose service-role Supabase credentials to the browser.
- Do not edit, merge, delete, approve, or publish anything in the MVP.
- Do not include pipeline run health, worker logs, queue controls, or retry
  actions in the MVP.
- Do not create new database tables for the first version unless required by
  implementation findings.
- Do not make this public or accessible from the mobile app.

## User Experience

### Mental Model

Entities are folders.

Opening a folder shows the entity's memory file:

```text
left side: entity folders
main area: selected entity timeline
right side: related entities, entity note, DB references
```

### Default Screen

On first load:

- Select the most recently updated active entity.
- Show all entity folders in the left rail.
- Sort folders by `updated_at DESC`.
- Show the selected entity's timeline sorted by `observed_at DESC`.
- Show a compact summary of memory count, latest memory time, source mix, and
  evidence count.

### Entity Folder List

Each entity folder should show:

```text
name
type
status
last updated time
memory count
small type marker or icon
```

Required controls:

- Search by name, slug, alias, type, and mention text.
- Filter by type.
- Filter by status.
- Sort by recently updated, most memories, or alphabetical.

The MVP can hardcode the available filter options from fetched data.

### Entity Detail

The selected entity header should show:

```text
entity name
slug
type
status
summary
aliases
created_at
updated_at
```

The page should also show compact stats:

```text
memory count
latest memory
source count
evidence count
related entity count
published narrative count
```

### Timeline

The timeline should read from recent to old.

Each memory item should show:

```text
observed_at
event_at when available
memory_type
title
summary
source / source_area
confidence
evidence count
mentions count
source_ref_id
source_research_id
```

Expanded memory details should show:

```text
body
evidence JSON, formatted for reading
mentions JSON, formatted for reading
metrics JSON, formatted for reading
context JSON, formatted for reading
created_at
updated_at
```

The default view should keep JSON collapsed so the page remains readable.

### Related Entities

The related entities panel should start as an inferred view.

First version relationship sources:

- `entity_memories.mentions`
- entity slugs or names inside `entity_memories.context`
- `published_narratives.entity_id`
- `entity_published_history.entity_id`

Each related entity row should show:

```text
entity name
type
relationship reason
number of shared memories or mentions
latest shared observation time
```

If relationship inference is weak, label it as inferred.

## Data Sources

Primary tables:

```text
entities
entity_memories
```

Optional enrichment tables:

```text
published_narratives
entity_published_history
```

Do not query candidate, research, editor, or pipeline tables in the MVP unless a
memory row links to them through `source_ref_id` or `source_research_id`.

## API Design

The browser should call the myboon API, not Supabase directly.

All internal routes should require an internal token:

```text
Authorization: Bearer <INTERNAL_DASHBOARD_TOKEN>
```

The server should keep using `SUPABASE_SERVICE_ROLE_KEY` only on the backend.

### `GET /internal/entities`

Query params:

```text
q?: string
type?: string
status?: string
sort?: updated_desc | memory_count_desc | name_asc
limit?: number
cursor?: string
```

Response:

```ts
interface InternalEntityListResponse {
  entities: InternalEntityListItem[]
  nextCursor: string | null
}

interface InternalEntityListItem {
  id: string
  slug: string
  name: string
  type: string
  status: string
  aliases: string[]
  summary: string | null
  memoryCount: number
  latestMemoryAt: string | null
  createdAt: string
  updatedAt: string
}
```

### `GET /internal/entities/:id`

Response:

```ts
interface InternalEntityDetailResponse {
  entity: InternalEntityDetail
  stats: InternalEntityStats
  relatedEntities: InternalRelatedEntity[]
  publishedHistory: InternalPublishedHistoryItem[]
}

interface InternalEntityDetail {
  id: string
  slug: string
  name: string
  type: string
  status: string
  aliases: string[]
  summary: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface InternalEntityStats {
  memoryCount: number
  latestMemoryAt: string | null
  sourceCount: number
  evidenceCount: number
  relatedEntityCount: number
  publishedNarrativeCount: number
}

interface InternalRelatedEntity {
  id: string
  slug: string
  name: string
  type: string
  reason: string
  sharedMemoryCount: number
  latestObservedAt: string | null
  inference: "direct" | "inferred"
}

interface InternalPublishedHistoryItem {
  id: string
  publishedNarrativeId: string
  title: string | null
  angle: string | null
  source: string | null
  sourceArea: string | null
  publishedAt: string
}
```

### `GET /internal/entities/:id/timeline`

Query params:

```text
memory_type?: string
source?: string
limit?: number
cursor?: string
```

Response:

```ts
interface InternalEntityTimelineResponse {
  memories: InternalEntityMemoryItem[]
  nextCursor: string | null
}

interface InternalEntityMemoryItem {
  id: string
  entityId: string
  source: string
  sourceArea: string
  sourceType: string
  sourceRefId: string
  sourceResearchId: string
  memoryType: string
  title: string
  summary: string
  body: string | null
  eventAt: string | null
  observedAt: string
  confidence: number | null
  evidence: unknown[]
  mentions: unknown[]
  metrics: Record<string, unknown>
  context: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

## UI Requirements

The app should be dark mode by default.

Visual direction:

- quiet, utilitarian internal tool
- dense enough to scan many entities
- folder-like entity navigation
- clear recent-to-old timeline
- readable JSON panels when expanded
- no marketing hero, no pipeline diagram, no decorative cards

Primary layout:

```text
┌────────────────────────────┬───────────────────────────────────────────────┐
│ Entity folders             │ Selected entity                               │
│ Search / filters           │ Stats                                         │
│                            │ Timeline                                      │
│ Ethereum        24 mem     │ 17:18  ETF inflow surprise...                 │
│ Solana          19 mem     │ 16:44  Staking rotation...                    │
│ Polymarket      17 mem     │ 15:09  Duplicate ETH references merged...     │
│ ...                        │                                               │
│                            │ Right rail: related entities, raw references  │
└────────────────────────────┴───────────────────────────────────────────────┘
```

## Implementation Scope

Create or modify:

- `packages/api/src/internal/entities.ts` — internal entity list, detail, and
  timeline routes.
- `packages/api/src/index.ts` — mount internal routes and validate required
  internal auth env.
- `packages/api/.env.example` — document `INTERNAL_DASHBOARD_TOKEN`.
- `apps/web/src/app/internal/entities/page.tsx` — server page for internal
  entity memory browser.
- `apps/web/src/app/internal/entities/EntityMemoryBrowser.tsx` — client-side
  folder navigation, filters, selected entity state, and timeline rendering.
- `apps/web/src/app/internal/entities/LoginPanel.tsx` — internal token gate for
  users without an active internal session.
- `apps/web/src/app/internal/entities/session/route.ts` — creates and clears the
  httpOnly internal session cookie.
- `apps/web/src/app/internal/entities/api/entities/**/route.ts` — same-origin
  proxy routes that forward to the myboon API with the internal bearer token
  server-side.
- `apps/web/src/app/internal/entities/_lib/server.ts` — server-only session,
  token, and API proxy helpers.
- `apps/web/src/app/internal/entities/types.ts` — shared UI response types.
- `apps/web/src/app/internal/entities/styles.module.css` — dark-mode page
  styling for the browser.
- `apps/web/.env.example` — document internal API base URL and dashboard token
  usage if the web app fetches the API directly.
- `docs/PRDs/entity memory browser PRD.md` — this PRD.

## DB Migration

No migration is required for the MVP.

The existing schema already has the minimum required tables:

```text
entities
entity_memories
published_narratives
entity_published_history
```

If entity relationship inference becomes important enough to preserve rather
than compute, create a later PRD for a dedicated relationship table.

## Security

- Internal routes must reject requests without `INTERNAL_DASHBOARD_TOKEN`.
- `INTERNAL_DASHBOARD_TOKEN` must be at least 32 random bytes and be stored only
  in private API/web deployment configuration.
- Browser sessions must be signed, short-lived, HTTP-only cookies; never store
  the reusable dashboard token in a browser cookie.
- The internal API must not emit permissive CORS headers.
- The token must never use a `NEXT_PUBLIC_` prefix.
- The browser must never receive `SUPABASE_SERVICE_ROLE_KEY`.
- Internal API responses should avoid dumping very large raw payloads by
  default.
- JSON details should be available per memory item after expansion, not loaded
  as one unbounded payload on first page load.

## Performance

- Entity list should be paginated.
- Timeline should be paginated.
- Entity summary statistics should be calculated in one server-side aggregate,
  rather than one database request per displayed entity.
- Default entity list limit: 50.
- Default timeline limit: 30.
- Sort timeline by `observed_at DESC, created_at DESC`.
- Do not fetch all memories for all entities on initial page load.
- Compute memory counts and latest memory times server-side.

## Hosted Web Validation

The current `apps/web` deployment is the public landing site. This work must not
replace, regress, or publicly expose that landing screen.

Required validation:

- `/` remains the existing landing page route.
- `/world` and `/changelog`, if currently shipped, continue to render.
- The entity browser lives only under `/internal/entities` or another explicitly
  internal route.
- No public landing-page nav, CTA, sitemap, or metadata links to
  `/internal/entities`.
- `/internal/entities` is not useful without internal auth/API token access.
- Public browser bundles do not contain `SUPABASE_SERVICE_ROLE_KEY` or
  `INTERNAL_DASHBOARD_TOKEN`.
- `pnpm --filter @myboon/web build` succeeds.
- Render/screenshot checks pass for both `/` and `/internal/entities` at desktop
  width.
- Render/screenshot checks pass for `/internal/entities` at mobile width with no
  horizontal scrolling.
- API validation confirms missing/invalid internal token returns `401` for all
  `/internal/entities*` endpoints.
- API validation confirms valid internal token returns entity list/detail/timeline
  payloads in the TypeScript response shapes above.

## Acceptance Criteria

- Opening `/internal/entities` shows a dark-mode entity folder browser.
- The first selected entity is the most recently updated active entity with at
  least one memory.
- Searching by entity name, slug, alias, or type updates the folder list.
- Clicking an entity folder updates the selected entity detail without a full
  page reload.
- The selected entity timeline is sorted from newest to oldest.
- Each timeline row shows `memory_type`, `title`, `summary`, `source`,
  `observed_at`, confidence, and evidence count.
- Expanding a timeline row shows body, evidence, mentions, metrics, context,
  `source_ref_id`, and `source_research_id`.
- Related entities appear in a side panel with a reason and inference label.
- API requests without the internal token return `401`.
- No browser bundle contains `SUPABASE_SERVICE_ROLE_KEY`.
- No browser bundle contains `INTERNAL_DASHBOARD_TOKEN`.
- The existing public landing page at `/` still renders after the change.
- The page remains usable on a laptop-width viewport and does not require
  horizontal scrolling.

## Future Work

- Entity merge workflow.
- Manual memory annotation.
- Relationship graph view.
- Duplicate memory warnings.
- Stale entity view.
- Evidence quality scoring.
- Link from a published feed item back to the entity memory timeline.
- Link from a memory item back to source candidate or research rows when useful.
