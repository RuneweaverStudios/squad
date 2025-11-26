#!/bin/bash
#
# Install JAT git hooks to a repository
#
# Usage: install-hooks.sh [repo-path]
#        If no path given, installs to current directory
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR/hooks"
TARGET_REPO="${1:-.}"

# Resolve to absolute path
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

# Check if target is a git repo
if [ ! -d "$TARGET_REPO/.git" ]; then
    echo "❌ Not a git repository: $TARGET_REPO" >&2
    exit 1
fi

TARGET_HOOKS="$TARGET_REPO/.git/hooks"

echo "Installing JAT hooks to: $TARGET_REPO"

# Install pre-commit hook
if [ -f "$TARGET_HOOKS/pre-commit" ]; then
    # Check if it's already our hook
    if grep -q "AGENT REGISTRATION CHECK" "$TARGET_HOOKS/pre-commit" 2>/dev/null; then
        echo "  ✓ pre-commit hook already installed (updating)"
    else
        echo "  ⚠ Existing pre-commit hook found, backing up to pre-commit.backup"
        cp "$TARGET_HOOKS/pre-commit" "$TARGET_HOOKS/pre-commit.backup"
    fi
fi

cp "$HOOKS_DIR/pre-commit" "$TARGET_HOOKS/pre-commit"
chmod +x "$TARGET_HOOKS/pre-commit"
echo "  ✓ Installed pre-commit hook"

echo ""
echo "✅ JAT hooks installed!"
echo ""
echo "The pre-commit hook will:"
echo "  • Block commits if no agent is registered (run /jat:start first)"
echo "  • Auto-sync beads changes before commit"
echo ""
echo "To bypass: git commit --no-verify"
