/**
 * Hyprland Colors API
 * POST /api/hyprland/colors - Apply border colors to all project windows
 *
 * This endpoint is equivalent to the CLI's `jat colors` command.
 * It finds all Hyprland windows with project name prefixes and applies
 * the configured border colors.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

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
 * Get all project configs with colors
 * @returns {Promise<Array<{name: string, displayName: string, activeColor: string, inactiveColor: string}>>}
 */
async function getProjectsWithColors() {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return [];
		}

		const content = await readFile(CONFIG_FILE, 'utf-8');
		const config = JSON.parse(content);

		if (!config.projects) {
			return [];
		}

		const projects = [];
		for (const [name, projectConfig] of Object.entries(config.projects)) {
			/** @type {any} */
			const pc = projectConfig;
			if (pc.active_color) {
				projects.push({
					name,
					displayName: pc.name || name.toUpperCase(),
					activeColor: normalizeColor(pc.active_color),
					inactiveColor: normalizeColor(pc.inactive_color)
				});
			}
		}

		return projects;
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
 * Apply border colors to all windows matching project prefixes
 * Uses hyprctl dispatch setprop for each matching window
 */
export async function POST() {
	// Check if Hyprland is available
	const hyprlandAvailable = await isHyprlandAvailable();
	if (!hyprlandAvailable) {
		return json({
			success: false,
			message: 'Hyprland not available',
			skipped: true
		});
	}

	// Get all projects with colors
	const projects = await getProjectsWithColors();
	if (projects.length === 0) {
		return json({
			success: false,
			message: 'No projects with colors configured'
		});
	}

	// Get all Hyprland windows
	const clients = await getHyprlandClients();
	if (clients.length === 0) {
		return json({
			success: false,
			message: 'No Hyprland windows found'
		});
	}

	const results = [];

	// Build a map of title prefixes to colors
	const prefixColorMap = new Map();
	for (const project of projects) {
		// Match both displayName and uppercase name
		const prefixes = [
			project.displayName + ':',
			project.name.toUpperCase() + ':'
		];

		for (const prefix of prefixes) {
			prefixColorMap.set(prefix, {
				activeColor: project.activeColor,
				inactiveColor: project.inactiveColor,
				projectName: project.name
			});
		}
	}

	// Apply colors to matching windows
	for (const client of clients) {
		if (!client.title || !client.address) continue;

		// Check if title starts with any known prefix
		for (const [prefix, colors] of prefixColorMap.entries()) {
			if (client.title.startsWith(prefix)) {
				const result = await applyBorderColorToWindow(
					client.address,
					colors.activeColor,
					colors.inactiveColor
				);

				results.push({
					window: client.title,
					address: client.address,
					project: colors.projectName,
					prefix,
					activeApplied: result.active,
					inactiveApplied: result.inactive,
					success: result.active || result.inactive
				});

				break; // Only apply first matching prefix
			}
		}
	}

	const successCount = results.filter(r => r.success).length;

	return json({
		success: true,
		message: `Applied colors to ${successCount} window(s)`,
		windowsUpdated: successCount,
		projectsWithColors: projects.length,
		totalWindows: clients.length,
		results
	});
}

/**
 * GET /api/hyprland/colors - Get current Hyprland status and project colors
 */
export async function GET() {
	const hyprlandAvailable = await isHyprlandAvailable();
	const projects = await getProjectsWithColors();
	const clients = hyprlandAvailable ? await getHyprlandClients() : [];

	return json({
		available: hyprlandAvailable,
		projects: projects.map(p => ({
			name: p.name,
			displayName: p.displayName,
			activeColor: p.activeColor,
			inactiveColor: p.inactiveColor
		})),
		windowCount: clients.length,
		windows: clients.map(c => ({
			title: c.title,
			address: c.address
		}))
	});
}
