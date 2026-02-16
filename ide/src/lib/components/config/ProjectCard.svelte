<script lang="ts">
	/**
	 * ProjectCard Component
	 *
	 * Displays a single project configuration card with:
	 * - Project name and path
	 * - Port badge (if configured)
	 * - Color preview badges
	 * - Description
	 * - Edit and delete action buttons
	 *
	 * @see ide/src/lib/types/config.ts for ProjectConfig type
	 * @see ide/src/lib/stores/configStore.svelte.ts for store
	 */

	import { fade } from 'svelte/transition';
	import type { ProjectConfig } from '$lib/types/config';

	interface Props {
		/** Project configuration to display */
		project: ProjectConfig;
		/** Called when edit button is clicked */
		onEdit?: (project: ProjectConfig) => void;
		/** Called when delete button is clicked */
		onDelete?: (project: ProjectConfig) => void;
		/** Called when visibility toggle is clicked */
		onToggleVisibility?: (project: ProjectConfig) => void;
		/** Called when open folder button is clicked */
		onOpenFolder?: (project: ProjectConfig) => void;
		/** Custom class */
		class?: string;
	}

	let {
		project,
		onEdit = () => {},
		onDelete = () => {},
		onToggleVisibility = () => {},
		onOpenFolder = () => {},
		class: className = ''
	}: Props = $props();

	// Extract project key from path for display
	const projectKey = $derived(project.path.split('/').pop() || project.name);

	// Get project color for badge styling
	const projectColor = $derived(project.colors?.active || 'oklch(0.70 0.15 200)');

	// Handle card click (opens edit drawer)
	function handleCardClick() {
		onEdit(project);
	}

	// Handle edit click
	function handleEdit(event: MouseEvent) {
		event.stopPropagation();
		onEdit(project);
	}

	// Handle delete click
	function handleDelete(event: MouseEvent) {
		event.stopPropagation();
		if (confirm(`Delete project "${project.name}"? This will remove it from the configuration.`)) {
			onDelete(project);
		}
	}

	// Handle visibility toggle
	function handleToggleVisibility(event: MouseEvent) {
		event.stopPropagation();
		onToggleVisibility(project);
	}

	// Handle open folder
	function handleOpenFolder(event: MouseEvent) {
		event.stopPropagation();
		onOpenFolder(project);
	}
</script>

<div
	class="project-card {className}"
	class:hidden-project={project.hidden}
	style="--project-color: {projectColor}"
	transition:fade={{ duration: 150 }}
	onclick={handleCardClick}
	onkeydown={(e) => e.key === 'Enter' && handleCardClick()}
	role="button"
	tabindex="0"
>
	<!-- Header with project name and actions -->
	<div class="card-header">
		<div class="project-info">
			<div class="project-name-row">
				<span class="project-name-badge">{project.name}</span>
				{#if project.hidden}
					<span class="hidden-badge">Hidden</span>
				{/if}
			</div>
			<span class="project-key">{projectKey}</span>
		</div>

		<div class="card-actions">
			<!-- Visibility toggle -->
			<button
				class="action-btn visibility"
				onclick={handleToggleVisibility}
				title={project.hidden ? 'Show project' : 'Hide project'}
				aria-label={project.hidden ? 'Show project' : 'Hide project'}
			>
				{#if project.hidden}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
					</svg>
				{/if}
			</button>

			<!-- Open folder button -->
			<button
				class="action-btn folder"
				onclick={handleOpenFolder}
				title="Open in file manager"
				aria-label="Open in file manager"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
				</svg>
			</button>

			<!-- Edit button -->
			<button
				class="action-btn edit"
				onclick={handleEdit}
				title="Edit project"
				aria-label="Edit project"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
				</svg>
			</button>

			<!-- Delete button -->
			<button
				class="action-btn delete"
				onclick={handleDelete}
				title="Delete project"
				aria-label="Delete project"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Path -->
	<div class="project-path">
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="path-icon">
			<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
		</svg>
		<span class="path-text" title={project.path}>{project.path}</span>
	</div>

	<!-- Badges row -->
	<div class="badges-row">
		<!-- Status badges (hasJat, hasClaudeMd) -->
		{#if project.stats}
			<span class="badge jat-badge" class:has-jat={project.stats.hasJat} title={project.stats.hasJat ? 'JAT initialized' : 'No .jat/ directory'}>
				{#if project.stats.hasJat}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
					</svg>
				{/if}
				JAT
			</span>
			<span class="badge claude-md-badge" class:has-claude-md={project.stats.hasClaudeMd} title={project.stats.hasClaudeMd ? 'Has CLAUDE.md or AGENTS.md' : 'No CLAUDE.md found'}>
				{#if project.stats.hasClaudeMd}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
					</svg>
				{/if}
				CLAUDE.md
			</span>
		{/if}

		{#if project.port}
			<span class="badge port-badge">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
				</svg>
				:{project.port}
			</span>
		{/if}

		{#if project.colors?.active || project.colors?.inactive}
			<span class="badge color-badge" title="Active: {project.colors?.active || 'none'} / Inactive: {project.colors?.inactive || 'none'}">
				{#if project.colors?.active}
					<span class="color-swatch" style="background: {project.colors.active}"></span>
				{/if}
				{#if project.colors?.inactive}
					<span class="color-swatch" style="background: {project.colors.inactive}"></span>
				{/if}
				Colors
			</span>
		{/if}

		{#if project.database_url}
			<span class="badge db-badge">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
				</svg>
				DB
			</span>
		{/if}

		{#if project.server_path && project.server_path !== project.path}
			<span class="badge server-path-badge" title="Server path: {project.server_path}">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
				</svg>
				Custom Server
			</span>
		{/if}
	</div>

	<!-- Description -->
	{#if project.description}
		<div class="project-description">
			{project.description}
		</div>
	{/if}
</div>

<style>
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 10px;
		transition: all 0.15s ease;
		cursor: pointer;
	}

	.project-card:hover,
	.project-card:focus {
		background: oklch(0.18 0.02 250);
		border-color: oklch(0.32 0.02 250);
		outline: none;
	}

	.project-card:focus-visible {
		box-shadow: 0 0 0 2px oklch(0.60 0.15 200);
	}

	.project-card.hidden-project {
		opacity: 0.6;
	}

	/* Header */
	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.project-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.project-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.project-name-badge {
		font-size: 0.85rem;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		background: color-mix(in oklch, var(--project-color) 20%, transparent);
		border: 1px solid color-mix(in oklch, var(--project-color) 35%, transparent);
		color: var(--project-color);
		white-space: nowrap;
		transition: all 0.15s ease;
	}

	.project-card:hover .project-name-badge {
		background: color-mix(in oklch, var(--project-color) 28%, transparent);
		border-color: color-mix(in oklch, var(--project-color) 50%, transparent);
		box-shadow: 0 0 8px color-mix(in oklch, var(--project-color) 25%, transparent);
	}

	.project-key {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.hidden-badge {
		font-size: 0.55rem;
		font-weight: 600;
		color: oklch(0.70 0.10 85);
		background: oklch(0.25 0.06 85);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	/* Path */
	.project-path {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.path-icon {
		width: 14px;
		height: 14px;
		color: oklch(0.50 0.02 250);
		flex-shrink: 0;
	}

	.path-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Badges */
	.badges-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.65rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		font-family: ui-monospace, monospace;
	}

	.badge-icon {
		width: 12px;
		height: 12px;
	}

	.port-badge {
		color: oklch(0.80 0.10 200);
		background: oklch(0.25 0.06 200);
	}

	.color-badge {
		color: oklch(0.80 0.10 145);
		background: oklch(0.25 0.06 145);
	}

	.color-badge .color-swatch + .color-swatch {
		margin-left: -2px;
	}

	.color-swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		border: 1px solid oklch(0.40 0.02 250);
	}

	.db-badge {
		color: oklch(0.80 0.10 280);
		background: oklch(0.25 0.06 280);
	}

	.server-path-badge {
		color: oklch(0.80 0.10 55);
		background: oklch(0.25 0.06 55);
	}

	/* Status badges (JAT, CLAUDE.md) */
	.jat-badge {
		color: oklch(0.70 0.10 50);
		background: oklch(0.25 0.06 50);
	}

	.jat-badge.has-jat {
		color: oklch(0.80 0.12 145);
		background: oklch(0.25 0.06 145);
	}

	.claude-md-badge {
		color: oklch(0.70 0.10 30);
		background: oklch(0.25 0.06 30);
	}

	.claude-md-badge.has-claude-md {
		color: oklch(0.80 0.12 145);
		background: oklch(0.25 0.06 145);
	}

	/* Description */
	.project-description {
		font-size: 0.8rem;
		color: oklch(0.65 0.02 250);
		line-height: 1.4;
		padding-top: 0.25rem;
		border-top: 1px solid oklch(0.22 0.02 250);
	}

	/* Action buttons */
	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.project-card:hover .card-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.action-btn.visibility:hover {
		background: oklch(0.28 0.06 200);
		border-color: oklch(0.40 0.10 200);
		color: oklch(0.80 0.10 200);
	}

	.action-btn.folder:hover {
		background: oklch(0.28 0.06 55);
		border-color: oklch(0.40 0.10 55);
		color: oklch(0.80 0.10 55);
	}

	.action-btn.edit:hover {
		background: oklch(0.28 0.06 145);
		border-color: oklch(0.40 0.10 145);
		color: oklch(0.80 0.10 145);
	}

	.action-btn.delete:hover {
		background: oklch(0.28 0.08 25);
		border-color: oklch(0.45 0.12 25);
		color: oklch(0.80 0.15 25);
	}
</style>
