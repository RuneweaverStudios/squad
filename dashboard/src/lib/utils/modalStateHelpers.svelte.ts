/**
 * Modal State Helpers
 *
 * Generic factory for creating modal state objects with consistent patterns.
 * Reduces boilerplate in components that manage multiple modals.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { createModalState } from '$lib/utils/modalStateHelpers';
 *
 *   const deleteModal = createModalState();
 *   const inboxModal = createModalState<InboxMessage[]>([]);
 *
 *   // Open modal
 *   deleteModal.open();
 *
 *   // Open with data
 *   inboxModal.open(messages);
 *
 *   // Close modal
 *   deleteModal.close();
 *
 *   // Set loading state
 *   deleteModal.setLoading(true);
 *
 *   // Set error state
 *   deleteModal.setError('Failed to delete');
 *
 *   // Access in template
 *   {#if deleteModal.isOpen}
 *     <Modal loading={deleteModal.loading} error={deleteModal.error}>
 *       ...
 *     </Modal>
 *   {/if}
 * </script>
 * ```
 */

/**
 * Modal state object interface
 */
export interface ModalState<T = undefined> {
	/** Whether the modal is currently open */
	isOpen: boolean;
	/** Loading state for async operations within the modal */
	loading: boolean;
	/** Error message to display in the modal */
	error: string | null;
	/** Optional data associated with the modal */
	data: T;
	/** Open the modal, optionally with data */
	open: (data?: T) => void;
	/** Close the modal and reset state */
	close: () => void;
	/** Set loading state */
	setLoading: (loading: boolean) => void;
	/** Set error message */
	setError: (error: string | null) => void;
	/** Reset all state (close + clear loading/error) */
	reset: () => void;
}

/**
 * Create a reactive modal state object
 *
 * @param initialData - Initial data value (optional)
 * @returns ModalState object with reactive properties and methods
 *
 * @example Basic modal (no data)
 * ```ts
 * const confirmModal = createModalState();
 * confirmModal.open();
 * confirmModal.close();
 * ```
 *
 * @example Modal with data
 * ```ts
 * const detailModal = createModalState<Item | null>(null);
 * detailModal.open(selectedItem);
 * // Access: detailModal.data
 * ```
 *
 * @example Modal with loading/error handling
 * ```ts
 * const deleteModal = createModalState();
 * deleteModal.open();
 * deleteModal.setLoading(true);
 * try {
 *   await deleteItem();
 *   deleteModal.close();
 * } catch (e) {
 *   deleteModal.setError(e.message);
 *   deleteModal.setLoading(false);
 * }
 * ```
 */
export function createModalState<T = undefined>(initialData?: T): ModalState<T> {
	let isOpen = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let data = $state<T>(initialData as T);

	return {
		get isOpen() {
			return isOpen;
		},
		set isOpen(value: boolean) {
			isOpen = value;
		},
		get loading() {
			return loading;
		},
		set loading(value: boolean) {
			loading = value;
		},
		get error() {
			return error;
		},
		set error(value: string | null) {
			error = value;
		},
		get data() {
			return data;
		},
		set data(value: T) {
			data = value;
		},
		open(newData?: T) {
			if (newData !== undefined) {
				data = newData;
			}
			error = null;
			loading = false;
			isOpen = true;
		},
		close() {
			isOpen = false;
			loading = false;
			error = null;
		},
		setLoading(value: boolean) {
			loading = value;
		},
		setError(value: string | null) {
			error = value;
			loading = false;
		},
		reset() {
			isOpen = false;
			loading = false;
			error = null;
			data = initialData as T;
		}
	};
}

/**
 * Create multiple modal states at once
 *
 * @param names - Array of modal names
 * @returns Record of modal name to ModalState
 *
 * @example
 * ```ts
 * const modals = createModalStates(['delete', 'inbox', 'send']);
 * modals.delete.open();
 * modals.inbox.close();
 * ```
 */
export function createModalStates<K extends string>(names: readonly K[]): Record<K, ModalState> {
	const result = {} as Record<K, ModalState>;
	for (const name of names) {
		result[name] = createModalState();
	}
	return result;
}

/**
 * Helper to check if any modal in a collection is open
 *
 * @param modals - Record of modal states
 * @returns true if any modal is open
 *
 * @example
 * ```ts
 * const modals = createModalStates(['a', 'b', 'c']);
 * if (anyModalOpen(modals)) {
 *   // Prevent background interactions
 * }
 * ```
 */
export function anyModalOpen<K extends string>(modals: Record<K, ModalState>): boolean {
	return Object.values<ModalState>(modals).some((m) => m.isOpen);
}

/**
 * Helper to close all modals in a collection
 *
 * @param modals - Record of modal states
 *
 * @example
 * ```ts
 * const modals = createModalStates(['a', 'b', 'c']);
 * closeAllModals(modals); // Close everything
 * ```
 */
export function closeAllModals<K extends string>(modals: Record<K, ModalState>): void {
	for (const modal of Object.values<ModalState>(modals)) {
		modal.close();
	}
}
