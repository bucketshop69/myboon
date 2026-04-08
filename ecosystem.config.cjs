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
 */

const ROOT = __dirname

module.exports = {
  apps: [
    {
      name: 'myboon-api',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
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
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
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
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
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
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: `${ROOT}/packages/brain`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myboon-nansen-collector',
      script: 'src/nansen/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: `${ROOT}/packages/collectors`,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myboon-fomo-master',
      script: './packages/brain/src/run-fomo-master.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cron_restart: '0 */1 * * *',
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'myboon-crypto-god',
      script: './packages/brain/src/run-crypto-god.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cron_restart: '30 * * * *',   // offset 30min from fomo_master to spread LLM load
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'myboon-sports-broadcaster',
      script: './packages/brain/src/run-sports-broadcaster.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cron_restart: '0 * * * *',
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'myboon-influencer',
      script: './packages/brain/src/run-influencer.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cron_restart: '0 */2 * * *',
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
}
