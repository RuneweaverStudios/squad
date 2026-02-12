<script lang="ts">
	import type { ActionSpawnAgentConfig } from '$lib/types/workflow';
	import { MODEL_OPTIONS } from '$lib/config/workflowNodes';

	let {
		config = $bindable({ taskTitle: '', model: 'sonnet' as const }),
		onUpdate = () => {}
	}: {
		config: ActionSpawnAgentConfig;
		onUpdate?: (config: ActionSpawnAgentConfig) => void;
	} = $props();

	function update(patch: Partial<ActionSpawnAgentConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}

	let mode = $derived(config.taskId ? 'existing' : 'new');
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Task Source</span>
		</label>
		<div class="flex gap-2">
			<button
				class="btn btn-sm flex-1"
				class:btn-primary={mode === 'new'}
				class:btn-ghost={mode !== 'new'}
				style={mode !== 'new' ? 'background: oklch(0.20 0.01 250); color: oklch(0.75 0.02 250); border-color: oklch(0.28 0.02 250)' : ''}
				onclick={() => update({ taskId: undefined, taskTitle: config.taskTitle || '' })}
			>
				Create New Task
			</button>
			<button
				class="btn btn-sm flex-1"
				class:btn-primary={mode === 'existing'}
				class:btn-ghost={mode !== 'existing'}
				style={mode !== 'existing' ? 'background: oklch(0.20 0.01 250); color: oklch(0.75 0.02 250); border-color: oklch(0.28 0.02 250)' : ''}
				onclick={() => update({ taskTitle: undefined, taskDescription: undefined, taskId: config.taskId || '' })}
			>
				Existing Task
			</button>
		</div>
	</div>

	{#if mode === 'new'}
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Task Title</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.taskTitle || ''}
				oninput={(e) => update({ taskTitle: e.currentTarget.value })}
				placeholder="Title for the new task"
			/>
		</div>

		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Task Description</span>
				<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
			</label>
			<textarea
				class="textarea textarea-bordered text-sm"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250); min-height: 80px"
				value={config.taskDescription || ''}
				oninput={(e) => update({ taskDescription: e.currentTarget.value || undefined })}
				placeholder="Detailed task description"
			></textarea>
		</div>
	{:else}
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Task ID</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered font-mono"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.taskId || ''}
				oninput={(e) => update({ taskId: e.currentTarget.value })}
				placeholder="jat-abc"
			/>
		</div>
	{/if}

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Model</span>
		</label>
		<div class="flex gap-2">
			{#each MODEL_OPTIONS as model}
				<button
					class="btn btn-sm flex-1"
					class:btn-primary={config.model === model.value}
					class:btn-ghost={config.model !== model.value}
					style={config.model !== model.value ? 'background: oklch(0.20 0.01 250); color: oklch(0.75 0.02 250); border-color: oklch(0.28 0.02 250)' : ''}
					onclick={() => update({ model: model.value as ActionSpawnAgentConfig['model'] })}
				>
					{model.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Project</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.project || ''}
			oninput={(e) => update({ project: e.currentTarget.value || undefined })}
			placeholder="Target project"
		/>
	</div>
</div>
