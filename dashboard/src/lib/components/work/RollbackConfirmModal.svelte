<script lang="ts">
	/**
	 * RollbackConfirmModal Component
	 * Shows a confirmation dialog before rolling back to a previous git SHA.
	 *
	 * Props:
	 * - isOpen: boolean - controls modal visibility
	 * - gitSha: string - the git SHA to rollback to
	 * - timestamp: string - when the event occurred
	 * - sessionName: string - the tmux session to send command to
	 * - onClose: () => void - called when modal is closed
	 * - onConfirm: () => void - called after successful rollback
	 */

	interface Props {
		isOpen: boolean;
		gitSha: string;
		timestamp?: string;
		sessionName: string;
		onClose: () => void;
		onConfirm?: () => void;
	}

	let {
		isOpen = $bindable(false),
		gitSha,
		timestamp,
		sessionName,
		onClose,
		onConfirm
	}: Props = $props();

	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Format timestamp for display
	function formatTimestamp(ts?: string): string {
		if (!ts) return '';
		try {
			const date = new Date(ts);
			return date.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			});
		} catch {
			return ts;
		}
	}

	// Handle rollback confirmation
	async function handleConfirm() {
		if (!gitSha || !sessionName) return;

		isSubmitting = true;
		submitError = null;
		successMessage = null;

		try {
			// Send git checkout command to the session via API
			const response = await fetch(`/api/sessions/${sessionName}/input`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input: `git checkout ${gitSha}`
				})
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || `Failed to send rollback command: ${response.status}`);
			}

			successMessage = `Rolling back to ${gitSha.slice(0, 7)}...`;

			// Close after short delay
			setTimeout(() => {
				handleClose();
				onConfirm?.();
			}, 1500);

		} catch (error: any) {
			console.error('Rollback error:', error);
			submitError = error.message || 'Failed to execute rollback';
		} finally {
			isSubmitting = false;
		}
	}

	// Handle modal close
	function handleClose() {
		if (!isSubmitting) {
			submitError = null;
			successMessage = null;
			onClose();
		}
	}
</script>

<!-- Modal -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal modal-open z-[100]" onclick={(e) => e.target === e.currentTarget && handleClose()}>
		<div
			class="modal-box max-w-md"
			style="
				background: linear-gradient(180deg, oklch(0.18 0.01 250) 0%, oklch(0.16 0.01 250) 100%);
				border: 1px solid oklch(0.35 0.02 250);
			"
		>
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-3">
					<!-- Warning Icon -->
					<div
						class="w-10 h-10 rounded-full flex items-center justify-center"
						style="background: oklch(0.30 0.15 45); border: 1px solid oklch(0.45 0.18 45);"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" style="color: oklch(0.85 0.18 45);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div>
						<h3
							class="text-lg font-bold font-mono"
							style="color: oklch(0.85 0.02 250);"
						>
							Confirm Rollback
						</h3>
						<p class="text-xs mt-0.5" style="color: oklch(0.55 0.02 250);">
							This will reset your working directory
						</p>
					</div>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
					aria-label="Close modal"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Rollback Details -->
			<div
				class="rounded-lg p-4 mb-4"
				style="background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
			>
				<div class="flex items-center justify-between mb-3">
					<span class="text-xs font-mono uppercase tracking-wider" style="color: oklch(0.55 0.02 250);">
						Target Commit
					</span>
					{#if timestamp}
						<span class="text-xs font-mono" style="color: oklch(0.50 0.02 250);">
							{formatTimestamp(timestamp)}
						</span>
					{/if}
				</div>
				<div
					class="font-mono text-lg font-bold px-3 py-2 rounded"
					style="background: oklch(0.18 0.01 250); color: oklch(0.80 0.12 200); border: 1px solid oklch(0.30 0.08 200);"
				>
					{gitSha}
				</div>
			</div>

			<!-- Warning Message -->
			<div
				class="rounded-lg p-3 mb-4 text-sm"
				style="background: oklch(0.25 0.08 45 / 0.3); border: 1px solid oklch(0.45 0.12 45 / 0.5); color: oklch(0.85 0.10 45);"
			>
				<div class="flex items-start gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div>
						<p class="font-medium mb-1">This action will:</p>
						<ul class="text-xs space-y-1" style="color: oklch(0.75 0.06 45);">
							<li>- Discard all uncommitted changes</li>
							<li>- Reset the working directory to the selected commit</li>
							<li>- This cannot be undone without re-applying changes</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- Command Preview -->
			<div
				class="rounded-lg p-3 mb-4 font-mono text-xs"
				style="background: oklch(0.15 0.01 250); border: 1px solid oklch(0.25 0.02 250); color: oklch(0.60 0.02 250);"
			>
				<span style="color: oklch(0.50 0.02 250);">$</span> git checkout {gitSha.slice(0, 7)}
			</div>

			<!-- Error -->
			{#if submitError}
				<div
					class="alert mb-4 font-mono text-sm"
					style="background: oklch(0.35 0.15 25); border: 1px solid oklch(0.50 0.18 25); color: oklch(0.95 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{submitError}</span>
				</div>
			{/if}

			<!-- Success -->
			{#if successMessage}
				<div
					class="alert mb-4 font-mono text-sm"
					style="background: oklch(0.35 0.15 150); border: 1px solid oklch(0.50 0.18 150); color: oklch(0.95 0.02 250);"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{successMessage}</span>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-3 justify-end">
				<button
					class="btn btn-ghost"
					onclick={handleClose}
					disabled={isSubmitting}
				>
					Cancel
				</button>
				<button
					class="btn font-mono gap-2"
					style="background: oklch(0.45 0.15 45); color: oklch(0.95 0.02 250); border: 1px solid oklch(0.55 0.18 45);"
					onclick={handleConfirm}
					disabled={isSubmitting || !gitSha}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						Rolling back...
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
						</svg>
						Rollback
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
