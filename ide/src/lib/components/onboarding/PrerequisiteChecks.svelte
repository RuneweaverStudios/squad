<script lang="ts">
	import type { PrerequisiteResult } from '$lib/stores/onboardingStore.svelte';

	let {
		checks = null,
		loading = false,
		onRecheck
	}: {
		checks: PrerequisiteResult[] | null;
		loading: boolean;
		onRecheck?: () => void;
	} = $props();

	const allRequiredPassed = $derived(
		checks ? checks.filter(c => c.required).every(c => c.installed) : false
	);
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3
			class="text-xs font-mono font-semibold uppercase tracking-wider"
			style="color: oklch(0.55 0.02 250);"
		>
			System Requirements
		</h3>
		{#if checks && !loading}
			<button
				class="text-[10px] font-mono uppercase tracking-wider transition-colors hover:underline"
				style="color: oklch(0.55 0.12 240);"
				onclick={onRecheck}
			>
				Re-check
			</button>
		{/if}
	</div>

	{#if loading}
		<div class="grid grid-cols-3 gap-2">
			{#each Array(6) as _}
				<div class="skeleton h-12 rounded-lg" style="background: oklch(0.22 0.01 250);"></div>
			{/each}
		</div>
	{:else if checks}
		<div class="grid grid-cols-3 gap-2">
			{#each checks as check}
				{@const passed = check.installed}
				{@const isOptional = !check.required}
				<div
					class="rounded-lg px-3 py-2.5 flex items-center gap-2 transition-all"
					style="
						background: {passed
							? 'oklch(0.20 0.06 145 / 0.15)'
							: isOptional
								? 'oklch(0.22 0.04 85 / 0.15)'
								: 'oklch(0.22 0.06 25 / 0.15)'};
						border: 1px solid {passed
							? 'oklch(0.40 0.12 145 / 0.4)'
							: isOptional
								? 'oklch(0.40 0.10 85 / 0.4)'
								: 'oklch(0.40 0.12 25 / 0.4)'};
					"
					title={passed ? `${check.name} ${check.version}` : check.fixHint}
				>
					<!-- Status icon -->
					{#if passed}
						<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.65 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{:else if isOptional}
						<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.65 0.15 85);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
						</svg>
					{:else}
						<svg class="w-4 h-4 flex-shrink-0" style="color: oklch(0.65 0.18 25);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{/if}

					<div class="min-w-0">
						<div class="font-mono text-xs font-semibold truncate" style="color: oklch(0.80 0.02 250);">
							{check.name}
						</div>
						{#if check.version}
							<div class="font-mono text-[10px] truncate" style="color: oklch(0.50 0.02 250);">
								{check.version}
							</div>
						{:else if isOptional}
							<div class="font-mono text-[10px]" style="color: oklch(0.55 0.10 85);">
								optional
							</div>
						{:else}
							<div class="font-mono text-[10px]" style="color: oklch(0.60 0.15 25);">
								missing
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Summary -->
		{#if allRequiredPassed}
			<div
				class="flex items-center gap-2 px-3 py-2 rounded-lg"
				style="background: oklch(0.20 0.06 145 / 0.1); border: 1px solid oklch(0.40 0.12 145 / 0.3);"
			>
				<svg class="w-4 h-4" style="color: oklch(0.65 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span class="text-xs font-mono" style="color: oklch(0.70 0.12 145);">
					All required tools are installed
				</span>
			</div>
		{:else}
			{@const missingList = checks.filter(c => c.required && !c.installed)}
			<div
				class="px-3 py-2 rounded-lg"
				style="background: oklch(0.22 0.06 25 / 0.1); border: 1px solid oklch(0.40 0.12 25 / 0.3);"
			>
				<p class="text-xs font-mono mb-1.5" style="color: oklch(0.70 0.15 25);">
					Missing required tools. Run each one-liner (or copy all):
				</p>
				<pre
					class="text-[11px] px-2 py-2 rounded font-mono overflow-x-auto whitespace-pre-wrap break-all"
					style="background: oklch(0.18 0.01 250); color: oklch(0.85 0.02 250); border: 1px solid oklch(0.28 0.02 250);"
				><code>{missingList.map(m => m.fixHint).join('\n')}</code></pre>
				{#each missingList as missing}
					<p class="text-[10px] font-mono mt-1.5 flex items-center gap-1.5" style="color: oklch(0.55 0.02 250);">
						<span>{missing.name}:</span>
						<code
							class="text-[11px] px-1.5 py-0.5 rounded font-mono flex-1 min-w-0 truncate"
							style="background: oklch(0.18 0.01 250); color: oklch(0.75 0.12 200);"
							title={missing.fixHint}
						>
							{missing.fixHint}
						</code>
					</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>
