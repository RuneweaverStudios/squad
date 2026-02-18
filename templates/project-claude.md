# Project Documentation

## Overview

[Brief description of what this project does]

## Technology Stack

[List key technologies, frameworks, libraries]

## Project Structure

```
├── src/          # Source code
├── docs/         # Documentation
├── tests/        # Test files
└── ...
```

## Development Setup

```bash
# Installation
[Installation commands]

# Running locally
[Dev server commands]

# Testing
[Test commands]
```

## Key Patterns & Conventions

[Project-specific coding patterns, naming conventions, architecture decisions]

## Common Tasks

### Task 1
[Steps to accomplish common task]

### Task 2
[Steps to accomplish common task]

## Agent Tools Configuration

**Global instructions:** See `~/.claude/CLAUDE.md` for Agent Mail, SQUAD Tasks, and bash tools documentation.

**This project uses:**
- ✅ SQUAD task planning (`.squad/` directory)
- ✅ Agent Mail coordination (project key: `[absolute path to this repo]`)
- ✅ 28 generic bash tools available globally

**Quick start for AI assistants:**
```bash
# See tasks ready to work
st ready

# Register with Agent Mail
am-register --program claude-code --model sonnet-4.5

# Declare files when starting a task
st update squad-123 --status in_progress --assignee AgentName --files "src/**"
```

## Troubleshooting

[Common issues and solutions]

---

**Last Updated:** [Date]
**Maintained By:** [Your Name]
**Generated With:** Jomarchy Agent Tools Setup
