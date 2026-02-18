<script lang="ts">
	/**
	 * DynamicConfigForm - Renders form fields from plugin configFields metadata.
	 *
	 * Supports field types: string, number, boolean, secret, select, multiselect
	 * Handles: required validation, defaults, placeholders, helpText, labels
	 */

	interface ConfigFieldOption {
		value: string;
		label: string;
	}

	interface ConfigField {
		key: string;
		label: string;
		type: 'string' | 'number' | 'boolean' | 'secret' | 'select' | 'multiselect';
		required?: boolean;
		default?: any;
		placeholder?: string;
		helpText?: string;
		options?: ConfigFieldOption[];
		setupGuideTitle?: string;
		setupGuide?: string[];
	}

	interface Props {
		configFields: ConfigField[];
		values: Record<string, any>;
		onValueChange: (key: string, value: any) => void;
		/** Secret field status tracking */
		secretStatus?: Record<string, 'checking' | 'found' | 'missing' | 'saving' | 'error'>;
		secretMasked?: Record<string, string>;
		tokenInputs?: Record<string, string>;
		showTokenInput?: Record<string, boolean>;
		onCheckSecret?: (fieldKey: string, secretName: string) => void;
		onSaveToken?: (fieldKey: string, secretName: string, token: string) => void;
		onToggleTokenInput?: (fieldKey: string, show: boolean) => void;
		onTokenInputChange?: (fieldKey: string, value: string) => void;
	}

	let {
		configFields,
		values,
		onValueChange,
		secretStatus = {},
		secretMasked = {},
		tokenInputs = {},
		showTokenInput = {},
		onCheckSecret,
		onSaveToken,
		onToggleTokenInput,
		onTokenInputChange
	}: Props = $props();

	function handleMultiselectToggle(fieldKey: string, optionValue: string) {
		const current: string[] = Array.isArray(values[fieldKey]) ? [...values[fieldKey]] : [];
		const idx = current.indexOf(optionValue);
		if (idx >= 0) {
			current.splice(idx, 1);
		} else {
			current.push(optionValue);
		}
		onValueChange(fieldKey, current);
	}
</script>

<div class="space-y-4">
	{#each configFields as field}
		<div>
			{#if field.type !== 'boolean'}
				<label class="font-mono text-xs font-semibold block mb-1.5" style="color: oklch(0.65 0.02 250);">
					{field.label || field.key}
					{#if field.required}
						<span style="color: oklch(0.70 0.12 25);">*</span>
					{/if}
				</label>
			{/if}

			{#if field.type === 'string'}
				<input
					type="text"
					class="input input-bordered w-full font-mono text-sm"
					placeholder={field.placeholder || ''}
					value={values[field.key] ?? ''}
					oninput={(e) => onValueChange(field.key, e.currentTarget.value)}
				/>

			{:else if field.type === 'number'}
				<input
					type="number"
					class="input input-bordered w-full font-mono text-sm"
					placeholder={field.placeholder || ''}
					value={values[field.key] ?? ''}
					oninput={(e) => onValueChange(field.key, e.currentTarget.value)}
				/>

			{:else if field.type === 'boolean'}
				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={values[field.key] === true}
						onchange={(e) => onValueChange(field.key, e.currentTarget.checked)}
					/>
					<span class="font-mono text-xs" style="color: oklch(0.65 0.02 250);">
						{field.label || field.key}
						{#if field.required}
							<span style="color: oklch(0.70 0.12 25);">*</span>
						{/if}
					</span>
				</label>

			{:else if field.type === 'select' && field.options}
				<select
					class="select select-bordered w-full font-mono text-sm"
					value={values[field.key] ?? ''}
					onchange={(e) => onValueChange(field.key, e.currentTarget.value)}
				>
					{#if !field.required}
						<option value="">-- Select --</option>
					{/if}
					{#each field.options as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>

			{:else if field.type === 'multiselect' && field.options}
				<div class="flex flex-wrap gap-1.5">
					{#each field.options as opt}
						{@const selected = Array.isArray(values[field.key]) && values[field.key].includes(opt.value)}
						<button
							type="button"
							class="font-mono text-[11px] px-2.5 py-1 rounded-lg transition-all duration-100 cursor-pointer"
							style="
								background: {selected ? 'oklch(0.30 0.10 220)' : 'oklch(0.20 0.02 250)'};
								color: {selected ? 'oklch(0.90 0.08 220)' : 'oklch(0.60 0.02 250)'};
								border: 1px solid {selected ? 'oklch(0.45 0.12 220)' : 'oklch(0.28 0.02 250)'};
							"
							onclick={() => handleMultiselectToggle(field.key, opt.value)}
						>
							{#if selected}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 inline mr-0.5 -mt-0.5">
									<path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" />
								</svg>
							{/if}
							{opt.label}
						</button>
					{/each}
				</div>

			{:else if field.type === 'secret'}
				<!-- Secret name input -->
				<input
					type="text"
					class="input input-bordered w-full font-mono text-sm"
					placeholder={field.key}
					value={values[field.key] ?? field.key}
					oninput={(e) => {
						onValueChange(field.key, e.currentTarget.value);
						const val = e.currentTarget.value.trim();
						if (val && onCheckSecret) onCheckSecret(field.key, val);
					}}
				/>
				<p class="font-mono text-[10px] mt-1" style="color: oklch(0.45 0.02 250);">
					Name used in <code>squad-secret</code> to retrieve the token
				</p>

				<!-- Secret status -->
				{#if secretStatus[field.key] === 'checking'}
					<div
						class="flex items-center gap-2 px-3 py-2.5 rounded-lg mt-2"
						style="background: oklch(0.20 0.02 250 / 0.5); border: 1px solid oklch(0.28 0.02 250);"
					>
						<span class="loading loading-spinner loading-xs" style="color: oklch(0.55 0.02 250);"></span>
						<span class="font-mono text-[11px]" style="color: oklch(0.55 0.02 250);">Checking for secret...</span>
					</div>
				{:else if secretStatus[field.key] === 'found' && !showTokenInput[field.key]}
					<div
						class="px-3 py-2.5 rounded-lg mt-2"
						style="background: oklch(0.20 0.06 145 / 0.3); border: 1px solid oklch(0.35 0.10 145);"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5" style="color: oklch(0.70 0.18 145);">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
								</svg>
								<span class="font-mono text-[11px]" style="color: oklch(0.75 0.12 145);">
									Secret found: <code style="color: oklch(0.65 0.02 250);">{secretMasked[field.key]}</code>
								</span>
							</div>
							<button
								class="font-mono text-[10px] px-2 py-0.5 rounded cursor-pointer"
								style="color: oklch(0.60 0.02 250); background: oklch(0.22 0.02 250); border: 1px solid oklch(0.30 0.02 250);"
								onclick={() => onToggleTokenInput?.(field.key, true)}
							>
								Change
							</button>
						</div>
					</div>
				{:else}
					<!-- Secret missing or user clicked Change -->
					<div
						class="px-3 py-2.5 rounded-lg space-y-3 mt-2"
						style="background: oklch(0.20 0.04 60 / 0.2); border: 1px solid oklch(0.35 0.08 60);"
					>
						<p class="font-mono text-[11px]" style="color: oklch(0.75 0.10 60);">
							Enter the API token/secret value:
						</p>

						{#if field.setupGuide?.length}
							<details open>
								<summary
									class="font-mono text-[11px] cursor-pointer select-none"
									style="color: oklch(0.70 0.12 200);"
								>
									{field.setupGuideTitle || 'Setup guide'}
								</summary>
								<ol class="list-decimal list-inside space-y-1.5 mt-2 ml-1">
									{#each field.setupGuide as step}
										<li class="font-mono text-[11px] leading-relaxed" style="color: oklch(0.60 0.02 250);">
											{@html step}
										</li>
									{/each}
								</ol>
							</details>
						{/if}

						<div class="flex gap-2">
							<input
								type="password"
								class="input input-bordered input-sm flex-1 font-mono text-xs"
								placeholder="Paste token here..."
								value={tokenInputs[field.key] || ''}
								oninput={(e) => onTokenInputChange?.(field.key, e.currentTarget.value)}
							/>
							<button
								class="btn btn-sm font-mono text-[11px]"
								style="background: oklch(0.35 0.10 145); color: oklch(0.95 0.02 250); border: 1px solid oklch(0.45 0.10 145);"
								onclick={() => {
									const secretName = (values[field.key] || field.key).trim();
									const token = (tokenInputs[field.key] || '').trim();
									if (secretName && token && onSaveToken) onSaveToken(field.key, secretName, token);
								}}
								disabled={secretStatus[field.key] === 'saving' || !(tokenInputs[field.key] || '').trim()}
							>
								{#if secretStatus[field.key] === 'saving'}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									Save
								{/if}
							</button>
						</div>
					</div>
				{/if}
			{/if}

			{#if field.helpText && field.type !== 'boolean' && field.type !== 'secret'}
				<p class="font-mono text-[10px] mt-1.5" style="color: oklch(0.45 0.02 250);">
					{field.helpText}
				</p>
			{/if}
		</div>
	{/each}
</div>
