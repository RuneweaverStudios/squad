<script lang="ts">
	import { computeAgentStatus, type AgentStatusInput, type AgentStatus } from '$lib/utils/agentStatusUtils';
	import { createPutRequest } from '$lib/utils/bulkApiHelpers';
	import { broadcastTaskEvent } from '$lib/stores/taskEvents';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';

	interface Task {
		id: string;
		status: string;
		assignee?: string;
	}

	interface Agent extends AgentStatusInput {
		name: string;
		last_active_ts?: string | null;
		task?: string | null;
	}

	interface Props {
		task: Task;
		agents?: Agent[];
		spawning?: boolean;
		hasBlockers?: boolean;
		blockingReason?: string;
		onspawn?: (taskId: string) => Promise<boolean>;
		onrelease?: (taskId: string) => Promise<boolean>;
		onattach?: (sessionName: string) => void;
		/** Fire scale for rocket animation (0-2.5) */
		fireScale?: number;
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
		fireScale = 1
	}: Props = $props();

	// Local state
	let releasing = $state(false);
	let dropdownOpen = $state(false);

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

	// Determine what action mode we're in
	type ActionMode = 'spawn' | 'dropdown' | 'disabled';
	const actionMode: ActionMode = $derived(
		task.status === 'closed' ? 'disabled' :
		task.status === 'in_progress' ? 'dropdown' :
		(task.status === 'blocked' || hasBlockers) ? 'dropdown' :
		'spawn'
	);

	// Action handlers
	async function handleSpawn() {
		if (spawning) return;
		dropdownOpen = false;
		await onspawn(task.id);
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
<div class="relative">
	{#if actionMode === 'spawn'}
		<!-- Spawn button for open/ready tasks -->
		<button
			class="btn btn-xs btn-ghost hover:btn-primary rocket-btn {spawning ? 'rocket-launching' : ''}"
			onclick={handleSpawn}
			disabled={spawning || hasBlockers}
			title={getSpawnTitle()}
		>
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
		</button>

	{:else if actionMode === 'dropdown'}
		<!-- Dropdown for in-progress/blocked tasks -->
		<div class="dropdown dropdown-end">
			{#if task.status === 'in_progress' && task.assignee}
				<!-- Agent avatar button for in-progress tasks with assignee -->
				<button
					class="flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
					onclick={() => dropdownOpen = !dropdownOpen}
					title="{task.assignee} is working on this task"
				>
					<div class="avatar {isAgentOnline ? 'online' : 'offline'}">
						<div
							class="rounded-full {isAgentOnline ? 'ring-2 ring-info ring-offset-base-100 ring-offset-1' : 'ring-2 ring-warning ring-offset-base-100 ring-offset-1'}"
							style="width: 24px; height: 24px;"
						>
							<AgentAvatar name={task.assignee} size={24} />
						</div>
					</div>
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
				<ul class="dropdown-content z-50 menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300">
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
					{/if}

					<li>
						<button
							onclick={handleRelease}
							disabled={releasing}
							class="gap-2 {!isAgentOnline && task.status === 'in_progress' ? 'text-warning font-semibold' : ''}"
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

	{:else}
		<!-- Disabled state for closed tasks -->
		<button class="btn btn-xs btn-ghost opacity-50" disabled title="Task is closed">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		</button>
	{/if}
</div>
