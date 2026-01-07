<script lang="ts">
	import { onMount } from 'svelte';

	let {
		title,
		description,
		icon,
		gradient = 'from-blue-500 to-cyan-500',
		items = [],
		delay = 0
	}: {
		title: string;
		description: string;
		icon: 'kanban' | 'robots' | 'code' | 'team';
		gradient?: string;
		items?: string[];
		delay?: number;
	} = $props();

	let cardEl: HTMLDivElement;
	let isVisible = $state(false);
	let isHovered = $state(false);
	let mousePos = $state({ x: 0.5, y: 0.5 });

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (prefersReducedMotion) {
			isVisible = true;
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						setTimeout(() => {
							isVisible = true;
						}, delay);
						observer.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.1 }
		);

		observer.observe(cardEl);

		return () => observer.disconnect();
	});

	function handleMouseMove(event: MouseEvent) {
		if (!cardEl) return;
		const rect = cardEl.getBoundingClientRect();
		mousePos = {
			x: (event.clientX - rect.left) / rect.width,
			y: (event.clientY - rect.top) / rect.height
		};
	}

	function handleMouseEnter() {
		isHovered = true;
	}

	function handleMouseLeave() {
		isHovered = false;
		mousePos = { x: 0.5, y: 0.5 };
	}

	// Compute glow position based on mouse
	let glowStyle = $derived(
		isHovered
			? `radial-gradient(600px circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(59, 130, 246, 0.1), transparent 40%)`
			: 'none'
	);
</script>

<div
	bind:this={cardEl}
	class="feature-card-v11 group relative overflow-hidden rounded-2xl bg-gray-800/50 border p-8 transition-all duration-500 {isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} {isHovered ? 'border-blue-500/30' : 'border-gray-700/50'}"
	onmousemove={handleMouseMove}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="article"
>
	<!-- Wireframe border animation -->
	<svg class="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" preserveAspectRatio="none">
		<defs>
			<linearGradient id="wire-gradient-{title.replace(/\s/g, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="#3b82f6" stop-opacity="0.8">
					<animate attributeName="offset" values="0;1;0" dur="3s" repeatCount="indefinite" />
				</stop>
				<stop offset="50%" stop-color="#8b5cf6" stop-opacity="0.8">
					<animate attributeName="offset" values="0.5;1.5;0.5" dur="3s" repeatCount="indefinite" />
				</stop>
				<stop offset="100%" stop-color="#06b6d4" stop-opacity="0.8">
					<animate attributeName="offset" values="1;2;1" dur="3s" repeatCount="indefinite" />
				</stop>
			</linearGradient>
		</defs>
		<rect
			x="1"
			y="1"
			width="calc(100% - 2px)"
			height="calc(100% - 2px)"
			rx="16"
			fill="none"
			stroke="url(#wire-gradient-{title.replace(/\s/g, '')})"
			stroke-width="1"
			stroke-dasharray="8 4"
			class="wireframe-border"
		/>
	</svg>

	<!-- Mouse-following glow -->
	<div
		class="absolute inset-0 z-0 transition-opacity duration-300"
		class:opacity-100={isHovered}
		class:opacity-0={!isHovered}
		style="background: {glowStyle};"
	></div>

	<!-- Corner accents -->
	<div class="absolute top-0 left-0 w-12 h-12 overflow-hidden">
		<div class="absolute top-0 left-0 w-[2px] h-8 bg-gradient-to-b from-blue-500/50 to-transparent origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300"></div>
		<div class="absolute top-0 left-0 h-[2px] w-8 bg-gradient-to-r from-blue-500/50 to-transparent origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
	</div>
	<div class="absolute top-0 right-0 w-12 h-12 overflow-hidden">
		<div class="absolute top-0 right-0 w-[2px] h-8 bg-gradient-to-b from-violet-500/50 to-transparent origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-75"></div>
		<div class="absolute top-0 right-0 h-[2px] w-8 bg-gradient-to-l from-violet-500/50 to-transparent origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-300 delay-75"></div>
	</div>
	<div class="absolute bottom-0 left-0 w-12 h-12 overflow-hidden">
		<div class="absolute bottom-0 left-0 w-[2px] h-8 bg-gradient-to-t from-cyan-500/50 to-transparent origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-100"></div>
		<div class="absolute bottom-0 left-0 h-[2px] w-8 bg-gradient-to-r from-cyan-500/50 to-transparent origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300 delay-100"></div>
	</div>
	<div class="absolute bottom-0 right-0 w-12 h-12 overflow-hidden">
		<div class="absolute bottom-0 right-0 w-[2px] h-8 bg-gradient-to-t from-blue-500/50 to-transparent origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 delay-150"></div>
		<div class="absolute bottom-0 right-0 h-[2px] w-8 bg-gradient-to-l from-blue-500/50 to-transparent origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-300 delay-150"></div>
	</div>

	<!-- Gradient glow in corner -->
	<div class="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br {gradient} opacity-10 blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:opacity-20 transition-opacity duration-500"></div>

	<!-- Content -->
	<div class="relative z-10">
		<!-- Icon with geometric container -->
		<div class="w-14 h-14 rounded-xl bg-gradient-to-br {gradient} p-[1px] mb-5 group-hover:scale-110 transition-transform duration-300">
			<div class="w-full h-full rounded-[10px] bg-gray-900 flex items-center justify-center relative overflow-hidden">
				<!-- Geometric pattern overlay -->
				<div class="absolute inset-0 opacity-20">
					<svg class="w-full h-full" viewBox="0 0 56 56" fill="none">
						<line x1="0" y1="0" x2="56" y2="56" stroke="currentColor" stroke-width="0.5" class="text-white/30" />
						<line x1="56" y1="0" x2="0" y2="56" stroke="currentColor" stroke-width="0.5" class="text-white/30" />
						<line x1="28" y1="0" x2="28" y2="56" stroke="currentColor" stroke-width="0.5" class="text-white/20" />
						<line x1="0" y1="28" x2="56" y2="28" stroke="currentColor" stroke-width="0.5" class="text-white/20" />
					</svg>
				</div>

				{#if icon === 'kanban'}
					<svg class="w-7 h-7 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
					</svg>
				{:else if icon === 'robots'}
					<svg class="w-7 h-7 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
						<circle cx="8" cy="9" r="1.5" fill="currentColor"/>
						<circle cx="16" cy="9" r="1.5" fill="currentColor"/>
					</svg>
				{:else if icon === 'code'}
					<svg class="w-7 h-7 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
					</svg>
				{:else if icon === 'team'}
					<svg class="w-7 h-7 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
					</svg>
				{/if}
			</div>
		</div>

		<h3 class="text-xl font-bold text-white mb-2 group-hover:text-blue-100 transition-colors duration-300">{title}</h3>
		<p class="text-sm text-gray-500 mb-5">{description}</p>

		<ul class="space-y-3">
			{#each items as item, i}
				<li
					class="flex items-center gap-3 text-gray-300 opacity-0 translate-x-4 transition-all duration-500"
					class:opacity-100={isVisible}
					class:translate-x-0={isVisible}
					style="transition-delay: {(i + 1) * 100 + delay}ms"
				>
					<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
					<span>{item}</span>
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.feature-card-v11 {
		transform-style: preserve-3d;
		perspective: 1000px;
	}

	.wireframe-border {
		stroke-dashoffset: 0;
		animation: dash-flow 15s linear infinite;
	}

	@keyframes dash-flow {
		to {
			stroke-dashoffset: -100;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.feature-card-v11 {
			opacity: 1 !important;
			transform: none !important;
		}

		.wireframe-border {
			animation: none;
		}
	}
</style>
