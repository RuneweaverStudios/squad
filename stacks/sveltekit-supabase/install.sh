#!/bin/bash

# SvelteKit + Supabase Stack Tools Installer
# Installs 11 specialized tools for SvelteKit + Supabase projects

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TOOLS_DIR="$SCRIPT_DIR/tools"

echo -e "${BLUE}Installing SvelteKit + Supabase Stack Tools...${NC}"
echo ""

# Ensure ~/.local/bin exists
mkdir -p ~/.local/bin

# Count tools
TOOL_COUNT=$(find "$TOOLS_DIR" -maxdepth 1 -type f -executable | wc -l)
echo "  Found $TOOL_COUNT tools in stack"
echo ""

LINKED_COUNT=0
SKIPPED_COUNT=0
UPDATED_COUNT=0

# Symlink each tool
for tool in "$TOOLS_DIR"/*; do
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

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}SvelteKit + Supabase Stack Installed${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  Total tools: $TOOL_COUNT"
echo "  Newly linked: $LINKED_COUNT"
echo "  Updated: $UPDATED_COUNT"
echo "  Skipped (already correct): $SKIPPED_COUNT"
echo ""
echo "  Test tools:"
echo "    component-deps --help"
echo "    route-list --help"
echo "    error-log --help"
echo ""
