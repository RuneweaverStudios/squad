#!/bin/bash

# Setup Global Claude Configuration
# - Creates ~/.claude/CLAUDE.md with universal tool docs (browser, media, db)
# - Symlinks agent coordination commands from jat/commands/jat/ to ~/.claude/commands/jat/
# - Source of truth: ~/code/jat/commands/jat/*.md

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
JAT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Create/update ~/.claude/CLAUDE.md with universal tool docs
GLOBAL_CLAUDE_MD="$HOME/.claude/CLAUDE.md"
GLOBAL_TOOLS_IMPORT="@~/code/jat/shared/global-tools.md"

if [ ! -f "$GLOBAL_CLAUDE_MD" ]; then
    echo "  → Creating global CLAUDE.md (universal tool docs)..."
    cat > "$GLOBAL_CLAUDE_MD" << 'EOF'
# Global Tools

Tools available on PATH (`~/.local/bin/`) for image generation, browser automation, database queries, and credentials.

@~/code/jat/shared/global-tools.md
EOF
    echo -e "${GREEN}  ✓ Created ~/.claude/CLAUDE.md${NC}"
    echo ""
elif ! grep -qF "$GLOBAL_TOOLS_IMPORT" "$GLOBAL_CLAUDE_MD"; then
    echo "  → Adding global-tools import to existing CLAUDE.md..."
    echo "" >> "$GLOBAL_CLAUDE_MD"
    echo "$GLOBAL_TOOLS_IMPORT" >> "$GLOBAL_CLAUDE_MD"
    echo -e "${GREEN}  ✓ Added global-tools import to ~/.claude/CLAUDE.md${NC}"
    echo ""
else
    echo -e "${GREEN}  ✓${NC} Global CLAUDE.md already has tool docs"
    echo ""
fi
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

    cat > "$CONFIG_FILE" << EOF
{
  "projects": {},
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
    echo "      • IDE UI (Add Project button)"
    echo "      • Edit $CONFIG_FILE manually"
    echo ""
else
    echo -e "${GREEN}  ✓${NC} Projects config already exists"
    echo "    Location: $CONFIG_FILE"
    echo ""
fi

echo -e "${GREEN}  ✓ Global configuration complete${NC}"
echo ""
echo "  Universal tools: ~/.claude/CLAUDE.md → shared/global-tools.md"
echo "  Agent commands available via /jat:* namespace"
echo "  Project-specific docs are imported via @~/code/jat/shared/*.md"
echo ""
