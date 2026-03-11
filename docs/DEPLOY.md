# VPS Deploy — myboon

## Processes managed by PM2

| Name | Package | Schedule |
|------|---------|---------|
| `myboon-api` | `packages/api` | persistent HTTP server (port 3000) |
| `myboon-collectors` | `packages/collectors` | persistent (internal cron: 2h discovery, 5min whale tracker, WebSocket stream) |
| `myboon-analyst` | `packages/brain` | persistent (self-schedules every 15min via setInterval) |
| `myboon-publisher` | `packages/brain` | persistent (self-schedules every 30min via setInterval) |

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
```

### `packages/collectors/.env`
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
POLYMARKET_API_KEY=   # if required
```

---

## Smoke test (after deploy)

```bash
curl http://localhost:3000/health
# {"status":"ok"}

pnpm --filter @myboon/api smoke
```
