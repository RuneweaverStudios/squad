import { Marked } from 'marked';

const marked = new Marked();

// Custom renderer for heading IDs and anchor links
marked.use({
	renderer: {
		heading({ text, depth }: { text: string; depth: number }) {
			const id = text
				.toLowerCase()
				.replace(/<[^>]*>/g, '')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '-')
				.replace(/-+/g, '-')
				.trim();
			return `<h${depth} id="${id}"><a href="#${id}" class="heading-anchor">#</a>${text}</h${depth}>`;
		},
		code({ text, lang }: { text: string; lang?: string }) {
			const language = lang || '';
			const escaped = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `<div class="code-wrapper"><div class="code-lang">${language}</div><pre><code class="language-${language}">${escaped}</code></pre></div>`;
		},
		table({ header, rows }: { header: string; rows: string[] }) {
			return `<div class="table-wrapper"><table><thead>${header}</thead><tbody>${rows.join('')}</tbody></table></div>`;
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
	const html = marked.parse(markdown) as string;
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
