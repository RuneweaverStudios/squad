<script lang="ts">
	import type { ActionRunBashConfig } from '$lib/types/workflow';

	let {
		config = { command: '', timeout: 60 },
		onUpdate = () => {}
	}: {
		config: ActionRunBashConfig;
		onUpdate?: (config: ActionRunBashConfig) => void;
	} = $props();

	function update(patch: Partial<ActionRunBashConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Command</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm font-mono leading-relaxed"
			style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.85 0.10 145); min-height: 100px"
			value={config.command}
			oninput={(e) => update({ command: e.currentTarget.value })}
			placeholder={`echo "Hello from workflow"\n\n# Use {{input}} for previous node output`}
		></textarea>
		<label class="label pt-1">
			<span class="label-text-alt" style="color: oklch(0.55 0.02 250)">
				Use <code class="px-1 py-0.5 rounded text-xs" style="background: oklch(0.20 0.02 250); color: oklch(0.72 0.17 220)">{`{{input}}`}</code> to reference previous node output
			</span>
		</label>
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Timeout (seconds)</span>
			</label>
			<input
				type="number"
				class="input input-sm input-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.timeout ?? 60}
				oninput={(e) => update({ timeout: parseInt(e.currentTarget.value) || 60 })}
				min="1"
				max="3600"
			/>
		</div>

		<div class="form-control">
			<label class="label pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Working Directory</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.cwd || ''}
				oninput={(e) => update({ cwd: e.currentTarget.value || undefined })}
				placeholder="~/code/project"
			/>
		</div>
	</div>
</div>
