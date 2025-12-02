<script lang="ts">
	/**
	 * UserProfile Component
	 *
	 * User profile dropdown with theme selector.
	 * Shows avatar with user info and theme picker menu.
	 * Uses DaisyUI dropdown component.
	 *
	 * Note: This is a placeholder component. No authentication system implemented yet.
	 * Replace with real user data when auth is added.
	 */

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
		<li class="menu-title">
			<span class="font-semibold" style="color: oklch(0.85 0.02 250);">{user.name}</span>
			<span class="text-xs" style="color: oklch(0.55 0.02 250);">{user.email}</span>
		</li>

		<!-- Theme Selector -->
		<li>
			<ThemeSelector compact={false} />
		</li>
	</ul>
</div>
