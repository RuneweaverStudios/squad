import { getXPath, generateSelector } from './selectorGenerator';
import type { ElementData } from './types';

let isActive = false;
let originalCursor = '';
let overlay: HTMLElement | null = null;
let tooltip: HTMLElement | null = null;
let onSelect: ((data: ElementData) => void) | null = null;

function createOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'squad-feedback-picker-overlay';
  el.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(59, 130, 246, 0.1);
    z-index: 2147483645;
    pointer-events: none;
    border: 2px solid #3b82f6;
    box-sizing: border-box;
    transition: all 0.1s ease;
  `;
  document.body.appendChild(el);
  return el;
}

function showTooltip() {
  const el = document.createElement('div');
  el.id = 'squad-feedback-picker-tooltip';
  el.innerHTML = 'Click an element to select it &bull; Press <strong>ESC</strong> to cancel';
  el.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    z-index: 2147483646;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  `;
  document.body.appendChild(el);
  return el;
}

function handleHover(event: MouseEvent) {
  if (!isActive || !overlay) return;
  const target = event.target as HTMLElement;
  if (target === overlay || target.id === 'squad-feedback-picker-tooltip') return;

  const rect = target.getBoundingClientRect();
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}

function handleClick(event: MouseEvent) {
  if (!isActive) return;

  event.preventDefault();
  event.stopPropagation();

  const target = event.target as HTMLElement;
  const rect = target.getBoundingClientRect();

  stopElementPicker();

  const elementData: ElementData = {
    tagName: target.tagName,
    className: typeof target.className === 'string' ? target.className : '',
    id: target.id,
    textContent: target.textContent?.substring(0, 100) || '',
    attributes: Array.from(target.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {} as Record<string, string>),
    xpath: getXPath(target),
    selector: generateSelector(target),
    boundingRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
    },
    screenshot: null,
    timestamp: new Date().toISOString(),
    url: window.location.href,
  };

  onSelect?.(elementData);
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    stopElementPicker();
  }
}

export function startElementPicker(callback: (data: ElementData) => void) {
  if (isActive) return;

  isActive = true;
  onSelect = callback;
  originalCursor = document.body.style.cursor;
  document.body.style.cursor = 'crosshair';

  overlay = createOverlay();
  tooltip = showTooltip();

  document.addEventListener('mousemove', handleHover, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleEscape, true);
}

export function stopElementPicker() {
  if (!isActive) return;

  isActive = false;
  onSelect = null;
  document.body.style.cursor = originalCursor;

  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }

  document.removeEventListener('mousemove', handleHover, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleEscape, true);
}

export function isElementPickerActive(): boolean {
  return isActive;
}
