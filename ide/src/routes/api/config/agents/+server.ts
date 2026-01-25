/**
 * Agent Programs API Endpoint
 *
 * Manages agent program configurations.
 *
 * Endpoints:
 * - GET: List all agent programs with status
 * - POST: Add a new agent program
 *
 * Storage: ~/.config/jat/agents.json
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllAgentPrograms,
	addAgentProgram,
	getAllAgentStatuses,
	getAgentConfig,
	validateAgentProgram
} from '$lib/utils/agentConfig';
import { AGENT_PRESETS } from '$lib/types/agentProgram';

/**
 * GET /api/config/agents
 *
 * List all configured agent programs with their status.
 *
 * Query params:
 * - status=true: Include availability status for each agent
 * - presets=true: Include available presets in response
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const includeStatus = url.searchParams.get('status') === 'true';
		const includePresets = url.searchParams.get('presets') === 'true';

		const programs = getAllAgentPrograms();
		const config = getAgentConfig();

		// Build response
		const response: Record<string, unknown> = {
			success: true,
			programs,
			defaults: config.defaults,
			routingRulesCount: config.routingRules.length
		};

		// Include status if requested
		if (includeStatus) {
			response.statuses = getAllAgentStatuses();
		}

		// Include presets if requested
		if (includePresets) {
			response.presets = AGENT_PRESETS;
		}

		return json(response);
	} catch (error) {
		console.error('Error fetching agent programs:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch agent programs'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/config/agents
 *
 * Add a new agent program.
 *
 * Body: AgentProgram (without createdAt/updatedAt)
 *
 * Optional query params:
 * - preset=<preset-id>: Initialize from a preset (body provides overrides)
 */
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const body = await request.json();
		const presetId = url.searchParams.get('preset');

		let programData = body;

		// If preset specified, merge with preset defaults
		if (presetId) {
			const preset = AGENT_PRESETS.find((p) => p.id === presetId);
			if (!preset) {
				return json(
					{ success: false, error: `Preset '${presetId}' not found` },
					{ status: 400 }
				);
			}

			programData = {
				...preset.config,
				enabled: true,
				isDefault: false,
				...body // Body overrides preset
			};
		}

		// Validate the program
		const validation = validateAgentProgram(programData);
		if (!validation.valid) {
			return json(
				{
					success: false,
					error: 'Validation failed',
					validationErrors: validation.errors
				},
				{ status: 400 }
			);
		}

		// Ensure required fields have defaults
		const program = {
			id: programData.id,
			name: programData.name,
			command: programData.command,
			models: programData.models,
			defaultModel: programData.defaultModel,
			flags: programData.flags ?? [],
			authType: programData.authType,
			apiKeyProvider: programData.apiKeyProvider,
			apiKeyEnvVar: programData.apiKeyEnvVar,
			enabled: programData.enabled ?? true,
			isDefault: programData.isDefault ?? false,
			instructionsFile: programData.instructionsFile,
			startupPattern: programData.startupPattern,
			taskInjection: programData.taskInjection,
			order: programData.order
		};

		const created = addAgentProgram(program);

		return json({
			success: true,
			program: created
		});
	} catch (error) {
		console.error('Error adding agent program:', error);

		const errorMessage = error instanceof Error ? error.message : 'Failed to add agent program';

		// Check for duplicate ID error
		if (errorMessage.includes('already exists')) {
			return json({ success: false, error: errorMessage }, { status: 409 });
		}

		return json({ success: false, error: errorMessage }, { status: 500 });
	}
};
