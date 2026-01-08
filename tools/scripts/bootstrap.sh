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
    echo -n "Choose [1-3] (default: 1): "
    read -r choice

    case "${choice:-1}" in
        1)
            echo ""
            echo -e "${BLUE}Updating JAT...${NC}"
            cd "$INSTALL_DIR"
            git pull --ff-only || {
                echo -e "${YELLOW}⚠ Fast-forward pull failed. You may have local changes.${NC}"
                echo "  Resolve manually: cd $INSTALL_DIR && git status"
                exit 1
            }
            echo -e "${GREEN}✓ Updated to latest version${NC}"
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
            echo "Invalid choice"
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
