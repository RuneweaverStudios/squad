<script>
	import AgentCard from './AgentCard.svelte';
	import AutoAssignModal from './AutoAssignModal.svelte';
	import { generateAutoAssignments } from '$lib/utils/autoAssign';

	let { agents = [], tasks = [], allTasks = [], reservations = [], sparklineData = [], onTaskAssign = () => {}, ontaskclick = () => {}, selectedDateRange = 'all', customDateFrom = null, customDateTo = null } = $props();

	// Determine if we're viewing historical data (not "all" or "today")
	const isHistoricalView = $derived(() => {
		if (selectedDateRange === 'all' || selectedDateRange === 'today') return false;
		if (selectedDateRange === 'custom') {
			// Check if custom range ends before today
			if (customDateTo) {
				const today = new Date().toISOString().split('T')[0];
				return customDateTo < today;
			}
			return false;
		}
		// For preset ranges like 'week', 'month' - not historical by default
		return false;
	});

	// Modal state
	let showModal = $state(false);
	let assignments = $state([]);
	let isAssigning = $state(false);

	// Get unassigned tasks (status='open' and no assignee)
	const unassignedTasks = $derived(
		tasks.filter(t => t.status === 'open' && !t.assignee)
	);

	// Helper to compute agent status (matches AgentCard.svelte and store logic)
	function getAgentStatus(agent) {
		const hasActiveLocks = agent.reservation_count > 0;
		const hasInProgressTask = agent.in_progress_tasks > 0;

		let timeSinceActive = Infinity;
		if (agent.last_active_ts) {
			const isoTimestamp = agent.last_active_ts.includes('T')
				? agent.last_active_ts
				: agent.last_active_ts.replace(' ', 'T') + 'Z';
			const lastActivity = new Date(isoTimestamp);
			timeSinceActive = Date.now() - lastActivity.getTime();
		}

		// Priority 1: WORKING - Has active task or locks (regardless of time)
		// Show "working" if agent has actual work assigned, even if recently active
		if (hasInProgressTask || hasActiveLocks) {
			return 'working';
		}

		// Priority 2: LIVE - Very recent activity (< 1 minute) but no task
		if (timeSinceActive < 60000) {
			return 'live';
		}

		// Priority 3: ACTIVE - Recent activity (< 10 minutes)
		if (timeSinceActive < 600000) {
			return 'active';
		}

		// Priority 4: IDLE - Within 1 hour
		if (timeSinceActive < 3600000) {
			return 'idle';
		}

		// Priority 5: OFFLINE
		return 'offline';
	}

	// Status priority for sorting (lower number = higher priority)
	function getStatusPriority(status) {
		const priorities = {
			live: 1,
			working: 2,
			active: 3,
			idle: 4,
			offline: 5
		};
		return priorities[status] || 999;
	}

	// Sort agents by status priority (live > working > active > idle > offline)
	const sortedAgents = $derived(() => {
		return [...agents].sort((a, b) => {
			const statusA = getAgentStatus(a);
			const statusB = getAgentStatus(b);
			const priorityA = getStatusPriority(statusA);
			const priorityB = getStatusPriority(statusB);

			// Sort by status priority first
			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			// Within same status, sort by last activity (most recent first)
			if (a.last_active_ts && b.last_active_ts) {
				return new Date(b.last_active_ts).getTime() - new Date(a.last_active_ts).getTime();
			}

			// If one has activity and other doesn't, prioritize the one with activity
			if (a.last_active_ts && !b.last_active_ts) return -1;
			if (!a.last_active_ts && b.last_active_ts) return 1;

			// Finally sort by name alphabetically
			return a.name.localeCompare(b.name);
		});
	});

	// Auto-assign button action
	function handleAutoAssign() {
		// Generate assignments using the algorithm
		const proposed = generateAutoAssignments(unassignedTasks, agents, reservations);

		if (proposed.length === 0) {
			alert('No suitable assignments found. All agents may be at capacity or tasks are blocked.');
			return;
		}

		// Show preview modal
		assignments = proposed;
		showModal = true;
	}

	// Confirm and apply assignments
	async function confirmAssignments() {
		isAssigning = true;

		try {
			// Batch assign all tasks via API
			const promises = assignments.map(assignment =>
				fetch('/api/tasks/assign', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						taskId: assignment.task.id,
						agentName: assignment.agent.name
					})
				}).then(res => res.json())
			);

			const results = await Promise.all(promises);

			// Check for errors
			const errors = results.filter(r => r.error);
			if (errors.length > 0) {
				console.error('Some assignments failed:', errors);
				alert(`${errors.length} assignment(s) failed. Check console for details.`);
			} else {
				console.log('All assignments successful!');
			}

			// Close modal
			showModal = false;
			assignments = [];

			// Refresh data (parent component will handle via polling)
		} catch (error) {
			console.error('Error applying assignments:', error);
			alert('Failed to apply assignments. See console for details.');
		} finally {
			isAssigning = false;
		}
	}

	// Cancel assignment preview
	function cancelAssignments() {
		showModal = false;
		assignments = [];
	}

	// Smart balance action (placeholder)
	function handleSmartBalance() {
		console.log('Smart balance logic will be implemented in P1 task');
		// TODO: Implement in jomarchy-agent-tools-kpw
	}

	// Refresh data (placeholder)
	function handleRefresh() {
		console.log('Manual refresh triggered');
		// Parent component will handle data fetching
	}
</script>

<div class="flex flex-col h-full">
	<!-- Agent Grid - Horizontal Scrolling Row -->
	<div class="p-4">
		{#if agents.length === 0}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center h-48 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-16 h-16 text-base-content/20 mb-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
					/>
				</svg>
				<h3 class="text-lg font-medium text-base-content/70 mb-2">No Agents Online</h3>
				<p class="text-sm text-base-content/50 max-w-md">
					Agents will appear here when they register and start working. Use Agent Mail's
					<code class="text-xs bg-base-300 px-1 py-0.5 rounded">am-register</code> command to create
					agents.
				</p>
			</div>
		{:else}
			<!-- Horizontal Scrolling Row -->
			<div class="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
				{#each sortedAgents() as agent (agent.id || agent.name)}
					<div class="flex-shrink-0 w-80 h-72">
						<AgentCard {agent} {tasks} {allTasks} {reservations} {onTaskAssign} {ontaskclick} {selectedDateRange} {customDateFrom} {customDateTo} isHistoricalView={isHistoricalView()} />
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Auto-Assign Preview Modal -->
{#if showModal}
	<AutoAssignModal
		{assignments}
		{isAssigning}
		onConfirm={confirmAssignments}
		onCancel={cancelAssignments}
	/>
{/if}
