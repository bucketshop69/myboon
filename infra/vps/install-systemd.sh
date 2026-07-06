#!/usr/bin/env bash
set -euo pipefail

echo "Deprecated: myboon VPS workers are managed by PM2 via ecosystem.config.cjs."
echo "Use: pm2 startOrReload ecosystem.config.cjs --update-env"
exit 1
