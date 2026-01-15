<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect / to /tasks (default route)
	onMount(() => {
		goto('/tasks', { replaceState: true });
	});
</script>

<!-- Redirecting to /tasks... -->
<div class="min-h-screen bg-base-200 flex items-center justify-center">
	<span class="loading loading-spinner loading-lg"></span>
</div>
