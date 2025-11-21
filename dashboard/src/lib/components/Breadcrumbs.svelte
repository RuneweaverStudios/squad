<script lang="ts">
	/**
	 * Breadcrumbs Component
	 *
	 * Context-aware breadcrumbs navigation for dashboard pages.
	 * Uses DaisyUI breadcrumbs component styling.
	 *
	 * Props:
	 * - context: 'home' | 'agents' | 'api-demo'
	 * - additionalPath: Optional array of additional breadcrumb items for deep navigation
	 *
	 * Example Usage:
	 * <Breadcrumbs context="agents" />
	 * <Breadcrumbs context="agents" additionalPath={[{ label: 'Task Detail', href: null }]} />
	 */

	interface BreadcrumbItem {
		label: string;
		href: string | null; // null for current page (no link)
		icon?: string; // Optional icon path
	}

	interface AdditionalPathItem {
		label: string;
		href?: string | null;
	}

	interface Props {
		context: 'home' | 'agents' | 'api-demo';
		additionalPath?: AdditionalPathItem[];
	}

	let { context, additionalPath = [] }: Props = $props();

	// Base breadcrumb paths for each context
	const basePaths: Record<string, BreadcrumbItem[]> = {
		home: [{ label: 'Home', href: null }],
		agents: [
			{ label: 'Home', href: '/' },
			{ label: 'Agents', href: null }
		],
		'api-demo': [
			{ label: 'Home', href: '/' },
			{ label: 'API Demo', href: null }
		]
	};

	// Compute full breadcrumb path
	const breadcrumbs = $derived(() => {
		const base = basePaths[context] || [{ label: 'Home', href: '/' }];

		// If no additional path, return base
		if (additionalPath.length === 0) {
			return base;
		}

		// Otherwise, add additional path items
		// Last item in additional path becomes current page (no link)
		const withAdditional = [...base];

		// Update last base item to have link (since we're adding more items)
		if (withAdditional.length > 0 && withAdditional[withAdditional.length - 1].href === null) {
			const lastBase = withAdditional[withAdditional.length - 1];
			// Determine href based on context
			if (context === 'agents') {
				lastBase.href = '/agents';
			} else if (context === 'api-demo') {
				lastBase.href = '/api-demo';
			}
		}

		// Add additional path items
		additionalPath.forEach((item, index) => {
			const isLast = index === additionalPath.length - 1;
			withAdditional.push({
				label: item.label,
				href: isLast ? null : item.href || null
			});
		});

		return withAdditional;
	});

	// Home icon SVG path
	const homeIcon =
		'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6';
</script>

<div class="breadcrumbs text-sm">
	<ul>
		{#each breadcrumbs() as item, index}
			<li>
				{#if item.href !== null}
					<!-- Linked breadcrumb -->
					<a href={item.href} class="link-hover">
						{#if index === 0}
							<!-- Show home icon for first item -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="h-4 w-4"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={homeIcon} />
							</svg>
						{/if}
						{item.label}
					</a>
				{:else}
					<!-- Current page (no link) -->
					{item.label}
				{/if}
			</li>
		{/each}
	</ul>
</div>
