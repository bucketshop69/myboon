#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/myboon}"
BRANCH="${BRANCH:-main}"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Repo not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

echo "Fetching latest from $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building workspace packages..."
pnpm --filter @myboon/shared build
pnpm --filter @myboon/entity-memory build
pnpm --filter @myboon/tx-parser build
pnpm --filter @myboon/collectors build
pnpm --filter @myboon/brain build

echo "Restarting services..."
sudo systemctl restart myboon-api myboon-collectors myboon-analyst myboon-publisher
sudo systemctl restart myboon-v3-market-leads.timer myboon-v3-local-researcher.timer myboon-v3-wallet-behavior.timer myboon-v3-wallet-profiles.timer || true

echo "Service status:"
sudo systemctl --no-pager --full status myboon-api myboon-collectors myboon-analyst myboon-publisher | sed -n '1,80p'
echo
echo "V3 timer status:"
sudo systemctl --no-pager --full status myboon-v3-market-leads.timer myboon-v3-local-researcher.timer myboon-v3-wallet-behavior.timer myboon-v3-wallet-profiles.timer | sed -n '1,120p' || true
