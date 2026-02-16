<script lang="ts">
  import { getSettings, saveSettings, clearSettings, testConnection, getDefaultUrl, type JatSettings } from '../lib/supabase'

  let jatUrl = $state('')
  let saving = $state(false)
  let testing = $state(false)
  let message = $state<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  let loaded = $state(false)

  // Load existing settings on mount
  $effect(() => {
    loadSettings()
  })

  async function loadSettings() {
    const settings = await getSettings()
    if (settings) {
      jatUrl = settings.jatUrl
    } else {
      jatUrl = getDefaultUrl()
    }
    loaded = true
  }

  async function handleSave() {
    if (!jatUrl.trim()) {
      message = { type: 'error', text: 'JAT IDE URL is required.' }
      return
    }

    // Basic URL validation
    if (!jatUrl.startsWith('http://') && !jatUrl.startsWith('https://')) {
      message = { type: 'error', text: 'URL should start with http:// or https://' }
      return
    }

    saving = true
    message = null

    try {
      await saveSettings({ jatUrl: jatUrl.trim() })
      message = { type: 'success', text: 'Settings saved.' }
    } catch (err) {
      message = { type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' }
    } finally {
      saving = false
    }
  }

  async function handleTest() {
    if (!jatUrl.trim()) {
      message = { type: 'error', text: 'Enter a URL first.' }
      return
    }

    testing = true
    message = { type: 'info', text: 'Testing connection...' }

    try {
      // Save first so testConnection uses current value
      await saveSettings({ jatUrl: jatUrl.trim() })

      const result = await testConnection()
      if (result.ok) {
        message = { type: 'success', text: 'Connected to JAT IDE successfully!' }
      } else {
        message = { type: 'error', text: result.error || 'Connection failed.' }
      }
    } catch (err) {
      message = { type: 'error', text: err instanceof Error ? err.message : 'Test failed.' }
    } finally {
      testing = false
    }
  }

  async function handleClear() {
    await clearSettings()
    jatUrl = getDefaultUrl()
    message = { type: 'info', text: 'Settings reset to default.' }
  }

  const hasValue = $derived(jatUrl.trim().length > 0)
</script>

{#if !loaded}
  <div class="page">
    <div class="loading">Loading...</div>
  </div>
{:else}
  <div class="page">
    <header class="header">
      <div class="logo">J</div>
      <h1>JAT Extension Settings</h1>
    </header>

    <section class="section">
      <h2>JAT IDE Connection</h2>
      <p class="hint">
        Connect to your JAT IDE to submit bug reports directly as tasks.
        The IDE must be running for reports to be submitted.
      </p>

      <div class="field">
        <label for="url">JAT IDE URL</label>
        <input
          id="url"
          type="url"
          bind:value={jatUrl}
          placeholder="http://localhost:3333"
          disabled={saving || testing}
        />
        <span class="field-hint">Default: http://localhost:3333 (JAT IDE dev server)</span>
      </div>

      {#if message}
        <div class="message {message.type}">
          {message.text}
        </div>
      {/if}

      <div class="actions">
        <button class="btn primary" onclick={handleSave} disabled={saving || testing || !hasValue}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button class="btn secondary" onclick={handleTest} disabled={saving || testing || !hasValue}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button class="btn danger" onclick={handleClear} disabled={saving || testing}>
          Reset
        </button>
      </div>
    </section>

    <section class="section">
      <h2>How It Works</h2>
      <div class="how-it-works">
        <div class="step">
          <span class="step-num">1</span>
          <span class="step-text">Capture screenshots, console logs, or select elements on any page</span>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <span class="step-text">Fill out the bug report form in the extension popup</span>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <span class="step-text">Report is sent to JAT IDE and created as a task automatically</span>
        </div>
      </div>
    </section>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    background: #f9fafb;
    color: #1f2937;
  }

  .page {
    max-width: 600px;
    margin: 0 auto;
    padding: 24px;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #6b7280;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .logo {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 16px;
    flex-shrink: 0;
  }

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
  }

  h2 {
    margin: 0 0 8px 0;
    font-size: 15px;
    font-weight: 600;
  }

  .hint {
    color: #6b7280;
    font-size: 13px;
    margin: 0 0 16px 0;
    line-height: 1.4;
  }

  .field {
    margin-bottom: 14px;
  }

  label {
    display: block;
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
    color: #374151;
  }

  input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    color: #1f2937;
    background: #fff;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .field-hint {
    display: block;
    font-size: 11px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .message {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 14px;
  }

  .message.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .message.error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
  }

  .message.info {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: #3b82f6;
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn.secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .btn.secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn.danger {
    background: #fff;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .btn.danger:hover:not(:disabled) {
    background: #fef2f2;
  }

  .how-it-works {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .step-num {
    width: 24px;
    height: 24px;
    background: #eef2ff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4f46e5;
    font-weight: 700;
    font-size: 12px;
    flex-shrink: 0;
  }

  .step-text {
    font-size: 13px;
    color: #374151;
    line-height: 1.4;
  }
</style>
