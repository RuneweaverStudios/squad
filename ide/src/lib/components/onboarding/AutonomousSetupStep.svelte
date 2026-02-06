<script lang="ts">
	/**
	 * AutonomousSetupStep - Configure autonomous (YOLO) mode during onboarding
	 *
	 * Simplified version of the DefaultsEditor autonomous mode section.
	 * Lets users enable --dangerously-skip-permissions for Claude and --full-auto for Codex
	 * so agents can run without permission prompts.
	 */

	import { onMount } from 'svelte';

	let { onComplete, disabled = false }: { onComplete: () => void; disabled?: boolean } = $props();

	let loading = $state(true);
	let skipPermissions = $state(false);
	let launchingYolo = $state(false);
	let savingToggle = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let yoloManualCommand = $state<string | null>(null);

	onMount(() => {
		loadCurrentState();
	});

	async function loadCurrentState() {
		loading = true;
		try {
			const response = await fetch('/api/config/defaults');
			const data = await response.json();
			if (response.ok) {
				skipPermissions = data.defaults?.skip_permissions ?? false;
				if (skipPermissions) {
					onComplete();
				}
			}
		} catch {
			// Non-critical, defaults to false
		} finally {
			loading = false;
		}
	}

	async function launchYoloSession() {
		launchingYolo = true;
		error = null;
		yoloManualCommand = null;

		let response: Response;
		try {
			response = await fetch('/api/sessions/yolo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
		} catch {
			error = 'Could not connect to the IDE server.';
			yoloManualCommand = 'claude --dangerously-skip-permissions';
			launchingYolo = false;
			return;
		}

		let data: Record<string, unknown>;
		try {
			data = await response.json();
		} catch {
			error = `Server error (${response.status}).`;
			yoloManualCommand = 'claude --dangerously-skip-permissions';
			launchingYolo = false;
			return;
		}

		if (!response.ok) {
			error = (data.message as string) || (data.error as string) || 'Failed to launch session';
			yoloManualCommand = (data.manualCommand as string) || 'claude --dangerously-skip-permissions';
			launchingYolo = false;
			return;
		}

		if (data.manualAttach) {
			yoloManualCommand = (data.manualCommand as string) || null;
			launchingYolo = false;
			return;
		}

		success = 'Claude session launched! Accept the warning in your terminal, then enable the toggle below.';
		setTimeout(() => { success = null; }, 8000);
		launchingYolo = false;
	}

	async function handleToggle(event: Event) {
		const checkbox = event.target as HTMLInputElement;
		const newValue = checkbox.checked;
		skipPermissions = newValue;
		savingToggle = true;
		error = null;

		try {
			const response = await fetch('/api/config/defaults', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					defaults: { skip_permissions: newValue }
				})
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Failed to save setting');
			}

			if (newValue) {
				success = 'Autonomous mode enabled!';
				setTimeout(() => { success = null; }, 3000);
				onComplete();
			}
		} catch (err) {
			skipPermissions = !newValue;
			error = err instanceof Error ? err.message : 'Failed to save setting';
		} finally {
			savingToggle = false;
		}
	}

	function handleSkip() {
		onComplete();
	}
</script>

<div class="space-y-4" style="opacity: {disabled ? 0.4 : 1}; pointer-events: {disabled ? 'none' : 'auto'};">
	{#if loading}
		<div class="flex items-center gap-2 py-2">
			<div
				class="w-4 h-4 rounded-full border-2 animate-spin"
				style="border-color: oklch(0.30 0.02 250); border-top-color: oklch(0.65 0.15 200);"
			></div>
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">Checking current settings...</span>
		</div>
	{:else if skipPermissions}
		<!-- Already enabled -->
		<div
			class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
			style="background: oklch(0.20 0.06 145 / 0.15); border: 1px solid oklch(0.40 0.12 145 / 0.3);"
		>
			<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.65 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span class="text-xs font-mono" style="color: oklch(0.70 0.12 145);">
				Autonomous mode is <strong>enabled</strong>. Agents run without permission prompts.
			</span>
		</div>
	{:else}
		<!-- Setup flow -->
		<p class="text-sm" style="color: oklch(0.60 0.02 250);">
			Autonomous mode lets agents execute commands without asking for permission each time.
			This is <strong style="color: oklch(0.75 0.02 250);">recommended</strong> for a smooth multi-agent experience.
		</p>

		<!-- Warning + explanation -->
		<div
			class="flex gap-2.5 px-3 py-2.5 rounded-lg"
			style="background: oklch(0.20 0.08 45 / 0.25); border: 1px solid oklch(0.40 0.12 45 / 0.4);"
		>
			<svg class="w-5 h-5 flex-shrink-0 mt-0.5" style="color: oklch(0.70 0.18 45);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M13 10V3L4 14h7v7l9-11h-7z"/>
			</svg>
			<div class="text-xs leading-relaxed" style="color: oklch(0.65 0.02 250);">
				<strong style="color: oklch(0.80 0.10 45);">How it works:</strong>
				Passes <code class="px-1 py-0.5 rounded text-[10px]" style="background: oklch(0.14 0.02 250);">--dangerously-skip-permissions</code> to Claude
				and <code class="px-1 py-0.5 rounded text-[10px]" style="background: oklch(0.14 0.02 250);">--full-auto</code> to Codex.
				You must accept Claude's one-time permissions warning first.
			</div>
		</div>

		<!-- Status messages -->
		{#if error}
			<div
				class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
				style="background: oklch(0.25 0.08 25); border: 1px solid oklch(0.40 0.12 25); color: oklch(0.85 0.10 25);"
			>
				<svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		{#if success}
			<div
				class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
				style="background: oklch(0.25 0.08 145); border: 1px solid oklch(0.40 0.12 145); color: oklch(0.85 0.10 145);"
			>
				<svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<span>{success}</span>
			</div>
		{/if}

		{#if yoloManualCommand}
			<div
				class="px-3 py-2 rounded-lg space-y-1"
				style="background: oklch(0.14 0.02 250); border: 1px solid oklch(0.28 0.02 250);"
			>
				<span class="text-[11px]" style="color: oklch(0.55 0.02 250);">Run this in your terminal instead:</span>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<code
					class="block px-2 py-1.5 rounded text-xs font-mono cursor-pointer select-all"
					style="background: oklch(0.10 0.02 250); border: 1px solid oklch(0.25 0.02 250); color: oklch(0.85 0.10 200);"
					onclick={(e) => {
						const el = e.currentTarget as HTMLElement;
						const range = document.createRange();
						range.selectNodeContents(el);
						const sel = window.getSelection();
						sel?.removeAllRanges();
						sel?.addRange(range);
					}}
				>{yoloManualCommand}</code>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex items-center gap-3">
			<!-- Launch button -->
			<button
				class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer"
				style="
					background: oklch(0.45 0.12 45);
					border: 1px solid oklch(0.55 0.15 45);
					color: oklch(0.98 0.02 45);
				"
				onmouseenter={(e) => { e.currentTarget.style.background = 'oklch(0.50 0.15 45)'; }}
				onmouseleave={(e) => { e.currentTarget.style.background = 'oklch(0.45 0.12 45)'; }}
				onclick={launchYoloSession}
				disabled={launchingYolo || disabled}
			>
				{#if launchingYolo}
					<div
						class="w-3.5 h-3.5 rounded-full border-2 animate-spin"
						style="border-color: oklch(0.98 0.02 45 / 0.3); border-top-color: oklch(0.98 0.02 45);"
					></div>
					Launching...
				{:else}
					<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M5 3l14 9-14 9V3z"/>
					</svg>
					Accept Warning in Terminal
				{/if}
			</button>

			<!-- Toggle -->
			<label class="flex items-center gap-2 cursor-pointer">
				<input
					type="checkbox"
					class="toggle toggle-sm toggle-warning"
					checked={skipPermissions}
					onchange={handleToggle}
					disabled={savingToggle || disabled}
				/>
				<span class="text-xs font-mono" style="color: oklch(0.65 0.02 250);">
					Enable
					{#if savingToggle}
						<span
							class="ml-1 px-1.5 py-0.5 rounded text-[10px]"
							style="color: oklch(0.85 0.15 200); background: oklch(0.30 0.08 200 / 0.5);"
						>Saving...</span>
					{/if}
				</span>
			</label>
		</div>

		<!-- Skip option -->
		<button
			class="text-[11px] font-mono transition-colors hover:underline cursor-pointer"
			style="color: oklch(0.45 0.02 250);"
			onclick={handleSkip}
			disabled={disabled}
		>
			Skip &mdash; I'll configure this later in Settings
		</button>
	{/if}
</div>
