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
