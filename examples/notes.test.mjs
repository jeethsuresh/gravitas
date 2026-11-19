import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createNotesServer } from './notes.mjs'
import { sendNotification } from './notify.mjs'

async function listen(t, server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject).listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  return 'http://127.0.0.1:' + server.address().port
}

const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

test('Notes handles PKCE, incremental consent, protected notes and coordinated logout', async t => {
  const appOrigin = 'https://notes.example.com'
  let expectedChallenge
  let exchanged = 0
  let statusCode = 200
  let account = 'account-123'
  const iam = await listen(t, createServer(async (request, response) => {
    const issuer = 'http://' + request.headers.host
    if (request.url === '/.well-known/iam-configuration') {
      return json(response, 200, {
        issuer, browser_initiation_endpoint: issuer + '/oauth/start',
        token_endpoint: issuer + '/oauth/token', userinfo_endpoint: issuer + '/app/v1/me',
        session_check_endpoint: issuer + '/oauth/session', contacts_endpoint: issuer + '/app/v1/contacts'
      })
    }
    if (request.url === '/oauth/token') {
      exchanged++
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const form = new URLSearchParams(Buffer.concat(chunks).toString())
      assert.equal(form.get('grant_type'), 'authorization_code')
      assert.equal(form.get('redirect_uri'), appOrigin + '/auth/gravitas/callback')
      assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), expectedChallenge)
      return json(response, 200, { access_token: 'access', session_check_token: 'status', session_id: 'family' })
    }
    if (request.url === '/app/v1/me') {
      assert.equal(request.headers.authorization, 'Bearer access')
      return json(response, 200, { sub: account, name: '<Developer>' })
    }
    if (request.url === '/app/v1/contacts') {
      assert.equal(request.headers.authorization, 'Bearer access')
      return json(response, 200, { contacts: [{ principal_id: 'example' }] })
    }
    if (request.url === '/oauth/session') {
      assert.equal(request.headers.authorization, 'Bearer status')
      return json(response, statusCode, { active: statusCode === 200, iss: issuer, sub: account,
        app_origin: appOrigin, session_id: 'family', exp: Math.floor(Date.now() / 1000) + 3600 })
    }
    return json(response, 404, {})
  }))
  const transportOrigin = await listen(t, createNotesServer({ appOrigin, issuer: iam, allowLoopback: true }))

  const jar = new Map()
  async function visit(path, options = {}) {
    const response = await fetch(transportOrigin + path, {
      redirect: 'manual', ...options,
      headers: { Cookie: [...jar.values()].join('; '), ...options.headers }
    })
    for (const header of response.headers.getSetCookie()) {
      assert.match(header, /; HttpOnly; SameSite=Lax; Secure/)
      assert.doesNotMatch(header, /Domain=/i)
      const pair = header.split(';')[0]
      const key = pair.split('=')[0]
      if (header.includes('Max-Age=0')) jar.delete(key)
      else jar.set(key, pair)
    }
    return response
  }

  function post(path, body, origin = appOrigin) {
    return visit(path, {
      method: 'POST', body: new URLSearchParams(body),
      headers: { Origin: origin }
    })
  }
  function authorization(response, scope) {
    assert.equal(response.status, 303)
    const url = new URL(response.headers.get('location'))
    assert.equal(url.origin, iam)
    assert.equal(url.searchParams.get('callerURL'), appOrigin)
    assert.equal(url.searchParams.get('codeChallengeMethod'), 'S256')
    assert.equal(url.searchParams.get('scope'), scope)
    expectedChallenge = url.searchParams.get('codeChallenge')
    return url.searchParams.get('state')
  }
  const callback = state => '/auth/gravitas/callback?code=one-use-code&state=' + state
  const state = authorization(await visit('/auth/gravitas/start'), 'profile.name')
  assert.equal((await visit(callback('wrong'))).status, 400)
  assert.equal(exchanged, 0)
  assert.equal((await visit(callback(state))).status, 303)
  assert.equal((await visit(callback(state))).status, 400)

  const page = await (await visit('/')).text()
  assert.match(page, /&lt;Developer&gt;/)
  assert.match(page, /Connect contacts/)
  let csrf = page.match(/name="csrf" value="([^"]+)"/)[1]
  assert.equal((await post('/notes', { csrf, note: 'Blocked' }, 'https://other.example')).status, 403)
  assert.equal((await post('/notes', { csrf, note: '<private note>' })).status, 303)

  const declined = authorization(await post('/auth/gravitas/contacts', { csrf }), 'profile.name contacts.read')
  assert.equal((await visit('/auth/gravitas/callback?error=access_denied&state=' + declined)).status, 303)
  assert.match(await (await visit('/?connection=declined')).text(), /Permission request ended/)
  const upgrade = authorization(await post('/auth/gravitas/contacts', { csrf }), 'profile.name contacts.read')
  account = 'a-different-account'
  assert.equal((await visit(callback(upgrade))).status, 403)
  account = 'account-123'
  const secondUpgrade = authorization(await post('/auth/gravitas/contacts', { csrf }), 'profile.name contacts.read')
  assert.equal((await visit(callback(secondUpgrade))).status, 303)
  const upgraded = await (await visit('/')).text()
  assert.match(upgraded, /Shared contacts: 1/)
  assert.match(upgraded, /&lt;private note&gt;/)
  csrf = upgraded.match(/name="csrf" value="([^"]+)"/)[1]

  statusCode = 503
  assert.equal((await visit('/')).status, 503)
  assert.ok(jar.has('__Host-notes_session'))
  assert.equal((await post('/logout', { csrf })).status, 303)
  assert.ok(!jar.has('__Host-notes_session'))

  statusCode = 200
  const relogin = authorization(await visit('/auth/gravitas/start'), 'profile.name')
  assert.equal((await visit(callback(relogin))).status, 303)
  statusCode = 401
  assert.match(await (await visit('/')).text(), /Sign in with Gravitas/)
  assert.ok(!jar.has('__Host-notes_session'))
})

test('Notification example discovers exact permission and sends an immutable envelope', async t => {
  const issuer = 'https://issuer.example'
  const subject = '00000000-1111-2222-3333-444444444444'
  const requests = []
  let capability = 'push.send'
  const args = {
    issuer, subject, app: 'notes', id: 'fixed-outbox-id', payload: { note_id: 'n_6cf7' },
    device: 'a'.repeat(64), key: 'x'.repeat(32)
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url.href, options])
    if (url.pathname === '/.well-known/iam-configuration') {
      return Response.json({
        issuer,
        protocol_subscriptions_endpoint: issuer + '/protocols/v1/users/{subject}',
        protocol_invocation_endpoint: issuer + '/protocols/v1/users/{subject}/invoke'
      })
    }
    if (url.pathname.endsWith('/invoke')) return Response.json({ id: args.id, status: 'accepted' }, { status: 202 })
    return Response.json({ protocols: [{ protocol: 'appstore', version: '1.0.0', capabilities: [{ id: capability }] }] })
  })
  assert.deepEqual(await sendNotification(args), { id: args.id, status: 'accepted' })
  assert.equal(requests.length, 3)
  assert.equal(requests[0][1].headers, undefined)
  assert.equal(requests[2][0], issuer + '/protocols/v1/users/' + subject + '/invoke')
  assert.equal(requests[2][1].redirect, 'error')
  assert.deepEqual(JSON.parse(requests[2][1].body), {
    id: args.id, protocol: 'appstore', version: '1.0.0', capability: 'push.send',
    input: { app: args.app, device: args.device, payload: args.payload }
  })
  capability = 'push.broadcast'
  await assert.rejects(sendNotification(args), /capability unavailable/i)
  assert.equal(requests.length, 5)
  await sendNotification({ ...args, device: undefined })
  const broadcast = JSON.parse(requests.at(-1)[1].body)
  assert.equal(broadcast.capability, 'push.broadcast')
  assert.ok(!('device' in broadcast.input))
})
