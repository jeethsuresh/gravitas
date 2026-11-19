Request the smallest grant needed for the action in front of the user. The issuer advertises supported scope strings in `scopes_supported`. The browser request’s `scope` parameter contains a space-separated list.

## Choose scopes by feature

| Feature | Scope | What the app can do |
| --- | --- | --- |
| Sign in and show the account name | `profile.name` | Read `sub`, `domain`, and nullable `name` from `GET /app/v1/me`. |
| Display the username or qualified user ID | `profile.username` | Read `username` and `user_id` from the profile. |
| Display an avatar | `profile.picture` | Read the nullable HTTPS `picture` URL. |
| Read shared contacts | `contacts.read` | Read contacts, pending requests and blocks for the signed-in account. |
| Change shared contacts | `contacts.manage` | Request, accept, ignore, cancel, remove, block or unblock a contact. |
| Discover ecosystem capabilities | `protocols.read` | Read the specifications and the recipient’s available capabilities. |
| Target a notification installation | `appstore.push` | Invoke `push.send` for an authorized app and device handle. |
| Notify all enabled installations of the app | `appstore.push appstore.push.broadcast` | Invoke `push.broadcast`, which requires both scopes. |

An **app access token** acts with user consent. Its effective scopes are the intersection of its original snapshot and the current grant. A **backend credential** has a configured origin and a narrowly scoped permission list. Use it for server-initiated work such as a durable notification outbox, together with app-level authorization and the recipient’s enabled installation. An app’s login consent, a backend’s routing permission and the phone’s notification permission are independent.

## Add a permission after login

1. Put a **Connect contacts** button next to a feature that needs contacts. Explain that it will read mutual Gravitas relationships for this app.
2. Start a new browser request using `scope=profile.name contacts.read` with new state and PKCE values. Keep the app usable if the user declines or leaves.
3. After exchange, validate the previous and new account bindings before attaching the grant to the current account. Call `GET /app/v1/contacts` with the new bearer token.
4. For a contact-changing feature, request both `contacts.read` and `contacts.manage` when the user needs to browse and change the list. Explain that writes change shared account relationships across apps.

```js
const response = await fetch(new URL('/app/v1/contacts', issuer), {
  redirect: 'error',
  headers: { Authorization: 'Bearer ' + accessToken }
})
if (response.status === 403) {
  // Show the Connect contacts button.
} else if (response.ok) {
  const { contacts, requests, blocked } = await response.json()
  // Render each list in the signed-in account.
}
```

Accepted contacts may include `uses_app`. It describes that person’s current consent for the same app origin. Pending requests have no such field. A write to `POST /app/v1/contacts` supplies `action`, the target `username` or local qualified `user_id`, and a stable `txn_id`. The bearer grant supplies the actor and the app origin.

## Handle revocation and errors

| Outcome | App behavior |
| --- | --- |
| `401` from the session check | End the local session and stop protected requests and streams. |
| `401` from a data API | Check the session first, then refresh or reconnect if the session is still active. |
| `403` | Check current scopes, origin and resource authorization. Offer consent only if a scope is missing. |
| `login_required` or `consent_required` from `prompt=none` | Validate state and stop the passive attempt. Offer interactive sign-in. |
| Network failure, malformed response or `5xx` | Keep local work tied to its account and make the protected operation retryable. |

[Shared contacts source contract](https://github.com/jeethsuresh/iam-server/blob/bfe8a51df7aeb69e91e9bff219644ac8276c689a/docs/contacts.md) · [Live supported scopes](https://gravitas.cool/.well-known/iam-configuration)
