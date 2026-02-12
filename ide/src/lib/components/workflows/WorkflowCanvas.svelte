<script lang="ts">
	import type { WorkflowNode, WorkflowEdge, Port, PortType, NodeType, NodeCategory } from '$lib/types/workflow';
	import { NODE_CATEGORIES, getDefaultPorts } from '$lib/types/workflow';

	// =========================================================================
	// PROPS
	// =========================================================================

	let {
		nodes = $bindable<WorkflowNode[]>([]),
		edges = $bindable<WorkflowEdge[]>([]),
		selectedNodeIds = $bindable<Set<string>>(new Set()),
		selectedEdgeIds = $bindable<Set<string>>(new Set()),
		gridSnap = $bindable(false),
		gridSize = 20,
		readonly = false,
		nodeStatusOverlay = null,
		onNodesChange,
		onEdgesChange,
		onNodeDoubleClick
	}: {
		nodes: WorkflowNode[];
		edges: WorkflowEdge[];
		selectedNodeIds?: Set<string>;
		selectedEdgeIds?: Set<string>;
		gridSnap?: boolean;
		gridSize?: number;
		readonly?: boolean;
		nodeStatusOverlay?: Record<string, string> | null;
		onNodesChange?: (nodes: WorkflowNode[]) => void;
		onEdgesChange?: (edges: WorkflowEdge[]) => void;
		onNodeDoubleClick?: (nodeId: string) => void;
	} = $props();

	// =========================================================================
	// CONSTANTS
	// =========================================================================

	const NODE_WIDTH = 220;
	const HEADER_HEIGHT = 40;
	const PORT_SPACING = 28;
	const PORT_RADIUS = 6;
	const BOTTOM_PADDING = 8;
	const MIN_ZOOM = 0.15;
	const MAX_ZOOM = 3;
	const EDGE_HIT_WIDTH = 14;
	const MINIMAP_WIDTH = 180;
	const MINIMAP_HEIGHT = 130;
	const MINIMAP_PADDING = 40;

	const PORT_COLORS: Record<PortType, string> = {
		data: 'oklch(0.70 0.15 230)',
		trigger: 'oklch(0.70 0.18 145)',
		condition_true: 'oklch(0.70 0.18 145)',
		condition_false: 'oklch(0.70 0.15 50)'
	};

	const CATEGORY_COLORS: Record<NodeCategory, { bg: string; accent: string; icon: string }> = {
		trigger: { bg: 'oklch(0.20 0.04 145)', accent: 'oklch(0.60 0.15 145)', icon: 'oklch(0.75 0.18 145)' },
		llm: { bg: 'oklch(0.20 0.04 280)', accent: 'oklch(0.60 0.15 280)', icon: 'oklch(0.75 0.18 280)' },
		action: { bg: 'oklch(0.20 0.04 230)', accent: 'oklch(0.60 0.15 230)', icon: 'oklch(0.75 0.18 230)' },
		logic: { bg: 'oklch(0.20 0.04 50)', accent: 'oklch(0.60 0.15 50)', icon: 'oklch(0.75 0.18 50)' }
	};

	const STATUS_OVERLAY_COLORS: Record<string, { border: string; glow: string; bg: string }> = {
		success: { border: 'oklch(0.65 0.18 145)', glow: 'oklch(0.65 0.18 145 / 0.4)', bg: 'oklch(0.65 0.18 145 / 0.08)' },
		error: { border: 'oklch(0.60 0.20 25)', glow: 'oklch(0.60 0.20 25 / 0.4)', bg: 'oklch(0.60 0.20 25 / 0.08)' },
		running: { border: 'oklch(0.70 0.15 200)', glow: 'oklch(0.70 0.15 200 / 0.4)', bg: 'oklch(0.70 0.15 200 / 0.08)' },
		skipped: { border: 'oklch(0.40 0.02 250)', glow: 'oklch(0.40 0.02 250 / 0.2)', bg: 'oklch(0.40 0.02 250 / 0.05)' },
		pending: { border: 'oklch(0.35 0.02 250)', glow: 'oklch(0.35 0.02 250 / 0.15)', bg: 'transparent' }
	};

	const NODE_ICONS: Record<NodeType, string> = {
		trigger_cron: '⏱',
		trigger_event: '⚡',
		trigger_manual: '▶',
		llm_prompt: '✦',
		action_create_task: '☐',
		action_send_message: '✉',
		action_run_bash: '>_',
		action_spawn_agent: '⬡',
		action_browser: '◎',
		condition: '◇',
		transform: '⚙'
	};

	// =========================================================================
	// CANVAS STATE
	// =========================================================================

	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);
	let containerEl: HTMLDivElement | undefined = $state();
	let containerRect = $state({ left: 0, top: 0, width: 0, height: 0 });

	// =========================================================================
	// INTERACTION STATE
	// =========================================================================

	// Panning
	let isPanning = $state(false);
	let spaceHeld = $state(false);
	let panStartMouseX = 0;
	let panStartMouseY = 0;
	let panStartPanX = 0;
	let panStartPanY = 0;

	// Node dragging
	let isDragging = $state(false);
	let dragStartMouseX = 0;
	let dragStartMouseY = 0;
	let dragOrigPositions = new Map<string, { x: number; y: number }>();

	// Edge drawing
	let isDrawingEdge = $state(false);
	let edgeSourceNodeId = $state('');
	let edgeSourcePortId = $state('');
	let edgeSourceType = $state<PortType>('data');
	let edgeStartX = $state(0);
	let edgeStartY = $state(0);
	let edgeCursorX = $state(0);
	let edgeCursorY = $state(0);

	// Context menu
	let contextMenu = $state<{ x: number; y: number; nodeId: string } | null>(null);

	// =========================================================================
	// HELPER FUNCTIONS
	// =========================================================================

	function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
		return {
			x: (screenX - containerRect.left - panX) / zoom,
			y: (screenY - containerRect.top - panY) / zoom
		};
	}

	function getNodeHeight(node: WorkflowNode): number {
		const portCount = Math.max(node.inputs.length, node.outputs.length, 1);
		return HEADER_HEIGHT + portCount * PORT_SPACING + BOTTOM_PADDING;
	}

	function getPortPosition(
		node: WorkflowNode,
		port: Port,
		side: 'input' | 'output'
	): { x: number; y: number } {
		const ports = side === 'input' ? node.inputs : node.outputs;
		const index = ports.findIndex((p) => p.id === port.id);
		return {
			x: node.position.x + (side === 'input' ? 0 : NODE_WIDTH),
			y: node.position.y + HEADER_HEIGHT + index * PORT_SPACING + PORT_SPACING / 2
		};
	}

	function getPortAbsolutePosition(
		nodeId: string,
		portId: string
	): { x: number; y: number } | null {
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return null;

		// Check inputs
		const inputIdx = node.inputs.findIndex((p) => p.id === portId);
		if (inputIdx >= 0) {
			return {
				x: node.position.x,
				y: node.position.y + HEADER_HEIGHT + inputIdx * PORT_SPACING + PORT_SPACING / 2
			};
		}

		// Check outputs
		const outputIdx = node.outputs.findIndex((p) => p.id === portId);
		if (outputIdx >= 0) {
			return {
				x: node.position.x + NODE_WIDTH,
				y: node.position.y + HEADER_HEIGHT + outputIdx * PORT_SPACING + PORT_SPACING / 2
			};
		}

		return null;
	}

	function computeEdgePath(
		sx: number,
		sy: number,
		tx: number,
		ty: number
	): string {
		const dx = Math.max(Math.abs(tx - sx) * 0.5, 80);
		return `M ${sx},${sy} C ${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
	}

	function getEdgePath(edge: WorkflowEdge): string | null {
		const source = getPortAbsolutePosition(edge.sourceNodeId, edge.sourcePort);
		const target = getPortAbsolutePosition(edge.targetNodeId, edge.targetPort);
		if (!source || !target) return null;
		return computeEdgePath(source.x, source.y, target.x, target.y);
	}

	function getEdgeColor(edge: WorkflowEdge): string {
		const node = nodes.find((n) => n.id === edge.sourceNodeId);
		if (!node) return PORT_COLORS.data;
		const port = node.outputs.find((p) => p.id === edge.sourcePort);
		if (!port) return PORT_COLORS.data;
		return PORT_COLORS[port.type] || PORT_COLORS.data;
	}

	function snapToGrid(value: number): number {
		if (!gridSnap) return value;
		return Math.round(value / gridSize) * gridSize;
	}

	function generateEdgeId(): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let id = '';
		for (let i = 0; i < 6; i++) {
			id += chars[Math.floor(Math.random() * chars.length)];
		}
		return `edge-${id}`;
	}

	function updateContainerRect() {
		if (containerEl) {
			const rect = containerEl.getBoundingClientRect();
			containerRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
		}
	}

	// =========================================================================
	// CANVAS EVENTS: PAN & ZOOM
	// =========================================================================

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));

		// Zoom toward cursor position
		const mouseX = e.clientX - containerRect.left;
		const mouseY = e.clientY - containerRect.top;
		const scale = newZoom / zoom;

		panX = mouseX - (mouseX - panX) * scale;
		panY = mouseY - (mouseY - panY) * scale;
		zoom = newZoom;
	}

	function handleCanvasMouseDown(e: MouseEvent) {
		updateContainerRect();
		contextMenu = null;

		// Middle mouse button, Alt+click, or Space+click = pan
		if (e.button === 1 || (e.button === 0 && (e.altKey || spaceHeld))) {
			e.preventDefault();
			isPanning = true;
			panStartMouseX = e.clientX;
			panStartMouseY = e.clientY;
			panStartPanX = panX;
			panStartPanY = panY;
			return;
		}

		// Left click on empty canvas = deselect
		if (e.button === 0 && e.target === e.currentTarget) {
			selectedNodeIds = new Set();
			selectedEdgeIds = new Set();
		}
	}

	function handleCanvasMouseMove(e: MouseEvent) {
		if (isPanning) {
			panX = panStartPanX + (e.clientX - panStartMouseX);
			panY = panStartPanY + (e.clientY - panStartMouseY);
			return;
		}

		if (isDragging && !readonly) {
			const dx = (e.clientX - dragStartMouseX) / zoom;
			const dy = (e.clientY - dragStartMouseY) / zoom;

			nodes = nodes.map((node) => {
				const orig = dragOrigPositions.get(node.id);
				if (!orig) return node;
				return {
					...node,
					position: {
						x: snapToGrid(orig.x + dx),
						y: snapToGrid(orig.y + dy)
					}
				};
			});
			return;
		}

		if (isDrawingEdge) {
			const pos = screenToCanvas(e.clientX, e.clientY);
			edgeCursorX = pos.x;
			edgeCursorY = pos.y;
			return;
		}
	}

	function handleCanvasMouseUp(e: MouseEvent) {
		if (isPanning) {
			isPanning = false;
			return;
		}

		if (isDragging) {
			isDragging = false;
			dragOrigPositions.clear();
			onNodesChange?.(nodes);
			return;
		}

		if (isDrawingEdge && !readonly) {
			isDrawingEdge = false;

			// Check if we dropped on a port
			const target = e.target as HTMLElement;
			const portEl = target.closest('[data-port-id]') as HTMLElement | null;
			if (portEl) {
				const targetNodeId = portEl.dataset.nodeId || '';
				const targetPortId = portEl.dataset.portId || '';
				const targetSide = portEl.dataset.portSide || '';

				// Validate: must be input port, different node, no existing edge
				if (
					targetSide === 'input' &&
					targetNodeId !== edgeSourceNodeId &&
					!edges.some(
						(edge) =>
							edge.sourceNodeId === edgeSourceNodeId &&
							edge.sourcePort === edgeSourcePortId &&
							edge.targetNodeId === targetNodeId &&
							edge.targetPort === targetPortId
					)
				) {
					const newEdge: WorkflowEdge = {
						id: generateEdgeId(),
						sourceNodeId: edgeSourceNodeId,
						sourcePort: edgeSourcePortId,
						targetNodeId,
						targetPort: targetPortId
					};
					edges = [...edges, newEdge];
					onEdgesChange?.(edges);
				}
			}
			return;
		}
	}

	// =========================================================================
	// NODE EVENTS
	// =========================================================================

	function handleNodeMouseDown(e: MouseEvent, nodeId: string) {
		if (readonly || e.button !== 0) return;
		e.stopPropagation();
		updateContainerRect();

		// Selection
		if (e.shiftKey) {
			const newSet = new Set(selectedNodeIds);
			if (newSet.has(nodeId)) {
				newSet.delete(nodeId);
			} else {
				newSet.add(nodeId);
			}
			selectedNodeIds = newSet;
		} else if (!selectedNodeIds.has(nodeId)) {
			selectedNodeIds = new Set([nodeId]);
			selectedEdgeIds = new Set();
		}

		// Start dragging
		isDragging = true;
		dragStartMouseX = e.clientX;
		dragStartMouseY = e.clientY;
		dragOrigPositions.clear();

		// Store original positions for all selected nodes
		const selected = selectedNodeIds.has(nodeId) ? selectedNodeIds : new Set([nodeId]);
		for (const id of selected) {
			const node = nodes.find((n) => n.id === id);
			if (node) {
				dragOrigPositions.set(id, { ...node.position });
			}
		}
		// Ensure clicked node is tracked even if not in selection yet
		if (!dragOrigPositions.has(nodeId)) {
			const node = nodes.find((n) => n.id === nodeId);
			if (node) {
				dragOrigPositions.set(nodeId, { ...node.position });
			}
		}
	}

	function handleNodeDoubleClick(e: MouseEvent, nodeId: string) {
		e.stopPropagation();
		onNodeDoubleClick?.(nodeId);
	}

	function handleNodeContextMenu(e: MouseEvent, nodeId: string) {
		if (readonly) return;
		e.preventDefault();
		e.stopPropagation();
		selectedNodeIds = new Set([nodeId]);
		selectedEdgeIds = new Set();
		contextMenu = { x: e.clientX, y: e.clientY, nodeId };
	}

	// =========================================================================
	// PORT EVENTS
	// =========================================================================

	function handlePortMouseDown(
		e: MouseEvent,
		nodeId: string,
		port: Port,
		side: 'input' | 'output'
	) {
		if (readonly || side !== 'output' || e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		updateContainerRect();

		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		const pos = getPortPosition(node, port, side);
		isDrawingEdge = true;
		edgeSourceNodeId = nodeId;
		edgeSourcePortId = port.id;
		edgeSourceType = port.type;
		edgeStartX = pos.x;
		edgeStartY = pos.y;
		edgeCursorX = pos.x;
		edgeCursorY = pos.y;
	}

	// =========================================================================
	// EDGE EVENTS
	// =========================================================================

	function handleEdgeClick(e: MouseEvent, edgeId: string) {
		e.stopPropagation();
		if (e.shiftKey) {
			const newSet = new Set(selectedEdgeIds);
			if (newSet.has(edgeId)) {
				newSet.delete(edgeId);
			} else {
				newSet.add(edgeId);
			}
			selectedEdgeIds = newSet;
		} else {
			selectedEdgeIds = new Set([edgeId]);
			selectedNodeIds = new Set();
		}
	}

	// =========================================================================
	// KEYBOARD EVENTS
	// =========================================================================

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === ' ' && !spaceHeld) {
			const tag = (e.target as HTMLElement).tagName;
			if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
				e.preventDefault();
				spaceHeld = true;
			}
		}
		if (readonly) return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			if (selectedNodeIds.size > 0 || selectedEdgeIds.size > 0) {
				e.preventDefault();
				deleteSelected();
			}
		}
		if (e.key === 'Escape') {
			selectedNodeIds = new Set();
			selectedEdgeIds = new Set();
			contextMenu = null;
			isDrawingEdge = false;
		}
		if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const tag = (e.target as HTMLElement).tagName;
			if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
				gridSnap = !gridSnap;
			}
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (e.key === ' ') {
			spaceHeld = false;
		}
	}

	function deleteSelected() {
		if (selectedNodeIds.size > 0) {
			// Remove selected nodes and their edges
			const removedNodeIds = selectedNodeIds;
			edges = edges.filter(
				(e) => !removedNodeIds.has(e.sourceNodeId) && !removedNodeIds.has(e.targetNodeId)
			);
			nodes = nodes.filter((n) => !removedNodeIds.has(n.id));
			selectedNodeIds = new Set();
			onNodesChange?.(nodes);
			onEdgesChange?.(edges);
		}
		if (selectedEdgeIds.size > 0) {
			edges = edges.filter((e) => !selectedEdgeIds.has(e.id));
			selectedEdgeIds = new Set();
			onEdgesChange?.(edges);
		}
	}

	// =========================================================================
	// CONTEXT MENU ACTIONS
	// =========================================================================

	function handleContextMenuDelete() {
		if (!contextMenu) return;
		selectedNodeIds = new Set([contextMenu.nodeId]);
		deleteSelected();
		contextMenu = null;
	}

	function handleContextMenuDuplicate() {
		if (!contextMenu) return;
		const sourceNode = nodes.find((n) => n.id === contextMenu!.nodeId);
		if (!sourceNode) return;

		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let newId = 'node-';
		for (let i = 0; i < 6; i++) newId += chars[Math.floor(Math.random() * chars.length)];

		const newNode: WorkflowNode = {
			...structuredClone(sourceNode),
			id: newId,
			position: {
				x: sourceNode.position.x + 40,
				y: sourceNode.position.y + 40
			}
		};
		nodes = [...nodes, newNode];
		selectedNodeIds = new Set([newId]);
		onNodesChange?.(nodes);
		contextMenu = null;
	}

	// =========================================================================
	// MINIMAP
	// =========================================================================

	let minimapBounds = $derived.by(() => {
		if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 500, maxY: 400 };
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const node of nodes) {
			minX = Math.min(minX, node.position.x);
			minY = Math.min(minY, node.position.y);
			maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
			maxY = Math.max(maxY, node.position.y + getNodeHeight(node));
		}
		return {
			minX: minX - MINIMAP_PADDING,
			minY: minY - MINIMAP_PADDING,
			maxX: maxX + MINIMAP_PADDING,
			maxY: maxY + MINIMAP_PADDING
		};
	});

	let minimapScale = $derived.by(() => {
		const { minX, minY, maxX, maxY } = minimapBounds;
		const boundsW = maxX - minX;
		const boundsH = maxY - minY;
		if (boundsW <= 0 || boundsH <= 0) return 1;
		return Math.min(MINIMAP_WIDTH / boundsW, MINIMAP_HEIGHT / boundsH);
	});

	let minimapViewport = $derived.by(() => {
		const { minX, minY } = minimapBounds;
		const s = minimapScale;
		// Visible area in canvas coordinates
		const viewLeft = -panX / zoom;
		const viewTop = -panY / zoom;
		const viewWidth = containerRect.width / zoom;
		const viewHeight = containerRect.height / zoom;
		return {
			x: (viewLeft - minX) * s,
			y: (viewTop - minY) * s,
			width: viewWidth * s,
			height: viewHeight * s
		};
	});

	function handleMinimapClick(e: MouseEvent) {
		const minimapEl = e.currentTarget as HTMLElement;
		const rect = minimapEl.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const clickY = e.clientY - rect.top;

		// Convert minimap coordinates to canvas coordinates
		const { minX, minY } = minimapBounds;
		const canvasX = clickX / minimapScale + minX;
		const canvasY = clickY / minimapScale + minY;

		// Center the viewport on this point
		panX = -(canvasX * zoom - containerRect.width / 2);
		panY = -(canvasY * zoom - containerRect.height / 2);
	}

	// =========================================================================
	// FIT VIEW
	// =========================================================================

	export function fitView(padding = 60) {
		if (nodes.length === 0 || !containerEl) return;
		updateContainerRect();

		const { minX, minY, maxX, maxY } = minimapBounds;
		const boundsW = maxX - minX + padding * 2;
		const boundsH = maxY - minY + padding * 2;
		const newZoom = Math.min(
			containerRect.width / boundsW,
			containerRect.height / boundsH,
			1.5
		);
		const centerX = (minX + maxX) / 2;
		const centerY = (minY + maxY) / 2;

		zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
		panX = containerRect.width / 2 - centerX * zoom;
		panY = containerRect.height / 2 - centerY * zoom;
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	$effect(() => {
		if (containerEl) {
			updateContainerRect();
			const observer = new ResizeObserver(() => updateContainerRect());
			observer.observe(containerEl);
			return () => observer.disconnect();
		}
	});

	// Window-level mouse events so dragging works when cursor leaves the canvas
	$effect(() => {
		if (isPanning || isDragging || isDrawingEdge) {
			const onMove = (e: MouseEvent) => handleCanvasMouseMove(e);
			const onUp = (e: MouseEvent) => handleCanvasMouseUp(e);
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
			return () => {
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
			};
		}
	});

	// Close context menu on click outside
	$effect(() => {
		if (contextMenu) {
			const handler = () => { contextMenu = null; };
			const id = setTimeout(() => window.addEventListener('click', handler, { once: true }), 0);
			return () => { clearTimeout(id); window.removeEventListener('click', handler); };
		}
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="wf-canvas"
	bind:this={containerEl}
	onmousedown={handleCanvasMouseDown}
	onmousemove={handleCanvasMouseMove}
	onmouseup={handleCanvasMouseUp}
	onwheel={handleWheel}
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
	oncontextmenu={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
	tabindex="0"
	role="application"
	aria-label="Workflow canvas"
	style="
		--grid-size: {gridSize * zoom}px;
		--grid-offset-x: {panX}px;
		--grid-offset-y: {panY}px;
	"
	class:panning={isPanning}
	class:space-held={spaceHeld}
	class:drawing-edge={isDrawingEdge}
>
	<!-- Grid background -->
	{#if gridSnap}
		<div class="wf-grid"></div>
	{/if}

	<!-- Transform layer (pan + zoom) -->
	<div
		class="wf-transform"
		style="transform: translate({panX}px, {panY}px) scale({zoom});"
	>
		<!-- SVG Edge Layer -->
		<svg class="wf-edges-svg" fill="none">
			<!-- Existing edges -->
			{#each edges as edge (edge.id)}
				{@const path = getEdgePath(edge)}
				{@const color = getEdgeColor(edge)}
				{@const isSelected = selectedEdgeIds.has(edge.id)}
				{#if path}
					<!-- Hit area (invisible, wider for easier clicking) -->
					<path
						d={path}
						stroke="transparent"
						stroke-width={EDGE_HIT_WIDTH / zoom}
						fill="none"
						style="cursor: pointer; pointer-events: stroke;"
						onclick={(e) => handleEdgeClick(e, edge.id)}
					/>
					<!-- Selected glow -->
					{#if isSelected}
						<path
							d={path}
							stroke={color}
							stroke-width={4 / zoom}
							fill="none"
							opacity="0.4"
							style="pointer-events: none;"
						/>
					{/if}
					<!-- Visual edge -->
					<path
						d={path}
						stroke={isSelected ? 'oklch(0.80 0.15 230)' : color}
						stroke-width={2 / zoom}
						fill="none"
						style="pointer-events: none;"
					/>
					<!-- Animated flow dots on selected edges -->
					{#if isSelected}
						<circle r={3 / zoom} fill={color}>
							<animateMotion dur="2s" repeatCount="indefinite" path={path} />
						</circle>
					{/if}
				{/if}
			{/each}

			<!-- Temporary edge while drawing -->
			{#if isDrawingEdge}
				{@const tempPath = computeEdgePath(edgeStartX, edgeStartY, edgeCursorX, edgeCursorY)}
				<path
					d={tempPath}
					stroke={PORT_COLORS[edgeSourceType]}
					stroke-width={2 / zoom}
					stroke-dasharray={`${6 / zoom} ${4 / zoom}`}
					fill="none"
					opacity="0.7"
					style="pointer-events: none;"
				/>
			{/if}
		</svg>

		<!-- Node Layer -->
		{#each nodes as node (node.id)}
			{@const category = NODE_CATEGORIES[node.type]}
			{@const catColors = CATEGORY_COLORS[category]}
			{@const nodeHeight = getNodeHeight(node)}
			{@const isSelected = selectedNodeIds.has(node.id)}
			{@const overlayStatus = nodeStatusOverlay?.[node.id]}
			{@const overlayColors = overlayStatus ? STATUS_OVERLAY_COLORS[overlayStatus] : null}

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="wf-node"
				class:selected={isSelected}
				style="
					left: {node.position.x}px;
					top: {node.position.y}px;
					width: {NODE_WIDTH}px;
					height: {nodeHeight}px;
					--node-bg: {catColors.bg};
					--node-accent: {catColors.accent};
					--node-icon: {catColors.icon};
					{overlayColors ? `border-color: ${overlayColors.border}; box-shadow: 0 0 12px ${overlayColors.glow}; background: ${overlayColors.bg};` : ''}
				"
				onmousedown={(e) => handleNodeMouseDown(e, node.id)}
				ondblclick={(e) => handleNodeDoubleClick(e, node.id)}
				oncontextmenu={(e) => handleNodeContextMenu(e, node.id)}
			>
				<!-- Header -->
				<div class="wf-node-header" style="border-bottom-color: {catColors.accent};">
					<span class="wf-node-icon" style="color: {catColors.icon};">
						{NODE_ICONS[node.type]}
					</span>
					<span class="wf-node-label">{node.label}</span>
				</div>

				<!-- Input Ports -->
				{#each node.inputs as port, i (port.id)}
					{@const portColor = PORT_COLORS[port.type]}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="wf-port wf-port-input"
						style="top: {HEADER_HEIGHT + i * PORT_SPACING + PORT_SPACING / 2}px;"
						data-port-id={port.id}
						data-node-id={node.id}
						data-port-side="input"
						data-port-type={port.type}
					>
						<div
							class="wf-port-circle"
							style="background: {portColor}; box-shadow: 0 0 6px {portColor};"
						></div>
						{#if port.label}
							<span class="wf-port-label wf-port-label-input">{port.label}</span>
						{/if}
					</div>
				{/each}

				<!-- Output Ports -->
				{#each node.outputs as port, i (port.id)}
					{@const portColor = PORT_COLORS[port.type]}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="wf-port wf-port-output"
						style="top: {HEADER_HEIGHT + i * PORT_SPACING + PORT_SPACING / 2}px;"
						data-port-id={port.id}
						data-node-id={node.id}
						data-port-side="output"
						data-port-type={port.type}
						onmousedown={(e) => handlePortMouseDown(e, node.id, port, 'output')}
					>
						{#if port.label}
							<span class="wf-port-label wf-port-label-output">{port.label}</span>
						{/if}
						<div
							class="wf-port-circle"
							style="background: {portColor}; box-shadow: 0 0 6px {portColor};"
						></div>
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<!-- Minimap -->
	{#if nodes.length > 0}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="wf-minimap" onclick={handleMinimapClick}>
			<svg
				width={MINIMAP_WIDTH}
				height={MINIMAP_HEIGHT}
				viewBox="0 0 {MINIMAP_WIDTH} {MINIMAP_HEIGHT}"
			>
				<!-- Minimap edges -->
				{#each edges as edge (edge.id)}
					{@const source = getPortAbsolutePosition(edge.sourceNodeId, edge.sourcePort)}
					{@const target = getPortAbsolutePosition(edge.targetNodeId, edge.targetPort)}
					{#if source && target}
						{@const s = minimapScale}
						{@const { minX, minY } = minimapBounds}
						<line
							x1={(source.x - minX) * s}
							y1={(source.y - minY) * s}
							x2={(target.x - minX) * s}
							y2={(target.y - minY) * s}
							stroke="oklch(0.45 0.05 230)"
							stroke-width="1"
						/>
					{/if}
				{/each}

				<!-- Minimap nodes -->
				{#each nodes as node (node.id)}
					{@const s = minimapScale}
					{@const { minX, minY } = minimapBounds}
					{@const cat = NODE_CATEGORIES[node.type]}
					<rect
						x={(node.position.x - minX) * s}
						y={(node.position.y - minY) * s}
						width={NODE_WIDTH * s}
						height={getNodeHeight(node) * s}
						fill={CATEGORY_COLORS[cat].accent}
						opacity={selectedNodeIds.has(node.id) ? 0.9 : 0.5}
						rx="2"
					/>
				{/each}

				<!-- Viewport rectangle -->
				<rect
					x={minimapViewport.x}
					y={minimapViewport.y}
					width={minimapViewport.width}
					height={minimapViewport.height}
					fill="oklch(0.70 0.10 230 / 0.12)"
					stroke="oklch(0.70 0.12 230)"
					stroke-width="1.5"
					rx="2"
				/>
			</svg>
		</div>
	{/if}

	<!-- Grid snap indicator -->
	<div class="wf-status-bar">
		<button
			class="wf-status-btn"
			class:active={gridSnap}
			onclick={() => { gridSnap = !gridSnap; }}
			title="Toggle grid snap (G)"
		>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
				<line x1="0" y1="4.67" x2="14" y2="4.67" />
				<line x1="0" y1="9.33" x2="14" y2="9.33" />
				<line x1="4.67" y1="0" x2="4.67" y2="14" />
				<line x1="9.33" y1="0" x2="9.33" y2="14" />
			</svg>
			Grid
		</button>
		<span class="wf-zoom-label">{Math.round(zoom * 100)}%</span>
	</div>

	<!-- Context Menu -->
	{#if contextMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="wf-context-menu"
			style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
			onclick={(e) => e.stopPropagation()}
		>
			<button class="wf-ctx-item" onclick={handleContextMenuDuplicate}>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
					<rect x="4" y="4" width="8" height="8" rx="1.5" />
					<path d="M10 2H3.5A1.5 1.5 0 0 0 2 3.5V10" />
				</svg>
				Duplicate
			</button>
			<div class="wf-ctx-divider"></div>
			<button class="wf-ctx-item danger" onclick={handleContextMenuDelete}>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
					<path d="M2 4h10M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M11 4v7a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3 11V4" />
				</svg>
				Delete
				<span class="wf-ctx-key">Del</span>
			</button>
		</div>
	{/if}
</div>

<style>
	/* ===================================================================
	   CANVAS CONTAINER
	   =================================================================== */
	.wf-canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: oklch(0.14 0.015 250);
		outline: none;
		user-select: none;
	}

	.wf-canvas.panning {
		cursor: grabbing;
	}

	.wf-canvas.space-held {
		cursor: grab;
	}

	.wf-canvas.drawing-edge {
		cursor: crosshair;
	}

	/* ===================================================================
	   GRID
	   =================================================================== */
	.wf-grid {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: radial-gradient(circle, oklch(0.25 0.01 250) 1px, transparent 1px);
		background-size: var(--grid-size) var(--grid-size);
		background-position: var(--grid-offset-x) var(--grid-offset-y);
		opacity: 0.5;
	}

	/* ===================================================================
	   TRANSFORM LAYER
	   =================================================================== */
	.wf-transform {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	/* ===================================================================
	   SVG EDGE LAYER
	   =================================================================== */
	.wf-edges-svg {
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: 1px;
		overflow: visible;
		z-index: 1;
	}

	/* ===================================================================
	   NODE
	   =================================================================== */
	.wf-node {
		position: absolute;
		background: var(--node-bg);
		border: 1.5px solid oklch(0.30 0.02 250);
		border-radius: 10px;
		z-index: 2;
		cursor: grab;
		transition: box-shadow 0.15s ease, border-color 0.15s ease;
	}

	.wf-node:hover {
		border-color: oklch(0.40 0.03 250);
		box-shadow: 0 4px 20px oklch(0 0 0 / 0.3);
	}

	.wf-node.selected {
		background: oklch(0.22 0.06 200);
		border-color: oklch(0.60 0.15 230);
		box-shadow:
			0 0 0 2px oklch(0.60 0.15 230 / 0.3),
			0 4px 24px oklch(0 0 0 / 0.4);
	}

	.wf-node:active {
		cursor: grabbing;
	}

	/* ===================================================================
	   NODE HEADER
	   =================================================================== */
	.wf-node-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 40px;
		border-bottom: 1px solid oklch(0.25 0.02 250);
		border-radius: 10px 10px 0 0;
		overflow: hidden;
	}

	.wf-node-icon {
		font-size: 15px;
		flex-shrink: 0;
		width: 20px;
		text-align: center;
		line-height: 1;
	}

	.wf-node-label {
		font-size: 12.5px;
		font-weight: 600;
		color: oklch(0.88 0.02 250);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ===================================================================
	   PORTS
	   =================================================================== */
	.wf-port {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 6px;
		transform: translateY(-50%);
		z-index: 3;
	}

	.wf-port-input {
		left: -7px;
	}

	.wf-port-output {
		right: -7px;
		flex-direction: row-reverse;
	}

	.wf-port-circle {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid oklch(0.14 0.015 250);
		cursor: crosshair;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		flex-shrink: 0;
	}

	.wf-port-circle:hover {
		transform: scale(1.4);
	}

	.wf-port-label {
		font-size: 10px;
		color: oklch(0.60 0.02 250);
		white-space: nowrap;
		pointer-events: none;
	}

	.wf-port-label-input {
		padding-left: 2px;
	}

	.wf-port-label-output {
		padding-right: 2px;
	}

	/* ===================================================================
	   MINIMAP
	   =================================================================== */
	.wf-minimap {
		position: absolute;
		bottom: 48px;
		right: 16px;
		width: 180px;
		height: 130px;
		background: oklch(0.16 0.015 250 / 0.9);
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 8px;
		padding: 4px;
		cursor: pointer;
		backdrop-filter: blur(8px);
		z-index: 10;
		transition: opacity 0.2s ease;
	}

	.wf-minimap:hover {
		border-color: oklch(0.35 0.03 250);
	}

	/* ===================================================================
	   STATUS BAR
	   =================================================================== */
	.wf-status-bar {
		position: absolute;
		bottom: 12px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 10;
	}

	.wf-status-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		background: oklch(0.16 0.015 250 / 0.9);
		color: oklch(0.55 0.02 250);
		font-size: 11px;
		cursor: pointer;
		backdrop-filter: blur(8px);
		transition: all 0.15s ease;
	}

	.wf-status-btn:hover {
		border-color: oklch(0.40 0.03 250);
		color: oklch(0.75 0.02 250);
	}

	.wf-status-btn.active {
		border-color: oklch(0.50 0.12 230);
		color: oklch(0.75 0.12 230);
		background: oklch(0.20 0.03 230 / 0.9);
	}

	.wf-zoom-label {
		padding: 4px 8px;
		border: 1px solid oklch(0.28 0.02 250);
		border-radius: 6px;
		background: oklch(0.16 0.015 250 / 0.9);
		color: oklch(0.55 0.02 250);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		backdrop-filter: blur(8px);
	}

	/* ===================================================================
	   CONTEXT MENU
	   =================================================================== */
	.wf-context-menu {
		position: fixed;
		min-width: 160px;
		background: oklch(0.18 0.02 250);
		border: 1px solid oklch(0.28 0.03 250);
		border-radius: 8px;
		padding: 4px;
		z-index: 100;
		box-shadow: 0 8px 32px oklch(0 0 0 / 0.5);
		animation: wf-menu-in 0.12s ease-out;
	}

	@keyframes wf-menu-in {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-4px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.wf-ctx-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: 5px;
		background: none;
		color: oklch(0.78 0.02 250);
		font-size: 12.5px;
		cursor: pointer;
		text-align: left;
	}

	.wf-ctx-item:hover {
		background: oklch(0.24 0.02 250);
	}

	.wf-ctx-item.danger:hover {
		background: oklch(0.25 0.08 25);
		color: oklch(0.75 0.15 25);
	}

	.wf-ctx-key {
		margin-left: auto;
		font-size: 10px;
		color: oklch(0.45 0.02 250);
		padding: 1px 5px;
		border: 1px solid oklch(0.30 0.02 250);
		border-radius: 3px;
	}

	.wf-ctx-divider {
		height: 1px;
		margin: 3px 6px;
		background: oklch(0.25 0.02 250);
	}
</style>
