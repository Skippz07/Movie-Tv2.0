const TMDB_ORIGIN = 'https://api.themoviedb.org/3';

function applyQueryParams(targetUrl, query) {
  Object.entries(query || {}).forEach(([key, value]) => {
    if (key === 'path' || key.toLowerCase() === 'api_key') return;
    if (Array.isArray(value)) {
      value.forEach((item) => targetUrl.searchParams.append(key, item));
      return;
    }
    if (value != null) {
      targetUrl.searchParams.set(key, value);
    }
  });
}

export default async function handler(req, res) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'TMDB_API_KEY is not configured.' });
    return;
  }

  const pathParts = Array.isArray(req.query.path)
    ? req.query.path
    : [req.query.path].filter(Boolean);
  const tmdbPath = `/${pathParts.map(encodeURIComponent).join('/')}`;
  const targetUrl = new URL(`${TMDB_ORIGIN}${tmdbPath}`);

  applyQueryParams(targetUrl, req.query);
  targetUrl.searchParams.set('api_key', apiKey);

  try {
    const tmdbResponse = await fetch(targetUrl);
    const contentType =
      tmdbResponse.headers.get('content-type') || 'application/json; charset=utf-8';
    const body = await tmdbResponse.text();

    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600');
    res.status(tmdbResponse.status).send(body);
  } catch (error) {
    res.status(502).json({
      error: 'Could not reach TMDB.',
      detail: error.message,
    });
  }
}
