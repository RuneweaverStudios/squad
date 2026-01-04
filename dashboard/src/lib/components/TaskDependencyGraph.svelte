<script lang="ts">
	/**
	 * TaskDependencyGraph Component
	 * Compact D3 force-directed graph showing a task and its dependencies/dependents
	 * Designed for use in TaskDetailDrawer
	 */

	import { onMount, onDestroy } from 'svelte';
	import * as d3 from 'd3';
	import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3';
	import { getProjectColor } from '$lib/utils/projectColors';

	// Types
	interface TaskDep {
		id: string;
		title?: string;
		status?: string;
		priority?: number;
	}

	interface Task {
		id: string;
		title?: string;
		status?: string;
		priority?: number;
		project?: string;
		depends_on?: TaskDep[];
		blocked_by?: TaskDep[];
	}

	interface GraphNode extends SimulationNodeDatum {
		id: string;
		title: string;
		status: string;
		priority: number;
		isCenter: boolean;
	}

	interface GraphLink extends SimulationLinkDatum<GraphNode> {
		source: string | GraphNode;
		target: string | GraphNode;
		type: 'depends_on' | 'blocks';
	}

	interface Props {
		task: Task | null;
		onNodeClick?: ((taskId: string) => void) | null;
		height?: number;
	}

	// Props
	let { task = null, onNodeClick = null, height = 250 }: Props = $props();

	// State
	let svgElement = $state<SVGSVGElement | null>(null);
	let containerElement = $state<HTMLDivElement | null>(null);
	let width = $state(400);
	let simulation: Simulation<GraphNode, GraphLink> | null = null;

	// Status color mapping (DaisyUI-compatible) using oklch for theme-awareness
	const statusColors: Record<string, string> = {
		open: 'oklch(0.70 0.18 220)',       // blue (info)
		in_progress: 'oklch(0.75 0.18 60)', // amber (warning)
		closed: 'oklch(0.70 0.18 145)',     // green (success)
		blocked: 'oklch(0.65 0.20 30)'      // red (error)
	};

	// Priority stroke widths
	const priorityStroke: Record<number, number> = {
		0: 4,  // P0 - thickest
		1: 3,  // P1
		2: 2,  // P2
		3: 1,  // P3
		4: 1,  // P4
		99: 1  // default
	};

	function buildGraph(): void {
		if (!svgElement || !task) return;

		// Stop any existing simulation
		if (simulation) {
			simulation.stop();
		}

		// Clear previous graph
		d3.select(svgElement).selectAll('*').remove();

		// Build nodes: center task + dependencies + dependents
		const nodes: GraphNode[] = [];
		const links: GraphLink[] = [];
		const nodeIds = new Set<string>();

		// Add center node (current task)
		nodes.push({
			id: task.id,
			title: task.title || task.id,
			status: task.status || 'open',
			priority: task.priority ?? 2,
			isCenter: true
		});
		nodeIds.add(task.id);

		// Add dependency nodes (tasks this task depends on)
		if (task.depends_on && Array.isArray(task.depends_on)) {
			task.depends_on.forEach((dep) => {
				if (dep.id && !nodeIds.has(dep.id)) {
					nodes.push({
						id: dep.id,
						title: dep.title || dep.id,
						status: dep.status || 'open',
						priority: dep.priority ?? 2,
						isCenter: false
					});
					nodeIds.add(dep.id);
				}
				if (dep.id) {
					links.push({
						source: dep.id,
						target: task.id,
						type: 'depends_on'
					});
				}
			});
		}

		// Add dependent nodes (tasks blocked by this task)
		if (task.blocked_by && Array.isArray(task.blocked_by)) {
			task.blocked_by.forEach((dep) => {
				if (dep.id && !nodeIds.has(dep.id)) {
					nodes.push({
						id: dep.id,
						title: dep.title || dep.id,
						status: dep.status || 'open',
						priority: dep.priority ?? 2,
						isCenter: false
					});
					nodeIds.add(dep.id);
				}
				if (dep.id) {
					links.push({
						source: task.id,
						target: dep.id,
						type: 'blocks'
					});
				}
			});
		}

		// If only center node (no dependencies), show message
		if (nodes.length === 1) {
			const svg = d3.select(svgElement)
				.attr('width', width)
				.attr('height', height);

			svg.append('text')
				.attr('x', width / 2)
				.attr('y', height / 2)
				.attr('text-anchor', 'middle')
				.attr('class', 'fill-base-content/50 text-sm')
				.text('No dependencies');
			return;
		}

		// Create SVG
		const svg = d3.select(svgElement)
			.attr('width', width)
			.attr('height', height)
			.attr('viewBox', `0 0 ${width} ${height}`);

		// Add zoom behavior
		const g = svg.append('g');

		const zoom = d3.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.5, 2])
			.on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
				g.attr('transform', event.transform.toString());
			});

		svg.call(zoom as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);

		// Add arrow markers for both directions
		const defs = svg.append('defs');

		// Arrow for depends_on (pointing to center)
		defs.append('marker')
			.attr('id', 'arrow-depends')
			.attr('viewBox', '0 -5 10 10')
			.attr('refX', 22)
			.attr('refY', 0)
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.attr('orient', 'auto')
			.append('path')
			.attr('d', 'M0,-5L10,0L0,5')
			.attr('class', 'fill-info/60');

		// Arrow for blocks (pointing away from center)
		defs.append('marker')
			.attr('id', 'arrow-blocks')
			.attr('viewBox', '0 -5 10 10')
			.attr('refX', 22)
			.attr('refY', 0)
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.attr('orient', 'auto')
			.append('path')
			.attr('d', 'M0,-5L10,0L0,5')
			.attr('class', 'fill-warning/60');

		// Create force simulation
		simulation = d3.forceSimulation<GraphNode>(nodes)
			.force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d: GraphNode) => d.id).distance(80))
			.force('charge', d3.forceManyBody().strength(-200))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(30));

		// Draw links
		const link = g.append('g')
			.selectAll('line')
			.data(links)
			.join('line')
			.attr('stroke', (d: GraphLink) => d.type === 'depends_on' ? 'oklch(0.70 0.18 220)' : 'oklch(0.75 0.18 60)')
			.attr('stroke-width', 2)
			.attr('stroke-opacity', 0.6)
			.attr('marker-end', (d: GraphLink) => d.type === 'depends_on' ? 'url(#arrow-depends)' : 'url(#arrow-blocks)');

		// Draw nodes
		const node = g.append('g')
			.selectAll('circle')
			.data(nodes)
			.join('circle')
			.attr('r', (d: GraphNode) => d.isCenter ? 18 : 14)
			.attr('fill', (d: GraphNode) => statusColors[d.status] || 'oklch(0.60 0.05 250)')
			.attr('stroke', (d: GraphNode) => d.isCenter ? 'oklch(0.98 0.01 60)' : getProjectColor(d.id))
			.attr('stroke-width', (d: GraphNode) => d.isCenter ? 3 : priorityStroke[d.priority] || 1)
			.attr('class', 'cursor-pointer hover:opacity-80 transition-opacity')
			.call(drag(simulation) as any)
			.on('click', (event: MouseEvent, d: GraphNode) => {
				event.stopPropagation();
				if (onNodeClick && !d.isCenter) {
					onNodeClick(d.id);
				}
			});

		// Add labels
		const label = g.append('g')
			.selectAll('text')
			.data(nodes)
			.join('text')
			.text((d: GraphNode) => {
				const maxLen = d.isCenter ? 25 : 15;
				return d.title.length > maxLen ? d.title.substring(0, maxLen - 3) + '...' : d.title;
			})
			.attr('class', (d: GraphNode) => `text-xs fill-base-content pointer-events-none ${d.isCenter ? 'font-semibold' : ''}`)
			.attr('text-anchor', 'middle')
			.attr('dy', (d: GraphNode) => d.isCenter ? 32 : 26);

		// Add tooltips
		node.append('title')
			.text((d: GraphNode) => `${d.id}\n${d.title}\nStatus: ${d.status}\nPriority: P${d.priority}`);

		// Update positions on simulation tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: GraphLink) => (d.source as GraphNode).x ?? 0)
				.attr('y1', (d: GraphLink) => (d.source as GraphNode).y ?? 0)
				.attr('x2', (d: GraphLink) => (d.target as GraphNode).x ?? 0)
				.attr('y2', (d: GraphLink) => (d.target as GraphNode).y ?? 0);

			node
				.attr('cx', (d: GraphNode) => d.x ?? 0)
				.attr('cy', (d: GraphNode) => d.y ?? 0);

			label
				.attr('x', (d: GraphNode) => d.x ?? 0)
				.attr('y', (d: GraphNode) => d.y ?? 0);
		});

		// Drag behavior
		function drag(simulation: Simulation<GraphNode, GraphLink>) {
			function dragstarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				event.subject.fx = event.subject.x;
				event.subject.fy = event.subject.y;
			}

			function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
				event.subject.fx = event.x;
				event.subject.fy = event.y;
			}

			function dragended(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
				if (!event.active) simulation.alphaTarget(0);
				event.subject.fx = null;
				event.subject.fy = null;
			}

			return d3.drag<SVGCircleElement, GraphNode>()
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended);
		}
	}

	// Rebuild graph when task changes
	$effect(() => {
		if (task) {
			buildGraph();
		}
	});

	// Handle container resize
	function updateWidth() {
		if (containerElement) {
			width = containerElement.clientWidth;
			buildGraph();
		}
	}

	onMount(() => {
		updateWidth();
		window.addEventListener('resize', updateWidth);
	});

	onDestroy(() => {
		if (simulation) {
			simulation.stop();
		}
		window.removeEventListener('resize', updateWidth);
	});
</script>

<div bind:this={containerElement} class="w-full rounded-lg border border-base-300 bg-base-200/50 overflow-hidden">
	<!-- Legend -->
	<div class="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-200">
		<span class="text-xs font-semibold text-base-content/70">Dependency Graph</span>
		<div class="flex items-center gap-3 text-xs text-base-content/60">
			<div class="flex items-center gap-1">
				<div class="w-2 h-2 rounded-full bg-info"></div>
				<span>Depends on</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="w-2 h-2 rounded-full bg-warning"></div>
				<span>Blocks</span>
			</div>
		</div>
	</div>

	<!-- Graph -->
	<svg bind:this={svgElement} class="w-full bg-base-100" style="height: {height}px;"></svg>
</div>
