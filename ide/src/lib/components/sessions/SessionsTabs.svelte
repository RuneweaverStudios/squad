<script lang="ts">
	/**
	 * SessionsTabs Component
	 *
	 * Minimal tab-based navigation for filtering sessions by type on the Sessions page.
	 * Simple colored text with brackets: [agents] [servers] [terminal]
	 *
	 * Tabs:
	 * - agents: Agent sessions (jat-* tmux sessions) - cyan
	 * - servers: Dev server sessions (server-* tmux sessions) - green
	 * - terminal: Other terminal sessions - purple
	 *
	 * @see ide/src/routes/sessions/+page.svelte for usage
	 */

	interface TabCount {
		agent: number;
		server: number;
		other: number;
		total: number;
	}

	interface Props {
		/** Currently active tab ID */
		activeTab: string;
		/** Session counts by type */
		counts?: TabCount;
		/** Called when tab changes */
		onTabChange?: (tabId: string) => void;
		/** Custom class */
		class?: string;
	}

	let {
		activeTab,
		counts = { agent: 0, server: 0, other: 0, total: 0 },
		onTabChange = () => {},
		class: className = ''
	}: Props = $props();

	// Tab definitions with icons
	const tabs = $derived([
		{
			id: 'all',
			label: 'all',
			count: counts.total,
			// Grid icon
			icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'
		},
		{
			id: 'agents',
			label: 'agents',
			count: counts.agent,
			// CPU/chip icon (represents AI agents)
			icon: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5M4.5 15.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z'
		},
		{
			id: 'servers',
			label: 'servers',
			count: counts.server,
			// Server icon
			icon: 'M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z'
		},
		{
			id: 'terminal',
			label: 'terminal',
			count: counts.other,
			// Terminal icon
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'
		}
	]);

	function handleTabClick(tabId: string) {
		if (tabId !== activeTab) {
			onTabChange(tabId);
		}
	}
</script>

<div class="sessions-tabs {className}" role="tablist" aria-label="Session type filters">
	<div class="tabs-container">
		{#each tabs as tab}
			<button
				role="tab"
				aria-selected={activeTab === tab.id}
				class="tab-btn"
				class:active={activeTab === tab.id}
				onclick={() => handleTabClick(tab.id)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="tab-icon"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
				</svg>
				<span class="tab-label">{tab.label}</span>
				{#if tab.count > 0}
					<span class="tab-count">{tab.count}</span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.sessions-tabs {
		display: flex;
		align-items: center;
	}

	.tabs-container {
		display: flex;
		gap: 0.125rem;
		padding: 0.125rem;
		background: oklch(0.15 0.01 250);
		border-radius: 8px;
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.tab-btn:hover:not(.active) {
		color: oklch(0.75 0.02 250);
		background: oklch(0.20 0.02 250);
	}

	.tab-btn.active {
		color: oklch(0.90 0.10 200);
		background: oklch(0.24 0.06 200);
	}

	.tab-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.tab-label {
		white-space: nowrap;
	}

	.tab-count {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		font-weight: 500;
	}

	.tab-btn.active .tab-count {
		color: oklch(0.90 0.10 200);
	}
</style>
