<script lang="ts">
	/**
	 * UnifiedAgentCard Component
	 *
	 * A unified agent card supporting multiple display modes:
	 * - mini: Minimal display for kanban swimlanes
	 * - compact: Summary card with actions for kanban cards
	 * - standard: Full card for agent grid (no terminal)
	 * - expanded: Full terminal view for work sessions
	 *
	 * @see docs/unified-agent-card-refactor-plan.md
	 */

	import { onMount, onDestroy } from 'svelte';
	import type {
		Agent,
		Task,
		Reservation,
		DisplayMode,
		InputType,
		UnifiedAgentState,
		QuestionData,
		AgentUsage,
		SparklinePoint,
		ActivityState
	} from '$lib/types/agent';
	import { computeUnifiedState } from '$lib/utils/unifiedAgentState';
	import { detectSessionState } from '$lib/utils/sessionStateDetection';
	import { checkAssignmentConflicts } from '$lib/utils/conflictDetection';
	import {
		getDisplayModeConfig,
		getModeStyles,
		getPollInterval,
		DISPLAY_THRESHOLDS
	} from '$lib/config/agentCardConfig';
	import { SESSION_STATE_VISUALS } from '$lib/config/statusColors';

	// Sub-components
	import AgentHeader from './header/AgentHeader.svelte';
	import StateBadge from './header/StateBadge.svelte';
	import CurrentTask from './task/CurrentTask.svelte';
	import TaskQueue from './queue/TaskQueue.svelte';
	import TerminalOutput from './terminal/TerminalOutput.svelte';
	import TerminalInput from './terminal/TerminalInput.svelte';
	import QuestionUI from './terminal/QuestionUI.svelte';
	import TokenUsageBar from './metrics/TokenUsageBar.svelte';
	import ActivityFeed from './feed/ActivityFeed.svelte';
	import SessionControls from './actions/SessionControls.svelte';
	import SlashCommandDropdown from './actions/SlashCommandDropdown.svelte';
	import QuickActionsMenu from './actions/QuickActionsMenu.svelte';
	import InboxModal from './modals/InboxModal.svelte';
	import ReservationsModal from './modals/ReservationsModal.svelte';
	import SendMessageModal from './modals/SendMessageModal.svelte';

	// =============================================================================
	// PROPS
	// =============================================================================

	interface Props {
		// Required
		agent: Agent;
		mode: DisplayMode;

		// Optional data
		tasks?: Task[];
		allTasks?: Task[];
		reservations?: Reservation[];
		output?: string;
		lastCompletedTask?: Task | null;
		sparklineData?: SparklinePoint[];
		usage?: AgentUsage;

		// Question data (from API hook)
		questionData?: QuestionData | null;

		// State override (for kanban where state is pre-computed)
		activityStateOverride?: ActivityState;

		// Event handlers
		onTaskClick?: (taskId: string) => void;
		onTaskAssign?: (taskId: string, agentName: string) => Promise<void>;
		onKillSession?: () => Promise<void>;
		onInterrupt?: () => Promise<void>;
		onContinue?: () => Promise<void>;
		onSendInput?: (input: string, type: InputType) => Promise<void>;
		onAttachTerminal?: () => Promise<void>;
		onDismiss?: () => void;
		onTitleChange?: (newTitle: string) => Promise<void>;

		// Drag-drop
		draggedTaskId?: string | null;

		// Display options
		isHighlighted?: boolean;
		cardWidth?: number;
		onWidthChange?: (width: number) => void;
		class?: string;
	}

	let {
		agent,
		mode,
		tasks = [],
		allTasks = [],
		reservations = [],
		output = '',
		lastCompletedTask = null,
		sparklineData = [],
		usage,
		questionData = null,
		activityStateOverride,
		onTaskClick,
		onTaskAssign,
		onKillSession,
		onInterrupt,
		onContinue,
		onSendInput,
		onAttachTerminal,
		onDismiss,
		onTitleChange,
		draggedTaskId = null,
		isHighlighted = false,
		cardWidth,
		onWidthChange,
		class: className = ''
	}: Props = $props();

	// =============================================================================
	// STATE
	// =============================================================================

	// Display mode config
	const modeConfig = $derived(getDisplayModeConfig(mode));
	const modeStyles = $derived(getModeStyles(mode));
	const pollInterval = $derived(getPollInterval(mode));

	// Current task - find in-progress task assigned to this agent
	const currentTask = $derived(
		tasks.find((t) => t.assignee === agent.name && t.status === 'in_progress') || null
	);

	// Unified agent state
	// Use activityStateOverride if provided (e.g., from kanban column)
	const unifiedState = $derived.by((): UnifiedAgentState => {
		const computed = computeUnifiedState(agent, output, currentTask || undefined, lastCompletedTask || undefined);
		if (activityStateOverride) {
			return { ...computed, activity: activityStateOverride };
		}
		return computed;
	});

	// Session state visuals
	const stateVisual = $derived(SESSION_STATE_VISUALS[unifiedState.activity] || SESSION_STATE_VISUALS.idle);

	// Queued tasks (open tasks assigned to this agent)
	const queuedTasks = $derived(tasks.filter((t) => t.assignee === agent.name && t.status === 'open'));

	// Token usage for display
	const tokenUsage = $derived(usage?.today || null);

	// =============================================================================
	// DRAG-DROP STATE
	// =============================================================================

	let isDragOver = $state(false);
	let hasConflict = $state(false);
	let hasDependencyBlock = $state(false);
	let conflictReasons = $state<string[]>([]);
	let dependencyBlockReason = $state('');
	let blockingTaskId = $state('');
	let isAssigning = $state(false);

	// =============================================================================
	// MODAL STATE
	// =============================================================================

	let showInboxModal = $state(false);
	let showReservationsModal = $state(false);
	let showSendMessageModal = $state(false);
	let inboxMessages = $state<any[]>([]);

	// =============================================================================
	// QUICK ACTIONS STATE
	// =============================================================================

	let showQuickActions = $state(false);
	let quickActionsX = $state(0);
	let quickActionsY = $state(0);
	let quickActionsLoading = $state<string | null>(null);

	// =============================================================================
	// SLASH COMMAND STATE
	// =============================================================================

	let showSlashDropdown = $state(false);
	let slashCommandLoading = $state<string | null>(null);

	// =============================================================================
	// QUESTION UI STATE
	// =============================================================================

	let selectedQuestionIndices = $state(new Set<number>());

	// =============================================================================
	// RESIZE STATE (expanded mode only)
	// =============================================================================

	let isResizing = $state(false);
	let localCardWidth = $state(cardWidth || DISPLAY_THRESHOLDS.CARD_DEFAULT_WIDTH);

	// =============================================================================
	// EVENT HANDLERS
	// =============================================================================

	// Drag-drop handlers
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (!modeConfig.allowDragDrop || !draggedTaskId) return;

		isDragOver = true;

		// Check for conflicts
		const draggedTask = allTasks.find((t) => t.id === draggedTaskId);
		if (draggedTask) {
			const conflicts = checkAssignmentConflicts(draggedTask, allTasks, reservations, agent.name);
			hasConflict = conflicts.hasFileConflict;
			conflictReasons = conflicts.fileConflictReasons;
			hasDependencyBlock = conflicts.hasDependencyBlock;
			dependencyBlockReason = conflicts.dependencyBlockReason || '';
			blockingTaskId = '';
		}

		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = hasConflict || hasDependencyBlock ? 'none' : 'move';
		}
	}

	function handleDragLeave(event: DragEvent) {
		isDragOver = false;
		hasConflict = false;
		hasDependencyBlock = false;
		conflictReasons = [];
		dependencyBlockReason = '';
		blockingTaskId = '';
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;

		if (hasConflict || hasDependencyBlock || !draggedTaskId || !onTaskAssign) {
			hasConflict = false;
			hasDependencyBlock = false;
			return;
		}

		isAssigning = true;
		try {
			await onTaskAssign(draggedTaskId, agent.name);
		} finally {
			isAssigning = false;
			hasConflict = false;
			hasDependencyBlock = false;
		}
	}

	// Question UI handlers
	async function handleQuestionSelect(index: number, isMultiSelect: boolean) {
		if (!onSendInput) return;

		if (isMultiSelect) {
			// Toggle selection
			const newSet = new Set(selectedQuestionIndices);
			if (newSet.has(index)) {
				newSet.delete(index);
			} else {
				newSet.add(index);
			}
			selectedQuestionIndices = newSet;
			// Send space to toggle
			await onSendInput('space', 'key');
		} else {
			// Single select - navigate and confirm
			await onSendInput((index + 1).toString(), 'text');
			await onSendInput('enter', 'key');
		}
	}

	async function handleQuestionConfirm() {
		if (!onSendInput) return;
		// Send Enter to confirm multi-select
		await onSendInput('enter', 'key');
		selectedQuestionIndices = new Set();
	}

	// Quick actions
	function handleContextMenu(event: MouseEvent) {
		if (!modeConfig.showQuickActions) return;
		event.preventDefault();
		quickActionsX = event.clientX;
		quickActionsY = event.clientY;
		showQuickActions = true;
	}

	async function handleQuickAction(actionId: string) {
		quickActionsLoading = actionId;
		try {
			switch (actionId) {
				case 'inbox':
					await viewInbox();
					break;
				case 'reservations':
					await viewReservations();
					break;
				case 'send-message':
					showSendMessageModal = true;
					break;
				case 'clear-queue':
					await clearQueue();
					break;
				case 'attach':
					await onAttachTerminal?.();
					break;
			}
		} finally {
			quickActionsLoading = null;
			showQuickActions = false;
		}
	}

	// Modal handlers
	async function viewInbox() {
		try {
			const response = await fetch(`/api/agents/${agent.name}/inbox`);
			if (response.ok) {
				const data = await response.json();
				inboxMessages = data.messages || [];
				showInboxModal = true;
			}
		} catch (error) {
			console.error('Failed to fetch inbox:', error);
		}
	}

	async function viewReservations() {
		showReservationsModal = true;
	}

	async function clearQueue() {
		if (!confirm(`Clear all queued tasks for ${agent.name}?`)) return;
		try {
			const response = await fetch(`/api/agents/${agent.name}/clear-queue`, { method: 'POST' });
			if (!response.ok) throw new Error('Failed to clear queue');
			window.location.reload();
		} catch (error) {
			console.error('Failed to clear queue:', error);
			alert('Failed to clear queue');
		}
	}

	async function handleSendMessage(subject: string, body: string) {
		const response = await fetch(`/api/agents/${agent.name}/message`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subject, body })
		});
		if (!response.ok) throw new Error('Failed to send message');
	}

	async function handleReleaseReservation(id: number, pattern: string) {
		const response = await fetch(`/api/agents/${agent.name}/reservations/${id}`, {
			method: 'DELETE'
		});
		if (!response.ok) throw new Error('Failed to release reservation');
	}

	// Slash command handlers
	async function handleSlashCommand(commandId: string) {
		if (!onSendInput) return;
		slashCommandLoading = commandId;
		showSlashDropdown = false;
		try {
			await onSendInput(`/jat:${commandId}`, 'text');
			await onSendInput('enter', 'key');
		} finally {
			slashCommandLoading = null;
		}
	}

	// State action handler
	function handleStateAction(actionId: string) {
		switch (actionId) {
			case 'complete':
				handleSlashCommand('complete');
				break;
			case 'attach':
				onAttachTerminal?.();
				break;
			case 'continue':
				onContinue?.();
				break;
			case 'kill':
				onKillSession?.();
				break;
			case 'view-task':
				if (currentTask) onTaskClick?.(currentTask.id);
				break;
		}
	}

	// Resize handlers (expanded mode)
	function startResize(e: MouseEvent) {
		if (!modeConfig.allowResize) return;
		isResizing = true;
		const startX = e.clientX;
		const startWidth = localCardWidth;

		function onMouseMove(e: MouseEvent) {
			const delta = e.clientX - startX;
			const newWidth = Math.max(
				DISPLAY_THRESHOLDS.CARD_MIN_WIDTH,
				Math.min(DISPLAY_THRESHOLDS.CARD_MAX_WIDTH, startWidth + delta)
			);
			localCardWidth = newWidth;
			onWidthChange?.(newWidth);
		}

		function onMouseUp() {
			isResizing = false;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		}

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	// Quick action definitions
	const quickActions = $derived([
		{ id: 'inbox', label: 'View Inbox', icon: '📬', variant: 'default' as const },
		{ id: 'reservations', label: 'View File Locks', icon: '🔒', variant: 'default' as const },
		{ id: 'send-message', label: 'Send Message', icon: '✉️', variant: 'default' as const },
		{ id: 'clear-queue', label: "Clear Queue", icon: '🗑️', variant: 'error' as const, dividerBefore: true },
		...(onAttachTerminal ? [{ id: 'attach', label: 'Attach Terminal', icon: '🖥️', variant: 'info' as const }] : [])
	]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<article
	class="unified-agent-card {modeStyles} {className}"
	class:ring-2={isHighlighted}
	class:ring-primary={isHighlighted}
	style="
		background: linear-gradient(135deg, {stateVisual.bgTint} 0%, oklch(0.18 0.01 250) 100%);
		border-left: 3px solid {stateVisual.accent};
		{mode === 'expanded' && modeConfig.allowResize ? `width: ${localCardWidth}px;` : ''}
	"
	role="article"
	aria-label="Agent {agent.name} - {unifiedState.stateLabel}"
	aria-describedby="agent-{agent.name}-state"
	data-agent-name={agent.name}
	oncontextmenu={handleContextMenu}
>
	<!-- ═══════════════════════════════════════════════════════════════════════
	     HEADER SECTION
	     Agent identity, state badge, session controls
	     Layout adapts based on mode:
	     - compact/mini: Single row with avatar, name, controls (no state badge - column shows state)
	     - standard/expanded: Full layout with state badge
	     ═══════════════════════════════════════════════════════════════════════ -->
	<div class="flex items-center justify-between gap-2 mb-2">
		<!-- Left: Agent identity -->
		<div class="flex items-center gap-2 min-w-0 flex-1">
			{#if modeConfig.showAvatar}
				<AgentHeader
					name={agent.name}
					connection={unifiedState.connection}
					activityState={unifiedState.activity}
					{isHighlighted}
					size={mode === 'mini' ? 'sm' : mode === 'compact' ? 'sm' : 'md'}
					showConnectionDot={mode !== 'compact' && mode !== 'mini'}
					styledName={mode === 'compact' || mode === 'mini'}
					accentColor={stateVisual.accent}
					glowColor={stateVisual.glow}
					showInlineUsage={mode === 'compact'}
					{sparklineData}
					tokens={tokenUsage?.total_tokens || 0}
					cost={tokenUsage?.cost || 0}
				/>
			{:else}
				<span class="font-semibold text-sm truncate">{agent.name}</span>
			{/if}
		</div>

		<!-- Right: State badge (not in compact - column shows state) and controls -->
		<div class="flex items-center gap-1 shrink-0">
			{#if modeConfig.showStateBadge && mode !== 'compact' && mode !== 'mini'}
				<StateBadge
					sessionState={unifiedState.activity}
					showActions={modeConfig.showQuickActions}
					onAction={handleStateAction}
					size={mode === 'mini' ? 'sm' : 'md'}
				/>
			{/if}

			{#if modeConfig.showSessionControls}
				<div class="flex items-center gap-0.5">
					<!-- Slash command dropdown (not in compact mode) -->
					{#if mode !== 'mini' && mode !== 'compact'}
						<div class="relative">
							<button
								class="p-1 rounded hover:bg-base-content/10 transition-colors"
								onclick={() => (showSlashDropdown = !showSlashDropdown)}
								disabled={slashCommandLoading !== null}
								title="Slash commands"
							>
								{#if slashCommandLoading}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<svg class="w-3.5 h-3.5 opacity-50" viewBox="0 0 20 20" fill="currentColor">
										<path d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
									</svg>
								{/if}
							</button>
							<SlashCommandDropdown
								isOpen={showSlashDropdown}
								loadingCommand={slashCommandLoading}
								onCommand={handleSlashCommand}
								onClose={() => (showSlashDropdown = false)}
							/>
						</div>
					{/if}

					<SessionControls
						onKill={onKillSession}
						onInterrupt={onInterrupt}
						onContinue={onContinue}
						onAttach={onAttachTerminal}
						disabled={!unifiedState.canInteract}
						size={mode === 'compact' ? 'sm' : mode === 'mini' ? 'sm' : 'md'}
					/>
				</div>
			{/if}
		</div>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TASK SECTION
	     Current task display (or last completed task in compact mode)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showTask}
		<div class="mb-2">
			{#if currentTask}
				<CurrentTask
					task={currentTask}
					editable={mode === 'expanded'}
					showDetails={modeConfig.showTaskDetails}
					onClick={onTaskClick}
					onTitleChange={onTitleChange}
					compact={mode === 'compact' || mode === 'mini'}
					activityState={unifiedState.activity}
				/>
			{:else if lastCompletedTask && (mode === 'compact' || mode === 'mini')}
				<!-- Show last completed task in compact/mini mode -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2">
						<span class="badge badge-xs badge-success/20 text-success">
							<svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							Done
						</span>
						<span class="badge badge-xs badge-outline font-mono opacity-60">
							{lastCompletedTask.id}
						</span>
					</div>
					<button
						type="button"
						class="font-mono font-bold text-sm tracking-wide text-left truncate hover:border-b hover:border-dashed hover:border-base-content/30"
						style="color: oklch(0.75 0.02 250);"
						onclick={() => onTaskClick?.(lastCompletedTask.id)}
					>
						{lastCompletedTask.title}
					</button>
				</div>
			{:else}
				<CurrentTask
					task={null}
					editable={false}
					showDetails={false}
					onClick={onTaskClick}
					compact={mode === 'compact' || mode === 'mini'}
				/>
			{/if}
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TOKEN USAGE SECTION
	     Sparkline and cost display (skip in compact mode - shown inline in header)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showTokenUsage && tokenUsage && mode !== 'compact'}
		<div class="mb-2">
			<TokenUsageBar
				usage={tokenUsage}
				sparklineData={modeConfig.showSparkline ? sparklineData : []}
				showSparkline={modeConfig.showSparkline}
				compact={mode === 'mini'}
			/>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     QUESTION UI SECTION
	     Smart question buttons when agent needs input
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showQuestionUI && unifiedState.activity === 'needs-input' && questionData}
		<div class="mb-2">
			<QuestionUI
				{questionData}
				selectedIndices={selectedQuestionIndices}
				onSelect={handleQuestionSelect}
				onConfirm={handleQuestionConfirm}
				disabled={!unifiedState.canInteract}
				source="api"
			/>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TERMINAL OUTPUT SECTION
	     Full terminal viewer (expanded mode only)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showTerminal}
		<div class="mb-2">
			<TerminalOutput
				{output}
				autoScroll={true}
				maxHeight="400px"
			/>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TERMINAL INPUT SECTION
	     Input field and key buttons (expanded mode only)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showInput && onSendInput}
		<div class="mb-2">
			<TerminalInput
				onSend={onSendInput}
				disabled={!unifiedState.canInteract}
			/>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     ACTIVITY FEED SECTION
	     Recent activities (standard mode only)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showActivityFeed && agent.activities}
		<div class="mb-2">
			<ActivityFeed
				activities={agent.activities}
				currentActivity={agent.current_activity}
				maxItems={DISPLAY_THRESHOLDS.MAX_ACTIVITIES}
				onTaskClick={onTaskClick}
				accentColor={stateVisual.accent}
			/>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     QUEUE SECTION
	     Task queue with drag-drop (standard mode only)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.showQueue}
		<TaskQueue
			tasks={queuedTasks}
			maxVisible={DISPLAY_THRESHOLDS.MAX_QUEUE_ITEMS}
			{isDragOver}
			{hasConflict}
			{hasDependencyBlock}
			{conflictReasons}
			{dependencyBlockReason}
			{blockingTaskId}
			{isAssigning}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onTaskClick={onTaskClick}
			allowDrop={modeConfig.allowDragDrop}
		/>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     RESIZE HANDLE (expanded mode only)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if modeConfig.allowResize}
		<div
			class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 transition-colors"
			onmousedown={startResize}
		></div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════
	     DISMISS BUTTON (for dismissible cards)
	     ═══════════════════════════════════════════════════════════════════════ -->
	{#if onDismiss && mode === 'expanded'}
		<button
			class="absolute top-2 right-2 p-1 rounded-full hover:bg-base-content/10 transition-colors opacity-50 hover:opacity-100"
			onclick={onDismiss}
			aria-label="Dismiss agent card"
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}

	<!-- Screen reader description -->
	<span id="agent-{agent.name}-state" class="sr-only">
		{agent.name} is currently {unifiedState.stateLabel.toLowerCase()}.
		{#if currentTask}
			Working on task {currentTask.id}: {currentTask.title}.
		{:else if lastCompletedTask}
			Last completed: {lastCompletedTask.id}.
		{:else}
			No active task.
		{/if}
	</span>
</article>

<!-- ═══════════════════════════════════════════════════════════════════════
     MODALS
     ═══════════════════════════════════════════════════════════════════════ -->
<InboxModal
	isOpen={showInboxModal}
	agentName={agent.name}
	messages={inboxMessages}
	onClose={() => (showInboxModal = false)}
/>

<ReservationsModal
	isOpen={showReservationsModal}
	agentName={agent.name}
	reservations={reservations}
	onClose={() => (showReservationsModal = false)}
	onRelease={handleReleaseReservation}
/>

<SendMessageModal
	isOpen={showSendMessageModal}
	agentName={agent.name}
	onClose={() => (showSendMessageModal = false)}
	onSend={handleSendMessage}
/>

<!-- ═══════════════════════════════════════════════════════════════════════
     QUICK ACTIONS CONTEXT MENU
     ═══════════════════════════════════════════════════════════════════════ -->
<QuickActionsMenu
	isOpen={showQuickActions}
	agentName={agent.name}
	x={quickActionsX}
	y={quickActionsY}
	actions={quickActions}
	loadingAction={quickActionsLoading}
	onAction={handleQuickAction}
	onClose={() => (showQuickActions = false)}
/>

<style>
	.unified-agent-card {
		position: relative;
		transition: all 0.2s ease;
	}

	.unified-agent-card:hover {
		box-shadow: 0 4px 12px oklch(0 0 0 / 0.15);
	}
</style>
