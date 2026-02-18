/**
 * API endpoint to fetch project colors from ~/.config/squad/projects.json
 * Returns a map of project name -> hex color
 */

import { json } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export async function GET() {
	try {
		const configPath = join(homedir(), '.config/squad/projects.json');

		if (!existsSync(configPath)) {
			return json({ colors: {} });
		}

		const configContent = readFileSync(configPath, 'utf-8');
		const config = JSON.parse(configContent);

		// Extract colors from projects
		/** @type {Record<string, string>} */
		const colors = {};

		if (config.projects) {
			for (const [projectName, projectConfig] of Object.entries(config.projects)) {
				// Support multiple color formats: oklch(), rgb(rrggbb), #rrggbb
				/** @type {any} */
				const pc = projectConfig;
				const activeColor = pc.active_color;
				if (activeColor) {
					// Check for old rgb(rrggbb) format
					const rgbMatch = activeColor.match(/^rgb\(([0-9a-fA-F]{6})\)$/);
					if (rgbMatch) {
						colors[projectName.toLowerCase()] = `#${rgbMatch[1].toLowerCase()}`;
					}
					// Check for hex format
					else if (activeColor.startsWith('#')) {
						colors[projectName.toLowerCase()] = activeColor.toLowerCase();
					}
					// Check for oklch format - pass it through as-is
					else if (activeColor.startsWith('oklch(')) {
						colors[projectName.toLowerCase()] = activeColor;
					}
				}
			}
		}

		return json({ colors });
	} catch (err) {
		console.error('Failed to fetch project colors:', err);
		return json({ colors: {} });
	}
}
