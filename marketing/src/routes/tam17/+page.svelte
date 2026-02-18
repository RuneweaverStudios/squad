<script lang="ts">
	/**
	 * TAM17: Xel'Naga Chamber
	 * Ancient alien artifact chamber with energy conduits and sacred geometry
	 */
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let artifactPower = $state(0);

	interface Conduit {
		points: { x: number; y: number }[];
		energy: number;
		speed: number;
		color: string;
	}

	interface Glyph {
		x: number;
		y: number;
		size: number;
		rotation: number;
		rotSpeed: number;
		type: number;
		pulseOffset: number;
	}

	function playActivationSequence() {
		if (!audioContext) return;

		// Ascending activation tones
		const notes = [220, 330, 440, 550, 660, 880];
		notes.forEach((freq, i) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();
			const filter = audioContext!.createBiquadFilter();

			osc.type = i % 2 === 0 ? 'sine' : 'triangle';
			osc.frequency.setValueAtTime(freq, audioContext!.currentTime + i * 0.15);

			filter.type = 'bandpass';
			filter.frequency.setValueAtTime(freq * 2, audioContext!.currentTime + i * 0.15);
			filter.Q.setValueAtTime(3, audioContext!.currentTime);

			gain.gain.setValueAtTime(0, audioContext!.currentTime + i * 0.15);
			gain.gain.linearRampToValueAtTime(0.08, audioContext!.currentTime + i * 0.15 + 0.05);
			gain.gain.exponentialRampToValueAtTime(0.001, audioContext!.currentTime + i * 0.15 + 0.4);

			osc.connect(filter);
			filter.connect(gain);
			gain.connect(audioContext!.destination);

			osc.start(audioContext!.currentTime + i * 0.15);
			osc.stop(audioContext!.currentTime + i * 0.15 + 0.5);
		});
	}

	function playAmbientHum() {
		if (!audioContext) return;

		// Complex layered ambient
		const layers = [
			{ freq: 55, type: 'sine' as OscillatorType, gain: 0.03 },
			{ freq: 110, type: 'triangle' as OscillatorType, gain: 0.02 },
			{ freq: 165, type: 'sine' as OscillatorType, gain: 0.015 },
			{ freq: 220, type: 'sine' as OscillatorType, gain: 0.01 }
		];

		layers.forEach((layer) => {
			const osc = audioContext!.createOscillator();
			const gain = audioContext!.createGain();

			osc.type = layer.type;
			osc.frequency.setValueAtTime(layer.freq, audioContext!.currentTime);

			const lfo = audioContext!.createOscillator();
			const lfoGain = audioContext!.createGain();
			lfo.frequency.setValueAtTime(0.2 + Math.random() * 0.3, audioContext!.currentTime);
			lfoGain.gain.setValueAtTime(layer.freq * 0.01, audioContext!.currentTime);
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);

			gain.gain.setValueAtTime(layer.gain, audioContext!.currentTime);

			osc.connect(gain);
			gain.connect(audioContext!.destination);

			osc.start();
			lfo.start();
		});
	}

	function playEnergyPulse() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const osc2 = audioContext.createOscillator();
		const gain = audioContext.createGain();
		const filter = audioContext.createBiquadFilter();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(150, audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
		osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.4);

		osc2.type = 'square';
		osc2.frequency.setValueAtTime(300, audioContext.currentTime);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(1000, audioContext.currentTime);
		filter.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.4);

		gain.gain.setValueAtTime(0.1, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

		osc.connect(filter);
		osc2.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc2.start();
		osc.stop(audioContext.currentTime + 0.5);
		osc2.stop(audioContext.currentTime + 0.5);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
			playAmbientHum();
			playActivationSequence();
		}
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let width = window.innerWidth;
		let height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;

		const cx = width / 2;
		const cy = height / 2;

		// Energy conduits
		const conduits: Conduit[] = [];
		const conduitColors = ['#00ffaa', '#00aaff', '#aa88ff', '#ffaa00'];

		// Create conduit network
		for (let i = 0; i < 12; i++) {
			const angle = (i / 12) * Math.PI * 2;
			const points = [];
			const segments = 5 + Math.floor(Math.random() * 3);

			for (let j = 0; j <= segments; j++) {
				const t = j / segments;
				const r = 100 + t * 200;
				const wobble = Math.sin(t * Math.PI * 2) * 30;
				points.push({
					x: cx + Math.cos(angle + t * 0.5) * r + wobble,
					y: cy + Math.sin(angle + t * 0.5) * r
				});
			}

			conduits.push({
				points,
				energy: Math.random(),
				speed: 0.5 + Math.random() * 1,
				color: conduitColors[i % conduitColors.length]
			});
		}

		// Floating glyphs
		const glyphs: Glyph[] = [];
		for (let i = 0; i < 15; i++) {
			const angle = Math.random() * Math.PI * 2;
			const r = 150 + Math.random() * 200;
			glyphs.push({
				x: cx + Math.cos(angle) * r,
				y: cy + Math.sin(angle) * r,
				size: 30 + Math.random() * 40,
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.01,
				type: Math.floor(Math.random() * 5),
				pulseOffset: Math.random() * Math.PI * 2
			});
		}

		let time = 0;
		let pulseTimer = 0;

		function drawGlyph(x: number, y: number, size: number, rotation: number, type: number, alpha: number) {
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(rotation);
			ctx.strokeStyle = `rgba(0, 255, 170, ${alpha})`;
			ctx.fillStyle = `rgba(0, 255, 170, ${alpha * 0.3})`;
			ctx.lineWidth = 2;

			switch (type) {
				case 0: // Triangle with inner circle
					ctx.beginPath();
					ctx.moveTo(0, -size / 2);
					ctx.lineTo(size / 2, size / 2);
					ctx.lineTo(-size / 2, size / 2);
					ctx.closePath();
					ctx.stroke();
					ctx.beginPath();
					ctx.arc(0, size / 6, size / 4, 0, Math.PI * 2);
					ctx.stroke();
					break;

				case 1: // Hexagon with spokes
					ctx.beginPath();
					for (let i = 0; i < 6; i++) {
						const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
						const px = Math.cos(a) * size / 2;
						const py = Math.sin(a) * size / 2;
						if (i === 0) ctx.moveTo(px, py);
						else ctx.lineTo(px, py);
					}
					ctx.closePath();
					ctx.stroke();
					for (let i = 0; i < 6; i++) {
						const a = (i / 6) * Math.PI * 2;
						ctx.beginPath();
						ctx.moveTo(0, 0);
						ctx.lineTo(Math.cos(a) * size / 2, Math.sin(a) * size / 2);
						ctx.stroke();
					}
					break;

				case 2: // Diamond with cross
					ctx.beginPath();
					ctx.moveTo(0, -size / 2);
					ctx.lineTo(size / 2, 0);
					ctx.lineTo(0, size / 2);
					ctx.lineTo(-size / 2, 0);
					ctx.closePath();
					ctx.stroke();
					ctx.beginPath();
					ctx.moveTo(0, -size / 3);
					ctx.lineTo(0, size / 3);
					ctx.moveTo(-size / 3, 0);
					ctx.lineTo(size / 3, 0);
					ctx.stroke();
					break;

				case 3: // Circle with inner pattern
					ctx.beginPath();
					ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
					ctx.stroke();
					ctx.beginPath();
					ctx.arc(0, 0, size / 4, 0, Math.PI * 2);
					ctx.fill();
					for (let i = 0; i < 4; i++) {
						const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
						ctx.beginPath();
						ctx.moveTo(Math.cos(a) * size / 4, Math.sin(a) * size / 4);
						ctx.lineTo(Math.cos(a) * size / 2, Math.sin(a) * size / 2);
						ctx.stroke();
					}
					break;

				case 4: // Star pattern
					ctx.beginPath();
					for (let i = 0; i < 8; i++) {
						const a = (i / 8) * Math.PI * 2;
						const r = i % 2 === 0 ? size / 2 : size / 4;
						const px = Math.cos(a) * r;
						const py = Math.sin(a) * r;
						if (i === 0) ctx.moveTo(px, py);
						else ctx.lineTo(px, py);
					}
					ctx.closePath();
					ctx.stroke();
					ctx.beginPath();
					ctx.arc(0, 0, size / 6, 0, Math.PI * 2);
					ctx.fill();
					break;
			}

			ctx.restore();
		}

		function drawConduit(conduit: Conduit, time: number) {
			const { points, energy, speed, color } = conduit;

			// Draw conduit path
			ctx.strokeStyle = `${color}33`;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < points.length; i++) {
				ctx.lineTo(points[i].x, points[i].y);
			}
			ctx.stroke();

			// Draw energy flowing through
			const energyPos = (time * speed + energy * 10) % points.length;
			const idx = Math.floor(energyPos);
			const frac = energyPos - idx;

			if (idx < points.length - 1) {
				const ex = points[idx].x + (points[idx + 1].x - points[idx].x) * frac;
				const ey = points[idx].y + (points[idx + 1].y - points[idx].y) * frac;

				// Energy glow
				const gradient = ctx.createRadialGradient(ex, ey, 0, ex, ey, 20);
				gradient.addColorStop(0, color);
				gradient.addColorStop(1, 'transparent');
				ctx.fillStyle = gradient;
				ctx.beginPath();
				ctx.arc(ex, ey, 20, 0, Math.PI * 2);
				ctx.fill();

				// Energy core
				ctx.fillStyle = '#ffffff';
				ctx.beginPath();
				ctx.arc(ex, ey, 4, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		function drawCentralArtifact(time: number) {
			// Outer ring
			ctx.strokeStyle = `rgba(0, 255, 170, ${0.4 + Math.sin(time * 2) * 0.2})`;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(cx, cy, 100, 0, Math.PI * 2);
			ctx.stroke();

			// Rotating inner rings
			for (let i = 0; i < 3; i++) {
				ctx.save();
				ctx.translate(cx, cy);
				ctx.rotate(time * (0.2 + i * 0.1) * (i % 2 === 0 ? 1 : -1));

				ctx.strokeStyle = `rgba(0, 170, 255, ${0.3 + i * 0.1})`;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(0, 0, 70 - i * 15, 0, Math.PI * 2);
				ctx.stroke();

				// Decorative notches
				for (let j = 0; j < 8; j++) {
					const a = (j / 8) * Math.PI * 2;
					const r1 = 70 - i * 15 - 5;
					const r2 = 70 - i * 15 + 5;
					ctx.beginPath();
					ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
					ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
					ctx.stroke();
				}

				ctx.restore();
			}

			// Central gem
			const gemPulse = Math.sin(time * 3) * 0.3 + 0.7;
			const gemGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
			gemGradient.addColorStop(0, `rgba(255, 255, 255, ${gemPulse})`);
			gemGradient.addColorStop(0.3, `rgba(0, 255, 200, ${gemPulse * 0.8})`);
			gemGradient.addColorStop(1, 'rgba(0, 100, 150, 0)');
			ctx.fillStyle = gemGradient;
			ctx.beginPath();
			ctx.arc(cx, cy, 30, 0, Math.PI * 2);
			ctx.fill();

			// Sacred geometry overlay
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(time * 0.1);

			ctx.strokeStyle = `rgba(0, 255, 170, ${0.5 + Math.sin(time * 2) * 0.2})`;
			ctx.lineWidth = 1.5;

			// Inner triangle
			ctx.beginPath();
			for (let i = 0; i < 3; i++) {
				const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
				const x = Math.cos(a) * 50;
				const y = Math.sin(a) * 50;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();

			// Inverted triangle
			ctx.beginPath();
			for (let i = 0; i < 3; i++) {
				const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
				const x = Math.cos(a) * 50;
				const y = Math.sin(a) * 50;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();

			ctx.restore();
		}

		function animate() {
			time += 0.016;
			pulseTimer += 0.016;

			// Background
			const bgGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) / 2);
			bgGradient.addColorStop(0, '#0a1520');
			bgGradient.addColorStop(1, '#020508');
			ctx.fillStyle = bgGradient;
			ctx.fillRect(0, 0, width, height);

			// Draw conduits
			conduits.forEach((c) => drawConduit(c, time));

			// Draw central artifact
			drawCentralArtifact(time);

			// Draw floating glyphs
			glyphs.forEach((g) => {
				g.rotation += g.rotSpeed;
				const alpha = 0.4 + Math.sin(time * 2 + g.pulseOffset) * 0.3;
				drawGlyph(g.x, g.y, g.size, g.rotation, g.type, alpha);
			});

			// Update artifact power
			artifactPower = (Math.sin(time * 1.5) * 0.5 + 0.5) * 100;

			// Periodic sound
			if (pulseTimer > 3 && audioContext) {
				playEnergyPulse();
				pulseTimer = 0;
			}

			requestAnimationFrame(animate);
		}

		animate();

		function handleClick() {
			playActivationSequence();
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
	<title>TAM17: Xel'Naga Chamber | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam17">
	<canvas bind:this={canvas}></canvas>

	<!-- Audio -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '◆ ARTIFACT ACTIVE' : '◇ ACTIVATE ARTIFACT'}
	</button>

	<!-- Power meter -->
	<div class="power-meter">
		<div class="meter-glyph">
			<svg viewBox="0 0 60 60">
				<polygon points="30,5 55,30 30,55 5,30" fill="none" stroke="currentColor" stroke-width="2"/>
				<circle cx="30" cy="30" r="10" fill="currentColor" opacity="0.5"/>
			</svg>
		</div>
		<div class="meter-info">
			<span class="meter-label">ARTIFACT POWER</span>
			<div class="meter-bar">
				<div class="meter-fill" style="width: {artifactPower}%"></div>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="content">
		<header>
			<div class="artifact-badge">
				<svg viewBox="0 0 80 80" class="badge-symbol">
					<polygon points="40,5 75,40 40,75 5,40" fill="none" stroke="currentColor" stroke-width="2"/>
					<polygon points="40,15 65,40 40,65 15,40" fill="none" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="40" cy="40" r="12" fill="none" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="40" cy="40" r="5" fill="currentColor"/>
				</svg>
				<span>ARTIFACT CHAMBER</span>
			</div>

			<h1>
				<span class="the">THE</span>
				<span class="alien">ALIEN</span>
				<span class="manual">MANUAL</span>
			</h1>

			<p class="subtitle">KNOWLEDGE OF THE CREATORS</p>
		</header>

		<section class="quote-section">
			<div class="chamber-frame">
				<div class="frame-glyph tl">◇</div>
				<div class="frame-glyph tr">◇</div>
				<div class="frame-glyph bl">◇</div>
				<div class="frame-glyph br">◇</div>

				<blockquote>
					"Clearly some powerful alien tool was handed around except it comes with no manual..."
				</blockquote>
				<cite>— PRESERVER KARPATHY</cite>
			</div>
		</section>

		<section class="systems-section">
			<div class="systems-header">
				<span class="header-wing"></span>
				<span class="header-text">ARTIFACT SYSTEMS</span>
				<span class="header-wing"></span>
			</div>

			<div class="systems-grid">
				<div class="system-node">
					<div class="node-ring"></div>
					<span class="node-name">Task Architecture</span>
					<span class="node-desc">Temporal matrices</span>
				</div>
				<div class="system-node">
					<div class="node-ring"></div>
					<span class="node-name">Agent Coordination</span>
					<span class="node-desc">Psionic conduits</span>
				</div>
				<div class="system-node">
					<div class="node-ring"></div>
					<span class="node-name">Swarm Intelligence</span>
					<span class="node-desc">Collective harmony</span>
				</div>
				<div class="system-node">
					<div class="node-ring"></div>
					<span class="node-name">Workflow Automation</span>
					<span class="node-desc">Energy cascades</span>
				</div>
			</div>
		</section>

		<section class="install-section">
			<div class="install-conduit">
				<div class="conduit-end left">◆</div>
				<div class="conduit-body">
					<code>git clone https://github.com/jomarchy/squad.git</code>
				</div>
				<div class="conduit-end right">◆</div>
			</div>
		</section>
	</div>
</div>

<style>
	.tam17 {
		min-height: 100vh;
		background: #020508;
		color: #00ffaa;
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
		background: rgba(0, 255, 170, 0.1);
		border: 1px solid rgba(0, 255, 170, 0.4);
		color: #00ffaa;
		font-family: inherit;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		cursor: pointer;
	}

	.audio-btn.active {
		background: rgba(0, 255, 170, 0.15);
		box-shadow: 0 0 30px rgba(0, 255, 170, 0.3);
	}

	/* Power meter */
	.power-meter {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.meter-glyph {
		width: 50px;
		height: 50px;
		color: #00ffaa;
		animation: glyph-spin 10s linear infinite;
	}

	@keyframes glyph-spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.meter-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.meter-label {
		font-size: 0.6rem;
		color: rgba(0, 255, 170, 0.6);
		letter-spacing: 0.2em;
	}

	.meter-bar {
		width: 120px;
		height: 6px;
		background: rgba(0, 255, 170, 0.2);
	}

	.meter-fill {
		height: 100%;
		background: linear-gradient(90deg, #00aa88, #00ffaa);
		box-shadow: 0 0 10px #00ffaa;
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
		pointer-events: none;
	}

	.content > * {
		pointer-events: auto;
	}

	header {
		text-align: center;
		padding: 6rem 0 3rem;
	}

	.artifact-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.badge-symbol {
		width: 60px;
		height: 60px;
		color: #00ffaa;
		animation: badge-pulse 3s ease-in-out infinite;
	}

	@keyframes badge-pulse {
		0%, 100% { transform: scale(1); opacity: 0.8; }
		50% { transform: scale(1.1); opacity: 1; }
	}

	.artifact-badge span {
		font-size: 0.7rem;
		letter-spacing: 0.3em;
		color: rgba(0, 255, 170, 0.7);
	}

	h1 {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 0.9;
	}

	.the {
		font-size: clamp(1rem, 3vw, 1.5rem);
		color: rgba(0, 255, 170, 0.4);
		letter-spacing: 0.5em;
	}

	.alien {
		font-size: clamp(4rem, 15vw, 10rem);
		font-weight: 900;
		background: linear-gradient(180deg, #00ffcc 0%, #00aa88 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 30px rgba(0, 255, 170, 0.5));
	}

	.manual {
		font-size: clamp(1.5rem, 5vw, 3rem);
		letter-spacing: 0.4em;
		color: rgba(0, 255, 170, 0.6);
	}

	.subtitle {
		margin-top: 1.5rem;
		font-size: 0.8rem;
		color: rgba(0, 255, 170, 0.4);
		letter-spacing: 0.25em;
	}

	/* Quote */
	.quote-section {
		padding: 3rem 2rem;
	}

	.chamber-frame {
		position: relative;
		max-width: 650px;
		padding: 3rem;
		background: rgba(0, 30, 30, 0.6);
		border: 1px solid rgba(0, 255, 170, 0.3);
	}

	.frame-glyph {
		position: absolute;
		font-size: 1.2rem;
		color: #00ffaa;
	}

	.frame-glyph.tl { top: 8px; left: 12px; }
	.frame-glyph.tr { top: 8px; right: 12px; }
	.frame-glyph.bl { bottom: 8px; left: 12px; }
	.frame-glyph.br { bottom: 8px; right: 12px; }

	blockquote {
		font-size: 1.1rem;
		line-height: 1.8;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		text-align: center;
		margin: 0 0 1.5rem;
	}

	cite {
		display: block;
		text-align: center;
		font-size: 0.8rem;
		color: #00ffaa;
		font-style: normal;
	}

	/* Systems */
	.systems-section {
		padding: 3rem 2rem;
		width: 100%;
		max-width: 900px;
	}

	.systems-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		margin-bottom: 2.5rem;
	}

	.header-wing {
		width: 60px;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(0, 255, 170, 0.5));
	}

	.header-wing:last-child {
		background: linear-gradient(90deg, rgba(0, 255, 170, 0.5), transparent);
	}

	.header-text {
		font-size: 0.8rem;
		color: rgba(0, 255, 170, 0.7);
		letter-spacing: 0.2em;
	}

	.systems-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
	}

	.system-node {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: rgba(0, 30, 30, 0.5);
		border: 1px solid rgba(0, 255, 170, 0.2);
	}

	.node-ring {
		width: 40px;
		height: 40px;
		border: 2px solid #00ffaa;
		border-radius: 50%;
		position: relative;
	}

	.node-ring::before {
		content: '';
		position: absolute;
		inset: 8px;
		background: rgba(0, 255, 170, 0.3);
		border-radius: 50%;
	}

	.node-name {
		font-size: 0.9rem;
		color: white;
	}

	.node-desc {
		font-size: 0.75rem;
		color: rgba(0, 255, 170, 0.6);
	}

	/* Install */
	.install-section {
		padding: 3rem 2rem;
	}

	.install-conduit {
		display: flex;
		align-items: center;
		gap: 0;
	}

	.conduit-end {
		color: #00ffaa;
		font-size: 1.5rem;
		padding: 0.5rem;
	}

	.conduit-body {
		padding: 1.5rem 2rem;
		background: rgba(0, 30, 30, 0.8);
		border-top: 2px solid rgba(0, 255, 170, 0.4);
		border-bottom: 2px solid rgba(0, 255, 170, 0.4);
	}

	.conduit-body code {
		color: #00ffaa;
		font-size: 0.9rem;
	}
</style>
