<script lang="ts">
	import type { TriggerCronConfig } from '$lib/types/workflow';
	import { CRON_PRESETS } from '$lib/config/workflowNodes';

	let {
		config = { cronExpr: '0 9 * * *' },
		onUpdate = () => {}
	}: {
		config: TriggerCronConfig;
		onUpdate?: (config: TriggerCronConfig) => void;
	} = $props();

	function handleCronChange(value: string) {
		config = { ...config, cronExpr: value };
		onUpdate(config);
	}

	function handleTimezoneChange(value: string) {
		config = { ...config, timezone: value || undefined };
		onUpdate(config);
	}

	function selectPreset(expr: string) {
		handleCronChange(expr);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Cron Expression</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered font-mono w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.cronExpr}
			oninput={(e) => handleCronChange(e.currentTarget.value)}
			placeholder="0 9 * * *"
		/>
		<label class="label w-full pt-1">
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">minute hour day-of-month month day-of-week</span>
		</label>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Presets</span>
		</label>
		<div class="flex flex-wrap gap-1.5">
			{#each CRON_PRESETS as preset}
				<button
					class="btn btn-xs"
					class:btn-primary={config.cronExpr === preset.expr}
					class:btn-ghost={config.cronExpr !== preset.expr}
					style={config.cronExpr !== preset.expr ? 'background: oklch(0.20 0.01 250); color: oklch(0.75 0.02 250); border-color: oklch(0.28 0.02 250)' : ''}
					onclick={() => selectPreset(preset.expr)}
				>
					{preset.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Timezone</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.timezone || ''}
			oninput={(e) => handleTimezoneChange(e.currentTarget.value)}
			placeholder="America/New_York"
		/>
	</div>
</div>
