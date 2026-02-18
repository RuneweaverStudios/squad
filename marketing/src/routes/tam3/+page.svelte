<script lang="ts">
	/**
	 * TAM3: Morphing Geometry
	 * Three.js shapes that morph between different sacred geometries
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let currentShape = $state('icosahedron');
	let morphProgress = $state(0);
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);

	const shapes = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];

	function playMorphSound() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(220, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.3);

		gain.gain.setValueAtTime(0.1, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

		osc.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.5);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;

			// Play ambient pad
			const frequencies = [110, 165, 220, 330];
			frequencies.forEach((freq, i) => {
				const osc = audioContext!.createOscillator();
				const gain = audioContext!.createGain();
				osc.type = i % 2 === 0 ? 'sine' : 'triangle';
				osc.frequency.setValueAtTime(freq, audioContext!.currentTime);
				gain.gain.setValueAtTime(0.02, audioContext!.currentTime);
				osc.connect(gain);
				gain.connect(audioContext!.destination);
				osc.start();
			});
		}
	}

	onMount(() => {
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		// Create geometries
		const geometries: { [key: string]: THREE.BufferGeometry } = {
			icosahedron: new THREE.IcosahedronGeometry(2, 1),
			octahedron: new THREE.OctahedronGeometry(2, 1),
			dodecahedron: new THREE.DodecahedronGeometry(2, 0),
			tetrahedron: new THREE.TetrahedronGeometry(2, 1)
		};

		// Wireframe material
		const wireframeMaterial = new THREE.LineBasicMaterial({
			color: 0x8b5cf6,
			transparent: true,
			opacity: 0.6
		});

		// Points material
		const pointsMaterial = new THREE.PointsMaterial({
			color: 0x06b6d4,
			size: 0.05,
			transparent: true,
			opacity: 0.8
		});

		// Create mesh groups for each geometry
		const meshGroups: { [key: string]: THREE.Group } = {};

		Object.entries(geometries).forEach(([name, geometry]) => {
			const group = new THREE.Group();

			// Wireframe
			const wireframe = new THREE.LineSegments(
				new THREE.WireframeGeometry(geometry),
				wireframeMaterial.clone()
			);
			group.add(wireframe);

			// Points at vertices
			const points = new THREE.Points(geometry, pointsMaterial.clone());
			group.add(points);

			// Outer glow sphere
			const glowGeometry = new THREE.SphereGeometry(2.5, 32, 32);
			const glowMaterial = new THREE.MeshBasicMaterial({
				color: 0x8b5cf6,
				transparent: true,
				opacity: 0.05,
				side: THREE.BackSide
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			group.add(glow);

			group.visible = name === 'icosahedron';
			meshGroups[name] = group;
			scene.add(group);
		});

		// Particle field
		const particleCount = 2000;
		const particlePositions = new Float32Array(particleCount * 3);
		const particleColors = new Float32Array(particleCount * 3);

		for (let i = 0; i < particleCount; i++) {
			const i3 = i * 3;
			const radius = 3 + Math.random() * 10;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);

			particlePositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
			particlePositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
			particlePositions[i3 + 2] = radius * Math.cos(phi);

			const color = new THREE.Color();
			color.setHSL(0.75 + Math.random() * 0.1, 0.8, 0.6);
			particleColors[i3] = color.r;
			particleColors[i3 + 1] = color.g;
			particleColors[i3 + 2] = color.b;
		}

		const particleGeometry = new THREE.BufferGeometry();
		particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
		particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

		const particleMaterial = new THREE.PointsMaterial({
			size: 0.02,
			vertexColors: true,
			transparent: true,
			opacity: 0.6,
			blending: THREE.AdditiveBlending
		});

		const particles = new THREE.Points(particleGeometry, particleMaterial);
		scene.add(particles);

		camera.position.z = 6;

		// Mouse interaction
		let mouseX = 0;
		let mouseY = 0;

		window.addEventListener('mousemove', (e) => {
			mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
			mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
		});

		// Auto morph timer
		let morphTimer = 0;
		const morphInterval = 4; // seconds between morphs
		let currentIndex = 0;

		const clock = new THREE.Clock();

		function animate() {
			const elapsedTime = clock.getElapsedTime();
			const deltaTime = clock.getDelta();

			// Auto morph
			morphTimer += deltaTime;
			if (morphTimer >= morphInterval) {
				morphTimer = 0;
				const prevIndex = currentIndex;
				currentIndex = (currentIndex + 1) % shapes.length;

				// Transition
				const prevShape = shapes[prevIndex];
				const nextShape = shapes[currentIndex];

				meshGroups[prevShape].visible = false;
				meshGroups[nextShape].visible = true;

				currentShape = nextShape;
				playMorphSound();
			}

			morphProgress = morphTimer / morphInterval;

			// Rotate current shape
			const activeGroup = meshGroups[currentShape];
			if (activeGroup) {
				activeGroup.rotation.x = elapsedTime * 0.2 + mouseY * 0.5;
				activeGroup.rotation.y = elapsedTime * 0.3 + mouseX * 0.5;

				// Pulse scale
				const pulse = 1 + Math.sin(elapsedTime * 2) * 0.05;
				activeGroup.scale.setScalar(pulse);
			}

			// Rotate particles
			particles.rotation.y = elapsedTime * 0.05;
			particles.rotation.x = elapsedTime * 0.02;

			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		}

		animate();

		function handleResize() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		}

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			renderer.dispose();
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM3: Morphing Geometry | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam3">
	<div class="canvas-container" bind:this={container}></div>

	<!-- Audio toggle -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '◉ SOUND ON' : '○ ENABLE SOUND'}
	</button>

	<!-- Shape indicator -->
	<div class="shape-indicator">
		<div class="shape-name">{currentShape.toUpperCase()}</div>
		<div class="morph-bar">
			<div class="morph-progress" style="width: {morphProgress * 100}%"></div>
		</div>
		<div class="shape-dots">
			{#each shapes as shape, i}
				<span class="dot" class:active={shape === currentShape}></span>
			{/each}
		</div>
	</div>

	<!-- Content -->
	<div class="content">
		<header>
			<span class="badge">MORPHING GEOMETRY</span>
			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p>Sacred shapes. Infinite transformations.</p>
		</header>

		<section class="quote">
			<blockquote>
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features">
			<h2>◇ DIMENSIONS</h2>
			<div class="feature-grid">
				<div class="feature-item">
					<span class="feature-icon">△</span>
					<span>Task Architecture</span>
				</div>
				<div class="feature-item">
					<span class="feature-icon">◇</span>
					<span>Agent Coordination</span>
				</div>
				<div class="feature-item">
					<span class="feature-icon">⬡</span>
					<span>Swarm Intelligence</span>
				</div>
				<div class="feature-item">
					<span class="feature-icon">⬢</span>
					<span>Workflow Automation</span>
				</div>
			</div>
		</section>

		<section class="install">
			<div class="terminal">
				<code>git clone https://github.com/jomarchy/squad.git</code>
			</div>
		</section>
	</div>
</div>

<style>
	.tam3 {
		min-height: 100vh;
		background: radial-gradient(ellipse at center, #0f0f2a 0%, #050510 100%);
		color: white;
		font-family: ui-monospace, monospace;
	}

	.canvas-container {
		position: fixed;
		inset: 0;
		z-index: 1;
	}

	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: rgba(139, 92, 246, 0.1);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 4px;
		color: #a78bfa;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-btn.active {
		background: rgba(139, 92, 246, 0.3);
		border-color: rgba(139, 92, 246, 0.6);
	}

	/* Shape indicator */
	.shape-indicator {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.shape-name {
		font-size: 0.7rem;
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.6);
	}

	.morph-bar {
		width: 200px;
		height: 2px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 1px;
		overflow: hidden;
	}

	.morph-progress {
		height: 100%;
		background: linear-gradient(90deg, #8b5cf6, #06b6d4);
		transition: width 0.1s linear;
	}

	.shape-dots {
		display: flex;
		gap: 0.5rem;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		transition: all 0.3s;
	}

	.dot.active {
		background: #8b5cf6;
		box-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
	}

	/* Content */
	.content {
		position: relative;
		z-index: 10;
		padding: 2rem;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		pointer-events: none;
	}

	.content > * {
		pointer-events: auto;
	}

	header {
		text-align: center;
		padding: 6rem 0 4rem;
	}

	.badge {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 100px;
		font-size: 0.65rem;
		letter-spacing: 0.3em;
		color: #a78bfa;
		margin-bottom: 2rem;
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(255, 255, 255, 0.4);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		background: linear-gradient(180deg, #8b5cf6 0%, #06b6d4 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(139, 92, 246, 0.4));
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.7);
	}

	header p {
		margin-top: 1.5rem;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Quote */
	.quote {
		text-align: center;
		padding: 4rem 2rem;
		max-width: 600px;
	}

	blockquote {
		font-size: 1.2rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.7);
		font-style: italic;
	}

	cite {
		display: block;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: #8b5cf6;
		font-style: normal;
	}

	/* Features */
	.features {
		padding: 4rem 2rem;
		text-align: center;
	}

	.features h2 {
		font-size: 0.8rem;
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 2rem;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		max-width: 800px;
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		background: rgba(139, 92, 246, 0.05);
		border: 1px solid rgba(139, 92, 246, 0.2);
		border-radius: 8px;
		transition: all 0.3s;
	}

	.feature-item:hover {
		background: rgba(139, 92, 246, 0.1);
		border-color: rgba(139, 92, 246, 0.4);
		transform: translateY(-2px);
	}

	.feature-icon {
		font-size: 1.5rem;
		color: #8b5cf6;
	}

	/* Install */
	.install {
		padding: 4rem 2rem;
	}

	.terminal {
		padding: 1.5rem 2rem;
		background: rgba(10, 10, 30, 0.8);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 8px;
	}

	.terminal code {
		color: #06b6d4;
		font-size: 0.85rem;
	}
</style>
