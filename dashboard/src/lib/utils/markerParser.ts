/**
 * Unified JAT marker parser for terminal output.
 *
 * Handles three marker types:
 * 1. Simple markers: [JAT:NEEDS_INPUT], [JAT:IDLE], etc.
 * 2. Key-value markers: [JAT:WORKING task=xxx], [JAT:READY actions=xxx]
 * 3. JSON payload markers: [JAT:HUMAN_ACTION {...}], [JAT:SUGGESTED_TASKS {...}]
 *
 * All parsing uses balanced-brace/bracket counting to handle nested content safely.
 */

// ============================================================================
// Types
// ============================================================================

/** All supported JAT marker types */
export type MarkerType =
	| 'WORKING'
	| 'READY'
	| 'IDLE'
	| 'NEEDS_INPUT'
	| 'NEEDS_REVIEW'
	| 'COMPLETED'
	| 'AUTO_PROCEED'
	| 'COMPACTING'
	| 'HUMAN_ACTION'
	| 'SUGGESTED_TASKS';

/** Base marker result with position */
interface BaseMarker {
	type: MarkerType;
	position: number; // Position in output string where marker starts
	raw: string; // Full matched marker text
}

/** Simple marker (no payload) */
export interface SimpleMarker extends BaseMarker {
	type: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'COMPLETED' | 'AUTO_PROCEED' | 'COMPACTING';
}

/** WORKING marker with task ID */
export interface WorkingMarker extends BaseMarker {
	type: 'WORKING';
	task: string;
}

/** READY marker with actions */
export interface ReadyMarker extends BaseMarker {
	type: 'READY';
	actions: string;
}

/** IDLE marker (optionally with actions) */
export interface IdleMarker extends BaseMarker {
	type: 'IDLE';
	actions?: string;
}

/** Human action from HUMAN_ACTION marker */
export interface HumanAction {
	title: string;
	description: string;
}

/** HUMAN_ACTION marker with parsed JSON */
export interface HumanActionMarker extends BaseMarker {
	type: 'HUMAN_ACTION';
	action: HumanAction;
}

/** Suggested task from SUGGESTED_TASKS marker (agent-generated task recommendation) */
export interface SuggestedTask {
	/** Optional ID if this references an existing task */
	id?: string;
	/** Task type: bug, feature, task, chore, epic */
	type: string;
	/** Task title */
	title: string;
	/** Task description */
	description: string;
	/** Priority level: 0-4 (P0=critical, P4=lowest) */
	priority: number;
	/** Optional reason why this task was suggested */
	reason?: string;
}

/** SUGGESTED_TASKS marker with parsed JSON */
export interface SuggestedTasksMarker extends BaseMarker {
	type: 'SUGGESTED_TASKS';
	tasks: SuggestedTask[];
}

/** Union of all marker types */
export type Marker =
	| SimpleMarker
	| WorkingMarker
	| ReadyMarker
	| IdleMarker
	| HumanActionMarker
	| SuggestedTasksMarker;

/** Session state derived from markers */
export type SessionState =
	| 'starting'
	| 'working'
	| 'needs-input'
	| 'ready-for-review'
	| 'completing'
	| 'completed'
	| 'idle';

/** Result of parsing all markers from output */
export interface MarkerParseResult {
	working: WorkingMarker | null;
	ready: ReadyMarker | null;
	idle: IdleMarker | null;
	needsInput: SimpleMarker | null;
	needsReview: SimpleMarker | null;
	completed: SimpleMarker | null;
	autoProceed: SimpleMarker | null;
	compacting: SimpleMarker | null;
	humanActions: HumanActionMarker[];
	suggestedTasks: SuggestedTasksMarker | null;
}

// ============================================================================
// Core Parsing Utilities
// ============================================================================

/**
 * Extract JSON from a string starting at a given position using balanced braces.
 * Handles nested objects, arrays, and escaped characters in strings.
 *
 * @returns The extracted JSON string, or null if no valid JSON found
 */
export function extractBalancedJson(text: string, startPos: number): string | null {
	if (startPos >= text.length || text[startPos] !== '{') {
		return null;
	}

	let braceCount = 0;
	let inString = false;
	let escapeNext = false;

	for (let i = startPos; i < text.length; i++) {
		const char = text[i];

		if (escapeNext) {
			escapeNext = false;
			continue;
		}

		if (char === '\\' && inString) {
			escapeNext = true;
			continue;
		}

		if (char === '"' && !escapeNext) {
			inString = !inString;
			continue;
		}

		if (!inString) {
			if (char === '{') {
				braceCount++;
			} else if (char === '}') {
				braceCount--;
				if (braceCount === 0) {
					return text.slice(startPos, i + 1);
				}
			}
		}
	}

	return null; // Unbalanced braces
}

/**
 * Extract value from key=value format until closing bracket.
 * Handles nested brackets properly.
 *
 * @returns The extracted value, or null if malformed
 */
function extractKeyValue(text: string, startPos: number): string | null {
	let bracketCount = 1; // We're already inside [JAT:...
	let valueStart = startPos;
	let valueEnd = -1;

	for (let i = startPos; i < text.length; i++) {
		const char = text[i];

		if (char === '[') {
			bracketCount++;
		} else if (char === ']') {
			bracketCount--;
			if (bracketCount === 0) {
				valueEnd = i;
				break;
			}
		}
	}

	if (valueEnd === -1) return null;

	return text.slice(valueStart, valueEnd).trim();
}

// ============================================================================
// Marker Finding Functions
// ============================================================================

/**
 * Find the last occurrence of a simple marker (no payload).
 */
export function findSimpleMarker(
	output: string,
	type: 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'COMPLETED' | 'AUTO_PROCEED' | 'COMPACTING'
): SimpleMarker | null {
	const marker = `[JAT:${type}]`;
	const position = output.lastIndexOf(marker);

	if (position === -1) return null;

	return {
		type,
		position,
		raw: marker
	};
}

/**
 * Find the last WORKING marker and extract task ID.
 */
export function findWorkingMarker(output: string): WorkingMarker | null {
	const prefix = '[JAT:WORKING task=';
	const position = output.lastIndexOf(prefix);

	if (position === -1) return null;

	const valueStart = position + prefix.length;
	const value = extractKeyValue(output, valueStart);

	if (!value) return null;

	// Find the full marker for raw
	const endPos = output.indexOf(']', valueStart);
	const raw = endPos !== -1 ? output.slice(position, endPos + 1) : prefix + value + ']';

	return {
		type: 'WORKING',
		position,
		raw,
		task: value
	};
}

/**
 * Find the last READY marker and extract actions.
 */
export function findReadyMarker(output: string): ReadyMarker | null {
	const prefix = '[JAT:READY actions=';
	const position = output.lastIndexOf(prefix);

	if (position === -1) return null;

	const valueStart = position + prefix.length;
	const value = extractKeyValue(output, valueStart);

	if (!value) return null;

	const endPos = output.indexOf(']', valueStart);
	const raw = endPos !== -1 ? output.slice(position, endPos + 1) : prefix + value + ']';

	return {
		type: 'READY',
		position,
		raw,
		actions: value
	};
}

/**
 * Find the last IDLE marker, optionally with actions.
 */
export function findIdleMarker(output: string): IdleMarker | null {
	// Check for IDLE with actions first
	const prefixWithActions = '[JAT:IDLE actions=';
	const posWithActions = output.lastIndexOf(prefixWithActions);

	// Check for simple IDLE
	const simpleMarker = '[JAT:IDLE]';
	const posSimple = output.lastIndexOf(simpleMarker);

	// Use whichever is more recent
	if (posWithActions > posSimple) {
		const valueStart = posWithActions + prefixWithActions.length;
		const value = extractKeyValue(output, valueStart);

		if (value) {
			const endPos = output.indexOf(']', valueStart);
			const raw =
				endPos !== -1 ? output.slice(posWithActions, endPos + 1) : prefixWithActions + value + ']';

			return {
				type: 'IDLE',
				position: posWithActions,
				raw,
				actions: value
			};
		}
	}

	if (posSimple !== -1) {
		return {
			type: 'IDLE',
			position: posSimple,
			raw: simpleMarker
		};
	}

	return null;
}

/**
 * Find all HUMAN_ACTION markers and parse their JSON payloads.
 */
export function findHumanActionMarkers(output: string): HumanActionMarker[] {
	const markers: HumanActionMarker[] = [];
	const prefix = '[JAT:HUMAN_ACTION ';
	let searchStart = 0;

	while (true) {
		const position = output.indexOf(prefix, searchStart);
		if (position === -1) break;

		const jsonStart = position + prefix.length;
		const jsonStr = extractBalancedJson(output, jsonStart);

		searchStart = position + 1;

		if (!jsonStr) continue;

		try {
			const parsed = JSON.parse(jsonStr);
			if (parsed.title) {
				// Find closing bracket for raw
				const closingBracket = output.indexOf(']', jsonStart + jsonStr.length);
				const raw =
					closingBracket !== -1
						? output.slice(position, closingBracket + 1)
						: prefix + jsonStr + ']';

				markers.push({
					type: 'HUMAN_ACTION',
					position,
					raw,
					action: {
						title: parsed.title,
						description: parsed.description || ''
					}
				});
			}
		} catch {
			// Invalid JSON, skip
		}
	}

	return markers;
}

/**
 * Find the last SUGGESTED_TASKS marker and parse its JSON payload.
 *
 * Supports TWO formats:
 *
 * 1. Block format (primary, used by /jat:complete):
 *    [JAT:SUGGESTED_TASKS]
 *    {"tasks":[{"type":"feature","title":"...","description":"...","priority":1},...]}
 *    [/JAT:SUGGESTED_TASKS]
 *
 * 2. Inline format (legacy):
 *    [JAT:SUGGESTED_TASKS {"tasks":[...]}]
 *
 * The payload should be a JSON object with a "tasks" array. Each task should have:
 * - type: string (bug, feature, task, chore, epic, agent, human)
 * - title: string
 * - description: string
 * - priority: number (0-4)
 * - id?: string (optional, if referencing existing task)
 * - reason?: string (optional, why this task was suggested)
 */
export function findSuggestedTasksMarker(output: string): SuggestedTasksMarker | null {
	// Try block format first: [JAT:SUGGESTED_TASKS]...[/JAT:SUGGESTED_TASKS]
	const blockResult = findSuggestedTasksBlockFormat(output);
	if (blockResult) return blockResult;

	// Fall back to inline format: [JAT:SUGGESTED_TASKS {...}]
	return findSuggestedTasksInlineFormat(output);
}

/**
 * Parse block format: [JAT:SUGGESTED_TASKS]\n{...}\n[/JAT:SUGGESTED_TASKS]
 */
function findSuggestedTasksBlockFormat(output: string): SuggestedTasksMarker | null {
	const openTag = '[JAT:SUGGESTED_TASKS]';
	const closeTag = '[/JAT:SUGGESTED_TASKS]';

	// Find the last occurrence of the block
	const closePos = output.lastIndexOf(closeTag);
	if (closePos === -1) return null;

	// Find the corresponding open tag before this close tag
	const searchArea = output.slice(0, closePos);
	const openPos = searchArea.lastIndexOf(openTag);
	if (openPos === -1) return null;

	// Extract content between tags
	const contentStart = openPos + openTag.length;
	const content = output.slice(contentStart, closePos).trim();

	// Find the JSON object in the content using balanced brace extraction
	const jsonStartIndex = content.indexOf('{');
	if (jsonStartIndex === -1) return null;

	const jsonStr = extractBalancedJson(content, jsonStartIndex);
	if (!jsonStr) return null;

	try {
		const parsed = JSON.parse(jsonStr);
		if (Array.isArray(parsed.tasks)) {
			const raw = output.slice(openPos, closePos + closeTag.length);

			return {
				type: 'SUGGESTED_TASKS',
				position: openPos,
				raw,
				tasks: parseSuggestedTasks(parsed.tasks)
			};
		}
	} catch {
		// Invalid JSON - silently fail
	}

	return null;
}

/**
 * Parse inline format: [JAT:SUGGESTED_TASKS {...}]
 */
function findSuggestedTasksInlineFormat(output: string): SuggestedTasksMarker | null {
	const prefix = '[JAT:SUGGESTED_TASKS ';
	const position = output.lastIndexOf(prefix);

	if (position === -1) return null;

	const jsonStart = position + prefix.length;
	const jsonStr = extractBalancedJson(output, jsonStart);

	if (!jsonStr) return null;

	try {
		const parsed = JSON.parse(jsonStr);
		if (Array.isArray(parsed.tasks)) {
			const closingBracket = output.indexOf(']', jsonStart + jsonStr.length);
			const raw =
				closingBracket !== -1 ? output.slice(position, closingBracket + 1) : prefix + jsonStr + ']';

			return {
				type: 'SUGGESTED_TASKS',
				position,
				raw,
				tasks: parseSuggestedTasks(parsed.tasks)
			};
		}
	} catch {
		// Invalid JSON - silently fail
	}

	return null;
}

/**
 * Parse and normalize task array from JSON payload
 */
function parseSuggestedTasks(tasks: Array<{
	id?: string;
	type?: string;
	title?: string;
	description?: string;
	priority?: number;
	reason?: string;
}>): SuggestedTask[] {
	return tasks.map((t) => ({
		id: t.id,
		type: t.type || 'task',
		title: t.title || '',
		description: t.description || '',
		priority: typeof t.priority === 'number' ? t.priority : 2,
		reason: t.reason
	}));
}

// ============================================================================
// High-Level Parsing
// ============================================================================

/**
 * Parse all JAT markers from output.
 * Returns the last occurrence of each marker type.
 */
export function parseAllMarkers(output: string): MarkerParseResult {
	return {
		working: findWorkingMarker(output),
		ready: findReadyMarker(output),
		idle: findIdleMarker(output),
		needsInput: findSimpleMarker(output, 'NEEDS_INPUT'),
		needsReview: findSimpleMarker(output, 'NEEDS_REVIEW'),
		completed: findSimpleMarker(output, 'COMPLETED'),
		autoProceed: findSimpleMarker(output, 'AUTO_PROCEED'),
		compacting: findSimpleMarker(output, 'COMPACTING'),
		humanActions: findHumanActionMarkers(output),
		suggestedTasks: findSuggestedTasksMarker(output)
	};
}

/**
 * Determine session state from parsed markers.
 * Uses position-based priority: most recent marker wins.
 */
export function determineSessionState(
	markers: MarkerParseResult,
	hasTask: boolean = false
): SessionState {
	// Build position array for state-determining markers
	const positions: Array<{ state: SessionState; pos: number }> = [];

	if (markers.completed) {
		positions.push({ state: 'completed', pos: markers.completed.position });
	}
	if (markers.idle) {
		positions.push({ state: 'idle', pos: markers.idle.position });
	}
	if (markers.needsInput) {
		positions.push({ state: 'needs-input', pos: markers.needsInput.position });
	}
	if (markers.needsReview || markers.ready) {
		const pos = Math.max(markers.needsReview?.position ?? -1, markers.ready?.position ?? -1);
		positions.push({ state: 'ready-for-review', pos });
	}
	if (markers.compacting) {
		positions.push({ state: 'completing', pos: markers.compacting.position });
	}
	if (markers.working) {
		positions.push({ state: 'working', pos: markers.working.position });
	}

	// Sort by position descending, take the most recent
	positions.sort((a, b) => b.pos - a.pos);

	if (positions.length > 0) {
		return positions[0].state;
	}

	// No markers found - infer from task presence
	return hasTask ? 'starting' : 'idle';
}

/**
 * Quick check if any activity markers are present.
 * Useful for determining if an agent is active.
 */
export function hasActivityMarkers(output: string): boolean {
	return (
		output.includes('[JAT:WORKING') ||
		output.includes('[JAT:NEEDS_INPUT]') ||
		output.includes('[JAT:NEEDS_REVIEW]') ||
		output.includes('[JAT:READY')
	);
}

/**
 * Get the most recent marker position of any type.
 */
export function getMostRecentMarkerPosition(output: string): number {
	const prefixes = [
		'[JAT:WORKING',
		'[JAT:READY',
		'[JAT:IDLE',
		'[JAT:NEEDS_INPUT]',
		'[JAT:NEEDS_REVIEW]',
		'[JAT:COMPLETED]',
		'[JAT:AUTO_PROCEED]',
		'[JAT:COMPACTING]',
		'[JAT:HUMAN_ACTION'
	];

	let maxPos = -1;
	for (const prefix of prefixes) {
		const pos = output.lastIndexOf(prefix);
		if (pos > maxPos) maxPos = pos;
	}

	return maxPos;
}

// ============================================================================
// Legacy Compatibility Helpers
// ============================================================================

/**
 * Helper to find last position of any of the given regex patterns.
 * Maintains compatibility with existing findLastPos pattern.
 */
export function findLastPos(output: string, patterns: RegExp[]): number {
	let maxPos = -1;
	for (const pattern of patterns) {
		const match = output.match(new RegExp(pattern.source, 'g'));
		if (match) {
			// Find the last match position
			let lastIndex = -1;
			let searchFrom = 0;
			const regex = new RegExp(pattern.source);
			while (true) {
				const slice = output.slice(searchFrom);
				const m = slice.match(regex);
				if (!m || m.index === undefined) break;
				lastIndex = searchFrom + m.index;
				searchFrom = lastIndex + 1;
			}
			if (lastIndex > maxPos) maxPos = lastIndex;
		}
	}
	return maxPos;
}
