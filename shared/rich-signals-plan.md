## Rich Signals Implementation Plan

**Goal:** Transform signals from thin state changes into rich, structured payloads that tell a complete story and enable interactive dashboard UI.

### Vision

**Before (Thin Signals):**
```
working:jat-abc     → "Working on jat-abc"
review              → "Ready for review"
needs_input         → "Waiting for input"
```

**After (Rich Signals):**
```
working:{taskId, title, approach, expectedFiles, baseline...}
review:{summary, filesModified, keyDecisions, testStatus...}
needs_input:{question, context, options, impact...}
```

**Dashboard Evolution:**
- Current: Terminal monitor with state badges
- Future: Signal-driven conversation UI with interactive cards, action buttons, file links

---

### Phase 1: Define Rich Payload Schemas

#### 1.1 `working` Signal

Emitted when agent starts work on a task.

```typescript
interface WorkingSignal {
  type: "working";

  // Task context
  taskId: string;              // e.g., "jat-abc"
  taskTitle: string;           // "Add user authentication"
  taskDescription: string;     // Full description from Beads
  taskPriority: number;        // 0-4
  taskType: string;            // feature/bug/task/chore/epic

  // Work plan
  approach: string;            // "Will implement OAuth flow using Supabase"
  expectedFiles: string[];     // ["src/lib/auth/*", "src/routes/login/*"]
  estimatedScope: "small" | "medium" | "large";

  // Baseline (for rollback)
  baselineCommit: string;      // Git SHA where work starts
  baselineBranch: string;      // Current branch

  // Dependencies
  dependencies: string[];      // Task IDs this depends on
  blockers?: string[];         // Known issues/blockers
}
```

**Dashboard renders:**
- Task card with title, priority badge, type icon
- Approach summary in collapsible section
- Expected files as clickable links
- Baseline commit as rollback point
- Progress indicator

---

#### 1.2 `review` Signal

Emitted when agent finishes coding and awaits human review.

```typescript
interface ReviewSignal {
  type: "review";

  // Task reference
  taskId: string;
  taskTitle: string;

  // Work summary
  summary: string[];           // Bullet points of what was done
  approach: string;            // How it was implemented
  keyDecisions: Array<{        // Architectural choices made
    decision: string;
    rationale: string;
  }>;

  // Changes
  filesModified: Array<{
    path: string;
    changeType: "added" | "modified" | "deleted";
    linesAdded: number;
    linesRemoved: number;
    description?: string;      // What changed in this file
  }>;
  totalLinesAdded: number;
  totalLinesRemoved: number;

  // Quality
  testsStatus: "passing" | "failing" | "none" | "skipped";
  testsRun?: number;
  testsPassed?: number;
  buildStatus: "clean" | "warnings" | "errors";
  buildWarnings?: string[];

  // Review guidance
  reviewFocus: string[];       // "Check error handling in auth.ts"
  knownLimitations?: string[]; // "Doesn't handle edge case X"

  // Commits
  commits: Array<{
    sha: string;
    message: string;
  }>;
}
```

**Dashboard renders:**
- Summary card with bullet points
- File list with diff links (click to open diff view)
- Quality badges (tests passing ✓, build clean ✓)
- Key decisions in expandable section
- Review focus as highlighted checklist
- Action buttons: Approve, Request Changes, Ask Question

---

#### 1.3 `needs_input` Signal

Emitted when agent is blocked waiting for human input.

```typescript
interface NeedsInputSignal {
  type: "needs_input";

  // Task reference
  taskId: string;
  taskTitle: string;

  // Question
  question: string;            // The actual question
  questionType: "choice" | "text" | "approval" | "clarification";

  // Context
  context: string;             // Why this question arose
  relevantCode?: string;       // Code snippet if relevant
  relevantFiles?: string[];    // Files related to question

  // Options (for choice questions)
  options?: Array<{
    id: string;
    label: string;
    description: string;
    recommended?: boolean;
    tradeoffs?: string;
  }>;

  // Impact
  impact: string;              // What happens based on answer
  blocking: string[];          // What's blocked until answered

  // Timeout
  timeoutAction?: string;      // What agent will do if no response
  timeoutMinutes?: number;
}
```

**Dashboard renders:**
- Question card with context
- Options as clickable buttons (if choice)
- Text input (if text type)
- Relevant code in syntax-highlighted block
- File links
- Impact warning
- Quick response buttons

---

#### 1.4 `completing` Signal

Emitted during completion steps (commit, close, release, announce).

```typescript
interface CompletingSignal {
  type: "completing";

  taskId: string;
  taskTitle: string;

  // Progress
  currentStep: "verifying" | "committing" | "closing" | "releasing" | "announcing";
  stepsCompleted: string[];
  stepsRemaining: string[];
  progress: number;            // 0-100

  // Current step details
  stepDescription: string;     // "Committing changes with message..."
  stepStartedAt: string;       // ISO timestamp
}
```

**Dashboard renders:**
- Progress bar with step indicators
- Current step highlighted
- Animated spinner on active step

---

#### 1.5 `completed` Signal (Enhanced)

Already rich, but add session stats.

```typescript
interface CompletedSignal {
  type: "completed";

  // Existing fields
  taskId: string;
  agentName: string;
  summary: string[];
  quality: QualitySignals;
  humanActions?: HumanAction[];
  suggestedTasks: SuggestedTask[];  // Now required
  crossAgentIntel?: CrossAgentIntel;

  // NEW: Session stats
  sessionStats: {
    duration: number;          // Minutes worked
    tokensUsed: number;        // API tokens consumed
    filesModified: number;
    linesChanged: number;
    commitsCreated: number;
  };

  // NEW: Final state
  finalCommit: string;         // Git SHA of final state
  prLink?: string;             // If PR was created
}
```

---

#### 1.6 `idle` Signal (Enhanced)

Emitted when session has no active task.

```typescript
interface IdleSignal {
  type: "idle";

  // Session summary
  sessionSummary?: {
    tasksCompleted: string[];  // Task IDs completed this session
    totalDuration: number;     // Minutes
    tokensUsed: number;
    filesModified: number;
  };

  // Recommendations
  suggestedNextTask?: {
    taskId: string;
    title: string;
    reason: string;            // Why this task is recommended
  };

  // Status
  readyForWork: boolean;       // Can accept new task
  blockedReason?: string;      // If not ready, why
}
```

**Dashboard renders:**
- Session summary card (if tasks were completed)
- Suggested next task with "Start" button
- "Assign Task" dropdown

---

#### 1.7 `starting` Signal (Enhanced)

Emitted when session initializes.

```typescript
interface StartingSignal {
  type: "starting";

  agentName: string;
  project: string;
  sessionId: string;

  // Capabilities
  model: string;               // "sonnet-4.5"
  tools: string[];             // Available tools

  // Context
  gitBranch: string;
  gitStatus: "clean" | "dirty";
  uncommittedFiles?: string[];
}
```

---

#### 1.8 `compacting` Signal

Emitted when context is being summarized.

```typescript
interface CompactingSignal {
  type: "compacting";

  taskId?: string;

  reason: string;              // "Context limit approaching"
  contextSizeBefore: number;   // Tokens
  estimatedAfter: number;      // Expected size after
  preserving: string[];        // Key context being kept
}
```

---

### Phase 2: Update Signal Infrastructure

#### 2.1 Update `jat-signal` Command

Modify `signal/jat-signal` to:
- Require JSON payloads for all signal types (clean break, no backward compat)
- Validate payloads against schemas
- Provide clear error messages for missing/invalid JSON

```bash
# All signals require JSON payloads
jat-signal working '{
  "taskId": "jat-abc",
  "taskTitle": "Add authentication",
  "approach": "Implementing OAuth with Supabase",
  ...
}'
```

#### 2.2 Update Schema Validation

Extend `signal/jat-signal-validate` and `signal/jat-signal-schema.json` with:
- New signal type schemas
- Required vs optional field validation
- Type checking for nested objects

#### 2.3 Update PostToolUse Hook

Modify `.claude/hooks/post-bash-jat-signal.sh` to:
- Handle larger JSON payloads
- Preserve all fields when writing to `/tmp/`
- Add payload size limits (prevent abuse)

---

### Phase 3: Update Workflow Commands

#### 3.1 Update `/jat:start`

In `commands/jat/start.md`:
- After reading task details, emit rich `working` signal
- Include approach planning step before emitting signal
- Template for approach/expectedFiles

#### 3.2 Update `/jat:complete`

In `commands/jat/complete.md`:
- Emit `completing` signal with progress during steps
- Enhance `completed` signal with sessionStats
- Already updated for required suggestedTasks

#### 3.3 Create Signal Helper Templates

Add to workflow commands:
- JSON templates for each signal type
- Helper functions for building payloads
- Examples showing full rich signals

---

### Phase 4: Dashboard Signal Renderers

#### 4.1 Create Signal Card Components

New Svelte components:
- `WorkingSignalCard.svelte` - Task context, approach, expected files
- `ReviewSignalCard.svelte` - Summary, files, quality, actions
- `NeedsInputSignalCard.svelte` - Question, options, input
- `CompletingSignalCard.svelte` - Progress bar, steps
- `IdleSignalCard.svelte` - Session summary, next task

#### 4.2 Update SessionCard Integration

Modify `SessionCard.svelte` to:
- Detect signal type from SSE events
- Render appropriate signal card component
- Pass signal payload as props

#### 4.3 Add Interactive Actions

Each signal card gets contextual actions:
- `review` → Approve, Request Changes, Ask Question buttons
- `needs_input` → Option buttons, text input, submit
- `idle` → Assign Task dropdown, Start Suggested button
- `working` → Cancel, Pause buttons

#### 4.4 Add File Links

For signals with file references:
- Clickable links to open in editor (VS Code URL scheme)
- Diff view links (git diff integration)
- Line number deep links

---

### Phase 5: EventStack Timeline Enhancement

#### 5.1 Rich Event Rendering

Update `EventStack.svelte` to:
- Render each signal type with appropriate card
- Show full context on expand
- Maintain compact view for timeline

#### 5.2 Event Filtering

Add filters:
- By signal type (working, review, complete, etc.)
- By task
- By time range

#### 5.3 Event Actions

Add action buttons within timeline events:
- Rollback to this point
- View diff from this point
- Copy signal data

---

### Implementation Order

**Sprint 1: Foundation**
1. Define all signal schemas (TypeScript interfaces)
2. Update `jat-signal` command for rich payloads
3. Update schema validation
4. Update PostToolUse hook

**Sprint 2: Working & Review Signals**
5. Update `/jat:start` to emit rich `working` signal
6. Create `WorkingSignalCard.svelte`
7. Add `review` signal to end of coding (before /jat:complete)
8. Create `ReviewSignalCard.svelte`

**Sprint 3: Input & Progress Signals**
9. Update AskUserQuestion integration for rich `needs_input`
10. Create `NeedsInputSignalCard.svelte`
11. Add `completing` signals to `/jat:complete`
12. Create `CompletingSignalCard.svelte`

**Sprint 4: Polish & Actions**
13. Add interactive action buttons to all cards
14. Add file links with editor integration
15. Update EventStack for rich events
16. Add event filtering

**Sprint 5: Stats & Analytics**
17. Add sessionStats to `completed` signal
18. Enhance `idle` signal with recommendations
19. Create session summary views
20. Add analytics dashboard section

---

### Success Metrics

- **Signal completeness**: 100% of signals include structured payload
- **Dashboard interactivity**: Users can take actions directly from signal cards
- **Context clarity**: Users understand what's happening without reading terminal
- **Review efficiency**: Time from review signal to approval decreases

---

### Files to Create/Modify

**New Files:**
- `signal/jat-signal-schema-v2.json` - Rich signal schemas
- `dashboard/src/lib/components/signals/WorkingSignalCard.svelte`
- `dashboard/src/lib/components/signals/ReviewSignalCard.svelte`
- `dashboard/src/lib/components/signals/NeedsInputSignalCard.svelte`
- `dashboard/src/lib/components/signals/CompletingSignalCard.svelte`
- `dashboard/src/lib/components/signals/IdleSignalCard.svelte`
- `dashboard/src/lib/types/richSignals.ts` - TypeScript interfaces

**Modified Files:**
- `signal/jat-signal` - Accept rich payloads
- `signal/jat-signal-validate` - Validate rich payloads
- `.claude/hooks/post-bash-jat-signal.sh` - Handle larger payloads
- `commands/jat/start.md` - Emit rich working signal
- `commands/jat/complete.md` - Emit completing/completed signals
- `dashboard/src/lib/components/work/SessionCard.svelte` - Render signal cards
- `dashboard/src/lib/components/work/EventStack.svelte` - Rich event rendering
- `dashboard/src/lib/stores/sessionEvents.ts` - Handle rich signal events
- `dashboard/src/routes/api/sessions/events/+server.ts` - Parse rich signals
