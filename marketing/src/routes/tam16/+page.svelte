<script lang="ts">
	/**
	 * TAM16: Void Entity
	 * Dark void energy, geometric sigils, otherworldly presence
	 */
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let container: HTMLDivElement;
	let sigilCanvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let voidIntensity = $state(0);

	function playVoidPulse() {
		if (!audioContext) return;

		// Deep otherworldly pulse
		const osc1 = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const osc3 = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(55, audioContext.currentTime);
		osc1.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 0.5);
		osc1.frequency.exponentialRampToValueAtTime(55, audioContext.currentTime + 1);

		osc2.type = 'triangle';
		osc2.frequency.setValueAtTime(82.5, audioContext.currentTime);

		osc3.type = 'sawtooth';
		osc3.frequency.setValueAtTime(27.5, audioContext.currentTime);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(200, audioContext.currentTime);
		filter.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
		filter.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 1);

		gain.gain.setValueAtTime(0.15, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);

		osc1.connect(filter);
		osc2.connect(filter);
		osc3.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc1.start();
		osc2.start();
		osc3.start();
		osc1.stop(audioContext.currentTime + 1.5);
		osc2.stop(audioContext.currentTime + 1.5);
		osc3.stop(audioContext.currentTime + 1.5);
	}

	function playVoidAmbient() {
		if (!audioContext) return;

		// Cosmic void drone
		const frequencies = [33, 55, 82.5, 110];
		frequencies.forEach((freq) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();
			const filter = audioContext!.createBiquadFilter();

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime);

			// Slow random modulation
			const lfo = audioContext!.createOscillator();
			const lfoGain = audioContext!.createGain();
			lfo.frequency.setValueAtTime(0.1 + Math.random() * 0.2, audioContext!.currentTime);
			lfoGain.gain.setValueAtTime(freq * 0.02, audioContext!.currentTime);
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);

			filter.type = 'lowpass';
			filter.frequency.setValueAtTime(300, audioContext!.currentTime);

			gain.gain.setValueAtTime(0.02, audioContext!.currentTime);

			osc.connect(filter);
			filter.connect(gain);
			gain.connect(audioContext!.destination);

			osc.start();
			lfo.start();
		});
	}

	function playSigilActivation() {
		if (!audioContext) return;

		// Sharp ethereal ping
		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(880, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.05);
		osc.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.3);

		gain.gain.setValueAtTime(0.08, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

		osc.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.5);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playVoidAmbient();
		}
	}

	onMount(() => {
		// Three.js void scene
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x050008, 1);
		container.appendChild(renderer.domElement);

		// Central void sphere
		const voidGeometry = new THREE.IcosahedronGeometry(8, 2);
		const voidMaterial = new THREE.MeshPhongMaterial({
			color: 0x200030,
			emissive: 0x100020,
			emissiveIntensity: 0.5,
			wireframe: true,
			transparent: true,
			opacity: 0.8
		});
		const voidSphere = new THREE.Mesh(voidGeometry, voidMaterial);
		scene.add(voidSphere);

		// Inner solid sphere
		const innerGeometry = new THREE.IcosahedronGeometry(5, 1);
		const innerMaterial = new THREE.MeshPhongMaterial({
			color: 0x8844ff,
			emissive: 0x4422aa,
			emissiveIntensity: 0.8,
			transparent: true,
			opacity: 0.6
		});
		const innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
		scene.add(innerSphere);

		// Orbiting sigil rings
		const ringGroup = new THREE.Group();

		for (let i = 0; i < 3; i++) {
			const ringGeometry = new THREE.TorusGeometry(15 + i * 5, 0.2, 16, 100);
			const ringMaterial = new THREE.MeshBasicMaterial({
				color: 0xaa66ff,
				transparent: true,
				opacity: 0.4 - i * 0.1
			});
			const ring = new THREE.Mesh(ringGeometry, ringMaterial);
			ring.rotation.x = Math.PI / 2 + (i - 1) * 0.3;
			ring.userData = { speed: 0.005 + i * 0.002, axis: i };
			ringGroup.add(ring);
		}
		scene.add(ringGroup);

		// Floating geometric fragments
		const fragments: THREE.Mesh[] = [];
		const fragmentGeometry = new THREE.TetrahedronGeometry(1);
		const fragmentMaterial = new THREE.MeshPhongMaterial({
			color: 0x6633aa,
			emissive: 0x331166,
			transparent: true,
			opacity: 0.7
		});

		for (let i = 0; i < 40; i++) {
			const fragment = new THREE.Mesh(fragmentGeometry, fragmentMaterial.clone());
			const angle = (i / 40) * Math.PI * 2;
			const radius = 20 + Math.random() * 15;
			fragment.position.set(
				Math.cos(angle) * radius,
				(Math.random() - 0.5) * 30,
				Math.sin(angle) * radius
			);
			fragment.scale.setScalar(0.5 + Math.random() * 1.5);
			fragment.userData = {
				baseAngle: angle,
				radius,
				baseY: fragment.position.y,
				speed: 0.2 + Math.random() * 0.3,
				rotSpeed: new THREE.Vector3(
					(Math.random() - 0.5) * 0.02,
					(Math.random() - 0.5) * 0.02,
					(Math.random() - 0.5) * 0.02
				)
			};
			fragments.push(fragment);
			scene.add(fragment);
		}

		// Void tendrils (lines extending from center)
		const tendrilCount = 12;
		const tendrils: THREE.Line[] = [];

		for (let i = 0; i < tendrilCount; i++) {
			const points = [];
			const angle = (i / tendrilCount) * Math.PI * 2;
			for (let j = 0; j < 20; j++) {
				const t = j / 19;
				const r = t * 40;
				points.push(new THREE.Vector3(
					Math.cos(angle) * r,
					Math.sin(t * Math.PI * 2) * 5,
					Math.sin(angle) * r
				));
			}
			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const material = new THREE.LineBasicMaterial({
				color: 0x8844ff,
				transparent: true,
				opacity: 0.3
			});
			const tendril = new THREE.Line(geometry, material);
			tendril.userData = { baseAngle: angle };
			tendrils.push(tendril);
			scene.add(tendril);
		}

		// Lighting
		const ambientLight = new THREE.AmbientLight(0x201030, 0.5);
		scene.add(ambientLight);

		const voidLight = new THREE.PointLight(0x8844ff, 2, 50);
		voidLight.position.set(0, 0, 0);
		scene.add(voidLight);

		const accentLight1 = new THREE.PointLight(0xaa44ff, 1, 40);
		accentLight1.position.set(20, 10, 20);
		scene.add(accentLight1);

		const accentLight2 = new THREE.PointLight(0x4422aa, 1, 40);
		accentLight2.position.set(-20, -10, -20);
		scene.add(accentLight2);

		camera.position.set(0, 15, 40);
		camera.lookAt(0, 0, 0);

		let time = 0;
		let mouseX = 0;
		let mouseY = 0;
		let pulseTimer = 0;

		function animate() {
			time += 0.016;
			pulseTimer += 0.016;

			// Rotate void spheres
			voidSphere.rotation.x += 0.003;
			voidSphere.rotation.y += 0.005;
			innerSphere.rotation.x -= 0.002;
			innerSphere.rotation.y -= 0.003;

			// Pulse effect
			const pulse = Math.sin(time * 2) * 0.2 + 1;
			voidSphere.scale.setScalar(pulse);
			innerMaterial.emissiveIntensity = 0.6 + Math.sin(time * 3) * 0.3;

			// Update void intensity
			voidIntensity = (Math.sin(time * 1.5) * 0.5 + 0.5) * 100;

			// Rotate rings
			ringGroup.children.forEach((ring) => {
				const { speed, axis } = ring.userData;
				if (axis === 0) ring.rotation.z += speed;
				else if (axis === 1) ring.rotation.x += speed;
				else ring.rotation.y += speed;
			});

			// Animate fragments
			fragments.forEach((frag) => {
				const { baseAngle, radius, baseY, speed, rotSpeed } = frag.userData;
				const newAngle = baseAngle + time * speed * 0.1;
				frag.position.x = Math.cos(newAngle) * radius;
				frag.position.z = Math.sin(newAngle) * radius;
				frag.position.y = baseY + Math.sin(time * speed + baseAngle) * 3;
				frag.rotation.x += rotSpeed.x;
				frag.rotation.y += rotSpeed.y;
				frag.rotation.z += rotSpeed.z;
			});

			// Animate tendrils
			tendrils.forEach((tendril) => {
				const positions = tendril.geometry.attributes.position.array as Float32Array;
				const { baseAngle } = tendril.userData;
				for (let j = 0; j < 20; j++) {
					const t = j / 19;
					const wobble = Math.sin(time * 2 + j * 0.5 + baseAngle) * 2;
					positions[j * 3 + 1] = Math.sin(t * Math.PI * 2 + time) * 5 + wobble;
				}
				tendril.geometry.attributes.position.needsUpdate = true;
			});

			// Void light pulse
			voidLight.intensity = 2 + Math.sin(time * 4) * 0.5;

			// Camera follows mouse slightly
			camera.position.x += (mouseX * 10 - camera.position.x) * 0.01;
			camera.position.y += (15 + mouseY * 5 - camera.position.y) * 0.01;
			camera.lookAt(0, 0, 0);

			// Sound trigger
			if (pulseTimer > 4 && audioContext) {
				playVoidPulse();
				pulseTimer = 0;
			}

			renderer.render(scene, camera);
			requestAnimationFrame(animate);
		}

		animate();

		// Sigil overlay canvas
		const ctx = sigilCanvas.getContext('2d')!;
		sigilCanvas.width = window.innerWidth;
		sigilCanvas.height = window.innerHeight;

		let sigilTime = 0;

		function drawSigils() {
			sigilTime += 0.02;
			ctx.clearRect(0, 0, sigilCanvas.width, sigilCanvas.height);

			const cx = sigilCanvas.width / 2;
			const cy = sigilCanvas.height / 2;

			// Draw central complex sigil
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(sigilTime * 0.1);

			// Outer hexagram
			const hexSize = 120;
			ctx.strokeStyle = `rgba(136, 68, 255, ${0.3 + Math.sin(sigilTime) * 0.1})`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			for (let i = 0; i < 6; i++) {
				const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
				const x = Math.cos(angle) * hexSize;
				const y = Math.sin(angle) * hexSize;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();

			// Inner geometric pattern
			ctx.strokeStyle = `rgba(170, 100, 255, ${0.4 + Math.sin(sigilTime * 2) * 0.2})`;
			ctx.lineWidth = 1.5;
			for (let i = 0; i < 6; i++) {
				const angle1 = (i / 6) * Math.PI * 2;
				const angle2 = ((i + 2) / 6) * Math.PI * 2;
				ctx.beginPath();
				ctx.moveTo(Math.cos(angle1) * hexSize, Math.sin(angle1) * hexSize);
				ctx.lineTo(Math.cos(angle2) * hexSize, Math.sin(angle2) * hexSize);
				ctx.stroke();
			}

			// Center eye
			const eyePulse = Math.sin(sigilTime * 3) * 0.3 + 0.7;
			ctx.fillStyle = `rgba(136, 68, 255, ${eyePulse * 0.5})`;
			ctx.beginPath();
			ctx.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = `rgba(200, 150, 255, ${eyePulse})`;
			ctx.beginPath();
			ctx.arc(0, 0, 8, 0, Math.PI * 2);
			ctx.fill();

			ctx.restore();

			// Corner sigils
			const corners = [
				{ x: 100, y: 100 },
				{ x: sigilCanvas.width - 100, y: 100 },
				{ x: 100, y: sigilCanvas.height - 100 },
				{ x: sigilCanvas.width - 100, y: sigilCanvas.height - 100 }
			];

			corners.forEach((pos, i) => {
				ctx.save();
				ctx.translate(pos.x, pos.y);
				ctx.rotate(sigilTime * 0.3 * (i % 2 === 0 ? 1 : -1));

				const alpha = 0.3 + Math.sin(sigilTime + i * Math.PI / 2) * 0.2;

				// Triangle sigil
				ctx.strokeStyle = `rgba(136, 68, 255, ${alpha})`;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(0, -30);
				ctx.lineTo(26, 15);
				ctx.lineTo(-26, 15);
				ctx.closePath();
				ctx.stroke();

				// Inner details
				ctx.beginPath();
				ctx.arc(0, 0, 10, 0, Math.PI * 2);
				ctx.stroke();

				ctx.restore();
			});

			requestAnimationFrame(drawSigils);
		}

		drawSigils();

		function handleMouseMove(event: MouseEvent) {
			mouseX = (event.clientX / window.innerWidth) * 2 - 1;
			mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
		}

		function handleClick() {
			playSigilActivation();
		}

		function handleResize() {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
			sigilCanvas.width = window.innerWidth;
			sigilCanvas.height = window.innerHeight;
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
	<title>TAM16: Void Entity | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam16">
	<div class="canvas-container" bind:this={container}></div>
	<canvas class="sigil-overlay" bind:this={sigilCanvas}></canvas>

	<!-- Audio -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '◈ VOID RESONANCE' : '◇ INVOKE VOID'}
	</button>

	<!-- Void meter -->
	<div class="void-meter">
		<span class="meter-label">VOID INTENSITY</span>
		<div class="meter-ring">
			<svg viewBox="0 0 100 100">
				<circle cx="50" cy="50" r="45" fill="none" stroke="rgba(136,68,255,0.2)" stroke-width="4"/>
				<circle cx="50" cy="50" r="45" fill="none" stroke="#8844ff" stroke-width="4"
					stroke-dasharray="283" stroke-dashoffset={283 - (voidIntensity / 100) * 283}
					transform="rotate(-90 50 50)"/>
			</svg>
			<span class="meter-value">{voidIntensity.toFixed(0)}</span>
		</div>
	</div>

	<!-- Content -->
	<div class="content">
		<header>
			<div class="void-symbol">
				<svg viewBox="0 0 100 100">
					<polygon points="50,10 90,75 10,75" fill="none" stroke="currentColor" stroke-width="2"/>
					<polygon points="50,90 90,25 10,25" fill="none" stroke="currentColor" stroke-width="2"/>
					<circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" stroke-width="2"/>
				</svg>
			</div>

			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>

			<p class="subtitle">FROM BEYOND THE VOID</p>
		</header>

		<section class="quote-section">
			<div class="void-frame">
				<blockquote>
					"Clearly some powerful alien tool was handed around except it comes with no manual..."
				</blockquote>
				<cite>— DARK PRELATE KARPATHY</cite>
			</div>
		</section>

		<section class="powers-section">
			<div class="powers-grid">
				<div class="void-power">
					<div class="power-sigil">
						<svg viewBox="0 0 60 60">
							<polygon points="30,5 55,45 5,45" fill="none" stroke="currentColor" stroke-width="1.5"/>
							<circle cx="30" cy="32" r="8" fill="currentColor" opacity="0.5"/>
						</svg>
					</div>
					<span>Task Architecture</span>
				</div>
				<div class="void-power">
					<div class="power-sigil">
						<svg viewBox="0 0 60 60">
							<rect x="10" y="10" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(45 30 30)"/>
							<circle cx="30" cy="30" r="8" fill="currentColor" opacity="0.5"/>
						</svg>
					</div>
					<span>Agent Coordination</span>
				</div>
				<div class="void-power">
					<div class="power-sigil">
						<svg viewBox="0 0 60 60">
							<polygon points="30,5 55,20 55,45 30,55 5,45 5,20" fill="none" stroke="currentColor" stroke-width="1.5"/>
							<circle cx="30" cy="30" r="8" fill="currentColor" opacity="0.5"/>
						</svg>
					</div>
					<span>Swarm Intelligence</span>
				</div>
				<div class="void-power">
					<div class="power-sigil">
						<svg viewBox="0 0 60 60">
							<circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" stroke-width="1.5"/>
							<path d="M15,30 Q30,10 45,30 Q30,50 15,30" fill="none" stroke="currentColor" stroke-width="1.5"/>
						</svg>
					</div>
					<span>Workflow Automation</span>
				</div>
			</div>
		</section>

		<section class="install-section">
			<div class="void-terminal">
				<div class="terminal-sigil">◆</div>
				<code>git clone https://github.com/jomarchy/squad.git</code>
				<div class="terminal-sigil">◆</div>
			</div>
		</section>
	</div>
</div>

<style>
	.tam16 {
		min-height: 100vh;
		background: linear-gradient(180deg, #050008 0%, #100020 50%, #050008 100%);
		color: #aa88ff;
		font-family: ui-monospace, monospace;
		overflow: hidden;
	}

	.canvas-container {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	.sigil-overlay {
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
		background: rgba(136, 68, 255, 0.1);
		border: 1px solid rgba(136, 68, 255, 0.4);
		color: #aa88ff;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		cursor: pointer;
	}

	.audio-btn.active {
		background: rgba(136, 68, 255, 0.2);
		box-shadow: 0 0 30px rgba(136, 68, 255, 0.4);
	}

	/* Void meter */
	.void-meter {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.meter-label {
		font-size: 0.6rem;
		color: rgba(170, 136, 255, 0.6);
		letter-spacing: 0.15em;
	}

	.meter-ring {
		position: relative;
		width: 80px;
		height: 80px;
	}

	.meter-ring svg {
		width: 100%;
		height: 100%;
	}

	.meter-ring svg circle:last-child {
		transition: stroke-dashoffset 0.3s;
	}

	.meter-value {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 1.2rem;
		color: #aa88ff;
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

	.void-symbol {
		width: 80px;
		height: 80px;
		margin: 0 auto 2rem;
		color: #8844ff;
		animation: symbol-rotate 20s linear infinite;
	}

	@keyframes symbol-rotate {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(170, 136, 255, 0.4);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		background: linear-gradient(180deg, #cc99ff 0%, #6633aa 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(136, 68, 255, 0.6));
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.4em;
		color: rgba(170, 136, 255, 0.6);
	}

	.subtitle {
		margin-top: 1.5rem;
		font-size: 0.8rem;
		color: rgba(136, 68, 255, 0.5);
		letter-spacing: 0.3em;
	}

	/* Quote */
	.quote-section {
		padding: 4rem 2rem;
	}

	.void-frame {
		max-width: 700px;
		padding: 3rem;
		background: rgba(20, 10, 40, 0.6);
		border: 1px solid rgba(136, 68, 255, 0.3);
		position: relative;
	}

	.void-frame::before,
	.void-frame::after {
		content: '◆';
		position: absolute;
		color: rgba(136, 68, 255, 0.6);
		font-size: 1.5rem;
	}

	.void-frame::before { top: -15px; left: 50%; transform: translateX(-50%); }
	.void-frame::after { bottom: -15px; left: 50%; transform: translateX(-50%); }

	blockquote {
		font-size: 1.1rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.75);
		font-style: italic;
		text-align: center;
		margin: 0 0 1.5rem;
	}

	cite {
		display: block;
		text-align: center;
		font-size: 0.8rem;
		color: #8844ff;
		font-style: normal;
	}

	/* Powers */
	.powers-section {
		padding: 4rem 2rem;
	}

	.powers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1.5rem;
		max-width: 900px;
	}

	.void-power {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: rgba(20, 10, 40, 0.5);
		border: 1px solid rgba(136, 68, 255, 0.2);
	}

	.power-sigil {
		width: 60px;
		height: 60px;
		color: #8844ff;
	}

	.void-power span {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.8);
		text-align: center;
	}

	/* Install */
	.install-section {
		padding: 4rem 2rem;
	}

	.void-terminal {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem 2rem;
		background: rgba(20, 10, 40, 0.8);
		border: 1px solid rgba(136, 68, 255, 0.3);
	}

	.terminal-sigil {
		color: #8844ff;
		font-size: 1.2rem;
	}

	.void-terminal code {
		color: #aa88ff;
		font-size: 0.9rem;
	}
</style>
