<script lang="ts">
	import type { LlmPromptConfig } from '$lib/types/workflow';
	import { MODEL_OPTIONS } from '$lib/config/workflowNodes';

	let {
		config = { prompt: '', model: 'sonnet' as const },
		onUpdate = () => {}
	}: {
		config: LlmPromptConfig;
		onUpdate?: (config: LlmPromptConfig) => void;
	} = $props();

	function update(patch: Partial<LlmPromptConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}

	let variableEntries = $derived(
		config.variables ? Object.entries(config.variables) : []
	);

	function addVariable() {
		const vars = { ...(config.variables || {}), '': '' };
		update({ variables: vars });
	}

	function updateVariableKey(oldKey: string, newKey: string) {
		const vars = { ...(config.variables || {}) };
		const value = vars[oldKey];
		delete vars[oldKey];
		vars[newKey] = value;
		update({ variables: vars });
	}

	function updateVariableValue(key: string, value: string) {
		const vars = { ...(config.variables || {}), [key]: value };
		update({ variables: vars });
	}

	function removeVariable(key: string) {
		const vars = { ...(config.variables || {}) };
		delete vars[key];
		update({ variables: Object.keys(vars).length ? vars : undefined });
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Prompt</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm font-mono leading-relaxed w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250); min-height: 120px"
			value={config.prompt}
			oninput={(e) => update({ prompt: e.currentTarget.value })}
			placeholder={`Enter your prompt here...\n\nUse {{input}} to reference data from the previous node.`}
		></textarea>
		<label class="label w-full pt-1">
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">
				Use <code class="px-1 py-0.5 rounded text-xs" style="background: oklch(0.20 0.02 250); color: oklch(0.72 0.15 280)">{`{{input}}`}</code> for previous node output
			</span>
		</label>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Model</span>
		</label>
		<div class="flex gap-2">
			{#each MODEL_OPTIONS as model}
				<button
					class="btn btn-sm flex-1"
					class:btn-primary={config.model === model.value}
					class:btn-ghost={config.model !== model.value}
					style={config.model !== model.value ? 'background: oklch(0.20 0.01 250); color: oklch(0.75 0.02 250); border-color: oklch(0.28 0.02 250)' : ''}
					onclick={() => update({ model: model.value as LlmPromptConfig['model'] })}
				>
					<div class="flex flex-col items-center">
						<span class="text-xs font-semibold">{model.label}</span>
						<span class="text-[10px] opacity-60">{model.description}</span>
					</div>
				</button>
			{/each}
		</div>
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
			placeholder="Project context"
		/>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Max Tokens</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="number"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.maxTokens || ''}
			oninput={(e) => update({ maxTokens: e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined })}
			placeholder="4096"
			min="1"
			max="100000"
		/>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Variables</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<div class="flex flex-col gap-2">
			{#each variableEntries as [key, value], i}
				<div class="flex items-center gap-2">
					<input
						type="text"
						class="input input-sm input-bordered flex-1"
						style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
						{value}
						oninput={(e) => updateVariableKey(key, e.currentTarget.value)}
						placeholder="name"
					/>
					<span style="color: oklch(0.45 0.02 250)">=</span>
					<input
						type="text"
						class="input input-sm input-bordered flex-1"
						style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
						value={value}
						oninput={(e) => updateVariableValue(key, e.currentTarget.value)}
						placeholder="default value"
					/>
					<button
						class="btn btn-ghost btn-xs"
						style="color: oklch(0.55 0.10 20)"
						onclick={() => removeVariable(key)}
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12"/>
						</svg>
					</button>
				</div>
			{/each}
			<button
				class="btn btn-ghost btn-xs self-start"
				style="color: oklch(0.72 0.15 280)"
				onclick={addVariable}
			>
				+ Add Variable
			</button>
		</div>
	</div>
</div>
