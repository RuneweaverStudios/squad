<script>
	/**
	 * TaskModal Component
	 * Displays full task details including dependencies and dependency graph
	 */

	// Props
	let { task = $bindable(null), onClose = () => {} } = $props();

	// Priority labels
	const priorityLabels = {
		0: 'P0 (Critical)',
		1: 'P1 (High)',
		2: 'P2 (Medium)',
		3: 'P3 (Low)',
		4: 'P4 (Lowest)'
	};

	// Close modal on escape key
	function handleKeydown(event) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	// Close modal on backdrop click
	function handleBackdropClick(event) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if task}
	<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown} role="button" tabindex="-1">
		<div class="modal">
			<div class="modal-header">
				<h2>{task.title}</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close modal">×</button>
			</div>

			<div class="modal-body">
				<div class="task-meta-row">
					<div class="meta-item">
						<span class="meta-label">ID:</span>
						<span class="meta-value">{task.id}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Project:</span>
						<span class="meta-value">{task.project}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Priority:</span>
						<span class="meta-value">{priorityLabels[task.priority] || `P${task.priority}`}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Status:</span>
						<span class="meta-value status-{task.status}">{task.status}</span>
					</div>
					{#if task.issue_type}
						<div class="meta-item">
							<span class="meta-label">Type:</span>
							<span class="meta-value">{task.issue_type}</span>
						</div>
					{/if}
				</div>

				{#if task.description}
					<div class="section">
						<h3>Description</h3>
						<p class="description">{task.description}</p>
					</div>
				{/if}

				{#if task.acceptance_criteria}
					<div class="section">
						<h3>Acceptance Criteria</h3>
						<p class="acceptance-criteria">{task.acceptance_criteria}</p>
					</div>
				{/if}

				{#if task.labels && task.labels.length > 0}
					<div class="section">
						<h3>Labels</h3>
						<div class="labels">
							{#each task.labels as label}
								<span class="label">{label}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if task.dependencies && task.dependencies.length > 0}
					<div class="section">
						<h3>Dependencies</h3>
						<div class="dependencies">
							<p class="dependency-note">This task depends on:</p>
							<pre class="dependency-tree">{task.id}
{#each task.dependencies as dep, i}
{i === task.dependencies.length - 1 ? '└──' : '├──'} {dep}
{/each}</pre>
						</div>
					</div>
				{/if}

				{#if task.enables && task.enables.length > 0}
					<div class="section">
						<h3>Enables</h3>
						<div class="enables">
							<p class="enables-note">Completing this task will enable:</p>
							<ul class="enables-list">
								{#each task.enables as enabled}
									<li>{enabled}</li>
								{/each}
							</ul>
						</div>
					</div>
				{/if}

				<div class="section">
					<h3>Timestamps</h3>
					<div class="timestamps">
						<div class="timestamp-item">
							<span class="timestamp-label">Created:</span>
							<span class="timestamp-value">{new Date(task.created_at).toLocaleString()}</span>
						</div>
						<div class="timestamp-item">
							<span class="timestamp-label">Updated:</span>
							<span class="timestamp-value">{new Date(task.updated_at).toLocaleString()}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal {
		background: white;
		border-radius: 0.5rem;
		max-width: 800px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
		position: sticky;
		top: 0;
		background: white;
		z-index: 10;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: #111827;
		flex: 1;
		padding-right: 1rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		color: #6b7280;
		cursor: pointer;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		transition: background-color 0.2s, color 0.2s;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-body {
		padding: 1.5rem;
	}

	.task-meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.375rem;
		margin-bottom: 1.5rem;
	}

	.meta-item {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.meta-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #6b7280;
	}

	.meta-value {
		font-size: 0.875rem;
		color: #111827;
	}

	.meta-value.status-open {
		color: #1e40af;
		font-weight: 600;
	}

	.meta-value.status-closed {
		color: #065f46;
		font-weight: 600;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #111827;
	}

	.description,
	.acceptance-criteria {
		font-size: 0.9375rem;
		line-height: 1.6;
		color: #374151;
		white-space: pre-wrap;
	}

	.labels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.label {
		background: #f3f4f6;
		color: #374151;
		padding: 0.25rem 0.75rem;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.dependencies,
	.enables {
		background: #f9fafb;
		padding: 1rem;
		border-radius: 0.375rem;
		border-left: 3px solid #3b82f6;
	}

	.dependency-note,
	.enables-note {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		color: #6b7280;
		font-weight: 500;
	}

	.dependency-tree {
		margin: 0;
		padding: 0.5rem;
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		color: #111827;
		line-height: 1.6;
		overflow-x: auto;
	}

	.enables-list {
		margin: 0;
		padding-left: 1.5rem;
		list-style-type: disc;
	}

	.enables-list li {
		font-size: 0.9375rem;
		color: #111827;
		margin-bottom: 0.25rem;
		font-family: 'Courier New', monospace;
	}

	.timestamps {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: #f9fafb;
		padding: 1rem;
		border-radius: 0.375rem;
	}

	.timestamp-item {
		display: flex;
		gap: 0.5rem;
	}

	.timestamp-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #6b7280;
		min-width: 5rem;
	}

	.timestamp-value {
		font-size: 0.875rem;
		color: #111827;
	}
</style>
