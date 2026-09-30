const meta = (name, content, property = false) => {
  const attr = property ? 'property' : 'name';
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.append(el); }
  el.content = content;
};

export function detailUrl(type, id) {
  return `${type === 'tv' ? 'tvshow' : 'movie'}.html?id=${encodeURIComponent(id)}`;
}

export async function selectedTitle(type) {
  const id = new URLSearchParams(location.search).get('id');
  if (id !== null) {
    if (!/^[1-9]\d*$/.test(id)) return null;
    try {
      const response = await fetch(`/api/tmdb?path=${encodeURIComponent(`/${type}/${id}`)}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) return null;
      return { ...await response.json(), media_type: type };
    } catch { return null; }
  }
  try { return JSON.parse(localStorage.getItem('selectedItem')); } catch { return null; }
}

export function titleMetadata(item, type) {
  const title = item.title || item.name;
  document.title = `${title} | Flix`;
  const description = (item.overview || `Explore ${title}, its cast and related titles on Flix.`).slice(0, 160);
  meta('description', description);
  const canonical = document.querySelector('link[rel="canonical"]');
  const url = new URL(detailUrl(type, item.id), canonical?.href || location.href).href;
  if (canonical) canonical.href = url;
  meta('og:title', document.title, true);
  meta('og:description', description, true);
  meta('og:url', url, true);
  meta('og:type', type === 'tv' ? 'video.tv_show' : 'video.movie', true);
  const image = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;
  if (image) meta('og:image', image, true);
  const schema = document.getElementById('page-schema') || document.createElement('script');
  schema.id = 'page-schema'; schema.type = 'application/ld+json';
  schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': type === 'tv' ? 'TVSeries' : 'Movie', name: title, description, url, image, datePublished: item.release_date || item.first_air_date || undefined });
  if (!schema.isConnected) document.head.append(schema);
}

let installPrompt;
const installButton = document.getElementById('install-app');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event;
  if (installButton) installButton.hidden = false;
});
installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt(); await installPrompt.userChoice;
  installPrompt = null; installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { if (installButton) installButton.hidden = true; });
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error), { once: true });
}
