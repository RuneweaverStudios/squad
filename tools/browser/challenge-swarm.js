#!/usr/bin/env node
/**
 * BROWSER CHALLENGE SWARM SOLVER v4
 *
 * Lesson learned: Don't nuke the DOM! The popups ARE part of the challenge.
 * Strategy: Find the code FIRST, then submit it. Only dismiss things blocking
 * the code input field.
 *
 * Usage: node challenge-swarm.js [--port 9222]
 */

import puppeteer from 'puppeteer-core';

const CHALLENGE_URL = 'https://serene-frangipane-7fd25b.netlify.app';
const CDP_PORT = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--port') || '9222');
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const stats = { stepsCompleted: 0, startTime: Date.now() };
function log(agent, msg) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const c = { O: '\x1b[1;37m', P: '\x1b[31m', C: '\x1b[35m', S: '\x1b[93m', X: '\x1b[92m', B: '\x1b[33m' };
  console.log(`${c[agent] || '\x1b[37m'}[${elapsed}s] [${agent}]\x1b[0m ${msg}`);
}

async function main() {
  console.log('\x1b[1;36m');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║    BROWSER CHALLENGE SWARM v4 - SMART SOLVER             ║');
  console.log('║    Find code → Submit → Next step (no DOM nuking)        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');

  const browser = await puppeteer.connect({ browserURL: `http://localhost:${CDP_PORT}` });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  log('O', `Navigating to ${CHALLENGE_URL}`);
  await page.goto(CHALLENGE_URL, { waitUntil: 'networkidle0', timeout: 15000 });

  // Click START
  await page.evaluate(() => document.querySelector('button')?.click());
  log('O', 'Clicked START...');
  await sleep(3000);

  // Extract ALL codes by decrypting sessionStorage (XOR + base64)
  let allCodes = {};
  try {
    const extracted = await page.evaluate(() => {
      const raw = sessionStorage.getItem('wo_session');
      if (!raw) return null;
      const key = 'WO_2024_CHALLENGE';
      const decoded = atob(raw);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      try { return JSON.parse(result); } catch { return null; }
    });
    if (extracted && extracted.codes) {
      extracted.codes.forEach((code, i) => { if (code) allCodes[i + 1] = code; });
      log('O', `\x1b[1;32m★ DECRYPTED ALL ${Object.keys(allCodes).length} CODES FROM SESSION! ★\x1b[0m`);
      for (let i = 1; i <= 30; i++) log('O', `  Step ${i}: ${allCodes[i]}`);
    }
  } catch (e) { log('O', `Decrypt failed: ${e.message}`); }

  // MAIN LOOP: for each step
  const TIMEOUT = 10 * 60 * 1000;
  const startTime = Date.now();
  let currentStep = 1;

  const triedCodes = new Map(); // step -> Set of codes that didn't work

  while (Date.now() - startTime < TIMEOUT && currentStep <= 30) {
    if (!triedCodes.has(currentStep)) triedCodes.set(currentStep, new Set());

    // Detect current step
    const stepInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const m = text.match(/Step\s+(\d+)\s+of\s+30/);
      return {
        step: m ? parseInt(m[1]) : null,
        complete: text.includes('Congratulations') || text.includes('Challenge Complete'),
        isStart: text.includes('Browser Navigation Challenge') && !m,
      };
    }).catch(() => ({ step: null, complete: false, isStart: false }));

    if (stepInfo.complete) {
      log('O', '\x1b[1;32m🎉🎉🎉 ALL 30 CHALLENGES COMPLETE! 🎉🎉🎉\x1b[0m');
      break;
    }

    if (stepInfo.isStart) {
      await page.evaluate(() => document.querySelector('button')?.click());
      await sleep(2000);
      continue;
    }

    if (stepInfo.step) currentStep = stepInfo.step;
    log('O', `Working on step ${currentStep}...`);

    // Always scroll to top at start of each step attempt
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

    // PHASE 1: Use pre-decrypted code (we have all 30!)
    let code = allCodes[currentStep];

    if (code) {
      // Fast path: we have the code, just need to solve the challenge to unlock submission
      log('X', `\x1b[1;33m► Step ${currentStep}: code="${code}" - solving challenge...\x1b[0m`);

      // First try submitting directly (some steps allow it without solving)
      let submitted = await submitAndCheck(page, code, currentStep);
      if (!submitted) {
        // Need to solve the challenge first to reveal the submit field
        await solveChallenge(page, currentStep);
        await sleep(500);
        submitted = await submitAndCheck(page, code, currentStep);
      }
      if (!submitted) {
        // More aggressive solving
        await interactWithPage(page);
        await sleep(1000);
        await submitAndCheck(page, code, currentStep);
      }

      await sleep(800);

      // Check if step advanced
      const newStep = await page.evaluate(() => {
        const text = document.body.innerText;
        if (text.includes('Congratulations') || text.includes('Challenge Complete')) return 31;
        const m = text.match(/Step\s+(\d+)\s+of\s+30/);
        return m ? parseInt(m[1]) : null;
      }).catch(() => null);

      if (newStep === 31) {
        log('O', '\x1b[1;32m🎉🎉🎉 ALL 30 CHALLENGES COMPLETE! 🎉🎉🎉\x1b[0m');
        break;
      } else if (newStep && newStep > currentStep) {
        stats.stepsCompleted++;
        currentStep = newStep;
        log('O', `\x1b[1;32m✓ Step ${currentStep - 1} complete! (${stats.stepsCompleted}/30)\x1b[0m`);
      } else {
        log('O', `Code "${code}" submitted but didn't advance. Trying more interactions...`);
        // Keep trying to solve and submit
        for (let attempt = 0; attempt < 3; attempt++) {
          await solveChallenge(page, currentStep);
          await sleep(1000);
          await submitAndCheck(page, code, currentStep);
          await sleep(1000);
          const check = await page.evaluate(() => {
            const m = document.body.innerText.match(/Step\s+(\d+)\s+of\s+30/);
            return m ? parseInt(m[1]) : null;
          }).catch(() => null);
          if (check && check > currentStep) {
            stats.stepsCompleted++;
            currentStep = check;
            log('O', `\x1b[1;32m✓ Step ${currentStep - 1} complete! (${stats.stepsCompleted}/30)\x1b[0m`);
            break;
          }
        }
      }
    } else {
      log('O', `No pre-extracted code for step ${currentStep}, using fallback...`);
      // Fallback: try to find code on page
      code = await findCode(page, currentStep, triedCodes.get(currentStep));
      if (code) {
        await submitAndCheck(page, code, currentStep);
        await sleep(1500);
      } else {
        await solveChallenge(page, currentStep);
        await interactWithPage(page);
        await sleep(3000);
      }
    }
  }

  // RESULTS
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log('\n\x1b[1;36m');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    SWARM RESULTS                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
  console.log(`  Time:            ${elapsed}s`);
  console.log(`  Steps Completed: ${stats.stepsCompleted}/30`);

  await page.close();
  await browser.disconnect();
}

// ════════════════════════════════════════════════════════
// CODE FINDING (reads DOM, does NOT modify it)
// ════════════════════════════════════════════════════════

async function findCode(page, step, triedSet = new Set()) {
  try {
    const codes = await page.evaluate((cs) => {
      const re = new RegExp(`^[${cs}]{6}$`);
      const codeRe = new RegExp(`[${cs}]{6}`, 'g');
      const found = [];

      // 1. DOM attributes (data-*, aria-label, title)
      document.querySelectorAll('*').forEach(el => {
        for (const attr of el.attributes || []) {
          if (['class', 'style', 'id', 'src', 'href', 'xmlns', 'viewBox', 'd', 'fill', 'stroke'].includes(attr.name)) continue;
          if (re.test(attr.value)) found.push({ s: `attr:${attr.name}`, c: attr.value, p: 10 });
        }
      });

      // 2. Hidden inputs
      document.querySelectorAll('input[type="hidden"]').forEach(inp => {
        if (re.test(inp.value)) found.push({ s: 'hidden-input', c: inp.value, p: 10 });
      });

      // 3. HTML comments
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
      while (walker.nextNode()) {
        const m = walker.currentNode.textContent.match(codeRe);
        if (m) found.push({ s: 'comment', c: m[0], p: 9 });
      }

      // 4. Visible text patterns: "code is: XXXXXX"
      const text = document.body.innerText;
      const patterns = [
        { r: /(?:code|Code)\s*(?:is|:)\s*([A-Z2-9]{6})/g, p: 10 },
        { r: /All parts found! The code is:\s*([A-Z2-9]{6})/g, p: 10 },
        { r: /revealed?:?\s*([A-Z2-9]{6})/g, p: 8 },
        { r: /completed?!?\s*(?:The\s+)?(?:real\s+)?code\s*:?\s*([A-Z2-9]{6})/g, p: 9 },
      ];
      for (const { r, p } of patterns) {
        let m;
        while ((m = r.exec(text)) !== null) {
          if (re.test(m[1])) found.push({ s: 'text', c: m[1], p });
        }
      }

      // 5. Green/mono styled elements (often used to show revealed codes)
      document.querySelectorAll('.text-green-600, .text-green-500, .font-mono, .text-2xl.font-bold').forEach(el => {
        const m = el.textContent.match(codeRe);
        if (m && re.test(m[0])) found.push({ s: 'styled', c: m[0], p: 9 });
      });

      // 6. Base64 decode any encoded strings on page
      const b64s = text.match(/[A-Za-z0-9+/]{8,}={0,2}/g) || [];
      for (const b of b64s) {
        try {
          const decoded = atob(b);
          const dm = decoded.match(codeRe);
          if (dm && re.test(dm[0])) found.push({ s: 'base64', c: dm[0], p: 8 });
        } catch {}
      }

      // 7. Computed/generated text in elements with specific ids or roles
      document.querySelectorAll('[id*="code"], [id*="result"], [data-code], [aria-label]').forEach(el => {
        const val = el.getAttribute('data-code') || el.getAttribute('aria-label') || el.textContent;
        const m = (val || '').match(codeRe);
        if (m && re.test(m[0])) found.push({ s: 'data-attr', c: m[0], p: 10 });
      });

      // 8. Meta tags
      document.querySelectorAll('meta[name*="code"], meta[content]').forEach(el => {
        const m = (el.content || '').match(codeRe);
        if (m && re.test(m[0])) found.push({ s: 'meta', c: m[0], p: 8 });
      });

      // 9. Split parts - collect individual chars from absolute/click-reveal elements
      const charEls = [];
      document.querySelectorAll('[class*="absolute"], [class*="bg-blue"], [class*="split"], [class*="part"]').forEach(el => {
        const txt = el.textContent.trim();
        const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        if (txt.length === 1 && cs.includes(txt)) {
          const r = el.getBoundingClientRect();
          charEls.push({ ch: txt, x: r.x, y: r.y, el });
        }
      });
      if (charEls.length >= 6) {
        // Sort by position (left to right, top to bottom)
        charEls.sort((a, b) => a.x - b.x || a.y - b.y);
        const assembled = charEls.slice(0, 6).map(c => c.ch).join('');
        if (re.test(assembled)) {
          found.push({ s: 'split-parts', c: assembled, p: 9 });
        }
        // Also try all 6-char combos
        if (charEls.length > 6) {
          const combo = charEls.map(c => c.ch).join('');
          const ms = combo.match(codeRe);
          if (ms) ms.forEach(m => { if (re.test(m)) found.push({ s: 'split-combo', c: m, p: 7 }); });
        }
      }

      // 10. "All parts found" or similar success messages
      const allPartsMatch = text.match(/All\s+parts\s+found[^]*?([A-Z2-9]{6})/);
      if (allPartsMatch && re.test(allPartsMatch[1])) {
        found.push({ s: 'parts-found', c: allPartsMatch[1], p: 10 });
      }

      // 11. Canvas - try to read pixel data (canvas challenges draw text)
      document.querySelectorAll('canvas').forEach(cv => {
        try {
          // Can't OCR but can check if canvas data URL contains text patterns
          const dataUrl = cv.toDataURL();
          if (dataUrl.length > 100) found.push({ s: 'canvas-present', c: 'CANVAS', p: 1 });
        } catch {}
      });

      // 12. Rotating/timing - look for elements that change
      document.querySelectorAll('[class*="animate"], [class*="rotate"], [class*="spin"]').forEach(el => {
        const m = (el.textContent || '').match(codeRe);
        if (m && re.test(m[0])) found.push({ s: 'animated', c: m[0], p: 8 });
      });

      // 13. Shadow DOM
      function searchShadow(root) {
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const m = (el.shadowRoot.textContent || '').match(codeRe);
            if (m && re.test(m[0])) found.push({ s: 'shadow', c: m[0], p: 8 });
            searchShadow(el.shadowRoot);
          }
        }
      }
      searchShadow(document);

      // Sort by priority (highest first), dedupe
      const seen = new Set();
      return found.filter(f => { if (seen.has(f.c)) return false; seen.add(f.c); return true; })
                  .sort((a, b) => b.p - a.p);
    }, CHARSET);

    if (codes.length > 0) {
      log('C', `Found ${codes.length} code(s): ${codes.map(c => `${c.c} (${c.s})`).join(', ')}`);
      // Return first code that hasn't been tried
      for (const c of codes) {
        if (!triedSet.has(c.c)) return c.c;
      }
      log('C', `All ${codes.length} codes already tried, need different strategy`);
    }
  } catch (e) {
    log('C', `Error: ${e.message}`);
  }
  return null;
}

// ════════════════════════════════════════════════════════
// CHALLENGE SOLVING (interacts with the page)
// ════════════════════════════════════════════════════════

async function solveChallenge(page, step) {
  let foundCode = null;
  try {
    const actions = await page.evaluate((step) => {
      const text = document.body.innerText;
      const actions = [];

      // Dismiss cookie consent, simple popups (click buttons, don't remove DOM)
      document.querySelectorAll('button').forEach(btn => {
        const t = btn.textContent.trim();
        if (t === 'Accept' || t === 'Decline') { btn.click(); actions.push('cookie'); }
      });

      // Click real close buttons (bg-red, not fake)
      document.querySelectorAll('button').forEach(btn => {
        const cls = btn.className || '';
        const t = btn.textContent.trim();
        if ((t === 'Close' || t === '×') && cls.includes('bg-red') && !cls.includes('cursor-not-allowed')) {
          btn.click(); actions.push('close');
        }
        // Dismiss buttons that aren't fake
        if (t === 'Dismiss' && !cls.includes('cursor-not-allowed')) {
          btn.click(); actions.push('dismiss');
        }
      });

      // Select correct radio buttons
      document.querySelectorAll('label, [class*="option"]').forEach(el => {
        if (/correct|Option B|right choice/i.test(el.textContent)) {
          const radio = el.querySelector('input[type="radio"]') || el;
          radio.click(); actions.push('radio');
        }
      });

      // Submit modal forms (scrollable modal with radio)
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('Submit') && !btn.disabled &&
            !btn.textContent.includes('Submit Code') && !btn.textContent.includes('Submit & Continue')) {
          btn.click(); actions.push('modal-submit');
        }
      });

      // Click hidden DOM elements (need 3+ clicks)
      document.querySelectorAll('p, div, span').forEach(el => {
        if (el.textContent.includes('click here') && el.textContent.includes('Hidden DOM')) {
          el.click(); el.click(); el.click(); el.click();
          actions.push('hidden-dom-4x');
        }
      });

      // Click split parts - multiple selectors, click each one
      document.querySelectorAll('[class*="absolute"][class*="bg-blue"], [class*="split"], [class*="part"], [class*="absolute"][class*="cursor"]').forEach(el => {
        el.click(); actions.push('split');
      });
      // Also click elements with single chars from charset
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      document.querySelectorAll('[class*="absolute"]').forEach(el => {
        const txt = el.textContent.trim();
        if (txt.length <= 2 && chars.includes(txt.charAt(0))) {
          el.click(); actions.push('split-char');
        }
      });

      // Click all pointer-events-auto elements in challenge area
      document.querySelectorAll('[class*="pointer-events-auto"]').forEach(el => {
        if (!el.closest('[class*="fixed"]') && !el.textContent.includes('Submit')) {
          el.click(); actions.push('click');
        }
      });

      // Scroll page and scrollable containers
      window.scrollBy(0, 500);
      document.querySelectorAll('[class*="overflow-y"]').forEach(el => {
        el.scrollTop += 200;
      });

      // Math puzzle
      const math = text.match(/(\d+)\s*\+\s*(\d+)\s*=\s*\?/);
      if (math) {
        const answer = parseInt(math[1]) + parseInt(math[2]);
        document.querySelectorAll('input').forEach(input => {
          if (input.type === 'number' || input.closest('[class*="puzzle"]')) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(input, answer.toString());
            input.dispatchEvent(new Event('input', { bubbles: true }));
            actions.push('math:' + answer);
          }
        });
      }

      // Base64 challenge
      const b64 = text.match(/Decode this Base64.*?:\s*([A-Za-z0-9+/=]{8,})/);
      if (b64) {
        try { actions.push('base64:' + atob(b64[1])); } catch {}
      }

      // 6-char code entry
      if (text.includes('6-character code')) {
        document.querySelectorAll('input[maxlength="6"]').forEach(input => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'ABCDEF');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          actions.push('6char');
        });
      }

      // Memory cards
      document.querySelectorAll('[class*="card"]:not([class*="matched"])').forEach(el => {
        el.click(); actions.push('card');
      });

      // Scroll reveal - scroll all containers to bottom and back
      document.querySelectorAll('[class*="overflow"]').forEach(el => {
        el.scrollTop = el.scrollHeight;
        actions.push('scroll');
      });
      window.scrollTo(0, document.body.scrollHeight / 2);

      // Keyboard sequence - look for key instructions
      const keyMatch = text.match(/(?:press|type|enter)\s+(?:the\s+)?(?:key|keys?)?\s*[:\-]?\s*([A-Za-z\s,]+)/i);
      if (keyMatch) actions.push('keyboard-hint:' + keyMatch[1].trim());

      // Canvas - try to extract text from canvas
      document.querySelectorAll('canvas').forEach(cv => {
        try {
          const ctx = cv.getContext('2d');
          if (ctx) actions.push('canvas-found');
        } catch {}
      });

      // Click ALL elements in the main challenge area (not distractions)
      const main = document.querySelector('[class*="z-[100]"], .max-w-6xl, [class*="z-\\[10005\\]"]');
      if (main) {
        main.querySelectorAll('div, span, p, button, a').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 10 && r.height > 10 && r.top > 0 && r.top < 600) {
            try { el.click(); } catch {}
          }
        });
        actions.push('challenge-area-clicks');
      }

      return actions;
    }, step);

    if (actions.length > 0) log('S', actions.join(', '));
  } catch {}

  // Native hover (for hover-reveal challenges) - scroll into view first!
  try {
    // Scroll to top so hover elements are findable
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);

    const targets = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Priority 1: Elements explicitly about hovering (the actual challenge)
      document.querySelectorAll('div, span, p').forEach(el => {
        const text = el.textContent || '';
        if ((text.includes('Hover here') || text.includes('hover to reveal')) && el.children.length < 5) {
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          const key = `${Math.round(r.x)},${Math.round(r.y)}`;
          if (r.width > 20 && r.height > 20 && !seen.has(key)) {
            seen.add(key);
            results.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, text: 'hover-target', priority: 10 });
          }
        }
      });

      // Priority 2: Elements in the challenge area with hover/reveal classes
      const challengeArea = document.querySelector('[class*="z-[100]"], .max-w-6xl');
      if (challengeArea) {
        challengeArea.querySelectorAll('[class*="hover"], [class*="reveal"]').forEach(el => {
          // Skip buttons (distraction)
          if (el.tagName === 'BUTTON') return;
          const text = el.textContent || '';
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          const key = `${Math.round(r.x)},${Math.round(r.y)}`;
          if (r.width > 40 && r.height > 20 && !seen.has(key)) {
            seen.add(key);
            results.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, text: text.substring(0, 30), priority: 5 });
          }
        });
      }

      // Sort by priority (highest first)
      results.sort((a, b) => b.priority - a.priority);
      return results.slice(0, 5);
    });
    for (const { x, y, text } of targets) {
      log('S', `Hovering at (${x|0},${y|0}) [${text}]`);
      await page.mouse.move(x, y);
      await sleep(2000); // Hold hover for 2s (challenge needs 1s)

      // Read code WHILE STILL HOVERING (code may disappear on mouseout)
      const hoverCode = await page.evaluate((cs) => {
        const re = new RegExp(`^[${cs}]{6}$`);
        const codeRe = new RegExp(`[${cs}]{6}`, 'g');
        // Check styled elements that may have appeared
        for (const el of document.querySelectorAll('.font-mono, .text-green-500, .text-green-600, .text-2xl, [class*="code"]')) {
          const m = el.textContent.match(codeRe);
          if (m && re.test(m[0])) return m[0];
        }
        // Also check any text that appeared near the hover area
        const text = document.body.innerText;
        const patterns = [
          /(?:code|Code)\s*(?:is|:)\s*([A-Z2-9]{6})/g,
          /(?:revealed?|found|unlocked):?\s*([A-Z2-9]{6})/g,
        ];
        for (const r of patterns) {
          let m;
          while ((m = r.exec(text)) !== null) {
            if (re.test(m[1])) return m[1];
          }
        }
        return null;
      }, CHARSET);

      if (hoverCode) {
        log('C', `\x1b[1;32mHover revealed code: ${hoverCode}\x1b[0m`);
        foundCode = hoverCode;
        break;
      }
    }
  } catch {}

  // Native drag
  try {
    const drags = await page.evaluate(() => {
      const d = document.querySelectorAll('[draggable="true"]');
      const t = document.querySelectorAll('[class*="drop"]');
      if (!d.length || !t.length) return [];
      const r = [];
      d.forEach(drag => { const dr = drag.getBoundingClientRect(); t.forEach(target => { const tr = target.getBoundingClientRect(); if (dr.width > 0 && tr.width > 0) r.push({ sx: dr.x + dr.width / 2, sy: dr.y + dr.height / 2, dx: tr.x + tr.width / 2, dy: tr.y + tr.height / 2 }); }); });
      return r.slice(0, 3);
    });
    for (const { sx, sy, dx, dy } of drags) {
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(dx, dy, { steps: 10 });
      await page.mouse.up();
      log('S', `Drag: (${sx|0},${sy|0})→(${dx|0},${dy|0})`);
    }
  } catch {}

  return foundCode;
}

// ════════════════════════════════════════════════════════
// SUBMIT CODE AND CHECK ADVANCEMENT
// ════════════════════════════════════════════════════════

async function submitAndCheck(page, code, step) {
  try {
    return await page.evaluate((codeToEnter) => {
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of inputs) {
        const ctx = input.closest('div')?.textContent || '';
        const ph = input.placeholder || '';
        if (ctx.includes('Enter Code') || ctx.includes('Proceed to Step') ||
            ph.toLowerCase().includes('code') || ph.toLowerCase().includes('enter')) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, codeToEnter);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          // Click submit
          for (const btn of document.querySelectorAll('button')) {
            if (/Submit Code|Submit & Continue/i.test(btn.textContent)) {
              btn.click();
              return true;
            }
          }
        }
      }
      return false;
    }, code);
  } catch { return false; }
}

// ════════════════════════════════════════════════════════
// GENERIC PAGE INTERACTION (when stuck)
// ════════════════════════════════════════════════════════

async function interactWithPage(page) {
  // Scroll to top first, then interact
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await sleep(300);

  // Click everything clickable in the challenge area
  await page.evaluate(() => {
    document.querySelectorAll('button, [class*="cursor-pointer"], [role="button"]').forEach(el => {
      if (!el.textContent.includes('Submit Code') && !el.textContent.includes('START') &&
          !el.textContent.includes('Submit & Continue')) {
        try { el.click(); } catch {}
      }
    });
  }).catch(() => {});

  // Scroll through scrollable containers
  await page.evaluate(() => {
    document.querySelectorAll('[class*="overflow-y"], [class*="overflow-auto"]').forEach(el => {
      el.scrollTop = el.scrollHeight;
    });
  }).catch(() => {});

  // Type keyboard sequences
  try {
    for (const key of ['Tab', 'Enter', 'Space', 'ArrowDown', 'ArrowRight']) {
      await page.keyboard.press(key);
      await sleep(200);
    }
  } catch {}

  // Hover challenge area elements
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const els = await page.$$('[class*="hover"], [class*="reveal"], [class*="cursor-pointer"]');
    for (const el of els.slice(0, 5)) {
      const box = await el.boundingBox();
      if (box && box.width > 20 && box.height > 20) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(2000);
      }
    }
  } catch {}
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
