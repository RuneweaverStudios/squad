import type { FeedbackReport } from './types';
import { submitReport } from './api';

const STORAGE_KEY = 'jat-feedback-queue';
const MAX_ENTRIES = 50;
const RETRY_INTERVAL_MS = 30_000;

interface QueueEntry {
  report: FeedbackReport;
  endpoint: string;
  queuedAt: string;
  attempts: number;
}

let retryTimer: ReturnType<typeof setInterval> | null = null;

function getQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueueEntry[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage full or unavailable
  }
}

export function enqueue(endpoint: string, report: FeedbackReport) {
  const queue = getQueue();
  queue.push({
    report,
    endpoint,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });

  // Cap at MAX_ENTRIES, dropping oldest first
  while (queue.length > MAX_ENTRIES) {
    queue.shift();
  }

  saveQueue(queue);
}

export function getQueueSize(): number {
  return getQueue().length;
}

async function processQueue() {
  const queue = getQueue();
  if (queue.length === 0) return;

  const remaining: QueueEntry[] = [];

  for (const entry of queue) {
    try {
      const result = await submitReport(entry.endpoint, entry.report);
      if (!result.ok) {
        entry.attempts++;
        remaining.push(entry);
      }
      // Success: don't re-add to queue
    } catch {
      entry.attempts++;
      remaining.push(entry);
    }
  }

  saveQueue(remaining);
}

export function startRetryLoop() {
  if (retryTimer) return;
  // Process immediately on start
  processQueue();
  retryTimer = setInterval(processQueue, RETRY_INTERVAL_MS);
}

export function stopRetryLoop() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}
