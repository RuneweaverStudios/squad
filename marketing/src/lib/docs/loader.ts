import { Marked } from 'marked';

const marked = new Marked();

// Helper to render inline tokens to HTML
function renderInline(tokens: Array<{ type: string; text?: string; raw?: string }>): string {
	return tokens
		.map((t) => {
			if (t.type === 'codespan') return `<code>${t.text}</code>`;
			if (t.type === 'strong') return `<strong>${t.text}</strong>`;
			if (t.type === 'em') return `<em>${t.text}</em>`;
			return t.text ?? t.raw ?? '';
		})
		.join('');
}

// Custom renderer for heading IDs, code blocks, and links
marked.use({
	renderer: {
		heading({ tokens, text, depth }: { tokens?: Array<{ type: string; text?: string; raw?: string }>; text: string; depth: number }) {
			// Use raw text (no HTML) for the ID
			const id = text
				.toLowerCase()
				.replace(/<[^>]*>/g, '')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '-')
				.replace(/-+/g, '-')
				.trim();
			// Render inline tokens for display (handles <code>, <strong>, etc.)
			const display = tokens ? renderInline(tokens) : text;
			return `<h${depth} id="${id}"><a href="#${id}" class="heading-anchor">#</a>${display}</h${depth}>`;
		},
		code({ text, lang }: { text: string; lang?: string }) {
			const language = lang || '';
			const escaped = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `<div class="code-wrapper"><div class="code-lang">${language}</div><pre><code class="language-${language}">${escaped}</code></pre></div>`;
		},
		link({ href, text }: { href: string; text: string }) {
			const isExternal = href.startsWith('http');
			const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
			return `<a href="${href}"${attrs}>${text}</a>`;
		}
	}
});

export interface TocItem {
	id: string;
	text: string;
	depth: number;
}

export interface ParsedDoc {
	html: string;
	toc: TocItem[];
}

export function extractToc(markdown: string): TocItem[] {
	const items: TocItem[] = [];
	const headingRegex = /^(#{2,4})\s+(.+)$/gm;
	let match;

	while ((match = headingRegex.exec(markdown)) !== null) {
		const depth = match[1].length;
		const text = match[2].replace(/`([^`]+)`/g, '$1').trim();
		const id = text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
		items.push({ id, text, depth });
	}

	return items;
}

export function parseMarkdown(markdown: string): ParsedDoc {
	const toc = extractToc(markdown);
	let html = marked.parse(markdown) as string;
	// Wrap tables in scrollable container
	html = html.replace(/<table>/g, '<div class="table-wrapper"><table>').replace(/<\/table>/g, '</table></div>');
	return { html, toc };
}

// Load all content modules at build time
const contentModules = import.meta.glob('./content/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

export function getDocContent(slug: string): string | null {
	const key = `./content/${slug}.md`;
	const content = contentModules[key];
	if (typeof content === 'string') {
		return content;
	}
	return null;
}

export function getAllSlugs(): string[] {
	return Object.keys(contentModules).map((key) =>
		key.replace('./content/', '').replace('.md', '')
	);
}
