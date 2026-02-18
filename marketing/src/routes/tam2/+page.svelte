<script lang="ts">
	/**
	 * TAM2: Audio Reactive
	 * Visualizer responding to generated ambient music
	 */
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let isPlaying = $state(false);
	let bassLevel = $state(0);
	let midLevel = $state(0);
	let highLevel = $state(0);

	function startAudio() {
		if (audioContext) return;

		audioContext = new AudioContext();
		analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;

		const masterGain = audioContext.createGain();
		masterGain.gain.setValueAtTime(0.15, audioContext.currentTime);

		// Create rich ambient pad
		const frequencies = [
			{ freq: 55, type: 'sine' as OscillatorType, gain: 0.4 },
			{ freq: 82.5, type: 'triangle' as OscillatorType, gain: 0.3 },
			{ freq: 110, type: 'sine' as OscillatorType, gain: 0.25 },
			{ freq: 220, type: 'sine' as OscillatorType, gain: 0.15 },
			{ freq: 330, type: 'triangle' as OscillatorType, gain: 0.1 },
			{ freq: 440, type: 'sine' as OscillatorType, gain: 0.08 }
		];

		frequencies.forEach(({ freq, type, gain }) => {
			const osc = audioContext!.createOscillator();
			const oscGain = audioContext!.createGain();

			osc.type = type;
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime);
			osc.detune.setValueAtTime(Math.random() * 20 - 10, audioContext!.currentTime);

			oscGain.gain.setValueAtTime(gain, audioContext!.currentTime);

			// Add slow LFO modulation
			const lfo = audioContext!.createOscillator();
			const lfoGain = audioContext!.createGain();
			lfo.frequency.setValueAtTime(0.05 + Math.random() * 0.1, audioContext!.currentTime);
			lfoGain.gain.setValueAtTime(freq * 0.02, audioContext!.currentTime);
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);
			lfo.start();

			osc.connect(oscGain);
			oscGain.connect(masterGain);
			osc.start();
		});

		// Add rhythmic pulse
		const pulseOsc = audioContext.createOscillator();
		const pulseGain = audioContext.createGain();
		pulseOsc.type = 'sine';
		pulseOsc.frequency.setValueAtTime(40, audioContext.currentTime);

		// Pulse envelope LFO
		const pulseLfo = audioContext.createOscillator();
		const pulseLfoGain = audioContext.createGain();
		pulseLfo.frequency.setValueAtTime(0.5, audioContext.currentTime);
		pulseLfoGain.gain.setValueAtTime(0.2, audioContext.currentTime);
		pulseLfo.connect(pulseLfoGain);
		pulseLfoGain.connect(pulseGain.gain);

		pulseGain.gain.setValueAtTime(0.3, audioContext.currentTime);
		pulseOsc.connect(pulseGain);
		pulseGain.connect(masterGain);
		pulseOsc.start();
		pulseLfo.start();

		masterGain.connect(analyser);
		analyser.connect(audioContext.destination);

		isPlaying = true;
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let width = window.innerWidth;
		let height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;

		const bufferLength = 128;
		const dataArray = new Uint8Array(bufferLength);

		// Visualization particles
		interface Particle {
			x: number;
			y: number;
			vx: number;
			vy: number;
			size: number;
			hue: number;
			life: number;
		}

		const particles: Particle[] = [];
		const maxParticles = 200;

		function addParticle(x: number, y: number, intensity: number) {
			if (particles.length < maxParticles) {
				particles.push({
					x,
					y,
					vx: (Math.random() - 0.5) * intensity * 5,
					vy: (Math.random() - 0.5) * intensity * 5,
					size: Math.random() * 3 + 1,
					hue: 260 + Math.random() * 60,
					life: 1
				});
			}
		}

		function animate() {
			// Get audio data
			if (analyser) {
				analyser.getByteFrequencyData(dataArray);

				// Calculate frequency bands
				const bass = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10 / 255;
				const mid = dataArray.slice(10, 50).reduce((a, b) => a + b, 0) / 40 / 255;
				const high = dataArray.slice(50, 128).reduce((a, b) => a + b, 0) / 78 / 255;

				bassLevel = bass;
				midLevel = mid;
				highLevel = high;

				// Add particles based on audio
				if (bass > 0.5) {
					for (let i = 0; i < bass * 5; i++) {
						addParticle(width / 2, height / 2, bass);
					}
				}
			}

			// Clear with fade
			ctx.fillStyle = `rgba(5, 5, 20, 0.1)`;
			ctx.fillRect(0, 0, width, height);

			// Draw circular visualizer
			const centerX = width / 2;
			const centerY = height / 2;
			const baseRadius = Math.min(width, height) * 0.2;

			if (analyser) {
				ctx.beginPath();
				for (let i = 0; i < bufferLength; i++) {
					const value = dataArray[i] / 255;
					const angle = (i / bufferLength) * Math.PI * 2;
					const radius = baseRadius + value * baseRadius;

					const x = centerX + Math.cos(angle) * radius;
					const y = centerY + Math.sin(angle) * radius;

					if (i === 0) {
						ctx.moveTo(x, y);
					} else {
						ctx.lineTo(x, y);
					}
				}
				ctx.closePath();

				const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 2);
				gradient.addColorStop(0, `hsla(280, 100%, 60%, ${0.1 + bassLevel * 0.3})`);
				gradient.addColorStop(0.5, `hsla(200, 100%, 50%, ${0.1 + midLevel * 0.2})`);
				gradient.addColorStop(1, `hsla(180, 100%, 50%, ${0.05 + highLevel * 0.1})`);

				ctx.fillStyle = gradient;
				ctx.fill();

				ctx.strokeStyle = `hsla(280, 100%, 70%, ${0.5 + bassLevel * 0.5})`;
				ctx.lineWidth = 2;
				ctx.stroke();
			}

			// Draw and update particles
			particles.forEach((p, i) => {
				p.x += p.vx;
				p.y += p.vy;
				p.life -= 0.02;
				p.vx *= 0.98;
				p.vy *= 0.98;

				if (p.life <= 0) {
					particles.splice(i, 1);
					return;
				}

				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
				ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.life * 0.8})`;
				ctx.fill();
			});

			// Draw waveform rings
			if (analyser) {
				for (let ring = 0; ring < 3; ring++) {
					ctx.beginPath();
					const ringRadius = baseRadius * (1.5 + ring * 0.3);
					ctx.arc(centerX, centerY, ringRadius + bassLevel * 20, 0, Math.PI * 2);
					ctx.strokeStyle = `hsla(${260 + ring * 30}, 100%, 60%, ${0.1 - ring * 0.03})`;
					ctx.lineWidth = 1;
					ctx.stroke();
				}
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
	<title>TAM2: Audio Reactive | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam2">
	<canvas bind:this={canvas}></canvas>

	<!-- Audio reactive UI elements -->
	<div class="reactive-bg" style="--bass: {bassLevel}; --mid: {midLevel}; --high: {highLevel}"></div>

	<!-- Audio control -->
	<button class="audio-btn" onclick={startAudio} class:playing={isPlaying}>
		{isPlaying ? '◉ AUDIO ACTIVE' : '○ ACTIVATE AUDIO'}
	</button>

	<!-- Content overlay -->
	<div class="content">
		<header class="header">
			<span class="badge">AUDIO REACTIVE</span>
			<h1 style="--scale: {1 + bassLevel * 0.1}">
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p class="tagline">Sound becomes vision</p>
		</header>

		<!-- Level meters -->
		<div class="meters">
			<div class="meter">
				<div class="meter-fill bass" style="--level: {bassLevel}"></div>
				<span>BASS</span>
			</div>
			<div class="meter">
				<div class="meter-fill mid" style="--level: {midLevel}"></div>
				<span>MID</span>
			</div>
			<div class="meter">
				<div class="meter-fill high" style="--level: {highLevel}"></div>
				<span>HIGH</span>
			</div>
		</div>

		<section class="quote-section">
			<blockquote style="--pulse: {1 + midLevel * 0.2}">
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features-section">
			<h2>SYSTEMS</h2>
			<div class="feature-list">
				<div class="feature" style="--intensity: {bassLevel}">Task Architecture</div>
				<div class="feature" style="--intensity: {midLevel}">Agent Coordination</div>
				<div class="feature" style="--intensity: {highLevel}">Swarm Intelligence</div>
				<div class="feature" style="--intensity: {(bassLevel + midLevel) / 2}">Workflow Automation</div>
			</div>
		</section>

		<section class="install-section">
			<code>git clone https://github.com/jomarchy/squad.git</code>
		</section>
	</div>
</div>

<style>
	.tam2 {
		position: relative;
		min-height: 100vh;
		background: #050514;
		overflow: hidden;
	}

	canvas {
		position: fixed;
		inset: 0;
		z-index: 1;
	}

	.reactive-bg {
		position: fixed;
		inset: 0;
		z-index: 0;
		background: radial-gradient(
			circle at 50% 50%,
			hsla(280, 100%, 30%, calc(var(--bass) * 0.3)) 0%,
			hsla(200, 100%, 20%, calc(var(--mid) * 0.2)) 50%,
			transparent 100%
		);
		transition: background 0.1s;
	}

	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.75rem 1.5rem;
		background: rgba(139, 92, 246, 0.1);
		border: 1px solid rgba(139, 92, 246, 0.4);
		border-radius: 100px;
		color: #a78bfa;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-btn:hover {
		background: rgba(139, 92, 246, 0.2);
		box-shadow: 0 0 30px rgba(139, 92, 246, 0.3);
	}

	.audio-btn.playing {
		background: rgba(139, 92, 246, 0.3);
		border-color: rgba(139, 92, 246, 0.8);
		animation: pulse-glow 2s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); }
		50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); }
	}

	.content {
		position: relative;
		z-index: 10;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
	}

	.header {
		text-align: center;
		padding: 8rem 0 4rem;
	}

	.badge {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
		border: 1px solid rgba(139, 92, 246, 0.4);
		border-radius: 100px;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.3em;
		color: #a78bfa;
		margin-bottom: 2rem;
	}

	h1 {
		font-family: ui-monospace, monospace;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
		transform: scale(var(--scale, 1));
		transition: transform 0.1s;
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
		color: rgba(255, 255, 255, 0.7);
		letter-spacing: 0.3em;
	}

	.tagline {
		margin-top: 1.5rem;
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Level meters */
	.meters {
		display: flex;
		gap: 2rem;
		margin: 2rem 0;
	}

	.meter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.meter-fill {
		width: 8px;
		height: 80px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		position: relative;
		overflow: hidden;
	}

	.meter-fill::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: calc(var(--level) * 100%);
		border-radius: 4px;
		transition: height 0.05s;
	}

	.meter-fill.bass::after { background: linear-gradient(to top, #8b5cf6, #a78bfa); }
	.meter-fill.mid::after { background: linear-gradient(to top, #06b6d4, #22d3ee); }
	.meter-fill.high::after { background: linear-gradient(to top, #10b981, #34d399); }

	.meter span {
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Quote */
	.quote-section {
		text-align: center;
		padding: 4rem 2rem;
		max-width: 600px;
	}

	blockquote {
		font-size: 1.3rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		transform: scale(var(--pulse, 1));
		transition: transform 0.1s;
	}

	cite {
		display: block;
		margin-top: 1rem;
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
		color: #8b5cf6;
		font-style: normal;
	}

	/* Features */
	.features-section {
		padding: 4rem 2rem;
		text-align: center;
	}

	.features-section h2 {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 2rem;
	}

	.feature-list {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
	}

	.feature {
		padding: 1rem 1.5rem;
		background: rgba(139, 92, 246, calc(var(--intensity) * 0.3 + 0.05));
		border: 1px solid rgba(139, 92, 246, calc(var(--intensity) * 0.5 + 0.2));
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		color: white;
		transition: all 0.1s;
		box-shadow: 0 0 calc(var(--intensity) * 30px) rgba(139, 92, 246, calc(var(--intensity) * 0.5));
	}

	/* Install */
	.install-section {
		padding: 4rem 2rem;
	}

	.install-section code {
		display: block;
		padding: 1.5rem 2rem;
		background: rgba(10, 10, 30, 0.8);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 8px;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		color: #06b6d4;
	}
</style>
