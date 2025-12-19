<script lang="ts">
	import { onMount } from 'svelte';
	import {
		COMMAND_TEMPLATES,
		type CommandTemplate,
		type ExtendedTemplate
	} from '$lib/config/commandTemplates';

	// Props
	let {
		selectedTemplate = $bindable(null as CommandTemplate | null),
		onSelect = (_template: CommandTemplate) => {},
		showUserTemplates = true
	}: {
		selectedTemplate?: CommandTemplate | null;
		onSelect?: (template: CommandTemplate) => void;
		showUserTemplates?: boolean;
	} = $props();

	// State
	let hoveredTemplate = $state<string | null>(null);
	let userTemplates = $state<ExtendedTemplate[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Fetch user templates on mount
	onMount(async () => {
		if (showUserTemplates) {
			await fetchUserTemplates();
		}
	});

	async function fetchUserTemplates() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/templates');
			if (response.ok) {
				const data = await response.json();
				userTemplates = data.templates || [];
			} else {
				error = 'Failed to load user templates';
			}
		} catch (err) {
			error = 'Failed to load user templates';
			console.error('[CommandTemplates] Error fetching user templates:', err);
		} finally {
			loading = false;
		}
	}

	function handleSelect(template: CommandTemplate) {
		selectedTemplate = template;
		onSelect(template);
	}

	function handleKeydown(e: KeyboardEvent, template: CommandTemplate) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleSelect(template);
		}
	}

	// Derived: check if a template is a user template
	function isUserTemplate(template: CommandTemplate | ExtendedTemplate): boolean {
		return 'isUserTemplate' in template && template.isUserTemplate === true;
	}
</script>

<div class="command-templates">
	<!-- Built-in Templates Section -->
	<div class="mb-3">
		<h4 class="text-sm font-semibold text-base-content">Built-in Templates</h4>
		<p class="text-xs text-base-content/60 mt-1">
			Start with a template that matches your command type
		</p>
	</div>

	<div class="grid grid-cols-2 gap-3">
		{#each COMMAND_TEMPLATES as template}
			{@const isSelected = selectedTemplate?.id === template.id}
			{@const isHovered = hoveredTemplate === template.id}
			<button
				type="button"
				class="template-card"
				class:selected={isSelected}
				class:hovered={isHovered}
				onclick={() => handleSelect(template)}
				onkeydown={(e) => handleKeydown(e, template)}
				onmouseenter={() => (hoveredTemplate = template.id)}
				onmouseleave={() => (hoveredTemplate = null)}
			>
				<div class="flex items-start gap-3">
					<span class="template-icon">{template.icon}</span>
					<div class="flex-1 text-left">
						<div class="template-name">{template.name}</div>
						<div class="template-desc">{template.description}</div>
					</div>
					{#if isSelected}
						<div class="check-mark">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
					{/if}
				</div>
				{#if isHovered || isSelected}
					<div class="template-use-case">
						<span class="text-xs opacity-70">Best for:</span>
						<span class="text-xs">{template.useCase}</span>
					</div>
				{/if}
			</button>
		{/each}
	</div>

	<!-- User Templates Section -->
	{#if showUserTemplates}
		<div class="mt-6 pt-4 border-t border-base-content/10">
			<div class="mb-3 flex items-center justify-between">
				<div>
					<h4 class="text-sm font-semibold text-base-content flex items-center gap-2">
						Your Templates
						{#if userTemplates.length > 0}
							<span class="badge badge-sm badge-primary">{userTemplates.length}</span>
						{/if}
					</h4>
					<p class="text-xs text-base-content/60 mt-1">
						Custom templates saved to ~/.config/jat/templates/
					</p>
				</div>
				<a
					href="/config?tab=templates"
					class="btn btn-xs btn-ghost gap-1"
					title="Manage templates"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
							clip-rule="evenodd"
						/>
					</svg>
					Manage
				</a>
			</div>

			{#if loading}
				<div class="flex items-center gap-2 text-base-content/60 text-sm py-4">
					<span class="loading loading-spinner loading-sm"></span>
					Loading templates...
				</div>
			{:else if error}
				<div class="alert alert-warning text-sm py-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
					{error}
					<button class="btn btn-xs btn-ghost" onclick={fetchUserTemplates}>Retry</button>
				</div>
			{:else if userTemplates.length === 0}
				<div class="text-center py-6 text-base-content/60">
					<div class="text-2xl mb-2">📄</div>
					<p class="text-sm">No custom templates yet</p>
					<p class="text-xs mt-1">
						Create one from an existing command or use the
						<a href="/config?tab=templates" class="link link-primary">template manager</a>
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-3">
					{#each userTemplates as template}
						{@const isSelected = selectedTemplate?.id === template.id}
						{@const isHovered = hoveredTemplate === template.id}
						<button
							type="button"
							class="template-card user-template"
							class:selected={isSelected}
							class:hovered={isHovered}
							onclick={() => handleSelect(template)}
							onkeydown={(e) => handleKeydown(e, template)}
							onmouseenter={() => (hoveredTemplate = template.id)}
							onmouseleave={() => (hoveredTemplate = null)}
						>
							<div class="flex items-start gap-3">
								<span class="template-icon">{template.icon || '📄'}</span>
								<div class="flex-1 text-left">
									<div class="template-name flex items-center gap-1.5">
										{template.name}
										<span class="badge badge-xs badge-outline opacity-60">custom</span>
									</div>
									<div class="template-desc">{template.description || 'No description'}</div>
								</div>
								{#if isSelected}
									<div class="check-mark">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
												clip-rule="evenodd"
											/>
										</svg>
									</div>
								{/if}
							</div>
							{#if isHovered || isSelected}
								<div class="template-use-case">
									<span class="text-xs opacity-70">Best for:</span>
									<span class="text-xs">{template.useCase || 'Custom workflows'}</span>
								</div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Preview Section -->
	{#if selectedTemplate}
		<div class="preview-section">
			<div class="flex items-center justify-between mb-2">
				<h4 class="text-sm font-semibold text-base-content">Template Preview</h4>
				<span class="badge badge-sm" class:badge-ghost={!isUserTemplate(selectedTemplate)} class:badge-primary={isUserTemplate(selectedTemplate)}>
					{selectedTemplate.icon}
					{selectedTemplate.name}
					{#if isUserTemplate(selectedTemplate)}
						<span class="ml-1 opacity-60">(custom)</span>
					{/if}
				</span>
			</div>
			<div class="preview-content">
				<pre class="text-xs"><code>{selectedTemplate.content.slice(0, 500)}...</code></pre>
			</div>
		</div>
	{/if}
</div>

<style>
	.command-templates {
		padding: 0.5rem 0;
	}

	.template-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid oklch(0.35 0.02 250);
		background: oklch(0.2 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.template-card:hover,
	.template-card.hovered {
		border-color: oklch(0.5 0.1 240);
		background: oklch(0.22 0.02 250);
	}

	.template-card.selected {
		border-color: oklch(0.65 0.15 145);
		background: oklch(0.55 0.18 145 / 0.1);
	}

	/* User template styling - slightly different border color */
	.template-card.user-template {
		border-color: oklch(0.4 0.08 270);
	}

	.template-card.user-template:hover,
	.template-card.user-template.hovered {
		border-color: oklch(0.55 0.12 270);
		background: oklch(0.22 0.03 270);
	}

	.template-icon {
		font-size: 1.25rem;
		line-height: 1;
	}

	.template-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: oklch(0.9 0.02 250);
	}

	.template-desc {
		font-size: 0.75rem;
		color: oklch(0.7 0.02 250);
		margin-top: 0.125rem;
	}

	.template-use-case {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.35 0.02 250);
		margin-top: 0.25rem;
	}

	.check-mark {
		color: oklch(0.75 0.18 145);
		flex-shrink: 0;
	}

	.preview-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid oklch(0.35 0.02 250);
	}

	.preview-content {
		padding: 0.75rem;
		border-radius: 0.375rem;
		background: oklch(0.15 0.02 250);
		max-height: 200px;
		overflow: auto;
	}

	.preview-content pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.preview-content code {
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas,
			'DejaVu Sans Mono', monospace;
		color: oklch(0.8 0.02 250);
	}
</style>
