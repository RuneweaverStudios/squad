<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect /work to /projects (tasks view merged into projects)
	onMount(() => {
		goto('/projects', { replaceState: true });
	});
</script>

<div class="min-h-screen bg-base-200 flex items-center justify-center">
	<span class="loading loading-spinner loading-lg"></span>
</div>
