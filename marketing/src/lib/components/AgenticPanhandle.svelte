<script lang="ts">
	import { onMount } from 'svelte';
	import { FLYWHEEL_STAGES, SIGNAL_BADGE } from '../../../../shared/signalCardTokens';
	import TasksShippedCounter from './TasksShippedCounter.svelte';

	// Props
	interface Props {
		stepDuration?: number;
		autoPlay?: boolean;
		showControls?: boolean;
		showCenterContent?: boolean;
		waitForScroll?: boolean;
	}

	let {
		stepDuration = 4000,
		autoPlay = true,
		showControls = false,
		showCenterContent = true,
		waitForScroll = true
	}: Props = $props();

	// Map token stages to component-friendly format
	const steps = FLYWHEEL_STAGES.map(stage => ({
		num: stage.num,
		title: stage.title,
		desc: stage.desc,
		color: stage.colors.primary,
		bgClass: stage.bgGradient,
		cssGradient: stage.cssGradient,
		icon: stage.icon
	}));

	// Animation state
	let currentStep = $state(0);
	let taskProgress = $state(0);
	let isPlaying = $state(false);
	let hasStarted = $state(false);
	let loopCount = $state(0);
	let totalTasksCompleted = $state(0);
	let showCompletionPulse = $state(false);
	let typedContent = $state('');
	let isTyping = $state(false);
	let cardBounce = $state(false);

	// Trail particles
	let trailParticles = $state<Array<{id: number, x: number, y: number, opacity: number}>>([]);
	let particleId = 0;

	// Confetti particles
	let confettiParticles = $state<Array<{id: number, x: number, y: number, color: string, rotation: number, scale: number, velocityX: number, velocityY: number}>>([]);
	let confettiId = 0;

	// Agent avatars with expressions
	const agentAvatars: Record<string, { emoji: string, expressions: Record<string, string> }> = {
		'BluePeak': { emoji: '🤖', expressions: { idle: '😴', working: '🔥', done: '😎' } },
		'FairMist': { emoji: '🤖', expressions: { idle: '💤', working: '⚡', done: '✨' } },
		'GreenRidge': { emoji: '🤖', expressions: { idle: '😶', working: '💪', done: '🎉' } }
	};

	// Task cycles
	const taskCycles = [
		{
			task: { id: 'squad-7kx', name: 'OAuth setup' },
			agents: ['BluePeak → squad-7kx', 'FairMist → squad-7ky', 'GreenRidge → squad-7kz'],
			workingFiles: 'src/auth/oauth.ts\nsrc/lib/google.ts\n+ 47 lines',
			question: 'Auth provider?\n❯ 1. Supabase\n  2. Auth0\n  3. Custom',
			diff: '+3 files changed\n+142 insertions\n-12 deletions',
			nextTask: 'squad-7ky: Sessions',
			suggested: { name: 'Add MFA', reason: 'Security enhancement' }
		},
		{
			task: { id: 'squad-8ab', name: 'Add MFA' },
			agents: ['BluePeak → squad-8ab', 'FairMist → squad-8ac', 'GreenRidge → squad-8ad'],
			workingFiles: 'src/auth/mfa.ts\nsrc/lib/totp.ts\n+ 89 lines',
			question: 'MFA method?\n❯ 1. TOTP App\n  2. SMS\n  3. Email',
			diff: '+5 files changed\n+203 insertions\n-8 deletions',
			nextTask: 'squad-8ac: MFA UI',
			suggested: { name: 'Rate Limiting', reason: 'Prevent brute force' }
		},
		{
			task: { id: 'squad-9cd', name: 'Rate Limiting' },
			agents: ['BluePeak → squad-9cd', 'FairMist → squad-9ce', 'GreenRidge → squad-9cf'],
			workingFiles: 'src/middleware/rateLimit.ts\nsrc/lib/redis.ts\n+ 62 lines',
			question: 'Rate limit strategy?\n❯ 1. Token bucket\n  2. Sliding window\n  3. Fixed window',
			diff: '+4 files changed\n+156 insertions\n-3 deletions',
			nextTask: 'squad-9ce: Rate limit UI',
			suggested: { name: 'OAuth Refresh', reason: 'Token expiry handling' }
		}
	];

	let currentCycle = $derived(taskCycles[loopCount % taskCycles.length]);

	// Get agent expression based on current step
	function getAgentExpression(agentName: string): string {
		const agent = agentAvatars[agentName];
		if (!agent) return '🤖';
		if (currentStep === 3) return agent.expressions.working; // Working step
		if (currentStep >= 6) return agent.expressions.done; // Completing/Complete
		return agent.expressions.idle;
	}

	// Format agents with avatars
	let agentsWithAvatars = $derived(
		currentCycle.agents.map(line => {
			const agentName = line.split(' → ')[0];
			const expr = getAgentExpression(agentName);
			return `${expr} ${line}`;
		}).join('\n')
	);

	let taskStates = $derived([
		{ title: 'Add user authentication', status: 'idle', statusLabel: 'Idea', content: '"Users should be able to log in with Google or email..."', visual: 'thought-bubble', isCode: false },
		{ title: 'Auth System Epic', status: 'open', statusLabel: 'Tasks Created', content: '├─ squad-7kx: OAuth setup\n├─ squad-7ky: Sessions\n└─ squad-7kz: Login UI', visual: 'tree', isCode: false },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'starting', statusLabel: 'Spawning', content: agentsWithAvatars, visual: 'agents', isCode: false },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'working', statusLabel: 'Working', content: currentCycle.workingFiles, visual: 'code', isCode: true },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'needs_input', statusLabel: 'Needs Input', content: currentCycle.question, visual: 'question', isCode: false },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'review', statusLabel: 'Review', content: currentCycle.diff, visual: 'diff', isCode: false },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'completing', statusLabel: 'Completing', content: '✓ Committing changes\n✓ Closing task\n✓ Announcing to team', visual: 'check', isCode: false },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'completed', statusLabel: 'auto_proceed', content: `✓ Task closed\n✓ Spawning next task\n→ ${currentCycle.nextTask}`, visual: 'check', isCode: false },
		{ title: `Suggested: ${currentCycle.suggested.name}`, status: 'suggested', statusLabel: 'suggestedTask', content: `From completionBundle:\n→ ${currentCycle.suggested.reason}\n→ priority: P1`, visual: 'sparkle', isCode: false }
	]);

	const visualIcons: Record<string, string> = {
		'thought-bubble': '💭',
		'tree': '🌳',
		'agents': '🤖',
		'code': '⚡',
		'question': '❓',
		'diff': '📝',
		'git': '🔀',
		'check': '✅',
		'sparkle': '✨'
	};

	let storySnippets = $derived([
		{ headline: "It starts with an idea.", text: "You describe what you want: \"Add user authentication.\" The AI helps you turn it into a structured PRD." },
		{ headline: "The PRD becomes tasks.", text: "Run /squad:tasktree and watch your requirements transform into a dependency tree of actionable work." },
		{ headline: "Agents swarm the work.", text: "Multiple AI agents claim tasks and start coding in parallel. No bottlenecks. No waiting." },
		{ headline: "Parallel execution.", text: "Each agent works independently on their assigned task. Code flows from multiple sources simultaneously." },
		{ headline: "Questions surface to you.", text: "When an agent needs a decision — \"OAuth or JWT?\" — it appears as a clickable button, not buried in terminal spam." },
		{ headline: "Review with clarity.", text: "See the diffs, understand the changes. Every modification tracked and presented for your approval." },
		{ headline: "One command to ship.", text: "Run /squad:complete and watch the magic: commits, closes the task, announces to the team. Done." },
		{ headline: "Auto-proceed kicks in.", text: "Low-priority tasks complete without your input. The system knows when to ask and when to just ship." },
		{ headline: "And then, the magic.", text: `Completed work suggests new work. \"${currentCycle.suggested.name}?\" The flywheel keeps spinning. Perpetual motion.` }
	]);

	const nodePositions = [
		{ x: 550, y: 50 },
		{ x: 550, y: 150 },
		{ x: 550, y: 260 },
		{ x: 895, y: 370 },
		{ x: 895, y: 655 },
		{ x: 700, y: 795 },
		{ x: 400, y: 795 },
		{ x: 205, y: 655 },
		{ x: 205, y: 370 },
	];

	const containerWidth = 1100;
	const containerHeight = 880;

	function spawnConfetti() {
		const colors = ['#f43f5e', '#8b5cf6', '#3b82f6', '#22c55e', '#eab308', '#f97316'];
		const newParticles = Array.from({ length: 30 }, () => ({
			id: confettiId++,
			x: nodePositions[6].x,
			y: nodePositions[6].y,
			color: colors[Math.floor(Math.random() * colors.length)],
			rotation: Math.random() * 360,
			scale: 0.5 + Math.random() * 0.5,
			velocityX: (Math.random() - 0.5) * 20,
			velocityY: -5 - Math.random() * 10
		}));
		confettiParticles = [...confettiParticles, ...newParticles];
	}

	let currentState = $derived(taskStates[currentStep]);
	let currentStepData = $derived(steps[currentStep]);

	let badgeStyles = $derived(SIGNAL_BADGE.getStyles({
		primary: currentStepData.color,
		bg: `${currentStepData.color}15`,
		glow: `${currentStepData.color}40`
	}));

	let cardPos = $derived.by(() => {
		const current = nodePositions[currentStep];
		let nextStep: number;

		if (currentStep === 8) {
			nextStep = 2;
		} else {
			nextStep = currentStep + 1;
		}

		const next = nodePositions[nextStep];

		return {
			x: current.x + (next.x - current.x) * taskProgress,
			y: current.y + (next.y - current.y) * taskProgress
		};
	});

	// Typing animation for all content
	let displayContent = $derived.by(() => {
		if (isTyping) {
			return typedContent;
		}
		return currentState.content;
	});

	let containerEl: HTMLDivElement;
	let lastCardPos = { x: 0, y: 0 };

	onMount(() => {
		let animationId: number;
		let lastTime = 0;
		let observer: IntersectionObserver | null = null;
		let typeInterval: ReturnType<typeof setInterval> | null = null;

		// Helper to start typing animation for current step
		function startTyping() {
			isTyping = true;
			typedContent = '';
			const fullContent = taskStates[currentStep].content;
			let charIndex = 0;
			if (typeInterval) clearInterval(typeInterval);
			typeInterval = setInterval(() => {
				if (charIndex < fullContent.length) {
					typedContent = fullContent.slice(0, charIndex + 1);
					charIndex++;
				} else {
					isTyping = false;
					if (typeInterval) clearInterval(typeInterval);
				}
			}, 30);
		}

		if (waitForScroll) {
			observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting && !hasStarted) {
							hasStarted = true;
							if (autoPlay) {
								isPlaying = true;
								startTyping(); // Start typing on initial step
							}
						}
					});
				},
				{ threshold: 0.3 }
			);

			if (containerEl) {
				observer.observe(containerEl);
			}
		} else {
			hasStarted = true;
			if (autoPlay) {
				isPlaying = true;
				startTyping(); // Start typing on initial step
			}
		}

		function animate(time: number) {
			if (!isPlaying) {
				lastTime = time;
				animationId = requestAnimationFrame(animate);
				return;
			}

			if (!lastTime) lastTime = time;
			const delta = time - lastTime;

			taskProgress += delta / stepDuration;

			// Add trail particles
			if (Math.abs(cardPos.x - lastCardPos.x) > 5 || Math.abs(cardPos.y - lastCardPos.y) > 5) {
				trailParticles = [
					...trailParticles.slice(-15),
					{ id: particleId++, x: cardPos.x, y: cardPos.y, opacity: 1 }
				];
				lastCardPos = { x: cardPos.x, y: cardPos.y };
			}

			// Fade particles
			trailParticles = trailParticles.map(p => ({ ...p, opacity: p.opacity * 0.92 })).filter(p => p.opacity > 0.1);

			// Update confetti physics
			confettiParticles = confettiParticles
				.map(p => ({
					...p,
					x: p.x + p.velocityX,
					y: p.y + p.velocityY,
					velocityY: p.velocityY + 0.5, // gravity
					rotation: p.rotation + 5,
					scale: p.scale * 0.99
				}))
				.filter(p => p.y < containerHeight + 50 && p.scale > 0.1);

			if (taskProgress >= 1) {
				taskProgress = 0;

				// Trigger completion effects at step 7 (completing)
				if (currentStep === 6) {
					showCompletionPulse = true;
					totalTasksCompleted++;
					spawnConfetti();
					cardBounce = true;
					setTimeout(() => { showCompletionPulse = false; }, 600);
					setTimeout(() => { cardBounce = false; }, 500);
				}

				if (currentStep === 8) {
					currentStep = 2;
					loopCount++;
				} else {
					currentStep++;
				}

				// Start typing animation for the new step
				startTyping();
			}

			lastTime = time;
			animationId = requestAnimationFrame(animate);
		}

		animationId = requestAnimationFrame(animate);

		return () => {
			if (observer) observer.disconnect();
			cancelAnimationFrame(animationId);
			if (typeInterval) clearInterval(typeInterval);
		};
	});

	function goToStep(step: number) {
		currentStep = step;
		taskProgress = 0;
	}

	let wasPlayingBeforeHover = $state(false);

	function onStepHover(step: number) {
		wasPlayingBeforeHover = isPlaying;
		isPlaying = false;
		currentStep = step;
		taskProgress = 0;
	}

	function onStepLeave() {
		if (wasPlayingBeforeHover) {
			isPlaying = true;
		}
	}

	function getLoopPath(): string {
		const loopNodes = [2, 3, 4, 5, 6, 7, 8];
		const points = loopNodes.map(i => nodePositions[i]);
		points.push(nodePositions[2]);
		return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
	}
</script>

<div class="agentic-panhandle" bind:this={containerEl}>
	<div
		class="relative mx-auto"
		style="width: {containerWidth}px; height: {containerHeight}px;"
	>
		<!-- SVG for track lines and effects -->
		<svg class="absolute inset-0 w-full h-full" viewBox="0 0 {containerWidth} {containerHeight}">
			<!-- Glow trail particles -->
			{#each trailParticles as particle (particle.id)}
				<circle
					cx={particle.x}
					cy={particle.y}
					r="8"
					fill={currentStepData.color}
					opacity={particle.opacity * 0.6}
				/>
				<circle
					cx={particle.x}
					cy={particle.y}
					r="4"
					fill="white"
					opacity={particle.opacity * 0.8}
				/>
			{/each}

			<!-- Confetti particles -->
			{#each confettiParticles as particle (particle.id)}
				<rect
					x={particle.x - 4}
					y={particle.y - 4}
					width="8"
					height="8"
					fill={particle.color}
					transform="rotate({particle.rotation} {particle.x} {particle.y}) scale({particle.scale})"
					rx="1"
				/>
			{/each}

			<!-- Completion pulse -->
			{#if showCompletionPulse}
				<circle
					cx={nodePositions[6].x}
					cy={nodePositions[6].y}
					r="20"
					fill="none"
					stroke={steps[6].color}
					stroke-width="3"
					class="completion-pulse"
				/>
				<circle
					cx={nodePositions[6].x}
					cy={nodePositions[6].y}
					r="40"
					fill="none"
					stroke={steps[6].color}
					stroke-width="2"
					class="completion-pulse-outer"
				/>
			{/if}

			<!-- Stem line -->
			<path
				d="M {nodePositions[0].x} {nodePositions[0].y} L {nodePositions[1].x} {nodePositions[1].y} L {nodePositions[2].x} {nodePositions[2].y}"
				fill="none"
				stroke="oklch(0.30 0.02 250)"
				stroke-width="2"
				stroke-dasharray="8 4"
			/>

			<!-- Loop path -->
			<path
				d="{getLoopPath()}"
				fill="none"
				stroke="oklch(0.35 0.04 250)"
				stroke-width="3"
			/>

			<!-- Loop arrow -->
			<defs>
				<marker id="loop-arrow-v2" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
					<polygon points="0 0, 10 3.5, 0 7" fill="oklch(0.55 0.18 175)" />
				</marker>
			</defs>
			<path
				d="M {nodePositions[8].x + 40} {nodePositions[8].y - 30} Q {nodePositions[8].x + 140} {nodePositions[8].y - 80} {nodePositions[2].x - 40} {nodePositions[2].y + 15}"
				fill="none"
				stroke="oklch(0.55 0.18 175)"
				stroke-width="2.5"
				stroke-dasharray="6 4"
				marker-end="url(#loop-arrow-v2)"
				opacity="0.7"
			/>
		</svg>

		<!-- Step nodes -->
		{#each steps as step, i}
			{@const pos = nodePositions[i]}
			{@const isActive = i === currentStep}
			{@const isInLoop = i >= 2}
			<button
				onclick={() => goToStep(i)}
				onmouseenter={() => onStepHover(i)}
				onmouseleave={onStepLeave}
				class="absolute flex flex-col items-center transition-all duration-300 cursor-pointer z-10"
				style="left: {pos.x}px; top: {pos.y}px; transform: translate(-50%, -50%);"
			>
				<div
					class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 border-2"
					class:scale-125={isActive}
					class:ring-2={isInLoop && !isActive}
					class:ring-gray-700={isInLoop && !isActive}
					style="
						background: {isActive ? step.color : 'rgba(17, 24, 39, 0.95)'};
						border-color: {step.color};
						color: {isActive ? 'white' : step.color};
						box-shadow: {isActive ? `0 0 25px ${step.color}60` : 'none'};
					"
				>
					{step.num}
				</div>
				<div
					class="mt-1.5 text-[11px] font-bold transition-colors whitespace-nowrap"
					style="color: {isActive ? step.color : '#6b7280'}"
				>
					{step.title}
				</div>
			</button>
		{/each}

		<!-- The traveling card -->
		<div
			class="absolute w-[260px] transition-all duration-100 ease-out z-20 pointer-events-none"
			class:card-bounce={cardBounce}
			style="left: {cardPos.x}px; top: {cardPos.y}px; transform: translate(-50%, -50%);"
		>
			<div
				class="rounded-xl overflow-hidden shadow-2xl border border-gray-700"
				style="box-shadow: 0 0 35px {currentStepData.color}50, 0 0 60px {currentStepData.color}20;"
			>
				<div class="p-3" style="background: {currentStepData.cssGradient};">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs font-mono text-white/70">Step {currentStepData.num}</span>
						<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white">
							{currentState.statusLabel}
						</span>
					</div>
					<div class="text-base font-bold text-white">{currentStepData.desc}</div>
				</div>

				<div class="bg-gray-900 p-3">
					<div class="mb-2 flex items-center gap-2">
						<span class="text-xl">{visualIcons[currentState.visual]}</span>
						<span class="text-sm text-gray-300 truncate">{currentState.title}</span>
					</div>
					<pre class="text-[10px] font-mono text-gray-400 bg-gray-800 rounded-lg p-2 whitespace-pre-wrap line-clamp-5">{displayContent}{#if isTyping}<span class="typing-cursor">▋</span>{/if}</pre>
				</div>

				<div class="h-1 bg-gray-800">
					<div
						class="h-full transition-all duration-100"
						style="width: {taskProgress * 100}%; background: {currentStepData.color};"
					></div>
				</div>
			</div>
		</div>

		<!-- Center content -->
		{#if showCenterContent}
			<div
				class="absolute flex items-center justify-center pointer-events-none"
				style="left: 300px; top: 380px; width: 500px; height: 320px;"
			>
				<div class="text-center max-w-md px-12">
					<h3
						class="text-2xl font-bold mb-6 transition-colors duration-300"
						style="color: {currentStepData.color};"
					>
						{storySnippets[currentStep].headline}
					</h3>

					<p class="text-gray-400 text-base leading-relaxed mb-8">
						{storySnippets[currentStep].text}
					</p>

					<button
						class="inline-flex items-center justify-center transition-all duration-300 hover:scale-105"
						style="
							background: {badgeStyles.background};
							color: {badgeStyles.color};
							border: {badgeStyles.border};
							box-shadow: {badgeStyles.boxShadow};
							padding: {SIGNAL_BADGE.structure.paddingY} {SIGNAL_BADGE.structure.paddingX};
							border-radius: {SIGNAL_BADGE.structure.borderRadius};
							gap: {SIGNAL_BADGE.structure.gap};
							min-width: {SIGNAL_BADGE.structure.minWidth};
							font-size: {SIGNAL_BADGE.typography.fontSize};
							font-weight: {SIGNAL_BADGE.typography.fontWeight};
							letter-spacing: {SIGNAL_BADGE.typography.letterSpacing};
							text-transform: {SIGNAL_BADGE.typography.textTransform};
						"
					>
						<span style="font-size: {SIGNAL_BADGE.icon.size};">{visualIcons[currentState.visual]}</span>
						{currentStepData.title}
					</button>
				</div>
			</div>
		{/if}

		{#if waitForScroll && !hasStarted}
			<div class="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm rounded-lg z-30">
				<div class="text-center">
					<div class="text-4xl mb-3 animate-bounce">👇</div>
					<p class="text-gray-400 text-sm">Scroll to start the flywheel</p>
				</div>
			</div>
		{/if}
	</div>

	{#if showControls}
		<div class="flex items-center justify-center gap-4 mt-6">
			<button
				onclick={() => {
					hasStarted = true;
					isPlaying = !isPlaying;
				}}
				class="px-5 py-2.5 rounded-lg font-medium transition-all text-sm"
				class:bg-[var(--color-primary)]={isPlaying}
				class:text-white={isPlaying}
				class:bg-gray-800={!isPlaying}
				class:text-gray-300={!isPlaying}
			>
				{isPlaying ? '⏸ Pause' : '▶ Play'}
			</button>
			<button
				onclick={() => {
					hasStarted = true;
					if (currentStep === 8) {
						currentStep = 2;
						loopCount++;
					} else {
						currentStep++;
					}
					taskProgress = 0;
				}}
				class="px-5 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-all text-sm"
			>
				Next →
			</button>
		</div>
	{/if}

	<!-- Task completion counter -->
	<div class="flex justify-center mt-8">
		<TasksShippedCounter count={totalTasksCompleted} />
	</div>
</div>

<style>
	.line-clamp-5 {
		display: -webkit-box;
		-webkit-line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.typing-cursor {
		animation: blink 0.7s infinite;
		color: var(--color-primary);
	}

	@keyframes blink {
		0%, 50% { opacity: 1; }
		51%, 100% { opacity: 0; }
	}

	.completion-pulse {
		animation: pulse-expand 0.6s ease-out forwards;
	}

	.completion-pulse-outer {
		animation: pulse-expand-outer 0.6s ease-out forwards;
	}

	@keyframes pulse-expand {
		0% { r: 20; opacity: 1; }
		100% { r: 80; opacity: 0; }
	}

	@keyframes pulse-expand-outer {
		0% { r: 40; opacity: 0.6; }
		100% { r: 120; opacity: 0; }
	}

	.card-bounce {
		animation: bounce-celebrate 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes bounce-celebrate {
		0% { transform: translate(-50%, -50%) scale(1); }
		30% { transform: translate(-50%, -50%) scale(1.15); }
		60% { transform: translate(-50%, -50%) scale(0.95); }
		100% { transform: translate(-50%, -50%) scale(1); }
	}
</style>
