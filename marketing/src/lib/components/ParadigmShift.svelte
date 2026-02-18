<script lang="ts">
	const problems = [
		{
			title: 'The Terminal Trap',
			description: 'One agent. One terminal. One task. Start over for each request. No history, no structure, no scale.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`,
		},
		{
			title: 'Context Chaos',
			description: 'Juggling 5 projects? That\'s 5 terminals, 5 contexts, 5 chances to lose track of what\'s done.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path></svg>`,
		},
		{
			title: 'No Team Workflow',
			description: 'Where\'s the backlog? The priorities? The dependencies? AI coding shouldn\'t mean abandoning best practices.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`,
		}
	];

	const solutions = [
		{
			title: 'Epics & Tasks',
			description: 'PRD to epic to tasks with dependencies. The same hierarchy your team already uses.',
			color: 'var(--color-primary)'
		},
		{
			title: 'Multi-Project',
			description: 'All your repositories in one IDE. Filter, prioritize, assign across everything.',
			color: 'var(--color-success)'
		},
		{
			title: 'Scale to 40+',
			description: 'Launch agents in batches. They pick ready tasks automatically. You supervise.',
			color: 'var(--color-warning)'
		}
	];
</script>

<section id="paradigm" class="py-32 relative">
	<div class="max-w-6xl mx-auto px-6">
		<!-- Section header -->
		<div class="text-center mb-16">
			<h2 class="heading-lg text-white mb-4">The Problem with AI Coding Today</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				Everyone's excited about AI coding. But the tools treat it like a toy, not a team workflow.
			</p>
		</div>

		<!-- Problems -->
		<div class="grid md:grid-cols-3 gap-6 mb-20">
			{#each problems as problem}
				<div class="p-6 rounded-xl bg-[var(--bg-surface)]/50 border border-red-500/20">
					<div class="w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-red-500/10 text-red-400">
						{@html problem.icon}
					</div>
					<h3 class="text-lg font-semibold text-white mb-2">{problem.title}</h3>
					<p class="text-gray-400 text-sm">{problem.description}</p>
				</div>
			{/each}
		</div>

		<!-- Arrow -->
		<div class="flex justify-center mb-16">
			<div class="flex flex-col items-center gap-2">
				<span class="text-sm text-gray-500 font-medium">SQUAD changes this</span>
				<svg class="w-8 h-8 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
				</svg>
			</div>
		</div>

		<!-- Solutions -->
		<div class="gradient-border p-8">
			<div class="text-center mb-8">
				<h3 class="heading-md text-white mb-2">Structure That Scales</h3>
				<p class="text-gray-400">Real project management meets AI-powered execution</p>
			</div>

			<div class="grid md:grid-cols-3 gap-8">
				{#each solutions as solution}
					<div class="text-center">
						<div
							class="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
							style="background: {solution.color}20; border: 2px solid {solution.color}40"
						>
							<div class="w-3 h-3 rounded-full" style="background: {solution.color}"></div>
						</div>
						<h4 class="text-lg font-semibold text-white mb-2">{solution.title}</h4>
						<p class="text-gray-400 text-sm">{solution.description}</p>
					</div>
				{/each}
			</div>
		</div>

		<!-- The key insight -->
		<div class="mt-16 text-center">
			<p class="text-xl text-gray-300 max-w-3xl mx-auto">
				<span class="text-white font-semibold">This isn't about replacing developers.</span>
				It's about giving teams a framework to harness AI at scale&mdash;with the same rigor they apply to everything else.
			</p>
		</div>
	</div>
</section>
