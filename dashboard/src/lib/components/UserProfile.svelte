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

	import ThemeSelector from './ThemeSelector.svelte';
	import {
		enableSounds,
		disableSounds,
		playSuccessChime
	} from '$lib/utils/soundEffects';
	import { getSoundsEnabled } from '$lib/stores/preferences.svelte';
	import {
		requestNotificationPermission,
		getNotificationPermission,
		areBrowserNotificationsSupported,
		getNotificationsEnabled,
		setNotificationsEnabled,
		getFaviconBadgeEnabled,
		setFaviconBadgeEnabled,
		getTitleBadgeEnabled,
		setTitleBadgeEnabled
	} from '$lib/utils/pushNotifications';
	import { getVersionString } from '$lib/version';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';
	import {
		getSparklineVisible,
		setSparklineVisible,
		getTerminalHeight,
		setTerminalHeight,
		getSessionMaximizeHeight,
		setSessionMaximizeHeight,
		getCtrlCIntercept,
		setCtrlCIntercept,
		getTerminalFontFamily,
		setTerminalFontFamily,
		getTerminalFontSize,
		setTerminalFontSize,
		getTerminalScrollback,
		setTerminalScrollback,
		getEpicCelebration,
		setEpicCelebration,
		getEpicAutoClose,
		setEpicAutoClose,
		getMaxSessions,
		setMaxSessions,
		TERMINAL_FONT_OPTIONS,
		TERMINAL_FONT_SIZE_OPTIONS,
		TERMINAL_SCROLLBACK_OPTIONS,
		MAX_SESSIONS_OPTIONS,
		SESSION_MAXIMIZE_HEIGHT_OPTIONS,
		type TerminalFontFamily,
		type TerminalFontSize,
		type TerminalScrollback,
		type MaxSessions,
		type SessionMaximizeHeight
	} from '$lib/stores/preferences.svelte';

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

	// Sound settings (reactive from preferences store)
	const soundsEnabled = $derived(getSoundsEnabled());
	let isSoundAnimating = $state(false);

	// Sparkline visibility (reactive from preferences store)
	const sparklineVisible = $derived(getSparklineVisible());
	let isSparklineAnimating = $state(false);

	// Ctrl+C intercept (reactive from preferences store)
	const ctrlCIntercept = $derived(getCtrlCIntercept());
	let isCtrlCAnimating = $state(false);

	// Epic celebration settings (reactive from preferences store)
	const epicCelebration = $derived(getEpicCelebration());
	const epicAutoClose = $derived(getEpicAutoClose());
	let isEpicCelebrationAnimating = $state(false);
	let isEpicAutoCloseAnimating = $state(false);

	// Notification settings (reactive from preferences store)
	const browserNotificationsSupported = areBrowserNotificationsSupported();
	const browserNotificationsEnabled = $derived(getNotificationsEnabled());
	const faviconBadgeEnabled = $derived(getFaviconBadgeEnabled());
	const titleBadgeEnabled = $derived(getTitleBadgeEnabled());
	let browserNotificationPermission = $state<NotificationPermission>(getNotificationPermission());
	let isBrowserNotificationsAnimating = $state(false);
	let isFaviconBadgeAnimating = $state(false);
	let isTitleBadgeAnimating = $state(false);

	// Help modal
	let showHelpModal = $state(false);

	// Update JAT state
	let isUpdating = $state(false);

	// Keyboard icon path
	const keyboardIcon = 'M6.75 3a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0017.25 3H6.75zm0 1.5h10.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V5.25a.75.75 0 01.75-.75z';
	const questionIcon = 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z';

	// Chart/sparkline icon path
	const chartIcon = 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6';

	// Terminal height settings (global user preference)
	const MIN_TERMINAL_HEIGHT = 20;
	const MAX_TERMINAL_HEIGHT = 150;
	const terminalHeight = $derived(getTerminalHeight());

	// Session maximize height (click-to-expand height)
	const sessionMaximizeHeight = $derived(getSessionMaximizeHeight());

	// Terminal font settings (reactive from preferences store)
	const terminalFontFamily = $derived(getTerminalFontFamily());
	const terminalFontSize = $derived(getTerminalFontSize());
	const terminalScrollback = $derived(getTerminalScrollback());

	// Swarm settings (reactive from preferences store)
	const maxSessions = $derived(getMaxSessions());

	function handleSoundToggle() {
		// Trigger animation
		isSoundAnimating = true;

		// Toggle sound after brief delay to let animation start
		// (soundsEnabled is derived from preferences store, so we call enable/disable which update the store)
		setTimeout(() => {
			if (soundsEnabled) {
				disableSounds();
			} else {
				enableSounds();
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

		// Toggle after brief delay (store is reactive, UI updates automatically)
		setTimeout(() => {
			setSparklineVisible(!sparklineVisible);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isSparklineAnimating = false;
		}, 400);
	}

	function handleCtrlCToggle() {
		// Trigger animation
		isCtrlCAnimating = true;

		// Toggle after brief delay (store is reactive, UI updates automatically)
		setTimeout(() => {
			setCtrlCIntercept(!ctrlCIntercept);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isCtrlCAnimating = false;
		}, 400);
	}

	function handleEpicCelebrationToggle() {
		// Trigger animation
		isEpicCelebrationAnimating = true;

		// Toggle after brief delay (store is reactive, UI updates automatically)
		setTimeout(() => {
			setEpicCelebration(!epicCelebration);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isEpicCelebrationAnimating = false;
		}, 400);
	}

	function handleEpicAutoCloseToggle() {
		// Trigger animation
		isEpicAutoCloseAnimating = true;

		// Toggle after brief delay (store is reactive, UI updates automatically)
		setTimeout(() => {
			setEpicAutoClose(!epicAutoClose);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isEpicAutoCloseAnimating = false;
		}, 400);
	}

	async function handleBrowserNotificationsToggle() {
		// Trigger animation
		isBrowserNotificationsAnimating = true;

		// If enabling and permission not granted, request it
		if (!browserNotificationsEnabled) {
			if (browserNotificationPermission !== 'granted') {
				const permission = await requestNotificationPermission();
				browserNotificationPermission = permission;
				if (permission !== 'granted') {
					// Permission denied, don't enable
					isBrowserNotificationsAnimating = false;
					return;
				}
			}
		}

		// Toggle after brief delay
		setTimeout(() => {
			setNotificationsEnabled(!browserNotificationsEnabled);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isBrowserNotificationsAnimating = false;
		}, 400);
	}

	function handleFaviconBadgeToggle() {
		// Trigger animation
		isFaviconBadgeAnimating = true;

		// Toggle after brief delay
		setTimeout(() => {
			setFaviconBadgeEnabled(!faviconBadgeEnabled);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isFaviconBadgeAnimating = false;
		}, 400);
	}

	function handleTitleBadgeToggle() {
		// Trigger animation
		isTitleBadgeAnimating = true;

		// Toggle after brief delay
		setTimeout(() => {
			setTitleBadgeEnabled(!titleBadgeEnabled);
		}, 100);

		// Reset animation state
		setTimeout(() => {
			isTitleBadgeAnimating = false;
		}, 400);
	}

	function handleHeightChange(newHeight: number) {
		// Store handles persistence and reactivity automatically
		setTerminalHeight(newHeight);
	}

	function handleSessionMaxHeightChange(value: SessionMaximizeHeight) {
		setSessionMaximizeHeight(value);
	}

	function handleFontFamilyChange(value: TerminalFontFamily) {
		setTerminalFontFamily(value);
	}

	function handleFontSizeChange(value: TerminalFontSize) {
		setTerminalFontSize(value);
	}

	function handleScrollbackChange(value: TerminalScrollback) {
		setTerminalScrollback(value);
	}

	function handleMaxSessionsChange(value: MaxSessions) {
		setMaxSessions(value);
	}

	async function handleUpdate() {
		isUpdating = true;

		try {
			const response = await fetch('/api/jat/update', { method: 'POST' });
			const data = await response.json();

			if (response.ok && data.success) {
				successToast(data.message || 'JAT updated successfully!', data.details?.gitPull);
			} else {
				errorToast(data.error || 'Update failed');
			}
		} catch (err) {
			errorToast('Network error during update');
		} finally {
			isUpdating = false;
		}
	}
</script>

<div class="dropdown dropdown-end">
	<!-- Avatar Button - Industrial -->
	<button
		tabindex="0"
		class="flex items-center justify-center w-7 h-7 rounded transition-all hover:scale-105 bg-base-300 border border-base-content/20"
		aria-label="User profile menu"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="w-4 h-4 text-primary"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d={userIcon} />
		</svg>
	</button>

	<!-- Dropdown Menu - Industrial -->
	<ul
		tabindex="0"
		class="dropdown-content mt-3 z-[60] p-2 shadow-lg rounded w-72 max-h-[80vh] overflow-y-auto bg-base-300 border border-base-content/20"
	>
		<!-- Help & Shortcuts -->
		<li>
			<button
				onclick={() => showHelpModal = true}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors hover:bg-base-200"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 text-primary"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={questionIcon} />
				</svg>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Help & Shortcuts
				</span>
				<kbd class="kbd kbd-xs bg-base-200 text-base-content/60">?</kbd>
			</button>
		</li>

		<div class="divider my-1 h-px bg-base-content/20"></div>

		<!-- Theme Selector -->

		<li class="menu-title mt-2">
			<span class="text-xs text-base-content/50">Theme</span>
		</li>

		<li>
			<ThemeSelector compact={false} />
		</li>

		<!-- Sound Settings -->
		<li class="menu-title mt-2">
			<span class="text-xs text-base-content/50">Sound</span>
		</li>

		<li>
			<button
				onclick={handleSoundToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {soundsEnabled ? 'bg-success/20' : ''}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 transition-transform duration-300 {soundsEnabled ? 'text-success' : 'text-base-content/50'}"
					class:sound-icon-pulse={isSoundAnimating}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={soundsEnabled ? soundOnIcon : soundOffIcon} />
				</svg>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Sound Effects
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {soundsEnabled ? 'bg-success/40 text-success' : 'bg-base-200 text-base-content/50'}"
					class:sound-badge-bounce={isSoundAnimating}
				>
					{soundsEnabled ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<!-- Notification Settings -->
		<li class="menu-title mt-2">
			<span class="text-xs text-base-content/50">Notifications</span>
		</li>

		{#if browserNotificationsSupported}
			<li>
				<button
					onclick={handleBrowserNotificationsToggle}
					class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {browserNotificationsEnabled && browserNotificationPermission === 'granted' ? 'bg-info/20' : ''}"
					title={browserNotificationPermission === 'denied'
						? 'Browser notifications blocked - check browser settings'
						: browserNotificationsEnabled
							? 'Show browser notifications when agents need attention'
							: 'Enable browser notifications'}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4 transition-transform duration-300 {browserNotificationsEnabled && browserNotificationPermission === 'granted' ? 'text-info' : 'text-base-content/50'}"
						class:toggle-icon-pulse={isBrowserNotificationsAnimating}
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
					</svg>
					<span class="text-xs flex-1 text-left text-base-content/70">
						Browser Alerts
					</span>
					{#if browserNotificationPermission === 'denied'}
						<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-error/30 text-error">
							BLOCKED
						</span>
					{:else}
						<span
							class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {browserNotificationsEnabled && browserNotificationPermission === 'granted' ? 'bg-info/40 text-info' : 'bg-base-200 text-base-content/50'}"
							class:toggle-badge-bounce={isBrowserNotificationsAnimating}
						>
							{browserNotificationsEnabled && browserNotificationPermission === 'granted' ? 'ON' : 'OFF'}
						</span>
					{/if}
				</button>
			</li>
		{/if}

		<li>
			<button
				onclick={handleFaviconBadgeToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {faviconBadgeEnabled ? 'bg-warning/20' : ''}"
				title={faviconBadgeEnabled
					? 'Show count badge on favicon when agents need attention'
					: 'Favicon badge disabled'}
			>
				<span
					class="w-4 h-4 flex items-center justify-center text-sm transition-transform duration-300"
					class:toggle-icon-pulse={isFaviconBadgeAnimating}
				>
					{faviconBadgeEnabled ? '🔴' : '⚪'}
				</span>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Favicon Badge
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {faviconBadgeEnabled ? 'bg-warning/40 text-warning-content' : 'bg-base-200 text-base-content/50'}"
					class:toggle-badge-bounce={isFaviconBadgeAnimating}
				>
					{faviconBadgeEnabled ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<li>
			<button
				onclick={handleTitleBadgeToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {titleBadgeEnabled ? 'bg-primary/20' : ''}"
				title={titleBadgeEnabled
					? 'Show count in page title when agents need attention'
					: 'Title badge disabled'}
			>
				<span
					class="w-4 h-4 flex items-center justify-center font-mono text-[9px] font-bold transition-transform duration-300 {titleBadgeEnabled ? 'text-primary' : 'text-base-content/50'}"
					class:toggle-icon-pulse={isTitleBadgeAnimating}
				>
					(3)
				</span>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Title Badge
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {titleBadgeEnabled ? 'bg-primary/40 text-primary' : 'bg-base-200 text-base-content/50'}"
					class:toggle-badge-bounce={isTitleBadgeAnimating}
				>
					{titleBadgeEnabled ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<!-- Display Settings -->
		<li class="menu-title mt-2">
			<span class="text-xs text-base-content/50">Display</span>
		</li>

		<li>
			<button
				onclick={handleSparklineToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {sparklineVisible ? 'bg-info/20' : ''}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4 transition-transform duration-300 {sparklineVisible ? 'text-info' : 'text-base-content/50'}"
					class:toggle-icon-pulse={isSparklineAnimating}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={chartIcon} />
				</svg>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Sparkline
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {sparklineVisible ? 'bg-info/40 text-info' : 'bg-base-200 text-base-content/50'}"
					class:toggle-badge-bounce={isSparklineAnimating}
				>
					{sparklineVisible ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<!-- Ctrl+C Behavior -->
		<li>
			<button
				onclick={handleCtrlCToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {ctrlCIntercept ? 'bg-error/20' : ''}"
				title={ctrlCIntercept
					? 'Ctrl+C sends interrupt to tmux'
					: 'Ctrl+C copies text (browser default)'}
			>
				<span
					class="w-4 h-4 flex items-center justify-center font-mono text-[9px] font-bold transition-transform duration-300 {!ctrlCIntercept ? 'line-through opacity-50' : ''} {ctrlCIntercept ? 'text-error' : 'text-base-content/50'}"
					class:toggle-icon-pulse={isCtrlCAnimating}
				>
					^C
				</span>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Ctrl+C Interrupt
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {ctrlCIntercept ? 'bg-error/40 text-error' : 'bg-base-200 text-base-content/50'}"
					class:toggle-badge-bounce={isCtrlCAnimating}
				>
					{ctrlCIntercept ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<!-- Epic Settings -->
		<li class="menu-title mt-2">
			<span class="text-xs text-base-content/50">Epic Completion</span>
		</li>

		<li>
			<button
				onclick={handleEpicCelebrationToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {epicCelebration ? 'bg-warning/20' : ''}"
				title={epicCelebration
					? 'Celebrate when all children of an epic complete'
					: 'No celebration for epic completion'}
			>
				<span
					class="w-4 h-4 flex items-center justify-center text-sm transition-transform duration-300"
					class:toggle-icon-pulse={isEpicCelebrationAnimating}
				>
					{epicCelebration ? '🎉' : '🔕'}
				</span>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Celebration
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {epicCelebration ? 'bg-warning/40 text-warning-content' : 'bg-base-200 text-base-content/50'}"
					class:toggle-badge-bounce={isEpicCelebrationAnimating}
				>
					{epicCelebration ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<li>
			<button
				onclick={handleEpicAutoCloseToggle}
				class="flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors {epicAutoClose ? 'bg-success/20' : ''}"
				title={epicAutoClose
					? 'Automatically close the epic in Beads when all children complete'
					: 'Keep epic open even when all children complete'}
			>
				<span
					class="w-4 h-4 flex items-center justify-center text-sm transition-transform duration-300"
					class:toggle-icon-pulse={isEpicAutoCloseAnimating}
				>
					{epicAutoClose ? '✅' : '⏸️'}
				</span>
				<span class="text-xs flex-1 text-left text-base-content/70">
					Auto-Close
				</span>
				<span
					class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-transform duration-300 {epicAutoClose ? 'bg-success/40 text-success' : 'bg-base-200 text-base-content/50'}"
					class:toggle-badge-bounce={isEpicAutoCloseAnimating}
				>
					{epicAutoClose ? 'ON' : 'OFF'}
				</span>
			</button>
		</li>

		<li class="menu-title mt-2">
			<span class="text-xs text-base-content/50">Terminal Settings</span>
		</li>

		<!-- Terminal Height Slider -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<div class="flex items-center justify-between">
					<span class="text-xs text-base-content/70">Height (rows)</span>
					<span class="text-xs font-mono text-base-content/80">{terminalHeight}</span>
				</div>
				<input
					type="range"
					min={MIN_TERMINAL_HEIGHT}
					max={MAX_TERMINAL_HEIGHT}
					value={terminalHeight}
					oninput={(e) => handleHeightChange(parseInt(e.currentTarget.value, 10))}
					class="range range-xs range-info w-full"
				/>
				<div class="flex justify-between text-[9px] text-base-content/50">
					<span>{MIN_TERMINAL_HEIGHT}</span>
					<span>{MAX_TERMINAL_HEIGHT}</span>
				</div>
			</div>
		</li>

		<!-- Session Maximize Height -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<span class="text-xs text-base-content/70">Click-to-Expand Height</span>
				<div class="flex gap-1">
					{#each SESSION_MAXIMIZE_HEIGHT_OPTIONS as option}
						<button
							onclick={() => handleSessionMaxHeightChange(option.value)}
							class="px-2 py-0.5 text-[10px] font-mono rounded transition-colors border {sessionMaximizeHeight === option.value ? 'bg-info/40 text-info border-info/50' : 'bg-base-200 text-base-content/60 border-base-content/20'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</li>

		<!-- Terminal Font Family -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<span class="text-xs text-base-content/70">Font Family</span>
				<div class="flex flex-wrap gap-1">
					{#each TERMINAL_FONT_OPTIONS as option}
						<button
							onclick={() => handleFontFamilyChange(option.value)}
							class="px-2 py-0.5 text-[10px] rounded transition-colors border {terminalFontFamily === option.value ? 'bg-info/40 text-info border-info/50' : 'bg-base-200 text-base-content/60 border-base-content/20'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</li>

		<!-- Terminal Font Size -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<span class="text-xs text-base-content/70">Font Size</span>
				<div class="flex gap-1">
					{#each TERMINAL_FONT_SIZE_OPTIONS as option}
						<button
							onclick={() => handleFontSizeChange(option.value)}
							class="px-2.5 py-0.5 text-[10px] font-mono rounded transition-colors border {terminalFontSize === option.value ? 'bg-info/40 text-info border-info/50' : 'bg-base-200 text-base-content/60 border-base-content/20'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</li>

		<!-- Terminal Scrollback Limit -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<span class="text-xs text-base-content/70">Scrollback Lines</span>
				<div class="flex gap-1">
					{#each TERMINAL_SCROLLBACK_OPTIONS as option}
						<button
							onclick={() => handleScrollbackChange(option.value)}
							class="px-2 py-0.5 text-[10px] font-mono rounded transition-colors border {terminalScrollback === option.value ? 'bg-info/40 text-info border-info/50' : 'bg-base-200 text-base-content/60 border-base-content/20'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</li>

		<!-- Max Concurrent Sessions -->
		<li>
			<div class="flex flex-col gap-1 px-2 py-1">
				<span class="text-xs text-base-content/70">Max Sessions</span>
				<div class="flex gap-1">
					{#each MAX_SESSIONS_OPTIONS as option}
						<button
							onclick={() => handleMaxSessionsChange(option.value)}
							class="px-2 py-0.5 text-[10px] font-mono rounded transition-colors border {maxSessions === option.value ? 'bg-success/40 text-success border-success/50' : 'bg-base-200 text-base-content/60 border-base-content/20'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</li>

		<!-- Version & Update -->
		<div class="divider my-1 h-px bg-base-content/20"></div>
		<li>
			<div class="flex items-center justify-between px-2 py-1">
				<div
					class="text-[10px] font-mono cursor-default text-base-content/50"
					title="Build version"
				>
					v{getVersionString()}
				</div>
				<button
					onclick={handleUpdate}
					disabled={isUpdating}
					class="text-[10px] font-mono px-2 py-0.5 rounded transition-colors border {isUpdating ? 'bg-base-200 text-base-content/50 border-base-content/20 cursor-wait' : 'bg-info/20 text-info border-info/30 hover:bg-info/30'}"
					title="Pull latest and run install.sh"
				>
					{#if isUpdating}
						<span class="inline-flex items-center gap-1">
							<svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Updating...
						</span>
					{:else}
						Update
					{/if}
				</button>
			</div>
		</li>
	</ul>
</div>

<!-- Help Modal -->
{#if showHelpModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={() => showHelpModal = false}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="relative w-full max-w-lg mx-4 rounded-lg shadow-2xl overflow-hidden bg-base-300 border border-base-content/20"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-base-content/20">
				<h2 class="text-lg font-semibold text-base-content">
					Help & Keyboard Shortcuts
				</h2>
				<button
					onclick={() => showHelpModal = false}
					class="p-1 rounded hover:bg-base-200 transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-base-content/60">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
				<!-- Global Shortcuts -->
				<div>
					<h3 class="text-sm font-semibold mb-2 text-primary">Global Shortcuts</h3>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">New Task</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Alt + N</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">Attach to Hovered Session</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Alt + A</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">Spawn New Session</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Alt + S</kbd>
						</div>
					</div>
				</div>

				<!-- Task Creation Shortcuts -->
				<div>
					<h3 class="text-sm font-semibold mb-2 text-primary">Task Creation Drawer</h3>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">Save & Start Agent</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Ctrl + Enter</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">Save & Close</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Alt + Enter</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">Save & New</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Ctrl + Shift + Enter</kbd>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-base-content/70">Close Drawer</span>
							<kbd class="kbd kbd-sm bg-base-200 text-base-content/80">Escape</kbd>
						</div>
					</div>
				</div>

				<!-- Session Card Tips -->
				<div>
					<h3 class="text-sm font-semibold mb-2 text-primary">Session Cards</h3>
					<ul class="text-sm space-y-1 text-base-content/65">
						<li class="flex items-start gap-2">
							<span class="text-base-content/50">•</span>
							<span>Hover over a session card, then press <kbd class="kbd kbd-xs">Alt + A</kbd> to attach terminal</span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-base-content/50">•</span>
							<span>Click the status badge for quick actions (Complete, Kill, Attach)</span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-base-content/50">•</span>
							<span>Drag the right edge to resize session cards</span>
						</li>
					</ul>
				</div>

				<!-- Voice Input -->
				<div>
					<h3 class="text-sm font-semibold mb-2 text-primary">Voice Input</h3>
					<ul class="text-sm space-y-1 text-base-content/65">
						<li class="flex items-start gap-2">
							<span class="text-base-content/50">•</span>
							<span>Click the microphone icon to start voice recording</span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-base-content/50">•</span>
							<span>Recording uses local whisper.cpp (privacy-first, no data sent externally)</span>
						</li>
					</ul>
				</div>

				<!-- Links -->
				<div class="pt-2 border-t border-base-content/20">
					<h3 class="text-sm font-semibold mb-2 text-primary">Resources</h3>
					<div class="flex flex-wrap gap-2">
						<a
							href="https://github.com/anthropics/claude-code/issues"
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors bg-base-200 text-base-content/70 hover:bg-base-100"
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
			<div class="px-5 py-3 flex justify-end border-t border-base-content/20 bg-base-200">
				<button
					onclick={() => showHelpModal = false}
					class="px-4 py-1.5 text-sm rounded transition-colors bg-base-300 text-base-content/80 hover:bg-base-100"
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
