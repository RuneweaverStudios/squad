<script lang="ts">
	import Logo from './Logo.svelte';

	let copied = $state(false);

	const installCommand = 'curl -fsSL https://raw.githubusercontent.com/joewinke/jat/main/tools/scripts/bootstrap.sh | bash';

	async function copyCommand() {
		await navigator.clipboard.writeText(installCommand);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	const credits = [
		{ name: 'Joe Winke', link: 'https://github.com/joewinke', label: 'Creator' },
		{ name: 'Steve Yegge', link: 'https://steve-yegge.blogspot.com/', label: 'Beads' },
		{ name: 'Nicholas Marriot', link: 'https://github.com/tmux/tmux', label: 'Tmux' },
		{ name: 'Jeff Emanuel', link: 'https://github.com/Dicklesworthstone/mcp_agent_mail', label: 'Agent Mail' }
	];
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
			<div class="text-center mb-8">
				<p class="text-sm text-gray-500 mb-4">Standing on the shoulders of giants</p>
				<div class="flex flex-wrap items-center justify-center gap-6">
					{#each credits as credit}
						<a
							href={credit.link}
							target="_blank"
							rel="noopener noreferrer"
							class="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
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
