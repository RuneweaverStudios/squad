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
	 */

	interface Props {
		onResize: (deltaY: number) => void;
		class?: string;
	}

	let { onResize, class: className = '' }: Props = $props();

	let isDragging = $state(false);
	let startY = $state(0);

	function handleMouseDown(e: MouseEvent) {
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
</script>

<div
	class="flex items-center justify-center cursor-row-resize select-none transition-colors {className} {isDragging ? 'bg-primary/20' : ''}"
	role="separator"
	aria-orientation="horizontal"
	tabindex="0"
	onmousedown={handleMouseDown}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	<!-- Grippy handle visual -->
	<div
		class="flex flex-col gap-0.5 py-1 px-8 rounded transition-opacity"
		class:opacity-100={isDragging}
		class:opacity-50={!isDragging}
	>
		<div class="w-8 h-0.5 rounded-full bg-base-content/30"></div>
		<div class="w-8 h-0.5 rounded-full bg-base-content/30"></div>
	</div>
</div>

<style>
	div[role="separator"]:hover {
		background: oklch(0.5 0.1 250 / 0.1);
	}

	div[role="separator"]:hover > div {
		opacity: 1;
	}
</style>
