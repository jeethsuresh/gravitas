# Gravitas protocol documentation

[Read the docs](https://jeethsuresh.github.io/gravitas/) ·
[Markdown index](https://jeethsuresh.github.io/gravitas/llms.txt) ·
[Static resource graph](https://jeethsuresh.github.io/gravitas/mcp/index.json)

The guides in `content/` generate HTML pages and Markdown resources. The resource catalog and per-topic graph nodes are generated from `scripts/build.mjs`. The exact Appstore 1.0.0 contract is copied from Bazaar at the source commit linked in its graph node.

## Build and verify

```sh
npm ci
npm run check
python3 -m http.server 8789 --directory dist
```

Requires Node.js 22 or later. Open the server at `http://localhost:8789/`. Set `SITE_URL` to a canonical site URL with a trailing slash when building for a different host. The GitHub Pages workflow runs the build and the example tests before publishing. To verify all Pages URLs after deployment, run `node scripts/check.mjs --live` after a local build.
