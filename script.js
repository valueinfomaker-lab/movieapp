const API_KEY = "edf676a9f2bd05f16da45fa8e5812701";
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w780";

const categories = [
  { title: "인기 영화", endpoint: "/movie/popular" },
  { title: "평점 높은 영화", endpoint: "/movie/top_rated" },
  { title: "현재 상영작", endpoint: "/movie/now_playing" },
  { title: "인기 TV 시리즈", endpoint: "/tv/popular" },
];

const rowsEl = document.getElementById("rows");
const heroEl = document.getElementById("hero");
const modalEl = document.getElementById("detailModal");
const modalContentEl = document.getElementById("modalContent");
const closeModalEl = document.getElementById("closeModal");
const rowTemplate = document.getElementById("rowTemplate");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const focusSearchBtn = document.getElementById("focusSearch");
const genreSelect = document.getElementById("genreSelect");
const wishlistToggle = document.getElementById("wishlistToggle");
const loadMoreAnchor = document.getElementById("loadMoreAnchor");
const detailView = document.getElementById("detailView");
const recentSearchesEl = document.getElementById("recentSearches");

const WISHLIST_KEY = "movie-project-wishlist";
const RECENT_SEARCH_KEY = "movie-project-recent-searches";
let wishlist = new Set(JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]"));
let recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || "[]");
let genresById = {};
let currentGenreId = "";
let isWishlistMode = false;
let searchState = { active: false, query: "", page: 1, loading: false, totalPages: 1 };
let observer;

async function fetchTMDB(endpoint, params = {}) {
  const query = new URLSearchParams({
    api_key: API_KEY,
    language: "ko-KR",
    ...params,
  });
  const response = await fetch(`${BASE_URL}${endpoint}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`TMDB 요청 실패: ${response.status}`);
  }
  return response.json();
}

function toTitle(item) {
  return item.title || item.name || "제목 없음";
}

function imageUrl(path) {
  return path ? `${IMG_BASE}${path}` : "https://placehold.co/780x440/202028/ffffff?text=No+Image";
}

function createCard(item) {
  const btn = document.createElement("button");
  btn.className = "card";
  btn.type = "button";
  const itemType = item.media_type || (item.first_air_date ? "tv" : "movie");
  const itemId = `${itemType}:${item.id}`;
  const wished = wishlist.has(itemId) ? "❤️" : "🤍";
  const genreText = (item.genre_ids || [])
    .slice(0, 2)
    .map((id) => genresById[id])
    .filter(Boolean)
    .join(" · ");
  btn.innerHTML = `
    <img src="${imageUrl(item.poster_path || item.backdrop_path)}" alt="${toTitle(item)} 포스터" loading="lazy" />
    <div class="meta">
      <strong>${toTitle(item)}</strong>
      <span>${genreText || "장르 정보 없음"}</span>
      <span>평점 ${Number(item.vote_average || 0).toFixed(1)}</span>
      <span>${wished}</span>
    </div>
  `;
  btn.addEventListener("click", () => {
    location.hash = `detail/${itemType}/${item.id}`;
  });
  return btn;
}

function setHero(item) {
  heroEl.style.backgroundImage = `url(${imageUrl(item.backdrop_path || item.poster_path)})`;
  heroEl.innerHTML = `
    <div class="hero-inner">
      <h1>${toTitle(item)}</h1>
      <p>${item.overview || "줄거리 정보가 없습니다."}</p>
    </div>
  `;
}

function saveWishlist() {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify([...wishlist]));
}

function isMatchGenre(item) {
  if (!currentGenreId) {
    return true;
  }
  return (item.genre_ids || []).includes(Number(currentGenreId));
}

function filterByGenre(items) {
  return items.filter((item) => isMatchGenre(item));
}

function toggleWishlist(itemId) {
  if (wishlist.has(itemId)) {
    wishlist.delete(itemId);
  } else {
    wishlist.add(itemId);
  }
  saveWishlist();
}

function renderRecentSearches() {
  recentSearchesEl.innerHTML = "";
  if (!recentSearches.length) {
    return;
  }
  recentSearches.forEach((keyword) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = keyword;
    chip.addEventListener("click", () => {
      searchInput.value = keyword;
      searchContent(keyword).catch(showError);
    });
    recentSearchesEl.appendChild(chip);
  });
}

function pushRecentSearch(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return;
  }
  recentSearches = [trimmed, ...recentSearches.filter((word) => word !== trimmed)].slice(0, 8);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recentSearches));
  renderRecentSearches();
}

async function openDetailPage(type, id) {
  const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const [item, videos] = await Promise.all([
    fetchTMDB(endpoint),
    fetchTMDB(`${endpoint}/videos`),
  ]);
  const itemId = `${type}:${id}`;
  const inWish = wishlist.has(itemId);
  const trailer = (videos.results || []).find(
    (video) => video.site === "YouTube" && video.type === "Trailer"
  );
  heroEl.style.display = "none";
  rowsEl.style.display = "none";
  loadMoreAnchor.style.display = "none";
  detailView.classList.remove("hidden");
  detailView.innerHTML = `
    <img class="detail-backdrop" src="${imageUrl(item.backdrop_path || item.poster_path)}" alt="${toTitle(item)} 배경 이미지" />
    <h1>${toTitle(item)}</h1>
    <p>개봉일: ${item.release_date || item.first_air_date || "정보 없음"} | 평점 ${Number(item.vote_average || 0).toFixed(1)}</p>
    <p>${item.overview || "상세 설명이 없습니다."}</p>
    <div class="detail-actions">
      <button class="chip" id="backHomeBtn" type="button">홈으로</button>
      <button class="chip" id="detailWishBtn" type="button">${inWish ? "찜 해제" : "찜하기"}</button>
    </div>
    ${
      trailer
        ? `
      <div class="trailer-wrap">
        <h3>공식 예고편</h3>
        <iframe
          src="https://www.youtube.com/embed/${trailer.key}"
          title="${toTitle(item)} 예고편"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    `
        : "<p>표시 가능한 예고편이 없습니다.</p>"
    }
  `;
  detailView.querySelector("#backHomeBtn").addEventListener("click", () => {
    location.hash = "";
  });
  detailView.querySelector("#detailWishBtn").addEventListener("click", () => {
    toggleWishlist(itemId);
    openDetailPage(type, id).catch(showError);
  });
}

function closeDetailPage() {
  detailView.classList.add("hidden");
  detailView.innerHTML = "";
  heroEl.style.display = "";
  rowsEl.style.display = "";
  loadMoreAnchor.style.display = "";
}

async function handleRoute() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash.startsWith("detail/")) {
    closeDetailPage();
    return;
  }
  const [, type, id] = hash.split("/");
  if (!type || !id) {
    closeDetailPage();
    return;
  }
  await openDetailPage(type, id);
}

function openDetail(item, itemId) {
  const inWish = wishlist.has(itemId);
  modalContentEl.innerHTML = `
    <h2>${toTitle(item)}</h2>
    <p>개봉일: ${item.release_date || item.first_air_date || "정보 없음"}</p>
    <p>평점: ${Number(item.vote_average || 0).toFixed(1)}</p>
    <p>${item.overview || "상세 설명이 없습니다."}</p>
    <button id="wishlistAction" type="button">${inWish ? "찜 해제" : "찜하기"}</button>
  `;
  modalContentEl.querySelector("#wishlistAction").addEventListener("click", () => {
    toggleWishlist(itemId);
    modalEl.close();
    refreshCurrentView().catch(showError);
  });
  modalEl.showModal();
}

function createRow(title, items) {
  const frag = rowTemplate.content.cloneNode(true);
  const rowSection = frag.querySelector(".row-section");
  const rowTitle = frag.querySelector("h2");
  const rowMore = frag.querySelector(".row-more");
  const posterRow = frag.querySelector(".poster-row");
  rowTitle.textContent = title;

  items.forEach((item) => posterRow.appendChild(createCard(item)));
  rowMore.addEventListener("click", () => posterRow.scrollBy({ left: 440, behavior: "smooth" }));

  rowsEl.appendChild(rowSection);
}

async function renderHome() {
  searchState.active = false;
  rowsEl.innerHTML = "";
  const responses = await Promise.all(categories.map((cat) => fetchTMDB(cat.endpoint)));
  const firstItem = responses[0]?.results?.[0];
  if (firstItem) {
    setHero(firstItem);
  }
  categories.forEach((cat, idx) => {
    const filtered = filterByGenre(responses[idx].results).slice(0, 20);
    createRow(cat.title, filtered);
  });
}

async function searchContent(query) {
  if (!query.trim()) {
    renderHome();
    return;
  }
  pushRecentSearch(query);
  searchState = { active: true, query, page: 1, loading: false, totalPages: 1 };
  const data = await fetchTMDB("/search/multi", { query, include_adult: false, page: 1 });
  searchState.totalPages = data.total_pages || 1;
  rowsEl.innerHTML = "";
  heroEl.innerHTML = "";
  heroEl.style.backgroundImage = "none";
  createRow(`"${query}" 검색 결과`, filterByGenre(data.results).slice(0, 40));
}

async function loadMoreSearch() {
  if (!searchState.active || searchState.loading || searchState.page >= searchState.totalPages) {
    return;
  }
  searchState.loading = true;
  searchState.page += 1;
  try {
    const data = await fetchTMDB("/search/multi", {
      query: searchState.query,
      include_adult: false,
      page: searchState.page,
    });
    const targetRow = rowsEl.querySelector(".poster-row");
    if (!targetRow) {
      return;
    }
    filterByGenre(data.results).forEach((item) => targetRow.appendChild(createCard(item)));
  } finally {
    searchState.loading = false;
  }
}

async function renderWishlist() {
  searchState.active = false;
  heroEl.style.backgroundImage = "none";
  heroEl.innerHTML = `
    <div class="hero-inner">
      <h1>찜한 콘텐츠</h1>
      <p>저장한 작품만 모아서 보여줍니다.</p>
    </div>
  `;
  rowsEl.innerHTML = "";
  const wishedKeys = [...wishlist];
  if (!wishedKeys.length) {
    createRow("찜 목록", []);
    return;
  }

  const onlyWish = await Promise.all(
    wishedKeys.map(async (key) => {
      const [type, id] = key.split(":");
      const endpoint = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
      try {
        return await fetchTMDB(endpoint);
      } catch (error) {
        return null;
      }
    })
  );

  createRow("찜 목록", filterByGenre(onlyWish.filter(Boolean)));
}

async function hydrateGenres() {
  const [movieGenres, tvGenres] = await Promise.all([
    fetchTMDB("/genre/movie/list"),
    fetchTMDB("/genre/tv/list"),
  ]);
  const allGenres = [...(movieGenres.genres || []), ...(tvGenres.genres || [])];
  genresById = allGenres.reduce((acc, genre) => {
    acc[genre.id] = genre.name;
    return acc;
  }, {});

  Object.entries(genresById).forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    genreSelect.appendChild(opt);
  });
}

async function refreshCurrentView() {
  if (isWishlistMode) {
    await renderWishlist();
    return;
  }
  if (searchState.active && searchState.query) {
    await searchContent(searchState.query);
    return;
  }
  await renderHome();
}

closeModalEl.addEventListener("click", () => modalEl.close());
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) {
    modalEl.close();
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchContent(searchInput.value).catch(showError);
  if (location.hash) {
    location.hash = "";
  }
});

focusSearchBtn.addEventListener("click", () => {
  searchInput.focus();
});

genreSelect.addEventListener("change", () => {
  currentGenreId = genreSelect.value;
  refreshCurrentView().catch(showError);
});

wishlistToggle.addEventListener("click", () => {
  isWishlistMode = !isWishlistMode;
  wishlistToggle.textContent = isWishlistMode ? "홈 보기" : "찜한 콘텐츠 보기";
  wishlistToggle.setAttribute("aria-pressed", String(isWishlistMode));
  refreshCurrentView().catch(showError);
});

document.querySelectorAll("[data-scroll]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.querySelector(btn.dataset.scroll);
    target?.scrollIntoView({ behavior: "smooth" });
  });
});

window.addEventListener("hashchange", () => {
  handleRoute().catch(showError);
});

function showError(error) {
  console.error(error);
  heroEl.style.backgroundImage = "none";
  heroEl.innerHTML = `
    <div class="hero-inner">
      <h1>문제가 발생했습니다</h1>
      <p>네트워크 또는 API 설정을 확인해주세요.</p>
    </div>
  `;
}

observer = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting) {
      loadMoreSearch().catch(showError);
    }
  },
  { rootMargin: "220px" }
);

observer.observe(loadMoreAnchor);

hydrateGenres()
  .then(() => {
    renderRecentSearches();
    return renderHome();
  })
  .then(() => handleRoute())
  .catch(showError);
