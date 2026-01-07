<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-[var(--bg-deep)]">
	<Nav />
	{@render children()}
</div>
