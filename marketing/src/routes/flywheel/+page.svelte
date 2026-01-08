<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';

	const steps = [
		{ num: 1, title: 'PLAN WITH AI', desc: 'Describe your feature, get a PRD', color: 0x38bdf8 },
		{ num: 2, title: '/JAT:BEAD', desc: 'Convert PRD → structured tasks', color: 0x22d3ee },
		{ num: 3, title: 'EPIC SWARM', desc: 'Spawn agents on subtasks', color: 0x2dd4bf },
		{ num: 4, title: 'PARALLEL WORK', desc: 'Watch agents code simultaneously', color: 0x34d399 },
		{ num: 5, title: 'SMART QUESTIONS', desc: '"OAuth or JWT?" → click button', color: 0x4ade80 },
		{ num: 6, title: 'REVIEW IN /files', desc: 'See diffs, check code', color: 0xa3e635 },
		{ num: 7, title: 'COMMIT & PUSH', desc: 'Stage, message, push', color: 0xfbbf24 },
		{ num: 8, title: 'AUTO-PROCEED', desc: 'Low-priority tasks complete auto', color: 0xf97316 },
		{ num: 9, title: 'SUGGESTED TASKS', desc: 'Agent proposes next work → loop', color: 0xf472b6 }
	];

	let activeVisualization = $state(0);
	let canvasContainers: HTMLElement[] = $state([]);
	let scenes: { cleanup: () => void }[] = [];

	const visualizations = [
		{
			id: 'spinning-flywheel',
			title: '1. Spinning Flywheel',
			desc: 'A mechanical flywheel with 9 glowing nodes. Momentum builds as tasks complete.',
			setup: setupSpinningFlywheel
		},
		{
			id: 'orbital-rings',
			title: '2. Orbital System',
			desc: 'Steps orbit like planets around the "Ship Code" sun. Gravitational pull keeps the cycle moving.',
			setup: setupOrbitalRings
		},
		{
			id: 'dna-helix',
			title: '3. DNA Helix',
			desc: 'Double helix of continuous improvement. Each strand represents ideas becoming code.',
			setup: setupDNAHelix
		},
		{
			id: 'mobius-strip',
			title: '4. Möbius Strip',
			desc: 'An infinite loop with no beginning or end. Tasks flow seamlessly around the twist.',
			setup: setupMobiusStrip
		},
		{
			id: 'particle-river',
			title: '5. Particle River',
			desc: 'Ideas flow like water through transformation gates, emerging as shipped features.',
			setup: setupParticleRiver
		},
		{
			id: 'metamorphosis',
			title: '6. Metamorphosis Journey',
			desc: 'An entity evolves as it traverses a landscape—from idea to PRD to code to ship.',
			setup: setupMetamorphosis
		},
		{
			id: 'gear-mechanism',
			title: '7. Gear Mechanism',
			desc: 'Interlocking gears drive each other. No single gear stops—perpetual motion.',
			setup: setupGearMechanism
		},
		{
			id: 'neural-pulse',
			title: '8. Neural Network',
			desc: 'Synapses fire between nodes. Energy pulses represent work flowing through the system.',
			setup: setupNeuralPulse
		},
		{
			id: 'vortex-spiral',
			title: '9. Vortex Spiral',
			desc: 'Tasks spiral inward, compress, then burst outward as shipped code. Repeat infinitely.',
			setup: setupVortexSpiral
		},
		{
			id: 'phoenix-rise',
			title: '10. Phoenix Cycle',
			desc: 'The phoenix rises, transforms, completes its journey, then rises again from the ashes.',
			setup: setupPhoenixRise
		}
	];

	onMount(() => {
		// Initialize all visualizations
		visualizations.forEach((viz, i) => {
			if (canvasContainers[i]) {
				const cleanup = viz.setup(canvasContainers[i]);
				scenes.push({ cleanup });
			}
		});

		return () => {
			scenes.forEach(s => s.cleanup());
		};
	});

	// ============================================
	// VISUALIZATION 1: Spinning Flywheel
	// ============================================
	function setupSpinningFlywheel(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Create flywheel ring
		const ringGeometry = new THREE.TorusGeometry(3, 0.1, 16, 100);
		const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
		const ring = new THREE.Mesh(ringGeometry, ringMaterial);
		scene.add(ring);

		// Create spokes
		for (let i = 0; i < 9; i++) {
			const angle = (i / 9) * Math.PI * 2;
			const spokeGeometry = new THREE.CylinderGeometry(0.02, 0.02, 3, 8);
			const spokeMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4 });
			const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
			spoke.position.x = Math.cos(angle) * 1.5;
			spoke.position.y = Math.sin(angle) * 1.5;
			spoke.rotation.z = angle + Math.PI / 2;
			scene.add(spoke);
		}

		// Create nodes at each step position
		const nodes: THREE.Mesh[] = [];
		steps.forEach((step, i) => {
			const angle = (i / 9) * Math.PI * 2;
			const nodeGeometry = new THREE.SphereGeometry(0.25, 32, 32);
			const nodeMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
			node.position.x = Math.cos(angle) * 3;
			node.position.y = Math.sin(angle) * 3;
			nodes.push(node);
			scene.add(node);

			// Glow effect
			const glowGeometry = new THREE.SphereGeometry(0.35, 32, 32);
			const glowMaterial = new THREE.MeshBasicMaterial({ color: step.color, transparent: true, opacity: 0.3 });
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			glow.position.copy(node.position);
			scene.add(glow);
		});

		// Center hub
		const hubGeometry = new THREE.SphereGeometry(0.5, 32, 32);
		const hubMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
		const hub = new THREE.Mesh(hubGeometry, hubMaterial);
		scene.add(hub);

		camera.position.z = 8;

		let rotation = 0;
		animate(() => {
			rotation += 0.005;
			ring.rotation.z = rotation;
			nodes.forEach((node, i) => {
				const angle = (i / 9) * Math.PI * 2 + rotation;
				node.position.x = Math.cos(angle) * 3;
				node.position.y = Math.sin(angle) * 3;
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 2: Orbital Rings
	// ============================================
	function setupOrbitalRings(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Central sun (Ship Code)
		const sunGeometry = new THREE.SphereGeometry(0.8, 32, 32);
		const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
		const sun = new THREE.Mesh(sunGeometry, sunMaterial);
		scene.add(sun);

		// Sun glow
		const sunGlowGeometry = new THREE.SphereGeometry(1.2, 32, 32);
		const sunGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.2 });
		const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
		scene.add(sunGlow);

		// Create orbital paths and planets
		const planets: { mesh: THREE.Mesh; orbit: number; speed: number; angle: number }[] = [];
		steps.forEach((step, i) => {
			const orbitRadius = 1.5 + i * 0.4;

			// Orbit ring
			const orbitGeometry = new THREE.TorusGeometry(orbitRadius, 0.01, 8, 100);
			const orbitMaterial = new THREE.MeshBasicMaterial({ color: step.color, transparent: true, opacity: 0.3 });
			const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
			orbit.rotation.x = Math.PI / 2;
			scene.add(orbit);

			// Planet
			const planetSize = 0.15 + (9 - i) * 0.02;
			const planetGeometry = new THREE.SphereGeometry(planetSize, 16, 16);
			const planetMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const planet = new THREE.Mesh(planetGeometry, planetMaterial);
			planets.push({ mesh: planet, orbit: orbitRadius, speed: 0.02 - i * 0.001, angle: (i / 9) * Math.PI * 2 });
			scene.add(planet);
		});

		camera.position.z = 10;
		camera.position.y = 3;
		camera.lookAt(0, 0, 0);

		animate(() => {
			sun.rotation.y += 0.01;
			planets.forEach(p => {
				p.angle += p.speed;
				p.mesh.position.x = Math.cos(p.angle) * p.orbit;
				p.mesh.position.z = Math.sin(p.angle) * p.orbit;
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 3: DNA Helix
	// ============================================
	function setupDNAHelix(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		const helixNodes: THREE.Mesh[] = [];
		const connections: THREE.Line[] = [];

		// Create double helix
		for (let i = 0; i < 36; i++) {
			const t = i / 36;
			const y = (t - 0.5) * 10;
			const angle1 = t * Math.PI * 4;
			const angle2 = angle1 + Math.PI;

			const stepIndex = i % 9;
			const color = steps[stepIndex].color;

			// Strand 1
			const node1Geometry = new THREE.SphereGeometry(0.15, 16, 16);
			const node1Material = new THREE.MeshBasicMaterial({ color });
			const node1 = new THREE.Mesh(node1Geometry, node1Material);
			node1.position.set(Math.cos(angle1) * 1.5, y, Math.sin(angle1) * 1.5);
			scene.add(node1);
			helixNodes.push(node1);

			// Strand 2
			const node2Geometry = new THREE.SphereGeometry(0.15, 16, 16);
			const node2Material = new THREE.MeshBasicMaterial({ color });
			const node2 = new THREE.Mesh(node2Geometry, node2Material);
			node2.position.set(Math.cos(angle2) * 1.5, y, Math.sin(angle2) * 1.5);
			scene.add(node2);
			helixNodes.push(node2);

			// Connection between strands
			const points = [node1.position.clone(), node2.position.clone()];
			const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
			const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
			const line = new THREE.Line(lineGeometry, lineMaterial);
			scene.add(line);
			connections.push(line);
		}

		camera.position.z = 8;
		camera.position.y = 2;

		let time = 0;
		animate(() => {
			time += 0.01;
			scene.rotation.y = time * 0.5;

			// Pulse effect
			helixNodes.forEach((node, i) => {
				const scale = 1 + Math.sin(time * 2 + i * 0.2) * 0.2;
				node.scale.setScalar(scale);
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 4: Möbius Strip
	// ============================================
	function setupMobiusStrip(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Create Möbius strip geometry manually (ParametricGeometry removed from Three.js core)
		const segmentsU = 100;
		const segmentsV = 10;
		const vertices: number[] = [];
		const indices: number[] = [];

		for (let i = 0; i <= segmentsU; i++) {
			const u = (i / segmentsU) * Math.PI * 2;
			for (let j = 0; j <= segmentsV; j++) {
				const v = (j / segmentsV - 0.5) * 1.5;
				const x = (3 + v * Math.cos(u / 2)) * Math.cos(u);
				const y = (3 + v * Math.cos(u / 2)) * Math.sin(u);
				const z = v * Math.sin(u / 2);
				vertices.push(x, y, z);
			}
		}

		for (let i = 0; i < segmentsU; i++) {
			for (let j = 0; j < segmentsV; j++) {
				const a = i * (segmentsV + 1) + j;
				const b = a + segmentsV + 1;
				indices.push(a, b, a + 1);
				indices.push(b, b + 1, a + 1);
			}
		}

		const mobiusGeometry = new THREE.BufferGeometry();
		mobiusGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		mobiusGeometry.setIndex(indices);
		mobiusGeometry.computeVertexNormals();

		const mobiusMaterial = new THREE.MeshBasicMaterial({
			color: 0x38bdf8,
			wireframe: true,
			transparent: true,
			opacity: 0.3
		});
		const mobius = new THREE.Mesh(mobiusGeometry, mobiusMaterial);
		scene.add(mobius);

		// Add flowing particles along the strip
		const particles: { mesh: THREE.Mesh; u: number; speed: number }[] = [];
		steps.forEach((step, i) => {
			const particleGeometry = new THREE.SphereGeometry(0.2, 16, 16);
			const particleMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			particles.push({ mesh: particle, u: (i / 9) * Math.PI * 2, speed: 0.02 });
			scene.add(particle);

			// Glow
			const glowGeometry = new THREE.SphereGeometry(0.3, 16, 16);
			const glowMaterial = new THREE.MeshBasicMaterial({ color: step.color, transparent: true, opacity: 0.3 });
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			particle.add(glow);
		});

		camera.position.z = 10;
		camera.position.y = 3;

		animate(() => {
			mobius.rotation.x += 0.002;
			mobius.rotation.z += 0.001;

			particles.forEach(p => {
				p.u += p.speed;
				if (p.u > Math.PI * 2) p.u -= Math.PI * 2;

				const v = 0;
				const x = (3 + v * Math.cos(p.u / 2)) * Math.cos(p.u);
				const y = (3 + v * Math.cos(p.u / 2)) * Math.sin(p.u);
				const z = v * Math.sin(p.u / 2);

				p.mesh.position.set(x, y, z);
				p.mesh.position.applyEuler(mobius.rotation);
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 5: Particle River
	// ============================================
	function setupParticleRiver(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Create transformation gates
		const gates: THREE.Mesh[] = [];
		steps.forEach((step, i) => {
			const gateGeometry = new THREE.TorusGeometry(0.8, 0.05, 8, 32);
			const gateMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const gate = new THREE.Mesh(gateGeometry, gateMaterial);
			gate.position.x = (i - 4) * 1.8;
			gate.position.y = Math.sin(i * 0.5) * 0.5;
			gate.rotation.y = Math.PI / 2;
			gates.push(gate);
			scene.add(gate);

			// Gate glow
			const glowGeometry = new THREE.TorusGeometry(0.9, 0.1, 8, 32);
			const glowMaterial = new THREE.MeshBasicMaterial({ color: step.color, transparent: true, opacity: 0.2 });
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			glow.position.copy(gate.position);
			glow.rotation.copy(gate.rotation);
			scene.add(glow);
		});

		// Create flowing particles
		const particleCount = 100;
		const particles: { mesh: THREE.Mesh; x: number; speed: number }[] = [];

		for (let i = 0; i < particleCount; i++) {
			const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
			const stepIndex = Math.floor(Math.random() * 9);
			const particleMaterial = new THREE.MeshBasicMaterial({ color: steps[stepIndex].color });
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);

			const x = Math.random() * 20 - 10;
			particle.position.x = x;
			particle.position.y = Math.sin(x * 0.3) * 0.5 + (Math.random() - 0.5) * 0.5;
			particle.position.z = (Math.random() - 0.5) * 1;

			particles.push({ mesh: particle, x, speed: 0.03 + Math.random() * 0.02 });
			scene.add(particle);
		}

		camera.position.z = 8;
		camera.position.y = 2;
		camera.lookAt(0, 0, 0);

		animate(() => {
			gates.forEach((gate, i) => {
				gate.rotation.x += 0.02;
			});

			particles.forEach(p => {
				p.x += p.speed;
				if (p.x > 10) p.x = -10;
				p.mesh.position.x = p.x;
				p.mesh.position.y = Math.sin(p.x * 0.3) * 0.5 + Math.sin(p.x * 2) * 0.1;
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 6: Metamorphosis Journey
	// ============================================
	function setupMetamorphosis(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Create landscape path
		const pathPoints: THREE.Vector3[] = [];
		for (let i = 0; i <= 100; i++) {
			const t = i / 100;
			pathPoints.push(new THREE.Vector3(
				(t - 0.5) * 16,
				Math.sin(t * Math.PI * 2) * 1.5,
				Math.cos(t * Math.PI * 3) * 1
			));
		}
		const pathCurve = new THREE.CatmullRomCurve3(pathPoints);
		const pathGeometry = new THREE.TubeGeometry(pathCurve, 100, 0.05, 8, false);
		const pathMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 });
		const path = new THREE.Mesh(pathGeometry, pathMaterial);
		scene.add(path);

		// Create morphing entity
		const entityGeometry = new THREE.IcosahedronGeometry(0.4, 1);
		const entityMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
		const entity = new THREE.Mesh(entityGeometry, entityMaterial);
		scene.add(entity);

		// Stage markers
		steps.forEach((step, i) => {
			const t = i / 8;
			const point = pathCurve.getPoint(t);

			const markerGeometry = new THREE.OctahedronGeometry(0.2);
			const markerMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const marker = new THREE.Mesh(markerGeometry, markerMaterial);
			marker.position.copy(point);
			marker.position.y += 0.5;
			scene.add(marker);
		});

		camera.position.z = 8;
		camera.position.y = 3;
		camera.lookAt(0, 0, 0);

		let t = 0;
		animate(() => {
			t += 0.002;
			if (t > 1) t = 0;

			const point = pathCurve.getPoint(t);
			entity.position.copy(point);

			// Morph based on stage
			const stage = Math.floor(t * 9);
			entity.material.color.setHex(steps[Math.min(stage, 8)].color);
			entity.rotation.x += 0.02;
			entity.rotation.y += 0.03;

			// Scale pulse at each stage transition
			const stageProgress = (t * 9) % 1;
			const scale = 1 + Math.sin(stageProgress * Math.PI) * 0.3;
			entity.scale.setScalar(scale);
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 7: Gear Mechanism
	// ============================================
	function setupGearMechanism(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		const gears: { mesh: THREE.Group; speed: number }[] = [];

		// Create gears for each step
		steps.forEach((step, i) => {
			const gear = new THREE.Group();
			const row = Math.floor(i / 3);
			const col = i % 3;

			gear.position.x = (col - 1) * 2.5;
			gear.position.y = (row - 1) * 2.5;

			// Gear body
			const bodyGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 32);
			const bodyMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
			body.rotation.x = Math.PI / 2;
			gear.add(body);

			// Gear teeth
			const teethCount = 12;
			for (let j = 0; j < teethCount; j++) {
				const angle = (j / teethCount) * Math.PI * 2;
				const toothGeometry = new THREE.BoxGeometry(0.15, 0.3, 0.2);
				const toothMaterial = new THREE.MeshBasicMaterial({ color: step.color });
				const tooth = new THREE.Mesh(toothGeometry, toothMaterial);
				tooth.position.x = Math.cos(angle) * 0.95;
				tooth.position.y = Math.sin(angle) * 0.95;
				tooth.rotation.z = angle;
				gear.add(tooth);
			}

			// Center hole
			const holeGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16);
			const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x0f172a });
			const hole = new THREE.Mesh(holeGeometry, holeMaterial);
			hole.rotation.x = Math.PI / 2;
			gear.add(hole);

			const direction = (row + col) % 2 === 0 ? 1 : -1;
			gears.push({ mesh: gear, speed: 0.02 * direction });
			scene.add(gear);
		});

		camera.position.z = 10;

		animate(() => {
			gears.forEach(g => {
				g.mesh.rotation.z += g.speed;
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 8: Neural Pulse
	// ============================================
	function setupNeuralPulse(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Create nodes in a network pattern
		const nodes: { mesh: THREE.Mesh; pos: THREE.Vector3 }[] = [];
		const connections: { line: THREE.Line; from: number; to: number; pulse: number }[] = [];

		steps.forEach((step, i) => {
			const angle = (i / 9) * Math.PI * 2;
			const radius = 2.5 + (i % 3) * 0.5;

			const nodeGeometry = new THREE.SphereGeometry(0.25, 16, 16);
			const nodeMaterial = new THREE.MeshBasicMaterial({ color: step.color });
			const node = new THREE.Mesh(nodeGeometry, nodeMaterial);

			const pos = new THREE.Vector3(
				Math.cos(angle) * radius,
				Math.sin(angle) * radius,
				(Math.random() - 0.5) * 2
			);
			node.position.copy(pos);
			nodes.push({ mesh: node, pos });
			scene.add(node);

			// Glow
			const glowGeometry = new THREE.SphereGeometry(0.4, 16, 16);
			const glowMaterial = new THREE.MeshBasicMaterial({ color: step.color, transparent: true, opacity: 0.2 });
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			node.add(glow);
		});

		// Create connections
		for (let i = 0; i < 9; i++) {
			const next = (i + 1) % 9;
			const points = [nodes[i].pos, nodes[next].pos];
			const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
			const lineMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3 });
			const line = new THREE.Line(lineGeometry, lineMaterial);
			connections.push({ line, from: i, to: next, pulse: i * 0.3 });
			scene.add(line);

			// Cross connections
			if (i < 6) {
				const cross = (i + 3) % 9;
				const crossPoints = [nodes[i].pos, nodes[cross].pos];
				const crossGeometry = new THREE.BufferGeometry().setFromPoints(crossPoints);
				const crossMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.15 });
				const crossLine = new THREE.Line(crossGeometry, crossMaterial);
				scene.add(crossLine);
			}
		}

		// Pulse particles
		const pulses: { mesh: THREE.Mesh; from: number; to: number; t: number }[] = [];
		for (let i = 0; i < 9; i++) {
			const pulseGeometry = new THREE.SphereGeometry(0.1, 8, 8);
			const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
			const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
			pulses.push({ mesh: pulse, from: i, to: (i + 1) % 9, t: i / 9 });
			scene.add(pulse);
		}

		camera.position.z = 8;

		let time = 0;
		animate(() => {
			time += 0.01;
			scene.rotation.y = Math.sin(time * 0.2) * 0.2;

			// Animate pulses
			pulses.forEach(p => {
				p.t += 0.02;
				if (p.t > 1) {
					p.t = 0;
					p.from = p.to;
					p.to = (p.to + 1) % 9;
				}

				const fromPos = nodes[p.from].pos;
				const toPos = nodes[p.to].pos;
				p.mesh.position.lerpVectors(fromPos, toPos, p.t);
			});

			// Pulse nodes
			nodes.forEach((n, i) => {
				const scale = 1 + Math.sin(time * 3 + i) * 0.2;
				n.mesh.scale.setScalar(scale);
			});
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 9: Vortex Spiral
	// ============================================
	function setupVortexSpiral(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Create spiral particles
		const particleCount = 200;
		const particles: { mesh: THREE.Mesh; angle: number; radius: number; y: number; speed: number }[] = [];

		for (let i = 0; i < particleCount; i++) {
			const stepIndex = i % 9;
			const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
			const particleMaterial = new THREE.MeshBasicMaterial({ color: steps[stepIndex].color });
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);

			particles.push({
				mesh: particle,
				angle: Math.random() * Math.PI * 2,
				radius: 0.5 + Math.random() * 3,
				y: (Math.random() - 0.5) * 6,
				speed: 0.02 + Math.random() * 0.02
			});
			scene.add(particle);
		}

		// Center core
		const coreGeometry = new THREE.SphereGeometry(0.5, 32, 32);
		const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
		const core = new THREE.Mesh(coreGeometry, coreMaterial);
		scene.add(core);

		// Core glow
		const glowGeometry = new THREE.SphereGeometry(0.8, 32, 32);
		const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3 });
		const glow = new THREE.Mesh(glowGeometry, glowMaterial);
		scene.add(glow);

		camera.position.z = 8;
		camera.position.y = 3;
		camera.lookAt(0, 0, 0);

		let time = 0;
		animate(() => {
			time += 0.01;

			particles.forEach(p => {
				p.angle += p.speed;

				// Spiral inward then burst outward
				const cycle = (time * 0.5 + p.angle) % (Math.PI * 2);
				const radiusMod = 1 + Math.sin(cycle) * 0.5;

				p.mesh.position.x = Math.cos(p.angle) * p.radius * radiusMod;
				p.mesh.position.z = Math.sin(p.angle) * p.radius * radiusMod;
				p.mesh.position.y = p.y + Math.sin(cycle * 2) * 0.5;
			});

			// Pulse core
			const coreScale = 1 + Math.sin(time * 2) * 0.2;
			core.scale.setScalar(coreScale);
			glow.scale.setScalar(coreScale * 1.5);
		});

		return cleanup;
	}

	// ============================================
	// VISUALIZATION 10: Phoenix Rise
	// ============================================
	function setupPhoenixRise(container: HTMLElement) {
		const { scene, camera, renderer, animate, cleanup } = createScene(container);

		// Phoenix body (abstract representation)
		const phoenixGroup = new THREE.Group();

		// Core
		const coreGeometry = new THREE.IcosahedronGeometry(0.5, 1);
		const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xf97316, wireframe: true });
		const core = new THREE.Mesh(coreGeometry, coreMaterial);
		phoenixGroup.add(core);

		// Wings (particle trails)
		const wingParticles: THREE.Mesh[] = [];
		for (let side = -1; side <= 1; side += 2) {
			for (let i = 0; i < 20; i++) {
				const t = i / 20;
				const particleGeometry = new THREE.SphereGeometry(0.1 * (1 - t), 8, 8);
				const stepIndex = Math.floor(t * 9);
				const particleMaterial = new THREE.MeshBasicMaterial({
					color: steps[stepIndex].color,
					transparent: true,
					opacity: 1 - t * 0.5
				});
				const particle = new THREE.Mesh(particleGeometry, particleMaterial);
				particle.position.x = side * (0.5 + t * 2);
				particle.position.y = -t * 1.5;
				particle.position.z = Math.sin(t * Math.PI) * 0.5;
				wingParticles.push(particle);
				phoenixGroup.add(particle);
			}
		}

		// Tail
		for (let i = 0; i < 15; i++) {
			const t = i / 15;
			const tailGeometry = new THREE.SphereGeometry(0.12 * (1 - t * 0.5), 8, 8);
			const tailMaterial = new THREE.MeshBasicMaterial({
				color: steps[i % 9].color,
				transparent: true,
				opacity: 1 - t * 0.3
			});
			const tail = new THREE.Mesh(tailGeometry, tailMaterial);
			tail.position.y = -0.5 - t * 3;
			tail.position.x = Math.sin(t * Math.PI * 2) * 0.3;
			phoenixGroup.add(tail);
		}

		scene.add(phoenixGroup);

		// Ash particles at bottom
		const ashParticles: { mesh: THREE.Mesh; baseY: number }[] = [];
		for (let i = 0; i < 50; i++) {
			const ashGeometry = new THREE.SphereGeometry(0.05, 4, 4);
			const ashMaterial = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
			const ash = new THREE.Mesh(ashGeometry, ashMaterial);
			ash.position.x = (Math.random() - 0.5) * 4;
			ash.position.z = (Math.random() - 0.5) * 4;
			ash.position.y = -4 + Math.random() * 0.5;
			ashParticles.push({ mesh: ash, baseY: ash.position.y });
			scene.add(ash);
		}

		camera.position.z = 8;
		camera.position.y = 1;

		let time = 0;
		animate(() => {
			time += 0.01;

			// Phoenix rises and falls in a cycle
			const cycle = time % (Math.PI * 2);
			phoenixGroup.position.y = Math.sin(cycle) * 2;
			phoenixGroup.rotation.y = time * 0.5;

			// Wing flap
			wingParticles.forEach((p, i) => {
				const flapOffset = Math.sin(time * 5 + i * 0.2) * 0.2;
				p.position.z = Math.sin((i / 20) * Math.PI) * 0.5 + flapOffset;
			});

			// Core pulse based on position (brightest at top)
			const brightness = 0.5 + (phoenixGroup.position.y + 2) / 4;
			core.scale.setScalar(0.8 + brightness * 0.4);

			// Ash rises when phoenix is low
			const ashRise = Math.max(0, -phoenixGroup.position.y) * 0.3;
			ashParticles.forEach((a, i) => {
				a.mesh.position.y = a.baseY + ashRise + Math.sin(time * 2 + i) * 0.1;
			});
		});

		return cleanup;
	}

	// ============================================
	// HELPER: Create base Three.js scene
	// ============================================
	function createScene(container: HTMLElement) {
		const width = container.clientWidth;
		const height = 400;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0f172a);

		const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(width, height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		let animationId: number;
		let animateCallback: () => void;

		function animate(callback: () => void) {
			animateCallback = callback;
			function loop() {
				animationId = requestAnimationFrame(loop);
				callback();
				renderer.render(scene, camera);
			}
			loop();
		}

		function cleanup() {
			cancelAnimationFrame(animationId);
			renderer.dispose();
			if (container.contains(renderer.domElement)) {
				container.removeChild(renderer.domElement);
			}
		}

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			const newWidth = container.clientWidth;
			camera.aspect = newWidth / height;
			camera.updateProjectionMatrix();
			renderer.setSize(newWidth, height);
		});
		resizeObserver.observe(container);

		return { scene, camera, renderer, animate, cleanup };
	}
</script>

<svelte:head>
	<title>The Agentic Flywheel - JAT Visualizations</title>
</svelte:head>

<div class="min-h-screen bg-[var(--bg-base)]">
	<Nav />

	<!-- Hero -->
	<section class="pt-32 pb-16 px-6">
		<div class="max-w-4xl mx-auto text-center">
			<h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
				The Agentic <span class="text-[var(--color-primary)]">Flywheel</span>
			</h1>
			<p class="text-xl text-gray-400 mb-8">
				10 ways to visualize perpetual motion development
			</p>
			<p class="text-gray-500 max-w-2xl mx-auto">
				Agents ship, suggest, repeat. These Three.js visualizations explore different metaphors
				for the continuous cycle of AI-powered development.
			</p>
		</div>
	</section>

	<!-- Steps Reference -->
	<section class="pb-12 px-6">
		<div class="max-w-4xl mx-auto">
			<div class="flex flex-wrap justify-center gap-2">
				{#each steps as step}
					<div
						class="px-3 py-1 rounded-full text-xs font-mono"
						style="background-color: #{step.color.toString(16).padStart(6, '0')}20; color: #{step.color.toString(16).padStart(6, '0')}"
					>
						{step.num}. {step.title}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Visualizations Grid -->
	<section class="pb-24 px-6">
		<div class="max-w-6xl mx-auto space-y-16">
			{#each visualizations as viz, i}
				<div class="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden">
					<!-- Header -->
					<div class="p-6 border-b border-gray-800">
						<h2 class="text-2xl font-bold text-white mb-2">{viz.title}</h2>
						<p class="text-gray-400">{viz.desc}</p>
					</div>

					<!-- Canvas Container -->
					<div
						bind:this={canvasContainers[i]}
						class="w-full h-[400px] relative"
					>
						<!-- Three.js canvas will be inserted here -->
					</div>

					<!-- Concept Notes -->
					<div class="p-4 bg-gray-900/80 border-t border-gray-800">
						<div class="flex items-center gap-2 text-sm text-gray-500">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<span>
								{#if i === 0}
									Mechanical energy storage—momentum builds with each completed task
								{:else if i === 1}
									Gravitational orbits—each step has its own velocity and distance from "shipping"
								{:else if i === 2}
									Biological evolution—code DNA replicates and improves continuously
								{:else if i === 3}
									Mathematical infinity—no start, no end, just continuous flow
								{:else if i === 4}
									Natural transformation—ideas flow like water through stages
								{:else if i === 5}
									Journey of change—the work transforms as it progresses through stages
								{:else if i === 6}
									Industrial precision—each gear drives the next, nothing stops
								{:else if i === 7}
									Cognitive processing—synapses fire, information flows, work emerges
								{:else if i === 8}
									Cosmic energy—compression creates release, cycles repeat
								{:else}
									Mythological rebirth—from ashes to flight, death to renewal
								{/if}
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Pick Your Favorite CTA -->
	<section class="py-16 px-6 bg-gradient-to-b from-transparent via-[var(--color-primary)]/5 to-transparent">
		<div class="max-w-2xl mx-auto text-center">
			<h2 class="text-2xl font-bold text-white mb-4">Which resonates?</h2>
			<p class="text-gray-400 mb-8">
				Each visualization represents the same concept: agents that complete work,
				suggest new tasks, and keep the development cycle spinning forever.
			</p>
			<div class="flex flex-wrap justify-center gap-4">
				<a href="/v2" class="px-6 py-3 bg-[var(--color-primary)] text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">
					See the Flywheel in Action
				</a>
				<a href="/" class="px-6 py-3 border border-gray-700 text-gray-300 rounded-lg font-semibold hover:border-gray-500 transition-colors">
					Back to Home
				</a>
			</div>
		</div>
	</section>

	<Footer />
</div>

<style>
	:global(canvas) {
		display: block;
	}
</style>
