<script lang="ts">
	/**
	 * CommandPalette Component
	 * Global command palette with Cmd+K shortcut (Raycast/Spotlight style)
	 *
	 * Features:
	 * - Keyboard shortcut (Cmd+K on Mac, Ctrl+K on Windows/Linux)
	 * - Fuzzy search for actions
	 * - Keyboard navigation (arrow keys, Enter to execute)
	 * - Escape to close
	 * - Common actions: navigate, create, search
	 */

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { openTaskDrawer } from '$lib/stores/drawerStore';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';

	// Modal state
	let isOpen = $state(false);
	let searchQuery = $state('');
	let selectedIndex = $state(0);
	let searchInput: HTMLInputElement;
	let resultsContainer: HTMLDivElement;
	let isKeyboardNavigation = $state(false); // Track if user is using keyboard

	// Task search state
	interface Task {
		id: string;
		title: string;
		status?: string;
		priority?: number;
		issue_type?: string;
		project?: string;
	}
	let searchMode = $state<'actions' | 'tasks'>('actions'); // 'actions' = command palette, 'tasks' = task search
	let tasks = $state<Task[]>([]);
	let isLoadingTasks = $state(false);
	let searchDebounceTimer: number;

	// Action registry
	interface Action {
		id: string;
		label: string;
		description: string;
		icon: string;
		keywords: string[];
		execute: () => void;
	}

	const actions: Action[] = [
		{
			id: 'nav-home',
			label: 'Go to Home',
			description: 'View all tasks in list mode',
			icon: '🏠',
			keywords: ['home', 'dashboard', 'tasks', 'list'],
			execute: () => {
				goto('/');
				close();
			}
		},
		{
			id: 'nav-dependency',
			label: 'Go to Dependency',
			description: 'View task dependency graph and relationships',
			icon: '🔗',
			keywords: ['dependency', 'graph', 'relationships', 'deps'],
			execute: () => {
				goto('/dependency');
				close();
			}
		},
		{
			id: 'nav-timeline',
			label: 'Go to Timeline',
			description: 'View task timeline and history',
			icon: '📅',
			keywords: ['timeline', 'history', 'chronological', 'time'],
			execute: () => {
				goto('/timeline');
				close();
			}
		},
		{
			id: 'nav-kanban',
			label: 'Go to Kanban',
			description: 'View tasks in kanban board format',
			icon: '📋',
			keywords: ['kanban', 'board', 'columns', 'workflow'],
			execute: () => {
				goto('/kanban');
				close();
			}
		},
		{
			id: 'nav-agents',
			label: 'Go to Agents',
			description: 'View agent coordination and task assignment',
			icon: '👥',
			keywords: ['agents', 'team', 'coordination', 'assign'],
			execute: () => {
				goto('/agents');
				close();
			}
		},
		{
			id: 'create-task',
			label: 'Create Task',
			description: 'Open task creation drawer',
			icon: '➕',
			keywords: ['create', 'new', 'task', 'add'],
			execute: () => {
				close();
				openTaskDrawer();
			}
		},
		{
			id: 'search-tasks',
			label: 'Search Tasks',
			description: 'Find tasks by searching keywords',
			icon: '🔍',
			keywords: ['search', 'find', 'filter', 'query'],
			execute: () => {
				// Switch to task search mode
				searchMode = 'tasks';
				searchQuery = '';
				selectedIndex = 0;
				tasks = [];
				// Don't close - stay in modal for search
			}
		},
		{
			id: 'toggle-theme',
			label: 'Change Theme',
			description: 'Switch between light and dark themes',
			icon: '🎨',
			keywords: ['theme', 'dark', 'light', 'appearance', 'style'],
			execute: () => {
				// Focus theme selector
				const themeBtn = document.querySelector('[aria-label="Change Theme"]');
				if (themeBtn instanceof HTMLElement) {
					themeBtn.click();
				}
				close();
			}
		},
		{
			id: 'refresh-data',
			label: 'Refresh Data',
			description: 'Reload current page data',
			icon: '🔄',
			keywords: ['refresh', 'reload', 'update', 'sync'],
			execute: () => {
				window.location.reload();
				close();
			}
		},
		{
			id: 'help-reference',
			label: 'Help & Reference',
			description: 'View agent commands, keyboard shortcuts, and README',
			icon: '📖',
			keywords: ['help', 'reference', 'docs', 'commands', 'shortcuts', 'guide', 'documentation'],
			execute: () => {
				// Trigger help modal by clicking the help button
				const helpBtn = document.querySelector('button[aria-label="Show help guide"]');
				if (helpBtn instanceof HTMLElement) {
					helpBtn.click();
				}
				close();
			}
		}
	];

	// Score-based search function
	// Higher scores = better matches, shown first
	function scoreAction(query: string, action: Action): number {
		const q = query.toLowerCase();
		const label = action.label.toLowerCase();
		const desc = action.description.toLowerCase();

		let score = 0;

		// Label matches (highest priority)
		if (label === q) {
			score += 100; // Exact label match
		} else if (label.startsWith(q)) {
			score += 80; // Label starts with query
		} else {
			// Check if query matches a word in the label
			const labelWords = label.split(/\s+/);
			if (labelWords.some(word => word === q)) {
				score += 70; // Exact word match in label (e.g., "task" in "Create Task")
			} else if (labelWords.some(word => word.startsWith(q))) {
				score += 60; // Word starts with query
			} else if (label.includes(q)) {
				score += 40; // Substring in label
			}
		}

		// Keyword matches (medium priority)
		if (action.keywords.some(kw => kw.toLowerCase() === q)) {
			score += 30; // Exact keyword match
		} else if (action.keywords.some(kw => kw.toLowerCase().startsWith(q))) {
			score += 20; // Keyword starts with query
		} else if (action.keywords.some(kw => kw.toLowerCase().includes(q))) {
			score += 10; // Substring in keyword
		}

		// Description matches (lowest priority)
		if (desc.includes(q)) {
			score += 5; // Substring in description
		}

		return score;
	}

	function searchActions(query: string): Action[] {
		if (!query.trim()) {
			return actions;
		}

		// Score all actions and filter out non-matches (score 0)
		const scored = actions
			.map(action => ({ action, score: scoreAction(query, action) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score); // Higher scores first

		return scored.map(({ action }) => action);
	}

	// Filtered actions based on search
	const filteredActions = $derived(searchActions(searchQuery));

	// Task search function with debouncing
	async function searchTasks(query: string) {
		// Clear existing timer
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		// If query is empty, clear tasks
		if (!query.trim()) {
			tasks = [];
			isLoadingTasks = false;
			return;
		}

		// Set loading state
		isLoadingTasks = true;

		// Debounce API call (300ms)
		searchDebounceTimer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/tasks?search=${encodeURIComponent(query)}`);
				const data = await response.json();
				tasks = data.tasks || [];
			} catch (error) {
				console.error('Task search error:', error);
				tasks = [];
			} finally {
				isLoadingTasks = false;
			}
		}, 300) as unknown as number;
	}

	// Trigger task search when query changes (only in task mode)
	$effect(() => {
		if (searchMode === 'tasks' && searchQuery) {
			searchTasks(searchQuery);
		}
	});

	// Open/close functions
	function open() {
		isOpen = true;
		searchQuery = '';
		selectedIndex = 0;
		searchMode = 'actions'; // Reset to actions mode
		tasks = [];
		isLoadingTasks = false;
		isKeyboardNavigation = false; // Reset keyboard navigation

		// Focus input after modal opens
		setTimeout(() => {
			searchInput?.focus();
		}, 50);
	}

	function close() {
		isOpen = false;
		searchQuery = '';
		selectedIndex = 0;
		searchMode = 'actions'; // Reset to actions mode
		tasks = [];
		isLoadingTasks = false;
		isKeyboardNavigation = false; // Reset keyboard navigation

		// Clear any pending search timers
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}
	}

	// Keyboard navigation
	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) return;

		const maxIndex = searchMode === 'actions' ? filteredActions.length - 1 : tasks.length - 1;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				isKeyboardNavigation = true;
				selectedIndex = Math.min(selectedIndex + 1, maxIndex);
				break;
			case 'ArrowUp':
				e.preventDefault();
				isKeyboardNavigation = true;
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (searchMode === 'actions') {
					if (filteredActions[selectedIndex]) {
						filteredActions[selectedIndex].execute();
					}
				} else {
					// Task mode: navigate to task
					if (tasks[selectedIndex]) {
						const task = tasks[selectedIndex];
						goto(`/?task=${task.id}`); // Navigate to home with task query param
						close();
					}
				}
				break;
			case 'Escape':
				e.preventDefault();
				// If in task mode, go back to actions mode
				if (searchMode === 'tasks') {
					searchMode = 'actions';
					searchQuery = '';
					selectedIndex = 0;
					tasks = [];
				} else {
					close();
				}
				break;
		}
	}

	// Global keyboard shortcut listener
	onMount(() => {
		function handleGlobalKeyDown(e: KeyboardEvent) {
			// Cmd+K on Mac, Ctrl+K on Windows/Linux
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				if (isOpen) {
					close();
				} else {
					open();
				}
			}
		}

		window.addEventListener('keydown', handleGlobalKeyDown);

		return () => {
			window.removeEventListener('keydown', handleGlobalKeyDown);
		};
	});

	// Reset selected index when query changes
	$effect(() => {
		if (searchQuery) {
			selectedIndex = 0;
			isKeyboardNavigation = false; // Reset keyboard navigation when typing
		}
	});

	// Scroll selected item into view when selection changes
	$effect(() => {
		if (isOpen && resultsContainer) {
			const selectedButton = resultsContainer.querySelector(`[data-index="${selectedIndex}"]`);
			if (selectedButton) {
				selectedButton.scrollIntoView({
					block: 'nearest',
					behavior: 'smooth'
				});
			}
		}
	});
</script>

<!-- Quick Actions Button (visible in navbar) - Industrial -->
<button
	class="px-2 py-1 rounded text-xs font-mono flex items-center gap-1.5 transition-all hover:scale-105"
	style="
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.35 0.02 250);
		color: oklch(0.60 0.02 250);
	"
	onclick={open}
	aria-label="Quick actions (Cmd+K)"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="w-3 h-3"
		style="color: oklch(0.55 0.02 250);"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
		/>
	</svg>
	<span class="hidden md:inline">⌘K</span>
</button>

<!-- Modal (stays in DOM, toggle modal-open class) - Industrial -->
<div class="modal {isOpen ? 'modal-open' : ''}" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
	<!-- Backdrop -->
	<div
		class="modal-backdrop"
		style="background: oklch(0.10 0.01 250 / 0.9);"
		role="button"
		tabindex="-1"
		onclick={close}
		onkeydown={(e) => e.key === 'Enter' && close()}
	></div>

	<!-- Command palette - Industrial -->
	<div
		class="modal-box max-w-2xl p-0 overflow-hidden"
		style="
			background: linear-gradient(180deg, oklch(0.18 0.01 250) 0%, oklch(0.16 0.01 250) 100%);
			border: 1px solid oklch(0.35 0.02 250);
			box-shadow: 0 25px 50px -12px oklch(0 0 0 / 0.5);
		"
	>
			<!-- Search input - Industrial -->
			<div
				class="p-4 relative"
				style="
					background: linear-gradient(180deg, oklch(0.22 0.01 250) 0%, oklch(0.20 0.01 250) 100%);
					border-bottom: 1px solid oklch(0.35 0.02 250);
				"
			>
				<!-- Left accent bar -->
				<div
					class="absolute left-0 top-0 bottom-0 w-1"
					style="background: linear-gradient(180deg, oklch(0.70 0.18 240) 0%, oklch(0.70 0.18 240 / 0.3) 100%);"
				></div>
				<div class="flex items-center gap-3">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-5 h-5"
						style="color: oklch(0.70 0.18 240);"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
					</svg>
					<input
						bind:this={searchInput}
						bind:value={searchQuery}
						onkeydown={handleKeyDown}
						type="text"
						placeholder={searchMode === 'actions' ? 'Search actions...' : 'Search tasks...'}
						class="input input-ghost w-full focus:outline-none text-lg font-mono"
						style="background: transparent; color: oklch(0.85 0.02 250);"
						autocomplete="off"
						aria-label={searchMode === 'actions' ? 'Search command palette' : 'Search tasks'}
					/>
					<kbd class="kbd kbd-sm font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">ESC</kbd>
				</div>
			</div>

			<!-- Results list - Industrial -->
			<div class="max-h-96 overflow-y-auto" style="background: oklch(0.16 0.01 250);" bind:this={resultsContainer}>
				{#if searchMode === 'actions'}
					<!-- Actions list - Industrial -->
					{#if filteredActions.length === 0}
						<div class="p-8 text-center" style="color: oklch(0.50 0.02 250);">
							<p class="text-lg mb-2 font-mono">No actions found</p>
							<p class="text-sm">Try different search terms</p>
						</div>
					{:else}
						<div class="p-2 space-y-1">
							{#each filteredActions as action, index}
								<button
									type="button"
									data-index={index}
									class="flex items-start gap-3 p-3 rounded-lg w-full transition-all"
									style="
										background: {index === selectedIndex ? 'oklch(0.70 0.18 240 / 0.15)' : 'transparent'};
										border-left: 2px solid {index === selectedIndex ? 'oklch(0.70 0.18 240)' : 'transparent'};
									"
									onclick={() => action.execute()}
									onmouseenter={() => {
										if (!isKeyboardNavigation) {
											selectedIndex = index;
										}
									}}
									onmousemove={() => {
										isKeyboardNavigation = false;
									}}
								>
										<span class="text-2xl flex-shrink-0">{action.icon}</span>
										<div class="flex-1 text-left min-w-0">
											<div class="font-medium font-mono" style="color: {index === selectedIndex ? 'oklch(0.85 0.10 240)' : 'oklch(0.80 0.02 250)'};">{action.label}</div>
											<div
												class="text-sm"
												style="color: oklch(0.55 0.02 250);"
											>
												{action.description}
											</div>
										</div>
									{#if index === selectedIndex}
										<kbd class="kbd kbd-sm flex-shrink-0 font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.70 0.18 240);">↵</kbd>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Task search results - Industrial -->
					{#if isLoadingTasks}
						<div class="p-8 text-center">
							<span class="loading loading-spinner loading-lg" style="color: oklch(0.70 0.18 240);"></span>
							<p class="text-sm mt-4 font-mono" style="color: oklch(0.55 0.02 250);">Searching tasks...</p>
						</div>
					{:else if !searchQuery.trim()}
						<div class="p-8 text-center" style="color: oklch(0.50 0.02 250);">
							<p class="text-lg mb-2 font-mono">Start typing to search</p>
							<p class="text-sm">Search by task ID, title, description, or labels</p>
						</div>
					{:else if tasks.length === 0}
						<div class="p-8 text-center" style="color: oklch(0.50 0.02 250);">
							<p class="text-lg mb-2 font-mono">No tasks found</p>
							<p class="text-sm">Try different search terms</p>
						</div>
					{:else}
						<!-- Group tasks by project -->
						{@const groupedTasks = tasks.reduce<Record<string, Task[]>>((acc, task) => {
							const project = task.project || 'unknown';
							if (!acc[project]) acc[project] = [];
							acc[project].push(task);
							return acc;
						}, {})}

						<div class="p-2">
							{#each Object.entries(groupedTasks) as [project, projectTasks] (project)}
								<!-- Project header - Industrial -->
								<div
									class="px-3 py-1.5 text-xs font-semibold font-mono uppercase tracking-wider sticky top-0 backdrop-blur-sm"
									style="color: oklch(0.55 0.02 250); background: oklch(0.20 0.01 250 / 0.95);"
								>
									{project} ({projectTasks.length})
								</div>

								<!-- Tasks in this project - Industrial -->
								<div class="mb-3 space-y-1">
									{#each projectTasks as task}
										{@const flatIndex = tasks.indexOf(task)}
										<button
											type="button"
											data-index={flatIndex}
											class="flex items-start gap-3 p-3 rounded-lg w-full transition-all"
											style="
												background: {flatIndex === selectedIndex ? 'oklch(0.70 0.18 240 / 0.15)' : 'transparent'};
												border-left: 2px solid {flatIndex === selectedIndex ? 'oklch(0.70 0.18 240)' : 'transparent'};
											"
											onclick={() => {
												goto(`/?task=${task.id}`);
												close();
											}}
											onmouseenter={() => {
												if (!isKeyboardNavigation) {
													selectedIndex = flatIndex;
												}
											}}
											onmousemove={() => {
												isKeyboardNavigation = false;
											}}
										>
												<!-- Priority badge -->
												<div class="flex-shrink-0">
													<span
														class="badge badge-sm {task.priority === 0
															? 'badge-error'
															: task.priority === 1
																? 'badge-warning'
																: task.priority === 2
																	? 'badge-info'
																	: 'badge-ghost'}"
													>
														P{task.priority}
													</span>
												</div>
												<!-- Task details -->
												<div class="flex-1 text-left min-w-0">
													<div class="flex items-center gap-2 mb-1">
														<TaskIdBadge {task} size="xs" minimal />
														<span class="font-medium font-mono truncate" style="color: {flatIndex === selectedIndex ? 'oklch(0.85 0.10 240)' : 'oklch(0.80 0.02 250)'};">{task.title}</span>
													</div>
													{#if task.description}
														<div
															class="text-sm line-clamp-1"
															style="color: oklch(0.55 0.02 250);"
														>
															{task.description}
														</div>
													{/if}
													{#if task.labels && task.labels.length > 0}
														<div class="flex gap-1 mt-1 flex-wrap">
															{#each task.labels.slice(0, 3) as label}
																<span class="badge badge-xs badge-outline">{label}</span>
															{/each}
															{#if task.labels.length > 3}
																<span class="badge badge-xs badge-ghost">+{task.labels.length - 3}</span>
															{/if}
														</div>
													{/if}
												</div>
											{#if flatIndex === selectedIndex}
												<kbd class="kbd kbd-sm flex-shrink-0 font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.70 0.18 240);">↵</kbd>
											{/if}
										</button>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer with keyboard hints - Industrial -->
			<div
				class="p-3 flex items-center justify-between text-xs"
				style="
					background: linear-gradient(180deg, oklch(0.20 0.01 250) 0%, oklch(0.18 0.01 250) 100%);
					border-top: 1px solid oklch(0.35 0.02 250);
				"
			>
				<div class="flex gap-4">
					<div class="flex items-center gap-1">
						<kbd class="kbd kbd-xs font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">↑</kbd>
						<kbd class="kbd kbd-xs font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">↓</kbd>
						<span style="color: oklch(0.50 0.02 250);">Navigate</span>
					</div>
					<div class="flex items-center gap-1">
						<kbd class="kbd kbd-xs font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">↵</kbd>
						<span style="color: oklch(0.50 0.02 250);">Select</span>
					</div>
					<div class="flex items-center gap-1">
						<kbd class="kbd kbd-xs font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">ESC</kbd>
						<span style="color: oklch(0.50 0.02 250);">{searchMode === 'tasks' ? 'Back' : 'Close'}</span>
					</div>
				</div>
				<div class="flex items-center gap-1">
					<kbd class="kbd kbd-xs font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">⌘</kbd>
					<span style="color: oklch(0.50 0.02 250);">+</span>
					<kbd class="kbd kbd-xs font-mono" style="background: oklch(0.25 0.01 250); border-color: oklch(0.35 0.02 250); color: oklch(0.60 0.02 250);">K</kbd>
					<span style="color: oklch(0.50 0.02 250);" class="ml-1">to open</span>
				</div>
			</div>
		</div>
	</div>
