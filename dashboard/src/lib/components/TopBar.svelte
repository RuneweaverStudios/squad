<script lang="ts">
	/**
	 * TopBar Component - Horizontal utilities bar
	 *
	 * Simplified navigation bar containing only utility components:
	 * - Hamburger toggle (mobile only, for sidebar)
	 * - AgentCountBadge
	 * - TokenUsageBadge (tokens today, cost, sparkline)
	 * - CommandPalette
	 * - UserProfile
	 *
	 * Navigation buttons (List, Graph, Agents) removed - moved to Sidebar
	 * Project filtering removed - handled by TaskTable filter bar
	 *
	 * Props:
	 * - tokensToday: number (total tokens consumed today)
	 * - costToday: number (total cost today in USD)
	 * - sparklineData: DataPoint[] (24h sparkline data)
	 */

	import AgentCountBadge from './AgentCountBadge.svelte';
	import TokenUsageBadge from './TokenUsageBadge.svelte';
	import UserProfile from './UserProfile.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import { openTaskDrawer } from '$lib/stores/drawerStore';

	// Global action loading states
	let newSessionLoading = $state(false);
	let swarmLoading = $state(false);
	let pauseAllLoading = $state(false);
	let broadcastLoading = $state(false);

	// Broadcast input state
	let showBroadcastInput = $state(false);
	let broadcastMessage = $state('');

	// New Session - spawn a planning session in selected project
	async function handleNewSession(projectName: string) {
		newSessionLoading = true;
		showSessionDropdown = false;
		try {
			const projectPath = `/home/jw/code/${projectName}`;
			const response = await fetch('/api/work/spawn', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					attach: true,
					project: projectPath
				})
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to spawn session');
			}
			console.log('New session in', projectName, ':', data);
		} catch (error) {
			console.error('New session failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to spawn session');
		} finally {
			newSessionLoading = false;
		}
	}

	// Swarm - spawn one agent per ready task
	async function handleSwarm() {
		swarmLoading = true;
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
			console.log('Swarm started:', data);
		} catch (error) {
			console.error('Swarm failed:', error);
			alert(error instanceof Error ? error.message : 'Failed to spawn agents');
		} finally {
			swarmLoading = false;
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
		/** Number of ready tasks for Swarm button */
		readyTaskCount?: number;
		/** Available projects for session spawning */
		projects?: string[];
		/** Currently selected project filter (for auto-detection) */
		selectedProject?: string;
	}

	let {
		activeAgentCount = 0,
		totalAgentCount = 0,
		activeAgents = [],
		tokensToday = 0,
		costToday = 0,
		sparklineData = [],
		multiProjectData,
		projectColors = {},
		readyTaskCount = 0,
		projects = [],
		selectedProject = 'All Projects'
	}: Props = $props();

	// Session dropdown state
	let showSessionDropdown = $state(false);
	let sessionDropdownTimeout: ReturnType<typeof setTimeout> | null = null;

	// Get actual project list (filter out "All Projects")
	const actualProjects = $derived(projects.filter(p => p !== 'All Projects'));

	// Auto-detect default project: use selected filter, or first available, or 'jat'
	const defaultProject = $derived(() => {
		if (selectedProject && selectedProject !== 'All Projects') {
			return selectedProject;
		}
		if (actualProjects.length > 0) {
			return actualProjects[0];
		}
		return 'jat';
	});

	// Handle dropdown show/hide with delay
	function showDropdown() {
		if (sessionDropdownTimeout) clearTimeout(sessionDropdownTimeout);
		showSessionDropdown = true;
	}

	function hideDropdownDelayed() {
		sessionDropdownTimeout = setTimeout(() => {
			showSessionDropdown = false;
		}, 150);
	}

	function keepDropdownOpen() {
		if (sessionDropdownTimeout) clearTimeout(sessionDropdownTimeout);
	}

	// Button hover states
	let sessionHovered = $state(false);
	let taskHovered = $state(false);
	let swarmHovered = $state(false);
	let pauseHovered = $state(false);
	let bcastHovered = $state(false);
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

	<!-- Left side utilities -->
	<div class="flex-1 flex items-center gap-3 px-2">
		<!-- New Session Dropdown (Primary action - pick project, then spawn) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative"
			onmouseenter={showDropdown}
			onmouseleave={hideDropdownDelayed}
		>
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {sessionHovered || showSessionDropdown ? 'linear-gradient(135deg, oklch(0.60 0.22 250) 0%, oklch(0.50 0.20 265) 100%)' : 'linear-gradient(135deg, oklch(0.55 0.20 250) 0%, oklch(0.45 0.18 265) 100%)'};
					border: 1px solid {sessionHovered || showSessionDropdown ? 'oklch(0.70 0.20 250)' : 'oklch(0.60 0.18 250)'};
					color: oklch(0.95 0.02 250);
					text-shadow: 0 0 10px oklch(0.60 0.20 250 / 0.5);
					padding-left: {sessionHovered || showSessionDropdown ? '10px' : '8px'};
					padding-right: {sessionHovered || showSessionDropdown ? '10px' : '8px'};
					box-shadow: {sessionHovered || showSessionDropdown ? '0 0 25px oklch(0.55 0.22 250 / 0.5)' : '0 0 10px oklch(0.55 0.20 250 / 0.2)'};
					transform: {sessionHovered || showSessionDropdown ? 'scale(1.05)' : 'scale(1)'};
				"
				disabled={newSessionLoading}
				title="Start new Claude Code session - pick a project"
				onmouseenter={() => sessionHovered = true}
				onmouseleave={() => sessionHovered = false}
			>
				{#if newSessionLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span>Starting...</span>
				{:else}
					<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
					</svg>
					{#if sessionHovered || showSessionDropdown}
						<span class="whitespace-nowrap">New Session</span>
						<svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					{:else}
						<span class="hidden sm:inline">Session</span>
					{/if}
				{/if}
			</button>

			<!-- Project Dropdown -->
			{#if showSessionDropdown && !newSessionLoading}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg shadow-xl z-50 overflow-hidden"
					style="
						background: linear-gradient(180deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.02 250) 100%);
						border: 1px solid oklch(0.40 0.03 250);
					"
					onmouseenter={keepDropdownOpen}
					onmouseleave={hideDropdownDelayed}
				>
					<div class="px-3 py-2 border-b" style="border-color: oklch(0.30 0.02 250);">
						<span class="text-[9px] font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
							Select Project
						</span>
					</div>
					<div class="py-1 max-h-[240px] overflow-y-auto">
						{#if actualProjects.length === 0}
							<div class="px-3 py-2 text-xs" style="color: oklch(0.50 0.02 250);">
								No projects found
							</div>
						{:else}
							{#each actualProjects as project}
								<button
									class="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 transition-colors"
									style="color: oklch(0.80 0.02 250);"
									onmouseenter={(e) => e.currentTarget.style.background = 'oklch(0.30 0.03 250)'}
									onmouseleave={(e) => e.currentTarget.style.background = 'transparent'}
									onclick={() => handleNewSession(project)}
								>
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										style="background: {projectColors[project] || 'oklch(0.60 0.15 250)'};"
									></span>
									<span class="flex-1">{project}</span>
									{#if project === defaultProject()}
										<span class="text-[8px] uppercase px-1 rounded" style="background: oklch(0.35 0.10 250); color: oklch(0.70 0.15 250);">
											default
										</span>
									{/if}
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Add Task Button (Industrial) -->
		<button
			class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
			style="
				background: {taskHovered ? 'linear-gradient(135deg, oklch(0.75 0.22 145 / 0.35) 0%, oklch(0.75 0.22 145 / 0.2) 100%)' : 'linear-gradient(135deg, oklch(0.75 0.20 145 / 0.2) 0%, oklch(0.75 0.20 145 / 0.1) 100%)'};
				border: 1px solid {taskHovered ? 'oklch(0.80 0.22 145 / 0.6)' : 'oklch(0.75 0.20 145 / 0.4)'};
				color: {taskHovered ? 'oklch(0.90 0.20 145)' : 'oklch(0.80 0.18 145)'};
				text-shadow: 0 0 10px oklch(0.75 0.20 145 / 0.5);
				padding-left: {taskHovered ? '10px' : '8px'};
				padding-right: {taskHovered ? '10px' : '8px'};
				box-shadow: {taskHovered ? '0 0 20px oklch(0.75 0.22 145 / 0.4)' : 'none'};
				transform: {taskHovered ? 'scale(1.05)' : 'scale(1)'};
			"
			onclick={() => openTaskDrawer(selectedProject)}
			title="Create new task"
			onmouseenter={() => taskHovered = true}
			onmouseleave={() => taskHovered = false}
		>
			<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			{#if taskHovered}
				<span class="whitespace-nowrap">Create New Task</span>
			{:else}
				<span class="hidden sm:inline">Task</span>
			{/if}
		</button>

		<!-- Global Action Buttons (Industrial) -->
		<div class="hidden md:flex items-center gap-1">
			<!-- Swarm - spawn agent per ready task (expands on hover) -->
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {swarmHovered ? 'linear-gradient(135deg, oklch(0.45 0.20 30) 0%, oklch(0.35 0.18 45) 100%)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {swarmHovered ? 'oklch(0.55 0.20 30)' : 'oklch(0.40 0.02 250)'};
					color: {swarmHovered ? 'oklch(0.95 0.02 60)' : 'oklch(0.70 0.18 30)'};
					padding-left: {swarmHovered ? '12px' : '8px'};
					padding-right: {swarmHovered ? '12px' : '8px'};
					box-shadow: {swarmHovered ? '0 0 20px oklch(0.50 0.20 30 / 0.4)' : 'none'};
					transform: {swarmHovered ? 'scale(1.05)' : 'scale(1)'};
				"
				onclick={handleSwarm}
				disabled={swarmLoading || readyTaskCount === 0}
				title={readyTaskCount > 0 ? `Spawn ${readyTaskCount} agent${readyTaskCount !== 1 ? 's' : ''} for ready tasks` : 'No ready tasks'}
				onmouseenter={() => swarmHovered = true}
				onmouseleave={() => swarmHovered = false}
			>
				{#if swarmLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span>Swarming...</span>
				{:else}
					<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
					</svg>
					{#if swarmHovered && readyTaskCount > 0}
						<span class="whitespace-nowrap">Swarm {readyTaskCount} Task{readyTaskCount !== 1 ? 's' : ''}</span>
					{:else if swarmHovered && readyTaskCount === 0}
						<span class="whitespace-nowrap" style="color: oklch(0.60 0.02 250);">No Tasks</span>
					{:else}
						<span class="hidden lg:inline">Swarm</span>
					{/if}
				{/if}
			</button>

			<!-- Pause All -->
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {pauseHovered ? 'linear-gradient(135deg, oklch(0.50 0.18 85) 0%, oklch(0.40 0.16 70) 100%)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {pauseHovered ? 'oklch(0.60 0.18 85)' : 'oklch(0.40 0.02 250)'};
					color: {pauseHovered ? 'oklch(0.95 0.05 85)' : 'oklch(0.70 0.16 85)'};
					padding-left: {pauseHovered ? '12px' : '8px'};
					padding-right: {pauseHovered ? '12px' : '8px'};
					box-shadow: {pauseHovered ? '0 0 20px oklch(0.55 0.18 85 / 0.4)' : 'none'};
					transform: {pauseHovered ? 'scale(1.05)' : 'scale(1)'};
				"
				onclick={handlePauseAll}
				disabled={pauseAllLoading || activeAgentCount === 0}
				title={activeAgentCount > 0 ? `Send Ctrl+C to ${activeAgentCount} session${activeAgentCount !== 1 ? 's' : ''}` : 'No active sessions'}
				onmouseenter={() => pauseHovered = true}
				onmouseleave={() => pauseHovered = false}
			>
				{#if pauseAllLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span>Pausing...</span>
				{:else}
					<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
					</svg>
					{#if pauseHovered && activeAgentCount > 0}
						<span class="whitespace-nowrap">Pause {activeAgentCount} Agent{activeAgentCount !== 1 ? 's' : ''}</span>
					{:else if pauseHovered && activeAgentCount === 0}
						<span class="whitespace-nowrap" style="color: oklch(0.60 0.02 250);">No Agents</span>
					{:else}
						<span class="hidden lg:inline">Pause</span>
					{/if}
				{/if}
			</button>

			<!-- Broadcast Toggle -->
			<button
				class="flex items-center gap-1 py-1 rounded font-mono text-[10px] tracking-wider uppercase transition-all duration-200 ease-out overflow-hidden"
				style="
					background: {bcastHovered || showBroadcastInput ? 'linear-gradient(135deg, oklch(0.45 0.18 240) 0%, oklch(0.35 0.16 255) 100%)' : 'oklch(0.30 0.02 250)'};
					border: 1px solid {bcastHovered || showBroadcastInput ? 'oklch(0.55 0.18 240)' : 'oklch(0.40 0.02 250)'};
					color: {bcastHovered || showBroadcastInput ? 'oklch(0.95 0.05 240)' : 'oklch(0.70 0.15 240)'};
					padding-left: {bcastHovered ? '12px' : '8px'};
					padding-right: {bcastHovered ? '12px' : '8px'};
					box-shadow: {bcastHovered ? '0 0 20px oklch(0.50 0.18 240 / 0.4)' : 'none'};
					transform: {bcastHovered ? 'scale(1.05)' : 'scale(1)'};
				"
				onclick={toggleBroadcastInput}
				title="Broadcast message to all agents"
				onmouseenter={() => bcastHovered = true}
				onmouseleave={() => bcastHovered = false}
			>
				<svg class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
				</svg>
				{#if bcastHovered}
					<span class="whitespace-nowrap">Message All Agents</span>
				{:else}
					<span class="hidden lg:inline">Bcast</span>
				{/if}
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
	<div class="flex-none flex items-center gap-2.5 pr-3">
		<!-- Agent Count Badge -->
		<div class="hidden sm:flex">
			<AgentCountBadge
				activeCount={activeAgentCount}
				totalCount={totalAgentCount}
				{activeAgents}
				compact={true}
			/>
		</div>

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

		<!-- User Profile -->
		<UserProfile />
	</div>
</nav>
