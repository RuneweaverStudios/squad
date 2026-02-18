#!/bin/bash
# Launch squad-scheduler daemon.
# Called by IDE /api/scheduler/start endpoint.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies if needed
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "[scheduler] Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --silent
fi

# Start the scheduler
exec node "$SCRIPT_DIR/index.js" "$@"
