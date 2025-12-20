<script lang="ts">
	import type { SlashCommand, CommandFrontmatter } from '$lib/types/config';
	import { onMount, onDestroy } from 'svelte';
	import loader from '@monaco-editor/loader';
	import { marked } from 'marked';
	import {
		validateYamlFrontmatter,
		setEditorMarkers,
		clearEditorMarkers,
		type ValidationResult,
		MarkerSeverity
	} from '$lib/utils/editorValidation';
	import CommandTemplates from './CommandTemplates.svelte';
	import {
		COMMAND_TEMPLATES,
		applyTemplate,
		getTemplateVariables,
		getDefaultVariableValues,
		validateVariables,
		substituteVariables,
		type CommandTemplate,
		type TemplateVariable
	} from '$lib/config/commandTemplates';
	import {
		getShortcut,
		setShortcut,
		validateShortcut,
		checkShortcutConflict,
		findCommandWithShortcut,
		getDisplayShortcut
	} from '$lib/stores/keyboardShortcuts.svelte';

	// Configure marked for safe rendering
	marked.setOptions({
		breaks: true,
		gfm: true
	});

	// Props
	let {
		isOpen = $bindable(false),
		command = null as SlashCommand | null,
		onSave = (_command: SlashCommand) => {},
		onClose = () => {}
	}: {
		isOpen?: boolean;
		command?: SlashCommand | null;
		onSave?: (command: SlashCommand) => void;
		onClose?: () => void;
	} = $props();

	// State
	let isCreateMode = $derived(!command);
	let namespace = $state('local');
	let name = $state('');
	let description = $state('');
	let author = $state('');
	let version = $state('');
	let tags = $state('');
	let shortcut = $state('');
	let shortcutError = $state('');
	let shortcutWarning = $state('');
	let content = $state('');
	let loading = $state(false);
	let saving = $state(false);
	let error = $state('');
	let success = $state('');

	// Template selection state (for create mode)
	let showTemplateStep = $state(true);
	let showVariablesStep = $state(false);
	let selectedTemplate = $state<CommandTemplate | null>(null);
	let templateVariables = $state<TemplateVariable[]>([]);
	let variableValues = $state<Record<string, string>>({});
	let variableErrors = $state<string[]>([]);
	let showPreview = $state(true);

	// Real-time preview of template with variable substitutions

	let templatePreview = $derived.by(() => {
		if (!selectedTemplate) return '';
		return substituteVariables(selectedTemplate.content, variableValues);
	});

	// HTML-escaped preview with highlighting for unfilled variables
	let templatePreviewHtml = $derived.by(() => {
		if (!templatePreview) return '';
		// Escape HTML entities first to prevent XSS
		const escaped = templatePreview
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
		// Highlight remaining unfilled variables
		return escaped.replace(
			/\{\{([^}]+)\}\}/g,
			'<span class="text-warning bg-warning/10 px-1 rounded">{{$1}}</span>'
		);
	});

	// Validation state
	let validation = $state<ValidationResult | null>(null);
	let validationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Monaco
	let editorContainer = $state<HTMLDivElement | null>(null);
	let previewContainer = $state<HTMLDivElement | null>(null);
	let editor = $state<any>(null);
	let monaco = $state<any>(null);

	// View mode: 'edit' | 'split' | 'preview'
	type ViewMode = 'edit' | 'split' | 'preview';
	let viewMode = $state<ViewMode>('edit');

	// Rendered markdown content (stripped of frontmatter)
	let renderedMarkdown = $derived.by(() => {
		// Remove frontmatter for preview
		const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '');
		try {
			return marked.parse(contentWithoutFrontmatter);
		} catch {
			return '<p class="text-error">Error rendering markdown</p>';
		}
	});

	// Scroll sync state
	let isSyncingScroll = false;

	// Available namespaces
	const namespaces = [
		{ value: 'local', label: 'Local (project)' },
		{ value: 'jat', label: 'JAT' },
		{ value: 'git', label: 'Git' }
	];

	// Load command content when editing
	$effect(() => {
		if (isOpen && command) {
			loadCommandContent();
			showTemplateStep = false; // Skip template step for edit mode
		} else if (isOpen && !command) {
			// Reset form for create mode
			namespace = 'local';
			name = '';
			description = '';
			author = '';
			version = '';
			tags = '';
			shortcut = '';
			shortcutError = '';
			shortcutWarning = '';
			showTemplateStep = true; // Show template picker first
			showVariablesStep = false;
			selectedTemplate = null;
			templateVariables = [];
			variableValues = {};
			variableErrors = [];
			content = `---
description:
author:
version: 1.0.0
tags:
---

# Command Title

Command content here...
`;
			if (editor) {
				editor.setValue(content);
				validateContent(content);
			}
		}
	});

	// Handle template selection
	function handleTemplateSelect(template: CommandTemplate) {
		selectedTemplate = template;
		// Apply template frontmatter defaults
		description = template.frontmatter.description || '';
		author = template.frontmatter.author || '';
		version = template.frontmatter.version || '1.0.0';
		tags = template.frontmatter.tags || '';

		// Initialize variables for this template
		templateVariables = getTemplateVariables(template);
		variableValues = getDefaultVariableValues(template);
		variableErrors = [];
	}

	// Proceed from template selection - show variables step if needed
	function proceedFromTemplateStep() {
		if (!selectedTemplate) return;

		// If template has variables, show variables step
		if (templateVariables.length > 0) {
			showTemplateStep = false;
			showVariablesStep = true;
		} else {
			// No variables, go directly to editor
			applySelectedTemplate();
		}
	}

	// Apply selected template and move to editor step
	function applySelectedTemplate() {
		if (selectedTemplate) {
			// Validate required variables
			const validation = validateVariables(selectedTemplate, variableValues);
			if (!validation.valid) {
				variableErrors = validation.missing;
				return;
			}

			content = applyTemplate(
				selectedTemplate,
				{
					namespace,
					name: name || 'command',
					description
				},
				variableValues
			);
		}
		showTemplateStep = false;
		showVariablesStep = false;

		// Update editor if already initialized
		if (editor) {
			editor.setValue(content);
			validateContent(content);
		}
	}

	// Go back to template selection from variables step
	function backToTemplatesFromVariables() {
		showVariablesStep = false;
		showTemplateStep = true;
	}

	// Skip template selection and use default
	function skipTemplate() {
		showTemplateStep = false;
		// Content already has default value
		if (editor) {
			validateContent(content);
		}
	}

	// Go back to template selection
	function backToTemplates() {
		showTemplateStep = true;
	}

	async function loadCommandContent() {
		if (!command) return;
		loading = true;
		error = '';

		try {
			const res = await fetch(`/api/commands/${command.namespace}/${command.name}`);
			if (!res.ok) throw new Error('Failed to load command');
			const data = await res.json();

			content = data.content || '';
			namespace = command.namespace;
			name = command.name;

			// Parse frontmatter
			if (command.frontmatter) {
				description = command.frontmatter.description || '';
				author = command.frontmatter.author || '';
				version = command.frontmatter.version || '';
				tags = Array.isArray(command.frontmatter.tags)
					? command.frontmatter.tags.join(', ')
					: command.frontmatter.tags || '';
			}

			// Load keyboard shortcut from store
			shortcut = getShortcut(command.invocation) || '';
			shortcutError = '';
			shortcutWarning = '';

			// Editor sync is handled by the content sync $effect
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load command';
		} finally {
			loading = false;
		}
	}

	// Validate content and update Monaco markers
	function validateContent(editorContent: string) {
		if (!monaco || !editor) return;

		// Clear previous debounce timer
		if (validationDebounceTimer) {
			clearTimeout(validationDebounceTimer);
		}

		// Debounce validation to avoid excessive processing
		validationDebounceTimer = setTimeout(() => {
			const model = editor.getModel();
			if (!model) return;

			const result = validateYamlFrontmatter(editorContent);
			validation = result;

			// Apply markers to Monaco editor
			setEditorMarkers(monaco, model, result.markers, 'yaml-validation');
		}, 300);
	}

	// Initialize Monaco - preload on mount
	onMount(async () => {
		try {
			monaco = await loader.init();
		} catch (e) {
			console.error('Failed to load Monaco:', e);
			error = 'Failed to load editor';
		}
	});

	// Track if editor needs content sync (for when content loads after editor init)
	let pendingContentSync = $state(false);

	// Initialize editor when container becomes available and in DOM
	$effect(() => {
		// Ensure container is actually in the DOM (has parent node)
		if (monaco && editorContainer && editorContainer.parentNode && !editor && !loading) {
			editor = monaco.editor.create(editorContainer, {
				value: content,
				language: 'markdown',
				theme: 'vs-dark',
				minimap: { enabled: false },
				wordWrap: 'on',
				lineNumbers: 'on',
				fontSize: 14,
				tabSize: 2,
				scrollBeyondLastLine: false,
				automaticLayout: true,
				padding: { top: 16, bottom: 16 },
				// Enable error gutter (shows colored squiggles)
				glyphMargin: true
			});

			// Track content changes and validate
			editor.onDidChangeModelContent(() => {
				content = editor.getValue();
				validateContent(content);
			});

			// Keyboard shortcut for save
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
				handleSave();
			});

			// Scroll sync listener
			editor.onDidScrollChange(handleEditorScroll);

			// Initial validation if content exists
			if (content) {
				validateContent(content);
			}

			// Check if we had pending content
			if (pendingContentSync) {
				pendingContentSync = false;
			}
		}
	});

	// Sync content to editor when content changes and editor exists
	$effect(() => {
		if (editor && content !== undefined) {
			const currentValue = editor.getValue();
			if (currentValue !== content) {
				editor.setValue(content);
				validateContent(content);
			}
		}
	});

	onDestroy(() => {
		if (validationDebounceTimer) {
			clearTimeout(validationDebounceTimer);
		}
		if (editor) {
			editor.dispose();
		}
	});

	// Scroll sync: editor -> preview
	function handleEditorScroll() {
		if (isSyncingScroll || !previewContainer || !editor || viewMode !== 'split') return;
		isSyncingScroll = true;

		const scrollInfo = editor.getScrollTop();
		const maxScroll = editor.getScrollHeight() - editor.getLayoutInfo().height;
		const scrollPercent = maxScroll > 0 ? scrollInfo / maxScroll : 0;

		const previewMaxScroll = previewContainer.scrollHeight - previewContainer.clientHeight;
		previewContainer.scrollTop = scrollPercent * previewMaxScroll;

		requestAnimationFrame(() => {
			isSyncingScroll = false;
		});
	}

	// Scroll sync: preview -> editor
	function handlePreviewScroll() {
		if (isSyncingScroll || !previewContainer || !editor || viewMode !== 'split') return;
		isSyncingScroll = true;

		const scrollPercent =
			previewContainer.scrollHeight - previewContainer.clientHeight > 0
				? previewContainer.scrollTop /
					(previewContainer.scrollHeight - previewContainer.clientHeight)
				: 0;

		const maxScroll = editor.getScrollHeight() - editor.getLayoutInfo().height;
		editor.setScrollTop(scrollPercent * maxScroll);

		requestAnimationFrame(() => {
			isSyncingScroll = false;
		});
	}

	// Validate shortcut input
	function validateShortcutInput() {
		shortcutError = '';
		shortcutWarning = '';

		if (!shortcut.trim()) return;

		// Validate format
		const validationError = validateShortcut(shortcut);
		if (validationError) {
			shortcutError = validationError;
			return;
		}

		// Check for browser conflicts
		const conflictWarning = checkShortcutConflict(shortcut);
		if (conflictWarning) {
			shortcutWarning = conflictWarning;
		}

		// Check if shortcut is already assigned to another command
		const currentInvocation = isCreateMode
			? `/${namespace}:${name.trim()}`
			: command?.invocation || '';
		const existingCommand = findCommandWithShortcut(shortcut);
		if (existingCommand && existingCommand !== currentInvocation) {
			shortcutError = `Shortcut already assigned to ${existingCommand}`;
		}
	}

	// Build frontmatter from fields
	function buildFrontmatter(): string {
		const lines = ['---'];
		if (description) lines.push(`description: ${description}`);
		if (author) lines.push(`author: ${author}`);
		if (version) lines.push(`version: ${version}`);
		if (tags) lines.push(`tags: ${tags}`);
		lines.push('---');
		return lines.join('\n');
	}

	// Update content with new frontmatter
	function updateFrontmatter() {
		const currentContent = editor?.getValue() || content;
		// Remove existing frontmatter
		const withoutFrontmatter = currentContent.replace(/^---[\s\S]*?---\n?/, '');
		const newContent = buildFrontmatter() + '\n\n' + withoutFrontmatter.trimStart();
		if (editor) {
			editor.setValue(newContent);
		}
		content = newContent;
	}

	async function handleSave() {
		if (isCreateMode && !name.trim()) {
			error = 'Command name is required';
			return;
		}

		// Check for validation errors (block save on critical errors)
		if (validation?.hasErrors) {
			error = `Cannot save: ${validation.errorCount} syntax error${validation.errorCount > 1 ? 's' : ''} found. Fix errors to continue.`;
			return;
		}

		// Check for shortcut errors
		if (shortcutError) {
			error = `Cannot save: ${shortcutError}`;
			return;
		}

		saving = true;
		error = '';
		success = '';

		try {
			// Update frontmatter before saving
			updateFrontmatter();

			if (isCreateMode) {
				// Create new command
				const res = await fetch('/api/commands', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						namespace,
						name: name.trim(),
						content
					})
				});

				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.error || 'Failed to create command');
				}

				success = 'Command created successfully';
			} else {
				// Update existing command
				const res = await fetch(`/api/commands/${command!.namespace}/${command!.name}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content })
				});

				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.error || 'Failed to save command');
				}

				success = 'Command saved successfully';
			}

			// Build the invocation for shortcut storage
			const commandInvocation = `/${isCreateMode ? namespace : command!.namespace}:${isCreateMode ? name.trim() : command!.name}`;

			// Save keyboard shortcut to localStorage store
			setShortcut(commandInvocation, shortcut.trim() || undefined);

			// Create the saved command object
			const savedCommand: SlashCommand = {
				name: isCreateMode ? name.trim() : command!.name,
				namespace: isCreateMode ? namespace : command!.namespace,
				invocation: commandInvocation,
				path: isCreateMode ? '' : command!.path,
				content,
				frontmatter: {
					description: description || undefined,
					author: author || undefined,
					version: version || undefined,
					tags: tags || undefined,
					shortcut: shortcut.trim() || undefined
				}
			};
			onSave(savedCommand);
			setTimeout(() => {
				handleClose();
			}, 1000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}

	function handleClose() {
		isOpen = false;
		error = '';
		success = '';
		onClose();
	}

	// Keyboard handler for Escape
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			handleClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Drawer -->
<div class="drawer drawer-end z-50">
	<input
		id="command-editor-drawer"
		type="checkbox"
		class="drawer-toggle"
		checked={isOpen}
		onchange={() => {
			if (!isOpen) handleClose();
		}}
	/>

	<div class="drawer-side">
		<!-- Overlay -->
		<label
			class="drawer-overlay"
			onclick={handleClose}
			aria-label="Close editor"
		></label>

		<!-- Drawer content -->
		<div
			class="flex h-full w-[800px] max-w-[90vw] flex-col bg-base-200"
			style="border-left: 1px solid oklch(0.3 0.02 250);"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b px-6 py-4"
				style="border-color: oklch(0.3 0.02 250); background: oklch(0.18 0.02 250);"
			>
				<div class="flex items-center gap-3">
					<span class="text-2xl">📝</span>
					<div>
						<h2 class="text-lg font-semibold text-base-content">
							{isCreateMode ? 'Create Command' : 'Edit Command'}
						</h2>
						{#if command}
							<p class="text-sm opacity-70">{command.invocation}</p>
						{/if}
					</div>
				</div>
				<button class="btn btn-ghost btn-sm" onclick={handleClose}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="flex flex-1 flex-col overflow-hidden p-6">
				{#if loading}
					<div class="flex h-full items-center justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{:else}
					<!-- Alerts -->
					{#if error}
						<div class="alert alert-error mb-4">
							<span>{error}</span>
						</div>
					{/if}

					{#if success}
						<div class="alert alert-success mb-4">
							<span>{success}</span>
						</div>
					{/if}

					<!-- Template Selection Step (Create Mode Only) -->
					{#if isCreateMode && showTemplateStep}
						<!-- Basic info first -->
						<div class="mb-6 grid grid-cols-2 gap-4">
							<div class="form-control">
								<label class="label" for="namespace-template">
									<span class="label-text font-medium">Namespace</span>
								</label>
								<select
									id="namespace-template"
									class="select select-bordered"
									bind:value={namespace}
								>
									{#each namespaces as ns}
										<option value={ns.value}>{ns.label}</option>
									{/each}
								</select>
							</div>

							<div class="form-control">
								<label class="label" for="name-template">
									<span class="label-text font-medium">Command Name</span>
								</label>
								<input
									id="name-template"
									type="text"
									class="input input-bordered"
									placeholder="my-command"
									bind:value={name}
								/>
							</div>
						</div>

						<!-- Template picker -->
						<CommandTemplates
							bind:selectedTemplate
							onSelect={handleTemplateSelect}
						/>

						<!-- Template step actions -->
						<div class="mt-6 flex justify-between">
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={skipTemplate}
							>
								Skip, start from scratch
							</button>
							<button
								type="button"
								class="btn btn-primary btn-sm"
								onclick={proceedFromTemplateStep}
								disabled={!selectedTemplate}
							>
								{selectedTemplate
									? templateVariables.length > 0
										? `Configure ${selectedTemplate.name}`
										: `Use ${selectedTemplate.name} Template`
									: 'Select a template'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="ml-1 h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</button>
						</div>
					{:else if isCreateMode && showVariablesStep}
						<!-- Variables Step -->
						<div class="flex flex-1 flex-col overflow-hidden">
							<div class="mb-4 shrink-0 flex items-center gap-2">
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={backToTemplatesFromVariables}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mr-1 h-3 w-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15 19l-7-7 7-7"
										/>
									</svg>
									Change template
								</button>
								{#if selectedTemplate}
									<span class="badge badge-sm badge-ghost">
										{selectedTemplate.icon} {selectedTemplate.name}
									</span>
								{/if}
							</div>

							<!-- Variables Section - shrinks to fit content -->
							<div class="shrink-0">
								<h3 class="mb-4 text-lg font-medium text-base-content">
									Configure Template Variables
								</h3>
								<p class="mb-4 text-sm opacity-70">
									Fill in the values below to customize your command template.
								</p>

								{#if variableErrors.length > 0}
									<div class="alert alert-error mb-4">
										<span>Please fill in required fields: {variableErrors.map(name =>
											templateVariables.find(v => v.name === name)?.label || name
										).join(', ')}</span>
									</div>
								{/if}

								<div class="space-y-3">
									{#each templateVariables as variable}
										<div class="form-control">
											<label class="label py-1" for={`var-${variable.name}`}>
												<span class="label-text font-medium">
													{variable.label}
													{#if variable.required}
														<span class="text-error">*</span>
													{/if}
												</span>
											</label>
											{#if variable.multiline}
												<textarea
													id={`var-${variable.name}`}
													class="textarea textarea-bordered textarea-sm"
													class:textarea-error={variableErrors.includes(variable.name)}
													placeholder={variable.placeholder || ''}
													rows="2"
													bind:value={variableValues[variable.name]}
													oninput={() => {
														// Clear error for this field when user types
														variableErrors = variableErrors.filter(e => e !== variable.name);
													}}
												></textarea>
											{:else}
												<input
													id={`var-${variable.name}`}
													type="text"
													class="input input-bordered input-sm"
													class:input-error={variableErrors.includes(variable.name)}
													placeholder={variable.placeholder || ''}
													bind:value={variableValues[variable.name]}
													oninput={() => {
														// Clear error for this field when user types
														variableErrors = variableErrors.filter(e => e !== variable.name);
													}}
												/>
											{/if}
											{#if variable.hint}
												<label class="label py-0.5">
													<span class="label-text-alt opacity-70">{variable.hint}</span>
												</label>
											{/if}
										</div>
									{/each}
								</div>
							</div>

							<!-- Template Preview Section - expands to fill remaining space -->
							<div class="mt-4 flex min-h-0 flex-1 flex-col">
								<button
									type="button"
									class="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-base-300/50"
									style="border-color: oklch(0.3 0.02 250); background: oklch(0.18 0.02 250);"
									onclick={() => (showPreview = !showPreview)}
								>
									<div class="flex items-center gap-2">
										<svg
											class="h-5 w-5 opacity-70"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
											/>
										</svg>
										<span class="font-medium">Preview</span>
										<span class="badge badge-sm badge-ghost">Live</span>
									</div>
									<svg
										class="h-4 w-4 transition-transform {showPreview ? 'rotate-180' : ''}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>

								{#if showPreview}
									<div
										class="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border"
										style="border-color: oklch(0.3 0.02 250); background: oklch(0.12 0.02 250);"
									>
										<pre class="whitespace-pre-wrap p-4 text-sm font-mono text-base-content/90">{@html templatePreviewHtml}</pre>
									</div>
									<p class="mt-2 shrink-0 text-xs opacity-50">
										Variables highlighted in <span class="text-warning">yellow</span> will be replaced with your values
									</p>
								{/if}
							</div>

							<!-- Variables step actions -->
							<div class="mt-4 shrink-0 flex justify-between">
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={backToTemplatesFromVariables}
								>
									Back
								</button>
								<button
									type="button"
									class="btn btn-primary btn-sm"
									onclick={applySelectedTemplate}
								>
									Apply Template
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="ml-1 h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5l7 7-7 7"
										/>
									</svg>
								</button>
							</div>
						</div>
					{:else}
						<!-- Editor Step -->

						<!-- Create mode fields (when not in template step) -->
						{#if isCreateMode}
							<div class="mb-4 flex items-center gap-2">
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={backToTemplates}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mr-1 h-3 w-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15 19l-7-7 7-7"
										/>
									</svg>
									Change template
								</button>
								{#if selectedTemplate}
									<span class="badge badge-sm badge-ghost">
										{selectedTemplate.icon} {selectedTemplate.name}
									</span>
								{:else}
									<span class="badge badge-sm badge-ghost">Custom</span>
								{/if}
							</div>
							<div class="mb-6 grid grid-cols-2 gap-4">
								<div class="form-control">
									<label class="label" for="namespace">
										<span class="label-text font-medium">Namespace</span>
									</label>
									<select
										id="namespace"
										class="select select-bordered"
										bind:value={namespace}
									>
										{#each namespaces as ns}
											<option value={ns.value}>{ns.label}</option>
										{/each}
									</select>
								</div>

								<div class="form-control">
									<label class="label" for="name">
										<span class="label-text font-medium">Command Name</span>
									</label>
									<input
										id="name"
										type="text"
										class="input input-bordered"
										placeholder="my-command"
										bind:value={name}
									/>
								</div>
							</div>
						{/if}

						<!-- Frontmatter fields -->
					<div class="mb-6 flex-shrink-0">
						<h3 class="mb-3 font-medium text-base-content">Frontmatter</h3>
						<div class="grid grid-cols-2 gap-4">
							<div class="form-control">
								<label class="label" for="description">
									<span class="label-text">Description</span>
								</label>
								<input
									id="description"
									type="text"
									class="input input-bordered input-sm"
									placeholder="Brief description of the command"
									bind:value={description}
									onblur={updateFrontmatter}
								/>
							</div>

							<div class="form-control">
								<label class="label" for="author">
									<span class="label-text">Author</span>
								</label>
								<input
									id="author"
									type="text"
									class="input input-bordered input-sm"
									placeholder="Your name"
									bind:value={author}
									onblur={updateFrontmatter}
								/>
							</div>

							<div class="form-control">
								<label class="label" for="version">
									<span class="label-text">Version</span>
								</label>
								<input
									id="version"
									type="text"
									class="input input-bordered input-sm"
									placeholder="1.0.0"
									bind:value={version}
									onblur={updateFrontmatter}
								/>
							</div>

							<div class="form-control">
								<label class="label" for="tags">
									<span class="label-text">Tags (comma-separated)</span>
								</label>
								<input
									id="tags"
									type="text"
									class="input input-bordered input-sm"
									placeholder="workflow, agent, git"
									bind:value={tags}
									onblur={updateFrontmatter}
								/>
							</div>
						</div>

						<!-- Keyboard Shortcut (full width, below grid) -->
						<div class="form-control mt-4">
							<label class="label" for="shortcut">
								<span class="label-text">Keyboard Shortcut</span>
								<span class="label-text-alt">e.g., Alt+C, Ctrl+Shift+S</span>
							</label>
							<div class="flex items-center gap-2">
								<input
									id="shortcut"
									type="text"
									class="input input-bordered input-sm flex-1"
									class:input-error={shortcutError}
									class:input-warning={shortcutWarning && !shortcutError}
									placeholder="Alt+C"
									bind:value={shortcut}
									onblur={validateShortcutInput}
									oninput={validateShortcutInput}
								/>
								{#if shortcut && !shortcutError}
									<kbd class="kbd kbd-sm">{getDisplayShortcut(shortcut)}</kbd>
								{/if}
							</div>
							{#if shortcutError}
								<label class="label">
									<span class="label-text-alt text-error">{shortcutError}</span>
								</label>
							{:else if shortcutWarning}
								<label class="label">
									<span class="label-text-alt text-warning">{shortcutWarning}</span>
								</label>
							{:else}
								<label class="label">
									<span class="label-text-alt opacity-60">Must include Alt, Ctrl, or Meta/Cmd modifier</span>
								</label>
							{/if}
						</div>
					</div>

					<!-- Editor header with view toggle -->
					<div class="form-control flex min-h-0 flex-1 flex-col">
						<div class="label flex items-center justify-between">
							<span class="label-text font-medium">Command Content (Markdown)</span>
							<div class="flex items-center gap-2">
								<span class="label-text-alt opacity-60">Cmd+S to save</span>
								<!-- View mode toggle -->
								<div class="join">
									<button
										type="button"
										class="btn btn-xs join-item {viewMode === 'edit' ? 'btn-primary' : 'btn-ghost'}"
										onclick={() => (viewMode = 'edit')}
										title="Edit only"
									>
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
										</svg>
									</button>
									<button
										type="button"
										class="btn btn-xs join-item {viewMode === 'split' ? 'btn-primary' : 'btn-ghost'}"
										onclick={() => (viewMode = 'split')}
										title="Split view"
									>
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
										</svg>
									</button>
									<button
										type="button"
										class="btn btn-xs join-item {viewMode === 'preview' ? 'btn-primary' : 'btn-ghost'}"
										onclick={() => (viewMode = 'preview')}
										title="Preview only"
									>
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
									</button>
								</div>
							</div>
						</div>

						<!-- Split view container -->
						<div
							class="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-t-lg border border-b-0"
							style="border-color: oklch(0.3 0.02 250);"
						>
							<!-- Monaco editor pane - always in DOM, hidden via CSS when preview-only -->
							<div
								bind:this={editorContainer}
								class="h-full {viewMode === 'preview' ? 'hidden' : ''} {viewMode === 'split' ? 'w-1/2 border-r' : 'w-full'}"
								style="border-color: oklch(0.3 0.02 250);"
							></div>

							<!-- Preview pane -->
							{#if viewMode !== 'edit'}
								<div
									bind:this={previewContainer}
									class="h-full overflow-y-auto {viewMode === 'split' ? 'w-1/2' : 'w-full'}"
									style="background: oklch(0.15 0.02 250);"
									onscroll={handlePreviewScroll}
								>
									<article class="prose prose-invert prose-sm max-w-none p-4">
										{@html renderedMarkdown}
									</article>
								</div>
							{/if}
						</div>

						<!-- Validation status bar -->
						<div
							class="flex items-center justify-between gap-2 rounded-b-lg border px-3 py-1.5 text-xs"
							style="border-color: oklch(0.3 0.02 250); background: oklch(0.15 0.02 250);"
						>
							<div class="flex items-center gap-3">
								{#if validation?.hasErrors}
									<span class="flex items-center gap-1 text-error">
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										{validation.errorCount} error{validation.errorCount > 1 ? 's' : ''}
									</span>
								{/if}
								{#if validation?.hasWarnings}
									<span class="flex items-center gap-1 text-warning">
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
										</svg>
										{validation.warningCount} warning{validation.warningCount > 1 ? 's' : ''}
									</span>
								{/if}
								{#if validation && !validation.hasErrors && !validation.hasWarnings}
									<span class="flex items-center gap-1 text-success">
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
										No issues
									</span>
								{/if}
								{#if !validation}
									<span class="opacity-50">Validating...</span>
								{/if}
							</div>
							<span class="opacity-50">
								{viewMode === 'edit' ? 'YAML frontmatter' : viewMode === 'split' ? 'Split view' : 'Preview'}
							</span>
						</div>
					</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="flex items-center justify-end gap-3 border-t px-6 py-4"
				style="border-color: oklch(0.3 0.02 250); background: oklch(0.18 0.02 250);"
			>
				{#if isCreateMode && showTemplateStep}
					<!-- Template step footer -->
					<button class="btn btn-ghost" onclick={handleClose}>Cancel</button>
				{:else if isCreateMode && showVariablesStep}
					<!-- Variables step footer -->
					<button class="btn btn-ghost" onclick={handleClose}>Cancel</button>
				{:else}
					<!-- Editor step footer -->
					<button class="btn btn-ghost" onclick={handleClose} disabled={saving}>Cancel</button>
					<button
						class="btn btn-primary"
						onclick={handleSave}
						disabled={saving || loading || validation?.hasErrors}
						title={validation?.hasErrors ? 'Fix syntax errors before saving' : ''}
					>
						{#if saving}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
						{isCreateMode ? 'Create Command' : 'Save Changes'}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
