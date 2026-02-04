<script lang="ts">
	/**
	 * CSS Scale Minimap - Uses CSS transform: scale() on a cloned terminal view
	 *
	 * Pros: Real text, preserves ANSI colors, simple implementation
	 * Cons: Can be slow with very long output, may have rendering issues
	 */
	import { ansiToHtml } from '$lib/utils/ansiToHtml';

	let {
		output = '',
		height = 200,
		scale: _scale,
		terminalWidth = 800,
		onPositionClick = (percent: number) => {}
	}: {
		output: string;
		height?: number;
		/** Optional fixed scale factor (overrides auto-computed scale) */
		scale?: number;
		terminalWidth?: number;
		onPositionClick?: (percent: number) => void;
	} = $props();

	let minimapContainer: HTMLDivElement;
	let measureContainer: HTMLDivElement;
	let viewportIndicator: HTMLDivElement;

	// Track viewport position (0-100%)
	let viewportTop = $state(0);
	let viewportHeight = $state(20); // Percentage of total content visible

	// Derived HTML content
	const htmlContent = $derived(ansiToHtml(output));

	// Measure natural content height and compute scale
	let naturalHeight = $state(0);
	let isDragging = $state(false);

	// Compute scale to fit all content in minimap height (use fixed scale if provided)
	const computedScale = $derived(
		_scale != null
			? _scale
			: naturalHeight > 0 && height > 0
				? Math.min(1, height / naturalHeight)
				: 0.1
	);

	$effect(() => {
		if (measureContainer && output) {
			// Measure content at natural size
			naturalHeight = measureContainer.scrollHeight;
		}
	});

	function handleMinimapClick(e: MouseEvent) {
		e.preventDefault(); // Prevent text selection
		if (!minimapContainer) return;

		const rect = minimapContainer.getBoundingClientRect();
		const clickY = e.clientY - rect.top;
		const percent = (clickY / rect.height) * 100;

		onPositionClick(Math.max(0, Math.min(100, percent)));
	}

	function handleDragStart(e: MouseEvent) {
		e.preventDefault(); // Prevent text selection
		isDragging = true;
		handleDrag(e);
	}

	function handleDrag(e: MouseEvent) {
		if (!isDragging || !minimapContainer) return;

		const rect = minimapContainer.getBoundingClientRect();
		const dragY = e.clientY - rect.top;
		const percent = (dragY / rect.height) * 100;

		viewportTop = Math.max(0, Math.min(100 - viewportHeight, percent - viewportHeight / 2));
		onPositionClick(viewportTop);
	}

	function handleDragEnd() {
		isDragging = false;
	}

	// Update viewport indicator based on external scroll position
	export function setViewportPosition(scrollPercent: number, visiblePercent: number) {
		viewportHeight = visiblePercent;
		// Scale viewportTop so viewport stays within 0-100% range
		// When scrollPercent=0, viewportTop=0; when scrollPercent=100, viewportTop=100-viewportHeight
		viewportTop = (scrollPercent / 100) * (100 - visiblePercent);
	}
</script>

<svelte:window onmousemove={handleDrag} onmouseup={handleDragEnd} />

<div class="minimap-css-scale" style="height: {height}px;">
	<!-- Hidden container to measure natural content height (matches terminal width) -->
	<div class="measure-container" bind:this={measureContainer} style="width: {terminalWidth}px;">
		<pre class="terminal-output">{@html htmlContent}</pre>
	</div>

	<div
		class="minimap-container"
		bind:this={minimapContainer}
		onclick={handleMinimapClick}
		role="slider"
		tabindex="0"
		aria-label="Minimap navigation"
		aria-valuenow={viewportTop}
	>
		<!-- Scaled content -->
		<div
			class="minimap-content"
			style="transform: scale({computedScale}); transform-origin: top left; width: {computedScale > 0 ? 100/computedScale : 1000}%;"
		>
			<pre class="terminal-output">{@html htmlContent}</pre>
		</div>

		<!-- Viewport indicator -->
		<div
			class="viewport-indicator"
			bind:this={viewportIndicator}
			style="top: {viewportTop}%; height: {viewportHeight}%;"
			onmousedown={handleDragStart}
			role="button"
			tabindex="0"
			aria-label="Drag to scroll"
		></div>
	</div>
</div>

<style>
	.minimap-css-scale {
		display: flex;
		flex-direction: column;
		background: oklch(0.12 0.01 250);
		overflow: hidden;
		height: 100%;
		position: relative;
	}

	/* Hidden container for measuring natural content height */
	.measure-container {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		/* Width is set inline to match terminal width */
	}

	.minimap-container {
		position: relative;
		flex: 1;
		overflow: hidden;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
	}

	.minimap-content {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.terminal-output {
		margin: 0;
		padding: 0.25rem;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 12px;
		line-height: 1.4;
		white-space: pre;
		color: oklch(0.85 0.02 250);
	}

	.viewport-indicator {
		position: absolute;
		left: 0;
		right: 0;
		background: oklch(0.60 0.15 220 / 0.3);
		border: 1px solid oklch(0.70 0.18 220 / 0.6);
		border-radius: 2px;
		cursor: grab;
		min-height: 10px;
		transition: background 0.15s ease;
	}

	.viewport-indicator:hover {
		background: oklch(0.65 0.18 220 / 0.4);
	}

	.viewport-indicator:active {
		cursor: grabbing;
		background: oklch(0.70 0.20 220 / 0.5);
	}
</style>
