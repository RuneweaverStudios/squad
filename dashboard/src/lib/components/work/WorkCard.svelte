<script lang="ts">
	/**
	 * WorkCard Component
	 * Task-first view of active Claude Code session work.
	 *
	 * Design Philosophy:
	 * - Task is primary (headline), agent is secondary (metadata badge)
	 * - Focus on what work is being done, not who is doing it
	 * - Inline output with ANSI rendering
	 * - Kill session and control buttons
	 * - Prompt detection with quick action buttons
	 * - Text input for sending commands
	 *
	 * Props:
	 * - sessionName: tmux session name (e.g., "jat-WisePrairie")
	 * - agentName: Agent name (e.g., "WisePrairie")
	 * - task: Current task object (id, title, status, priority)
	 * - output: Terminal output string with ANSI codes
	 * - lineCount: Number of output lines
	 * - tokens: Token usage for today
	 * - cost: Cost in USD for today
	 */

	import { onMount, onDestroy } from 'svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { ansiToHtml } from '$lib/utils/ansiToHtml';
	import TokenUsageDisplay from '$lib/components/TokenUsageDisplay.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import AnimatedDigits from '$lib/components/AnimatedDigits.svelte';
	import { playTaskCompleteSound } from '$lib/utils/soundEffects';
	import VoiceInput from '$lib/components/VoiceInput.svelte';
	import StatusActionBadge from './StatusActionBadge.svelte';
	import { SESSION_STATE_VISUALS, type SessionStateVisual } from '$lib/config/statusColors';

	// Props - aligned with workSessions.svelte.ts types
	interface Task {
		id: string;
		title?: string;
		description?: string;
		status?: string;
		priority?: number;
		issue_type?: string;
	}

	/** Extended task info for completed tasks - includes closedAt timestamp */
	interface CompletedTask extends Task {
		closedAt?: string;
	}

	interface SparklineDataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	interface Props {
		sessionName: string;
		agentName: string;
		task: Task | null;
		/** Most recently closed task by this agent (for completion state display) */
		lastCompletedTask: CompletedTask | null;
		output?: string;
		lineCount?: number;
		tokens?: number;
		cost?: number;
		sparklineData?: SparklineDataPoint[]; // Hourly token usage for sparkline
		isComplete?: boolean; // Task completion state
		startTime?: Date | null; // When work started (for elapsed time)
		onKillSession?: () => void;
		onInterrupt?: () => void;
		onContinue?: () => void;
		onAttachTerminal?: () => void; // Open tmux session in terminal
		onTaskClick?: (taskId: string) => void;
		onSendInput?: (input: string, type: 'text' | 'key' | 'raw') => Promise<void>;
		onDismiss?: () => void; // Called when completion banner auto-dismisses
		class?: string;
		/** Whether this work card is currently highlighted (e.g., from clicking avatar elsewhere) */
		isHighlighted?: boolean;
	}

	let {
		sessionName,
		agentName,
		task = null,
		lastCompletedTask = null,
		output = '',
		lineCount = 0,
		tokens = 0,
		cost = 0,
		sparklineData = [],
		isComplete = false,
		startTime = null,
		onKillSession,
		onInterrupt,
		onContinue,
		onAttachTerminal,
		onTaskClick,
		onSendInput,
		onDismiss,
		class: className = '',
		isHighlighted = false
	}: Props = $props();

	// Completion state
	let showCompletionBanner = $state(false);
	let completionDismissTimer: ReturnType<typeof setTimeout> | null = null;
	let previousIsComplete = $state(false);

	// Real-time elapsed time clock (ticks every second)
	let currentTime = $state(Date.now());
	let elapsedTimeInterval: ReturnType<typeof setInterval> | null = null;

	// API-based question data (from PostToolUse hook)
	interface APIQuestion {
		question: string;
		header: string;
		multiSelect: boolean;
		options: { label: string; description: string }[];
	}
	let apiQuestionData = $state<{ active: boolean; questions: APIQuestion[] } | null>(null);
	let questionPollInterval: ReturnType<typeof setInterval> | null = null;
	// Track selected options locally for multi-select (API doesn't update with selections)
	let selectedOptionIndices = $state<Set<number>>(new Set());
	// Track current cursor position in the question UI
	let currentOptionIndex = $state(0);

	// Fetch question data from API
	async function fetchQuestionData() {
		if (!sessionName) return;
		try {
			const response = await fetch(`/api/work/${encodeURIComponent(sessionName)}/question`);
			if (response.ok) {
				const data = await response.json();
				// Reset selection state if this is a new question
				const oldQuestion = apiQuestionData?.questions?.[0]?.question;
				const newQuestion = data?.questions?.[0]?.question;
				if (oldQuestion !== newQuestion) {
					selectedOptionIndices = new Set();
					currentOptionIndex = 0;
				}
				apiQuestionData = data;
			}
		} catch (error) {
			// Silently fail - question data is optional enhancement
		}
	}

	// Clear question data after answering
	async function clearQuestionData() {
		if (!sessionName) return;
		try {
			await fetch(`/api/work/${encodeURIComponent(sessionName)}/question`, {
				method: 'DELETE'
			});
			apiQuestionData = null;
		} catch (error) {
			// Silently fail
		}
	}

	onMount(() => {
		// Update currentTime every second for real-time elapsed time display
		elapsedTimeInterval = setInterval(() => {
			currentTime = Date.now();
		}, 1000);

		// Poll for question data every 500ms when in needs-input state
		fetchQuestionData();
		questionPollInterval = setInterval(fetchQuestionData, 500);
	});

	// Track when completion state changes to trigger banner
	$effect(() => {
		if (isComplete && !previousIsComplete) {
			// Task just completed - show banner and play sound
			showCompletionBanner = true;
			playTaskCompleteSound();

			// Auto-dismiss after 4 seconds
			completionDismissTimer = setTimeout(() => {
				showCompletionBanner = false;
				onDismiss?.();
			}, 4000);
		}
		previousIsComplete = isComplete;
	});

	// Track previous output length to detect submissions from attached terminal
	let previousOutputLength = $state(0);

	// Clear textarea when streamed text is submitted in terminal
	$effect(() => {
		if (!liveStreamEnabled || !lastStreamedText || !output) {
			previousOutputLength = output?.length || 0;
			return;
		}

		// Only check if output grew significantly (not just echo of typed chars)
		const outputGrowth = output.length - previousOutputLength;
		if (outputGrowth <= 0) {
			previousOutputLength = output.length;
			return;
		}

		const newContent = output.slice(previousOutputLength);

		// Detect submission: new content contains the streamed text AND has a newline
		// The newline indicates Enter was pressed (either echoed or from response)
		const hasStreamedText = newContent.includes(lastStreamedText);
		const hasNewline = newContent.includes('\n');
		const significantGrowth = outputGrowth > lastStreamedText.length; // More output than just echo

		if (hasStreamedText && hasNewline && significantGrowth && lastStreamedText.length >= 2) {
			// Text was likely submitted in terminal - clear textarea
			inputText = '';
			lastStreamedText = '';
			setTimeout(autoResizeTextarea, 0);
		}

		previousOutputLength = output.length;
	});

	// Cleanup timers on destroy
	onDestroy(() => {
		if (completionDismissTimer) {
			clearTimeout(completionDismissTimer);
		}
		if (elapsedTimeInterval) {
			clearInterval(elapsedTimeInterval);
		}
		if (questionPollInterval) {
			clearInterval(questionPollInterval);
		}
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
		}
		if (streamDebounceTimer) {
			clearTimeout(streamDebounceTimer);
		}
	});

	// Calculate elapsed time (uses currentTime to trigger reactive updates)
	const elapsedTime = $derived((): string => {
		if (!startTime) return '';
		const elapsed = currentTime - startTime.getTime();
		const seconds = Math.floor(elapsed / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	});

	// Formatted elapsed time for AnimatedDigits display
	// Returns object with hours, minutes, seconds as zero-padded strings
	const elapsedTimeFormatted = $derived(() => {
		if (!startTime) return null;
		const elapsed = currentTime - startTime.getTime();
		const totalSeconds = Math.floor(elapsed / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours: String(hours).padStart(2, '0'),
			minutes: String(minutes).padStart(2, '0'),
			seconds: String(seconds).padStart(2, '0'),
			showHours: hours > 0
		};
	});

	// Format token count for display
	function formatTokens(t: number): string {
		if (t >= 1_000_000) {
			return `${(t / 1_000_000).toFixed(1)}M`;
		} else if (t >= 1_000) {
			return `${(t / 1_000).toFixed(1)}K`;
		}
		return t.toString();
	}

	// Auto-scroll state
	let autoScroll = $state(true);
	let userScrolledUp = $state(false);
	let scrollContainerRef: HTMLDivElement | null = null;

	// Detect when user manually scrolls up to disable auto-scroll
	function handleScroll(e: Event) {
		const el = e.target as HTMLDivElement;
		if (!el) return;

		// Check if user is near bottom (within 50px)
		const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;

		if (isNearBottom) {
			// User scrolled to bottom, re-enable auto-scroll
			userScrolledUp = false;
		} else if (el.scrollTop < el.scrollHeight - el.clientHeight - 100) {
			// User scrolled up significantly, disable auto-scroll temporarily
			userScrolledUp = true;
		}
	}

	// Control button loading states
	let killLoading = $state(false);
	let interruptLoading = $state(false);
	let continueLoading = $state(false);
	let sendingInput = $state(false);

	// Input state
	let inputText = $state('');
	let inputRef: HTMLTextAreaElement | null = null;

	// Live streaming input state
	// When enabled, characters are streamed to terminal as user types
	// This enables instant slash command filtering in Claude Code
	let liveStreamEnabled = $state(true); // Default ON for better UX
	let lastStreamedText = $state(''); // Track what we've already sent
	let streamDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const STREAM_DEBOUNCE_MS = 50; // Short debounce for responsive feel
	let isStreaming = $state(false); // Track if we're actively streaming

	// Task description hover-expand state
	let taskHovered = $state(false);
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
	const HOVER_DELAY = 300; // ms before expanding

	function handleTaskMouseEnter() {
		hoverTimeout = setTimeout(() => {
			taskHovered = true;
		}, HOVER_DELAY);
	}

	function handleTaskMouseLeave() {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		taskHovered = false;
	}

	// Inline title editing state
	let editingTitle = $state(false);
	let editedTitle = $state('');
	let titleInputRef: HTMLInputElement | null = null;
	let savingTitle = $state(false);

	function startEditingTitle(event: MouseEvent) {
		event.stopPropagation(); // Don't trigger parent button click
		editedTitle = displayTask?.title || displayTask?.id || '';
		editingTitle = true;
		// Focus input after DOM update
		setTimeout(() => titleInputRef?.focus(), 0);
	}

	async function saveTitle() {
		if (!displayTask || savingTitle) return;

		const newTitle = editedTitle.trim();
		if (!newTitle || newTitle === displayTask.title) {
			editingTitle = false;
			return;
		}

		savingTitle = true;
		try {
			const response = await fetch(`/api/tasks/${displayTask.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle })
			});

			if (response.ok) {
				// Update local state
				if (displayTask) {
					displayTask.title = newTitle;
				}
			} else {
				console.error('Failed to save title:', await response.text());
			}
		} catch (err) {
			console.error('Error saving title:', err);
		} finally {
			savingTitle = false;
			editingTitle = false;
		}
	}

	function handleTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveTitle();
		} else if (event.key === 'Escape') {
			editingTitle = false;
		}
	}

	// Auto-resize textarea to fit content
	function autoResizeTextarea() {
		if (!inputRef) return;
		// Reset height to auto to get accurate scrollHeight
		inputRef.style.height = 'auto';
		// Set height to scrollHeight, capped at max (6 lines roughly = 96px)
		const maxHeight = 96;
		const newHeight = Math.min(inputRef.scrollHeight, maxHeight);
		inputRef.style.height = `${newHeight}px`;
	}

	// Stream text input to terminal as user types
	// This enables real-time slash command filtering in Claude Code
	async function streamInputToTerminal() {
		if (!liveStreamEnabled || !onSendInput || isStreaming) return;

		const currentText = inputText;
		const previousText = lastStreamedText;

		// Nothing changed
		if (currentText === previousText) return;

		// Don't stream if text is empty (user cleared input)
		if (!currentText) {
			// If we had text before, clear the terminal input
			if (previousText) {
				isStreaming = true;
				try {
					// Send Ctrl+U to clear the current line
					await onSendInput('ctrl-u', 'key');
					lastStreamedText = '';
				} finally {
					isStreaming = false;
				}
			}
			return;
		}

		isStreaming = true;
		try {
			if (currentText.startsWith(previousText)) {
				// Text was appended - send only the new characters (most common case)
				const newChars = currentText.slice(previousText.length);
				if (newChars) {
					await onSendInput(newChars, 'raw');
				}
			} else {
				// Text was modified (deletion, paste, or edit in middle)
				// Clear line and resend entire text
				await onSendInput('ctrl-u', 'key');
				await new Promise(r => setTimeout(r, 20));
				if (currentText) {
					await onSendInput(currentText, 'raw');
				}
			}

			lastStreamedText = currentText;
		} catch (error) {
			console.error('Error streaming input:', error);
		} finally {
			isStreaming = false;
		}
	}

	// Debounced input handler for live streaming
	function handleInputChange() {
		autoResizeTextarea();

		if (!liveStreamEnabled) return;

		// Clear existing debounce timer
		if (streamDebounceTimer) {
			clearTimeout(streamDebounceTimer);
		}

		// Debounce the stream to avoid overwhelming tmux
		streamDebounceTimer = setTimeout(() => {
			streamInputToTerminal();
		}, STREAM_DEBOUNCE_MS);
	}

	// Focus input when hovering over the card
	function handleCardMouseEnter() {
		if (inputRef && !sendingInput) {
			inputRef.focus();
		}
	}

	// Attached images (pending upload)
	interface AttachedImage {
		id: string;
		blob: Blob;
		preview: string; // Data URL for thumbnail
		name: string;
	}
	let attachedImages = $state<AttachedImage[]>([]);

	// Detected Claude Code prompt options (numbered format: "1. Yes", "2. No")
	interface PromptOption {
		number: number;
		text: string;
		type: 'yes' | 'yes-remember' | 'custom' | 'other';
		keySequence: string[]; // Keys to send (e.g., ['down', 'enter'])
	}

	// Detected Claude Code AskUserQuestion options (selection format)
	// Format: "❯ Option1" or "  Option2" with optional descriptions
	interface QuestionOption {
		label: string;
		description?: string;
		index: number; // 0-based position in the list
		isSelected: boolean; // Whether this option has the ❯ cursor
		keySequence: string[]; // Keys to navigate and select
	}

	// Detected question UI state
	interface DetectedQuestion {
		question: string; // The question text (after "?")
		options: QuestionOption[];
		isMultiSelect: boolean; // True if [ ] checkboxes are used
		selectedIndices: number[]; // For multi-select, which are checked
	}

	// Detected JAT workflow commands (e.g., /jat:complete, /jat:pause)
	interface WorkflowCommand {
		command: string; // Full command (e.g., '/jat:complete')
		label: string; // Display label (e.g., 'Complete')
		description: string; // Description text
		variant: 'success' | 'primary' | 'warning' | 'info'; // Button style
	}

	// Parse Claude Code prompt options from output
	const detectedOptions = $derived.by((): PromptOption[] => {
		if (!output) return [];

		const options: PromptOption[] = [];
		const seenNumbers = new Set<number>(); // Track seen option numbers to avoid duplicates

		// Look for "Do you want to proceed?" or similar prompts
		// Match lines like "❯ 1. Yes" or "  2. Yes, and don't ask again..."
		const optionRegex = /^[❯\s]+(\d+)\.\s+(.+)$/gm;
		let match;

		while ((match = optionRegex.exec(output)) !== null) {
			const num = parseInt(match[1], 10);

			// Skip if we've already seen this option number (avoid duplicate keys)
			if (seenNumbers.has(num)) continue;
			seenNumbers.add(num);

			const text = match[2].trim();

			// Determine option type
			let type: PromptOption['type'] = 'other';
			if (/^Yes\s*$/.test(text)) {
				type = 'yes';
			} else if (/Yes.*don't ask again/i.test(text) || /Yes.*and don't ask/i.test(text)) {
				type = 'yes-remember';
			} else if (/Type here/i.test(text) || /tell Claude/i.test(text)) {
				type = 'custom';
			}

			// Calculate key sequence: option 1 = just Enter, option 2 = Down+Enter, etc.
			const downs = num - 1;
			const keySequence: string[] = [];
			for (let i = 0; i < downs; i++) {
				keySequence.push('down');
			}
			keySequence.push('enter');

			options.push({ number: num, text, type, keySequence });
		}

		return options;
	});

	// Parse Claude Code AskUserQuestion format from output
	// Detects both single-select (❯ cursor) and multi-select ([ ] checkbox) formats
	const detectedQuestion = $derived.by((): DetectedQuestion | null => {
		if (!output) return null;

		// Only look at recent output (last 3000 chars)
		const recentOutput = output.slice(-3000);

		// Check for the navigation footer which indicates an active question prompt
		const hasQuestionUI = /Enter to select.*(?:Tab|Arrow).*(?:navigate|keys).*Esc to cancel/i.test(recentOutput);
		if (!hasQuestionUI) return null;

		// Find the question text (line starting with "?")
		const questionMatch = recentOutput.match(/^\s*\?\s+(.+)$/m);
		const question = questionMatch ? questionMatch[1].trim() : '';

		// Detect if this is multi-select by looking for [ ] or [×] checkboxes
		const isMultiSelect = /\[\s*[×x]?\s*\]/.test(recentOutput);

		const options: QuestionOption[] = [];
		const selectedIndices: number[] = [];

		if (isMultiSelect) {
			// Multi-select format: "[ ] Option" or "[×] Option" or "[x] Option"
			// Each line may have a checkbox followed by option text
			const checkboxRegex = /^\s*(\[[×x\s]*\])\s+(.+?)(?:\s{2,}(.+))?$/gm;
			let match;
			let index = 0;

			while ((match = checkboxRegex.exec(recentOutput)) !== null) {
				const checkbox = match[1];
				const label = match[2].trim();
				const description = match[3]?.trim();
				const isChecked = /[×x]/.test(checkbox);

				if (isChecked) {
					selectedIndices.push(index);
				}

				// For multi-select: navigate to option, press space to toggle
				const keySequence: string[] = [];
				// Navigate to the right position
				for (let i = 0; i < index; i++) {
					keySequence.push('down');
				}
				keySequence.push('space'); // Toggle selection

				options.push({
					label,
					description,
					index,
					isSelected: isChecked,
					keySequence
				});
				index++;
			}
		} else {
			// Single-select format: "❯ Option" (selected) or "  Option" (not selected)
			// Options may have descriptions separated by multiple spaces
			// The ❯ may be indented, and options are aligned
			const lines = recentOutput.split('\n');
			let inOptionSection = false;
			let currentSelectedIndex = 0;
			let index = 0;

			for (const line of lines) {
				// Skip empty lines and the navigation footer
				if (!line.trim()) continue;
				if (/Enter to select/i.test(line)) break;

				// Check if this line is an option (with ❯ cursor or aligned unselected)
				// The ❯ may have leading whitespace, so we check for it anywhere in the line start
				const selectedMatch = line.match(/^\s*❯\s+(.+?)(?:\s{2,}(.+))?$/);
				// Unselected options have spaces where ❯ would be (typically 2+ spaces before text)
				const unselectedMatch = line.match(/^\s{2,}([^\s❯].+?)(?:\s{2,}(.+))?$/);

				if (selectedMatch) {
					inOptionSection = true;
					const label = selectedMatch[1].trim();
					const description = selectedMatch[2]?.trim();
					currentSelectedIndex = index;

					// For single-select: navigate and press enter
					const keySequence: string[] = [];
					// Since this is already selected, just press enter
					keySequence.push('enter');

					options.push({
						label,
						description,
						index,
						isSelected: true,
						keySequence
					});
					index++;
				} else if (unselectedMatch && inOptionSection) {
					const label = unselectedMatch[1].trim();
					const description = unselectedMatch[2]?.trim();

					// Skip if this looks like the question line or other non-option content
					if (label.length > 60 || /^\?/.test(label)) continue;
					// Skip lines that look like hints or navigation instructions
					if (/^(Enter|Tab|Arrow|Esc|Space)/i.test(label)) continue;

					// Navigate down from current position, then press enter
					const keySequence: string[] = [];
					const stepsDown = index - currentSelectedIndex;
					for (let i = 0; i < stepsDown; i++) {
						keySequence.push('down');
					}
					keySequence.push('enter');

					options.push({
						label,
						description,
						index,
						isSelected: false,
						keySequence
					});
					index++;
				}
			}
		}

		// Only return if we found valid options
		if (options.length === 0) return null;

		return {
			question,
			options,
			isMultiSelect,
			selectedIndices
		};
	});

	// Detect JAT workflow state from structured markers in output
	// Markers: [JAT:READY actions=...], [JAT:WORKING task=...], [JAT:IDLE actions=...]
	const detectedWorkflowCommands = $derived.by((): WorkflowCommand[] => {
		if (!output) return [];

		// Only look at the last ~3000 characters (recent output)
		const recentOutput = output.slice(-3000);

		const commands: WorkflowCommand[] = [];

		// Check for structured JAT markers (most reliable detection)
		const readyMatch = recentOutput.match(/\[JAT:READY actions=([^\]]+)\]/);
		const workingMatch = recentOutput.match(/\[JAT:WORKING task=([^\]]+)\]/);
		const idleMatch = recentOutput.match(/\[JAT:IDLE actions=([^\]]+)\]/);

		// If WORKING marker is more recent than READY/IDLE, agent is actively working
		if (workingMatch) {
			const workingIndex = recentOutput.lastIndexOf('[JAT:WORKING');
			const readyIndex = recentOutput.lastIndexOf('[JAT:READY');
			const idleIndex = recentOutput.lastIndexOf('[JAT:IDLE');

			// If WORKING is the most recent marker, no workflow buttons
			if (workingIndex > readyIndex && workingIndex > idleIndex) {
				return [];
			}
		}

		// Parse READY marker actions
		if (readyMatch) {
			const readyIndex = recentOutput.lastIndexOf('[JAT:READY');
			const workingIndex = recentOutput.lastIndexOf('[JAT:WORKING');

			// Only use READY if it's more recent than WORKING
			if (readyIndex > workingIndex) {
				const actions = readyMatch[1].split(',').map((a) => a.trim());

				if (actions.includes('complete')) {
					commands.push({
						command: '/jat:complete',
						label: 'Done',
						description: 'Complete this task and see menu',
						variant: 'success'
					});
				}
				// Note: /jat:next removed from UI - one agent = one session = one task model
			}
		}

		// Parse IDLE marker actions
		if (idleMatch && commands.length === 0) {
			const idleIndex = recentOutput.lastIndexOf('[JAT:IDLE');
			const workingIndex = recentOutput.lastIndexOf('[JAT:WORKING');

			if (idleIndex > workingIndex) {
				const actions = idleMatch[1].split(',').map((a) => a.trim());

				if (actions.includes('start')) {
					commands.push({
						command: '/jat:start',
						label: 'Start',
						description: 'Pick up a task',
						variant: 'primary'
					});
				}
			}
		}

		// Fallback: detect old-style patterns if no markers found (only for /jat:complete)
		if (commands.length === 0) {
			const hasNextStepsContext =
				/next\s*steps?:/i.test(recentOutput) && /\/jat:complete\b/.test(recentOutput);

			const hasResumedWork =
				/\[JAT:WORKING/.test(recentOutput) ||
				/Get to work!/i.test(recentOutput) ||
				/╔.*STARTING WORK/i.test(recentOutput);

			if (hasNextStepsContext && !hasResumedWork) {
				// Note: /jat:next removed from UI - one agent = one session = one task model
				if (/\/jat:complete\b/.test(recentOutput)) {
					commands.push({
						command: '/jat:complete',
						label: 'Done',
						description: 'Complete this task',
						variant: 'success'
					});
				}
			}
		}

		return commands;
	});

	/**
	 * Session State - Determines what to show in the header
	 *
	 * States:
	 * - 'starting': Task assigned, agent initializing (no [JAT:WORKING] marker yet)
	 * - 'working': Has active in_progress task with [JAT:WORKING] marker
	 * - 'needs-input': Agent blocked, needs user to provide clarification (orange)
	 * - 'ready-for-review': Work done, awaiting user review (yellow)
	 * - 'completing': User triggered /jat:complete, agent running completion steps (teal)
	 * - 'completed': Task was closed, showing completion summary (green)
	 * - 'idle': No task, new session (gray)
	 */
	type SessionState = 'starting' | 'working' | 'needs-input' | 'ready-for-review' | 'completing' | 'completed' | 'idle';

	const sessionState = $derived.by((): SessionState => {
		// Check for markers in recent output
		const recentOutput = output ? output.slice(-3000) : '';

		// Find LAST position of each marker type (most recent wins)
		// This allows state transitions: needs-input → working → review → completed
		const findLastPos = (patterns: RegExp[]): number => {
			let maxPos = -1;
			for (const pattern of patterns) {
				const match = recentOutput.match(new RegExp(pattern.source, 'g'));
				if (match) {
					const lastMatch = match[match.length - 1];
					const pos = recentOutput.lastIndexOf(lastMatch);
					if (pos > maxPos) maxPos = pos;
				}
			}
			return maxPos;
		};

		// Find last position of each marker type
		// Include Claude Code's native AskUserQuestion UI patterns
		const needsInputPos = findLastPos([
			/\[JAT:NEEDS_INPUT\]/,
			/❓\s*NEED CLARIFICATION/,
			// Claude Code's native question UI patterns
			/Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/,
			/\[ \].*\n.*\[ \]/,  // Multiple checkbox options
			/Type something\s*\n\s*Next/,  // "Type something" option in questions
		]);
		const workingPos = findLastPos([/\[JAT:WORKING\s+task=/]);
		const reviewPos = findLastPos([
			/\[JAT:NEEDS_REVIEW\]/,
			/\[JAT:READY\s+actions=/,
			/🔍\s*READY FOR REVIEW/,
			// Natural language patterns indicating agent is presenting work for review
			/ready to mark.*complete/i,
			/want me to mark.*complete/i,
			/shall I mark.*complete/i,
			/mark.*as complete\??/i,
			/should I.*complete.*task/i,
		]);
		const completingPos = findLastPos([
			// Triggered when user runs /jat:complete command
			/jat:complete is running/i,
			/✅\s*Marking task complete/i,
			/Committing changes/i,
		]);

		// Boolean flags for no-task state checking
		const hasCompletionMarker = /\[JAT:IDLE\]/.test(recentOutput) || /✅\s*TASK COMPLETE/.test(recentOutput);
		const hasReadyForReviewMarker = reviewPos >= 0;

		// Autopilot marker - can proceed automatically (future: trigger auto-spawn)
		const hasAutoProceedMarker = /\[JAT:AUTO_PROCEED\]/.test(recentOutput);

		// Determine state based on most recent marker
		// Priority when positions are equal: completed > review > needs-input > working
		if (task) {
			// Find which marker appeared most recently
			const positions = [
				{ state: 'needs-input' as const, pos: needsInputPos },
				{ state: 'working' as const, pos: workingPos },
				{ state: 'ready-for-review' as const, pos: reviewPos },
				{ state: 'completing' as const, pos: completingPos },
			].filter(p => p.pos >= 0);

			if (positions.length > 0) {
				// Sort by position descending (most recent first)
				positions.sort((a, b) => b.pos - a.pos);
				return positions[0].state;
			}

			// No markers found - check Beads task status
			// If task is in_progress in Beads, agent is working (handles resumed sessions after context compaction)
			// Otherwise, agent is still starting/initializing
			if (task.status === 'in_progress') {
				return 'working';
			}
			return 'starting';
		}

		// No active task - check if we just completed something
		if (lastCompletedTask) {
			// Show completed state if we have recent completion evidence
			if (hasCompletionMarker || hasReadyForReviewMarker) {
				return 'completed';
			}

			// If the lastCompletedTask was updated recently, still show completed state
			if (lastCompletedTask.closedAt) {
				const closedDate = new Date(lastCompletedTask.closedAt);
				const now = new Date();
				const hoursSinceClosed = (now.getTime() - closedDate.getTime()) / (1000 * 60 * 60);
				if (hoursSinceClosed < 2) {
					return 'completed';
				}
			}
		}

		return 'idle';
	});

	// Check if auto-proceed mode is active (for future autopilot feature)
	const isAutoProceed = $derived(output ? /\[JAT:AUTO_PROCEED\]/.test(output.slice(-3000)) : false);

	// Task to display - either active task or last completed task
	const displayTask = $derived(task || (sessionState === 'completed' ? lastCompletedTask : null));

	// Get visual config from centralized statusColors.ts
	const stateVisual = $derived(SESSION_STATE_VISUALS[sessionState] || SESSION_STATE_VISUALS.idle);

	// Send a workflow command (e.g., /jat:complete)
	async function sendWorkflowCommand(command: string) {
		if (!onSendInput) return;
		sendingInput = true;
		try {
			// Send the command text, then press enter to submit
			await onSendInput(command, 'text');
			await new Promise((r) => setTimeout(r, 50)); // Small delay between text and enter
			await onSendInput('enter', 'key');
		} finally {
			sendingInput = false;
		}
	}

	// Scroll to bottom when output changes (if auto-scroll enabled and user hasn't scrolled up)
	$effect(() => {
		if (autoScroll && !userScrolledUp && scrollContainerRef && output) {
			requestAnimationFrame(() => {
				if (scrollContainerRef) {
					scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
				}
			});
		}
	});

	// Handle kill session
	async function handleKill() {
		if (!onKillSession) return;
		killLoading = true;
		try {
			await onKillSession();
		} finally {
			killLoading = false;
		}
	}

	// Handle interrupt (Ctrl+C)
	async function handleInterrupt() {
		if (!onInterrupt) return;
		interruptLoading = true;
		try {
			await onInterrupt();
		} finally {
			interruptLoading = false;
		}
	}

	// Handle continue
	async function handleContinue() {
		if (!onContinue) return;
		continueLoading = true;
		try {
			await onContinue();
		} finally {
			continueLoading = false;
		}
	}

	// Toggle auto-scroll
	function toggleAutoScroll() {
		autoScroll = !autoScroll;
		if (autoScroll) {
			userScrolledUp = false; // Reset when user enables auto-scroll
		}
	}

	// Handle status badge actions
	async function handleStatusAction(actionId: string) {
		switch (actionId) {
			case 'cleanup':
				// Close tmux session and dismiss from UI
				await onKillSession?.();
				break;

			case 'view-task':
				// Open task details
				if (displayTask?.id) {
					onTaskClick?.(displayTask.id);
				}
				break;

			case 'attach':
				// Attach terminal
				onAttachTerminal?.();
				break;

			case 'complete':
				// Run /jat:complete command
				await sendWorkflowCommand('/jat:complete');
				break;

			case 'escape':
				// Send escape key
				await sendKey('escape');
				break;

			case 'interrupt':
				// Send Ctrl+C
				await sendKey('ctrl-c');
				break;

			case 'start':
				// Run /jat:start command
				await sendWorkflowCommand('/jat:start');
				break;

			case 'kill':
				// Kill tmux session
				await onKillSession?.();
				break;

			default:
				console.warn('Unknown status action:', actionId);
		}
	}

	// Send a key to the session
	async function sendKey(keyType: string) {
		if (!onSendInput) return;
		sendingInput = true;
		try {
			await onSendInput(keyType, 'key');
		} finally {
			sendingInput = false;
		}
	}

	// Send a sequence of keys (e.g., Down then Enter for option 2)
	async function sendKeySequence(keys: string[]) {
		if (!onSendInput) return;
		sendingInput = true;
		try {
			for (const key of keys) {
				await onSendInput(key, 'key');
				// Small delay between keys
				await new Promise(r => setTimeout(r, 50));
			}
		} finally {
			sendingInput = false;
		}
	}

	// Send option by number (1-indexed) - for numbered prompts
	function sendOptionNumber(num: number) {
		const opt = detectedOptions.find(o => o.number === num);
		if (opt) {
			sendKeySequence(opt.keySequence);
		}
	}

	// Select a question option by navigating and pressing enter/space
	// For single-select: navigates to the option and presses enter
	// For multi-select: navigates to the option and presses space to toggle
	async function selectQuestionOption(option: QuestionOption, isMultiSelect: boolean) {
		if (!onSendInput) return;
		sendingInput = true;
		try {
			// Find the currently selected option index
			const question = detectedQuestion;
			if (!question) return;

			const currentIndex = question.options.findIndex(o => o.isSelected);
			const targetIndex = option.index;

			// Calculate navigation from current position
			if (currentIndex >= 0 && currentIndex !== targetIndex) {
				const diff = targetIndex - currentIndex;
				const key = diff > 0 ? 'down' : 'up';
				const steps = Math.abs(diff);

				for (let i = 0; i < steps; i++) {
					await onSendInput(key, 'key');
					await new Promise(r => setTimeout(r, 30));
				}
			}

			// For multi-select, press space to toggle; for single-select, press enter
			await new Promise(r => setTimeout(r, 50));
			if (isMultiSelect) {
				await onSendInput('space', 'key');
			} else {
				await onSendInput('enter', 'key');
			}
		} finally {
			sendingInput = false;
		}
	}

	// Confirm multi-select choices (press Enter after selecting options)
	async function confirmMultiSelect() {
		if (!onSendInput) return;
		sendingInput = true;
		try {
			await onSendInput('enter', 'key');
		} finally {
			sendingInput = false;
		}
	}

	// Send text input (with attached images if any)
	async function sendTextInput() {
		if (!onSendInput) return;

		// Need either text or images to send
		const hasText = inputText.trim().length > 0;
		const hasImages = attachedImages.length > 0;
		if (!hasText && !hasImages) return;

		sendingInput = true;
		try {
			// Upload all attached images first and collect paths
			const imagePaths: string[] = [];
			for (const img of attachedImages) {
				const formData = new FormData();
				formData.append('image', img.blob, `pasted-image-${Date.now()}.png`);
				formData.append('sessionName', sessionName);

				const response = await fetch('/api/work/upload-image', {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					const { filePath } = await response.json();
					imagePaths.push(filePath);
				} else {
					console.error('Failed to upload image:', img.name);
				}
			}

			// Build the message: image paths first, then user text
			let message = '';
			if (imagePaths.length > 0) {
				message = imagePaths.join(' ');
				if (hasText) {
					message += ' ' + inputText.trim();
				}
			} else if (hasText) {
				message = inputText.trim();
			}

			if (message) {
				// If live streaming is enabled and we've already streamed the text,
				// just send Enter to submit (text is already in terminal)
				if (liveStreamEnabled && lastStreamedText === inputText.trim() && !hasImages) {
					// Text already in terminal, just submit
					await onSendInput('enter', 'key');
				} else {
					// Not streaming or text differs - send full text
					// Clear any partial streamed text first if streaming was on
					if (liveStreamEnabled && lastStreamedText) {
						await onSendInput('ctrl-u', 'key');
						await new Promise((r) => setTimeout(r, 20));
					}
					// Send text first (API adds Enter), then send explicit Enter after delay
					// Double Enter ensures Claude Code registers the submission
					await onSendInput(message, 'text');
					await new Promise((r) => setTimeout(r, 100));
					await onSendInput('enter', 'key');
				}
			}

			// Clear input and attached images on success
			inputText = '';
			lastStreamedText = ''; // Reset streamed text tracking
			// Reset textarea height after clearing
			setTimeout(autoResizeTextarea, 0);
			// Revoke object URLs to prevent memory leaks
			for (const img of attachedImages) {
				URL.revokeObjectURL(img.preview);
			}
			attachedImages = [];
		} finally {
			sendingInput = false;
		}
	}

	// Handle keyboard shortcuts in input
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			// Enter without Shift submits the input
			e.preventDefault();
			sendTextInput();
		} else if (e.key === 'Enter' && e.shiftKey) {
			// Shift+Enter inserts newline (default textarea behavior)
			// Let it happen naturally, then resize
			setTimeout(handleInputChange, 0);
		} else if (e.key === 'Tab' && liveStreamEnabled && onSendInput) {
			// When streaming, send Tab to terminal for autocomplete
			e.preventDefault();
			onSendInput('tab', 'key');
		} else if (e.key === 'Escape' || (e.key === 'c' && e.ctrlKey)) {
			// Clear input text on Escape or Ctrl+C (terminal behavior)
			e.preventDefault();
			inputText = '';
			// If streaming was active and we had text, clear terminal input too
			if (liveStreamEnabled && lastStreamedText && onSendInput) {
				onSendInput('ctrl-u', 'key');
			}
			lastStreamedText = ''; // Reset streamed text tracking
			// Reset textarea height
			setTimeout(autoResizeTextarea, 0);
		}
		// Note: Ctrl+V is handled by onpaste event, not here
	}

	// Handle native paste event - only intercept for images, let text paste normally
	function handlePaste(e: ClipboardEvent) {
		if (!onSendInput || !e.clipboardData) return;

		// Check if clipboard contains an image
		const items = e.clipboardData.items;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				// Intercept image paste
				e.preventDefault();
				const blob = item.getAsFile();
				if (blob) {
					attachImage(blob);
				}
				return;
			}
		}
		// For text, let the native paste happen (don't preventDefault)
	}

	// Attach an image (add to pending list, don't upload yet)
	async function attachImage(blob: Blob) {
		const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const name = `Image ${attachedImages.length + 1}`;

		// Create preview URL
		const preview = URL.createObjectURL(blob);

		attachedImages = [...attachedImages, { id, blob, preview, name }];
	}

	// Remove an attached image
	function removeAttachedImage(id: string) {
		const img = attachedImages.find(i => i.id === id);
		if (img) {
			URL.revokeObjectURL(img.preview);
		}
		attachedImages = attachedImages.filter(i => i.id !== id);
	}

	// Handle voice transcription - append text to input
	function handleVoiceTranscription(event: CustomEvent<string>) {
		const text = event.detail;
		if (text) {
			// Append to existing text with space separator if needed
			if (inputText.trim()) {
				inputText = inputText.trim() + ' ' + text;
			} else {
				inputText = text;
			}
		}
	}

	// Handle voice input error
	function handleVoiceError(event: CustomEvent<string>) {
		console.error('Voice input error:', event.detail);
		// Could show error toast here, but for now just log
	}

	// Manual paste button - reads clipboard and handles text or images
	async function handlePasteButton() {
		if (!onSendInput) return;

		try {
			const clipboardItems = await navigator.clipboard.read();

			for (const item of clipboardItems) {
				// Check for images first
				const imageType = item.types.find((t: string) => t.startsWith('image/'));
				if (imageType) {
					const blob = await item.getType(imageType);
					await attachImage(blob);
					return;
				}

				// Fall back to text
				if (item.types.includes('text/plain')) {
					const blob = await item.getType('text/plain');
					const text = await blob.text();
					if (text.trim()) {
						inputText = text;
					}
					return;
				}
			}
		} catch (err) {
			// Fallback: try simple text paste
			try {
				const text = await navigator.clipboard.readText();
				if (text.trim()) {
					inputText = text;
				}
			} catch (textErr) {
				console.error('Failed to read clipboard:', textErr);
			}
		}
	}

	// Upload image and send file path to session
	async function uploadAndSendImage(blob: Blob) {
		if (!onSendInput) return;
		sendingInput = true;

		try {
			// Upload to server
			const formData = new FormData();
			formData.append('image', blob, `pasted-image-${Date.now()}.png`);
			formData.append('sessionName', sessionName);

			const response = await fetch('/api/work/upload-image', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error('Failed to upload image');
			}

			const { filePath } = await response.json();

			// Send the file path to Claude Code
			await onSendInput(filePath, 'text');
			await new Promise((r) => setTimeout(r, 100));
			await onSendInput('enter', 'key');
		} catch (err) {
			console.error('Failed to upload image:', err);
		} finally {
			sendingInput = false;
		}
	}

	// Render output with ANSI codes
	const renderedOutput = $derived(ansiToHtml(output));
</script>

<div
	class="card h-full flex flex-col relative {className} {isHighlighted ? 'agent-highlight-flash ring-2 ring-info ring-offset-2 ring-offset-base-100' : ''}"
	style="
		background: linear-gradient(135deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.01 250) 50%, oklch(0.16 0.01 250) 100%);
		border: 1px solid {showCompletionBanner ? 'oklch(0.65 0.20 145)' : 'oklch(0.35 0.02 250)'};
		box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1);
	"
	data-agent-name={agentName}
	in:fly={{ x: 50, duration: 300, delay: 50 }}
	out:fade={{ duration: 200 }}
	onmouseenter={handleCardMouseEnter}
>
	<!-- Status accent bar - left edge (color reflects session state) -->
	<div
		class="absolute left-0 top-0 bottom-0 w-1"
		style="
			background: {sessionState === 'needs-input'
				? 'oklch(0.70 0.20 45)'   /* Orange for needs input - urgent attention */
				: sessionState === 'ready-for-review'
					? 'oklch(0.65 0.20 85)'  /* Yellow/amber for review */
					: sessionState === 'completing'
						? 'oklch(0.65 0.15 175)'  /* Teal for completing */
						: sessionState === 'completed' || showCompletionBanner
							? 'oklch(0.65 0.20 145)'  /* Green for completed */
							: sessionState === 'working'
								? 'oklch(0.60 0.18 250)'  /* Blue for working */
								: sessionState === 'starting'
									? 'oklch(0.70 0.15 200)'  /* Cyan for starting */
									: 'oklch(0.50 0.05 250)'  /* Gray for idle */
			};
			box-shadow: {sessionState === 'needs-input'
				? '0 0 12px oklch(0.70 0.20 45 / 0.6)'  /* Stronger glow for attention */
				: sessionState === 'ready-for-review'
					? '0 0 8px oklch(0.65 0.20 85 / 0.5)'
					: sessionState === 'completing'
						? '0 0 8px oklch(0.65 0.15 175 / 0.5)'  /* Teal glow for completing */
						: sessionState === 'completed' || showCompletionBanner
							? '0 0 8px oklch(0.65 0.20 145 / 0.5)'
							: sessionState === 'working'
								? '0 0 8px oklch(0.60 0.18 250 / 0.5)'
								: sessionState === 'starting'
									? '0 0 8px oklch(0.70 0.15 200 / 0.5)'  /* Cyan glow for starting */
									: 'none'
			};
		"
	></div>
	<!-- Completion Success Banner -->
	{#if showCompletionBanner}
		<div
			class="relative overflow-hidden flex-shrink-0"
			style="background: linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.38 0.15 160) 100%);"
			transition:fly={{ y: -20, duration: 300 }}
		>
			<!-- Subtle shimmer effect -->
			<div
				class="absolute inset-0 opacity-30"
				style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); animation: shimmer 2s infinite;"
			></div>

			<div class="relative px-4 py-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<!-- Success checkmark icon -->
						<div class="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
							<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<div>
							<h3 class="font-bold text-white text-lg">Task Complete!</h3>
							{#if task}
								<p class="text-white/80 text-sm truncate max-w-xs">{task.title}</p>
							{/if}
						</div>
					</div>

					<!-- Summary stats -->
					<div class="flex items-center gap-4 text-white/90 text-sm">
						{#if elapsedTime}
							<div class="flex items-center gap-1.5">
								<svg class="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span class="font-mono">{elapsedTime}</span>
							</div>
						{/if}
						{#if tokens > 0}
							<div class="flex items-center gap-1.5">
								<svg class="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
								</svg>
								<span class="font-mono">{formatTokens(tokens)}</span>
							</div>
						{/if}
						{#if cost > 0}
							<div class="flex items-center gap-1.5">
								<span class="font-mono font-semibold">${cost.toFixed(2)}</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Agent Tab - positioned at top-right, pulled up to top of container -->
	<!-- Combines: Agent Info + Status Dropdown into unified tab -->
	<div
		class="absolute right-3 top-0 -mt-9.5 z-10 flex items-center gap-0 rounded-lg rounded-bl-none rounded-br-none"
		style="background: oklch(0.20 0.02 250); border-left: 1px solid oklch(0.35 0.02 250); border-right: 1px solid oklch(0.35 0.02 250); border-top: 1px solid oklch(0.35 0.02 250);"
	>
		<!-- Agent Info Section -->
		<div class="flex items-center gap-1.5 pl-2 pr-1.5 py-1">
			<AgentAvatar
				name={agentName}
				size={18}
				class="shrink-0 {sessionState === 'starting'
					? 'ring-2 ring-secondary ring-offset-base-100 ring-offset-1'
					: sessionState === 'working'
						? 'ring-2 ring-info ring-offset-base-100 ring-offset-1'
						: sessionState === 'needs-input'
							? 'ring-2 ring-warning ring-offset-base-100 ring-offset-1'
							: sessionState === 'ready-for-review'
								? 'ring-2 ring-accent ring-offset-base-100 ring-offset-1'
								: sessionState === 'completed'
									? 'ring-2 ring-success ring-offset-base-100 ring-offset-1'
									: ''}"
			/>
			<div class="flex flex-col min-w-0">
				<div class="flex items-center gap-1">
					<span
						class="font-mono text-[11px] font-semibold tracking-wider uppercase"
						style="color: {stateVisual.accent}; text-shadow: 0 0 12px {stateVisual.glow};"
					>
						{agentName}
					</span>
					{#if sparklineData && sparklineData.length > 0}
						<div class="-mt-3 flex-shrink-0" style="width: 45px; height: 14px;">
							<Sparkline
								data={sparklineData}
								height={14}
								showTooltip={true}
								showStyleToolbar={false}
								defaultTimeRange="24h"
								animate={false}
							/>
						</div>
					{/if}
				</div>
				<div
					class="flex items-center gap-1 font-mono text-[9px]"
					style="color: oklch(0.55 0.03 250);"
				>
					{#if startTime}
						{@const elapsed = elapsedTimeFormatted()!}
						<span class="flex items-center gap-0.5" title="Session duration">
							{#if elapsed.showHours}
								<AnimatedDigits value={elapsed.hours} class="text-[9px]" />
								<span class="opacity-60">:</span>
							{/if}
							<AnimatedDigits value={elapsed.minutes} class="text-[9px]" />
							<span class="opacity-60">:</span>
							<AnimatedDigits value={elapsed.seconds} class="text-[9px]" />
						</span>
						<span class="opacity-40">·</span>
					{/if}
					<span style="color: oklch(0.60 0.05 250);">{formatTokens(tokens)}</span>
					<span class="opacity-40">·</span>
					<span style="color: oklch(0.65 0.10 145);">${cost.toFixed(2)}</span>
				</div>
			</div>
		</div>
		<!-- Status Dropdown Section (divider + badge) -->
		<div class="flex items-center">
			<!-- Shorter, neutral divider -->
			<div class="w-px h-4 mx-1.5" style="background: oklch(0.40 0.01 250);"></div>
			<StatusActionBadge
				{sessionState}
				{sessionName}
				onAction={handleStatusAction}
				disabled={sendingInput}
				alignRight={true}
				variant="integrated"
			/>
		</div>
	</div>

	<!-- Header: Full-width task content
		 Row 1: [id][title - full width]
		 Row 2: [description - full width]
	-->
	<div class="pl-3 pr-3 pt-2 pb-2 flex-shrink-0 flex-grow-0">
		{#if displayTask}
			<!-- Row 1: Task ID + Title (full width now that agent info is in tab) -->
			<div class="flex items-center gap-2 mb-1">
				<!-- Task ID -->
				<TaskIdBadge
					task={{ id: displayTask.id, status: displayTask.status || 'in_progress', issue_type: displayTask.issue_type, title: displayTask.title || displayTask.id }}
					size="sm"
					showType={false}
					showStatus={false}
					onOpenTask={onTaskClick}
				/>
				<!-- Task Title (click to edit) - now full width -->
				{#if editingTitle}
					<input
						bind:this={titleInputRef}
						bind:value={editedTitle}
						onblur={saveTitle}
						onkeydown={handleTitleKeydown}
						class="font-mono font-bold text-sm tracking-wide min-w-0 flex-1 bg-transparent border-b border-info outline-none"
						style="color: oklch(0.90 0.02 250);"
						disabled={savingTitle}
					/>
				{:else}
					<h3
						class="font-mono font-bold text-sm tracking-wide truncate min-w-0 flex-1 cursor-text hover:border-b hover:border-dashed hover:border-base-content/30"
						style="color: {sessionState === 'completed' ? 'oklch(0.75 0.02 250)' : 'oklch(0.90 0.02 250)'};"
						onclick={startEditingTitle}
						role="button"
						tabindex="0"
						title="Click to edit title"
					>
						{displayTask.title || displayTask.id}
					</h3>
				{/if}
			</div>

			<!-- Row 2: Description (full width, hover to expand) -->
			<button
				type="button"
				class="w-full text-left cursor-pointer"
				onclick={() => onTaskClick?.(displayTask.id)}
				onmouseenter={handleTaskMouseEnter}
				onmouseleave={handleTaskMouseLeave}
				title="Click to view task details"
			>
				<div
					class="overflow-hidden transition-all duration-300 ease-out"
					style="max-height: {taskHovered ? '50vh' : '2.6rem'};"
				>
					<p
						class="text-xs leading-relaxed"
						style="color: oklch(0.65 0.02 250);"
					>
						{displayTask.description || 'No description'}
					</p>
				</div>
			</button>
		{:else}
			<!-- Idle state - no task (agent info is in tab, so just show idle message) -->
			<div class="flex items-center gap-2 mb-1">
				<h3 class="font-mono font-bold text-sm tracking-wide" style="color: oklch(0.5 0 0 / 0.5);">
					Ready to start work
				</h3>
			</div>
		{/if}
	</div>

	<!-- Output Section -->
	<div class="flex-1 flex flex-col min-h-0" style="border-top: 1px solid oklch(0.5 0 0 / 0.08);">
		<!-- Output Content -->
		<div
			bind:this={scrollContainerRef}
			class="overflow-y-auto p-3 font-mono text-xs leading-relaxed flex-1 min-h-0"
			style="background: oklch(0.12 0.01 250);"
			onscroll={handleScroll}
		>
			{#if output}
				<pre class="whitespace-pre-wrap break-words m-0" style="color: oklch(0.85 0.05 145);">{@html renderedOutput}</pre>
			{:else}
				<p class="text-base-content/40 italic m-0">No output yet...</p>
			{/if}
		</div>

		<!-- Input Section -->
		<div class="px-3 py-2 flex-shrink-0" style="border-top: 1px solid oklch(0.5 0 0 / 0.08); background: oklch(0.18 0.01 250);">
			<!-- Attached Images Preview -->
			{#if attachedImages.length > 0}
				<div class="flex items-center gap-1.5 mb-2 flex-wrap">
					{#each attachedImages as img (img.id)}
						<div
							class="relative group flex items-center gap-1 px-1.5 py-0.5 rounded"
							style="background: oklch(0.28 0.08 200); border: 1px solid oklch(0.35 0.06 200);"
						>
							<!-- Thumbnail preview -->
							<img
								src={img.preview}
								alt={img.name}
								class="w-5 h-5 object-cover rounded"
							/>
							<!-- Image name -->
							<span class="font-mono text-[10px]" style="color: oklch(0.85 0.02 250);">
								[{img.name}]
							</span>
							<!-- Remove button -->
							<button
								onclick={() => removeAttachedImage(img.id)}
								class="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
								title="Remove image"
							>
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Smart Question UI: Show clickable options when AskUserQuestion is detected -->
			<!-- Prefer API-based question data (from hook) over terminal parsing -->
			{#if apiQuestionData?.active && apiQuestionData.questions?.length > 0}
				{@const currentQuestion = apiQuestionData.questions[0]}
				<div
					class="mb-2 p-2 rounded-lg"
					style="background: oklch(0.22 0.04 250); border: 1px solid oklch(0.40 0.10 200);"
				>
					<!-- Question header with API indicator -->
					<div class="flex items-center gap-2 mb-2">
						<span class="text-[10px] px-1.5 py-0.5 rounded font-mono" style="background: oklch(0.35 0.10 200); color: oklch(0.90 0.05 200);">
							❓
						</span>
						<span class="text-xs font-semibold" style="color: oklch(0.90 0.10 200);">
							{currentQuestion.question}
						</span>
					</div>

					<!-- Options as clickable buttons (API data) -->
					<div class="flex flex-wrap gap-1.5">
						{#each currentQuestion.options as opt, index (index)}
							<button
								onclick={async () => {
									// Navigate from current position to target index
									const delta = index - currentOptionIndex;
									const direction = delta > 0 ? 'down' : 'up';
									const steps = Math.abs(delta);

									for (let i = 0; i < steps; i++) {
										await onSendInput?.(direction, 'key');
										await new Promise(r => setTimeout(r, 30));
									}
									currentOptionIndex = index;

									await new Promise(r => setTimeout(r, 50));

									if (currentQuestion.multiSelect) {
										// Toggle selection with space
										await onSendInput?.('space', 'key');
										// Update local selection state using array for better reactivity
										const newSet = new Set(selectedOptionIndices);
										if (newSet.has(index)) {
											newSet.delete(index);
										} else {
											newSet.add(index);
										}
										selectedOptionIndices = newSet;
									} else {
										// Single select - just press enter
										await onSendInput?.('enter', 'key');
										clearQuestionData();
									}
								}}
								class="btn btn-xs gap-1 transition-all"
								class:btn-primary={selectedOptionIndices.has(index)}
								class:btn-outline={!selectedOptionIndices.has(index)}
								style={selectedOptionIndices.has(index)
									? 'background: oklch(0.45 0.15 250); border-color: oklch(0.55 0.18 250); color: oklch(0.98 0.01 250);'
									: 'background: oklch(0.25 0.03 250); border-color: oklch(0.40 0.03 250); color: oklch(0.80 0.02 250);'
								}
								title={opt.description}
								disabled={sendingInput || !onSendInput}
							>
								{#if currentQuestion.multiSelect}
									<span class="text-[10px]">
										{selectedOptionIndices.has(index) ? '☑' : '☐'}
									</span>
								{/if}
								{opt.label}
							</button>
						{/each}

						<!-- Confirm button for multi-select (API) -->
						{#if currentQuestion.multiSelect}
							<button
								onclick={async () => {
									// Navigate to Submit option
									// Claude Code UI has: [options...] + "Type something" + "Submit"
									// So Submit is at index = options.length + 1
									const submitIndex = currentQuestion.options.length + 1;
									const delta = submitIndex - currentOptionIndex;
									const direction = delta > 0 ? 'down' : 'up';
									const steps = Math.abs(delta);

									for (let i = 0; i < steps; i++) {
										await onSendInput?.(direction, 'key');
										await new Promise(r => setTimeout(r, 30));
									}

									await new Promise(r => setTimeout(r, 50));
									// First Enter: Select "Submit" in the options list
									await onSendInput?.('enter', 'key');

									// Wait for confirmation screen to appear
									await new Promise(r => setTimeout(r, 150));

									// Second Enter: Confirm "Submit answers" on the review screen
									await onSendInput?.('enter', 'key');

									clearQuestionData();
								}}
								class="btn btn-xs btn-success gap-1"
								title="Confirm selection (Enter)"
								disabled={sendingInput || !onSendInput}
							>
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								Done
							</button>
						{/if}
					</div>

					<!-- Hint text -->
					<div class="text-[10px] mt-1.5 opacity-50" style="color: oklch(0.65 0.02 250);">
						{#if currentQuestion.multiSelect}
							Click options to toggle, then Done to confirm
						{:else}
							Click an option to select
						{/if}
					</div>
				</div>
			{:else if detectedQuestion}
				<!-- Fallback to terminal-parsed question data -->
				<div
					class="mb-2 p-2 rounded-lg"
					style="background: oklch(0.22 0.04 250); border: 1px solid oklch(0.35 0.06 250);"
				>
					<!-- Question header -->
					{#if detectedQuestion.question}
						<div class="text-xs font-semibold mb-2" style="color: oklch(0.85 0.10 200);">
							{detectedQuestion.question}
						</div>
					{/if}

					<!-- Options as clickable buttons -->
					<div class="flex flex-wrap gap-1.5">
						{#each detectedQuestion.options as opt (opt.index)}
							<button
								onclick={() => selectQuestionOption(opt, detectedQuestion.isMultiSelect)}
								class="btn btn-xs gap-1 transition-all"
								class:btn-primary={opt.isSelected && !detectedQuestion.isMultiSelect}
								class:btn-outline={!opt.isSelected || detectedQuestion.isMultiSelect}
								style={opt.isSelected && detectedQuestion.isMultiSelect
									? 'background: oklch(0.35 0.12 250); border-color: oklch(0.50 0.15 250); color: oklch(0.95 0.02 250);'
									: !opt.isSelected
										? 'background: oklch(0.25 0.03 250); border-color: oklch(0.40 0.03 250); color: oklch(0.80 0.02 250);'
										: ''
								}
								title={opt.description || opt.label}
								disabled={sendingInput || !onSendInput}
							>
								<!-- Checkbox/radio indicator for multi-select -->
								{#if detectedQuestion.isMultiSelect}
									<span class="text-[10px] opacity-70">
										{opt.isSelected ? '☑' : '☐'}
									</span>
								{/if}
								{opt.label}
							</button>
						{/each}

						<!-- Confirm button for multi-select -->
						{#if detectedQuestion.isMultiSelect}
							<button
								onclick={confirmMultiSelect}
								class="btn btn-xs btn-success gap-1"
								title="Confirm selection (Enter)"
								disabled={sendingInput || !onSendInput}
							>
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								Done
							</button>
						{/if}
					</div>

					<!-- Hint text -->
					<div class="text-[10px] mt-1.5 opacity-50" style="color: oklch(0.65 0.02 250);">
						{#if detectedQuestion.isMultiSelect}
							Click options to toggle, then Done to confirm
						{:else}
							Click an option to select
						{/if}
					</div>
				</div>
			{/if}

			<!-- Text input: [autoscroll][stream][esc][^c] LEFT | input MIDDLE | [action buttons] RIGHT -->
			<div class="flex gap-1.5 items-end">
				<!-- LEFT: Control buttons (always visible) -->
				<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
					<!-- Auto-scroll toggle -->
					<button
						class="btn btn-xs"
						class:btn-primary={autoScroll}
						class:btn-ghost={!autoScroll}
						onclick={toggleAutoScroll}
						title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
					>
						<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
						</svg>
					</button>
					<!-- Live stream toggle -->
					<button
						class="btn btn-xs"
						class:btn-info={liveStreamEnabled}
						class:btn-ghost={!liveStreamEnabled}
						onclick={() => { liveStreamEnabled = !liveStreamEnabled; if (!liveStreamEnabled && lastStreamedText) { lastStreamedText = ''; } }}
						title={liveStreamEnabled ? 'Live streaming ON - Characters sent as you type' : 'Live streaming OFF - Send on Enter only'}
					>
						<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
						</svg>
					</button>
					<button
						onclick={() => sendKey('escape')}
						class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
						style="background: oklch(0.25 0.05 250); border: none; color: oklch(0.80 0.02 250);"
						title="Escape (cancel prompt)"
						disabled={sendingInput || !onSendInput}
					>
						Esc
					</button>
					<button
						onclick={() => sendKey('ctrl-c')}
						class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
						style="background: oklch(0.30 0.12 25); border: none; color: oklch(0.95 0.02 250);"
						title="Send Ctrl+C (interrupt)"
						disabled={sendingInput || !onSendInput}
					>
						^C
					</button>
				</div>

				<!-- MIDDLE: Text input (flexible width) with clear button and streaming indicator -->
				<div class="relative flex-1 min-w-0">
					<textarea
						bind:this={inputRef}
						bind:value={inputText}
						onkeydown={handleInputKeydown}
						onpaste={handlePaste}
						oninput={handleInputChange}
						placeholder={liveStreamEnabled ? "Type to stream live... (Enter to submit)" : "Type and press Enter..."}
						rows="1"
						class="textarea textarea-xs w-full font-mono pr-6 resize-none overflow-hidden leading-tight {liveStreamEnabled && inputText ? 'ring-1 ring-info/50' : ''}"
						style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250); min-height: 24px; max-height: 96px;"
						disabled={sendingInput || !onSendInput}
					></textarea>
					{#if inputText.trim()}
						<button
							type="button"
							class="absolute right-1.5 top-2 p-0.5 rounded-full transition-colors"
							style="color: oklch(0.55 0.02 250);"
							onmouseenter={(e) => e.currentTarget.style.color = 'oklch(0.75 0.02 250)'}
							onmouseleave={(e) => e.currentTarget.style.color = 'oklch(0.55 0.02 250)'}
							onclick={() => { inputText = ''; lastStreamedText = ''; setTimeout(handleInputChange, 0); }}
							aria-label="Clear input"
							disabled={sendingInput || !onSendInput}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="w-3 h-3"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}
					<!-- Streaming indicator dot -->
					{#if liveStreamEnabled && isStreaming}
						<div class="absolute left-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-info animate-pulse" title="Streaming to terminal"></div>
					{/if}
				</div>

				<!-- Voice input (local whisper) -->
				<div class="pb-0.5">
					<VoiceInput
						size="sm"
						ontranscription={handleVoiceTranscription}
						onerror={handleVoiceError}
						disabled={sendingInput || !onSendInput}
					/>
				</div>

				<!-- RIGHT: Action buttons (context-dependent) -->
				<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
					{#if inputText.trim() || attachedImages.length > 0}
						<!-- User is typing: show Send button -->
						<button
							onclick={sendTextInput}
							class="btn btn-xs btn-primary"
							disabled={sendingInput || !onSendInput}
						>
							{#if sendingInput}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								Send
							{/if}
						</button>
					{:else if sessionState === 'completed'}
						<!-- Completed state: actionable badge with cleanup/attach options -->
						<StatusActionBadge
							{sessionState}
							{sessionName}
							dropUp={true}
							alignRight={true}
							onAction={handleStatusAction}
							disabled={sendingInput || !onSendInput}
						/>
					{:else if sessionState === 'ready-for-review'}
						<!-- Ready for review: show Complete button -->
						<button
							onclick={() => sendWorkflowCommand('/jat:complete')}
							class="btn btn-xs gap-1"
							style="background: linear-gradient(135deg, oklch(0.50 0.18 145) 0%, oklch(0.42 0.15 160) 100%); border: none; color: white; font-weight: 600;"
							title="Mark task as complete"
							disabled={sendingInput || !onSendInput}
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							Complete
						</button>
					{:else if sessionState === 'idle'}
						<!-- Idle state: show Start button -->
						<button
							onclick={() => sendWorkflowCommand('/jat:start')}
							class="btn btn-xs gap-1"
							style="background: linear-gradient(135deg, oklch(0.50 0.18 250) 0%, oklch(0.42 0.15 265) 100%); border: none; color: white; font-weight: 600;"
							title="Start working on a task"
							disabled={sendingInput || !onSendInput}
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
							</svg>
							Start
						</button>
					{:else if detectedWorkflowCommands.length > 0}
						<!-- Workflow commands detected: show Done as primary action -->
						{@const hasComplete = detectedWorkflowCommands.some(c => c.command === '/jat:complete')}
						{#if hasComplete}
							<button
								onclick={() => sendWorkflowCommand('/jat:complete')}
								class="btn btn-xs gap-1"
								style="background: linear-gradient(135deg, oklch(0.45 0.18 145) 0%, oklch(0.38 0.15 160) 100%); border: none; color: white; font-weight: 600;"
								title="Complete this task"
								disabled={sendingInput || !onSendInput}
							>
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								Done
							</button>
						{/if}
					{:else if detectedOptions.length > 0}
						<!-- Prompt options detected: show quick action buttons -->
						{#each detectedOptions as opt (opt.number)}
							{#if opt.type === 'yes'}
								<button
									onclick={() => sendOptionNumber(opt.number)}
									class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
									style="background: oklch(0.30 0.12 150); border: none; color: oklch(0.95 0.02 250);"
									title={`Option ${opt.number}: ${opt.text}`}
									disabled={sendingInput || !onSendInput}
								>
									<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes
								</button>
							{:else if opt.type === 'yes-remember'}
								<button
									onclick={() => sendOptionNumber(opt.number)}
									class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
									style="background: oklch(0.28 0.10 200); border: none; color: oklch(0.95 0.02 250);"
									title={`Option ${opt.number}: ${opt.text}`}
									disabled={sendingInput || !onSendInput}
								>
									<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes+
								</button>
							{:else if opt.type === 'custom'}
								<button
									onclick={() => sendOptionNumber(opt.number)}
									class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
									style="background: oklch(0.25 0.08 280); border: none; color: oklch(0.85 0.02 250);"
									title={`Option ${opt.number}: ${opt.text}`}
									disabled={sendingInput || !onSendInput}
								>
									<span class="opacity-60 mr-0.5">{opt.number}.</span>Custom
								</button>
							{/if}
						{/each}
					{:else}
						<!-- No task: show Paste button -->
						<button
							onclick={handlePasteButton}
							class="btn btn-xs font-mono text-[10px] tracking-wider uppercase"
							style="background: oklch(0.28 0.08 200); border: none; color: oklch(0.90 0.02 250);"
							title="Paste from clipboard (text or image)"
							disabled={sendingInput || !onSendInput}
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
							</svg>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}
</style>
