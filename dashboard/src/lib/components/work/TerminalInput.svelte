<script lang="ts">
	/**
	 * TerminalInput Component
	 * Shared terminal input bar for SessionCard and TerminalDrawer.
	 *
	 * Features:
	 * - Text input with Enter to send, Shift+Enter for newline (when multiline enabled)
	 * - Quick action buttons: ^C, ^D, ^U, ESC, Tab
	 * - Keyboard shortcuts: Tab, Escape, Arrow keys, Delete/Backspace (when empty)
	 * - Visual flash feedback (escape-flash, tab-flash, arrow-flash, submit-flash)
	 * - Optional features: live streaming mode, Ctrl+C intercept, voice input
	 */

	import { browser } from '$app/environment';
	import VoiceInput from '$lib/components/VoiceInput.svelte';

	// Props
	let {
		sessionName = '',
		inputText = $bindable(''),
		onSendInput = async (_input: string, _type: 'text' | 'key') => {},
		disabled = false,
		placeholder = 'Type and press Enter...',
		// Optional features
		showVoiceInput = false,
		showStreamToggle = false,
		showArrowButtons = false,
		showFullKeyboardMenu = false,
		multiline = false,
		// Stream mode settings
		liveStreamEnabled = $bindable(false),
		ctrlCInterceptEnabled = $bindable(true),
		// Callbacks
		onStreamToggle = (_enabled: boolean) => {},
		onCtrlCToggle = (_enabled: boolean) => {},
		onVoiceTranscription = (_text: string) => {},
		onVoiceError = (_error: string) => {}
	}: {
		sessionName?: string;
		inputText?: string;
		onSendInput?: (input: string, type: 'text' | 'key') => Promise<void>;
		disabled?: boolean;
		placeholder?: string;
		showVoiceInput?: boolean;
		showStreamToggle?: boolean;
		showArrowButtons?: boolean;
		showFullKeyboardMenu?: boolean;
		multiline?: boolean;
		liveStreamEnabled?: boolean;
		ctrlCInterceptEnabled?: boolean;
		onStreamToggle?: (enabled: boolean) => void;
		onCtrlCToggle?: (enabled: boolean) => void;
		onVoiceTranscription?: (text: string) => void;
		onVoiceError?: (error: string) => void;
	} = $props();

	// Internal state
	let inputRef: HTMLTextAreaElement | HTMLInputElement | null = null;
	let sendingInput = $state(false);

	// Visual flash feedback states
	let escapeFlash = $state(false);
	let tabFlash = $state(false);
	let arrowFlash = $state(false);
	let submitFlash = $state(false);
	let copyFlash = $state(false);
	let voiceFlash = $state(false);

	// Flash helper
	function triggerFlash(flashSetter: (v: boolean) => void) {
		flashSetter(true);
		setTimeout(() => flashSetter(false), 300);
	}

	// Send a key to the session
	async function sendKey(keyType: string) {
		if (disabled) return;
		sendingInput = true;
		try {
			await onSendInput(keyType, 'key');
		} finally {
			sendingInput = false;
			// Refocus input after sending key
			requestAnimationFrame(() => inputRef?.focus());
		}
	}

	// Send text input
	async function sendTextInput() {
		if (disabled || !inputText.trim()) return;
		sendingInput = true;
		try {
			// When live streaming, clear line first to prevent stale state
			if (liveStreamEnabled) {
				await onSendInput('ctrl-u', 'key');
				await new Promise((r) => setTimeout(r, 30));
			}
			await onSendInput(inputText.trim(), 'text');
			inputText = '';
			triggerFlash((v) => (submitFlash = v));
			// Reset textarea height
			setTimeout(autoResizeTextarea, 0);
		} finally {
			sendingInput = false;
			requestAnimationFrame(() => inputRef?.focus());
		}
	}

	// Handle keyboard input
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (!inputText.trim()) {
				// Empty input: send Enter to tmux (for prompts)
				sendKey('enter');
				triggerFlash((v) => (submitFlash = v));
			} else {
				sendTextInput();
			}
		} else if (e.key === 'Enter' && e.shiftKey && multiline) {
			// Shift+Enter inserts newline (let default happen)
			setTimeout(autoResizeTextarea, 0);
		} else if (e.key === 'Tab' && liveStreamEnabled) {
			e.preventDefault();
			sendKey('tab');
			triggerFlash((v) => (tabFlash = v));
		} else if (e.key === 'Escape') {
			e.preventDefault();
			inputText = '';
			sendKey('escape');
			setTimeout(() => sendKey('escape'), 50);
			setTimeout(autoResizeTextarea, 0);
			triggerFlash((v) => (escapeFlash = v));
		} else if (e.key === 'c' && e.ctrlKey && ctrlCInterceptEnabled) {
			e.preventDefault();
			inputText = '';
			setTimeout(autoResizeTextarea, 0);
			sendKey('ctrl-c');
			triggerFlash((v) => (escapeFlash = v));
		} else if (e.key === 'c' && e.ctrlKey && !ctrlCInterceptEnabled) {
			// Copy: trigger green flash (browser handles actual copy)
			triggerFlash((v) => (copyFlash = v));
		} else if (
			['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
			!inputText.trim()
		) {
			e.preventDefault();
			const keyMap: Record<string, string> = {
				ArrowUp: 'up',
				ArrowDown: 'down',
				ArrowLeft: 'left',
				ArrowRight: 'right'
			};
			sendKey(keyMap[e.key]);
			triggerFlash((v) => (arrowFlash = v));
		} else if ((e.key === 'Delete' || e.key === 'Backspace') && !inputText.trim()) {
			e.preventDefault();
			sendKey(e.key === 'Delete' ? 'delete' : 'backspace');
		}
	}

	// Auto-resize textarea
	function autoResizeTextarea() {
		if (!inputRef || !multiline) return;
		const textarea = inputRef as HTMLTextAreaElement;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 96) + 'px';
	}

	// Handle voice transcription
	function handleVoiceTranscription(text: string) {
		inputText = inputText ? inputText + ' ' + text : text;
		onVoiceTranscription(text);
		triggerFlash((v) => (voiceFlash = v));
	}

	// Focus the input
	export function focus() {
		inputRef?.focus();
	}

	// Expose inputRef for parent access
	export function getInputRef() {
		return inputRef;
	}
</script>

<div
	class="flex items-end gap-1.5 px-3 py-2"
	style="background: oklch(0.18 0.01 250); border-top: 1px solid oklch(0.30 0.02 250);"
>
	<!-- LEFT: Quick action buttons -->
	<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
		<button
			onclick={() => sendKey('ctrl-c')}
			class="btn btn-xs"
			style="background: oklch(0.30 0.12 25); border: none; color: oklch(0.95 0.02 250);"
			title="Send Ctrl+C (interrupt)"
			disabled={sendingInput || disabled}
		>
			^C
		</button>
		<button
			onclick={() => sendKey('ctrl-d')}
			class="btn btn-xs"
			style="background: oklch(0.25 0.08 200); border: none; color: oklch(0.85 0.02 250);"
			title="Send Ctrl+D (EOF)"
			disabled={sendingInput || disabled}
		>
			^D
		</button>
		<button
			onclick={() => sendKey('ctrl-u')}
			class="btn btn-xs"
			style="background: oklch(0.25 0.05 250); border: none; color: oklch(0.80 0.02 250);"
			title="Send Ctrl+U (clear line)"
			disabled={sendingInput || disabled}
		>
			^U
		</button>
		<button
			onclick={() => {
				sendKey('escape');
				setTimeout(() => sendKey('escape'), 50);
			}}
			class="btn btn-xs"
			style="background: oklch(0.30 0.10 300); border: none; color: oklch(0.85 0.02 250);"
			title="Send 2x Escape (cancel/clear)"
			disabled={sendingInput || disabled}
		>
			ESC
		</button>
		<button
			onclick={() => sendKey('tab')}
			class="btn btn-xs"
			style="background: oklch(0.25 0.05 250); border: none; color: oklch(0.80 0.02 250);"
			title="Send Tab (autocomplete)"
			disabled={sendingInput || disabled}
		>
			Tab
		</button>

		{#if showArrowButtons}
			<div class="flex gap-0.5 ml-1">
				<button
					onclick={() => sendKey('up')}
					class="btn btn-xs btn-ghost font-mono text-[10px] px-1"
					disabled={sendingInput || disabled}
					title="Up Arrow">↑</button
				>
				<button
					onclick={() => sendKey('down')}
					class="btn btn-xs btn-ghost font-mono text-[10px] px-1"
					disabled={sendingInput || disabled}
					title="Down Arrow">↓</button
				>
				<button
					onclick={() => sendKey('left')}
					class="btn btn-xs btn-ghost font-mono text-[10px] px-1"
					disabled={sendingInput || disabled}
					title="Left Arrow">←</button
				>
				<button
					onclick={() => sendKey('right')}
					class="btn btn-xs btn-ghost font-mono text-[10px] px-1"
					disabled={sendingInput || disabled}
					title="Right Arrow">→</button
				>
			</div>
		{/if}

		{#if showStreamToggle}
			<!-- Live stream toggle -->
			<button
				onclick={() => {
					liveStreamEnabled = !liveStreamEnabled;
					onStreamToggle(liveStreamEnabled);
				}}
				class="btn btn-xs"
				class:btn-info={liveStreamEnabled}
				class:btn-ghost={!liveStreamEnabled}
				title={liveStreamEnabled ? 'Live streaming ON' : 'Live streaming OFF'}
				disabled={sendingInput || disabled}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="w-3 h-3"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
					/>
				</svg>
			</button>
		{/if}

		{#if showFullKeyboardMenu}
			<!-- Keyboard keys dropdown -->
			<div class="dropdown dropdown-hover dropdown-top">
				<button
					tabindex="0"
					class="btn btn-xs btn-ghost font-mono text-[10px]"
					title="Keyboard shortcuts (hover for menu)"
					disabled={sendingInput || disabled}
				>
					<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-15A2.25 2.25 0 012.25 17.25V6.75zM6 9.75h.008v.008H6V9.75zm0 3h.008v.008H6v-.008zm0 3h.008v.008H6v-.008zm3-6h.008v.008H9V9.75zm0 3h.008v.008H9v-.008zm3-3h.008v.008H12V9.75zm0 3h.008v.008H12v-.008zm3-3h.008v.008H15V9.75zm0 3h.008v.008H15v-.008zm3-3h.008v.008H18V9.75zm0 3h.008v.008H18v-.008zM9 15.75h6"
						/>
					</svg>
				</button>
				<ul
					tabindex="0"
					class="dropdown-content z-[100] menu menu-xs p-1 shadow-lg bg-base-200 rounded-box w-auto min-w-[100px]"
				>
					<li class="menu-title px-2 py-0.5 text-[9px] opacity-60">Arrows</li>
					<li>
						<div class="flex gap-0.5 p-0.5">
							<button
								onclick={() => sendKey('up')}
								class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
								disabled={sendingInput || disabled}>↑</button
							>
							<button
								onclick={() => sendKey('down')}
								class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
								disabled={sendingInput || disabled}>↓</button
							>
							<button
								onclick={() => sendKey('left')}
								class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
								disabled={sendingInput || disabled}>←</button
							>
							<button
								onclick={() => sendKey('right')}
								class="btn btn-xs btn-ghost font-mono text-[10px] px-1.5"
								disabled={sendingInput || disabled}>→</button
							>
						</div>
					</li>
					<li>
						<button
							onclick={() => sendKey('ctrl-l')}
							class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap"
							disabled={sendingInput || disabled}
						>
							^L Clear
						</button>
					</li>
					<li>
						<button
							onclick={() => sendKey('tab')}
							class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap"
							disabled={sendingInput || disabled}
						>
							Tab ⇥
						</button>
					</li>
					<li>
						<button
							onclick={() => sendKey('enter')}
							class="font-mono text-[10px] tracking-wider whitespace-nowrap"
							disabled={sendingInput || disabled}
						>
							Enter ⤶
						</button>
					</li>
					<li>
						<button
							onclick={() => sendKey('escape')}
							class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap"
							disabled={sendingInput || disabled}
						>
							ESC
						</button>
					</li>
					<li>
						<button
							onclick={() => sendKey('ctrl-c')}
							oncontextmenu={(e) => {
								e.preventDefault();
								ctrlCInterceptEnabled = !ctrlCInterceptEnabled;
								onCtrlCToggle(ctrlCInterceptEnabled);
							}}
							class="font-mono text-[10px] tracking-wider uppercase whitespace-nowrap {!ctrlCInterceptEnabled
								? 'opacity-50 line-through'
								: ''}"
							title={ctrlCInterceptEnabled
								? 'Send Ctrl+C — Right-click to allow copy'
								: 'Ctrl+C copies — Right-click to enable interrupt'}
							disabled={sendingInput || disabled}
						>
							^C
						</button>
					</li>
				</ul>
			</div>
		{/if}
	</div>

	<!-- MIDDLE: Text input -->
	<div class="relative flex-1 min-w-0">
		{#if multiline}
			<textarea
				bind:this={inputRef}
				bind:value={inputText}
				onkeydown={handleKeydown}
				oninput={autoResizeTextarea}
				{placeholder}
				rows="1"
				class="textarea textarea-xs w-full font-mono pr-6 resize-none overflow-hidden leading-tight
					{liveStreamEnabled && inputText ? 'ring-1 ring-info/50' : ''}
					{escapeFlash ? 'escape-flash' : ''}
					{tabFlash ? 'tab-flash' : ''}
					{arrowFlash ? 'arrow-flash' : ''}
					{submitFlash ? 'submit-flash' : ''}
					{copyFlash ? 'copy-flash' : ''}
					{voiceFlash ? 'voice-flash' : ''}"
				style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250); min-height: 24px; max-height: 96px;"
				disabled={sendingInput || disabled}
				data-session-input="true"
			></textarea>
		{:else}
			<input
				type="text"
				bind:this={inputRef}
				bind:value={inputText}
				onkeydown={handleKeydown}
				{placeholder}
				class="input input-xs w-full font-mono
					{escapeFlash ? 'escape-flash' : ''}
					{tabFlash ? 'tab-flash' : ''}
					{arrowFlash ? 'arrow-flash' : ''}
					{submitFlash ? 'submit-flash' : ''}"
				style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250); color: oklch(0.80 0.02 250);"
				disabled={sendingInput || disabled}
			/>
		{/if}

		<!-- Clear button -->
		{#if inputText.trim()}
			<button
				type="button"
				class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors"
				style="color: oklch(0.55 0.02 250);"
				onmouseenter={(e) => (e.currentTarget.style.color = 'oklch(0.75 0.02 250)')}
				onmouseleave={(e) => (e.currentTarget.style.color = 'oklch(0.55 0.02 250)')}
				onclick={() => {
					inputText = '';
					setTimeout(autoResizeTextarea, 0);
					triggerFlash((v) => (escapeFlash = v));
				}}
				aria-label="Clear input"
				disabled={sendingInput || disabled}
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

		<!-- Streaming indicator -->
		{#if liveStreamEnabled && inputText}
			<div
				class="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-info animate-pulse"
				title="Streaming to terminal"
			></div>
		{/if}
	</div>

	<!-- Voice input -->
	{#if showVoiceInput}
		<div class="pb-0.5">
			<VoiceInput
				size="sm"
				ontranscription={handleVoiceTranscription}
				onerror={onVoiceError}
				onstart={() => triggerFlash((v) => (voiceFlash = v))}
				onend={() => triggerFlash((v) => (voiceFlash = v))}
				disabled={sendingInput || disabled}
			/>
		</div>
	{/if}

	<!-- RIGHT: Send button -->
	<div class="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
		<button
			onclick={sendTextInput}
			class="btn btn-xs btn-primary"
			disabled={sendingInput || disabled || !inputText.trim()}
		>
			{#if sendingInput}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				Send
			{/if}
		</button>
	</div>
</div>
