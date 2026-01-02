#!/bin/bash

# JAT (Jomarchy Agent Tools) Installer
# Complete AI-assisted development environment setup
# https://github.com/joewinke/jat

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

# Check for required dependencies
MISSING_DEPS=""

if ! command -v tmux &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS tmux"
fi

if ! command -v sqlite3 &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS sqlite3"
fi

if ! command -v jq &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS jq"
fi

if [ -n "$MISSING_DEPS" ]; then
    echo -e "${YELLOW}⚠  Missing required dependencies:${NC}$MISSING_DEPS"
    echo ""

    # Detect package manager
    PKG_MANAGER=""
    INSTALL_CMD=""

    if command -v pacman &> /dev/null; then
        PKG_MANAGER="pacman"
        INSTALL_CMD="sudo pacman -S --noconfirm$MISSING_DEPS"
    elif command -v apt &> /dev/null; then
        PKG_MANAGER="apt"
        INSTALL_CMD="sudo apt install -y$MISSING_DEPS"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        INSTALL_CMD="sudo dnf install -y$MISSING_DEPS"
    elif command -v brew &> /dev/null; then
        PKG_MANAGER="brew"
        INSTALL_CMD="brew install$MISSING_DEPS"
    fi

    if [ -n "$PKG_MANAGER" ]; then
        echo -e "${BLUE}Would you like to install them now with $PKG_MANAGER? [Y/n]${NC}"
        read -r response

        if [[ "$response" =~ ^([yY][eE][sS]|[yY]| *)$ ]]; then
            echo -e "${BLUE}Installing dependencies...${NC}"
            if $INSTALL_CMD; then
                echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
                echo ""
            else
                echo -e "${RED}ERROR: Failed to install dependencies${NC}"
                echo "Please install manually and re-run this script"
                exit 1
            fi
        else
            echo -e "${RED}Installation cancelled. Please install dependencies manually:${NC}"
            echo "  $INSTALL_CMD"
            exit 1
        fi
    else
        echo -e "${RED}ERROR: Could not detect package manager${NC}"
        echo ""
        echo "Install dependencies manually:"
        echo "  # Arch/Manjaro: sudo pacman -S$MISSING_DEPS"
        echo "  # Debian/Ubuntu: sudo apt install$MISSING_DEPS"
        echo "  # Fedora: sudo dnf install$MISSING_DEPS"
        echo "  # macOS: brew install$MISSING_DEPS"
        exit 1
    fi
fi

# Determine installation directory
# Priority: JAT_INSTALL_DIR env var > XDG standard > legacy ~/code locations

if [ -n "$JAT_INSTALL_DIR" ]; then
    # User specified custom location via environment variable
    INSTALL_DIR="$JAT_INSTALL_DIR"
    echo -e "${BLUE}Using custom installation directory: $INSTALL_DIR${NC}"
elif [ -d "${XDG_DATA_HOME:-$HOME/.local/share}/jat" ]; then
    # Existing XDG-compliant installation (preferred)
    INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
    echo -e "${BLUE}Using existing installation: $INSTALL_DIR${NC}"
elif [ -d "$HOME/code/jat" ]; then
    # Existing installation in ~/code/jat (legacy or dev)
    INSTALL_DIR="$HOME/code/jat"
    echo -e "${BLUE}Using existing installation: $INSTALL_DIR${NC}"
elif [ -d "$HOME/code/jomarchy-agent-tools" ]; then
    # Legacy installation name
    INSTALL_DIR="$HOME/code/jomarchy-agent-tools"
    echo -e "${BLUE}Using existing installation: $INSTALL_DIR${NC}"
else
    # New installation - ask user for preference
    echo -e "${BLUE}Where would you like to install JAT?${NC}"
    echo ""
    echo "  1) ${XDG_DATA_HOME:-$HOME/.local/share}/jat (XDG standard, recommended)"
    echo "  2) ${HOME}/code/jat (if you're developing JAT itself)"
    echo "  3) Custom location"
    echo ""
    echo -e "${BLUE}Choose [1-3] (default: 1):${NC} "
    read -r install_choice

    case "${install_choice:-1}" in
        1)
            INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
            ;;
        2)
            INSTALL_DIR="$HOME/code/jat"
            ;;
        3)
            echo -e "${BLUE}Enter custom path:${NC} "
            read -r custom_path
            INSTALL_DIR="${custom_path/#\~/$HOME}"  # Expand ~ to $HOME
            ;;
        *)
            INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
            ;;
    esac

    echo -e "${BLUE}Installing to: $INSTALL_DIR${NC}"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone https://github.com/joewinke/jat.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                                                               ║${NC}"
echo -e "${BOLD}║              ${BLUE}JAT (Jomarchy Agent Tools)${NC}${BOLD}                    ║${NC}"
echo -e "${BOLD}║                                                               ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Complete AI-assisted development environment:"
echo ""
echo "  • Agent Mail (11 bash/SQLite coordination tools)"
echo "  • Beads CLI (dependency-aware task planning)"
echo "  • 28 generic bash tools (am-*, browser-*, db-*, etc.)"
echo "  • Multi-line statusline (agent, task, git, context)"
echo "  • Real-time hooks (auto-refresh statusline)"
echo "  • Optional tech stack tools (SvelteKit + Supabase, etc.)"
echo "  • Global ~/.claude/CLAUDE.md configuration"
echo "  • Per-repository setup (bd init, CLAUDE.md templates)"
echo ""
echo "This will save 32,000+ tokens vs MCP servers!"
echo ""
echo -e "${YELLOW}Press ENTER to continue or Ctrl+C to cancel${NC}"
read

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 1/11: Installing Agent Mail (bash + SQLite)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/install-agent-mail.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 2/11: Installing Beads CLI${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/install-beads.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 3/11: Symlinking Generic Tools${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/symlink-tools.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 4/11: Installing Node.js Dependencies${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if npm is available
if command -v npm &> /dev/null; then
    # Install root jat dependencies (better-sqlite3 for lib/beads.js)
    if [ -f "$INSTALL_DIR/package.json" ]; then
        echo "  → Installing jat core dependencies..."
        (cd "$INSTALL_DIR" && npm install --silent 2>/dev/null) && \
            echo -e "  ${GREEN}✓${NC} jat core dependencies installed" || \
            echo -e "  ${YELLOW}⚠${NC} jat npm install failed (run manually: cd ~/code/jat && npm install)"
    fi

    # Install browser-tools dependencies (puppeteer-core, cheerio)
    if [ -f "$INSTALL_DIR/tools/browser/package.json" ]; then
        echo "  → Installing browser-tools dependencies..."
        (cd "$INSTALL_DIR/tools/browser" && npm install --silent 2>/dev/null) && \
            echo -e "  ${GREEN}✓${NC} browser-tools dependencies installed" || \
            echo -e "  ${YELLOW}⚠${NC} browser-tools npm install failed (run manually: cd tools/browser && npm install)"
    fi

    # Install dashboard dependencies (SvelteKit, etc.)
    if [ -f "$INSTALL_DIR/dashboard/package.json" ]; then
        echo "  → Installing dashboard dependencies..."
        (cd "$INSTALL_DIR/dashboard" && npm install --legacy-peer-deps --engine-strict=false --silent 2>/dev/null) && \
            echo -e "  ${GREEN}✓${NC} dashboard dependencies installed" || \
            echo -e "  ${YELLOW}⚠${NC} dashboard npm install failed (run manually: cd dashboard && npm install --legacy-peer-deps)"
    fi
else
    echo -e "${YELLOW}  ⚠ npm not found - skipping Node.js dependencies${NC}"
    echo "  Install Node.js/npm, then run manually:"
    echo "    cd $INSTALL_DIR && npm install"
    echo "    cd $INSTALL_DIR/tools/browser && npm install"
    echo "    cd $INSTALL_DIR/dashboard && npm install"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 5/11: Statusline & Hooks Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-statusline-and-hooks.sh" "$INSTALL_DIR"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 6/11: Tmux Mouse Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-tmux.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 7/11: Optional Tech Stack Tools${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if gum is available
if command -v gum &> /dev/null; then
    echo "Select tech stack tools to install (Space to select, Enter to continue):"
    echo ""

    SELECTED_STACKS=$(gum choose --no-limit \
        "SvelteKit + Supabase (11 tools: component-deps, route-list, error-log, etc.)" \
        "Skip - No additional stacks")

    if echo "$SELECTED_STACKS" | grep -q "SvelteKit"; then
        echo ""
        echo "Installing SvelteKit + Supabase stack..."
        bash "$INSTALL_DIR/stacks/sveltekit-supabase/install.sh"
    else
        echo ""
        echo "Skipping stack installation"
    fi
else
    echo -e "${YELLOW}  ⊘ gum not available - skipping stack selection${NC}"
    echo "  Install gum for interactive stack selection:"
    echo "    https://github.com/charmbracelet/gum"
    echo ""
    echo "  Or install stacks manually:"
    echo "    bash $INSTALL_DIR/stacks/sveltekit-supabase/install.sh"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 8/11: Voice-to-Text (Optional)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if gum is available
INSTALL_WHISPER="no"
if command -v gum &> /dev/null; then
    echo "Voice-to-Text enables speech input in the dashboard."
    echo "Requires: ~2GB disk, cmake, g++, ffmpeg"
    echo ""
    if gum confirm "Install Voice-to-Text (whisper.cpp)?"; then
        INSTALL_WHISPER="yes"
    fi
else
    echo -e "${YELLOW}  ⊘ Voice-to-Text installation skipped (gum not available)${NC}"
    echo ""
    echo "  To install manually later:"
    echo "    bash $INSTALL_DIR/tools/scripts/install-whisper.sh"
fi

if [ "$INSTALL_WHISPER" = "yes" ]; then
    bash "$INSTALL_DIR/tools/scripts/install-whisper.sh"
else
    echo ""
    echo "  Skipping Voice-to-Text installation"
    echo "  Run later with: bash $INSTALL_DIR/tools/scripts/install-whisper.sh"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 9/11: Setting Up Global Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-global-claude-md.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 10/11: Setting Up Repositories${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-repos.sh" "$INSTALL_DIR"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 11/11: Setting Up Bash Launcher Functions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-bash-functions.sh"

echo ""
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}║              ${BOLD}✓ JAT Successfully Installed!${NC}${GREEN}                  ║${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "What was installed:"
echo ""
echo "  ✓ Agent Mail (14 bash/SQLite tools: am-register, am-send, am-inbox, etc.)"
echo "  ✓ Beads CLI (bd command + 4 review tools)"
echo "  ✓ Browser Tools (12 CDP automation tools: browser-*.js)"
echo "  ✓ Database Tools (4 tools: db-query, db-schema, etc.)"
echo "  ✓ Signal Tools (2 tools: jat-signal, jat-signal-validate)"
if [ ! -z "$SELECTED_STACKS" ] && echo "$SELECTED_STACKS" | grep -q "SvelteKit"; then
    echo "  ✓ SvelteKit + Supabase Stack (11 additional tools)"
fi
if [ "$INSTALL_WHISPER" = "yes" ]; then
    echo "  ✓ Voice-to-Text (whisper.cpp + large-v3-turbo model)"
fi
echo "  ✓ Multi-line statusline (agent, task, git, context)"
echo "  ✓ Real-time hooks (auto-refresh on am-*/bd commands)"
echo "  ✓ Git pre-commit hook (agent registration check)"
echo "  ✓ Global ~/.claude/CLAUDE.md (multi-project instructions)"
echo "  ✓ Per-repo setup (bd init, CLAUDE.md templates)"
echo "  ✓ Shell launcher functions (jat-<project> in $SHELL_CONFIG)"
echo ""
echo "Benefits:"
echo ""
echo "  • Multi-agent coordination via Agent Mail"
echo "  • Dependency-aware task planning with Beads"
echo "  • Real-time statusline (agent identity, task, context, git)"
echo "  • 32,000+ token savings vs MCP servers"
echo "  • Works across ALL AI coding assistants"
echo "  • Bash composability (pipes, jq, xargs)"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Add at least one project to get started!${NC}"
echo ""
echo "  The dashboard needs projects to track. A valid project is:"
echo "    • A git repository in ~/code/"
echo "    • Has a .beads/ directory (created by 'bd init')"
echo ""
echo "  Quick setup for an existing project:"
echo "    cd ~/code/my-project && bd init"
echo ""
echo "  Or create a new project from the dashboard:"
echo "    1. Start the dashboard: jat-dashboard"
echo "    2. Go to Tasks page → click 'Add Project'"
echo ""
# Detect shell for proper instructions
SHELL_NAME=$(basename "$SHELL")
if [[ "$SHELL_NAME" == "zsh" ]]; then
    SHELL_CONFIG="~/.zshrc"
elif [[ "$SHELL_NAME" == "bash" ]]; then
    SHELL_CONFIG="~/.bashrc"
else
    SHELL_CONFIG="~/.bashrc"
fi

echo "Quick verification (run after 'source $SHELL_CONFIG'):"
echo ""
echo "  am-whoami          # Agent identity (shows 'Not registered' if new)"
echo "  bd --version       # Beads CLI version"
echo "  db-schema          # Agent Mail database schema"
echo "  jat-signal --help  # Signal tool help"
echo ""
echo "For detailed verification of all tools, see CLAUDE.md section:"
echo "  'Verifying Installation'"
echo ""
echo "Next steps:"
echo ""
echo "  1. Restart your shell: source $SHELL_CONFIG"
echo "  2. Add a project: cd ~/code/<your-project> && bd init"
echo "  3. Launch the dashboard: jat-dashboard"
echo "  4. Start working: jat-<project> (launches Claude in tmux)"
echo ""
echo "Documentation: https://github.com/joewinke/jat"
echo ""
echo -e "${GREEN}Happy coding with AI! 🤖${NC}"
echo ""
