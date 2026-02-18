<script lang="ts">
  let { onclick, open = false }: { onclick: () => void; open: boolean } = $props();
</script>

<button
  class="squad-fb-btn"
  class:open
  onclick={onclick}
  aria-label={open ? 'Close feedback' : 'Send feedback'}
  title={open ? 'Close feedback' : 'Send feedback'}
>
  {#if open}
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  {:else}
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12C2 13.85 2.5 15.55 3.36 17L2 22L7 20.64C8.45 21.5 10.15 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 10H8.01M12 10H12.01M16 10H16.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  {/if}
</button>

<style>
  .squad-fb-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    background: var(--squad-btn-color, #3b82f6);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .squad-fb-btn:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }
  .squad-fb-btn:active {
    transform: scale(0.95);
  }
  .squad-fb-btn.open {
    background: #6b7280;
  }
</style>
