# VPS Deploy — myboon

## Processes managed by PM2

| Name | Package | Schedule |
|------|---------|---------|
| `myboon-api` | `packages/api` | persistent HTTP server (port 3000) |
| `myboon-collectors` | `packages/collectors` | persistent (internal cron: 2h discovery, 5min whale tracker, WebSocket stream) |
| `myboon-analyst` | `packages/brain` | persistent (self-schedules every 15min via setInterval) |
| `myboon-publisher` | `packages/brain` | persistent (self-schedules every 30min via setInterval) |

## V3 background collectors

V3 market collection is timer-driven and one-shot. These jobs are installed as
systemd timers so they can run alongside the existing long-running services
without changing the V2 feed path.

| Timer | Command | Cadence | Writes |
| --- | --- | ---: | --- |
| `myboon-v3-market-leads.timer` | `pnpm --filter @myboon/collectors hyperliquid:research-leads` | 15min | local JSON lead batches |
| `myboon-v3-local-researcher.timer` | `pnpm --filter @myboon/brain intelligence:hyperliquid:local-researcher` | 15min | local research packets, entity books, entity notes |
| `myboon-v3-wallet-behavior.timer` | `pnpm --filter @myboon/collectors hyperliquid:wallet-behavior` | 30min | local JSON lead batches |
| `myboon-v3-wallet-profiles.timer` | `pnpm --filter @myboon/collectors hyperliquid:wallet-profiles` | 6h | artifact only |

These collectors do not write to `published_narratives`. They only fill the V3
researcher inbox. The current local-first handoff uses files under
`/var/lib/myboon/v3`:

```text
/var/lib/myboon/v3/
  collection-leads/
    pending/
    processed/
    failed/
  research-packets/
  entity-books/
  entity-notes/
```

Required V3 env:

```bash
V3_LOCAL_DATA_DIR=/var/lib/myboon/v3
V3_RESEARCH_SEARCH_PROVIDER=disabled
```

Optional later: set `V3_RESEARCH_SEARCH_PROVIDER=searxng` and
`V3_RESEARCH_SEARXNG_URL=http://127.0.0.1:8080` after a local SearXNG instance
is running. This adds no paid search API dependency.

Install/start systemd units:

```bash
sudo bash infra/vps/install-systemd.sh
sudo systemctl start myboon-v3-market-leads.timer myboon-v3-local-researcher.timer myboon-v3-wallet-behavior.timer myboon-v3-wallet-profiles.timer
```

Useful checks:

```bash
systemctl list-timers 'myboon-v3-*'
journalctl -u myboon-v3-market-leads.service -n 100 --no-pager
journalctl -u myboon-v3-local-researcher.service -n 100 --no-pager
journalctl -u myboon-v3-wallet-behavior.service -n 100 --no-pager
pnpm --filter @myboon/collectors hyperliquid:collection-health
find /var/lib/myboon/v3 -maxdepth 3 -type f | sort | tail -50
```

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
#    packages/brain/.env
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
git pull && pnpm install
pm2 reload ecosystem.config.cjs

# Watch all logs
pm2 logs

# Watch a specific process
pm2 logs myboon-api
pm2 logs myboon-analyst

# Process status overview
pm2 list

# Interactive monitor (CPU/memory/logs)
pm2 monit

# Restart a single process
pm2 restart myboon-collectors

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
PORT=3000
```

### `packages/brain/.env`
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MINIMAX_API_KEY=
FIRECRAWL_API_KEY=
V3_LOCAL_DATA_DIR=/var/lib/myboon/v3
V3_RESEARCH_SEARCH_PROVIDER=disabled
```

### `packages/collectors/.env`
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
POLYMARKET_API_KEY=   # if required
HYPERLIQUID_COLLECTION_LEADS_WRITE=0
V3_LOCAL_DATA_DIR=/var/lib/myboon/v3
```

---

## Smoke test (after deploy)

```bash
curl http://localhost:3000/health
# {"status":"ok"}

pnpm --filter @myboon/api smoke
```
