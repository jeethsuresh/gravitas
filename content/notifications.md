Bazaar is the Gravitas app store and the reference provider of `appstore/1.0.0`. A backend can send a payload for its own app to one registered installation or all of that account’s enabled installations. Bazaar relays to its Android listener or to Apple Push Notification service (APNs).

[Download notify.mjs](../examples/notify.mjs) · [Read the exact Appstore 1.0.0 contract](../contracts/appstore/1.0.0.json)

## Get a reminder app ready

1. Implement the Gravitas sign-in flow and use verified issuer and subject values as your account key.
2. Choose an app ID such as `notes` and a canonical HTTPS backend origin. Work with the Bazaar operator to bind that app ID and origin to a distinct server credential via `NOTIFICATION_APP_KEYS`. Have the IAM operator configure the same sender origin and key in `PROTOCOL_SERVICES` with `protocols.read` and `appstore.push`. Add `appstore.push.broadcast` only for broadcast.
3. Implement one of the receiving paths below. Keep device tokens, installation handles, session proofs and the backend credential out of client logs.
4. After the user opts in, authorize each reminder against the signed-in account and write an outbox entry with a stable invocation ID. Going live on the hosted ecosystem requires operator configuration and a registered receiving installation. Use a disposable account and installation for integration checks.

## Receive on iOS

Enable the Push Notifications capability in the iOS target. Invite the user to grant OS notification permission, register with APNs and send the hex token to your authenticated backend. The backend takes the session proof from its own session store and chooses `sandbox` or `production` from the signed build configuration. The Bazaar operator binds the app origin and each allowed environment to its APNs topic and key.

Your backend calls `PUT /v1/notification-installations/{app}/{installation}` on the configured Bazaar origin with its server bearer. The installation ID is a stable random 32-byte value encoded as lowercase hex. The request body looks like this:

```json
{
  "platform": "ios",
  "environment": "sandbox",
  "token": "HEX_APNS_TOKEN",
  "session_proof": "SESSION_CHECK_TOKEN_FROM_YOUR_BACKEND",
  "generation": 1
}
```

Store the returned `device` handle against the verified account and installation. To disable, send `DELETE` to the same URL with a newer `{"generation":2}`. Retrying the same change uses the same generation and fields. Handle 409 as a generation conflict. Re-register with a new generation when APNs rotates the token. A received alert carries an account subject and an opaque ID. Validate the account, deduplicate the ID, and fetch authenticated app data if the push includes `refresh: true`.

## Receive on Android

Coordinate a signed app listing and notification configuration with the Bazaar operator. The catalog binds your package and certificate to the native notification provider authority and backend origin. Implement the receiving `ContentProvider.call("notify")`. Check the actual caller UID and Bazaar signing certificate, bind the payload to the current account, and handle duplicate or stale delivery before posting a native notification. Have the user approve your app’s OS notification permission and enable App notifications in Bazaar for the same account.

Bazaar registers installation changes with your backend at `PUT /api/notifications/providers/{id}`, using the shared service bearer. The PCR registration carries `issuer`, `subject`, `enabled`, `protocol: "appstore/1.0.0"` and an empty `callback`. Targeted delivery uses the registration ID as the device handle. An app that only broadcasts can acknowledge the registration with 204 and leave installation tracking to Bazaar. For an implementation, follow the [signed Android receiver and stream contract](https://github.com/jeethsuresh/appstore/blob/095d76b46afef28a9d55b36122b1410853f7d17d/docs/NOTIFICATIONS.md#delivery-protocol). Doze can delay the stream until networking resumes.

## Send a reminder

Set `APPSTORE_SENDER_KEY` in the server environment. The helper reads the advertised endpoints, checks the recipient’s available capabilities and sends the request. Use the real app ID, the verified recipient subject and a persisted ID unique to this reminder.

```bash
node notify.mjs https://gravitas.cool "$RECIPIENT_SUBJECT" notes "$OUTBOX_ID" '{"kind":"note.reminder","note_id":"n_6cf7"}' "$DEVICE_HANDLE"
```

Omit the device argument for a backend that is allowed to broadcast. Keep payloads small and use opaque identifiers. The 8 KiB PCR limit covers the entire invocation input, and APNs has a smaller envelope. Show sensitive content only after the user opens the authorized app.

Treat missing discovery capability as pending or disabled according to your app’s policy. Retry timeouts, `429` and `5xx` with backoff and the same ID. Investigate `400`, `401`, `403` and `409` before retrying. A `202` confirms queuing at IAM. Verify display on a device with permission enabled, then check duplicate handling, permission denial, installation deregistration and sign-out.

[Bazaar notification setup and reference implementations](https://github.com/jeethsuresh/appstore/blob/095d76b46afef28a9d55b36122b1410853f7d17d/docs/NOTIFICATIONS.md) · [PCR wire reference](../registry/) · [Publishing and ecosystem integration](../ecosystem/)
