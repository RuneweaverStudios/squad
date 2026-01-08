<script lang="ts">
	import { onMount } from 'svelte';
	import { FLYWHEEL_STAGES, SIGNAL_BADGE } from '../../../../shared/signalCardTokens';

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
		icon: stage.icon
	}));

	// Animation state (declared early so derived values can use them)
	let currentStep = $state(0);
	let taskProgress = $state(0);
	let isPlaying = $state(false); // Start paused, wait for scroll
	let hasStarted = $state(false);
	let loopCount = $state(0);

	// Task cycles - each cycle represents a different task going through the loop
	// When we loop, the suggested task from the previous cycle becomes the current task
	const taskCycles = [
		// Cycle 0: OAuth setup → suggests MFA
		{
			task: { id: 'jat-7kx', name: 'OAuth setup' },
			agents: 'BluePeak → jat-7kx\nFairMist → jat-7ky\nGreenRidge → jat-7kz',
			workingFiles: 'src/auth/oauth.ts\nsrc/lib/google.ts\n+ 47 lines',
			question: 'Auth provider?\n❯ 1. Supabase\n  2. Auth0\n  3. Custom',
			diff: '+3 files changed\n+142 insertions\n-12 deletions',
			nextTask: 'jat-7ky: Sessions',
			suggested: { name: 'Add MFA', reason: 'Security enhancement' }
		},
		// Cycle 1: MFA (suggested from cycle 0) → suggests Rate Limiting
		{
			task: { id: 'jat-8ab', name: 'Add MFA' },
			agents: 'BluePeak → jat-8ab\nFairMist → jat-8ac\nGreenRidge → jat-8ad',
			workingFiles: 'src/auth/mfa.ts\nsrc/lib/totp.ts\n+ 89 lines',
			question: 'MFA method?\n❯ 1. TOTP App\n  2. SMS\n  3. Email',
			diff: '+5 files changed\n+203 insertions\n-8 deletions',
			nextTask: 'jat-8ac: MFA UI',
			suggested: { name: 'Rate Limiting', reason: 'Prevent brute force' }
		},
		// Cycle 2: Rate Limiting → suggests back to OAuth (completing the conceptual loop)
		{
			task: { id: 'jat-9cd', name: 'Rate Limiting' },
			agents: 'BluePeak → jat-9cd\nFairMist → jat-9ce\nGreenRidge → jat-9cf',
			workingFiles: 'src/middleware/rateLimit.ts\nsrc/lib/redis.ts\n+ 62 lines',
			question: 'Rate limit strategy?\n❯ 1. Token bucket\n  2. Sliding window\n  3. Fixed window',
			diff: '+4 files changed\n+156 insertions\n-3 deletions',
			nextTask: 'jat-9ce: Rate limit UI',
			suggested: { name: 'OAuth Refresh', reason: 'Token expiry handling' }
		}
	];

	// Get current cycle based on loop count
	let currentCycle = $derived(taskCycles[loopCount % taskCycles.length]);

	// Build task states dynamically based on current cycle
	let taskStates = $derived([
		{ title: 'Add user authentication', status: 'idle', statusLabel: 'Idea', content: '"Users should be able to log in with Google or email..."', visual: 'thought-bubble' },
		{ title: 'Auth System Epic', status: 'open', statusLabel: 'Tasks Created', content: '├─ jat-7kx: OAuth setup\n├─ jat-7ky: Sessions\n└─ jat-7kz: Login UI', visual: 'tree' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'starting', statusLabel: 'Spawning', content: currentCycle.agents, visual: 'agents' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'working', statusLabel: 'Working', content: currentCycle.workingFiles, visual: 'code' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'needs_input', statusLabel: 'Needs Input', content: currentCycle.question, visual: 'question' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'review', statusLabel: 'Review', content: currentCycle.diff, visual: 'diff' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'completing', statusLabel: 'Completing', content: '✓ Committing changes\n✓ Closing task\n✓ Announcing to team', visual: 'check' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, status: 'completed', statusLabel: 'auto_proceed', content: `✓ Task closed\n✓ Spawning next task\n→ ${currentCycle.nextTask}`, visual: 'check' },
		{ title: `Suggested: ${currentCycle.suggested.name}`, status: 'suggested', statusLabel: 'suggestedTask', content: `From completionBundle:\n→ ${currentCycle.suggested.reason}\n→ priority: P1`, visual: 'sparkle' }
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

	// Story snippets - step 9 is dynamic based on current cycle's suggested task
	let storySnippets = $derived([
		{ headline: "It starts with an idea.", text: "You describe what you want: \"Add user authentication.\" The AI helps you turn it into a structured PRD." },
		{ headline: "The PRD becomes tasks.", text: "Run /jat:bead and watch your requirements transform into a dependency tree of actionable work." },
		{ headline: "Agents swarm the work.", text: "Multiple AI agents claim tasks and start coding in parallel. No bottlenecks. No waiting." },
		{ headline: "Parallel execution.", text: "Each agent works independently on their assigned task. Code flows from multiple sources simultaneously." },
		{ headline: "Questions surface to you.", text: "When an agent needs a decision — \"OAuth or JWT?\" — it appears as a clickable button, not buried in terminal spam." },
		{ headline: "Review with clarity.", text: "See the diffs, understand the changes. Every modification tracked and presented for your approval." },
		{ headline: "One command to ship.", text: "Run /jat:complete and watch the magic: commits, closes the task, announces to the team. Done." },
		{ headline: "Auto-proceed kicks in.", text: "Low-priority tasks complete without your input. The system knows when to ask and when to just ship." },
		{ headline: "And then, the magic.", text: `Completed work suggests new work. \"${currentCycle.suggested.name}?\" The flywheel keeps spinning. Perpetual motion.` }
	]);

	// Layout positions for panhandle shape
	// Stem: 1, 2, 3 go down vertically at top
	// Loop: 3 is shared, then 4-9 form a wide loop that comes back to 3
	//
	//           1
	//           2
	//           3
	//      9         4
	//      8         5
	//         7   6

	const nodePositions = [
		{ x: 550, y: 50 },   // 1 - top of stem
		{ x: 550, y: 150 },  // 2 - middle of stem
		{ x: 550, y: 260 },  // 3 - bottom of stem / top of loop
		{ x: 895, y: 370 },  // 4 - right upper
		{ x: 895, y: 655 },  // 5 - right lower (was 560, +50% gap)
		{ x: 700, y: 795 },  // 6 - bottom right of loop
		{ x: 400, y: 795 },  // 7 - bottom left of loop
		{ x: 205, y: 655 },  // 8 - left lower (was 560, +50% gap)
		{ x: 205, y: 370 },  // 9 - left upper (connects to 3)
	];

	const containerWidth = 1100;
	const containerHeight = 880;

	// Animation sequence: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 3 → 4 → ...
	// After first run through, we loop from 9 back to 3

	let currentState = $derived(taskStates[currentStep]);
	let currentStepData = $derived(steps[currentStep]);

	// Signal badge styles (derived from current step)
	let badgeStyles = $derived(SIGNAL_BADGE.getStyles({
		primary: currentStepData.color,
		bg: `${currentStepData.color}15`,
		glow: `${currentStepData.color}40`
	}));

	// Get current and next positions for card animation
	let cardPos = $derived.by(() => {
		const current = nodePositions[currentStep];
		let nextStep: number;

		// After step 9 (index 8), go back to step 3 (index 2)
		if (currentStep === 8) {
			nextStep = 2; // Loop back to step 3
		} else {
			nextStep = currentStep + 1;
		}

		const next = nodePositions[nextStep];

		return {
			x: current.x + (next.x - current.x) * taskProgress,
			y: current.y + (next.y - current.y) * taskProgress
		};
	});

	// Container element for intersection observer
	let containerEl: HTMLDivElement;

	onMount(() => {
		let animationId: number;
		let lastTime = 0;
		let observer: IntersectionObserver | null = null;

		// Set up intersection observer for scroll-triggered start
		if (waitForScroll) {
			observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting && !hasStarted) {
							hasStarted = true;
							if (autoPlay) {
								isPlaying = true;
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

			if (taskProgress >= 1) {
				taskProgress = 0;

				// Determine next step
				if (currentStep === 8) {
					// After step 9, loop back to step 3
					currentStep = 2;
					loopCount++;
				} else {
					currentStep++;
				}
			}

			lastTime = time;
			animationId = requestAnimationFrame(animate);
		}

		animationId = requestAnimationFrame(animate);

		// Cleanup on unmount
		return () => {
			if (observer) {
				observer.disconnect();
			}
			cancelAnimationFrame(animationId);
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

	// Generate path for the loop (3 → 4 → 5 → 6 → 7 → 8 → 9 → back to 3)
	function getLoopPath(): string {
		const loopNodes = [2, 3, 4, 5, 6, 7, 8]; // indices for steps 3-9
		const points = loopNodes.map(i => nodePositions[i]);
		// Close the loop back to step 3
		points.push(nodePositions[2]);

		return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
	}
</script>

<div class="agentic-panhandle" bind:this={containerEl}>
	<div
		class="relative mx-auto"
		style="width: {containerWidth}px; height: {containerHeight}px;"
	>
		<!-- SVG for track lines -->
		<svg class="absolute inset-0 w-full h-full" viewBox="0 0 {containerWidth} {containerHeight}">
			<!-- Stem line (1 → 2 → 3) -->
			<path
				d="M {nodePositions[0].x} {nodePositions[0].y} L {nodePositions[1].x} {nodePositions[1].y} L {nodePositions[2].x} {nodePositions[2].y}"
				fill="none"
				stroke="oklch(0.30 0.02 250)"
				stroke-width="2"
				stroke-dasharray="8 4"
			/>

			<!-- Loop path (3 → 4 → 5 → 6 → 7 → 8 → 9 → 3) -->
			<path
				d="{getLoopPath()}"
				fill="none"
				stroke="oklch(0.35 0.04 250)"
				stroke-width="3"
			/>

			<!-- Loop arrow indicator (9 → 3) -->
			<defs>
				<marker id="loop-arrow" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
					<polygon points="0 0, 10 3.5, 0 7" fill="oklch(0.55 0.18 175)" />
				</marker>
			</defs>
			<path
				d="M {nodePositions[8].x + 40} {nodePositions[8].y - 30} Q {nodePositions[8].x + 140} {nodePositions[8].y - 80} {nodePositions[2].x - 40} {nodePositions[2].y + 15}"
				fill="none"
				stroke="oklch(0.55 0.18 175)"
				stroke-width="2.5"
				stroke-dasharray="6 4"
				marker-end="url(#loop-arrow)"
				opacity="0.7"
			/>
		</svg>

		<!-- Step nodes -->
		{#each steps as step, i}
			{@const pos = nodePositions[i]}
			{@const isActive = i === currentStep}
			{@const isInLoop = i >= 2} <!-- Steps 3-9 are in the loop -->
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
			style="left: {cardPos.x}px; top: {cardPos.y}px; transform: translate(-50%, -50%);"
		>
			<div
				class="rounded-xl overflow-hidden shadow-2xl border border-gray-700"
				style="box-shadow: 0 0 35px {currentStepData.color}50;"
			>
				<!-- Card header -->
				<div class="bg-gradient-to-r {currentStepData.bgClass} p-3">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs font-mono text-white/70">Step {currentStepData.num}</span>
						<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white">
							{currentState.statusLabel}
						</span>
					</div>
					<div class="text-base font-bold text-white">{currentStepData.desc}</div>
				</div>

				<!-- Card body -->
				<div class="bg-gray-900 p-3">
					<div class="mb-2 flex items-center gap-2">
						<span class="text-xl">{visualIcons[currentState.visual]}</span>
						<span class="text-sm text-gray-300 truncate">{currentState.title}</span>
					</div>
					<pre class="text-[10px] font-mono text-gray-400 bg-gray-800 rounded-lg p-2 whitespace-pre-wrap line-clamp-3">{currentState.content}</pre>
				</div>

				<!-- Progress bar -->
				<div class="h-1 bg-gray-800">
					<div
						class="h-full transition-all duration-100"
						style="width: {taskProgress * 100}%; background: {currentStepData.color};"
					></div>
				</div>
			</div>
		</div>

		<!-- Center content in the loop -->
		{#if showCenterContent}
			<div
				class="absolute flex items-center justify-center pointer-events-none"
				style="left: 300px; top: 380px; width: 500px; height: 320px;"
			>
				<div class="text-center max-w-md px-12">


					<!-- Step indicator -->
					<div class="flex items-center justify-center gap-3 mb-8">
						<span
							class="text-4xl font-bold transition-colors duration-300"
							style="color: {currentStepData.color};"
						>
							{currentStep + 1}
						</span>
						<span class="text-2xl text-gray-600">/</span>
						<span class="text-2xl text-gray-600">9</span>
					</div>

					<!-- Story headline -->
					<h3
						class="text-2xl font-bold mb-6 transition-colors duration-300"
						style="color: {currentStepData.color};"
					>
						{storySnippets[currentStep].headline}
					</h3>

					<!-- Story text -->
					<p class="text-gray-400 text-base leading-relaxed mb-8">
						{storySnippets[currentStep].text}
					</p>

					<!-- Signal Badge -->
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

		<!-- "Scroll to start" indicator -->
		{#if waitForScroll && !hasStarted}
			<div class="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm rounded-lg z-30">
				<div class="text-center">
					<div class="text-4xl mb-3 animate-bounce">👇</div>
					<p class="text-gray-400 text-sm">Scroll to start the flywheel</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Controls -->
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
			<button
				onclick={() => {
					currentStep = 0;
					taskProgress = 0;
					loopCount = 0;
					hasStarted = true;
				}}
				class="px-5 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-all text-sm"
			>
				↺ Reset
			</button>
		</div>

		<!-- Loop info -->
		{#if loopCount > 0}
			<div class="text-center mt-3 text-xs text-gray-500">
				The flywheel has looped {loopCount} time{loopCount > 1 ? 's' : ''} (9 → 3)
			</div>
		{/if}
	{/if}
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
