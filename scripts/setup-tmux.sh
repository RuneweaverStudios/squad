#!/bin/bash

# Tmux Mouse Configuration Setup
# - Enables mouse scrolling in tmux sessions
# - Fixes Alacritty's faux scrolling behavior in alternate screen mode
# - Required for proper scrolling in Claude Code TUI when using dashboard-spawned sessions

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Setting up tmux mouse configuration...${NC}"
echo ""

TMUX_CONF="$HOME/.tmux.conf"

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo -e "  ${YELLOW}⊘ tmux not installed, skipping mouse configuration${NC}"
    echo "  Install tmux to enable proper mouse scrolling in agent sessions"
    exit 0
fi

# Check if ~/.tmux.conf exists
if [ -f "$TMUX_CONF" ]; then
    # Check if mouse setting already exists (various patterns)
    if grep -qE '^[^#]*set(-option)?\s+(-g\s+)?mouse\s+(on|off)' "$TMUX_CONF"; then
        CURRENT_SETTING=$(grep -oE 'mouse\s+(on|off)' "$TMUX_CONF" | head -1)
        if echo "$CURRENT_SETTING" | grep -q 'on'; then
            echo -e "  ${GREEN}✓${NC} Mouse mode already enabled in ~/.tmux.conf"
        else
            echo -e "  ${YELLOW}⚠ Mouse mode is set to 'off' in ~/.tmux.conf${NC}"
            echo "  To enable scrolling in agent sessions, change to: set -g mouse on"
            echo ""
            echo -e "  ${YELLOW}Note:${NC} With mouse mode, use Shift+select to copy text to clipboard"
        fi
        exit 0
    fi

    # Mouse setting not found, append it
    echo "" >> "$TMUX_CONF"
    echo "# JAT: Enable mouse mode for proper scrolling in Claude Code TUI" >> "$TMUX_CONF"
    echo "# Use Shift+select to copy text with mouse mode enabled" >> "$TMUX_CONF"
    echo "set -g mouse on" >> "$TMUX_CONF"

    echo -e "  ${GREEN}✓ Added 'set -g mouse on' to existing ~/.tmux.conf${NC}"
else
    # Create new ~/.tmux.conf
    cat > "$TMUX_CONF" << 'EOF'
# JAT: Enable mouse mode for proper scrolling in Claude Code TUI
# Use Shift+select to copy text with mouse mode enabled
set -g mouse on
EOF

    echo -e "  ${GREEN}✓ Created ~/.tmux.conf with mouse mode enabled${NC}"
fi

echo ""
echo -e "  ${YELLOW}Note:${NC} With mouse mode, use Shift+select to copy text to clipboard"
echo ""

# Reload tmux config if inside tmux session
if [ -n "$TMUX" ]; then
    tmux source-file "$TMUX_CONF" 2>/dev/null
    echo -e "  ${GREEN}✓ Reloaded tmux configuration${NC}"
fi
