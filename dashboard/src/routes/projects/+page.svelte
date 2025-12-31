<script lang="ts">
	/**
	 * Projects Page - Redirects to /work
	 *
	 * The /projects route has been renamed to /work.
	 * This redirect ensures any old links continue to work.
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/work', { replaceState: true });
	});
</script>

<div class="h-full bg-base-200 flex items-center justify-center">
	<span class="loading loading-spinner loading-lg"></span>
</div>
