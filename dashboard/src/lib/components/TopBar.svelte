<script lang="ts">
	/**
	 * TopBar Component - Horizontal utilities bar
	 *
	 * Simplified navigation bar containing only utility components:
	 * - Hamburger toggle (mobile only, for sidebar)
	 * - ProjectSelector
	 * - AgentCountBadge
	 * - TokenUsageBadge (tokens today, cost, sparkline)
	 * - CommandPalette
	 * - UserProfile
	 *
	 * Navigation buttons (List, Graph, Agents) removed - moved to Sidebar
	 *
	 * Props:
	 * - projects: string[] (for project dropdown)
	 * - selectedProject: string (current project selection)
	 * - onProjectChange: (project: string) => void
	 * - taskCounts: Map<string, number> (optional task counts per project)
	 * - tokensToday: number (total tokens consumed today)
	 * - costToday: number (total cost today in USD)
	 * - sparklineData: DataPoint[] (24h sparkline data)
	 */

	import ProjectSelector from './ProjectSelector.svelte';
	import AgentCountBadge from './AgentCountBadge.svelte';
	import TokenUsageBadge from './TokenUsageBadge.svelte';
	import UserProfile from './UserProfile.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import { openTaskDrawer, openSpawnModal, toggleOutputDrawer, isOutputDrawerOpen } from '$lib/stores/drawerStore';

	// Global action loading states
	let attackLoading = $state(false);
	let autoAssignLoading = $state(false);
	let pauseAllLoading = $state(false);
	let broadcastLoading = $state(false);

	// Broadcast input state
	let showBroadcastInput = $state(false);
	let broadcastMessage = $state('');

	// Output drawer open state (from store)
	let outputDrawerOpen = $state(false);
	$effect(() => {
		const unsubscribe = isOutputDrawerOpen.subscribe(value => {
			outputDrawerOpen = value;
		});
		return unsubscribe;
	});

	// Attack Backlog - spawn agents for ready tasks
	async function handleAttackBacklog() {
		attackLoading = true;
		try {
			const response = await fetch('/api/sessions/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ count: 4 }) // Default 4 agents
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to spawn agents');
			}
			// Show success feedback (could add toast notification)
			console.log('Attack backlog:', data);
		} catch (error) {
			console.error('Attack backlog failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to spawn agents');
		} finally {
			attackLoading = false;
		}
	}

	// Auto-Assign - assign ready tasks to idle agents
	async function handleAutoAssign() {
		autoAssignLoading = true;
		try {
			const response = await fetch('/api/agents/auto-assign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to auto-assign tasks');
			}
			console.log('Auto-assign result:', data);
		} catch (error) {
			console.error('Auto-assign failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to auto-assign tasks');
		} finally {
			autoAssignLoading = false;
		}
	}

	// Pause All - send Ctrl+C to all sessions
	async function handlePauseAll() {
		pauseAllLoading = true;
		try {
			const response = await fetch('/api/sessions/pause-all', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to pause sessions');
			}
			console.log('Pause all result:', data);
		} catch (error) {
			console.error('Pause all failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to pause sessions');
		} finally {
			pauseAllLoading = false;
		}
	}

	// Broadcast message to all agents
	async function handleBroadcast() {
		if (!broadcastMessage.trim()) return;

		broadcastLoading = true;
		try {
			const response = await fetch('/api/agents/broadcast', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: 'Broadcast',
					body: broadcastMessage
				})
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to broadcast message');
			}
			console.log('Broadcast result:', data);
			broadcastMessage = '';
			showBroadcastInput = false;
		} catch (error) {
			console.error('Broadcast failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to broadcast message');
		} finally {
			broadcastLoading = false;
		}
	}

	// Toggle broadcast input
	function toggleBroadcastInput() {
		showBroadcastInput = !showBroadcastInput;
		if (showBroadcastInput) {
			// Focus input after it appears
			setTimeout(() => {
				const input = document.getElementById('broadcast-input');
				if (input) input.focus();
			}, 100);
		}
	}

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	/** Per-project token data from multi-project API */
	interface ProjectTokenData {
		project: string;
		tokens: number;
		cost: number;
		color: string;
	}

	/** Multi-project time-series data point from API */
	interface MultiProjectDataPoint {
		timestamp: string;
		totalTokens: number;
		totalCost: number;
		projects: ProjectTokenData[];
	}

	interface Props {
		projects?: string[];
		selectedProject?: string;
		onProjectChange?: (project: string) => void;
		taskCounts?: Map<string, number> | null;
		activeAgentCount?: number;
		totalAgentCount?: number;
		activeAgents?: string[];
		tokensToday?: number;
		costToday?: number;
		sparklineData?: DataPoint[];
		/** Multi-project sparkline data (from ?multiProject=true API) */
		multiProjectData?: MultiProjectDataPoint[];
		/** Project colors map (from API response) */
		projectColors?: Record<string, string>;
	}

	let {
		projects = [],
		selectedProject = 'All Projects',
		onProjectChange = () => {},
		taskCounts = null,
		activeAgentCount = 0,
		totalAgentCount = 0,
		activeAgents = [],
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		multiProjectData,
		projectColors = {}
	}: Props = $props();
</script>

<!-- Industrial/Terminal TopBar -->
<nav
	class="w-full h-12 flex items-center relative"
	style="
		background: linear-gradient(180deg, oklch(0.25 0.01 250) 0%, oklch(0.20 0.01 250) 100%);
		border-bottom: 1px solid oklch(0.35 0.02 250);
	"
>
	<!-- Sidebar toggle (industrial) -->
	<label
		for="main-drawer"
		aria-label="open sidebar"
		class="flex items-center justify-center w-7 h-7 ml-3 rounded cursor-pointer transition-all hover:scale-105"
		style="background: oklch(0.30 0.02 250); border: 1px solid oklch(0.40 0.02 250);"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			stroke-linejoin="round"
			stroke-linecap="round"
			stroke-width="2"
			fill="none"
			stroke="currentColor"
			class="w-4 h-4"
			style="color: oklch(0.70 0.18 240);"
		>
			<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
			<path d="M9 4v16"></path>
			<path d="M14 10l2 2l-2 2"></path>
		</svg>
	</label>

	<!-- Vertical separator -->
	<div class="w-px h-6 mx-2" style="background: linear-gradient(180deg, transparent, oklch(0.45 0.02 250), transparent);"></div>

	<!-- Left side utilities -->
	<div class="flex-1 flex items-center gap-3 px-2">
		{#if projects.length > 0}
			<div class="w-36 sm:w-40 md:w-48">
				<ProjectSelector
					{projects}
					{selectedProject}
					{onProjectChange}
					{taskCounts}
					compact={true}
				/>
			</div>
		{/if}

		<!-- Add Task Button (Industrial) -->
		<button
			class="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs tracking-wider uppercase transition-all hover:scale-105"
			style="
				background: linear-gradient(135deg, oklch(0.75 0.20 145 / 0.2) 0%, oklch(0.75 0.20 145 / 0.1) 100%);
				border: 1px solid oklch(0.75 0.20 145 / 0.4);
				color: oklch(0.80 0.18 145);
				text-shadow: 0 0 10px oklch(0.75 0.20 145 / 0.5);
			"
			onclick={openTaskDrawer}
			title="Create new task"
		>
			<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			<span class="hidden sm:inline">New</span>
		</button>

		<!-- Vertical separator -->
		<div class="hidden md:block w-px h-5" style="background: oklch(0.45 0.02 250 / 0.5);"></div>

		<!-- Global Action Buttons (Industrial) -->
		<div class="hidden md:flex items-center gap-1">
			<!-- Spawn Agent -->
			<button
				class="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all hover:scale-105"
				style="
					background: oklch(0.30 0.02 250);
					border: 1px solid oklch(0.40 0.02 250);
					color: oklch(0.70 0.14 200);
				"
				onclick={openSpawnModal}
				title="Spawn new agent session"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
				</svg>
				<span class="hidden lg:inline">Spawn</span>
			</button>

			<!-- Attack Backlog -->
			<button
				class="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all hover:scale-105"
				style="
					background: oklch(0.30 0.02 250);
					border: 1px solid oklch(0.40 0.02 250);
					color: oklch(0.70 0.18 30);
				"
				onclick={handleAttackBacklog}
				disabled={attackLoading}
				title="Spawn agents for ready tasks"
			>
				{#if attackLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
					</svg>
				{/if}
				<span class="hidden lg:inline">Attack</span>
			</button>

			<!-- Auto-Assign -->
			<button
				class="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all hover:scale-105"
				style="
					background: oklch(0.30 0.02 250);
					border: 1px solid oklch(0.40 0.02 250);
					color: oklch(0.70 0.14 250);
				"
				onclick={handleAutoAssign}
				disabled={autoAssignLoading}
				title="Assign ready tasks to idle agents"
			>
				{#if autoAssignLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
					</svg>
				{/if}
				<span class="hidden lg:inline">Assign</span>
			</button>

			<!-- Pause All -->
			<button
				class="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all hover:scale-105"
				style="
					background: oklch(0.30 0.02 250);
					border: 1px solid oklch(0.40 0.02 250);
					color: oklch(0.70 0.16 85);
				"
				onclick={handlePauseAll}
				disabled={pauseAllLoading}
				title="Send Ctrl+C to all sessions"
			>
				{#if pauseAllLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
					</svg>
				{/if}
				<span class="hidden lg:inline">Pause</span>
			</button>

			<!-- Broadcast Toggle -->
			<button
				class="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all hover:scale-105"
				style="
					background: {showBroadcastInput ? 'oklch(0.35 0.15 240 / 0.3)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {showBroadcastInput ? 'oklch(0.50 0.15 240)' : 'oklch(0.40 0.02 250)'};
					color: oklch(0.70 0.15 240);
				"
				onclick={toggleBroadcastInput}
				title="Broadcast message to all agents"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
				</svg>
				<span class="hidden lg:inline">Bcast</span>
			</button>

			<!-- Output Drawer Toggle -->
			<button
				class="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all hover:scale-105"
				style="
					background: {outputDrawerOpen ? 'oklch(0.35 0.15 240 / 0.3)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {outputDrawerOpen ? 'oklch(0.50 0.15 240)' : 'oklch(0.40 0.02 250)'};
					color: oklch(0.70 0.18 240);
				"
				onclick={toggleOutputDrawer}
				title="Toggle output panel"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<span class="hidden lg:inline">Output</span>
			</button>
		</div>

		<!-- Broadcast Input (expandable) -->
		{#if showBroadcastInput}
			<div class="flex items-center gap-1">
				<input
					id="broadcast-input"
					type="text"
					bind:value={broadcastMessage}
					placeholder="Message to all agents..."
					class="input input-xs w-40 font-mono text-xs"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.40 0.02 250); color: oklch(0.85 0.02 250);"
					onkeydown={(e) => e.key === 'Enter' && handleBroadcast()}
				/>
				<button
					class="btn btn-xs"
					style="background: oklch(0.35 0.15 240); border: none; color: oklch(0.95 0.02 250);"
					onclick={handleBroadcast}
					disabled={broadcastLoading || !broadcastMessage.trim()}
				>
					{#if broadcastLoading}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						Send
					{/if}
				</button>
			</div>
		{/if}
	</div>

	<!-- Middle: Command Palette -->
	<div class="flex-none">
		<CommandPalette />
	</div>

	<!-- Vertical separator -->
	<div class="w-px h-6 mx-3" style="background: linear-gradient(180deg, transparent, oklch(0.45 0.02 250), transparent);"></div>

	<!-- Right side: Stats + User Profile (Industrial) -->
	<div class="flex-none flex items-center gap-3 pr-3">
		<!-- Agent Count Badge -->
		<div class="hidden sm:flex">
			<AgentCountBadge
				activeCount={activeAgentCount}
				totalCount={totalAgentCount}
				{activeAgents}
				compact={true}
			/>
		</div>

		<!-- Industrial separator dot -->
		<div class="hidden sm:block w-1 h-1 rounded-full" style="background: oklch(0.50 0.02 250);"></div>

		<!-- Token Usage Badge -->
		<div class="hidden sm:flex">
			<TokenUsageBadge
				{tokensToday}
				{costToday}
				{sparklineData}
				{multiProjectData}
				{projectColors}
				compact={true}
			/>
		</div>

		<!-- Industrial separator dot -->
		<div class="hidden sm:block w-1 h-1 rounded-full" style="background: oklch(0.50 0.02 250);"></div>

		<!-- User Profile -->
		<UserProfile />
	</div>
</nav>
