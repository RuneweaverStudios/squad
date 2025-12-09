/**
 * Generate Agent Name API
 * GET /api/agents/generate-name - Generate a random agent name
 */

import { json } from '@sveltejs/kit';

// Name components (same as am-lib.sh)
const ADJECTIVES = [
	'Swift', 'Calm', 'Bold', 'Keen', 'Wise', 'Fair', 'Deep', 'True',
	'Warm', 'Cool', 'Soft', 'Hard', 'Fast', 'Slow', 'High', 'Low',
	'Dark', 'Light', 'Bright', 'Pale', 'Rich', 'Pure', 'Free', 'Wild',
	'Clear', 'Sharp', 'Smooth', 'Rough', 'Quiet', 'Loud', 'Strong', 'Weak',
	'Young', 'Old', 'New', 'Fresh', 'Grand', 'Great', 'Fine', 'Good',
	'Blue', 'Green', 'Red', 'Gold', 'Silver', 'White', 'Black', 'Gray',
	'Faint', 'Dim', 'Dull', 'Vivid', 'Muted', 'Stark', 'Dense', 'Thin'
];

const NOUNS = [
	'River', 'Mountain', 'Forest', 'Ocean', 'Prairie', 'Valley', 'Shore', 'Peak',
	'Lake', 'Stream', 'Creek', 'Bay', 'Cove', 'Isle', 'Cape', 'Point',
	'Hill', 'Ridge', 'Cliff', 'Bluff', 'Mesa', 'Dune', 'Glen', 'Dale',
	'Woods', 'Grove', 'Marsh', 'Swamp', 'Meadow', 'Field', 'Plain', 'Heath',
	'Cloud', 'Storm', 'Rain', 'Snow', 'Wind', 'Frost', 'Mist', 'Haze',
	'Dawn', 'Dusk', 'Moon', 'Star', 'Sun', 'Sky', 'Night', 'Day',
	'Stone', 'Rock', 'Sand', 'Clay', 'Ash', 'Dust', 'Ember', 'Flame',
	'Falls', 'Spring', 'Brook', 'Pond', 'Reef', 'Coast', 'Beach', 'Harbor'
];

function generateName() {
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return adj + noun;
}

export async function GET() {
	try {
		const name = generateName();
		return json({ name });
	} catch (error) {
		const err = /** @type {Error} */ (error);
		console.error('Failed to generate name:', err);
		return json({ error: err.message }, { status: 500 });
	}
}
