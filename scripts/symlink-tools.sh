#!/bin/bash

# Symlink Agent Tools to ~/.local/bin
# Makes all 43 tools globally available

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Setting up Agent Tools symlinks...${NC}"
echo ""

# Ensure ~/.local/bin exists
mkdir -p ~/.local/bin

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# JAT tool directories
TOOLS_DIR="$SCRIPT_DIR/tools"
BROWSER_TOOLS_DIR="$SCRIPT_DIR/browser-tools"
MEDIA_DIR="$SCRIPT_DIR/media"

# Verify directories exist
if [ ! -d "$TOOLS_DIR" ] || [ ! -d "$BROWSER_TOOLS_DIR" ]; then
    echo -e "${YELLOW}  ⚠ Tool directories not found${NC}"
    echo "  Expected:"
    echo "    - $TOOLS_DIR"
    echo "    - $BROWSER_TOOLS_DIR"
    exit 1
fi

# Count all tools (media/ is optional)
MEDIA_COUNT=0
if [ -d "$MEDIA_DIR" ]; then
    MEDIA_COUNT=$(find "$MEDIA_DIR" -maxdepth 1 -type f -executable | wc -l)
fi
TOOL_COUNT=$(( $(find "$TOOLS_DIR" "$BROWSER_TOOLS_DIR" -maxdepth 1 -type f -executable | wc -l) + MEDIA_COUNT ))
echo "  Found $TOOL_COUNT tools"
echo "    - $(find "$TOOLS_DIR" -maxdepth 1 -type f -executable | wc -l) in tools/"
echo "    - $(find "$BROWSER_TOOLS_DIR" -maxdepth 1 -type f -executable | wc -l) in browser-tools/"
if [ -d "$MEDIA_DIR" ] && [ "$MEDIA_COUNT" -gt 0 ]; then
    echo "    - $MEDIA_COUNT in media/"
fi
echo ""

LINKED_COUNT=0
SKIPPED_COUNT=0
UPDATED_COUNT=0

# Function to symlink tools from a directory
symlink_tools() {
    local SOURCE_DIR="$1"

    for tool in "$SOURCE_DIR"/*; do
        # Skip if not a file or not executable
        if [ ! -f "$tool" ] || [ ! -x "$tool" ]; then
            continue
        fi

        TOOL_NAME=$(basename "$tool")
        TARGET="$HOME/.local/bin/$TOOL_NAME"

        # Check if symlink already exists and points to correct location
        if [ -L "$TARGET" ]; then
            CURRENT_TARGET=$(readlink "$TARGET")
            if [ "$CURRENT_TARGET" = "$tool" ]; then
                echo -e "  ${GREEN}✓${NC} $TOOL_NAME (already linked)"
                SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
                continue
            else
                echo -e "  ${YELLOW}↻${NC} $TOOL_NAME (updating link)"
                rm "$TARGET"
                UPDATED_COUNT=$((UPDATED_COUNT + 1))
            fi
        elif [ -e "$TARGET" ]; then
            echo -e "  ${YELLOW}⚠${NC} $TOOL_NAME (file exists, not a symlink - skipping)"
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        fi

        # Create symlink
        ln -s "$tool" "$TARGET"
        echo -e "  ${GREEN}+${NC} $TOOL_NAME (linked)"
        LINKED_COUNT=$((LINKED_COUNT + 1))
    done
}

# Symlink tools from all directories
symlink_tools "$TOOLS_DIR"
symlink_tools "$BROWSER_TOOLS_DIR"
if [ -d "$MEDIA_DIR" ]; then
    symlink_tools "$MEDIA_DIR"
fi

echo ""
echo -e "${BLUE}Setting up dashboard launcher...${NC}"
echo ""

# Get project root directory
PROJECT_ROOT="$(dirname "$TOOLS_DIR")"

# Symlink dashboard launcher scripts
for launcher in "bd-dashboard" "jat-dashboard"; do
    LAUNCHER_SOURCE="$PROJECT_ROOT/$launcher"
    LAUNCHER_TARGET="$HOME/.local/bin/$launcher"

    if [ -f "$LAUNCHER_SOURCE" ]; then
        if [ -L "$LAUNCHER_TARGET" ]; then
            CURRENT_TARGET=$(readlink "$LAUNCHER_TARGET")
            if [ "$CURRENT_TARGET" = "$LAUNCHER_SOURCE" ]; then
                echo -e "  ${GREEN}✓${NC} $launcher (already linked)"
            else
                echo -e "  ${YELLOW}↻${NC} $launcher (updating link)"
                rm "$LAUNCHER_TARGET"
                ln -s "$LAUNCHER_SOURCE" "$LAUNCHER_TARGET"
            fi
        else
            echo -e "  ${GREEN}+${NC} $launcher (linked)"
            ln -s "$LAUNCHER_SOURCE" "$LAUNCHER_TARGET"
        fi
    fi
done

echo ""
echo -e "${BLUE}Setting up jat CLI...${NC}"
echo ""

# Symlink jat CLI (dev environment launcher)
JAT_CLI_SOURCE="$PROJECT_ROOT/cli/jat"
JAT_CLI_TARGET="$HOME/.local/bin/jat"

if [ -f "$JAT_CLI_SOURCE" ]; then
    if [ -L "$JAT_CLI_TARGET" ]; then
        CURRENT_TARGET=$(readlink "$JAT_CLI_TARGET")
        if [ "$CURRENT_TARGET" = "$JAT_CLI_SOURCE" ]; then
            echo -e "  ${GREEN}✓${NC} jat (already linked)"
        else
            echo -e "  ${YELLOW}↻${NC} jat (updating link)"
            rm "$JAT_CLI_TARGET"
            ln -s "$JAT_CLI_SOURCE" "$JAT_CLI_TARGET"
        fi
    else
        echo -e "  ${GREEN}+${NC} jat (linked)"
        ln -s "$JAT_CLI_SOURCE" "$JAT_CLI_TARGET"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} jat CLI not found at $JAT_CLI_SOURCE"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Agent Tools Setup Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  Total tools: $TOOL_COUNT"
echo "  Newly linked: $LINKED_COUNT"
echo "  Updated: $UPDATED_COUNT"
echo "  Skipped (already correct): $SKIPPED_COUNT"
echo ""

# Verify PATH includes ~/.local/bin
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo -e "${YELLOW}  ⚠ ~/.local/bin is not in your PATH${NC}"
    echo "  Add to ~/.bashrc:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

echo "  Test tools:"
echo "    am-inbox --help"
echo "    browser-eval.js --help"
echo "    jat --help"
echo ""

echo "  Tool categories:"
echo "    • Agent Mail (12): am-register, am-inbox, am-send, am-reply, am-ack, ..."
echo "    • Browser (7): browser-start.js, browser-nav.js, browser-eval.js, ..."
echo "    • Media (3): gemini-image, gemini-edit, gemini-compose"
echo "    • Additional (21): db-*, monitoring, deployment helpers"
echo "    • JAT CLI: jat <project> - Launch full dev environment"
echo ""
