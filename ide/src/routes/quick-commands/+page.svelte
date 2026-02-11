<script lang="ts">
	/**
	 * Quick Commands Page
	 *
	 * Run single-turn agent commands and manage reusable templates.
	 * Route: /quick-commands
	 */

	import { onMount } from 'svelte';
	import { openTaskDrawer } from '$lib/stores/drawerStore';

	// --- Types ---
	type OutputAction = 'display' | 'clipboard' | 'write_file' | 'create_task';

	interface TemplateVariable {
		name: string;
		label: string;
		default?: string;
		placeholder?: string;
	}

	interface Template {
		id: string;
		name: string;
		prompt: string;
		defaultProject: string | null;
		defaultModel: string;
		variables: TemplateVariable[];
		outputAction?: OutputAction;
		createdAt: string;
		updatedAt?: string;
	}

	interface ExecutionResult {
		id: string;
		prompt: string;
		result: string;
		model: string;
		project: string;
		durationMs: number;
		timestamp: string;
		templateName?: string;
		outputAction?: OutputAction;
		error?: string;
		resolvedFiles?: Array<{ path: string; size: number }>;
		fileErrors?: string[];
		resolvedProviders?: Array<{ type: string; ref: string; size: number }>;
		providerErrors?: string[];
	}

	interface Project {
		key: string;
		name: string;
	}

	// --- State ---
	let templates = $state<Template[]>([]);
	let projects = $state<Project[]>([]);
	let history = $state<ExecutionResult[]>([]);
	let isLoading = $state(true);

	// Command input state
	let commandPrompt = $state('');
	let selectedProject = $state('jat');
	let selectedModel = $state('haiku');
	let isExecuting = $state(false);
	let executionResult = $state<ExecutionResult | null>(null);

	// Template run state (when a template with variables is being run)
	let runningTemplate = $state<Template | null>(null);
	let variableValues = $state<Record<string, string>>({});

	// Template editor state
	let editingTemplate = $state<Template | null>(null);
	let showTemplateEditor = $state(false);
	let editorName = $state('');
	let editorPrompt = $state('');
	let editorProject = $state('');
	let editorModel = $state('haiku');
	let editorOutputAction = $state<OutputAction>('display');
	let editorVariables = $state<TemplateVariable[]>([]);
	let editorSaving = $state(false);
	let editorError = $state('');

	// Save-as-template state
	let showSaveAsTemplate = $state(false);
	let saveTemplateName = $state('');
	let savingTemplate = $state(false);

	// @file autocomplete state
	let showFileAutocomplete = $state(false);
	let fileSearchResults = $state<Array<{ path: string; name: string; folder: string }>>([]);
	let fileSearchQuery = $state('');
	let fileAutocompleteIndex = $state(0);
	let atTriggerPosition = $state(0); // cursor position of the @ that triggered autocomplete
	let textareaRef = $state<HTMLDivElement | null>(null);
	let editorTextareaRef = $state<HTMLTextAreaElement | null>(null);
	let activeAutocompleteTarget = $state<'command' | 'editor'>('command');
	let autocompleteRef = $state<HTMLDivElement | null>(null);
	let fileSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let referencedFiles = $state<Array<{ path: string; name: string }>>([]);

	// Context provider autocomplete state
	type AutocompleteMode = 'file' | 'provider-picker' | 'provider-search';
	let autocompleteMode = $state<AutocompleteMode>('file');
	let activeProvider = $state<string | null>(null);
	let providerSearchResults = $state<Array<{ value: string; label: string; description?: string }>>([]);

	interface ProviderCategory {
		prefix: string;
		label: string;
		icon: string;
		description: string;
	}

	const PROVIDER_CATEGORIES: ProviderCategory[] = [
		{ prefix: 'file:', label: 'File', icon: '📄', description: 'Attach a project file by path' },
		{ prefix: 'task:', label: 'Task', icon: '📋', description: 'Inject task details by ID' },
		{ prefix: 'git:', label: 'Git', icon: '🔀', description: 'Inject git diff, log, or branch info' },
		{ prefix: 'memory:', label: 'Memory', icon: '🧠', description: 'Search project memory for context' },
		{ prefix: 'url:', label: 'URL', icon: '🔗', description: 'Fetch and inject URL content' }
	];

	// Output action state
	let selectedOutputAction = $state<OutputAction>('display');
	let showOutputActionMenu = $state(false);

	// Write-to-file modal state
	let showWriteFileModal = $state(false);
	let writeFilePath = $state('');
	let writingFile = $state(false);
	let writeFileError = $state('');
	let pendingWriteResult = $state<ExecutionResult | null>(null);


	// Active tab
	let activeTab = $state<'templates' | 'history'>('templates');

	const OUTPUT_ACTIONS: Array<{ id: OutputAction; label: string; icon: string; desc: string }> = [
		{ id: 'display', label: 'Display', icon: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z', desc: 'Show result inline' },
		{ id: 'clipboard', label: 'Clipboard', icon: 'M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184', desc: 'Copy to clipboard' },
		{ id: 'write_file', label: 'Write File', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z', desc: 'Save result to file' },
		{ id: 'create_task', label: 'Create Task', icon: 'M12 4.5v15m7.5-7.5h-15', desc: 'Create task from result' },
	];

	const MODELS = [
		{ id: 'haiku', label: 'Haiku', desc: 'Fast, cheap' },
		{ id: 'sonnet', label: 'Sonnet', desc: 'Balanced' },
		{ id: 'opus', label: 'Opus', desc: 'Most capable' }
	];

	const HISTORY_KEY = 'jat-quick-command-history';
	const MAX_HISTORY = 20;

	// --- Lifecycle ---
	onMount(async () => {
		loadHistory();
		await Promise.all([fetchTemplates(), fetchProjects()]);
		isLoading = false;
	});

	// --- Data fetching ---
	async function fetchTemplates() {
		try {
			const res = await fetch('/api/quick-command/templates');
			const data = await res.json();
			if (data.success) {
				templates = data.templates || [];
			}
		} catch (e) {
			console.error('[quick-commands] Failed to fetch templates:', e);
		}
	}

	async function fetchProjects() {
		try {
			const res = await fetch('/api/projects?visible=true');
			const data = await res.json();
			if (data.projects) {
				projects = data.projects.map((p: any) => ({
					key: p.key || p.name?.toLowerCase(),
					name: p.name || p.key
				}));
				if (projects.length > 0 && !projects.find((p) => p.key === selectedProject)) {
					selectedProject = projects[0].key;
				}
			}
		} catch (e) {
			console.error('[quick-commands] Failed to fetch projects:', e);
		}
	}

	// --- History ---
	function loadHistory() {
		try {
			const stored = localStorage.getItem(HISTORY_KEY);
			if (stored) {
				history = JSON.parse(stored);
			}
		} catch {
			history = [];
		}
	}

	function saveHistory() {
		try {
			localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
		} catch {
			// localStorage full or unavailable
		}
	}

	function addToHistory(entry: ExecutionResult) {
		history = [entry, ...history].slice(0, MAX_HISTORY);
		saveHistory();
	}

	function clearHistory() {
		history = [];
		localStorage.removeItem(HISTORY_KEY);
	}

	// --- Execution ---
	async function executeCommand(prompt: string, project: string, model: string, templateName?: string, outputAction?: OutputAction) {
		isExecuting = true;
		executionResult = null;
		const action = outputAction || selectedOutputAction;

		try {
			const res = await fetch('/api/quick-command', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt, project, model })
			});
			const data = await res.json();

			const entry: ExecutionResult = {
				id: crypto.randomUUID(),
				prompt,
				result: data.success ? data.result : '',
				model: data.model || model,
				project,
				durationMs: data.durationMs || 0,
				timestamp: new Date().toISOString(),
				templateName,
				outputAction: action,
				error: data.success ? undefined : data.message || data.error || 'Execution failed',
				resolvedFiles: data.resolvedFiles || [],
				fileErrors: data.fileErrors || [],
				resolvedProviders: data.resolvedProviders || [],
				providerErrors: data.providerErrors || []
			};

			executionResult = entry;
			addToHistory(entry);

			// Route result based on output action
			if (!entry.error) {
				await routeOutput(entry, action);
			}
		} catch (e: any) {
			const entry: ExecutionResult = {
				id: crypto.randomUUID(),
				prompt,
				result: '',
				model,
				project,
				durationMs: 0,
				timestamp: new Date().toISOString(),
				templateName,
				outputAction: action,
				error: e.message || 'Network error'
			};
			executionResult = entry;
			addToHistory(entry);
		} finally {
			isExecuting = false;
		}
	}

	// --- Output routing ---
	async function routeOutput(entry: ExecutionResult, action: OutputAction) {
		switch (action) {
			case 'clipboard':
				try {
					await navigator.clipboard.writeText(entry.result);
				} catch {
					// Fallback: select text for manual copy
				}
				break;
			case 'write_file':
				pendingWriteResult = entry;
				writeFilePath = '';
				writeFileError = '';
				showWriteFileModal = true;
				break;
			case 'create_task':
				openTaskDrawer(entry.project, entry.result);
				break;
			case 'display':
			default:
				break;
		}
	}

	async function confirmWriteFile() {
		if (!writeFilePath.trim() || !pendingWriteResult) return;
		writingFile = true;
		writeFileError = '';
		try {
			const res = await fetch('/api/files/content', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: writeFilePath.trim(),
					content: pendingWriteResult.result,
					project: pendingWriteResult.project
				})
			});
			if (!res.ok) {
				const data = await res.json();
				writeFileError = data.error || 'Failed to write file';
				return;
			}
			showWriteFileModal = false;
			pendingWriteResult = null;
		} catch (e: any) {
			writeFileError = e.message || 'Failed to write file';
		} finally {
			writingFile = false;
		}
	}

	async function runCustomCommand() {
		if (!commandPrompt.trim() || isExecuting) return;
		await executeCommand(commandPrompt.trim(), selectedProject, selectedModel);
	}

	// --- Template execution ---
	function startTemplateRun(template: Template) {
		if (template.variables && template.variables.length > 0) {
			runningTemplate = template;
			variableValues = {};
			for (const v of template.variables) {
				variableValues[v.name] = v.default || '';
			}
		} else {
			executeTemplate(template, {});
		}
	}

	async function executeTemplate(template: Template, vars: Record<string, string>) {
		let prompt = template.prompt;
		for (const [key, value] of Object.entries(vars)) {
			prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
		}
		const project = template.defaultProject || selectedProject;
		const model = template.defaultModel || selectedModel;
		const action = template.outputAction || selectedOutputAction;
		runningTemplate = null;
		await executeCommand(prompt, project, model, template.name, action);
	}

	function cancelTemplateRun() {
		runningTemplate = null;
		variableValues = {};
	}

	// --- Template CRUD ---
	function openNewTemplate() {
		editingTemplate = null;
		editorName = '';
		editorPrompt = '';
		editorProject = '';
		editorModel = 'haiku';
		editorOutputAction = 'display';
		editorVariables = [];
		editorError = '';
		showTemplateEditor = true;
	}

	function openEditTemplate(template: Template) {
		editingTemplate = template;
		editorName = template.name;
		editorPrompt = template.prompt;
		editorProject = template.defaultProject || '';
		editorModel = template.defaultModel || 'haiku';
		editorOutputAction = template.outputAction || 'display';
		editorVariables = template.variables ? [...template.variables] : [];
		editorError = '';
		showTemplateEditor = true;
	}

	async function saveTemplate() {
		if (!editorName.trim() || !editorPrompt.trim()) {
			editorError = 'Name and prompt are required';
			return;
		}

		editorSaving = true;
		editorError = '';

		try {
			if (editingTemplate) {
				// Update existing
				const res = await fetch(`/api/quick-command/templates/${editingTemplate.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: editorName.trim(),
						prompt: editorPrompt.trim(),
						defaultProject: editorProject || null,
						defaultModel: editorModel,
						outputAction: editorOutputAction !== 'display' ? editorOutputAction : undefined,
						variables: editorVariables
					})
				});
				const data = await res.json();
				if (!res.ok) {
					editorError = data.message || data.error || 'Failed to update';
					return;
				}
			} else {
				// Create new
				const res = await fetch('/api/quick-command/templates', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: editorName.trim(),
						prompt: editorPrompt.trim(),
						defaultProject: editorProject || null,
						defaultModel: editorModel,
						outputAction: editorOutputAction !== 'display' ? editorOutputAction : undefined,
						variables: editorVariables
					})
				});
				const data = await res.json();
				if (!res.ok) {
					editorError = data.message || data.error || 'Failed to create';
					return;
				}
			}

			showTemplateEditor = false;
			await fetchTemplates();
		} catch (e: any) {
			editorError = e.message || 'Save failed';
		} finally {
			editorSaving = false;
		}
	}

	async function deleteTemplate(template: Template) {
		try {
			const res = await fetch(`/api/quick-command/templates/${template.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				await fetchTemplates();
			}
		} catch (e) {
			console.error('[quick-commands] Failed to delete template:', e);
		}
	}

	function addEditorVariable() {
		editorVariables = [...editorVariables, { name: '', label: '', default: '' }];
	}

	function removeEditorVariable(index: number) {
		editorVariables = editorVariables.filter((_, i) => i !== index);
	}

	// --- Save as template ---
	function openSaveAsTemplate() {
		saveTemplateName = '';
		showSaveAsTemplate = true;
	}

	async function confirmSaveAsTemplate() {
		if (!saveTemplateName.trim() || !executionResult) return;
		savingTemplate = true;
		try {
			const res = await fetch('/api/quick-command/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: saveTemplateName.trim(),
					prompt: executionResult.prompt,
					defaultProject: executionResult.project,
					defaultModel: executionResult.model,
					variables: []
				})
			});
			if (res.ok) {
				showSaveAsTemplate = false;
				await fetchTemplates();
			}
		} catch (e) {
			console.error('[quick-commands] Failed to save template:', e);
		} finally {
			savingTemplate = false;
		}
	}

	// --- @file and context provider autocomplete ---
	function getActiveProject(): string {
		// For editor: use editorProject if set, otherwise selectedProject
		if (activeAutocompleteTarget === 'editor' && editorProject) return editorProject;
		return selectedProject;
	}

	async function searchFiles(query: string) {
		const project = getActiveProject();
		if (!project || query.length < 1) {
			fileSearchResults = [];
			return;
		}
		try {
			const res = await fetch(`/api/files/search?project=${encodeURIComponent(project)}&query=${encodeURIComponent(query)}&limit=10`);
			const data = await res.json();
			fileSearchResults = data.files || [];
			fileAutocompleteIndex = 0;
		} catch {
			fileSearchResults = [];
		}
	}

	async function searchProviders(provider: string, query: string) {
		const project = getActiveProject();
		try {
			const res = await fetch(`/api/context-providers/search?provider=${encodeURIComponent(provider)}&query=${encodeURIComponent(query)}&project=${encodeURIComponent(project)}`);
			const data = await res.json();
			providerSearchResults = data.results || [];
			fileAutocompleteIndex = 0;
		} catch {
			providerSearchResults = [];
		}
	}

	/** Determine autocomplete mode from text before cursor */
	function detectAutocompleteMode(beforeCursor: string): { mode: AutocompleteMode; provider: string | null; query: string } | null {
		// Check for provider pattern: @provider:query
		const providerMatch = beforeCursor.match(/@(task|git|memory|url):([\w\-\.\/:%?&#=+~]*)$/);
		if (providerMatch) {
			return { mode: 'provider-search', provider: providerMatch[1], query: providerMatch[2] };
		}

		// Check for @file: shortcut — treat as file search
		const fileProviderMatch = beforeCursor.match(/@file:([\w\-\.\/]*)$/);
		if (fileProviderMatch) {
			return { mode: 'file', provider: null, query: fileProviderMatch[1] };
		}

		// Check for bare @ with optional text (could be file or start of provider)
		const atMatch = beforeCursor.match(/@([\w\-\.\/]*)$/);
		if (atMatch) {
			const text = atMatch[1];
			// If the text matches start of a provider prefix, show provider picker
			const matchingProviders = PROVIDER_CATEGORIES.filter(p =>
				p.prefix.startsWith(text.toLowerCase() + (text.endsWith(':') ? '' : ''))
			);
			if (text === '' || (matchingProviders.length > 0 && !text.includes('.'))) {
				return { mode: 'provider-picker', provider: null, query: text };
			}
			// Otherwise, it's a file search
			return { mode: 'file', provider: null, query: text };
		}

		return null;
	}

	function handleTextareaInput(e: Event, target: 'command' | 'editor' = 'command') {
		activeAutocompleteTarget = target;

		if (target === 'command') {
			syncCommandPrompt();
			// Clean up empty contenteditable (remove lingering <br>)
			if (!commandPrompt.trim() && textareaRef) {
				textareaRef.innerHTML = '';
			}

			const sel = window.getSelection();
			if (!sel || sel.rangeCount === 0) {
				showFileAutocomplete = false;
				fileSearchResults = [];
				providerSearchResults = [];
				return;
			}

			const range = sel.getRangeAt(0);

			// Get text before cursor using Range — works whether cursor is in
			// a text node OR an element node (common after chip insertion)
			let beforeCursor = '';
			try {
				const preRange = document.createRange();
				preRange.selectNodeContents(textareaRef!);
				preRange.setEnd(range.startContainer, range.startOffset);
				beforeCursor = preRange.toString();
			} catch {
				showFileAutocomplete = false;
				fileSearchResults = [];
				providerSearchResults = [];
				return;
			}

			const detected = detectAutocompleteMode(beforeCursor);

			if (detected) {
				autocompleteMode = detected.mode;
				activeProvider = detected.provider;
				showFileAutocomplete = true;

				if (fileSearchTimeout) clearTimeout(fileSearchTimeout);

				if (detected.mode === 'provider-picker') {
					// Show provider categories (no async needed)
					fileSearchQuery = detected.query;
					fileSearchResults = [];
					providerSearchResults = [];
					fileAutocompleteIndex = 0;
				} else if (detected.mode === 'provider-search') {
					fileSearchQuery = detected.query;
					fileSearchResults = [];
					fileSearchTimeout = setTimeout(() => {
						searchProviders(detected.provider!, detected.query);
					}, 150);
				} else {
					// File mode
					fileSearchQuery = detected.query;
					providerSearchResults = [];
					fileSearchTimeout = setTimeout(() => {
						searchFiles(detected.query);
					}, 150);
				}
			} else {
				showFileAutocomplete = false;
				fileSearchResults = [];
				providerSearchResults = [];
				autocompleteMode = 'file';
				activeProvider = null;
			}

			syncReferencedFiles();
			return;
		}

		// Editor target - standard textarea approach
		const textarea = e.target as HTMLTextAreaElement;
		const cursorPos = textarea.selectionStart;
		const text = textarea.value;
		const beforeCursor = text.slice(0, cursorPos);

		const detected = detectAutocompleteMode(beforeCursor);

		if (detected) {
			autocompleteMode = detected.mode;
			activeProvider = detected.provider;
			showFileAutocomplete = true;

			// For editor mode, track trigger position for text replacement
			const fullMatch = beforeCursor.match(/@[\w\-\.\/:]*/);
			if (fullMatch) {
				atTriggerPosition = cursorPos - fullMatch[0].length;
			}

			if (fileSearchTimeout) clearTimeout(fileSearchTimeout);

			if (detected.mode === 'provider-picker') {
				fileSearchQuery = detected.query;
				fileSearchResults = [];
				providerSearchResults = [];
				fileAutocompleteIndex = 0;
			} else if (detected.mode === 'provider-search') {
				fileSearchQuery = detected.query;
				fileSearchResults = [];
				fileSearchTimeout = setTimeout(() => {
					searchProviders(detected.provider!, detected.query);
				}, 150);
			} else {
				fileSearchQuery = detected.query;
				providerSearchResults = [];
				fileSearchTimeout = setTimeout(() => {
					searchFiles(detected.query);
				}, 150);
			}
		} else {
			showFileAutocomplete = false;
			fileSearchResults = [];
			providerSearchResults = [];
			autocompleteMode = 'file';
			activeProvider = null;
		}
	}

	function handleTextareaKeydown(e: KeyboardEvent, target: 'command' | 'editor' = 'command') {
		// Ctrl/Cmd+Enter to run (main command only)
		if (target === 'command' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			runCustomCommand();
			return;
		}

		// Auto-create chip for @url: when user presses Space, Tab, or Enter
		if (target === 'command' && activeProvider === 'url' && (e.key === ' ' || e.key === 'Tab' || e.key === 'Enter')) {
			if (textareaRef) {
				const sel = window.getSelection();
				if (sel && sel.rangeCount > 0) {
					const range = sel.getRangeAt(0);
					let textNode: Node = range.startContainer;
					let cursorPos = range.startOffset;
					if (textNode.nodeType !== Node.TEXT_NODE) {
						const children = Array.from(textNode.childNodes);
						const prev = children[cursorPos - 1];
						if (prev && prev.nodeType === Node.TEXT_NODE) {
							textNode = prev;
							cursorPos = (prev.textContent || '').length;
						}
					}
					if (textNode.nodeType === Node.TEXT_NODE) {
						const text = textNode.textContent || '';
						const beforeCursor = text.slice(0, cursorPos);
						const urlMatch = beforeCursor.match(/@url:(https?:\/\/\S+)$/);
						if (urlMatch) {
							e.preventDefault();
							selectProviderResult({ value: urlMatch[1], label: urlMatch[1] });
							return;
						}
					}
				}
			}
		}

		// Handle autocomplete navigation
		if (showFileAutocomplete) {
			const totalItems = getAutocompleteItemCount();
			if (totalItems > 0) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					fileAutocompleteIndex = (fileAutocompleteIndex + 1) % totalItems;
					return;
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					fileAutocompleteIndex = (fileAutocompleteIndex - 1 + totalItems) % totalItems;
					return;
				}
				if (e.key === 'Tab' || e.key === 'Enter') {
					e.preventDefault();
					selectAutocompleteItem(fileAutocompleteIndex);
					return;
				}
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				showFileAutocomplete = false;
				return;
			}
		}
	}

	/** Get total number of items in current autocomplete view */
	function getAutocompleteItemCount(): number {
		if (autocompleteMode === 'provider-picker') {
			// Provider categories + file results
			return filteredProviderCategories.length + fileSearchResults.length;
		}
		if (autocompleteMode === 'provider-search') {
			return providerSearchResults.length;
		}
		return fileSearchResults.length;
	}

	/** Get filtered provider categories based on current query */
	function getFilteredProviderCategories(): ProviderCategory[] {
		if (autocompleteMode !== 'provider-picker') return [];
		if (!fileSearchQuery) return PROVIDER_CATEGORIES;
		return PROVIDER_CATEGORIES.filter(p =>
			p.prefix.startsWith(fileSearchQuery.toLowerCase()) ||
			p.label.toLowerCase().startsWith(fileSearchQuery.toLowerCase())
		);
	}

	// Derived: filtered provider categories for the current query
	let filteredProviderCategories = $derived(getFilteredProviderCategories());

	/** Select an item from the autocomplete dropdown */
	function selectAutocompleteItem(index: number) {
		if (autocompleteMode === 'provider-picker') {
			const categories = filteredProviderCategories;
			if (index < categories.length) {
				// Selected a provider category — insert prefix and continue
				selectProviderCategory(categories[index]);
				return;
			}
			// Selected a file result (shown after categories)
			const fileIndex = index - categories.length;
			if (fileIndex < fileSearchResults.length) {
				selectFileFromAutocomplete(fileSearchResults[fileIndex]);
				return;
			}
		} else if (autocompleteMode === 'provider-search') {
			if (index < providerSearchResults.length) {
				selectProviderResult(providerSearchResults[index]);
				return;
			}
		} else {
			// File mode
			if (index < fileSearchResults.length) {
				selectFileFromAutocomplete(fileSearchResults[index]);
			}
		}
	}

	/** Select a provider category — replaces @query with @provider: and continues autocomplete */
	function selectProviderCategory(category: ProviderCategory) {
		// file: is special — switch to file search mode (no prefix inserted)
		if (category.prefix === 'file:') {
			autocompleteMode = 'file';
			activeProvider = null;
			fileSearchQuery = '';
			providerSearchResults = [];
			fileAutocompleteIndex = 0;

			if (activeAutocompleteTarget === 'editor') {
				const ref = editorTextareaRef;
				if (!ref) return;
				// Keep @, position cursor right after it
				const before = editorPrompt.slice(0, atTriggerPosition);
				const after = editorPrompt.slice(ref.selectionStart);
				editorPrompt = before + '@' + after;
				requestAnimationFrame(() => {
					if (ref) {
						const newPos = before.length + 1;
						ref.focus();
						ref.setSelectionRange(newPos, newPos);
					}
				});
			}
			// For contenteditable: the @ is already in place, just switch mode
			// File results will appear as the user types after @
			return;
		}

		if (activeAutocompleteTarget === 'editor') {
			const ref = editorTextareaRef;
			if (!ref) return;
			const before = editorPrompt.slice(0, atTriggerPosition);
			const after = editorPrompt.slice(ref.selectionStart);
			const insertion = `@${category.prefix}`;
			editorPrompt = before + insertion + after;

			// Switch to provider search mode
			autocompleteMode = 'provider-search';
			activeProvider = category.prefix.replace(':', '');
			fileSearchQuery = '';
			providerSearchResults = [];

			// For url: provider, just close autocomplete (user types the URL)
			if (category.prefix === 'url:') {
				showFileAutocomplete = false;
				requestAnimationFrame(() => {
					if (ref) {
						const newPos = before.length + insertion.length;
						ref.focus();
						ref.setSelectionRange(newPos, newPos);
					}
				});
				return;
			}

			// Trigger provider search
			searchProviders(activeProvider, '');
			requestAnimationFrame(() => {
				if (ref) {
					const newPos = before.length + insertion.length;
					ref.focus();
					ref.setSelectionRange(newPos, newPos);
				}
			});
			return;
		}

		// Command contenteditable
		if (!textareaRef) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		const range = sel.getRangeAt(0);
		let textNode: Node = range.startContainer;
		let cursorPos = range.startOffset;

		if (textNode.nodeType !== Node.TEXT_NODE) {
			const children = Array.from(textNode.childNodes);
			const prev = children[cursorPos - 1];
			if (prev && prev.nodeType === Node.TEXT_NODE) {
				textNode = prev;
				cursorPos = (prev.textContent || '').length;
			} else return;
		}

		const text = textNode.textContent || '';
		const beforeCursor = text.slice(0, cursorPos);
		const atMatch = beforeCursor.match(/@[\w\-\.\/]*$/);
		if (!atMatch) return;

		const atPos = cursorPos - atMatch[0].length;
		const newText = text.slice(0, atPos) + `@${category.prefix}` + text.slice(cursorPos);
		textNode.textContent = newText;

		// Position cursor after the prefix
		const newCursorPos = atPos + `@${category.prefix}`.length;
		const newRange = document.createRange();
		newRange.setStart(textNode, newCursorPos);
		newRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(newRange);

		// Switch mode
		autocompleteMode = 'provider-search';
		activeProvider = category.prefix.replace(':', '');
		fileSearchQuery = '';
		providerSearchResults = [];

		if (category.prefix === 'url:') {
			showFileAutocomplete = false;
			return;
		}

		searchProviders(activeProvider, '');
		syncCommandPrompt();
	}

	/** Select a provider search result — insert full reference as a chip */
	function selectProviderResult(result: { value: string; label: string; description?: string }) {
		const fullRef = `@${activeProvider}:${result.value}`;

		if (activeAutocompleteTarget === 'editor') {
			const ref = editorTextareaRef;
			if (!ref) return;
			const before = editorPrompt.slice(0, atTriggerPosition);
			const after = editorPrompt.slice(ref.selectionStart);
			editorPrompt = before + fullRef + ' ' + after;

			showFileAutocomplete = false;
			providerSearchResults = [];
			autocompleteMode = 'file';
			activeProvider = null;

			requestAnimationFrame(() => {
				if (ref) {
					const newPos = before.length + fullRef.length + 1;
					ref.focus();
					ref.setSelectionRange(newPos, newPos);
				}
			});
			return;
		}

		// Command contenteditable — insert as chip
		if (!textareaRef) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		const range = sel.getRangeAt(0);
		let textNode: Node = range.startContainer;
		let cursorPos = range.startOffset;

		if (textNode.nodeType !== Node.TEXT_NODE) {
			const children = Array.from(textNode.childNodes);
			const prev = children[cursorPos - 1];
			if (prev && prev.nodeType === Node.TEXT_NODE) {
				textNode = prev;
				cursorPos = (prev.textContent || '').length;
			} else return;
		}

		const text = textNode.textContent || '';
		const beforeCursor = text.slice(0, cursorPos);
		const atMatch = beforeCursor.match(/@[\w\-\.\/:%?&#=+~]*/);
		if (!atMatch) return;

		const atPos = cursorPos - atMatch[0].length;
		const beforeText = text.slice(0, atPos);
		const afterText = text.slice(cursorPos);

		const parent = textNode.parentNode!;

		if (beforeText) {
			parent.insertBefore(document.createTextNode(beforeText), textNode);
		}

		// Create provider chip
		const chip = document.createElement('span');
		chip.contentEditable = 'false';
		chip.dataset.providerRef = fullRef;
		chip.className = 'inline-provider-chip';

		const providerIcons: Record<string, string> = { task: '📋', git: '🔀', memory: '🧠', url: '🔗' };
		const icon = providerIcons[activeProvider || ''] || '📎';
		chip.textContent = `${icon} ${fullRef.slice(1)}`; // Remove leading @

		parent.insertBefore(chip, textNode);

		const afterNode = document.createTextNode('\u00A0' + afterText);
		parent.insertBefore(afterNode, textNode);
		parent.removeChild(textNode);

		const newRange = document.createRange();
		newRange.setStart(afterNode, 1);
		newRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(newRange);

		syncCommandPrompt();
		showFileAutocomplete = false;
		providerSearchResults = [];
		autocompleteMode = 'file';
		activeProvider = null;
	}

	function selectFileFromAutocomplete(file: { path: string; name: string; folder: string }) {
		if (activeAutocompleteTarget === 'editor') {
			// Editor uses standard textarea approach
			const ref = editorTextareaRef;
			if (!ref) return;

			const fullPath = `@${file.path}`;
			const before = editorPrompt.slice(0, atTriggerPosition);
			const after = editorPrompt.slice(ref.selectionStart);
			editorPrompt = before + fullPath + ' ' + after;

			showFileAutocomplete = false;
			fileSearchResults = [];

			requestAnimationFrame(() => {
				if (ref) {
					const newPos = before.length + fullPath.length + 1;
					ref.focus();
					ref.setSelectionRange(newPos, newPos);
				}
			});
			return;
		}

		// Command uses contenteditable with inline chip
		if (!textareaRef) return;

		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		const range = sel.getRangeAt(0);

		// Resolve the text node at cursor — browser may place caret in element node
		// (common after contenteditable="false" chip elements)
		let textNode: Node = range.startContainer;
		let cursorPos = range.startOffset;
		if (textNode.nodeType !== Node.TEXT_NODE) {
			const children = Array.from(textNode.childNodes);
			const prev = children[cursorPos - 1];
			if (prev && prev.nodeType === Node.TEXT_NODE) {
				textNode = prev;
				cursorPos = (prev.textContent || '').length;
			} else if (prev) {
				// Walk into element to find last text node
				let last: Node | null = prev;
				while (last && last.nodeType !== Node.TEXT_NODE) {
					last = last.lastChild;
				}
				if (last) {
					textNode = last;
					cursorPos = (last.textContent || '').length;
				} else {
					return;
				}
			} else {
				return;
			}
		}

		const text = textNode.textContent || '';
		const beforeCursor = text.slice(0, cursorPos);

		// Find the @ that triggered autocomplete
		const atMatch = beforeCursor.match(/@([\w\-\.\/]*)$/);
		if (!atMatch) return;

		const atPos = cursorPos - atMatch[0].length;
		const beforeText = text.slice(0, atPos);
		const afterText = text.slice(cursorPos);

		const parent = textNode.parentNode!;

		// Create before text node (only if non-empty)
		if (beforeText) {
			parent.insertBefore(document.createTextNode(beforeText), textNode);
		}

		// Create chip element
		const chip = document.createElement('span');
		chip.contentEditable = 'false';
		chip.dataset.filePath = file.path;
		chip.className = 'inline-file-chip';
		chip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:12px;height:12px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>\u00A0${file.name}`;
		parent.insertBefore(chip, textNode);

		// Create after text node with a leading space for continued typing
		const afterNode = document.createTextNode('\u00A0' + afterText);
		parent.insertBefore(afterNode, textNode);

		// Remove original text node
		parent.removeChild(textNode);

		// Position cursor after the space
		const newRange = document.createRange();
		newRange.setStart(afterNode, 1);
		newRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(newRange);

		// Track referenced file
		if (!referencedFiles.find(f => f.path === file.path)) {
			referencedFiles = [...referencedFiles, { path: file.path, name: file.name }];
		}

		syncCommandPrompt();
		showFileAutocomplete = false;
		fileSearchResults = [];
	}

	function removeFileReference(path: string) {
		referencedFiles = referencedFiles.filter(f => f.path !== path);
		// Remove chip from contenteditable DOM
		if (textareaRef) {
			const chips = textareaRef.querySelectorAll(`[data-file-path="${CSS.escape(path)}"]`);
			chips.forEach(chip => {
				// Remove trailing space if present
				const next = chip.nextSibling;
				if (next && next.nodeType === Node.TEXT_NODE && next.textContent?.startsWith('\u00A0')) {
					next.textContent = next.textContent.slice(1);
				}
				chip.remove();
			});
			syncCommandPrompt();
		}
	}

	// Sync referencedFiles from DOM chips (remove tracked files whose chip was deleted)
	function syncReferencedFiles() {
		if (!textareaRef) return;
		const chips = textareaRef.querySelectorAll('[data-file-path]');
		const paths = new Set<string>();
		chips.forEach(chip => {
			const p = (chip as HTMLElement).dataset.filePath;
			if (p) paths.add(p);
		});
		referencedFiles = referencedFiles.filter(f => paths.has(f.path));
	}

	// --- Contenteditable helpers ---
	/** Extract prompt text from contenteditable, converting chips to @path or @provider:ref */
	function getPromptText(el: HTMLElement): string {
		let result = '';
		for (const node of Array.from(el.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent || '';
			} else if (node instanceof HTMLElement) {
				if (node.dataset.filePath) {
					result += `@${node.dataset.filePath}`;
				} else if (node.dataset.providerRef) {
					result += node.dataset.providerRef;
				} else if (node.tagName === 'BR') {
					result += '\n';
				} else if (node.tagName === 'DIV' || node.tagName === 'P') {
					if (result.length > 0 && !result.endsWith('\n')) result += '\n';
					result += getPromptText(node);
				} else {
					result += getPromptText(node);
				}
			}
		}
		return result;
	}

	function syncCommandPrompt() {
		if (!textareaRef) return;
		commandPrompt = getPromptText(textareaRef);
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') || '';
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		range.deleteContents();
		const textNode = document.createTextNode(text);
		range.insertNode(textNode);
		range.setStartAfter(textNode);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
		syncCommandPrompt();
	}

	// --- Helpers ---
	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function formatTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	function truncate(str: string, len: number): string {
		if (str.length <= len) return str;
		return str.slice(0, len) + '...';
	}

	function rerunFromHistory(entry: ExecutionResult) {
		if (textareaRef) {
			textareaRef.textContent = entry.prompt;
		}
		commandPrompt = entry.prompt;
		selectedProject = entry.project;
		selectedModel = entry.model;
		if (entry.outputAction) selectedOutputAction = entry.outputAction;
		referencedFiles = [];
	}

	function getOutputActionLabel(action: OutputAction): string {
		return OUTPUT_ACTIONS.find(a => a.id === action)?.label || 'Display';
	}

	function getOutputActionIcon(action: OutputAction): string {
		return OUTPUT_ACTIONS.find(a => a.id === action)?.icon || OUTPUT_ACTIONS[0].icon;
	}
</script>

<svelte:head>
	<title>Quick Commands - JAT</title>
</svelte:head>

<div
	class="flex h-full flex-col overflow-hidden"
	style="background: oklch(0.16 0.01 250);"
>
	<!-- Header -->
	<div
		class="flex items-center justify-between px-5 py-3 shrink-0"
		style="border-bottom: 1px solid oklch(0.28 0.02 250);"
	>
		<div class="flex items-center gap-3">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" style="color: oklch(0.75 0.15 200);">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
			</svg>
			<h1 class="text-lg font-semibold" style="color: oklch(0.90 0.01 250);">Quick Commands</h1>
			<span class="text-xs px-2 py-0.5 rounded-full" style="background: oklch(0.75 0.15 200 / 0.15); color: oklch(0.75 0.15 200);">
				Single-turn
			</span>
		</div>
	</div>

	<!-- Main content -->
	<div class="flex-1 overflow-y-auto p-5">
		<div class="max-w-5xl mx-auto flex flex-col gap-6">

			<!-- Command Input Section -->
			<div class="rounded-lg p-4" style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.28 0.02 250);">
				<div class="flex items-center gap-2 mb-3">
					<h2 class="text-sm font-semibold" style="color: oklch(0.80 0.01 250);">Run Command</h2>
					<span class="text-xs" style="color: oklch(0.45 0.01 250);">
						Type <code style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 3px; color: oklch(0.65 0.10 200);">@</code> for files &amp; context
						<span style="color: oklch(0.40 0.01 250);">—</span>
						<code style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 3px; color: oklch(0.55 0.08 145);">@task:</code>
						<code style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 3px; color: oklch(0.55 0.08 145);">@git:</code>
						<code style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 3px; color: oklch(0.55 0.08 145);">@memory:</code>
						<code style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 3px; color: oklch(0.55 0.08 145);">@url:</code>
					</span>
				</div>

				<!-- Contenteditable with inline @file chips -->
				<div class="relative">
					<div
						bind:this={textareaRef}
						contenteditable="true"
						role="textbox"
						aria-multiline="true"
						class="w-full rounded-md px-3 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250); min-height: 72px; max-height: 240px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; outline: none; resize: vertical; line-height: 1.6;"
						oninput={(e) => handleTextareaInput(e, 'command')}
						onkeydown={(e) => handleTextareaKeydown(e, 'command')}
						onpaste={handlePaste}
						onblur={() => { setTimeout(() => { showFileAutocomplete = false; }, 200); }}
					></div>
					<!-- Placeholder overlay -->
					{#if !commandPrompt.trim()}
						<div
							class="absolute top-0 left-0 px-3 py-2 text-sm pointer-events-none"
							style="color: oklch(0.40 0.01 250);"
						>
							Enter a prompt... Use @ to attach files and context
						</div>
					{/if}

					<!-- Autocomplete dropdown (files + context providers) -->
					{#if showFileAutocomplete && (autocompleteMode === 'provider-picker' ? (filteredProviderCategories.length > 0 || fileSearchResults.length > 0) : autocompleteMode === 'provider-search' ? providerSearchResults.length > 0 : fileSearchResults.length > 0)}
						<div
							bind:this={autocompleteRef}
							class="absolute z-40 w-full mt-1 rounded-lg overflow-hidden shadow-xl"
							style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.30 0.03 250); max-height: 280px; overflow-y: auto;"
						>
							{#if autocompleteMode === 'provider-picker'}
								<!-- Provider categories -->
								{#if filteredProviderCategories.length > 0}
									<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
										Context Providers
									</div>
									{#each filteredProviderCategories as category, i (category.prefix)}
										<button
											class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
											style="
												background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
												color: oklch(0.85 0.01 250);
											"
											onmouseenter={() => fileAutocompleteIndex = i}
											onmousedown={(e) => { e.preventDefault(); selectProviderCategory(category); }}
										>
											<span class="text-sm shrink-0">{category.icon}</span>
											<span class="text-xs font-mono" style="color: oklch(0.75 0.15 200);">@{category.prefix}</span>
											<span class="text-xs truncate ml-auto" style="color: oklch(0.50 0.01 250);">{category.description}</span>
										</button>
									{/each}
								{/if}

								<!-- File results (shown below providers) -->
								{#if fileSearchResults.length > 0}
									<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250); border-top: 1px solid oklch(0.25 0.02 250);">
										Files
									</div>
									{#each fileSearchResults as file, i (file.path)}
										{@const itemIndex = filteredProviderCategories.length + i}
										<button
											class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
											style="
												background: {itemIndex === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
												color: oklch(0.85 0.01 250);
											"
											onmouseenter={() => fileAutocompleteIndex = itemIndex}
											onmousedown={(e) => { e.preventDefault(); selectFileFromAutocomplete(file); }}
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 shrink-0" style="color: oklch(0.55 0.08 200);">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
											</svg>
											<span class="text-xs truncate">{file.name}</span>
											<span class="text-xs truncate ml-auto" style="color: oklch(0.45 0.01 250);">{file.folder}</span>
										</button>
									{/each}
								{/if}

							{:else if autocompleteMode === 'provider-search'}
								<!-- Provider-specific search results -->
								<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
									@{activeProvider}: {fileSearchQuery || '(all)'}
								</div>
								{#each providerSearchResults as result, i (`${result.value}-${i}`)}
									<button
										class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
										style="
											background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
											color: oklch(0.85 0.01 250);
										"
										onmouseenter={() => fileAutocompleteIndex = i}
										onmousedown={(e) => { e.preventDefault(); selectProviderResult(result); }}
									>
										<span class="text-xs font-mono shrink-0" style="color: oklch(0.75 0.15 200);">{result.label}</span>
										{#if result.description}
											<span class="text-xs truncate ml-auto" style="color: oklch(0.50 0.01 250);">{result.description}</span>
										{/if}
									</button>
								{/each}

							{:else}
								<!-- File results only -->
								<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
									Files matching: {fileSearchQuery}
								</div>
								{#each fileSearchResults as file, i (file.path)}
									<button
										class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
										style="
											background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
											color: oklch(0.85 0.01 250);
										"
										onmouseenter={() => fileAutocompleteIndex = i}
										onmousedown={(e) => { e.preventDefault(); selectFileFromAutocomplete(file); }}
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 shrink-0" style="color: oklch(0.55 0.08 200);">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
										</svg>
										<span class="text-xs truncate">{file.name}</span>
										<span class="text-xs truncate ml-auto" style="color: oklch(0.45 0.01 250);">{file.folder}</span>
									</button>
								{/each}
							{/if}

							<div class="px-3 py-1.5 text-xs flex items-center gap-3" style="color: oklch(0.40 0.01 250); border-top: 1px solid oklch(0.25 0.02 250);">
								<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">↑↓</kbd> Navigate</span>
								<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">Tab</kbd> Select</span>
								<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">Esc</kbd> Close</span>
							</div>
						</div>
					{/if}
				</div>

				<div class="flex items-center gap-3 mt-3">
					<!-- Project selector -->
					<select
						bind:value={selectedProject}
						class="rounded-md px-2 py-1.5 text-xs"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
					>
						{#each projects as project}
							<option value={project.key}>{project.name}</option>
						{/each}
					</select>

					<!-- Model selector -->
					<div class="flex rounded-md overflow-hidden" style="border: 1px solid oklch(0.30 0.02 250);">
						{#each MODELS as model}
							<button
								onclick={() => selectedModel = model.id}
								class="px-3 py-1.5 text-xs transition-colors"
								style="
									background: {selectedModel === model.id ? 'oklch(0.35 0.08 200)' : 'oklch(0.14 0.01 250)'};
									color: {selectedModel === model.id ? 'oklch(0.95 0.01 200)' : 'oklch(0.65 0.01 250)'};
								"
								title={model.desc}
							>
								{model.label}
							</button>
						{/each}
					</div>

					<div class="flex-1"></div>

					<!-- Output action dropdown -->
					<div class="relative">
						<button
							onclick={() => (showOutputActionMenu = !showOutputActionMenu)}
							class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-all"
							style="
								background: oklch(0.22 0.02 250);
								color: oklch(0.75 0.01 250);
								border: 1px solid oklch(0.28 0.02 250);
							"
							title="Output action: {getOutputActionLabel(selectedOutputAction)}"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d={getOutputActionIcon(selectedOutputAction)} />
							</svg>
							{getOutputActionLabel(selectedOutputAction)}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 opacity-50">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
							</svg>
						</button>
						{#if showOutputActionMenu}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute top-full right-0 mt-1 w-52 rounded-lg overflow-hidden animate-scale-in z-40"
								style="background: oklch(0.20 0.02 250); border: 1px solid oklch(0.30 0.03 250); box-shadow: 0 8px 24px oklch(0 0 0 / 0.4);"
								onmouseleave={() => (showOutputActionMenu = false)}
							>
								{#each OUTPUT_ACTIONS as action}
									<button
										onclick={() => {
											selectedOutputAction = action.id;
											showOutputActionMenu = false;
										}}
										class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors"
										style="
											background: {selectedOutputAction === action.id ? 'oklch(0.30 0.05 200 / 0.3)' : 'transparent'};
											color: {selectedOutputAction === action.id ? 'oklch(0.85 0.10 200)' : 'oklch(0.70 0.01 250)'};
										"
										onmouseenter={(e) =>
											(e.currentTarget.style.background =
												selectedOutputAction === action.id
													? 'oklch(0.30 0.05 200 / 0.3)'
													: 'oklch(0.25 0.02 250)')}
										onmouseleave={(e) =>
											(e.currentTarget.style.background =
												selectedOutputAction === action.id
													? 'oklch(0.30 0.05 200 / 0.3)'
													: 'transparent')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
											<path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
										</svg>
										<div class="flex-1 min-w-0">
											<div class="font-medium">{action.label}</div>
											<div class="opacity-50" style="font-size: 10px;">{action.desc}</div>
										</div>
										{#if selectedOutputAction === action.id}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0" style="color: oklch(0.75 0.15 145);">
												<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
											</svg>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Run button -->
					<button
						onclick={runCustomCommand}
						disabled={!commandPrompt.trim() || isExecuting}
						class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
						style="
							background: {isExecuting ? 'oklch(0.30 0.05 200)' : commandPrompt.trim() ? 'oklch(0.50 0.15 200)' : 'oklch(0.25 0.02 250)'};
							color: {commandPrompt.trim() && !isExecuting ? 'oklch(0.98 0.01 200)' : 'oklch(0.50 0.01 250)'};
							cursor: {commandPrompt.trim() && !isExecuting ? 'pointer' : 'not-allowed'};
						"
					>
						{#if isExecuting}
							<span class="flex items-center gap-2">
								<svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
								</svg>
								Running...
							</span>
						{:else}
							Run <span class="opacity-50 ml-1 text-xs">{navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</span>
						{/if}
					</button>
				</div>
			</div>

			<!-- Result Display -->
			{#if executionResult}
				<div class="rounded-lg overflow-hidden" style="border: 1px solid {executionResult.error ? 'oklch(0.50 0.15 30 / 0.5)' : 'oklch(0.35 0.08 145 / 0.5)'};">
					<!-- Result header -->
					<div
						class="flex items-center justify-between px-4 py-2"
						style="background: {executionResult.error ? 'oklch(0.20 0.03 30)' : 'oklch(0.20 0.03 145)'};"
					>
						<div class="flex items-center gap-3">
							{#if executionResult.error}
								<span class="text-xs font-medium px-2 py-0.5 rounded" style="background: oklch(0.50 0.15 30 / 0.2); color: oklch(0.75 0.15 30);">Error</span>
							{:else}
								<span class="text-xs font-medium px-2 py-0.5 rounded" style="background: oklch(0.50 0.15 145 / 0.2); color: oklch(0.75 0.15 145);">Result</span>
							{/if}
							<span class="text-xs" style="color: oklch(0.60 0.01 250);">
								{executionResult.model} &middot; {formatDuration(executionResult.durationMs)} &middot; {executionResult.project}
								{#if executionResult.resolvedProviders && executionResult.resolvedProviders.length > 0}
									&middot; {executionResult.resolvedProviders.length} provider{executionResult.resolvedProviders.length > 1 ? 's' : ''}
								{/if}
								{#if executionResult.resolvedFiles && executionResult.resolvedFiles.length > 0}
									&middot; {executionResult.resolvedFiles.length} file{executionResult.resolvedFiles.length > 1 ? 's' : ''} injected
								{/if}
							</span>
							{#if executionResult.templateName}
								<span class="text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.30 0.05 270); color: oklch(0.75 0.10 270);">
									{executionResult.templateName}
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							{#if !executionResult.error}
								<button
									onclick={openSaveAsTemplate}
									class="text-xs px-2 py-1 rounded transition-colors"
									style="color: oklch(0.70 0.10 200); background: oklch(0.25 0.02 250);"
									title="Save as template"
								>
									Save as Template
								</button>
							{/if}
							<button
								onclick={() => executionResult = null}
								class="text-xs px-2 py-1 rounded transition-colors"
								style="color: oklch(0.55 0.01 250);"
							>
								Dismiss
							</button>
						</div>
					</div>
					<!-- Warnings (file + provider errors) -->
					{#if (executionResult.fileErrors && executionResult.fileErrors.length > 0) || (executionResult.providerErrors && executionResult.providerErrors.length > 0)}
						<div class="px-4 py-2" style="background: oklch(0.18 0.03 60); border-bottom: 1px solid oklch(0.30 0.05 60 / 0.3);">
							{#each [...(executionResult.fileErrors || []), ...(executionResult.providerErrors || [])] as warning}
								<div class="text-xs flex items-center gap-1.5" style="color: oklch(0.75 0.12 60);">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 shrink-0">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
									</svg>
									{warning}
								</div>
							{/each}
						</div>
					{/if}
					<!-- Resolved context bar (providers + files) -->
					{#if (executionResult.resolvedProviders && executionResult.resolvedProviders.length > 0) || (executionResult.resolvedFiles && executionResult.resolvedFiles.length > 0)}
						<div class="px-4 py-1.5 flex flex-wrap gap-1.5" style="background: oklch(0.17 0.02 200); border-bottom: 1px solid oklch(0.25 0.03 200 / 0.3);">
							{#if executionResult.resolvedProviders && executionResult.resolvedProviders.length > 0}
								{#each executionResult.resolvedProviders as provider}
									{@const providerIcon = provider.type === 'task' ? '📋' : provider.type === 'git' ? '🔀' : provider.type === 'memory' ? '🧠' : provider.type === 'url' ? '🔗' : '📎'}
									<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs" style="background: oklch(0.22 0.04 145 / 0.5); color: oklch(0.75 0.08 145);">
										<span class="text-[10px]">{providerIcon}</span>
										@{provider.type}:{provider.ref}
										<span style="color: oklch(0.50 0.04 145);">({(provider.size / 1024).toFixed(1)}KB)</span>
									</span>
								{/each}
							{/if}
							{#if executionResult.resolvedFiles && executionResult.resolvedFiles.length > 0}
								{#each executionResult.resolvedFiles as file}
									<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs" style="background: oklch(0.22 0.04 200 / 0.5); color: oklch(0.75 0.08 200);">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
										</svg>
										{file.path}
										<span style="color: oklch(0.50 0.04 200);">({(file.size / 1024).toFixed(1)}KB)</span>
									</span>
								{/each}
							{/if}
						</div>
					{/if}
					<!-- Result body -->
					<div class="px-4 py-3" style="background: oklch(0.16 0.01 250);">
						<pre class="text-sm whitespace-pre-wrap break-words" style="color: oklch(0.85 0.01 250); font-family: 'JetBrains Mono', 'Fira Code', monospace;">{executionResult.error || executionResult.result}</pre>
					</div>
				</div>
			{/if}

			<!-- Variable Input Modal (inline) -->
			{#if runningTemplate}
				<div class="rounded-lg p-4" style="background: oklch(0.22 0.02 270 / 0.3); border: 1px solid oklch(0.40 0.10 270 / 0.4);">
					<div class="flex items-center gap-2 mb-3">
						<h3 class="text-sm font-semibold" style="color: oklch(0.85 0.10 270);">
							{runningTemplate.name}
						</h3>
						<span class="text-xs" style="color: oklch(0.60 0.05 270);">Fill in variables</span>
					</div>
					<div class="flex flex-col gap-3">
						{#each runningTemplate.variables as variable}
							<div>
								<label class="block text-xs mb-1" style="color: oklch(0.70 0.01 250);">
									{variable.label || variable.name}
								</label>
								<input
									type="text"
									bind:value={variableValues[variable.name]}
									placeholder={variable.placeholder || variable.name}
									class="w-full rounded-md px-3 py-1.5 text-sm"
									style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
								/>
							</div>
						{/each}
					</div>
					<div class="flex items-center gap-2 mt-4">
						<button
							onclick={() => executeTemplate(runningTemplate!, variableValues)}
							class="px-4 py-1.5 rounded-md text-sm font-medium"
							style="background: oklch(0.50 0.15 270); color: oklch(0.98 0.01 270);"
						>
							Run
						</button>
						<button
							onclick={cancelTemplateRun}
							class="px-3 py-1.5 rounded-md text-sm"
							style="color: oklch(0.60 0.01 250);"
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			<!-- Tabs: Templates / History -->
			<div class="flex items-center gap-1" style="border-bottom: 1px solid oklch(0.28 0.02 250);">
				<button
					onclick={() => activeTab = 'templates'}
					class="px-4 py-2 text-sm font-medium transition-colors relative"
					style="color: {activeTab === 'templates' ? 'oklch(0.90 0.01 250)' : 'oklch(0.55 0.01 250)'};"
				>
					Templates
					{#if templates.length > 0}
						<span class="ml-1.5 text-xs" style="color: oklch(0.50 0.01 250);">{templates.length}</span>
					{/if}
					{#if activeTab === 'templates'}
						<div class="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style="background: oklch(0.65 0.15 200);"></div>
					{/if}
				</button>
				<button
					onclick={() => activeTab = 'history'}
					class="px-4 py-2 text-sm font-medium transition-colors relative"
					style="color: {activeTab === 'history' ? 'oklch(0.90 0.01 250)' : 'oklch(0.55 0.01 250)'};"
				>
					History
					{#if history.length > 0}
						<span class="ml-1.5 text-xs" style="color: oklch(0.50 0.01 250);">{history.length}</span>
					{/if}
					{#if activeTab === 'history'}
						<div class="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style="background: oklch(0.65 0.15 200);"></div>
					{/if}
				</button>
			</div>

			<!-- Templates Tab -->
			{#if activeTab === 'templates'}
				<div class="flex flex-col gap-3">
					{#if isLoading}
						<!-- Skeleton -->
						{#each [1, 2, 3] as _}
							<div class="rounded-lg p-4 skeleton" style="background: oklch(0.20 0.01 250); height: 80px;"></div>
						{/each}
					{:else if templates.length === 0}
						<div class="text-center py-12" style="color: oklch(0.50 0.01 250);">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 mx-auto mb-3 opacity-30">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
							<p class="text-sm">No templates yet</p>
							<p class="text-xs mt-1 opacity-60">Run a command and save it as a template, or create one from scratch</p>
						</div>
					{:else}
						{#each templates as template (template.id)}
							<div
								class="group rounded-lg p-4 transition-all"
								style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.28 0.02 250);"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<h3 class="text-sm font-medium truncate" style="color: oklch(0.88 0.01 250);">
												{template.name}
											</h3>
											<span class="text-xs px-1.5 py-0.5 rounded shrink-0" style="background: oklch(0.25 0.02 250); color: oklch(0.55 0.01 250);">
												{template.defaultModel || 'haiku'}
											</span>
											{#if template.defaultProject}
												<span class="text-xs px-1.5 py-0.5 rounded shrink-0" style="background: oklch(0.25 0.04 145); color: oklch(0.65 0.10 145);">
													{template.defaultProject}
												</span>
											{/if}
											{#if template.outputAction && template.outputAction !== 'display'}
												<span class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded shrink-0" style="background: oklch(0.25 0.04 200); color: oklch(0.60 0.08 200);">
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
														<path stroke-linecap="round" stroke-linejoin="round" d={getOutputActionIcon(template.outputAction)} />
													</svg>
													{getOutputActionLabel(template.outputAction)}
												</span>
											{/if}
											{#if template.variables && template.variables.length > 0}
												<span class="text-xs shrink-0" style="color: oklch(0.55 0.08 270);">
													{template.variables.length} var{template.variables.length > 1 ? 's' : ''}
												</span>
											{/if}
										</div>
										<p class="text-xs mt-1.5 line-clamp-2" style="color: oklch(0.55 0.01 250);">
											{truncate(template.prompt, 160)}
										</p>
									</div>
									<div class="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											onclick={() => startTemplateRun(template)}
											class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
											style="background: oklch(0.45 0.12 145); color: oklch(0.98 0.01 145);"
											title="Run template"
										>
											Run
										</button>
										<button
											onclick={() => openEditTemplate(template)}
											class="p-1.5 rounded transition-colors"
											style="color: oklch(0.55 0.01 250);"
											title="Edit template"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
											</svg>
										</button>
										<button
											onclick={() => deleteTemplate(template)}
											class="p-1.5 rounded transition-colors"
											style="color: oklch(0.55 0.10 30);"
											title="Delete template"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
											</svg>
										</button>
									</div>
								</div>
							</div>
						{/each}
					{/if}

					<!-- New template button -->
					<button
						onclick={openNewTemplate}
						class="rounded-lg p-3 text-sm transition-colors flex items-center justify-center gap-2"
						style="border: 1px dashed oklch(0.30 0.02 250); color: oklch(0.55 0.01 250);"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
						New Template
					</button>
				</div>
			{/if}

			<!-- History Tab -->
			{#if activeTab === 'history'}
				<div class="flex flex-col gap-2">
					{#if history.length === 0}
						<div class="text-center py-12" style="color: oklch(0.50 0.01 250);">
							<p class="text-sm">No execution history yet</p>
							<p class="text-xs mt-1 opacity-60">Run a command to see results here</p>
						</div>
					{:else}
						<div class="flex justify-end mb-1">
							<button
								onclick={clearHistory}
								class="text-xs px-2 py-1 rounded transition-colors"
								style="color: oklch(0.50 0.08 30);"
							>
								Clear History
							</button>
						</div>
						{#each history as entry (entry.id)}
							<div
								class="group rounded-lg p-3 transition-all cursor-pointer"
								style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.01 250);"
								onclick={() => rerunFromHistory(entry)}
								title="Click to load into command input"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="flex-1 min-w-0">
										<p class="text-xs truncate" style="color: oklch(0.75 0.01 250);">
											{truncate(entry.prompt, 100)}
										</p>
										{#if entry.error}
											<p class="text-xs mt-1 truncate" style="color: oklch(0.65 0.12 30);">
												{truncate(entry.error, 80)}
											</p>
										{:else}
											<p class="text-xs mt-1 truncate" style="color: oklch(0.50 0.01 250);">
												{truncate(entry.result, 80)}
											</p>
										{/if}
									</div>
									<div class="flex items-center gap-2 shrink-0">
										{#if entry.outputAction && entry.outputAction !== 'display'}
											<span class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.04 200); color: oklch(0.65 0.08 200);" title={getOutputActionLabel(entry.outputAction)}>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
													<path stroke-linecap="round" stroke-linejoin="round" d={getOutputActionIcon(entry.outputAction)} />
												</svg>
												{getOutputActionLabel(entry.outputAction)}
											</span>
										{/if}
										{#if entry.templateName}
											<span class="text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.04 270); color: oklch(0.65 0.08 270);">
												{entry.templateName}
											</span>
										{/if}
										<span class="text-xs" style="color: oklch(0.45 0.01 250);">
											{entry.model}
										</span>
										<span class="text-xs" style="color: oklch(0.45 0.01 250);">
											{formatDuration(entry.durationMs)}
										</span>
										<span class="text-xs" style="color: oklch(0.40 0.01 250);">
											{formatTime(entry.timestamp)}
										</span>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Template Editor Modal -->
{#if showTemplateEditor}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0.10 0.01 250 / 0.7);"
		onclick={(e) => { if (e.target === e.currentTarget) showTemplateEditor = false; }}
	>
		<div
			class="rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 animate-scale-in"
			style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
		>
			<h2 class="text-base font-semibold mb-4" style="color: oklch(0.90 0.01 250);">
				{editingTemplate ? 'Edit Template' : 'New Template'}
			</h2>

			<div class="flex flex-col gap-3">
				<!-- Name -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Name</label>
					<input
						type="text"
						bind:value={editorName}
						placeholder="Template name"
						class="w-full rounded-md px-3 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
					/>
				</div>

				<!-- Prompt -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">
						Prompt
						<span class="font-normal opacity-60 ml-1">Use {`{variableName}`} for placeholders, <code style="background: oklch(0.25 0.02 250); padding: 1px 3px; border-radius: 2px; color: oklch(0.65 0.10 200);">@</code> for files</span>
					</label>
					<div class="relative">
						<textarea
							bind:this={editorTextareaRef}
							bind:value={editorPrompt}
							placeholder="Enter the prompt template... Use @path/to/file to reference files"
							rows="4"
							class="w-full rounded-md px-3 py-2 text-sm resize-y"
							style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
							oninput={(e) => handleTextareaInput(e, 'editor')}
							onkeydown={(e) => handleTextareaKeydown(e, 'editor')}
							onblur={() => { setTimeout(() => { if (activeAutocompleteTarget === 'editor') showFileAutocomplete = false; }, 200); }}
						></textarea>

						<!-- @file autocomplete dropdown (editor) -->
						{#if showFileAutocomplete && activeAutocompleteTarget === 'editor' && fileSearchResults.length > 0}
							<div
								class="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-xl"
								style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.30 0.03 250); max-height: 200px; overflow-y: auto;"
							>
								<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
									Files matching: {fileSearchQuery}
								</div>
								{#each fileSearchResults as file, i (file.path)}
									<button
										class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
										style="
											background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
											color: oklch(0.85 0.01 250);
										"
										onmouseenter={() => fileAutocompleteIndex = i}
										onmousedown={(e) => { e.preventDefault(); selectFileFromAutocomplete(file); }}
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 shrink-0" style="color: oklch(0.55 0.08 200);">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
										</svg>
										<span class="text-xs truncate">{file.name}</span>
										<span class="text-xs truncate ml-auto" style="color: oklch(0.45 0.01 250);">{file.folder}</span>
									</button>
								{/each}
								<div class="px-3 py-1.5 text-xs flex items-center gap-3" style="color: oklch(0.40 0.01 250); border-top: 1px solid oklch(0.25 0.02 250);">
									<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">↑↓</kbd> Navigate</span>
									<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">Tab</kbd> Select</span>
									<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">Esc</kbd> Close</span>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Project & Model -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Default Project</label>
						<select
							bind:value={editorProject}
							class="w-full rounded-md px-2 py-2 text-sm"
							style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
						>
							<option value="">Any project</option>
							{#each projects as project}
								<option value={project.key}>{project.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Default Model</label>
						<select
							bind:value={editorModel}
							class="w-full rounded-md px-2 py-2 text-sm"
							style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
						>
							{#each MODELS as model}
								<option value={model.id}>{model.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Output Action -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Default Output Action</label>
					<div class="flex flex-wrap gap-1.5">
						{#each OUTPUT_ACTIONS as action}
							<button
								onclick={() => (editorOutputAction = action.id)}
								class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-all"
								style="
									background: {editorOutputAction === action.id ? 'oklch(0.30 0.05 200 / 0.3)' : 'oklch(0.16 0.01 250)'};
									color: {editorOutputAction === action.id ? 'oklch(0.85 0.10 200)' : 'oklch(0.60 0.01 250)'};
									border: 1px solid {editorOutputAction === action.id ? 'oklch(0.45 0.10 200 / 0.5)' : 'oklch(0.28 0.02 250)'};
								"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
									<path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
								</svg>
								{action.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Variables -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<label class="text-xs font-medium" style="color: oklch(0.65 0.01 250);">Variables</label>
						<button
							onclick={addEditorVariable}
							class="text-xs px-2 py-0.5 rounded"
							style="color: oklch(0.70 0.10 200);"
						>
							+ Add Variable
						</button>
					</div>
					{#each editorVariables as variable, i}
						<div class="flex items-center gap-2 mb-2">
							<input
								type="text"
								bind:value={editorVariables[i].name}
								placeholder="name"
								class="flex-1 rounded-md px-2 py-1.5 text-xs"
								style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
							/>
							<input
								type="text"
								bind:value={editorVariables[i].label}
								placeholder="Label"
								class="flex-1 rounded-md px-2 py-1.5 text-xs"
								style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
							/>
							<input
								type="text"
								bind:value={editorVariables[i].default}
								placeholder="Default"
								class="flex-1 rounded-md px-2 py-1.5 text-xs"
								style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
							/>
							<button
								onclick={() => removeEditorVariable(i)}
								class="p-1 rounded"
								style="color: oklch(0.50 0.08 30);"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>

				<!-- Error -->
				{#if editorError}
					<div class="text-xs p-2 rounded" style="background: oklch(0.25 0.05 30); color: oklch(0.75 0.15 30);">
						{editorError}
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center justify-end gap-2 mt-2">
					<button
						onclick={() => showTemplateEditor = false}
						class="px-4 py-2 rounded-md text-sm"
						style="color: oklch(0.60 0.01 250);"
					>
						Cancel
					</button>
					<button
						onclick={saveTemplate}
						disabled={editorSaving}
						class="px-4 py-2 rounded-md text-sm font-medium"
						style="background: oklch(0.50 0.15 200); color: oklch(0.98 0.01 200);"
					>
						{editorSaving ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Create Template'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Save as Template Modal -->
{#if showSaveAsTemplate}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0.10 0.01 250 / 0.7);"
		onclick={(e) => { if (e.target === e.currentTarget) showSaveAsTemplate = false; }}
	>
		<div
			class="rounded-xl w-full max-w-sm p-5 animate-scale-in"
			style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
		>
			<h2 class="text-base font-semibold mb-3" style="color: oklch(0.90 0.01 250);">Save as Template</h2>
			<input
				type="text"
				bind:value={saveTemplateName}
				placeholder="Template name"
				class="w-full rounded-md px-3 py-2 text-sm mb-3"
				style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
				onkeydown={(e) => { if (e.key === 'Enter') confirmSaveAsTemplate(); }}
			/>
			<div class="flex items-center justify-end gap-2">
				<button
					onclick={() => showSaveAsTemplate = false}
					class="px-3 py-1.5 rounded-md text-sm"
					style="color: oklch(0.60 0.01 250);"
				>
					Cancel
				</button>
				<button
					onclick={confirmSaveAsTemplate}
					disabled={!saveTemplateName.trim() || savingTemplate}
					class="px-4 py-1.5 rounded-md text-sm font-medium"
					style="background: oklch(0.50 0.15 200); color: oklch(0.98 0.01 200);"
				>
					{savingTemplate ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Write to File Modal -->
{#if showWriteFileModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0.10 0.01 250 / 0.7);"
		onclick={(e) => {
			if (e.target === e.currentTarget) {
				showWriteFileModal = false;
				pendingWriteResult = null;
			}
		}}
	>
		<div
			class="rounded-xl w-full max-w-md p-5 animate-scale-in"
			style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
		>
			<h2 class="text-base font-semibold mb-1" style="color: oklch(0.90 0.01 250);">Write Result to File</h2>
			<p class="text-xs mb-3" style="color: oklch(0.50 0.01 250);">
				{pendingWriteResult?.result ? `${pendingWriteResult.result.length} characters` : ''}
			</p>
			<div class="mb-3">
				<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">File Path</label>
				<input
					type="text"
					bind:value={writeFilePath}
					placeholder="e.g. output/result.md"
					class="w-full rounded-md px-3 py-2 text-sm"
					style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
					onkeydown={(e) => {
						if (e.key === 'Enter') confirmWriteFile();
					}}
				/>
			</div>
			{#if writeFileError}
				<div class="text-xs p-2 rounded mb-3" style="background: oklch(0.25 0.05 30); color: oklch(0.75 0.15 30);">
					{writeFileError}
				</div>
			{/if}
			<div class="flex items-center justify-end gap-2">
				<button
					onclick={() => {
						showWriteFileModal = false;
						pendingWriteResult = null;
					}}
					class="px-3 py-1.5 rounded-md text-sm"
					style="color: oklch(0.60 0.01 250);"
				>
					Cancel
				</button>
				<button
					onclick={confirmWriteFile}
					disabled={!writeFilePath.trim() || writingFile}
					class="px-4 py-1.5 rounded-md text-sm font-medium"
					style="
						background: {!writeFilePath.trim() || writingFile ? 'oklch(0.25 0.02 250)' : 'oklch(0.50 0.15 200)'};
						color: {!writeFilePath.trim() || writingFile ? 'oklch(0.50 0.01 250)' : 'oklch(0.98 0.01 200)'};
					"
				>
					{writingFile ? 'Writing...' : 'Write File'}
				</button>
			</div>
		</div>
	</div>
{/if}


<style>
	/* :global needed because chips are created via DOM manipulation, not Svelte templates */
	:global(.inline-file-chip) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 7px 1px 5px;
		margin: 0 2px;
		border-radius: 4px;
		background: oklch(0.25 0.06 200 / 0.4);
		border: 1px solid oklch(0.35 0.08 200 / 0.4);
		color: oklch(0.80 0.10 200);
		font-size: 0.75rem;
		line-height: 1.4;
		vertical-align: baseline;
		user-select: none;
		cursor: default;
		white-space: nowrap;
	}

	:global(.inline-file-chip:hover) {
		background: oklch(0.28 0.07 200 / 0.5);
		border-color: oklch(0.40 0.10 200 / 0.5);
	}

	:global(.inline-provider-chip) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 7px 1px 5px;
		margin: 0 2px;
		border-radius: 4px;
		background: oklch(0.25 0.06 145 / 0.4);
		border: 1px solid oklch(0.35 0.08 145 / 0.4);
		color: oklch(0.80 0.10 145);
		font-size: 0.75rem;
		line-height: 1.4;
		vertical-align: baseline;
		user-select: none;
		cursor: default;
		white-space: nowrap;
	}

	:global(.inline-provider-chip:hover) {
		background: oklch(0.28 0.07 145 / 0.5);
		border-color: oklch(0.40 0.10 145 / 0.5);
	}

	:global([contenteditable='true']:focus) {
		border-color: oklch(0.45 0.10 200) !important;
		box-shadow: 0 0 0 1px oklch(0.45 0.10 200 / 0.3);
	}
</style>
