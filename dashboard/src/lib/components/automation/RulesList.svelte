<script lang="ts">
	/**
	 * RulesList Component
	 *
	 * Displays all automation rules with management controls:
	 * - Enable/disable toggle per rule
	 * - Edit and delete buttons
	 * - Drag-to-reorder for priority
	 * - Trigger count per rule
	 * - Master automation system toggle
	 *
	 * @see dashboard/src/lib/types/automation.ts for type definitions
	 * @see dashboard/src/lib/stores/automationRules.svelte.ts for store
	 */

	import { flip } from 'svelte/animate';
	import { fade, slide } from 'svelte/transition';
	import type { AutomationRule, RuleCategory } from '$lib/types/automation';
	import {
		getRules,
		getConfig,
		toggleRuleEnabled,
		deleteRule,
		reorderRules,
		toggleAutomation,
		cloneRule,
		exportRules,
		importRules
	} from '$lib/stores/automationRules.svelte';
	import { RULE_CATEGORY_META } from '$lib/config/automationConfig';

	interface Props {
		/** Called when edit button is clicked for a rule */
		onEditRule?: (rule: AutomationRule) => void;
		/** Called when add rule button is clicked */
		onAddRule?: () => void;
		/** Trigger counts per rule ID (from activity tracking) */
		triggerCounts?: Map<string, number>;
		/** Custom class */
		class?: string;
	}

	let {
		onEditRule = () => {},
		onAddRule = () => {},
		triggerCounts = new Map(),
		class: className = ''
	}: Props = $props();

	// Get reactive state from store
	const rules = $derived(getRules());
	const config = $derived(getConfig());

	// Drag state
	let draggedRuleId = $state<string | null>(null);
	let dragOverRuleId = $state<string | null>(null);

	// Import modal state
	let showImportModal = $state(false);
	let importFileInput: HTMLInputElement;
	let importData = $state<string | null>(null);
	let importFileName = $state<string>('');
	let importError = $state<string | null>(null);
	let importSuccess = $state(false);
	let parsedRuleCount = $state(0);

	// Group rules by category
	const rulesByCategory = $derived.by(() => {
		const grouped = new Map<RuleCategory, AutomationRule[]>();

		for (const rule of rules) {
			const category = rule.category || 'custom';
			if (!grouped.has(category)) {
				grouped.set(category, []);
			}
			grouped.get(category)!.push(rule);
		}

		// Sort by priority within each category (highest first)
		for (const [_, categoryRules] of grouped) {
			categoryRules.sort((a, b) => b.priority - a.priority);
		}

		return grouped;
	});

	// Category order for display
	const categoryOrder: RuleCategory[] = ['recovery', 'prompt', 'stall', 'notification', 'custom'];

	// Handle drag start
	function handleDragStart(event: DragEvent, ruleId: string) {
		if (!event.dataTransfer) return;
		draggedRuleId = ruleId;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', ruleId);
	}

	// Handle drag over
	function handleDragOver(event: DragEvent, ruleId: string) {
		event.preventDefault();
		if (draggedRuleId && draggedRuleId !== ruleId) {
			dragOverRuleId = ruleId;
		}
	}

	// Handle drag leave
	function handleDragLeave() {
		dragOverRuleId = null;
	}

	// Handle drop
	function handleDrop(event: DragEvent, targetRuleId: string) {
		event.preventDefault();
		if (!draggedRuleId || draggedRuleId === targetRuleId) {
			resetDragState();
			return;
		}

		// Get current rule order
		const currentOrder = rules.map(r => r.id);
		const draggedIndex = currentOrder.indexOf(draggedRuleId);
		const targetIndex = currentOrder.indexOf(targetRuleId);

		if (draggedIndex === -1 || targetIndex === -1) {
			resetDragState();
			return;
		}

		// Reorder: remove dragged and insert at target position
		const newOrder = [...currentOrder];
		newOrder.splice(draggedIndex, 1);
		newOrder.splice(targetIndex, 0, draggedRuleId);

		reorderRules(newOrder);
		resetDragState();
	}

	// Handle drag end
	function handleDragEnd() {
		resetDragState();
	}

	function resetDragState() {
		draggedRuleId = null;
		dragOverRuleId = null;
	}

	// Handle rule toggle
	function handleToggleRule(ruleId: string) {
		toggleRuleEnabled(ruleId);
	}

	// Handle delete rule
	function handleDeleteRule(rule: AutomationRule) {
		if (confirm(`Delete rule "${rule.name}"?`)) {
			deleteRule(rule.id);
		}
	}

	// Handle clone rule
	function handleCloneRule(ruleId: string) {
		cloneRule(ruleId);
	}

	// Handle master toggle
	function handleMasterToggle() {
		toggleAutomation();
	}

	// Get trigger count for a rule
	function getTriggerCount(ruleId: string): number {
		return triggerCounts.get(ruleId) || 0;
	}

	// Get category metadata
	function getCategoryMeta(category: RuleCategory) {
		return RULE_CATEGORY_META[category] || RULE_CATEGORY_META.custom;
	}

	// Format action type for display
	function formatActionType(type: string): string {
		switch (type) {
			case 'send_text': return 'Send Text';
			case 'send_keys': return 'Send Keys';
			case 'tmux_command': return 'Tmux Cmd';
			case 'signal': return 'Signal';
			case 'notify_only': return 'Notify';
			default: return type;
		}
	}

	// Handle export rules
	function handleExport() {
		const jsonString = exportRules();
		const blob = new Blob([jsonString], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `automation-rules-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// Handle import file selection
	function handleImportFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importFileName = file.name;
		importError = null;
		importSuccess = false;

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			try {
				const data = JSON.parse(content);
				if (!data.rules || !Array.isArray(data.rules)) {
					importError = 'Invalid file format: "rules" array not found';
					importData = null;
					parsedRuleCount = 0;
				} else {
					importData = content;
					parsedRuleCount = data.rules.length;
					showImportModal = true;
				}
			} catch (err) {
				importError = 'Invalid JSON file';
				importData = null;
				parsedRuleCount = 0;
			}
		};
		reader.onerror = () => {
			importError = 'Failed to read file';
			importData = null;
		};
		reader.readAsText(file);

		// Reset input so same file can be selected again
		input.value = '';
	}

	// Handle import with merge option
	function handleImport(merge: boolean) {
		if (!importData) return;

		const success = importRules(importData, merge);
		if (success) {
			importSuccess = true;
			importError = null;
			showImportModal = false;
			// Reset state after a delay to allow success message to show
			setTimeout(() => {
				importSuccess = false;
				importData = null;
				importFileName = '';
				parsedRuleCount = 0;
			}, 3000);
		} else {
			importError = 'Failed to import rules. Check file format.';
		}
	}

	// Cancel import
	function handleCancelImport() {
		showImportModal = false;
		importData = null;
		importFileName = '';
		importError = null;
		parsedRuleCount = 0;
	}
</script>

<div class="flex flex-col bg-base-200 border border-base-300 rounded-xl overflow-hidden {className}">
	<!-- Header with master toggle -->
	<header class="flex items-center justify-between gap-4 px-4 py-3 bg-base-300 border-b border-base-content/10">
		<div class="flex items-center gap-2">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-[18px] h-[18px] text-info">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
			</svg>
			<span class="text-sm font-semibold text-base-content font-mono">Automation Rules</span>
			<span class="text-xs font-normal text-base-content/50 bg-base-100 px-2 py-0.5 rounded-full">{rules.length} rule{rules.length !== 1 ? 's' : ''}</span>
		</div>

		<div class="flex items-center gap-3">
			<!-- Master toggle -->
			<div class="flex items-center gap-2">
				<span class="text-xs font-medium font-mono uppercase tracking-wide {config.enabled ? 'text-success' : 'text-base-content/50'}">
					{config.enabled ? 'Enabled' : 'Disabled'}
				</span>
				<button
					class="p-0 bg-transparent border-none cursor-pointer"
					onclick={handleMasterToggle}
					aria-label={config.enabled ? 'Disable automation' : 'Enable automation'}
				>
					<span class="flex items-center w-9 h-5 rounded-full p-0.5 transition-colors duration-200 {config.enabled ? 'bg-success' : 'bg-base-content/20'}">
						<span class="w-4 h-4 bg-base-content/80 rounded-full transition-transform duration-200 {config.enabled ? 'translate-x-4' : ''}"></span>
					</span>
				</button>
			</div>

			<!-- Import/Export buttons -->
			<div class="flex items-center gap-1">
				<!-- Hidden file input for import -->
				<input
					type="file"
					accept=".json,application/json"
					class="!hidden"
					bind:this={importFileInput}
					onchange={handleImportFileChange}
				/>
				<!-- Import button -->
				<button
					class="btn btn-sm btn-square btn-ghost text-base-content/50 hover:text-base-content hover:bg-success/20 hover:text-success"
					onclick={() => importFileInput?.click()}
					aria-label="Import rules"
					title="Import rules from JSON file"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
					</svg>
				</button>
				<!-- Export button -->
				<button
					class="btn btn-sm btn-square btn-ghost text-base-content/50 hover:text-base-content hover:bg-info/20 hover:text-info disabled:opacity-40 disabled:cursor-not-allowed"
					onclick={handleExport}
					aria-label="Export rules"
					title="Export rules to JSON file"
					disabled={rules.length === 0}
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
					</svg>
				</button>
			</div>

			<!-- Add rule button -->
			<button
				class="btn btn-sm btn-info btn-outline gap-1.5 font-mono"
				onclick={() => onAddRule()}
				aria-label="Add new rule"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				Add Rule
			</button>
		</div>
	</header>

	<!-- Rules content -->
	<div class="flex-1 overflow-auto max-h-[500px] transition-opacity duration-200 {config.enabled ? '' : 'opacity-50 pointer-events-none'}">
		{#if rules.length === 0}
			<div class="flex flex-col items-center justify-center py-12 px-4 gap-2 text-base-content/50" transition:fade={{ duration: 150 }}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-base-content/30 mb-2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				<p class="text-sm font-medium text-base-content/60 m-0">No automation rules</p>
				<p class="text-xs text-base-content/40 m-0">Add rules to automate session responses</p>
				<button class="btn btn-sm btn-info btn-outline mt-4 gap-1.5" onclick={() => onAddRule()}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					Add First Rule
				</button>
			</div>
		{:else}
			<!-- Rules grouped by category -->
			{#each categoryOrder as category}
				{@const categoryRules = rulesByCategory.get(category)}
				{#if categoryRules && categoryRules.length > 0}
					{@const meta = getCategoryMeta(category)}
					<div class="border-b border-base-content/10 last:border-b-0" transition:slide={{ duration: 200, axis: 'y' }}>
						<div class="flex items-center gap-2 px-4 py-2.5 bg-base-300/50 border-b border-base-content/10">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 {meta.color}">
								<path stroke-linecap="round" stroke-linejoin="round" d={meta.icon} />
							</svg>
							<span class="text-xs font-semibold text-base-content/60 uppercase tracking-wider">{meta.label}</span>
							<span class="text-[0.6rem] text-base-content/50 bg-base-100 px-1.5 py-0.5 rounded-lg">{categoryRules.length}</span>
						</div>

						<div class="flex flex-col">
							{#each categoryRules as rule (rule.id)}
								{@const triggerCount = getTriggerCount(rule.id)}
								<div
									class="flex items-center gap-3 px-4 py-2.5 bg-base-200 border-b border-base-content/5 transition-all duration-150 cursor-grab last:border-b-0 hover:bg-base-300 {draggedRuleId === rule.id ? 'opacity-50 bg-base-300' : ''} {dragOverRuleId === rule.id ? 'bg-info/10 border-t-2 border-t-info' : ''} {!rule.enabled ? 'opacity-60' : ''}"
									draggable="true"
									ondragstart={(e) => handleDragStart(e, rule.id)}
									ondragover={(e) => handleDragOver(e, rule.id)}
									ondragleave={handleDragLeave}
									ondrop={(e) => handleDrop(e, rule.id)}
									ondragend={handleDragEnd}
									animate:flip={{ duration: 200 }}
									transition:slide={{ duration: 150, axis: 'y' }}
								>
									<!-- Drag handle -->
									<div class="flex items-center justify-center w-5 text-base-content/30 cursor-grab transition-colors duration-150 hover:text-base-content/50 active:cursor-grabbing" aria-label="Drag to reorder">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
										</svg>
									</div>

									<!-- Enable/disable toggle -->
									<button
										class="p-0 bg-transparent border-none cursor-pointer flex-shrink-0"
										onclick={() => handleToggleRule(rule.id)}
										aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
									>
										<span class="flex items-center w-7 h-4 rounded-lg p-0.5 transition-colors duration-200 {rule.enabled ? 'bg-success' : 'bg-base-content/20'}">
											<span class="w-3 h-3 bg-base-content/80 rounded-full transition-transform duration-200 {rule.enabled ? 'translate-x-3' : ''}"></span>
										</span>
									</button>

									<!-- Rule info -->
									<div class="flex-1 min-w-0 flex flex-col gap-1">
										<div class="flex items-center gap-2">
											<span class="text-sm font-medium truncate {rule.enabled ? 'text-base-content' : 'text-base-content/50'}">
												{rule.name}
											</span>
											{#if rule.isPreset}
												<span class="badge badge-xs badge-secondary font-semibold uppercase tracking-wide">Preset</span>
											{/if}
											{#if triggerCount > 0}
												<span class="badge badge-xs badge-warning font-semibold min-w-[18px] text-center" title="{triggerCount} triggers this session">
													{triggerCount}
												</span>
											{/if}
										</div>
										<div class="flex items-center gap-1.5 text-xs text-base-content/50 font-mono">
											<span class="text-warning/80 max-w-[180px] truncate" title={rule.patterns[0]?.pattern}>
												{rule.patterns[0]?.mode === 'regex' ? '/' : '"'}
												{rule.patterns[0]?.pattern.length > 25
													? rule.patterns[0]?.pattern.slice(0, 25) + '...'
													: rule.patterns[0]?.pattern}
												{rule.patterns[0]?.mode === 'regex' ? '/' : '"'}
											</span>
											<span class="text-base-content/30">→</span>
											<span class="text-info/80">
												{formatActionType(rule.actions[0]?.type || 'unknown')}
											</span>
										</div>
									</div>

									<!-- Action buttons -->
									<div class="flex items-center gap-1.5">
										<button
											class="btn btn-xs btn-square btn-ghost text-base-content/50 hover:text-base-content hover:bg-info/20 hover:text-info"
											onclick={() => onEditRule(rule)}
											title="Edit rule"
											aria-label="Edit rule"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
											</svg>
										</button>
										<button
											class="btn btn-xs btn-square btn-ghost text-base-content/50 hover:text-base-content hover:bg-secondary/20 hover:text-secondary"
											onclick={() => handleCloneRule(rule.id)}
											title="Clone rule"
											aria-label="Clone rule"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
											</svg>
										</button>
										<button
											class="btn btn-xs btn-square btn-ghost text-base-content/50 hover:text-base-content hover:bg-error/20 hover:text-error"
											onclick={() => handleDeleteRule(rule)}
											title="Delete rule"
											aria-label="Delete rule"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
											</svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		{/if}
	</div>

	<!-- Import success/error messages -->
	{#if importSuccess}
		<div class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t border-base-content/10 bg-success/20 text-success" transition:fade={{ duration: 150 }}>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-[18px] h-[18px] flex-shrink-0">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>Successfully imported {parsedRuleCount} rule{parsedRuleCount !== 1 ? 's' : ''}</span>
		</div>
	{/if}
	{#if importError && !showImportModal}
		<div class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t border-base-content/10 bg-error/20 text-error" transition:fade={{ duration: 150 }}>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-[18px] h-[18px] flex-shrink-0">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<span>{importError}</span>
			<button class="ml-auto px-1.5 py-0.5 bg-transparent border-none text-error/70 text-base cursor-pointer leading-none rounded transition-colors duration-150 hover:bg-error/20" onclick={() => importError = null}>×</button>
		</div>
	{/if}
</div>

<!-- Import Modal -->
{#if showImportModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-base-300/80 flex items-center justify-center z-[1000] backdrop-blur-sm" onclick={handleCancelImport} role="presentation" transition:fade={{ duration: 150 }}>
		<div class="bg-base-200 border border-base-content/20 rounded-xl shadow-2xl min-w-[380px] max-w-[90vw]" role="dialog" aria-modal="true" aria-labelledby="import-modal-title" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center gap-2.5 px-5 py-4 border-b border-base-content/10 bg-base-300 rounded-t-xl">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-[22px] h-[22px] text-success">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
				</svg>
				<h3 id="import-modal-title" class="text-base font-semibold text-base-content m-0 font-mono">Import Rules</h3>
			</div>

			<div class="p-5 flex flex-col gap-4">
				<div class="flex items-center gap-3 px-4 py-3 bg-base-300 border border-base-content/10 rounded-lg">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-info flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
					</svg>
					<div class="flex flex-col gap-0.5 min-w-0">
						<span class="text-sm font-medium text-base-content truncate font-mono">{importFileName}</span>
						<span class="text-xs text-base-content/60">{parsedRuleCount} rule{parsedRuleCount !== 1 ? 's' : ''} found</span>
					</div>
				</div>

				<p class="text-sm text-base-content/70 m-0">
					How would you like to import these rules?
				</p>

				<div class="flex gap-3">
					<button class="flex-1 flex items-center gap-3 px-4 py-3.5 bg-base-300 border border-base-content/20 rounded-lg cursor-pointer transition-all duration-150 hover:bg-success/10 hover:border-success/40 group" onclick={() => handleImport(true)}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-base-content/60 flex-shrink-0 group-hover:text-success">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
						<div class="flex flex-col gap-0.5 text-left">
							<span class="text-sm font-semibold text-base-content">Merge</span>
							<span class="text-xs text-base-content/50">Add new rules, keep existing</span>
						</div>
					</button>

					<button class="flex-1 flex items-center gap-3 px-4 py-3.5 bg-base-300 border border-base-content/20 rounded-lg cursor-pointer transition-all duration-150 hover:bg-info/10 hover:border-info/40 group" onclick={() => handleImport(false)}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-base-content/60 flex-shrink-0 group-hover:text-info">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
						</svg>
						<div class="flex flex-col gap-0.5 text-left">
							<span class="text-sm font-semibold text-base-content">Replace</span>
							<span class="text-xs text-base-content/50">Remove all existing rules</span>
						</div>
					</button>
				</div>

				{#if importError}
					<div class="alert alert-error py-2.5 px-3.5 text-sm" transition:fade={{ duration: 150 }}>
						{importError}
					</div>
				{/if}
			</div>

			<div class="flex justify-end px-5 py-3.5 border-t border-base-content/10 bg-base-300 rounded-b-xl">
				<button class="btn btn-sm btn-ghost" onclick={handleCancelImport}>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* All styling converted to inline Tailwind/DaisyUI classes for Tailwind v4 compatibility */
</style>
