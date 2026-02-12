<script lang="ts">
	/**
	 * ProviderLogo - Renders a provider's logo icon
	 *
	 * Usage:
	 *   <ProviderLogo agentId="claude-code" />
	 *   <ProviderLogo agentId="codex-cli" size={20} />
	 *   <ProviderLogo provider="anthropic" />
	 */

	import { getProviderForAgent, PROVIDERS, type ProviderInfo } from '$lib/config/providerLogos';

	interface Props {
		/** Agent program ID (e.g., 'claude-code', 'codex-cli') */
		agentId?: string;
		/** API key provider (e.g., 'anthropic', 'openai') */
		apiKeyProvider?: string;
		/** Direct provider ID (e.g., 'anthropic') */
		provider?: string;
		/** Icon size in pixels */
		size?: number;
		/** Show provider name next to logo */
		showName?: boolean;
		/** Additional CSS classes */
		class?: string;
	}

	let {
		agentId,
		apiKeyProvider,
		provider,
		size = 16,
		showName = false,
		class: className = ''
	}: Props = $props();

	// Resolve provider info - use helper function for complex logic
	function resolveProvider(): ProviderInfo {
		if (provider && PROVIDERS[provider]) {
			return PROVIDERS[provider];
		}
		if (agentId) {
			return getProviderForAgent(agentId, apiKeyProvider);
		}
		if (apiKeyProvider && PROVIDERS[apiKeyProvider]) {
			return PROVIDERS[apiKeyProvider];
		}
		return PROVIDERS.generic;
	}

	const providerInfo = $derived(resolveProvider());
</script>

<span class="inline-flex items-center gap-1.5 {className}">
	{#if providerInfo.imageUrl}
		<img
			src={providerInfo.imageUrl}
			alt="{providerInfo.name} logo"
			width={size}
			height={size}
			class="object-contain"
			style="min-width: {size}px; min-height: {size}px;"
		/>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={providerInfo.viewBox ?? '0 0 24 24'}
			fill="currentColor"
			width={size}
			height={size}
			style="color: {providerInfo.color};"
			class="mt-0.5"
			aria-label="{providerInfo.name} logo"
		>
			<path d={providerInfo.iconPath} />
			{#if providerInfo.iconPath2}
				<path d={providerInfo.iconPath2} />
			{/if}
		</svg>
	{/if}
	{#if showName}
		<span class="text-xs" style="color: {providerInfo.color};">{providerInfo.name}</span>
	{/if}
</span>
