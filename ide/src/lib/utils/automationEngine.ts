/**
 * Automation Engine
 *
 * Pattern matching and action execution for terminal output automation.
 * Integrates with sessionEvents.ts to monitor session output in real-time.
 *
 * @see ide/src/lib/types/automation.ts for type definitions
 * @see ide/src/lib/stores/automationRules.svelte.ts for rules store
 */

import type {
	AutomationRule,
	AutomationPattern,
	AutomationAction,
	AutomationActivityEvent,
	QuestionUIConfig
} from '$lib/types/automation';
import { stripAnsi } from '$lib/utils/ansiToHtml';
import {
	getRulesForSession,
	isOnCooldown,
	hasExceededMaxTriggers,
	recordTrigger,
	addActivityEvent,
	isAutomationEnabled,
	getConfig
} from '$lib/stores/automationRules.svelte';
import { addToast } from '$lib/stores/toasts.svelte';
import { workSessionsState } from '$lib/stores/workSessions.svelte';

/** Extract project/task context from a session name for toast enrichment */
function getSessionToastContext(sessionName: string): { projectId?: string; taskId?: string; taskTitle?: string } {
	const session = workSessionsState.sessions.find(s => s.sessionName === sessionName);
	if (!session?.task?.id) return {};
	const projectId = session.task.id.split('-').slice(0, -1).join('-') || undefined;
	return { projectId, taskId: session.task.id, taskTitle: session.task.title || undefined };
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Match result from pattern matching
 */
export interface PatternMatch {
	rule: AutomationRule;
	pattern: AutomationPattern;
	matchedText: string;
	matchIndex: number;
	/** Regex capture groups: $0 is full match, $1, $2, etc. are groups */
	captureGroups: string[];
}

/**
 * Action execution result
 */
export interface ActionResult {
	action: AutomationAction;
	success: boolean;
	error?: string;
}

/**
 * Template context for variable substitution in action payloads
 */
export interface TemplateContext {
	/** The tmux session name (e.g., "jat-FairBay") */
	session: string;
	/** The agent name extracted from session (e.g., "FairBay") */
	agent: string;
	/** ISO timestamp when the rule triggered */
	timestamp: string;
	/** Full matched text from pattern ($0 equivalent) */
	match: string;
	/** Regex capture groups: $0 is full match, $1, $2, etc. are groups */
	captureGroups: string[];
}

/**
 * Callback for when automation triggers
 */
export type AutomationTriggerCallback = (
	sessionName: string,
	rule: AutomationRule,
	match: PatternMatch,
	results: ActionResult[]
) => void;

// =============================================================================
// STATE
// =============================================================================

/**
 * Rate limiting: track actions per minute globally
 */
let actionCountsPerMinute: { timestamp: number; count: number }[] = [];

/**
 * Track sessions with active "recovering" state
 */
const recoveringSessionsMap = new Map<string, { ruleId: string; timestamp: number }>();

/**
 * Subscribers for automation triggers
 */
const triggerSubscribers: Set<AutomationTriggerCallback> = new Set();

// =============================================================================
// PATTERN MATCHING
// =============================================================================

/**
 * Test if a pattern matches the given text
 */
export function testPattern(pattern: AutomationPattern, text: string): { matched: boolean; matchedText: string; matchIndex: number; captureGroups: string[] } {
	if (pattern.mode === 'regex') {
		try {
			const flags = pattern.caseSensitive ? 'g' : 'gi';
			const regex = new RegExp(pattern.pattern, flags);
			const match = regex.exec(text);
			if (match) {
				// Extract all capture groups (match[0] is full match, match[1]+ are groups)
				const captureGroups = Array.from(match).map(g => g || '');
				return {
					matched: true,
					matchedText: match[0],
					matchIndex: match.index,
					captureGroups
				};
			}
		} catch (err) {
			console.error('[automationEngine] Invalid regex pattern:', pattern.pattern, err);
		}
		return { matched: false, matchedText: '', matchIndex: -1, captureGroups: [] };
	}

	// String literal matching
	const searchText = pattern.caseSensitive ? text : text.toLowerCase();
	const searchPattern = pattern.caseSensitive ? pattern.pattern : pattern.pattern.toLowerCase();
	const index = searchText.indexOf(searchPattern);

	if (index !== -1) {
		const matchedText = text.substring(index, index + pattern.pattern.length);
		return {
			matched: true,
			matchedText,
			matchIndex: index,
			captureGroups: [matchedText] // $0 is the full match for string patterns
		};
	}

	return { matched: false, matchedText: '', matchIndex: -1, captureGroups: [] };
}

/**
 * Check if any patterns in a rule match the text
 */
export function matchRule(rule: AutomationRule, text: string): PatternMatch | null {
	for (const pattern of rule.patterns) {
		const result = testPattern(pattern, text);
		if (result.matched) {
			return {
				rule,
				pattern,
				matchedText: result.matchedText,
				matchIndex: result.matchIndex,
				captureGroups: result.captureGroups
			};
		}
	}
	return null;
}

/**
 * Find all matching rules for a session's output
 */
export function findMatchingRules(sessionName: string, output: string): PatternMatch[] {
	if (!isAutomationEnabled()) return [];

	const rules = getRulesForSession(sessionName);
	const matches: PatternMatch[] = [];

	for (const rule of rules) {
		// Skip if on cooldown
		if (isOnCooldown(rule.id, sessionName)) {
			continue;
		}

		// Skip if exceeded max triggers
		if (hasExceededMaxTriggers(rule.id, sessionName)) {
			continue;
		}

		const match = matchRule(rule, output);
		if (match) {
			matches.push(match);
		}
	}

	// Sort by priority (higher first)
	matches.sort((a, b) => b.rule.priority - a.rule.priority);

	return matches;
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Check if we can execute more actions (rate limiting)
 */
function checkRateLimit(): boolean {
	const config = getConfig();
	const now = Date.now();
	const oneMinuteAgo = now - 60000;

	// Clean old entries
	actionCountsPerMinute = actionCountsPerMinute.filter(e => e.timestamp > oneMinuteAgo);

	// Count actions in last minute
	const totalActions = actionCountsPerMinute.reduce((sum, e) => sum + e.count, 0);

	return totalActions < config.maxActionsPerMinute;
}

/**
 * Record an action for rate limiting
 */
function recordAction(): void {
	actionCountsPerMinute.push({ timestamp: Date.now(), count: 1 });
}

// =============================================================================
// TEMPLATE PROCESSING
// =============================================================================

/**
 * Process template variables in a string
 *
 * Available variables:
 * - {session} - The tmux session name (e.g., "jat-FairBay")
 * - {agent} - The agent name extracted from session (e.g., "FairBay")
 * - {timestamp} - ISO timestamp when the rule triggered
 * - {match} or {$0} - Full matched text from pattern
 * - {$1}, {$2}, etc. - Regex capture groups
 *
 * @param template The template string with {variable} placeholders
 * @param context The context with values to substitute
 * @returns The processed string with variables replaced
 */
export function processTemplate(template: string, context: TemplateContext): string {
	let result = template;

	// Replace named variables
	result = result.replace(/\{session\}/g, context.session);
	result = result.replace(/\{agent\}/g, context.agent);
	result = result.replace(/\{timestamp\}/g, context.timestamp);
	result = result.replace(/\{match\}/g, context.match);

	// Replace capture groups: {$0}, {$1}, {$2}, etc.
	result = result.replace(/\{\$(\d+)\}/g, (_, index) => {
		const idx = parseInt(index, 10);
		return context.captureGroups[idx] ?? '';
	});

	return result;
}

/**
 * Create a template context from session and match information
 */
function createTemplateContext(
	sessionName: string,
	match: PatternMatch | null
): TemplateContext {
	// Extract agent name from session name (e.g., "jat-FairBay" -> "FairBay")
	const agentName = sessionName.startsWith('jat-')
		? sessionName.substring(4)
		: sessionName;

	return {
		session: sessionName,
		agent: agentName,
		timestamp: new Date().toISOString(),
		match: match?.matchedText ?? '',
		captureGroups: match?.captureGroups ?? []
	};
}

// =============================================================================
// ACTION EXECUTION
// =============================================================================

/**
 * Execute a single action
 */
async function executeAction(
	sessionName: string,
	action: AutomationAction,
	ruleName: string,
	templateContext: TemplateContext
): Promise<ActionResult> {
	const config = getConfig();

	// Wait for delay if specified
	if (action.delay && action.delay > 0) {
		await new Promise(resolve => setTimeout(resolve, action.delay));
	}

	// Check rate limit
	if (!checkRateLimit()) {
		return {
			action,
			success: false,
			error: 'Rate limit exceeded'
		};
	}

	try {
		// Process template variables in payload
		const processedPayload = processTemplate(action.payload, templateContext);

		switch (action.type) {
			case 'send_text':
				await sendTextToSession(sessionName, processedPayload);
				break;

			case 'send_keys':
				await sendKeysToSession(sessionName, processedPayload);
				break;

			case 'tmux_command':
				await executeTmuxCommand(sessionName, processedPayload);
				break;

			case 'signal':
				await emitSignal(sessionName, processedPayload);
				break;

			case 'notify_only':
				// Show toast notification to user with rule name
				addToast({
					message: processedPayload || `Automation triggered on ${sessionName}`,
					type: 'info',
					details: `Rule: ${ruleName}`,
					route: '/automation',
					...getSessionToastContext(sessionName)
				});
				if (config.debugLogging) {
					console.log(`[automationEngine] Notification for ${sessionName}: ${processedPayload}`);
				}
				break;

			case 'show_question_ui':
				await showQuestionUI(sessionName, action, templateContext, ruleName);
				break;

			case 'run_command':
				await runSlashCommand(sessionName, processedPayload, ruleName);
				break;

			case 'execute_workflow':
				await executeWorkflowAction(processedPayload, templateContext, ruleName);
				break;

			default:
				return {
					action,
					success: false,
					error: `Unknown action type: ${(action as AutomationAction).type}`
				};
		}

		recordAction();

		return { action, success: true };
	} catch (err) {
		return {
			action,
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/**
 * Execute all actions for a matched rule
 */
export async function executeActions(
	sessionName: string,
	rule: AutomationRule,
	match: PatternMatch | null = null
): Promise<ActionResult[]> {
	const results: ActionResult[] = [];

	// Create template context for variable substitution
	const templateContext = createTemplateContext(sessionName, match);

	for (const action of rule.actions) {
		const result = await executeAction(sessionName, action, rule.name, templateContext);
		results.push(result);

		// If an action fails, continue with others but log it
		if (!result.success) {
			console.warn(`[automationEngine] Action failed for ${sessionName}:`, result.error);
		}
	}

	return results;
}

// =============================================================================
// API CALLS
// =============================================================================

/**
 * Send text to a session via API
 */
async function sendTextToSession(sessionName: string, text: string): Promise<void> {
	const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/input`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ type: 'text', input: text })
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || data.error || 'Failed to send text');
	}
}

/**
 * Send special keys to a session via API
 */
async function sendKeysToSession(sessionName: string, key: string): Promise<void> {
	// Map special key names to API types
	const keyTypeMap: Record<string, string> = {
		'Enter': 'enter',
		'Escape': 'escape',
		'Tab': 'tab',
		'Up': 'up',
		'Down': 'down',
		'C-c': 'ctrl-c',
		'C-d': 'ctrl-d',
		'C-u': 'ctrl-u'
	};

	const type = keyTypeMap[key] || 'raw';
	const input = keyTypeMap[key] ? '' : key;

	const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/input`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ type, input })
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || data.error || 'Failed to send keys');
	}
}

/**
 * Execute a tmux command via API
 * The {session} placeholder in the command will be replaced with the session name
 */
async function executeTmuxCommand(sessionName: string, command: string): Promise<void> {
	// Replace {session} placeholder with actual session name
	const processedCommand = command.replace(/\{session\}/g, sessionName);

	// For security, only allow certain tmux subcommands
	const allowedCommands = ['send-keys', 'select-pane', 'resize-pane'];
	const isAllowed = allowedCommands.some(cmd => processedCommand.startsWith(cmd));

	if (!isAllowed) {
		throw new Error(`Tmux command not allowed: ${processedCommand.split(' ')[0]}`);
	}

	// Execute via dedicated tmux command API
	const response = await fetch(`/api/tmux/command`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sessionName, command: processedCommand })
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || data.error || 'Failed to execute tmux command');
	}
}

/**
 * Emit a jat-signal via API
 */
async function emitSignal(sessionName: string, signalSpec: string): Promise<void> {
	// Parse signal spec: "type payload"
	const spaceIndex = signalSpec.indexOf(' ');
	const signalType = spaceIndex > 0 ? signalSpec.substring(0, spaceIndex) : signalSpec;
	const payload = spaceIndex > 0 ? signalSpec.substring(spaceIndex + 1) : '';

	const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/signal`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ type: signalType, data: payload })
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || data.error || 'Failed to emit signal');
	}
}

/**
 * Show question UI by emitting a question signal
 *
 * Instead of auto-responding, this action type triggers the IDE's
 * question UI to show custom options defined in the automation rule.
 * The user selects an option, and it's sent back to the session.
 */
async function showQuestionUI(
	sessionName: string,
	action: AutomationAction,
	templateContext: TemplateContext,
	ruleName: string
): Promise<void> {
	const config = getConfig();

	// Get question config from either structured config or parsed payload
	let questionConfig: QuestionUIConfig;

	if (action.questionUIConfig) {
		// Use structured config if available
		questionConfig = action.questionUIConfig;
	} else if (action.payload) {
		// Try to parse payload as JSON
		try {
			questionConfig = JSON.parse(processTemplate(action.payload, templateContext));
		} catch (err) {
			throw new Error(`Invalid question UI config: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
		}
	} else {
		throw new Error('show_question_ui action requires questionUIConfig or valid JSON payload');
	}

	// Validate required fields
	if (!questionConfig.question) {
		throw new Error('Question text is required for show_question_ui action');
	}
	if (!questionConfig.questionType) {
		questionConfig.questionType = 'choice'; // Default to choice
	}
	if (questionConfig.questionType === 'choice' && (!questionConfig.options || questionConfig.options.length === 0)) {
		throw new Error('Options are required for choice-type questions');
	}

	// Process template variables in question and options
	questionConfig.question = processTemplate(questionConfig.question, templateContext);
	if (questionConfig.options) {
		questionConfig.options = questionConfig.options.map(opt => ({
			...opt,
			label: processTemplate(opt.label, templateContext),
			value: processTemplate(opt.value, templateContext),
			description: opt.description ? processTemplate(opt.description, templateContext) : undefined
		}));
	}

	// Emit question signal - this will be picked up by the IDE
	// and rendered using the existing custom question UI in SessionCard
	const signalPayload = JSON.stringify({
		question: questionConfig.question,
		questionType: questionConfig.questionType,
		options: questionConfig.options,
		timeout: questionConfig.timeout,
		// Include metadata about the automation rule that triggered this
		automationRule: ruleName,
		triggeredAt: templateContext.timestamp
	});

	const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/signal`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ type: 'question', data: signalPayload })
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || data.error || 'Failed to show question UI');
	}

	if (config.debugLogging) {
		console.log(`[automationEngine] Showing question UI for ${sessionName}: ${questionConfig.question}`);
	}

	// Show notification that question UI is being displayed
	addToast({
		message: `Question triggered: ${questionConfig.question.substring(0, 50)}${questionConfig.question.length > 50 ? '...' : ''}`,
		type: 'info',
		details: `Rule: ${ruleName}`,
		route: '/automation',
		...getSessionToastContext(sessionName)
	});
}

/**
 * Run a Claude agent slash command in the session
 *
 * Sends the command to the session's terminal, which will be picked up by
 * Claude Code and executed. Commands can be specified with or without the
 * leading slash (e.g., "/jat:complete" or "jat:complete").
 */
async function runSlashCommand(
	sessionName: string,
	command: string,
	ruleName: string
): Promise<void> {
	const config = getConfig();

	// Ensure command starts with /
	const normalizedCommand = command.startsWith('/') ? command : `/${command}`;

	if (config.debugLogging) {
		console.log(`[automationEngine] Running slash command "${normalizedCommand}" in ${sessionName}`);
	}

	// Send the command to the session
	// The sendTextToSession function sends text followed by Enter
	await sendTextToSession(sessionName, normalizedCommand);

	// Show notification
	addToast({
		message: `Running command: ${normalizedCommand}`,
		type: 'info',
		details: `Rule: ${ruleName} • Session: ${sessionName}`,
		route: '/automation',
		...getSessionToastContext(sessionName)
	});
}

/**
 * Execute a workflow by ID via the IDE API
 */
async function executeWorkflowAction(
	workflowId: string,
	context: TemplateContext,
	ruleName: string
): Promise<void> {
	const config = getConfig();

	if (config.debugLogging) {
		console.log(`[automationEngine] Executing workflow "${workflowId}" (rule: ${ruleName})`);
	}

	const response = await fetch(`http://127.0.0.1:3333/api/workflows/${encodeURIComponent(workflowId)}/run`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			trigger: 'event',
			eventData: {
				automationRule: ruleName,
				session: context.session,
				agent: context.agent,
				match: context.match,
				timestamp: context.timestamp
			}
		})
	});

	if (!response.ok) {
		const data = await response.json().catch(() => ({}));
		throw new Error(
			(data as { message?: string }).message ||
			(data as { error?: string }).error ||
			`Workflow execution failed (${response.status})`
		);
	}

	addToast({
		message: `Workflow executed: ${workflowId}`,
		type: 'info',
		details: `Rule: ${ruleName}`,
		route: '/automation',
		...getSessionToastContext(context.session)
	});
}

// =============================================================================
// MAIN PROCESSING
// =============================================================================

/**
 * Process session output and execute matching rules
 * This is the main entry point called by sessionEvents.ts
 */
export async function processSessionOutput(
	sessionName: string,
	output: string,
	agentName?: string
): Promise<void> {
	// Always log when called for debugging (strip ANSI codes for clean console output)
	console.log(`[automationEngine] processSessionOutput called for ${sessionName}, output length: ${output.length}`);

	if (!isAutomationEnabled()) {
		console.log('[automationEngine] Automation is disabled, skipping');
		return;
	}

	const config = getConfig();

	// Find matching rules
	const matches = findMatchingRules(sessionName, output);
	// Strip ANSI codes from output preview to avoid corrupted console display
	const cleanPreview = stripAnsi(output).substring(0, 50).replace(/\n/g, ' ');
	console.log(`[automationEngine] Found ${matches.length} matching rules for "${cleanPreview}..."`);
	if (matches.length === 0) return;

	// Process first matching rule (highest priority)
	// We only process one rule per output event to avoid action conflicts
	const match = matches[0];

	if (config.debugLogging) {
		console.log(`[automationEngine] Rule matched for ${sessionName}: ${match.rule.name}`);
	}

	// Record trigger BEFORE executing to prevent rapid re-triggering
	recordTrigger(match.rule.id, sessionName);

	// Set recovering state for recovery category rules
	if (match.rule.category === 'recovery') {
		setRecoveringState(sessionName, match.rule.id);
	}

	// Execute actions with template context from match
	const results = await executeActions(sessionName, match.rule, match);

	// Log activity event
	const allSucceeded = results.every(r => r.success);
	addActivityEvent({
		sessionName,
		agentName,
		ruleId: match.rule.id,
		ruleName: match.rule.name,
		matchedPattern: match.pattern.pattern,
		matchedText: match.matchedText,
		actionsExecuted: match.rule.actions,
		success: allSucceeded,
		error: allSucceeded ? undefined : results.find(r => !r.success)?.error
	});

	// Clear recovering state after successful action execution
	if (match.rule.category === 'recovery' && allSucceeded) {
		// Keep recovering state for a short time to show animation
		setTimeout(() => {
			clearRecoveringState(sessionName);
		}, 3000);
	}

	// Notify subscribers
	triggerSubscribers.forEach(callback => {
		try {
			callback(sessionName, match.rule, match, results);
		} catch (err) {
			console.error('[automationEngine] Subscriber callback error:', err);
		}
	});

	// Show notification if enabled (unless already notified via notify_only action)
	if (config.showNotifications) {
		const hasNotifyAction = match.rule.actions.some(a => a.type === 'notify_only');
		if (!hasNotifyAction) {
			const allSucceeded = results.every(r => r.success);
			if (allSucceeded) {
				addToast({
					message: `Automation executed on ${sessionName}`,
					type: 'info',
					details: `Rule: ${match.rule.name}`,
					route: '/automation',
					...getSessionToastContext(sessionName)
				});
			}
		}
	}
}

// =============================================================================
// RECOVERING STATE
// =============================================================================

/**
 * Set recovering state for a session
 */
export function setRecoveringState(sessionName: string, ruleId: string): void {
	recoveringSessionsMap.set(sessionName, {
		ruleId,
		timestamp: Date.now()
	});
}

/**
 * Clear recovering state for a session
 */
export function clearRecoveringState(sessionName: string): void {
	recoveringSessionsMap.delete(sessionName);
}

/**
 * Check if a session is in recovering state
 */
export function isSessionRecovering(sessionName: string): boolean {
	return recoveringSessionsMap.has(sessionName);
}

/**
 * Get recovering state details for a session
 */
export function getRecoveringState(sessionName: string): { ruleId: string; timestamp: number } | null {
	return recoveringSessionsMap.get(sessionName) || null;
}

/**
 * Get all sessions currently in recovering state
 */
export function getRecoveringSessions(): Map<string, { ruleId: string; timestamp: number }> {
	return new Map(recoveringSessionsMap);
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

/**
 * Subscribe to automation trigger events
 */
export function onAutomationTrigger(callback: AutomationTriggerCallback): () => void {
	triggerSubscribers.add(callback);
	return () => triggerSubscribers.delete(callback);
}

// =============================================================================
// PATTERN TESTING UTILITIES
// =============================================================================

/**
 * Test a pattern against sample text (for PatternTester component)
 */
export function testPatternAgainstText(pattern: AutomationPattern, text: string): {
	matched: boolean;
	matches: Array<{ text: string; index: number }>;
	error?: string;
} {
	if (pattern.mode === 'regex') {
		try {
			const flags = pattern.caseSensitive ? 'g' : 'gi';
			const regex = new RegExp(pattern.pattern, flags);
			const matches: Array<{ text: string; index: number }> = [];

			let match;
			while ((match = regex.exec(text)) !== null) {
				matches.push({ text: match[0], index: match.index });
				// Prevent infinite loop for zero-length matches
				if (match[0].length === 0) break;
			}

			return {
				matched: matches.length > 0,
				matches
			};
		} catch (err) {
			return {
				matched: false,
				matches: [],
				error: err instanceof Error ? err.message : 'Invalid regex'
			};
		}
	}

	// String literal matching
	const searchText = pattern.caseSensitive ? text : text.toLowerCase();
	const searchPattern = pattern.caseSensitive ? pattern.pattern : pattern.pattern.toLowerCase();
	const matches: Array<{ text: string; index: number }> = [];

	let index = 0;
	while ((index = searchText.indexOf(searchPattern, index)) !== -1) {
		matches.push({
			text: text.substring(index, index + pattern.pattern.length),
			index
		});
		index += pattern.pattern.length;
	}

	return {
		matched: matches.length > 0,
		matches
	};
}

/**
 * Validate a regex pattern
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
	try {
		new RegExp(pattern);
		return { valid: true };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : 'Invalid regex'
		};
	}
}
