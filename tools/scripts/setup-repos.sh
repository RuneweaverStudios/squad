#!/bin/bash

# Per-Repository Setup
# - Initialize Beads (bd init) in each project
# - Add jat shared documentation imports to project CLAUDE.md

# Note: Don't use 'set -e' - arithmetic (( )) can return 1 when incrementing from 0
# This would cause premature exit on: ((REPOS_FOUND++))

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Determine JAT installation directory
# Accept as first argument from install.sh, or auto-detect
if [ -n "$1" ]; then
    JAT_DIR="$1"
elif [ -d "${XDG_DATA_HOME:-$HOME/.local/share}/jat" ]; then
    JAT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
elif [ -d "$HOME/code/jat" ]; then
    JAT_DIR="$HOME/code/jat"
elif [ -d "$HOME/code/jomarchy-agent-tools" ]; then
    JAT_DIR="$HOME/code/jomarchy-agent-tools"
else
    echo -e "${RED}ERROR: JAT installation not found${NC}"
    exit 1
fi

# The imports to add to each project's CLAUDE.md (use detected JAT_DIR)
JAT_IMPORTS="@$JAT_DIR/shared/overview.md
@$JAT_DIR/shared/agent-mail.md
@$JAT_DIR/shared/bash-patterns.md
@$JAT_DIR/shared/beads.md
@$JAT_DIR/shared/tools.md
@$JAT_DIR/shared/workflow-commands.md
@$JAT_DIR/shared/statusline.md"

# Marker to detect if imports are already present (check for any JAT import)
JAT_MARKER="@.*/shared/overview.md"

# Standard gitignore patterns for JAT projects
# These should be ignored (per-developer/session-specific):
#   - .claude/agent-*.txt (session files)
#   - .mcp.json (may contain API keys)
# These should be committed:
#   - .claude/settings.json (team config)
#   - .beads/*.jsonl (task data - source of truth)
#   - .beads/config.yaml, metadata.json
JAT_GITIGNORE_PATTERNS='# Claude Code session-specific files (per-developer, do not commit)
.claude/agent-*.txt
.claude/agent-*-activity.jsonl

# MCP server configuration (may contain sensitive API keys)
.mcp.json'

# Marker to detect if JAT gitignore patterns already present
JAT_GITIGNORE_MARKER=".claude/agent-*.txt"

echo -e "${BLUE}Setting up repositories for jat (Jomarchy Agent Tools)...${NC}"
echo ""

# Check if bd command is available
if ! command -v bd &> /dev/null; then
    echo -e "${RED}ERROR: 'bd' command not found${NC}"
    echo "Please install Beads CLI first (run beads-cli.sh)"
    exit 1
fi

# Ask if user wants to auto-setup existing projects
echo -e "${YELLOW}JAT can automatically initialize all projects in ~/code/ with:${NC}"
echo "  • Beads task management (.beads/ directory)"
echo "  • JAT documentation imports (CLAUDE.md)"
echo "  • Git hooks for agent coordination"
echo "  • .gitignore patterns"
echo ""
echo -e "${BLUE}Would you like to auto-setup all existing projects? [y/N]${NC} "
read -r response </dev/tty

if [[ ! "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo ""
    echo -e "${GREEN}Skipping auto-setup.${NC}"
    echo ""
    echo "You can initialize projects individually later with:"
    echo "  cd ~/code/<project>"
    echo "  bd init"
    echo ""
    echo "Or run this script again to auto-setup all projects:"
    echo "  bash $SCRIPT_DIR/setup-repos.sh"
    echo ""
    exit 0
fi

echo ""

# Scan ~/code/ for projects
CODE_DIR="$HOME/code"

if [ ! -d "$CODE_DIR" ]; then
    echo -e "${YELLOW}⚠ ~/code/ directory not found${NC}"
    echo "Creating $CODE_DIR..."
    mkdir -p "$CODE_DIR"
fi

# Find all directories in ~/code/
echo "Scanning ~/code/ for projects..."
echo ""

REPOS_FOUND=0
BEADS_INITIALIZED=0
GITIGNORE_UPDATED=0
HOOKS_INSTALLED=0
IMPORTS_ADDED=0
SKIPPED=0

for repo_dir in "$CODE_DIR"/*; do
    # Skip if not a directory
    if [ ! -d "$repo_dir" ]; then
        continue
    fi

    REPO_NAME=$(basename "$repo_dir")

    # Skip jat itself (it has its own CLAUDE.md structure)
    if [ "$REPO_NAME" = "jat" ] || [ "$REPO_NAME" = "jomarchy-agent-tools" ]; then
        echo -e "${BLUE}→ ${REPO_NAME}${NC}"
        echo -e "  ${YELLOW}⊘ Skipping jat repo (has its own structure)${NC}"
        echo ""
        continue
    fi

    echo -e "${BLUE}→ ${REPO_NAME}${NC}"

    # Check if it's a git repository
    if [ ! -d "$repo_dir/.git" ]; then
        echo -e "  ${YELLOW}⊘ Not a git repository, skipping${NC}"
        ((SKIPPED++))
        echo ""
        continue
    fi

    ((REPOS_FOUND++))

    # Initialize Beads if needed
    if [ ! -d "$repo_dir/.beads" ]; then
        echo "  → Initializing Beads..."
        cd "$repo_dir"

        # Run bd init non-interactively
        echo -e "Y\nY\n" | bd init > /dev/null 2>&1 || {
            echo -e "  ${YELLOW}⚠ Beads init failed (may already be partially initialized)${NC}"
        }

        if [ -d "$repo_dir/.beads" ]; then
            echo -e "  ${GREEN}✓ Beads initialized${NC}"
            ((BEADS_INITIALIZED++))
        fi
    else
        echo -e "  ${GREEN}✓${NC} Beads already initialized"
    fi

    # Update .gitignore with JAT patterns
    GITIGNORE_FILE="$repo_dir/.gitignore"

    if [ -f "$GITIGNORE_FILE" ]; then
        # Check if JAT patterns already present
        if grep -q "$JAT_GITIGNORE_MARKER" "$GITIGNORE_FILE"; then
            echo -e "  ${GREEN}✓${NC} .gitignore already has JAT patterns"
        else
            # Append JAT patterns to existing .gitignore
            echo "  → Adding JAT patterns to .gitignore..."
            echo "" >> "$GITIGNORE_FILE"
            echo "$JAT_GITIGNORE_PATTERNS" >> "$GITIGNORE_FILE"
            echo -e "  ${GREEN}✓ Added JAT patterns to .gitignore${NC}"
            ((GITIGNORE_UPDATED++))
        fi
    else
        # Create new .gitignore with JAT patterns
        echo "  → Creating .gitignore with JAT patterns..."
        echo "$JAT_GITIGNORE_PATTERNS" > "$GITIGNORE_FILE"
        echo -e "  ${GREEN}✓ Created .gitignore with JAT patterns${NC}"
        ((GITIGNORE_UPDATED++))
    fi

    # Install git hooks
    HOOKS_SOURCE="$SCRIPT_DIR/hooks/pre-commit"
    HOOKS_TARGET="$repo_dir/.git/hooks/pre-commit"

    if [ -f "$HOOKS_SOURCE" ]; then
        if [ -f "$HOOKS_TARGET" ] && grep -q "AGENT REGISTRATION CHECK" "$HOOKS_TARGET" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Git hooks already installed"
        else
            if [ -f "$HOOKS_TARGET" ]; then
                cp "$HOOKS_TARGET" "$HOOKS_TARGET.backup"
                echo -e "  ${YELLOW}⚠${NC} Backed up existing pre-commit hook"
            fi
            cp "$HOOKS_SOURCE" "$HOOKS_TARGET"
            chmod +x "$HOOKS_TARGET"
            echo -e "  ${GREEN}✓ Installed git hooks${NC}"
            ((HOOKS_INSTALLED++))
        fi
    fi

    # Handle CLAUDE.md
    CLAUDE_MD="$repo_dir/CLAUDE.md"

    if [ ! -f "$CLAUDE_MD" ]; then
        # Create new CLAUDE.md with imports
        echo "  → Creating CLAUDE.md with jat imports..."
        cat > "$CLAUDE_MD" << EOF
# $REPO_NAME

$JAT_IMPORTS

## Project Overview

[Add project-specific documentation here]

## Quick Start

\`\`\`bash
# Start working (registers agent + picks task)
/jat:start

# See available tasks
bd ready
\`\`\`
EOF
        echo -e "  ${GREEN}✓ Created CLAUDE.md with jat imports${NC}"
        ((IMPORTS_ADDED++))
    else
        # Check if imports are already present (use -E for regex)
        if grep -qE "$JAT_MARKER" "$CLAUDE_MD"; then
            echo -e "  ${GREEN}✓${NC} CLAUDE.md already has jat imports"
        else
            # Add imports at the top (after title if present)
            echo "  → Adding jat imports to CLAUDE.md..."

            # Read first line to check for title
            FIRST_LINE=$(head -1 "$CLAUDE_MD")

            if [[ "$FIRST_LINE" == "#"* ]]; then
                # Has title, insert imports after first line
                {
                    head -1 "$CLAUDE_MD"
                    echo ""
                    echo "$JAT_IMPORTS"
                    echo ""
                    tail -n +2 "$CLAUDE_MD"
                } > "$CLAUDE_MD.tmp"
                mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
            else
                # No title, insert imports at top
                {
                    echo "$JAT_IMPORTS"
                    echo ""
                    cat "$CLAUDE_MD"
                } > "$CLAUDE_MD.tmp"
                mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
            fi

            echo -e "  ${GREEN}✓ Added jat imports to CLAUDE.md${NC}"
            ((IMPORTS_ADDED++))
        fi
    fi

    echo ""
done

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Repository Setup Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  Total repos found: $REPOS_FOUND"
echo "  Beads initialized: $BEADS_INITIALIZED"
echo "  .gitignore updated: $GITIGNORE_UPDATED"
echo "  Git hooks installed: $HOOKS_INSTALLED"
echo "  jat imports added: $IMPORTS_ADDED"
echo "  Skipped (not git repos): $SKIPPED"
echo ""

if [ $REPOS_FOUND -eq 0 ]; then
    echo -e "${YELLOW}  ⚠ No repositories found in ~/code/${NC}"
    echo "  Clone some projects to ~/code/ to get started"
else
    echo "  All repositories now have jat multi-agent tooling!"
    echo ""
    echo "  Each project's CLAUDE.md imports:"
    echo "    @$JAT_DIR/shared/overview.md      # System overview"
    echo "    @$JAT_DIR/shared/agent-mail.md    # Agent Mail docs"
    echo "    @$JAT_DIR/shared/bash-patterns.md # Bash patterns"
    echo "    @$JAT_DIR/shared/beads.md         # Beads task planning"
    echo "    @$JAT_DIR/shared/tools.md         # 33 bash tools"
    echo "    @$JAT_DIR/shared/workflow-commands.md # /jat:* commands"
    echo "    @$JAT_DIR/shared/statusline.md    # Statusline docs"
    echo ""
    echo "  Test in any project:"
    echo "    cd ~/code/<project>"
    echo "    /jat:start                # Register + start work"
    echo ""
fi
