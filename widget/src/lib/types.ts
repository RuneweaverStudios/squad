export interface ConsoleLogEntry {
  type: 'log' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  message: string;
  timestamp: string;
  timestampMs: number;
  url: string;
  stackTrace?: string;
  lineNumber?: number;
  columnNumber?: number;
  fileName?: string;
}

export interface ElementData {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  attributes: Record<string, string>;
  xpath: string;
  selector: string;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
  screenshot: string | null;
  timestamp: string;
  url: string;
}

export interface FeedbackReport {
  title: string;
  description: string;
  type: 'bug' | 'enhancement' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  page_url: string;
  user_agent: string;
  console_logs: ConsoleLogEntry[] | null;
  selected_elements: ElementData[] | null;
  screenshots: string[] | null;
  metadata: Record<string, unknown> | null;
}

export interface WidgetConfig {
  endpoint: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme: 'light' | 'dark' | 'auto';
  buttonColor: string;
  maxScreenshots: number;
  maxConsoleLogs: number;
  captureConsole: boolean;
}

export const DEFAULT_CONFIG: WidgetConfig = {
  endpoint: '',
  position: 'bottom-right',
  theme: 'dark',
  buttonColor: '#3b82f6',
  maxScreenshots: 5,
  maxConsoleLogs: 50,
  captureConsole: true,
};
