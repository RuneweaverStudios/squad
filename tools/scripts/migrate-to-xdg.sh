#!/bin/bash

# Migrate JAT from ~/code/jat to ~/.local/share/jat (XDG standard)
# Safe to run multiple times - skips already-migrated installations
#
# Usage: migrate-to-xdg.sh [-y]
#   -y  Skip confirmation prompts (for piping from curl)

set -e

# Parse arguments
AUTO_YES=false
while getopts "y" opt; do
    case $opt in
        y) AUTO_YES=true ;;
        *) ;;
    esac
done

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║           JAT Migration to XDG Location                       ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

OLD_DIR="$HOME/code/jat"
NEW_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
CONFIG_DIR="$HOME/.config/jat"
BIN_DIR="$HOME/.local/bin"

# Check current state
echo -e "${BLUE}Checking current installation...${NC}"
echo ""

if [ ! -d "$OLD_DIR" ] && [ ! -d "$NEW_DIR" ]; then
    echo -e "${YELLOW}No JAT installation found.${NC}"
    echo "Run the installer: curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/tools/scripts/bootstrap.sh | bash"
    exit 0
fi

if [ ! -d "$OLD_DIR" ] && [ -d "$NEW_DIR" ]; then
    echo -e "${GREEN}✓ Already using XDG location: $NEW_DIR${NC}"
    echo "No migration needed."
    exit 0
fi

if [ -d "$OLD_DIR" ] && [ -d "$NEW_DIR" ]; then
    echo -e "${YELLOW}⚠ Both locations exist:${NC}"
    echo "  Old: $OLD_DIR"
    echo "  New: $NEW_DIR"
    echo ""
    echo "This script will:"
    echo "  1. Remove the old location ($OLD_DIR)"
    echo "  2. Update symlinks to use new location"
    echo "  3. Update config files"
    echo ""
    if [ "$AUTO_YES" = false ]; then
        echo -n "Continue? [y/N] "
        read -r response </dev/tty
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 1
        fi
    else
        echo -e "${BLUE}Auto-confirmed (-y flag)${NC}"
    fi
fi

if [ -d "$OLD_DIR" ] && [ ! -d "$NEW_DIR" ]; then
    echo -e "${BLUE}Migrating from:${NC} $OLD_DIR"
    echo -e "${BLUE}Migrating to:${NC}   $NEW_DIR"
    echo ""
    echo "This script will:"
    echo "  1. Move JAT to XDG location"
    echo "  2. Update symlinks in ~/.local/bin/"
    echo "  3. Update config files"
    echo "  4. Remove old location"
    echo ""
    if [ "$AUTO_YES" = false ]; then
        echo -n "Continue? [y/N] "
        read -r response </dev/tty
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 1
        fi
    else
        echo -e "${BLUE}Auto-confirmed (-y flag)${NC}"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 1/5: Preparing new location${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

mkdir -p "$(dirname "$NEW_DIR")"

if [ -d "$OLD_DIR" ] && [ ! -d "$NEW_DIR" ]; then
    # Move the repo
    echo "Moving $OLD_DIR → $NEW_DIR"
    mv "$OLD_DIR" "$NEW_DIR"
    echo -e "${GREEN}✓ Moved JAT to XDG location${NC}"
elif [ -d "$OLD_DIR" ] && [ -d "$NEW_DIR" ]; then
    # Both exist - just remove old
    echo "New location already exists, will remove old location later"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 2/5: Updating symlinks in ~/.local/bin/${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Remove old symlinks pointing to ~/code/jat
REMOVED=0
if [ -d "$BIN_DIR" ]; then
    for link in "$BIN_DIR"/*; do
        if [ -L "$link" ]; then
            target=$(readlink "$link")
            if [[ "$target" == *"/code/jat/"* ]] || [[ "$target" == *"/code/jomarchy-agent-tools/"* ]]; then
                rm "$link"
                ((REMOVED++)) || true
            fi
        fi
    done
fi
echo -e "${GREEN}✓ Removed $REMOVED old symlinks${NC}"

# Re-run symlink script from new location
if [ -f "$NEW_DIR/tools/scripts/symlink-tools.sh" ]; then
    echo "Creating new symlinks..."
    bash "$NEW_DIR/tools/scripts/symlink-tools.sh" "$NEW_DIR"
    echo -e "${GREEN}✓ Created new symlinks${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 3/5: Updating config files${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Update ~/.config/jat/projects.json
if [ -f "$CONFIG_DIR/projects.json" ]; then
    if grep -q "/code/jat" "$CONFIG_DIR/projects.json"; then
        sed -i.bak 's|~/code/jat|~/.local/share/jat|g' "$CONFIG_DIR/projects.json"
        sed -i 's|/code/jat|/.local/share/jat|g' "$CONFIG_DIR/projects.json"
        rm -f "$CONFIG_DIR/projects.json.bak"
        echo -e "${GREEN}✓ Updated projects.json${NC}"
    else
        echo "  projects.json - no changes needed"
    fi
else
    echo "  projects.json - not found (ok)"
fi

# Update ~/.claude/settings.json hook paths
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS" ]; then
    if grep -q "/code/jat" "$CLAUDE_SETTINGS"; then
        sed -i.bak 's|~/code/jat|~/.local/share/jat|g' "$CLAUDE_SETTINGS"
        sed -i 's|/code/jat|/.local/share/jat|g' "$CLAUDE_SETTINGS"
        rm -f "$CLAUDE_SETTINGS.bak"
        echo -e "${GREEN}✓ Updated ~/.claude/settings.json${NC}"
    else
        echo "  ~/.claude/settings.json - no changes needed"
    fi
else
    echo "  ~/.claude/settings.json - not found (ok)"
fi

# Update shell config (remove old launcher functions)
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 4/5: Cleaning shell config${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SHELL_NAME=$(basename "$SHELL")
if [[ "$SHELL_NAME" == "zsh" ]]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL_NAME" == "bash" ]]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    SHELL_CONFIG="$HOME/.bashrc"
fi

# Remove JAT launcher block from shell config
MARKER_START="# >>> JAT Claude Launchers >>>"
MARKER_END="# <<< JAT Claude Launchers <<<"

if [ -f "$SHELL_CONFIG" ] && grep -q "$MARKER_START" "$SHELL_CONFIG"; then
    # Create backup
    cp "$SHELL_CONFIG" "$SHELL_CONFIG.bak-jat-migrate"

    # Remove the block between markers (inclusive)
    sed -i "/$MARKER_START/,/$MARKER_END/d" "$SHELL_CONFIG"

    echo -e "${GREEN}✓ Removed old launcher functions from $SHELL_CONFIG${NC}"
    echo "  (Backup: $SHELL_CONFIG.bak-jat-migrate)"
else
    echo "  No launcher functions to remove"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 5/5: Cleanup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Remove old directory if it still exists
if [ -d "$OLD_DIR" ]; then
    echo "Removing old directory: $OLD_DIR"
    rm -rf "$OLD_DIR"
    echo -e "${GREEN}✓ Removed ~/code/jat${NC}"
else
    echo "  Old directory already removed"
fi

# Remove legacy jomarchy-agent-tools if exists
if [ -d "$HOME/code/jomarchy-agent-tools" ]; then
    echo "Removing legacy directory: ~/code/jomarchy-agent-tools"
    rm -rf "$HOME/code/jomarchy-agent-tools"
    echo -e "${GREEN}✓ Removed ~/code/jomarchy-agent-tools${NC}"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}║              ${BOLD}✓ Migration Complete!${NC}${GREEN}                          ║${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "JAT is now installed at: $NEW_DIR"
echo ""
echo "Next steps:"
echo "  1. Restart your terminal (or run: source $SHELL_CONFIG)"
echo "  2. Verify: bd --version"
echo "  3. Start IDE: cd $NEW_DIR/ide && npm run dev"
echo ""
