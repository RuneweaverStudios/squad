<script lang="ts">
	/**
	 * TAM9: Holographic Book
	 * 3D rotating manual with holographic projection effects
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let isBookOpen = $state(false);
	let currentPage = $state(1);
	const totalPages = 4;

	function playHoloSound() {
		if (!audioContext) return;

		// Holographic hum
		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(440, audioContext.currentTime);

		// Add harmonics
		const osc2 = audioContext.createOscillator();
		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(880, audioContext.currentTime);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(1000, audioContext.currentTime);

		gain.gain.setValueAtTime(0.02, audioContext.currentTime);

		osc.connect(filter);
		osc2.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc2.start();
	}

	function playPageSound() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc.type = 'triangle';
		osc.frequency.setValueAtTime(800, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.2);

		gain.gain.setValueAtTime(0.05, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);

		osc.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.2);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playHoloSound();
		}
	}

	function toggleBook() {
		isBookOpen = !isBookOpen;
		playPageSound();
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			playPageSound();
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			playPageSound();
		}
	}

	onMount(() => {
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);
		container.appendChild(renderer.domElement);

		// Create holographic book
		const bookGroup = new THREE.Group();

		// Book cover (front)
		const coverGeometry = new THREE.BoxGeometry(4, 5, 0.2);
		const coverMaterial = new THREE.MeshPhongMaterial({
			color: 0x1a1a2e,
			transparent: true,
			opacity: 0.9,
			side: THREE.DoubleSide
		});

		const frontCover = new THREE.Mesh(coverGeometry, coverMaterial);
		frontCover.position.x = -2;
		bookGroup.add(frontCover);

		const backCover = new THREE.Mesh(coverGeometry, coverMaterial.clone());
		backCover.position.x = 2;
		bookGroup.add(backCover);

		// Book spine
		const spineGeometry = new THREE.BoxGeometry(0.5, 5, 0.4);
		const spine = new THREE.Mesh(spineGeometry, coverMaterial.clone());
		spine.position.set(0, 0, -0.2);
		bookGroup.add(spine);

		// Pages (simple rectangles)
		const pageGeometry = new THREE.PlaneGeometry(3.5, 4.5);
		const pageMaterial = new THREE.MeshPhongMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.1,
			side: THREE.DoubleSide
		});

		for (let i = 0; i < 5; i++) {
			const page = new THREE.Mesh(pageGeometry, pageMaterial.clone());
			page.position.set(0, 0, 0.1 + i * 0.02);
			bookGroup.add(page);
		}

		// Holographic text particles
		const textParticles = new THREE.Group();
		const particleCount = 500;
		const particleGeometry = new THREE.BufferGeometry();
		const particlePositions = new Float32Array(particleCount * 3);
		const particleColors = new Float32Array(particleCount * 3);

		for (let i = 0; i < particleCount; i++) {
			// Position particles in book shape
			particlePositions[i * 3] = (Math.random() - 0.5) * 3;
			particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 4;
			particlePositions[i * 3 + 2] = Math.random() * 2;

			// Holographic colors (cyan to purple)
			const hue = 0.5 + Math.random() * 0.3;
			const color = new THREE.Color().setHSL(hue, 1, 0.7);
			particleColors[i * 3] = color.r;
			particleColors[i * 3 + 1] = color.g;
			particleColors[i * 3 + 2] = color.b;
		}

		particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
		particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

		const particleMaterial = new THREE.PointsMaterial({
			size: 0.03,
			vertexColors: true,
			transparent: true,
			opacity: 0.8,
			blending: THREE.AdditiveBlending
		});

		const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
		textParticles.add(particleSystem);
		bookGroup.add(textParticles);

		// Holographic rings
		const ringGeometry = new THREE.TorusGeometry(3, 0.02, 16, 100);
		const ringMaterial = new THREE.MeshBasicMaterial({
			color: 0x00ffff,
			transparent: true,
			opacity: 0.3
		});

		for (let i = 0; i < 3; i++) {
			const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
			ring.rotation.x = Math.PI / 2;
			ring.position.y = -3 + i * 0.5;
			ring.scale.setScalar(1 + i * 0.2);
			ring.userData = { baseY: ring.position.y, speed: 0.5 + i * 0.2 };
			bookGroup.add(ring);
		}

		scene.add(bookGroup);

		// Holographic projection lines
		const lineCount = 50;
		const lineGeometry = new THREE.BufferGeometry();
		const linePositions = new Float32Array(lineCount * 6);

		for (let i = 0; i < lineCount; i++) {
			const angle = (i / lineCount) * Math.PI * 2;
			const radius = 5;
			linePositions[i * 6] = Math.cos(angle) * radius;
			linePositions[i * 6 + 1] = -5;
			linePositions[i * 6 + 2] = Math.sin(angle) * radius;
			linePositions[i * 6 + 3] = Math.cos(angle) * 0.5;
			linePositions[i * 6 + 4] = 0;
			linePositions[i * 6 + 5] = Math.sin(angle) * 0.5;
		}

		lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
		const lineMaterial = new THREE.LineBasicMaterial({
			color: 0x00ffff,
			transparent: true,
			opacity: 0.1
		});
		const projectionLines = new THREE.LineSegments(lineGeometry, lineMaterial);
		scene.add(projectionLines);

		// Platform
		const platformGeometry = new THREE.CylinderGeometry(5, 6, 0.2, 32);
		const platformMaterial = new THREE.MeshPhongMaterial({
			color: 0x1a1a2e,
			transparent: true,
			opacity: 0.8
		});
		const platform = new THREE.Mesh(platformGeometry, platformMaterial);
		platform.position.y = -5;
		scene.add(platform);

		// Platform glow
		const glowGeometry = new THREE.RingGeometry(4.5, 5.5, 64);
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: 0x00ffff,
			transparent: true,
			opacity: 0.3,
			side: THREE.DoubleSide
		});
		const platformGlow = new THREE.Mesh(glowGeometry, glowMaterial);
		platformGlow.rotation.x = -Math.PI / 2;
		platformGlow.position.y = -4.85;
		scene.add(platformGlow);

		// Lighting
		const ambientLight = new THREE.AmbientLight(0x404080, 0.5);
		scene.add(ambientLight);

		const holoLight = new THREE.PointLight(0x00ffff, 1.5, 20);
		holoLight.position.set(0, 5, 5);
		scene.add(holoLight);

		const accentLight = new THREE.PointLight(0x8b5cf6, 1, 15);
		accentLight.position.set(-5, 0, 5);
		scene.add(accentLight);

		camera.position.set(0, 2, 10);
		camera.lookAt(0, 0, 0);

		let time = 0;
		let targetRotationY = 0;
		let mouseX = 0;

		function animate() {
			time += 0.016;

			// Rotate book slowly + mouse influence
			targetRotationY = mouseX * 0.5;
			bookGroup.rotation.y += (targetRotationY - bookGroup.rotation.y) * 0.05;
			bookGroup.rotation.y += 0.002; // Base rotation

			// Float book
			bookGroup.position.y = Math.sin(time) * 0.3;

			// Animate rings
			bookGroup.children.forEach((child) => {
				if (child instanceof THREE.Mesh && child.geometry.type === 'TorusGeometry') {
					const { baseY, speed } = child.userData;
					if (baseY !== undefined) {
						child.position.y = baseY + Math.sin(time * speed) * 0.2;
						child.rotation.z = time * speed * 0.5;
					}
				}
			});

			// Animate particles
			const positions = particleGeometry.attributes.position.array as Float32Array;
			for (let i = 0; i < particleCount; i++) {
				positions[i * 3 + 2] = Math.sin(time * 2 + i * 0.1) * 0.5 + 1;
			}
			particleGeometry.attributes.position.needsUpdate = true;

			// Platform glow pulse
			glowMaterial.opacity = 0.2 + Math.sin(time * 2) * 0.1;

			// Holo light flicker
			holoLight.intensity = 1.5 + Math.sin(time * 10) * 0.1;

			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		}

		animate();

		function handleMouseMove(event: MouseEvent) {
			mouseX = (event.clientX / window.innerWidth) * 2 - 1;
		}

		function handleResize() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('resize', handleResize);
			renderer.dispose();
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM9: Holographic Book | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam9">
	<!-- Background grid -->
	<div class="holo-grid"></div>

	<div class="canvas-container" bind:this={container}></div>

	<!-- Controls -->
	<div class="controls">
		<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
			{isAudioOn ? '◈ HOLO-AUDIO ON' : '◇ HOLO-AUDIO OFF'}
		</button>
	</div>

	<!-- Page controls -->
	<div class="page-controls">
		<button onclick={prevPage} disabled={currentPage === 1}>◄ PREV</button>
		<span class="page-indicator">PAGE {currentPage}/{totalPages}</span>
		<button onclick={nextPage} disabled={currentPage === totalPages}>NEXT ►</button>
	</div>

	<!-- Content overlay -->
	<div class="content">
		<header>
			<div class="holo-badge">
				<span class="badge-inner">HOLOGRAPHIC EDITION</span>
				<div class="badge-glow"></div>
			</div>
			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p class="tagline">Projected from the future</p>
		</header>

		<section class="quote">
			<blockquote>
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features">
			<div class="feature-list">
				<div class="feature-item">
					<span class="feature-bullet">▸</span>
					<span>Task Architecture</span>
				</div>
				<div class="feature-item">
					<span class="feature-bullet">▸</span>
					<span>Agent Coordination</span>
				</div>
				<div class="feature-item">
					<span class="feature-bullet">▸</span>
					<span>Swarm Intelligence</span>
				</div>
				<div class="feature-item">
					<span class="feature-bullet">▸</span>
					<span>Workflow Automation</span>
				</div>
			</div>
		</section>

		<section class="install">
			<div class="terminal">
				<div class="terminal-header">
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="dot"></span>
				</div>
				<code>$ git clone https://github.com/jomarchy/squad.git</code>
			</div>
		</section>
	</div>
</div>

<style>
	.tam9 {
		min-height: 100vh;
		background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%);
		color: white;
		font-family: ui-monospace, monospace;
		overflow: hidden;
	}

	/* Holographic grid background */
	.holo-grid {
		position: fixed;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px),
			linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px);
		background-size: 50px 50px;
		animation: grid-scroll 20s linear infinite;
	}

	@keyframes grid-scroll {
		0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
		100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
	}

	.canvas-container {
		position: fixed;
		inset: 0;
		z-index: 1;
	}

	/* Controls */
	.controls {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
	}

	.audio-btn {
		padding: 0.5rem 1rem;
		background: rgba(0, 255, 255, 0.1);
		border: 1px solid rgba(0, 255, 255, 0.3);
		border-radius: 4px;
		color: #00ffff;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-btn.active {
		background: rgba(0, 255, 255, 0.2);
		box-shadow: 0 0 20px rgba(0, 255, 255, 0.4);
	}

	/* Page controls */
	.page-controls {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.page-controls button {
		padding: 0.5rem 1rem;
		background: rgba(0, 255, 255, 0.1);
		border: 1px solid rgba(0, 255, 255, 0.3);
		border-radius: 4px;
		color: #00ffff;
		font-family: inherit;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.3s;
	}

	.page-controls button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.page-controls button:not(:disabled):hover {
		background: rgba(0, 255, 255, 0.2);
	}

	.page-indicator {
		font-size: 0.7rem;
		color: rgba(0, 255, 255, 0.7);
		letter-spacing: 0.1em;
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
		padding: 6rem 0 2rem;
	}

	.holo-badge {
		position: relative;
		display: inline-block;
		margin-bottom: 2rem;
	}

	.badge-inner {
		position: relative;
		z-index: 1;
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: transparent;
		border: 1px solid rgba(0, 255, 255, 0.5);
		font-size: 0.65rem;
		letter-spacing: 0.3em;
		color: #00ffff;
	}

	.badge-glow {
		position: absolute;
		inset: -5px;
		background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.3), transparent);
		animation: badge-scan 2s linear infinite;
	}

	@keyframes badge-scan {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(0, 255, 255, 0.4);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		background: linear-gradient(180deg, #00ffff 0%, #8b5cf6 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(0, 255, 255, 0.5));
		animation: holo-flicker 4s ease-in-out infinite;
	}

	@keyframes holo-flicker {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.95; }
		52% { opacity: 1; }
		54% { opacity: 0.9; }
		56% { opacity: 1; }
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.3em;
		color: rgba(0, 255, 255, 0.6);
	}

	.tagline {
		margin-top: 1.5rem;
		font-size: 0.9rem;
		color: rgba(0, 255, 255, 0.4);
	}

	/* Quote */
	.quote {
		text-align: center;
		padding: 3rem 2rem;
		max-width: 600px;
	}

	blockquote {
		font-size: 1.1rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}

	cite {
		display: block;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: #00ffff;
		font-style: normal;
	}

	/* Features */
	.features {
		padding: 2rem;
	}

	.feature-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		background: rgba(0, 255, 255, 0.05);
		border-left: 2px solid rgba(0, 255, 255, 0.5);
		font-size: 0.85rem;
	}

	.feature-bullet {
		color: #00ffff;
	}

	/* Install */
	.install {
		padding: 3rem 2rem;
	}

	.terminal {
		background: rgba(10, 10, 30, 0.9);
		border: 1px solid rgba(0, 255, 255, 0.3);
		border-radius: 8px;
		overflow: hidden;
	}

	.terminal-header {
		padding: 0.5rem 1rem;
		background: rgba(0, 255, 255, 0.1);
		display: flex;
		gap: 0.5rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(0, 255, 255, 0.5);
	}

	.terminal code {
		display: block;
		padding: 1.5rem;
		font-size: 0.85rem;
		color: #00ffff;
	}
</style>
