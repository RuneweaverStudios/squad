<script lang="ts">
	/**
	 * UserProfile Component
	 *
	 * User profile dropdown with theme selector and terminal settings.
	 * Shows avatar with user info, theme picker, and terminal height slider.
	 * Uses DaisyUI dropdown component.
	 *
	 * Note: This is a placeholder component. No authentication system implemented yet.
	 * Replace with real user data when auth is added.
	 */

	import { onMount } from 'svelte';
	import ThemeSelector from './ThemeSelector.svelte';

	// Placeholder user data
	const user = {
		name: 'Agent User',
		initials: 'AU',
		email: 'agent@example.com'
	};

	// User icon SVG path
	const userIcon =
		'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z';

	// Terminal height settings (global user preference)
	const TERMINAL_HEIGHT_KEY = 'user-terminal-height';
	const DEFAULT_TERMINAL_HEIGHT = 50;
	const MIN_TERMINAL_HEIGHT = 20;
	const MAX_TERMINAL_HEIGHT = 150;
	let terminalHeight = $state(DEFAULT_TERMINAL_HEIGHT);

	onMount(() => {
		// Load saved terminal height
		const saved = localStorage.getItem(TERMINAL_HEIGHT_KEY);
		if (saved) {
			const parsed = parseInt(saved, 10);
			if (!isNaN(parsed) && parsed >= MIN_TERMINAL_HEIGHT && parsed <= MAX_TERMINAL_HEIGHT) {
				terminalHeight = parsed;
			}
		}
	});

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
		<!-- User Info -->
		<!-- <li class="menu-title">
			<span class="font-semibold" style="color: oklch(0.85 0.02 250);">{user.name}</span>
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">{user.email}</span>
		</li> -->

		<!-- Theme Selector -->

		<li class="menu-title mt-2">
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">Theme</span>
		</li>

		<li>
			<ThemeSelector compact={false} />
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
