<script lang="ts">
	/**
	 * ProjectSelector Component
	 * Reusable dropdown for filtering by project
	 */

	interface Props {
		projects: string[];
		selectedProject: string;
		onProjectChange: (project: string) => void;
		taskCounts?: Map<string, number> | null;
		compact?: boolean;
	}

	let {
		projects,
		selectedProject,
		onProjectChange,
		taskCounts = null,
		compact = false
	}: Props = $props();

	function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		console.log('🔵 [ProjectSelector] Dropdown changed');
		console.log('  → Selected value:', target.value);
		console.log('  → Previous value:', selectedProject);
		console.log('  → Calling onProjectChange...');
		onProjectChange(target.value);
		console.log('  ✓ onProjectChange called');
	}

	// Format project option with task count if available
	function formatProjectOption(project: string): string {
		if (project === 'All Projects') {
			return 'All Projects';
		}

		if (taskCounts && taskCounts.has(project)) {
			const count = taskCounts.get(project);
			return `${project} (${count})`;
		}

		return project;
	}
</script>

<select
	class="select select-bordered {compact ? 'select-sm' : 'select-md'} w-full"
	value={selectedProject}
	onchange={handleChange}
	aria-label="Select project"
>
	{#each projects as project}
		<option value={project}>
			{formatProjectOption(project)}
		</option>
	{/each}
</select>
