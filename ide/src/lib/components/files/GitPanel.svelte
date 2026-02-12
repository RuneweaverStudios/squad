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
	import { goto } from '$app/navigation';
	import BranchSwitcherModal from './BranchSwitcherModal.svelte';
	import CommitDetailModal from './CommitDetailModal.svelte';
	import { openDiffPreviewDrawer } from '$lib/stores/drawerStore';

	interface Props {
		project: string;
		onFileClick?: (path: string, isStaged: boolean) => void;
		selectedFilePath?: string | null;
	}

	interface Commit {
		hash: string;
		hashShort: string;
		date: string;
		message: string;
		author_name: string;
		author_email: string;
		refs: string;
		isHead?: boolean;
		isPushed?: boolean;
		isRemoteHead?: boolean;
		isIncoming?: boolean;
	}

	let { project, onFileClick, selectedFilePath = null }: Props = $props();

	// Branch switcher modal state
	let showBranchModal = $state(false);

	// Commit detail modal state
	let showCommitModal = $state(false);
	let selectedCommitHash = $state<string | null>(null);

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
	let renamedFiles = $state<{ from: string; to: string }[]>([]);
	let conflictedFiles = $state<string[]>([]);

	// Section collapse state
	let stagedCollapsed = $state(false);
	let changesCollapsed = $state(false);

	// Loading states for stage/unstage operations
	let stagingFiles = $state<Set<string>>(new Set());
	let unstagingFiles = $state<Set<string>>(new Set());
	let isStagingAll = $state(false);
	let isUnstagingAll = $state(false);

	// Discard changes state
	let discardingFiles = $state<Set<string>>(new Set());
	let pendingDiscardFile = $state<string | null>(null);
	let discardSlideProgress = $state(0);
	let isSliding = $state(false);

	// Discard all state
	let isDiscardingAll = $state(false);
	let pendingDiscardAll = $state(false);
	let discardAllSlideProgress = $state(0);
	let isDiscardAllSliding = $state(false);

	// Derived counts (exclude staged files from changes count)
	const stagedCount = $derived(stagedFiles.length);
	const changesCount = $derived(
		modifiedFiles.filter(f => !stagedFiles.includes(f)).length +
		deletedFiles.filter(f => !stagedFiles.includes(f)).length +
		untrackedFiles.filter(f => !stagedFiles.includes(f)).length +
		createdFiles.filter(f => !stagedFiles.includes(f)).length +
		renamedFiles.filter(r => !stagedFiles.includes(r.to)).length +
		conflictedFiles.length // Conflicted files always show, can't be staged until resolved
	);

	// Flat ordered list of all visible files for keyboard navigation
	const navigableFiles = $derived.by(() => {
		const files: { path: string; isStaged: boolean }[] = [];
		// Staged files (if section is expanded)
		if (!stagedCollapsed) {
			for (const f of stagedFiles) {
				files.push({ path: f, isStaged: true });
			}
		}
		// Unstaged changes (if section is expanded)
		if (!changesCollapsed) {
			for (const f of modifiedFiles) {
				if (!stagedFiles.includes(f)) files.push({ path: f, isStaged: false });
			}
			for (const f of deletedFiles) {
				if (!stagedFiles.includes(f)) files.push({ path: f, isStaged: false });
			}
			for (const f of untrackedFiles) {
				if (!stagedFiles.includes(f)) files.push({ path: f, isStaged: false });
			}
			for (const f of createdFiles) {
				if (!stagedFiles.includes(f)) files.push({ path: f, isStaged: false });
			}
			for (const r of renamedFiles) {
				if (!stagedFiles.includes(r.to)) files.push({ path: r.to, isStaged: false });
			}
			for (const f of conflictedFiles) {
				files.push({ path: f, isStaged: false });
			}
		}
		return files;
	});

	function handleGlobalKeyNavigation(e: KeyboardEvent) {
		if (!selectedFilePath) return;
		// Don't intercept when typing in inputs
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		// Don't intercept when modifier keys are held (let other shortcuts work)
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		const isStaged = stagedFiles.includes(selectedFilePath);

		switch (e.key) {
			case 'ArrowUp':
			case 'ArrowDown': {
				if (navigableFiles.length === 0) return;
				e.preventDefault();
				const currentIndex = navigableFiles.findIndex(f => f.path === selectedFilePath);
				if (currentIndex === -1) return;
				const nextIndex = e.key === 'ArrowDown'
					? (currentIndex < navigableFiles.length - 1 ? currentIndex + 1 : 0)
					: (currentIndex > 0 ? currentIndex - 1 : navigableFiles.length - 1);
				const next = navigableFiles[nextIndex];
				if (next && onFileClick) {
					onFileClick(next.path, next.isStaged);
					requestAnimationFrame(() => {
						document.querySelector('.file-item.active')?.scrollIntoView({ block: 'nearest' });
					});
				}
				break;
			}
			case ' ': // Space = toggle stage/unstage
				e.preventDefault();
				if (isStaged) {
					unstageFile(selectedFilePath);
				} else {
					stageFile(selectedFilePath);
				}
				break;
			case 's': // S = stage
				e.preventDefault();
				if (!isStaged) stageFile(selectedFilePath);
				break;
			case 'u': // U = unstage
				e.preventDefault();
				if (isStaged) unstageFile(selectedFilePath);
				break;
			case 'd': // D = discard changes
				e.preventDefault();
				if (!isStaged) startDiscardConfirm(selectedFilePath);
				break;
			case 'Enter': // Enter = open in file editor
				e.preventDefault();
				goto(`/files?project=${encodeURIComponent(project)}&file=${encodeURIComponent(selectedFilePath)}`);
				break;
		}
	}

	// Timeline state
	let commits = $state<Commit[]>([]);
	let incomingCommits = $state<Commit[]>([]);
	let isTimelineExpanded = $state(true);
	let isLoadingTimeline = $state(false);
	let timelineError = $state<string | null>(null);
	let unpushedCount = $state(0);
	let mergeBaseHash = $state<string | null>(null);
	let defaultBranch = $state<string | null>(null);

	// UI state
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let commitMessage = $state('');
	let isCommitting = $state(false);
	let isGeneratingMessage = $state(false);
	let isPushing = $state(false);
	let isPulling = $state(false);
	let isFetching = $state(false);
	let pullStrategy = $state<'rebase' | 'merge'>('rebase');
	let showPullDropdown = $state(false);

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
	 * Get status indicator for a file
	 */
	function getStatusIndicator(
		file: string,
		type: 'staged' | 'modified' | 'deleted' | 'untracked' | 'created' | 'renamed' | 'conflicted'
	): { letter: string; color: string; title: string } {
		switch (type) {
			case 'staged':
				// Could be added, modified, deleted, or renamed - check which
				if (createdFiles.includes(file)) return { letter: 'A', color: 'oklch(0.65 0.15 145)', title: 'Added' };
				if (deletedFiles.includes(file)) return { letter: 'D', color: 'oklch(0.65 0.15 25)', title: 'Deleted' };
				if (renamedFiles.some(r => r.to === file)) return { letter: 'R', color: 'oklch(0.65 0.15 200)', title: 'Renamed' };
				return { letter: 'M', color: 'oklch(0.65 0.15 85)', title: 'Modified' };
			case 'modified':
				return { letter: 'M', color: 'oklch(0.65 0.15 85)', title: 'Modified' };
			case 'deleted':
				return { letter: 'D', color: 'oklch(0.65 0.15 25)', title: 'Deleted' };
			case 'untracked':
				return { letter: 'U', color: 'oklch(0.55 0.02 250)', title: 'Untracked' };
			case 'created':
				return { letter: 'A', color: 'oklch(0.65 0.15 145)', title: 'Added' };
			case 'renamed':
				return { letter: 'R', color: 'oklch(0.65 0.15 200)', title: 'Renamed' };
			case 'conflicted':
				return { letter: '!', color: 'oklch(0.65 0.18 25)', title: 'Conflict' };
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
	 * Stage a renamed file (requires both old and new paths)
	 * Git tracks renames as delete old + add new, so we must stage both paths
	 */
	async function stageRename(renamed: { from: string; to: string }) {
		if (stagingFiles.has(renamed.to)) return;

		stagingFiles = new Set(stagingFiles).add(renamed.to);
		try {
			const response = await fetch('/api/files/git/stage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: [renamed.from, renamed.to] })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to stage renamed file');
			}

			await fetchStatus();
			showToast(`Staged: ${getFileName(renamed.from)} → ${getFileName(renamed.to)}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to stage renamed file', 'error');
		} finally {
			const newSet = new Set(stagingFiles);
			newSet.delete(renamed.to);
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

		// For renamed files, we need both the old (from) and new (to) paths
		// Git tracks renames as delete old + add new, so both must be staged
		const renamedPaths = renamedFiles.filter(r => !stagedFiles.includes(r.to)).flatMap(r => [r.from, r.to]);
		// Filter out already-staged files: simple-git's status.deleted/modified includes
		// both staged and unstaged, but git add fails on already-staged deleted files
		const stagedSet = new Set(stagedFiles);
		const allChanges = [
			...modifiedFiles.filter(f => !stagedSet.has(f)),
			...deletedFiles.filter(f => !stagedSet.has(f)),
			...untrackedFiles.filter(f => !stagedSet.has(f)),
			...createdFiles.filter(f => !stagedSet.has(f)),
			...renamedPaths
		];
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
	 * Start discard confirmation for a file
	 */
	function startDiscardConfirm(filePath: string) {
		pendingDiscardFile = filePath;
		discardSlideProgress = 0;
		isSliding = false;
	}

	/**
	 * Cancel discard confirmation
	 */
	function cancelDiscard() {
		pendingDiscardFile = null;
		discardSlideProgress = 0;
		isSliding = false;
	}

	/**
	 * Handle slide progress for discard confirmation
	 */
	function handleSlideMove(e: MouseEvent | TouchEvent, containerWidth: number) {
		if (!isSliding || !pendingDiscardFile) return;

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = clientX - rect.left;
		const progress = Math.max(0, Math.min(100, (x / containerWidth) * 100));
		discardSlideProgress = progress;
	}

	/**
	 * Handle slide end - check if threshold reached
	 */
	function handleSlideEnd() {
		if (discardSlideProgress >= 80 && pendingDiscardFile) {
			// Threshold reached - discard the file
			discardFile(pendingDiscardFile);
		}
		// Reset slide state
		discardSlideProgress = 0;
		isSliding = false;
		pendingDiscardFile = null;
	}

	/**
	 * Discard changes to a single file
	 */
	async function discardFile(filePath: string) {
		if (discardingFiles.has(filePath)) return;

		discardingFiles = new Set(discardingFiles).add(filePath);
		try {
			const response = await fetch('/api/files/git/discard', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: [filePath] })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to discard changes');
			}

			await fetchStatus();
			showToast(`Discarded: ${getFileName(filePath)}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to discard changes', 'error');
		} finally {
			const newSet = new Set(discardingFiles);
			newSet.delete(filePath);
			discardingFiles = newSet;
			pendingDiscardFile = null;
		}
	}

	/**
	 * Start discard all confirmation
	 */
	function startDiscardAllConfirm() {
		pendingDiscardAll = true;
		discardAllSlideProgress = 0;
		isDiscardAllSliding = false;
	}

	/**
	 * Cancel discard all confirmation
	 */
	function cancelDiscardAll() {
		pendingDiscardAll = false;
		discardAllSlideProgress = 0;
		isDiscardAllSliding = false;
	}

	/**
	 * Handle slide progress for discard all confirmation
	 */
	function handleDiscardAllSlideMove(e: MouseEvent | TouchEvent, containerWidth: number) {
		if (!isDiscardAllSliding || !pendingDiscardAll) return;

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = clientX - rect.left;
		const progress = Math.max(0, Math.min(100, (x / containerWidth) * 100));
		discardAllSlideProgress = progress;
	}

	/**
	 * Handle slide end for discard all - check if threshold reached
	 */
	function handleDiscardAllSlideEnd() {
		if (discardAllSlideProgress >= 80 && pendingDiscardAll) {
			// Threshold reached - discard all files
			discardAll();
		}
		// Reset slide state
		discardAllSlideProgress = 0;
		isDiscardAllSliding = false;
		pendingDiscardAll = false;
	}

	/**
	 * Discard all unstaged changes
	 */
	async function discardAll() {
		if (isDiscardingAll) return;

		// Collect all changed files (exclude staged ones)
		const allChanges = [
			...modifiedFiles.filter(f => !stagedFiles.includes(f)),
			...deletedFiles.filter(f => !stagedFiles.includes(f))
		];

		if (allChanges.length === 0) return;

		isDiscardingAll = true;
		try {
			const response = await fetch('/api/files/git/discard', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, paths: allChanges })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to discard changes');
			}

			await fetchStatus();
			showToast(`Discarded ${allChanges.length} file(s)`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to discard changes', 'error');
		} finally {
			isDiscardingAll = false;
			pendingDiscardAll = false;
		}
	}

	/**
	 * Handle file click - open diff preview drawer
	 * @param filePath - Path to the file (relative to project root)
	 * @param isStaged - Whether this is a staged file (true) or unstaged change (false)
	 */
	function handleFileClick(filePath: string, isStaged: boolean) {
		// If onFileClick callback is provided, use that instead of opening the drawer
		// This allows parent components (like /git page) to show diff in a different way
		if (onFileClick) {
			onFileClick(filePath, isStaged);
		} else {
			// Default behavior: Open the diff preview drawer
			openDiffPreviewDrawer(filePath, project, isStaged);
		}
	}

	/**
	 * Fetch commit timeline from API
	 */
	async function fetchTimeline() {
		if (!project) {
			isLoadingTimeline = false;
			return;
		}

		const requestProject = project;
		isLoadingTimeline = true;
		timelineError = null;

		try {
			const response = await fetch(`/api/files/git/log?project=${encodeURIComponent(requestProject)}&limit=50`);
			if (project !== requestProject) return; // Project changed during fetch
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to fetch commit history');
			}

			const data = await response.json();
			if (project !== requestProject) return; // Project changed during parse
			commits = data.commits || [];
			incomingCommits = data.incomingCommits || [];
			unpushedCount = data.unpushedCount || 0;
			mergeBaseHash = data.mergeBaseHash || null;
			defaultBranch = data.defaultBranch || null;
		} catch (err) {
			if (project !== requestProject) return;
			timelineError = err instanceof Error ? err.message : 'Failed to fetch commits';
			console.error('[GitPanel] Error fetching timeline:', err);
		} finally {
			if (project === requestProject) {
				isLoadingTimeline = false;
			}
		}
	}

	// Derived state
	const canCommit = $derived(stagedCount > 0 && commitMessage.trim().length > 0 && !isCommitting);
	const canPush = $derived(ahead > 0 && behind === 0 && !isPushing);
	const canPull = $derived(behind > 0 && !isPulling);
	const isDiverged = $derived(ahead > 0 && behind > 0);

	async function fetchStatus() {
		if (!project) {
			isLoading = false;
			return;
		}

		const requestProject = project;

		try {
			const response = await fetch(`/api/files/git/status?project=${encodeURIComponent(requestProject)}`);
			if (project !== requestProject) return; // Project changed during fetch
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to fetch git status');
			}

			const data = await response.json();
			if (project !== requestProject) return; // Project changed during parse
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
			renamedFiles = data.renamed || [];
			conflictedFiles = data.conflicted || [];

			isClean = data.isClean;
			error = null;
		} catch (err) {
			if (project !== requestProject) return;
			error = err instanceof Error ? err.message : 'Failed to fetch git status';
			console.error('[GitPanel] Error fetching status:', err);
		} finally {
			if (project === requestProject) {
				isLoading = false;
			}
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
			await fetchTimeline(); // Refresh timeline to show new commit
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
			await fetchTimeline(); // Refresh commit timeline to show pushed status
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to push', 'error');
		} finally {
			isPushing = false;
		}
	}

	async function handlePull(strategy?: 'rebase' | 'merge') {
		if (isPulling) return;
		const useRebase = strategy ?? pullStrategy;

		isPulling = true;
		showPullDropdown = false;
		try {
			const response = await fetch('/api/files/git/pull', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project, rebase: useRebase === 'rebase' })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to pull');
			}

			const data = await response.json();
			const label = useRebase === 'rebase' ? 'Rebased' : 'Pulled';
			const changes = data.summary?.changes || 0;
			showToast(changes > 0 ? `${label} ${changes} change(s)` : `${label} successfully`);
			await fetchStatus();
			await fetchTimeline();
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

	/**
	 * Generate a commit message using AI
	 */
	async function handleGenerateMessage() {
		if (isGeneratingMessage || stagedCount === 0) return;

		isGeneratingMessage = true;
		try {
			const response = await fetch('/api/files/git/generate-commit-message', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to generate commit message');
			}

			const data = await response.json();
			if (data.message) {
				commitMessage = data.message;
				showToast('Generated commit message');
			} else {
				throw new Error('No message generated');
			}
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to generate message', 'error');
		} finally {
			isGeneratingMessage = false;
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

	// Handle commit click to show details modal
	function handleCommitClick(commitHash: string) {
		selectedCommitHash = commitHash;
		showCommitModal = true;
	}

	// Auto-refresh interval for git status (5 seconds)
	const AUTO_REFRESH_INTERVAL = 5000;
	let statusPollInterval: ReturnType<typeof setInterval> | null = null;

	function startStatusPolling() {
		if (statusPollInterval) return;
		let prevAhead = ahead;
		let prevBehind = behind;
		statusPollInterval = setInterval(async () => {
			// Skip fetch when page is hidden to avoid Content-Length mismatch errors
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
				return;
			}
			// Only poll if not currently loading or performing an operation
			if (!isLoading && !isCommitting && !isPushing && !isPulling && !isFetching) {
				await fetchStatus();
				// Refresh timeline when ahead/behind counts change (new commits pushed/pulled by agents)
				if (ahead !== prevAhead || behind !== prevBehind) {
					prevAhead = ahead;
					prevBehind = behind;
					fetchTimeline();
				}
			}
		}, AUTO_REFRESH_INTERVAL);
	}

	function stopStatusPolling() {
		if (statusPollInterval) {
			clearInterval(statusPollInterval);
			statusPollInterval = null;
		}
	}

	onMount(() => {
		// Note: Initial data fetch is handled by the $effect below which runs when project changes.
		// onMount only sets up the status polling interval.
		startStatusPolling();
		return () => stopStatusPolling();
	});

	// Refetch when project changes
	// Note: We must read `project` synchronously in the effect to track it as a dependency.
	// The async functions also read `project`, but that happens after the effect tracking phase.
	$effect(() => {
		const currentProject = project; // Track dependency synchronously
		if (currentProject) {
			// Reset all state to loading/empty before fetching new data
			isLoading = true;
			isLoadingTimeline = true;
			error = null;
			timelineError = null;
			commits = [];
			incomingCommits = [];
			stagedFiles = [];
			modifiedFiles = [];
			deletedFiles = [];
			untrackedFiles = [];
			createdFiles = [];
			renamedFiles = [];
			conflictedFiles = [];
			currentBranch = null;
			tracking = null;
			ahead = 0;
			behind = 0;
			unpushedCount = 0;
			// Close commit modal and clear selection when project changes
			// Prevents "bad object" errors from fetching old project's commits
			showCommitModal = false;
			selectedCommitHash = null;

			fetchStatus();
			fetchTimeline();
		} else {
			// No project selected - ensure loading states are cleared
			isLoading = false;
			isLoadingTimeline = false;
		}
	});
</script>

<svelte:window onkeydown={handleGlobalKeyNavigation} />

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
								<div class="file-item" class:active={selectedFilePath === file}>
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
										onclick={() => handleFileClick(file, true)}
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

			<!-- Commit Section (after staged changes, since staged files get committed) -->
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
						class="btn btn-sm btn-ghost generate-btn"
						onclick={handleGenerateMessage}
						disabled={stagedCount === 0 || isGeneratingMessage}
						title={stagedCount === 0 ? 'No staged changes' : 'Generate commit message with AI'}
					>
						{#if isGeneratingMessage}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
							</svg>
						{/if}
						Generate
					</button>
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
						{@const discardableCount = modifiedFiles.filter(f => !stagedFiles.includes(f)).length + deletedFiles.filter(f => !stagedFiles.includes(f)).length}
						{#if discardableCount > 0 && !pendingDiscardAll}
							<button
								class="discard-all-btn"
								onclick={(e) => { e.stopPropagation(); startDiscardAllConfirm(); }}
								disabled={isDiscardingAll}
								title="Discard all changes"
							>
								{#if isDiscardingAll}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
										<path d="M3 3v5h5" />
									</svg>
								{/if}
							</button>
						{/if}
					{/if}
				</button>

				{#if pendingDiscardAll}
					<div class="discard-all-container">
						<div class="discard-all-header">
							<span class="discard-all-label">⚠️ Discard all changes?</span>
							<button class="discard-all-cancel-btn" onclick={cancelDiscardAll} title="Cancel">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
						<div
							class="discard-all-slide-container"
							role="slider"
							tabindex="0"
							aria-label="Slide to discard all changes"
							aria-valuenow={discardAllSlideProgress}
							onmousedown={() => isDiscardAllSliding = true}
							onmouseup={handleDiscardAllSlideEnd}
							onmouseleave={() => { if (isDiscardAllSliding) handleDiscardAllSlideEnd(); }}
							onmousemove={(e) => handleDiscardAllSlideMove(e, (e.currentTarget as HTMLElement).offsetWidth)}
							ontouchstart={() => isDiscardAllSliding = true}
							ontouchend={handleDiscardAllSlideEnd}
							ontouchmove={(e) => handleDiscardAllSlideMove(e, (e.currentTarget as HTMLElement).offsetWidth)}
						>
							<div class="discard-all-slide-track">
								<div class="discard-all-slide-fill" style="width: {discardAllSlideProgress}%"></div>
								<div class="discard-all-slide-thumb" style="left: {Math.max(4, discardAllSlideProgress)}%">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="9 18 15 12 9 6" />
									</svg>
								</div>
								<span class="discard-all-slide-text">
									{discardAllSlideProgress >= 80 ? 'Release to discard' : 'Slide to discard all'}
								</span>
							</div>
						</div>
					</div>
				{/if}

				{#if !changesCollapsed}
					<div class="file-list">
						{#if changesCount === 0}
							<div class="empty-section">No changes</div>
						{:else}
							<!-- Modified files (exclude already staged) -->
							{#each modifiedFiles.filter(f => !stagedFiles.includes(f)) as file}
								{@const status = getStatusIndicator(file, 'modified')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								{@const isPendingDiscard = pendingDiscardFile === file}
								<div class="file-item" class:pending-discard={isPendingDiscard} class:active={selectedFilePath === file}>
									{#if isPendingDiscard}
										<!-- Slide to confirm discard -->
										<div
											class="discard-slide-container"
											role="slider"
											aria-label="Slide to discard changes"
											aria-valuenow={discardSlideProgress}
											onmousedown={() => isSliding = true}
											onmouseup={handleSlideEnd}
											onmouseleave={() => { if (isSliding) handleSlideEnd(); }}
											onmousemove={(e) => handleSlideMove(e, 180)}
											ontouchstart={() => isSliding = true}
											ontouchend={handleSlideEnd}
											ontouchmove={(e) => handleSlideMove(e, 180)}
										>
											<div class="discard-slide-track">
												<div class="discard-slide-fill" style="width: {discardSlideProgress}%"></div>
												<div class="discard-slide-thumb" style="left: {discardSlideProgress}%">
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<polyline points="9 18 15 12 9 6" />
													</svg>
												</div>
												<span class="discard-slide-text">
													{discardSlideProgress >= 80 ? 'Release to discard' : 'Slide to discard'}
												</span>
											</div>
										</div>
										<button class="discard-cancel-btn" onclick={cancelDiscard} title="Cancel">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="18" y1="6" x2="6" y2="18" />
												<line x1="6" y1="6" x2="18" y2="18" />
											</svg>
										</button>
									{:else}
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
											onclick={() => handleFileClick(file, false)}
											title={file}
										>
											<span class="file-name">{fileName}</span>
											{#if directory}
												<span class="file-dir">{directory}</span>
											{/if}
										</button>
										<button
											class="discard-btn"
											onclick={() => startDiscardConfirm(file)}
											disabled={discardingFiles.has(file)}
											title="Discard changes"
										>
											{#if discardingFiles.has(file)}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
													<path d="M3 3v5h5" />
												</svg>
											{/if}
										</button>
									{/if}
								</div>
							{/each}

							<!-- Deleted files (exclude already staged) -->
							{#each deletedFiles.filter(f => !stagedFiles.includes(f)) as file}
								{@const status = getStatusIndicator(file, 'deleted')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								{@const isPendingDiscard = pendingDiscardFile === file}
								<div class="file-item" class:pending-discard={isPendingDiscard} class:active={selectedFilePath === file}>
									{#if isPendingDiscard}
										<!-- Slide to confirm restore -->
										<div
											class="discard-slide-container"
											role="slider"
											aria-label="Slide to restore file"
											aria-valuenow={discardSlideProgress}
											onmousedown={() => isSliding = true}
											onmouseup={handleSlideEnd}
											onmouseleave={() => { if (isSliding) handleSlideEnd(); }}
											onmousemove={(e) => handleSlideMove(e, 180)}
											ontouchstart={() => isSliding = true}
											ontouchend={handleSlideEnd}
											ontouchmove={(e) => handleSlideMove(e, 180)}
										>
											<div class="discard-slide-track restore">
												<div class="discard-slide-fill" style="width: {discardSlideProgress}%"></div>
												<div class="discard-slide-thumb" style="left: {discardSlideProgress}%">
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<polyline points="9 18 15 12 9 6" />
													</svg>
												</div>
												<span class="discard-slide-text">
													{discardSlideProgress >= 80 ? 'Release to restore' : 'Slide to restore'}
												</span>
											</div>
										</div>
										<button class="discard-cancel-btn" onclick={cancelDiscard} title="Cancel">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="18" y1="6" x2="6" y2="18" />
												<line x1="6" y1="6" x2="18" y2="18" />
											</svg>
										</button>
									{:else}
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
											onclick={() => handleFileClick(file, false)}
											title={file}
										>
											<span class="file-name">{fileName}</span>
											{#if directory}
												<span class="file-dir">{directory}</span>
											{/if}
										</button>
										<button
											class="discard-btn restore"
											onclick={() => startDiscardConfirm(file)}
											disabled={discardingFiles.has(file)}
											title="Restore file"
										>
											{#if discardingFiles.has(file)}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
													<path d="M3 3v5h5" />
												</svg>
											{/if}
										</button>
									{/if}
								</div>
							{/each}

							<!-- Untracked files (exclude already staged) -->
							{#each untrackedFiles.filter(f => !stagedFiles.includes(f)) as file}
								{@const status = getStatusIndicator(file, 'untracked')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item" class:active={selectedFilePath === file}>
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
										onclick={() => handleFileClick(file, false)}
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
								<div class="file-item" class:active={selectedFilePath === file}>
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
										onclick={() => handleFileClick(file, false)}
										title={file}
									>
										<span class="file-name">{fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}

							<!-- Renamed files (exclude already staged) -->
							{#each renamedFiles.filter(r => !stagedFiles.includes(r.to)) as renamed}
								{@const status = getStatusIndicator(renamed.to, 'renamed')}
								{@const fileName = getFileName(renamed.to)}
								{@const fromFileName = getFileName(renamed.from)}
								{@const directory = getDirectory(renamed.to)}
								<div class="file-item" class:active={selectedFilePath === renamed.to}>
									<button
										class="stage-btn"
										onclick={() => stageRename(renamed)}
										disabled={stagingFiles.has(renamed.to)}
										title="Stage renamed file"
									>
										{#if stagingFiles.has(renamed.to)}
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
										onclick={() => handleFileClick(renamed.to, false)}
										title="{renamed.from} → {renamed.to}"
									>
										<span class="file-name">{fromFileName} → {fileName}</span>
										{#if directory}
											<span class="file-dir">{directory}</span>
										{/if}
									</button>
								</div>
							{/each}

							<!-- Conflicted files (must resolve before staging) -->
							{#each conflictedFiles as file}
								{@const status = getStatusIndicator(file, 'conflicted')}
								{@const fileName = getFileName(file)}
								{@const directory = getDirectory(file)}
								<div class="file-item conflicted" class:active={selectedFilePath === file}>
									<span class="conflict-icon" title="Resolve conflict before staging">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
											<line x1="12" y1="9" x2="12" y2="13" />
											<line x1="12" y1="17" x2="12.01" y2="17" />
										</svg>
									</span>
									<span class="status-indicator" style="color: {status.color}" title={status.title}>
										{status.letter}
									</span>
									<button
										class="file-name-btn"
										onclick={() => handleFileClick(file, false)}
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

		<!-- Push/Pull Actions -->
		<div class="sync-actions">
			<span
				class="sync-btn-wrap"
				title={ahead === 0 ? 'Nothing to push' : behind > 0 ? `Pull ${behind} remote commit(s) first` : `Push ${ahead} commit(s) to remote`}
			>
				<button
					class="btn btn-sm btn-outline sync-btn"
					onclick={handlePush}
					disabled={!canPush && !isPushing}
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
			</span>
			{#if isDiverged}
				<!-- Split button: main action + strategy dropdown -->
				<div class="pull-split-btn">
					<button
						class="btn btn-sm btn-outline sync-btn pull-main"
						onclick={() => handlePull()}
						disabled={!canPull && !isPulling}
						title={pullStrategy === 'rebase'
							? `Rebase ${ahead} local commit(s) onto ${behind} remote commit(s)`
							: `Merge ${behind} remote commit(s) into local branch`}
					>
						{#if isPulling}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="12" y1="5" x2="12" y2="19" />
								<polyline points="19 12 12 19 5 12" />
							</svg>
						{/if}
						{pullStrategy === 'rebase' ? 'Rebase' : 'Pull'}
						{#if behind > 0}
							<span class="count">{behind}</span>
						{/if}
					</button>
					<button
						class="btn btn-sm btn-outline pull-dropdown-toggle"
						onclick={() => showPullDropdown = !showPullDropdown}
						disabled={!canPull && !isPulling}
						title="Choose pull strategy"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px">
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{#if showPullDropdown}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="pull-dropdown-overlay" onclick={() => showPullDropdown = false} onkeydown={() => {}}></div>
						<div class="pull-dropdown-menu">
							<button
								class="pull-dropdown-item"
								class:active={pullStrategy === 'rebase'}
								onclick={() => { pullStrategy = 'rebase'; showPullDropdown = false; }}
							>
								<span class="pull-dropdown-label">Rebase</span>
								<span class="pull-dropdown-desc">Replay local commits on top of remote</span>
							</button>
							<button
								class="pull-dropdown-item"
								class:active={pullStrategy === 'merge'}
								onclick={() => { pullStrategy = 'merge'; showPullDropdown = false; }}
							>
								<span class="pull-dropdown-label">Merge</span>
								<span class="pull-dropdown-desc">Create merge commit</span>
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<button
					class="btn btn-sm btn-outline sync-btn"
					onclick={() => handlePull()}
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
			{/if}
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
				{#if commits.length + incomingCommits.length > 0}
					<span class="timeline-count">{commits.length + incomingCommits.length}</span>
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
					{:else if commits.length === 0 && incomingCommits.length === 0}
						<div class="timeline-empty">No commits yet</div>
					{:else}
						<div class="commit-list">
							{#if incomingCommits.length > 0}
								{#each incomingCommits as commit, index}
									{@const firstLine = commit.message.split('\n')[0]}
									<button
										class="commit-item is-incoming"
										title="Incoming - Remote commit not yet pulled locally"
										onclick={() => handleCommitClick(commit.hash)}
									>
										<div class="commit-marker">
											<span class="incoming-dot" title="Incoming">▼</span>
											<div class="commit-line incoming"></div>
										</div>
										<div class="commit-details">
											<div class="commit-top">
												<span class="commit-hash incoming">{commit.hashShort}</span>
												<span class="incoming-badge">incoming</span>
												<span class="commit-time">{formatTimeAgo(commit.date)}</span>
											</div>
											<div class="commit-message">{firstLine}</div>
											<div class="commit-author">{commit.author_name}</div>
										</div>
									</button>
								{/each}
								<div class="incoming-divider">
									<div class="incoming-divider-line"></div>
									<span class="incoming-divider-label">
										{incomingCommits.length} incoming from remote
										{#if isDiverged}
											· pull to reconcile
										{/if}
									</span>
									<div class="incoming-divider-line"></div>
								</div>
							{/if}
							{#each commits as commit, index}
								{@const firstLine = commit.message.split('\n')[0]}
								{@const isMergeBase = mergeBaseHash && commit.hash === mergeBaseHash && index > 0}
								{#if isMergeBase}
									<div class="branch-divider">
										<div class="branch-divider-line"></div>
										<span class="branch-divider-label">branched from {defaultBranch}</span>
										<div class="branch-divider-line"></div>
									</div>
								{/if}
								<button
									class="commit-item"
									class:is-head={commit.isHead}
									class:is-unpushed={!commit.isPushed}
									class:is-pushed={commit.isPushed}
									class:is-remote-head={commit.isRemoteHead}
									title={commit.isHead
										? 'HEAD - Your current commit'
										: commit.isRemoteHead
											? 'Remote HEAD - Last pushed commit on remote'
											: !commit.isPushed
												? 'Unpushed - Local commit not yet on remote'
												: 'Pushed - Commit exists on remote'}
									onclick={() => handleCommitClick(commit.hash)}
								>
									<div class="commit-marker">
										{#if commit.isHead}
											<span class="head-marker" title="HEAD">●</span>
										{:else if commit.isRemoteHead}
											<span class="remote-head-marker" title="Remote HEAD">◆</span>
										{:else if !commit.isPushed}
											<span class="unpushed-dot" title="Unpushed">●</span>
										{:else}
											<span class="pushed-dot" title="Pushed">○</span>
										{/if}
										{#if index < commits.length - 1}
											<div class="commit-line" class:unpushed={!commit.isPushed && !commits[index + 1]?.isPushed}></div>
										{/if}
									</div>
									<div class="commit-details">
										<div class="commit-top">
											<span class="commit-hash" class:unpushed={!commit.isPushed}>{commit.hashShort}</span>
											{#if commit.isHead}
												<span class="head-badge">HEAD</span>
											{:else if commit.isRemoteHead}
												<span class="remote-badge">origin</span>
											{:else if !commit.isPushed}
												<span class="unpushed-badge">local</span>
											{/if}
											<span class="commit-time">{formatTimeAgo(commit.date)}</span>
										</div>
										<div class="commit-message">{firstLine}</div>
										<div class="commit-author">{commit.author_name}</div>
									</div>
								</button>
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

<!-- Commit Detail Modal -->
<CommitDetailModal
	{project}
	commitHash={selectedCommitHash}
	bind:isOpen={showCommitModal}
	onClose={() => showCommitModal = false}
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
		gap: 0.5rem;
	}

	.generate-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: oklch(0.70 0.15 270);
		border-color: oklch(0.40 0.10 270);
	}

	.generate-btn:hover:not(:disabled) {
		background: oklch(0.65 0.15 270 / 0.15);
		border-color: oklch(0.55 0.15 270);
		color: oklch(0.80 0.15 270);
	}

	.generate-btn:disabled {
		opacity: 0.5;
	}

	.generate-btn svg {
		width: 14px;
		height: 14px;
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

	.sync-btn-wrap {
		flex: 1;
		display: flex;
	}

	.sync-btn-wrap .sync-btn {
		flex: 1;
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

	/* Pull split button (shown when diverged) */
	.pull-split-btn {
		flex: 1;
		display: flex;
		position: relative;
	}

	.pull-split-btn .pull-main {
		flex: 1;
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
		border-right: none;
	}

	.pull-dropdown-toggle {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
		padding: 0 0.375rem;
		min-width: 0;
	}

	.pull-dropdown-overlay {
		position: fixed;
		inset: 0;
		z-index: 39;
	}

	.pull-dropdown-menu {
		position: absolute;
		bottom: calc(100% + 4px);
		right: 0;
		z-index: 40;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.5rem;
		padding: 0.25rem;
		min-width: 200px;
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.4);
	}

	.pull-dropdown-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		border: none;
		border-radius: 0.375rem;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}

	.pull-dropdown-item:hover {
		background: oklch(0.25 0.02 250);
	}

	.pull-dropdown-item.active {
		background: oklch(0.25 0.05 250);
	}

	.pull-dropdown-item.active .pull-dropdown-label::after {
		content: ' ✓';
		color: oklch(0.70 0.15 145);
	}

	.pull-dropdown-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
	}

	.pull-dropdown-desc {
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
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
		padding: 0.375rem 0.25rem;
		cursor: pointer;
		background: transparent;
		border: none;
		width: 100%;
		text-align: left;
		border-radius: 0.25rem;
		transition: background 0.1s ease;
	}

	.commit-item:hover {
		background: oklch(0.20 0.02 250);
	}

	.commit-item:active {
		background: oklch(0.22 0.03 250);
	}

	/* Unpushed commit item - subtle amber tint on hover */
	.commit-item.is-unpushed:hover {
		background: oklch(0.20 0.03 75);
	}

	/* HEAD commit item - subtle cyan tint */
	.commit-item.is-head {
		background: oklch(0.18 0.02 195 / 0.3);
	}

	.commit-item.is-head:hover {
		background: oklch(0.20 0.03 195 / 0.4);
	}

	.commit-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 14px;
		flex-shrink: 0;
		padding-top: 2px;
	}

	/* HEAD marker - cyan/teal to stand out */
	.head-marker {
		color: oklch(0.70 0.15 195);
		font-size: 0.875rem;
		line-height: 1;
		text-shadow: 0 0 6px oklch(0.70 0.15 195 / 0.5);
	}

	/* Remote HEAD marker - green diamond */
	.remote-head-marker {
		color: oklch(0.65 0.15 145);
		font-size: 0.75rem;
		line-height: 1;
	}

	/* Unpushed commits - amber/orange */
	.unpushed-dot {
		color: oklch(0.70 0.15 75);
		font-size: 0.75rem;
		line-height: 1;
	}

	/* Pushed commits - muted gray-green */
	.pushed-dot {
		color: oklch(0.50 0.08 145);
		font-size: 0.625rem;
		line-height: 1;
	}

	.commit-line {
		flex: 1;
		width: 1px;
		background: oklch(0.35 0.02 250);
		margin-top: 2px;
		min-height: 20px;
	}

	/* Unpushed section of line */
	.commit-line.unpushed {
		background: oklch(0.55 0.12 75);
	}

	/* Branch divergence divider */
	.branch-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.25rem;
		margin: 0.25rem 0;
	}

	.branch-divider-line {
		flex: 1;
		height: 1px;
		background: oklch(0.35 0.02 250);
	}

	.branch-divider-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.50 0.02 250);
		white-space: nowrap;
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
		color: oklch(0.60 0.08 145);
		background: oklch(0.60 0.08 145 / 0.1);
		padding: 0.0625rem 0.25rem;
		border-radius: 0.25rem;
	}

	/* Unpushed commit hash - amber */
	.commit-hash.unpushed {
		color: oklch(0.70 0.15 75);
		background: oklch(0.70 0.15 75 / 0.15);
	}

	/* HEAD commit hash - cyan/teal */
	.commit-item.is-head .commit-hash {
		color: oklch(0.70 0.15 195);
		background: oklch(0.70 0.15 195 / 0.15);
	}

	/* Badges for commit status */
	.head-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.0625rem 0.25rem;
		border-radius: 0.1875rem;
		color: oklch(0.90 0.12 195);
		background: oklch(0.70 0.15 195 / 0.25);
		border: 1px solid oklch(0.70 0.15 195 / 0.4);
	}

	.remote-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.0625rem 0.25rem;
		border-radius: 0.1875rem;
		color: oklch(0.80 0.12 145);
		background: oklch(0.60 0.15 145 / 0.2);
		border: 1px solid oklch(0.60 0.15 145 / 0.35);
	}

	.unpushed-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.0625rem 0.25rem;
		border-radius: 0.1875rem;
		color: oklch(0.85 0.12 75);
		background: oklch(0.70 0.15 75 / 0.2);
		border: 1px solid oklch(0.70 0.15 75 / 0.35);
	}

	/* Incoming commits - blue (hue 250) */
	.incoming-dot {
		color: oklch(0.70 0.15 250);
		font-size: 0.625rem;
		line-height: 1;
	}

	.commit-line.incoming {
		background: oklch(0.50 0.12 250);
	}

	.commit-item.is-incoming:hover {
		background: oklch(0.20 0.03 250 / 0.4);
	}

	.commit-hash.incoming {
		color: oklch(0.70 0.15 250);
		background: oklch(0.70 0.15 250 / 0.15);
	}

	.incoming-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.0625rem 0.25rem;
		border-radius: 0.1875rem;
		color: oklch(0.85 0.12 250);
		background: oklch(0.65 0.15 250 / 0.2);
		border: 1px solid oklch(0.65 0.15 250 / 0.35);
	}

	.incoming-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.25rem;
		margin: 0.25rem 0;
	}

	.incoming-divider-line {
		flex: 1;
		height: 1px;
		background: oklch(0.45 0.10 250);
	}

	.incoming-divider-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.65 0.12 250);
		white-space: nowrap;
	}

	.commit-time {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		margin-left: auto;
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

	.discard-all-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: transparent;
		border: 1px solid oklch(0.35 0.08 30);
		border-radius: 0.25rem;
		color: oklch(0.55 0.12 30);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.discard-all-btn:hover:not(:disabled) {
		background: oklch(0.55 0.15 30 / 0.2);
		border-color: oklch(0.55 0.15 30);
		color: oklch(0.70 0.15 30);
	}

	.discard-all-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.discard-all-btn svg {
		width: 12px;
		height: 12px;
	}

	/* Discard All Confirmation Bar */
	.discard-all-container {
		margin: 0.5rem 0;
		padding: 0.5rem;
		background: oklch(0.18 0.03 30 / 0.3);
		border: 1px solid oklch(0.40 0.10 30 / 0.5);
		border-radius: 0.5rem;
	}

	.discard-all-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.discard-all-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.75 0.15 30);
	}

	.discard-all-cancel-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
		color: oklch(0.60 0.02 250);
	}

	.discard-all-cancel-btn:hover {
		background: oklch(0.30 0.02 250);
		border-color: oklch(0.45 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.discard-all-cancel-btn svg {
		width: 12px;
		height: 12px;
	}

	.discard-all-slide-container {
		height: 28px;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.discard-all-slide-container:active {
		cursor: grabbing;
	}

	.discard-all-slide-track {
		position: relative;
		width: 100%;
		height: 100%;
		background: oklch(0.20 0.04 30);
		border-radius: 14px;
		border: 1px solid oklch(0.40 0.10 30);
		overflow: hidden;
	}

	.discard-all-slide-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(90deg, oklch(0.50 0.15 30), oklch(0.60 0.18 30));
		border-radius: 14px 0 0 14px;
		transition: width 0.05s ease-out;
	}

	.discard-all-slide-thumb {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 24px;
		height: 24px;
		background: oklch(0.95 0.02 250);
		border: 2px solid oklch(0.60 0.15 30);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 4px oklch(0 0 0 / 0.3);
		transition: left 0.05s ease-out;
	}

	.discard-all-slide-thumb svg {
		width: 14px;
		height: 14px;
		color: oklch(0.40 0.02 250);
	}

	.discard-all-slide-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.6875rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		pointer-events: none;
		white-space: nowrap;
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

	.file-item.active {
		background: oklch(0.22 0.04 220 / 0.5);
	}

	.file-item.active:hover {
		background: oklch(0.24 0.04 220 / 0.5);
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

	/* Conflict styles */
	.file-item.conflicted {
		background: oklch(0.65 0.15 25 / 0.1);
		border-radius: 0.25rem;
		padding: 0.125rem 0.25rem;
		margin: 0 -0.25rem;
	}

	.conflict-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		color: oklch(0.65 0.18 25);
		flex-shrink: 0;
	}

	.conflict-icon svg {
		width: 14px;
		height: 14px;
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

	/* Discard/Revert button */
	.discard-btn {
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
		color: oklch(0.55 0.12 30);
		margin-left: auto;
	}

	.discard-btn:hover:not(:disabled) {
		background: oklch(0.55 0.15 30 / 0.2);
		border-color: oklch(0.55 0.15 30);
		color: oklch(0.70 0.15 30);
	}

	.discard-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.discard-btn svg {
		width: 12px;
		height: 12px;
	}

	/* Pending discard state */
	.file-item.pending-discard {
		background: oklch(0.18 0.03 30 / 0.3);
		padding: 0.25rem;
		margin: -0.125rem 0;
		border-radius: 0.375rem;
	}

	/* Slide to confirm container */
	.discard-slide-container {
		flex: 1;
		height: 24px;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.discard-slide-container:active {
		cursor: grabbing;
	}

	.discard-slide-track {
		position: relative;
		width: 100%;
		height: 100%;
		background: oklch(0.20 0.04 30);
		border-radius: 12px;
		border: 1px solid oklch(0.35 0.08 30);
		overflow: hidden;
	}

	.discard-slide-track.restore {
		background: oklch(0.20 0.04 145);
		border-color: oklch(0.35 0.08 145);
	}

	.discard-slide-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(90deg, oklch(0.50 0.15 30), oklch(0.60 0.18 30));
		border-radius: 12px 0 0 12px;
		transition: width 0.05s ease-out;
	}

	.discard-slide-track.restore .discard-slide-fill {
		background: linear-gradient(90deg, oklch(0.50 0.15 145), oklch(0.60 0.18 145));
	}

	.discard-slide-thumb {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 20px;
		height: 20px;
		background: oklch(0.95 0.02 250);
		border: 2px solid oklch(0.60 0.15 30);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 4px oklch(0 0 0 / 0.3);
		transition: left 0.05s ease-out;
	}

	.discard-slide-track.restore .discard-slide-thumb {
		border-color: oklch(0.60 0.15 145);
	}

	.discard-slide-thumb svg {
		width: 12px;
		height: 12px;
		color: oklch(0.40 0.02 250);
	}

	.discard-slide-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.625rem;
		font-weight: 600;
		color: oklch(0.75 0.02 250);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		pointer-events: none;
		white-space: nowrap;
	}

	/* Cancel button for discard */
	.discard-cancel-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: oklch(0.25 0.02 250);
		border: 1px solid oklch(0.35 0.02 250);
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
		color: oklch(0.60 0.02 250);
		margin-left: 0.5rem;
	}

	.discard-cancel-btn:hover {
		background: oklch(0.30 0.02 250);
		border-color: oklch(0.45 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.discard-cancel-btn svg {
		width: 12px;
		height: 12px;
	}
</style>
