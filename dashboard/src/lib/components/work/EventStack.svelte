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
	 * - Rich SuggestedTasksSection for tasks events
	 */

	import { onMount, onDestroy } from 'svelte';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import SuggestedTasksSection from './SuggestedTasksSection.svelte';
	import type { SuggestedTask } from '$lib/types/signals';

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

	let {
		sessionName,
		maxEvents = 20,
		pollInterval = 5000,
		onRollback,
		onCreateTasks,
		availableProjects = [],
		class: className = ''
	}: {
		sessionName: string;
		maxEvents?: number;
		pollInterval?: number;
		onRollback?: (event: TimelineEvent) => void;
		onCreateTasks?: (tasks: SuggestedTaskWithState[]) => Promise<{ success: any[]; failed: any[] }>;
		availableProjects?: string[];
		class?: string;
	} = $props();

	let events = $state<TimelineEvent[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isExpanded = $state(false);
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
	const stateStyles: Record<string, { icon: string; bg: string; text: string; border: string }> = {
		working: {
			icon: '⚡',
			bg: 'oklch(0.25 0.08 85)',
			text: 'oklch(0.85 0.15 85)',
			border: 'oklch(0.40 0.10 85)'
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
		if (event.state) {
			const label = event.state.toUpperCase().replace('_', ' ');
			if (event.task_id) {
				return `${label} ${event.task_id}`;
			}
			return label;
		}
		if (event.type === 'complete') {
			return 'COMPLETE';
		}
		return event.type.toUpperCase();
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
			const newEvents: TimelineEvent[] = data.events || [];

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
					{#each events as event, idx (event.timestamp + idx)}
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
									<span class="font-mono text-xs font-medium" style="color: {style.text};">
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
									{:else if event.state === 'review'}
										<!-- Review state - show structured info -->
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
									{:else if event.state === 'working'}
										<!-- Working state - show task info -->
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
									{:else if event.state === 'needs_input'}
										<!-- Needs Input state -->
										<div class="space-y-2">
											<div class="flex items-center gap-2 text-xs" style="color: oklch(0.80 0.15 310);">
												<span>❓</span>
												<span class="font-medium">Waiting for Input</span>
											</div>
											<div class="text-[10px]" style="color: oklch(0.60 0.02 250);">
												Agent has a question and is waiting for your response. Check the terminal or use the Quick Answer buttons if available.
											</div>
										</div>
									{:else if event.state === 'idle'}
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
				{#each events.slice(0, 3) as event, idx (getEventKey(event))}
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
									<span class="font-mono text-[11px] font-medium" style="color: {style.text};">
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
									{#if events.length > 1}
										<span
											class="font-mono text-[9px]"
											style="color: oklch(0.55 0.02 250);"
										>
											+{events.length - 1}
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
