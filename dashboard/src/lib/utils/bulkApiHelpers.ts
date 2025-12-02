/**
 * Bulk API Operation Helpers
 *
 * Shared utilities for performing bulk API operations with consistent
 * error handling, loading state management, and progress tracking.
 *
 * Extracted from TaskTable.svelte to reduce code duplication.
 */

/**
 * Result of a bulk API operation
 */
export interface BulkOperationResult {
	success: boolean;
	successCount: number;
	failCount: number;
	errors: string[];
}

/**
 * Options for bulk API operations
 */
export interface BulkOperationOptions {
	/** Timeout per request in milliseconds (default: 30000) */
	timeout?: number;
	/** Whether to continue on error (default: true) */
	continueOnError?: boolean;
	/** Callback for progress updates */
	onProgress?: (completed: number, total: number) => void;
}

/**
 * Performs a fetch with timeout
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns Promise resolving to the Response
 * @throws Error if request times out or fails
 */
export async function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeoutMs: number = 60000
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal
		});
		return response;
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(`Request timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Handles API error responses and extracts meaningful error messages
 *
 * @param response - The Response object
 * @param context - Context for error message (e.g., "delete task abc")
 * @returns Error message string
 */
export async function handleApiError(response: Response, context: string): Promise<string> {
	let errorMessage = `Failed to ${context}`;

	try {
		const data = await response.json();
		if (data.error) {
			errorMessage = data.error;
		} else if (data.message) {
			errorMessage = data.message;
		}
	} catch {
		// Response wasn't JSON, use status text
		if (response.statusText) {
			errorMessage += `: ${response.statusText}`;
		}
	}

	return errorMessage;
}

/**
 * Performs a bulk API operation on multiple items
 *
 * This is the core helper that encapsulates the common pattern:
 * 1. Iterate through items
 * 2. Make API request for each
 * 3. Handle errors gracefully
 * 4. Track progress
 * 5. Return aggregate result
 *
 * @param items - Array of item IDs to operate on
 * @param operation - Async function that performs the operation on a single item
 * @param options - Configuration options
 * @returns Promise resolving to BulkOperationResult
 *
 * @example
 * ```typescript
 * const result = await bulkApiOperation(
 *   selectedTaskIds,
 *   async (taskId) => {
 *     const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
 *     if (!response.ok) {
 *       throw new Error(await handleApiError(response, `delete task ${taskId}`));
 *     }
 *   },
 *   { onProgress: (done, total) => console.log(`${done}/${total}`) }
 * );
 * ```
 */
export async function bulkApiOperation<T>(
	items: T[],
	operation: (item: T) => Promise<void>,
	options: BulkOperationOptions = {}
): Promise<BulkOperationResult> {
	const { continueOnError = true, onProgress } = options;

	const result: BulkOperationResult = {
		success: true,
		successCount: 0,
		failCount: 0,
		errors: []
	};

	const total = items.length;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];

		try {
			await operation(item);
			result.successCount++;
		} catch (err) {
			result.failCount++;
			const errorMessage = err instanceof Error ? err.message : String(err);
			result.errors.push(errorMessage);

			if (!continueOnError) {
				result.success = false;
				break;
			}
		}

		if (onProgress) {
			onProgress(i + 1, total);
		}
	}

	result.success = result.failCount === 0;

	return result;
}

/**
 * Creates a standard PUT request body with JSON content type
 *
 * @param data - The data to send in the request body
 * @returns RequestInit object with method, headers, and body set
 */
export function createPutRequest(data: Record<string, unknown>): RequestInit {
	return {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	};
}

/**
 * Creates a standard DELETE request
 *
 * @returns RequestInit object with method set to DELETE
 */
export function createDeleteRequest(): RequestInit {
	return { method: 'DELETE' };
}

/**
 * Helper to format bulk operation result into user-friendly message
 *
 * @param result - The bulk operation result
 * @param itemName - Name of items (e.g., "task", "agent")
 * @returns Formatted message string
 */
export function formatBulkResultMessage(result: BulkOperationResult, itemName: string = 'item'): string {
	const plural = result.successCount !== 1 ? 's' : '';

	if (result.success) {
		return `Successfully processed ${result.successCount} ${itemName}${plural}`;
	}

	if (result.successCount === 0) {
		return `Failed to process any ${itemName}s: ${result.errors[0] || 'Unknown error'}`;
	}

	return `Processed ${result.successCount} ${itemName}${plural}, ${result.failCount} failed`;
}

/**
 * State manager for bulk operations
 *
 * Provides a clean interface for managing loading/error state during bulk operations.
 *
 * @example
 * ```typescript
 * const state = createBulkOperationState();
 *
 * async function handleBulkDelete() {
 *   state.start();
 *   try {
 *     const result = await bulkApiOperation(...);
 *     if (!result.success) {
 *       state.setError(formatBulkResultMessage(result, 'task'));
 *     }
 *   } catch (err) {
 *     state.setError(err.message);
 *   } finally {
 *     state.finish();
 *   }
 * }
 * ```
 */
export function createBulkOperationState() {
	let isLoading = false;
	let error = '';

	return {
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		start() {
			isLoading = true;
			error = '';
		},
		finish() {
			isLoading = false;
		},
		setError(message: string) {
			error = message;
		},
		clearError() {
			error = '';
		}
	};
}
