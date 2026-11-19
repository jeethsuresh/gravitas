Build a small web backend that signs a visitor in with Gravitas and gives that account a private notes page. The complete example uses Node.js 22+ and its built-in HTTP and crypto libraries.

[Download notes.mjs](../examples/notes.mjs) · [View the example source on GitHub](https://github.com/jeethsuresh/gravitas/blob/main/examples/notes.mjs)

## Run the example

Put the downloaded file on your machine. Set the public HTTPS origin your browser will use. For a local backend, point a trusted development HTTPS reverse proxy at `127.0.0.1:8787`. Replace the example origin with the address it actually serves.

```bash
APP_ORIGIN=https://notes.example.com GRAVITAS_ISSUER=https://gravitas.cool PORT=8787 node notes.mjs
```

Open that HTTPS origin, choose **Sign in with Gravitas**, sign in with an active account and approve access to your name. Add a note, then choose **Connect contacts** to request the separate read permission. Try leaving the consent screen and opening Notes again. Your note should still be there. Sign out through Gravitas and reload the app. The next check should end the local session. For a local IAM instance that explicitly permits loopback callbacks, set both origins to their local loopback HTTP addresses and set `ALLOW_LOOPBACK_HTTP=1`. The hosted issuer uses HTTPS callbacks on the app’s request origin.

The example keeps notes, pending PKCE transactions, and app sessions in memory. Use a database for notes and a shared expiring session store before deploying multiple instances. The demo starts a new sign-in when its local session expires. If your app needs longer-lived API access, follow the refresh guidance below.

## Start sign-in

Fetch `/.well-known/iam-configuration` from a configured issuer and use the advertised `browser_initiation_endpoint`. Keep the issuer bound to the transaction. Generate a separate random state and PKCE verifier, store them server-side for up to ten minutes, and bind the transaction to the initiating browser with a short-lived, HTTP-only cookie.

```js
import { createHash, randomBytes } from 'node:crypto'

const state = randomBytes(32).toString('base64url')
const verifier = randomBytes(32).toString('base64url')
const authorization = new URL(config.browser_initiation_endpoint)
authorization.search = new URLSearchParams({
  callerURL: 'https://notes.example.com',
  redirectURL: 'https://notes.example.com/auth/gravitas/callback',
  codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  codeChallengeMethod: 'S256',
  scope: 'profile.name',
  state
})
```

Redirect the browser to `authorization`. Gravitas handles credential entry. The callback URL must be on the caller’s exact origin. Optional `screen=register` takes the user through the issuer’s registration and approval policy. An existing username-first app can use `POST /backend/register` and send the browser to `/oauth/authorize?sessionID=...`.

## Exchange and bind the account

On the callback, validate state even on error responses. Reject duplicate callback parameters, consume the browser-bound transaction once and post the code server-to-server to the advertised `token_endpoint`.

```js
const response = await fetch(config.token_endpoint, {
  method: 'POST',
  redirect: 'error',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: 'https://notes.example.com/auth/gravitas/callback'
  })
})
```

Read the advertised `userinfo_endpoint` with the returned `access_token` as a bearer. Check the `session_check_token` against the advertised session endpoint. Require `active: true`, matching `iss`, `sub`, `app_origin`, `session_id` and a future Unix `exp`. Key the account on `(iss, sub)`. Issue a new opaque host-only cookie with `HttpOnly`, `Secure` and `SameSite=Lax`. Keep the tokens on the backend and send the browser to a clean URL.

## Protect subsequent requests

Recheck the session proof on each protected request. On 401, clear the local session. On timeout, a malformed response or 5xx, fail closed and preserve local work for recovery. Sweep expired transactions and sessions. Use CSRF protection on app mutations and keep app-local logout usable during IAM outages.

When needed, refresh with `grant_type=refresh_token` and the current `refresh_token` at `token_endpoint`. Serialize refresh per app session and store the replacement token atomically. A scope increase uses fresh consent and a new authorization-code exchange. A subdomain can use the shared sign-in hint for one `prompt=none` attempt. Validate the returned state on `login_required` and `consent_required`, and start a fresh interactive flow when the user chooses to continue.

## Try the next step

Use [Permissions and consent](../permissions/) to adapt the example’s **Connect contacts** button to another scoped feature, or add a reminder using [Appstore notifications](../notifications/). To launch the app from the Gravitas dashboard, give an administrator your name, description, same-origin logo, home URL and app-side initiation URL (the example uses `/auth/gravitas/start`). The dashboard opens that URL and your app starts the handshake.

[Source contract for sign-in, dashboard and coordinated logout](https://github.com/jeethsuresh/iam-server/blob/bfe8a51df7aeb69e91e9bff219644ac8276c689a/docs/kubernetes.md#dashboard-and-service-integration)
