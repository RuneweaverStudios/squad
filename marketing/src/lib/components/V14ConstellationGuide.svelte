<script lang="ts">
	import { onMount } from 'svelte';

	let { starCount = 80 } = $props();

	let container: HTMLCanvasElement;
	let animationId: number;

	interface Star {
		x: number;
		y: number;
		targetX: number;
		targetY: number;
		size: number;
		brightness: number;
		twinklePhase: number;
		twinkleSpeed: number;
		connected: boolean;
		group: number;
	}

	// Constellation patterns (simplified book/guide shape and connected points)
	const constellationPatterns = [
		// Book/manual shape (left side)
		{ points: [[0.15, 0.3], [0.15, 0.7], [0.3, 0.7], [0.3, 0.3], [0.22, 0.3], [0.22, 0.65], [0.25, 0.65], [0.25, 0.35]], connections: [[0,1], [1,2], [2,3], [3,0], [4,5], [6,7]] },
		// Star/compass shape (center)
		{ points: [[0.5, 0.25], [0.5, 0.75], [0.35, 0.5], [0.65, 0.5], [0.4, 0.35], [0.6, 0.35], [0.4, 0.65], [0.6, 0.65]], connections: [[0,1], [2,3], [4,5], [6,7], [0,4], [0,5], [1,6], [1,7]] },
		// Arrow/direction (right side)
		{ points: [[0.75, 0.5], [0.85, 0.4], [0.85, 0.6], [0.9, 0.5]], connections: [[0,1], [0,2], [1,3], [2,3]] }
	];

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) return;

		const ctx = container.getContext('2d');
		if (!ctx) return;

		let w = container.clientWidth;
		let h = container.clientHeight;
		container.width = w;
		container.height = h;

		const stars: Star[] = [];
		let time = 0;
		let isVisible = true;
		let revealProgress = 0; // 0 = scattered, 1 = constellation formed

		// Create constellation stars (these will form the pattern)
		let starIndex = 0;
		constellationPatterns.forEach((pattern, groupIndex) => {
			pattern.points.forEach(([px, py]) => {
				stars.push({
					x: Math.random() * w, // Start scattered
					y: Math.random() * h,
					targetX: px * w,
					targetY: py * h,
					size: 2 + Math.random(),
					brightness: 0.7 + Math.random() * 0.3,
					twinklePhase: Math.random() * Math.PI * 2,
					twinkleSpeed: 1 + Math.random() * 2,
					connected: true,
					group: groupIndex
				});
				starIndex++;
			});
		});

		// Add background stars (decorative, don't form patterns)
		for (let i = starIndex; i < starCount; i++) {
			const x = Math.random() * w;
			const y = Math.random() * h;
			stars.push({
				x,
				y,
				targetX: x,
				targetY: y,
				size: 0.5 + Math.random() * 1.5,
				brightness: 0.3 + Math.random() * 0.4,
				twinklePhase: Math.random() * Math.PI * 2,
				twinkleSpeed: 0.5 + Math.random() * 1.5,
				connected: false,
				group: -1
			});
		}

		function animate() {
			if (!isVisible) {
				animationId = requestAnimationFrame(animate);
				return;
			}

			time += 0.016;

			// Slowly reveal constellation over time
			revealProgress = Math.min(1, revealProgress + 0.003);

			// Clear with slight fade for trails
			ctx.fillStyle = 'rgba(12, 12, 20, 0.15)';
			ctx.fillRect(0, 0, w, h);

			// Update and draw stars
			stars.forEach(star => {
				// Move constellation stars toward their target positions
				if (star.connected) {
					const easeProgress = easeOutCubic(revealProgress);
					star.x += (star.targetX - star.x) * 0.02 * easeProgress;
					star.y += (star.targetY - star.y) * 0.02 * easeProgress;
				}

				// Twinkle effect
				const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase);
				const currentBrightness = star.brightness * (0.7 + twinkle * 0.3);

				// Draw star glow
				const glowSize = star.size * (3 + twinkle * 0.5);
				const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize);
				const hue = star.connected ? 250 : 220; // Purple for constellation, blue for background
				glow.addColorStop(0, `hsla(${hue}, 60%, ${70 * currentBrightness}%, ${currentBrightness})`);
				glow.addColorStop(0.5, `hsla(${hue}, 50%, ${50 * currentBrightness}%, ${currentBrightness * 0.3})`);
				glow.addColorStop(1, 'transparent');

				ctx.beginPath();
				ctx.arc(star.x, star.y, glowSize, 0, Math.PI * 2);
				ctx.fillStyle = glow;
				ctx.fill();

				// Draw star core
				ctx.beginPath();
				ctx.arc(star.x, star.y, star.size * (star.connected ? 1.2 : 1), 0, Math.PI * 2);
				ctx.fillStyle = `hsla(${hue}, 70%, ${80 * currentBrightness}%, ${currentBrightness})`;
				ctx.fill();
			});

			// Draw constellation connections (only when stars are close to their targets)
			if (revealProgress > 0.3) {
				const connectionAlpha = easeOutCubic((revealProgress - 0.3) / 0.7);

				constellationPatterns.forEach((pattern, groupIndex) => {
					const groupStars = stars.filter(s => s.group === groupIndex);

					pattern.connections.forEach(([i, j]) => {
						if (i >= groupStars.length || j >= groupStars.length) return;
						const s1 = groupStars[i];
						const s2 = groupStars[j];

						// Animated line drawing
						const lineProgress = Math.min(1, (revealProgress - 0.3) / 0.5);

						ctx.beginPath();
						ctx.moveTo(s1.x, s1.y);

						// Draw partial line based on progress
						const endX = s1.x + (s2.x - s1.x) * lineProgress;
						const endY = s1.y + (s2.y - s1.y) * lineProgress;
						ctx.lineTo(endX, endY);

						ctx.strokeStyle = `rgba(167, 139, 250, ${connectionAlpha * 0.6})`;
						ctx.lineWidth = 1;
						ctx.stroke();

						// Add glow to lines
						ctx.strokeStyle = `rgba(167, 139, 250, ${connectionAlpha * 0.2})`;
						ctx.lineWidth = 3;
						ctx.stroke();
					});
				});
			}

			// Add subtle "guiding light" particles moving along constellation lines
			if (revealProgress > 0.7) {
				const particleProgress = (time * 0.5) % 1;
				constellationPatterns.forEach((pattern, groupIndex) => {
					const groupStars = stars.filter(s => s.group === groupIndex);
					pattern.connections.forEach(([i, j], connIndex) => {
						if (i >= groupStars.length || j >= groupStars.length) return;
						const s1 = groupStars[i];
						const s2 = groupStars[j];

						const offset = (connIndex * 0.2 + particleProgress) % 1;
						const px = s1.x + (s2.x - s1.x) * offset;
						const py = s1.y + (s2.y - s1.y) * offset;

						const particleGlow = ctx.createRadialGradient(px, py, 0, px, py, 8);
						particleGlow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
						particleGlow.addColorStop(0.5, 'rgba(167, 139, 250, 0.3)');
						particleGlow.addColorStop(1, 'transparent');

						ctx.beginPath();
						ctx.arc(px, py, 8, 0, Math.PI * 2);
						ctx.fillStyle = particleGlow;
						ctx.fill();
					});
				});
			}

			animationId = requestAnimationFrame(animate);
		}

		function easeOutCubic(t: number): number {
			return 1 - Math.pow(1 - t, 3);
		}

		animate();

		function handleResize() {
			w = container.clientWidth;
			h = container.clientHeight;
			container.width = w;
			container.height = h;

			// Update target positions for constellation stars
			let idx = 0;
			constellationPatterns.forEach(pattern => {
				pattern.points.forEach(([px, py]) => {
					if (stars[idx]) {
						stars[idx].targetX = px * w;
						stars[idx].targetY = py * h;
					}
					idx++;
				});
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
