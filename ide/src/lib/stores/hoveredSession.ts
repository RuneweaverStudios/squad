/**
 * Store for tracking the currently hovered session (for keyboard shortcuts)
 * and visual feedback for session actions
 */
import { writable, get } from 'svelte/store';

// Currently hovered session name (null if none)
export const hoveredSessionName = writable<string | null>(null);

// Signal to maximize the session panel (tasks page listens for this)
// Stores the session name that triggered the maximize, or null when not active
export const maximizeSessionPanel = writable<string | null>(null);

export function setHoveredSession(sessionName: string | null) {
	hoveredSessionName.set(sessionName);
}

// Track the session that should be highlighted (from Alt+number jump)
export const highlightedSessionName = writable<string | null>(null);

/**
 * Jump to a session by setting it as hovered, scrolling to it, highlighting it,
 * and optionally maximizing the session panel height.
 * @param sessionName - The session name to jump to (e.g., "squad-AgentName" for work, "server-project" for servers)
 * @param agentName - The agent name if this is a work session (used for data-agent-name selector)
 * @param options - Optional settings
 * @param options.maximize - If true, signal to maximize the session panel (default: true)
 */
export function jumpToSession(sessionName: string, agentName?: string, options?: { maximize?: boolean }) {
	console.log('[jumpToSession-v2] called with:', sessionName, 'shouldMaximize default:', options?.maximize !== false);
	const shouldMaximize = options?.maximize !== false; // Default to true

	// Set as hovered so other shortcuts (Alt+K, Alt+I, etc.) work on it
	hoveredSessionName.set(sessionName);

	// Set highlighted for visual feedback
	highlightedSessionName.set(sessionName);

	// Clear highlight after animation
	setTimeout(() => {
		highlightedSessionName.update(current => current === sessionName ? null : current);
	}, 2000);

	// Signal to maximize the session panel (tasks page listens for this)
	if (shouldMaximize) {
		maximizeSessionPanel.set(sessionName);
		// Clear signal after a short delay so it can be triggered again
		setTimeout(() => {
			maximizeSessionPanel.update(current => current === sessionName ? null : current);
		}, 500);
	}

	// Scroll to the session card after layout settles
	// When maximizing, wait for:
	// - Svelte effect batching (~16-50ms)
	// - CSS transition (150ms duration-150)
	// - Browser layout recalculation (~16ms)
	// Total: ~250ms minimum, using 400ms for safety margin
	const scrollDelay = shouldMaximize ? 400 : 0;

	const doScroll = () => {
		// Try work session selector first (data-agent-name), then server session selector (data-session-name)
		const selectors = [
			agentName ? `[data-agent-name="${agentName}"]` : null,
			`[data-session-name="${sessionName}"]`,
			`[data-agent-name="${sessionName.replace(/^squad-/, '')}"]`  // Fallback: extract agent from session name
		].filter(Boolean);

		for (const selector of selectors) {
			const element = document.querySelector(selector as string);
			if (element) {
				// Use 'start' to align card header with top of viewport
				element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
				break;
			}
		}
	};

	if (scrollDelay > 0) {
		// Wait for panel resize, then use requestAnimationFrame to ensure layout is complete
		setTimeout(() => {
			requestAnimationFrame(() => {
				requestAnimationFrame(doScroll); // Double rAF ensures layout is fully settled
			});
		}, scrollDelay);
	} else {
		doScroll();
	}
}

// Track sessions that just received a "complete" action (for visual feedback)
// Maps session name to timestamp when action was triggered
export const completingSessionFlash = writable<string | null>(null);

/**
 * Trigger a visual flash on a session card when Alt+C complete action is sent
 * The flash automatically clears after 1.5 seconds
 */
export function triggerCompleteFlash(sessionName: string) {
	completingSessionFlash.set(sessionName);
	setTimeout(() => {
		completingSessionFlash.update(current => current === sessionName ? null : current);
	}, 1500);
}
