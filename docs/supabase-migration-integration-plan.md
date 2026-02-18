# Supabase Migration Versioning Integration Plan

## Overview

This document proposes how to integrate Supabase migration versioning into the SQUAD IDE, building on the existing Git source control infrastructure. The goal is to provide a seamless experience for managing database migrations alongside Git, using the familiar patterns already established.

## Current State

### Git Source Control (/source)
The IDE already has a mature Git integration with:
- **Left Panel (GitPanel.svelte)**: Shows staged/unstaged files, branch info, ahead/behind counts
- **Right Panel (DiffViewer.svelte)**: Side-by-side diff viewer for selected files
- **Timeline**: Commit history with push/pull indicators
- **Actions**: Stage/unstage, commit, push, pull, fetch, branch switching

### Supabase CLI Parallels

| Git Command | Supabase Equivalent | What it does |
|-------------|---------------------|--------------|
| `git init` | `supabase init` | Initialize project |
| `git remote add` | `supabase link` | Connect to remote |
| `git add` | `supabase migration new name` | Create new migration |
| `git push` | `supabase db push` | Push migrations to remote |
| `git pull` | `supabase db pull` | Pull schema from remote |
| `git diff` | `supabase db diff` | Show schema differences |
| `git status` | `supabase migration list` | Show local vs remote state |

## Proposed Architecture

### UI Integration

**Option A: Toggle/Tab in /source page (Recommended)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ /source                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐                                                     │
│ │ ProjectSelector     │ [Git] [Supabase]  ← Toggle/Tabs                    │
│ └─────────────────────┘                                                     │
│                                                                             │
│ ┌─────────────────────┐  ┌─────────────────────────────────────────────┐   │
│ │ GitPanel / SupaPanel│  │ DiffViewer / MigrationViewer                │   │
│ │                     │  │                                             │   │
│ │ When Git:           │  │ When Git: Side-by-side file diff            │   │
│ │   - Staged files    │  │                                             │   │
│ │   - Unstaged files  │  │ When Supabase: Migration SQL preview        │   │
│ │   - Commit input    │  │ or schema diff                              │   │
│ │   - Timeline        │  │                                             │   │
│ │                     │  │                                             │   │
│ │ When Supabase:      │  │                                             │   │
│ │   - Pending changes │  │                                             │   │
│ │   - New migration   │  │                                             │   │
│ │   - Timeline        │  │                                             │   │
│ └─────────────────────┘  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Option B: Dedicated /migrations route**
- Pro: Clean separation, simpler components
- Con: More navigation, doesn't leverage existing infrastructure

**Recommendation: Option A** - Leverages existing UI patterns, provides unified source control experience.

### Detection Logic

```typescript
// In project config or auto-detected
interface ProjectSupabaseConfig {
  hasSupabase: boolean;          // Does supabase/ folder exist?
  isLinked: boolean;             // Has `supabase link` been run?
  projectRef?: string;           // Supabase project reference
  supabasePath: string;          // Usually "supabase/"
}

// Auto-detection on project load
async function detectSupabaseConfig(projectPath: string): Promise<ProjectSupabaseConfig> {
  const supabasePath = path.join(projectPath, 'supabase');
  const hasSupabase = await exists(supabasePath);

  if (!hasSupabase) {
    return { hasSupabase: false, isLinked: false, supabasePath };
  }

  // Check for .supabase/.gitignore or config.toml for linked status
  const configPath = path.join(supabasePath, 'config.toml');
  const isLinked = await exists(configPath); // Simplified check

  return { hasSupabase: true, isLinked, supabasePath };
}
```

### New Components

#### 1. SupabasePanel.svelte (parallel to GitPanel.svelte)

```svelte
<script lang="ts">
  interface Props {
    project: string;
    onMigrationClick?: (migration: Migration) => void;
  }

  interface Migration {
    version: string;       // e.g., "20241114184005"
    name: string;          // e.g., "remote_schema"
    filename: string;      // e.g., "20241114184005_remote_schema.sql"
    localOnly: boolean;    // Exists locally but not on remote
    remoteOnly: boolean;   // Exists on remote but not locally
    synced: boolean;       // Same on both
    timestamp: Date;
  }

  interface SchemaDiff {
    hasDiff: boolean;
    diffSql: string;       // Output from `supabase db diff`
  }
</script>

<!-- Similar structure to GitPanel:
  - Schema Diff section (like "Staged Changes")
  - Pending Migrations section (like "Changes")
  - Migration Timeline (like "Commit Timeline")
-->
```

#### 2. MigrationViewer.svelte (parallel to DiffViewer.svelte)

Shows either:
- **Schema diff output** - When there are uncommitted schema changes
- **Migration SQL content** - When a migration file is selected

#### 3. API Endpoints

```
GET  /api/supabase/status?project=X        → Migration status (local vs remote)
GET  /api/supabase/diff?project=X          → Schema diff output
POST /api/supabase/migration/new?project=X → Create new migration
POST /api/supabase/push?project=X          → Push migrations to remote
POST /api/supabase/pull?project=X          → Pull schema from remote
GET  /api/supabase/migration/[version]     → Get migration file content
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE INTEGRATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Page Load / Project Switch                                              │
│     └─► Check for supabase/ folder                                          │
│     └─► If exists, show Supabase tab                                        │
│                                                                             │
│  2. Supabase Tab Selected                                                   │
│     └─► Call `supabase migration list --linked -o json`                     │
│     └─► Call `supabase db diff --linked` (if schema differs)                │
│     └─► Populate SupabasePanel with data                                    │
│                                                                             │
│  3. User Creates Migration                                                  │
│     └─► Input: migration name (e.g., "add_user_table")                     │
│     └─► Execute: `supabase migration new add_user_table`                   │
│     └─► Refresh migration list                                              │
│     └─► Open new migration file in editor                                   │
│                                                                             │
│  4. User Pushes Migrations                                                  │
│     └─► Execute: `supabase db push --linked`                               │
│     └─► Show progress/output                                                │
│     └─► Refresh status to show pushed state                                 │
│                                                                             │
│  5. User Pulls Schema                                                       │
│     └─► Execute: `supabase db pull --linked`                               │
│     └─► Creates new migration file with remote schema changes               │
│     └─► Refresh migration list                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Detection & Basic Status
**Goal:** Show Supabase tab when supabase/ folder exists, display migration list

1. Add Supabase detection to project config
2. Create `/api/supabase/status` endpoint
3. Add tab toggle to /source page header
4. Create basic SupabasePanel showing migration list

**Deliverables:**
- `ide/src/routes/api/supabase/status/+server.ts`
- `ide/src/lib/components/files/SupabasePanel.svelte`
- Modified `ide/src/routes/source/+page.svelte`

### Phase 2: Schema Diff & Migration Creation
**Goal:** Show schema differences, allow creating new migrations

1. Create `/api/supabase/diff` endpoint
2. Create `/api/supabase/migration/new` endpoint
3. Add schema diff display to SupabasePanel
4. Add "New Migration" input/button
5. Create MigrationViewer component

**Deliverables:**
- `ide/src/routes/api/supabase/diff/+server.ts`
- `ide/src/routes/api/supabase/migration/new/+server.ts`
- `ide/src/lib/components/files/MigrationViewer.svelte`

### Phase 3: Push & Pull Operations
**Goal:** Full migration workflow - push to remote, pull from remote

1. Create `/api/supabase/push` endpoint
2. Create `/api/supabase/pull` endpoint
3. Add Push/Pull buttons to SupabasePanel
4. Show operation progress/output
5. Handle dry-run option for push

**Deliverables:**
- `ide/src/routes/api/supabase/push/+server.ts`
- `ide/src/routes/api/supabase/pull/+server.ts`

### Phase 4: Enhanced UX
**Goal:** Polish the experience, add helpful features

1. Show migration SQL in MigrationViewer
2. Add migration timeline visualization (similar to Git)
3. Add migration validation before push
4. Error handling and helpful messages
5. Link migrations to Git commits (optional)

## Technical Details

### Running Supabase CLI Commands

```typescript
// ide/src/lib/utils/supabase.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runSupabaseCommand(
  projectPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const command = `supabase ${args.join(' ')}`;
  const options = {
    cwd: projectPath,
    timeout: 60000, // 60 second timeout for network operations
    env: {
      ...process.env,
      // May need to pass SUPABASE_ACCESS_TOKEN for linked operations
    }
  };

  return execAsync(command, options);
}

export async function getMigrationList(projectPath: string): Promise<Migration[]> {
  const { stdout } = await runSupabaseCommand(projectPath, [
    'migration', 'list', '--linked', '-o', 'json'
  ]);

  return JSON.parse(stdout);
}

export async function getSchemaDiff(projectPath: string): Promise<string> {
  const { stdout } = await runSupabaseCommand(projectPath, [
    'db', 'diff', '--linked'
  ]);

  return stdout;
}
```

### Migration Status Mapping

```typescript
interface MigrationStatus {
  version: string;
  name: string;
  filename: string;
  local: boolean;     // Exists in supabase/migrations/
  remote: boolean;    // Exists in remote history table
  status: 'synced' | 'local-only' | 'remote-only' | 'drift';
}

// Parse from `supabase migration list` output:
// Local          | Remote         | Time (UTC)
// ----------------|----------------|---------------------
// 20241114184005 | 20241114184005 | 2024-11-14 18:40:05   ← synced
// 20250108       |                | 20250108               ← local-only (not pushed)
//                | 20250120       | 2025-01-20 ...         ← remote-only (need pull)
```

### UI State Management

```typescript
// ide/src/lib/stores/supabaseStatus.svelte.ts

interface SupabaseState {
  isLoading: boolean;
  hasSupabase: boolean;
  isLinked: boolean;
  migrations: MigrationStatus[];
  schemaDiff: string | null;
  hasPendingChanges: boolean;
  unpushedCount: number;
  error: string | null;
}

// Create reactive store similar to git status
let supabaseState = $state<SupabaseState>({
  isLoading: true,
  hasSupabase: false,
  isLinked: false,
  migrations: [],
  schemaDiff: null,
  hasPendingChanges: false,
  unpushedCount: 0,
  error: null
});
```

## Visual Design

### Tab Toggle
```
┌──────────────────────────────────────────────────────┐
│ ProjectSelector  │  [🔀 Git] [🗄️ Supabase]          │
└──────────────────────────────────────────────────────┘
```

### SupabasePanel Layout
```
┌────────────────────────────────────────────────────────┐
│ ▼ Schema Diff (2 changes)                [Generate]   │
├────────────────────────────────────────────────────────┤
│   • tables/users - modified                            │
│   • functions/get_user - added                         │
├────────────────────────────────────────────────────────┤
│ ▼ Pending Migrations (3)                 [Push ↑]     │
├────────────────────────────────────────────────────────┤
│   ○ 20250119_add_teams.sql          ← not pushed      │
│   ○ 20250118_add_profiles.sql       ← not pushed      │
│   ● 20250117_initial.sql            ✓ synced          │
├────────────────────────────────────────────────────────┤
│ ▶ Migration History                                    │
└────────────────────────────────────────────────────────┘
```

### Status Indicators
- ⬤ Green: Synced (local = remote)
- ○ Yellow/Amber: Local only (needs push)
- ◐ Blue: Remote only (needs pull)
- ⚠ Red: Drift/conflict

## Configuration

### No Project Config Required

Supabase support is auto-detected by checking for `supabase/` folder. No entries needed in `projects.json`.

### Detection Logic
```typescript
// Show Supabase tab if:
// 1. supabase/ folder exists
// 2. supabase/config.toml exists (initialized)

// Show "Link Project" prompt if:
// - Folder exists but .supabase/ doesn't (not linked)

// Full functionality if:
// - Folder exists AND .supabase/ exists (linked)
```

### Environment / Auth
```bash
# User must be logged in via Supabase CLI
supabase login

# This stores token in ~/.supabase/ which CLI uses automatically
# No env vars needed in IDE
```

## Design Decisions

1. **No Dry Run Step** - Users see migration SQL in MigrationViewer before pushing (same pattern as Git - see diff, then push). No extra confirmation needed.

2. **Linked Only** - Support `--linked` operations only (push to hosted Supabase). No local Docker support initially.

3. **Auto-Detect Only** - Detect `supabase/` folder automatically, no config required. Show Supabase tab if folder exists.

4. **Migration Editing** - Yes, treat migration files like any other code file in the editor.

5. **Auto-Refresh** - On tab focus, plus manual refresh button (not auto-polling).

6. **Schema Diff** - On-demand (button click), not automatic (can be slow).

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Supabase CLI not installed | Detect and show helpful error with install instructions |
| Project not linked | Show "Link Project" button with instructions |
| Slow CLI operations | Show loading states, consider caching |
| Auth token expiry | Detect 401 errors, prompt for re-login |
| Migration conflicts | Show clear diff, don't auto-resolve |

## Success Metrics

1. Users can see migration status without leaving IDE
2. Creating new migrations is as easy as Git commits
3. Push/pull operations feel familiar to Git users
4. Errors are clear and actionable
5. No data loss from accidental operations

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Detection & Status | 2-3 tasks | None |
| Phase 2: Diff & Creation | 3-4 tasks | Phase 1 |
| Phase 3: Push & Pull | 2-3 tasks | Phase 2 |
| Phase 4: Polish | 2-3 tasks | Phase 3 |

Total: ~10-13 tasks (can be parallelized where noted)

## References

- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [SQUAD IDE Git Integration](./ide/CLAUDE.md) - Existing GitPanel implementation
