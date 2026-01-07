<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let canvas: HTMLCanvasElement;
	let animationId: number;

	onMount(() => {
		const ctx = canvas.getContext('2d')!;

		// === Vector3D Class ===
		class Vector3D {
			x: number;
			y: number;
			z: number;

			constructor(x = 0, y = 0, z = 0) {
				this.x = x;
				this.y = y;
				this.z = z;
			}

			dot3d(x: number, y: number, z: number) {
				return this.x * x + this.y * y + this.z * z;
			}

			set(x: number, y: number, z: number) {
				this.x = x;
				this.y = y;
				this.z = z;
				return this;
			}

			add(other: Vector3D | number) {
				if (typeof other === 'number') {
					this.x += other;
					this.y += other;
					this.z += other;
				} else {
					this.x += other.x;
					this.y += other.y;
					this.z += other.z;
				}
				return this;
			}

			sub(other: Vector3D | number) {
				if (typeof other === 'number') {
					this.x -= other;
					this.y -= other;
					this.z -= other;
				} else {
					this.x -= other.x;
					this.y -= other.y;
					this.z -= other.z;
				}
				return this;
			}

			mul(other: Vector3D | number) {
				if (typeof other === 'number') {
					this.x *= other;
					this.y *= other;
					this.z *= other;
				} else {
					this.x *= other.x;
					this.y *= other.y;
					this.z *= other.z;
				}
				return this;
			}

			clone() {
				return new Vector3D(this.x, this.y, this.z);
			}

			move(dest: Vector3D) {
				dest.x = this.x;
				dest.y = this.y;
				dest.z = this.z;
				return this;
			}

			distance(other: Vector3D) {
				const dx = this.x - other.x;
				const dy = this.y - other.y;
				return Math.sqrt(dx * dx + dy * dy);
			}

			wrap2d(bounds: Vector3D) {
				if (this.x > bounds.x) {
					this.x = 0;
					return true;
				}
				if (this.x < 0) {
					this.x = bounds.x;
					return true;
				}
				if (this.y > bounds.y) {
					this.y = 0;
					return true;
				}
				if (this.y < 0) {
					this.y = bounds.y;
					return true;
				}
				return false;
			}
		}

		// === Seeded Random ===
		class SeededRandom {
			private seed: number;

			constructor(seed: number) {
				this.seed = seed;
			}

			random(min?: number, max?: number) {
				this.seed = (this.seed * 9301 + 49297) % 233280;
				const rnd = this.seed / 233280;
				if (min !== undefined && max !== undefined) {
					return Math.floor(rnd * (max - min + 1)) + min;
				}
				return rnd;
			}
		}

		// === Perlin Noise ===
		class Perlin {
			private grad3: Vector3D[];
			private p: number[];
			private permutation: number[];
			private gradP: Vector3D[];
			private F3: number;
			private G3: number;

			constructor() {
				this.grad3 = [
					new Vector3D(1, 1, 0), new Vector3D(-1, 1, 0), new Vector3D(1, -1, 0), new Vector3D(-1, -1, 0),
					new Vector3D(1, 0, 1), new Vector3D(-1, 0, 1), new Vector3D(1, 0, -1), new Vector3D(-1, 0, -1),
					new Vector3D(0, 1, 1), new Vector3D(0, -1, 1), new Vector3D(0, 1, -1), new Vector3D(0, -1, -1)
				];

				this.p = [
					0x97, 0xa0, 0x89, 0x5b, 0x5a, 0x0f, 0x83, 0x0d, 0xc9, 0x5f, 0x60, 0x35, 0xc2, 0xe9, 0x07, 0xe1,
					0x8c, 0x24, 0x67, 0x1e, 0x45, 0x8e, 0x08, 0x63, 0x25, 0xf0, 0x15, 0x0a, 0x17, 0xbe, 0x06, 0x94,
					0xf7, 0x78, 0xea, 0x4b, 0x00, 0x1a, 0xc5, 0x3e, 0x5e, 0xfc, 0xdb, 0xcb, 0x75, 0x23, 0x0b, 0x20,
					0x39, 0xb1, 0x21, 0x58, 0xed, 0x95, 0x38, 0x57, 0xae, 0x14, 0x7d, 0x88, 0xab, 0xa8, 0x44, 0xaf,
					0x4a, 0xa5, 0x47, 0x86, 0x8b, 0x30, 0x1b, 0xa6, 0x4d, 0x92, 0x9e, 0xe7, 0x53, 0x6f, 0xe5, 0x7a,
					0x3c, 0xd3, 0x85, 0xe6, 0xdc, 0x69, 0x5c, 0x29, 0x37, 0x2e, 0xf5, 0x28, 0xf4, 0x66, 0x8f, 0x36,
					0x41, 0x19, 0x3f, 0xa1, 0x01, 0xd8, 0x50, 0x49, 0xd1, 0x4c, 0x84, 0xbb, 0xd0, 0x59, 0x12, 0xa9,
					0xc8, 0xc4, 0x87, 0x82, 0x74, 0xbc, 0x9f, 0x56, 0xa4, 0x64, 0x6d, 0xc6, 0xad, 0xba, 0x03, 0x40,
					0x34, 0xd9, 0xe2, 0xfa, 0x7c, 0x7b, 0x05, 0xca, 0x26, 0x93, 0x76, 0x7e, 0xff, 0x52, 0x55, 0xd4,
					0xcf, 0xce, 0x3b, 0xe3, 0x2f, 0x10, 0x3a, 0x11, 0xb6, 0xbd, 0x1c, 0x2a, 0xdf, 0xb7, 0xaa, 0xd5,
					0x77, 0xf8, 0x98, 0x02, 0x2c, 0x9a, 0xa3, 0x46, 0xdd, 0x99, 0x65, 0x9b, 0xa7, 0x2b, 0xac, 0x09,
					0x81, 0x16, 0x27, 0xfd, 0x13, 0x62, 0x6c, 0x6e, 0x4f, 0x71, 0xe0, 0xe8, 0xb2, 0xb9, 0x70, 0x68,
					0xda, 0xf6, 0x61, 0xe4, 0xfb, 0x22, 0xf2, 0xc1, 0xee, 0xd2, 0x90, 0x0c, 0xbf, 0xb3, 0xa2, 0xf1,
					0x51, 0x33, 0x91, 0xeb, 0xf9, 0x0e, 0xef, 0x6b, 0x31, 0xc0, 0xd6, 0x1f, 0xb5, 0xc7, 0x6a, 0x9d,
					0xb8, 0x54, 0xcc, 0xb0, 0x73, 0x79, 0x32, 0x2d, 0x7f, 0x04, 0x96, 0xfe, 0x8a, 0xec, 0xcd, 0x5d,
					0xde, 0x72, 0x43, 0x1d, 0x18, 0x48, 0xf3, 0x8d, 0x80, 0xc3, 0x4e, 0x42, 0xd7, 0x3d, 0x9c, 0xb4
				];

				this.permutation = new Array(512);
				this.gradP = new Array(512);
				this.F3 = 1 / 3;
				this.G3 = 1 / 6;
			}

			init(prng: () => number) {
				for (let i = 0; i < 256; i++) {
					const randval = this.p[i] ^ prng();
					this.permutation[i] = this.permutation[i + 256] = randval;
					this.gradP[i] = this.gradP[i + 256] = this.grad3[randval % this.grad3.length];
				}
			}

			simplex3d(x: number, y: number, z: number) {
				const s = (x + y + z) * this.F3;
				let i = Math.floor(x + s);
				let j = Math.floor(y + s);
				let k = Math.floor(z + s);
				const t = (i + j + k) * this.G3;
				const x0 = x - i + t;
				const y0 = y - j + t;
				const z0 = z - k + t;

				let i1, j1, k1, i2, j2, k2;
				if (x0 >= y0) {
					if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
					else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
					else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
				} else {
					if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
					else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
					else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
				}

				const x1 = x0 - i1 + this.G3;
				const y1 = y0 - j1 + this.G3;
				const z1 = z0 - k1 + this.G3;
				const x2 = x0 - i2 + 2 * this.G3;
				const y2 = y0 - j2 + 2 * this.G3;
				const z2 = z0 - k2 + 2 * this.G3;
				const x3 = x0 - 1 + 3 * this.G3;
				const y3 = y0 - 1 + 3 * this.G3;
				const z3 = z0 - 1 + 3 * this.G3;

				i &= 255;
				j &= 255;
				k &= 255;

				const gi0 = this.gradP[i + this.permutation[j + this.permutation[k]]];
				const gi1 = this.gradP[i + i1 + this.permutation[j + j1 + this.permutation[k + k1]]];
				const gi2 = this.gradP[i + i2 + this.permutation[j + j2 + this.permutation[k + k2]]];
				const gi3 = this.gradP[i + 1 + this.permutation[j + 1 + this.permutation[k + 1]]];

				let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
				let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
				let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
				let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;

				const n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * gi0.dot3d(x0, y0, z0));
				const n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * gi1.dot3d(x1, y1, z1));
				const n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * gi2.dot3d(x2, y2, z2));
				const n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * gi3.dot3d(x3, y3, z3));

				return 32 * (n0 + n1 + n2 + n3);
			}
		}

		// === Particle ===
		class Particle {
			p: Vector3D; // position
			t: Vector3D; // trail
			v: Vector3D; // velocity
			g: Perlin;
			b: Vector3D; // bounds
			r: SeededRandom;
			i: number; // iteration
			l: number; // life

			constructor(generator: Perlin, bounds: Vector3D, rctx: SeededRandom) {
				this.p = new Vector3D();
				this.t = new Vector3D();
				this.v = new Vector3D();
				this.g = generator;
				this.b = bounds;
				this.r = rctx;
				this.i = 0;
				this.l = 0;
				this.reset();
			}

			reset() {
				this.p.x = this.t.x = Math.floor(this.r.random() * this.b.x);
				this.p.y = this.t.y = Math.floor(this.r.random() * this.b.y);
				this.v.set(1, 1, 0);
				this.i = 0;
				this.l = this.r.random(1000, 10000);
			}

			step(mousePos: Vector3D) {
				if (this.i++ > this.l) {
					this.reset();
				}

				const xx = this.p.x / 200;
				const yy = this.p.y / 200;
				const zz = Date.now() / 5000;
				const a = this.r.random() * Math.PI * 2;
				const rnd = this.r.random() / 4;

				// Noise-based velocity
				this.v.x += rnd * Math.sin(a) + this.g.simplex3d(xx, yy, -zz);
				this.v.y += rnd * Math.cos(a) + this.g.simplex3d(xx, yy, zz);

				// Always attract to mouse (the key change!)
				const attraction = mousePos.clone().sub(this.p).mul(0.0006);
				this.v.add(attraction);

				// Keep trail and apply velocity with damping
				this.p.move(this.t).add(this.v.mul(0.94));

				// Wrap around edges
				if (this.p.wrap2d(this.b)) {
					this.p.move(this.t);
				}
			}

			render(context: CanvasRenderingContext2D) {
				context.moveTo(this.t.x, this.t.y);
				context.lineTo(this.p.x, this.p.y);
			}
		}

		// === Initialize ===
		const rctx = new SeededRandom(Date.now());
		const perlin = new Perlin();
		const bounds = new Vector3D(0, 0, 0);
		const mousePos = new Vector3D(0, 0, 0);
		const particles: Particle[] = [];
		const PARTICLE_COUNT = 3000;
		let hue = 200; // Start with blue hue
		let width = 0;
		let height = 0;

		// Initialize Perlin
		perlin.init(() => rctx.random(0, 255));

		// Resize handler
		function resize() {
			width = bounds.x = canvas.width = window.innerWidth;
			height = bounds.y = canvas.height = window.innerHeight;
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, width, height);
		}

		// Mouse tracking
		function handleMouseMove(event: MouseEvent) {
			mousePos.x = event.clientX;
			mousePos.y = event.clientY;
		}

		// Initialize
		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', handleMouseMove);

		// Set initial mouse position to center
		mousePos.x = width / 2;
		mousePos.y = height / 2;

		// Create particles
		for (let i = 0; i < PARTICLE_COUNT; i++) {
			particles.push(new Particle(perlin, bounds, rctx));
		}

		// Render loop
		function render() {
			animationId = requestAnimationFrame(render);

			ctx.beginPath();

			// Step and render all particles
			for (let i = 0; i < particles.length; i++) {
				particles[i].step(mousePos);
				particles[i].render(ctx);
			}

			// Fade overlay for trails
			ctx.globalCompositeOperation = 'source-over';
			ctx.fillStyle = 'rgba(10, 10, 18, 0.085)';
			ctx.fillRect(0, 0, width, height);

			// Draw particles with color
			ctx.globalCompositeOperation = 'lighter';
			ctx.strokeStyle = `hsla(${hue}, 75%, 50%, 0.55)`;
			ctx.stroke();
			ctx.closePath();

			// Rotate hue slowly (blue to purple to cyan range)
			hue = ((hue + 0.15) % 60) + 200; // Stay in 200-260 range (blue-purple)
		}

		render();

		// Cleanup
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

<canvas bind:this={canvas} class="absolute inset-0 w-full h-full"></canvas>

<style>
	canvas {
		display: block;
	}
</style>
