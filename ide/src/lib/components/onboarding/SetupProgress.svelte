<script lang="ts">
	let { currentStep = 1 }: { currentStep: number } = $props();

	const steps = [
		{ num: 1, label: 'Prerequisites', subtitle: 'Required tools' },
		{ num: 2, label: 'Agent Harness', subtitle: 'AI coding tools' },
		{ num: 3, label: 'Add Project', subtitle: 'Your codebase' },
		{ num: 4, label: 'First Task', subtitle: 'Something to do' },
		{ num: 5, label: 'Autonomous', subtitle: 'YOLO mode' }
	];
</script>

<div class="flex items-center justify-center gap-0">
	{#each steps as step, i}
		{@const isComplete = currentStep > step.num}
		{@const isActive = currentStep === step.num}
		{@const isFuture = currentStep < step.num}

		<!-- Step circle + label -->
		<div class="flex flex-col items-center gap-1.5">
			<div
				class="w-9 h-9 rounded-full flex items-center justify-center font-mono text-sm font-bold transition-all duration-300"
				style="
					background: {isComplete ? 'oklch(0.40 0.15 145)' : isActive ? 'oklch(0.35 0.15 240)' : 'oklch(0.22 0.01 250)'};
					border: 2px solid {isComplete ? 'oklch(0.55 0.18 145)' : isActive ? 'oklch(0.55 0.18 240)' : 'oklch(0.35 0.02 250)'};
					color: {isFuture ? 'oklch(0.45 0.02 250)' : 'oklch(0.95 0.02 250)'};
					box-shadow: {isActive ? '0 0 12px oklch(0.55 0.18 240 / 0.4)' : 'none'};
				"
			>
				{#if isComplete}
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				{:else}
					{step.num}
				{/if}
			</div>
			<span
				class="text-[10px] font-mono uppercase tracking-wider transition-colors duration-300"
				style="color: {isComplete ? 'oklch(0.65 0.12 145)' : isActive ? 'oklch(0.75 0.12 240)' : 'oklch(0.45 0.02 250)'};"
			>
				{step.label}
			</span>
			<span
				class="text-[9px] transition-colors duration-300"
				style="color: {isComplete ? 'oklch(0.55 0.06 145)' : isActive ? 'oklch(0.55 0.06 240)' : 'oklch(0.38 0.02 250)'};"
			>
				{step.subtitle}
			</span>
		</div>

		<!-- Connector line between steps -->
		{#if i < steps.length - 1}
			<div
				class="w-10 h-0.5 mt-[-1rem] mx-1 rounded transition-all duration-300"
				style="background: {isComplete ? 'oklch(0.50 0.15 145)' : 'oklch(0.30 0.02 250)'};"
			></div>
		{/if}
	{/each}
</div>
