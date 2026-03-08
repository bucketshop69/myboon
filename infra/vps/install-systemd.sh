#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash infra/vps/install-systemd.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYSTEMD_DIR="$ROOT_DIR/infra/vps/systemd"

for unit in myboon-api.service myboon-collectors.service myboon-analyst.service myboon-publisher.service; do
  install -m 0644 "$SYSTEMD_DIR/$unit" "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable myboon-api myboon-collectors myboon-analyst myboon-publisher

echo "Installed and enabled:"
echo "  - myboon-api"
echo "  - myboon-collectors"
echo "  - myboon-analyst"
echo "  - myboon-publisher"
echo
echo "Start now with:"
echo "  sudo systemctl start myboon-api myboon-collectors myboon-analyst myboon-publisher"
