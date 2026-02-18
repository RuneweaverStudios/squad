<script lang="ts">
	/**
	 * CreateForm — Simplified single-task form for the workspace
	 *
	 * Essential fields only: title, description, type, priority, labels, project, deps.
	 * No AI suggestions or voice input (those live in TaskCreationDrawer).
	 */
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
		onTaskCreated?: () => void;
	}

	let {
		projects = [],
		onTaskCreated = () => {},
	}: Props = $props();

	// Form state
	let title = $state('');
	let description = $state('');
	let type = $state('task');
	let priority = $state(1);
	let labelsInput = $state('');
	let project = $state(projects[0] || '');
	let depsInput = $state('');
	let isSubmitting = $state(false);
	let attachments = $state<PendingAttachment[]>([]);

	$effect(() => {
		if (!project && projects.length > 0) {
			project = projects[0];
		}
	});

	onDestroy(() => {
		revokeAttachmentPreviews(attachments);
	});

	async function handleSubmit() {
		if (!title.trim()) return;

		isSubmitting = true;
		try {
			const body: Record<string, unknown> = {
				title: title.trim(),
				type,
				priority,
				project,
			};

			if (description.trim()) body.description = description.trim();

			const labels = labelsInput.split(',').map(s => s.trim()).filter(Boolean);
			if (labels.length > 0) body.labels = labels.join(',');

			const deps = depsInput.split(',').map(s => s.trim()).filter(Boolean);
			if (deps.length > 0) body.depends_on = deps;

			const response = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || `Failed to create task (${response.status})`);
			}

			const data = await response.json();

			// Upload attachments if any
			if (attachments.length > 0 && data.taskId) {
				await uploadAttachments(data.taskId, attachments);
			}

			playSuccessChime();
			successToast(`Created: ${title.trim()}`, data.taskId ? `ID: ${data.taskId}` : undefined);
			broadcastTaskEvent('task-change', data.taskId || '');
			onTaskCreated();

			// Reset form
			title = '';
			description = '';
			type = 'task';
			priority = 1;
			labelsInput = '';
			depsInput = '';
			revokeAttachmentPreviews(attachments);
			attachments = [];
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to create task';
			playErrorSound();
			errorToast(msg);
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	}
</script>

<div class="form-container" onkeydown={handleKeydown}>
	<!-- Project selector -->
	<div class="mb-3">
		<label class="label py-1">
			<span class="label-text text-sm font-medium">Project</span>
		</label>
		<ProjectSelector {projects} selected={project} onSelect={(p) => project = p} />
	</div>

	<!-- Type + Priority -->
	<div class="grid grid-cols-2 gap-3 mb-4">
		<div class="form-control">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Type</span>
			</label>
			<select class="select select-sm select-bordered" bind:value={type}>
				<option value="task">Task</option>
				<option value="bug">Bug</option>
				<option value="feature">Feature</option>
				<option value="chore">Chore</option>
				<option value="epic">Epic</option>
			</select>
		</div>
		<div class="form-control">
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Priority</span>
			</label>
			<select class="select select-sm select-bordered" bind:value={priority}>
				<option value={0}>P0 — Critical</option>
				<option value={1}>P1 — High</option>
				<option value={2}>P2 — Medium</option>
				<option value={3}>P3 — Low</option>
				<option value={4}>P4 — Lowest</option>
			</select>
		</div>
	</div>

	<!-- Title -->
	<div class="form-control mb-3">
		<label class="label py-1">
			<span class="label-text text-sm font-medium">Title <span class="text-error">*</span></span>
		</label>
		<input
			class="input input-sm input-bordered w-full"
			placeholder="What needs to be done?"
			bind:value={title}
			autofocus
		/>
	</div>

	<!-- Description -->
	<div class="form-control mb-3">
		<label class="label py-1">
			<span class="label-text text-sm font-medium">Description</span>
		</label>
		<textarea
			class="textarea textarea-bordered w-full text-sm"
			rows={6}
			placeholder="Describe the task in detail..."
			bind:value={description}
		></textarea>
	</div>

	<!-- Labels + Dependencies -->
	<div class="grid grid-cols-2 gap-3 mb-4">
		<div>
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Labels</span>
			</label>
			<input
				class="input input-sm input-bordered w-full"
				placeholder="security, api, frontend"
				bind:value={labelsInput}
			/>
		</div>
		<div>
			<label class="label py-1">
				<span class="label-text text-sm font-medium">Dependencies</span>
			</label>
			<input
				class="input input-sm input-bordered w-full font-mono text-sm"
				placeholder="squad-abc, squad-def"
				bind:value={depsInput}
			/>
		</div>
	</div>

	<!-- Attachments -->
	<div class="mb-4">
		<label class="label py-1">
			<span class="label-text text-sm font-medium">Attachments</span>
		</label>
		<AttachmentZone disabled={isSubmitting} bind:attachments />
	</div>

	<!-- Submit -->
	<div class="flex items-center gap-3">
		<button
			class="btn btn-sm btn-primary"
			onclick={handleSubmit}
			disabled={isSubmitting || !title.trim()}
		>
			{#if isSubmitting}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			Create Task
		</button>
		<span class="text-xs opacity-40">Cmd+Enter to submit</span>
	</div>
</div>

<style>
	.form-container {
		max-width: 48rem;
	}
</style>
