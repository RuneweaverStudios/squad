#!/bin/bash
# SQUAD Demo Setup Script
# Creates isolated demo environment with sample projects and tasks

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

DEMO_DIR="/tmp/squad-demo"
SQUAD_DIR="$HOME/code/squad"
DEMO_TEMPLATES="$SQUAD_DIR/demo"

#------------------------------------------------------------------------------
# Utility Functions
#------------------------------------------------------------------------------

log_step() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

log_done() {
    echo -e "  ${GREEN}✓${NC} $1"
}

log_info() {
    echo -e "  ${DIM}→${NC} $1"
}

#------------------------------------------------------------------------------
# Create Demo Project Structure
#------------------------------------------------------------------------------

create_acme_saas() {
    local project_dir="$DEMO_DIR/acme-saas"
    log_info "Creating acme-saas project..."

    mkdir -p "$project_dir"/{src/{components,lib,routes},tests,.claude}

    # Initialize git
    (cd "$project_dir" && git init -q)

    # Create basic files
    cat > "$project_dir/package.json" << 'EOF'
{
  "name": "acme-saas",
  "version": "0.1.0",
  "description": "ACME SaaS Platform",
  "scripts": {
    "dev": "echo 'Dev server running on port 3001'",
    "build": "echo 'Building...'",
    "test": "echo 'Tests passing'"
  }
}
EOF

    cat > "$project_dir/README.md" << 'EOF'
# ACME SaaS Platform

A demo SaaS application for SQUAD demonstration.

## Features (To Build)
- User authentication (OAuth + email/password)
- Stripe billing integration
- Analytics dashboard
- Team management
EOF

    cat > "$project_dir/src/lib/auth.ts" << 'EOF'
// Authentication module - needs implementation
export interface User {
  id: string;
  email: string;
  name: string;
}

export async function signIn(email: string, password: string): Promise<User> {
  // TODO: Implement OAuth flow
  throw new Error('Not implemented');
}

export async function signOut(): Promise<void> {
  // TODO: Implement sign out
  throw new Error('Not implemented');
}
EOF

    cat > "$project_dir/src/components/IDE.tsx" << 'EOF'
// IDE component - needs analytics widgets
export function IDE() {
  return (
    <div>
      <h1>IDE</h1>
      {/* TODO: Add analytics widgets */}
      {/* TODO: Add recent activity feed */}
      {/* TODO: Add team overview */}
    </div>
  );
}
EOF

    cat > "$project_dir/CLAUDE.md" << 'EOF'
# ACME SaaS Platform

This is a demo SaaS application for showcasing SQUAD capabilities.

## Tech Stack
- Frontend: React + TypeScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Auth: OAuth 2.0 + session management
- Billing: Stripe

## Key Directories
- `src/components/` - React components
- `src/lib/` - Business logic and utilities
- `src/routes/` - API routes
- `tests/` - Test files

## Development Guidelines
- Use TypeScript for type safety
- Write tests for all new features
- Follow React best practices
EOF

    # Commit initial state
    (cd "$project_dir" && git add -A && git commit -q -m "Initial demo project setup")

    # Initialize SQUAD Tasks
    (cd "$project_dir" && st init -q 2>/dev/null || true)

    log_done "acme-saas created"
}

create_pixel_art() {
    local project_dir="$DEMO_DIR/pixel-art"
    log_info "Creating pixel-art project..."

    mkdir -p "$project_dir"/{src/{tools,canvas,export},assets,.claude}

    # Initialize git
    (cd "$project_dir" && git init -q)

    # Create basic files
    cat > "$project_dir/package.json" << 'EOF'
{
  "name": "pixel-art",
  "version": "0.1.0",
  "description": "Pixel Art Editor",
  "scripts": {
    "dev": "echo 'Dev server running on port 3002'",
    "build": "echo 'Building...'",
    "test": "echo 'Tests passing'"
  }
}
EOF

    cat > "$project_dir/README.md" << 'EOF'
# Pixel Art Editor

A creative pixel art drawing application.

## Features (To Build)
- Canvas with zoom/pan
- Brush, pencil, fill tools
- Layer support
- Export to PNG/GIF
- Share to gallery
EOF

    cat > "$project_dir/src/canvas/Canvas.ts" << 'EOF'
// Main canvas component
export class PixelCanvas {
  private width: number;
  private height: number;
  private pixels: number[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = [];
    // TODO: Initialize pixel grid
  }

  setPixel(x: number, y: number, color: number) {
    // TODO: Implement pixel setting
  }

  getPixel(x: number, y: number): number {
    // TODO: Implement pixel getting
    return 0;
  }
}
EOF

    cat > "$project_dir/src/tools/Brush.ts" << 'EOF'
// Brush tool - needs implementation
export interface BrushOptions {
  size: number;
  color: string;
  opacity: number;
}

export class BrushTool {
  private options: BrushOptions;

  constructor(options: BrushOptions) {
    this.options = options;
  }

  apply(x: number, y: number) {
    // TODO: Implement brush application
  }
}
EOF

    cat > "$project_dir/CLAUDE.md" << 'EOF'
# Pixel Art Editor

A creative pixel art application for showcasing SQUAD capabilities.

## Tech Stack
- Frontend: TypeScript + Canvas API
- State: Custom reactive store
- Export: PNG/GIF encoding

## Key Directories
- `src/canvas/` - Canvas rendering and pixel manipulation
- `src/tools/` - Drawing tools (brush, pencil, fill, etc.)
- `src/export/` - Export functionality (PNG, GIF)
- `assets/` - Icons and default palettes

## Development Guidelines
- Keep bundle size small
- Support keyboard shortcuts
- Maintain 60fps during drawing
EOF

    # Commit initial state
    (cd "$project_dir" && git add -A && git commit -q -m "Initial demo project setup")

    # Initialize SQUAD Tasks
    (cd "$project_dir" && st init -q 2>/dev/null || true)

    log_done "pixel-art created"
}

#------------------------------------------------------------------------------
# Create Demo Tasks
#------------------------------------------------------------------------------

create_acme_tasks() {
    local project_dir="$DEMO_DIR/acme-saas"
    log_info "Creating acme-saas tasks..."

    (cd "$project_dir"
        # Epic: User Authentication System
        st create "Epic: User authentication system" \
            --type epic \
            --priority 0 \
            --labels auth,security,core \
            --description "Complete authentication system with OAuth and email/password login. This epic covers all auth-related work." \
            2>/dev/null || true

        local epic_id=$(st list --json 2>/dev/null | jq -r '.[] | select(.title | contains("Epic: User")) | .id' | head -1)

        # Epic subtasks
        st create "Set up OAuth providers (Google, GitHub)" \
            --type task \
            --priority 0 \
            --labels auth,oauth \
            --description "Configure OAuth 2.0 providers for social login. Support Google and GitHub initially." \
            2>/dev/null || true
        local oauth_id=$(st list --json 2>/dev/null | jq -r '.[] | select(.title | contains("OAuth providers")) | .id' | head -1)

        st create "Build login/signup UI components" \
            --type task \
            --priority 1 \
            --labels auth,ui,frontend \
            --description "Create responsive login and signup forms with validation, error states, and loading indicators." \
            2>/dev/null || true
        local login_ui_id=$(st list --json 2>/dev/null | jq -r '.[] | select(.title | contains("login/signup UI")) | .id' | head -1)

        st create "Implement session management" \
            --type task \
            --priority 1 \
            --labels auth,backend,security \
            --description "Handle JWT tokens, refresh logic, and secure session storage. Include logout and session invalidation." \
            2>/dev/null || true
        local session_id=$(st list --json 2>/dev/null | jq -r '.[] | select(.title | contains("session management")) | .id' | head -1)

        # Set up epic dependencies (epic depends on subtasks)
        if [[ -n "$epic_id" && -n "$oauth_id" ]]; then
            st dep add "$epic_id" "$oauth_id" 2>/dev/null || true
        fi
        if [[ -n "$epic_id" && -n "$login_ui_id" ]]; then
            st dep add "$epic_id" "$login_ui_id" 2>/dev/null || true
        fi
        if [[ -n "$epic_id" && -n "$session_id" ]]; then
            st dep add "$epic_id" "$session_id" 2>/dev/null || true
        fi
        # Session depends on OAuth (OAuth must be done first)
        if [[ -n "$session_id" && -n "$oauth_id" ]]; then
            st dep add "$session_id" "$oauth_id" 2>/dev/null || true
        fi

        # Other standalone tasks
        st create "Add Stripe billing integration" \
            --type feature \
            --priority 1 \
            --labels billing,stripe,backend \
            --description "Integrate Stripe for subscription billing. Support monthly/yearly plans, usage-based pricing, and invoice management." \
            2>/dev/null || true

        st create "Build analytics dashboard widgets" \
            --type feature \
            --priority 2 \
            --labels analytics,dashboard,frontend \
            --description "Create dashboard widgets showing key metrics: active users, MRR, churn rate, feature usage." \
            2>/dev/null || true

        st create "Fix mobile responsive layout issues" \
            --type bug \
            --priority 1 \
            --labels ui,mobile,bug \
            --description "Navigation menu breaks on screens under 768px. Settings page has overflow issues on mobile." \
            2>/dev/null || true

        st create "Write API documentation" \
            --type chore \
            --priority 3 \
            --labels docs,api \
            --description "Document all REST API endpoints with examples, request/response schemas, and authentication requirements." \
            2>/dev/null || true
    )

    log_done "acme-saas tasks created (8 tasks, 1 epic)"
}

create_pixel_art_tasks() {
    local project_dir="$DEMO_DIR/pixel-art"
    log_info "Creating pixel-art tasks..."

    (cd "$project_dir"
        st create "Implement brush tool with size control" \
            --type feature \
            --priority 1 \
            --labels tools,canvas \
            --description "Create a brush tool that supports variable sizes (1-32px), opacity control, and smooth drawing." \
            2>/dev/null || true

        st create "Add layer support" \
            --type feature \
            --priority 2 \
            --labels layers,canvas,core \
            --description "Implement layer system with add/remove/reorder layers, opacity per layer, and merge functionality." \
            2>/dev/null || true

        st create "Export to PNG and GIF" \
            --type feature \
            --priority 1 \
            --labels export,core \
            --description "Allow exporting artwork to PNG (single frame) and animated GIF (from layers as frames)." \
            2>/dev/null || true

        st create "Build color palette picker" \
            --type feature \
            --priority 2 \
            --labels ui,tools \
            --description "Create color picker with HSL sliders, saved palettes, and eyedropper tool for picking colors from canvas." \
            2>/dev/null || true

        st create "Add keyboard shortcuts" \
            --type chore \
            --priority 3 \
            --labels ux,accessibility \
            --description "Add keyboard shortcuts for common actions: B=brush, E=eraser, Z=undo, Shift+Z=redo, 1-9=tool sizes." \
            2>/dev/null || true
    )

    log_done "pixel-art tasks created (5 tasks)"
}

#------------------------------------------------------------------------------
# Main Setup Functions
#------------------------------------------------------------------------------

setup_demo() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║              ${CYAN}🎬 SQUAD Demo Environment Setup${NC}${BOLD}                   ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${DIM}Demo directory:${NC} $DEMO_DIR"
    echo ""

    # Step 1: Create project directories
    log_step "Step 1/3: Creating demo projects"
    mkdir -p "$DEMO_DIR"
    create_acme_saas
    create_pixel_art

    # Step 2: Create demo tasks
    log_step "Step 2/3: Creating demo tasks"
    create_acme_tasks
    create_pixel_art_tasks

    # Step 3: Set up demo config
    log_step "Step 3/3: Configuring demo environment"

    # Backup current config if exists
    local backup_file="$HOME/.config/squad/projects.json.pre-demo"
    if [[ -f "$HOME/.config/squad/projects.json" ]] && [[ ! -f "$backup_file" ]]; then
        cp "$HOME/.config/squad/projects.json" "$backup_file"
        log_info "Backed up current config to projects.json.pre-demo"
    fi

    # Merge demo projects into config (don't replace, merge)
    local tmp_file=$(mktemp)
    if [[ -f "$HOME/.config/squad/projects.json" ]]; then
        # Merge demo projects with existing config
        jq -s '.[0] * {projects: (.[0].projects + .[1].projects)}' \
            "$HOME/.config/squad/projects.json" \
            "$DEMO_TEMPLATES/projects.json" > "$tmp_file"
        mv "$tmp_file" "$HOME/.config/squad/projects.json"
    else
        cp "$DEMO_TEMPLATES/projects.json" "$HOME/.config/squad/projects.json"
    fi
    log_done "Demo projects added to config"

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              ${BOLD}✓ Demo Environment Ready!${NC}${GREEN}                       ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Demo projects:"
    echo -e "  ${CYAN}acme-saas${NC}  - SaaS platform (8 tasks, 1 epic)"
    echo -e "  ${CYAN}pixel-art${NC}  - Pixel art editor (5 tasks)"
    echo ""
    echo "Next steps:"
    echo -e "  ${DIM}1.${NC} Launch IDE:  ${BOLD}squad demo${NC}"
    echo -e "  ${DIM}2.${NC} Start an agent:    ${BOLD}squad acme-saas${NC}"
    echo -e "  ${DIM}3.${NC} Epic swarm:        ${BOLD}squad acme-saas 3 --auto${NC}"
    echo ""
    echo -e "${DIM}Reset anytime with: squad demo reset${NC}"
    echo ""
}

reset_demo() {
    echo ""
    echo -e "${YELLOW}Resetting demo environment...${NC}"
    echo ""

    # Kill any running demo sessions
    for session in $(tmux list-sessions -F '#S' 2>/dev/null | grep -E '^squad-(acme|pixel)'); do
        tmux kill-session -t "$session" 2>/dev/null || true
        log_info "Killed session: $session"
    done

    # Remove demo directory
    if [[ -d "$DEMO_DIR" ]]; then
        rm -rf "$DEMO_DIR"
        log_done "Removed $DEMO_DIR"
    fi

    # Remove demo projects from config
    if [[ -f "$HOME/.config/squad/projects.json" ]]; then
        local tmp_file=$(mktemp)
        jq 'del(.projects["acme-saas"]) | del(.projects["pixel-art"])' \
            "$HOME/.config/squad/projects.json" > "$tmp_file"
        mv "$tmp_file" "$HOME/.config/squad/projects.json"
        log_done "Removed demo projects from config"
    fi

    # Clear demo-related signal files
    rm -f /tmp/squad-signal-*-acme-*.json 2>/dev/null
    rm -f /tmp/squad-signal-*-pixel-*.json 2>/dev/null
    rm -f /tmp/squad-timeline-squad-acme*.jsonl 2>/dev/null
    rm -f /tmp/squad-timeline-squad-pixel*.jsonl 2>/dev/null
    log_done "Cleared demo signal files"

    echo ""
    echo -e "${GREEN}✓ Demo environment reset${NC}"
    echo ""
    echo "Run 'squad demo init' to set up again"
    echo ""
}

#------------------------------------------------------------------------------
# Main
#------------------------------------------------------------------------------

case "${1:-init}" in
    init|setup)
        setup_demo
        ;;
    reset|clean)
        reset_demo
        ;;
    *)
        echo "Usage: $0 [init|reset]"
        echo ""
        echo "Commands:"
        echo "  init   - Set up demo environment (default)"
        echo "  reset  - Remove demo environment and clean up"
        exit 1
        ;;
esac
