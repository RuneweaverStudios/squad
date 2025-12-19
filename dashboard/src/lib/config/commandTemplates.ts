/**
 * Command Templates Configuration
 *
 * Starter templates for creating new slash commands.
 * Templates include YAML frontmatter, description section, and implementation patterns.
 *
 * ## Template Variables
 *
 * Templates support placeholder variables using the `{{variableName}}` syntax.
 * Variables are defined in the `variables` field and replaced during application.
 *
 * Example:
 * ```typescript
 * {
 *   content: '# {{commandTitle}}\n\n{{commandDescription}}',
 *   variables: [
 *     { name: 'commandTitle', label: 'Command Title', placeholder: 'My Command' },
 *     { name: 'commandDescription', label: 'Description', placeholder: 'What this command does', multiline: true }
 *   ]
 * }
 * ```
 *
 * @see dashboard/src/lib/components/config/CommandEditor.svelte
 * @see commands/jat/ for example implementations
 */

/**
 * Template variable definition
 */
export interface TemplateVariable {
	/** Variable name used in template (e.g., 'commandName' for {{commandName}}) */
	name: string;
	/** Human-readable label for the input field */
	label: string;
	/** Placeholder text shown in empty input */
	placeholder?: string;
	/** Default value */
	defaultValue?: string;
	/** Use textarea instead of input (for long text) */
	multiline?: boolean;
	/** Brief help text shown below input */
	hint?: string;
	/** Whether this variable is required */
	required?: boolean;
}

export interface CommandTemplate {
	/** Unique identifier */
	id: string;
	/** Display name */
	name: string;
	/** Brief description of the template */
	description: string;
	/** Icon emoji for visual distinction */
	icon: string;
	/** Template content with {{variable}} placeholders */
	content: string;
	/** Default frontmatter values */
	frontmatter: {
		description?: string;
		author?: string;
		version?: string;
		tags?: string;
	};
	/** When to use this template */
	useCase: string;
	/** Template variables that can be replaced during application */
	variables?: TemplateVariable[];
}

/**
 * Basic Template
 *
 * Minimal structure with frontmatter and basic sections.
 * Good for simple commands or getting started.
 */
const basicTemplate: CommandTemplate = {
	id: 'basic',
	name: 'Basic',
	description: 'Minimal structure with frontmatter and description',
	icon: '📄',
	useCase: 'Simple commands, quick utilities, documentation-style commands',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: ''
	},
	variables: [
		{
			name: 'commandTitle',
			label: 'Command Title',
			placeholder: 'My Command',
			required: true,
			hint: 'The heading for your command documentation'
		},
		{
			name: 'commandDescription',
			label: 'Brief Description',
			placeholder: 'What this command does',
			hint: 'A one-line summary of the command purpose'
		},
		{
			name: 'firstAction',
			label: 'First Action',
			placeholder: 'First action',
			defaultValue: 'First action'
		},
		{
			name: 'secondAction',
			label: 'Second Action',
			placeholder: 'Second action',
			defaultValue: 'Second action'
		},
		{
			name: 'thirdAction',
			label: 'Third Action',
			placeholder: 'Third action',
			defaultValue: 'Third action'
		}
	],
	content: `---
description:
author:
version: 1.0.0
tags:
---

# {{commandTitle}}

{{commandDescription}}

## Usage

\`\`\`
/namespace:command [arguments]
\`\`\`

## What This Command Does

1. {{firstAction}}
2. {{secondAction}}
3. {{thirdAction}}

## Examples

\`\`\`bash
# Basic usage
/namespace:command

# With arguments
/namespace:command arg1 arg2
\`\`\`

## Notes

- Important consideration 1
- Important consideration 2
`
};

/**
 * Workflow Template
 *
 * Step-by-step implementation pattern like /jat:start.
 * Includes implementation sections with bash code blocks.
 */
const workflowTemplate: CommandTemplate = {
	id: 'workflow',
	name: 'Workflow',
	description: 'Step-by-step pattern with implementation sections',
	icon: '⚡',
	useCase: 'Multi-step processes, agent workflows, complex operations',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'workflow'
	},
	content: `---
description:
author:
version: 1.0.0
tags: workflow
argument-hint: [optional arguments]
---

# /namespace:command - Command Title

Brief one-line description of what this command does.

## Usage

\`\`\`
/namespace:command                    # Default behavior
/namespace:command arg1               # With argument
/namespace:command arg1 arg2          # Full usage
\`\`\`

---

## What This Command Does

1. **Step 1** - Description of first action
2. **Step 2** - Description of second action
3. **Step 3** - Description of third action

---

## Implementation Steps

### STEP 1: Parse Parameters

\`\`\`bash
PARAM="$1"   # First argument
PARAM2="$2"  # Second argument

# Validate inputs
if [[ -z "$PARAM" ]]; then
  echo "Usage: /namespace:command <required-arg>"
  exit 1
fi
\`\`\`

---

### STEP 2: Main Operation

\`\`\`bash
# Perform the main operation
echo "Processing: $PARAM"

# Add your implementation here
\`\`\`

---

### STEP 3: Output Results

\`\`\`bash
# Display results to user
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Operation Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Result: $RESULT"
echo ""
\`\`\`

---

## Error Handling

**Error condition 1:**
\`\`\`
Error: Description of error
Fix: How to resolve it
\`\`\`

**Error condition 2:**
\`\`\`
Error: Another error type
Fix: Resolution steps
\`\`\`

---

## Quick Reference

\`\`\`bash
# Common usage patterns
/namespace:command arg1
/namespace:command arg1 arg2 --flag
\`\`\`
`
};

/**
 * Tool Template
 *
 * Bash tool wrapper with input/output/state documentation.
 * Following Mario Zechner's "prompts are code" pattern.
 */
const toolTemplate: CommandTemplate = {
	id: 'tool',
	name: 'Tool',
	description: 'Bash tool wrapper with I/O documentation',
	icon: '🔧',
	useCase: 'CLI tool wrappers, database operations, system utilities',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'tool, utility'
	},
	content: `---
description:
author:
version: 1.0.0
tags: tool, utility
---

# tool-name

Brief description of what this tool does.

## Synopsis

\`\`\`bash
tool-name [OPTIONS] <required-arg>
tool-name --help
\`\`\`

## Description

**Input:**
- Required: \`<required-arg>\` - Description of required input
- Optional: \`--flag\` - Description of optional flag

**Output:**
- On success: Description of output (JSON, text, etc.)
- On error: Error message to stderr, exit code 1

**State:**
- Read-only / Read-write
- What it modifies (files, database, etc.)

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| \`--help\` | \`-h\` | Show help message | - |
| \`--verbose\` | \`-v\` | Enable verbose output | false |
| \`--output\` | \`-o\` | Output file path | stdout |
| \`--format\` | \`-f\` | Output format (json, text) | json |

## Examples

**Basic usage:**
\`\`\`bash
tool-name input-value
\`\`\`

**With options:**
\`\`\`bash
tool-name --verbose --format json input-value
\`\`\`

**Pipeline usage:**
\`\`\`bash
other-tool | tool-name --stdin | jq '.result'
\`\`\`

## Implementation

\`\`\`bash
#!/bin/bash
set -euo pipefail

# Parse arguments
VERBOSE=false
FORMAT="json"
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      echo "Usage: tool-name [OPTIONS] <input>"
      exit 0
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -f|--format)
      FORMAT="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT="$2"
      shift 2
      ;;
    *)
      INPUT="$1"
      shift
      ;;
  esac
done

# Validate input
if [[ -z "\${INPUT:-}" ]]; then
  echo "Error: Input required" >&2
  exit 1
fi

# Main logic
if [[ "$VERBOSE" == "true" ]]; then
  echo "Processing: $INPUT" >&2
fi

# Output result
RESULT="{\\"status\\": \\"success\\", \\"input\\": \\"$INPUT\\"}"

if [[ -n "$OUTPUT" ]]; then
  echo "$RESULT" > "$OUTPUT"
else
  echo "$RESULT"
fi
\`\`\`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |

## Related Tools

- \`related-tool-1\` - Description
- \`related-tool-2\` - Description

## See Also

- Documentation link
- Related concept
`
};

/**
 * Agent Command Template
 *
 * Template for agent coordination commands (like /jat:start, /jat:complete).
 * Includes signal emissions, Agent Mail integration, and Beads coordination.
 */
const agentTemplate: CommandTemplate = {
	id: 'agent',
	name: 'Agent',
	description: 'Agent coordination with signals, mail, and Beads',
	icon: '🤖',
	useCase: 'Agent workflow commands, coordination, task management',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'agent, workflow, coordination'
	},
	content: `---
description:
author:
version: 1.0.0
tags: agent, workflow, coordination
argument-hint: [task-id]
---

# /namespace:command - Agent Command Title

**What this command does in the agent workflow.**

## Usage

\`\`\`
/namespace:command                    # Default behavior
/namespace:command task-id            # With specific task
\`\`\`

---

## What This Command Does

1. **Check Agent Mail** - Read messages before taking action
2. **Validate State** - Ensure preconditions are met
3. **Perform Action** - Main operation
4. **Emit Signal** - Update dashboard state
5. **Coordinate** - Update Beads, reservations, send messages

---

## Implementation Steps

### STEP 1: Check Agent Mail

**ALWAYS check mail before starting any coordination action.**

\`\`\`bash
am-inbox "$AGENT_NAME" --unread
\`\`\`

- Read each message
- Reply if needed (\`am-reply\`)
- Acknowledge after reading: \`am-ack {msg_id} --agent "$AGENT_NAME"\`

---

### STEP 2: Validate Preconditions

\`\`\`bash
# Check if we have an active agent
AGENT_FILE=".claude/sessions/agent-\${SESSION_ID}.txt"
if [[ ! -f "$AGENT_FILE" ]]; then
  echo "Error: No agent registered. Run /jat:start first."
  exit 1
fi

AGENT_NAME=$(cat "$AGENT_FILE")
\`\`\`

---

### STEP 3: Perform Main Action

\`\`\`bash
# Your main implementation here
\`\`\`

---

### STEP 4: Emit Signal

**Update dashboard state via signal system.**

\`\`\`bash
jat-signal working '{"taskId":"task-id","taskTitle":"Task title"}'
\`\`\`

Available signals:
- \`starting\` - Agent initializing
- \`working\` - Actively working
- \`needs_input\` - Waiting for user
- \`review\` - Ready for review
- \`completing\` - Running completion
- \`completed\` - Task done
- \`idle\` - No active task

---

### STEP 5: Coordinate

\`\`\`bash
# Update Beads
bd update task-id --status in_progress --assignee "$AGENT_NAME"

# Reserve files
am-reserve "src/**/*.ts" --agent "$AGENT_NAME" --ttl 3600 --reason "task-id"

# Announce
am-send "[task-id] Starting: Task Title" \\
  "Brief message" \\
  --from "$AGENT_NAME" --to @active --thread "task-id"
\`\`\`

---

## Output Format

\`\`\`
╔════════════════════════════════════════════════════════╗
║               📋 COMMAND OUTPUT                        ║
╚════════════════════════════════════════════════════════╝

✅ Agent: {AGENT_NAME}
📋 Task: {TASK_TITLE}

┌─ DETAILS ───────────────────────────────────────────────┐
│  Key information here                                   │
└─────────────────────────────────────────────────────────┘
\`\`\`

---

## Error Handling

**No agent registered:**
\`\`\`
Error: No agent registered. Run /jat:start first.
\`\`\`

**Task not found:**
\`\`\`
Error: Task 'task-id' not found in Beads.
\`\`\`

---

## Related Commands

| Command | Purpose |
|---------|---------|
| \`/jat:start\` | Begin working |
| \`/jat:complete\` | Finish task |
| \`/jat:status\` | Check current state |
`
};

/**
 * All available command templates.
 */
export const COMMAND_TEMPLATES: CommandTemplate[] = [
	basicTemplate,
	workflowTemplate,
	toolTemplate,
	agentTemplate
];

/**
 * Get a template by ID.
 */
export function getTemplate(id: string): CommandTemplate | undefined {
	return COMMAND_TEMPLATES.find((t) => t.id === id);
}

/**
 * Extract variable names from template content.
 *
 * Finds all {{variableName}} patterns and returns unique variable names.
 * This is useful for discovering variables in templates that don't have
 * an explicit variables definition.
 *
 * @param content Template content to scan
 * @returns Array of unique variable names found
 */
export function extractVariablesFromContent(content: string): string[] {
	const regex = /\{\{([a-zA-Z][a-zA-Z0-9_-]*)\}\}/g;
	const variables = new Set<string>();
	let match;

	while ((match = regex.exec(content)) !== null) {
		variables.add(match[1]);
	}

	return Array.from(variables);
}

/**
 * Get all variables for a template.
 *
 * If the template has explicit variable definitions, returns those.
 * Otherwise, extracts variables from content and creates basic definitions.
 *
 * @param template The command template
 * @returns Array of template variable definitions
 */
export function getTemplateVariables(template: CommandTemplate): TemplateVariable[] {
	// If explicit variables defined, use those
	if (template.variables && template.variables.length > 0) {
		return template.variables;
	}

	// Otherwise, extract from content and create basic definitions
	const extractedNames = extractVariablesFromContent(template.content);
	return extractedNames.map((name) => ({
		name,
		label: formatVariableLabel(name),
		placeholder: '',
		required: false
	}));
}

/**
 * Format a variable name as a human-readable label.
 *
 * Examples:
 * - 'commandName' -> 'Command Name'
 * - 'my-variable' -> 'My Variable'
 * - 'API_KEY' -> 'API KEY'
 *
 * @param name Variable name
 * @returns Human-readable label
 */
export function formatVariableLabel(name: string): string {
	return name
		// Insert space before uppercase letters (camelCase)
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		// Replace hyphens and underscores with spaces
		.replace(/[-_]/g, ' ')
		// Capitalize first letter of each word
		.replace(/\b\w/g, (c) => c.toUpperCase())
		// Trim and collapse multiple spaces
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Substitute variables in template content.
 *
 * Replaces all {{variableName}} patterns with provided values.
 * Variables without provided values are left unchanged.
 *
 * @param content Template content with {{variable}} placeholders
 * @param values Map of variable names to their values
 * @returns Content with variables replaced
 */
export function substituteVariables(
	content: string,
	values: Record<string, string>
): string {
	return content.replace(/\{\{([a-zA-Z][a-zA-Z0-9_-]*)\}\}/g, (match, name) => {
		return name in values ? values[name] : match;
	});
}

/**
 * Validate that all required variables have values.
 *
 * @param template The command template
 * @param values Provided variable values
 * @returns Object with valid flag and array of missing variable names
 */
export function validateVariables(
	template: CommandTemplate,
	values: Record<string, string>
): { valid: boolean; missing: string[] } {
	const variables = getTemplateVariables(template);
	const missing: string[] = [];

	for (const variable of variables) {
		if (variable.required && !values[variable.name]?.trim()) {
			missing.push(variable.name);
		}
	}

	return {
		valid: missing.length === 0,
		missing
	};
}

/**
 * Get default values for template variables.
 *
 * Creates a values object with default values for all variables
 * that have defaults defined.
 *
 * @param template The command template
 * @returns Object mapping variable names to default values
 */
export function getDefaultVariableValues(template: CommandTemplate): Record<string, string> {
	const variables = getTemplateVariables(template);
	const defaults: Record<string, string> = {};

	for (const variable of variables) {
		if (variable.defaultValue !== undefined) {
			defaults[variable.name] = variable.defaultValue;
		}
	}

	return defaults;
}

/**
 * Apply template to create initial command content.
 *
 * Replaces {{variable}} placeholders with provided values, and also
 * handles legacy placeholders (namespace, command, tool-name) for
 * backwards compatibility.
 *
 * @param template The command template to apply
 * @param options Legacy options (namespace, name, description, author)
 * @param variableValues Values for {{variable}} placeholders
 * @returns Template content with all placeholders replaced
 */
export function applyTemplate(
	template: CommandTemplate,
	options: {
		namespace?: string;
		name?: string;
		description?: string;
		author?: string;
	} = {},
	variableValues: Record<string, string> = {}
): string {
	let content = template.content;

	// First, apply new-style {{variable}} substitutions
	content = substituteVariables(content, variableValues);

	// Then, apply legacy replacements for backwards compatibility
	if (options.namespace) {
		content = content.replace(/namespace/g, options.namespace);
	}

	if (options.name) {
		content = content.replace(/command/g, options.name);
		content = content.replace(/tool-name/g, options.name);
		content = content.replace(/Command Title/g, `${options.name} - ${options.description || ''}`);
	}

	return content;
}
