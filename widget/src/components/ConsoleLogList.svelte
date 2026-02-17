<script lang="ts">
  import type { ConsoleLogEntry } from '../lib/types';

  let { logs = [] }: { logs: ConsoleLogEntry[] } = $props();

  const typeColors: Record<string, string> = {
    error: '#ef4444',
    warn: '#f59e0b',
    info: '#3b82f6',
    log: '#9ca3af',
    debug: '#8b5cf6',
    trace: '#6b7280',
  };
</script>

{#if logs.length > 0}
  <div class="log-list">
    <div class="log-header">Console Logs ({logs.length})</div>
    <div class="log-scroll">
      {#each logs.slice(-10) as log}
        <div class="log-entry">
          <span class="log-type" style="color: {typeColors[log.type] || '#9ca3af'}">{log.type}</span>
          <span class="log-msg">{log.message.substring(0, 120)}{log.message.length > 120 ? '...' : ''}</span>
        </div>
      {/each}
      {#if logs.length > 10}
        <div class="log-more">+{logs.length - 10} more</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .log-list {
    border: 1px solid #374151;
    border-radius: 6px;
    overflow: hidden;
  }
  .log-header {
    padding: 6px 10px;
    background: #1f2937;
    font-size: 11px;
    font-weight: 600;
    color: #d1d5db;
    border-bottom: 1px solid #374151;
  }
  .log-scroll {
    max-height: 140px;
    overflow-y: auto;
    background: #111827;
  }
  .log-entry {
    padding: 4px 10px;
    font-size: 11px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid #1f293780;
    line-height: 1.4;
  }
  .log-type {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
    min-width: 40px;
    flex-shrink: 0;
  }
  .log-msg {
    color: #d1d5db;
    word-break: break-word;
  }
  .log-more {
    padding: 4px 10px;
    font-size: 10px;
    color: #6b7280;
    text-align: center;
  }
</style>
