# Contributing to Jomarchy Agent Tools

Thank you for your interest in contributing! This document provides guidelines for adding new tools, maintaining code quality, and submitting pull requests.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Adding New Tools](#adding-new-tools)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)

---

## Getting Started

### Prerequisites

- Linux or macOS
- Bash 4.0+
- `git`, `sqlite3`, `jq`, `curl`
- Node.js v18+ (for browser tools)
- Familiarity with bash scripting

### Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/joewinke/jat.git
cd jat

# 2. Run the installer locally
./install.sh

# 3. Initialize Beads in the repo
bd init

# 4. Register as an agent (for testing)
am-register --program dev --model test
```

---

## Adding New Tools

### Tool Types

Jomarchy Agent Tools supports two categories of tools:

1. **Generic Tools** (`tools/`) - Universal bash tools that work in any project
2. **Stack-Specific Tools** (`stacks/*/tools/`) - Tech-stack-specific tools (e.g., SvelteKit + Supabase)

### Creating a Generic Tool

**Location:** `tools/your-tool-name`

**Template:**

```bash
#!/bin/bash
#
# your-tool-name - Brief one-line description
#
# Usage: your-tool-name [OPTIONS] [ARGUMENTS]
#
# Examples:
#   your-tool-name --help
#   your-tool-name arg1 arg2

set -euo pipefail

# Help text
show_help() {
	cat <<EOF
Usage: your-tool-name [OPTIONS] [ARGUMENTS]

Description:
  Detailed description of what this tool does and why it's useful.

Options:
  -h, --help     Show this help message
  -v, --verbose  Enable verbose output
  --json         Output in JSON format

Examples:
  your-tool-name --help
  your-tool-name arg1 arg2
  your-tool-name --json | jq '.results[]'

Notes:
  - Important usage notes
  - Limitations or requirements
  - Related tools or workflows
EOF
}

# Parse arguments
VERBOSE=false
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
	case $1 in
		-h|--help)
			show_help
			exit 0
			;;
		-v|--verbose)
			VERBOSE=true
			shift
			;;
		--json)
			JSON_OUTPUT=true
			shift
			;;
		*)
			# Handle positional arguments
			break
			;;
	esac
done

# Main tool logic
main() {
	# Your tool implementation here
	echo "Tool logic goes here"

	# Example: JSON output
	if $JSON_OUTPUT; then
		echo '{"status": "success", "result": "data"}'
	else
		echo "✓ Operation completed"
	fi
}

main "$@"
```

**Guidelines:**

1. **File naming:** Use lowercase with hyphens (e.g., `my-tool`, not `myTool` or `my_tool`)
2. **Shebang:** Always start with `#!/bin/bash`
3. **Error handling:** Use `set -euo pipefail` for safety
4. **Help text:** Provide comprehensive `--help` output
5. **Examples:** Include 2-3 usage examples in help text
6. **Exit codes:**
   - `0` = success
   - `1` = general error
   - `2` = usage error (invalid arguments)
7. **JSON output:** Support `--json` flag when applicable
8. **Composability:** Design for piping with `jq`, `grep`, `xargs`

### Creating a Stack-Specific Tool

**Location:** `stacks/your-stack/tools/your-tool`

Same template as generic tools, but include stack-specific dependencies and assumptions in the help text.

### Agent Mail Tools

Agent Mail tools (`mail/am-*`) follow a specific pattern:

```bash
#!/bin/bash
# Source the shared library
source "$(dirname "$0")/am-lib.sh"

# Tool-specific logic using am-lib functions
# Example: require_agent_name, log_info, query_db
```

**Key functions from `am-lib.sh`:**

- `require_agent_name` - Validate agent registration
- `query_db` - Execute SQLite queries safely
- `log_info`, `log_error` - Consistent logging
- `validate_pattern` - Check file glob patterns

See `mail/am-lib.sh` for full API.

### Browser Tools

Browser tools (`tools/browser-*.js`) use Node.js and puppeteer-core:

```javascript
#!/usr/bin/env node

import puppeteer from "puppeteer-core";

// Tool implementation
const browserURL = "http://localhost:9222";
const browser = await puppeteer.connect({ browserURL, defaultViewport: null });

// ... tool logic ...

await browser.disconnect();
```

**Requirements:**

- Connect to existing Chrome instance (port 9222)
- Handle connection errors gracefully
- Disconnect properly to avoid leaks
- Support both headless and GUI modes

---

## Coding Standards

### Bash Scripts

1. **Style Guide:**
   - Indent with tabs (not spaces)
   - Use `snake_case` for variables
   - Use `UPPER_CASE` for constants
   - Quote all variables: `"$var"` not `$var`

2. **Error Handling:**
   ```bash
   # Good
   if ! command; then
       echo "Error: command failed" >&2
       exit 1
   fi

   # Bad
   command  # May fail silently
   ```

3. **Defensive Programming:**
   ```bash
   # Check required tools
   command -v jq >/dev/null || {
       echo "Error: jq is required" >&2
       exit 1
   }

   # Validate inputs
   if [[ -z "$AGENT_NAME" ]]; then
       echo "Error: AGENT_NAME is required" >&2
       exit 2
   fi
   ```

4. **Portable Code:**
   - Avoid GNU-specific extensions
   - Test on both Linux and macOS
   - Use POSIX-compliant constructs when possible

### JavaScript/Node.js

1. **ES Modules:** Use `import`/`export` (not `require`)
2. **Async/Await:** Prefer over callbacks
3. **Error Handling:** Always catch promises
4. **Linting:** Follow existing code style

### Documentation

1. **Help Text:** Every tool MUST have `--help`
2. **Examples:** Include 2-3 practical examples
3. **Comments:** Explain complex logic, not obvious code
4. **README Updates:** Update main README.md when adding tools

---

## Testing Guidelines

### Manual Testing

**Test Checklist for New Tools:**

- [ ] `--help` displays correctly
- [ ] Examples from help text work as written
- [ ] Error messages are clear and actionable
- [ ] Tool composes with pipes (`| jq`, `| grep`, etc.)
- [ ] Works on both Linux and macOS (if applicable)
- [ ] No hardcoded paths or assumptions
- [ ] Handles missing dependencies gracefully

### Integration Testing

**For Agent Mail tools:**

```bash
# Test workflow
am-register --program test --model test-model
am-reserve "test/**" --agent TestAgent --ttl 3600 --reason "testing"
am-reservations --agent TestAgent
am-release "test/**" --agent TestAgent
```

**For Browser tools:**

```bash
# Start browser first
browser-start.js

# Test tool
browser-nav.js https://example.com
browser-eval.js "document.title"
browser-screenshot.js
```

### Automated Tests

Automated test suite coming soon. For now, manual testing is required.

---

## Pull Request Process

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-new-tool
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Add/modify tools in `tools/` or `stacks/*/tools/`
- Update documentation (README.md, this file)
- Test thoroughly on Linux and macOS (if applicable)

### 3. Document Your Work

**Update README.md:**

```markdown
### New Tool Category (if applicable)

`your-tool` - Brief description

**Usage:**
\`\`\`bash
your-tool --help
your-tool arg1 arg2
\`\`\`
```

**Create/Update Test Results (if applicable):**

For browser tools, update `browser-tools/ARCH_LINUX_TEST_RESULTS.md` or equivalent.

### 4. Commit with Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add db-backup tool for PostgreSQL dumps"
git commit -m "fix: browser-start.js now detects Chromium on Arch Linux"
git commit -m "docs: update CONTRIBUTING.md with testing guidelines"
git commit -m "chore: update dependencies for browser tools"
```

**Types:**

- `feat:` - New feature (tool, command, capability)
- `fix:` - Bug fix
- `docs:` - Documentation only
- `chore:` - Maintenance (dependencies, scripts)
- `refactor:` - Code restructuring
- `test:` - Test additions/fixes
- `perf:` - Performance improvement

### 5. Push and Create PR

```bash
git push origin feature/my-new-tool
```

Then create a Pull Request on GitHub with:

**Title:** Same as commit message (e.g., "feat: add db-backup tool")

**Description:**

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Added `db-backup` tool to `tools/`
- Updated README.md with tool documentation
- Tested on Ubuntu 22.04 and Arch Linux

## Test Plan
- [ ] Tool `--help` works
- [ ] Examples from docs work correctly
- [ ] Tested with actual PostgreSQL database
- [ ] Composable with jq, grep, xargs

## Screenshots (if applicable)
[Screenshots of tool output]
```

### 6. Review Process

**Maintainers will check:**

- Code quality and adherence to standards
- Documentation completeness
- Testing coverage
- Platform compatibility
- Integration with existing tools

**You may be asked to:**

- Add tests
- Fix linting issues
- Update documentation
- Address review comments

---

## Project Structure

```
jat/
├── mail/                      # Agent Mail tools (am-*)
│   ├── am-lib.sh             # Shared library
│   ├── am-register           # Agent registration
│   ├── am-inbox              # Inbox management
│   └── ...                   # Other am-* tools
│
├── tools/                     # Generic bash tools
│   ├── am-* (symlinks)       # Symlinked from mail/
│   ├── browser-*.js          # Browser automation
│   ├── db-*                  # Database tools
│   └── ...                   # Other generic tools
│
├── browser-tools/             # Browser tools development
│   ├── browser-*.js          # Source files
│   ├── package.json          # Node.js dependencies
│   └── ARCH_LINUX_TEST_RESULTS.md
│
├── stacks/                    # Tech-stack-specific tools
│   └── sveltekit-supabase/
│       ├── tools/            # Stack-specific tools
│       ├── install.sh        # Stack installer
│       └── README.md         # Stack documentation
│
├── scripts/                   # Installation/setup scripts
│   ├── setup-global-claude-md.sh
│   ├── setup-repos.sh
│   └── symlink-tools.sh
│
├── .claude/commands/agent/    # Coordination commands
│   ├── register.md           # /register command
│   ├── start.md              # /start command
│   └── ...                   # Other commands
│
├── README.md                  # Main documentation
├── CONTRIBUTING.md            # This file
├── ARCHITECTURE.md            # Technical architecture
└── install.sh                 # Main installer
```

---

## Development Workflow

### Typical Feature Development

```bash
# 1. Start session
/register

# 2. Create Beads task
bd create "Add new tool: db-backup" \
  --type feature \
  --labels tools,database \
  --priority 1 \
  --description "Create PostgreSQL backup tool with compression and rotation"

# 3. Reserve files
am-reserve "tools/db-backup" --agent DevAgent --ttl 3600 --reason "bd-123"

# 4. Develop tool
vim tools/db-backup
chmod +x tools/db-backup

# 5. Test locally
./tools/db-backup --help
./tools/db-backup test-database

# 6. Update documentation
vim README.md

# 7. Commit
git add tools/db-backup README.md
git commit -m "feat: add db-backup tool for PostgreSQL dumps"

# 8. Release and complete
am-release "tools/db-backup" --agent DevAgent
bd close bd-123 --reason "Completed: db-backup tool implemented"

# 9. Push and create PR
git push origin feature/db-backup
```

### Testing Browser Tools

```bash
# Navigate to browser-tools directory
cd browser-tools/

# Install dependencies if needed
npm install

# Start browser for testing
./browser-start.js

# Test your tool
./browser-your-tool.js --test-args

# Document results
vim ARCH_LINUX_TEST_RESULTS.md
```

### Testing Agent Mail Integration

```bash
# Register test agents
am-register --program test1 --model dev
am-register --program test2 --model dev

# Test messaging
am-send "Test" "Hello from test1" --from test1 --to test2
am-inbox test2 --unread

# Test file reservations
am-reserve "src/**" --agent test1 --ttl 600 --exclusive --reason "testing"
am-reserve "src/**" --agent test2 --ttl 600 --exclusive --reason "testing"  # Should fail
am-reservations
am-release "src/**" --agent test1
```

---

## FAQ

### How do I test on macOS if I only have Linux?

Request macOS testing in your PR description. A maintainer will test on macOS before merging.

### Can I add dependencies (npm packages, Python libs)?

**For browser tools:** Yes, add to `browser-tools/package.json`

**For bash tools:** Avoid if possible. If absolutely necessary, document in README and make installation optional.

### What if my tool requires a specific tech stack?

Create it in `stacks/your-stack/tools/` instead of `tools/`. Document stack requirements clearly.

### How do I handle secrets/credentials?

**Never hardcode secrets.** Use:

1. Environment variables (`$DATABASE_URL`, `$API_KEY`)
2. Config files in user's home (`~/.config/your-tool/config`)
3. Interactive prompts for first-time setup

Document security considerations in tool's `--help`.

### My tool is complex - can I split it into multiple files?

Yes! Create a directory:

```
tools/
└── my-complex-tool/
    ├── my-complex-tool    # Main executable (symlinked to tools/)
    ├── lib.sh             # Shared library
    └── README.md          # Tool-specific docs
```

Ensure the main executable is in `tools/` (or create symlink).

---

## Getting Help

- **Questions:** Open a GitHub Discussion
- **Bugs:** Open a GitHub Issue
- **Feature Ideas:** Open a GitHub Issue with `enhancement` label
- **Security Issues:** Email maintainer (see README for contact)

---

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help newcomers learn and contribute

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License (same as the project).

---

**Thank you for contributing to Jomarchy Agent Tools!**

Your contributions help build better AI-assisted development workflows for everyone.
