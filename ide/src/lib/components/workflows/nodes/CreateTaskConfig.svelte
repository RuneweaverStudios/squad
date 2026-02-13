<script lang="ts">
	import type { ActionCreateTaskConfig } from '$lib/types/workflow';
	import { TASK_TYPES, PRIORITY_OPTIONS } from '$lib/config/workflowNodes';

	let {
		config = { title: '' },
		onUpdate = () => {}
	}: {
		config: ActionCreateTaskConfig;
		onUpdate?: (config: ActionCreateTaskConfig) => void;
	} = $props();

	let showHelp = $state(false);

	function update(patch: Partial<ActionCreateTaskConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Title</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.title}
			oninput={(e) => update({ title: e.currentTarget.value })}
			placeholder={`Task title (supports {{input}})`}
		/>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Description</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250); min-height: 80px"
			value={config.description || ''}
			oninput={(e) => update({ description: e.currentTarget.value || undefined })}
			placeholder={`Supports {{input}} and {{result}}`}
		></textarea>
		<div class="mt-1.5 flex items-center gap-1">
			<button
				type="button"
				class="text-xs px-0 bg-transparent border-none cursor-pointer flex items-center gap-1"
				style="color: oklch(0.60 0.10 220)"
				onclick={() => showHelp = !showHelp}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
					<path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clip-rule="evenodd" />
				</svg>
				{showHelp ? 'Hide' : 'Template variables'}
			</button>
		</div>

		{#if showHelp}
			<div class="mt-1.5 rounded-lg p-2.5 text-xs" style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
				<div class="mb-1.5" style="color: oklch(0.55 0.02 250)">Available in title and description:</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 220); font-size: 0.6875rem">{`{{input}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Output from the previous node</span>
					</div>
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 220); font-size: 0.6875rem">{`{{result}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Alias for input (same value)</span>
					</div>
				</div>
				<div class="mt-2 pt-1.5" style="border-top: 1px solid oklch(0.22 0.02 250)">
					<div style="color: oklch(0.55 0.02 250)">Example: Use an LLM node before this to generate a title and description from event data, then pass it through with <code style="color: oklch(0.80 0.12 220)">{`{{input}}`}</code>.</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div class="form-control">
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Type</span>
			</label>
			<select
				class="select select-sm select-bordered w-full"
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
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Priority</span>
			</label>
			<select
				class="select select-sm select-bordered w-full"
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
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Labels</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Comma-separated</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.labels || ''}
			oninput={(e) => update({ labels: e.currentTarget.value || undefined })}
			placeholder="review, automated"
		/>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Project</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.project || ''}
			oninput={(e) => update({ project: e.currentTarget.value || undefined })}
			placeholder="Target project"
		/>
	</div>
</div>
