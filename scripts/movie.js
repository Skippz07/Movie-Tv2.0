import CONFIG from './config.js';
import {
  buildMovieEmbedUrl,
  getFailoverOrder,
  fillServerSelect,
  normalizePrimaryServer,
  DEFAULT_USER_SERVER,
} from './embedProviders.js';
import { playWithFailover } from './embedFailover.js';

const DEFAULT_SERVER = DEFAULT_USER_SERVER;
const MOVIE_SERVER_KEY = (id) => `movieWatchServer:${id}`;
const CONTINUE_WATCHING_KEY = 'continueWatching';
const ORIGINAL_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

function readMovieServer(tmdbId) {
  try {
    const raw = sessionStorage.getItem(MOVIE_SERVER_KEY(tmdbId));
    if (!raw) return DEFAULT_SERVER;
    const o = JSON.parse(raw);
    return normalizePrimaryServer(
      typeof o.server === 'string' ? o.server : DEFAULT_SERVER
    );
  } catch {
    return DEFAULT_SERVER;
  }
}

function writeMovieServer(tmdbId, server) {
  sessionStorage.setItem(
    MOVIE_SERVER_KEY(tmdbId),
    JSON.stringify({ server })
  );
}

function setEmbedStatusLine(text) {
  const el = document.getElementById('embed-status-text');
  if (el) el.textContent = text || '';
}

function setIframeLoading(isLoading) {
  const el = document.getElementById('iframe-loading');
  if (!el) return;
  el.classList.toggle('hidden', !isLoading);
}

function expandPlayerShell(active) {
  const wrap = document.getElementById('iframe-container');
  if (!wrap) return;
  wrap.classList.toggle('iframe-active', active);
  wrap.classList.toggle('iframe-collapsed', !active);
}

function goHome() {
  window.location.href = 'index.html';
}

function setPlayerTitle(text) {
  const el = document.querySelector('.player-title');
  if (el) el.textContent = text || 'Now Playing';
}

function renderServerRail(selectEl, onPick) {
  const rail = document.getElementById('server-rail-list');
  if (!rail || !selectEl) return;
  rail.innerHTML = '';
  const options = Array.from(selectEl.options);
  options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'server-rail-button';
    button.dataset.server = option.value;
    button.textContent = option.textContent;
    button.classList.toggle('is-active', option.value === selectEl.value);
    button.addEventListener('click', () => {
      selectEl.value = option.value;
      onPick(option.value);
    });
    rail.appendChild(button);
  });
  let wheelLock = false;
  rail.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (wheelLock) return;
    const currentIndex = options.findIndex((option) => option.value === selectEl.value);
    const nextIndex = Math.max(
      0,
      Math.min(options.length - 1, currentIndex + (event.deltaY > 0 ? 1 : -1))
    );
    if (nextIndex !== currentIndex && options[nextIndex]) {
      selectEl.value = options[nextIndex].value;
      onPick(options[nextIndex].value);
    }
    wheelLock = true;
    window.setTimeout(() => {
      wheelLock = false;
    }, 180);
  }, { passive: false });
  syncServerRail(selectEl);
}

function syncServerRail(selectEl) {
  const buttons = Array.from(document.querySelectorAll('.server-rail-button'));
  const activeIndex = buttons.findIndex((button) => button.dataset.server === selectEl.value);
  buttons.forEach((button, index) => {
    const offset = activeIndex < 0 ? index : index - activeIndex;
    const clamped = Math.max(-3, Math.min(3, offset));
    button.style.setProperty('--offset', String(clamped));
    button.dataset.offset = String(clamped);
    button.classList.toggle('is-active', offset === 0);
    button.classList.toggle('is-outer', Math.abs(offset) > 2);
  });
}

function pickBestLogo(logos = []) {
  if (!Array.isArray(logos) || !logos.length) return null;
  const weighted = logos
    .filter((logo) => logo?.file_path)
    .map((logo) => {
      const language = logo.iso_639_1 || 'null';
      const languageScore = language === 'en' ? 3 : language === 'null' ? 2 : 1;
      const voteScore = Number(logo.vote_average || 0);
      const widthScore = Math.min(Number(logo.width || 0) / 1000, 1);
      return { logo, score: languageScore * 10 + voteScore + widthScore };
    })
    .sort((a, b) => b.score - a.score);
  return weighted[0]?.logo?.file_path || null;
}

async function applyTitleLogo(movieId, titleText) {
  try {
    const response = await fetch(buildApiUrl(`/movie/${movieId}/images?include_image_language=en,null`));
    if (!response.ok) return;
    const data = await response.json();
    const logoPath = pickBestLogo(data?.logos || []);
    if (!logoPath) return;

    const title = document.getElementById('title');
    const details = document.getElementById('details');
    if (!title || !details) return;

    title.classList.add('has-title-logo');
    let logo = document.getElementById('title-logo');
    if (!logo) {
      logo = document.createElement('img');
      logo.id = 'title-logo';
      logo.className = 'detail-title-logo';
      details.insertBefore(logo, title);
    }
    logo.src = `${ORIGINAL_IMAGE_BASE}${logoPath}`;
    logo.alt = titleText;
  } catch (error) {
    console.error('Error fetching movie logo:', error);
  }
}

function addContinueWatchingItem(item, type) {
  try {
    const current = JSON.parse(localStorage.getItem(CONTINUE_WATCHING_KEY) || '[]');
    const list = Array.isArray(current) ? current : [];
    const compact = { ...item, type, media_type: type, watchedAt: Date.now() };
    const next = [
      compact,
      ...list.filter(
        (entry) => !(Number(entry.id) === Number(item.id) && entry.type === type)
      ),
    ].slice(0, 14);
    localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(next));
  } catch {
    // Continue watching is a convenience feature; playback should never depend on it.
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  let selectedItem;
  try {
    selectedItem = JSON.parse(localStorage.getItem('selectedItem'));
  } catch {
    selectedItem = null;
  }

  const videoFrame = document.getElementById('video-frame');
  const playButton = document.getElementById('play-button');
  const infoContainer = document.getElementById('info-container');
  const serverSelect = document.getElementById('server-select');

  let cancelFailover = null;
  let currentServer = DEFAULT_SERVER;
  let hasStartedPlayback = false;

  if (!selectedItem) {
    document.getElementById('content').textContent = 'No item selected.';
    document.getElementById('back-button')?.addEventListener('click', goHome);
    return;
  }

  if (selectedItem.name && !selectedItem.title) {
    window.location.href = 'tvshow.html';
    return;
  }

  addContinueWatchingItem(selectedItem, 'movie');

  currentServer = readMovieServer(selectedItem.id);
  fillServerSelect(serverSelect, currentServer);
  renderServerRail(serverSelect, (server) => {
    currentServer = server;
    writeMovieServer(selectedItem.id, currentServer);
    syncServerRail(serverSelect);
    if (hasStartedPlayback) startMoviePlayback();
  });

  displayItemDetails(selectedItem);
  setPlayerTitle(selectedItem.title || selectedItem.name || 'Now Playing');

  function startMoviePlayback() {
    hasStartedPlayback = true;
    cancelFailover?.();
    cancelFailover = null;

    setEmbedStatusLine('Loading player…');
    setIframeLoading(true);
    expandPlayerShell(true);

    const orderedKeys = getFailoverOrder(serverSelect.value || currentServer);

    cancelFailover = playWithFailover(videoFrame, {
      orderedKeys,
      buildUrl: (key) => buildMovieEmbedUrl(key, selectedItem.id),
      onStatus: (msg) => setEmbedStatusLine(msg || 'Loading player…'),
      onResolved: (key, reason) => {
        cancelFailover = null;
        if (key) {
          currentServer = key;
          serverSelect.value = key;
          writeMovieServer(selectedItem.id, key);
          syncServerRail(serverSelect);
        }
        setIframeLoading(false);
        if (reason === 'exhausted') {
          setEmbedStatusLine(
            'All sources timed out. Pick another server or try again.'
          );
        } else {
          setEmbedStatusLine('');
        }
      },
    });
  }

  serverSelect.addEventListener('change', () => {
    currentServer = serverSelect.value;
    writeMovieServer(selectedItem.id, currentServer);
    syncServerRail(serverSelect);
    if (hasStartedPlayback) startMoviePlayback();
  });

  playButton.addEventListener('click', () => {
    infoContainer.style.display = 'none';
    startMoviePlayback();
    document.getElementById('iframe-container')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });

  await loadActors(selectedItem.id);
  await loadRecommendations(selectedItem.id);
  loadBookmarks();

  document.getElementById('back-button')?.addEventListener('click', goHome);
  document.querySelector('.player-back-button')?.addEventListener('click', goHome);
});

async function loadActors(movieId) {
  try {
    const response = await fetch(buildApiUrl(`/movie/${movieId}/credits`));
    const data = await response.json();
    const actors = data.cast.slice(0, 5);
    populateActorsList(actors);
  } catch (error) {
    console.error('Error fetching actors:', error);
  }
}

function populateActorsList(actors) {
  const actorsList = document.getElementById('actors-list');
  actorsList.innerHTML = '';
  actors.forEach((actor) => {
    const actorItem = document.createElement('div');
    actorItem.className = 'actor-item';

    const actorImage = document.createElement('img');
    actorImage.src = `https://image.tmdb.org/t/p/w500${actor.profile_path}`;
    actorImage.alt = actor.name;
    actorImage.loading = 'lazy';

    const actorName = document.createElement('p');
    actorName.textContent = actor.name;

    actorItem.appendChild(actorImage);
    actorItem.appendChild(actorName);

    actorsList.appendChild(actorItem);
  });
}

async function loadRecommendations(movieId) {
  try {
    const response = await fetch(buildApiUrl(`/movie/${movieId}/recommendations`));
    const data = await response.json();
    const recommendations = data.results.slice(0, 10);
    populateRecommendationsList(recommendations);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
  }
}

function populateRecommendationsList(recommendations) {
  const recommendationsList = document.getElementById('recommendations-list');
  recommendationsList.innerHTML = '';
  recommendations.forEach((item) => {
    const recommendationItem = document.createElement('div');
    recommendationItem.className = 'recommendation-item';
    recommendationItem.dataset.id = item.id;
    recommendationItem.dataset.type = 'movie';

    const recommendationImage = document.createElement('img');
    recommendationImage.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
    recommendationImage.alt = item.title || item.name;
    recommendationImage.loading = 'lazy';

    const recommendationTitle = document.createElement('p');
    recommendationTitle.className = 'recommendation-title';
    recommendationTitle.textContent = item.title || item.name;

    const bookmarkIcon = document.createElement('i');
    bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon');
    bookmarkIcon.addEventListener('click', (event) =>
      toggleBookmark(event, item.id, 'movie')
    );

    recommendationItem.appendChild(recommendationImage);
    recommendationItem.appendChild(recommendationTitle);
    recommendationItem.appendChild(bookmarkIcon);

    recommendationsList.appendChild(recommendationItem);

    recommendationItem.addEventListener('click', () => {
      localStorage.setItem('selectedItem', JSON.stringify(item));
      window.location.href = 'movie.html';
    });
  });

  loadBookmarks();
}

function displayItemDetails(item) {
  const imagePath = item.backdrop_path || item.poster_path;
  if (imagePath) {
    document.getElementById('background').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${imagePath})`;
  }
  const poster = document.getElementById('poster');
  if (item.poster_path) {
    poster.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
    poster.alt = item.title || item.name || 'Poster';
  } else {
    poster.removeAttribute('src');
    poster.alt = '';
  }
  document.getElementById('title').textContent = item.title || item.name;
  applyTitleLogo(item.id, item.title || item.name || 'Movie');
  document.getElementById('description').textContent =
    item.overview || 'No overview available.';
  document.getElementById('rating').textContent =
    typeof item.vote_average === 'number'
      ? `Rating: ${item.vote_average.toFixed(1)}`
      : 'Rating: -';
  document.getElementById('release-date').textContent = `Release Date: ${
    item.release_date || item.first_air_date || '-'
  }`;
}

function toggleBookmark(event, itemId, itemType) {
  event.stopPropagation();

  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  const index = bookmarks.findIndex(
    (item) => item.id === itemId && item.type === itemType
  );
  const itemDetails = event.currentTarget.parentNode;
  const itemName = itemDetails.querySelector('p')?.textContent || 'Item';
  const iconEl = event.currentTarget;

  if (index !== -1) {
    bookmarks.splice(index, 1);
    iconEl.classList.remove('bookmarked');
    showPopupMessage(`${itemName} has been removed from bookmarks!`);
  } else {
    bookmarks.push({ id: itemId, type: itemType });
    iconEl.classList.add('bookmarked');
    showPopupMessage(`${itemName} has been added to bookmarks!`);
  }

  localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  const container = document.getElementById('bookmarked-items');
  if (container) displayBookmarkedItems();
}

function loadBookmarks() {
  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  document.querySelectorAll('.recommendation-item').forEach((card) => {
    const itemId = Number(card.dataset.id);
    const itemType = card.dataset.type;
    const bookmarkIcon = card.querySelector('.bookmark-icon');
    if (
      bookmarks.some((item) => item.id === itemId && item.type === itemType)
    ) {
      bookmarkIcon?.classList.add('bookmarked');
    } else {
      bookmarkIcon?.classList.remove('bookmarked');
    }
  });
}

function showPopupMessage(message) {
  let popup = document.getElementById('popup-message');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'popup-message';
    popup.classList.add('popup-message');
    document.body.appendChild(popup);
  }
  popup.textContent = message;
  popup.style.display = 'block';
  setTimeout(() => {
    popup.classList.add('show');
    setTimeout(() => {
      popup.classList.remove('show');
      setTimeout(() => {
        popup.style.display = 'none';
      }, 500);
    }, 2000);
  }, 10);
}

async function fetchData(endpoint) {
  const response = await fetch(buildApiUrl(endpoint));
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

function buildApiUrl(endpoint) {
  const [path, query = ''] = endpoint.split('?');
  const params = new URLSearchParams(query);
  params.set('path', path);
  let url = `${CONFIG.API_BASE_URL}?${params.toString()}`;
  if (CONFIG.API_KEY) {
    url = `${url}&api_key=${CONFIG.API_KEY}`;
  }
  return url;
}

function createCard(item, type) {
  const card = document.createElement('div');
  card.classList.add('card');
  card.dataset.id = item.id;
  card.dataset.type = type;
  const poster = document.createElement('img');
  if (item.poster_path) {
    poster.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  }
  poster.alt = item.title || item.name || 'Poster';
  poster.loading = 'lazy';
  card.appendChild(poster);
  const playButton = document.createElement('div');
  playButton.classList.add('play-button');
  playButton.innerHTML = '<i class="fas fa-play"></i>';
  card.appendChild(playButton);
  const title = document.createElement('div');
  title.classList.add('title');
  title.textContent = item.title || item.name;
  card.appendChild(title);
  const bookmarkIcon = document.createElement('i');
  bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon');
  bookmarkIcon.addEventListener('click', (event) =>
    toggleBookmark(event, item.id, type)
  );
  card.appendChild(bookmarkIcon);
  card.addEventListener('click', () => {
    localStorage.setItem('selectedItem', JSON.stringify(item));
    window.location.href = type === 'tv' ? 'tvshow.html' : 'movie.html';
  });
  return card;
}

function displayBookmarkedItems() {
  const container = document.getElementById('bookmarked-items');
  if (!container) return;
  container.innerHTML = '';
  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  bookmarks.forEach(async (item) => {
    const data = await fetchData(`/${item.type}/${item.id}?`);
    const card = createCard(data, item.type);
    container.appendChild(card);
  });
}
