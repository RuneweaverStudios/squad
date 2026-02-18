#!/bin/bash
# Sync SQUAD development changes to XDG installation
# Usage: ./sync-to-xdg.sh

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

SOURCE_DIR="$HOME/code/squad"
TARGET_DIR="$HOME/.local/share/squad"

echo -e "${CYAN}🔄 SQUAD Development → XDG Sync${NC}"
echo ""
echo -e "Source: ${SOURCE_DIR}"
echo -e "Target: ${TARGET_DIR}"
echo ""

# Check if source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}❌ Source directory not found: $SOURCE_DIR${NC}"
    exit 1
fi

# Check if target exists
if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}❌ Target directory not found: $TARGET_DIR${NC}"
    echo -e "${YELLOW}Run SQUAD installer first to create XDG installation${NC}"
    exit 1
fi

# Confirm before syncing
echo -e "${YELLOW}⚠️  This will overwrite the XDG installation with your dev changes${NC}"
echo -e "Continue? [y/N]: "
read -r response

if [[ ! "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${RED}Sync cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}Syncing files...${NC}"

# Check for rsync or use cp fallback
if command -v rsync >/dev/null 2>&1; then
    # Use rsync if available
    rsync -av --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.log' \
        --exclude '.svelte-kit' \
        --exclude 'dist' \
        --exclude 'build' \
        --exclude '.env' \
        --exclude '.env.local' \
        "$SOURCE_DIR/" "$TARGET_DIR/"
else
    echo -e "${YELLOW}rsync not found, using cp instead (slower)${NC}"

    # Remove old files first (but keep node_modules if they exist)
    find "$TARGET_DIR" -mindepth 1 -maxdepth 1 \
        -not -name 'node_modules' \
        -not -name '.git' \
        -exec rm -rf {} \;

    # Copy everything except excluded files
    for item in "$SOURCE_DIR"/*; do
        basename_item=$(basename "$item")
        # Skip excluded items
        case "$basename_item" in
            node_modules|.git|*.log|.svelte-kit|dist|build|.env|.env.local)
                continue
                ;;
            *)
                cp -r "$item" "$TARGET_DIR/"
                ;;
        esac
    done

    # Copy hidden files (except .git and .env*)
    for item in "$SOURCE_DIR"/.*; do
        basename_item=$(basename "$item")
        case "$basename_item" in
            .|..|.git|.env|.env.local|.svelte-kit)
                continue
                ;;
            *)
                [ -e "$item" ] && cp -r "$item" "$TARGET_DIR/"
                ;;
        esac
    done
fi

echo ""
echo -e "${GREEN}✅ Sync complete!${NC}"
echo ""
echo -e "Changes synced to XDG installation:"
echo -e "  • IDE changes → ${CYAN}squad${NC} will now use updated code"
echo -e "  • Tool changes → ${CYAN}am-*, db-*, etc.${NC} will use updated scripts"
echo -e "  • Config changes → Templates and shared docs updated"
echo ""
echo -e "Your dev environment (${CYAN}squad-dev${NC}) remains unchanged."