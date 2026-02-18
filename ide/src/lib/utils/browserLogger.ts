/**
 * Browser Console Logger Utility
 *
 * Provides structured logging for browser console output with:
 * - localStorage-based debug toggles
 * - Formatted group logging
 * - Error reporting service integration hooks
 * - Level-based filtering
 * - Contextual logging with namespaces
 * - Performance timing measurements
 *
 * @module browserLogger
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
	namespace?: string;
	sessionId?: string;
	agentName?: string;
	taskId?: string;
	component?: string;
	[key: string]: unknown;
}

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: LogContext;
	data?: unknown;
	error?: Error;
	stack?: string;
}

export interface ErrorReportingService {
	captureException(error: Error, context?: Record<string, unknown>): void;
	captureMessage(message: string, level: LogLevel, context?: Record<string, unknown>): void;
}

export interface BrowserLoggerConfig {
	enabled: boolean;
	level: LogLevel;
	namespaces: string[];
	enableGroups: boolean;
	enableTimestamps: boolean;
	enableContext: boolean;
	errorReporting?: ErrorReportingService;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LOCAL_STORAGE_KEY = 'squad-browser-logger';
const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4
};

const LOG_COLORS: Record<LogLevel, string> = {
	debug: '#888888',
	info: '#2563eb',
	warn: '#f59e0b',
	error: '#ef4444',
	fatal: '#991b1b'
};

const LOG_EMOJIS: Record<LogLevel, string> = {
	debug: '🔍',
	info: '💡',
	warn: '⚠️',
	error: '❌',
	fatal: '💀'
};

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: BrowserLoggerConfig = {
	enabled: true,
	level: 'info',
	namespaces: ['*'],
	enableGroups: true,
	enableTimestamps: true,
	enableContext: true,
	errorReporting: undefined
};

// =============================================================================
// CONFIGURATION MANAGEMENT
// =============================================================================

/**
 * Load configuration from localStorage
 */
function loadConfig(): BrowserLoggerConfig {
	try {
		const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return { ...DEFAULT_CONFIG, ...parsed };
		}
	} catch (error) {
		console.warn('Failed to load logger config from localStorage:', error);
	}
	return DEFAULT_CONFIG;
}

/**
 * Save configuration to localStorage
 */
function saveConfig(config: BrowserLoggerConfig): void {
	try {
		// Don't persist the error reporting service
		const { errorReporting, ...configToSave } = config;
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(configToSave));
	} catch (error) {
		console.warn('Failed to save logger config to localStorage:', error);
	}
}

/**
 * Check if a namespace is enabled
 */
function isNamespaceEnabled(namespace: string | undefined, enabledNamespaces: string[]): boolean {
	if (!namespace) return true;
	if (enabledNamespaces.includes('*')) return true;

	return enabledNamespaces.some(pattern => {
		if (pattern === namespace) return true;
		if (pattern.endsWith('*')) {
			const prefix = pattern.slice(0, -1);
			return namespace.startsWith(prefix);
		}
		return false;
	});
}

/**
 * Check if a log level is enabled
 */
function isLevelEnabled(level: LogLevel, configLevel: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[configLevel];
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/**
 * Format timestamp for display
 */
function formatTimestamp(): string {
	const now = new Date();
	const time = now.toTimeString().split(' ')[0];
	const ms = now.getMilliseconds().toString().padStart(3, '0');
	return `${time}.${ms}`;
}

/**
 * Format context for display
 */
function formatContext(context?: LogContext): string {
	if (!context) return '';

	const parts: string[] = [];

	if (context.namespace) {
		parts.push(`[${context.namespace}]`);
	}

	if (context.component) {
		parts.push(`<${context.component}>`);
	}

	if (context.agentName) {
		parts.push(`Agent:${context.agentName}`);
	}

	if (context.taskId) {
		parts.push(`Task:${context.taskId}`);
	}

	if (context.sessionId) {
		parts.push(`Session:${context.sessionId.slice(0, 8)}`);
	}

	return parts.join(' ');
}

/**
 * Format log message with level, timestamp, and context
 */
function formatMessage(level: LogLevel, message: string, context?: LogContext, config?: BrowserLoggerConfig): string {
	const parts: string[] = [];

	if (config?.enableTimestamps) {
		parts.push(`[${formatTimestamp()}]`);
	}

	parts.push(LOG_EMOJIS[level]);

	if (config?.enableContext && context) {
		const contextStr = formatContext(context);
		if (contextStr) {
			parts.push(contextStr);
		}
	}

	parts.push(message);

	return parts.join(' ');
}

// =============================================================================
// BROWSER LOGGER CLASS
// =============================================================================

export class BrowserLogger {
	private config: BrowserLoggerConfig;
	private context: LogContext;
	private timers: Map<string, number> = new Map();
	private groups: string[] = [];

	constructor(context: LogContext = {}) {
		this.config = loadConfig();
		this.context = context;
	}

	// -------------------------------------------------------------------------
	// Configuration Methods
	// -------------------------------------------------------------------------

	/**
	 * Enable or disable logging
	 */
	setEnabled(enabled: boolean): void {
		this.config.enabled = enabled;
		saveConfig(this.config);
	}

	/**
	 * Set minimum log level
	 */
	setLevel(level: LogLevel): void {
		this.config.level = level;
		saveConfig(this.config);
	}

	/**
	 * Enable specific namespaces
	 * @example logger.enableNamespaces(['api', 'session:*', 'task'])
	 */
	enableNamespaces(namespaces: string[]): void {
		this.config.namespaces = namespaces;
		saveConfig(this.config);
	}

	/**
	 * Add a namespace to the enabled list
	 */
	addNamespace(namespace: string): void {
		if (!this.config.namespaces.includes(namespace)) {
			this.config.namespaces.push(namespace);
			saveConfig(this.config);
		}
	}

	/**
	 * Remove a namespace from the enabled list
	 */
	removeNamespace(namespace: string): void {
		this.config.namespaces = this.config.namespaces.filter(ns => ns !== namespace);
		saveConfig(this.config);
	}

	/**
	 * Set error reporting service
	 */
	setErrorReporting(service: ErrorReportingService | undefined): void {
		this.config.errorReporting = service;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): BrowserLoggerConfig {
		return { ...this.config };
	}

	// -------------------------------------------------------------------------
	// Context Methods
	// -------------------------------------------------------------------------

	/**
	 * Create a child logger with additional context
	 */
	child(additionalContext: LogContext): BrowserLogger {
		const childLogger = new BrowserLogger({
			...this.context,
			...additionalContext
		});
		childLogger.config = this.config;
		return childLogger;
	}

	/**
	 * Update context
	 */
	setContext(context: LogContext): void {
		this.context = { ...this.context, ...context };
	}

	// -------------------------------------------------------------------------
	// Core Logging Methods
	// -------------------------------------------------------------------------

	private log(level: LogLevel, message: string, data?: unknown): void {
		if (!this.config.enabled) return;
		if (!isLevelEnabled(level, this.config.level)) return;
		if (!isNamespaceEnabled(this.context.namespace, this.config.namespaces)) return;

		const formattedMessage = formatMessage(level, message, this.context, this.config);
		const color = LOG_COLORS[level];

		// Prepare console arguments
		const args: unknown[] = [`%c${formattedMessage}`, `color: ${color}; font-weight: ${level === 'error' || level === 'fatal' ? 'bold' : 'normal'}`];

		if (data !== undefined) {
			args.push(data);
		}

		// Use appropriate console method
		switch (level) {
			case 'debug':
				console.debug(...args);
				break;
			case 'info':
				console.info(...args);
				break;
			case 'warn':
				console.warn(...args);
				break;
			case 'error':
			case 'fatal':
				console.error(...args);
				break;
		}

		// Report to error service if configured
		if (this.config.errorReporting && (level === 'error' || level === 'fatal')) {
			const errorContext = {
				...this.context,
				level,
				timestamp: new Date().toISOString()
			};

			if (data instanceof Error) {
				this.config.errorReporting.captureException(data, errorContext);
			} else {
				this.config.errorReporting.captureMessage(message, level, errorContext);
			}
		}
	}

	debug(message: string, data?: unknown): void {
		this.log('debug', message, data);
	}

	info(message: string, data?: unknown): void {
		this.log('info', message, data);
	}

	warn(message: string, data?: unknown): void {
		this.log('warn', message, data);
	}

	error(message: string, error?: Error | unknown): void {
		this.log('error', message, error);
	}

	fatal(message: string, error?: Error | unknown): void {
		this.log('fatal', message, error);
	}

	// -------------------------------------------------------------------------
	// Group Logging Methods
	// -------------------------------------------------------------------------

	/**
	 * Start a collapsible group
	 */
	group(label: string, collapsed = false): void {
		if (!this.config.enabled || !this.config.enableGroups) return;
		if (!isNamespaceEnabled(this.context.namespace, this.config.namespaces)) return;

		const formattedLabel = formatMessage('info', label, this.context, this.config);

		if (collapsed) {
			console.groupCollapsed(formattedLabel);
		} else {
			console.group(formattedLabel);
		}

		this.groups.push(label);
	}

	/**
	 * Start a collapsed group
	 */
	groupCollapsed(label: string): void {
		this.group(label, true);
	}

	/**
	 * End the current group
	 */
	groupEnd(): void {
		if (!this.config.enabled || !this.config.enableGroups) return;
		if (this.groups.length === 0) return;

		console.groupEnd();
		this.groups.pop();
	}

	// -------------------------------------------------------------------------
	// Timing Methods
	// -------------------------------------------------------------------------

	/**
	 * Start a timer
	 */
	time(label: string): void {
		this.timers.set(label, performance.now());
		this.debug(`Timer started: ${label}`);
	}

	/**
	 * End a timer and log the duration
	 */
	timeEnd(label: string): void {
		const startTime = this.timers.get(label);
		if (startTime === undefined) {
			this.warn(`Timer not found: ${label}`);
			return;
		}

		const duration = performance.now() - startTime;
		this.timers.delete(label);

		this.info(`${label}: ${duration.toFixed(2)}ms`);
	}

	// -------------------------------------------------------------------------
	// Table and Object Logging
	// -------------------------------------------------------------------------

	/**
	 * Log data as a table
	 */
	table(data: unknown[], columns?: string[]): void {
		if (!this.config.enabled) return;
		if (!isNamespaceEnabled(this.context.namespace, this.config.namespaces)) return;

		console.table(data, columns);
	}

	/**
	 * Log an object with expandable properties
	 */
	dir(obj: unknown, options?: { depth?: number; colors?: boolean }): void {
		if (!this.config.enabled) return;
		if (!isNamespaceEnabled(this.context.namespace, this.config.namespaces)) return;

		console.dir(obj, options);
	}

	// -------------------------------------------------------------------------
	// Utility Methods
	// -------------------------------------------------------------------------

	/**
	 * Clear the console
	 */
	clear(): void {
		console.clear();
	}

	/**
	 * Assert a condition and log if false
	 */
	assert(condition: boolean, message: string, data?: unknown): void {
		if (!condition) {
			this.error(`Assertion failed: ${message}`, data);
		}
	}

	/**
	 * Log a stack trace
	 */
	trace(message?: string): void {
		if (!this.config.enabled) return;
		if (!isNamespaceEnabled(this.context.namespace, this.config.namespaces)) return;

		console.trace(message);
	}
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a new logger instance
 */
export function createLogger(context: LogContext = {}): BrowserLogger {
	return new BrowserLogger(context);
}

/**
 * Create a logger for a specific namespace
 */
export function createNamespacedLogger(namespace: string, context: LogContext = {}): BrowserLogger {
	return new BrowserLogger({ ...context, namespace });
}

/**
 * Create a logger for a component
 */
export function createComponentLogger(component: string, context: LogContext = {}): BrowserLogger {
	return new BrowserLogger({ ...context, component });
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

// Default global logger instance
export const logger = createLogger();

// =============================================================================
// DEBUG UTILITIES
// =============================================================================

/**
 * Enable debug mode for all namespaces
 */
export function enableDebugMode(): void {
	const config = loadConfig();
	config.enabled = true;
	config.level = 'debug';
	config.namespaces = ['*'];
	config.enableGroups = true;
	config.enableTimestamps = true;
	config.enableContext = true;
	saveConfig(config);

	console.info('🐛 Debug mode enabled - all logging active');
}

/**
 * Disable all logging
 */
export function disableLogging(): void {
	const config = loadConfig();
	config.enabled = false;
	saveConfig(config);

	console.info('🔇 Logging disabled');
}

/**
 * Reset to default configuration
 */
export function resetLoggerConfig(): void {
	saveConfig(DEFAULT_CONFIG);
	console.info('🔄 Logger config reset to defaults');
}

// =============================================================================
// CONSOLE OVERRIDE (OPTIONAL)
// =============================================================================

/**
 * Override native console methods to use structured logging
 * This is optional and should be called explicitly if desired
 */
export function overrideConsole(): void {
	const originalConsole = {
		log: console.log,
		debug: console.debug,
		info: console.info,
		warn: console.warn,
		error: console.error
	};

	console.log = (...args) => logger.info(args.join(' '));
	console.debug = (...args) => logger.debug(args.join(' '));
	console.info = (...args) => logger.info(args.join(' '));
	console.warn = (...args) => logger.warn(args.join(' '));
	console.error = (...args) => logger.error(args.join(' '));

	// Store originals for restoration
	(window as any).__originalConsole = originalConsole;
}

/**
 * Restore native console methods
 */
export function restoreConsole(): void {
	const originalConsole = (window as any).__originalConsole;
	if (originalConsole) {
		Object.assign(console, originalConsole);
		delete (window as any).__originalConsole;
	}
}

// =============================================================================
// EXPORT ALL
// =============================================================================

export default BrowserLogger;