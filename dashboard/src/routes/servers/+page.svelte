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
	import { openProjectDrawer } from '$lib/stores/drawerStore';
	import { updateProjectColorCache, initProjectColors } from '$lib/utils/projectColors';

	interface Project {
		name: string;
		displayName: string;
		path: string;
		serverPath: string | null; // Where 'npm run dev' should be executed (optional, defaults to path)
		port: number | null;
		activeColor: string | null;
		inactiveColor: string | null;
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

	// Column sorting state
	type SortColumn = 'name' | 'port' | 'status' | 'activity' | 'tasks' | 'agents';
	const SORT_STORAGE_KEY = 'projects-table-sort';
	let sortColumn = $state<SortColumn>('activity');
	let sortDir = $state<'asc' | 'desc'>('asc');

	// Load sort preference from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(SORT_STORAGE_KEY);
			if (saved) {
				try {
					const parsed = JSON.parse(saved);
					if (parsed.column && parsed.dir) {
						sortColumn = parsed.column;
						sortDir = parsed.dir;
					}
				} catch { /* ignore */ }
			}
		}
	});

	// Handle column header click
	function handleColumnSort(column: SortColumn) {
		if (sortColumn === column) {
			// Toggle direction
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			// New column - set default direction
			sortColumn = column;
			sortDir = column === 'name' ? 'asc' : 'desc'; // Name ascending, others descending
		}
		// Persist to localStorage
		if (browser) {
			localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ column: sortColumn, dir: sortDir }));
		}
	}

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
	let editingColor = $state<string | null>(null); // Project name being edited (color)
	let colorDraft = $state<string>(''); // Color in hex format for picker

	// Predefined color palette for quick selection - using oklch for perceptual uniformity
	// These are designed to work well across different themes
	const COLOR_PALETTE = [
		'oklch(0.70 0.18 220)', // Blue
		'oklch(0.75 0.18 160)', // Cyan
		'oklch(0.65 0.20 30)',  // Red
		'oklch(0.80 0.18 90)',  // Yellow
		'oklch(0.70 0.18 145)', // Green
		'oklch(0.65 0.18 280)', // Purple
		'oklch(0.75 0.18 60)',  // Orange
		'oklch(0.70 0.18 200)', // Sky blue
		'oklch(0.60 0.18 300)', // Violet
		'oklch(0.55 0.25 25)',  // Dark red
		'oklch(0.80 0.20 150)', // Mint green
		'oklch(0.75 0.12 220)', // Light blue
		'oklch(0.70 0.22 15)',  // Bright red
		'oklch(0.75 0.20 120)', // Lime
		'oklch(0.85 0.18 85)'   // Bright yellow
	];

	// Convert #rrggbb to rgb(rrggbb) for JAT config (used when saving colors)
	function hexToRgb(hex: string): string {
		const cleaned = hex.replace('#', '').toLowerCase();
		return `rgb(${cleaned})`;
	}

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

	// Color editing functions
	function startEditingColor(project: Project) {
		editingColor = project.name;
		colorDraft = project.activeColor || 'oklch(0.60 0.05 250)'; // Neutral gray fallback
	}

	function cancelEditingColor() {
		editingColor = null;
		colorDraft = '';
	}

	async function saveColor(project: Project, newColor: string) {
		saving = project.name;
		try {
			const rgbColor = hexToRgb(newColor);
			// Generate inactive color (darker variant)
			const inactiveColor = generateInactiveColor(newColor);

			const response = await fetch('/api/projects', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project: project.name,
					active_color: rgbColor,
					inactive_color: hexToRgb(inactiveColor)
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save color');
			}

			// Update local state
			projects = projects.map(p =>
				p.name === project.name ? { ...p, activeColor: newColor, inactiveColor: inactiveColor } : p
			);

			// Update the global project color cache so other components see the new color immediately
			updateProjectColorCache(project.name, newColor);

			editingColor = null;
			colorDraft = '';
		} catch (err: any) {
			console.error('Failed to save color:', err);
			error = err.message;
			setTimeout(() => { error = null; }, 3000);
		} finally {
			saving = null;
		}
	}

	// Generate a darker inactive color variant
	function generateInactiveColor(hexColor: string): string {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);

		// Darken by 25%
		const darkenFactor = 0.75;
		const dr = Math.round(r * darkenFactor);
		const dg = Math.round(g * darkenFactor);
		const db = Math.round(b * darkenFactor);

		return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
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
		// Pre-fetch project colors for consistent UI
		initProjectColors();

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

	// Sort projects by user-selected column
	const sortedProjects = $derived(() => {
		const getActivityScore = (project: Project): number => {
			// Running servers first
			if (project.status === 'running') return -1;

			const activity = project.lastActivity;
			if (!activity) return 999999;
			if (activity === 'now') return 0;
			const unit = activity.slice(-1);
			const num = parseInt(activity.slice(0, -1), 10);
			const unitWeight: Record<string, number> = { 'm': 1, 'h': 60, 'd': 1440 };
			return (unitWeight[unit] || 9999) * (isNaN(num) ? 999 : num);
		};

		const getTaskCount = (project: Project): number => {
			return project.tasks?.open ?? 0;
		};

		const getAgentCount = (project: Project): number => {
			return project.agents?.active ?? project.agents?.total ?? 0;
		};

		return [...projects].sort((a, b) => {
			// First: visible projects before hidden
			if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;

			// Then: sort by selected column
			let cmp = 0;
			switch (sortColumn) {
				case 'name':
					cmp = a.name.localeCompare(b.name);
					break;
				case 'port':
					cmp = (a.port ?? 999999) - (b.port ?? 999999);
					break;
				case 'status':
					// Running first, then stopped
					const statusOrder = { 'running': 0, 'stopped': 1 };
					const aStatus = (a.status as keyof typeof statusOrder) ?? 'stopped';
					const bStatus = (b.status as keyof typeof statusOrder) ?? 'stopped';
					cmp = (statusOrder[aStatus] ?? 2) - (statusOrder[bStatus] ?? 2);
					break;
				case 'activity':
					cmp = getActivityScore(a) - getActivityScore(b);
					break;
				case 'tasks':
					cmp = getTaskCount(b) - getTaskCount(a); // Higher first
					break;
				case 'agents':
					cmp = getAgentCount(b) - getAgentCount(a); // Higher first
					break;
			}

			return sortDir === 'desc' ? -cmp : cmp;
		});
	});

</script>

<svelte:head>
	<title>Servers | JAT Dashboard</title>
	<link rel="icon" href="/favicons/servers.svg" />
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
			<div role="alert" class="alert alert-error mx-4 mt-2 font-mono text-xs py-2">
				<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Loading state -->
		{#if loading && projects.length === 0}
			<ProjectsTableSkeleton rows={6} />
		{:else if projects.length === 0}
			<div class="flex items-center justify-center py-12">
				<div class="text-center">
					<p class="text-base-content/60 font-mono text-sm">
						No projects found
					</p>
					<p class="text-base-content/50 font-mono text-xs mt-2 mb-4">
						Add a project to get started with JAT
					</p>
					<button
						class="btn btn-sm gap-1 text-success border border-success/30 bg-success/10"
						onclick={openProjectDrawer}
					>
						<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						Add Project
					</button>
				</div>
			</div>
		{:else}
			<!-- Sticky header with Add Project button -->
			<div class="sticky top-0 z-10 bg-base-100 border-b border-base-content/20 px-4 py-2 flex items-center justify-between">
				<span class="text-base-content/60 text-xs font-mono uppercase tracking-wider">
					{projects.length} project{projects.length !== 1 ? 's' : ''}
				</span>
				<button
					class="btn btn-xs btn-ghost gap-1 text-success border border-success/30"
					onclick={openProjectDrawer}
				>
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Add Project
				</button>
			</div>
			<!-- Projects table (no wrapper, direct integration) -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="bg-base-200 border-b border-base-content/20">
							<th
								class="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-base-300 transition-colors select-none {sortColumn === 'name' ? 'text-primary' : 'text-base-content/60'}"
								onclick={() => handleColumnSort('name')}
							>
								<span class="flex items-center gap-1">
									Project
									{#if sortColumn === 'name'}
										<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</span>
							</th>
							<th class="text-base-content/60 px-2 py-3 text-center font-mono text-[10px] uppercase tracking-wider">
								Color
							</th>
							<th
								class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-base-300 transition-colors select-none {sortColumn === 'port' ? 'text-primary' : 'text-base-content/60'}"
								onclick={() => handleColumnSort('port')}
							>
								<span class="flex items-center gap-1">
									Port
									{#if sortColumn === 'port'}
										<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</span>
							</th>
							<th
								class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-base-300 transition-colors select-none {sortColumn === 'status' ? 'text-primary' : 'text-base-content/60'}"
								onclick={() => handleColumnSort('status')}
							>
								<span class="flex items-center gap-1">
									Server
									{#if sortColumn === 'status'}
										<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</span>
							</th>
							<th
								class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-base-300 transition-colors select-none {sortColumn === 'activity' ? 'text-primary' : 'text-base-content/60'}"
								onclick={() => handleColumnSort('activity')}
							>
								<span class="flex items-center gap-1">
									Last
									{#if sortColumn === 'activity'}
										<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</span>
							</th>
							<th
								class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-base-300 transition-colors select-none {sortColumn === 'tasks' ? 'text-primary' : 'text-base-content/60'}"
								onclick={() => handleColumnSort('tasks')}
							>
								<span class="flex items-center gap-1">
									Tasks
									{#if sortColumn === 'tasks'}
										<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</span>
							</th>
							<th
								class="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-base-300 transition-colors select-none {sortColumn === 'agents' ? 'text-primary' : 'text-base-content/60'}"
								onclick={() => handleColumnSort('agents')}
							>
								<span class="flex items-center gap-1">
									Agents
									{#if sortColumn === 'agents'}
										<span class="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</span>
							</th>
							<th class="text-base-content/60 px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider min-w-[180px]">
								Desc
							</th>
							<th class="text-base-content/50 px-2 py-3 text-center font-mono text-[10px] uppercase tracking-wider">
								Show
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedProjects() as project (project.name)}
							{@const runningSessionName = getServerSessionName(project.name)}
							<tr
								class="border-b border-base-content/15 transition-colors {runningSessionName ? 'cursor-pointer' : ''} {project.status === 'running' ? 'bg-success/10 hover:bg-success/15' : 'hover:bg-base-200'}"
								style="opacity: {project.hidden ? '0.5' : '1'};"
								onmouseenter={() => { hoveredProject = project.name; }}
								onmouseleave={() => { hoveredProject = null; }}
								onclick={() => runningSessionName && scrollToSession(runningSessionName)}
							>
								<!-- Project name and path -->
								<td class="px-4 py-2">
									<div class="flex flex-col">
										<span class="text-base-content/90 font-mono text-sm font-medium">
											{project.name}
										</span>
										<button
											class="text-base-content/50 font-mono text-[10px] truncate max-w-[160px] hover:underline cursor-pointer text-left"
											title="Open folder: {project.path}"
											onclick={(e) => { e.stopPropagation(); openFolder(project.path); }}
										>
											{project.path.replace(/^\/home\/[^/]+/, '~')}
										</button>
									</div>
								</td>

								<!-- Color (editable with picker) -->
								<td class="px-2 py-2">
									<div class="relative flex justify-center">
										{#if editingColor === project.name}
											<!-- Color picker dropdown -->
											<div
												class="absolute top-0 left-1/2 -translate-x-1/2 z-50 p-2 rounded-lg shadow-xl bg-base-200 border border-base-content/25"
												onclick={(e) => e.stopPropagation()}
											>
												<!-- Palette grid -->
												<div class="grid grid-cols-5 gap-1.5 mb-2">
													{#each COLOR_PALETTE as color}
														<button
															class="w-6 h-6 rounded-full transition-transform hover:scale-110 {colorDraft === color ? 'ring-2 ring-white ring-offset-1' : ''}"
															style="background: {color};"
															onclick={() => { colorDraft = color; }}
															title={color}
														></button>
													{/each}
												</div>
												<!-- Custom color input -->
												<div class="flex items-center gap-1.5 mb-2">
													<input
														type="color"
														class="w-6 h-6 rounded cursor-pointer border-0 p-0"
														bind:value={colorDraft}
													/>
													<input
														type="text"
														class="flex-1 px-2 py-1 rounded font-mono text-xs bg-base-300 border border-base-content/20 text-base-content/90"
														bind:value={colorDraft}
														placeholder="oklch(0.70 0.18 220)"
													/>
												</div>
												<!-- Action buttons -->
												<div class="flex justify-end gap-1.5">
													<button
														class="px-2 py-1 rounded text-xs font-medium transition-colors bg-base-content/20 text-base-content/75"
														onclick={() => cancelEditingColor()}
													>
														Cancel
													</button>
													<button
														class="px-2 py-1 rounded text-xs font-medium transition-colors bg-success text-base-100"
														onclick={() => saveColor(project, colorDraft)}
														disabled={saving === project.name}
													>
														{saving === project.name ? 'Saving...' : 'Save'}
													</button>
												</div>
											</div>
											<!-- Current color dot (clickable to close) -->
											<button
												class="w-5 h-5 rounded-full transition-transform hover:scale-110 ring-2 ring-info"
												style="background: {colorDraft || 'oklch(0.60 0.05 250)'};"
												onclick={(e) => { e.stopPropagation(); cancelEditingColor(); }}
												title="Cancel"
											></button>
										{:else}
											<!-- Color dot (click to edit) -->
											<button
												class="w-5 h-5 rounded-full transition-all hover:scale-110 hover:ring-2 hover:ring-white/30"
												style="background: {project.activeColor || 'oklch(0.60 0.05 250)'};"
												onclick={(e) => { e.stopPropagation(); startEditingColor(project); }}
												title="Click to change color"
											></button>
										{/if}
									</div>
								</td>

								<!-- Port (editable) -->
								<td class="px-3 py-3">
									{#if editingPort === project.name}
										<input
											type="text"
											class="w-16 px-2 py-1 rounded font-mono text-xs outline-none bg-base-300 border border-info/50 text-base-content/90"
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
													class="text-success font-mono text-xs hover:underline"
													onclick={(e) => { e.stopPropagation(); window.open(`http://localhost:${project.port}`, '_blank'); }}
													title="Open http://localhost:{project.port} in browser"
												>
													:{project.port}
												</button>
												<!-- Copy URL button -->
												<button
													class="text-base-content/55 p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
													onclick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`http://localhost:${project.port}`); }}
													title="Copy URL to clipboard"
												>
													<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
													</svg>
												</button>
												<!-- Edit port button -->
												<button
													class="text-base-content/55 p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
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
														class="{copiedTmuxCmd === project.name ? 'text-success' : 'text-info'} p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
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
														class="text-base-content/75 font-mono text-xs"
														onclick={(e) => { e.stopPropagation(); startEditingPort(project); }}
														title="Click to edit port"
													>
														:{project.port}
													</button>
													<!-- Edit port button -->
													<button
														class="text-base-content/55 p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
														onclick={(e) => { e.stopPropagation(); startEditingPort(project); }}
														title="Edit port"
													>
														<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
															<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
														</svg>
													</button>
													<!-- Copy tmux command button -->
													<button
														class="{copiedTmuxCmd === project.name ? 'text-success' : 'text-info'} p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
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
													<span class="text-base-content/45 italic">—</span>
													<svg
														class="text-base-content/55 w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity"
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
								<td class="text-base-content/70 px-3 py-3 font-mono text-xs">
									{#if project.status === 'running'}
										{@const elapsed = getServerElapsed(project.name)}
										{#if elapsed}
											<span class="text-success flex items-center gap-0.5" title="Server uptime">
												{#if elapsed.showHours}
													<AnimatedDigits value={elapsed.hours} class="text-xs" />
													<span class="opacity-60">:</span>
												{/if}
												<AnimatedDigits value={elapsed.minutes} class="text-xs" />
												<span class="opacity-60">:</span>
												<AnimatedDigits value={elapsed.seconds} class="text-xs" />
											</span>
										{:else}
											<span class="text-success">now</span>
										{/if}
									{:else if project.lastActivity !== undefined}
										{project.lastActivity || '-'}
									{:else}
										<div class="skeleton h-3 w-6 rounded"></div>
									{/if}
								</td>

								<!-- Tasks -->
								<td class="text-base-content/70 px-3 py-3 font-mono text-xs">
									{#if project.tasks !== undefined}
										{formatTasks(project.tasks)}
									{:else}
										<div class="skeleton h-3 w-8 rounded"></div>
									{/if}
								</td>

								<!-- Agents -->
								<td class="text-base-content/70 px-3 py-3 font-mono text-xs">
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
												class="flex-1 px-2 py-1 rounded font-mono text-xs outline-none bg-base-300 border border-info/50 text-base-content/90"
												placeholder="Short description for AI context..."
												bind:value={descriptionDraft}
												onclick={(e) => e.stopPropagation()}
												onkeydown={(e) => handleDescriptionKeydown(e, project)}
												autofocus
											/>
											<button
												class="text-success p-1 rounded hover:bg-base-300/20"
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
												class="text-error p-1 rounded hover:bg-base-300/20"
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
												<span class="text-base-content/75 font-mono text-xs truncate max-w-[180px]">
													{project.description}
												</span>
											{:else}
												<span class="text-base-content/50 font-mono text-xs italic">
													Add description...
												</span>
											{/if}
											<svg
												class="text-base-content/60 w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
										class="relative w-7 h-3.5 rounded-full transition-all cursor-pointer opacity-60 hover:opacity-100 {project.hidden ? 'bg-base-content/25' : 'bg-success/45'}"
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
												class="absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all bg-base-content/90"
												class:visibility-toggle-knob-animate={animatingVisibility === project.name}
												style="left: {project.hidden ? '2px' : 'calc(100% - 12px)'};"
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
	/* Visibility toggle knob animation - scale pulse (cannot be done with Tailwind) */
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
