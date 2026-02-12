<script lang="ts">
	import type { TransformConfig } from '$lib/types/workflow';

	let {
		config = $bindable({ functionBody: 'return input' }),
		onUpdate = () => {}
	}: {
		config: TransformConfig;
		onUpdate?: (config: TransformConfig) => void;
	} = $props();

	function update(functionBody: string) {
		config = { functionBody };
		onUpdate(config);
	}

	const EXAMPLES = [
		{ label: 'Pass through', body: 'return input' },
		{ label: 'Filter lines', body: "return input.split('\\n').filter(l => l.includes('error')).join('\\n')" },
		{ label: 'Extract JSON', body: 'return JSON.parse(input)' },
		{ label: 'Count lines', body: "return input.split('\\n').length.toString()" },
		{ label: 'Uppercase', body: 'return input.toUpperCase()' },
		{ label: 'First N chars', body: 'return input.slice(0, 200)' }
	];
</script>

<div class="flex flex-col gap-4">
	<div class="p-3 rounded-lg" style="background: oklch(0.72 0.15 55 / 0.06); border: 1px solid oklch(0.72 0.15 55 / 0.15)">
		<div class="flex items-start gap-2">
			<svg class="w-4 h-4 mt-0.5 shrink-0" style="color: oklch(0.72 0.15 55)" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
			</svg>
			<div>
				<span class="text-sm font-medium" style="color: oklch(0.72 0.15 55)">Transform data between nodes</span>
				<p class="text-xs mt-1" style="color: oklch(0.60 0.02 250)">
					Write a JavaScript function body that receives <code class="px-1 py-0.5 rounded text-xs" style="background: oklch(0.20 0.02 250); color: oklch(0.72 0.15 55)">input</code> and must <code class="px-1 py-0.5 rounded text-xs" style="background: oklch(0.20 0.02 250); color: oklch(0.72 0.15 55)">return</code> the transformed value.
				</p>
			</div>
		</div>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Function Body</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm font-mono leading-relaxed"
			style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.85 0.10 55); min-height: 120px"
			value={config.functionBody}
			oninput={(e) => update(e.currentTarget.value)}
			placeholder="return input"
		></textarea>
		<label class="label pt-1">
			<span class="label-text-alt font-mono" style="color: oklch(0.45 0.02 250)">function(input) {'{'} <span style="color: oklch(0.65 0.02 250)">/* your code */</span> {'}'}</span>
		</label>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Templates</span>
		</label>
		<div class="flex flex-col gap-1.5">
			{#each EXAMPLES as example}
				<button
					class="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
					style="background: oklch(0.16 0.01 250); border: 1px solid oklch(0.25 0.02 250)"
					onclick={() => update(example.body)}
				>
					<span class="text-xs font-medium shrink-0" style="color: oklch(0.75 0.02 250)">{example.label}</span>
					<code class="text-xs truncate" style="color: oklch(0.55 0.02 250)">{example.body}</code>
				</button>
			{/each}
		</div>
	</div>
</div>
