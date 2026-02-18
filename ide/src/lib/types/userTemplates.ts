/**
 * User Template Types
 *
 * Browser-safe types for user templates.
 * These types are used by both browser and server code.
 *
 * The actual file operations live in $lib/utils/userTemplates.server.ts
 * which should only be imported in server-side code (+server.ts files).
 */

import type { CommandTemplate, TemplateCategory, TemplateVariable } from '$lib/config/commandTemplates';

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
 * Template file format stored in ~/.config/squad/templates/
 */
export interface TemplateFile {
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
	/** Category for grouping */
	category?: TemplateCategory;
	/** Creation timestamp */
	createdAt?: string;
	/** Last modified timestamp */
	updatedAt?: string;
}
