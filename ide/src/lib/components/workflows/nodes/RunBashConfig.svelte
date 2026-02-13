<script lang="ts">
	import type { ActionRunBashConfig } from '$lib/types/workflow';

	let {
		config = { command: '', timeout: 60 },
		onUpdate = () => {}
	}: {
		config: ActionRunBashConfig;
		onUpdate?: (config: ActionRunBashConfig) => void;
	} = $props();

	let showHelp = $state(false);

	function update(patch: Partial<ActionRunBashConfig>) {
		config = { ...config, ...patch };
		onUpdate(config);
	}

	const COMMAND_EXAMPLES: { label: string; cmd: string }[] = [
		{ label: 'Ready tasks', cmd: 'jt ready --json' },
		{ label: 'Task details', cmd: 'jt show {{input}} --json' },
		{ label: 'Git status', cmd: 'git status --porcelain' },
		{ label: 'Git log', cmd: 'git log --oneline -10' },
		{ label: 'Active agents', cmd: 'am-agents --json' },
		{ label: 'Curl API', cmd: 'curl -s https://api.example.com/status | jq .' },
		{ label: 'Count files', cmd: 'find src -name "*.ts" | wc -l' },
		{ label: 'Disk usage', cmd: 'du -sh ~/code/*' }
	];
</script>

<div class="flex flex-col gap-4">
	<div class="form-control">
		<label class="label w-full pb-1">
			<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Command</span>
		</label>
		<textarea
			class="textarea textarea-bordered text-sm font-mono leading-relaxed w-full"
			style="background: oklch(0.14 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.85 0.10 145); min-height: 100px"
			value={config.command}
			oninput={(e) => update({ command: e.currentTarget.value })}
			placeholder={`echo "Hello from workflow"\n\n# Use {{input}} for previous node output`}
		></textarea>
		<div class="mt-1.5 flex items-center gap-1">
			<button
				type="button"
				class="text-xs px-0 bg-transparent border-none cursor-pointer flex items-center gap-1"
				style="color: oklch(0.60 0.10 220)"
				onclick={() => showHelp = !showHelp}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
					<path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clip-rule="evenodd" />
				</svg>
				{showHelp ? 'Hide' : 'Variables & examples'}
			</button>
		</div>

		{#if showHelp}
			<div class="mt-1.5 rounded-lg p-2.5 text-xs" style="background: oklch(0.14 0.01 250); border: 1px solid oklch(0.22 0.02 250)">
				<div class="mb-1.5" style="color: oklch(0.55 0.02 250)">Template variables:</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 220); font-size: 0.6875rem">{`{{input}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Full output from the previous node</span>
					</div>
					<div class="flex items-baseline gap-2">
						<code class="font-mono px-1 rounded" style="background: oklch(0.18 0.02 250); color: oklch(0.80 0.12 220); font-size: 0.6875rem">{`{{input.field}}`}</code>
						<span style="color: oklch(0.50 0.02 250)">Access a field when input is JSON</span>
					</div>
				</div>
				<div class="mt-2 pt-1.5 flex flex-col gap-1" style="border-top: 1px solid oklch(0.22 0.02 250)">
					<div style="color: oklch(0.55 0.02 250)">Example commands (click to use):</div>
					{#each COMMAND_EXAMPLES as ex}
						<div class="flex items-baseline gap-2">
							<span class="shrink-0 w-[90px] text-right" style="color: oklch(0.50 0.02 250)">{ex.label}</span>
							<button
								class="font-mono px-1 rounded text-left bg-transparent border-none cursor-pointer"
								style="background: oklch(0.18 0.02 250); color: oklch(0.75 0.15 145); font-size: 0.6875rem"
								onclick={() => update({ command: ex.cmd })}
								title="Click to use"
							>{ex.cmd}</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div class="form-control">
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Timeout (seconds)</span>
			</label>
			<input
				type="number"
				class="input input-sm input-bordered w-full"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.timeout ?? 60}
				oninput={(e) => update({ timeout: parseInt(e.currentTarget.value) || 60 })}
				min="1"
				max="3600"
			/>
		</div>

		<div class="form-control">
			<label class="label w-full pb-1">
				<span class="label-text font-semibold text-sm" style="color: oklch(0.85 0.02 250)">Working Directory</span>
			</label>
			<input
				type="text"
				class="input input-sm input-bordered w-full"
				style="background: oklch(0.16 0.01 250); border-color: oklch(0.25 0.02 250); color: oklch(0.90 0.02 250)"
				value={config.cwd || ''}
				oninput={(e) => update({ cwd: e.currentTarget.value || undefined })}
				placeholder="~/code/project"
			/>
		</div>
	</div>
</div>
