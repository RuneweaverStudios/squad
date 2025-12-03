<script lang="ts">
	/**
	 * TerminalActivitySparkline
	 *
	 * A compact sparkline showing terminal output activity over time.
	 * Each bar represents activity in a time bucket (lines of output).
	 *
	 * Usage:
	 * ```svelte
	 * <TerminalActivitySparkline
	 *   activityData={[0, 5, 12, 3, 0, 8, 25, 2]}
	 *   maxBars={12}
	 *   height={16}
	 *   width={48}
	 * />
	 * ```
	 */

	interface Props {
		/** Array of activity values (lines of output per time bucket) */
		activityData?: number[];
		/** Maximum number of bars to show */
		maxBars?: number;
		/** Height in pixels */
		height?: number;
		/** Width in pixels */
		width?: number;
		/** Color for the bars (oklch) */
		color?: string;
		/** Whether to show tooltip on hover */
		showTooltip?: boolean;
	}

	let {
		activityData = [],
		maxBars = 12,
		height = 16,
		width = 48,
		color = 'oklch(0.65 0.15 200)',
		showTooltip = true
	}: Props = $props();

	// Get the last N data points
	// Use -1 for "no data yet" padding, 0 for "monitored but idle"
	const displayData = $derived(() => {
		const data = activityData.slice(-maxBars);
		// Pad with -1 (no data) if not enough data points yet
		while (data.length < maxBars) {
			data.unshift(-1);
		}
		return data;
	});

	// Calculate max value for scaling (ignore -1 padding values)
	const maxValue = $derived(() => {
		const positiveValues = displayData().filter(v => v > 0);
		return positiveValues.length > 0 ? Math.max(...positiveValues) : 1;
	});

	// Calculate bar width with gap
	const barWidth = $derived(() => {
		const gap = 1;
		return (width - (maxBars - 1) * gap) / maxBars;
	});

	// Calculate total activity
	const totalActivity = $derived(() => {
		return activityData.reduce((sum, v) => sum + v, 0);
	});

	// Recent activity (last 3 buckets)
	const recentActivity = $derived(() => {
		return activityData.slice(-3).reduce((sum, v) => sum + v, 0);
	});

	// Determine activity level for color intensity
	const activityLevel = $derived(() => {
		const recent = recentActivity();
		if (recent === 0) return 'idle';
		if (recent < 10) return 'low';
		if (recent < 50) return 'medium';
		return 'high';
	});

	// Dynamic color based on activity level
	const barColor = $derived(() => {
		switch (activityLevel()) {
			case 'idle': return 'oklch(0.40 0.02 250)';
			case 'low': return 'oklch(0.55 0.10 200)';
			case 'medium': return 'oklch(0.65 0.15 200)';
			case 'high': return 'oklch(0.70 0.20 145)';
			default: return color;
		}
	});
</script>

<div
	class="inline-flex items-end gap-px"
	style="height: {height}px; width: {width}px;"
	title={showTooltip ? `Activity: ${totalActivity()} events (recent: ${recentActivity()})` : undefined}
>
	{#each displayData() as value, i}
		{@const isNoData = value < 0}
		{@const isIdle = value === 0}
		{@const isActive = value > 0}
		{@const barHeight = isNoData ? 0 : isIdle ? 2 : Math.max((value / maxValue()) * height, 3)}
		{@const isRecent = i >= displayData().length - 3}
		<div
			class="rounded-sm transition-all duration-200"
			style="
				width: {barWidth()}px;
				height: {barHeight}px;
				background: {isIdle ? 'oklch(0.30 0.01 250)' : barColor()};
				opacity: {isNoData ? 0 : isRecent ? 1 : 0.5};
			"
		></div>
	{/each}
</div>
