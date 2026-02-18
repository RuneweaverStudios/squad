<script lang="ts">
	/**
	 * WelcomeScreen Component
	 * Shows a friendly onboarding screen when no projects are detected.
	 *
	 * Features:
	 * - Explanation of what projects are needed
	 * - Button to open CreateProjectDrawer
	 * - Manual instructions as fallback
	 */

	import { openProjectDrawer } from '$lib/stores/drawerStore';

	// Props
	interface Props {
		onAddProject?: () => void;
	}
	let { onAddProject }: Props = $props();

	// Collapse state for manual instructions
	let showManualInstructions = $state(false);

	function handleAddProject() {
		if (onAddProject) {
			onAddProject();
		} else {
			openProjectDrawer();
		}
	}
</script>

<div class="min-h-[70vh] flex items-center justify-center p-8">
	<div class="max-w-2xl w-full">
		<!-- Hero section -->
		<div class="text-center mb-10">
			<!-- Logo/Icon -->
			<div class="relative inline-block mb-6">
				<div
					class="w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg"
					style="
						background: linear-gradient(135deg, oklch(0.55 0.18 240) 0%, oklch(0.45 0.18 260) 100%);
						box-shadow: 0 8px 32px oklch(0.55 0.18 240 / 0.3);
					"
				>
					<svg class="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
					</svg>
				</div>
				<!-- Decorative elements -->
				<div
					class="absolute -top-2 -right-2 w-6 h-6 rounded-full"
					style="background: oklch(0.75 0.15 145);"
				></div>
				<div
					class="absolute -bottom-1 -left-3 w-4 h-4 rounded-full"
					style="background: oklch(0.75 0.18 85);"
				></div>
			</div>

			<h1 class="text-3xl font-bold mb-3" style="color: oklch(0.90 0.02 250);">
				Welcome to SQUAD IDE
			</h1>
			<p class="text-lg" style="color: oklch(0.65 0.02 250);">
				Your multi-agent development command center
			</p>
		</div>

		<!-- Getting started card -->
		<div
			class="rounded-2xl p-8 mb-6"
			style="
				background: linear-gradient(180deg, oklch(0.20 0.01 250) 0%, oklch(0.18 0.01 250) 100%);
				border: 1px solid oklch(0.30 0.02 250);
				box-shadow: 0 4px 24px oklch(0 0 0 / 0.3);
			"
		>
			<h2 class="text-xl font-semibold mb-4 flex items-center gap-3" style="color: oklch(0.85 0.02 250);">
				<svg class="w-6 h-6" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
				Get Started
			</h2>

			<p class="mb-6" style="color: oklch(0.70 0.02 250);">
				SQUAD tracks tasks across your projects using <strong style="color: oklch(0.80 0.10 200);">SQUAD Tasks</strong> - a lightweight, git-friendly task system. To start, add a project from your <code class="px-1 py-0.5 rounded text-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">~/code/</code> directory.
			</p>

			<!-- What is a project? -->
			<div
				class="rounded-lg p-4 mb-6"
				style="background: oklch(0.15 0.01 250); border: 1px solid oklch(0.25 0.02 250);"
			>
				<h3 class="font-medium mb-3 flex items-center gap-2" style="color: oklch(0.80 0.02 250);">
					<svg class="w-5 h-5" style="color: oklch(0.70 0.15 240);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					What makes a valid project?
				</h3>
				<ul class="space-y-2" style="color: oklch(0.65 0.02 250);">
					<li class="flex items-start gap-2">
						<svg class="w-5 h-5 flex-shrink-0 mt-0.5" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span>A <strong>git repository</strong> in <code class="px-1 rounded text-sm" style="background: oklch(0.25 0.02 250);">~/code/</code></span>
					</li>
					<li class="flex items-start gap-2">
						<svg class="w-5 h-5 flex-shrink-0 mt-0.5" style="color: oklch(0.70 0.18 145);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span>Initialized with <strong>SQUAD Tasks</strong> (creates a <code class="px-1 rounded text-sm" style="background: oklch(0.25 0.02 250);">.squad/</code> directory)</span>
					</li>
				</ul>
			</div>

			<!-- Add Project button -->
			<button
				class="btn btn-lg w-full gap-3 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
				style="
					background: linear-gradient(135deg, oklch(0.55 0.18 145) 0%, oklch(0.45 0.18 160) 100%);
					border: none;
					box-shadow: 0 4px 16px oklch(0.55 0.18 145 / 0.4);
				"
				onclick={handleAddProject}
			>
				<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Your First Project
			</button>
		</div>

		<!-- Manual instructions (collapsible) -->
		<div
			class="rounded-xl overflow-hidden"
			style="
				background: oklch(0.18 0.01 250);
				border: 1px solid oklch(0.25 0.02 250);
			"
		>
			<button
				class="w-full px-6 py-4 flex items-center justify-between transition-colors hover:bg-base-300/20"
				onclick={() => showManualInstructions = !showManualInstructions}
			>
				<span class="flex items-center gap-2" style="color: oklch(0.65 0.02 250);">
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					Prefer the command line?
				</span>
				<svg
					class="w-5 h-5 transition-transform duration-200"
					class:rotate-180={showManualInstructions}
					style="color: oklch(0.55 0.02 250);"
					fill="none" viewBox="0 0 24 24" stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{#if showManualInstructions}
				<div class="px-6 pb-6 space-y-4" style="border-top: 1px solid oklch(0.25 0.02 250);">
					<div class="pt-4">
						<p class="text-sm mb-4" style="color: oklch(0.60 0.02 250);">
							Initialize a project manually from your terminal:
						</p>

						<div class="space-y-3">
							<div
								class="rounded-lg p-4 font-mono text-sm"
								style="background: oklch(0.12 0.01 250); border: 1px solid oklch(0.22 0.02 250);"
							>
								<div class="flex items-center gap-2 mb-2" style="color: oklch(0.50 0.02 250);">
									<span class="text-xs uppercase tracking-wider">Step 1: Navigate to your project</span>
								</div>
								<code style="color: oklch(0.75 0.15 85);">cd ~/code/my-project</code>
							</div>

							<div
								class="rounded-lg p-4 font-mono text-sm"
								style="background: oklch(0.12 0.01 250); border: 1px solid oklch(0.22 0.02 250);"
							>
								<div class="flex items-center gap-2 mb-2" style="color: oklch(0.50 0.02 250);">
									<span class="text-xs uppercase tracking-wider">Step 2: Initialize SQUAD Tasks</span>
								</div>
								<code style="color: oklch(0.75 0.15 85);">st init</code>
							</div>

							<div
								class="rounded-lg p-4 font-mono text-sm"
								style="background: oklch(0.12 0.01 250); border: 1px solid oklch(0.22 0.02 250);"
							>
								<div class="flex items-center gap-2 mb-2" style="color: oklch(0.50 0.02 250);">
									<span class="text-xs uppercase tracking-wider">Step 3: Refresh this page</span>
								</div>
								<code style="color: oklch(0.75 0.15 145);">Your project will appear automatically!</code>
							</div>
						</div>
					</div>

					<div
						class="rounded-lg p-4 flex items-start gap-3"
						style="background: oklch(0.20 0.08 85 / 0.15); border: 1px solid oklch(0.50 0.15 85 / 0.3);"
					>
						<svg class="w-5 h-5 flex-shrink-0 mt-0.5" style="color: oklch(0.70 0.18 85);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<div class="text-sm" style="color: oklch(0.75 0.10 85);">
							<strong>Tip:</strong> The IDE automatically discovers any project in <code class="px-1 rounded" style="background: oklch(0.25 0.02 250);">~/code/</code> that has a <code class="px-1 rounded" style="background: oklch(0.25 0.02 250);">.squad/</code> directory.
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Footer links -->
		<div class="mt-8 text-center">
			<p class="text-sm" style="color: oklch(0.50 0.02 250);">
				Need help?
				<a
					href="https://github.com/joewinke/jomarchy"
					target="_blank"
					rel="noopener noreferrer"
					class="underline hover:no-underline transition-colors"
					style="color: oklch(0.65 0.12 240);"
				>
					Jomarchy documentation
				</a>
				&middot;
				<a
					href="https://github.com/RuneweaverStudios/squad"
					target="_blank"
					rel="noopener noreferrer"
					class="underline hover:no-underline transition-colors"
					style="color: oklch(0.65 0.12 240);"
				>
					SQUAD documentation
				</a>
			</p>
		</div>
	</div>
</div>
