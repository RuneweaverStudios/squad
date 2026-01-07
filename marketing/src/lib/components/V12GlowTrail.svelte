<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { class: className = '' }: { class?: string } = $props();

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let prefersReducedMotion = false;

	interface TrailPoint {
		x: number;
		y: number;
		age: number;
		radius: number;
	}

	onMount(() => {
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) return;

		const ctx = canvas.getContext('2d')!;
		let width = 0;
		let height = 0;
		const trail: TrailPoint[] = [];
		const maxTrailLength = 20;
		let mouseX = -100;
		let mouseY = -100;
		let lastMouseX = -100;
		let lastMouseY = -100;

		function resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			ctx.scale(dpr, dpr);
		}

		function handleMouseMove(e: MouseEvent) {
			mouseX = e.clientX;
			mouseY = e.clientY;
		}

		function render() {
			animationId = requestAnimationFrame(render);

			ctx.clearRect(0, 0, width, height);

			// Add new point if mouse moved
			const dx = mouseX - lastMouseX;
			const dy = mouseY - lastMouseY;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist > 3) {
				trail.push({
					x: mouseX,
					y: mouseY,
					age: 0,
					radius: Math.min(12, 4 + dist * 0.15)
				});
				lastMouseX = mouseX;
				lastMouseY = mouseY;
			}

			// Update and draw trail
			for (let i = trail.length - 1; i >= 0; i--) {
				const point = trail[i];
				point.age += 0.05;

				if (point.age > 1) {
					trail.splice(i, 1);
					continue;
				}

				const alpha = 1 - point.age;
				const size = point.radius * (1 - point.age * 0.5);

				// Outer glow
				const gradient = ctx.createRadialGradient(
					point.x, point.y, 0,
					point.x, point.y, size * 3
				);
				gradient.addColorStop(0, `hsla(220, 80%, 70%, ${alpha * 0.3})`);
				gradient.addColorStop(0.5, `hsla(220, 80%, 60%, ${alpha * 0.1})`);
				gradient.addColorStop(1, 'transparent');

				ctx.beginPath();
				ctx.arc(point.x, point.y, size * 3, 0, Math.PI * 2);
				ctx.fillStyle = gradient;
				ctx.fill();

				// Core
				const coreGradient = ctx.createRadialGradient(
					point.x, point.y, 0,
					point.x, point.y, size
				);
				coreGradient.addColorStop(0, `hsla(220, 30%, 95%, ${alpha * 0.8})`);
				coreGradient.addColorStop(0.5, `hsla(220, 80%, 70%, ${alpha * 0.6})`);
				coreGradient.addColorStop(1, `hsla(220, 80%, 50%, ${alpha * 0.2})`);

				ctx.beginPath();
				ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
				ctx.fillStyle = coreGradient;
				ctx.fill();
			}

			// Trim trail if too long
			while (trail.length > maxTrailLength) {
				trail.shift();
			}
		}

		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', handleMouseMove);
		render();

		return () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', resize);
			window.removeEventListener('mousemove', handleMouseMove);
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
	class="fixed inset-0 pointer-events-none z-50 {className}"
	style="mix-blend-mode: screen;"
></canvas>

<style>
	canvas {
		display: block;
	}
</style>
