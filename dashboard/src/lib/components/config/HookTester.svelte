<script lang="ts">
	/**
	 * HookTester Component
	 *
	 * Interactive component for testing Claude Code hooks against sample tool calls.
	 * Allows users to preview what data a hook would receive before saving.
	 *
	 * Features:
	 * - Select from sample tool call scenarios
	 * - Edit sample data JSON
	 * - Preview hook input (what gets sent to hook's stdin)
	 * - Test matcher regex patterns against tool names
	 * - Syntax highlighting for JSON
	 */

	import type { HookEntry, HookEventType, HookCommand, HooksConfig } from '$lib/types/config';

	interface Props {
		/** Full hooks configuration to test against */
		hooksConfig?: HooksConfig;
		/** Currently selected hook event type */
		selectedEventType?: HookEventType;
		/** Callback when event type changes */
		onEventTypeChange?: (eventType: HookEventType) => void;
	}

	let { hooksConfig = {}, selectedEventType = 'PostToolUse', onEventTypeChange }: Props = $props();

	// Track local event type, synced with prop
	let eventType = $state<HookEventType>(selectedEventType);

	// Derive entries from hooksConfig for the selected event type
	const entries = $derived(hooksConfig[eventType] || []);

	// Update local state when prop changes
	$effect(() => {
		eventType = selectedEventType;
	});

	// Update parent when event type changes
	function handleEventTypeChange(newType: HookEventType) {
		eventType = newType;
		onEventTypeChange?.(newType);
	}

	// Sample tool call scenarios
	interface ToolCallScenario {
		id: string;
		label: string;
		description: string;
		toolName: string;
		eventType: HookEventType;
		toolInput: Record<string, unknown>;
		toolResponse?: {
			stdout?: string;
			stderr?: string;
			exit_code?: number;
		};
	}

	const sampleScenarios: ToolCallScenario[] = [
		{
			id: 'bash-simple',
			label: 'Bash - Simple Command',
			description: 'Basic bash command execution',
			toolName: 'Bash',
			eventType: 'PostToolUse',
			toolInput: {
				command: 'ls -la',
				description: 'List files in current directory'
			},
			toolResponse: {
				stdout: 'total 48\ndrwxr-xr-x  12 user  staff  384 Dec 19 10:00 .\ndrwxr-xr-x   5 user  staff  160 Dec 15 09:00 ..',
				stderr: '',
				exit_code: 0
			}
		},
		{
			id: 'bash-jat-signal',
			label: 'Bash - jat-signal',
			description: 'JAT signal command for state tracking',
			toolName: 'Bash',
			eventType: 'PostToolUse',
			toolInput: {
				command: 'jat-signal working \'{"taskId":"jat-abc","taskTitle":"Add feature X"}\''
			},
			toolResponse: {
				stdout: 'Signal: working (task: jat-abc - Add feature X)\n[JAT-SIGNAL:working] {"taskId":"jat-abc","taskTitle":"Add feature X"}',
				stderr: '',
				exit_code: 0
			}
		},
		{
			id: 'bash-npm-error',
			label: 'Bash - npm Error',
			description: 'npm command with error output',
			toolName: 'Bash',
			eventType: 'PostToolUse',
			toolInput: {
				command: 'npm install some-broken-package'
			},
			toolResponse: {
				stdout: '',
				stderr: 'npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE unable to resolve dependency tree',
				exit_code: 1
			}
		},
		{
			id: 'ask-user-question',
			label: 'AskUserQuestion - Choice',
			description: 'Asking user to choose from options',
			toolName: 'AskUserQuestion',
			eventType: 'PreToolUse',
			toolInput: {
				questions: [
					{
						question: 'Which approach should we use for authentication?',
						header: 'Auth Method',
						multiSelect: false,
						options: [
							{ label: 'OAuth 2.0', description: 'Use OAuth 2.0 with Google/GitHub' },
							{ label: 'JWT', description: 'Use JWT tokens with custom auth' },
							{ label: 'Session-based', description: 'Traditional session cookies' }
						]
					}
				]
			}
		},
		{
			id: 'ask-user-multi',
			label: 'AskUserQuestion - Multi-select',
			description: 'Multi-select question for features',
			toolName: 'AskUserQuestion',
			eventType: 'PreToolUse',
			toolInput: {
				questions: [
					{
						question: 'Which features should we include?',
						header: 'Features',
						multiSelect: true,
						options: [
							{ label: 'Dark mode', description: 'Add theme switching' },
							{ label: 'Notifications', description: 'Push notifications support' },
							{ label: 'Analytics', description: 'Usage analytics tracking' }
						]
					}
				]
			}
		},
		{
			id: 'read-file',
			label: 'Read - File access',
			description: 'Reading a file from disk',
			toolName: 'Read',
			eventType: 'PreToolUse',
			toolInput: {
				file_path: '/home/jw/code/jat/dashboard/src/lib/components/config/HooksEditor.svelte',
				limit: 100
			}
		},
		{
			id: 'edit-file',
			label: 'Edit - File modification',
			description: 'Editing a file',
			toolName: 'Edit',
			eventType: 'PreToolUse',
			toolInput: {
				file_path: '/home/jw/code/jat/dashboard/src/app.css',
				old_string: 'color: red;',
				new_string: 'color: blue;'
			}
		},
		{
			id: 'write-file',
			label: 'Write - New file',
			description: 'Creating a new file',
			toolName: 'Write',
			eventType: 'PreToolUse',
			toolInput: {
				file_path: '/home/jw/code/jat/dashboard/src/lib/newFile.ts',
				content: 'export const hello = "world";'
			}
		},
		{
			id: 'session-start',
			label: 'Session Start',
			description: 'New Claude Code session starting',
			toolName: '',
			eventType: 'SessionStart',
			toolInput: {}
		},
		{
			id: 'user-prompt',
			label: 'User Prompt Submit',
			description: 'User submitting a message',
			toolName: '',
			eventType: 'UserPromptSubmit',
			toolInput: {
				prompt: 'Please help me fix the authentication bug in the login page.'
			}
		},
		{
			id: 'pre-compact',
			label: 'Pre Compact',
			description: 'Context about to be compacted',
			toolName: '',
			eventType: 'PreCompact',
			toolInput: {
				reason: 'context_limit',
				contextSizeBefore: 180000
			}
		}
	];

	// Selected scenario
	let selectedScenarioId = $state('bash-simple');
	let customJson = $state('');
	let jsonError = $state<string | null>(null);
	let showRawJson = $state(false);

	// Test matcher state
	let testPattern = $state('');

	// Get current scenario
	const currentScenario = $derived(
		sampleScenarios.find((s) => s.id === selectedScenarioId) || sampleScenarios[0]
	);

	// Handle scenario selection - auto-switch event type to match scenario
	function handleScenarioChange(scenarioId: string) {
		selectedScenarioId = scenarioId;
		const scenario = sampleScenarios.find((s) => s.id === scenarioId);
		if (scenario && scenario.eventType !== eventType) {
			handleEventTypeChange(scenario.eventType);
		}
	}

	// Build the hook input JSON (what gets sent to hook's stdin)
	const hookInputJson = $derived.by(() => {
		if (customJson.trim()) {
			try {
				return JSON.parse(customJson);
			} catch (e) {
				return null;
			}
		}

		const scenario = currentScenario;
		const input: Record<string, unknown> = {
			session_id: 'test-session-' + Math.random().toString(36).substr(2, 9),
			tool_name: scenario.toolName,
			tool_input: scenario.toolInput
		};

		// Add tool_response for PostToolUse
		if (scenario.eventType === 'PostToolUse' && scenario.toolResponse) {
			input.tool_response = scenario.toolResponse;
		}

		return input;
	});

	// Format JSON for display
	const formattedHookInput = $derived(
		hookInputJson ? JSON.stringify(hookInputJson, null, 2) : 'Invalid JSON'
	);

	// Validate custom JSON
	$effect(() => {
		if (customJson.trim()) {
			try {
				JSON.parse(customJson);
				jsonError = null;
			} catch (e) {
				jsonError = e instanceof Error ? e.message : 'Invalid JSON';
			}
		} else {
			jsonError = null;
		}
	});

	// Test which hook entries would match
	interface MatchResult {
		entry: HookEntry;
		entryIndex: number;
		matched: boolean;
		matchedText?: string;
		error?: string;
	}

	const matchResults = $derived.by(() => {
		const results: MatchResult[] = [];
		const toolName = hookInputJson?.tool_name || '';

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			try {
				const regex = new RegExp(entry.matcher);
				const match = toolName.match(regex);
				results.push({
					entry,
					entryIndex: i,
					matched: match !== null,
					matchedText: match ? match[0] : undefined
				});
			} catch (e) {
				results.push({
					entry,
					entryIndex: i,
					matched: false,
					error: e instanceof Error ? e.message : 'Invalid regex'
				});
			}
		}

		return results;
	});

	// Count matching entries
	const matchCount = $derived(matchResults.filter((r) => r.matched).length);

	// Test custom pattern against current tool name
	const testResult = $derived.by(() => {
		if (!testPattern.trim()) return null;
		const toolName = hookInputJson?.tool_name || '';
		try {
			const regex = new RegExp(testPattern);
			const match = toolName.match(regex);
			return { matched: match !== null, matchedText: match ? match[0] : undefined };
		} catch (e) {
			return { error: e instanceof Error ? e.message : 'Invalid regex' };
		}
	});

	// Load scenario into custom editor
	function loadScenarioToEditor() {
		customJson = formattedHookInput;
	}

	// Reset custom JSON
	function resetCustomJson() {
		customJson = '';
	}

	// Copy JSON to clipboard
	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(formattedHookInput);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}

	// Event type labels
	const eventTypeLabels: Record<HookEventType, string> = {
		PreToolUse: 'Pre Tool Use',
		PostToolUse: 'Post Tool Use',
		UserPromptSubmit: 'User Prompt Submit',
		PreCompact: 'Pre Compact',
		SessionStart: 'Session Start'
	};
</script>

<div class="bg-base-200 rounded-lg border border-base-300 overflow-hidden">
	<!-- Header -->
	<div
		class="px-4 py-3 flex items-center justify-between"
		style="background: oklch(0.22 0.01 250); border-bottom: 1px solid oklch(0.30 0.02 250);"
	>
		<div class="flex items-center gap-3">
			<svg
				class="w-5 h-5"
				style="color: oklch(0.70 0.15 145);"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
				/>
			</svg>
			<h3 class="font-mono text-sm font-semibold" style="color: oklch(0.85 0.02 250);">
				Hook Tester
			</h3>
			{#if entries.length > 0}
				<span
					class="px-2 py-0.5 rounded text-[10px] font-mono"
					style="background: {matchCount > 0
						? 'oklch(0.40 0.12 145)'
						: 'oklch(0.30 0.02 250)'}; color: {matchCount > 0
						? 'oklch(0.85 0.10 145)'
						: 'oklch(0.65 0.02 250)'};"
				>
					{matchCount} of {entries.length} hook{entries.length !== 1 ? 's' : ''} match
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<button
				class="px-2 py-1 rounded text-xs font-mono transition-colors hover:bg-base-300/50"
				style="color: oklch(0.65 0.02 250);"
				onclick={copyToClipboard}
				title="Copy JSON to clipboard"
			>
				Copy
			</button>
			<label class="flex items-center gap-1.5 cursor-pointer">
				<input
					type="checkbox"
					bind:checked={showRawJson}
					class="checkbox checkbox-xs"
					style="--chkbg: oklch(0.60 0.15 200);"
				/>
				<span class="font-mono text-[10px]" style="color: oklch(0.60 0.02 250);">Edit JSON</span>
			</label>
		</div>
	</div>

	<div class="flex flex-col lg:flex-row">
		<!-- Left Panel: Scenario Selection & Preview -->
		<div class="flex-1 p-4 border-b lg:border-b-0 lg:border-r border-base-300">
			<!-- Event Type Selector -->
			<div class="mb-4">
				<label
					for="event-type-select"
					class="block mb-1 font-mono text-xs"
					style="color: oklch(0.65 0.02 250);"
				>
					Hook Event Type
				</label>
				<select
					id="event-type-select"
					value={eventType}
					onchange={(e) => handleEventTypeChange(e.currentTarget.value as HookEventType)}
					class="w-full px-3 py-2 rounded-lg font-mono text-sm focus:outline-none focus:ring-2"
					style="
						background: oklch(0.15 0.01 250);
						color: oklch(0.85 0.02 250);
						border: 1px solid oklch(0.30 0.02 250);
						--tw-ring-color: oklch(0.50 0.12 200);
					"
				>
					<option value="PreToolUse">Pre Tool Use</option>
					<option value="PostToolUse">Post Tool Use</option>
					<option value="UserPromptSubmit">User Prompt Submit</option>
					<option value="PreCompact">Pre Compact</option>
					<option value="SessionStart">Session Start</option>
				</select>
				<p class="mt-1 text-[10px] font-mono" style="color: oklch(0.50 0.02 250);">
					{#if eventType === 'PreToolUse'}
						Runs BEFORE a tool executes. Use to intercept or modify tool calls.
					{:else if eventType === 'PostToolUse'}
						Runs AFTER a tool executes. Use to process results.
					{:else if eventType === 'UserPromptSubmit'}
						Runs when user submits a prompt. Matcher is ".*" for all.
					{:else if eventType === 'PreCompact'}
						Runs before context compaction. Matcher is ".*" for all.
					{:else if eventType === 'SessionStart'}
						Runs when a new session starts. Matcher is ".*" for all.
					{/if}
				</p>
			</div>

			<!-- Scenario Selector -->
			<div class="mb-4">
				<label
					for="scenario-select"
					class="block mb-1 font-mono text-xs"
					style="color: oklch(0.65 0.02 250);"
				>
					Select Scenario
				</label>
				<select
					id="scenario-select"
					value={selectedScenarioId}
					onchange={(e) => handleScenarioChange(e.currentTarget.value)}
					class="w-full px-3 py-2 rounded-lg font-mono text-sm focus:outline-none focus:ring-2"
					style="
						background: oklch(0.15 0.01 250);
						color: oklch(0.85 0.02 250);
						border: 1px solid oklch(0.30 0.02 250);
						--tw-ring-color: oklch(0.50 0.12 200);
					"
					disabled={showRawJson}
				>
					{#each sampleScenarios as scenario}
						<option value={scenario.id}>
							{scenario.label} ({eventTypeLabels[scenario.eventType]})
						</option>
					{/each}
				</select>
				<p class="mt-1 text-[10px] font-mono" style="color: oklch(0.50 0.02 250);">
					{currentScenario.description}
				</p>
			</div>

			<!-- JSON Preview / Editor -->
			<div class="mb-3">
				<div class="flex items-center justify-between mb-1">
					<label for="hook-input" class="font-mono text-xs" style="color: oklch(0.65 0.02 250);">
						Hook Input (stdin)
					</label>
					{#if showRawJson}
						<div class="flex gap-2">
							<button
								class="px-2 py-0.5 rounded text-[10px] font-mono hover:bg-base-300/50"
								style="color: oklch(0.60 0.02 250);"
								onclick={loadScenarioToEditor}
							>
								Load Scenario
							</button>
							<button
								class="px-2 py-0.5 rounded text-[10px] font-mono hover:bg-base-300/50"
								style="color: oklch(0.60 0.02 250);"
								onclick={resetCustomJson}
							>
								Reset
							</button>
						</div>
					{/if}
				</div>

				{#if showRawJson}
					<textarea
						id="hook-input"
						bind:value={customJson}
						class="w-full h-64 px-3 py-2 rounded-lg font-mono text-xs resize-none focus:outline-none focus:ring-2"
						style="
							background: oklch(0.15 0.01 250);
							color: oklch(0.85 0.02 250);
							border: 1px solid {jsonError ? 'oklch(0.60 0.15 25)' : 'oklch(0.30 0.02 250)'};
							--tw-ring-color: oklch(0.50 0.12 200);
						"
						placeholder="Enter custom hook input JSON..."
					></textarea>
					{#if jsonError}
						<p class="mt-1 text-[10px] font-mono" style="color: oklch(0.75 0.18 25);">
							⚠️ {jsonError}
						</p>
					{/if}
				{:else}
					<pre
						class="w-full h-64 px-3 py-2 rounded-lg font-mono text-xs overflow-auto whitespace-pre"
						style="
							background: oklch(0.12 0.01 250);
							color: oklch(0.75 0.02 250);
							border: 1px solid oklch(0.30 0.02 250);
						">{formattedHookInput}</pre>
				{/if}
			</div>

			<!-- Event Type Badge -->
			<div class="flex items-center gap-2 mt-3">
				<span class="text-[10px] font-mono" style="color: oklch(0.50 0.02 250);">Event Type:</span>
				<span
					class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
					style="background: oklch(0.35 0.10 200); color: oklch(0.85 0.08 200);"
				>
					{eventTypeLabels[currentScenario.eventType]}
				</span>
				{#if currentScenario.toolName}
					<span class="text-[10px] font-mono" style="color: oklch(0.50 0.02 250);">Tool:</span>
					<code
						class="px-1.5 py-0.5 rounded text-[10px] font-mono"
						style="background: oklch(0.25 0.02 250); color: oklch(0.70 0.02 250);"
					>
						{currentScenario.toolName}
					</code>
				{/if}
			</div>
		</div>

		<!-- Right Panel: Matcher Testing -->
		<div class="w-full lg:w-80 p-4">
			<h4 class="block mb-3 font-mono text-xs font-semibold" style="color: oklch(0.70 0.02 250);">
				Matcher Results
			</h4>

			{#if entries.length === 0}
				<div
					class="text-center py-8 rounded-lg"
					style="background: oklch(0.18 0.01 250); border: 1px dashed oklch(0.30 0.02 250);"
				>
					<svg
						class="w-8 h-8 mx-auto mb-2"
						style="color: oklch(0.40 0.02 250);"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
						/>
					</svg>
					<p class="font-mono text-sm" style="color: oklch(0.50 0.02 250);">No hooks configured</p>
					<p class="font-mono text-xs mt-1" style="color: oklch(0.40 0.02 250);">
						Add hooks to see matcher results
					</p>
				</div>
			{:else}
				<div class="space-y-2 max-h-[400px] overflow-y-auto">
					{#each matchResults as result}
						{@const color = result.matched
							? 'oklch(0.75 0.18 145)'
							: result.error
								? 'oklch(0.70 0.18 25)'
								: 'oklch(0.50 0.02 250)'}
						<div
							class="rounded-lg overflow-hidden"
							style="
								background: oklch(0.20 0.01 250);
								border: 1px solid {result.matched ? 'oklch(0.40 0.12 145)' : 'oklch(0.30 0.02 250)'};
							"
						>
							<div
								class="px-3 py-2 flex items-center justify-between"
								style="border-left: 3px solid {color};"
							>
								<div class="flex items-center gap-2 flex-1 min-w-0">
									<!-- Match indicator -->
									{#if result.matched}
										<svg
											class="w-4 h-4 flex-shrink-0"
											style="color: oklch(0.75 0.18 145);"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
									{:else if result.error}
										<svg
											class="w-4 h-4 flex-shrink-0"
											style="color: oklch(0.70 0.18 25);"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
											/>
										</svg>
									{:else}
										<svg
											class="w-4 h-4 flex-shrink-0"
											style="color: oklch(0.45 0.02 250);"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									{/if}

									<!-- Pattern -->
									<code
										class="px-1.5 py-0.5 rounded text-[10px] font-mono truncate"
										style="background: oklch(0.15 0.01 250); color: {color};"
										title={result.entry.matcher}
									>
										{result.entry.matcher}
									</code>
								</div>

								<!-- Hook count -->
								<span
									class="px-1.5 py-0.5 rounded text-[9px] font-mono"
									style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);"
								>
									{result.entry.hooks.length} hook{result.entry.hooks.length !== 1 ? 's' : ''}
								</span>
							</div>

							<!-- Match details -->
							{#if result.matched && result.matchedText}
								<div
									class="px-3 py-1.5"
									style="background: oklch(0.18 0.01 250); border-top: 1px solid oklch(0.25 0.02 250);"
								>
									<span class="text-[9px] font-mono" style="color: oklch(0.50 0.02 250);">
										Matched: "<span style="color: oklch(0.75 0.18 145);">{result.matchedText}</span>"
									</span>
								</div>
							{/if}

							<!-- Error details -->
							{#if result.error}
								<div
									class="px-3 py-1.5"
									style="background: oklch(0.18 0.01 250); border-top: 1px solid oklch(0.25 0.02 250);"
								>
									<span class="text-[9px] font-mono" style="color: oklch(0.70 0.18 25);">
										⚠️ {result.error}
									</span>
								</div>
							{/if}

							<!-- Hooks list -->
							{#if result.matched}
								<div
									class="px-3 py-1.5"
									style="background: oklch(0.16 0.01 250); border-top: 1px solid oklch(0.25 0.02 250);"
								>
									{#each result.entry.hooks as hook, i}
										<div class="text-[9px] font-mono" style="color: oklch(0.55 0.02 250);">
											<span style="color: oklch(0.45 0.02 250);">{i + 1}.</span>
											<code style="color: oklch(0.65 0.10 200);">{hook.command}</code>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Test Custom Matcher -->
			<div class="mt-4">
				<label
					for="test-matcher"
					class="block mb-2 font-mono text-xs font-semibold"
					style="color: oklch(0.60 0.02 250);"
				>
					Test Matcher Pattern
				</label>
				<input
					id="test-matcher"
					type="text"
					bind:value={testPattern}
					class="w-full px-3 py-1.5 rounded font-mono text-xs focus:outline-none focus:ring-2"
					style="
						background: oklch(0.15 0.01 250);
						color: oklch(0.85 0.02 250);
						border: 1px solid oklch(0.30 0.02 250);
						--tw-ring-color: oklch(0.50 0.15 280);
					"
					placeholder="^Bash$"
				/>
				{#if testResult}
					{#if testResult.error}
						<p class="mt-1 text-[10px] font-mono" style="color: oklch(0.70 0.18 25);">
							⚠️ Invalid regex: {testResult.error}
						</p>
					{:else if testResult.matched}
						<p class="mt-1 text-[10px] font-mono" style="color: oklch(0.75 0.18 145);">
							✓ Matches: "{testResult.matchedText}"
						</p>
					{:else}
						<p class="mt-1 text-[10px] font-mono" style="color: oklch(0.55 0.02 250);">
							No match against "{hookInputJson?.tool_name || ''}"
						</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
