<script lang="ts">
	/**
	 * CreateTemplate — Template tab content for the creation workspace
	 *
	 * Left side: YAML textarea with template + data sections, preset picker, defaults
	 * Right side: TaskPreviewTable with live preview of expanded tasks
	 */
	import { expandTemplate, type TemplateExpansionResult } from '$lib/utils/templateExpander';
	import type { TaskDefaults } from '$lib/utils/taskParser';
	import TaskPreviewTable from './TaskPreviewTable.svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import { playSuccessChime, playErrorSound } from '$lib/utils/soundEffects';
	import { broadcastTaskEvent } from '$lib/stores/taskEvents';
	import { uploadAttachments, revokeAttachmentPreviews } from '$lib/utils/attachmentUpload';
	import type { PendingAttachment } from '$lib/types/attachment';
	import ProjectSelector from './ProjectSelector.svelte';
	import AttachmentZone from './AttachmentZone.svelte';
	import { onDestroy } from 'svelte';

	interface Props {
		projects: string[];
		initialProject?: string;
		initialText?: string;
		hideProjectSelector?: boolean;
		stacked?: boolean;
		onTasksCreated?: () => void;
	}

	let {
		projects = [],
		initialProject = '',
		initialText = '',
		hideProjectSelector = false,
		stacked = false,
		onTasksCreated = () => {},
	}: Props = $props();

	// State
	let textInput = $state(initialText);
	let selectedProject = $state(initialProject || projects[0] || '');

	// Sync selectedProject when initialProject changes (e.g., drawer project badge)
	$effect(() => {
		if (initialProject) {
			selectedProject = initialProject;
		}
	});
	let defaultType = $state('task');
	let defaultPriority = $state(1);
	let defaultLabels = $state('');
	let isCreating = $state(false);
	let attachments = $state<PendingAttachment[]>([]);

	// Debounced expansion
	let expandTimeout: ReturnType<typeof setTimeout> | undefined;
	let expandResult = $state<TemplateExpansionResult | null>(null);

	$effect(() => {
		if (expandTimeout) clearTimeout(expandTimeout);
		const text = textInput;

		expandTimeout = setTimeout(() => {
			if (!text.trim()) {
				expandResult = null;
				return;
			}
			expandResult = expandTemplate(text);
		}, 300);
	});

	onDestroy(() => {
		revokeAttachmentPreviews(attachments);
	});

	// Presets
	const presets = [
		{
			name: 'Crate Upgrade',
			yaml: `template:
  title: "Upgrade {{crate}} to latest version"
  type: task
  priority: 2
  labels: [rust, upgrade]
  description: "Update {{crate}} crate, fix breaking changes, run tests."

data:
  - crate: serde
  - crate: tokio
  - crate: axum`,
		},
		{
			name: 'Component Build',
			yaml: `template:
  title: "{{action}} {{component}} page"
  type: feature
  priority: 1
  labels: [frontend, ui]
  description: "{{action}} the {{component}} page with responsive layout and tests."

data:
  - action: Build
    component: Dashboard
  - action: Redesign
    component: Settings
  - action: Build
    component: Profile`,
		},
		{
			name: 'API Endpoints',
			yaml: `template:
  title: "{{method}} /api/{{resource}} endpoint"
  type: task
  priority: 1
  labels: [backend, api]
  description: "Implement {{method}} {{path}} for {{resource}} resource with validation and tests."

data:
  - method: GET
    path: /api/users
    resource: users
  - method: POST
    path: /api/users
    resource: users
  - method: GET
    path: /api/orders
    resource: orders
  - method: PUT
    path: /api/orders/:id
    resource: orders`,
		},
		{
			name: 'Sprint Checklist',
			yaml: `template:
  title: "{{feature}} — integration tests"
  type: chore
  priority: 2
  labels: [testing, sprint]
  description: "Write integration tests for {{feature}}. Cover happy path and error cases."

data:
  - feature: Authentication
  - feature: Payment flow
  - feature: User onboarding
  - feature: Notifications`,
		},
	];

	function loadPreset(yaml: string) {
		textInput = yaml;
	}

	async function handleCreate() {
		if (!expandResult || expandResult.tasks.length === 0) return;

		isCreating = true;
		try {
			const defaultLabelsList = defaultLabels
				? defaultLabels.split(',').map((s) => s.trim()).filter(Boolean)
				: [];

			const tasks = expandResult.tasks.map((t) => ({
				title: t.title,
				type: t.type || defaultType,
				priority: t.priority ?? defaultPriority,
				description: t.description || '',
				labels: [...(t.labels || []), ...defaultLabelsList.filter((l) => !t.labels?.includes(l))],
				depends_on: t.deps || [],
			}));

			const response = await fetch('/api/tasks/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tasks, project: selectedProject }),
			});

			const data = await response.json();

			if (data.created > 0) {
				if (attachments.length > 0 && data.taskIds?.length > 0) {
					await uploadAttachments(data.taskIds[0], attachments);
				}

				playSuccessChime();
				successToast(data.message);
				broadcastTaskEvent('task-change', '');
				onTasksCreated();
				textInput = '';
				expandResult = null;
				revokeAttachmentPreviews(attachments);
				attachments = [];
			}
			if (data.failed > 0) {
				errorToast(`${data.failed} task(s) failed to create`, data.message);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to create tasks';
			playErrorSound();
			errorToast(msg);
		} finally {
			isCreating = false;
		}
	}
</script>

<div class="template-container" class:template-stacked={stacked}>
	<!-- Left: Input -->
	<div class="template-input">
		<!-- Project selector -->
		{#if !hideProjectSelector}
		<div class="mb-3">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Project</span>
			</label>
			<ProjectSelector projects={projects} selected={selectedProject} onSelect={(p) => selectedProject = p} />
		</div>
		{/if}

		<!-- Preset -->
		<div class="form-control mb-3">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Preset</span>
			</label>
			<select
				class="select select-sm select-bordered"
				onchange={(e) => {
					const idx = parseInt((e.target as HTMLSelectElement).value, 10);
					if (!isNaN(idx) && presets[idx]) loadPreset(presets[idx].yaml);
				}}
			>
				<option value="" disabled selected>Load an example...</option>
				{#each presets as preset, i}
					<option value={i}>{preset.name}</option>
				{/each}
			</select>
		</div>

		<textarea
			class="textarea textarea-bordered w-full font-mono text-sm"
			rows={14}
			bind:value={textInput}
			placeholder={`template:\n  title: "Upgrade {{crate}} to latest version"\n  type: task\n  priority: 2\n  labels: [rust, upgrade]\n  description: "Update {{crate}}, fix breaking changes."\n\ndata:\n  - crate: serde\n  - crate: tokio\n  - crate: axum`}
		></textarea>

		{#if expandResult && expandResult.variables.length > 0}
			<div class="variables-section">
				<span class="text-xs font-medium opacity-50">Variables:</span>
				{#each expandResult.variables as v}
					<span class="badge badge-xs badge-outline font-mono">{`{{${v}}}`}</span>
				{/each}
				<span class="text-xs opacity-40 ml-1">&times; {expandResult.rowCount} row{expandResult.rowCount !== 1 ? 's' : ''}</span>
			</div>
		{/if}

		<!-- Attachments -->
		<div class="mt-3">
			<AttachmentZone disabled={isCreating} bind:attachments />
		</div>

		<!-- Defaults section -->
		<div class="defaults-section">
			<h4 class="text-xs font-medium opacity-50 mb-2">Defaults (applied when template fields are missing)</h4>
			<div class="grid grid-cols-3 gap-3">
				<div class="form-control">
					<label class="label py-0.5">
						<span class="label-text text-xs">Type</span>
					</label>
					<select class="select select-sm select-bordered" bind:value={defaultType}>
						<option value="task">Task</option>
						<option value="bug">Bug</option>
						<option value="feature">Feature</option>
						<option value="chore">Chore</option>
						<option value="epic">Epic</option>
					</select>
				</div>
				<div class="form-control">
					<label class="label py-0.5">
						<span class="label-text text-xs">Priority</span>
					</label>
					<select class="select select-sm select-bordered" bind:value={defaultPriority}>
						<option value={0}>P0 — Critical</option>
						<option value={1}>P1 — High</option>
						<option value={2}>P2 — Medium</option>
						<option value={3}>P3 — Low</option>
						<option value={4}>P4 — Lowest</option>
					</select>
				</div>
				<div class="form-control">
					<label class="label py-0.5">
						<span class="label-text text-xs">Labels</span>
					</label>
					<input
						class="input input-sm input-bordered"
						placeholder="comma, separated"
						bind:value={defaultLabels}
					/>
				</div>
			</div>
		</div>

		<!-- Action buttons -->
		<div class="flex items-center gap-3 mt-4">
			<button
				class="btn btn-sm btn-primary"
				onclick={handleCreate}
				disabled={isCreating || !expandResult || expandResult.tasks.length === 0 || expandResult.errors.length > 0}
			>
				{#if isCreating}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				Create {expandResult?.tasks.length || 0} Task{(expandResult?.tasks.length || 0) !== 1 ? 's' : ''}
			</button>
		</div>
	</div>

	<!-- Right: Preview -->
	<div class="template-preview">
		<h3 class="text-sm font-medium mb-3 opacity-60">
			Preview
			{#if expandResult}
				<span class="opacity-70">({expandResult.tasks.length} task{expandResult.tasks.length !== 1 ? 's' : ''})</span>
			{/if}
		</h3>

		{#if expandResult}
			<TaskPreviewTable
				tasks={expandResult.tasks}
				warnings={expandResult.warnings}
				errors={expandResult.errors}
			/>

			{#if expandResult.warnings.length > 0}
				<div class="mt-3">
					<h4 class="text-xs font-medium text-warning mb-1">Warnings:</h4>
					{#each expandResult.warnings as warn}
						<div class="text-xs opacity-60">{warn}</div>
					{/each}
				</div>
			{/if}
			{#if expandResult.errors.length > 0}
				<div class="mt-3">
					<h4 class="text-xs font-medium text-error mb-1">Errors:</h4>
					{#each expandResult.errors as err}
						<div class="text-xs text-error">{err}</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="text-sm opacity-40 py-8 text-center">
				Write a template with {`{{variables}}`} and data rows to see a preview
			</div>
		{/if}
	</div>
</div>

<style>
	.template-container {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		height: 100%;
	}

	.template-input {
		display: flex;
		flex-direction: column;
	}

	.template-preview {
		overflow-y: auto;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250 / 0.5);
		border: 1px solid oklch(0.28 0.02 250 / 0.3);
	}

	.variables-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.defaults-section {
		margin-top: 1rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250 / 0.3);
		border: 1px solid oklch(0.28 0.02 250 / 0.2);
	}

	.template-container.template-stacked {
		grid-template-columns: 1fr;
	}

	@media (max-width: 768px) {
		.template-container {
			grid-template-columns: 1fr;
		}
	}
</style>
