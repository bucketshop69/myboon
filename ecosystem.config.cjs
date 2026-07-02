/**
 * PM2 ecosystem — myboon Polymarket collector/researcher services
 *
 * Start:   pm2 start ecosystem.config.cjs
 * Reload:  pm2 reload ecosystem.config.cjs
 * Stop:    pm2 stop all
 * Logs:    pm2 logs
 * Monitor: pm2 monit
 *
 * One-time VPS setup:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   ← run the printed command as root
 *
 * Env vars are loaded by each package from its own .env file.
 * Collectors also allow the monorepo root .env as a fallback.
 *
 * NOTE: Uses ./node_modules/.bin/tsx instead of `node --import tsx/esm`
 * because Node 22 has ERR_REQUIRE_CYCLE_MODULE bugs with the ESM loader.
 */
const ROOT = __dirname
const TSX = `${ROOT}/node_modules/.bin/tsx`

module.exports = {
  apps: [
    {
      name: 'myboon-polymarket-data-engineer',
      script: 'src/polymarket/run-markets-data-engineer.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/collectors`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        POLYMARKET_MARKETS_RUN_ONCE: '0',
        POLYMARKET_MARKETS_PREVIEW_ONLY: '0',
        POLYMARKET_MARKETS_RUN_INTERVAL_MS: '7200000',
      },
    },
    {
      name: 'myboon-polymarket-researcher',
      script: 'src/polymarket/run-researcher.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/collectors`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myboon-editor-draft',
      script: 'src/editor-draft/run.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/collectors`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        EDITOR_DRAFT_RUN_ONCE: '0',
        EDITOR_DRAFT_INTERVAL_MS: '1800000',
        EDITOR_DRAFT_BATCH_SIZE: '2',
        EDITOR_DRAFT_RECENT_MEMORY_LIMIT: '3',
        EDITOR_DRAFT_LANE_MEMORY_LIMIT: '20',
        EDITOR_DRAFT_PRIOR_DRAFT_LIMIT: '10',
        EDITOR_DRAFT_PUBLISHED_HISTORY_LIMIT: '10',
      },
    },
  ],
}
