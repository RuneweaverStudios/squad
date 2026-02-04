<script lang="ts">
	/**
	 * FilterBuilder - Visual filter condition builder from plugin itemFields metadata.
	 *
	 * Renders condition rows with field dropdown, operator dropdown (constrained by field type),
	 * and value input (text for string, dropdown for enum, number input for number, toggle for boolean).
	 */

	interface ItemField {
		key: string;
		label: string;
		type: 'string' | 'enum' | 'number' | 'boolean';
		values?: string[];
	}

	interface FilterCondition {
		field: string;
		operator: string;
		value: any;
	}

	interface Props {
		itemFields: ItemField[];
		conditions: FilterCondition[];
		defaultFilter?: FilterCondition[];
		onConditionsChange: (conditions: FilterCondition[]) => void;
	}

	let { itemFields, conditions, defaultFilter, onConditionsChange }: Props = $props();

	/** Operators valid per field type */
	const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
		string: [
			{ value: 'equals', label: 'equals' },
			{ value: 'not_equals', label: 'not equals' },
			{ value: 'contains', label: 'contains' },
			{ value: 'starts_with', label: 'starts with' },
			{ value: 'ends_with', label: 'ends with' },
			{ value: 'regex', label: 'matches regex' }
		],
		enum: [
			{ value: 'equals', label: 'equals' },
			{ value: 'not_equals', label: 'not equals' },
			{ value: 'in', label: 'in' },
			{ value: 'not_in', label: 'not in' }
		],
		number: [
			{ value: 'equals', label: '=' },
			{ value: 'not_equals', label: '!=' },
			{ value: 'gt', label: '>' },
			{ value: 'gte', label: '>=' },
			{ value: 'lt', label: '<' },
			{ value: 'lte', label: '<=' }
		],
		boolean: [
			{ value: 'equals', label: 'is' }
		]
	};

	function getFieldMeta(fieldKey: string): ItemField | undefined {
		return itemFields.find(f => f.key === fieldKey);
	}

	function getOperatorsForField(fieldKey: string): { value: string; label: string }[] {
		const meta = getFieldMeta(fieldKey);
		if (!meta) return OPERATORS_BY_TYPE.string;
		return OPERATORS_BY_TYPE[meta.type] || OPERATORS_BY_TYPE.string;
	}

	function addCondition() {
		const first = itemFields[0];
		if (!first) return;
		const ops = getOperatorsForField(first.key);
		const defaultValue = first.type === 'boolean' ? true : first.type === 'enum' && first.values?.length ? first.values[0] : '';
		onConditionsChange([
			...conditions,
			{ field: first.key, operator: ops[0]?.value || 'equals', value: defaultValue }
		]);
	}

	function removeCondition(index: number) {
		const updated = conditions.filter((_, i) => i !== index);
		onConditionsChange(updated);
	}

	function updateCondition(index: number, key: keyof FilterCondition, value: any) {
		const updated = conditions.map((c, i) => {
			if (i !== index) return c;
			const newCond = { ...c, [key]: value };

			// When field changes, reset operator and value to valid defaults
			if (key === 'field') {
				const meta = getFieldMeta(value);
				const ops = OPERATORS_BY_TYPE[meta?.type || 'string'] || OPERATORS_BY_TYPE.string;
				newCond.operator = ops[0]?.value || 'equals';
				if (meta?.type === 'boolean') {
					newCond.value = true;
				} else if (meta?.type === 'enum' && meta.values?.length) {
					newCond.value = meta.values[0];
				} else {
					newCond.value = '';
				}
			}

			return newCond;
		});
		onConditionsChange(updated);
	}

	function resetToDefault() {
		onConditionsChange(defaultFilter ? [...defaultFilter] : []);
	}

	const hasDefault = $derived(defaultFilter && defaultFilter.length > 0);
	const isEmpty = $derived(conditions.length === 0);
</script>

<div class="space-y-3">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<label class="font-mono text-xs font-semibold" style="color: oklch(0.65 0.02 250);">
			Filter Conditions
		</label>
		<div class="flex items-center gap-2">
			{#if hasDefault}
				<button
					class="font-mono text-[10px] px-2 py-0.5 rounded cursor-pointer"
					style="color: oklch(0.55 0.02 250); background: oklch(0.20 0.02 250); border: 1px solid oklch(0.28 0.02 250);"
					onclick={resetToDefault}
				>
					Reset to default
				</button>
			{/if}
		</div>
	</div>

	<!-- Empty state -->
	{#if isEmpty}
		<div
			class="px-3 py-3 rounded-lg text-center"
			style="background: oklch(0.18 0.02 250 / 0.5); border: 1px dashed oklch(0.28 0.02 250);"
		>
			<p class="font-mono text-[11px]" style="color: oklch(0.50 0.02 250);">
				No filters configured. All items will be ingested.
			</p>
			{#if hasDefault}
				<p class="font-mono text-[10px] mt-1" style="color: oklch(0.42 0.02 250);">
					Default filter available — click "Reset to default" to apply.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Condition rows -->
	{#each conditions as condition, index}
		{@const fieldMeta = getFieldMeta(condition.field)}
		{@const operators = getOperatorsForField(condition.field)}
		<div
			class="flex items-start gap-2 px-3 py-2.5 rounded-lg"
			style="background: oklch(0.18 0.02 250 / 0.5); border: 1px solid oklch(0.25 0.02 250);"
		>
			<!-- Row number -->
			<span class="font-mono text-[10px] mt-2 shrink-0" style="color: oklch(0.40 0.02 250);">
				{index + 1}.
			</span>

			<!-- Field selector -->
			<div class="flex-1 min-w-0">
				<div class="flex flex-wrap gap-1.5">
					<select
						class="select select-bordered select-sm font-mono text-xs flex-1 min-w-[100px]"
						value={condition.field}
						onchange={(e) => updateCondition(index, 'field', e.currentTarget.value)}
					>
						{#each itemFields as f}
							<option value={f.key}>{f.label}</option>
						{/each}
					</select>

					<!-- Operator selector -->
					<select
						class="select select-bordered select-sm font-mono text-xs min-w-[90px]"
						value={condition.operator}
						onchange={(e) => updateCondition(index, 'operator', e.currentTarget.value)}
					>
						{#each operators as op}
							<option value={op.value}>{op.label}</option>
						{/each}
					</select>

					<!-- Value input (varies by field type) -->
					{#if fieldMeta?.type === 'boolean'}
						<select
							class="select select-bordered select-sm font-mono text-xs min-w-[70px]"
							value={String(condition.value)}
							onchange={(e) => updateCondition(index, 'value', e.currentTarget.value === 'true')}
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					{:else if fieldMeta?.type === 'enum' && fieldMeta.values && (condition.operator === 'equals' || condition.operator === 'not_equals')}
						<select
							class="select select-bordered select-sm font-mono text-xs flex-1 min-w-[90px]"
							value={condition.value ?? ''}
							onchange={(e) => updateCondition(index, 'value', e.currentTarget.value)}
						>
							{#each fieldMeta.values as v}
								<option value={v}>{v}</option>
							{/each}
						</select>
					{:else if fieldMeta?.type === 'number'}
						<input
							type="number"
							class="input input-bordered input-sm font-mono text-xs flex-1 min-w-[70px]"
							value={condition.value ?? ''}
							oninput={(e) => updateCondition(index, 'value', e.currentTarget.value)}
						/>
					{:else}
						<input
							type="text"
							class="input input-bordered input-sm font-mono text-xs flex-1 min-w-[90px]"
							placeholder={condition.operator === 'regex' ? 'pattern...' : 'value...'}
							value={condition.value ?? ''}
							oninput={(e) => updateCondition(index, 'value', e.currentTarget.value)}
						/>
					{/if}
				</div>
			</div>

			<!-- Remove button -->
			<button
				class="btn btn-ghost btn-xs mt-0.5 shrink-0 cursor-pointer"
				style="color: oklch(0.50 0.02 250);"
				onclick={() => removeCondition(index)}
				aria-label="Remove condition"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
					<path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
				</svg>
			</button>
		</div>

		{#if index < conditions.length - 1}
			<div class="flex justify-center">
				<span class="font-mono text-[9px] px-2 py-0.5 rounded" style="color: oklch(0.45 0.02 250); background: oklch(0.20 0.02 250);">AND</span>
			</div>
		{/if}
	{/each}

	<!-- Add condition button -->
	{#if itemFields.length > 0}
		<button
			class="font-mono text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer w-full justify-center"
			style="color: oklch(0.65 0.08 220); background: oklch(0.20 0.04 220 / 0.3); border: 1px dashed oklch(0.35 0.06 220);"
			onclick={addCondition}
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
				<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
			</svg>
			Add condition
		</button>
	{/if}

	<!-- Info text -->
	{#if conditions.length > 0}
		<p class="font-mono text-[10px]" style="color: oklch(0.42 0.02 250);">
			Items must match <strong>all</strong> conditions to be ingested.
		</p>
	{/if}
</div>
