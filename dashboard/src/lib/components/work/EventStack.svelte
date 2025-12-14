<script lang="ts">
	/**
	 * EventStack - Timeline of session events with stacked card UI
	 *
	 * Shows the last event compactly, expands on hover to reveal full timeline.
	 * Uses DaisyUI stack pattern with Svelte fly/slide transitions.
	 *
	 * Features:
	 * - Stacked cards (collapsed by default)
	 * - Hover to expand and reveal all events
	 * - Click event to expand JSON details
	 * - Rollback button for events with git_sha
	 * - Auto-refresh polling
	 * - Rich signal card rendering for each signal type
	 * - Event filtering by signal type, task, and time range
	 */

	import { onMount, onDestroy } from 'svelte';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import SuggestedTasksSection from './SuggestedTasksSection.svelte';
	import {
		WorkingSignalCard,
		ReviewSignalCard,
		NeedsInputSignalCard,
		CompletingSignalCard
	} from '$lib/components/signals';
	import type { SuggestedTask } from '$lib/types/signals';
	import { workSessionsState } from '$lib/stores/workSessions.svelte';
	import type {
		WorkingSignal,
		ReviewSignal,
		NeedsInputSignal,
		CompletingSignal
	} from '$lib/types/richSignals';

	/** Extended SuggestedTask with local UI state */
	interface SuggestedTaskWithState extends SuggestedTask {
		selected: boolean;
		edited: boolean;
		edits?: {
			type?: string;
			title?: string;
			description?: string;
			priority?: number;
			project?: string;
			labels?: string;
			depends_on?: string[];
		};
	}

	interface TimelineEvent {
		type: string;
		session_id: string;
		tmux_session: string;
		timestamp: string;
		state?: string;
		task_id?: string;
		data?: any;
		git_sha?: string;
		validation_warning?: string;
	}

	/** Filter options for event timeline */
	interface EventFilters {
		/** Filter by signal type(s) */
		signalTypes?: string[];
		/** Filter by task ID */
		taskId?: string;
		/** Filter events after this timestamp */
		startTime?: Date;
		/** Filter events before this timestamp */
		endTime?: Date;
	}

	let {
		sessionName,
		maxEvents = 20,
		pollInterval = 5000,
		onRollback,
		onCreateTasks,
		onTaskClick,
		onFileClick,
		onDiffClick,
		onApprove,
		onRequestChanges,
		onAskQuestion,
		onSelectOption,
		onSubmitText,
		availableProjects = [],
		class: className = '',
		autoExpand = false,
		filters = {}
	}: {
		sessionName: string;
		maxEvents?: number;
		pollInterval?: number;
		onRollback?: (event: TimelineEvent) => void;
		onCreateTasks?: (tasks: SuggestedTaskWithState[]) => Promise<{ success: any[]; failed: any[] }>;
		/** Callback when a task ID is clicked */
		onTaskClick?: (taskId: string) => void;
		/** Callback when a file path is clicked */
		onFileClick?: (filePath: string) => void;
		/** Callback when diff link is clicked */
		onDiffClick?: (filePath: string, changeType: string) => void;
		/** Callback when user approves review */
		onApprove?: () => void;
		/** Callback when user requests changes */
		onRequestChanges?: (feedback: string) => void;
		/** Callback when user asks a question */
		onAskQuestion?: (question: string) => void;
		/** Callback when user selects an option (needs_input) */
		onSelectOption?: (optionId: string) => void;
		/** Callback when user submits text (needs_input) */
		onSubmitText?: (text: string) => void;
		availableProjects?: string[];
		class?: string;
		/** Auto-expand when completion or tasks event is latest */
		autoExpand?: boolean;
		/** Event filters */
		filters?: EventFilters;
	} = $props();

	let events = $state<TimelineEvent[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isExpanded = $state(false);
	let actionSubmitting = $state(false);
	let copiedEventKey = $state<string | null>(null);
	let copiedField = $state<string | null>(null);  // Track which field was copied (e.g., "sessionId-abc123")

	/** Copy text to clipboard with visual feedback */
	async function copyToClipboard(text: string, fieldKey: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedField = fieldKey;
			setTimeout(() => copiedField = null, 1500);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Activity state for shimmer effect on latest event
	// Derived from the central workSessionsState store
	// Shimmer shows for both 'generating' (output growing) and 'thinking' (agent processing)
	const isGenerating = $derived.by(() => {
		const session = workSessionsState.sessions.find(s => s.sessionName === sessionName);
		return session?._activityState === 'generating' || session?._activityState === 'thinking';
	});

	// Filtered events based on filter props
	const filteredEvents = $derived.by(() => {
		let result = events;

		// Filter by signal types
		if (filters.signalTypes && filters.signalTypes.length > 0) {
			result = result.filter((e) => {
				const signalType = e.type || e.state || '';
				return filters.signalTypes!.includes(signalType);
			});
		}

		// Filter by task ID
		if (filters.taskId) {
			result = result.filter((e) => e.task_id === filters.taskId);
		}

		// Hide 'completing' events when there's a 'completed' event for the same task
		// The completed event is the final state and contains all the relevant info
		const completedTaskIds = new Set(
			result
				.filter((e) => e.type === 'completed' || e.state === 'completed')
				.map((e) => e.task_id)
		);
		result = result.filter((e) => {
			const eventType = e.type === 'state' ? e.state : e.type;
			if (eventType === 'completing' && e.task_id && completedTaskIds.has(e.task_id)) {
				return false; // Hide completing events for completed tasks
			}
			return true;
		});

		// Filter by time range
		if (filters.startTime) {
			const startTs = filters.startTime.getTime();
			result = result.filter((e) => new Date(e.timestamp).getTime() >= startTs);
		}
		if (filters.endTime) {
			const endTs = filters.endTime.getTime();
			result = result.filter((e) => new Date(e.timestamp).getTime() <= endTs);
		}

		// Merge consecutive events of the same type for the same task
		// This prevents multiple COMPLETING entries from cluttering the timeline
		// Events are stored newest-first (index 0 = most recent)
		// Keep only the most recent event when consecutive events have same type+task
		const merged: TimelineEvent[] = [];
		for (let i = 0; i < result.length; i++) {
			const current = result[i];
			const prev = merged[merged.length - 1];

			// Get event type (could be in type or state field)
			const currentType = current.type === 'state' ? current.state : current.type;
			const prevType = prev ? (prev.type === 'state' ? prev.state : prev.type) : null;

			// Check if this is a duplicate/update of a previous event
			// Merge if: same type AND same task_id AND type is one that updates frequently
			const mergableTypes = ['completing', 'compacting'];
			const shouldMerge = prev &&
				currentType === prevType &&
				current.task_id === prev.task_id &&
				mergableTypes.includes(currentType || '');

			if (shouldMerge) {
				// Skip this older event - we already have the newest one of this type
				// (events are newest-first, so 'prev' is newer than 'current')
			} else {
				merged.push(current);
			}
		}

		return merged;
	});

	// Helper to check if event has rich signal data
	function hasRichSignalData(event: TimelineEvent): boolean {
		return event.data && typeof event.data === 'object' && !Array.isArray(event.data);
	}

	// Auto-expand when latest event is completion or tasks and autoExpand is enabled
	$effect(() => {
		if (autoExpand && filteredEvents.length > 0) {
			const latestEvent = filteredEvents[0];
			// Check both new format (type=completed) and legacy (state=completed)
			const isCompletion = latestEvent?.type === 'complete' ||
				latestEvent?.type === 'completed' ||
				latestEvent?.type === 'tasks' ||
				latestEvent?.state === 'completed';
			if (isCompletion) {
				isExpanded = true;
			}
		}
	});
	let expandedEventIdx = $state<number | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// Track new events for entrance animation
	let newEventIds = $state<Set<string>>(new Set());
	let previousEventCount = $state(0);

	// State for suggested tasks management (per-event)
	// Key: event timestamp+idx, Value: map of task key -> selection/edit state
	let tasksStateByEvent = $state<Map<string, Map<string, { selected: boolean; edited: boolean; edits?: any }>>>(new Map());
	let isCreatingTasks = $state(false);
	let createResults = $state<{ success: any[]; failed: any[] }>({ success: [], failed: [] });
	let showCreateFeedback = $state(false);

	// Generate a unique key for an event
	function getEventKey(event: TimelineEvent): string {
		return `${event.timestamp}-${event.type}-${event.state || ''}`;
	}

	// Generate a key for a suggested task
	function getSuggestedTaskKey(task: SuggestedTask, index: number): string {
		return `${task.title}-${index}`;
	}

	// Get tasks with state for a specific event
	function getTasksWithState(event: TimelineEvent, eventKey: string): SuggestedTaskWithState[] {
		if (event.type !== 'tasks' || !Array.isArray(event.data)) return [];

		let eventTasksState = tasksStateByEvent.get(eventKey);
		if (!eventTasksState) {
			eventTasksState = new Map();
			tasksStateByEvent.set(eventKey, eventTasksState);
		}

		return event.data.map((task: SuggestedTask, idx: number) => {
			const taskKey = getSuggestedTaskKey(task, idx);
			const state = eventTasksState!.get(taskKey) || { selected: false, edited: false };
			return {
				...task,
				selected: state.selected,
				edited: state.edited,
				edits: state.edits
			};
		});
	}

	// Get selected count for an event
	function getSelectedCount(eventKey: string): number {
		const eventTasksState = tasksStateByEvent.get(eventKey);
		if (!eventTasksState) return 0;
		let count = 0;
		for (const state of eventTasksState.values()) {
			if (state.selected) count++;
		}
		return count;
	}

	// Toggle task selection
	function toggleTaskSelection(eventKey: string, taskKey: string) {
		let eventTasksState = tasksStateByEvent.get(eventKey);
		if (!eventTasksState) {
			eventTasksState = new Map();
			tasksStateByEvent.set(eventKey, eventTasksState);
		}

		const current = eventTasksState.get(taskKey) || { selected: false, edited: false };
		eventTasksState.set(taskKey, { ...current, selected: !current.selected });
		// Trigger reactivity
		tasksStateByEvent = new Map(tasksStateByEvent);
	}

	// Edit a task field
	function editTask(eventKey: string, taskKey: string, edits: Partial<SuggestedTask>) {
		let eventTasksState = tasksStateByEvent.get(eventKey);
		if (!eventTasksState) {
			eventTasksState = new Map();
			tasksStateByEvent.set(eventKey, eventTasksState);
		}

		const current = eventTasksState.get(taskKey) || { selected: false, edited: false };
		eventTasksState.set(taskKey, {
			...current,
			edited: true,
			edits: { ...current.edits, ...edits }
		});
		tasksStateByEvent = new Map(tasksStateByEvent);
	}

	// Clear edits for a task
	function clearTaskEdits(eventKey: string, taskKey: string) {
		const eventTasksState = tasksStateByEvent.get(eventKey);
		if (!eventTasksState) return;

		const current = eventTasksState.get(taskKey);
		if (current) {
			eventTasksState.set(taskKey, { selected: current.selected, edited: false, edits: undefined });
			tasksStateByEvent = new Map(tasksStateByEvent);
		}
	}

	// Handle task creation
	async function handleCreateTasks(eventKey: string, tasks: SuggestedTaskWithState[]) {
		if (!onCreateTasks) return;

		isCreatingTasks = true;
		showCreateFeedback = false;

		try {
			const results = await onCreateTasks(tasks);
			createResults = results;
			showCreateFeedback = true;

			// Clear selection for successfully created tasks
			if (results.success.length > 0) {
				const eventTasksState = tasksStateByEvent.get(eventKey);
				if (eventTasksState) {
					for (const success of results.success) {
						// Find and deselect the task
						for (const [key, state] of eventTasksState.entries()) {
							if (state.selected) {
								eventTasksState.set(key, { ...state, selected: false });
							}
						}
					}
					tasksStateByEvent = new Map(tasksStateByEvent);
				}
			}
		} catch (err: any) {
			createResults = { success: [], failed: [{ title: 'Error', error: err.message }] };
			showCreateFeedback = true;
		} finally {
			isCreatingTasks = false;
		}
	}

	// Dismiss feedback
	function dismissFeedback() {
		showCreateFeedback = false;
		createResults = { success: [], failed: [] };
	}

	// State styling - solid backgrounds to avoid see-through stacking
	// Maps signal states to visual styles (matches SessionCard SessionState)
	const stateStyles: Record<string, { icon: string; bg: string; text: string; border: string }> = {
		user_input: {
			icon: '💬',
			bg: 'oklch(0.22 0.08 260)',
			text: 'oklch(0.85 0.12 260)',
			border: 'oklch(0.40 0.10 260)'
		},
		starting: {
			icon: '🚀',
			bg: 'oklch(0.22 0.08 200)',
			text: 'oklch(0.80 0.12 200)',
			border: 'oklch(0.35 0.10 200)'
		},
		working: {
			icon: '⚡',
			bg: 'oklch(0.25 0.08 85)',
			text: 'oklch(0.85 0.15 85)',
			border: 'oklch(0.40 0.10 85)'
		},
		compacting: {
			icon: '📦',
			bg: 'oklch(0.22 0.06 50)',
			text: 'oklch(0.80 0.10 50)',
			border: 'oklch(0.35 0.08 50)'
		},
		review: {
			icon: '👁',
			bg: 'oklch(0.22 0.06 200)',
			text: 'oklch(0.85 0.12 200)',
			border: 'oklch(0.35 0.08 200)'
		},
		needs_input: {
			icon: '❓',
			bg: 'oklch(0.22 0.08 310)',
			text: 'oklch(0.80 0.15 310)',
			border: 'oklch(0.35 0.10 310)'
		},
		completing: {
			icon: '⏳',
			bg: 'oklch(0.22 0.08 145)',
			text: 'oklch(0.75 0.12 145)',
			border: 'oklch(0.35 0.10 145)'
		},
		completed: {
			icon: '✅',
			bg: 'oklch(0.22 0.10 145)',
			text: 'oklch(0.80 0.18 145)',
			border: 'oklch(0.35 0.12 145)'
		},
		auto_proceed: {
			icon: '🚀',
			bg: 'oklch(0.22 0.10 145)',
			text: 'oklch(0.80 0.18 145)',
			border: 'oklch(0.35 0.12 145)'
		},
		idle: {
			icon: '💤',
			bg: 'oklch(0.20 0.01 250)',
			text: 'oklch(0.65 0.02 250)',
			border: 'oklch(0.30 0.02 250)'
		}
	};

	// Type-based styling (for events without state)
	const typeStyles: Record<string, { icon: string; bg: string; text: string; border: string }> = {
		tasks: {
			icon: '📋',
			bg: 'oklch(0.22 0.08 280)',
			text: 'oklch(0.80 0.12 280)',
			border: 'oklch(0.35 0.10 280)'
		},
		action: {
			icon: '🎯',
			bg: 'oklch(0.22 0.08 30)',
			text: 'oklch(0.80 0.12 30)',
			border: 'oklch(0.35 0.10 30)'
		}
	};

	const defaultStyle = {
		icon: '📍',
		bg: 'oklch(0.20 0.01 250)',
		text: 'oklch(0.70 0.02 250)',
		border: 'oklch(0.30 0.02 250)'
	};

	function getEventStyle(event: TimelineEvent) {
		// New format: type IS the signal type (e.g., "working", "idle")
		if (event.type && stateStyles[event.type]) {
			return stateStyles[event.type];
		}
		// Legacy format: type="state" with separate state field
		if (event.state && stateStyles[event.state]) {
			return stateStyles[event.state];
		}
		if (event.type === 'complete') {
			return stateStyles.completed;
		}
		if (event.type && typeStyles[event.type]) {
			return typeStyles[event.type];
		}
		return defaultStyle;
	}

	function formatTime(timestamp: string): string {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			});
		} catch {
			return timestamp;
		}
	}

	function formatRelativeTime(timestamp: string): string {
		try {
			const date = new Date(timestamp);
			const now = new Date();
			const diffMs = now.getTime() - date.getTime();
			const diffMins = Math.floor(diffMs / 60000);
			const diffHours = Math.floor(diffMins / 60);

			if (diffMins < 1) return 'just now';
			if (diffMins < 60) return `${diffMins}m ago`;
			if (diffHours < 24) return `${diffHours}h ago`;
			return date.toLocaleDateString();
		} catch {
			return timestamp;
		}
	}

	function getEventLabel(event: TimelineEvent): string {
		// Determine the signal type - in new format, type IS the signal type
		const signalType = event.state || event.type;
		const maxLen = 60;
		const truncate = (s: string) => s.length > maxLen ? s.slice(0, maxLen) + '…' : s;

		// For user_input events, show truncated prompt preview
		if (event.type === 'user_input' && event.data?.prompt) {
			return truncate(event.data.prompt as string);
		}

		// For working events, show approach (what agent plans to do)
		if (signalType === 'working' && event.data) {
			if (event.data.approach) {
				return truncate(event.data.approach as string);
			}
			if (event.data.taskTitle) {
				return truncate(event.data.taskTitle as string);
			}
		}

		// For review events, show first summary item or reviewFocus
		if (signalType === 'review' && event.data) {
			if (event.data.summary && Array.isArray(event.data.summary) && event.data.summary.length > 0) {
				return truncate(event.data.summary[0] as string);
			}
			if (event.data.reviewFocus && Array.isArray(event.data.reviewFocus) && event.data.reviewFocus.length > 0) {
				return truncate(event.data.reviewFocus[0] as string);
			}
			if (event.data.taskTitle) {
				return truncate(event.data.taskTitle as string);
			}
		}

		// For completing events, show current step
		if (signalType === 'completing' && event.data) {
			if (event.data.currentStep) {
				// Capitalize and format step name (e.g., "committing" -> "Committing...")
				const step = (event.data.currentStep as string).charAt(0).toUpperCase() + (event.data.currentStep as string).slice(1);
				return `${step}...`;
			}
			if (event.data.taskTitle) {
				return truncate(event.data.taskTitle as string);
			}
		}

		// For needs_input events, show the question
		if (signalType === 'needs_input' && event.data) {
			if (event.data.question) {
				return truncate(event.data.question as string);
			}
			if (event.data.taskTitle) {
				return truncate(event.data.taskTitle as string);
			}
		}

		// For completed events, show outcome
		if ((signalType === 'completed' || event.type === 'complete') && event.data) {
			if (event.data.outcome) {
				const outcome = event.data.outcome as string;
				return outcome === 'success' ? 'Task completed successfully' : `Completed: ${outcome}`;
			}
			if (event.data.taskTitle) {
				return truncate(event.data.taskTitle as string);
			}
		}

		// For starting events, show agent → taskId  taskTitle
		if (signalType === 'starting' && event.data) {
			const agent = event.data.agentName || 'Agent';
			const taskId = event.data.taskId || event.task_id || '';
			const title = event.data.taskTitle || '';
			const parts = [agent];
			if (taskId) parts.push(`→ ${taskId}`);
			if (title) parts.push(` ${title}`);
			return truncate(parts.join(' '));
		}

		// Fallback to uppercase label with task ID
		const label = signalType.toUpperCase().replace('_', ' ');
		if (event.task_id) {
			return `${label} ${event.task_id}`;
		}
		return label;
	}

	async function fetchTimeline() {
		if (!sessionName) return;

		try {
			const tmuxName = sessionName.startsWith('jat-') ? sessionName : `jat-${sessionName}`;
			const response = await fetch(`/api/sessions/${tmuxName}/timeline?limit=${maxEvents}`);
			if (!response.ok) {
				throw new Error(`Failed to fetch timeline: ${response.status}`);
			}
			const data = await response.json();
			// Filter out malformed events (missing type or timestamp)
			const newEvents: TimelineEvent[] = (data.events || []).filter(
				(e: TimelineEvent) => e.type && e.timestamp
			);

			// Detect new events that weren't in the previous list
			if (events.length > 0 && newEvents.length > previousEventCount) {
				const existingKeys = new Set(events.map(getEventKey));
				const newKeys = new Set<string>();

				for (const event of newEvents) {
					const key = getEventKey(event);
					if (!existingKeys.has(key)) {
						newKeys.add(key);
					}
				}

				// Mark new events for animation, clear after animation completes
				if (newKeys.size > 0) {
					newEventIds = newKeys;
					setTimeout(() => {
						newEventIds = new Set();
					}, 600); // Clear after animation
				}
			}

			previousEventCount = newEvents.length;
			events = newEvents;
			error = null;
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function handleRollback(event: TimelineEvent) {
		if (onRollback) {
			onRollback(event);
		}
	}

	function toggleEventExpand(idx: number) {
		expandedEventIdx = expandedEventIdx === idx ? null : idx;
	}

	onMount(() => {
		fetchTimeline();
		if (pollInterval > 0) {
			pollTimer = setInterval(fetchTimeline, pollInterval);
		}
	});

	onDestroy(() => {
		if (pollTimer) {
			clearInterval(pollTimer);
		}
	});
</script>

{#if events.length > 0}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative {className}"
		onmouseenter={() => (isExpanded = true)}
		onmouseleave={() => {
			isExpanded = false;
			expandedEventIdx = null;
		}}
	>
		{#if isExpanded}
			<!-- Expanded timeline view - pops up above input with high z-index -->
			<!-- Height expands when cards are expanded (expandedEventIdx !== null) -->
			<!-- Use calc to subtract approximate header/input heights from viewport -->
			<div
				class="absolute bottom-0 left-0 right-0 overflow-y-auto rounded-lg z-50"
				style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.30 0.02 250); box-shadow: 0 -4px 20px oklch(0 0 0 / 0.5); max-height: {expandedEventIdx !== null ? 'calc(100vh - 12rem)' : '32rem'};"
				transition:slide={{ duration: 200, easing: cubicOut }}
			>
				<div class="p-2 flex flex-col-reverse gap-1">
					{#each filteredEvents as event, idx (event.timestamp + idx)}
						{@const style = getEventStyle(event)}
						<div
							class="rounded-md cursor-pointer transition-all hover:scale-[1.01]"
							style="background: {style.bg}; border: 1px solid {style.border};"
							transition:fly={{ y: 20, duration: 150, delay: idx * 30, easing: cubicOut }}
						>
							<!-- Event header -->
							<button
								class="w-full px-3 py-1.5 flex items-center justify-between text-left"
								onclick={() => toggleEventExpand(idx)}
							>
								<div class="flex items-center gap-2">
									<span class="text-sm">{style.icon}</span>
									<span
										class="font-mono text-xs font-medium {idx === 0 && isGenerating ? 'shimmer-text-fast' : ''}"
										style="color: {style.text};"
									>
										{getEventLabel(event)}
									</span>
									{#if event.git_sha}
										<span
											class="px-1 py-0.5 rounded text-[9px] font-mono"
											style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);"
										>
											{event.git_sha}
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<span class="font-mono text-[10px]" style="color: oklch(0.50 0.02 250);">
										{formatTime(event.timestamp)}
									</span>
									{#if event.git_sha && onRollback}
										<button
											class="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors hover:opacity-80"
											style="background: oklch(0.35 0.10 200); color: oklch(0.85 0.10 200);"
											onclick={(e) => { e.stopPropagation(); handleRollback(event); }}
											title="Rollback to this point"
										>
											rollback
										</button>
									{/if}
									<svg
										class="w-3 h-3 transition-transform {expandedEventIdx === idx
											? 'rotate-180'
											: ''}"
										style="color: oklch(0.50 0.02 250);"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
									</svg>
								</div>
							</button>

							<!-- Expanded details -->
							{#if expandedEventIdx === idx}
								{@const eventKey = getEventKey(event)}
								<div
									class="px-3 pb-2 pt-1"
									style="border-top: 1px solid oklch(0.30 0.02 250 / 0.3);"
									transition:slide={{ duration: 150 }}
									onclick={(e) => e.stopPropagation()}
								>
									{#if event.type === 'tasks' && event.data && Array.isArray(event.data)}
										<!-- Rich Suggested Tasks UI -->
										{@const tasksWithState = getTasksWithState(event, eventKey)}
										{@const selectedCount = getSelectedCount(eventKey)}
										<SuggestedTasksSection
											tasks={tasksWithState}
											{selectedCount}
											onToggleSelection={(taskKey) => toggleTaskSelection(eventKey, taskKey)}
											getTaskKey={getSuggestedTaskKey}
											onCreateTasks={onCreateTasks ? (tasks) => handleCreateTasks(eventKey, tasks) : undefined}
											onEditTask={(taskKey, edits) => editTask(eventKey, taskKey, edits)}
											onClearEdits={(taskKey) => clearTaskEdits(eventKey, taskKey)}
											isCreating={isCreatingTasks}
											{createResults}
											showFeedback={showCreateFeedback}
											onDismissFeedback={dismissFeedback}
											{availableProjects}
										/>
									{:else if event.type === 'complete' && event.data}
										<!-- Rich Completion Bundle UI -->
										{@const bundle = event.data}
										<div class="space-y-3">
											<!-- Summary Section -->
											{#if bundle.summary && bundle.summary.length > 0}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.55 0.02 250);">
														CHANGES MADE
													</div>
													<ul class="space-y-0.5">
														{#each bundle.summary as item}
															<li class="flex items-start gap-2 text-xs" style="color: oklch(0.75 0.02 250);">
																<span style="color: oklch(0.50 0.15 145);">•</span>
																<span>{item}</span>
															</li>
														{/each}
													</ul>
												</div>
											{/if}

											<!-- Quality Badges -->
											{#if bundle.quality}
												<div class="flex flex-wrap gap-2">
													{#if bundle.quality.tests}
														{@const testColor = bundle.quality.tests === 'passing' ? 'oklch(0.65 0.18 145)' : bundle.quality.tests === 'failing' ? 'oklch(0.65 0.18 25)' : 'oklch(0.55 0.02 250)'}
														<span class="px-2 py-0.5 rounded text-[10px] font-medium" style="background: oklch(0.20 0.03 250); color: {testColor};">
															Tests: {bundle.quality.tests}
														</span>
													{/if}
													{#if bundle.quality.build}
														{@const buildColor = bundle.quality.build === 'clean' ? 'oklch(0.65 0.18 145)' : bundle.quality.build === 'warnings' ? 'oklch(0.65 0.15 85)' : 'oklch(0.65 0.18 25)'}
														<span class="px-2 py-0.5 rounded text-[10px] font-medium" style="background: oklch(0.20 0.03 250); color: {buildColor};">
															Build: {bundle.quality.build}
														</span>
													{/if}
													{#if bundle.quality.preExisting}
														<span class="px-2 py-0.5 rounded text-[10px]" style="background: oklch(0.20 0.03 250); color: oklch(0.55 0.02 250);">
															ℹ️ {bundle.quality.preExisting}
														</span>
													{/if}
												</div>
											{/if}

											<!-- Human Actions -->
											{#if bundle.humanActions && bundle.humanActions.length > 0}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.65 0.12 30);">
														🧑 HUMAN ACTIONS REQUIRED ({bundle.humanActions.length})
													</div>
													<div class="space-y-1.5">
														{#each bundle.humanActions as action}
															<div class="p-2 rounded" style="background: oklch(0.18 0.04 30); border: 1px solid oklch(0.30 0.06 30);">
																<div class="font-medium text-xs" style="color: oklch(0.80 0.10 30);">{action.title}</div>
																{#if action.description}
																	<div class="text-[10px] mt-1 whitespace-pre-wrap" style="color: oklch(0.65 0.05 30);">
																		{action.description}
																	</div>
																{/if}
															</div>
														{/each}
													</div>
												</div>
											{/if}

											<!-- Suggested Tasks (from complete bundle) -->
											{#if bundle.suggestedTasks && bundle.suggestedTasks.length > 0}
												{@const tasksFromBundle = bundle.suggestedTasks.map((t: any, i: number) => ({ ...t, selected: false, edited: false }))}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.65 0.12 280);">
														📋 SUGGESTED FOLLOW-UP ({bundle.suggestedTasks.length})
													</div>
													<SuggestedTasksSection
														tasks={tasksFromBundle}
														selectedCount={0}
														onToggleSelection={(taskKey) => {}}
														getTaskKey={(t, i) => `${t.title}-${i}`}
														onCreateTasks={undefined}
														onEditTask={() => {}}
														onClearEdits={() => {}}
														isCreating={false}
														createResults={{ success: [], failed: [] }}
														showFeedback={false}
														onDismissFeedback={() => {}}
														availableProjects={[]}
													/>
												</div>
											{/if}

											<!-- Cross-Agent Intel -->
											{#if bundle.crossAgentIntel}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.55 0.02 250);">
														🔗 CROSS-AGENT INTEL
													</div>
													<div class="p-2 rounded space-y-2" style="background: oklch(0.15 0.01 250);">
														{#if bundle.crossAgentIntel.files && bundle.crossAgentIntel.files.length > 0}
															<div>
																<span class="text-[9px] font-medium" style="color: oklch(0.50 0.02 250);">Files:</span>
																<div class="flex flex-wrap gap-1 mt-0.5">
																	{#each bundle.crossAgentIntel.files as file}
																		<span class="px-1.5 py-0.5 rounded text-[9px] font-mono" style="background: oklch(0.20 0.02 250); color: oklch(0.65 0.02 250);">
																			{file.split('/').pop()}
																		</span>
																	{/each}
																</div>
															</div>
														{/if}
														{#if bundle.crossAgentIntel.patterns && bundle.crossAgentIntel.patterns.length > 0}
															<div>
																<span class="text-[9px] font-medium" style="color: oklch(0.50 0.02 250);">Patterns:</span>
																<ul class="mt-0.5">
																	{#each bundle.crossAgentIntel.patterns as pattern}
																		<li class="text-[10px]" style="color: oklch(0.60 0.02 250);">• {pattern}</li>
																	{/each}
																</ul>
															</div>
														{/if}
														{#if bundle.crossAgentIntel.gotchas && bundle.crossAgentIntel.gotchas.length > 0}
															<div>
																<span class="text-[9px] font-medium" style="color: oklch(0.55 0.10 40);">⚠️ Gotchas:</span>
																<ul class="mt-0.5">
																	{#each bundle.crossAgentIntel.gotchas as gotcha}
																		<li class="text-[10px]" style="color: oklch(0.65 0.08 40);">• {gotcha}</li>
																	{/each}
																</ul>
															</div>
														{/if}
													</div>
												</div>
											{/if}
										</div>
									{:else if (event.state === 'completed' || event.type === 'completed') && event.data}
										<!-- Rich Completed Signal UI -->
										{@const completedData = event.data}
										<div class="space-y-3">
											<!-- Outcome Badge -->
											{#if completedData.outcome}
												{@const isSuccess = completedData.outcome === 'success'}
												<div class="flex items-center gap-2">
													<span
														class="px-2.5 py-1 rounded-full text-xs font-semibold"
														style="background: {isSuccess ? 'oklch(0.30 0.12 145)' : 'oklch(0.30 0.12 25)'}; color: {isSuccess ? 'oklch(0.85 0.18 145)' : 'oklch(0.85 0.18 25)'};"
													>
														{isSuccess ? '✓ Task Completed Successfully' : `Completed: ${completedData.outcome}`}
													</span>
												</div>
											{/if}

											<!-- Summary Section -->
											{#if completedData.summary && completedData.summary.length > 0}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.55 0.02 250);">
														WHAT WAS DONE
													</div>
													<ul class="space-y-0.5">
														{#each completedData.summary as item}
															<li class="flex items-start gap-2 text-xs" style="color: oklch(0.75 0.02 250);">
																<span style="color: oklch(0.50 0.15 145);">✓</span>
																<span>{item}</span>
															</li>
														{/each}
													</ul>
												</div>
											{/if}

											<!-- Task ID if available -->
											{#if completedData.taskId || event.task_id}
												<div class="text-[10px]" style="color: oklch(0.50 0.02 250);">
													Task: <span class="font-mono">{completedData.taskId || event.task_id}</span>
												</div>
											{/if}
										</div>
									{:else if (event.state === 'review' || event.type === 'review') && hasRichSignalData(event)}
										<!-- Rich Review Signal Card -->
										{@const reviewSignal = {
											type: 'review',
											taskId: event.task_id || event.data?.taskId || '',
											taskTitle: event.data?.taskTitle || '',
											summary: event.data?.summary || [],
											approach: event.data?.approach || '',
											keyDecisions: event.data?.keyDecisions || [],
											filesModified: event.data?.filesModified || [],
											totalLinesAdded: event.data?.totalLinesAdded || 0,
											totalLinesRemoved: event.data?.totalLinesRemoved || 0,
											testsStatus: event.data?.testsStatus || 'none',
											buildStatus: event.data?.buildStatus || 'clean',
											reviewFocus: event.data?.reviewFocus || [],
											commits: event.data?.commits || []
										} as ReviewSignal}
										<ReviewSignalCard
											signal={reviewSignal}
											{onTaskClick}
											{onFileClick}
											{onDiffClick}
											{onApprove}
											{onRequestChanges}
											{onAskQuestion}
											submitting={actionSubmitting}
										/>
									{:else if event.state === 'review' || event.type === 'review'}
										<!-- Fallback Review state - show structured info -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.12 200);">
												<span>👁</span>
												<span class="font-medium">Ready for Review</span>
											</div>
											{#if event.task_id}
												<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
													Task: <span class="font-mono" style="color: oklch(0.75 0.02 250);">{event.task_id}</span>
												</div>
											{/if}
											<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
												Agent has completed work and is awaiting your review. Check the terminal for details.
											</div>
										</div>
									{:else if (event.state === 'working' || event.type === 'working') && hasRichSignalData(event)}
										<!-- Rich Working Signal Card -->
										{@const workingSignal = {
											type: 'working',
											taskId: event.task_id || event.data?.taskId || '',
											taskTitle: event.data?.taskTitle || '',
											taskDescription: event.data?.taskDescription || '',
											taskPriority: event.data?.taskPriority ?? 2,
											taskType: event.data?.taskType || 'task',
											approach: event.data?.approach || '',
											expectedFiles: event.data?.expectedFiles || [],
											estimatedScope: event.data?.estimatedScope || 'medium',
											baselineCommit: event.data?.baselineCommit || event.git_sha || '',
											baselineBranch: event.data?.baselineBranch || '',
											dependencies: event.data?.dependencies || [],
											blockers: event.data?.blockers
										} as WorkingSignal}
										<WorkingSignalCard
											signal={workingSignal}
											{onTaskClick}
											{onFileClick}
											onRollbackClick={onRollback ? (commit) => onRollback({ ...event, git_sha: commit }) : undefined}
										/>
									{:else if event.state === 'working' || event.type === 'working'}
										<!-- Fallback Working state - show task info -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.85 0.15 85);">
												<span>⚡</span>
												<span class="font-medium">Actively Working</span>
											</div>
											{#if event.task_id}
												<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
													Task: <span class="font-mono font-medium" style="color: oklch(0.80 0.12 85);">{event.task_id}</span>
												</div>
											{/if}
											{#if event.git_sha}
												<div class="text-[10px]" style="color: oklch(0.50 0.02 250);">
													Started from: <span class="font-mono">{event.git_sha}</span>
												</div>
											{/if}
										</div>
									{:else if (event.state === 'needs_input' || event.type === 'needs_input') && hasRichSignalData(event)}
										<!-- Rich Needs Input Signal Card -->
										{@const needsInputSignal = {
											type: 'needs_input',
											taskId: event.task_id || event.data?.taskId || '',
											taskTitle: event.data?.taskTitle || '',
											question: event.data?.question || '',
											questionType: event.data?.questionType || 'text',
											context: event.data?.context || '',
											relevantCode: event.data?.relevantCode,
											relevantFiles: event.data?.relevantFiles,
											options: event.data?.options,
											impact: event.data?.impact || '',
											blocking: event.data?.blocking || [],
											timeoutAction: event.data?.timeoutAction,
											timeoutMinutes: event.data?.timeoutMinutes
										} as NeedsInputSignal}
										<NeedsInputSignalCard
											signal={needsInputSignal}
											{onSelectOption}
											{onSubmitText}
											{onFileClick}
											{onTaskClick}
											submitting={actionSubmitting}
										/>
									{:else if event.state === 'needs_input' || event.type === 'needs_input'}
										<!-- Fallback Needs Input state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.15 310);">
												<span>❓</span>
												<span class="font-medium">Waiting for Input</span>
											</div>
											<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
												Agent has a question and is waiting for your response. Check the terminal or use the Quick Answer buttons if available.
											</div>
										</div>
									{:else if event.state === 'idle' || event.type === 'idle'}
										<!-- Idle state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.65 0.02 250);">
												<span>💤</span>
												<span class="font-medium">Session Idle</span>
											</div>
											<div class="text-[10px]" style="color: oklch(0.50 0.02 250);">
												Agent has finished work and is waiting. You can assign a new task or close the session.
											</div>
										</div>
									{:else if event.state === 'starting'}
										<!-- Starting state - expanded shows full title + session ID -->
										{@const startEventKey = getEventKey(event)}
										<div class="space-y-1.5">
											<!-- Full task title -->
											{#if event.data?.taskTitle}
												<div class="text-xs" style="color: oklch(0.70 0.02 250);">
													{event.data.taskTitle}
												</div>
											{/if}
											<!-- Session ID (abbreviated, click to copy full) -->
											{#if event.data?.sessionId}
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class="text-[10px] font-mono cursor-pointer hover:brightness-125 transition-all inline-flex items-center gap-1"
													style="color: oklch(0.50 0.02 250);"
													onclick={() => copyToClipboard(event.data.sessionId, `${startEventKey}-session`)}
													title="Click to copy full session ID: {event.data.sessionId}"
												>
													<span>📋</span>
													<span style="color: oklch(0.60 0.08 200);">{event.data.sessionId.slice(0, 8)}...</span>
													{#if copiedField === `${startEventKey}-session`}
														<span class="text-[9px] px-1 py-0.5 rounded animate-pulse" style="background: oklch(0.35 0.15 145); color: oklch(0.90 0.15 145);">✓</span>
													{/if}
												</div>
											{/if}
											{#if !event.data?.taskTitle && !event.data?.sessionId}
												<div class="text-[10px]" style="color: oklch(0.50 0.02 250);">
													Agent initializing...
												</div>
											{/if}
										</div>
									{:else if event.state === 'compacting'}
										<!-- Compacting state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.10 50);">
												<span>📦</span>
												<span class="font-medium">Compacting Context</span>
											</div>
											<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
												Agent is summarizing conversation to free up context space.
											</div>
										</div>
									{:else if (event.state === 'completing' || event.type === 'completing') && hasRichSignalData(event)}
										<!-- Rich Completing Signal Card -->
										{@const completingSignal = {
											type: 'completing',
											taskId: event.task_id || event.data?.taskId || '',
											taskTitle: event.data?.taskTitle || '',
											currentStep: event.data?.currentStep || 'verifying',
											stepsCompleted: event.data?.stepsCompleted || [],
											stepsRemaining: event.data?.stepsRemaining || [],
											progress: event.data?.progress || 0,
											stepDescription: event.data?.stepDescription || '',
											stepStartedAt: event.data?.stepStartedAt || ''
										} as CompletingSignal}
										<CompletingSignalCard signal={completingSignal} />
									{:else if event.state === 'completing' || event.type === 'completing'}
										<!-- Fallback Completing state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.75 0.12 145);">
												<span>⏳</span>
												<span class="font-medium">Completing Task</span>
											</div>
											{#if event.task_id}
												<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
													Task: <span class="font-mono" style="color: oklch(0.75 0.02 250);">{event.task_id}</span>
												</div>
											{/if}
											<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
												Agent is running completion steps (commit, close, release, announce).
											</div>
										</div>
									{:else if event.state === 'auto_proceed'}
										<!-- Auto-proceed state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.18 145);">
												<span>🚀</span>
												<span class="font-medium">Auto-Proceeding</span>
											</div>
											{#if event.task_id}
												<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
													Task: <span class="font-mono" style="color: oklch(0.75 0.02 250);">{event.task_id}</span>
												</div>
											{/if}
											<div class="text-[10px]" style="color: oklch(0.55 0.02 250);">
												Task completed. Session will auto-close and proceed to next task.
											</div>
										</div>
									{:else if event.type === 'action' && event.data}
										<!-- Action event - show action details -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.12 30);">
												<span>🎯</span>
												<span class="font-medium">Human Action Required</span>
											</div>
											{#if event.data.title}
												<div class="font-medium text-xs" style="color: oklch(0.85 0.10 30);">
													{event.data.title}
												</div>
											{/if}
											{#if event.data.description}
												<div class="text-[10px] whitespace-pre-wrap" style="color: oklch(0.65 0.05 30);">
													{event.data.description}
												</div>
											{/if}
										</div>
									{:else if event.type === 'user_input' && event.data}
										<!-- User Input event - show user's message (click to copy) -->
										<div class="space-y-2">
											{#if event.data.prompt}
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class="text-xs p-2 rounded-lg whitespace-pre-wrap cursor-pointer transition-all hover:brightness-110 active:scale-[0.99] relative"
													style="background: oklch(0.18 0.04 260); border-left: 3px solid oklch(0.55 0.15 260); color: oklch(0.80 0.05 260);"
													onclick={async () => {
														await navigator.clipboard.writeText(event.data.prompt);
														copiedEventKey = getEventKey(event);
														setTimeout(() => copiedEventKey = null, 1500);
													}}
													title="Click to copy"
												>
													{event.data.prompt}
													{#if copiedEventKey === getEventKey(event)}
														<span class="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded" style="background: oklch(0.35 0.15 145); color: oklch(0.90 0.15 145);">
															Copied!
														</span>
													{/if}
												</div>
											{/if}
										</div>
									{:else}
										<!-- Default JSON view for other event types -->
										<pre
											class="font-mono text-[9px] p-2 rounded overflow-x-auto"
											style="background: oklch(0.12 0.01 250); color: oklch(0.65 0.02 250); max-height: 120px;">{JSON.stringify(
												event,
												null,
												2
											)}</pre>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<!-- Collapsed view - stacked cards peeking above input -->
			<!-- stack-top: older events peek out above the newest (bottom) card -->
			<div class="stack stack-top h-10 w-full">
				{#each filteredEvents.slice(0, 3) as event, idx (getEventKey(event))}
					{@const style = getEventStyle(event)}
					{@const isNewest = idx === 0}
					{@const isNew = newEventIds.has(getEventKey(event))}
					<div
						class="card border rounded-lg w-full h-8 transition-all duration-300"
						class:animate-slide-in-top={isNew}
						style="background: {style.bg}; border-color: {style.border};"
					>
						{#if isNewest}
							<!-- Only show content on the front/newest card -->
							<div class="px-3 h-full flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="text-xs">{style.icon}</span>
									<span class="font-mono text-[11px] font-medium {isNewest && isGenerating ? 'shimmer-text-fast' : ''}" style="color: {style.text};">
										{getEventLabel(event)}
									</span>
									{#if event.git_sha}
										<span
											class="font-mono text-[9px]"
											style="color: oklch(0.50 0.02 250);"
										>
											{event.git_sha}
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<span class="font-mono text-[10px]" style="color: oklch(0.50 0.02 250);">
										{formatRelativeTime(event.timestamp)}
									</span>
									{#if filteredEvents.length > 1}
										<span
											class="font-mono text-[9px]"
											style="color: oklch(0.55 0.02 250);"
										>
											+{filteredEvents.length - 1}
										</span>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{:else if loading}
	<div class="px-3 py-1.5 rounded-md" style="background: oklch(0.22 0.01 250);">
		<span class="font-mono text-[10px]" style="color: oklch(0.45 0.02 250);">
			Loading timeline...
		</span>
	</div>
{/if}

<style>
	/* Animation for new events sliding in from top */
	@keyframes slide-in-top {
		0% {
			transform: translateY(-100%) scale(0.95);
			opacity: 0;
		}
		50% {
			opacity: 1;
		}
		100% {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}

	.animate-slide-in-top {
		animation: slide-in-top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	/* Existing cards shift down smoothly via transition-all */
</style>
