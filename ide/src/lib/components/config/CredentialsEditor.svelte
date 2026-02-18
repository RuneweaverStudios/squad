<script lang="ts">
	/**
	 * CredentialsEditor Component (Secret Vault)
	 *
	 * A general-purpose secret vault for managing API keys and credentials.
	 * Keys are stored securely in ~/.config/squad/credentials.json and displayed masked.
	 *
	 * Sections:
	 * - Provider Keys: Built-in AI provider API keys (Anthropic, Google, OpenAI)
	 *   with "Used by" indicators showing which IDE features depend on each key
	 * - Custom Secrets: User-defined keys for external services
	 *   accessible via `squad-secret <name>` or environment variables
	 *
	 * Features:
	 * - Add/edit/delete API keys
	 * - Verify keys work with provider
	 * - Masked display (sk-ant-...7x4k)
	 * - Provider documentation links
	 * - "Used by" badges for all configured keys
	 */

	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	// Types
	interface MaskedApiKeyEntry {
		masked: string;
		addedAt: string;
		lastVerified?: string;
		verificationError?: string;
		isSet: boolean;
	}

	interface ApiKeyProvider {
		id: string;
		name: string;
		description: string;
		keyPrefix: string;
		verifyUrl: string;
		usedBy: string[];
		docsUrl: string;
	}

	interface Credentials {
		apiKeys: {
			[key: string]: MaskedApiKeyEntry | undefined;
		};
	}

	interface CustomApiKey {
		masked: string;
		envVar: string;
		description?: string;
		addedAt: string;
		isSet: boolean;
	}

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let credentials = $state<Credentials | null>(null);
	let providers = $state<ApiKeyProvider[]>([]);

	// Edit modal state
	let editingProvider = $state<string | null>(null);
	let editingKey = $state('');
	let editingError = $state<string | null>(null);
	let isSaving = $state(false);
	let isVerifying = $state(false);
	let verifyOnSave = $state(true);

	// Delete confirmation state
	let deletingProvider = $state<string | null>(null);
	let isDeleting = $state(false);

	// Verification state (for re-verify button)
	let verifyingProvider = $state<string | null>(null);

	// Custom API keys state
	let customKeys = $state<{ [name: string]: CustomApiKey }>({});
	let showCustomKeyModal = $state(false);
	let editingCustomKey = $state<string | null>(null);
	let customKeyForm = $state({ name: '', value: '', envVar: '', description: '' });
	let customKeyError = $state<string | null>(null);
	let isSavingCustomKey = $state(false);
	let deletingCustomKey = $state<string | null>(null);
	let isDeletingCustomKey = $state(false);

	// Fetch credentials on mount
	onMount(() => {
		fetchCredentials();
		fetchCustomKeys();
	});

	async function fetchCustomKeys() {
		try {
			const response = await fetch('/api/config/credentials/custom');
			if (response.ok) {
				const data = await response.json();
				customKeys = data.customKeys || {};
			}
		} catch (err) {
			console.error('Error fetching custom keys:', err);
		}
	}

	async function fetchCredentials() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/config/credentials');
			if (!response.ok) {
				throw new Error('Failed to fetch credentials');
			}

			const data = await response.json();
			credentials = data.credentials;
			providers = data.providers || [];
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isLoading = false;
		}
	}

	function openEditModal(providerId: string) {
		editingProvider = providerId;
		editingKey = '';
		editingError = null;
		verifyOnSave = true;
	}

	function closeEditModal() {
		editingProvider = null;
		editingKey = '';
		editingError = null;
	}

	async function saveApiKey() {
		if (!editingProvider || !editingKey.trim()) {
			editingError = 'API key is required';
			return;
		}

		isSaving = true;
		editingError = null;

		try {
			const response = await fetch('/api/config/credentials', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					provider: editingProvider,
					key: editingKey.trim(),
					verify: verifyOnSave
				})
			});

			const data = await response.json();

			if (!response.ok) {
				editingError = data.error || 'Failed to save API key';
				return;
			}

			// Update credentials
			credentials = data.credentials;

			// Show verification result
			if (verifyOnSave && !data.verified) {
				editingError = `Key saved but verification failed: ${data.verificationError}`;
				// Don't close modal so user can see the error
				return;
			}

			closeEditModal();
		} catch (err) {
			editingError = (err as Error).message;
		} finally {
			isSaving = false;
		}
	}

	function openDeleteConfirm(providerId: string) {
		deletingProvider = providerId;
	}

	function closeDeleteConfirm() {
		deletingProvider = null;
	}

	async function deleteApiKey() {
		if (!deletingProvider) return;

		isDeleting = true;

		try {
			const response = await fetch(
				`/api/config/credentials?provider=${encodeURIComponent(deletingProvider)}`,
				{ method: 'DELETE' }
			);

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to delete API key';
				return;
			}

			credentials = data.credentials;
			closeDeleteConfirm();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isDeleting = false;
		}
	}

	async function verifyExistingKey(providerId: string) {
		verifyingProvider = providerId;

		try {
			const response = await fetch('/api/config/credentials', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider: providerId })
			});

			const data = await response.json();

			if (response.ok) {
				credentials = data.credentials;
			}
		} catch (err) {
			console.error('Verification error:', err);
		} finally {
			verifyingProvider = null;
		}
	}

	// Custom API key functions
	function openCustomKeyModal(keyName: string | null = null) {
		editingCustomKey = keyName;
		if (keyName && customKeys[keyName]) {
			customKeyForm = {
				name: keyName,
				value: '', // Don't show existing value
				envVar: customKeys[keyName].envVar,
				description: customKeys[keyName].description || ''
			};
		} else {
			customKeyForm = { name: '', value: '', envVar: '', description: '' };
		}
		customKeyError = null;
		showCustomKeyModal = true;
	}

	function closeCustomKeyModal() {
		showCustomKeyModal = false;
		editingCustomKey = null;
		customKeyForm = { name: '', value: '', envVar: '', description: '' };
		customKeyError = null;
	}

	async function saveCustomKey() {
		if (!customKeyForm.name.trim()) {
			customKeyError = 'Name is required';
			return;
		}
		if (!customKeyForm.value.trim() && !editingCustomKey) {
			customKeyError = 'API key value is required';
			return;
		}
		if (!customKeyForm.envVar.trim()) {
			customKeyError = 'Environment variable name is required';
			return;
		}

		isSavingCustomKey = true;
		customKeyError = null;

		try {
			const response = await fetch('/api/config/credentials/custom', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: customKeyForm.name.trim(),
					value: customKeyForm.value.trim() || (editingCustomKey ? undefined : ''),
					envVar: customKeyForm.envVar.trim(),
					description: customKeyForm.description.trim() || undefined
				})
			});

			const data = await response.json();

			if (!response.ok) {
				customKeyError = data.error || 'Failed to save custom key';
				return;
			}

			customKeys = data.customKeys || {};
			closeCustomKeyModal();
		} catch (err) {
			customKeyError = (err as Error).message;
		} finally {
			isSavingCustomKey = false;
		}
	}

	function openDeleteCustomKeyConfirm(keyName: string) {
		deletingCustomKey = keyName;
	}

	function closeDeleteCustomKeyConfirm() {
		deletingCustomKey = null;
	}

	async function deleteCustomKey() {
		if (!deletingCustomKey) return;

		isDeletingCustomKey = true;

		try {
			const response = await fetch(
				`/api/config/credentials/custom?name=${encodeURIComponent(deletingCustomKey)}`,
				{ method: 'DELETE' }
			);

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to delete custom key';
				return;
			}

			customKeys = data.customKeys || {};
			closeDeleteCustomKeyConfirm();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			isDeletingCustomKey = false;
		}
	}

	// Auto-generate env var name from key name
	function suggestEnvVar(name: string): string {
		return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY';
	}

	function formatDate(isoString: string): string {
		if (!isoString) return '';
		const date = new Date(isoString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getProviderInfo(providerId: string): ApiKeyProvider | undefined {
		return providers.find((p) => p.id === providerId);
	}

	// Get the editing provider info
	let editingProviderInfo = $derived(
		editingProvider ? getProviderInfo(editingProvider) : null
	);
</script>

<div class="credentials-editor">
	<div class="section-header">
		<h2>Secret Vault</h2>
		<p class="section-description">
			Securely store API keys and credentials. All secrets are encrypted at rest in
			<code>~/.config/squad/credentials.json</code>
		</p>
	</div>

	<!-- Provider Keys Section Header -->
	<div class="section-subheader">
		<h3>Provider Keys</h3>
		<p class="section-subdescription">API keys for AI providers used by IDE features</p>
	</div>

	{#if isLoading}
		<div class="loading">
			<span class="loading-spinner"></span>
			Loading credentials...
		</div>
	{:else if error}
		<div class="error-banner">
			<span>{error}</span>
			<button class="btn btn-sm" onclick={() => fetchCredentials()}>Retry</button>
		</div>
	{:else if credentials}
		<div class="providers-list">
			{#each providers as provider}
				{@const keyEntry = credentials.apiKeys[provider.id]}
				<div class="provider-card" class:configured={keyEntry?.isSet}>
					<div class="provider-header">
						<div class="provider-info">
							<h3 class="provider-name">{provider.name}</h3>
							<p class="provider-description">{provider.description}</p>
						</div>
						<div class="provider-status">
							{#if keyEntry?.isSet}
								<span class="status-badge configured">Configured</span>
							{:else}
								<span class="status-badge not-configured">Not configured</span>
							{/if}
						</div>
					</div>

					<!-- Always show Used by indicator -->
					<div class="used-by">
						<span class="used-by-label">Used by:</span>
						<div class="used-by-badges">
							{#each provider.usedBy as feature}
								<span class="used-by-badge">{feature}</span>
							{/each}
						</div>
					</div>

					{#if keyEntry?.isSet}
						<div class="key-details">
							<div class="key-row">
								<span class="key-label">Key:</span>
								<code class="key-value">{keyEntry.masked}</code>
							</div>
							{#if keyEntry.addedAt}
								<div class="key-row">
									<span class="key-label">Added:</span>
									<span class="key-date">{formatDate(keyEntry.addedAt)}</span>
								</div>
							{/if}
							{#if keyEntry.lastVerified}
								<div class="key-row">
									<span class="key-label">Verified:</span>
									<span class="key-date verified">{formatDate(keyEntry.lastVerified)}</span>
								</div>
							{:else if keyEntry.verificationError}
								<div class="key-row error">
									<span class="key-label">Error:</span>
									<span class="key-error">{keyEntry.verificationError}</span>
								</div>
							{/if}
						</div>

						<div class="provider-actions">
							<button
								class="btn btn-sm btn-ghost"
								onclick={() => verifyExistingKey(provider.id)}
								disabled={verifyingProvider === provider.id}
							>
								{#if verifyingProvider === provider.id}
									<span class="loading-spinner small"></span>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
										<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
								{/if}
								Verify
							</button>
							<button
								class="btn btn-sm btn-ghost"
								onclick={() => openEditModal(provider.id)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
								</svg>
								Edit
							</button>
							<button
								class="btn btn-sm btn-ghost btn-error"
								onclick={() => openDeleteConfirm(provider.id)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
									<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
								</svg>
								Delete
							</button>
						</div>
					{:else}
						<div class="provider-actions">
							<button
								class="btn btn-sm btn-primary"
								onclick={() => openEditModal(provider.id)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
								</svg>
								Add Key
							</button>
							<a
								href={provider.docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="btn btn-sm btn-ghost"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
								</svg>
								Get API Key
							</a>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Custom API Keys Section -->
		<div class="custom-keys-section">
			<div class="section-subheader">
				<h3>Custom Secrets</h3>
				<p class="section-subdescription">
					Store additional API keys and credentials. Access via <code>squad-secret &lt;name&gt;</code> or environment variables.
				</p>
			</div>

			{#if Object.keys(customKeys).length > 0}
				<div class="custom-keys-list">
					{#each Object.entries(customKeys) as [keyName, keyData]}
						<div class="custom-key-card">
							<div class="custom-key-header">
								<div class="custom-key-info">
									<h4 class="custom-key-name">{keyName}</h4>
									<code class="custom-key-env">${keyData.envVar}</code>
								</div>
								<span class="status-badge configured">Configured</span>
							</div>

							{#if keyData.description}
								<p class="custom-key-description">{keyData.description}</p>
							{/if}

							<div class="key-details">
								<div class="key-row">
									<span class="key-label">Value:</span>
									<code class="key-value">{keyData.masked}</code>
								</div>
								{#if keyData.addedAt}
									<div class="key-row">
										<span class="key-label">Added:</span>
										<span class="key-date">{formatDate(keyData.addedAt)}</span>
									</div>
								{/if}
							</div>

							<div class="provider-actions">
								<button
									class="btn btn-sm btn-ghost"
									onclick={() => openCustomKeyModal(keyName)}
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
										<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
									</svg>
									Edit
								</button>
								<button
									class="btn btn-sm btn-ghost btn-error"
									onclick={() => openDeleteCustomKeyConfirm(keyName)}
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
										<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
									</svg>
									Delete
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="no-custom-keys">No custom keys configured yet.</p>
			{/if}

			<button
				class="btn btn-sm btn-outline add-custom-key-btn"
				onclick={() => openCustomKeyModal(null)}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
				Add Custom Key
			</button>
		</div>
	{/if}
</div>

<!-- Edit Modal -->
{#if editingProvider && editingProviderInfo}
	<div class="modal-overlay" onclick={closeEditModal} transition:fade={{ duration: 150 }}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{credentials?.apiKeys[editingProvider]?.isSet ? 'Update' : 'Add'} {editingProviderInfo.name} API Key</h3>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={closeEditModal}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<p class="modal-description">{editingProviderInfo.description}</p>

				<div class="form-group">
					<label for="api-key">API Key</label>
					<input
						type="password"
						id="api-key"
						class="input input-bordered w-full"
						placeholder={`${editingProviderInfo.keyPrefix}...`}
						bind:value={editingKey}
						onkeydown={(e) => e.key === 'Enter' && saveApiKey()}
					/>
					<p class="form-hint">
						Get your API key from
						<a href={editingProviderInfo.docsUrl} target="_blank" rel="noopener noreferrer">
							{editingProviderInfo.docsUrl.replace('https://', '')}
						</a>
					</p>
				</div>

				<div class="form-group checkbox-group">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={verifyOnSave} />
						<span>Verify key before saving</span>
					</label>
				</div>

				{#if editingError}
					<div class="error-message">{editingError}</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={closeEditModal}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={saveApiKey}
					disabled={isSaving || !editingKey.trim()}
				>
					{#if isSaving}
						<span class="loading-spinner small"></span>
						{verifyOnSave ? 'Verifying...' : 'Saving...'}
					{:else}
						Save
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deletingProvider}
	{@const providerInfo = getProviderInfo(deletingProvider)}
	<div class="modal-overlay" onclick={closeDeleteConfirm} transition:fade={{ duration: 150 }}>
		<div class="modal-content modal-sm" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Delete API Key</h3>
			</div>

			<div class="modal-body">
				<p>
					Are you sure you want to delete the <strong>{providerInfo?.name}</strong> API key?
					Features that use this key will stop working.
				</p>
			</div>

			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={closeDeleteConfirm}>Cancel</button>
				<button
					class="btn btn-error"
					onclick={deleteApiKey}
					disabled={isDeleting}
				>
					{#if isDeleting}
						<span class="loading-spinner small"></span>
						Deleting...
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Custom Key Edit Modal -->
{#if showCustomKeyModal}
	{@const isEditing = editingCustomKey !== null}
	<div class="modal-overlay" onclick={closeCustomKeyModal} transition:fade={{ duration: 150 }}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{isEditing ? 'Edit' : 'Add'} Custom API Key</h3>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={closeCustomKeyModal}>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<div class="form-group">
					<label for="custom-key-name">Name</label>
					<input
						type="text"
						id="custom-key-name"
						class="input input-bordered w-full"
						placeholder="my-service"
						bind:value={customKeyForm.name}
						disabled={isEditing}
						oninput={() => {
							if (!isEditing && customKeyForm.name && !customKeyForm.envVar) {
								customKeyForm.envVar = suggestEnvVar(customKeyForm.name);
							}
						}}
					/>
					<p class="form-hint">Used with <code>squad-secret {customKeyForm.name || 'name'}</code></p>
				</div>

				<div class="form-group">
					<label for="custom-key-value">API Key Value</label>
					<input
						type="password"
						id="custom-key-value"
						class="input input-bordered w-full"
						placeholder={isEditing ? '(leave blank to keep current)' : 'your-secret-key'}
						bind:value={customKeyForm.value}
					/>
				</div>

				<div class="form-group">
					<label for="custom-key-env">Environment Variable</label>
					<input
						type="text"
						id="custom-key-env"
						class="input input-bordered w-full"
						placeholder="MY_SERVICE_API_KEY"
						bind:value={customKeyForm.envVar}
					/>
					<p class="form-hint">Must be uppercase with underscores (e.g., STRIPE_API_KEY)</p>
				</div>

				<div class="form-group">
					<label for="custom-key-description">Description (optional)</label>
					<input
						type="text"
						id="custom-key-description"
						class="input input-bordered w-full"
						placeholder="API key for my service"
						bind:value={customKeyForm.description}
					/>
				</div>

				{#if customKeyError}
					<div class="error-message">{customKeyError}</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={closeCustomKeyModal}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={saveCustomKey}
					disabled={isSavingCustomKey || !customKeyForm.name.trim() || !customKeyForm.envVar.trim() || (!isEditing && !customKeyForm.value.trim())}
				>
					{#if isSavingCustomKey}
						<span class="loading-spinner small"></span>
						Saving...
					{:else}
						Save
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Custom Key Confirmation Modal -->
{#if deletingCustomKey}
	<div class="modal-overlay" onclick={closeDeleteCustomKeyConfirm} transition:fade={{ duration: 150 }}>
		<div class="modal-content modal-sm" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Delete Custom Key</h3>
			</div>

			<div class="modal-body">
				<p>
					Are you sure you want to delete the <strong>{deletingCustomKey}</strong> custom key?
					Any scripts or hooks using this key will stop working.
				</p>
			</div>

			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={closeDeleteCustomKeyConfirm}>Cancel</button>
				<button
					class="btn btn-error"
					onclick={deleteCustomKey}
					disabled={isDeletingCustomKey}
				>
					{#if isDeletingCustomKey}
						<span class="loading-spinner small"></span>
						Deleting...
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.credentials-editor {
		padding: 1rem;
	}

	.section-header {
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.5rem 0;
	}

	.section-description {
		font-size: 0.875rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.section-description code {
		background: oklch(0.20 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.section-subheader {
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.section-subheader h3 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.85 0.02 250);
		margin: 0 0 0.25rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section-subheader h3::before {
		content: '';
		display: inline-block;
		width: 3px;
		height: 1rem;
		background: oklch(0.55 0.15 200);
		border-radius: 2px;
	}

	.section-subdescription {
		font-size: 0.8125rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		padding-left: 0.875rem;
	}

	.section-subdescription code {
		background: oklch(0.20 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.loading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem;
		color: oklch(0.60 0.02 250);
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid oklch(0.30 0.02 250);
		border-top-color: oklch(0.70 0.15 200);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.loading-spinner.small {
		width: 14px;
		height: 14px;
		border-width: 1.5px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: oklch(0.25 0.08 30);
		border: 1px solid oklch(0.40 0.12 30);
		border-radius: 8px;
		color: oklch(0.85 0.10 30);
	}

	.providers-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.provider-card {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 12px;
		padding: 1rem;
	}

	.provider-card.configured {
		border-color: oklch(0.35 0.10 145);
	}

	.provider-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.provider-name {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.25rem 0;
	}

	.provider-description {
		font-size: 0.8125rem;
		color: oklch(0.60 0.02 250);
		margin: 0;
	}

	.status-badge {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		font-weight: 500;
	}

	.status-badge.configured {
		background: oklch(0.30 0.10 145);
		color: oklch(0.85 0.12 145);
	}

	.status-badge.not-configured {
		background: oklch(0.25 0.02 250);
		color: oklch(0.60 0.02 250);
	}

	.key-details {
		background: oklch(0.12 0.01 250);
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.key-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
	}

	.key-row + .key-row {
		margin-top: 0.375rem;
	}

	.key-row.error {
		color: oklch(0.75 0.15 30);
	}

	.key-label {
		color: oklch(0.55 0.02 250);
		min-width: 60px;
	}

	.key-value {
		font-family: ui-monospace, monospace;
		color: oklch(0.80 0.02 250);
		background: oklch(0.18 0.02 250);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}

	.key-date {
		color: oklch(0.70 0.02 250);
	}

	.key-date.verified {
		color: oklch(0.75 0.12 145);
	}

	.key-error {
		color: oklch(0.75 0.15 30);
	}

	.used-by {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.used-by-label {
		font-size: 0.75rem;
		color: oklch(0.50 0.02 250);
		font-weight: 500;
		flex-shrink: 0;
		padding-top: 0.125rem;
	}

	.used-by-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.used-by-badge {
		font-size: 0.7rem;
		padding: 0.125rem 0.5rem;
		background: oklch(0.22 0.04 200);
		color: oklch(0.75 0.08 200);
		border-radius: 9999px;
		font-weight: 500;
		white-space: nowrap;
	}

	.provider-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.btn-sm {
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
	}

	.btn-primary {
		background: oklch(0.55 0.15 200);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: oklch(0.60 0.15 200);
	}

	.btn-ghost {
		background: transparent;
		color: oklch(0.70 0.02 250);
	}

	.btn-ghost:hover:not(:disabled) {
		background: oklch(0.22 0.02 250);
	}

	.btn-error {
		color: oklch(0.80 0.15 30);
	}

	.btn-error:hover:not(:disabled) {
		background: oklch(0.30 0.10 30);
	}

	.btn-circle {
		padding: 0.375rem;
		border-radius: 50%;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.icon {
		width: 16px;
		height: 16px;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 1rem;
	}

	.modal-content {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 12px;
		width: 100%;
		max-width: 480px;
		box-shadow: 0 20px 40px oklch(0 0 0 / 0.3);
	}

	.modal-sm {
		max-width: 360px;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.modal-header h3 {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.modal-body {
		padding: 1.25rem;
	}

	.modal-description {
		font-size: 0.875rem;
		color: oklch(0.65 0.02 250);
		margin: 0 0 1rem 0;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: oklch(0.75 0.02 250);
		margin-bottom: 0.375rem;
	}

	.input {
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: oklch(0.12 0.01 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		color: oklch(0.90 0.02 250);
		font-size: 0.875rem;
		font-family: ui-monospace, monospace;
	}

	.input:focus {
		outline: none;
		border-color: oklch(0.55 0.15 200);
	}

	.form-hint {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin-top: 0.375rem;
	}

	.form-hint a {
		color: oklch(0.70 0.12 200);
		text-decoration: none;
	}

	.form-hint a:hover {
		text-decoration: underline;
	}

	.checkbox-group {
		margin-bottom: 0;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.checkbox-label input {
		width: 16px;
		height: 16px;
		accent-color: oklch(0.55 0.15 200);
	}

	.checkbox-label span {
		font-size: 0.8125rem;
		color: oklch(0.70 0.02 250);
	}

	.error-message {
		padding: 0.625rem 0.75rem;
		background: oklch(0.25 0.08 30);
		border: 1px solid oklch(0.40 0.12 30);
		border-radius: 6px;
		color: oklch(0.85 0.10 30);
		font-size: 0.8125rem;
		margin-top: 1rem;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	/* Custom Keys Section */
	.custom-keys-section {
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 2px solid oklch(0.22 0.02 250);
	}

	.custom-keys-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.custom-key-card {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.30 0.08 280);
		border-radius: 10px;
		padding: 0.875rem;
	}

	.custom-key-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.custom-key-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.custom-key-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0;
	}

	.custom-key-env {
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		background: oklch(0.22 0.04 280);
		color: oklch(0.75 0.10 280);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}

	.custom-key-description {
		font-size: 0.8125rem;
		color: oklch(0.60 0.02 250);
		margin: 0 0 0.5rem 0;
	}

	.no-custom-keys {
		font-size: 0.875rem;
		color: oklch(0.55 0.02 250);
		text-align: center;
		padding: 1.5rem;
		background: oklch(0.14 0.01 250);
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.add-custom-key-btn {
		width: 100%;
	}

	.btn-outline {
		background: transparent;
		border: 1px dashed oklch(0.35 0.02 250);
		color: oklch(0.65 0.02 250);
	}

	.btn-outline:hover:not(:disabled) {
		border-color: oklch(0.50 0.10 200);
		color: oklch(0.75 0.10 200);
		background: oklch(0.18 0.02 250);
	}
</style>
