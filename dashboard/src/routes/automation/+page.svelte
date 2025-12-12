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
		// Simulate brief load for skeleton display
		setTimeout(() => {
			isLoading = false;
		}, 300);
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

	// Handle clear activity log
	function handleClearLog() {
		activityEntries = [];
	}
</script>

<svelte:head>
	<title>Automation | JAT Dashboard</title>
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
					<PatternTester />
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
	onCancel={handleCloseEditor}
/>
