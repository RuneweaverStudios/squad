<script lang="ts">
	import { onMount } from 'svelte';

	let { particleCount = 60 } = $props();

	let container: HTMLCanvasElement;
	let animationId: number;

	interface Particle {
		x: number;
		y: number;
		targetX: number;
		targetY: number;
		vx: number;
		vy: number;
		size: number;
		hue: number;
		delay: number;
		converged: boolean;
		sparkTime: number;
	}

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) return;

		const ctx = container.getContext('2d');
		if (!ctx) return;

		let w = container.clientWidth;
		let h = container.clientHeight;
		container.width = w;
		container.height = h;

		const particles: Particle[] = [];
		let time = 0;
		let isVisible = true;

		const centerX = w / 2;
		const centerY = h / 2;

		// Create particles around edges, converging to center
		for (let i = 0; i < particleCount; i++) {
			// Start from random positions around the edges
			const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
			const radius = 200 + Math.random() * 150;
			const x = centerX + Math.cos(angle) * radius;
			const y = centerY + Math.sin(angle) * radius;

			particles.push({
				x,
				y,
				targetX: centerX,
				targetY: centerY,
				vx: 0,
				vy: 0,
				size: 1.5 + Math.random() * 2,
				hue: 260 + Math.random() * 60, // Purple to pink
				delay: i * 0.05, // Staggered start
				converged: false,
				sparkTime: 0
			});
		}

		function animate() {
			if (!isVisible) {
				animationId = requestAnimationFrame(animate);
				return;
			}

			time += 0.016;

			// Clear with fade
			ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
			ctx.fillRect(0, 0, w, h);

			// Draw central beacon
			const beaconPulse = Math.sin(time * 2) * 0.2 + 0.8;
			const beaconGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 80 * beaconPulse);
			beaconGlow.addColorStop(0, `rgba(139, 92, 246, ${0.4 * beaconPulse})`);
			beaconGlow.addColorStop(0.5, `rgba(168, 85, 247, ${0.2 * beaconPulse})`);
			beaconGlow.addColorStop(1, 'transparent');
			ctx.fillStyle = beaconGlow;
			ctx.fillRect(0, 0, w, h);

			// Draw converging rings
			for (let r = 50; r < 300; r += 60) {
				const ringProgress = ((time * 50 + r) % 300) / 300;
				const ringAlpha = (1 - ringProgress) * 0.1;
				ctx.beginPath();
				ctx.arc(centerX, centerY, r * ringProgress + 20, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(139, 92, 246, ${ringAlpha})`;
				ctx.lineWidth = 1;
				ctx.stroke();
			}

			// Update and draw particles
			particles.forEach((p, i) => {
				// Wait for delay
				if (time < p.delay) return;

				const dx = p.targetX - p.x;
				const dy = p.targetY - p.y;
				const dist = Math.hypot(dx, dy);

				if (dist > 15) {
					// Accelerate toward center with spiral
					const spiralAngle = Math.atan2(dy, dx) + 0.3;
					const pull = 0.02 + (1 - dist / 300) * 0.03;
					p.vx += Math.cos(spiralAngle) * pull;
					p.vy += Math.sin(spiralAngle) * pull;

					// Apply velocity with damping
					p.x += p.vx;
					p.y += p.vy;
					p.vx *= 0.97;
					p.vy *= 0.97;

					// Draw trail
					const speed = Math.hypot(p.vx, p.vy);
					if (speed > 0.5) {
						ctx.beginPath();
						ctx.moveTo(p.x, p.y);
						ctx.lineTo(p.x - p.vx * 6, p.y - p.vy * 6);
						ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, ${Math.min(0.5, speed * 0.15)})`;
						ctx.lineWidth = p.size * 0.6;
						ctx.stroke();
					}

					// Draw particle
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
					ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, 0.9)`;
					ctx.fill();

					// Glow
					const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
					glow.addColorStop(0, `hsla(${p.hue}, 80%, 70%, 0.5)`);
					glow.addColorStop(1, 'transparent');
					ctx.fillStyle = glow;
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
					ctx.fill();
				} else if (!p.converged) {
					// Just converged - spark!
					p.converged = true;
					p.sparkTime = time;
				}

				// Draw spark effect when converged
				if (p.converged) {
					const sparkAge = time - p.sparkTime;
					if (sparkAge < 0.5) {
						const sparkAlpha = (1 - sparkAge / 0.5) * 0.8;
						const sparkSize = 5 + sparkAge * 30;
						ctx.beginPath();
						ctx.arc(centerX, centerY, sparkSize, 0, Math.PI * 2);
						ctx.strokeStyle = `hsla(${p.hue}, 80%, 80%, ${sparkAlpha})`;
						ctx.lineWidth = 2;
						ctx.stroke();
					}

					// Respawn particle at edge after spark
					if (sparkAge > 1) {
						const angle = Math.random() * Math.PI * 2;
						const radius = 200 + Math.random() * 150;
						p.x = centerX + Math.cos(angle) * radius;
						p.y = centerY + Math.sin(angle) * radius;
						p.vx = 0;
						p.vy = 0;
						p.converged = false;
						p.delay = time + Math.random() * 2;
					}
				}
			});

			// Central core
			const coreGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 20);
			coreGlow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
			coreGlow.addColorStop(0.3, 'rgba(168, 85, 247, 0.6)');
			coreGlow.addColorStop(1, 'transparent');
			ctx.fillStyle = coreGlow;
			ctx.beginPath();
			ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
			ctx.fill();

			animationId = requestAnimationFrame(animate);
		}

		animate();

		function handleResize() {
			w = container.clientWidth;
			h = container.clientHeight;
			container.width = w;
			container.height = h;

			// Update center for all particles
			const newCenterX = w / 2;
			const newCenterY = h / 2;
			particles.forEach(p => {
				p.targetX = newCenterX;
				p.targetY = newCenterY;
			});
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
