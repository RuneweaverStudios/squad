# Shipping Keycloak auth and surviving svelte-check

We added enterprise auth to JAT this week. Also one-click login buttons for agent harnesses, an edit flow for harness config, and then spent a full afternoon making `npm run check` pass with zero errors across 119 files. Here's how it went.

## The auth problem

JAT runs on localhost. That's fine when it's just you on your machine. But the moment you want multiple people hitting the same instance — a team deploy, a shared staging environment, a self-hosted box on your LAN — you need auth. Not "show a password prompt" auth. Real auth. OAuth flows, session management, user identity, logout that actually logs you out.

We went with Keycloak. It's the most battle-tested open-source IAM out there. Red Hat backs it, it supports OAuth 2.0, OIDC, SAML, social logins, MFA, passkeys, magic links — the full enterprise menu. It's Docker-friendly, which matters because JAT already runs in containers. And the community is huge, so when something breaks at 2am you can actually find the answer.

## The implementation

The OIDC flow uses `openid-client` v6 and `jose` for JWT operations. v6 changed the entire API surface — no more `Issuer.discover()` and `new client.Client()`. It's all `discovery()` and `Configuration` objects now. PKCE is mandatory for the authorization code flow, which is the right call but means you're generating `code_verifier` and `code_challenge` pairs, stashing them in cookies, and pulling them back out on the callback.

The auth module lives at `$lib/auth/keycloak.ts`. It reads config from environment variables:

```
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=jat
KEYCLOAK_CLIENT_ID=jat-ide
KEYCLOAK_CLIENT_SECRET=your-secret
KEYCLOAK_REDIRECT_URI=http://localhost:3333/auth/keycloak/callback
```

If those aren't set, auth is disabled entirely. The IDE works exactly like before — no login screen, no session cookies, nothing. Set them and you get a `/login` page, session management via HTTP-only cookies, and a user profile in the top bar with logout.

Three server routes handle the flow:

- `GET /auth/keycloak` — generates state + PKCE, stashes both in an `squad_keycloak_oauth` cookie, redirects to Keycloak's authorization endpoint
- `GET /auth/keycloak/callback` — validates state, exchanges the authorization code for tokens, creates a session cookie with the user info and `id_token` (for logout hint), redirects to `/`
- `GET /auth/logout` — clears the session cookie, redirects to Keycloak's end-session endpoint for a proper single-sign-out

The session cookie is a base64url-encoded JSON payload. No JWT signing on every request — the `id_token` is verified once during the callback, and after that we trust the HTTP-only cookie. The payload carries the user's `sub`, `email`, `name`, and `preferred_username` so we can display identity without hitting Keycloak again.

The layout server load passes `user` and `keycloakEnabled` down to every page. Components that care about auth — `TopBar`, `UserProfile` — get the data as props. The login page is minimal: one button if Keycloak is configured, setup instructions if it's not.

## One-click agent login

While we were in the auth neighborhood, we added login buttons for agent harnesses. Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi — they all need API keys or OAuth tokens. The setup wizard now shows a "Sign in with GitHub" button next to each harness that needs authentication. Click it, a new tab opens to the provider's login page, you authenticate, come back. The button appears in the onboarding flow and on the config page.

Each preset in `AGENT_PRESETS` got an optional `authUrl` field. Claude Code points to `claude.ai/login`, Codex to `platform.openai.com/login`, and so on. The UI logic is: if the harness is installed but not authenticated, and it has an `authUrl`, show the button.

We also added an "Edit harnesses" link on the detection step that jumps you to `Config → Agents`. Small thing, but it was annoying not having a direct path to the config page from onboarding.

## The type-checking wall

Then we ran `npm run check`.

The project uses SvelteKit with TypeScript. `svelte-check` runs `svelte-kit sync` first to generate route types, then checks everything. The new auth code was clean — zero errors, zero warnings. But the existing codebase had accumulated a lot of type debt. JavaScript files with JSDoc annotations that didn't quite match, implicit `any` types, module resolution gaps across the monorepo.

The first run reported 40+ errors. Not in our new code. In the existing `.js` and `.svelte` files. Things like:

- `Variable '_schemaSQL' implicitly has type 'any'` in `tasks.js`
- `Property 'closedAfter' does not exist on type '{}'` — missing JSDoc params
- `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type` — needed `Record<string, unknown>` casts
- `Property 'relevance' does not exist on type 'Task'` — typedef missing a field that the code clearly used
- A wrong import path: `../../../../lib/jat-tasks.js` instead of `../../../../lib/tasks.js`

We fixed those. Ran check again. More errors surfaced — the first batch had been hiding others. This is the thing about `svelte-check`: it reports errors in dependency order. Fix ten, and the files that import those files now get checked properly and reveal their own issues.

Second round was mostly in the API routes:
- `error.message` on catch blocks where `error` is `unknown` — needed `error instanceof Error ? error.message : String(error)` everywhere
- Generic `Array` without type arguments in JSDoc — had to be `Array<unknown>`
- Callback parameters like `p` in `pipelines.some(p => p.id === id)` where `p` is `unknown` — needed inline casts
- Spread types on objects that weren't statically known — explicit interface casts before spreading

Third round hit the Svelte components:
- `recoverableSession` used before its declaration — a `$derived` at line 213 referencing a `$state` at line 327
- `task` possibly null inside `{#if task.agent_program}` — Svelte's TS plugin doesn't narrow `$state` variables through template blocks
- `broadcastTaskEvent` called with an object literal instead of two positional args
- `document.activeElement?.blur()` — `activeElement` is `Element | null`, and `blur()` only exists on `HTMLElement`
- `fetchTask()` called without the required `id` argument

Then there were the type definition gaps:
- `'task_completed'` missing from the `TriggerEventConfig` event type union
- `'contains'` missing from `PatternMode` (only had `'string' | 'regex'`)
- `'accent'` missing from event style objects that templates already referenced
- `'value'` missing from `QuestionOption` in rich signals
- `'path'` and nullable `blob` missing from `AttachedFile` in SessionCard
- `'sampleItems'` missing from the test result type in IngestWizard
- `WorkingAgentBadge` receiving a `title` prop it didn't declare

And the structural issues:
- `{@const}` placed directly inside a `<div>` instead of inside a Svelte block — had to move it inside the `{#if}`
- `Set<unknown>` where `Set<string>` was expected — needed explicit generic
- Route pathname comparison failing because SvelteKit's generated types don't include `/agents` — had to cast pathname to `string`

Total: about 40 errors across 15 files. Every fix was surgical — widening a type, moving a declaration, adding a null assertion, casting where Svelte's type narrowing falls short. No behavioral changes. The code already worked. The types just didn't prove it.

## The result

```
svelte-check found 0 errors and 591 warnings in 119 files
```

Exit code 0. The warnings are all Svelte a11y hints — missing ARIA roles, labels without associated controls, interactive elements without tabindex. Real stuff worth fixing, but not blockers.

The auth system is opt-in, zero-config when disabled, enterprise-grade when enabled. The agent login buttons remove a step from onboarding. And `npm run check` passes clean for the first time in a while.

## If you want to try the Keycloak setup

Spin up Keycloak in Docker:

```bash
docker run -d --name keycloak \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

Create a realm called `jat`, a client called `jat-ide` with client authentication enabled, set the redirect URI to `http://localhost:3333/auth/keycloak/callback`, grab the client secret, and fill in the env vars. The `README-KEYCLOAK.md` in the IDE directory has the full walkthrough.

Once configured, hit `http://localhost:3333` and you'll see the login page instead of the IDE. Authenticate through Keycloak, and you're in. Your name shows in the top bar. Logout goes through Keycloak's end-session endpoint so the SSO session is properly terminated.

The whole auth layer is about 400 lines of TypeScript across four files. Not bad for enterprise OIDC.
