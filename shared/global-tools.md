## Global Agent Tools

Lightweight bash tools available to all agents. Installed to `~/.local/bin/`.

Every tool has `--help` for full usage details.

---

### Image Generation (Gemini)

AI image generation via Google Gemini API. **Requires:** `GEMINI_API_KEY` environment variable.

| Tool | Purpose | Usage |
|------|---------|-------|
| `gemini-image` | Generate image from text prompt | `gemini-image "PROMPT" [OUTPUT] [--aspect 16:9] [--size 2K]` |
| `gemini-edit` | Edit existing image with instruction | `gemini-edit INPUT "INSTRUCTION" [OUTPUT]` |
| `gemini-compose` | Combine 2-14 images into one | `gemini-compose IMG1 IMG2 "INSTRUCTION" [--output PATH]` |

**Models:** `gemini-2.5-flash-image` (default, fast), `gemini-3-pro-image-preview` (quality, 4K)

**Examples:**
```bash
gemini-image "A sunset over mountains" sunset.png --aspect 16:9
gemini-edit photo.png "Remove the background" clean.png
gemini-compose style.jpg photo.jpg "Apply art style" --output styled.png
```

---

### Browser Automation (CDP)

Chrome DevTools Protocol based browser control via Node.js. Requires Chrome/Chromium with `--remote-debugging-port=9222`.

| Tool | Purpose | Usage |
|------|---------|-------|
| `browser-start.js` | Connect to Chrome CDP | `browser-start.js [--headless]` |
| `browser-nav.js` | Navigate to URL | `browser-nav.js URL` |
| `browser-eval.js` | Execute JS in page | `browser-eval.js "document.title"` |
| `browser-screenshot.js` | Capture screenshot | `browser-screenshot.js --output /tmp/shot.png` |
| `browser-pick.js` | Click element | `browser-pick.js --selector "button.submit"` |
| `browser-wait.js` | Wait for condition | `browser-wait.js --text "loaded"` |
| `browser-cookies.js` | Get/set cookies | `browser-cookies.js [--set "name=value"]` |
| `browser-console.js` | Capture console logs | `browser-console.js` |
| `browser-network.js` | Monitor network | `browser-network.js` |
| `browser-snapshot.js` | Capture DOM snapshot | `browser-snapshot.js` |

**browser-eval quirk:** Supports multi-statement code with `return`:
```bash
browser-eval.js "const x = 5; const y = 10; return x + y"
```

---

### Database Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `db-query` | Run SQL, returns JSON/table/CSV | `db-query "SELECT * FROM users LIMIT 5" [--json]` |
| `db-schema` | Show table structure | `db-schema` |
| `db-sessions` | List database connections | `db-sessions` |
| `db-connection-test` | Test database connectivity | `db-connection-test` |

**Safety:** `db-query` adds `LIMIT 100` automatically if no LIMIT specified.

---

### Credentials

| Tool | Purpose | Usage |
|------|---------|-------|
| `squad-secret` | Retrieve secrets from vault | `squad-secret <name>` |

```bash
squad-secret stripe           # Get secret value
squad-secret --list            # List all secrets
squad-secret --env stripe      # Get env var name
eval $(squad-secret --export)  # Load all as env vars
```
