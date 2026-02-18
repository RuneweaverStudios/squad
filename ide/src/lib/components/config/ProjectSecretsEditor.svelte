<script lang="ts">
	/**
	 * Project Secrets Editor
	 *
	 * Manages per-project secrets like database URLs, Supabase keys, etc.
	 * Secrets are stored securely in ~/.config/squad/credentials.json
	 */

	import { onMount } from 'svelte';
	import { successToast, errorToast } from '$lib/stores/toasts.svelte';

	interface SecretType {
		id: string;
		name: string;
		description: string;
		placeholder: string;
		isUrl?: boolean;
	}

	interface MaskedSecret {
		masked: string;
		addedAt: string;
		isSet: boolean;
	}

	interface Props {
		projectKey: string;
	}

	let { projectKey }: Props = $props();

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let secrets = $state<Record<string, MaskedSecret>>({});
	let secretTypes = $state<SecretType[]>([]);

	// Edit modal state
	let editingSecret = $state<SecretType | null>(null);
	let editValue = $state('');
	let editError = $state<string | null>(null);
	let saving = $state(false);

	// Delete confirmation
	let deletingSecret = $state<string | null>(null);

	// Fetch secrets on mount and when project changes
	$effect(() => {
		if (projectKey) {
			fetchSecrets();
		}
	});

	async function fetchSecrets() {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/config/credentials/${encodeURIComponent(projectKey)}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to fetch secrets');
			}

			secrets = data.secrets || {};
			secretTypes = data.secretTypes || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load secrets';
			console.error('[ProjectSecrets] Error fetching:', err);
		} finally {
			loading = false;
		}
	}

	function openEditModal(secretType: SecretType) {
		editingSecret = secretType;
		editValue = '';
		editError = null;
	}

	function closeEditModal() {
		editingSecret = null;
		editValue = '';
		editError = null;
	}

	async function saveSecret() {
		if (!editingSecret || !editValue.trim()) {
			editError = 'Value is required';
			return;
		}

		saving = true;
		editError = null;

		try {
			const response = await fetch(`/api/config/credentials/${encodeURIComponent(projectKey)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					secretKey: editingSecret.id,
					value: editValue.trim()
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save secret');
			}

			secrets = data.secrets || {};
			successToast(`${editingSecret.name} saved`, 'Secret stored securely');
			closeEditModal();
		} catch (err) {
			editError = err instanceof Error ? err.message : 'Failed to save secret';
		} finally {
			saving = false;
		}
	}

	async function deleteSecret(secretKey: string) {
		try {
			const response = await fetch(
				`/api/config/credentials/${encodeURIComponent(projectKey)}?secretKey=${encodeURIComponent(secretKey)}`,
				{ method: 'DELETE' }
			);

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to delete secret');
			}

			secrets = data.secrets || {};
			const secretType = secretTypes.find((t) => t.id === secretKey);
			successToast(`${secretType?.name || secretKey} deleted`, 'Secret removed');
		} catch (err) {
			errorToast('Delete failed', err instanceof Error ? err.message : 'Unknown error');
		} finally {
			deletingSecret = null;
		}
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="project-secrets">
	<div class="secrets-header">
		<h4 class="secrets-title">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
				/>
			</svg>
			Project Secrets
		</h4>
		<span class="secrets-hint">Stored securely in ~/.config/squad/credentials.json</span>
	</div>

	{#if loading}
		<div class="secrets-loading">
			<span class="loading loading-spinner loading-sm"></span>
			<span>Loading secrets...</span>
		</div>
	{:else if error}
		<div class="secrets-error">
			<span>{error}</span>
			<button class="btn btn-xs btn-ghost" onclick={fetchSecrets}>Retry</button>
		</div>
	{:else}
		<div class="secrets-list">
			{#each secretTypes as secretType}
				{@const secret = secrets[secretType.id]}
				<div class="secret-item" class:is-set={secret?.isSet}>
					<div class="secret-info">
						<div class="secret-name">{secretType.name}</div>
						<div class="secret-description">{secretType.description}</div>
						{#if secret?.isSet}
							<div class="secret-value">
								<code>{secret.masked}</code>
								{#if secret.addedAt}
									<span class="secret-date">Added {formatDate(secret.addedAt)}</span>
								{/if}
							</div>
						{:else}
							<div class="secret-not-set">Not configured</div>
						{/if}
					</div>
					<div class="secret-actions">
						{#if secret?.isSet}
							<button
								class="btn btn-xs btn-ghost"
								onclick={() => openEditModal(secretType)}
								title="Update"
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
									/>
								</svg>
							</button>
							{#if deletingSecret === secretType.id}
								<div class="delete-confirm">
									<button
										class="btn btn-xs btn-error"
										onclick={() => deleteSecret(secretType.id)}
									>
										Delete
									</button>
									<button class="btn btn-xs btn-ghost" onclick={() => (deletingSecret = null)}>
										Cancel
									</button>
								</div>
							{:else}
								<button
									class="btn btn-xs btn-ghost text-error"
									onclick={() => (deletingSecret = secretType.id)}
									title="Delete"
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							{/if}
						{:else}
							<button class="btn btn-xs btn-primary" onclick={() => openEditModal(secretType)}>
								Add
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Edit Modal -->
{#if editingSecret}
	<div class="modal modal-open" role="dialog" aria-modal="true">
		<div class="modal-box max-w-md" style="background: oklch(0.18 0.02 250);">
			<h3 class="font-bold text-lg mb-4" style="color: oklch(0.90 0.02 250);">
				{secrets[editingSecret.id]?.isSet ? 'Update' : 'Add'} {editingSecret.name}
			</h3>

			<p class="text-sm mb-4" style="color: oklch(0.60 0.02 250);">
				{editingSecret.description}
			</p>

			<div class="form-control">
				<input
					type="password"
					class="input input-bordered w-full"
					placeholder={editingSecret.placeholder}
					bind:value={editValue}
					style="background: oklch(0.14 0.01 250); border-color: oklch(0.28 0.02 250); color: oklch(0.90 0.02 250);"
				/>
				{#if editError}
					<label class="label">
						<span class="label-text-alt text-error">{editError}</span>
					</label>
				{/if}
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeEditModal} disabled={saving}>Cancel</button>
				<button class="btn btn-primary" onclick={saveSecret} disabled={saving || !editValue.trim()}>
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeEditModal} aria-label="Close modal"></button>
	</div>
{/if}

<style>
	.project-secrets {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	.secrets-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.secrets-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0;
	}

	.secrets-hint {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
	}

	.secrets-loading,
	.secrets-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		font-size: 0.8rem;
		color: oklch(0.55 0.02 250);
		background: oklch(0.16 0.01 250);
		border-radius: 0.5rem;
	}

	.secrets-error {
		color: oklch(0.65 0.12 25);
		background: oklch(0.20 0.04 25 / 0.2);
	}

	.secrets-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.secret-item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 0.5rem;
		transition: all 0.15s ease;
	}

	.secret-item.is-set {
		border-color: oklch(0.35 0.08 145 / 0.5);
		background: oklch(0.18 0.02 145 / 0.1);
	}

	.secret-info {
		flex: 1;
		min-width: 0;
	}

	.secret-name {
		font-size: 0.85rem;
		font-weight: 500;
		color: oklch(0.85 0.02 250);
	}

	.secret-description {
		font-size: 0.7rem;
		color: oklch(0.50 0.02 250);
		margin-top: 0.125rem;
	}

	.secret-value {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.secret-value code {
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		background: oklch(0.14 0.01 250);
		border-radius: 0.25rem;
		color: oklch(0.70 0.08 145);
		font-family: ui-monospace, monospace;
	}

	.secret-date {
		font-size: 0.65rem;
		color: oklch(0.45 0.02 250);
	}

	.secret-not-set {
		font-size: 0.7rem;
		color: oklch(0.45 0.02 250);
		font-style: italic;
		margin-top: 0.375rem;
	}

	.secret-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.delete-confirm {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* Modal backdrop */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		cursor: pointer;
		border: none;
	}
</style>
