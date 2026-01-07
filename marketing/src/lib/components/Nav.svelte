<script lang="ts">
	import Logo from './Logo.svelte';

	let scrolled = $state(false);

	function handleScroll() {
		scrolled = window.scrollY > 20;
	}
</script>

<svelte:window onscroll={handleScroll} />

<nav
	class="fixed top-0 left-0 right-0 z-50 transition-all duration-300 {scrolled ? 'nav-scrolled' : ''}"
>
	<div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
		<Logo />

		<!-- Nav links -->
		<div class="hidden md:flex items-center gap-8">
			<a
				href="#features"
				class="text-sm text-gray-400 hover:text-white transition-colors font-medium"
			>
				Features
			</a>
			<a
				href="#workflow"
				class="text-sm text-gray-400 hover:text-white transition-colors font-medium"
			>
				Workflow
			</a>
			<a href="#demo" class="text-sm text-gray-400 hover:text-white transition-colors font-medium">
				Demo
			</a>
			<a
				href="https://github.com/joewinke/jat"
				target="_blank"
				rel="noopener noreferrer"
				class="text-sm text-gray-400 hover:text-white transition-colors font-medium"
			>
				GitHub
			</a>
		</div>

		<!-- CTA -->
		<a
			href="#install"
			class="btn btn-primary btn-sm btn-glow rounded-full px-6 font-semibold shadow-lg"
		>
			Get Started
		</a>
	</div>
</nav>
