<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Props
	let {
		scrollProgress = $bindable(0),
		isVisible = true
	}: {
		scrollProgress?: number;
		isVisible?: boolean;
	} = $props();

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let prefersReducedMotion = false;

	// Particle type using simple object
	interface Particle {
		posX: number;
		posY: number;
		prevX: number;
		prevY: number;
		velX: number;
		velY: number;
		life: number;
		maxLife: number;
		size: number;
		brightness: number;
		hue: number;
	}

	onMount(() => {
		// Check for reduced motion preference
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (prefersReducedMotion) {
			// Draw static particles for reduced motion
			drawStaticParticles();
			return;
		}

		const ctx = canvas.getContext('2d')!;

		// Simplex noise implementation
		const perm: number[] = [];
		const grad = [
			[1, 1],
			[-1, 1],
			[1, -1],
			[-1, -1],
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		];

		// Initialize permutation table
		const p: number[] = [];
		for (let i = 0; i < 256; i++) p[i] = i;
		let seed = Date.now();
		for (let i = 255; i > 0; i--) {
			seed = (seed * 16807) % 2147483647;
			const j = seed % (i + 1);
			[p[i], p[j]] = [p[j], p[i]];
		}
		for (let i = 0; i < 512; i++) {
			perm[i] = p[i & 255];
		}

		function noise2D(x: number, y: number): number {
			const F2 = 0.5 * (Math.sqrt(3) - 1);
			const G2 = (3 - Math.sqrt(3)) / 6;

			const s = (x + y) * F2;
			const i = Math.floor(x + s);
			const j = Math.floor(y + s);
			const t = (i + j) * G2;

			const X0 = i - t;
			const Y0 = j - t;
			const x0 = x - X0;
			const y0 = y - Y0;

			let i1: number, j1: number;
			if (x0 > y0) {
				i1 = 1;
				j1 = 0;
			} else {
				i1 = 0;
				j1 = 1;
			}

			const x1 = x0 - i1 + G2;
			const y1 = y0 - j1 + G2;
			const x2 = x0 - 1 + 2 * G2;
			const y2 = y0 - 1 + 2 * G2;

			const ii = i & 255;
			const jj = j & 255;

			const gi0 = perm[ii + perm[jj]] % 8;
			const gi1 = perm[ii + i1 + perm[jj + j1]] % 8;
			const gi2 = perm[ii + 1 + perm[jj + 1]] % 8;

			let n0 = 0,
				n1 = 0,
				n2 = 0;

			let t0 = 0.5 - x0 * x0 - y0 * y0;
			if (t0 >= 0) {
				t0 *= t0;
				n0 = t0 * t0 * (grad[gi0][0] * x0 + grad[gi0][1] * y0);
			}

			let t1 = 0.5 - x1 * x1 - y1 * y1;
			if (t1 >= 0) {
				t1 *= t1;
				n1 = t1 * t1 * (grad[gi1][0] * x1 + grad[gi1][1] * y1);
			}

			let t2 = 0.5 - x2 * x2 - y2 * y2;
			if (t2 >= 0) {
				t2 *= t2;
				n2 = t2 * t2 * (grad[gi2][0] * x2 + grad[gi2][1] * y2);
			}

			return 70 * (n0 + n1 + n2);
		}

		let width = 0;
		let height = 0;
		let particles: Particle[] = [];
		const PARTICLE_COUNT = 1800;
		const CONNECTION_DISTANCE = 100;

		// Mouse position for interaction
		let mouseX = 0;
		let mouseY = 0;
		let mouseInfluence = 0;

		// Time for noise evolution
		let time = 0;

		// Colors
		const baseHue = 210;
		const hueRange = 50;

		function resize() {
			const dpr = Math.min(window.devicePixelRatio, 2);
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// Reinitialize particles on resize
			initParticles();
		}

		function initParticles() {
			particles = [];
			for (let i = 0; i < PARTICLE_COUNT; i++) {
				particles.push(createParticle());
			}
		}

		function createParticle(x?: number, y?: number): Particle {
			const px = x ?? Math.random() * width;
			const py = y ?? Math.random() * height;
			const maxLife = 200 + Math.random() * 400;

			return {
				posX: px,
				posY: py,
				prevX: px,
				prevY: py,
				velX: 0,
				velY: 0,
				life: Math.random() * maxLife,
				maxLife,
				size: 0.5 + Math.random() * 1.5,
				brightness: 0.3 + Math.random() * 0.7,
				hue: baseHue + Math.random() * hueRange
			};
		}

		function handleMouseMove(e: MouseEvent) {
			mouseX = e.clientX;
			mouseY = e.clientY;
			mouseInfluence = 1;
		}

		function handleMouseLeave() {
			mouseInfluence *= 0.95;
		}

		function updateParticle(p: Particle) {
			// Store previous position for trail
			p.prevX = p.posX;
			p.prevY = p.posY;

			// Get noise-based flow field
			const noiseScale = 0.003;
			const noiseX = p.posX * noiseScale;
			const noiseY = p.posY * noiseScale;
			const noiseT = time * 0.0003;

			const angle = noise2D(noiseX + noiseT, noiseY + noiseT) * Math.PI * 2;

			// Base velocity from flow field
			const flowStrength = 0.4 + scrollProgress * 0.3;
			p.velX += Math.cos(angle) * flowStrength;
			p.velY += Math.sin(angle) * flowStrength;

			// Mouse attraction/repulsion
			if (mouseInfluence > 0.01) {
				const dx = mouseX - p.posX;
				const dy = mouseY - p.posY;
				const dist = Math.sqrt(dx * dx + dy * dy);
				const maxDist = 200;

				if (dist < maxDist && dist > 1) {
					const force = (1 - dist / maxDist) * mouseInfluence * 0.5;
					p.velX += (dx / dist) * force;
					p.velY += (dy / dist) * force;
				}
			}

			// Apply velocity with damping
			p.velX *= 0.92;
			p.velY *= 0.92;
			p.posX += p.velX;
			p.posY += p.velY;

			// Wrap around edges smoothly
			const margin = 50;
			if (p.posX < -margin) p.posX = width + margin;
			if (p.posX > width + margin) p.posX = -margin;
			if (p.posY < -margin) p.posY = height + margin;
			if (p.posY > height + margin) p.posY = -margin;

			// Age particle
			p.life--;
			if (p.life <= 0) {
				// Respawn
				const newP = createParticle();
				p.posX = newP.posX;
				p.posY = newP.posY;
				p.prevX = newP.prevX;
				p.prevY = newP.prevY;
				p.velX = newP.velX;
				p.velY = newP.velY;
				p.life = newP.life;
				p.maxLife = newP.maxLife;
				p.size = newP.size;
				p.brightness = newP.brightness;
				p.hue = newP.hue;
			}
		}

		function render() {
			if (!isVisible) {
				animationId = requestAnimationFrame(render);
				return;
			}

			time++;
			mouseInfluence *= 0.99;

			// Clear with fade effect for trails
			ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
			ctx.fillRect(0, 0, width, height);

			// Update all particles
			for (const p of particles) {
				updateParticle(p);
			}

			// Draw connections between nearby particles (sample for performance)
			const sampleSize = Math.min(particles.length, 400);
			const step = Math.floor(particles.length / sampleSize);

			for (let i = 0; i < particles.length; i += step) {
				const p1 = particles[i];
				for (let j = i + step; j < particles.length; j += step) {
					const p2 = particles[j];
					const dx = p1.posX - p2.posX;
					const dy = p1.posY - p2.posY;
					const dist = Math.sqrt(dx * dx + dy * dy);

					if (dist < CONNECTION_DISTANCE) {
						const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.15;
						const lifeAlpha1 = Math.min(p1.life / 50, 1);
						const lifeAlpha2 = Math.min(p2.life / 50, 1);

						ctx.strokeStyle = `hsla(${(p1.hue + p2.hue) / 2}, 70%, 60%, ${alpha * lifeAlpha1 * lifeAlpha2})`;
						ctx.beginPath();
						ctx.moveTo(p1.posX, p1.posY);
						ctx.lineTo(p2.posX, p2.posY);
						ctx.stroke();
					}
				}
			}

			// Draw particles with glow effect
			ctx.globalCompositeOperation = 'lighter';

			for (const p of particles) {
				const lifeRatio = Math.min(p.life / 50, 1, (p.maxLife - p.life) / 50);
				const alpha = p.brightness * lifeRatio;

				// Particle trail
				ctx.beginPath();
				ctx.moveTo(p.prevX, p.prevY);
				ctx.lineTo(p.posX, p.posY);
				ctx.strokeStyle = `hsla(${p.hue}, 75%, 65%, ${alpha * 0.6})`;
				ctx.lineWidth = p.size * 0.8;
				ctx.stroke();

				// Particle glow core
				const gradient = ctx.createRadialGradient(
					p.posX,
					p.posY,
					0,
					p.posX,
					p.posY,
					p.size * 3
				);
				gradient.addColorStop(0, `hsla(${p.hue}, 80%, 75%, ${alpha})`);
				gradient.addColorStop(0.4, `hsla(${p.hue}, 70%, 60%, ${alpha * 0.5})`);
				gradient.addColorStop(1, `hsla(${p.hue}, 60%, 50%, 0)`);

				ctx.beginPath();
				ctx.fillStyle = gradient;
				ctx.arc(p.posX, p.posY, p.size * 3, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.globalCompositeOperation = 'source-over';

			// Add occasional bright highlights based on scroll
			if (Math.random() < 0.02 + scrollProgress * 0.03) {
				const x = Math.random() * width;
				const y = Math.random() * height;
				const highlightSize = 2 + Math.random() * 4;

				const highlight = ctx.createRadialGradient(x, y, 0, x, y, highlightSize * 4);
				highlight.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
				highlight.addColorStop(0.3, 'hsla(200, 100%, 70%, 0.4)');
				highlight.addColorStop(1, 'transparent');

				ctx.globalCompositeOperation = 'lighter';
				ctx.fillStyle = highlight;
				ctx.beginPath();
				ctx.arc(x, y, highlightSize * 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.globalCompositeOperation = 'source-over';
			}

			animationId = requestAnimationFrame(render);
		}

		function drawStaticParticles() {
			// For reduced motion: draw a nice static field
			const staticCtx = canvas.getContext('2d');
			if (!staticCtx) return;

			const dpr = Math.min(window.devicePixelRatio, 2);
			const w = window.innerWidth;
			const h = window.innerHeight;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

			staticCtx.fillStyle = '#000';
			staticCtx.fillRect(0, 0, w, h);

			// Draw static particles
			for (let i = 0; i < 300; i++) {
				const x = Math.random() * w;
				const y = Math.random() * h;
				const size = 1 + Math.random() * 2;
				const hue = 210 + Math.random() * 50;

				const gradient = staticCtx.createRadialGradient(x, y, 0, x, y, size * 3);
				gradient.addColorStop(0, `hsla(${hue}, 70%, 65%, 0.6)`);
				gradient.addColorStop(1, 'transparent');

				staticCtx.fillStyle = gradient;
				staticCtx.beginPath();
				staticCtx.arc(x, y, size * 3, 0, Math.PI * 2);
				staticCtx.fill();
			}
		}

		// Initialize
		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseleave', handleMouseLeave);

		// Start animation
		render();

		// Cleanup
		return () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', resize);
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseleave', handleMouseLeave);
		};
	});

	onDestroy(() => {
		if (animationId) {
			cancelAnimationFrame(animationId);
		}
	});
</script>

<canvas bind:this={canvas} class="absolute inset-0 w-full h-full" aria-hidden="true"></canvas>

<style>
	canvas {
		display: block;
		pointer-events: none;
	}
</style>
