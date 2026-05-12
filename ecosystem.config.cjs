/**
 * PM2 ecosystem — myboon VPS services
 *
 * Start:   pm2 start ecosystem.config.cjs
 * Reload:  pm2 reload ecosystem.config.cjs   (zero-downtime for API)
 * Stop:    pm2 stop all
 * Logs:    pm2 logs
 * Monitor: pm2 monit
 *
 * One-time VPS setup:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   ← run the printed command as root
 *
 * Env vars are loaded from .env at the monorepo root — never hardcode secrets here.
 *
 * NOTE: Uses ./node_modules/.bin/tsx instead of `node --import tsx/esm`
 * because Node 22 has ERR_REQUIRE_CYCLE_MODULE bugs with the ESM loader.
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const ROOT = __dirname
const TSX = `${ROOT}/node_modules/.bin/tsx`

module.exports = {
  apps: [
    {
      name: 'myboon-api',
      script: 'src/index.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/api`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myboon-collectors',
      script: 'src/index.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/collectors`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myboon-analyst',
      // Self-schedules via setInterval every 15min — PM2 just keeps it alive
      script: 'src/narrative-analyst.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/brain`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myboon-publisher',
      // Self-schedules via setInterval every 30min — PM2 just keeps it alive
      script: 'src/publisher.ts',
      interpreter: TSX,
      cwd: `${ROOT}/packages/brain`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
