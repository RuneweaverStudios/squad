<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Props
	let {
		class: className = '',
		orbCount = 40,
		centralOrbScale = 1.5,
		colorTemperature = 0, // 0 = cool blues, 1 = warm ambers
		disperseFactor = 0, // 0 = clustered, 1 = dispersed
		mouseInfluence = 0.3,
		interactive = true
	}: {
		class?: string;
		orbCount?: number;
		centralOrbScale?: number;
		colorTemperature?: number;
		disperseFactor?: number;
		mouseInfluence?: number;
		interactive?: boolean;
	} = $props();

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let prefersReducedMotion = false;

	interface Orb {
		x: number;
		y: number;
		z: number; // Depth for parallax
		baseX: number;
		baseY: number;
		radius: number;
		orbitRadius: number;
		orbitSpeed: number;
		orbitOffset: number;
		hue: number;
		saturation: number;
		lightness: number;
		pulsePhase: number;
		pulseSpeed: number;
		isCentral: boolean;
		isSatellite: boolean;
	}

	// Color palette
	const coolHue = 220; // Blue
	const warmHue = 35; // Amber

	function lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	function easeOutCubic(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	onMount(() => {
		// Check for reduced motion preference
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		const ctx = canvas.getContext('2d')!;
		let width = 0;
		let height = 0;
		let centerX = 0;
		let centerY = 0;
		let mouseX = 0;
		let mouseY = 0;
		let targetMouseX = 0;
		let targetMouseY = 0;
		const orbs: Orb[] = [];
		let time = 0;

		function resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const rect = canvas.getBoundingClientRect();
			width = rect.width;
			height = rect.height;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			ctx.scale(dpr, dpr);
			centerX = width / 2;
			centerY = height / 2;
		}

		function createOrbs() {
			orbs.length = 0;

			// Central supervisor orb
			orbs.push({
				x: centerX,
				y: centerY,
				z: 1,
				baseX: centerX,
				baseY: centerY,
				radius: 30 * centralOrbScale,
				orbitRadius: 0,
				orbitSpeed: 0,
				orbitOffset: 0,
				hue: coolHue,
				saturation: 80,
				lightness: 65,
				pulsePhase: 0,
				pulseSpeed: 0.5,
				isCentral: true,
				isSatellite: false
			});

			// Satellite orbs (orbit the central)
			const satelliteCount = Math.min(8, Math.floor(orbCount * 0.2));
			for (let i = 0; i < satelliteCount; i++) {
				const angle = (i / satelliteCount) * Math.PI * 2;
				const orbitRadius = 80 + Math.random() * 60;
				orbs.push({
					x: centerX + Math.cos(angle) * orbitRadius,
					y: centerY + Math.sin(angle) * orbitRadius,
					z: 0.6 + Math.random() * 0.4,
					baseX: centerX,
					baseY: centerY,
					radius: 8 + Math.random() * 8,
					orbitRadius,
					orbitSpeed: 0.2 + Math.random() * 0.3,
					orbitOffset: angle,
					hue: coolHue + (Math.random() - 0.5) * 40,
					saturation: 70 + Math.random() * 20,
					lightness: 55 + Math.random() * 15,
					pulsePhase: Math.random() * Math.PI * 2,
					pulseSpeed: 0.3 + Math.random() * 0.4,
					isCentral: false,
					isSatellite: true
				});
			}

			// Ambient floating orbs
			const ambientCount = orbCount - satelliteCount - 1;
			for (let i = 0; i < ambientCount; i++) {
				const angle = Math.random() * Math.PI * 2;
				const distance = 150 + Math.random() * Math.min(width, height) * 0.4;
				orbs.push({
					x: centerX + Math.cos(angle) * distance,
					y: centerY + Math.sin(angle) * distance,
					z: 0.2 + Math.random() * 0.8,
					baseX: centerX + Math.cos(angle) * distance,
					baseY: centerY + Math.sin(angle) * distance,
					radius: 3 + Math.random() * 10,
					orbitRadius: 0,
					orbitSpeed: 0,
					orbitOffset: 0,
					hue: coolHue + (Math.random() - 0.5) * 60,
					saturation: 50 + Math.random() * 40,
					lightness: 50 + Math.random() * 25,
					pulsePhase: Math.random() * Math.PI * 2,
					pulseSpeed: 0.1 + Math.random() * 0.3,
					isCentral: false,
					isSatellite: false
				});
			}
		}

		function handleMouseMove(e: MouseEvent) {
			if (!interactive) return;
			const rect = canvas.getBoundingClientRect();
			targetMouseX = e.clientX - rect.left;
			targetMouseY = e.clientY - rect.top;
		}

		function drawOrb(orb: Orb, currentHue: number, disperse: number) {
			const effectiveRadius = orb.radius * (0.8 + 0.4 * Math.sin(time * orb.pulseSpeed + orb.pulsePhase));

			// Parallax offset based on mouse
			const parallaxX = (mouseX - centerX) * 0.05 * orb.z * mouseInfluence;
			const parallaxY = (mouseY - centerY) * 0.05 * orb.z * mouseInfluence;

			// Calculate position
			let x = orb.x + parallaxX;
			let y = orb.y + parallaxY;

			// For satellites, update orbit position
			if (orb.isSatellite && !prefersReducedMotion) {
				const angle = orb.orbitOffset + time * orb.orbitSpeed;
				// Disperse: push satellites outward
				const currentOrbitRadius = orb.orbitRadius * (1 + disperse * 1.5);
				x = orb.baseX + Math.cos(angle) * currentOrbitRadius + parallaxX;
				y = orb.baseY + Math.sin(angle) * currentOrbitRadius + parallaxY;
			}

			// For ambient orbs, apply gentle drift and disperse
			if (!orb.isCentral && !orb.isSatellite && !prefersReducedMotion) {
				const driftX = Math.sin(time * 0.1 + orb.pulsePhase) * 20;
				const driftY = Math.cos(time * 0.15 + orb.pulsePhase * 1.3) * 15;
				// Disperse: push away from center
				const dx = orb.baseX - centerX;
				const dy = orb.baseY - centerY;
				const disperseScale = 1 + disperse * 0.8;
				x = centerX + dx * disperseScale + driftX + parallaxX;
				y = centerY + dy * disperseScale + driftY + parallaxY;
			}

			// Blend hue with color temperature
			const blendedHue = lerp(orb.hue, warmHue + (orb.hue - coolHue) * 0.3, colorTemperature);

			// Size based on depth (z) - larger = closer
			const depthScale = 0.6 + orb.z * 0.6;
			const size = effectiveRadius * depthScale;

			// Outer glow (large, soft)
			const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
			glowGradient.addColorStop(0, `hsla(${blendedHue}, ${orb.saturation}%, ${orb.lightness}%, 0.15)`);
			glowGradient.addColorStop(0.5, `hsla(${blendedHue}, ${orb.saturation}%, ${orb.lightness}%, 0.05)`);
			glowGradient.addColorStop(1, `hsla(${blendedHue}, ${orb.saturation}%, ${orb.lightness}%, 0)`);

			ctx.beginPath();
			ctx.arc(x, y, size * 4, 0, Math.PI * 2);
			ctx.fillStyle = glowGradient;
			ctx.fill();

			// Core orb gradient
			const coreGradient = ctx.createRadialGradient(
				x - size * 0.3,
				y - size * 0.3,
				0,
				x,
				y,
				size
			);

			// Bright white core
			coreGradient.addColorStop(0, `hsla(${blendedHue}, 20%, 95%, 0.95)`);
			coreGradient.addColorStop(0.3, `hsla(${blendedHue}, ${orb.saturation * 0.7}%, ${orb.lightness + 20}%, 0.9)`);
			coreGradient.addColorStop(0.7, `hsla(${blendedHue}, ${orb.saturation}%, ${orb.lightness}%, 0.8)`);
			coreGradient.addColorStop(1, `hsla(${blendedHue}, ${orb.saturation}%, ${orb.lightness - 10}%, 0.5)`);

			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fillStyle = coreGradient;
			ctx.fill();

			// Specular highlight
			if (orb.radius > 5) {
				const highlightGradient = ctx.createRadialGradient(
					x - size * 0.4,
					y - size * 0.4,
					0,
					x - size * 0.2,
					y - size * 0.2,
					size * 0.5
				);
				highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
				highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

				ctx.beginPath();
				ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
				ctx.fillStyle = highlightGradient;
				ctx.fill();
			}
		}

		function render() {
			animationId = requestAnimationFrame(render);

			if (!prefersReducedMotion) {
				time += 0.016; // ~60fps
			}

			// Smooth mouse following
			mouseX = lerp(mouseX, targetMouseX, 0.05);
			mouseY = lerp(mouseY, targetMouseY, 0.05);

			// Clear canvas with very subtle trail
			ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
			ctx.fillRect(0, 0, width, height);

			// Sort by z-depth (back to front)
			const sortedOrbs = [...orbs].sort((a, b) => a.z - b.z);

			// Draw orbs
			for (const orb of sortedOrbs) {
				drawOrb(orb, colorTemperature, disperseFactor);
			}
		}

		// Initialize
		resize();
		createOrbs();
		mouseX = targetMouseX = centerX;
		mouseY = targetMouseY = centerY;

		window.addEventListener('resize', () => {
			resize();
			createOrbs();
		});
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

<canvas bind:this={canvas} class="absolute inset-0 w-full h-full {className}"></canvas>

<style>
	canvas {
		display: block;
	}
</style>
