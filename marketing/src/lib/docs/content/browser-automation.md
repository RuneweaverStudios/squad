# Browser automation

SQUAD includes 12 browser automation tools built on the Chrome DevTools Protocol (CDP). They're Node.js scripts that control Chrome/Chromium for testing, scraping, and verification tasks.

## Getting started

Start Chrome with remote debugging enabled, then connect:

```bash
# Start Chrome with debugging port
google-chrome --remote-debugging-port=9222

# Connect SQUAD tools to the running browser
browser-start.js
```

All subsequent browser commands use the established CDP connection.

## Tools reference

| Tool | Purpose | Example |
|------|---------|---------|
| `browser-start.js` | Connect to Chrome via CDP | `browser-start.js --headless` |
| `browser-nav.js` | Navigate to a URL | `browser-nav.js https://example.com` |
| `browser-eval.js` | Run JavaScript in the page | `browser-eval.js "document.title"` |
| `browser-screenshot.js` | Capture a screenshot | `browser-screenshot.js --output /tmp/page.png` |
| `browser-pick.js` | Click an element by selector | `browser-pick.js --selector "button.submit"` |
| `browser-cookies.js` | Get or set cookies | `browser-cookies.js --set "token=abc123"` |
| `browser-wait.js` | Wait for a condition | `browser-wait.js --text "Loading complete"` |
| `browser-console.js` | Capture console output | `browser-console.js` |
| `browser-network.js` | Monitor network requests | `browser-network.js` |
| `browser-snapshot.js` | Capture full DOM snapshot | `browser-snapshot.js` |
| `browser-hn-scraper.js` | Hacker News scraper demo | `browser-hn-scraper.js` |

## Common workflows

**Navigate and screenshot:**

```bash
browser-nav.js https://myapp.localhost:3000/login
browser-screenshot.js --output /tmp/login-page.png
```

**Fill a form and submit:**

```bash
browser-eval.js "document.querySelector('#email').value = 'test@example.com'"
browser-eval.js "document.querySelector('#password').value = 'secret123'"
browser-pick.js --selector "button[type='submit']"
```

**Wait for dynamic content:**

```bash
browser-nav.js https://myapp.localhost:3000/dashboard
browser-wait.js --text "Welcome back"
browser-screenshot.js --output /tmp/dashboard.png
```

## browser-eval multi-statement support

The `browser-eval.js` tool supports multiple JavaScript statements. Use `return` to get a value back:

```bash
# Single expression
browser-eval.js "document.title"

# Multiple statements with return
browser-eval.js "const rows = document.querySelectorAll('tr'); return rows.length"

# Complex logic
browser-eval.js "const items = [...document.querySelectorAll('.item')]; return items.map(i => i.textContent)"
```

## browser-wait conditions

The wait tool supports several condition types:

```bash
# Wait for text to appear on page
browser-wait.js --text "Dashboard loaded"

# Wait for a CSS selector to exist
browser-wait.js --selector ".data-table tbody tr"

# Wait for URL to change
browser-wait.js --url "/dashboard"

# Wait for a custom JavaScript condition
browser-wait.js --eval "document.readyState === 'complete'"
```

All wait conditions use CDP polling with configurable timeouts.

## Using with agents

Agents can use browser tools during task verification. A typical pattern in `/squad:verify`:

```bash
browser-start.js
browser-nav.js http://localhost:3000
browser-wait.js --text "expected content"
browser-screenshot.js --output /tmp/verify.png
```

The screenshot gets attached to the task completion for human review.

## See also

- [CLI Reference](/docs/cli-reference/) - All browser commands
- [Installation](/docs/installation/) - Installing browser tool dependencies
- [Workflow Commands](/docs/workflow-commands/) - Agent verification workflows
