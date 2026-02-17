<script lang="ts">
  let {
    screenshots = [],
    capturing = false,
    oncapture,
    onremove,
  }: {
    screenshots: string[];
    capturing: boolean;
    oncapture: () => void;
    onremove: (index: number) => void;
  } = $props();
</script>

<div class="screenshot-section">
  <button class="capture-btn" onclick={oncapture} disabled={capturing}>
    {#if capturing}
      <span class="spinner"></span>
      Capturing...
    {:else}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
      </svg>
      Screenshot
    {/if}
  </button>

  {#if screenshots.length > 0}
    <div class="thumb-strip">
      {#each screenshots.slice(-3) as src, i}
        <div class="thumb-wrap">
          <img class="thumb" src={src} alt="Screenshot {i + 1}" />
          <button class="thumb-remove" onclick={() => onremove(screenshots.length - 3 + i < 0 ? i : screenshots.length - 3 + i)} aria-label="Remove screenshot">&times;</button>
        </div>
      {/each}
      {#if screenshots.length > 3}
        <span class="more-badge">+{screenshots.length - 3}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .screenshot-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .capture-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 5px;
    color: #d1d5db;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .capture-btn:hover:not(:disabled) {
    background: #374151;
  }
  .capture-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .thumb-strip {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .thumb-wrap {
    position: relative;
  }
  .thumb {
    width: 60px;
    height: 42px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid #374151;
  }
  .thumb-remove {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding: 0;
  }
  .more-badge {
    font-size: 11px;
    color: #6b7280;
    padding: 0 4px;
  }
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
