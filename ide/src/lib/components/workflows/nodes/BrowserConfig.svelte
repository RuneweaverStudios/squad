<script lang="ts">
	import type { ActionBrowserConfig } from '$lib/types/workflow';
	import { BROWSER_ACTIONS } from '$lib/config/workflowNodes';

	let {
		config = $bindable({ action: 'navigate' as const, url: '' }),
		onUpdate = () => {}
	}: {
		config: ActionBrowserConfig;
		onUpdate?: (config: ActionBrowserConfig) => void;
	} = $props();

	function update(patch: Partial<ActionBrowserConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}

	let showUrl = $derived(['navigate', 'screenshot', 'eval'].includes(config.action));
	let showSelector = $derived(['click', 'wait'].includes(config.action));
	let showJsCode = $derived(config.action === 'eval');
	let showTimeout = $derived(config.action === 'wait');
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Action</span>
		</label>
		<div class="flex flex-col gap-1.5">
			{#each BROWSER_ACTIONS as action}
				<label
					class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
					style="background: {config.action === action.value ? 'oklch(0.72 0.17 220 / 0.12)' : 'oklch(0.16 0.01 250)'}; border: 1px solid {config.action === action.value ? 'oklch(0.72 0.17 220 / 0.4)' : 'oklch(0.25 0.02 250)'}"
				>
					<input
						type="radio"
						class="radio radio-sm radio-info"
						name="browser-action"
						value={action.value}
						checked={config.action === action.value}
						onchange={() => update({ action: action.value as ActionBrowserConfig['action'] })}
					/>
					<div>
						<span class="text-sm font-medium" style="color: oklch(0.90 0.02 250)">{action.label}</span>
						<span class="text-xs ml-2" style="color: oklch(0.55 0.02 250)">{action.description}</span>
					</div>
				</label>
			{/each}
		</div>
	</div>

	{#if showUrl}
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">URL</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.url || ''}
				oninput={(e) => update({ url: e.currentTarget.value || undefined })}
				placeholder="https://example.com"
			/>
		</div>
	{/if}

	{#if showSelector}
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">CSS Selector</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered font-mono"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.selector || ''}
				oninput={(e) => update({ selector: e.currentTarget.value || undefined })}
				placeholder="button.submit, #login-form"
			/>
		</div>
	{/if}

	{#if showJsCode}
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">JavaScript Code</span>
			</label>
			<textarea
				class="textarea textarea-bordered text-sm font-mono leading-relaxed"
				style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.85 0.10 145); min-height: 80px"
				value={config.jsCode || ''}
				oninput={(e) => update({ jsCode: e.currentTarget.value || undefined })}
				placeholder="document.title"
			></textarea>
		</div>
	{/if}

	{#if showTimeout}
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Timeout (ms)</span>
			</label>
			<input
				type="number"
				class="input input-sm input-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.timeout || 5000}
				oninput={(e) => update({ timeout: parseInt(e.currentTarget.value) || 5000 })}
				min="100"
				max="60000"
			/>
		</div>
	{/if}
</div>
