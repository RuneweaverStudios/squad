<script lang="ts">
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import { docSections } from '$lib/docs/config';

	let { onNavigate = () => {} }: { onNavigate?: () => void } = $props();

	let currentSlug = $derived($page.params.slug || 'introduction');

	// Track expanded sections - expand the section containing the current page
	let expandedSections = $state<Set<string>>(new Set());

	$effect(() => {
		const slug = currentSlug; // only track slug changes
		const section = docSections.find((s) => s.pages.some((p) => p.slug === slug));
		if (section) {
			untrack(() => {
				if (!expandedSections.has(section.title)) {
					expandedSections = new Set([...expandedSections, section.title]);
				}
			});
		}
	});

	function toggleSection(title: string) {
		if (expandedSections.has(title)) {
			expandedSections.delete(title);
		} else {
			expandedSections.add(title);
		}
		expandedSections = new Set(expandedSections);
	}
</script>

<nav class="doc-sidebar" aria-label="Documentation">
	<div class="sidebar-header">
		<a href="/" class="sidebar-logo">
			<span class="logo-squad">SQUAD</span>
			<span class="logo-docs">Docs</span>
		</a>
	</div>

	<div class="sidebar-search">
		<div class="search-placeholder">
			<svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/>
			</svg>
			<span>Search docs...</span>
			<kbd>Ctrl K</kbd>
		</div>
	</div>

	<div class="sidebar-sections">
		{#each docSections as section}
			<div class="sidebar-section">
				<button
					class="section-title"
					class:expanded={expandedSections.has(section.title)}
					onclick={() => toggleSection(section.title)}
				>
					<svg class="chevron" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
							clip-rule="evenodd"
						/>
					</svg>
					{section.title}
				</button>

				{#if expandedSections.has(section.title)}
					<ul class="section-pages">
						{#each section.pages as pg}
							<li>
								<a
									href="/docs/{pg.slug}/"
									class="page-link"
									class:active={currentSlug === pg.slug}
									onclick={onNavigate}
								>
									{pg.title}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</div>
</nav>

<style>
	.doc-sidebar {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		padding: 1rem 0;
		scrollbar-width: thin;
		scrollbar-color: oklch(30% 0.02 250) transparent;
	}

	.sidebar-header {
		padding: 0 1.25rem 1rem;
		border-bottom: 1px solid oklch(20% 0.02 250);
		margin-bottom: 0.75rem;
	}

	.sidebar-logo {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
	}

	.logo-squad {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: oklch(70% 0.18 240);
	}

	.logo-docs {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(60% 0.02 250);
		padding: 0.1rem 0.4rem;
		border: 1px solid oklch(25% 0.02 250);
		border-radius: 0.25rem;
	}

	.sidebar-search {
		padding: 0 1rem 0.75rem;
	}

	.search-placeholder {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid oklch(22% 0.02 250);
		border-radius: 0.5rem;
		color: oklch(45% 0.02 250);
		font-size: 0.8rem;
		cursor: pointer;
		transition: border-color 0.2s;
	}

	.search-placeholder:hover {
		border-color: oklch(35% 0.02 250);
	}

	.search-icon {
		width: 0.9rem;
		height: 0.9rem;
		flex-shrink: 0;
	}

	.search-placeholder span {
		flex: 1;
	}

	.search-placeholder kbd {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid oklch(25% 0.02 250);
		border-radius: 0.2rem;
		background: oklch(15% 0.02 250);
		font-family: inherit;
	}

	.sidebar-sections {
		padding: 0 0.5rem;
	}

	.sidebar-section {
		margin-bottom: 0.25rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
		padding: 0.4rem 0.75rem;
		border: none;
		background: none;
		color: oklch(75% 0.02 250);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
		border-radius: 0.375rem;
		transition: color 0.15s;
	}

	.section-title:hover {
		color: oklch(90% 0.02 250);
	}

	.chevron {
		width: 0.9rem;
		height: 0.9rem;
		flex-shrink: 0;
		transition: transform 0.15s;
		color: oklch(45% 0.02 250);
	}

	.section-title.expanded .chevron {
		transform: rotate(90deg);
	}

	.section-pages {
		list-style: none;
		padding: 0.15rem 0 0.4rem 0;
		margin: 0;
	}

	.page-link {
		display: block;
		padding: 0.3rem 0.75rem 0.3rem 2rem;
		color: oklch(60% 0.02 250);
		text-decoration: none;
		font-size: 0.82rem;
		border-radius: 0.375rem;
		transition:
			color 0.15s,
			background-color 0.15s;
		line-height: 1.4;
	}

	.page-link:hover {
		color: oklch(85% 0.02 250);
		background: oklch(18% 0.02 250);
	}

	.page-link.active {
		color: oklch(85% 0.15 240);
		background: oklch(70% 0.18 240 / 0.12);
		font-weight: 500;
	}
</style>
