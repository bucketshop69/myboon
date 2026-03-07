#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env file not found in $SCRIPT_DIR"
  exit 1
fi

echo "Starting Polymarket collectors..."
npx tsx src/index.ts
