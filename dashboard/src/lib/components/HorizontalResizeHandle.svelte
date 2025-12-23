<script lang="ts">
	/**
	 * HorizontalResizeHandle Component
	 * A draggable handle for resizing panels horizontally (width).
	 *
	 * Features:
	 * - Vertical drag handle with grippy visual on right edge
	 * - Mouse and touch support
	 * - Emits pixel delta changes via callback
	 * - Visual feedback on hover/drag
	 * - Positioned on right edge of parent container
	 */

	interface Props {
		onResize: (deltaX: number) => void;
		/** Called when drag ends - useful for persisting final width */
		onResizeEnd?: () => void;
		class?: string;
	}

	let {
		onResize,
		onResizeEnd,
		class: className = ''
	}: Props = $props();

	let isDragging = $state(false);
	let startX = $state(0);

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
		startX = e.clientX;

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		const deltaX = e.clientX - startX;
		startX = e.clientX;
		onResize(deltaX);
	}

	function handleMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
		onResizeEnd?.();
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		e.stopPropagation();
		isDragging = true;
		startX = e.touches[0].clientX;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging || e.touches.length !== 1) return;
		const deltaX = e.touches[0].clientX - startX;
		startX = e.touches[0].clientX;
		onResize(deltaX);
	}

	function handleTouchEnd() {
		isDragging = false;
		onResizeEnd?.();
	}
</script>

<div
	class="resize-handle {className} hover:bg-primary/15 {isDragging ? 'bg-primary/15' : ''}"
	class:dragging={isDragging}
	role="separator"
	aria-orientation="vertical"
	tabindex="0"
	onmousedown={handleMouseDown}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	<!-- Grippy dots indicator -->
	<div class="grippy">
		<span></span>
		<span></span>
		<span></span>
	</div>
</div>

<style>
	.resize-handle {
		position: absolute;
		right: -4px;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		transition: background 0.15s ease;
	}

	/* NOTE: background uses Tailwind class (hover:bg-primary/15) on element instead of CSS */

	.grippy {
		display: flex;
		flex-direction: column;
		gap: 3px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.resize-handle:hover .grippy,
	.resize-handle.dragging .grippy {
		opacity: 1;
	}

	.grippy span {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--color-base-content);
		opacity: 0.5;
		transition: background 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
	}

	.resize-handle:hover .grippy span,
	.resize-handle.dragging .grippy span {
		background: var(--color-primary);
		opacity: 0.8;
		box-shadow: 0 0 4px color-mix(in oklch, var(--color-primary) 50%, transparent);
	}

	.resize-handle.dragging .grippy span {
		background: var(--color-info);
		opacity: 1;
		box-shadow: 0 0 6px color-mix(in oklch, var(--color-info) 60%, transparent);
	}
</style>
