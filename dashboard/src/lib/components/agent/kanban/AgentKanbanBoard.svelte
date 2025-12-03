<script lang="ts">
	/**
	 * AgentKanbanBoard Component
	 *
	 * Kanban board grouping agents/sessions by their activity state.
	 * Each column represents an activity state (starting, working, needs-input, etc.)
	 * Uses UnifiedAgentCard with mode='compact' for each agent.
	 *
	 * @see docs/unified-agent-card-refactor-plan.md Phase 5
	 */

	import { SESSION_STATE_VISUALS } from '$lib/config/statusColors';
	import type { ActivityState } from '$lib/types/agent';
	import type { Agent, Task, InputType } from '$lib/types/agent';
	import AgentKanbanColumn from './AgentKanbanColumn.svelte';
	import UnifiedAgentCard from '../UnifiedAgentCard.svelte';

	// Work session type (from WorkPanel)
	interface SparklineDataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	interface WorkSession {
		sessionName: string;
		agentName: string;
		task: {
			id: string;
			title?: string;
			status?: string;
			priority?: number;
			issue_type?: string;
		} | null;
		lastCompletedTask: {
			id: string;
			title?: string;
			status?: string;
			priority?: number;
			closedAt?: string;
		} | null;
		output: string;
		lineCount: number;
		tokens: number;
		cost: number;
		sparklineData?: SparklineDataPoint[];
		created: string;
		attached: boolean;
	}

	interface Props {
		sessions?: WorkSession[];
		onKillSession?: (sessionName: string) => Promise<void>;
		onInterrupt?: (sessionName: string) => Promise<void>;
		onContinue?: (sessionName: string) => Promise<void>;
		onAttachTerminal?: (sessionName: string) => Promise<void>;
		onSendInput?: (sessionName: string, input: string, type: 'text' | 'key' | 'raw') => Promise<void>;
		onTaskClick?: (taskId: string) => void;
		/** Filter by project (optional) */
		projectFilter?: string | null;
		/** Filter by priority (optional) */
		priorityFilter?: Set<number> | null;
		/** Search query (optional) */
		searchQuery?: string;
		class?: string;
	}

	let {
		sessions = [],
		onKillSession,
		onInterrupt,
		onContinue,
		onAttachTerminal,
		onSendInput,
		onTaskClick,
		projectFilter = null,
		priorityFilter = null,
		searchQuery = '',
		class: className = ''
	}: Props = $props();

	// Column order for the kanban board
	const columnOrder: ActivityState[] = [
		'needs-input',
		'ready-for-review',
		'working',
		'starting',
		'completing',
		'completed',
		'idle'
	];

	// Track collapsed columns
	let collapsedColumns = $state<Set<ActivityState>>(new Set());

	/**
	 * Detect session activity state from output (same logic as WorkPanel)
	 */
	function getSessionState(session: WorkSession): ActivityState {
		const output = session.output || '';
		const recentOutput = output.slice(-3000);

		// Helper to find last position of regex patterns
		const findLastPos = (patterns: RegExp[]): number => {
			let maxPos = -1;
			for (const pattern of patterns) {
				const match = recentOutput.match(new RegExp(pattern.source, 'g'));
				if (match) {
					const lastMatch = match[match.length - 1];
					const pos = recentOutput.lastIndexOf(lastMatch);
					if (pos > maxPos) maxPos = pos;
				}
			}
			return maxPos;
		};

		// Find positions using same patterns as WorkCard
		const needsInputPos = findLastPos([
			/\[JAT:NEEDS_INPUT\]/,
			/❓\s*NEED CLARIFICATION/,
			// Claude Code's native question UI patterns
			/Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/,
			/\[ \].*\n.*\[ \]/, // Multiple checkbox options
			/Type something\s*\n\s*Next/ // "Type something" option in questions
		]);
		const workingPos = findLastPos([/\[JAT:WORKING\s+task=/]);
		const reviewPos = findLastPos([
			/\[JAT:NEEDS_REVIEW\]/,
			/\[JAT:READY\s+actions=/,
			/🔍\s*READY FOR REVIEW/
		]);
		const completingPos = findLastPos([/jat:complete is running/, /Marking task complete/]);
		const completedPos = findLastPos([/\[JAT:COMPLETED\]/, /\[JAT:IDLE\]/, /✅\s*TASK COMPLETE/]);

		if (session.task) {
			const positions = [
				{ state: 'needs-input' as ActivityState, pos: needsInputPos },
				{ state: 'ready-for-review' as ActivityState, pos: reviewPos },
				{ state: 'completing' as ActivityState, pos: completingPos },
				{ state: 'working' as ActivityState, pos: workingPos }
			].filter((p) => p.pos >= 0);

			if (positions.length > 0) {
				// Sort by position descending (most recent marker wins)
				positions.sort((a, b) => b.pos - a.pos);
				return positions[0].state;
			}
			// No markers found - agent is starting/initializing
			return 'starting';
		}

		// No active task - check completed vs idle
		const hasCompletionMarker = completedPos >= 0;
		if (session.lastCompletedTask || hasCompletionMarker) {
			return 'completed';
		}
		return 'idle';
	}

	/**
	 * Apply filters to sessions
	 */
	const filteredSessions = $derived.by(() => {
		let result = sessions;

		// Filter by project
		if (projectFilter && projectFilter !== 'All Projects') {
			result = result.filter((s) => s.task?.id?.startsWith(projectFilter + '-'));
		}

		// Filter by priority
		if (priorityFilter && priorityFilter.size > 0 && priorityFilter.size < 4) {
			result = result.filter(
				(s) => s.task?.priority !== undefined && priorityFilter.has(s.task.priority)
			);
		}

		// Filter by search
		if (searchQuery?.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(s) =>
					s.agentName.toLowerCase().includes(query) ||
					s.task?.title?.toLowerCase().includes(query) ||
					s.task?.id?.toLowerCase().includes(query)
			);
		}

		return result;
	});

	/**
	 * Group sessions by activity state
	 */
	const sessionsByState = $derived.by(() => {
		const groups = new Map<ActivityState, WorkSession[]>();

		// Initialize all columns (even if empty)
		for (const state of columnOrder) {
			groups.set(state, []);
		}

		// Group sessions
		for (const session of filteredSessions) {
			const state = getSessionState(session);
			const list = groups.get(state) || [];
			list.push(session);
			groups.set(state, list);
		}

		return groups;
	});

	/**
	 * Get count for a state
	 */
	function getCount(state: ActivityState): number {
		return sessionsByState.get(state)?.length || 0;
	}

	/**
	 * Toggle column collapse
	 */
	function toggleCollapse(state: ActivityState) {
		if (collapsedColumns.has(state)) {
			collapsedColumns.delete(state);
		} else {
			collapsedColumns.add(state);
		}
		collapsedColumns = new Set(collapsedColumns);
	}

	/**
	 * Create agent object from session (for UnifiedAgentCard)
	 */
	function createAgentFromSession(session: WorkSession): Agent {
		return {
			id: 0,
			name: session.agentName,
			program: 'claude-code',
			model: 'unknown',
			task_description: session.task?.title || '',
			last_active_ts: new Date().toISOString(),
			reservation_count: 0,
			task_count: session.task ? 1 : 0,
			open_tasks: 0,
			in_progress_tasks: session.task ? 1 : 0,
			active: true,
			hasSession: true
		};
	}

	/**
	 * Convert session task to Task format
	 * NOTE: Must include assignee for UnifiedAgentCard to find currentTask
	 */
	function convertTask(
		task: WorkSession['task'] | WorkSession['lastCompletedTask'],
		agentName?: string
	): Task | null {
		if (!task) return null;
		// issue_type only exists on task, not lastCompletedTask
		const issueType = 'issue_type' in task ? task.issue_type : undefined;
		return {
			id: task.id,
			title: task.title || task.id,
			description: '',
			status: (task.status as 'open' | 'in_progress' | 'blocked' | 'closed') || 'in_progress',
			priority: task.priority ?? 2,
			issue_type: (issueType as 'task' | 'bug' | 'feature' | 'epic' | 'chore') || 'task',
			project: task.id.split('-')[0] || 'unknown',
			labels: [],
			assignee: agentName // Required for UnifiedAgentCard to match currentTask
		};
	}

	// Session-specific handlers
	function createKillHandler(sessionName: string) {
		return async () => {
			if (onKillSession) await onKillSession(sessionName);
		};
	}

	function createInterruptHandler(sessionName: string) {
		return async () => {
			if (onInterrupt) await onInterrupt(sessionName);
		};
	}

	function createContinueHandler(sessionName: string) {
		return async () => {
			if (onContinue) await onContinue(sessionName);
		};
	}

	function createAttachHandler(sessionName: string) {
		return async () => {
			if (onAttachTerminal) await onAttachTerminal(sessionName);
		};
	}

	function createSendInputHandler(sessionName: string) {
		return async (input: string, type: InputType) => {
			if (onSendInput) {
				const mappedType = type === 'paste' || type === 'image' ? 'raw' : type;
				await onSendInput(sessionName, input, mappedType);
			}
		};
	}
</script>

<div class="flex h-full gap-2 overflow-x-auto p-2 {className}">
	{#each columnOrder as state}
		{@const sessions = sessionsByState.get(state) || []}
		{@const count = sessions.length}
		{@const isCollapsed = collapsedColumns.has(state)}

		<AgentKanbanColumn
			{state}
			{count}
			collapsed={isCollapsed}
			onToggleCollapse={() => toggleCollapse(state)}
		>
			{#each sessions as session (session.sessionName)}
				{@const sessionState = getSessionState(session)}
				<UnifiedAgentCard
					agent={createAgentFromSession(session)}
					mode="compact"
					activityStateOverride={sessionState}
					tasks={session.task ? [convertTask(session.task, session.agentName)!] : []}
					output={session.output}
					lastCompletedTask={convertTask(session.lastCompletedTask, session.agentName)}
					sparklineData={session.sparklineData?.map((d) => ({
						date: d.timestamp,
						tokens: d.tokens,
						cost: d.cost
					}))}
					usage={session.tokens
						? {
								today: {
									input_tokens: 0,
									cache_creation_input_tokens: 0,
									cache_read_input_tokens: 0,
									output_tokens: 0,
									total_tokens: session.tokens,
									cost: session.cost,
									sessionCount: 1
								},
								week: {
									input_tokens: 0,
									cache_creation_input_tokens: 0,
									cache_read_input_tokens: 0,
									output_tokens: 0,
									total_tokens: session.tokens,
									cost: session.cost,
									sessionCount: 1
								}
							}
						: undefined}
					onKillSession={createKillHandler(session.sessionName)}
					onInterrupt={createInterruptHandler(session.sessionName)}
					onContinue={createContinueHandler(session.sessionName)}
					onAttachTerminal={createAttachHandler(session.sessionName)}
					onSendInput={createSendInputHandler(session.sessionName)}
					{onTaskClick}
				/>
			{/each}
		</AgentKanbanColumn>
	{/each}
</div>
