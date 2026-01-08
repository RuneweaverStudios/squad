<script lang="ts">
	import Logo from './Logo.svelte';
	import { onMount } from 'svelte';

	let copied = $state(false);
	let creditsContainer: HTMLDivElement;
	let fairy: HTMLDivElement;
	let currentCreditIndex = $state(0);
	let creditElements: HTMLAnchorElement[] = [];

	const installCommand = 'curl -fsSL https://raw.githubusercontent.com/joewinke/jat/main/tools/scripts/bootstrap.sh | bash';

	async function copyCommand() {
		await navigator.clipboard.writeText(installCommand);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	const credits = [
		{ name: 'Joe Winke', link: 'https://github.com/joewinke', label: 'Creator' },
		{ name: 'Steve Yegge', link: 'https://steve-yegge.blogspot.com/', label: 'Beads' },
		{ name: 'Nicholas Marriott', link: 'https://github.com/tmux/tmux', label: 'Tmux' },
		{ name: 'Jeff Emanuel', link: 'https://github.com/Dicklesworthstone/mcp_agent_mail', label: 'Agent Mail' },
		{ name: 'Mario Zechner', link: 'https://mariozechner.at/', label: 'Inspiration' },
		{ name: 'Andrej Karpathy', link: 'https://karpathy.ai/', label: 'Inspiration' },
		{ name: 'DHH', link: 'https://dhh.dk/', label: 'Inspiration' },
		{ name: 'Rich Harris', link: 'https://github.com/Rich-Harris', label: 'SvelteKit' },
		{ name: 'Microsoft', link: 'https://github.com/microsoft/monaco-editor', label: 'Monaco' },
		{ name: 'Adam Wathan', link: 'https://github.com/adamwathan', label: 'Tailwind' },
		{ name: 'Pouya Saadeghi', link: 'https://github.com/saadeghi', label: 'DaisyUI' },
		{ name: 'Evan You', link: 'https://github.com/yyx990803', label: 'Vite' },
		{ name: 'Mike Bostock', link: 'https://github.com/mbostock', label: 'D3.js' },
		{ name: 'Anthropic', link: 'https://anthropic.com', label: 'Claude' }
	];

	// Sparkle fairy animation
	let isHovering = $state(false);
	let autoAnimationInterval: ReturnType<typeof setInterval> | null = null;
	let trailInterval: ReturnType<typeof setInterval> | null = null;
	let lastFairyX = 0;
	let lastFairyY = 0;

	function createSparkle(x: number, y: number, isTrail = false) {
		if (!creditsContainer) return;
		const sparkle = document.createElement('div');
		sparkle.className = isTrail ? 'sparkle-trail' : 'sparkle-particle';
		sparkle.style.left = `${x}px`;
		sparkle.style.top = `${y}px`;
		creditsContainer.appendChild(sparkle);
		setTimeout(() => sparkle.remove(), isTrail ? 800 : 600);
	}

	function moveFairyTo(x: number, y: number) {
		if (!fairy) return;

		lastFairyX = x;
		lastFairyY = y;
		fairy.style.left = `${x}px`;
		fairy.style.top = `${y}px`;
	}

	function moveFairyToCredit(index: number) {
		if (!fairy || !creditElements[index] || !creditsContainer) return;

		const containerRect = creditsContainer.getBoundingClientRect();
		const creditRect = creditElements[index].getBoundingClientRect();

		const x = creditRect.left - containerRect.left + creditRect.width / 2;
		const y = creditRect.top - containerRect.top + creditRect.height / 2;

		moveFairyTo(x, y);

		// Create trail sparkles
		for (let i = 0; i < 3; i++) {
			setTimeout(() => {
				const offsetX = x + (Math.random() - 0.5) * 40;
				const offsetY = y + (Math.random() - 0.5) * 20;
				createSparkle(offsetX, offsetY);
			}, i * 100);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!creditsContainer || !isHovering) return;

		const containerRect = creditsContainer.getBoundingClientRect();
		const x = e.clientX - containerRect.left;
		const y = e.clientY - containerRect.top;

		moveFairyTo(x, y, false);
	}

	function handleMouseEnter() {
		isHovering = true;
		// Stop auto animation
		if (autoAnimationInterval) {
			clearInterval(autoAnimationInterval);
			autoAnimationInterval = null;
		}
		// Start comet trail
		trailInterval = setInterval(() => {
			if (isHovering && lastFairyX && lastFairyY) {
				const offsetX = lastFairyX + (Math.random() - 0.5) * 10;
				const offsetY = lastFairyY + (Math.random() - 0.5) * 10;
				createSparkle(offsetX, offsetY, true);
			}
		}, 50);
	}

	function handleMouseLeave() {
		isHovering = false;
		// Stop trail
		if (trailInterval) {
			clearInterval(trailInterval);
			trailInterval = null;
		}
		// Resume auto animation from current position
		moveFairyToCredit(currentCreditIndex);
		resumeAutoAnimation();
	}

	function startAutoAnimation() {
		// Initial position
		setTimeout(() => moveFairyToCredit(0), 500);
		resumeAutoAnimation();
	}

	function resumeAutoAnimation() {
		autoAnimationInterval = setInterval(() => {
			if (!isHovering) {
				currentCreditIndex = (currentCreditIndex + 1) % credits.length;
				moveFairyToCredit(currentCreditIndex);
			}
		}, 2500);
	}

	onMount(() => {
		// Collect credit elements
		creditElements = Array.from(creditsContainer.querySelectorAll('.credit-link'));

		startAutoAnimation();

		return () => {
			if (autoAnimationInterval) clearInterval(autoAnimationInterval);
			if (trailInterval) clearInterval(trailInterval);
		};
	});
</script>

<footer id="install" class="py-32 relative overflow-hidden">
	<!-- Background glow -->
	<div class="mt-12 absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl" style="background: var(--color-primary); opacity: 0.05"></div>

	<div class="max-w-4xl mx-auto px-6 relative">
		<!-- CTA Section -->
		<div class="text-center mb-16">
			<h2 class="heading-lg text-white mb-4">
				Ready to scale your AI development?
			</h2>
			<p class="text-gray-400 text-lg max-w-xl mx-auto mb-8">
				One command. All your projects. As many agents as you need.
				<br />
				<span class="text-gray-500">Runs locally. No cloud. Bring your own Coding Agent.</span>
			</p>

			<!-- Install command -->
			<div class="gradient-border p-1 max-w-2xl mx-auto mb-8">
				<div class="code-block flex items-center justify-between p-4 gap-4">
					<code class="text-sm text-gray-300 font-mono truncate flex-1">
						{installCommand}
					</code>
					<button
						onclick={copyCommand}
						class="btn btn-sm btn-ghost text-gray-400 hover:text-white shrink-0"
					>
						{#if copied}
							<svg class="w-5 h-5 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
							</svg>
						{:else}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
							</svg>
						{/if}
					</button>
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
				<a
					href="https://github.com/joewinke/jat"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-primary btn-lg btn-glow rounded-full px-8 font-semibold shadow-xl flex items-center gap-2"
				>
					<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
					</svg>
					View on GitHub
				</a>
				<a
					href="https://github.com/joewinke/jat#readme"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-outline btn-lg rounded-full px-8 font-semibold border-gray-600 text-gray-300 hover:border-[var(--color-primary)] hover:text-white"
				>
					Read the Docs
				</a>
			</div>
		</div>

		<!-- Credits -->
		<div class="border-t border-gray-800 pt-12">
			<div class="text-center mb-20">
				<p class="text-sm text-gray-500 mb-4">Standing on the shoulders of giants</p>
				<div
					bind:this={creditsContainer}
					class="credits-container flex flex-wrap items-center justify-center gap-6 relative"
					onmousemove={handleMouseMove}
					onmouseenter={handleMouseEnter}
					onmouseleave={handleMouseLeave}
					role="region"
					aria-label="Credits"
				>
					<!-- Sparkle Fairy -->
					<div bind:this={fairy} class="sparkle-fairy" class:fairy-fast={isHovering}>
						<div class="fairy-core"></div>
						<div class="fairy-glow"></div>
						<div class="fairy-ring"></div>
					</div>

					{#each credits as credit, i}
						<a
							href={credit.link}
							target="_blank"
							rel="noopener noreferrer"
							class="credit-link group flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
							class:credit-active={i === currentCreditIndex}
						>
							<span class="text-sm font-medium">{credit.name}</span>
							<span class="text-xs text-gray-600 group-hover:text-gray-500">({credit.label})</span>
						</a>
					{/each}
				</div>
			</div>

			<!-- Bottom bar -->
			<div class="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
				<div class="flex items-center gap-3">
					<Logo />
					<span>Jomarchy Agent Tools</span>
				</div>
				<div class="flex items-center gap-6">
					<a href="https://discord.gg/AFJf93p7Bx" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors flex items-center gap-1">
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
						</svg>
						Discord
					</a>
					<span class="text-gray-700">|</span>
					<a href="https://github.com/joewinke/jat/issues" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">
						Report Issue
					</a>
					<span class="text-gray-700">|</span>
					<span>Built with Claude Code</span>
				</div>
			</div>
		</div>
	</div>
</footer>

<style>
	.credits-container {
		min-height: 80px;
	}

	/* Sparkle Fairy */
	.sparkle-fairy {
		position: absolute;
		width: 20px;
		height: 20px;
		pointer-events: none;
		z-index: 10;
		transform: translate(-50%, -50%);
		transition: left 1.2s cubic-bezier(0.34, 1.56, 0.64, 1),
		            top 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		animation: fairy-float 2s ease-in-out infinite;
	}

	/* Faster movement when following cursor */
	.sparkle-fairy.fairy-fast {
		transition: left 0.08s ease-out,
		            top 0.08s ease-out;
	}

	@keyframes fairy-float {
		0%, 100% {
			transform: translate(-50%, -50%) translateX(0px) translateY(0px) rotate(-8deg);
		}
		25% {
			transform: translate(-50%, -50%) translateX(5px) translateY(-4px) rotate(0deg);
		}
		50% {
			transform: translate(-50%, -50%) translateX(0px) translateY(-6px) rotate(8deg);
		}
		75% {
			transform: translate(-50%, -50%) translateX(-5px) translateY(-4px) rotate(0deg);
		}
	}

	.fairy-core {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 6px;
		height: 6px;
		background: linear-gradient(135deg, #ffd700, #fff8dc);
		border-radius: 50%;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 8px 2px rgba(255, 215, 0, 0.9),
		            0 0 16px 4px rgba(255, 215, 0, 0.6),
		            0 0 24px 6px rgba(255, 215, 0, 0.3);
		animation: fairy-pulse 1.5s ease-in-out infinite;
	}

	.fairy-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 24px;
		height: 24px;
		background: radial-gradient(circle, rgba(255, 215, 0, 0.4) 0%, transparent 70%);
		border-radius: 50%;
		transform: translate(-50%, -50%);
		animation: fairy-glow-pulse 2s ease-in-out infinite;
	}

	.fairy-ring {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 16px;
		height: 16px;
		border: 1px solid rgba(255, 215, 0, 0.5);
		border-radius: 50%;
		transform: translate(-50%, -50%);
		animation: fairy-ring-spin 3s linear infinite;
	}

	@keyframes fairy-pulse {
		0%, 100% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 1;
		}
		50% {
			transform: translate(-50%, -50%) scale(1.3);
			opacity: 0.8;
		}
	}

	@keyframes fairy-glow-pulse {
		0%, 100% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 0.6;
		}
		50% {
			transform: translate(-50%, -50%) scale(1.5);
			opacity: 0.3;
		}
	}

	@keyframes fairy-ring-spin {
		0% {
			transform: translate(-50%, -50%) rotate(0deg) scale(1);
			opacity: 0.6;
		}
		50% {
			transform: translate(-50%, -50%) rotate(180deg) scale(1.2);
			opacity: 0.3;
		}
		100% {
			transform: translate(-50%, -50%) rotate(360deg) scale(1);
			opacity: 0.6;
		}
	}

	/* Sparkle particles */
	:global(.sparkle-particle) {
		position: absolute;
		width: 4px;
		height: 4px;
		background: #ffd700;
		border-radius: 50%;
		pointer-events: none;
		transform: translate(-50%, -50%);
		animation: sparkle-fade 0.6s ease-out forwards;
		box-shadow: 0 0 4px 1px rgba(255, 215, 0, 0.8);
	}

	@keyframes sparkle-fade {
		0% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, calc(-50% - 20px)) scale(0);
		}
	}

	/* Comet trail particles */
	:global(.sparkle-trail) {
		position: absolute;
		width: 3px;
		height: 3px;
		background: linear-gradient(135deg, #ffd700, #ffec8b);
		border-radius: 50%;
		pointer-events: none;
		transform: translate(-50%, -50%);
		animation: trail-fade 0.8s ease-out forwards;
		box-shadow: 0 0 6px 2px rgba(255, 215, 0, 0.6),
		            0 0 12px 4px rgba(255, 215, 0, 0.3);
	}

	@keyframes trail-fade {
		0% {
			opacity: 0.8;
			transform: translate(-50%, -50%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.3);
		}
	}

	/* Active credit highlight */
	.credit-link {
		transition: all 0.3s ease;
	}

	.credit-active {
		color: #ffd700 !important;
		text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
	}

	.credit-active span:first-child {
		color: #ffd700;
	}
</style>
