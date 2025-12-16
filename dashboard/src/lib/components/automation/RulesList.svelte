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

<div class="rules-list {className}">
	<!-- Header with master toggle -->
	<header class="list-header">
		<div class="header-left">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="header-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
			</svg>
			<span class="header-title">Automation Rules</span>
			<span class="rule-count">{rules.length} rule{rules.length !== 1 ? 's' : ''}</span>
		</div>

		<div class="header-right">
			<!-- Master toggle -->
			<div class="master-toggle">
				<span class="toggle-label" class:disabled={!config.enabled}>
					{config.enabled ? 'Enabled' : 'Disabled'}
				</span>
				<button
					class="toggle-btn"
					class:enabled={config.enabled}
					onclick={handleMasterToggle}
					aria-label={config.enabled ? 'Disable automation' : 'Enable automation'}
				>
					<span class="toggle-track">
						<span class="toggle-thumb"></span>
					</span>
				</button>
			</div>

			<!-- Import/Export buttons -->
			<div class="import-export-btns">
				<!-- Hidden file input for import -->
				<input
					type="file"
					accept=".json,application/json"
					class="hidden"
					bind:this={importFileInput}
					onchange={handleImportFileChange}
				/>
				<!-- Import button -->
				<button
					class="io-btn import-btn"
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
					class="io-btn export-btn"
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
				class="add-btn"
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
	<div class="rules-content" class:disabled={!config.enabled}>
		{#if rules.length === 0}
			<div class="empty-state" transition:fade={{ duration: 150 }}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="empty-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				<p class="empty-title">No automation rules</p>
				<p class="empty-hint">Add rules to automate session responses</p>
				<button class="empty-action" onclick={() => onAddRule()}>
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
					<div class="category-group" transition:slide={{ duration: 200, axis: 'y' }}>
						<div class="category-header">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="category-icon {meta.color}">
								<path stroke-linecap="round" stroke-linejoin="round" d={meta.icon} />
							</svg>
							<span class="category-label">{meta.label}</span>
							<span class="category-count">{categoryRules.length}</span>
						</div>

						<div class="rules-group">
							{#each categoryRules as rule (rule.id)}
								{@const triggerCount = getTriggerCount(rule.id)}
								<div
									class="rule-item"
									class:dragging={draggedRuleId === rule.id}
									class:drag-over={dragOverRuleId === rule.id}
									class:disabled={!rule.enabled}
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
									<div class="drag-handle" aria-label="Drag to reorder">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
										</svg>
									</div>

									<!-- Enable/disable toggle -->
									<button
										class="rule-toggle"
										class:enabled={rule.enabled}
										onclick={() => handleToggleRule(rule.id)}
										aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
									>
										<span class="toggle-track-sm">
											<span class="toggle-thumb-sm"></span>
										</span>
									</button>

									<!-- Rule info -->
									<div class="rule-info">
										<div class="rule-name-row">
											<span class="rule-name" class:disabled={!rule.enabled}>
												{rule.name}
											</span>
											{#if rule.isPreset}
												<span class="preset-badge">Preset</span>
											{/if}
											{#if triggerCount > 0}
												<span class="trigger-badge" title="{triggerCount} triggers this session">
													{triggerCount}
												</span>
											{/if}
										</div>
										<div class="rule-meta">
											<span class="rule-pattern" title={rule.patterns[0]?.pattern}>
												{rule.patterns[0]?.mode === 'regex' ? '/' : '"'}
												{rule.patterns[0]?.pattern.length > 25
													? rule.patterns[0]?.pattern.slice(0, 25) + '...'
													: rule.patterns[0]?.pattern}
												{rule.patterns[0]?.mode === 'regex' ? '/' : '"'}
											</span>
											<span class="rule-arrow">→</span>
											<span class="rule-action">
												{formatActionType(rule.actions[0]?.type || 'unknown')}
											</span>
										</div>
									</div>

									<!-- Action buttons -->
									<div class="rule-actions">
										<button
											class="action-btn edit"
											onclick={() => onEditRule(rule)}
											title="Edit rule"
											aria-label="Edit rule"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
											</svg>
										</button>
										<button
											class="action-btn clone"
											onclick={() => handleCloneRule(rule.id)}
											title="Clone rule"
											aria-label="Clone rule"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
											</svg>
										</button>
										<button
											class="action-btn delete"
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
		<div class="import-message success" transition:fade={{ duration: 150 }}>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="message-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>Successfully imported {parsedRuleCount} rule{parsedRuleCount !== 1 ? 's' : ''}</span>
		</div>
	{/if}
	{#if importError && !showImportModal}
		<div class="import-message error" transition:fade={{ duration: 150 }}>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="message-icon">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<span>{importError}</span>
			<button class="dismiss-btn" onclick={() => importError = null}>×</button>
		</div>
	{/if}
</div>

<!-- Import Modal -->
{#if showImportModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleCancelImport} role="presentation" transition:fade={{ duration: 150 }}>
		<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="import-modal-title" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="modal-icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
				</svg>
				<h3 id="import-modal-title" class="modal-title">Import Rules</h3>
			</div>

			<div class="modal-body">
				<div class="file-info">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="file-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
					</svg>
					<div class="file-details">
						<span class="file-name">{importFileName}</span>
						<span class="file-rules">{parsedRuleCount} rule{parsedRuleCount !== 1 ? 's' : ''} found</span>
					</div>
				</div>

				<p class="modal-description">
					How would you like to import these rules?
				</p>

				<div class="import-options">
					<button class="import-option merge" onclick={() => handleImport(true)}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="option-icon">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
						<div class="option-text">
							<span class="option-title">Merge</span>
							<span class="option-desc">Add new rules, keep existing</span>
						</div>
					</button>

					<button class="import-option replace" onclick={() => handleImport(false)}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="option-icon">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
						</svg>
						<div class="option-text">
							<span class="option-title">Replace</span>
							<span class="option-desc">Remove all existing rules</span>
						</div>
					</button>
				</div>

				{#if importError}
					<div class="modal-error" transition:fade={{ duration: 150 }}>
						{importError}
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="cancel-btn" onclick={handleCancelImport}>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.rules-list {
		display: flex;
		flex-direction: column;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 10px;
		overflow: hidden;
	}

	/* Header */
	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.65 0.10 200);
	}

	.header-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.rule-count {
		font-size: 0.7rem;
		font-weight: 400;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.5rem;
		border-radius: 10px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	/* Master toggle */
	.master-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toggle-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.70 0.10 145);
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.toggle-label.disabled {
		color: oklch(0.50 0.02 250);
	}

	.toggle-btn {
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
	}

	.toggle-track {
		display: flex;
		align-items: center;
		width: 36px;
		height: 20px;
		background: oklch(0.30 0.02 250);
		border-radius: 10px;
		padding: 2px;
		transition: background 0.2s ease;
	}

	.toggle-btn.enabled .toggle-track {
		background: oklch(0.55 0.15 145);
	}

	.toggle-thumb {
		width: 16px;
		height: 16px;
		background: oklch(0.85 0.02 250);
		border-radius: 50%;
		transition: transform 0.2s ease;
	}

	.toggle-btn.enabled .toggle-thumb {
		transform: translateX(16px);
	}

	/* Add button */
	.add-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: oklch(0.35 0.10 200);
		border: 1px solid oklch(0.45 0.12 200);
		border-radius: 6px;
		color: oklch(0.90 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.add-btn:hover {
		background: oklch(0.40 0.12 200);
		border-color: oklch(0.50 0.15 200);
	}

	/* Rules content */
	.rules-content {
		flex: 1;
		overflow: auto;
		max-height: 500px;
		transition: opacity 0.2s ease;
	}

	.rules-content.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.5rem;
		color: oklch(0.50 0.02 250);
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.35 0.02 250);
		margin-bottom: 0.5rem;
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
		margin: 0;
	}

	.empty-action {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.30 0.08 200);
		border: 1px solid oklch(0.40 0.10 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.empty-action:hover {
		background: oklch(0.35 0.10 200);
	}

	/* Category group */
	.category-group {
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.category-group:last-child {
		border-bottom: none;
	}

	.category-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		background: oklch(0.18 0.02 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.category-icon {
		width: 16px;
		height: 16px;
	}

	.category-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: oklch(0.65 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.category-count {
		font-size: 0.6rem;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 8px;
	}

	/* Rules group */
	.rules-group {
		display: flex;
		flex-direction: column;
	}

	/* Rule item */
	.rule-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 1rem;
		background: oklch(0.16 0.02 250);
		border-bottom: 1px solid oklch(0.20 0.02 250);
		transition: all 0.15s ease;
		cursor: grab;
	}

	.rule-item:last-child {
		border-bottom: none;
	}

	.rule-item:hover {
		background: oklch(0.20 0.02 250);
	}

	.rule-item.dragging {
		opacity: 0.5;
		background: oklch(0.22 0.02 250);
	}

	.rule-item.drag-over {
		background: oklch(0.25 0.05 200);
		border-top: 2px solid oklch(0.60 0.15 200);
	}

	.rule-item.disabled {
		opacity: 0.6;
	}

	/* Drag handle */
	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		color: oklch(0.40 0.02 250);
		cursor: grab;
		transition: color 0.15s ease;
	}

	.rule-item:hover .drag-handle {
		color: oklch(0.55 0.02 250);
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	/* Rule toggle (smaller version) */
	.rule-toggle {
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle-track-sm {
		display: flex;
		align-items: center;
		width: 28px;
		height: 16px;
		background: oklch(0.30 0.02 250);
		border-radius: 8px;
		padding: 2px;
		transition: background 0.2s ease;
	}

	.rule-toggle.enabled .toggle-track-sm {
		background: oklch(0.55 0.15 145);
	}

	.toggle-thumb-sm {
		width: 12px;
		height: 12px;
		background: oklch(0.85 0.02 250);
		border-radius: 50%;
		transition: transform 0.2s ease;
	}

	.rule-toggle.enabled .toggle-thumb-sm {
		transform: translateX(12px);
	}

	/* Rule info */
	.rule-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.rule-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.rule-name {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rule-name.disabled {
		color: oklch(0.55 0.02 250);
	}

	.preset-badge {
		font-size: 0.55rem;
		font-weight: 600;
		color: oklch(0.70 0.10 280);
		background: oklch(0.25 0.06 280);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.trigger-badge {
		font-size: 0.6rem;
		font-weight: 600;
		color: oklch(0.85 0.15 85);
		background: oklch(0.30 0.10 85);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		min-width: 18px;
		text-align: center;
	}

	.rule-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.rule-pattern {
		color: oklch(0.65 0.08 55);
		max-width: 180px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rule-arrow {
		color: oklch(0.45 0.02 250);
	}

	.rule-action {
		color: oklch(0.65 0.08 200);
	}

	/* Action buttons */
	.rule-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.rule-item:hover .rule-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.action-btn.edit:hover {
		background: oklch(0.28 0.06 200);
		border-color: oklch(0.40 0.10 200);
		color: oklch(0.80 0.10 200);
	}

	.action-btn.clone:hover {
		background: oklch(0.28 0.06 280);
		border-color: oklch(0.40 0.10 280);
		color: oklch(0.80 0.10 280);
	}

	.action-btn.delete:hover {
		background: oklch(0.28 0.08 25);
		border-color: oklch(0.45 0.12 25);
		color: oklch(0.80 0.15 25);
	}

	/* DaisyUI text color classes */
	:global(.text-success) {
		color: oklch(0.65 0.15 145);
	}

	:global(.text-info) {
		color: oklch(0.65 0.15 200);
	}

	:global(.text-warning) {
		color: oklch(0.75 0.15 85);
	}

	:global(.text-secondary) {
		color: oklch(0.65 0.10 280);
	}

	:global(.text-accent) {
		color: oklch(0.70 0.12 310);
	}

	/* Import/Export buttons */
	.import-export-btns {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.io-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 6px;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.io-btn:hover:not(:disabled) {
		background: oklch(0.28 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.io-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.import-btn:hover:not(:disabled) {
		background: oklch(0.28 0.06 145);
		border-color: oklch(0.40 0.10 145);
		color: oklch(0.80 0.10 145);
	}

	.export-btn:hover:not(:disabled) {
		background: oklch(0.28 0.06 200);
		border-color: oklch(0.40 0.10 200);
		color: oklch(0.80 0.10 200);
	}

	.hidden {
		display: none;
	}

	/* Import messages */
	.import-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.import-message.success {
		background: oklch(0.20 0.08 145);
		color: oklch(0.85 0.12 145);
	}

	.import-message.error {
		background: oklch(0.20 0.08 25);
		color: oklch(0.85 0.12 25);
	}

	.message-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.dismiss-btn {
		margin-left: auto;
		padding: 0.125rem 0.375rem;
		background: transparent;
		border: none;
		color: oklch(0.70 0.08 25);
		font-size: 1rem;
		cursor: pointer;
		line-height: 1;
		border-radius: 4px;
		transition: background 0.15s ease;
	}

	.dismiss-btn:hover {
		background: oklch(0.30 0.08 25);
	}

	/* Import Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: oklch(0.10 0.02 250 / 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 12px;
		box-shadow: 0 20px 40px oklch(0 0 0 / 0.4);
		min-width: 380px;
		max-width: 90vw;
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.14 0.02 250);
		border-radius: 12px 12px 0 0;
	}

	.modal-icon {
		width: 22px;
		height: 22px;
		color: oklch(0.70 0.12 145);
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.modal-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
	}

	.file-icon {
		width: 28px;
		height: 28px;
		color: oklch(0.60 0.08 200);
		flex-shrink: 0;
	}

	.file-details {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.file-name {
		font-size: 0.85rem;
		font-weight: 500;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: ui-monospace, monospace;
	}

	.file-rules {
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
	}

	.modal-description {
		font-size: 0.85rem;
		color: oklch(0.70 0.02 250);
		margin: 0;
	}

	.import-options {
		display: flex;
		gap: 0.75rem;
	}

	.import-option {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.import-option:hover {
		background: oklch(0.24 0.02 250);
		border-color: oklch(0.40 0.02 250);
	}

	.import-option.merge:hover {
		background: oklch(0.22 0.06 145);
		border-color: oklch(0.45 0.12 145);
	}

	.import-option.replace:hover {
		background: oklch(0.22 0.06 200);
		border-color: oklch(0.45 0.12 200);
	}

	.option-icon {
		width: 24px;
		height: 24px;
		color: oklch(0.65 0.02 250);
		flex-shrink: 0;
	}

	.import-option.merge:hover .option-icon {
		color: oklch(0.75 0.12 145);
	}

	.import-option.replace:hover .option-icon {
		color: oklch(0.75 0.12 200);
	}

	.option-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		text-align: left;
	}

	.option-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
	}

	.option-desc {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
	}

	.modal-error {
		padding: 0.625rem 0.875rem;
		background: oklch(0.20 0.08 25);
		border: 1px solid oklch(0.35 0.12 25);
		border-radius: 6px;
		font-size: 0.8rem;
		color: oklch(0.85 0.12 25);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		padding: 0.875rem 1.25rem;
		border-top: 1px solid oklch(0.25 0.02 250);
		background: oklch(0.14 0.02 250);
		border-radius: 0 0 12px 12px;
	}

	.cancel-btn {
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 6px;
		color: oklch(0.75 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cancel-btn:hover {
		background: oklch(0.30 0.02 250);
		color: oklch(0.85 0.02 250);
	}
</style>
