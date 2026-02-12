<script lang="ts">
	/**
	 * PromptInput - Reusable @ reference chip + autocomplete input
	 *
	 * Provides a contenteditable input with inline chips for @file, @task:,
	 * @git:, @memory:, and @url: context references. Used by the main command
	 * input and pipeline step editors.
	 */

	// --- Types ---
	interface FileResult {
		path: string;
		name: string;
		folder: string;
	}

	interface ProviderResult {
		value: string;
		label: string;
		description?: string;
	}

	interface Reference {
		path: string;
		name: string;
	}

	interface ProviderCategory {
		prefix: string;
		label: string;
		icon: string;
		description: string;
	}

	type AutocompleteMode = 'file' | 'provider-picker' | 'provider-search';

	// --- Props ---
	let {
		value = $bindable(''),
		references = $bindable<Reference[]>([]),
		project = '',
		placeholder = 'Enter a prompt... Use @ to attach files and context',
		rows = 3,
		disabled = false,
		compact = false,
		onchange,
		onfocus,
		onblur,
		onkeydown: externalKeydown,
	}: {
		value: string;
		references?: Reference[];
		project: string;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		compact?: boolean;
		onchange?: (value: string) => void;
		onfocus?: (e: FocusEvent) => void;
		onblur?: (e: FocusEvent) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();

	// --- Constants ---
	const PROVIDER_CATEGORIES: ProviderCategory[] = [
		{ prefix: 'file:', label: 'File', icon: '📄', description: 'Attach a project file by path' },
		{ prefix: 'task:', label: 'Task', icon: '📋', description: 'Inject task details by ID' },
		{ prefix: 'git:', label: 'Git', icon: '🔀', description: 'Inject git diff, log, or branch info' },
		{ prefix: 'memory:', label: 'Memory', icon: '🧠', description: 'Search project memory for context' },
		{ prefix: 'url:', label: 'URL', icon: '🔗', description: 'Fetch and inject URL content' }
	];

	// --- State ---
	let showFileAutocomplete = $state(false);
	let fileSearchResults = $state<FileResult[]>([]);
	let fileSearchQuery = $state('');
	let fileAutocompleteIndex = $state(0);
	let textareaRef = $state<HTMLDivElement | null>(null);
	let autocompleteRef = $state<HTMLDivElement | null>(null);
	let fileSearchTimeout: ReturnType<typeof setTimeout> | null = null;

	let autocompleteMode = $state<AutocompleteMode>('file');
	let activeProvider = $state<string | null>(null);
	let providerSearchResults = $state<ProviderResult[]>([]);

	// --- Derived ---
	let filteredProviderCategories = $derived(getFilteredProviderCategories());

	// Computed min-height from rows
	let minHeight = $derived(compact ? '40px' : `${Math.max(rows * 24, 48)}px`);

	// --- API Functions ---
	async function searchFiles(query: string) {
		if (!project || query.length < 1) {
			fileSearchResults = [];
			return;
		}
		try {
			const res = await fetch(`/api/files/search?project=${encodeURIComponent(project)}&query=${encodeURIComponent(query)}&limit=10`);
			const data = await res.json();
			fileSearchResults = data.files || [];
			fileAutocompleteIndex = 0;
		} catch {
			fileSearchResults = [];
		}
	}

	async function searchProviders(provider: string, query: string) {
		try {
			const res = await fetch(`/api/context-providers/search?provider=${encodeURIComponent(provider)}&query=${encodeURIComponent(query)}&project=${encodeURIComponent(project)}`);
			const data = await res.json();
			providerSearchResults = data.results || [];
			fileAutocompleteIndex = 0;
		} catch {
			providerSearchResults = [];
		}
	}

	// --- Detection ---
	function detectAutocompleteMode(beforeCursor: string): { mode: AutocompleteMode; provider: string | null; query: string } | null {
		const providerMatch = beforeCursor.match(/@(task|git|memory|url):([\w\-\.\/:%?&#=+~]*)$/);
		if (providerMatch) {
			return { mode: 'provider-search', provider: providerMatch[1], query: providerMatch[2] };
		}

		const fileProviderMatch = beforeCursor.match(/@file:([\w\-\.\/]*)$/);
		if (fileProviderMatch) {
			return { mode: 'file', provider: null, query: fileProviderMatch[1] };
		}

		const atMatch = beforeCursor.match(/@([\w\-\.\/]*)$/);
		if (atMatch) {
			const text = atMatch[1];
			const matchingProviders = PROVIDER_CATEGORIES.filter(p =>
				p.prefix.startsWith(text.toLowerCase() + (text.endsWith(':') ? '' : ''))
			);
			if (text === '' || (matchingProviders.length > 0 && !text.includes('.'))) {
				return { mode: 'provider-picker', provider: null, query: text };
			}
			return { mode: 'file', provider: null, query: text };
		}

		return null;
	}

	// --- Input Handling ---
	function handleTextareaInput(e: Event) {
		syncCommandPrompt();
		// Clean up empty contenteditable (remove lingering <br>)
		if (!value.trim() && textareaRef) {
			textareaRef.innerHTML = '';
		}

		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) {
			showFileAutocomplete = false;
			fileSearchResults = [];
			providerSearchResults = [];
			return;
		}

		const range = sel.getRangeAt(0);

		let beforeCursor = '';
		try {
			const preRange = document.createRange();
			preRange.selectNodeContents(textareaRef!);
			preRange.setEnd(range.startContainer, range.startOffset);
			beforeCursor = preRange.toString();
		} catch {
			showFileAutocomplete = false;
			fileSearchResults = [];
			providerSearchResults = [];
			return;
		}

		const detected = detectAutocompleteMode(beforeCursor);

		if (detected) {
			autocompleteMode = detected.mode;
			activeProvider = detected.provider;
			showFileAutocomplete = true;

			if (fileSearchTimeout) clearTimeout(fileSearchTimeout);

			if (detected.mode === 'provider-picker') {
				fileSearchQuery = detected.query;
				fileSearchResults = [];
				providerSearchResults = [];
				fileAutocompleteIndex = 0;
			} else if (detected.mode === 'provider-search') {
				fileSearchQuery = detected.query;
				fileSearchResults = [];
				fileSearchTimeout = setTimeout(() => {
					searchProviders(detected.provider!, detected.query);
				}, 150);
			} else {
				fileSearchQuery = detected.query;
				providerSearchResults = [];
				fileSearchTimeout = setTimeout(() => {
					searchFiles(detected.query);
				}, 150);
			}
		} else {
			showFileAutocomplete = false;
			fileSearchResults = [];
			providerSearchResults = [];
			autocompleteMode = 'file';
			activeProvider = null;
		}

		syncReferencedFiles();
	}

	function handleTextareaKeydown(e: KeyboardEvent) {
		// Auto-create chip for @url: when user presses Space, Tab, or Enter
		if (activeProvider === 'url' && (e.key === ' ' || e.key === 'Tab' || e.key === 'Enter')) {
			if (textareaRef) {
				const sel = window.getSelection();
				if (sel && sel.rangeCount > 0) {
					const range = sel.getRangeAt(0);
					let textNode: Node = range.startContainer;
					let cursorPos = range.startOffset;
					if (textNode.nodeType !== Node.TEXT_NODE) {
						const children = Array.from(textNode.childNodes);
						const prev = children[cursorPos - 1];
						if (prev && prev.nodeType === Node.TEXT_NODE) {
							textNode = prev;
							cursorPos = (prev.textContent || '').length;
						}
					}
					if (textNode.nodeType === Node.TEXT_NODE) {
						const text = textNode.textContent || '';
						const beforeCursor = text.slice(0, cursorPos);
						const urlMatch = beforeCursor.match(/@url:(https?:\/\/\S+)$/);
						if (urlMatch) {
							e.preventDefault();
							selectProviderResult({ value: urlMatch[1], label: urlMatch[1] });
							// Forward to external handler after our processing
							externalKeydown?.(e);
							return;
						}
					}
				}
			}
		}

		// Handle autocomplete navigation
		if (showFileAutocomplete) {
			const totalItems = getAutocompleteItemCount();
			if (totalItems > 0) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					fileAutocompleteIndex = (fileAutocompleteIndex + 1) % totalItems;
					return;
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					fileAutocompleteIndex = (fileAutocompleteIndex - 1 + totalItems) % totalItems;
					return;
				}
				if (e.key === 'Tab' || e.key === 'Enter') {
					e.preventDefault();
					selectAutocompleteItem(fileAutocompleteIndex);
					return;
				}
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				showFileAutocomplete = false;
				return;
			}
		}

		// Forward to external handler
		externalKeydown?.(e);
	}

	// --- Autocomplete Helpers ---
	function getAutocompleteItemCount(): number {
		if (autocompleteMode === 'provider-picker') {
			return filteredProviderCategories.length + fileSearchResults.length;
		}
		if (autocompleteMode === 'provider-search') {
			return providerSearchResults.length;
		}
		return fileSearchResults.length;
	}

	function getFilteredProviderCategories(): ProviderCategory[] {
		if (autocompleteMode !== 'provider-picker') return [];
		if (!fileSearchQuery) return PROVIDER_CATEGORIES;
		return PROVIDER_CATEGORIES.filter(p =>
			p.prefix.startsWith(fileSearchQuery.toLowerCase()) ||
			p.label.toLowerCase().startsWith(fileSearchQuery.toLowerCase())
		);
	}

	function selectAutocompleteItem(index: number) {
		if (autocompleteMode === 'provider-picker') {
			const categories = filteredProviderCategories;
			if (index < categories.length) {
				selectProviderCategory(categories[index]);
				return;
			}
			const fileIndex = index - categories.length;
			if (fileIndex < fileSearchResults.length) {
				selectFileFromAutocomplete(fileSearchResults[fileIndex]);
				return;
			}
		} else if (autocompleteMode === 'provider-search') {
			if (index < providerSearchResults.length) {
				selectProviderResult(providerSearchResults[index]);
				return;
			}
		} else {
			if (index < fileSearchResults.length) {
				selectFileFromAutocomplete(fileSearchResults[index]);
			}
		}
	}

	// --- Provider Category Selection ---
	function selectProviderCategory(category: ProviderCategory) {
		if (category.prefix === 'file:') {
			autocompleteMode = 'file';
			activeProvider = null;
			fileSearchQuery = '';
			providerSearchResults = [];
			fileAutocompleteIndex = 0;
			return;
		}

		if (!textareaRef) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		const range = sel.getRangeAt(0);
		let textNode: Node = range.startContainer;
		let cursorPos = range.startOffset;

		if (textNode.nodeType !== Node.TEXT_NODE) {
			const children = Array.from(textNode.childNodes);
			const prev = children[cursorPos - 1];
			if (prev && prev.nodeType === Node.TEXT_NODE) {
				textNode = prev;
				cursorPos = (prev.textContent || '').length;
			} else return;
		}

		const text = textNode.textContent || '';
		const beforeCursor = text.slice(0, cursorPos);
		const atMatch = beforeCursor.match(/@[\w\-\.\/]*$/);
		if (!atMatch) return;

		const atPos = cursorPos - atMatch[0].length;
		const newText = text.slice(0, atPos) + `@${category.prefix}` + text.slice(cursorPos);
		textNode.textContent = newText;

		const newCursorPos = atPos + `@${category.prefix}`.length;
		const newRange = document.createRange();
		newRange.setStart(textNode, newCursorPos);
		newRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(newRange);

		autocompleteMode = 'provider-search';
		activeProvider = category.prefix.replace(':', '');
		fileSearchQuery = '';
		providerSearchResults = [];

		if (category.prefix === 'url:') {
			showFileAutocomplete = false;
			return;
		}

		searchProviders(activeProvider, '');
		syncCommandPrompt();
	}

	// --- Provider Result Selection ---
	function selectProviderResult(result: ProviderResult) {
		const fullRef = `@${activeProvider}:${result.value}`;

		if (!textareaRef) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		const range = sel.getRangeAt(0);
		let textNode: Node = range.startContainer;
		let cursorPos = range.startOffset;

		if (textNode.nodeType !== Node.TEXT_NODE) {
			const children = Array.from(textNode.childNodes);
			const prev = children[cursorPos - 1];
			if (prev && prev.nodeType === Node.TEXT_NODE) {
				textNode = prev;
				cursorPos = (prev.textContent || '').length;
			} else return;
		}

		const text = textNode.textContent || '';
		const beforeCursor = text.slice(0, cursorPos);
		const atMatch = beforeCursor.match(/@[\w\-\.\/:%?&#=+~]*/);
		if (!atMatch) return;

		const atPos = cursorPos - atMatch[0].length;
		const beforeText = text.slice(0, atPos);
		const afterText = text.slice(cursorPos);

		const parent = textNode.parentNode!;

		if (beforeText) {
			parent.insertBefore(document.createTextNode(beforeText), textNode);
		}

		const chip = document.createElement('span');
		chip.contentEditable = 'false';
		chip.dataset.providerRef = fullRef;
		chip.className = 'inline-provider-chip';

		const providerIcons: Record<string, string> = { task: '📋', git: '🔀', memory: '🧠', url: '🔗' };
		const icon = providerIcons[activeProvider || ''] || '📎';
		chip.textContent = `${icon} ${fullRef.slice(1)}`;

		parent.insertBefore(chip, textNode);

		const afterNode = document.createTextNode('\u00A0' + afterText);
		parent.insertBefore(afterNode, textNode);
		parent.removeChild(textNode);

		const newRange = document.createRange();
		newRange.setStart(afterNode, 1);
		newRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(newRange);

		syncCommandPrompt();
		showFileAutocomplete = false;
		providerSearchResults = [];
		autocompleteMode = 'file';
		activeProvider = null;
	}

	// --- File Selection ---
	function selectFileFromAutocomplete(file: FileResult) {
		if (!textareaRef) return;

		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;

		const range = sel.getRangeAt(0);

		let textNode: Node = range.startContainer;
		let cursorPos = range.startOffset;
		if (textNode.nodeType !== Node.TEXT_NODE) {
			const children = Array.from(textNode.childNodes);
			const prev = children[cursorPos - 1];
			if (prev && prev.nodeType === Node.TEXT_NODE) {
				textNode = prev;
				cursorPos = (prev.textContent || '').length;
			} else if (prev) {
				let last: Node | null = prev;
				while (last && last.nodeType !== Node.TEXT_NODE) {
					last = last.lastChild;
				}
				if (last) {
					textNode = last;
					cursorPos = (last.textContent || '').length;
				} else {
					return;
				}
			} else {
				return;
			}
		}

		const text = textNode.textContent || '';
		const beforeCursor = text.slice(0, cursorPos);

		const atMatch = beforeCursor.match(/@([\w\-\.\/]*)$/);
		if (!atMatch) return;

		const atPos = cursorPos - atMatch[0].length;
		const beforeText = text.slice(0, atPos);
		const afterText = text.slice(cursorPos);

		const parent = textNode.parentNode!;

		if (beforeText) {
			parent.insertBefore(document.createTextNode(beforeText), textNode);
		}

		const chip = document.createElement('span');
		chip.contentEditable = 'false';
		chip.dataset.filePath = file.path;
		chip.className = 'inline-file-chip';
		chip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:12px;height:12px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>\u00A0${file.name}`;
		parent.insertBefore(chip, textNode);

		const afterNode = document.createTextNode('\u00A0' + afterText);
		parent.insertBefore(afterNode, textNode);

		parent.removeChild(textNode);

		const newRange = document.createRange();
		newRange.setStart(afterNode, 1);
		newRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(newRange);

		if (!references.find(f => f.path === file.path)) {
			references = [...references, { path: file.path, name: file.name }];
		}

		syncCommandPrompt();
		showFileAutocomplete = false;
		fileSearchResults = [];
	}

	// --- Sync Helpers ---
	function syncReferencedFiles() {
		if (!textareaRef) return;
		const chips = textareaRef.querySelectorAll('[data-file-path]');
		const paths = new Set<string>();
		chips.forEach(chip => {
			const p = (chip as HTMLElement).dataset.filePath;
			if (p) paths.add(p);
		});
		references = references.filter(f => paths.has(f.path));
	}

	function getPromptText(el: HTMLElement): string {
		let result = '';
		for (const node of Array.from(el.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent || '';
			} else if (node instanceof HTMLElement) {
				if (node.dataset.filePath) {
					result += `@${node.dataset.filePath}`;
				} else if (node.dataset.providerRef) {
					result += node.dataset.providerRef;
				} else if (node.tagName === 'BR') {
					result += '\n';
				} else if (node.tagName === 'DIV' || node.tagName === 'P') {
					if (result.length > 0 && !result.endsWith('\n')) result += '\n';
					result += getPromptText(node);
				} else {
					result += getPromptText(node);
				}
			}
		}
		return result;
	}

	function syncCommandPrompt() {
		if (!textareaRef) return;
		value = getPromptText(textareaRef);
		onchange?.(value);
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') || '';
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		range.deleteContents();
		const textNode = document.createTextNode(text);
		range.insertNode(textNode);
		range.setStartAfter(textNode);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
		syncCommandPrompt();
	}

	function handleBlur(e: FocusEvent) {
		setTimeout(() => { showFileAutocomplete = false; }, 200);
		onblur?.(e);
	}

	// --- Public API ---
	export function focus() {
		textareaRef?.focus();
	}

	export function clear() {
		if (textareaRef) {
			textareaRef.innerHTML = '';
		}
		value = '';
		references = [];
	}

	export function setText(text: string) {
		if (textareaRef) {
			textareaRef.textContent = text;
		}
		value = text;
		references = [];
	}
</script>

<div class="prompt-input-wrapper relative">
	<div
		bind:this={textareaRef}
		contenteditable={disabled ? 'false' : 'true'}
		role="textbox"
		aria-multiline="true"
		class="w-full rounded-md px-3 py-2 text-sm"
		style="
			background: oklch(0.14 0.01 250);
			border: 1px solid oklch(0.30 0.02 250);
			color: oklch(0.90 0.01 250);
			min-height: {minHeight};
			max-height: {compact ? '120px' : '240px'};
			overflow-y: auto;
			white-space: pre-wrap;
			word-break: break-word;
			outline: none;
			resize: {compact ? 'none' : 'vertical'};
			line-height: 1.6;
			{disabled ? 'opacity: 0.5; cursor: not-allowed;' : ''}
		"
		oninput={handleTextareaInput}
		onkeydown={handleTextareaKeydown}
		onpaste={handlePaste}
		onfocus={onfocus}
		onblur={handleBlur}
	></div>

	<!-- Placeholder overlay -->
	{#if !value.trim()}
		<div
			class="absolute top-0 left-0 px-3 py-2 text-sm pointer-events-none"
			style="color: oklch(0.40 0.01 250);"
		>
			{placeholder}
		</div>
	{/if}

	<!-- Autocomplete dropdown -->
	{#if showFileAutocomplete && (autocompleteMode === 'provider-picker' ? (filteredProviderCategories.length > 0 || fileSearchResults.length > 0) : autocompleteMode === 'provider-search' ? providerSearchResults.length > 0 : fileSearchResults.length > 0)}
		<div
			bind:this={autocompleteRef}
			class="absolute z-40 w-full mt-1 rounded-lg overflow-hidden shadow-xl"
			style="background: oklch(0.18 0.01 250); border: 1px solid oklch(0.30 0.03 250); max-height: 280px; overflow-y: auto;"
		>
			{#if autocompleteMode === 'provider-picker'}
				<!-- Provider categories -->
				{#if filteredProviderCategories.length > 0}
					<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
						Context Providers
					</div>
					{#each filteredProviderCategories as category, i (category.prefix)}
						<button
							class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
							style="
								background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
								color: oklch(0.85 0.01 250);
							"
							onmouseenter={() => fileAutocompleteIndex = i}
							onmousedown={(e) => { e.preventDefault(); selectProviderCategory(category); }}
						>
							<span class="text-sm shrink-0">{category.icon}</span>
							<span class="text-xs font-mono" style="color: oklch(0.75 0.15 200);">@{category.prefix}</span>
							<span class="text-xs truncate ml-auto" style="color: oklch(0.50 0.01 250);">{category.description}</span>
						</button>
					{/each}
				{/if}

				<!-- File results (shown below providers) -->
				{#if fileSearchResults.length > 0}
					<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250); border-top: 1px solid oklch(0.25 0.02 250);">
						Files
					</div>
					{#each fileSearchResults as file, i (file.path)}
						{@const itemIndex = filteredProviderCategories.length + i}
						<button
							class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
							style="
								background: {itemIndex === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
								color: oklch(0.85 0.01 250);
							"
							onmouseenter={() => fileAutocompleteIndex = itemIndex}
							onmousedown={(e) => { e.preventDefault(); selectFileFromAutocomplete(file); }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 shrink-0" style="color: oklch(0.55 0.08 200);">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
							<span class="text-xs truncate">{file.name}</span>
							<span class="text-xs truncate ml-auto" style="color: oklch(0.45 0.01 250);">{file.folder}</span>
						</button>
					{/each}
				{/if}

			{:else if autocompleteMode === 'provider-search'}
				<!-- Provider-specific search results -->
				<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
					@{activeProvider}: {fileSearchQuery || '(all)'}
				</div>
				{#each providerSearchResults as result, i (`${result.value}-${i}`)}
					<button
						class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
						style="
							background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
							color: oklch(0.85 0.01 250);
						"
						onmouseenter={() => fileAutocompleteIndex = i}
						onmousedown={(e) => { e.preventDefault(); selectProviderResult(result); }}
					>
						<span class="text-xs font-mono shrink-0" style="color: oklch(0.75 0.15 200);">{result.label}</span>
						{#if result.description}
							<span class="text-xs truncate ml-auto" style="color: oklch(0.50 0.01 250);">{result.description}</span>
						{/if}
					</button>
				{/each}

			{:else}
				<!-- File results only -->
				<div class="px-3 py-1.5 text-xs" style="color: oklch(0.50 0.01 250); border-bottom: 1px solid oklch(0.25 0.02 250);">
					Files matching: {fileSearchQuery}
				</div>
				{#each fileSearchResults as file, i (file.path)}
					<button
						class="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
						style="
							background: {i === fileAutocompleteIndex ? 'oklch(0.25 0.04 200 / 0.3)' : 'transparent'};
							color: oklch(0.85 0.01 250);
						"
						onmouseenter={() => fileAutocompleteIndex = i}
						onmousedown={(e) => { e.preventDefault(); selectFileFromAutocomplete(file); }}
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 shrink-0" style="color: oklch(0.55 0.08 200);">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
						</svg>
						<span class="text-xs truncate">{file.name}</span>
						<span class="text-xs truncate ml-auto" style="color: oklch(0.45 0.01 250);">{file.folder}</span>
					</button>
				{/each}
			{/if}

			<div class="px-3 py-1.5 text-xs flex items-center gap-3" style="color: oklch(0.40 0.01 250); border-top: 1px solid oklch(0.25 0.02 250);">
				<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">↑↓</kbd> Navigate</span>
				<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">Tab</kbd> Select</span>
				<span><kbd style="background: oklch(0.25 0.02 250); padding: 1px 4px; border-radius: 2px; font-size: 10px;">Esc</kbd> Close</span>
			</div>
		</div>
	{/if}
</div>

<style>
	/* :global needed because chips are created via DOM manipulation, not Svelte templates */
	:global(.inline-file-chip) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 7px 1px 5px;
		margin: 0 2px;
		border-radius: 4px;
		background: oklch(0.25 0.06 200 / 0.4);
		border: 1px solid oklch(0.35 0.08 200 / 0.4);
		color: oklch(0.80 0.10 200);
		font-size: 0.75rem;
		line-height: 1.4;
		vertical-align: baseline;
		user-select: none;
		cursor: default;
		white-space: nowrap;
	}

	:global(.inline-file-chip:hover) {
		background: oklch(0.28 0.07 200 / 0.5);
		border-color: oklch(0.40 0.10 200 / 0.5);
	}

	:global(.inline-provider-chip) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 7px 1px 5px;
		margin: 0 2px;
		border-radius: 4px;
		background: oklch(0.25 0.06 145 / 0.4);
		border: 1px solid oklch(0.35 0.08 145 / 0.4);
		color: oklch(0.80 0.10 145);
		font-size: 0.75rem;
		line-height: 1.4;
		vertical-align: baseline;
		user-select: none;
		cursor: default;
		white-space: nowrap;
	}

	:global(.inline-provider-chip:hover) {
		background: oklch(0.28 0.07 145 / 0.5);
		border-color: oklch(0.40 0.10 145 / 0.5);
	}

	:global([contenteditable='true']:focus) {
		border-color: oklch(0.45 0.10 200) !important;
		box-shadow: 0 0 0 1px oklch(0.45 0.10 200 / 0.3);
	}
</style>
