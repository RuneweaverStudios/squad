<script lang="ts">
	/**
	 * InlineSelect Component
	 *
	 * A reusable inline editing component for dropdown selections.
	 * Shows slot content (badge) when not editing, converts to select on click.
	 *
	 * Features:
	 * - Auto-saves on change and closes
	 * - Click-outside to close (no onblur - avoids native select popup issues)
	 * - Auto-focus when editing starts
	 * - Disabled state during saves
	 */

	import type { Snippet } from 'svelte';

	interface SelectOption {
		value: string;
		label: string;
	}

	interface Props {
		/** Current value */
		value: string;
		/** Available options */
		options: SelectOption[];
		/** Callback when value is saved */
		onSave: (newValue: string) => Promise<void> | void;
		/** Disable editing */
		disabled?: boolean;
		/** Additional CSS classes for the container */
		class?: string;
		/** Content to display when not editing (typically a badge) */
		children?: Snippet;
	}

	let {
		value,
		options,
		onSave,
		disabled = false,
		class: className = '',
		children
	}: Props = $props();

	// Internal state
	let isEditing = $state(false);
	let editValue = $state(value);
	let isSaving = $state(false);
	let containerElement = $state<HTMLDivElement | null>(null);

	// Sync editValue when value prop changes (only when not editing)
	$effect(() => {
		if (!isEditing) {
			editValue = value;
		}
	});

	// Click-outside listener: close select when clicking outside container
	$effect(() => {
		if (!isEditing) return;

		function handlePointerDown(event: PointerEvent) {
			if (containerElement && !containerElement.contains(event.target as Node)) {
				cancelEditing();
			}
		}

		// Use setTimeout so the click that opened editing doesn't immediately close it
		const timer = setTimeout(() => {
			document.addEventListener('pointerdown', handlePointerDown, true);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('pointerdown', handlePointerDown, true);
		};
	});

	// Start editing
	function startEditing() {
		if (disabled || isSaving) return;
		editValue = value;
		isEditing = true;
	}

	// Cancel editing (close without save)
	function cancelEditing() {
		editValue = value;
		isEditing = false;
	}

	// Save the selected value
	async function saveValue() {
		// Don't save if value hasn't changed
		if (editValue === value) {
			isEditing = false;
			return;
		}

		isSaving = true;
		try {
			await onSave(editValue);
			isEditing = false;
		} catch (err) {
			console.error('Failed to save:', err);
			// Keep editing mode open on error
		} finally {
			isSaving = false;
		}
	}

	// Handle selection change - auto-save
	function handleChange() {
		saveValue();
	}

	// Handle keydown
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelEditing();
		}
	}

	// Auto-focus action
	function autofocus(node: HTMLSelectElement) {
		requestAnimationFrame(() => {
			node.focus();
		});
	}

	// Get label for current value
	function getLabel(val: string): string {
		const opt = options.find((o) => o.value === val);
		return opt ? opt.label : val;
	}
</script>

{#if isEditing}
	<!-- Edit mode -->
	<div bind:this={containerElement} class="inline-select-container inline-flex items-center {className}">
		<select
			bind:value={editValue}
			class="select select-bordered select-sm"
			disabled={isSaving}
			onchange={handleChange}
			onkeydown={handleKeyDown}
			use:autofocus
		>
			{#each options as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{#if isSaving}
			<span class="loading loading-spinner loading-xs ml-2"></span>
		{/if}
	</div>
{:else}
	<!-- Display mode -->
	<button
		class="inline-select-display inline-flex items-center rounded px-1 py-0.5 transition-colors {disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-base-200'} {className}"
		onclick={startEditing}
		disabled={disabled}
		type="button"
	>
		{#if children}
			{@render children()}
		{:else}
			<span class="text-sm">{getLabel(value)}</span>
		{/if}
	</button>
{/if}

<style>
	.inline-select-container {
		position: relative;
	}

	.inline-select-display {
		min-height: 1.5rem;
	}
</style>
