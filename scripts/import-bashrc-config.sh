#!/bin/bash

# Import PROJECT_CONFIG from ~/.bashrc into ~/.config/jat/projects.json
# Usage: import-bashrc-config.sh [--dry-run] [--bashrc-path PATH]

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

# Config
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/jat"
CONFIG_FILE="$CONFIG_DIR/projects.json"
BASHRC_PATH="$HOME/.bashrc"
DRY_RUN=false

#------------------------------------------------------------------------------
# Parse Arguments
#------------------------------------------------------------------------------

show_help() {
    cat << 'EOF'
Import PROJECT_CONFIG from ~/.bashrc into jat config

USAGE:
    import-bashrc-config.sh [OPTIONS]

OPTIONS:
    --dry-run           Show what would be imported without making changes
    --bashrc PATH       Path to bashrc file (default: ~/.bashrc)
    --help, -h          Show this help

DESCRIPTION:
    Parses the PROJECT_CONFIG associative array from your bashrc and imports
    projects into ~/.config/jat/projects.json, preserving any existing config.

    Expected bashrc format:
        declare -A PROJECT_CONFIG=(
            [project]="NAME|~/code/path|port|db_url|active_color|inactive_color"
        )

EXAMPLES:
    import-bashrc-config.sh --dry-run      # Preview changes
    import-bashrc-config.sh                 # Import projects
    import-bashrc-config.sh --bashrc ~/old.bashrc  # Import from different file

EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --bashrc)
            BASHRC_PATH="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

#------------------------------------------------------------------------------
# Validate
#------------------------------------------------------------------------------

if [[ ! -f "$BASHRC_PATH" ]]; then
    echo -e "${RED}Bashrc not found: $BASHRC_PATH${NC}"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo -e "${RED}jq is required but not installed${NC}"
    exit 1
fi

#------------------------------------------------------------------------------
# Parse PROJECT_CONFIG from bashrc
#------------------------------------------------------------------------------

echo -e "${BLUE}Parsing PROJECT_CONFIG from $BASHRC_PATH...${NC}"
echo ""

# Extract the PROJECT_CONFIG block
# Match from "declare -A PROJECT_CONFIG=(" to the closing ")"
CONFIG_BLOCK=$(sed -n '/declare -A PROJECT_CONFIG=(/,/^)/p' "$BASHRC_PATH")

if [[ -z "$CONFIG_BLOCK" ]]; then
    echo -e "${YELLOW}No PROJECT_CONFIG found in bashrc${NC}"
    echo "Expected format:"
    echo '  declare -A PROJECT_CONFIG=('
    echo '      [project]="NAME|path|port|db_url|active_color|inactive_color"'
    echo '  )'
    exit 0
fi

# Parse each project entry
# Format: [project]="NAME|path|port|db_url|active_color|inactive_color"
IMPORTED_COUNT=0
UPDATED_COUNT=0
SKIPPED_COUNT=0

# Initialize projects JSON object
PROJECTS_JSON="{}"

while IFS= read -r line; do
    # Match lines like: [chimaro]="CHIMARO|~/code/chimaro|3500|db_url|rgb(...)|rgb(...)"
    if [[ "$line" =~ \[([a-zA-Z0-9_-]+)\]=\"([^\"]+)\" ]]; then
        project_key="${BASH_REMATCH[1]}"
        project_value="${BASH_REMATCH[2]}"

        # Parse pipe-delimited values
        IFS='|' read -r name path port db_url active_color inactive_color <<< "$project_value"

        # Normalize path (keep ~ for JSON, it's more portable)
        # But expand for existence check
        expanded_path="${path/#\~/$HOME}"

        # Handle empty values
        [[ -z "$port" ]] && port="null" || port="$port"
        [[ -z "$db_url" ]] && db_url="null" || db_url="\"$db_url\""
        [[ -z "$active_color" ]] && active_color="null" || active_color="\"$active_color\""
        [[ -z "$inactive_color" ]] && inactive_color="null" || inactive_color="\"$inactive_color\""

        # Port needs to be a number or null
        if [[ "$port" != "null" ]]; then
            port="$port"  # Keep as number
        fi

        # Build project JSON
        PROJECT_JSON=$(cat << EOF
{
  "name": "$name",
  "path": "$path",
  "port": $port,
  "database_url": $db_url,
  "active_color": $active_color,
  "inactive_color": $inactive_color
}
EOF
)

        # Add to projects object
        PROJECTS_JSON=$(echo "$PROJECTS_JSON" | jq --arg key "$project_key" --argjson val "$PROJECT_JSON" '.[$key] = $val')

        # Check path exists
        if [[ -d "$expanded_path" ]]; then
            path_status="${GREEN}exists${NC}"
        else
            path_status="${YELLOW}not found${NC}"
        fi

        echo -e "  ${GREEN}+${NC} $project_key"
        echo -e "    ${DIM}Name:${NC} $name"
        echo -e "    ${DIM}Path:${NC} $path ($path_status)"
        [[ "$port" != "null" ]] && echo -e "    ${DIM}Port:${NC} $port"
        [[ "$active_color" != "null" ]] && echo -e "    ${DIM}Color:${NC} $active_color"
        echo ""

        IMPORTED_COUNT=$((IMPORTED_COUNT + 1))
    fi
done <<< "$CONFIG_BLOCK"

echo -e "${BLUE}Found $IMPORTED_COUNT project(s) in bashrc${NC}"
echo ""

#------------------------------------------------------------------------------
# Merge with existing config
#------------------------------------------------------------------------------

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}DRY RUN - No changes made${NC}"
    echo ""
    echo "Would create/update: $CONFIG_FILE"
    echo ""
    echo "Merged config would be:"

    if [[ -f "$CONFIG_FILE" ]]; then
        # Merge with existing
        EXISTING=$(cat "$CONFIG_FILE")
        MERGED=$(echo "$EXISTING" | jq --argjson new "$PROJECTS_JSON" '.projects = (.projects + $new)')
        echo "$MERGED" | jq .
    else
        # Create new config
        cat << EOF | jq .
{
  "projects": $PROJECTS_JSON,
  "defaults": {
    "terminal": "alacritty",
    "editor": "code",
    "tools_path": "~/.local/bin",
    "claude_flags": "--dangerously-skip-permissions"
  }
}
EOF
    fi
    exit 0
fi

#------------------------------------------------------------------------------
# Write config
#------------------------------------------------------------------------------

# Ensure config directory exists
mkdir -p "$CONFIG_DIR"

if [[ -f "$CONFIG_FILE" ]]; then
    echo -e "${BLUE}Merging with existing config...${NC}"

    # Read existing config
    EXISTING=$(cat "$CONFIG_FILE")

    # Count existing projects
    EXISTING_COUNT=$(echo "$EXISTING" | jq '.projects | length')

    # Merge: new projects override existing ones with same key
    MERGED=$(echo "$EXISTING" | jq --argjson new "$PROJECTS_JSON" '.projects = (.projects + $new)')

    # Count final projects
    FINAL_COUNT=$(echo "$MERGED" | jq '.projects | length')
    UPDATED_COUNT=$((FINAL_COUNT - EXISTING_COUNT + IMPORTED_COUNT))

    # Write merged config
    echo "$MERGED" | jq . > "$CONFIG_FILE"

    echo -e "  ${DIM}Existing projects:${NC} $EXISTING_COUNT"
    echo -e "  ${DIM}Imported projects:${NC} $IMPORTED_COUNT"
    echo -e "  ${DIM}Total projects:${NC} $FINAL_COUNT"
else
    echo -e "${BLUE}Creating new config...${NC}"

    # Create new config with defaults
    cat << EOF | jq . > "$CONFIG_FILE"
{
  "projects": $PROJECTS_JSON,
  "defaults": {
    "terminal": "alacritty",
    "editor": "code",
    "tools_path": "~/.local/bin",
    "claude_flags": "--dangerously-skip-permissions"
  }
}
EOF
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Import Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  Imported: $IMPORTED_COUNT project(s)"
echo "  Config: $CONFIG_FILE"
echo ""
echo "  Test with:"
echo "    jat list"
echo "    jat config"
echo ""
