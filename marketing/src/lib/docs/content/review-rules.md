# Review rules

Review rules control whether a completed task auto-proceeds or waits for a human to look at it. The system uses a type-by-priority matrix. You configure it once and every agent follows the same rules.

## How it works

When an agent finishes a task and runs `/squad:complete`, the system checks two things: the task type and its priority. Based on your review rules, it either auto-closes the task or flags it for human review.

The logic is simple. Each task type has a `maxAutoPriority` threshold. Priorities at or above that number auto-proceed. Priorities below it require review.

Lower priority numbers mean higher urgency. P0 is critical, P4 is the lowest.

## The default matrix

Out of the box, SQUAD ships with these defaults:

| Type | P0 | P1 | P2 | P3 | P4 |
|------|----|----|----|----|-----|
| bug | review | review | review | auto | auto |
| feature | review | review | review | auto | auto |
| task | review | review | auto | auto | auto |
| chore | review | auto | auto | auto | auto |
| epic | review | review | review | review | auto |

Epics are more conservative because they represent verification tasks. When all child tasks complete, the epic becomes ready and a human should check the overall result. Chores are more relaxed because they carry less risk.

## Configuring via Settings

Open the IDE and navigate to Settings > Autopilot. The review rules matrix appears as a clickable grid. Each cell toggles between two states:

- Green checkmark = auto-proceed
- Eye icon = requires human review

Click any cell to flip it. Changes save when you hit the Save button.

You can also add per-type notes. Click the notes column next to any type to add context like "Always review security-related bugs manually."

## Per-task overrides

Sometimes you want to override the matrix for a specific task. Two override values are available:

- `always_review` - This task always needs a human, regardless of type and priority
- `always_auto` - This task always auto-proceeds

Set overrides from the CLI:

```bash
st-set-review-override squad-abc always_review
st-set-review-override squad-xyz always_auto
```

Or configure them in the centralized `review-rules.json` file under the `overrides` array.

## Storage

Review rules live in `~/.config/squad/review-rules.json`:

```json
{
  "version": 1,
  "defaultAction": "review",
  "priorityThreshold": 3,
  "rules": [
    { "type": "bug", "maxAutoPriority": 3, "note": "P0-P2 bugs always need eyes" },
    { "type": "feature", "maxAutoPriority": 3 },
    { "type": "task", "maxAutoPriority": 2 },
    { "type": "chore", "maxAutoPriority": 1 },
    { "type": "epic", "maxAutoPriority": 4 }
  ],
  "overrides": []
}
```

The `maxAutoPriority` field means: tasks with priority >= this value auto-proceed. Set it to `-1` to require review for all priorities of that type.

## CLI tools for review rules

```bash
# Show all current rules
st-review-rules

# Set max auto-proceed priority for a type
st-review-rules --type bug --max-auto 1

# Require review for all features
st-review-rules --type feature --max-auto -1

# Check what would happen for a specific task
st-check-review squad-abc

# Check all active tasks in batch
st-check-review --batch
```

## How agents use review rules

During `/squad:complete`, the agent emits a completion signal with either `auto_proceed` or `review_required` based on the review rules. The IDE reads this signal and either auto-spawns the next task or shows the completion for human review.

The evaluation chain runs in this order:

1. Task-level override (always_review or always_auto)
2. Centralized override (from review-rules.json overrides array)
3. Type-specific rule (maxAutoPriority comparison)
4. Default action (fallback if no rule matches the type)

## See also

- [Workflow Commands](/docs/workflow-commands/) - How /squad:complete uses review rules
- [Automation Rules](/docs/automation/) - Pattern-based session automation
- [Agent Programs](/docs/agent-programs/) - Agent routing configuration
