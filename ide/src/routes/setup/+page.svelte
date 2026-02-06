<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import SetupProgress from '$lib/components/onboarding/SetupProgress.svelte';
	import PrerequisiteChecks from '$lib/components/onboarding/PrerequisiteChecks.svelte';
	import AgentDetectStep from '$lib/components/onboarding/AgentDetectStep.svelte';
	import FirstTaskPrompt from '$lib/components/onboarding/FirstTaskPrompt.svelte';
	import AutonomousSetupStep from '$lib/components/onboarding/AutonomousSetupStep.svelte';
	import { openProjectDrawer, projectCreatedSignal } from '$lib/stores/drawerStore';
	import {
		getPrerequisiteResults,
		setPrerequisiteResults,
		isCacheValid,
		skipSetup,
		type PrerequisiteResult
	} from '$lib/stores/onboardingStore.svelte';

	let currentStep = $state(1);
	let checks = $state<PrerequisiteResult[] | null>(null);
	let loading = $state(true);
	let prereqsPassed = $state(false);
	let hasAgents = $state(false);
	let hasProjects = $state(false);
	let hasTasks = $state(false);
	let hasAutonomous = $state(false);
	let firstProject = $state<string | null>(null);
	let userName = $state('');

	// Watch for project creation signal from CreateProjectDrawer
	$effect(() => {
		const unsubscribe = projectCreatedSignal.subscribe(() => {
			// Refresh project list when a project is created
			checkProjects();
		});
		return unsubscribe;
	});

	// Advance step when prior steps are complete
	$effect(() => {
		if (hasAgents && hasProjects && hasTasks && currentStep < 5) {
			currentStep = 5;
		} else if (hasAgents && hasProjects && currentStep < 4) {
			currentStep = 4;
		} else if (hasAgents && currentStep < 3) {
			currentStep = 3;
		}
	});

	async function loadPrerequisites() {
		// Use cache if valid
		const cached = getPrerequisiteResults();
		if (cached && isCacheValid()) {
			checks = cached;
			loading = false;
			// Check if all required tools passed from cached results
			prereqsPassed = cached.every((c: PrerequisiteResult) => !c.required || c.installed);
			if (prereqsPassed && currentStep === 1) currentStep = 2;
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/setup/check');
			const data = await response.json();
			checks = data.checks;
			prereqsPassed = data.allRequiredPassed ?? false;
			setPrerequisiteResults(data.checks);
		} catch {
			checks = null;
			prereqsPassed = false;
		} finally {
			loading = false;
			// Only auto-advance if all required prerequisites passed
			if (prereqsPassed && currentStep === 1) currentStep = 2;
		}
	}

	function handleAgentStepComplete() {
		hasAgents = true;
		if (currentStep < 3) currentStep = 3;
	}

	async function checkProjects() {
		try {
			const response = await fetch('/api/projects?visible=true');
			const data = await response.json();
			const projects = data.projects || [];
			hasProjects = projects.length > 0;
			firstProject = projects[0]?.name || null;

			if (hasProjects) {
				// Let the $effect handle step advancement based on hasAgents
				checkTasks();
			}
		} catch {
			hasProjects = false;
		}
	}

	async function checkTasks() {
		try {
			const response = await fetch('/api/tasks?status=open&limit=1');
			const data = await response.json();
			hasTasks = (data.tasks || []).length > 0;
		} catch {
			hasTasks = false;
		}
	}

	function handleAddProject() {
		openProjectDrawer();
	}

	function handleSkip() {
		skipSetup();
		goto('/tasks', { replaceState: true });
	}

	function handleGoToTasks() {
		goto('/tasks', { replaceState: true });
	}

	function handleCreateFirstTask() {
		goto(`/tasks?welcome=true${firstProject ? `&project=${encodeURIComponent(firstProject)}` : ''}`, { replaceState: true });
	}

	function handleGoToSettings() {
		goto('/config', { replaceState: true });
	}

	function handleGoToServers() {
		goto('/servers', { replaceState: true });
	}

	onMount(() => {
		loadPrerequisites();
		checkProjects();
		// Infer user name from git config
		fetch('/api/config/user').then(r => r.json()).then(data => {
			if (data.name) userName = data.name;
		}).catch(() => {});
	});

	// Derived: all done = agents configured + has projects + has tasks + autonomous configured (or skipped)
	const allDone = $derived(hasAgents && hasProjects && hasTasks && hasAutonomous);
</script>

<svelte:head>
	<title>Setup - JAT IDE</title>
	<meta property="og:title" content="Set Up JAT - The World's First Agentic IDE" />
	<meta property="og:description" content="Get your multi-agent development environment running. Create tasks, spawn AI agents, ship code." />
</svelte:head>

<div
	class="min-h-full flex items-start justify-center py-8 px-4"
	style="background: linear-gradient(180deg, oklch(0.16 0.01 250) 0%, oklch(0.14 0.01 250) 100%);"
>
	<div class="w-full max-w-xl space-y-8">
		<!-- Header -->
		<div class="text-center space-y-2">
			<div class="flex justify-center mb-4">
				<div
					class="px-3 py-2 rounded-lg font-mono font-bold text-xl tracking-widest"
					style="
						background: linear-gradient(135deg, oklch(0.70 0.18 240 / 0.15) 0%, oklch(0.70 0.18 240 / 0.05) 100%);
						border: 1px solid oklch(0.70 0.18 240 / 0.3);
						color: oklch(0.75 0.16 240);
						text-shadow: 0 0 15px oklch(0.70 0.18 240 / 0.5);
					"
				>
					JAT
				</div>
			</div>
			<h1 class="text-2xl font-bold font-mono" style="color: oklch(0.85 0.02 250);">
				{userName ? `Welcome, ${userName.split(' ')[0]}` : 'Welcome to JAT IDE'}
			</h1>
			<p class="text-sm" style="color: oklch(0.55 0.02 250);">
				Your multi-agent development command center
			</p>
		</div>

		<!-- Progress Stepper -->
		<SetupProgress {currentStep} />

		<!-- All Done State -->
		{#if allDone}
			<div
				class="rounded-xl p-6 text-center space-y-5"
				style="
					background: linear-gradient(135deg, oklch(0.20 0.06 145 / 0.2) 0%, oklch(0.18 0.04 145 / 0.1) 100%);
					border: 1px solid oklch(0.40 0.12 145 / 0.3);
				"
			>
				<div
					class="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
					style="background: oklch(0.40 0.15 145); box-shadow: 0 0 20px oklch(0.50 0.18 145 / 0.3);"
				>
					<svg class="w-7 h-7" style="color: oklch(0.95 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<h2 class="text-lg font-bold font-mono" style="color: oklch(0.80 0.08 145);">
					All Set!
				</h2>
				<p class="text-sm" style="color: oklch(0.60 0.04 145);">
					Your workspace is ready. What would you like to do first?
				</p>

				<!-- Primary CTA -->
				<button
					class="btn btn-lg w-full font-mono"
					style="
						background: linear-gradient(135deg, oklch(0.40 0.15 145) 0%, oklch(0.35 0.12 145) 100%);
						border: 1px solid oklch(0.55 0.18 145 / 0.5);
						color: oklch(0.95 0.02 250);
					"
					onclick={handleCreateFirstTask}
				>
					<svg class="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					Create Your First Task
					<svg class="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
					</svg>
				</button>

				<!-- Secondary options -->
				<div class="grid grid-cols-3 gap-2">
					<button
						class="rounded-lg px-3 py-2.5 text-center transition-colors cursor-pointer"
						style="
							background: oklch(0.20 0.02 250);
							border: 1px solid oklch(0.30 0.02 250);
							color: oklch(0.70 0.02 250);
						"
						onmouseenter={(e) => { e.currentTarget.style.background = 'oklch(0.24 0.02 250)'; e.currentTarget.style.borderColor = 'oklch(0.40 0.02 250)'; }}
						onmouseleave={(e) => { e.currentTarget.style.background = 'oklch(0.20 0.02 250)'; e.currentTarget.style.borderColor = 'oklch(0.30 0.02 250)'; }}
						onclick={handleGoToSettings}
					>
						<svg class="w-4 h-4 mx-auto mb-1" style="color: oklch(0.60 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						<span class="text-xs font-mono">Settings</span>
					</button>
					<button
						class="rounded-lg px-3 py-2.5 text-center transition-colors cursor-pointer"
						style="
							background: oklch(0.20 0.02 250);
							border: 1px solid oklch(0.30 0.02 250);
							color: oklch(0.70 0.02 250);
						"
						onmouseenter={(e) => { e.currentTarget.style.background = 'oklch(0.24 0.02 250)'; e.currentTarget.style.borderColor = 'oklch(0.40 0.02 250)'; }}
						onmouseleave={(e) => { e.currentTarget.style.background = 'oklch(0.20 0.02 250)'; e.currentTarget.style.borderColor = 'oklch(0.30 0.02 250)'; }}
						onclick={handleGoToServers}
					>
						<svg class="w-4 h-4 mx-auto mb-1" style="color: oklch(0.60 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
						</svg>
						<span class="text-xs font-mono">Servers</span>
					</button>
					<button
						class="rounded-lg px-3 py-2.5 text-center transition-colors cursor-pointer"
						style="
							background: oklch(0.20 0.02 250);
							border: 1px solid oklch(0.30 0.02 250);
							color: oklch(0.70 0.02 250);
						"
						onmouseenter={(e) => { e.currentTarget.style.background = 'oklch(0.24 0.02 250)'; e.currentTarget.style.borderColor = 'oklch(0.40 0.02 250)'; }}
						onmouseleave={(e) => { e.currentTarget.style.background = 'oklch(0.20 0.02 250)'; e.currentTarget.style.borderColor = 'oklch(0.30 0.02 250)'; }}
						onclick={handleGoToTasks}
					>
						<svg class="w-4 h-4 mx-auto mb-1" style="color: oklch(0.60 0.02 250);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
						</svg>
						<span class="text-xs font-mono">Tasks</span>
					</button>
				</div>
			</div>

			<!-- Community CTA (lazygit-style) -->
			<div
				class="rounded-xl p-5 space-y-3"
				style="
					background: oklch(0.17 0.01 250);
					border: 1px solid oklch(0.25 0.02 250);
				"
			>
				<p class="text-sm font-mono" style="color: oklch(0.65 0.04 250);">
					Thanks for setting up JAT! You're a developer &mdash; consider helping make it better:
				</p>
				<div class="space-y-2.5 pl-1">
					<div class="flex items-start gap-2.5">
						<span class="text-xs font-mono font-bold mt-0.5" style="color: oklch(0.50 0.02 250);">1)</span>
						<p class="text-xs" style="color: oklch(0.55 0.02 250);">
							Read the docs and learn what JAT can do:<br/>
							<a
								href="https://jat.tools/docs"
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono hover:underline"
								style="color: oklch(0.70 0.15 240);"
							>https://jat.tools/docs</a>
						</p>
					</div>
					<div class="flex items-start gap-2.5">
						<span class="text-xs font-mono font-bold mt-0.5" style="color: oklch(0.50 0.02 250);">2)</span>
						<p class="text-xs" style="color: oklch(0.55 0.02 250);">
							Contribute or report issues on GitHub:<br/>
							<a
								href="https://github.com/joewinke/jat"
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono hover:underline"
								style="color: oklch(0.70 0.15 240);"
							>https://github.com/joewinke/jat</a><br/>
							<span style="color: oklch(0.50 0.02 250);">Or just star the repo to share the love!</span>
						</p>
					</div>
					<div class="flex items-start gap-2.5">
						<span class="text-xs font-mono font-bold mt-0.5" style="color: oklch(0.50 0.02 250);">3)</span>
						<p class="text-xs" style="color: oklch(0.55 0.02 250);">
							If JAT has saved you time, consider sponsoring development:<br/>
							<a
								href="https://github.com/sponsors/joewinke"
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono hover:underline"
								style="color: oklch(0.70 0.15 240);"
							>https://github.com/sponsors/joewinke</a>
						</p>
					</div>
				</div>
			</div>
		{:else}
			<!-- Step 1: Prerequisites -->
			<div
				class="rounded-xl p-5 space-y-1 transition-opacity duration-300"
				style="
					background: oklch(0.18 0.01 250);
					border: 1px solid {currentStep === 1 ? 'oklch(0.45 0.12 240 / 0.4)' : 'oklch(0.30 0.02 250)'};
					opacity: {currentStep >= 1 ? 1 : 0.5};
				"
			>
				<div class="flex items-center gap-2 mb-1">
					<span
						class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
						style="background: {prereqsPassed ? 'oklch(0.35 0.15 145)' : 'oklch(0.30 0.10 240)'}; color: {prereqsPassed ? 'oklch(0.90 0.02 250)' : 'oklch(0.80 0.12 240)'};"
					>
						{#if prereqsPassed}
							<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						{:else}
							1
						{/if}
					</span>
					<h2 class="text-sm font-semibold font-mono uppercase tracking-wider" style="color: oklch(0.70 0.02 250);">
						Prerequisites
					</h2>
				</div>
				<p class="text-[11px] ml-7 mb-2" style="color: oklch(0.50 0.02 250);">
					Required tools for running agent sessions
				</p>
				<PrerequisiteChecks {checks} {loading} onRecheck={loadPrerequisites} />
			</div>

			<!-- Step 2: Agent Harness -->
			<div
				class="rounded-xl p-5 space-y-4 transition-opacity duration-300"
				style="
					background: oklch(0.18 0.01 250);
					border: 1px solid {currentStep === 2 ? 'oklch(0.45 0.12 240 / 0.4)' : 'oklch(0.30 0.02 250)'};
					opacity: {currentStep >= 2 ? 1 : 0.4};
				"
			>
				<div>
					<div class="flex items-center gap-2">
						<span
							class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
							style="background: {hasAgents ? 'oklch(0.35 0.15 145)' : 'oklch(0.30 0.10 240)'}; color: {hasAgents ? 'oklch(0.90 0.02 250)' : 'oklch(0.80 0.12 240)'};"
						>
							{#if hasAgents}
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{:else}
								2
							{/if}
						</span>
						<h2 class="text-sm font-semibold font-mono uppercase tracking-wider" style="color: oklch(0.70 0.02 250);">
							Agent Harnesses
						</h2>
					</div>
					<p class="text-[11px] ml-7 mt-1" style="color: oklch(0.50 0.02 250);">
						Which AI coding tools to use for task execution
					</p>
				</div>

				{#if !prereqsPassed && currentStep < 2}
					<p class="text-xs font-mono" style="color: oklch(0.50 0.03 30);">
						Install the required prerequisites above to continue.
					</p>
				{:else if currentStep >= 2}
					<AgentDetectStep onComplete={handleAgentStepComplete} />
				{/if}
			</div>

			<!-- Step 3: Add Project -->
			<div
				class="rounded-xl p-5 space-y-4 transition-opacity duration-300"
				style="
					background: oklch(0.18 0.01 250);
					border: 1px solid {currentStep === 3 ? 'oklch(0.45 0.12 240 / 0.4)' : 'oklch(0.30 0.02 250)'};
					opacity: {currentStep >= 3 ? 1 : 0.4};
				"
			>
				<div>
					<div class="flex items-center gap-2">
						<span
							class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
							style="background: {hasProjects ? 'oklch(0.35 0.15 145)' : 'oklch(0.30 0.10 240)'}; color: {hasProjects ? 'oklch(0.90 0.02 250)' : 'oklch(0.80 0.12 240)'};"
						>
							{#if hasProjects}
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{:else}
								3
							{/if}
						</span>
						<h2 class="text-sm font-semibold font-mono uppercase tracking-wider" style="color: oklch(0.70 0.02 250);">
							Add Your First Project
						</h2>
					</div>
					<p class="text-[11px] ml-7 mt-1" style="color: oklch(0.50 0.02 250);">
						A git repo where agents will create tasks and work
					</p>
				</div>

				{#if hasProjects}
					<div
						class="flex items-center gap-2 px-3 py-2 rounded-lg"
						style="background: oklch(0.20 0.06 145 / 0.1); border: 1px solid oklch(0.40 0.12 145 / 0.3);"
					>
						<svg class="w-4 h-4" style="color: oklch(0.65 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-xs font-mono" style="color: oklch(0.70 0.12 145);">
							Project added: <span class="font-bold">{firstProject}</span>
						</span>
					</div>
				{:else}
					<p class="text-sm" style="color: oklch(0.60 0.02 250);">
						JAT tracks tasks using a lightweight, git-friendly task system.
						Add a project from <code class="px-1 py-0.5 rounded text-xs" style="background: oklch(0.22 0.01 250);">~/code/</code> to get started.
					</p>

					<button
						class="btn w-full font-mono"
						style="
							background: linear-gradient(135deg, oklch(0.35 0.12 145) 0%, oklch(0.28 0.10 145) 100%);
							border: 1px solid oklch(0.50 0.15 145 / 0.5);
							color: oklch(0.95 0.02 250);
						"
						onclick={handleAddProject}
						disabled={currentStep < 3}
					>
						<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						</svg>
						Add Project
					</button>

					<p class="text-[11px] font-mono text-center" style="color: oklch(0.45 0.02 250);">
						Or from terminal: <code class="px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">cd ~/code/project && jt init</code>
					</p>
				{/if}
			</div>

			<!-- Step 4: First Task -->
			<div
				class="rounded-xl p-5 space-y-4 transition-opacity duration-300"
				style="
					background: oklch(0.18 0.01 250);
					border: 1px solid {currentStep === 4 ? 'oklch(0.45 0.12 240 / 0.4)' : 'oklch(0.30 0.02 250)'};
					opacity: {currentStep >= 4 ? 1 : 0.4};
				"
			>
				<div>
					<div class="flex items-center gap-2">
						<span
							class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
							style="background: {hasTasks ? 'oklch(0.35 0.15 145)' : 'oklch(0.30 0.10 240)'}; color: {hasTasks ? 'oklch(0.90 0.02 250)' : 'oklch(0.80 0.12 240)'};"
						>
							{#if hasTasks}
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{:else}
								4
							{/if}
						</span>
						<h2 class="text-sm font-semibold font-mono uppercase tracking-wider" style="color: oklch(0.70 0.02 250);">
							Create Your First Task
						</h2>
					</div>
					<p class="text-[11px] ml-7 mt-1" style="color: oklch(0.50 0.02 250);">
						Give your agents something to work on
					</p>
				</div>

				{#if hasTasks}
					<div
						class="flex items-center gap-2 px-3 py-2 rounded-lg"
						style="background: oklch(0.20 0.06 145 / 0.1); border: 1px solid oklch(0.40 0.12 145 / 0.3);"
					>
						<svg class="w-4 h-4" style="color: oklch(0.65 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-xs font-mono" style="color: oklch(0.70 0.12 145);">
							Tasks created! You're ready to start.
						</span>
					</div>
					<button
						class="btn w-full font-mono"
						style="
							background: linear-gradient(135deg, oklch(0.40 0.15 145) 0%, oklch(0.35 0.12 145) 100%);
							border: 1px solid oklch(0.55 0.18 145 / 0.5);
							color: oklch(0.95 0.02 250);
						"
						onclick={handleGoToTasks}
					>
						Go to Tasks
						<svg class="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
						</svg>
					</button>
				{:else}
					<FirstTaskPrompt project={firstProject} disabled={currentStep < 4} />
				{/if}
			</div>

			<!-- Step 5: Autonomous Mode -->
			<div
				class="rounded-xl p-5 space-y-4 transition-opacity duration-300"
				style="
					background: oklch(0.18 0.01 250);
					border: 1px solid {currentStep === 5 ? 'oklch(0.45 0.12 45 / 0.4)' : 'oklch(0.30 0.02 250)'};
					opacity: {currentStep >= 5 ? 1 : 0.4};
				"
			>
				<div>
					<div class="flex items-center gap-2">
						<span
							class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
							style="background: {hasAutonomous ? 'oklch(0.35 0.15 145)' : 'oklch(0.30 0.10 45)'}; color: {hasAutonomous ? 'oklch(0.90 0.02 250)' : 'oklch(0.80 0.12 45)'};"
						>
							{#if hasAutonomous}
								<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{:else}
								5
							{/if}
						</span>
						<h2 class="text-sm font-semibold font-mono uppercase tracking-wider" style="color: oklch(0.70 0.02 250);">
							Autonomous Mode
						</h2>
						<span class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: oklch(0.25 0.02 250); color: oklch(0.55 0.02 250);">
							recommended
						</span>
					</div>
					<p class="text-[11px] ml-7 mt-1" style="color: oklch(0.50 0.02 250);">
						Let agents run without permission prompts
					</p>
				</div>

				{#if currentStep >= 5}
					<AutonomousSetupStep onComplete={() => hasAutonomous = true} disabled={currentStep < 5} />
				{:else}
					<p class="text-xs font-mono" style="color: oklch(0.50 0.03 30);">
						Complete the previous steps to continue.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Skip link -->
		{#if !allDone}
			<div class="text-center">
				<button
					class="text-xs font-mono transition-colors hover:underline"
					style="color: oklch(0.45 0.02 250);"
					onclick={handleSkip}
				>
					Skip setup &mdash; I'll configure things manually
				</button>
			</div>
		{/if}

		<!-- Quick Explainer -->
		<div
			class="rounded-lg px-4 py-3"
			style="
				background: oklch(0.17 0.01 250);
				border: 1px solid oklch(0.25 0.02 250);
			"
		>
			<p class="text-[10px] font-mono text-center mb-2.5" style="color: oklch(0.45 0.02 250);">How JAT works</p>
			<div class="grid grid-cols-4 gap-3 text-center">
				<div class="space-y-1">
					<div
						class="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
						style="background: oklch(0.25 0.08 240); color: oklch(0.75 0.15 240);"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
					</div>
					<p class="text-[11px] font-mono font-semibold" style="color: oklch(0.75 0.08 240);">Create</p>
					<p class="text-[10px]" style="color: oklch(0.50 0.02 250);">Add tasks to<br/>your backlog</p>
				</div>
				<div class="space-y-1">
					<div
						class="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
						style="background: oklch(0.25 0.08 85); color: oklch(0.75 0.15 85);"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
						</svg>
					</div>
					<p class="text-[11px] font-mono font-semibold" style="color: oklch(0.75 0.08 85);">Spawn</p>
					<p class="text-[10px]" style="color: oklch(0.50 0.02 250);">AI agents pick<br/>up ready work</p>
				</div>
				<div class="space-y-1">
					<div
						class="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
						style="background: oklch(0.25 0.08 290); color: oklch(0.75 0.15 290);"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<p class="text-[11px] font-mono font-semibold" style="color: oklch(0.75 0.08 290);">Watch</p>
					<p class="text-[10px]" style="color: oklch(0.50 0.02 250);">Monitor progress,<br/>answer questions</p>
				</div>
				<div class="space-y-1">
					<div
						class="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
						style="background: oklch(0.25 0.08 145); color: oklch(0.75 0.15 145);"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<p class="text-[11px] font-mono font-semibold" style="color: oklch(0.75 0.08 145);">Ship</p>
					<p class="text-[10px]" style="color: oklch(0.50 0.02 250);">Review work,<br/>merge & deploy</p>
				</div>
			</div>
		</div>
	</div>
</div>
