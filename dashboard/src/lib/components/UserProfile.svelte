<script lang="ts">
	/**
	 * UserProfile Component
	 *
	 * User profile dropdown with theme selector, sound settings, and terminal settings.
	 * Shows avatar with user info, theme picker, sound toggle, and terminal height slider.
	 * Uses DaisyUI dropdown component.
	 *
	 * Note: This is a placeholder component. No authentication system implemented yet.
	 * Replace with real user data when auth is added.
	 */

	import { onMount } from 'svelte';
	import ThemeSelector from './ThemeSelector.svelte';
	import {
		areSoundsEnabled,
		enableSounds,
		disableSounds,
		playSuccessChime
	} from '$lib/utils/soundEffects';
	import {
		isSparklineVisible,
		toggleSparkline
	} from '$lib/utils/sparklinePreferences';

	// Placeholder user data
	const user = {
		name: 'Agent User',
		initials: 'AU',
		email: 'agent@example.com'
	};

	// User icon SVG path
	const userIcon =
		'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z';

	// Sound icon paths
	const soundOnIcon = 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z';
	const soundOffIcon = 'M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z';

	// Sound settings
	let soundsEnabled = $state(false);
	let isSoundAnimating = $state(false);

	// Sparkline visibility
	let sparklineVisible = $state(true);
	let isSparklineAnimating = $state(false);

	// Help modal
	let showHelpModal = $state(false);

	// Keyboard icon path
	const keyboardIcon = 'M6.75 3a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0017.25 3H6.75zm0 1.5h10.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V5.25a.75.75 0 01.75-.75z';
	const questionIcon = 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z';

	// Chart/sparkline icon path
	const chartIcon = 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6';

	// Terminal height settings (global user preference)
	const TERMINAL_HEIGHT_KEY = 'user-terminal-height';
	const DEFAULT_TERMINAL_HEIGHT = 50;
	const MIN_TERMINAL_HEIGHT = 20;
	const MAX_TERMINAL_HEIGHT = 150;
	let terminalHeight = $state(DEFAULT_TERMINAL_HEIGHT);

	onMount(() => {
		// Load saved sound preference
		soundsEnabled = areSoundsEnabled();

		// Load saved sparkline visibility preference
		sparklineVisible = isSparklineVisible();

		// Load saved terminal height
		const saved = localStorage.getItem(TERMINAL_HEIGHT_KEY);
		if (saved) {
			const parsed = parseInt(saved, 10);
			if (!isNaN(parsed) && parsed >= MIN_TERMINAL_HEIGHT && parsed <= MAX_TERMINAL_HEIGHT) {
				terminalHeight = parsed;
			}
		}
	});

	function handleSoundToggle() {
		// Trigger animation
		isSoundAnimating = true;

		// Toggle sound after brief delay to let animation start
		setTimeout(() => {
			if (soundsEnabled) {
				disableSounds();
				soundsEnabled = false;
			} else {
				enableSounds();
				soundsEnabled = true;
				// Play a test sound so user knows it works
				setTimeout(() => playSuccessChime(), 100);
			}
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isSoundAnimating = false;
		}, 400);
	}

	function handleSparklineToggle() {
		// Trigger animation
		isSparklineAnimating = true;

		// Toggle after brief delay
		setTimeout(() => {
			sparklineVisible = toggleSparkline();
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isSparklineAnimating = false;
		}, 400);
	}

	function handleHeightChange(newHeight: number) {
		terminalHeight = newHeight;
		localStorage.setItem(TERMINAL_HEIGHT_KEY, newHeight.toString());
		// Dispatch custom event so WorkCard/SessionCard can react
		window.dispatchEvent(new CustomEvent('terminal-height-changed', { detail: newHeight }));
	}
</script>

<div class="dropdown dropdown-end">
	<!-- Avatar Button - Industrial -->
	<button
		tabindex="0"
		class="flex items-center justify-center w-7 h-7 rounded transition-all hover:scale-105"
		style="
			background: oklch(0.18 0.01 250);
			border: 1px solid oklch(0.35 0.02 250);
		"
		aria-label="User profile menu"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="w-4 h-4"
			style="color: oklch(0.70 0.18 240);"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d={userIcon} />
		</svg>
	</button>

	<!-- Dropdown Menu - Industrial -->
	<ul
		tabindex="0"
		class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow-lg rounded w-52"
		style="
			background: oklch(0.20 0.01 250);
			border: 1px solid oklch(0.35 0.02 250);
		"
	>
		<!-- Help & Shortcuts -->
		<li>
			<button
				onclick={() => showHelpModal = true}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors hover:bg-base-300"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4"
					style="color: oklch(0.70 0.18 240);"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={questionIcon} />
				</svg>
				<span class="text-xs flex-1 text-left" style="color: oklch(0.70 0.02 250);">
					Help & Shortcuts
				</span>
				<kbd class="kbd kbd-xs" style="background: oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);">?</kbd>
			</button>
		</li>

		<div class="divider my-1" style="height: 1px; background: oklch(0.30 0.02 250);"></div>

		<!-- Theme Selector -->

		<li class="menu-title mt-2">
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">Theme</span>
		</li>

		<li>
			<ThemeSelector compact={false} />
		</li>

		<!-- Sound Settings -->
		<li class="menu-title mt-2">
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">Sound</span>
		</li>

		<li>
			<button
				onclick={handleSoundToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors"
				style="background: {soundsEnabled ? 'oklch(0.30 0.08 145 / 0.3)' : 'transparent'};"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 transition-transform duration-300"
					class:sound-icon-pulse={isSoundAnimating}
					style="color: {soundsEnabled ? 'oklch(0.75 0.15 145)' : 'oklch(0.55 0.02 250)'};"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={soundsEnabled ? soundOnIcon : soundOffIcon} />
				</svg>
				<span class="text-xs flex-1 text-left" style="color: oklch(0.70 0.02 250);">
					Sound Effects
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300"
					class:sound-badge-bounce={isSoundAnimating}
					style="
						background: {soundsEnabled ? 'oklch(0.35 0.10 145)' : 'oklch(0.25 0.02 250)'};
						color: {soundsEnabled ? 'oklch(0.85 0.10 145)' : 'oklch(0.55 0.02 250)'};
					"
				>
					{soundsEnabled ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<!-- Display Settings -->
		<li class="menu-title mt-2">
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">Display</span>
		</li>

		<li>
			<button
				onclick={handleSparklineToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors"
				style="background: {sparklineVisible ? 'oklch(0.30 0.08 240 / 0.3)' : 'transparent'};"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 transition-transform duration-300"
					class:toggle-icon-pulse={isSparklineAnimating}
					style="color: {sparklineVisible ? 'oklch(0.75 0.15 240)' : 'oklch(0.55 0.02 250)'};"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={chartIcon} />
				</svg>
				<span class="text-xs flex-1 text-left" style="color: oklch(0.70 0.02 250);">
					Sparkline
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300"
					class:toggle-badge-bounce={isSparklineAnimating}
					style="
						background: {sparklineVisible ? 'oklch(0.35 0.10 240)' : 'oklch(0.25 0.02 250)'};
						color: {sparklineVisible ? 'oklch(0.85 0.10 240)' : 'oklch(0.55 0.02 250)'};
					"
				>
					{sparklineVisible ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<li class="menu-title mt-2">
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">Terminal Settings</span>
		</li>

		<!-- Terminal Height Slider -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<div class="flex items-center justify-between">
					<span class="text-xs" style="color: oklch(0.70 0.02 250);">Height (rows)</span>
					<span class="text-xs font-mono" style="color: oklch(0.80 0.02 250);">{terminalHeight}</span>
				</div>
				<input
					type="range"
					min={MIN_TERMINAL_HEIGHT}
					max={MAX_TERMINAL_HEIGHT}
					value={terminalHeight}
					oninput={(e) => handleHeightChange(parseInt(e.currentTarget.value, 10))}
					class="range range-xs range-info w-full"
				/>
				<div class="flex justify-between text-[9px]" style="color: oklch(0.50 0.02 250);">
					<span>{MIN_TERMINAL_HEIGHT}</span>
					<span>{MAX_TERMINAL_HEIGHT}</span>
				</div>
			</div>
		</li>
	</ul>
</div>

<!-- Help Modal -->
{#if showHelpModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		style="background: oklch(0 0 0 / 0.6); backdrop-filter: blur(4px);"
		onclick={() => showHelpModal = false}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="relative w-full max-w-lg mx-4 rounded-lg shadow-2xl overflow-hidden"
			style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.35 0.02 250);"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4" style="border-bottom: 1px solid oklch(0.30 0.02 250);">
				<h2 class="text-lg font-semibold" style="color: oklch(0.90 0.02 250);">
					Help & Keyboard Shortcuts
				</h2>
				<button
					onclick={() => showHelpModal = false}
					class="p-1 rounded hover:bg-base-300 transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" style="color: oklch(0.60 0.02 250);">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
				<!-- Global Shortcuts -->
				<div>
					<h3 class="text-sm font-semibold mb-2" style="color: oklch(0.75 0.18 240);">Global Shortcuts</h3>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">New Task</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Alt + N</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">Attach to Hovered Session</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Alt + A</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">Spawn New Session</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Alt + S</kbd>
						</div>
					</div>
				</div>

				<!-- Task Creation Shortcuts -->
				<div>
					<h3 class="text-sm font-semibold mb-2" style="color: oklch(0.75 0.18 240);">Task Creation Drawer</h3>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">Save & Start Agent</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Ctrl + Enter</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">Save & Close</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Alt + Enter</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">Save & New</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Ctrl + Shift + Enter</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm" style="color: oklch(0.70 0.02 250);">Close Drawer</span>
							<kbd class="kbd kbd-sm" style="background: oklch(0.25 0.02 250); color: oklch(0.80 0.02 250);">Escape</kbd>
						</div>
					</div>
				</div>

				<!-- Session Card Tips -->
				<div>
					<h3 class="text-sm font-semibold mb-2" style="color: oklch(0.75 0.18 240);">Session Cards</h3>
					<ul class="text-sm space-y-1" style="color: oklch(0.65 0.02 250);">
						<li class="flex items-start gap-2">
							<span style="color: oklch(0.50 0.02 250);">•</span>
							<span>Hover over a session card, then press <kbd class="kbd kbd-xs">Alt + A</kbd> to attach terminal</span>
						</li>
						<li class="flex items-start gap-2">
							<span style="color: oklch(0.50 0.02 250);">•</span>
							<span>Click the status badge for quick actions (Complete, Kill, Attach)</span>
						</li>
						<li class="flex items-start gap-2">
							<span style="color: oklch(0.50 0.02 250);">•</span>
							<span>Drag the right edge to resize session cards</span>
						</li>
					</ul>
				</div>

				<!-- Voice Input -->
				<div>
					<h3 class="text-sm font-semibold mb-2" style="color: oklch(0.75 0.18 240);">Voice Input</h3>
					<ul class="text-sm space-y-1" style="color: oklch(0.65 0.02 250);">
						<li class="flex items-start gap-2">
							<span style="color: oklch(0.50 0.02 250);">•</span>
							<span>Click the microphone icon to start voice recording</span>
						</li>
						<li class="flex items-start gap-2">
							<span style="color: oklch(0.50 0.02 250);">•</span>
							<span>Recording uses local whisper.cpp (privacy-first, no data sent externally)</span>
						</li>
					</ul>
				</div>

				<!-- Links -->
				<div class="pt-2" style="border-top: 1px solid oklch(0.30 0.02 250);">
					<h3 class="text-sm font-semibold mb-2" style="color: oklch(0.75 0.18 240);">Resources</h3>
					<div class="flex flex-wrap gap-2">
						<a
							href="https://github.com/anthropics/claude-code/issues"
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
							style="background: oklch(0.25 0.02 250); color: oklch(0.70 0.02 250);"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
							</svg>
							Report Issue
						</a>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="px-5 py-3 flex justify-end" style="border-top: 1px solid oklch(0.30 0.02 250); background: oklch(0.16 0.01 250);">
				<button
					onclick={() => showHelpModal = false}
					class="px-4 py-1.5 text-sm rounded transition-colors"
					style="background: oklch(0.30 0.02 250); color: oklch(0.80 0.02 250);"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Toggle icon animation - pulse and scale */
	.sound-icon-pulse,
	.toggle-icon-pulse {
		animation: toggle-pulse 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes toggle-pulse {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.3);
		}
		100% {
			transform: scale(1);
		}
	}

	/* Toggle badge animation - bounce with rotation */
	.sound-badge-bounce,
	.toggle-badge-bounce {
		animation: toggle-bounce 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes toggle-bounce {
		0% {
			transform: scale(1) rotate(0deg);
		}
		50% {
			transform: scale(0.8) rotate(-10deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
	}
</style>
