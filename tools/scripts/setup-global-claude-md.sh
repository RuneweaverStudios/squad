#!/bin/bash

# Setup Global Claude Configuration
# - Symlinks agent coordination commands from jat/commands/jat/ to ~/.claude/commands/jat/
# - Source of truth: ~/code/jat/commands/jat/*.md
# - No longer writes to ~/.claude/CLAUDE.md (imports handled per-project)

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Setting up global Claude Code configuration...${NC}"
echo ""

# Ensure ~/.claude directory exists
mkdir -p ~/.claude
mkdir -p ~/.claude/commands/jat

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Resolve to absolute path (avoids /../ in symlinks)
COMMANDS_SOURCE="$( cd "$SCRIPT_DIR/../../commands/jat" && pwd )"

# Install agent coordination commands as symlinks (SOT: jat/commands/jat/)
if [ -d "$COMMANDS_SOURCE" ]; then
    echo "  → Installing agent coordination commands (symlinks)..."
    COMMAND_COUNT=0

    # Remove any existing files/symlinks and create fresh symlinks
    for cmd_file in "$COMMANDS_SOURCE"/*.md; do
        if [ -f "$cmd_file" ]; then
            fname=$(basename "$cmd_file")
            # Remove existing file/symlink if present
            rm -f ~/.claude/commands/jat/"$fname"
            # Create symlink to source
            ln -s "$cmd_file" ~/.claude/commands/jat/"$fname"
            COMMAND_COUNT=$((COMMAND_COUNT + 1))
        fi
    done

    echo -e "${GREEN}  ✓ Installed $COMMAND_COUNT coordination commands (symlinked)${NC}"
    echo "    Source: $COMMANDS_SOURCE/"
    echo "    Target: ~/.claude/commands/jat/"
    echo ""
fi

# Create default JAT projects config if it doesn't exist
CONFIG_DIR="$HOME/.config/jat"
CONFIG_FILE="$CONFIG_DIR/projects.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "  → Creating default projects config..."
    mkdir -p "$CONFIG_DIR"

    # Get the JAT install directory (2 levels up from this script)
    JAT_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"

    cat > "$CONFIG_FILE" << EOF
{
  "projects": {
    "jat": {
      "name": "JAT",
      "path": "$JAT_DIR",
      "port": 3333,
      "description": "Jomarchy Agent Tools - Multi-agent coordination dashboard"
    }
  },
  "defaults": {
    "terminal": "alacritty",
    "editor": "code",
    "tools_path": "~/.local/bin",
    "claude_flags": "--dangerously-skip-permissions",
    "model": "opus",
    "agent_stagger": 15,
    "claude_startup_timeout": 20
  }
}
EOF
    echo -e "${GREEN}  ✓ Created default projects config${NC}"
    echo "    Location: $CONFIG_FILE"
    echo ""
    echo "    Add more projects via:"
    echo "      • Dashboard UI (Add Project button)"
    echo "      • Edit $CONFIG_FILE manually"
    echo ""
else
    echo -e "${GREEN}  ✓${NC} Projects config already exists"
    echo "    Location: $CONFIG_FILE"
    echo ""
fi

echo -e "${GREEN}  ✓ Global configuration complete${NC}"
echo ""
echo "  Agent commands available via /jat:* namespace"
echo "  Project-specific docs are imported via @~/code/jat/shared/*.md"
echo ""
