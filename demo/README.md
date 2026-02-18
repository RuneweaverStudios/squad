# SQUAD Demo Environment

This directory contains everything needed to run an isolated SQUAD demo.

## Quick Start

```bash
# Initialize/reset the demo environment
squad demo init

# Launch the demo IDE
squad demo

# Reset to clean state (for video retakes)
squad demo reset
```

## What Gets Created

The demo creates a temporary environment at `/tmp/squad-demo/` with:

### Demo Projects

| Project | Description | Port | Tasks |
|---------|-------------|------|-------|
| **acme-saas** | A SaaS startup app | 3001 | Auth, billing, dashboard |
| **pixel-art** | Creative side project | 3002 | Editor, export, gallery |

### Pre-loaded Tasks

**acme-saas** (P0-P2 priority mix):
- Epic: User authentication system (with subtasks)
- Add Stripe billing integration
- Build analytics dashboard
- Fix mobile responsive bugs
- Write API documentation

**pixel-art** (P1-P3 priority mix):
- Implement brush tool
- Add layer support
- Export to PNG/GIF
- Share to gallery

### Demo Flow

1. **Launch demo**: `squad demo` opens IDE with demo projects
2. **Create task**: Use UI to add a task (shows AI suggestions)
3. **Spawn agent**: Click "New Session" or `squad acme-saas`
4. **Watch workflow**: Agent picks task, starts working, signals progress
5. **Epic swarm**: Launch multiple agents: `squad acme-saas 3 --auto`
6. **Complete task**: `/squad:complete` closes task, ends session

## Files

- `projects.json` - Demo project configurations
- `acme-saas/` - Demo project 1 structure
- `pixel-art/` - Demo project 2 structure
- `setup.sh` - Script to initialize demo environment

## Resetting

Each `squad demo reset` fully removes and recreates the demo environment.
This is designed for video takes where you need a clean slate.
