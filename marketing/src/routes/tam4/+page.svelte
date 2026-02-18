<script lang="ts">
	/**
	 * TAM4: Retro CRT
	 * Old-school terminal aesthetic with scan lines, phosphor glow, and typing sounds
	 */
	import { onMount } from 'svelte';

	let displayText = $state('');
	let cursorVisible = $state(true);
	let audioContext: AudioContext | null = null;
	let isAudioOn = $state(false);
	let currentSection = $state(0);

	const sections = [
		{ type: 'header', text: '╔══════════════════════════════════════════════════════════════╗' },
		{ type: 'header', text: '║           T H E   A L I E N   M A N U A L                    ║' },
		{ type: 'header', text: '║                    RETRO TERMINAL EDITION                    ║' },
		{ type: 'header', text: '╚══════════════════════════════════════════════════════════════╝' },
		{ type: 'blank', text: '' },
		{ type: 'system', text: '> SYSTEM BOOT SEQUENCE INITIATED...' },
		{ type: 'system', text: '> LOADING ALIEN PROTOCOLS...' },
		{ type: 'success', text: '> STATUS: OPERATIONAL' },
		{ type: 'blank', text: '' },
		{ type: 'quote', text: '"Clearly some powerful alien tool was handed around' },
		{ type: 'quote', text: ' except it comes with no manual and everyone has to' },
		{ type: 'quote', text: ' figure out how to hold it and operate it..."' },
		{ type: 'author', text: '                                        — @karpathy' },
		{ type: 'blank', text: '' },
		{ type: 'response', text: '> THIS IS THE MANUAL.' },
		{ type: 'blank', text: '' },
		{ type: 'divider', text: '════════════════════════════════════════════════════════════════' },
		{ type: 'label', text: '[CORE SYSTEMS]' },
		{ type: 'blank', text: '' },
		{ type: 'menu', text: '  [1] TASK ARCHITECTURE      - Dependency-aware work planning' },
		{ type: 'menu', text: '  [2] AGENT COORDINATION     - Multi-agent messaging system' },
		{ type: 'menu', text: '  [3] SWARM INTELLIGENCE     - Parallel agent orchestration' },
		{ type: 'menu', text: '  [4] WORKFLOW AUTOMATION    - Pattern-based auto-proceed' },
		{ type: 'blank', text: '' },
		{ type: 'divider', text: '════════════════════════════════════════════════════════════════' },
		{ type: 'label', text: '[INSTALLATION]' },
		{ type: 'blank', text: '' },
		{ type: 'command', text: '$ git clone https://github.com/jomarchy/squad.git ~/code/squad' },
		{ type: 'command', text: '$ cd ~/code/squad && ./install.sh' },
		{ type: 'command', text: '$ squad' },
		{ type: 'blank', text: '' },
		{ type: 'success', text: '> READY FOR INPUT_' }
	];

	function playTypingSound() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		// Random pitch for variety
		osc.frequency.setValueAtTime(800 + Math.random() * 400, audioContext.currentTime);
		osc.type = 'square';

		gain.gain.setValueAtTime(0.02, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);

		osc.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.05);
	}

	function playBeep() {
		if (!audioContext) return;

		const osc = audioContext.createOscillator();
		const gain = audioContext.createGain();

		osc.frequency.setValueAtTime(1000, audioContext.currentTime);
		osc.type = 'sine';

		gain.gain.setValueAtTime(0.05, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);

		osc.connect(gain);
		gain.connect(audioContext.destination);

		osc.start();
		osc.stop(audioContext.currentTime + 0.1);
	}

	function enableAudio() {
		if (!audioContext) {
			audioContext = new AudioContext();
			isAudioOn = true;
		}
	}

	onMount(() => {
		// Cursor blink
		const cursorInterval = setInterval(() => {
			cursorVisible = !cursorVisible;
		}, 500);

		// Type out text
		let sectionIndex = 0;
		let charIndex = 0;
		let currentText = '';

		const typeInterval = setInterval(() => {
			if (sectionIndex >= sections.length) {
				clearInterval(typeInterval);
				return;
			}

			const section = sections[sectionIndex];

			if (charIndex < section.text.length) {
				currentText += section.text[charIndex];
				charIndex++;
				playTypingSound();
			} else {
				currentText += '\n';
				sectionIndex++;
				charIndex = 0;
				currentSection = sectionIndex;

				if (section.type === 'success' || section.type === 'system') {
					playBeep();
				}
			}

			displayText = currentText;
		}, 20);

		return () => {
			clearInterval(cursorInterval);
			clearInterval(typeInterval);
			if (audioContext) audioContext.close();
		};
	});
</script>

<svelte:head>
	<title>TAM4: Retro CRT | THE ALIEN MANUAL</title>
</svelte:head>

<div class="tam4">
	<!-- CRT effects overlay -->
	<div class="crt-overlay">
		<div class="scanlines"></div>
		<div class="flicker"></div>
		<div class="vignette"></div>
	</div>

	<!-- Audio toggle -->
	<button class="audio-btn" onclick={enableAudio} class:active={isAudioOn}>
		{isAudioOn ? '[SOUND: ON]' : '[SOUND: OFF]'}
	</button>

	<!-- Terminal content -->
	<div class="terminal">
		<pre class="terminal-text">{displayText}<span class="cursor" class:visible={cursorVisible}>█</span></pre>
	</div>

	<!-- Phosphor glow effect -->
	<div class="phosphor-glow"></div>
</div>

<style>
	.tam4 {
		min-height: 100vh;
		background: #0a0a0a;
		font-family: 'Courier New', monospace;
		overflow: hidden;
		position: relative;
	}

	/* CRT Overlay Effects */
	.crt-overlay {
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
			rgba(0, 0, 0, 0.15) 0px,
			rgba(0, 0, 0, 0.15) 1px,
			transparent 1px,
			transparent 2px
		);
	}

	.flicker {
		position: absolute;
		inset: 0;
		background: rgba(18, 16, 16, 0);
		animation: flicker 0.15s infinite;
	}

	@keyframes flicker {
		0% { opacity: 0.27861; }
		5% { opacity: 0.34769; }
		10% { opacity: 0.23604; }
		15% { opacity: 0.90626; }
		20% { opacity: 0.18128; }
		25% { opacity: 0.83891; }
		30% { opacity: 0.65583; }
		35% { opacity: 0.67807; }
		40% { opacity: 0.26559; }
		45% { opacity: 0.84693; }
		50% { opacity: 0.96019; }
		55% { opacity: 0.08594; }
		60% { opacity: 0.20313; }
		65% { opacity: 0.71988; }
		70% { opacity: 0.53455; }
		75% { opacity: 0.37288; }
		80% { opacity: 0.71428; }
		85% { opacity: 0.70419; }
		90% { opacity: 0.7003; }
		95% { opacity: 0.36108; }
		100% { opacity: 0.24387; }
	}

	.vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 0%,
			transparent 60%,
			rgba(0, 0, 0, 0.8) 100%
		);
	}

	/* Phosphor glow */
	.phosphor-glow {
		position: fixed;
		inset: 0;
		z-index: 0;
		background: radial-gradient(
			ellipse at center,
			rgba(0, 255, 65, 0.03) 0%,
			transparent 70%
		);
		animation: phosphor-pulse 4s ease-in-out infinite;
	}

	@keyframes phosphor-pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	/* Audio button */
	.audio-btn {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 200;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #00ff41;
		color: #00ff41;
		font-family: 'Courier New', monospace;
		font-size: 0.7rem;
		cursor: pointer;
		text-shadow: 0 0 10px #00ff41;
		transition: all 0.3s;
	}

	.audio-btn:hover {
		background: rgba(0, 255, 65, 0.1);
	}

	.audio-btn.active {
		background: rgba(0, 255, 65, 0.2);
		box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
	}

	/* Terminal */
	.terminal {
		position: relative;
		z-index: 10;
		padding: 3rem;
		min-height: 100vh;
	}

	.terminal-text {
		margin: 0;
		font-size: clamp(0.7rem, 1.5vw, 1rem);
		line-height: 1.6;
		color: #00ff41;
		text-shadow:
			0 0 5px #00ff41,
			0 0 10px #00ff41,
			0 0 20px #00ff41,
			0 0 40px #00ff41;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.cursor {
		opacity: 0;
		animation: none;
	}

	.cursor.visible {
		opacity: 1;
	}

	/* Text styling based on line type - using color variations */
	:global(.tam4 .terminal-text) {
		/* All text is green but with different intensities handled by content */
	}
</style>
