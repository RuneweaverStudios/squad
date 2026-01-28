#!/bin/bash

# JAT Bootstrap Installer
# Usage: curl -sSL https://jat.dev/install | bash
#
# This script:
# 1. Clones JAT to ~/.local/share/jat (XDG standard)
# 2. Runs the full install.sh

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Helper function for safe user input
# Handles piped execution (curl | bash) by reading from /dev/tty
prompt_choice() {
    local prompt="$1"
    local default="$2"
    local varname="$3"

    echo -n "$prompt"

    if [ -t 0 ] || [ -e /dev/tty ]; then
        read -r response </dev/tty 2>/dev/null || response="$default"
    else
        echo ""
        echo -e "${YELLOW}  (non-interactive mode - using default: $default)${NC}"
        response="$default"
    fi

    eval "$varname=\"\${response:-\$default}\""
}

echo ""
echo -e "${BOLD}JAT — The World's First Agentic IDE${NC}"
echo ""

# Check for git
if ! command -v git &> /dev/null; then
    echo -e "${RED}ERROR: git is required but not installed${NC}"
    echo "Install git first, then re-run this installer"
    exit 1
fi

# Determine install location (XDG standard)
INSTALL_DIR="${JAT_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/jat}"

# Check for existing installation
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}Existing installation found at: $INSTALL_DIR${NC}"
    echo ""
    echo "Options:"
    echo "  1) Update existing installation (git pull)"
    echo "  2) Fresh install (removes existing)"
    echo "  3) Cancel"
    echo ""

    prompt_choice "Choose [1-3] (default: 1): " "1" "choice"

    case "$choice" in
        1)
            echo ""
            echo -e "${BLUE}Updating JAT...${NC}"
            cd "$INSTALL_DIR"

            # Check for local changes first
            if ! git diff-index --quiet HEAD -- 2>/dev/null; then
                echo -e "${YELLOW}⚠ Local changes detected. Stashing...${NC}"
                git stash push -m "jat-bootstrap-autostash" || true
                STASHED=1
            fi

            if git pull --ff-only; then
                echo -e "${GREEN}✓ Updated to latest version${NC}"

                # Restore stashed changes if any
                if [ "${STASHED:-0}" = "1" ]; then
                    echo -e "${BLUE}Restoring stashed changes...${NC}"
                    git stash pop || {
                        echo -e "${YELLOW}⚠ Could not restore stashed changes automatically.${NC}"
                        echo "  Your changes are saved in git stash. Run: git stash pop"
                    }
                fi
            else
                echo -e "${YELLOW}⚠ Fast-forward pull failed.${NC}"
                echo ""
                echo "This can happen when:"
                echo "  • You have unpushed local commits"
                echo "  • Remote history was rewritten"
                echo ""
                echo "To resolve manually:"
                echo "  cd $INSTALL_DIR"
                echo "  git status"
                echo "  git pull --rebase  # or: git reset --hard origin/master"
                exit 1
            fi
            ;;
        2)
            echo ""
            echo -e "${YELLOW}Removing existing installation...${NC}"
            rm -rf "$INSTALL_DIR"
            echo -e "${BLUE}Cloning JAT...${NC}"
            git clone https://github.com/joewinke/jat.git "$INSTALL_DIR"
            ;;
        3)
            echo "Cancelled"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice: $choice${NC}"
            echo "Please enter 1, 2, or 3"
            exit 1
            ;;
    esac
else
    # Fresh install
    echo -e "${BLUE}Installing JAT to: $INSTALL_DIR${NC}"
    echo ""
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone https://github.com/joewinke/jat.git "$INSTALL_DIR"
fi

# Run the main installer
echo ""
echo -e "${BLUE}Running installer...${NC}"
echo ""
cd "$INSTALL_DIR"
bash ./install.sh
