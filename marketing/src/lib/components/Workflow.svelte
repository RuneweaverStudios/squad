<script lang="ts">
	const steps = [
		{
			number: '01',
			title: 'Define the Work',
			description: 'Start with a PRD, feature spec, or even a rough idea. Describe what you want to build in plain language.',
			code: `## User Authentication Feature

Users should be able to:
- Sign up with email/password
- Login with Google OAuth
- Reset forgotten passwords
- See their profile page`,
			highlight: 'PRD Ready',
			label: 'Input'
		},
		{
			number: '02',
			title: 'Generate Task Tree',
			description: 'Run /squad:tasktree to convert your spec into a structured epic with tasks, priorities, and dependencies.',
			code: `/squad:tasktree

Creating epic: "User Authentication"
├─ squad-a1: Setup Supabase auth config [P0]
├─ squad-a2: Create login/signup forms [P1]
│   └─ depends on: squad-a1
├─ squad-a3: Implement Google OAuth [P1]
│   └─ depends on: squad-a1
├─ squad-a4: Build password reset flow [P2]
│   └─ depends on: squad-a2
└─ squad-a5: Create profile page [P2]
    └─ depends on: squad-a2, squad-a3

5 tasks created with dependencies`,
			highlight: '5 Tasks',
			label: 'Structure'
		},
		{
			number: '03',
			title: 'Launch the Swarm',
			description: 'Spawn multiple agents across your projects. They pick ready tasks (no blocked work) and start automatically.',
			code: `squad myproject 4 --auto

Spawning 4 agents...
  BluePeak  → squad-a1 (Setup Supabase)
  GoldBay   → chimaro-b3 (Fix OAuth bug)
  RedMarsh  → squad-c2 (API endpoints)
  FairCove  → other-d1 (Update docs)

4 agents working across 3 projects`,
			highlight: '4 Agents',
			label: 'Scale'
		},
		{
			number: '04',
			title: 'Supervise from One Place',
			description: 'All projects, all agents, one IDE. Answer questions with a click. Watch progress in real-time.',
			code: `[IDE: 4 agents active]

BluePeak asks:
  "Supabase or Firebase for auth?"
  [1. Supabase (Recommended)]
  [2. Firebase]

GoldBay: Committing fix... ████████░░ 80%
RedMarsh: Running tests...
FairCove: Task complete ✓`,
			highlight: 'You Decide',
			label: 'Control'
		},
		{
			number: '05',
			title: 'Ship Structured Work',
			description: 'Tasks complete, commits land, epics close. Full audit trail. Ready for the next batch.',
			code: `Epic "User Authentication" complete!

Tasks:     5/5 ✓
Commits:   12
Files:     34 changed
Tests:     All passing

Next ready tasks:
  → squad-b1: Dashboard analytics
  → squad-b2: Email notifications
  → chimaro-c1: Payment flow`,
			highlight: 'Done',
			label: 'Ship'
		}
	];
</script>

<section id="workflow" class="py-32">
	<div class="max-w-6xl mx-auto px-6">
		<!-- Section header -->
		<div class="text-center mb-20">
			<h2 class="heading-lg text-white mb-4">From Spec to Shipped</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				The workflow that makes 40 agents manageable. Structure in, structure out.
			</p>
		</div>

		<!-- Steps -->
		<div class="space-y-16">
			{#each steps as step, i}
				<div
					class="grid lg:grid-cols-2 gap-8 items-center"
					class:lg:flex-row-reverse={i % 2 === 1}
				>
					<!-- Content side -->
					<div class={i % 2 === 1 ? 'lg:order-2' : ''}>
						<div class="flex items-center gap-4 mb-4">
							<span class="text-4xl font-bold text-[var(--color-primary)]/20 font-mono">
								{step.number}
							</span>
							<div class="flex gap-2">
								<span
									class="px-2 py-1 rounded text-xs font-medium"
									style="background: var(--color-primary)20; color: var(--color-primary)"
								>
									{step.label}
								</span>
								<span
									class="px-2 py-1 rounded text-xs font-medium"
									style="background: var(--color-success)20; color: var(--color-success)"
								>
									{step.highlight}
								</span>
							</div>
						</div>
						<h3 class="heading-md text-white mb-4">{step.title}</h3>
						<p class="text-gray-400 text-lg leading-relaxed">{step.description}</p>
					</div>

					<!-- Code side -->
					<div class={i % 2 === 1 ? 'lg:order-1' : ''}>
						<div class="code-block p-5 relative overflow-hidden">
							<!-- Glow effect -->
							<div
								class="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl"
								style="background: var(--color-primary); opacity: 0.08"
							></div>

							<!-- Terminal header -->
							<div class="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
								<div class="w-3 h-3 rounded-full bg-red-500/80"></div>
								<div class="w-3 h-3 rounded-full bg-yellow-500/80"></div>
								<div class="w-3 h-3 rounded-full bg-green-500/80"></div>
								<span class="ml-2 text-xs text-gray-500 font-mono">squad</span>
							</div>

							<!-- Code content -->
							<pre class="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{step.code}</pre>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Bottom callout -->
		<div class="mt-20 text-center">
			<p class="text-lg text-gray-400 mb-6">
				This is how you go from <span class="text-white">"I have an idea"</span> to
				<span class="text-white">"It's in production"</span>&mdash;with 40 agents helping along the way.
			</p>
			<a href="#install" class="btn btn-primary btn-lg btn-glow rounded-full px-8">
				Start Building
			</a>
		</div>
	</div>
</section>
