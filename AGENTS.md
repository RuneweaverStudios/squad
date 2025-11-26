# JAT Agent Guidelines

## Build & Test Commands
```bash
npm test                              # Run all tests (lib/beads.js tests)
npm test test-beads.js               # Run single test file
bash test/run-all-tests.sh           # Run full test suite (Node + bash)
node test/test-beads.js              # Run specific test directly
cd dashboard && npm run dev          # Start dashboard dev server
cd dashboard && npm run test         # Run dashboard tests (vitest)
cd dashboard && npm run check        # TypeScript + Svelte type check
```

## Code Style

**Bash Scripts:**
- Use `set -euo pipefail` at top of all scripts
- Source shared libs: `source "$SCRIPT_DIR/am-lib.sh"`
- Prefer `#!/usr/bin/env bash` shebang
- Use `--help` flags for all CLI tools with heredoc documentation

**JavaScript/TypeScript:**
- ES modules: `import` not `require` (type: "module" in package.json)
- Use JSDoc for function documentation with `@param`, `@returns`
- Explicit error handling with try-catch, no silent failures
- Use `better-sqlite3` for database access (synchronous API)
- Node built-ins: `import { join } from 'path'` not default imports

**Svelte (Dashboard):**
- Svelte 5: Use runes (`$state`, `$derived`, `$effect`) not legacy stores in components
- Imports: Group external libs, then `$app`, then `$lib` components
- Props: Use `let { propName } = $props()` syntax
- TypeScript: Inline types preferred, `.d.ts` for shared types only

**Naming Conventions:**
- Tool scripts: `am-*` (Agent Mail), `bd-*` (Beads, installed separately)
- Constants: `UPPER_SNAKE_CASE`
- Functions: `camelCase` (JS), `snake_case` (bash)
- Files: `kebab-case.js` for tools, `PascalCase.svelte` for components

**Error Handling:**
- CLI tools: Exit code 1 on error, 0 on success
- Log errors to stderr: `console.error()` or `echo "Error" >&2`
- Validate required params before execution, show `--help` on invalid usage
