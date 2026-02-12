<script lang="ts">
	import type { TriggerManualConfig } from '$lib/types/workflow';

	let {
		config = {},
		onUpdate = () => {}
	}: {
		config: TriggerManualConfig;
		onUpdate?: (config: TriggerManualConfig) => void;
	} = $props();

	function handleDescriptionChange(value: string) {
		config = { ...config, description: value || undefined };
		onUpdate(config);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="p-4 rounded-lg" style="background: oklch(0.72 0.17 145 / 0.06); border: 1px solid oklch(0.72 0.17 145 / 0.15)">
		<div class="flex items-center gap-2 mb-2">
			<svg class="w-4 h-4" style="color: oklch(0.72 0.17 145)" viewBox="0 0 24 24" fill="currentColor">
				<path d="M8 5v14l11-7L8 5z"/>
			</svg>
			<span class="text-sm font-medium" style="color: oklch(0.72 0.17 145)">No configuration needed</span>
		</div>
		<p class="text-xs" style="color: oklch(0.60 0.02 250)">
			This trigger fires when you click the <strong>Run</strong> button in the workflow toolbar.
		</p>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Description</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.description || ''}
			oninput={(e) => handleDescriptionChange(e.currentTarget.value)}
			placeholder="What this trigger is used for"
		/>
	</div>
</div>
