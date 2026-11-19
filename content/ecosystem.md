An app can join the ecosystem in stages. Start with a user-visible sign-in. Choose the directory, distribution and native integrations that fit the app.

## Launch from the Gravitas dashboard

Send a Gravitas administrator your app name, description, same-origin HTTPS logo, home URL and login initiation URL. The login link points to the app endpoint that creates PKCE state and sends the browser to the configured issuer. New scopes can trigger consent even if the user already has a Gravitas browser session. A listing is managed independently of each user’s grant.

## Publish through Bazaar

For app distribution, arrange a Bazaar catalog publisher credential scoped to the release repositories you control. Your backend sends a complete revision to `PUT /v1/catalog/{publisher}` on the Store. Increment `revision` for each change and retry the same revision with exactly the same body.

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "apps": [{
    "id": "notes",
    "name": "Notes",
    "description": "Write notes and set reminders.",
    "repository": "example/notes",
    "logoPng": "BASE64_ENCODED_PNG",
    "website": "https://notes.example.com",
    "desktop": true
  }]
}
```

An Android entry needs its permanent `packageName`, `certificateSha256` and APK `assetName`. Publish stable compatible releases from the approved repository. Bazaar verifies release artifacts before making them installable. If the operator enables a personal Android catalog, publish account membership to `PUT /v1/catalog/{publisher}/accounts` using the publisher bearer and `{issuer, sessionProof, apps}`. Use a live server-side session proof bound to the configured publisher origin.

## Match an app feature to an integration

- **Shared contacts.** Request contact scopes on demand and use the [delegated API](../permissions/). Contact changes are account-wide.
- **App alerts.** Follow the [Bazaar delivery guide](../notifications/) for a verified native receiver and separate backend permission.
- **Federated identities.** Begin with a configured issuer and store the issuer with every subject. When you support `@username:domain`, resolve the identity domain via HTTPS WebFinger and validate the returned IAM metadata and endpoint URLs. Apply a configured trust policy to user-supplied domains. Keep each session and capability lookup on its verified issuer.
- **Android account broker.** For approved, certificate-pinned native clients, Bazaar can reuse existing full consent on the supported issuer. Keep the browser consent flow available when the broker cannot satisfy a request.

[Catalog publishing contract](https://github.com/jeethsuresh/appstore/blob/095d76b46afef28a9d55b36122b1410853f7d17d/docs/CATALOG_PUBLISHING.md) · [Android account broker](https://github.com/jeethsuresh/appstore/blob/095d76b46afef28a9d55b36122b1410853f7d17d/docs/ANDROID_BROKER.md)
