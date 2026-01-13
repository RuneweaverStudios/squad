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
 * Apply border colors for all projects
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

	// Get all Hyprland clients
	const clients = await getHyprlandClients();
	if (clients.length === 0) {
		return json({
			success: true,
			message: 'No Hyprland windows found',
			windowsUpdated: 0
		});
	}

	const results = [];

	// For each project, find matching windows and apply colors
	for (const project of projects) {
		// Match windows with title starting with project name or display name
		// e.g., "JAT: Claude", "CHIMARO: jat-AgentName"
		const prefixes = [
			project.displayName + ':',
			project.name.toUpperCase() + ':'
		];

		const matchingClients = clients.filter(client =>
			client.title && prefixes.some(prefix => client.title.startsWith(prefix))
		);

		for (const client of matchingClients) {
			try {
				// Set active border color
				if (project.activeColor) {
					await execAsync(
						`hyprctl dispatch setprop "address:${client.address}" activebordercolor "${project.activeColor}"`,
						{ timeout: 2000 }
					);
				}

				// Set inactive border color
				if (project.inactiveColor) {
					await execAsync(
						`hyprctl dispatch setprop "address:${client.address}" inactivebordercolor "${project.inactiveColor}"`,
						{ timeout: 2000 }
					);
				}

				results.push({
					project: project.name,
					address: client.address,
					title: client.title,
					success: true
				});
			} catch (err) {
				results.push({
					project: project.name,
					address: client.address,
					title: client.title,
					success: false,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}
	}

	return json({
		success: true,
		message: `Applied colors to ${results.filter(r => r.success).length} windows`,
		windowsUpdated: results.filter(r => r.success).length,
		projectsWithColors: projects.length,
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
