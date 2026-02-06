<script lang="ts">
	/**
	 * McpConfigEditor Component
	 *
	 * Displays and edits MCP server configuration from .mcp.json files.
	 * Supports both stdio and HTTP transport servers.
	 *
	 * Features:
	 * - List all configured MCP servers
	 * - Add new servers (stdio or http)
	 * - Edit existing servers
	 * - Delete servers
	 * - JSON validation
	 *
	 * @see ide/src/lib/types/config.ts for MCP types
	 * @see ide/src/routes/api/mcp/+server.ts for API
	 */

	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type {
		McpConfigFile,
		McpServerConfig,
		McpServerStdio,
		McpServerHttp,
		ProjectConfig
	} from '$lib/types/config';
	import { isMcpServerHttp, isMcpServerStdio } from '$lib/types/config';
	import { getProjects } from '$lib/stores/configStore.svelte';
	import ProjectSelector from '$lib/components/ProjectSelector.svelte';

	interface Props {
		/** Custom class */
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	// Project selection
	const projects = $derived(getProjects());
	const projectNames = $derived(projects.map((p) => p.name));
	let selectedProjectName = $state('All Projects');
	let selectedProjectPath = $derived.by(() => {
		if (selectedProjectName === 'All Projects') return '';
		const found = projects.find((p) => p.name === selectedProjectName);
		return found?.path ?? '';
	});

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let config = $state<McpConfigFile>({ mcpServers: {} });
	let configPath = $state('');
	let fileExists = $state(false);

	// Editor state
	let isEditing = $state(false);
	let editingServerName = $state<string | null>(null);
	let showAddForm = $state(false);

	// Form state for add/edit
	let formServerName = $state('');
	let formTransportType = $state<'stdio' | 'http'>('stdio');
	let formCommand = $state('');
	let formArgs = $state('');
	let formEnvPairs = $state<Array<{ key: string; value: string }>>([]);
	let formUrl = $state('');
	let formHeaders = $state<Array<{ key: string; value: string }>>([]);
	let formTimeout = $state('');
	let formDisabled = $state(false);
	let formError = $state<string | null>(null);
	let isSaving = $state(false);

	// Load MCP config
	async function loadConfig() {
		isLoading = true;
		error = null;

		try {
			const url = selectedProjectPath
				? `/api/mcp?project=${encodeURIComponent(selectedProjectPath)}`
				: '/api/mcp';
			const response = await fetch(url);
			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || 'Failed to load MCP configuration');
			}

			config = data.config;
			configPath = data.path;
			fileExists = data.exists;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}

	// Reload when project changes
	$effect(() => {
		if (selectedProjectPath) {
			loadConfig();
		}
	});

	// Save config
	async function saveConfig() {
		isSaving = true;
		error = null;

		try {
			const url = selectedProjectPath
				? `/api/mcp?project=${encodeURIComponent(selectedProjectPath)}`
				: '/api/mcp';
			const response = await fetch(url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});

			const data = await response.json();
			if (!data.success) {
				throw new Error(data.error || 'Failed to save MCP configuration');
			}

			fileExists = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isSaving = false;
		}
	}

	// Delete a server
	async function deleteServer(name: string) {
		if (!confirm(`Delete MCP server "${name}"?`)) return;

		try {
			const url = selectedProjectPath
				? `/api/mcp?project=${encodeURIComponent(selectedProjectPath)}&server=${encodeURIComponent(name)}`
				: `/api/mcp?server=${encodeURIComponent(name)}`;

			const response = await fetch(url, { method: 'DELETE' });
			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || 'Failed to delete server');
			}

			// Remove from local state
			delete config.mcpServers[name];
			config = { ...config };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		}
	}

	// Reset form
	function resetForm() {
		formServerName = '';
		formTransportType = 'stdio';
		formCommand = '';
		formArgs = '';
		formEnvPairs = [];
		formUrl = '';
		formHeaders = [];
		formTimeout = '';
		formDisabled = false;
		formError = null;
		editingServerName = null;
	}

	// Open add form
	function openAddForm() {
		resetForm();
		showAddForm = true;
	}

	// Open edit form
	function openEditForm(name: string) {
		const server = config.mcpServers[name];
		if (!server) return;

		resetForm();
		formServerName = name;
		editingServerName = name;

		if (isMcpServerHttp(server)) {
			formTransportType = 'http';
			formUrl = server.url;
			formHeaders = server.headers
				? Object.entries(server.headers).map(([key, value]) => ({ key, value }))
				: [];
		} else if (isMcpServerStdio(server)) {
			formTransportType = 'stdio';
			formCommand = server.command;
			formArgs = server.args?.join(' ') || '';
			formEnvPairs = server.env
				? Object.entries(server.env).map(([key, value]) => ({ key, value }))
				: [];
		}

		formTimeout = server.timeout?.toString() || '';
		formDisabled = server.disabled || false;
		showAddForm = true;
	}

	// Close form
	function closeForm() {
		showAddForm = false;
		resetForm();
	}

	// Add environment pair
	function addEnvPair() {
		formEnvPairs = [...formEnvPairs, { key: '', value: '' }];
	}

	// Remove environment pair
	function removeEnvPair(index: number) {
		formEnvPairs = formEnvPairs.filter((_, i) => i !== index);
	}

	// Add header pair
	function addHeaderPair() {
		formHeaders = [...formHeaders, { key: '', value: '' }];
	}

	// Remove header pair
	function removeHeaderPair(index: number) {
		formHeaders = formHeaders.filter((_, i) => i !== index);
	}

	// Validate and save form
	async function saveForm() {
		formError = null;

		// Validate server name
		if (!formServerName.trim()) {
			formError = 'Server name is required';
			return;
		}

		// Check for duplicate name (only when adding new)
		if (!editingServerName && config.mcpServers[formServerName.trim()]) {
			formError = 'A server with this name already exists';
			return;
		}

		let serverConfig: McpServerConfig;

		if (formTransportType === 'http') {
			// Validate URL
			if (!formUrl.trim()) {
				formError = 'URL is required for HTTP servers';
				return;
			}

			const httpConfig: McpServerHttp = {
				type: 'http',
				url: formUrl.trim()
			};

			// Add optional headers
			const headers = formHeaders.filter((h) => h.key.trim());
			if (headers.length > 0) {
				httpConfig.headers = Object.fromEntries(headers.map((h) => [h.key.trim(), h.value]));
			}

			// Add optional timeout
			if (formTimeout.trim()) {
				const timeout = parseInt(formTimeout, 10);
				if (isNaN(timeout) || timeout < 0) {
					formError = 'Timeout must be a positive number';
					return;
				}
				httpConfig.timeout = timeout;
			}

			if (formDisabled) {
				httpConfig.disabled = true;
			}

			serverConfig = httpConfig;
		} else {
			// Validate command
			if (!formCommand.trim()) {
				formError = 'Command is required for stdio servers';
				return;
			}

			const stdioConfig: McpServerStdio = {
				command: formCommand.trim()
			};

			// Add optional args
			if (formArgs.trim()) {
				stdioConfig.args = formArgs
					.trim()
					.split(/\s+/)
					.filter((a) => a);
			}

			// Add optional env
			const env = formEnvPairs.filter((e) => e.key.trim());
			if (env.length > 0) {
				stdioConfig.env = Object.fromEntries(env.map((e) => [e.key.trim(), e.value]));
			}

			// Add optional timeout
			if (formTimeout.trim()) {
				const timeout = parseInt(formTimeout, 10);
				if (isNaN(timeout) || timeout < 0) {
					formError = 'Timeout must be a positive number';
					return;
				}
				stdioConfig.timeout = timeout;
			}

			if (formDisabled) {
				stdioConfig.disabled = true;
			}

			serverConfig = stdioConfig;
		}

		// If editing and name changed, remove old entry
		if (editingServerName && editingServerName !== formServerName.trim()) {
			delete config.mcpServers[editingServerName];
		}

		// Update config
		config.mcpServers[formServerName.trim()] = serverConfig;
		config = { ...config };

		// Save to file
		await saveConfig();

		if (!error) {
			closeForm();
		}
	}

	// Get server count
	const serverCount = $derived(Object.keys(config.mcpServers).length);

	// Get server entries sorted
	const serverEntries = $derived(
		Object.entries(config.mcpServers).sort(([a], [b]) => a.localeCompare(b))
	);

</script>

<div class="mcp-editor {className}">
	<!-- Project Selector (always shown) -->
	<ProjectSelector
		projects={projectNames}
		selectedProject={selectedProjectName}
		onProjectChange={(name) => selectedProjectName = name}
		compact={false}
		showColors={true}
	/>

	{#if selectedProjectName === 'All Projects'}
		<!-- No Project Selected -->
		<div class="empty-state" transition:fade={{ duration: 150 }}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="empty-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
				/>
			</svg>
			<p class="empty-title">Select a project to view MCP configuration</p>
			<p class="empty-hint">Choose a project from the selector above</p>
		</div>
	{:else if isLoading}
		<!-- Loading State -->
		<div class="loading-state" transition:fade={{ duration: 150 }}>
			<div class="loading-spinner"></div>
			<p class="loading-text">Loading MCP configuration...</p>
		</div>
	{:else if error && !showAddForm}
		<!-- Error State -->
		<div class="error-state" transition:fade={{ duration: 150 }}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="error-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
				/>
			</svg>
			<p class="error-title">Failed to load MCP configuration</p>
			<p class="error-message">{error}</p>
			<button class="retry-btn" onclick={() => loadConfig()}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-4 h-4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
					/>
				</svg>
				Retry
			</button>
		</div>
	{:else}
		<!-- Main Content -->
		<div class="mcp-content" transition:fade={{ duration: 150 }}>
			<!-- Header -->
			<div class="mcp-header">
				<div class="header-info">
					<span class="server-count"
						>{serverCount} server{serverCount !== 1 ? 's' : ''} configured</span
					>
					{#if configPath}
						<span class="config-path" title={configPath}>
							{#if !fileExists}
								<span class="not-exists-badge">New file</span>
							{/if}
							{configPath}
						</span>
					{/if}
				</div>
				<button class="add-btn" onclick={openAddForm}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-4 h-4"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					Add Server
				</button>
			</div>

			<!-- Server List -->
			{#if serverCount === 0}
				<div class="empty-state">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="empty-icon"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
						/>
					</svg>
					<p class="empty-title">No MCP servers configured</p>
					<p class="empty-hint">Add an MCP server to extend Claude's capabilities</p>
				</div>
			{:else}
				<div class="servers-grid">
					{#each serverEntries as [name, server] (name)}
						<div class="server-card" transition:fade={{ duration: 150 }}>
							<!-- Server Header -->
							<div class="server-header">
								<div class="server-info">
									<span class="server-name">{name}</span>
									{#if server.disabled}
										<span class="disabled-badge">Disabled</span>
									{/if}
								</div>
								<div class="server-actions">
									<button
										class="action-btn edit"
										onclick={() => openEditForm(name)}
										title="Edit server"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="w-4 h-4"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
											/>
										</svg>
									</button>
									<button
										class="action-btn delete"
										onclick={() => deleteServer(name)}
										title="Delete server"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="w-4 h-4"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
											/>
										</svg>
									</button>
								</div>
							</div>

							<!-- Transport Type Badge -->
							<div class="badges-row">
								{#if isMcpServerHttp(server)}
									<span class="badge http-badge">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="badge-icon"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
											/>
										</svg>
										HTTP
									</span>
								{:else}
									<span class="badge stdio-badge">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="badge-icon"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
											/>
										</svg>
										stdio
									</span>
								{/if}

								{#if server.timeout}
									<span class="badge timeout-badge"> {server.timeout}ms timeout </span>
								{/if}
							</div>

							<!-- Server Details -->
							{#if isMcpServerHttp(server)}
								<div class="server-detail">
									<span class="detail-label">URL</span>
									<span class="detail-value url-value" title={server.url}>{server.url}</span>
								</div>
								{#if server.headers && Object.keys(server.headers).length > 0}
									<div class="server-detail">
										<span class="detail-label">Headers</span>
										<span class="detail-value">{Object.keys(server.headers).length} configured</span
										>
									</div>
								{/if}
							{:else if isMcpServerStdio(server)}
								<div class="server-detail">
									<span class="detail-label">Command</span>
									<span class="detail-value mono-value">{server.command}</span>
								</div>
								{#if server.args && server.args.length > 0}
									<div class="server-detail">
										<span class="detail-label">Args</span>
										<span class="detail-value mono-value" title={server.args.join(' ')}
											>{server.args.join(' ')}</span
										>
									</div>
								{/if}
								{#if server.env && Object.keys(server.env).length > 0}
									<div class="server-detail">
										<span class="detail-label">Env</span>
										<span class="detail-value">{Object.keys(server.env).length} variables</span>
									</div>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Add/Edit Modal -->
	{#if showAddForm}
		<div class="modal-overlay" transition:fade={{ duration: 150 }}>
			<div class="modal-content">
				<div class="modal-header">
					<h3 class="modal-title">{editingServerName ? 'Edit Server' : 'Add MCP Server'}</h3>
					<button class="close-btn" onclick={closeForm}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-5 h-5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div class="modal-body">
					{#if formError}
						<div class="form-error">
							{formError}
						</div>
					{/if}

					<!-- Server Name -->
					<div class="form-group">
						<label class="form-label" for="server-name">Server Name *</label>
						<input
							type="text"
							id="server-name"
							class="form-input"
							bind:value={formServerName}
							placeholder="e.g., filesystem, supabase"
							disabled={!!editingServerName}
						/>
						<span class="form-hint">Unique identifier for this server</span>
					</div>

					<!-- Transport Type -->
					<div class="form-group">
						<label class="form-label">Transport Type</label>
						<div class="transport-toggle">
							<button
								class="toggle-btn"
								class:active={formTransportType === 'stdio'}
								onclick={() => (formTransportType = 'stdio')}
							>
								stdio
							</button>
							<button
								class="toggle-btn"
								class:active={formTransportType === 'http'}
								onclick={() => (formTransportType = 'http')}
							>
								HTTP
							</button>
						</div>
					</div>

					{#if formTransportType === 'stdio'}
						<!-- Stdio fields -->
						<div class="form-group">
							<label class="form-label" for="command">Command *</label>
							<input
								type="text"
								id="command"
								class="form-input mono"
								bind:value={formCommand}
								placeholder="e.g., npx, node, python"
							/>
						</div>

						<div class="form-group">
							<label class="form-label" for="args">Arguments</label>
							<input
								type="text"
								id="args"
								class="form-input mono"
								bind:value={formArgs}
								placeholder="e.g., -y @modelcontextprotocol/server-filesystem"
							/>
							<span class="form-hint">Space-separated arguments</span>
						</div>

						<div class="form-group">
							<label class="form-label">Environment Variables</label>
							{#each formEnvPairs as pair, index}
								<div class="key-value-row">
									<input
										type="text"
										class="form-input small mono"
										bind:value={pair.key}
										placeholder="KEY"
									/>
									<span class="equals">=</span>
									<input
										type="text"
										class="form-input mono"
										bind:value={pair.value}
										placeholder="value"
									/>
									<button class="remove-btn" onclick={() => removeEnvPair(index)}>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="w-4 h-4"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							{/each}
							<button class="add-pair-btn" onclick={addEnvPair}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-4 h-4"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
								</svg>
								Add Variable
							</button>
						</div>
					{:else}
						<!-- HTTP fields -->
						<div class="form-group">
							<label class="form-label" for="url">URL *</label>
							<input
								type="text"
								id="url"
								class="form-input"
								bind:value={formUrl}
								placeholder="https://mcp.example.com/mcp"
							/>
						</div>

						<div class="form-group">
							<label class="form-label">HTTP Headers</label>
							{#each formHeaders as header, index}
								<div class="key-value-row">
									<input
										type="text"
										class="form-input small"
										bind:value={header.key}
										placeholder="Header-Name"
									/>
									<span class="colon">:</span>
									<input
										type="text"
										class="form-input"
										bind:value={header.value}
										placeholder="value"
									/>
									<button class="remove-btn" onclick={() => removeHeaderPair(index)}>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="w-4 h-4"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							{/each}
							<button class="add-pair-btn" onclick={addHeaderPair}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-4 h-4"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
								</svg>
								Add Header
							</button>
						</div>
					{/if}

					<!-- Common fields -->
					<div class="form-row">
						<div class="form-group half">
							<label class="form-label" for="timeout">Timeout (ms)</label>
							<input
								type="number"
								id="timeout"
								class="form-input"
								bind:value={formTimeout}
								placeholder="60000"
							/>
						</div>

						<div class="form-group half checkbox-group">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={formDisabled} />
								<span>Disabled</span>
							</label>
						</div>
					</div>
				</div>

				<div class="modal-footer">
					<button class="cancel-btn" onclick={closeForm}>Cancel</button>
					<button class="save-btn" onclick={saveForm} disabled={isSaving}>
						{#if isSaving}
							<span class="saving-spinner"></span>
							Saving...
						{:else}
							{editingServerName ? 'Save Changes' : 'Add Server'}
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.mcp-editor {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 1rem;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid oklch(0.3 0.02 250);
		border-top-color: oklch(0.65 0.15 200);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-text {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	/* Error state */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 0.5rem;
		color: oklch(0.5 0.02 250);
	}

	.error-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.6 0.15 25);
		margin-bottom: 0.5rem;
	}

	.error-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.7 0.12 25);
		margin: 0;
	}

	.error-message {
		font-size: 0.75rem;
		color: oklch(0.55 0.02 250);
		margin: 0;
		text-align: center;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.3 0.08 200);
		border: 1px solid oklch(0.4 0.1 200);
		border-radius: 6px;
		color: oklch(0.85 0.08 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: oklch(0.35 0.1 200);
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 0.5rem;
		color: oklch(0.5 0.02 250);
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: oklch(0.35 0.02 250);
		margin-bottom: 0.5rem;
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 500;
		color: oklch(0.55 0.02 250);
		margin: 0;
	}

	.empty-hint {
		font-size: 0.75rem;
		color: oklch(0.45 0.02 250);
		margin: 0;
	}

	/* Header */
	.mcp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.server-count {
		font-size: 0.85rem;
		color: oklch(0.55 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.config-path {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: oklch(0.45 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.not-exists-badge {
		font-size: 0.6rem;
		font-weight: 600;
		color: oklch(0.8 0.12 200);
		background: oklch(0.25 0.08 200);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}

	.add-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: oklch(0.35 0.12 145);
		border: 1px solid oklch(0.45 0.15 145);
		border-radius: 6px;
		color: oklch(0.95 0.05 145);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-btn:hover {
		background: oklch(0.4 0.14 145);
	}

	/* Servers grid */
	.servers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	/* Server card */
	.server-card {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1rem;
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 10px;
		transition: all 0.15s ease;
	}

	.server-card:hover {
		background: oklch(0.18 0.02 250);
		border-color: oklch(0.32 0.02 250);
	}

	.server-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.server-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.server-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: oklch(0.9 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.disabled-badge {
		font-size: 0.55rem;
		font-weight: 600;
		color: oklch(0.7 0.1 85);
		background: oklch(0.25 0.06 85);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.server-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.server-card:hover .server-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.3 0.02 250);
		border-radius: 6px;
		color: oklch(0.6 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: oklch(0.28 0.02 250);
		color: oklch(0.8 0.02 250);
	}

	.action-btn.edit:hover {
		background: oklch(0.28 0.06 145);
		border-color: oklch(0.4 0.1 145);
		color: oklch(0.8 0.1 145);
	}

	.action-btn.delete:hover {
		background: oklch(0.28 0.08 25);
		border-color: oklch(0.45 0.12 25);
		color: oklch(0.8 0.15 25);
	}

	/* Badges */
	.badges-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.65rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		font-family: ui-monospace, monospace;
	}

	.badge-icon {
		width: 12px;
		height: 12px;
	}

	.http-badge {
		color: oklch(0.8 0.1 280);
		background: oklch(0.25 0.06 280);
	}

	.stdio-badge {
		color: oklch(0.8 0.1 200);
		background: oklch(0.25 0.06 200);
	}

	.timeout-badge {
		color: oklch(0.7 0.06 250);
		background: oklch(0.22 0.02 250);
	}

	/* Server details */
	.server-detail {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.detail-label {
		color: oklch(0.5 0.02 250);
		flex-shrink: 0;
	}

	.detail-value {
		color: oklch(0.7 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mono-value {
		font-family: ui-monospace, monospace;
	}

	.url-value {
		color: oklch(0.7 0.08 200);
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0.1 0.02 250 / 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
	}

	.modal-content {
		background: oklch(0.16 0.02 250);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 12px;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid oklch(0.25 0.02 250);
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: oklch(0.9 0.02 250);
		margin: 0;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: oklch(0.6 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: oklch(0.25 0.02 250);
		color: oklch(0.8 0.02 250);
	}

	.modal-body {
		padding: 1.25rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid oklch(0.25 0.02 250);
	}

	/* Form */
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-row {
		display: flex;
		gap: 1rem;
	}

	.form-group.half {
		flex: 1;
	}

	.form-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: oklch(0.75 0.02 250);
	}

	.form-input {
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		background: oklch(0.12 0.02 250);
		border: 1px solid oklch(0.3 0.02 250);
		border-radius: 6px;
		color: oklch(0.9 0.02 250);
		outline: none;
		transition: all 0.15s ease;
	}

	.form-input:focus {
		border-color: oklch(0.5 0.1 200);
		box-shadow: 0 0 0 2px oklch(0.5 0.1 200 / 0.2);
	}

	.form-input.mono {
		font-family: ui-monospace, monospace;
	}

	.form-input.small {
		width: 120px;
		flex-shrink: 0;
	}

	.form-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-hint {
		font-size: 0.7rem;
		color: oklch(0.5 0.02 250);
	}

	.form-error {
		padding: 0.625rem 0.875rem;
		font-size: 0.8rem;
		background: oklch(0.2 0.08 25);
		border: 1px solid oklch(0.35 0.12 25);
		border-radius: 6px;
		color: oklch(0.8 0.12 25);
	}

	/* Transport toggle */
	.transport-toggle {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: oklch(0.12 0.02 250);
		border-radius: 8px;
		width: fit-content;
	}

	.toggle-btn {
		padding: 0.375rem 0.875rem;
		font-size: 0.8rem;
		font-weight: 500;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: oklch(0.6 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: ui-monospace, monospace;
	}

	.toggle-btn.active {
		background: oklch(0.28 0.08 200);
		color: oklch(0.9 0.1 200);
	}

	.toggle-btn:hover:not(.active) {
		color: oklch(0.75 0.02 250);
	}

	/* Key-value pairs */
	.key-value-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.375rem;
	}

	.equals,
	.colon {
		color: oklch(0.5 0.02 250);
		font-family: ui-monospace, monospace;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: oklch(0.5 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.remove-btn:hover {
		background: oklch(0.25 0.08 25);
		color: oklch(0.7 0.12 25);
	}

	.add-pair-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: transparent;
		border: 1px dashed oklch(0.35 0.02 250);
		border-radius: 6px;
		color: oklch(0.6 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
		width: fit-content;
	}

	.add-pair-btn:hover {
		border-color: oklch(0.5 0.1 200);
		color: oklch(0.75 0.08 200);
	}

	/* Checkbox */
	.checkbox-group {
		justify-content: flex-end;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: oklch(0.7 0.02 250);
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: oklch(0.6 0.15 200);
	}

	/* Footer buttons */
	.cancel-btn {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		background: oklch(0.22 0.02 250);
		border: 1px solid oklch(0.32 0.02 250);
		border-radius: 6px;
		color: oklch(0.75 0.02 250);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cancel-btn:hover {
		background: oklch(0.28 0.02 250);
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		background: oklch(0.45 0.15 200);
		border: 1px solid oklch(0.55 0.18 200);
		border-radius: 6px;
		color: oklch(0.98 0.02 200);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.save-btn:hover:not(:disabled) {
		background: oklch(0.5 0.17 200);
	}

	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.saving-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid oklch(0.98 0.02 200 / 0.3);
		border-top-color: oklch(0.98 0.02 200);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.mcp-header {
			flex-direction: column;
			align-items: stretch;
		}

		.servers-grid {
			grid-template-columns: 1fr;
		}

		.form-row {
			flex-direction: column;
		}

		.form-group.half {
			flex: none;
		}

		.form-input.small {
			width: 100%;
		}
	}
</style>
