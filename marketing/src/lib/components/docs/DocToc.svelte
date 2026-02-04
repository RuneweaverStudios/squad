<script lang="ts">
	import type { TocItem } from '$lib/docs/loader';
	import { onMount } from 'svelte';

	let { items = [] }: { items: TocItem[] } = $props();

	let activeId = $state('');
	let manualClick = false;

	onMount(() => {
		const SCROLL_OFFSET = 100; // px from top to consider "active"

		function updateActiveHeading() {
			if (manualClick) return;

			const headings = document.querySelectorAll(
				'.doc-content h2[id], .doc-content h3[id], .doc-content h4[id]'
			);
			if (headings.length === 0) return;

			// Find the last heading that has scrolled past the offset line
			let current = '';
			for (const heading of headings) {
				const rect = heading.getBoundingClientRect();
				if (rect.top <= SCROLL_OFFSET) {
					current = heading.id;
				} else {
					break;
				}
			}

			// If nothing passed the offset, use the first heading
			if (!current && headings.length > 0) {
				current = headings[0].id;
			}

			if (current) {
				activeId = current;
			}
		}

		// Throttle scroll handler
		let ticking = false;
		function onScroll() {
			if (!ticking) {
				requestAnimationFrame(() => {
					updateActiveHeading();
					ticking = false;
				});
				ticking = true;
			}
		}

		window.addEventListener('scroll', onScroll, { passive: true });
		updateActiveHeading(); // Set initial state

		return () => window.removeEventListener('scroll', onScroll);
	});

	// Scroll the TOC panel to keep active item visible
	$effect(() => {
		if (!activeId) return;
		const activeEl = document.querySelector(`.toc-link.active`);
		if (activeEl) {
			const tocNav = activeEl.closest('.doc-toc');
			if (tocNav) {
				const tocRect = tocNav.getBoundingClientRect();
				const elRect = activeEl.getBoundingClientRect();
				if (elRect.top < tocRect.top || elRect.bottom > tocRect.bottom) {
					activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}
		}
	});

	function scrollToHeading(id: string) {
		const el = document.getElementById(id);
		if (el) {
			manualClick = true;
			activeId = id;
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			// Re-enable scroll tracking after animation settles
			setTimeout(() => {
				manualClick = false;
			}, 800);
		}
	}
</script>

{#if items.length > 0}
	<nav class="doc-toc" aria-label="On this page">
		<div class="toc-header">On this page</div>
		<ul class="toc-list">
			{#each items as item}
				<li>
					<button
						class="toc-link depth-{item.depth}"
						class:active={activeId === item.id}
						onclick={() => scrollToHeading(item.id)}
					>
						{item.text}
					</button>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	.doc-toc {
		position: sticky;
		top: 5rem;
		max-height: calc(100vh - 6rem);
		overflow-y: auto;
		padding: 0 1rem;
		scrollbar-width: thin;
		scrollbar-color: oklch(25% 0.02 250) transparent;
	}

	.toc-header {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(55% 0.02 250);
		padding-bottom: 0.5rem;
		margin-bottom: 0.25rem;
		border-bottom: 1px solid oklch(20% 0.02 250);
	}

	.toc-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.toc-link {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.25rem 0;
		padding-left: 0.5rem;
		border: none;
		background: none;
		color: oklch(50% 0.02 250);
		font-size: 0.78rem;
		line-height: 1.5;
		cursor: pointer;
		border-left: 2px solid transparent;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.toc-link:hover {
		color: oklch(80% 0.02 250);
	}

	.toc-link.active {
		color: oklch(85% 0.15 240);
		border-left-color: oklch(70% 0.18 240);
		background: oklch(70% 0.18 240 / 0.08);
		border-radius: 0 0.25rem 0.25rem 0;
	}

	.toc-link.depth-3 {
		padding-left: 1.25rem;
		font-size: 0.75rem;
	}

	.toc-link.depth-4 {
		padding-left: 2rem;
		font-size: 0.72rem;
	}
</style>
