<script lang="ts" module>
	/**
	 * Type exports for multi-series sparkline data
	 * These types are used by components that provide data to the Sparkline
	 */

	/** Single data point for single-series mode */
	export interface SparklineDataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	/** Multi-series data point for multi-project visualization */
	export interface MultiSeriesDataPoint {
		timestamp: string;
		/** Per-project token/cost data */
		projects: Record<string, { tokens: number; cost: number }>;
		/** Aggregate totals across all projects */
		total: { tokens: number; cost: number };
	}

	/** Project metadata for multi-series rendering */
	export interface ProjectMeta {
		name: string;
		color: string;
		totalTokens: number;
	}

	/** Multi-series chart mode */
	export type MultiSeriesMode = 'stacked' | 'overlay';
</script>

<script lang="ts">
	/**
	 * Sparkline Component
	 *
	 * Lightweight SVG-based sparkline for token usage visualization.
	 * Features hover-to-expand controls for chart type, time range, and display options.
	 * Color-coded based on usage thresholds with configurable defaults.
	 *
	 * @example Single-series (original usage)
	 * ```svelte
	 * <Sparkline
	 *   data={sparklineData}
	 *   height={40}
	 *   defaultTimeRange="24h"
	 *   defaultColorMode="usage"
	 *   showStyleToolbar={true}
	 * />
	 * ```
	 *
	 * @example Multi-series (multi-project mode)
	 * ```svelte
	 * <Sparkline
	 *   multiSeriesData={multiProjectData}
	 *   projectMeta={projectMetadata}
	 *   showLegend={true}
	 *   height={60}
	 * />
	 * ```
	 */

	import { formatTokens, formatCost, getUsageColor } from '$lib/utils/numberFormat.js';
	import { slide } from 'svelte/transition';

	// ============================================================================
	// Props
	// ============================================================================

	interface DataPoint {
		timestamp: string;
		tokens: number;
		cost: number;
	}

	/** Multi-series data point for multi-project visualization */
	interface MultiSeriesDataPoint {
		timestamp: string;
		/** Per-project token/cost data */
		projects: Record<string, { tokens: number; cost: number }>;
		/** Aggregate totals across all projects */
		total: { tokens: number; cost: number };
	}

	/** Project metadata for multi-series rendering */
	interface ProjectMeta {
		name: string;
		color: string;
		totalTokens: number;
	}

	/** Multi-series chart mode: stacked areas or overlapping lines */
	type MultiSeriesMode = 'stacked' | 'overlay';

	interface Props {
		/** Time-series data points (single-series mode) */
		data?: DataPoint[];
		/** Multi-series data points (multi-project mode) */
		multiSeriesData?: MultiSeriesDataPoint[];
		/** Project metadata with colors (required for multi-series) */
		projectMeta?: ProjectMeta[];
		/** Width in pixels or '100%' for responsive (default: '100%') */
		width?: number | string;
		/** Height in pixels (default: 40) */
		height?: number;
		/** Show tooltip on hover (default: true) */
		showTooltip?: boolean;
		/** Show grid lines (default: false) */
		showGrid?: boolean;
		/** Color mode: 'usage' for threshold-based, 'static' for single color (default: 'usage') */
		colorMode?: 'usage' | 'static';
		/** Static color when colorMode='static' */
		staticColor?: string;
		/** Show style toolbar (default: true) - DEPRECATED: use showStyleToolbar for backward compatibility */
		showStyleToolbar?: boolean;
		/** Default time range for initial display (default: '12h') */
		defaultTimeRange?: '12h' | '24h' | '7d' | '30d' | 'all';
		/** Default color mode for initial display (default: 'usage') */
		defaultColorMode?: 'usage' | 'static';
		/** Show compact legend for multi-series (default: false) */
		showLegend?: boolean;
		/** Show legend inside the hover toolbar (default: false) */
		showLegendInToolbar?: boolean;
		/** Enable draw animation (line draws left-to-right) */
		animate?: boolean;
	}

	let {
		data = [],
		multiSeriesData,
		projectMeta,
		width = '100%',
		height = 40,
		showTooltip = true,
		showGrid = false,
		colorMode = 'usage',
		staticColor = 'oklch(0.70 0.18 145)',
		showStyleToolbar = true,
		defaultTimeRange = '12h',
		defaultColorMode = 'usage',
		showLegend = false,
		showLegendInToolbar = false,
		animate = true
	}: Props = $props();

	// Determine if we're in multi-series mode
	const isMultiSeries = $derived(multiSeriesData && multiSeriesData.length > 0 && projectMeta && projectMeta.length > 0);

	// ============================================================================
	// State
	// ============================================================================

	type ChartType = 'line' | 'bars' | 'area' | 'dots';
	type TimeRange = '12h' | '24h' | '7d' | '30d' | 'all' | 'custom';
	let chartType = $state<ChartType>('line');
	let timeRange = $state<TimeRange>(defaultTimeRange); // Initialize from prop

	// Animation key - only computed when animate is true
	// Uses data length as a proxy for "new data arrived"
	const animationKey = $derived.by(() => {
		if (!animate) return 0;
		// Use a combination of lengths to create a unique key when data changes
		return (data?.length ?? 0) + ((multiSeriesData?.length ?? 0) * 1000);
	});

	// Multi-series mode (stacked vs overlay) - persisted globally via localStorage
	const MULTI_SERIES_MODE_KEY = 'sparkline-multi-series-mode';
	let multiSeriesMode = $state<MultiSeriesMode>('stacked');

	// Initialize multi-series mode from localStorage on mount
	$effect(() => {
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(MULTI_SERIES_MODE_KEY);
			if (stored === 'stacked' || stored === 'overlay') {
				multiSeriesMode = stored;
			}
		}
	});

	// Persist multi-series mode changes to localStorage
	function setMultiSeriesMode(mode: MultiSeriesMode) {
		multiSeriesMode = mode;
		if (typeof window !== 'undefined') {
			localStorage.setItem(MULTI_SERIES_MODE_KEY, mode);
		}
	}
	let hoveredIndex = $state<number | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let svgElement: SVGSVGElement;
	let showControls = $state(false); // Hover-to-expand control panel
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null; // Delay before hiding controls
	let customDateFrom = $state<string>(''); // Custom date range start (YYYY-MM-DD)
	let customDateTo = $state<string>(''); // Custom date range end (YYYY-MM-DD)
	let showCustomDatePicker = $state(false); // Show custom date inputs

	// Options toggles
	let internalShowGrid = $state(false); // Internal grid toggle state (starts off, user can toggle)
	let smoothCurves = $state(true); // Enable bezier curve smoothing
	let internalColorMode = $state<'usage' | 'static'>(defaultColorMode); // Initialize from prop
	let selectedPaletteColor = $state('oklch(0.70 0.18 145)'); // Default to green

	// Color palette options - using oklch for theme-aware colors
	const colorPalette = [
		{ name: 'Green', color: 'oklch(0.70 0.18 145)' }, // Green
		{ name: 'Blue', color: 'oklch(0.70 0.18 220)' }, // Blue
		{ name: 'Orange', color: 'oklch(0.75 0.18 60)' }, // Orange
		{ name: 'Red', color: 'oklch(0.65 0.20 30)' }, // Red
		{ name: 'Purple', color: 'oklch(0.65 0.18 280)' }, // Purple
		{ name: 'Pink', color: 'oklch(0.75 0.18 340)' } // Pink
	];

	// ============================================================================
	// Computed Values
	// ============================================================================

	/** SVG viewBox dimensions */
	const viewBoxWidth = 100;
	const viewBoxHeight = 100;
	const padding = 2;

	/** Filter data based on selected time range */
	const filteredData = $derived.by(() => {
		if (!data || data.length === 0) return [];

		const now = new Date();
		let cutoffTime: Date;

		switch (timeRange) {
			case '12h':
				cutoffTime = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
				break;
			case '24h':
				cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
				break;
			case '7d':
				cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
				break;
			case '30d':
				cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
				break;
			case 'all':
				return data; // Return all data
			case 'custom':
				// Custom date range filtering
				if (!customDateFrom && !customDateTo) {
					// No custom dates set, show all data
					return data;
				}

				const fromDate = customDateFrom ? new Date(customDateFrom) : new Date(0); // Start of epoch if not set
				const toDate = customDateTo ? new Date(customDateTo) : now; // Current time if not set

				// Add one day to toDate to include the entire end date
				toDate.setHours(23, 59, 59, 999);

				return data.filter((point) => {
					const pointDate = new Date(point.timestamp);
					return pointDate >= fromDate && pointDate <= toDate;
				});
			default:
				cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
		}

		// Filter data points after the cutoff time
		return data.filter((point) => new Date(point.timestamp) >= cutoffTime);
	});

	/** Calculate Y-axis range */
	const yRange = $derived.by(() => {
		if (!filteredData || filteredData.length === 0) {
			return { min: 0, max: 1 };
		}

		const tokens = filteredData.map((d) => d.tokens);
		const min = Math.min(...tokens);
		const max = Math.max(...tokens);

		// Add 10% padding to top and bottom
		const range = max - min;
		const paddedMin = Math.max(0, min - range * 0.1);
		const paddedMax = max + range * 0.1;

		return { min: paddedMin, max: paddedMax };
	});

	// ============================================================================
	// Multi-Series Computed Values
	// ============================================================================

	/** Filter multi-series data based on selected time range */
	const filteredMultiSeriesData = $derived.by(() => {
		if (!multiSeriesData || multiSeriesData.length === 0) return [];

		const now = new Date();
		let cutoffTime: Date;

		switch (timeRange) {
			case '12h':
				cutoffTime = new Date(now.getTime() - 12 * 60 * 60 * 1000);
				break;
			case '24h':
				cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
				break;
			case '7d':
				cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
				break;
			case '30d':
				cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
				break;
			case 'all':
				return multiSeriesData;
			case 'custom':
				if (!customDateFrom && !customDateTo) return multiSeriesData;
				const fromDate = customDateFrom ? new Date(customDateFrom) : new Date(0);
				const toDate = customDateTo ? new Date(customDateTo) : now;
				toDate.setHours(23, 59, 59, 999);
				return multiSeriesData.filter((point) => {
					const pointDate = new Date(point.timestamp);
					return pointDate >= fromDate && pointDate <= toDate;
				});
			default:
				cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		}

		return multiSeriesData.filter((point) => new Date(point.timestamp) >= cutoffTime);
	});

	/** Get active projects (non-zero tokens in filtered time range) sorted by total tokens */
	const activeProjects = $derived.by(() => {
		if (!projectMeta || !filteredMultiSeriesData || filteredMultiSeriesData.length === 0) return [];

		// Sum tokens per project across filtered data
		const projectTotals = new Map<string, number>();
		for (const point of filteredMultiSeriesData) {
			for (const [projectName, data] of Object.entries(point.projects)) {
				projectTotals.set(projectName, (projectTotals.get(projectName) || 0) + data.tokens);
			}
		}

		// Filter and sort by total tokens (descending)
		return projectMeta
			.filter((p) => (projectTotals.get(p.name) || 0) > 0)
			.map((p) => ({ ...p, totalTokens: projectTotals.get(p.name) || 0 }))
			.sort((a, b) => b.totalTokens - a.totalTokens);
	});

	/** Calculate Y-axis range for multi-series data */
	const multiSeriesYRange = $derived.by(() => {
		if (!filteredMultiSeriesData || filteredMultiSeriesData.length === 0) {
			return { min: 0, max: 1 };
		}

		let maxValue: number;
		if (multiSeriesMode === 'stacked') {
			// For stacked: max is the highest total across all time points
			maxValue = Math.max(...filteredMultiSeriesData.map((d) => d.total.tokens));
		} else {
			// For overlay: max is the highest individual project value
			maxValue = 0;
			for (const point of filteredMultiSeriesData) {
				for (const data of Object.values(point.projects)) {
					if (data.tokens > maxValue) maxValue = data.tokens;
				}
			}
		}

		// Add 10% padding
		const paddedMax = maxValue * 1.1;
		return { min: 0, max: paddedMax || 1 };
	});

	/** Scale Y value to SVG coordinates for multi-series */
	function scaleMultiSeriesY(value: number): number {
		if (multiSeriesYRange.max === multiSeriesYRange.min) return viewBoxHeight - padding;
		const normalized = value / multiSeriesYRange.max;
		return viewBoxHeight - padding - normalized * (viewBoxHeight - 2 * padding);
	}

	// ============================================================================
	// Single-Series Computed Values (continued)
	// ============================================================================

	/** Scale Y value to SVG coordinates */
	function scaleY(value: number): number {
		if (yRange.max === yRange.min) return viewBoxHeight / 2;

		const normalized = (value - yRange.min) / (yRange.max - yRange.min);
		return viewBoxHeight - padding - normalized * (viewBoxHeight - 2 * padding);
	}

	/** Generate SVG path from data points */
	const pathData = $derived.by(() => {
		if (!filteredData || filteredData.length === 0) return '';

		const points = filteredData.map((point, index) => {
			const x = padding + (index / (filteredData.length - 1 || 1)) * (viewBoxWidth - 2 * padding);
			const y = scaleY(point.tokens);
			return { x, y };
		});

		let path = `M ${points[0].x},${points[0].y}`;

		if (smoothCurves) {
			// Smooth curve using cubic bezier
			for (let i = 1; i < points.length; i++) {
				const prev = points[i - 1];
				const curr = points[i];
				const cpX1 = prev.x + (curr.x - prev.x) / 3;
				const cpY1 = prev.y;
				const cpX2 = prev.x + (2 * (curr.x - prev.x)) / 3;
				const cpY2 = curr.y;
				path += ` C ${cpX1},${cpY1} ${cpX2},${cpY2} ${curr.x},${curr.y}`;
			}
		} else {
			// Straight lines
			for (let i = 1; i < points.length; i++) {
				path += ` L ${points[i].x},${points[i].y}`;
			}
		}

		return path;
	});

	// Memoize token range for color calculations - avoids recalculating min/max on every color lookup
	const tokenRange = $derived.by(() => {
		if (!filteredData || filteredData.length === 0) {
			return { min: 0, max: 0, range: 0 };
		}
		const allTokens = filteredData.map((d) => d.tokens);
		const min = Math.min(...allTokens);
		const max = Math.max(...allTokens);
		return { min, max, range: max - min };
	});

	// Color lookup - avoids repeated string allocations, using oklch
	const percentileColors = ['oklch(0.70 0.18 145)', 'oklch(0.70 0.18 220)', 'oklch(0.75 0.18 60)', 'oklch(0.65 0.20 30)'] as const;

	/** Calculate color for a specific data point based on relative position in range */
	function getColorForValue(tokens: number): string {
		if (internalColorMode === 'static') {
			return selectedPaletteColor;
		}

		if (tokenRange.range === 0) return percentileColors[0]; // Default green

		// Calculate percentile position (0-100) using memoized range
		const percentile = ((tokens - tokenRange.min) / tokenRange.range) * 100;

		// Color gradient using lookup
		if (percentile < 25) return percentileColors[0]; // Green - bottom 25%
		if (percentile < 50) return percentileColors[1]; // Blue - 25-50%
		if (percentile < 75) return percentileColors[2]; // Orange - 50-75%
		return percentileColors[3]; // Red - top 25%
	}

	/** Calculate line color based on average usage */
	const lineColor = $derived.by(() => {
		if (!filteredData || filteredData.length === 0) return 'oklch(0.70 0.18 145)'; // Default green
		const avgTokens = filteredData.reduce((sum, d) => sum + d.tokens, 0) / filteredData.length;
		return getColorForValue(avgTokens);
	});

	/** Hovered data point (single-series) */
	const hoveredPoint = $derived.by(() => {
		if (hoveredIndex === null || !filteredData) return null;
		return filteredData[hoveredIndex];
	});

	/** Hovered data point (multi-series) */
	const hoveredMultiSeriesPoint = $derived.by(() => {
		if (hoveredIndex === null || !filteredMultiSeriesData || filteredMultiSeriesData.length === 0) return null;
		return filteredMultiSeriesData[hoveredIndex];
	});

	// Time range label lookup - avoids switch on every render
	const timeRangeLabelMap: Record<TimeRange, string> = {
		'12h': '12hr',
		'24h': '24hr',
		'7d': '7d',
		'30d': '30d',
		'all': 'All',
		'custom': 'Custom'
	};

	/** Time range label for badge based on selected timeRange */
	const timeRangeLabel = $derived.by(() => {
		if (timeRange === 'custom' && customDateFrom && customDateTo) {
			const from = new Date(customDateFrom);
			const to = new Date(customDateTo);
			return `${from.getMonth() + 1}/${from.getDate()} - ${to.getMonth() + 1}/${to.getDate()}`;
		}
		return timeRangeLabelMap[timeRange] ?? '24hr';
	});

	// Chart icon paths - static lookup avoids switch on every render
	const chartIconPaths: Record<ChartType, string> = {
		line: 'M2 12 L5 8 L8 10 L14 4',
		bars: 'M2 14v-4h2v4zm4 0V8h2v6zm4 0V10h2v4zm4 0V6h2v8z',
		area: 'M2 14 L2 12 L5 8 L8 10 L14 4 L14 14 Z',
		dots: 'M2 12h.01M5 8h.01M8 10h.01M11 6h.01M14 4h.01'
	};

	/** Chart icon SVG path for badge */
	const chartIconPath = $derived(chartIconPaths[chartType] ?? chartIconPaths.line);

	// ============================================================================
	// Event Handlers
	// ============================================================================

	/**
	 * Handle mouse move over SVG to show tooltip
	 */
	function handleMouseMove(event: MouseEvent) {
		if (!showTooltip || !svgElement) return;

		// Determine which data source to use
		const dataSource = isMultiSeries ? filteredMultiSeriesData : filteredData;
		if (!dataSource || dataSource.length === 0) return;

		// Get mouse position relative to SVG
		const rect = svgElement.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;

		// Calculate which data point is closest
		const index = Math.round(((mouseX / rect.width) * (dataSource.length - 1)));
		const clampedIndex = Math.max(0, Math.min(dataSource.length - 1, index));

		hoveredIndex = clampedIndex;
		tooltipX = event.clientX;
		tooltipY = event.clientY;
	}

	/**
	 * Handle mouse leave to hide tooltip
	 */
	function handleMouseLeave() {
		hoveredIndex = null;
	}

	/**
	 * Format timestamp for tooltip
	 */
	function formatTimestamp(timestamp: string): string {
		if (!timestamp) return 'No timestamp';

		const date = new Date(timestamp);

		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	/**
	 * Handle custom date range button click
	 */
	function handleCustomRangeClick() {
		if (timeRange === 'custom') {
			// If already in custom mode, toggle the date picker visibility
			showCustomDatePicker = !showCustomDatePicker;
		} else {
			// Switch to custom mode and show date picker
			timeRange = 'custom';
			showCustomDatePicker = true;
		}
	}

	/**
	 * Apply custom date range (validates and updates timeRange)
	 */
	function applyCustomRange() {
		if (!customDateFrom || !customDateTo) {
			// Invalid: need both dates
			return;
		}

		const from = new Date(customDateFrom);
		const to = new Date(customDateTo);

		if (from > to) {
			// Invalid: from date must be before to date
			// Swap them automatically
			[customDateFrom, customDateTo] = [customDateTo, customDateFrom];
		}

		// Close date picker after applying
		showCustomDatePicker = false;
	}
</script>

<div
	class="sparkline-container"
	style="width: {typeof width === 'number' ? width + 'px' : width};"
	onmouseenter={() => {
		if (showStyleToolbar) {
			if (hideControlsTimeout) clearTimeout(hideControlsTimeout);
			showControls = true;
		}
	}}
	onmouseleave={() => {
		hideControlsTimeout = setTimeout(() => {
			showControls = false;
		}, 200);
	}}
	role="group"
	aria-label="Interactive sparkline chart"
>
	<!-- Expanded Controls Panel (Hover State) -->
	{#if showStyleToolbar && showControls}
		<div
			class="sparkline-controls-panel"
			transition:slide={{ duration: 200 }}
			onmouseenter={() => {
				if (hideControlsTimeout) clearTimeout(hideControlsTimeout);
				showControls = true;
			}}
			onmouseleave={() => {
				hideControlsTimeout = setTimeout(() => {
					showControls = false;
				}, 200);
			}}
		>
			<div class="p-1 bg-base-200 rounded-lg shadow-lg border border-base-300 space-y-0.5">
				<!-- Chart Type Section -->
				<div>
					<div class="flex flex-wrap gap-1.5 p-1 bg-base-200 rounded-lg">
						<button
							class="badge badge-sm transition-all duration-200 cursor-pointer {chartType === 'line' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
							onclick={() => (chartType = 'line')}
							title="Line chart"
						>
							<svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M2 12 L5 8 L8 10 L14 4" stroke-linecap="round" />
							</svg>
						</button>
						<button
							class="badge badge-sm transition-all duration-200 cursor-pointer {chartType === 'bars' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
							onclick={() => (chartType = 'bars')}
							title="Bar chart"
						>
							<svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
								<rect x="1" y="8" width="2" height="6" />
								<rect x="4" y="4" width="2" height="10" />
								<rect x="7" y="6" width="2" height="8" />
								<rect x="10" y="2" width="2" height="12" />
								<rect x="13" y="5" width="2" height="9" />
							</svg>
						</button>
						<button
							class="badge badge-sm transition-all duration-200 cursor-pointer {chartType === 'area' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
							onclick={() => (chartType = 'area')}
							title="Area chart"
						>
							<svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
								<path d="M2 14 L2 12 L5 8 L8 10 L14 4 L14 14 Z" />
							</svg>
						</button>
						<button
							class="badge badge-sm transition-all duration-200 cursor-pointer {chartType === 'dots' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
							onclick={() => (chartType = 'dots')}
							title="Dot plot"
						>
							<svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
								<circle cx="2" cy="12" r="1.5" />
								<circle cx="5" cy="8" r="1.5" />
								<circle cx="8" cy="10" r="1.5" />
								<circle cx="11" cy="6" r="1.5" />
								<circle cx="14" cy="4" r="1.5" />
							</svg>
						</button>
					</div>
				</div>

				<!-- Multi-Series Mode Section (only shown when multi-series data is present) -->
				{#if isMultiSeries}
					<div>
						<div class="flex flex-wrap gap-1.5 p-1 bg-base-200 rounded-lg">
							<button
								class="badge badge-sm transition-all duration-200 cursor-pointer {multiSeriesMode === 'stacked' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
								onclick={() => setMultiSeriesMode('stacked')}
								title="Stacked area chart - shows cumulative total"
							>
								<svg class="w-3 h-3 mr-1" viewBox="0 0 16 16" fill="currentColor" opacity="0.8">
									<path d="M1 14 L1 10 L4 8 L8 9 L12 6 L15 7 L15 14 Z" opacity="0.4" />
									<path d="M1 14 L1 12 L4 10 L8 11 L12 8 L15 9 L15 14 Z" opacity="0.6" />
								</svg>
								Stacked
							</button>
							<button
								class="badge badge-sm transition-all duration-200 cursor-pointer {multiSeriesMode === 'overlay' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
								onclick={() => setMultiSeriesMode('overlay')}
								title="Overlay lines - compare project patterns"
							>
								<svg class="w-3 h-3 mr-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M1 12 L5 8 L9 10 L15 4" stroke-linecap="round" />
									<path d="M1 10 L5 6 L9 8 L15 6" stroke-linecap="round" opacity="0.5" />
								</svg>
								Overlay
							</button>
						</div>
					</div>
				{/if}

				<!-- Time Range Section -->
				<div>
					<div class="flex items-center gap-1 flex-wrap">
						<button
							class="btn btn-xs {timeRange === '12h' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								timeRange = '12h';
								showCustomDatePicker = false;
							}}
							title="Last 12 hours"
						>
							12hr
						</button>
						<button
							class="btn btn-xs {timeRange === '24h' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								timeRange = '24h';
								showCustomDatePicker = false;
							}}
							title="Last 24 hours"
						>
							24hr
						</button>
						<button
							class="btn btn-xs {timeRange === '7d' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								timeRange = '7d';
								showCustomDatePicker = false;
							}}
							title="Last 7 days"
						>
							7d
						</button>
						<button
							class="btn btn-xs {timeRange === '30d' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								timeRange = '30d';
								showCustomDatePicker = false;
							}}
							title="Last 30 days"
						>
							30d
						</button>
						<button
							class="btn btn-xs {timeRange === 'all' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								timeRange = 'all';
								showCustomDatePicker = false;
							}}
							title="All time"
						>
							All
						</button>
						<button
									class="btn btn-xs {timeRange === 'custom' ? 'btn-primary' : 'btn-ghost'}"
									onclick={handleCustomRangeClick}
									title="Custom date range"
								>
									Custom
								</button>
							</div>

							<!-- Custom Date Range Picker -->
							{#if showCustomDatePicker}
								<div class="mt-2 p-1 bg-base-100 rounded-md border border-base-300 space-y-2" transition:slide={{ duration: 150 }}>
									<div class="grid grid-cols-2 gap-2">
										<!-- From Date -->
										<div class="form-control">
											<label class="label py-0">
												<span class="label-text text-xs">From</span>
											</label>
											<input
												type="date"
												class="input input-xs input-bordered w-full"
												bind:value={customDateFrom}
												placeholder="Start date"
											/>
										</div>

										<!-- To Date -->
										<div class="form-control">
											<label class="label py-0">
												<span class="label-text text-xs">To</span>
											</label>
											<input
												type="date"
												class="input input-xs input-bordered w-full"
												bind:value={customDateTo}
												placeholder="End date"
											/>
										</div>
									</div>

									<!-- Apply Button -->
									<button
										class="btn btn-xs btn-primary w-full"
										onclick={applyCustomRange}
										disabled={!customDateFrom || !customDateTo}
									>
										Apply Range
									</button>
								</div>
							{/if}
						</div>

						<!-- Options Section -->
						<div>
							<div class="flex flex-wrap gap-1.5 p-1 bg-base-200 rounded-lg">
								<!-- Show Grid Toggle -->
								<button
									class="badge badge-sm transition-all duration-200 cursor-pointer {internalShowGrid ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
									onclick={() => (internalShowGrid = !internalShowGrid)}
									title="Toggle grid lines"
								>
									{#if internalShowGrid}
										<svg class="w-3 h-3 mr-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
											<path d="M2 2 L2 14 L14 14" stroke-linecap="round" />
											<path d="M2 6 L14 6 M2 10 L14 10" stroke-linecap="round" stroke-dasharray="1 2" opacity="0.5" />
										</svg>
									{/if}
									Grid
								</button>

								<!-- Smooth Curves Toggle -->
								<button
									class="badge badge-sm transition-all duration-200 cursor-pointer {smoothCurves ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
									onclick={() => (smoothCurves = !smoothCurves)}
									title="Toggle smooth curves"
								>
									{#if smoothCurves}
										<svg class="w-3 h-3 mr-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
											<path d="M2 12 Q5 8, 8 10 T14 4" stroke-linecap="round" />
										</svg>
									{/if}
									Smooth
								</button>
							</div>

							<!-- Color Section (only for single-series) -->
							{#if !isMultiSeries}
							<div>
								<div class="flex flex-wrap gap-1.5 p-1 bg-base-200 rounded-lg items-center">
									<!-- Auto (Percentile-based) -->
									<button
										class="badge badge-sm transition-all duration-200 cursor-pointer {internalColorMode === 'usage' ? 'badge-primary shadow-md' : 'badge-ghost hover:badge-primary/20 hover:shadow-sm hover:scale-105'}"
										onclick={() => (internalColorMode = 'usage')}
										title="Auto percentile-based colors"
									>
										Auto
									</button>

									<!-- Color Palette Options -->
									{#each colorPalette as paletteColor}
										<button
											class="w-6 h-6 rounded-full border-2 transition-all {internalColorMode === 'static' && selectedPaletteColor === paletteColor.color ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-base-300 hover:scale-105 hover:border-base-400'}"
											style="background-color: {paletteColor.color};"
											onclick={() => {
												internalColorMode = 'static';
												selectedPaletteColor = paletteColor.color;
											}}
											title={paletteColor.name}
										></button>
									{/each}
								</div>
							</div>
							{/if}

							<!-- Project Legend (multi-series only, shown in toolbar) -->
							{#if showLegendInToolbar && isMultiSeries && activeProjects.length > 0}
								<div class="border-t border-base-300 pt-1 mt-1">
									<div class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1 px-1">Projects</div>
									<div class="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
										{#each activeProjects as project}
											{@const formattedTokens = project.totalTokens >= 1_000_000
												? `${(project.totalTokens / 1_000_000).toFixed(1)}M`
												: project.totalTokens >= 1_000
													? `${(project.totalTokens / 1_000).toFixed(0)}K`
													: project.totalTokens.toString()}
											<div class="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-base-300/50 transition-colors">
												<div class="flex items-center gap-1.5">
													<div
														class="w-2.5 h-2.5 rounded-full flex-shrink-0"
														style="background-color: {project.color};"
													></div>
													<span class="text-xs font-medium truncate max-w-[100px]">{project.name}</span>
												</div>
												<span class="text-xs font-mono text-base-content/60">{formattedTokens}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
		</div>
	{/if}

	<svg
		bind:this={svgElement}
		viewBox="0 0 {viewBoxWidth} {viewBoxHeight}"
		preserveAspectRatio="none"
		style="height: {height}px; width: 100%; border-radius: 0.375rem;"
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
		role="img"
		aria-label="Token usage sparkline"
	>
		<!-- Optional grid lines -->
		{#if internalShowGrid}
			<!-- Horizontal grid lines (5 lines for better visibility) -->
			{#each [0.2, 0.4, 0.5, 0.6, 0.8] as ratio}
				<line
					x1={padding}
					y1={viewBoxHeight * ratio}
					x2={viewBoxWidth - padding}
					y2={viewBoxHeight * ratio}
					stroke="currentColor"
					opacity={ratio === 0.5 ? 0.15 : 0.08}
					stroke-width="0.5"
					stroke-dasharray={ratio === 0.5 ? '0' : '2,2'}
				/>
			{/each}
			<!-- Vertical grid lines (4 lines) -->
			{#each [0.25, 0.5, 0.75] as ratio}
				<line
					x1={viewBoxWidth * ratio}
					y1={padding}
					x2={viewBoxWidth * ratio}
					y2={viewBoxHeight - padding}
					stroke="currentColor"
					opacity="0.06"
					stroke-width="0.5"
					stroke-dasharray="2,2"
				/>
			{/each}
		{/if}

		<!-- Multi-Series Chart Rendering -->
		{#if isMultiSeries && filteredMultiSeriesData.length > 0}
			{@const dataLength = filteredMultiSeriesData.length}

			{#if chartType === 'bars'}
				<!-- Multi-Series Bar Chart -->
				{@const barGroupWidth = (viewBoxWidth - 2 * padding) / dataLength * 0.8}
				{@const barWidth = barGroupWidth / activeProjects.length}
				{#each filteredMultiSeriesData as point, dataIndex}
					{@const groupX = padding + (dataIndex / (dataLength - 1 || 1)) * (viewBoxWidth - 2 * padding) - barGroupWidth / 2}
					{#each activeProjects as project, projectIndex}
						{@const tokens = point.projects[project.name]?.tokens || 0}
						{@const barHeight = tokens > 0 ? Math.max(1, ((tokens / multiSeriesYRange.max) * (viewBoxHeight - 2 * padding))) : 0}
						{@const barX = groupX + projectIndex * barWidth}
						<rect
							x={barX}
							y={viewBoxHeight - padding - barHeight}
							width={Math.max(0.5, barWidth - 0.5)}
							height={barHeight}
							fill={project.color}
							fill-opacity="0.8"
							rx="0.5"
							style="transition: height 0.3s ease, y 0.3s ease;"
						/>
					{/each}
				{/each}

			{:else if chartType === 'dots'}
				<!-- Multi-Series Dots Chart -->
				{#each activeProjects as project}
					{#each filteredMultiSeriesData as point, dataIndex}
						{@const tokens = point.projects[project.name]?.tokens || 0}
						{#if tokens > 0}
							{@const x = padding + (dataIndex / (dataLength - 1 || 1)) * (viewBoxWidth - 2 * padding)}
							{@const y = scaleMultiSeriesY(tokens)}
							<circle
								cx={x}
								cy={y}
								r="2"
								fill={project.color}
								fill-opacity="0.8"
							/>
						{/if}
					{/each}
				{/each}

			{:else if chartType === 'area' || multiSeriesMode === 'stacked'}
				<!-- Stacked Area Chart -->
				{#key animate ? animationKey : 0}
					{#each activeProjects as project, projectIndex}
						{@const projectColor = project.color}
						{@const paths = (() => {
							const stackedPoints: Array<{ x: number; y: number; baseY: number }> = [];

							for (let i = 0; i < dataLength; i++) {
								const point = filteredMultiSeriesData[i];
								const x = padding + (i / (dataLength - 1 || 1)) * (viewBoxWidth - 2 * padding);

								let baseValue = 0;
								for (let j = projectIndex + 1; j < activeProjects.length; j++) {
									const otherProject = activeProjects[j];
									baseValue += point.projects[otherProject.name]?.tokens || 0;
								}

								const thisValue = point.projects[project.name]?.tokens || 0;
								const topValue = baseValue + thisValue;

								stackedPoints.push({
									x,
									y: scaleMultiSeriesY(topValue),
									baseY: scaleMultiSeriesY(baseValue)
								});
							}

							const topPath = stackedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
							const bottomPath = [...stackedPoints].reverse().map((p) => `L ${p.x},${p.baseY}`).join(' ');

							return { area: `${topPath} ${bottomPath} Z`, line: topPath };
						})()}
						<path
							d={paths.area}
							fill={projectColor}
							class={animate ? 'sparkline-area-animate' : ''}
							style="{animate ? `animation-delay: ${projectIndex * 0.1}s;` : 'fill-opacity: 0.4; transition: d 0.3s ease;'}"
						/>
						<path
							d={paths.line}
							fill="none"
							stroke={projectColor}
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							pathLength="1"
							class={animate ? 'sparkline-animate' : ''}
							style="{animate ? `animation-delay: ${projectIndex * 0.1}s;` : 'transition: d 0.3s ease;'}"
						/>
					{/each}
				{/key}

			{:else}
				<!-- Multi-Line Chart (default for 'line' chartType or 'overlay' mode) -->
				{#key animate ? animationKey : 0}
					{#each activeProjects as project, projectIndex}
						{@const projectColor = project.color}
						{@const linePath = (() => {
							const points: Array<{ x: number; y: number }> = [];

							for (let i = 0; i < dataLength; i++) {
								const point = filteredMultiSeriesData[i];
								const x = padding + (i / (dataLength - 1 || 1)) * (viewBoxWidth - 2 * padding);
								const tokens = point.projects[project.name]?.tokens || 0;
								const y = scaleMultiSeriesY(tokens);
								points.push({ x, y });
							}

							if (points.length === 0) return '';

							let path = `M ${points[0].x},${points[0].y}`;
							if (smoothCurves && points.length > 1) {
								for (let i = 1; i < points.length; i++) {
									const prev = points[i - 1];
									const curr = points[i];
									const cpX1 = prev.x + (curr.x - prev.x) / 3;
									const cpY1 = prev.y;
									const cpX2 = prev.x + (2 * (curr.x - prev.x)) / 3;
									const cpY2 = curr.y;
									path += ` C ${cpX1},${cpY1} ${cpX2},${cpY2} ${curr.x},${curr.y}`;
								}
							} else {
								for (let i = 1; i < points.length; i++) {
									path += ` L ${points[i].x},${points[i].y}`;
								}
							}

							return path;
						})()}
						<path
							d={linePath}
							fill="none"
							stroke={projectColor}
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-opacity="0.8"
							pathLength="1"
							class={animate ? 'sparkline-animate' : ''}
							style="{animate ? `animation-delay: ${projectIndex * 0.15}s;` : 'transition: d 0.3s ease;'}"
						/>
					{/each}
				{/key}
			{/if}

			<!-- Multi-Series Hover indicator (vertical line) -->
			{#if hoveredIndex !== null && filteredMultiSeriesData.length > 0}
				{@const dataLength = filteredMultiSeriesData.length}
				{@const x = padding + (hoveredIndex / (dataLength - 1 || 1)) * (viewBoxWidth - 2 * padding)}
				<line
					x1={x}
					y1={padding}
					x2={x}
					y2={viewBoxHeight - padding}
					stroke="currentColor"
					stroke-width="1"
					stroke-opacity="0.3"
					stroke-dasharray="2,2"
				/>
				<!-- Dots for each project at hover position -->
				{@const hoveredPoint = filteredMultiSeriesData[hoveredIndex]}
				{#each activeProjects as project, projectIndex}
					{@const tokens = hoveredPoint.projects[project.name]?.tokens || 0}
					{#if tokens > 0}
						{@const y = multiSeriesMode === 'stacked'
							? (() => {
								// Calculate stacked Y position
								let baseValue = 0;
								for (let j = projectIndex + 1; j < activeProjects.length; j++) {
									baseValue += hoveredPoint.projects[activeProjects[j].name]?.tokens || 0;
								}
								return scaleMultiSeriesY(baseValue + tokens);
							})()
							: scaleMultiSeriesY(tokens)}
						<circle
							cx={x}
							cy={y}
							r="3"
							fill={project.color}
							stroke="oklch(0.95 0.01 60)"
							stroke-width="1"
						/>
					{/if}
				{/each}
			{/if}
		<!-- Single-Series Chart Rendering -->
		{:else if filteredData && filteredData.length > 0}
			{#if chartType === 'line'}
				<!-- Line chart (smooth curve) with draw animation -->
				{#key animate ? animationKey : 0}
					<path
						d={pathData}
						fill="none"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						pathLength="1"
						class={animate ? 'sparkline-animate' : ''}
						style="stroke: {lineColor}; {animate ? '' : 'transition: stroke 0.3s ease, d 0.3s ease;'}"
					/>
				{/key}
			{:else if chartType === 'bars'}
				<!-- Bar chart (equalizer style) -->
				{#each filteredData as point, index}
					{@const x = padding + (index / (filteredData.length - 1 || 1)) * (viewBoxWidth - 2 * padding)}
					{@const y = scaleY(point.tokens)}
					{@const barWidth = (viewBoxWidth - 2 * padding) / filteredData.length * 0.8}
					{@const barHeight = viewBoxHeight - padding - y}
					{@const color = getColorForValue(point.tokens)}
					<rect
						x={x - barWidth / 2}
						y={y}
						width={barWidth}
						height={barHeight}
						fill={color}
						opacity="0.9"
						rx="0.5"
						style="transition: fill 0.3s ease, height 0.3s ease;"
					/>
				{/each}
			{:else if chartType === 'area'}
				<!-- Area chart (filled) with animation -->
				{@const points = filteredData.map((point, index) => ({
					x: padding + (index / (filteredData.length - 1 || 1)) * (viewBoxWidth - 2 * padding),
					y: scaleY(point.tokens)
				}))}
				{@const areaPath = `M ${points[0].x},${viewBoxHeight - padding} L ${points[0].x},${points[0].y} ${points.map(p => `L ${p.x},${p.y}`).join(' ')} L ${points[points.length - 1].x},${viewBoxHeight - padding} Z`}
				{#key animate ? animationKey : 0}
					<path
						d={areaPath}
						fill={lineColor}
						stroke={lineColor}
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class={animate ? 'sparkline-area-animate' : ''}
						style="{animate ? '' : 'fill-opacity: 0.3; transition: fill 0.3s ease, stroke 0.3s ease, d 0.3s ease;'}"
					/>
				{/key}
			{:else if chartType === 'dots'}
				<!-- Dot plot (small squares to avoid aspect ratio stretch) -->
				{#each filteredData as point, index}
					{@const x = padding + (index / (filteredData.length - 1 || 1)) * (viewBoxWidth - 2 * padding)}
					{@const y = scaleY(point.tokens)}
					{@const color = getColorForValue(point.tokens)}
					<rect
						x={x - 1.25}
						y={y - 1.25}
						width="2.5"
						height="2.5"
						fill={color}
						opacity="1"
						rx="0.5"
						style="transition: fill 0.3s ease, y 0.3s ease;"
					/>
				{/each}
			{/if}

			<!-- Hover indicator -->
			{#if hoveredIndex !== null}
				{@const point = filteredData[hoveredIndex]}
				{@const x = padding + (hoveredIndex / (filteredData.length - 1 || 1)) * (viewBoxWidth - 2 * padding)}
				{@const y = scaleY(point.tokens)}

				<circle cx={x} cy={y} r="2" fill={lineColor} stroke="oklch(0.95 0.01 60)" stroke-width="1" />
			{/if}
		{/if}
	</svg>

	<!-- Multi-Series Legend (compact, below chart) -->
	{#if showLegend && isMultiSeries && activeProjects.length > 0}
		<div class="flex flex-wrap gap-2 mt-1 text-xs">
			{#each activeProjects as project}
				<div class="flex items-center gap-1">
					<div
						class="w-2 h-2 rounded-full"
						style="background-color: {project.color};"
					></div>
					<span class="text-base-content/70">{project.name}</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Tooltip (single-series) -->
	{#if showTooltip && hoveredPoint && !isMultiSeries}
		<div
			class="sparkline-tooltip"
			style="left: {tooltipX}px; top: {tooltipY - 10}px;"
			role="tooltip"
		>
			<div class="text-xs font-medium">{formatTimestamp(hoveredPoint.timestamp)}</div>
			<div class="text-xs">
				{formatTokens(hoveredPoint.tokens)} tokens
			</div>
			<div class="text-xs font-semibold">{formatCost(hoveredPoint.cost)}</div>
		</div>
	{/if}

	<!-- Tooltip (multi-series) -->
	{#if showTooltip && hoveredMultiSeriesPoint && isMultiSeries}
		<div
			class="sparkline-tooltip"
			style="left: {tooltipX}px; top: {tooltipY - 10}px;"
			role="tooltip"
		>
			<div class="text-xs font-medium mb-1">{formatTimestamp(hoveredMultiSeriesPoint.timestamp)}</div>
			<!-- Per-project breakdown -->
			{#each Object.entries(hoveredMultiSeriesPoint.projects).filter(([_, d]) => d.tokens > 0).sort((a, b) => b[1].tokens - a[1].tokens) as [projectName, projectData]}
				{@const projectColor = projectMeta?.find(p => p.name === projectName)?.color || 'oklch(0.60 0.05 250)'}
				<div class="flex items-center gap-1.5 text-xs">
					<div class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {projectColor};"></div>
					<span class="truncate max-w-[80px]">{projectName}:</span>
					<span class="font-mono">{formatTokens(projectData.tokens)}</span>
				</div>
			{/each}
			<!-- Total -->
			<div class="border-t border-base-300 mt-1 pt-1 text-xs font-semibold">
				Total: {formatTokens(hoveredMultiSeriesPoint.total.tokens)} ({formatCost(hoveredMultiSeriesPoint.total.cost)})
			</div>
		</div>
	{/if}
</div>

<style>
	.sparkline-container {
		position: relative;
		display: inline-block;
	}

	.sparkline-controls-panel {
		position: absolute;
		right: 0;
		top: 100%;
		margin-top: 8px;
		z-index: 50;
	}

	svg {
		display: block;
		cursor: crosshair;
	}

	.sparkline-tooltip {
		position: fixed;
		background: var(--color-base-100);
		border: 1px solid color-mix(in oklch, var(--color-base-content) 10%, transparent);
		border-radius: 0.375rem;
		padding: 0.5rem;
		pointer-events: none;
		z-index: 1000;
		box-shadow: 0 4px 6px -1px color-mix(in oklch, var(--color-base-content) 10%, transparent);
		transform: translate(-50%, -100%);
		white-space: nowrap;
		color: var(--color-base-content);
	}

	.sparkline-tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-top-color: var(--color-base-100);
	}
</style>
