<script lang="ts">
	let isPlaying = $state(false);

	function handlePlay() {
		isPlaying = true;
		// In production, this would trigger video playback
	}
</script>

<section id="demo" class="py-32 bg-[var(--bg-surface)]/50">
	<div class="max-w-5xl mx-auto px-6">
		<!-- Section header -->
		<div class="text-center mb-12">
			<h2 class="heading-lg text-white mb-4">See It in Action</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				Watch a real development session with multiple agents working in parallel.
			</p>
		</div>

		<!-- Video container -->
		<div class="relative rounded-2xl overflow-hidden gradient-border group">
			<!-- Aspect ratio container -->
			<div class="aspect-video bg-[var(--bg-deep)] relative">
				<!-- Placeholder / Thumbnail -->
				{#if !isPlaying}
					<div class="absolute inset-0 flex items-center justify-center">
						<!-- Background gradient -->
						<div class="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-secondary)]/10"></div>

						<!-- Fake IDE preview -->
						<div class="absolute inset-4 rounded-lg border border-gray-800 bg-[var(--bg-surface)]/50 overflow-hidden">
							<!-- Header bar -->
							<div class="h-10 bg-[var(--bg-elevated)] border-b border-gray-800 flex items-center px-4 gap-2">
								<div class="w-3 h-3 rounded-full bg-red-500/60"></div>
								<div class="w-3 h-3 rounded-full bg-yellow-500/60"></div>
								<div class="w-3 h-3 rounded-full bg-green-500/60"></div>
								<span class="ml-4 text-xs text-gray-500 font-mono">SQUAD IDE</span>
							</div>

							<!-- Content grid -->
							<div class="p-4 grid grid-cols-3 gap-4">
								{#each Array(6) as _, i}
									<div
										class="h-20 rounded-lg bg-[var(--bg-elevated)]/50 border border-gray-800 p-3"
										style="animation-delay: {i * 150}ms"
									>
										<div class="flex items-center gap-2 mb-2">
											<div
												class="w-2 h-2 rounded-full pulse-glow"
												style="background: {['var(--color-primary)', 'var(--color-success)', 'var(--color-warning)'][i % 3]}"
											></div>
											<div class="h-2 w-16 bg-gray-700 rounded"></div>
										</div>
										<div class="h-2 w-full bg-gray-800 rounded mb-1"></div>
										<div class="h-2 w-3/4 bg-gray-800 rounded"></div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Play button -->
						<button
							onclick={handlePlay}
							aria-label="Play demo video"
							class="relative z-10 w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center shadow-2xl glow-primary transition-transform hover:scale-110 active:scale-95"
						>
							<svg class="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
								<path d="M8 5v14l11-7z"></path>
							</svg>
						</button>
					</div>
				{:else}
					<!-- Placeholder for actual video embed -->
					<div class="absolute inset-0 flex items-center justify-center text-gray-500">
						<p>Video player would load here</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Video features -->
		<div class="mt-8 grid md:grid-cols-3 gap-6 text-center">
			<div>
				<div class="text-2xl font-bold text-white mb-1">2:47</div>
				<div class="text-sm text-gray-500">Duration</div>
			</div>
			<div>
				<div class="text-2xl font-bold text-white mb-1">4 Agents</div>
				<div class="text-sm text-gray-500">Working in Parallel</div>
			</div>
			<div>
				<div class="text-2xl font-bold text-white mb-1">12 Tasks</div>
				<div class="text-sm text-gray-500">Completed</div>
			</div>
		</div>
	</div>
</section>
