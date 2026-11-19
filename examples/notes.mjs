import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const token = () => randomBytes(32).toString('base64url')
const tenMinutes = 10 * 60 * 1000
const oneHour = 60 * 60 * 1000
const callbackPath = '/auth/gravitas/callback'

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function originFor(value, allowLoopback) {
  const url = new URL(value)
  const loopback = allowLoopback && url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.origin !== value || (url.protocol !== 'https:' && !loopback) || url.username || url.password) {
    throw new Error('Configure a canonical HTTPS origin.')
  }
  return url.origin
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character])

function cookies(request) {
  return new Map((request.headers.cookie || '').split(/;\s*/).map(pair => {
    const separator = pair.indexOf('=')
    return [pair.slice(0, separator), pair.slice(separator + 1)]
  }))
}

function redirect(response, location) {
  response.writeHead(303, { Location: location })
  response.end()
}

function page(response, status, title, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(title) + '</title><main><h1>' + escapeHtml(title) + '</h1>' + body + '</main>')
}

async function form(request, origin) {
  if (request.headers.origin !== origin ||
      request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    throw new HttpError(403, 'Submit the form from this site.')
  }
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 4096) throw new HttpError(413, 'The submitted form is too large.')
    chunks.push(chunk)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

export function createNotesServer({ appOrigin, issuer, allowLoopback = false }) {
  appOrigin = originFor(appOrigin, allowLoopback)
  issuer = originFor(issuer, allowLoopback)
  const redirectUri = appOrigin + callbackPath
  const secure = appOrigin.startsWith('https:')
  const cookiePrefix = secure ? '__Host-' : ''
  const pendingCookie = cookiePrefix + 'notes_pending'
  const sessionCookie = cookiePrefix + 'notes_session'
  const pending = new Map()
  const sessions = new Map()
  const notes = new Map()

  function cookie(name, value, age) {
    return name + '=' + value + '; Max-Age=' + age + '; Path=/; HttpOnly; SameSite=Lax' +
      (secure ? '; Secure' : '')
  }

  function endpoint(value) {
    const url = new URL(value)
    if (url.origin !== issuer || url.username || url.password || url.hash) {
      throw new Error('Unexpected IAM endpoint.')
    }
    return url
  }

  function iam(url, options = {}) {
    return fetch(endpoint(url), { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) })
  }

  async function discovery() {
    const response = await iam(issuer + '/.well-known/iam-configuration')
    if (!response.ok) throw new Error('IAM discovery failed.')
    const config = await response.json()
    if (config.issuer !== issuer) throw new Error('Issuer mismatch.')
    for (const field of ['browser_initiation_endpoint', 'token_endpoint', 'userinfo_endpoint', 'session_check_endpoint', 'contacts_endpoint']) {
      if (field !== 'contacts_endpoint' || config[field]) endpoint(config[field])
    }
    return config
  }

  async function checkSession(session) {
    const response = await iam(session.sessionEndpoint, {
      headers: { Authorization: 'Bearer ' + session.proof }
    })
    if (response.status === 401) return false
    if (!response.ok) throw new Error('IAM session check unavailable.')
    const status = await response.json()
    if (status.active !== true || status.iss !== issuer || status.sub !== session.sub ||
        status.app_origin !== appOrigin || status.session_id !== session.sessionId ||
        !Number.isInteger(status.exp) || status.exp <= Date.now() / 1000) {
      throw new Error('Unexpected IAM session response.')
    }
    return true
  }

  async function requireSession(sessionKey, response) {
    const session = sessions.get(sessionKey)
    if (session?.expires > Date.now() && await checkSession(session) &&
        sessions.get(sessionKey) === session) return session
    sessions.delete(sessionKey)
    response.setHeader('Set-Cookie', cookie(sessionCookie, '', 0))
    return null
  }

  async function start(response, previousTransaction, upgradeSession) {
    const config = await discovery()
    const transaction = token()
    const state = token()
    const verifier = token()
    pending.delete(previousTransaction)
    pending.set(transaction, { config, state, verifier, upgradeSession, expires: Date.now() + tenMinutes })
    const authorization = endpoint(config.browser_initiation_endpoint)
    authorization.search = new URLSearchParams({
      callerURL: appOrigin,
      redirectURL: redirectUri,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      scope: upgradeSession ? 'profile.name contacts.read' : 'profile.name',
      state
    })
    response.setHeader('Set-Cookie', cookie(pendingCookie, transaction, 600))
    redirect(response, authorization.href)
  }

  async function callback(url, response, transaction, sessionKey) {
    const flow = pending.get(transaction)
    const states = url.searchParams.getAll('state')
    if (!flow || flow.expires <= Date.now() || states.length !== 1 || states[0] !== flow.state) {
      throw new HttpError(400, 'Sign-in expired or could not be verified. Start again from the app.')
    }
    pending.delete(transaction)
    const cleared = cookie(pendingCookie, '', 0)
    response.setHeader('Set-Cookie', cleared)
    const codes = url.searchParams.getAll('code')
    const errors = url.searchParams.getAll('error')
    if (errors.length === 1 && codes.length === 0) {
      return redirect(response, '/?connection=declined')
    }
    if (codes.length !== 1 || !codes[0] || errors.length) throw new HttpError(400, 'Invalid callback.')
    const exchange = await iam(flow.config.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: codes[0],
        code_verifier: flow.verifier,
        redirect_uri: redirectUri
      })
    })
    if (exchange.status === 400) throw new HttpError(400, 'This code was rejected. Start sign-in again.')
    if (!exchange.ok) throw new Error('IAM exchange unavailable.')
    const tokens = await exchange.json()
    for (const field of ['access_token', 'session_check_token', 'session_id']) {
      if (typeof tokens[field] !== 'string' || !tokens[field]) throw new Error('Invalid token response.')
    }
    const profile = await iam(flow.config.userinfo_endpoint, {
      headers: { Authorization: 'Bearer ' + tokens.access_token }
    })
    if (!profile.ok) throw new Error('Profile unavailable.')
    const { sub, name } = await profile.json()
    if (typeof sub !== 'string' || !sub) throw new Error('Missing subject.')
    const current = sessions.get(sessionKey)
    if (flow.upgradeSession && (flow.upgradeSession !== sessionKey || current?.sub !== sub ||
        current.expires <= Date.now())) {
      throw new HttpError(403, 'Use the same signed-in account to connect contacts.')
    }
    const session = {
      sub, name, proof: tokens.session_check_token, sessionId: tokens.session_id,
      sessionEndpoint: flow.config.session_check_endpoint, contactsEndpoint: flow.config.contacts_endpoint,
      contactsToken: flow.upgradeSession ? tokens.access_token : null,
      csrf: token(), expires: Date.now() + oneHour
    }
    if (!await checkSession(session)) throw new HttpError(401, 'This Gravitas session has ended.')
    if (flow.upgradeSession && sessions.get(sessionKey) !== current) {
      throw new HttpError(403, 'Sign in again before connecting contacts.')
    }
    sessions.delete(sessionKey)
    const key = token()
    sessions.set(key, session)
    response.setHeader('Set-Cookie', [cleared, cookie(sessionCookie, key, 3600)])
    redirect(response, '/')
  }

  async function renderNotes(response, session, account, declined) {
    let contacts = ''
    if (session.contactsToken && session.contactsEndpoint) {
      const result = await iam(session.contactsEndpoint, {
        headers: { Authorization: 'Bearer ' + session.contactsToken }
      }).catch(() => null)
      if (result?.ok) {
        const data = await result.json().catch(() => null)
        if (Array.isArray(data?.contacts)) contacts = '<p>Shared contacts: ' + data.contacts.length + '.</p>'
      }
      if (!contacts && result?.status !== 403 && result?.status !== 401) contacts = '<p>Contacts are temporarily unavailable.</p>'
    }
    const csrf = '<input type="hidden" name="csrf" value="' + session.csrf + '">'
    page(response, 200, 'Your notes',
      '<p>Signed in as ' + escapeHtml(session.name ?? 'a Gravitas account') + '.</p>' +
      (declined ? '<p>Permission request ended.</p>' : '') +
      '<form method="post" action="/notes">' + csrf +
      '<label>Note <input name="note" required maxlength="500"></label><button>Save note</button></form>' +
      '<ul>' + (notes.get(account) || []).map(note => '<li>' + escapeHtml(note) + '</li>').join('') + '</ul>' +
      (contacts || '<form method="post" action="/auth/gravitas/contacts">' + csrf +
        '<button>Connect contacts</button><p>Read your shared Gravitas contacts to show how many you have.</p></form>') +
      '<form method="post" action="/logout">' + csrf + '<button>Sign out of Notes</button></form>')
  }

  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    response.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const now = Date.now()
      for (const [key, value] of pending) if (value.expires <= now) pending.delete(key)
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key)
      const url = new URL(request.url, appOrigin)
      if (url.origin !== appOrigin) throw new HttpError(400, 'Invalid request origin.')
      const jar = cookies(request)
      const sessionKey = jar.get(sessionCookie)
      const transaction = jar.get(pendingCookie)
      const route = request.method + ' ' + url.pathname

      if (route === 'GET /auth/gravitas/start') return await start(response, transaction)
      if (route === 'GET ' + callbackPath) return await callback(url, response, transaction, sessionKey)
      if (route === 'POST /logout') {
        const fields = await form(request, appOrigin)
        if (!sessions.has(sessionKey) || sessions.get(sessionKey).csrf !== fields.get('csrf')) {
          throw new HttpError(403, 'Invalid sign-out request.')
        }
        sessions.delete(sessionKey)
        pending.delete(transaction)
        response.setHeader('Set-Cookie', [cookie(sessionCookie, '', 0), cookie(pendingCookie, '', 0)])
        return redirect(response, '/')
      }
      if (!['GET /', 'POST /notes', 'POST /auth/gravitas/contacts'].includes(route)) {
        throw new HttpError(404, 'Page unavailable.')
      }
      const fields = request.method === 'POST' ? await form(request, appOrigin) : null
      const session = await requireSession(sessionKey, response)
      if (!session) {
        if (route !== 'GET /') throw new HttpError(401, 'Sign in to continue.')
        return page(response, 200, 'Gravitas Notes', '<a href="/auth/gravitas/start">Sign in with Gravitas</a>')
      }

      const account = JSON.stringify([issuer, session.sub])
      if (fields && fields.get('csrf') !== session.csrf) throw new HttpError(403, 'Invalid form.')
      if (route === 'POST /auth/gravitas/contacts') return await start(response, transaction, sessionKey)
      if (route === 'POST /notes') {
        const note = fields.get('note')?.trim()
        if (!note || note.length > 500) throw new HttpError(400, 'Enter a note of 1–500 characters.')
        const items = notes.get(account) || []
        notes.set(account, [...items.slice(-99), note])
        return redirect(response, '/')
      }
      return await renderNotes(response, session, account, url.searchParams.get('connection') === 'declined')
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503
      const message = error instanceof HttpError ? error.message : 'Gravitas is temporarily unavailable. Try again.'
      page(response, status, message, '<p><a href="/">Return to Notes</a></p>')
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787)
  createNotesServer({
    appOrigin: process.env.APP_ORIGIN || 'http://127.0.0.1:' + port,
    issuer: process.env.GRAVITAS_ISSUER || 'https://gravitas.cool',
    allowLoopback: process.env.ALLOW_LOOPBACK_HTTP === '1'
  }).listen(port, '127.0.0.1', () => console.log('Notes listening on 127.0.0.1:' + port))
}
