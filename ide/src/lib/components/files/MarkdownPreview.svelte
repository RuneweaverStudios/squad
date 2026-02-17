<script lang="ts">
	/**
	 * MarkdownPreview - Renders markdown content as formatted HTML
	 *
	 * Used by FileEditor to provide a rendered preview of .md files.
	 * Reuses the same marked configuration and styling as DocsViewer.
	 */

	import { onMount } from 'svelte';
	import { marked, type MarkedOptions } from 'marked';

	let { content = '' }: { content: string } = $props();

	let renderedHtml = $state('');
	let contentEl: HTMLDivElement | undefined = $state(undefined);

	// Configure marked with custom renderers
	const renderer = new marked.Renderer();

	// Heading renderer with anchor links
	renderer.heading = function ({ tokens, depth }) {
		const text = tokens.map((t) => ('text' in t ? t.text : '')).join('');
		const slug = text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-');

		return `<h${depth} id="${slug}" class="doc-heading doc-h${depth}">
			<a href="#${slug}" class="heading-anchor">#</a>
			${text}
		</h${depth}>`;
	};

	// Code block renderer with language label and copy button
	renderer.code = function ({ text, lang }) {
		const language = lang || 'text';
		const escapedCode = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');

		return `<div class="code-block">
			<div class="code-header">
				<span class="code-lang">${language}</span>
				<button class="copy-btn" data-code="${escapedCode}" title="Copy code">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="copy-icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
					</svg>
				</button>
			</div>
			<pre class="code-content"><code class="language-${language}">${escapedCode}</code></pre>
		</div>`;
	};

	// Table renderer with wrapper for horizontal scroll
	renderer.table = function ({ header, rows }) {
		const headerHtml = header.map((cell) => `<th>${cell.text}</th>`).join('');
		const bodyHtml = rows
			.map((row) => `<tr>${row.map((cell) => `<td>${cell.text}</td>`).join('')}</tr>`)
			.join('');

		return `<div class="table-wrapper">
			<table class="doc-table">
				<thead><tr>${headerHtml}</tr></thead>
				<tbody>${bodyHtml}</tbody>
			</table>
		</div>`;
	};

	marked.setOptions({
		renderer,
		gfm: true,
		breaks: true
	} as MarkedOptions);

	// Re-render when content changes
	$effect(() => {
		if (content) {
			renderedHtml = marked.parse(content) as string;
		} else {
			renderedHtml = '';
		}
	});

	// Handle copy button clicks via event delegation
	function handleClick(e: MouseEvent) {
		const btn = (e.target as HTMLElement).closest('.copy-btn') as HTMLElement | null;
		if (!btn) return;

		const code = btn.getAttribute('data-code') || '';
		const decoded = code
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'");

		navigator.clipboard.writeText(decoded);
		btn.classList.add('copied');
		setTimeout(() => btn.classList.remove('copied'), 2000);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="md-preview" bind:this={contentEl} onclick={handleClick}>
	<div class="markdown-content">
		{@html renderedHtml}
	</div>
</div>

<style>
	.md-preview {
		height: 100%;
		overflow-y: auto;
		padding: 2rem 2.5rem;
		background: oklch(0.14 0.01 250);
	}

	/* Scrollbar */
	.md-preview::-webkit-scrollbar {
		width: 8px;
	}
	.md-preview::-webkit-scrollbar-track {
		background: oklch(0.14 0.01 250);
	}
	.md-preview::-webkit-scrollbar-thumb {
		background: oklch(0.28 0.02 250);
		border-radius: 4px;
	}
	.md-preview::-webkit-scrollbar-thumb:hover {
		background: oklch(0.35 0.02 250);
	}

	/* Markdown content styles — same as DocsViewer */
	.markdown-content {
		color: oklch(0.85 0.02 250);
		font-size: 0.9rem;
		line-height: 1.7;
		max-width: 52rem;
	}

	/* Headings */
	:global(.md-preview .doc-heading) {
		font-weight: 600;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
		position: relative;
	}
	:global(.md-preview .doc-h1) {
		font-size: 1.5rem;
		color: oklch(0.95 0.02 250);
		border-bottom: 2px solid oklch(0.25 0.02 250);
		padding-bottom: 0.5rem;
	}
	:global(.md-preview .doc-h2) {
		font-size: 1.25rem;
		color: oklch(0.90 0.04 200);
	}
	:global(.md-preview .doc-h3) {
		font-size: 1.1rem;
		color: oklch(0.85 0.02 250);
	}
	:global(.md-preview .doc-h4) {
		font-size: 1rem;
		color: oklch(0.80 0.02 250);
	}
	:global(.md-preview .heading-anchor) {
		position: absolute;
		left: -1.25rem;
		color: oklch(0.40 0.02 250);
		text-decoration: none;
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	:global(.md-preview .doc-heading:hover .heading-anchor) {
		opacity: 1;
	}

	/* Paragraphs */
	:global(.md-preview p) {
		margin: 0 0 1rem 0;
	}

	/* Lists */
	:global(.md-preview ul),
	:global(.md-preview ol) {
		margin: 0 0 1rem 0;
		padding-left: 1.5rem;
	}
	:global(.md-preview li) {
		margin-bottom: 0.375rem;
	}

	/* Links */
	:global(.md-preview a) {
		color: oklch(0.75 0.15 200);
		text-decoration: none;
	}
	:global(.md-preview a:hover) {
		text-decoration: underline;
	}

	/* Inline code */
	:global(.md-preview code:not([class*='language-'])) {
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		background: oklch(0.20 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		color: oklch(0.80 0.10 280);
	}

	/* Code blocks */
	:global(.md-preview .code-block) {
		margin: 1rem 0;
		border-radius: 8px;
		overflow: hidden;
		background: oklch(0.10 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
	}
	:global(.md-preview .code-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: oklch(0.14 0.02 250);
		border-bottom: 1px solid oklch(0.20 0.02 250);
	}
	:global(.md-preview .code-lang) {
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
	}
	:global(.md-preview .copy-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: oklch(0.20 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 4px;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	:global(.md-preview .copy-btn:hover) {
		background: oklch(0.25 0.02 250);
		color: oklch(0.75 0.02 250);
	}
	:global(.md-preview .copy-btn.copied) {
		background: oklch(0.30 0.10 145);
		border-color: oklch(0.45 0.15 145);
		color: oklch(0.85 0.10 145);
	}
	:global(.md-preview .copy-icon) {
		width: 14px;
		height: 14px;
	}
	:global(.md-preview .code-content) {
		margin: 0;
		padding: 1rem;
		overflow-x: auto;
	}
	:global(.md-preview .code-content code) {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		line-height: 1.5;
		color: oklch(0.85 0.02 250);
	}

	/* Tables */
	:global(.md-preview .table-wrapper) {
		overflow-x: auto;
		margin: 1rem 0;
	}
	:global(.md-preview .doc-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	:global(.md-preview .doc-table th),
	:global(.md-preview .doc-table td) {
		padding: 0.625rem 0.75rem;
		text-align: left;
		border: 1px solid oklch(0.25 0.02 250);
	}
	:global(.md-preview .doc-table th) {
		background: oklch(0.18 0.02 250);
		font-weight: 600;
		color: oklch(0.80 0.02 250);
	}
	:global(.md-preview .doc-table tr:nth-child(even) td) {
		background: oklch(0.15 0.01 250);
	}

	/* Blockquotes */
	:global(.md-preview blockquote) {
		margin: 1rem 0;
		padding: 0.75rem 1rem;
		background: oklch(0.16 0.02 250);
		border-left: 3px solid oklch(0.50 0.10 200);
		color: oklch(0.75 0.02 250);
	}
	:global(.md-preview blockquote p:last-child) {
		margin-bottom: 0;
	}

	/* Horizontal rule */
	:global(.md-preview hr) {
		border: none;
		border-top: 1px solid oklch(0.25 0.02 250);
		margin: 2rem 0;
	}

	/* Strong and emphasis */
	:global(.md-preview strong) {
		font-weight: 600;
		color: oklch(0.95 0.02 250);
	}
	:global(.md-preview em) {
		font-style: italic;
	}

	/* Images */
	:global(.md-preview img) {
		max-width: 100%;
		height: auto;
		border-radius: 8px;
		margin: 1rem 0;
	}

	/* Checkbox lists (GFM task lists) */
	:global(.md-preview input[type='checkbox']) {
		margin-right: 0.5rem;
		accent-color: oklch(0.65 0.15 200);
	}
</style>
