<script lang="ts">
	/**
	 * Servers Page
	 *
	 * Layout: ServerSessionPanel (horizontal scroll) + Resizable Divider + Projects Table
	 * Mirrors the /work page structure but for dev server sessions.
	 *
	 * Features:
	 * - Server session panel showing running dev servers with terminal output
	 * - Resizable divider between panels
	 * - Project settings table with visibility, description, port editing
	 */

	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import SessionPanel from '$lib/components/work/SessionPanel.svelte';
	import ResizableDivider from '$lib/components/ResizableDivider.svelte';
	import AnimatedDigits from '$lib/components/AnimatedDigits.svelte';
	import ServerStatusBadge from '$lib/components/work/ServerStatusBadge.svelte';
	import type { ServerState } from '$lib/config/statusColors';
	import {
		serverSessionsState,
		fetch as fetchServerSessions,
		start as startServerSession,
		stop as stopServerSession,
		restart as restartServerSession,
		sendInput as sendServerInput,
		interrupt as interruptServer,
		startPolling as startServerPolling,
		stopPolling as stopServerPolling
	} from '$lib/stores/serverSessions.svelte.js';
	import {
		playServerStartSound,
		playServerStopSound
	} from '$lib/utils/soundEffects';
	import { SessionPanelSkeleton, ProjectsTableSkeleton } from '$lib/components/skeleton';

	interface Project {
		name: string;
		displayName: string;
		path: string;
		serverPath: string | null; // Where 'npm run dev' should be executed (optional, defaults to path)
		port: number | null;
		activeColor: string | null;
		description: string | null;
		hidden: boolean;
		source: 'jat-config' | 'filesystem';
		tasks?: { open: number; total: number };
		agents?: { active: number; total: number };
		status?: string | null;
		lastActivity?: string | null;
	}

	// Resizable panel state
	const STORAGE_KEY = 'projects-panel-split';
	const DEFAULT_SPLIT = 50; // 50% for server panel, 50% for projects table
	const MIN_SPLIT = 20;
	const MAX_SPLIT = 80;
	const SNAP_RESTORE_SIZE = 40;

	let splitPercent = $state(DEFAULT_SPLIT);
	let containerHeight = $state(0);
	let containerRef: HTMLDivElement | null = null;

	// Snap-to-collapse state
	let isCollapsed = $state(false);
	let collapsedDirection = $state<'top' | 'bottom' | null>(null);
	let splitBeforeCollapse = $state(DEFAULT_SPLIT);

	// Highlighted session state (for scroll-to-card animation)
	let highlightedSession = $state<string | null>(null);

	// Hovered project for keyboard shortcuts
	let hoveredProject = $state<string | null>(null);

	// Animation state for visibility toggles
	let animatingVisibility = $state<string | null>(null);

	// Load saved split from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = parseFloat(saved);
				if (parsed === 0) {
					isCollapsed = true;
					collapsedDirection = 'top';
					splitPercent = 0;
				} else if (parsed === 100) {
					isCollapsed = true;
					collapsedDirection = 'bottom';
					splitPercent = 100;
				} else if (!isNaN(parsed) && parsed >= MIN_SPLIT && parsed <= MAX_SPLIT) {
					splitPercent = parsed;
					splitBeforeCollapse = parsed;
				}
			}
		}
	});

	// Save split to localStorage
	function saveSplit() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, splitPercent.toString());
		}
	}

	// Handle resize from divider
	function handleResize(deltaY: number) {
		if (!containerHeight) return;

		const deltaPercent = (deltaY / containerHeight) * 100;
		let newSplit = splitPercent + deltaPercent;

		if (newSplit < MIN_SPLIT) {
			splitBeforeCollapse = splitPercent >= MIN_SPLIT ? splitPercent : SNAP_RESTORE_SIZE;
			splitPercent = 0;
			isCollapsed = true;
			collapsedDirection = 'top';
			saveSplit();
			return;
		} else if (newSplit > MAX_SPLIT) {
			splitBeforeCollapse = splitPercent <= MAX_SPLIT ? splitPercent : 100 - SNAP_RESTORE_SIZE;
			splitPercent = 100;
			isCollapsed = true;
			collapsedDirection = 'bottom';
			saveSplit();
			return;
		}

		splitPercent = newSplit;
		isCollapsed = false;
		collapsedDirection = null;
		saveSplit();
	}

	// Restore from collapsed state
	function handleRestoreFromCollapse() {
		splitPercent = splitBeforeCollapse;
		isCollapsed = false;
		collapsedDirection = null;
		saveSplit();
	}

	// Update container height
	function updateContainerHeight() {
		if (containerRef) {
			containerHeight = containerRef.clientHeight;
		}
	}

	// Projects state
	let projects = $state<Project[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state<string | null>(null); // Project name being saved
	let editingDescription = $state<string | null>(null); // Project name being edited
	let descriptionDraft = $state<string>('');
	let copiedTmuxCmd = $state<string | null>(null); // Project name whose tmux cmd was copied
	let editingPort = $state<string | null>(null); // Project name being edited (port)
	let portDraft = $state<string>('');

	// Phase 1: Fast fetch without stats (instant page load)
	async function fetchProjects() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/projects');
			if (!response.ok) {
				throw new Error('Failed to fetch projects');
			}
			const data = await response.json();
			projects = data.projects || [];
		} catch (err: any) {
			error = err.message || 'Failed to load projects';
		} finally {
			loading = false;
		}
	}

	// Phase 2: Lazy fetch stats in background and merge
	async function fetchProjectStats() {
		try {
			const response = await fetch('/api/projects?stats=true');
			if (!response.ok) return;
			const data = await response.json();
			const statsMap = new Map<string, Project>((data.projects || []).map((p: Project) => [p.name, p]));

			// Merge stats into existing projects
			projects = projects.map(p => {
				const withStats = statsMap.get(p.name);
				if (withStats) {
					return {
						...p,
						tasks: withStats.tasks,
						agents: withStats.agents,
						status: withStats.status,
						lastActivity: withStats.lastActivity
					};
				}
				return p;
			});
		} catch (err) {
			// Stats are optional - don't show error to user
			console.warn('Failed to fetch project stats:', err);
		}
	}

	async function toggleVisibility(project: Project) {
		// Trigger animation
		animatingVisibility = project.name;

		saving = project.name;
		try {
			const response = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: project.hidden ? 'show' : 'hide',
					project: project.name
				})
			});

			if (!response.ok) {
				throw new Error('Failed to update project visibility');
			}

			// Update local state
			projects = projects.map(p =>
				p.name === project.name ? { ...p, hidden: !p.hidden } : p
			);
		} catch (err: any) {
			console.error('Failed to toggle visibility:', err);
			// Show error briefly
			error = err.message;
			setTimeout(() => { error = null; }, 3000);
		} finally {
			saving = null;
			// Reset animation after delay
			setTimeout(() => {
				animatingVisibility = null;
			}, 300);
		}
	}

	// Get server session name for a project (if running)
	function getServerSessionName(projectName: string): string | null {
		const session = serverSessionsState.sessions.find(
			s => s.projectName.toLowerCase() === projectName.toLowerCase()
		);
		return session?.sessionName || null;
	}

	// Handle ServerStatusBadge actions
	async function handleServerAction(projectName: string, actionId: string) {
		// Use fallback session name if not in store yet (server-{projectName} is the naming convention)
		const sessionName = getServerSessionName(projectName) || `server-${projectName}`;

		switch (actionId) {
			case 'start':
				await startServerSession(projectName);
				await fetchProjects();
				break;
			case 'stop':
				await stopServerSession(sessionName);
				await fetchProjects();
				break;
			case 'restart':
				await restartServerSession(sessionName);
				await fetchProjects();
				break;
			case 'attach':
				if (sessionName) {
					try {
						const response = await fetch(`/api/work/${sessionName}/attach`, {
							method: 'POST'
						});
						if (!response.ok) {
							console.error('Failed to attach terminal:', await response.text());
						}
					} catch (err) {
						console.error('Failed to attach terminal:', err);
					}
				}
				break;
			case 'kill':
				if (sessionName) {
					await stopServerSession(sessionName);
					await fetchProjects();
				}
				break;
			// 'open' is handled inside ServerStatusBadge component
		}
	}

	function startEditingDescription(project: Project) {
		editingDescription = project.name;
		descriptionDraft = project.description || '';
	}

	function cancelEditingDescription() {
		editingDescription = null;
		descriptionDraft = '';
	}

	async function saveDescription(project: Project) {
		saving = project.name;
		try {
			const response = await fetch('/api/projects', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project: project.name,
					description: descriptionDraft.trim() || null
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save description');
			}

			// Update local state
			projects = projects.map(p =>
				p.name === project.name ? { ...p, description: descriptionDraft.trim() || null } : p
			);
			editingDescription = null;
			descriptionDraft = '';
		} catch (err: any) {
			console.error('Failed to save description:', err);
			error = err.message;
			setTimeout(() => { error = null; }, 3000);
		} finally {
			saving = null;
		}
	}

	function handleDescriptionKeydown(event: KeyboardEvent, project: Project) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			saveDescription(project);
		} else if (event.key === 'Escape') {
			cancelEditingDescription();
		}
	}

	// Port editing functions
	function startEditingPort(project: Project) {
		editingPort = project.name;
		portDraft = project.port?.toString() || '';
	}

	function cancelEditingPort() {
		editingPort = null;
		portDraft = '';
	}

	async function savePort(project: Project) {
		saving = project.name;
		try {
			const portValue = portDraft.trim() ? parseInt(portDraft.trim(), 10) : null;

			// Validate port number
			if (portValue !== null && (isNaN(portValue) || portValue < 1 || portValue > 65535)) {
				error = 'Port must be between 1 and 65535';
				setTimeout(() => { error = null; }, 3000);
				saving = null;
				return;
			}

			const response = await fetch('/api/projects', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project: project.name,
					port: portValue
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save port');
			}

			// Update local state
			projects = projects.map(p =>
				p.name === project.name ? { ...p, port: portValue } : p
			);
			editingPort = null;
			portDraft = '';
		} catch (err: any) {
			console.error('Failed to save port:', err);
			error = err.message;
			setTimeout(() => { error = null; }, 3000);
		} finally {
			saving = null;
		}
	}

	function handlePortKeydown(event: KeyboardEvent, project: Project) {
		if (event.key === 'Enter') {
			event.preventDefault();
			savePort(project);
		} else if (event.key === 'Escape') {
			cancelEditingPort();
		}
	}

	// Server session event handlers
	async function handleKillSession(sessionName: string) {
		const success = await stopServerSession(sessionName);
		if (success) {
			await fetchProjects();
		}
	}

	async function handleAttachTerminal(sessionName: string) {
		try {
			const response = await fetch(`/api/work/${sessionName}/attach`, {
				method: 'POST'
			});
			if (!response.ok) {
				console.error('Failed to attach terminal:', await response.text());
			}
		} catch (err) {
			console.error('Failed to attach terminal:', err);
		}
	}

	async function handleSendInput(sessionName: string, input: string, type: 'text' | 'key' | 'raw') {
		if (type === 'raw') {
			await sendServerInput(sessionName, input, 'raw');
			return;
		}
		if (type === 'key') {
			const specialKeys = ['ctrl-c', 'ctrl-d'];
			if (specialKeys.includes(input)) {
				await sendServerInput(sessionName, '', input as 'ctrl-c' | 'ctrl-d');
				return;
			}
			await sendServerInput(sessionName, input, 'raw');
			return;
		}
		await sendServerInput(sessionName, input, 'text');
	}

	async function handleStopServer(sessionName: string) {
		playServerStopSound();
		await stopServerSession(sessionName);
		await fetchProjects();
	}

	async function handleRestartServer(sessionName: string) {
		// Restart is stop + start, play both sounds with delay
		playServerStopSound();
		await restartServerSession(sessionName);
		setTimeout(() => playServerStartSound(), 300);
		await fetchProjects();
	}

	async function handleStartServer(projectName: string) {
		playServerStartSound();
		await startServerSession(projectName);
		await fetchProjects();
	}

	async function openFolder(path: string) {
		try {
			const response = await fetch('/api/open-folder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path })
			});
			if (!response.ok) {
				const error = await response.json();
				console.error('Failed to open folder:', error.message);
			}
		} catch (err) {
			console.error('Failed to open folder:', err);
		}
	}

	function scrollToSession(sessionName: string) {
		// Find the session card by data attribute
		const sessionCard = document.querySelector(`[data-session-name="${sessionName}"]`);
		if (sessionCard) {
			// Scroll to the card
			sessionCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

			// Set highlighted state to trigger animation
			highlightedSession = sessionName;

			// Clear highlight after animation completes (1.5s matches CSS animation duration)
			setTimeout(() => {
				highlightedSession = null;
			}, 1500);
		}
	}

	// Keyboard shortcuts handler
	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		// Ignore if no project is hovered
		if (!hoveredProject) return;

		const project = projects.find(p => p.name === hoveredProject);
		if (!project) return;

		const sessionName = getServerSessionName(project.name);

		if (e.key === 'r' || e.key === 'R') {
			e.preventDefault();
			if (sessionName) {
				handleRestartServer(sessionName);
			} else {
				handleStartServer(project.name);
			}
		} else if (e.key === 's' || e.key === 'S') {
			e.preventDefault();
			if (sessionName) {
				handleStopServer(sessionName);
			}
		} else if (e.key === 'o' || e.key === 'O') {
			e.preventDefault();
			if (project.port && project.status === 'running') {
				window.open(`http://localhost:${project.port}`, '_blank');
			}
		}
	}

	onMount(async () => {
		// Phase 1: Fast initial load (no stats)
		await fetchProjects();
		// Poll every 5 seconds instead of 2 seconds
		// Server sessions don't need real-time updates like work sessions
		// The store now uses smart merging to prevent UI flashing
		startServerPolling(5000);
		updateContainerHeight();
		window.addEventListener('resize', updateContainerHeight);
		window.addEventListener('keydown', handleKeydown);

		// Phase 2: Lazy load stats in background after UI renders
		setTimeout(() => fetchProjectStats(), 100);

		// Auto-scroll to first running server session
		setTimeout(() => {
			const firstRunning = serverSessionsState.sessions.find(s => s.status === 'running');
			if (firstRunning) {
				scrollToSession(firstRunning.sessionName);
			}
		}, 300); // Small delay to ensure DOM is ready
	});

	onDestroy(() => {
		stopServerPolling();
		if (browser) {
			window.removeEventListener('resize', updateContainerHeight);
			window.removeEventListener('keydown', handleKeydown);
		}
	});

	// Stats helpers
	function formatTasks(tasks?: { open: number; total: number }) {
		if (!tasks || tasks.total === 0) return '-';
		return `${tasks.open}/${tasks.total}`;
	}

	function formatAgents(agents?: { active: number; total: number }) {
		if (!agents || agents.total === 0) return '-';
		if (agents.active > 0) return `${agents.active}/${agents.total}`;
		return `${agents.total}`;
	}

	// Tick counter for reactive elapsed time (updates every second)
	let tick = $state(0);
	let tickInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (browser) {
			tickInterval = setInterval(() => {
				tick++;
			}, 1000);
			return () => {
				if (tickInterval) clearInterval(tickInterval);
			};
		}
	});

	// Get elapsed time for a running server
	function getServerElapsed(projectName: string): { hours: string; minutes: string; seconds: string; showHours: boolean } | null {
		// Force reactivity with tick
		void tick;

		const session = serverSessionsState.sessions.find(
			s => s.projectName.toLowerCase() === projectName.toLowerCase()
		);
		if (!session?.created) return null;

		const startTime = new Date(session.created).getTime();
		const now = Date.now();
		const elapsedMs = now - startTime;

		if (elapsedMs < 0) return null;

		const totalSeconds = Math.floor(elapsedMs / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours: hours.toString().padStart(2, '0'),
			minutes: minutes.toString().padStart(2, '0'),
			seconds: seconds.toString().padStart(2, '0'),
			showHours: hours > 0
		};
	}

	// Sort projects: visible first, then by activity (running servers first, then recent)
	const sortedProjects = $derived(() => {
		const getActivityScore = (project: Project): number => {
			// Running servers first within their visibility group
			if (project.status === 'running') return -1;

			const activity = project.lastActivity;
			if (!activity) return 999999;
			if (activity === 'now') return 0;
			const unit = activity.slice(-1);
			const num = parseInt(activity.slice(0, -1), 10);
			const unitWeight: Record<string, number> = { 'm': 1, 'h': 60, 'd': 1440 };
			return (unitWeight[unit] || 9999) * (isNaN(num) ? 999 : num);
		};
		return [...projects].sort((a, b) => {
			// First: visible projects before hidden
			if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
			// Then: sort by activity within each group
			return getActivityScore(a) - getActivityScore(b);
		});
	});

</script>

<svelte:head>
	<title>Servers | JAT Dashboard</title>
</svelte:head>

<svelte:window onresize={updateContainerHeight} />

<div
	bind:this={containerRef}
	class="h-full bg-base-200 flex flex-col overflow-hidden"
>
	<!-- Server Sessions Panel (horizontal scroll) -->
	<div
		class="min-h-0 bg-base-100 flex flex-col transition-all duration-150"
		style="height: {splitPercent}%; overflow-x: hidden;"
		class:hidden={collapsedDirection === 'top'}
	>
		{#if serverSessionsState.isLoading && serverSessionsState.sessions.length === 0}
			<SessionPanelSkeleton cards={3} />
		{:else}
			<SessionPanel
				mode="server"
				serverSessions={serverSessionsState.sessions}
				onKillSession={handleKillSession}
				onAttachTerminal={handleAttachTerminal}
				onSendInput={handleSendInput}
				onStopServer={handleStopServer}
				onRestartServer={handleRestartServer}
				onStartServer={handleStartServer}
				highlightedSession={highlightedSession}
				class="flex-1"
			/>
		{/if}
	</div>

	<!-- Resizable Divider -->
	<ResizableDivider
		onResize={handleResize}
		{isCollapsed}
		{collapsedDirection}
		onCollapsedClick={handleRestoreFromCollapse}
		class="h-2 bg-base-300 hover:bg-primary/20 border-y border-base-300 flex-shrink-0"
	/>

	<!-- Projects Table Panel -->
	<div
		class="overflow-auto bg-base-100 flex-1 transition-all duration-150"
		style="height: {100 - splitPercent}%;"
		class:hidden={collapsedDirection === 'bottom'}
	>
		<!-- Error message (inline) -->
		{#if error}
			<div
				class="mx-4 mt-2 px-3 py-2 rounded font-mono text-xs"
				style="background: oklch(0.25 0.10 25 / 0.3); border: 1px solid oklch(0.50 0.15 25 / 0.5); color: oklch(0.80 0.10 25);"
			>
				{error}
			</div>
		{/if}

		<!-- Loading state -->
		{#if loading && projects.length === 0}
			<ProjectsTableSkeleton rows={6} />
		{:else if projects.length === 0}
			<div class="flex items-center justify-center py-12">
				<div class="text-center">
					<p class="font-mono text-sm" style="color: oklch(0.55 0.02 250);">
						No projects found
					</p>
					<p class="font-mono text-xs mt-2" style="color: oklch(0.45 0.02 250);">
						Run <code class="px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.02 250);">jat init</code> to discover projects
					</p>
				</div>
			</div>
		{:else}
			<!-- Projects table (no wrapper, direct integration) -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr style="background: oklch(0.22 0.01 250); border-bottom: 1px solid oklch(0.30 0.02 250);">
							<th class="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Project
							</th>
							<th class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Port
							</th>
							<th class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Server
							</th>
							<th class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Last
							</th>
							<th class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Tasks
							</th>
							<th class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
								Agents
							</th>
							<th class="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider min-w-[180px]" style="color: oklch(0.55 0.02 250);">
								Desc
							</th>
							<th class="px-2 py-3 text-center font-mono text-[10px] uppercase tracking-wider" style="color: oklch(0.45 0.02 250);">
								Show
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedProjects() as project (project.name)}
							{@const runningSessionName = getServerSessionName(project.name)}
							<tr
								class="transition-colors {runningSessionName ? 'cursor-pointer' : ''}"
								style="
									border-bottom: 1px solid oklch(0.25 0.01 250);
									opacity: {project.hidden ? '0.5' : '1'};
									background: {project.status === 'running' ? 'oklch(0.20 0.03 145 / 0.15)' : 'transparent'};
								"
								onmouseenter={(e) => { hoveredProject = project.name; e.currentTarget.style.background = project.status === 'running' ? 'oklch(0.22 0.05 145 / 0.25)' : 'oklch(0.22 0.02 250)'; }}
								onmouseleave={(e) => { hoveredProject = null; e.currentTarget.style.background = project.status === 'running' ? 'oklch(0.20 0.03 145 / 0.15)' : 'transparent'; }}
								onclick={() => runningSessionName && scrollToSession(runningSessionName)}
							>
								<!-- Project name with color indicator and path -->
								<td class="px-4 py-2">
									<div class="flex items-start gap-2">
										{#if project.activeColor}
											<span
												class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
												style="background: {project.activeColor};"
											></span>
										{/if}
										<div class="flex flex-col">
											<span class="font-mono text-sm font-medium" style="color: oklch(0.85 0.02 250);">
												{project.name}
											</span>
											<button
												class="font-mono text-[10px] truncate max-w-[160px] hover:underline cursor-pointer text-left"
												style="color: oklch(0.45 0.02 250);"
												title="Open folder: {project.path}"
												onclick={(e) => { e.stopPropagation(); openFolder(project.path); }}
											>
												{project.path.replace(/^\/home\/[^/]+/, '~')}
											</button>
										</div>
									</div>
								</td>

								<!-- Port (editable) -->
								<td class="px-3 py-3">
									{#if editingPort === project.name}
										<input
											type="text"
											class="w-16 px-2 py-1 rounded font-mono text-xs"
											style="
												background: oklch(0.25 0.01 250);
												border: 1px solid oklch(0.45 0.15 240);
												color: oklch(0.85 0.02 250);
												outline: none;
											"
											placeholder="Port"
											bind:value={portDraft}
											onclick={(e) => e.stopPropagation()}
											onkeydown={(e) => handlePortKeydown(e, project)}
											onblur={() => savePort(project)}
											autofocus
										/>
									{:else}
										<div class="flex items-center gap-1">
											{#if project.port && project.status === 'running'}
												<!-- Running: click to open in browser -->
												<button
													class="font-mono text-xs hover:underline"
													style="color: oklch(0.75 0.15 145);"
													onclick={(e) => { e.stopPropagation(); window.open(`http://localhost:${project.port}`, '_blank'); }}
													title="Open http://localhost:{project.port} in browser"
												>
													:{project.port}
												</button>
												<!-- Copy URL button -->
												<button
													class="p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
													style="color: oklch(0.65 0.02 250);"
													onclick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`http://localhost:${project.port}`); }}
													title="Copy URL to clipboard"
												>
													<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
													</svg>
												</button>
												<!-- Edit port button -->
												<button
													class="p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
													style="color: oklch(0.50 0.02 250);"
													onclick={(e) => { e.stopPropagation(); startEditingPort(project); }}
													title="Edit port"
												>
													<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
													</svg>
												</button>
												<!-- Copy tmux command button (only shows when running but not in tmux) -->
												{#if !runningSessionName}
													<button
														class="p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
														style="color: {copiedTmuxCmd === project.name ? 'oklch(0.70 0.18 145)' : 'oklch(0.70 0.12 200)'};"
														onclick={(e) => {
															e.stopPropagation();
															const execPath = (project.serverPath || project.path).replace(/^\/home\/[^/]+/, '~');
															const cmd = `tmux new-session -s server-${project.name} -c "${execPath}" 'npm run dev -- --port ${project.port}'`;
															navigator.clipboard.writeText(cmd);
															copiedTmuxCmd = project.name;
															setTimeout(() => copiedTmuxCmd = null, 1500);
														}}
														title="Copy tmux command (server is running but not tracked - run this to add to dashboard)"
													>
														{#if copiedTmuxCmd === project.name}
															<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
														{:else}
															<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
															</svg>
														{/if}
													</button>
												{/if}
											{:else if project.port}
												<!-- Not running: port + edit + copy tmux command -->
												<div class="flex items-center gap-1">
													<button
														class="font-mono text-xs"
														style="color: oklch(0.70 0.02 250);"
														onclick={(e) => { e.stopPropagation(); startEditingPort(project); }}
														title="Click to edit port"
													>
														:{project.port}
													</button>
													<!-- Edit port button -->
													<button
														class="p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
														style="color: oklch(0.50 0.02 250);"
														onclick={(e) => { e.stopPropagation(); startEditingPort(project); }}
														title="Edit port"
													>
														<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
															<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
														</svg>
													</button>
													<!-- Copy tmux command button -->
													<button
														class="p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
														style="color: {copiedTmuxCmd === project.name ? 'oklch(0.70 0.18 145)' : 'oklch(0.70 0.12 200)'};"
														onclick={(e) => {
															e.stopPropagation();
															const execPath = (project.serverPath || project.path).replace(/^\/home\/[^/]+/, '~');
															const cmd = `tmux new-session -s server-${project.name} -c "${execPath}" 'npm run dev -- --port ${project.port}'`;
															navigator.clipboard.writeText(cmd);
															copiedTmuxCmd = project.name;
															setTimeout(() => copiedTmuxCmd = null, 1500);
														}}
														title="Copy tmux command to start server"
													>
														{#if copiedTmuxCmd === project.name}
															<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
														{:else}
															<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
															</svg>
														{/if}
													</button>
												</div>
											{:else}
												<!-- No port: click to add -->
												<button
													class="group flex items-center gap-1 font-mono text-xs"
													onclick={(e) => { e.stopPropagation(); startEditingPort(project); }}
													title="Click to set port"
												>
													<span class="italic" style="color: oklch(0.40 0.02 250);">—</span>
													<svg
														class="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity"
														style="color: oklch(0.50 0.02 250);"
														fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
													>
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
													</svg>
												</button>
											{/if}
										</div>
									{/if}
								</td>

								<!-- Server Status/Actions Badge -->
								<td class="px-3 py-3" onclick={(e) => e.stopPropagation()}>
									<ServerStatusBadge
										serverStatus={(project.status || 'stopped') as ServerState}
										sessionName={getServerSessionName(project.name) || `server-${project.name}`}
										port={project.port}
										portRunning={project.status === 'running'}
										onAction={(actionId) => handleServerAction(project.name, actionId)}
									/>
								</td>

								<!-- Last activity / Server uptime -->
								<td class="px-3 py-3 font-mono text-xs" style="color: oklch(0.65 0.02 250);">
									{#if project.status === 'running'}
										{@const elapsed = getServerElapsed(project.name)}
										{#if elapsed}
											<span class="flex items-center gap-0.5" title="Server uptime" style="color: oklch(0.75 0.18 145);">
												{#if elapsed.showHours}
													<AnimatedDigits value={elapsed.hours} class="text-xs" />
													<span class="opacity-60">:</span>
												{/if}
												<AnimatedDigits value={elapsed.minutes} class="text-xs" />
												<span class="opacity-60">:</span>
												<AnimatedDigits value={elapsed.seconds} class="text-xs" />
											</span>
										{:else}
											<span style="color: oklch(0.75 0.18 145);">now</span>
										{/if}
									{:else if project.lastActivity !== undefined}
										{project.lastActivity || '-'}
									{:else}
										<div class="skeleton h-3 w-6 rounded"></div>
									{/if}
								</td>

								<!-- Tasks -->
								<td class="px-3 py-3 font-mono text-xs" style="color: oklch(0.65 0.02 250);">
									{#if project.tasks !== undefined}
										{formatTasks(project.tasks)}
									{:else}
										<div class="skeleton h-3 w-8 rounded"></div>
									{/if}
								</td>

								<!-- Agents -->
								<td class="px-3 py-3 font-mono text-xs" style="color: oklch(0.65 0.02 250);">
									{#if project.agents !== undefined}
										{formatAgents(project.agents)}
									{:else}
										<div class="skeleton h-3 w-6 rounded"></div>
									{/if}
								</td>

								<!-- Description (editable) -->
								<td class="px-4 py-3">
									{#if editingDescription === project.name}
										<div class="flex items-center gap-2">
											<input
												type="text"
												class="flex-1 px-2 py-1 rounded font-mono text-xs"
												style="
													background: oklch(0.25 0.01 250);
													border: 1px solid oklch(0.45 0.15 240);
													color: oklch(0.85 0.02 250);
													outline: none;
												"
												placeholder="Short description for AI context..."
												bind:value={descriptionDraft}
												onclick={(e) => e.stopPropagation()}
												onkeydown={(e) => handleDescriptionKeydown(e, project)}
												autofocus
											/>
											<button
												class="p-1 rounded hover:bg-base-300/20"
												style="color: oklch(0.60 0.15 145);"
												onclick={(e) => { e.stopPropagation(); saveDescription(project); }}
												disabled={saving === project.name}
												title="Save (Enter)"
											>
												{#if saving === project.name}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
													</svg>
												{/if}
											</button>
											<button
												class="p-1 rounded hover:bg-base-300/20"
												style="color: oklch(0.60 0.10 25);"
												onclick={(e) => { e.stopPropagation(); cancelEditingDescription(); }}
												title="Cancel (Esc)"
											>
												<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										</div>
									{:else}
										<button
											class="group flex items-center gap-2 w-full text-left"
											onclick={(e) => { e.stopPropagation(); startEditingDescription(project); }}
											title="Click to edit description"
										>
											{#if project.description}
												<span class="font-mono text-xs truncate max-w-[180px]" style="color: oklch(0.70 0.02 250);">
													{project.description}
												</span>
											{:else}
												<span class="font-mono text-xs italic" style="color: oklch(0.45 0.02 250);">
													Add description...
												</span>
											{/if}
											<svg
												class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
												style="color: oklch(0.55 0.02 250);"
												fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
											>
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
											</svg>
										</button>
									{/if}
								</td>

								<!-- Visibility toggle (diminished) -->
								<td class="px-2 py-3 text-center">
									<button
										class="relative w-7 h-3.5 rounded-full transition-all cursor-pointer opacity-60 hover:opacity-100"
										style="
											background: {project.hidden ? 'oklch(0.30 0.02 250)' : 'oklch(0.40 0.12 145)'};
										"
										onclick={(e) => { e.stopPropagation(); toggleVisibility(project); }}
										disabled={saving === project.name}
										title={project.hidden ? 'Show in dropdowns' : 'Hide from dropdowns'}
									>
										{#if saving === project.name}
											<span class="absolute inset-0 flex items-center justify-center">
												<span class="loading loading-spinner" style="width: 8px; height: 8px;"></span>
											</span>
										{:else}
											<span
												class="absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all"
												class:visibility-toggle-knob-animate={animatingVisibility === project.name}
												style="
													background: oklch(0.85 0.02 250);
													left: {project.hidden ? '2px' : 'calc(100% - 12px)'};
												"
											></span>
										{/if}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Visibility toggle knob animation - scale pulse */
	.visibility-toggle-knob-animate {
		animation: toggle-knob-pulse 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes toggle-knob-pulse {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.4);
		}
		100% {
			transform: scale(1);
		}
	}
</style>
