#!/usr/bin/env node
/**
 * Extract challenge codes by hooking into React internals
 */
import puppeteer from 'puppeteer-core';

const CDP_PORT = 9222;

async function main() {
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${CDP_PORT}` });
  const pages = await browser.pages();

  // Close old challenge tabs, keep only the most recent one
  const challengePages = pages.filter(p => p.url().includes('serene-frangipane'));
  console.log(`Found ${challengePages.length} challenge pages, closing extras...`);
  for (let i = 0; i < challengePages.length - 1; i++) {
    await challengePages[i].close();
  }

  // Use the remaining challenge page or open a new one
  let page = challengePages[challengePages.length - 1];
  if (!page) {
    page = await browser.newPage();
    await page.goto('https://serene-frangipane-7fd25b.netlify.app', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.querySelector('button')?.click());
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`Using page: ${page.url()}`);

  // Method 1: Walk React fiber tree - only look for Maps with 6-char string values
  console.log('\n=== Method 1: React Fiber Maps ===');
  const maps = await page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return 'no root';
    const containerKey = Object.keys(root).find(k => k.startsWith('__react'));
    if (!containerKey) return 'no react key';

    const container = root[containerKey];
    const codeMaps = [];

    function walk(fiber, depth) {
      if (!fiber || depth > 50) return;
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        for (let i = 0; i < 30 && state; i++) {
          const val = state.memoizedState;
          if (val instanceof Map && val.size > 0) {
            const entries = [];
            val.forEach((v, k) => {
              if (typeof v === 'string') entries.push([k, v]);
            });
            if (entries.length > 0) {
              codeMaps.push({ depth, entries });
            }
          }
          state = state.next;
        }
      }
      walk(fiber.child, depth + 1);
      walk(fiber.sibling, depth + 1);
    }

    walk(container, 0);
    return codeMaps;
  });
  console.log(JSON.stringify(maps, null, 2));

  // Method 2: Monkey-patch Map.get to intercept code lookups
  console.log('\n=== Method 2: Intercept Map.get during validation ===');
  await page.evaluate(() => {
    window.__capturedMapGets = [];
    const origGet = Map.prototype.get;
    Map.prototype.get = function(key) {
      const result = origGet.call(this, key);
      if (result !== undefined) {
        window.__capturedMapGets.push({
          key: String(key),
          value: String(result).substring(0, 50),
          mapSize: this.size,
          time: Date.now()
        });
      }
      return result;
    };
    window.__restoreMapGet = () => { Map.prototype.get = origGet; };
  });

  // Trigger validation by submitting a code
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of inputs) {
      const ctx = (input.closest('div') || document.body).textContent || '';
      if (ctx.includes('Enter Code') || ctx.includes('Proceed') ||
          (input.placeholder || '').toLowerCase().includes('code')) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'AAAAAA');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        for (const btn of document.querySelectorAll('button')) {
          if (/Submit Code|Submit & Continue/i.test(btn.textContent)) {
            btn.click();
            break;
          }
        }
        break;
      }
    }
  });

  await new Promise(r => setTimeout(r, 500));

  const captures = await page.evaluate(() => {
    const results = window.__capturedMapGets || [];
    window.__restoreMapGet?.();
    delete window.__capturedMapGets;
    delete window.__restoreMapGet;
    return results;
  });
  console.log(`Captured ${captures.length} Map.get calls:`);
  console.log(JSON.stringify(captures, null, 2));

  // Method 3: Check sessionStorage raw dump
  console.log('\n=== Method 3: SessionStorage ===');
  const session = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      data[key] = sessionStorage.getItem(key);
    }
    return data;
  });
  for (const [key, val] of Object.entries(session)) {
    console.log(`  ${key}: ${String(val).substring(0, 200)}`);
  }

  // Method 4: Try XOR decrypt of sessionStorage
  console.log('\n=== Method 4: Try XOR decrypt ===');
  const decrypted = await page.evaluate(() => {
    const key = 'WO_2024_CHALLENGE';
    const raw = sessionStorage.getItem('wo_session');
    if (!raw) return 'no wo_session found';

    // Try XOR decrypt
    try {
      let result = '';
      for (let i = 0; i < raw.length; i++) {
        result += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return { raw: raw.substring(0, 100), xorResult: result.substring(0, 500) };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(JSON.stringify(decrypted, null, 2));

  // Method 5: Try base64 decode of sessionStorage
  console.log('\n=== Method 5: Try base64 decode ===');
  const b64 = await page.evaluate(() => {
    const raw = sessionStorage.getItem('wo_session');
    if (!raw) return 'no wo_session';
    try {
      return { b64decoded: atob(raw).substring(0, 500) };
    } catch {
      // Try double: base64 then XOR
      try {
        const decoded = atob(raw);
        const key = 'WO_2024_CHALLENGE';
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
          result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return { b64_then_xor: result.substring(0, 500) };
      } catch (e) {
        return { error: e.message, rawSample: raw.substring(0, 100) };
      }
    }
  });
  console.log(JSON.stringify(b64, null, 2));

  await browser.disconnect();
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
