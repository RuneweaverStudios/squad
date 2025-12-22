<script lang="ts">
	/**
	 * StreakCalendar Component
	 *
	 * GitHub-inspired contribution calendar showing task completions over time.
	 * Features a sleek heat map with intensity-based coloring and hover details.
	 */

	interface CompletedTask {
		id: string;
		title: string;
		assignee?: string;
		updated_at: string;
		closed_at?: string;
	}

	interface Props {
		tasks: CompletedTask[];
		weeks?: number;
	}

	let { tasks, weeks = 12 }: Props = $props();

	// Day names for labels
	const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

	// Generate calendar data
	interface DayData {
		date: Date;
		dateStr: string;
		count: number;
		tasks: CompletedTask[];
	}

	const calendarData = $derived.by(() => {
		// Group tasks by date
		const tasksByDate = new Map<string, CompletedTask[]>();
		for (const task of tasks) {
			const dateStr = task.closed_at
				? new Date(task.closed_at).toISOString().split('T')[0]
				: new Date(task.updated_at).toISOString().split('T')[0];
			if (!tasksByDate.has(dateStr)) {
				tasksByDate.set(dateStr, []);
			}
			tasksByDate.get(dateStr)!.push(task);
		}

		// Calculate date range (past N weeks ending today)
		const today = new Date();
		today.setHours(23, 59, 59, 999);

		// Start from the beginning of the week, N weeks ago
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - (weeks * 7) - startDate.getDay());
		startDate.setHours(0, 0, 0, 0);

		// Build calendar grid
		const days: DayData[] = [];
		const current = new Date(startDate);

		while (current <= today) {
			const dateStr = current.toISOString().split('T')[0];
			const dayTasks = tasksByDate.get(dateStr) || [];
			days.push({
				date: new Date(current),
				dateStr,
				count: dayTasks.length,
				tasks: dayTasks
			});
			current.setDate(current.getDate() + 1);
		}

		return days;
	});

	// Group into weeks (columns)
	const weekColumns = $derived.by(() => {
		const columns: DayData[][] = [];
		let currentWeek: DayData[] = [];

		for (const day of calendarData) {
			const dayOfWeek = day.date.getDay();
			if (dayOfWeek === 0 && currentWeek.length > 0) {
				columns.push(currentWeek);
				currentWeek = [];
			}
			currentWeek.push(day);
		}
		if (currentWeek.length > 0) {
			columns.push(currentWeek);
		}

		return columns;
	});

	// Month labels - skip labels that would overlap (need ~3 columns of space)
	const monthLabels = $derived.by(() => {
		const labels: { month: string; col: number }[] = [];
		let lastMonth = -1;
		let lastLabelCol = -999; // Track last label position to avoid overlap

		weekColumns.forEach((week, colIndex) => {
			const firstDay = week[0];
			if (firstDay) {
				const month = firstDay.date.getMonth();
				if (month !== lastMonth) {
					// Only add label if there's enough space (3 columns = ~42px for "Sep" etc)
					if (colIndex - lastLabelCol >= 3) {
						labels.push({
							month: firstDay.date.toLocaleString('default', { month: 'short' }),
							col: colIndex
						});
						lastLabelCol = colIndex;
					}
					lastMonth = month;
				}
			}
		});

		return labels;
	});

	// Calculate max for intensity scaling
	const maxCount = $derived(
		Math.max(1, ...calendarData.map(d => d.count))
	);

	// Get intensity level (0-4)
	function getIntensity(count: number): number {
		if (count === 0) return 0;
		if (count === 1) return 1;
		const ratio = count / maxCount;
		if (ratio <= 0.33) return 2;
		if (ratio <= 0.66) return 3;
		return 4;
	}

	// Tooltip state
	let hoveredDay = $state<DayData | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	function handleMouseEnter(event: MouseEvent, day: DayData) {
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		tooltipX = rect.left + rect.width / 2;
		tooltipY = rect.top - 8;
		hoveredDay = day;
	}

	function handleMouseLeave() {
		hoveredDay = null;
	}

	// Format date for display
	function formatDate(date: Date): string {
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="streak-calendar">
	<!-- Month labels - positioned to align with week columns -->
	<div class="month-labels" style="grid-template-columns: 32px repeat({weekColumns.length}, 14px)">
		<div class="day-label-spacer"></div>
		{#each monthLabels as { month, col }}
			<span
				class="month-label"
				style="grid-column: {col + 2}"
			>
				{month}
			</span>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="calendar-grid">
		<!-- Day labels column -->
		<div class="day-labels">
			{#each dayLabels as label, i}
				<span class="day-label" style="grid-row: {i + 1}">{label}</span>
			{/each}
		</div>

		<!-- Week columns -->
		<div class="weeks-container">
			{#each weekColumns as week, colIndex}
				<div class="week-column">
					{#each week as day}
						<button
							class="day-cell intensity-{getIntensity(day.count)}"
							class:is-today={day.dateStr === new Date().toISOString().split('T')[0]}
							onmouseenter={(e) => handleMouseEnter(e, day)}
							onmouseleave={handleMouseLeave}
							onfocus={(e) => {
								const rect = (e.target as HTMLElement).getBoundingClientRect();
								tooltipX = rect.left + rect.width / 2;
								tooltipY = rect.top - 8;
								hoveredDay = day;
							}}
							onblur={handleMouseLeave}
							tabindex="0"
							aria-label="{day.count} task{day.count !== 1 ? 's' : ''} on {formatDate(day.date)}"
						>
							<span class="sr-only">{day.count} tasks</span>
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<!-- Legend -->
	<div class="legend">
		<span class="legend-label">Less</span>
		<div class="legend-cells">
			{#each [0, 1, 2, 3, 4] as level}
				<div class="legend-cell intensity-{level}"></div>
			{/each}
		</div>
		<span class="legend-label">More</span>
	</div>
</div>

<!-- Tooltip portal -->
{#if hoveredDay}
	<div
		class="calendar-tooltip"
		style="left: {tooltipX}px; top: {tooltipY}px"
	>
		<div class="tooltip-count">
			{hoveredDay.count} task{hoveredDay.count !== 1 ? 's' : ''}
		</div>
		<div class="tooltip-date">
			{formatDate(hoveredDay.date)}
		</div>
		{#if hoveredDay.tasks.length > 0}
			<div class="tooltip-tasks">
				{#each hoveredDay.tasks.slice(0, 3) as task}
					<div class="tooltip-task">{task.title.slice(0, 40)}{task.title.length > 40 ? '...' : ''}</div>
				{/each}
				{#if hoveredDay.tasks.length > 3}
					<div class="tooltip-more">+{hoveredDay.tasks.length - 3} more</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.streak-calendar {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.month-labels {
		display: grid;
		font-size: 10px;
		color: var(--color-base-content);
		opacity: 0.55;
		font-family: ui-monospace, monospace;
		letter-spacing: 0.02em;
	}

	.day-label-spacer {
		grid-column: 1;
	}

	.month-label {
		white-space: nowrap;
	}

	.calendar-grid {
		display: flex;
		gap: 4px;
	}

	.day-labels {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 9px;
		color: var(--color-base-content);
		opacity: 0.5;
		font-family: ui-monospace, monospace;
		width: 28px;
		padding-top: 2px;
	}

	.day-label {
		height: 11px;
		display: flex;
		align-items: center;
	}

	.weeks-container {
		display: flex;
		gap: 3px;
	}

	.week-column {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.day-cell {
		width: 11px;
		height: 11px;
		border-radius: 2px;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
		outline: none;
	}

	.day-cell:hover, .day-cell:focus {
		transform: scale(1.2);
		outline: 2px solid var(--color-warning);
		outline-offset: 1px;
	}

	.day-cell.is-today {
		outline: 1px solid var(--color-info);
		outline-offset: 0px;
	}

	/* Intensity levels - gold/amber theme for completions */
	.intensity-0 {
		background: var(--color-base-300);
	}

	.intensity-1 {
		background: color-mix(in oklch, var(--color-warning) 40%, var(--color-base-300));
	}

	.intensity-2 {
		background: color-mix(in oklch, var(--color-warning) 60%, var(--color-base-300));
	}

	.intensity-3 {
		background: color-mix(in oklch, var(--color-warning) 80%, var(--color-base-300));
	}

	.intensity-4 {
		background: var(--color-warning);
		box-shadow: 0 0 6px color-mix(in oklch, var(--color-warning) 40%, transparent);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		justify-content: flex-end;
		padding-right: 4px;
	}

	.legend-label {
		font-size: 9px;
		color: var(--color-base-content);
		opacity: 0.5;
		font-family: ui-monospace, monospace;
	}

	.legend-cells {
		display: flex;
		gap: 2px;
	}

	.legend-cell {
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}

	/* Tooltip */
	.calendar-tooltip {
		position: fixed;
		transform: translate(-50%, -100%);
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 6px;
		padding: 8px 10px;
		font-family: ui-monospace, monospace;
		font-size: 11px;
		z-index: 1000;
		pointer-events: none;
		box-shadow: 0 8px 24px color-mix(in oklch, var(--color-neutral) 50%, transparent);
		min-width: 140px;
		max-width: 280px;
	}

	.calendar-tooltip::after {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-top: 6px solid var(--color-base-300);
	}

	.tooltip-count {
		color: var(--color-warning);
		font-weight: 600;
		font-size: 12px;
	}

	.tooltip-date {
		color: var(--color-base-content);
		opacity: 0.6;
		margin-top: 2px;
	}

	.tooltip-tasks {
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid var(--color-base-300);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tooltip-task {
		color: var(--color-base-content);
		opacity: 0.75;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tooltip-more {
		color: var(--color-base-content);
		opacity: 0.55;
		font-style: italic;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
