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

<div class="flex flex-col rounded-[10px] overflow-hidden bg-base-200 border border-base-300 {className}">
	<!-- Header -->
	<header class="flex items-center justify-between py-3 px-4 bg-base-300 border-b border-base-300">
		<div class="flex items-center gap-2 text-sm font-semibold text-base-content font-mono">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="w-[18px] h-[18px] text-secondary"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
				/>
			</svg>
			<span>Preset Library</span>
			<span class="text-[0.7rem] font-normal text-base-content/50 py-0.5 px-2 rounded-[10px] bg-base-100">
				{installedPresets.size} / {AUTOMATION_PRESETS.length} installed
			</span>
		</div>
	</header>

	<!-- Categories -->
	<div class="p-4 flex flex-col gap-6 max-h-[600px] overflow-y-auto">
		{#each categories as category, categoryIndex}
			{@const meta = RULE_CATEGORY_META[category]}
			{@const stats = getCategoryStats(category)}
			{@const presets = presetsByCategory[category]}

			{#if presets.length > 0}
				<div class="flex flex-col gap-3 fade-in-left fade-in-delay-{Math.min(categoryIndex, 12)}" transition:slide={{ duration: 150 }}>
					<!-- Category header -->
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="w-4 h-4 {meta.color}"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={meta.icon} />
							</svg>
							<span class="text-sm font-semibold text-base-content/80 font-mono">{meta.label}</span>
							<span class="text-[0.65rem] text-base-content/50 py-0.5 px-1.5 rounded-lg font-mono bg-base-100">
								{stats.installed}/{stats.total}
							</span>
						</div>
						<p class="text-[0.7rem] text-base-content/50 m-0 pl-6">{meta.description}</p>
					</div>

					<!-- Preset cards -->
					<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));">
						{#each presets as preset, presetIndex (preset.id)}
							{@const isInstalled = installedPresets.has(preset.id)}
							<div
								class="flex flex-col rounded-lg overflow-hidden transition-all duration-150 bg-base-100 border border-base-300 hover:border-base-content/30 hover:bg-base-100/80 fade-in fade-in-delay-{Math.min(presetIndex, 12)} {isInstalled ? 'border-success/40 !bg-success/5' : ''}"
								transition:fly={{ y: 10, duration: 150 }}
							>
								<div class="flex-1 p-3 flex flex-col gap-2">
									<div class="flex items-center justify-between gap-2">
										<h4 class="text-sm font-semibold text-base-content m-0 font-mono">{preset.name}</h4>
										{#if isInstalled}
											<span class="flex items-center gap-1 text-[0.6rem] font-medium py-0.5 px-1.5 rounded-md uppercase tracking-wide text-success bg-success/20">
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

									<p class="text-[0.7rem] text-base-content/60 m-0 leading-relaxed">{preset.description}</p>

									<div class="flex items-center gap-3 mt-auto pt-2">
										<span class="flex items-center gap-1.5 text-[0.65rem] text-base-content/50 font-mono">
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
										<span class="flex items-center gap-1.5 text-[0.65rem] text-base-content/50 font-mono">
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

								<div class="flex items-center gap-1 px-3 py-2 bg-base-200/50 border-t border-base-300">
									<button class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent border-none text-base-content/50 cursor-pointer transition-all duration-150 hover:bg-base-300 hover:text-base-content" onclick={() => showPreview(preset)} title="Preview rules">
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
										class="flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[0.7rem] font-mono font-medium cursor-pointer transition-all duration-150 ml-auto {isInstalled ? 'bg-error/20 border border-error/30 text-error hover:bg-error/30' : 'bg-success/20 border border-success/30 text-success hover:bg-success/30'}"
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
		class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-base-300/85"
		onclick={closePreview}
		onkeydown={(e) => e.key === 'Escape' && closePreview()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="preview-title"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="flex flex-col w-full max-w-[550px] rounded-xl overflow-hidden bg-base-200 border border-base-300 shadow-2xl"
			style="max-height: calc(100vh - 2rem);"
			onclick={(e) => e.stopPropagation()}
			transition:fly={{ y: 20, duration: 200 }}
		>
			<!-- Modal Header -->
			<header class="flex items-center justify-between px-5 py-4 bg-base-300 border-b border-base-300">
				<div class="flex items-center gap-3">
					<h3 id="preview-title" class="text-base font-semibold text-base-content m-0 font-mono">{previewPreset.name}</h3>
					<span class="text-[0.65rem] font-medium py-0.5 px-2 rounded-md uppercase tracking-wide {RULE_CATEGORY_META[previewPreset.category].color} bg-base-100">
						{RULE_CATEGORY_META[previewPreset.category].label}
					</span>
				</div>
				<button class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent border-none text-base-content/50 cursor-pointer transition-all duration-150 hover:bg-base-100 hover:text-base-content/80" onclick={closePreview} aria-label="Close">
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
			<div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
				<p class="text-sm text-base-content/70 m-0 leading-relaxed">{previewPreset.description}</p>

				<!-- Patterns Section -->
				<section class="flex flex-col gap-3">
					<h4 class="flex items-center gap-2 text-xs font-semibold text-info uppercase tracking-wider font-mono m-0">
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
					<div class="flex flex-col gap-2">
						{#each previewPreset.rule.patterns as pattern, i}
							<div class="flex items-center gap-2 flex-wrap py-2 px-3 rounded-lg bg-base-100 border border-base-300">
								<span class="text-[0.6rem] font-medium py-0.5 px-1.5 rounded uppercase tracking-wide text-secondary bg-secondary/20">
									{getPatternModeLabel(pattern.mode)}
								</span>
								<code class="text-[0.7rem] font-mono text-warning break-all">{pattern.pattern}</code>
								{#if pattern.caseSensitive}
									<span class="text-[0.6rem] font-medium py-0.5 px-1.5 rounded uppercase tracking-wide text-info bg-info/20">Case Sensitive</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Actions Section -->
				<section class="flex flex-col gap-3">
					<h4 class="flex items-center gap-2 text-xs font-semibold text-info uppercase tracking-wider font-mono m-0">
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
					<div class="flex flex-col gap-2">
						{#each previewPreset.rule.actions as action, i}
							<div class="flex items-center gap-2 flex-wrap py-2 px-3 rounded-lg bg-base-100 border border-base-300">
								<span class="text-[0.6rem] font-medium py-0.5 px-1.5 rounded uppercase tracking-wide text-accent bg-accent/20">{getActionTypeLabel(action.type)}</span>
								<code class="text-[0.7rem] font-mono text-base-content/80 break-all">{action.payload}</code>
								{#if action.delay}
									<span class="text-[0.6rem] font-medium py-0.5 px-1.5 rounded uppercase tracking-wide text-warning bg-warning/20">{action.delay}ms delay</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Settings Section -->
				<section class="flex flex-col gap-3">
					<h4 class="flex items-center gap-2 text-xs font-semibold text-info uppercase tracking-wider font-mono m-0">
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
					<div class="grid grid-cols-2 gap-2">
						<div class="flex items-center justify-between py-2 px-3 rounded-lg bg-base-100 border border-base-300">
							<span class="text-[0.65rem] text-base-content/50 font-mono">Cooldown</span>
							<span class="text-xs font-medium text-base-content font-mono">{previewPreset.rule.cooldownSeconds}s</span>
						</div>
						<div class="flex items-center justify-between py-2 px-3 rounded-lg bg-base-100 border border-base-300">
							<span class="text-[0.65rem] text-base-content/50 font-mono">Max Triggers</span>
							<span class="text-xs font-medium text-base-content font-mono">
								{previewPreset.rule.maxTriggersPerSession === 0
									? 'Unlimited'
									: previewPreset.rule.maxTriggersPerSession}
							</span>
						</div>
						<div class="flex items-center justify-between py-2 px-3 rounded-lg bg-base-100 border border-base-300">
							<span class="text-[0.65rem] text-base-content/50 font-mono">Priority</span>
							<span class="text-xs font-medium text-base-content font-mono">{previewPreset.rule.priority}</span>
						</div>
						<div class="flex items-center justify-between py-2 px-3 rounded-lg bg-base-100 border border-base-300">
							<span class="text-[0.65rem] text-base-content/50 font-mono">Default State</span>
							<span class="text-xs font-medium font-mono {previewPreset.rule.enabled ? 'text-success' : 'text-error'}">
								{previewPreset.rule.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</div>
					</div>
				</section>
			</div>

			<!-- Modal Footer -->
			<footer class="flex justify-end gap-3 px-5 py-4 bg-base-300 border-t border-base-300">
				<button class="py-2 px-5 text-sm font-mono font-medium rounded-md cursor-pointer transition-all duration-150 bg-transparent border border-base-content/30 text-base-content/70 hover:bg-base-100 hover:border-base-content/40" onclick={closePreview}> Close </button>
				{#if installedPresets.has(previewPreset.id)}
					<button class="flex items-center gap-2 py-2 px-4 text-sm font-mono font-medium rounded-md cursor-pointer transition-all duration-150 bg-error/20 border border-error/30 text-error hover:bg-error/30" onclick={() => { if (previewPreset) uninstallPreset(previewPreset); closePreview(); }}>
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
					<button class="flex items-center gap-2 py-2 px-4 text-sm font-mono font-medium rounded-md cursor-pointer transition-all duration-150 bg-success border border-success text-success-content hover:brightness-110" onclick={installFromPreview}>
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
	/* All styling converted to inline Tailwind/DaisyUI classes for Tailwind v4 compatibility */
</style>
