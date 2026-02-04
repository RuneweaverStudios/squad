<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import { page } from '$app/stores';

	let { children } = $props();

	// Don't show regular Nav on pages with their own navigation
	let showNav = $derived(
		!$page.url.pathname.startsWith('/thealienmanual') &&
			!$page.url.pathname.startsWith('/docs')
	);
</script>

<div class="min-h-screen bg-[var(--bg-deep)]">
	{#if showNav}
		<Nav />
	{/if}
	{@render children()}
</div>
