<script lang="ts">
	/**
	 * PresetsPicker Component
	 *
	 * Displays automation preset packs as cards with:
	 * - Name, description, and rule count
	 * - Install button to add all rules from pack
	 * - Preview rules before installing
	 * - Tracking which presets are already installed
	 */

	import { fly, fade, slide } from 'svelte/transition';
	import {
		AUTOMATION_PRESETS,
		RULE_CATEGORY_META,
		getPresetsByCategory
	} from '$lib/config/automationConfig';
	import {
		isPresetActive,
		addPreset,
		removePreset,
		getRules
	} from '$lib/stores/automationRules.svelte';
	import type { AutomationPreset, RuleCategory } from '$lib/types/automation';

	interface Props {
		/** Compact mode for smaller display */
		compact?: boolean;
		/** Custom class */
		class?: string;
	}

	let { compact = false, class: className = '' }: Props = $props();

	// Preview modal state
	let previewPreset = $state<AutomationPreset | null>(null);
	let showPreviewModal = $state(false);

	// Track installed state reactively
	const rules = $derived(getRules());
	const installedPresets = $derived(new Set(rules.filter(r => r.presetId).map(r => r.presetId)));

	// Categories to display
	const categories: RuleCategory[] = ['recovery', 'prompt', 'stall', 'notification'];

	// Get presets grouped by category
	const presetsByCategory = $derived.by(() => {
		const grouped: Record<RuleCategory, AutomationPreset[]> = {
			recovery: [],
			prompt: [],
			stall: [],
			notification: [],
			custom: []
		};

		for (const preset of AUTOMATION_PRESETS) {
			grouped[preset.category].push(preset);
		}

		return grouped;
	});

	// Count presets per category
	function getCategoryStats(category: RuleCategory): { total: number; installed: number } {
		const presets = presetsByCategory[category];
		const installed = presets.filter(p => installedPresets.has(p.id)).length;
		return { total: presets.length, installed };
	}

	// Install a preset
	function installPreset(preset: AutomationPreset) {
		addPreset(preset.id);
	}

	// Uninstall a preset
	function uninstallPreset(preset: AutomationPreset) {
		removePreset(preset.id);
	}

	// Toggle preset installation
	function togglePreset(preset: AutomationPreset) {
		if (installedPresets.has(preset.id)) {
			uninstallPreset(preset);
		} else {
			installPreset(preset);
		}
	}

	// Show preview modal
	function showPreview(preset: AutomationPreset) {
		previewPreset = preset;
		showPreviewModal = true;
	}

	// Close preview modal
	function closePreview() {
		showPreviewModal = false;
		previewPreset = null;
	}

	// Install from preview modal
	function installFromPreview() {
		if (previewPreset) {
			installPreset(previewPreset);
			closePreview();
		}
	}

	// Get action type label
	function getActionTypeLabel(type: string): string {
		switch (type) {
			case 'send_text':
				return 'Send Text';
			case 'send_keys':
				return 'Send Keys';
			case 'tmux_command':
				return 'Tmux Command';
			case 'signal':
				return 'Signal';
			case 'notify_only':
				return 'Notify';
			default:
				return type;
		}
	}

	// Get pattern mode label
	function getPatternModeLabel(mode: string): string {
		return mode === 'regex' ? 'Regex' : 'String';
	}
</script>

<div class="presets-picker {className}" class:compact>
	<!-- Header -->
	<header class="picker-header">
		<div class="header-title">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="header-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
				/>
			</svg>
			<span>Preset Library</span>
			<span class="preset-count">
				{installedPresets.size} / {AUTOMATION_PRESETS.length} installed
			</span>
		</div>
	</header>

	<!-- Categories -->
	<div class="categories-container">
		{#each categories as category}
			{@const meta = RULE_CATEGORY_META[category]}
			{@const stats = getCategoryStats(category)}
			{@const presets = presetsByCategory[category]}

			{#if presets.length > 0}
				<div class="category-section" transition:slide={{ duration: 150 }}>
					<!-- Category header -->
					<div class="category-header">
						<div class="category-info">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="category-icon {meta.color}"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={meta.icon} />
							</svg>
							<span class="category-name">{meta.label}</span>
							<span class="category-stats">
								{stats.installed}/{stats.total}
							</span>
						</div>
						<p class="category-description">{meta.description}</p>
					</div>

					<!-- Preset cards -->
					<div class="presets-grid">
						{#each presets as preset (preset.id)}
							{@const isInstalled = installedPresets.has(preset.id)}
							<div
								class="preset-card"
								class:installed={isInstalled}
								transition:fly={{ y: 10, duration: 150 }}
							>
								<div class="preset-content">
									<div class="preset-header">
										<h4 class="preset-name">{preset.name}</h4>
										{#if isInstalled}
											<span class="installed-badge">
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
														d="M4.5 12.75l6 6 9-13.5"
													/>
												</svg>
												Installed
											</span>
										{/if}
									</div>

									<p class="preset-description">{preset.description}</p>

									<div class="preset-meta">
										<span class="meta-item">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="w-3 h-3"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
												/>
											</svg>
											{preset.rule.patterns.length} pattern{preset.rule.patterns.length !== 1
												? 's'
												: ''}
										</span>
										<span class="meta-item">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="w-3 h-3"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
												/>
											</svg>
											{preset.rule.actions.length} action{preset.rule.actions.length !== 1
												? 's'
												: ''}
										</span>
									</div>
								</div>

								<div class="preset-actions">
									<button class="preview-btn" onclick={() => showPreview(preset)} title="Preview rules">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="w-4 h-4"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
											/>
										</svg>
									</button>

									<button
										class="install-btn"
										class:uninstall={isInstalled}
										onclick={() => togglePreset(preset)}
										title={isInstalled ? 'Uninstall' : 'Install'}
									>
										{#if isInstalled}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="w-4 h-4"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
												/>
											</svg>
											Remove
										{:else}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="w-4 h-4"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
												/>
											</svg>
											Install
										{/if}
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>

<!-- Preview Modal -->
{#if showPreviewModal && previewPreset}
	<div
		class="modal-overlay"
		onclick={closePreview}
		onkeydown={(e) => e.key === 'Escape' && closePreview()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="preview-title"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			transition:fly={{ y: 20, duration: 200 }}
		>
			<!-- Modal Header -->
			<header class="modal-header">
				<div class="modal-title-row">
					<h3 id="preview-title" class="modal-title">{previewPreset.name}</h3>
					<span class="modal-category-badge {RULE_CATEGORY_META[previewPreset.category].color}">
						{RULE_CATEGORY_META[previewPreset.category].label}
					</span>
				</div>
				<button class="modal-close" onclick={closePreview} aria-label="Close">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-5 h-5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</header>

			<!-- Modal Body -->
			<div class="modal-body">
				<p class="modal-description">{previewPreset.description}</p>

				<!-- Patterns Section -->
				<section class="preview-section">
					<h4 class="section-title">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
							/>
						</svg>
						Patterns ({previewPreset.rule.patterns.length})
					</h4>
					<div class="patterns-list">
						{#each previewPreset.rule.patterns as pattern, i}
							<div class="pattern-item">
								<span class="pattern-mode-badge">
									{getPatternModeLabel(pattern.mode)}
								</span>
								<code class="pattern-code">{pattern.pattern}</code>
								{#if pattern.caseSensitive}
									<span class="case-badge">Case Sensitive</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Actions Section -->
				<section class="preview-section">
					<h4 class="section-title">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
							/>
						</svg>
						Actions ({previewPreset.rule.actions.length})
					</h4>
					<div class="actions-list">
						{#each previewPreset.rule.actions as action, i}
							<div class="action-item">
								<span class="action-type-badge">{getActionTypeLabel(action.type)}</span>
								<code class="action-payload">{action.payload}</code>
								{#if action.delay}
									<span class="delay-badge">{action.delay}ms delay</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Settings Section -->
				<section class="preview-section">
					<h4 class="section-title">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
						Settings
					</h4>
					<div class="settings-grid">
						<div class="setting-item">
							<span class="setting-label">Cooldown</span>
							<span class="setting-value">{previewPreset.rule.cooldownSeconds}s</span>
						</div>
						<div class="setting-item">
							<span class="setting-label">Max Triggers</span>
							<span class="setting-value">
								{previewPreset.rule.maxTriggersPerSession === 0
									? 'Unlimited'
									: previewPreset.rule.maxTriggersPerSession}
							</span>
						</div>
						<div class="setting-item">
							<span class="setting-label">Priority</span>
							<span class="setting-value">{previewPreset.rule.priority}</span>
						</div>
						<div class="setting-item">
							<span class="setting-label">Default State</span>
							<span class="setting-value {previewPreset.rule.enabled ? 'enabled' : 'disabled'}">
								{previewPreset.rule.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</div>
					</div>
				</section>
			</div>

			<!-- Modal Footer -->
			<footer class="modal-footer">
				<button class="cancel-btn" onclick={closePreview}> Close </button>
				{#if installedPresets.has(previewPreset.id)}
					<button class="uninstall-btn" onclick={() => { uninstallPreset(previewPreset); closePreview(); }}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
							/>
						</svg>
						Remove Preset
					</button>
				{:else}
					<button class="install-modal-btn" onclick={installFromPreview}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-4 h-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
							/>
						</svg>
						Install Preset
					</button>
				{/if}
			</footer>
		</div>
	</div>
{/if}

<style>
	.presets-picker {
		display: flex;
		flex-direction: column;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 10px;
		overflow: hidden;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.header-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.65 0.10 280);
	}

	.preset-count {
		font-size: 0.7rem;
		font-weight: 400;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.5rem;
		border-radius: 10px;
	}

	.categories-container {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-height: 600px;
		overflow-y: auto;
	}

	.category-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.category-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.category-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.category-icon {
		width: 16px;
		height: 16px;
	}

	.category-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.category-stats {
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
		background: oklch(0.22 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 8px;
		font-family: ui-monospace, monospace;
	}

	.category-description {
		font-size: 0.7rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		padding-left: 1.5rem;
	}

	.presets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.75rem;
	}

	.preset-card {
		display: flex;
		flex-direction: column;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
		overflow: hidden;
		transition: all 0.15s ease;
	}

	.preset-card:hover {
		border-color: oklch(0.35 0.02 250);
		background: oklch(0.22 0.02 250);
	}

	.preset-card.installed {
		border-color: oklch(0.40 0.10 145);
		background: oklch(0.20 0.04 145);
	}

	.preset-content {
		flex: 1;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.preset-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.preset-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.installed-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6rem;
		font-weight: 500;
		color: oklch(0.75 0.15 145);
		background: oklch(0.25 0.08 145);
		padding: 0.125rem 0.375rem;
		border-radius: 6px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.preset-description {
		font-size: 0.7rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
		line-height: 1.4;
	}

	.preset-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: auto;
		padding-top: 0.5rem;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.65rem;
		color: oklch(0.50 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.preset-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.18 0.02 250);
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.preview-btn,
	.install-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.7rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.preview-btn {
		background: oklch(0.24 0.02 250);
		border: 1px solid oklch(0.32 0.02 250);
		color: oklch(0.70 0.02 250);
	}

	.preview-btn:hover {
		background: oklch(0.28 0.02 250);
		border-color: oklch(0.38 0.02 250);
		color: oklch(0.85 0.02 250);
	}

	.install-btn {
		flex: 1;
		background: oklch(0.35 0.10 200);
		border: 1px solid oklch(0.45 0.12 200);
		color: oklch(0.95 0.02 250);
	}

	.install-btn:hover {
		background: oklch(0.40 0.12 200);
		border-color: oklch(0.50 0.14 200);
	}

	.install-btn.uninstall {
		background: oklch(0.30 0.08 25);
		border-color: oklch(0.40 0.10 25);
		color: oklch(0.90 0.02 250);
	}

	.install-btn.uninstall:hover {
		background: oklch(0.35 0.10 25);
		border-color: oklch(0.45 0.12 25);
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.10 0.02 250 / 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	.modal-content {
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 12px;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 50px oklch(0 0 0 / 0.4);
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.28 0.02 250);
		gap: 1rem;
	}

	.modal-title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.modal-category-badge {
		font-size: 0.65rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		border-radius: 6px;
		background: oklch(0.25 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.modal-close {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.modal-close:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.modal-description {
		font-size: 0.8rem;
		color: oklch(0.65 0.02 250);
		margin: 0;
		line-height: 1.5;
	}

	.preview-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.70 0.02 250);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.patterns-list,
	.actions-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.pattern-item,
	.action-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		background: oklch(0.14 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 6px;
		flex-wrap: wrap;
	}

	.pattern-mode-badge,
	.action-type-badge {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: oklch(0.30 0.08 200);
		color: oklch(0.85 0.10 200);
	}

	.action-type-badge {
		background: oklch(0.30 0.08 280);
		color: oklch(0.85 0.10 280);
	}

	.pattern-code,
	.action-payload {
		flex: 1;
		font-size: 0.7rem;
		font-family: ui-monospace, monospace;
		color: oklch(0.75 0.10 55);
		word-break: break-all;
	}

	.case-badge,
	.delay-badge {
		font-size: 0.55rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		background: oklch(0.25 0.02 250);
		color: oklch(0.60 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem;
		background: oklch(0.14 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 6px;
	}

	.setting-label {
		font-size: 0.6rem;
		font-weight: 500;
		color: oklch(0.50 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.setting-value {
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.setting-value.enabled {
		color: oklch(0.75 0.15 145);
	}

	.setting-value.disabled {
		color: oklch(0.60 0.10 25);
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid oklch(0.28 0.02 250);
		background: oklch(0.15 0.02 250);
	}

	.cancel-btn,
	.uninstall-btn,
	.install-modal-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.cancel-btn {
		background: oklch(0.24 0.02 250);
		border: 1px solid oklch(0.32 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.cancel-btn:hover {
		background: oklch(0.28 0.02 250);
		border-color: oklch(0.38 0.02 250);
	}

	.uninstall-btn {
		background: oklch(0.35 0.10 25);
		border: 1px solid oklch(0.45 0.12 25);
		color: oklch(0.95 0.02 250);
	}

	.uninstall-btn:hover {
		background: oklch(0.40 0.12 25);
		border-color: oklch(0.50 0.14 25);
	}

	.install-modal-btn {
		background: oklch(0.40 0.12 145);
		border: 1px solid oklch(0.50 0.14 145);
		color: oklch(0.98 0.02 250);
	}

	.install-modal-btn:hover {
		background: oklch(0.45 0.14 145);
		border-color: oklch(0.55 0.16 145);
	}

	/* Compact mode */
	.presets-picker.compact .categories-container {
		max-height: 400px;
	}

	.presets-picker.compact .presets-grid {
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	}

	.presets-picker.compact .preset-description {
		display: none;
	}

	/* Category colors */
	.text-success {
		color: oklch(0.70 0.15 145);
	}

	.text-info {
		color: oklch(0.70 0.15 200);
	}

	.text-warning {
		color: oklch(0.75 0.15 85);
	}

	.text-secondary {
		color: oklch(0.70 0.12 280);
	}

	.text-accent {
		color: oklch(0.75 0.15 310);
	}
</style>
