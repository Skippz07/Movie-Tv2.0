const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3101);
const HOST = process.env.HOST || '127.0.0.1';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const ROOT = path.join(__dirname, 'public');
const TMDB_ORIGIN = 'https://api.themoviedb.org/3';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
}

async function proxyTmdb(req, res) {
  if (!TMDB_API_KEY) {
    sendJson(res, 500, {
      error: 'TMDB_API_KEY is not set on the server.',
    });
    return;
  }

  const incomingUrl = new URL(req.url, `http://${req.headers.host}`);
  const explicitPath = incomingUrl.searchParams.get('path');
  const tmdbPath =
    explicitPath || incomingUrl.pathname.replace(/^\/api\/tmdb/, '') || '/';
  if (!/^\/(movie|tv|search|trending|genre)\/[a-zA-Z0-9_/-]+$/.test(tmdbPath)) {
    sendJson(res, 400, { error: 'Invalid TMDB path.' });
    return;
  }
  const targetUrl = new URL(`${TMDB_ORIGIN}${tmdbPath}`);

  incomingUrl.searchParams.forEach((value, key) => {
    if (key !== 'path' && key.toLowerCase() !== 'api_key') {
      targetUrl.searchParams.set(key, value);
    }
  });
  targetUrl.searchParams.set('api_key', TMDB_API_KEY);

  try {
    const tmdbResponse = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
    const contentType =
      tmdbResponse.headers.get('content-type') || 'application/json; charset=utf-8';
    const body = Buffer.from(await tmdbResponse.arrayBuffer());

    send(res, tmdbResponse.status, body, {
      'content-type': contentType,
      'cache-control': tmdbResponse.ok ? 'public, max-age=300' : 'no-store',
    });
  } catch (error) {
    sendJson(res, 502, {
      error: 'Could not reach TMDB.',
      detail: error.message,
    });
  }
}

function serveStatic(req, res) {
  const incomingUrl = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath =
    incomingUrl.pathname === '/' ? '/index.html' : decodeURIComponent(incomingUrl.pathname);
  const filePath = path.resolve(ROOT, `.${requestedPath}`);

  if (!filePath.startsWith(ROOT + path.sep)) {
    send(res, 403, 'Forbidden', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
      return;
    }

    send(res, 200, data, {
      'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
  });
}

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }
  if (req.url.startsWith('/api/tmdb')) {
    proxyTmdb(req, res);
    return;
  }

  try { serveStatic(req, res); } catch { send(res, 400, 'Bad request'); }
});

server.listen(PORT, HOST, () => {
  console.log(`Flix running at http://${HOST}:${PORT}`);
  if (!TMDB_API_KEY) {
    console.warn('Set TMDB_API_KEY before running so API requests work.');
  }
});
