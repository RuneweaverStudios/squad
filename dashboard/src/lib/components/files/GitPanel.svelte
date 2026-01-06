<script lang="ts">
	/**
	 * GitPanel - Git operations panel for the Files page
	 *
	 * Shows:
	 * - Current branch with ahead/behind indicators (clickable to switch)
	 * - Fetch button to refresh remote status
	 * - Commit message input with commit button
	 * - Push/Pull action buttons
	 * - Timeline with commit history
	 */
	import { onMount } from 'svelte';
	import BranchSwitcherModal from './BranchSwitcherModal.svelte';

	interface Props {
		project: string;
		onFileClick?: (path: string) => void;
	}

	interface Commit {
		hash: string;
		hashShort: string;
		date: string;
		message: string;
		author_name: string;
		author_email: string;
		refs: string;
	}

	let { project, onFileClick }: Props = $props();

	// Branch switcher modal state
	let showBranchModal = $state(false);

	// Git status state
	let currentBranch = $state<string | null>(null);
	let tracking = $state<string | null>(null);
	let ahead = $state(0);
	let behind = $state(0);
	let isClean = $state(true);

	// File lists from git status
	let stagedFiles = $state<string[]>([]);
	let modifiedFiles = $state<string[]>([]);
	let deletedFiles = $state<string[]>([]);
	let untrackedFiles = $state<string[]>([]);
	let createdFiles = $state<string[]>([]);

	// Section collapse state
	let stagedCollapsed = $state(false);
	let changesCollapsed = $state(false);

	// Loading states for stage/unstage operations
	let stagingFiles = $state<Set<string>>(new Set());
	let unstagingFiles = $state<Set<string>>(new Set());
	let isStagingAll = $state(false);
	let isUnstagingAll = $state(false);

	// Derived counts
	const stagedCount = $derived(stagedFiles.length);
	const changesCount = $derived(
		modifiedFiles.length + deletedFiles.length + untrackedFiles.length + createdFiles.length
	);

	// Timeline state
	let commits = $state<Commit[]>([]);
	let isTimelineExpanded = $state(true);
	let isLoadingTimeline = $state(false);
	let timelineError = $state<string | null>(null);
	let headCommitHash = $state<string | null>(null);

	// UI state
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let commitMessage = $state('');
	let isCommitting = $state(false);
	let isPushing = $state(false);
	let isPulling = $state(false);
	let isFetching = $state(false);

	// Toast state
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');

	function showToast(message: string, type: 'success' | 'error' = 'success') {
		toastMessage = message;
		toastType = type;
		setTimeout(() => {
			toastMessage = null;
		}, 3000);
	}

	/**
	 * Format a date as relative time (e.g., "2h ago", "yesterday", "3 days ago")
	 */
	function formatTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (seconds < 60) return 'just now';
		if (seconds < 3600) {
			const mins = Math.floor(seconds / 60);
			return `${mins}m ago`;
		}
		if (seconds < 86400) {
			const hours = Math.floor(seconds / 3600);
			return `${hours}h ago`;
		}
		if (seconds < 172800) return 'yesterday';
		if (seconds < 604800) {
			const days = Math.floor(seconds / 86400);
			return `${days}d ago`;
		}
		if (seconds < 2592000) {
			const weeks = Math.floor(seconds / 604800);
			return `${weeks}w ago`;
		}
		if (seconds < 31536000) {
			const months = Math.floor(seconds / 2592000);
			return `${months}mo ago`;
		}
		const years = Math.floor(seconds / 31536000);
		return `${years}y ago`;
	}

	/**
	 * Truncate a string to a maximum length with ellipsis
	 */
	function truncate(str: string, maxLen: number): string {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen - 1) + '…';
	}

	/**
	 * Get status indicator for a file
	 */
	function getStatusIndicator(
		file: string,
		type: 'staged' | 'modified' | 'deleted' | 'untracked' | 'created'
	): { letter: string; color: string; title: string } {
		switch (type) {
			case 'staged':
				// Could be added, modified, or deleted - check which
				if (createdFiles.includes(file)) return { letter: 'A', color: 'oklch(0.65 0.15 145)', title: 'Added' };
				if (deletedFiles.includes(file)) return { letter: 'D', color: 'oklch(0.65 0.15 25)', title: 'Deleted' };
				return { letter: 'M', color: 'oklch(0.65 0.15 85)', title: 'Modified' };
			case 'modified':
				return { letter: 'M', color: 'oklch(0.65 0.15 85)', title: 'Modified' };
			case 'deleted':
				return { letter: 'D', color: 'oklch(0.65 0.15 25)', title: 'Deleted' };
			case 'untracked':
				return { letter: '?', color: 'oklch(0.55 0.02 250)', title: 'Untracked' };
			case 'created':
				return { letter: 'A', color: 'oklch(0.65 0.15 145)', title: 'Added' };
			default:
				return { letter: '?', color: 'oklch(0.55 0.02 250)', title: 'Unknown' };
		}
	}

	/**
	 * Get filename from path
	 */
	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	/**
	 * Get directory from path
	 */
	function getDirectory(path: string): string {
		const parts = path.split('/');
		if (parts.length <= 1) return '';
		return parts.slice(0, -1).join('/');
	}

	/**
	 * Stage a single file
	 */
	async function stageFile(filePath: string) {
		if (stagingFiles.has(filePath)) return;

		stagingFiles = new Set(stagingFiles).add(filePath);
		try {
			const response = await fetch('/api/files/git/stage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: [filePath] })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to stage file');
			}

			await fetchStatus();
			showToast(`Staged: ${getFileName(filePath)}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to stage file', 'error');
		} finally {
			const newSet = new Set(stagingFiles);
			newSet.delete(filePath);
			stagingFiles = newSet;
		}
	}

	/**
	 * Unstage a single file
	 */
	async function unstageFile(filePath: string) {
		if (unstagingFiles.has(filePath)) return;

		unstagingFiles = new Set(unstagingFiles).add(filePath);
		try {
			const response = await fetch('/api/files/git/unstage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: [filePath] })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to unstage file');
			}

			await fetchStatus();
			showToast(`Unstaged: ${getFileName(filePath)}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to unstage file', 'error');
		} finally {
			const newSet = new Set(unstagingFiles);
			newSet.delete(filePath);
			unstagingFiles = newSet;
		}
	}

	/**
	 * Stage all changed files
	 */
	async function stageAll() {
		if (isStagingAll) return;

		const allChanges = [...modifiedFiles, ...deletedFiles, ...untrackedFiles, ...createdFiles];
		if (allChanges.length === 0) return;

		isStagingAll = true;
		try {
			const response = await fetch('/api/files/git/stage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: allChanges })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to stage files');
			}

			await fetchStatus();
			showToast(`Staged ${allChanges.length} file(s)`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to stage files', 'error');
		} finally {
			isStagingAll = false;
		}
	}

	/**
	 * Unstage all staged files
	 */
	async function unstageAll() {
		if (isUnstagingAll) return;

		if (stagedFiles.length === 0) return;

		isUnstagingAll = true;
		try {
			const response = await fetch('/api/files/git/unstage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: stagedFiles })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to unstage files');
			}

			await fetchStatus();
			showToast(`Unstaged ${stagedFiles.length} file(s)`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to unstage files', 'error');
		} finally {
			isUnstagingAll = false;
		}
	}

	/**
	 * Handle file click - trigger diff view or selection
	 */
	function handleFileClick(filePath: string) {
		if (onFileClick) {
			onFileClick(filePath);
		}
	}

	/**
	 * Fetch commit timeline from API
	 */
	async function fetchTimeline() {
		if (!project) return;

		isLoadingTimeline = true;
		timelineError = null;

		try {
			const response = await fetch(`/api/files/git/log?project=${encodeURIComponent(project)}&limit=30`);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to fetch commit history');
			}

			const data = await response.json();
			commits = data.commits || [];

			// First commit is HEAD
			if (commits.length > 0) {
				headCommitHash = commits[0].hash;
			}
		} catch (err) {
			timelineError = err instanceof Error ? err.message : 'Failed to fetch commits';
			console.error('[GitPanel] Error fetching timeline:', err);
		} finally {
			isLoadingTimeline = false;
		}
	}

	// Derived state
	const canCommit = $derived(stagedCount > 0 && commitMessage.trim().length > 0 && !isCommitting);
	const canPush = $derived(ahead > 0 && !isPushing);
	const canPull = $derived(behind > 0 && !isPulling);

	async function fetchStatus() {
		if (!project) return;

		try {
			const response = await fetch(`/api/files/git/status?project=${encodeURIComponent(project)}`);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to fetch git status');
			}

			const data = await response.json();
			currentBranch = data.current;
			tracking = data.tracking;
			ahead = data.ahead || 0;
			behind = data.behind || 0;

			// Populate file arrays from API response
			stagedFiles = data.staged || [];
			modifiedFiles = data.modified || [];
			deletedFiles = data.deleted || [];
			untrackedFiles = data.not_added || [];
			createdFiles = data.created || [];

			isClean = data.isClean;
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch git status';
			console.error('[GitPanel] Error fetching status:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleFetch() {
		if (isFetching) return;

		isFetching = true;
		try {
			const response = await fetch('/api/files/git/fetch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to fetch');
			}

			const data = await response.json();
			ahead = data.ahead || 0;
			behind = data.behind || 0;
			tracking = data.tracking;
			showToast('Fetched from remote');
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to fetch', 'error');
		} finally {
			isFetching = false;
		}
	}

	async function handleCommit() {
		if (!canCommit) return;

		isCommitting = true;
		try {
			const response = await fetch('/api/files/git/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, message: commitMessage.trim() })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to commit');
			}

			const data = await response.json();
			showToast(`Committed: ${data.commit?.hash?.slice(0, 7) || 'success'}`);
			commitMessage = '';
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to commit', 'error');
		} finally {
			isCommitting = false;
		}
	}

	async function handlePush() {
		if (isPushing) return;

		isPushing = true;
		try {
			const response = await fetch('/api/files/git/push', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to push');
			}

			showToast('Pushed to remote');
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to push', 'error');
		} finally {
			isPushing = false;
		}
	}

	async function handlePull() {
		if (isPulling) return;

		isPulling = true;
		try {
			const response = await fetch('/api/files/git/pull', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to pull');
			}

			const data = await response.json();
			const changes = data.summary?.changes || 0;
			showToast(changes > 0 ? `Pulled ${changes} change(s)` : 'Already up to date');
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to pull', 'error');
		} finally {
			isPulling = false;
		}
	}

	// Handle Ctrl+Enter to commit
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canCommit) {
			e.preventDefault();
			handleCommit();
		}
	}

	// Handle branch switch from modal
	function handleBranchSwitch(newBranch: string) {
		currentBranch = newBranch;
		showToast(`Switched to ${newBranch}`);
		// Refresh status and timeline
		fetchStatus();
		fetchTimeline();
	}

	onMount(() => {
		fetchStatus();
		fetchTimeline();
	});

	// Refetch when project changes
	$effect(() => {
		if (project) {
			isLoading = true;
			fetchStatus();
			fetchTimeline();
		}
	});
</script>

<div class="git-panel">
	{#if isLoading}
		<!-- Loading State -->
		<div class="loading-container">
			<span class="loading loading-spinner loading-sm"></span>
			<span class="loading-text">Loading git status...</span>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="error-container">
			<div class="error-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			</div>
			<p class="error-text">{error}</p>
			<button class="btn btn-sm btn-ghost" onclick={fetchStatus}>
				Retry
			</button>
		</div>
	{:else}
		<!-- Branch Header -->
		<div class="branch-header">
			<button
				class="branch-info-btn"
				onclick={() => showBranchModal = true}
				title="Switch branch"
			>
				<span class="branch-icon">⎇</span>
				<span class="branch-name">{currentBranch || 'detached'}</span>
				<svg class="switch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="6 9 12 15 18 9" />
				</svg>
				{#if ahead > 0 || behind > 0}
					<span class="sync-indicators">
						{#if ahead > 0}
							<span class="ahead" title="{ahead} commit(s) ahead of remote">↑{ahead}</span>
						{/if}
						{#if behind > 0}
							<span class="behind" title="{behind} commit(s) behind remote">↓{behind}</span>
						{/if}
					</span>
				{/if}
			</button>
			<button
				class="fetch-btn"
				onclick={handleFetch}
				disabled={isFetching}
				title="Fetch from remote"
			>
				{#if isFetching}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M23 4v6h-6" />
						<path d="M1 20v-6h6" />
						<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
					</svg>
				{/if}
			</button>
		</div>

		<!-- File Changes Sections -->
		{#if isClean}
			<div class="clean-indicator">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="20 6 9 17 4 12" />
				</svg>
				<span>Working tree clean</span>
			</div>
		{:else}
			<!-- STAGED CHANGES Section -->
			<div class="changes-section">
				<button
					class="changes-header"
					onclick={() => stagedCollapsed = !stagedCollapsed}
					aria-expanded={!stagedCollapsed}
				>
					<svg
						class="chevron"
						class:expanded={!stagedCollapsed}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
					<span class="changes-title">STAGED CHANGES</span>
					{#if stagedCount > 0}
						<span class="changes-count staged">{stagedCount}</span>
					{/if}
					{#if stagedCount > 0}
						<button
							class="stage-all-btn"
							onclick={(e) => { e.stopPropagation(); unstageAll(); }}
							disabled={isUnstagingAll}
							title="Unstage all files"
						>
							{#if isUnstagingAll}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
							{/if}
						</button>
					{/if}
				</button>

				{#if !stagedCollapsed}
					<div class="file-list">
						{#if stagedFiles.length === 0}
							<div class="empty-section">No staged changes</div>
						{:else}
							{#each stagedFiles as file}
								{@const status = getStatusIndicator(file, 'staged')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item">
									<button
										class="unstage-btn"
										onclick={() => unstageFile(file)}
										disabled={unstagingFiles.has(file)}
										title="Unstage file"
									>
										{#if unstagingFiles.has(file)}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										{/if}
									</button>
									<span class="status-indicator" style="color: {status.color}" title={status.title}>
										{status.letter}
									</span>
									<button
										class="file-name-btn"
										onclick={() => handleFileClick(file)}
										title={file}
									>
										<span class="file-name">{fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<!-- CHANGES Section (Unstaged) -->
			<div class="changes-section">
				<button
					class="changes-header"
					onclick={() => changesCollapsed = !changesCollapsed}
					aria-expanded={!changesCollapsed}
				>
					<svg
						class="chevron"
						class:expanded={!changesCollapsed}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
					<span class="changes-title">CHANGES</span>
					{#if changesCount > 0}
						<span class="changes-count changes">{changesCount}</span>
					{/if}
					{#if changesCount > 0}
						<button
							class="stage-all-btn"
							onclick={(e) => { e.stopPropagation(); stageAll(); }}
							disabled={isStagingAll}
							title="Stage all files"
						>
							{#if isStagingAll}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="5" x2="12" y2="19" />
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
							{/if}
						</button>
					{/if}
				</button>

				{#if !changesCollapsed}
					<div class="file-list">
						{#if changesCount === 0}
							<div class="empty-section">No changes</div>
						{:else}
							<!-- Modified files -->
							{#each modifiedFiles as file}
								{@const status = getStatusIndicator(file, 'modified')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item">
									<button
										class="stage-btn"
										onclick={() => stageFile(file)}
										disabled={stagingFiles.has(file)}
										title="Stage file"
									>
										{#if stagingFiles.has(file)}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="12" y1="5" x2="12" y2="19" />
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										{/if}
									</button>
									<span class="status-indicator" style="color: {status.color}" title={status.title}>
										{status.letter}
									</span>
									<button
										class="file-name-btn"
										onclick={() => handleFileClick(file)}
										title={file}
									>
										<span class="file-name">{fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}

							<!-- Deleted files -->
							{#each deletedFiles as file}
								{@const status = getStatusIndicator(file, 'deleted')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item">
									<button
										class="stage-btn"
										onclick={() => stageFile(file)}
										disabled={stagingFiles.has(file)}
										title="Stage file"
									>
										{#if stagingFiles.has(file)}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="12" y1="5" x2="12" y2="19" />
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										{/if}
									</button>
									<span class="status-indicator" style="color: {status.color}" title={status.title}>
										{status.letter}
									</span>
									<button
										class="file-name-btn"
										onclick={() => handleFileClick(file)}
										title={file}
									>
										<span class="file-name">{fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}

							<!-- Untracked files -->
							{#each untrackedFiles as file}
								{@const status = getStatusIndicator(file, 'untracked')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item">
									<button
										class="stage-btn"
										onclick={() => stageFile(file)}
										disabled={stagingFiles.has(file)}
										title="Stage file"
									>
										{#if stagingFiles.has(file)}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="12" y1="5" x2="12" y2="19" />
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										{/if}
									</button>
									<span class="status-indicator" style="color: {status.color}" title={status.title}>
										{status.letter}
									</span>
									<button
										class="file-name-btn"
										onclick={() => handleFileClick(file)}
										title={file}
									>
										<span class="file-name">{fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}

							<!-- Created files (not yet added) -->
							{#each createdFiles.filter(f => !stagedFiles.includes(f)) as file}
								{@const status = getStatusIndicator(file, 'created')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item">
									<button
										class="stage-btn"
										onclick={() => stageFile(file)}
										disabled={stagingFiles.has(file)}
										title="Stage file"
									>
										{#if stagingFiles.has(file)}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="12" y1="5" x2="12" y2="19" />
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										{/if}
									</button>
									<span class="status-indicator" style="color: {status.color}" title={status.title}>
										{status.letter}
									</span>
									<button
										class="file-name-btn"
										onclick={() => handleFileClick(file)}
										title={file}
									>
										<span class="file-name">{fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Commit Section -->
		<div class="commit-section">
			<textarea
				class="commit-input"
				placeholder="Commit message..."
				bind:value={commitMessage}
				onkeydown={handleKeyDown}
				rows="2"
			></textarea>
			<div class="commit-actions">
				<button
					class="btn btn-sm btn-success commit-btn"
					onclick={handleCommit}
					disabled={!canCommit}
					title={stagedCount === 0 ? 'No staged changes' : 'Commit staged changes (Ctrl+Enter)'}
				>
					{#if isCommitting}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{/if}
					Commit
				</button>
			</div>
		</div>

		<!-- Push/Pull Actions -->
		<div class="sync-actions">
			<button
				class="btn btn-sm btn-outline sync-btn"
				onclick={handlePush}
				disabled={!canPush && !isPushing}
				title={ahead === 0 ? 'Nothing to push' : `Push ${ahead} commit(s) to remote`}
			>
				{#if isPushing}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="19" x2="12" y2="5" />
						<polyline points="5 12 12 5 19 12" />
					</svg>
				{/if}
				Push
				{#if ahead > 0}
					<span class="count">{ahead}</span>
				{/if}
			</button>
			<button
				class="btn btn-sm btn-outline sync-btn"
				onclick={handlePull}
				disabled={!canPull && !isPulling}
				title={behind === 0 ? 'Nothing to pull' : `Pull ${behind} commit(s) from remote`}
			>
				{#if isPulling}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<polyline points="19 12 12 19 5 12" />
					</svg>
				{/if}
				Pull
				{#if behind > 0}
					<span class="count">{behind}</span>
				{/if}
			</button>
		</div>

		<!-- Timeline Section -->
		<div class="timeline-section">
			<button
				class="timeline-header"
				onclick={() => isTimelineExpanded = !isTimelineExpanded}
				aria-expanded={isTimelineExpanded}
			>
				<svg
					class="chevron"
					class:expanded={isTimelineExpanded}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
				<span class="timeline-title">TIMELINE</span>
				{#if commits.length > 0}
					<span class="timeline-count">{commits.length}</span>
				{/if}
			</button>

			{#if isTimelineExpanded}
				<div class="timeline-content">
					{#if isLoadingTimeline}
						<div class="timeline-loading">
							<span class="loading loading-spinner loading-xs"></span>
							<span>Loading commits...</span>
						</div>
					{:else if timelineError}
						<div class="timeline-error">
							<span>{timelineError}</span>
							<button class="btn btn-xs btn-ghost" onclick={fetchTimeline}>Retry</button>
						</div>
					{:else if commits.length === 0}
						<div class="timeline-empty">No commits yet</div>
					{:else}
						<div class="commit-list">
							{#each commits as commit, index}
								{@const isHead = commit.hash === headCommitHash}
								{@const firstLine = commit.message.split('\n')[0]}
								<div class="commit-item" class:is-head={isHead} title={commit.message}>
									<div class="commit-marker">
										{#if isHead}
											<span class="head-marker">●</span>
										{:else}
											<span class="commit-dot">○</span>
										{/if}
										{#if index < commits.length - 1}
											<div class="commit-line"></div>
										{/if}
									</div>
									<div class="commit-details">
										<div class="commit-top">
											<span class="commit-hash">{commit.hashShort}</span>
											<span class="commit-time">{formatTimeAgo(commit.date)}</span>
										</div>
										<div class="commit-message">{truncate(firstLine, 50)}</div>
										<div class="commit-author">{commit.author_name}</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Toast -->
	{#if toastMessage}
		<div class="toast-container" class:error={toastType === 'error'}>
			{#if toastType === 'success'}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="20 6 9 17 4 12" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			{/if}
			<span>{toastMessage}</span>
		</div>
	{/if}
</div>

<!-- Branch Switcher Modal -->
<BranchSwitcherModal
	{project}
	{currentBranch}
	{isClean}
	bind:isOpen={showBranchModal}
	onClose={() => showBranchModal = false}
	onBranchSwitch={handleBranchSwitch}
/>

<style>
	.git-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 0.75rem;
		gap: 0.75rem;
		position: relative;
	}

	/* Loading State */
	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem 1rem;
		color: oklch(0.55 0.02 250);
	}

	.loading-text {
		font-size: 0.8125rem;
	}

	/* Error State */
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem 1rem;
		text-align: center;
	}

	.error-icon {
		width: 32px;
		height: 32px;
		color: oklch(0.60 0.15 25);
	}

	.error-icon svg {
		width: 100%;
		height: 100%;
	}

	.error-text {
		font-size: 0.8125rem;
		color: oklch(0.60 0.15 25);
		margin: 0;
	}

	/* Branch Header */
	.branch-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem;
		background: oklch(0.18 0.02 250);
		border-radius: 0.5rem;
		border: 1px solid oklch(0.24 0.02 250);
	}

	.branch-info-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.branch-info-btn:hover {
		background: oklch(0.22 0.02 250);
		border-color: oklch(0.30 0.02 250);
	}

	.branch-info-btn:active {
		background: oklch(0.25 0.02 250);
	}

	.branch-icon {
		font-size: 1rem;
		color: oklch(0.65 0.15 145);
	}

	.branch-name {
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
	}

	.switch-icon {
		width: 12px;
		height: 12px;
		color: oklch(0.50 0.02 250);
		transition: color 0.15s ease;
	}

	.branch-info-btn:hover .switch-icon {
		color: oklch(0.70 0.02 250);
	}

	.sync-indicators {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
	}

	.ahead {
		color: oklch(0.65 0.15 145);
	}

	.behind {
		color: oklch(0.65 0.15 200);
	}

	.fetch-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.fetch-btn:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
		color: oklch(0.80 0.02 250);
		border-color: oklch(0.35 0.02 250);
	}

	.fetch-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.fetch-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Status Badges */
	.status-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* Clean Indicator */
	.clean-indicator {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		color: oklch(0.55 0.12 145);
	}

	.clean-indicator svg {
		width: 14px;
		height: 14px;
	}

	/* Commit Section */
	.commit-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.commit-input {
		width: 100%;
		padding: 0.5rem 0.625rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.26 0.02 250);
		border-radius: 0.5rem;
		color: oklch(0.90 0.02 250);
		font-size: 0.8125rem;
		font-family: inherit;
		resize: vertical;
		min-height: 48px;
		transition: border-color 0.15s ease;
	}

	.commit-input:focus {
		outline: none;
		border-color: oklch(0.55 0.15 145);
	}

	.commit-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	.commit-actions {
		display: flex;
		justify-content: flex-end;
	}

	.commit-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.commit-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Sync Actions */
	.sync-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: auto;
	}

	.sync-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
	}

	.sync-btn svg {
		width: 14px;
		height: 14px;
	}

	.sync-btn .count {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 0.25rem;
		background: oklch(0.65 0.15 200 / 0.2);
		border-radius: 9px;
		font-size: 0.6875rem;
		font-weight: 600;
	}

	/* Toast */
	.toast-container {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.45 0.12 145 / 0.2);
		border: 1px solid oklch(0.55 0.15 145 / 0.3);
		border-radius: 0.5rem;
		color: oklch(0.75 0.12 145);
		font-size: 0.8125rem;
		animation: slide-up 0.2s ease;
	}

	.toast-container.error {
		background: oklch(0.45 0.12 25 / 0.2);
		border-color: oklch(0.55 0.15 25 / 0.3);
		color: oklch(0.75 0.12 25);
	}

	.toast-container svg {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Timeline Section */
	.timeline-section {
		display: flex;
		flex-direction: column;
		border-top: 1px solid oklch(0.24 0.02 250);
		padding-top: 0.75rem;
		margin-top: 0.25rem;
		flex: 1;
		min-height: 0;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.timeline-header:hover {
		color: oklch(0.70 0.02 250);
	}

	.timeline-header .chevron {
		width: 12px;
		height: 12px;
		transition: transform 0.15s ease;
	}

	.timeline-header .chevron.expanded {
		transform: rotate(90deg);
	}

	.timeline-title {
		flex: 1;
		text-align: left;
	}

	.timeline-count {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.22 0.02 250);
		border-radius: 9999px;
		color: oklch(0.65 0.02 250);
	}

	.timeline-content {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		margin-top: 0.5rem;
	}

	.timeline-loading,
	.timeline-error,
	.timeline-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.timeline-error {
		flex-direction: column;
		color: oklch(0.60 0.15 25);
	}

	/* Commit List */
	.commit-list {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		max-height: 300px;
		padding-right: 0.25rem;
	}

	.commit-list::-webkit-scrollbar {
		width: 4px;
	}

	.commit-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.commit-list::-webkit-scrollbar-thumb {
		background: oklch(0.30 0.02 250);
		border-radius: 2px;
	}

	.commit-list::-webkit-scrollbar-thumb:hover {
		background: oklch(0.40 0.02 250);
	}

	.commit-item {
		display: flex;
		gap: 0.5rem;
		padding: 0.375rem 0;
		cursor: default;
	}

	.commit-item:hover {
		background: oklch(0.18 0.02 250);
		border-radius: 0.25rem;
		margin: 0 -0.25rem;
		padding-left: 0.25rem;
		padding-right: 0.25rem;
	}

	.commit-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 14px;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.head-marker {
		color: oklch(0.65 0.15 145);
		font-size: 0.75rem;
		line-height: 1;
	}

	.commit-dot {
		color: oklch(0.45 0.02 250);
		font-size: 0.625rem;
		line-height: 1;
	}

	.commit-line {
		flex: 1;
		width: 1px;
		background: oklch(0.28 0.02 250);
		margin-top: 2px;
		min-height: 20px;
	}

	.commit-details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.commit-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.commit-hash {
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		color: oklch(0.65 0.15 200);
		background: oklch(0.65 0.15 200 / 0.1);
		padding: 0.0625rem 0.25rem;
		border-radius: 0.25rem;
	}

	.commit-item.is-head .commit-hash {
		color: oklch(0.65 0.15 145);
		background: oklch(0.65 0.15 145 / 0.15);
	}

	.commit-time {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
	}

	.commit-message {
		font-size: 0.75rem;
		color: oklch(0.80 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.commit-author {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
	}

	/* File Changes Sections */
	.changes-section {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid oklch(0.22 0.02 250);
		padding-bottom: 0.5rem;
	}

	.changes-section:last-of-type {
		border-bottom: none;
	}

	.changes-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0;
		background: transparent;
		border: none;
		color: oklch(0.55 0.02 250);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.changes-header:hover {
		color: oklch(0.70 0.02 250);
	}

	.changes-header .chevron {
		width: 12px;
		height: 12px;
		transition: transform 0.15s ease;
	}

	.changes-header .chevron.expanded {
		transform: rotate(90deg);
	}

	.changes-title {
		flex: 1;
		text-align: left;
	}

	.changes-count {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		font-weight: 500;
	}

	.changes-count.staged {
		background: oklch(0.65 0.15 145 / 0.2);
		color: oklch(0.70 0.15 145);
	}

	.changes-count.changes {
		background: oklch(0.65 0.15 85 / 0.2);
		color: oklch(0.70 0.15 85);
	}

	.stage-all-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: transparent;
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.stage-all-btn:hover:not(:disabled) {
		background: oklch(0.25 0.02 250);
		color: oklch(0.80 0.02 250);
		border-color: oklch(0.45 0.02 250);
	}

	.stage-all-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.stage-all-btn svg {
		width: 12px;
		height: 12px;
	}

	/* File List */
	.file-list {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding-left: 0.75rem;
		margin-top: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
	}

	.file-list::-webkit-scrollbar {
		width: 4px;
	}

	.file-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.file-list::-webkit-scrollbar-thumb {
		background: oklch(0.30 0.02 250);
		border-radius: 2px;
	}

	.empty-section {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
		padding: 0.5rem 0;
		font-style: italic;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0;
		border-radius: 0.25rem;
		transition: background 0.1s ease;
	}

	.file-item:hover {
		background: oklch(0.18 0.02 250);
	}

	.stage-btn,
	.unstage-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		background: transparent;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.stage-btn {
		color: oklch(0.60 0.12 145);
	}

	.stage-btn:hover:not(:disabled) {
		background: oklch(0.60 0.15 145 / 0.2);
		border-color: oklch(0.60 0.15 145);
		color: oklch(0.75 0.15 145);
	}

	.unstage-btn {
		color: oklch(0.60 0.02 250);
	}

	.unstage-btn:hover:not(:disabled) {
		background: oklch(0.55 0.02 250 / 0.2);
		border-color: oklch(0.55 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.stage-btn:disabled,
	.unstage-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.stage-btn svg,
	.unstage-btn svg {
		width: 10px;
		height: 10px;
	}

	.status-indicator {
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		width: 12px;
		text-align: center;
		flex-shrink: 0;
	}

	.file-name-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		padding: 0.125rem 0.25rem;
		cursor: pointer;
		flex: 1;
		min-width: 0;
		border-radius: 0.25rem;
		transition: background 0.1s ease;
	}

	.file-name-btn:hover {
		background: oklch(0.22 0.02 250);
	}

	.file-name {
		font-size: 0.75rem;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-dir {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
