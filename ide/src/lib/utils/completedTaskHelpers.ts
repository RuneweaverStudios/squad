/**
 * Shared types and helpers for completed task rendering.
 * Used by both /history and /tasks pages.
 */

export interface CompletedTask {
	id: string;
	title: string;
	assignee?: string;
	created_at: string;
	updated_at: string;
	closed_at?: string;
	priority?: number;
	issue_type?: string;
	project?: string;
}

export interface DayGroup {
	date: string;
	displayDate: string;
	tasks: CompletedTask[];
	agents: Map<string, number>;
}

/** Get YYYY-MM-DD in local timezone (not UTC) */
export function toLocalDateStr(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse YYYY-MM-DD as local midnight (not UTC midnight) */
export function parseLocalDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function formatDisplayDate(date: Date): string {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const dateOnly = new Date(date);
	dateOnly.setHours(0, 0, 0, 0);

	if (dateOnly.getTime() === today.getTime()) return "Today";
	if (dateOnly.getTime() === yesterday.getTime()) return "Yesterday";

	return date.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
	});
}

export function getTaskDuration(task: CompletedTask): number {
	const end = new Date(task.closed_at || task.updated_at).getTime();
	const start = new Date(task.created_at).getTime();
	return Math.max(0, end - start);
}

export function formatDuration(ms: number): string {
	const mins = Math.round(ms / 60000);
	if (mins < 1) return "<1m";
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Position a task on a 24h midnight-to-midnight timeline */
export function getTimelinePos(task: CompletedTask): { left: number; width: number; crossDay: boolean } {
	const startDate = new Date(task.created_at);
	const endDate = new Date(task.closed_at || task.updated_at);

	const endMins = endDate.getHours() * 60 + endDate.getMinutes();

	// If task spans multiple days, clamp start to midnight of completion day
	const sameDay =
		startDate.getFullYear() === endDate.getFullYear() &&
		startDate.getMonth() === endDate.getMonth() &&
		startDate.getDate() === endDate.getDate();
	const startMins = sameDay
		? startDate.getHours() * 60 + startDate.getMinutes()
		: 0;

	const left = (startMins / 1440) * 100;
	const width = Math.max(1.2, ((endMins - startMins) / 1440) * 100);

	return { left, width, crossDay: !sameDay };
}

export function formatTime(dateStr: string): string {
	return new Date(dateStr).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});
}

/** Priority color map for badges */
export const PRIORITY_COLORS: Record<number, { bg: string; text: string; border: string }> = {
	0: { bg: 'oklch(0.55 0.20 25 / 0.25)', text: 'oklch(0.75 0.18 25)', border: 'oklch(0.55 0.20 25 / 0.5)' },
	1: { bg: 'oklch(0.55 0.18 85 / 0.25)', text: 'oklch(0.80 0.15 85)', border: 'oklch(0.55 0.18 85 / 0.5)' },
	2: { bg: 'oklch(0.55 0.15 200 / 0.20)', text: 'oklch(0.75 0.12 200)', border: 'oklch(0.55 0.15 200 / 0.4)' },
	3: { bg: 'oklch(0.35 0.02 250 / 0.30)', text: 'oklch(0.65 0.02 250)', border: 'oklch(0.35 0.02 250 / 0.5)' },
};

/**
 * Group completed tasks by day, sorted descending (most recent first).
 * Tasks within each day are sorted by completion time descending.
 */
export function groupTasksByDay(tasks: CompletedTask[]): DayGroup[] {
	const groups = new Map<string, DayGroup>();

	for (const task of tasks) {
		const dateStr = toLocalDateStr(task.closed_at || task.updated_at);

		if (!groups.has(dateStr)) {
			groups.set(dateStr, {
				date: dateStr,
				displayDate: formatDisplayDate(parseLocalDate(dateStr)),
				tasks: [],
				agents: new Map(),
			});
		}

		const group = groups.get(dateStr)!;
		group.tasks.push(task);
		if (task.assignee) {
			group.agents.set(
				task.assignee,
				(group.agents.get(task.assignee) || 0) + 1,
			);
		}
	}

	// Sort tasks within each day by completion time descending (most recent first)
	for (const group of groups.values()) {
		group.tasks.sort((a, b) => {
			const aTime = new Date(a.closed_at || a.updated_at).getTime();
			const bTime = new Date(b.closed_at || b.updated_at).getTime();
			return bTime - aTime;
		});
	}

	// Sort by date descending
	return Array.from(groups.values()).sort((a, b) =>
		b.date.localeCompare(a.date),
	);
}
