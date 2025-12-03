<script lang="ts">
	/**
	 * ResizableDivider Component
	 * A draggable divider for resizing split panels.
	 *
	 * Features:
	 * - Horizontal drag handle with grippy visual
	 * - Mouse and touch support
	 * - Emits percentage changes via callback
	 * - Visual feedback on hover/drag
	 * - Snap-to-collapse support with click-to-restore
	 * - Proximity detection: grows larger when mouse approaches
	 * - Glow effect on hover for better visibility
	 */

	interface Props {
		onResize: (deltaY: number) => void;
		class?: string;
		/** Whether a panel is currently collapsed */
		isCollapsed?: boolean;
		/** Which direction the panel collapsed ('top' = top panel hidden, 'bottom' = bottom panel hidden) */
		collapsedDirection?: 'top' | 'bottom' | null;
		/** Callback when clicking the divider while collapsed (to restore) */
		onCollapsedClick?: () => void;
	}

	let {
		onResize,
		class: className = '',
		isCollapsed = false,
		collapsedDirection = null,
		onCollapsedClick
	}: Props = $props();

	let isDragging = $state(false);
	let isNearby = $state(false);
	let isHovering = $state(false);
	let startY = $state(0);
	let dividerElement: HTMLDivElement | undefined = $state();

	// Proximity detection threshold in pixels
	const PROXIMITY_THRESHOLD = 24;

	function handleMouseDown(e: MouseEvent) {
		// If collapsed and we have a restore handler, treat click as restore
		if (isCollapsed && onCollapsedClick) {
			onCollapsedClick();
			return;
		}

		e.preventDefault();
		isDragging = true;
		startY = e.clientY;

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		const deltaY = e.clientY - startY;
		startY = e.clientY;
		onResize(deltaY);
	}

	function handleMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	}

	function handleTouchStart(e: TouchEvent) {
		// If collapsed and we have a restore handler, treat tap as restore
		if (isCollapsed && onCollapsedClick) {
			onCollapsedClick();
			return;
		}

		if (e.touches.length !== 1) return;
		isDragging = true;
		startY = e.touches[0].clientY;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging || e.touches.length !== 1) return;
		const deltaY = e.touches[0].clientY - startY;
		startY = e.touches[0].clientY;
		onResize(deltaY);
	}

	function handleTouchEnd() {
		isDragging = false;
	}

	function handleMouseEnter() {
		isHovering = true;
	}

	function handleMouseLeave() {
		isHovering = false;
	}

	// Proximity detection: track mouse movement near the divider
	function handleProximityMove(e: MouseEvent) {
		if (!dividerElement || isDragging) return;

		const rect = dividerElement.getBoundingClientRect();
		const dividerCenterY = rect.top + rect.height / 2;
		const distance = Math.abs(e.clientY - dividerCenterY);

		isNearby = distance <= PROXIMITY_THRESHOLD;
	}

	// Set up proximity tracking on mount
	$effect(() => {
		if (typeof window === 'undefined') return;

		document.addEventListener('mousemove', handleProximityMove);

		return () => {
			document.removeEventListener('mousemove', handleProximityMove);
		};
	});

	// Derived state for expanded appearance
	const isExpanded = $derived(isDragging || isHovering || isNearby);
</script>

<div
	bind:this={dividerElement}
	class="divider-container flex items-center justify-center select-none {className} {isCollapsed ? 'cursor-pointer divider-collapsed' : 'cursor-row-resize'}"
	class:expanded={isExpanded}
	class:dragging={isDragging}
	role="separator"
	aria-orientation="horizontal"
	aria-expanded={!isCollapsed}
	tabindex="0"
	onmousedown={handleMouseDown}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	{#if isCollapsed}
		<!-- Collapsed state: minimal industrial indicator -->
		<div class="collapsed-indicator">
			<div class="indicator-line"></div>
			<div class="indicator-dots">
				<span></span>
				<span></span>
				<span></span>
			</div>
			<div class="indicator-line"></div>
		</div>
	{:else}
		<!-- Normal state: grippy handle with proximity-aware sizing -->
		<div class="grippy-handle">
			<div class="grip-line"></div>
			<div class="grip-line"></div>
		</div>
	{/if}
</div>

<style>
	/* Main divider container with smooth transitions */
	.divider-container {
		height: 8px;
		min-height: 8px;
		transition:
			height 200ms cubic-bezier(0.4, 0, 0.2, 1),
			background 200ms ease,
			box-shadow 200ms ease;
	}

	/* Expanded state: larger hit target + glow */
	.divider-container.expanded {
		height: 16px;
		min-height: 16px;
		background: oklch(0.55 0.12 250 / 0.15);
		box-shadow:
			0 0 12px oklch(0.65 0.18 250 / 0.4),
			inset 0 0 8px oklch(0.65 0.18 250 / 0.2);
	}

	/* Dragging state: stronger glow */
	.divider-container.dragging {
		height: 16px;
		min-height: 16px;
		background: oklch(0.55 0.15 250 / 0.25);
		box-shadow:
			0 0 20px oklch(0.70 0.20 250 / 0.5),
			inset 0 0 12px oklch(0.70 0.20 250 / 0.3);
	}

	/* Grippy handle styling */
	.grippy-handle {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 4px 32px;
		border-radius: 4px;
		transition:
			opacity 200ms ease,
			transform 200ms ease;
		opacity: 0.4;
	}

	.divider-container.expanded .grippy-handle {
		opacity: 1;
		transform: scaleY(1.2);
	}

	.divider-container.dragging .grippy-handle {
		opacity: 1;
		transform: scaleY(1.3);
	}

	.grip-line {
		width: 32px;
		height: 2px;
		border-radius: 1px;
		background: oklch(0.60 0.08 250);
		transition: background 200ms ease, box-shadow 200ms ease;
	}

	.divider-container.expanded .grip-line {
		background: oklch(0.75 0.15 250);
		box-shadow: 0 0 6px oklch(0.75 0.15 250 / 0.5);
	}

	.divider-container.dragging .grip-line {
		background: oklch(0.80 0.18 250);
		box-shadow: 0 0 8px oklch(0.80 0.18 250 / 0.6);
	}

	/* Collapsed state styling */
	.divider-collapsed {
		height: 6px;
		min-height: 6px;
		background: oklch(0.25 0.02 250);
		border-color: oklch(0.30 0.03 250) !important;
	}

	/* Collapsed + expanded (proximity/hover): grow larger for easy targeting */
	.divider-collapsed.expanded {
		height: 20px;
		min-height: 20px;
		background: oklch(0.35 0.08 250 / 0.6);
		box-shadow:
			0 0 16px oklch(0.60 0.20 250 / 0.5),
			inset 0 0 10px oklch(0.60 0.20 250 / 0.3);
	}

	.collapsed-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 0 16px;
		transition: transform 200ms ease;
	}

	/* Scale up the indicator when expanded */
	.divider-collapsed.expanded .collapsed-indicator {
		transform: scaleY(1.5);
	}

	.indicator-line {
		flex: 1;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			oklch(0.50 0.08 250 / 0.3) 20%,
			oklch(0.50 0.08 250 / 0.3) 80%,
			transparent 100%
		);
		transition: background 200ms ease, height 200ms ease;
	}

	/* Brighter lines when expanded */
	.divider-collapsed.expanded .indicator-line {
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			oklch(0.70 0.15 250 / 0.7) 15%,
			oklch(0.70 0.15 250 / 0.7) 85%,
			transparent 100%
		);
	}

	.indicator-dots {
		display: flex;
		gap: 3px;
		opacity: 0.5;
		transition: opacity 200ms ease, transform 200ms ease, gap 200ms ease;
	}

	.indicator-dots span {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: oklch(0.60 0.12 250);
		transition: width 200ms ease, height 200ms ease, background 200ms ease, box-shadow 200ms ease;
	}

	/* Expanded state: larger, brighter dots with glow */
	.divider-collapsed.expanded .indicator-dots {
		opacity: 1;
		gap: 5px;
	}

	.divider-collapsed.expanded .indicator-dots span {
		width: 5px;
		height: 5px;
		background: oklch(0.80 0.18 250);
		box-shadow: 0 0 8px oklch(0.80 0.18 250 / 0.7);
	}
</style>
