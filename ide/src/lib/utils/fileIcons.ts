/**
 * File Icons Utility
 *
 * Returns emoji icons for file types based on extension and special file names.
 */

// Extension to icon mapping
const extensionIcons: Record<string, string> = {
	// TypeScript/JavaScript
	ts: '🔷',
	tsx: '🔷',
	js: '🟨',
	jsx: '🟨',
	mjs: '🟨',
	cjs: '🟨',

	// Svelte
	svelte: '🧡',

	// Styles
	css: '🎨',
	scss: '🎨',
	sass: '🎨',
	less: '🎨',
	styl: '🎨',

	// Markup
	html: '🌐',
	htm: '🌐',
	xml: '📋',
	svg: '🖼️',

	// Data
	json: '📦',
	yaml: '⚙️',
	yml: '⚙️',
	toml: '⚙️',

	// Documentation
	md: '📝',
	mdx: '📝',
	txt: '📄',
	rst: '📄',

	// Shell/Scripts
	sh: '🐚',
	bash: '🐚',
	zsh: '🐚',
	fish: '🐚',
	ps1: '🐚',

	// Python
	py: '🐍',
	pyi: '🐍',
	pyw: '🐍',
	pyc: '🐍',

	// Go
	go: '🔵',
	mod: '🔵',
	sum: '🔵',

	// Rust
	rs: '🦀',

	// C/C++
	c: '🔧',
	h: '🔧',
	cpp: '🔧',
	hpp: '🔧',
	cc: '🔧',
	cxx: '🔧',

	// Java/Kotlin
	java: '☕',
	kt: '🟣',
	kts: '🟣',

	// Ruby
	rb: '💎',
	erb: '💎',
	rake: '💎',

	// PHP
	php: '🐘',

	// Images
	png: '🖼️',
	jpg: '🖼️',
	jpeg: '🖼️',
	gif: '🖼️',
	webp: '🖼️',
	ico: '🖼️',
	bmp: '🖼️',

	// Fonts
	ttf: '🔤',
	otf: '🔤',
	woff: '🔤',
	woff2: '🔤',
	eot: '🔤',

	// Archives
	zip: '📦',
	tar: '📦',
	gz: '📦',
	rar: '📦',
	'7z': '📦',

	// Config
	env: '🔐',
	ini: '⚙️',
	conf: '⚙️',
	config: '⚙️',

	// Database
	sql: '🗃️',
	db: '🗃️',
	sqlite: '🗃️',
	sqlite3: '🗃️',

	// Documents
	pdf: '📕',
	doc: '📘',
	docx: '📘',
	xls: '📗',
	xlsx: '📗',
	ppt: '📙',
	pptx: '📙',

	// Lock files
	lock: '🔒',

	// Log files
	log: '📜',

	// Other
	map: '🗺️',
	wasm: '⚡',
	jsonl: '📦'
};

// Special file names (exact match)
const specialFileIcons: Record<string, string> = {
	// Package managers
	'package.json': '📦',
	'package-lock.json': '🔒',
	'yarn.lock': '🔒',
	'pnpm-lock.yaml': '🔒',
	'bun.lockb': '🔒',

	// TypeScript configs
	'tsconfig.json': '🔷',
	'tsconfig.node.json': '🔷',
	'jsconfig.json': '🟨',

	// Build configs
	'vite.config.ts': '⚡',
	'vite.config.js': '⚡',
	'webpack.config.js': '📦',
	'rollup.config.js': '📦',
	'esbuild.config.js': '📦',

	// Linting
	'.eslintrc': '🔍',
	'.eslintrc.js': '🔍',
	'.eslintrc.json': '🔍',
	'.eslintrc.cjs': '🔍',
	'eslint.config.js': '🔍',
	'.prettierrc': '✨',
	'.prettierrc.json': '✨',
	'.prettierrc.js': '✨',
	'prettier.config.js': '✨',

	// Git
	'.gitignore': '🚫',
	'.gitattributes': '🔗',
	'.gitmodules': '🔗',

	// Docker
	Dockerfile: '🐳',
	'docker-compose.yml': '🐳',
	'docker-compose.yaml': '🐳',
	'.dockerignore': '🐳',

	// CI/CD
	'.travis.yml': '🔄',
	'.gitlab-ci.yml': '🔄',
	'Jenkinsfile': '🔄',

	// Docs
	'README.md': '📖',
	'readme.md': '📖',
	'CLAUDE.md': '🤖',
	'CHANGELOG.md': '📋',
	'changelog.md': '📋',
	'LICENSE': '⚖️',
	'LICENSE.md': '⚖️',
	'license': '⚖️',
	'CONTRIBUTING.md': '🤝',

	// Env
	'.env': '🔐',
	'.env.local': '🔐',
	'.env.example': '🔐',
	'.env.development': '🔐',
	'.env.production': '🔐',

	// Editor
	'.editorconfig': '📐',

	// Svelte
	'svelte.config.js': '🧡',
	'svelte.config.ts': '🧡',

	// Tailwind
	'tailwind.config.js': '🎨',
	'tailwind.config.ts': '🎨',
	'postcss.config.js': '🎨',
	'postcss.config.cjs': '🎨',

	// Testing
	'jest.config.js': '🧪',
	'jest.config.ts': '🧪',
	'vitest.config.ts': '🧪',
	'vitest.config.js': '🧪',
	'playwright.config.ts': '🎭',
	'playwright.config.js': '🎭',

	// Make
	Makefile: '🔨',
	makefile: '🔨',

	// Misc
	'.npmrc': '📦',
	'.nvmrc': '🟢',
	'.node-version': '🟢'
};

// Special folder icons
const specialFolderIcons: Record<string, { open: string; closed: string }> = {
	node_modules: { open: '📦', closed: '📦' },
	'.git': { open: '🔗', closed: '🔗' },
	'.svelte-kit': { open: '🧡', closed: '🧡' },
	'.vscode': { open: '💼', closed: '💼' },
	'.idea': { open: '💼', closed: '💼' },
	dist: { open: '📤', closed: '📤' },
	build: { open: '🏗️', closed: '🏗️' },
	out: { open: '📤', closed: '📤' },
	src: { open: '📁', closed: '📁' },
	lib: { open: '📚', closed: '📚' },
	public: { open: '🌐', closed: '🌐' },
	static: { open: '🌐', closed: '🌐' },
	assets: { open: '🖼️', closed: '🖼️' },
	images: { open: '🖼️', closed: '🖼️' },
	img: { open: '🖼️', closed: '🖼️' },
	components: { open: '🧩', closed: '🧩' },
	pages: { open: '📄', closed: '📄' },
	routes: { open: '🛤️', closed: '🛤️' },
	api: { open: '🔌', closed: '🔌' },
	utils: { open: '🔧', closed: '🔧' },
	helpers: { open: '🔧', closed: '🔧' },
	hooks: { open: '🪝', closed: '🪝' },
	stores: { open: '💾', closed: '💾' },
	styles: { open: '🎨', closed: '🎨' },
	css: { open: '🎨', closed: '🎨' },
	types: { open: '📐', closed: '📐' },
	config: { open: '⚙️', closed: '⚙️' },
	test: { open: '🧪', closed: '🧪' },
	tests: { open: '🧪', closed: '🧪' },
	__tests__: { open: '🧪', closed: '🧪' },
	spec: { open: '🧪', closed: '🧪' },
	docs: { open: '📚', closed: '📚' },
	scripts: { open: '📜', closed: '📜' },
	migrations: { open: '🔄', closed: '🔄' },
	'.jat': { open: '📿', closed: '📿' },
	'.claude': { open: '🤖', closed: '🤖' }
};

/**
 * Get the icon for a file based on its name
 */
export function getFileIcon(fileName: string): string {
	// Check special file names first
	if (specialFileIcons[fileName]) {
		return specialFileIcons[fileName];
	}

	// Check by extension
	const lastDot = fileName.lastIndexOf('.');
	if (lastDot !== -1) {
		const ext = fileName.slice(lastDot + 1).toLowerCase();
		if (extensionIcons[ext]) {
			return extensionIcons[ext];
		}
	}

	// Default file icon
	return '📄';
}

/**
 * Get the icon for a folder based on its name and state
 */
export function getFolderIcon(folderName: string, isOpen: boolean): string {
	// Check special folder names
	if (specialFolderIcons[folderName]) {
		return isOpen ? specialFolderIcons[folderName].open : specialFolderIcons[folderName].closed;
	}

	// Default folder icons
	return isOpen ? '📂' : '📁';
}

/**
 * Get a CSS color class for a file type (for optional styling)
 */
export function getFileTypeColor(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	if (lastDot === -1) return 'text-base-content';

	const ext = fileName.slice(lastDot + 1).toLowerCase();

	const colors: Record<string, string> = {
		ts: 'text-blue-400',
		tsx: 'text-blue-400',
		js: 'text-yellow-400',
		jsx: 'text-yellow-400',
		svelte: 'text-orange-400',
		json: 'text-gray-400',
		md: 'text-blue-300',
		css: 'text-blue-400',
		html: 'text-orange-400',
		py: 'text-blue-400',
		go: 'text-cyan-400',
		rs: 'text-orange-400'
	};

	return colors[ext] || 'text-base-content';
}
