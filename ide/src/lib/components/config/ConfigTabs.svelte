<script lang="ts">
	/**
	 * ConfigTabs Component
	 *
	 * Tab-based navigation for the config page with grouped categories.
	 * Displays tabs in two rows with visual category grouping to reduce horizontal width.
	 * Syncs active tab state with URL query parameter (?tab=commands|projects).
	 *
	 * Categories (ordered by importance):
	 * - Settings: Projects, Defaults, Autopilot, Shortcuts, Actions, Commit
	 * - Agent: Commands, Templates, Tools
	 * - Extensions: Docs, CLAUDE.md, MCP, Hooks
	 *
	 * @see ide/src/routes/config/+page.svelte for usage
	 */

	interface Tab {
		id: string;
		label: string;
		icon: string; // SVG path
		category: 'agent' | 'settings' | 'extensions';
	}

	interface TabGroup {
		id: string;
		label: string;
		tabs: Tab[];
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

	// Tab definitions with categories (ordered by importance within each category)
	const tabs: Tab[] = [
		// Settings category - environment and configuration (Projects first)
		{
			id: 'projects',
			label: 'Projects',
			category: 'settings',
			icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z'
		},
		{
			id: 'defaults',
			label: 'Defaults',
			category: 'settings',
			icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z'
		},
		{
			id: 'credentials',
			label: 'API Keys',
			category: 'settings',
			icon: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z'
		},
		{
			id: 'swarm',
			label: 'Autopilot',
			category: 'settings',
			icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z'
		},
		{
			id: 'shortcuts',
			label: 'Shortcuts',
			category: 'settings',
			icon: 'M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6zM6 7.5h.01M6 12h.01M6 16.5h.01M9.75 7.5h4.5M9.75 12h4.5M9.75 16.5h4.5M17.25 7.5h.01M17.25 12h.01M17.25 16.5h.01'
		},
		{
			id: 'actions',
			label: 'Actions',
			category: 'settings',
			icon: 'M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59'
		},
		{
			id: 'commit',
			label: 'Commit',
			category: 'settings',
			icon: 'M7.5 3.75a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-6a.75.75 0 00-.75-.75zm9 0a.75.75 0 00-.75.75v6c0 1.243-.601 2.342-1.528 3.028A4.5 4.5 0 0112 18a4.5 4.5 0 01-2.222-4.472A3.744 3.744 0 018.25 10.5v-6a.75.75 0 00-1.5 0v6a5.25 5.25 0 002.558 4.51A3 3 0 0012 19.5a3 3 0 002.692-4.49A5.25 5.25 0 0017.25 10.5v-6a.75.75 0 00-.75-.75z'
		},
		// Agent category - workflow tools
		{
			id: 'commands',
			label: 'Commands',
			category: 'agent',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'
		},
		{
			id: 'templates',
			label: 'Templates',
			category: 'agent',
			icon: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75'
		},
		{
			id: 'tools',
			label: 'Tools',
			category: 'agent',
			icon: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z'
		},
		// Extensions category - integrations and documentation (reversed: Docs first)
		{
			id: 'docs',
			label: 'Docs',
			category: 'extensions',
			icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
		},
		{
			id: 'claude',
			label: 'CLAUDE.md',
			category: 'extensions',
			icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
		},
		{
			id: 'mcp',
			label: 'MCP',
			category: 'extensions',
			icon: 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z'
		},
		{
			id: 'hooks',
			label: 'Hooks',
			category: 'extensions',
			icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
		}
	];

	// Group tabs by category - Settings first, then Agent | Extensions
	const tabGroups: TabGroup[] = [
		{
			id: 'settings',
			label: 'Settings',
			tabs: tabs.filter((t) => t.category === 'settings')
		},
		{
			id: 'agent',
			label: 'Agent',
			tabs: tabs.filter((t) => t.category === 'agent')
		},
		{
			id: 'extensions',
			label: 'Extensions',
			tabs: tabs.filter((t) => t.category === 'extensions')
		}
	];

	function handleTabClick(tabId: string) {
		if (tabId !== activeTab) {
			onTabChange(tabId);
		}
	}
</script>

<div class="config-tabs {className}" role="tablist" aria-label="Configuration sections">
	{#each tabGroups as group, groupIndex}
		<div class="tab-group">
			<span class="group-label">{group.label}</span>
			<div class="group-tabs">
				{#each group.tabs as tab}
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
		</div>
		{#if groupIndex < tabGroups.length - 1}
			<div class="group-separator"></div>
		{/if}
	{/each}
</div>

<style>
	.config-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 12px;
		width: fit-content;
		max-width: 100%;
	}

	.tab-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.group-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.45 0.02 250);
		padding: 0 0.5rem;
		font-family: ui-monospace, monospace;
	}

	.group-tabs {
		display: flex;
		gap: 0.125rem;
		padding: 0.125rem;
		background: oklch(0.15 0.01 250);
		border-radius: 8px;
	}

	.group-separator {
		width: 1px;
		background: oklch(0.22 0.02 250);
		margin: 0.75rem 0.25rem;
		align-self: stretch;
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

	/* Responsive: stack groups vertically on small screens */
	@media (max-width: 768px) {
		.config-tabs {
			flex-direction: column;
			align-items: stretch;
		}

		.group-separator {
			width: 100%;
			height: 1px;
			margin: 0.25rem 0;
		}

		.tab-group {
			width: 100%;
		}

		.group-tabs {
			flex-wrap: wrap;
		}
	}

	/* Extra small screens: hide labels */
	@media (max-width: 480px) {
		.tab-label {
			display: none;
		}

		.tab-btn {
			padding: 0.5rem;
		}
	}
</style>
