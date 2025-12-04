/**
 * SSE endpoint for real-time task events
 * Watches the beads database file and pushes updates when tasks change
 */

import { watch, type FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Dashboard runs from /home/jw/code/jat/dashboard
// Beads file is at /home/jw/code/jat/.beads/issues.jsonl (parent directory)
const BEADS_FILE = join(process.cwd(), '..', '.beads', 'issues.jsonl');

// Track connected clients and file watcher
let watcher: FSWatcher | null = null;
const clients = new Set<ReadableStreamDefaultController>();

// Debounce file changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function getTaskIds(): Promise<Set<string>> {
	try {
		const content = await readFile(BEADS_FILE, 'utf-8');
		const ids = new Set<string>();
		for (const line of content.split('\n')) {
			if (!line.trim()) continue;
			try {
				const task = JSON.parse(line);
				if (task.id) ids.add(task.id);
			} catch {
				// Skip invalid lines
			}
		}
		return ids;
	} catch {
		return new Set();
	}
}

let previousTaskIds = new Set<string>();

async function checkForChanges() {
	console.log('[SSE] Checking for task changes...');
	const currentIds = await getTaskIds();

	// Find new tasks
	const newTasks: string[] = [];
	for (const id of currentIds) {
		if (!previousTaskIds.has(id)) {
			newTasks.push(id);
		}
	}

	// Find removed tasks
	const removedTasks: string[] = [];
	for (const id of previousTaskIds) {
		if (!currentIds.has(id)) {
			removedTasks.push(id);
		}
	}

	previousTaskIds = currentIds;

	// Broadcast to all clients
	if (newTasks.length > 0 || removedTasks.length > 0) {
		console.log(`[SSE] Broadcasting: ${newTasks.length} new, ${removedTasks.length} removed to ${clients.size} clients`);
		const event = {
			type: 'task-change',
			newTasks,
			removedTasks,
			timestamp: Date.now()
		};

		const message = `data: ${JSON.stringify(event)}\n\n`;

		for (const controller of clients) {
			try {
				controller.enqueue(new TextEncoder().encode(message));
			} catch (err) {
				console.error('[SSE] Failed to send to client:', err);
			}
		}
	} else {
		console.log('[SSE] No changes detected');
	}
}

function startWatcher() {
	if (watcher) {
		console.log('[SSE] Watcher already running');
		return;
	}

	console.log(`[SSE] Starting file watcher for: ${BEADS_FILE}`);

	// Initialize previous task IDs
	getTaskIds().then(ids => {
		previousTaskIds = ids;
		console.log(`[SSE] Initialized with ${ids.size} existing tasks`);
	});

	try {
		watcher = watch(BEADS_FILE, { persistent: false }, (eventType) => {
			console.log(`[SSE] File event: ${eventType}`);
			if (eventType === 'change') {
				// Debounce rapid changes
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					checkForChanges();
				}, 100);
			}
		});

		watcher.on('error', (err) => {
			console.error('[SSE] Beads file watcher error:', err);
		});

		console.log('[SSE] File watcher started successfully');
	} catch (err) {
		console.error('[SSE] Failed to start beads watcher:', err);
	}
}

function stopWatcherIfNoClients() {
	if (clients.size === 0 && watcher) {
		watcher.close();
		watcher = null;
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	}
}

export function GET() {
	console.log('[SSE] New client connecting...');

	// Start watcher if not running
	startWatcher();

	let thisController: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(controller) {
			thisController = controller;
			clients.add(controller);
			console.log(`[SSE] Client connected. Total clients: ${clients.size}`);

			// Send initial connection message
			const connectMsg = `data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`;
			controller.enqueue(new TextEncoder().encode(connectMsg));
		},
		cancel() {
			console.log('[SSE] Client disconnected');
			if (thisController) {
				clients.delete(thisController);
			}
			console.log(`[SSE] Remaining clients: ${clients.size}`);
			stopWatcherIfNoClients();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
}
