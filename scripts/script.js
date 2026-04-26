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
const CONTINUE_WATCHING_KEY = 'continueWatching';
const PLACEHOLDER_POSTER =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="%23151821"/><text x="50%" y="50%" fill="%238b93a6" font-family="Arial, sans-serif" font-size="30" text-anchor="middle">No poster</text></svg>';

let posterObserver = null;

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

async function displayFeaturedTrendingTVShow(trendingTV) {
    if (!Array.isArray(trendingTV) || trendingTV.length === 0) return;
    const featuredShowContainer = document.getElementById('featured-show');
    const featuredTitle = document.getElementById('featured-title');
    const featuredRating = document.getElementById('featured-rating-value');
    const featuredPopularity = document.getElementById('featured-popularity');
    const featuredDescription = document.getElementById('featured-description');

    const featuredShow = trendingTV[currentFeaturedIndex];
    currentFeaturedIndex = (currentFeaturedIndex + 1) % trendingTV.length;

    featuredShowContainer.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${featuredShow.backdrop_path || featuredShow.poster_path})`;
    featuredTitle.textContent = featuredShow.name;
    featuredRating.textContent = Number(featuredShow.vote_average || 0).toFixed(1);
    featuredPopularity.textContent = `Popularity ${Math.round(featuredShow.popularity || 0)}`;
    featuredDescription.textContent = featuredShow.overview || 'No overview available.';

    document.getElementById('play-button').onclick = () => {
        addContinueWatchingItem(featuredShow, 'tv');
        localStorage.setItem('selectedItem', JSON.stringify(featuredShow));
        window.location.href = 'tvshow.html';
    };
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

    displayFeaturedTrendingTVShow(trendingTV);
    setInterval(() => {
        displayFeaturedTrendingTVShow(trendingTV);
    }, 5000);
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
