<script lang="ts">
	import type { TriggerEventConfig } from '$lib/types/workflow';
	import { EVENT_TYPES } from '$lib/config/workflowNodes';

	let {
		config = { eventType: 'task_completed' as const },
		onUpdate = () => {}
	}: {
		config: TriggerEventConfig;
		onUpdate?: (config: TriggerEventConfig) => void;
	} = $props();

	let showHelp = $state(false);

	const EVENT_DATA_FIELDS: Record<string, { fields: { name: string; type: string; desc: string }[]; examples: { label: string; expr: string }[] }> = {
		task_completed: {
			fields: [
				{ name: 'data.taskId', type: 'string', desc: 'Task ID' },
				{ name: 'data.title', type: 'string', desc: 'Task title' },
				{ name: 'data.type', type: 'string', desc: 'bug, feature, task, chore, epic' },
				{ name: 'data.priority', type: 'number', desc: 'Priority (0-4)' },
				{ name: 'data.reason', type: 'string', desc: 'Close reason' },
				{ name: 'data.project', type: 'string', desc: 'Project name' },
				{ name: 'data.assignee', type: 'string', desc: 'Agent name' },
				{ name: 'data.labels', type: 'string', desc: 'Comma-separated labels' }
			],
			examples: [
				{ label: 'Only bugs', expr: 'data.type === "bug"' },
				{ label: 'AND', expr: 'data.type === "bug" && data.priority <= 1' },
				{ label: 'OR', expr: 'data.type === "bug" || data.type === "chore"' },
				{ label: 'NOT', expr: 'data.type !== "epic" && data.project !== "demo"' }
			]
		},
		task_created: {
			fields: [
				{ name: 'data.taskId', type: 'string', desc: 'Task ID' },
				{ name: 'data.title', type: 'string', desc: 'Task title' },
				{ name: 'data.type', type: 'string', desc: 'bug, feature, task, chore, epic' },
				{ name: 'data.priority', type: 'number', desc: 'Priority (0-4)' },
				{ name: 'data.labels', type: 'string', desc: 'Comma-separated labels' },
				{ name: 'data.project', type: 'string', desc: 'Project name' }
			],
			examples: [
				{ label: 'High-priority bugs', expr: 'data.type === "bug" && data.priority <= 1' },
				{ label: 'OR', expr: 'data.type === "bug" || data.type === "feature"' },
				{ label: 'NOT', expr: 'data.type !== "chore"' },
				{ label: 'By label', expr: 'data.labels.includes("urgent")' }
			]
		},
		agent_idle: {
			fields: [
				{ name: 'data.agentName', type: 'string', desc: 'Agent name' },
				{ name: 'data.project', type: 'string', desc: 'Project name' }
			],
			examples: [
				{ label: 'Specific agent', expr: 'data.agentName === "SwiftCanyon"' },
				{ label: 'By project', expr: 'data.project === "jat"' }
			]
		},
		signal_received: {
			fields: [
				{ name: 'data.type', type: 'string', desc: 'Signal type: starting, working, needs_input, review, complete' },
				{ name: 'data.taskId', type: 'string', desc: 'Task ID' },
				{ name: 'data.taskTitle', type: 'string', desc: 'Task title' },
				{ name: 'data.agentName', type: 'string', desc: 'Agent name' },
				{ name: 'data.project', type: 'string', desc: 'Project name' }
			],
			examples: [
				{ label: 'On complete', expr: 'data.type === "complete"' },
				{ label: 'Multiple signals', expr: 'data.type === "review" || data.type === "complete"' }
			]
		}
	};

	const currentFields = $derived(EVENT_DATA_FIELDS[config.eventType]);
	const currentPlaceholder = $derived(currentFields?.examples?.[0] ? `e.g., ${currentFields.examples[0].expr}` : '');

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
		<label class="label w-full pb-1">
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
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Filter Expression</span>
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Optional</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.filter || ''}
			oninput={(e) => handleFilterChange(e.currentTarget.value)}
			placeholder={currentPlaceholder}
		/>
		<div class="mt-1.5 flex items-center gap-1">
			<button
				type="button"
				class="text-xs px-0 bg-transparent border-none cursor-pointer flex items-center gap-1"
				style="color: oklch(0.60 0.10 250)"
				onclick={() => showHelp = !showHelp}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
					<path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clip-rule="evenodd" />
				</svg>
				{showHelp ? 'Hide' : 'Available fields'}
			</button>
		</div>

		{#if showHelp && currentFields}
			<div class="mt-1.5 rounded-lg p-2.5 text-xs" style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
				<div class="mb-1.5" style="color: oklch(0.55 0.02 250)">JavaScript expression. Available fields:</div>
				<div class="flex flex-col gap-1">
					{#each currentFields.fields as field}
						<div class="flex items-baseline gap-2">
							<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 200); font-size: 0.6875rem">{field.name}</code>
							<span style="color: oklch(0.50 0.02 250)">{field.desc}</span>
						</div>
					{/each}
				</div>
				<div class="mt-2 pt-1.5 flex flex-col gap-1" style="border-top: 1px solid oklch(0.22 0.02 250)">
					<div style="color: oklch(0.55 0.02 250)">Examples:</div>
					{#each currentFields.examples as ex}
						<div class="flex items-baseline gap-2">
							<span class="shrink-0 w-[70px] text-right" style="color: oklch(0.50 0.02 250)">{ex.label}</span>
							<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.75 0.15 145); font-size: 0.6875rem">{ex.expr}</code>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
