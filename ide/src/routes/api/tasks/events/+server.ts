/**
 * SSE endpoint for real-time task events
 * Watches the JAT tasks database file and pushes updates when tasks change
 */

import { watch, type FSWatcher, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname, basename } from 'path';

// IDE runs from /home/jw/code/jat/ide
// JAT tasks file is at /home/jw/code/jat/.jat/issues.jsonl (parent directory)
const JAT_TASKS_FILE = join(process.cwd(), '..', '.jat', 'issues.jsonl');
const JAT_TASKS_DIR = dirname(JAT_TASKS_FILE);
const JAT_TASKS_FILENAME = basename(JAT_TASKS_FILE);

// Track connected clients and file watcher
let watcher: FSWatcher | null = null;
const clients = new Set<ReadableStreamDefaultController>();

// Debounce file changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Task snapshot for change detection - tracks properties that affect UI display
interface TaskSnapshot {
	id: string;
	status: string;
	assignee: string | null;
}

async function getTaskSnapshots(): Promise<Map<string, TaskSnapshot>> {
	try {
		const content = await readFile(JAT_TASKS_FILE, 'utf-8');
		const snapshots = new Map<string, TaskSnapshot>();
		for (const line of content.split('\n')) {
			if (!line.trim()) continue;
			try {
				const task = JSON.parse(line);
				if (task.id) {
					snapshots.set(task.id, {
						id: task.id,
						status: task.status || 'open',
						assignee: task.assignee || null
					});
				}
			} catch {
				// Skip invalid lines
			}
		}
		return snapshots;
	} catch {
		return new Map();
	}
}

let previousSnapshots = new Map<string, TaskSnapshot>();

async function checkForChanges() {
	console.log('[SSE] Checking for task changes...');
	const currentSnapshots = await getTaskSnapshots();

	// Find new tasks
	const newTasks: string[] = [];
	for (const id of currentSnapshots.keys()) {
		if (!previousSnapshots.has(id)) {
			newTasks.push(id);
		}
	}

	// Find removed tasks
	const removedTasks: string[] = [];
	for (const id of previousSnapshots.keys()) {
		if (!currentSnapshots.has(id)) {
			removedTasks.push(id);
		}
	}

	// Find updated tasks (status or assignee changed)
	const updatedTasks: string[] = [];
	for (const [id, current] of currentSnapshots) {
		const previous = previousSnapshots.get(id);
		if (previous) {
			// Check if status or assignee changed
			if (previous.status !== current.status || previous.assignee !== current.assignee) {
				updatedTasks.push(id);
				console.log(`[SSE] Task ${id} updated: status ${previous.status}->${current.status}, assignee ${previous.assignee}->${current.assignee}`);
			}
		}
	}

	previousSnapshots = currentSnapshots;

	// Broadcast to all clients if anything changed
	if (newTasks.length > 0 || removedTasks.length > 0 || updatedTasks.length > 0) {
		console.log(`[SSE] Broadcasting: ${newTasks.length} new, ${removedTasks.length} removed, ${updatedTasks.length} updated to ${clients.size} clients`);
		const event = {
			type: 'task-change',
			newTasks,
			removedTasks,
			updatedTasks,
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

	// Check if .jat directory exists (jat repo itself doesn't have one)
	if (!existsSync(JAT_TASKS_DIR)) {
		console.log(`[SSE] Skipping watcher - ${JAT_TASKS_DIR} does not exist (normal for jat repo itself)`);
		return;
	}

	// Watch the DIRECTORY instead of the file - more reliable for atomic writes
	console.log(`[SSE] Starting directory watcher for: ${JAT_TASKS_DIR} (watching ${JAT_TASKS_FILENAME})`);

	// Initialize previous task snapshots
	getTaskSnapshots().then(snapshots => {
		previousSnapshots = snapshots;
		console.log(`[SSE] Initialized with ${snapshots.size} existing tasks`);
	});

	try {
		// Watch the directory and filter for our target file
		watcher = watch(JAT_TASKS_DIR, { persistent: false }, (eventType, filename) => {
			// Only react to changes in our target file
			if (filename === JAT_TASKS_FILENAME || filename === null) {
				console.log(`[SSE] File event: ${eventType} for ${filename || 'unknown'}`);
				// Debounce rapid changes
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					checkForChanges();
				}, 100);
			}
		});

		watcher.on('error', (err) => {
			console.error('[SSE] JAT directory watcher error:', err);
		});

		console.log('[SSE] Directory watcher started successfully');
	} catch (err) {
		console.error('[SSE] Failed to start JAT watcher:', err);
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
