<script lang="ts">
	/**
	 * SupabasePanel - Supabase migrations panel for the Source Control page
	 *
	 * Shows:
	 * - Project link status with project ref
	 * - Schema diff button
	 * - New migration input
	 * - Push/Pull buttons
	 * - Migration timeline (local vs remote status)
	 */
	import { onMount } from 'svelte';

	interface Props {
		project: string;
		onMigrationSelect?: (content: string, title: string, filename: string, isDiff: boolean) => void;
	}

	interface MigrationStatus {
		version: string;
		name: string;
		filename: string;
		local: boolean;
		remote: boolean;
		status: 'synced' | 'local-only' | 'remote-only';
		timestamp?: string;
	}

	interface SupabaseStatus {
		hasSupabase: boolean;
		isLinked: boolean;
		projectRef?: string;
		cliInstalled: boolean;
		cliVersion: string | null;
		migrations: MigrationStatus[];
		stats: {
			total: number;
			synced: number;
			localOnly: number;
			remoteOnly: number;
			unpushed: number;
		};
		hint?: string;
		error?: string;
		projectPath?: string;
		supabasePath?: string;
	}

	let { project, onMigrationSelect }: Props = $props();

	// Status state
	let status = $state<SupabaseStatus | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Schema diff state
	let diffSql = $state<string | null>(null);
	let hasDiff = $state(false);
	let isLoadingDiff = $state(false);
	let diffError = $state<string | null>(null);
	let showDiff = $state(false);

	// New migration state
	let newMigrationName = $state('');
	let isCreatingMigration = $state(false);

	// Push/Pull state
	let isPushing = $state(false);
	let isPulling = $state(false);
	let includeSeed = $state(false);

	// Delete migration state
	let deletingMigration = $state<string | null>(null);
	let showDeleteConfirm = $state(false);
	let migrationToDelete = $state<MigrationStatus | null>(null);

	// Section collapse state
	let diffCollapsed = $state(false);
	let migrationsCollapsed = $state(false);
	let showSyncHelp = $state(false);

	// Toast state
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');

	function showToast(message: string, type: 'success' | 'error' = 'success') {
		toastMessage = message;
		toastType = type;
		// Log to console so user can see full message and copy it
		if (type === 'error') {
			console.error('[Supabase]', message);
		} else {
			console.log('[Supabase]', message);
		}
		setTimeout(() => {
			toastMessage = null;
		}, 4000);
	}

	/**
	 * Format version timestamp as readable date
	 */
	function formatVersion(version: string): string {
		// Version is typically: 20241114184005 (YYYYMMDDHHmmss)
		if (version.length === 14) {
			const year = version.slice(0, 4);
			const month = version.slice(4, 6);
			const day = version.slice(6, 8);
			const hour = version.slice(8, 10);
			const minute = version.slice(10, 12);
			return `${year}-${month}-${day} ${hour}:${minute}`;
		}
		return version;
	}

	/**
	 * Get status indicator for a migration
	 */
	function getStatusIndicator(migration: MigrationStatus): {
		icon: string;
		color: string;
		title: string;
	} {
		switch (migration.status) {
			case 'synced':
				return { icon: '●', color: 'oklch(0.65 0.18 145)', title: 'Synced' };
			case 'local-only':
				return { icon: '○', color: 'oklch(0.70 0.15 85)', title: 'Not pushed' };
			case 'remote-only':
				return { icon: '◐', color: 'oklch(0.65 0.15 200)', title: 'Remote only' };
			default:
				return { icon: '?', color: 'oklch(0.55 0.02 250)', title: 'Unknown' };
		}
	}

	/**
	 * Fetch Supabase status
	 */
	async function fetchStatus() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/supabase/status?project=${encodeURIComponent(project)}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to fetch status');
			}

			status = data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch status';
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Fetch schema diff
	 */
	async function fetchDiff() {
		isLoadingDiff = true;
		diffError = null;

		try {
			const response = await fetch(`/api/supabase/diff?project=${encodeURIComponent(project)}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to fetch diff');
			}

			hasDiff = data.hasDiff;
			diffSql = data.diffSql;
			showDiff = true;
		} catch (err) {
			diffError = err instanceof Error ? err.message : 'Failed to fetch diff';
		} finally {
			isLoadingDiff = false;
		}
	}

	/**
	 * Create new migration
	 */
	async function createMigration() {
		if (!newMigrationName.trim()) return;

		isCreatingMigration = true;

		try {
			const response = await fetch(`/api/supabase/migration/new?project=${encodeURIComponent(project)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newMigrationName.trim() })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to create migration');
			}

			showToast(`Created: ${data.filename}`);
			newMigrationName = '';
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to create migration', 'error');
		} finally {
			isCreatingMigration = false;
		}
	}

	/**
	 * Push migrations to remote
	 */
	async function pushMigrations() {
		isPushing = true;

		try {
			let url = `/api/supabase/push?project=${encodeURIComponent(project)}`;
			if (includeSeed) {
				url += '&includeSeed=true';
			}
			const response = await fetch(url, {
				method: 'POST'
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Push failed');
			}

			const message = includeSeed
				? 'Migrations and seed data pushed successfully'
				: 'Migrations pushed successfully';
			showToast(message);
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Push failed', 'error');
		} finally {
			isPushing = false;
		}
	}

	/**
	 * Pull schema from remote
	 */
	async function pullSchema() {
		isPulling = true;

		try {
			const response = await fetch(`/api/supabase/pull?project=${encodeURIComponent(project)}`, {
				method: 'POST'
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Pull failed');
			}

			showToast('Schema pulled successfully');
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Pull failed', 'error');
		} finally {
			isPulling = false;
		}
	}

	/**
	 * Show delete confirmation for a migration
	 */
	function confirmDeleteMigration(migration: MigrationStatus, event: MouseEvent) {
		event.stopPropagation(); // Prevent triggering the row click
		migrationToDelete = migration;
		showDeleteConfirm = true;
	}

	/**
	 * Cancel delete confirmation
	 */
	function cancelDelete() {
		showDeleteConfirm = false;
		migrationToDelete = null;
	}

	/**
	 * Delete a local-only migration
	 */
	async function deleteMigration() {
		if (!migrationToDelete || !status) return;

		deletingMigration = migrationToDelete.filename;

		try {
			const response = await fetch(`/api/supabase/migration/delete?project=${encodeURIComponent(project)}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: migrationToDelete.filename })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to delete migration');
			}

			showToast(`Deleted: ${migrationToDelete.filename}`);
			showDeleteConfirm = false;
			migrationToDelete = null;
			await fetchStatus();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to delete migration', 'error');
		} finally {
			deletingMigration = null;
		}
	}

	/**
	 * Handle migration click - fetch content and emit to parent
	 */
	async function handleMigrationClick(migration: MigrationStatus) {
		if (!migration.local || !onMigrationSelect || !status) {
			return;
		}

		try {
			// Calculate relative path from project root to migration file
			// For monorepos, supabasePath may be in a subdirectory (e.g., marketing/supabase)
			let migrationPath = `supabase/migrations/${migration.filename}`;

			if (status.projectPath && status.supabasePath) {
				// Get relative path from project to supabase folder
				const relativePath = status.supabasePath.replace(status.projectPath, '').replace(/^\//, '');
				if (relativePath) {
					migrationPath = `${relativePath}/migrations/${migration.filename}`;
				}
			}

			const response = await fetch(`/api/files/content?project=${encodeURIComponent(project)}&path=${encodeURIComponent(migrationPath)}`);

			if (!response.ok) {
				throw new Error('Failed to fetch migration content');
			}

			const data = await response.json();
			const title = migration.name || migration.filename;
			// Pass full migrationPath for saving, not just filename (handles monorepos)
			onMigrationSelect(data.content || '', title, migrationPath, false);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Failed to load migration', 'error');
		}
	}

	/**
	 * Show schema diff in the viewer
	 */
	function showDiffInViewer() {
		if (diffSql && onMigrationSelect) {
			onMigrationSelect(diffSql, 'Schema Diff', '', true);
		}
	}

	// Fetch status on mount and when project changes
	$effect(() => {
		if (project) {
			fetchStatus();
		}
	});
</script>

<div class="supabase-panel">
	{#if isLoading}
		<div class="panel-loading">
			<span class="loading loading-spinner loading-sm"></span>
			<span>Loading Supabase status...</span>
		</div>
	{:else if error}
		<div class="panel-error">
			<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
			<span>{error}</span>
			<button class="btn btn-ghost btn-xs" onclick={() => fetchStatus()}>Retry</button>
		</div>
	{:else if !status?.cliInstalled}
		<div class="panel-warning">
			<svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<div class="warning-content">
				<p class="warning-title">Supabase CLI not installed</p>
				<p class="warning-hint">Install it with: <code>npm install -g supabase</code></p>
			</div>
		</div>
	{:else if !status?.hasSupabase}
		<div class="panel-empty">
			<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
			</svg>
			<p class="empty-title">Supabase not initialized</p>
			<p class="empty-hint">Run <code>supabase init</code> in the project directory</p>
		</div>
	{:else}
		<!-- Project Status Header -->
		<div class="status-header">
			<div class="status-row">
				{#if status.isLinked}
					<span class="status-badge status-linked">
						<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						Linked
					</span>
					{#if status.projectRef}
						<span class="project-ref">{status.projectRef}</span>
					{/if}
				{:else}
					<span class="status-badge status-unlinked">
						<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
						</svg>
						Not linked
					</span>
				{/if}
				<button class="btn-refresh" onclick={() => fetchStatus()} title="Refresh">
					<svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</button>
			</div>
			{#if status.hint}
				<p class="status-hint">{status.hint}</p>
			{/if}
		</div>

		<!-- Schema Diff Section -->
		{#if status.isLinked}
			<div class="section">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="section-header" onclick={() => diffCollapsed = !diffCollapsed}>
					<svg class="chevron" class:collapsed={diffCollapsed} viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
					<span class="section-title">Schema Diff</span>
					{#if hasDiff}
						<span class="section-badge badge-warning">Changes</span>
					{/if}
					<button
						class="btn btn-xs btn-ghost section-action"
						onclick={(e) => { e.stopPropagation(); fetchDiff(); }}
						disabled={isLoadingDiff}
					>
						{#if isLoadingDiff}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							Check
						{/if}
					</button>
				</div>

				{#if !diffCollapsed}
					<div class="section-content">
						{#if diffError}
							<div class="diff-error">{diffError}</div>
						{:else if showDiff && !hasDiff}
							<div class="diff-clean">No schema differences detected</div>
						{:else if showDiff && hasDiff && diffSql}
							<div class="diff-preview">
								<pre class="diff-sql">{diffSql.slice(0, 300)}{diffSql.length > 300 ? '...' : ''}</pre>
								{#if onMigrationSelect}
									<button class="btn btn-xs btn-ghost diff-expand-btn" onclick={showDiffInViewer}>
										View Full Diff
									</button>
								{/if}
							</div>
						{:else}
							<div class="diff-hint">Click "Check" to compare local schema with remote</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- New Migration -->
		<div class="section">
			<div class="section-header static">
				<span class="section-title">New Migration</span>
			</div>
			<div class="section-content">
				<form class="new-migration-form" onsubmit={(e) => { e.preventDefault(); createMigration(); }}>
					<input
						type="text"
						class="input input-sm input-bordered flex-1"
						placeholder="migration_name"
						bind:value={newMigrationName}
						disabled={isCreatingMigration}
					/>
					<button
						type="submit"
						class="btn btn-sm btn-primary"
						disabled={!newMigrationName.trim() || isCreatingMigration}
					>
						{#if isCreatingMigration}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							Create
						{/if}
					</button>
				</form>
			</div>
		</div>

		<!-- Push/Pull Actions -->
		{#if status.isLinked}
			<div class="section">
				<div class="section-header static">
					<span class="section-title">Sync</span>
					{#if status.stats.unpushed > 0}
						<span class="section-badge badge-info">{status.stats.unpushed} unpushed</span>
					{/if}
				</div>
				<div class="section-content">
					<div class="sync-actions">
						<button
							class="btn btn-sm btn-outline flex-1"
							onclick={pullSchema}
							disabled={isPulling}
						>
							{#if isPulling}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
								</svg>
							{/if}
							Pull
						</button>
						<button
							class="btn btn-sm btn-primary flex-1"
							onclick={pushMigrations}
							disabled={isPushing || (status.stats.unpushed === 0 && !includeSeed)}
						>
							{#if isPushing}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
								</svg>
							{/if}
							{status.stats.unpushed === 0 && includeSeed ? 'Seed Only' : 'Push'}
						</button>
					</div>
					<div class="include-seed-row">
						<div class="include-seed-row-inner">
							<label class="include-seed-label">
								<input
									type="checkbox"
									class="checkbox checkbox-xs checkbox-primary"
									bind:checked={includeSeed}
								/>
								<span>Include seed data</span>
							</label>
							<button
								type="button"
								class="info-btn"
								onclick={() => showSyncHelp = !showSyncHelp}
								title="How sync works"
							>
								<svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</button>
						</div>
						{#if showSyncHelp}
							<div class="sync-help">
								<div class="sync-help-section">
									<strong>Pull</strong> — Downloads remote schema changes as a migration file.
								</div>
								<div class="sync-help-section">
									<strong>Push</strong> — Applies local migrations to remote. Only unpushed migrations run.
								</div>
								<div class="sync-help-section">
									<strong>Seed data</strong> — (Push only) Runs <code>seed.sql</code> after migrations. Check this when you need to insert initial or configuration data.
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Migrations Timeline -->
		<div class="section">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="section-header" onclick={() => migrationsCollapsed = !migrationsCollapsed}>
				<svg class="chevron" class:collapsed={migrationsCollapsed} viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
				<span class="section-title">Migrations</span>
				<span class="section-badge badge-ghost">{status.migrations.length}</span>
			</div>

			{#if !migrationsCollapsed}
				<div class="section-content">
					{#if status.migrations.length === 0}
						<div class="migrations-empty">No migrations yet</div>
					{:else}
						<div class="migrations-list">
							{#each status.migrations as migration, index (`${migration.version}-${migration.status}-${index}`)}
								{@const indicator = getStatusIndicator(migration)}
								{@const isLocalOnly = migration.status === 'local-only'}
								{@const isDeleting = deletingMigration === migration.filename}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<div
									class="migration-item"
									class:clickable={migration.local && onMigrationSelect}
									class:deleting={isDeleting}
									onclick={() => handleMigrationClick(migration)}
									role={migration.local ? 'button' : undefined}
								>
									<span
										class="migration-status"
										style="color: {indicator.color}"
										title={indicator.title}
									>
										{indicator.icon}
									</span>
									<div class="migration-info">
										<span class="migration-name" title={migration.filename}>
											{migration.name || migration.filename}
										</span>
										<span class="migration-version">{formatVersion(migration.version)}</span>
									</div>
									{#if isLocalOnly}
										<button
											class="delete-btn"
											onclick={(e) => confirmDeleteMigration(migration, e)}
											title="Delete migration"
											disabled={isDeleting}
										>
											{#if isDeleting}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											{/if}
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm && migrationToDelete}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="delete-modal-overlay" onclick={cancelDelete}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="delete-modal" onclick={(e) => e.stopPropagation()}>
				<div class="delete-modal-header">
					<svg class="delete-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<h3 class="delete-modal-title">Delete Migration?</h3>
				</div>
				<p class="delete-modal-text">
					Are you sure you want to delete <strong>{migrationToDelete.name || migrationToDelete.filename}</strong>?
				</p>
				<p class="delete-modal-warning">
					This will permanently remove the migration file from your local filesystem. This action cannot be undone.
				</p>
				<div class="delete-modal-actions">
					<button class="btn btn-sm btn-ghost" onclick={cancelDelete}>
						Cancel
					</button>
					<button class="btn btn-sm btn-error" onclick={deleteMigration} disabled={!!deletingMigration}>
						{#if deletingMigration}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Delete
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast -->
	{#if toastMessage}
		<div class="toast-container">
			<div class="toast" class:toast-success={toastType === 'success'} class:toast-error={toastType === 'error'}>
				{toastMessage}
			</div>
		</div>
	{/if}
</div>

<style>
	.supabase-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
		font-size: 0.8125rem;
		position: relative;
	}

	/* Loading & Error States */
	.panel-loading,
	.panel-error,
	.panel-warning,
	.panel-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem 1rem;
		text-align: center;
		color: oklch(0.55 0.02 250);
	}

	.panel-error {
		flex-direction: row;
		color: oklch(0.65 0.15 25);
	}

	.error-icon,
	.warning-icon,
	.empty-icon {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
	}

	.panel-warning {
		flex-direction: row;
		align-items: flex-start;
		padding: 1rem;
		background: oklch(0.70 0.15 85 / 0.1);
		border-radius: 0.5rem;
		margin: 0.5rem;
	}

	.warning-content {
		text-align: left;
	}

	.warning-title {
		color: oklch(0.70 0.15 85);
		font-weight: 500;
		margin: 0;
	}

	.warning-hint {
		color: oklch(0.55 0.02 250);
		font-size: 0.75rem;
		margin: 0.25rem 0 0;
	}

	.warning-hint code,
	.empty-hint code {
		background: oklch(0.20 0.01 250);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.75rem;
	}

	.panel-empty {
		padding: 3rem 1rem;
	}

	.empty-icon {
		width: 3rem;
		height: 3rem;
		margin-bottom: 0.5rem;
	}

	.empty-title {
		font-weight: 500;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.75rem;
		margin: 0.25rem 0 0;
	}

	/* Status Header */
	.status-header {
		padding: 0.75rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.status-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.6875rem;
		font-weight: 500;
	}

	.status-linked {
		background: oklch(0.65 0.15 145 / 0.2);
		color: oklch(0.70 0.18 145);
	}

	.status-unlinked {
		background: oklch(0.55 0.02 250 / 0.2);
		color: oklch(0.60 0.02 250);
	}

	.badge-icon {
		width: 0.875rem;
		height: 0.875rem;
	}

	.project-ref {
		font-family: monospace;
		font-size: 0.6875rem;
		color: oklch(0.55 0.02 250);
	}

	.btn-refresh {
		margin-left: auto;
		padding: 0.25rem;
		border-radius: 0.25rem;
		background: transparent;
		border: none;
		cursor: pointer;
		color: oklch(0.55 0.02 250);
		transition: all 0.15s ease;
	}

	.btn-refresh:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.75 0.02 250);
	}

	.refresh-icon {
		width: 1rem;
		height: 1rem;
	}

	.status-hint {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		margin: 0.5rem 0 0;
	}

	/* Sections */
	.section {
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.section:last-child {
		border-bottom: none;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		user-select: none;
		transition: background 0.15s ease;
	}

	.section-header:hover {
		background: oklch(0.18 0.01 250);
	}

	.section-header.static {
		cursor: default;
	}

	.section-header.static:hover {
		background: transparent;
	}

	.chevron {
		width: 1rem;
		height: 1rem;
		color: oklch(0.50 0.02 250);
		transition: transform 0.15s ease;
	}

	.chevron.collapsed {
		transform: rotate(-90deg);
	}

	.section-title {
		font-weight: 600;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: oklch(0.55 0.02 250);
	}

	.section-badge {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-weight: 500;
	}

	.badge-warning {
		background: oklch(0.70 0.15 85 / 0.2);
		color: oklch(0.75 0.18 85);
	}

	.badge-info {
		background: oklch(0.65 0.15 200 / 0.2);
		color: oklch(0.70 0.18 200);
	}

	.badge-ghost {
		background: oklch(0.25 0.02 250);
		color: oklch(0.60 0.02 250);
	}

	.section-action {
		margin-left: auto;
	}

	.section-content {
		padding: 0.5rem 0.75rem;
	}

	/* Schema Diff */
	.diff-error {
		padding: 0.5rem;
		background: oklch(0.65 0.15 25 / 0.1);
		border-radius: 0.375rem;
		color: oklch(0.70 0.18 25);
		font-size: 0.75rem;
	}

	.diff-clean {
		padding: 0.5rem;
		background: oklch(0.65 0.15 145 / 0.1);
		border-radius: 0.375rem;
		color: oklch(0.70 0.18 145);
		font-size: 0.75rem;
	}

	.diff-hint {
		padding: 0.5rem;
		color: oklch(0.50 0.02 250);
		font-size: 0.75rem;
		font-style: italic;
	}

	.diff-preview {
		max-height: 200px;
		overflow: auto;
		border-radius: 0.375rem;
		background: oklch(0.12 0.01 250);
		position: relative;
	}

	.diff-sql {
		margin: 0;
		padding: 0.75rem;
		font-family: monospace;
		font-size: 0.6875rem;
		white-space: pre-wrap;
		color: oklch(0.75 0.02 250);
	}

	.diff-expand-btn {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		background: oklch(0.20 0.01 250) !important;
		color: oklch(0.70 0.15 200);
	}

	.diff-expand-btn:hover {
		background: oklch(0.25 0.01 250) !important;
		color: oklch(0.80 0.15 200);
	}

	/* New Migration Form */
	.new-migration-form {
		display: flex;
		gap: 0.5rem;
	}

	/* Sync Actions */
	.sync-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-icon {
		width: 1rem;
		height: 1rem;
	}

	.include-seed-row {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-top: 0.5rem;
	}

	.include-seed-row-inner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.include-seed-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: oklch(0.60 0.02 250);
		cursor: pointer;
		user-select: none;
	}

	.include-seed-label:hover {
		color: oklch(0.75 0.02 250);
	}

	.include-seed-label span {
		line-height: 1;
	}

	/* Info Button */
	.info-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem;
		border: none;
		background: transparent;
		cursor: pointer;
		border-radius: 0.25rem;
		transition: all 0.15s ease;
	}

	.info-btn:hover {
		background: oklch(0.25 0.02 250);
	}

	.info-icon {
		width: 0.875rem;
		height: 0.875rem;
		color: oklch(0.50 0.02 250);
		transition: color 0.15s ease;
	}

	.info-btn:hover .info-icon {
		color: oklch(0.70 0.15 200);
	}

	/* Sync Help Panel */
	.sync-help {
		padding: 0.5rem;
		background: oklch(0.14 0.01 250);
		border: 1px solid oklch(0.24 0.02 250);
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		line-height: 1.4;
		color: oklch(0.65 0.02 250);
	}

	.sync-help-section {
		margin-bottom: 0.375rem;
	}

	.sync-help-section:last-of-type {
		margin-bottom: 0.5rem;
	}

	.sync-help-section strong {
		color: oklch(0.80 0.02 250);
	}

	.sync-help-section code,
	.sync-help-tip code {
		background: oklch(0.20 0.01 250);
		padding: 0.0625rem 0.25rem;
		border-radius: 0.1875rem;
		font-family: monospace;
		font-size: 0.625rem;
		color: oklch(0.72 0.12 200);
	}

	.sync-help-tip {
		padding-top: 0.375rem;
		border-top: 1px solid oklch(0.22 0.02 250);
		color: oklch(0.58 0.02 250);
	}

	.sync-help-tip strong {
		color: oklch(0.68 0.10 85);
	}

	/* Migrations List */
	.migrations-empty {
		padding: 1rem;
		text-align: center;
		color: oklch(0.50 0.02 250);
		font-style: italic;
	}

	.migrations-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.migration-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		border-radius: 0.25rem;
		transition: background 0.15s ease;
	}

	.migration-item.clickable {
		cursor: pointer;
	}

	.migration-item.clickable:hover {
		background: oklch(0.20 0.01 250);
	}

	.migration-status {
		font-size: 0.875rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.migration-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
	}

	.migration-name {
		font-weight: 500;
		color: oklch(0.80 0.02 250);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.migration-version {
		font-size: 0.6875rem;
		color: oklch(0.50 0.02 250);
		font-family: monospace;
	}

	/* Delete Button */
	.delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0.25rem;
		border-radius: 0.25rem;
		border: none;
		background: transparent;
		color: oklch(0.50 0.02 250);
		cursor: pointer;
		opacity: 0;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.delete-btn svg {
		width: 0.875rem;
		height: 0.875rem;
	}

	.migration-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: oklch(0.60 0.18 25 / 0.2);
		color: oklch(0.70 0.18 25);
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.migration-item.deleting {
		opacity: 0.5;
		pointer-events: none;
	}

	/* Delete Confirmation Modal */
	.delete-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: oklch(0 0 0 / 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fade-in 0.15s ease-out;
	}

	.delete-modal {
		background: oklch(0.18 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.75rem;
		padding: 1.25rem;
		max-width: 360px;
		width: calc(100% - 2rem);
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.4);
		animation: scale-in 0.15s ease-out;
	}

	.delete-modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.delete-modal-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: oklch(0.70 0.18 45);
		flex-shrink: 0;
	}

	.delete-modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.delete-modal-text {
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
		margin: 0 0 0.5rem;
		line-height: 1.4;
	}

	.delete-modal-text strong {
		color: oklch(0.85 0.02 250);
		font-weight: 600;
	}

	.delete-modal-warning {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin: 0 0 1rem;
		line-height: 1.4;
	}

	.delete-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes scale-in {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Toast */
	.toast-container {
		position: absolute;
		bottom: 1rem;
		left: 0.5rem;
		right: 0.5rem;
		z-index: 100;
	}

	.toast {
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.3);
		animation: toast-in 0.2s ease-out;
		word-break: break-word;
		line-height: 1.4;
	}

	.toast-success {
		background: oklch(0.65 0.15 145);
		color: oklch(0.98 0.02 145);
	}

	.toast-error {
		background: oklch(0.60 0.18 25);
		color: oklch(0.98 0.02 25);
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
