# Flix

## Run locally

Set the TMDB key on the server, then start the proxy/static server:

```powershell
$env:TMDB_API_KEY="your_tmdb_api_key"
node server.js
```

Open:

```text
http://127.0.0.1:3101
```

The browser now calls `/api/tmdb/...`; the real TMDB key stays in the server environment and is not shipped in `scripts/config.js`.

## Deploy on Vercel

This repo is Vercel-ready. Vercel serves the static HTML/CSS/JS and runs the TMDB proxy from:

```text
api/tmdb.js
```

In Vercel project settings, add this environment variable for Production and Preview:

```text
TMDB_API_KEY=your_new_tmdb_api_key
```

Then deploy from GitHub. The frontend should keep using:

```js
API_BASE_URL: '/api/tmdb'
```

Do not put the TMDB key back into frontend files.

## Popup and ad containment

The movie and TV players run in sandboxed iframes:

```html
sandbox="allow-scripts allow-same-origin allow-presentation"
```

Because `allow-popups` and top-navigation permissions are intentionally omitted, embedded players are not allowed to open new tabs/windows or redirect the main app page. This can contain popups from third-party frames, but it cannot remove ads rendered inside a third-party player itself because browsers isolate cross-origin iframe content.

Vercel security headers are defined in `vercel.json`. Cloudflare Pages can use the same headers from `_headers`. If you put an existing Vercel deployment behind Cloudflare instead, mirror those headers with a Cloudflare Transform Rule or Response Header Modification rule.
