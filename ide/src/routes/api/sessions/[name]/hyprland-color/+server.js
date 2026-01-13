/**
 * Hyprland Border Color API
 * POST /api/sessions/[name]/hyprland-color
 *
 * Applies Hyprland window border colors based on project configuration.
 * The session name (e.g., "jat-AgentName") is used to find the terminal window.
 *
 * Query params:
 *   ?project=jat  - Project name to use for colors (optional, derived from task if not provided)
 *
 * Body (optional):
 *   { taskId?: string }  - Task ID to derive project from (e.g., "jat-abc" -> "jat")
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);
const readFileAsync = promisify(readFile);

const CONFIG_FILE = join(homedir(), '.config', 'jat', 'projects.json');

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
 * Apply border color to windows matching the session name or project
 * @param {string} sessionName - The tmux session name (e.g., "jat-AgentName")
 * @param {string} projectName - The project name (e.g., "jat")
 * @param {string} activeColor - Active border color (rgb format or hex)
 * @param {string} inactiveColor - Inactive border color (rgb format or hex)
 */
async function applyBorderColor(sessionName, projectName, activeColor, inactiveColor) {
	const clients = await getHyprlandClients();

	// The CLI uses title format "{PROJECT}: Claude" or "{PROJECT}: jat-AgentName"
	// We match on multiple patterns:
	// - "{PROJECT}:" prefix (e.g., "JAT: Claude", "CHIMARO: jat-AgentName")
	// - Contains session name (e.g., "tmux: jat-AgentName", "jat-AgentName")
	const projectPrefix = projectName.toUpperCase() + ':';

	const matchingClients = clients.filter(client =>
		client.title && (
			client.title.startsWith(projectPrefix) ||
			client.title.includes(sessionName) ||
			client.title.includes(`tmux: ${sessionName}`)
		)
	);

	const results = [];

	for (const client of matchingClients) {
		try {
			// Set active border color
			if (activeColor) {
				await execAsync(
					`hyprctl dispatch setprop "address:${client.address}" activebordercolor "${activeColor}"`,
					{ timeout: 2000 }
				);
			}

			// Set inactive border color
			if (inactiveColor) {
				await execAsync(
					`hyprctl dispatch setprop "address:${client.address}" inactivebordercolor "${inactiveColor}"`,
					{ timeout: 2000 }
				);
			}

			results.push({
				address: client.address,
				title: client.title,
				success: true
			});
		} catch (err) {
			results.push({
				address: client.address,
				title: client.title,
				success: false,
				error: err instanceof Error ? err.message : String(err)
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
				// Extract project from task ID (e.g., "jat-abc" -> "jat")
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

	// Apply border colors
	const results = await applyBorderColor(
		sessionName,
		projectName,
		colors.activeColor,
		colors.inactiveColor
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
