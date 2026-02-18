#!/bin/bash
# Install SQUAD skills for Pi coding agent
# Creates symlinks from SQUAD skills/ to ~/.pi/agent/skills/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQUAD_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_SRC="$SQUAD_DIR/skills"
SKILLS_DST="$HOME/.pi/agent/skills"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Installing SQUAD skills for Pi coding agent...${NC}"
echo

# Check Pi is installed
if ! command -v pi &>/dev/null; then
    echo -e "${YELLOW}Warning: Pi coding agent not found.${NC}"
    echo "Install with: npm install -g @mariozechner/pi-coding-agent"
    echo "Continuing anyway (skills will be ready when Pi is installed)..."
    echo
fi

# Check source skills exist
if [[ ! -d "$SKILLS_SRC" ]]; then
    echo "Error: Skills source directory not found: $SKILLS_SRC"
    exit 1
fi

# Create Pi skills directory
mkdir -p "$SKILLS_DST"

# Count skills
SKILL_COUNT=0

# Symlink each skill directory
for skill_dir in "$SKILLS_SRC"/*/; do
    skill_name="$(basename "$skill_dir")"

    # Verify SKILL.md exists
    if [[ ! -f "$skill_dir/SKILL.md" ]]; then
        echo -e "${YELLOW}  Skip: $skill_name (no SKILL.md)${NC}"
        continue
    fi

    target="$SKILLS_DST/$skill_name"

    # Remove existing symlink or directory
    if [[ -L "$target" ]]; then
        rm "$target"
    elif [[ -d "$target" ]]; then
        echo -e "${YELLOW}  Warning: $target exists as directory, replacing with symlink${NC}"
        rm -rf "$target"
    fi

    # Create symlink
    ln -s "$skill_dir" "$target"
    echo -e "${GREEN}  ✓ $skill_name${NC} -> $skill_dir"
    SKILL_COUNT=$((SKILL_COUNT + 1))
done

echo
echo -e "${GREEN}Installed $SKILL_COUNT skill(s) to $SKILLS_DST${NC}"

# Copy AGENTS.md to Pi's global location if it doesn't exist or is outdated
PI_AGENTS_MD="$HOME/.pi/agent/AGENTS.md"
SQUAD_AGENTS_MD="$SQUAD_DIR/AGENTS.md"

if [[ -f "$SQUAD_AGENTS_MD" ]]; then
    if [[ ! -f "$PI_AGENTS_MD" ]] || ! diff -q "$SQUAD_AGENTS_MD" "$PI_AGENTS_MD" &>/dev/null; then
        cp "$SQUAD_AGENTS_MD" "$PI_AGENTS_MD"
        echo -e "${GREEN}  ✓ AGENTS.md${NC} -> $PI_AGENTS_MD"
    else
        echo -e "  AGENTS.md already up to date"
    fi
fi

echo
echo -e "${BLUE}Skills available in Pi:${NC}"
echo "  /skill:squad-start     - Begin working on a task"
echo "  /skill:squad-complete   - Complete current task"
echo "  /skill:squad-verify     - Browser verification"
echo
echo -e "${BLUE}Quick test:${NC}"
echo "  pi                    # Start Pi"
echo "  /skill:squad-start      # Begin SQUAD workflow"
