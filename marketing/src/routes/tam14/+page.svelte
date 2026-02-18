<script lang="ts">
	/**
	 * TAM14: Protoss Temple
	 * Psionic energy, glowing glyphs, crystalline architecture
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let glyphCanvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let psionicLevel = $state(0);

	// Protoss-style glyph paths (simplified geometric patterns)
	const glyphPaths = [
		// Diamond with inner cross
		'M50,10 L90,50 L50,90 L10,50 Z M50,25 L50,75 M25,50 L75,50',
		// Triangular rune
		'M50,5 L95,85 L5,85 Z M50,25 L75,70 L25,70 Z',
		// Circular sigil
		'M50,10 A40,40 0 1,1 50,90 A40,40 0 1,1 50,10 M50,25 L65,50 L50,75 L35,50 Z',
		// Psionic blade pattern
		'M50,5 L60,40 L95,50 L60,60 L50,95 L40,60 L5,50 L40,40 Z',
		// Ancient symbol
		'M30,20 L70,20 L70,40 L50,50 L70,60 L70,80 L30,80 L30,60 L50,50 L30,40 Z',
	];

	function playPsionicPulse() {
		if (!audioContext) return;

		// Ethereal psionic pulse
		const osc1 = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const osc3 = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();
		const reverb = audioContext.createConvolver();

		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(220, audioContext.currentTime);
		osc1.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.3);
		osc1.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.6);

		osc2.type = 'triangle';
		osc2.frequency.setValueAtTime(330, audioContext.currentTime);
		osc2.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.3);

		osc3.type = 'sine';
		osc3.frequency.setValueAtTime(550, audioContext.currentTime);

		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(800, audioContext.currentTime);
		filter.frequency.exponentialRampToValueAtTime(2000, audioContext.currentTime + 0.2);
		filter.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.6);
		filter.Q.setValueAtTime(5, audioContext.currentTime);

		gain.gain.setValueAtTime(0.08, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);

		osc1.connect(filter);
		osc2.connect(filter);
		osc3.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc1.start();
		osc2.start();
		osc3.start();
		osc1.stop(audioContext.currentTime + 0.8);
		osc2.stop(audioContext.currentTime + 0.8);
		osc3.stop(audioContext.currentTime + 0.8);
	}

	function playAmbientChoir() {
		if (!audioContext) return;

		// Ethereal choir pad
		const voices = [220, 277, 330, 440];
		voices.forEach((freq, i) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();
			const filter = audioContext!.createBiquadFilter();

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime);

			// Slow vibrato
			const lfo = audioContext!.createOscillator();
			const lfoGain = audioContext!.createGain();
			lfo.frequency.setValueAtTime(4 + i * 0.5, audioContext!.currentTime);
			lfoGain.gain.setValueAtTime(3, audioContext!.currentTime);
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);

			filter.type = 'lowpass';
			filter.frequency.setValueAtTime(1000, audioContext!.currentTime);

			gain.gain.setValueAtTime(0.015, audioContext!.currentTime);

			osc.connect(filter);
			filter.connect(gain);
			gain.connect(audioContext!.destination);

			osc.start();
			lfo.start();
		});
	}

	function playGlyphActivation() {
		if (!audioContext) return;

		// Sharp crystalline activation sound
		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc.type = 'square';
		osc.frequency.setValueAtTime(1200, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(2400, audioContext.currentTime + 0.05);
		osc.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2);

		gain.gain.setValueAtTime(0.06, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);

		osc.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.3);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playAmbientChoir();
		}
	}

	onMount(() => {
		// Three.js scene
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000510, 1);
		container.appendChild(renderer.domElement);

		// Crystalline pylons
		const pylonGroup = new THREE.Group();

		const pylonGeometry = new THREE.ConeGeometry(2, 15, 6);
		const pylonMaterial = new THREE.MeshPhongMaterial({
			color: 0x1a3a5a,
			emissive: 0x0a1a2a,
			transparent: true,
			opacity: 0.9,
			flatShading: true
		});

		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const pylon = new THREE.Mesh(pylonGeometry, pylonMaterial.clone());
			pylon.position.set(Math.cos(angle) * 20, -5, Math.sin(angle) * 20);
			pylon.rotation.x = Math.PI;

			// Add glow to each pylon
			const glowGeometry = new THREE.SphereGeometry(1.5, 16, 16);
			const glowMaterial = new THREE.MeshBasicMaterial({
				color: 0x00aaff,
				transparent: true,
				opacity: 0.6
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			glow.position.y = 8;
			pylon.add(glow);

			pylonGroup.add(pylon);
		}

		scene.add(pylonGroup);

		// Central nexus crystal
		const nexusGeometry = new THREE.OctahedronGeometry(5, 0);
		const nexusMaterial = new THREE.MeshPhongMaterial({
			color: 0x4488ff,
			emissive: 0x2244aa,
			emissiveIntensity: 0.5,
			transparent: true,
			opacity: 0.8,
			flatShading: true
		});
		const nexus = new THREE.Mesh(nexusGeometry, nexusMaterial);
		nexus.position.y = 5;
		scene.add(nexus);

		// Energy beams from pylons to nexus
		const beamMaterial = new THREE.LineBasicMaterial({
			color: 0x00ffff,
			transparent: true,
			opacity: 0.5
		});

		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const beamGeometry = new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(Math.cos(angle) * 20, 3, Math.sin(angle) * 20),
				new THREE.Vector3(0, 5, 0)
			]);
			const beam = new THREE.Line(beamGeometry, beamMaterial);
			scene.add(beam);
		}

		// Floating glyph particles
		const glyphParticles: { mesh: THREE.Mesh; baseY: number; speed: number; rotSpeed: number }[] = [];

		for (let i = 0; i < 20; i++) {
			const glyphGeometry = new THREE.PlaneGeometry(2, 2);
			const glyphMaterial = new THREE.MeshBasicMaterial({
				color: 0x00ffff,
				transparent: true,
				opacity: 0.4,
				side: THREE.DoubleSide
			});
			const glyph = new THREE.Mesh(glyphGeometry, glyphMaterial);

			const angle = Math.random() * Math.PI * 2;
			const radius = 10 + Math.random() * 15;
			glyph.position.set(
				Math.cos(angle) * radius,
				Math.random() * 20 - 5,
				Math.sin(angle) * radius
			);
			glyph.lookAt(0, glyph.position.y, 0);

			scene.add(glyph);
			glyphParticles.push({
				mesh: glyph,
				baseY: glyph.position.y,
				speed: 0.5 + Math.random() * 0.5,
				rotSpeed: (Math.random() - 0.5) * 0.02
			});
		}

		// Ground plane with glyph pattern
		const groundGeometry = new THREE.CircleGeometry(30, 64);
		const groundMaterial = new THREE.MeshBasicMaterial({
			color: 0x0a1520,
			transparent: true,
			opacity: 0.8
		});
		const ground = new THREE.Mesh(groundGeometry, groundMaterial);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -8;
		scene.add(ground);

		// Lighting
		const ambientLight = new THREE.AmbientLight(0x102040, 0.5);
		scene.add(ambientLight);

		const nexusLight = new THREE.PointLight(0x4488ff, 2, 50);
		nexusLight.position.set(0, 5, 0);
		scene.add(nexusLight);

		const accentLight = new THREE.PointLight(0x00ffff, 1, 30);
		accentLight.position.set(10, 10, 10);
		scene.add(accentLight);

		camera.position.set(0, 10, 30);
		camera.lookAt(0, 0, 0);

		let time = 0;
		let mouseX = 0;
		let mouseY = 0;
		let pulseTimer = 0;

		function animate() {
			time += 0.016;
			pulseTimer += 0.016;

			// Rotate nexus
			nexus.rotation.y += 0.005;
			nexus.rotation.x = Math.sin(time * 0.5) * 0.1;

			// Pulse nexus
			const pulse = Math.sin(time * 2) * 0.2 + 1;
			nexus.scale.setScalar(pulse);
			nexusMaterial.emissiveIntensity = 0.3 + Math.sin(time * 3) * 0.2;

			// Update psionic level
			psionicLevel = (Math.sin(time) * 0.5 + 0.5) * 100;

			// Animate glyphs
			glyphParticles.forEach((g) => {
				g.mesh.position.y = g.baseY + Math.sin(time * g.speed) * 2;
				g.mesh.rotation.z += g.rotSpeed;
				const mat = g.mesh.material as THREE.MeshBasicMaterial;
				mat.opacity = 0.3 + Math.sin(time * 2 + g.baseY) * 0.2;
			});

			// Rotate pylon group slowly
			pylonGroup.rotation.y += 0.001;

			// Beam pulsing
			beamMaterial.opacity = 0.3 + Math.sin(time * 4) * 0.2;

			// Play pulse sound periodically
			if (pulseTimer > 3 && audioContext) {
				playPsionicPulse();
				pulseTimer = 0;
			}

			// Camera follows mouse
			camera.position.x += (mouseX * 15 - camera.position.x) * 0.02;
			camera.position.y += (10 + mouseY * 5 - camera.position.y) * 0.02;
			camera.lookAt(0, 2, 0);

			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		}

		animate();

		// 2D glyph overlay canvas
		const ctx = glyphCanvas.getContext('2d')!;
		glyphCanvas.width = window.innerWidth;
		glyphCanvas.height = window.innerHeight;

		let glyphTime = 0;

		function drawGlyphs() {
			glyphTime += 0.02;

			ctx.clearRect(0, 0, glyphCanvas.width, glyphCanvas.height);

			// Draw decorative glyphs in corners
			const cornerGlyphs = [
				{ x: 80, y: 80 },
				{ x: glyphCanvas.width - 80, y: 80 },
				{ x: 80, y: glyphCanvas.height - 80 },
				{ x: glyphCanvas.width - 80, y: glyphCanvas.height - 80 }
			];

			cornerGlyphs.forEach((pos, i) => {
				ctx.save();
				ctx.translate(pos.x, pos.y);
				ctx.rotate(glyphTime * 0.5 + i * Math.PI / 2);

				const glow = Math.sin(glyphTime * 2 + i) * 0.3 + 0.7;

				// Outer ring
				ctx.strokeStyle = `rgba(0, 200, 255, ${glow * 0.5})`;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(0, 0, 40, 0, Math.PI * 2);
				ctx.stroke();

				// Inner pattern
				ctx.strokeStyle = `rgba(100, 200, 255, ${glow})`;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				for (let j = 0; j < 6; j++) {
					const angle = (j / 6) * Math.PI * 2;
					ctx.moveTo(0, 0);
					ctx.lineTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
				}
				ctx.stroke();

				// Central diamond
				ctx.fillStyle = `rgba(0, 255, 255, ${glow * 0.8})`;
				ctx.beginPath();
				ctx.moveTo(0, -15);
				ctx.lineTo(15, 0);
				ctx.lineTo(0, 15);
				ctx.lineTo(-15, 0);
				ctx.closePath();
				ctx.fill();

				ctx.restore();
			});

			// Floating runes across screen
			for (let i = 0; i < 5; i++) {
				const x = (glyphTime * 50 + i * 300) % (glyphCanvas.width + 200) - 100;
				const y = glyphCanvas.height / 2 + Math.sin(glyphTime + i * 2) * 100;
				const alpha = Math.sin(glyphTime * 2 + i) * 0.3 + 0.3;

				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(Math.sin(glyphTime + i) * 0.2);

				ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
				ctx.lineWidth = 1;

				// Draw rune pattern
				ctx.beginPath();
				ctx.moveTo(0, -20);
				ctx.lineTo(15, -10);
				ctx.lineTo(15, 10);
				ctx.lineTo(0, 20);
				ctx.lineTo(-15, 10);
				ctx.lineTo(-15, -10);
				ctx.closePath();
				ctx.stroke();

				ctx.beginPath();
				ctx.moveTo(0, -10);
				ctx.lineTo(0, 10);
				ctx.moveTo(-8, 0);
				ctx.lineTo(8, 0);
				ctx.stroke();

				ctx.restore();
			}

			requestAnimationFrame(drawGlyphs);
		}

		drawGlyphs();

		function handleMouseMove(event: MouseEvent) {
			mouseX = (event.clientX / window.innerWidth) * 2 - 1;
			mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
		}

		function handleClick() {
			playGlyphActivation();
		}

		function handleResize() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
			glyphCanvas.width = window.innerWidth;
			glyphCanvas.height = window.innerHeight;
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
	<title>TAM14: Protoss Temple | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam14">
	<div class="canvas-container" bind:this={container}></div>
	<canvas class="glyph-overlay" bind:this={glyphCanvas}></canvas>

	<!-- Audio -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '◈ PSIONIC LINK ACTIVE' : '◇ ESTABLISH LINK'}
	</button>

	<!-- Psionic meter -->
	<div class="psionic-meter">
		<div class="meter-label">PSIONIC ENERGY</div>
		<div class="meter-bar">
			<div class="meter-fill" style="width: {psionicLevel}%"></div>
		</div>
	</div>

	<!-- Content -->
	<div class="content">
		<header>
			<div class="glyph-badge">
				<svg viewBox="0 0 100 100" class="badge-glyph">
					<path d="M50,10 L90,50 L50,90 L10,50 Z" fill="none" stroke="currentColor" stroke-width="2"/>
					<path d="M50,25 L75,50 L50,75 L25,50 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="50" cy="50" r="10" fill="currentColor" opacity="0.5"/>
				</svg>
				<span>EN TARO ADUN</span>
			</div>

			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>

			<p class="subtitle">KNOWLEDGE OF THE FIRSTBORN</p>
		</header>

		<section class="quote-section">
			<div class="quote-frame">
				<svg class="frame-corner tl" viewBox="0 0 40 40">
					<path d="M0,40 L0,10 L10,0 L40,0" fill="none" stroke="currentColor" stroke-width="2"/>
				</svg>
				<svg class="frame-corner tr" viewBox="0 0 40 40">
					<path d="M0,0 L30,0 L40,10 L40,40" fill="none" stroke="currentColor" stroke-width="2"/>
				</svg>
				<svg class="frame-corner bl" viewBox="0 0 40 40">
					<path d="M0,0 L0,30 L10,40 L40,40" fill="none" stroke="currentColor" stroke-width="2"/>
				</svg>
				<svg class="frame-corner br" viewBox="0 0 40 40">
					<path d="M0,40 L30,40 L40,30 L40,0" fill="none" stroke="currentColor" stroke-width="2"/>
				</svg>

				<blockquote>
					"Clearly some powerful alien tool was handed around except it comes with no manual..."
				</blockquote>
				<cite>— EXECUTOR KARPATHY</cite>
			</div>
		</section>

		<section class="powers-section">
			<div class="powers-header">
				<div class="header-line"></div>
				<svg class="header-glyph" viewBox="0 0 60 60">
					<polygon points="30,5 55,30 30,55 5,30" fill="none" stroke="currentColor" stroke-width="2"/>
					<circle cx="30" cy="30" r="8" fill="currentColor" opacity="0.5"/>
				</svg>
				<div class="header-line"></div>
			</div>

			<div class="powers-grid">
				<div class="power-card">
					<svg class="power-icon" viewBox="0 0 50 50">
						<polygon points="25,5 45,25 25,45 5,25" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<line x1="25" y1="15" x2="25" y2="35" stroke="currentColor" stroke-width="1.5"/>
						<line x1="15" y1="25" x2="35" y2="25" stroke="currentColor" stroke-width="1.5"/>
					</svg>
					<span class="power-name">Task Architecture</span>
					<span class="power-desc">Dependency matrices</span>
				</div>

				<div class="power-card">
					<svg class="power-icon" viewBox="0 0 50 50">
						<circle cx="25" cy="25" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="25" cy="25" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<line x1="25" y1="7" x2="25" y2="17" stroke="currentColor" stroke-width="1.5"/>
						<line x1="25" y1="33" x2="25" y2="43" stroke="currentColor" stroke-width="1.5"/>
						<line x1="7" y1="25" x2="17" y2="25" stroke="currentColor" stroke-width="1.5"/>
						<line x1="33" y1="25" x2="43" y2="25" stroke="currentColor" stroke-width="1.5"/>
					</svg>
					<span class="power-name">Agent Coordination</span>
					<span class="power-desc">Psionic network</span>
				</div>

				<div class="power-card">
					<svg class="power-icon" viewBox="0 0 50 50">
						<polygon points="25,5 40,15 40,35 25,45 10,35 10,15" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="25" cy="25" r="6" fill="currentColor" opacity="0.5"/>
					</svg>
					<span class="power-name">Swarm Intelligence</span>
					<span class="power-desc">Collective consciousness</span>
				</div>

				<div class="power-card">
					<svg class="power-icon" viewBox="0 0 50 50">
						<path d="M10,25 Q25,10 40,25 Q25,40 10,25" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="25" cy="25" r="5" fill="currentColor"/>
					</svg>
					<span class="power-name">Workflow Automation</span>
					<span class="power-desc">Temporal weaving</span>
				</div>
			</div>
		</section>

		<section class="install-section">
			<div class="install-crystal">
				<div class="crystal-top"></div>
				<div class="crystal-body">
					<code>git clone https://github.com/jomarchy/squad.git</code>
				</div>
				<div class="crystal-bottom"></div>
			</div>
		</section>
	</div>
</div>

<style>
	.tam14 {
		min-height: 100vh;
		background: linear-gradient(180deg, #000510 0%, #001025 50%, #000510 100%);
		color: white;
		font-family: ui-monospace, monospace;
		overflow-x: hidden;
	}

	.canvas-container {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	.glyph-overlay {
		position: fixed;
		inset: 0;
		z-index: 1;
		pointer-events: none;
	}

	/* Audio */
	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.75rem 1.25rem;
		background: rgba(0, 100, 200, 0.1);
		border: 1px solid rgba(0, 200, 255, 0.4);
		color: #00ccff;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		cursor: pointer;
		clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
	}

	.audio-btn.active {
		background: rgba(0, 200, 255, 0.15);
		box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
	}

	/* Psionic meter */
	.psionic-meter {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 100;
	}

	.meter-label {
		font-size: 0.6rem;
		color: rgba(0, 200, 255, 0.6);
		letter-spacing: 0.2em;
		margin-bottom: 0.5rem;
	}

	.meter-bar {
		width: 150px;
		height: 4px;
		background: rgba(0, 100, 200, 0.3);
		clip-path: polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%);
	}

	.meter-fill {
		height: 100%;
		background: linear-gradient(90deg, #0066aa, #00ccff);
		box-shadow: 0 0 10px #00ccff;
		transition: width 0.3s;
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
	}

	header {
		text-align: center;
		padding: 8rem 0 4rem;
	}

	.glyph-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 2rem;
		color: #00ccff;
	}

	.badge-glyph {
		width: 40px;
		height: 40px;
		animation: rotate-glyph 10s linear infinite;
	}

	@keyframes rotate-glyph {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.glyph-badge span {
		font-size: 0.75rem;
		letter-spacing: 0.3em;
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(0, 200, 255, 0.4);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		background: linear-gradient(180deg, #00ccff 0%, #0066aa 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(0, 200, 255, 0.5));
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.4em;
		color: rgba(0, 200, 255, 0.6);
	}

	.subtitle {
		margin-top: 1.5rem;
		font-size: 0.8rem;
		color: rgba(0, 200, 255, 0.4);
		letter-spacing: 0.3em;
	}

	/* Quote */
	.quote-section {
		padding: 4rem 2rem;
	}

	.quote-frame {
		position: relative;
		max-width: 700px;
		padding: 3rem;
		background: rgba(0, 20, 40, 0.6);
	}

	.frame-corner {
		position: absolute;
		width: 40px;
		height: 40px;
		color: #00ccff;
	}

	.frame-corner.tl { top: 0; left: 0; }
	.frame-corner.tr { top: 0; right: 0; }
	.frame-corner.bl { bottom: 0; left: 0; }
	.frame-corner.br { bottom: 0; right: 0; }

	blockquote {
		font-size: 1.15rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		text-align: center;
		margin: 0 0 1.5rem;
	}

	cite {
		display: block;
		text-align: center;
		font-size: 0.85rem;
		color: #00ccff;
		font-style: normal;
	}

	/* Powers */
	.powers-section {
		padding: 4rem 2rem;
		width: 100%;
		max-width: 1000px;
	}

	.powers-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		margin-bottom: 3rem;
	}

	.header-line {
		width: 100px;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(0, 200, 255, 0.5), transparent);
	}

	.header-glyph {
		width: 50px;
		height: 50px;
		color: #00ccff;
		animation: pulse-glyph 2s ease-in-out infinite;
	}

	@keyframes pulse-glyph {
		0%, 100% { opacity: 0.7; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.1); }
	}

	.powers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
	}

	.power-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: rgba(0, 20, 50, 0.5);
		border: 1px solid rgba(0, 200, 255, 0.2);
		clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
	}

	.power-icon {
		width: 50px;
		height: 50px;
		color: #00ccff;
	}

	.power-name {
		font-size: 0.9rem;
		color: white;
	}

	.power-desc {
		font-size: 0.75rem;
		color: rgba(0, 200, 255, 0.6);
	}

	/* Install */
	.install-section {
		padding: 4rem 2rem;
	}

	.install-crystal {
		text-align: center;
	}

	.crystal-top {
		width: 0;
		height: 0;
		border-left: 150px solid transparent;
		border-right: 150px solid transparent;
		border-bottom: 30px solid rgba(0, 100, 200, 0.3);
		margin: 0 auto;
	}

	.crystal-body {
		background: rgba(0, 50, 100, 0.4);
		border-left: 2px solid rgba(0, 200, 255, 0.3);
		border-right: 2px solid rgba(0, 200, 255, 0.3);
		padding: 2rem;
		max-width: 300px;
		margin: 0 auto;
	}

	.crystal-body code {
		color: #00ccff;
		font-size: 0.85rem;
	}

	.crystal-bottom {
		width: 0;
		height: 0;
		border-left: 150px solid transparent;
		border-right: 150px solid transparent;
		border-top: 30px solid rgba(0, 100, 200, 0.3);
		margin: 0 auto;
	}
</style>
