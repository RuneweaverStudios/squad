export function getXPath(element: Element): string {
  if (element.id !== '') {
    return 'id("' + element.id + '")';
  }
  if (element === document.body) {
    return element.tagName;
  }

  let ix = 0;
  const siblings = element.parentNode?.childNodes || [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return getXPath(element.parentElement!) + '/' + element.tagName + '[' + (ix + 1) + ']';
    }
    if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) {
      ix++;
    }
  }
  return '';
}

export function generateSelector(element: Element): string {
  if (element.id) {
    return '#' + CSS.escape(element.id);
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = '#' + CSS.escape(current.id);
      parts.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.split(/\s+/).filter(cls =>
        cls &&
        !cls.match(/^(ng-|v-|svelte-|css-|_|js-|is-|has-)/) &&
        !cls.match(/^\d/) &&
        cls.length > 1
      );
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
      }
    }

    const dataAttrs = ['data-testid', 'data-id', 'data-name', 'name', 'role', 'aria-label'];
    for (const attr of dataAttrs) {
      const value = current.getAttribute(attr);
      if (value) {
        selector += `[${attr}="${CSS.escape(value)}"]`;
        break;
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);

    const testSelector = parts.join(' > ');
    try {
      if (document.querySelectorAll(testSelector).length === 1) {
        break;
      }
    } catch {
      // Invalid selector, continue building
    }

    current = current.parentElement;
  }

  const fullSelector = parts.join(' > ');
  try {
    if (document.querySelectorAll(fullSelector).length === 1) {
      return fullSelector;
    }
  } catch {
    // Fall through to fallback
  }

  return generateFallbackSelector(element);
}

function generateFallbackSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    const parentEl = current.parentElement;
    if (parentEl) {
      const index = Array.from(parentEl.children).indexOf(current) + 1;
      path.unshift(`*:nth-child(${index})`);
      current = parentEl;
    } else {
      break;
    }
  }

  return 'body > ' + path.join(' > ');
}
