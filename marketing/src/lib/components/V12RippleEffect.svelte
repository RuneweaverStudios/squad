<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { class: className = '' }: { class?: string } = $props();

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let prefersReducedMotion = false;

	interface Ripple {
		x: number;
		y: number;
		radius: number;
		maxRadius: number;
		alpha: number;
		hue: number;
	}

	onMount(() => {
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) return;

		const ctx = canvas.getContext('2d')!;
		let width = 0;
		let height = 0;
		const ripples: Ripple[] = [];

		function resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			ctx.scale(dpr, dpr);
		}

		function handleClick(e: MouseEvent) {
			// Create ripple at click position
			ripples.push({
				x: e.clientX,
				y: e.clientY,
				radius: 0,
				maxRadius: 150 + Math.random() * 100,
				alpha: 0.6,
				hue: 200 + Math.random() * 60
			});

			// Create a few smaller secondary ripples
			for (let i = 0; i < 3; i++) {
				setTimeout(() => {
					ripples.push({
						x: e.clientX + (Math.random() - 0.5) * 40,
						y: e.clientY + (Math.random() - 0.5) * 40,
						radius: 0,
						maxRadius: 50 + Math.random() * 50,
						alpha: 0.4,
						hue: 200 + Math.random() * 60
					});
				}, i * 50);
			}
		}

		function render() {
			animationId = requestAnimationFrame(render);

			ctx.clearRect(0, 0, width, height);

			for (let i = ripples.length - 1; i >= 0; i--) {
				const ripple = ripples[i];

				// Expand ripple
				ripple.radius += (ripple.maxRadius - ripple.radius) * 0.08;
				ripple.alpha *= 0.96;

				// Remove faded ripples
				if (ripple.alpha < 0.01) {
					ripples.splice(i, 1);
					continue;
				}

				// Draw ripple ring
				ctx.beginPath();
				ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
				ctx.strokeStyle = `hsla(${ripple.hue}, 80%, 70%, ${ripple.alpha})`;
				ctx.lineWidth = 2;
				ctx.stroke();

				// Inner glow
				const gradient = ctx.createRadialGradient(
					ripple.x, ripple.y, ripple.radius * 0.5,
					ripple.x, ripple.y, ripple.radius
				);
				gradient.addColorStop(0, `hsla(${ripple.hue}, 80%, 70%, 0)`);
				gradient.addColorStop(0.7, `hsla(${ripple.hue}, 80%, 60%, ${ripple.alpha * 0.2})`);
				gradient.addColorStop(1, `hsla(${ripple.hue}, 80%, 70%, 0)`);

				ctx.beginPath();
				ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
				ctx.fillStyle = gradient;
				ctx.fill();
			}
		}

		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('click', handleClick);
		render();

		return () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', resize);
			window.removeEventListener('click', handleClick);
		};
	});

	onDestroy(() => {
		if (animationId) {
			cancelAnimationFrame(animationId);
		}
	});
</script>

<canvas
	bind:this={canvas}
	class="fixed inset-0 pointer-events-none z-40 {className}"
></canvas>

<style>
	canvas {
		display: block;
	}
</style>
