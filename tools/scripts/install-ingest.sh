#!/bin/bash
# Install squad-ingest: content ingestion daemon
# Creates directories, initializes database, installs npm deps, seeds config

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Installing squad-ingest...${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INGEST_DIR="$(cd "$SCRIPT_DIR/../ingest" && pwd)"
DATA_DIR="$HOME/.local/share/squad"
CONFIG_DIR="$HOME/.config/squad"

# 1. Create data directories
echo -e "${BLUE}Creating directories...${NC}"
mkdir -p "$DATA_DIR/ingest-files"
echo -e "  ${GREEN}✓${NC} $DATA_DIR/ingest-files"

# 2. Install npm dependencies
echo ""
echo -e "${BLUE}Installing npm dependencies...${NC}"
if command -v npm &>/dev/null; then
    cd "$INGEST_DIR"
    npm install --no-fund --no-audit 2>&1 | tail -3
    echo -e "  ${GREEN}✓${NC} npm dependencies installed"
else
    echo -e "  ${YELLOW}⚠${NC} npm not found. Run: npm install in $INGEST_DIR"
fi

# 3. Initialize database
echo ""
echo -e "${BLUE}Initializing database...${NC}"
if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DATA_DIR/ingest.db" < "$INGEST_DIR/schema.sql"
    echo -e "  ${GREEN}✓${NC} $DATA_DIR/ingest.db"
else
    echo -e "  ${YELLOW}⚠${NC} sqlite3 not found (database will be created on first run via better-sqlite3)"
fi

# 4. Seed config if not exists
echo ""
echo -e "${BLUE}Checking config...${NC}"
mkdir -p "$CONFIG_DIR"
FEEDS_FILE="$CONFIG_DIR/feeds.json"
if [ ! -f "$FEEDS_FILE" ]; then
    node "$INGEST_DIR/squad-ingest-test" --init
    echo -e "  ${GREEN}✓${NC} Created sample $FEEDS_FILE"
else
    echo -e "  ${GREEN}✓${NC} $FEEDS_FILE already exists"
fi

echo ""
echo -e "${GREEN}squad-ingest installed${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit $FEEDS_FILE to configure sources"
echo "  2. Add secrets: Settings -> API Keys -> Custom Keys"
echo "  3. Test: squad-ingest-test --source <id>"
echo "  4. Start: squad-ingest-server"
echo ""
