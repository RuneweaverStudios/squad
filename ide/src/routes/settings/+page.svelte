<script lang="ts">
	import ReviewRulesEditor from '$lib/components/ReviewRulesEditor.svelte';
	import SignalDebugWidget from '$lib/components/SignalDebugWidget.svelte';
</script>

<svelte:head>
	<title>Settings | JAT IDE</title>
	<meta name="description" content="Configure JAT IDE settings. Manage review rules and access debug tools." />
	<meta property="og:title" content="Settings | JAT IDE" />
	<meta property="og:description" content="Configure JAT IDE settings. Manage review rules and access debug tools." />
	<meta property="og:image" content="/favicons/config.svg" />
	<link rel="icon" href="/favicons/config.svg" />
</svelte:head>

<div class="p-6 max-w-4xl mx-auto">
	<h1 class="text-2xl font-bold mb-6">Settings</h1>

	<div class="space-y-8">
		<ReviewRulesEditor />

		<!-- Debug section -->
		<div>
			<h2 class="text-lg font-semibold mb-4" style="color: oklch(0.75 0.02 250);">Debug Tools</h2>
			<SignalDebugWidget />
		</div>
	</div>
</div>
