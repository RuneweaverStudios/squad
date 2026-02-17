import type { FeedbackReport } from './types';

export async function submitReport(endpoint: string, report: FeedbackReport): Promise<{ ok: boolean; id?: string; error?: string }> {
  const url = `${endpoint.replace(/\/$/, '')}/api/feedback/report`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, error: data.error || `HTTP ${response.status}` };
  }

  return { ok: true, id: data.id };
}

export async function healthCheck(endpoint: string): Promise<boolean> {
  try {
    const url = `${endpoint.replace(/\/$/, '')}/api/feedback/report`;
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
