<script lang="ts">
	/**
	 * AgentAvatar Component
	 * Displays agent avatar (SVG) or fallback initials with optional status ring
	 *
	 * Features:
	 * - Fetches SVG from /api/avatar/{name}
	 * - Caches results to avoid refetching on re-renders
	 * - Fallback to generic avatar icon
	 * - Uses oklch color space for theme consistency
	 * - Handles loading, success, and error states
	 * - Properly reactive to name prop changes
	 * - Optional status ring with customizable color and glow
	 */
	import { getSessionStateVisual } from '$lib/config/statusColors';
	import { getSessionByAgent } from '$lib/stores/workSessions.svelte';

	interface Props {
		name: string;
		size?: number;
		class?: string;
		/** Show status ring around avatar */
		showRing?: boolean;
		/** Ring color (oklch string) - overrides sessionState color */
		ringColor?: string;
		/** Session state for ring color (e.g., 'working', 'completed') - uses SESSION_STATE_VISUALS.accent */
		sessionState?: string;
		/** Show glow effect around ring */
		showGlow?: boolean;
	}

	let {
		name,
		size = 32,
		class: className = '',
		showRing = false,
		ringColor,
		sessionState,
		showGlow = false
	}: Props = $props();

	// Compute effective ring color from props, session state, or store lookup
	const effectiveRingColor = $derived.by(() => {
		if (!showRing) return null;
		if (ringColor) return ringColor;
		if (sessionState) return getSessionStateVisual(sessionState).accent;
		// Look up from global store if not provided
		const session = getSessionByAgent(name);
		if (session?._sseState) return getSessionStateVisual(session._sseState).accent;
		return 'oklch(0.70 0.18 250)'; // Default blue
	});

	let loadState: 'loading' | 'success' | 'error' = $state('loading');
	let svgContent: string | null = $state(null);
	let currentFetchedName = $state<string | null>(null);

	// Cache for avatar SVGs (module-level to persist across instances)
	// Using globalThis to ensure cache survives HMR in development
	const avatarCache: Map<string, string> = (globalThis as any).__avatarCache ??= new Map();

	// Cache for "no avatar" results to avoid repeated API calls for agents without custom avatars
	// Maps cacheKey -> timestamp of when fallback was cached (for retry logic)
	const noAvatarCache: Map<string, number> = (globalThis as any).__noAvatarCache ??= new Map();

	// How long to cache a "no avatar" result before retrying (30 seconds)
	// This allows queued avatar generations to complete before retrying
	const NO_AVATAR_RETRY_MS = 30_000;

	// Expose caches for debugging in browser console: window.__avatarCache, window.__noAvatarCache
	if (typeof window !== 'undefined') {
		(window as any).__avatarCache = avatarCache;
		(window as any).__noAvatarCache = noAvatarCache;
	}

	// Pending fetches to deduplicate in-flight requests
	const pendingFetches: Map<string, Promise<string | null>> = (globalThis as any).__pendingAvatarFetches ??= new Map();

	// Cache version - increment to bust all avatar caches
	// Bump this when avatars are regenerated or cache logic changes
	// v5: Added key to TaskTable #each loop for proper component keying
	// v6: Added negative cache (noAvatarCache) for fallback avatars
	const CACHE_VERSION = 6;

	// Actual fetch implementation
	async function doFetch(agentName: string, cacheKey: string): Promise<string | null> {
		const url = `/api/avatar/${encodeURIComponent(agentName)}?v=${CACHE_VERSION}`;

		try {
			const response = await fetch(url);

			if (response.ok) {
				const svg = await response.text();
				// Only use real generated avatars, not fallbacks with initials
				const isFallback = svg.includes('<text');
				if (isFallback) {
					// Cache the "no avatar" result with timestamp for retry logic
					noAvatarCache.set(cacheKey, Date.now());
					return null; // Return null so generic avatar icon is shown
				}
				avatarCache.set(cacheKey, svg);
				return svg;
			}
			// API error - don't cache, might be transient
			return null;
		} catch (err) {
			// Network error - don't cache, might be transient
			return null;
		}
	}

	// Fetch avatar - called by effect when name changes
	async function fetchAvatar(agentName: string): Promise<void> {
		if (!agentName) {
			loadState = 'error';
			svgContent = null;
			return;
		}

		const cacheKey = `${agentName}:v${CACHE_VERSION}`;

		// Check cache first - positive cache (has avatar)
		const cached = avatarCache.get(cacheKey);
		if (cached) {
			svgContent = cached;
			loadState = 'success';
			currentFetchedName = agentName;
			return;
		}

		// Check negative cache (no avatar - shows fallback icon)
		// Allow retry after NO_AVATAR_RETRY_MS to pick up queued generations
		const noAvatarTimestamp = noAvatarCache.get(cacheKey);
		if (noAvatarTimestamp !== undefined) {
			if (Date.now() - noAvatarTimestamp < NO_AVATAR_RETRY_MS) {
				svgContent = null;
				loadState = 'error';
				currentFetchedName = agentName;
				return;
			}
			// Expired - remove from cache and retry
			noAvatarCache.delete(cacheKey);
		}

		// Check if there's already a pending fetch for this avatar
		let fetchPromise = pendingFetches.get(cacheKey);
		if (!fetchPromise) {
			// No pending fetch, start one
			fetchPromise = doFetch(agentName, cacheKey);
			pendingFetches.set(cacheKey, fetchPromise);
		}

		loadState = 'loading';
		svgContent = null;

		try {
			const svg = await fetchPromise;
			if (svg) {
				svgContent = svg;
				loadState = 'success';
			} else {
				loadState = 'error';
			}
		} catch (err) {
			loadState = 'error';
		} finally {
			// Clean up pending fetch after a short delay (allow other waiters to complete)
			setTimeout(() => pendingFetches.delete(cacheKey), 100);
		}

		currentFetchedName = agentName;
	}

	// React to name prop changes - this is the reactive trigger
	$effect(() => {
		// Capture the current name value to create a dependency
		const targetName = name;

		// Only fetch if name changed or we haven't fetched yet
		if (targetName && targetName !== currentFetchedName) {
			fetchAvatar(targetName);
		}
	});

	// Retry timer: if we got a fallback, retry after the delay
	// This picks up avatars that were queued and generated after our initial request
	$effect(() => {
		if (loadState !== 'error' || !name) return;

		const cacheKey = `${name}:v${CACHE_VERSION}`;
		const noAvatarTimestamp = noAvatarCache.get(cacheKey);
		if (noAvatarTimestamp === undefined) return;

		const elapsed = Date.now() - noAvatarTimestamp;
		const remaining = NO_AVATAR_RETRY_MS - elapsed;
		if (remaining <= 0) return; // Will be retried on next fetchAvatar call

		const timer = setTimeout(() => {
			// Clear the cached name to force a re-fetch
			currentFetchedName = null;
		}, remaining + 100); // Small buffer

		return () => clearTimeout(timer);
	});
</script>

{#if showRing && effectiveRingColor}
	<!-- Avatar with status ring -->
	<div
		class="inline-flex items-center justify-center rounded-full flex-shrink-0 {className}"
		style="
			width: {size + 4}px;
			height: {size + 4}px;
			padding: 2px;
			background: {effectiveRingColor};
			{showGlow ? `box-shadow: 0 0 8px ${effectiveRingColor};` : ''}
		"
		title={name}
	>
		<div
			class="inline-flex items-center justify-center rounded-full overflow-hidden"
			style="width: {size}px; height: {size}px; perspective: 200px;"
		>
			{#if loadState === 'loading'}
				<div class="w-full h-full animate-pulse" style="background: oklch(0.30 0.02 250);"></div>
			{:else if loadState === 'success' && svgContent}
				<div class="w-full h-full avatar-flip-in" style="background: oklch(0.15 0.01 250);">
					{@html svgContent}
				</div>
			{:else}
				<div class="w-full h-full flex items-center justify-center avatar-flip-in" style="background: oklch(0.25 0.02 250);">
					<svg viewBox="0 0 24 24" fill="currentColor" class="text-base-content/50" style="width: {size * 0.65}px; height: {size * 0.65}px;">
						<path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" />
					</svg>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<!-- Avatar without ring (original behavior) -->
	<div
		class="inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 {className}"
		style="width: {size}px; height: {size}px; perspective: 200px;"
	>
		{#if loadState === 'loading'}
			<!-- Loading skeleton -->
			<div
				class="w-full h-full animate-pulse"
				style="background: oklch(0.30 0.02 250);"
			></div>
		{:else if loadState === 'success' && svgContent}
			<!-- SVG avatar with flip-in animation -->
			<div
				class="w-full h-full avatar-flip-in"
				style="background: oklch(0.15 0.01 250);"
			>
				{@html svgContent}
			</div>
		{:else}
			<!-- Fallback: generic avatar icon with flip-in animation -->
			<div
				class="w-full h-full flex items-center justify-center avatar-flip-in"
				style="background: oklch(0.25 0.02 250);"
			>
				<svg
					viewBox="0 0 24 24"
					fill="currentColor"
					class="text-base-content/50"
					style="width: {size * 0.65}px; height: {size * 0.65}px;"
				>
					<path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" />
				</svg>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Ensure SVG scales to fill container */
	div :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* Flip-in animation for avatar reveal */
	.avatar-flip-in {
		animation: avatarFlipIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
		transform-style: preserve-3d;
	}

	@keyframes avatarFlipIn {
		0% {
			transform: rotateY(-90deg) scale(0.8);
			opacity: 0;
		}
		50% {
			opacity: 1;
		}
		100% {
			transform: rotateY(0deg) scale(1);
			opacity: 1;
		}
	}
</style>
