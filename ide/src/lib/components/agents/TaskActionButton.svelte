<script lang="ts">
	import { computeAgentStatus, type AgentStatusInput, type AgentStatus } from '$lib/utils/agentStatusUtils';
	import { createPutRequest } from '$lib/utils/bulkApiHelpers';
	import { broadcastTaskEvent } from '$lib/stores/taskEvents';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import AgentSelector from '$lib/components/agents/AgentSelector.svelte';
	import { isHumanTask } from '$lib/utils/badgeHelpers';

	interface Task {
		id: string;
		status: string;
		assignee?: string;
		issue_type?: string;
		labels?: string[];
		priority?: number;
		title?: string;
	}

	interface Agent extends AgentStatusInput {
		name: string;
		last_active_ts?: string | null;
		task?: string | null;
	}

	interface ElapsedTime {
		display: string;
		color: string;
		minutes: number;
	}

	interface AgentSelection {
		agentId: string | null;
		model: string | null;
	}

	interface Props {
		task: Task;
		agents?: Agent[];
		spawning?: boolean;
		hasBlockers?: boolean;
		blockingReason?: string | null;
		/** Called with agent/model selection when user confirms spawn */
		onspawn?: (taskId: string, selection?: AgentSelection) => Promise<boolean>;
		onrelease?: (taskId: string) => Promise<boolean>;
		onattach?: (sessionName: string) => void;
		/** Fire scale for rocket animation (0-2.5) */
		fireScale?: number;
		/** Elapsed time info for displaying time working badge */
		elapsed?: ElapsedTime | null;
		/** Task was completed by an agent with an active session */
		isCompletedByActiveSession?: boolean;
		/** Session ID for resuming offline sessions (prevents 404 after restart) */
		sessionId?: string | null;
		/** Show agent picker on spawn (default: false for quick spawn) */
		showAgentPicker?: boolean;
	}

	let {
		task,
		agents = [],
		spawning = false,
		hasBlockers = false,
		blockingReason = '',
		onspawn = async () => false,
		onrelease = async () => false,
		onattach = () => {},
		fireScale = 1,
		elapsed = null,
		isCompletedByActiveSession = false,
		sessionId = null,
		showAgentPicker = false
	}: Props = $props();

	// Local state
	let releasing = $state(false);
	let resuming = $state(false);
	let resumeError = $state<string | null>(null);
	let dropdownOpen = $state(false);
	let agentPickerOpen = $state(false);
	let altKeyHeld = $state(false);

	// Track Alt key state for visual feedback
	$effect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Check both e.key and e.altKey for broader compatibility
			if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
				altKeyHeld = true;
				console.log('[TaskActionButton] Alt pressed, altKeyHeld =', true);
			}
		}
		function handleKeyUp(e: KeyboardEvent) {
			if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
				altKeyHeld = false;
				console.log('[TaskActionButton] Alt released, altKeyHeld =', false);
			}
		}
		// Also reset when window loses focus
		function handleBlur() {
			altKeyHeld = false;
		}

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('blur', handleBlur);
		console.log('[TaskActionButton] Alt key listeners registered');

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('blur', handleBlur);
		};
	});

	// Find agent for this task
	const taskAgent = $derived(
		task.assignee ? agents.find(a => a.name === task.assignee) : null
	);

	// Compute agent status
	const agentStatus = $derived<AgentStatus | null>(
		taskAgent ? computeAgentStatus(taskAgent) : null
	);

	// Is agent reachable (has tmux session and is working)?
	const isAgentOnline = $derived(
		agentStatus !== null && agentStatus !== 'offline' && agentStatus !== 'disconnected'
	);

	// Get session name for attach
	const sessionName = $derived(
		taskAgent ? `jat-${taskAgent.name}` : null
	);

	// Check if this is a human task (shouldn't auto-spawn agents)
	const isHuman = $derived(isHumanTask(task));

	// Determine what action mode we're in
	// Only show dropdown when there's an assignee (something to release)
	// For blocked tasks without assignee, show disabled spawn button
	type ActionMode = 'spawn' | 'dropdown' | 'disabled' | 'completed';
	const actionMode: ActionMode = $derived(
		isCompletedByActiveSession ? 'completed' :
		task.status === 'closed' ? 'disabled' :
		task.status === 'in_progress' ? 'dropdown' :
		// Only show dropdown for blocked tasks that have an assignee (something to release)
		(task.status === 'blocked' || hasBlockers) && task.assignee ? 'dropdown' :
		'spawn'
	);

	// Action handlers
	async function handleSpawn(event?: MouseEvent) {
		if (spawning) return;
		dropdownOpen = false;

		// Alt+click or showAgentPicker prop opens agent selector
		if (event?.altKey || showAgentPicker) {
			agentPickerOpen = true;
			return;
		}

		// Quick spawn with default agent
		await onspawn(task.id);
	}

	async function handleAgentSelect(selection: AgentSelection) {
		agentPickerOpen = false;
		await onspawn(task.id, selection);
	}

	function handleAgentPickerCancel() {
		agentPickerOpen = false;
	}

	async function handleRelease() {
		if (releasing) return;
		releasing = true;
		// Keep dropdown open to show spinner
		try {
			const response = await fetch(`/api/tasks/${task.id}`, createPutRequest({
				assignee: null,
				status: 'open'
			}));
			if (!response.ok) {
				console.error('Release failed:', await response.text());
			} else {
				// Broadcast event so pages refresh immediately
				broadcastTaskEvent('task-released', task.id);
			}
			await onrelease(task.id);
		} catch (err) {
			console.error('Release error:', err);
		} finally {
			releasing = false;
			dropdownOpen = false;
		}
	}

	function handleAttach() {
		dropdownOpen = false;
		if (sessionName) {
			onattach(sessionName);
		}
	}

	async function handleResume() {
		if (resuming || !task.assignee) return;
		resuming = true;
		resumeError = null;
		try {
			const response = await fetch(`/api/sessions/${task.assignee}/resume`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: sessionId ? JSON.stringify({ session_id: sessionId }) : undefined
			});
			if (!response.ok) {
				const data = await response.json();
				// Show user-friendly error - session files cleaned up is common after restart
				if (response.status === 404) {
					resumeError = 'Session expired - release task and restart';
					errorToast('Resume failed', 'Session expired - release task and restart');
				} else {
					resumeError = data.message || data.error || 'Resume failed';
					errorToast('Resume failed', data.message || data.error || 'Could not resume session');
				}
				console.error('Resume failed:', data.message || data.error);
			} else {
				// Show success toast
				successToast('Session resumed', `Resuming ${task.assignee}'s session`);
				// Broadcast event so pages refresh immediately
				broadcastTaskEvent('session-resumed', task.id);
				dropdownOpen = false;
			}
		} catch (err) {
			resumeError = 'Network error';
			errorToast('Resume failed', 'Network error - check your connection');
			console.error('Resume error:', err);
		} finally {
			resuming = false;
		}
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	// Get appropriate title/tooltip for spawn button
	function getSpawnTitle(): string {
		if (task.status === 'in_progress') return 'Task already in progress';
		if (task.status === 'closed') return 'Task is closed';
		if (task.status === 'blocked' || hasBlockers) {
			return `Blocked: ${blockingReason || 'resolve dependencies first'}`;
		}
		return 'Launch agent';
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative flex items-center justify-center" style="min-width: 28px; min-height: 28px;">
	{#if actionMode === 'spawn' && isHuman}
		<!-- Human task: show person icon (unclickable) instead of rocket -->
		<div
			class="w-7 h-7 flex items-center justify-center opacity-50 cursor-default"
			title="Human task — complete manually"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4" style="color: oklch(0.70 0.18 45);">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
			</svg>
		</div>
	{:else if actionMode === 'spawn'}
		<!-- Agent picker dropdown (shown when Alt+click or showAgentPicker) -->
		{#if agentPickerOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- Backdrop -->
			<div class="fixed inset-0 z-40" onclick={handleAgentPickerCancel}></div>
			<!-- Agent selector positioned below button -->
			<div class="absolute top-full right-0 mt-1 z-50">
				<AgentSelector
					{task}
					onselect={handleAgentSelect}
					oncancel={handleAgentPickerCancel}
				/>
			</div>
		{/if}

		<!-- Spawn button for open/ready tasks -->
		<button
			class="btn btn-xs {altKeyHeld ? 'btn-info' : 'btn-ghost hover:btn-primary'} rocket-btn {spawning ? 'rocket-launching' : ''} transition-colors duration-150"
			onclick={(e) => handleSpawn(e)}
			disabled={spawning || hasBlockers}
			title={altKeyHeld ? 'Click to choose agent/model' : `${getSpawnTitle()} (Alt+click for agent picker)`}
		>
			{#if altKeyHeld}
				<!-- Settings/gear icon when Alt is held -->
				<div class="w-5 h-5 flex items-center justify-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
					</svg>
				</div>
			{:else}
				<div class="relative w-5 h-5 flex items-center justify-center overflow-visible">
					<!-- Debris/particles -->
					<div class="rocket-debris-1 absolute w-1 h-1 rounded-full bg-warning/80 left-1/2 top-1/2 opacity-0"></div>
					<div class="rocket-debris-2 absolute w-0.5 h-0.5 rounded-full bg-info/60 left-1/2 top-1/3 opacity-0"></div>
					<div class="rocket-debris-3 absolute w-1 h-0.5 rounded-full bg-base-content/40 left-1/2 top-2/3 opacity-0"></div>

					<!-- Smoke puffs -->
					<div class="rocket-smoke absolute w-2 h-2 rounded-full bg-base-content/30 bottom-0 left-1/2 -translate-x-1/2 opacity-0"></div>
					<div class="rocket-smoke-2 absolute w-1.5 h-1.5 rounded-full bg-base-content/20 bottom-0 left-1/2 -translate-x-1/2 translate-x-1 opacity-0"></div>

					<!-- Engine sparks -->
					<div class="engine-spark-1 absolute w-1.5 h-1.5 rounded-full bg-orange-400 left-1/2 top-1/2 opacity-0"></div>
					<div class="engine-spark-2 absolute w-1 h-1 rounded-full bg-yellow-300 left-1/2 top-1/2 opacity-0"></div>
					<div class="engine-spark-3 absolute w-[5px] h-[5px] rounded-full bg-amber-500 left-1/2 top-1/2 opacity-0"></div>
					<div class="engine-spark-4 absolute w-1 h-1 rounded-full bg-red-400 left-1/2 top-1/2 opacity-0"></div>

					<!-- Fire/exhaust -->
					<div class="rocket-fire absolute bottom-0 left-1/2 -translate-x-1/2 w-2 origin-top opacity-0">
						<svg viewBox="0 0 12 20" class="w-full" style="transform: scaleY({fireScale}); transform-origin: top center;">
							<path d="M6 0 L9 8 L7 6 L6 12 L5 6 L3 8 Z" fill="url(#fireGradient-{task.id})" />
							<defs>
								<linearGradient id="fireGradient-{task.id}" x1="0%" y1="0%" x2="0%" y2="100%">
									<stop offset="0%" style="stop-color:#f0932b" />
									<stop offset="50%" style="stop-color:#f39c12" />
									<stop offset="100%" style="stop-color:#e74c3c" />
								</linearGradient>
							</defs>
						</svg>
					</div>

					<!-- Rocket body -->
					<svg class="rocket-icon w-4 h-4" viewBox="0 0 24 24" fill="none">
					<path d="M12 2C12 2 8 6 8 12C8 15 9 17 10 18L10 21C10 21.5 10.5 22 11 22H13C13.5 22 14 21.5 14 21L14 18C15 17 16 15 16 12C16 6 12 2 12 2Z" fill="currentColor" />
					<circle cx="12" cy="10" r="2" fill="oklch(0.75 0.15 200)" />
					<path d="M8 14L5 17L6 18L8 16Z" fill="currentColor" />
					<path d="M16 14L19 17L18 18L16 16Z" fill="currentColor" />
					<path d="M12 2C12 2 10 5 10 8" stroke="oklch(0.9 0.05 200)" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
				</svg>
				</div>
			{/if}
		</button>

	{:else if actionMode === 'dropdown'}
		<!-- Dropdown for in-progress/blocked tasks -->
		<div class="dropdown dropdown-end">
			{#if task.status === 'in_progress' && task.assignee}
				<!-- Agent avatar button for in-progress tasks with assignee -->
				<button
					class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
					onclick={() => dropdownOpen = !dropdownOpen}
					title="{task.assignee} is working on this task{elapsed ? ` for ${elapsed.display}` : ''}"
				>
					<div class="avatar {isAgentOnline ? 'online' : 'offline'}">
						<div
							class="rounded-full {isAgentOnline ? 'ring-2 ring-info ring-offset-base-100 ring-offset-1 avatar-ring-pulse' : 'ring-2 ring-warning ring-offset-base-100 ring-offset-1'}"
							style="width: 24px; height: 24px;"
						>
							<AgentAvatar name={task.assignee} size={24} />
						</div>
					</div>
					{#if elapsed}
						<span class="badge badge-xs {elapsed.color} font-mono" style="font-size: 10px; padding: 0 4px; min-height: 14px;">
							{elapsed.display}
						</span>
					{/if}
				</button>
			{:else}
				<!-- Fallback button for blocked tasks or in-progress without assignee -->
				<button
					class="btn btn-xs {task.status === 'in_progress' ? 'btn-primary' : 'btn-warning'} gap-1"
					onclick={() => dropdownOpen = !dropdownOpen}
				>
					{#if task.status === 'in_progress'}
						{#if isAgentOnline}
							<!-- Agent working icon -->
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
							</svg>
						{:else}
							<!-- Agent offline icon -->
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
							</svg>
						{/if}
					{:else}
						<!-- Blocked icon -->
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
						</svg>
					{/if}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</button>
			{/if}

			{#if dropdownOpen}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="fixed inset-0 z-40" onclick={closeDropdown}></div>
				<ul class="dropdown-content z-40 menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300">
					{#if task.status === 'in_progress' && isAgentOnline && sessionName}
						<li>
							<button onclick={handleAttach} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
								</svg>
								Attach to Session
							</button>
						</li>
						<li>
							<button onclick={() => { dropdownOpen = false; /* TODO: implement message modal */ }} class="gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
								</svg>
								Send Message
							</button>
						</li>
						<div class="divider my-0 py-0"></div>
					{/if}

					{#if task.status === 'in_progress' && !isAgentOnline}
						<li class="menu-title">
							<span class="text-warning text-xs">Agent is offline</span>
						</li>
						<li>
							<button
								onclick={handleResume}
								disabled={resuming}
								class="gap-2 text-info font-semibold"
							>
								{#if resuming}
									<span class="loading loading-spinner loading-xs"></span>
									Resuming...
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
									</svg>
									Resume Session
								{/if}
							</button>
						</li>
						{#if resumeError}
							<li class="px-3 py-1">
								<span class="text-error text-xs whitespace-normal">{resumeError}</span>
							</li>
						{/if}
						<div class="divider my-0 py-0"></div>
					{/if}

					<li>
						<button
							onclick={handleRelease}
							disabled={releasing}
							class="gap-2 {!isAgentOnline && task.status === 'in_progress' ? '' : ''}"
						>
							{#if releasing}
								<span class="loading loading-spinner loading-xs"></span>
								Releasing...
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
								</svg>
								Release Task
							{/if}
						</button>
					</li>

					{#if task.status === 'in_progress' && isAgentOnline && sessionName}
						<div class="divider my-0 py-0"></div>
						<li>
							<button onclick={() => { dropdownOpen = false; /* TODO: implement kill session */ }} class="gap-2 text-error hover:bg-error hover:text-error-content">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
								Kill Session
							</button>
						</li>
					{/if}
				</ul>
			{/if}
		</div>

	{:else if actionMode === 'completed'}
		<!-- Completed task with active session - show agent avatar with green checkmark -->
		{#if task.assignee}
			<div class="relative inline-flex items-center justify-center" title="{task.assignee} completed this task (session active)">
				<div class="avatar">
					<div
						class="rounded-full ring-2 ring-offset-base-100 ring-offset-1"
						style="width: 24px; height: 24px; --tw-ring-color: oklch(0.65 0.20 145);"
					>
						<AgentAvatar name={task.assignee} size={24} />
					</div>
				</div>
				<!-- Small green checkmark badge overlaid in bottom-right -->
				<span
					class="absolute flex items-center justify-center w-3.5 h-3.5 rounded-full"
					style="background: oklch(0.55 0.18 145); bottom: -5px; right: -5px; border: 1.5px solid oklch(0.20 0.01 250);"
				>
					<svg class="w-2 h-2" style="color: oklch(0.95 0.02 145);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
					</svg>
				</span>
			</div>
		{:else}
			<!-- Fallback if no assignee -->
			<button class="btn btn-xs btn-ghost" disabled title="Task completed">
				<svg class="w-4 h-4" style="color: oklch(0.65 0.20 145);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</button>
		{/if}

	{:else}
		<!-- Closed tasks - show Resume button if has assignee, otherwise disabled checkmark -->
		{#if task.assignee}
			<!-- Resume button for closed tasks with assignee -->
			<button
				class="btn btn-xs btn-ghost hover:btn-info gap-1"
				onclick={handleResume}
				disabled={resuming}
				title="Resume conversation with {task.assignee}"
			>
				{#if resuming}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<!-- Play/Resume icon -->
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
					</svg>
				{/if}
			</button>
			{#if resumeError}
				<div class="tooltip tooltip-left tooltip-error" data-tip={resumeError}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 text-error">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				</div>
			{/if}
		{:else}
			<!-- No assignee - show disabled checkmark -->
			<button class="btn btn-xs btn-ghost opacity-50" disabled title="Task is closed">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</button>
		{/if}
	{/if}
</div>

<style>
	/* Pulsing ring animation for active agents */
	.avatar-ring-pulse {
		animation: ring-pulse 2s ease-in-out infinite;
	}

	@keyframes ring-pulse {
		0%, 100% {
			box-shadow: 0 0 0 0 oklch(0.70 0.18 240 / 0.4);
		}
		50% {
			box-shadow: 0 0 0 4px oklch(0.70 0.18 240 / 0);
		}
	}
</style>
