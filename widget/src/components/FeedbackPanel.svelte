<script lang="ts">
  import type { ConsoleLogEntry, ElementData, FeedbackReport } from '../lib/types';
  import { submitReport } from '../lib/api';
  import { enqueue } from '../lib/queue';
  import { captureViewport } from '../lib/screenshot';
  import { startElementPicker } from '../lib/elementPicker';
  import { getCapturedLogs } from '../lib/consoleCapture';
  import ScreenshotPreview from './ScreenshotPreview.svelte';
  import ConsoleLogList from './ConsoleLogList.svelte';
  import StatusToast from './StatusToast.svelte';

  let {
    endpoint,
    onclose,
  }: {
    endpoint: string;
    onclose: () => void;
  } = $props();

  let title = $state('');
  let description = $state('');
  let type = $state<'bug' | 'enhancement' | 'other'>('bug');
  let priority = $state<'low' | 'medium' | 'high' | 'critical'>('medium');

  let screenshots = $state<string[]>([]);
  let selectedElements = $state<ElementData[]>([]);
  let consoleLogs = $state<ConsoleLogEntry[]>([]);

  let submitting = $state(false);
  let capturing = $state(false);

  let toastMessage = $state('');
  let toastType = $state<'success' | 'error'>('success');
  let toastVisible = $state(false);

  function showToast(message: string, type: 'success' | 'error') {
    toastMessage = message;
    toastType = type;
    toastVisible = true;
    setTimeout(() => { toastVisible = false; }, 3000);
  }

  async function handleCapture() {
    capturing = true;
    try {
      const dataUrl = await captureViewport();
      screenshots = [...screenshots, dataUrl];
    } catch (err) {
      showToast('Screenshot failed', 'error');
    } finally {
      capturing = false;
    }
  }

  function handleRemoveScreenshot(index: number) {
    screenshots = screenshots.filter((_, i) => i !== index);
  }

  function handlePickElement() {
    startElementPicker((data) => {
      selectedElements = [...selectedElements, data];
    });
  }

  function refreshLogs() {
    consoleLogs = getCapturedLogs();
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    submitting = true;

    // Refresh logs right before submit
    refreshLogs();

    const report: FeedbackReport = {
      title: title.trim(),
      description: description.trim(),
      type,
      priority,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      console_logs: consoleLogs.length > 0 ? consoleLogs : null,
      selected_elements: selectedElements.length > 0 ? selectedElements : null,
      screenshots: screenshots.length > 0 ? screenshots : null,
      metadata: null,
    };

    try {
      const result = await submitReport(endpoint, report);
      if (result.ok) {
        showToast(`Report submitted (${result.id})`, 'success');
        resetForm();
        setTimeout(onclose, 1200);
      } else {
        // Queue for retry
        enqueue(endpoint, report);
        showToast('Queued for retry (endpoint unreachable)', 'error');
      }
    } catch {
      enqueue(endpoint, report);
      showToast('Queued for retry (endpoint unreachable)', 'error');
    } finally {
      submitting = false;
    }
  }

  function resetForm() {
    title = '';
    description = '';
    type = 'bug';
    priority = 'medium';
    screenshots = [];
    selectedElements = [];
    consoleLogs = [];
  }

  // Grab initial logs on mount
  $effect(() => {
    refreshLogs();
  });

  const typeOptions = [
    { value: 'bug', label: 'Bug' },
    { value: 'enhancement', label: 'Enhancement' },
    { value: 'other', label: 'Other' },
  ] as const;

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ] as const;

  function attachmentCount(): number {
    return screenshots.length + selectedElements.length + (consoleLogs.length > 0 ? 1 : 0);
  }
</script>

<div class="panel">
  <div class="panel-header">
    <h2>Send Feedback</h2>
    <button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
  </div>

  <form class="panel-body" onsubmit={handleSubmit}>
    <div class="field">
      <label for="jat-fb-title">Title <span class="req">*</span></label>
      <input id="jat-fb-title" type="text" bind:value={title} placeholder="Brief description" required disabled={submitting} />
    </div>

    <div class="field">
      <label for="jat-fb-desc">Description</label>
      <textarea id="jat-fb-desc" bind:value={description} placeholder="Steps to reproduce, expected vs actual..." rows="3" disabled={submitting}></textarea>
    </div>

    <div class="field-row">
      <div class="field half">
        <label for="jat-fb-type">Type</label>
        <select id="jat-fb-type" bind:value={type} disabled={submitting}>
          {#each typeOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      <div class="field half">
        <label for="jat-fb-priority">Priority</label>
        <select id="jat-fb-priority" bind:value={priority} disabled={submitting}>
          {#each priorityOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="tools">
      <ScreenshotPreview {screenshots} {capturing} oncapture={handleCapture} onremove={handleRemoveScreenshot} />

      <button type="button" class="tool-btn" onclick={handlePickElement}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M7 2L7 22M17 2V22M2 7H22M2 17H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Pick Element
      </button>
    </div>

    {#if selectedElements.length > 0}
      <div class="attach-badge">
        {selectedElements.length} element{selectedElements.length > 1 ? 's' : ''} selected
      </div>
    {/if}

    <ConsoleLogList logs={consoleLogs} />

    {#if attachmentCount() > 0}
      <div class="attach-summary">
        {attachmentCount()} attachment{attachmentCount() > 1 ? 's' : ''} will be included
      </div>
    {/if}

    <div class="actions">
      <button type="button" class="cancel-btn" onclick={onclose} disabled={submitting}>Cancel</button>
      <button type="submit" class="submit-btn" disabled={submitting || !title.trim()}>
        {#if submitting}
          <span class="spinner"></span>
          Submitting...
        {:else}
          Submit
        {/if}
      </button>
    </div>
  </form>

  <StatusToast message={toastMessage} type={toastType} visible={toastVisible} />
</div>

<style>
  .panel {
    width: 380px;
    max-height: 520px;
    background: #111827;
    border: 1px solid #374151;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #1f2937;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #f9fafb;
  }
  .close-btn {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .close-btn:hover { color: #e5e7eb; }

  .panel-body {
    padding: 14px 16px;
    overflow-y: auto;
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
  .half { flex: 1; }

  label {
    font-weight: 600;
    font-size: 12px;
    color: #9ca3af;
  }
  .req { color: #ef4444; }

  input, textarea, select {
    padding: 7px 10px;
    border: 1px solid #374151;
    border-radius: 5px;
    font-size: 13px;
    font-family: inherit;
    color: #e5e7eb;
    background: #1f2937;
    transition: border-color 0.15s;
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  input:disabled, textarea:disabled, select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  textarea {
    resize: vertical;
    min-height: 48px;
  }
  select {
    appearance: auto;
  }

  .tools {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tool-btn {
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
  .tool-btn:hover { background: #374151; }

  .attach-badge {
    padding: 5px 10px;
    background: #1e3a5f;
    border: 1px solid #2563eb40;
    border-radius: 5px;
    font-size: 11px;
    color: #93c5fd;
  }
  .attach-summary {
    font-size: 11px;
    color: #6b7280;
    text-align: center;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 4px;
  }
  .cancel-btn {
    padding: 7px 14px;
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 5px;
    color: #d1d5db;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }
  .cancel-btn:hover:not(:disabled) { background: #374151; }
  .cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }

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
    font-family: inherit;
    transition: background 0.15s;
  }
  .submit-btn:hover:not(:disabled) { background: #2563eb; }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
