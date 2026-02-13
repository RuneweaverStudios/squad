<script lang="ts">
	import type { ConditionConfig } from '$lib/types/workflow';

	let {
		config = { expression: '' },
		onUpdate = () => {}
	}: {
		config: ConditionConfig;
		onUpdate?: (config: ConditionConfig) => void;
	} = $props();

	let showHelp = $state(false);

	function update(expression: string) {
		config = { expression };
		onUpdate(config);
	}

	const EXAMPLES: { label: string; expr: string }[] = [
		{ label: 'Contains text', expr: "input.includes('error')" },
		{ label: 'Length check', expr: 'input.length > 100' },
		{ label: 'Starts with', expr: "input.startsWith('FAIL')" },
		{ label: 'Regex match', expr: '/\\berror\\b/i.test(input)' },
		{ label: 'JSON field', expr: 'JSON.parse(input).status === "ok"' },
		{ label: 'AND', expr: "input.includes('error') && input.length > 50" },
		{ label: 'OR', expr: "input.includes('FAIL') || input.includes('ERROR')" },
		{ label: 'NOT', expr: "!input.includes('skip') && !input.startsWith('#')" }
	];

	const INPUT_FIELDS: { name: string; type: string; desc: string }[] = [
		{ name: 'input', type: 'string', desc: 'Output from the previous node (text or JSON string)' },
		{ name: 'input.length', type: 'number', desc: 'Character count of the input' },
		{ name: 'input.includes(x)', type: 'boolean', desc: 'Check if input contains substring' },
		{ name: 'input.startsWith(x)', type: 'boolean', desc: 'Check if input starts with string' },
		{ name: 'JSON.parse(input)', type: 'object', desc: 'Parse input as JSON to access fields' }
	];
</script>

<div class="flex flex-col gap-4">
	<div class="p-3 rounded-lg" style="background: oklch(0.72 0.15 55 / 0.06); border: 1px solid oklch(0.72 0.15 55 / 0.15)">
		<div class="flex items-start gap-2">
			<svg class="w-4 h-4 mt-0.5 shrink-0" style="color: oklch(0.72 0.15 55)" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2L2 12l10 10 10-10L12 2zm0 3.41L19.59 12 12 19.59 4.41 12 12 5.41z"/>
			</svg>
			<div>
				<span class="text-sm font-medium" style="color: oklch(0.72 0.15 55)">Routes data to True or False</span>
				<p class="text-xs mt-1" style="color: oklch(0.60 0.02 250)">
					The expression receives <code class="px-1 py-0.5 rounded text-xs" style="background: oklch(0.20 0.02 250); color: oklch(0.72 0.15 55)">input</code> from the previous node. If it evaluates to truthy, data flows through the <strong style="color: oklch(0.72 0.17 145)">True</strong> port. Otherwise, through <strong style="color: oklch(0.65 0.15 20)">False</strong>.
				</p>
			</div>
		</div>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Expression</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm font-mono leading-relaxed w-full"
			style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.85 0.10 55); min-height: 80px"
			value={config.expression}
			oninput={(e) => update(e.currentTarget.value)}
			placeholder="input.includes('error')"
		></textarea>
		<div class="mt-1.5 flex items-center gap-1">
			<button
				type="button"
				class="text-xs px-0 bg-transparent border-none cursor-pointer flex items-center gap-1"
				style="color: oklch(0.60 0.10 55)"
				onclick={() => showHelp = !showHelp}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
					<path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clip-rule="evenodd" />
				</svg>
				{showHelp ? 'Hide' : 'Available methods & examples'}
			</button>
		</div>

		{#if showHelp}
			<div class="mt-1.5 rounded-lg p-2.5 text-xs" style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
				<div class="mb-1.5" style="color: oklch(0.55 0.02 250)">JavaScript expression. Available on <code style="color: oklch(0.72 0.15 55)">input</code>:</div>
				<div class="flex flex-col gap-1">
					{#each INPUT_FIELDS as field}
						<div class="flex items-baseline gap-2">
							<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 55); font-size: 0.6875rem">{field.name}</code>
							<span style="color: oklch(0.50 0.02 250)">{field.desc}</span>
						</div>
					{/each}
				</div>
				<div class="mt-2 pt-1.5 flex flex-col gap-1" style="border-top: 1px solid oklch(0.22 0.02 250)">
					<div style="color: oklch(0.55 0.02 250)">Examples:</div>
					{#each EXAMPLES as ex}
						<div class="flex items-baseline gap-2">
							<span class="shrink-0 w-[80px] text-right" style="color: oklch(0.50 0.02 250)">{ex.label}</span>
							<button
								class="font-mono px-1 rounded text-left bg-transparent border-none cursor-pointer"
								style="background: oklch(0.18 0.02 250); color: oklch(0.75 0.15 55); font-size: 0.6875rem"
								onclick={() => update(ex.expr)}
								title="Click to use"
							>{ex.expr}</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
