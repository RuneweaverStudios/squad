<script lang="ts">
	const features = [
		{
			title: 'Multi-Project IDE',
			description: 'See all your repositories in one view. Filter by project, priority, or status. No more switching between tools.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>`,
			color: 'var(--color-primary)'
		},
		{
			title: 'Epics & Dependencies',
			description: 'Break features into tasks with real dependency tracking. Agents automatically pick work that\'s ready&mdash;no blocked tasks.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>`,
			color: 'var(--color-success)'
		},
		{
			title: 'PRD to Tasks',
			description: 'Paste a product spec, run /squad:tasktree. Get a complete task tree with priorities and dependencies in seconds.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`,
			color: 'var(--color-warning)'
		},
		{
			title: 'Batch Agent Spawning',
			description: 'Launch 4, 10, or 40 agents with one command. They register, pick tasks, and start working automatically.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`,
			color: 'var(--color-secondary)'
		},
		{
			title: 'Smart Question UI',
			description: 'When agents need input, questions surface in the IDE. Click to answer&mdash;no hunting through terminals.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
			color: 'var(--color-primary)'
		},
		{
			title: 'Git-Backed Everything',
			description: 'Tasks stored in JSONL, committed to your repo. No external services. Full version control. Works offline.',
			icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`,
			color: 'var(--color-success)'
		}
	];
</script>

<section id="features" class="py-32 bg-[var(--bg-surface)]/50">
	<div class="max-w-6xl mx-auto px-6">
		<!-- Section header -->
		<div class="text-center mb-16">
			<h2 class="heading-lg text-white mb-4">Built for How Teams Actually Work</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				Not another AI wrapper. A complete development environment with task management, multi-project support, and agent orchestration baked in.
			</p>
		</div>

		<!-- Features grid -->
		<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each features as feature, i}
				<div
					class="feature-card gradient-border p-6 group cursor-default"
					style="animation-delay: {i * 100}ms"
				>
					<!-- Icon -->
					<div
						class="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110"
						style="background: {feature.color}15; color: {feature.color}"
					>
						{@html feature.icon}
					</div>

					<!-- Content -->
					<h3 class="text-lg font-semibold text-white mb-2 group-hover:text-glow transition-all">
						{feature.title}
					</h3>
					<p class="text-gray-400 text-sm leading-relaxed">
						{feature.description}
					</p>
				</div>
			{/each}
		</div>

		<!-- Callout -->
		<div class="mt-16 p-8 rounded-2xl bg-gradient-to-r from-[var(--color-primary)]/10 to-[var(--color-secondary)]/10 border border-[var(--color-primary)]/20">
			<div class="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
				<div class="flex-1">
					<h3 class="text-xl font-semibold text-white mb-2">The Framework You've Been Missing</h3>
					<p class="text-gray-400">
						Other tools give you a chat window. SQUAD gives you a system&mdash;backlogs, priorities, dependencies, coordination&mdash;everything you need to run AI development like a real engineering org.
					</p>
				</div>
				<a href="#workflow" class="btn btn-primary btn-glow rounded-full px-6 shrink-0">
					See the workflow
				</a>
			</div>
		</div>
	</div>
</section>
