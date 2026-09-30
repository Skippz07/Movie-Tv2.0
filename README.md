# Flix

## Run locally

Set the TMDB key on the server, then start the proxy/static server:

```powershell
$env:TMDB_API_KEY="your_tmdb_api_key"
npm start
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

## Site quality and app installation

`npm run build` creates the public-only deployment folder and PNG app icons.
Vercel uses `vercel.json` to build this folder, enforce security headers, and route API calls.
Vercel provides HTTPS and redirects HTTP automatically; local development remains HTTP.
Never expose the repository root with a generic static server.

Canonical URLs and the sitemap use `https://shows4u.vercel.app/`. Update both HTML metadata and
`sitemap.xml` / `robots.txt` when moving domains. Detail links use `movie.html?id=238` or
`tvshow.html?id=1399`, so bookmarks and shared links no longer depend on browser storage.
Title metadata and Movie/TVSeries structured data are populated after TMDB responds.
Social crawlers that do not execute JavaScript see the generic page metadata.

The passcode remains enabled by request, so the catalog cannot be normally indexed.
The sitemap intentionally lists only the home URL, not private watchlists or empty detail pages.
The existing client-side passcode is a convenience gate, not secure authentication.
Server-side authentication would be required to protect private content.

Supported browsers offer app installation; the Install Flix button appears when the browser
supports the install prompt. On iOS, use Safari's Share > Add to Home Screen.
Offline navigation shows a reconnect screen. Videos, API responses and private pages are not cached.
Service worker updates activate when existing tabs close, avoiding mixed application versions.

Hero images use responsive sizes and loading priority, posters reserve their dimensions,
and reduced-motion settings disable carousel autoplay. Measure deployed Core Web Vitals with
PageSpeed Insights and field data after deployment; these changes do not guarantee a score.
