# Issue 025 — Feed API

## Goal

Build a lightweight REST API that serves published narratives to the mobile app. Runs as a Hono server in `packages/api`, hosted on VPS alongside the collectors and brain.

---

## Context

The publisher brain (Layer 2) writes to `published_narratives` in Supabase. The mobile Feed tab needs to read these. This API is the bridge — a thin HTTP layer in front of Supabase with CORS, pagination, and a clean response shape.

---

## Package Setup

Create `packages/api/` as a new pnpm workspace package:

```
packages/api/
  src/
    index.ts          ← Hono app entry point
  package.json
  .env                ← gitignored (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT)
```

**`packages/api/package.json`:**
```json
{
  "name": "@pnldotfun/api",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx --watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

Add `packages/api` to the root `pnpm-workspace.yaml` packages list.

---

## Env Vars

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PORT=3000
```

Validate on startup — exit with clear error if missing.

---

## Supabase Client

No supabase-js. Use raw `fetch` with service role key in headers:

```ts
function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}
```

---

## Endpoints

### `GET /narratives`

Returns a list of published narratives for the feed. Ordered by `priority DESC`, then `created_at DESC`. Limit 20.

**Query params:**
- `limit` (optional, integer, max 20, default 20)

**Supabase query:**
```
GET /rest/v1/published_narratives
  ?select=id,narrative_id,content_small,tags,priority,created_at
  &order=priority.desc,created_at.desc
  &limit=20
```

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "narrative_id": "uuid",
    "content_small": "Smart money loaded...",
    "tags": ["iran", "geopolitics"],
    "priority": 9,
    "created_at": "2026-03-08T10:00:00Z"
  }
]
```

---

### `GET /narratives/:id`

Returns the full narrative by `published_narratives.id`.

**Supabase query:**
```
GET /rest/v1/published_narratives
  ?id=eq.<id>
  &select=*
  &limit=1
```

**Response `200`:**
```json
{
  "id": "uuid",
  "narrative_id": "uuid",
  "content_small": "...",
  "content_full": "...",
  "tags": ["iran"],
  "priority": 9,
  "publisher_score": 9,
  "created_at": "2026-03-08T10:00:00Z"
}
```

**Response `404`** if not found:
```json
{ "error": "Not found" }
```

---

### `GET /health`

Simple liveness check.

**Response `200`:**
```json
{ "status": "ok" }
```

---

## CORS

Enable CORS for all origins (hackathon — mobile app will call directly from Expo).

Use Hono's built-in cors middleware:
```ts
import { cors } from 'hono/cors'
app.use('*', cors())
```

---

## Error Handling

- Supabase errors → log and return `500` with `{ error: "Internal server error" }`
- Missing `:id` format or bad input → `400` with `{ error: "Bad request" }`
- Not found → `404` with `{ error: "Not found" }`
- Never expose raw Supabase error messages to the client

---

## Implementation Notes

- Use `@hono/node-server` to serve on Node.js (`serve(app, { port })`)
- Read `.env` with `dotenv/config` import at top of entry file
- Log startup: `[api] Listening on port <PORT>`
- Log each request: method + path + status code (use Hono's logger middleware)
- Keep it simple — no auth, no rate limiting, no caching for now

---

## What NOT to Build

- No auth / API keys — public for hackathon
- No x402 gating — post-MVP
- No write endpoints
- No filtering by tags or date range — limit 20 is enough for now
- No caching layer

---

## Acceptance Criteria

- [ ] `GET /health` returns `{ "status": "ok" }`
- [ ] `GET /narratives` returns up to 20 records ordered by priority desc
- [ ] `GET /narratives/:id` returns full record or 404
- [ ] CORS headers present on all responses
- [ ] Missing env vars → process exits with clear error message
- [ ] No hardcoded secrets
- [ ] `pnpm --filter @pnldotfun/api start` works from monorepo root
- [ ] Package listed in `pnpm-workspace.yaml`
- [ ] No supabase-js dependency — raw fetch only
- [ ] Reviewer subagent passes before commit
