<script lang="ts">
	import { onMount } from 'svelte';
	import { FLYWHEEL_STAGES, SIGNAL_BADGE } from '../../../../shared/signalCardTokens';
	import TasksShippedCounter from './TasksShippedCounter.svelte';

	// Props
	interface Props {
		stepDuration?: number;
		autoPlay?: boolean;
	}

	let {
		stepDuration = 4000,
		autoPlay = true
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
	let typedContent = $state('');
	let isTyping = $state(false);

	// Task cycles
	const taskCycles = [
		{
			task: { id: 'squad-7kx', name: 'OAuth setup' },
			agents: ['BluePeak', 'FairMist', 'GreenRidge'],
			workingFiles: 'src/auth/oauth.ts\nsrc/lib/google.ts\n+ 47 lines',
			question: 'Auth provider?\n1. Supabase\n2. Auth0\n3. Custom',
			diff: '+3 files changed\n+142 insertions\n-12 deletions',
			nextTask: 'squad-7ky: Sessions',
			suggested: { name: 'Add MFA', reason: 'Security enhancement' }
		},
		{
			task: { id: 'squad-8ab', name: 'Add MFA' },
			agents: ['BluePeak', 'FairMist', 'GreenRidge'],
			workingFiles: 'src/auth/mfa.ts\nsrc/lib/totp.ts\n+ 89 lines',
			question: 'MFA method?\n1. TOTP App\n2. SMS\n3. Email',
			diff: '+5 files changed\n+203 insertions\n-8 deletions',
			nextTask: 'squad-8ac: MFA UI',
			suggested: { name: 'Rate Limiting', reason: 'Prevent brute force' }
		},
		{
			task: { id: 'squad-9cd', name: 'Rate Limiting' },
			agents: ['BluePeak', 'FairMist', 'GreenRidge'],
			workingFiles: 'src/middleware/rateLimit.ts\nsrc/lib/redis.ts\n+ 62 lines',
			question: 'Rate limit strategy?\n1. Token bucket\n2. Sliding window\n3. Fixed window',
			diff: '+4 files changed\n+156 insertions\n-3 deletions',
			nextTask: 'squad-9ce: Rate limit UI',
			suggested: { name: 'OAuth Refresh', reason: 'Token expiry handling' }
		}
	];

	let currentCycle = $derived(taskCycles[loopCount % taskCycles.length]);

	let taskStates = $derived([
		{ title: 'Add user authentication', content: '"Users should be able to log in with Google or email..."', icon: '💭' },
		{ title: 'Auth System Epic', content: '├─ squad-7kx: OAuth setup\n├─ squad-7ky: Sessions\n└─ squad-7kz: Login UI', icon: '🌳' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, content: currentCycle.agents.map(a => `🤖 ${a}`).join('\n'), icon: '🚀' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, content: currentCycle.workingFiles, icon: '⚡' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, content: currentCycle.question, icon: '❓' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, content: currentCycle.diff, icon: '📝' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, content: '✓ Committing changes\n✓ Closing task\n✓ Announcing to team', icon: '✅' },
		{ title: `${currentCycle.task.id}: ${currentCycle.task.name}`, content: `✓ Task closed\n✓ Spawning next task\n→ ${currentCycle.nextTask}`, icon: '🔄' },
		{ title: `Suggested: ${currentCycle.suggested.name}`, content: `From completionBundle:\n→ ${currentCycle.suggested.reason}\n→ priority: P1`, icon: '✨' }
	]);

	let storySnippets = $derived([
		{ headline: "It starts with an idea.", text: "You describe what you want. The AI helps structure it." },
		{ headline: "The PRD becomes tasks.", text: "Requirements transform into actionable work items." },
		{ headline: "Agents swarm the work.", text: "Multiple AI agents claim tasks and start coding in parallel." },
		{ headline: "Parallel execution.", text: "Each agent works independently on their assigned task." },
		{ headline: "Questions surface to you.", text: "Decisions appear as buttons, not buried in terminal output." },
		{ headline: "Review with clarity.", text: "See the diffs, understand the changes." },
		{ headline: "One command to ship.", text: "Commits, closes the task, announces to the team. Done." },
		{ headline: "Auto-proceed kicks in.", text: "Low-priority tasks complete without your input." },
		{ headline: "And then, the magic.", text: `Completed work suggests new work. The flywheel keeps spinning.` }
	]);

	let currentState = $derived(taskStates[currentStep]);
	let currentStepData = $derived(steps[currentStep]);

	let displayContent = $derived.by(() => {
		if (isTyping) {
			return typedContent;
		}
		return currentState.content;
	});

	let containerEl: HTMLDivElement;

	onMount(() => {
		let animationId: number;
		let lastTime = 0;
		let observer: IntersectionObserver | null = null;
		let typeInterval: ReturnType<typeof setInterval> | null = null;

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

		observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !hasStarted) {
						hasStarted = true;
						if (autoPlay) {
							isPlaying = true;
							startTyping();
						}
					}
				});
			},
			{ threshold: 0.3 }
		);

		if (containerEl) {
			observer.observe(containerEl);
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

				if (currentStep === 6) {
					totalTasksCompleted++;
				}

				if (currentStep === 8) {
					currentStep = 2;
					loopCount++;
				} else {
					currentStep++;
				}

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
</script>

<div class="mobile-flywheel" bind:this={containerEl}>
	<!-- Header -->
	<div class="text-center mb-4 px-4">
		<h3
			class="text-lg font-bold mb-1 transition-colors duration-300"
		>	
			<span class="shimmer-text-slow" style="color: {currentStepData.color} !important;">{storySnippets[currentStep].headline}</span>
		</h3>
		<p class="text-gray-400 text-sm leading-relaxed">
			<span class="shimmer-text-slow !text-gray-400 text-sm">{storySnippets[currentStep].text}</span>
		</p>
	</div>

	<!-- Two column layout: Timeline + Card -->
	<div class="relative px-3">
		<div class="flex gap-3">
			<!-- Left column: Timeline -->
			<div class="relative w-10 shrink-0">
				<!-- Timeline line -->
				<div class="absolute left-1/2 top-4 bottom-4 w-0.5 bg-gray-700 -translate-x-1/2"></div>

				<!-- Step dots -->
				{#each steps as step, i}
					{@const isActive = i === currentStep}
					<button
						onclick={() => goToStep(i)}
						class="relative flex justify-center py-3 w-full"
						style="height: 56px;"
					>
						<div
							class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 z-10"
							class:scale-110={isActive}
							style="
								background: {isActive ? step.color : 'rgb(31, 41, 55)'};
								border: 2px solid {step.color};
								color: {isActive ? 'white' : step.color};
								box-shadow: {isActive ? `0 0 12px ${step.color}60` : 'none'};
							"
						>
							{step.num}
						</div>
						{#if i === 2}
							<span class="absolute -right-1 top-1/2 -translate-y-1/2 text-[8px]"></span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Right column: Card container with moving card -->
			<div class="flex-1 relative" style="height: {steps.length * 56}px;">
				<!-- Animated card that moves down -->
				<div
					class="absolute left-0 right-0 transition-all duration-500 ease-out z-10"
					style="top: {currentStep * 56}px;"
				>
					<div
						class="rounded-xl overflow-hidden shadow-2xl border border-gray-700 bg-gray-900"
						style="box-shadow: 0 0 20px {currentStepData.color}40;"
					>
						<div class="p-2.5" style="background: {currentStepData.cssGradient};">
							<div class="flex items-center justify-between mb-1">
								<span class="text-[10px] font-bold text-white/90">{currentStepData.title}</span>
								<span class="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-white/20 text-white">
									{currentStepData.desc}
								</span>
							</div>
							<div class="text-sm font-bold text-white truncate">{currentState.icon} {currentState.title}</div>
						</div>

						<div class="bg-gray-900 p-2.5">
							<pre class="text-[10px] font-mono text-gray-400 bg-gray-800 rounded-lg p-2 whitespace-pre-wrap min-h-[60px] max-h-[80px] overflow-hidden">{displayContent}{#if isTyping}<span class="typing-cursor">▋</span>{/if}</pre>
						</div>

						<div class="h-1 bg-gray-800">
							<div
								class="h-full transition-all duration-100"
								style="width: {taskProgress * 100}%; background: {currentStepData.color};"
							></div>
						</div>
					</div>
				</div>

				<!-- Step labels behind the card -->
				{#each steps as step, i}
					{@const isActive = i === currentStep}
					<div
						class="absolute left-1 flex items-center h-[56px] text-[10px] font-bold transition-opacity duration-300 pointer-events-none"
						style="top: {i * 56}px; color: {step.color}; opacity: {isActive ? 0 : 0.6};"
					>
						{step.title}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Tasks counter -->
	<div class="flex justify-center mt-4 pb-4">
		<TasksShippedCounter count={totalTasksCompleted} />
	</div>
</div>

<style>
	.mobile-flywheel {
		max-width: 100%;
		overflow-x: hidden;
	}

	.typing-cursor {
		animation: blink 0.7s infinite;
		color: var(--color-primary);
	}

	@keyframes blink {
		0%, 50% { opacity: 1; }
		51%, 100% { opacity: 0; }
	}
</style>
