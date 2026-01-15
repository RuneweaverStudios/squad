/**
 * Generate Agent Name API
 * GET /api/agents/generate-name - Generate a random unique agent name
 *
 * Names are nature/geography themed (e.g., "SwiftRiver", "CalmMountain")
 * Collision checking ensures names are unique across all registered agents
 */

import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';

// Name components - nature/geography themed words
// 72 adjectives × 72 nouns = 5,184 unique combinations
const ADJECTIVES = [
	// Temperature/Texture (16)
	'Swift', 'Calm', 'Warm', 'Cool', 'Soft', 'Hard', 'Smooth', 'Rough',
	'Sharp', 'Dense', 'Thin', 'Thick', 'Crisp', 'Mild', 'Brisk', 'Gentle',
	// Light/Color (16)
	'Bright', 'Dark', 'Light', 'Pale', 'Vivid', 'Muted', 'Stark', 'Dim',
	'Gold', 'Silver', 'Azure', 'Amber', 'Russet', 'Ivory', 'Jade', 'Coral',
	// Size/Scale (16)
	'Grand', 'Great', 'Vast', 'Wide', 'Broad', 'Deep', 'High', 'Tall',
	'Long', 'Far', 'Near', 'Open', 'Steep', 'Sheer', 'Flat', 'Round',
	// Quality/Character (16)
	'Bold', 'Keen', 'Wise', 'Fair', 'True', 'Pure', 'Free', 'Wild',
	'Clear', 'Fresh', 'Fine', 'Good', 'Rich', 'Full', 'Whole', 'Prime',
	// Weather/Time (8)
	'Sunny', 'Misty', 'Windy', 'Rainy', 'Early', 'Late', 'First', 'Last'
];

const NOUNS = [
	// Water Bodies (16)
	'River', 'Ocean', 'Lake', 'Stream', 'Creek', 'Brook', 'Pond', 'Falls',
	'Bay', 'Cove', 'Gulf', 'Inlet', 'Fjord', 'Strait', 'Marsh', 'Spring',
	// Land Features (16)
	'Mountain', 'Valley', 'Canyon', 'Gorge', 'Ravine', 'Basin', 'Plateau', 'Mesa',
	'Hill', 'Ridge', 'Cliff', 'Bluff', 'Ledge', 'Shelf', 'Slope', 'Terrace',
	// Vegetation (16)
	'Forest', 'Woods', 'Grove', 'Glade', 'Thicket', 'Copse', 'Orchard', 'Garden',
	'Prairie', 'Meadow', 'Field', 'Plain', 'Heath', 'Moor', 'Steppe', 'Savanna',
	// Coastal (8)
	'Shore', 'Coast', 'Beach', 'Dune', 'Cape', 'Point', 'Isle', 'Reef',
	// Atmospheric (8)
	'Cloud', 'Storm', 'Wind', 'Mist', 'Frost', 'Dawn', 'Dusk', 'Horizon',
	// Geological (8)
	'Stone', 'Rock', 'Boulder', 'Pebble', 'Sand', 'Clay', 'Slate', 'Granite'
];

/**
 * Get list of ALL existing agent names from Agent Mail database (global, not project-specific)
 * @returns {Set<string>} Set of existing agent names (lowercase for case-insensitive comparison)
 */
function getExistingAgentNames() {
	try {
		// Query ALL agents globally from the database (not project-filtered like am-agents)
		const dbPath = `${process.env.HOME}/.agent-mail.db`;
		const output = execSync(
			`sqlite3 "${dbPath}" "SELECT name FROM agents;" 2>/dev/null`,
			{
				encoding: 'utf-8',
				timeout: 5000
			}
		);
		// Parse newline-separated names into a Set (lowercase for case-insensitive comparison)
		const names = output.trim().split('\n').filter(Boolean);
		return new Set(names.map(name => name.toLowerCase()));
	} catch {
		// If database query fails, return empty set (no collision checking)
		return new Set();
	}
}

/**
 * Generate a unique agent name
 * @param {Set<string>} existingNames - Set of existing agent names (lowercase)
 * @param {number} maxAttempts - Maximum generation attempts before giving up
 * @returns {string} A unique agent name
 */
function generateUniqueName(existingNames, maxAttempts = 100) {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
		const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
		const name = adj + noun;

		// Check for collision (case-insensitive)
		if (!existingNames.has(name.toLowerCase())) {
			return name;
		}
	}

	// Fallback: append random suffix if all attempts collided
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	const suffix = Math.floor(Math.random() * 1000);
	return `${adj}${noun}${suffix}`;
}

export async function GET() {
	try {
		const existingNames = getExistingAgentNames();
		const name = generateUniqueName(existingNames);
		return json({
			name,
			totalCombinations: ADJECTIVES.length * NOUNS.length,
			existingAgents: existingNames.size
		});
	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Failed to generate name:', err);
		return json({ error: err.message }, { status: 500 });
	}
}
