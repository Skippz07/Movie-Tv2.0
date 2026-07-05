import CONFIG from './config.js';
import {
  buildTvEmbedUrl,
  getFailoverOrder,
  fillServerSelect,
  normalizePrimaryServer,
  DEFAULT_USER_SERVER,
} from './embedProviders.js';
import { playWithFailover } from './embedFailover.js';

const apiBaseURL = CONFIG.API_BASE_URL;
const apiKey = CONFIG.API_KEY;

const DEFAULT_SERVER = DEFAULT_USER_SERVER;
const PROGRESS_KEY = (tvId) => `tvWatchProgress:${tvId}`;
const CONTINUE_WATCHING_KEY = 'continueWatching';
const ORIGINAL_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

const playerState = {
  tvId: null,
  show: null,
  server: DEFAULT_SERVER,
  season: 1,
  episode: 1,
};

let cancelFailover = null;
let hasStartedPlayback = false;

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

async function applyTitleLogo(tvId, titleText) {
  try {
    const response = await fetch(buildApiUrl(`/tv/${tvId}/images?include_image_language=en,null`));
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
    console.error('Error fetching TV logo:', error);
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
    // Continue watching should not block detail loading.
  }
}

function setEmbedStatusLine(text) {
  const el = document.getElementById('embed-status-text');
  if (el) el.textContent = text || '';
}

function progressStorageKey() {
  return PROGRESS_KEY(playerState.tvId);
}

function readStoredProgress(tvId) {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY(tvId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    const season = Number(o.season);
    const episode = Number(o.episode);
    const server = normalizePrimaryServer(
      typeof o.server === 'string' ? o.server : DEFAULT_SERVER
    );
    if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
    return { season, episode, server };
  } catch {
    return null;
  }
}

function writeStoredProgress() {
  if (!playerState.tvId) return;
  sessionStorage.setItem(
    progressStorageKey(),
    JSON.stringify({
      season: playerState.season,
      episode: playerState.episode,
      server: playerState.server,
    })
  );
}

function populateServerSelect() {
  const serverSelect = document.getElementById('server-select');
  fillServerSelect(serverSelect, playerState.server);
  renderServerRail(serverSelect, (server) => {
    playerState.server = server;
    writeStoredProgress();
    syncServerRail(serverSelect);
    if (hasStartedPlayback) {
      playEpisode(playerState.season, playerState.episode, {
        scrollToPlayer: false,
      });
    }
  });
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

function applyShowDetails(show) {
  const bg = document.getElementById('background');
  const path = show.backdrop_path || show.poster_path;
  if (path) {
    bg.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${path})`;
  }
  const poster = document.getElementById('poster');
  if (show.poster_path) {
    poster.src = `https://image.tmdb.org/t/p/w500${show.poster_path}`;
    poster.alt = show.name || 'Poster';
  } else {
    poster.removeAttribute('src');
    poster.alt = '';
  }
  document.getElementById('title').textContent = show.name || '';
  applyTitleLogo(show.id, show.name || 'Series');
  const va = show.vote_average;
  document.getElementById('rating').textContent =
    typeof va === 'number' ? `Rating: ${va.toFixed(1)}` : 'Rating: —';
  document.getElementById('release-date').textContent = `First air: ${
    show.first_air_date || '—'
  }`;
  document.getElementById('description').textContent = show.overview || '';
}

function markContentReady() {
  document.getElementById('content').classList.add('content-ready');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fetchShow(tvId) {
  const data = await fetchJson(buildApiUrl(`/tv/${tvId}`));
  return data;
}

async function fetchSeasonsMeta(tvId) {
  const data = await fetchJson(buildApiUrl(`/tv/${tvId}`));
  const seasons = data.seasons || [];
  return filterNoise(seasons).filter((s) => s.season_number !== 0);
}

async function fetchEpisodes(tvId, seasonNumber) {
  const data = await fetchJson(buildApiUrl(`/tv/${tvId}/season/${seasonNumber}`));
  return filterNoise(data.episodes || []);
}

function filterNoise(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const label = (item.title || item.name || '').toLowerCase();
    return !label.includes('advertisement');
  });
}

function populateSeasonSelect(seasons) {
  const seasonSelect = document.getElementById('season-select');
  seasonSelect.innerHTML = '';
  seasons.forEach((season) => {
    const option = document.createElement('option');
    option.value = String(season.season_number);
    option.textContent = `Season ${season.season_number}`;
    seasonSelect.appendChild(option);
  });
  seasonSelect.disabled = seasons.length === 0;
}

function setActiveEpisodeRow(episodeNumber) {
  document.querySelectorAll('.episode-item').forEach((row) => {
    row.classList.toggle(
      'is-active',
      Number(row.dataset.episode) === Number(episodeNumber)
    );
  });
}

function playEpisode(seasonNum, episodeNum, { scrollToPlayer } = { scrollToPlayer: true }) {
  const s = Number(seasonNum);
  const e = Number(episodeNum);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return;

  hasStartedPlayback = true;
  cancelFailover?.();
  cancelFailover = null;

  playerState.season = s;
  playerState.episode = e;
  writeStoredProgress();

  const videoFrame = document.getElementById('video-frame');
  const infoContainer = document.getElementById('info-container');

  setEmbedStatusLine('Loading player…');
  setIframeLoading(true);
  expandPlayerShell(true);

  if (infoContainer) {
    infoContainer.style.display = 'none';
  }
  videoFrame.style.height = '';

  setActiveEpisodeRow(e);

  const orderedKeys = getFailoverOrder(playerState.server);

  cancelFailover = playWithFailover(videoFrame, {
    orderedKeys,
    buildUrl: (key) => buildTvEmbedUrl(key, playerState.tvId, s, e),
    onStatus: (msg) => {
      setEmbedStatusLine(msg || 'Loading player…');
    },
    onResolved: (key, reason) => {
      cancelFailover = null;
      if (key) {
        playerState.server = key;
        const sel = document.getElementById('server-select');
        if (sel) {
          sel.value = key;
          syncServerRail(sel);
        }
        writeStoredProgress();
      }
      setIframeLoading(false);
      if (reason === 'exhausted') {
        setEmbedStatusLine(
          'All sources timed out. Pick a server or try again.'
        );
      } else {
        setEmbedStatusLine('');
      }
    },
  });

  if (scrollToPlayer) {
    document.getElementById('iframe-container')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}

function populateEpisodeList(episodes) {
  const episodeList = document.getElementById('episode-list');
  episodeList.innerHTML = '';

  episodes.forEach((ep) => {
    const episodeItem = document.createElement('div');
    episodeItem.className = 'episode-item';
    episodeItem.dataset.episode = String(ep.episode_number);
    episodeItem.setAttribute('role', 'button');
    episodeItem.tabIndex = 0;

    const episodeNumber = document.createElement('span');
    episodeNumber.className = 'episode-number';
    episodeNumber.textContent = ep.episode_number;

    const episodeImageContainer = document.createElement('div');
    episodeImageContainer.className = 'episode-image-container';

    const episodeImage = document.createElement('img');
    episodeImage.className = 'episode-image';
    if (ep.still_path) {
      episodeImage.src = `https://image.tmdb.org/t/p/w500${ep.still_path}`;
    } else {
      episodeImage.classList.add('episode-image--placeholder');
    }
    episodeImage.alt = ep.name || `Episode ${ep.episode_number}`;
    episodeImage.loading = 'lazy';
    episodeImage.decoding = 'async';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'play-button';
    playBtn.innerHTML = '►';
    playBtn.setAttribute('aria-label', `Play episode ${ep.episode_number}`);

    const go = (ev) => {
      ev.stopPropagation();
      const season = Number(document.getElementById('season-select').value);
      playEpisode(season, ep.episode_number);
    };

    playBtn.addEventListener('click', go);
    episodeItem.addEventListener('click', go);
    episodeItem.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        go(ev);
      }
    });

    episodeImageContainer.appendChild(episodeImage);
    episodeImageContainer.appendChild(playBtn);

    const episodeDetails = document.createElement('div');
    episodeDetails.className = 'episode-details';

    const episodeTitle = document.createElement('h3');
    episodeTitle.className = 'episode-title';
    episodeTitle.textContent = ep.name || `Episode ${ep.episode_number}`;

    const episodeOverview = document.createElement('p');
    episodeOverview.className = 'episode-overview';
    episodeOverview.textContent = ep.overview || '';

    episodeDetails.appendChild(episodeTitle);
    episodeDetails.appendChild(episodeOverview);

    episodeItem.appendChild(episodeNumber);
    episodeItem.appendChild(episodeImageContainer);
    episodeItem.appendChild(episodeDetails);

    episodeList.appendChild(episodeItem);
  });
}

function pickInitialEpisode(stored, episodes) {
  if (!episodes.length) return 1;
  if (
    stored &&
    stored.season === playerState.season &&
    episodes.some((x) => x.episode_number === stored.episode)
  ) {
    return stored.episode;
  }
  return episodes[0].episode_number;
}

async function loadSeasonEpisodes(seasonNumber, show, stored) {
  const epSkeleton = document.getElementById('episode-skeleton');
  const episodeList = document.getElementById('episode-list');
  epSkeleton?.classList.remove('hidden');
  episodeList.innerHTML = '';

  const episodes = await fetchEpisodes(show.id, seasonNumber);
  epSkeleton?.classList.add('hidden');

  if (!episodes.length) {
    episodeList.innerHTML =
      '<p class="episode-empty">No episodes listed for this season.</p>';
    return;
  }

  populateEpisodeList(episodes);
  const startEp = pickInitialEpisode(stored, episodes);
  playerState.season = Number(seasonNumber);
  playerState.episode = startEp;
  setActiveEpisodeRow(startEp);
  writeStoredProgress();
}

function wireControls(show) {
  const seasonSelect = document.getElementById('season-select');
  const serverSelect = document.getElementById('server-select');

  serverSelect.addEventListener('change', () => {
    playerState.server = serverSelect.value;
    writeStoredProgress();
    syncServerRail(serverSelect);
    if (hasStartedPlayback) {
      playEpisode(playerState.season, playerState.episode, {
        scrollToPlayer: false,
      });
    }
  });

  seasonSelect.addEventListener('change', async () => {
    const sn = Number(seasonSelect.value);
    playerState.season = sn;
    await loadSeasonEpisodes(sn, show, null);
    writeStoredProgress();
  });

  document.getElementById('play-button')?.addEventListener('click', () => {
    playEpisode(playerState.season, playerState.episode, {
      scrollToPlayer: true,
    });
  });
}

async function fetchActors(tvId) {
  const data = await fetchJson(buildApiUrl(`/tv/${tvId}/credits`));
  return filterNoise(data.cast || []);
}

function populateActors(actors) {
  const actorsList = document.getElementById('actors-list');
  actorsList.classList.remove('is-loading');
  actorsList.innerHTML = '';
  (actors || []).slice(0, 12).forEach((actor) => {
    const actorItem = document.createElement('div');
    actorItem.className = 'actor-item';

    const actorImage = document.createElement('img');
    if (actor.profile_path) {
      actorImage.src = `https://image.tmdb.org/t/p/w185${actor.profile_path}`;
    }
    actorImage.alt = actor.name || '';
    actorImage.loading = 'lazy';
    actorImage.decoding = 'async';

    const actorName = document.createElement('p');
    actorName.textContent = actor.name;

    actorItem.appendChild(actorImage);
    actorItem.appendChild(actorName);
    actorsList.appendChild(actorItem);
  });
}

async function fetchRecommendations(tvId) {
  const data = await fetchJson(buildApiUrl(`/tv/${tvId}/recommendations`));
  return filterNoise(data.results || []);
}

function populateRecommendations(recommendations) {
  const recommendationsList = document.getElementById('recommendations-list');
  recommendationsList.classList.remove('is-loading');
  recommendationsList.innerHTML = '';

  (recommendations || []).slice(0, 12).forEach((recommendation) => {
    const mediaType = recommendation.media_type || 'tv';
    const recommendationItem = document.createElement('div');
    recommendationItem.className = 'recommendation-item';
    recommendationItem.dataset.id = recommendation.id;
    recommendationItem.dataset.type = mediaType;

    const recommendationImage = document.createElement('img');
    if (recommendation.poster_path) {
      recommendationImage.src = `https://image.tmdb.org/t/p/w342${recommendation.poster_path}`;
    }
    recommendationImage.alt = recommendation.name || '';
    recommendationImage.loading = 'lazy';
    recommendationImage.decoding = 'async';

    const recommendationTitle = document.createElement('p');
    recommendationTitle.className = 'recommendation-title';
    recommendationTitle.textContent = recommendation.name || '';

    const bookmarkIcon = document.createElement('i');
    bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon');
    bookmarkIcon.addEventListener('click', (event) =>
      toggleBookmark(event, recommendation.id, mediaType)
    );

    recommendationItem.appendChild(recommendationImage);
    recommendationItem.appendChild(recommendationTitle);
    recommendationItem.appendChild(bookmarkIcon);

    recommendationItem.addEventListener('click', () => {
      localStorage.setItem('selectedItem', JSON.stringify(recommendation));
      window.location.href = mediaType === 'tv' ? 'tvshow.html' : 'movie.html';
    });

    recommendationsList.appendChild(recommendationItem);
  });

  loadBookmarks();
}

function setupLazySections(tvId) {
  const actorsEl = document.getElementById('actors-container');
  const recEl = document.getElementById('recommendations-container');
  const actorsList = document.getElementById('actors-list');
  const recList = document.getElementById('recommendations-list');

  actorsList?.classList.add('is-loading');
  recList?.classList.add('is-loading');

  let actorsLoaded = false;
  let recLoaded = false;

  async function loadActorsOnce() {
    if (actorsLoaded) return;
    actorsLoaded = true;
    try {
      const cast = await fetchActors(tvId);
      populateActors(cast);
    } catch (e) {
      console.error(e);
      actorsList?.classList.remove('is-loading');
      if (actorsList) actorsList.textContent = 'Could not load cast.';
    }
  }

  async function loadRecsOnce() {
    if (recLoaded) return;
    recLoaded = true;
    try {
      const recs = await fetchRecommendations(tvId);
      populateRecommendations(recs);
    } catch (e) {
      console.error(e);
      recList?.classList.remove('is-loading');
      if (recList) recList.textContent = 'Could not load recommendations.';
    }
  }

  const io = new IntersectionObserver(
    async (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (entry.target === actorsEl) await loadActorsOnce();
        if (entry.target === recEl) await loadRecsOnce();
      }
      if (actorsLoaded && recLoaded) io.disconnect();
    },
    { rootMargin: '200px', threshold: 0.01 }
  );

  if (actorsEl) io.observe(actorsEl);
  if (recEl) io.observe(recEl);

  setTimeout(() => {
    loadActorsOnce();
    loadRecsOnce();
    if (actorsLoaded && recLoaded) io.disconnect();
  }, 2400);
}

function toggleBookmark(event, itemId, itemType) {
  event.stopPropagation();

  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  const index = bookmarks.findIndex(
    (item) => item.id === itemId && item.type === itemType
  );
  const itemDetails = event.currentTarget.parentNode;
  const itemName =
    itemDetails.querySelector('.recommendation-title')?.textContent ||
    itemDetails.querySelector('.title')?.textContent ||
    'Item';

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
  safeRefreshBookmarksList();
}

function safeRefreshBookmarksList() {
  const container = document.getElementById('bookmarked-items');
  if (!container) return;
  displayBookmarkedItems();
}

function loadBookmarks() {
  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  document.querySelectorAll('.recommendation-item').forEach((card) => {
    const itemId = Number(card.dataset.id);
    const itemType = card.dataset.type;
    const bookmarkIcon = card.querySelector('.bookmark-icon');
    if (
      bookmarks.some(
        (item) => item.id === itemId && item.type === itemType
      ) &&
      bookmarkIcon
    ) {
      bookmarkIcon.classList.add('bookmarked');
    } else if (bookmarkIcon) {
      bookmarkIcon.classList.remove('bookmarked');
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
  let url = `${apiBaseURL}${endpoint}`;
  if (apiKey) {
    const separator = endpoint.includes('?') ? '&' : '?';
    url = `${url}${separator}api_key=${apiKey}`;
  }
  const response = await fetch(url);
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

  if (type === 'movie' && item.release_date) {
    const year = document.createElement('div');
    year.classList.add('year');
    year.textContent = new Date(item.release_date).getFullYear();
    card.appendChild(year);
  }

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
    const endpoint =
      item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
    const data = await fetchData(`${endpoint}?`);
    if (data) {
      const card = createCard(data, item.type);
      container.appendChild(card);
    }
  });
}

document.getElementById('back-button')?.addEventListener('click', goHome);
document.querySelector('.player-back-button')?.addEventListener('click', goHome);

document.addEventListener('DOMContentLoaded', async () => {
  let selectedItem;
  try {
    selectedItem = JSON.parse(localStorage.getItem('selectedItem'));
  } catch {
    selectedItem = null;
  }

  const content = document.getElementById('content');

  if (!selectedItem) {
    if (content) content.textContent = 'No item selected.';
    return;
  }

  const isTv =
    selectedItem.media_type === 'tv' ||
    selectedItem.name ||
    selectedItem.first_air_date;

  if (!isTv) {
    window.location.href = 'movie.html';
    return;
  }

  addContinueWatchingItem(selectedItem, 'tv');

  playerState.tvId = selectedItem.id;
  const stored = readStoredProgress(playerState.tvId);
  if (stored) {
    playerState.server = normalizePrimaryServer(stored.server);
    playerState.season = stored.season;
    playerState.episode = stored.episode;
  }

  populateServerSelect();

  try {
    const show = await fetchShow(selectedItem.id);
    playerState.show = show;
    applyShowDetails(show);
    setPlayerTitle(show.name || selectedItem.name || 'Now Playing');
    markContentReady();

    const validSeasons = await fetchSeasonsMeta(selectedItem.id);
    if (!validSeasons.length) {
      document.getElementById('episode-list').textContent =
        'No seasons available.';
      return;
    }

    populateSeasonSelect(validSeasons);

    const seasonNumbers = validSeasons.map((s) => s.season_number);
    let startSeason = seasonNumbers[0];
    if (stored && seasonNumbers.includes(stored.season)) {
      startSeason = stored.season;
    }
    document.getElementById('season-select').value = String(startSeason);
    playerState.season = startSeason;

    await loadSeasonEpisodes(startSeason, show, stored);
    wireControls(show);
    setupLazySections(selectedItem.id);
  } catch (err) {
    console.error(err);
    if (content) {
      content.innerHTML =
        '<p>Could not load this series. Try again later.</p>';
    }
  }
});
