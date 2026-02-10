#!/bin/bash
# Launch jat-memory CLI.
# Auto-installs npm dependencies on first run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies if needed
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "[jat-memory] Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --silent
fi

# Run the CLI
exec node "$SCRIPT_DIR/index.js" "$@"
