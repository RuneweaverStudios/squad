<script lang="ts">
	import { onMount } from 'svelte';

	let { stageCount = 5, particleRate = 2 } = $props();

	let container: HTMLCanvasElement;
	let animationId: number;

	interface FlowParticle {
		x: number;
		y: number;
		vx: number;
		stage: number;
		size: number;
		hue: number;
		life: number;
		maxLife: number;
	}

	interface Stage {
		x: number;
		y: number;
		radius: number;
		hue: number;
		particles: number; // Count of particles that passed through
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

		const particles: FlowParticle[] = [];
		const stages: Stage[] = [];
		let time = 0;
		let isVisible = true;

		// Stage colors: purple -> blue -> cyan -> green -> gold (progression)
		const stageHues = [270, 240, 200, 150, 45];
		const stageLabels = ['Input', 'Structure', 'Scale', 'Control', 'Ship'];

		// Initialize stages (evenly distributed)
		for (let i = 0; i < stageCount; i++) {
			stages.push({
				x: (w * (i + 1)) / (stageCount + 1),
				y: h / 2,
				radius: 30,
				hue: stageHues[i],
				particles: 0
			});
		}

		function spawnParticle() {
			particles.push({
				x: -20,
				y: h / 2 + (Math.random() - 0.5) * 100,
				vx: 1 + Math.random() * 0.5,
				stage: 0,
				size: 2 + Math.random() * 2,
				hue: stageHues[0],
				life: 1,
				maxLife: 1
			});
		}

		function animate() {
			if (!isVisible) {
				animationId = requestAnimationFrame(animate);
				return;
			}

			time += 0.016;

			// Spawn new particles
			if (Math.random() < particleRate * 0.016) {
				spawnParticle();
			}

			// Clear
			ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
			ctx.fillRect(0, 0, w, h);

			// Draw pipeline track
			ctx.beginPath();
			ctx.moveTo(0, h / 2);
			ctx.lineTo(w, h / 2);
			ctx.strokeStyle = 'rgba(100, 100, 120, 0.2)';
			ctx.lineWidth = 40;
			ctx.stroke();

			// Draw flow field (subtle guide lines)
			for (let i = 0; i < stageCount - 1; i++) {
				const s1 = stages[i];
				const s2 = stages[i + 1];

				// Curved connection
				ctx.beginPath();
				ctx.moveTo(s1.x + s1.radius, s1.y);
				const cp1x = s1.x + (s2.x - s1.x) * 0.3;
				const cp2x = s1.x + (s2.x - s1.x) * 0.7;
				ctx.bezierCurveTo(cp1x, s1.y, cp2x, s2.y, s2.x - s2.radius, s2.y);
				ctx.strokeStyle = `hsla(${(s1.hue + s2.hue) / 2}, 50%, 50%, 0.1)`;
				ctx.lineWidth = 20;
				ctx.stroke();
			}

			// Draw stages (gates/checkpoints)
			stages.forEach((stage, i) => {
				// Stage glow
				const glowPulse = Math.sin(time * 2 + i) * 0.1 + 0.9;
				const glow = ctx.createRadialGradient(
					stage.x, stage.y, stage.radius * 0.5,
					stage.x, stage.y, stage.radius * 2.5
				);
				glow.addColorStop(0, `hsla(${stage.hue}, 70%, 60%, ${0.3 * glowPulse})`);
				glow.addColorStop(0.5, `hsla(${stage.hue}, 60%, 50%, ${0.15 * glowPulse})`);
				glow.addColorStop(1, 'transparent');

				ctx.beginPath();
				ctx.arc(stage.x, stage.y, stage.radius * 2.5, 0, Math.PI * 2);
				ctx.fillStyle = glow;
				ctx.fill();

				// Stage ring
				ctx.beginPath();
				ctx.arc(stage.x, stage.y, stage.radius, 0, Math.PI * 2);
				ctx.strokeStyle = `hsla(${stage.hue}, 70%, 60%, 0.8)`;
				ctx.lineWidth = 3;
				ctx.stroke();

				// Inner fill
				ctx.beginPath();
				ctx.arc(stage.x, stage.y, stage.radius - 3, 0, Math.PI * 2);
				ctx.fillStyle = `hsla(${stage.hue}, 70%, 20%, 0.5)`;
				ctx.fill();

				// Stage number
				ctx.fillStyle = `hsla(${stage.hue}, 70%, 80%, 0.9)`;
				ctx.font = 'bold 16px system-ui';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(`0${i + 1}`, stage.x, stage.y);
			});

			// Update and draw particles
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];

				// Find current target stage
				const targetStage = stages[Math.min(p.stage, stageCount - 1)];

				// Move toward current stage
				const dx = targetStage.x - p.x;
				const dy = targetStage.y - p.y;
				const dist = Math.hypot(dx, dy);

				// Steering behavior
				if (dist > targetStage.radius) {
					// Accelerate toward stage
					p.vx += dx * 0.001;
					const vy = dy * 0.02;
					p.y += vy;
				}

				// Base forward velocity
				p.x += p.vx;

				// Check if reached stage
				if (dist < targetStage.radius + 10 && p.stage < stageCount) {
					// Transform through stage (change color)
					p.hue = stageHues[Math.min(p.stage, stageCount - 1)];
					stages[p.stage].particles++;

					// Advance to next stage
					p.stage++;

					// Speed boost after passing through
					p.vx *= 1.2;
				}

				// Remove if past the end
				if (p.x > w + 50) {
					particles.splice(i, 1);
					continue;
				}

				// Draw particle trail
				ctx.beginPath();
				ctx.moveTo(p.x, p.y);
				ctx.lineTo(p.x - p.vx * 8, p.y);
				ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, 0.4)`;
				ctx.lineWidth = p.size * 0.8;
				ctx.stroke();

				// Draw particle
				const particleGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
				particleGlow.addColorStop(0, `hsla(${p.hue}, 80%, 70%, 0.9)`);
				particleGlow.addColorStop(0.5, `hsla(${p.hue}, 70%, 60%, 0.4)`);
				particleGlow.addColorStop(1, 'transparent');

				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
				ctx.fillStyle = particleGlow;
				ctx.fill();

				// Core
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fillStyle = `hsla(${p.hue}, 80%, 80%, 1)`;
				ctx.fill();
			}

			// Draw completion sparks at the end
			if (time % 0.5 < 0.016) {
				const lastStage = stages[stageCount - 1];
				for (let i = 0; i < 3; i++) {
					const angle = Math.random() * Math.PI * 2;
					const speed = 2 + Math.random() * 3;
					particles.push({
						x: lastStage.x + lastStage.radius,
						y: lastStage.y + (Math.random() - 0.5) * 20,
						vx: speed,
						stage: stageCount,
						size: 1 + Math.random(),
						hue: 45 + Math.random() * 30, // Gold sparkles
						life: 1,
						maxLife: 1
					});
				}
			}

			animationId = requestAnimationFrame(animate);
		}

		animate();

		function handleResize() {
			w = container.clientWidth;
			h = container.clientHeight;
			container.width = w;
			container.height = h;

			// Update stage positions
			for (let i = 0; i < stageCount; i++) {
				stages[i].x = (w * (i + 1)) / (stageCount + 1);
				stages[i].y = h / 2;
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
