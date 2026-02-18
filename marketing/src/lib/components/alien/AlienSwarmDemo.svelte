<script lang="ts">
	/**
	 * AlienSwarmDemo - Visual swarm orchestration demonstration
	 *
	 * Features:
	 * - Animated agent nodes working in parallel
	 * - Task flow visualization
	 * - Real-time coordination display
	 */
	import { onMount } from 'svelte';

	let visible = $state(false);
	let sectionEl: HTMLElement;
	let animationFrame = $state(0);

	// Sample agents for the demo
	const agents = [
		{ name: 'BluePeak', task: 'squad-a1', status: 'working', color: 'oklch(65% 0.2 180)' },
		{ name: 'GoldBay', task: 'squad-b3', status: 'working', color: 'oklch(80% 0.18 85)' },
		{ name: 'RedMarsh', task: 'squad-c2', status: 'review', color: 'oklch(70% 0.25 25)' },
		{ name: 'FairCove', task: 'squad-d1', status: 'working', color: 'oklch(75% 0.18 145)' },
		{ name: 'MistHaven', task: 'squad-e5', status: 'idle', color: 'oklch(70% 0.25 280)' },
		{ name: 'DarkPine', task: 'squad-f2', status: 'working', color: 'oklch(65% 0.15 320)' }
	];

	// Task flow items
	const taskFlow = [
		{ label: 'PRD', icon: '📋' },
		{ label: 'Tasks', icon: '📝' },
		{ label: 'Agents', icon: '🤖' },
		{ label: 'Code', icon: '💻' },
		{ label: 'Ship', icon: '🚀' }
	];

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

		// Animation loop for pulsing effects
		let frame = 0;
		const animate = () => {
			frame = (frame + 1) % 360;
			animationFrame = frame;
			requestAnimationFrame(animate);
		};
		const animId = requestAnimationFrame(animate);

		return () => {
			observer.disconnect();
			cancelAnimationFrame(animId);
		};
	});

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'working':
				return 'Working';
			case 'review':
				return 'Review';
			case 'idle':
				return 'Idle';
			default:
				return status;
		}
	}
</script>

<section id="swarm" class="alien-swarm" bind:this={sectionEl}>
	<!-- Background -->
	<div class="swarm-bg">
		<div class="bg-nebula"></div>
	</div>

	<div class="swarm-content" class:visible>
		<!-- Section header -->
		<div class="section-header">
			<span class="header-glyph">⬡</span>
			<h2 class="section-title">Swarm Intelligence</h2>
			<p class="section-subtitle">40+ agents working in harmony</p>
		</div>

		<!-- Task flow visualization -->
		<div class="task-flow">
			{#each taskFlow as step, i}
				<div class="flow-step" style="--step-delay: {i * 0.1}s">
					<span class="step-icon">{step.icon}</span>
					<span class="step-label">{step.label}</span>
				</div>
				{#if i < taskFlow.length - 1}
					<div class="flow-arrow">→</div>
				{/if}
			{/each}
		</div>

		<!-- Agent grid -->
		<div class="agent-grid">
			{#each agents as agent, i}
				<div
					class="agent-node"
					class:working={agent.status === 'working'}
					class:review={agent.status === 'review'}
					class:idle={agent.status === 'idle'}
					style="--agent-color: {agent.color}; --agent-delay: {i * 0.15}s"
				>
					<div class="agent-avatar">
						<span class="avatar-glyph">⬢</span>
						<div class="avatar-ring" style="--ring-phase: {animationFrame + i * 60}deg"></div>
					</div>
					<div class="agent-info">
						<span class="agent-name">{agent.name}</span>
						<span class="agent-task">{agent.task}</span>
					</div>
					<div class="agent-status">
						<span class="status-dot"></span>
						<span class="status-text">{getStatusLabel(agent.status)}</span>
					</div>
				</div>
			{/each}
		</div>

		<!-- Coordination messages -->
		<div class="coordination-panel">
			<div class="panel-header">
				<span class="panel-glyph">◈</span>
				<span class="panel-title">Agent Coordination</span>
			</div>
			<div class="messages">
				<div class="message">
					<span class="msg-time">12:34:21</span>
					<span class="msg-agent" style="color: oklch(65% 0.2 180)">BluePeak</span>
					<span class="msg-text">Reserved src/auth/**/*.ts</span>
				</div>
				<div class="message">
					<span class="msg-time">12:34:18</span>
					<span class="msg-agent" style="color: oklch(70% 0.25 25)">RedMarsh</span>
					<span class="msg-text">Requesting review for squad-c2</span>
				</div>
				<div class="message">
					<span class="msg-time">12:34:15</span>
					<span class="msg-agent" style="color: oklch(75% 0.18 145)">FairCove</span>
					<span class="msg-text">Completed squad-d0, picking squad-d1</span>
				</div>
				<div class="message">
					<span class="msg-time">12:34:12</span>
					<span class="msg-agent" style="color: oklch(80% 0.18 85)">GoldBay</span>
					<span class="msg-text">@BluePeak dependency ready</span>
				</div>
			</div>
		</div>

		<!-- Stats -->
		<div class="swarm-stats">
			<div class="stat">
				<span class="stat-value">42</span>
				<span class="stat-label">Active Agents</span>
			</div>
			<div class="stat">
				<span class="stat-value">156</span>
				<span class="stat-label">Tasks Complete</span>
			</div>
			<div class="stat">
				<span class="stat-value">0</span>
				<span class="stat-label">Conflicts</span>
			</div>
			<div class="stat">
				<span class="stat-value">∞</span>
				<span class="stat-label">Potential</span>
			</div>
		</div>
	</div>
</section>

<style>
	.alien-swarm {
		position: relative;
		padding: 8rem 2rem;
		overflow: hidden;
		background: oklch(4% 0.02 280);
	}

	/* Background */
	.swarm-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.bg-nebula {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 70% 30%, oklch(70% 0.25 280 / 0.08) 0%, transparent 50%),
			radial-gradient(ellipse at 30% 70%, oklch(65% 0.2 180 / 0.08) 0%, transparent 50%);
	}

	/* AI-generated swarm network background */
	.swarm-bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/images/alien/swarm-network.png') center/cover no-repeat;
		opacity: 0.06;
	}

	/* Content */
	.swarm-content {
		position: relative;
		z-index: 1;
		max-width: 1200px;
		margin: 0 auto;
		opacity: 0;
		transform: translateY(30px);
		transition: all 0.8s ease;
	}

	.swarm-content.visible {
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
	}

	/* Task flow */
	.task-flow {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 4rem;
		padding: 1.5rem;
		background: oklch(8% 0.02 280 / 0.5);
		border-radius: 8px;
		border: 1px solid oklch(20% 0.02 280);
	}

	.flow-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		animation: step-appear 0.5s ease forwards;
		animation-delay: var(--step-delay);
		opacity: 0;
	}

	@keyframes step-appear {
		to {
			opacity: 1;
		}
	}

	.step-icon {
		font-size: 2rem;
	}

	.step-label {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(70% 0.02 280);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.flow-arrow {
		color: oklch(50% 0.02 280);
		font-size: 1.25rem;
	}

	/* Agent grid */
	.agent-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.agent-node {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: oklch(8% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
		animation: node-appear 0.6s ease forwards;
		animation-delay: var(--agent-delay);
		opacity: 0;
		transform: translateY(20px);
	}

	@keyframes node-appear {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.agent-node.working {
		border-color: oklch(75% 0.18 145 / 0.3);
	}

	.agent-node.review {
		border-color: oklch(80% 0.18 85 / 0.3);
	}

	.agent-node.idle {
		border-color: oklch(50% 0.02 280 / 0.3);
	}

	/* Agent avatar */
	.agent-avatar {
		position: relative;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-glyph {
		font-size: 1.5rem;
		color: var(--agent-color);
		text-shadow: 0 0 10px var(--agent-color);
		z-index: 1;
	}

	.avatar-ring {
		position: absolute;
		inset: 0;
		border: 2px solid var(--agent-color);
		border-radius: 50%;
		opacity: 0.3;
		transform: rotate(var(--ring-phase));
		border-top-color: transparent;
		border-right-color: transparent;
	}

	/* Agent info */
	.agent-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.agent-name {
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(85% 0.02 280);
	}

	.agent-task {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: oklch(55% 0.02 280);
	}

	/* Agent status */
	.agent-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--agent-color);
		animation: status-pulse 2s ease-in-out infinite;
	}

	.agent-node.idle .status-dot {
		animation: none;
		opacity: 0.5;
	}

	@keyframes status-pulse {
		0%,
		100% {
			opacity: 0.5;
			transform: scale(1);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}

	.status-text {
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		color: oklch(60% 0.02 280);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Coordination panel */
	.coordination-panel {
		background: oklch(6% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
		margin-bottom: 3rem;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		background: oklch(10% 0.02 280);
		border-bottom: 1px solid oklch(20% 0.02 280);
	}

	.panel-glyph {
		color: oklch(70% 0.25 280);
	}

	.panel-title {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(70% 0.02 280);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.messages {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.message {
		display: flex;
		gap: 1rem;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}

	.msg-time {
		color: oklch(45% 0.02 280);
	}

	.msg-agent {
		font-weight: 600;
		min-width: 80px;
	}

	.msg-text {
		color: oklch(65% 0.02 280);
	}

	/* Stats */
	.swarm-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem;
		background: oklch(8% 0.02 280);
		border: 1px solid oklch(20% 0.02 280);
		border-radius: 8px;
	}

	.stat-value {
		font-family: ui-monospace, monospace;
		font-size: 2.5rem;
		font-weight: 700;
		color: oklch(70% 0.25 280);
		text-shadow: 0 0 20px oklch(70% 0.25 280 / 0.3);
	}

	.stat-label {
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		color: oklch(55% 0.02 280);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
</style>
