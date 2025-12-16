<script lang="ts">
	/**
	 * PatternTester
	 *
	 * Interactive component for testing automation pattern matching rules.
	 * Provides a textarea for sample terminal output, shows which rules would match,
	 * highlights matched text, and displays what action would be triggered.
	 *
	 * Features:
	 * - Textarea for sample terminal output
	 * - Live pattern matching with regex/string support
	 * - Text highlighting for matched patterns
	 * - Action preview showing what would trigger
	 * - Match count and position details
	 * - Sample rules for testing (standalone mode)
	 * - Custom rule input for quick testing
	 */

	// Types for automation rules (matches planned jat-48b4 types)
	interface AutomationAction {
		type: 'send_text' | 'send_keys' | 'tmux_command' | 'signal' | 'notify_only';
		value: string;
		description?: string;
	}

	interface AutomationRule {
		id: string;
		name: string;
		enabled: boolean;
		pattern: string;
		isRegex: boolean;
		caseSensitive: boolean;
		action: AutomationAction;
		cooldownMs?: number;
		priority?: number;
	}

	interface RuleMatch {
		rule: AutomationRule;
		matches: Array<{
			text: string;
			start: number;
			end: number;
			line: number;
			column: number;
		}>;
	}

	// Props - can receive rules from parent or use built-in samples
	let {
		rules = $bindable<AutomationRule[]>([]),
		onRuleTest
	}: {
		rules?: AutomationRule[];
		onRuleTest?: (rule: AutomationRule, matches: RuleMatch['matches']) => void;
	} = $props();

	// Sample terminal output for testing
	let sampleOutput = $state(`[2024-12-11 15:42:33] npm ERR! code ERESOLVE
[2024-12-11 15:42:33] npm ERR! ERESOLVE unable to resolve dependency tree
[2024-12-11 15:42:35] Error: ECONNREFUSED - Connection refused
[2024-12-11 15:42:40] ✓ Build completed successfully
[2024-12-11 15:42:45]
⎿ Do you want to proceed with the deployment? (yes/no)

[2024-12-11 15:42:50] Waiting for user input...
[2024-12-11 15:43:00] API Error: 429 Too Many Requests
[2024-12-11 15:43:05] Rate limit exceeded. Retry after 60 seconds.
[2024-12-11 15:43:30] TypeScript Error: Property 'foo' does not exist on type 'Bar'
[2024-12-11 15:43:35] Test failed: expected 42 but got undefined`);

	// Custom pattern for quick testing
	let customPattern = $state('');
	let customIsRegex = $state(false);  // Default to literal mode - more intuitive for users
	let customCaseSensitive = $state(false);
	let customRegexError = $state<string | null>(null);

	// Escape special regex characters for literal matching
	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Sample rules for standalone testing (when no rules prop provided)
	const sampleRules: AutomationRule[] = [
		{
			id: 'npm-error',
			name: 'NPM Error Detection',
			enabled: true,
			pattern: 'npm ERR!',
			isRegex: false,
			caseSensitive: true,
			action: { type: 'notify_only', value: 'NPM error detected', description: 'Alert on npm errors' }
		},
		{
			id: 'connection-refused',
			name: 'Connection Refused',
			enabled: true,
			pattern: 'ECONNREFUSED|Connection refused',
			isRegex: true,
			caseSensitive: false,
			action: { type: 'signal', value: 'connection_error', description: 'Signal connection failure' }
		},
		{
			id: 'prompt-detection',
			name: 'User Prompt Detection',
			enabled: true,
			pattern: '⎿.*\\?',
			isRegex: true,
			caseSensitive: false,
			action: { type: 'notify_only', value: 'User prompt detected', description: 'Notify on prompts' }
		},
		{
			id: 'rate-limit',
			name: 'Rate Limit Detection',
			enabled: true,
			pattern: '429|Rate limit|Too Many Requests',
			isRegex: true,
			caseSensitive: false,
			action: { type: 'signal', value: 'rate_limited', description: 'Signal rate limiting' }
		},
		{
			id: 'typescript-error',
			name: 'TypeScript Error',
			enabled: true,
			pattern: 'TypeScript Error:.*',
			isRegex: true,
			caseSensitive: true,
			action: { type: 'notify_only', value: 'TypeScript error', description: 'Alert on TS errors' }
		},
		{
			id: 'test-failure',
			name: 'Test Failure',
			enabled: true,
			pattern: 'Test failed:|FAIL|AssertionError',
			isRegex: true,
			caseSensitive: false,
			action: { type: 'notify_only', value: 'Test failure detected', description: 'Alert on test failures' }
		}
	];

	// Use provided rules or sample rules
	const activeRules = $derived(rules.length > 0 ? rules : sampleRules);

	// Pattern matching function - returns matches and optional error
	function findMatches(text: string, pattern: string, isRegex: boolean, caseSensitive: boolean): { matches: RuleMatch['matches']; error?: string } {
		const matches: RuleMatch['matches'] = [];

		try {
			if (isRegex) {
				const flags = caseSensitive ? 'g' : 'gi';
				const regex = new RegExp(pattern, flags);
				let match;
				while ((match = regex.exec(text)) !== null) {
					const linesBefore = text.substring(0, match.index).split('\n');
					const line = linesBefore.length;
					const column = match.index - (linesBefore.slice(0, -1).join('\n').length + (line > 1 ? 1 : 0));

					matches.push({
						text: match[0],
						start: match.index,
						end: match.index + match[0].length,
						line,
						column
					});
				}
			} else {
				// String matching (literal mode)
				const searchText = caseSensitive ? text : text.toLowerCase();
				const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
				let pos = 0;
				while ((pos = searchText.indexOf(searchPattern, pos)) !== -1) {
					const linesBefore = text.substring(0, pos).split('\n');
					const line = linesBefore.length;
					const column = pos - (linesBefore.slice(0, -1).join('\n').length + (line > 1 ? 1 : 0));

					matches.push({
						text: text.substring(pos, pos + pattern.length),
						start: pos,
						end: pos + pattern.length,
						line,
						column
					});
					pos += pattern.length;
				}
			}
		} catch (e: any) {
			// Invalid regex - return error message
			return { matches: [], error: e.message || 'Invalid regex pattern' };
		}

		return { matches };
	}

	// Compute all rule matches
	const ruleMatches = $derived.by(() => {
		const results: RuleMatch[] = [];

		for (const rule of activeRules) {
			if (!rule.enabled) continue;

			const result = findMatches(sampleOutput, rule.pattern, rule.isRegex, rule.caseSensitive);
			if (result.matches.length > 0) {
				results.push({ rule, matches: result.matches });
			}
		}

		return results;
	});

	// Custom pattern matches
	const customMatchResult = $derived.by(() => {
		if (!customPattern.trim()) return { matches: [] as RuleMatch['matches'], error: undefined };
		return findMatches(sampleOutput, customPattern, customIsRegex, customCaseSensitive);
	});

	const customMatches = $derived(customMatchResult.matches);
	const customError = $derived(customMatchResult.error);

	// Total matches from all sources
	const totalMatches = $derived(
		ruleMatches.reduce((sum, rm) => sum + rm.matches.length, 0) + customMatches.length
	);

	// All match ranges for highlighting (merged and sorted)
	const allMatchRanges = $derived.by(() => {
		const ranges: Array<{ start: number; end: number; color: string; ruleId: string }> = [];

		// Collect rule matches with colors
		const colors = [
			'oklch(0.75 0.15 85)',   // Amber
			'oklch(0.75 0.18 145)',  // Green
			'oklch(0.70 0.15 200)',  // Cyan
			'oklch(0.70 0.15 310)',  // Purple
			'oklch(0.70 0.18 25)',   // Red
			'oklch(0.75 0.12 60)'    // Yellow
		];

		ruleMatches.forEach((rm, idx) => {
			const color = colors[idx % colors.length];
			rm.matches.forEach((m) => {
				ranges.push({ start: m.start, end: m.end, color, ruleId: rm.rule.id });
			});
		});

		// Add custom matches in a distinct color
		if (customMatches.length > 0) {
			customMatches.forEach((m) => {
				ranges.push({ start: m.start, end: m.end, color: 'oklch(0.80 0.20 280)', ruleId: 'custom' });
			});
		}

		// Sort by start position
		return ranges.sort((a, b) => a.start - b.start);
	});

	// Generate highlighted HTML
	const highlightedOutput = $derived.by(() => {
		if (allMatchRanges.length === 0) {
			return escapeHtml(sampleOutput);
		}

		let result = '';
		let lastEnd = 0;

		for (const range of allMatchRanges) {
			// Add non-matched text before this match
			if (range.start > lastEnd) {
				result += escapeHtml(sampleOutput.substring(lastEnd, range.start));
			}

			// Add highlighted match
			const matchText = escapeHtml(sampleOutput.substring(range.start, range.end));
			result += `<mark style="background: ${range.color}; color: oklch(0.15 0.01 250); padding: 1px 2px; border-radius: 2px;">${matchText}</mark>`;

			lastEnd = Math.max(lastEnd, range.end);
		}

		// Add remaining text after last match
		if (lastEnd < sampleOutput.length) {
			result += escapeHtml(sampleOutput.substring(lastEnd));
		}

		return result;
	});

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	// Action type display info
	const actionTypeInfo: Record<AutomationAction['type'], { label: string; icon: string; color: string }> = {
		send_text: {
			label: 'Send Text',
			icon: 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5',
			color: 'oklch(0.75 0.15 200)'
		},
		send_keys: {
			label: 'Send Keys',
			icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z',
			color: 'oklch(0.70 0.15 145)'
		},
		tmux_command: {
			label: 'Tmux Command',
			icon: 'M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z',
			color: 'oklch(0.70 0.15 85)'
		},
		signal: {
			label: 'Signal',
			icon: 'M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
			color: 'oklch(0.70 0.18 310)'
		},
		notify_only: {
			label: 'Notify',
			icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
			color: 'oklch(0.75 0.12 60)'
		}
	};

	// Handle testing a specific rule
	function testRule(rule: AutomationRule) {
		const result = findMatches(sampleOutput, rule.pattern, rule.isRegex, rule.caseSensitive);
		if (onRuleTest) {
			onRuleTest(rule, result.matches);
		}
	}

	// Clear sample output
	function clearOutput() {
		sampleOutput = '';
	}

	// Load example output
	function loadExample() {
		sampleOutput = `[2024-12-11 15:42:33] npm ERR! code ERESOLVE
[2024-12-11 15:42:33] npm ERR! ERESOLVE unable to resolve dependency tree
[2024-12-11 15:42:35] Error: ECONNREFUSED - Connection refused
[2024-12-11 15:42:40] ✓ Build completed successfully
[2024-12-11 15:42:45]
⎿ Do you want to proceed with the deployment? (yes/no)

[2024-12-11 15:42:50] Waiting for user input...
[2024-12-11 15:43:00] API Error: 429 Too Many Requests
[2024-12-11 15:43:05] Rate limit exceeded. Retry after 60 seconds.
[2024-12-11 15:43:30] TypeScript Error: Property 'foo' does not exist on type 'Bar'
[2024-12-11 15:43:35] Test failed: expected 42 but got undefined`;
	}
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
				style="color: oklch(0.70 0.15 200);"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
			<h3 class="font-mono text-sm font-semibold" style="color: oklch(0.85 0.02 250);">
				Pattern Tester
			</h3>
			<span
				class="px-2 py-0.5 rounded text-[10px] font-mono"
				style="background: oklch(0.30 0.02 250); color: oklch(0.65 0.02 250);"
			>
				{totalMatches} match{totalMatches !== 1 ? 'es' : ''}
			</span>
		</div>

		<div class="flex items-center gap-2">
			<button
				class="px-2 py-1 rounded text-xs font-mono transition-colors hover:bg-base-300/50"
				style="color: oklch(0.65 0.02 250);"
				onclick={loadExample}
			>
				Load Example
			</button>
			<button
				class="px-2 py-1 rounded text-xs font-mono transition-colors hover:bg-base-300/50"
				style="color: oklch(0.65 0.02 250);"
				onclick={clearOutput}
			>
				Clear
			</button>
		</div>
	</div>

	<div class="flex flex-col lg:flex-row">
		<!-- Left Panel: Sample Output -->
		<div class="flex-1 p-4 border-b lg:border-b-0 lg:border-r border-base-300">
			<div class="mb-3">
				<label for="sample-output" class="block mb-1 font-mono text-xs" style="color: oklch(0.65 0.02 250);">
					Sample Terminal Output
				</label>
				<textarea
					id="sample-output"
					bind:value={sampleOutput}
					class="w-full h-48 px-3 py-2 rounded-lg font-mono text-xs resize-none focus:outline-none focus:ring-2"
					style="
						background: oklch(0.15 0.01 250);
						color: oklch(0.85 0.02 250);
						border: 1px solid oklch(0.30 0.02 250);
						--tw-ring-color: oklch(0.50 0.12 200);
					"
					placeholder="Paste terminal output here to test pattern matching..."
				></textarea>
			</div>

			<!-- Highlighted Preview -->
			<div class="mb-3">
				<span class="block mb-1 font-mono text-xs" style="color: oklch(0.65 0.02 250);">
					Highlighted Preview
				</span>
				<div
					class="w-full h-48 px-3 py-2 rounded-lg font-mono text-xs overflow-auto whitespace-pre-wrap"
					style="
						background: oklch(0.12 0.01 250);
						color: oklch(0.75 0.02 250);
						border: 1px solid oklch(0.30 0.02 250);
					"
				>
					{@html highlightedOutput}
				</div>
			</div>

			<!-- Custom Pattern Input -->
			<div
				class="p-3 rounded-lg"
				style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.28 0.02 250);"
			>
				<label for="custom-pattern" class="block mb-2 font-mono text-xs font-semibold" style="color: oklch(0.70 0.02 250);">
					Quick Test Pattern
				</label>
				<div class="flex items-center gap-2">
					<input
						id="custom-pattern"
						type="text"
						bind:value={customPattern}
						class="flex-1 px-3 py-1.5 rounded font-mono text-xs focus:outline-none focus:ring-2"
						style="
							background: oklch(0.15 0.01 250);
							color: oklch(0.85 0.02 250);
							border: 1px solid oklch(0.30 0.02 250);
							--tw-ring-color: oklch(0.50 0.15 280);
						"
						placeholder="Enter pattern to test..."
					/>
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={customIsRegex}
							class="checkbox checkbox-xs"
							style="--chkbg: oklch(0.60 0.15 200);"
						/>
						<span class="font-mono text-[10px]" style="color: oklch(0.60 0.02 250);">Regex</span>
					</label>
					<label class="flex items-center gap-1.5 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={customCaseSensitive}
							class="checkbox checkbox-xs"
							style="--chkbg: oklch(0.60 0.15 200);"
						/>
						<span class="font-mono text-[10px]" style="color: oklch(0.60 0.02 250);">Case</span>
					</label>
				</div>
				{#if customError}
					<div class="mt-2 text-[10px] font-mono" style="color: oklch(0.75 0.18 25);">
						⚠️ Invalid regex: {customError}
						{#if customIsRegex}
							<button
								class="ml-2 underline hover:no-underline"
								style="color: oklch(0.70 0.15 200);"
								onclick={() => { customPattern = escapeRegex(customPattern); }}
							>
								Auto-escape
							</button>
						{/if}
					</div>
				{:else if customMatches.length > 0}
					<div class="mt-2 text-[10px] font-mono" style="color: oklch(0.80 0.20 280);">
						{customMatches.length} match{customMatches.length !== 1 ? 'es' : ''} found
					</div>
				{:else if customPattern.trim() && !customIsRegex}
					<div class="mt-2 text-[10px] font-mono" style="color: oklch(0.55 0.02 250);">
						No matches (literal search)
					</div>
				{/if}
			</div>
		</div>

		<!-- Right Panel: Matching Rules -->
		<div class="w-full lg:w-96 p-4">
			<div class="mb-3">
				<h4 class="block mb-1 font-mono text-xs font-semibold" style="color: oklch(0.70 0.02 250);">
					Matching Rules
				</h4>
			</div>

			{#if ruleMatches.length === 0}
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
							d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
						/>
					</svg>
					<p class="font-mono text-sm" style="color: oklch(0.50 0.02 250);">No matching rules</p>
					<p class="font-mono text-xs mt-1" style="color: oklch(0.40 0.02 250);">
						Paste terminal output to see matches
					</p>
				</div>
			{:else}
				<div class="space-y-2 max-h-[500px] overflow-y-auto">
					{#each ruleMatches as { rule, matches }, idx}
						{@const colors = [
							'oklch(0.75 0.15 85)',
							'oklch(0.75 0.18 145)',
							'oklch(0.70 0.15 200)',
							'oklch(0.70 0.15 310)',
							'oklch(0.70 0.18 25)',
							'oklch(0.75 0.12 60)'
						]}
						{@const color = colors[idx % colors.length]}
						{@const actionInfo = actionTypeInfo[rule.action.type]}
						<div
							class="rounded-lg overflow-hidden"
							style="
								background: oklch(0.20 0.01 250);
								border: 1px solid oklch(0.30 0.02 250);
							"
						>
							<!-- Rule Header -->
							<div
								class="px-3 py-2 flex items-center justify-between"
								style="border-left: 3px solid {color};"
							>
								<div class="flex items-center gap-2">
									<span class="font-mono text-xs font-semibold" style="color: {color};">
										{rule.name}
									</span>
									<span
										class="px-1.5 py-0.5 rounded text-[9px] font-mono"
										style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);"
									>
										{matches.length}
									</span>
								</div>
								<button
									class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors hover:bg-base-300/30"
									style="color: oklch(0.60 0.02 250);"
									onclick={() => testRule(rule)}
								>
									Test
								</button>
							</div>

							<!-- Rule Details -->
							<div class="px-3 pb-2">
								<!-- Pattern -->
								<div class="flex items-center gap-2 mb-2">
									<span class="text-[10px] font-mono" style="color: oklch(0.45 0.02 250);">
										Pattern:
									</span>
									<code
										class="px-1.5 py-0.5 rounded text-[10px] font-mono"
										style="background: oklch(0.15 0.01 250); color: {color};"
									>
										{rule.pattern}
									</code>
									{#if rule.isRegex}
										<span
											class="px-1 py-0.5 rounded text-[8px] font-mono"
											style="background: oklch(0.25 0.02 250); color: oklch(0.55 0.02 250);"
										>
											REGEX
										</span>
									{/if}
								</div>

								<!-- Action -->
								<div class="flex items-center gap-2">
									<span class="text-[10px] font-mono" style="color: oklch(0.45 0.02 250);">
										Action:
									</span>
									<div
										class="flex items-center gap-1.5 px-1.5 py-0.5 rounded"
										style="background: oklch(0.18 0.01 250);"
									>
										<svg
											class="w-3 h-3"
											style="color: {actionInfo.color};"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d={actionInfo.icon} />
										</svg>
										<span class="text-[10px] font-mono" style="color: {actionInfo.color};">
											{actionInfo.label}
										</span>
									</div>
									{#if rule.action.value}
										<code
											class="px-1 py-0.5 rounded text-[9px] font-mono"
											style="background: oklch(0.15 0.01 250); color: oklch(0.60 0.02 250);"
										>
											{rule.action.value}
										</code>
									{/if}
								</div>

								<!-- Match Details (collapsed by default) -->
								<details class="mt-2">
									<summary
										class="cursor-pointer text-[10px] font-mono"
										style="color: oklch(0.50 0.02 250);"
									>
										Match locations
									</summary>
									<div
										class="mt-1 p-2 rounded max-h-24 overflow-y-auto"
										style="background: oklch(0.15 0.01 250);"
									>
										{#each matches as match, i}
											<div class="text-[9px] font-mono" style="color: oklch(0.55 0.02 250);">
												{i + 1}. Line {match.line}, Col {match.column}: "<span style="color: {color};">{match.text}</span>"
											</div>
										{/each}
									</div>
								</details>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- All Rules (non-matching) -->
			{#if activeRules.filter((r) => r.enabled && !ruleMatches.find((rm) => rm.rule.id === r.id)).length > 0}
				<div class="mt-4">
					<h5 class="block mb-2 font-mono text-xs" style="color: oklch(0.50 0.02 250);">
						Other Active Rules
					</h5>
					<div class="space-y-1">
						{#each activeRules.filter((r) => r.enabled && !ruleMatches.find((rm) => rm.rule.id === r.id)) as rule}
							<div
								class="px-2 py-1.5 rounded flex items-center justify-between"
								style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
							>
								<span class="font-mono text-[10px]" style="color: oklch(0.50 0.02 250);">
									{rule.name}
								</span>
								<code
									class="px-1 py-0.5 rounded text-[8px] font-mono truncate max-w-[120px]"
									style="background: oklch(0.15 0.01 250); color: oklch(0.45 0.02 250);"
								>
									{rule.pattern}
								</code>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
