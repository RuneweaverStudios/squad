import html2canvas from 'html2canvas';

export async function captureViewport(): Promise<string> {
  const canvas = await html2canvas(document.body, {
    width: window.innerWidth,
    height: window.innerHeight,
    x: window.scrollX,
    y: window.scrollY,
    useCORS: true,
    allowTaint: true,
    logging: false,
    ignoreElements: (el) => {
      // Ignore our own widget elements
      return el.tagName === 'JAT-FEEDBACK' || el.id?.startsWith('jat-feedback-');
    },
  });

  // Compress to JPEG for smaller payload
  return canvas.toDataURL('image/jpeg', 0.8);
}

export async function captureElement(el: Element): Promise<string> {
  const canvas = await html2canvas(el as HTMLElement, {
    useCORS: true,
    allowTaint: true,
    logging: false,
    ignoreElements: (ignore) => {
      return ignore.tagName === 'JAT-FEEDBACK' || ignore.id?.startsWith('jat-feedback-');
    },
  });

  return canvas.toDataURL('image/jpeg', 0.85);
}
