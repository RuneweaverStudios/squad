<script lang="ts">
	/**
	 * SkillsEditor Component
	 *
	 * Browse and manage Claude Code skills from the JAT skill catalog.
	 * - Installed Skills: enable/disable toggles, uninstall, update
	 * - Browse Catalog: search/filter, install with one click
	 * - Skill Detail: drawer showing full skill info
	 */

	import { onMount } from 'svelte';
	import { fade, slide, fly } from 'svelte/transition';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';

	interface InstalledSkill {
		id: string;
		name: string;
		description: string;
		version: string;
		author: string;
		source: string;
		sourceUrl: string;
		installedAt: string;
		updatedAt: string;
		enabled: boolean;
	}

	interface CatalogSkill {
		id: string;
		name: string;
		description: string;
		author: string;
		version: string;
		repoUrl: string;
		skillMdUrl: string;
		tags: string[];
		installCount: number;
		compatible: boolean;
		source: string;
	}

	// State
	let installed = $state<InstalledSkill[]>([]);
	let catalog = $state<CatalogSkill[]>([]);
	let isLoadingInstalled = $state(true);
	let isLoadingCatalog = $state(false);
	let installedError = $state<string | null>(null);
	let catalogError = $state<string | null>(null);

	// Search and filter
	let searchQuery = $state('');
	let showCatalog = $state(false);
	let activeFilter = $state<string>('all');

	// Action states
	let installingSkills = $state<Set<string>>(new Set());
	let togglingSkills = $state<Set<string>>(new Set());
	let uninstallingSkills = $state<Set<string>>(new Set());

	// Detail drawer - use any to avoid union type issues in template
	let selectedSkill = $state<any>(null);
	let selectedSkillType = $state<'catalog' | 'installed'>('catalog');
	let isDetailOpen = $state(false);
	let skillContent = $state<string | null>(null);
	let isLoadingContent = $state(false);

	// SKILL.md editing
	let isEditing = $state(false);
	let editContent = $state('');
	let isSaving = $state(false);

	// Parsed frontmatter from SKILL.md
	interface SkillFrontmatter {
		name?: string;
		emoji?: string;
		description?: string;
		requires?: { bins?: string[]; env?: string[] };
	}
	let parsedFrontmatter = $state<SkillFrontmatter | null>(null);

	// Derived - track both id and name for matching against catalog entries
	const installedIds = $derived(new Set(installed.flatMap((s) => [s.id, s.name, s.id?.toLowerCase(), s.name?.toLowerCase()].filter(Boolean))));

	/** Derive effective source: JAT skills get their own category */
	function effectiveSource(skill: CatalogSkill): string {
		if (skill.author === 'jat' || skill.tags.includes('jat')) return 'jat';
		return skill.source;
	}

	const filteredCatalog = $derived(() => {
		let filtered = catalog;

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q) ||
					s.id.toLowerCase().includes(q) ||
					s.tags.some((t) => t.toLowerCase().includes(q))
			);
		}

		if (activeFilter !== 'all') {
			filtered = filtered.filter((s) => effectiveSource(s) === activeFilter);
		}

		return filtered;
	});

	const catalogSources = $derived(() => {
		const sources = new Set(catalog.map((s) => effectiveSource(s)));
		// Put 'jat' first after 'all', then sort the rest
		const sorted = Array.from(sources).sort((a, b) => {
			if (a === 'jat') return -1;
			if (b === 'jat') return 1;
			if (a === 'curated') return -1;
			if (b === 'curated') return 1;
			return a.localeCompare(b);
		});
		return ['all', ...sorted];
	});

	// Fetch installed skills
	async function fetchInstalled() {
		isLoadingInstalled = true;
		installedError = null;
		try {
			const res = await fetch('/api/config/skills');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to fetch');
			installed = data.installed || [];
		} catch (err) {
			installedError = err instanceof Error ? err.message : 'Failed to fetch installed skills';
		} finally {
			isLoadingInstalled = false;
		}
	}

	// Fetch catalog
	async function fetchCatalog() {
		isLoadingCatalog = true;
		catalogError = null;
		try {
			const res = await fetch('/api/config/skills?catalog=true');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to fetch');
			catalog = data.catalog || [];
		} catch (err) {
			catalogError = err instanceof Error ? err.message : 'Failed to fetch catalog';
		} finally {
			isLoadingCatalog = false;
		}
	}

	// Install skill
	async function installSkill(name: string) {
		installingSkills.add(name);
		installingSkills = new Set(installingSkills);
		try {
			const res = await fetch('/api/config/skills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Install failed');
			successToast(`Installed "${name}"`, 'Skill is ready to use');
			await fetchInstalled();
			// Auto-switch to installed tab and open detail drawer for the new skill
			showCatalog = false;
			const newSkill = installed.find((s) => s.id === name || s.name === name);
			if (newSkill) {
				openInstalledDetail(newSkill);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Install failed';
			errorToast('Install failed', msg);
		} finally {
			installingSkills.delete(name);
			installingSkills = new Set(installingSkills);
		}
	}

	// Toggle enable/disable - uses skill id (jat-skills expects id, not name)
	async function toggleSkill(skillId: string, enable: boolean) {
		togglingSkills.add(skillId);
		togglingSkills = new Set(togglingSkills);
		try {
			const res = await fetch('/api/config/skills', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: skillId, action: enable ? 'enable' : 'disable' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Toggle failed');
			// Update local state optimistically
			installed = installed.map((s) => (s.id === skillId ? { ...s, enabled: enable } : s));
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Toggle failed';
			errorToast('Toggle failed', msg);
			await fetchInstalled();
		} finally {
			togglingSkills.delete(skillId);
			togglingSkills = new Set(togglingSkills);
		}
	}

	// Uninstall skill - uses skill id
	async function uninstallSkill(skillId: string) {
		uninstallingSkills.add(skillId);
		uninstallingSkills = new Set(uninstallingSkills);
		try {
			const res = await fetch(`/api/config/skills?name=${encodeURIComponent(skillId)}`, {
				method: 'DELETE'
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Uninstall failed');
			successToast(`Uninstalled "${skillId}"`, 'Skill removed');
			installed = installed.filter((s) => s.id !== skillId);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Uninstall failed';
			errorToast('Uninstall failed', msg);
		} finally {
			uninstallingSkills.delete(skillId);
			uninstallingSkills = new Set(uninstallingSkills);
		}
	}

	// Update skill - uses skill id
	async function updateSkill(skillId: string) {
		togglingSkills.add(skillId);
		togglingSkills = new Set(togglingSkills);
		try {
			const res = await fetch('/api/config/skills', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: skillId, action: 'update' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Update failed');
			successToast(`Updated "${skillId}"`, 'Skill refreshed from source');
			await fetchInstalled();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Update failed';
			errorToast('Update failed', msg);
		} finally {
			togglingSkills.delete(skillId);
			togglingSkills = new Set(togglingSkills);
		}
	}

	/** Parse YAML-ish frontmatter from SKILL.md (between --- delimiters) */
	function parseFrontmatter(md: string): SkillFrontmatter | null {
		const match = md.match(/^---\n([\s\S]*?)\n---/);
		if (!match) return null;
		const yaml = match[1];
		const fm: SkillFrontmatter = {};
		for (const line of yaml.split('\n')) {
			const kv = line.match(/^(\w+):\s*(.+)/);
			if (kv) {
				const [, key, val] = kv;
				if (key === 'name') fm.name = val.trim().replace(/^["']|["']$/g, '');
				if (key === 'emoji') fm.emoji = val.trim().replace(/^["']|["']$/g, '');
				if (key === 'description') fm.description = val.trim().replace(/^["']|["']$/g, '');
			}
			// Parse requires block (simple list parsing)
			if (line.match(/^\s+bins:/)) {
				const listMatch = line.match(/\[([^\]]*)\]/);
				if (listMatch) {
					fm.requires = fm.requires || {};
					fm.requires.bins = listMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
				}
			}
			if (line.match(/^\s+env:/)) {
				const listMatch = line.match(/\[([^\]]*)\]/);
				if (listMatch) {
					fm.requires = fm.requires || {};
					fm.requires.env = listMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
				}
			}
		}
		return fm;
	}

	async function saveSkillContent() {
		if (!selectedSkill || !editContent) return;
		isSaving = true;
		try {
			const res = await fetch('/api/config/skills', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: selectedSkill.id, content: editContent })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Save failed');
			skillContent = editContent;
			parsedFrontmatter = parseFrontmatter(editContent);
			isEditing = false;
			successToast('SKILL.md saved', 'Changes will take effect on next use');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Save failed';
			errorToast('Save failed', msg);
		} finally {
			isSaving = false;
		}
	}

	function openCatalogDetail(skill: CatalogSkill) {
		selectedSkill = skill;
		selectedSkillType = 'catalog';
		skillContent = null;
		isDetailOpen = true;
		fetchSkillContent(skill.id, skill.skillMdUrl);
	}

	function openInstalledDetail(skill: InstalledSkill) {
		selectedSkill = skill;
		selectedSkillType = 'installed';
		skillContent = null;
		isDetailOpen = true;
		fetchSkillContent(skill.id, null);
	}

	async function fetchSkillContent(id: string, remoteUrl: string | null) {
		isLoadingContent = true;
		parsedFrontmatter = null;
		try {
			// Try local installed copy first
			const localRes = await fetch(`/api/config/skills?content=${encodeURIComponent(id)}`);
			if (localRes.ok) {
				const data = await localRes.json();
				if (data.content) {
					skillContent = data.content;
					parsedFrontmatter = parseFrontmatter(data.content);
					return;
				}
			}
			// Fallback: fetch raw from GitHub
			if (remoteUrl) {
				const rawUrl = remoteUrl
					.replace('github.com', 'raw.githubusercontent.com')
					.replace('/blob/', '/');
				const ghRes = await fetch(rawUrl);
				if (ghRes.ok) {
					const text = await ghRes.text();
					skillContent = text;
					parsedFrontmatter = parseFrontmatter(text);
					return;
				}
			}
			skillContent = null;
		} catch {
			skillContent = null;
		} finally {
			isLoadingContent = false;
		}
	}

	function closeDetail() {
		isDetailOpen = false;
		selectedSkill = null;
		skillContent = null;
		parsedFrontmatter = null;
		isEditing = false;
		editContent = '';
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		try {
			return new Date(dateStr).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	function sourceLabel(source: string): string {
		switch (source) {
			case 'jat':
				return 'JAT';
			case 'curated':
				return 'Official';
			case 'github-openclaw':
				return 'OpenClaw';
			case 'github-pi':
				return 'Pi';
			case 'github-agent':
				return 'Agent';
			case 'clawhub':
				return 'ClawHub';
			default:
				return source;
		}
	}

	function sourceColorClass(source: string): string {
		switch (source) {
			case 'jat':
				return 'source-jat';
			case 'curated':
				return 'source-official';
			case 'github-openclaw':
				return 'source-openclaw';
			case 'github-pi':
				return 'source-pi';
			case 'github-agent':
				return 'source-agent';
			case 'clawhub':
				return 'source-clawhub';
			default:
				return 'source-community';
		}
	}

	onMount(() => {
		fetchInstalled();
	});
</script>

<div class="skills-editor">
	<!-- Section Toggle -->
	<div class="section-toggle">
		<button
			class="toggle-btn"
			class:active={!showCatalog}
			onclick={() => (showCatalog = false)}
		>
			<svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			Installed
			{#if installed.length > 0}
				<span class="count-badge">{installed.length}</span>
			{/if}
		</button>
		<button
			class="toggle-btn"
			class:active={showCatalog}
			onclick={() => {
				showCatalog = true;
				if (catalog.length === 0) fetchCatalog();
			}}
		>
			<svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
			</svg>
			Browse Catalog
			{#if catalog.length > 0}
				<span class="count-badge">{catalog.length}</span>
			{/if}
		</button>
	</div>

	{#if !showCatalog}
		<!-- Installed Skills Section -->
		<div class="section" transition:fade={{ duration: 150 }}>
			{#if isLoadingInstalled}
				<div class="loading-state">
					<div class="loading-spinner"></div>
					<p>Loading installed skills...</p>
				</div>
			{:else if installedError}
				<div class="error-state">
					<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
					<p class="error-text">{installedError}</p>
					<button class="retry-btn" onclick={fetchInstalled}>Retry</button>
				</div>
			{:else if installed.length === 0}
				<div class="empty-state">
					<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
					</svg>
					<p class="empty-title">No skills installed</p>
					<p class="empty-hint">Browse the catalog to discover and install skills</p>
					<button
						class="browse-btn"
						onclick={() => {
							showCatalog = true;
							if (catalog.length === 0) fetchCatalog();
						}}
					>
						Browse Catalog
					</button>
				</div>
			{:else}
				<div class="installed-list">
					{#each installed as skill (skill.name)}
						<div class="skill-row" transition:slide={{ duration: 200 }}>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="skill-info clickable" onclick={() => openInstalledDetail(skill)}>
								<div class="skill-header">
									<span class="skill-name">{skill.name}</span>
									{#if skill.version}
										<span class="version-badge">v{skill.version}</span>
									{/if}
									{#if skill.source}
										<span class="source-badge {sourceColorClass(skill.source)}">{sourceLabel(skill.source)}</span>
									{/if}
								</div>
								{#if skill.description}
									<p class="skill-desc">{skill.description}</p>
								{/if}
								<div class="skill-meta">
									{#if skill.author}
										<span class="meta-item">by {skill.author}</span>
									{/if}
									{#if skill.installedAt}
										<span class="meta-item">installed {formatDate(skill.installedAt)}</span>
									{/if}
								</div>
							</div>
							<div class="skill-actions">
								<!-- Enable/Disable Toggle -->
								<label class="toggle-switch" title={skill.enabled ? 'Disable' : 'Enable'}>
									<input
										type="checkbox"
										checked={skill.enabled}
										disabled={togglingSkills.has(skill.id)}
										onchange={() => toggleSkill(skill.id, !skill.enabled)}
									/>
									<span class="toggle-slider" class:loading={togglingSkills.has(skill.id)}></span>
								</label>

								<!-- Update Button -->
								<button
									class="action-btn"
									title="Update from source"
									disabled={togglingSkills.has(skill.id)}
									onclick={() => updateSkill(skill.id)}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="action-icon">
										<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
									</svg>
								</button>

								<!-- Uninstall Button -->
								<button
									class="action-btn danger"
									title="Uninstall"
									disabled={uninstallingSkills.has(skill.id)}
									onclick={() => uninstallSkill(skill.id)}
								>
									{#if uninstallingSkills.has(skill.id)}
										<div class="btn-spinner"></div>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="action-icon">
											<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
										</svg>
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Catalog Browser Section -->
		<div class="section" transition:fade={{ duration: 150 }}>
			<!-- Search Bar -->
			<div class="search-bar">
				<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
				<input
					type="text"
					class="search-input"
					placeholder="Search skills by name, description, or tag..."
					bind:value={searchQuery}
				/>
				{#if searchQuery}
					<button class="clear-btn" title="Clear search" onclick={() => (searchQuery = '')}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="clear-icon">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>

			<!-- Source Filters -->
			{#if catalogSources().length > 2}
				<div class="filter-bar">
					{#each catalogSources() as source}
						<button
							class="filter-chip {source !== 'all' ? sourceColorClass(source) : ''}"
							class:active={activeFilter === source}
							onclick={() => (activeFilter = source)}
						>
							{source === 'all' ? 'All' : sourceLabel(source)}
						</button>
					{/each}
				</div>
			{/if}

			{#if isLoadingCatalog}
				<div class="loading-state">
					<div class="loading-spinner"></div>
					<p>Loading skill catalog...</p>
				</div>
			{:else if catalogError}
				<div class="error-state">
					<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
					<p class="error-text">{catalogError}</p>
					<button class="retry-btn" onclick={fetchCatalog}>Retry</button>
				</div>
			{:else if filteredCatalog().length === 0}
				<div class="empty-state">
					<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
					</svg>
					<p class="empty-title">
						{searchQuery ? 'No skills match your search' : 'No skills available'}
					</p>
					{#if searchQuery}
						<button class="browse-btn" onclick={() => (searchQuery = '')}>Clear search</button>
					{/if}
				</div>
			{:else}
				<div class="catalog-grid">
					{#each filteredCatalog() as skill (skill.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="catalog-card clickable" transition:fade={{ duration: 100 }} onclick={() => openCatalogDetail(skill)}>
							<div class="card-header">
								<span class="card-name">{skill.name}</span>
								<div class="card-badges">
									{#if !skill.compatible}
										<span class="compat-badge incompatible">Incompatible</span>
									{/if}
									<span class="source-chip {sourceColorClass(effectiveSource(skill))}">{sourceLabel(effectiveSource(skill))}</span>
								</div>
							</div>
							<p class="card-desc">{skill.description}</p>
							<div class="card-tags">
								{#each skill.tags.slice(0, 4) as tag}
									<span class="tag">{tag}</span>
								{/each}
								{#if skill.tags.length > 4}
									<span class="tag more">+{skill.tags.length - 4}</span>
								{/if}
							</div>
							<div class="card-footer">
								<div class="card-meta">
									<span class="meta-author">{skill.author}</span>
								</div>
								{#if installedIds.has(skill.id) || installedIds.has(skill.id?.toLowerCase()) || installedIds.has(skill.name)}
									<span class="installed-badge">Installed</span>
								{:else}
									<button
										class="install-btn"
										disabled={installingSkills.has(skill.id) || !skill.compatible}
										onclick={(e) => { e.stopPropagation(); installSkill(skill.id); }}
									>
										{#if installingSkills.has(skill.id)}
											<div class="btn-spinner"></div>
											Installing...
										{:else}
											Install
										{/if}
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Skill Detail Drawer -->
{#if isDetailOpen && selectedSkill}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="detail-overlay"
		transition:fade={{ duration: 150 }}
		onclick={closeDetail}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="detail-drawer"
			transition:fly={{ x: 400, duration: 200 }}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="detail-header">
				<div class="detail-title-row">
					<h2>{selectedSkill.name}</h2>
					{#if selectedSkill.source}
						{@const src = selectedSkillType === 'catalog' ? effectiveSource(selectedSkill) : selectedSkill.source}
						<span class="source-badge {sourceColorClass(src)}">{sourceLabel(src)}</span>
					{/if}
				</div>
				<button class="close-btn" title="Close" onclick={closeDetail}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="detail-body">
				<p class="detail-desc">{selectedSkill.description}</p>

				<!-- Usage Guide (parsed from frontmatter) -->
				{#if parsedFrontmatter && (parsedFrontmatter.name || parsedFrontmatter.requires)}
					<div class="usage-guide">
						<h3 class="usage-title">How to use</h3>
						{#if parsedFrontmatter.name}
							<div class="usage-invoke">
								<span class="usage-label">Invoke with</span>
								<code class="invoke-command">/{parsedFrontmatter.name}</code>
								{#if parsedFrontmatter.emoji}
									<span class="invoke-emoji">{parsedFrontmatter.emoji}</span>
								{/if}
							</div>
						{/if}
						{#if parsedFrontmatter.requires?.bins?.length}
							<div class="usage-row">
								<span class="usage-label">Requires</span>
								<div class="usage-items">
									{#each parsedFrontmatter.requires.bins as bin}
										<code class="req-item bin">{bin}</code>
									{/each}
								</div>
							</div>
						{/if}
						{#if parsedFrontmatter.requires?.env?.length}
							<div class="usage-row">
								<span class="usage-label">Env vars</span>
								<div class="usage-items">
									{#each parsedFrontmatter.requires.env as env}
										<code class="req-item env">{env}</code>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Metadata -->
				<div class="detail-meta">
					{#if selectedSkill.author}
						<div class="meta-row"><span class="meta-label">Author</span> <span class="meta-value">{selectedSkill.author}</span></div>
					{/if}
					{#if selectedSkill.version}
						<div class="meta-row"><span class="meta-label">Version</span> <span class="meta-value">{selectedSkill.version}</span></div>
					{/if}
					{#if selectedSkillType === 'installed' && selectedSkill.installedAt}
						<div class="meta-row"><span class="meta-label">Installed</span> <span class="meta-value">{formatDate(selectedSkill.installedAt)}</span></div>
					{/if}
					{#if selectedSkillType === 'catalog' && selectedSkill.repoUrl}
						<div class="meta-row">
							<span class="meta-label">Repository</span>
							<a class="meta-link" href={selectedSkill.repoUrl} target="_blank" rel="noopener noreferrer">
								{selectedSkill.repoUrl.replace('https://github.com/', '')}
							</a>
						</div>
					{/if}
				</div>

				<!-- Tags -->
				{#if selectedSkillType === 'catalog' && selectedSkill.tags?.length > 0}
					<div class="detail-tags">
						{#each selectedSkill.tags as tag}
							<span class="tag">{tag}</span>
						{/each}
					</div>
				{/if}

				<!-- Actions -->
				<div class="detail-actions">
					{#if selectedSkillType === 'catalog'}
						{@const isInstalled = installedIds.has(selectedSkill.id) || installedIds.has(selectedSkill.id?.toLowerCase()) || installedIds.has(selectedSkill.name)}
						{#if isInstalled}
							<span class="installed-badge">Installed</span>
						{:else}
							<button
								class="install-btn"
								disabled={installingSkills.has(selectedSkill.id) || !selectedSkill.compatible}
								onclick={() => installSkill(selectedSkill.id)}
							>
								{#if installingSkills.has(selectedSkill.id)}
									<div class="btn-spinner"></div>
									Installing...
								{:else}
									Install
								{/if}
							</button>
						{/if}
					{:else}
						<button class="action-btn" title="Update from source" onclick={() => updateSkill(selectedSkill.id)}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="action-icon">
								<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
							</svg>
							Update
						</button>
						<button
							class="action-btn danger"
							title="Uninstall"
							onclick={() => { uninstallSkill(selectedSkill.id); closeDetail(); }}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="action-icon">
								<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
							</svg>
							Uninstall
						</button>
					{/if}
				</div>

				<!-- SKILL.md Content -->
				<div class="detail-content-section">
					<div class="content-header">
						<h3>SKILL.md</h3>
						{#if isLoadingContent}
							<div class="btn-spinner"></div>
						{/if}
						{#if selectedSkillType === 'installed' && skillContent && !isLoadingContent}
							{#if isEditing}
								<button class="edit-toggle-btn save" disabled={isSaving} onclick={saveSkillContent}>
									{#if isSaving}
										<div class="btn-spinner"></div>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="edit-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
									{/if}
									Save
								</button>
								<button class="edit-toggle-btn cancel" onclick={() => { isEditing = false; }}>
									Cancel
								</button>
							{:else}
								<button class="edit-toggle-btn" onclick={() => { isEditing = true; editContent = skillContent || ''; }}>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="edit-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
									Edit
								</button>
							{/if}
						{/if}
					</div>
					{#if isLoadingContent}
						<div class="content-loading">
							<p>Loading skill definition...</p>
						</div>
					{:else if isEditing}
						<textarea class="skill-md-editor" bind:value={editContent} spellcheck="false"></textarea>
					{:else if skillContent}
						<pre class="skill-md-content">{skillContent}</pre>
					{:else}
						<div class="content-empty">
							<p>SKILL.md not available{selectedSkillType === 'catalog' ? ' — install to view locally' : ''}</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.skills-editor {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Section Toggle */
	.section-toggle {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: oklch(0.15 0.01 250);
		border-radius: 10px;
		width: fit-content;
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.toggle-btn:hover:not(.active) {
		color: oklch(0.75 0.02 250);
		background: oklch(0.20 0.02 250);
	}

	.toggle-btn.active {
		color: oklch(0.90 0.10 200);
		background: oklch(0.24 0.06 200);
	}

	.toggle-icon {
		width: 16px;
		height: 16px;
	}

	.count-badge {
		font-size: 0.7rem;
		padding: 0.125rem 0.375rem;
		border-radius: 8px;
		background: oklch(0.25 0.02 250);
		color: oklch(0.55 0.02 250);
	}

	.toggle-btn.active .count-badge {
		background: oklch(0.30 0.08 200);
		color: oklch(0.80 0.10 200);
	}

	/* Section */
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Search */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 8px;
	}

	.search-icon {
		width: 18px;
		height: 18px;
		color: oklch(0.45 0.02 250);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: oklch(0.85 0.02 250);
		font-size: 0.85rem;
		font-family: ui-monospace, monospace;
	}

	.search-input::placeholder {
		color: oklch(0.40 0.02 250);
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		background: transparent;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		color: oklch(0.50 0.02 250);
	}

	.clear-btn:hover {
		color: oklch(0.70 0.02 250);
		background: oklch(0.22 0.02 250);
	}

	.clear-icon {
		width: 14px;
		height: 14px;
	}

	/* Filter Bar */
	.filter-bar {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.filter-chip {
		padding: 0.25rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.filter-chip:hover:not(.active) {
		color: oklch(0.70 0.02 250);
		background: oklch(0.20 0.02 250);
	}

	.filter-chip.active {
		color: oklch(0.85 0.10 200);
		background: oklch(0.22 0.06 200);
		border-color: oklch(0.40 0.10 200);
	}

	/* Filter chip active states per source */
	.filter-chip.source-jat.active {
		color: oklch(0.90 0.14 85);
		background: oklch(0.24 0.08 85);
		border-color: oklch(0.45 0.12 85);
	}

	.filter-chip.source-official.active {
		color: oklch(0.85 0.12 275);
		background: oklch(0.22 0.06 275);
		border-color: oklch(0.40 0.10 275);
	}

	.filter-chip.source-openclaw.active {
		color: oklch(0.85 0.12 145);
		background: oklch(0.22 0.06 145);
		border-color: oklch(0.40 0.10 145);
	}

	.filter-chip.source-pi.active {
		color: oklch(0.85 0.12 55);
		background: oklch(0.22 0.06 55);
		border-color: oklch(0.40 0.10 55);
	}

	.filter-chip.source-agent.active {
		color: oklch(0.85 0.12 200);
		background: oklch(0.22 0.06 200);
		border-color: oklch(0.40 0.10 200);
	}

	.filter-chip.source-clawhub.active {
		color: oklch(0.85 0.12 330);
		background: oklch(0.22 0.06 330);
		border-color: oklch(0.40 0.10 330);
	}

	.filter-chip.source-community.active {
		color: oklch(0.80 0.04 250);
		background: oklch(0.22 0.02 250);
		border-color: oklch(0.35 0.04 250);
	}

	/* Installed List */
	.installed-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.skill-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 1rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 10px;
		transition: border-color 0.15s ease;
	}

	.skill-row:hover {
		border-color: oklch(0.30 0.04 250);
	}

	.skill-info {
		flex: 1;
		min-width: 0;
	}

	.skill-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.skill-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.88 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.version-badge {
		font-size: 0.65rem;
		padding: 0.1rem 0.375rem;
		border-radius: 4px;
		background: oklch(0.22 0.02 250);
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.source-badge {
		font-size: 0.65rem;
		padding: 0.1rem 0.375rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.skill-desc {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		line-height: 1.4;
	}

	.skill-meta {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}

	.meta-item {
		font-size: 0.7rem;
		color: oklch(0.45 0.02 250);
	}

	.skill-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* Toggle Switch */
	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 36px;
		height: 20px;
		cursor: pointer;
	}

	.toggle-switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		inset: 0;
		background: oklch(0.25 0.02 250);
		border-radius: 10px;
		transition: background 0.2s ease;
	}

	.toggle-slider::before {
		content: '';
		position: absolute;
		width: 16px;
		height: 16px;
		left: 2px;
		bottom: 2px;
		background: oklch(0.60 0.02 250);
		border-radius: 50%;
		transition: all 0.2s ease;
	}

	.toggle-switch input:checked + .toggle-slider {
		background: oklch(0.45 0.15 145);
	}

	.toggle-switch input:checked + .toggle-slider::before {
		transform: translateX(16px);
		background: oklch(0.85 0.15 145);
	}

	.toggle-slider.loading {
		opacity: 0.5;
	}

	/* Action Buttons */
	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.375rem;
		background: transparent;
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 6px;
		cursor: pointer;
		color: oklch(0.55 0.02 250);
		transition: all 0.15s ease;
	}

	.action-btn:hover:not(:disabled) {
		color: oklch(0.75 0.02 250);
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.action-btn.danger:hover:not(:disabled) {
		color: oklch(0.70 0.15 25);
		background: oklch(0.20 0.05 25);
		border-color: oklch(0.40 0.10 25);
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.action-icon {
		width: 16px;
		height: 16px;
	}

	/* Catalog Grid */
	.catalog-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}

	.catalog-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 10px;
		transition: border-color 0.15s ease;
	}

	.catalog-card:hover {
		border-color: oklch(0.30 0.04 250);
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.card-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.88 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.card-badges {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.source-chip {
		font-size: 0.6rem;
		padding: 0.1rem 0.375rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	/* Source color variants - distinct hues per source */
	.source-jat {
		background: oklch(0.26 0.10 85);
		color: oklch(0.80 0.15 85);
	}

	.source-official {
		background: oklch(0.24 0.08 275);
		color: oklch(0.72 0.15 275);
	}

	.source-openclaw {
		background: oklch(0.24 0.08 145);
		color: oklch(0.72 0.15 145);
	}

	.source-pi {
		background: oklch(0.24 0.08 55);
		color: oklch(0.72 0.15 55);
	}

	.source-agent {
		background: oklch(0.24 0.08 200);
		color: oklch(0.72 0.15 200);
	}

	.source-clawhub {
		background: oklch(0.24 0.08 330);
		color: oklch(0.72 0.15 330);
	}

	.source-community {
		background: oklch(0.22 0.02 250);
		color: oklch(0.60 0.04 250);
	}

	.compat-badge.incompatible {
		font-size: 0.6rem;
		padding: 0.1rem 0.375rem;
		border-radius: 4px;
		background: oklch(0.22 0.06 25);
		color: oklch(0.65 0.12 25);
		font-family: ui-monospace, monospace;
	}

	.card-desc {
		margin: 0;
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-tags {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.65rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		background: oklch(0.20 0.02 250);
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.tag.more {
		color: oklch(0.45 0.02 250);
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0.20 0.02 250);
	}

	.card-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.meta-author {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
	}

	.installed-badge {
		font-size: 0.75rem;
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		background: oklch(0.22 0.06 145);
		color: oklch(0.65 0.12 145);
		font-weight: 500;
		font-family: ui-monospace, monospace;
	}

	.install-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.90 0.10 200);
		background: oklch(0.24 0.06 200);
		border: 1px solid oklch(0.35 0.10 200);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.install-btn:hover:not(:disabled) {
		background: oklch(0.28 0.08 200);
	}

	.install-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Spinners */
	.loading-spinner {
		width: 28px;
		height: 28px;
		border: 3px solid oklch(0.25 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.40 0.02 250);
		border-top-color: oklch(0.80 0.10 200);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* States */
	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.75rem;
	}

	.loading-state p,
	.error-text {
		font-size: 0.85rem;
		color: oklch(0.50 0.02 250);
		margin: 0;
	}

	.error-icon,
	.empty-icon {
		width: 40px;
		height: 40px;
		color: oklch(0.40 0.02 250);
	}

	.error-icon {
		color: oklch(0.55 0.12 25);
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.8rem;
		color: oklch(0.45 0.02 250);
		margin: 0;
	}

	.retry-btn,
	.browse-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.85 0.08 200);
		background: oklch(0.22 0.04 200);
		border: 1px solid oklch(0.35 0.08 200);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.retry-btn:hover,
	.browse-btn:hover {
		background: oklch(0.26 0.06 200);
	}

	/* Detail Drawer */
	.detail-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.5);
		z-index: 50;
		display: flex;
		justify-content: flex-end;
	}

	.detail-drawer {
		width: 100%;
		max-width: 560px;
		height: 100%;
		background: oklch(0.14 0.01 250);
		border-left: 1px solid oklch(0.25 0.02 250);
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.detail-header h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: oklch(0.88 0.02 250);
		margin: 0;
		font-family: ui-monospace, monospace;
	}

	.close-btn {
		display: flex;
		padding: 0.375rem;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		color: oklch(0.50 0.02 250);
	}

	.close-btn:hover {
		color: oklch(0.70 0.02 250);
		background: oklch(0.20 0.02 250);
	}

	.close-btn svg {
		width: 18px;
		height: 18px;
	}

	.detail-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.detail-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		flex: 1;
		overflow-y: auto;
	}

	.detail-desc {
		margin: 0;
		font-size: 0.85rem;
		color: oklch(0.65 0.02 250);
		line-height: 1.5;
	}

	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.75rem;
		background: oklch(0.12 0.01 250);
		border-radius: 8px;
		border: 1px solid oklch(0.20 0.02 250);
	}

	.meta-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8rem;
	}

	.meta-label {
		color: oklch(0.50 0.02 250);
		min-width: 5rem;
		flex-shrink: 0;
	}

	.meta-value {
		color: oklch(0.75 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.meta-link {
		color: oklch(0.70 0.15 200);
		text-decoration: none;
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		word-break: break-all;
	}

	.meta-link:hover {
		text-decoration: underline;
	}

	.detail-tags {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.detail-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding-top: 0.25rem;
	}

	.detail-actions .action-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		padding: 0.375rem 0.75rem;
	}

	/* SKILL.md Content Section */
	.detail-content-section {
		border-top: 1px solid oklch(0.22 0.02 250);
		padding-top: 1rem;
	}

	.content-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.content-header h3 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: oklch(0.70 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.skill-md-content {
		margin: 0;
		padding: 1rem;
		background: oklch(0.12 0.01 250);
		border: 1px solid oklch(0.20 0.02 250);
		border-radius: 8px;
		font-size: 0.75rem;
		line-height: 1.6;
		color: oklch(0.72 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: pre-wrap;
		word-break: break-word;
		overflow-x: auto;
		max-height: 500px;
		overflow-y: auto;
	}

	.content-loading,
	.content-empty {
		padding: 1.5rem;
		text-align: center;
	}

	.content-loading p,
	.content-empty p {
		margin: 0;
		font-size: 0.8rem;
		color: oklch(0.45 0.02 250);
	}

	/* Usage Guide */
	.usage-guide {
		padding: 0.75rem;
		background: oklch(0.12 0.01 250);
		border: 1px solid oklch(0.22 0.04 145);
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.usage-title {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: oklch(0.75 0.10 145);
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.usage-invoke {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.usage-label {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		min-width: 4.5rem;
		flex-shrink: 0;
	}

	.invoke-command {
		font-size: 0.95rem;
		font-weight: 600;
		color: oklch(0.90 0.12 200);
		background: oklch(0.18 0.04 200);
		padding: 0.2rem 0.5rem;
		border-radius: 5px;
		font-family: ui-monospace, monospace;
	}

	.invoke-emoji {
		font-size: 1.1rem;
	}

	.usage-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.usage-items {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.req-item {
		font-size: 0.7rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
	}

	.req-item.bin {
		background: oklch(0.20 0.04 200);
		color: oklch(0.70 0.10 200);
	}

	.req-item.env {
		background: oklch(0.20 0.04 55);
		color: oklch(0.70 0.10 55);
	}

	/* Edit toggle button */
	.edit-toggle-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 5px;
		cursor: pointer;
		font-family: ui-monospace, monospace;
		transition: all 0.15s ease;
		margin-left: auto;
	}

	.edit-toggle-btn:hover:not(:disabled) {
		color: oklch(0.80 0.02 250);
		background: oklch(0.22 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.edit-toggle-btn.save {
		color: oklch(0.80 0.12 145);
		border-color: oklch(0.35 0.08 145);
	}

	.edit-toggle-btn.save:hover:not(:disabled) {
		background: oklch(0.22 0.06 145);
	}

	.edit-toggle-btn.cancel {
		margin-left: 0;
	}

	.edit-toggle-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.edit-icon {
		width: 12px;
		height: 12px;
	}

	/* SKILL.md editor textarea */
	.skill-md-editor {
		width: 100%;
		min-height: 400px;
		padding: 1rem;
		background: oklch(0.12 0.01 250);
		border: 1px solid oklch(0.30 0.06 200);
		border-radius: 8px;
		font-size: 0.75rem;
		line-height: 1.6;
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
		white-space: pre-wrap;
		word-break: break-word;
		resize: vertical;
		outline: none;
	}

	.skill-md-editor:focus {
		border-color: oklch(0.45 0.10 200);
		box-shadow: 0 0 0 2px oklch(0.45 0.10 200 / 0.2);
	}

	/* Clickable */
	.clickable {
		cursor: pointer;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.catalog-grid {
			grid-template-columns: 1fr;
		}

		.skill-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.skill-actions {
			align-self: flex-end;
		}
	}
</style>
