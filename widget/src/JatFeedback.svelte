<svelte:options customElement="jat-feedback" />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { WidgetConfig } from './lib/types';
  import { DEFAULT_CONFIG } from './lib/types';
  import { startConsoleCapture, stopConsoleCapture } from './lib/consoleCapture';
  import { startRetryLoop, stopRetryLoop } from './lib/queue';
  import FeedbackButton from './components/FeedbackButton.svelte';
  import FeedbackPanel from './components/FeedbackPanel.svelte';

  // Custom element attributes
  let {
    endpoint = '',
    position = 'bottom-right',
    theme = 'dark',
    buttoncolor = '#3b82f6',
  }: {
    endpoint: string;
    position: string;
    theme: string;
    buttoncolor: string;
  } = $props();

  let open = $state(false);

  let config = $derived<WidgetConfig>({
    ...DEFAULT_CONFIG,
    endpoint: endpoint || DEFAULT_CONFIG.endpoint,
    position: (position as WidgetConfig['position']) || DEFAULT_CONFIG.position,
    theme: (theme as WidgetConfig['theme']) || DEFAULT_CONFIG.theme,
    buttonColor: buttoncolor || DEFAULT_CONFIG.buttonColor,
  });

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  const positionStyles: Record<string, string> = {
    'bottom-right': 'bottom: 20px; right: 20px;',
    'bottom-left': 'bottom: 20px; left: 20px;',
    'top-right': 'top: 20px; right: 20px;',
    'top-left': 'top: 20px; left: 20px;',
  };

  const panelPositionStyles: Record<string, string> = {
    'bottom-right': 'bottom: 80px; right: 0;',
    'bottom-left': 'bottom: 80px; left: 0;',
    'top-right': 'top: 80px; right: 0;',
    'top-left': 'top: 80px; left: 0;',
  };

  onMount(() => {
    if (config.captureConsole) {
      startConsoleCapture(config.maxConsoleLogs);
    }
    startRetryLoop();
  });

  onDestroy(() => {
    stopConsoleCapture();
    stopRetryLoop();
  });
</script>

<div class="jat-feedback-root" style="{positionStyles[config.position] || positionStyles['bottom-right']}; --jat-btn-color: {config.buttonColor};">
  {#if open && config.endpoint}
    <div class="jat-feedback-panel" style="{panelPositionStyles[config.position] || panelPositionStyles['bottom-right']}">
      <FeedbackPanel endpoint={config.endpoint} onclose={close} />
    </div>
  {:else if open && !config.endpoint}
    <div class="jat-feedback-panel" style="{panelPositionStyles[config.position] || panelPositionStyles['bottom-right']}">
      <div class="no-endpoint">
        <p>No endpoint configured.</p>
        <p>Add the <code>endpoint</code> attribute:</p>
        <code class="example">&lt;jat-feedback endpoint="http://localhost:3333"&gt;</code>
      </div>
    </div>
  {/if}

  <FeedbackButton onclick={toggle} {open} />
</div>

<style>
  .jat-feedback-root {
    position: fixed;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .jat-feedback-panel {
    position: absolute;
    animation: panel-in 0.2s ease;
  }
  .no-endpoint {
    width: 320px;
    background: #111827;
    border: 1px solid #374151;
    border-radius: 12px;
    padding: 20px;
    color: #d1d5db;
    font-size: 13px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  .no-endpoint p {
    margin: 0 0 8px;
  }
  .no-endpoint code {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    color: #93c5fd;
  }
  .no-endpoint code.example {
    display: block;
    background: #1f2937;
    padding: 8px 10px;
    border-radius: 4px;
    margin-top: 4px;
  }
  @keyframes panel-in {
    from { opacity: 0; transform: translateY(8px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>
