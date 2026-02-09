#!/bin/bash

# Statusline and Hooks Setup
# - Copy statusline.sh to ~/.claude/statusline.sh (GLOBAL)
# - Copy post-bash hook to ~/.claude/hooks/
# - Configure settings.json in each project with statusline and hook

# Note: Don't use 'set -e' so we continue even if one project fails

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Setting up statusline and hooks...${NC}"
echo ""

# Determine JAT installation directory
# Accept as first argument from install.sh, or auto-detect
if [ -n "$1" ]; then
    JAT_DIR="$1"
    echo -e "${BLUE}Using JAT directory: $JAT_DIR${NC}"
elif [ -d "${XDG_DATA_HOME:-$HOME/.local/share}/jat" ]; then
    JAT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
elif [ -d "$HOME/code/jat" ]; then
    JAT_DIR="$HOME/code/jat"
elif [ -d "$HOME/code/jomarchy-agent-tools" ]; then
    JAT_DIR="$HOME/code/jomarchy-agent-tools"
else
    echo -e "${RED}ERROR: JAT installation not found${NC}"
    echo "Searched in:"
    echo "  - ${XDG_DATA_HOME:-$HOME/.local/share}/jat"
    echo "  - ~/code/jat"
    echo "  - ~/code/jomarchy-agent-tools"
    exit 1
fi

# ============================================================================
# STEP 1: Install global statusline to ~/.claude/
# ============================================================================

echo -e "${BLUE}Step 1: Installing global statusline...${NC}"

mkdir -p "$HOME/.claude"

STATUSLINE_SOURCE="$JAT_DIR/.claude/statusline.sh"
STATUSLINE_DEST="$HOME/.claude/statusline.sh"

if [ -f "$STATUSLINE_SOURCE" ]; then
    cp "$STATUSLINE_SOURCE" "$STATUSLINE_DEST"
    chmod +x "$STATUSLINE_DEST"
    echo -e "  ${GREEN}✓ Installed statusline.sh to ~/.claude/${NC}"
else
    echo -e "  ${RED}✗ Statusline source not found: $STATUSLINE_SOURCE${NC}"
    exit 1
fi

echo ""

# ============================================================================
# STEP 1b: Migrate agent session files to .claude/sessions/
# ============================================================================

echo -e "${BLUE}Step 1b: Migrating agent session files...${NC}"

# Find all projects with .claude directories
for project_dir in "$HOME/code"/*; do
    if [ -d "$project_dir/.claude" ]; then
        project_name=$(basename "$project_dir")
        sessions_dir="$project_dir/.claude/sessions"

        # Create sessions directory if it doesn't exist
        mkdir -p "$sessions_dir"

        # Count files to migrate
        legacy_count=$(find "$project_dir/.claude" -maxdepth 1 -name "agent-*.txt" 2>/dev/null | wc -l)
        legacy_jsonl=$(find "$project_dir/.claude" -maxdepth 1 -name "agent-*-activity.jsonl" 2>/dev/null | wc -l)

        if [ "$legacy_count" -gt 0 ] || [ "$legacy_jsonl" -gt 0 ]; then
            # Move agent files to sessions directory
            find "$project_dir/.claude" -maxdepth 1 -name "agent-*.txt" -exec mv {} "$sessions_dir/" \; 2>/dev/null
            find "$project_dir/.claude" -maxdepth 1 -name "agent-*-activity.jsonl" -exec mv {} "$sessions_dir/" \; 2>/dev/null
            echo -e "  ${GREEN}✓ $project_name: Migrated $legacy_count txt + $legacy_jsonl jsonl files${NC}"
        fi
    fi
done

echo -e "  ${GREEN}✓ Migration complete${NC}"
echo ""

# ============================================================================
# STEP 2: Install global hook to ~/.claude/hooks/
# ============================================================================

echo -e "${BLUE}Step 2: Installing global hook...${NC}"

GLOBAL_HOOKS_DIR="$HOME/.claude/hooks"
mkdir -p "$GLOBAL_HOOKS_DIR"

# Copy post-bash hook
HOOK_SOURCE="$JAT_DIR/.claude/hooks/post-bash-agent-state-refresh.sh"

# If hook doesn't exist in JAT yet, create it
if [ ! -f "$HOOK_SOURCE" ]; then
    echo "  → Creating post-bash hook template..."
    mkdir -p "$JAT_DIR/.claude/hooks"

    cat > "$HOOK_SOURCE" << 'EOF'
#!/bin/bash
#
# Post-Bash Hook: Agent State Refresh
#
# Detects when agent coordination commands are executed and triggers
# statusline refresh by outputting a message (which becomes a conversation
# message, which triggers statusline update).
#
# Monitored commands:
#   - am-* (Agent Mail: reserve, release, send, reply, ack, etc.)
#   - jt (JAT Tasks: create, update, close, etc.)
#   - /jat:* slash commands (via SlashCommand tool)
#
# Hook input (stdin): JSON with tool name, input, and output
# Hook output (stdout): Message to display (triggers statusline refresh)

# Read JSON input from stdin
input_json=$(cat)

# Extract the bash command that was executed
command=$(echo "$input_json" | jq -r '.input.command // empty')

# Check if command is empty or null
if [[ -z "$command" || "$command" == "null" ]]; then
    exit 0
fi

# Detect agent coordination commands
# Pattern: am-* (Agent Mail tools) or jt followed by space (JAT Tasks commands)
if echo "$command" | grep -qE '^(am-|jt\s)'; then
    # Extract the base command for display (first word)
    base_cmd=$(echo "$command" | awk '{print $1}')

    # Output a brief message - this triggers statusline refresh!
    # Keep it minimal to avoid cluttering the conversation
    echo "✓ $base_cmd executed"
    exit 0
fi

# No agent coordination command detected - stay silent
exit 0
EOF

    chmod +x "$HOOK_SOURCE"
fi

# Copy hook to global directory
cp "$HOOK_SOURCE" "$GLOBAL_HOOKS_DIR/post-bash-agent-state-refresh.sh"
chmod +x "$GLOBAL_HOOKS_DIR/post-bash-agent-state-refresh.sh"

echo -e "  ${GREEN}✓ Installed post-bash-agent-state-refresh.sh to ~/.claude/hooks/${NC}"

# Copy jat-signal hook to global directory
JAT_SIGNAL_HOOK="$JAT_DIR/.claude/hooks/post-bash-jat-signal.sh"
if [ -f "$JAT_SIGNAL_HOOK" ]; then
    cp "$JAT_SIGNAL_HOOK" "$GLOBAL_HOOKS_DIR/post-bash-jat-signal.sh"
    chmod +x "$GLOBAL_HOOKS_DIR/post-bash-jat-signal.sh"
    echo -e "  ${GREEN}✓ Installed post-bash-jat-signal.sh to ~/.claude/hooks/${NC}"
else
    echo -e "  ${YELLOW}⚠ jat-signal hook not found: $JAT_SIGNAL_HOOK${NC}"
fi

# Copy session-start hook to global directory
SESSION_START_HOOK="$JAT_DIR/.claude/hooks/session-start-agent-identity.sh"
if [ -f "$SESSION_START_HOOK" ]; then
    cp "$SESSION_START_HOOK" "$GLOBAL_HOOKS_DIR/session-start-agent-identity.sh"
    chmod +x "$GLOBAL_HOOKS_DIR/session-start-agent-identity.sh"
    echo -e "  ${GREEN}✓ Installed session-start-agent-identity.sh to ~/.claude/hooks/${NC}"
else
    echo -e "  ${YELLOW}⚠ session-start hook not found: $SESSION_START_HOOK${NC}"
fi

# Copy pre-ask-user-question hook to global directory
PRE_ASK_HOOK="$JAT_DIR/.claude/hooks/pre-ask-user-question.sh"
if [ -f "$PRE_ASK_HOOK" ]; then
    cp "$PRE_ASK_HOOK" "$GLOBAL_HOOKS_DIR/pre-ask-user-question.sh"
    chmod +x "$GLOBAL_HOOKS_DIR/pre-ask-user-question.sh"
    echo -e "  ${GREEN}✓ Installed pre-ask-user-question.sh to ~/.claude/hooks/${NC}"
else
    echo -e "  ${YELLOW}⚠ pre-ask-user-question hook not found: $PRE_ASK_HOOK${NC}"
fi

# Copy pre-compact-save-agent hook to global directory
PRE_COMPACT_HOOK="$JAT_DIR/.claude/hooks/pre-compact-save-agent.sh"
if [ -f "$PRE_COMPACT_HOOK" ]; then
    cp "$PRE_COMPACT_HOOK" "$GLOBAL_HOOKS_DIR/pre-compact-save-agent.sh"
    chmod +x "$GLOBAL_HOOKS_DIR/pre-compact-save-agent.sh"
    echo -e "  ${GREEN}✓ Installed pre-compact-save-agent.sh to ~/.claude/hooks/${NC}"
else
    echo -e "  ${YELLOW}⚠ pre-compact-save-agent hook not found: $PRE_COMPACT_HOOK${NC}"
fi

# NOTE: session-start-restore-agent.sh is no longer needed separately.
# Its features (WINDOWID fallback, workflow state injection, jt fallback)
# are now merged into session-start-agent-identity.sh.

# Copy user-prompt-signal hook to global directory
USER_PROMPT_HOOK="$JAT_DIR/.claude/hooks/user-prompt-signal.sh"
if [ -f "$USER_PROMPT_HOOK" ]; then
    cp "$USER_PROMPT_HOOK" "$GLOBAL_HOOKS_DIR/user-prompt-signal.sh"
    chmod +x "$GLOBAL_HOOKS_DIR/user-prompt-signal.sh"
    echo -e "  ${GREEN}✓ Installed user-prompt-signal.sh to ~/.claude/hooks/${NC}"
else
    echo -e "  ${YELLOW}⚠ user-prompt-signal hook not found: $USER_PROMPT_HOOK${NC}"
fi

# Copy monitor-output helper to global directory (used by user-prompt-signal.sh via $SCRIPT_DIR)
MONITOR_OUTPUT="$JAT_DIR/.claude/hooks/monitor-output.sh"
if [ -f "$MONITOR_OUTPUT" ]; then
    cp "$MONITOR_OUTPUT" "$GLOBAL_HOOKS_DIR/monitor-output.sh"
    chmod +x "$GLOBAL_HOOKS_DIR/monitor-output.sh"
    echo -e "  ${GREEN}✓ Installed monitor-output.sh to ~/.claude/hooks/${NC}"
else
    echo -e "  ${YELLOW}⚠ monitor-output helper not found: $MONITOR_OUTPUT${NC}"
fi

echo ""

# ============================================================================
# STEP 2b: Configure global hooks in settings.local.json
# ============================================================================

echo -e "${BLUE}Step 2b: Configuring global hooks in settings.local.json...${NC}"

SETTINGS_LOCAL="$HOME/.claude/settings.local.json"

# Create settings.local.json if it doesn't exist
if [ ! -f "$SETTINGS_LOCAL" ]; then
    echo '{}' > "$SETTINGS_LOCAL"
fi

# Check if hooks are already configured
if grep -q '"SessionStart"' "$SETTINGS_LOCAL" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} SessionStart hook already configured"

    # Add PreCompact if missing (upgrade path for older installs)
    if ! grep -q '"PreCompact"' "$SETTINGS_LOCAL" 2>/dev/null; then
        TEMP_SETTINGS=$(mktemp)
        if jq '.hooks = (.hooks // {}) * {
            "PreCompact": [
                {
                    "matcher": ".*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/pre-compact-save-agent.sh",
                            "statusMessage": "Saving agent identity..."
                        }
                    ]
                }
            ]
        }' "$SETTINGS_LOCAL" > "$TEMP_SETTINGS" 2>/dev/null; then
            mv "$TEMP_SETTINGS" "$SETTINGS_LOCAL"
            echo -e "  ${GREEN}✓ Added PreCompact hook to settings.local.json${NC}"
        else
            echo -e "  ${YELLOW}⚠ Failed to add PreCompact hook${NC}"
            rm -f "$TEMP_SETTINGS"
        fi
    else
        echo -e "  ${GREEN}✓${NC} PreCompact hook already configured"
    fi

    # Add UserPromptSubmit if missing (upgrade path for older installs)
    if ! grep -q '"UserPromptSubmit"' "$SETTINGS_LOCAL" 2>/dev/null; then
        TEMP_SETTINGS=$(mktemp)
        if jq '.hooks = (.hooks // {}) * {
            "UserPromptSubmit": [
                {
                    "matcher": ".*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/user-prompt-signal.sh",
                            "streamStdinJson": true
                        }
                    ]
                }
            ]
        }' "$SETTINGS_LOCAL" > "$TEMP_SETTINGS" 2>/dev/null; then
            mv "$TEMP_SETTINGS" "$SETTINGS_LOCAL"
            echo -e "  ${GREEN}✓ Added UserPromptSubmit hook to settings.local.json${NC}"
        else
            echo -e "  ${YELLOW}⚠ Failed to add UserPromptSubmit hook${NC}"
            rm -f "$TEMP_SETTINGS"
        fi
    else
        echo -e "  ${GREEN}✓${NC} UserPromptSubmit hook already configured"
    fi
else
    # Add SessionStart and PostToolUse hooks to settings.local.json
    TEMP_SETTINGS=$(mktemp)
    if jq '. * {
        "hooks": ((.hooks // {}) * {
            "SessionStart": [
                {
                    "matcher": ".*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/session-start-agent-identity.sh",
                            "statusMessage": "Setting up agent identity..."
                        }
                    ]
                }
            ],
            "PreToolUse": [
                {
                    "matcher": "AskUserQuestion",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/pre-ask-user-question.sh"
                        }
                    ]
                }
            ],
            "PreCompact": [
                {
                    "matcher": ".*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/pre-compact-save-agent.sh",
                            "statusMessage": "Saving agent identity..."
                        }
                    ]
                }
            ],
            "PostToolUse": [
                {
                    "matcher": "Bash",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/post-bash-jat-signal.sh"
                        }
                    ]
                }
            ],
            "UserPromptSubmit": [
                {
                    "matcher": ".*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "~/.claude/hooks/user-prompt-signal.sh",
                            "streamStdinJson": true
                        }
                    ]
                }
            ]
        })
    }' "$SETTINGS_LOCAL" > "$TEMP_SETTINGS" 2>/dev/null; then
        mv "$TEMP_SETTINGS" "$SETTINGS_LOCAL"
        echo -e "  ${GREEN}✓ Added SessionStart, PreCompact, PostToolUse, and UserPromptSubmit hooks to settings.local.json${NC}"
    else
        echo -e "  ${YELLOW}⚠ Failed to update settings.local.json${NC}"
        rm -f "$TEMP_SETTINGS"
    fi
fi

echo ""

# ============================================================================
# STEP 3: Configure settings.json for each project
# ============================================================================

echo -e "${BLUE}Step 3: Configuring project settings...${NC}"
echo ""

# Scan ~/code/ for projects
CODE_DIR="$HOME/code"

if [ ! -d "$CODE_DIR" ]; then
    echo -e "${YELLOW}⚠ ~/code/ directory not found${NC}"
    echo "Creating $CODE_DIR..."
    mkdir -p "$CODE_DIR"
fi

REPOS_FOUND=0
SETTINGS_CONFIGURED=0
SKIPPED=0

for repo_dir in "$CODE_DIR"/*; do
    # Skip if not a directory
    if [ ! -d "$repo_dir" ]; then
        continue
    fi

    REPO_NAME=$(basename "$repo_dir")
    echo -e "${BLUE}→ ${REPO_NAME}${NC}"

    # Check if it's a git repository
    if [ ! -d "$repo_dir/.git" ]; then
        echo -e "  ${YELLOW}⊘ Not a git repository, skipping${NC}"
        ((SKIPPED++))
        echo ""
        continue
    fi

    ((REPOS_FOUND++))

    # Create .claude directory if needed
    mkdir -p "$repo_dir/.claude"

    # ========================================================================
    # Configure settings.json (use GLOBAL statusline path)
    # ========================================================================

    SETTINGS_FILE="$repo_dir/.claude/settings.json"

    # Check if settings.json already exists
    if [ -f "$SETTINGS_FILE" ]; then
        # Check if it already has statusLine configuration
        if grep -q '"statusLine"' "$SETTINGS_FILE"; then
            # Update to use global statusline if still using local
            if grep -q '"\./\.claude/statusline\.sh' "$SETTINGS_FILE"; then
                # macOS sed requires -i '' (empty backup extension), Linux uses -i alone
                if [[ "$(uname)" == "Darwin" ]]; then
                    sed -i '' 's|"\./\.claude/statusline\.sh|"~/.claude/statusline.sh|g' "$SETTINGS_FILE"
                else
                    sed -i 's|"\./\.claude/statusline\.sh|"~/.claude/statusline.sh|g' "$SETTINGS_FILE"
                fi
                echo -e "  ${GREEN}✓ Updated settings.json to use global statusline${NC}"
                ((SETTINGS_CONFIGURED++))
            else
                echo -e "  ${GREEN}✓${NC} settings.json already configured"
            fi
        else
            # Add statusLine and hooks configuration
            echo "  → Updating settings.json with statusline and hooks..."

            # Use jq to merge configuration
            TEMP_SETTINGS=$(mktemp)
            if jq '. + {
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
                                    "command": "~/.claude/hooks/post-bash-jat-signal.sh",
                                    "statusMessage": "",
                                    "streamStdinJson": true
                                }
                            ]
                        }
                    ]
                }
            }' "$SETTINGS_FILE" > "$TEMP_SETTINGS" 2>/dev/null; then
                mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
                echo -e "  ${GREEN}✓ Updated settings.json${NC}"
                ((SETTINGS_CONFIGURED++))
            else
                echo -e "  ${YELLOW}⚠ Failed to update settings.json (invalid JSON?)${NC}"
                rm -f "$TEMP_SETTINGS"
            fi
        fi
    else
        # Create new settings.json with GLOBAL statusline path
        echo "  → Creating settings.json with statusline and hooks..."
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
            "command": "~/.claude/hooks/post-bash-jat-signal.sh",
            "statusMessage": "",
            "streamStdinJson": true
          }
        ]
      }
    ]
  }
}
EOF
        echo -e "  ${GREEN}✓ Created settings.json${NC}"
        ((SETTINGS_CONFIGURED++))
    fi

    echo ""
done

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Statusline and Hooks Setup Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  Global statusline: ~/.claude/statusline.sh"
echo "  Global hooks:"
echo "    - ~/.claude/hooks/session-start-agent-identity.sh (SessionStart - unified)"
echo "    - ~/.claude/hooks/pre-ask-user-question.sh (PreToolUse)"
echo "    - ~/.claude/hooks/pre-compact-save-agent.sh (PreCompact)"
echo "    - ~/.claude/hooks/post-bash-agent-state-refresh.sh (PostToolUse)"
echo "    - ~/.claude/hooks/post-bash-jat-signal.sh (PostToolUse)"
echo "    - ~/.claude/hooks/user-prompt-signal.sh (UserPromptSubmit)"
echo "    - ~/.claude/hooks/monitor-output.sh (helper for user-prompt-signal)"
echo ""
echo "  Total repos found: $REPOS_FOUND"
echo "  Settings.json configured: $SETTINGS_CONFIGURED"
echo "  Skipped (not git repos): $SKIPPED"
echo ""

if [ $REPOS_FOUND -eq 0 ]; then
    echo -e "${YELLOW}  ⚠ No repositories found in ~/code/${NC}"
    echo "  Clone some projects to ~/code/ to get started"
else
    echo "  All repositories now have:"
    echo "    • Global statusline showing agent, task, git, context"
    echo "    • Real-time updates when running am-* or jt commands"
    echo ""
    echo "  Open Claude Code in any project to see the statusline in action!"
    echo ""
fi
