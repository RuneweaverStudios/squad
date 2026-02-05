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

# Get project root directory (scripts is now under tools/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# JAT tool directories (all under tools/)
TOOLS_DIR="$PROJECT_ROOT/tools"
CORE_DIR="$TOOLS_DIR/core"
BROWSER_DIR="$TOOLS_DIR/browser"
SIGNAL_DIR="$TOOLS_DIR/signal"
MEDIA_DIR="$TOOLS_DIR/media"
MAIL_DIR="$TOOLS_DIR/mail"
INGEST_DIR="$TOOLS_DIR/ingest"

# Verify directories exist
if [ ! -d "$CORE_DIR" ] || [ ! -d "$BROWSER_DIR" ]; then
    echo -e "${YELLOW}  ⚠ Tool directories not found${NC}"
    echo "  Expected:"
    echo "    - $CORE_DIR"
    echo "    - $BROWSER_DIR"
    exit 1
fi

# Count tools in each directory
CORE_COUNT=$(find "$CORE_DIR" -maxdepth 1 -type f -executable 2>/dev/null | wc -l)
BROWSER_COUNT=$(find "$BROWSER_DIR" -maxdepth 1 -type f -executable 2>/dev/null | wc -l)
MAIL_COUNT=0
if [ -d "$MAIL_DIR" ]; then
    MAIL_COUNT=$(find "$MAIL_DIR" -maxdepth 1 -type f -executable 2>/dev/null | wc -l)
fi
SIGNAL_COUNT=0
if [ -d "$SIGNAL_DIR" ]; then
    SIGNAL_COUNT=$(find "$SIGNAL_DIR" -maxdepth 1 -type f -executable 2>/dev/null | wc -l)
fi
MEDIA_COUNT=0
if [ -d "$MEDIA_DIR" ]; then
    MEDIA_COUNT=$(find "$MEDIA_DIR" -maxdepth 1 -type f -executable 2>/dev/null | wc -l)
fi
INGEST_COUNT=0
if [ -d "$INGEST_DIR" ]; then
    INGEST_COUNT=$(find "$INGEST_DIR" -maxdepth 1 -type f -executable 2>/dev/null | wc -l)
fi
TOOL_COUNT=$(( CORE_COUNT + BROWSER_COUNT + MAIL_COUNT + SIGNAL_COUNT + MEDIA_COUNT + INGEST_COUNT ))
echo "  Found $TOOL_COUNT tools"
echo "    - $CORE_COUNT in tools/core/"
echo "    - $BROWSER_COUNT in tools/browser/"
if [ "$MAIL_COUNT" -gt 0 ]; then
    echo "    - $MAIL_COUNT in tools/mail/"
fi
if [ "$SIGNAL_COUNT" -gt 0 ]; then
    echo "    - $SIGNAL_COUNT in tools/signal/"
fi
if [ "$MEDIA_COUNT" -gt 0 ]; then
    echo "    - $MEDIA_COUNT in tools/media/"
fi
if [ "$INGEST_COUNT" -gt 0 ]; then
    echo "    - $INGEST_COUNT in tools/ingest/"
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
symlink_tools "$CORE_DIR"
symlink_tools "$BROWSER_DIR"
if [ -d "$MAIL_DIR" ]; then
    symlink_tools "$MAIL_DIR"
fi
if [ -d "$SIGNAL_DIR" ]; then
    symlink_tools "$SIGNAL_DIR"
fi
if [ -d "$MEDIA_DIR" ]; then
    symlink_tools "$MEDIA_DIR"
fi
if [ -d "$INGEST_DIR" ]; then
    symlink_tools "$INGEST_DIR"
fi

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
echo -e "${BLUE}Setting up jat-complete-bundle...${NC}"
echo ""

# Symlink jat-complete-bundle (completion bundle generator)
BUNDLE_SOURCE="$PROJECT_ROOT/tools/scripts/jat-complete-bundle"
BUNDLE_TARGET="$HOME/.local/bin/jat-complete-bundle"

if [ -f "$BUNDLE_SOURCE" ]; then
    if [ -L "$BUNDLE_TARGET" ]; then
        CURRENT_TARGET=$(readlink "$BUNDLE_TARGET")
        if [ "$CURRENT_TARGET" = "$BUNDLE_SOURCE" ]; then
            echo -e "  ${GREEN}✓${NC} jat-complete-bundle (already linked)"
        else
            echo -e "  ${YELLOW}↻${NC} jat-complete-bundle (updating link)"
            rm "$BUNDLE_TARGET"
            ln -s "$BUNDLE_SOURCE" "$BUNDLE_TARGET"
        fi
    else
        echo -e "  ${GREEN}+${NC} jat-complete-bundle (linked)"
        ln -s "$BUNDLE_SOURCE" "$BUNDLE_TARGET"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} jat-complete-bundle not found at $BUNDLE_SOURCE"
fi

echo ""
echo -e "${BLUE}Setting up get-current-session-id...${NC}"
echo ""

# Symlink get-current-session-id (session ID lookup utility)
SESSION_ID_SOURCE="$PROJECT_ROOT/tools/scripts/get-current-session-id"
SESSION_ID_TARGET="$HOME/.local/bin/get-current-session-id"

if [ -f "$SESSION_ID_SOURCE" ]; then
    if [ -L "$SESSION_ID_TARGET" ]; then
        CURRENT_TARGET=$(readlink "$SESSION_ID_TARGET")
        if [ "$CURRENT_TARGET" = "$SESSION_ID_SOURCE" ]; then
            echo -e "  ${GREEN}✓${NC} get-current-session-id (already linked)"
        else
            echo -e "  ${YELLOW}↻${NC} get-current-session-id (updating link)"
            rm "$SESSION_ID_TARGET"
            ln -s "$SESSION_ID_SOURCE" "$SESSION_ID_TARGET"
        fi
    else
        echo -e "  ${GREEN}+${NC} get-current-session-id (linked)"
        ln -s "$SESSION_ID_SOURCE" "$SESSION_ID_TARGET"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} get-current-session-id not found at $SESSION_ID_SOURCE"
fi

echo ""
echo -e "${BLUE}Setting up jt-epic-child...${NC}"
echo ""

# Symlink jt-epic-child helper
JT_EPIC_SOURCE="$PROJECT_ROOT/tools/scripts/jt-epic-child"
JT_EPIC_TARGET="$HOME/.local/bin/jt-epic-child"

if [ -f "$JT_EPIC_SOURCE" ]; then
    if [ -L "$JT_EPIC_TARGET" ]; then
        CURRENT_TARGET=$(readlink "$JT_EPIC_TARGET")
        if [ "$CURRENT_TARGET" = "$JT_EPIC_SOURCE" ]; then
            echo -e "  ${GREEN}✓${NC} jt-epic-child (already linked)"
        else
            echo -e "  ${YELLOW}↻${NC} jt-epic-child (updating link)"
            rm "$JT_EPIC_TARGET"
            ln -s "$JT_EPIC_SOURCE" "$JT_EPIC_TARGET"
        fi
    else
        echo -e "  ${GREEN}+${NC} jt-epic-child (linked)"
        ln -s "$JT_EPIC_SOURCE" "$JT_EPIC_TARGET"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} jt-epic-child not found at $JT_EPIC_SOURCE"
fi

echo ""
echo -e "${BLUE}Setting up jat-demo...${NC}"
echo ""

# Symlink jat-demo (demo environment setup)
JAT_DEMO_SOURCE="$PROJECT_ROOT/tools/scripts/jat-demo"
JAT_DEMO_TARGET="$HOME/.local/bin/jat-demo"

if [ -f "$JAT_DEMO_SOURCE" ]; then
    if [ -L "$JAT_DEMO_TARGET" ]; then
        CURRENT_TARGET=$(readlink "$JAT_DEMO_TARGET")
        if [ "$CURRENT_TARGET" = "$JAT_DEMO_SOURCE" ]; then
            echo -e "  ${GREEN}✓${NC} jat-demo (already linked)"
        else
            echo -e "  ${YELLOW}↻${NC} jat-demo (updating link)"
            rm "$JAT_DEMO_TARGET"
            ln -s "$JAT_DEMO_SOURCE" "$JAT_DEMO_TARGET"
        fi
    else
        echo -e "  ${GREEN}+${NC} jat-demo (linked)"
        ln -s "$JAT_DEMO_SOURCE" "$JAT_DEMO_TARGET"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} jat-demo not found at $JAT_DEMO_SOURCE"
fi

echo ""
echo -e "${BLUE}Setting up jat-uninstall...${NC}"
echo ""

# Symlink uninstall script
UNINSTALL_SOURCE="$PROJECT_ROOT/uninstall.sh"
UNINSTALL_TARGET="$HOME/.local/bin/jat-uninstall"

if [ -f "$UNINSTALL_SOURCE" ]; then
    if [ -L "$UNINSTALL_TARGET" ]; then
        CURRENT_TARGET=$(readlink "$UNINSTALL_TARGET")
        if [ "$CURRENT_TARGET" = "$UNINSTALL_SOURCE" ]; then
            echo -e "  ${GREEN}✓${NC} jat-uninstall (already linked)"
        else
            echo -e "  ${YELLOW}↻${NC} jat-uninstall (updating link)"
            rm "$UNINSTALL_TARGET"
            ln -s "$UNINSTALL_SOURCE" "$UNINSTALL_TARGET"
        fi
    else
        echo -e "  ${GREEN}+${NC} jat-uninstall (linked)"
        ln -s "$UNINSTALL_SOURCE" "$UNINSTALL_TARGET"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} jat-uninstall not found at $UNINSTALL_SOURCE"
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
    SHELL_RC="$([ "$(basename "$SHELL")" = "zsh" ] && echo "~/.zshrc" || echo "~/.bashrc")"
    echo "  Add to $SHELL_RC:"
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
echo "    • Browser (11): browser-start.js, browser-nav.js, browser-eval.js, ..."
echo "    • Signal (2): jat-signal, jat-signal-validate"
echo "    • Media (4+): gemini-image, gemini-edit, gemini-compose, avatar-generate"
echo "    • Additional (15): db-*, jt-*, monitoring tools"
echo "    • JAT CLI: jat - Launch IDE"
echo ""
