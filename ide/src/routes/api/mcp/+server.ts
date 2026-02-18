/**
 * MCP Configuration API
 *
 * Endpoints for reading and writing .mcp.json files.
 *
 * GET /api/mcp - Read MCP configuration from specified project
 * PUT /api/mcp - Write MCP configuration to specified project
 *
 * Query Parameters:
 * - project: Project path (optional, defaults to current working directory parent)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { McpConfigFile } from '$lib/types/config';

/**
 * Get the project path from query parameter or default to cwd parent
 */
function getProjectPath(url: URL): string {
	const project = url.searchParams.get('project');
	if (project) {
		// Expand ~ to home directory
		return project.replace(/^~/, process.env.HOME || '');
	}
	// Default to parent of ide (squad project root)
	return process.cwd().replace('/ide', '');
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate MCP configuration structure
 */
function validateMcpConfig(config: unknown): config is McpConfigFile {
	if (!config || typeof config !== 'object') return false;
	const obj = config as Record<string, unknown>;

	if (!obj.mcpServers || typeof obj.mcpServers !== 'object') return false;

	const servers = obj.mcpServers as Record<string, unknown>;
	for (const [name, server] of Object.entries(servers)) {
		if (!name || typeof name !== 'string') return false;
		if (!server || typeof server !== 'object') return false;

		const s = server as Record<string, unknown>;

		// HTTP server must have type: 'http' and url
		if ('type' in s && s.type === 'http') {
			if (typeof s.url !== 'string' || !s.url) return false;
			continue;
		}

		// Stdio server must have command
		if (!('command' in s) || typeof s.command !== 'string' || !s.command) {
			return false;
		}

		// Args must be string array if present
		if ('args' in s && s.args !== undefined) {
			if (!Array.isArray(s.args)) return false;
			if (!s.args.every((arg: unknown) => typeof arg === 'string')) return false;
		}

		// Env must be string record if present
		if ('env' in s && s.env !== undefined) {
			if (typeof s.env !== 'object' || s.env === null) return false;
			for (const v of Object.values(s.env)) {
				if (typeof v !== 'string') return false;
			}
		}
	}

	return true;
}

/**
 * GET /api/mcp - Read MCP configuration
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const projectPath = getProjectPath(url);
		const mcpPath = join(projectPath, '.mcp.json');

		// Check if file exists
		if (!(await fileExists(mcpPath))) {
			return json({
				success: true,
				config: { mcpServers: {} },
				path: mcpPath,
				exists: false
			});
		}

		// Read and parse
		const content = await readFile(mcpPath, 'utf-8');
		const config = JSON.parse(content);

		if (!validateMcpConfig(config)) {
			return json(
				{
					success: false,
					error: 'Invalid MCP configuration format',
					path: mcpPath
				},
				{ status: 400 }
			);
		}

		return json({
			success: true,
			config,
			path: mcpPath,
			exists: true
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{
				success: false,
				error: `Failed to read MCP configuration: ${message}`
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/mcp - Write MCP configuration
 */
export const PUT: RequestHandler = async ({ url, request }) => {
	try {
		const projectPath = getProjectPath(url);
		const mcpPath = join(projectPath, '.mcp.json');

		const body = await request.json();

		if (!validateMcpConfig(body)) {
			return json(
				{
					success: false,
					error: 'Invalid MCP configuration format'
				},
				{ status: 400 }
			);
		}

		// Write with pretty formatting
		await writeFile(mcpPath, JSON.stringify(body, null, 2) + '\n', 'utf-8');

		return json({
			success: true,
			path: mcpPath,
			message: 'MCP configuration saved'
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{
				success: false,
				error: `Failed to save MCP configuration: ${message}`
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/mcp - Delete an MCP server from configuration
 *
 * Query Parameters:
 * - project: Project path
 * - server: Server name to delete
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const projectPath = getProjectPath(url);
		const mcpPath = join(projectPath, '.mcp.json');
		const serverName = url.searchParams.get('server');

		if (!serverName) {
			return json(
				{
					success: false,
					error: 'Server name is required'
				},
				{ status: 400 }
			);
		}

		// Check if file exists
		if (!(await fileExists(mcpPath))) {
			return json(
				{
					success: false,
					error: 'MCP configuration file does not exist'
				},
				{ status: 404 }
			);
		}

		// Read current config
		const content = await readFile(mcpPath, 'utf-8');
		const config = JSON.parse(content) as McpConfigFile;

		if (!config.mcpServers[serverName]) {
			return json(
				{
					success: false,
					error: `Server "${serverName}" not found`
				},
				{ status: 404 }
			);
		}

		// Delete server
		delete config.mcpServers[serverName];

		// Write back
		await writeFile(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

		return json({
			success: true,
			path: mcpPath,
			message: `Server "${serverName}" deleted`
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{
				success: false,
				error: `Failed to delete server: ${message}`
			},
			{ status: 500 }
		);
	}
};
