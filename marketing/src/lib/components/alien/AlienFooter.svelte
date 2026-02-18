<script lang="ts">
	/**
	 * AlienFooter - Footer for THE ALIEN MANUAL
	 *
	 * Features:
	 * - Alien glyph decoration
	 * - Links to resources
	 * - "End transmission" theme
	 */

	const links = [
		{ label: 'GitHub', href: 'https://github.com/jomarchy/squad' },
		{ label: 'Documentation', href: '#chapters' },
		{ label: 'IDE', href: '#interface' }
	];

	const glyphs = ['⌬', '⏣', '⎔', '◬', '⧫', '⬡'];
</script>

<footer class="alien-footer">
	<!-- Decorative top border -->
	<div class="footer-border"></div>

	<div class="footer-content">
		<!-- Glyph decoration -->
		<div class="glyph-row">
			{#each glyphs as glyph, i}
				<span class="footer-glyph" style="--glyph-delay: {i * 0.1}s">{glyph}</span>
			{/each}
		</div>

		<!-- Main content -->
		<div class="footer-main">
			<div class="footer-logo">
				<span class="logo-glyph">⬢</span>
				<span class="logo-text">THE ALIEN MANUAL</span>
			</div>

			<nav class="footer-nav">
				{#each links as link}
					<a href={link.href} class="footer-link" target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}>
						{link.label}
					</a>
				{/each}
			</nav>
		</div>

		<!-- End transmission -->
		<div class="transmission-end">
			<div class="end-line"></div>
			<span class="end-text">END TRANSMISSION</span>
			<div class="end-line"></div>
		</div>

		<!-- Credits -->
		<div class="footer-credits">
			<p class="credits-text">
				Built with <span class="credits-highlight">Claude Code</span> + <span class="credits-highlight">SQUAD</span>
			</p>
			<p class="credits-quote">
				"Clearly some powerful alien tool was handed around..."
				<br />
				<cite>— @karpathy</cite>
			</p>
		</div>

		<!-- Bottom glyph row -->
		<div class="glyph-row reverse">
			{#each glyphs as glyph, i}
				<span class="footer-glyph dim" style="--glyph-delay: {i * 0.1}s">{glyph}</span>
			{/each}
		</div>
	</div>
</footer>

<style>
	.alien-footer {
		position: relative;
		background: oklch(4% 0.02 280);
		overflow: hidden;
	}

	/* Top border */
	.footer-border {
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			oklch(70% 0.25 280 / 0.5) 50%,
			transparent 100%
		);
	}

	/* Content */
	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 4rem 2rem;
	}

	/* Glyph decoration */
	.glyph-row {
		display: flex;
		justify-content: center;
		gap: 2rem;
		margin-bottom: 3rem;
	}

	.glyph-row.reverse {
		margin-bottom: 0;
		margin-top: 3rem;
	}

	.footer-glyph {
		font-size: 1.25rem;
		color: oklch(70% 0.25 280 / 0.4);
		animation: glyph-float 3s ease-in-out infinite;
		animation-delay: var(--glyph-delay);
	}

	.footer-glyph.dim {
		color: oklch(70% 0.25 280 / 0.2);
	}

	@keyframes glyph-float {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-5px); }
	}

	/* Main section */
	.footer-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		margin-bottom: 3rem;
	}

	@media (min-width: 640px) {
		.footer-main {
			flex-direction: row;
			justify-content: space-between;
		}
	}

	/* Logo */
	.footer-logo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logo-glyph {
		font-size: 1.5rem;
		color: oklch(70% 0.25 280);
		text-shadow: 0 0 10px oklch(70% 0.25 280 / 0.5);
	}

	.logo-text {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		color: oklch(70% 0.02 280);
	}

	/* Navigation */
	.footer-nav {
		display: flex;
		gap: 2rem;
	}

	.footer-link {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: oklch(55% 0.02 280);
		text-decoration: none;
		letter-spacing: 0.05em;
		transition: color 0.2s ease;
	}

	.footer-link:hover {
		color: oklch(70% 0.25 280);
	}

	/* End transmission */
	.transmission-end {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.end-line {
		flex: 1;
		max-width: 100px;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent,
			oklch(50% 0.02 280 / 0.5),
			transparent
		);
	}

	.end-text {
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		color: oklch(45% 0.02 280);
	}

	/* Credits */
	.footer-credits {
		text-align: center;
	}

	.credits-text {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: oklch(50% 0.02 280);
		margin: 0 0 1rem;
	}

	.credits-highlight {
		color: oklch(65% 0.15 180);
	}

	.credits-quote {
		font-size: 0.8rem;
		font-style: italic;
		color: oklch(45% 0.02 280);
		line-height: 1.6;
		margin: 0;
	}

	.credits-quote cite {
		font-style: normal;
		color: oklch(55% 0.02 280);
	}
</style>
