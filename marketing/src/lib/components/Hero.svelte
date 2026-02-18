<script lang="ts">
	import SwarmCanvas from './SwarmCanvas.svelte';
</script>

<section class="relative min-h-screen flex items-center justify-center overflow-hidden">
	<!-- Canvas Background -->
	<SwarmCanvas />

	<!-- Gradient overlay -->
	<div class="hero-gradient absolute inset-0 pointer-events-none"></div>

	<!-- Content -->
	<div class="relative z-10 max-w-5xl mx-auto px-6 text-center">
		<!-- Badge -->
		<div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-surface)]/80 backdrop-blur-sm border border-[var(--color-primary)]/30 mb-8 animate-fade-up">
			<span class="relative flex h-2 w-2">
				<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
				<span class="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-success)]"></span>
			</span>
			<span class="text-sm text-gray-300">Finally. Structure meets AI coding.</span>
		</div>

		<!-- Headline -->
		<h1 class="heading-xl text-white mb-6 animate-fade-up delay-100">
			Scale AI coding across
			<span class="text-glow bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] bg-clip-text text-transparent">
				all your projects.
			</span>
		</h1>

		<!-- Subheadline - THE KEY MESSAGE -->
		<p class="text-xl text-gray-400 max-w-3xl mx-auto mb-6 animate-fade-up delay-200 leading-relaxed">
			Epics. Features. Tasks. Dependencies. The same structure your team already uses&mdash;now powering
			<span class="text-white font-medium">20, 30, even 40 AI agents</span> working in parallel across every project you manage.
		</p>

		<p class="text-lg text-gray-500 max-w-2xl mx-auto mb-10 animate-fade-up delay-300">
			SQUAD brings software engineering best practices to agentic development.
			No more chaos. No more context switching. Just structured, scalable AI-assisted coding.
		</p>

		<!-- CTAs -->
		<div class="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up delay-400">
			<a
				href="#install"
				class="btn btn-primary btn-lg btn-glow rounded-full px-8 font-semibold shadow-xl"
			>
				Get Started Free
			</a>
			<a
				href="#workflow"
				class="btn btn-outline btn-lg rounded-full px-8 font-semibold border-gray-600 text-gray-300 hover:border-[var(--color-primary)] hover:text-white"
			>
				See How It Works
			</a>
		</div>

		<!-- Stats - reframed around scale -->
		<div class="mt-16 grid grid-cols-3 gap-8 max-w-xl mx-auto animate-fade-up delay-500">
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
