<script lang="ts">
	/**
	 * TAM10: Matrix Rain
	 * Classic matrix code rain with data stream sounds
	 */
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let dataRate = $state(0);

	const matrixChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>{}[]|/\\';

	interface Column {
		x: number;
		y: number;
		speed: number;
		chars: string[];
		length: number;
		brightness: number;
	}

	function playDataSound() {
		if (!audioContext) return;

		// Digital data stream sound
		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc.type = 'square';
		osc.frequency.setValueAtTime(100 + Math.random() * 200, audioContext.currentTime);

		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(500 + Math.random() * 1000, audioContext.currentTime);
		filter.Q.setValueAtTime(10, audioContext.currentTime);

		gain.gain.setValueAtTime(0.01, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);

		osc.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.05);
	}

	function playAmbientHum() {
		if (!audioContext) return;

		// Low frequency data center hum
		const osc1 = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(60, audioContext.currentTime);

		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(120, audioContext.currentTime);

		gain.gain.setValueAtTime(0.02, audioContext.currentTime);

		osc1.connect(gain);
		osc2.connect(gain);
		gain.connect(audioContext.destination);

		osc1.start();
		osc2.start();
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playAmbientHum();
		}
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let width = window.innerWidth;
		let height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;

		const fontSize = 14;
		const columnCount = Math.floor(width / fontSize);
		const columns: Column[] = [];

		// Initialize columns
		for (let i = 0; i < columnCount; i++) {
			const length = 10 + Math.floor(Math.random() * 20);
			const chars: string[] = [];
			for (let j = 0; j < length; j++) {
				chars.push(matrixChars[Math.floor(Math.random() * matrixChars.length)]);
			}
			columns.push({
				x: i * fontSize,
				y: Math.random() * height,
				speed: 2 + Math.random() * 4,
				chars,
				length,
				brightness: 0.5 + Math.random() * 0.5
			});
		}

		let frameCount = 0;
		let soundCooldown = 0;

		function animate() {
			frameCount++;
			soundCooldown = Math.max(0, soundCooldown - 1);

			// Fade effect
			ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
			ctx.fillRect(0, 0, width, height);

			ctx.font = `${fontSize}px monospace`;

			let activeChars = 0;

			columns.forEach((column) => {
				// Draw each character in the column
				column.chars.forEach((char, i) => {
					const y = column.y - i * fontSize;
					if (y > 0 && y < height) {
						activeChars++;

						// First character is brightest (white/cyan)
						if (i === 0) {
							ctx.fillStyle = `rgba(255, 255, 255, ${column.brightness})`;
						} else if (i < 3) {
							// Next few are bright green
							ctx.fillStyle = `rgba(0, 255, 100, ${column.brightness * (1 - i * 0.2)})`;
						} else {
							// Rest fade to darker green
							const alpha = Math.max(0.1, column.brightness * (1 - i / column.length));
							ctx.fillStyle = `rgba(0, 180, 80, ${alpha})`;
						}

						ctx.fillText(char, column.x, y);

						// Randomly change characters
						if (Math.random() < 0.02) {
							column.chars[i] = matrixChars[Math.floor(Math.random() * matrixChars.length)];
						}
					}
				});

				// Move column down
				column.y += column.speed;

				// Reset when off screen
				if (column.y - column.length * fontSize > height) {
					column.y = -column.length * fontSize * Math.random();
					column.speed = 2 + Math.random() * 4;
					column.brightness = 0.5 + Math.random() * 0.5;

					// Play sound occasionally on reset
					if (soundCooldown === 0 && Math.random() < 0.1) {
						playDataSound();
						soundCooldown = 5;
					}
				}
			});

			// Update data rate
			dataRate = Math.floor(activeChars * 60 / 1000);

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
	<title>TAM10: Matrix Rain | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam10">
	<canvas bind:this={canvas}></canvas>

	<!-- Data rate display -->
	<div class="data-rate">
		<span class="rate-label">DATA STREAM</span>
		<span class="rate-value">{dataRate} KB/s</span>
	</div>

	<!-- Audio control -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '[AUDIO: ENABLED]' : '[AUDIO: DISABLED]'}
	</button>

	<!-- Content -->
	<div class="content">
		<header>
			<span class="badge">&gt;&gt;&gt; ENTERING THE MATRIX &lt;&lt;&lt;</span>
			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>
			<p class="tagline">Wake up, developer...</p>
		</header>

		<section class="quote">
			<blockquote>
				"Clearly some powerful alien tool was handed around..."
			</blockquote>
			<cite>— @karpathy</cite>
		</section>

		<section class="features">
			<div class="feature-box">
				<div class="feature-line">
					<span class="prompt">&gt;</span>
					<span class="feature-text">task_architecture.init()</span>
				</div>
				<div class="feature-line">
					<span class="prompt">&gt;</span>
					<span class="feature-text">agent_coordination.sync()</span>
				</div>
				<div class="feature-line">
					<span class="prompt">&gt;</span>
					<span class="feature-text">swarm_intelligence.activate()</span>
				</div>
				<div class="feature-line">
					<span class="prompt">&gt;</span>
					<span class="feature-text">workflow_automation.run()</span>
				</div>
			</div>
		</section>

		<section class="install">
			<div class="install-prompt">
				<span class="cursor-blink">$</span>
				<code>git clone https://github.com/jomarchy/jat.git</code>
			</div>
		</section>

		<section class="pills">
			<button class="pill red">Red Pill: Read the docs</button>
			<button class="pill blue">Blue Pill: Stay ignorant</button>
		</section>
	</div>
</div>

<style>
	.tam10 {
		min-height: 100vh;
		background: #000;
		color: #00ff41;
		font-family: 'Courier New', monospace;
		overflow: hidden;
	}

	canvas {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	/* Data rate */
	.data-rate {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.rate-label {
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		color: rgba(0, 255, 65, 0.5);
	}

	.rate-value {
		font-size: 1.5rem;
		color: #00ff41;
		text-shadow: 0 0 10px #00ff41;
	}

	/* Audio button */
	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #00ff41;
		color: #00ff41;
		font-family: 'Courier New', monospace;
		font-size: 0.7rem;
		cursor: pointer;
		text-shadow: 0 0 5px #00ff41;
		transition: all 0.3s;
	}

	.audio-btn.active {
		background: rgba(0, 255, 65, 0.1);
		box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
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
		padding: 6rem 0 3rem;
	}

	.badge {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		border: 1px solid #00ff41;
		font-size: 0.7rem;
		letter-spacing: 0.2em;
		margin-bottom: 2rem;
		animation: badge-flicker 3s ease-in-out infinite;
	}

	@keyframes badge-flicker {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
		52% { opacity: 1; }
		54% { opacity: 0.8; }
		56% { opacity: 1; }
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(0, 255, 65, 0.4);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		color: #00ff41;
		text-shadow:
			0 0 10px #00ff41,
			0 0 20px #00ff41,
			0 0 40px #00ff41,
			0 0 80px #00ff41;
		animation: text-glow 2s ease-in-out infinite;
	}

	@keyframes text-glow {
		0%, 100% { text-shadow: 0 0 10px #00ff41, 0 0 20px #00ff41, 0 0 40px #00ff41; }
		50% { text-shadow: 0 0 20px #00ff41, 0 0 40px #00ff41, 0 0 60px #00ff41, 0 0 100px #00ff41; }
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.3em;
		color: rgba(0, 255, 65, 0.6);
	}

	.tagline {
		margin-top: 1.5rem;
		font-size: 0.9rem;
		color: rgba(0, 255, 65, 0.5);
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
		color: rgba(0, 255, 65, 0.7);
		font-style: italic;
	}

	cite {
		display: block;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: #00ff41;
		font-style: normal;
	}

	/* Features */
	.features {
		padding: 2rem;
	}

	.feature-box {
		background: rgba(0, 20, 10, 0.8);
		border: 1px solid rgba(0, 255, 65, 0.3);
		padding: 1.5rem;
	}

	.feature-line {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0;
		font-size: 0.85rem;
	}

	.prompt {
		color: #00ff41;
	}

	.feature-text {
		color: rgba(0, 255, 65, 0.8);
	}

	/* Install */
	.install {
		padding: 3rem 2rem;
	}

	.install-prompt {
		display: flex;
		gap: 0.75rem;
		padding: 1.5rem 2rem;
		background: rgba(0, 20, 10, 0.9);
		border: 1px solid #00ff41;
	}

	.cursor-blink {
		animation: cursor-blink 1s step-end infinite;
	}

	@keyframes cursor-blink {
		0%, 50% { opacity: 1; }
		51%, 100% { opacity: 0; }
	}

	.install-prompt code {
		color: #00ff41;
		font-size: 0.85rem;
	}

	/* Pills */
	.pills {
		display: flex;
		gap: 1.5rem;
		padding: 3rem 2rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.pill {
		padding: 1rem 2rem;
		font-family: 'Courier New', monospace;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.3s;
		border: none;
	}

	.pill.red {
		background: rgba(255, 0, 0, 0.2);
		border: 1px solid #ff0000;
		color: #ff0000;
		text-shadow: 0 0 10px #ff0000;
	}

	.pill.red:hover {
		background: rgba(255, 0, 0, 0.4);
		box-shadow: 0 0 30px rgba(255, 0, 0, 0.5);
	}

	.pill.blue {
		background: rgba(0, 100, 255, 0.2);
		border: 1px solid #0066ff;
		color: #0066ff;
		text-shadow: 0 0 10px #0066ff;
	}

	.pill.blue:hover {
		background: rgba(0, 100, 255, 0.4);
		box-shadow: 0 0 30px rgba(0, 100, 255, 0.5);
	}
</style>
