/**
 * TypeScript declaration file for the SQUAD Ingest BaseAdapter.
 *
 * Plugin authors: import these types directly in your TypeScript adapter projects.
 *
 * Usage:
 *   import type { BaseAdapter, PluginMetadata, IngestItem } from './base';
 *
 * Or reference via triple-slash directive:
 *   /// <reference path="path/to/base.d.ts" />
 */

// ─── Config Field Types ──────────────────────────────────────────────────────

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'secret' | 'select' | 'multiselect';

export interface ConfigField {
	key: string;
	label: string;
	type: ConfigFieldType;
	required?: boolean;
	default?: unknown;
	options?: Array<{ value: string; label: string }>;
	placeholder?: string;
	helpText?: string;
}

// ─── Item Field Types ────────────────────────────────────────────────────────

export type ItemFieldType = 'string' | 'enum' | 'number' | 'boolean';

export interface ItemField {
	key: string;
	label: string;
	type: ItemFieldType;
	values?: string[];
}

// ─── Filter Types ────────────────────────────────────────────────────────────

export type FilterOperator =
	| 'equals'
	| 'not_equals'
	| 'contains'
	| 'starts_with'
	| 'ends_with'
	| 'regex'
	| 'gt'
	| 'gte'
	| 'lt'
	| 'lte'
	| 'in'
	| 'not_in';

export interface FilterCondition {
	field: string;
	operator: FilterOperator;
	value: unknown;
}

// ─── Plugin Metadata ─────────────────────────────────────────────────────────

export interface PluginCapabilities {
	realtime?: boolean;
	send?: boolean;
	threads?: boolean;
}

export interface PluginMetadata {
	type: string;
	name: string;
	description: string;
	version: string;
	author?: string;
	configFields: ConfigField[];
	itemFields: ItemField[];
	defaultFilter?: FilterCondition[];
	capabilities?: PluginCapabilities;
}

// ─── Item Types ──────────────────────────────────────────────────────────────

export interface Attachment {
	url: string;
	type?: string;
	filename?: string;
	localPath?: string;
}

export interface IngestItem {
	id: string;
	title: string;
	description: string;
	hash: string;
	author?: string;
	timestamp: string;
	attachments?: Attachment[];
	fields?: Record<string, string | number | boolean>;
	replyTo?: string;
}

// ─── Adapter Result Types ────────────────────────────────────────────────────

export interface PollResult {
	items: IngestItem[];
	state: Record<string, unknown>;
}

export interface ValidateResult {
	valid: boolean;
	error?: string;
}

export interface TestResult {
	ok: boolean;
	message: string;
	sampleItems?: IngestItem[];
}

// ─── Realtime Types ──────────────────────────────────────────────────────────

export interface RealtimeCallbacks {
	onMessage: (item: IngestItem) => void;
	onError: (err: Error) => void;
	onDisconnect: (reason: string) => void;
}

export interface SendTarget {
	channelId?: string;
	threadId?: string;
	userId?: string;
}

export interface OutboundMessage {
	text: string;
	attachments?: Attachment[];
	metadata?: Record<string, unknown>;
}

// ─── Base Adapter Class ──────────────────────────────────────────────────────

export class BaseAdapter {
	readonly type: string;

	constructor(type: string);

	/** Poll for new items from the source. */
	poll(
		sourceConfig: Record<string, unknown>,
		adapterState: Record<string, unknown>,
		getSecret: (name: string) => string
	): Promise<PollResult>;

	/** Validate source configuration without making network calls. */
	validate(sourceConfig: Record<string, unknown>): ValidateResult;

	/** Test the connection by making a real request and returning sample items. */
	test(
		sourceConfig: Record<string, unknown>,
		getSecret: (name: string) => string
	): Promise<TestResult>;

	/** Poll for replies to tracked threads. */
	pollReplies(
		source: Record<string, unknown>,
		threads: unknown[],
		getSecret: (name: string) => string
	): Promise<unknown[]>;

	/** Whether this adapter supports persistent realtime connections. */
	get supportsRealtime(): boolean;

	/** Whether this adapter can send outbound messages. */
	get supportsSend(): boolean;

	/** Establish a persistent realtime connection. */
	connect(
		sourceConfig: Record<string, unknown>,
		getSecret: (name: string) => string,
		callbacks: RealtimeCallbacks
	): Promise<void>;

	/** Tear down the realtime connection. */
	disconnect(): Promise<void>;

	/** Send an outbound message through this adapter. */
	send(
		target: SendTarget,
		message: OutboundMessage,
		getSecret: (name: string) => string
	): Promise<{ messageId?: string } | void>;
}

/** Create an attachment object for items. */
export function makeAttachment(url: string, type?: string, filename?: string): Attachment;
