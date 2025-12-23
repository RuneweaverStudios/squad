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
	class="divider-container flex items-center justify-center select-none {className} {isCollapsed ? 'cursor-pointer divider-collapsed' : 'cursor-row-resize'} {isDragging ? 'bg-primary/25' : isExpanded && isCollapsed ? 'bg-primary/40' : isExpanded ? 'bg-primary/15' : ''}"
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
	/* NOTE: background uses Tailwind class (bg-primary/15) on element instead of CSS */
	.divider-container.expanded {
		height: 16px;
		min-height: 16px;
		box-shadow:
			0 0 12px color-mix(in oklch, var(--color-primary) 40%, transparent),
			inset 0 0 8px color-mix(in oklch, var(--color-primary) 20%, transparent);
	}

	/* Dragging state: stronger glow */
	/* NOTE: background uses Tailwind class (bg-primary/25) on element instead of CSS */
	.divider-container.dragging {
		height: 16px;
		min-height: 16px;
		box-shadow:
			0 0 20px color-mix(in oklch, var(--color-primary) 50%, transparent),
			inset 0 0 12px color-mix(in oklch, var(--color-primary) 30%, transparent);
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
		background: var(--color-base-content);
		opacity: 0.4;
		transition: background 200ms ease, box-shadow 200ms ease, opacity 200ms ease;
	}

	.divider-container.expanded .grip-line {
		background: var(--color-primary);
		opacity: 0.8;
		box-shadow: 0 0 6px color-mix(in oklch, var(--color-primary) 50%, transparent);
	}

	.divider-container.dragging .grip-line {
		background: var(--color-primary);
		opacity: 1;
		box-shadow: 0 0 8px color-mix(in oklch, var(--color-primary) 60%, transparent);
	}

	/* Collapsed state styling */
	.divider-collapsed {
		height: 6px;
		min-height: 6px;
		background: var(--color-base-200);
		border-color: var(--color-base-300) !important;
	}

	/* Collapsed + expanded (proximity/hover): grow larger for easy targeting */
	/* NOTE: background uses Tailwind class (bg-primary/40) on element instead of CSS */
	.divider-collapsed.expanded {
		height: 20px;
		min-height: 20px;
		box-shadow:
			0 0 16px color-mix(in oklch, var(--color-primary) 50%, transparent),
			inset 0 0 10px color-mix(in oklch, var(--color-primary) 30%, transparent);
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
			color-mix(in oklch, var(--color-base-content) 30%, transparent) 20%,
			color-mix(in oklch, var(--color-base-content) 30%, transparent) 80%,
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
			color-mix(in oklch, var(--color-primary) 70%, transparent) 15%,
			color-mix(in oklch, var(--color-primary) 70%, transparent) 85%,
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
		background: var(--color-base-content);
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
		background: var(--color-primary);
		box-shadow: 0 0 8px color-mix(in oklch, var(--color-primary) 70%, transparent);
	}
</style>
