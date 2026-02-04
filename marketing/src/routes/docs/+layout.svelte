<script lang="ts">
	import DocSidebar from '$lib/components/docs/DocSidebar.svelte';

	let { children } = $props();

	let mobileMenuOpen = $state(false);

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<div class="docs-layout">
	<!-- Mobile menu button -->
	<button
		class="mobile-menu-btn"
		onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
		aria-label="Toggle navigation"
	>
		{#if mobileMenuOpen}
			<svg viewBox="0 0 20 20" fill="currentColor">
				<path
					d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 012 10z"
					clip-rule="evenodd"
				/>
			</svg>
		{/if}
	</button>

	<!-- Mobile overlay -->
	{#if mobileMenuOpen}
		<button class="mobile-overlay" onclick={closeMobileMenu} aria-label="Close menu"></button>
	{/if}

	<!-- Sidebar -->
	<aside class="docs-sidebar" class:open={mobileMenuOpen}>
		<DocSidebar onNavigate={closeMobileMenu} />
	</aside>

	<!-- Main content area -->
	<div class="docs-main">
		{@render children()}
	</div>
</div>

<style>
	.docs-layout {
		display: flex;
		min-height: 100vh;
		background: var(--bg-deep);
	}

	.docs-sidebar {
		position: fixed;
		top: 0;
		left: 0;
		width: 16rem;
		height: 100vh;
		background: oklch(10% 0.02 250);
		border-right: 1px solid oklch(18% 0.02 250);
		z-index: 40;
		overflow: hidden;
	}

	.docs-main {
		flex: 1;
		margin-left: 16rem;
		min-width: 0;
	}

	.mobile-menu-btn {
		display: none;
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 50;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;
		border: 1px solid oklch(25% 0.02 250);
		background: oklch(12% 0.02 250);
		color: oklch(80% 0.02 250);
		cursor: pointer;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.mobile-menu-btn svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.mobile-overlay {
		display: none;
		position: fixed;
		inset: 0;
		background: oklch(0% 0 0 / 0.6);
		z-index: 35;
		border: none;
		cursor: default;
	}

	@media (max-width: 1024px) {
		.docs-sidebar {
			transform: translateX(-100%);
			transition: transform 0.25s ease;
		}

		.docs-sidebar.open {
			transform: translateX(0);
		}

		.docs-main {
			margin-left: 0;
		}

		.mobile-menu-btn {
			display: flex;
		}

		.mobile-overlay {
			display: block;
		}
	}
</style>
