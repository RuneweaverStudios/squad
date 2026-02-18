<script lang="ts">
	import { onMount } from 'svelte';
	import { FLYWHEEL_STAGES } from '../../../../shared/signalCardTokens';

	// Props
	interface Props {
		trackWidth?: number;
		trackHeight?: number;
		padding?: number;
		stepDuration?: number;
		autoPlay?: boolean;
		showControls?: boolean;
		showCenterContent?: boolean;
	}

	let {
		trackWidth = 700,
		trackHeight = 500,
		padding = 60,
		stepDuration = 6000,
		autoPlay = true,
		showControls = true,
		showCenterContent = true
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

	const taskStates = [
		{ title: 'Add user authentication', status: 'idle', statusLabel: 'Idea', content: '"Users should be able to log in with Google or email..."', visual: 'thought-bubble' },
		{ title: 'Auth System Epic', status: 'open', statusLabel: 'Tasks Created', content: '├─ squad-7kx: OAuth setup\n├─ squad-7ky: Sessions\n└─ squad-7kz: Login UI', visual: 'tree' },
		{ title: 'squad-7kx: OAuth setup', status: 'starting', statusLabel: 'Spawning', content: 'BluePeak → squad-7kx\nFairMist → squad-7ky\nGreenRidge → squad-7kz', visual: 'agents' },
		{ title: 'squad-7kx: OAuth setup', status: 'working', statusLabel: 'Working', content: 'src/auth/oauth.ts\nsrc/lib/google.ts\n+ 47 lines', visual: 'code' },
		{ title: 'squad-7kx: OAuth setup', status: 'needs_input', statusLabel: 'Needs Input', content: 'Auth provider?\n❯ 1. Supabase\n  2. Auth0\n  3. Custom', visual: 'question' },
		{ title: 'squad-7kx: OAuth setup', status: 'review', statusLabel: 'Review', content: '+3 files changed\n+142 insertions\n-12 deletions', visual: 'diff' },
		{ title: 'squad-7kx: OAuth setup', status: 'completing', statusLabel: 'Completing', content: '✓ Committing changes\n✓ Closing task\n✓ Announcing to team', visual: 'check' },
		{ title: 'squad-7kx: OAuth setup', status: 'completed', statusLabel: 'auto_proceed', content: '✓ Task closed\n✓ Spawning next task\n→ squad-7ky: Sessions', visual: 'check' },
		{ title: 'Suggested: Add MFA', status: 'suggested', statusLabel: 'suggestedTask', content: 'From completionBundle:\n→ type: feature\n→ priority: P1', visual: 'sparkle' }
	];

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

	const storySnippets = [
		{ headline: "It starts with an idea.", text: "You describe what you want: \"Add user authentication.\" The AI helps you turn it into a structured PRD." },
		{ headline: "The PRD becomes tasks.", text: "Run /squad:tasktree and watch your requirements transform into a dependency tree of actionable work." },
		{ headline: "Agents swarm the work.", text: "Multiple AI agents claim tasks and start coding in parallel. No bottlenecks. No waiting." },
		{ headline: "Parallel execution.", text: "Each agent works independently on their assigned task. Code flows from multiple sources simultaneously." },
		{ headline: "Questions surface to you.", text: "When an agent needs a decision — \"OAuth or JWT?\" — it appears as a clickable button, not buried in terminal spam." },
		{ headline: "Review with clarity.", text: "See the diffs, understand the changes. Every modification tracked and presented for your approval." },
		{ headline: "One command to ship.", text: "Run /squad:complete and watch the magic: commits, closes the task, announces to the team. Done." },
		{ headline: "Auto-proceed kicks in.", text: "Low-priority tasks complete without your input. The system knows when to ask and when to just ship." },
		{ headline: "And then, the magic.", text: "Completed work suggests new work. \"Add MFA support?\" The flywheel keeps spinning. Perpetual motion." }
	];

	// Calculate position on rectangular path (0-1 around perimeter)
	function getRectPosition(progress: number): { x: number; y: number } {
		const perimeter = 2 * (trackWidth + trackHeight);
		const dist = progress * perimeter;

		if (dist <= trackWidth) {
			return { x: dist, y: 0 };
		}
		if (dist <= trackWidth + trackHeight) {
			return { x: trackWidth, y: dist - trackWidth };
		}
		if (dist <= 2 * trackWidth + trackHeight) {
			return { x: trackWidth - (dist - trackWidth - trackHeight), y: trackHeight };
		}
		return { x: 0, y: trackHeight - (dist - 2 * trackWidth - trackHeight) };
	}

	function getNodePosition(stepIndex: number): { x: number; y: number } {
		return getRectPosition(stepIndex / 9);
	}

	function getCardPosition(stepIndex: number, progress: number): { x: number; y: number } {
		const currentPos = getRectPosition(stepIndex / 9);
		const nextPos = getRectPosition(((stepIndex + 1) % 9) / 9);
		return {
			x: currentPos.x + (nextPos.x - currentPos.x) * progress,
			y: currentPos.y + (nextPos.y - currentPos.y) * progress
		};
	}

	let currentStep = $state(0);
	let taskProgress = $state(0);
	let isPlaying = $state(autoPlay);

	let currentState = $derived(taskStates[currentStep]);
	let currentStepData = $derived(steps[currentStep]);
	let cardPos = $derived(getCardPosition(currentStep, taskProgress));

	onMount(() => {
		let animationId: number;
		let lastTime = 0;

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
				currentStep = (currentStep + 1) % 9;
			}

			lastTime = time;
			animationId = requestAnimationFrame(animate);
		}

		animationId = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animationId);
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
</script>

<div class="agentic-flywheel">
	<!-- The rectangular track container -->
	<div
		class="relative mx-auto"
		style="width: {trackWidth + padding * 2}px; height: {trackHeight + padding * 2}px;"
	>
		<!-- Track outline -->
		<div
			class="absolute border-2 border-gray-800 rounded-lg"
			style="left: {padding}px; top: {padding}px; width: {trackWidth}px; height: {trackHeight}px;"
		></div>
		<div
			class="absolute border border-gray-800/50 rounded-lg"
			style="left: {padding + 4}px; top: {padding + 4}px; width: {trackWidth - 8}px; height: {trackHeight - 8}px;"
		></div>

		<!-- Step nodes around the rectangle -->
		{#each steps as step, i}
			{@const pos = getNodePosition(i)}
			{@const isActive = i === currentStep}
			<button
				onclick={() => goToStep(i)}
				onmouseenter={() => onStepHover(i)}
				onmouseleave={onStepLeave}
				class="absolute flex flex-col items-center transition-all duration-300 cursor-pointer z-10"
				style="left: {padding + pos.x}px; top: {padding + pos.y}px; transform: translate(-50%, -50%);"
			>
				<div
					class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 border-2"
					class:scale-125={isActive}
					style="
						background: {isActive ? step.color : 'rgba(17, 24, 39, 0.9)'};
						border-color: {step.color};
						color: {isActive ? 'white' : step.color};
						box-shadow: {isActive ? `0 0 20px ${step.color}50` : 'none'};
					"
				>
					{step.num}
				</div>
				<div
					class="mt-1 text-[10px] font-bold transition-colors whitespace-nowrap"
					style="color: {isActive ? step.color : '#6b7280'}"
				>
					{step.title}
				</div>
			</button>
		{/each}

		<!-- The traveling card -->
		<div
			class="absolute w-[280px] transition-all duration-150 ease-out z-20"
			style="left: {padding + cardPos.x}px; top: {padding + cardPos.y}px; transform: translate(-50%, -50%);"
		>
			<div
				class="rounded-xl overflow-hidden shadow-2xl border border-gray-700"
				style="box-shadow: 0 0 30px {currentStepData.color}40;"
			>
				<!-- Card header -->
				<div class="p-4" style="background: {currentStepData.cssGradient};">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs font-mono text-white/70">Step {currentStepData.num}</span>
						<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white">
							{currentState.statusLabel}
						</span>
					</div>
					<div class="text-lg font-bold text-white">{currentStepData.desc}</div>
				</div>

				<!-- Card body -->
				<div class="bg-gray-900 p-4">
					<div class="mb-3 flex items-center gap-2">
						<span class="text-2xl">{visualIcons[currentState.visual]}</span>
						<span class="text-sm text-gray-300">{currentState.title}</span>
					</div>
					<pre class="text-xs font-mono text-gray-400 bg-gray-800 rounded-lg p-3 whitespace-pre-wrap">{currentState.content}</pre>
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

		<!-- Center content - Story snippet -->
		{#if showCenterContent}
			<div
				class="absolute flex items-center justify-center pointer-events-none"
				style="left: {padding}px; top: {padding}px; width: {trackWidth}px; height: {trackHeight}px;"
			>
				<div class="text-center max-w-md px-8 transition-all duration-500">
					<!-- Step indicator -->
					<div class="flex items-center justify-center gap-3 mb-4">
						<span
							class="text-4xl font-bold transition-colors duration-500"
							style="color: {currentStepData.color};"
						>
							{currentStep + 1}
						</span>
						<span class="text-2xl text-gray-600">/</span>
						<span class="text-2xl text-gray-600">9</span>
					</div>

					<!-- Story headline -->
					<h3
						class="text-2xl font-bold mb-3 transition-colors duration-500"
						style="color: {currentStepData.color};"
					>
						{storySnippets[currentStep].headline}
					</h3>

					<!-- Story text -->
					<p class="text-gray-400 text-base leading-relaxed transition-opacity duration-500">
						{storySnippets[currentStep].text}
					</p>

					<!-- Step name badge -->
					<div
						class="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-500"
						style="background: {currentStepData.color}20; color: {currentStepData.color};"
					>
						<span class="text-lg">{visualIcons[currentState.visual]}</span>
						{currentStepData.title}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Controls -->
	{#if showControls}
		<div class="flex items-center justify-center gap-4 mt-8">
			<button
				onclick={() => isPlaying = !isPlaying}
				class="px-6 py-3 rounded-lg font-medium transition-all"
				class:bg-[var(--color-primary)]={isPlaying}
				class:text-white={isPlaying}
				class:bg-gray-800={!isPlaying}
				class:text-gray-300={!isPlaying}
			>
				{isPlaying ? '⏸ Pause' : '▶ Play'}
			</button>
			<button
				onclick={() => { currentStep = (currentStep + 1) % 9; taskProgress = 0; }}
				class="px-6 py-3 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-all"
			>
				Next Step →
			</button>
		</div>
	{/if}
</div>
