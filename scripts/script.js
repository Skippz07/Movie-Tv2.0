import CONFIG from './config.js';

const apiBaseURL = CONFIG.API_BASE_URL;
const apiKey = CONFIG.API_KEY;
let currentFeaturedIndex = 0; // Initialize currentFeaturedIndex

document.getElementById('movies-selector').addEventListener('click', async () => {
    document.getElementById('movies-section').classList.remove('hidden');
    document.getElementById('tv-shows-section').classList.add('hidden');
    document.getElementById('movies-selector').classList.add('selected');
    document.getElementById('tv-selector').classList.remove('selected');
    await displayMovies();
});

document.getElementById('tv-selector').addEventListener('click', async () => {
    document.getElementById('movies-section').classList.add('hidden');
    document.getElementById('tv-shows-section').classList.remove('hidden');
    document.getElementById('movies-selector').classList.remove('selected');
    document.getElementById('tv-selector').classList.add('selected');
    await displayTVShows();
});


async function fetchData(endpoint) {
    try {
        const response = await fetch(`${apiBaseURL}${endpoint}&api_key=${apiKey}`);
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

function createCard(item, type) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.dataset.id = item.id;
    card.dataset.type = type;

    const poster = document.createElement('img');
    poster.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
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
    
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
    if (bookmarks.some(bookmark => bookmark.id === item.id && bookmark.type === type)) {
        bookmarkIcon.classList.add('bookmarked');
    }

    bookmarkIcon.addEventListener('click', (event) => toggleBookmark(event, item.id, type));
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
    container.innerHTML = '';

    bookmarks.forEach(async item => {
        const data = await fetchData(`/${item.type}/${item.id}?`);
        const card = createCard(data, item.type);
        container.appendChild(card);
    });
}

async function displayMovies() {
    const nowPlayingMovies = await fetchData('/movie/now_playing?');
    const popularMovies = await fetchData('/movie/popular?');
    const topRatedMovies = await fetchData('/movie/top_rated?');

    const nowPlayingMoviesContainer = document.getElementById('now-playing-movies');
    nowPlayingMovies.forEach(movie => {
        const card = createCard(movie, 'movie');
        nowPlayingMoviesContainer.appendChild(card);
    });

    const popularMoviesContainer = document.getElementById('popular-movies');
    popularMovies.forEach(movie => {
        const card = createCard(movie, 'movie');
        popularMoviesContainer.appendChild(card);
    });

    const topRatedMoviesContainer = document.getElementById('top-rated-movies');
    topRatedMovies.forEach(movie => {
        const card = createCard(movie, 'movie');
        topRatedMoviesContainer.appendChild(card);
    });

    updateArrows('now-playing-movies');
    updateArrows('popular-movies');
    updateArrows('top-rated-movies');
}

async function displayTVShows() {
    const onTheAirTV = await fetchData('/tv/on_the_air?');
    const popularTV = await fetchData('/tv/popular?');
    const topRatedTV = await fetchData('/tv/top_rated?');

    const onTheAirContainer = document.getElementById('on-the-air');
    onTheAirTV.forEach(tvShow => {
        const card = createCard(tvShow, 'tv');
        onTheAirContainer.appendChild(card);
    });

    const popularTVContainer = document.getElementById('popular-tv');
    popularTV.forEach(tvShow => {
        const card = createCard(tvShow, 'tv');
        popularTVContainer.appendChild(card);
    });

    const topRatedTVContainer = document.getElementById('top-rated-tv');
    topRatedTV.forEach(tvShow => {
        const card = createCard(tvShow, 'tv');
        topRatedTVContainer.appendChild(card);
    });

    updateArrows('on-the-air');
    updateArrows('popular-tv');
    updateArrows('top-rated-tv');
}

async function displayFeaturedTrendingTVShow(trendingTV) {
    const featuredShowContainer = document.getElementById('featured-show');
    const featuredTitle = document.getElementById('featured-title');
    const featuredRating = document.getElementById('featured-rating-value');
    const featuredPopularity = document.getElementById('featured-popularity');
    const featuredDescription = document.getElementById('featured-description');

    const featuredShow = trendingTV[currentFeaturedIndex];
    currentFeaturedIndex = (currentFeaturedIndex + 1) % trendingTV.length;

    featuredShowContainer.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${featuredShow.backdrop_path})`;
    featuredTitle.textContent = featuredShow.name;
    featuredRating.textContent = featuredShow.vote_average;
    featuredPopularity.textContent = `Popularity: ${featuredShow.popularity}`;
    featuredDescription.textContent = featuredShow.overview;

    document.getElementById('play-button').addEventListener('click', () => {
        localStorage.setItem('selectedItem', JSON.stringify(featuredShow));
        window.location.href = 'tvshow.html';
    });
}

async function displayTrendingTVShowsList() {
    const trendingTV = await fetchData('/trending/tv/day?');
    const trendingTVListContainer = document.getElementById('trending-tv-list');

    trendingTV.forEach(tvShow => {
        const card = document.createElement('div');
        card.classList.add('card');

        const poster = document.createElement('img');
        poster.src = `https://image.tmdb.org/t/p/w500${tvShow.poster_path}`;
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
        rating.textContent = `Rating: ${tvShow.vote_average}`;
        info.appendChild(rating);

        const description = document.createElement('div');
        description.classList.add('description');
        description.textContent = tvShow.overview;
        info.appendChild(description);

        card.addEventListener('click', () => {
            localStorage.setItem('selectedItem', JSON.stringify(tvShow));
            window.location.href = 'tvshow.html';
        });

        trendingTVListContainer.appendChild(card);
    });

    setInterval(() => {
        displayFeaturedTrendingTVShow(trendingTV);
    }, 5000);
}

async function search(query) {
    const movieResults = await fetchData(`/search/movie?query=${query}&`);
    const tvResults = await fetchData(`/search/tv?query=${query}&`);

    const searchResultsContainer = document.getElementById('search-results-container');
    searchResultsContainer.innerHTML = '';

    if (movieResults) {
        movieResults.forEach(movie => {
            const card = createCard(movie, 'movie');
            searchResultsContainer.appendChild(card);
        });
    }

    if (tvResults) {
        tvResults.forEach(tvShow => {
            const card = createCard(tvShow, 'tv');
            searchResultsContainer.appendChild(card);
        });
    }
}

document.getElementById('search-bar').addEventListener('input', async (event) => {
    const query = event.target.value;
    console.log('Search query:', query); // Debug log

    if (query.trim().length > 0) {
        console.log('Adding hidden class');
        document.querySelector('.selector').classList.add('hidden');
        document.getElementById('movies-section').classList.add('hidden');
        document.getElementById('tv-shows-section').classList.add('hidden');
        document.getElementById('search-results').classList.remove('hidden');
        document.getElementById('featured-show').classList.add('hidden');
        document.getElementById('trending-list').classList.add('hidden');
        await search(query);
    } else {
        console.log('Removing hidden class');
        document.querySelector('.selector').classList.remove('hidden');
        const isMoviesSelected = document.getElementById('movies-selector').checked;
        if (isMoviesSelected) {
            document.getElementById('movies-section').classList.remove('hidden');
            document.getElementById('tv-shows-section').classList.add('hidden');
        } else {
            document.getElementById('movies-section').classList.add('hidden');
            document.getElementById('tv-shows-section').classList.remove('hidden');
        }
        document.getElementById('search-results').classList.add('hidden');
    }
});


document.addEventListener('DOMContentLoaded', async () => {
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
