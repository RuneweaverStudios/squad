<script lang="ts">
	/**
	 * AlienChapters - Manual chapters showcasing SQUAD features
	 *
	 * Features:
	 * - Manual-style chapter layout
	 * - Each chapter covers a core SQUAD capability
	 * - Interactive reveal animations
	 */
	import { onMount } from 'svelte';

	let visibleChapters = $state<Set<number>>(new Set());
	let sectionEl: HTMLElement;

	const chapters = [
		{
			number: 'I',
			glyph: '⌬',
			title: 'Task Architecture',
			subtitle: 'SQUAD Tasks: Dependency-Aware Work',
			description: 'Structure your work into epics, features, and tasks with automatic dependency tracking. When Agent A finishes a blocker, Agent B is automatically ready.',
			features: [
				'Priority-based task queues',
				'Dependency graphs',
				'Status propagation',
				'Multi-project aggregation'
			],
			code: `$ st ready --json
[{
  "id": "squad-7kx2m",
  "title": "Add OAuth",
  "priority": 1,
  "deps": ["squad-3nf8p"],
  "status": "ready"
}]`,
			color: 'oklch(70% 0.25 280)'
		},
		{
			number: 'II',
			glyph: '⏣',
			title: 'Agent Coordination',
			subtitle: 'Identity & File Declarations',
			description: 'Agents register identities and declare files on tasks. No conflicts. No overwrites. Just smooth parallel execution.',
			features: [
				'File declarations on tasks',
				'Agent identity registry',
				'Cross-session memory',
				'Conflict prevention'
			],
			code: `$ st update squad-7kx2m \\
  --status in_progress \\
  --assignee BluePeak \\
  --files "src/**/*.ts"

Updated: squad-7kx2m
Status: in_progress
Files: src/**/*.ts`,
			color: 'oklch(65% 0.20 180)'
		},
		{
			number: 'III',
			glyph: '⎔',
			title: 'Swarm Orchestration',
			subtitle: '40+ Agents Working Together',
			description: 'Spawn an army of agents with one command. They auto-pick ready work, coordinate via signals, and report through the IDE.',
			features: [
				'Parallel agent spawning',
				'Auto task assignment',
				'Real-time monitoring',
				'Smart question UI'
			],
			code: `$ squad myproject 4 --auto

Spawning 4 agents...
  BluePeak  → squad-a1 [P0]
  GoldBay   → squad-b3 [P1]
  RedMarsh  → squad-c2 [P1]
  FairCove  → squad-d1 [P2]

IDE: http://localhost:5174`,
			color: 'oklch(75% 0.18 145)'
		},
		{
			number: 'IV',
			glyph: '◬',
			title: 'Workflow Automation',
			subtitle: 'Patterns That Auto-Proceed',
			description: 'Configure rules to auto-answer common prompts. Agents ask questions only when they need human judgment, not for routine confirmations.',
			features: [
				'Pattern-based triggers',
				'Rate limiting',
				'Session state filters',
				'Activity logging'
			],
			code: `// Auto-proceed rule
{
  "pattern": "Continue\\\\?",
  "action": "send_text",
  "value": "y",
  "cooldown": 30
}

// Agent proceeds automatically`,
			color: 'oklch(80% 0.15 85)'
		},
		{
			number: 'V',
			glyph: '⧫',
			title: 'The IDE',
			subtitle: 'Your Command Center',
			description: 'A unified interface for all projects, all agents, all tasks. Monaco editor, git integration, live terminal output, and more.',
			features: [
				'Multi-project view',
				'Live agent sessions',
				'Embedded editor',
				'Full git support'
			],
			code: `// Dashboard routes
/tasks    - Task management
/work     - Agent sessions
/files    - Monaco editor
/config   - System settings
/kanban   - Visual board`,
			color: 'oklch(70% 0.22 25)'
		},
		{
			number: 'VI',
			glyph: '⬡',
			title: 'The Flywheel',
			subtitle: 'Agents That Never Stop Shipping',
			description: 'Define → Launch → Supervise → Ship → Repeat. Completed work suggests new work. The system feeds itself.',
			features: [
				'PRD to task generation',
				'Epic completion tracking',
				'Suggested next tasks',
				'Continuous deployment'
			],
			code: `/squad:complete

Task "User Auth" complete!

Suggested next:
  → squad-b1: Dashboard [P1]
  → squad-b2: Email notify [P2]
  → squad-b3: Payments [P1]

Spawning new agent...`,
			color: 'oklch(65% 0.25 320)'
		}
	];

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						const index = parseInt(entry.target.getAttribute('data-chapter') || '0');
						visibleChapters.add(index);
						visibleChapters = new Set(visibleChapters);
					}
				});
			},
			{ threshold: 0.2 }
		);

		const chapterElements = sectionEl?.querySelectorAll('.chapter-card');
		chapterElements?.forEach(el => observer.observe(el));

		return () => observer.disconnect();
	});
</script>

<section id="chapters" class="alien-chapters" bind:this={sectionEl}>
	<!-- Section header -->
	<div class="section-header">
		<span class="header-glyph">⬢</span>
		<h2 class="section-title">Manual Chapters</h2>
		<p class="section-subtitle">Core systems decoded</p>
	</div>

	<!-- Chapters grid -->
	<div class="chapters-container">
		{#each chapters as chapter, i}
			<article
				class="chapter-card"
				class:visible={visibleChapters.has(i)}
				data-chapter={i}
				style="--chapter-color: {chapter.color}; --chapter-delay: {i * 0.1}s"
			>
				<!-- Chapter number -->
				<div class="chapter-number">
					<span class="number-glyph">{chapter.glyph}</span>
					<span class="number-text">Chapter {chapter.number}</span>
				</div>

				<!-- Chapter content -->
				<div class="chapter-content">
					<h3 class="chapter-title">{chapter.title}</h3>
					<p class="chapter-subtitle">{chapter.subtitle}</p>
					<p class="chapter-description">{chapter.description}</p>

					<!-- Features list -->
					<ul class="chapter-features">
						{#each chapter.features as feature}
							<li class="feature-item">
								<span class="feature-dot"></span>
								{feature}
							</li>
						{/each}
					</ul>
				</div>

				<!-- Code preview -->
				<div class="chapter-code">
					<div class="code-header">
						<span class="code-dot"></span>
						<span class="code-dot"></span>
						<span class="code-dot"></span>
					</div>
					<pre class="code-content">{chapter.code}</pre>
				</div>

				<!-- Decorative corner -->
				<div class="chapter-corner"></div>
			</article>
		{/each}
	</div>
</section>

<style>
	.alien-chapters {
		padding: 6rem 2rem;
		background: oklch(5% 0.02 280);
	}

	/* Section header */
	.section-header {
		text-align: center;
		margin-bottom: 4rem;
	}

	.header-glyph {
		display: block;
		font-size: 2rem;
		color: oklch(70% 0.25 280);
		margin-bottom: 1rem;
		text-shadow: 0 0 20px oklch(70% 0.25 280 / 0.5);
	}

	.section-title {
		font-family: ui-monospace, monospace;
		font-size: clamp(1.5rem, 4vw, 2.5rem);
		font-weight: 700;
		color: oklch(90% 0.02 280);
		margin: 0 0 0.5rem;
		letter-spacing: 0.05em;
	}

	.section-subtitle {
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		color: oklch(50% 0.02 280);
		margin: 0;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	/* Chapters container */
	.chapters-container {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		gap: 2rem;
	}

	@media (min-width: 768px) {
		.chapters-container {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1200px) {
		.chapters-container {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	/* Chapter card */
	.chapter-card {
		position: relative;
		display: flex;
		flex-direction: column;
		background: oklch(8% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
		overflow: hidden;
		opacity: 0;
		transform: translateY(30px);
		transition: all 0.6s ease;
		transition-delay: var(--chapter-delay);
	}

	.chapter-card.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.chapter-card:hover {
		border-color: var(--chapter-color);
		box-shadow:
			0 0 30px color-mix(in oklch, var(--chapter-color) 20%, transparent),
			inset 0 0 20px color-mix(in oklch, var(--chapter-color) 5%, transparent);
	}

	/* Chapter number */
	.chapter-number {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		background: oklch(10% 0.02 280);
		border-bottom: 1px solid oklch(20% 0.02 280);
	}

	.number-glyph {
		font-size: 1.25rem;
		color: var(--chapter-color);
		text-shadow: 0 0 10px color-mix(in oklch, var(--chapter-color) 50%, transparent);
	}

	.number-text {
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: oklch(50% 0.02 280);
	}

	/* Chapter content */
	.chapter-content {
		flex: 1;
		padding: 1.5rem;
	}

	.chapter-title {
		font-family: ui-monospace, monospace;
		font-size: 1.25rem;
		font-weight: 700;
		color: oklch(90% 0.02 280);
		margin: 0 0 0.25rem;
	}

	.chapter-subtitle {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--chapter-color);
		margin: 0 0 1rem;
		letter-spacing: 0.05em;
	}

	.chapter-description {
		font-size: 0.875rem;
		line-height: 1.6;
		color: oklch(65% 0.02 280);
		margin: 0 0 1rem;
	}

	/* Features list */
	.chapter-features {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		color: oklch(55% 0.02 280);
		padding: 0.25rem 0.5rem;
		background: oklch(12% 0.02 280);
		border-radius: 4px;
	}

	.feature-dot {
		width: 4px;
		height: 4px;
		background: var(--chapter-color);
		border-radius: 50%;
	}

	/* Code preview */
	.chapter-code {
		background: oklch(6% 0.02 280);
		border-top: 1px solid oklch(15% 0.02 280);
	}

	.code-header {
		display: flex;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: oklch(8% 0.02 280);
	}

	.code-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: oklch(25% 0.02 280);
	}

	.code-content {
		margin: 0;
		padding: 1rem;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		line-height: 1.5;
		color: oklch(65% 0.15 145);
		overflow-x: auto;
	}

	/* Decorative corner */
	.chapter-corner {
		position: absolute;
		top: 0;
		right: 0;
		width: 40px;
		height: 40px;
		background: linear-gradient(
			135deg,
			var(--chapter-color) 0%,
			transparent 50%
		);
		opacity: 0.1;
	}
</style>
