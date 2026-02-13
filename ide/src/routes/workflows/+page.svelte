<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		Workflow,
		WorkflowNode,
		WorkflowEdge,
		WorkflowSummary,
		WorkflowRun,
		NodeType,
		NodeExecutionResult
	} from '$lib/types/workflow';
	import { getDefaultPorts } from '$lib/types/workflow';
	import WorkflowCanvas from '$lib/components/workflows/WorkflowCanvas.svelte';
	import NodeConfigPanel from '$lib/components/workflows/NodeConfigPanel.svelte';
	import RunHistory from '$lib/components/workflows/RunHistory.svelte';
	import RunDetail from '$lib/components/workflows/RunDetail.svelte';
	import { getCategorizedNodes, getNodeMeta, type NodeTypeMeta } from '$lib/config/workflowNodes';

	// =========================================================================
	// STATE
	// =========================================================================

	// Workflow list
	let workflows = $state<WorkflowSummary[]>([]);
	let loadingList = $state(true);

	// Current workflow
	let currentId = $state<string | null>(null);
	let workflowName = $state('Untitled Workflow');
	let workflowDescription = $state('');
	let workflowEnabled = $state(false);
	let nodes = $state<WorkflowNode[]>([]);
	let edges = $state<WorkflowEdge[]>([]);
	let dirty = $state(false);
	let saving = $state(false);
	let running = $state(false);
	let loadingWorkflow = $state(false);

	// Selection & config
	let selectedNodeIds = $state(new Set<string>());
	let selectedEdgeIds = $state(new Set<string>());
	let configNode = $state<WorkflowNode | null>(null);
	let configPanelOpen = $state(false);

	// Execution log
	let lastRun = $state<WorkflowRun | null>(null);
	let logExpanded = $state(false);

	// Run history
	let bottomTab = $state<'log' | 'history'>('log');
	let selectedRun = $state<WorkflowRun | null>(null);
	let selectedRunId = $state<string | null>(null);
	let runHistoryRef: { refresh: () => Promise<void> } | undefined = $state();
	let nodeStatusOverlay = $state<Record<string, string> | null>(null);

	// Palette
	let paletteCollapsed = $state(false);
	let paletteSearch = $state('');

	// Undo/redo
	let undoStack = $state<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]>([]);
	let redoStack = $state<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]>([]);

	// Canvas ref
	let canvasRef: { fitView: (padding?: number) => void } | undefined = $state();

	// Confirm delete
	let showDeleteConfirm = $state(false);

	// Toast
	let toast = $state<{ message: string; type: 'success' | 'error' } | null>(null);

	// =========================================================================
	// COMPUTED
	// =========================================================================

	const categorizedNodes = getCategorizedNodes();

	const filteredCategories = $derived(
		paletteSearch.trim()
			? categorizedNodes
					.map((cat) => ({
						...cat,
						nodes: cat.nodes.filter(
							(n) =>
								n.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
								n.description.toLowerCase().includes(paletteSearch.toLowerCase())
						)
					}))
					.filter((cat) => cat.nodes.length > 0)
			: categorizedNodes
	);

	// =========================================================================
	// ID GENERATION
	// =========================================================================

	function generateId(prefix: string, length = 6): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let id = prefix + '-';
		for (let i = 0; i < length; i++) {
			id += chars[Math.floor(Math.random() * chars.length)];
		}
		return id;
	}

	// =========================================================================
	// TOAST
	// =========================================================================

	function showToast(message: string, type: 'success' | 'error' = 'success') {
		toast = { message, type };
		setTimeout(() => {
			toast = null;
		}, 3000);
	}

	// =========================================================================
	// UNDO / REDO
	// =========================================================================

	function deepCopy<T>(value: T): T {
		return JSON.parse(JSON.stringify(value));
	}

	function pushUndoState() {
		undoStack = [...undoStack, { nodes: deepCopy(nodes), edges: deepCopy(edges) }];
		if (undoStack.length > 50) undoStack = undoStack.slice(-50);
		redoStack = [];
	}

	function undo() {
		if (undoStack.length === 0) return;
		const state = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, { nodes: deepCopy(nodes), edges: deepCopy(edges) }];
		nodes = state.nodes;
		edges = state.edges;
		dirty = true;
	}

	function redo() {
		if (redoStack.length === 0) return;
		const state = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, { nodes: deepCopy(nodes), edges: deepCopy(edges) }];
		nodes = state.nodes;
		edges = state.edges;
		dirty = true;
	}

	// =========================================================================
	// API CALLS
	// =========================================================================

	async function loadWorkflows() {
		loadingList = true;
		try {
			const res = await fetch('/api/workflows');
			if (res.ok) {
				const data = await res.json();
				workflows = data.workflows || [];
			}
		} catch (err) {
			console.error('Failed to load workflows:', err);
		} finally {
			loadingList = false;
		}
	}

	async function loadWorkflow(id: string) {
		loadingWorkflow = true;
		try {
			const res = await fetch(`/api/workflows/${id}`);
			if (!res.ok) throw new Error('Not found');
			const data = await res.json();
			const wf = data.workflow as Workflow;
			currentId = wf.id;
			workflowName = wf.name;
			workflowDescription = wf.description || '';
			workflowEnabled = wf.enabled;
			nodes = wf.nodes;
			edges = wf.edges;
			dirty = false;
			undoStack = [];
			redoStack = [];
			clearRunSelection();
			bottomTab = 'log';

			// Load last run
			await loadLastRun(id);

			// Fit view after load
			setTimeout(() => canvasRef?.fitView(80), 100);
		} catch (err) {
			showToast('Failed to load workflow', 'error');
			console.error('Failed to load workflow:', err);
		} finally {
			loadingWorkflow = false;
		}
	}

	async function loadLastRun(id: string) {
		try {
			const res = await fetch(`/api/workflows/${id}/runs?limit=1`);
			if (res.ok) {
				const data = await res.json();
				lastRun = data.runs?.[0] || null;
			}
		} catch {
			// Non-critical
		}
	}

	let nameInputRef: HTMLInputElement | null = null;

	async function createWorkflow() {
		try {
			const res = await fetch('/api/workflows', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Untitled Workflow' })
			});
			if (!res.ok) throw new Error('Create failed');
			const data = await res.json();
			await loadWorkflows();
			await loadWorkflow(data.workflow.id);
			showToast('Workflow created');
			// Focus and select the name so user can rename immediately
			requestAnimationFrame(() => {
				nameInputRef?.focus();
				nameInputRef?.select();
			});
		} catch (err) {
			showToast('Failed to create workflow', 'error');
		}
	}

	async function saveWorkflow() {
		if (!currentId) return;
		saving = true;
		try {
			const res = await fetch(`/api/workflows/${currentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: workflowName,
					description: workflowDescription,
					nodes,
					edges,
					enabled: workflowEnabled
				})
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Save failed');
			}
			dirty = false;
			await loadWorkflows();
			showToast('Workflow saved');
		} catch (err) {
			showToast(`Save failed: ${(err as Error).message}`, 'error');
		} finally {
			saving = false;
		}
	}

	async function deleteWorkflow() {
		if (!currentId) return;
		try {
			const res = await fetch(`/api/workflows/${currentId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Delete failed');
			currentId = null;
			workflowName = 'Untitled Workflow';
			workflowDescription = '';
			workflowEnabled = false;
			nodes = [];
			edges = [];
			dirty = false;
			lastRun = null;
			showDeleteConfirm = false;
			await loadWorkflows();
			showToast('Workflow deleted');
		} catch (err) {
			showToast('Failed to delete workflow', 'error');
		}
	}

	async function runWorkflow() {
		if (!currentId) return;
		// Auto-save before running if dirty
		if (dirty) await saveWorkflow();
		running = true;
		logExpanded = true;
		try {
			const res = await fetch(`/api/workflows/${currentId}/run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trigger: 'manual' })
			});
			const data = await res.json();
			if (data.error) {
				showToast(`Run failed: ${data.error}`, 'error');
			} else {
				lastRun = data;
				showToast(data.status === 'success' ? 'Workflow completed' : `Run finished: ${data.status}`);
			}
		} catch (err) {
			showToast('Execution failed', 'error');
		} finally {
			running = false;
			// Refresh run history if open
			runHistoryRef?.refresh();
		}
	}

	async function toggleEnabled() {
		if (!currentId) return;
		try {
			const res = await fetch(`/api/workflows/${currentId}/toggle`, { method: 'POST' });
			if (res.ok) {
				const data = await res.json();
				workflowEnabled = data.workflow?.enabled ?? !workflowEnabled;
				await loadWorkflows();
			}
		} catch {
			showToast('Toggle failed', 'error');
		}
	}

	// =========================================================================
	// NODE OPERATIONS
	// =========================================================================

	function addNode(type: NodeType) {
		pushUndoState();
		const meta = getNodeMeta(type);
		const ports = getDefaultPorts(type);

		// Place nodes in a grid pattern, offset from existing
		const col = nodes.length % 3;
		const row = Math.floor(nodes.length / 3);
		const x = 100 + col * 280;
		const y = 100 + row * 180;

		const newNode: WorkflowNode = {
			id: generateId('node'),
			type,
			position: { x, y },
			config: { ...meta.defaultConfig } as WorkflowNode['config'],
			label: meta.label,
			inputs: ports.inputs,
			outputs: ports.outputs
		};

		nodes = [...nodes, newNode];
		dirty = true;
	}

	function handleNodeDoubleClick(nodeId: string) {
		const node = nodes.find((n) => n.id === nodeId);
		if (node) {
			configNode = node;
			configPanelOpen = true;
		}
	}

	function handleNodeUpdate(updated: WorkflowNode) {
		pushUndoState();
		nodes = nodes.map((n) => (n.id === updated.id ? updated : n));
		// Keep config panel in sync
		if (configNode?.id === updated.id) {
			configNode = updated;
		}
		dirty = true;
	}

	function handleNodeDelete(nodeId: string) {
		pushUndoState();
		nodes = nodes.filter((n) => n.id !== nodeId);
		edges = edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
		dirty = true;
	}

	function handleNodesChange(updatedNodes: WorkflowNode[]) {
		nodes = updatedNodes;
		dirty = true;
	}

	function handleEdgesChange(updatedEdges: WorkflowEdge[]) {
		edges = updatedEdges;
		dirty = true;
	}

	// =========================================================================
	// DRAG & DROP FROM PALETTE
	// =========================================================================

	function handlePaletteDragStart(e: DragEvent, meta: NodeTypeMeta) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData('application/workflow-node-type', meta.type);
		e.dataTransfer.effectAllowed = 'copy';
	}

	function handleCanvasDrop(e: DragEvent) {
		e.preventDefault();
		const nodeType = e.dataTransfer?.getData('application/workflow-node-type') as NodeType;
		if (!nodeType) return;
		addNode(nodeType);
	}

	function handleCanvasDragOver(e: DragEvent) {
		if (e.dataTransfer?.types.includes('application/workflow-node-type')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	// =========================================================================
	// KEYBOARD SHORTCUTS
	// =========================================================================

	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
			e.preventDefault();
			redo();
		} else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			saveWorkflow();
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedNodeIds.size > 0) {
				pushUndoState();
				const idsToDelete = new Set(selectedNodeIds);
				nodes = nodes.filter((n) => !idsToDelete.has(n.id));
				edges = edges.filter(
					(e) => !idsToDelete.has(e.sourceNodeId) && !idsToDelete.has(e.targetNodeId)
				);
				selectedNodeIds = new Set();
				dirty = true;
			}
			if (selectedEdgeIds.size > 0) {
				pushUndoState();
				edges = edges.filter((e) => !selectedEdgeIds.has(e.id));
				selectedEdgeIds = new Set();
				dirty = true;
			}
		}
	}

	// =========================================================================
	// EXECUTION LOG HELPERS
	// =========================================================================

	function getStatusColor(status: string): string {
		switch (status) {
			case 'success':
				return 'oklch(0.72 0.17 145)';
			case 'error':
			case 'failed':
				return 'oklch(0.65 0.20 25)';
			case 'running':
				return 'oklch(0.75 0.15 85)';
			case 'skipped':
				return 'oklch(0.50 0.02 250)';
			default:
				return 'oklch(0.55 0.02 250)';
		}
	}

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'success':
				return 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'error':
			case 'failed':
				return 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z';
			case 'running':
				return 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992';
			case 'skipped':
				return 'M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z';
			default:
				return 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z';
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function formatTimeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}

	// =========================================================================
	// RUN HISTORY
	// =========================================================================

	function handleRunSelect(run: WorkflowRun | null) {
		selectedRun = run;
		if (run) {
			// Build node status overlay map
			const overlay: Record<string, string> = {};
			for (const [nodeId, result] of Object.entries(run.nodeResults)) {
				overlay[nodeId] = (result as NodeExecutionResult).status;
			}
			nodeStatusOverlay = overlay;
		} else {
			nodeStatusOverlay = null;
		}
	}

	function clearRunSelection() {
		selectedRun = null;
		selectedRunId = null;
		nodeStatusOverlay = null;
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	onMount(() => {
		loadWorkflows();
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="flex flex-col h-full overflow-hidden" style="background: oklch(0.13 0.01 250)">
	<!-- ===== TOOLBAR ===== -->
	<div
		class="flex items-center gap-2 px-3 py-2 shrink-0"
		style="background: oklch(0.16 0.01 250); border-bottom: 1px solid oklch(0.22 0.02 250)"
	>
		<!-- Workflow selector -->
		<div class="relative">
			<select
				class="select select-sm select-bordered w-[160px]"
				style="background: oklch(0.18 0.01 250); color: oklch(0.85 0.02 250); border-color: oklch(0.25 0.02 250); font-size: 0.8125rem"
				value={currentId || ''}
				onchange={(e) => {
					const val = (e.target as HTMLSelectElement).value;
					if (val) loadWorkflow(val);
				}}
			>
				<option value="" disabled>{loadingList ? 'Loading...' : 'Select workflow'}</option>
				{#each workflows as wf}
					<option value={wf.id}>
						{wf.name}
						{wf.enabled ? '' : ' (disabled)'}
					</option>
				{/each}
			</select>
		</div>

		<!-- New workflow button -->
		<button
			class="btn btn-sm btn-ghost"
			style="color: oklch(0.65 0.15 145)"
			onclick={createWorkflow}
			title="New workflow"
		>
			<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
		</button>

		<!-- Separator -->
		<div class="w-px h-6 mx-1" style="background: oklch(0.25 0.02 250)"></div>

		<!-- Workflow name (editable heading) -->
		{#if currentId}
			<input
				bind:this={nameInputRef}
				type="text"
				class="flex-1 min-w-[120px] px-1 text-base font-semibold tracking-tight truncate outline-none"
				style="background: transparent; color: oklch(0.95 0.02 250); border: none; border-bottom: 1.5px solid transparent; transition: border-color 0.15s"
				onfocus={(e) => e.currentTarget.style.borderBottomColor = 'oklch(0.50 0.15 250 / 0.5)'}
				onblur={(e) => e.currentTarget.style.borderBottomColor = 'transparent'}
				bind:value={workflowName}
				oninput={() => (dirty = true)}
				placeholder="Workflow name"
			/>

			<!-- Enable/disable toggle -->
			<button
				class="btn btn-sm btn-ghost gap-1"
				style="color: {workflowEnabled ? 'oklch(0.72 0.17 145)' : 'oklch(0.45 0.02 250)'}"
				onclick={toggleEnabled}
				title={workflowEnabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}
			>
				<svg
					class="w-3.5 h-3.5"
					viewBox="0 0 24 24"
					fill={workflowEnabled ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width="2"
				>
					{#if workflowEnabled}
						<path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					{:else}
						<circle cx="12" cy="12" r="9" />
					{/if}
				</svg>
				<span class="text-xs">{workflowEnabled ? 'On' : 'Off'}</span>
			</button>

			<!-- Separator -->
			<div class="w-px h-6 mx-1" style="background: oklch(0.25 0.02 250)"></div>

			<!-- Undo/Redo -->
			<div class="flex gap-0.5">
				<button
					class="btn btn-sm btn-ghost btn-square"
					style="color: {undoStack.length > 0 ? 'oklch(0.65 0.02 250)' : 'oklch(0.35 0.02 250)'}"
					onclick={undo}
					disabled={undoStack.length === 0}
					title="Undo (Ctrl+Z)"
				>
					<svg
						class="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
					</svg>
				</button>
				<button
					class="btn btn-sm btn-ghost btn-square"
					style="color: {redoStack.length > 0 ? 'oklch(0.65 0.02 250)' : 'oklch(0.35 0.02 250)'}"
					onclick={redo}
					disabled={redoStack.length === 0}
					title="Redo (Ctrl+Y)"
				>
					<svg
						class="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
					</svg>
				</button>
			</div>

			<!-- Delete button -->
			<button
				class="btn btn-sm btn-ghost"
				style="color: oklch(0.55 0.10 20)"
				onclick={() => (showDeleteConfirm = true)}
				title="Delete workflow"
			>
				<svg
					class="w-4 h-4"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
				</svg>
			</button>

			<!-- Save button -->
			<button
				class="btn btn-sm gap-1.5"
				style="background: {dirty
					? 'oklch(0.55 0.15 145)'
					: 'oklch(0.25 0.02 250)'}; color: {dirty
					? 'oklch(0.15 0.01 250)'
					: 'oklch(0.50 0.02 250)'}; border: none"
				onclick={saveWorkflow}
				disabled={saving || !dirty}
			>
				{#if saving}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg
						class="w-3.5 h-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M17 21v-6H7v6M7 3v6h7M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
						/>
					</svg>
				{/if}
				Save
			</button>

			<!-- Run button -->
			<button
				class="btn btn-sm gap-1.5"
				style="background: oklch(0.55 0.15 200); color: oklch(0.15 0.01 250); border: none"
				onclick={runWorkflow}
				disabled={running || nodes.length === 0}
			>
				{#if running}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
						<path d="M8 5v14l11-7L8 5z" />
					</svg>
				{/if}
				Run
			</button>
		{:else}
			<div class="flex-1"></div>
			<span class="text-xs" style="color: oklch(0.45 0.02 250)">Select or create a workflow</span>
			<div class="flex-1"></div>
		{/if}
	</div>

	<!-- ===== MAIN CONTENT ===== -->
	<div class="flex flex-1 overflow-hidden">
		<!-- NODE PALETTE (left sidebar) -->
		<div
			class="shrink-0 flex flex-col overflow-hidden"
			style="width: {paletteCollapsed
				? '40px'
				: '220px'}; background: oklch(0.15 0.01 250); border-right: 1px solid oklch(0.22 0.02 250); transition: width 0.15s ease"
		>
			{#if paletteCollapsed}
				<!-- Collapsed: just toggle button -->
				<button
					class="btn btn-ghost btn-sm w-full h-10 rounded-none"
					style="color: oklch(0.55 0.02 250)"
					onclick={() => (paletteCollapsed = false)}
					title="Show node palette"
				>
					<svg
						class="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
					</svg>
				</button>
			{:else}
				<!-- Palette header -->
				<div
					class="flex items-center gap-2 px-3 py-2 shrink-0"
					style="border-bottom: 1px solid oklch(0.22 0.02 250)"
				>
					<span class="text-xs font-semibold flex-1" style="color: oklch(0.65 0.02 250)"
						>Nodes</span
					>
					<button
						class="btn btn-ghost btn-xs btn-square"
						style="color: oklch(0.45 0.02 250)"
						onclick={() => (paletteCollapsed = true)}
						title="Collapse palette"
					>
						<svg
							class="w-3.5 h-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M15.75 19.5L8.25 12l7.5-7.5" />
						</svg>
					</button>
				</div>

				<!-- Search -->
				<div class="px-2 py-1.5 shrink-0">
					<input
						type="text"
						class="input input-xs w-full"
						style="background: oklch(0.18 0.01 250); color: oklch(0.80 0.02 250); border-color: oklch(0.25 0.02 250); font-size: 0.75rem"
						placeholder="Search nodes..."
						bind:value={paletteSearch}
					/>
				</div>

				<!-- Node list -->
				<div class="flex-1 overflow-y-auto px-1 pb-2">
					{#each filteredCategories as { category, nodes: catNodes }}
						<div class="mt-2 first:mt-0">
							<!-- Category header -->
							<div class="flex items-center gap-1.5 px-2 py-1">
								<svg
									class="w-3 h-3"
									viewBox="0 0 24 24"
									fill="none"
									stroke={category.color}
									stroke-width="2"
								>
									<path d={category.icon} />
								</svg>
								<span
									class="text-[10px] font-bold uppercase tracking-wider"
									style="color: {category.color}">{category.label}</span
								>
							</div>

							<!-- Nodes -->
							{#each catNodes as nodeMeta}
								<button
									class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors"
									style="color: oklch(0.75 0.02 250)"
									draggable="true"
									ondragstart={(e) => handlePaletteDragStart(e, nodeMeta)}
									onclick={() => addNode(nodeMeta.type)}
									onmouseenter={(e) => {
										(e.currentTarget as HTMLElement).style.background =
											'oklch(0.20 0.02 250)';
									}}
									onmouseleave={(e) => {
										(e.currentTarget as HTMLElement).style.background = 'transparent';
									}}
								>
									<div
										class="w-6 h-6 rounded flex items-center justify-center shrink-0"
										style="background: {nodeMeta.bgColor}"
									>
										<svg
											class="w-3.5 h-3.5"
											viewBox="0 0 24 24"
											fill={nodeMeta.color}
										>
											<path d={nodeMeta.icon} />
										</svg>
									</div>
									<div class="min-w-0">
										<div class="text-xs font-medium truncate">{nodeMeta.label}</div>
										<div
											class="text-[10px] truncate"
											style="color: oklch(0.45 0.02 250)"
										>
											{nodeMeta.description}
										</div>
									</div>
								</button>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- CANVAS AREA -->
		<div
			class="flex-1 relative overflow-hidden"
			ondrop={handleCanvasDrop}
			ondragover={handleCanvasDragOver}
			role="application"
			aria-label="Workflow canvas"
		>
			{#if currentId}
				{#if loadingWorkflow}
					<div class="absolute inset-0 flex items-center justify-center">
						<span class="loading loading-spinner loading-lg" style="color: oklch(0.55 0.15 200)"
						></span>
					</div>
				{:else}
					<WorkflowCanvas
						bind:this={canvasRef}
						bind:nodes
						bind:edges
						bind:selectedNodeIds
						bind:selectedEdgeIds
						{nodeStatusOverlay}
						onNodesChange={handleNodesChange}
						onEdgesChange={handleEdgesChange}
						onNodeDoubleClick={handleNodeDoubleClick}
					/>
				{/if}
			{:else}
				<!-- Empty state -->
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="text-center max-w-sm">
						<div
							class="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
							style="background: oklch(0.20 0.02 250)"
						>
							<svg
								class="w-8 h-8"
								viewBox="0 0 24 24"
								fill="none"
								stroke="oklch(0.40 0.02 250)"
								stroke-width="1.5"
							>
								<path
									d="M3 3h6v6H3V3zm12 0h6v6h-6V3zm-6 12h6v6H9v-6zM6 9v3a3 3 0 003 3M18 9v3a3 3 0 01-3 3"
								/>
							</svg>
						</div>
						<h3 class="text-sm font-semibold mb-1" style="color: oklch(0.60 0.02 250)">
							No workflow selected
						</h3>
						<p class="text-xs mb-4" style="color: oklch(0.40 0.02 250)">
							Select an existing workflow from the dropdown or create a new one to get started.
						</p>
						<button
							class="btn btn-sm gap-1.5"
							style="background: oklch(0.55 0.15 145); color: oklch(0.15 0.01 250); border: none"
							onclick={createWorkflow}
						>
							<svg
								class="w-4 h-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							New Workflow
						</button>
					</div>
				</div>
			{/if}

			<!-- Config Panel (overlays on right) -->
			<NodeConfigPanel
				bind:node={configNode}
				bind:isOpen={configPanelOpen}
				onUpdate={handleNodeUpdate}
				onDelete={handleNodeDelete}
				onClose={() => (configPanelOpen = false)}
			/>
		</div>
	</div>

	<!-- ===== BOTTOM PANEL (execution log + run history) ===== -->
	{#if currentId}
		<div
			class="shrink-0 flex flex-col"
			style="background: oklch(0.14 0.01 250); border-top: 1px solid oklch(0.22 0.02 250); max-height: {logExpanded ? '320px' : 'auto'}"
		>
			<!-- Panel header with tabs -->
			<div class="flex items-center shrink-0">
				<!-- Expand/collapse + tabs -->
				<button
					class="flex items-center gap-2 px-3 py-1.5"
					onclick={() => (logExpanded = !logExpanded)}
				>
					<svg
						class="w-3.5 h-3.5 transition-transform"
						style="color: oklch(0.50 0.02 250); transform: rotate({logExpanded ? '90deg' : '0deg'})"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
					</svg>
				</button>

				<!-- Tab buttons -->
				<button
					class="px-2 py-1.5 text-xs font-medium transition-colors"
					style="color: {bottomTab === 'log' ? 'oklch(0.80 0.02 250)' : 'oklch(0.50 0.02 250)'}; border-bottom: 2px solid {bottomTab === 'log' ? 'oklch(0.60 0.15 200)' : 'transparent'}"
					onclick={() => { bottomTab = 'log'; logExpanded = true; }}
				>
					Last Run
				</button>
				<button
					class="px-2 py-1.5 text-xs font-medium transition-colors"
					style="color: {bottomTab === 'history' ? 'oklch(0.80 0.02 250)' : 'oklch(0.50 0.02 250)'}; border-bottom: 2px solid {bottomTab === 'history' ? 'oklch(0.60 0.15 200)' : 'transparent'}"
					onclick={() => { bottomTab = 'history'; logExpanded = true; }}
				>
					History
				</button>

				<!-- Status summary on header -->
				<div class="flex items-center gap-2 ml-2">
					{#if lastRun && bottomTab === 'log'}
						<span
							class="text-[10px] px-1.5 py-0.5 rounded"
							style="background: {getStatusColor(lastRun.status)}20; color: {getStatusColor(lastRun.status)}"
						>
							{lastRun.status}
						</span>
						{#if lastRun.durationMs}
							<span class="text-[10px]" style="color: oklch(0.45 0.02 250)">
								{formatDuration(lastRun.durationMs)}
							</span>
						{/if}
						<span class="text-[10px]" style="color: oklch(0.40 0.02 250)">
							{formatTimeAgo(lastRun.startedAt)}
						</span>
					{:else if bottomTab === 'history' && selectedRun}
						<span
							class="text-[10px] px-1.5 py-0.5 rounded"
							style="background: {getStatusColor(selectedRun.status)}20; color: {getStatusColor(selectedRun.status)}"
						>
							viewing: {selectedRun.status}
						</span>
						<button
							class="text-[10px] underline"
							style="color: oklch(0.50 0.02 250)"
							onclick={clearRunSelection}
						>
							clear
						</button>
					{:else if !running && bottomTab === 'log'}
						<span class="text-[10px]" style="color: oklch(0.40 0.02 250)">No runs yet</span>
					{/if}

					{#if running}
						<span class="loading loading-spinner loading-xs" style="color: oklch(0.75 0.15 85)"></span>
						<span class="text-[10px]" style="color: oklch(0.75 0.15 85)">Running...</span>
					{/if}
				</div>
			</div>

			<!-- Panel content (expanded) -->
			{#if logExpanded}
				<div style="border-top: 1px solid oklch(0.20 0.02 250); height: 280px; overflow: hidden">
					{#if bottomTab === 'log'}
						<!-- LAST RUN TAB -->
						{#if lastRun}
							<RunDetail run={lastRun} {nodes} />
						{:else}
							<div class="flex items-center justify-center h-full">
								<p class="text-xs" style="color: oklch(0.40 0.02 250)">No runs yet. Click Run to execute the workflow.</p>
							</div>
						{/if}
					{:else}
						<!-- HISTORY TAB -->
						<div class="flex h-full">
							<!-- Run list (left) -->
							<div class="shrink-0 overflow-hidden" style="width: 260px; border-right: 1px solid oklch(0.20 0.02 250)">
								<RunHistory
									bind:this={runHistoryRef}
									workflowId={currentId}
									bind:selectedRunId
									onRunSelect={handleRunSelect}
								/>
							</div>

							<!-- Run detail (right) -->
							<div class="flex-1 overflow-hidden">
								{#if selectedRun}
									<RunDetail run={selectedRun} {nodes} />
								{:else}
									<div class="flex items-center justify-center h-full">
										<p class="text-xs" style="color: oklch(0.40 0.02 250)">Select a run to view details</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- ===== DELETE CONFIRMATION MODAL ===== -->
{#if showDeleteConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0 0 0 / 0.5)"
		onclick={() => (showDeleteConfirm = false)}
		onkeydown={(e) => e.key === 'Escape' && (showDeleteConfirm = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="rounded-xl p-5 max-w-sm w-full mx-4"
			style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.25 0.02 250)"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3 class="text-sm font-semibold mb-2" style="color: oklch(0.85 0.02 250)">
				Delete Workflow?
			</h3>
			<p class="text-xs mb-4" style="color: oklch(0.55 0.02 250)">
				This will permanently delete "{workflowName}" and all its run history. This action cannot be
				undone.
			</p>
			<div class="flex gap-2 justify-end">
				<button
					class="btn btn-sm btn-ghost"
					style="color: oklch(0.55 0.02 250)"
					onclick={() => (showDeleteConfirm = false)}
				>
					Cancel
				</button>
				<button
					class="btn btn-sm"
					style="background: oklch(0.50 0.15 20); color: white; border: none"
					onclick={deleteWorkflow}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ===== TOAST ===== -->
{#if toast}
	<div
		class="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg"
		style="background: {toast.type === 'success'
			? 'oklch(0.25 0.06 145)'
			: 'oklch(0.25 0.06 20)'}; border: 1px solid {toast.type === 'success'
			? 'oklch(0.40 0.10 145)'
			: 'oklch(0.40 0.10 20)'}; color: {toast.type === 'success'
			? 'oklch(0.80 0.15 145)'
			: 'oklch(0.80 0.15 20)'}"
	>
		<svg
			class="w-4 h-4 shrink-0"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			{#if toast.type === 'success'}
				<path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			{:else}
				<path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			{/if}
		</svg>
		<span class="text-xs font-medium">{toast.message}</span>
	</div>
{/if}
