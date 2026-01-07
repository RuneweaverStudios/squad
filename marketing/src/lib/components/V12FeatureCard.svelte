<script lang="ts">
	import { onMount } from 'svelte';

	let {
		title,
		description,
		icon,
		gradient = 'from-blue-500 to-cyan-500',
		items = [],
		class: className = ''
	}: {
		title: string;
		description: string;
		icon: 'kanban' | 'robots' | 'code' | 'team';
		gradient?: string;
		items?: string[];
		class?: string;
	} = $props();

	let card: HTMLElement;
	let orbCanvas: HTMLCanvasElement;
	let isHovered = $state(false);
	let animationId: number;
	let prefersReducedMotion = false;

	interface MiniOrb {
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		hue: number;
	}

	onMount(() => {
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion || !orbCanvas) return;

		const ctx = orbCanvas.getContext('2d')!;
		const orbs: MiniOrb[] = [];
		const orbCount = 6;
		let width = 0;
		let height = 0;
		let time = 0;

		function resize() {
			const rect = card.getBoundingClientRect();
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			width = rect.width;
			height = rect.height;
			orbCanvas.width = width * dpr;
			orbCanvas.height = height * dpr;
			ctx.scale(dpr, dpr);
		}

		function createOrbs() {
			orbs.length = 0;
			for (let i = 0; i < orbCount; i++) {
				orbs.push({
					x: Math.random() * width,
					y: Math.random() * height,
					vx: (Math.random() - 0.5) * 0.5,
					vy: (Math.random() - 0.5) * 0.5,
					radius: 3 + Math.random() * 5,
					hue: 200 + Math.random() * 60
				});
			}
		}

		function render() {
			animationId = requestAnimationFrame(render);
			time += 0.016;

			ctx.clearRect(0, 0, width, height);

			if (!isHovered) return;

			for (const orb of orbs) {
				// Move toward card center when hovered
				const centerX = width / 2;
				const centerY = height / 2;
				const dx = centerX - orb.x;
				const dy = centerY - orb.y;
				const dist = Math.sqrt(dx * dx + dy * dy);

				orb.vx += dx * 0.001;
				orb.vy += dy * 0.001;
				orb.vx *= 0.98;
				orb.vy *= 0.98;

				orb.x += orb.vx;
				orb.y += orb.vy;

				// Gentle oscillation
				const ox = Math.sin(time * 2 + orb.hue) * 5;
				const oy = Math.cos(time * 1.5 + orb.hue) * 5;

				// Draw orb
				const gradient = ctx.createRadialGradient(
					orb.x + ox, orb.y + oy, 0,
					orb.x + ox, orb.y + oy, orb.radius * 3
				);
				gradient.addColorStop(0, `hsla(${orb.hue}, 80%, 70%, 0.4)`);
				gradient.addColorStop(0.5, `hsla(${orb.hue}, 80%, 60%, 0.15)`);
				gradient.addColorStop(1, 'transparent');

				ctx.beginPath();
				ctx.arc(orb.x + ox, orb.y + oy, orb.radius * 3, 0, Math.PI * 2);
				ctx.fillStyle = gradient;
				ctx.fill();

				// Core
				ctx.beginPath();
				ctx.arc(orb.x + ox, orb.y + oy, orb.radius, 0, Math.PI * 2);
				const coreGradient = ctx.createRadialGradient(
					orb.x + ox - orb.radius * 0.3, orb.y + oy - orb.radius * 0.3, 0,
					orb.x + ox, orb.y + oy, orb.radius
				);
				coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
				coreGradient.addColorStop(0.5, `hsla(${orb.hue}, 80%, 70%, 0.7)`);
				coreGradient.addColorStop(1, `hsla(${orb.hue}, 80%, 50%, 0.3)`);
				ctx.fillStyle = coreGradient;
				ctx.fill();
			}
		}

		resize();
		createOrbs();
		render();

		const resizeObserver = new ResizeObserver(() => {
			resize();
			createOrbs();
		});
		resizeObserver.observe(card);

		return () => {
			cancelAnimationFrame(animationId);
			resizeObserver.disconnect();
		};
	});

	function handleMouseEnter() {
		isHovered = true;
	}

	function handleMouseLeave() {
		isHovered = false;
	}
</script>

<div
	bind:this={card}
	class="v12-feature-card relative overflow-hidden rounded-2xl bg-gray-800/50 border border-gray-700 p-8 transition-all duration-500 {className}"
	class:hovered={isHovered}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="article"
>
	<!-- Orb canvas layer -->
	<canvas
		bind:this={orbCanvas}
		class="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-500"
		class:opacity-100={isHovered}
	></canvas>

	<!-- Background gradient glow -->
	<div
		class="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br {gradient} opacity-10 blur-3xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-500"
		class:opacity-20={isHovered}
	></div>

	<div class="relative z-10">
		<!-- Icon container -->
		<div class="w-14 h-14 rounded-xl bg-gradient-to-br {gradient} p-0.5 mb-5">
			<div class="w-full h-full rounded-[10px] bg-gray-900 flex items-center justify-center">
				{#if icon === 'kanban'}
					<svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
					</svg>
				{:else if icon === 'robots'}
					<svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
						<circle cx="8" cy="9" r="1.5" fill="currentColor"/>
						<circle cx="16" cy="9" r="1.5" fill="currentColor"/>
					</svg>
				{:else if icon === 'code'}
					<svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
					</svg>
				{:else if icon === 'team'}
					<svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
					</svg>
				{/if}
			</div>
		</div>

		<h3 class="text-xl font-bold text-white mb-2">{title}</h3>
		<p class="text-sm text-gray-500 mb-5">{description}</p>

		{#if items.length > 0}
			<ul class="space-y-3">
				{#each items as item}
					<li class="flex items-center gap-3 text-gray-300">
						<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
						</svg>
						<span>{item}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.v12-feature-card {
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease,
			border-color 0.3s ease;
	}

	.v12-feature-card.hovered {
		transform: translateY(-4px);
		border-color: rgba(139, 92, 246, 0.4);
		box-shadow:
			0 10px 40px rgba(79, 143, 255, 0.15),
			0 0 0 1px rgba(79, 143, 255, 0.2);
	}

	@media (prefers-reduced-motion: reduce) {
		.v12-feature-card {
			transition: none;
		}

		.v12-feature-card.hovered {
			transform: none;
		}
	}
</style>
