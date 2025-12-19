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
 * All available command templates.
 */
export const COMMAND_TEMPLATES: CommandTemplate[] = [
	basicTemplate,
	workflowTemplate,
	toolTemplate,
	agentTemplate,
	apiIntegrationTemplate,
	databaseOperationsTemplate,
	testingCommandsTemplate
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
 * Get all templates including built-in and user templates.
 *
 * This is an async function because user templates are loaded from disk.
 * Built-in templates appear first, followed by user templates sorted by name.
 *
 * @param includeUserTemplates Whether to include user templates (default: true)
 * @returns Array of all templates (built-in first, then user)
 *
 * @example
 * const templates = await getAllTemplates();
 * // templates[0..6] = built-in templates
 * // templates[7+] = user templates (if any)
 */
export async function getAllTemplates(
	includeUserTemplates: boolean = true
): Promise<ExtendedTemplate[]> {
	// Start with built-in templates (marked as not user templates)
	const builtIn: ExtendedTemplate[] = COMMAND_TEMPLATES.map((t) => ({
		...t,
		isUserTemplate: false
	}));

	if (!includeUserTemplates) {
		return builtIn;
	}

	// Dynamically import userTemplates to avoid circular dependencies
	// and allow this module to work in both server and client contexts
	try {
		const { getAllUserTemplatesSync } = await import('$lib/utils/userTemplates');
		const userTemplates = getAllUserTemplatesSync();

		return [...builtIn, ...userTemplates];
	} catch (error) {
		// User templates not available (e.g., client-side)
		console.warn('[commandTemplates] User templates not available:', error);
		return builtIn;
	}
}

/**
 * Get a template by ID from both built-in and user templates.
 *
 * @param id Template ID
 * @returns Template if found, undefined otherwise
 */
export async function getTemplateById(id: string): Promise<ExtendedTemplate | undefined> {
	// First check built-in templates
	const builtIn = getTemplate(id);
	if (builtIn) {
		return { ...builtIn, isUserTemplate: false };
	}

	// Then check user templates
	try {
		const { getUserTemplateSync } = await import('$lib/utils/userTemplates');
		const userTemplate = getUserTemplateSync(id);
		if (userTemplate) {
			return userTemplate;
		}
	} catch {
		// User templates not available
	}

	return undefined;
}

/**
 * Check if a template ID is a built-in template.
 */
export function isBuiltInTemplate(id: string): boolean {
	return COMMAND_TEMPLATES.some((t) => t.id === id);
}
