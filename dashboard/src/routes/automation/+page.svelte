<script lang="ts">
	/**
	 * Automation Rules Page
	 *
	 * Configure pattern-based automation rules for agent sessions.
	 * Layout: Rules list (left), Presets picker (right), Pattern tester (bottom), Activity log (bottom).
	 */

	import { onMount } from 'svelte';
	import RulesList from '$lib/components/automation/RulesList.svelte';
	import PresetsPicker from '$lib/components/automation/PresetsPicker.svelte';
	import PatternTester from '$lib/components/automation/PatternTester.svelte';
	import ActivityLog from '$lib/components/automation/ActivityLog.svelte';
	import RuleEditor from '$lib/components/automation/RuleEditor.svelte';
	import type { AutomationRule } from '$lib/types/automation';
	import type { ActivityLogEntry } from '$lib/components/automation/ActivityLog.svelte';
	import { addRule, updateRule, getRules, getActivityEvents, initializeStore, isInitialized } from '$lib/stores/automationRules.svelte';
	import { onAutomationTrigger } from '$lib/utils/automationEngine';

	// Convert store activity events to ActivityLog format
	function convertStoreEventsToLogEntries(): ActivityLogEntry[] {
		const storeEvents = getActivityEvents();
		// DEBUG: Log what we're converting
		console.log('[automation page] Converting', storeEvents.length, 'store events to log entries');
		const entries = storeEvents.map(event => ({
			id: event.id,
			timestamp: new Date(event.timestamp),
			sessionName: event.sessionName,
			ruleName: event.ruleName,
			matchedPattern: event.matchedPattern,
			actionTaken: event.actionsExecuted?.map(a => a.type).join(', ') || 'none',
			result: event.success ? 'success' : 'failure',
			details: event.error
		}));
		console.log('[automation page] Created', entries.length, 'log entries');
		return entries;
	}

	// Convert store rules to PatternTester format
	// PatternTester uses simplified types, so we flatten patterns array
	const testerRules = $derived.by(() => {
		const storeRules = getRules();
		return storeRules.flatMap(rule => {
			// Create one entry per pattern in the rule
			return rule.patterns.map((pattern, idx) => ({
				id: `${rule.id}-p${idx}`,
				name: rule.name,
				enabled: rule.enabled,
				pattern: pattern.pattern,
				isRegex: pattern.mode === 'regex',
				caseSensitive: pattern.caseSensitive,
				action: rule.actions[0] || { type: 'notify_only' as const, value: '' },
				cooldownMs: rule.cooldownSeconds * 1000,
				priority: rule.priority
			}));
		});
	});

	// Page state
	let isLoading = $state(true);

	// Rule editor modal state
	let showRuleEditor = $state(false);
	let editingRule = $state<AutomationRule | null>(null);

	// Activity log entries (in-memory, not persisted)
	let activityEntries = $state<ActivityLogEntry[]>([]);

	// Trigger counts per rule (derived from activity log)
	const triggerCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const entry of activityEntries) {
			const current = counts.get(entry.ruleName) || 0;
			counts.set(entry.ruleName, current + 1);
		}
		return counts;
	});

	// Initialize page
	onMount(() => {
		console.log('[automation page] onMount starting...');

		// Ensure automation store is initialized (loads rules from localStorage)
		if (!isInitialized()) {
			console.log('[automation page] Store not initialized, initializing now...');
			initializeStore();
		}

		// Load existing activity events from store (events that fired before page load)
		activityEntries = convertStoreEventsToLogEntries();
		console.log('[automation page] activityEntries set to', activityEntries.length, 'entries');

		// Simulate brief load for skeleton display
		setTimeout(() => {
			isLoading = false;
		}, 300);

		// Subscribe to automation triggers for activity log (new events while page is open)
		const unsubscribe = onAutomationTrigger((sessionName, rule, match, results) => {
			// Convert trigger event to ActivityLogEntry
			const entry: ActivityLogEntry = {
				id: `activity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
				timestamp: new Date(),
				sessionName,
				ruleName: rule.name,
				matchedPattern: match.pattern.pattern,
				actionTaken: results.map(r => r.action.type).join(', ') || 'none',
				result: results.every(r => r.success) ? 'success' : results.some(r => r.success) ? 'pending' : 'failure',
				details: results.map(r => r.error).filter(Boolean).join('; ') || undefined
			};
			activityEntries = [entry, ...activityEntries].slice(0, 100); // Keep latest 100
		});

		return () => {
			unsubscribe();
		};
	});

	// Handle edit rule
	function handleEditRule(rule: AutomationRule) {
		editingRule = rule;
		showRuleEditor = true;
	}

	// Handle add rule
	function handleAddRule() {
		editingRule = null;
		showRuleEditor = true;
	}

	// Handle close rule editor
	function handleCloseEditor() {
		showRuleEditor = false;
		editingRule = null;
	}

	// Handle save rule
	function handleSaveRule(rule: AutomationRule) {
		if (editingRule) {
			// Update existing rule
			updateRule(rule.id, rule);
		} else {
			// Create new rule
			addRule(rule);
		}
		handleCloseEditor();
	}

	// Handle clear activity log
	function handleClearLog() {
		activityEntries = [];
	}
</script>

<svelte:head>
	<title>Automation | JAT Dashboard</title>
	<link rel="icon" href="/favicons/automation.svg" />
</svelte:head>

<div class="h-full flex flex-col overflow-hidden" style="background: oklch(0.14 0.01 250);">
	{#if isLoading}
		<!-- Skeleton Loading State -->
		<div class="flex-1 p-4 overflow-hidden">
			<div class="h-full grid grid-cols-1 lg:grid-cols-2 gap-4">
				<!-- Top Row: Rules List and Presets Picker Skeletons -->
				<div class="skeleton rounded-lg" style="background: oklch(0.18 0.02 250); min-height: 300px;"></div>
				<div class="skeleton rounded-lg" style="background: oklch(0.18 0.02 250); min-height: 300px;"></div>

				<!-- Bottom Row: Pattern Tester and Activity Log Skeletons -->
				<div class="skeleton rounded-lg" style="background: oklch(0.18 0.02 250); min-height: 250px;"></div>
				<div class="skeleton rounded-lg" style="background: oklch(0.18 0.02 250); min-height: 250px;"></div>
			</div>
		</div>
	{:else}
		<!-- Main Content -->
		<div class="flex-1 p-4 overflow-auto">
			<div class="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-min">
				<!-- Top Row -->
				<!-- Rules List (left) -->
				<div class="min-h-[300px] max-h-[500px] overflow-hidden">
					<RulesList
						onEditRule={handleEditRule}
						onAddRule={handleAddRule}
						{triggerCounts}
						class="h-full"
					/>
				</div>

				<!-- Presets Picker (right) -->
				<div class="min-h-[300px] max-h-[500px] overflow-hidden">
					<PresetsPicker class="h-full" />
				</div>

				<!-- Bottom Row -->
				<!-- Pattern Tester (left) -->
				<div class="min-h-[250px] overflow-hidden">
					<PatternTester rules={testerRules} />
				</div>

				<!-- Activity Log (right) -->
				<div class="min-h-[250px] overflow-hidden">
					<ActivityLog
						bind:entries={activityEntries}
						onClear={handleClearLog}
						class="h-full"
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Rule Editor Modal -->
<RuleEditor
	bind:isOpen={showRuleEditor}
	rule={editingRule}
	onSave={handleSaveRule}
	onCancel={handleCloseEditor}
/>
