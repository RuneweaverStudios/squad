#!/bin/bash

# Jomarchy Agent Tools Installer
# Complete AI-assisted development environment setup
# https://github.com/joewinke/jomarchy-agent-tools

set -e  # Exit on error

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}ERROR: Do not run this script as root${NC}"
    echo "Run as normal user - sudo will be used when needed"
    exit 1
fi

# Determine installation directory
if [ -d "$HOME/code/jomarchy-agent-tools" ]; then
    INSTALL_DIR="$HOME/code/jomarchy-agent-tools"
    echo -e "${BLUE}Using local installation: $INSTALL_DIR${NC}"
else
    # Clone from GitHub
    echo -e "${BLUE}Cloning jomarchy-agent-tools...${NC}"
    INSTALL_DIR="$HOME/code/jomarchy-agent-tools"
    mkdir -p "$HOME/code"
    git clone https://github.com/joewinke/jomarchy-agent-tools.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                                                               ║${NC}"
echo -e "${BOLD}║           ${BLUE}Jomarchy Agent Tools Installer${NC}${BOLD}                   ║${NC}"
echo -e "${BOLD}║                                                               ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Complete AI-assisted development environment:"
echo ""
echo "  • Agent Mail (multi-agent coordination server)"
echo "  • Beads CLI (dependency-aware task planning)"
echo "  • 43 bash agent tools (am-*, browser-*, db-*, etc.)"
echo "  • Global ~/.claude/CLAUDE.md configuration"
echo "  • Per-repository setup (bd init, CLAUDE.md templates)"
echo ""
echo "This will save 32,000+ tokens vs MCP servers!"
echo ""
echo -e "${YELLOW}Press ENTER to continue or Ctrl+C to cancel${NC}"
read

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 1/5: Installing Agent Mail Server${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/scripts/install-agent-mail.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 2/5: Installing Beads CLI${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/scripts/install-beads.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 3/5: Symlinking Agent Tools${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/scripts/symlink-tools.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 4/5: Setting Up Global Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/scripts/setup-global-claude-md.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 5/5: Setting Up Repositories${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/scripts/setup-repos.sh"

echo ""
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}║         ${BOLD}✓ Jomarchy Agent Tools Installed!${NC}${GREEN}                  ║${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "What was installed:"
echo ""
echo "  ✓ Agent Mail Server (http://localhost:3141)"
echo "  ✓ Beads CLI (bd command)"
echo "  ✓ 43 Agent Tools (am-*, browser-*, etc.)"
echo "  ✓ Global ~/.claude/CLAUDE.md (multi-project instructions)"
echo "  ✓ Per-repo setup (bd init, CLAUDE.md templates)"
echo ""
echo "Benefits:"
echo ""
echo "  • Multi-agent coordination via Agent Mail"
echo "  • Dependency-aware task planning with Beads"
echo "  • 32,000+ token savings vs MCP servers"
echo "  • Works across ALL AI coding assistants"
echo "  • Bash composability (pipes, jq, xargs)"
echo ""
echo "Next steps:"
echo ""
echo "  1. Restart your shell: source ~/.bashrc"
echo "  2. Check Agent Mail: systemctl --user status agent-mail"
echo "  3. Test Beads: cd ~/code/<project> && bd ready"
echo "  4. Test tools: am-inbox --help"
echo ""
echo "Documentation: https://github.com/joewinke/jomarchy-agent-tools"
echo ""
echo -e "${GREEN}Happy coding with AI! 🤖${NC}"
echo ""
