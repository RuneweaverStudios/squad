<script lang="ts">
	/**
	 * AlienConfigShowcase - Interactive configuration showcase
	 *
	 * Features:
	 * - Live config editor mockup
	 * - Shows auto-proceed rules, agent spawning, task management
	 * - Holographic terminal effect
	 */
	import { onMount } from 'svelte';

	let visible = $state(false);
	let activeTab = $state<'autoproceed' | 'agents' | 'tasks'>('autoproceed');
	let sectionEl: HTMLElement;

	const tabs = [
		{ id: 'autoproceed', label: 'Auto-Proceed', glyph: '⌬' },
		{ id: 'agents', label: 'Agent Spawn', glyph: '⏣' },
		{ id: 'tasks', label: 'Task Queue', glyph: '⎔' }
	] as const;

	// Sample configurations for each tab
	const configs = {
		autoproceed: {
			title: 'Workflow Automation Rules',
			description: 'Define patterns that auto-answer prompts. Agents ask humans only for real decisions.',
			code: `// Auto-proceed rules
{
  "rules": [
    {
      "name": "Auto-continue prompts",
      "pattern": "Continue\\\\?",
      "action": "send_text",
      "value": "y",
      "cooldown": 30
    },
    {
      "name": "Accept plan mode",
      "pattern": "exit plan mode",
      "action": "send_keys",
      "value": "Enter"
    },
    {
      "name": "API recovery",
      "pattern": "API is overloaded",
      "action": "send_text",
      "value": "",
      "delay": 5000
    }
  ]
}`
		},
		agents: {
			title: 'Multi-Agent Spawning',
			description: 'Launch agent swarms with one command. Each picks ready work automatically.',
			code: `# Spawn 4 agents on project
$ jat myproject 4 --auto

Spawning agents...
  ├─ BluePeak   → jat-a1 [P0]
  ├─ GoldBay    → jat-b3 [P1]
  ├─ RedMarsh   → jat-c2 [P1]
  └─ FairCove   → jat-d1 [P2]

IDE: http://localhost:5174
Agents: 4 active | 0 idle

# Each agent automatically:
# 1. Registers identity
# 2. Picks highest-priority ready task
# 3. Reserves files to prevent conflicts
# 4. Coordinates via Agent Mail`
		},
		tasks: {
			title: 'Dependency-Aware Task Queue',
			description: 'Tasks with blockers wait. When dependencies complete, work becomes ready.',
			code: `$ jt ready --json

[
  {
    "id": "jat-7kx2m",
    "title": "Add OAuth provider",
    "type": "feature",
    "priority": 0,
    "status": "ready",
    "deps_met": true
  },
  {
    "id": "jat-3nf8p",
    "title": "Fix login timeout",
    "type": "bug",
    "priority": 1,
    "status": "ready",
    "deps_met": true
  }
]

# Blocked tasks (deps not met):
$ jt list --status blocked
jat-9abc: Dashboard UI [blocked by jat-7kx2m]
jat-5def: Email notify [blocked by jat-3nf8p]`
		}
	};

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					visible = true;
				}
			},
			{ threshold: 0.2 }
		);

		if (sectionEl) observer.observe(sectionEl);

		return () => observer.disconnect();
	});
</script>

<section id="interface" class="alien-config" bind:this={sectionEl}>
	<!-- Background effects -->
	<div class="config-bg">
		<div class="bg-glow"></div>
		<div class="bg-circuit"></div>
	</div>

	<div class="config-content" class:visible>
		<!-- Section header -->
		<div class="section-header">
			<span class="header-glyph">⎔</span>
			<h2 class="section-title">Configure the Interface</h2>
			<p class="section-subtitle">The alien technology responds to your commands</p>
		</div>

		<!-- Interactive showcase -->
		<div class="showcase-container">
			<!-- Tab navigation -->
			<div class="tab-nav">
				{#each tabs as tab}
					<button
						class="tab-button"
						class:active={activeTab === tab.id}
						onclick={() => (activeTab = tab.id)}
					>
						<span class="tab-glyph">{tab.glyph}</span>
						<span class="tab-label">{tab.label}</span>
					</button>
				{/each}
			</div>

			<!-- Config display -->
			<div class="config-display">
				<!-- Terminal frame -->
				<div class="terminal-frame">
					<div class="terminal-header">
						<div class="terminal-dots">
							<span class="dot red"></span>
							<span class="dot yellow"></span>
							<span class="dot green"></span>
						</div>
						<span class="terminal-title">{configs[activeTab].title}</span>
					</div>

					<div class="terminal-body">
						<p class="config-description">{configs[activeTab].description}</p>
						<pre class="config-code">{configs[activeTab].code}</pre>
					</div>

					<!-- Scan line effect -->
					<div class="scan-line"></div>
				</div>

				<!-- Side info -->
				<div class="config-info">
					<div class="info-item">
						<span class="info-glyph">◈</span>
						<span class="info-text">Real-time monitoring</span>
					</div>
					<div class="info-item">
						<span class="info-glyph">◈</span>
						<span class="info-text">Pattern-based triggers</span>
					</div>
					<div class="info-item">
						<span class="info-glyph">◈</span>
						<span class="info-text">Rate limiting built-in</span>
					</div>
					<div class="info-item">
						<span class="info-glyph">◈</span>
						<span class="info-text">Activity logging</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.alien-config {
		position: relative;
		padding: 8rem 2rem;
		overflow: hidden;
	}

	/* Background */
	.config-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.bg-glow {
		position: absolute;
		top: 50%;
		left: 30%;
		width: 600px;
		height: 400px;
		transform: translate(-50%, -50%);
		background: radial-gradient(ellipse at center, oklch(65% 0.2 180 / 0.1) 0%, transparent 70%);
	}

	.bg-circuit {
		position: absolute;
		inset: 0;
		background-image: linear-gradient(90deg, oklch(65% 0.2 180 / 0.03) 1px, transparent 1px),
			linear-gradient(oklch(65% 0.2 180 / 0.03) 1px, transparent 1px);
		background-size: 80px 80px;
	}

	/* AI-generated control panel background */
	.config-bg::after {
		content: '';
		position: absolute;
		right: 0;
		top: 50%;
		width: 500px;
		height: 500px;
		transform: translateY(-50%);
		background: url('/images/alien/control-panel.png') center/contain no-repeat;
		opacity: 0.08;
	}

	/* Content */
	.config-content {
		position: relative;
		z-index: 1;
		max-width: 1200px;
		margin: 0 auto;
		opacity: 0;
		transform: translateY(30px);
		transition: all 0.8s ease;
	}

	.config-content.visible {
		opacity: 1;
		transform: translateY(0);
	}

	/* Header */
	.section-header {
		text-align: center;
		margin-bottom: 4rem;
	}

	.header-glyph {
		display: block;
		font-size: 2rem;
		color: oklch(65% 0.2 180);
		margin-bottom: 1rem;
		text-shadow: 0 0 20px oklch(65% 0.2 180 / 0.5);
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
	}

	/* Showcase container */
	.showcase-container {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* Tab navigation */
	.tab-nav {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.tab-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: oklch(10% 0.02 280);
		border: 1px solid oklch(25% 0.02 280);
		border-radius: 4px;
		color: oklch(60% 0.02 280);
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.tab-button:hover {
		background: oklch(15% 0.02 280);
		color: oklch(80% 0.02 280);
	}

	.tab-button.active {
		background: oklch(65% 0.2 180 / 0.15);
		border-color: oklch(65% 0.2 180 / 0.5);
		color: oklch(65% 0.2 180);
	}

	.tab-glyph {
		font-size: 1rem;
	}

	.tab-label {
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	/* Config display */
	.config-display {
		display: grid;
		gap: 2rem;
	}

	@media (min-width: 900px) {
		.config-display {
			grid-template-columns: 1fr 250px;
		}
	}

	/* Terminal frame */
	.terminal-frame {
		position: relative;
		background: oklch(6% 0.02 280);
		border: 1px solid oklch(25% 0.02 280);
		border-radius: 8px;
		overflow: hidden;
	}

	.terminal-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: oklch(10% 0.02 280);
		border-bottom: 1px solid oklch(20% 0.02 280);
	}

	.terminal-dots {
		display: flex;
		gap: 0.375rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.dot.red {
		background: oklch(65% 0.25 25);
	}
	.dot.yellow {
		background: oklch(80% 0.18 85);
	}
	.dot.green {
		background: oklch(75% 0.18 145);
	}

	.terminal-title {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(60% 0.02 280);
		letter-spacing: 0.05em;
	}

	.terminal-body {
		padding: 1.5rem;
	}

	.config-description {
		margin: 0 0 1.5rem;
		font-size: 0.9rem;
		line-height: 1.6;
		color: oklch(65% 0.02 280);
	}

	.config-code {
		margin: 0;
		padding: 1rem;
		background: oklch(8% 0.02 280);
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		line-height: 1.6;
		color: oklch(65% 0.15 145);
		overflow-x: auto;
		white-space: pre;
	}

	/* Scan line effect */
	.scan-line {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(90deg, transparent, oklch(65% 0.2 180 / 0.5), transparent);
		animation: scan 4s linear infinite;
	}

	@keyframes scan {
		0% {
			top: 0;
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		90% {
			opacity: 1;
		}
		100% {
			top: 100%;
			opacity: 0;
		}
	}

	/* Side info */
	.config-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: oklch(8% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
	}

	.info-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.info-glyph {
		color: oklch(65% 0.2 180);
		font-size: 0.9rem;
	}

	.info-text {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: oklch(70% 0.02 280);
	}
</style>
