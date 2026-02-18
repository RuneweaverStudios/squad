<script lang="ts">
	/**
	 * TAM8: Bioluminescent
	 * Deep sea organic flowing patterns with glowing creatures
	 */
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);

	interface Creature {
		x: number;
		y: number;
		vx: number;
		vy: number;
		size: number;
		hue: number;
		tentacles: number;
		phase: number;
		pulseSpeed: number;
	}

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		maxLife: number;
		hue: number;
		size: number;
	}

	function playAmbientSound() {
		if (!audioContext) return;

		// Deep underwater ambience
		const osc1 = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc1.type = 'sine';
		osc2.type = 'sine';
		osc1.frequency.setValueAtTime(60, audioContext.currentTime);
		osc2.frequency.setValueAtTime(90, audioContext.currentTime);

		// Slow wobble
		const lfo = audioContext.createOscillator();
		const lfoGain = audioContext.createGain();
		lfo.frequency.setValueAtTime(0.1, audioContext.currentTime);
		lfoGain.gain.setValueAtTime(3, audioContext.currentTime);
		lfo.connect(lfoGain);
		lfoGain.connect(osc1.frequency);
		lfoGain.connect(osc2.frequency);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(200, audioContext.currentTime);

		gain.gain.setValueAtTime(0.03, audioContext.currentTime);

		osc1.connect(filter);
		osc2.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc1.start();
		osc2.start();
		lfo.start();
	}

	function playPulseSound() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(200 + Math.random() * 200, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);

		gain.gain.setValueAtTime(0.02, audioContext.currentTime);
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
			playAmbientSound();
		}
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let width = window.innerWidth;
		let height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;

		// Create bioluminescent creatures
		const creatures: Creature[] = [];
		for (let i = 0; i < 12; i++) {
			creatures.push({
				x: Math.random() * width,
				y: Math.random() * height,
				vx: (Math.random() - 0.5) * 0.5,
				vy: (Math.random() - 0.5) * 0.5,
				size: 30 + Math.random() * 50,
				hue: 160 + Math.random() * 60, // Cyan to green range
				tentacles: 5 + Math.floor(Math.random() * 4),
				phase: Math.random() * Math.PI * 2,
				pulseSpeed: 0.02 + Math.random() * 0.03
			});
		}

		// Trailing particles
		const particles: Particle[] = [];

		// Flowing organic lines
		const flowLines: { points: { x: number; y: number }[]; hue: number }[] = [];
		for (let i = 0; i < 5; i++) {
			const points = [];
			const startY = height * (0.2 + Math.random() * 0.6);
			for (let j = 0; j < 20; j++) {
				points.push({
					x: (j / 19) * width,
					y: startY
				});
			}
			flowLines.push({ points, hue: 180 + Math.random() * 40 });
		}

		let time = 0;
		let soundCooldown = 0;

		function drawCreature(creature: Creature, t: number) {
			const { x, y, size, hue, tentacles, phase, pulseSpeed } = creature;
			const pulse = Math.sin(t * pulseSpeed + phase) * 0.3 + 0.7;

			// Glow effect
			const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * pulse * 2);
			gradient.addColorStop(0, `hsla(${hue}, 100%, 60%, 0.3)`);
			gradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, 0.1)`);
			gradient.addColorStop(1, 'transparent');
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(x, y, size * pulse * 2, 0, Math.PI * 2);
			ctx.fill();

			// Body
			ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.5 + pulse * 0.3})`;
			ctx.beginPath();
			ctx.arc(x, y, size * pulse * 0.4, 0, Math.PI * 2);
			ctx.fill();

			// Inner glow
			ctx.fillStyle = `hsla(${hue}, 100%, 80%, ${pulse * 0.8})`;
			ctx.beginPath();
			ctx.arc(x, y, size * pulse * 0.2, 0, Math.PI * 2);
			ctx.fill();

			// Tentacles
			ctx.strokeStyle = `hsla(${hue}, 80%, 50%, 0.6)`;
			ctx.lineWidth = 2;
			for (let i = 0; i < tentacles; i++) {
				const angle = (i / tentacles) * Math.PI * 2 + t * 0.5;
				ctx.beginPath();
				ctx.moveTo(x, y);

				for (let j = 0; j < 5; j++) {
					const dist = size * 0.3 + j * size * 0.3;
					const wave = Math.sin(t * 2 + j * 0.5 + phase) * 20;
					const tx = x + Math.cos(angle + wave * 0.01) * dist;
					const ty = y + Math.sin(angle + wave * 0.01) * dist + wave;
					ctx.lineTo(tx, ty);
				}
				ctx.stroke();
			}

			// Spawn particles occasionally
			if (Math.random() < 0.1) {
				particles.push({
					x: x + (Math.random() - 0.5) * size,
					y: y + (Math.random() - 0.5) * size,
					vx: (Math.random() - 0.5) * 2,
					vy: -Math.random() * 2,
					life: 60,
					maxLife: 60,
					hue: hue,
					size: 2 + Math.random() * 3
				});
			}
		}

		function animate() {
			time += 1;
			soundCooldown = Math.max(0, soundCooldown - 1);

			// Dark underwater background
			ctx.fillStyle = 'rgba(0, 10, 20, 0.1)';
			ctx.fillRect(0, 0, width, height);

			// Draw flowing lines
			flowLines.forEach((line, lineIndex) => {
				// Update flow line points
				line.points.forEach((point, i) => {
					const noise = Math.sin(time * 0.02 + i * 0.3 + lineIndex) * 30;
					const targetY = height * (0.3 + lineIndex * 0.1) + noise;
					point.y += (targetY - point.y) * 0.02;
				});

				// Draw the flow line
				ctx.beginPath();
				ctx.moveTo(line.points[0].x, line.points[0].y);
				for (let i = 1; i < line.points.length - 2; i++) {
					const xc = (line.points[i].x + line.points[i + 1].x) / 2;
					const yc = (line.points[i].y + line.points[i + 1].y) / 2;
					ctx.quadraticCurveTo(line.points[i].x, line.points[i].y, xc, yc);
				}
				ctx.strokeStyle = `hsla(${line.hue}, 80%, 50%, 0.2)`;
				ctx.lineWidth = 3;
				ctx.stroke();
			});

			// Update and draw creatures
			creatures.forEach((creature) => {
				// Gentle wandering movement
				creature.vx += (Math.random() - 0.5) * 0.05;
				creature.vy += (Math.random() - 0.5) * 0.05;
				creature.vx *= 0.99;
				creature.vy *= 0.99;

				creature.x += creature.vx;
				creature.y += creature.vy;

				// Wrap around edges
				if (creature.x < -creature.size) creature.x = width + creature.size;
				if (creature.x > width + creature.size) creature.x = -creature.size;
				if (creature.y < -creature.size) creature.y = height + creature.size;
				if (creature.y > height + creature.size) creature.y = -creature.size;

				drawCreature(creature, time * 0.05);

				// Sound on strong pulse
				if (soundCooldown === 0 && Math.sin(time * creature.pulseSpeed + creature.phase) > 0.95) {
					playPulseSound();
					soundCooldown = 30;
				}
			});

			// Update and draw particles
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.x += p.vx;
				p.y += p.vy;
				p.vy -= 0.02; // Float up
				p.life--;

				const alpha = p.life / p.maxLife;
				ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha * 0.8})`;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
				ctx.fill();

				if (p.life <= 0) {
					particles.splice(i, 1);
				}
			}

			// Ambient floating particles
			if (Math.random() < 0.3) {
				const hue = 160 + Math.random() * 60;
				ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${Math.random() * 0.5})`;
				ctx.beginPath();
				ctx.arc(
					Math.random() * width,
					Math.random() * height,
					Math.random() * 2,
					0,
					Math.PI * 2
				);
				ctx.fill();
			}

			requestAnimationFrame(animate);
		}

		animate();

		function handleResize() {
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = width;
			canvas.height = height;
		}

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM8: Bioluminescent | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam8">
	<canvas bind:this={canvas}></canvas>

	<!-- Audio control -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '~~ SOUND ON ~~' : '~~ SOUND OFF ~~'}
	</button>

	<!-- Content -->
	<div class="content">
		<header>
			<span class="badge">DEEP SEA EDITION</span>
			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p class="tagline">From the depths of intelligence</p>
		</header>

		<section class="quote">
			<blockquote>
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features">
			<div class="feature-grid">
				<div class="feature">
					<div class="feature-glow"></div>
					<span class="feature-icon">◎</span>
					<span class="feature-text">Task Architecture</span>
				</div>
				<div class="feature">
					<div class="feature-glow"></div>
					<span class="feature-icon">◎</span>
					<span class="feature-text">Agent Coordination</span>
				</div>
				<div class="feature">
					<div class="feature-glow"></div>
					<span class="feature-icon">◎</span>
					<span class="feature-text">Swarm Intelligence</span>
				</div>
				<div class="feature">
					<div class="feature-glow"></div>
					<span class="feature-icon">◎</span>
					<span class="feature-text">Workflow Automation</span>
				</div>
			</div>
		</section>

		<section class="install">
			<div class="install-box">
				<code>git clone https://github.com/jomarchy/squad.git</code>
			</div>
		</section>
	</div>
</div>

<style>
	.tam8 {
		min-height: 100vh;
		background: linear-gradient(180deg, #000a14 0%, #001020 50%, #000510 100%);
		color: white;
		font-family: ui-monospace, monospace;
		overflow: hidden;
	}

	canvas {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	/* Audio button */
	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: rgba(0, 200, 180, 0.1);
		border: 1px solid rgba(0, 200, 180, 0.3);
		border-radius: 20px;
		color: #00c8b4;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-btn.active {
		background: rgba(0, 200, 180, 0.2);
		box-shadow: 0 0 20px rgba(0, 200, 180, 0.4);
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

	.badge {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: rgba(0, 200, 180, 0.1);
		border: 1px solid rgba(0, 200, 180, 0.3);
		border-radius: 100px;
		font-size: 0.65rem;
		letter-spacing: 0.3em;
		color: #00c8b4;
		margin-bottom: 2rem;
		animation: badge-pulse 3s ease-in-out infinite;
	}

	@keyframes badge-pulse {
		0%, 100% { box-shadow: 0 0 10px rgba(0, 200, 180, 0.2); }
		50% { box-shadow: 0 0 30px rgba(0, 200, 180, 0.4); }
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(255, 255, 255, 0.3);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		background: linear-gradient(180deg, #00ffd5 0%, #00a8ff 50%, #00ffd5 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(0, 200, 180, 0.5));
		animation: alien-glow 4s ease-in-out infinite;
	}

	@keyframes alien-glow {
		0%, 100% { filter: drop-shadow(0 0 30px rgba(0, 200, 180, 0.5)); }
		50% { filter: drop-shadow(0 0 50px rgba(0, 200, 180, 0.8)); }
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.5);
	}

	.tagline {
		margin-top: 1.5rem;
		font-size: 0.9rem;
		color: rgba(0, 200, 180, 0.6);
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
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}

	cite {
		display: block;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: #00c8b4;
		font-style: normal;
	}

	/* Features */
	.features {
		padding: 2rem;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		max-width: 800px;
	}

	.feature {
		position: relative;
		padding: 1.5rem;
		background: rgba(0, 30, 40, 0.5);
		border: 1px solid rgba(0, 200, 180, 0.2);
		border-radius: 12px;
		display: flex;
		align-items: center;
		gap: 1rem;
		overflow: hidden;
	}

	.feature-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 100px;
		height: 100px;
		background: radial-gradient(circle, rgba(0, 200, 180, 0.2) 0%, transparent 70%);
		transform: translate(-50%, -50%);
		animation: feature-glow-pulse 3s ease-in-out infinite;
	}

	@keyframes feature-glow-pulse {
		0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
		50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.2); }
	}

	.feature-icon {
		position: relative;
		z-index: 1;
		font-size: 1.5rem;
		color: #00ffd5;
	}

	.feature-text {
		position: relative;
		z-index: 1;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.8);
	}

	/* Install */
	.install {
		padding: 4rem 2rem;
	}

	.install-box {
		padding: 1.5rem 2rem;
		background: rgba(0, 20, 30, 0.8);
		border: 1px solid rgba(0, 200, 180, 0.3);
		border-radius: 8px;
		box-shadow: 0 0 30px rgba(0, 200, 180, 0.1);
	}

	.install-box code {
		font-size: 0.85rem;
		color: #00ffd5;
	}
</style>
