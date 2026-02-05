#!/bin/bash
# JAT Uninstall Script - Complete removal for clean reinstall testing

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if running from within a JAT directory
CURRENT_DIR="$(pwd)"
JAT_DIRS=(
    "$HOME/.local/share/jat"
    "$HOME/code/jat"
    "$HOME/code/jomarchy-agent-tools"
)

for jat_dir in "${JAT_DIRS[@]}"; do
    # Expand ~ to actual home directory and normalize paths
    jat_dir_expanded="${jat_dir/#\~/$HOME}"
    if [[ "$CURRENT_DIR" == "$jat_dir_expanded"* ]]; then
        echo -e "${RED}ERROR: You are currently inside a JAT directory that will be removed!${NC}"
        echo ""
        echo -e "${YELLOW}Current directory: ${CURRENT_DIR}${NC}"
        echo -e "${YELLOW}JAT directory: ${jat_dir_expanded}${NC}"
        echo ""
        echo -e "${RED}This will cause incomplete removal because the shell cannot delete its own working directory.${NC}"
        echo ""
        echo -e "${GREEN}Solution: Change to a different directory first${NC}"
        echo "  cd ~"
        echo "  jat-uninstall"
        echo ""
        exit 1
    fi
done

echo -e "${BLUE}JAT Complete Uninstall${NC}"
echo ""
echo -e "${YELLOW}This will remove:${NC}"
echo "  • JAT installation directory"
echo "  • ~/.local/bin symlinks (jt, am-*, jat, browser-*, etc.)"
echo "  • ~/.config/jat config files"
echo "  • ~/.claude/commands/jat"
echo "  • Running tmux sessions (server-jat, jat-*)"
echo "  • Bash launcher functions from ~/.bashrc"
echo ""
echo -e "${RED}WARNING: This does NOT remove .jat/ from your projects${NC}"
echo -e "${YELLOW}(Remove those manually if desired: rm -rf ~/code/*/.jat)${NC}"
echo ""
read -p "Continue? [y/N] " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

echo ""

# 1. Stop running tmux sessions
echo -e "${BLUE}[1/7] Stopping JAT tmux sessions...${NC}"
tmux kill-session -t server-jat 2>/dev/null && echo "  ✓ Killed server-jat" || echo "  • server-jat not running"
for session in $(tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^jat-" || true); do
    tmux kill-session -t "$session" && echo "  ✓ Killed $session"
done

# 2. Remove symlinks from ~/.local/bin
echo -e "${BLUE}[2/7] Removing symlinks from ~/.local/bin...${NC}"
for tool in jt jt-* am-* browser-* db-* signal-* omarchy-* jat jat-*; do
    if [ -L ~/.local/bin/"$tool" ]; then
        rm ~/.local/bin/"$tool" && echo "  ✓ Removed $tool"
    fi
done

# 3. Remove config files
echo -e "${BLUE}[3/7] Removing config files...${NC}"
if [ -d ~/.config/jat ]; then
    rm -rf ~/.config/jat && echo "  ✓ Removed ~/.config/jat"
else
    echo "  • ~/.config/jat not found"
fi

# 4. Remove Claude commands
echo -e "${BLUE}[4/7] Removing ~/.claude/commands/jat...${NC}"
if [ -d ~/.claude/commands/jat ]; then
    rm -rf ~/.claude/commands/jat && echo "  ✓ Removed ~/.claude/commands/jat"
else
    echo "  • ~/.claude/commands/jat not found"
fi

# 5. Remove bash launcher functions
echo -e "${BLUE}[5/7] Removing JAT functions from ~/.bashrc...${NC}"
if grep -q "# JAT Project Launchers" ~/.bashrc 2>/dev/null; then
    # Remove lines between markers
    sed -i '/# JAT Project Launchers - START/,/# JAT Project Launchers - END/d' ~/.bashrc
    echo "  ✓ Removed JAT functions from ~/.bashrc"
else
    echo "  • No JAT functions found in ~/.bashrc"
fi

# 6. Find and remove JAT installation directories
echo -e "${BLUE}[6/7] Removing JAT installation...${NC}"
REMOVED=0
for dir in ~/.local/share/jat ~/code/jat ~/code/jomarchy-agent-tools; do
    if [ -d "$dir" ]; then
        # Check if user is currently in this directory
        CURRENT_DIR=$(pwd)
        REAL_DIR=$(realpath "$dir" 2>/dev/null || echo "$dir")
        if [[ "$CURRENT_DIR" == "$REAL_DIR"* ]]; then
            echo -e "  ${RED}ERROR: You are currently in $dir${NC}"
            echo -e "  ${YELLOW}Please cd to another directory and run uninstall again${NC}"
            echo ""
            echo "  Example:"
            echo "    cd ~"
            echo "    jat-uninstall"
            exit 1
        fi

        echo -e "  ${YELLOW}Found: $dir${NC}"
        read -p "    Remove this directory? [y/N] " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$dir" && echo "  ✓ Removed $dir" && REMOVED=1
        fi
    fi
done
if [ $REMOVED -eq 0 ]; then
    echo "  • No JAT installation found"
fi

# 7. Summary
echo ""
echo -e "${BLUE}[7/7] Cleanup summary${NC}"
echo ""
echo -e "${GREEN}✓ JAT uninstalled${NC}"
echo ""
echo -e "${YELLOW}To remove .jat from projects (optional):${NC}"
echo "  cd ~/code && for dir in */; do rm -rf \"\${dir}.jat\"; done"
echo ""
echo -e "${YELLOW}To remove git hooks from projects (optional):${NC}"
echo "  cd ~/code && for dir in */; do rm -f \"\${dir}.git/hooks/pre-commit\"; done"
echo ""
echo -e "${GREEN}Ready for fresh install:${NC}"
echo "  curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash"
echo ""
