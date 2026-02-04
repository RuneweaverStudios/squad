<script lang="ts">
	import { page } from '$app/stores';
	import { getDocContent, parseMarkdown } from '$lib/docs/loader';
	import { getPageBySlug, getAdjacentPages, getSectionForSlug } from '$lib/docs/config';
	import DocToc from '$lib/components/docs/DocToc.svelte';
	import DocPagination from '$lib/components/docs/DocPagination.svelte';

	let slug = $derived($page.params.slug || 'introduction');
	let pageInfo = $derived(getPageBySlug(slug));
	let section = $derived(getSectionForSlug(slug));
	let adjacent = $derived(getAdjacentPages(slug));

	let rawContent = $derived(getDocContent(slug));
	let parsed = $derived(rawContent ? parseMarkdown(rawContent) : null);
</script>

<svelte:head>
	<title>{pageInfo?.title || 'Documentation'} - JAT Docs</title>
	{#if pageInfo?.description}
		<meta name="description" content={pageInfo.description} />
	{/if}
</svelte:head>

<div class="doc-page">
	<div class="doc-content-wrapper">
		{#if parsed}
			<!-- Breadcrumb -->
			<div class="doc-breadcrumb">
				<a href="/docs/introduction/">Docs</a>
				{#if section}
					<span class="breadcrumb-sep">/</span>
					<span>{section.title}</span>
				{/if}
				{#if pageInfo}
					<span class="breadcrumb-sep">/</span>
					<span class="breadcrumb-current">{pageInfo.title}</span>
				{/if}
			</div>

			<!-- Main content -->
			<article class="doc-content">
				{@html parsed.html}
			</article>

			<!-- Prev/Next navigation -->
			<DocPagination prev={adjacent.prev} next={adjacent.next} />
		{:else}
			<div class="doc-not-found">
				<h1>Page Not Found</h1>
				<p>The documentation page <code>{slug}</code> does not exist.</p>
				<a href="/docs/introduction/">Go to Introduction</a>
			</div>
		{/if}
	</div>

	<!-- Table of contents (right panel) -->
	{#if parsed && parsed.toc.length > 0}
		<aside class="doc-toc-panel">
			<DocToc items={parsed.toc} />
		</aside>
	{/if}
</div>

<style>
	.doc-page {
		display: flex;
		max-width: 100%;
		min-height: 100vh;
	}

	.doc-content-wrapper {
		flex: 1;
		min-width: 0;
		max-width: 52rem;
		padding: 2.5rem 3rem 4rem;
	}

	.doc-toc-panel {
		width: 14rem;
		flex-shrink: 0;
		padding-top: 2.5rem;
		display: block;
	}

	/* Breadcrumb */
	.doc-breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.78rem;
		color: oklch(45% 0.02 250);
		margin-bottom: 1.5rem;
	}

	.doc-breadcrumb a {
		color: oklch(55% 0.08 240);
		text-decoration: none;
	}

	.doc-breadcrumb a:hover {
		color: oklch(70% 0.15 240);
	}

	.breadcrumb-sep {
		color: oklch(30% 0.02 250);
	}

	.breadcrumb-current {
		color: oklch(65% 0.02 250);
	}

	/* Not found */
	.doc-not-found {
		padding: 4rem 0;
		text-align: center;
	}

	.doc-not-found h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: oklch(80% 0.02 250);
		margin-bottom: 0.5rem;
	}

	.doc-not-found p {
		color: oklch(55% 0.02 250);
		margin-bottom: 1rem;
	}

	.doc-not-found code {
		padding: 0.15rem 0.4rem;
		background: oklch(15% 0.02 250);
		border-radius: 0.25rem;
		font-size: 0.9em;
	}

	.doc-not-found a {
		color: oklch(70% 0.18 240);
		text-decoration: underline;
	}

	/* Content typography */
	.doc-content :global(h1) {
		font-size: 2rem;
		font-weight: 700;
		color: oklch(95% 0.02 250);
		margin-bottom: 1rem;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.doc-content :global(h2) {
		font-size: 1.4rem;
		font-weight: 650;
		color: oklch(92% 0.02 250);
		margin-top: 2.5rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid oklch(20% 0.02 250);
		letter-spacing: -0.01em;
		line-height: 1.3;
	}

	.doc-content :global(h3) {
		font-size: 1.15rem;
		font-weight: 600;
		color: oklch(88% 0.02 250);
		margin-top: 2rem;
		margin-bottom: 0.5rem;
		line-height: 1.3;
	}

	.doc-content :global(h4) {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(82% 0.02 250);
		margin-top: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.doc-content :global(p) {
		color: oklch(75% 0.02 250);
		line-height: 1.7;
		margin-bottom: 1rem;
	}

	.doc-content :global(strong) {
		color: oklch(88% 0.02 250);
		font-weight: 600;
	}

	.doc-content :global(a) {
		color: oklch(70% 0.18 240);
		text-decoration: none;
		border-bottom: 1px solid oklch(70% 0.18 240 / 0.3);
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.doc-content :global(a:hover) {
		color: oklch(80% 0.18 240);
		border-bottom-color: oklch(80% 0.18 240 / 0.5);
	}

	/* Inline code */
	.doc-content :global(code) {
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
		font-size: 0.85em;
		padding: 0.15rem 0.4rem;
		background: oklch(15% 0.02 250);
		border: 1px solid oklch(22% 0.02 250);
		border-radius: 0.25rem;
		color: oklch(80% 0.08 200);
	}

	/* Code blocks */
	.doc-content :global(.code-wrapper) {
		position: relative;
		margin: 1rem 0 1.25rem;
		border: 1px solid oklch(20% 0.02 250);
		border-radius: 0.5rem;
		overflow: hidden;
		background: oklch(10% 0.015 250);
	}

	.doc-content :global(.code-lang) {
		position: absolute;
		top: 0.4rem;
		right: 0.6rem;
		font-size: 0.65rem;
		color: oklch(40% 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: ui-monospace, monospace;
	}

	.doc-content :global(pre) {
		margin: 0;
		padding: 1rem 1.25rem;
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: oklch(25% 0.02 250) transparent;
	}

	.doc-content :global(pre code) {
		padding: 0;
		background: none;
		border: none;
		font-size: 0.82rem;
		line-height: 1.6;
		color: oklch(78% 0.02 250);
	}

	/* Lists */
	.doc-content :global(ul),
	.doc-content :global(ol) {
		padding-left: 1.5rem;
		margin-bottom: 1rem;
		color: oklch(75% 0.02 250);
	}

	.doc-content :global(li) {
		line-height: 1.7;
		margin-bottom: 0.25rem;
	}

	.doc-content :global(li > ul),
	.doc-content :global(li > ol) {
		margin-top: 0.25rem;
		margin-bottom: 0;
	}

	/* Tables */
	.doc-content :global(.table-wrapper) {
		overflow-x: auto;
		margin: 1rem 0 1.25rem;
		border: 1px solid oklch(20% 0.02 250);
		border-radius: 0.5rem;
	}

	.doc-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.doc-content :global(th) {
		text-align: left;
		padding: 0.6rem 1rem;
		background: oklch(14% 0.02 250);
		color: oklch(80% 0.02 250);
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border-bottom: 1px solid oklch(22% 0.02 250);
	}

	.doc-content :global(td) {
		padding: 0.5rem 1rem;
		color: oklch(72% 0.02 250);
		border-bottom: 1px solid oklch(16% 0.02 250);
	}

	.doc-content :global(tr:last-child td) {
		border-bottom: none;
	}

	/* Blockquotes */
	.doc-content :global(blockquote) {
		border-left: 3px solid oklch(70% 0.18 240 / 0.5);
		padding: 0.5rem 1rem;
		margin: 1rem 0;
		background: oklch(70% 0.18 240 / 0.05);
		border-radius: 0 0.375rem 0.375rem 0;
	}

	.doc-content :global(blockquote p) {
		margin-bottom: 0;
		color: oklch(70% 0.06 240);
	}

	/* Horizontal rule */
	.doc-content :global(hr) {
		border: none;
		border-top: 1px solid oklch(20% 0.02 250);
		margin: 2rem 0;
	}

	/* Heading anchors */
	.doc-content :global(.heading-anchor) {
		color: oklch(35% 0.02 250);
		text-decoration: none;
		border: none;
		margin-right: 0.35rem;
		font-weight: 400;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.doc-content :global(h2:hover .heading-anchor),
	.doc-content :global(h3:hover .heading-anchor),
	.doc-content :global(h4:hover .heading-anchor) {
		opacity: 1;
	}

	.doc-content :global(.heading-anchor:hover) {
		color: oklch(70% 0.18 240);
	}

	/* Responsive */
	@media (max-width: 1280px) {
		.doc-toc-panel {
			display: none;
		}
	}

	@media (max-width: 1024px) {
		.doc-content-wrapper {
			padding: 2rem 1.5rem 3rem;
		}
	}

	@media (max-width: 640px) {
		.doc-content-wrapper {
			padding: 3.5rem 1rem 3rem;
		}

		.doc-content :global(h1) {
			font-size: 1.6rem;
		}

		.doc-content :global(h2) {
			font-size: 1.2rem;
		}
	}
</style>
