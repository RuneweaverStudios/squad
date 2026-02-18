/**
 * Skills API
 * GET /api/config/skills - List installed skills
 * GET /api/config/skills?catalog=true - List catalog skills
 * GET /api/config/skills?search=query - Search catalog
 * POST /api/config/skills - Install a skill
 * PUT /api/config/skills - Enable/disable a skill
 * DELETE /api/config/skills?name=X - Uninstall a skill
 */

import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

/** Strip ANSI escape codes from CLI output */
function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '');
}

function runSkillsCmd(args: string): { stdout: string; success: boolean; error?: string } {
	try {
		const stdout = execSync(`squad-skills ${args} --json`, {
			encoding: 'utf-8',
			timeout: 30000,
			env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` }
		}).trim();
		return { stdout, success: true };
	} catch (err: any) {
		const stderr = stripAnsi(err.stderr?.toString().trim() || '');
		const stdout = stripAnsi(err.stdout?.toString().trim() || '');
		return { stdout: stdout || '[]', success: false, error: stderr || err.message };
	}
}

function parseJson(str: string): any {
	try {
		return JSON.parse(str);
	} catch {
		return null;
	}
}

const SKILLS_DIR = join(process.env.HOME || '', '.config/squad/skills');

export const GET: RequestHandler = async ({ url }) => {
	try {
		const catalog = url.searchParams.get('catalog');
		const search = url.searchParams.get('search');
		const info = url.searchParams.get('info');
		const content = url.searchParams.get('content');

		// Read SKILL.md content for an installed skill
		if (content) {
			const skillPath = join(SKILLS_DIR, content, 'SKILL.md');
			if (existsSync(skillPath)) {
				const md = readFileSync(skillPath, 'utf-8');
				return json({ success: true, content: md, path: skillPath });
			}
			return json({ error: 'SKILL.md not found' }, { status: 404 });
		}

		if (info) {
			const result = runSkillsCmd(`info "${info}"`);
			const data = parseJson(result.stdout);
			if (!data || !result.success) {
				return json({ error: result.error || 'Skill not found' }, { status: 404 });
			}
			return json({ success: true, skill: data });
		}

		if (search) {
			const result = runSkillsCmd(`search "${search}"`);
			const data = parseJson(result.stdout) || [];
			return json({ success: true, catalog: data });
		}

		if (catalog === 'true') {
			const result = runSkillsCmd('list-available');
			const data = parseJson(result.stdout) || [];
			return json({ success: true, catalog: data });
		}

		// Default: list installed skills
		const result = runSkillsCmd('list');
		const data = parseJson(result.stdout) || [];
		return json({ success: true, installed: data });
	} catch (error) {
		console.error('[config/skills] GET error:', error);
		return json(
			{ error: 'Failed to fetch skills', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name } = body;

		if (!name || typeof name !== 'string') {
			return json({ error: 'Missing required field: name' }, { status: 400 });
		}

		const result = runSkillsCmd(`install "${name}"`);
		if (!result.success) {
			return json({ error: result.error || 'Failed to install skill' }, { status: 500 });
		}

		return json({ success: true, message: `Installed skill: ${name}` });
	} catch (error) {
		console.error('[config/skills] POST error:', error);
		return json(
			{ error: 'Failed to install skill', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name, action } = body;

		if (!name || typeof name !== 'string') {
			return json({ error: 'Missing required field: name' }, { status: 400 });
		}

		if (action !== 'enable' && action !== 'disable' && action !== 'update') {
			return json({ error: 'Action must be enable, disable, or update' }, { status: 400 });
		}

		const result = runSkillsCmd(`${action} "${name}"`);
		if (!result.success) {
			return json({ error: result.error || `Failed to ${action} skill` }, { status: 500 });
		}

		return json({ success: true, message: `Skill ${name} ${action}d` });
	} catch (error) {
		console.error('[config/skills] PUT error:', error);
		return json(
			{ error: 'Failed to update skill', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name, content } = body;

		if (!name || typeof name !== 'string') {
			return json({ error: 'Missing required field: name' }, { status: 400 });
		}
		if (typeof content !== 'string') {
			return json({ error: 'Missing required field: content' }, { status: 400 });
		}

		const skillPath = join(SKILLS_DIR, name, 'SKILL.md');
		if (!existsSync(skillPath)) {
			return json({ error: 'SKILL.md not found — is the skill installed?' }, { status: 404 });
		}

		writeFileSync(skillPath, content, 'utf-8');
		return json({ success: true, message: `Updated SKILL.md for ${name}`, path: skillPath });
	} catch (error) {
		console.error('[config/skills] PATCH error:', error);
		return json(
			{ error: 'Failed to save SKILL.md', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const name = url.searchParams.get('name');

		if (!name) {
			return json({ error: 'Missing required parameter: name' }, { status: 400 });
		}

		const result = runSkillsCmd(`uninstall "${name}"`);
		if (!result.success) {
			return json({ error: result.error || 'Failed to uninstall skill' }, { status: 500 });
		}

		return json({ success: true, message: `Uninstalled skill: ${name}` });
	} catch (error) {
		console.error('[config/skills] DELETE error:', error);
		return json(
			{ error: 'Failed to uninstall skill', message: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};
