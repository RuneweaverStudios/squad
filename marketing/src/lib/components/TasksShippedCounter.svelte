<script lang="ts">
	interface Props {
		count?: number;
	}

	let { count = 0 }: Props = $props();

	// Track previous count to detect increments
	let prevCount = $state(0);
	let showBurst = $state(false);

	// Trigger burst animation when count increases
	$effect(() => {
		if (count > prevCount && count > 0) {
			showBurst = true;
			setTimeout(() => {
				showBurst = false;
			}, 800);
		}
		prevCount = count;
	});

	function getVariantClasses(n: number): string[] {
		const classes: string[] = [];

		if (n === 1) {
			classes.push('single');
			return classes;
		}

		if (n === 2) {
			classes.push('double');
			return classes;
		}

		if (n > 5) {
			classes.push('over-five');
		}

		if (n <= 10) {
			classes.push('circle');
			return classes;
		}

		classes.push('confetti-blaster');

		return classes;
	}

	let variantClasses = $derived(getVariantClasses(count));
	let stars = $derived(Array.from({ length: count }, (_, i) => i));
</script>

<div class="tasks-shipped-panel rainbow">
	<!-- Success burst animation -->
	{#if showBurst}
		<div class="burst-container">
			<div class="burst-ring"></div>
			<div class="burst-ring burst-ring-2"></div>
			<div class="burst-particles">
				{#each Array(8) as _, i}
					<div class="burst-particle" style="--angle: {i * 45}deg;"></div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="inner">
		<h3 class="title">Tasks Shipped</h3>

		{#if count > 0}
			<div
				class="star-display {variantClasses.join(' ')} count-{count}"
				style="--count: {count}"
			>
				{#each stars as index (index)}
					<div
						class="star"
						style="--index: {index}; --delay-multiplier: {0.01 * index}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="star-icon star-bg"
							aria-hidden="true"
						>
							<path
								d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
							></path>
						</svg>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="star-icon star-front"
							aria-hidden="true"
						>
							<path
								d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
							></path>
						</svg>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="star-sparkles"
							aria-hidden="true"
						>
							<path
								d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
							></path>
						</svg>
					</div>
				{/each}
			</div>
		{:else}
			<div class="loading-state">
				<span class="loading loading-spinner loading-md text-[var(--color-primary)]"></span>
				<p class="loading-text">Agent working...</p>
			</div>
		{/if}
	</div>
</div>

<style>
	:root {
		--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.tasks-shipped-panel {
		--panel-bg: rgba(17, 24, 39, 0.9);
		--panel-border: rgba(55, 65, 81, 0.8);
		--panel-highlight: var(--color-primary, #22d3ee);
		--star-color: var(--color-primary, #22d3ee);
	}

	.inner {
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-radius: 0.5rem;
		display: flex;
		flex-direction: column;
		place-content: center;
		position: relative;
		z-index: 2;
	}

	.title {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(156, 163, 175, 1);
		margin: 0;
	}

	.count-display {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-primary, #22d3ee);
		margin: 0;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
	}

	.loading-text {
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(156, 163, 175, 1);
		margin: 0;
		animation: pulse-text 2s ease-in-out infinite;
	}

	@keyframes pulse-text {
		0%, 100% {
			opacity: 0.7;
		}
		50% {
			opacity: 1;
		}
	}

	/* Panel styling */
	.rainbow {
		width: fit-content;
		background-color: var(--panel-bg);
		border: 1px solid var(--panel-border);
		border-radius: 0.75rem;
		position: relative;
		overflow: visible;
	}

	/* Star display */
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
		--distance: calc(var(--star-size) * 1 / 2);
	}

	.double :first-child {
		--angle: 180deg;
	}

	.double :last-child {
		--angle: 0deg;
	}

	.confetti-blaster,
	.circle {
		--distance: calc(var(--star-size) * 3 / 4);
	}

	.confetti-blaster .star,
	.circle .star {
		--angle: 90deg + calc(var(--index) * 360deg / var(--count));
	}

	.count-5 {
		--distance: calc(var(--star-size) * 4 / 5);
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
		--angle: 90deg + calc(var(--index) * 355deg / var(--count));
	}

	.confetti-blaster .star:first-child {
		--distance: 0;
		--star-size: 2.5rem;
		z-index: 1;
	}

	.star {
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

	.star-sparkles {
		--size: 65%;
		position: absolute;
		width: var(--size);
		height: var(--size);
		stroke: var(--star-color);
		fill: white;
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

	/* Success burst animation */
	.burst-container {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 10;
	}

	.burst-ring {
		position: absolute;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 3px solid var(--color-primary, #22d3ee);
		animation: burst-expand 0.8s ease-out forwards;
	}

	.burst-ring-2 {
		animation-delay: 0.1s;
		border-color: var(--color-secondary, #a855f7);
	}

	@keyframes burst-expand {
		0% {
			width: 20px;
			height: 20px;
			opacity: 1;
		}
		100% {
			width: 150px;
			height: 150px;
			opacity: 0;
		}
	}

	.burst-particles {
		position: absolute;
		width: 0;
		height: 0;
	}

	.burst-particle {
		position: absolute;
		width: 8px;
		height: 8px;
		background: var(--color-primary, #22d3ee);
		border-radius: 50%;
		animation: burst-particle 0.6s ease-out forwards;
	}

	.burst-particle:nth-child(odd) {
		background: var(--color-secondary, #a855f7);
	}

	@keyframes burst-particle {
		0% {
			transform: rotate(var(--angle)) translateX(0);
			opacity: 1;
		}
		100% {
			transform: rotate(var(--angle)) translateX(60px);
			opacity: 0;
		}
	}
</style>
