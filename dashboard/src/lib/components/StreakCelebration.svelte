<script lang="ts">
	/**
	 * StreakCelebration Component
	 *
	 * Displays a star celebration animation based on a count (e.g., tasks completed today).
	 * Inspired by https://codepen.io/phebert/pen/LEpMQKm
	 *
	 * Layouts:
	 * - 1 star: Large single star
	 * - 2 stars: Side by side
	 * - 3-5 stars: Circle arrangement
	 * - 6-10 stars: Smaller stars in circle
	 * - 11+ stars: Confetti blaster mode!
	 */

	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	interface Props {
		/** Number of stars to show (e.g., tasks completed today) */
		count?: number;
		/** Message to display (default: "{count} tasks today!") */
		message?: string;
		/** Auto-dismiss after this many milliseconds (0 = don't auto-dismiss) */
		autoDismiss?: number;
		/** Callback when celebration is dismissed */
		onDismiss?: () => void;
	}

	let {
		count = 1,
		message,
		autoDismiss = 4000,
		onDismiss
	}: Props = $props();

	// Ensure count is at least 1
	const starCount = $derived(Math.max(1, count));

	// Generate display message
	const displayMessage = $derived(message || `${starCount} task${starCount === 1 ? '' : 's'} today!`);

	// Determine variant classes based on count
	const variantClasses = $derived.by(() => {
		const classes: string[] = [];

		if (starCount === 1) {
			classes.push('single');
			return classes;
		}

		if (starCount === 2) {
			classes.push('double');
			return classes;
		}

		if (starCount > 5) {
			classes.push('over-five');
		}

		if (starCount <= 10) {
			classes.push('circle');
			return classes;
		}

		classes.push('confetti-blaster');
		return classes;
	});

	// Auto-dismiss timer
	onMount(() => {
		if (autoDismiss > 0) {
			const timer = setTimeout(() => {
				onDismiss?.();
			}, autoDismiss);
			return () => clearTimeout(timer);
		}
	});
</script>

<div
	class="streak-celebration"
	transition:fade={{ duration: 300 }}
	onclick={() => onDismiss?.()}
	onkeydown={(e) => e.key === 'Escape' && onDismiss?.()}
	role="button"
	tabindex="0"
>
	<div class="victory-panel">
		<div class="inner">
			<div
				class="star-display {variantClasses.join(' ')} count-{starCount}"
				style="--count: {starCount}"
			>
				{#each Array(starCount) as _, index}
					<div
						class="star"
						style="--index: {index}; --delay-multiplier: {0.01 * index}"
					>
						<!-- Background star (creates depth) -->
						<svg class="star-icon star-bg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>
						</svg>
						<!-- Front star (colored) -->
						<svg class="star-icon star-front" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>
						</svg>
						<!-- Sparkle effect -->
						<svg class="star-sparkles" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
						</svg>
					</div>
				{/each}
			</div>

			<div class="victory-text">
				<h3>{displayMessage}</h3>
			</div>
		</div>
	</div>
</div>

<style>
	:root {
		--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.streak-celebration {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		z-index: 100;
		background: oklch(0.10 0.02 250 / 0.85);
		backdrop-filter: blur(4px);
		border-radius: inherit;
		cursor: pointer;
	}

	.victory-panel {
		--panel-bg: oklch(0.20 0.03 250);
		--panel-border: oklch(0.40 0.08 145);
		--panel-highlight: oklch(0.70 0.20 145);

		background: var(--panel-border);
		position: relative;
		z-index: 0;
		border-radius: 0.75rem;
		overflow: hidden;
		animation: panel-pop 0.4s var(--ease-out-back) both;
	}

	@keyframes panel-pop {
		from {
			scale: 0.8;
			opacity: 0;
		}
		to {
			scale: 1;
			opacity: 1;
		}
	}

	/* Rotating highlight border */
	.victory-panel::before {
		content: '';
		position: absolute;
		width: 150%;
		aspect-ratio: 1;
		background-image: linear-gradient(
			90deg,
			var(--panel-border),
			var(--panel-highlight) 5%,
			var(--panel-highlight) 25%,
			var(--panel-border) 50%,
			var(--panel-border)
		);
		top: 50%;
		left: -25%;
		z-index: -2;
		transform-origin: top;
		animation: rotate 3s linear infinite;
	}

	.victory-panel::after {
		--offset: 3px;
		content: '';
		position: absolute;
		z-index: 1;
		left: var(--offset);
		top: var(--offset);
		width: calc(100% - var(--offset) * 2);
		height: calc(100% - var(--offset) * 2);
		background: var(--panel-bg);
		border-radius: 0.5rem;
	}

	@keyframes rotate {
		100% {
			transform: rotate(1turn);
		}
	}

	.inner {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		position: relative;
		z-index: 2;
	}

	.victory-text {
		display: grid;
		gap: 0.25rem;
		position: relative;
		z-index: 1;
	}

	.victory-text h3 {
		font-size: 1rem;
		font-weight: 700;
		font-family: ui-monospace, monospace;
		color: oklch(0.90 0.05 145);
		margin: 0;
		white-space: nowrap;
	}

	/* Star display container */
	.star-display {
		display: grid;
		grid-template-areas: 'center';
		place-content: center;
		width: 4rem;
		height: 4rem;
		--star-size: 1.5rem;
	}

	.single {
		--star-size: 2.5rem;
	}

	.double {
		--star-size: 2rem;
		--distance: calc(var(--star-size) * 0.5);
	}

	.double .star:first-child {
		--angle: 180deg;
	}

	.double .star:last-child {
		--angle: 0deg;
	}

	.circle,
	.confetti-blaster {
		--distance: calc(var(--star-size) * 0.75);
	}

	.circle .star,
	.confetti-blaster .star {
		--angle: calc(90deg + (var(--index) * 360deg / var(--count)));
	}

	.count-5 {
		--distance: calc(var(--star-size) * 0.8);
	}

	.over-five {
		--star-size: 1.25rem;
		--distance: calc(var(--star-size) * 1.25);
	}

	.confetti-blaster {
		--distance: 6em;
	}

	.confetti-blaster .star:not(:first-child) {
		--duration: 3s;
		animation:
			star-move var(--duration) ease-out both,
			fade-in-out 1.5s ease-out both;
		animation-delay: calc(var(--delay-multiplier) * 3s);
		--count: 10;
		--angle: calc(90deg + (var(--index) * 355deg / var(--count)));
	}

	.confetti-blaster .star:first-child {
		--distance: 0;
		--star-size: 2.5rem;
		z-index: 1;
	}

	/* Individual star styling */
	.star {
		--star-color: oklch(0.75 0.20 145);
		--delay: calc(var(--delay-multiplier) * 10s);
		--duration: 0.5s;

		grid-area: center;
		transform-origin: center;
		animation:
			star-move var(--duration) var(--ease-out-back) both,
			fade-in var(--duration) ease-out both;
		animation-delay: var(--delay);
		display: grid;
		grid-template-areas: 'center';
		position: relative;
	}

	.star-icon {
		width: var(--star-size);
		height: var(--star-size);
		grid-area: center;
	}

	.star-bg {
		stroke: var(--panel-bg);
		fill: var(--panel-bg);
	}

	.star-front {
		stroke: var(--star-color);
		fill: var(--star-color);
		scale: 0.9;
	}

	@keyframes star-move {
		from {
			rotate: -180deg;
			scale: 0.5;
		}
		to {
			translate: calc(cos(var(--angle)) * var(--distance))
				calc(sin(var(--angle)) * var(--distance));
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes fade-in-out {
		0% {
			opacity: 0;
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	/* Sparkle effect */
	.star-sparkles {
		--size: 60%;
		position: absolute;
		width: var(--size);
		height: var(--size);
		stroke: oklch(0.80 0.15 145);
		fill: oklch(0.95 0.05 145);
		top: 0;
		right: 0;
		animation: star-sparkles 3.5s ease-out both infinite;
		animation-delay: calc(var(--delay) + var(--duration) + 0.2s);
	}

	@keyframes star-sparkles {
		0% {
			opacity: 0;
			scale: 0;
		}
		15% {
			opacity: 1;
			scale: 1;
		}
		30% {
			opacity: 0;
			scale: 0;
		}
		100% {
			opacity: 0;
			scale: 0;
		}
	}
</style>
