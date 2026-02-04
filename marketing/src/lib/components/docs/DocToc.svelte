<script lang="ts">
	import type { TocItem } from '$lib/docs/loader';
	import { onMount } from 'svelte';

	let { items = [] }: { items: TocItem[] } = $props();

	let activeId = $state('');

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				// Find the topmost visible heading
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

				if (visible.length > 0) {
					activeId = visible[0].target.id;
				}
			},
			{
				rootMargin: '-80px 0px -70% 0px',
				threshold: 0
			}
		);

		// Observe all heading elements that match our TOC
		const headings = document.querySelectorAll(
			'.doc-content h2[id], .doc-content h3[id], .doc-content h4[id]'
		);
		headings.forEach((h) => observer.observe(h));

		return () => observer.disconnect();
	});

	function scrollToHeading(id: string) {
		const el = document.getElementById(id);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			activeId = id;
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
		color: oklch(80% 0.15 240);
		border-left-color: oklch(70% 0.18 240);
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
