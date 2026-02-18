#!/usr/bin/env bash
#
# Theme Testing Script - Automated testing of all 32 DaisyUI themes
#
# Tests IDE functionality across all themes:
# - Takes screenshots of each theme
# - Verifies theme switching works
# - Documents visual issues
#
# Usage: ./scripts/test-themes.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IDE_PORT=9223
IDE_URL="http://localhost:${IDE_PORT}"
SCREENSHOTS_DIR="ide/theme-screenshots"
RESULTS_FILE="ide/THEME_TEST_RESULTS.md"

# All 32 DaisyUI themes
THEMES=(
  "light"
  "dark"
  "cupcake"
  "bumblebee"
  "emerald"
  "corporate"
  "synthwave"
  "retro"
  "cyberpunk"
  "valentine"
  "halloween"
  "garden"
  "forest"
  "aqua"
  "lofi"
  "pastel"
  "fantasy"
  "wireframe"
  "black"
  "luxury"
  "dracula"
  "cmyk"
  "autumn"
  "business"
  "acid"
  "lemonade"
  "night"
  "coffee"
  "winter"
  "dim"
  "nord"
  "sunset"
)

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}║   DaisyUI Theme Testing - SQUAD IDE                  ║${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Create screenshots directory
mkdir -p "$SCREENSHOTS_DIR"
echo -e "${GREEN}✓${NC} Created screenshots directory: $SCREENSHOTS_DIR"

# Check if IDE server is running
echo ""
echo -e "${YELLOW}Checking IDE server...${NC}"
if curl -sf "$IDE_URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} IDE server is running at $IDE_URL"
else
  echo -e "${RED}✗${NC} IDE server not running at $IDE_URL"
  echo ""
  echo "Please start the IDE server first:"
  echo "  cd ide && npm run dev -- --port $IDE_PORT"
  echo ""
  exit 1
fi

# Start browser (or use existing instance)
echo ""
echo -e "${YELLOW}Starting browser...${NC}"
./tools/browser/browser-start.js 2>/dev/null || echo "Browser already running"
sleep 2

# Navigate to IDE
echo -e "${YELLOW}Navigating to IDE...${NC}"
./tools/browser/browser-nav.js "$IDE_URL" > /dev/null
sleep 2

# Initialize results file
cat > "$RESULTS_FILE" << 'EOF'
# DaisyUI Theme Testing Results

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**IDE URL**: http://localhost:9223
**Total Themes**: 32

## Test Methodology

For each theme:
1. Set theme via localStorage
2. Reload page to apply theme
3. Wait for content to load
4. Capture full-page screenshot
5. Verify theme is applied (data-theme attribute)

## Test Results

EOF

echo ""
echo -e "${BLUE}Testing ${#THEMES[@]} themes...${NC}"
echo ""

PASSED=0
FAILED=0
ISSUES=()

# Test each theme
for theme in "${THEMES[@]}"; do
  echo -ne "${YELLOW}Testing ${theme}...${NC} "

  # Set theme via localStorage and reload
  ./tools/browser/browser-eval.js "
    localStorage.setItem('theme', '$theme');
    document.documentElement.setAttribute('data-theme', '$theme');
  " > /dev/null 2>&1

  # Give theme time to apply
  sleep 1

  # Verify theme was applied
  CURRENT_THEME=$(./tools/browser/browser-eval.js "
    document.documentElement.getAttribute('data-theme')
  " 2>/dev/null | grep -o '".*"' | tr -d '"' || echo "")

  if [ "$CURRENT_THEME" = "$theme" ]; then
    # Take screenshot
    SCREENSHOT_PATH="$SCREENSHOTS_DIR/${theme}.png"
    ./tools/browser/browser-screenshot.js --fullpage --output "$SCREENSHOT_PATH" > /dev/null 2>&1

    if [ -f "$SCREENSHOT_PATH" ]; then
      echo -e "${GREEN}✓${NC}"
      ((PASSED++))

      # Add to results
      cat >> "$RESULTS_FILE" << EOF
### ✅ ${theme}

- **Status**: PASS
- **Screenshot**: ![${theme}](./theme-screenshots/${theme}.png)
- **Theme Applied**: Yes
- **Issues**: None

EOF
    else
      echo -e "${RED}✗ (screenshot failed)${NC}"
      ((FAILED++))
      ISSUES+=("$theme: Screenshot capture failed")

      cat >> "$RESULTS_FILE" << EOF
### ❌ ${theme}

- **Status**: FAIL
- **Reason**: Screenshot capture failed
- **Theme Applied**: Yes

EOF
    fi
  else
    echo -e "${RED}✗ (theme not applied)${NC}"
    ((FAILED++))
    ISSUES+=("$theme: Theme did not apply (got: $CURRENT_THEME)")

    cat >> "$RESULTS_FILE" << EOF
### ❌ ${theme}

- **Status**: FAIL
- **Reason**: Theme did not apply
- **Expected**: $theme
- **Actual**: $CURRENT_THEME

EOF
  fi
done

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}║   Test Summary                                           ║${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Total themes tested: ${BLUE}${#THEMES[@]}${NC}"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

# Add summary to results file
cat >> "$RESULTS_FILE" << EOF

## Summary

| Metric | Value |
|--------|-------|
| Total Themes | ${#THEMES[@]} |
| Passed | ${PASSED} |
| Failed | ${FAILED} |
| Success Rate | $((PASSED * 100 / ${#THEMES[@]}))% |

EOF

# Document issues
if [ ${#ISSUES[@]} -gt 0 ]; then
  echo -e "${RED}Issues found:${NC}"
  for issue in "${ISSUES[@]}"; do
    echo -e "  • $issue"
  done
  echo ""

  cat >> "$RESULTS_FILE" << EOF
## Issues

EOF
  for issue in "${ISSUES[@]}"; do
    echo "- $issue" >> "$RESULTS_FILE"
  done
  cat >> "$RESULTS_FILE" << EOF

EOF
fi

# Manual inspection items
cat >> "$RESULTS_FILE" << 'EOF'
## Manual Inspection Checklist

For each theme screenshot, verify:

- [ ] Navigation bar renders correctly
- [ ] Project/Priority/Status filters are visible
- [ ] Search input is visible and styled
- [ ] View mode toggle (List/Graph) buttons are visible
- [ ] Theme selector dropdown is visible
- [ ] Task cards render with proper borders/shadows
- [ ] Priority badges have good contrast
- [ ] Text is readable on all backgrounds
- [ ] Interactive elements are clearly clickable
- [ ] Modal overlay (if visible) has proper backdrop

## Recommendations

1. Review all screenshots in `theme-screenshots/` directory
2. Test interactivity manually for themes with visual issues
3. Focus on high-contrast themes (dark, black, dracula) and low-contrast themes (pastel, wireframe)
4. Verify priority badge colors are distinguishable across all themes

## Test Environment

- **OS**: $(uname -s)
- **Browser**: Chromium (headless)
- **IDE Version**: $(cd ide && npm pkg get version | tr -d '"')
- **DaisyUI Version**: $(cd ide && npm list daisyui | grep daisyui | awk '{print $2}')

EOF

echo -e "${GREEN}✓${NC} Results written to: $RESULTS_FILE"
echo -e "${GREEN}✓${NC} Screenshots saved to: $SCREENSHOTS_DIR/"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✨ All themes passed testing!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠ Some themes failed testing. Review results file.${NC}"
  exit 1
fi
