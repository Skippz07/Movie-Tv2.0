import CONFIG from './config.js';

const apiBaseURL = CONFIG.API_BASE_URL;
const apiKey = CONFIG.API_KEY;
let currentFeaturedIndex = 0; // Initialize currentFeaturedIndex
let activeSearchFilter = 'all';
let latestSearchToken = 0;
let searchDebounceTimer = null;
let lastSearchQuery = '';
let lastSearchResults = { movies: [], tv: [] };
let activeBrowseType = 'movie';
let genreCache = { movie: [], tv: [] };

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const ORIGINAL_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';
const CONTINUE_WATCHING_KEY = 'continueWatching';
const PLACEHOLDER_POSTER =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="%23151821"/><text x="50%" y="50%" fill="%238b93a6" font-family="Arial, sans-serif" font-size="30" text-anchor="middle">No poster</text></svg>';

let posterObserver = null;
let featuredEmblaApi = null;
let featuredAutoplay = null;
const logoCache = new Map();

function getPosterObserver() {
    if (posterObserver || !('IntersectionObserver' in window)) return posterObserver;
    posterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
            img.classList.remove('lazy-poster');
            observer.unobserve(img);
        });
    }, { rootMargin: '300px 0px', threshold: 0.01 });
    return posterObserver;
}

function prepareLazyPoster(img, posterPath) {
    img.src = PLACEHOLDER_POSTER;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!posterPath) return;

    const src = `${IMAGE_BASE}${posterPath}`;
    const observer = getPosterObserver();
    if (observer) {
        img.dataset.src = src;
        img.classList.add('lazy-poster');
        observer.observe(img);
    } else {
        img.src = src;
    }
}

function typeLabel(type) {
    return type === 'tv' ? 'Series' : 'Movie';
}

function formatYear(item) {
    const rawDate = item.release_date || item.first_air_date;
    if (!rawDate) return typeLabel(item.media_type || item.type);
    const year = new Date(rawDate).getFullYear();
    return Number.isFinite(year) ? String(year) : typeLabel(item.media_type || item.type);
}

function ratingLabel(item) {
    const rating = Number(item.vote_average || 0);
    return rating > 0 ? rating.toFixed(1) : 'New';
}

function titleText(item) {
    return item.title || item.name || 'Untitled';
}

function mediaTypeForItem(item, fallback = 'movie') {
    if (item.media_type === 'movie' || item.media_type === 'tv') return item.media_type;
    if (item.first_air_date || item.name) return 'tv';
    if (item.release_date || item.title) return 'movie';
    return fallback;
}

function pickBestLogo(logos = []) {
    if (!Array.isArray(logos) || !logos.length) return null;
    const weighted = logos
        .filter(logo => logo?.file_path)
        .map(logo => {
            const language = logo.iso_639_1 || 'null';
            const languageScore = language === 'en' ? 3 : language === 'null' ? 2 : 1;
            const voteScore = Number(logo.vote_average || 0);
            const widthScore = Math.min(Number(logo.width || 0) / 1000, 1);
            return { logo, score: languageScore * 10 + voteScore + widthScore };
        })
        .sort((a, b) => b.score - a.score);
    return weighted[0]?.logo?.file_path || null;
}

async function fetchTitleLogo(type, id) {
    const cacheKey = `${type}:${id}`;
    if (logoCache.has(cacheKey)) return logoCache.get(cacheKey);

    const endpoint = `/${type}/${id}/images?include_image_language=en,null`;
    const data = await fetchJson(endpoint);
    const logoPath = pickBestLogo(data?.logos || []);
    logoCache.set(cacheKey, logoPath);
    return logoPath;
}

function createTitleLogoElement(item, logoPath, className = 'title-logo') {
    if (!logoPath) return null;
    const img = document.createElement('img');
    img.className = className;
    img.src = `${ORIGINAL_IMAGE_BASE}${logoPath}`;
    img.alt = titleText(item);
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
}

document.getElementById('movies-selector').addEventListener('click', async () => {
    document.getElementById('movies-section').classList.remove('hidden');
    document.getElementById('tv-shows-section').classList.add('hidden');
    document.getElementById('movies-selector').classList.add('selected');
    document.getElementById('tv-selector').classList.remove('selected');
    await updateBrowseType('movie');
    await displayMovies();
});

document.getElementById('tv-selector').addEventListener('click', async () => {
    document.getElementById('movies-section').classList.add('hidden');
    document.getElementById('tv-shows-section').classList.remove('hidden');
    document.getElementById('movies-selector').classList.remove('selected');
    document.getElementById('tv-selector').classList.add('selected');
    await updateBrowseType('tv');
    await displayTVShows();
});


async function fetchData(endpoint) {
    try {
        let url = buildApiUrl(endpoint);
        if (apiKey) {
            url = `${url}&api_key=${apiKey}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('Failed to fetch data:', error);
        return [];
    }
}

async function fetchJson(endpoint) {
    try {
        let url = buildApiUrl(endpoint);
        if (apiKey) {
            url = `${url}&api_key=${apiKey}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error('Failed to fetch data:', error);
        return null;
    }
}

function buildApiUrl(endpoint) {
    const [path, query = ''] = endpoint.split('?');
    const params = new URLSearchParams(query);
    params.set('path', path);
    return `${apiBaseURL}?${params.toString()}`;
}

function createSkeletonCard() {
    const skeleton = document.createElement('div');
    skeleton.className = 'card card-skeleton';
    skeleton.innerHTML = `
        <div class="skeleton-poster-tile"></div>
        <div class="skeleton-card-info">
            <span></span>
            <small></small>
        </div>
    `;
    return skeleton;
}

function setRowSkeleton(containerId, count = 8) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
        container.appendChild(createSkeletonCard());
    }
}

function renderRow(containerId, items, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
        container.appendChild(createCard(item, type));
    });
    updateArrows(containerId);
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.dataset.id = item.id;
    card.dataset.type = type;

    const poster = document.createElement('img');
    poster.alt = item.title || item.name || 'Poster';
    prepareLazyPoster(poster, item.poster_path);
    card.appendChild(poster);

    const playButton = document.createElement('div');
    playButton.classList.add('play-button');
    playButton.innerHTML = '<i class="fas fa-play"></i>';
    card.appendChild(playButton);

    const title = document.createElement('div');
    title.classList.add('title');
    title.textContent = item.title || item.name;

    const meta = document.createElement('div');
    meta.classList.add('card-meta');

    const mediaType = document.createElement('span');
    mediaType.textContent = typeLabel(type);

    const year = document.createElement('span');
    year.textContent = formatYear({ ...item, type });

    const rating = document.createElement('span');
    rating.innerHTML = `<i class="fas fa-star"></i> ${ratingLabel(item)}`;

    meta.appendChild(mediaType);
    meta.appendChild(year);
    meta.appendChild(rating);

    const info = document.createElement('div');
    info.classList.add('card-info');
    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(info);

    const bookmarkIcon = document.createElement('i');
    bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon');
    
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
    if (bookmarks.some(bookmark => bookmark.id === item.id && bookmark.type === type)) {
        bookmarkIcon.classList.add('bookmarked');
    }

    bookmarkIcon.addEventListener('click', (event) => toggleBookmark(event, item.id, type));
    card.appendChild(bookmarkIcon);

    card.addEventListener('click', () => {
        addContinueWatchingItem(item, type);
        localStorage.setItem('selectedItem', JSON.stringify(item));
        window.location.href = type === 'tv' ? 'tvshow.html' : 'movie.html';
    });

    return card;
}

function addContinueWatchingItem(item, type) {
    const current = readContinueWatching();
    const compact = {
        ...item,
        type,
        media_type: type,
        watchedAt: Date.now(),
    };
    const next = [
        compact,
        ...current.filter(entry => !(Number(entry.id) === Number(item.id) && entry.type === type)),
    ].slice(0, 14);
    localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(next));
}

function readContinueWatching() {
    try {
        const raw = localStorage.getItem(CONTINUE_WATCHING_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function displayContinueWatching() {
    const section = document.getElementById('continue-watching-section');
    const container = document.getElementById('continue-watching');
    if (!section || !container) return;

    const items = readContinueWatching();
    section.classList.toggle('hidden', items.length === 0);
    container.innerHTML = '';

    items.forEach(item => {
        container.appendChild(createCard(item, item.type || item.media_type || 'movie'));
    });

    if (items.length) updateArrows('continue-watching');
}


function toggleBookmark(event, itemId, itemType) {
    event.stopPropagation(); // Prevent triggering the card click event

    const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
    const index = bookmarks.findIndex(item => item.id === itemId && item.type === itemType);
    const itemDetails = event.currentTarget.parentNode; 
    const itemName = itemDetails.querySelector('.title').textContent; 

    if (index !== -1) {
        // Remove bookmark
        bookmarks.splice(index, 1);
        event.target.classList.remove('bookmarked');
        showPopupMessage(`${itemName} has been removed from bookmarks!`);
    } else {
        // Add bookmark
        bookmarks.push({ id: itemId, type: itemType });
        event.target.classList.add('bookmarked');
        showPopupMessage(`${itemName} has been added to bookmarks!`);
    }

    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    displayBookmarkedItems(); // Refresh the display
}



function loadBookmarks() {
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
    document.querySelectorAll('.card').forEach(card => {
        const itemId = parseInt(card.dataset.id); // Ensure itemId is a number
        const itemType = card.dataset.type;
        const bookmarkIcon = card.querySelector('.bookmark-icon');

        if (bookmarkIcon && bookmarks.some(item => item.id === itemId && item.type === itemType)) {
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

function displayBookmarkedItems() {
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
    const container = document.getElementById('bookmarked-items');
    if (!container) return;
    container.innerHTML = '';

    bookmarks.forEach(async item => {
        const data = await fetchData(`/${item.type}/${item.id}?`);
        const card = createCard(data, item.type);
        container.appendChild(card);
    });
}

async function displayMovies() {
    setRowSkeleton('now-playing-movies');
    setRowSkeleton('popular-movies');
    setRowSkeleton('top-rated-movies');

    const [nowPlayingMovies, popularMovies, topRatedMovies] = await Promise.all([
        fetchData('/movie/now_playing?'),
        fetchData('/movie/popular?'),
        fetchData('/movie/top_rated?'),
    ]);

    renderRow('now-playing-movies', nowPlayingMovies, 'movie');
    renderRow('popular-movies', popularMovies, 'movie');
    renderRow('top-rated-movies', topRatedMovies, 'movie');
}

async function displayTVShows() {
    setRowSkeleton('on-the-air');
    setRowSkeleton('popular-tv');
    setRowSkeleton('top-rated-tv');

    const [onTheAirTV, popularTV, topRatedTV] = await Promise.all([
        fetchData('/tv/on_the_air?'),
        fetchData('/tv/popular?'),
        fetchData('/tv/top_rated?'),
    ]);

    renderRow('on-the-air', onTheAirTV, 'tv');
    renderRow('popular-tv', popularTV, 'tv');
    renderRow('top-rated-tv', topRatedTV, 'tv');
}

function openFeaturedItem(item) {
    const type = mediaTypeForItem(item, 'tv');
    addContinueWatchingItem(item, type);
    localStorage.setItem('selectedItem', JSON.stringify({ ...item, media_type: type }));
    window.location.href = type === 'tv' ? 'tvshow.html' : 'movie.html';
}

function createFeaturedSlide(item, logoPath) {
    const type = mediaTypeForItem(item, 'tv');
    const slide = document.createElement('article');
    slide.className = 'embla__slide featured-slide';
    slide.style.backgroundImage = `url(${ORIGINAL_IMAGE_BASE}${item.backdrop_path || item.poster_path})`;

    const content = document.createElement('div');
    content.className = 'featured-slide__content';

    const logo = createTitleLogoElement(item, logoPath, 'featured-logo');
    if (logo) {
        content.appendChild(logo);
    } else {
        const heading = document.createElement('h2');
        heading.className = 'featured-title';
        heading.textContent = titleText(item);
        content.appendChild(heading);
    }

    const meta = document.createElement('div');
    meta.className = 'featured-meta';
    meta.innerHTML = `
        <span><i class="fas fa-star"></i> ${Number(item.vote_average || 0).toFixed(1)}</span>
        <span>${typeLabel(type)}</span>
        <span>${formatYear({ ...item, type })}</span>
        <span>Popularity ${Math.round(item.popularity || 0)}</span>
    `;

    const description = document.createElement('p');
    description.className = 'featured-description';
    description.textContent = item.overview || 'No overview available.';

    const actions = document.createElement('div');
    actions.className = 'featured-actions';

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'featured-play-button';
    playButton.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
    playButton.addEventListener('click', () => openFeaturedItem(item));

    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'featured-details-button';
    detailsButton.textContent = 'Details';
    detailsButton.addEventListener('click', () => openFeaturedItem(item));

    actions.appendChild(playButton);
    actions.appendChild(detailsButton);
    content.appendChild(meta);
    content.appendChild(description);
    content.appendChild(actions);
    slide.appendChild(content);
    slide.addEventListener('dblclick', () => openFeaturedItem(item));
    return slide;
}

function setFeaturedDotState() {
    const dots = document.querySelectorAll('#featured-carousel-dots button');
    const selected = featuredEmblaApi?.selectedScrollSnap() || 0;
    dots.forEach((dot, index) => {
        dot.classList.toggle('is-selected', index === selected);
        dot.setAttribute('aria-current', index === selected ? 'true' : 'false');
    });
}

function initFeaturedCarousel() {
    const root = document.getElementById('featured-show');
    const viewport = root?.querySelector('.embla__viewport');
    const prev = root?.querySelector('.embla__button--prev');
    const next = root?.querySelector('.embla__button--next');
    const dots = document.getElementById('featured-carousel-dots');
    if (!root || !viewport || !window.EmblaCarousel) return;

    featuredEmblaApi?.destroy();
    const plugins = [];
    if (window.EmblaCarouselAutoplay) {
        featuredAutoplay = window.EmblaCarouselAutoplay({
            delay: 5200,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
        });
        plugins.push(featuredAutoplay);
    }

    featuredEmblaApi = window.EmblaCarousel(viewport, { loop: true, align: 'start' }, plugins);
    prev?.addEventListener('click', () => featuredEmblaApi.scrollPrev(), false);
    next?.addEventListener('click', () => featuredEmblaApi.scrollNext(), false);
    dots?.querySelectorAll('button').forEach((dot, index) => {
        dot.addEventListener('click', () => featuredEmblaApi.scrollTo(index), false);
    });
    featuredEmblaApi.on('select', setFeaturedDotState);
    featuredEmblaApi.on('reInit', setFeaturedDotState);
    setFeaturedDotState();
}

async function displayFeaturedCarousel(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const track = document.getElementById('featured-carousel-track');
    const dots = document.getElementById('featured-carousel-dots');
    if (!track || !dots) return;

    const featuredItems = items
        .filter(item => item.backdrop_path || item.poster_path)
        .slice(0, 8);
    const logos = await Promise.all(
        featuredItems.map(item => fetchTitleLogo(mediaTypeForItem(item, 'tv'), item.id))
    );

    track.innerHTML = '';
    dots.innerHTML = '';
    featuredItems.forEach((item, index) => {
        track.appendChild(createFeaturedSlide(item, logos[index]));
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Go to featured title ${index + 1}`);
        dots.appendChild(dot);
    });

    initFeaturedCarousel();
}

async function displayTrendingTVShowsList() {
    const trendingTV = await fetchData('/trending/tv/day?');
    const trendingTVListContainer = document.getElementById('trending-tv-list');
    trendingTVListContainer.innerHTML = '';

    trendingTV.forEach(tvShow => {
        const card = document.createElement('div');
        card.classList.add('card');

        const poster = document.createElement('img');
        poster.alt = tvShow.name || 'Poster';
        prepareLazyPoster(poster, tvShow.poster_path);
        card.appendChild(poster);

        const playButton = document.createElement('div');
        playButton.classList.add('play-button');
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        card.appendChild(playButton);

        const info = document.createElement('div');
        info.classList.add('info');
        card.appendChild(info);

        const title = document.createElement('h3');
        title.textContent = tvShow.name;
        info.appendChild(title);

        const rating = document.createElement('div');
        rating.classList.add('rating');
        rating.textContent = `Rating ${Number(tvShow.vote_average || 0).toFixed(1)}`;
        info.appendChild(rating);

        const description = document.createElement('div');
        description.classList.add('description');
        description.textContent = tvShow.overview || 'No overview available.';
        info.appendChild(description);

        card.addEventListener('click', () => {
            addContinueWatchingItem(tvShow, 'tv');
            localStorage.setItem('selectedItem', JSON.stringify(tvShow));
            window.location.href = 'tvshow.html';
        });

        trendingTVListContainer.appendChild(card);
    });

    await displayFeaturedCarousel(trendingTV);
}

function populateYearFilter() {
    const yearFilter = document.getElementById('year-filter');
    if (!yearFilter) return;
    const currentYear = new Date().getFullYear();
    yearFilter.innerHTML = '<option value="">Any year</option>';
    for (let year = currentYear + 1; year >= 1970; year -= 1) {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearFilter.appendChild(option);
    }
}

async function populateGenreFilter(type = activeBrowseType) {
    const genreFilter = document.getElementById('genre-filter');
    if (!genreFilter) return;

    genreFilter.innerHTML = '<option value="">All genres</option>';
    if (!genreCache[type].length) {
        const data = await fetchJson(`/genre/${type}/list?`);
        genreCache[type] = data?.genres || [];
    }

    genreCache[type].forEach(genre => {
        const option = document.createElement('option');
        option.value = String(genre.id);
        option.textContent = genre.name;
        genreFilter.appendChild(option);
    });
}

function filterSummary(type, genreId, year) {
    const genre = genreCache[type].find(item => String(item.id) === String(genreId));
    const parts = [
        type === 'tv' ? 'TV shows' : 'movies',
        genre ? genre.name : '',
        year || '',
    ].filter(Boolean);
    return parts.join(' • ');
}

async function displayFilteredResults() {
    const genreId = document.getElementById('genre-filter')?.value || '';
    const year = document.getElementById('year-filter')?.value || '';
    const section = document.getElementById('filtered-section');
    const summary = document.getElementById('filtered-summary');

    if (!section) return;
    if (!genreId && !year) {
        section.classList.add('hidden');
        document.getElementById('filtered-results').innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    setRowSkeleton('filtered-results', 8);
    if (summary) summary.textContent = filterSummary(activeBrowseType, genreId, year);

    const params = new URLSearchParams({
        sort_by: 'popularity.desc',
        include_adult: 'false',
    });
    if (genreId) params.set('with_genres', genreId);
    if (year) {
        params.set(activeBrowseType === 'tv' ? 'first_air_date_year' : 'primary_release_year', year);
    }

    const endpoint =
        activeBrowseType === 'tv'
            ? `/discover/tv?${params.toString()}`
            : `/discover/movie?${params.toString()}`;
    const results = await fetchData(endpoint);
    renderRow('filtered-results', results, activeBrowseType);
}

async function updateBrowseType(type) {
    activeBrowseType = type;
    await populateGenreFilter(type);
    await displayFilteredResults();
}

function setupBrowseFilters() {
    populateYearFilter();
    populateGenreFilter(activeBrowseType);

    document.getElementById('apply-filters')?.addEventListener('click', displayFilteredResults);
    document.getElementById('genre-filter')?.addEventListener('change', displayFilteredResults);
    document.getElementById('year-filter')?.addEventListener('change', displayFilteredResults);
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        document.getElementById('genre-filter').value = '';
        document.getElementById('year-filter').value = '';
        displayFilteredResults();
    });
}

function setSearchMode(isSearching) {
    document.body.classList.toggle('search-active', isSearching);
    document.querySelector('.selector').classList.toggle('hidden', isSearching);
    document.getElementById('browse-filters').classList.toggle('hidden', isSearching);
    document.getElementById('continue-watching-section').classList.toggle(
        'hidden',
        isSearching || readContinueWatching().length === 0
    );
    document.getElementById('filtered-section').classList.toggle(
        'hidden',
        isSearching || (!document.getElementById('genre-filter')?.value && !document.getElementById('year-filter')?.value)
    );
    document.getElementById('movies-section').classList.toggle('hidden', isSearching || !document.getElementById('movies-selector').checked);
    document.getElementById('tv-shows-section').classList.toggle('hidden', isSearching || document.getElementById('movies-selector').checked);
    document.getElementById('search-results').classList.toggle('hidden', !isSearching);
    document.getElementById('featured-container').classList.toggle('hidden', isSearching);
    document.getElementById('search-filters').classList.toggle('hidden', !isSearching);
    document.getElementById('clear-search').classList.toggle('hidden', !isSearching);
}

function setSearchSummary(text) {
    const el = document.getElementById('search-summary');
    if (el) el.textContent = text;
}

function addStateMessage(container, className, message) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = message;
    container.appendChild(el);
}

function renderSearchResults(movieResults, tvResults, query) {
    const searchResultsContainer = document.getElementById('search-results-container');
    searchResultsContainer.innerHTML = '';

    const combinedResults = [
        ...movieResults.map(item => ({ item, type: 'movie' })),
        ...tvResults.map(item => ({ item, type: 'tv' })),
    ].filter(({ item, type }) => {
        const hasPoster = item.poster_path || item.backdrop_path;
        const matchesFilter = activeSearchFilter === 'all' || activeSearchFilter === type;
        return hasPoster && matchesFilter;
    });

    combinedResults.sort((a, b) => (b.item.popularity || 0) - (a.item.popularity || 0));

    setSearchSummary(`${combinedResults.length} result${combinedResults.length === 1 ? '' : 's'} for "${query}"`);

    if (!combinedResults.length) {
        addStateMessage(searchResultsContainer, 'empty-state', 'No matching titles found.');
        return;
    }

    combinedResults.forEach(({ item, type }) => {
        const card = createCard(item, type);
        searchResultsContainer.appendChild(card);
    });
}

async function search(query, token) {
    const encodedQuery = encodeURIComponent(query);
    const searchResultsContainer = document.getElementById('search-results-container');
    searchResultsContainer.innerHTML = '';
    addStateMessage(searchResultsContainer, 'loading-state', 'Searching...');
    setSearchSummary('Looking through movies and TV shows.');

    const [movieResults, tvResults] = await Promise.all([
        fetchData(`/search/movie?query=${encodedQuery}`),
        fetchData(`/search/tv?query=${encodedQuery}`),
    ]);

    if (token !== latestSearchToken) return;
    lastSearchQuery = query;
    lastSearchResults = { movies: movieResults || [], tv: tvResults || [] };
    renderSearchResults(movieResults || [], tvResults || [], query);
}

function runSearchFromInput() {
    const query = document.getElementById('search-bar').value.trim();
    latestSearchToken += 1;

    if (query.length === 0) {
        setSearchMode(false);
        document.getElementById('search-results-container').innerHTML = '';
        setSearchSummary('Start typing to find a title.');
        return;
    }

    setSearchMode(true);
    const token = latestSearchToken;
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
        search(query, token);
    }, 260);
}

document.getElementById('search-bar').addEventListener('input', runSearchFromInput);

document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('search-bar').value = '';
    runSearchFromInput();
    document.getElementById('search-bar').focus();
});

document.querySelectorAll('.search-filter').forEach(button => {
    button.addEventListener('click', () => {
        activeSearchFilter = button.dataset.filter;
        document.querySelectorAll('.search-filter').forEach(item => {
            item.classList.toggle('is-active', item === button);
        });
        const query = document.getElementById('search-bar').value.trim();
        if (query && query === lastSearchQuery) {
            renderSearchResults(lastSearchResults.movies, lastSearchResults.tv, query);
        } else {
            runSearchFromInput();
        }
    });
});


document.addEventListener('DOMContentLoaded', async () => {
    setupBrowseFilters();
    displayContinueWatching();
    await displayMovies();
    await displayTVShows();
    await displayTrendingTVShowsList();
    loadBookmarks(); // Ensure this is called after the cards are created

    // Add event listeners for scrolling arrows
    document.querySelectorAll('.arrow-left').forEach(button => {
        button.addEventListener('click', function() {
            const containerId = this.closest('.scroll-container-wrapper').querySelector('.scroll-container').id;
            scrollLeft(containerId);
        });
    });

    document.querySelectorAll('.arrow-right').forEach(button => {
        button.addEventListener('click', function() {
            const containerId = this.closest('.scroll-container-wrapper').querySelector('.scroll-container').id;
            scrollRight(containerId);
        });
    });

    document.getElementById('clear-continue')?.addEventListener('click', () => {
        localStorage.removeItem(CONTINUE_WATCHING_KEY);
        displayContinueWatching();
    });
});

// Define functions globally
window.scrollLeft = function(containerId) {
    const container = document.getElementById(containerId);
    container.scrollBy({
        left: -600,
        behavior: 'smooth'
    });
    setTimeout(() => updateArrows(containerId), 300);
};

window.scrollRight = function(containerId) {
    const container = document.getElementById(containerId);
    container.scrollBy({
        left: 600,
        behavior: 'smooth'
    });
    setTimeout(() => updateArrows(containerId), 300);
};


function updateArrows(containerId) {
    const container = document.getElementById(containerId);
    const leftArrow = container.parentElement.querySelector('.arrow-left');
    const rightArrow = container.parentElement.querySelector('.arrow-right');
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    leftArrow.disabled = container.scrollLeft <= 0;
    rightArrow.disabled = container.scrollLeft >= maxScrollLeft;
}
