#!/bin/bash

# JAT Voice-to-Text (Whisper.cpp) Installer
# Installs local speech-to-text for IDE voice input
# 100% private - no data leaves your machine

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

WHISPER_DIR="$HOME/.local/share/jat/whisper"
MODEL_NAME="ggml-large-v3-turbo-q5_1.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         Voice-to-Text (Whisper.cpp) Installation             ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "This will install:"
echo ""
echo "  • whisper.cpp (local speech-to-text engine)"
echo "  • Large-v3-turbo model (~624MB, best quality/speed balance)"
echo "  • ffmpeg (audio processing)"
echo ""
echo "Requirements:"
echo ""
echo "  • ~2GB disk space (whisper.cpp + model)"
echo "  • cmake, g++, make (build tools)"
echo "  • ffmpeg + libavformat-dev (audio processing)"
echo ""
echo -e "${YELLOW}This is OPTIONAL - skip if you don't need voice input${NC}"
echo ""
echo -e "Press ENTER to continue or Ctrl+C to skip"
read </dev/tty

# Check for required build tools
echo ""
echo -e "${BLUE}Checking dependencies...${NC}"

MISSING_DEPS=""

if ! command -v cmake &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS cmake"
fi

if ! command -v g++ &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS g++"
fi

if ! command -v make &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS make"
fi

if ! command -v ffmpeg &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS ffmpeg"
fi

if ! command -v git &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS git"
fi

# Check for ffmpeg development libraries
if ! pkg-config --exists libavformat 2>/dev/null; then
    MISSING_DEPS="$MISSING_DEPS ffmpeg-dev-libs"
fi

if [ ! -z "$MISSING_DEPS" ]; then
    echo ""
    echo -e "${YELLOW}Missing dependencies:${NC}$MISSING_DEPS"
    echo ""
    echo "Install them with:"
    echo ""

    # Detect package manager
    if command -v pacman &> /dev/null; then
        echo "  sudo pacman -S cmake gcc make ffmpeg git"
    elif command -v apt &> /dev/null; then
        echo "  sudo apt install cmake g++ make ffmpeg libavformat-dev libavcodec-dev libavutil-dev git"
    elif command -v dnf &> /dev/null; then
        echo "  sudo dnf install cmake gcc-c++ make ffmpeg ffmpeg-devel git"
    elif command -v brew &> /dev/null; then
        echo "  brew install cmake ffmpeg git"
    else
        echo "  Install: cmake, g++, make, ffmpeg, ffmpeg-dev, git"
    fi
    echo ""
    echo -e "${RED}Please install dependencies and run this script again.${NC}"
    exit 1
fi

echo -e "${GREEN}  ✓ All dependencies found${NC}"

# Create installation directory
echo ""
echo -e "${BLUE}Setting up whisper.cpp...${NC}"

mkdir -p "$HOME/.local/share/jat"

if [ -d "$WHISPER_DIR" ]; then
    echo "  Whisper directory exists, updating..."
    cd "$WHISPER_DIR"
    git pull --quiet || true
else
    echo "  Cloning whisper.cpp..."
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
    cd "$WHISPER_DIR"
fi

# Build whisper.cpp with ffmpeg support
echo ""
echo -e "${BLUE}Building whisper.cpp (this may take a few minutes)...${NC}"

mkdir -p build
cd build

cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_FFMPEG=ON \
    -DWHISPER_BUILD_EXAMPLES=ON \
    -DWHISPER_BUILD_TESTS=OFF \
    2>&1 | grep -v "^--" || true

make -j$(nproc) whisper-cli 2>&1 | tail -5

if [ ! -f "bin/whisper-cli" ]; then
    echo -e "${RED}Build failed! Check the output above for errors.${NC}"
    exit 1
fi

echo -e "${GREEN}  ✓ whisper-cli built successfully${NC}"

# Download model
echo ""
echo -e "${BLUE}Downloading whisper model (~624MB)...${NC}"

mkdir -p "$WHISPER_DIR/models"
cd "$WHISPER_DIR/models"

if [ -f "$MODEL_NAME" ]; then
    echo -e "${GREEN}  ✓ Model already exists${NC}"
else
    echo "  Downloading $MODEL_NAME..."
    if command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$MODEL_NAME" "$MODEL_URL"
    elif command -v wget &> /dev/null; then
        wget --progress=bar:force -O "$MODEL_NAME" "$MODEL_URL"
    else
        echo -e "${RED}Neither curl nor wget found. Please install one.${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Model downloaded${NC}"
fi

# Verify installation
echo ""
echo -e "${BLUE}Verifying installation...${NC}"

if "$WHISPER_DIR/build/bin/whisper-cli" --help &> /dev/null; then
    echo -e "${GREEN}  ✓ whisper-cli works${NC}"
else
    echo -e "${RED}  ✗ whisper-cli failed to run${NC}"
    exit 1
fi

if [ -f "$WHISPER_DIR/models/$MODEL_NAME" ]; then
    MODEL_SIZE=$(du -h "$WHISPER_DIR/models/$MODEL_NAME" | cut -f1)
    echo -e "${GREEN}  ✓ Model exists ($MODEL_SIZE)${NC}"
else
    echo -e "${RED}  ✗ Model not found${NC}"
    exit 1
fi

# Create symlink for IDE API
echo ""
echo -e "${BLUE}Creating configuration...${NC}"

# Update IDE transcribe API to use jat whisper path
# The API checks ~/.local/share/jat/whisper first, then falls back to chezwizper
echo -e "${GREEN}  ✓ Whisper configured at: $WHISPER_DIR${NC}"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✓ Voice-to-Text Successfully Installed!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Installation summary:"
echo ""
echo "  ✓ whisper.cpp: $WHISPER_DIR"
echo "  ✓ whisper-cli: $WHISPER_DIR/build/bin/whisper-cli"
echo "  ✓ Model: $WHISPER_DIR/models/$MODEL_NAME"
echo ""
echo "The IDE will automatically detect and use this installation."
echo "Voice input buttons will appear in TaskCreationDrawer and WorkCard."
echo ""
echo "To test manually:"
echo ""
echo "  # Record audio and transcribe"
echo "  ffmpeg -f pulse -i default -t 5 -ar 16000 -ac 1 test.wav"
echo "  $WHISPER_DIR/build/bin/whisper-cli -m $WHISPER_DIR/models/$MODEL_NAME -f test.wav"
echo ""
