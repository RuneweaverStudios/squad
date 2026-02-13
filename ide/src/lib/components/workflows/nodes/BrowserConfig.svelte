<script lang="ts">
	import type { ActionBrowserConfig } from '$lib/types/workflow';
	import { BROWSER_ACTIONS } from '$lib/config/workflowNodes';

	let {
		config = { action: 'navigate' as const, url: '' },
		onUpdate = () => {}
	}: {
		config: ActionBrowserConfig;
		onUpdate?: (config: ActionBrowserConfig) => void;
	} = $props();

	let showHelp = $state(false);

	function update(patch: Partial<ActionBrowserConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}

	let showUrl = $derived(['navigate', 'screenshot', 'eval'].includes(config.action));
	let showSelector = $derived(['click', 'wait'].includes(config.action));
	let showJsCode = $derived(config.action === 'eval');
	let showTimeout = $derived(config.action === 'wait');

	const SELECTOR_EXAMPLES: { label: string; sel: string }[] = [
		{ label: 'Button by text', sel: 'button:has-text("Submit")' },
		{ label: 'Input by name', sel: 'input[name="email"]' },
		{ label: 'Link by href', sel: 'a[href="/dashboard"]' },
		{ label: 'Class selector', sel: '.btn-primary' },
		{ label: 'ID selector', sel: '#login-form' },
		{ label: 'Data attribute', sel: '[data-testid="submit-btn"]' }
	];

	const JS_EXAMPLES: { label: string; code: string }[] = [
		{ label: 'Page title', code: 'document.title' },
		{ label: 'Text content', code: 'document.querySelector("h1").textContent' },
		{ label: 'Form value', code: 'document.querySelector("#search").value' },
		{ label: 'Element count', code: 'document.querySelectorAll(".item").length.toString()' },
		{ label: 'JSON from page', code: 'JSON.stringify(Array.from(document.querySelectorAll("tr")).map(r => r.textContent))' },
		{ label: 'Check visible', code: 'document.querySelector(".modal")?.offsetParent !== null ? "visible" : "hidden"' }
	];
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label w-full pb-1">
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
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">URL</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered w-full"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.url || ''}
				oninput={(e) => update({ url: e.currentTarget.value || undefined })}
				placeholder="https://example.com"
			/>
		</div>
	{/if}

	{#if showSelector}
		<div class="form-control">
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">CSS Selector</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered font-mono w-full"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.selector || ''}
				oninput={(e) => update({ selector: e.currentTarget.value || undefined })}
				placeholder="button.submit, #login-form"
			/>
		</div>
	{/if}

	{#if showJsCode}
		<div class="form-control">
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">JavaScript Code</span>
			</label>
			<textarea
				class="textarea textarea-bordered text-sm font-mono leading-relaxed w-full"
				style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.85 0.10 145); min-height: 80px"
				value={config.jsCode || ''}
				oninput={(e) => update({ jsCode: e.currentTarget.value || undefined })}
				placeholder="document.title"
			></textarea>
		</div>
	{/if}

	{#if showSelector || showJsCode}
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
				{showHelp ? 'Hide' : 'Examples & variables'}
			</button>
		</div>

		{#if showHelp}
			<div class="mt-1.5 rounded-lg p-2.5 text-xs" style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
				<div class="mb-1.5" style="color: oklch(0.55 0.02 250)">Template variables:</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 220); font-size: 0.6875rem">{`{{input}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Full output from the previous node</span>
					</div>
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 220); font-size: 0.6875rem">{`{{input.field}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Access a field when input is JSON</span>
					</div>
				</div>

				{#if showSelector}
					<div class="mt-2 pt-1.5 flex flex-col gap-1" style="border-top: 1px solid oklch(0.22 0.02 250)">
						<div style="color: oklch(0.55 0.02 250)">Selector examples (click to use):</div>
						{#each SELECTOR_EXAMPLES as ex}
							<div class="flex items-baseline gap-2">
								<span class="shrink-0 w-[100px] text-right" style="color: oklch(0.50 0.02 250)">{ex.label}</span>
								<button
									class="font-mono px-1 rounded text-left bg-transparent border-none cursor-pointer"
									style="background: oklch(0.18 0.02 250); color: oklch(0.75 0.15 220); font-size: 0.6875rem"
									onclick={() => update({ selector: ex.sel })}
									title="Click to use"
								>{ex.sel}</button>
							</div>
						{/each}
					</div>
				{/if}

				{#if showJsCode}
					<div class="mt-2 pt-1.5 flex flex-col gap-1" style="border-top: 1px solid oklch(0.22 0.02 250)">
						<div style="color: oklch(0.55 0.02 250)">JS examples (click to use):</div>
						{#each JS_EXAMPLES as ex}
							<div class="flex items-baseline gap-2">
								<span class="shrink-0 w-[100px] text-right" style="color: oklch(0.50 0.02 250)">{ex.label}</span>
								<button
									class="font-mono px-1 rounded text-left bg-transparent border-none cursor-pointer truncate max-w-[200px]"
									style="background: oklch(0.18 0.02 250); color: oklch(0.75 0.15 145); font-size: 0.6875rem"
									onclick={() => update({ jsCode: ex.code })}
									title="Click to use"
								>{ex.code}</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}

	{#if showTimeout}
		<div class="form-control">
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Timeout (ms)</span>
			</label>
			<input
				type="number"
				class="input input-sm input-bordered w-full"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.timeout || 5000}
				oninput={(e) => update({ timeout: parseInt(e.currentTarget.value) || 5000 })}
				min="100"
				max="60000"
			/>
		</div>
	{/if}
</div>
