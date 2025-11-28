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
	import { fade, fly } from 'svelte/transition';
	import { ansiToHtml } from '$lib/utils/ansiToHtml';
	import TokenUsageDisplay from '$lib/components/TokenUsageDisplay.svelte';
	import TaskIdBadge from '$lib/components/TaskIdBadge.svelte';
	import AgentAvatar from '$lib/components/AgentAvatar.svelte';
	import { playTaskCompleteSound } from '$lib/utils/soundEffects';

	// Props
	interface Task {
		id: string;
		title: string;
		status: string;
		priority?: number;
		issue_type?: string;
	}

	interface Props {
		sessionName: string;
		agentName: string;
		task?: Task | null;
		output?: string;
		lineCount?: number;
		tokens?: number;
		cost?: number;
		isComplete?: boolean; // Task completion state
		startTime?: Date | null; // When work started (for elapsed time)
		onKillSession?: () => void;
		onInterrupt?: () => void;
		onContinue?: () => void;
		onAttachTerminal?: () => void; // Open tmux session in terminal
		onTaskClick?: (taskId: string) => void;
		onSendInput?: (input: string, type: 'text' | 'key') => Promise<void>;
		onDismiss?: () => void; // Called when completion banner auto-dismisses
		class?: string;
		/** Whether this work card is currently highlighted (e.g., from clicking avatar elsewhere) */
		isHighlighted?: boolean;
	}

	let {
		sessionName,
		agentName,
		task = null,
		output = '',
		lineCount = 0,
		tokens = 0,
		cost = 0,
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

	// Cleanup timer on destroy
	onDestroy(() => {
		if (completionDismissTimer) {
			clearTimeout(completionDismissTimer);
		}
	});

	// Calculate elapsed time
	const elapsedTime = $derived((): string => {
		if (!startTime) return '';
		const elapsed = Date.now() - startTime.getTime();
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

	// Detected Claude Code prompt options
	interface PromptOption {
		number: number;
		text: string;
		type: 'yes' | 'yes-remember' | 'custom' | 'other';
		keySequence: string[]; // Keys to send (e.g., ['down', 'enter'])
	}

	// Detected JAT workflow commands (e.g., /jat:complete, /jat:next)
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
				if (actions.includes('next')) {
					commands.push({
						command: '/jat:next',
						label: 'Next',
						description: 'Complete and start next task',
						variant: 'primary'
					});
				}
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

		// Fallback: detect old-style patterns if no markers found
		if (commands.length === 0) {
			const hasNextStepsContext =
				/next\s*steps?:/i.test(recentOutput) && /\/jat:(complete|next)\b/.test(recentOutput);

			const hasResumedWork =
				/\[JAT:WORKING/.test(recentOutput) ||
				/Get to work!/i.test(recentOutput) ||
				/╔.*STARTING WORK/i.test(recentOutput);

			if (hasNextStepsContext && !hasResumedWork) {
				if (/\/jat:next\b/.test(recentOutput)) {
					commands.push({
						command: '/jat:next',
						label: 'Next',
						description: 'Complete and start next task',
						variant: 'primary'
					});
				}
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

	// Send option by number (1-indexed)
	function sendOptionNumber(num: number) {
		const opt = detectedOptions.find(o => o.number === num);
		if (opt) {
			sendKeySequence(opt.keySequence);
		}
	}

	// Send text input
	async function sendTextInput() {
		if (!inputText.trim() || !onSendInput) return;
		sendingInput = true;
		try {
			await onSendInput(inputText, 'text');
			inputText = '';
		} finally {
			sendingInput = false;
		}
	}

	// Handle keyboard shortcuts in input
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendTextInput();
		} else if (e.key === 'Escape' || (e.key === 'c' && e.ctrlKey)) {
			// Clear input text on Escape or Ctrl+C (terminal behavior)
			e.preventDefault();
			inputText = '';
		}
	}

	// Render output with ANSI codes
	const renderedOutput = $derived(ansiToHtml(output));
</script>

<div
	class="card overflow-hidden h-full flex flex-col relative {className} {isHighlighted ? 'agent-highlight-flash ring-2 ring-info ring-offset-2 ring-offset-base-100' : ''}"
	style="
		background: linear-gradient(135deg, oklch(0.22 0.02 250) 0%, oklch(0.18 0.01 250) 50%, oklch(0.16 0.01 250) 100%);
		border: 1px solid {showCompletionBanner ? 'oklch(0.65 0.20 145)' : 'oklch(0.5 0 0 / 0.15)'};
		box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05), 0 2px 8px oklch(0 0 0 / 0.1);
	"
	data-agent-name={agentName}
	in:fly={{ x: 50, duration: 300, delay: 50 }}
	out:fade={{ duration: 200 }}
>
	<!-- Status accent bar - left edge -->
	<div
		class="absolute left-0 top-0 bottom-0 w-1"
		style="
			background: {showCompletionBanner ? 'oklch(0.65 0.20 145)' : 'oklch(0.60 0.18 250)'};
			box-shadow: {showCompletionBanner ? '0 0 8px oklch(0.65 0.20 145 / 0.5)' : '0 0 8px oklch(0.60 0.18 250 / 0.5)'};
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

	<!-- Header: Task-first design -->
	<div class="pl-3 pr-3 pt-3 pb-2 flex-shrink-0 flex-grow-0">
		<!-- Task Title (Primary) -->
		{#if task}
			<div class="flex items-center gap-2 mb-1">
				<TaskIdBadge
					task={{ id: task.id, status: task.status, issue_type: task.issue_type, title: task.title }}
					size="sm"
					showType={true}
					showStatus={true}
					onOpenTask={onTaskClick}
				/>
				<span
					class="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded"
					style="background: oklch(0.5 0 0 / 0.1); color: oklch(0.70 0.10 50);"
				>
					P{task.priority ?? 2}
				</span>
			</div>
			<h3 class="font-mono font-bold text-sm tracking-wide truncate" style="color: oklch(0.90 0.02 250);" title={task.title}>
				{task.title}
			</h3>
		{:else}
			<h3 class="font-mono font-bold text-sm tracking-wide" style="color: oklch(0.5 0 0 / 0.5);">
				Idle session
			</h3>
		{/if}

		<!-- Agent Badge + Token Usage + Control Buttons -->
		<div class="flex items-center justify-between mt-2 pt-2" style="border-top: 1px solid oklch(0.5 0 0 / 0.08);">
			<!-- Agent Info -->
			<div class="flex items-center gap-2">
				<div class="avatar online">
					<div class="w-5 rounded-full ring-2 ring-info ring-offset-base-100 ring-offset-1">
						<AgentAvatar name={agentName} size={20} />
					</div>
				</div>
				<span class="font-mono text-[10px] tracking-wider" style="color: oklch(0.65 0.02 250);">{agentName}</span>
			</div>

			<!-- Token Usage + Control Buttons -->
			<div class="flex items-center gap-2">
				<TokenUsageDisplay
					{tokens}
					{cost}
					timeRange="today"
					variant="compact"
					showTokens={true}
					showCost={true}
					colorCoded={true}
				/>

				<!-- Control Buttons -->
				<div class="flex items-center gap-0.5">
					<!-- Auto-scroll toggle -->
					<button
						class="btn btn-xs"
						class:btn-primary={autoScroll}
						class:btn-ghost={!autoScroll}
						onclick={toggleAutoScroll}
						title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
					>
						<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
						</svg>
					</button>
					<!-- Attach Terminal -->
					<button
						class="btn btn-xs btn-ghost hover:btn-info"
						onclick={onAttachTerminal}
						disabled={!onAttachTerminal}
						title="Open in terminal"
					>
						<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
						</svg>
					</button>
					<!-- Kill Session -->
					<button
						class="btn btn-xs btn-ghost hover:btn-error"
						onclick={handleKill}
						disabled={killLoading || !onKillSession}
						title="Kill session"
					>
						{#if killLoading}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						{/if}
					</button>
				</div>
			</div>
		</div>
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
			<!-- Text input with dynamic button area -->
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={inputText}
					onkeydown={handleInputKeydown}
					placeholder="Type and press Enter... {lineCount} lines"
					class="input input-xs flex-1 font-mono"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250);"
					disabled={sendingInput || !onSendInput}
				/>
				<!-- Dynamic button area: quick actions when empty, Send when typing -->
				{#if inputText.trim()}
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
				{:else if !task}
					<!-- No task: show Start (unregistered) or Next (idle after completing work) -->
					{@const isIdle = output && /is now idle|work complete|task complete/i.test(output)}
					{#if isIdle}
						<button
							onclick={() => sendWorkflowCommand('/jat:next')}
							class="btn btn-xs gap-1"
							style="background: linear-gradient(135deg, oklch(0.50 0.18 250) 0%, oklch(0.42 0.15 265) 100%); border: none; color: white; font-weight: 600;"
							title="Pick up next task"
							disabled={sendingInput || !onSendInput}
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
							</svg>
							Next
						</button>
					{:else}
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
					{/if}
				{:else if detectedWorkflowCommands.length > 0}
					<!-- Workflow commands detected: show Next as primary action -->
					{@const hasNext = detectedWorkflowCommands.some(c => c.command === '/jat:next')}
					{@const hasComplete = detectedWorkflowCommands.some(c => c.command === '/jat:complete')}
					{#if hasNext}
						<button
							onclick={() => sendWorkflowCommand('/jat:next')}
							class="btn btn-xs gap-1"
							style="background: linear-gradient(135deg, oklch(0.50 0.18 250) 0%, oklch(0.42 0.15 265) 100%); border: none; color: white; font-weight: 600;"
							title="Pick up next task"
							disabled={sendingInput || !onSendInput}
						>
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
							</svg>
							Next
						</button>
					{:else if hasComplete}
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
					<div class="flex items-center gap-1">
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
									<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes+✓
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
				{:else}
					<!-- No specific actions: show Send button (disabled until user types) -->
					<button
						onclick={sendTextInput}
						class="btn btn-xs btn-ghost"
						disabled={!inputText.trim() || sendingInput || !onSendInput}
					>
						Send
					</button>
				{/if}
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
