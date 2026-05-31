#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash infra/vps/install-systemd.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYSTEMD_DIR="$ROOT_DIR/infra/vps/systemd"

SERVICE_UNITS=(
  myboon-api.service
  myboon-collectors.service
  myboon-analyst.service
  myboon-publisher.service
  myboon-v3-market-leads.service
  myboon-v3-local-researcher.service
  myboon-v3-wallet-behavior.service
  myboon-v3-wallet-profiles.service
)

TIMER_UNITS=(
  myboon-v3-market-leads.timer
  myboon-v3-local-researcher.timer
  myboon-v3-wallet-behavior.timer
  myboon-v3-wallet-profiles.timer
)

for unit in "${SERVICE_UNITS[@]}" "${TIMER_UNITS[@]}"; do
  install -m 0644 "$SYSTEMD_DIR/$unit" "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable myboon-api myboon-collectors myboon-analyst myboon-publisher
systemctl enable "${TIMER_UNITS[@]}"

echo "Installed and enabled:"
echo "  - myboon-api"
echo "  - myboon-collectors"
echo "  - myboon-analyst"
echo "  - myboon-publisher"
echo "  - myboon-v3-market-leads.timer"
echo "  - myboon-v3-local-researcher.timer"
echo "  - myboon-v3-wallet-behavior.timer"
echo "  - myboon-v3-wallet-profiles.timer"
echo
echo "Start now with:"
echo "  sudo systemctl start myboon-api myboon-collectors myboon-analyst myboon-publisher"
echo "  sudo systemctl start myboon-v3-market-leads.timer myboon-v3-local-researcher.timer myboon-v3-wallet-behavior.timer myboon-v3-wallet-profiles.timer"
