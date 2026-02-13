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

	let showHelp = $state(false);

	let variableEntries = $derived(
		config.variables ? Object.entries(config.variables) : []
	);

	const PROMPT_TEMPLATES: { label: string; prompt: string }[] = [
		{ label: 'Summarize', prompt: 'Summarize the following in 2-3 bullet points:\n\n{{input}}' },
		{ label: 'Categorize', prompt: 'Categorize this into one of: bug, feature, chore, improvement.\nRespond with just the category.\n\n{{input}}' },
		{ label: 'Extract action items', prompt: 'Extract all action items from the following text. Return as a numbered list:\n\n{{input}}' },
		{ label: 'Code review', prompt: 'Review this code change and list any issues, suggestions, or potential bugs:\n\n{{input}}' },
		{ label: 'Generate description', prompt: 'Write a clear, concise task description for:\n\nTitle: {{input}}\n\nInclude acceptance criteria.' }
	];

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
		<div class="mt-1.5 flex items-center gap-1">
			<button
				type="button"
				class="text-xs px-0 bg-transparent border-none cursor-pointer flex items-center gap-1"
				style="color: oklch(0.60 0.10 280)"
				onclick={() => showHelp = !showHelp}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
					<path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clip-rule="evenodd" />
				</svg>
				{showHelp ? 'Hide' : 'Template variables & examples'}
			</button>
		</div>

		{#if showHelp}
			<div class="mt-1.5 rounded-lg p-2.5 text-xs" style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
				<div class="mb-1.5" style="color: oklch(0.55 0.02 250)">Available template variables:</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 280); font-size: 0.6875rem">{`{{input}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Full output from the previous node</span>
					</div>
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 280); font-size: 0.6875rem">{`{{input.field}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Access a field when input is JSON</span>
					</div>
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 280); font-size: 0.6875rem">{`{{result}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Alias for input (same value)</span>
					</div>
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 280); font-size: 0.6875rem">{`{{varName}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Custom variables (define below)</span>
					</div>
				</div>
				<div class="mt-2 pt-1.5 flex flex-col gap-1" style="border-top: 1px solid oklch(0.22 0.02 250)">
					<div style="color: oklch(0.55 0.02 250)">Prompt templates (click to use):</div>
					{#each PROMPT_TEMPLATES as tpl}
						<button
							class="flex items-baseline gap-2 text-left bg-transparent border-none cursor-pointer px-0"
							onclick={() => update({ prompt: tpl.prompt })}
							title="Click to use this template"
						>
							<span class="shrink-0 w-[110px] text-right" style="color: oklch(0.50 0.02 250)">{tpl.label}</span>
							<code class="font-mono px-1 rounded truncate" style="background: oklch(0.18 0.02 250); color: oklch(0.75 0.15 280); font-size: 0.6875rem">{tpl.prompt.split('\n')[0]}</code>
						</button>
					{/each}
				</div>
			</div>
		{/if}
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
