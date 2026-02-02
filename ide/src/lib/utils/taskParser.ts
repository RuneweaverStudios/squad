/**
 * Task Parser — Core parsing engine for multi-mode task creation
 *
 * Supports: shorthand single-line, YAML, JSON, markdown lists, plain text
 * Used by: CreatePaste tab, /api/tasks/parse endpoint, jat-bulk CLI
 */
import yaml from 'js-yaml';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedTask {
	title: string;
	type?: string;
	priority?: number;
	labels?: string[];
	description?: string;
	assignee?: string;
	deps?: string[];
}

export interface TaskDefaults {
	type: string;
	priority: number;
	project: string;
	labels: string[];
}

export interface ParseResult {
	format: string;
	tasks: ParsedTask[];
	warnings: string[];
	errors: string[];
}

export type DetectedFormat = 'single' | 'yaml' | 'json' | 'markdown' | 'plain_multi';

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_TYPES = ['bug', 'task', 'feature', 'epic', 'chore'] as const;
const TYPE_ALIASES: Record<string, string> = {
	fix: 'bug',
	hotfix: 'bug',
	enhancement: 'feature',
	improvement: 'feature',
	story: 'feature',
	docs: 'chore',
	documentation: 'chore',
	doc: 'chore',
	test: 'chore',
	tests: 'chore',
	testing: 'chore',
	refactor: 'chore',
	refactoring: 'chore',
	cleanup: 'chore',
	spike: 'task',
	research: 'task',
};

// ─── Format Detection ───────────────────────────────────────────────────────

/**
 * Detect the format of input text.
 * Heuristics:
 *   1 line → single
 *   Starts with [ or { with [ → json
 *   Lines matching ^\s*-\s+\w+: → yaml
 *   Lines matching ^[-*]\s+ → markdown
 *   Else → plain_multi
 */
export function detectFormat(text: string): DetectedFormat {
	const trimmed = text.trim();
	if (!trimmed) return 'single';

	const lines = trimmed.split('\n');

	// Single line → shorthand
	if (lines.length === 1) return 'single';

	// JSON: starts with [ or starts with { and contains [ (array of tasks)
	if (/^\s*\[/.test(trimmed)) return 'json';

	// YAML: multiple lines with key-value pairs under list items
	// Look for "- title:" or "- type:" patterns
	const yamlLines = lines.filter(l => /^\s*-\s+\w+\s*:/.test(l));
	if (yamlLines.length >= 1) return 'yaml';

	// Markdown: lines starting with -, *, or - [ ]
	const mdLines = lines.filter(l => /^\s*[-*]\s+/.test(l) || /^\s*-\s*\[[ x]\]\s+/i.test(l));
	if (mdLines.length >= lines.filter(l => l.trim()).length * 0.5) return 'markdown';

	return 'plain_multi';
}

// ─── Shorthand Parser ───────────────────────────────────────────────────────

/**
 * Parse a single-line shorthand task string.
 *
 * Grammar:
 *   /bug, /task, /feature, /epic, /chore → type
 *   /p0 through /p4                      → priority
 *   #security, #api                      → labels (multiple)
 *   @AgentName                           → assignee
 *   +jat-abc                             → dependency
 *   Everything else                      → title
 *
 * Example: "Fix auth timeout /bug /p0 #security #api @BrightCanyon +jat-abc"
 */
export function parseShorthand(line: string): ParsedTask {
	let remaining = line.trim();
	const task: ParsedTask = { title: '' };

	// Extract type: /bug, /task, /feature, /epic, /chore (and aliases)
	const typeMatch = remaining.match(/\/(bug|task|feature|epic|chore|fix|hotfix|enhancement|improvement|story|docs|documentation|doc|test|tests|testing|refactor|refactoring|cleanup|spike|research)\b/i);
	if (typeMatch) {
		const rawType = typeMatch[1].toLowerCase();
		task.type = TYPE_ALIASES[rawType] || rawType;
		remaining = remaining.replace(typeMatch[0], '');
	}

	// Extract priority: /p0 through /p4
	const prioMatch = remaining.match(/\/p([0-4])\b/i);
	if (prioMatch) {
		task.priority = parseInt(prioMatch[1], 10);
		remaining = remaining.replace(prioMatch[0], '');
	}

	// Extract labels: #label (multiple allowed)
	const labels: string[] = [];
	const labelRegex = /#([a-zA-Z0-9_-]+)/g;
	let labelMatch;
	while ((labelMatch = labelRegex.exec(remaining)) !== null) {
		labels.push(labelMatch[1]);
	}
	if (labels.length > 0) {
		task.labels = labels;
		remaining = remaining.replace(/#[a-zA-Z0-9_-]+/g, '');
	}

	// Extract assignee: @Name
	const assigneeMatch = remaining.match(/@([a-zA-Z][a-zA-Z0-9_-]*)/);
	if (assigneeMatch) {
		task.assignee = assigneeMatch[1];
		remaining = remaining.replace(assigneeMatch[0], '');
	}

	// Extract dependencies: +task-id (multiple allowed)
	const deps: string[] = [];
	const depRegex = /\+([a-zA-Z][a-zA-Z0-9]*-[a-zA-Z0-9.]+)/g;
	let depMatch;
	while ((depMatch = depRegex.exec(remaining)) !== null) {
		deps.push(depMatch[1]);
	}
	if (deps.length > 0) {
		task.deps = deps;
		remaining = remaining.replace(/\+[a-zA-Z][a-zA-Z0-9]*-[a-zA-Z0-9.]+/g, '');
	}

	// Everything else is the title
	task.title = remaining.replace(/\s+/g, ' ').trim();

	return task;
}

// ─── Format-Specific Parsers ────────────────────────────────────────────────

/**
 * Parse YAML text into tasks.
 * Expects either:
 *   - An array of objects with title, type, priority, labels, description fields
 *   - A sequence of mappings
 */
export function parseYaml(text: string): ParsedTask[] {
	const doc = yaml.load(text);

	if (!Array.isArray(doc)) {
		throw new Error('YAML must be an array of task objects');
	}

	return doc.map((item, i) => {
		if (typeof item === 'string') {
			// Plain string item → title only
			return { title: item };
		}
		if (typeof item !== 'object' || item === null) {
			throw new Error(`Item ${i + 1}: expected object or string, got ${typeof item}`);
		}

		const obj = item as Record<string, unknown>;
		const task: ParsedTask = {
			title: String(obj.title || obj.name || '').trim(),
		};

		if (!task.title) {
			throw new Error(`Item ${i + 1}: missing title`);
		}

		if (obj.type) task.type = normalizeType(String(obj.type));
		if (obj.priority !== undefined && obj.priority !== null) {
			task.priority = normalizePriority(obj.priority);
		}
		if (obj.labels) {
			task.labels = normalizeLabels(obj.labels);
		}
		if (obj.description) task.description = String(obj.description).trim();
		if (obj.assignee) task.assignee = String(obj.assignee).trim();
		if (obj.deps || obj.depends_on) {
			const raw = obj.deps || obj.depends_on;
			task.deps = Array.isArray(raw) ? raw.map(String) : String(raw).split(',').map(s => s.trim()).filter(Boolean);
		}

		return task;
	});
}

/**
 * Parse JSON text into tasks.
 * Expects an array of objects with the same fields as YAML.
 */
export function parseJson(text: string): ParsedTask[] {
	const doc = JSON.parse(text);

	if (!Array.isArray(doc)) {
		throw new Error('JSON must be an array of task objects');
	}

	return doc.map((item, i) => {
		if (typeof item === 'string') {
			return { title: item };
		}
		if (typeof item !== 'object' || item === null) {
			throw new Error(`Item ${i + 1}: expected object or string`);
		}

		const task: ParsedTask = {
			title: String(item.title || item.name || '').trim(),
		};

		if (!task.title) {
			throw new Error(`Item ${i + 1}: missing title`);
		}

		if (item.type) task.type = normalizeType(String(item.type));
		if (item.priority !== undefined && item.priority !== null) {
			task.priority = normalizePriority(item.priority);
		}
		if (item.labels) {
			task.labels = normalizeLabels(item.labels);
		}
		if (item.description) task.description = String(item.description).trim();
		if (item.assignee) task.assignee = String(item.assignee).trim();
		if (item.deps || item.depends_on) {
			const raw = item.deps || item.depends_on;
			task.deps = Array.isArray(raw) ? raw.map(String) : String(raw).split(',').map(s => s.trim()).filter(Boolean);
		}

		return task;
	});
}

/**
 * Parse markdown list text into tasks.
 * Each line starting with -, *, or - [ ] is parsed using shorthand grammar.
 */
export function parseMarkdown(text: string): ParsedTask[] {
	const lines = text.split('\n');
	const tasks: ParsedTask[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Strip list markers: "- ", "* ", "- [ ] ", "- [x] "
		let content = trimmed
			.replace(/^[-*]\s*\[[ x]\]\s*/i, '')
			.replace(/^[-*]\s+/, '')
			.trim();

		if (!content) continue;

		tasks.push(parseShorthand(content));
	}

	return tasks;
}

/**
 * Parse plain text into tasks (one task per non-empty line).
 * Each line is treated as a title. No shorthand parsing.
 */
export function parsePlainText(text: string): ParsedTask[] {
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
		.map(title => ({ title }));
}

// ─── Main Parser ────────────────────────────────────────────────────────────

/**
 * Multi-format parser. Dispatches to format-specific parsers.
 *
 * @param text - Raw input text
 * @param options.format - Force a specific format (default: auto-detect)
 * @param options.defaults - Default values for missing fields
 * @returns ParseResult with tasks, warnings, and errors
 */
export function parseTasks(
	text: string,
	options?: {
		format?: 'auto' | 'yaml' | 'json' | 'markdown' | 'plain';
		defaults?: Partial<TaskDefaults>;
	}
): ParseResult {
	const trimmed = text.trim();
	if (!trimmed) {
		return { format: 'empty', tasks: [], warnings: [], errors: [] };
	}

	const warnings: string[] = [];
	const errors: string[] = [];

	// Detect or use specified format
	let format: string;
	if (options?.format && options.format !== 'auto') {
		format = options.format;
	} else {
		format = detectFormat(trimmed);
	}

	// Parse based on format
	let tasks: ParsedTask[] = [];
	try {
		switch (format) {
			case 'single':
				tasks = [parseShorthand(trimmed)];
				break;
			case 'yaml':
				tasks = parseYaml(trimmed);
				break;
			case 'json':
				tasks = parseJson(trimmed);
				break;
			case 'markdown':
				tasks = parseMarkdown(trimmed);
				break;
			case 'plain':
			case 'plain_multi':
				tasks = parsePlainText(trimmed);
				break;
			default:
				tasks = parsePlainText(trimmed);
				format = 'plain_multi';
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		errors.push(msg);
		return { format, tasks: [], warnings, errors };
	}

	// Apply defaults and generate warnings
	const defaults = options?.defaults;
	tasks = tasks.map((task, i) => {
		const result = { ...task };

		if (!result.type && defaults?.type) {
			result.type = defaults.type;
			warnings.push(`Task ${i + 1}: no type specified, using "${defaults.type}"`);
		}
		if (result.priority === undefined && defaults?.priority !== undefined) {
			result.priority = defaults.priority;
			warnings.push(`Task ${i + 1}: no priority, using P${defaults.priority}`);
		}
		if (defaults?.labels && defaults.labels.length > 0) {
			result.labels = [...(result.labels || []), ...defaults.labels.filter(l => !result.labels?.includes(l))];
		}

		// Validate title
		if (!result.title) {
			errors.push(`Task ${i + 1}: empty title`);
		}

		return result;
	});

	// Filter out tasks with empty titles (they were reported as errors)
	tasks = tasks.filter(t => t.title);

	return { format, tasks, warnings, errors };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeType(raw: string): string {
	const lower = raw.toLowerCase().trim();
	const alias = TYPE_ALIASES[lower];
	if (alias) return alias;
	if ((VALID_TYPES as readonly string[]).includes(lower)) return lower;
	return lower; // pass through; validation happens downstream
}

function normalizePriority(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;

	if (typeof value === 'number') {
		return value >= 0 && value <= 4 ? value : undefined;
	}

	if (typeof value === 'string') {
		const str = value.trim().toUpperCase();
		// P-prefixed: P0, P1, ...
		const pMatch = str.match(/^P([0-4])$/);
		if (pMatch) return parseInt(pMatch[1], 10);
		// Plain numeric
		const num = parseInt(str, 10);
		if (!isNaN(num) && num >= 0 && num <= 4) return num;
	}

	return undefined;
}

function normalizeLabels(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.map(String).map(s => s.trim()).filter(Boolean);
	}
	if (typeof raw === 'string') {
		return raw.split(',').map(s => s.trim()).filter(Boolean);
	}
	return [];
}
