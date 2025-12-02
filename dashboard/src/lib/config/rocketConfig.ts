/**
 * Rocket Animation Configuration
 * Controls elapsed time display colors and fire animation scaling
 */

/**
 * Get color class for elapsed time display
 * Green for fresh tasks, yellow for moderate, orange/red for long-running
 */
export function getElapsedTimeColor(minutes: number): string {
	if (minutes < 30) {
		return 'text-success'; // Green - just started
	} else if (minutes < 60) {
		return 'text-info'; // Blue - working steadily
	} else if (minutes < 120) {
		return 'text-warning'; // Yellow - been a while
	} else if (minutes < 240) {
		return 'text-orange-400'; // Orange - long running
	} else {
		return 'text-error'; // Red - very long running (4+ hours)
	}
}

/**
 * Format elapsed time for display
 * Shows minutes for <60m, hours+minutes for longer durations
 */
export function formatElapsedTime(minutes: number): string {
	if (minutes < 60) {
		return `${minutes}m`;
	} else {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (mins === 0) {
			return `${hours}h`;
		}
		return `${hours}h ${mins}m`;
	}
}

/**
 * Get fire animation scale based on elapsed time
 * Longer running tasks have more intense fire effect
 */
export function getFireScale(minutes: number): number {
	if (minutes < 15) {
		return 0.6; // Small flame - just started
	} else if (minutes < 30) {
		return 0.8; // Growing flame
	} else if (minutes < 60) {
		return 1.0; // Normal flame
	} else if (minutes < 120) {
		return 1.2; // Larger flame
	} else {
		return 1.5; // Maximum flame intensity
	}
}

/**
 * Rocket launch animation timing (milliseconds)
 */
export const ROCKET_ANIMATION = {
	shakeDuration: 400,
	launchDelay: 400,
	launchDuration: 600,
	fireDelay: 300,
	fireDuration: 800,
	smokeDelay: 200,
	smokeDuration: 800,
	totalDuration: 1200 // Total time before callback
};
