<script lang="ts">
	import { onMount } from 'svelte';

	let { particleCount = 100, pullStrength = 0.02 } = $props();

	let container: HTMLCanvasElement;
	let animationId: number;

	interface Particle {
		x: number;
		y: number;
		originX: number;
		originY: number;
		vx: number;
		vy: number;
		size: number;
		hue: number;
		orbitRadius: number;
		orbitSpeed: number;
		orbitPhase: number;
	}

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) return;

		const ctx = container.getContext('2d');
		if (!ctx) return;

		const particles: Particle[] = [];
		let time = 0;
		let isVisible = true;
		let w = 0;
		let h = 0;
		let initialized = false;

		// Deferred initialization - wait for layout to be computed
		function initCanvas() {
			// Use getBoundingClientRect for accurate dimensions after layout
			const rect = container.getBoundingClientRect();
			w = rect.width;
			h = rect.height;

			// Don't initialize if dimensions aren't ready yet
			if (w === 0 || h === 0) {
				requestAnimationFrame(initCanvas);
				return;
			}

			// Set canvas resolution to match display size
			container.width = w;
			container.height = h;

			// Only create particles once dimensions are valid
			if (!initialized) {
				initialized = true;
				createParticles();
			}
		}

		function createParticles() {
			particles.length = 0; // Clear any existing
			for (let i = 0; i < particleCount; i++) {
				// Start from edges/corners (scattered chaos)
				const edge = Math.floor(Math.random() * 4);
				let x, y;
				switch (edge) {
					case 0: x = Math.random() * w; y = -50; break; // Top
					case 1: x = w + 50; y = Math.random() * h; break; // Right
					case 2: x = Math.random() * w; y = h + 50; break; // Bottom
					default: x = -50; y = Math.random() * h; break; // Left
				}

				particles.push({
					x,
					y,
					originX: x,
					originY: y,
					vx: 0,
					vy: 0,
					size: 1 + Math.random() * 2,
					hue: 200 + Math.random() * 100, // Cyan to violet
					orbitRadius: 50 + Math.random() * 200,
					orbitSpeed: 0.5 + Math.random() * 1.5,
					orbitPhase: Math.random() * Math.PI * 2
				});
			}
		}

		// Start initialization after a frame to ensure layout is computed
		requestAnimationFrame(initCanvas);

		function animate() {
			// Wait for initialization before animating
			if (!initialized) {
				animationId = requestAnimationFrame(animate);
				return;
			}

			if (!isVisible) {
				animationId = requestAnimationFrame(animate);
				return;
			}

			time += 0.016;

			ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
			ctx.fillRect(0, 0, w, h);

			const centerX = w / 2;
			const centerY = h / 2;

			// Draw gravitational field lines (subtle)
			for (let r = 50; r < 400; r += 80) {
				ctx.beginPath();
				ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(139, 92, 246, ${0.03 * (1 - r / 400)})`;
				ctx.lineWidth = 1;
				ctx.stroke();
			}

			// Central glow (the "one place")
			const centralGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150);
			centralGlow.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
			centralGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.08)');
			centralGlow.addColorStop(1, 'transparent');
			ctx.fillStyle = centralGlow;
			ctx.fillRect(0, 0, w, h);

			particles.forEach((p, i) => {
				// Calculate pull toward center
				const dx = centerX - p.x;
				const dy = centerY - p.y;
				const dist = Math.hypot(dx, dy);

				// Gravitational pull (inverse square, capped)
				const pull = Math.min(pullStrength * (1 / (dist * 0.01 + 1)), 0.5);
				p.vx += dx * pull * 0.01;
				p.vy += dy * pull * 0.01;

				// Once close to center, orbit instead of falling in
				if (dist < p.orbitRadius) {
					const orbitAngle = time * p.orbitSpeed + p.orbitPhase;
					const targetX = centerX + Math.cos(orbitAngle) * p.orbitRadius * 0.3;
					const targetY = centerY + Math.sin(orbitAngle) * p.orbitRadius * 0.3;
					p.vx += (targetX - p.x) * 0.02;
					p.vy += (targetY - p.y) * 0.02;
				}

				// Apply velocity with damping
				p.x += p.vx;
				p.y += p.vy;
				p.vx *= 0.98;
				p.vy *= 0.98;

				// Draw trail
				const trailAlpha = Math.min(0.3, Math.hypot(p.vx, p.vy) * 0.1);
				if (trailAlpha > 0.05) {
					ctx.beginPath();
					ctx.moveTo(p.x, p.y);
					ctx.lineTo(p.x - p.vx * 5, p.y - p.vy * 5);
					ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, ${trailAlpha})`;
					ctx.lineWidth = p.size * 0.5;
					ctx.stroke();
				}

				// Draw particle
				const brightness = 50 + (1 - Math.min(dist / 300, 1)) * 30;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fillStyle = `hsla(${p.hue}, 70%, ${brightness}%, 0.8)`;
				ctx.fill();

				// Glow for particles near center
				if (dist < 150) {
					const glowSize = p.size * (3 - dist / 75);
					const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
					glow.addColorStop(0, `hsla(${p.hue}, 80%, 70%, 0.5)`);
					glow.addColorStop(1, 'transparent');
					ctx.fillStyle = glow;
					ctx.beginPath();
					ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
					ctx.fill();
				}
			});

			// Draw connections between nearby particles in center
			particles.forEach((p, i) => {
				const distToCenter = Math.hypot(p.x - centerX, p.y - centerY);
				if (distToCenter > 200) return;

				particles.forEach((other, j) => {
					if (j <= i) return;
					const otherDist = Math.hypot(other.x - centerX, other.y - centerY);
					if (otherDist > 200) return;

					const d = Math.hypot(p.x - other.x, p.y - other.y);
					if (d < 60) {
						ctx.beginPath();
						ctx.moveTo(p.x, p.y);
						ctx.lineTo(other.x, other.y);
						ctx.strokeStyle = `rgba(139, 92, 246, ${(1 - d / 60) * 0.2})`;
						ctx.lineWidth = 0.5;
						ctx.stroke();
					}
				});
			});

			animationId = requestAnimationFrame(animate);
		}

		animate();

		function handleResize() {
			const rect = container.getBoundingClientRect();
			w = rect.width;
			h = rect.height;
			if (w > 0 && h > 0) {
				container.width = w;
				container.height = h;
			}
		}

		function handleVisibility() {
			isVisible = !document.hidden;
		}

		window.addEventListener('resize', handleResize);
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			if (animationId) cancelAnimationFrame(animationId);
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<canvas bind:this={container} class="absolute inset-0 w-full h-full"></canvas>

<style>
	canvas {
		pointer-events: none;
	}
</style>
