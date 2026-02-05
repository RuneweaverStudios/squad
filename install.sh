#!/bin/bash

# JAT (Jomarchy Agent Tools) Installer
# Complete AI-assisted development environment setup
# https://github.com/joewinke/jat

set -e  # Exit on error

# Ensure ~/.local/bin is in PATH for this session
# Tools install there, but on fresh systems (especially macOS) it's not in PATH yet
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Helper function for safe user input
# Handles piped execution (curl | bash) by reading from /dev/tty
# Falls back to non-interactive defaults when TTY unavailable
prompt_user() {
    local prompt="$1"
    local default="$2"
    local varname="$3"

    echo -en "$prompt"

    # Check if /dev/tty is available for interactive input
    if [ -t 0 ] || [ -e /dev/tty ]; then
        read -r response </dev/tty 2>/dev/null || response="$default"
    else
        # Non-interactive mode (e.g., Docker build, CI)
        echo ""
        echo -e "${YELLOW}  (non-interactive mode - using default: ${default:-empty})${NC}"
        response="$default"
    fi

    eval "$varname=\"\$response\""
}

# Helper function for yes/no prompts
# Returns 0 for yes, 1 for no
# default: "y" means empty response = yes, "n" means empty response = no
prompt_yes_no() {
    local prompt="$1"
    local default="$2"  # "y" or "n"
    local response

    prompt_user "$prompt" "" "response"

    # Empty response uses default
    if [ -z "$response" ]; then
        [ "$default" = "y" ] || [ "$default" = "Y" ]
        return $?
    fi

    # Check for explicit yes/no
    case "$response" in
        [yY]|[yY][eE][sS])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

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

    # Detect package manager and build install command
    PKG_MANAGER=""
    INSTALL_CMD=""

    if command -v pacman &> /dev/null; then
        PKG_MANAGER="pacman"
        INSTALL_CMD="sudo pacman -S --noconfirm$MISSING_DEPS"
    elif command -v apt &> /dev/null; then
        PKG_MANAGER="apt"
        # Update package lists first for fresh systems
        INSTALL_CMD="sudo apt update && sudo apt install -y$MISSING_DEPS"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        INSTALL_CMD="sudo dnf install -y$MISSING_DEPS"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        INSTALL_CMD="sudo yum install -y$MISSING_DEPS"
    elif command -v zypper &> /dev/null; then
        PKG_MANAGER="zypper"
        INSTALL_CMD="sudo zypper install -y$MISSING_DEPS"
    elif command -v brew &> /dev/null; then
        PKG_MANAGER="brew"
        INSTALL_CMD="brew install$MISSING_DEPS"
    elif command -v apk &> /dev/null; then
        PKG_MANAGER="apk"
        INSTALL_CMD="sudo apk add$MISSING_DEPS"
    fi

    if [ -n "$PKG_MANAGER" ]; then
        echo -e "Detected package manager: ${BOLD}$PKG_MANAGER${NC}"
        echo -e "Command: ${BLUE}$INSTALL_CMD${NC}"
        echo ""

        if prompt_yes_no "${BLUE}Would you like to install them now? [Y/n]${NC} " "y"; then
            echo ""
            echo -e "${BLUE}Installing dependencies...${NC}"
            echo ""

            # Run installation with visible output
            if eval "$INSTALL_CMD"; then
                echo ""
                echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
                echo ""

                # Verify installation
                STILL_MISSING=""
                for dep in $MISSING_DEPS; do
                    if ! command -v "$dep" &> /dev/null; then
                        STILL_MISSING="$STILL_MISSING $dep"
                    fi
                done

                if [ -n "$STILL_MISSING" ]; then
                    echo -e "${YELLOW}⚠  Some dependencies may not be in PATH:${NC}$STILL_MISSING"
                    echo "  You may need to open a new terminal or run: source ~/$([ "$(basename "$SHELL")" = "zsh" ] && echo ".zshrc" || echo ".bashrc")"
                    echo ""
                fi
            else
                echo ""
                echo -e "${RED}ERROR: Failed to install dependencies${NC}"
                echo ""
                echo "Possible causes:"
                echo "  • Network issues - check your internet connection"
                echo "  • Permission denied - ensure you can run sudo"
                echo "  • Package not found - the package may have a different name"
                echo ""
                echo "Try installing manually:"
                echo "  $INSTALL_CMD"
                echo ""
                echo "Then re-run this script."
                exit 1
            fi
        else
            echo ""
            echo -e "${YELLOW}Installation skipped.${NC}"
            echo ""
            echo "JAT requires these dependencies to function properly."
            echo "Install them manually with:"
            echo ""
            echo "  $INSTALL_CMD"
            echo ""
            echo "Then re-run this script."
            exit 1
        fi
    else
        echo -e "${RED}ERROR: Could not detect a supported package manager${NC}"
        echo ""
        echo "JAT supports: pacman, apt, dnf, yum, zypper, brew, apk"
        echo ""
        echo "Install dependencies manually using your package manager:"
        echo ""
        echo "  # Arch/Manjaro"
        echo "  sudo pacman -S$MISSING_DEPS"
        echo ""
        echo "  # Debian/Ubuntu"
        echo "  sudo apt install$MISSING_DEPS"
        echo ""
        echo "  # Fedora"
        echo "  sudo dnf install$MISSING_DEPS"
        echo ""
        echo "  # openSUSE"
        echo "  sudo zypper install$MISSING_DEPS"
        echo ""
        echo "  # macOS"
        echo "  brew install$MISSING_DEPS"
        echo ""
        echo "  # Alpine"
        echo "  apk add$MISSING_DEPS"
        echo ""
        echo "Then re-run this script."
        exit 1
    fi
fi

# Determine installation directory
# Priority: JAT_INSTALL_DIR env var > XDG standard > legacy ~/code locations

# Determine installation directory
# Priority: JAT_INSTALL_DIR env var > current dir (if JAT repo) > XDG location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "$JAT_INSTALL_DIR" ]; then
    # User specified custom location via environment variable
    INSTALL_DIR="$JAT_INSTALL_DIR"
    echo -e "${BLUE}Using JAT_INSTALL_DIR: $INSTALL_DIR${NC}"
elif [ -f "$SCRIPT_DIR/install.sh" ] && [ -d "$SCRIPT_DIR/tools" ] && [ -d "$SCRIPT_DIR/ide" ]; then
    # Running from a JAT repo (developer mode)
    INSTALL_DIR="$SCRIPT_DIR"
    echo -e "${BLUE}Using current JAT repo: $INSTALL_DIR${NC}"
elif [ -d "${XDG_DATA_HOME:-$HOME/.local/share}/jat" ]; then
    # Existing XDG installation
    INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
    echo -e "${BLUE}Using existing installation: $INSTALL_DIR${NC}"
else
    # New installation - clone to XDG location
    INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/jat"
    echo -e "${BLUE}Installing to: $INSTALL_DIR${NC}"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone https://github.com/joewinke/jat.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo ""
echo -e "${BOLD}╔───────────────────────────────────────────╗${NC}"
echo -e "${BOLD}│                                           │${NC}"
echo -e "${BOLD}│           __       ___   .___________.    │${NC}"
echo -e "${BOLD}│          |  |     /   \\  |           |    │${NC}"
echo -e "${BOLD}│          |  |    /  ^  \\ \`---|  |----\`    │${NC}"
echo -e "${BOLD}│    .--.  |  |   /  /_\\  \\    |  |         │${NC}"
echo -e "${BOLD}│    |  \`--'  |  /  _____  \\   |  |         │${NC}"
echo -e "${BOLD}│     \\______/  /__/     \\__\\  |__|         │${NC}"
echo -e "${BOLD}│                                           │${NC}"
echo -e "${BOLD}│         ${BLUE}◇ Supervise the Swarm ◇${NC}${BOLD}           │${NC}"
echo -e "${BOLD}│                                           │${NC}"
echo -e "${BOLD}╚───────────────────────────────────────────╝${NC}"
echo ""
echo "Complete AI-assisted development environment:"
echo ""
echo "  • Agent Mail (15 bash/SQLite coordination tools)"
echo "  • JAT Task CLI (dependency-aware task planning)"
echo "  • 48 bash tools (am-*, browser-*, db-*, media-*, etc.)"
echo "  • Multi-line statusline (agent, task, git, context)"
echo "  • Real-time hooks (auto-refresh statusline)"
echo "  • Optional tech stack tools (SvelteKit + Supabase, etc.)"
echo "  • Global ~/.claude/CLAUDE.md configuration"
echo "  • Per-repository setup (jt init, CLAUDE.md templates)"
echo ""
echo "This will save 32,000+ tokens vs MCP servers!"
echo ""
echo -e "${YELLOW}Press ENTER to continue or Ctrl+C to cancel${NC}"

# Wait for user acknowledgment (non-blocking in non-interactive mode)
if [ -t 0 ] || [ -e /dev/tty ]; then
    read </dev/tty 2>/dev/null || true
else
    echo -e "${BLUE}  (non-interactive mode - continuing automatically)${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 1/9: Installing Agent Mail (bash + SQLite)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/install-agent-mail.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 2/9: Setting Up JAT Task CLI${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# jt CLI is symlinked via symlink-tools.sh (Step 3)
# Just verify the binary exists
if [ -f "$INSTALL_DIR/cli/jat" ]; then
    echo -e "  ${GREEN}✓${NC} JAT CLI found (will be symlinked in next step)"
else
    echo -e "  ${YELLOW}⚠${NC} JAT CLI not found at $INSTALL_DIR/cli/jat"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 3/9: Symlinking Generic Tools${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/symlink-tools.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 4/9: Installing Node.js Dependencies${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if npm is available
if command -v npm &> /dev/null; then
    # Check Node.js version (need LTS: 20 or 22, not odd/current like 23/25)
    NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')
    if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -gt 22 ] 2>/dev/null; then
        echo -e "${YELLOW}  ⚠ Node.js v$(node -v | sed 's/v//') detected - this may cause build failures${NC}"
        echo -e "${YELLOW}  JAT requires Node.js 20 or 22 (LTS). Current/odd versions (23, 25)${NC}"
        echo -e "${YELLOW}  break native modules like better-sqlite3.${NC}"
        echo ""
        echo -e "  Fix with nvm: ${BOLD}nvm install 22 && nvm use 22${NC}"
        echo -e "  Or Homebrew:  ${BOLD}brew install node@22 && brew link --overwrite node@22${NC}"
        echo ""
    fi
    # Install root jat dependencies (better-sqlite3 for lib/tasks.js)
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

    # Install ingest daemon dependencies (better-sqlite3, rss-parser)
    if [ -f "$INSTALL_DIR/tools/ingest/package.json" ]; then
        echo "  → Installing ingest daemon dependencies..."
        (cd "$INSTALL_DIR/tools/ingest" && npm install --silent 2>/dev/null) && \
            echo -e "  ${GREEN}✓${NC} ingest daemon dependencies installed" || \
            echo -e "  ${YELLOW}⚠${NC} ingest npm install failed (run manually: cd tools/ingest && npm install)"
    fi

    # Install IDE dependencies (SvelteKit, etc.)
    if [ -f "$INSTALL_DIR/ide/package.json" ]; then
        echo "  → Installing IDE dependencies..."
        if (cd "$INSTALL_DIR/ide" && npm install --legacy-peer-deps --engine-strict=false 2>&1); then
            echo -e "  ${GREEN}✓${NC} IDE dependencies installed"
        else
            echo -e "  ${YELLOW}⚠${NC} IDE npm install failed (run manually: cd ide && npm install --legacy-peer-deps)"
            if [ "$(uname -s)" = "Darwin" ]; then
                echo -e "  ${YELLOW}  On macOS, you may need Xcode Command Line Tools:${NC}"
                echo -e "  ${YELLOW}    xcode-select --install${NC}"
            fi
        fi
    fi
else
    echo -e "${YELLOW}  ⚠ npm not found - skipping Node.js dependencies${NC}"
    echo "  Install Node.js/npm, then run manually:"
    echo "    cd $INSTALL_DIR && npm install"
    echo "    cd $INSTALL_DIR/tools/browser && npm install"
    echo "    cd $INSTALL_DIR/ide && npm install"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 5/9: Statusline & Hooks Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-statusline-and-hooks.sh" "$INSTALL_DIR"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 6/9: Tmux Mouse Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-tmux.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 7/9: Optional Tech Stack Tools${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Ask about optional tech stacks
SELECTED_STACKS=""
echo "Optional tech stack tools available:"
echo "  • SvelteKit + Supabase (11 tools: component-deps, route-list, error-log, etc.)"
echo ""

if command -v gum &> /dev/null && [ -t 0 ]; then
    SELECTED_STACKS=$(gum choose --no-limit \
        "SvelteKit + Supabase" \
        "Skip - No additional stacks")
else
    if prompt_yes_no "Install SvelteKit + Supabase tools? [y/N] " "n"; then
        SELECTED_STACKS="SvelteKit"
    fi
fi

if echo "$SELECTED_STACKS" | grep -q "SvelteKit"; then
    echo ""
    echo "Installing SvelteKit + Supabase stack..."
    bash "$INSTALL_DIR/stacks/sveltekit-supabase/install.sh"
else
    echo ""
    echo "Skipping stack installation"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 8/9: Voice-to-Text (Optional)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Ask about Voice-to-Text
INSTALL_WHISPER="no"
echo "Voice-to-Text enables speech input in the IDE."
echo "Requires: ~2GB disk, cmake, g++, ffmpeg"
echo ""
if command -v gum &> /dev/null && [ -t 0 ]; then
    if gum confirm "Install Voice-to-Text (whisper.cpp)?"; then
        INSTALL_WHISPER="yes"
    fi
else
    if prompt_yes_no "Install Voice-to-Text (whisper.cpp)? [y/N] " "n"; then
        INSTALL_WHISPER="yes"
    fi
fi

if [ "$INSTALL_WHISPER" = "yes" ]; then
    bash "$INSTALL_DIR/tools/scripts/install-whisper.sh"
else
    echo ""
    echo "  Skipping Voice-to-Text installation"
    echo "  Run later with: bash $INSTALL_DIR/tools/scripts/install-whisper.sh"
fi

# Install Pi skills if Pi is available
INSTALL_PI_SKILLS="no"
if command -v pi &> /dev/null; then
    echo ""
    echo "Pi coding agent detected ($(pi --version 2>/dev/null))."
    echo "JAT skills enable Pi to participate in multi-agent workflows."
    echo ""
    if command -v gum &> /dev/null && [ -t 0 ]; then
        if gum confirm "Install JAT skills for Pi?"; then
            INSTALL_PI_SKILLS="yes"
        fi
    else
        if prompt_yes_no "Install JAT skills for Pi? [Y/n] " "y"; then
            INSTALL_PI_SKILLS="yes"
        fi
    fi

    if [ "$INSTALL_PI_SKILLS" = "yes" ]; then
        bash "$INSTALL_DIR/tools/scripts/install-pi-skills.sh"
    else
        echo ""
        echo "  Skipping Pi skills installation"
        echo "  Run later with: bash $INSTALL_DIR/tools/scripts/install-pi-skills.sh"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 9/9: Setting Up Global Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash "$INSTALL_DIR/tools/scripts/setup-global-claude-md.sh"

echo ""
echo ""
echo -e "${GREEN}╔───────────────────────────────────────────╗${NC}"
echo -e "${GREEN}│                                           │${NC}"
echo -e "${GREEN}│      ${BOLD}✓ JAT Successfully Installed!${NC}${GREEN}        │${NC}"
echo -e "${GREEN}│                                           │${NC}"
echo -e "${GREEN}╚───────────────────────────────────────────╝${NC}"
echo ""
echo "What was installed:"
echo ""
echo "  ✓ Agent Mail (14 bash/SQLite tools: am-register, am-send, am-inbox, etc.)"
echo "  ✓ JAT Task CLI (jt command + 4 review tools)"
echo "  ✓ Browser Tools (12 CDP automation tools: browser-*.js)"
echo "  ✓ Database Tools (4 tools: db-query, db-schema, etc.)"
echo "  ✓ Signal Tools (2 tools: jat-signal, jat-signal-validate)"
if [ ! -z "$SELECTED_STACKS" ] && echo "$SELECTED_STACKS" | grep -q "SvelteKit"; then
    echo "  ✓ SvelteKit + Supabase Stack (11 additional tools)"
fi
if [ "$INSTALL_WHISPER" = "yes" ]; then
    echo "  ✓ Voice-to-Text (whisper.cpp + large-v3-turbo model)"
fi
if [ "$INSTALL_PI_SKILLS" = "yes" ]; then
    echo "  ✓ Pi Skills (jat-start, jat-complete, jat-verify + AGENTS.md)"
fi
echo "  ✓ Multi-line statusline (agent, task, git, context)"
echo "  ✓ Real-time hooks (auto-refresh on am-*/jt commands)"
echo "  ✓ Git pre-commit hook (agent registration check)"
echo "  ✓ Global ~/.claude/CLAUDE.md (multi-project instructions)"
echo "  ✓ Per-repo setup (jt init, CLAUDE.md templates)"
echo ""
# Detect shell config file
SHELL_NAME=$(basename "$SHELL")
if [[ "$SHELL_NAME" == "zsh" ]]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL_NAME" == "bash" ]]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    SHELL_CONFIG="$HOME/.bashrc"
fi

# Ensure ~/.local/bin is in PATH
if ! grep -q '\.local/bin' "$SHELL_CONFIG" 2>/dev/null; then
    echo "" >> "$SHELL_CONFIG"
    echo '# JAT tools' >> "$SHELL_CONFIG"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_CONFIG"
    echo -e "  ${GREEN}✓${NC} Added ~/.local/bin to PATH in $SHELL_CONFIG"
fi

echo ""
echo "The IDE will guide you through adding your first project."
echo ""
echo "Documentation: https://github.com/joewinke/jat"
echo ""
if prompt_yes_no "${BOLD}Launch JAT now? [Y/n]${NC} " "y"; then
    echo ""
    exec "$HOME/.local/bin/jat"
fi
echo ""
