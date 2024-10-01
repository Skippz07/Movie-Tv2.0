import CONFIG from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const selectedItem = JSON.parse(localStorage.getItem('selectedItem'));
  const videoFrame = document.getElementById('video-frame');
  const playButton = document.getElementById('play-button');
  const infoContainer = document.getElementById('info-container');
  const serverSelect = document.getElementById('server-select');
  let currentSrc = 'vidsrcpro'; // Default source

  if (selectedItem) {
    displayItemDetails(selectedItem);
    const videoSources = {
      vidsrc: `https://vidsrc.vip/embed/movie/${selectedItem.id}`,
      vidsrcpro: `https://vidsrc.pro/embed/movie/${selectedItem.id}`,
      vidsrcin: `https://vidsrc.in/embed/movie/${selectedItem.id}`,
      multiembed: `https://multiembed.mov/?video_id=${selectedItem.id}&tmdb=1`,
      autoembed: `https://player.autoembed.cc/embed/movie/${selectedItem.id}`,
    };

    // Set initial video source
    videoFrame.src = videoSources[currentSrc];

    // Handle server selection
    serverSelect.addEventListener('change', (e) => {
      currentSrc = e.target.value;
      videoFrame.src = videoSources[currentSrc];
    });

    playButton.addEventListener('click', () => {
      videoFrame.src = videoSources[currentSrc];
      infoContainer.style.display = 'none';
      videoFrame.style.height = 'calc(100vh - 40px)'; // Adjust this value based on your header/footer heights
    });

    await loadActors(selectedItem.id);
    await loadRecommendations(selectedItem.id);
    loadBookmarks();
  } else {
    document.getElementById('content').textContent = 'No item selected.';
  }

  document.getElementById('back-button').addEventListener('click', () => {
    window.history.back();
  });
});


async function loadActors(movieId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/movie/${movieId}/credits?api_key=${CONFIG.API_KEY}`);
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
  actors.forEach(actor => {
    const actorItem = document.createElement('div');
    actorItem.className = 'actor-item';

    const actorImage = document.createElement('img');
    actorImage.src = `https://image.tmdb.org/t/p/w500${actor.profile_path}`;
    actorImage.alt = actor.name;

    const actorName = document.createElement('p');
    actorName.textContent = actor.name;

    actorItem.appendChild(actorImage);
    actorItem.appendChild(actorName);

    actorsList.appendChild(actorItem);
  });
}

async function loadRecommendations(movieId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/movie/${movieId}/recommendations?api_key=${CONFIG.API_KEY}`);
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
  recommendations.forEach(item => {
    const recommendationItem = document.createElement('div');
    recommendationItem.className = 'recommendation-item';
    recommendationItem.dataset.id = item.id;
    recommendationItem.dataset.type = 'movie'; // Assuming these are movies; adjust if needed

    const recommendationImage = document.createElement('img');
    recommendationImage.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
    recommendationImage.alt = item.title || item.name;

    const recommendationTitle = document.createElement('p');
    recommendationTitle.textContent = item.title || item.name;

    const bookmarkIcon = document.createElement('i');
    bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon');
    bookmarkIcon.addEventListener('click', (event) => toggleBookmark(event, item.id, 'movie'));

    recommendationItem.appendChild(recommendationImage);
    recommendationItem.appendChild(recommendationTitle);
    recommendationItem.appendChild(bookmarkIcon);

    recommendationsList.appendChild(recommendationItem);

    recommendationItem.addEventListener('click', () => {
      localStorage.setItem('selectedItem', JSON.stringify(item));
      window.location.href = 'movie.html';
    });
  });

  loadBookmarks(); // Ensure bookmarks are loaded and icons are updated
}

function displayItemDetails(item) {
  document.getElementById('background').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path || item.poster_path})`;
  document.getElementById('poster').src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  document.getElementById('title').textContent = item.title || item.name;
  document.getElementById('description').textContent = item.overview;
  document.getElementById('rating').textContent = `Rating: ${item.vote_average}`;
  document.getElementById('release-date').textContent = `Release Date: ${item.release_date || item.first_air_date}`;
}

async function fetchVideoData(url) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Expected JSON response but got:', contentType);
      const text = await response.text();
      console.error('Response text:', text);
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching video data:', error);
  }
}

document.querySelectorAll('.server-button').forEach(button => {
  button.addEventListener('click', async (e) => {
    const srcKey = e.target.getAttribute('data-src');
    const url = videoSources[srcKey];
    const data = await fetchVideoData(url);
    if (data) {
      console.log('Fetched data:', data);
    }
  });
});

function filterAds(items) {
  return items.filter(item => (item.title && !item.title.toLowerCase().includes('ad')) || (item.name && !item.name.toLowerCase().includes('ad')));
}

// Bookmark functions
function toggleBookmark(event, itemId, itemType) {
  event.stopPropagation(); // Prevent triggering the card click event

  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  const index = bookmarks.findIndex(item => item.id === itemId && item.type === itemType);
  const itemDetails = event.currentTarget.parentNode;
  const itemName = itemDetails.querySelector('p').textContent;

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
  document.querySelectorAll('.recommendation-item').forEach(card => {
    const itemId = card.dataset.id;
    const itemType = card.dataset.type;
    const bookmarkIcon = card.querySelector('.bookmark-icon');
    if (bookmarks.some(item => item.id === itemId && item.type === itemType)) {
      bookmarkIcon.classList.add('bookmarked');
    } else {
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
  if (!container) {
    console.error('Element with ID "bookmarked-items" not found.');
    return;
  }
  container.innerHTML = '';

  bookmarks.forEach(async item => {
    const data = await fetchData(`/${item.type}/${item.id}?`);
    const card = createCard(data, item.type);
    container.appendChild(card);
  });
}


document.addEventListener('DOMContentLoaded', async () => {
  loadBookmarks();
});
