#!/bin/bash
#
# update-signal-hooks.sh - Add squad-signal hook to all projects
#
# This script:
# 1. Copies the latest squad-signal hook to ~/.claude/hooks/
# 2. Updates all project settings.json to include the hook
#
# Run this after updating the hook or to fix projects missing the hook.

# Don't use set -e so we continue even if one project fails

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}SQUAD Signal Hook Updater${NC}"
echo ""

# Find SQUAD installation
if [ -n "${SQUAD_INSTALL_DIR:-}" ] && [ -d "$SQUAD_INSTALL_DIR" ]; then
    SQUAD_DIR="$SQUAD_INSTALL_DIR"
elif [ -d "${XDG_DATA_HOME:-$HOME/.local/share}/squad" ]; then
    SQUAD_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/squad"
elif [ -f "$HOME/.config/squad/projects.json" ]; then
    _squad_path=$(jq -r '.projects.squad.path // empty' "$HOME/.config/squad/projects.json" 2>/dev/null | sed "s|^~|$HOME|g")
    if [ -n "$_squad_path" ] && [ -d "$_squad_path" ]; then
        SQUAD_DIR="$_squad_path"
    fi
fi

if [ -z "${SQUAD_DIR:-}" ]; then
    echo -e "${RED}ERROR: SQUAD not found${NC}"
    echo "Set \$SQUAD_INSTALL_DIR or add squad to ~/.config/squad/projects.json"
    exit 1
fi

# ============================================================================
# Step 1: Update global hook
# ============================================================================

echo -e "${BLUE}Step 1: Updating global hook...${NC}"

GLOBAL_HOOKS_DIR="$HOME/.claude/hooks"
mkdir -p "$GLOBAL_HOOKS_DIR"

HOOK_SOURCE="$SQUAD_DIR/.claude/hooks/post-bash-squad-signal.sh"
HOOK_DEST="$GLOBAL_HOOKS_DIR/post-bash-squad-signal.sh"

if [ -f "$HOOK_SOURCE" ]; then
    cp "$HOOK_SOURCE" "$HOOK_DEST"
    chmod +x "$HOOK_DEST"
    echo -e "  ${GREEN}✓ Updated ~/.claude/hooks/post-bash-squad-signal.sh${NC}"
else
    echo -e "  ${RED}✗ Hook source not found: $HOOK_SOURCE${NC}"
    exit 1
fi

echo ""

# ============================================================================
# Step 2: Update project settings
# ============================================================================

echo -e "${BLUE}Step 2: Updating project settings...${NC}"
echo ""

UPDATED=0
SKIPPED=0
ALREADY_OK=0

for repo_dir in "$HOME/code"/*; do
    [ ! -d "$repo_dir" ] && continue
    [ ! -d "$repo_dir/.git" ] && continue

    REPO_NAME=$(basename "$repo_dir")
    SETTINGS_FILE="$repo_dir/.claude/settings.json"

    # Skip if no .claude directory
    if [ ! -d "$repo_dir/.claude" ]; then
        echo -e "  ${YELLOW}⊘ $REPO_NAME: No .claude directory${NC}"
        ((SKIPPED++))
        continue
    fi

    # Check if settings.json exists
    if [ ! -f "$SETTINGS_FILE" ]; then
        # Create new settings.json
        mkdir -p "$repo_dir/.claude"
        cat > "$SETTINGS_FILE" << 'EOF'
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 1
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/post-bash-agent-state-refresh.sh",
            "statusMessage": "Checking agent state changes...",
            "streamStdinJson": true
          },
          {
            "type": "command",
            "command": "~/.claude/hooks/post-bash-squad-signal.sh"
          }
        ]
      }
    ]
  }
}
EOF
        echo -e "  ${GREEN}✓ $REPO_NAME: Created settings.json with hooks${NC}"
        ((UPDATED++))
        continue
    fi

    # Check if squad-signal hook is already configured
    if grep -q "post-bash-squad-signal" "$SETTINGS_FILE"; then
        # Check if it's using the old project-specific path and update to global
        if grep -q "~/code/squad/.claude/hooks/post-bash-squad-signal" "$SETTINGS_FILE"; then
            # macOS sed requires -i '' (empty backup extension), Linux uses -i alone
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' 's|~/code/squad/.claude/hooks/post-bash-squad-signal.sh|~/.claude/hooks/post-bash-squad-signal.sh|g' "$SETTINGS_FILE"
            else
                sed -i 's|~/code/squad/.claude/hooks/post-bash-squad-signal.sh|~/.claude/hooks/post-bash-squad-signal.sh|g' "$SETTINGS_FILE"
            fi
            echo -e "  ${GREEN}✓ $REPO_NAME: Updated to global hook path${NC}"
            ((UPDATED++))
        else
            echo -e "  ${GREEN}✓ $REPO_NAME: Hook already configured${NC}"
            ((ALREADY_OK++))
        fi
        continue
    fi

    # Add the hook to existing settings
    # Use jq to add the hook to the hooks array
    TEMP_FILE=$(mktemp)
    if jq '
        if .hooks.PostToolUse then
            .hooks.PostToolUse[0].hooks += [{
                "type": "command",
                "command": "~/.claude/hooks/post-bash-squad-signal.sh"
            }]
        else
            .hooks = {
                "PostToolUse": [{
                    "matcher": "^Bash$",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/post-bash-agent-state-refresh.sh",
                            "statusMessage": "Checking agent state changes...",
                            "streamStdinJson": true
                        },
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/post-bash-squad-signal.sh"
                        }
                    ]
                }]
            }
        end
    ' "$SETTINGS_FILE" > "$TEMP_FILE" 2>/dev/null; then
        mv "$TEMP_FILE" "$SETTINGS_FILE"
        echo -e "  ${GREEN}✓ $REPO_NAME: Added squad-signal hook${NC}"
        ((UPDATED++))
    else
        echo -e "  ${YELLOW}⚠ $REPO_NAME: Failed to update (invalid JSON?)${NC}"
        rm -f "$TEMP_FILE"
        ((SKIPPED++))
    fi
done

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Signal Hook Update Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  Updated: $UPDATED"
echo "  Already OK: $ALREADY_OK"
echo "  Skipped: $SKIPPED"
echo ""
echo -e "${YELLOW}Note: Running agents must be restarted to use the updated hook.${NC}"
echo ""
