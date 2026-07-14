# VPS Deploy — myboon

## Processes managed by PM2

| Name | Package | Schedule |
|------|---------|---------|
| `myboon-api` | `packages/api` | persistent HTTP server (port 3000) |
| `myboon-polymarket-data-engineer` | `packages/collectors` | Polymarket markets Data Engineer |
| `myboon-polymarket-researcher` | `packages/collectors` | Polymarket Researcher |
| `myboon-polymarket-entity-manager` | `packages/collectors` | Polymarket ResearchPacket to Entity Memory |
| `myboon-news-runner` | `packages/collectors` | Curated news source scout/research loop |
| `myboon-news-entity-manager` | `packages/collectors` | News ResearchPacket to Entity Memory |
| `myboon-editor-draft` | `packages/collectors` | Entity Memory to Editor Draft |
| `myboon-publisher` | `packages/collectors` | Generic Editor Draft Publisher |

PM2 is the source of truth for VPS runtime. `infra/vps/systemd/*` is deprecated and should not be installed for the current Feed pipeline.

---

## First-time VPS setup

```bash
# 1. Install PM2 globally
npm install -g pm2

# 2. Clone repo and install deps
git clone <repo> myboon && cd myboon
pnpm install

# 3. Create .env files (never committed)
#    packages/api/.env
#    packages/collectors/.env

# 4. Start all processes
pm2 start ecosystem.config.cjs

# 5. Save process list and enable startup on reboot
pm2 save
pm2 startup   # run the printed command as root/sudo
```

---

## Day-to-day operations

```bash
# Pull latest and reload (zero-downtime for API)
# Apply pending Supabase migrations first when new migrations exist.
# For this PR, apply:
# - supabase/migrations/20260706_pipeline_runs.sql
# - supabase/migrations/20260706_news_source_state.sql
# - supabase/migrations/20260710041040_internal_entity_browser_security.sql
infra/vps/deploy.sh

# Or manually:
git pull --ff-only && pnpm install --frozen-lockfile
pnpm --filter @myboon/shared build
pnpm --filter @myboon/tx-parser build
pnpm --filter @myboon/collectors build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

# Watch all logs
pm2 logs

# Watch a specific process
pm2 logs myboon-api
pm2 logs myboon-polymarket-researcher

# Process status overview
pm2 list

# Interactive monitor (CPU/memory/logs)
pm2 monit

# Restart a single process
pm2 restart myboon-polymarket-data-engineer
pm2 restart myboon-polymarket-researcher
pm2 restart myboon-polymarket-entity-manager
pm2 restart myboon-editor-draft
pm2 restart myboon-publisher

# Stop everything
pm2 stop all

# Delete all (nuclear — re-run start after)
pm2 delete all
```

---

## .env reference

Each package loads its own `.env` via `dotenv/config`. PM2 sets `cwd` to the package directory so dotenv finds the right file.

### `packages/api/.env`
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
INTERNAL_DASHBOARD_TOKEN=
INTERNAL_ENTITY_WRITE_TOKEN=
PORT=3000
```

### Internal entity browser web environment

The public web deployment may host `/internal/entities`, but this route is not
public data. Configure these values in the deployment provider's private
environment-variable store only. Do not add secret values to source files,
GitHub issues, CI logs, or browser-accessible `NEXT_PUBLIC_*` variables.

```text
INTERNAL_DASHBOARD_TOKEN=
INTERNAL_DASHBOARD_SESSION_SECRET=
INTERNAL_ENTITY_WRITE_TOKEN=
INTERNAL_API_BASE_URL=https://internal-api.example.com
```

Use the same `INTERNAL_DASHBOARD_TOKEN` for the API and web deployments. Use a
separate `INTERNAL_ENTITY_WRITE_TOKEN` for privileged preview/apply operations,
and configure it only on the API and web server. Generate all secrets
independently with at least 32 random bytes, for example:

```bash
openssl rand -base64 48
```

`INTERNAL_API_BASE_URL` is server-to-server only. Keep the API on a private
network or allow it only from the web deployment where the platform supports
network allowlists. The browser must never call the API host directly.

Before deploying the API that calls the aggregate RPC, apply the migration:

```bash
pnpm dlx supabase db push
```

### `packages/collectors/.env`
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
POLYMARKET_MARKETS_RUN_ONCE=0
POLYMARKET_RESEARCHER_RUN_ONCE=0
ENTITY_MANAGER_POLYMARKET_RUN_ONCE=0
ENTITY_MANAGER_POLYMARKET_INTERVAL_MS=300000
ENTITY_MANAGER_POLYMARKET_BATCH_SIZE=20
NEWS_RUNNER_RUN_ONCE=0
NEWS_RUNNER_INTERVAL_MS=3600000
NEWS_RUNNER_BATCH_SIZE=1
ENTITY_MANAGER_NEWS_RUN_ONCE=0
ENTITY_MANAGER_NEWS_INTERVAL_MS=300000
ENTITY_MANAGER_NEWS_BATCH_SIZE=20
EDITOR_DRAFT_RUN_ONCE=0
EDITOR_DRAFT_INTERVAL_MS=3600000
EDITOR_DRAFT_BATCH_SIZE=2
PUBLISHER_RUN_ONCE=0
PUBLISHER_INTERVAL_MS=300000
PUBLISHER_BATCH_SIZE=10
PUBLISHER_PREVIEW_ONLY=0
```

---

## Smoke test (after deploy)

```bash
curl http://localhost:3000/health
# {"status":"ok"}

pnpm --filter @myboon/api smoke
```
