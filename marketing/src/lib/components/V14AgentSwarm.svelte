<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let {
		agentCount = 50,
		connectionDistance = 120,
		centralPull = 0.0001,
		repulsion = 0.5
	}: {
		agentCount?: number;
		connectionDistance?: number;
		centralPull?: number;
		repulsion?: number;
	} = $props();

	let container: HTMLCanvasElement;
	let animationId: number;
	let isVisible = true;

	interface Agent {
		x: number;
		y: number;
		vx: number;
		vy: number;
		targetX: number;
		targetY: number;
		size: number;
		hue: number;
		pulsePhase: number;
		isLeader: boolean;
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

		const agents: Agent[] = [];
		const mouse = { x: w / 2, y: h / 2 };
		let time = 0;

		// Create agents - some are "leaders" that others follow
		for (let i = 0; i < agentCount; i++) {
			const isLeader = i < 5; // First 5 are leaders
			agents.push({
				x: Math.random() * w,
				y: Math.random() * h,
				vx: (Math.random() - 0.5) * 2,
				vy: (Math.random() - 0.5) * 2,
				targetX: w / 2,
				targetY: h / 2,
				size: isLeader ? 4 : 2 + Math.random() * 2,
				hue: 250 + Math.random() * 60, // Purple to pink range
				pulsePhase: Math.random() * Math.PI * 2,
				isLeader
			});
		}

		function animate() {
			if (!isVisible) {
				animationId = requestAnimationFrame(animate);
				return;
			}

			time += 0.016;

			// Fade trail effect
			ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
			ctx.fillRect(0, 0, w, h);

			const centerX = w / 2;
			const centerY = h / 2;

			// Update leaders - they orbit and attract followers
			agents.filter(a => a.isLeader).forEach((leader, i) => {
				const angle = time * 0.3 + (i * Math.PI * 2) / 5;
				const radius = 150 + Math.sin(time * 0.5 + i) * 50;
				leader.targetX = centerX + Math.cos(angle) * radius;
				leader.targetY = centerY + Math.sin(angle) * radius;
			});

			// Update all agents
			agents.forEach((agent, i) => {
				// Leaders move toward their orbital targets
				if (agent.isLeader) {
					const dx = agent.targetX - agent.x;
					const dy = agent.targetY - agent.y;
					agent.vx += dx * 0.02;
					agent.vy += dy * 0.02;
				} else {
					// Followers are attracted to nearest leader and mouse
					let nearestLeader = agents[0];
					let minDist = Infinity;
					agents.filter(a => a.isLeader).forEach(leader => {
						const d = Math.hypot(leader.x - agent.x, leader.y - agent.y);
						if (d < minDist) {
							minDist = d;
							nearestLeader = leader;
						}
					});

					// Follow leader
					const ldx = nearestLeader.x - agent.x;
					const ldy = nearestLeader.y - agent.y;
					agent.vx += ldx * 0.003;
					agent.vy += ldy * 0.003;

					// Mouse influence
					const mdx = mouse.x - agent.x;
					const mdy = mouse.y - agent.y;
					const mouseDist = Math.hypot(mdx, mdy);
					if (mouseDist < 200) {
						const force = (1 - mouseDist / 200) * 0.1;
						agent.vx += mdx * force * 0.01;
						agent.vy += mdy * force * 0.01;
					}
				}

				// Gentle central pull (team cohesion)
				const cdx = centerX - agent.x;
				const cdy = centerY - agent.y;
				agent.vx += cdx * centralPull;
				agent.vy += cdy * centralPull;

				// Repulsion from other agents (personal space)
				agents.forEach((other, j) => {
					if (i === j) return;
					const dx = agent.x - other.x;
					const dy = agent.y - other.y;
					const dist = Math.hypot(dx, dy);
					if (dist < 30 && dist > 0) {
						const force = (30 - dist) / 30 * repulsion;
						agent.vx += (dx / dist) * force;
						agent.vy += (dy / dist) * force;
					}
				});

				// Apply velocity with damping
				agent.x += agent.vx;
				agent.y += agent.vy;
				agent.vx *= 0.95;
				agent.vy *= 0.95;

				// Soft boundaries
				const margin = 50;
				if (agent.x < margin) agent.vx += 0.5;
				if (agent.x > w - margin) agent.vx -= 0.5;
				if (agent.y < margin) agent.vy += 0.5;
				if (agent.y > h - margin) agent.vy -= 0.5;
			});

			// Draw connections (team bonds)
			agents.forEach((agent, i) => {
				agents.forEach((other, j) => {
					if (j <= i) return;
					const dist = Math.hypot(agent.x - other.x, agent.y - other.y);
					if (dist < connectionDistance) {
						const alpha = (1 - dist / connectionDistance) * 0.4;
						// Connections between leaders are brighter
						const boost = (agent.isLeader && other.isLeader) ? 2 : 1;
						ctx.beginPath();
						ctx.moveTo(agent.x, agent.y);
						ctx.lineTo(other.x, other.y);
						ctx.strokeStyle = `hsla(${(agent.hue + other.hue) / 2}, 70%, 60%, ${alpha * boost})`;
						ctx.lineWidth = agent.isLeader && other.isLeader ? 2 : 1;
						ctx.stroke();
					}
				});
			});

			// Draw agents
			agents.forEach(agent => {
				const pulse = Math.sin(time * 3 + agent.pulsePhase) * 0.3 + 1;
				const size = agent.size * pulse;

				// Glow
				const gradient = ctx.createRadialGradient(agent.x, agent.y, 0, agent.x, agent.y, size * 3);
				gradient.addColorStop(0, `hsla(${agent.hue}, 80%, 70%, 0.8)`);
				gradient.addColorStop(0.5, `hsla(${agent.hue}, 70%, 60%, 0.3)`);
				gradient.addColorStop(1, 'transparent');

				ctx.beginPath();
				ctx.arc(agent.x, agent.y, size * 3, 0, Math.PI * 2);
				ctx.fillStyle = gradient;
				ctx.fill();

				// Core
				ctx.beginPath();
				ctx.arc(agent.x, agent.y, size, 0, Math.PI * 2);
				ctx.fillStyle = agent.isLeader
					? `hsla(${agent.hue}, 90%, 80%, 1)`
					: `hsla(${agent.hue}, 80%, 70%, 0.9)`;
				ctx.fill();
			});

			animationId = requestAnimationFrame(animate);
		}

		animate();

		function handleMouseMove(e: MouseEvent) {
			const rect = container.getBoundingClientRect();
			mouse.x = e.clientX - rect.left;
			mouse.y = e.clientY - rect.top;
		}

		function handleResize() {
			w = container.clientWidth;
			h = container.clientHeight;
			container.width = w;
			container.height = h;
		}

		function handleVisibility() {
			isVisible = !document.hidden;
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('resize', handleResize);
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			if (animationId) cancelAnimationFrame(animationId);
			window.removeEventListener('mousemove', handleMouseMove);
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
