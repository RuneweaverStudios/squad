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
		onTaskClick?: (taskId: string) => void;
		onSendInput?: (input: string, type: 'text' | 'key') => Promise<void>;
		onDismiss?: () => void; // Called when completion banner auto-dismisses
		class?: string;
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
		onTaskClick,
		onSendInput,
		onDismiss,
		class: className = ''
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
	let scrollContainerRef: HTMLDivElement | null = null;

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

	// Parse Claude Code prompt options from output
	const detectedOptions = $derived.by((): PromptOption[] => {
		if (!output) return [];

		const options: PromptOption[] = [];

		// Look for "Do you want to proceed?" or similar prompts
		// Match lines like "❯ 1. Yes" or "  2. Yes, and don't ask again..."
		const optionRegex = /^[❯\s]+(\d+)\.\s+(.+)$/gm;
		let match;

		while ((match = optionRegex.exec(output)) !== null) {
			const num = parseInt(match[1], 10);
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

	// Scroll to bottom when output changes (if auto-scroll enabled)
	$effect(() => {
		if (autoScroll && scrollContainerRef && output) {
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

	// Handle Enter key in input
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendTextInput();
		}
	}

	// Render output with ANSI codes
	const renderedOutput = $derived(ansiToHtml(output));
</script>

<div
	class="card bg-base-100 shadow-lg border overflow-hidden h-full flex flex-col {className}"
	class:border-base-300={!showCompletionBanner}
	class:border-success={showCompletionBanner}
	in:fly={{ x: 50, duration: 300, delay: 50 }}
	out:fade={{ duration: 200 }}
>
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
	<div class="card-body p-4 pb-2 flex-shrink-0">
		<!-- Task Title (Primary) -->
		<div class="flex items-start justify-between gap-3">
			<div class="flex-1 min-w-0">
				{#if task}
					<div class="flex items-center gap-2 mb-1">
						<TaskIdBadge
							task={{ id: task.id, status: task.status, issue_type: task.issue_type, title: task.title }}
							size="sm"
							showType={true}
							showStatus={true}
							onOpenTask={onTaskClick}
						/>
						<span class="badge badge-sm badge-outline" style="opacity: 0.7;">
							P{task.priority ?? 2}
						</span>
					</div>
					<h3 class="font-semibold text-base truncate" title={task.title}>
						{task.title}
					</h3>
				{:else}
					<div class="flex items-center gap-2">
						<span class="badge badge-sm badge-ghost">No task</span>
					</div>
					<h3 class="font-semibold text-base text-base-content/50">
						Idle session
					</h3>
				{/if}
			</div>

			<!-- Control Buttons -->
			<div class="flex items-center gap-1 shrink-0">
				<!-- Interrupt (Ctrl+C) -->
				<button
					class="btn btn-xs btn-ghost hover:btn-warning"
					onclick={handleInterrupt}
					disabled={interruptLoading || !onInterrupt}
					title="Send Ctrl+C (interrupt)"
				>
					{#if interruptLoading}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
						</svg>
					{/if}
				</button>

				<!-- Continue -->
				<button
					class="btn btn-xs btn-ghost hover:btn-success"
					onclick={handleContinue}
					disabled={continueLoading || !onContinue}
					title="Send 'continue'"
				>
					{#if continueLoading}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
						</svg>
					{/if}
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
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{/if}
				</button>
			</div>
		</div>

		<!-- Agent Badge + Token Usage (Secondary Metadata) -->
		<div class="flex items-center justify-between mt-2 pt-2 border-t border-base-200">
			<!-- Agent Info -->
			<div class="flex items-center gap-2">
				<AgentAvatar name={agentName} size={20} />
				<span class="text-sm font-mono text-base-content/70">{agentName}</span>
			</div>

			<!-- Token Usage -->
			<TokenUsageDisplay
				{tokens}
				{cost}
				timeRange="today"
				variant="compact"
				showTokens={true}
				showCost={true}
				colorCoded={true}
			/>
		</div>
	</div>

	<!-- Output Section -->
	<div class="border-t border-base-300 flex-1 flex flex-col min-h-0">
		<!-- Output Header -->
		<div class="flex items-center justify-between px-4 py-1.5 bg-base-200/50">
			<span class="text-xs font-mono text-base-content/60">
				Output ({lineCount} lines)
			</span>
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
		</div>

		<!-- Output Content -->
		<div
			bind:this={scrollContainerRef}
			class="overflow-y-auto p-3 font-mono text-xs leading-relaxed flex-1 min-h-0"
			style="background: oklch(0.14 0.01 250);"
		>
			{#if output}
				<pre class="whitespace-pre-wrap break-words" style="color: oklch(0.75 0.02 250);">{@html renderedOutput}</pre>
			{:else}
				<p class="text-base-content/40 italic">No output yet...</p>
			{/if}
		</div>

		<!-- Input Section -->
		<div class="border-t border-base-300 px-3 py-2 space-y-2" style="background: oklch(0.18 0.01 250);">
			<!-- Quick action buttons - only show when prompt detected -->
			{#if detectedOptions.length > 0}
				<div class="flex gap-1.5 flex-wrap">
					{#each detectedOptions as opt (opt.number)}
						{#if opt.type === 'yes'}
							<button
								onclick={() => sendOptionNumber(opt.number)}
								class="btn btn-xs"
								style="background: oklch(0.30 0.12 150); border: none; color: oklch(0.95 0.02 250);"
								title={`Option ${opt.number}: ${opt.text}`}
								disabled={sendingInput || !onSendInput}
							>
								<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes
							</button>
						{:else if opt.type === 'yes-remember'}
							<button
								onclick={() => sendOptionNumber(opt.number)}
								class="btn btn-xs"
								style="background: oklch(0.28 0.10 200); border: none; color: oklch(0.95 0.02 250);"
								title={`Option ${opt.number}: ${opt.text}`}
								disabled={sendingInput || !onSendInput}
							>
								<span class="opacity-60 mr-0.5">{opt.number}.</span>Yes+✓
							</button>
						{:else if opt.type === 'custom'}
							<button
								onclick={() => sendOptionNumber(opt.number)}
								class="btn btn-xs"
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
						class="btn btn-xs"
						style="background: oklch(0.25 0.05 250); border: none; color: oklch(0.80 0.02 250);"
						title="Escape (cancel prompt)"
						disabled={sendingInput || !onSendInput}
					>
						Esc
					</button>
					<button
						onclick={() => sendKey('ctrl-c')}
						class="btn btn-xs"
						style="background: oklch(0.30 0.12 25); border: none; color: oklch(0.95 0.02 250);"
						title="Send Ctrl+C (interrupt)"
						disabled={sendingInput || !onSendInput}
					>
						^C
					</button>
				</div>
			{/if}

			<!-- Text input -->
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={inputText}
					onkeydown={handleInputKeydown}
					placeholder="Type and press Enter..."
					class="input input-xs flex-1 font-mono"
					style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250);"
					disabled={sendingInput || !onSendInput}
				/>
				<button
					onclick={sendTextInput}
					class="btn btn-xs btn-primary"
					disabled={sendingInput || !inputText.trim() || !onSendInput}
				>
					{#if sendingInput}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						Send
					{/if}
				</button>
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
