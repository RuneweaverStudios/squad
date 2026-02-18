/**
 * Hyprland Border Color API
 * POST /api/sessions/[name]/hyprland-color
 *
 * Applies Hyprland window border colors based on project configuration.
 * The session name (e.g., "squad-AgentName") is used to find the terminal window.
 *
 * Query params:
 *   ?project=squad  - Project name to use for colors (optional, derived from task if not provided)
 *
 * Body (optional):
 *   { taskId?: string }  - Task ID to derive project from (e.g., "squad-abc" -> "squad")
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);
const readFileAsync = promisify(readFile);

const CONFIG_FILE = join(homedir(), '.config', 'squad', 'projects.json');

/**
 * Check if Hyprland is available
 */
async function isHyprlandAvailable() {
	try {
		await execAsync('command -v hyprctl', { timeout: 1000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get all Hyprland windows
 * @returns {Promise<Array<{address: string, title: string}>>}
 */
async function getHyprlandClients() {
	try {
		const { stdout } = await execAsync('hyprctl clients -j', { timeout: 5000 });
		return JSON.parse(stdout);
	} catch {
		return [];
	}
}

/**
 * Apply border color to a specific window by address
 * Uses hyprctl dispatch setprop with activebordercolor and inactivebordercolor
 * @param {string} address - Window address (e.g., "0x55cdbdaa9820")
 * @param {string} activeColor - Active border color in rgb(rrggbb) format
 * @param {string} inactiveColor - Inactive border color in rgb(rrggbb) format
 */
async function applyBorderColorToWindow(address, activeColor, inactiveColor) {
	const results = { active: false, inactive: false };

	if (activeColor) {
		try {
			await execAsync(
				`hyprctl dispatch setprop "address:${address}" activebordercolor "${activeColor}"`,
				{ timeout: 2000 }
			);
			results.active = true;
		} catch {
			// Ignore errors
		}
	}

	if (inactiveColor) {
		try {
			await execAsync(
				`hyprctl dispatch setprop "address:${address}" inactivebordercolor "${inactiveColor}"`,
				{ timeout: 2000 }
			);
			results.inactive = true;
		} catch {
			// Ignore errors
		}
	}

	return results;
}

/**
 * Apply border colors to windows matching a project prefix
 * @param {string} projectName - The project name (e.g., "squad")
 * @param {string} activeColor - Active border color (rgb format)
 * @param {string} inactiveColor - Inactive border color (rgb format)
 * @param {string} [sessionName] - Optional: specific session name to match
 */
async function applyBorderColorToProjectWindows(projectName, activeColor, inactiveColor, sessionName) {
	const clients = await getHyprlandClients();
	const results = [];
	const projectPrefix = projectName.toUpperCase() + ':';

	for (const client of clients) {
		if (!client.title || !client.address) continue;

		// Match windows with project prefix in title
		// If sessionName provided, also check for that
		const matchesProject = client.title.startsWith(projectPrefix);
		const matchesSession = sessionName ? client.title.includes(sessionName) : true;

		if (matchesProject && matchesSession) {
			const result = await applyBorderColorToWindow(
				client.address,
				activeColor,
				inactiveColor
			);

			results.push({
				window: client.title,
				address: client.address,
				activeApplied: result.active,
				inactiveApplied: result.inactive,
				success: result.active || result.inactive
			});
		}
	}

	return results;
}

/**
 * Convert hex color to Hyprland rgb format
 * @param {string} color - Color in #rrggbb or rgb(rrggbb) format
 * @returns {string} Color in rgb(rrggbb) format
 */
function normalizeColor(color) {
	if (!color) return '';

	// Already in rgb(rrggbb) format
	if (color.startsWith('rgb(')) {
		return color;
	}

	// Convert #rrggbb to rgb(rrggbb)
	if (color.startsWith('#')) {
		return `rgb(${color.slice(1)})`;
	}

	// Assume it's a bare hex value
	return `rgb(${color})`;
}

/**
 * Get project colors from config
 * @param {string} projectName
 * @returns {Promise<{activeColor: string, inactiveColor: string} | null>}
 */
async function getProjectColors(projectName) {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return null;
		}

		const content = await readFileAsync(CONFIG_FILE, 'utf-8');
		const config = JSON.parse(content);

		const projectConfig = config.projects?.[projectName];
		if (!projectConfig) {
			return null;
		}

		return {
			activeColor: normalizeColor(projectConfig.active_color),
			inactiveColor: normalizeColor(projectConfig.inactive_color)
		};
	} catch {
		return null;
	}
}

export async function POST({ params, url, request }) {
	const sessionName = params.name;

	if (!sessionName) {
		return json({ error: 'Session name required' }, { status: 400 });
	}

	// Check if Hyprland is available
	const hyprlandAvailable = await isHyprlandAvailable();
	if (!hyprlandAvailable) {
		return json({
			success: false,
			message: 'Hyprland not available',
			skipped: true
		});
	}

	// Get project name from query param or request body
	let projectName = url.searchParams.get('project');

	if (!projectName) {
		try {
			const body = await request.json().catch(() => ({}));
			if (body.taskId) {
				// Extract project from task ID (e.g., "squad-abc" -> "squad")
				projectName = body.taskId.split('-')[0];
			}
		} catch {
			// No body provided
		}
	}

	if (!projectName) {
		return json({
			error: 'Project name required (via ?project= query param or taskId in body)'
		}, { status: 400 });
	}

	// Get project colors
	const colors = await getProjectColors(projectName);

	if (!colors || (!colors.activeColor && !colors.inactiveColor)) {
		return json({
			success: false,
			message: `No colors configured for project: ${projectName}`,
			project: projectName
		});
	}

	// Apply border colors to matching windows
	const results = await applyBorderColorToProjectWindows(
		projectName,
		colors.activeColor,
		colors.inactiveColor,
		sessionName
	);

	return json({
		success: true,
		sessionName,
		project: projectName,
		activeColor: colors.activeColor,
		inactiveColor: colors.inactiveColor,
		windowsUpdated: results.filter(r => r.success).length,
		results
	});
}

/**
 * GET /api/sessions/[name]/hyprland-color
 * Check current Hyprland color status for a session
 */
export async function GET({ params }) {
	const sessionName = params.name;

	const hyprlandAvailable = await isHyprlandAvailable();
	if (!hyprlandAvailable) {
		return json({
			available: false,
			message: 'Hyprland not available'
		});
	}

	const clients = await getHyprlandClients();
	const matchingClients = clients.filter(client =>
		client.title && client.title.includes(sessionName)
	);

	return json({
		available: true,
		sessionName,
		matchingWindows: matchingClients.map(c => ({
			address: c.address,
			title: c.title
		}))
	});
}
