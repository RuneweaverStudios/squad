<script lang="ts">
	import type { ConditionConfig } from '$lib/types/workflow';

	let {
		config = { expression: '' },
		onUpdate = () => {}
	}: {
		config: ConditionConfig;
		onUpdate?: (config: ConditionConfig) => void;
	} = $props();

	function update(expression: string) {
		config = { expression };
		onUpdate(config);
	}

	const EXAMPLES = [
		{ label: 'Contains text', expr: "input.includes('error')" },
		{ label: 'Length check', expr: 'input.length > 100' },
		{ label: 'Starts with', expr: "input.startsWith('FAIL')" },
		{ label: 'Regex match', expr: '/\\berror\\b/i.test(input)' },
		{ label: 'JSON field', expr: 'JSON.parse(input).status === "ok"' }
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
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Examples</span>
		</label>
		<div class="flex flex-wrap gap-1.5">
			{#each EXAMPLES as example}
				<button
					class="btn btn-xs btn-ghost font-mono"
					style="background: oklch(0.20 0.01 250); color: oklch(0.70 0.02 250); border-color: oklch(0.28 0.02 250)"
					onclick={() => update(example.expr)}
					title={example.label}
				>
					{example.expr}
				</button>
			{/each}
		</div>
	</div>
</div>
