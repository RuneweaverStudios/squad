<script lang="ts">
	/**
	 * ProjectSelector Component
	 * Branded project dropdown for filtering by project.
	 * Matches the aesthetic from tasks/ProjectSelector.svelte:
	 * monospace uppercase, colored dots, color-mix oklch tinting.
	 *
	 * Supports showing project colors - pass projectColors prop for immediate colors,
	 * or uses getProjectColor utility as fallback (async, may have delay)
	 */
	import { getProjectColor } from "$lib/utils/projectColors";

	interface Props {
		projects: string[];
		selectedProject: string;
		onProjectChange: (project: string) => void;
		taskCounts?: Map<string, number> | null;
		compact?: boolean;
		showColors?: boolean;
		/** Optional map of project name → color. If provided, used instead of getProjectColor() */
		projectColors?: Map<string, string> | null;
	}

	let {
		projects,
		selectedProject,
		onProjectChange,
		taskCounts = null,
		compact = false,
		showColors = false,
		projectColors = null,
	}: Props = $props();

	let open = $state(false);
	let containerEl = $state<HTMLDivElement | null>(null);

	// Get color for a project - prefer passed projectColors, fall back to utility
	function getColor(project: string): string {
		if (projectColors && projectColors.has(project)) {
			return projectColors.get(project)!;
		}
		return getProjectColor(project);
	}

	let selectedColor = $derived(
		selectedProject ? getColor(selectedProject) : '#6b7280'
	);

	function handleSelect(project: string) {
		onProjectChange(project);
		open = false;
	}

	// Format project option with task count if available
	function formatProjectOption(project: string): string {
		if (taskCounts && taskCounts.has(project)) {
			const count = taskCounts.get(project);
			return `${project} (${count})`;
		}

		return project;
	}

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside, true);
			document.addEventListener('keydown', handleKeydown);
		}
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div class="selector-container" class:w-full={!compact} bind:this={containerEl}>
	<button
		type="button"
		class="trigger-chip"
		class:compact
		style="--project-color: {selectedColor};"
		onclick={() => open = !open}
	>
		<span class="chip-dot"></span>
		<span class="chip-label">{formatProjectOption(selectedProject)}</span>
		<svg class="chevron" class:open viewBox="0 0 16 16" fill="currentColor">
			<path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
		</svg>
	</button>

	{#if open}
		<div class="dropdown-menu">
			{#each projects as project}
				{@const projColor = getColor(project)}
				<button
					type="button"
					class="dropdown-item"
					class:active={selectedProject === project}
					style="--project-color: {projColor};"
					onclick={() => handleSelect(project)}
				>
					{#if project !== "All Projects"}
						<span class="item-dot"></span>
					{/if}
					<span class="item-label">{formatProjectOption(project)}</span>
					{#if selectedProject === project}
						<svg class="check-icon" viewBox="0 0 16 16" fill="currentColor">
							<path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.selector-container {
		position: relative;
		display: inline-block;
	}

	.trigger-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.375rem;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		cursor: pointer;
		transition: all 0.15s ease;
		background: color-mix(in oklch, var(--project-color) 25%, transparent);
		border: 1px solid color-mix(in oklch, var(--project-color) 50%, transparent);
		color: var(--project-color);
		box-shadow: 0 0 6px color-mix(in oklch, var(--project-color) 15%, transparent);
		width: 100%;
		justify-content: space-between;
	}

	.trigger-chip.compact {
		padding: 0.2rem 0.4rem;
		font-size: 0.6875rem;
	}

	.trigger-chip:hover {
		background: color-mix(in oklch, var(--project-color) 35%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 65%, transparent);
		box-shadow: 0 0 10px color-mix(in oklch, var(--project-color) 25%, transparent);
	}

	.trigger-chip.neutral {
		background: oklch(0.22 0.02 250);
		border-color: oklch(0.32 0.02 250);
		color: oklch(0.70 0.02 250);
		box-shadow: none;
	}

	.trigger-chip.neutral:hover {
		background: oklch(0.26 0.02 250);
		border-color: oklch(0.38 0.02 250);
		color: oklch(0.80 0.02 250);
		box-shadow: none;
	}

	.chip-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--project-color);
		flex-shrink: 0;
	}

	.chip-label {
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		width: 0.875rem;
		height: 0.875rem;
		opacity: 0.7;
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 100%;
		padding: 0.25rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.28 0.02 250 / 0.5);
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.4);
		z-index: 60;
		animation: dropdown-in 0.12s ease-out;
		max-height: 20rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: oklch(0.35 0.02 250) transparent;
	}

	@keyframes dropdown-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border-radius: 0.375rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		color: oklch(0.75 0.02 250);
		transition: background 0.1s ease;
	}

	.dropdown-item:hover {
		background: color-mix(in oklch, var(--project-color) 15%, transparent);
		color: var(--project-color);
	}

	.dropdown-item.active {
		color: var(--project-color);
	}

	.item-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--project-color);
		flex-shrink: 0;
		opacity: 0.8;
	}

	.dropdown-item.active .item-dot {
		opacity: 1;
		box-shadow: 0 0 5px color-mix(in oklch, var(--project-color) 50%, transparent);
	}

	.item-label {
		flex: 1;
		text-align: left;
	}

	.check-icon {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
		color: var(--project-color);
	}
</style>
