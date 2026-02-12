<script lang="ts">
	/**
	 * TaskCreationDrawer Component
	 * DaisyUI drawer for creating new tasks from command palette
	 *
	 * Features:
	 * - Side panel drawer (doesn't block view)
	 * - Form validation for required fields
	 * - POST to /api/tasks endpoint
	 * - Success/error handling with visual feedback
	 * - File attachment dropzone (supports multiple files)
	 */

	import { tick, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { isTaskDrawerOpen, selectedDrawerProject, availableProjects, initialTaskText, initialIssueType, drawerCreationMode, type DrawerCreationMode } from '$lib/stores/drawerStore';
	import { broadcastTaskEvent } from '$lib/stores/taskEvents';
	import { broadcastSessionEvent } from '$lib/stores/sessionEvents';
	import { playSuccessChime, playErrorSound, playAttachmentSound } from '$lib/utils/soundEffects';
	import { getActiveProject, setActiveProject } from '$lib/stores/preferences.svelte';
	import { getFileTypeInfo, formatFileSize, getAcceptAttribute, type FileCategory } from '$lib/utils/fileUtils';
	import { getProjectColor } from '$lib/utils/projectColors';
	import VoiceInput from './VoiceInput.svelte';
	import PromptInput from './quick-commands/PromptInput.svelte';
	import CreatePaste from './tasks/CreatePaste.svelte';
	import CreateTemplate from './tasks/CreateTemplate.svelte';
	import CreateGenerator from './tasks/CreateGenerator.svelte';
	import CreatePlan from './tasks/CreatePlan.svelte';
	import { AGENT_PRESETS } from '$lib/types/agentProgram';
	import ProviderLogo from '$lib/components/agents/ProviderLogo.svelte';

	// Type for pending attachments (before upload)
	interface PendingAttachment {
		id: string;
		file: File;
		preview: string; // Object URL for preview (images only)
		category: FileCategory; // File category from fileUtils
		icon: string; // SVG path for non-image files
		iconColor: string; // oklch color for icon
	}

	// Reactive state from store
	let isOpen = $state(false);

	// Subscribe to store
	$effect(() => {
		const unsubscribe = isTaskDrawerOpen.subscribe(value => {
			isOpen = value;
		});
		return unsubscribe;
	});

	// Active creation mode (tab selection)
	let activeMode = $state<DrawerCreationMode>('task');

	// Sync activeMode from store when drawer opens
	$effect(() => {
		const unsubscribe = drawerCreationMode.subscribe(value => {
			activeMode = value;
		});
		return unsubscribe;
	});

	// Tab configuration
	const creationTabs: { id: DrawerCreationMode; label: string }[] = [
		{ id: 'task', label: 'Task' },
		{ id: 'paste', label: 'Paste' },
		{ id: 'template', label: 'Template' },
		{ id: 'generator', label: 'Gen' },
		{ id: 'plan', label: 'Plan' },
	];

	function navigateTab(direction: -1 | 1) {
		const idx = creationTabs.findIndex(t => t.id === activeMode);
		const next = idx + direction;
		if (next >= 0 && next < creationTabs.length) {
			activeMode = creationTabs[next].id;
			drawerCreationMode.set(activeMode);
			// Refocus drawer panel so subsequent arrow keys still fire
			requestAnimationFrame(() => drawerPanel?.focus());
		}
	}

	// Track if drawer was opened without an explicit project (requires user to select one)
	let projectSelectionRequired = $state(false);

	// Pre-fill project when drawer opens (read from store at open time)
	$effect(() => {
		if (isOpen) {
			// Priority: 1) selectedDrawerProject (explicit from caller)
			//           2) If no explicit project, require user selection (don't auto-select)
			const explicitProject = get(selectedDrawerProject);
			if (explicitProject) {
				formData.project = explicitProject;
				projectSelectionRequired = false;
			} else {
				// No explicit project - require user to select one first
				formData.project = '';
				projectSelectionRequired = true;
			}
		}
	});

	// Fetch project harness defaults when drawer opens
	$effect(() => {
		if (isOpen && Object.keys(projectHarnessMap).length === 0) {
			fetch('/api/projects?visible=true')
				.then(r => r.json())
				.then(data => {
					const map: Record<string, string> = {};
					for (const p of data.projects || []) {
						if (p.defaultHarness) map[p.name] = p.defaultHarness;
					}
					projectHarnessMap = map;
				})
				.catch(() => {});
		}
	});

	// Update harness when project selection changes (only on actual project change)
	let prevProject = $state<string>('');
	$effect(() => {
		if (formData.project && formData.project !== prevProject) {
			prevProject = formData.project;
			selectedHarness = projectHarnessMap[formData.project] || 'claude-code';
		}
	});

	// Reactive auto-focus when drawer opens - single reliable implementation
	// Uses requestAnimationFrame + 200ms delay to ensure drawer animation has started
	// and input is interactable. This handles both checkbox toggle and store-based opening.
	$effect(() => {
		if (isOpen) {
			requestAnimationFrame(() => {
				setTimeout(() => {
					if (!isOpen) return;

					// If project selection is required, focus and open the project dropdown
					if (projectSelectionRequired && projectDropdownBtn) {
						openProjectDropdown();
						// Focus the first menu item directly so arrow keys work immediately
						// Use setTimeout to ensure DOM has rendered the dropdown menu
						setTimeout(() => {
							const dropdown = projectDropdownBtn?.closest('.dropdown');
							const firstMenuItem = dropdown?.querySelector('.dropdown-content button') as HTMLButtonElement;
							if (firstMenuItem) {
								firstMenuItem.focus();
							} else {
								// Fallback to button if menu not rendered yet
								projectDropdownBtn?.focus();
							}
						}, 50);
					} else if (titleInput) {
						// Otherwise focus the title input as usual
						titleInput.focus();
						// Double-check focus was applied (some browsers need this)
						if (document.activeElement !== titleInput) {
							titleInput.focus();
						}
					}
				}, 200);
			});
		}
	});

	// Process initial text when drawer opens (e.g., from Project Notes "Create Task" button)
	$effect(() => {
		if (isOpen) {
			const text = get(initialTaskText);
			if (text && text.trim()) {
				// Process like paste: first non-empty line = title, rest = description
				const lines = text.split(/\r?\n/);

				let titleLine = '';
				let descriptionStartIndex = 0;

				for (let i = 0; i < lines.length; i++) {
					const trimmed = lines[i].trim();
					if (trimmed) {
						titleLine = trimmed;
						descriptionStartIndex = i + 1;
						break;
					}
				}

				const descriptionLines = lines.slice(descriptionStartIndex).filter(line => line.trim());
				const description = descriptionLines.join('\n').trim();

				formData.title = titleLine;
				formData.description = description;

				// Clear the initial text so it's not processed again
				initialTaskText.set(null);

				// Trigger AI analysis if we have both title and description
				if (titleLine && description) {
					tick().then(() => fetchSuggestions());
				}
			}
		}
	});

	// Pre-fill issue type when drawer opens (e.g., 'epic' from "Assign to Epic" context menu)
	$effect(() => {
		if (isOpen) {
			const type = get(initialIssueType);
			if (type) {
				formData.type = type;
				initialIssueType.set(null);
			}
		}
	});

	// Form state
	interface FormData {
		title: string;
		description: string;
		notes: string;
		priority: number;
		type: string;
		project: string;
		labels: string;
		command: string;
		due_date: string;
		schedule_type: 'none' | 'one-shot' | 'recurring';
		schedule_cron: string;
		next_run_at: string;
	}

	let formData = $state<FormData>({
		title: '',
		description: '',
		notes: '',
		priority: 1,
		type: 'task',
		project: '',
		labels: '',
		command: '/jat:start',
		due_date: '',
		schedule_type: 'none',
		schedule_cron: '',
		next_run_at: ''
	});

	// Command options for dropdown
	const commandOptions = [
		{ value: '/jat:start', label: '/jat:start' },
		{ value: '/jat:verify', label: '/jat:verify' },
		{ value: 'custom', label: 'Custom...' }
	];
	let customCommand = $state('');
	let showCustomCommand = $derived(formData.command === 'custom');

	// Model selection state (extends existing harness)
	let selectedModel = $state<string>('');

	// Derive available models from selected harness
	const availableModels = $derived(() => {
		const preset = AGENT_PRESETS.find(p => p.id === selectedHarness);
		return preset?.config.models || [];
	});

	// Update selected model when harness changes
	$effect(() => {
		const preset = AGENT_PRESETS.find(p => p.id === selectedHarness);
		if (preset) {
			selectedModel = preset.config.defaultModel || '';
		} else {
			selectedModel = '';
		}
	});

	// Derived: form fields should be disabled until project is selected (when required)
	const formDisabled = $derived(projectSelectionRequired && !formData.project);

	// Selected dependencies state (array of task objects)
	interface SelectedDependency {
		id: string;
		title: string;
		status: string;
		priority: number;
	}
	let selectedDependencies = $state<SelectedDependency[]>([]);

	// Available tasks for dependencies dropdown
	interface AvailableTask {
		id: string;
		title: string;
		status: string;
		priority: number;
	}
	let availableTasks = $state<AvailableTask[]>([]);
	let availableTasksLoading = $state(false);
	let showDependencyDropdown = $state(false);

	// Attachment state
	let pendingAttachments = $state<PendingAttachment[]>([]);
	let isDragOver = $state(false);
	let drawerDragCounter = $state(0); // Track nested drag enter/leave on drawer
	let fileInputRef: HTMLInputElement | null = null;

	// UI state
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});
	let submitError = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let titleInput: HTMLInputElement;
	let descriptionInputRef: ReturnType<typeof PromptInput> | undefined;
	let projectDropdownBtn: HTMLButtonElement;
	let drawerPanel: HTMLDivElement;
	let projectDropdownOpen = $state(false);
	let projectDropdownIndex = $state(0);

	// Harness selection state
	let selectedHarness = $state<string>('claude-code');
	let harnessDropdownOpen = $state(false);
	let projectHarnessMap = $state<Record<string, string>>({});

	// AI suggestion state
	let isLoadingSuggestions = $state(false);
	let suggestionsApplied = $state(false);
	let suggestionReasoning = $state('');
	let suggestionError = $state<string | null>(null);

	// Track if user has manually changed fields (to avoid overwriting)
	let userModifiedFields = $state<Set<string>>(new Set());

	// Pre-fetched open tasks for AI suggestions (loaded when drawer opens)
	let prefetchedOpenTasks = $state<any[]>([]);

	// Prefetch open tasks when drawer opens (so they're ready for AI suggestions)
	$effect(() => {
		if (isOpen && prefetchedOpenTasks.length === 0) {
			// Fetch in background - don't block UI
			fetch('/api/tasks?status=open')
				.then(res => res.json())
				.then(data => {
					prefetchedOpenTasks = (data.tasks || []).slice(0, 30);
				})
				.catch(err => console.error('Failed to prefetch tasks:', err));
		}
	});

	// Voice input state
	let voiceInputError = $state<string | null>(null);
	let isTitleRecording = $state(false);
	let isDescriptionRecording = $state(false);

	// Paste detection for multi-line text parsing
	// When user pastes text with line breaks, parse first line as title and rest as description
	async function handleTitlePaste(event: ClipboardEvent) {
		const pastedText = event.clipboardData?.getData('text') || '';

		// Only process if pasted text contains newlines (multi-line paste)
		if (!pastedText.includes('\n')) {
			return; // Let the default paste happen for single-line text
		}

		// Prevent default paste since we'll handle it
		event.preventDefault();

		// Split on first newline(s) - handle both \n and \r\n
		const lines = pastedText.split(/\r?\n/);

		// Find first non-empty line for title
		let titleLine = '';
		let descriptionStartIndex = 0;

		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (trimmed) {
				titleLine = trimmed;
				descriptionStartIndex = i + 1;
				break;
			}
		}

		// Collect remaining lines for description
		const descriptionLines = lines.slice(descriptionStartIndex).filter(line => line.trim());
		const description = descriptionLines.join('\n').trim();

		// Set title (append to existing if any, or replace)
		if (formData.title.trim()) {
			// If there's existing title, append pasted title
			formData.title = formData.title.trim() + ' ' + titleLine;
		} else {
			formData.title = titleLine;
		}

		// Set description (append to existing if any, or replace)
		if (description) {
			if (formData.description.trim()) {
				formData.description = formData.description.trim() + '\n\n' + description;
			} else {
				formData.description = description;
			}
		}

		// If we have both title and description now, trigger AI analysis immediately
		if (formData.title.trim() && formData.description.trim()) {
			// Small delay to let the state update
			await tick();
			fetchSuggestions();
		}

		// Focus remains on title input for user to adjust
		// (already there since paste happened in title input)
		await tick();
		if (titleInput) {
			// Move cursor to end of title for easy editing
			titleInput.selectionStart = titleInput.selectionEnd = formData.title.length;
		}
	}

	// Voice input handlers
	function handleTitleTranscription(event: CustomEvent<string>) {
		const text = event.detail;
		if (text) {
			// Append to existing title with space if needed
			formData.title = formData.title
				? formData.title + ' ' + text
				: text;
		}
		voiceInputError = null;
	}

	function handleDescriptionTranscription(event: CustomEvent<string>) {
		const text = event.detail;
		if (text) {
			const prefix = formData.description ? ' ' : '';
			descriptionInputRef?.appendText(prefix + text);
		}
		voiceInputError = null;
	}

	function handleVoiceInputError(event: CustomEvent<string>) {
		voiceInputError = event.detail;
		// Auto-clear error after 5 seconds
		setTimeout(() => {
			voiceInputError = null;
		}, 5000);
	}

	// Available options
	const priorityOptions = [
		{ value: 0, label: 'P0 (Critical)' },
		{ value: 1, label: 'P1 (High)' },
		{ value: 2, label: 'P2 (Medium)' },
		{ value: 3, label: 'P3 (Low)' },
		{ value: 4, label: 'P4 (Lowest)' }
	];

	const typeOptions = [
		{ value: 'task', label: 'Task', icon: '📋' },
		{ value: 'bug', label: 'Bug', icon: '🐛' },
		{ value: 'feature', label: 'Feature', icon: '✨' },
		{ value: 'epic', label: 'Epic', icon: '🏔️' },
		{ value: 'chore', label: 'Chore', icon: '🔧' }
	];

	// Human task detection - derived from harness selection
	const isHumanAction = $derived(selectedHarness === 'human');

	// Review override state: null = use project rules, 'always_review' = always require review, 'always_auto' = always auto-proceed
	let reviewOverride = $state<'always_review' | 'always_auto' | null>(null);

	// Computed default review action based on type/priority
	let computedReviewAction = $state<'auto' | 'review' | null>(null);
	let computedReviewReason = $state<string | null>(null);
	let isLoadingReviewPreview = $state(false);

	// Fetch the computed review action when type or priority changes
	async function fetchReviewPreview() {
		if (!formData.type) {
			computedReviewAction = null;
			computedReviewReason = null;
			return;
		}

		isLoadingReviewPreview = true;
		try {
			const response = await fetch('/api/review-rules/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: formData.type,
					priority: formData.priority
				})
			});

			if (response.ok) {
				const data = await response.json();
				computedReviewAction = data.action;
				computedReviewReason = data.reason;
			} else {
				computedReviewAction = null;
				computedReviewReason = null;
			}
		} catch (err) {
			console.error('Error fetching review preview:', err);
			computedReviewAction = null;
			computedReviewReason = null;
		} finally {
			isLoadingReviewPreview = false;
		}
	}

	// Trigger review preview when type or priority changes
	$effect(() => {
		// Track dependencies
		const _type = formData.type;
		const _priority = formData.priority;

		// Debounce the fetch to avoid excessive API calls
		const timeout = setTimeout(() => {
			fetchReviewPreview();
		}, 300);

		return () => clearTimeout(timeout);
	});

	// Dynamic projects list from store (populated by layout from tasks)
	let dynamicProjects = $state<string[]>([]);

	// Computed selected project color (uses projectColors utility for consistent colors)
	const selectedProjectColor = $derived(formData.project ? getProjectColor(formData.project) : null);

	// Project descriptions for AI context (fetched from /api/projects)
	interface ProjectInfo {
		name: string;
		description: string | null;
	}
	let projectDescriptions = $state<Map<string, string>>(new Map());

	// Track selected project from store for dynamic options
	let selectedProjectFromStore = $state<string | null>(null);

	// Subscribe to availableProjects store
	$effect(() => {
		const unsubscribe = availableProjects.subscribe(projects => {
			dynamicProjects = projects;
		});
		return unsubscribe;
	});

	// Fetch project descriptions when drawer opens
	$effect(() => {
		if (isOpen && projectDescriptions.size === 0) {
			fetch('/api/projects?visible=true')
				.then(res => res.json())
				.then(data => {
					const descMap = new Map<string, string>();
					for (const project of data.projects || []) {
						if (project.description) {
							descMap.set(project.name, project.description);
						}
					}
					projectDescriptions = descMap;
				})
				.catch(err => console.error('Failed to fetch project descriptions:', err));
		}
	});

	// Subscribe to selectedDrawerProject store
	$effect(() => {
		const unsubscribe = selectedDrawerProject.subscribe(project => {
			selectedProjectFromStore = project;
		});
		return unsubscribe;
	});

	// Note: projectOptions was removed - project is now pre-selected from TopBar dropdown
	// The project field in the form is read-only, showing the pre-selected project

	// Priority badge colors
	const priorityColors: Record<number, string> = {
		0: 'badge-error', // P0 - Critical
		1: 'badge-warning', // P1 - High
		2: 'badge-info', // P2 - Medium
		3: 'badge-ghost', // P3 - Low
		4: 'badge-ghost' // P4 - Lowest
	};

	// Fetch AI suggestions for task metadata
	async function fetchSuggestions() {
		// Only fetch if we have both title and description
		if (!formData.title.trim() || !formData.description.trim()) {
			return;
		}

		// Don't fetch if already loading or already applied
		if (isLoadingSuggestions || suggestionsApplied) {
			return;
		}

		isLoadingSuggestions = true;
		suggestionError = null;

		try {
			// Only send the selected project's description (not all projects)
			// User has already selected the project before opening the drawer
			const selectedProjectDesc = projectDescriptions.get(formData.project) || '';

			const response = await fetch('/api/tasks/suggest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: formData.title.trim(),
					description: formData.description.trim(),
					openTasks: prefetchedOpenTasks, // Pass pre-fetched tasks
					selectedProject: formData.project, // The user's selected project
					projectDescription: selectedProjectDesc // Only this project's description
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to get suggestions');
			}

			const data = await response.json();
			const suggestions = data.suggestions;

			// Apply suggestions to fields that user hasn't manually modified
			if (suggestions) {
				// Priority
				if (!userModifiedFields.has('priority') && suggestions.priority !== undefined) {
					formData.priority = suggestions.priority;
				}

				// Type
				if (!userModifiedFields.has('type') && suggestions.type) {
					formData.type = suggestions.type;
				}

				// Project - NO LONGER APPLIED from AI suggestions
				// Project is pre-selected from TopBar dropdown before opening drawer
				// AI suggestions should not override the user's project choice

				// Labels
				if (!userModifiedFields.has('labels') && suggestions.labels?.length > 0) {
					formData.labels = suggestions.labels.join(', ');
				}

				// Dependencies - add to selected list
				if (suggestions.dependencies?.length > 0) {
					// Wait for available tasks to load if project was just set
					await tick();
					setTimeout(async () => {
						if (suggestions.dependencies?.length > 0) {
							// Fetch task details for suggested dependencies
							for (const depId of suggestions.dependencies) {
								const existingTask = availableTasks.find(t => t.id === depId);
								if (existingTask && !selectedDependencies.some(d => d.id === depId)) {
									addDependency(existingTask);
								}
							}
						}
					}, 500); // Give time for available tasks to load
				}

				suggestionReasoning = suggestions.reasoning || '';
				suggestionsApplied = true;
			}
		} catch (err: any) {
			console.error('Error fetching suggestions:', err);
			// Provide more helpful error messages for common failures
			if (err.message === 'fetch failed' || err.name === 'TypeError') {
				// Network error - likely server not running or connection refused
				suggestionError = 'Unable to connect to suggestion service. Is the IDE server running?';
			} else if (err.message?.includes('ANTHROPIC_API_KEY')) {
				suggestionError = 'API key not configured. Add it in Settings > API Keys.';
			} else {
				suggestionError = err.message || 'Failed to get AI suggestions';
			}
		} finally {
			isLoadingSuggestions = false;
		}
	}

	// Handle description blur - trigger AI suggestions
	function handleDescriptionBlur() {
		// Small delay to avoid triggering on tab-through
		setTimeout(() => {
			fetchSuggestions();
		}, 100);
	}

	// Track field changes to avoid overwriting user input
	function markFieldModified(field: string) {
		userModifiedFields = new Set([...userModifiedFields, field]);
	}

	// Fetch available tasks for dependencies dropdown when project changes
	async function fetchAvailableTasks(project: string) {
		if (!project) {
			availableTasks = [];
			return;
		}

		availableTasksLoading = true;

		try {
			// Fetch open/in_progress tasks from selected project
			const response = await fetch(`/api/agents?full=true&project=${encodeURIComponent(project)}`);
			if (!response.ok) {
				throw new Error(`Failed to fetch tasks: ${response.statusText}`);
			}
			const data = await response.json();

			// Filter to open/in_progress tasks, excluding already selected dependencies
			const selectedIds = selectedDependencies.map(d => d.id);
			availableTasks = (data.tasks || [])
				.filter((t: any) =>
					!selectedIds.includes(t.id) &&
					(t.status === 'open' || t.status === 'in_progress')
				)
				.map((t: any) => ({
					id: t.id,
					title: t.title,
					status: t.status,
					priority: t.priority
				}))
				.sort((a: AvailableTask, b: AvailableTask) => a.priority - b.priority);
		} catch (err: any) {
			console.error('Error fetching available tasks:', err);
			availableTasks = [];
		} finally {
			availableTasksLoading = false;
		}
	}

	// Watch for project changes to refresh available tasks
	$effect(() => {
		if (formData.project) {
			fetchAvailableTasks(formData.project);
		} else {
			availableTasks = [];
		}
	});

	// Add a dependency to the selected list
	function addDependency(task: AvailableTask) {
		selectedDependencies = [...selectedDependencies, task];
		// Remove from available list
		availableTasks = availableTasks.filter(t => t.id !== task.id);
		showDependencyDropdown = false;
	}

	// Remove a dependency from the selected list
	function removeDependency(taskId: string) {
		const removed = selectedDependencies.find(d => d.id === taskId);
		selectedDependencies = selectedDependencies.filter(d => d.id !== taskId);
		// Add back to available list if it exists
		if (removed) {
			availableTasks = [...availableTasks, removed].sort((a, b) => a.priority - b.priority);
		}
	}

	// Cleanup object URLs when component is destroyed
	onDestroy(() => {
		pendingAttachments.forEach(att => URL.revokeObjectURL(att.preview));
	});

	// Handle file selection (from input or drop)
	function handleFiles(files: FileList | File[]) {
		const fileArray = Array.from(files);

		for (const file of fileArray) {
			// Generate unique ID
			const id = `att-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

			// Get file type info from utilities
			const typeInfo = getFileTypeInfo(file);
			const preview = typeInfo.previewable ? URL.createObjectURL(file) : '';

			pendingAttachments = [...pendingAttachments, {
				id,
				file,
				preview,
				category: typeInfo.category,
				icon: typeInfo.icon,
				iconColor: typeInfo.color
			}];
		}
	}

	// Handle drop on the whole drawer (prevents browser navigation on missed drops)
	function handleDrawerDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragOver = false;
		drawerDragCounter = 0;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			playAttachmentSound();
			handleFiles(files);
		}
	}

	// Handle drag over on drawer (must preventDefault to allow drop)
	function handleDrawerDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		// CRITICAL: Must set dropEffect for browser to allow the drop
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	// Handle drag enter on drawer (use counter to handle nested elements)
	function handleDrawerDragEnter(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		drawerDragCounter++;
		if (drawerDragCounter > 0) {
			isDragOver = true;
		}
	}

	// Handle drag leave on drawer
	function handleDrawerDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		drawerDragCounter--;
		if (drawerDragCounter <= 0) {
			drawerDragCounter = 0;
			isDragOver = false;
		}
	}

	// Remove an attachment
	function removeAttachment(id: string) {
		const att = pendingAttachments.find(a => a.id === id);
		if (att && att.preview) {
			URL.revokeObjectURL(att.preview);
		}
		pendingAttachments = pendingAttachments.filter(a => a.id !== id);
	}

	// Open file picker
	function openFilePicker() {
		fileInputRef?.click();
	}

	// Handle file input change
	function handleFileInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			handleFiles(input.files);
			// Reset input so same file can be selected again
			input.value = '';
		}
	}

	// Upload attachments for a task
	async function uploadAttachments(taskId: string): Promise<boolean> {
		let allSuccess = true;

		for (const att of pendingAttachments) {
			try {
				// Step 1: Upload file to server via /api/work/upload-image
				const formData = new FormData();
				formData.append('image', att.file, `task-${taskId}-${Date.now()}-${att.file.name}`);
				formData.append('sessionName', `task-${taskId}`);

				const uploadResponse = await fetch('/api/work/upload-image', {
					method: 'POST',
					body: formData
				});

				if (!uploadResponse.ok) {
					console.error('Failed to upload file:', att.file.name);
					allSuccess = false;
					continue;
				}

				const { filePath } = await uploadResponse.json();

				// Step 2: Store the file path in task-images.json via /api/tasks/{id}/image
				const saveResponse = await fetch(`/api/tasks/${taskId}/image`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						path: filePath,
						id: att.id
					})
				});

				if (!saveResponse.ok) {
					console.error('Failed to save attachment metadata:', att.file.name);
					allSuccess = false;
				}
			} catch (err) {
				console.error('Error processing attachment:', err);
				allSuccess = false;
			}
		}

		return allSuccess;
	}

	// Validate form
	function validateForm() {
		const errors: Record<string, string> = {};

		if (!formData.title.trim()) {
			errors.title = 'Title is required';
		}

		if (!formData.type) {
			errors.type = 'Type is required';
		}

		validationErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Handle form submission
	async function handleSubmit(e: Event) {
		e.preventDefault();

		// Reset previous errors
		submitError = null;
		successMessage = null;

		// Validate form
		if (!validateForm()) {
			return;
		}

		// Wait for any in-progress AI analysis to complete before saving
		// This handles the case where user pastes and immediately hits save shortcut
		if (isLoadingSuggestions) {
			// Wait for up to 5 seconds for analysis to complete
			const startWait = Date.now();
			while (isLoadingSuggestions && Date.now() - startWait < 5000) {
				await new Promise(resolve => setTimeout(resolve, 100));
				await tick(); // Ensure Svelte reactivity updates are flushed
			}
		}

		// Run AI analysis if not already done and we have content
		// This ensures suggestions are applied even if user skipped the description blur
		if (!suggestionsApplied && formData.title.trim() && formData.description.trim()) {
			await fetchSuggestions();
		}

		isSubmitting = true;

		try {
			// Parse labels and add harness/human-action labels
			const labels = formData.labels
				.split(',')
				.map((l) => l.trim())
				.filter((l) => l.length > 0);

			// Add human-action label when human harness selected
			if (selectedHarness === 'human' && !labels.includes('human-action')) {
				labels.push('human-action');
			}

			// Note: harness is stored via agent_program field, not labels

			// Get dependencies from selected list
			const dependencies = selectedDependencies.map(d => d.id);

			// Resolve command value
			const resolvedCommand = formData.command === 'custom' ? customCommand.trim() : formData.command;

			// Resolve agent_program and model from harness selection
			const agentProgram = selectedHarness && selectedHarness !== 'claude-code' ? selectedHarness : undefined;
			const modelValue = selectedModel || undefined;

			// Resolve scheduling fields
			let scheduleCron: string | undefined;
			let nextRunAt: string | undefined;
			if (formData.schedule_type === 'recurring' && formData.schedule_cron.trim()) {
				scheduleCron = formData.schedule_cron.trim();
			} else if (formData.schedule_type === 'one-shot' && formData.next_run_at) {
				nextRunAt = new Date(formData.next_run_at).toISOString();
			}

			// Prepare request body
			const requestBody = {
				title: formData.title.trim(),
				description: formData.description.trim() || undefined,
				notes: formData.notes.trim() || undefined,
				priority: formData.priority,
				type: formData.type,
				project: formData.project.trim() || undefined,
				labels: labels.length > 0 ? labels : undefined,
				deps: dependencies.length > 0 ? dependencies : undefined,
				review_override: reviewOverride || undefined,
				command: resolvedCommand !== '/jat:start' ? resolvedCommand : undefined,
				agent_program: agentProgram,
				model: modelValue,
				schedule_cron: scheduleCron,
				next_run_at: nextRunAt,
				due_date: formData.due_date || undefined
			};

			// POST to API endpoint
			const response = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to create task');
			}

			const data = await response.json();
			const taskId = data.task.id;

			// Upload attachments if any
			if (pendingAttachments.length > 0) {
				const uploadSuccess = await uploadAttachments(taskId);
				if (!uploadSuccess) {
					console.warn('Some attachments failed to upload');
				}
			}

			// Success!
			successMessage = `Task ${taskId} created successfully!`;
			playSuccessChime();

			// Broadcast task created event so pages can refresh immediately
			broadcastTaskEvent('task-created', taskId);

			// Handle different save actions
			if (pendingSaveAction === 'new') {
				// Save and New: Reset form but keep drawer open
				setTimeout(async () => {
					resetForm();
					successMessage = null;
					// Focus back on title field
					await tick();
					if (titleInput) {
						titleInput.focus();
					}
				}, 800);
			} else if (pendingSaveAction === 'start') {
				// Save and Start: Close drawer and spawn an agent for the task
				successMessage = `Task ${taskId} created! Spawning agent...`;

				try {
					// Spawn an agent for the newly created task via /api/work/spawn
					// This endpoint properly registers the agent, assigns the task, and starts Claude
					// Pass project explicitly since the task was just created and may not be discoverable
					// by project prefix alone (e.g., new projects not yet in JAT config)
					console.log('[TaskCreationDrawer] Spawning agent for task:', taskId, 'in project:', formData.project);

					const spawnResponse = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							taskId: taskId,
							project: formData.project || undefined
						})
					});

					// Parse response body once
					let spawnData;
					try {
						spawnData = await spawnResponse.json();
					} catch (jsonError) {
						console.error('[TaskCreationDrawer] Failed to parse spawn response:', jsonError);
						throw new Error('Invalid response from spawn API');
					}

					if (!spawnResponse.ok) {
						console.error('[TaskCreationDrawer] Spawn API returned error:', spawnData);
						throw new Error(spawnData.message || spawnData.error || 'Failed to spawn agent');
					}

					console.log('[TaskCreationDrawer] Spawn successful:', spawnData);
					successMessage = `Agent ${spawnData.session?.agentName || ''} spawned for ${taskId}!`;

					// Broadcast task created event
					broadcastTaskEvent('task-created', taskId);

					// Broadcast session spawned event so other pages refresh their session lists
					const sessionName = spawnData.session?.sessionName || `jat-${spawnData.session?.agentName}`;
					const agentName = spawnData.session?.agentName || '';
					broadcastSessionEvent('session-spawned', sessionName, agentName);

					setTimeout(() => {
						resetForm();
						isTaskDrawerOpen.set(false);
						successMessage = null;
					}, 1200);
				} catch (spawnError: any) {
					// Task was created but spawn failed - show warning but don't treat as full failure
					console.error('[TaskCreationDrawer] Spawn error:', spawnError);
					const errorMessage = spawnError?.message || String(spawnError) || 'Unknown error';
					successMessage = `Task ${taskId} created but agent spawn failed: ${errorMessage}`;
					setTimeout(() => {
						resetForm();
						isTaskDrawerOpen.set(false);
						successMessage = null;
					}, 2500);
				}
			} else {
				// Save and Close (default): Reset form and close drawer
				setTimeout(() => {
					resetForm();
					isTaskDrawerOpen.set(false);
					successMessage = null;
				}, 1500);
			}
		} catch (error: unknown) {
			console.error('Error creating task:', error);
			submitError = error instanceof Error ? error.message : 'Failed to create task. Please try again.';
			playErrorSound();
		} finally {
			isSubmitting = false;
		}
	}

	// Reset form to initial state
	function resetForm() {
		formData = {
			title: '',
			description: '',
			notes: '',
			priority: 1,
			type: 'task',
			project: '',
			labels: '',
			command: '/jat:start',
			due_date: '',
			schedule_type: 'none',
			schedule_cron: '',
			next_run_at: ''
		};
		customCommand = '';
		selectedModel = '';
		validationErrors = {};
		submitError = null;
		successMessage = null;

		// Reset project selection required state
		projectSelectionRequired = false;

		// Reset dependencies
		selectedDependencies = [];
		availableTasks = [];
		showDependencyDropdown = false;

		// Reset harness selection
		selectedHarness = 'claude-code';
		harnessDropdownOpen = false;
		prevProject = '';

		// Reset review override
		reviewOverride = null;
		computedReviewAction = null;
		computedReviewReason = null;

		// Reset AI suggestion state
		isLoadingSuggestions = false;
		suggestionsApplied = false;
		suggestionReasoning = '';
		suggestionError = null;
		userModifiedFields = new Set();
		prefetchedOpenTasks = []; // Will re-fetch next time drawer opens

		// Cleanup and reset attachments
		pendingAttachments.forEach(att => {
			if (att.preview) URL.revokeObjectURL(att.preview);
		});
		pendingAttachments = [];
		isDragOver = false;
		drawerDragCounter = 0;
	}

	// Track which save action to perform after submission
	type SaveAction = 'close' | 'new' | 'start';
	const SAVE_PREFERENCE_KEY = 'taskDrawer.savePreference';

	// Load saved preference from localStorage, default to 'close'
	function getStoredSavePreference(): SaveAction {
		if (typeof window === 'undefined') return 'close';
		const stored = localStorage.getItem(SAVE_PREFERENCE_KEY);
		if (stored === 'close' || stored === 'new' || stored === 'start') {
			return stored;
		}
		return 'close';
	}

	// Save preference to localStorage
	function storeSavePreference(action: SaveAction) {
		if (typeof window === 'undefined') return;
		localStorage.setItem(SAVE_PREFERENCE_KEY, action);
	}

	let pendingSaveAction = $state<SaveAction>(getStoredSavePreference());

	// Labels and icons for each save action
	const saveActionLabels: Record<SaveAction, string> = {
		close: 'Save',
		new: 'Save & New',
		start: 'Save & Start'
	};

	// Get the current default save action (loaded from preference)
	const defaultSaveAction = $derived(pendingSaveAction);

	// Handle drawer close
	function handleClose() {
		if (!isSubmitting) {
			resetForm();
			activeMode = 'task';
			drawerCreationMode.set('task');
			isTaskDrawerOpen.set(false);
		}
	}

	// Handle cancel button
	function handleCancel() {
		if (!isSubmitting) {
			resetForm();
			activeMode = 'task';
			drawerCreationMode.set('task');
			isTaskDrawerOpen.set(false);
		}
	}

	// Unified submit handler for all save actions
	async function submitWithAction(action: SaveAction) {
		pendingSaveAction = action;
		// Store the preference for next time
		storeSavePreference(action);

		// Create a synthetic event for handleSubmit
		const syntheticEvent = { preventDefault: () => {} } as Event;
		await handleSubmit(syntheticEvent);
	}

	// Handle project dropdown keyboard navigation
	function openProjectDropdown() {
		projectDropdownOpen = true;
		projectDropdownIndex = formData.project ? dynamicProjects.indexOf(formData.project) : 0;
		if (projectDropdownIndex < 0) projectDropdownIndex = 0;
	}

	function closeProjectDropdown() {
		projectDropdownOpen = false;
		projectDropdownBtn?.focus();
	}

	function selectProjectByIndex(index: number) {
		if (index >= 0 && index < dynamicProjects.length) {
			const project = dynamicProjects[index];
			formData.project = project;
			setActiveProject(project);
			projectDropdownOpen = false;

			// If project selection was required, focus the title input after selection
			// Otherwise focus back on the dropdown button
			if (projectSelectionRequired && titleInput) {
				// Small delay to let the dropdown close animation complete
				setTimeout(() => titleInput?.focus(), 50);
			} else {
				projectDropdownBtn?.focus();
			}
		}
	}

	function handleProjectDropdownKeydown(event: KeyboardEvent) {
		if (!projectDropdownOpen) {
			// Open on Enter, Space, or ArrowDown when focused on button
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
				event.preventDefault();
				openProjectDropdown();
			}
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				projectDropdownIndex = (projectDropdownIndex + 1) % dynamicProjects.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				projectDropdownIndex = projectDropdownIndex <= 0 ? dynamicProjects.length - 1 : projectDropdownIndex - 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				selectProjectByIndex(projectDropdownIndex);
				break;
			case 'Escape':
				event.preventDefault();
				closeProjectDropdown();
				break;
			case 'Tab':
				closeProjectDropdown();
				break;
		}
	}

	// Callback for Create* components when tasks are created
	function handleNonTaskModeCreated() {
		resetForm();
		activeMode = 'task';
		drawerCreationMode.set('task');
		isTaskDrawerOpen.set(false);
	}

	// Handle keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// Arrow keys navigate tabs when no text input is active, or focused input is empty
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
			const isTextInput = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
			if (!isTextInput || !el.value) {
				event.preventDefault();
				navigateTab(event.key === 'ArrowLeft' ? -1 : 1);
				return;
			}
		}

		// Alt + P = Focus/open project dropdown
		if (event.altKey && event.key.toLowerCase() === 'p') {
			event.preventDefault();
			if (projectDropdownBtn) {
				projectDropdownBtn.focus();
				openProjectDropdown();
			}
			return;
		}
		// Cmd/Ctrl + Shift + Enter = Save and New
		if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter') {
			event.preventDefault();
			if (!isSubmitting) {
				submitWithAction('new');
			}
		}
		// Cmd/Ctrl + Enter = Save and Start (spawn agent) - primary action
		else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			if (!isSubmitting) {
				submitWithAction('start');
			}
		}
		// Alt + Enter = Save and Close
		else if (event.altKey && event.key === 'Enter') {
			event.preventDefault();
			if (!isSubmitting) {
				submitWithAction('close');
			}
		}
	}
</script>

<!-- DaisyUI Drawer -->
<div class="drawer drawer-end z-50">
	<input id="task-creation-drawer" type="checkbox" class="drawer-toggle" bind:checked={isOpen} />

	<!-- Drawer side -->
	<div class="drawer-side">
		<label aria-label="close sidebar" class="drawer-overlay" onclick={handleClose}></label>

		<!-- Drawer Panel (fixed height, header/footer sticky, content scrolls) - Industrial -->
		<!-- Entire drawer is a drop zone to prevent browser navigation on missed drops -->
		<div
			bind:this={drawerPanel}
			tabindex="-1"
			class="h-full w-full max-w-2xl flex flex-col shadow-2xl bg-base-300 border-l border-base-content/30 relative outline-none"
			role="dialog"
			aria-labelledby="drawer-title"
			onkeydown={handleKeydown}
			ondrop={handleDrawerDrop}
			ondragover={handleDrawerDragOver}
			ondragenter={handleDrawerDragEnter}
			ondragleave={handleDrawerDragLeave}
		>
			<!-- Full-drawer drop overlay -->
			{#if isDragOver && !formDisabled}
				<div class="absolute inset-0 z-50 flex items-center justify-center bg-base-300/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
					<div class="text-center">
						<svg class="w-16 h-16 mx-auto mb-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
						</svg>
						<p class="font-mono text-lg font-semibold text-primary">Drop files anywhere</p>
						<p class="font-mono text-sm mt-1 text-base-content/60">Files will be added as attachments</p>
					</div>
				</div>
			{/if}
			<!-- Header - Industrial -->
			<div
				class="flex items-center justify-between p-6 relative bg-base-200 border-b border-base-content/30"
			>
				<!-- Left accent bar -->
				<div
					class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-primary/30"
				></div>
				<div class="flex-1 min-w-0">
					<div class="flex items-start justify-between gap-4">
					<div class="flex flex-col gap-0.5">
						<h2 id="drawer-title" class="text-xl font-bold font-mono uppercase tracking-wider text-base-content">Create New Task</h2>
						<p class="text-sm {formDisabled ? 'text-warning' : 'text-base-content/70'}">
							{#if formDisabled}
								Select a project to continue
							{:else}
								Fill in the details below to create a new task
							{/if}
						</p>
					</div>
					<!-- Right-aligned stacked selectors: Project on top, Harness below -->
					<div class="flex flex-col items-end gap-1.5 flex-shrink-0">
						<!-- Project dropdown in header (Alt+P to open, arrows to navigate) -->
						<div class="dropdown dropdown-end {projectDropdownOpen ? 'dropdown-open' : ''}">
							<button
								type="button"
								tabindex="0"
								bind:this={projectDropdownBtn}
								class="badge badge-lg gap-1.5 px-2.5 pt-1 font-mono text-sm transition-colors cursor-pointer"
								style={formData.project && selectedProjectColor
									? `background: color-mix(in oklch, ${selectedProjectColor} 20%, transparent); border-color: color-mix(in oklch, ${selectedProjectColor} 50%, transparent); color: ${selectedProjectColor};`
									: formData.project
									? 'background: oklch(0.65 0.15 145 / 0.20); border-color: oklch(0.65 0.15 145 / 0.40); color: oklch(0.65 0.15 145);'
									: 'background: oklch(0.75 0.15 85 / 0.20); border-color: oklch(0.75 0.15 85 / 0.40); color: oklch(0.75 0.15 85);'}
								disabled={isSubmitting}
								title={formData.project ? 'Click to change project (Alt+P)' : 'Select a project (Alt+P)'}
								onclick={() => projectDropdownOpen ? closeProjectDropdown() : openProjectDropdown()}
								onkeydown={handleProjectDropdownKeydown}
								onblur={(e) => {
									// Close dropdown if focus leaves the dropdown entirely
									const relatedTarget = e.relatedTarget as HTMLElement;
									if (!relatedTarget?.closest('.dropdown')) {
										projectDropdownOpen = false;
									}
								}}
							>
								{#if !formData.project}
									<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
									</svg>
								{/if}
								{formData.project?.toUpperCase() || 'Select project'}
								<svg class="w-2.5 h-2.5 opacity-60 transition-transform {projectDropdownOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							<ul
								class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg border border-base-content/20 mt-1"
								role="listbox"
							>
								{#each dynamicProjects as project, i}
									<li role="presentation">
										<button
											type="button"
											role="option"
											aria-selected={formData.project === project}
											class="font-mono {formData.project === project ? 'active' : ''} {projectDropdownOpen && projectDropdownIndex === i ? 'focus bg-base-300' : ''}"
											onclick={() => { selectProjectByIndex(i); }}
											onmouseenter={() => projectDropdownIndex = i}
											onkeydown={(e) => {
												if (e.key === 'ArrowDown') {
													e.preventDefault();
													const nextIndex = (i + 1) % dynamicProjects.length;
													projectDropdownIndex = nextIndex;
													// Focus the next item
													const nextItem = e.currentTarget.closest('ul')?.querySelectorAll('button')[nextIndex];
													(nextItem as HTMLButtonElement)?.focus();
												} else if (e.key === 'ArrowUp') {
													e.preventDefault();
													const prevIndex = i <= 0 ? dynamicProjects.length - 1 : i - 1;
													projectDropdownIndex = prevIndex;
													// Focus the previous item
													const prevItem = e.currentTarget.closest('ul')?.querySelectorAll('button')[prevIndex];
													(prevItem as HTMLButtonElement)?.focus();
												} else if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													selectProjectByIndex(i);
												} else if (e.key === 'Escape') {
													e.preventDefault();
													closeProjectDropdown();
													projectDropdownBtn?.focus();
												}
											}}
										>
											<span
												class="w-2 h-2 rounded-full flex-shrink-0"
												style="background: {getProjectColor(project)};"
											></span>
											{project.toUpperCase()}
											{#if formData.project === project}
												<svg class="w-4 h-4 ml-auto text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
												</svg>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						</div>

						<!-- Harness + Model Selector Badge -->
						<div class="dropdown dropdown-end" class:dropdown-open={harnessDropdownOpen}>
							<button type="button"
								class="badge badge-lg gap-1.5 px-2 pt-0.5 font-mono text-xs cursor-pointer"
								style="background: oklch(0.30 0.03 250); border-color: oklch(0.40 0.04 250); color: oklch(0.75 0.02 250);"
								disabled={formDisabled || isSubmitting}
								onclick={() => harnessDropdownOpen = !harnessDropdownOpen}
							>
								<ProviderLogo agentId={selectedHarness} size={14} />
								<span>{AGENT_PRESETS.find(p => p.id === selectedHarness)?.config.name || selectedHarness}{#if selectedModel && selectedHarness !== 'human'}<span class="opacity-50">/{selectedModel}</span>{/if}</span>
								<svg class="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							{#if harnessDropdownOpen}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="dropdown-content bg-base-200 rounded-box z-50 w-56 p-2 shadow-lg border border-base-content/10" onclick={(e) => e.stopPropagation()}>
									<!-- Agent programs -->
									<ul class="menu p-0">
										{#each AGENT_PRESETS as preset}
											<li>
												<button class="flex items-center gap-2 {selectedHarness === preset.id ? 'active' : ''}"
													onclick={() => { selectedHarness = preset.id; if (preset.id === 'human') harnessDropdownOpen = false; }}
												>
													<ProviderLogo agentId={preset.id} size={16} />
													<span>{preset.config.name}</span>
													{#if selectedHarness === preset.id}
														<svg class="w-4 h-4 ml-auto text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
														</svg>
													{/if}
												</button>
											</li>
										{/each}
									</ul>
									<!-- Model selector (when non-human harness is selected) -->
									{#if selectedHarness !== 'human' && availableModels().length > 0}
										<div class="divider my-1 text-xs text-base-content/40">MODEL</div>
										<ul class="menu p-0">
											{#each availableModels() as model}
												<li>
													<button class="flex items-center gap-2 text-xs {selectedModel === model.shortName ? 'active' : ''}"
														onclick={() => { selectedModel = model.shortName; harnessDropdownOpen = false; }}
													>
														<span class="badge badge-xs {model.costTier === 'high' ? 'badge-warning' : model.costTier === 'medium' ? 'badge-info' : 'badge-ghost'}">{model.costTier?.[0]?.toUpperCase() || '?'}</span>
														<span>{model.name}</span>
														{#if selectedModel === model.shortName}
															<svg class="w-3.5 h-3.5 ml-auto text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
															</svg>
														{/if}
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{/if}
						</div>
					</div>
					</div>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
					aria-label="Close drawer"
				>
					✕
				</button>
			</div>

			<!-- Tab Strip -->
			<div class="flex border-b border-base-content/20 bg-base-200 px-6 gap-1">
				{#each creationTabs as tab}
					<button
						type="button"
						class="px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wider transition-colors relative
							{activeMode === tab.id
								? 'text-primary'
								: 'text-base-content/50 hover:text-base-content/80'}"
						onclick={() => { activeMode = tab.id; drawerCreationMode.set(tab.id); }}
					>
						{tab.label}
						{#if activeMode === tab.id}
							<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Content: Task mode (original form) -->
			{#if activeMode === 'task'}
			<form onsubmit={handleSubmit} class="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 bg-base-300">
				<div class="space-y-3">
					<!-- Title (Required) - Industrial -->
					<div class="form-control">
						<label class="label justify-between w-full py-0.5" for="task-title">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
								Title
								<span class="text-error">*</span>
							</span>
						</label>
						<div class="flex items-center gap-2">
							<input
								id="task-title"
								type="text"
								placeholder={formDisabled ? "Select a project first..." : "Paste task text or enter title..."}
								class="input flex-1 font-mono bg-base-200 border-base-content/30 text-base-content {validationErrors.title ? 'input-error' : ''} {formDisabled ? 'opacity-50' : ''}"
								bind:this={titleInput}
								bind:value={formData.title}
								onpaste={handleTitlePaste}
								disabled={formDisabled || isSubmitting}
								required
								autofocus={isOpen && !projectSelectionRequired}
							/>
							<VoiceInput
								size="sm"
								disabled={formDisabled || isSubmitting}
								ontranscription={handleTitleTranscription}
								onerror={handleVoiceInputError}
								onstart={() => isTitleRecording = true}
								onend={() => isTitleRecording = false}
							/>
						</div>
						{#if validationErrors.title}
							<label class="label">
								<span class="label-text-alt text-error">{validationErrors.title}</span>
							</label>
						{/if}
					</div>

					<!-- Description (Optional) - Industrial -->
					<div class="form-control">
						<label class="label py-0.5" for="task-description">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">Description</span>
							<span class="flex items-center gap-1.5 -mt-2">
								{#if isLoadingSuggestions}
									<span class="flex items-center gap-1.5 text-xs text-primary">
										<span class="loading loading-spinner loading-xs"></span>
										Analyzing...
									</span>
								{/if}
								<VoiceInput
									size="sm"
									disabled={formDisabled || isSubmitting}
									ontranscription={handleDescriptionTranscription}
									onerror={handleVoiceInputError}
									onstart={() => isDescriptionRecording = true}
									onend={() => isDescriptionRecording = false}
								/>
							</span>
						</label>
						<PromptInput
							bind:this={descriptionInputRef}
							bind:value={formData.description}
							project={formData.project}
							placeholder={formDisabled ? "Select a project first..." : "Enter task description... Use @ to attach files and context"}
							rows={5}
							disabled={formDisabled || isSubmitting}
							onblur={handleDescriptionBlur}
						/>
						<label class="label">
							<span class="label-text-alt text-base-content/60">
								{#if suggestionsApplied}
									AI suggestions applied - adjust as needed
								{:else}
									Supports markdown • Tab out to auto-fill fields
								{/if}
							</span>
						</label>
					</div>

					<!-- Voice Input Error Message -->
					{#if voiceInputError}
						<div
							class="rounded-lg p-3 bg-error/20 border border-error/30"
						>
							<div class="flex items-center gap-2">
								<svg class="w-4 h-4 flex-shrink-0 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
								</svg>
								<span class="text-sm text-base-content">
									{voiceInputError}
								</span>
								<button
									type="button"
									class="btn btn-xs btn-ghost ml-auto"
									onclick={() => voiceInputError = null}
								>
									Dismiss
								</button>
							</div>
						</div>
					{/if}

					<!-- Notes (Optional) — collapsed disclosure -->
					<details class="group">
						<summary class="cursor-pointer list-none flex items-center gap-1.5 text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 py-1">
							<svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
							Notes
							<span class="font-normal normal-case tracking-normal text-base-content/40 flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
								Not sent to AI
							</span>
							{#if formData.notes}
								<span class="badge badge-xs bg-base-content/20 text-base-content/60 ml-auto normal-case tracking-normal font-normal">has notes</span>
							{/if}
						</summary>
						<div class="mt-1">
							<textarea
								id="task-notes"
								placeholder={formDisabled ? "Select a project first..." : "Personal notes, reference links, etc."}
								class="textarea w-full h-20 font-mono text-sm bg-base-200 border-base-content/30 text-base-content {formDisabled ? 'opacity-50' : ''}"
								bind:value={formData.notes}
								disabled={formDisabled || isSubmitting}
							></textarea>
						</div>
					</details>

					<!-- AI Suggestion Reasoning - Show when suggestions applied -->
					{#if suggestionReasoning}
						<div
							class="rounded-lg p-3 bg-primary/10 border border-primary/30"
						>
							<div class="flex items-start gap-2">
								<svg class="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<div>
									<p class="text-xs font-semibold font-mono uppercase tracking-wider mb-1 text-primary">
										AI Analysis
									</p>
									<p class="text-sm text-base-content/90">
										{suggestionReasoning}
									</p>
								</div>
								<button
									type="button"
									class="btn btn-xs btn-ghost btn-circle ml-auto"
									onclick={() => suggestionReasoning = ''}
									title="Dismiss"
								>
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>
					{/if}

					<!-- AI Suggestion Error -->
					{#if suggestionError}
						<div
							class="rounded-lg p-3 bg-error/20 border border-error/30"
						>
							<div class="flex items-center gap-2">
								<svg class="w-4 h-4 flex-shrink-0 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
								<span class="text-sm text-base-content">
									{suggestionError}
								</span>
								<button
									type="button"
									class="btn btn-xs btn-ghost ml-auto"
									onclick={() => { suggestionError = null; suggestionsApplied = false; fetchSuggestions(); }}
								>
									Retry
								</button>
							</div>
						</div>
					{/if}

					<!-- Type / Priority / Labels — 3-col grid -->
					<div class="grid grid-cols-3 gap-3">
						<!-- Type (Required) -->
						<div class="form-control">
							<label class="label py-0.5" for="task-type">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Type <span class="text-error">*</span>
									{#if suggestionsApplied && !userModifiedFields.has('type')}
										<span class="badge badge-xs ml-1 bg-primary/30 text-base-content">AI</span>
									{/if}
								</span>
							</label>
							<select
								id="task-type"
								class="select select-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content {validationErrors.type ? 'select-error' : ''} {formDisabled ? 'opacity-50' : ''}"
								bind:value={formData.type}
								onchange={() => markFieldModified('type')}
								disabled={formDisabled || isSubmitting}
								required
							>
								{#each typeOptions as option}
									<option value={option.value}>{option.label} {option.icon}</option>
								{/each}
							</select>
						</div>

						<!-- Priority (Required) -->
						<div class="form-control">
							<label class="label py-0.5" for="task-priority">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Priority <span class="text-error">*</span>
									{#if suggestionsApplied && !userModifiedFields.has('priority')}
										<span class="badge badge-xs ml-1 bg-primary/30 text-base-content">AI</span>
									{/if}
								</span>
							</label>
							<select
								id="task-priority"
								class="select select-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content {formDisabled ? 'opacity-50' : ''}"
								bind:value={formData.priority}
								onchange={() => markFieldModified('priority')}
								disabled={formDisabled || isSubmitting}
								required
							>
								{#each priorityOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>

						<!-- Labels (Optional) -->
						<div class="form-control">
							<label class="label py-0.5" for="task-labels">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Labels
									{#if suggestionsApplied && !userModifiedFields.has('labels') && formData.labels}
										<span class="badge badge-xs ml-1 bg-primary/30 text-base-content">AI</span>
									{/if}
								</span>
							</label>
							<input
								id="task-labels"
								type="text"
								placeholder={formDisabled ? "" : "frontend, urgent"}
								class="input input-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content {formDisabled ? 'opacity-50' : ''}"
								bind:value={formData.labels}
								oninput={() => markFieldModified('labels')}
								disabled={formDisabled || isSubmitting}
							/>
						</div>
					</div>
					{#if validationErrors.type}
						<div class="text-xs text-error -mt-2">{validationErrors.type}</div>
					{/if}

					<!-- Command / Due Date — 2-col grid -->
					<div class="grid grid-cols-2 gap-3">
						<!-- Command -->
						<div class="form-control">
							<label class="label py-0.5" for="task-command">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Command
								</span>
							</label>
							{#if showCustomCommand}
								<div class="flex gap-1">
									<input
										id="task-command-custom"
										type="text"
										placeholder="e.g. npm run test"
										class="input input-sm flex-1 font-mono bg-base-200 border-base-content/30 text-base-content {formDisabled ? 'opacity-50' : ''}"
										bind:value={customCommand}
										disabled={formDisabled || isSubmitting}
									/>
									<button
										type="button"
										class="btn btn-sm btn-ghost btn-square"
										title="Back to presets"
										onclick={() => { formData.command = '/jat:start'; customCommand = ''; }}
										disabled={formDisabled || isSubmitting}
									>
										<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							{:else}
								<select
									id="task-command"
									class="select select-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content {formDisabled ? 'opacity-50' : ''}"
									bind:value={formData.command}
									disabled={formDisabled || isSubmitting}
								>
									{#each commandOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							{/if}
						</div>

						<!-- Due Date -->
						<div class="form-control">
							<label class="label py-0.5" for="task-due-date">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Due Date
								</span>
							</label>
							<input
								id="task-due-date"
								type="date"
								class="input input-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content {formDisabled ? 'opacity-50' : ''}"
								bind:value={formData.due_date}
								disabled={formDisabled || isSubmitting}
							/>
						</div>
					</div>

					<!-- Schedule (Optional) — collapsed disclosure -->
					<details class="group">
						<summary class="cursor-pointer list-none flex items-center gap-1.5 text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70 py-1">
							<svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
							Schedule
							{#if formData.schedule_type !== 'none'}
								<span class="badge badge-xs bg-primary/30 text-base-content ml-1">
									{formData.schedule_type === 'one-shot' ? 'One-shot' : 'Recurring'}
								</span>
							{/if}
						</summary>
						<div class="mt-2 space-y-2">
							<!-- Schedule type selection -->
							<div class="join w-full">
								<button
									type="button"
									class="join-item btn btn-sm flex-1 font-mono text-xs {formData.schedule_type === 'none' ? 'btn-active' : 'btn-ghost'}"
									onclick={() => formData.schedule_type = 'none'}
									disabled={formDisabled || isSubmitting}
								>
									None
								</button>
								<button
									type="button"
									class="join-item btn btn-sm flex-1 font-mono text-xs {formData.schedule_type === 'one-shot' ? 'btn-active btn-info' : 'btn-ghost'}"
									onclick={() => formData.schedule_type = 'one-shot'}
									disabled={formDisabled || isSubmitting}
								>
									One-shot
								</button>
								<button
									type="button"
									class="join-item btn btn-sm flex-1 font-mono text-xs {formData.schedule_type === 'recurring' ? 'btn-active btn-warning' : 'btn-ghost'}"
									onclick={() => formData.schedule_type = 'recurring'}
									disabled={formDisabled || isSubmitting}
								>
									Recurring
								</button>
							</div>

							<!-- One-shot: datetime picker -->
							{#if formData.schedule_type === 'one-shot'}
								<div class="form-control">
									<label class="label py-0.5" for="task-next-run">
										<span class="label-text text-xs font-mono text-base-content/60">Run at</span>
									</label>
									<input
										id="task-next-run"
										type="datetime-local"
										class="input input-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content"
										bind:value={formData.next_run_at}
										disabled={formDisabled || isSubmitting}
									/>
								</div>
							{/if}

							<!-- Recurring: cron expression -->
							{#if formData.schedule_type === 'recurring'}
								<div class="form-control">
									<label class="label py-0.5" for="task-cron">
										<span class="label-text text-xs font-mono text-base-content/60">Cron expression</span>
									</label>
									<input
										id="task-cron"
										type="text"
										placeholder="0 9 * * MON-FRI"
										class="input input-sm w-full font-mono bg-base-200 border-base-content/30 text-base-content"
										bind:value={formData.schedule_cron}
										disabled={formDisabled || isSubmitting}
									/>
									<label class="label py-0">
										<span class="label-text-alt text-base-content/40">min hour day month weekday</span>
									</label>
								</div>
							{/if}
						</div>
					</details>

					<!-- Attachments Dropzone - Industrial -->
					<div class="form-control">
						<label class="label py-0.5">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
								Attachments
							</span>
							{#if pendingAttachments.length > 0}
								<span class="label-text-alt font-mono text-primary">
									{pendingAttachments.length} file{pendingAttachments.length !== 1 ? 's' : ''}
								</span>
							{/if}
						</label>

						<!-- Hidden file input -->
						<input
							type="file"
							multiple
							accept={getAcceptAttribute()}
							class="hidden"
							bind:this={fileInputRef}
							onchange={handleFileInputChange}
							disabled={formDisabled || isSubmitting}
						/>

						<!-- Click-to-browse zone (compact) -->
						<div
							class="relative rounded-lg p-3 transition-all duration-200 {formDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} bg-base-200 border-base-content/30"
							style="border: 2px dashed;"
							onclick={() => !formDisabled && openFilePicker()}
							role="button"
							tabindex={formDisabled ? -1 : 0}
							onkeydown={(e) => !formDisabled && e.key === 'Enter' && openFilePicker()}
						>
							<div class="flex items-center gap-3">
								<svg class="w-6 h-6 flex-shrink-0 text-base-content/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
								<span class="font-mono text-sm text-base-content/60">Drop files or click to browse</span>
							</div>
						</div>

						<!-- Attached Files List -->
						{#if pendingAttachments.length > 0}
							<div class="mt-3 flex flex-wrap gap-3">
								{#each pendingAttachments as att (att.id)}
									<div class="relative group">
										<!-- Preview/Icon -->
										{#if att.category === 'image' && att.preview}
											<img
												src={att.preview}
												alt={att.file.name}
												class="w-44 h-44 object-cover rounded border border-base-content/20"
											/>
										{:else}
											<div
												class="w-44 h-44 flex items-center justify-center rounded bg-base-200 border border-base-content/20"
											>
												<svg class="w-22 h-22" style="color: {att.iconColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d={att.icon} />
												</svg>
											</div>
										{/if}

										<!-- Filename overlay at bottom -->
										<div class="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[10px] font-mono truncate rounded-b bg-base-100/90 text-base-content/70" title={att.file.name}>
											{att.file.name}
										</div>

										<!-- Remove button -->
										<button
											type="button"
											class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-error text-error-content"
											onclick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
											disabled={isSubmitting}
											aria-label="Remove attachment"
										>
											<svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Review Override — compact join -->
					<div class="form-control">
						<label class="label py-0.5">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
								Review Override
							</span>
							{#if isLoadingReviewPreview}
								<span class="loading loading-spinner loading-xs text-base-content/70"></span>
							{:else if computedReviewAction}
								<span class="text-xs text-base-content/50">
									Default: <span class="{computedReviewAction === 'review' ? 'text-info' : 'text-success'}">{computedReviewAction === 'review' ? 'Review' : 'Auto-proceed'}</span>
								</span>
							{/if}
						</label>
						<div class="join w-full {formDisabled ? 'opacity-50' : ''}">
							<button
								type="button"
								class="join-item btn btn-sm flex-1 font-mono text-xs {reviewOverride === null ? 'btn-active' : 'btn-ghost'}"
								onclick={() => reviewOverride = null}
								disabled={formDisabled || isSubmitting}
							>
								Project Rules
							</button>
							<button
								type="button"
								class="join-item btn btn-sm flex-1 font-mono text-xs {reviewOverride === 'always_review' ? 'btn-active btn-info' : 'btn-ghost'}"
								onclick={() => reviewOverride = 'always_review'}
								disabled={formDisabled || isSubmitting}
							>
								Always Review
							</button>
							<button
								type="button"
								class="join-item btn btn-sm flex-1 font-mono text-xs {reviewOverride === 'always_auto' ? 'btn-active btn-success' : 'btn-ghost'}"
								onclick={() => reviewOverride = 'always_auto'}
								disabled={formDisabled || isSubmitting}
							>
								Auto-Proceed
							</button>
						</div>
					</div>

					<!-- Dependencies (Optional) - Industrial -->
					<div class="form-control">
						<div class="flex items-center justify-between mb-2">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
								Dependencies
								{#if selectedDependencies.length > 0}
									<span class="ml-1 badge badge-xs bg-base-content/20 text-base-content/80">{selectedDependencies.length}</span>
								{/if}
							</span>
							<!-- Add dependency button -->
							<div class="relative">
								<button
									type="button"
									class="btn btn-xs btn-ghost gap-1"
									onclick={() => showDependencyDropdown = !showDependencyDropdown}
									disabled={formDisabled || isSubmitting || availableTasksLoading || !formData.project}
									title={formDisabled || !formData.project ? 'Select a project first' : 'Add dependency'}
								>
									{#if availableTasksLoading}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
										</svg>
									{/if}
									Add
								</button>

								<!-- Dropdown menu - Industrial -->
								{#if showDependencyDropdown}
									<div
										class="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl w-72 max-h-64 overflow-y-auto bg-base-200 border border-base-content/30"
									>
										{#if availableTasks.length === 0}
											<div class="p-3 text-sm text-base-content/50 text-center">
												No available tasks in this project
											</div>
										{:else}
											<div class="py-1">
												{#each availableTasks as availTask}
													<button
														type="button"
														class="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-base-300/30 transition-colors"
														onclick={() => addDependency(availTask)}
														disabled={isSubmitting}
													>
														<span class="badge badge-xs {priorityColors[availTask.priority] || 'badge-ghost'}">
															P{availTask.priority}
														</span>
														<span class="font-mono text-xs text-base-content/60">{availTask.id}</span>
														<span class="flex-1 truncate">{availTask.title}</span>
													</button>
												{/each}
											</div>
										{/if}
										<!-- Close button - Industrial -->
										<div class="p-2 border-t border-base-content/30">
											<button
												type="button"
												class="btn btn-xs btn-ghost w-full"
												onclick={() => showDependencyDropdown = false}
											>
												Cancel
											</button>
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Selected dependencies list -->
						{#if selectedDependencies.length > 0}
							<div class="space-y-2 p-2 rounded bg-base-200">
								{#each selectedDependencies as dep (dep.id)}
									<div
										class="flex items-center gap-2 text-sm p-2 rounded group bg-base-100 border-l-2 border-primary/30"
									>
										<span class="badge badge-xs {priorityColors[dep.priority] || 'badge-ghost'}">
											P{dep.priority}
										</span>
										<span class="font-mono text-xs">{dep.id}</span>
										<span class="flex-1 truncate">{dep.title}</span>
										<!-- Remove button -->
										<button
											type="button"
											class="btn btn-xs btn-ghost btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-error hover:bg-error/10"
											onclick={() => removeDependency(dep.id)}
											disabled={isSubmitting}
											title="Remove dependency"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{:else}
							<div class="p-3 rounded text-center bg-base-200">
								{#if formData.project}
									<span class="text-sm text-base-content/50">No dependencies selected</span>
									<p class="text-xs mt-1 text-base-content/40">Click "Add" to select tasks this depends on</p>
								{:else}
									<span class="text-sm text-base-content/50">Select a project first</span>
									<p class="text-xs mt-1 text-base-content/40">Dependencies are loaded based on the selected project</p>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Error Message - Industrial -->
					{#if submitError}
						<div
							class="alert alert-error font-mono text-sm"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="stroke-current shrink-0 h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{submitError}</span>
						</div>
					{/if}

					<!-- Success Message - Industrial -->
					{#if successMessage}
						<div
							class="alert alert-success font-mono text-sm"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="stroke-current shrink-0 h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{successMessage}</span>
						</div>
					{/if}
				</div>
			</form>
			{:else}
			<!-- Content: Non-task modes (Create* components handle their own actions) -->
			<div class="flex-1 overflow-y-auto p-6 bg-base-300">
				{#if activeMode === 'paste'}
					<CreatePaste
						projects={dynamicProjects}
						initialProject={formData.project}
						hideProjectSelector={true}
						stacked={true}
						onTasksCreated={handleNonTaskModeCreated}
					/>
				{:else if activeMode === 'template'}
					<CreateTemplate
						projects={dynamicProjects}
						initialProject={formData.project}
						hideProjectSelector={true}
						stacked={true}
						onTasksCreated={handleNonTaskModeCreated}
					/>
				{:else if activeMode === 'generator'}
					<CreateGenerator
						projects={dynamicProjects}
						initialProject={formData.project}
						hideProjectSelector={true}
						stacked={true}
						onTasksCreated={handleNonTaskModeCreated}
					/>
				{:else if activeMode === 'plan'}
					<CreatePlan
						projects={dynamicProjects}
						initialProject={formData.project}
						hideProjectSelector={true}
						stacked={true}
						onTasksCreated={handleNonTaskModeCreated}
					/>
				{/if}
			</div>
			{/if}

			<!-- Footer Actions - Industrial (only for Task mode) -->
			{#if activeMode === 'task'}
			<div
				class="p-6 bg-base-200 border-t border-base-content/30"
			>
				<div class="flex items-center justify-between">
					<!-- Spacer (shortcuts shown in dropdown) -->
					<div></div>

					<div class="flex gap-3">
						<button
							type="button"
							class="btn btn-ghost"
							onclick={handleCancel}
							disabled={isSubmitting}
						>
							Cancel
						</button>

						<!-- Split button with dropdown -->
						<div class="join">
							<!-- Main action: Uses stored preference -->
							<!-- Note: type="button" prevents double-submit (onclick already calls submitWithAction) -->
							<button
								type="button"
								class="btn btn-primary font-mono join-item"
								onclick={() => submitWithAction(defaultSaveAction)}
								disabled={formDisabled || isSubmitting}
							>
								{#if isSubmitting}
									<span class="loading loading-spinner loading-sm"></span>
									Saving...
								{:else}
									{saveActionLabels[defaultSaveAction]}
								{/if}
							</button>

							<!-- Dropdown for additional save options -->
							<div class="dropdown dropdown-end dropdown-top">
								<button
									type="button"
									tabindex="0"
									class="btn btn-primary join-item border-l border-primary-content/20"
									disabled={formDisabled || isSubmitting}
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
									</svg>
								</button>
								<ul
									tabindex="0"
									class="dropdown-content menu rounded-box z-[1] w-72 p-2 shadow-lg bg-base-100 border border-base-content/30"
								>
									<li>
										<button
											type="button"
											class="font-mono text-sm flex items-center gap-2 text-base-content {defaultSaveAction === 'close' ? 'bg-primary/20' : ''}"
											onclick={() => submitWithAction('close')}
											disabled={formDisabled || isSubmitting}
										>
											{#if defaultSaveAction === 'close'}
												<svg class="w-4 h-4 mx-1 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
											{:else}
												<span class="w-4 mx-1"></span>
											{/if}
											Save & Close
											<kbd class="kbd kbd-xs ml-auto">Alt+Enter</kbd>
										</button>
									</li>
									<li>
										<button
											type="button"
											class="font-mono text-sm flex items-center gap-2 text-base-content {defaultSaveAction === 'new' ? 'bg-primary/20' : ''}"
											onclick={() => submitWithAction('new')}
											disabled={formDisabled || isSubmitting}
										>
											{#if defaultSaveAction === 'new'}
												<svg class="w-4 h-4 mx-1 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
											{:else}
												<span class="w-4 mx-1"></span>
											{/if}
											Save & New
											<kbd class="kbd kbd-xs ml-auto">Ctrl+Shift+Enter</kbd>
										</button>
									</li>
									<li>
										<button
											type="button"
											class="font-mono text-sm flex items-center gap-2 text-base-content {defaultSaveAction === 'start' ? 'bg-primary/20' : ''}"
											onclick={() => submitWithAction('start')}
											disabled={formDisabled || isSubmitting}
										>
											{#if defaultSaveAction === 'start'}
												<svg class="w-4 h-4 mx-1 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
											{:else}
												<span class="w-4 mx-1"></span>
											{/if}
											Save & Start
											<kbd class="kbd kbd-xs ml-auto">Ctrl+Enter</kbd>
										</button>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>
			{/if}
		</div>
	</div>
</div>
