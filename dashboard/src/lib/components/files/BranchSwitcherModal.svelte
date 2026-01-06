<script lang="ts">
	/**
	 * BranchSwitcherModal - Interactive modal for switching Git branches
	 *
	 * Features:
	 * - Display local and remote branches
	 * - Search/filter branches
	 * - Preview branch details (commit, tracking)
	 * - Handle branch switching with checkout API
	 */
	import { onMount } from 'svelte';

	interface Props {
		project: string;
		currentBranch: string | null;
		isOpen: boolean;
		isClean?: boolean;
		onClose: () => void;
		onBranchSwitch: (branch: string) => void;
	}

	let { project, currentBranch, isOpen = $bindable(false), isClean = true, onClose, onBranchSwitch }: Props =
		$props();

	interface Branch {
		name: string;
		current: boolean;
		commit: string;
		label: string;
	}

	// Branch data state
	let branches = $state<Branch[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// UI state
	let searchQuery = $state('');
	let selectedBranch = $state<string | null>(null);
	let isSwitching = $state(false);
	let switchError = $state<string | null>(null);

	// Dirty tree confirmation state
	let showDirtyWarning = $state(false);
	let pendingBranch = $state<string | null>(null);

	// Create new branch state
	let showCreateInput = $state(false);
	let newBranchName = $state('');
	let isCreating = $state(false);
	let createError = $state<string | null>(null);

	// Derived: filter and separate branches
	const filteredBranches = $derived(() => {
		const query = searchQuery.toLowerCase().trim();
		if (!query) return branches;
		return branches.filter((b) => b.name.toLowerCase().includes(query));
	});

	const localBranches = $derived(
		filteredBranches().filter((b) => !b.name.startsWith('remotes/'))
	);

	const remoteBranches = $derived(
		filteredBranches().filter((b) => b.name.startsWith('remotes/'))
	);

	const selectedBranchDetails = $derived(branches.find((b) => b.name === selectedBranch));

	async function fetchBranches() {
		if (!project) return;

		isLoading = true;
		error = null;

		try {
			const response = await fetch(
				`/api/files/git/branch?project=${encodeURIComponent(project)}`
			);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to fetch branches');
			}

			const data = await response.json();
			branches = data.branches || [];
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch branches';
			console.error('[BranchSwitcherModal] Error fetching branches:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleSwitchBranch() {
		if (!selectedBranch || selectedBranch === currentBranch || isSwitching) return;

		// If working tree is dirty, show confirmation first
		if (!isClean && !showDirtyWarning) {
			pendingBranch = selectedBranch;
			showDirtyWarning = true;
			return;
		}

		await performCheckout(selectedBranch);
	}

	async function performCheckout(branchName: string, create = false) {
		isSwitching = true;
		switchError = null;

		try {
			// For remote branches, extract the branch name without remotes/origin/
			let targetBranch = branchName;
			if (branchName.startsWith('remotes/')) {
				// remotes/origin/branch-name -> branch-name
				const parts = branchName.split('/');
				targetBranch = parts.slice(2).join('/');
			}

			const response = await fetch('/api/files/git/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project,
					branch: targetBranch,
					create
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to switch branch');
			}

			const data = await response.json();
			onBranchSwitch(data.branch);
			onClose();
		} catch (err) {
			switchError = err instanceof Error ? err.message : 'Failed to switch branch';
			console.error('[BranchSwitcherModal] Error switching branch:', err);
		} finally {
			isSwitching = false;
			showDirtyWarning = false;
			pendingBranch = null;
		}
	}

	function confirmDirtySwitch() {
		if (pendingBranch) {
			performCheckout(pendingBranch);
		}
	}

	function cancelDirtySwitch() {
		showDirtyWarning = false;
		pendingBranch = null;
	}

	async function handleCreateBranch() {
		const trimmedName = newBranchName.trim();
		if (!trimmedName || isCreating) return;

		isCreating = true;
		createError = null;

		try {
			await performCheckout(trimmedName, true);
			newBranchName = '';
			showCreateInput = false;
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create branch';
		} finally {
			isCreating = false;
		}
	}

	function handleCreateKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleCreateBranch();
		} else if (e.key === 'Escape') {
			showCreateInput = false;
			newBranchName = '';
			createError = null;
		}
	}

	function handleBranchClick(branchName: string) {
		if (branchName === currentBranch) return;
		selectedBranch = branchName;
	}

	function handleBranchDoubleClick(branchName: string) {
		if (branchName === currentBranch) return;
		selectedBranch = branchName;
		handleSwitchBranch();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'Enter' && selectedBranch) {
			handleSwitchBranch();
		}
	}

	function formatCommit(commit: string): string {
		return commit?.slice(0, 7) || '';
	}

	function getBranchDisplayName(name: string): string {
		if (name.startsWith('remotes/origin/')) {
			return name.replace('remotes/origin/', '');
		}
		if (name.startsWith('remotes/')) {
			return name.replace('remotes/', '');
		}
		return name;
	}

	// Fetch branches when modal opens
	$effect(() => {
		if (isOpen && project) {
			fetchBranches();
			selectedBranch = null;
			searchQuery = '';
			switchError = null;
			showDirtyWarning = false;
			pendingBranch = null;
			showCreateInput = false;
			newBranchName = '';
			createError = null;
		}
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
	<!-- Modal backdrop -->
	<div class="modal-backdrop" onclick={onClose} role="button" tabindex="-1">
		<!-- Modal content -->
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="branch-modal-title"
		>
			<!-- Header -->
			<div class="modal-header">
				<h3 id="branch-modal-title" class="modal-title">
					<span class="branch-icon">⎇</span>
					Switch Branch
				</h3>
				<button class="close-btn" onclick={onClose} title="Close (Esc)">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<!-- Search Input -->
			<div class="search-container">
				<svg
					class="search-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input
					type="text"
					class="search-input"
					placeholder="Search branches..."
					bind:value={searchQuery}
					autofocus
				/>
			</div>

			<!-- Content -->
			<div class="modal-body">
				{#if isLoading}
					<div class="loading-container">
						<span class="loading loading-spinner loading-sm"></span>
						<span>Loading branches...</span>
					</div>
				{:else if error}
					<div class="error-container">
						<p class="error-text">{error}</p>
						<button class="btn btn-sm btn-ghost" onclick={fetchBranches}> Retry </button>
					</div>
				{:else}
					<!-- Branch Lists -->
					<div class="branch-lists">
						<!-- Local Branches -->
						{#if localBranches.length > 0}
							<div class="branch-section">
								<h4 class="section-title">Local Branches</h4>
								<ul class="branch-list">
									{#each localBranches as branch}
										<li
											class="branch-item"
											class:current={branch.name === currentBranch}
											class:selected={branch.name === selectedBranch}
											onclick={() => handleBranchClick(branch.name)}
											ondblclick={() => handleBranchDoubleClick(branch.name)}
											role="button"
											tabindex="0"
										>
											<div class="branch-info">
												<span class="branch-name">
													{#if branch.name === currentBranch}
														<span class="current-indicator">●</span>
													{/if}
													{getBranchDisplayName(branch.name)}
												</span>
												<span class="branch-commit">{formatCommit(branch.commit)}</span>
											</div>
											{#if branch.label && branch.label !== branch.name}
												<span class="branch-label">{branch.label}</span>
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Remote Branches -->
						{#if remoteBranches.length > 0}
							<div class="branch-section">
								<h4 class="section-title">Remote Branches</h4>
								<ul class="branch-list">
									{#each remoteBranches as branch}
										<li
											class="branch-item remote"
											class:selected={branch.name === selectedBranch}
											onclick={() => handleBranchClick(branch.name)}
											ondblclick={() => handleBranchDoubleClick(branch.name)}
											role="button"
											tabindex="0"
										>
											<div class="branch-info">
												<span class="branch-name">
													{getBranchDisplayName(branch.name)}
												</span>
												<span class="branch-commit">{formatCommit(branch.commit)}</span>
											</div>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- No results -->
						{#if localBranches.length === 0 && remoteBranches.length === 0}
							<div class="no-results">
								<p>No branches found matching "{searchQuery}"</p>
							</div>
						{/if}

						<!-- Create New Branch Section -->
						<div class="create-section">
							{#if showCreateInput}
								<div class="create-form">
									<input
										type="text"
										class="create-input"
										placeholder="New branch name..."
										bind:value={newBranchName}
										onkeydown={handleCreateKeyDown}
										disabled={isCreating}
									/>
									<div class="create-actions">
										<button
											class="btn btn-xs btn-success"
											onclick={handleCreateBranch}
											disabled={!newBranchName.trim() || isCreating}
										>
											{#if isCreating}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											Create
										</button>
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => { showCreateInput = false; newBranchName = ''; createError = null; }}
											disabled={isCreating}
										>
											Cancel
										</button>
									</div>
								</div>
								{#if createError}
									<div class="create-error">{createError}</div>
								{/if}
							{:else}
								<button class="create-branch-btn" onclick={() => showCreateInput = true}>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<line x1="12" y1="5" x2="12" y2="19" />
										<line x1="5" y1="12" x2="19" y2="12" />
									</svg>
									<span>Create new branch...</span>
								</button>
							{/if}
						</div>
					</div>

					<!-- Selected Branch Preview -->
					{#if selectedBranchDetails}
						<div class="preview-section">
							<h4 class="section-title">Preview</h4>
							<div class="preview-content">
								<div class="preview-row">
									<span class="preview-label">Branch:</span>
									<span class="preview-value">{getBranchDisplayName(selectedBranchDetails.name)}</span>
								</div>
								<div class="preview-row">
									<span class="preview-label">Commit:</span>
									<span class="preview-value mono">{selectedBranchDetails.commit}</span>
								</div>
								{#if selectedBranchDetails.label}
									<div class="preview-row">
										<span class="preview-label">Label:</span>
										<span class="preview-value">{selectedBranchDetails.label}</span>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Error Message -->
			{#if switchError}
				<div class="switch-error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
					<span>{switchError}</span>
				</div>
			{/if}

			<!-- Footer -->
			<div class="modal-footer">
				<button class="btn btn-sm btn-ghost" onclick={onClose}> Cancel </button>
				<button
					class="btn btn-sm btn-primary"
					onclick={handleSwitchBranch}
					disabled={!selectedBranch || selectedBranch === currentBranch || isSwitching}
				>
					{#if isSwitching}
						<span class="loading loading-spinner loading-xs"></span>
						Switching...
					{:else}
						Switch Branch
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Dirty Tree Warning Modal -->
	{#if showDirtyWarning}
		<div class="warning-backdrop" onclick={cancelDirtySwitch} role="button" tabindex="-1">
			<div class="warning-modal" onclick={(e) => e.stopPropagation()} role="alertdialog">
				<div class="warning-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					</svg>
					<span>Uncommitted Changes</span>
				</div>
				<p class="warning-message">
					You have uncommitted changes that may be lost when switching branches.
					Are you sure you want to switch to <strong>{getBranchDisplayName(pendingBranch || '')}</strong>?
				</p>
				<div class="warning-actions">
					<button class="btn btn-sm btn-ghost" onclick={cancelDirtySwitch} disabled={isSwitching}>
						Cancel
					</button>
					<button class="btn btn-sm btn-warning" onclick={confirmDirtySwitch} disabled={isSwitching}>
						{#if isSwitching}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Switch Anyway
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 10vh;
		z-index: 50;
		animation: fade-in 0.15s ease;
	}

	.modal-content {
		width: 100%;
		max-width: 480px;
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.26 0.02 250);
		border-radius: 0.75rem;
		box-shadow:
			0 20px 60px oklch(0 0 0 / 0.4),
			0 0 0 1px oklch(0.30 0.02 250);
		animation: slide-down 0.2s ease;
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid oklch(0.24 0.02 250);
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.branch-icon {
		font-size: 1.125rem;
		color: oklch(0.65 0.15 145);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: oklch(0.55 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: oklch(0.22 0.02 250);
		color: oklch(0.80 0.02 250);
	}

	.close-btn svg {
		width: 16px;
		height: 16px;
	}

	/* Search */
	.search-container {
		position: relative;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.search-icon {
		position: absolute;
		left: 1.5rem;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		color: oklch(0.50 0.02 250);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem 0.5rem 2.25rem;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.26 0.02 250);
		border-radius: 0.5rem;
		color: oklch(0.90 0.02 250);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.search-input:focus {
		border-color: oklch(0.55 0.15 200);
	}

	.search-input::placeholder {
		color: oklch(0.45 0.02 250);
	}

	/* Body */
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 0;
		min-height: 200px;
	}

	/* Loading & Error */
	.loading-container,
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem 1rem;
		color: oklch(0.55 0.02 250);
		font-size: 0.875rem;
	}

	.error-text {
		color: oklch(0.65 0.15 25);
		margin: 0;
	}

	/* Branch Lists */
	.branch-lists {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.branch-section {
		padding: 0 1rem;
	}

	.section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.50 0.02 250);
		margin: 0 0 0.375rem 0;
		padding: 0 0.375rem;
	}

	.branch-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.branch-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.branch-item:hover {
		background: oklch(0.20 0.02 250);
	}

	.branch-item.selected {
		background: oklch(0.55 0.15 200 / 0.15);
		outline: 1px solid oklch(0.55 0.15 200 / 0.4);
	}

	.branch-item.current {
		background: oklch(0.55 0.12 145 / 0.12);
		cursor: default;
	}

	.branch-item.current:hover {
		background: oklch(0.55 0.12 145 / 0.12);
	}

	.branch-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.branch-name {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: oklch(0.85 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.branch-item.remote .branch-name {
		color: oklch(0.75 0.08 200);
	}

	.current-indicator {
		color: oklch(0.65 0.15 145);
		font-size: 0.75rem;
	}

	.branch-commit {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
	}

	.branch-label {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0.25 0.02 250);
		border-radius: 0.25rem;
		color: oklch(0.65 0.02 250);
	}

	/* No Results */
	.no-results {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		color: oklch(0.50 0.02 250);
		font-size: 0.875rem;
	}

	/* Preview Section */
	.preview-section {
		margin-top: 0.75rem;
		padding: 0 1rem;
	}

	.preview-content {
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.24 0.02 250);
		border-radius: 0.5rem;
		padding: 0.625rem 0.75rem;
	}

	.preview-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.8125rem;
	}

	.preview-label {
		color: oklch(0.55 0.02 250);
		min-width: 60px;
	}

	.preview-value {
		color: oklch(0.80 0.02 250);
	}

	.preview-value.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}

	/* Switch Error */
	.switch-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 1rem;
		padding: 0.5rem 0.75rem;
		background: oklch(0.50 0.12 25 / 0.15);
		border: 1px solid oklch(0.55 0.15 25 / 0.3);
		border-radius: 0.5rem;
		color: oklch(0.70 0.12 25);
		font-size: 0.8125rem;
	}

	.switch-error svg {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	/* Footer */
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid oklch(0.24 0.02 250);
	}

	/* Animations */
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slide-down {
		from {
			opacity: 0;
			transform: translateY(-16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Create Branch Section */
	.create-section {
		margin-top: 0.5rem;
		padding: 0 1rem;
		border-top: 1px solid oklch(0.22 0.02 250);
		padding-top: 0.75rem;
	}

	.create-branch-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		background: transparent;
		border: 1px dashed oklch(0.30 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.65 0.12 200);
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.create-branch-btn:hover {
		background: oklch(0.20 0.02 250);
		border-color: oklch(0.40 0.08 200);
	}

	.create-branch-btn svg {
		width: 14px;
		height: 14px;
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.create-input {
		width: 100%;
		padding: 0.5rem 0.625rem;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 0.375rem;
		color: oklch(0.90 0.02 250);
		font-size: 0.8125rem;
		font-family: ui-monospace, monospace;
	}

	.create-input:focus {
		outline: none;
		border-color: oklch(0.55 0.15 145);
	}

	.create-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.375rem;
	}

	.create-error {
		padding: 0.25rem 0;
		color: oklch(0.65 0.15 25);
		font-size: 0.75rem;
	}

	/* Warning Modal */
	.warning-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: oklch(0 0 0 / 0.7);
		z-index: 60;
	}

	.warning-modal {
		width: 320px;
		padding: 1rem;
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 0.625rem;
		box-shadow: 0 12px 32px oklch(0 0 0 / 0.5);
	}

	.warning-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		color: oklch(0.75 0.15 45);
		font-weight: 600;
	}

	.warning-header svg {
		width: 20px;
		height: 20px;
	}

	.warning-message {
		margin: 0 0 1rem;
		color: oklch(0.75 0.02 250);
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.warning-message strong {
		color: oklch(0.85 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.warning-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
