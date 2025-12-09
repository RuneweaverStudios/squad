<script lang="ts">
	/**
	 * AgentAvatar Component
	 * Displays agent avatar (SVG) or fallback initials
	 *
	 * Features:
	 * - Fetches SVG from /api/avatar/{name}
	 * - Caches results to avoid refetching on re-renders
	 * - Fallback to generic avatar icon
	 * - Uses oklch color space for theme consistency
	 * - Handles loading, success, and error states
	 * - Properly reactive to name prop changes
	 */

	interface Props {
		name: string;
		size?: number;
		class?: string;
	}

	let {
		name,
		size = 32,
		class: className = ''
	}: Props = $props();

	let loadState: 'loading' | 'success' | 'error' = $state('loading');
	let svgContent: string | null = $state(null);
	let currentFetchedName = $state<string | null>(null);

	// Cache for avatar SVGs (module-level to persist across instances)
	// Using globalThis to ensure cache survives HMR in development
	const avatarCache: Map<string, string> = (globalThis as any).__avatarCache ??= new Map();

	// Cache for "no avatar" results to avoid repeated API calls for agents without custom avatars
	const noAvatarCache: Set<string> = (globalThis as any).__noAvatarCache ??= new Set();

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
					// Cache the "no avatar" result to avoid repeated API calls
					noAvatarCache.add(cacheKey);
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
		if (noAvatarCache.has(cacheKey)) {
			svgContent = null;
			loadState = 'error';
			currentFetchedName = agentName;
			return;
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
</script>

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
