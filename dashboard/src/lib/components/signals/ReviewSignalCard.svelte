<script lang="ts">
	/**
	 * ReviewSignalCard Component
	 *
	 * Renders a rich review signal showing work summary, file changes with diff links,
	 * quality badges (tests/build status), key decisions, review focus areas, and
	 * interactive action buttons for reviewer response.
	 *
	 * @see shared/rich-signals-plan.md for design documentation
	 * @see src/lib/types/richSignals.ts for type definitions
	 */

	import type { ReviewSignal, FileModification, KeyDecision, CommitInfo, ReviewFocusItem } from '$lib/types/richSignals';
	import {
		openInJatEditor,
		openDiffInJatEditor,
		getFileLink,
		getDiffLink,
		getAllFileLinks,
		openLocalhostUrl,
		detectRouteFromPath,
		generateLocalhostUrl,
		openInFilePreviewDrawer,
		generateFilesPageUrl,
		type FileLinks
	} from '$lib/utils/fileLinks';
	import ReviewDiffDrawer from '$lib/components/review/ReviewDiffDrawer.svelte';

	interface Props {
		/** The rich review signal data */
		signal: ReviewSignal;
		/** Project name for localhost URL generation (e.g., 'jat', 'chimaro') */
		projectName?: string;
		/** Baseline commit SHA for diff comparison (from working signal) */
		baselineCommit?: string | null;
		/** Callback when task ID is clicked */
		onTaskClick?: (taskId: string) => void;
		/** Callback when a file path is clicked (for viewing) */
		onFileClick?: (filePath: string) => void;
		/** Callback when diff link is clicked */
		onDiffClick?: (filePath: string, changeType: string) => void;
		/** Callback when localhost link is clicked */
		onLocalhostClick?: (route: string) => void;
		/** Callback when user approves the changes */
		onApprove?: () => void;
		/** Callback when user requests changes */
		onRequestChanges?: (feedback: string) => void;
		/** Callback when user asks a question */
		onAskQuestion?: (question: string) => void;
		/** Whether an action is being submitted */
		submitting?: boolean;
		/** Whether to show in compact mode (for inline/timeline display) */
		compact?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		signal,
		projectName = 'jat',
		baselineCommit = null,
		onTaskClick,
		onFileClick,
		onDiffClick,
		onLocalhostClick,
		onApprove,
		onRequestChanges,
		onAskQuestion,
		submitting = false,
		compact = false,
		class: className = ''
	}: Props = $props();

	// UI state
	let decisionsExpanded = $state(false);
	let showRequestChangesInput = $state(false);
	let showAskQuestionInput = $state(false);
	let feedbackText = $state('');
	let questionText = $state('');
	let checkedReviewItems = $state<Set<number>>(new Set());

	// Diff drawer state
	let showDiffDrawer = $state(false);

	// Tests status badge styling - using DaisyUI semantic color classes
	const testsStatusBadge = $derived.by(() => {
		switch (signal.testsStatus) {
			case 'passing':
				return { label: 'PASSING', colorClass: 'text-success', icon: '✅', bgClass: 'bg-success/20' };
			case 'failing':
				return { label: 'FAILING', colorClass: 'text-error', icon: '❌', bgClass: 'bg-error/20' };
			case 'skipped':
				return { label: 'SKIPPED', colorClass: 'text-warning', icon: '⏭️', bgClass: 'bg-warning/20' };
			case 'none':
			default:
				return { label: 'NO TESTS', colorClass: 'text-base-content/50', icon: '➖', bgClass: 'bg-base-300/30' };
		}
	});

	// Build status badge styling - using DaisyUI semantic color classes
	const buildStatusBadge = $derived.by(() => {
		switch (signal.buildStatus) {
			case 'clean':
				return { label: 'CLEAN', colorClass: 'text-success', icon: '✅', bgClass: 'bg-success/20' };
			case 'warnings':
				return { label: 'WARNINGS', colorClass: 'text-warning', icon: '⚠️', bgClass: 'bg-warning/20' };
			case 'errors':
				return { label: 'ERRORS', colorClass: 'text-error', icon: '❌', bgClass: 'bg-error/20' };
			default:
				return { label: 'UNKNOWN', colorClass: 'text-base-content/50', icon: '❓', bgClass: 'bg-base-300/30' };
		}
	});

	// Change type icon and color - using DaisyUI semantic classes
	function getChangeTypeStyle(changeType: string) {
		switch (changeType) {
			case 'added':
				return { icon: '+', colorClass: 'bg-success text-success-content', label: 'NEW' };
			case 'deleted':
				return { icon: '-', colorClass: 'bg-error text-error-content', label: 'DEL' };
			case 'modified':
			default:
				return { icon: '~', colorClass: 'bg-warning text-warning-content', label: 'MOD' };
		}
	}

	// Format lines changed display
	function formatLinesChanged(added: number, removed: number): string {
		const parts = [];
		if (added > 0) parts.push(`+${added}`);
		if (removed > 0) parts.push(`-${removed}`);
		return parts.join('/') || '0';
	}

	// Format commit hash
	function formatCommit(sha: string): string {
		return sha.slice(0, 7);
	}

	// Handle file click - opens in FilePreviewDrawer by default
	function handleFileClick(file: FileModification) {
		if (onFileClick) {
			onFileClick(file.path);
		} else {
			// Default: open in FilePreviewDrawer
			openInFilePreviewDrawer(file.path, projectName);
		}
	}

	// Handle diff click - opens diff in JAT file editor by default
	function handleDiffClick(file: FileModification) {
		if (onDiffClick) {
			onDiffClick(file.path, file.changeType);
		} else {
			// Default: open diff in JAT file editor
			openDiffInJatEditor(file.path);
		}
	}

	// Get tooltip for file link
	function getFileTooltip(file: FileModification): string {
		return `Open ${file.path} in /files`;
	}

	// Get tooltip for diff link
	function getDiffTooltip(file: FileModification): string {
		const link = getDiffLink(file.path);
		return link.description;
	}

	// Get links for a file (editor, diff, localhost if applicable)
	function getFileLinksForFile(file: FileModification): FileLinks {
		return getAllFileLinks(file.path, projectName, { localhostRoute: file.localhostRoute });
	}

	// Handle localhost click - opens localhost URL
	function handleLocalhostClick(route: string) {
		if (onLocalhostClick) {
			onLocalhostClick(route);
		} else {
			openLocalhostUrl(route, projectName);
		}
	}

	// Get the text from a review focus item (handles both string and ReviewFocusItem)
	function getReviewFocusText(item: string | ReviewFocusItem): string {
		return typeof item === 'string' ? item : item.text;
	}

	// Get review focus item as object (for link access)
	function getReviewFocusItem(item: string | ReviewFocusItem): ReviewFocusItem | null {
		return typeof item === 'string' ? null : item;
	}

	// Check if a file has a localhost route (either explicit or detected)
	function hasLocalhostRoute(file: FileModification): boolean {
		return !!(file.localhostRoute || detectRouteFromPath(file.path));
	}

	// Get the localhost route for a file
	function getLocalhostRoute(file: FileModification): string | null {
		return file.localhostRoute || detectRouteFromPath(file.path);
	}

	// Collect all unique links for "Open All" button
	const allLinks = $derived.by(() => {
		const links: { type: 'editor' | 'diff' | 'localhost'; url: string; label: string }[] = [];
		const seenUrls = new Set<string>();

		// Add file and diff links for each modified file
		if (signal.filesModified) {
			for (const file of signal.filesModified) {
				const fileLinks = getFileLinksForFile(file);

				// File editor link
				if (!seenUrls.has(fileLinks.editorUrl)) {
					links.push({ type: 'editor', url: fileLinks.editorUrl, label: file.path });
					seenUrls.add(fileLinks.editorUrl);
				}

				// Localhost link (if route file or explicit route)
				if (fileLinks.localhostUrl && !seenUrls.has(fileLinks.localhostUrl)) {
					links.push({ type: 'localhost', url: fileLinks.localhostUrl, label: fileLinks.detectedRoute || file.path });
					seenUrls.add(fileLinks.localhostUrl);
				}
			}
		}

		// Add localhost links from review focus items
		if (signal.reviewFocus) {
			for (const item of signal.reviewFocus) {
				const focusItem = getReviewFocusItem(item);
				if (focusItem?.localhostRoute) {
					const url = generateLocalhostUrl(focusItem.localhostRoute, projectName);
					if (url && !seenUrls.has(url)) {
						links.push({ type: 'localhost', url, label: focusItem.localhostRoute });
						seenUrls.add(url);
					}
				}
				if (focusItem?.filePath) {
					const route = detectRouteFromPath(focusItem.filePath);
					if (route) {
						const url = generateLocalhostUrl(route, projectName);
						if (url && !seenUrls.has(url)) {
							links.push({ type: 'localhost', url, label: route });
							seenUrls.add(url);
						}
					}
				}
			}
		}

		return links;
	});

	// Count of localhost links for badge
	const localhostLinkCount = $derived(allLinks.filter(l => l.type === 'localhost').length);

	// Open all links
	function openAllLinks() {
		for (const link of allLinks) {
			window.open(link.url, '_blank');
		}
	}

	// Toggle review focus item
	function toggleReviewItem(index: number) {
		const newSet = new Set(checkedReviewItems);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		checkedReviewItems = newSet;
	}

	// Handle approve action
	function handleApprove() {
		if (submitting || !onApprove) return;
		onApprove();
	}

	// Handle request changes
	function handleRequestChanges() {
		if (submitting || !onRequestChanges || !feedbackText.trim()) return;
		onRequestChanges(feedbackText.trim());
		feedbackText = '';
		showRequestChangesInput = false;
	}

	// Handle ask question
	function handleAskQuestion() {
		if (submitting || !onAskQuestion || !questionText.trim()) return;
		onAskQuestion(questionText.trim());
		questionText = '';
		showAskQuestionInput = false;
	}

	// Calculate review completion percentage
	const reviewProgress = $derived.by(() => {
		if (!signal.reviewFocus || signal.reviewFocus.length === 0) return 100;
		return Math.round((checkedReviewItems.size / signal.reviewFocus.length) * 100);
	});
</script>

{#if compact}
	<!-- Compact mode: minimal review card for timeline/inline display -->
	<div
		class="rounded-lg px-3 py-2 flex items-center gap-3 bg-info/10 border border-info/30 {className}"
	>
		<!-- Status indicator -->
		<div class="flex-shrink-0">
			<svg class="w-4 h-4 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
			</svg>
		</div>

		<!-- Task info -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<button
				type="button"
				class="text-xs font-mono px-1.5 py-0.5 rounded bg-base-300 text-info border border-info/30 hover:opacity-80 transition-opacity cursor-pointer"
				onclick={() => onTaskClick?.(signal.taskId)}
				title="View task {signal.taskId}"
			>
				{signal.taskId}
			</button>
			<span class="text-sm truncate text-base-content/90">
				Ready for review
			</span>
		</div>

		<!-- Quality badges -->
		<div class="flex items-center gap-1.5 flex-shrink-0">
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono {testsStatusBadge.bgClass} {testsStatusBadge.colorClass}"
			>
				{testsStatusBadge.icon}
			</span>
			<span
				class="text-[10px] px-1.5 py-0.5 rounded font-mono {buildStatusBadge.bgClass} {buildStatusBadge.colorClass}"
			>
				{buildStatusBadge.icon}
			</span>
		</div>
	</div>
{:else}
	<!-- Full mode: detailed review signal card -->
	<!-- Card sizes based on content, parent container handles max-height and scrolling -->
	<div
		class="rounded-lg overflow-hidden flex flex-col bg-base-200 border border-info/40 {className}"
	>
		<!-- Header - flex-shrink-0 ensures it doesn't shrink when body scrolls -->
		<div
			class="px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 bg-base-300 border-b border-info/30"
		>
			<div class="flex items-center gap-2">
				<!-- Review indicator -->
				<svg class="w-4 h-4 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				</svg>

				<!-- Badge -->
				<span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-info text-info-content">
					👁️ REVIEW
				</span>

				<!-- Task ID -->
				<button
					type="button"
					class="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:opacity-80 transition-opacity bg-base-100 text-info border border-info/30"
					onclick={() => onTaskClick?.(signal.taskId)}
					title="View task {signal.taskId}"
				>
					{signal.taskId}
				</button>
			</div>

			<!-- Quality badges -->
			<div class="flex items-center gap-1.5">
				<!-- Tests badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1 {testsStatusBadge.bgClass} {testsStatusBadge.colorClass} border border-current/30"
					title="Tests: {testsStatusBadge.label}{signal.testsRun ? ` (${signal.testsPassed}/${signal.testsRun})` : ''}"
				>
					{testsStatusBadge.icon}
					<span class="hidden sm:inline">{testsStatusBadge.label}</span>
				</span>

				<!-- Build badge -->
				<span
					class="text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1 {buildStatusBadge.bgClass} {buildStatusBadge.colorClass} border border-current/30"
					title="Build: {buildStatusBadge.label}"
				>
					{buildStatusBadge.icon}
					<span class="hidden sm:inline">{buildStatusBadge.label}</span>
				</span>
			</div>
		</div>

		<!-- Body - content naturally sizes, parent container handles scrolling -->
		<div class="p-3 flex flex-col gap-3">
			<!-- Task Title -->
			{#if signal.taskTitle}
				<div class="text-sm font-semibold text-base-content">
					{signal.taskTitle}
				</div>
			{/if}

			<!-- Summary Bullets -->
			{#if signal.summary && signal.summary.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold text-base-content/70">
						📋 SUMMARY
					</div>
					<ul class="flex flex-col gap-1">
						{#each signal.summary as item}
							<li class="flex items-start gap-2 text-xs text-base-content/90">
								<span class="text-success">✓</span>
								<span>{item}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Approach (if different from summary) -->
			{#if signal.approach}
				<div class="text-xs p-2 rounded bg-base-100 text-base-content/85">
					<div class="text-[10px] font-semibold mb-1 opacity-60">🎯 APPROACH</div>
					{signal.approach}
				</div>
			{/if}

			<!-- Files Modified -->
			{#if signal.filesModified && signal.filesModified.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="text-[10px] font-semibold text-base-content/70">
								📁 FILES MODIFIED ({signal.filesModified.length})
							</div>
							<!-- Open All Links button -->
							{#if allLinks.length > 0}
								<button
									type="button"
									onclick={openAllLinks}
									class="text-[9px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity flex items-center gap-1 bg-success/30 text-success border border-success/40"
									title="Open all files and routes ({allLinks.length} links)"
								>
									<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
									</svg>
									Open All ({allLinks.length})
								</button>
							{/if}
						</div>
						<div class="text-[10px] font-mono">
							<span class="text-success">+{signal.totalLinesAdded || 0}</span>
							<span class="opacity-50">/</span>
							<span class="text-error">-{signal.totalLinesRemoved || 0}</span>
						</div>
					</div>
					<div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
						{#each signal.filesModified as file}
							{@const style = getChangeTypeStyle(file.changeType)}
							{@const localhostRoute = getLocalhostRoute(file)}
							<div
								class="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] bg-base-100 border border-base-300"
							>
								<!-- Change type indicator -->
								<span
									class="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold {style.colorClass}"
									title={style.label}
								>
									{style.icon}
								</span>

								<!-- File path -->
								<button
									type="button"
									onclick={() => handleFileClick(file)}
									class="flex-1 text-left truncate hover:opacity-80 transition-opacity cursor-pointer font-mono text-info"
									title={getFileTooltip(file)}
								>
									{file.path}
								</button>

								<!-- Lines changed -->
								<span class="text-[10px] font-mono flex-shrink-0 text-base-content/60">
									{formatLinesChanged(file.linesAdded, file.linesRemoved)}
								</span>

								<!-- Localhost link (shown if route file or explicit route) -->
								{#if localhostRoute}
									<button
										type="button"
										onclick={() => handleLocalhostClick(localhostRoute)}
										class="flex-shrink-0 px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity bg-success/20 text-success border border-success/30"
										title="Open {localhostRoute} in browser"
									>
										<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
										</svg>
									</button>
								{/if}

								<!-- Diff link (always shown - opens in JAT file editor) -->
								<button
									type="button"
									onclick={() => handleDiffClick(file)}
									class="flex-shrink-0 px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity bg-primary/20 text-primary border border-primary/30"
									title={getDiffTooltip(file)}
								>
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Key Decisions (expandable) -->
			{#if signal.keyDecisions && signal.keyDecisions.length > 0}
				<div class="rounded overflow-hidden bg-base-100 border border-base-300">
					<button
						type="button"
						onclick={() => decisionsExpanded = !decisionsExpanded}
						class="w-full px-2 py-1.5 flex items-center justify-between text-left hover:opacity-90 transition-opacity bg-base-200"
					>
						<div class="flex items-center gap-1.5">
							<span class="text-[10px] font-bold text-info">
								🤔 KEY DECISIONS ({signal.keyDecisions.length})
							</span>
						</div>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200 text-base-content/60"
							class:rotate-180={decisionsExpanded}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if decisionsExpanded}
						<div class="p-2 flex flex-col gap-2">
							{#each signal.keyDecisions as decision, i}
								<div class="p-2 rounded bg-base-300/50 border-l-2 border-info">
									<div class="text-xs font-semibold mb-1 text-base-content">
										{decision.decision}
									</div>
									<div class="text-[11px] text-base-content/70">
										<span class="font-semibold opacity-60">Why:</span> {decision.rationale}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Review Focus Checklist -->
			{#if signal.reviewFocus && signal.reviewFocus.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<div class="text-[10px] font-semibold text-base-content/70">
							🎯 REVIEW FOCUS
						</div>
						<div class="text-[10px] {reviewProgress === 100 ? 'text-success' : 'text-info'}">
							{checkedReviewItems.size}/{signal.reviewFocus.length} checked
						</div>
					</div>
					<div class="flex flex-col gap-1">
						{#each signal.reviewFocus as item, index}
							{@const focusItem = getReviewFocusItem(item)}
							{@const itemText = getReviewFocusText(item)}
							{@const hasFileLink = !!focusItem?.filePath}
							{@const hasLocalhostLink = !!focusItem?.localhostRoute || (focusItem?.filePath && detectRouteFromPath(focusItem.filePath))}
							{@const localhostRoute = focusItem?.localhostRoute || (focusItem?.filePath ? detectRouteFromPath(focusItem.filePath) : null)}
							{@const isChecked = checkedReviewItems.has(index)}
							<div
								class="flex items-start gap-2 p-2 rounded text-left transition-all {isChecked ? 'bg-success/20 border border-success/40' : 'bg-base-100 border border-base-300'}"
							>
								<!-- Checkbox (clickable) -->
								<button
									type="button"
									onclick={() => toggleReviewItem(index)}
									class="w-4 h-4 flex items-center justify-center rounded flex-shrink-0 mt-0.5 hover:opacity-80 transition-opacity cursor-pointer {isChecked ? 'bg-success border border-success' : 'bg-base-200 border border-base-content/30'}"
									title="Mark as reviewed"
								>
									{#if isChecked}
										<svg class="w-2.5 h-2.5 text-success-content" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
								</button>

								<!-- Review focus text -->
								<span
									class="text-xs flex-1 text-base-content/90"
									class:line-through={isChecked}
									class:opacity-60={isChecked}
								>
									{itemText}
								</span>

								<!-- Link buttons (if any) -->
								{#if hasFileLink || hasLocalhostLink}
									<div class="flex items-center gap-1 flex-shrink-0">
										<!-- File editor link -->
										{#if hasFileLink && focusItem?.filePath}
											<button
												type="button"
												onclick={() => openInFilePreviewDrawer(focusItem.filePath!, projectName)}
												class="px-1 py-0.5 rounded hover:opacity-80 transition-opacity bg-primary/20 text-primary border border-primary/30"
												title="Preview {focusItem.filePath}"
											>
												<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
												</svg>
											</button>
										{/if}

										<!-- Localhost link -->
										{#if hasLocalhostLink && localhostRoute}
											<button
												type="button"
												onclick={() => handleLocalhostClick(localhostRoute)}
												class="px-1 py-0.5 rounded hover:opacity-80 transition-opacity bg-success/20 text-success border border-success/30"
												title="Open {localhostRoute} in browser"
											>
												<svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
												</svg>
											</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Known Limitations -->
			{#if signal.knownLimitations && signal.knownLimitations.length > 0}
				<div class="flex flex-col gap-1.5 p-2 rounded bg-warning/20 border border-warning/40">
					<div class="text-[10px] font-bold text-warning">
						⚠️ KNOWN LIMITATIONS
					</div>
					<ul class="text-[11px] list-disc list-inside text-warning-content">
						{#each signal.knownLimitations as limitation}
							<li>{limitation}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Build Warnings -->
			{#if signal.buildWarnings && signal.buildWarnings.length > 0}
				<div class="flex flex-col gap-1 p-2 rounded bg-warning/25 border border-warning/40">
					<div class="text-[10px] font-bold text-warning">
						⚠️ BUILD WARNINGS
					</div>
					<div class="text-[10px] font-mono max-h-24 overflow-y-auto text-warning-content/80">
						{#each signal.buildWarnings as warning}
							<div class="py-0.5">{warning}</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Commits -->
			{#if signal.commits && signal.commits.length > 0}
				<div class="flex flex-col gap-1.5">
					<div class="text-[10px] font-semibold text-base-content/70">
						📝 COMMITS ({signal.commits.length})
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each signal.commits as commit}
							<div
								class="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-base-100 border border-base-300"
								title={commit.message}
							>
								<span class="font-mono font-bold text-primary">
									{formatCommit(commit.sha)}
								</span>
								<span class="truncate max-w-[200px] text-base-content/80">
									{commit.message.split('\n')[0]}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Review All Changes Button -->
			{#if baselineCommit && signal.filesModified?.length > 0}
				<div class="flex gap-2 pt-2 border-t border-base-300">
					<button
						type="button"
						onclick={() => showDiffDrawer = true}
						class="btn btn-sm btn-outline btn-info flex-1 gap-2"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
						</svg>
						Review All Changes
						<span class="badge badge-sm badge-info">{signal.filesModified.length}</span>
					</button>
				</div>
			{/if}

			<!-- Action Buttons -->
			{#if onApprove || onRequestChanges || onAskQuestion}
				<div class="flex flex-col gap-2 pt-2 border-t border-base-300">
					<!-- Input areas (shown conditionally) -->
					{#if showRequestChangesInput}
						<div class="flex flex-col gap-2">
							<textarea
								bind:value={feedbackText}
								placeholder="Describe the changes you'd like to see..."
								class="textarea textarea-sm w-full text-xs bg-base-100 border-error text-base-content"
								rows="3"
								disabled={submitting}
							></textarea>
							<div class="flex gap-2 justify-end">
								<button
									type="button"
									onclick={() => { showRequestChangesInput = false; feedbackText = ''; }}
									class="btn btn-sm btn-ghost"
									disabled={submitting}
								>
									Cancel
								</button>
								<button
									type="button"
									onclick={handleRequestChanges}
									disabled={submitting || !feedbackText.trim()}
									class="btn btn-sm btn-error gap-1"
								>
									{#if submitting}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
										</svg>
									{/if}
									Request Changes
								</button>
							</div>
						</div>
					{:else if showAskQuestionInput}
						<div class="flex flex-col gap-2">
							<input
								type="text"
								bind:value={questionText}
								placeholder="What would you like to know?"
								class="input input-sm w-full text-xs bg-base-100 border-secondary text-base-content"
								onkeydown={(e) => {
									if (e.key === 'Enter' && questionText.trim()) {
										handleAskQuestion();
									}
								}}
								disabled={submitting}
							/>
							<div class="flex gap-2 justify-end">
								<button
									type="button"
									onclick={() => { showAskQuestionInput = false; questionText = ''; }}
									class="btn btn-sm btn-ghost"
									disabled={submitting}
								>
									Cancel
								</button>
								<button
									type="button"
									onclick={handleAskQuestion}
									disabled={submitting || !questionText.trim()}
									class="btn btn-sm btn-secondary gap-1"
								>
									{#if submitting}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									Ask Question
								</button>
							</div>
						</div>
					{:else}
						<!-- Main action buttons -->
						<div class="flex gap-2">
							{#if onApprove}
								<button
									type="button"
									onclick={handleApprove}
									disabled={submitting}
									class="btn btn-sm btn-success flex-1 gap-1"
								>
									{#if submitting}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
									Approve
								</button>
							{/if}
							{#if onRequestChanges}
								<button
									type="button"
									onclick={() => showRequestChangesInput = true}
									disabled={submitting}
									class="btn btn-sm btn-error flex-1 gap-1"
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
									Request Changes
								</button>
							{/if}
							{#if onAskQuestion}
								<button
									type="button"
									onclick={() => showAskQuestionInput = true}
									disabled={submitting}
									class="btn btn-sm btn-secondary flex-1 gap-1"
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									Ask Question
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Review Diff Drawer -->
<ReviewDiffDrawer
	isOpen={showDiffDrawer}
	{projectName}
	baselineCommit={baselineCommit ?? ''}
	reviewSignal={signal}
	onClose={() => showDiffDrawer = false}
	onApprove={() => {
		showDiffDrawer = false;
		onApprove?.();
	}}
	onRequestChanges={(feedback) => {
		showDiffDrawer = false;
		onRequestChanges?.(feedback);
	}}
/>
