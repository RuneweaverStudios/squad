<script lang="ts">
	/**
	 * TAM7: Floating Portals
	 * Floating islands with swirling portal effects and ethereal sounds
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let portalEnergy = $state(0);

	function playPortalHum() {
		if (!audioContext) return;

		// Ethereal pad sound
		const osc1 = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc1.type = 'sine';
		osc2.type = 'triangle';
		osc1.frequency.setValueAtTime(110, audioContext.currentTime);
		osc2.frequency.setValueAtTime(165, audioContext.currentTime);

		// Slow modulation
		const lfo = audioContext.createOscillator();
		const lfoGain = audioContext.createGain();
		lfo.frequency.setValueAtTime(0.2, audioContext.currentTime);
		lfoGain.gain.setValueAtTime(5, audioContext.currentTime);
		lfo.connect(lfoGain);
		lfoGain.connect(osc1.frequency);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(800, audioContext.currentTime);
		filter.Q.setValueAtTime(2, audioContext.currentTime);

		gain.gain.setValueAtTime(0.04, audioContext.currentTime);

		osc1.connect(filter);
		osc2.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc1.start();
		osc2.start();
		lfo.start();
	}

	function playWhoosh() {
		if (!audioContext) return;

		const noise = audioContext.createOscillator();
		const filter = audioContext.createBiquadFilter();
		const gain = audioContext.createGain();

		noise.type = 'sawtooth';
		noise.frequency.setValueAtTime(100, audioContext.currentTime);
		noise.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);
		noise.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.6);

		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(500, audioContext.currentTime);
		filter.frequency.exponentialRampToValueAtTime(2000, audioContext.currentTime + 0.2);
		filter.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.6);
		filter.Q.setValueAtTime(5, audioContext.currentTime);

		gain.gain.setValueAtTime(0.05, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);

		noise.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		noise.start();
		noise.stop(audioContext.currentTime + 0.6);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playPortalHum();
		}
	}

	onMount(() => {
		const scene = new THREE.Scene();
		scene.fog = new THREE.FogExp2(0x0a0a1a, 0.02);

		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ antialias: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x0a0a1a);
		container.appendChild(renderer.domElement);

		// Create floating islands
		const islands: THREE.Mesh[] = [];
		const islandGeometry = new THREE.CylinderGeometry(2, 3, 1, 8);

		for (let i = 0; i < 8; i++) {
			const islandMaterial = new THREE.MeshPhongMaterial({
				color: new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.3, 0.2),
				flatShading: true
			});

			const island = new THREE.Mesh(islandGeometry, islandMaterial);
			const angle = (i / 8) * Math.PI * 2;
			const radius = 15 + Math.random() * 10;

			island.position.set(
				Math.cos(angle) * radius,
				Math.sin(i * 0.5) * 5 - 5,
				Math.sin(angle) * radius
			);
			island.scale.setScalar(0.5 + Math.random() * 1.5);
			island.userData = {
				baseY: island.position.y,
				floatSpeed: 0.5 + Math.random() * 0.5,
				floatOffset: Math.random() * Math.PI * 2
			};

			scene.add(island);
			islands.push(island);
		}

		// Create central portal
		const portalGroup = new THREE.Group();

		// Portal ring
		const torusGeometry = new THREE.TorusGeometry(5, 0.3, 16, 100);
		const torusMaterial = new THREE.MeshPhongMaterial({
			color: 0x8b5cf6,
			emissive: 0x8b5cf6,
			emissiveIntensity: 0.5
		});
		const torus = new THREE.Mesh(torusGeometry, torusMaterial);
		portalGroup.add(torus);

		// Portal inner glow
		const portalGeometry = new THREE.CircleGeometry(4.7, 64);
		const portalMaterial = new THREE.ShaderMaterial({
			uniforms: {
				time: { value: 0 },
				color1: { value: new THREE.Color(0x8b5cf6) },
				color2: { value: new THREE.Color(0x06b6d4) }
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform float time;
				uniform vec3 color1;
				uniform vec3 color2;
				varying vec2 vUv;

				void main() {
					vec2 center = vUv - 0.5;
					float dist = length(center);
					float angle = atan(center.y, center.x);

					float swirl = sin(angle * 5.0 + dist * 10.0 - time * 2.0) * 0.5 + 0.5;
					float pulse = sin(time * 3.0) * 0.1 + 0.9;

					vec3 color = mix(color1, color2, swirl);
					float alpha = (1.0 - dist * 2.0) * pulse;
					alpha = max(0.0, alpha);

					gl_FragColor = vec4(color, alpha * 0.8);
				}
			`,
			transparent: true,
			side: THREE.DoubleSide
		});
		const portalDisc = new THREE.Mesh(portalGeometry, portalMaterial);
		portalGroup.add(portalDisc);

		// Portal particles
		const particleCount = 2000;
		const particleGeometry = new THREE.BufferGeometry();
		const particlePositions = new Float32Array(particleCount * 3);
		const particleSpeeds = new Float32Array(particleCount);

		for (let i = 0; i < particleCount; i++) {
			const angle = Math.random() * Math.PI * 2;
			const radius = 1 + Math.random() * 4;
			particlePositions[i * 3] = Math.cos(angle) * radius;
			particlePositions[i * 3 + 1] = Math.sin(angle) * radius;
			particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 2;
			particleSpeeds[i] = 0.5 + Math.random() * 1.5;
		}

		particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

		const particleMaterial = new THREE.PointsMaterial({
			color: 0x06b6d4,
			size: 0.05,
			transparent: true,
			opacity: 0.8,
			blending: THREE.AdditiveBlending
		});

		const particles = new THREE.Points(particleGeometry, particleMaterial);
		portalGroup.add(particles);

		scene.add(portalGroup);

		// Ambient particles (floating dust)
		const dustCount = 1000;
		const dustGeometry = new THREE.BufferGeometry();
		const dustPositions = new Float32Array(dustCount * 3);

		for (let i = 0; i < dustCount; i++) {
			dustPositions[i * 3] = (Math.random() - 0.5) * 100;
			dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 50;
			dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
		}

		dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
		const dustMaterial = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.1,
			transparent: true,
			opacity: 0.3
		});
		const dust = new THREE.Points(dustGeometry, dustMaterial);
		scene.add(dust);

		// Lighting
		const ambientLight = new THREE.AmbientLight(0x404080, 0.5);
		scene.add(ambientLight);

		const portalLight = new THREE.PointLight(0x8b5cf6, 2, 50);
		portalLight.position.set(0, 0, 5);
		scene.add(portalLight);

		const accentLight = new THREE.PointLight(0x06b6d4, 1, 30);
		accentLight.position.set(0, 10, -10);
		scene.add(accentLight);

		camera.position.set(0, 5, 25);
		camera.lookAt(0, 0, 0);

		let time = 0;
		let mouseX = 0;
		let mouseY = 0;

		function animate() {
			time += 0.016;

			// Update portal shader
			portalMaterial.uniforms.time.value = time;

			// Rotate portal ring
			torus.rotation.z = time * 0.5;
			torus.rotation.x = Math.sin(time * 0.3) * 0.1;

			// Update portal particles (spiral inward)
			const positions = particleGeometry.attributes.position.array as Float32Array;
			for (let i = 0; i < particleCount; i++) {
				const i3 = i * 3;
				const x = positions[i3];
				const y = positions[i3 + 1];
				const angle = Math.atan2(y, x);
				const radius = Math.sqrt(x * x + y * y);

				const newAngle = angle + particleSpeeds[i] * 0.02;
				const newRadius = radius - 0.02;

				if (newRadius < 0.5) {
					const resetAngle = Math.random() * Math.PI * 2;
					const resetRadius = 3 + Math.random() * 2;
					positions[i3] = Math.cos(resetAngle) * resetRadius;
					positions[i3 + 1] = Math.sin(resetAngle) * resetRadius;
				} else {
					positions[i3] = Math.cos(newAngle) * newRadius;
					positions[i3 + 1] = Math.sin(newAngle) * newRadius;
				}

				positions[i3 + 2] = Math.sin(time * 2 + i * 0.1) * 0.5;
			}
			particleGeometry.attributes.position.needsUpdate = true;

			// Float islands
			islands.forEach((island) => {
				const { baseY, floatSpeed, floatOffset } = island.userData;
				island.position.y = baseY + Math.sin(time * floatSpeed + floatOffset) * 0.5;
				island.rotation.y += 0.001;
			});

			// Float dust
			const dustPositions = dustGeometry.attributes.position.array as Float32Array;
			for (let i = 0; i < dustCount; i++) {
				dustPositions[i * 3 + 1] += 0.01;
				if (dustPositions[i * 3 + 1] > 25) {
					dustPositions[i * 3 + 1] = -25;
				}
			}
			dustGeometry.attributes.position.needsUpdate = true;

			// Camera movement
			camera.position.x += (mouseX * 10 - camera.position.x) * 0.02;
			camera.position.y += (5 + mouseY * 5 - camera.position.y) * 0.02;
			camera.lookAt(0, 0, 0);

			// Portal energy
			portalEnergy = (Math.sin(time * 2) * 0.5 + 0.5) * 100;

			// Portal light pulse
			portalLight.intensity = 2 + Math.sin(time * 3) * 0.5;

			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		}

		animate();

		function handleMouseMove(event: MouseEvent) {
			mouseX = (event.clientX / window.innerWidth) * 2 - 1;
			mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
		}

		function handleClick() {
			playWhoosh();
		}

		function handleResize() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('click', handleClick);
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('click', handleClick);
			window.removeEventListener('resize', handleResize);
			renderer.dispose();
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM7: Floating Portals | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam7">
	<div class="canvas-container" bind:this={container}></div>

	<!-- Controls -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '♫ SOUND ON' : '♪ SOUND OFF'}
	</button>

	<!-- Portal energy meter -->
	<div class="energy-meter">
		<span class="energy-label">PORTAL ENERGY</span>
		<div class="energy-bar">
			<div class="energy-fill" style="width: {portalEnergy}%"></div>
		</div>
		<span class="energy-value">{portalEnergy.toFixed(0)}%</span>
	</div>

	<!-- Content -->
	<div class="content">
		<header>
			<span class="badge">DIMENSIONAL GATEWAY</span>
			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p class="tagline">Step through the portal</p>
		</header>

		<section class="quote">
			<blockquote>
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features">
			<div class="feature">
				<span class="icon">◈</span>
				<span>Task Architecture</span>
			</div>
			<div class="feature">
				<span class="icon">◈</span>
				<span>Agent Coordination</span>
			</div>
			<div class="feature">
				<span class="icon">◈</span>
				<span>Swarm Intelligence</span>
			</div>
			<div class="feature">
				<span class="icon">◈</span>
				<span>Workflow Automation</span>
			</div>
		</section>

		<section class="install">
			<code>git clone https://github.com/jomarchy/squad.git</code>
		</section>
	</div>
</div>

<style>
	.tam7 {
		min-height: 100vh;
		background: #0a0a1a;
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
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-btn.active {
		background: rgba(139, 92, 246, 0.3);
		box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
	}

	/* Energy meter */
	.energy-meter {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.energy-label {
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.5);
	}

	.energy-bar {
		width: 150px;
		height: 6px;
		background: rgba(139, 92, 246, 0.2);
		border-radius: 3px;
		overflow: hidden;
	}

	.energy-fill {
		height: 100%;
		background: linear-gradient(90deg, #8b5cf6, #06b6d4);
		transition: width 0.1s;
		box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
	}

	.energy-value {
		font-size: 0.8rem;
		color: #8b5cf6;
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
		background: linear-gradient(180deg, #8b5cf6 0%, #06b6d4 100%);
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

	.tagline {
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
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		padding: 2rem;
	}

	.feature {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		background: rgba(139, 92, 246, 0.1);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 8px;
		font-size: 0.85rem;
	}

	.icon {
		color: #06b6d4;
		font-size: 1.2rem;
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
