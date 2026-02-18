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
	import { workSessionsState, sendInput } from '$lib/stores/workSessions.svelte';
	import { throttledFetch } from '$lib/utils/requestThrottler';
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
		sessionName = '',
		maxEvents = 20,
		pollInterval = 5000,
		onRollback,
		onCreateTasks,
		onCreateAndStartTasks,
		onTaskClick,
		onFileClick,
		onDiffClick,
		onApprove,
		onRequestChanges,
		onAskQuestion,
		onSelectOption,
		onSubmitText,
		onCleanup,
		onComplete,
		onReview,
		onApplyRename,
		onApplyLabels,
		availableProjects = [],
		defaultProject = '',
		class: className = '',
		autoExpand = false,
		filters = {},
		/** Optional pre-loaded events (bypasses polling when provided) */
		initialEvents = undefined as TimelineEvent[] | undefined,
		/** Layout mode: 'popup' shows expanded on hover, 'inline' shows all events inline */
		layoutMode = 'popup' as 'popup' | 'inline'
	}: {
		/** Session name for polling (required unless initialEvents provided) */
		sessionName?: string;
		maxEvents?: number;
		pollInterval?: number;
		onRollback?: (event: TimelineEvent) => void;
		onCreateTasks?: (tasks: SuggestedTaskWithState[]) => Promise<{ success: any[]; failed: any[] }>;
		/** Callback when user wants to create tasks AND spawn agent sessions */
		onCreateAndStartTasks?: (tasks: SuggestedTaskWithState[]) => Promise<{ success: any[]; failed: any[] }>;
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
		/** Callback when user clicks Cleanup Session on completed signal */
		onCleanup?: () => void;
		/** Callback when user clicks Complete Task on review signal */
		onComplete?: () => void;
		/** Callback when user clicks Ready for Review on working signal */
		onReview?: () => void;
		/** Callback when user applies suggested rename */
		onApplyRename?: (taskId: string, newTitle: string) => void;
		/** Callback when user applies suggested labels */
		onApplyLabels?: (taskId: string, labels: string[]) => void;
		availableProjects?: string[];
		/** Default project for tasks without explicit project (from current session) */
		defaultProject?: string;
		class?: string;
		/** Auto-expand when completion or tasks event is latest */
		autoExpand?: boolean;
		/** Event filters */
		filters?: EventFilters;
		/** Optional pre-loaded events (bypasses polling when provided) */
		initialEvents?: TimelineEvent[];
		/** Layout mode: 'popup' shows expanded on hover, 'inline' shows all events inline */
		layoutMode?: 'popup' | 'inline';
	} = $props();

	let events = $state<TimelineEvent[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isExpanded = $state(false);
	let actionSubmitting = $state(false);
	let copiedEventKey = $state<string | null>(null);
	let copiedField = $state<string | null>(null);  // Track which field was copied (e.g., "sessionId-abc123")

	// Track answered questions: Map<eventKey, { answer: string, timestamp: string }>
	let answeredQuestions = $state<Map<string, { answer: string; label: string; timestamp: string }>>(new Map());

	// Track input field value for input-type questions
	let inputQuestionValue = $state<Map<string, string>>(new Map());

	// Derived: Check if there are unanswered questions in the timeline
	const hasUnansweredQuestion = $derived.by(() => {
		for (const event of filteredEvents) {
			if ((event.type === 'question' || event.state === 'question') && event.data?.options) {
				const eventKey = getEventKey(event);
				if (!answeredQuestions.has(eventKey)) {
					return true;
				}
			}
		}
		return false;
	});

	// Get the first unanswered question event (for notification purposes)
	const firstUnansweredQuestion = $derived.by(() => {
		for (const event of filteredEvents) {
			if ((event.type === 'question' || event.state === 'question')) {
				const eventKey = getEventKey(event);
				if (!answeredQuestions.has(eventKey)) {
					return event;
				}
			}
		}
		return null;
	});

	// Track which questions we've already played sound for
	let soundPlayedForQuestions = $state<Set<string>>(new Set());

	// Play sound when new unanswered question appears
	import { playNeedsInputSound } from '$lib/utils/soundEffects';

	$effect(() => {
		if (firstUnansweredQuestion) {
			const eventKey = getEventKey(firstUnansweredQuestion);
			if (!soundPlayedForQuestions.has(eventKey)) {
				playNeedsInputSound();
				soundPlayedForQuestions.add(eventKey);
				soundPlayedForQuestions = new Set(soundPlayedForQuestions); // trigger reactivity
			}
		}
	});

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

		// Hide 'completing' events when there's a 'completed' or 'complete' event for the same task
		// The completed/complete event is the final state and contains all the relevant info
		const completedTaskIds = new Set(
			result
				.filter((e) => e.type === 'completed' || e.state === 'completed' || e.type === 'complete')
				.map((e) => e.task_id)
		);
		result = result.filter((e) => {
			// Check both e.type and e.state since completing signals can come in either format
			if ((e.type === 'completing' || e.state === 'completing') && e.task_id && completedTaskIds.has(e.task_id)) {
				return false; // Hide completing events for completed tasks
			}
			return true;
		});

		// Hide 'completed' (state signal) when there's a 'complete' (data signal) for the same task
		// within 60 seconds. The 'complete' signal has rich data; 'completed' is redundant.
		const completeEvents = result.filter((e) => e.type === 'complete');
		const completeTaskTimestamps = new Map<string, number>();
		for (const e of completeEvents) {
			if (e.task_id) {
				completeTaskTimestamps.set(e.task_id, new Date(e.timestamp).getTime());
			}
		}
		result = result.filter((e) => {
			if (e.type === 'completed' && e.task_id) {
				const completeTime = completeTaskTimestamps.get(e.task_id);
				if (completeTime) {
					const completedTime = new Date(e.timestamp).getTime();
					const timeDiff = Math.abs(completedTime - completeTime);
					// Hide if within 60 seconds of the 'complete' data signal
					if (timeDiff < 60000) {
						return false;
					}
				}
			}
			return true;
		});

		// Hide standalone 'tasks' events when there's a 'complete' event that already has suggestedTasks
		// This prevents duplicate display of suggested tasks (once in 'complete' bundle, once standalone)
		const completeEventsWithTasks = result.filter(
			(e) => e.type === 'complete' && e.data?.suggestedTasks && e.data.suggestedTasks.length > 0
		);
		if (completeEventsWithTasks.length > 0) {
			result = result.filter((e) => e.type !== 'tasks');
		}

		// Deduplicate user_input when ide_input exists for the same input
		// When IDE sends input via tmux, BOTH ide_input (from API) and user_input
		// (from Claude Code's UserPromptSubmit hook) are created. Prefer ide_input.
		const ideInputs = result.filter((e) => e.type === 'ide_input');
		if (ideInputs.length > 0) {
			// Build a map of input text → timestamp for ide_input events
			const ideInputMap = new Map<string, number>();
			for (const e of ideInputs) {
				const inputText = e.data?.input as string;
				if (inputText) {
					ideInputMap.set(inputText, new Date(e.timestamp).getTime());
				}
			}
			// Filter out user_input events that match an ide_input within 30 seconds
			result = result.filter((e) => {
				if (e.type !== 'user_input') return true;
				const promptText = e.data?.prompt as string;
				if (!promptText) return true;
				const ideTime = ideInputMap.get(promptText);
				if (!ideTime) return true;
				const userInputTime = new Date(e.timestamp).getTime();
				const timeDiff = Math.abs(userInputTime - ideTime);
				// Hide user_input if ide_input exists within 30 seconds
				return timeDiff > 30000;
			});
		}

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

			// For state signals, the actual state is in event.state, not event.type
			// event.type is always "state" for state signals
			const currentState = current.state ?? current.type;
			const prevState = prev?.state ?? prev?.type ?? null;

			// Check if this is a duplicate/update of a previous event
			// Merge if: same state AND same task_id AND state is one that updates frequently
			// Include 'completed' to prevent duplicate "Task completed" entries when hook fires multiple times
			const mergableStates = ['completing', 'compacting', 'completed'];
			const shouldMerge = prev &&
				current.task_id === prev.task_id &&
				mergableStates.includes(currentState || '') &&
				mergableStates.includes(prevState || '');

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

	let expandedEventIdx = $state<number | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// Track new events for entrance animation
	let newEventIds = $state<Set<string>>(new Set());
	let previousEventCount = $state(0);

	// Track which completion event we've already auto-expanded for
	// This prevents re-expanding on every 5-second poll when state is 'completed'
	let autoExpandedForEventKey = $state<string | null>(null);

	// Auto-expand when latest event is completion or tasks and autoExpand is enabled
	// Only auto-expand ONCE per completion event - not on every 5-second poll refresh
	$effect(() => {
		if (autoExpand && filteredEvents.length > 0) {
			const latestEvent = filteredEvents[0];
			// Check both new format (type=completed) and legacy (state=completed)
			const isCompletion = latestEvent?.type === 'complete' ||
				latestEvent?.type === 'completed' ||
				latestEvent?.type === 'tasks' ||
				latestEvent?.state === 'completed';
			if (isCompletion) {
				const eventKey = getEventKey(latestEvent);
				// Only auto-expand if this is a NEW completion event we haven't expanded for yet
				if (eventKey !== autoExpandedForEventKey) {
					autoExpandedForEventKey = eventKey;
					isExpanded = true;
					// Also expand the completion event details so users see full debrief immediately
					// (not just the collapsed label that requires clicking to expand)
					expandedEventIdx = 0;
				}
			}
		}
	});

	// State for suggested tasks management (per-event)
	// Key: event timestamp+idx, Value: map of task key -> selection/edit state
	let tasksStateByEvent = $state<Map<string, Map<string, { selected: boolean; edited: boolean; edits?: any }>>>(new Map());

	// Map of normalized task title -> task ID for detecting already-created suggested tasks
	let existingTaskTitles = $state<Map<string, string>>(new Map());

	// Fetch existing task titles from SQUAD for "already created" detection
	async function fetchExistingTaskTitles() {
		try {
			// Fetch all tasks (high limit to capture recent tasks)
			const response = await fetch('/api/tasks?limit=5000');
			if (response.ok) {
				const data = await response.json();
				const tasks = data.tasks || [];
				const titleMap = new Map<string, string>();
				for (const task of tasks) {
					if (task.title && task.id) {
						const normalizedTitle = task.title.toLowerCase().trim();
						titleMap.set(normalizedTitle, task.id);
					}
				}
				existingTaskTitles = titleMap;
			}
		} catch (error) {
			console.error('Failed to fetch existing task titles:', error);
		}
	}
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

			// Check if this task already exists in SQUAD (by normalized title)
			const normalizedTitle = task.title?.toLowerCase().trim();
			const existingTaskId = normalizedTitle ? existingTaskTitles.get(normalizedTitle) : undefined;
			const alreadyCreated = !!existingTaskId;

			return {
				...task,
				selected: state.selected,
				edited: state.edited,
				edits: state.edits,
				alreadyCreated,
				taskId: existingTaskId
			};
		});
	}

	// Get tasks with state for a complete bundle's suggestedTasks
	function getCompleteBundleTasksWithState(suggestedTasks: SuggestedTask[], eventKey: string): SuggestedTaskWithState[] {
		if (!suggestedTasks || suggestedTasks.length === 0) return [];

		let eventTasksState = tasksStateByEvent.get(eventKey);
		if (!eventTasksState) {
			eventTasksState = new Map();
			tasksStateByEvent.set(eventKey, eventTasksState);
		}

		return suggestedTasks.map((task: SuggestedTask, idx: number) => {
			const taskKey = getSuggestedTaskKey(task, idx);
			const state = eventTasksState!.get(taskKey) || { selected: false, edited: false };

			// Check if this task already exists in SQUAD (by normalized title)
			const normalizedTitle = task.title?.toLowerCase().trim();
			const existingTaskId = normalizedTitle ? existingTaskTitles.get(normalizedTitle) : undefined;
			const alreadyCreated = !!existingTaskId;

			return {
				...task,
				selected: state.selected,
				edited: state.edited,
				edits: state.edits,
				alreadyCreated,
				taskId: existingTaskId
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

			// Clear selection for successfully created tasks and update existingTaskTitles
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

				// Update existingTaskTitles with newly created tasks so they show as "already created"
				const updatedTitles = new Map(existingTaskTitles);
				for (const success of results.success) {
					if (success.title && success.taskId) {
						const normalizedTitle = success.title.toLowerCase().trim();
						updatedTitles.set(normalizedTitle, success.taskId);
					}
				}
				existingTaskTitles = updatedTitles;
			}
		} catch (err: any) {
			createResults = { success: [], failed: [{ title: 'Error', error: err.message }] };
			showCreateFeedback = true;
		} finally {
			isCreatingTasks = false;
		}
	}

	// Handle task creation AND start agent sessions
	async function handleCreateAndStartTasks(eventKey: string, tasks: SuggestedTaskWithState[]) {
		if (!onCreateAndStartTasks) return;

		isCreatingTasks = true;
		showCreateFeedback = false;

		try {
			const results = await onCreateAndStartTasks(tasks);
			createResults = results;
			showCreateFeedback = true;

			// Clear selection for successfully created tasks and update existingTaskTitles
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

				// Update existingTaskTitles with newly created tasks so they show as "already created"
				const updatedTitles = new Map(existingTaskTitles);
				for (const success of results.success) {
					if (success.title && success.taskId) {
						const normalizedTitle = success.title.toLowerCase().trim();
						updatedTitles.set(normalizedTitle, success.taskId);
					}
				}
				existingTaskTitles = updatedTitles;
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
	const stateStyles: Record<string, { icon: string; bg: string; text: string; border: string; accent?: string }> = {
		user_input: {
			icon: '💬',
			bg: 'oklch(0.22 0.08 260)',
			text: 'oklch(0.85 0.12 260)',
			border: 'oklch(0.40 0.10 260)'
		},
		ide_input: {
			icon: '🖱️',
			bg: 'oklch(0.22 0.10 180)',
			text: 'oklch(0.88 0.12 180)',
			border: 'oklch(0.42 0.12 180)'
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
		idle: {
			icon: '💤',
			bg: 'oklch(0.20 0.01 250)',
			text: 'oklch(0.65 0.02 250)',
			border: 'oklch(0.30 0.02 250)'
		},
		paused: {
			icon: '⏸',
			bg: 'oklch(0.22 0.08 300)',
			text: 'oklch(0.80 0.15 300)',
			border: 'oklch(0.40 0.10 300)'
		}
	};

	// Type-based styling (for events without state)
	const typeStyles: Record<string, { icon: string; bg: string; text: string; border: string; accent?: string }> = {
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

	const defaultStyle: { icon: string; bg: string; text: string; border: string; accent?: string } = {
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
		const maxLen = 500;
		const truncate = (s: string) => s.length > maxLen ? s.slice(0, maxLen) + '…' : s;

		// For user_input events, show truncated prompt preview
		// Include image indicator if hasImage flag is set
		if (event.type === 'user_input') {
			const hasImage = event.data?.hasImage === true;
			const prompt = event.data?.prompt as string || '';
			const promptText = prompt.trim();

			if (hasImage) {
				// Check if there's meaningful text beyond just the image path
				// Remove common image path patterns to see what text remains
				const textWithoutPaths = promptText
					.replace(/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)/gi, '')
					.replace(/\s+/g, ' ')
					.trim();

				if (textWithoutPaths.length > 0) {
					return `📷 ${truncate(textWithoutPaths)}`;
				} else {
					return '📷 Image attached';
				}
			}

			if (promptText) {
				return truncate(promptText);
			}

			return 'User message';
		}

		// For ide_input events, show the input that was sent
		if (event.type === 'ide_input') {
			const input = event.data?.input as string || '';
			const isCommand = event.data?.isCommand === true;
			if (input) {
				return isCommand ? `🖱️ ${truncate(input)}` : truncate(input);
			}
			return 'IDE input';
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
			// Handle summary as string or array
			if (event.data.summary) {
				if (typeof event.data.summary === 'string') {
					return truncate(event.data.summary);
				}
				if (Array.isArray(event.data.summary) && event.data.summary.length > 0) {
					return truncate(event.data.summary[0] as string);
				}
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

		// For question events, show the question text
		if (signalType === 'question' && event.data) {
			if (event.data.question) {
				return truncate(event.data.question as string);
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

		// For paused events, show reason or task title
		if (signalType === 'paused' && event.data) {
			if (event.data.reason) {
				return truncate(event.data.reason as string);
			}
			if (event.data.taskTitle) {
				return truncate(event.data.taskTitle as string);
			}
			const taskId = event.data.taskId || event.task_id || '';
			if (taskId) {
				return `Paused ${taskId}`;
			}
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
			const tmuxName = sessionName.startsWith('squad-') ? sessionName : `squad-${sessionName}`;
			const response = await throttledFetch(`/api/sessions/${tmuxName}/timeline?limit=${maxEvents}`);
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
		// Fetch existing task titles for "already created" detection
		fetchExistingTaskTitles();

		// If initialEvents provided, use them directly (no polling)
		if (initialEvents) {
			events = initialEvents;
			loading = false;
			return;
		}

		// Otherwise, fetch from API and set up polling
		fetchTimeline();
		if (pollInterval > 0) {
			pollTimer = setInterval(fetchTimeline, pollInterval);
		}
	});

	// React to changes in initialEvents prop (for external state updates)
	$effect(() => {
		if (initialEvents) {
			events = initialEvents;
			loading = false;
		}
	});

	onDestroy(() => {
		if (pollTimer) {
			clearInterval(pollTimer);
		}
	});
</script>

{#if events.length > 0}
	{#if layoutMode === 'inline'}
		<!-- Inline layout: always expanded, no hover interaction -->
		<div class="space-y-2 {className}">
			{#each filteredEvents as event, idx (event.timestamp + '-' + idx)}
				{@const style = getEventStyle(event)}
				{@const isQuestionEvent = event.type === 'question' || event.state === 'question'}
				{@const isUnansweredQuestion = isQuestionEvent && !answeredQuestions.has(getEventKey(event))}
				{@const eventKey = getEventKey(event)}
				<div
					class="rounded-lg transition-all"
					style="background: {style.bg}; border: 1px solid {style.border}; border-left: 3px solid {style.accent || style.border};"
				>
					<!-- Event header (always visible) -->
					<button
						class="w-full px-3 py-2 flex items-center justify-between text-left"
						onclick={() => toggleEventExpand(idx)}
					>
						<div class="flex items-center gap-2 flex-1 min-w-0">
							<span class="text-sm flex-shrink-0">{style.icon}</span>
							{#if isUnansweredQuestion}
								<span
									class="px-1.5 py-0.5 rounded text-[9px] font-bold animate-pulse flex-shrink-0"
									style="background: oklch(0.45 0.15 280); color: oklch(0.95 0.05 280);"
								>
									NEEDS ANSWER
								</span>
							{/if}
							<span
								class="font-mono text-xs font-medium truncate min-w-0"
								style="color: {style.text};"
							>
								{getEventLabel(event)}
							</span>
							{#if event.git_sha}
								<span
									class="px-1 py-0.5 rounded text-[9px] font-mono bg-base-300 text-base-content/60 flex-shrink-0"
								>
									{event.git_sha.slice(0, 7)}
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							{#if event.data?.agent_name || event.data?.agentName}
								<span class="text-[10px] font-mono text-base-content/60">
									{event.data.agent_name || event.data.agentName}
								</span>
							{/if}
							<span class="font-mono text-[10px] text-base-content/50">
								{formatTime(event.timestamp)}
							</span>
							{#if event.git_sha && onRollback}
								<button
									class="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors btn-ghost hover:btn-info"
									onclick={(e) => { e.stopPropagation(); handleRollback(event); }}
									title="Rollback to this point"
								>
									rollback
								</button>
							{/if}
							<svg
								class="w-3 h-3 transition-transform text-base-content/50 {expandedEventIdx === idx ? 'rotate-180' : ''}"
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
						<div class="px-3 pb-3 pt-1 border-t border-base-300">
							<!-- Rich signal content based on type -->
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
									onCreateAndStartTasks={onCreateAndStartTasks ? (tasks) => handleCreateAndStartTasks(eventKey, tasks) : undefined}
									onEditTask={(taskKey, edits) => editTask(eventKey, taskKey, edits)}
									onClearEdits={(taskKey) => clearTaskEdits(eventKey, taskKey)}
									isCreating={isCreatingTasks}
									{createResults}
									showFeedback={showCreateFeedback}
									onDismissFeedback={dismissFeedback}
									{availableProjects}
									{defaultProject}
									{onTaskClick}
								/>
							{:else if event.type === 'complete' && event.data}
								<!-- Rich Completion Bundle UI -->
								{@const bundle = event.data}
								{@const bundleSummary = Array.isArray(bundle.summary) ? bundle.summary : (typeof bundle.summary === 'string' ? [bundle.summary] : [])}
								{@const bundleQuality = bundle.quality || bundle.qualityChecks}
								<div class="space-y-3">
									<!-- Summary Section -->
									{#if bundleSummary.length > 0}
										<div>
											<div class="text-[10px] font-medium mb-1 text-base-content/50">CHANGES MADE</div>
											<ul class="space-y-0.5">
												{#each bundleSummary as item}
													<li class="flex items-start gap-2 text-xs text-base-content/70">
														<span class="text-success">•</span>
														<span>{item}</span>
													</li>
												{/each}
											</ul>
										</div>
									{/if}

									<!-- Quality Badges -->
									{#if bundleQuality}
										<div class="flex flex-wrap gap-2">
											{#if bundleQuality.tests}
												<span class="badge badge-xs {bundleQuality.tests === 'passing' ? 'badge-success' : bundleQuality.tests === 'failing' ? 'badge-error' : 'badge-ghost'}">
													Tests: {bundleQuality.tests}
												</span>
											{/if}
											{#if bundleQuality.build}
												<span class="badge badge-xs {bundleQuality.build === 'clean' ? 'badge-success' : bundleQuality.build === 'warnings' ? 'badge-warning' : 'badge-error'}">
													Build: {bundleQuality.build}
												</span>
											{/if}
											{#if bundleQuality.preExisting}
												<span class="badge badge-xs badge-ghost">ℹ️ {bundleQuality.preExisting}</span>
											{/if}
										</div>
									{/if}

									<!-- Human Actions -->
									{#if bundle.humanActions && bundle.humanActions.length > 0}
										<div>
											<div class="text-[10px] font-medium mb-1 text-warning">🧑 HUMAN ACTIONS REQUIRED ({bundle.humanActions.length})</div>
											<div class="space-y-1.5">
												{#each bundle.humanActions as humanAction}
													{@const actionTitle = humanAction.title || humanAction.action}
													{@const actionDesc = humanAction.description || humanAction.context}
													{@const actionPriority = humanAction.priority}
													<div class="p-2 rounded bg-warning/10 border border-warning/30">
														{#if actionTitle}
															<div class="flex items-center gap-2">
																<div class="font-medium text-xs text-warning flex-1">{actionTitle}</div>
																{#if actionPriority}
																	<span class="text-[9px] px-1.5 py-0.5 rounded uppercase font-medium"
																		style="background: {actionPriority === 'high' ? 'oklch(0.50 0.15 30 / 0.3)' : 'oklch(0.50 0.10 85 / 0.3)'}; color: {actionPriority === 'high' ? 'oklch(0.75 0.15 30)' : 'oklch(0.75 0.10 85)'};">
																		{actionPriority}
																	</span>
																{/if}
															</div>
														{/if}
														{#if actionDesc}
															<div class="text-[10px] mt-1 whitespace-pre-wrap text-warning/70">{actionDesc}</div>
														{/if}
														{#if humanAction.items && humanAction.items.length > 0}
															<ul class="mt-1 space-y-0.5">
																{#each humanAction.items as item}
																	<li class="flex items-start gap-1.5 text-[10px] text-warning/80">
																		<span class="mt-0.5">☐</span>
																		<span class="whitespace-pre-wrap">{item}</span>
																	</li>
																{/each}
															</ul>
														{/if}
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Suggested Tasks (from complete bundle) -->
									{#if bundle.suggestedTasks && bundle.suggestedTasks.length > 0}
										{@const bundleTasksWithState = getCompleteBundleTasksWithState(bundle.suggestedTasks, eventKey)}
										{@const bundleSelectedCount = getSelectedCount(eventKey)}
										<div>
											<div class="text-[10px] font-medium mb-1 text-info">📋 SUGGESTED FOLLOW-UP ({bundle.suggestedTasks.length})</div>
											<SuggestedTasksSection
												tasks={bundleTasksWithState}
												selectedCount={bundleSelectedCount}
												onToggleSelection={(taskKey) => toggleTaskSelection(eventKey, taskKey)}
												getTaskKey={getSuggestedTaskKey}
												onCreateTasks={onCreateTasks ? (tasks) => handleCreateTasks(eventKey, tasks) : undefined}
												onCreateAndStartTasks={onCreateAndStartTasks ? (tasks) => handleCreateAndStartTasks(eventKey, tasks) : undefined}
												onEditTask={(taskKey, edits) => editTask(eventKey, taskKey, edits)}
												onClearEdits={(taskKey) => clearTaskEdits(eventKey, taskKey)}
												isCreating={isCreatingTasks}
												{createResults}
												showFeedback={showCreateFeedback}
												onDismissFeedback={dismissFeedback}
												{availableProjects}
												{defaultProject}
												{onTaskClick}
											/>
										</div>
									{/if}

									<!-- Cross-Agent Intel -->
									{#if bundle.crossAgentIntel}
										<div>
											<div class="text-[10px] font-medium mb-1 text-base-content/50">🔗 CROSS-AGENT INTEL</div>
											<div class="p-2 rounded bg-base-300 space-y-2">
												{#if bundle.crossAgentIntel.files && bundle.crossAgentIntel.files.length > 0}
													<div>
														<span class="text-[9px] font-medium text-base-content/50">Files:</span>
														<div class="flex flex-wrap gap-1 mt-0.5">
															{#each bundle.crossAgentIntel.files as file}
																<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-base-200 text-base-content/60">
																	{file.split('/').pop()}
																</span>
															{/each}
														</div>
													</div>
												{/if}
												{#if bundle.crossAgentIntel.patterns && bundle.crossAgentIntel.patterns.length > 0}
													<div>
														<span class="text-[9px] font-medium text-base-content/50">Patterns:</span>
														<ul class="mt-0.5">
															{#each bundle.crossAgentIntel.patterns as pattern}
																<li class="text-[10px] text-base-content/60">• {pattern}</li>
															{/each}
														</ul>
													</div>
												{/if}
												{#if bundle.crossAgentIntel.gotchas && bundle.crossAgentIntel.gotchas.length > 0}
													<div>
														<span class="text-[9px] font-medium text-warning">⚠️ Gotchas:</span>
														<ul class="mt-0.5">
															{#each bundle.crossAgentIntel.gotchas as gotcha}
																<li class="text-[10px] text-warning/80">• {gotcha}</li>
															{/each}
														</ul>
													</div>
												{/if}
											</div>
										</div>
									{/if}

									<!-- AI Insights Section -->
									{#if bundle.riskLevel || bundle.suggestedRename || bundle.suggestedLabels?.length || bundle.breakingChanges?.length || bundle.documentationNeeds?.length}
										<div class="space-y-2">
											<div class="text-[10px] font-medium mb-1 text-secondary">🤖 AI INSIGHTS</div>

											<!-- Risk Level & Suggested Rename Row -->
											<div class="flex flex-wrap items-center gap-2">
												{#if bundle.riskLevel}
													<span class="badge badge-xs {bundle.riskLevel === 'low' ? 'badge-success' : bundle.riskLevel === 'medium' ? 'badge-warning' : 'badge-error'}">
														Risk: {bundle.riskLevel}
													</span>
												{/if}
												{#if bundle.suggestedRename}
													<div class="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/10 border border-secondary/30">
														<span class="text-[10px] text-secondary/70">Rename to:</span>
														<span class="text-[10px] font-medium text-secondary">{bundle.suggestedRename}</span>
														<button
															class="btn btn-xs btn-ghost text-secondary hover:bg-secondary/20"
															onclick={() => onApplyRename?.(bundle.taskId, bundle.suggestedRename)}
															title="Apply suggested rename"
														>
															Apply
														</button>
													</div>
												{/if}
											</div>

											<!-- Suggested Labels -->
											{#if bundle.suggestedLabels && bundle.suggestedLabels.length > 0}
												<div class="flex items-center gap-2">
													<span class="text-[9px] text-base-content/50">Labels:</span>
													<div class="flex flex-wrap gap-1">
														{#each bundle.suggestedLabels as label}
															<span class="badge badge-xs badge-outline">{label}</span>
														{/each}
													</div>
													<button
														class="btn btn-xs btn-ghost text-info hover:bg-info/20"
														onclick={() => onApplyLabels?.(bundle.taskId, bundle.suggestedLabels)}
														title="Apply suggested labels"
													>
														Apply
													</button>
												</div>
											{/if}

											<!-- Breaking Changes -->
											{#if bundle.breakingChanges && bundle.breakingChanges.length > 0}
												<div class="p-2 rounded bg-error/10 border border-error/30">
													<div class="text-[10px] font-medium text-error mb-1">⚠️ BREAKING CHANGES</div>
													<ul class="space-y-0.5">
														{#each bundle.breakingChanges as change}
															<li class="text-[10px] text-error/80">• {change}</li>
														{/each}
													</ul>
												</div>
											{/if}

											<!-- Documentation Needs -->
											{#if bundle.documentationNeeds && bundle.documentationNeeds.length > 0}
												<div class="p-2 rounded bg-info/10 border border-info/30">
													<div class="text-[10px] font-medium text-info mb-1">📚 DOCS TO UPDATE</div>
													<ul class="space-y-0.5">
														{#each bundle.documentationNeeds as doc}
															<li class="text-[10px] text-info/80">• {doc}</li>
														{/each}
													</ul>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{:else if (event.state === 'completed' || event.type === 'completed' || event.type === 'complete') && event.data}
								<!-- Rich Completed Signal UI -->
								{@const completedData = event.data}
								{@const completedSummary = Array.isArray(completedData.summary) ? completedData.summary : (typeof completedData.summary === 'string' ? [completedData.summary] : [])}
								<div class="space-y-3">
									<!-- Outcome Badge -->
									{#if completedData.outcome}
										{@const isSuccess = completedData.outcome === 'success'}
										<div class="flex items-center gap-2">
											<span class="badge {isSuccess ? 'badge-success' : 'badge-warning'}">
												{isSuccess ? '✓ Task Completed Successfully' : `Completed: ${completedData.outcome}`}
											</span>
										</div>
									{/if}

									<!-- Summary Section -->
									{#if completedSummary.length > 0}
										<div>
											<div class="text-[10px] font-medium mb-1 text-base-content/50">WHAT WAS DONE</div>
											<ul class="space-y-0.5">
												{#each completedSummary as item}
													<li class="flex items-start gap-2 text-xs text-base-content/70">
														<span class="text-success">✓</span>
														<span>{item}</span>
													</li>
												{/each}
											</ul>
										</div>
									{/if}

									<!-- Task ID if available -->
									{#if completedData.taskId || event.task_id}
										<div class="text-[10px] text-base-content/50">
											Task: <span class="font-mono">{completedData.taskId || event.task_id}</span>
										</div>
									{/if}

									<!-- Auto-proceed indicator or Cleanup button -->
									{#if completedData.completionMode === 'auto_proceed'}
										<div class="mt-2 pt-2 border-t border-base-300/50">
											<div class="flex items-center gap-2 text-xs text-success">
												<span>🚀</span>
												<span class="font-medium">AUTO PROCEED</span>
											</div>
											{#if completedData.nextTaskId}
												<div class="flex items-center gap-2 text-[10px] mt-1 text-info">
													<span class="loading loading-spinner loading-xs"></span>
													<span>Spawning:</span>
													<span class="font-mono font-medium">{completedData.nextTaskId}</span>
												</div>
											{/if}
										</div>
									{:else if onCleanup}
										<!-- Cleanup Session action button for completed signal -->
										<div class="mt-3 pt-2 border-t border-base-300/50">
											<button
												onclick={onCleanup}
												class="btn btn-xs btn-success btn-outline gap-1.5 text-[10px] font-medium"
											>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
													<path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.286a1.5 1.5 0 0 0 1.492-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clip-rule="evenodd" />
												</svg>
												Cleanup Session
											</button>
										</div>
									{/if}
								</div>
							{:else if (event.state === 'working' || event.type === 'working') && event.data}
								<WorkingSignalCard
									signal={event.data as WorkingSignal}
									projectName={defaultProject}
									onTaskClick={onTaskClick}
									onFileClick={onFileClick}
								/>
							{:else if (event.state === 'review' || event.type === 'review') && event.data}
								<ReviewSignalCard
									signal={event.data as ReviewSignal}
									projectName={defaultProject}
									onTaskClick={onTaskClick}
									onFileClick={onFileClick}
									onDiffClick={onDiffClick}
									onApprove={onApprove}
									onRequestChanges={onRequestChanges}
									onAskQuestion={onAskQuestion}
								/>
							{:else if (event.state === 'needs_input' || event.type === 'needs_input' || event.type === 'question') && event.data}
								<NeedsInputSignalCard
									signal={event.data as NeedsInputSignal}
									projectName={defaultProject}
									onSelectOption={onSelectOption}
									onSubmitText={onSubmitText}
								/>
							{:else if (event.state === 'completing' || event.type === 'completing') && event.data}
								<CompletingSignalCard
									signal={event.data as CompletingSignal}
									onTaskClick={onTaskClick}
								/>
							{:else if event.data}
								<!-- Fallback: show raw JSON for other events -->
								<div class="text-xs space-y-1">
									{#if event.data.taskTitle}
										<div class="font-medium text-base-content/80">{event.data.taskTitle}</div>
									{/if}
									{#if event.data.approach}
										<div class="text-base-content/60">{event.data.approach}</div>
									{/if}
									{#if event.data.summary}
									{@const summaryArray = Array.isArray(event.data.summary) ? event.data.summary : (typeof event.data.summary === 'string' ? [event.data.summary] : [])}
									{#if summaryArray.length > 0}
										<ul class="list-disc list-inside text-base-content/60 space-y-0.5">
											{#each summaryArray.slice(0, 3) as item}
												<li>{item}</li>
											{/each}
											{#if summaryArray.length > 3}
												<li class="opacity-60">+{summaryArray.length - 3} more...</li>
											{/if}
										</ul>
									{/if}
									{/if}
									{#if event.data.outcome}
										<div class="text-success">Outcome: {event.data.outcome}</div>
									{/if}
								</div>
							{/if}

							<!-- Session ID and copy button -->
							{#if event.session_id}
								<div class="mt-2 pt-2 border-t border-base-300/50 flex items-center justify-between">
									<span class="text-[9px] font-mono text-base-content/40 truncate max-w-[80%]" title={event.session_id}>
										Session: {event.session_id.slice(0, 20)}...
									</span>
									<button
										class="text-[9px] text-info hover:underline"
										onclick={() => copyToClipboard(event.session_id, `session-${eventKey}`)}
									>
										{copiedField === `session-${eventKey}` ? '✓ Copied' : 'Copy ID'}
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- Popup layout: hover to expand (original behavior) -->
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
				class="absolute bottom-0 left-0 right-0 overflow-y-auto rounded-lg z-5"
				style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.30 0.02 250); box-shadow: 0 -4px 20px oklch(0 0 0 / 0.5); max-height: {expandedEventIdx !== null ? 'calc(100vh - 12rem)' : '32rem'};"
				transition:slide={{ duration: 200, easing: cubicOut }}
			>
				<div class="p-2 flex flex-col-reverse gap-1">
					{#each filteredEvents as event, idx (event.timestamp + '-' + idx)}
						{@const style = getEventStyle(event)}
						{@const isQuestionEvent = event.type === 'question' || event.state === 'question'}
						{@const isUnansweredQuestion = isQuestionEvent && !answeredQuestions.has(getEventKey(event))}
						<div
							class="rounded-md cursor-pointer transition-all hover:scale-[1.01] {isUnansweredQuestion ? 'animate-pulse ring-2 ring-offset-1' : ''}"
							style="background: {style.bg}; border: {isUnansweredQuestion ? '2px solid oklch(0.60 0.18 280)' : '1px solid ' + style.border}; {isUnansweredQuestion ? 'box-shadow: 0 0 12px oklch(0.55 0.15 280 / 0.4); --tw-ring-color: oklch(0.55 0.15 280); --tw-ring-offset-color: oklch(0.18 0.01 250);' : ''}"
							transition:fly={{ y: 20, duration: 150, delay: idx * 30, easing: cubicOut }}
						>
							<!-- Event header -->
							<button
								class="w-full px-3 py-1.5 flex items-center justify-between text-left"
								onclick={() => toggleEventExpand(idx)}
							>
								<div class="flex items-center gap-2 flex-1 min-w-0">
									<span class="text-sm flex-shrink-0">{style.icon}</span>
									{#if isUnansweredQuestion}
										<span
											class="px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
											style="background: oklch(0.45 0.15 280); color: oklch(0.95 0.05 280);"
										>
											NEEDS ANSWER
										</span>
									{/if}
									<span
										class="font-mono text-xs font-medium truncate min-w-0 {idx === 0 && isGenerating ? 'shimmer-text-fast' : ''}"
										style={idx === 0 && isGenerating ? `--shimmer-text-color: ${style.text};` : `color: ${style.text};`}
									>
										{getEventLabel(event)}
									</span>
									{#if event.git_sha}
										<span
											class="mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono flex-shrink-0"
											style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);"
										>
											{event.git_sha}
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2 flex-shrink-0">
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
											onCreateAndStartTasks={onCreateAndStartTasks ? (tasks) => handleCreateAndStartTasks(eventKey, tasks) : undefined}
											onEditTask={(taskKey, edits) => editTask(eventKey, taskKey, edits)}
											onClearEdits={(taskKey) => clearTaskEdits(eventKey, taskKey)}
											isCreating={isCreatingTasks}
											{createResults}
											showFeedback={showCreateFeedback}
											onDismissFeedback={dismissFeedback}
											{availableProjects}
											{defaultProject}
											{onTaskClick}
										/>
									{:else if event.type === 'complete' && event.data}
										<!-- Rich Completion Bundle UI -->
										{@const bundle = event.data}
										{@const popupBundleSummary = Array.isArray(bundle.summary) ? bundle.summary : (typeof bundle.summary === 'string' ? [bundle.summary] : [])}
										{@const popupBundleQuality = bundle.quality || bundle.qualityChecks}
										<div class="space-y-3">
											<!-- Summary Section -->
											{#if popupBundleSummary.length > 0}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.55 0.02 250);">
														CHANGES MADE
													</div>
													<ul class="space-y-0.5">
														{#each popupBundleSummary as item}
															<li class="flex items-start gap-2 text-xs" style="color: oklch(0.75 0.02 250);">
																<span style="color: oklch(0.50 0.15 145);">•</span>
																<span>{item}</span>
															</li>
														{/each}
													</ul>
												</div>
											{/if}

											<!-- Quality Badges -->
											{#if popupBundleQuality}
												<div class="flex flex-wrap gap-2">
													{#if popupBundleQuality.tests}
														{@const testColor = popupBundleQuality.tests === 'passing' ? 'oklch(0.65 0.18 145)' : popupBundleQuality.tests === 'failing' ? 'oklch(0.65 0.18 25)' : 'oklch(0.55 0.02 250)'}
														<span class="px-2 py-0.5 rounded text-[10px] font-medium" style="background: oklch(0.20 0.03 250); color: {testColor};">
															Tests: {popupBundleQuality.tests}
														</span>
													{/if}
													{#if popupBundleQuality.build}
														{@const buildColor = popupBundleQuality.build === 'clean' ? 'oklch(0.65 0.18 145)' : popupBundleQuality.build === 'warnings' ? 'oklch(0.65 0.15 85)' : 'oklch(0.65 0.18 25)'}
														<span class="px-2 py-0.5 rounded text-[10px] font-medium" style="background: oklch(0.20 0.03 250); color: {buildColor};">
															Build: {popupBundleQuality.build}
														</span>
													{/if}
													{#if popupBundleQuality.preExisting}
														<span class="px-2 py-0.5 rounded text-[10px]" style="background: oklch(0.20 0.03 250); color: oklch(0.55 0.02 250);">
															ℹ️ {popupBundleQuality.preExisting}
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
														{#each bundle.humanActions as humanAction}
															{@const actionTitle = humanAction.title || humanAction.action}
															{@const actionDesc = humanAction.description || humanAction.context}
															{@const actionPriority = humanAction.priority}
															<div class="p-2 rounded" style="background: oklch(0.18 0.04 30); border: 1px solid oklch(0.30 0.06 30);">
																{#if actionTitle}
																	<div class="flex items-center gap-2">
																		<div class="font-medium text-xs flex-1" style="color: oklch(0.80 0.10 30);">{actionTitle}</div>
																		{#if actionPriority}
																			<span class="text-[9px] px-1.5 py-0.5 rounded uppercase font-medium"
																				style="background: {actionPriority === 'high' ? 'oklch(0.50 0.15 30 / 0.3)' : 'oklch(0.50 0.10 85 / 0.3)'}; color: {actionPriority === 'high' ? 'oklch(0.75 0.15 30)' : 'oklch(0.75 0.10 85)'};">
																				{actionPriority}
																			</span>
																		{/if}
																	</div>
																{/if}
																{#if actionDesc}
																	<div class="text-[10px] mt-1 whitespace-pre-wrap" style="color: oklch(0.65 0.05 30);">
																		{actionDesc}
																	</div>
																{/if}
																{#if humanAction.items && humanAction.items.length > 0}
																	<ul class="mt-1 space-y-0.5">
																		{#each humanAction.items as item}
																			<li class="flex items-start gap-1.5 text-[10px]" style="color: oklch(0.70 0.08 30);">
																				<span class="mt-0.5">☐</span>
																				<span class="whitespace-pre-wrap">{item}</span>
																			</li>
																		{/each}
																	</ul>
																{/if}
															</div>
														{/each}
													</div>
												</div>
											{/if}

											<!-- Suggested Tasks (from complete bundle) -->
											{#if bundle.suggestedTasks && bundle.suggestedTasks.length > 0}
												{@const bundleTasksWithState = getCompleteBundleTasksWithState(bundle.suggestedTasks, eventKey)}
												{@const bundleSelectedCount = getSelectedCount(eventKey)}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.65 0.12 280);">
														📋 SUGGESTED FOLLOW-UP ({bundle.suggestedTasks.length})
													</div>
													<SuggestedTasksSection
														tasks={bundleTasksWithState}
														selectedCount={bundleSelectedCount}
														onToggleSelection={(taskKey) => toggleTaskSelection(eventKey, taskKey)}
														getTaskKey={getSuggestedTaskKey}
														onCreateTasks={onCreateTasks ? (tasks) => handleCreateTasks(eventKey, tasks) : undefined}
														onCreateAndStartTasks={onCreateAndStartTasks ? (tasks) => handleCreateAndStartTasks(eventKey, tasks) : undefined}
														onEditTask={(taskKey, edits) => editTask(eventKey, taskKey, edits)}
														onClearEdits={(taskKey) => clearTaskEdits(eventKey, taskKey)}
														isCreating={isCreatingTasks}
														{createResults}
														showFeedback={showCreateFeedback}
														onDismissFeedback={dismissFeedback}
														{availableProjects}
														{defaultProject}
														{onTaskClick}
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
									{:else if (event.state === 'completed' || event.type === 'completed' || event.type === 'complete') && event.data}
										<!-- Rich Completed Signal UI -->
										{@const completedData = event.data}
										{@const popupCompletedSummary = Array.isArray(completedData.summary) ? completedData.summary : (typeof completedData.summary === 'string' ? [completedData.summary] : [])}
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
											{#if popupCompletedSummary.length > 0}
												<div>
													<div class="text-[10px] font-medium mb-1" style="color: oklch(0.55 0.02 250);">
														WHAT WAS DONE
													</div>
													<ul class="space-y-0.5">
														{#each popupCompletedSummary as item}
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

											<!-- Auto-proceed indicator (consolidated signal) -->
											{#if completedData.completionMode === 'auto_proceed'}
												<div class="mt-2 pt-2" style="border-top: 1px solid oklch(0.35 0.12 145);">
													<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.18 145);">
														<span>🚀</span>
														<span class="font-medium">AUTO PROCEED</span>
													</div>
													{#if completedData.nextTaskId}
														<div class="flex items-center gap-2 text-[10px] mt-1" style="color: oklch(0.85 0.12 200);">
															<span class="loading loading-spinner loading-xs"></span>
															<span>Spawning:</span>
															<span class="font-mono font-medium">{completedData.nextTaskId}</span>
														</div>
														{#if completedData.nextTaskTitle}
															<div class="text-[10px] ml-5 truncate" style="color: oklch(0.65 0.05 200);">
																{completedData.nextTaskTitle}
															</div>
														{/if}
													{:else}
														<div class="text-[10px] mt-1" style="color: oklch(0.55 0.02 250);">
															Finding next ready task...
														</div>
													{/if}
												</div>
											{:else if onCleanup}
												<!-- Cleanup Session action button for completed signal -->
												<div class="mt-3 pt-2" style="border-top: 1px solid oklch(0.35 0.12 145);">
													<button
														onclick={onCleanup}
														class="btn btn-xs btn-ghost gap-1.5 text-[10px] font-medium"
														style="color: oklch(0.75 0.15 145); background: oklch(0.45 0.12 145 / 0.2); border: 1px solid oklch(0.50 0.12 145 / 0.3);"
													>
														<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
															<path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.286a1.5 1.5 0 0 0 1.492-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clip-rule="evenodd" />
														</svg>
														Cleanup Session
													</button>
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
											projectName={defaultProject}
											{onTaskClick}
											{onFileClick}
											{onDiffClick}
											{onApprove}
											{onRequestChanges}
											{onAskQuestion}
											submitting={actionSubmitting}
										/>
									{#if onComplete}
										<!-- Complete Task action button for review signal -->
										<div class="mt-3 pt-2" style="border-top: 1px solid oklch(0.35 0.12 200);">
											<button
												onclick={onComplete}
												class="btn btn-xs btn-ghost gap-1.5 text-[10px] font-medium"
												style="color: oklch(0.80 0.12 200); background: oklch(0.50 0.12 200 / 0.2); border: 1px solid oklch(0.55 0.12 200 / 0.3);"
											>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
													<path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" />
												</svg>
												Complete Task
											</button>
										</div>
									{/if}
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
											{#if onComplete}
												<!-- Complete Task action button for fallback review -->
												<div class="mt-3 pt-2" style="border-top: 1px solid oklch(0.35 0.12 200);">
													<button
														onclick={onComplete}
														class="btn btn-xs btn-ghost gap-1.5 text-[10px] font-medium"
														style="color: oklch(0.80 0.12 200); background: oklch(0.50 0.12 200 / 0.2); border: 1px solid oklch(0.55 0.12 200 / 0.3);"
													>
														<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
															<path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" />
														</svg>
														Complete Task
													</button>
												</div>
											{/if}
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
											projectName={defaultProject}
											{onTaskClick}
											{onFileClick}
											onRollbackClick={onRollback ? (commit) => onRollback({ ...event, git_sha: commit }) : undefined}
										/>
									{#if onReview}
										<!-- Ready for Review action button for working signal -->
										<div class="mt-3 pt-2" style="border-top: 1px solid oklch(0.35 0.12 200);">
											<button
												onclick={onReview}
												class="btn btn-xs btn-ghost gap-1.5 text-[10px] font-medium"
												style="color: oklch(0.80 0.12 200); background: oklch(0.50 0.12 200 / 0.2); border: 1px solid oklch(0.55 0.12 200 / 0.3);"
											>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /><path fill-rule="evenodd" d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.238.006.87.87 0 0 1 0 .566A7.003 7.003 0 0 1 1.379 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clip-rule="evenodd" />
												</svg>
												Ready for Review
											</button>
										</div>
									{/if}
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
											{#if onReview}
												<!-- Ready for Review action button for fallback working -->
												<div class="mt-3 pt-2" style="border-top: 1px solid oklch(0.35 0.12 200);">
													<button
														onclick={onReview}
														class="btn btn-xs btn-ghost gap-1.5 text-[10px] font-medium"
														style="color: oklch(0.80 0.12 200); background: oklch(0.50 0.12 200 / 0.2); border: 1px solid oklch(0.55 0.12 200 / 0.3);"
													>
														<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /><path fill-rule="evenodd" d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.238.006.87.87 0 0 1 0 .566A7.003 7.003 0 0 1 1.379 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clip-rule="evenodd" />
														</svg>
														Ready for Review
													</button>
												</div>
											{/if}
										</div>
									{:else if (event.state === 'needs_input' || event.type === 'needs_input') && hasRichSignalData(event)}
										<!-- Rich Needs Input Signal Card -->
										{@const needsInputEventKey = getEventKey(event)}
										{@const needsInputAnsweredInfo = answeredQuestions.get(needsInputEventKey)}
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
										{#if needsInputAnsweredInfo}
											<!-- Answered state - show what was selected -->
											<div class="space-y-3">
												<div class="flex items-center justify-between">
													<div class="flex items-center gap-2 text-xs" style="color: oklch(0.70 0.15 145);">
														<span>✅</span>
														<span class="font-medium">Input Provided</span>
													</div>
													<button
														class="text-[10px] px-2 py-0.5 rounded transition-all hover:brightness-110"
														style="background: oklch(0.30 0.06 280); color: oklch(0.75 0.08 280);"
														onclick={(e) => {
															e.stopPropagation();
															answeredQuestions.delete(needsInputEventKey);
															answeredQuestions = new Map(answeredQuestions);
														}}
													>
														Change answer
													</button>
												</div>
												{#if needsInputSignal.question}
													<div class="p-2 rounded text-sm" style="background: oklch(0.22 0.04 145); color: oklch(0.80 0.08 145);">
														{needsInputSignal.question}
													</div>
												{/if}
												<div class="flex items-center gap-2 p-2 rounded" style="background: oklch(0.25 0.08 145); border: 1px solid oklch(0.40 0.12 145);">
													<span class="text-[10px] px-2 py-0.5 rounded font-medium" style="background: oklch(0.35 0.12 145); color: oklch(0.90 0.10 145);">
														✓ Answered
													</span>
													<span class="text-xs font-medium" style="color: oklch(0.85 0.10 145);">
														{needsInputAnsweredInfo.label}
													</span>
												</div>
											</div>
										{:else}
											<!-- Unanswered - show the NeedsInputSignalCard -->
											<NeedsInputSignalCard
												signal={needsInputSignal}
												projectName={defaultProject}
												onSelectOption={async (optionId) => {
													// Find the label for this option
													let label = optionId;

													// Check for special approval/rejection values
													if (optionId === 'approve') {
														label = '✓ Approved';
													} else if (optionId === 'reject') {
														label = '✗ Rejected';
													} else if (needsInputSignal.options) {
														// Try to find by id or value
														const option = needsInputSignal.options.find(o => o.id === optionId || o.value === optionId);
														if (option) {
															label = option.label;
														} else {
															// If optionId is a number string, try to get option by index (1-based)
															const idx = parseInt(optionId, 10);
															if (!isNaN(idx) && idx > 0 && idx <= needsInputSignal.options.length) {
																label = needsInputSignal.options[idx - 1].label;
															}
														}
													}

													// Mark as answered
													answeredQuestions.set(needsInputEventKey, {
														answer: optionId,
														label: label,
														timestamp: new Date().toISOString()
													});
													answeredQuestions = new Map(answeredQuestions);

													// Call the original handler to send input to terminal
													if (onSelectOption) {
														await onSelectOption(optionId);
													}
												}}
												onSubmitText={async (text) => {
													// Mark as answered with the submitted text
													answeredQuestions.set(needsInputEventKey, {
														answer: text,
														label: text.length > 50 ? text.substring(0, 50) + '...' : text,
														timestamp: new Date().toISOString()
													});
													answeredQuestions = new Map(answeredQuestions);

													// Call the original handler to send input to terminal
													if (onSubmitText) {
														await onSubmitText(text);
													}
												}}
												{onFileClick}
												{onTaskClick}
												submitting={actionSubmitting}
											/>
										{/if}
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
									{:else if event.state === 'question' || event.type === 'question'}
										<!-- Question signal card -->
										{@const questionEventKey = getEventKey(event)}
										{@const answeredInfo = answeredQuestions.get(questionEventKey)}
										{@const questionType = event.data?.questionType || 'choice'}
										{@const hasTimeout = event.data?.timeout && !answeredInfo}
										<div class="space-y-3">
											<div class="flex items-center justify-between">
												<div class="flex items-center gap-2 text-xs" style="color: {answeredInfo ? 'oklch(0.70 0.15 145)' : 'oklch(0.80 0.15 280)'};">
													<span>{answeredInfo ? '✅' : '💬'}</span>
													<span class="font-medium">{answeredInfo ? 'Question Answered' : 'Question for IDE'}</span>
												</div>
												<!-- Re-answer button (only show when answered) -->
												{#if answeredInfo}
													<button
														class="text-[10px] px-2 py-0.5 rounded transition-all hover:brightness-110"
														style="background: oklch(0.30 0.06 280); color: oklch(0.75 0.08 280);"
														onclick={(e) => {
															e.stopPropagation();
															answeredQuestions.delete(questionEventKey);
															answeredQuestions = new Map(answeredQuestions);
														}}
													>
														Change answer
													</button>
												{/if}
											</div>
											<!-- Question text -->
											{#if event.data?.question}
												<div class="p-2 rounded text-sm" style="background: {answeredInfo ? 'oklch(0.22 0.04 145)' : 'oklch(0.25 0.02 280)'}; color: {answeredInfo ? 'oklch(0.80 0.08 145)' : 'oklch(0.90 0.02 280)'};">
													{event.data.question}
												</div>
											{/if}
											<!-- Show answered state OR question type badge with timeout countdown -->
											{#if answeredInfo}
												<div class="flex items-center gap-2 p-2 rounded" style="background: oklch(0.25 0.08 145); border: 1px solid oklch(0.40 0.12 145);">
													<span class="text-[10px] px-2 py-0.5 rounded font-medium" style="background: oklch(0.35 0.12 145); color: oklch(0.90 0.10 145);">
														✓ Answered
													</span>
													<span class="text-xs font-medium" style="color: oklch(0.85 0.10 145);">
														{answeredInfo.label}
													</span>
												</div>
											{:else}
												<div class="flex items-center gap-2">
													<span class="text-[10px] px-2 py-0.5 rounded" style="background: oklch(0.35 0.10 280); color: oklch(0.85 0.10 280);">
														{questionType}
													</span>
													{#if hasTimeout}
														{@const timeoutStart = new Date(event.timestamp).getTime()}
														{@const timeoutEnd = timeoutStart + (event.data.timeout * 1000)}
														{@const now = Date.now()}
														{@const remaining = Math.max(0, Math.ceil((timeoutEnd - now) / 1000))}
														{@const isExpired = remaining <= 0}
														{@const isUrgent = remaining <= 30 && remaining > 0}
														<span
															class="text-[10px] font-mono {isUrgent ? 'animate-pulse' : ''}"
															style="color: {isExpired ? 'oklch(0.55 0.15 25)' : isUrgent ? 'oklch(0.70 0.15 45)' : 'oklch(0.50 0.02 250)'};"
														>
															{#if isExpired}
																⏱ Expired
															{:else}
																⏱ {remaining}s
															{/if}
														</span>
													{/if}
												</div>
											{/if}
											<!-- Confirm type: Yes/No buttons -->
											{#if !answeredInfo && questionType === 'confirm'}
												<div class="flex gap-2">
													<button
														class="flex-1 p-2 rounded text-xs font-medium transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
														style="background: oklch(0.30 0.12 145); border: 1px solid oklch(0.45 0.15 145); color: oklch(0.90 0.10 145);"
														onclick={async (e) => {
															e.stopPropagation();
															await sendInput(sessionName, 'yes', 'text');
															answeredQuestions.set(questionEventKey, {
																answer: 'yes',
																label: 'Yes',
																timestamp: new Date().toISOString()
															});
															answeredQuestions = new Map(answeredQuestions);
															try { await fetch(`/api/sessions/${sessionName}/custom-question`, { method: 'DELETE' }); } catch {}
														}}
													>
														✓ Yes
													</button>
													<button
														class="flex-1 p-2 rounded text-xs font-medium transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
														style="background: oklch(0.30 0.10 25); border: 1px solid oklch(0.45 0.12 25); color: oklch(0.90 0.08 25);"
														onclick={async (e) => {
															e.stopPropagation();
															await sendInput(sessionName, 'no', 'text');
															answeredQuestions.set(questionEventKey, {
																answer: 'no',
																label: 'No',
																timestamp: new Date().toISOString()
															});
															answeredQuestions = new Map(answeredQuestions);
															try { await fetch(`/api/sessions/${sessionName}/custom-question`, { method: 'DELETE' }); } catch {}
														}}
													>
														✗ No
													</button>
												</div>
											{/if}
											<!-- Input type: Text field with submit -->
											{#if !answeredInfo && questionType === 'input'}
												{@const inputValue = inputQuestionValue.get(questionEventKey) || ''}
												<div class="flex gap-2">
													<input
														type="text"
														class="flex-1 px-3 py-2 rounded text-xs"
														style="background: oklch(0.20 0.02 280); border: 1px solid oklch(0.40 0.08 280); color: oklch(0.90 0.02 280);"
														placeholder="Type your answer..."
														value={inputValue}
														oninput={(e) => {
															inputQuestionValue.set(questionEventKey, e.currentTarget.value);
															inputQuestionValue = new Map(inputQuestionValue);
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter' && inputValue.trim()) {
																e.preventDefault();
																sendInput(sessionName, inputValue.trim(), 'text');
																answeredQuestions.set(questionEventKey, {
																	answer: inputValue.trim(),
																	label: inputValue.trim(),
																	timestamp: new Date().toISOString()
																});
																answeredQuestions = new Map(answeredQuestions);
																inputQuestionValue.delete(questionEventKey);
																inputQuestionValue = new Map(inputQuestionValue);
																fetch(`/api/sessions/${sessionName}/custom-question`, { method: 'DELETE' }).catch(() => {});
															}
														}}
													/>
													<button
														class="px-4 py-2 rounded text-xs font-medium transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
														style="background: oklch(0.40 0.12 280); color: oklch(0.95 0.05 280);"
														disabled={!inputValue.trim()}
														onclick={async (e) => {
															e.stopPropagation();
															if (!inputValue.trim()) return;
															await sendInput(sessionName, inputValue.trim(), 'text');
															answeredQuestions.set(questionEventKey, {
																answer: inputValue.trim(),
																label: inputValue.trim(),
																timestamp: new Date().toISOString()
															});
															answeredQuestions = new Map(answeredQuestions);
															inputQuestionValue.delete(questionEventKey);
															inputQuestionValue = new Map(inputQuestionValue);
															try { await fetch(`/api/sessions/${sessionName}/custom-question`, { method: 'DELETE' }); } catch {}
														}}
													>
														Submit
													</button>
												</div>
											{/if}
											<!-- Choice type: Options list - clickable buttons to send answer (only show if not answered) -->
											{#if !answeredInfo && questionType === 'choice' && event.data?.options && Array.isArray(event.data.options) && event.data.options.length > 0}
												<div class="space-y-1.5">
													<div class="text-[10px] font-medium" style="color: oklch(0.60 0.02 250);">Click to answer:</div>
													{#each event.data.options as option, i}
														<button
															class="w-full flex items-start gap-2 p-2 rounded text-xs text-left transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
															style="background: oklch(0.28 0.06 280); border: 1px solid oklch(0.40 0.10 280);"
															onclick={async (e) => {
																e.stopPropagation();
																// Send the option value (or label if no value) to the session
																const answer = option.value || option.label || String(i + 1);
																await sendInput(sessionName, answer, 'text');
																// Track as answered
																answeredQuestions.set(questionEventKey, {
																	answer,
																	label: option.label,
																	timestamp: new Date().toISOString()
																});
																answeredQuestions = new Map(answeredQuestions); // Trigger reactivity
																// Clear the question file
																try {
																	await fetch(`/api/sessions/${sessionName}/custom-question`, { method: 'DELETE' });
																} catch (err) {
																	// Ignore errors clearing question file
																}
															}}
														>
															<span class="font-mono text-[10px] px-1.5 py-0.5 rounded font-bold" style="background: oklch(0.45 0.15 280); color: oklch(0.95 0.05 280);">
																{i + 1}
															</span>
															<div class="flex-1">
																<div class="font-medium" style="color: oklch(0.90 0.05 280);">{option.label}</div>
																{#if option.description}
																	<div class="text-[10px] mt-0.5" style="color: oklch(0.65 0.02 250);">{option.description}</div>
																{/if}
															</div>
														</button>
													{/each}
												</div>
											{/if}
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
									{:else if event.state === 'paused' || event.type === 'paused'}
										<!-- Paused state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.15 300);">
												<span>⏸</span>
												<span class="font-medium">Session Paused</span>
											</div>
											{#if event.data?.reason}
												<div class="text-xs" style="color: oklch(0.70 0.10 300);">
													{event.data.reason}
												</div>
											{/if}
											{#if event.data?.taskTitle}
												<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
													Task: {event.data.taskTitle}
												</div>
											{:else if event.task_id}
												<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
													Task: <span class="font-mono">{event.task_id}</span>
												</div>
											{/if}
											{#if event.data?.resumable !== false}
												<div class="text-[10px]" style="color: oklch(0.50 0.02 250);">
													This session can be resumed from the Paused section.
												</div>
											{/if}
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
											{#if event.data.hasImage}
												<!-- Image indicator badge -->
												<div class="flex items-center gap-2">
													<span
														class="px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1"
														style="background: oklch(0.25 0.08 280); color: oklch(0.85 0.12 280); border: 1px solid oklch(0.35 0.10 280);"
													>
														<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
															<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
														</svg>
														Image attached
													</span>
												</div>
											{/if}
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
									{:else if event.type === 'ide_input' && event.data}
										<!-- IDE Input event - show input sent via SQUAD UI (button/dropdown) -->
										<div class="space-y-2">
											<!-- Source badge -->
											<div class="flex items-center gap-2">
												<span
													class="px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1"
													style="background: oklch(0.25 0.10 180); color: oklch(0.88 0.12 180); border: 1px solid oklch(0.42 0.12 180);"
												>
													<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
													</svg>
													{event.data.isCommand ? 'IDE Command' : 'IDE Input'}
												</span>
											</div>
											{#if event.data.input}
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class="text-xs p-2 rounded-lg whitespace-pre-wrap cursor-pointer transition-all hover:brightness-110 active:scale-[0.99] relative font-mono"
													style="background: oklch(0.18 0.08 180); border-left: 3px solid oklch(0.50 0.12 180); color: oklch(0.85 0.10 180);"
													onclick={async () => {
														await navigator.clipboard.writeText(event.data.input);
														copiedEventKey = getEventKey(event);
														setTimeout(() => copiedEventKey = null, 1500);
													}}
													title="Click to copy"
												>
													{event.data.input}
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
				{#each filteredEvents.slice(0, 3) as event, idx (getEventKey(event) + '-' + idx)}
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
								<div class="flex items-center gap-2 flex-1 min-w-0">
									<span class="text-xs flex-shrink-0">{style.icon}</span>
									<span class="font-mono text-[11px] font-medium truncate min-w-0 {isNewest && isGenerating ? 'shimmer-text-fast' : ''}" style={isNewest && isGenerating ? `--shimmer-text-color: ${style.text};` : `color: ${style.text};`}>
										{getEventLabel(event)}
									</span>
									{#if event.git_sha}
										<span
											class="font-mono text-[9px] flex-shrink-0"
											style="color: oklch(0.50 0.02 250);"
										>
											{event.git_sha}
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2 flex-shrink-0">
									{#if hasUnansweredQuestion}
										<span
											class="px-1.5 py-0.5 rounded text-[9px] font-medium animate-pulse"
											style="background: oklch(0.35 0.12 280); color: oklch(0.90 0.10 280);"
											title="Question waiting for answer"
										>
											❓ Question
										</span>
									{/if}
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
	{/if}
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
