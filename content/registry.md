The Protocol Capability Registry (PCR) lets an app discover a capability for a specific user and invoke a versioned contract. A registration belongs to a user’s app grant. A provider is a configured HTTPS backend that implements a capability described by its schema.

## Consumer flow

Use the issuer’s [IAM discovery](https://gravitas.cool/.well-known/iam-configuration) to obtain the published endpoint URLs. A subject is the opaque UUID from a verified identity at that issuer.

| Discovery field | Method and route | Use |
| --- | --- | --- |
| `protocol_specifications_endpoint` | `GET /protocols/v1/specifications` | Read available contract versions and structures. |
| `protocol_subscriptions_endpoint` | `GET /protocols/v1/users/{subject}` | Read versions and authorized capabilities subscribed for this user. |
| `protocol_invocation_endpoint` | `POST /protocols/v1/users/{subject}/invoke` | Invoke one exact protocol, semver and capability. |
| `protocol_registry_endpoint` | `PUT /app/v1/protocols/registry` | Replace the signed-in user’s registry for the app origin. |

Both reads require `protocols.read` and return an object with a `protocols` array. Each capability declares its `id`, `permissions`, `input` and `output`. A caller can see only the capabilities it has permission to use. An empty array is a valid response, including for an unknown subject.

Pass `id`, `protocol`, `version`, `capability` and `input` in the JSON body of an invocation. Persist the ID with the recipient and immutable input before sending, then reuse them on retry. IDs are scoped to the sender origin. A conflicting recipient or payload for the same ID returns `409`. An authorized, valid invocation returns `202` with `{"id":"…","status":"accepted"}` even when zero providers match. The receipt confirms durable acceptance. Provider counts, provider identities and delivery outcomes are private.

## Provider flow

1. Ask the issuer operator to configure your canonical backend origin and credential in `PROTOCOL_SERVICES`. If you are introducing a protocol namespace, the operator must configure the owner in `PROTOCOL_OWNERS`.
2. Keep a versioned file like [appstore/1.0.0.json](../contracts/appstore/1.0.0.json). Only the configured namespace owner can introduce a version. An additional provider can register the identical published specification. Publish a new exact version for any change.
3. Once the user has consented to `profile.name`, send the app access token and `{"schema_version":1,"protocols":[SPEC]}` to the registry endpoint. The request replaces the app’s full registry for that account. Sending an empty array unsubscribes it. Revoking the app grant also removes its registration and queued deliveries.
4. Serve `POST /api/protocols/invoke` on your configured backend origin. Validate the bearer against your own backend credential, check the issuer and sender, authorize the subject and input for your application, and deduplicate by sender and ID before processing. Return 2xx once processing is safely accepted.

For reconciliation, `PUT /protocols/v1/registry` accepts a trusted backend bearer and `{"session_proof":"…","registry":{…}}`. The live proof must bind to that same backend origin. Gravitas constructs the outbound delivery from trusted configuration and adds `issuer`, `sender` and `subject`. Receivers should expect at-least-once delivery with bounded backoff and seven-day expiry.

## Contract limits

PCR v1 accepts object input and output schemas with `type`, `properties`, `required`, boolean `additionalProperties`, `items`, `enum`, length or numeric bounds, `pattern` and `description`. Keep specs within 32 KiB with up to 32 capabilities, registries at up to 32 specs and invocation input within 8 KiB. Supply an exact semver, including prerelease or build identifiers when applicable.

[Protocol Capability Registry source contract](https://github.com/jeethsuresh/iam-server/blob/bfe8a51df7aeb69e91e9bff219644ac8276c689a/docs/protocol-registry.md) · [Appstore notification walkthrough](../notifications/)
