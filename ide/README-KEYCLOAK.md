# Keycloak (Red Hat) authentication

Squad IDE can use **Keycloak** as an optional, enterprise-grade identity provider. When configured, all access to the IDE requires login via Keycloak (OAuth 2.0 / OpenID Connect).

Keycloak supports:

- **OAuth 2.0 / OIDC** — used by Squad IDE
- SAML, social logins (Google, GitHub, etc.), MFA, passwordless (magic links, OTP), passkeys
- Self‑hosting, Docker-friendly, large community

## When auth is used

- **All variables set** → IDE requires Keycloak login; unauthenticated users are redirected to `/login`.
- **Any variable missing** → IDE runs without authentication (default).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KEYCLOAK_URL` | Yes | Base URL of the Keycloak server (e.g. `https://auth.example.com`). |
| `KEYCLOAK_REALM` | Yes | Realm name. |
| `KEYCLOAK_CLIENT_ID` | Yes | Client ID for the Squad IDE application. |
| `KEYCLOAK_CLIENT_SECRET` | Yes | Client secret (confidential client). |
| `KEYCLOAK_REDIRECT_URI` | Yes | Exact redirect URI for the OAuth callback (e.g. `https://ide.example.com/auth/keycloak/callback`). |
| `KEYCLOAK_POST_LOGOUT_URI` | No | Where to send the user after Keycloak logout (default: origin of `KEYCLOAK_REDIRECT_URI`). |

## Keycloak setup

1. Create a **realm** (or use an existing one).

2. Create a **client**:
   - Client type: **OpenID Connect**
   - Client authentication: **ON** (confidential)
   - Valid redirect URIs: your `KEYCLOAK_REDIRECT_URI` (e.g. `https://ide.example.com/auth/keycloak/callback`)
   - Valid post logout redirect URIs: where users should land after logout (e.g. `https://ide.example.com`)
   - Web origins: your IDE origin (e.g. `https://ide.example.com`)

3. Copy the **Client ID** and **Client secret** into `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET`.

4. Set `KEYCLOAK_URL` to your Keycloak base URL and `KEYCLOAK_REALM` to the realm name.

5. Run the IDE with these env vars set (e.g. from `.env` or your deployment config).

## Flow

1. User opens the IDE → hooks see no session → redirect to `/login`.
2. User clicks **Login with Keycloak** → redirect to Keycloak authorization URL.
3. User signs in at Keycloak (including MFA/social if configured in the realm).
4. Keycloak redirects to `/auth/keycloak/callback` with an authorization code.
5. IDE exchanges the code for tokens, sets an HTTP-only session cookie, redirects to `/`.
6. **Log out**: user chooses “Log out” in the profile menu → cookie cleared and redirect to Keycloak end-session, then back to the post-logout URI.

## Docker

Keycloak is often run in Docker. Example:

```bash
docker run -d \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

Then use `http://localhost:8080` (or your host) as `KEYCLOAK_URL` and create the client as above. For production, use a proper Keycloak setup (HTTPS, persistent storage, etc.).
