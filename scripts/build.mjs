import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Marked } from 'marked'

export const base = new URL(process.env.SITE_URL || 'https://jeethsuresh.github.io/gravitas/')
if (!base.pathname.endsWith('/') || base.search || base.hash) throw new Error('SITE_URL must be a site root ending in /')

const version = 1
const root = resolve('dist')
const absolute = path => new URL(path, base).href
const guide = (id, title, description, links) => ({
  id, title, description, links, path: id + '/index.md', html: id + '/', mimeType: 'text/markdown'
})
const asset = (id, title, description, path, mimeType, links, source) => ({
  id, title, description, links, path, mimeType, source
})

const guides = [
  guide('protocol', 'What is Gravitas?', 'Shared identity, consent and versioned services for apps.', [
    ['next', 'quickstart'], ['related', 'registry'], ['related', 'agents']
  ]),
  guide('quickstart', 'Build a notes app', 'Use the browser PKCE flow and create an app session that honors revocation.', [
    ['requires', 'protocol'], ['next', 'permissions'], ['example', 'notes-example'], ['related', 'ecosystem']
  ]),
  guide('permissions', 'Permissions and consent', 'Request contact access and handle scoped tokens, revocation and retries.', [
    ['requires', 'quickstart'], ['next', 'registry'], ['example', 'notes-example'], ['related', 'notifications']
  ]),
  guide('registry', 'Capability registry', 'Discover user capabilities, register a provider and invoke an exact contract version.', [
    ['requires', 'permissions'], ['next', 'notifications'], ['contract', 'appstore-contract']
  ]),
  guide('notifications', 'Appstore notifications', 'Register a receiving installation and send a notification through Bazaar.', [
    ['requires', 'registry'], ['next', 'ecosystem'], ['example', 'notify-example'], ['contract', 'appstore-contract']
  ]),
  guide('ecosystem', 'Join the ecosystem', 'Add a dashboard entry, publish a Bazaar listing and choose optional integrations.', [
    ['requires', 'quickstart'], ['related', 'notifications'], ['related', 'permissions'], ['related', 'agents']
  ]),
  guide('agents', 'Read with an agent', 'Crawl the Markdown and JSON resource graph over static HTTPS.', [
    ['next', 'protocol'], ['related', 'quickstart'], ['contract', 'appstore-contract']
  ])
]
const documents = [
  ...guides,
  asset('notes-example', 'Notes backend example', 'Runnable Node.js sign-in, contacts consent and protected notes.',
    'examples/notes.mjs', 'text/javascript', [['requires', 'quickstart'], ['related', 'permissions']], 'examples/notes.mjs'),
  asset('notify-example', 'Notification sender example', 'Node.js sender for Appstore targeted and broadcast invocations.',
    'examples/notify.mjs', 'text/javascript', [['requires', 'notifications'], ['contract', 'appstore-contract']], 'examples/notify.mjs'),
  asset('appstore-contract', 'Appstore 1.0.0 JSON contract', 'Immutable input, output and permissions for push.send and push.broadcast.',
    'contracts/appstore/1.0.0.json', 'application/json', [['related', 'registry'], ['example', 'notify-example']],
    'assets/contracts/appstore/1.0.0.json')
]
const catalog = new Map(documents.map(item => [item.id, item]))
const nodePath = id => 'mcp/nodes/' + id + '.json'
const resource = item => ({
  uri: absolute(item.path), name: item.id, title: item.title,
  description: item.description, mimeType: item.mimeType
})
const esc = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character])

async function write(path, contents) {
  const target = resolve(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, contents)
}
const writeJson = (path, data) => write(path, JSON.stringify(data, null, 2) + '\n')

const mark = '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>'
const source = 'https://github.com/jeethsuresh/gravitas'
function layout({ title, description, path = '', prefix = './', markdown, contents }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#171b17">
<title>${esc(title)} · Gravitas Docs</title>
<link rel="canonical" href="${absolute(path)}">
<link rel="stylesheet" href="${prefix}style.css">
<link rel="describedby" href="${prefix}llms.txt">
<link rel="alternate" type="application/json" title="Documentation resource graph" href="${prefix}mcp/index.json">
${markdown ? '<link rel="alternate" type="text/markdown" href="index.md">' : ''}
<script type="module" src="${prefix}site.js"></script>
</head>
<body class="${path ? 'guide-page' : 'home-page'}">
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="top-inner">
<a class="brand" href="${prefix}">${mark}<span>Gravitas <small>Docs</small></span></a>
<nav aria-label="Site"><a href="${prefix}quickstart/">Quickstart</a><a href="${prefix}agents/">For agents</a><a href="${source}">GitHub</a></nav>
</div></header>
${contents}
<footer class="footer"><div>
  <a class="brand" href="${prefix}">${mark}<span>Gravitas</span></a>
  <nav aria-label="Resources"><a href="${prefix}llms.txt">llms.txt</a><a href="${prefix}mcp/index.json">Resource graph</a><a href="${source}">Source</a></nav>
</div></footer>
</body>
</html>
`
}

const home = `<main id="main">
<section class="hero" aria-labelledby="hero-title"><div class="hero-inner">
  <div class="hero-copy">
    <p class="eyebrow"><span></span> Protocol documentation</p>
    <h1 id="hero-title">Gravitas<span>.</span></h1>
    <p class="intro">One account across apps, with explicit consent and a private way to call ecosystem services.</p>
    <div class="actions"><a class="button primary" href="./quickstart/">Build an app</a><a class="button quiet" href="./protocol/">Read the protocol</a></div>
  </div>
  <nav class="map" aria-label="Explore the Gravitas protocol">
    <div class="map-grid"></div>
    <div class="map-core" aria-hidden="true">${mark}<span>Gravitas</span></div>
    <a class="branch north" href="./quickstart/"><span class="branch-label"><i></i>Sign-in</span></a>
    <a class="branch west" href="./permissions/"><span class="branch-label"><i></i>Consent</span></a>
    <a class="branch east" href="./registry/"><span class="branch-label"><i></i>Discovery</span></a>
    <a class="branch south" href="./notifications/"><span class="branch-label"><i></i>Delivery</span></a>
  </nav>
</div></section>
<div class="home-content">
  <section class="directory" aria-labelledby="directory-title">
    <h2 id="directory-title">Developer guides</h2>
    <div class="directory-list">
      ${guides.slice(0, -1).map(item => `<a href="./${item.html}"><strong>${esc(item.title)}</strong><span>${esc(item.description)}</span></a>`).join('\n      ')}
    </div>
  </section>
  <section class="agent-strip" aria-labelledby="agent-title">
    <div><h2 id="agent-title">Reading with an agent?</h2><p>Start with the Markdown index or traverse the linked JSON resources.</p></div>
    <div class="actions"><a class="button outline" href="./llms.txt">llms.txt</a><a class="button outline" href="./mcp/index.json">JSON graph</a></div>
  </section>
</div>
</main>`

function renderGuide(item, markdown) {
  const headings = []
  const renderer = new Marked()
  renderer.use({
    renderer: {
      heading({ text, depth, tokens }) {
        const value = text.replace(/[\x60*]/g, '')
        const root = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const id = headings.some(heading => heading.id === root) ? root + '-' + headings.length : root
        if (depth === 2) headings.push({ value, id })
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      code({ text, lang }) {
        return `<div class="code"><div class="code-header"><span>${esc(lang || 'text')}</span></div><pre><code>${esc(text)}</code></pre></div>\n`
      }
    }
  })
  const body = renderer.parse(markdown)
  const next = catalog.get(item.links.find(([rel]) => rel === 'next')?.[1])
  return `<main id="main" class="docs-shell">
<aside class="sidebar"><nav aria-label="Developer guides"><p>Guides</p>${guides.map(link =>
    `<a href="../${link.html}"${link.id === item.id ? ' aria-current="page"' : ''}>${esc(link.title)}</a>`
  ).join('')}</nav></aside>
<article class="article">
  <header class="article-head"><a href="../" class="breadcrumb">Documentation</a>
  <h1>${esc(item.title)}</h1></header>
  ${body}
  ${next ? `<a class="next" href="../${next.html}"><span>Continue to</span><strong>${esc(next.title)}</strong></a>` : ''}
</article>
<aside class="on-page"><nav aria-label="On this page"><p>On this page</p>${headings.map(heading =>
    `<a href="#${heading.id}">${esc(heading.value)}</a>`
  ).join('')}<div class="formats"><a href="index.md">Markdown</a><a href="../${nodePath(item.id)}">Resource node</a></div></nav></aside>
</main>`
}

await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
await cp('assets/style.css', resolve(root, 'style.css'))
await cp('assets/site.js', resolve(root, 'site.js'))
await write('.nojekyll', '')
await write('index.html', layout({
  title: 'Developer documentation',
  description: 'Integrate Gravitas sign-in, consent, capability discovery and Appstore notifications.',
  contents: home
}))

for (const item of documents) {
  if (item.html) {
    const markdown = await readFile('content/' + item.id + '.md', 'utf8')
    await write(item.path, `# ${item.title}\n\n${markdown}\n[Resource node](../${nodePath(item.id)})\n`)
    await write(item.html + 'index.html', layout({
      title: item.title, description: item.description, path: item.html, prefix: '../',
      markdown: true, contents: renderGuide(item, markdown)
    }))
  } else {
    await write(item.path, await readFile(item.source))
  }

  const links = item.links.map(([rel, id]) => {
    if (!catalog.has(id)) throw new Error('Unknown resource: ' + id)
    return { rel, href: absolute(nodePath(id)) }
  })
  const metadata = item.id === 'appstore-contract'
    ? { upstream: 'https://github.com/jeethsuresh/appstore/blob/095d76b46afef28a9d55b36122b1410853f7d17d/protocols/appstore/1.0.0.json' }
    : {}
  await writeJson(nodePath(item.id), {
    schemaVersion: version, id: item.id, resource: resource(item),
    ...(item.html ? { html: absolute(item.html) } : {}), ...metadata, links
  })
}

await writeJson('mcp/index.json', {
  schemaVersion: version,
  name: 'Gravitas documentation',
  entrypoints: [absolute(nodePath('protocol')), absolute(nodePath('agents'))],
  resources: documents.map(item => ({ ...resource(item), node: absolute(nodePath(item.id)) }))
})

await write('llms.txt', `# Gravitas documentation

> Gravitas provides shared identity, explicit app consent and private versioned capability discovery and invocation.

Start with the overview and follow the quickstart. Use issuer plus subject to identify an account. Calls involving live users require the credentials and grants described in each guide.

## Guides

${guides.map(item => `- [${item.title}](${absolute(item.path)}): ${item.description}`).join('\n')}

## Examples and contracts

${documents.filter(item => !item.html).map(item => `- [${item.title}](${absolute(item.path)}): ${item.description}`).join('\n')}
- [Static resource graph](${absolute('mcp/index.json')}): Read the entrypoints and traverse node links over HTTP GET.
`)

await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', ...guides.map(item => item.html)].map(path => `  <url><loc>${esc(absolute(path))}</loc></url>`).join('\n')}
</urlset>
`)
console.log('Built ' + guides.length + ' guides and ' + documents.length + ' crawlable resources.')
