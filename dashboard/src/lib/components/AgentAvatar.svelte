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
	const avatarCache = new Map<string, string>();

	// Pending fetches to deduplicate in-flight requests
	const pendingFetches = new Map<string, Promise<string | null>>();

	// Cache version - increment to bust all avatar caches
	// Bump this when avatars are regenerated or cache logic changes
	const CACHE_VERSION = 4;

	// Actual fetch implementation
	async function doFetch(agentName: string, cacheKey: string): Promise<string | null> {
		const url = `/api/avatar/${encodeURIComponent(agentName)}?v=${CACHE_VERSION}`;
		console.log(`[AgentAvatar] Fetching: ${url}`);

		try {
			const response = await fetch(url);
			console.log(`[AgentAvatar] Response for ${agentName}: status=${response.status}`);

			if (response.ok) {
				const svg = await response.text();
				console.log(`[AgentAvatar] Got SVG for ${agentName}: ${svg.length} bytes, starts with: ${svg.substring(0, 50)}`);
				// Only use real generated avatars, not fallbacks with initials
				const isFallback = svg.includes('<text');
				if (isFallback) {
					console.log(`[AgentAvatar] Fallback detected for ${agentName}, using generic icon`);
					return null; // Return null so generic avatar icon is shown
				}
				avatarCache.set(cacheKey, svg);
				console.log(`[AgentAvatar] Cached ${agentName}`);
				return svg;
			}
			console.log(`[AgentAvatar] Failed for ${agentName}: status=${response.status}`);
			return null;
		} catch (err) {
			console.error(`[AgentAvatar] Fetch error for ${agentName}:`, err);
			return null;
		}
	}

	// Fetch avatar - called by effect when name changes
	async function fetchAvatar(agentName: string): Promise<void> {
		console.log(`[AgentAvatar] fetchAvatar called for: ${agentName}`);
		if (!agentName) {
			loadState = 'error';
			svgContent = null;
			return;
		}

		const cacheKey = `${agentName}:v${CACHE_VERSION}`;

		// Check cache first
		const cached = avatarCache.get(cacheKey);
		if (cached) {
			console.log(`[AgentAvatar] Cache HIT for ${agentName}`);
			svgContent = cached;
			loadState = 'success';
			currentFetchedName = agentName;
			return;
		}
		console.log(`[AgentAvatar] Cache MISS for ${agentName}, fetching...`);

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
			console.log(`[AgentAvatar] Fetch complete for ${agentName}: got ${svg ? svg.length + ' bytes' : 'null'}`);
			if (svg) {
				svgContent = svg;
				loadState = 'success';
				console.log(`[AgentAvatar] Set loadState=success for ${agentName}`);
			} else {
				loadState = 'error';
				console.log(`[AgentAvatar] Set loadState=error for ${agentName} (null svg)`);
			}
		} catch (err) {
			loadState = 'error';
			console.error(`[AgentAvatar] Set loadState=error for ${agentName} (exception):`, err);
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
