<script lang="ts">
	/**
	 * Login page — shown when Keycloak is enabled and user is not authenticated.
	 * Offers one-click "Login with Keycloak" (Red Hat IAM).
	 */
	let { data } = $props();
</script>

<svelte:head>
	<title>Login — Squad IDE</title>
</svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center gap-6 p-6" style="background: oklch(0.12 0.02 250);">
	<div class="text-center max-w-md">
		<h1 class="text-2xl font-semibold mb-2" style="color: oklch(0.92 0.02 250);">Squad IDE</h1>
		<p class="text-sm mb-6" style="color: oklch(0.60 0.02 250);">
			Sign in to continue. Authentication is provided by Keycloak (Red Hat).
		</p>

		{#if data.keycloakEnabled}
			<a
				href="/auth/keycloak"
				class="btn btn-primary btn-lg gap-2 inline-flex items-center justify-center"
			>
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10zm-1-17v6h2v-6h-2zm0 8v2h2v-2h-2z"/>
				</svg>
				Login with Keycloak
			</a>
		{:else}
			<div class="rounded-lg p-4 text-left" style="background: oklch(0.18 0.02 250); border: 1px solid oklch(0.28 0.02 250);">
				<p class="text-sm" style="color: oklch(0.75 0.02 250);">
					Keycloak is not configured. Set <code class="text-xs px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">KEYCLOAK_URL</code>, <code class="text-xs px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">KEYCLOAK_REALM</code>, <code class="text-xs px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">KEYCLOAK_CLIENT_ID</code>, <code class="text-xs px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">KEYCLOAK_CLIENT_SECRET</code>, and <code class="text-xs px-1 py-0.5 rounded" style="background: oklch(0.22 0.01 250);">KEYCLOAK_REDIRECT_URI</code> to enable login.
				</p>
				<a href="/" class="btn btn-ghost btn-sm mt-3">Go to app</a>
			</div>
		{/if}
	</div>
</div>
