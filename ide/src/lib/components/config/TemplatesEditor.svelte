<script lang="ts">
	/**
	 * TemplatesEditor Component
	 *
	 * Manage templates organized by collapsible categories.
	 * Shows both built-in templates (read-only) and user templates (editable).
	 * Provides CRUD operations: create, edit, delete, duplicate, import/export.
	 */

	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import type { UserTemplate } from '$lib/types/userTemplates';
	import type { TemplateCategory } from '$lib/config/commandTemplates';
	import {
		TEMPLATE_CATEGORIES,
		COMMAND_TEMPLATES,
		type ExtendedTemplate
	} from '$lib/config/commandTemplates';

	// State
	let userTemplates = $state<UserTemplate[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Category state
	let expandedCategories = $state<Set<string>>(new Set());

	// Editor state
	let isEditorOpen = $state(false);
	let editingTemplate = $state<UserTemplate | null>(null);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	// Form state
	let formData = $state({
		id: '',
		name: '',
		description: '',
		icon: '📄',
		content: '',
		useCase: '',
		category: 'custom' as TemplateCategory,
		variables: [] as Array<{
			name: string;
			label: string;
			placeholder?: string;
			defaultValue?: string;
			multiline?: boolean;
			hint?: string;
			required?: boolean;
		}>
	});

	// Delete confirmation
	let deleteConfirmId = $state<string | null>(null);
	let isDeleting = $state(false);

	// Import state
	let importError = $state<string | null>(null);

	// Merge built-in + user templates into ExtendedTemplate[]
	const allTemplates = $derived.by(() => {
		const builtIn: ExtendedTemplate[] = COMMAND_TEMPLATES.map((t) => ({
			...t,
			isUserTemplate: false
		}));
		const user: ExtendedTemplate[] = userTemplates.map((t) => ({
			...t,
			isUserTemplate: true
		}));
		return [...builtIn, ...user];
	});

	// Group templates by category
	const groupedCategories = $derived.by(() => {
		return TEMPLATE_CATEGORIES.map((cat) => ({
			...cat,
			templates: allTemplates.filter(
				(t) => (t.category || 'custom') === cat.id
			)
		}));
	});

	// Total count
	const totalTemplates = $derived(allTemplates.length);

	function toggleCategory(categoryId: string) {
		const newExpanded = new Set(expandedCategories);
		if (newExpanded.has(categoryId)) {
			newExpanded.delete(categoryId);
		} else {
			newExpanded.add(categoryId);
		}
		expandedCategories = newExpanded;
	}

	// Fetch user templates
	async function fetchTemplates() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/templates');
			if (!response.ok) {
				throw new Error('Failed to load templates');
			}
			const data = await response.json();
			userTemplates = data.templates || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load templates';
			console.error('[TemplatesEditor] Error:', err);
		} finally {
			loading = false;
		}
	}

	// Open editor for new template (with optional category pre-selected)
	function handleAdd(category?: TemplateCategory) {
		editingTemplate = null;
		formData = {
			id: '',
			name: '',
			description: '',
			icon: '📄',
			content: '',
			useCase: '',
			category: category || 'custom',
			variables: []
		};
		saveError = null;
		isEditorOpen = true;
	}

	// Open editor for existing template
	function handleEdit(template: UserTemplate) {
		editingTemplate = template;
		formData = {
			id: template.id,
			name: template.name,
			description: template.description || '',
			icon: template.icon || '📄',
			content: template.content,
			useCase: template.useCase || '',
			category: template.category || 'custom',
			variables: template.variables ? [...template.variables] : []
		};
		saveError = null;
		isEditorOpen = true;
	}

	// Close editor
	function handleClose() {
		isEditorOpen = false;
		editingTemplate = null;
		saveError = null;
	}

	// Save template
	async function handleSave() {
		isSaving = true;
		saveError = null;

		try {
			const isNew = !editingTemplate;
			const url = isNew ? '/api/templates' : `/api/templates/${formData.id}`;
			const method = isNew ? 'POST' : 'PUT';

			const body: Record<string, unknown> = {
				name: formData.name,
				description: formData.description,
				icon: formData.icon,
				content: formData.content,
				useCase: formData.useCase,
				category: formData.category
			};

			if (isNew) {
				body.id = formData.id;
			}

			if (formData.variables.length > 0) {
				body.variables = formData.variables;
			}

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || data.error || 'Failed to save template');
			}

			await fetchTemplates();
			handleClose();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save template';
			console.error('[TemplatesEditor] Save error:', err);
		} finally {
			isSaving = false;
		}
	}

	// Delete template
	async function handleDelete(id: string) {
		isDeleting = true;

		try {
			const response = await fetch(`/api/templates/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to delete template');
			}

			await fetchTemplates();
		} catch (err) {
			console.error('[TemplatesEditor] Delete error:', err);
		} finally {
			isDeleting = false;
			deleteConfirmId = null;
		}
	}

	// Duplicate template (works for both built-in and user)
	async function handleDuplicate(template: ExtendedTemplate) {
		const newId = `${template.id}-copy`;
		const newName = `${template.name} (Copy)`;

		try {
			const response = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: newId,
					name: newName,
					description: template.description,
					icon: template.icon,
					content: template.content,
					useCase: template.useCase,
					category: template.category || 'custom',
					variables: template.variables || [],
					frontmatter: template.frontmatter
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to duplicate template');
			}

			await fetchTemplates();
		} catch (err) {
			console.error('[TemplatesEditor] Duplicate error:', err);
		}
	}

	// Export template (user templates only)
	function handleExport(template: ExtendedTemplate) {
		const json = JSON.stringify(template, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${template.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Export all user templates
	function handleExportAll() {
		const json = JSON.stringify(
			{ templates: userTemplates, exportedAt: new Date().toISOString() },
			null,
			2
		);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'user-templates.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	// Import templates
	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importError = null;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			const templatesToImport = data.templates || [data];

			for (const template of templatesToImport) {
				if (!template.id || !template.name || !template.content) {
					throw new Error('Invalid template format: missing id, name, or content');
				}

				await fetch('/api/templates?overwrite=true', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(template)
				});
			}

			await fetchTemplates();
			input.value = '';
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Failed to import templates';
			console.error('[TemplatesEditor] Import error:', err);
		}
	}

	// Add variable
	function addVariable() {
		formData.variables = [
			...formData.variables,
			{
				name: '',
				label: '',
				placeholder: '',
				defaultValue: '',
				multiline: false,
				hint: '',
				required: false
			}
		];
	}

	// Remove variable
	function removeVariable(index: number) {
		formData.variables = formData.variables.filter((_, i) => i !== index);
	}

	// Generate ID from name
	function generateId() {
		if (!formData.id && formData.name) {
			formData.id = formData.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 64);
		}
	}

	onMount(() => {
		fetchTemplates();
	});
</script>

<div class="templates-editor">
	<!-- Header -->
	<div class="templates-header">
		<div class="header-info">
			<h2 class="section-title">Templates</h2>
			<p class="section-desc">
				Reusable boilerplate organized by type. Select a template when creating new commands, hooks, or tools in the <a href="/config?tab=commands" class="link-inline">Commands</a> tab.
			</p>
		</div>
		<div class="header-actions">
			<label class="import-btn">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
				</svg>
				Import
				<input type="file" accept=".json" onchange={handleImport} class="hidden" />
			</label>
			{#if userTemplates.length > 0}
				<button class="export-all-btn" onclick={handleExportAll}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
					</svg>
					Export All
				</button>
			{/if}
			<button class="add-btn" onclick={() => handleAdd()}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				New Template
			</button>
		</div>
	</div>

	{#if importError}
		<div class="import-error" transition:slide>
			<span>{importError}</span>
			<button onclick={() => (importError = null)}>×</button>
		</div>
	{/if}

	<!-- Content -->
	{#if loading}
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p>Loading templates...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="error-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<p class="error-title">Failed to load templates</p>
			<p class="error-message">{error}</p>
			<button class="retry-btn" onclick={fetchTemplates}>
				Retry
			</button>
		</div>
	{:else}
		<div class="templates-count">{totalTemplates} templates</div>

		<div class="categories-list">
			{#each groupedCategories as category (category.id)}
				{#if category.templates.length > 0}
					<div class="category-section">
						<!-- Category header -->
						<button class="category-header" onclick={() => toggleCategory(category.id)}>
							<div class="category-left">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="category-icon">
									<path stroke-linecap="round" stroke-linejoin="round" d={category.icon} />
								</svg>
								<div class="category-info">
									<span class="category-name">{category.name}</span>
									<span class="category-count">{category.templates.length}</span>
								</div>
								<span class="category-desc">{category.description}</span>
							</div>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="chevron-icon"
								class:expanded={expandedCategories.has(category.id)}
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						<!-- Category content -->
						{#if expandedCategories.has(category.id)}
							<div class="templates-grid" transition:slide={{ duration: 200 }}>
								{#each category.templates as template (template.id)}
									{@const isBuiltIn = !template.isUserTemplate}
									<div class="template-card" class:built-in={isBuiltIn} transition:fade={{ duration: 150 }}>
										<div class="template-header">
											<span class="template-icon">{template.icon || '📄'}</span>
											<div class="template-info">
												<div class="template-name-row">
													<h3 class="template-name">{template.name}</h3>
													{#if isBuiltIn}
														<span class="badge badge-builtin">built-in</span>
													{:else}
														<span class="badge badge-custom">custom</span>
													{/if}
												</div>
												<code class="template-id">{template.id}</code>
											</div>
										</div>

										{#if template.description}
											<p class="template-desc">{template.description}</p>
										{/if}

										{#if template.useCase}
											<p class="template-use-case">
												<span class="use-case-label">Best for:</span> {template.useCase}
											</p>
										{/if}

										{#if template.variables && template.variables.length > 0}
											<div class="template-vars">
												<span class="vars-label">Variables:</span>
												{#each template.variables as variable}
													<span class="var-badge">{`{{${variable.name}}}`}</span>
												{/each}
											</div>
										{/if}

										{#if !isBuiltIn && template.updatedAt}
											<div class="template-meta">
												<span class="meta-item">
													Updated {new Date(template.updatedAt).toLocaleDateString()}
												</span>
											</div>
										{/if}

										<div class="template-actions">
											{#if isBuiltIn}
												<!-- Built-in: only duplicate -->
												<button class="action-btn duplicate" onclick={() => handleDuplicate(template)} title="Duplicate to customize">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
													</svg>
												</button>
											{:else}
												<!-- User template: edit, duplicate, export, delete -->
												<button class="action-btn edit" onclick={() => handleEdit(template as UserTemplate)} title="Edit">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
													</svg>
												</button>
												<button class="action-btn duplicate" onclick={() => handleDuplicate(template)} title="Duplicate">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
													</svg>
												</button>
												<button class="action-btn export" onclick={() => handleExport(template)} title="Export">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
													</svg>
												</button>
												{#if deleteConfirmId === template.id}
													<button class="action-btn confirm-delete" onclick={() => handleDelete(template.id)} disabled={isDeleting}>
														{isDeleting ? '...' : 'Confirm'}
													</button>
													<button class="action-btn cancel-delete" onclick={() => (deleteConfirmId = null)}>
														Cancel
													</button>
												{:else}
													<button class="action-btn delete" onclick={() => (deleteConfirmId = template.id)} title="Delete">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
															<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
														</svg>
													</button>
												{/if}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<!-- Editor Drawer -->
{#if isEditorOpen}
	<div class="drawer-overlay" onclick={handleClose} transition:fade={{ duration: 150 }}></div>
	<div class="drawer" transition:slide={{ axis: 'x', duration: 200 }}>
		<div class="drawer-header">
			<h3>{editingTemplate ? 'Edit Template' : 'New Template'}</h3>
			<button class="close-btn" onclick={handleClose}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="drawer-content">
			{#if saveError}
				<div class="save-error" transition:slide>
					{saveError}
				</div>
			{/if}

			<div class="form-grid">
				<!-- Name -->
				<div class="form-field">
					<label for="name">Name <span class="required">*</span></label>
					<input
						type="text"
						id="name"
						bind:value={formData.name}
						onblur={generateId}
						placeholder="My Template"
						required
					/>
				</div>

				<!-- ID -->
				<div class="form-field">
					<label for="id">ID <span class="required">*</span></label>
					<input
						type="text"
						id="id"
						bind:value={formData.id}
						placeholder="my-template"
						disabled={!!editingTemplate}
						required
					/>
					<span class="field-hint">2-64 chars, alphanumeric with hyphens</span>
				</div>

				<!-- Icon -->
				<div class="form-field small">
					<label for="icon">Icon</label>
					<input
						type="text"
						id="icon"
						bind:value={formData.icon}
						placeholder="📄"
						maxlength="4"
					/>
				</div>

				<!-- Category -->
				<div class="form-field">
					<label for="category">Category</label>
					<select id="category" bind:value={formData.category}>
						{#each TEMPLATE_CATEGORIES as cat}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
				</div>

				<!-- Description -->
				<div class="form-field full">
					<label for="description">Description</label>
					<input
						type="text"
						id="description"
						bind:value={formData.description}
						placeholder="Brief description of what this template does"
					/>
				</div>

				<!-- Use Case -->
				<div class="form-field full">
					<label for="useCase">Best For</label>
					<input
						type="text"
						id="useCase"
						bind:value={formData.useCase}
						placeholder="When to use this template"
					/>
				</div>

				<!-- Content -->
				<div class="form-field full">
					<label for="content">Content <span class="required">*</span></label>
					<textarea
						id="content"
						bind:value={formData.content}
						placeholder={`# Template Content\n\nUse {{variableName}} for placeholders`}
						rows="12"
						required
					></textarea>
					<span class="field-hint">Use {`{{variableName}}`} for placeholders</span>
				</div>

				<!-- Variables -->
				<div class="form-field full">
					<div class="vars-header">
						<label>Variables</label>
						<button type="button" class="add-var-btn" onclick={addVariable}>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							Add Variable
						</button>
					</div>

					{#each formData.variables as variable, index}
						<div class="var-row" transition:slide>
							<input
								type="text"
								bind:value={variable.name}
								placeholder="name"
								class="var-name"
							/>
							<input
								type="text"
								bind:value={variable.label}
								placeholder="Label"
								class="var-label"
							/>
							<input
								type="text"
								bind:value={variable.placeholder}
								placeholder="Placeholder"
								class="var-placeholder"
							/>
							<label class="var-required">
								<input type="checkbox" bind:checked={variable.required} />
								Req
							</label>
							<button type="button" class="remove-var-btn" onclick={() => removeVariable(index)}>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="drawer-footer">
			<button class="cancel-btn" onclick={handleClose} disabled={isSaving}>
				Cancel
			</button>
			<button
				class="save-btn"
				onclick={handleSave}
				disabled={isSaving || !formData.id || !formData.name || !formData.content}
			>
				{#if isSaving}
					<div class="btn-spinner"></div>
					Saving...
				{:else}
					{editingTemplate ? 'Save Changes' : 'Create Template'}
				{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.templates-editor {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Header */
	.templates-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.section-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.section-desc {
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		margin: 0.25rem 0 0;
	}

	.section-desc code {
		background: oklch(0.20 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.section-desc :global(.link-inline) {
		color: oklch(0.70 0.15 220);
		text-decoration: underline;
		text-decoration-color: oklch(0.70 0.15 220 / 0.3);
		text-underline-offset: 2px;
	}

	.section-desc :global(.link-inline:hover) {
		color: oklch(0.80 0.15 220);
		text-decoration-color: oklch(0.80 0.15 220 / 0.6);
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.add-btn,
	.import-btn,
	.export-all-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		font-size: 0.8rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.add-btn {
		background: oklch(0.45 0.15 145);
		border: 1px solid oklch(0.50 0.18 145);
		color: oklch(0.98 0.01 145);
	}

	.add-btn:hover {
		background: oklch(0.50 0.18 145);
	}

	.import-btn,
	.export-all-btn {
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.import-btn:hover,
	.export-all-btn:hover {
		background: oklch(0.26 0.02 250);
	}

	.btn-icon {
		width: 16px;
		height: 16px;
	}

	.hidden {
		display: none;
	}

	/* Templates count */
	.templates-count {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
	}

	/* Import error */
	.import-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: oklch(0.25 0.08 25);
		border: 1px solid oklch(0.40 0.12 25);
		border-radius: 6px;
		color: oklch(0.85 0.08 25);
		font-size: 0.8rem;
	}

	.import-error button {
		background: none;
		border: none;
		color: oklch(0.70 0.08 25);
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
	}

	/* Categories */
	.categories-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.category-section {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 8px;
		overflow: hidden;
	}

	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
		color: inherit;
		text-align: left;
	}

	.category-header:hover {
		background: oklch(0.20 0.02 250);
	}

	.category-left {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-width: 0;
	}

	.category-icon {
		width: 20px;
		height: 20px;
		color: oklch(0.65 0.10 200);
		flex-shrink: 0;
	}

	.category-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.category-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
	}

	.category-count {
		font-size: 0.65rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.25 0.02 250);
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
	}

	.category-desc {
		font-size: 0.7rem;
		color: oklch(0.45 0.02 250);
		margin-left: 0.5rem;
	}

	.chevron-icon {
		width: 16px;
		height: 16px;
		color: oklch(0.50 0.02 250);
		transition: transform 0.2s ease;
		flex-shrink: 0;
	}

	.chevron-icon.expanded {
		transform: rotate(180deg);
	}

	/* Templates grid */
	.templates-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 0.75rem;
		padding: 0 0.75rem 0.75rem;
	}

	/* Template card */
	.template-card {
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: border-color 0.15s ease;
	}

	.template-card:hover {
		border-color: oklch(0.40 0.08 270);
	}

	.template-card.built-in {
		opacity: 0.85;
	}

	.template-card.built-in:hover {
		opacity: 1;
	}

	.template-header {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.template-icon {
		font-size: 1.5rem;
		line-height: 1;
	}

	.template-info {
		flex: 1;
		min-width: 0;
	}

	.template-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.template-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.badge {
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		font-weight: 500;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.badge-builtin {
		background: oklch(0.25 0.06 250);
		color: oklch(0.60 0.08 250);
	}

	.badge-custom {
		background: oklch(0.25 0.08 280);
		color: oklch(0.70 0.12 280);
	}

	.template-id {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}

	.template-desc {
		font-size: 0.8rem;
		color: oklch(0.65 0.02 250);
		margin: 0;
		line-height: 1.4;
	}

	.template-use-case {
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.use-case-label {
		color: oklch(0.50 0.02 250);
	}

	.template-vars {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		align-items: center;
	}

	.vars-label {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
	}

	.var-badge {
		font-size: 0.65rem;
		background: oklch(0.25 0.08 200);
		color: oklch(0.80 0.08 200);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
	}

	.template-meta {
		font-size: 0.7rem;
		color: oklch(0.45 0.02 250);
	}

	.template-actions {
		display: flex;
		gap: 0.375rem;
		margin-top: auto;
		padding-top: 0.75rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: oklch(0.22 0.02 250);
		color: oklch(0.65 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn svg {
		width: 16px;
		height: 16px;
	}

	.action-btn:hover {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.action-btn.delete:hover {
		background: oklch(0.30 0.10 25);
		color: oklch(0.80 0.12 25);
		border-color: oklch(0.40 0.12 25);
	}

	.action-btn.confirm-delete,
	.action-btn.cancel-delete {
		width: auto;
		padding: 0 0.5rem;
		font-size: 0.7rem;
	}

	.action-btn.confirm-delete {
		background: oklch(0.45 0.15 25);
		color: white;
	}

	.action-btn.cancel-delete {
		background: oklch(0.25 0.02 250);
	}

	/* Loading/Error states */
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 0.75rem;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.error-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.60 0.12 25);
	}

	.error-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.65 0.02 250);
		margin: 0;
	}

	.error-message {
		font-size: 0.8rem;
		color: oklch(0.50 0.02 250);
		margin: 0;
	}

	.retry-btn {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background: oklch(0.30 0.08 200);
		border: 1px solid oklch(0.40 0.10 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		font-size: 0.8rem;
		cursor: pointer;
	}

	/* Drawer */
	.drawer-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.10 0.02 250 / 0.7);
		z-index: 100;
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		max-width: 560px;
		background: oklch(0.16 0.02 250);
		border-left: 1px solid oklch(0.28 0.02 250);
		z-index: 101;
		display: flex;
		flex-direction: column;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.drawer-header h3 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: oklch(0.22 0.02 250);
		border-radius: 6px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
	}

	.close-btn:hover {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.close-btn svg {
		width: 18px;
		height: 18px;
	}

	.drawer-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.25rem;
	}

	.save-error {
		background: oklch(0.25 0.08 25);
		border: 1px solid oklch(0.40 0.12 25);
		color: oklch(0.85 0.08 25);
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.8rem;
		margin-bottom: 1rem;
	}

	/* Form */
	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field.full {
		grid-column: 1 / -1;
	}

	.form-field.small {
		max-width: 100px;
	}

	.form-field label {
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.70 0.02 250);
	}

	.required {
		color: oklch(0.65 0.15 25);
	}

	.form-field input,
	.form-field textarea,
	.form-field select {
		padding: 0.5rem 0.75rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		color: oklch(0.90 0.02 250);
		font-size: 0.85rem;
		font-family: ui-monospace, monospace;
	}

	.form-field input:focus,
	.form-field textarea:focus,
	.form-field select:focus {
		outline: none;
		border-color: oklch(0.50 0.15 200);
	}

	.form-field input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-field textarea {
		resize: vertical;
		min-height: 200px;
	}

	.field-hint {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
	}

	/* Variables section */
	.vars-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.add-var-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 4px;
		color: oklch(0.70 0.02 250);
		font-size: 0.7rem;
		cursor: pointer;
	}

	.add-var-btn svg {
		width: 14px;
		height: 14px;
	}

	.var-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.var-row input {
		padding: 0.375rem 0.5rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 4px;
		color: oklch(0.90 0.02 250);
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
	}

	.var-name {
		width: 100px;
	}

	.var-label {
		flex: 1;
	}

	.var-placeholder {
		flex: 1;
	}

	.var-required {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: oklch(0.60 0.02 250);
		white-space: nowrap;
	}

	.var-required input {
		width: auto;
	}

	.remove-var-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: oklch(0.22 0.02 250);
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
	}

	.remove-var-btn:hover {
		background: oklch(0.30 0.10 25);
		color: oklch(0.80 0.12 25);
	}

	.remove-var-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Drawer footer */
	.drawer-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.14 0.02 250);
	}

	.cancel-btn,
	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cancel-btn {
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.cancel-btn:hover:not(:disabled) {
		background: oklch(0.26 0.02 250);
	}

	.save-btn {
		background: oklch(0.45 0.15 145);
		border: 1px solid oklch(0.50 0.18 145);
		color: oklch(0.98 0.01 145);
	}

	.save-btn:hover:not(:disabled) {
		background: oklch(0.50 0.18 145);
	}

	.save-btn:disabled,
	.cancel-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.80 0.02 145);
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
</style>
