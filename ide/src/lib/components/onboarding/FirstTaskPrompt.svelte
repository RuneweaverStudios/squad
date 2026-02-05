<script lang="ts">
	import { openTaskDrawer } from '$lib/stores/drawerStore';

	let {
		project = null,
		disabled = false
	}: {
		project: string | null;
		disabled: boolean;
	} = $props();

	function handleCreateTask() {
		openTaskDrawer(project || undefined);
	}
</script>

<div class="space-y-3">
	<p class="text-sm" style="color: oklch(0.60 0.02 250);">
		Tasks let you coordinate agents, track progress, and manage dependencies across your codebase.
	</p>

	<button
		class="btn w-full font-mono"
		style="
			background: linear-gradient(135deg, oklch(0.35 0.12 240) 0%, oklch(0.30 0.10 240) 100%);
			border: 1px solid oklch(0.50 0.15 240 / 0.5);
			color: oklch(0.95 0.02 250);
		"
		onclick={handleCreateTask}
		{disabled}
	>
		<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
		</svg>
		Create Your First Task
	</button>

	<p class="text-[11px] font-mono text-center" style="color: oklch(0.45 0.02 250);">
		Or from terminal: <code class="px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">jt create "My first task" --type task</code>
	</p>
</div>
