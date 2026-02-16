// JAT API client for JAT Browser Extension
// Submits bug reports directly to the JAT IDE API instead of Supabase.
// Settings stored in chrome.storage.local.

import { storage } from './browser-compat'

export interface JatSettings {
  jatUrl: string
}

export interface FeedbackReport {
  title: string
  description: string
  type: 'bug' | 'enhancement' | 'other'
  priority: 'low' | 'medium' | 'high' | 'critical'
  page_url: string
  user_agent: string
  console_logs: unknown[] | null
  selected_elements: unknown[] | null
  screenshot_urls: string[] | null
  metadata: Record<string, unknown> | null
}

// Legacy interface kept for backward compatibility during migration
export interface SupabaseSettings {
  supabaseUrl: string
  supabaseAnonKey: string
}

const DEFAULT_JAT_URL = 'http://localhost:3333'

/**
 * Load JAT settings from chrome.storage.local
 */
export async function getSettings(): Promise<JatSettings | null> {
  try {
    const result = await storage.local.get(['jatUrl'])
    if (result.jatUrl) {
      return { jatUrl: result.jatUrl as string }
    }
    // Check for legacy Supabase settings - treat as not configured for JAT
    return null
  } catch {
    return null
  }
}

/**
 * Save JAT settings to chrome.storage.local
 */
export async function saveSettings(settings: JatSettings): Promise<void> {
  // Clear old Supabase settings if they exist
  try {
    await storage.local.remove(['supabaseUrl', 'supabaseAnonKey'])
  } catch {
    // ignore
  }
  await storage.local.set({ jatUrl: settings.jatUrl })
}

/**
 * Clear stored settings
 */
export async function clearSettings(): Promise<void> {
  await storage.local.remove(['jatUrl', 'supabaseUrl', 'supabaseAnonKey'])
}

/**
 * Check if JAT is configured
 */
export async function isConfigured(): Promise<boolean> {
  const settings = await getSettings()
  return settings !== null
}

/**
 * Test connection to JAT IDE by hitting the health check endpoint.
 * Returns { ok: true } or { ok: false, error: string }
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const settings = await getSettings()
    if (!settings) {
      return { ok: false, error: 'JAT IDE URL not configured' }
    }

    const url = settings.jatUrl.replace(/\/+$/, '')
    const response = await fetch(`${url}/api/extension/report`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      return { ok: false, error: `JAT IDE returned status ${response.status}` }
    }

    const data = await response.json()
    if (data.status === 'ok') {
      return { ok: true }
    }

    return { ok: false, error: 'Unexpected response from JAT IDE' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return { ok: false, error: 'Cannot reach JAT IDE. Is it running? Check the URL.' }
    }
    return { ok: false, error: message }
  }
}

/**
 * Submit a feedback report to JAT IDE.
 * Sends screenshots as base64 data URLs - the IDE saves them to disk.
 */
export async function submitFeedback(
  report: FeedbackReport,
  screenshots: string[],
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const settings = await getSettings()
    if (!settings) {
      return { ok: false, error: 'JAT IDE URL not configured. Open Settings to set it up.' }
    }

    const url = settings.jatUrl.replace(/\/+$/, '')
    const response = await fetch(`${url}/api/extension/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: report.title,
        description: report.description,
        type: report.type,
        priority: report.priority,
        page_url: report.page_url,
        user_agent: report.user_agent,
        console_logs: report.console_logs,
        selected_elements: report.selected_elements,
        screenshots: screenshots, // base64 data URLs
        metadata: report.metadata,
      }),
    })

    const data = await response.json()

    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || `Server returned ${response.status}` }
    }

    return { ok: true, id: data.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed'
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return { ok: false, error: 'Cannot reach JAT IDE. Is it running? Check the URL in Settings.' }
    }
    return { ok: false, error: message }
  }
}

/**
 * Get the default JAT URL
 */
export function getDefaultUrl(): string {
  return DEFAULT_JAT_URL
}
