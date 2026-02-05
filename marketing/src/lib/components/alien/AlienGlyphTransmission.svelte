<script lang="ts">
	/**
	 * AlienGlyphTransmission - The Karpathy quote as alien transmission
	 *
	 * Features:
	 * - Quote displayed as "decoded transmission"
	 * - Animated glyphs that translate to text
	 * - Holographic display effect
	 */
	import { onMount } from 'svelte';

	let visible = $state(false);
	let decodingProgress = $state(0);
	let sectionEl: HTMLElement;

	// The quote fragments
	const fragments = [
		{ glyph: '⌬', text: 'Clearly some powerful' },
		{ glyph: '⏣', text: 'alien tool was handed around' },
		{ glyph: '⎔', text: 'except it comes with' },
		{ glyph: '◬', text: 'no manual' },
		{ glyph: '⧫', text: 'and everyone has to figure out' },
		{ glyph: '⬡', text: 'how to hold it and operate it...' }
	];

	// Terms that float around
	const floatingTerms = [
		'agents', 'subagents', 'prompts', 'contexts', 'memory',
		'modes', 'permissions', 'tools', 'plugins', 'skills',
		'hooks', 'MCP', 'workflows', 'signals', 'tasks'
	];

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					visible = true;
					// Animate decoding
					let progress = 0;
					const interval = setInterval(() => {
						progress += 0.5;
						decodingProgress = Math.min(progress, 100);
						if (progress >= 100) clearInterval(interval);
					}, 30);
				}
			},
			{ threshold: 0.3 }
		);

		if (sectionEl) observer.observe(sectionEl);

		return () => observer.disconnect();
	});
</script>

<section id="transmission" class="alien-transmission" bind:this={sectionEl}>
	<!-- Background effects -->
	<div class="transmission-bg">
		<div class="bg-glow"></div>
		<div class="bg-grid"></div>
	</div>

	<div class="transmission-content" class:visible>
		<!-- Header -->
		<div class="transmission-header">
			<div class="header-line"></div>
			<span class="header-text">
				<span class="header-glyph">◈</span>
				DECODED TRANSMISSION
				<span class="header-glyph">◈</span>
			</span>
			<div class="header-line"></div>
		</div>

		<!-- Main quote display -->
		<div class="quote-container">
			<div class="quote-frame">
				<!-- Decoding progress bar -->
				<div class="decode-progress">
					<div class="progress-bar" style="width: {decodingProgress}%"></div>
					<span class="progress-text">DECODING: {Math.floor(decodingProgress)}%</span>
				</div>

				<!-- Quote fragments -->
				<blockquote class="quote-text">
					{#each fragments as fragment, i}
						<span
							class="quote-fragment"
							class:decoded={decodingProgress > (i + 1) * (100 / fragments.length)}
							style="--delay: {i * 0.1}s"
						>
							<span class="fragment-glyph">{fragment.glyph}</span>
							<span class="fragment-text">{fragment.text}</span>
						</span>
						{#if i < fragments.length - 1}
							<br />
						{/if}
					{/each}
				</blockquote>

				<!-- Floating tech terms -->
				<div class="floating-terms">
					{#each floatingTerms as term, i}
						<span
							class="floating-term"
							style="
								--float-delay: {i * 0.2}s;
								--float-x: {(i % 5) * 20 - 40}%;
								--float-y: {Math.floor(i / 5) * 30 - 15}%;
							"
						>
							{term}
						</span>
					{/each}
				</div>
			</div>

			<!-- Attribution -->
			<cite class="quote-attribution">
				<a
					href="https://x.com/karpathy/status/2004607146781278521"
					target="_blank"
					rel="noopener noreferrer"
				>
					— @karpathy
				</a>
				<span class="attribution-context">on the state of AI-assisted programming</span>
			</cite>
		</div>

		<!-- Response -->
		<div class="transmission-response">
			<div class="response-line"></div>
			<p class="response-text">
				<span class="response-glyph">⬢</span>
				<span class="response-main">This is the manual.</span>
			</p>
		</div>
	</div>
</section>

<style>
	.alien-transmission {
		position: relative;
		padding: 8rem 2rem;
		overflow: hidden;
	}

	/* Background */
	.transmission-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.bg-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 800px;
		height: 600px;
		transform: translate(-50%, -50%);
		background: radial-gradient(
			ellipse at center,
			oklch(70% 0.25 280 / 0.1) 0%,
			transparent 70%
		);
	}

	/* AI-generated artifact image */
	.transmission-bg::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 400px;
		height: 400px;
		transform: translate(-50%, -50%);
		background: url('/images/alien/transmission-artifact.png') center/contain no-repeat;
		opacity: 0.08;
		animation: artifact-pulse 4s ease-in-out infinite;
	}

	@keyframes artifact-pulse {
		0%, 100% { opacity: 0.05; transform: translate(-50%, -50%) scale(1); }
		50% { opacity: 0.12; transform: translate(-50%, -50%) scale(1.05); }
	}

	.bg-grid {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(oklch(70% 0.25 280 / 0.03) 1px, transparent 1px),
			linear-gradient(90deg, oklch(70% 0.25 280 / 0.03) 1px, transparent 1px);
		background-size: 40px 40px;
	}

	/* Content */
	.transmission-content {
		position: relative;
		z-index: 1;
		max-width: 900px;
		margin: 0 auto;
		opacity: 0;
		transform: translateY(30px);
		transition: all 0.8s ease;
	}

	.transmission-content.visible {
		opacity: 1;
		transform: translateY(0);
	}

	/* Header */
	.transmission-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 3rem;
	}

	.header-line {
		flex: 1;
		max-width: 100px;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent,
			oklch(70% 0.25 280 / 0.5),
			transparent
		);
	}

	.header-text {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		color: oklch(70% 0.25 280);
	}

	.header-glyph {
		font-size: 0.9rem;
		animation: header-glyph-pulse 2s ease-in-out infinite;
	}

	@keyframes header-glyph-pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	/* Quote container */
	.quote-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}

	.quote-frame {
		position: relative;
		padding: 3rem;
		background: oklch(8% 0.02 280 / 0.8);
		border: 1px solid oklch(70% 0.25 280 / 0.2);
		border-radius: 8px;
		backdrop-filter: blur(10px);
	}

	/* Decoding progress */
	.decode-progress {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: oklch(20% 0.02 280);
		border-radius: 8px 8px 0 0;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(
			90deg,
			oklch(70% 0.25 280),
			oklch(65% 0.20 180)
		);
		transition: width 0.1s ease;
	}

	.progress-text {
		position: absolute;
		top: 8px;
		right: 12px;
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		color: oklch(50% 0.02 280);
	}

	/* Quote text */
	.quote-text {
		margin: 1rem 0;
		font-size: 1.25rem;
		line-height: 1.8;
		color: oklch(70% 0.02 280);
		text-align: center;
	}

	.quote-fragment {
		display: inline;
		opacity: 0;
		transition: all 0.5s ease;
		transition-delay: var(--delay);
	}

	.quote-fragment.decoded {
		opacity: 1;
	}

	.quote-fragment.decoded .fragment-text {
		color: oklch(85% 0.02 280);
	}

	.fragment-glyph {
		display: none;
		margin-right: 0.5rem;
		color: oklch(70% 0.25 280);
		font-size: 1rem;
	}

	.quote-fragment:not(.decoded) .fragment-glyph {
		display: inline;
	}

	.quote-fragment:not(.decoded) .fragment-text {
		display: none;
	}

	/* Floating terms */
	.floating-terms {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.floating-term {
		position: absolute;
		left: calc(50% + var(--float-x));
		top: calc(50% + var(--float-y));
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		color: oklch(50% 0.10 280 / 0.4);
		animation: term-float 8s ease-in-out infinite;
		animation-delay: var(--float-delay);
	}

	@keyframes term-float {
		0%, 100% {
			transform: translate(-50%, -50%) translateY(0);
			opacity: 0.3;
		}
		50% {
			transform: translate(-50%, -50%) translateY(-10px);
			opacity: 0.6;
		}
	}

	/* Attribution */
	.quote-attribution {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		font-style: normal;
	}

	.quote-attribution a {
		color: oklch(70% 0.25 280);
		text-decoration: none;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		transition: color 0.2s ease;
	}

	.quote-attribution a:hover {
		color: oklch(80% 0.25 280);
		text-decoration: underline;
	}

	.attribution-context {
		font-size: 0.75rem;
		color: oklch(50% 0.02 280);
	}

	/* Response */
	.transmission-response {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		margin-top: 4rem;
	}

	.response-line {
		width: 1px;
		height: 60px;
		background: linear-gradient(
			180deg,
			oklch(70% 0.25 280 / 0.5),
			transparent
		);
	}

	.response-text {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
	}

	.response-glyph {
		font-size: 1.5rem;
		color: oklch(70% 0.25 280);
		text-shadow: 0 0 20px oklch(70% 0.25 280 / 0.5);
		animation: response-glyph-pulse 2s ease-in-out infinite;
	}

	@keyframes response-glyph-pulse {
		0%, 100% { transform: scale(1); opacity: 0.8; }
		50% { transform: scale(1.1); opacity: 1; }
	}

	.response-main {
		font-family: ui-monospace, monospace;
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(90% 0.02 280);
		letter-spacing: 0.05em;
	}
</style>
