import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = new URL(process.env.SITE_URL || 'https://jeethsuresh.github.io/gravitas/')
const live = process.argv.includes('--live')
const cache = new Map()

function localPath(url) {
  assert.equal(url.origin, base.origin, url.href)
  assert.ok(url.pathname.startsWith(base.pathname), url.href)
  const path = url.pathname.slice(base.pathname.length)
  return path.endsWith('/') || !path ? path + 'index.html' : path
}

async function load(url) {
  const path = localPath(url)
  if (!cache.has(path)) {
    if (live) {
      const fetchUrl = new URL(url)
      fetchUrl.hash = ''
      const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(15000) })
      assert.equal(response.status, 200, fetchUrl.href)
      assert.equal(response.url, fetchUrl.href)
      cache.set(path, await response.text())
    } else {
      cache.set(path, await readFile(resolve('dist', path), 'utf8'))
    }
  }
  return cache.get(path)
}

const index = JSON.parse(await load(new URL('mcp/index.json', base)))
assert.equal(index.schemaVersion, 1)
const resources = new Map(index.resources.map(item => [item.node, item]))
assert.equal(resources.size, index.resources.length)
const seen = new Set()
const entrypoints = [...index.entrypoints]
const markdownIndex = await load(new URL('llms.txt', base))

while (entrypoints.length) {
  const url = entrypoints.shift()
  if (seen.has(url)) continue
  seen.add(url)
  const item = resources.get(url)
  assert.ok(item, 'Unlisted node ' + url)
  const node = JSON.parse(await load(new URL(url)))
  assert.equal(node.schemaVersion, index.schemaVersion)
  const { node: nodeUrl, ...entry } = item
  assert.equal(nodeUrl, url)
  assert.deepEqual(node.resource, entry)
  const resource = await load(new URL(entry.uri))
  assert.ok(resource.trim(), 'Empty resource ' + entry.uri)
  assert.ok(markdownIndex.includes(entry.uri), 'Missing Markdown index entry ' + entry.uri)
  if (node.html) {
    assert.ok(resource.startsWith('# ' + entry.title + '\n'))
    assert.ok((await load(new URL(node.html))).includes('rel="alternate" type="text/markdown"'))
  }
  for (const { rel, href } of node.links) {
    assert.ok(['next', 'requires', 'related', 'example', 'contract'].includes(rel), rel)
    entrypoints.push(href)
  }
}
assert.equal(seen.size, resources.size, 'Every resource should be reachable')

const htmlFiles = (await readdir('dist', { recursive: true })).filter(file => file.endsWith('.html'))
for (const file of htmlFiles) {
  const documentUrl = new URL(file.replace(/index\.html$/, ''), base)
  const html = await load(documentUrl)
  for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(raw, documentUrl)
    if (url.origin !== base.origin) continue
    const linked = await load(url)
    if (url.hash) {
      assert.ok(linked.includes('id="' + decodeURIComponent(url.hash.slice(1)) + '"'), 'Missing anchor ' + url)
    }
  }
}

const appstore = await load(new URL('contracts/appstore/1.0.0.json', base))
assert.equal(appstore, await readFile('assets/contracts/appstore/1.0.0.json', 'utf8'))
const contract = JSON.parse(appstore)
assert.equal(contract.protocol, 'appstore')
assert.equal(contract.version, '1.0.0')
assert.deepEqual(contract.capabilities.map(({ id, permissions }) => [id, permissions]), [
  ['push.send', ['appstore.push']],
  ['push.broadcast', ['appstore.push', 'appstore.push.broadcast']]
])
console.log('Verified ' + seen.size + ' resources and links on ' + htmlFiles.length + ' pages' + (live ? ' over HTTPS.' : '.'))
