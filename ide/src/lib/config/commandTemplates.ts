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
 * @see ide/src/lib/components/config/CommandEditor.svelte
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

/** Template category for organizing templates by type */
export type TemplateCategory = 'commands' | 'hooks' | 'tools' | 'subagents' | 'custom';

/** Category metadata for display */
export interface TemplateCategoryMeta {
	id: TemplateCategory;
	name: string;
	icon: string;
	description: string;
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
	/** Category for grouping in the templates page */
	category?: TemplateCategory;
}

/**
 * Template categories with metadata for grouping in the UI.
 */
export const TEMPLATE_CATEGORIES: TemplateCategoryMeta[] = [
	{
		id: 'commands',
		name: 'Slash Commands',
		icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
		description: 'Skill files that agents execute as /commands'
	},
	{
		id: 'hooks',
		name: 'Hook Scripts',
		icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.686-2.467a4.5 4.5 0 00-6.364-6.364L4.5 8.257m10.5-1.247l4.182 4.182a2.25 2.25 0 010 3.182l-4.182 4.182',
		description: 'PreToolUse/PostToolUse bash scripts for Claude Code'
	},
	{
		id: 'tools',
		name: 'CLI Tools',
		icon: 'M11.42 15.17l-5.17-3.03M11.42 15.17l5.17-3.03M11.42 15.17V20.5m0-5.33V4.5m0 0L6.25 7.53m5.17-3.03l5.17 3.03',
		description: 'Bash/Node scripts symlinked to ~/.local/bin/'
	},
	{
		id: 'subagents',
		name: 'Subagents',
		icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
		description: 'Task tool agent definitions for specialized work'
	},
	{
		id: 'custom',
		name: 'Other',
		icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
		description: 'Uncategorized templates'
	}
];

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
	category: 'commands',
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
	category: 'commands',
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
	category: 'tools',
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
 * Includes signal emissions, Agent Mail integration, and JAT Tasks coordination.
 */
const agentTemplate: CommandTemplate = {
	id: 'agent',
	name: 'Agent',
	description: 'Agent coordination with signals, mail, and JAT Tasks',
	icon: '🤖',
	category: 'commands',
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
4. **Emit Signal** - Update IDE state
5. **Coordinate** - Update JAT Tasks, send messages

---

## Implementation Steps

### STEP 1: Validate Preconditions

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

**Update IDE state via signal system.**

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
# Update task, declare files, and assign
jt update task-id --status in_progress --assignee "$AGENT_NAME" --files "src/**/*.ts"
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
Error: Task 'task-id' not found in JAT.
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
 * API Integration Template
 *
 * Template for commands that interact with REST or GraphQL APIs.
 * Includes endpoint configuration, authentication, and response handling.
 */
const apiIntegrationTemplate: CommandTemplate = {
	id: 'api-integration',
	name: 'API Integration',
	description: 'REST/GraphQL API endpoint integration with auth',
	icon: '🔌',
	category: 'commands',
	useCase: 'API calls, webhooks, external service integration',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'api, integration, http'
	},
	variables: [
		{
			name: 'apiName',
			label: 'API Name',
			placeholder: 'User Service API',
			required: true,
			hint: 'Name of the API or service being integrated'
		},
		{
			name: 'baseUrl',
			label: 'Base URL',
			placeholder: 'https://api.example.com/v1',
			required: true,
			hint: 'Base URL for the API endpoints'
		},
		{
			name: 'endpointPath',
			label: 'Endpoint Path',
			placeholder: '/users',
			defaultValue: '/resource',
			hint: 'API endpoint path (e.g., /users, /orders)'
		},
		{
			name: 'httpMethod',
			label: 'HTTP Method',
			placeholder: 'GET',
			defaultValue: 'GET',
			hint: 'HTTP method: GET, POST, PUT, PATCH, DELETE'
		},
		{
			name: 'authType',
			label: 'Authentication Type',
			placeholder: 'Bearer Token',
			defaultValue: 'Bearer Token',
			hint: 'Auth method: Bearer Token, API Key, Basic Auth, OAuth2'
		},
		{
			name: 'responseFormat',
			label: 'Response Format',
			placeholder: 'JSON',
			defaultValue: 'JSON',
			hint: 'Expected response format: JSON, XML, Text'
		}
	],
	content: `---
description: {{apiName}} integration
author:
version: 1.0.0
tags: api, integration, http
---

# {{apiName}} Integration

Integrate with {{apiName}} at \`{{baseUrl}}\`.

## Endpoint

\`\`\`
{{httpMethod}} {{baseUrl}}{{endpointPath}}
\`\`\`

## Authentication

**Type:** {{authType}}

\`\`\`bash
# Set up authentication
export API_TOKEN="your-token-here"

# For Bearer Token
curl -H "Authorization: Bearer $API_TOKEN" {{baseUrl}}{{endpointPath}}

# For API Key
curl -H "X-API-Key: $API_TOKEN" {{baseUrl}}{{endpointPath}}
\`\`\`

## Request Examples

### Basic Request

\`\`\`bash
curl -X {{httpMethod}} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  {{baseUrl}}{{endpointPath}}
\`\`\`

### With Request Body (POST/PUT/PATCH)

\`\`\`bash
curl -X {{httpMethod}} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -d '{
    "field1": "value1",
    "field2": "value2"
  }' \\
  {{baseUrl}}{{endpointPath}}
\`\`\`

### With Query Parameters

\`\`\`bash
curl -X {{httpMethod}} \\
  -H "Authorization: Bearer $API_TOKEN" \\
  "{{baseUrl}}{{endpointPath}}?page=1&limit=10"
\`\`\`

## Response Format

**Expected:** {{responseFormat}}

### Success Response (2xx)

\`\`\`json
{
  "status": "success",
  "data": {
    // Response data here
  }
}
\`\`\`

### Error Response (4xx/5xx)

\`\`\`json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE"
}
\`\`\`

## Error Handling

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Process response |
| 400 | Bad Request | Validate input parameters |
| 401 | Unauthorized | Check/refresh authentication |
| 403 | Forbidden | Verify permissions |
| 404 | Not Found | Verify endpoint path |
| 429 | Rate Limited | Implement backoff/retry |
| 500 | Server Error | Retry with exponential backoff |

## Rate Limiting

\`\`\`bash
# Check rate limit headers in response
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
\`\`\`

## Implementation Notes

- Always validate response status before parsing
- Implement retry logic for transient failures
- Cache responses where appropriate
- Log all API calls for debugging
`
};

/**
 * Database Operations Template
 *
 * Template for commands that interact with databases.
 * Includes query patterns, connection handling, and transaction management.
 */
const databaseOperationsTemplate: CommandTemplate = {
	id: 'database-operations',
	name: 'Database Operations',
	description: 'SQL/ORM database queries and migrations',
	icon: '🗃️',
	category: 'commands',
	useCase: 'Database queries, migrations, data operations',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'database, sql, query'
	},
	variables: [
		{
			name: 'operationName',
			label: 'Operation Name',
			placeholder: 'User Lookup',
			required: true,
			hint: 'Name of this database operation'
		},
		{
			name: 'tableName',
			label: 'Table Name',
			placeholder: 'users',
			required: true,
			hint: 'Primary table for this operation'
		},
		{
			name: 'databaseType',
			label: 'Database Type',
			placeholder: 'PostgreSQL',
			defaultValue: 'PostgreSQL',
			hint: 'Database engine: PostgreSQL, MySQL, SQLite, MongoDB'
		},
		{
			name: 'operationType',
			label: 'Operation Type',
			placeholder: 'SELECT',
			defaultValue: 'SELECT',
			hint: 'Query type: SELECT, INSERT, UPDATE, DELETE, UPSERT'
		},
		{
			name: 'keyColumn',
			label: 'Key Column',
			placeholder: 'id',
			defaultValue: 'id',
			hint: 'Primary key or lookup column'
		},
		{
			name: 'connectionVar',
			label: 'Connection Variable',
			placeholder: 'DATABASE_URL',
			defaultValue: 'DATABASE_URL',
			hint: 'Environment variable for database connection'
		}
	],
	content: `---
description: {{operationName}} - {{tableName}} table
author:
version: 1.0.0
tags: database, sql, query
---

# {{operationName}}

Database operation on \`{{tableName}}\` table using {{databaseType}}.

## Connection

\`\`\`bash
# Set connection string
export {{connectionVar}}="postgresql://user:pass@localhost:5432/dbname"

# Or for different databases:
# MySQL:   mysql://user:pass@localhost:3306/dbname
# SQLite:  sqlite:///path/to/database.db
# MongoDB: mongodb://user:pass@localhost:27017/dbname
\`\`\`

## Query: {{operationType}}

### Basic {{operationType}} Query

\`\`\`sql
-- {{operationName}}: Basic query
{{#if operationType === 'SELECT'}}
SELECT *
FROM {{tableName}}
WHERE {{keyColumn}} = $1
LIMIT 100;
{{/if}}
{{#if operationType === 'INSERT'}}
INSERT INTO {{tableName}} (column1, column2, created_at)
VALUES ($1, $2, NOW())
RETURNING *;
{{/if}}
{{#if operationType === 'UPDATE'}}
UPDATE {{tableName}}
SET column1 = $2, updated_at = NOW()
WHERE {{keyColumn}} = $1
RETURNING *;
{{/if}}
{{#if operationType === 'DELETE'}}
DELETE FROM {{tableName}}
WHERE {{keyColumn}} = $1
RETURNING *;
{{/if}}
\`\`\`

### With Filtering

\`\`\`sql
SELECT *
FROM {{tableName}}
WHERE status = 'active'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;
\`\`\`

### With Joins

\`\`\`sql
SELECT
  t.*,
  r.name AS related_name
FROM {{tableName}} t
LEFT JOIN related_table r ON t.related_id = r.id
WHERE t.{{keyColumn}} = $1;
\`\`\`

## Transaction Example

\`\`\`sql
BEGIN;

-- Step 1: Lock the row
SELECT * FROM {{tableName}}
WHERE {{keyColumn}} = $1
FOR UPDATE;

-- Step 2: Perform update
UPDATE {{tableName}}
SET status = 'processed', updated_at = NOW()
WHERE {{keyColumn}} = $1;

-- Step 3: Log the change
INSERT INTO audit_log (table_name, record_id, action, timestamp)
VALUES ('{{tableName}}', $1, '{{operationType}}', NOW());

COMMIT;
\`\`\`

## Indexes

\`\`\`sql
-- Recommended indexes for this operation
CREATE INDEX IF NOT EXISTS idx_{{tableName}}_{{keyColumn}}
ON {{tableName}} ({{keyColumn}});

CREATE INDEX IF NOT EXISTS idx_{{tableName}}_created_at
ON {{tableName}} (created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_{{tableName}}_status_created
ON {{tableName}} (status, created_at DESC);
\`\`\`

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Connection refused | DB not running | Check database service |
| Relation not found | Table missing | Run migrations |
| Unique violation | Duplicate key | Use UPSERT or check existing |
| Timeout | Slow query | Add indexes, optimize query |
| Deadlock | Concurrent updates | Implement retry logic |

## Performance Tips

1. **Use EXPLAIN ANALYZE** to check query plans
2. **Add appropriate indexes** for WHERE and JOIN columns
3. **Use LIMIT** for large result sets
4. **Batch operations** for bulk inserts/updates
5. **Connection pooling** for high concurrency

## CLI Access

\`\`\`bash
# PostgreSQL
psql \${{connectionVar}} -c "SELECT COUNT(*) FROM {{tableName}};"

# MySQL
mysql -e "SELECT COUNT(*) FROM {{tableName}};" dbname

# SQLite
sqlite3 database.db "SELECT COUNT(*) FROM {{tableName}};"
\`\`\`
`
};

/**
 * Testing Commands Template
 *
 * Template for commands that run tests and assertions.
 * Includes test patterns, fixtures, and coverage reporting.
 */
const testingCommandsTemplate: CommandTemplate = {
	id: 'testing-commands',
	name: 'Testing Commands',
	description: 'Test runners, assertions, and coverage',
	icon: '🧪',
	category: 'commands',
	useCase: 'Unit tests, integration tests, E2E tests, test automation',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'testing, test, quality'
	},
	variables: [
		{
			name: 'testSuiteName',
			label: 'Test Suite Name',
			placeholder: 'User Authentication Tests',
			required: true,
			hint: 'Name of the test suite or feature being tested'
		},
		{
			name: 'testRunner',
			label: 'Test Runner',
			placeholder: 'vitest',
			defaultValue: 'vitest',
			hint: 'Test framework: vitest, jest, pytest, go test, cargo test'
		},
		{
			name: 'testDirectory',
			label: 'Test Directory',
			placeholder: 'src/__tests__',
			defaultValue: 'tests',
			hint: 'Directory containing test files'
		},
		{
			name: 'testPattern',
			label: 'Test File Pattern',
			placeholder: '*.test.ts',
			defaultValue: '*.test.ts',
			hint: 'Glob pattern for test files'
		},
		{
			name: 'coverageThreshold',
			label: 'Coverage Threshold',
			placeholder: '80',
			defaultValue: '80',
			hint: 'Minimum code coverage percentage required'
		},
		{
			name: 'testTimeout',
			label: 'Test Timeout (ms)',
			placeholder: '5000',
			defaultValue: '5000',
			hint: 'Timeout for individual tests in milliseconds'
		}
	],
	content: `---
description: {{testSuiteName}}
author:
version: 1.0.0
tags: testing, test, quality
---

# {{testSuiteName}}

Test suite using **{{testRunner}}** with {{coverageThreshold}}% coverage threshold.

## Quick Commands

\`\`\`bash
# Run all tests
{{testRunner}} run

# Run specific test file
{{testRunner}} run {{testDirectory}}/auth.test.ts

# Run tests matching pattern
{{testRunner}} run --grep "should authenticate"

# Watch mode (re-run on changes)
{{testRunner}} watch

# Run with coverage
{{testRunner}} run --coverage
\`\`\`

## Test Structure

\`\`\`
{{testDirectory}}/
├── unit/              # Unit tests (isolated, fast)
│   ├── {{testPattern}}
│   └── helpers.test.ts
├── integration/       # Integration tests (with dependencies)
│   ├── api.test.ts
│   └── database.test.ts
├── e2e/               # End-to-end tests (full stack)
│   └── flows.test.ts
├── fixtures/          # Test data and mocks
│   └── users.json
└── setup.ts           # Global test setup
\`\`\`

## Test Examples

### Unit Test

\`\`\`typescript
import { describe, it, expect, beforeEach } from '{{testRunner}}';
import { functionUnderTest } from '../src/module';

describe('{{testSuiteName}}', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should handle valid input', () => {
    const result = functionUnderTest('valid');
    expect(result).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => functionUnderTest(null)).toThrow('Invalid input');
  });

  it('should complete within timeout', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
  }, {{testTimeout}});
});
\`\`\`

### Integration Test

\`\`\`typescript
import { describe, it, expect, beforeAll, afterAll } from '{{testRunner}}';
import { setupTestDb, teardownTestDb } from './fixtures/database';

describe('{{testSuiteName}} - Integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should persist data correctly', async () => {
    const created = await createRecord({ name: 'test' });
    const fetched = await fetchRecord(created.id);
    expect(fetched.name).toBe('test');
  });
});
\`\`\`

### Mocking Example

\`\`\`typescript
import { describe, it, expect, vi } from '{{testRunner}}';
import { fetchUserData } from '../src/api';

// Mock the HTTP client
vi.mock('../src/httpClient', () => ({
  get: vi.fn().mockResolvedValue({ data: { id: 1, name: 'Test User' } })
}));

describe('API Mocking', () => {
  it('should return mocked user data', async () => {
    const user = await fetchUserData(1);
    expect(user.name).toBe('Test User');
  });
});
\`\`\`

## Coverage Configuration

\`\`\`typescript
// vitest.config.ts or jest.config.js
export default {
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts'],
      thresholds: {
        lines: {{coverageThreshold}},
        branches: {{coverageThreshold}},
        functions: {{coverageThreshold}},
        statements: {{coverageThreshold}}
      }
    },
    testTimeout: {{testTimeout}}
  }
};
\`\`\`

## CI/CD Integration

\`\`\`yaml
# GitHub Actions example
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npm run test -- --coverage
    - name: Check coverage threshold
      run: |
        COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
        if (( $(echo "$COVERAGE < {{coverageThreshold}}" | bc -l) )); then
          echo "Coverage $COVERAGE% is below threshold {{coverageThreshold}}%"
          exit 1
        fi
\`\`\`

## Debugging Failed Tests

\`\`\`bash
# Run single test with verbose output
{{testRunner}} run {{testDirectory}}/failing.test.ts --reporter=verbose

# Run with debugger attached
node --inspect-brk node_modules/.bin/{{testRunner}} run

# Generate detailed failure report
{{testRunner}} run --reporter=json > test-results.json
\`\`\`

## Best Practices

1. **Isolate tests** - Each test should be independent
2. **Use descriptive names** - "should X when Y" pattern
3. **Test edge cases** - null, empty, boundary values
4. **Mock external dependencies** - APIs, databases, file system
5. **Keep tests fast** - < 100ms for unit tests
6. **Maintain coverage** - Aim for {{coverageThreshold}}%+ coverage
`
};

/**
 * Hook Script Template
 *
 * Bash script for Claude Code PreToolUse/PostToolUse hooks.
 * Captures tool data, writes to temp files for IDE consumption.
 */
const hookScriptTemplate: CommandTemplate = {
	id: 'hook-script',
	name: 'Hook Script',
	description: 'PreToolUse/PostToolUse bash hook for Claude Code',
	icon: '🪝',
	category: 'hooks',
	useCase: 'Intercept tool calls, capture data for IDE, emit signals',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'hook, claude-code'
	},
	variables: [
		{
			name: 'hookType',
			label: 'Hook Type',
			placeholder: 'PreToolUse',
			defaultValue: 'PreToolUse',
			hint: 'PreToolUse (before execution) or PostToolUse (after execution)'
		},
		{
			name: 'toolName',
			label: 'Tool Name (matcher)',
			placeholder: 'AskUserQuestion',
			required: true,
			hint: 'The tool to intercept: Bash, Edit, Write, AskUserQuestion, etc.'
		},
		{
			name: 'hookDescription',
			label: 'Description',
			placeholder: 'Capture question data for IDE display',
			hint: 'What this hook does'
		}
	],
	content: `#!/usr/bin/env bash
#
# {{hookType}} hook for {{toolName}}
#
# {{hookDescription}}
#
# Hook type: {{hookType}}
# Matcher: {{toolName}}
#
# Install in .claude/settings.json:
# {
#   "hooks": {
#     "{{hookType}}": [
#       {
#         "matcher": "{{toolName}}",
#         "hooks": [
#           { "type": "command", "command": ".claude/hooks/this-script.sh" }
#         ]
#       }
#     ]
#   }
# }

set -euo pipefail

# Read tool info from stdin (JSON with tool_input, session_id, etc.)
TOOL_INFO=$(cat)

# Extract session ID
SESSION_ID=$(echo "$TOOL_INFO" | jq -r '.session_id // ""' 2>/dev/null || echo "")

if [[ -z "$SESSION_ID" ]]; then
    exit 0  # Can't determine session, skip
fi

# --- Resolve agent identity ---

TMUX_SESSION=""
AGENT_NAME=""

# Method 1: From TMUX env var (may not be passed to hook subprocess)
if [[ -n "\${TMUX:-}" ]]; then
    TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "")
fi

# Method 2: From agent session file (more reliable)
if [[ -z "$TMUX_SESSION" ]]; then
    AGENT_FILE=".claude/sessions/agent-\${SESSION_ID}.txt"
    if [[ -f "$AGENT_FILE" ]]; then
        AGENT_NAME=$(cat "$AGENT_FILE" 2>/dev/null | tr -d '\\n')
        TMUX_SESSION="jat-\${AGENT_NAME}"
    fi
fi

# --- Extract tool data ---

# For PreToolUse: tool_input contains the planned arguments
# For PostToolUse: output contains the result, tool_input has original args
TOOL_INPUT=$(echo "$TOOL_INFO" | jq -c '.tool_input // {}' 2>/dev/null || echo "{}")

# --- Write state for IDE ---

# Build data JSON
DATA=$(jq -n -c \\
    --arg session_id "$SESSION_ID" \\
    --arg tmux "$TMUX_SESSION" \\
    --argjson tool_input "$TOOL_INPUT" \\
    '{
        session_id: $session_id,
        tmux_session: $tmux,
        timestamp: (now | todate),
        tool_input: $tool_input
    }' 2>/dev/null || echo "{}")

# Write to temp file for IDE to poll
OUTFILE="/tmp/claude-hook-\${SESSION_ID}.json"
echo "$DATA" > "$OUTFILE" 2>/dev/null || true

# Also write by tmux session name for easy lookup
if [[ -n "$TMUX_SESSION" ]]; then
    echo "$DATA" > "/tmp/claude-hook-tmux-\${TMUX_SESSION}.json" 2>/dev/null || true
fi

exit 0
`
};

/**
 * Subagent Template
 *
 * Task tool invocation pattern for defining specialized subagents.
 * Based on the agent types available in the Task tool system.
 */
const subagentTemplate: CommandTemplate = {
	id: 'subagent',
	name: 'Subagent',
	description: 'Task tool agent definition for specialized autonomous work',
	icon: '🧠',
	category: 'subagents',
	useCase: 'Specialized research, code exploration, background tasks',
	frontmatter: {
		description: '',
		author: '',
		version: '1.0.0',
		tags: 'subagent, task-tool'
	},
	variables: [
		{
			name: 'agentName',
			label: 'Agent Name',
			placeholder: 'code-reviewer',
			required: true,
			hint: 'Short identifier for this subagent type (kebab-case)'
		},
		{
			name: 'agentDescription',
			label: 'Description',
			placeholder: 'Reviews code for bugs, security issues, and best practices',
			required: true,
			multiline: true,
			hint: 'What this subagent specializes in'
		},
		{
			name: 'agentTools',
			label: 'Available Tools',
			placeholder: 'Read, Grep, Glob, WebSearch',
			defaultValue: 'Read, Grep, Glob',
			hint: 'Comma-separated list of tools the subagent can use'
		}
	],
	content: `---
description: {{agentName}} subagent definition
author:
version: 1.0.0
tags: subagent, task-tool
---

# {{agentName}} Subagent

{{agentDescription}}

## When to Use

Launch this subagent when you need:
- [Describe scenario 1]
- [Describe scenario 2]
- [Describe scenario 3]

## Available Tools

{{agentTools}}

## Invocation Pattern

Use the Task tool to launch this subagent:

\`\`\`typescript
// Launch the {{agentName}} subagent
Task({
  description: "{{agentName}}: [brief task description]",
  prompt: \`
    [Detailed instructions for the subagent]

    Context:
    - [Relevant context from the parent task]
    - [File paths, function names, etc.]

    Expected output:
    - [What the subagent should return]
  \`,
  subagent_type: "general-purpose"
})
\`\`\`

## Prompt Template

\`\`\`
You are a specialized {{agentName}} agent.

{{agentDescription}}

## Your Task

[Task description provided at invocation time]

## Guidelines

1. Focus only on the specific request
2. Return structured, actionable findings
3. Include file paths and line numbers where relevant
4. Be concise - the parent agent needs a summary, not a report

## Output Format

Return your findings as:
- **Summary**: One-line overview
- **Details**: Bulleted list of findings
- **Recommendations**: Suggested next steps (if any)
\`\`\`

## Example Usage

\`\`\`typescript
// Example: Launch {{agentName}} for a specific task
Task({
  description: "{{agentName}}: analyze authentication module",
  prompt: "Review src/auth/ for security vulnerabilities. Focus on token handling and session management. Return findings with file:line references.",
  subagent_type: "general-purpose"
})
\`\`\`

## Notes

- Subagents run in isolation and cannot modify files unless given Edit/Write tools
- Keep prompts focused - one clear objective per invocation
- Subagents return results to the parent agent, not directly to the user
- Use \`run_in_background: true\` for long-running investigations
`
};

/**
 * All available command templates.
 */
export const COMMAND_TEMPLATES: CommandTemplate[] = [
	basicTemplate,
	workflowTemplate,
	toolTemplate,
	agentTemplate,
	apiIntegrationTemplate,
	databaseOperationsTemplate,
	testingCommandsTemplate,
	hookScriptTemplate,
	subagentTemplate
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

// =============================================================================
// COMBINED TEMPLATES (BUILT-IN + USER)
// =============================================================================

/**
 * Extended template type that includes user template flag
 */
export interface ExtendedTemplate extends CommandTemplate {
	/** True if this is a user-created template */
	isUserTemplate?: boolean;
	/** Creation timestamp for user templates */
	createdAt?: string;
	/** Last modified timestamp for user templates */
	updatedAt?: string;
}

/**
 * Get all built-in templates.
 *
 * NOTE: User templates are stored on disk and can only be accessed via API:
 *   GET /api/templates - list all user templates
 *   GET /api/templates/[id] - get single user template
 *
 * For browser components that need all templates (built-in + user),
 * fetch from /api/templates and merge with getBuiltInTemplates().
 *
 * @returns Array of built-in templates marked with isUserTemplate: false
 *
 * @example
 * // For built-in only (synchronous, browser-safe)
 * const builtIn = getBuiltInTemplates();
 *
 * // For all templates (browser component)
 * const builtIn = getBuiltInTemplates();
 * const userResponse = await fetch('/api/templates');
 * const { templates: userTemplates } = await userResponse.json();
 * const allTemplates = [...builtIn, ...userTemplates];
 */
export function getBuiltInTemplates(): ExtendedTemplate[] {
	return COMMAND_TEMPLATES.map((t) => ({
		...t,
		isUserTemplate: false
	}));
}

/**
 * Get a built-in template by ID.
 *
 * NOTE: For user templates, use the API:
 *   GET /api/templates/[id]
 *
 * @param id Template ID
 * @returns Template if found in built-in templates, undefined otherwise
 */
export function getBuiltInTemplateById(id: string): ExtendedTemplate | undefined {
	const template = getTemplate(id);
	if (template) {
		return { ...template, isUserTemplate: false };
	}
	return undefined;
}

/**
 * Check if a template ID is a built-in template.
 */
export function isBuiltInTemplate(id: string): boolean {
	return COMMAND_TEMPLATES.some((t) => t.id === id);
}
