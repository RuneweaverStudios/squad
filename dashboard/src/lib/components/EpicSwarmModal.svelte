<script lang="ts">
	/**
	 * EpicSwarmModal Component
	 * Modal for configuring and launching an epic swarm execution
	 *
	 * Features:
	 * - Epic selector dropdown (fetches all epics, sorted by ready task count)
	 * - Children list with checkboxes and status badges
	 * - Execution mode toggle (Parallel/Sequential)
	 * - Max concurrent agents slider (1-8)
	 * - Review threshold dropdown
	 * - Auto-spawn blocked tasks checkbox
	 * - Preview section showing what will happen
	 * - Launch button that calls epicQueueStore.launchEpic()
	 *
	 * Keyboard shortcut: Alt+E to open
	 */

	import { onMount } from 'svelte';
	import {
		launchEpic,
		type ExecutionSettings,
		type ReviewThreshold,
		type ExecutionMode
	} from '$lib/stores/epicQueueStore.svelte';
	import {
		openTaskDetailDrawer,
		isEpicSwarmModalOpen,
		epicSwarmModalEpicId,
		closeEpicSwarmModal
	} from '$lib/stores/drawerStore';
	import {
		DEFAULT_MODEL,
		MAX_TMUX_SESSIONS,
		DEFAULT_AGENT_COUNT,
		MIN_AGENT_COUNT
	} from '$lib/config/spawnConfig';
	import {
		loadEpicSwarmSettings,
		saveEpicSwarmSettings,
		resetEpicSwarmSettings,
		hasCustomSettings,
		DEFAULT_EPIC_SWARM_SETTINGS,
		type EpicSwarmSettings
	} from '$lib/utils/epicSwarmSettings';

	// Props - epicId is optional, can be selected in modal
	interface Props {
		epicId?: string | null;
		isOpen?: boolean;
		onClose?: () => void;
	}

	let { epicId: propEpicId = null, isOpen = $bindable(false), onClose = () => {} }: Props = $props();

	// Epic info for dropdown
	interface EpicInfo {
		id: string;
		title: string;
		ready: number;
		total: number;
		inProgress: number;
	}

	// Epic list state
	let availableEpics = $state<EpicInfo[]>([]);
	let isLoadingEpics = $state(false);
	let epicLoadError = $state<string | null>(null);

	// Selected epic (from prop, store, or user selection)
	let selectedEpicId = $state<string | null>(null);

	// Keyboard shortcut: Alt+E to open modal
	function handleKeydown(e: KeyboardEvent) {
		if (e.altKey && e.key.toLowerCase() === 'e') {
			e.preventDefault();
			isEpicSwarmModalOpen.set(true);
		}
	}

	// Sync with store and props
	$effect(() => {
		const unsubscribe = isEpicSwarmModalOpen.subscribe((value) => {
			isOpen = value;
			if (value) {
				loadEpics();
			}
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = epicSwarmModalEpicId.subscribe((value) => {
			if (value) {
				selectedEpicId = value;
			}
		});
		return unsubscribe;
	});

	// Use prop epic ID if provided
	$effect(() => {
		if (propEpicId) {
			selectedEpicId = propEpicId;
		}
	});

	// Computed epicId for the rest of the component
	const epicId = $derived(selectedEpicId || '');

	// Child task from API
	interface EpicChild {
		id: string;
		title: string;
		priority: number;
		status: string;
		issue_type: string;
		assignee?: string;
		isBlocked: boolean;
		blockedBy: string[];
	}

	// Summary from API
	interface EpicSummary {
		total: number;
		open: number;
		inProgress: number;
		closed: number;
		blocked: number;
		ready: number;
	}

	// State
	let epicTitle = $state('');
	let children = $state<EpicChild[]>([]);
	let summary = $state<EpicSummary>({
		total: 0,
		open: 0,
		inProgress: 0,
		closed: 0,
		blocked: 0,
		ready: 0
	});
	let selectedTaskIds = $state<Set<string>>(new Set());
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Execution settings (loaded from localStorage)
	let executionMode = $state<ExecutionMode>('parallel');
	let maxConcurrent = $state(DEFAULT_AGENT_COUNT);
	let reviewThreshold = $state<ReviewThreshold>('p0-p1');
	let autoSpawnBlocked = $state(true);
	let showCustomSettingsIndicator = $state(false);

	// Load settings from localStorage when modal opens
	function loadSettings() {
		const savedSettings = loadEpicSwarmSettings(epicId);
		executionMode = savedSettings.executionMode;
		maxConcurrent = savedSettings.maxConcurrent;
		reviewThreshold = savedSettings.reviewThreshold;
		autoSpawnBlocked = savedSettings.autoSpawnBlocked;
		showCustomSettingsIndicator = hasCustomSettings(epicId);
	}

	// Handle reset to defaults
	function handleResetToDefaults() {
		const defaults = resetEpicSwarmSettings(epicId);
		executionMode = defaults.executionMode;
		maxConcurrent = defaults.maxConcurrent;
		reviewThreshold = defaults.reviewThreshold;
		autoSpawnBlocked = defaults.autoSpawnBlocked;
		showCustomSettingsIndicator = false;
	}

	// Derived values
	const selectableChildren = $derived(
		children.filter((c) => c.status !== 'closed' && c.status !== 'in_progress')
	);
	const readyChildren = $derived(selectableChildren.filter((c) => !c.isBlocked));
	const blockedChildren = $derived(selectableChildren.filter((c) => c.isBlocked));
	const selectedCount = $derived(selectedTaskIds.size);
	const maxAgents = $derived(Math.min(readyChildren.length, MAX_TMUX_SESSIONS, 8));
	const canLaunch = $derived(selectedCount > 0 && readyChildren.length > 0);

	// Review threshold options
	const reviewThresholdOptions: { value: ReviewThreshold; label: string; description: string }[] = [
		{ value: 'all', label: 'All Tasks', description: 'Review every task before completion' },
		{ value: 'p0', label: 'P0 Only', description: 'Only review critical (P0) tasks' },
		{ value: 'p0-p1', label: 'P0-P1', description: 'Review P0 and P1 tasks' },
		{ value: 'p0-p2', label: 'P0-P2', description: 'Review P0, P1, and P2 tasks' },
		{ value: 'none', label: 'None', description: 'Auto-complete all tasks (no review)' }
	];

	// Load epics when modal opens
	async function loadEpics() {
		if (availableEpics.length > 0) return; // Already loaded

		isLoadingEpics = true;
		epicLoadError = null;

		try {
			// Fetch all tasks and filter to epics
			const response = await fetch('/api/tasks');
			if (!response.ok) {
				throw new Error('Failed to fetch tasks');
			}

			const data = await response.json();
			const tasks = data.tasks || [];

			// Filter to epics only
			const epics = tasks.filter((t: any) => t.issue_type === 'epic' && t.status !== 'closed');

			// For each epic, get children summary
			const epicsWithInfo: EpicInfo[] = [];
			for (const epic of epics) {
				try {
					const childResponse = await fetch(`/api/epics/${epic.id}/children`);
					if (childResponse.ok) {
						const childData = await childResponse.json();
						epicsWithInfo.push({
							id: epic.id,
							title: epic.title,
							ready: childData.summary.ready,
							total: childData.summary.total,
							inProgress: childData.summary.inProgress
						});
					}
				} catch {
					// Skip this epic if we can't fetch children
				}
			}

			// Filter out epics with nothing to launch (0 ready tasks)
			// These are either completed or have no actionable children
			const actionableEpics = epicsWithInfo.filter(e => e.ready > 0);

			// Sort by ready tasks (most ready first), then by total
			actionableEpics.sort((a, b) => {
				if (b.ready !== a.ready) return b.ready - a.ready;
				return b.total - a.total;
			});

			availableEpics = actionableEpics;

			// Auto-close any epics that have all children complete
			// This cleans up completed epics so they don't clutter the system
			try {
				await fetch('/api/epics/close-eligible', { method: 'POST' });
			} catch {
				// Ignore errors - this is just cleanup
			}

			// Auto-select first epic if none selected
			if (!selectedEpicId && actionableEpics.length > 0) {
				selectedEpicId = actionableEpics[0].id;
			}
		} catch (err) {
			epicLoadError = err instanceof Error ? err.message : 'Failed to load epics';
		} finally {
			isLoadingEpics = false;
		}
	}

	// Handle epic selection change
	function handleEpicChange(newEpicId: string) {
		selectedEpicId = newEpicId;
		// Reset children state
		children = [];
		summary = {
			total: 0,
			open: 0,
			inProgress: 0,
			closed: 0,
			blocked: 0,
			ready: 0
		};
		selectedTaskIds = new Set();
		// Load new children
		loadChildren();
	}

	// Load epic children and settings on mount/epicId change
	$effect(() => {
		if (isOpen && epicId) {
			loadSettings();
			loadChildren();
		}
	});

	async function loadChildren() {
		isLoading = true;
		loadError = null;

		try {
			const response = await fetch(`/api/epics/${epicId}/children`);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to load epic children');
			}

			const data = await response.json();
			epicTitle = data.epicTitle;
			children = data.children;
			summary = data.summary;

			// Auto-select all ready (unblocked) tasks
			selectedTaskIds = new Set(readyChildren.map((c) => c.id));

			// Set max concurrent based on ready tasks
			maxConcurrent = Math.min(readyChildren.length, DEFAULT_AGENT_COUNT);
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load epic children';
		} finally {
			isLoading = false;
		}
	}

	function toggleTask(taskId: string) {
		const newSet = new Set(selectedTaskIds);
		if (newSet.has(taskId)) {
			newSet.delete(taskId);
		} else {
			newSet.add(taskId);
		}
		selectedTaskIds = newSet;
	}

	function selectAll() {
		selectedTaskIds = new Set(selectableChildren.map((c) => c.id));
	}

	function selectNone() {
		selectedTaskIds = new Set();
	}

	function selectReady() {
		selectedTaskIds = new Set(readyChildren.map((c) => c.id));
	}

	async function handleLaunch() {
		if (!canLaunch) return;

		isSubmitting = true;
		submitError = null;
		successMessage = null;

		// Save settings to localStorage for future use
		saveEpicSwarmSettings(
			{
				executionMode,
				maxConcurrent,
				reviewThreshold,
				autoSpawnBlocked
			},
			epicId
		);
		showCustomSettingsIndicator = hasCustomSettings(epicId);

		try {
			const settings: Partial<ExecutionSettings> = {
				mode: executionMode,
				maxConcurrent,
				reviewThreshold,
				autoSpawn: autoSpawnBlocked
			};

			const result = await launchEpic(epicId, settings);

			if (!result.success) {
				throw new Error(result.error || 'Failed to launch epic swarm');
			}

			successMessage = `Epic swarm launched! ${result.spawnResults?.filter((r) => r.success).length || 0} agents spawned.`;

			// Close after delay
			setTimeout(() => {
				handleClose();
			}, 1500);
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Failed to launch epic swarm';
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		if (!isSubmitting) {
			isOpen = false;
			closeEpicSwarmModal();
			onClose();
			submitError = null;
			successMessage = null;
		}
	}

	// Priority badge colors
	function getPriorityColor(priority: number): string {
		switch (priority) {
			case 0:
				return 'oklch(0.65 0.20 25)'; // P0 - Red
			case 1:
				return 'oklch(0.75 0.18 60)'; // P1 - Orange
			case 2:
				return 'oklch(0.75 0.15 85)'; // P2 - Yellow
			case 3:
				return 'oklch(0.70 0.15 145)'; // P3 - Green
			default:
				return 'oklch(0.55 0.02 250)'; // P4+ - Gray
		}
	}

	// Status badge styling
	function getStatusBadge(status: string): { bg: string; text: string; label: string } {
		switch (status) {
			case 'open':
				return {
					bg: 'oklch(0.45 0.12 200 / 0.3)',
					text: 'oklch(0.80 0.12 200)',
					label: 'Open'
				};
			case 'in_progress':
				return {
					bg: 'oklch(0.55 0.15 85 / 0.3)',
					text: 'oklch(0.85 0.15 85)',
					label: 'In Progress'
				};
			case 'closed':
				return {
					bg: 'oklch(0.45 0.15 145 / 0.3)',
					text: 'oklch(0.80 0.15 145)',
					label: 'Closed'
				};
			case 'blocked':
				return {
					bg: 'oklch(0.45 0.15 25 / 0.3)',
					text: 'oklch(0.80 0.15 25)',
					label: 'Blocked'
				};
			default:
				return {
					bg: 'oklch(0.30 0.02 250 / 0.3)',
					text: 'oklch(0.70 0.02 250)',
					label: status
				};
		}
	}
</script>

<!-- Keyboard shortcut listener -->
<svelte:window onkeydown={handleKeydown} />

<!-- Modal -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal modal-open" onclick={(e) => e.target === e.currentTarget && handleClose()}>
		<div
			class="modal-box max-w-3xl"
			style="
				background: linear-gradient(180deg, oklch(0.18 0.01 250) 0%, oklch(0.16 0.01 250) 100%);
				border: 1px solid oklch(0.35 0.02 250);
			"
		>
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-3">
					<h3
						class="text-lg font-bold font-mono uppercase tracking-wider"
						style="color: oklch(0.85 0.02 250);"
					>
						Epic Swarm
					</h3>
					<kbd class="kbd kbd-xs" style="color: oklch(0.55 0.02 250);">Alt+E</kbd>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
					aria-label="Close modal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Epic Selector -->
			{#if isLoadingEpics}
				<div class="flex items-center gap-2 mb-4 p-3 rounded-lg" style="background: oklch(0.22 0.02 250);">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="text-sm" style="color: oklch(0.60 0.02 250);">Loading epics...</span>
				</div>
			{:else if epicLoadError}
				<div
					class="alert mb-4"
					style="background: oklch(0.35 0.15 25); border: 1px solid oklch(0.50 0.18 25); color: oklch(0.95 0.02 250);"
				>
					<span>{epicLoadError}</span>
					<button class="btn btn-sm btn-ghost" onclick={() => { availableEpics = []; loadEpics(); }}>
						Retry
					</button>
				</div>
			{:else if availableEpics.length === 0}
				<div class="text-center py-8" style="color: oklch(0.55 0.02 250);">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto mb-2 opacity-50">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
					</svg>
					<p class="font-medium">No open epics found</p>
					<p class="text-sm mt-1">Create an epic with child tasks to use Epic Swarm</p>
				</div>
			{:else}
				<!-- Epic Dropdown -->
				<div class="mb-4">
					<label
						class="text-xs font-semibold font-mono uppercase tracking-wider block mb-2"
						style="color: oklch(0.55 0.02 250);"
					>
						Select Epic
					</label>
					<select
						class="select select-bordered w-full font-mono"
						value={selectedEpicId}
						onchange={(e) => handleEpicChange(e.currentTarget.value)}
						disabled={isSubmitting}
						style="background: oklch(0.22 0.02 250); border-color: oklch(0.35 0.02 250);"
					>
						{#each availableEpics as epic}
							<option value={epic.id}>
								{epic.id} - {epic.title} ({epic.ready} ready / {epic.total} total)
							</option>
						{/each}
					</select>
				</div>

			{#if isLoading}
				<!-- Loading State -->
				<div class="flex items-center justify-center py-12">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{:else if loadError}
				<!-- Error State -->
				<div
					class="alert mb-4"
					style="background: oklch(0.35 0.15 25); border: 1px solid oklch(0.50 0.18 25); color: oklch(0.95 0.02 250);"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{loadError}</span>
					<button class="btn btn-sm btn-ghost" onclick={loadChildren}>Retry</button>
				</div>
			{:else}
				<!-- Summary Stats -->
				<div
					class="grid grid-cols-5 gap-2 mb-4 p-3 rounded-lg"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
				>
					<div class="text-center">
						<div class="text-xl font-bold font-mono" style="color: oklch(0.85 0.02 250);">
							{summary.total}
						</div>
						<div
							class="text-xs font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Total
						</div>
					</div>
					<div class="text-center">
						<div class="text-xl font-bold font-mono" style="color: oklch(0.70 0.18 150);">
							{summary.ready}
						</div>
						<div
							class="text-xs font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Ready
						</div>
					</div>
					<div class="text-center">
						<div class="text-xl font-bold font-mono" style="color: oklch(0.75 0.15 85);">
							{summary.inProgress}
						</div>
						<div
							class="text-xs font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							In Progress
						</div>
					</div>
					<div class="text-center">
						<div class="text-xl font-bold font-mono" style="color: oklch(0.70 0.18 25);">
							{summary.blocked}
						</div>
						<div
							class="text-xs font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Blocked
						</div>
					</div>
					<div class="text-center">
						<div class="text-xl font-bold font-mono" style="color: oklch(0.65 0.15 145);">
							{summary.closed}
						</div>
						<div
							class="text-xs font-mono uppercase tracking-wider"
							style="color: oklch(0.55 0.02 250);"
						>
							Closed
						</div>
					</div>
				</div>

				<!-- Children List Section -->
				<div class="mb-4">
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-2">
							<code
								class="text-xs font-mono px-1.5 py-0.5 rounded"
								style="background: oklch(0.30 0.08 270 / 0.5); color: oklch(0.75 0.12 270);"
							>
								{epicId}
							</code>
							<span class="text-sm truncate max-w-xs" style="color: oklch(0.70 0.02 250);">
								{epicTitle}
							</span>
							<span
								class="text-xs font-mono"
								style="color: oklch(0.55 0.02 250);"
							>
								({selectedCount} selected)
							</span>
						</div>
						<div class="flex gap-1">
							<button
								class="btn btn-xs btn-ghost font-mono"
								onclick={selectAll}
								disabled={isSubmitting}
							>
								All
							</button>
							<button
								class="btn btn-xs btn-ghost font-mono"
								onclick={selectReady}
								disabled={isSubmitting}
							>
								Ready
							</button>
							<button
								class="btn btn-xs btn-ghost font-mono"
								onclick={selectNone}
								disabled={isSubmitting}
							>
								None
							</button>
						</div>
					</div>

					<div
						class="rounded-lg overflow-hidden"
						style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.28 0.02 250);"
					>
						<div class="max-h-48 overflow-y-auto">
							{#if children.length === 0}
								<div class="p-4 text-center" style="color: oklch(0.55 0.02 250);">
									<p>No children found for this epic.</p>
								</div>
							{:else}
								{#each children as child (child.id)}
									{@const isSelectable =
										child.status !== 'closed' && child.status !== 'in_progress'}
									{@const isSelected = selectedTaskIds.has(child.id)}
									{@const statusBadge = child.isBlocked
										? getStatusBadge('blocked')
										: getStatusBadge(child.status)}

									<div
										class="flex items-center gap-2 px-3 py-2 border-b transition-colors group"
										style="
											border-color: oklch(0.25 0.02 250);
											background: {isSelected
											? 'oklch(0.25 0.05 200 / 0.3)'
											: 'transparent'};
										"
										class:opacity-50={!isSelectable}
									>
										<!-- Checkbox -->
										<input
											type="checkbox"
											class="checkbox checkbox-sm checkbox-primary"
											checked={isSelected}
											disabled={!isSelectable || isSubmitting}
											onchange={() => isSelectable && toggleTask(child.id)}
										/>

										<!-- Priority Badge -->
										<span
											class="text-xs font-bold font-mono px-1.5 py-0.5 rounded"
											style="
												background: {getPriorityColor(child.priority)}20;
												color: {getPriorityColor(child.priority)};
											"
										>
											P{child.priority}
										</span>

										<!-- Task ID & Title -->
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<code class="text-xs" style="color: oklch(0.55 0.02 250);">
													{child.id}
												</code>
												<span class="text-sm truncate" style="color: oklch(0.80 0.02 250);">
													{child.title}
												</span>
											</div>
											{#if child.isBlocked && child.blockedBy.length > 0}
												<div class="text-xs mt-0.5" style="color: oklch(0.55 0.15 25);">
													Blocked by: {child.blockedBy.join(', ')}
												</div>
											{/if}
										</div>

										<!-- Status Badge -->
										<span
											class="text-xs font-mono px-2 py-0.5 rounded"
											style="
												background: {statusBadge.bg};
												color: {statusBadge.text};
											"
										>
											{statusBadge.label}
										</span>

										<!-- View Details Button -->
										<button
											class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity p-0.5 min-h-0 h-auto"
											onclick={(e) => {
												e.stopPropagation();
												openTaskDetailDrawer(child.id);
											}}
											title="View task details"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="w-4 h-4"
												style="color: oklch(0.70 0.15 240);"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
												/>
											</svg>
										</button>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>

				<!-- Execution Settings -->
				<div
					class="mb-4 p-4 rounded-lg"
					style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.28 0.02 250);"
				>
					<!-- Settings Header -->
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center gap-2">
							<span
								class="text-xs font-semibold font-mono uppercase tracking-wider"
								style="color: oklch(0.55 0.02 250);"
							>
								Execution Settings
							</span>
							{#if showCustomSettingsIndicator}
								<span
									class="text-xs font-mono px-1.5 py-0.5 rounded"
									style="background: oklch(0.45 0.12 200 / 0.3); color: oklch(0.75 0.12 200);"
								>
									Saved
								</span>
							{/if}
						</div>
						{#if showCustomSettingsIndicator}
							<button
								class="btn btn-xs btn-ghost font-mono gap-1"
								onclick={handleResetToDefaults}
								disabled={isSubmitting}
								title="Reset to default settings"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-3.5 h-3.5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
									/>
								</svg>
								Reset
							</button>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-4">
					<!-- Execution Mode Toggle -->
					<div>
						<label
							class="text-xs font-semibold font-mono uppercase tracking-wider block mb-2"
							style="color: oklch(0.55 0.02 250);"
						>
							Execution Mode
						</label>
						<div class="btn-group">
							<button
								class="btn btn-sm font-mono"
								class:btn-primary={executionMode === 'parallel'}
								class:btn-ghost={executionMode !== 'parallel'}
								onclick={() => (executionMode = 'parallel')}
								disabled={isSubmitting}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-4 h-4 mr-1"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
									/>
								</svg>
								Parallel
							</button>
							<button
								class="btn btn-sm font-mono"
								class:btn-primary={executionMode === 'sequential'}
								class:btn-ghost={executionMode !== 'sequential'}
								onclick={() => (executionMode = 'sequential')}
								disabled={isSubmitting}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-4 h-4 mr-1"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5"
									/>
								</svg>
								Sequential
							</button>
						</div>
						<p class="text-xs mt-1" style="color: oklch(0.45 0.02 250);">
							{executionMode === 'parallel'
								? 'Run multiple agents simultaneously'
								: 'Run agents one at a time'}
						</p>
					</div>

					<!-- Max Concurrent Agents Slider -->
					<div>
						<div class="flex justify-between items-center mb-2">
							<label
								class="text-xs font-semibold font-mono uppercase tracking-wider"
								style="color: oklch(0.55 0.02 250);"
							>
								Max Concurrent Agents
							</label>
							<span class="text-lg font-bold font-mono" style="color: oklch(0.85 0.02 250);">
								{maxConcurrent}
							</span>
						</div>
						<input
							type="range"
							min={MIN_AGENT_COUNT}
							max={Math.max(maxAgents, 1)}
							bind:value={maxConcurrent}
							class="range range-primary range-sm w-full"
							disabled={isSubmitting || executionMode === 'sequential'}
						/>
						<div class="flex justify-between text-xs mt-1" style="color: oklch(0.45 0.02 250);">
							<span>{MIN_AGENT_COUNT}</span>
							<span>max {Math.max(maxAgents, 1)}</span>
						</div>
					</div>

					<!-- Review Threshold Dropdown -->
					<div>
						<label
							class="text-xs font-semibold font-mono uppercase tracking-wider block mb-2"
							style="color: oklch(0.55 0.02 250);"
						>
							Review Threshold
						</label>
						<select
							class="select select-bordered select-sm w-full font-mono"
							bind:value={reviewThreshold}
							disabled={isSubmitting}
							style="background: oklch(0.25 0.02 250); border-color: oklch(0.35 0.02 250);"
						>
							{#each reviewThresholdOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<p class="text-xs mt-1" style="color: oklch(0.45 0.02 250);">
							{reviewThresholdOptions.find((o) => o.value === reviewThreshold)?.description}
						</p>
					</div>

					<!-- Auto-spawn Blocked Tasks Checkbox -->
					<div>
						<label
							class="text-xs font-semibold font-mono uppercase tracking-wider block mb-2"
							style="color: oklch(0.55 0.02 250);"
						>
							Blocked Task Handling
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								class="checkbox checkbox-sm checkbox-primary"
								bind:checked={autoSpawnBlocked}
								disabled={isSubmitting}
							/>
							<span class="text-sm" style="color: oklch(0.75 0.02 250);">
								Auto-spawn when unblocked
							</span>
						</label>
						<p class="text-xs mt-1" style="color: oklch(0.45 0.02 250);">
							{autoSpawnBlocked
								? 'Agents will be spawned as blocked tasks become ready'
								: 'Only spawn agents for currently ready tasks'}
						</p>
					</div>
					</div>
				</div>

				<!-- Preview Section -->
				<div
					class="rounded-lg p-3 mb-4"
					style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.28 0.02 250);"
				>
					<div class="flex items-center gap-2 mb-2" style="color: oklch(0.65 0.02 250);">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="font-mono text-sm">Launch Preview</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<span style="color: oklch(0.55 0.02 250);">Tasks:</span>
							<span class="font-mono font-bold" style="color: oklch(0.80 0.02 250);">
								{selectedCount} selected
							</span>
							{#if blockedChildren.filter((c) => selectedTaskIds.has(c.id)).length > 0}
								<span
									class="text-xs px-2 py-0.5 rounded font-mono"
									style="background: oklch(0.45 0.15 60 / 0.3); color: oklch(0.80 0.15 60);"
								>
									{blockedChildren.filter((c) => selectedTaskIds.has(c.id)).length} blocked (will
									wait)
								</span>
							{/if}
						</div>

						<div class="flex items-center gap-2">
							<span style="color: oklch(0.55 0.02 250);">Initial spawn:</span>
							<span class="font-mono font-bold" style="color: oklch(0.70 0.18 150);">
								{Math.min(readyChildren.filter((c) => selectedTaskIds.has(c.id)).length, maxConcurrent)}
								agents
							</span>
							<span class="text-xs" style="color: oklch(0.45 0.02 250);">
								({executionMode === 'parallel' ? `up to ${maxConcurrent} concurrent` : 'one at a time'})
							</span>
						</div>

						<div class="flex items-center gap-2">
							<span style="color: oklch(0.55 0.02 250);">Review:</span>
							<span class="font-mono" style="color: oklch(0.75 0.02 250);">
								{reviewThresholdOptions.find((o) => o.value === reviewThreshold)?.label}
							</span>
						</div>

						{#if autoSpawnBlocked && blockedChildren.filter((c) => selectedTaskIds.has(c.id)).length > 0}
							<div class="flex items-start gap-2 pt-1">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-4 h-4 flex-shrink-0 mt-0.5"
									style="color: oklch(0.70 0.15 200);"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
									/>
								</svg>
								<span class="text-xs" style="color: oklch(0.60 0.02 250);">
									{blockedChildren.filter((c) => selectedTaskIds.has(c.id)).length} blocked tasks will
									be auto-spawned when their dependencies complete.
								</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Error Message -->
				{#if submitError}
					<div
						class="alert mb-4 font-mono text-sm"
						style="background: oklch(0.35 0.15 25); border: 1px solid oklch(0.50 0.18 25); color: oklch(0.95 0.02 250);"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{submitError}</span>
					</div>
				{/if}

				<!-- Success Message -->
				{#if successMessage}
					<div
						class="alert mb-4 font-mono text-sm"
						style="background: oklch(0.35 0.15 150); border: 1px solid oklch(0.50 0.18 150); color: oklch(0.95 0.02 250);"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{successMessage}</span>
					</div>
				{/if}
			{/if}

			<!-- Actions -->
			<div class="flex gap-3 justify-end">
				<button class="btn btn-ghost" onclick={handleClose} disabled={isSubmitting}>Cancel</button>
				<button
					class="btn btn-primary font-mono gap-2"
					onclick={handleLaunch}
					disabled={!canLaunch || isSubmitting || isLoading}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						Launching...
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
						Launch Epic Swarm
					{/if}
				</button>
			</div>
			{/if}
		</div>
	</div>
{/if}
