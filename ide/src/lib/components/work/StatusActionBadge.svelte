<script lang="ts">
	/**
	 * StatusActionBadge Component
	 *
	 * A clickable status badge that opens a dropdown with context-specific actions.
	 * Replaces static status badges (DONE, WORKING, etc.) with actionable buttons.
	 *
	 * Configuration is imported from statusColors.ts for consistency.
	 * Plays contextual sounds for each action type.
	 */

	import { fly } from "svelte/transition";
	import {
		getSessionStateVisual,
		type SessionStateVisual,
		type SessionStateAction,
		type SessionState,
	} from "$lib/config/statusColors";
	import {
		getActions,
		loadUserConfig,
		getIsLoaded,
	} from "$lib/stores/stateActionsConfig.svelte";
	import {
		playTaskCompleteSound,
		playCleanupSound,
		playKillSound,
		playAttachSound,
		playInterruptSound,
		playTaskStartSound,
	} from "$lib/utils/soundEffects";
	import { slide } from "svelte/transition";
	import { successToast, infoToast } from "$lib/stores/toasts.svelte";
	import AnimatedDigits from "$lib/components/AnimatedDigits.svelte";

	interface SlashCommand {
		name: string;
		invocation: string;
		namespace: string;
		path: string;
	}

	interface NextTaskInfo {
		taskId: string;
		taskTitle: string;
		source: "epic" | "backlog";
		epicId?: string;
		epicTitle?: string;
	}

	interface Epic {
		id: string;
		title: string;
		status: string;
		priority: number;
		dependency_count?: number;
	}

	interface TaskInfo {
		id: string;
		issue_type?: string;
		priority?: number;
	}

	interface ElapsedTime {
		hours: string;
		minutes: string;
		seconds: string;
		showHours: boolean;
	}

	interface Props {
		sessionState: SessionState;
		sessionName: string;
		disabled?: boolean;
		dropUp?: boolean;
		alignRight?: boolean;
		/** Elapsed time to display in badge (optional) */
		elapsed?: ElapsedTime | null;
		/** 'badge' = standalone badge with bg/border, 'integrated' = minimal style for embedding in tabs */
		variant?: "badge" | "integrated";
		/** When true, shows dormant variant (💤) for states that support it (completed) */
		isDormant?: boolean;
		/** Tooltip text for dormant state (e.g., "Inactive for 15 minutes") */
		dormantTooltip?: string | null;
		/** Next task info to display in "Start Next" action (for completed state) */
		nextTask?: NextTaskInfo | null;
		/** Whether next task is being loaded */
		nextTaskLoading?: boolean;
		/** Seconds until auto-kill (null = no auto-kill scheduled) */
		autoKillCountdown?: number | null;
		/** Callback to cancel auto-kill countdown (called when dropdown opens) */
		onCancelAutoKill?: () => void;
		onAction?: (actionId: string) => Promise<void> | void;
		/** Whether to show slash commands section in dropdown */
		showCommands?: boolean;
		/** Callback to run a slash command */
		onCommand?: (command: string) => Promise<void> | void;
		/** Current task info for epic linking (id, issue_type, priority) */
		task?: TaskInfo | null;
		/** Whether to show add to epic section in dropdown */
		showEpic?: boolean;
		/** Project name for fetching epics when no task is selected */
		project?: string | null;
		/** Callback when task is linked to an epic */
		onLinkToEpic?: (epicId: string) => Promise<void> | void;
		/** Callback when an epic is clicked without a task (for viewing/navigation) */
		onViewEpic?: (epicId: string) => Promise<void> | void;
		class?: string;
		/** When true, displays elapsed time below the status label instead of inline (for compact table layouts) */
		stacked?: boolean;
		/** Apply entrance animation to text (tracking-in-expand) */
		animate?: boolean;
		/** Whether auto-complete is enabled (toggle state) */
		autoCompleteEnabled?: boolean;
		/** Callback when auto-complete toggle is clicked */
		onAutoCompleteToggle?: () => void;
		/** Reason from review rules (e.g., "P3 task") for tooltip */
		reviewReason?: string | null;
	}

	let {
		sessionState,
		sessionName,
		disabled = false,
		dropUp = false,
		alignRight = false,
		elapsed = null,
		variant = "badge",
		isDormant = false,
		dormantTooltip = null,
		nextTask = null,
		nextTaskLoading = false,
		autoKillCountdown = null,
		onCancelAutoKill,
		onAction,
		showCommands = false,
		onCommand,
		task = null,
		showEpic = false,
		project = null,
		onLinkToEpic,
		onViewEpic,
		class: className = "",
		stacked = false,
		animate = false,
		autoCompleteEnabled = false,
		onAutoCompleteToggle,
		reviewReason = null,
	}: Props = $props();

	// Dropdown state
	let isOpen = $state(false);
	let isExecuting = $state(false);
	let dropdownRef: HTMLDivElement | null = null;

	// Commands state
	let commands = $state<SlashCommand[]>([]);
	let commandsLoading = $state(false);
	let commandsError = $state<string | null>(null);
	let commandsExpanded = $state(false);
	let commandSearchQuery = $state("");
	let commandSearchInput: HTMLInputElement;
	let selectedCommandIndex = $state(0);

	// Epic state
	let epics = $state<Epic[]>([]);
	let epicsLoading = $state(false);
	let epicsError = $state<string | null>(null);
	let epicExpanded = $state(false);
	let epicSearchQuery = $state("");
	let epicSearchInput: HTMLInputElement;
	let selectedEpicIndex = $state(0);
	let linkingEpicId = $state<string | null>(null);

	// Create epic state
	let showCreateEpic = $state(false);
	let newEpicTitle = $state("");
	let creatingEpic = $state(false);
	let createEpicError = $state<string | null>(null);
	let newEpicInput: HTMLInputElement;

	// Get config from centralized statusColors.ts
	const config = $derived(getSessionStateVisual(sessionState));
	// Get actions from configurable store (merges user config with defaults)
	const actions = $derived(getActions(sessionState));

	// Load user config on mount (if not already loaded)
	$effect(() => {
		if (!getIsLoaded()) {
			loadUserConfig();
		}
	});

	// Score-based command search (adapted from CommandPalette)
	function scoreCommand(query: string, cmd: SlashCommand): number {
		const q = query.toLowerCase();
		const name = cmd.name.toLowerCase();
		const invocation = cmd.invocation.toLowerCase();

		let score = 0;

		// Invocation matches (highest priority - what users type)
		if (invocation === q) {
			score += 100;
		} else if (invocation.startsWith(q)) {
			score += 80;
		} else if (invocation.includes(q)) {
			score += 60;
		}

		// Name matches
		if (name === q) {
			score += 50;
		} else if (name.startsWith(q)) {
			score += 40;
		} else if (name.includes(q)) {
			score += 20;
		}

		// Namespace matches (lowest priority)
		if (cmd.namespace.toLowerCase().includes(q)) {
			score += 10;
		}

		return score;
	}

	function filterCommands(query: string): SlashCommand[] {
		if (!query.trim()) {
			return commands;
		}

		return commands
			.map((cmd) => ({ cmd, score: scoreCommand(query, cmd) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ cmd }) => cmd);
	}

	const filteredCommands = $derived(filterCommands(commandSearchQuery));

	// Get display label (use dormant variant if applicable)
	const displayLabel = $derived(
		isDormant && config.dormantLabel ? config.dormantLabel : config.label,
	);
	const displayShortLabel = $derived(
		isDormant && config.dormantShortLabel
			? config.dormantShortLabel
			: config.shortLabel,
	);

	// Handle click outside to close dropdown
	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	// Setup and cleanup click outside listener
	$effect(() => {
		if (isOpen) {
			document.addEventListener("click", handleClickOutside);
			return () => document.removeEventListener("click", handleClickOutside);
		}
	});

	// Fetch commands when dropdown opens (if showCommands is enabled)
	$effect(() => {
		if (isOpen && showCommands && commands.length === 0 && !commandsLoading) {
			fetchCommands();
		}
	});

	// Focus search input when commands section expands
	$effect(() => {
		if (commandsExpanded && commandSearchInput) {
			setTimeout(() => commandSearchInput?.focus(), 50);
		}
	});

	// Reset search and selection when commands section collapses or dropdown closes
	$effect(() => {
		if (!commandsExpanded || !isOpen) {
			commandSearchQuery = "";
			selectedCommandIndex = 0;
		}
	});

	// Reset selected index when search query changes
	$effect(() => {
		if (commandSearchQuery !== undefined) {
			selectedCommandIndex = 0;
		}
	});

	// Fetch epics when dropdown opens (if showEpic is enabled and we have a project source)
	$effect(() => {
		const hasProjectSource = task || project;
		if (
			isOpen &&
			showEpic &&
			hasProjectSource &&
			epics.length === 0 &&
			!epicsLoading
		) {
			fetchEpics();
		}
	});

	// Focus epic search input when epic section expands
	$effect(() => {
		if (epicExpanded && epicSearchInput) {
			setTimeout(() => epicSearchInput?.focus(), 50);
		}
	});

	// Reset epic search and selection when section collapses or dropdown closes
	$effect(() => {
		if (!epicExpanded || !isOpen) {
			epicSearchQuery = "";
			selectedEpicIndex = 0;
		}
	});

	// Reset epics list when dropdown closes (forces fresh fetch on next open)
	$effect(() => {
		if (!isOpen) {
			epics = [];
			epicsError = null;
		}
	});

	// Reset selected epic index when search query changes
	$effect(() => {
		if (epicSearchQuery !== undefined) {
			selectedEpicIndex = 0;
		}
	});

	// Handle keyboard navigation in commands search
	function handleCommandKeyDown(e: KeyboardEvent) {
		const maxIndex = filteredCommands.length - 1;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				selectedCommandIndex = Math.min(selectedCommandIndex + 1, maxIndex);
				break;
			case "ArrowUp":
				e.preventDefault();
				selectedCommandIndex = Math.max(selectedCommandIndex - 1, 0);
				break;
			case "Enter":
				e.preventDefault();
				if (filteredCommands[selectedCommandIndex]) {
					executeCommand(filteredCommands[selectedCommandIndex].invocation);
				}
				break;
			case "Escape":
				e.preventDefault();
				if (commandSearchQuery) {
					// Clear search first
					commandSearchQuery = "";
				} else {
					// Collapse commands section
					commandsExpanded = false;
				}
				break;
		}
	}

	// Fetch available slash commands
	async function fetchCommands() {
		commandsLoading = true;
		commandsError = null;
		try {
			const response = await fetch("/api/commands");
			if (!response.ok) throw new Error("Failed to fetch commands");
			const data = await response.json();
			commands = data.commands || [];
		} catch (err) {
			commandsError =
				err instanceof Error ? err.message : "Failed to load commands";
		} finally {
			commandsLoading = false;
		}
	}

	// Execute a slash command
	async function executeCommand(command: string) {
		if (disabled || isExecuting) return;

		isExecuting = true;
		try {
			await onCommand?.(command);
		} finally {
			isExecuting = false;
			isOpen = false;
		}
	}

	// Fetch available epics for the current project
	async function fetchEpics() {
		// Determine project: from task ID or from project prop
		const projectName = task?.id?.split("-")[0] || project;
		if (!projectName) return;

		epicsLoading = true;
		epicsError = null;
		try {
			const response = await fetch(`/api/epics?project=${projectName}`);
			if (!response.ok) throw new Error("Failed to fetch epics");
			const data = await response.json();
			epics = data.epics || [];
		} catch (err) {
			epicsError = err instanceof Error ? err.message : "Failed to load epics";
		} finally {
			epicsLoading = false;
		}
	}

	// Filter epics based on search query
	function filterEpics(query: string): Epic[] {
		if (!query.trim()) {
			return epics;
		}
		const q = query.toLowerCase();
		return epics.filter(
			(epic) =>
				epic.id.toLowerCase().includes(q) ||
				epic.title.toLowerCase().includes(q),
		);
	}

	const filteredEpics = $derived(filterEpics(epicSearchQuery));

	// Handle keyboard navigation in epic search
	function handleEpicKeyDown(e: KeyboardEvent) {
		const maxIndex = filteredEpics.length - 1;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				selectedEpicIndex = Math.min(selectedEpicIndex + 1, maxIndex);
				break;
			case "ArrowUp":
				e.preventDefault();
				selectedEpicIndex = Math.max(selectedEpicIndex - 1, 0);
				break;
			case "Enter":
				e.preventDefault();
				if (filteredEpics[selectedEpicIndex]) {
					linkToEpic(filteredEpics[selectedEpicIndex].id);
				}
				break;
			case "Escape":
				e.preventDefault();
				if (epicSearchQuery) {
					epicSearchQuery = "";
				} else {
					epicExpanded = false;
				}
				break;
		}
	}

	// Link current task to an epic
	async function linkToEpic(epicId: string) {
		if (disabled || isExecuting || !task || linkingEpicId) return;

		linkingEpicId = epicId;
		try {
			const response = await fetch(`/api/tasks/${task.id}/epic`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ epicId }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to link task to epic");
			}

			const data = await response.json();

			// Show toast notification based on result
			if (data.alreadyLinked) {
				infoToast(`Task already linked to epic`);
			} else if (data.movedFrom) {
				successToast(
					`Task ${task.id} moved from ${data.movedFrom} to ${epicId}`,
				);
			} else if (data.epicReopened) {
				successToast(
					`Task ${task.id} linked to epic ${epicId} (epic reopened)`,
				);
			} else {
				successToast(`Task ${task.id} linked to epic ${epicId}`);
			}

			// Call the callback if provided (refreshes task and session data)
			await onLinkToEpic?.(epicId);

			// Close dropdown on success
			isOpen = false;
		} catch (err) {
			console.error("Failed to link task to epic:", err);
			epicsError = err instanceof Error ? err.message : "Failed to link task";
		} finally {
			linkingEpicId = null;
		}
	}

	async function createEpic() {
		if (
			disabled ||
			isExecuting ||
			!task ||
			creatingEpic ||
			!newEpicTitle.trim()
		)
			return;

		creatingEpic = true;
		createEpicError = null;

		try {
			// Extract project from current task ID (e.g., "jat-abc" -> "jat")
			const project = task.id.split("-")[0];

			const response = await fetch("/api/epics", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: newEpicTitle.trim(),
					project,
					linkTaskId: task.id, // Automatically link the current task
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to create epic");
			}

			const data = await response.json();

			// Call the callback if provided (epic was auto-linked)
			await onLinkToEpic?.(data.epicId);

			// Reset form and close
			newEpicTitle = "";
			showCreateEpic = false;
			isOpen = false;
		} catch (err) {
			console.error("Failed to create epic:", err);
			createEpicError =
				err instanceof Error ? err.message : "Failed to create epic";
		} finally {
			creatingEpic = false;
		}
	}

	function handleCreateEpicKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && newEpicTitle.trim()) {
			e.preventDefault();
			createEpic();
		} else if (e.key === "Escape") {
			e.preventDefault();
			showCreateEpic = false;
			newEpicTitle = "";
			createEpicError = null;
		}
	}

	// Get icon for known commands
	function getCommandIcon(invocation: string): string {
		if (invocation.includes("start"))
			return "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z";
		if (invocation.includes("complete"))
			return "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
		if (invocation.includes("pause")) return "M15.75 5.25v13.5m-7.5-13.5v13.5";
		if (invocation.includes("status"))
			return "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z";
		if (invocation.includes("help"))
			return "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z";
		if (invocation.includes("verify"))
			return "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z";
		if (invocation.includes("plan"))
			return "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z";
		if (invocation.includes("bead"))
			return "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125";
		if (invocation.includes("commit"))
			return "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5";
		if (invocation.includes("doctor"))
			return "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z";
		if (invocation.includes("next"))
			return "M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z";
		// Default terminal icon
		return "M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z";
	}

	// Play sound based on action type
	function playActionSound(actionId: string): void {
		switch (actionId) {
			case "complete":
			case "complete-kill":
				playTaskCompleteSound();
				break;
			case "cleanup":
				playCleanupSound();
				break;
			case "kill":
				playKillSound();
				break;
			case "attach":
				playAttachSound();
				break;
			case "interrupt":
			case "escape":
				playInterruptSound();
				break;
			case "start":
			case "start-next":
			case "resume":
				playTaskStartSound();
				break;
			// 'view-task' is silent - just viewing
		}
	}

	// Handle action execution
	async function executeAction(action: SessionStateAction) {
		if (disabled || isExecuting) return;

		isExecuting = true;
		try {
			// Play sound before executing action
			playActionSound(action.id);

			// Check if this is a custom command action (has command property)
			if (action.command && onCommand) {
				// Custom command - use onCommand callback to send the slash command
				await onCommand(action.command);
			} else {
				// Built-in action - use onAction callback
				await onAction?.(action.id);
			}
		} finally {
			isExecuting = false;
			isOpen = false;
		}
	}

	// Get variant colors for dropdown items
	function getVariantClasses(variant: SessionStateAction["variant"]): string {
		switch (variant) {
			case "success":
				return "hover:bg-success/20 text-success";
			case "warning":
				return "hover:bg-warning/20 text-warning";
			case "error":
				return "hover:bg-error/20 text-error";
			case "info":
				return "hover:bg-info/20 text-info";
			default:
				// Use base-content/10 overlay since dropdown bg is base-300
				return "hover:bg-base-content/10 text-base-content";
		}
	}

	// Get dynamic label/description for actions that need runtime data
	function getActionLabel(action: SessionStateAction): string {
		if (action.id === "start-next" && nextTask) {
			// Clear distinction between epic continuation and backlog pick
			if (nextTask.source === "epic") {
				return `Continue: ${nextTask.taskId}`;
			} else {
				return `Start: ${nextTask.taskId}`;
			}
		}
		return action.label;
	}

	function getActionDescription(
		action: SessionStateAction,
	): string | undefined {
		if (action.id === "start-next") {
			if (nextTaskLoading) {
				return "Finding next task...";
			}
			if (nextTask) {
				return nextTask.taskTitle;
			}
			return "No ready tasks available";
		}
		return action.description;
	}

	// Get source badge info for start-next action
	function getSourceBadge(
		action: SessionStateAction,
	): { label: string; colorClass: string } | null {
		if (action.id === "start-next" && nextTask) {
			if (nextTask.source === "epic") {
				return {
					label: nextTask.epicId ? `🏔️ ${nextTask.epicId}` : "🏔️ EPIC",
					colorClass: "source-badge-epic",
				};
			} else {
				return {
					label: "📋 BACKLOG",
					colorClass: "source-badge-backlog",
				};
			}
		}
		return null;
	}

	// Check if action should be disabled
	function isActionDisabled(action: SessionStateAction): boolean {
		if (action.id === "start-next") {
			return nextTaskLoading || !nextTask;
		}
		return false;
	}
</script>

<div
	class="relative inline-block {className} pr-2 pb-1"
	bind:this={dropdownRef}
>
	<!-- Status Badge Button -->
	<button
		type="button"
		onclick={() => {
			if (disabled) return;
			const wasOpen = isOpen;
			isOpen = !isOpen;
			// Cancel auto-kill countdown when user opens dropdown (shows they're paying attention)
			if (
				!wasOpen &&
				autoKillCountdown !== null &&
				autoKillCountdown > 0 &&
				onCancelAutoKill
			) {
				onCancelAutoKill();
			}
		}}
		class="w-[130px] font-mono tracking-wider flex-shrink-0 font-bold cursor-pointer transition-all focus:outline-none {variant ===
		'integrated'
			? 'text-[11px] px-2 py-0.5 hover:bg-white/5 rounded'
			: 'text-[13px] pt-1.5 pb-1 rounded hover:scale-105 hover:brightness-110 focus:ring-2 focus:ring-offset-1 focus:ring-offset-base-100'} {stacked ? 'flex flex-col items-center gap-0' : ''}"
		class:animate-pulse={config.pulse && variant === "badge"}
		class:cursor-not-allowed={disabled}
		class:opacity-50={disabled}
		style={variant === "integrated"
			? `color: ${config.textColor};`
			: `background: ${config.bgColor}; color: ${config.textColor}; border: 1px solid ${config.borderColor};`}
		{disabled}
		title={dormantTooltip || config.description || "Click for actions"}
	>
		{#if stacked}
			<!-- Stacked layout: label on top, elapsed time below -->
			<span class="flex items-center">
				<span class={animate ? 'tracking-in-expand' : ''} style={animate ? 'animation-delay: 100ms;' : ''}>{variant === "integrated" ? displayShortLabel : displayLabel}</span>
				<!-- Dropdown indicator -->
				<svg
					class="ml-1 inline-block w-2.5 h-2.5 ml-0.5 transition-transform"
					class:rotate-180={dropUp ? !isOpen : isOpen}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 8.25l-7.5 7.5-7.5-7.5"
					/>
				</svg>
			</span>
			{#if elapsed}
				<span class="elapsed-time text-[8px] opacity-80">
					{#if elapsed.showHours}
						<AnimatedDigits value={elapsed.hours} class="text-[12px]" />
						<span class="elapsed-sep">:</span>
					{/if}
					<AnimatedDigits value={elapsed.minutes} class="text-[12px]" />
					<span class="elapsed-sep">:</span>
					<AnimatedDigits value={elapsed.seconds} class="text-[12px]" />
				</span>
			{/if}
			{#if autoKillCountdown !== null && autoKillCountdown > 0}
				<span
					class="font-mono text-[8px] opacity-75"
					title="Session will be cleaned up in {autoKillCountdown}s"
				>
					({autoKillCountdown}s)
				</span>
			{/if}
		{:else}
			<!-- Default inline layout -->
			<span class={animate ? 'tracking-in-expand' : ''} style={animate ? 'animation-delay: 100ms;' : ''}>{variant === "integrated" ? displayShortLabel : displayLabel}</span>
			{#if elapsed}
				<span class="elapsed-time">
					{#if elapsed.showHours}
						<AnimatedDigits value={elapsed.hours} class="text-[9px]" />
						<span class="elapsed-sep">:</span>
					{/if}
					<AnimatedDigits value={elapsed.minutes} class="text-[9px]" />
					<span class="elapsed-sep">:</span>
					<AnimatedDigits value={elapsed.seconds} class="text-[9px]" />
				</span>
			{/if}
			{#if autoKillCountdown !== null && autoKillCountdown > 0}
				<span
					class="ml-1 font-mono text-[9px] opacity-75"
					title="Session will be cleaned up in {autoKillCountdown}s"
				>
					({autoKillCountdown}s)
				</span>
			{/if}
			<!-- Dropdown indicator -->
			<svg
				class="inline-block w-2.5 h-2.5 ml-0.5 transition-transform"
				class:rotate-180={dropUp ? !isOpen : isOpen}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19.5 8.25l-7.5 7.5-7.5-7.5"
				/>
			</svg>
		{/if}
	</button>

	<!-- Dropdown Menu -->
	{#if isOpen}
		<div
			class="status-dropdown absolute z-40 min-w-[180px] rounded-lg shadow-xl overflow-hidden {dropUp
				? 'bottom-full mb-1'
				: 'top-full mt-1'}"
			style={alignRight ? 'left: 100%; right: auto; transform: translateX(-100%);' : 'left: 0; right: auto;'}
			transition:fly={{ y: dropUp ? 5 : -5, duration: 150 }}
		>
			<!-- Actions list -->
			<ul class="py-1">
				{#each actions as action (action.id)}
					{@const actionDisabled = isActionDisabled(action)}
					{@const actionLabel = getActionLabel(action)}
					{@const actionDescription = getActionDescription(action)}
					{@const sourceBadge = getSourceBadge(action)}
					<li>
						<button
							type="button"
							onclick={() => executeAction(action)}
							class="w-full px-3 py-2 flex items-center gap-2 text-left text-xs transition-colors {getVariantClasses(
								action.variant,
							)}"
							class:opacity-50={actionDisabled}
							class:cursor-not-allowed={actionDisabled}
							disabled={isExecuting || actionDisabled}
						>
							{#if isExecuting || (action.id === "start-next" && nextTaskLoading)}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg
									class="w-4 h-4 flex-shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d={action.icon}
									/>
								</svg>
							{/if}
							<div class="flex flex-col min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="font-semibold">{actionLabel}</span>
									{#if sourceBadge}
										<span
											class="text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap {sourceBadge.colorClass}"
										>
											{sourceBadge.label}
										</span>
									{/if}
								</div>
								{#if actionDescription}
									<span class="text-[10px] opacity-60 truncate"
										>{actionDescription}</span
									>
								{/if}
							</div>
						</button>
					</li>
				{/each}
			</ul>

			<!-- Auto-complete toggle -->
			{#if onAutoCompleteToggle && task}
				<div class="border-t commands-divider px-3 py-2">
					<button
						type="button"
						onclick={() => onAutoCompleteToggle?.()}
						class="w-full flex items-center justify-between text-xs"
					>
						<div class="flex items-center gap-2">
							{#if autoCompleteEnabled}
								<svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
								</svg>
							{:else}
								<svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
							{/if}
							<div class="flex flex-col items-start">
								<span class="font-semibold {autoCompleteEnabled ? 'text-emerald-300' : 'text-amber-300'}">
									{autoCompleteEnabled ? 'Auto-complete' : 'Manual review'}
								</span>
								{#if reviewReason}
									<span class="text-[10px] opacity-60">{reviewReason}</span>
								{/if}
							</div>
						</div>
						<div
							class="w-8 h-4 rounded-full transition-colors relative {autoCompleteEnabled
								? 'bg-emerald-500/30'
								: 'bg-amber-500/30'}"
						>
							<div
								class="absolute top-0.5 w-3 h-3 rounded-full transition-all {autoCompleteEnabled
									? 'left-4 bg-emerald-400'
									: 'left-0.5 bg-amber-400'}"
							></div>
						</div>
					</button>
				</div>
			{/if}

			<!-- Epic section (collapsible) - Add task to epic -->
			{#if showEpic}
				<div class="border-t commands-divider">
					<!-- Epic header (toggle) -->
					<button
						type="button"
						onclick={() => (epicExpanded = !epicExpanded)}
						class="w-full px-3 py-1.5 flex items-center justify-between text-[10px] font-semibold text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
					>
						<span class="flex items-center gap-1.5">
							<svg
								class="w-3 h-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<!-- Mountain/Epic icon -->
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
								/>
							</svg>
							Add to Epic
						</span>
						<svg
							class="w-3 h-3 transition-transform"
							class:rotate-180={epicExpanded}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/>
						</svg>
					</button>

					<!-- Epic list (expandable) -->
					{#if epicExpanded}
						<div class="commands-panel" transition:slide={{ duration: 150 }}>
							<!-- Handle epic-type-task case -->
							{#if task?.issue_type === "epic"}
								<div class="px-3 py-3 text-center text-[10px] text-white/50">
									This task is already an epic
								</div>
								<!-- Show epic list (with or without a task) -->
							{:else}
								{@const canLink = task && task.issue_type !== "epic"}
								<!-- Search input (show when there are many epics) -->
								{#if epics.length > 3}
									<div class="px-2 py-1.5 border-b commands-search-border">
										<div class="relative flex items-center gap-1.5">
											<svg
												class="w-3 h-3 flex-shrink-0 commands-search-icon"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="2"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
												/>
											</svg>
											<input
												bind:this={epicSearchInput}
												bind:value={epicSearchQuery}
												onkeydown={handleEpicKeyDown}
												type="text"
												placeholder="Filter epics..."
												class="w-full bg-transparent text-[10px] font-mono focus:outline-none commands-search-input"
												autocomplete="off"
											/>
											{#if epicSearchQuery}
												<button
													type="button"
													onclick={() => {
														epicSearchQuery = "";
														epicSearchInput?.focus();
													}}
													class="text-white/40 hover:text-white/70 transition-colors"
												>
													<svg
														class="w-3 h-3"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
														stroke-width="2"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															d="M6 18L18 6M6 6l12 12"
														/>
													</svg>
												</button>
											{/if}
										</div>
									</div>
								{/if}

								{#if epicsLoading}
									<div class="px-3 py-3 text-center text-[10px] text-white/50">
										<span class="loading loading-spinner loading-xs"></span>
										<span class="ml-1">Loading epics...</span>
									</div>
								{:else if epicsError}
									<div class="px-3 py-2 text-center text-[10px] text-error">
										<span>⚠ {epicsError}</span>
										<button
											class="btn btn-xs btn-ghost ml-1"
											onclick={fetchEpics}>Retry</button
										>
									</div>
								{:else if epics.length === 0}
									<div class="px-3 py-3 text-center text-[10px] text-white/50">
										No epics in this project
									</div>
								{:else if filteredEpics.length === 0}
									<div class="px-3 py-3 text-center text-[10px] text-white/50">
										No epics match "{epicSearchQuery}"
									</div>
								{:else}
									{@const canInteract = canLink || onViewEpic}
									<ul class="py-0.5 max-h-[180px] overflow-y-auto">
										{#each filteredEpics as epic, index (epic.id)}
											{@const isClosed = epic.status === "closed"}
											<li>
												<button
													type="button"
													onclick={() => {
														if (canLink) {
															linkToEpic(epic.id);
														} else if (onViewEpic) {
															onViewEpic(epic.id);
															isOpen = false;
														}
													}}
													class="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] transition-colors text-base-content/70 {canInteract
														? 'hover:text-base-content'
														: 'opacity-60 cursor-default'} {index ===
														selectedEpicIndex && canInteract
														? 'command-item-selected'
														: 'command-item-default'}"
													disabled={disabled ||
														linkingEpicId !== null ||
														!canInteract}
													onmouseenter={() => {
														if (canInteract) selectedEpicIndex = index;
													}}
												>
													{#if linkingEpicId === epic.id}
														<span
															class="loading loading-spinner loading-xs flex-shrink-0"
														></span>
													{:else}
														<span
															class="text-[10px] flex-shrink-0"
															class:opacity-50={isClosed}
															>{isClosed ? "📦" : "🏔️"}</span
														>
													{/if}
													<div class="flex flex-col min-w-0 flex-1">
														<div class="flex items-center gap-1.5">
															<span
																class="font-mono text-[10px] text-secondary"
																class:opacity-60={isClosed}>{epic.id}</span
															>
															{#if isClosed}
																<span
																	class="text-[8px] px-1 py-0.5 rounded bg-base-content/10 text-base-content/40 uppercase tracking-wider"
																	>closed</span
																>
															{/if}
														</div>
														<span class="truncate" class:opacity-60={isClosed}
															>{epic.title}</span
														>
													</div>
													{#if epic.dependency_count !== undefined}
														<span
															class="text-[9px] px-1 py-0.5 rounded bg-base-content/10 text-base-content/40 flex-shrink-0"
														>
															{epic.dependency_count} tasks
														</span>
													{/if}
													{#if !canLink && onViewEpic}
														<span
															class="text-[9px] px-1 py-0.5 rounded bg-info/20 text-info flex-shrink-0"
														>
															view
														</span>
													{/if}
													{#if index === selectedEpicIndex && epics.length > 3 && canInteract}
														<kbd
															class="kbd kbd-xs font-mono command-kbd flex-shrink-0"
															>↵</kbd
														>
													{/if}
												</button>
											</li>
										{/each}
									</ul>
								{/if}

								<!-- Create New Epic section (only when we can link) -->
								{#if canLink}
									<div class="border-t border-base-content/10 mt-1">
										{#if showCreateEpic}
											<div class="px-2 py-2">
												<div class="flex flex-col gap-1.5">
													<input
														bind:this={newEpicInput}
														bind:value={newEpicTitle}
														onkeydown={handleCreateEpicKeyDown}
														type="text"
														placeholder="Epic title..."
														class="w-full px-2 py-1 bg-base-300 text-[11px] rounded border border-base-content/20 focus:border-primary focus:outline-none"
														disabled={creatingEpic}
														autofocus
													/>
													{#if createEpicError}
														<span class="text-[9px] text-error"
															>{createEpicError}</span
														>
													{/if}
													<div class="flex items-center justify-between gap-2">
														<span class="text-[9px] text-base-content/40">
															Enter to create, Esc to cancel
														</span>
														<div class="flex gap-1">
															<button
																type="button"
																onclick={() => {
																	showCreateEpic = false;
																	newEpicTitle = "";
																	createEpicError = null;
																}}
																class="btn btn-xs btn-ghost text-[10px]"
																disabled={creatingEpic}
															>
																Cancel
															</button>
															<button
																type="button"
																onclick={createEpic}
																class="btn btn-xs btn-primary text-[10px]"
																disabled={creatingEpic || !newEpicTitle.trim()}
															>
																{#if creatingEpic}
																	<span
																		class="loading loading-spinner loading-xs"
																	></span>
																{:else}
																	Create
																{/if}
															</button>
														</div>
													</div>
												</div>
											</div>
										{:else}
											<button
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													showCreateEpic = true;
													setTimeout(() => newEpicInput?.focus(), 50);
												}}
												class="w-full px-3 py-1.5 flex items-center gap-2 text-[10px] text-base-content/50 hover:text-base-content/80 hover:bg-base-content/5 transition-colors"
												disabled={disabled || linkingEpicId !== null}
											>
												<svg
													class="w-3 h-3"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 4.5v15m7.5-7.5h-15"
													/>
												</svg>
												<span>Create New Epic</span>
											</button>
										{/if}
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Commands section (collapsible) -->
			{#if showCommands}
				<div class="border-t commands-divider">
					<!-- Commands header (toggle) -->
					<button
						type="button"
						onclick={() => (commandsExpanded = !commandsExpanded)}
						class="w-full px-3 py-1.5 flex items-center justify-between text-[10px] font-semibold text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
					>
						<span class="flex items-center gap-1.5">
							<svg
								class="w-3 h-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
								/>
							</svg>
							All Commands
						</span>
						<svg
							class="w-3 h-3 transition-transform"
							class:rotate-180={commandsExpanded}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/>
						</svg>
					</button>

					<!-- Commands list (expandable) -->
					{#if commandsExpanded}
						<div class="commands-panel" transition:slide={{ duration: 150 }}>
							<!-- Search input (show when there are many commands) -->
							{#if commands.length > 5}
								<div class="px-2 py-1.5 border-b commands-search-border">
									<div class="relative flex items-center gap-1.5">
										<svg
											class="w-3 h-3 flex-shrink-0 commands-search-icon"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
											/>
										</svg>
										<input
											bind:this={commandSearchInput}
											bind:value={commandSearchQuery}
											onkeydown={handleCommandKeyDown}
											type="text"
											placeholder="Filter commands..."
											class="w-full bg-transparent text-[10px] font-mono focus:outline-none commands-search-input"
											autocomplete="off"
										/>
										{#if commandSearchQuery}
											<button
												type="button"
												onclick={() => {
													commandSearchQuery = "";
													commandSearchInput?.focus();
												}}
												class="text-white/40 hover:text-white/70 transition-colors"
											>
												<svg
													class="w-3 h-3"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M6 18L18 6M6 6l12 12"
													/>
												</svg>
											</button>
										{/if}
									</div>
								</div>
							{/if}

							{#if commandsLoading}
								<div class="px-3 py-3 text-center text-[10px] text-white/50">
									<span class="loading loading-spinner loading-xs"></span>
									<span class="ml-1">Loading...</span>
								</div>
							{:else if commandsError}
								<div class="px-3 py-2 text-center text-[10px] text-error">
									<span>⚠ {commandsError}</span>
									<button
										class="btn btn-xs btn-ghost ml-1"
										onclick={fetchCommands}>Retry</button
									>
								</div>
							{:else if filteredCommands.length === 0}
								<div class="px-3 py-3 text-center text-[10px] text-white/50">
									No commands match "{commandSearchQuery}"
								</div>
							{:else}
								<ul class="py-0.5 max-h-[180px] overflow-y-auto">
									{#each filteredCommands as cmd, index (cmd.invocation)}
										<li>
											<button
												type="button"
												onclick={() => executeCommand(cmd.invocation)}
												class="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] transition-colors text-base-content/70 hover:text-base-content {index ===
												selectedCommandIndex
													? 'command-item-selected'
													: 'command-item-default'}"
												disabled={disabled || isExecuting}
												onmouseenter={() => {
													selectedCommandIndex = index;
												}}
											>
												<svg
													class="w-3.5 h-3.5 flex-shrink-0 opacity-60"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="1.5"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d={getCommandIcon(cmd.invocation)}
													/>
												</svg>
												<span class="font-mono">{cmd.invocation}</span>
												{#if cmd.namespace === "local"}
													<span
														class="text-[8px] px-1 py-0.5 rounded bg-base-content/10 text-base-content/40 ml-auto"
														>local</span
													>
												{/if}
												{#if index === selectedCommandIndex && commands.length > 5}
													<kbd class="kbd kbd-xs font-mono ml-auto command-kbd"
														>↵</kbd
													>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Session info footer -->
			<div
				class="px-3 py-1.5 text-[9px] font-mono opacity-50 truncate status-footer"
			>
				{sessionName}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Dropdown container */
	.status-dropdown {
		background: var(--color-base-300);
		border: 1px solid var(--color-base-content);
		border-color: color-mix(
			in oklch,
			var(--color-base-content) 20%,
			transparent
		);
	}

	/* Commands section */
	.commands-divider {
		border-color: color-mix(
			in oklch,
			var(--color-base-content) 15%,
			transparent
		);
	}

	.commands-panel {
		background: var(--color-base-200);
	}

	.commands-search-border {
		border-color: color-mix(
			in oklch,
			var(--color-base-content) 12%,
			transparent
		);
	}

	.commands-search-icon {
		color: var(--color-base-content);
		opacity: 0.4;
	}

	.commands-search-input {
		color: var(--color-base-content);
		opacity: 0.85;
	}

	/* Command item states */
	.command-item-selected {
		background: color-mix(in oklch, var(--color-base-content) 10%, transparent);
		border-left: 2px solid var(--color-primary);
	}

	.command-item-default {
		background: transparent;
		border-left: 2px solid transparent;
	}

	/* Keyboard hint */
	.command-kbd {
		background: var(--color-base-300);
		border-color: color-mix(
			in oklch,
			var(--color-base-content) 20%,
			transparent
		);
		color: var(--color-primary);
	}

	/* Footer */
	.status-footer {
		background: var(--color-base-200);
		border-top: 1px solid
			color-mix(in oklch, var(--color-base-content) 15%, transparent);
	}

	/* Source badges */
	.source-badge-epic {
		color: var(--color-secondary);
		background: color-mix(in oklch, var(--color-secondary) 15%, transparent);
	}

	.source-badge-backlog {
		color: var(--color-info);
		background: color-mix(in oklch, var(--color-info) 15%, transparent);
	}

	/* Elapsed time in badge */
	.elapsed-time {
		display: inline-flex;
		align-items: baseline;
		margin-left: 0.375rem;
		font-family: ui-monospace, monospace;
		opacity: 0.85;
	}

	.elapsed-sep {
		opacity: 0.5;
	}
</style>
