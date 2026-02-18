<script lang="ts">
	/**
	 * THE ALIEN MANUAL
	 *
	 * An immersive, alien-themed interpretation of SQUAD - playing into
	 * Karpathy's quote about the "alien tool with no manual".
	 *
	 * This IS the manual.
	 */
	import { onMount } from 'svelte';
	import AlienNav from '$lib/components/alien/AlienNav.svelte';
	import AlienHero from '$lib/components/alien/AlienHero.svelte';
	import AlienGlyphTransmission from '$lib/components/alien/AlienGlyphTransmission.svelte';
	import AlienChapters from '$lib/components/alien/AlienChapters.svelte';
	import AlienConfigShowcase from '$lib/components/alien/AlienConfigShowcase.svelte';
	import AlienSwarmDemo from '$lib/components/alien/AlienSwarmDemo.svelte';
	import AlienInstall from '$lib/components/alien/AlienInstall.svelte';
	import AlienFooter from '$lib/components/alien/AlienFooter.svelte';

	// Alien glyphs for decoration - these could be Unicode or custom SVGs
	const glyphs = ['⌬', '⏣', '⎔', '⌖', '◬', '⟐', '⧫', '⬡', '⬢', '⬣'];

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});
</script>

<svelte:head>
	<title>THE ALIEN MANUAL | SQUAD - Decode the Technology</title>
	<meta name="description" content="The alien tool came with no manual. So we wrote one. SQUAD is the command interface for orchestrating AI coding agents at scale." />
</svelte:head>

<div class="alien-manual" class:mounted>
	<!-- Custom navigation for alien theme -->
	<AlienNav />

	<!-- Hero: The Transmission Begins -->
	<AlienHero />

	<!-- Glyph Transmission: The "Alien" Quote Context -->
	<AlienGlyphTransmission />

	<!-- Chapters: Core Features as "Manual Sections" -->
	<AlienChapters />

	<!-- Interactive Config Showcase -->
	<AlienConfigShowcase />

	<!-- Swarm Orchestration Demo -->
	<AlienSwarmDemo />

	<!-- Installation: "Initialize the Interface" -->
	<AlienInstall />

	<!-- Footer -->
	<AlienFooter />
</div>

<style>
	.alien-manual {
		--alien-bg: oklch(5% 0.02 280);
		--alien-surface: oklch(10% 0.03 280);
		--alien-glow: oklch(70% 0.25 280);
		--alien-glow-secondary: oklch(65% 0.20 180);
		--alien-glow-tertiary: oklch(75% 0.18 145);
		--alien-text: oklch(90% 0.02 280);
		--alien-text-dim: oklch(60% 0.02 280);
		--alien-border: oklch(25% 0.05 280);

		min-height: 100vh;
		background: var(--alien-bg);
		color: var(--alien-text);
		overflow-x: hidden;
		opacity: 0;
		transition: opacity 0.5s ease;
	}

	.alien-manual.mounted {
		opacity: 1;
	}

	/* Global alien theme styles */
	:global(.alien-manual) {
		--color-primary: var(--alien-glow);
		--color-secondary: var(--alien-glow-secondary);
		--bg-deep: var(--alien-bg);
	}

	/* Alien glow effects */
	:global(.alien-glow) {
		box-shadow:
			0 0 20px oklch(70% 0.25 280 / 0.3),
			0 0 40px oklch(70% 0.25 280 / 0.2),
			0 0 60px oklch(70% 0.25 280 / 0.1),
			inset 0 0 20px oklch(70% 0.25 280 / 0.1);
	}

	:global(.alien-text-glow) {
		text-shadow:
			0 0 10px oklch(70% 0.25 280 / 0.8),
			0 0 20px oklch(70% 0.25 280 / 0.5),
			0 0 40px oklch(70% 0.25 280 / 0.3);
	}

	/* Holographic shimmer */
	:global(.alien-hologram) {
		background: linear-gradient(
			135deg,
			oklch(70% 0.25 280 / 0.1) 0%,
			oklch(65% 0.20 180 / 0.1) 25%,
			oklch(75% 0.18 145 / 0.1) 50%,
			oklch(65% 0.20 180 / 0.1) 75%,
			oklch(70% 0.25 280 / 0.1) 100%
		);
		background-size: 200% 200%;
		animation: hologram-shift 8s ease infinite;
	}

	@keyframes hologram-shift {
		0%, 100% { background-position: 0% 0%; }
		50% { background-position: 100% 100%; }
	}

	/* Alien scan line effect */
	:global(.alien-scanlines)::before {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			oklch(100% 0 0 / 0.02) 2px,
			oklch(100% 0 0 / 0.02) 4px
		);
		pointer-events: none;
		z-index: 100;
	}

	/* Alien grid pattern */
	:global(.alien-grid) {
		background-image:
			linear-gradient(oklch(25% 0.05 280 / 0.3) 1px, transparent 1px),
			linear-gradient(90deg, oklch(25% 0.05 280 / 0.3) 1px, transparent 1px);
		background-size: 40px 40px;
	}

	/* Alien pulse animation */
	@keyframes alien-pulse {
		0%, 100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 1;
			transform: scale(1.02);
		}
	}

	:global(.alien-pulse) {
		animation: alien-pulse 3s ease-in-out infinite;
	}

	/* Transmission flicker */
	@keyframes transmission-flicker {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.95; }
		51% { opacity: 0.7; }
		52% { opacity: 0.95; }
	}

	:global(.alien-flicker) {
		animation: transmission-flicker 4s ease-in-out infinite;
	}

	/* Glyph rotation */
	@keyframes glyph-rotate {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	:global(.alien-glyph-spin) {
		animation: glyph-rotate 20s linear infinite;
	}
</style>
