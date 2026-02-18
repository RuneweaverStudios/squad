## Session Automation Rules System

**User-configurable pattern→action rules for automating session responses.**

The automation system monitors agent session output and automatically executes actions when patterns match. This enables hands-off recovery from errors, auto-continuation prompts, and notification triggers.

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATION FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Session Output → Pattern Matching → Action Execution → Activity Log        │
│                                                                             │
│  1. IDE polls tmux session output                                     │
│  2. automationEngine.processSessionOutput() checks all enabled rules        │
│  3. Matching rules trigger actions (with rate limiting)                     │
│  4. Actions executed: send keys, tmux commands, signals, notifications      │
│  5. Activity logged for audit trail                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture

**Core Components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| Types | `ide/src/lib/types/automation.ts` | TypeScript interfaces |
| Store | `ide/src/lib/stores/automationRules.svelte.ts` | State management, CRUD, persistence |
| Engine | `ide/src/lib/utils/automationEngine.ts` | Pattern matching, action execution |
| Config | `ide/src/lib/config/automationConfig.ts` | Default config, preset library |
| Route | `ide/src/routes/automation/+page.svelte` | UI page |

**UI Components:**

| Component | Purpose |
|-----------|---------|
| `RulesList.svelte` | List rules, drag-to-reorder, enable/disable, import/export |
| `RuleEditor.svelte` | Create/edit rule modal with full form validation |
| `PresetsPicker.svelte` | Browse and install preset rules |
| `PatternTester.svelte` | Test patterns against sample text |
| `ActivityLog.svelte` | View automation execution history |

### Data Model

**AutomationRule:**
```typescript
interface AutomationRule {
  id: string;                    // Unique identifier (nanoid)
  name: string;                  // Display name
  description?: string;          // Optional description
  enabled: boolean;              // Is rule active?
  category: RuleCategory;        // 'recovery' | 'prompt' | 'stall' | 'notification' | 'custom'
  patterns: AutomationPattern[]; // Patterns to match (AND logic)
  actions: AutomationAction[];   // Actions to execute on match
  cooldownSeconds: number;       // Min seconds between triggers
  maxTriggersPerHour?: number;   // Rate limit
  sessionStates?: SessionState[]; // Only trigger in these states
  priority: number;              // Execution order (lower = first)
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

**AutomationPattern:**
```typescript
interface AutomationPattern {
  id: string;
  mode: 'regex' | 'contains' | 'exact' | 'startsWith' | 'endsWith';
  value: string;                 // Pattern string (regex or literal)
  caseSensitive?: boolean;       // Default: false
  negate?: boolean;              // Invert match result
}
```

**AutomationAction:**
```typescript
interface AutomationAction {
  id: string;
  type: ActionType;              // 'send_text' | 'send_keys' | 'tmux_command' | 'signal' | 'notify_only'
  value: string;                 // Action payload
  delayMs?: number;              // Delay before execution
}
```

### Pattern Matching

**Pattern Modes:**

| Mode | Description | Example |
|------|-------------|---------|
| `regex` | Regular expression | `error.*timeout\|ECONNREFUSED` |
| `contains` | Substring match | `API rate limit` |
| `exact` | Exact string match | `Continue? [y/n]` |
| `startsWith` | Prefix match | `Error:` |
| `endsWith` | Suffix match | `failed.` |

**Pattern Options:**
- `caseSensitive`: Match case (default: false)
- `negate`: Invert result (match when pattern NOT found)

**Multiple Patterns:**
Rules can have multiple patterns. ALL patterns must match (AND logic) for the rule to trigger.

### Action Types

| Type | Description | Value Example |
|------|-------------|---------------|
| `send_text` | Send text + Enter to session | `y` (sends "y\n") |
| `send_keys` | Send raw tmux keys | `C-c` (Ctrl+C) |
| `tmux_command` | Run tmux command | `send-keys -t {session} q` |
| `signal` | Emit SQUAD signal | `working {"taskId":"{$1}"}` |
| `notify_only` | Log without action | `Detected stall` |

**Action Delay:**
Actions can have `delayMs` to wait before executing (useful for debouncing).

### Template Variables

All action payloads support template variable substitution. Variables are replaced with their runtime values before the action executes.

**Available Variables:**

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{session}` | Tmux session name | `squad-FairBay` |
| `{agent}` | Agent name (extracted from session) | `FairBay` |
| `{timestamp}` | ISO timestamp when rule triggered | `2025-12-17T15:30:00.000Z` |
| `{match}` | Full text matched by pattern | `Working on task squad-abc` |
| `{$0}` | Same as `{match}` (full match) | `Working on task squad-abc` |
| `{$1}`, `{$2}`, ... | Regex capture groups | `squad-abc` (if captured) |

**Example: Dynamic Signal with Captured Task ID**

Pattern (regex):
```
Working on task (squad-[a-z0-9]+)
```

Signal action:
```
working {"taskId":"{$1}","agentName":"{agent}"}
```

If the output contains "Working on task squad-xyz" and the session is "squad-FairBay", the signal emitted will be:
```
working {"taskId":"squad-xyz","agentName":"FairBay"}
```

**Capture Group Tips:**
- Use parentheses `()` in regex patterns to create capture groups
- `{$1}` is the first group, `{$2}` is the second, etc.
- Unmatched groups resolve to empty string
- Works with all action types, not just signals

### Rate Limiting

**Per-Rule Limits:**
- `cooldownSeconds`: Minimum time between triggers for same rule
- `maxTriggersPerHour`: Maximum triggers per hour (optional)

**Global Limits:**
- `config.globalCooldownSeconds`: Min time between ANY automation action
- `config.maxActionsPerMinute`: Max actions across all rules per minute

### Presets Library

Pre-configured rules in `automationConfig.ts`:

| Preset | Category | Pattern | Action |
|--------|----------|---------|--------|
| API Overloaded Recovery | recovery | `API is overloaded` | Wait, send Enter |
| Rate Limit Recovery | recovery | `rate limit\|429\|too many requests` | Wait 60s, retry |
| Network Error Recovery | recovery | `ECONNREFUSED\|ETIMEDOUT\|network` | Wait, retry |
| YOLO Mode Auto-Accept | recovery | `Do you wish to proceed?` | Send Enter |
| Auto-Continue Prompts | prompt | `Continue\?\|Press Enter\|proceed` | Send Enter |
| Auto-Retry on Failure | prompt | `Retry\?\|Try again\?` | Send `y` |
| Auto-Proceed Confirmation | prompt | `Do you want to proceed?...1. Yes` | Send Enter |
| Waiting for Input Detection | stall | `waiting for.*input\|⎿` | Notify |
| Task Completion Notification | notification | `Task completed\|squad:complete` | Notify |
| Error Detection Notification | notification | `Error:\|Exception:\|FATAL` | Notify |

### Store API

**CRUD Operations:**
```typescript
import {
  addRule,
  updateRule,
  deleteRule,
  getRules,
  getRule,
  reorderRules
} from '$lib/stores/automationRules.svelte';

// Create rule
const rule = addRule({
  name: 'My Rule',
  patterns: [{ mode: 'contains', value: 'error' }],
  actions: [{ type: 'notify_only', value: 'Error detected' }]
});

// Update rule
updateRule(rule.id, { enabled: false });

// Delete rule
deleteRule(rule.id);

// Get all rules
const rules = getRules();

// Reorder (drag-drop)
reorderRules(ruleId, newIndex);
```

**Preset Management:**
```typescript
import {
  installPreset,
  uninstallPreset,
  isPresetInstalled
} from '$lib/stores/automationRules.svelte';

// Install a preset
installPreset('api-overloaded-recovery');

// Check if installed
const installed = isPresetInstalled('api-overloaded-recovery');

// Uninstall
uninstallPreset('api-overloaded-recovery');
```

**Import/Export:**
```typescript
import { exportRules, importRules } from '$lib/stores/automationRules.svelte';

// Export to JSON string
const json = exportRules();
// Returns: { version: 1, rules: [...], config: {...}, exportedAt: "..." }

// Import from JSON (replace all)
importRules(json, false);

// Import from JSON (merge with existing)
importRules(json, true);
```

**Activity Log:**
```typescript
import {
  getActivityEvents,
  clearActivityEvents,
  addActivityEvent
} from '$lib/stores/automationRules.svelte';

// Get recent activity
const events = getActivityEvents();

// Clear history
clearActivityEvents();
```

### Engine API

**Process Session Output:**
```typescript
import { processSessionOutput } from '$lib/utils/automationEngine';

// Check output against all rules, execute matching actions
const results = await processSessionOutput(
  sessionName,    // e.g., 'squad-FairBay'
  outputText,     // Terminal output to check
  sessionState    // Current state: 'working' | 'idle' | etc.
);

// Returns array of triggered rules and actions taken
```

**Test Pattern:**
```typescript
import { testPattern } from '$lib/utils/automationEngine';

// Test a single pattern against text
const matches = testPattern(pattern, text);
// Returns: boolean
```

**Find Matching Rules:**
```typescript
import { findMatchingRules } from '$lib/utils/automationEngine';

// Find all rules that match (respecting cooldowns/limits)
const rules = findMatchingRules(outputText, sessionState);
```

### Creating Custom Rules

**Via UI:**
1. Navigate to `/automation`
2. Click "Add Rule" button
3. Fill in name, description, category
4. Add patterns (click "Add Pattern")
5. Add actions (click "Add Action")
6. Set cooldown and rate limits
7. Save

**Via Code:**
```typescript
import { addRule } from '$lib/stores/automationRules.svelte';

addRule({
  name: 'Custom Error Handler',
  description: 'Handles specific error condition',
  category: 'recovery',
  enabled: true,
  patterns: [
    { mode: 'regex', value: 'CustomError:\\s+(.+)', caseSensitive: false }
  ],
  actions: [
    { type: 'notify_only', value: 'Custom error detected' },
    { type: 'send_keys', value: 'C-c', delayMs: 1000 }
  ],
  cooldownSeconds: 60,
  maxTriggersPerHour: 10,
  sessionStates: ['working', 'needs-input'],
  priority: 50
});
```

### Editing Existing Rules

**Via UI:**
1. Navigate to `/automation`
2. Find the rule in the **Rules List** panel (left side, grouped by category)
3. Each rule row has action buttons on the right:
   - **Pencil icon** (Edit) - Opens the Rule Editor modal
   - **Copy icon** (Clone) - Creates a duplicate of the rule
   - **Trash icon** (Delete) - Removes the rule (with confirmation)
4. Click the **pencil icon** to open the Rule Editor
5. Modify any field (name, patterns, actions, cooldown, etc.)
6. Click "Save" to apply changes

**Key Fields to Check:**
- **Cooldown (seconds)** - Minimum time between triggers (e.g., 30 = once per 30 seconds)
- **Max triggers per hour** - Rate limit (0 = unlimited)
- **Enabled toggle** - Quick on/off without deleting the rule

**Via Code:**
```typescript
import { updateRule, getRules } from '$lib/stores/automationRules.svelte';

// Find and update a rule
const rules = getRules();
const myRule = rules.find(r => r.name === 'My Rule');
if (myRule) {
  updateRule(myRule.id, {
    cooldownSeconds: 10,  // Reduce cooldown from 30s to 10s
    enabled: true
  });
}
```

**Quick Actions (No Modal Required):**
- **Toggle enable/disable** - Click the toggle switch on any rule row
- **Drag to reorder** - Drag rules to change priority order
- **Clone for testing** - Create a copy to experiment without affecting original

### Adding New Presets

Edit `ide/src/lib/config/automationConfig.ts`:

```typescript
export const AUTOMATION_PRESETS: AutomationPreset[] = [
  // ... existing presets ...

  {
    id: 'my-new-preset',
    name: 'My New Preset',
    description: 'What this preset does',
    category: 'recovery',
    rule: {
      name: 'My New Preset',
      description: 'Detailed description',
      category: 'recovery',
      enabled: true,
      patterns: [
        { mode: 'contains', value: 'trigger text' }
      ],
      actions: [
        { type: 'send_text', value: 'response' }
      ],
      cooldownSeconds: 30,
      priority: 50
    }
  }
];
```

### Session State Filtering

Rules can be limited to trigger only in specific session states:

| State | When Active |
|-------|-------------|
| `starting` | Agent initializing |
| `working` | Agent actively coding |
| `needs-input` | Waiting for user response |
| `ready-for-review` | Agent asking to complete |
| `completing` | Running /squad:complete |
| `completed` | Task finished |
| `idle` | No active task |

**Example:** Only trigger recovery rules when agent is `working`:
```typescript
{
  sessionStates: ['working'],
  // ... rest of rule
}
```

### Integration Points

**Session Monitoring:**
The automation engine is called from the session polling loop in the IDE. When new output is detected, `processSessionOutput()` is invoked.

**Signals:**
Actions can emit SQUAD signals via the `signal` action type, which writes to `/tmp/squad-signal-*.json` for IDE state updates.

**Activity Logging:**
All rule triggers are logged to the activity store with:
- Timestamp
- Rule name and ID
- Session name
- Matched pattern
- Actions executed
- Success/failure status

### Files Reference

**Types:**
- `ide/src/lib/types/automation.ts` - All TypeScript interfaces

**Store:**
- `ide/src/lib/stores/automationRules.svelte.ts` - Svelte 5 store with CRUD, persistence

**Engine:**
- `ide/src/lib/utils/automationEngine.ts` - Pattern matching, action execution

**Config:**
- `ide/src/lib/config/automationConfig.ts` - Default config, preset definitions

**Components:**
- `ide/src/lib/components/automation/RulesList.svelte`
- `ide/src/lib/components/automation/RuleEditor.svelte`
- `ide/src/lib/components/automation/PresetsPicker.svelte`
- `ide/src/lib/components/automation/PatternTester.svelte`
- `ide/src/lib/components/automation/ActivityLog.svelte`

**Route:**
- `ide/src/routes/automation/+page.svelte` - Main UI page

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Rule not triggering | Pattern doesn't match | Test in PatternTester |
| Rule triggers too often | Cooldown too short | Increase cooldownSeconds |
| Rule never triggers twice | maxTriggersPerHour reached | Increase or remove limit |
| Actions not executing | Rule disabled or global automation off | Check enabled flags |
| Wrong session targeted | Session state filter | Check sessionStates array |
