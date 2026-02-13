<script lang="ts">
	import type { ActionSendMessageConfig } from '$lib/types/workflow';

	let {
		config = { recipient: '', message: '' },
		onUpdate = () => {}
	}: {
		config: ActionSendMessageConfig;
		onUpdate?: (config: ActionSendMessageConfig) => void;
	} = $props();

	function update(patch: Partial<ActionSendMessageConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Recipient</span>
		</label>
		<input
			type="text"
			class="input input-sm input-bordered w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
			value={config.recipient}
			oninput={(e) => update({ recipient: e.currentTarget.value })}
			placeholder="Agent name or 'notification'"
		/>
		<label class="label w-full pt-1">
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">Enter an agent name or "notification" for broadcasts</span>
		</label>
	</div>

	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Message</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm w-full"
			style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250); min-height: 100px"
			value={config.message}
			oninput={(e) => update({ message: e.currentTarget.value })}
			placeholder={`Message body (supports {{input}} and {{result}})`}
		></textarea>
	</div>
</div>
