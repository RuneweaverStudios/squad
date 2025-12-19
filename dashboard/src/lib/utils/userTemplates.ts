/**
 * User Templates Utility
 *
 * Manages custom user templates stored in ~/.config/jat/templates/
 * Provides CRUD operations for user-defined command templates.
 *
 * User templates complement the built-in templates in commandTemplates.ts,
 * allowing users to save their own patterns for reuse.
 *
 * @example
 * import { getAllUserTemplates, saveUserTemplate, deleteUserTemplate } from '$lib/utils/userTemplates';
 *
 * // Get all user templates
 * const templates = await getAllUserTemplates();
 *
 * // Save a new template
 * await saveUserTemplate({
 *   id: 'my-workflow',
 *   name: 'My Workflow',
 *   description: 'Custom workflow template',
 *   icon: '⚙️',
 *   content: '# My Workflow...',
 *   useCase: 'Personal automation tasks'
 * });
 *
 * // Delete a template
 * await deleteUserTemplate('my-workflow');
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { homedir } from 'os';
import { join, basename } from 'path';
import type { CommandTemplate, TemplateVariable } from '$lib/config/commandTemplates';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Directory where user templates are stored
 */
export const USER_TEMPLATES_DIR = join(homedir(), '.config', 'jat', 'templates');

/**
 * File extension for template files
 */
const TEMPLATE_EXTENSION = '.json';

// =============================================================================
// TYPES
// =============================================================================

/**
 * User template stored on disk
 * Extends CommandTemplate with metadata about when it was created/modified
 */
export interface UserTemplate extends CommandTemplate {
	/** ISO timestamp of when template was created */
	createdAt?: string;
	/** ISO timestamp of last modification */
	updatedAt?: string;
	/** Whether this is a user template (always true for these) */
	isUserTemplate: true;
}

/**
 * Template file format stored in ~/.config/jat/templates/
 */
interface TemplateFile {
	/** Template ID (filename without extension) */
	id: string;
	/** Display name */
	name: string;
	/** Brief description */
	description: string;
	/** Emoji icon */
	icon: string;
	/** Template content with {{variable}} placeholders */
	content: string;
	/** Default frontmatter values */
	frontmatter?: {
		description?: string;
		author?: string;
		version?: string;
		tags?: string;
	};
	/** When to use this template */
	useCase: string;
	/** Template variables */
	variables?: TemplateVariable[];
	/** Creation timestamp */
	createdAt?: string;
	/** Last modified timestamp */
	updatedAt?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Regex for valid template IDs
 * Must be alphanumeric with hyphens, starting with letter/number
 */
const ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Validate template ID format
 */
export function isValidTemplateId(id: string): boolean {
	return ID_REGEX.test(id) && id.length >= 2 && id.length <= 64;
}

/**
 * Validate template data has required fields
 */
export function validateTemplate(
	template: Partial<UserTemplate>
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!template.id || typeof template.id !== 'string') {
		errors.push('Template ID is required');
	} else if (!isValidTemplateId(template.id)) {
		errors.push(
			'Template ID must be 2-64 characters, alphanumeric with hyphens/underscores, starting with letter/number'
		);
	}

	if (!template.name || typeof template.name !== 'string' || template.name.trim().length === 0) {
		errors.push('Template name is required');
	}

	if (
		!template.content ||
		typeof template.content !== 'string' ||
		template.content.trim().length === 0
	) {
		errors.push('Template content is required');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

// =============================================================================
// FILE OPERATIONS
// =============================================================================

/**
 * Ensure templates directory exists
 */
async function ensureTemplatesDir(): Promise<void> {
	await mkdir(USER_TEMPLATES_DIR, { recursive: true });
}

/**
 * Get path to a template file
 */
function getTemplatePath(id: string): string {
	return join(USER_TEMPLATES_DIR, `${id}${TEMPLATE_EXTENSION}`);
}

/**
 * Parse a template file from disk
 */
function parseTemplateFile(content: string, id: string): UserTemplate | null {
	try {
		const data = JSON.parse(content) as TemplateFile;

		return {
			id: data.id || id,
			name: data.name || id,
			description: data.description || '',
			icon: data.icon || '📄',
			content: data.content || '',
			frontmatter: data.frontmatter || {},
			useCase: data.useCase || '',
			variables: data.variables,
			createdAt: data.createdAt,
			updatedAt: data.updatedAt,
			isUserTemplate: true
		};
	} catch (error) {
		console.error(`[userTemplates] Failed to parse template ${id}:`, error);
		return null;
	}
}

/**
 * Serialize a template for disk storage
 */
function serializeTemplate(template: UserTemplate): string {
	const data: TemplateFile = {
		id: template.id,
		name: template.name,
		description: template.description,
		icon: template.icon,
		content: template.content,
		frontmatter: template.frontmatter,
		useCase: template.useCase,
		variables: template.variables,
		createdAt: template.createdAt,
		updatedAt: template.updatedAt
	};

	return JSON.stringify(data, null, 2);
}

// =============================================================================
// PUBLIC API - READ OPERATIONS
// =============================================================================

/**
 * Check if templates directory exists
 */
export function templatesDirectoryExists(): boolean {
	return existsSync(USER_TEMPLATES_DIR);
}

/**
 * Get all user template IDs
 */
export function getUserTemplateIds(): string[] {
	if (!templatesDirectoryExists()) {
		return [];
	}

	try {
		const entries = readdirSync(USER_TEMPLATES_DIR, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(TEMPLATE_EXTENSION))
			.map((entry) => basename(entry.name, TEMPLATE_EXTENSION));
	} catch (error) {
		console.error('[userTemplates] Failed to list templates:', error);
		return [];
	}
}

/**
 * Get a single user template by ID (synchronous)
 */
export function getUserTemplateSync(id: string): UserTemplate | null {
	const path = getTemplatePath(id);

	if (!existsSync(path)) {
		return null;
	}

	try {
		const content = readFileSync(path, 'utf-8');
		return parseTemplateFile(content, id);
	} catch (error) {
		console.error(`[userTemplates] Failed to read template ${id}:`, error);
		return null;
	}
}

/**
 * Get a single user template by ID (async)
 */
export async function getUserTemplate(id: string): Promise<UserTemplate | null> {
	const path = getTemplatePath(id);

	try {
		const content = await readFile(path, 'utf-8');
		return parseTemplateFile(content, id);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		console.error(`[userTemplates] Failed to read template ${id}:`, error);
		return null;
	}
}

/**
 * Get all user templates (synchronous)
 */
export function getAllUserTemplatesSync(): UserTemplate[] {
	const ids = getUserTemplateIds();
	const templates: UserTemplate[] = [];

	for (const id of ids) {
		const template = getUserTemplateSync(id);
		if (template) {
			templates.push(template);
		}
	}

	// Sort by name
	templates.sort((a, b) => a.name.localeCompare(b.name));

	return templates;
}

/**
 * Get all user templates (async)
 */
export async function getAllUserTemplates(): Promise<UserTemplate[]> {
	const ids = getUserTemplateIds();
	const templates: UserTemplate[] = [];

	for (const id of ids) {
		const template = await getUserTemplate(id);
		if (template) {
			templates.push(template);
		}
	}

	// Sort by name
	templates.sort((a, b) => a.name.localeCompare(b.name));

	return templates;
}

/**
 * Check if a user template exists
 */
export function userTemplateExists(id: string): boolean {
	return existsSync(getTemplatePath(id));
}

// =============================================================================
// PUBLIC API - WRITE OPERATIONS
// =============================================================================

/**
 * Save a user template to disk
 *
 * @param template - Template to save (must have id, name, content at minimum)
 * @param options - Save options
 * @returns Created/updated template with timestamps
 *
 * @example
 * const saved = await saveUserTemplate({
 *   id: 'my-api-template',
 *   name: 'My API Template',
 *   description: 'REST API integration template',
 *   icon: '🔌',
 *   content: '# API Integration\n\n...',
 *   useCase: 'Building API integrations'
 * });
 */
export async function saveUserTemplate(
	template: Omit<UserTemplate, 'isUserTemplate'> & { id: string },
	options: { overwrite?: boolean } = {}
): Promise<UserTemplate> {
	// Validate template
	const validation = validateTemplate(template);
	if (!validation.valid) {
		throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
	}

	// Check if exists when not overwriting
	const exists = userTemplateExists(template.id);
	if (exists && !options.overwrite) {
		throw new Error(`Template '${template.id}' already exists. Use overwrite option to update.`);
	}

	// Ensure directory exists
	await ensureTemplatesDir();

	// Prepare template with timestamps
	const now = new Date().toISOString();
	const savedTemplate: UserTemplate = {
		id: template.id,
		name: template.name,
		description: template.description || '',
		icon: template.icon || '📄',
		content: template.content,
		frontmatter: template.frontmatter || {},
		useCase: template.useCase || '',
		variables: template.variables,
		createdAt: exists ? template.createdAt || now : now,
		updatedAt: now,
		isUserTemplate: true
	};

	// Write to disk
	const path = getTemplatePath(template.id);
	await writeFile(path, serializeTemplate(savedTemplate), 'utf-8');

	return savedTemplate;
}

/**
 * Update an existing user template
 *
 * @param id - Template ID to update
 * @param updates - Partial template with fields to update
 * @returns Updated template
 */
export async function updateUserTemplate(
	id: string,
	updates: Partial<Omit<UserTemplate, 'id' | 'isUserTemplate' | 'createdAt'>>
): Promise<UserTemplate> {
	// Get existing template
	const existing = await getUserTemplate(id);
	if (!existing) {
		throw new Error(`Template '${id}' not found`);
	}

	// Merge updates
	const merged: UserTemplate = {
		...existing,
		...updates,
		id: existing.id, // Prevent ID changes
		isUserTemplate: true,
		createdAt: existing.createdAt
	};

	// Save with overwrite
	return saveUserTemplate(merged, { overwrite: true });
}

/**
 * Delete a user template
 *
 * @param id - Template ID to delete
 * @returns true if deleted, false if not found
 */
export async function deleteUserTemplate(id: string): Promise<boolean> {
	const path = getTemplatePath(id);

	try {
		await unlink(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

/**
 * Rename a user template (change its ID)
 *
 * @param oldId - Current template ID
 * @param newId - New template ID
 * @returns Updated template with new ID
 */
export async function renameUserTemplate(oldId: string, newId: string): Promise<UserTemplate> {
	// Validate new ID
	if (!isValidTemplateId(newId)) {
		throw new Error(
			'Invalid new template ID. Must be 2-64 characters, alphanumeric with hyphens/underscores.'
		);
	}

	// Check if new ID already exists
	if (userTemplateExists(newId)) {
		throw new Error(`Template '${newId}' already exists`);
	}

	// Get existing template
	const existing = await getUserTemplate(oldId);
	if (!existing) {
		throw new Error(`Template '${oldId}' not found`);
	}

	// Save with new ID
	const renamed = await saveUserTemplate({
		...existing,
		id: newId
	});

	// Delete old template
	await deleteUserTemplate(oldId);

	return renamed;
}

// =============================================================================
// PUBLIC API - UTILITY FUNCTIONS
// =============================================================================

/**
 * Duplicate a user template with a new ID
 *
 * @param sourceId - Template ID to duplicate
 * @param newId - ID for the duplicate
 * @param newName - Optional new name (defaults to "Copy of [original]")
 * @returns The duplicated template
 */
export async function duplicateUserTemplate(
	sourceId: string,
	newId: string,
	newName?: string
): Promise<UserTemplate> {
	// Validate new ID
	if (!isValidTemplateId(newId)) {
		throw new Error(
			'Invalid new template ID. Must be 2-64 characters, alphanumeric with hyphens/underscores.'
		);
	}

	// Check if new ID already exists
	if (userTemplateExists(newId)) {
		throw new Error(`Template '${newId}' already exists`);
	}

	// Get source template
	const source = await getUserTemplate(sourceId);
	if (!source) {
		throw new Error(`Template '${sourceId}' not found`);
	}

	// Create duplicate
	return saveUserTemplate({
		...source,
		id: newId,
		name: newName || `Copy of ${source.name}`,
		createdAt: undefined // Will be set by saveUserTemplate
	});
}

/**
 * Export a user template to a standalone JSON string
 * Useful for sharing or backup
 */
export function exportUserTemplate(template: UserTemplate): string {
	return serializeTemplate(template);
}

/**
 * Import a template from JSON string
 *
 * @param json - JSON string from exportUserTemplate
 * @param options - Import options
 * @returns The imported template
 */
export async function importUserTemplate(
	json: string,
	options: { overwrite?: boolean; newId?: string } = {}
): Promise<UserTemplate> {
	let data: TemplateFile;
	try {
		data = JSON.parse(json);
	} catch {
		throw new Error('Invalid JSON format');
	}

	const id = options.newId || data.id;
	if (!id) {
		throw new Error('Template must have an ID');
	}

	return saveUserTemplate(
		{
			...data,
			id,
			frontmatter: data.frontmatter || {}
		},
		{ overwrite: options.overwrite }
	);
}

/**
 * Get templates directory path
 */
export function getTemplatesDirectory(): string {
	return USER_TEMPLATES_DIR;
}
