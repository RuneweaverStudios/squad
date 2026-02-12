<script lang="ts">
	import type { WorkflowNode, NodeType, NodeConfig } from '$lib/types/workflow';
	import { getNodeMeta, type NodeTypeMeta } from '$lib/config/workflowNodes';
	import CronTriggerConfig from './nodes/CronTriggerConfig.svelte';
	import EventTriggerConfig from './nodes/EventTriggerConfig.svelte';
	import ManualTriggerConfig from './nodes/ManualTriggerConfig.svelte';
	import LlmPromptConfig from './nodes/LlmPromptConfig.svelte';
	import CreateTaskConfig from './nodes/CreateTaskConfig.svelte';
	import SendMessageConfig from './nodes/SendMessageConfig.svelte';
	import RunBashConfig from './nodes/RunBashConfig.svelte';
	import SpawnAgentConfig from './nodes/SpawnAgentConfig.svelte';
	import BrowserConfig from './nodes/BrowserConfig.svelte';
	import ConditionConfig from './nodes/ConditionConfig.svelte';
	import TransformConfig from './nodes/TransformConfig.svelte';

	let {
		node = $bindable(null),
		isOpen = $bindable(false),
		onUpdate = () => {},
		onDelete = () => {},
		onClose = () => {},
		onTest = () => {}
	}: {
		node: WorkflowNode | null;
		isOpen: boolean;
		onUpdate?: (node: WorkflowNode) => void;
		onDelete?: (nodeId: string) => void;
		onClose?: () => void;
		onTest?: (node: WorkflowNode) => void;
	} = $props();

	let meta = $derived(node ? getNodeMeta(node.type) : null);
	let cfg: any = $derived(node?.config);
	let editLabel = $state('');
	let isEditingLabel = $state(false);
	let testResult = $state<{ output?: string; error?: string; loading: boolean }>({ loading: false });

	// Sync label when node changes
	$effect(() => {
		if (node) {
			editLabel = node.label;
			isEditingLabel = false;
			testResult = { loading: false };
		}
	});

	function handleConfigUpdate(newConfig: NodeConfig) {
		if (!node) return;
		const updated = { ...node, config: newConfig };
		onUpdate(updated);
	}

	function handleLabelSave() {
		if (!node || !editLabel.trim()) return;
		const updated = { ...node, label: editLabel.trim() };
		onUpdate(updated);
		isEditingLabel = false;
	}

	function handleLabelKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleLabelSave();
		} else if (e.key === 'Escape') {
			editLabel = node?.label || '';
			isEditingLabel = false;
		}
	}

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function handleDelete() {
		if (!node) return;
		onDelete(node.id);
		handleClose();
	}

	async function handleTest() {
		if (!node) return;
		testResult = { loading: true };
		onTest(node);
	}
</script>

<!-- Panel overlay -->
{#if isOpen && node && meta}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50"
		onclick={handleClose}
		onkeydown={(e) => e.key === 'Escape' && handleClose()}
	>
		<!-- Panel -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute right-0 top-0 bottom-0 flex flex-col shadow-2xl"
			style="width: min(420px, 90vw); background: oklch(0.15 0.01 250); border-left: 1px solid oklch(0.22 0.02 250)"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div
				class="flex items-center gap-3 px-4 py-3 shrink-0"
				style="background: {meta.bgColor}; border-bottom: 1px solid oklch(0.22 0.02 250)"
			>
				<!-- Node type icon -->
				<div
					class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
					style="background: {meta.color}; color: oklch(0.15 0.01 250)"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
						<path d={meta.icon}/>
					</svg>
				</div>

				<!-- Label -->
				<div class="flex-1 min-w-0">
					{#if isEditingLabel}
						<input
							type="text"
							class="input input-sm input-ghost w-full px-1 font-semibold"
							style="background: oklch(0.18 0.01 250); color: oklch(0.95 0.02 250); border-color: {meta.color}"
							bind:value={editLabel}
							onblur={handleLabelSave}
							onkeydown={handleLabelKeydown}
						/>
					{:else}
						<button
							class="text-left w-full truncate"
							onclick={() => { isEditingLabel = true; }}
							title="Click to rename"
						>
							<span class="text-sm font-semibold" style="color: oklch(0.95 0.02 250)">{node.label}</span>
						</button>
					{/if}
					<div class="text-xs mt-0.5" style="color: oklch(0.55 0.02 250)">{meta.description}</div>
				</div>

				<!-- Close button -->
				<button
					class="btn btn-ghost btn-sm btn-circle shrink-0"
					style="color: oklch(0.55 0.02 250)"
					onclick={handleClose}
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12"/>
					</svg>
				</button>
			</div>

			<!-- Config content (scrollable) -->
			<div class="flex-1 overflow-y-auto p-4">
				<!-- Help text -->
				<div class="mb-4 p-3 rounded-lg" style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
					<p class="text-xs" style="color: oklch(0.60 0.02 250)">{meta.helpText}</p>
				</div>

				<!-- Node-type-specific config -->
				{#if node.type === 'trigger_cron'}
					<CronTriggerConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'trigger_event'}
					<EventTriggerConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'trigger_manual'}
					<ManualTriggerConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'llm_prompt'}
					<LlmPromptConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'action_create_task'}
					<CreateTaskConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'action_send_message'}
					<SendMessageConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'action_run_bash'}
					<RunBashConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'action_spawn_agent'}
					<SpawnAgentConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'action_browser'}
					<BrowserConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'condition'}
					<ConditionConfig config={cfg} onUpdate={handleConfigUpdate} />
				{:else if node.type === 'transform'}
					<TransformConfig config={cfg} onUpdate={handleConfigUpdate} />
				{/if}

				<!-- Node info -->
				<div class="mt-6 pt-4" style="border-top: 1px solid oklch(0.22 0.02 250)">
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-medium" style="color: oklch(0.50 0.02 250)">Node ID</span>
						<code class="text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.18 0.01 250); color: oklch(0.55 0.02 250)">{node.id}</code>
					</div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs font-medium" style="color: oklch(0.50 0.02 250)">Type</span>
						<span class="text-xs px-1.5 py-0.5 rounded" style="background: {meta.bgColor}; color: {meta.color}">{meta.label}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium" style="color: oklch(0.50 0.02 250)">Ports</span>
						<span class="text-xs" style="color: oklch(0.55 0.02 250)">
							{node.inputs.length} in / {node.outputs.length} out
						</span>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div
				class="flex items-center gap-2 px-4 py-3 shrink-0"
				style="background: oklch(0.13 0.01 250); border-top: 1px solid oklch(0.22 0.02 250)"
			>
				<button
					class="btn btn-sm"
					style="background: oklch(0.55 0.15 20 / 0.15); color: oklch(0.70 0.15 20); border-color: oklch(0.55 0.15 20 / 0.3)"
					onclick={handleDelete}
				>
					<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
					</svg>
					Delete
				</button>

				<div class="flex-1"></div>

				<button
					class="btn btn-sm"
					style="background: {meta.color}; color: oklch(0.15 0.01 250); border: none"
					onclick={handleTest}
					disabled={testResult.loading}
				>
					{#if testResult.loading}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M8 5v14l11-7L8 5z"/>
						</svg>
					{/if}
					Test
				</button>
			</div>
		</div>
	</div>
{/if}
