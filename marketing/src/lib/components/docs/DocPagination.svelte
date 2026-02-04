<script lang="ts">
	import type { DocPage } from '$lib/docs/config';

	let { prev, next }: { prev?: DocPage; next?: DocPage } = $props();
</script>

<nav class="doc-pagination" aria-label="Page navigation">
	{#if prev}
		<a href="/docs/{prev.slug}/" class="pagination-link prev">
			<span class="pagination-direction">
				<svg viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/>
				</svg>
				Previous
			</span>
			<span class="pagination-title">{prev.title}</span>
		</a>
	{:else}
		<div></div>
	{/if}

	{#if next}
		<a href="/docs/{next.slug}/" class="pagination-link next">
			<span class="pagination-direction">
				Next
				<svg viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
						clip-rule="evenodd"
					/>
				</svg>
			</span>
			<span class="pagination-title">{next.title}</span>
		</a>
	{:else}
		<div></div>
	{/if}
</nav>

<style>
	.doc-pagination {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid oklch(20% 0.02 250);
	}

	.pagination-link {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem 1rem;
		border: 1px solid oklch(22% 0.02 250);
		border-radius: 0.5rem;
		text-decoration: none;
		transition:
			border-color 0.2s,
			background-color 0.2s;
		min-width: 0;
		max-width: 50%;
	}

	.pagination-link:hover {
		border-color: oklch(40% 0.08 240);
		background: oklch(15% 0.02 250);
	}

	.pagination-link.next {
		align-items: flex-end;
		margin-left: auto;
	}

	.pagination-direction {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: oklch(55% 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 500;
	}

	.pagination-direction svg {
		width: 0.85rem;
		height: 0.85rem;
	}

	.pagination-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(80% 0.12 240);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
