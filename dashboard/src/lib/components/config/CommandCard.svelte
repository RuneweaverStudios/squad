<script lang="ts">
	/**
	 * CommandCard Component
	 *
	 * Displays a single slash command card with:
	 * - Command invocation name
	 * - Namespace badge
	 * - Description (from frontmatter)
	 * - Tags (if present)
	 * - Edit and delete action buttons
	 *
	 * @see dashboard/src/lib/types/config.ts for SlashCommand type
	 * @see dashboard/src/lib/stores/configStore.svelte.ts for store
	 */

	import { fade } from 'svelte/transition';
	import type { SlashCommand } from '$lib/types/config';

	interface Props {
		/** Slash command to display */
		command: SlashCommand;
		/** Called when edit button is clicked */
		onEdit?: (command: SlashCommand) => void;
		/** Called when delete button is clicked */
		onDelete?: (command: SlashCommand) => void;
		/** Custom class */
		class?: string;
	}

	let {
		command,
		onEdit = () => {},
		onDelete = () => {},
		class: className = ''
	}: Props = $props();

	// Parse tags from frontmatter
	const tags = $derived(() => {
		if (!command.frontmatter?.tags) return [];
		if (Array.isArray(command.frontmatter.tags)) return command.frontmatter.tags;
		return command.frontmatter.tags.split(',').map((t) => t.trim());
	});

	// Handle edit click
	function handleEdit() {
		onEdit(command);
	}

	// Handle delete click
	function handleDelete() {
		if (confirm(`Delete command "${command.invocation}"? This cannot be undone.`)) {
			onDelete(command);
		}
	}
</script>

<div
	class="command-card {className}"
	transition:fade={{ duration: 150 }}
>
	<!-- Header with command name and actions -->
	<div class="card-header">
		<div class="command-info">
			<div class="command-name-row">
				<span class="command-invocation">{command.invocation}</span>
			</div>
			<span class="command-name">{command.name}.md</span>
		</div>

		<div class="card-actions">
			<!-- Edit button -->
			<button
				class="action-btn edit"
				onclick={handleEdit}
				title="Edit command"
				aria-label="Edit command"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
				</svg>
			</button>

			<!-- Delete button -->
			<button
				class="action-btn delete"
				onclick={handleDelete}
				title="Delete command"
				aria-label="Delete command"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Path -->
	<div class="command-path">
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="path-icon">
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
		</svg>
		<span class="path-text" title={command.path}>{command.path}</span>
	</div>

	<!-- Badges row -->
	<div class="badges-row">
		<!-- Namespace badge -->
		<span class="badge namespace-badge">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
			</svg>
			{command.namespace}
		</span>

		<!-- Version badge -->
		{#if command.frontmatter?.version}
			<span class="badge version-badge">
				v{command.frontmatter.version}
			</span>
		{/if}

		<!-- Author badge -->
		{#if command.frontmatter?.author}
			<span class="badge author-badge">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="badge-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
				</svg>
				{command.frontmatter.author}
			</span>
		{/if}
	</div>

	<!-- Tags -->
	{#if tags().length > 0}
		<div class="tags-row">
			{#each tags() as tag}
				<span class="tag">{tag}</span>
			{/each}
		</div>
	{/if}

	<!-- Description -->
	{#if command.frontmatter?.description}
		<div class="command-description">
			{command.frontmatter.description}
		</div>
	{/if}
</div>

<style>
	.command-card {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 10px;
		transition: all 0.15s ease;
	}

	.command-card:hover {
		background: oklch(0.18 0.02 250);
		border-color: oklch(0.32 0.02 250);
	}

	/* Header */
	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.command-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.command-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.command-invocation {
		font-size: 0.95rem;
		font-weight: 600;
		color: oklch(0.85 0.12 200);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.command-name {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	/* Path */
	.command-path {
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

	.namespace-badge {
		color: oklch(0.80 0.10 280);
		background: oklch(0.25 0.06 280);
	}

	.version-badge {
		color: oklch(0.80 0.10 145);
		background: oklch(0.25 0.06 145);
	}

	.author-badge {
		color: oklch(0.80 0.10 55);
		background: oklch(0.25 0.06 55);
	}

	/* Tags */
	.tags-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.tag {
		font-size: 0.6rem;
		font-weight: 500;
		color: oklch(0.70 0.08 200);
		background: oklch(0.22 0.04 200);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
	}

	/* Description */
	.command-description {
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

	.command-card:hover .card-actions {
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
