/**
 * Push Notifications System for SQUAD IDE
 *
 * Provides multiple notification channels to alert users when agents need attention:
 * 1. Browser Notifications API - System-level notifications (works even when tab is in background)
 * 2. Favicon Badge - Visual indicator with count on browser tab icon
 * 3. Title Prefix - Document title shows attention count
 *
 * All channels respect user preferences and can be individually enabled/disabled.
 */

import {
	getNotificationsEnabled,
	setNotificationsEnabled,
	getFaviconBadgeEnabled,
	setFaviconBadgeEnabled,
	getTitleBadgeEnabled,
	setTitleBadgeEnabled
} from '$lib/stores/preferences.svelte';

// ============================================================================
// STATE
// ============================================================================

let originalFavicon: string | null = null;
let originalTitle: string = '';
let currentBadgeCount = 0;
let faviconCanvas: HTMLCanvasElement | null = null;
let notificationPermission: NotificationPermission = 'default';

// ============================================================================
// BROWSER NOTIFICATIONS
// ============================================================================

/**
 * Check if browser notifications are supported
 */
export function areBrowserNotificationsSupported(): boolean {
	return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
	if (!areBrowserNotificationsSupported()) return 'denied';
	return Notification.permission;
}

/**
 * Request permission to show browser notifications
 * Returns the permission status after request
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!areBrowserNotificationsSupported()) return 'denied';

	try {
		const permission = await Notification.requestPermission();
		notificationPermission = permission;
		return permission;
	} catch {
		return 'denied';
	}
}

/**
 * Show a browser notification
 * @param title - Notification title
 * @param options - Notification options (body, icon, tag, etc.)
 */
export function showBrowserNotification(
	title: string,
	options?: NotificationOptions
): Notification | null {
	if (!areBrowserNotificationsSupported()) return null;
	if (!getNotificationsEnabled()) return null;
	if (Notification.permission !== 'granted') return null;

	// Don't show notification if tab is currently visible
	if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
		return null;
	}

	try {
		const notification = new Notification(title, {
			icon: '/favicon.svg',
			badge: '/favicon.svg',
			...options
		});

		// Auto-close after 5 seconds
		setTimeout(() => notification.close(), 5000);

		// Focus window when notification is clicked
		notification.onclick = () => {
			window.focus();
			notification.close();
		};

		return notification;
	} catch {
		return null;
	}
}

/**
 * Show notification for agents needing input
 */
export function notifyAgentsNeedInput(count: number, agentNames?: string[]): Notification | null {
	if (count === 0) return null;

	const title = count === 1 ? 'Agent needs input' : `${count} agents need input`;
	const body =
		agentNames && agentNames.length > 0
			? `${agentNames.slice(0, 3).join(', ')}${agentNames.length > 3 ? '...' : ''}`
			: 'Click to respond';

	return showBrowserNotification(title, {
		body,
		tag: 'agents-need-input', // Replace previous notification with same tag
		requireInteraction: true // Keep notification visible until user interacts
	});
}

/**
 * Show notification for agents ready for review
 */
export function notifyAgentsNeedReview(count: number, agentNames?: string[]): Notification | null {
	if (count === 0) return null;

	const title = count === 1 ? 'Agent ready for review' : `${count} agents ready for review`;
	const body =
		agentNames && agentNames.length > 0
			? `${agentNames.slice(0, 3).join(', ')}${agentNames.length > 3 ? '...' : ''}`
			: 'Click to review';

	return showBrowserNotification(title, {
		body,
		tag: 'agents-need-review' // Replace previous notification with same tag
	});
}

// ============================================================================
// FAVICON BADGE
// ============================================================================

/**
 * Initialize favicon badge system
 * Stores original favicon for restoration
 */
export function initFaviconBadge(): void {
	if (typeof document === 'undefined') return;

	// Store original favicon
	const link = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
	if (link) {
		originalFavicon = link.href;
	}

	// Create canvas for badge rendering
	faviconCanvas = document.createElement('canvas');
	faviconCanvas.width = 32;
	faviconCanvas.height = 32;
}

/**
 * Update favicon with badge count
 * @param count - Number to display (0 removes badge)
 */
export function updateFaviconBadge(count: number): void {
	if (typeof document === 'undefined') return;
	if (!getFaviconBadgeEnabled()) {
		// If disabled, restore original favicon if we changed it
		if (currentBadgeCount > 0) {
			restoreOriginalFavicon();
		}
		return;
	}

	currentBadgeCount = count;

	if (count === 0) {
		restoreOriginalFavicon();
		return;
	}

	if (!faviconCanvas) {
		initFaviconBadge();
	}
	if (!faviconCanvas) return;

	const ctx = faviconCanvas.getContext('2d');
	if (!ctx) return;

	// Load original favicon
	const img = new Image();
	img.crossOrigin = 'anonymous';
	img.onload = () => {
		// Clear canvas
		ctx.clearRect(0, 0, 32, 32);

		// Draw original favicon
		ctx.drawImage(img, 0, 0, 32, 32);

		// Draw badge circle
		const badgeRadius = 10;
		const badgeX = 32 - badgeRadius;
		const badgeY = badgeRadius;

		// Badge background (red for attention)
		ctx.beginPath();
		ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
		ctx.fillStyle = '#ef4444'; // red-500
		ctx.fill();

		// Badge border
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();

		// Badge text
		const displayCount = count > 9 ? '9+' : count.toString();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(displayCount, badgeX, badgeY);

		// Update favicon
		updateFaviconElement(faviconCanvas!.toDataURL('image/png'));
	};

	img.onerror = () => {
		// If original favicon fails to load, create badge-only favicon
		ctx.clearRect(0, 0, 32, 32);

		// Draw a simple colored square as base
		ctx.fillStyle = '#1e293b'; // slate-800
		ctx.fillRect(0, 0, 32, 32);

		// Draw badge circle
		const badgeRadius = 10;
		const badgeX = 32 - badgeRadius;
		const badgeY = badgeRadius;

		ctx.beginPath();
		ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
		ctx.fillStyle = '#ef4444';
		ctx.fill();

		const displayCount = count > 9 ? '9+' : count.toString();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(displayCount, badgeX, badgeY);

		updateFaviconElement(faviconCanvas!.toDataURL('image/png'));
	};

	img.src = originalFavicon || '/favicon.svg';
}

/**
 * Update the favicon link element
 */
function updateFaviconElement(dataUrl: string): void {
	if (typeof document === 'undefined') return;

	let link = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
	if (!link) {
		link = document.createElement('link');
		link.rel = 'icon';
		document.head.appendChild(link);
	}
	link.href = dataUrl;
}

/**
 * Restore original favicon (removes badge)
 */
export function restoreOriginalFavicon(): void {
	if (typeof document === 'undefined') return;

	currentBadgeCount = 0;

	if (originalFavicon) {
		updateFaviconElement(originalFavicon);
	} else {
		// Reset to default
		const link = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
		if (link) {
			link.href = '/favicon.svg';
		}
	}
}

// ============================================================================
// TITLE BADGE
// ============================================================================

/**
 * Initialize title badge system
 * Stores original title for restoration
 */
export function initTitleBadge(): void {
	if (typeof document === 'undefined') return;
	originalTitle = document.title;
}

/**
 * Update document title with badge count
 * @param count - Number to display (0 removes prefix)
 */
export function updateTitleBadge(count: number): void {
	if (typeof document === 'undefined') return;
	if (!getTitleBadgeEnabled()) {
		// If disabled, restore original title if we changed it
		restoreOriginalTitle();
		return;
	}

	if (count === 0) {
		restoreOriginalTitle();
		return;
	}

	// Extract base title (remove any existing badge)
	const baseTitle = originalTitle || 'SQUAD IDE';

	document.title = `(${count}) ${baseTitle}`;
}

/**
 * Restore original document title (removes badge)
 */
export function restoreOriginalTitle(): void {
	if (typeof document === 'undefined') return;

	if (originalTitle) {
		document.title = originalTitle;
	}
}

// ============================================================================
// UNIFIED API
// ============================================================================

/**
 * Initialize all notification systems
 * Call this once on app mount
 */
export function initNotifications(): void {
	initFaviconBadge();
	initTitleBadge();

	// Cache current notification permission
	if (areBrowserNotificationsSupported()) {
		notificationPermission = Notification.permission;
	}
}

/**
 * Update all notification badges with attention count
 * @param count - Total agents needing attention (needsInput + review)
 */
export function updateAttentionBadges(count: number): void {
	updateFaviconBadge(count);
	updateTitleBadge(count);
}

/**
 * Clear all notification badges
 */
export function clearAllBadges(): void {
	restoreOriginalFavicon();
	restoreOriginalTitle();
}

/**
 * Handle state count changes
 * Call this when stateCounts changes in the layout
 */
export function handleStateCountChange(
	prevCounts: { needsInput: number; review: number } | null,
	newCounts: { needsInput: number; review: number },
	agentsByState?: { needsInput?: string[]; review?: string[] }
): void {
	const totalAttention = newCounts.needsInput + newCounts.review;

	// Update badges
	updateAttentionBadges(totalAttention);

	// Only show browser notifications if counts INCREASED (not on initial load or decreases)
	if (prevCounts) {
		// Check if needs-input count increased
		if (newCounts.needsInput > prevCounts.needsInput) {
			const newCount = newCounts.needsInput - prevCounts.needsInput;
			notifyAgentsNeedInput(newCount, agentsByState?.needsInput);
		}

		// Check if review count increased
		if (newCounts.review > prevCounts.review) {
			const newCount = newCounts.review - prevCounts.review;
			notifyAgentsNeedReview(newCount, agentsByState?.review);
		}
	}
}

// ============================================================================
// PREFERENCE MANAGEMENT (re-exports for convenience)
// ============================================================================

export {
	getNotificationsEnabled,
	setNotificationsEnabled,
	getFaviconBadgeEnabled,
	setFaviconBadgeEnabled,
	getTitleBadgeEnabled,
	setTitleBadgeEnabled
};
