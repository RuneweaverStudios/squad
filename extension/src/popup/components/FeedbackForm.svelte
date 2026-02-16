<script lang="ts">
  import type { ConsoleLogEntry, ElementData } from '../stores/capturedData.svelte'
  import { isConfigured, submitFeedback } from '../../lib/supabase'

  interface Props {
    screenshots: string[]
    consoleLogs: ConsoleLogEntry[]
    selectedElements: ElementData[]
    onclose: () => void
  }

  let { screenshots, consoleLogs, selectedElements, onclose }: Props = $props()

  let title = $state('')
  let description = $state('')
  let type: 'bug' | 'enhancement' | 'other' = $state('bug')
  let priority: 'low' | 'medium' | 'high' | 'critical' = $state('medium')
  let submitting = $state(false)
  let submitError = $state('')
  let submitSuccess = $state(false)
  let configured = $state<boolean | null>(null)

  const typeOptions = [
    { value: 'bug', label: 'Bug' },
    { value: 'enhancement', label: 'Enhancement' },
    { value: 'other', label: 'Other' },
  ] as const

  const priorityOptions = [
    { value: 'low', label: 'Low', desc: 'Minor issue' },
    { value: 'medium', label: 'Medium', desc: 'Notable issue' },
    { value: 'high', label: 'High', desc: 'Major issue' },
    { value: 'critical', label: 'Critical', desc: 'Blocking' },
  ] as const

  // Check if JAT IDE is configured on mount
  $effect(() => {
    isConfigured().then(v => { configured = v })
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!title.trim()) return

    submitting = true
    submitError = ''
    submitSuccess = false

    try {
      const pageUrl = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url || ''

      if (configured) {
        // Submit to JAT IDE
        const result = await submitFeedback(
          {
            title: title.trim(),
            description: description.trim(),
            type,
            priority,
            page_url: pageUrl,
            user_agent: navigator.userAgent,
            console_logs: consoleLogs.length > 0 ? consoleLogs : null,
            selected_elements: selectedElements.length > 0 ? selectedElements : null,
            screenshot_urls: null,
            metadata: null,
          },
          screenshots,
        )

        if (!result.ok) {
          submitError = result.error || 'Submission failed'
          return
        }
      } else {
        // Fallback: store locally when JAT IDE is not configured
        const report = {
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          url: pageUrl,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          capturedData: { screenshots, consoleLogs, selectedElements },
        }
        await chrome.storage.local.set({
          [`bugReport_${Date.now()}`]: report,
        })
      }

      // Clear captured data after successful submission
      await chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURED_DATA' })

      submitSuccess = true
      setTimeout(() => onclose(), 1200)
    } catch (err) {
      submitError = err instanceof Error ? err.message : 'Submission failed'
    } finally {
      submitting = false
    }
  }

  function openSettings() {
    chrome.runtime.openOptionsPage?.()
  }

  // Summary of attached data
  function attachmentSummary(): string[] {
    const parts: string[] = []
    if (screenshots.length > 0) parts.push(`${screenshots.length} screenshot${screenshots.length > 1 ? 's' : ''}`)
    if (consoleLogs.length > 0) parts.push(`${consoleLogs.length} console log${consoleLogs.length > 1 ? 's' : ''}`)
    if (selectedElements.length > 0) parts.push(`${selectedElements.length} element${selectedElements.length > 1 ? 's' : ''}`)
    return parts
  }
</script>

{#if submitSuccess}
  <div class="success-banner">
    <span class="success-icon">&#x2713;</span>
    <span>Report submitted{configured ? '' : ' (saved locally)'}!</span>
  </div>
{:else}
<form class="form" onsubmit={handleSubmit}>
  {#if configured === false}
    <div class="config-notice">
      <span>JAT IDE not configured. Reports will be saved locally.</span>
      <button type="button" class="config-link" onclick={openSettings}>Set up connection</button>
    </div>
  {/if}

  <div class="field">
    <label for="title">Title <span class="required">*</span></label>
    <input
      id="title"
      type="text"
      bind:value={title}
      placeholder="Brief description of the issue"
      required
      disabled={submitting}
    />
  </div>

  <div class="field">
    <label for="description">Description</label>
    <textarea
      id="description"
      bind:value={description}
      placeholder="Steps to reproduce, expected vs actual behavior..."
      rows="4"
      disabled={submitting}
    ></textarea>
  </div>

  <div class="field-row">
    <div class="field half">
      <label for="type">Type</label>
      <select id="type" bind:value={type} disabled={submitting}>
        {#each typeOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class="field half">
      <label for="priority">Priority</label>
      <select id="priority" bind:value={priority} disabled={submitting}>
        {#each priorityOptions as opt}
          <option value={opt.value}>{opt.label} - {opt.desc}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if attachmentSummary().length > 0}
    <div class="attachments">
      <span class="attach-icon">&#x1f4ce;</span>
      <span class="attach-text">{attachmentSummary().join(', ')} attached</span>
    </div>
  {/if}

  {#if screenshots.length > 0}
    <div class="screenshot-strip">
      {#each screenshots.slice(-3) as src, i}
        <img class="form-thumb" src={src} alt="Attachment {i + 1}" />
      {/each}
      {#if screenshots.length > 3}
        <span class="more-count">+{screenshots.length - 3}</span>
      {/if}
    </div>
  {/if}

  {#if submitError}
    <div class="error">{submitError}</div>
  {/if}

  <div class="actions">
    <button type="button" class="cancel-btn" onclick={onclose} disabled={submitting}>
      Cancel
    </button>
    <button type="submit" class="submit-btn" disabled={submitting || !title.trim()}>
      {#if submitting}
        <span class="spinner"></span>
        Submitting...
      {:else}
        Submit Report
      {/if}
    </button>
  </div>
</form>
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-row {
    display: flex;
    gap: 10px;
  }

  .half {
    flex: 1;
  }

  label {
    font-weight: 600;
    font-size: 12px;
    color: #374151;
  }

  .required {
    color: #dc2626;
  }

  input, textarea, select {
    padding: 7px 10px;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    font-size: 13px;
    font-family: inherit;
    color: #1f2937;
    background: #fff;
    transition: border-color 0.15s;
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }
  input:disabled, textarea:disabled, select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  textarea {
    resize: vertical;
    min-height: 60px;
  }

  .attachments {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 5px;
    font-size: 12px;
    color: #0369a1;
  }

  .attach-icon {
    font-size: 13px;
  }

  .attach-text {
    flex: 1;
  }

  .screenshot-strip {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .form-thumb {
    width: 56px;
    height: 38px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
  }

  .more-count {
    font-size: 11px;
    color: #9ca3af;
    padding: 0 4px;
  }

  .success-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    color: #166534;
    font-size: 15px;
    font-weight: 600;
  }

  .success-icon {
    font-size: 20px;
    color: #16a34a;
  }

  .config-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 5px;
    font-size: 12px;
    color: #92400e;
  }

  .config-link {
    background: none;
    border: none;
    color: #2563eb;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    text-decoration: underline;
    white-space: nowrap;
  }

  .config-link:hover {
    color: #1d4ed8;
  }

  .error {
    padding: 6px 10px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 5px;
    color: #dc2626;
    font-size: 12px;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 4px;
  }

  .cancel-btn {
    padding: 7px 14px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    color: #374151;
    font-size: 13px;
    cursor: pointer;
  }
  .cancel-btn:hover:not(:disabled) {
    background: #f3f4f6;
  }
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    padding: 7px 16px;
    background: #3b82f6;
    border: none;
    border-radius: 5px;
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s;
  }
  .submit-btn:hover:not(:disabled) {
    background: #2563eb;
  }
  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
