<script lang="ts">
	import type { TriggerEventConfig } from '$lib/types/workflow';
	import { EVENT_TYPES } from '$lib/config/workflowNodes';

	let {
		config = $bindable({ eventType: 'task_completed' as const }),
		onUpdate = () => {}
	}: {
		config: TriggerEventConfig;
		onUpdate?: (config: TriggerEventConfig) => void;
	} = $props();

	function handleEventTypeChange(value: string) {
		config = { ...config, eventType: value as TriggerEventConfig['eventType'] };
		onUpdate(config);
	}

	function handleFilterChange(value: string) {
		config = { ...config, filter: value || undefined };
		onUpdate(config);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Event Type</span>
		</label>
		<div class="flex flex-col gap-2">
			{#each EVENT_TYPES as event}
				<label
					class="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors"
					style="background: {config.eventType === event.value ? 'oklch(0.72 0.17 145 / 0.12)' : 'oklch(0.16 0.01 250)'}; border: 1px solid {config.eventType === event.value ? 'oklch(0.72 0.17 145 / 0.4)' : 'oklch(0.25 0.02 250)'}"
				>
					<input
						type="radio"
						class="radio radio-sm radio-success mt-0.5"
						name="event-type"
						value={event.value}
						checked={config.eventType === event.value}
						onchange={() => handleEventTypeChange(event.value)}
					/>
					<div>
						<div class="text-sm font-medium" style="color: oklch(0.90 0.02 250)">{event.label}</div>
						<div class="text-xs mt-0.5" style="color: oklch(0.55 0.02 250)">{event.description}</div>
					</div>
				</label>
			{/each}
		</div>
	</div>

	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Filter Expression</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.filter || ''}
			oninput={(e) => handleFilterChange(e.currentTarget.value)}
			placeholder={`e.g., project=jat or label=urgent`}
		/>
	</div>
</div>
