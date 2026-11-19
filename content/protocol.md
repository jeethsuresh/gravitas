Gravitas is a protocol for apps that want to share an account system and call ecosystem services with explicit permission. An app can start with sign-in, add access to a particular account feature, or send a versioned request to a service such as Bazaar.

## What an app gets

- **One account across apps.** Send the person to their Gravitas identity server to sign in. Use the pair of issuer URL and opaque subject ID as your account key. Names can change and the same username can appear on several domains.
- **Consent for specific data.** Ask for access to a name, profile picture, or shared contacts as needed. Gravitas records the grant for the app’s origin. The person can revoke it from their account settings.
- **Coordinated sign-out.** A protected app backend checks a session proof against Gravitas. This lets the app reject a signed-out or revoked session even when its local cookie is still present.
- **Discoverable services.** The Protocol Capability Registry (PCR) describes exact protocol versions and permitted capabilities. A sender can ask whether a capability is available for a recipient and submit a request without learning which provider or device serves them.

## Follow one request

1. **Your app** starts a browser authorization request with a fresh state and an S256 PKCE challenge.
2. **Gravitas IAM** signs in the user and asks for consent if the origin lacks a grant for the requested scopes. The browser returns a short-lived code to the app.
3. **Your backend** exchanges the code with the verifier, looks up the permitted profile, checks the Gravitas session and issues its own app cookie.
4. **An ecosystem service**, such as Bazaar, can receive a separately authorized invocation through PCR. For example, a reminder backend queues an alert for its own app on the recipient’s opted-in devices.

The hosted identity server is [gravitas.cool](https://gravitas.cool). To inspect its advertised routes and scopes, fetch [IAM discovery](https://gravitas.cool/.well-known/iam-configuration). Gravitas uses a custom PKCE flow with its own discovery path, browser initiation parameters and opaque app tokens.

## Choose your first integration

Start with [Build a notes app](../quickstart/) for an app session that can survive a browser round trip and honor Gravitas revocation. Read [Permissions and consent](../permissions/) before adding shared data. Add [Appstore notifications](../notifications/) if you have a client that can receive them.

[Gravitas IAM implementation](https://github.com/jeethsuresh/iam-server/tree/bfe8a51df7aeb69e91e9bff219644ac8276c689a) · [Bazaar implementation](https://github.com/jeethsuresh/appstore/tree/095d76b46afef28a9d55b36122b1410853f7d17d)
