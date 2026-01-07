<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import V11FeatureCard from '$lib/components/V11FeatureCard.svelte';
	import V14GravityWell from '$lib/components/V14GravityWell.svelte';
	import { countUp, scrollReveal, staggerChildren } from '$lib/utils/scrollObserver';
	import { onMount } from 'svelte';

	let heroCanvasEl: HTMLCanvasElement;
	let scannerCanvasEl: HTMLCanvasElement;
	let cardLineEl: HTMLDivElement;
	let chaosSection: HTMLElement;
	let chaosProgress = $state(0); // 0 to 1 based on scroll

	// "Everything in One Place" chaos cards
	const chaosCards = [
		{
			title: 'Multi-Agent Swarm',
			desc: 'Run 10+ Claude agents simultaneously.',
			icon: 'swarm',
			color: 'from-violet-500 to-purple-600',
			initialX: -400,
			initialY: -300,
			initialRotate: -45
		},
		{
			title: 'Smart Question UI',
			desc: 'When agents need decisions, they surface clickable questions.',
			icon: 'question',
			color: 'from-amber-500 to-orange-500',
			initialX: 500,
			initialY: -200,
			initialRotate: 30
		},
		{
			title: 'PRD to Tasks',
			desc: 'Paste a PRD, run /jat:bead, get a task tree.',
			icon: 'tree',
			color: 'from-emerald-500 to-teal-500',
			initialX: -300,
			initialY: 400,
			initialRotate: -25
		},
		{
			title: 'Auto-Proceed Rules',
			desc: 'Configure patterns to auto-answer prompts.',
			icon: 'auto',
			color: 'from-blue-500 to-cyan-500',
			initialX: 600,
			initialY: 300,
			initialRotate: 40
		},
		{
			title: 'Monaco Editor',
			desc: 'Full VS Code editing experience embedded.',
			icon: 'editor',
			color: 'from-pink-500 to-rose-500',
			initialX: -500,
			initialY: 100,
			initialRotate: -35
		},
		{
			title: 'Git-Backed Tasks',
			desc: 'Tasks stored in JSONL, committed to your repo.',
			icon: 'git',
			color: 'from-gray-500 to-gray-600',
			initialX: 400,
			initialY: -400,
			initialRotate: 50
		}
	];

	// Cards for scanner with unique code per card
	const cards = [
		{
			title: 'Tasks Dashboard',
			color: 'from-blue-600 to-cyan-500',
			tagline: 'All projects. One view.',
			bullets: ['12 ready tasks', '3 in progress', '2 blocked'],
			code: `$ bd ready --json
[{
  "id": "jat-7kx2m",
  "title": "Add OAuth",
  "priority": 1,
  "status": "open"
}]

$ bd list --project chimaro
jat-3nf8p [P0] Rate limit
jat-7kx2m [P1] OAuth flow`
		},
		{
			title: 'Agent Sessions',
			color: 'from-purple-600 to-pink-500',
			tagline: 'See every agent, live.',
			bullets: ['4 agents active', '2 awaiting input', '1 completing'],
			code: `$ am-agents --active
NAME       STATUS   TASK
BluePeak   working  jat-3nf8p
FairMist   idle     -

$ am-whoami
Agent: BluePeak
Model: opus-4
Task: jat-3nf8p`
		},
		{
			title: 'Epic Dependencies',
			color: 'from-emerald-600 to-teal-500',
			tagline: 'Ship features, not tasks.',
			bullets: ['Visual dep graph', 'Auto-blocked status', 'Progress tracking'],
			code: `$ bd dep tree jat-epic
jat-epic [BLOCKED]
├── jat-7kx OAuth [READY]
├── jat-8p Session [OPEN]
│   └── dep: jat-7kx
└── jat-9q Tests [OPEN]
    └── dep: jat-8p

Progress: 0/3`
		},
		{
			title: 'Smart Questions',
			color: 'from-amber-600 to-orange-500',
			tagline: 'Decisions surface to you.',
			bullets: ['Click to answer', 'Context included', 'No terminal digging'],
			code: `// Question surfaced
{
  "question": "Auth
    provider?",
  "options": [
    "Supabase ✓",
    "Auth0",
    "Custom JWT"
  ],
  "agent": "BluePeak"
}
> Selected: Option 1`
		},
		{
			title: 'Task Creation',
			color: 'from-rose-600 to-red-500',
			tagline: 'AI fills in the details.',
			bullets: ['Auto-suggest type', 'Smart priority', 'Label inference'],
			code: `$ bd create "Rate limit" \\
  --type feature \\
  --priority 0 \\
  --labels api,security

Created: jat-3nf8p

// AI Suggestions:
// Type: feature
// Priority: P0 (security)`
		},
	];

	// Feature sections data (for V11FeatureCard)
	const featureSections = [
		{
			category: 'Project Management',
			icon: 'kanban' as const,
			color: 'from-blue-500 to-cyan-500',
			desc: 'Structure that scales with your ambition',
			items: ['Multi-repo unified dashboard', 'Epics, features, tasks hierarchy', 'Dependency tracking', 'Priority-based work selection']
		},
		{
			category: 'Agent Orchestration',
			icon: 'robots' as const,
			color: 'from-purple-500 to-pink-500',
			desc: 'Command a swarm, not just one assistant',
			items: ['Spawn 40+ agents with one command', 'Auto-assignment to ready work', 'Real-time status monitoring', 'Smart question UI for decisions']
		},
		{
			category: 'Development Tools',
			icon: 'code' as const,
			color: 'from-emerald-500 to-teal-500',
			desc: 'Professional-grade, not toy-grade',
			items: ['Monaco editor integration', 'Git-backed everything', 'File reservation system', 'Automation rules engine']
		},
		{
			category: 'Team Workflows',
			icon: 'team' as const,
			color: 'from-amber-500 to-orange-500',
			desc: 'Built for how teams actually ship',
			items: ['PRD to task generation', 'Epic completion tracking', 'Audit trail for all changes', 'Works across all your projects']
		}
	];

	// Workflow steps
	const workflowSteps = [
		{
			step: '01',
			label: 'Input',
			badge: 'PRD Ready',
			title: 'Define the Work',
			desc: 'Start with a PRD, feature spec, or even a rough idea. Describe what you want to build in plain language.',
			code: `## User Authentication Feature

Users should be able to:
- Sign up with email/password
- Login with Google OAuth
- Reset forgotten passwords
- See their profile page`
		},
		{
			step: '02',
			label: 'Structure',
			badge: '5 Tasks',
			title: 'Generate Task Tree',
			desc: 'Run /jat:bead to convert your spec into a structured epic with tasks, priorities, and dependencies.',
			code: `/jat:bead

Creating epic: "User Authentication"
├─ jat-a1: Setup Supabase auth [P0]
├─ jat-a2: Create login forms [P1]
│   └─ depends on: jat-a1
├─ jat-a3: Implement Google OAuth [P1]
│   └─ depends on: jat-a1
├─ jat-a4: Build password reset [P2]
└─ jat-a5: Create profile page [P2]

5 tasks created with dependencies`
		},
		{
			step: '03',
			label: 'Scale',
			badge: '4 Agents',
			title: 'Launch the Swarm',
			desc: 'Spawn multiple agents across your projects. They pick ready tasks and start automatically.',
			code: `jat myproject 4 --auto

Spawning 4 agents...
  BluePeak  → jat-a1 (Setup Supabase)
  GoldBay   → chimaro-b3 (Fix OAuth)
  RedMarsh  → jat-c2 (API endpoints)
  FairCove  → other-d1 (Update docs)

4 agents working across 3 projects`
		},
		{
			step: '04',
			label: 'Control',
			badge: 'You Decide',
			title: 'Supervise from One Place',
			desc: 'All projects, all agents, one dashboard. Answer questions with a click. Watch progress in real-time.',
			code: `[Dashboard: 4 agents active]

BluePeak asks:
  "Supabase or Firebase for auth?"
  [1. Supabase (Recommended)]
  [2. Firebase]

GoldBay: Committing fix... ████░░ 80%
RedMarsh: Running tests...
FairCove: Task complete ✓`
		},
		{
			step: '05',
			label: 'Ship',
			badge: 'Done',
			title: 'Ship Structured Work',
			desc: 'Tasks complete, commits land, epics close. Full audit trail. Ready for the next batch.',
			code: `Epic "User Authentication" complete!

Tasks:     5/5 ✓
Commits:   12
Files:     34 changed
Tests:     All passing

Next ready tasks:
  → jat-b1: Dashboard analytics
  → jat-b2: Email notifications`
		}
	];

	onMount(() => {
		// === HERO: Particle field with connections ===
		if (heroCanvasEl) {
			const ctx = heroCanvasEl.getContext('2d');
			if (ctx) {
				let w = window.innerWidth;
				let h = window.innerHeight;
				heroCanvasEl.width = w;
				heroCanvasEl.height = h;

				const particles: Array<{x: number, y: number, vx: number, vy: number, size: number}> = [];
				const particleCount = 80;
				const connectionDistance = 150;

				for (let i = 0; i < particleCount; i++) {
					particles.push({
						x: Math.random() * w,
						y: Math.random() * h,
						vx: (Math.random() - 0.5) * 0.5,
						vy: (Math.random() - 0.5) * 0.5,
						size: Math.random() * 2 + 1
					});
				}

				const mouse = { x: w / 2, y: h / 2 };
				window.addEventListener('mousemove', (e) => {
					mouse.x = e.clientX;
					mouse.y = e.clientY;
				});

				function animateHero() {
					ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
					ctx.fillRect(0, 0, w, h);

					particles.forEach((p, i) => {
						const dx = mouse.x - p.x;
						const dy = mouse.y - p.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < 200) {
							p.vx += dx * 0.00005;
							p.vy += dy * 0.00005;
						}

						p.x += p.vx;
						p.y += p.vy;

						if (p.x < 0 || p.x > w) p.vx *= -1;
						if (p.y < 0 || p.y > h) p.vy *= -1;

						p.vx *= 0.99;
						p.vy *= 0.99;

						ctx.beginPath();
						ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
						ctx.fillStyle = 'rgba(139, 92, 246, 0.8)';
						ctx.fill();

						particles.forEach((p2, j) => {
							if (j <= i) return;
							const d = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
							if (d < connectionDistance) {
								ctx.beginPath();
								ctx.moveTo(p.x, p.y);
								ctx.lineTo(p2.x, p2.y);
								ctx.strokeStyle = `rgba(139, 92, 246, ${(1 - d / connectionDistance) * 0.3})`;
								ctx.stroke();
							}
						});
					});

					requestAnimationFrame(animateHero);
				}

				animateHero();

				window.addEventListener('resize', () => {
					w = window.innerWidth;
					h = window.innerHeight;
					heroCanvasEl.width = w;
					heroCanvasEl.height = h;
				});
			}
		}

		// === SCANNER EFFECT ===
		let position = window.innerWidth;

		function animateCards() {
			if (!cardLineEl) return;

			position -= 1.2;
			const totalWidth = cards.length * 2 * 360;
			if (position < -totalWidth / 2) position = 0;

			cardLineEl.style.transform = `translateX(${position}px)`;
			updateClipping();
			requestAnimationFrame(animateCards);
		}

		function updateClipping() {
			const scannerX = window.innerWidth / 2;
			const scannerWidth = 6;
			const scannerLeft = scannerX - scannerWidth / 2;
			const scannerRight = scannerX + scannerWidth / 2;

			document.querySelectorAll('.scanner-card-wrapper').forEach((wrapper) => {
				const rect = wrapper.getBoundingClientRect();
				const cardLeft = rect.left;
				const cardRight = rect.right;
				const cardWidth = rect.width;

				const codeCard = wrapper.querySelector('.card-front') as HTMLElement; // Terminal/code
				const uiCard = wrapper.querySelector('.card-back') as HTMLElement; // Beautiful UI

				if (!codeCard || !uiCard) return;

				// Reversed: code shows before scanner, UI reveals after
				if (cardLeft < scannerRight && cardRight > scannerLeft) {
					// Card is passing through scanner
					const intersectLeft = Math.max(scannerLeft - cardLeft, 0);
					const intersectRight = Math.min(scannerRight - cardLeft, cardWidth);
					// Code gets clipped from left as it passes through
					codeCard.style.clipPath = `inset(0 0 0 ${(intersectRight / cardWidth) * 100}%)`;
					// UI reveals from left
					uiCard.style.clipPath = `inset(0 ${100 - (intersectRight / cardWidth) * 100}% 0 0)`;
				} else if (cardRight < scannerLeft) {
					// Card has passed through scanner - show UI
					codeCard.style.clipPath = 'inset(0 0 0 100%)';
					uiCard.style.clipPath = 'inset(0 0 0 0)';
				} else {
					// Card hasn't reached scanner yet - show code
					codeCard.style.clipPath = 'inset(0 0 0 0)';
					uiCard.style.clipPath = 'inset(0 100% 0 0)';
				}
			});
		}

		// Delay animation start to ensure cardLineEl is bound
		setTimeout(() => {
			if (cardLineEl) {
				// Reset position to start cards from left edge
				position = -300;
				animateCards();
			}
		}, 100);

		// Scanner particles
		if (scannerCanvasEl) {
			const ctx = scannerCanvasEl.getContext('2d');
			if (ctx) {
				const w = window.innerWidth;
				const h = 200;
				scannerCanvasEl.width = w;
				scannerCanvasEl.height = h;

				const particles: Array<{x: number, y: number, vx: number, life: number}> = [];

				function animateScanner() {
					ctx.clearRect(0, 0, w, h);

					const gradient = ctx.createLinearGradient(w/2 - 15, 0, w/2 + 15, 0);
					gradient.addColorStop(0, 'rgba(139, 92, 246, 0)');
					gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
					gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
					ctx.fillStyle = gradient;
					ctx.fillRect(w/2 - 15, 0, 30, h);

					// Particles drift LEFT (same direction as card flow: chaos→clarity)
					if (Math.random() < 0.4) {
						particles.push({
							x: w/2 + (Math.random() - 0.5) * 4,
							y: Math.random() * h,
							vx: -(Math.random() * 0.8 + 0.3), // Negative = drift left
							life: 1
						});
					}

					for (let i = particles.length - 1; i >= 0; i--) {
						const p = particles[i];
						p.x += p.vx;
						p.life -= 0.015;

						if (p.life <= 0 || p.x < 0) { // Check left boundary now
							particles.splice(i, 1);
							continue;
						}

						ctx.beginPath();
						ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
						ctx.fillStyle = `rgba(196, 181, 253, ${p.life * 0.7})`;
						ctx.fill();
					}

					requestAnimationFrame(animateScanner);
				}

				animateScanner();
			}
		}

		// === CHAOS CARDS SCROLL-INDEXED ANIMATION ===
		function updateChaosProgress() {
			if (!chaosSection) return;

			const rect = chaosSection.getBoundingClientRect();
			const windowHeight = window.innerHeight;

			// Start animation when section enters viewport from bottom
			// Complete when section is centered in viewport
			const startPoint = windowHeight; // Section top enters bottom of viewport
			const endPoint = windowHeight * 0.36; // Section top is 36% from top of viewport (20% slower)

			if (rect.top >= startPoint) {
				chaosProgress = 0;
			} else if (rect.top <= endPoint) {
				chaosProgress = 1;
			} else {
				chaosProgress = 1 - (rect.top - endPoint) / (startPoint - endPoint);
			}
		}

		window.addEventListener('scroll', updateChaosProgress, { passive: true });
		updateChaosProgress(); // Initial check
	});
</script>

<svelte:head>
	<title>JAT - The World's First Agentic IDE</title>
</svelte:head>

<!-- HERO with particle network -->
<section class="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
	<canvas bind:this={heroCanvasEl} class="absolute inset-0 z-0"></canvas>

	<div class="relative z-10 max-w-5xl mx-auto px-6 text-center">
		<div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 backdrop-blur border border-violet-500/30 mb-8">
			<span class="relative flex h-2 w-2">
				<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
				<span class="relative inline-flex rounded-full h-2 w-2 bg-violet-400"></span>
			</span>
			<span class="text-sm text-violet-200 shimmer-text-slow">The World's First Agentic IDE</span>
		</div>

		<h1 class="text-5xl md:text-7xl font-bold text-white mb-6">
			Where AI Agents
			<span class="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
				Become a Team.
			</span>
		</h1>

		<p class="text-xl text-gray-300 max-w-3xl mx-auto mb-10 leading-relaxed">
			Task management. Agent orchestration. Multi-project dashboards. The complete environment for AI-assisted development at scale.
		</p>

		<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
			<a href="#install" class="group relative px-8 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all">
				<span class="relative z-10">Get Started Free</span>
			</a>
			<a href="#scanner" class="px-8 py-4 rounded-full font-semibold border border-white/20 text-white hover:bg-white/10 transition-all">
				See It In Action
			</a>
		</div>

		<div class="mt-16 flex items-center justify-center gap-12 text-center">
			<div>
				<div class="text-3xl font-bold text-white">40+</div>
				<div class="text-sm text-gray-500">Agents</div>
			</div>
			<div class="w-px h-12 bg-gray-800"></div>
			<div>
				<div class="text-3xl font-bold text-white">All</div>
				<div class="text-sm text-gray-500">Projects</div>
			</div>
			<div class="w-px h-12 bg-gray-800"></div>
			<div>
				<div class="text-3xl font-bold text-white">1</div>
				<div class="text-sm text-gray-500">Dashboard</div>
			</div>
		</div>
	</div>
</section>

<!-- SCANNER SECTION -->
<section id="scanner" class="relative py-24 bg-black overflow-hidden">
	<div class="text-center mb-12">
		<h2 class="text-3xl font-bold text-white mb-3">From Chaos to Clarity</h2>
		<p class="text-gray-400">Terminal spam goes in. Beautiful, actionable UI comes out.</p>
	</div>

	<div class="relative h-[200px] flex items-center">
		<canvas bind:this={scannerCanvasEl} class="absolute inset-0 z-10 pointer-events-none"></canvas>

		<div class="absolute w-full h-full flex items-center overflow-visible">
			<div bind:this={cardLineEl} class="flex items-center gap-10" style="will-change: transform;">
				{#each [...cards, ...cards] as card}
					<div class="scanner-card-wrapper relative w-[300px] h-[180px] flex-shrink-0">
						<!-- Code/Terminal side (shows BEFORE scanner) -->
						<div class="card-front absolute inset-0 rounded-xl bg-gray-900 border border-gray-700 p-4 overflow-hidden">
							<div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
								<div class="w-2 h-2 rounded-full bg-red-500/60"></div>
								<div class="w-2 h-2 rounded-full bg-yellow-500/60"></div>
								<div class="w-2 h-2 rounded-full bg-green-500/60"></div>
								<span class="text-[9px] text-gray-500 font-mono ml-1">terminal</span>
							</div>
							<pre class="text-green-400/70 text-[9px] leading-tight font-mono overflow-hidden">{card.code}</pre>
						</div>
						<!-- Beautiful UI side (reveals AFTER scanner) -->
						<div class="card-back absolute inset-0 rounded-xl bg-gradient-to-br {card.color} p-5 shadow-xl">
							<div class="text-xs font-mono text-white/60 mb-1">JAT</div>
							<div class="text-lg font-bold text-white">{card.title}</div>
							<div class="mt-3 p-3 rounded bg-black/20 border border-white/10">
								<div class="text-xs text-white/90 font-medium mb-2">{card.tagline}</div>
								<div class="space-y-1">
									{#each card.bullets as bullet}
										<div class="flex items-center gap-1.5 text-[10px] text-white/70">
											<span class="w-1 h-1 rounded-full bg-white/50"></span>
											{bullet}
										</div>
									{/each}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-white to-transparent z-20"></div>
	</div>
</section>

<!-- EVERYTHING IN ONE PLACE - Chaos to Order -->
<section bind:this={chaosSection} class="relative py-32 bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden">
	<!-- Gravity well background - particles pulled to center -->
	<div class="absolute inset-0 opacity-40">
		<V14GravityWell particleCount={80} pullStrength={0.015} />
	</div>
	<div class="relative z-10 max-w-6xl mx-auto px-6">
		<div class="text-center mb-20">
			<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Everything in One Place</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				No more juggling between terminals, browsers, and task boards.
			</p>
		</div>

		<div class="relative min-h-[500px]">
			<!-- Chaos cards grid -->
			<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
				{#each chaosCards as card, i}
					{@const cardProgress = Math.min(1, Math.max(0, (chaosProgress - i * 0.08) / 0.6))}
					{@const currentX = card.initialX * (1 - cardProgress)}
					{@const currentY = card.initialY * (1 - cardProgress)}
					{@const currentRotate = card.initialRotate * (1 - cardProgress)}
					{@const currentScale = 0.8 + 0.2 * cardProgress}
					{@const currentOpacity = cardProgress}
					<div
						class="chaos-card group relative p-6 rounded-2xl bg-gray-800/80 border border-gray-700 backdrop-blur-sm hover:border-gray-500"
						class:chaos-complete={chaosProgress >= 1}
						style="transform: translate({currentX}px, {currentY}px) rotate({currentRotate}deg) scale({currentScale}); opacity: {currentOpacity};"
					>
						<!-- Glow effect -->
						<div class="absolute inset-0 rounded-2xl bg-gradient-to-br {card.color} opacity-0 group-hover:opacity-20 transition-opacity blur-xl"></div>

						<div class="relative z-10">
							<!-- Icon -->
							<div class="w-12 h-12 rounded-xl bg-gradient-to-br {card.color} p-0.5 mb-4">
								<div class="w-full h-full rounded-[10px] bg-gray-900 flex items-center justify-center">
									{#if card.icon === 'swarm'}
										<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<circle cx="6" cy="6" r="2" stroke-width="2"/>
											<circle cx="18" cy="6" r="2" stroke-width="2"/>
											<circle cx="6" cy="18" r="2" stroke-width="2"/>
											<circle cx="18" cy="18" r="2" stroke-width="2"/>
											<circle cx="12" cy="12" r="3" stroke-width="2"/>
											<path stroke-linecap="round" stroke-width="1.5" d="M8 8l2.5 2.5M16 8l-2.5 2.5M8 16l2.5-2.5M16 16l-2.5-2.5"/>
										</svg>
									{:else if card.icon === 'question'}
										<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
										</svg>
									{:else if card.icon === 'tree'}
										<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10M4 18h6"/>
											<circle cx="18" cy="14" r="2" stroke-width="2"/>
											<circle cx="14" cy="18" r="2" stroke-width="2"/>
										</svg>
									{:else if card.icon === 'auto'}
										<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
										</svg>
									{:else if card.icon === 'editor'}
										<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
										</svg>
									{:else if card.icon === 'git'}
										<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<circle cx="12" cy="6" r="3" stroke-width="2"/>
											<circle cx="6" cy="18" r="3" stroke-width="2"/>
											<circle cx="18" cy="18" r="3" stroke-width="2"/>
											<path stroke-linecap="round" stroke-width="2" d="M12 9v3M9 15l3-3 3 3"/>
										</svg>
									{/if}
								</div>
							</div>

							<h3 class="text-lg font-bold text-white mb-2">{card.title}</h3>
							<p class="text-sm text-gray-400">{card.desc}</p>
						</div>

						<!-- Floating particles when complete -->
						{#if chaosProgress >= 1}
							<div class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-gradient-to-r {card.color} animate-ping opacity-75" style="animation-delay: {i * 0.2}s;"></div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- "JAT tames the chaos" indicator -->
			<div
				class="absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-300"
				style="opacity: {Math.max(0, 1 - chaosProgress * 3)};"
			>
				<div class="text-center">
					<div class="w-16 h-16 rounded-full bg-violet-500/20 border border-violet-500/50 flex items-center justify-center mx-auto mb-4 animate-pulse">
						<svg class="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
						</svg>
					</div>
					<p class="text-violet-400 text-sm font-medium">Scroll to bring order...</p>
				</div>
			</div>
		</div>

		<!-- Tagline after animation -->
		<div
			class="text-center mt-12 transition-all duration-500"
			style="opacity: {Math.max(0, (chaosProgress - 0.7) / 0.3)}; transform: translateY({(1 - Math.min(1, Math.max(0, (chaosProgress - 0.7) / 0.3))) * 20}px);"
		>
			<p class="text-lg text-gray-400">
				<span class="text-white font-semibold">JAT brings order to the chaos</span> — one dashboard to rule them all.
			</p>
		</div>
	</div>
</section>

<!-- THE ALIEN TOOL PROBLEM -->
<section class="py-32 bg-gradient-to-b from-gray-900 via-[#0c0c14] to-black relative overflow-hidden">
	<!-- Subtle grid background -->
	<div class="absolute inset-0 opacity-[0.03]" style="background-size: 40px 40px; background-image: linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px);"></div>

	<div class="max-w-5xl mx-auto px-6 relative z-10">
		<!-- Quote block -->
		<div class="relative mb-16">
			<div class="absolute -top-6 -left-4 text-6xl text-violet-500/20 font-serif">"</div>
			<blockquote class="text-lg md:text-xl text-gray-300 leading-relaxed pl-8 border-l-2 border-violet-500/30">
				<p class="mb-4 shimmer-text-slow">
					Clearly some powerful <span class="font-semibold">alien tool</span> was handed around except it comes with no manual and everyone has to figure out how to hold it and operate it...
					
					<span class="text-gray-500 italic">
					agents, subagents, prompts, contexts, memory, modes, permissions, tools, plugins, skills, hooks, MCP, workflows...
					</span>
				</p>
			</blockquote>
			<cite class="block mt-4 pl-8 text-sm text-gray-500">
				— <a href="https://x.com/karpathy/status/2004607146781278521" class="text-violet-400 hover:text-violet-300">@karpathy</a>, on the state of AI-assisted programming
			</cite>
		</div>

		<!-- The solution -->
		<div class="text-center mb-12">
			<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
				JAT is the Manual.
			</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				One unified configuration brings all those pieces together — with guardrails that let agents do deep work without doing harm.
			</p>
		</div>

		<!-- Config visualization -->
		<div class="grid md:grid-cols-2 gap-8 items-stretch">
			<!-- Left: The chaos list -->
			<div class="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
				<h3 class="text-sm font-mono text-red-400/80 mb-4 flex items-center gap-2">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
					</svg>
					WITHOUT STRUCTURE
				</h3>
				<div class="space-y-2 text-sm text-gray-500">
					{#each ['Agents running unconstrained', 'No file coordination', 'Lost context between sessions', 'Manual permission management', 'Scattered configurations', 'Hope-based error recovery', 'One agent = one task (maybe)', 'Constant supervision required'] as item}
						<div class="flex items-center gap-2">
							<span class="w-1.5 h-1.5 rounded-full bg-red-500/50"></span>
							{item}
						</div>
					{/each}
				</div>
			</div>

			<!-- Right: JAT config -->
			<div class="p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/30">
				<h3 class="text-sm font-mono text-green-400 mb-4 flex items-center gap-2">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
					</svg>
					WITH JAT /CONFIG
				</h3>
				<div class="space-y-2 text-sm">
					{#each [
						{ text: 'Hooks gate dangerous operations', color: 'text-cyan-400' },
						{ text: 'File reservations prevent conflicts', color: 'text-violet-400' },
						{ text: 'Session context persists across restarts', color: 'text-cyan-400' },
						{ text: 'Auto-proceed rules for safe patterns', color: 'text-violet-400' },
						{ text: 'Unified settings per project', color: 'text-cyan-400' },
						{ text: 'Structured completion with verification', color: 'text-violet-400' },
						{ text: '40+ agents working in parallel', color: 'text-cyan-400' },
						{ text: 'Async oversight — check in when ready', color: 'text-violet-400' }
					] as item}
						<div class="flex items-center gap-2 {item.color}">
							<svg class="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
							{item.text}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Bottom tagline -->
		<div class="text-center mt-12">
			<p class="text-gray-500 shimmer-text-slow">
				The alien tool came with no manual. <span class="text-white">So we wrote one.</span>
			</p>
		</div>
	</div>
</section>

<!-- FEATURES GRID - Using V11FeatureCard -->
<section id="features" class="py-24 bg-gradient-to-b from-black to-gray-900">
	<div class="max-w-6xl mx-auto px-6">
		<div class="text-center mb-16" use:scrollReveal>
			<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Everything an Agentic IDE Needs</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				Built from the ground up for AI-first development at scale.
			</p>
		</div>

		<div class="grid md:grid-cols-2 gap-6">
			{#each featureSections as section, i}
				<V11FeatureCard
					title={section.category}
					description={section.desc}
					icon={section.icon}
					gradient={section.color}
					items={section.items}
					delay={i * 100}
				/>
			{/each}
		</div>
	</div>
</section>

<!-- WORKFLOW SECTION -->
<section id="workflow" class="py-24 bg-gray-900">
	<div class="max-w-6xl mx-auto px-6">
		<div class="text-center mb-16" use:scrollReveal>
			<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">From Spec to Shipped</h2>
			<p class="text-gray-400 text-lg max-w-2xl mx-auto">
				The workflow that makes 40 agents manageable. Structure in, structure out.
			</p>
		</div>

		<div class="space-y-6" use:staggerChildren={{ stagger: 100 }}>
			{#each workflowSteps as step, i}
				<div class="group relative flex flex-col md:flex-row gap-6 p-6 rounded-2xl bg-gray-800/50 border border-gray-700 hover:border-violet-500/50 transition-all workflow-step">
					<!-- Step indicator -->
					<div class="shrink-0 flex items-start gap-4">
						<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-violet-500/30 transition-shadow">
							<span class="text-2xl font-bold text-white">{step.step}</span>
						</div>
						<div class="md:hidden">
							<div class="text-xs text-gray-500 uppercase tracking-wider">{step.label}</div>
							<div class="inline-block px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-xs font-medium mt-1">{step.badge}</div>
						</div>
					</div>

					<!-- Content -->
					<div class="flex-1 min-w-0">
						<div class="hidden md:flex items-center gap-3 mb-2">
							<div class="text-xs text-gray-500 uppercase tracking-wider">{step.label}</div>
							<div class="inline-block px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-xs font-medium">{step.badge}</div>
						</div>
						<h3 class="text-xl font-bold text-white mb-2">{step.title}</h3>
						<p class="text-gray-400 mb-4">{step.desc}</p>

						<!-- Code block -->
						<div class="rounded-lg bg-gray-900 border border-gray-700 overflow-hidden">
							<div class="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
								<div class="w-3 h-3 rounded-full bg-red-500/50"></div>
								<div class="w-3 h-3 rounded-full bg-yellow-500/50"></div>
								<div class="w-3 h-3 rounded-full bg-green-500/50"></div>
								<span class="ml-2 text-xs text-gray-500 font-mono">jat</span>
							</div>
							<pre class="p-4 text-sm text-gray-300 font-mono overflow-x-auto"><code>{step.code}</code></pre>
						</div>
					</div>

					<!-- Connector line -->
					{#if i < workflowSteps.length - 1}
						<div class="hidden md:block absolute left-[2.5rem] top-[5.5rem] w-0.5 h-[calc(100%-1rem)] bg-gradient-to-b from-violet-500/50 to-transparent"></div>
					{/if}
				</div>
			{/each}
		</div>

		<p class="text-center text-gray-400 mt-12 text-lg" use:scrollReveal>
			This is how you go from "I have an idea" to "It's in production" - with 40 agents helping along the way.
		</p>
	</div>
</section>

<!-- VIDEO DEMO SECTION -->
<section id="demo" class="py-24 bg-black">
	<div class="max-w-4xl mx-auto px-6">
		<div class="text-center mb-12" use:scrollReveal>
			<h2 class="text-3xl font-bold text-white mb-4">See It in Action</h2>
			<p class="text-gray-400">Watch a real development session with multiple agents working in parallel.</p>
		</div>

		<div class="relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-700 video-container" use:scrollReveal={{ delay: 100 }}>
			<!-- Video placeholder -->
			<div class="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
				<div class="text-center">
					<div class="w-20 h-20 rounded-full bg-violet-500/20 border border-violet-500/50 flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-violet-500/30 hover:scale-105 transition-all">
						<svg class="w-8 h-8 text-violet-400 ml-1" fill="currentColor" viewBox="0 0 24 24">
							<path d="M8 5v14l11-7z"/>
						</svg>
					</div>
					<div class="text-lg font-semibold text-white">JAT Dashboard</div>
					<div class="text-sm text-gray-500 mt-1">Demo video coming soon</div>
				</div>
			</div>

			<!-- Stats bar -->
			<div class="flex items-center justify-center gap-8 py-4 bg-gray-800/50 border-t border-gray-700">
				<div class="text-center">
					<div class="text-lg font-bold text-white">2:47</div>
					<div class="text-xs text-gray-500">Duration</div>
				</div>
				<div class="w-px h-8 bg-gray-700"></div>
				<div class="text-center">
					<div class="text-lg font-bold text-white">4 Agents</div>
					<div class="text-xs text-gray-500">Working in Parallel</div>
				</div>
				<div class="w-px h-8 bg-gray-700"></div>
				<div class="text-center">
					<div class="text-lg font-bold text-white">12 Tasks</div>
					<div class="text-xs text-gray-500">Completed</div>
				</div>
			</div>
		</div>
	</div>
</section>

<Footer />

<style>
	.card-front, .card-back {
		transition: clip-path 0.03s linear;
	}

	/* Chaos cards - scroll-indexed animation */
	.chaos-card {
		will-change: transform, opacity;
	}

	/* Add hover lift effect when animation complete */
	.chaos-card.chaos-complete {
		transition: transform 0.3s ease, border-color 0.3s ease;
	}

	.chaos-card.chaos-complete:hover {
		transform: translate(0, -4px) rotate(0deg) scale(1.02) !important;
	}

	/* Workflow step interactions */
	.workflow-step {
		transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
	}

	.workflow-step:hover {
		transform: translateX(4px);
		box-shadow: 0 10px 30px rgba(139, 92, 246, 0.1);
	}

	/* Video container hover */
	.video-container {
		transition: transform 0.3s ease, box-shadow 0.3s ease;
	}

	.video-container:hover {
		box-shadow: 0 20px 60px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(139, 92, 246, 0.2);
	}

	/* Reduced motion - show cards immediately */
	@media (prefers-reduced-motion: reduce) {
		.chaos-card {
			transform: none !important;
			opacity: 1 !important;
		}

		.workflow-step:hover,
		.video-container:hover {
			transform: none;
		}
	}
</style>
