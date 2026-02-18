<script lang="ts">
	/**
	 * Tasks C - Demo page for Concept C (Collapsible Cards)
	 */

	import TaskDetailPaneC from '$lib/components/sessions/TaskDetailPaneC.svelte';

	// Sample task data (same as A for comparison)
	const sampleTask = {
		id: 'squad-abc123',
		status: 'in_progress',
		issue_type: 'feature',
		title: 'Add notes field to task detail panel',
		priority: 1,
		description: `Implement a notes field in the task detail panel that allows users to quickly jot down notes about a task.

Requirements:
- Focus-to-edit, blur-to-save behavior
- Match existing theme/style
- Store in SQLite via SQUAD
- Display below description section`,
		notes: 'Checked the API - notes field already exists in schema. Need to add UI component.'
	};

	const sampleDetails = {
		labels: ['ui', 'enhancement', 'ide'],
		assignee: 'DeepStar',
		notes: 'Checked the API - notes field already exists in schema. Need to add UI component.',
		depends_on: [
			{ id: 'squad-xyz789', title: 'Database schema update', status: 'closed', priority: 0 }
		],
		blocked_by: [
			{ id: 'squad-def456', title: 'UI polish pass', status: 'open', priority: 2 }
		],
		created_at: '2025-01-14T10:00:00Z',
		updated_at: '2025-01-15T14:30:00Z',
		attachments: [
			{ id: '1', path: '/tmp/mockup.png', filename: 'mockup.png', url: 'https://placehold.co/200x150/1a1a2e/666?text=Mockup' },
			{ id: '2', path: '/tmp/screenshot.png', filename: 'screenshot.png', url: 'https://placehold.co/200x150/1a1a2e/666?text=Screenshot' }
		],
		timeline: [
			{ type: 'signal' as const, timestamp: '2025-01-15T14:30:00Z', data: { state: 'working', agentName: 'DeepStar', taskTitle: 'Add notes field' } },
			{ type: 'squad_event' as const, event: 'status_changed', timestamp: '2025-01-15T14:00:00Z', description: 'Status changed to in_progress', metadata: { status: 'in_progress' } },
			{ type: 'agent_mail' as const, event: 'message', timestamp: '2025-01-15T12:00:00Z', description: 'Starting work on notes field implementation', metadata: { from_agent: 'DeepStar' } },
			{ type: 'squad_event' as const, event: 'assigned', timestamp: '2025-01-14T10:30:00Z', description: 'Assigned to DeepStar', metadata: { assignee: 'DeepStar' } },
			{ type: 'squad_event' as const, event: 'created', timestamp: '2025-01-14T10:00:00Z', description: 'Task created', metadata: {} }
		],
		timelineCounts: { total: 5, squad_events: 3, agent_mail: 1, signals: 1 }
	};

	function handleViewTask(taskId: string) {
		console.log('View task:', taskId);
	}

	async function handleSaveNotes(taskId: string, notes: string) {
		console.log('Save notes for', taskId, ':', notes);
		await new Promise(resolve => setTimeout(resolve, 500));
	}
</script>

<svelte:head>
	<title>Concept C: Collapsible | SQUAD IDE</title>
</svelte:head>

<div class="demo-page">
	<header class="demo-header">
		<h1>Concept C: Collapsible Cards</h1>
		<p>Each section is a collapsible card. Notes expanded by default for quick access.</p>
		<a href="/tasksA" class="compare-link">← Compare with Concept A</a>
	</header>

	<div class="demo-container">
		<div class="task-header">
			<span class="task-id">{sampleTask.id}</span>
			<span class="badge badge-warning badge-sm">{sampleTask.status}</span>
			<span class="badge badge-outline badge-sm">P{sampleTask.priority}</span>
		</div>
		<h2 class="task-title">{sampleTask.title}</h2>

		<div class="pane-wrapper">
			<TaskDetailPaneC
				task={sampleTask}
				details={sampleDetails}
				loading={false}
				height={450}
				onViewTask={handleViewTask}
				onSaveNotes={handleSaveNotes}
			/>
		</div>
	</div>

	<div class="concept-notes">
		<h3>Key Features</h3>
		<ul>
			<li><strong>Progressive disclosure</strong> - See counts, expand for details</li>
			<li><strong>Notes first</strong> - Notes section open by default</li>
			<li><strong>Compact headers</strong> - Labels inline with metadata</li>
			<li><strong>Preview text</strong> - See note preview when collapsed</li>
		</ul>
		<h3>Trade-offs</h3>
		<ul>
			<li>More clicks to see all sections</li>
			<li>Vertical space used by collapsed headers</li>
			<li>No simultaneous view of multiple sections</li>
		</ul>
	</div>
</div>

<style>
	.demo-page {
		min-height: 100vh;
		background: oklch(0.12 0.01 250);
		padding: 2rem;
	}

	.demo-header {
		max-width: 800px;
		margin: 0 auto 2rem;
	}

	.demo-header h1 {
		font-size: 1.75rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0 0 0.5rem;
	}

	.demo-header p {
		font-size: 0.9rem;
		color: oklch(0.60 0.02 250);
		margin: 0 0 0.75rem;
	}

	.compare-link {
		font-size: 0.85rem;
		color: oklch(0.70 0.15 200);
		text-decoration: none;
	}

	.compare-link:hover {
		color: oklch(0.80 0.18 200);
		text-decoration: underline;
	}

	.demo-container {
		max-width: 800px;
		margin: 0 auto;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.25 0.02 250);
		border-radius: 0.75rem;
		overflow: hidden;
	}

	.task-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1rem 0;
	}

	.task-id {
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: oklch(0.65 0.12 200);
	}

	.task-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: oklch(0.90 0.02 250);
		margin: 0.5rem 1rem 0;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.pane-wrapper {
		/* Container for the detail pane */
	}

	.concept-notes {
		max-width: 800px;
		margin: 2rem auto 0;
		padding: 1.5rem;
		background: oklch(0.16 0.01 250);
		border: 1px solid oklch(0.22 0.02 250);
		border-radius: 0.75rem;
	}

	.concept-notes h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: oklch(0.80 0.02 250);
		margin: 0 0 0.75rem;
	}

	.concept-notes h3:not(:first-child) {
		margin-top: 1.25rem;
	}

	.concept-notes ul {
		margin: 0;
		padding-left: 1.25rem;
		color: oklch(0.65 0.02 250);
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.concept-notes li {
		margin-bottom: 0.375rem;
	}

	.concept-notes strong {
		color: oklch(0.75 0.02 250);
	}
</style>
