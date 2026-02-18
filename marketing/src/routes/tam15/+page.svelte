<script lang="ts">
	/**
	 * TAM15: Ancient Artifact
	 * Golden runes, ancient inscriptions, mystical energy
	 */
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);

	// Ancient rune characters (custom glyphs)
	const runes = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛈ', 'ᛇ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛟ', 'ᛞ'];

	interface FloatingRune {
		x: number;
		y: number;
		char: string;
		size: number;
		alpha: number;
		rotation: number;
		rotSpeed: number;
		floatSpeed: number;
		floatOffset: number;
	}

	interface EnergyParticle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		maxLife: number;
	}

	function playRuneActivation() {
		if (!audioContext) return;

		// Mystical chime
		const frequencies = [523, 659, 784, 1047];
		frequencies.forEach((freq, i) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime + i * 0.1);

			gain.gain.setValueAtTime(0, audioContext!.currentTime + i * 0.1);
			gain.gain.linearRampToValueAtTime(0.08, audioContext!.currentTime + i * 0.1 + 0.05);
			gain.gain.exponentialRampToValueAtTime(0.001, audioContext!.currentTime + i * 0.1 + 0.5);

			osc.connect(gain);
			gain.connect(audioContext!.destination);

			osc.start(audioContext!.currentTime + i * 0.1);
			osc.stop(audioContext!.currentTime + i * 0.1 + 0.6);
		});
	}

	function playAmbientMystic() {
		if (!audioContext) return;

		// Deep mystical pad
		const baseFreqs = [110, 165, 220, 330];
		baseFreqs.forEach((freq) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();
			const filter = audioContext!.createBiquadFilter();

			osc.type = 'triangle';
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime);

			const lfo = audioContext!.createOscillator();
			const lfoGain = audioContext!.createGain();
			lfo.frequency.setValueAtTime(0.3, audioContext!.currentTime);
			lfoGain.gain.setValueAtTime(2, audioContext!.currentTime);
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);

			filter.type = 'lowpass';
			filter.frequency.setValueAtTime(500, audioContext!.currentTime);

			gain.gain.setValueAtTime(0.02, audioContext!.currentTime);

			osc.connect(filter);
			filter.connect(gain);
			gain.connect(audioContext!.destination);

			osc.start();
			lfo.start();
		});
	}

	function playEnergyBurst() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(200, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
		osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);

		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(400, audioContext.currentTime);
		osc2.frequency.exponentialRampToValueAtTime(1600, audioContext.currentTime + 0.1);

		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(600, audioContext.currentTime);
		filter.Q.setValueAtTime(5, audioContext.currentTime);

		gain.gain.setValueAtTime(0.1, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);

		osc.connect(filter);
		osc2.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc2.start();
		osc.stop(audioContext.currentTime + 0.4);
		osc2.stop(audioContext.currentTime + 0.4);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playAmbientMystic();
			playRuneActivation();
		}
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let width = window.innerWidth;
		let height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;

		// Floating runes
		const floatingRunes: FloatingRune[] = [];
		for (let i = 0; i < 30; i++) {
			floatingRunes.push({
				x: Math.random() * width,
				y: Math.random() * height,
				char: runes[Math.floor(Math.random() * runes.length)],
				size: 20 + Math.random() * 40,
				alpha: 0.1 + Math.random() * 0.4,
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.02,
				floatSpeed: 0.5 + Math.random() * 1,
				floatOffset: Math.random() * Math.PI * 2
			});
		}

		// Energy particles
		const particles: EnergyParticle[] = [];

		// Central artifact circle
		const centerX = width / 2;
		const centerY = height / 2;

		let time = 0;
		let soundCooldown = 0;

		function drawCircleRunes(cx: number, cy: number, radius: number, count: number, offset: number) {
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(offset);

			for (let i = 0; i < count; i++) {
				const angle = (i / count) * Math.PI * 2;
				const x = Math.cos(angle) * radius;
				const y = Math.sin(angle) * radius;

				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(angle + Math.PI / 2);

				const pulse = Math.sin(time * 2 + i * 0.5) * 0.3 + 0.7;
				ctx.fillStyle = `rgba(255, 200, 100, ${pulse * 0.8})`;
				ctx.font = '24px serif';
				ctx.textAlign = 'center';
				ctx.fillText(runes[i % runes.length], 0, 0);

				ctx.restore();
			}

			ctx.restore();
		}

		function drawOrnateCircle(cx: number, cy: number, radius: number, segments: number) {
			ctx.beginPath();
			for (let i = 0; i <= segments; i++) {
				const angle = (i / segments) * Math.PI * 2;
				const wobble = Math.sin(angle * 8 + time) * 3;
				const r = radius + wobble;
				const x = cx + Math.cos(angle) * r;
				const y = cy + Math.sin(angle) * r;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
		}

		function animate() {
			time += 0.016;
			soundCooldown = Math.max(0, soundCooldown - 0.016);

			// Dark background with gradient
			const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) / 2);
			gradient.addColorStop(0, '#1a1005');
			gradient.addColorStop(1, '#050200');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);

			// Draw floating runes
			floatingRunes.forEach((rune) => {
				ctx.save();
				ctx.translate(rune.x, rune.y);
				ctx.rotate(rune.rotation);

				const pulse = Math.sin(time * rune.floatSpeed + rune.floatOffset) * 0.2 + 0.8;

				// Glow
				ctx.shadowBlur = 20;
				ctx.shadowColor = `rgba(255, 180, 50, ${rune.alpha * pulse})`;

				ctx.fillStyle = `rgba(255, 200, 100, ${rune.alpha * pulse})`;
				ctx.font = `${rune.size}px serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(rune.char, 0, 0);

				ctx.restore();

				// Update
				rune.rotation += rune.rotSpeed;
				rune.y += Math.sin(time * rune.floatSpeed + rune.floatOffset) * 0.5;
				rune.x += Math.cos(time * rune.floatSpeed * 0.5 + rune.floatOffset) * 0.3;

				// Wrap
				if (rune.x < -50) rune.x = width + 50;
				if (rune.x > width + 50) rune.x = -50;
				if (rune.y < -50) rune.y = height + 50;
				if (rune.y > height + 50) rune.y = -50;
			});

			// Central artifact
			ctx.save();
			ctx.translate(centerX, centerY);

			// Outer ornate ring
			ctx.strokeStyle = `rgba(255, 180, 50, 0.3)`;
			ctx.lineWidth = 3;
			drawOrnateCircle(0, 0, 180, 100);
			ctx.stroke();

			// Middle ring with runes
			ctx.strokeStyle = `rgba(255, 200, 100, 0.5)`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(0, 0, 150, 0, Math.PI * 2);
			ctx.stroke();

			// Inner rings
			ctx.strokeStyle = `rgba(255, 200, 100, 0.4)`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(0, 0, 120, 0, Math.PI * 2);
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(0, 0, 80, 0, Math.PI * 2);
			ctx.stroke();

			// Decorative lines
			for (let i = 0; i < 12; i++) {
				const angle = (i / 12) * Math.PI * 2 + time * 0.1;
				ctx.strokeStyle = `rgba(255, 180, 50, ${0.3 + Math.sin(time * 2 + i) * 0.2})`;
				ctx.beginPath();
				ctx.moveTo(Math.cos(angle) * 85, Math.sin(angle) * 85);
				ctx.lineTo(Math.cos(angle) * 145, Math.sin(angle) * 145);
				ctx.stroke();
			}

			// Central eye/gem
			const eyeGlow = Math.sin(time * 3) * 0.3 + 0.7;
			const eyeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
			eyeGradient.addColorStop(0, `rgba(255, 255, 200, ${eyeGlow})`);
			eyeGradient.addColorStop(0.5, `rgba(255, 180, 50, ${eyeGlow * 0.8})`);
			eyeGradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
			ctx.fillStyle = eyeGradient;
			ctx.beginPath();
			ctx.arc(0, 0, 40, 0, Math.PI * 2);
			ctx.fill();

			// Diamond in center
			ctx.fillStyle = `rgba(255, 220, 150, ${eyeGlow})`;
			ctx.beginPath();
			ctx.moveTo(0, -20);
			ctx.lineTo(15, 0);
			ctx.lineTo(0, 20);
			ctx.lineTo(-15, 0);
			ctx.closePath();
			ctx.fill();

			ctx.restore();

			// Draw rotating rune circles
			drawCircleRunes(centerX, centerY, 150, 12, time * 0.2);
			drawCircleRunes(centerX, centerY, 100, 8, -time * 0.3);

			// Energy particles
			if (Math.random() < 0.3) {
				const angle = Math.random() * Math.PI * 2;
				particles.push({
					x: centerX + Math.cos(angle) * 200,
					y: centerY + Math.sin(angle) * 200,
					vx: -Math.cos(angle) * 2,
					vy: -Math.sin(angle) * 2,
					life: 60,
					maxLife: 60
				});
			}

			// Update and draw particles
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life--;

				const alpha = p.life / p.maxLife;
				ctx.fillStyle = `rgba(255, 200, 100, ${alpha * 0.8})`;
				ctx.beginPath();
				ctx.arc(p.x, p.y, 3 * alpha, 0, Math.PI * 2);
				ctx.fill();

				if (p.life <= 0) {
					particles.splice(i, 1);
				}
			}

			// Sound trigger
			if (soundCooldown <= 0 && Math.sin(time * 2) > 0.95) {
				playEnergyBurst();
				soundCooldown = 2;
			}

			requestAnimationFrame(animate);
		}

		animate();

		function handleClick(e: MouseEvent) {
			playRuneActivation();

			// Spawn burst of particles at click
			for (let i = 0; i < 20; i++) {
				const angle = (i / 20) * Math.PI * 2;
				particles.push({
					x: e.clientX,
					y: e.clientY,
					vx: Math.cos(angle) * 3,
					vy: Math.sin(angle) * 3,
					life: 40,
					maxLife: 40
				});
			}
		}

		function handleResize() {
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = width;
			canvas.height = height;
		}

		window.addEventListener('click', handleClick);
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('click', handleClick);
			window.removeEventListener('resize', handleResize);
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM15: Ancient Artifact | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam15">
	<canvas bind:this={canvas}></canvas>

	<!-- Audio -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '◆ ARTIFACT AWAKENED' : '◇ AWAKEN ARTIFACT'}
	</button>

	<!-- Content -->
	<div class="content">
		<header>
			<div class="rune-border">
				<span class="rune">ᚠ</span>
				<span class="rune">ᚨ</span>
				<span class="rune">ᛏ</span>
				<span class="rune">ᛖ</span>
			</div>

			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>

			<div class="subtitle-runes">
				<span>ᛊ</span> CODEX OF POWER <span>ᛊ</span>
			</div>
		</header>

		<section class="quote-section">
			<div class="ancient-frame">
				<div class="frame-rune tl">ᚦ</div>
				<div class="frame-rune tr">ᚱ</div>
				<div class="frame-rune bl">ᚲ</div>
				<div class="frame-rune br">ᚷ</div>

				<blockquote>
					"Clearly some powerful alien tool was handed around except it comes with no manual..."
				</blockquote>
				<cite>— THE PROPHET KARPATHY</cite>
			</div>
		</section>

		<section class="powers-section">
			<div class="power-row">
				<div class="power-stone">
					<div class="stone-glyph">ᛏ</div>
					<span class="stone-name">Task Architecture</span>
				</div>
				<div class="power-stone">
					<div class="stone-glyph">ᚨ</div>
					<span class="stone-name">Agent Coordination</span>
				</div>
			</div>
			<div class="power-row">
				<div class="power-stone">
					<div class="stone-glyph">ᛊ</div>
					<span class="stone-name">Swarm Intelligence</span>
				</div>
				<div class="power-stone">
					<div class="stone-glyph">ᚹ</div>
					<span class="stone-name">Workflow Automation</span>
				</div>
			</div>
		</section>

		<section class="install-section">
			<div class="scroll-container">
				<div class="scroll-ornament top">᛭᛭᛭</div>
				<code>git clone https://github.com/jomarchy/squad.git</code>
				<div class="scroll-ornament bottom">᛭᛭᛭</div>
			</div>
		</section>
	</div>
</div>

<style>
	.tam15 {
		min-height: 100vh;
		background: #050200;
		color: #ffc864;
		font-family: ui-monospace, monospace;
		overflow: hidden;
	}

	canvas {
		position: fixed;
		inset: 0;
		z-index: 0;
	}

	/* Audio */
	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		padding: 0.75rem 1.25rem;
		background: rgba(255, 150, 50, 0.1);
		border: 2px solid rgba(255, 180, 100, 0.4);
		color: #ffc864;
		font-family: inherit;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		cursor: pointer;
	}

	.audio-btn.active {
		background: rgba(255, 180, 100, 0.2);
		box-shadow: 0 0 30px rgba(255, 150, 50, 0.4);
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
		padding: 6rem 0 3rem;
	}

	.rune-border {
		display: flex;
		justify-content: center;
		gap: 2rem;
		margin-bottom: 2rem;
	}

	.rune {
		font-size: 2rem;
		color: #ffc864;
		text-shadow: 0 0 20px rgba(255, 180, 100, 0.8);
		animation: rune-pulse 2s ease-in-out infinite;
	}

	.rune:nth-child(2) { animation-delay: 0.5s; }
	.rune:nth-child(3) { animation-delay: 1s; }
	.rune:nth-child(4) { animation-delay: 1.5s; }

	@keyframes rune-pulse {
		0%, 100% { opacity: 0.6; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.1); }
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(255, 200, 100, 0.5);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		color: #ffc864;
		text-shadow:
			0 0 20px rgba(255, 180, 100, 0.5),
			0 0 40px rgba(255, 150, 50, 0.3);
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.4em;
		color: rgba(255, 200, 100, 0.7);
	}

	.subtitle-runes {
		margin-top: 1.5rem;
		font-size: 0.85rem;
		color: rgba(255, 180, 100, 0.6);
		letter-spacing: 0.2em;
	}

	/* Quote */
	.quote-section {
		padding: 3rem 2rem;
	}

	.ancient-frame {
		position: relative;
		max-width: 650px;
		padding: 3rem;
		background: rgba(30, 20, 10, 0.7);
		border: 2px solid rgba(255, 180, 100, 0.3);
	}

	.frame-rune {
		position: absolute;
		font-size: 1.5rem;
		color: #ffc864;
		text-shadow: 0 0 10px rgba(255, 180, 100, 0.8);
	}

	.frame-rune.tl { top: 10px; left: 15px; }
	.frame-rune.tr { top: 10px; right: 15px; }
	.frame-rune.bl { bottom: 10px; left: 15px; }
	.frame-rune.br { bottom: 10px; right: 15px; }

	blockquote {
		font-size: 1.1rem;
		line-height: 1.8;
		color: rgba(255, 220, 180, 0.85);
		font-style: italic;
		text-align: center;
		margin: 0 0 1rem;
	}

	cite {
		display: block;
		text-align: center;
		font-size: 0.8rem;
		color: #ffc864;
		font-style: normal;
		letter-spacing: 0.1em;
	}

	/* Powers */
	.powers-section {
		padding: 3rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.power-row {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.power-stone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem 2rem;
		background: rgba(40, 30, 15, 0.8);
		border: 1px solid rgba(255, 180, 100, 0.3);
		min-width: 180px;
	}

	.stone-glyph {
		font-size: 2.5rem;
		color: #ffc864;
		text-shadow: 0 0 15px rgba(255, 180, 100, 0.7);
	}

	.stone-name {
		font-size: 0.85rem;
		color: rgba(255, 200, 150, 0.9);
	}

	/* Install */
	.install-section {
		padding: 3rem 2rem;
	}

	.scroll-container {
		text-align: center;
		padding: 2rem;
		background: rgba(30, 20, 10, 0.8);
		border: 2px solid rgba(255, 180, 100, 0.3);
	}

	.scroll-ornament {
		color: rgba(255, 180, 100, 0.5);
		font-size: 1.5rem;
		letter-spacing: 0.5em;
	}

	.scroll-ornament.top { margin-bottom: 1rem; }
	.scroll-ornament.bottom { margin-top: 1rem; }

	.scroll-container code {
		font-size: 0.9rem;
		color: #ffc864;
	}
</style>
