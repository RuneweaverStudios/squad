#!/bin/bash
# Launch squad-search CLI.
# Auto-installs npm dependencies on first run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies if needed
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "[squad-search] Installing dependencies..." >&2
  cd "$SCRIPT_DIR" && npm install --silent 2>&1 >&2
fi

# Run the CLI
exec node "$SCRIPT_DIR/index.js" "$@"
