/**
 * TMDB-based iframe URL patterns, consolidated from common open-source players
 * (e.g. chromecrash/gptmov multi-embed lists, e-cinema SOURCES.md, community TMDB embed notes).
 * Domains change often; failed hosts are skipped via embedFailover.js.
 */

/** @type {Record<string, (tmdbId: number) => string>} */
export const MOVIE_EMBED_URL = {
  vidsrcpro: (id) => `https://vidsrc.pro/embed/movie/${id}`,
  vidsrcvip: (id) => `https://vidsrc.vip/embed/movie/${id}`,
  vidsrc: (id) => `https://vidsrc.vip/embed/movie/${id}`,
  vidsrcin: (id) => `https://vidsrc.in/embed/movie/${id}`,
  vidsrc_to: (id) => `https://vidsrc.to/embed/movie/${id}`,
  vidsrc_cc: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
  multiembed: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  superembed: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  autoembed: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
  embedsu: (id) => `https://embed.su/embed/movie/${id}?tmdb=1`,
  embed2: (id) => `https://www.2embed.cc/embed/${id}`,
  vidlink: (id) => `https://vidlink.pro/movie/${id}`,
};

/** @type {Record<string, (tmdbId: number, s: number, e: number) => string>} */
export const TV_EMBED_URL = {
  vidsrcpro: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`,
  vidsrcvip: (id, s, e) => `https://vidsrc.vip/embed/tv/${id}/${s}/${e}`,
  vidsrc: (id, s, e) => `https://vidsrc.icu/embed/tv/${id}/${s}/${e}`,
  vidsrcin: (id, s, e) => `https://vidsrc.in/embed/tv/${id}/${s}/${e}`,
  vidsrc_to: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  vidsrc_cc: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  multiembed: (id, s, e) =>
    `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  superembed: (id, s, e) =>
    `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  autoembed: (id, s, e) =>
    `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  embedsu: (id, s, e) =>
    `https://embed.su/embed/tv/${id}/${s}/${e}?tmdb=1`,
  embed2: (id, s, e) =>
    `https://www.2embed.cc/embedtv/${id}?s=${s}&e=${e}`,
  vidlink: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
};

/** Primary player providers. The first provider is the default. */
export const PRIMARY_SERVER_KEYS = [
  'vidlink',
  'superembed',
  'vidsrcpro',
  'vidsrcvip',
  'autoembed',
];

export const DEFAULT_USER_SERVER = 'vidlink';

/** Full fallback list for any code paths that still reference extended order. */
export const FAILOVER_ORDER = [
  ...PRIMARY_SERVER_KEYS,
  'vidsrc',
  'vidsrcin',
  'vidsrc_to',
  'vidsrc_cc',
  'multiembed',
  'embedsu',
  'embed2',
];

const LABELS = {
  vidsrcpro: 'VidSrc Pro',
  vidsrcvip: 'VidSrc.Vip',
  vidsrc: 'VidSrc',
  vidsrcin: 'Vid.In',
  vidsrc_to: 'VidSrc.to',
  vidsrc_cc: 'VidSrc.cc v2',
  multiembed: 'MultiEmbed',
  superembed: 'SuperEmbed',
  autoembed: 'AutoEmbed',
  embedsu: 'Embed.su',
  embed2: '2Embed',
  vidlink: 'VidLink',
};

export function embedLabel(key) {
  return LABELS[key] || key;
}

export function serverSlotLabel(key) {
  return embedLabel(key);
}

export function normalizePrimaryServer(key) {
  if (PRIMARY_SERVER_KEYS.includes(key)) return key;
  return DEFAULT_USER_SERVER;
}

export function buildMovieEmbedUrl(key, tmdbId) {
  const fn = MOVIE_EMBED_URL[key];
  if (!fn) return null;
  try {
    return fn(Number(tmdbId));
  } catch {
    return null;
  }
}

export function buildTvEmbedUrl(key, tmdbId, season, episode) {
  const fn = TV_EMBED_URL[key];
  if (!fn) return null;
  try {
    return fn(Number(tmdbId), Number(season), Number(episode));
  } catch {
    return null;
  }
}

/** Rotate among the primary providers, starting from preference. */
export function getFailoverOrder(preferredKey) {
  const preferred = normalizePrimaryServer(preferredKey);
  const keys = PRIMARY_SERVER_KEYS.filter(
    (k) => MOVIE_EMBED_URL[k] && TV_EMBED_URL[k]
  );
  const i = keys.indexOf(preferred);
  if (i > 0) return [...keys.slice(i), ...keys.slice(0, i)];
  if (i === 0) return [...keys];
  return [...keys];
}

export function isKnownServer(key) {
  return !!(MOVIE_EMBED_URL[key] && TV_EMBED_URL[key]);
}

export function fillServerSelect(selectEl, preferredKey = DEFAULT_USER_SERVER) {
  if (!selectEl) return;
  const pref = normalizePrimaryServer(preferredKey);
  selectEl.innerHTML = '';
  PRIMARY_SERVER_KEYS.forEach((value) => {
    if (!MOVIE_EMBED_URL[value] || !TV_EMBED_URL[value]) return;
    const o = document.createElement('option');
    o.value = value;
    o.textContent = embedLabel(value);
    selectEl.appendChild(o);
  });
  if (MOVIE_EMBED_URL[pref]) {
    selectEl.value = pref;
  }
}
