import { pathToFileURL } from 'node:url'

export async function sendNotification({ issuer, subject, app, id, payload, device, key }) {
  const origin = new URL(issuer)
  if (origin.protocol !== 'https:' || origin.origin !== issuer) throw new Error('Use a canonical HTTPS issuer.')
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(subject)) throw new Error('Expected a verified subject UUID.')
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(app) || typeof id !== 'string' || !id || Buffer.byteLength(id) > 128) {
    throw new Error('Expected a valid app ID and a persisted outbox ID.')
  }
  if (device !== undefined && !/^[a-f0-9]{64}$/.test(device)) throw new Error('Invalid device handle.')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected a JSON object payload.')
  if (!key || Buffer.byteLength(key) < 32) throw new Error('Set APPSTORE_SENDER_KEY on the backend.')

  const request = (url, options = {}) => fetch(url, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(5000)
  })
  const metadata = await request(new URL('/.well-known/iam-configuration', origin))
  if (!metadata.ok) throw new Error('IAM discovery HTTP ' + metadata.status)
  const config = await metadata.json()
  if (config.issuer !== issuer) throw new Error('Issuer mismatch.')

  function endpoint(template) {
    if (typeof template !== 'string' || !template.includes('{subject}')) throw new Error('Missing PCR endpoint.')
    const url = new URL(template.replace('{subject}', subject))
    if (url.origin !== issuer || url.username || url.password || url.hash) throw new Error('Unexpected PCR endpoint.')
    return url
  }

  const protocol = 'appstore'
  const version = '1.0.0'
  const capability = device ? 'push.send' : 'push.broadcast'
  const input = device ? { app, device, payload } : { app, payload }
  if (Buffer.byteLength(JSON.stringify(input)) > 8192) throw new Error('Invocation input exceeds 8 KiB.')

  const headers = { Authorization: 'Bearer ' + key }
  const discover = await request(endpoint(config.protocol_subscriptions_endpoint), { headers })
  if (!discover.ok) throw new Error('Capability discovery HTTP ' + discover.status)
  const { protocols } = await discover.json()
  if (!protocols.some(spec => spec.protocol === protocol && spec.version === version &&
      spec.capabilities.some(item => item.id === capability))) {
    throw new Error('Recipient capability unavailable. Keep the outbox entry pending or disable it by policy.')
  }
  const response = await request(endpoint(config.protocol_invocation_endpoint), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, protocol, version, capability, input })
  })
  if (response.status !== 202) throw new Error('Invocation HTTP ' + response.status)
  const receipt = await response.json()
  if (receipt.id !== id || receipt.status !== 'accepted') throw new Error('Unexpected invocation receipt.')
  return receipt
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [issuer, subject, app, id, payload, device] = process.argv.slice(2)
  try {
    const receipt = await sendNotification({
      issuer, subject, app, id, payload: JSON.parse(payload), device, key: process.env.APPSTORE_SENDER_KEY
    })
    console.log(JSON.stringify(receipt))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
