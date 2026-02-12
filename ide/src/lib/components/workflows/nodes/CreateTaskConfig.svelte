<script lang="ts">
	import type { ActionCreateTaskConfig } from '$lib/types/workflow';
	import { TASK_TYPES, PRIORITY_OPTIONS } from '$lib/config/workflowNodes';

	let {
		config = $bindable({ title: '' }),
		onUpdate = () => {}
	}: {
		config: ActionCreateTaskConfig;
		onUpdate?: (config: ActionCreateTaskConfig) => void;
	} = $props();

	function update(patch: Partial<ActionCreateTaskConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Title</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.title}
			oninput={(e) => update({ title: e.currentTarget.value })}
			placeholder={`Task title (supports {{input}})`}
		/>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Description</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250); min-height: 80px"
			value={config.description || ''}
			oninput={(e) => update({ description: e.currentTarget.value || undefined })}
			placeholder={`Supports {{input}} and {{result}}`}
		></textarea>
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Type</span>
			</label>
			<select
				class="select select-sm select-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.type || 'task'}
				onchange={(e) => update({ type: e.currentTarget.value as ActionCreateTaskConfig['type'] })}
			>
				{#each TASK_TYPES as t}
					<option value={t.value}>{t.label}</option>
				{/each}
			</select>
		</div>

		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Priority</span>
			</label>
			<select
				class="select select-sm select-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.priority ?? 2}
				onchange={(e) => update({ priority: parseInt(e.currentTarget.value) })}
			>
				{#each PRIORITY_OPTIONS as p}
					<option value={p.value}>{p.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Labels</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Comma-separated</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.labels || ''}
			oninput={(e) => update({ labels: e.currentTarget.value || undefined })}
			placeholder="review, automated"
		/>
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
