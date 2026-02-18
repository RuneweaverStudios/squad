<script lang="ts">
  let { message, type = 'success', visible = false }: { message: string; type: 'success' | 'error'; visible: boolean } = $props();
</script>

{#if visible}
  <div class="squad-toast" class:error={type === 'error'} class:success={type === 'success'}>
    <span class="icon">
      {#if type === 'success'}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5V8.5M8 10.5V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      {/if}
    </span>
    <span class="msg">{message}</span>
  </div>
{/if}

<style>
  .squad-toast {
    position: absolute;
    bottom: 70px;
    right: 0;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: toast-in 0.3s ease;
    white-space: nowrap;
  }
  .success {
    background: #065f46;
    color: #d1fae5;
    border: 1px solid #10b981;
  }
  .error {
    background: #7f1d1d;
    color: #fecaca;
    border: 1px solid #ef4444;
  }
  .icon {
    display: flex;
    align-items: center;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
