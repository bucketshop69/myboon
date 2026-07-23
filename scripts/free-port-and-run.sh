#!/usr/bin/env bash
# Frees a port before running a command, but only kills a process that is
# actually LISTENING on that port and looks like a leftover dev server
# (node/tsx/bun/deno). Never kills based on lsof -i alone, since that also
# matches processes with an unrelated transient connection touching the
# port (e.g. browser helpers) — killing those would be unrelated collateral
# damage, not "freeing the dev server's port".
#
# Usage: free-port-and-run.sh <port> -- <command> [args...]

set -euo pipefail

port="$1"
shift
if [ "$1" != "--" ]; then
  echo "Usage: free-port-and-run.sh <port> -- <command> [args...]" >&2
  exit 1
fi
shift

pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n1 || true)"

if [ -n "$pid" ]; then
  cmd="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
  full_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"

  case "$cmd" in
    *node*|*tsx*|*bun*|*deno*)
      echo "Port $port is held by PID $pid ($cmd) — looks like a leftover dev server, killing it."
      echo "  command was: $full_cmd"
      kill "$pid"
      # give it a moment to release the socket before we bind to it again
      for _ in $(seq 1 20); do
        if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
          break
        fi
        sleep 0.25
      done
      ;;
    *)
      echo "Port $port is held by PID $pid ($cmd), which does not look like a node/tsx dev server." >&2
      echo "Refusing to kill it automatically — free the port yourself and re-run, or investigate:" >&2
      echo "  ps -p $pid -o pid,command" >&2
      exit 1
      ;;
  esac
else
  echo "Port $port is free."
fi

exec "$@"
