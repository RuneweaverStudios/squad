<script lang="ts">
	/**
	 * TAM6: Cyberpunk Glitch
	 * Heavy glitch distortion effects with neon aesthetics
	 */
	import { onMount } from 'svelte';

	let glitchIntensity = $state(0);
	let isGlitching = $state(false);
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);

	function playGlitchSound() {
		if (!audioContext) return;

		// White noise burst
		const bufferSize = audioContext.sampleRate * 0.1;
		const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
		const data = buffer.getChannelData(0);

		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}

		const noise = audioContext.createBufferSource();
		noise.buffer = buffer;

		const filter = audioContext.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(1000 + Math.random() * 2000, audioContext.currentTime);
		filter.Q.setValueAtTime(10, audioContext.currentTime);

		const gain = audioContext.createGain();
		gain.gain.setValueAtTime(0.1, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

		noise.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		noise.start();
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;

			// Ambient synth
			const osc = audioContext.createOscillator();
			const gain = audioContext.createGain();
			osc.type = 'sawtooth';
			osc.frequency.setValueAtTime(55, audioContext.currentTime);
			gain.gain.setValueAtTime(0.03, audioContext.currentTime);
			osc.connect(gain);
			gain.connect(audioContext.destination);
			osc.start();
		}
	}

	function triggerGlitch() {
		isGlitching = true;
		glitchIntensity = Math.random() * 0.5 + 0.5;
		playGlitchSound();

		setTimeout(() => {
			isGlitching = false;
			glitchIntensity = 0;
		}, 100 + Math.random() * 200);
	}

	onMount(() => {
		// Random glitch triggers
		const glitchInterval = setInterval(() => {
			if (Math.random() < 0.1) {
				triggerGlitch();
			}
		}, 500);

		// Mouse movement glitches
		const handleMouseMove = () => {
			if (Math.random() < 0.02) {
				triggerGlitch();
			}
		};

		window.addEventListener('mousemove', handleMouseMove);

		return () => {
			clearInterval(glitchInterval);
			window.removeEventListener('mousemove', handleMouseMove);
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM6: Cyberpunk Glitch | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam6" class:glitching={isGlitching} style="--glitch-intensity: {glitchIntensity}">
	<!-- Glitch overlays -->
	<div class="glitch-overlay">
		<div class="scanlines"></div>
		<div class="noise"></div>
		<div class="rgb-shift"></div>
	</div>

	<!-- Neon grid background -->
	<div class="neon-grid"></div>

	<!-- Audio control -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '[AUDIO:ON]' : '[AUDIO:OFF]'}
	</button>

	<!-- Glitch trigger -->
	<button class="glitch-btn" onclick={triggerGlitch}>
		[GLITCH]
	</button>

	<!-- Content -->
	<div class="content">
		<header>
			<div class="badge-container">
				<span class="badge">CYBERPUNK</span>
				<span class="badge alt">GLITCH</span>
			</div>

			<h1 class="glitch-text" data-text="THE ALIEN MANUAL">
				<span class="line1">THE</span>
				<span class="line2">ALIEN</span>
				<span class="line3">MANUAL</span>
			</h1>

			<p class="tagline">
				<span class="neon-text pink">SYSTEM</span>
				<span class="neon-text cyan">OVERRIDE</span>
			</p>
		</header>

		<section class="quote-section">
			<div class="quote-box">
				<blockquote class="glitch-text" data-text='"Clearly some powerful alien tool..."'>
					"Clearly some powerful alien tool was handed around except it comes with no manual..."
				</blockquote>
				<cite>— @karpathy</cite>
			</div>
		</section>

		<section class="features-section">
			<h2>// SYSTEMS</h2>
			<div class="feature-grid">
				<div class="feature-card">
					<span class="feature-id">001</span>
					<span class="feature-name">TASK_ARCH</span>
				</div>
				<div class="feature-card">
					<span class="feature-id">002</span>
					<span class="feature-name">AGENT_COORD</span>
				</div>
				<div class="feature-card">
					<span class="feature-id">003</span>
					<span class="feature-name">SWARM_INT</span>
				</div>
				<div class="feature-card">
					<span class="feature-id">004</span>
					<span class="feature-name">WORKFLOW_AUTO</span>
				</div>
			</div>
		</section>

		<section class="install-section">
			<div class="terminal-box">
				<div class="terminal-header">
					<span>// INIT_SEQUENCE</span>
				</div>
				<code>$ git clone https://github.com/jomarchy/squad.git</code>
			</div>
		</section>
	</div>
</div>

<style>
	.tam6 {
		min-height: 100vh;
		background: #0a0a0f;
		color: white;
		font-family: ui-monospace, monospace;
		position: relative;
		overflow: hidden;
	}

	/* Glitch state */
	.tam6.glitching {
		animation: screen-glitch 0.1s steps(2) infinite;
	}

	@keyframes screen-glitch {
		0% { transform: translate(0); filter: hue-rotate(0deg); }
		25% { transform: translate(calc(var(--glitch-intensity) * -5px), calc(var(--glitch-intensity) * 2px)); filter: hue-rotate(90deg); }
		50% { transform: translate(calc(var(--glitch-intensity) * 3px), calc(var(--glitch-intensity) * -2px)); filter: hue-rotate(180deg); }
		75% { transform: translate(calc(var(--glitch-intensity) * -2px), calc(var(--glitch-intensity) * 3px)); filter: hue-rotate(270deg); }
		100% { transform: translate(0); filter: hue-rotate(360deg); }
	}

	/* Glitch overlay */
	.glitch-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		pointer-events: none;
	}

	.scanlines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent 0px,
			transparent 1px,
			rgba(0, 0, 0, 0.3) 1px,
			rgba(0, 0, 0, 0.3) 2px
		);
	}

	.noise {
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E");
		opacity: 0.03;
	}

	.tam6.glitching .noise {
		opacity: 0.1;
	}

	.rgb-shift {
		position: absolute;
		inset: 0;
		mix-blend-mode: screen;
	}

	.tam6.glitching .rgb-shift {
		background: linear-gradient(
			90deg,
			rgba(255, 0, 0, 0.1) 33%,
			rgba(0, 255, 0, 0.1) 33% 66%,
			rgba(0, 0, 255, 0.1) 66%
		);
		animation: rgb-shift 0.1s steps(3) infinite;
	}

	@keyframes rgb-shift {
		0% { transform: translateX(-3px); }
		50% { transform: translateX(3px); }
		100% { transform: translateX(-3px); }
	}

	/* Neon grid */
	.neon-grid {
		position: fixed;
		inset: 0;
		z-index: 0;
		background:
			linear-gradient(90deg, rgba(255, 0, 128, 0.03) 1px, transparent 1px),
			linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px);
		background-size: 50px 50px;
		perspective: 500px;
		transform-style: preserve-3d;
	}

	.neon-grid::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, transparent 50%, rgba(255, 0, 128, 0.1) 100%);
	}

	/* Controls */
	.audio-btn, .glitch-btn {
		position: fixed;
		z-index: 200;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid;
		font-family: inherit;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.3s;
	}

	.audio-btn {
		top: 1rem;
		right: 1rem;
		border-color: #ff0080;
		color: #ff0080;
		text-shadow: 0 0 10px #ff0080;
	}

	.glitch-btn {
		top: 1rem;
		right: 8rem;
		border-color: #00ffff;
		color: #00ffff;
		text-shadow: 0 0 10px #00ffff;
	}

	.audio-btn.active {
		background: rgba(255, 0, 128, 0.2);
		box-shadow: 0 0 20px rgba(255, 0, 128, 0.5);
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
		padding: 6rem 0 4rem;
	}

	.badge-container {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.badge {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #ff0080;
		color: #ff0080;
		font-size: 0.7rem;
		letter-spacing: 0.2em;
		text-shadow: 0 0 10px #ff0080;
	}

	.badge.alt {
		border-color: #00ffff;
		color: #00ffff;
		text-shadow: 0 0 10px #00ffff;
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.line1 {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(255, 255, 255, 0.5);
		letter-spacing: 0.5em;
	}

	.line2 {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		color: #fff;
		text-shadow:
			0 0 10px #ff0080,
			0 0 20px #ff0080,
			0 0 40px #ff0080,
			3px 3px 0 #00ffff,
			-3px -3px 0 #ff0080;
		animation: text-flicker 3s ease-in-out infinite;
	}

	@keyframes text-flicker {
		0%, 100% { opacity: 1; }
		92% { opacity: 1; }
		93% { opacity: 0.8; }
		94% { opacity: 1; }
		95% { opacity: 0.9; }
		96% { opacity: 1; }
	}

	.line3 {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.3em;
		color: #00ffff;
		text-shadow: 0 0 20px #00ffff;
	}

	.tagline {
		margin-top: 2rem;
		font-size: 1rem;
		display: flex;
		gap: 1rem;
	}

	.neon-text {
		padding: 0.25rem 0.5rem;
	}

	.neon-text.pink {
		color: #ff0080;
		text-shadow: 0 0 10px #ff0080;
	}

	.neon-text.cyan {
		color: #00ffff;
		text-shadow: 0 0 10px #00ffff;
	}

	/* Quote */
	.quote-section {
		padding: 4rem 2rem;
		max-width: 700px;
	}

	.quote-box {
		padding: 2rem;
		border: 1px solid rgba(255, 0, 128, 0.3);
		background: rgba(10, 10, 20, 0.8);
	}

	blockquote {
		font-size: 1.1rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		margin: 0 0 1rem;
	}

	cite {
		font-size: 0.85rem;
		color: #ff0080;
		font-style: normal;
	}

	/* Features */
	.features-section {
		padding: 4rem 2rem;
		text-align: center;
	}

	.features-section h2 {
		font-size: 0.8rem;
		letter-spacing: 0.3em;
		color: #00ffff;
		margin-bottom: 2rem;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		max-width: 800px;
	}

	.feature-card {
		padding: 1.5rem;
		background: rgba(10, 10, 20, 0.6);
		border: 1px solid rgba(0, 255, 255, 0.2);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		transition: all 0.3s;
	}

	.feature-card:hover {
		border-color: #ff0080;
		box-shadow: 0 0 20px rgba(255, 0, 128, 0.3);
	}

	.feature-id {
		font-size: 0.6rem;
		color: #ff0080;
		letter-spacing: 0.2em;
	}

	.feature-name {
		font-size: 0.9rem;
		color: white;
	}

	/* Install */
	.install-section {
		padding: 4rem 2rem;
	}

	.terminal-box {
		background: rgba(10, 10, 20, 0.9);
		border: 1px solid #00ffff;
		overflow: hidden;
	}

	.terminal-header {
		padding: 0.5rem 1rem;
		background: rgba(0, 255, 255, 0.1);
		border-bottom: 1px solid rgba(0, 255, 255, 0.3);
		font-size: 0.7rem;
		color: #00ffff;
	}

	.terminal-box code {
		display: block;
		padding: 1.5rem;
		font-size: 0.85rem;
		color: #ff0080;
	}
</style>
