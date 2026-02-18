<script lang="ts">
	/**
	 * AlienInstall - Installation section styled as "Initialize the Interface"
	 *
	 * Features:
	 * - Step-by-step installation commands
	 * - Copy-to-clipboard functionality
	 * - Animated terminal display
	 */
	import { onMount } from 'svelte';

	let visible = $state(false);
	let copiedIndex = $state<number | null>(null);
	let sectionEl: HTMLElement;

	const steps = [
		{
			title: 'Clone the Repository',
			command: 'git clone https://github.com/jomarchy/squad.git ~/code/squad',
			description: 'Download the alien technology to your local system'
		},
		{
			title: 'Install Dependencies',
			command: 'cd ~/code/squad && ./install.sh',
			description: 'Initialize all tools and create symlinks'
		},
		{
			title: 'Start the IDE',
			command: 'squad',
			description: 'Launch your command center'
		},
		{
			title: 'Begin Work',
			command: '/squad:start',
			description: 'Register your agent and pick a task'
		}
	];

	const requirements = [
		{ name: 'tmux', desc: 'Terminal multiplexer' },
		{ name: 'sqlite3', desc: 'Database for Agent Mail' },
		{ name: 'jq', desc: 'JSON processing' },
		{ name: 'node', desc: 'IDE & browser tools' }
	];

	async function copyCommand(command: string, index: number) {
		try {
			await navigator.clipboard.writeText(command);
			copiedIndex = index;
			setTimeout(() => {
				copiedIndex = null;
			}, 2000);
		} catch {
			// Fallback for older browsers
			const textarea = document.createElement('textarea');
			textarea.value = command;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			copiedIndex = index;
			setTimeout(() => {
				copiedIndex = null;
			}, 2000);
		}
	}

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

<section id="initialize" class="alien-install" bind:this={sectionEl}>
	<!-- Background -->
	<div class="install-bg">
		<div class="bg-glow"></div>
		<div class="bg-grid"></div>
	</div>

	<div class="install-content" class:visible>
		<!-- Section header -->
		<div class="section-header">
			<span class="header-glyph">⧫</span>
			<h2 class="section-title">Initialize the Interface</h2>
			<p class="section-subtitle">Four commands to unlock the system</p>
		</div>

		<!-- Requirements -->
		<div class="requirements">
			<div class="req-header">
				<span class="req-glyph">◈</span>
				<span class="req-title">Prerequisites</span>
			</div>
			<div class="req-grid">
				{#each requirements as req}
					<div class="req-item">
						<code class="req-name">{req.name}</code>
						<span class="req-desc">{req.desc}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Installation steps -->
		<div class="steps-container">
			{#each steps as step, i}
				<div class="step-card" style="--step-delay: {i * 0.15}s">
					<div class="step-number">
						<span class="number-text">{String(i + 1).padStart(2, '0')}</span>
					</div>

					<div class="step-content">
						<h3 class="step-title">{step.title}</h3>
						<p class="step-description">{step.description}</p>

						<div class="command-box">
							<code class="command-text">{step.command}</code>
							<button
								class="copy-button"
								class:copied={copiedIndex === i}
								onclick={() => copyCommand(step.command, i)}
							>
								{copiedIndex === i ? '✓' : '⎘'}
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Success message -->
		<div class="success-panel">
			<div class="success-glyph">⬢</div>
			<p class="success-text">
				<span class="success-highlight">System initialized.</span>
				<br />
				The alien technology is now yours to command.
			</p>
			<a href="https://github.com/jomarchy/squad" class="github-link" target="_blank" rel="noopener">
				<span class="link-icon">◇</span>
				<span>View on GitHub</span>
				<span class="link-arrow">→</span>
			</a>
		</div>
	</div>
</section>

<style>
	.alien-install {
		position: relative;
		padding: 8rem 2rem;
		overflow: hidden;
	}

	/* Background */
	.install-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.bg-glow {
		position: absolute;
		top: 0;
		left: 50%;
		width: 800px;
		height: 400px;
		transform: translateX(-50%);
		background: radial-gradient(ellipse at center, oklch(75% 0.18 145 / 0.1) 0%, transparent 70%);
	}

	.bg-grid {
		position: absolute;
		inset: 0;
		background-image: linear-gradient(oklch(75% 0.18 145 / 0.03) 1px, transparent 1px),
			linear-gradient(90deg, oklch(75% 0.18 145 / 0.03) 1px, transparent 1px);
		background-size: 60px 60px;
	}

	/* Content */
	.install-content {
		position: relative;
		z-index: 1;
		max-width: 800px;
		margin: 0 auto;
		opacity: 0;
		transform: translateY(30px);
		transition: all 0.8s ease;
	}

	.install-content.visible {
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
		color: oklch(75% 0.18 145);
		margin-bottom: 1rem;
		text-shadow: 0 0 20px oklch(75% 0.18 145 / 0.5);
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

	/* Requirements */
	.requirements {
		margin-bottom: 3rem;
		padding: 1.5rem;
		background: oklch(8% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
	}

	.req-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.req-glyph {
		color: oklch(75% 0.18 145);
	}

	.req-title {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(70% 0.02 280);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.req-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.req-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.req-name {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		color: oklch(75% 0.18 145);
	}

	.req-desc {
		font-size: 0.75rem;
		color: oklch(55% 0.02 280);
	}

	/* Steps */
	.steps-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.step-card {
		display: flex;
		gap: 1.5rem;
		padding: 1.5rem;
		background: oklch(8% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
		animation: step-appear 0.6s ease forwards;
		animation-delay: var(--step-delay);
		opacity: 0;
		transform: translateX(-20px);
	}

	@keyframes step-appear {
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.step-number {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(75% 0.18 145 / 0.1);
		border: 1px solid oklch(75% 0.18 145 / 0.3);
		border-radius: 8px;
	}

	.number-text {
		font-family: ui-monospace, monospace;
		font-size: 1.25rem;
		font-weight: 700;
		color: oklch(75% 0.18 145);
	}

	.step-content {
		flex: 1;
	}

	.step-title {
		font-family: ui-monospace, monospace;
		font-size: 1rem;
		font-weight: 600;
		color: oklch(90% 0.02 280);
		margin: 0 0 0.5rem;
	}

	.step-description {
		font-size: 0.85rem;
		color: oklch(60% 0.02 280);
		margin: 0 0 1rem;
	}

	/* Command box */
	.command-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: oklch(5% 0.02 280);
		border: 1px solid oklch(25% 0.02 280);
		border-radius: 4px;
	}

	.command-text {
		flex: 1;
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: oklch(65% 0.15 145);
		overflow-x: auto;
		white-space: nowrap;
	}

	.copy-button {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(20% 0.02 280);
		border: 1px solid oklch(30% 0.02 280);
		border-radius: 4px;
		color: oklch(60% 0.02 280);
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.copy-button:hover {
		background: oklch(25% 0.02 280);
		color: oklch(80% 0.02 280);
	}

	.copy-button.copied {
		background: oklch(75% 0.18 145 / 0.2);
		border-color: oklch(75% 0.18 145 / 0.5);
		color: oklch(75% 0.18 145);
	}

	/* Success panel */
	.success-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 3rem;
		background: linear-gradient(
			135deg,
			oklch(10% 0.02 280) 0%,
			oklch(8% 0.02 280) 50%,
			oklch(10% 0.02 280) 100%
		);
		border: 1px solid oklch(75% 0.18 145 / 0.2);
		border-radius: 8px;
	}

	.success-glyph {
		font-size: 3rem;
		color: oklch(75% 0.18 145);
		text-shadow: 0 0 30px oklch(75% 0.18 145 / 0.5);
		animation: success-pulse 2s ease-in-out infinite;
	}

	@keyframes success-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.8;
		}
		50% {
			transform: scale(1.1);
			opacity: 1;
		}
	}

	.success-text {
		font-size: 1.1rem;
		line-height: 1.8;
		color: oklch(65% 0.02 280);
		text-align: center;
		margin: 0;
	}

	.success-highlight {
		font-family: ui-monospace, monospace;
		font-size: 1.25rem;
		font-weight: 600;
		color: oklch(90% 0.02 280);
	}

	.github-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 2rem;
		background: oklch(75% 0.18 145 / 0.1);
		border: 1px solid oklch(75% 0.18 145 / 0.3);
		border-radius: 4px;
		text-decoration: none;
		color: oklch(75% 0.18 145);
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		font-weight: 600;
		transition: all 0.3s ease;
	}

	.github-link:hover {
		background: oklch(75% 0.18 145 / 0.2);
		border-color: oklch(75% 0.18 145 / 0.5);
		box-shadow: 0 0 20px oklch(75% 0.18 145 / 0.2);
	}

	.link-icon {
		font-size: 1rem;
	}

	.link-arrow {
		transition: transform 0.2s ease;
	}

	.github-link:hover .link-arrow {
		transform: translateX(4px);
	}
</style>
