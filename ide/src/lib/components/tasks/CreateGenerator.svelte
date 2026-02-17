<script lang="ts">
	/**
	 * CreateGenerator — AI Generator tab for the creation workspace
	 *
	 * Left side: feature description textarea, project selector, options
	 * Right side: TaskPreviewTable with AI-generated tasks (editable before creation)
	 */
	import type { ParsedTask } from '$lib/utils/taskParser';
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
	let description = $state(initialText);
	let selectedProject = $state(initialProject || projects[0] || '');

	// Sync selectedProject when initialProject changes (e.g., drawer project badge)
	$effect(() => {
		if (initialProject) {
			selectedProject = initialProject;
		}
	});
	let includeEpic = $state(true);
	let includeDeps = $state(true);
	let maxTasks = $state(10);
	let isGenerating = $state(false);
	let isCreating = $state(false);
	let generatedTasks = $state<ParsedTask[]>([]);
	let reasoning = $state('');
	let generateError = $state('');
	let attachments = $state<PendingAttachment[]>([]);

	onDestroy(() => {
		revokeAttachmentPreviews(attachments);
	});

	async function handleGenerate() {
		if (!description.trim() || description.trim().length < 10) return;

		isGenerating = true;
		generateError = '';
		generatedTasks = [];
		reasoning = '';

		try {
			// Fetch open tasks for the selected project to help AI avoid duplicates
			let openTasks: { id: string; title: string; priority?: number; issue_type?: string }[] = [];
			try {
				const tasksRes = await fetch(`/api/tasks?project=${encodeURIComponent(selectedProject)}&status=open&limit=30`);
				if (tasksRes.ok) {
					const tasksData = await tasksRes.json();
					openTasks = (tasksData.tasks || []).map((t: Record<string, unknown>) => ({
						id: t.id,
						title: t.title,
						priority: t.priority,
						issue_type: t.issue_type,
					}));
				}
			} catch {
				// Non-critical — continue without open tasks context
			}

			const response = await fetch('/api/tasks/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					description: description.trim(),
					project: selectedProject,
					openTasks,
					options: {
						maxTasks,
						includeEpic,
						includeDeps,
					},
				}),
			});

			const data = await response.json();

			if (data.error) {
				generateError = data.message || 'Failed to generate tasks';
				playErrorSound();
				return;
			}

			generatedTasks = (data.tasks || []).map((t: Record<string, unknown>) => ({
				title: String(t.title || ''),
				type: String(t.type || 'task'),
				priority: Number(t.priority ?? 2),
				labels: Array.isArray(t.labels) ? t.labels : [],
				description: String(t.description || ''),
				deps: Array.isArray(t.deps) ? t.deps : undefined,
			}));

			reasoning = data.reasoning || '';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to generate tasks';
			generateError = msg;
			playErrorSound();
		} finally {
			isGenerating = false;
		}
	}

	function removeTask(index: number) {
		generatedTasks = generatedTasks.filter((_, i) => i !== index);
	}

	async function handleCreate() {
		if (generatedTasks.length === 0) return;

		isCreating = true;
		try {
			const tasks = generatedTasks.map((t) => ({
				title: t.title,
				type: t.type || 'task',
				priority: t.priority ?? 2,
				description: t.description || '',
				labels: t.labels || [],
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
				description = '';
				generatedTasks = [];
				reasoning = '';
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

<div class="generator-container" class:generator-stacked={stacked}>
	<!-- Left: Input -->
	<div class="generator-input">
		<!-- Project selector -->
		{#if !hideProjectSelector}
		<div class="mb-3">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Project</span>
			</label>
			<ProjectSelector projects={projects} selected={selectedProject} onSelect={(p) => selectedProject = p} />
		</div>
		{/if}

		<!-- Max tasks -->
		<div class="form-control mb-3">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Max tasks</span>
			</label>
			<select class="select select-sm select-bordered" bind:value={maxTasks}>
				<option value={5}>5</option>
				<option value={8}>8</option>
				<option value={10}>10</option>
				<option value={15}>15</option>
				<option value={20}>20</option>
			</select>
		</div>

		<div class="form-control">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Feature description</span>
			</label>
			<textarea
				class="textarea textarea-bordered w-full text-sm"
				rows={10}
				bind:value={description}
				placeholder="Describe the feature you want to build. Be specific about requirements, target users, and technical constraints.

Example: Build a user notification system with email and in-app notifications. Users should be able to set preferences for which events trigger notifications. Support batching to avoid notification fatigue."
			></textarea>
		</div>

		<!-- Attachments -->
		<div class="mt-3">
			<AttachmentZone disabled={isGenerating || isCreating} bind:attachments />
		</div>

		<!-- Options -->
		<div class="defaults-section">
			<h4 class="text-xs font-medium opacity-50 mb-2">Generation options</h4>
			<div class="flex items-center gap-4">
				<label class="label cursor-pointer gap-1.5 py-0.5">
					<input type="checkbox" class="checkbox checkbox-xs" bind:checked={includeEpic} />
					<span class="label-text text-xs">Include epic</span>
				</label>
				<label class="label cursor-pointer gap-1.5 py-0.5">
					<input type="checkbox" class="checkbox checkbox-xs" bind:checked={includeDeps} />
					<span class="label-text text-xs">Include dependencies</span>
				</label>
			</div>
		</div>

		<!-- Action buttons -->
		<div class="flex items-center gap-3 mt-4">
			<button
				class="btn btn-sm btn-secondary"
				onclick={handleGenerate}
				disabled={isGenerating || !description.trim() || description.trim().length < 10}
			>
				{#if isGenerating}
					<span class="loading loading-spinner loading-xs"></span>
					Generating...
				{:else}
					Generate Tasks
				{/if}
			</button>

			{#if generatedTasks.length > 0}
				<button
					class="btn btn-sm btn-primary"
					onclick={handleCreate}
					disabled={isCreating || generatedTasks.length === 0}
				>
					{#if isCreating}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Create {generatedTasks.length} Task{generatedTasks.length !== 1 ? 's' : ''}
				</button>
			{/if}
		</div>

		{#if generateError}
			<div class="mt-3 text-sm text-error">{generateError}</div>
		{/if}
	</div>

	<!-- Right: Preview -->
	<div class="generator-preview">
		<h3 class="text-sm font-medium mb-3 opacity-60">
			Preview
			{#if generatedTasks.length > 0}
				<span class="opacity-70">({generatedTasks.length} task{generatedTasks.length !== 1 ? 's' : ''})</span>
			{/if}
		</h3>

		{#if isGenerating}
			<div class="flex flex-col items-center justify-center py-12 gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span class="text-sm opacity-50">AI is breaking down your feature...</span>
			</div>
		{:else if generatedTasks.length > 0}
			<div class="task-list">
				{#each generatedTasks as task, i (i)}
					<div class="task-card">
						<div class="task-card-header">
							<span class="text-xs font-mono opacity-40">{i + 1}</span>
							<span class="text-sm font-medium flex-1">{task.title}</span>
							<button
								class="btn btn-ghost btn-xs opacity-40 hover:opacity-100 hover:text-error"
								onclick={() => removeTask(i)}
								title="Remove task"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
									<path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
								</svg>
							</button>
						</div>
						<div class="task-card-meta">
							{#if task.type}
								<span class="badge badge-xs {task.type === 'bug' ? 'badge-error' : task.type === 'feature' ? 'badge-success' : task.type === 'epic' ? 'badge-secondary' : 'badge-info'}">{task.type}</span>
							{/if}
							{#if task.priority !== undefined}
								<span class="badge badge-xs {task.priority === 0 ? 'badge-error' : task.priority === 1 ? 'badge-warning' : 'badge-ghost'}">P{task.priority}</span>
							{/if}
							{#if task.labels && task.labels.length > 0}
								{#each task.labels.slice(0, 3) as label}
									<span class="badge badge-xs badge-outline">{label}</span>
								{/each}
							{/if}
						</div>
						{#if task.description}
							<div class="text-xs opacity-50 mt-1">{task.description}</div>
						{/if}
						{#if task.deps && task.deps.length > 0}
							<div class="text-xs opacity-40 mt-1 font-mono">deps: {task.deps.join(', ')}</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-sm opacity-40 py-8 text-center">
				Describe a feature and click "Generate Tasks" to see AI-generated breakdown
			</div>
		{/if}
	</div>
</div>

<style>
	.generator-container {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		height: 100%;
	}

	.generator-input {
		display: flex;
		flex-direction: column;
	}

	.generator-preview {
		overflow-y: auto;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250 / 0.5);
		border: 1px solid oklch(0.28 0.02 250 / 0.3);
	}

	.defaults-section {
		margin-top: 1rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: oklch(0.18 0.01 250 / 0.3);
		border: 1px solid oklch(0.28 0.02 250 / 0.2);
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.task-card {
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		background: oklch(0.20 0.01 250 / 0.5);
		border: 1px solid oklch(0.28 0.02 250 / 0.2);
	}

	.task-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.task-card-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}

	.generator-container.generator-stacked {
		grid-template-columns: 1fr;
	}

	@media (max-width: 768px) {
		.generator-container {
			grid-template-columns: 1fr;
		}
	}
</style>
