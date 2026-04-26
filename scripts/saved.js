import CONFIG from './config.js';

const apiBaseURL = CONFIG.API_BASE_URL;
const apiKey = CONFIG.API_KEY;
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const PLACEHOLDER_POSTER =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="%23151821"/><text x="50%" y="50%" fill="%238b93a6" font-family="Arial, sans-serif" font-size="30" text-anchor="middle">No poster</text></svg>';

function typeLabel(type) {
    return type === 'tv' ? 'Series' : 'Movie';
}

function formatYear(item, type) {
    const rawDate = item.release_date || item.first_air_date;
    if (!rawDate) return typeLabel(type);
    const year = new Date(rawDate).getFullYear();
    return Number.isFinite(year) ? String(year) : typeLabel(type);
}

function ratingLabel(item) {
    const rating = Number(item.vote_average || 0);
    return rating > 0 ? rating.toFixed(1) : 'New';
}

document.addEventListener('DOMContentLoaded', () => {
    displayBookmarkedItems();
});

function displayBookmarkedItems() {
    const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
    const container = document.getElementById('bookmarked-items');
    container.innerHTML = '';

    if (bookmarks.length === 0) {
        container.innerHTML = '<p>No saved items yet!</p>';
        return;
    }

    bookmarks.forEach(async item => {
        try {
            const data = await fetchData(`/${item.type}/${item.id}?`);
            const card = createCard(data, item.type);
            container.appendChild(card);
        } catch (error) {
            console.error('Error fetching bookmarked item:', error);
        }
    });
}

async function fetchData(endpoint) {
    try {
        let url = `${apiBaseURL}${endpoint}`;
        if (apiKey) {
            const separator = endpoint.includes('?') ? '&' : '?';
            url = `${url}${separator}api_key=${apiKey}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch data:', error);
        return null;
    }
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.dataset.id = item.id;
    card.dataset.type = type;

    const poster = document.createElement('img');
    poster.src = item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : PLACEHOLDER_POSTER;
    poster.alt = item.title || item.name || 'Poster';
    poster.loading = 'lazy';
    poster.decoding = 'async';
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
    meta.innerHTML = `
        <span>${typeLabel(type)}</span>
        <span>${formatYear(item, type)}</span>
        <span><i class="fas fa-star"></i> ${ratingLabel(item)}</span>
    `;

    const info = document.createElement('div');
    info.classList.add('card-info');
    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(info);

    const bookmarkIcon = document.createElement('i');
    bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon', 'bookmarked');
    bookmarkIcon.addEventListener('click', (event) => toggleBookmark(event, item.id, type));
    card.appendChild(bookmarkIcon);

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
