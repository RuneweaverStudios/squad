<script lang="ts">
	/**
	 * FilesSkeleton Component
	 * Shows animated placeholder for the /files page during initial load.
	 * Mimics the file tree (left) + editor (right) layout.
	 */

	interface Props {
		/** Number of tree items to show */
		treeItems?: number;
		/** Number of tab placeholders */
		tabs?: number;
	}

	let { treeItems = 12, tabs = 3 }: Props = $props();

	// Varying indent levels and widths for natural file tree look
	const treeItemStyles = [
		{ indent: 0, width: 'w-28' },
		{ indent: 1, width: 'w-24' },
		{ indent: 1, width: 'w-32' },
		{ indent: 2, width: 'w-20' },
		{ indent: 2, width: 'w-28' },
		{ indent: 2, width: 'w-24' },
		{ indent: 1, width: 'w-20' },
		{ indent: 0, width: 'w-32' },
		{ indent: 1, width: 'w-28' },
		{ indent: 1, width: 'w-24' },
		{ indent: 0, width: 'w-24' },
		{ indent: 0, width: 'w-28' }
	];

	// Tab widths for variety
	const tabWidths = ['w-24', 'w-28', 'w-20', 'w-32'];
</script>

<!-- Files Page Skeleton -->
<div class="files-skeleton">
	<!-- Header skeleton -->
	<div class="files-header-skeleton">
		<!-- Title placeholder -->
		<div class="skeleton h-8 w-16 rounded-lg" style="background: oklch(0.22 0.02 250);"></div>
		<!-- Project selector placeholder -->
		<div class="skeleton h-10 w-56 rounded-lg" style="background: oklch(0.20 0.02 250);"></div>
	</div>

	<!-- Body skeleton - side by side layout -->
	<div class="files-body-skeleton">
		<!-- Left panel: File tree skeleton -->
		<div class="file-tree-skeleton">
			<!-- Panel header -->
			<div class="panel-header-skeleton">
				<div class="skeleton h-4 w-16 rounded" style="background: oklch(0.25 0.02 250);"></div>
			</div>

			<!-- Tree items -->
			<div class="tree-items">
				{#each Array(treeItems) as _, i}
					{@const style = treeItemStyles[i % treeItemStyles.length]}
					<div
						class="tree-item"
						style="
							padding-left: {12 + style.indent * 16}px;
							animation: shimmer 1.5s ease-in-out infinite;
							animation-delay: {i * 50}ms;
						"
					>
						<!-- Expand arrow or file icon placeholder -->
						<div class="skeleton h-4 w-4 rounded" style="background: oklch(0.22 0.02 250);"></div>
						<!-- Filename placeholder -->
						<div class="skeleton h-4 {style.width} rounded" style="background: oklch(0.22 0.02 250);"></div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Divider placeholder -->
		<div class="divider-skeleton"></div>

		<!-- Right panel: Editor skeleton -->
		<div class="editor-skeleton">
			<!-- Tab bar -->
			<div class="tab-bar-skeleton">
				{#each Array(tabs) as _, i}
					<div
						class="tab-skeleton"
						class:active={i === 0}
						style="animation: shimmer 1.5s ease-in-out infinite; animation-delay: {i * 80}ms;"
					>
						<div class="skeleton h-4 w-4 rounded" style="background: {i === 0 ? 'oklch(0.25 0.02 250)' : 'oklch(0.20 0.02 250)'};"></div>
						<div class="skeleton h-4 {tabWidths[i % tabWidths.length]} rounded" style="background: {i === 0 ? 'oklch(0.25 0.02 250)' : 'oklch(0.20 0.02 250)'};"></div>
					</div>
				{/each}
			</div>

			<!-- Editor content area -->
			<div class="editor-content-skeleton">
				<!-- Line numbers gutter -->
				<div class="gutter-skeleton">
					{#each Array(18) as _, i}
						<div
							class="skeleton h-4 w-5 rounded"
							style="
								background: oklch(0.20 0.02 250);
								animation: shimmer 1.5s ease-in-out infinite;
								animation-delay: {i * 30}ms;
							"
						></div>
					{/each}
				</div>

				<!-- Code lines -->
				<div class="code-lines-skeleton">
					{#each [85, 60, 75, 40, 90, 55, 80, 30, 70, 95, 45, 65, 50, 85, 35, 75, 60, 25] as width, i}
						<div
							class="skeleton h-4 rounded"
							style="
								width: {width}%;
								background: oklch(0.20 0.02 250);
								animation: shimmer 1.5s ease-in-out infinite;
								animation-delay: {i * 30}ms;
							"
						></div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.files-skeleton {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 48px);
		padding: 1.5rem;
		background: oklch(0.14 0.01 250);
	}

	.files-header-skeleton {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}

	.files-body-skeleton {
		display: flex;
		flex: 1;
		min-height: 0;
		border-radius: 0.75rem;
		overflow: hidden;
		border: 1px solid oklch(0.22 0.02 250);
		background: oklch(0.16 0.01 250);
	}

	/* File tree skeleton */
	.file-tree-skeleton {
		width: 303px;
		min-width: 180px;
		display: flex;
		flex-direction: column;
		background: oklch(0.15 0.01 250);
		border-right: 1px solid oklch(0.22 0.02 250);
	}

	.panel-header-skeleton {
		display: flex;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: oklch(0.17 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
	}

	.tree-items {
		flex: 1;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.tree-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 1.75rem;
	}

	/* Divider skeleton */
	.divider-skeleton {
		width: 8px;
		min-width: 8px;
		background: oklch(0.18 0.02 250);
	}

	/* Editor skeleton */
	.editor-skeleton {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 300px;
		background: oklch(0.14 0.01 250);
	}

	.tab-bar-skeleton {
		display: flex;
		align-items: center;
		gap: 0;
		background: oklch(0.16 0.01 250);
		border-bottom: 1px solid oklch(0.22 0.02 250);
		padding: 0;
	}

	.tab-skeleton {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		border-right: 1px solid oklch(0.20 0.02 250);
	}

	.tab-skeleton.active {
		background: oklch(0.18 0.02 250);
		border-bottom: 2px solid oklch(0.45 0.15 200);
	}

	.editor-content-skeleton {
		flex: 1;
		display: flex;
		padding: 0.75rem 0;
		overflow: hidden;
	}

	.gutter-skeleton {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.375rem;
		padding: 0 0.75rem;
		border-right: 1px solid oklch(0.20 0.02 250);
	}

	.code-lines-skeleton {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0 1rem;
	}

	@keyframes shimmer {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Responsive */
	@media (max-width: 768px) {
		.files-skeleton {
			padding: 1rem;
		}

		.files-header-skeleton {
			flex-direction: column;
			align-items: flex-start;
		}

		.files-body-skeleton {
			flex-direction: column;
		}

		.file-tree-skeleton {
			width: 100%;
			max-height: 200px;
			border-right: none;
			border-bottom: 1px solid oklch(0.22 0.02 250);
		}

		.divider-skeleton {
			display: none;
		}
	}
</style>
