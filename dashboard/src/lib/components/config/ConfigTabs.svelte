<script lang="ts">
	/**
	 * ConfigTabs Component
	 *
	 * Tab-based navigation for the config page.
	 * Syncs active tab state with URL query parameter (?tab=commands|projects).
	 *
	 * @see dashboard/src/routes/config/+page.svelte for usage
	 */

	interface Tab {
		id: string;
		label: string;
		icon: string; // SVG path
	}

	interface Props {
		/** Currently active tab ID */
		activeTab: string;
		/** Called when tab changes */
		onTabChange?: (tabId: string) => void;
		/** Custom class */
		class?: string;
	}

	let {
		activeTab,
		onTabChange = () => {},
		class: className = ''
	}: Props = $props();

	// Tab definitions
	const tabs: Tab[] = [
		{
			id: 'commands',
			label: 'Commands',
			// Terminal/code icon
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'
		},
		{
			id: 'projects',
			label: 'Projects',
			// Folder icon
			icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z'
		},
		{
			id: 'mcp',
			label: 'MCP',
			// Server/plug icon
			icon: 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z'
		},
		{
			id: 'hooks',
			label: 'Hooks',
			// Hook/link chain icon
			icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
		},
		{
			id: 'claude',
			label: 'CLAUDE.md',
			// Document/file icon
			icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
		},
		{
			id: 'docs',
			label: 'Docs',
			// Book/documentation icon
			icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
		}
	];

	function handleTabClick(tabId: string) {
		if (tabId !== activeTab) {
			onTabChange(tabId);
		}
	}
</script>

<div class="config-tabs {className}" role="tablist" aria-label="Configuration sections">
	{#each tabs as tab}
		<button
			role="tab"
			aria-selected={activeTab === tab.id}
			aria-controls="{tab.id}-panel"
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
		</button>
	{/each}
</div>

<style>
	.config-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 10px;
		width: fit-content;
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.tab-btn:hover:not(.active) {
		color: oklch(0.75 0.02 250);
		background: oklch(0.18 0.02 250);
	}

	.tab-btn.active {
		color: oklch(0.90 0.10 200);
		background: oklch(0.22 0.06 200);
	}

	.tab-icon {
		width: 18px;
		height: 18px;
	}

	.tab-label {
		white-space: nowrap;
	}

	/* Responsive: hide labels on small screens */
	@media (max-width: 480px) {
		.tab-label {
			display: none;
		}

		.tab-btn {
			padding: 0.5rem 0.75rem;
		}
	}
</style>
