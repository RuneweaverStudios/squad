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
	import { isTaskDrawerOpen, selectedDrawerProject, availableProjects } from '$lib/stores/drawerStore';
	import { broadcastTaskEvent } from '$lib/stores/taskEvents';
	import { broadcastSessionEvent } from '$lib/stores/sessionEvents';
	import { playSuccessChime, playErrorSound, playAttachmentSound } from '$lib/utils/soundEffects';
	import { getFileTypeInfo, formatFileSize, getAcceptAttribute, type FileCategory } from '$lib/utils/fileUtils';
	import VoiceInput from './VoiceInput.svelte';

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

	// Pre-fill project when drawer opens (read from store at open time)
	$effect(() => {
		if (isOpen) {
			// Read current project from store when drawer opens
			const project = get(selectedDrawerProject);
			if (project) {
				formData.project = project;
			} else if (dynamicProjects.length > 0 && !formData.project) {
				// Default to first project if none selected (e.g., opened via Alt+N)
				formData.project = dynamicProjects[0];
			}
		}
	});

	// Reactive auto-focus when drawer opens - single reliable implementation
	// Uses requestAnimationFrame + 200ms delay to ensure drawer animation has started
	// and input is interactable. This handles both checkbox toggle and store-based opening.
	$effect(() => {
		if (isOpen && titleInput) {
			requestAnimationFrame(() => {
				setTimeout(() => {
					if (titleInput && isOpen) {
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

	// Form state
	interface FormData {
		title: string;
		description: string;
		priority: number;
		type: string;
		project: string;
		labels: string;
	}

	let formData = $state<FormData>({
		title: '',
		description: '',
		priority: 1,
		type: 'task',
		project: '',
		labels: ''
	});

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
	let dropzoneRef: HTMLDivElement | null = null;
	let fileInputRef: HTMLInputElement | null = null;

	// UI state
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});
	let submitError = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let titleInput: HTMLInputElement;
	let projectDropdownBtn: HTMLButtonElement;
	let projectDropdownOpen = $state(false);
	let projectDropdownIndex = $state(0);

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
			// Append to existing description with space if needed
			formData.description = formData.description
				? formData.description + ' ' + text
				: text;
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

	// Human action toggle - adds 'human-action' label when checked
	let isHumanAction = $state(false);

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
			// Convert project descriptions Map to object for JSON
			const projectContextObj: Record<string, string> = {};
			for (const [name, desc] of projectDescriptions) {
				projectContextObj[name] = desc;
			}

			const response = await fetch('/api/tasks/suggest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: formData.title.trim(),
					description: formData.description.trim(),
					openTasks: prefetchedOpenTasks, // Pass pre-fetched tasks
					projectDescriptions: projectContextObj // Pass project descriptions for AI context
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
			suggestionError = err.message || 'Failed to get AI suggestions';
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

	// Handle drop event
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragOver = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			playAttachmentSound();
			handleFiles(files);
		}
	}

	// Handle drag over
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		// CRITICAL: Must set dropEffect for browser to allow the drop
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
		isDragOver = true;
	}

	// Handle drag enter
	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	// Handle drag leave
	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Only set to false if leaving the dropzone entirely
		const rect = dropzoneRef?.getBoundingClientRect();
		if (rect) {
			const x = event.clientX;
			const y = event.clientY;
			if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
				isDragOver = false;
			}
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

		isSubmitting = true;

		try {
			// Parse labels and add human-action if checkbox is checked
			const labels = formData.labels
				.split(',')
				.map((l) => l.trim())
				.filter((l) => l.length > 0);

			// Add human-action label if toggle is enabled
			if (isHumanAction && !labels.includes('human-action')) {
				labels.push('human-action');
			}

			// Get dependencies from selected list
			const dependencies = selectedDependencies.map(d => d.id);

			// Prepare request body
			const requestBody = {
				title: formData.title.trim(),
				description: formData.description.trim() || undefined,
				priority: formData.priority,
				type: formData.type,
				project: formData.project.trim() || undefined,
				labels: labels.length > 0 ? labels : undefined,
				deps: dependencies.length > 0 ? dependencies : undefined,
				review_override: reviewOverride || undefined
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
					// Note: The spawn API will infer project from task ID prefix (e.g., jomarchy-abc → ~/code/jomarchy)
					console.log('[TaskCreationDrawer] Spawning agent for task:', taskId);

					const spawnResponse = await fetch('/api/work/spawn', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							taskId: taskId
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
			priority: 1,
			type: 'task',
			project: '',
			labels: ''
		};
		validationErrors = {};
		submitError = null;
		successMessage = null;

		// Reset dependencies
		selectedDependencies = [];
		availableTasks = [];
		showDependencyDropdown = false;

		// Reset human action toggle
		isHumanAction = false;

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
			isTaskDrawerOpen.set(false);
		}
	}

	// Handle cancel button
	function handleCancel() {
		if (!isSubmitting) {
			resetForm();
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
			formData.project = dynamicProjects[index];
			closeProjectDropdown();
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

	// Handle keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
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
		<div
			class="h-full w-full max-w-2xl flex flex-col shadow-2xl bg-base-300 border-l border-base-content/30"
			role="dialog"
			aria-labelledby="drawer-title"
			onkeydown={handleKeydown}
		>
			<!-- Header - Industrial -->
			<div
				class="flex items-center justify-between p-6 relative bg-base-200 border-b border-base-content/30"
			>
				<!-- Left accent bar -->
				<div
					class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-primary/30"
				></div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-3 flex-wrap">
						<h2 id="drawer-title" class="text-xl font-bold font-mono uppercase tracking-wider text-base-content">Create New Task</h2>
						<!-- Project dropdown in header (Alt+P to open, arrows to navigate) -->
						<div class="dropdown dropdown-end {projectDropdownOpen ? 'dropdown-open' : ''}">
							<button
								type="button"
								tabindex="0"
								bind:this={projectDropdownBtn}
								class="ml-8 badge badge-lg gap-1.5 px-2.5 py-2 font-mono text-sm transition-colors cursor-pointer {formData.project ? 'bg-primary/20 border-primary/40 text-primary hover:bg-primary/30' : 'bg-warning/20 border-warning/40 text-warning hover:bg-warning/30'}"
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
								<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
								</svg>
								{formData.project || 'Select project'}
								<svg class="w-2.5 h-2.5 opacity-60 transition-transform {projectDropdownOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							<ul class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg border border-base-content/20 mt-1">
								{#each dynamicProjects as project, i}
									<li>
										<button
											type="button"
											class="font-mono {formData.project === project ? 'active' : ''} {projectDropdownOpen && projectDropdownIndex === i ? 'focus' : ''}"
											onclick={() => { formData.project = project; closeProjectDropdown(); }}
											onmouseenter={() => projectDropdownIndex = i}
										>
											<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
											</svg>
											{project}
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
					</div>
					<p class="text-sm mt-1 text-base-content/70">
						Fill in the details below to create a new task
					</p>
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

			<!-- Content (scrollable area between sticky header and footer) - Industrial -->
			<form onsubmit={handleSubmit} class="flex-1 overflow-y-auto p-6 flex flex-col min-h-0 bg-base-300">
				<div class="space-y-6">
					<!-- Title (Required) - Industrial -->
					<div class="form-control">
						<label class="label justify-between w-full mb-2" for="task-title">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
								Title
								<span class="text-error">*</span>
							</span>
							<!-- Human Action Toggle - subtle, right-aligned in title label -->
							<label class="flex items-center gap-1.5 cursor-pointer" title="Mark as human action (not for agents)">
								<input
									type="checkbox"
									class="toggle toggle-xs {isHumanAction ? 'toggle-warning' : ''}"
									bind:checked={isHumanAction}
									disabled={isSubmitting}
								/>
								<span class="flex items-center gap-1 text-xs {isHumanAction ? 'text-warning font-medium' : 'text-base-content/50'}">
									<span style="font-size: 0.85rem;">🧑</span>
									Human
								</span>
							</label>
						</label>
						<div class="flex items-center gap-2">
							<input
								id="task-title"
								type="text"
								placeholder="Paste task text or enter title..."
								class="input flex-1 font-mono bg-base-200 border-base-content/30 text-base-content {validationErrors.title ? 'input-error' : ''}"
								bind:this={titleInput}
								bind:value={formData.title}
								onpaste={handleTitlePaste}
								disabled={isSubmitting}
								required
								autofocus={isOpen}
							/>
							<VoiceInput
								size="sm"
								disabled={isSubmitting}
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
						<label class="label" for="task-description">
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
									disabled={isSubmitting}
									ontranscription={handleDescriptionTranscription}
									onerror={handleVoiceInputError}
									onstart={() => isDescriptionRecording = true}
									onend={() => isDescriptionRecording = false}
								/>
							</span>
						</label>
						<textarea
							id="task-description"
							placeholder="Enter task description or use voice input..."
							class="textarea w-full h-32 font-mono bg-base-200 text-base-content {isDescriptionRecording ? 'textarea-primary border-primary' : 'border-base-content/30'}"
							bind:value={formData.description}
							onblur={handleDescriptionBlur}
							disabled={isSubmitting}
						></textarea>
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

					<!-- Priority & Type Row - Industrial -->
					<div class="grid grid-cols-2 gap-4">
						<!-- Priority (Required) - Industrial -->
						<div class="form-control">
							<label class="label" for="task-priority">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Priority
									<span class="text-error">*</span>
									{#if suggestionsApplied && !userModifiedFields.has('priority')}
										<span class="badge badge-xs ml-1 bg-primary/30 text-base-content">AI</span>
									{/if}
								</span>
							</label>
							<select
								id="task-priority"
								class="select w-full font-mono bg-base-200 border-base-content/30 text-base-content"
								bind:value={formData.priority}
								onchange={() => markFieldModified('priority')}
								disabled={isSubmitting}
								required
							>
								{#each priorityOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>

						<!-- Type (Required) - Industrial -->
						<div class="form-control">
							<label class="label" for="task-type">
								<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
									Type
									<span class="text-error">*</span>
									{#if suggestionsApplied && !userModifiedFields.has('type')}
										<span class="badge badge-xs ml-1 bg-primary/30 text-base-content">AI</span>
									{/if}
								</span>
							</label>
							<select
								id="task-type"
								class="select w-full font-mono bg-base-200 border-base-content/30 text-base-content {validationErrors.type ? 'select-error' : ''}"
								bind:value={formData.type}
								onchange={() => markFieldModified('type')}
								disabled={isSubmitting}
								required
							>
								{#each typeOptions as option}
									<option value={option.value}>{option.label} {option.icon}</option>
								{/each}
							</select>
							{#if validationErrors.type}
								<label class="label">
									<span class="label-text-alt text-error">{validationErrors.type}</span>
								</label>
							{/if}
						</div>
					</div>

					<!-- Labels (Optional) - Industrial -->
					<div class="form-control">
						<label class="label" for="task-labels">
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
							placeholder="e.g., frontend, urgent, bug-fix"
							class="input w-full font-mono bg-base-200 border-base-content/30 text-base-content"
							bind:value={formData.labels}
							oninput={() => markFieldModified('labels')}
							disabled={isSubmitting}
						/>
						<label class="label">
							<span class="label-text-alt text-base-content/60">
								Comma-separated list of labels
							</span>
						</label>
					</div>

					<!-- Attachments Dropzone - Industrial -->
					<div class="form-control">
						<label class="label">
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
							disabled={isSubmitting}
						/>

						<!-- Dropzone -->
						<div
							bind:this={dropzoneRef}
							class="relative rounded-lg p-6 text-center cursor-pointer transition-all duration-200 {isDragOver ? 'bg-primary/20 border-primary' : 'bg-base-200 border-base-content/30'}"
							style="border: 2px dashed;"
							ondrop={handleDrop}
							ondragover={handleDragOver}
							ondragenter={handleDragEnter}
							ondragleave={handleDragLeave}
							onclick={openFilePicker}
							role="button"
							tabindex="0"
							onkeydown={(e) => e.key === 'Enter' && openFilePicker()}
						>
							{#if isDragOver}
								<div class="pointer-events-none">
									<svg class="w-12 h-12 mx-auto mb-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
									</svg>
									<p class="font-mono text-sm text-primary">
										Drop files here
									</p>
								</div>
							{:else}
								<svg class="w-10 h-10 mx-auto mb-2 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
								<p class="font-mono text-sm text-base-content/70">
									Drop files here or click to browse
								</p>
								<p class="font-mono text-xs mt-1 text-base-content/50">
									Images, PDFs, text files supported
								</p>
							{/if}
						</div>

						<!-- Attached Files List -->
						{#if pendingAttachments.length > 0}
							<div class="mt-3 space-y-2">
								{#each pendingAttachments as att (att.id)}
									<div
										class="flex items-center gap-3 p-2 rounded-lg bg-base-100 border border-base-content/20"
									>
										<!-- Preview/Icon -->
										{#if att.category === 'image' && att.preview}
											<img
												src={att.preview}
												alt={att.file.name}
												class="w-10 h-10 object-cover rounded"
											/>
										{:else}
											<div
												class="w-10 h-10 flex items-center justify-center rounded bg-base-200"
											>
												<svg class="w-5 h-5" style="color: {att.iconColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
													<path stroke-linecap="round" stroke-linejoin="round" d={att.icon} />
												</svg>
											</div>
										{/if}

										<!-- File info -->
										<div class="flex-1 min-w-0">
											<p class="font-mono text-sm truncate text-base-content">
												{att.file.name}
											</p>
											<p class="font-mono text-xs text-base-content/60">
												{formatFileSize(att.file.size)}
											</p>
										</div>

										<!-- Remove button -->
										<button
											type="button"
											class="btn btn-ghost btn-sm btn-circle"
											onclick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
											disabled={isSubmitting}
											aria-label="Remove attachment"
										>
											<svg class="w-4 h-4 text-error/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Review Override - Industrial -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-xs font-semibold font-mono uppercase tracking-wider text-base-content/70">
								Review Override
							</span>
							{#if isLoadingReviewPreview}
								<span class="loading loading-spinner loading-xs text-base-content/70"></span>
							{/if}
						</label>

						<!-- Computed default display -->
						{#if computedReviewAction && !isLoadingReviewPreview}
							<div
								class="rounded-lg p-3 mb-3 bg-base-100 border border-base-content/20"
							>
								<div class="flex items-center gap-2 mb-1">
									{#if computedReviewAction === 'review'}
										<span class="flex items-center gap-1.5 text-sm font-medium text-info">
											<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
												<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
											</svg>
											Requires Review
										</span>
									{:else}
										<span class="flex items-center gap-1.5 text-sm font-medium text-success">
											<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
											Auto-Proceed
										</span>
									{/if}
									<span class="text-xs text-base-content/60">
										(project default for P{formData.priority} {formData.type})
									</span>
								</div>
								{#if computedReviewReason}
									<p class="text-xs text-base-content/70">
										{computedReviewReason}
									</p>
								{/if}
							</div>
						{/if}

						<!-- Radio buttons for override -->
						<div class="space-y-2">
							<!-- Use project rules (default) -->
							<label
								class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all {reviewOverride === null ? 'bg-primary/10 border-primary/50' : 'bg-base-200 border-base-content/20'}"
								style="border-width: 1px; border-style: solid;"
							>
								<input
									type="radio"
									name="review-override"
									class="radio radio-sm"
									checked={reviewOverride === null}
									onchange={() => reviewOverride = null}
									disabled={isSubmitting}
								/>
								<div class="flex-1">
									<span class="text-sm font-medium text-base-content">
										Use project rules
									</span>
									<p class="text-xs mt-0.5 text-base-content/60">
										Apply the configured review rules for this type and priority
									</p>
								</div>
							</label>

							<!-- Always require review -->
							<label
								class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all {reviewOverride === 'always_review' ? 'bg-info/10 border-info/50' : 'bg-base-200 border-base-content/20'}"
								style="border-width: 1px; border-style: solid;"
							>
								<input
									type="radio"
									name="review-override"
									class="radio radio-sm"
									checked={reviewOverride === 'always_review'}
									onchange={() => reviewOverride = 'always_review'}
									disabled={isSubmitting}
								/>
								<div class="flex-1">
									<span class="flex items-center gap-1.5 text-sm font-medium text-base-content">
										<svg class="w-4 h-4 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
										Always require review
									</span>
									<p class="text-xs mt-0.5 text-base-content/60">
										Override project rules - this task always needs human review
									</p>
								</div>
							</label>

							<!-- Always auto-proceed -->
							<label
								class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all {reviewOverride === 'always_auto' ? 'bg-success/10 border-success/50' : 'bg-base-200 border-base-content/20'}"
								style="border-width: 1px; border-style: solid;"
							>
								<input
									type="radio"
									name="review-override"
									class="radio radio-sm"
									checked={reviewOverride === 'always_auto'}
									onchange={() => reviewOverride = 'always_auto'}
									disabled={isSubmitting}
								/>
								<div class="flex-1">
									<span class="flex items-center gap-1.5 text-sm font-medium text-base-content">
										<svg class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
										Always auto-proceed
									</span>
									<p class="text-xs mt-0.5 text-base-content/60">
										Override project rules - this task can auto-proceed without review
									</p>
								</div>
							</label>
						</div>

						<label class="label">
							<span class="label-text-alt text-base-content/50">
								Override the project's review rules for this specific task
							</span>
						</label>
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
									disabled={isSubmitting || availableTasksLoading || !formData.project}
									title={!formData.project ? 'Select a project first' : 'Add dependency'}
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

			<!-- Footer Actions - Industrial -->
			<div
				class="p-6 bg-base-200 border-t border-base-content/30"
			>
				<div class="flex items-center justify-between">
					<!-- Keyboard shortcuts hint -->
					<div class="text-xs font-mono hidden sm:block text-base-content/50">
						⌘↵ Start · ⌥↵ Save · ⌘⇧↵ New
					</div>

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
							<button
								type="submit"
								class="btn btn-primary font-mono join-item"
								onclick={() => submitWithAction(defaultSaveAction)}
								disabled={isSubmitting}
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
									disabled={isSubmitting}
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
									</svg>
								</button>
								<ul
									tabindex="0"
									class="dropdown-content menu rounded-box z-[1] w-56 p-2 shadow-lg bg-base-100 border border-base-content/30"
								>
									<li>
										<button
											type="button"
											class="font-mono text-sm flex items-center gap-2 text-base-content {defaultSaveAction === 'close' ? 'bg-primary/20' : ''}"
											onclick={() => submitWithAction('close')}
											disabled={isSubmitting}
										>
											{#if defaultSaveAction === 'close'}
												<svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
											{:else}
												<span class="w-4"></span>
											{/if}
											Save
											<span class="ml-auto text-xs text-base-content/60">⌥↵</span>
										</button>
									</li>
									<li>
										<button
											type="button"
											class="font-mono text-sm flex items-center gap-2 text-base-content {defaultSaveAction === 'new' ? 'bg-primary/20' : ''}"
											onclick={() => submitWithAction('new')}
											disabled={isSubmitting}
										>
											{#if defaultSaveAction === 'new'}
												<svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
											{:else}
												<span class="w-4"></span>
											{/if}
											Save & New
											<span class="ml-auto text-xs text-base-content/60">⌘⇧↵</span>
										</button>
									</li>
									<li>
										<button
											type="button"
											class="font-mono text-sm flex items-center gap-2 text-base-content {defaultSaveAction === 'start' ? 'bg-primary/20' : ''}"
											onclick={() => submitWithAction('start')}
											disabled={isSubmitting}
										>
											{#if defaultSaveAction === 'start'}
												<svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
												</svg>
											{:else}
												<span class="w-4"></span>
											{/if}
											Save & Start
											<span class="ml-auto text-xs text-base-content/60">⌘↵</span>
										</button>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
