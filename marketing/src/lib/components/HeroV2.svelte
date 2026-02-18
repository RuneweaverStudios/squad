<script lang="ts">
	import SwarmCanvas from './SwarmCanvas.svelte';

	const quickLinks = [
		{
			title: 'Discord',
			subtitle: 'Join the community',
			href: 'https://discord.gg/AFJf93p7Bx',
			icon: 'discord',
			external: true
		},
		{
			title: 'Documentation',
			subtitle: 'Learn the ropes',
			href: 'https://github.com/joewinke/squad#readme',
			icon: 'docs',
			external: true
		},
		{
			title: 'GitHub',
			subtitle: 'View the source',
			href: 'https://github.com/joewinke/squad',
			icon: 'github',
			external: true
		},
		{
			title: 'Install',
			subtitle: 'Get started now',
			href: '#demo',
			icon: 'install',
			external: false
		}
	];
</script>

<section class="relative min-h-screen flex items-center justify-center overflow-hidden">
	<!-- Canvas Background -->
	<SwarmCanvas />

	<!-- Gradient overlay -->
	<div class="hero-gradient absolute inset-0 pointer-events-none"></div>

	<!-- Content -->
	<div class="relative z-10 max-w-5xl mx-auto px-6 text-center">
		<!-- Badge -->
		<div class="mt-20 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-surface)]/80 backdrop-blur-sm border border-[var(--color-primary)]/30 mb-8 animate-fade-up">
			<span class="relative flex h-2 w-2">
				<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
				<span class="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-success)]"></span>
			</span>
			<span class="text-sm text-gray-300">The World's First Agentic IDE</span>
		</div>

		<!-- Logo / Title -->
		<h1 class="heading-xl text-white mb-4 animate-fade-up delay-100">
			<span class="text-glow bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] bg-clip-text text-transparent">
				SQUAD
			</span>
		</h1>

		<!-- Tagline -->
		<p class="text-2xl text-[var(--color-primary)] font-semibold mb-4 animate-fade-up delay-150 tracking-wide">
			SUPERVISE THE SWARM
		</p>

		<!-- Subheadline -->
		<p class="text-xl text-gray-400 max-w-3xl mx-auto mb-4 animate-fade-up delay-200 leading-relaxed">
			Agents ship, suggest, repeat. You supervise.
		</p>

		<p class="text-base text-gray-500 max-w-2xl mx-auto mb-10 animate-fade-up delay-250">
			Task management • Agent orchestration • Code editor • Git integration • Terminal
		</p>

		<!-- Quick Links Grid - ClawdBot style -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-12 animate-fade-up delay-300">
			{#each quickLinks as link}
				<a
					href={link.href}
					target={link.external ? '_blank' : undefined}
					rel={link.external ? 'noopener noreferrer' : undefined}
					class="quick-link-card group"
				>
					<div class="quick-link-icon">
						{#if link.icon === 'discord'}
							<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
								<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
							</svg>
						{:else if link.icon === 'docs'}
							<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
							</svg>
						{:else if link.icon === 'github'}
							<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
							</svg>
						{:else if link.icon === 'install'}
							<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
							</svg>
						{/if}
					</div>
					<div class="quick-link-title">{link.title}</div>
					<div class="quick-link-subtitle">{link.subtitle}</div>
				</a>
			{/each}
		</div>

		<!-- Stats -->
		<div class="grid grid-cols-3 gap-8 max-w-xl mx-auto animate-fade-up delay-400">
			<div class="text-center">
				<div class="text-2xl font-bold text-white">40+</div>
				<div class="text-sm text-gray-500">Agents at once</div>
			</div>
			<div class="text-center">
				<div class="text-2xl font-bold text-white">All</div>
				<div class="text-sm text-gray-500">Your projects</div>
			</div>
			<div class="text-center">
				<div class="text-2xl font-bold text-white">1</div>
				<div class="text-sm text-gray-500">IDE</div>
			</div>
		</div>
	</div>

	<!-- Scroll indicator -->
	<div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
		<svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
		</svg>
	</div>
</section>

<style>
	.quick-link-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem 1rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(15, 23, 42, 0.6);
		backdrop-filter: blur(8px);
		transition: all 0.3s ease;
	}

	.quick-link-card:hover {
		border-color: var(--color-primary);
		background: rgba(15, 23, 42, 0.8);
		transform: translateY(-2px);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(var(--color-primary-rgb), 0.1);
	}

	.quick-link-icon {
		color: var(--color-primary);
		margin-bottom: 0.75rem;
		transition: transform 0.3s ease;
	}

	.quick-link-card:hover .quick-link-icon {
		transform: scale(1.1);
	}

	.quick-link-title {
		font-size: 1rem;
		font-weight: 600;
		color: white;
		margin-bottom: 0.25rem;
	}

	.quick-link-subtitle {
		font-size: 0.75rem;
		color: #9ca3af;
	}
</style>
