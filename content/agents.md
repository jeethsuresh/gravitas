Every guide is available as HTML and plain Markdown. Agents can start with [llms.txt](../llms.txt) or traverse a versioned [JSON resource graph](../mcp/index.json) with ordinary HTTP GET requests.

## Walk the graph

1. Fetch `mcp/index.json` and choose one URI from `entrypoints`. Each entrypoint is a node URL.
2. Fetch a node. Its `resource.uri` is the canonical content URL and `resource.mimeType` identifies the format. Read it when relevant. Its `html` field points to the human-readable page when one exists.
3. Traverse the node’s `links` using the `rel` that fits the task. `next` follows a tutorial, `requires` leads to a prerequisite, `related` connects concepts, `example` points to code, and `contract` provides machine-readable interface data.
4. Keep a visited set of node URLs because related nodes can link back to each other. Stay inside the documentation base URL when traversing graph edges. Markdown guides can link out to upstream source references.

For an end-to-end adoption task, follow **Overview → Build a notes app → Permissions and consent → Capability registry → Appstore notifications**. Use the contract node to validate Appstore payloads and the example nodes for runnable source.

## Resource format

The graph’s `schemaVersion: 1` describes this static file format. Its `resources` array uses the MCP-style fields `uri`, `name`, `description` and `mimeType`. Each item adds a `node` URL for graph traversal. GitHub Pages serves read-only files over GET. An MCP client that expects JSON-RPC can use the catalog as input to its own resource adapter.

```js
const root = new URL('https://jeethsuresh.github.io/gravitas/mcp/index.json')
const scope = new URL('../', root).href
const index = await fetch(root, { redirect: 'error' }).then(async response => {
  if (!response.ok) throw new Error('Graph index unavailable')
  return response.json()
})
const queue = [index.entrypoints[0]]
const visited = new Set()

while (queue.length) {
  const url = queue.shift()
  if (visited.has(url) || !new URL(url).href.startsWith(scope)) continue
  visited.add(url)
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) throw new Error('Graph node unavailable: ' + url)
  const node = await response.json()
  console.log(node.resource.name, node.resource.uri)
  queue.push(...node.links.filter(link => link.rel === 'next').map(link => link.href))
}
```

When using a page in an answer, cite its HTML or Markdown URL. The copied Appstore JSON links to the version-pinned upstream contract. Read the live IAM discovery document for the configured issuer before implementing a live integration.
