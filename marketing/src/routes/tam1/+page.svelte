<script lang="ts">
	/**
	 * TAM1: Galaxy Nebula
	 * Three.js particle galaxy with ambient drone sounds
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let audioContext: AudioContext | null = null;
	let isAudioPlaying = $state(false);
	let scrollY = $state(0);

	// Content sections
	const sections = [
		{ id: 'hero', title: 'THE ALIEN MANUAL', subtitle: 'Galaxy Edition' },
		{ id: 'transmission', quote: 'Clearly some powerful alien tool was handed around except it comes with no manual...', author: '@karpathy' },
		{ id: 'features', items: ['Task Architecture', 'Agent Coordination', 'Swarm Intelligence', 'Workflow Automation'] },
		{ id: 'install', command: 'git clone https://github.com/jomarchy/squad.git && cd squad && ./install.sh' }
	];

	function startAmbientSound() {
		if (audioContext) return;

		audioContext = new AudioContext();

		// Create multiple oscillators for rich ambient drone
		const oscillators: OscillatorNode[] = [];
		const gains: GainNode[] = [];

		const frequencies = [55, 82.5, 110, 165, 220]; // A1, E2, A2, E3, A3

		frequencies.forEach((freq, i) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();

			osc.type = i % 2 === 0 ? 'sine' : 'triangle';
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime);

			// Add slight detuning for richness
			osc.detune.setValueAtTime(Math.random() * 10 - 5, audioContext!.currentTime);

			gain.gain.setValueAtTime(0, audioContext!.currentTime);
			gain.gain.linearRampToValueAtTime(0.03 / (i + 1), audioContext!.currentTime + 2);

			osc.connect(gain);
			gain.connect(audioContext!.destination);
			osc.start();

			oscillators.push(osc);
			gains.push(gain);
		});

		// Add LFO for movement
		const lfo = audioContext.createOscillator();
		const lfoGain = audioContext.createGain();
		lfo.frequency.setValueAtTime(0.1, audioContext.currentTime);
		lfoGain.gain.setValueAtTime(5, audioContext.currentTime);
		lfo.connect(lfoGain);

		oscillators.forEach(osc => {
			lfoGain.connect(osc.frequency);
		});
		lfo.start();

		isAudioPlaying = true;
	}

	onMount(() => {
		// Three.js Galaxy Setup
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		// Galaxy parameters
		const parameters = {
			count: 50000,
			size: 0.01,
			radius: 5,
			branches: 5,
			spin: 1,
			randomness: 0.2,
			randomnessPower: 3,
			insideColor: '#8b5cf6',
			outsideColor: '#06b6d4'
		};

		// Create galaxy
		const positions = new Float32Array(parameters.count * 3);
		const colors = new Float32Array(parameters.count * 3);

		const colorInside = new THREE.Color(parameters.insideColor);
		const colorOutside = new THREE.Color(parameters.outsideColor);

		for (let i = 0; i < parameters.count; i++) {
			const i3 = i * 3;
			const radius = Math.random() * parameters.radius;
			const spinAngle = radius * parameters.spin;
			const branchAngle = (i % parameters.branches) / parameters.branches * Math.PI * 2;

			const randomX = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;
			const randomY = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;
			const randomZ = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;

			positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
			positions[i3 + 1] = randomY;
			positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

			// Colors
			const mixedColor = colorInside.clone();
			mixedColor.lerp(colorOutside, radius / parameters.radius);

			colors[i3] = mixedColor.r;
			colors[i3 + 1] = mixedColor.g;
			colors[i3 + 2] = mixedColor.b;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			size: parameters.size,
			sizeAttenuation: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			vertexColors: true
		});

		const galaxy = new THREE.Points(geometry, material);
		scene.add(galaxy);

		// Add nebula clouds
		const nebulaGeometry = new THREE.SphereGeometry(8, 32, 32);
		const nebulaMaterial = new THREE.MeshBasicMaterial({
			color: 0x8b5cf6,
			transparent: true,
			opacity: 0.03,
			side: THREE.BackSide
		});
		const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
		scene.add(nebula);

		camera.position.z = 4;
		camera.position.y = 2;

		// Mouse interaction
		let mouseX = 0;
		let mouseY = 0;

		window.addEventListener('mousemove', (e) => {
			mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
			mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
		});

		// Animation
		const clock = new THREE.Clock();

		function animate() {
			const elapsedTime = clock.getElapsedTime();

			// Rotate galaxy
			galaxy.rotation.y = elapsedTime * 0.05;

			// Mouse parallax
			camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
			camera.position.y += (-mouseY * 0.5 + 2 - camera.position.y) * 0.05;
			camera.lookAt(0, 0, 0);

			// Scroll-based zoom
			const scrollProgress = scrollY / (document.body.scrollHeight - window.innerHeight);
			camera.position.z = 4 - scrollProgress * 2;

			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		}
		animate();

		// Handle resize
		function handleResize() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		}
		window.addEventListener('resize', handleResize);

		// Scroll handler
		function handleScroll() {
			scrollY = window.scrollY;
		}
		window.addEventListener('scroll', handleScroll);

		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleScroll);
			renderer.dispose();
			if (audioContext) {
				audioContext.close();
			}
		};
	});
</script>

<svelte:head>
	<title>TAM1: Galaxy Nebula | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam1">
	<!-- Three.js container -->
	<div class="canvas-container" bind:this={container}></div>

	<!-- Audio toggle -->
	<button class="audio-toggle" onclick={startAmbientSound} class:playing={isAudioPlaying}>
		{isAudioPlaying ? '♫ AMBIENT ON' : '♪ ENABLE SOUND'}
	</button>

	<!-- Content sections -->
	<div class="content">
		<!-- Hero -->
		<section class="hero">
			<div class="hero-content">
				<span class="edition-badge">GALAXY EDITION</span>
				<h1 class="title">
					<span class="title-the">THE</span>
					<span class="title-alien">ALIEN</span>
					<span class="title-manual">MANUAL</span>
				</h1>
				<p class="subtitle">Navigate the cosmos of AI-powered development</p>
				<div class="cta-group">
					<a href="#transmission" class="cta-primary">
						<span class="cta-icon">✦</span>
						Begin Journey
					</a>
				</div>
			</div>
			<div class="scroll-indicator">
				<span>SCROLL TO EXPLORE</span>
				<div class="scroll-line"></div>
			</div>
		</section>

		<!-- Transmission -->
		<section id="transmission" class="transmission">
			<div class="transmission-frame">
				<div class="frame-corner tl"></div>
				<div class="frame-corner tr"></div>
				<div class="frame-corner bl"></div>
				<div class="frame-corner br"></div>
				<blockquote>
					"Clearly some powerful alien tool was handed around except it comes with no manual and everyone has to figure out how to hold it and operate it..."
				</blockquote>
				<cite>— @karpathy</cite>
			</div>
			<p class="response">This is the manual. <span class="glow">Welcome to the galaxy.</span></p>
		</section>

		<!-- Features -->
		<section id="features" class="features">
			<h2 class="section-title">
				<span class="star">✦</span>
				Core Systems
			</h2>
			<div class="feature-grid">
				{#each sections[2].items as feature, i}
					<div class="feature-card" style="--delay: {i * 0.1}s">
						<div class="card-glow"></div>
						<span class="feature-number">{String(i + 1).padStart(2, '0')}</span>
						<h3>{feature}</h3>
					</div>
				{/each}
			</div>
		</section>

		<!-- Install -->
		<section id="install" class="install">
			<h2 class="section-title">
				<span class="star">✦</span>
				Initialize
			</h2>
			<div class="terminal">
				<div class="terminal-header">
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="dot"></span>
				</div>
				<code>{sections[3].command}</code>
			</div>
		</section>
	</div>
</div>

<style>
	.tam1 {
		min-height: 100vh;
		background: #050510;
		color: white;
		font-family: ui-monospace, monospace;
	}

	.canvas-container {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	.canvas-container :global(canvas) {
		display: block;
	}

	/* Audio toggle */
	.audio-toggle {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: rgba(139, 92, 246, 0.2);
		border: 1px solid rgba(139, 92, 246, 0.5);
		border-radius: 4px;
		color: #a78bfa;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-toggle:hover {
		background: rgba(139, 92, 246, 0.3);
	}

	.audio-toggle.playing {
		background: rgba(139, 92, 246, 0.4);
		box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
	}

	/* Content */
	.content {
		position: relative;
		z-index: 10;
	}

	/* Hero */
	.hero {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		text-align: center;
	}

	.hero-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.edition-badge {
		padding: 0.5rem 1.5rem;
		background: linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
		border: 1px solid rgba(139, 92, 246, 0.4);
		border-radius: 100px;
		font-size: 0.7rem;
		letter-spacing: 0.3em;
		color: #a78bfa;
	}

	.title {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.title-the {
		font-size: clamp(1rem, 3vw, 2rem);
		color: rgba(255, 255, 255, 0.5);
		letter-spacing: 0.5em;
	}

	.title-alien {
		font-size: clamp(4rem, 15vw, 12rem);
		font-weight: 900;
		background: linear-gradient(180deg, #8b5cf6 0%, #06b6d4 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 40px rgba(139, 92, 246, 0.5));
	}

	.title-manual {
		font-size: clamp(1.5rem, 5vw, 3.5rem);
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.8);
	}

	.subtitle {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.5);
		max-width: 400px;
	}

	.cta-group {
		margin-top: 1rem;
	}

	.cta-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 2rem;
		background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(6, 182, 212, 0.3));
		border: 1px solid rgba(139, 92, 246, 0.5);
		border-radius: 4px;
		color: white;
		text-decoration: none;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		transition: all 0.3s;
	}

	.cta-primary:hover {
		background: linear-gradient(135deg, rgba(139, 92, 246, 0.5), rgba(6, 182, 212, 0.5));
		box-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
		transform: translateY(-2px);
	}

	.cta-icon {
		font-size: 1.2rem;
	}

	.scroll-indicator {
		position: absolute;
		bottom: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		animation: float 2s ease-in-out infinite;
	}

	.scroll-indicator span {
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.4);
	}

	.scroll-line {
		width: 1px;
		height: 40px;
		background: linear-gradient(180deg, rgba(139, 92, 246, 0.8), transparent);
	}

	@keyframes float {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-10px); }
	}

	/* Transmission */
	.transmission {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.transmission-frame {
		position: relative;
		max-width: 700px;
		padding: 3rem;
		background: rgba(10, 10, 30, 0.8);
		border: 1px solid rgba(139, 92, 246, 0.3);
	}

	.frame-corner {
		position: absolute;
		width: 20px;
		height: 20px;
		border-color: #8b5cf6;
		border-style: solid;
	}

	.frame-corner.tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
	.frame-corner.tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
	.frame-corner.bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
	.frame-corner.br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

	blockquote {
		font-size: 1.3rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		margin: 0 0 1.5rem;
	}

	cite {
		font-size: 0.9rem;
		color: #8b5cf6;
		font-style: normal;
	}

	.response {
		margin-top: 3rem;
		font-size: 1.5rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.glow {
		color: #06b6d4;
		text-shadow: 0 0 20px rgba(6, 182, 212, 0.5);
	}

	/* Features */
	.features {
		min-height: 100vh;
		padding: 6rem 2rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		font-size: 1.5rem;
		font-weight: 400;
		letter-spacing: 0.2em;
		margin-bottom: 4rem;
		text-align: center;
	}

	.star {
		color: #8b5cf6;
		text-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 2rem;
		max-width: 1000px;
		margin: 0 auto;
	}

	.feature-card {
		position: relative;
		padding: 2rem;
		background: rgba(10, 10, 30, 0.6);
		border: 1px solid rgba(139, 92, 246, 0.2);
		border-radius: 8px;
		animation: fadeUp 0.6s ease forwards;
		animation-delay: var(--delay);
		opacity: 0;
	}

	@keyframes fadeUp {
		to {
			opacity: 1;
			transform: translateY(0);
		}
		from {
			transform: translateY(20px);
		}
	}

	.card-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.1), transparent 70%);
		border-radius: 8px;
		opacity: 0;
		transition: opacity 0.3s;
	}

	.feature-card:hover .card-glow {
		opacity: 1;
	}

	.feature-number {
		display: block;
		font-size: 2rem;
		font-weight: 100;
		color: rgba(139, 92, 246, 0.5);
		margin-bottom: 1rem;
	}

	.feature-card h3 {
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: 0.1em;
	}

	/* Install */
	.install {
		min-height: 60vh;
		padding: 6rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.terminal {
		max-width: 700px;
		width: 100%;
		background: rgba(10, 10, 30, 0.9);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 8px;
		overflow: hidden;
	}

	.terminal-header {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(139, 92, 246, 0.1);
		border-bottom: 1px solid rgba(139, 92, 246, 0.2);
	}

	.terminal-header .dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(139, 92, 246, 0.5);
	}

	.terminal code {
		display: block;
		padding: 1.5rem;
		font-size: 0.85rem;
		color: #06b6d4;
		word-break: break-all;
	}
</style>
