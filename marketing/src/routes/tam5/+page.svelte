<script lang="ts">
	/**
	 * TAM5: Warp Speed
	 * Three.js starfield warp drive effect with whoosh sounds
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let warpSpeed = $state(1);
	let isWarping = $state(false);
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);

	function playWarpSound() {
		if (!audioContext) return;

		// Whoosh sound
		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(100, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(2000, audioContext.currentTime + 0.5);
		osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 2);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(500, audioContext.currentTime);
		filter.frequency.exponentialRampToValueAtTime(5000, audioContext.currentTime + 0.3);
		filter.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 2);

		gain.gain.setValueAtTime(0, audioContext.currentTime);
		gain.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
		gain.gain.linearRampToValueAtTime(0.05, audioContext.currentTime + 1);
		gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2);

		osc.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 2);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
		}
	}

	function toggleWarp() {
		isWarping = !isWarping;
		warpSpeed = isWarping ? 10 : 1;
		if (isWarping) playWarpSound();
	}

	onMount(() => {
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
		const renderer = new THREE.WebGLRenderer({ antialias: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		// Stars
		const starCount = 5000;
		const starGeometry = new THREE.BufferGeometry();
		const starPositions = new Float32Array(starCount * 3);
		const starColors = new Float32Array(starCount * 3);

		for (let i = 0; i < starCount; i++) {
			const i3 = i * 3;
			// Distribute stars in a cylinder around the camera
			const theta = Math.random() * Math.PI * 2;
			const radius = 50 + Math.random() * 200;

			starPositions[i3] = Math.cos(theta) * radius;
			starPositions[i3 + 1] = Math.sin(theta) * radius;
			starPositions[i3 + 2] = Math.random() * 2000 - 1000;

			// Star colors - whites, blues, purples
			const colorChoice = Math.random();
			if (colorChoice < 0.6) {
				// White
				starColors[i3] = 1;
				starColors[i3 + 1] = 1;
				starColors[i3 + 2] = 1;
			} else if (colorChoice < 0.8) {
				// Blue
				starColors[i3] = 0.5;
				starColors[i3 + 1] = 0.7;
				starColors[i3 + 2] = 1;
			} else {
				// Purple
				starColors[i3] = 0.8;
				starColors[i3 + 1] = 0.5;
				starColors[i3 + 2] = 1;
			}
		}

		starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
		starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

		const starMaterial = new THREE.PointsMaterial({
			size: 2,
			vertexColors: true,
			transparent: true,
			opacity: 0.8,
			blending: THREE.AdditiveBlending
		});

		const stars = new THREE.Points(starGeometry, starMaterial);
		scene.add(stars);

		// Warp trails (lines)
		const trailCount = 500;
		const trailGeometry = new THREE.BufferGeometry();
		const trailPositions = new Float32Array(trailCount * 6); // 2 points per line

		for (let i = 0; i < trailCount; i++) {
			const i6 = i * 6;
			const theta = Math.random() * Math.PI * 2;
			const radius = 20 + Math.random() * 150;

			const x = Math.cos(theta) * radius;
			const y = Math.sin(theta) * radius;
			const z = Math.random() * 2000 - 1000;

			// Start point
			trailPositions[i6] = x;
			trailPositions[i6 + 1] = y;
			trailPositions[i6 + 2] = z;

			// End point (stretched in z)
			trailPositions[i6 + 3] = x;
			trailPositions[i6 + 4] = y;
			trailPositions[i6 + 5] = z - 50;
		}

		trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));

		const trailMaterial = new THREE.LineBasicMaterial({
			color: 0x8b5cf6,
			transparent: true,
			opacity: 0
		});

		const trails = new THREE.LineSegments(trailGeometry, trailMaterial);
		scene.add(trails);

		// Nebula clouds
		const nebulaGeometry = new THREE.PlaneGeometry(500, 500);
		const nebulaMaterial = new THREE.MeshBasicMaterial({
			color: 0x8b5cf6,
			transparent: true,
			opacity: 0.02,
			side: THREE.DoubleSide
		});

		for (let i = 0; i < 5; i++) {
			const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial.clone());
			nebula.position.z = -500 - i * 200;
			nebula.rotation.z = Math.random() * Math.PI;
			scene.add(nebula);
		}

		camera.position.z = 5;

		// Animation
		let targetWarpSpeed = 1;
		let currentWarpSpeed = 1;

		function animate() {
			// Smooth warp speed transition
			targetWarpSpeed = warpSpeed;
			currentWarpSpeed += (targetWarpSpeed - currentWarpSpeed) * 0.05;

			// Move stars
			const positions = starGeometry.attributes.position.array as Float32Array;
			for (let i = 0; i < starCount; i++) {
				const i3 = i * 3;
				positions[i3 + 2] += currentWarpSpeed * 2;

				if (positions[i3 + 2] > 1000) {
					positions[i3 + 2] = -1000;
				}
			}
			starGeometry.attributes.position.needsUpdate = true;

			// Update star size based on warp
			starMaterial.size = 2 + (currentWarpSpeed - 1) * 0.5;

			// Update trails
			const trailPositions = trailGeometry.attributes.position.array as Float32Array;
			for (let i = 0; i < trailCount; i++) {
				const i6 = i * 6;
				trailPositions[i6 + 2] += currentWarpSpeed * 2;
				trailPositions[i6 + 5] += currentWarpSpeed * 2;

				if (trailPositions[i6 + 2] > 1000) {
					trailPositions[i6 + 2] = -1000;
					trailPositions[i6 + 5] = -1050;
				}
			}
			trailGeometry.attributes.position.needsUpdate = true;

			// Show/hide trails based on warp
			trailMaterial.opacity = Math.max(0, (currentWarpSpeed - 2) * 0.1);

			// Camera shake at high warp
			if (currentWarpSpeed > 5) {
				camera.position.x = (Math.random() - 0.5) * 0.1 * (currentWarpSpeed - 5);
				camera.position.y = (Math.random() - 0.5) * 0.1 * (currentWarpSpeed - 5);
			} else {
				camera.position.x = 0;
				camera.position.y = 0;
			}

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
	<title>TAM5: Warp Speed | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam5">
	<div class="canvas-container" bind:this={container}></div>

	<!-- Controls -->
	<div class="controls">
		<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
			{isAudioOn ? '◉ AUDIO' : '○ AUDIO'}
		</button>
		<button class="warp-btn" onclick={toggleWarp} class:warping={isWarping}>
			{isWarping ? '◉ WARP ENGAGED' : '○ ENGAGE WARP'}
		</button>
	</div>

	<!-- Speed indicator -->
	<div class="speed-indicator">
		<span class="speed-label">WARP FACTOR</span>
		<span class="speed-value">{warpSpeed.toFixed(1)}</span>
	</div>

	<!-- Content -->
	<div class="content" class:warping={isWarping}>
		<header>
			<span class="badge">WARP SPEED EDITION</span>
			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p>Engage lightspeed development</p>
		</header>

		<section class="quote">
			<blockquote>
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features">
			<div class="feature-row">
				<div class="feature">★ Task Architecture</div>
				<div class="feature">★ Agent Coordination</div>
			</div>
			<div class="feature-row">
				<div class="feature">★ Swarm Intelligence</div>
				<div class="feature">★ Workflow Automation</div>
			</div>
		</section>

		<section class="install">
			<code>git clone https://github.com/jomarchy/squad.git</code>
		</section>
	</div>
</div>

<style>
	.tam5 {
		min-height: 100vh;
		background: #000;
		color: white;
		font-family: ui-monospace, monospace;
		overflow: hidden;
	}

	.canvas-container {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	/* Controls */
	.controls {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		display: flex;
		gap: 0.5rem;
	}

	.audio-btn, .warp-btn {
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

	.audio-btn.active, .warp-btn.warping {
		background: rgba(139, 92, 246, 0.3);
		border-color: rgba(139, 92, 246, 0.8);
		box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
	}

	.warp-btn.warping {
		animation: pulse 0.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.5); }
		50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.8); }
	}

	/* Speed indicator */
	.speed-indicator {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.speed-label {
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.5);
	}

	.speed-value {
		font-size: 2rem;
		font-weight: 100;
		color: #8b5cf6;
		text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
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
		transition: opacity 0.5s;
	}

	.content.warping {
		opacity: 0.3;
	}

	header {
		text-align: center;
		padding: 8rem 0 4rem;
	}

	.badge {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
		border: 1px solid rgba(139, 92, 246, 0.4);
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
		background: linear-gradient(180deg, #8b5cf6, #06b6d4);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(139, 92, 246, 0.5));
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
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.feature-row {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.feature {
		padding: 1rem 1.5rem;
		background: rgba(139, 92, 246, 0.1);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 4px;
		font-size: 0.85rem;
	}

	/* Install */
	.install {
		padding: 4rem 2rem;
	}

	.install code {
		display: block;
		padding: 1.5rem 2rem;
		background: rgba(10, 10, 30, 0.8);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 8px;
		font-size: 0.85rem;
		color: #06b6d4;
	}
</style>
