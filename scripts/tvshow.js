import CONFIG from './config.js';

const apiBaseURL = CONFIG.API_BASE_URL;
const apiKey = CONFIG.API_KEY;

document.addEventListener('DOMContentLoaded', async () => {
  const selectedItem = JSON.parse(localStorage.getItem('selectedItem'));
  let currentSrc = 'vidsrc'; // Set default server to vidsrc
  const videoFrame = document.getElementById('video-frame');
  const infoContainer = document.getElementById('info-container');
  const playButton = document.getElementById('play-button');

  let originalLocation = window.location.href;

  // Prevent window navigation
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });

  // Monitor for unwanted redirections
  setInterval(() => {
    if (window.location.href !== originalLocation) {
      window.location.href = originalLocation;
    }
  }, 1000);

  // Block new tabs/windows
  window.open = function() {
    console.log("Attempt to open a new tab/window blocked.");
    return null;
  };

  if (selectedItem) {
    displayItemDetails(selectedItem);
    if (selectedItem.media_type === 'tv' || selectedItem.name) {
      const seasons = await fetchSeasons(selectedItem.id);
      if (seasons && seasons.length > 0) {
        const validSeasons = seasons.filter(season => season.season_number !== 0); // Exclude Season 0
        populateSeasonSelect(validSeasons);
        const seasonSelect = document.getElementById('season-select');
        seasonSelect.value = validSeasons[0].season_number;
        await loadEpisodesAndSetDefaults(seasonSelect.value, selectedItem.id, selectedItem);
        seasonSelect.addEventListener('change', async () => {
          const seasonNumber = seasonSelect.value;
          await loadEpisodesAndSetDefaults(seasonNumber, selectedItem.id, selectedItem);
        });
      }
    } else {
      videoFrame.src = constructVideoUrl(selectedItem, currentSrc);
    }

    const serverSelect = document.getElementById('server-select');
    serverSelect.addEventListener('change', (e) => {
      currentSrc = e.target.value;
      const season = document.getElementById('season-select').value || 1;
      const episode = document.querySelector('.episode-item .episode-number').textContent || 1;
      videoFrame.src = constructVideoUrl(selectedItem, currentSrc, season, episode);
    });

    playButton.addEventListener('click', () => {
      const season = document.getElementById('season-select').value || 1;
      const episode = document.querySelector('.episode-item .episode-number').textContent || 1;
      videoFrame.src = constructVideoUrl(selectedItem, currentSrc, season, episode);
      infoContainer.style.display = 'none';
      videoFrame.style.height = 'calc(100vh - 40px)'; // Adjust this value based on your header/footer heights
    });

    // Fetch and display actors
    const actors = await fetchActors(selectedItem.id);
    populateActors(actors);

    // Fetch and display recommendations
    const recommendations = await fetchRecommendations(selectedItem.id);
    populateRecommendations(recommendations);

    loadBookmarks(); // Ensure bookmarks are loaded and icons are updated

  } else {
    document.getElementById('content').textContent = 'No item selected.';
  }
});

document.getElementById('back-button').addEventListener('click', () => {
  window.history.back();
});

function displayItemDetails(item) {
  document.getElementById('background').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path || item.poster_path})`;
  document.getElementById('poster').src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  document.getElementById('title').textContent = item.title || item.name;
  document.getElementById('description').textContent = item.overview;
  document.getElementById('rating').textContent = `Rating: ${item.vote_average.toFixed(1)}`;
  document.getElementById('release-date').textContent = `Release Date: ${item.release_date || item.first_air_date}`;
}

async function fetchSeasons(tvId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/tv/${tvId}?api_key=${CONFIG.API_KEY}`);
    const data = await response.json();
    return filterAds(data.seasons);
  } catch (error) {
    console.error('Error fetching seasons:', error);
    return null;
  }
}

async function fetchEpisodes(tvId, seasonNumber) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${CONFIG.API_KEY}`);
    const data = await response.json();
    return filterAds(data.episodes);
  } catch (error) {
    console.error('Error fetching episodes:', error);
    return null;
  }
}

function populateSeasonSelect(seasons) {
  const seasonSelect = document.getElementById('season-select');
  seasonSelect.innerHTML = '';
  if (seasons) {
    seasons.forEach(season => {
      const option = document.createElement('option');
      option.value = season.season_number;
      option.textContent = `Season ${season.season_number}`;
      seasonSelect.appendChild(option);
    });
  }
}

function populateEpisodeList(episodes, selectedItem) {
  const episodeList = document.getElementById('episode-list');
  episodeList.innerHTML = '';
  if (episodes) {
    episodes.forEach(episode => {
      const episodeItem = document.createElement('div');
      episodeItem.className = 'episode-item';

      const episodeNumber = document.createElement('span');
      episodeNumber.className = 'episode-number';
      episodeNumber.textContent = episode.episode_number;

      const episodeImageContainer = document.createElement('div');
      episodeImageContainer.className = 'episode-image-container';

      const episodeImage = document.createElement('img');
      episodeImage.className = 'episode-image';
      episodeImage.src = `https://image.tmdb.org/t/p/w500${episode.still_path}`;

      const playButton = document.createElement('button');
      playButton.className = 'play-button';
      playButton.innerHTML = '►';
      playButton.addEventListener('click', () => {
        const season = document.getElementById('season-select').value;
        const currentSrc = document.getElementById('server-select').value;
        const videoFrame = document.getElementById('video-frame'); // Ensure videoFrame is defined here
        videoFrame.src = constructVideoUrl(selectedItem, currentSrc, season, episode.episode_number);
        infoContainer.style.display = 'none';
        videoFrame.style.height = 'calc(100vh - 40px)'; // Adjust this value based on your header/footer heights
      });

      episodeImageContainer.appendChild(episodeImage);
      episodeImageContainer.appendChild(playButton);

      const episodeDetails = document.createElement('div');
      episodeDetails.className = 'episode-details';

      const episodeTitle = document.createElement('h3');
      episodeTitle.className = 'episode-title';
      episodeTitle.textContent = episode.name;

      const episodeOverview = document.createElement('p');
      episodeOverview.className = 'episode-overview';
      episodeOverview.textContent = episode.overview;

      episodeDetails.appendChild(episodeTitle);
      episodeDetails.appendChild(episodeOverview);

      episodeItem.appendChild(episodeNumber);
      episodeItem.appendChild(episodeImageContainer);
      episodeItem.appendChild(episodeDetails);

      episodeList.appendChild(episodeItem);
    });
  }
}

async function loadEpisodesAndSetDefaults(seasonNumber, tvId, selectedItem) {
  const episodes = await fetchEpisodes(tvId, seasonNumber);
  if (episodes && episodes.length > 0) {
    populateEpisodeList(episodes, selectedItem);
  }
}

function constructVideoUrl(item, srcKey, season, episode) {
  const videoSources = {
    vidsrc: `https://vidsrc.icu/embed/tv/${item.id}/${season}/${episode}`,
    vidsrcvip: `https://vidsrc.vip/embed/tv/${item.id}/${season}/${episode}`,
    vidsrcpro: `https://vidsrc.pro/embed/tv/${item.id}/${season}/${episode}`,
    vidsrcin: `https://vidsrc.in/embed/tv/${item.id}/${season}/${episode}`,
    superembed: `https://multiembed.mov/?video_id=${item.id}&tmdb=1&s=${season}&e=${episode}`,
    autoembed: `https://player.autoembed.cc/embed/tv/${item.id}/${season}/${episode}`
  };
  console.log('Video URL:', videoSources[srcKey]); // Debugging line
  return videoSources[srcKey];
}

async function fetchActors(tvId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/tv/${tvId}/credits?api_key=${CONFIG.API_KEY}`);
    const data = await response.json();
    return filterAds(data.cast);
  } catch (error) {
    console.error('Error fetching actors:', error);
    return null;
  }
}

function populateActors(actors) {
  const actorsList = document.getElementById('actors-list');
  actorsList.innerHTML = '';
  if (actors) {
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
}

async function fetchRecommendations(tvId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/tv/${tvId}/recommendations?api_key=${CONFIG.API_KEY}`);
    const data = await response.json();
    return filterAds(data.results);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return null;
  }
}

function populateRecommendations(recommendations) {
  const recommendationsList = document.getElementById('recommendations-list');
  recommendationsList.innerHTML = '';
  if (recommendations) {
    recommendations.forEach(recommendation => {
      const recommendationItem = document.createElement('div');
      recommendationItem.className = 'recommendation-item';
      recommendationItem.dataset.id = recommendation.id;
      recommendationItem.dataset.type = recommendation.media_type; // Correctly set the media type

      const recommendationImage = document.createElement('img');
      recommendationImage.src = `https://image.tmdb.org/t/p/w500${recommendation.poster_path}`;
      recommendationImage.alt = recommendation.name;

      const recommendationTitle = document.createElement('p');
      recommendationTitle.className = 'recommendation-title';
      recommendationTitle.textContent = recommendation.name;

      const bookmarkIcon = document.createElement('i');
      bookmarkIcon.classList.add('fas', 'fa-bookmark', 'bookmark-icon');
      bookmarkIcon.addEventListener('click', (event) => toggleBookmark(event, recommendation.id, recommendation.media_type));

      recommendationItem.appendChild(recommendationImage);
      recommendationItem.appendChild(recommendationTitle);
      recommendationItem.appendChild(bookmarkIcon);

      recommendationsList.appendChild(recommendationItem);

      recommendationItem.addEventListener('click', () => {
        localStorage.setItem('selectedItem', JSON.stringify(recommendation));
        window.location.href = recommendation.media_type === 'tv' ? 'tvshow.html' : 'movie.html';
      });
    });

    loadBookmarks(); // Ensure bookmarks are loaded and icons are updated
  }
}

function filterAds(items) {
  return items.filter(item => (item.title && !item.title.toLowerCase().includes('ad')) || (item.name && !item.name.toLowerCase().includes('ad')));
}

// Bookmark functions
function toggleBookmark(event, itemId, itemType) {
  event.stopPropagation(); // Prevent triggering the card click event

  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  const index = bookmarks.findIndex(item => item.id === itemId && item.type === itemType);
  const itemDetails = event.currentTarget.parentNode;
  const itemName = itemDetails.querySelector('.recommendation-title').textContent;

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

async function fetchData(endpoint) {
  try {
    const response = await fetch(`${apiBaseURL}${endpoint}&api_key=${apiKey}`);
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

function displayBookmarkedItems() {
  const bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
  const container = document.getElementById('bookmarked-items');
  container.innerHTML = '';

  bookmarks.forEach(async item => {
    const endpoint = item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
    const data = await fetchData(`${endpoint}?`);
    if (data) {
      const card = createCard(data, item.type);
      container.appendChild(card);
    }
  });
}
