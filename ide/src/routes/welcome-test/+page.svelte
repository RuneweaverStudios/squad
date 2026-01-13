<script lang="ts">
	import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
</script>

<svelte:head>
	<title>Welcome Screen Test | JAT IDE</title>
	<meta name="description" content="Test page for the JAT IDE welcome screen component." />
	<meta property="og:title" content="Welcome Screen Test | JAT IDE" />
	<meta property="og:description" content="Test page for the JAT IDE welcome screen component." />
	<meta property="og:image" content="/favicons/config.svg" />
	<link rel="icon" href="/favicons/config.svg" />
</svelte:head>

<div class="min-h-screen bg-base-200">
	<WelcomeScreen />
</div>
