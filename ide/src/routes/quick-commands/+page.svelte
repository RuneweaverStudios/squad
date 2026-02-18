<script lang="ts">
	/**
	 * Quick Commands Page
	 *
	 * Run single-turn agent commands and manage reusable templates.
	 * Route: /quick-commands
	 */

	import { onMount } from 'svelte';
	import { openTaskDrawer } from '$lib/stores/drawerStore';
	import PromptInput from '$lib/components/quick-commands/PromptInput.svelte';

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

	interface PipelineStep {
		id: string;
		order: number;
		templateId: string | null;
		prompt: string | null;
		model: string | null;
		label: string;
	}

	interface Pipeline {
		id: string;
		name: string;
		description: string;
		steps: PipelineStep[];
		defaultProject: string | null;
		createdAt: string;
		updatedAt?: string;
	}

	interface PipelineRunStep {
		stepIndex: number;
		label: string;
		model: string;
		prompt: string;
		result?: string;
		error?: string;
		durationMs?: number;
		status: 'pending' | 'running' | 'done' | 'error';
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
	let selectedProject = $state('squad');
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

	// @file references (managed by PromptInput component)
	let referencedFiles = $state<Array<{ path: string; name: string }>>([]);
	let promptInputRef = $state<{ focus: () => void; clear: () => void; setText: (text: string) => void } | null>(null);

	// Output action state
	let selectedOutputAction = $state<OutputAction>('display');
	let showOutputActionMenu = $state(false);

	// Write-to-file modal state
	let showWriteFileModal = $state(false);
	let writeFilePath = $state('');
	let writingFile = $state(false);
	let writeFileError = $state('');
	let pendingWriteResult = $state<ExecutionResult | null>(null);


	// Schedule modal state
	let showScheduleModal = $state(false);
	let schedulingTemplate = $state<Template | null>(null);
	let scheduleCron = $state('0 9 * * *');
	let scheduleProject = $state('');
	let scheduleModel = $state('haiku');
	let scheduleRunMode = $state<'quick-command' | 'spawn-agent'>('quick-command');
	let scheduleVariables = $state<Record<string, string>>({});
	let scheduleSaving = $state(false);
	let scheduleError = $state('');
	let templateSchedules = $state<Record<string, { taskId: string; cron: string; nextRun: string; project: string; runMode: string }>>({});

	// Pipeline state
	let pipelines = $state<Pipeline[]>([]);
	let showPipelineEditor = $state(false);
	let editingPipeline = $state<Pipeline | null>(null);
	let pipelineEditorName = $state('');
	let pipelineEditorDescription = $state('');
	let pipelineEditorProject = $state('');
	let pipelineEditorSteps = $state<Array<{ id: string; templateId: string | null; prompt: string; model: string; label: string }>>([]);
	let pipelineEditorSaving = $state(false);
	let pipelineEditorError = $state('');
	let draggedStepIndex = $state<number | null>(null);
	let dragOverStepIndex = $state<number | null>(null);

	// Pipeline runner state
	let runningPipeline = $state<Pipeline | null>(null);
	let pipelineRunSteps = $state<PipelineRunStep[]>([]);
	let pipelineRunning = $state(false);
	let pipelineCurrentStep = $state(-1);
	let pipelineRunProject = $state('squad');
	let pipelineRunError = $state('');

	// Active tab
	let activeTab = $state<'templates' | 'history' | 'pipelines'>('templates');

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

	const HISTORY_KEY = 'squad-quick-command-history';
	const MAX_HISTORY = 20;

	// --- Lifecycle ---
	onMount(async () => {
		loadHistory();
		await Promise.all([fetchTemplates(), fetchProjects(), fetchPipelines()]);
		isLoading = false;
		// Fetch schedules after templates are loaded
		fetchSchedules();
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

	// --- Pipelines ---
	async function fetchPipelines() {
		try {
			const res = await fetch('/api/quick-command/pipelines');
			const data = await res.json();
			if (data.success) {
				pipelines = data.pipelines || [];
			}
		} catch (e) {
			console.error('[quick-commands] Failed to fetch pipelines:', e);
		}
	}

	function openNewPipeline() {
		editingPipeline = null;
		pipelineEditorName = '';
		pipelineEditorDescription = '';
		pipelineEditorProject = '';
		pipelineEditorSteps = [
			{ id: crypto.randomUUID(), templateId: null, prompt: '', model: 'haiku', label: 'Step 1' },
			{ id: crypto.randomUUID(), templateId: null, prompt: '', model: 'sonnet', label: 'Step 2' }
		];
		pipelineEditorError = '';
		showPipelineEditor = true;
	}

	function openEditPipeline(pipeline: Pipeline) {
		editingPipeline = pipeline;
		pipelineEditorName = pipeline.name;
		pipelineEditorDescription = pipeline.description;
		pipelineEditorProject = pipeline.defaultProject || '';
		pipelineEditorSteps = pipeline.steps.map((s) => ({
			id: s.id,
			templateId: s.templateId,
			prompt: s.prompt || '',
			model: s.model || 'haiku',
			label: s.label
		}));
		pipelineEditorError = '';
		showPipelineEditor = true;
	}

	function addPipelineStep() {
		const n = pipelineEditorSteps.length + 1;
		pipelineEditorSteps = [
			...pipelineEditorSteps,
			{ id: crypto.randomUUID(), templateId: null, prompt: '', model: 'haiku', label: `Step ${n}` }
		];
	}

	function removePipelineStep(index: number) {
		if (pipelineEditorSteps.length <= 2) return;
		pipelineEditorSteps = pipelineEditorSteps.filter((_, i) => i !== index);
	}

	function handleStepDragStart(index: number) {
		draggedStepIndex = index;
	}

	function handleStepDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		dragOverStepIndex = index;
	}

	function handleStepDrop(index: number) {
		if (draggedStepIndex === null || draggedStepIndex === index) {
			draggedStepIndex = null;
			dragOverStepIndex = null;
			return;
		}
		const items = [...pipelineEditorSteps];
		const [moved] = items.splice(draggedStepIndex, 1);
		items.splice(index, 0, moved);
		pipelineEditorSteps = items;
		draggedStepIndex = null;
		dragOverStepIndex = null;
	}

	function handleStepDragEnd() {
		draggedStepIndex = null;
		dragOverStepIndex = null;
	}

	async function savePipeline() {
		pipelineEditorError = '';
		if (!pipelineEditorName.trim()) {
			pipelineEditorError = 'Pipeline name is required';
			return;
		}
		// Validate steps
		for (let i = 0; i < pipelineEditorSteps.length; i++) {
			const step = pipelineEditorSteps[i];
			if (!step.templateId && !step.prompt.trim()) {
				pipelineEditorError = `Step ${i + 1} must have a template or a prompt`;
				return;
			}
		}

		pipelineEditorSaving = true;
		try {
			const url = editingPipeline
				? `/api/quick-command/pipelines/${editingPipeline.id}`
				: '/api/quick-command/pipelines';
			const method = editingPipeline ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: pipelineEditorName,
					description: pipelineEditorDescription,
					defaultProject: pipelineEditorProject || null,
					steps: pipelineEditorSteps.map((s) => ({
						id: s.id,
						templateId: s.templateId || null,
						prompt: s.templateId ? null : s.prompt,
						model: s.model || null,
						label: s.label
					}))
				})
			});

			const data = await res.json();
			if (!res.ok) {
				pipelineEditorError = data.message || 'Failed to save pipeline';
				return;
			}

			showPipelineEditor = false;
			await fetchPipelines();
		} catch (e: any) {
			pipelineEditorError = e.message || 'Network error';
		} finally {
			pipelineEditorSaving = false;
		}
	}

	async function deletePipeline(pipeline: Pipeline) {
		if (!confirm(`Delete pipeline "${pipeline.name}"?`)) return;
		try {
			await fetch(`/api/quick-command/pipelines/${pipeline.id}`, { method: 'DELETE' });
			await fetchPipelines();
		} catch (e) {
			console.error('[quick-commands] Failed to delete pipeline:', e);
		}
	}

	/** Resolve step prompt: if templateId, load template prompt; else use step prompt */
	function resolveStepPrompt(step: PipelineStep): string {
		if (step.templateId) {
			const template = templates.find((t) => t.id === step.templateId);
			return template?.prompt || `[Template ${step.templateId} not found]`;
		}
		return step.prompt || '';
	}

	function startPipelineRun(pipeline: Pipeline) {
		runningPipeline = pipeline;
		pipelineRunProject = pipeline.defaultProject || selectedProject;
		pipelineRunSteps = pipeline.steps.map((s, i) => ({
			stepIndex: i,
			label: s.label,
			model: s.model || 'haiku',
			prompt: resolveStepPrompt(s),
			status: 'pending' as const
		}));
		pipelineCurrentStep = -1;
		pipelineRunning = false;
		pipelineRunError = '';
	}

	async function executePipelineRun() {
		if (!runningPipeline || pipelineRunning) return;
		pipelineRunning = true;
		pipelineRunError = '';

		let previousOutput = '';
		const startFrom = pipelineRunSteps.findIndex((s) => s.status === 'pending' || s.status === 'error');
		if (startFrom === -1) return;

		// Collect output from previously completed steps
		for (let i = 0; i < startFrom; i++) {
			if (pipelineRunSteps[i].status === 'done' && pipelineRunSteps[i].result) {
				previousOutput = pipelineRunSteps[i].result!;
			}
		}

		for (let i = startFrom; i < pipelineRunSteps.length; i++) {
			pipelineCurrentStep = i;

			// Build prompt with {input} substitution
			let prompt = pipelineRunSteps[i].prompt;
			if (previousOutput && prompt.includes('{input}')) {
				prompt = prompt.replace(/\{input\}/g, previousOutput);
			} else if (previousOutput && i > 0) {
				// Auto-append previous output if no {input} placeholder
				prompt = `${prompt}\n\nInput from previous step:\n${previousOutput}`;
			}

			// Update status
			pipelineRunSteps[i] = { ...pipelineRunSteps[i], status: 'running' };
			pipelineRunSteps = [...pipelineRunSteps];

			const stepStart = Date.now();
			try {
				const res = await fetch('/api/quick-command', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						prompt,
						project: pipelineRunProject,
						model: pipelineRunSteps[i].model
					})
				});
				const data = await res.json();

				if (!data.success) {
					pipelineRunSteps[i] = {
						...pipelineRunSteps[i],
						status: 'error',
						error: data.message || 'Execution failed',
						durationMs: Date.now() - stepStart
					};
					pipelineRunSteps = [...pipelineRunSteps];
					pipelineRunError = `Step ${i + 1} failed: ${data.message || 'Unknown error'}`;
					break;
				}

				previousOutput = data.result;
				pipelineRunSteps[i] = {
					...pipelineRunSteps[i],
					status: 'done',
					result: data.result,
					durationMs: data.durationMs || (Date.now() - stepStart)
				};
				pipelineRunSteps = [...pipelineRunSteps];
			} catch (e: any) {
				pipelineRunSteps[i] = {
					...pipelineRunSteps[i],
					status: 'error',
					error: e.message || 'Network error',
					durationMs: Date.now() - stepStart
				};
				pipelineRunSteps = [...pipelineRunSteps];
				pipelineRunError = `Step ${i + 1} failed: ${e.message}`;
				break;
			}
		}

		// If all steps completed, add final result to history
		const allDone = pipelineRunSteps.every((s) => s.status === 'done');
		if (allDone && runningPipeline) {
			const totalMs = pipelineRunSteps.reduce((sum, s) => sum + (s.durationMs || 0), 0);
			const finalResult = pipelineRunSteps[pipelineRunSteps.length - 1]?.result || '';
			addToHistory({
				id: crypto.randomUUID(),
				prompt: `[Pipeline: ${runningPipeline.name}] ${pipelineRunSteps.length} steps`,
				result: finalResult,
				model: 'pipeline',
				project: pipelineRunProject,
				durationMs: totalMs,
				timestamp: new Date().toISOString(),
				templateName: `Pipeline: ${runningPipeline.name}`,
				outputAction: selectedOutputAction
			});

			// Route final output
			await routeOutput({
				id: crypto.randomUUID(),
				prompt: '',
				result: finalResult,
				model: 'pipeline',
				project: pipelineRunProject,
				durationMs: totalMs,
				timestamp: new Date().toISOString()
			}, selectedOutputAction);
		}

		pipelineRunning = false;
		pipelineCurrentStep = -1;
	}

	function closePipelineRunner() {
		runningPipeline = null;
		pipelineRunSteps = [];
		pipelineRunning = false;
		pipelineCurrentStep = -1;
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

	// --- Schedule functions ---
	async function fetchSchedules() {
		for (const t of templates) {
			try {
				const res = await fetch(`/api/quick-command/templates/${t.id}/schedule`);
				const data = await res.json();
				if (data.scheduled) {
					templateSchedules[t.id] = {
						taskId: data.task.id,
						cron: data.task.schedule_cron,
						nextRun: data.task.next_run_at,
						project: data.task.project,
						runMode: data.task.runMode || 'quick-command'
					};
				} else {
					delete templateSchedules[t.id];
				}
			} catch { /* ignore */ }
		}
		templateSchedules = { ...templateSchedules };
	}

	function openScheduleModal(template: Template) {
		schedulingTemplate = template;
		scheduleCron = '0 9 * * *';
		scheduleProject = template.defaultProject || selectedProject;
		scheduleModel = template.defaultModel || 'haiku';
		scheduleRunMode = 'quick-command';
		scheduleVariables = {};
		if (template.variables) {
			for (const v of template.variables) {
				scheduleVariables[v.name] = v.default || '';
			}
		}
		scheduleError = '';
		showScheduleModal = true;
	}

	async function saveSchedule() {
		if (!schedulingTemplate || !scheduleCron.trim()) return;

		scheduleSaving = true;
		scheduleError = '';

		try {
			const res = await fetch(`/api/quick-command/templates/${schedulingTemplate.id}/schedule`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cronExpr: scheduleCron.trim(),
					project: scheduleProject,
					model: scheduleModel,
					runMode: scheduleRunMode,
					variables: scheduleVariables
				})
			});
			const data = await res.json();
			if (!res.ok) {
				scheduleError = data.message || data.error || 'Failed to schedule';
				return;
			}

			showScheduleModal = false;
			await fetchSchedules();
		} catch (e: any) {
			scheduleError = e.message || 'Schedule failed';
		} finally {
			scheduleSaving = false;
		}
	}

	async function removeSchedule(templateId: string) {
		try {
			const res = await fetch(`/api/quick-command/templates/${templateId}/schedule`, {
				method: 'DELETE'
			});
			if (res.ok) {
				delete templateSchedules[templateId];
				templateSchedules = { ...templateSchedules };
			}
		} catch (e) {
			console.error('[quick-commands] Failed to remove schedule:', e);
		}
	}

	function formatCron(cron: string): string {
		const presets: Record<string, string> = {
			'* * * * *': 'Every minute',
			'*/5 * * * *': 'Every 5 min',
			'*/15 * * * *': 'Every 15 min',
			'*/30 * * * *': 'Every 30 min',
			'0 * * * *': 'Hourly',
			'0 */2 * * *': 'Every 2 hours',
			'0 */6 * * *': 'Every 6 hours',
			'0 9 * * *': 'Daily 9 AM',
			'0 9 * * 1-5': 'Weekdays 9 AM',
			'0 0 * * *': 'Daily midnight',
			'0 9,17 * * *': '9 AM & 5 PM',
			'0 0 * * 0': 'Weekly Sun',
			'0 0 1 * *': 'Monthly 1st',
		};
		return presets[cron] || cron;
	}

	function formatNextRun(iso: string): string {
		try {
			const d = new Date(iso);
			const now = new Date();
			const diffMs = d.getTime() - now.getTime();
			if (diffMs < 0) return 'overdue';
			if (diffMs < 60000) return 'in <1 min';
			if (diffMs < 3600000) return `in ${Math.round(diffMs / 60000)} min`;
			if (diffMs < 86400000) return `in ${Math.round(diffMs / 3600000)}h`;
			return `in ${Math.round(diffMs / 86400000)}d`;
		} catch {
			return '';
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

	// --- Command keydown (Ctrl+Enter to run) ---
	function handleCommandKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			runCustomCommand();
		}
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
		commandPrompt = entry.prompt;
		promptInputRef?.setText(entry.prompt);
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
	<title>Quick Commands - SQUAD</title>
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

				<PromptInput
					bind:this={promptInputRef}
					bind:value={commandPrompt}
					bind:references={referencedFiles}
					project={selectedProject}
					placeholder="Enter a prompt... Use @ to attach files and context"
					rows={3}
					onkeydown={handleCommandKeydown}
				/>

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

			<!-- Tabs: Templates / Pipelines / History -->
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
					onclick={() => activeTab = 'pipelines'}
					class="px-4 py-2 text-sm font-medium transition-colors relative"
					style="color: {activeTab === 'pipelines' ? 'oklch(0.90 0.01 250)' : 'oklch(0.55 0.01 250)'};"
				>
					Pipelines
					{#if pipelines.length > 0}
						<span class="ml-1.5 text-xs" style="color: oklch(0.50 0.01 250);">{pipelines.length}</span>
					{/if}
					{#if activeTab === 'pipelines'}
						<div class="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style="background: oklch(0.65 0.12 270);"></div>
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
											{#if templateSchedules[template.id]}
												{@const sched = templateSchedules[template.id]}
												{@const isAgent = sched.runMode === 'spawn-agent'}
												<span
													class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
													style="background: oklch(0.25 0.06 {isAgent ? '145' : '85'}); color: oklch(0.70 0.12 {isAgent ? '145' : '85'});"
													title={`Scheduled (${isAgent ? 'agent' : 'quick'}): ${formatCron(sched.cron)} | Next: ${sched.nextRun}`}
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
														<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
													</svg>
													{formatCron(sched.cron)}
													<span style="color: oklch(0.55 0.06 {isAgent ? '145' : '85'});">({formatNextRun(sched.nextRun)})</span>
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
										{#if templateSchedules[template.id]}
											<button
												onclick={() => removeSchedule(template.id)}
												class="p-1.5 rounded transition-colors"
												style="color: oklch(0.70 0.12 85);"
												title="Remove schedule"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6" />
												</svg>
											</button>
										{:else}
											<button
												onclick={() => openScheduleModal(template)}
												class="p-1.5 rounded transition-colors"
												style="color: oklch(0.55 0.06 85);"
												title="Schedule template"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
												</svg>
											</button>
										{/if}
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

			{#if activeTab === 'pipelines'}
				<div class="flex flex-col gap-3">
					{#if pipelines.length === 0}
						<div class="text-center py-12">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-12 h-12 mx-auto mb-3" style="color: oklch(0.35 0.01 250);">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
							</svg>
							<p class="text-sm mb-1" style="color: oklch(0.55 0.01 250);">No pipelines yet</p>
							<p class="text-xs mb-4" style="color: oklch(0.40 0.01 250);">
								Chain multiple commands together with output&#x2192;input passing
							</p>
							<button
								onclick={openNewPipeline}
								class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
								style="background: oklch(0.30 0.08 270); color: oklch(0.85 0.08 270);"
							>
								Create Pipeline
							</button>
						</div>
					{:else}
						{#each pipelines as pipeline (pipeline.id)}
							<div
								class="group rounded-lg p-3 transition-all"
								style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.25 0.01 250);"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 mb-1">
											<h3 class="text-sm font-medium truncate" style="color: oklch(0.90 0.01 250);">
												{pipeline.name}
											</h3>
											<span class="text-xs px-1.5 py-0.5 rounded shrink-0" style="background: oklch(0.25 0.06 270); color: oklch(0.70 0.10 270);">
												{pipeline.steps.length} steps
											</span>
										</div>
										{#if pipeline.description}
											<p class="text-xs truncate" style="color: oklch(0.50 0.01 250);">
												{pipeline.description}
											</p>
										{/if}
										<div class="flex items-center gap-1.5 mt-1.5">
											{#each pipeline.steps as step, i}
												<span class="text-xs px-1 py-0.5 rounded" style="background: oklch(0.18 0.01 250); color: oklch(0.55 0.01 250);">
													{step.label}
												</span>
												{#if i < pipeline.steps.length - 1}
													<span class="text-xs" style="color: oklch(0.35 0.01 250);">&#x2192;</span>
												{/if}
											{/each}
										</div>
									</div>
									<div class="flex items-center gap-1.5 shrink-0">
										<button
											onclick={() => startPipelineRun(pipeline)}
											class="p-1.5 rounded-md transition-colors"
											style="color: oklch(0.60 0.12 145); background: oklch(0.60 0.12 145 / 0.1);"
											title="Run pipeline"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
											</svg>
										</button>
										<button
											onclick={() => openEditPipeline(pipeline)}
											class="p-1.5 rounded-md transition-colors"
											style="color: oklch(0.60 0.08 200); background: oklch(0.60 0.08 200 / 0.1);"
											title="Edit pipeline"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
											</svg>
										</button>
										<button
											onclick={() => deletePipeline(pipeline)}
											class="p-1.5 rounded-md transition-colors"
											style="color: oklch(0.55 0.10 30); background: oklch(0.55 0.10 30 / 0.1);"
											title="Delete pipeline"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
											</svg>
										</button>
									</div>
								</div>
							</div>
						{/each}
						<button
							onclick={openNewPipeline}
							class="w-full py-2 text-xs font-medium rounded-md transition-colors"
							style="background: oklch(0.18 0.01 250); border: 1px dashed oklch(0.30 0.02 250); color: oklch(0.55 0.01 250);"
						>
							+ New Pipeline
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Pipeline Editor Modal -->
{#if showPipelineEditor}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0.10 0.01 250 / 0.7);"
		onclick={(e) => { if (e.target === e.currentTarget) showPipelineEditor = false; }}
	>
		<div
			class="rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 animate-scale-in"
			style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
		>
			<h2 class="text-base font-semibold mb-4" style="color: oklch(0.90 0.01 250);">
				{editingPipeline ? 'Edit Pipeline' : 'New Pipeline'}
			</h2>

			<div class="flex flex-col gap-3">
				<!-- Name -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Name</label>
					<input
						type="text"
						bind:value={pipelineEditorName}
						placeholder="Pipeline name"
						class="w-full rounded-md px-3 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
					/>
				</div>

				<!-- Description -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Description</label>
					<input
						type="text"
						bind:value={pipelineEditorDescription}
						placeholder="What this pipeline does"
						class="w-full rounded-md px-3 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
					/>
				</div>

				<!-- Default Project -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Default Project</label>
					<select
						bind:value={pipelineEditorProject}
						class="w-full rounded-md px-2 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
					>
						<option value="">Any project</option>
						{#each projects as project}
							<option value={project.key}>{project.name}</option>
						{/each}
					</select>
				</div>

				<!-- Steps -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">
						Steps <span class="font-normal opacity-60">({pipelineEditorSteps.length} steps, drag to reorder)</span>
					</label>
					<div class="flex flex-col gap-2">
						{#each pipelineEditorSteps as step, i (step.id)}
							<div
								class="rounded-lg p-3 relative transition-all"
								style="background: oklch(0.16 0.01 250); border: 1px solid {dragOverStepIndex === i ? 'oklch(0.50 0.12 270)' : 'oklch(0.28 0.02 250)'};"
								draggable="true"
								ondragstart={() => handleStepDragStart(i)}
								ondragover={(e) => handleStepDragOver(e, i)}
								ondrop={() => handleStepDrop(i)}
								ondragend={handleStepDragEnd}
							>
								<div class="flex items-center gap-2 mb-2">
									<!-- Drag handle -->
									<span class="cursor-grab text-xs opacity-40" style="color: oklch(0.55 0.01 250);" title="Drag to reorder">
										&#x2630;
									</span>
									<!-- Step number -->
									<span class="text-xs font-bold rounded px-1.5 py-0.5" style="background: oklch(0.30 0.08 270); color: oklch(0.80 0.10 270);">
										{i + 1}
									</span>
									<!-- Label -->
									<input
										type="text"
										bind:value={step.label}
										placeholder="Step label"
										class="flex-1 rounded px-2 py-1 text-xs"
										style="background: oklch(0.12 0.01 250); border: 1px solid oklch(0.25 0.02 250); color: oklch(0.85 0.01 250);"
									/>
									<!-- Model selector -->
									<select
										bind:value={step.model}
										class="rounded px-1.5 py-1 text-xs"
										style="background: oklch(0.12 0.01 250); border: 1px solid oklch(0.25 0.02 250); color: oklch(0.75 0.01 250);"
									>
										{#each MODELS as m}
											<option value={m.id}>{m.label}</option>
										{/each}
									</select>
									<!-- Remove button -->
									{#if pipelineEditorSteps.length > 2}
										<button
											onclick={() => removePipelineStep(i)}
											class="p-1 rounded transition-colors"
											style="color: oklch(0.50 0.10 30);"
											title="Remove step"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									{/if}
								</div>

								<!-- Template selector or prompt -->
								<div class="flex flex-col gap-1.5">
									<div class="flex items-center gap-2">
										<select
											value={step.templateId || ''}
											onchange={(e) => {
												const val = (e.target as HTMLSelectElement).value;
												pipelineEditorSteps[i] = { ...step, templateId: val || null, prompt: val ? '' : step.prompt };
												pipelineEditorSteps = [...pipelineEditorSteps];
											}}
											class="rounded px-2 py-1 text-xs"
											style="background: oklch(0.12 0.01 250); border: 1px solid oklch(0.25 0.02 250); color: oklch(0.75 0.01 250);"
										>
											<option value="">Freeform prompt</option>
											{#each templates as t}
												<option value={t.id}>{t.name}</option>
											{/each}
										</select>
										{#if i > 0}
											<span class="text-xs opacity-40" style="color: oklch(0.55 0.08 270);">
												{`{input}`} = output from step {i}
											</span>
										{/if}
									</div>
									{#if !step.templateId}
										<PromptInput
											bind:value={step.prompt}
											project={selectedProject}
											placeholder={i === 0 ? 'Enter prompt for this step...' : `Enter prompt... Use {input} for previous step output`}
											rows={2}
											compact={true}
										/>
									{:else}
										<div class="text-xs px-2 py-1 rounded truncate" style="background: oklch(0.14 0.01 250); color: oklch(0.50 0.01 250);">
											Using template: {templates.find(t => t.id === step.templateId)?.name || step.templateId}
										</div>
									{/if}
								</div>

								<!-- Arrow between steps -->
								{#if i < pipelineEditorSteps.length - 1}
									<div class="flex justify-center mt-2 -mb-1" style="color: oklch(0.40 0.06 270);">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
										</svg>
									</div>
								{/if}
							</div>
						{/each}

						<!-- Add step button -->
						<button
							onclick={addPipelineStep}
							class="rounded-lg p-2 text-xs transition-colors flex items-center justify-center gap-1.5"
							style="border: 1px dashed oklch(0.30 0.02 250); color: oklch(0.55 0.01 250);"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							Add Step
						</button>
					</div>
				</div>

				{#if pipelineEditorError}
					<p class="text-xs" style="color: oklch(0.65 0.12 30);">{pipelineEditorError}</p>
				{/if}

				<!-- Actions -->
				<div class="flex justify-end gap-2 mt-2">
					<button
						onclick={() => showPipelineEditor = false}
						class="px-3 py-1.5 rounded text-sm transition-colors"
						style="color: oklch(0.65 0.01 250);"
					>
						Cancel
					</button>
					<button
						onclick={savePipeline}
						disabled={pipelineEditorSaving}
						class="px-4 py-1.5 rounded text-sm font-medium transition-colors"
						style="background: oklch(0.50 0.12 270); color: oklch(0.98 0.01 270); opacity: {pipelineEditorSaving ? '0.6' : '1'};"
					>
						{pipelineEditorSaving ? 'Saving...' : (editingPipeline ? 'Update' : 'Create')} Pipeline
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Pipeline Runner Modal -->
{#if runningPipeline}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0.10 0.01 250 / 0.7);"
		onclick={(e) => { if (e.target === e.currentTarget && !pipelineRunning) closePipelineRunner(); }}
	>
		<div
			class="rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 animate-scale-in"
			style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
		>
			<div class="flex items-center justify-between mb-4">
				<div>
					<h2 class="text-base font-semibold" style="color: oklch(0.90 0.01 250);">
						{runningPipeline.name}
					</h2>
					{#if runningPipeline.description}
						<p class="text-xs mt-0.5" style="color: oklch(0.50 0.01 250);">{runningPipeline.description}</p>
					{/if}
				</div>
				<!-- Progress indicator -->
				<span class="text-xs px-2 py-1 rounded" style="background: oklch(0.25 0.06 270); color: oklch(0.75 0.10 270);">
					{pipelineRunSteps.filter(s => s.status === 'done').length}/{pipelineRunSteps.length} steps
				</span>
			</div>

			<!-- Project selector -->
			{#if !pipelineRunning && pipelineRunSteps.every(s => s.status === 'pending')}
				<div class="mb-3">
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Project</label>
					<select
						bind:value={pipelineRunProject}
						class="w-full rounded-md px-2 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.01 250);"
					>
						{#each projects as project}
							<option value={project.key}>{project.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Steps display -->
			<div class="flex flex-col gap-2">
				{#each pipelineRunSteps as step, i (i)}
					<div
						class="rounded-lg p-3 transition-all"
						style="
							background: oklch({step.status === 'running' ? '0.22' : '0.16'} 0.01 250);
							border: 1px solid {
								step.status === 'running' ? 'oklch(0.50 0.12 85)' :
								step.status === 'done' ? 'oklch(0.40 0.10 145)' :
								step.status === 'error' ? 'oklch(0.45 0.12 30)' :
								'oklch(0.25 0.02 250)'
							};
						"
					>
						<div class="flex items-center gap-2">
							<!-- Status icon -->
							{#if step.status === 'running'}
								<div class="w-4 h-4 rounded-full animate-spin-fast" style="border: 2px solid oklch(0.65 0.12 85); border-top-color: transparent;"></div>
							{:else if step.status === 'done'}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="oklch(0.65 0.12 145)" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
								</svg>
							{:else if step.status === 'error'}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="oklch(0.65 0.12 30)" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							{:else}
								<div class="w-4 h-4 rounded-full" style="border: 2px solid oklch(0.30 0.02 250);"></div>
							{/if}

							<span class="text-xs font-bold rounded px-1.5 py-0.5" style="background: oklch(0.30 0.08 270); color: oklch(0.80 0.10 270);">
								{i + 1}
							</span>
							<span class="text-sm flex-1" style="color: oklch(0.85 0.01 250);">{step.label}</span>
							<span class="text-xs px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.02 250); color: oklch(0.55 0.01 250);">
								{step.model}
							</span>
							{#if step.durationMs}
								<span class="text-xs" style="color: oklch(0.45 0.01 250);">{formatDuration(step.durationMs)}</span>
							{/if}
						</div>

						<!-- Result/Error -->
						{#if step.status === 'done' && step.result}
							<div class="mt-2 rounded p-2 text-xs overflow-auto" style="background: oklch(0.12 0.01 250); color: oklch(0.75 0.01 250); max-height: 150px;">
								<pre class="whitespace-pre-wrap">{step.result.length > 500 ? step.result.slice(0, 500) + '...' : step.result}</pre>
							</div>
						{/if}
						{#if step.status === 'error' && step.error}
							<div class="mt-2 rounded p-2 text-xs" style="background: oklch(0.18 0.04 30 / 0.3); color: oklch(0.70 0.12 30);">
								{step.error}
							</div>
						{/if}
					</div>

					<!-- Arrow between steps -->
					{#if i < pipelineRunSteps.length - 1}
						<div class="flex justify-center -my-1" style="color: oklch(0.40 0.06 270);">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
							</svg>
						</div>
					{/if}
				{/each}
			</div>

			{#if pipelineRunError}
				<div class="mt-3 rounded p-2 text-xs" style="background: oklch(0.18 0.04 30 / 0.3); color: oklch(0.70 0.12 30);">
					{pipelineRunError}
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2 mt-4">
				<button
					onclick={closePipelineRunner}
					disabled={pipelineRunning}
					class="px-3 py-1.5 rounded text-sm transition-colors"
					style="color: oklch(0.65 0.01 250); opacity: {pipelineRunning ? '0.5' : '1'};"
				>
					{pipelineRunSteps.every(s => s.status === 'done') ? 'Done' : 'Cancel'}
				</button>
				{#if !pipelineRunSteps.every(s => s.status === 'done')}
					<button
						onclick={executePipelineRun}
						disabled={pipelineRunning}
						class="px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2"
						style="background: oklch(0.45 0.12 145); color: oklch(0.98 0.01 145); opacity: {pipelineRunning ? '0.6' : '1'};"
					>
						{#if pipelineRunning}
							<div class="w-3 h-3 rounded-full animate-spin-fast" style="border: 2px solid oklch(0.98 0.01 145); border-top-color: transparent;"></div>
							Running...
						{:else if pipelineRunSteps.some(s => s.status === 'error')}
							Resume
						{:else}
							Run Pipeline
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

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
					<PromptInput
						bind:value={editorPrompt}
						project={selectedProject}
						placeholder="Enter the prompt template... Use @path/to/file to reference files"
						rows={4}
					/>
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

<!-- Schedule Modal -->
{#if showScheduleModal && schedulingTemplate}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0.10 0.01 250 / 0.7);"
		onclick={(e) => { if (e.target === e.currentTarget) showScheduleModal = false; }}
	>
		<div
			class="rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 animate-scale-in"
			style="background: oklch(0.20 0.01 250); border: 1px solid oklch(0.30 0.02 250);"
		>
			<h2 class="text-base font-semibold mb-1" style="color: oklch(0.90 0.01 250);">
				Schedule: {schedulingTemplate.name}
			</h2>
			<p class="text-xs mb-4" style="color: oklch(0.50 0.01 250);">
				Run this template on a recurring schedule via the scheduler daemon.
			</p>

			<div class="flex flex-col gap-3">
				<!-- Run Mode -->
				<div class="space-y-1.5">
					<button
						type="button"
						class="w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-150 cursor-pointer"
						style="background: {scheduleRunMode === 'quick-command' ? 'oklch(0.22 0.04 200 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {scheduleRunMode === 'quick-command' ? 'oklch(0.45 0.10 200)' : 'oklch(0.25 0.02 250)'}; color: {scheduleRunMode === 'quick-command' ? 'oklch(0.85 0.08 200)' : 'oklch(0.55 0.02 250)'};"
						onclick={() => scheduleRunMode = 'quick-command'}
					>
						<span class="font-semibold">Quick command</span>
						<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Single-turn, fast and cheap. Result stored in child task.</span>
					</button>
					<button
						type="button"
						class="w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-150 cursor-pointer"
						style="background: {scheduleRunMode === 'spawn-agent' ? 'oklch(0.22 0.04 145 / 0.4)' : 'oklch(0.18 0.01 250)'}; border: 1px solid {scheduleRunMode === 'spawn-agent' ? 'oklch(0.45 0.10 145)' : 'oklch(0.25 0.02 250)'}; color: {scheduleRunMode === 'spawn-agent' ? 'oklch(0.85 0.08 145)' : 'oklch(0.55 0.02 250)'};"
						onclick={() => scheduleRunMode = 'spawn-agent'}
					>
						<span class="font-semibold">Spawn agent</span>
						<span class="block text-[10px] mt-0.5" style="color: oklch(0.45 0.02 250);">Full multi-turn session. Agent works on child task like any other task.</span>
					</button>
				</div>

				<!-- Cron Expression -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Cron Expression</label>
					<input
						type="text"
						bind:value={scheduleCron}
						placeholder="0 9 * * *"
						class="w-full rounded-md px-3 py-2 text-sm font-mono"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
					/>
					<div class="flex flex-wrap gap-1 mt-1.5">
						{#each [
							{ label: 'Hourly', cron: '0 * * * *' },
							{ label: 'Daily 9 AM', cron: '0 9 * * *' },
							{ label: 'Weekdays 9 AM', cron: '0 9 * * 1-5' },
							{ label: 'Every 6h', cron: '0 */6 * * *' },
							{ label: 'Every 30m', cron: '*/30 * * * *' },
							{ label: 'Weekly Sun', cron: '0 0 * * 0' },
						] as preset}
							<button
								onclick={() => scheduleCron = preset.cron}
								class="px-2 py-0.5 rounded text-xs transition-colors"
								style="
									background: {scheduleCron === preset.cron ? 'oklch(0.40 0.10 85)' : 'oklch(0.18 0.01 250)'};
									color: {scheduleCron === preset.cron ? 'oklch(0.95 0.01 85)' : 'oklch(0.55 0.01 250)'};
									border: 1px solid {scheduleCron === preset.cron ? 'oklch(0.50 0.12 85)' : 'oklch(0.28 0.02 250)'};
								"
							>
								{preset.label}
							</button>
						{/each}
					</div>
					<p class="text-xs mt-1 font-mono" style="color: oklch(0.50 0.06 85);">
						{formatCron(scheduleCron)}
					</p>
				</div>

				<!-- Project -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Project</label>
					<select
						bind:value={scheduleProject}
						class="w-full rounded-md px-3 py-2 text-sm"
						style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
					>
						{#each projects as project}
							<option value={project.key}>{project.name}</option>
						{/each}
					</select>
				</div>

				<!-- Model -->
				<div>
					<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">Model</label>
					<div class="flex gap-1.5">
						{#each MODELS as model}
							<button
								onclick={() => scheduleModel = model.id}
								class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-center"
								style="
									background: {scheduleModel === model.id ? 'oklch(0.40 0.10 200)' : 'oklch(0.18 0.01 250)'};
									color: {scheduleModel === model.id ? 'oklch(0.95 0.01 200)' : 'oklch(0.55 0.01 250)'};
									border: 1px solid {scheduleModel === model.id ? 'oklch(0.50 0.12 200)' : 'oklch(0.28 0.02 250)'};
								"
							>
								{model.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Variable Defaults (if template has variables) -->
				{#if schedulingTemplate.variables && schedulingTemplate.variables.length > 0}
					<div>
						<label class="block text-xs mb-1 font-medium" style="color: oklch(0.65 0.01 250);">
							Variable Defaults
							<span class="font-normal opacity-60 ml-1">Used for each scheduled run</span>
						</label>
						<div class="flex flex-col gap-2">
							{#each schedulingTemplate.variables as variable}
								<div>
									<label class="block text-xs mb-0.5" style="color: oklch(0.55 0.01 250);">{variable.label || variable.name}</label>
									<input
										type="text"
										bind:value={scheduleVariables[variable.name]}
										placeholder={variable.placeholder || variable.default || ''}
										class="w-full rounded-md px-3 py-1.5 text-sm"
										style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.90 0.01 250);"
									/>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Error -->
				{#if scheduleError}
					<div class="text-xs p-2 rounded" style="background: oklch(0.25 0.05 30); color: oklch(0.75 0.15 30);">
						{scheduleError}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end gap-2 mt-4">
				<button
					onclick={() => showScheduleModal = false}
					class="px-3 py-1.5 rounded-md text-sm"
					style="color: oklch(0.60 0.01 250);"
				>
					Cancel
				</button>
				<button
					onclick={saveSchedule}
					disabled={!scheduleCron.trim() || scheduleSaving}
					class="px-4 py-1.5 rounded-md text-sm font-medium"
					style="
						background: {!scheduleCron.trim() || scheduleSaving ? 'oklch(0.25 0.02 250)' : 'oklch(0.50 0.12 85)'};
						color: {!scheduleCron.trim() || scheduleSaving ? 'oklch(0.50 0.01 250)' : 'oklch(0.98 0.01 85)'};
					"
				>
					{scheduleSaving ? 'Scheduling...' : 'Save Schedule'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Chip styles now live in PromptInput.svelte */
</style>
