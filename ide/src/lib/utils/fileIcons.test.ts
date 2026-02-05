/**
 * Unit Tests for fileIcons.ts
 *
 * Tests emoji icon mapping for files and folders in the file explorer.
 */

import { describe, it, expect } from 'vitest';
import { getFileIcon, getFolderIcon, getFileTypeColor } from './fileIcons';

// ============================================================================
// getFileIcon Tests
// ============================================================================

describe('getFileIcon', () => {
	describe('Special file names', () => {
		it('should return package icon for package.json', () => {
			expect(getFileIcon('package.json')).toBe('📦');
		});

		it('should return lock icon for package-lock.json', () => {
			expect(getFileIcon('package-lock.json')).toBe('🔒');
		});

		it('should return lock icon for yarn.lock', () => {
			expect(getFileIcon('yarn.lock')).toBe('🔒');
		});

		it('should return TypeScript icon for tsconfig.json', () => {
			expect(getFileIcon('tsconfig.json')).toBe('🔷');
		});

		it('should return Vite icon for vite.config.ts', () => {
			expect(getFileIcon('vite.config.ts')).toBe('⚡');
		});

		it('should return git icon for .gitignore', () => {
			expect(getFileIcon('.gitignore')).toBe('🚫');
		});

		it('should return Docker icon for Dockerfile', () => {
			expect(getFileIcon('Dockerfile')).toBe('🐳');
		});

		it('should return Docker icon for docker-compose.yml', () => {
			expect(getFileIcon('docker-compose.yml')).toBe('🐳');
		});

		it('should return book icon for README.md', () => {
			expect(getFileIcon('README.md')).toBe('📖');
		});

		it('should return book icon for lowercase readme.md', () => {
			expect(getFileIcon('readme.md')).toBe('📖');
		});

		it('should return robot icon for CLAUDE.md', () => {
			expect(getFileIcon('CLAUDE.md')).toBe('🤖');
		});

		it('should return license icon for LICENSE', () => {
			expect(getFileIcon('LICENSE')).toBe('⚖️');
		});

		it('should return key icon for .env', () => {
			expect(getFileIcon('.env')).toBe('🔐');
		});

		it('should return key icon for .env.local', () => {
			expect(getFileIcon('.env.local')).toBe('🔐');
		});

		it('should return Svelte icon for svelte.config.js', () => {
			expect(getFileIcon('svelte.config.js')).toBe('🧡');
		});

		it('should return test icon for vitest.config.ts', () => {
			expect(getFileIcon('vitest.config.ts')).toBe('🧪');
		});

		it('should return playwright icon for playwright.config.ts', () => {
			expect(getFileIcon('playwright.config.ts')).toBe('🎭');
		});

		it('should return hammer icon for Makefile', () => {
			expect(getFileIcon('Makefile')).toBe('🔨');
		});
	});

	describe('TypeScript/JavaScript extensions', () => {
		it('should return blue diamond for .ts', () => {
			expect(getFileIcon('app.ts')).toBe('🔷');
		});

		it('should return blue diamond for .tsx', () => {
			expect(getFileIcon('Component.tsx')).toBe('🔷');
		});

		it('should return yellow square for .js', () => {
			expect(getFileIcon('app.js')).toBe('🟨');
		});

		it('should return yellow square for .jsx', () => {
			expect(getFileIcon('Component.jsx')).toBe('🟨');
		});

		it('should return yellow square for .mjs', () => {
			expect(getFileIcon('module.mjs')).toBe('🟨');
		});

		it('should return yellow square for .cjs', () => {
			expect(getFileIcon('config.cjs')).toBe('🟨');
		});
	});

	describe('Framework-specific extensions', () => {
		it('should return orange heart for .svelte', () => {
			expect(getFileIcon('Component.svelte')).toBe('🧡');
		});
	});

	describe('Style extensions', () => {
		it('should return palette for .css', () => {
			expect(getFileIcon('styles.css')).toBe('🎨');
		});

		it('should return palette for .scss', () => {
			expect(getFileIcon('styles.scss')).toBe('🎨');
		});

		it('should return palette for .sass', () => {
			expect(getFileIcon('styles.sass')).toBe('🎨');
		});

		it('should return palette for .less', () => {
			expect(getFileIcon('styles.less')).toBe('🎨');
		});
	});

	describe('Markup extensions', () => {
		it('should return globe for .html', () => {
			expect(getFileIcon('index.html')).toBe('🌐');
		});

		it('should return globe for .htm', () => {
			expect(getFileIcon('page.htm')).toBe('🌐');
		});

		it('should return clipboard for .xml', () => {
			expect(getFileIcon('config.xml')).toBe('📋');
		});

		it('should return image for .svg', () => {
			expect(getFileIcon('icon.svg')).toBe('🖼️');
		});
	});

	describe('Data extensions', () => {
		it('should return package for .json', () => {
			expect(getFileIcon('data.json')).toBe('📦');
		});

		it('should return gear for .yaml', () => {
			expect(getFileIcon('config.yaml')).toBe('⚙️');
		});

		it('should return gear for .yml', () => {
			expect(getFileIcon('config.yml')).toBe('⚙️');
		});

		it('should return gear for .toml', () => {
			expect(getFileIcon('Cargo.toml')).toBe('⚙️');
		});
	});

	describe('Documentation extensions', () => {
		it('should return memo for .md', () => {
			expect(getFileIcon('docs.md')).toBe('📝');
		});

		it('should return memo for .mdx', () => {
			expect(getFileIcon('docs.mdx')).toBe('📝');
		});

		it('should return page for .txt', () => {
			expect(getFileIcon('notes.txt')).toBe('📄');
		});

		it('should return page for .rst', () => {
			expect(getFileIcon('docs.rst')).toBe('📄');
		});
	});

	describe('Shell/Script extensions', () => {
		it('should return shell for .sh', () => {
			expect(getFileIcon('install.sh')).toBe('🐚');
		});

		it('should return shell for .bash', () => {
			expect(getFileIcon('script.bash')).toBe('🐚');
		});

		it('should return shell for .zsh', () => {
			expect(getFileIcon('config.zsh')).toBe('🐚');
		});

		it('should return shell for .fish', () => {
			expect(getFileIcon('config.fish')).toBe('🐚');
		});
	});

	describe('Language-specific extensions', () => {
		it('should return snake for .py', () => {
			expect(getFileIcon('script.py')).toBe('🐍');
		});

		it('should return blue circle for .go', () => {
			expect(getFileIcon('main.go')).toBe('🔵');
		});

		it('should return crab for .rs', () => {
			expect(getFileIcon('lib.rs')).toBe('🦀');
		});

		it('should return coffee for .java', () => {
			expect(getFileIcon('Main.java')).toBe('☕');
		});

		it('should return purple circle for .kt', () => {
			expect(getFileIcon('App.kt')).toBe('🟣');
		});

		it('should return gem for .rb', () => {
			expect(getFileIcon('app.rb')).toBe('💎');
		});

		it('should return elephant for .php', () => {
			expect(getFileIcon('index.php')).toBe('🐘');
		});

		it('should return wrench for .c', () => {
			expect(getFileIcon('main.c')).toBe('🔧');
		});

		it('should return wrench for .cpp', () => {
			expect(getFileIcon('main.cpp')).toBe('🔧');
		});

		it('should return wrench for .h', () => {
			expect(getFileIcon('header.h')).toBe('🔧');
		});
	});

	describe('Image extensions', () => {
		it('should return image for .png', () => {
			expect(getFileIcon('photo.png')).toBe('🖼️');
		});

		it('should return image for .jpg', () => {
			expect(getFileIcon('photo.jpg')).toBe('🖼️');
		});

		it('should return image for .jpeg', () => {
			expect(getFileIcon('photo.jpeg')).toBe('🖼️');
		});

		it('should return image for .gif', () => {
			expect(getFileIcon('animation.gif')).toBe('🖼️');
		});

		it('should return image for .webp', () => {
			expect(getFileIcon('image.webp')).toBe('🖼️');
		});

		it('should return image for .ico', () => {
			expect(getFileIcon('favicon.ico')).toBe('🖼️');
		});
	});

	describe('Font extensions', () => {
		it('should return font icon for .ttf', () => {
			expect(getFileIcon('font.ttf')).toBe('🔤');
		});

		it('should return font icon for .otf', () => {
			expect(getFileIcon('font.otf')).toBe('🔤');
		});

		it('should return font icon for .woff', () => {
			expect(getFileIcon('font.woff')).toBe('🔤');
		});

		it('should return font icon for .woff2', () => {
			expect(getFileIcon('font.woff2')).toBe('🔤');
		});
	});

	describe('Archive extensions', () => {
		it('should return package for .zip', () => {
			expect(getFileIcon('archive.zip')).toBe('📦');
		});

		it('should return package for .tar', () => {
			expect(getFileIcon('archive.tar')).toBe('📦');
		});

		it('should return package for .gz', () => {
			expect(getFileIcon('archive.gz')).toBe('📦');
		});
	});

	describe('Database extensions', () => {
		it('should return cabinet for .sql', () => {
			expect(getFileIcon('query.sql')).toBe('🗃️');
		});

		it('should return cabinet for .db', () => {
			expect(getFileIcon('data.db')).toBe('🗃️');
		});

		it('should return cabinet for .sqlite', () => {
			expect(getFileIcon('data.sqlite')).toBe('🗃️');
		});
	});

	describe('Document extensions', () => {
		it('should return red book for .pdf', () => {
			expect(getFileIcon('document.pdf')).toBe('📕');
		});

		it('should return blue book for .doc', () => {
			expect(getFileIcon('document.doc')).toBe('📘');
		});

		it('should return blue book for .docx', () => {
			expect(getFileIcon('document.docx')).toBe('📘');
		});

		it('should return green book for .xls', () => {
			expect(getFileIcon('spreadsheet.xls')).toBe('📗');
		});

		it('should return green book for .xlsx', () => {
			expect(getFileIcon('spreadsheet.xlsx')).toBe('📗');
		});

		it('should return orange book for .ppt', () => {
			expect(getFileIcon('presentation.ppt')).toBe('📙');
		});

		it('should return orange book for .pptx', () => {
			expect(getFileIcon('presentation.pptx')).toBe('📙');
		});
	});

	describe('Misc extensions', () => {
		it('should return lock for .lock', () => {
			expect(getFileIcon('pnpm-lock.yaml')).toBe('🔒');
		});

		it('should return scroll for .log', () => {
			expect(getFileIcon('server.log')).toBe('📜');
		});

		it('should return map for .map', () => {
			expect(getFileIcon('main.js.map')).toBe('🗺️');
		});

		it('should return lightning for .wasm', () => {
			expect(getFileIcon('module.wasm')).toBe('⚡');
		});
	});

	describe('Fallback behavior', () => {
		it('should return page icon for unknown extensions', () => {
			expect(getFileIcon('file.xyz')).toBe('📄');
		});

		it('should return page icon for files without extension', () => {
			expect(getFileIcon('somefile')).toBe('📄');
		});
	});
});

// ============================================================================
// getFolderIcon Tests
// ============================================================================

describe('getFolderIcon', () => {
	describe('Special folder names', () => {
		it('should return package for node_modules', () => {
			expect(getFolderIcon('node_modules', true)).toBe('📦');
			expect(getFolderIcon('node_modules', false)).toBe('📦');
		});

		it('should return link for .git', () => {
			expect(getFolderIcon('.git', true)).toBe('🔗');
			expect(getFolderIcon('.git', false)).toBe('🔗');
		});

		it('should return Svelte for .svelte-kit', () => {
			expect(getFolderIcon('.svelte-kit', true)).toBe('🧡');
			expect(getFolderIcon('.svelte-kit', false)).toBe('🧡');
		});

		it('should return briefcase for .vscode', () => {
			expect(getFolderIcon('.vscode', true)).toBe('💼');
			expect(getFolderIcon('.vscode', false)).toBe('💼');
		});

		it('should return briefcase for .idea', () => {
			expect(getFolderIcon('.idea', true)).toBe('💼');
			expect(getFolderIcon('.idea', false)).toBe('💼');
		});

		it('should return outbox for dist', () => {
			expect(getFolderIcon('dist', true)).toBe('📤');
			expect(getFolderIcon('dist', false)).toBe('📤');
		});

		it('should return construction for build', () => {
			expect(getFolderIcon('build', true)).toBe('🏗️');
			expect(getFolderIcon('build', false)).toBe('🏗️');
		});

		it('should return folder for src', () => {
			expect(getFolderIcon('src', true)).toBe('📁');
			expect(getFolderIcon('src', false)).toBe('📁');
		});

		it('should return books for lib', () => {
			expect(getFolderIcon('lib', true)).toBe('📚');
			expect(getFolderIcon('lib', false)).toBe('📚');
		});

		it('should return globe for public', () => {
			expect(getFolderIcon('public', true)).toBe('🌐');
			expect(getFolderIcon('public', false)).toBe('🌐');
		});

		it('should return globe for static', () => {
			expect(getFolderIcon('static', true)).toBe('🌐');
			expect(getFolderIcon('static', false)).toBe('🌐');
		});

		it('should return image for assets', () => {
			expect(getFolderIcon('assets', true)).toBe('🖼️');
			expect(getFolderIcon('assets', false)).toBe('🖼️');
		});

		it('should return image for images', () => {
			expect(getFolderIcon('images', true)).toBe('🖼️');
			expect(getFolderIcon('images', false)).toBe('🖼️');
		});

		it('should return puzzle for components', () => {
			expect(getFolderIcon('components', true)).toBe('🧩');
			expect(getFolderIcon('components', false)).toBe('🧩');
		});

		it('should return page for pages', () => {
			expect(getFolderIcon('pages', true)).toBe('📄');
			expect(getFolderIcon('pages', false)).toBe('📄');
		});

		it('should return railroad for routes', () => {
			expect(getFolderIcon('routes', true)).toBe('🛤️');
			expect(getFolderIcon('routes', false)).toBe('🛤️');
		});

		it('should return plug for api', () => {
			expect(getFolderIcon('api', true)).toBe('🔌');
			expect(getFolderIcon('api', false)).toBe('🔌');
		});

		it('should return wrench for utils', () => {
			expect(getFolderIcon('utils', true)).toBe('🔧');
			expect(getFolderIcon('utils', false)).toBe('🔧');
		});

		it('should return hook for hooks', () => {
			expect(getFolderIcon('hooks', true)).toBe('🪝');
			expect(getFolderIcon('hooks', false)).toBe('🪝');
		});

		it('should return floppy for stores', () => {
			expect(getFolderIcon('stores', true)).toBe('💾');
			expect(getFolderIcon('stores', false)).toBe('💾');
		});

		it('should return palette for styles', () => {
			expect(getFolderIcon('styles', true)).toBe('🎨');
			expect(getFolderIcon('styles', false)).toBe('🎨');
		});

		it('should return ruler for types', () => {
			expect(getFolderIcon('types', true)).toBe('📐');
			expect(getFolderIcon('types', false)).toBe('📐');
		});

		it('should return gear for config', () => {
			expect(getFolderIcon('config', true)).toBe('⚙️');
			expect(getFolderIcon('config', false)).toBe('⚙️');
		});

		it('should return test tube for test folders', () => {
			expect(getFolderIcon('test', true)).toBe('🧪');
			expect(getFolderIcon('tests', true)).toBe('🧪');
			expect(getFolderIcon('__tests__', true)).toBe('🧪');
			expect(getFolderIcon('spec', true)).toBe('🧪');
		});

		it('should return books for docs', () => {
			expect(getFolderIcon('docs', true)).toBe('📚');
			expect(getFolderIcon('docs', false)).toBe('📚');
		});

		it('should return scroll for scripts', () => {
			expect(getFolderIcon('scripts', true)).toBe('📜');
			expect(getFolderIcon('scripts', false)).toBe('📜');
		});

		it('should return cycle for migrations', () => {
			expect(getFolderIcon('migrations', true)).toBe('🔄');
			expect(getFolderIcon('migrations', false)).toBe('🔄');
		});

		it('should return beads for .jat', () => {
			expect(getFolderIcon('.jat', true)).toBe('📿');
			expect(getFolderIcon('.jat', false)).toBe('📿');
		});

		it('should return robot for .claude', () => {
			expect(getFolderIcon('.claude', true)).toBe('🤖');
			expect(getFolderIcon('.claude', false)).toBe('🤖');
		});
	});

	describe('Default folder icons', () => {
		it('should return open folder for unknown folder when open', () => {
			expect(getFolderIcon('unknown-folder', true)).toBe('📂');
		});

		it('should return closed folder for unknown folder when closed', () => {
			expect(getFolderIcon('unknown-folder', false)).toBe('📁');
		});

		it('should handle deeply nested folder names', () => {
			expect(getFolderIcon('my-custom-folder', true)).toBe('📂');
			expect(getFolderIcon('my-custom-folder', false)).toBe('📁');
		});
	});
});

// ============================================================================
// getFileTypeColor Tests
// ============================================================================

describe('getFileTypeColor', () => {
	describe('TypeScript/JavaScript colors', () => {
		it('should return blue for TypeScript', () => {
			expect(getFileTypeColor('app.ts')).toBe('text-blue-400');
			expect(getFileTypeColor('Component.tsx')).toBe('text-blue-400');
		});

		it('should return yellow for JavaScript', () => {
			expect(getFileTypeColor('app.js')).toBe('text-yellow-400');
			expect(getFileTypeColor('Component.jsx')).toBe('text-yellow-400');
		});
	});

	describe('Framework colors', () => {
		it('should return orange for Svelte', () => {
			expect(getFileTypeColor('Component.svelte')).toBe('text-orange-400');
		});
	});

	describe('Other language colors', () => {
		it('should return blue for Python', () => {
			expect(getFileTypeColor('script.py')).toBe('text-blue-400');
		});

		it('should return cyan for Go', () => {
			expect(getFileTypeColor('main.go')).toBe('text-cyan-400');
		});

		it('should return orange for Rust', () => {
			expect(getFileTypeColor('lib.rs')).toBe('text-orange-400');
		});
	});

	describe('Web language colors', () => {
		it('should return blue for CSS', () => {
			expect(getFileTypeColor('styles.css')).toBe('text-blue-400');
		});

		it('should return orange for HTML', () => {
			expect(getFileTypeColor('index.html')).toBe('text-orange-400');
		});
	});

	describe('Data format colors', () => {
		it('should return gray for JSON', () => {
			expect(getFileTypeColor('config.json')).toBe('text-gray-400');
		});

		it('should return blue for Markdown', () => {
			expect(getFileTypeColor('README.md')).toBe('text-blue-300');
		});
	});

	describe('Fallback behavior', () => {
		it('should return base content color for unknown extensions', () => {
			expect(getFileTypeColor('file.xyz')).toBe('text-base-content');
		});

		it('should return base content color for files without extension', () => {
			expect(getFileTypeColor('Makefile')).toBe('text-base-content');
		});
	});
});
