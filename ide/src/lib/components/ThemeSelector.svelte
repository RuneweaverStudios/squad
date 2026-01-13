<script lang="ts">
	/**
	 * ThemeSelector Component
	 * Supports all 32 DaisyUI themes with localStorage persistence
	 *
	 * @param compact - If true, shows icon-only mode suitable for sidebar
	 * @param inline - If true, renders theme list directly without dropdown wrapper (for use inside another dropdown)
	 */

	import { onMount } from 'svelte';
	import { setTheme } from '$lib/utils/themeManager';

	// Props
	let { compact = false, inline = false } = $props();

	// All DaisyUI themes with labels
	const themes = [
		{ name: 'jat', label: 'JAT' },
		{ name: 'light', label: 'Light' },
		{ name: 'dark', label: 'Dark' },
		{ name: 'cupcake', label: 'Cupcake' },
		{ name: 'bumblebee', label: 'Bumblebee' },
		{ name: 'emerald', label: 'Emerald' },
		{ name: 'corporate', label: 'Corporate' },
		{ name: 'synthwave', label: 'Synthwave' },
		{ name: 'retro', label: 'Retro' },
		{ name: 'cyberpunk', label: 'Cyberpunk' },
		{ name: 'valentine', label: 'Valentine' },
		{ name: 'halloween', label: 'Halloween' },
		{ name: 'garden', label: 'Garden' },
		{ name: 'forest', label: 'Forest' },
		{ name: 'aqua', label: 'Aqua' },
		{ name: 'lofi', label: 'Lofi' },
		{ name: 'pastel', label: 'Pastel' },
		{ name: 'fantasy', label: 'Fantasy' },
		{ name: 'wireframe', label: 'Wireframe' },
		{ name: 'black', label: 'Black' },
		{ name: 'luxury', label: 'Luxury' },
		{ name: 'dracula', label: 'Dracula' },
		{ name: 'cmyk', label: 'CMYK' },
		{ name: 'autumn', label: 'Autumn' },
		{ name: 'business', label: 'Business' },
		{ name: 'acid', label: 'Acid' },
		{ name: 'lemonade', label: 'Lemonade' },
		{ name: 'night', label: 'Night' },
		{ name: 'coffee', label: 'Coffee' },
		{ name: 'winter', label: 'Winter' },
		{ name: 'dim', label: 'Dim' },
		{ name: 'nord', label: 'Nord' },
		{ name: 'sunset', label: 'Sunset' }
	];

	let currentTheme = $state('jat');
	let isAnimating = $state(false);

	// Get display label for current theme
	const currentThemeLabel = $derived(
		themes.find((t) => t.name === currentTheme)?.label || 'JAT'
	);

	onMount(() => {
		// Get current theme or default to jat
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme && themes.some((t) => t.name === savedTheme)) {
			currentTheme = savedTheme;
			document.documentElement.setAttribute('data-theme', savedTheme);
		} else {
			currentTheme = 'jat';
			document.documentElement.setAttribute('data-theme', 'jat');
			localStorage.setItem('theme', 'jat');
		}
	});

	function handleThemeChange(themeName: string) {
		if (themeName === currentTheme) return;

		// Trigger animation
		isAnimating = true;

		// Change theme after a brief delay to let animation start
		setTimeout(() => {
			currentTheme = themeName;
			setTheme(themeName);
		}, 150);

		// Reset animation state
		setTimeout(() => {
			isAnimating = false;
		}, 500);
	}
</script>

{#if inline}
	<!-- Inline mode: render theme grid directly without dropdown wrapper -->
	<div class="max-h-32 overflow-y-auto px-1">
		<div class="grid grid-cols-4 gap-1">
			{#each themes as theme}
				<button
					class="flex flex-col items-center gap-0.5 p-1 rounded transition-colors hover:bg-base-300 {currentTheme === theme.name ? 'bg-primary/20 ring-1 ring-primary/50' : ''}"
					onclick={() => handleThemeChange(theme.name)}
					title={theme.label}
				>
					<!-- Theme color preview -->
					<div
						data-theme={theme.name}
						class="bg-base-100 grid shrink-0 grid-cols-2 gap-0.5 rounded p-0.5 shadow-sm w-5 h-5"
					>
						<div class="bg-base-content size-1.5 rounded-full"></div>
						<div class="bg-primary size-1.5 rounded-full"></div>
						<div class="bg-secondary size-1.5 rounded-full"></div>
						<div class="bg-accent size-1.5 rounded-full"></div>
					</div>
					<span class="text-[9px] text-base-content/70 truncate w-full text-center">{theme.label}</span>
				</button>
			{/each}
		</div>
	</div>
{:else}
	<!-- Dropdown mode: full dropdown with theme previews -->
	<div class="dropdown dropdown-end">
		<div
			tabindex="0"
			role="button"
			class="flex items-center gap-2 cursor-pointer hover:bg-base-300 transition-colors px-2 py-1 rounded {compact
				? 'is-drawer-close:tooltip is-drawer-close:tooltip-right'
				: ''}"
			aria-label="Change Theme"
			title={compact ? currentThemeLabel : 'Change Theme'}
			data-tip={compact ? currentThemeLabel : undefined}
		>
			<!-- Theme color preview blocks with animation -->
			<div
				data-theme={currentTheme}
				class="bg-base-100 grid shrink-0 grid-cols-2 gap-0.5 rounded p-0.5 shadow-sm w-4 h-4 transition-transform duration-300 ease-out"
				class:theme-spin={isAnimating}
			>
				<div class="bg-base-content size-1 rounded-full transition-all duration-300 theme-dot" class:theme-dot-animate={isAnimating} style="--dot-delay: 0ms"></div>
				<div class="bg-primary size-1 rounded-full transition-all duration-300 theme-dot" class:theme-dot-animate={isAnimating} style="--dot-delay: 50ms"></div>
				<div class="bg-secondary size-1 rounded-full transition-all duration-300 theme-dot" class:theme-dot-animate={isAnimating} style="--dot-delay: 100ms"></div>
				<div class="bg-accent size-1 rounded-full transition-all duration-300 theme-dot" class:theme-dot-animate={isAnimating} style="--dot-delay: 150ms"></div>
			</div>
			{#if !compact}
				<span class="text-sm font-medium transition-opacity duration-200" class:opacity-50={isAnimating}>{currentThemeLabel}</span>
			{/if}
		</div>

		<div
			class="dropdown-content bg-base-200 text-base-content rounded-box
    top-px max-h-[calc(50vh-6.5rem)] overflow-y-auto border border-white/5
    shadow-2xl outline-1 outline-black/5 mb-2"
		>
			<ul class="menu w-56">
				<li class="menu-title text-xs">Theme</li>

				{#each themes as theme, index}
					<li class="fade-in fade-in-delay-{Math.min(index, 12)}">
						<button
							class="gap-3 px-2"
							onclick={() => handleThemeChange(theme.name)}
							class:active={currentTheme === theme.name}
						>
							<!-- Theme color preview -->
							<div
								data-theme={theme.name}
								class="bg-base-100 grid shrink-0 grid-cols-2 gap-0.5
              rounded-md p-1 shadow-sm"
							>
								<div class="bg-base-content size-1 rounded-full"></div>
								<div class="bg-primary size-1 rounded-full"></div>
								<div class="bg-secondary size-1 rounded-full"></div>
								<div class="bg-accent size-1 rounded-full"></div>
							</div>

							<div class="w-32 truncate">{theme.label}</div>

							<!-- Checkmark for active theme -->
							{#if currentTheme === theme.name}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="h-3 w-3 shrink-0"
								>
									<path
										d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716
                9 8.728 15-15.285z"
									></path>
								</svg>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="invisible h-3 w-3 shrink-0"
								>
									<path
										d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716
                9 8.728 15-15.285z"
									></path>
								</svg>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	/* Theme toggle animation - spin and scale the preview grid */
	.theme-spin {
		animation: theme-spin 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes theme-spin {
		0% {
			transform: rotate(0deg) scale(1);
		}
		50% {
			transform: rotate(180deg) scale(1.2);
		}
		100% {
			transform: rotate(360deg) scale(1);
		}
	}

	/* Staggered dot animation - each dot pulses with a delay */
	.theme-dot-animate {
		animation: dot-pulse 0.35s cubic-bezier(0.4, 0, 0.2, 1);
		animation-delay: var(--dot-delay);
	}

	@keyframes dot-pulse {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(0.5);
			opacity: 0.5;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
