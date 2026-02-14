<script lang="ts">
	import CompletedTaskRow from "./CompletedTaskRow.svelte";
	import type { CompletedTask, DayGroup } from "$lib/utils/completedTaskHelpers";

	let {
		day,
		onTaskClick,
		onResumeSession,
		onMemoryClick,
		resumingTasks,
		memoryMap,
	}: {
		day: DayGroup;
		onTaskClick: (id: string) => void;
		onResumeSession?: (event: MouseEvent, task: CompletedTask) => void;
		onMemoryClick?: (event: MouseEvent, filename: string, task: CompletedTask) => void;
		resumingTasks?: Set<string>;
		memoryMap?: Map<string, string>;
	} = $props();
</script>

<div class="day-group">
	<div class="day-header">
		<span class="day-date">{day.displayDate}</span>
		<span class="day-count"
			>{day.tasks.length} task{day.tasks.length !== 1 ? "s" : ""}</span
		>
	</div>
	<div class="day-tasks">
		{#each day.tasks as task (task.id)}
			<CompletedTaskRow
				{task}
				{onTaskClick}
				{onResumeSession}
				{onMemoryClick}
				resuming={resumingTasks?.has(task.id) ?? false}
				memoryFilename={memoryMap?.get(task.id)}
			/>
		{/each}
	</div>
</div>

<style>
	.day-group {
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 10px;
		overflow: hidden;
	}

	.day-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--color-base-200);
		border-bottom: 1px solid var(--color-base-300);
	}

	.day-date {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-base-content);
		font-family: ui-monospace, monospace;
	}

	.day-count {
		font-size: 0.75rem;
		color: oklch(from var(--color-base-content) l c h / 60%);
		padding: 0.125rem 0.5rem;
		background: var(--color-base-300);
		border-radius: 10px;
	}

	.day-tasks {
		display: flex;
		flex-direction: column;
	}
</style>
