const appShell = document.querySelector("#app-shell");
const searchView = document.querySelector("#search-view");
const detailView = document.querySelector("#detail-view");
const detailContent = document.querySelector("#detail-content");
const form = document.querySelector("#search-form");
const input = document.querySelector("#title-input");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const countriesEl = document.querySelector("#country-grid");
const summaryEl = document.querySelector("#scan-summary");
const selectAllButton = document.querySelector("#select-all");
const regionToggle = document.querySelector("#region-toggle");
const regionDrawer = document.querySelector("#region-drawer");
const rescanButton = document.querySelector("#rescan-button");
const backButton = document.querySelector("#back-button");
const disclaimerButton = document.querySelector("#disclaimer-button");
const disclaimerDialog = document.querySelector("#disclaimer-dialog");
const closeDisclaimer = document.querySelector("#close-disclaimer");
const infoButton = document.querySelector("#info-button");
const infoDialog = document.querySelector("#info-dialog");
const closeInfo = document.querySelector("#close-info");
const viewportMeta = document.querySelector('meta[name="viewport"]');

let countries = [];
let selectedCountries = new Set();
let currentController = null;
let currentItem = null;
let currentService = null;
let currentPosters = [];
let currentPosterIndex = 0;
let searchTimer = 0;

const DEFAULT_SERVICE = {
  id: "netflix",
  name: "Netflix",
  accent: "#ff2338",
  accentRgb: "255, 35, 56"
};

const mobileMedia = window.matchMedia("(max-width: 900px), (hover: none) and (pointer: coarse)");

function updateMobileMode() {
  const isMobile = mobileMedia.matches;
  appShell.classList.toggle("is-mobile", isMobile);

  if (viewportMeta) {
    viewportMeta.setAttribute(
      "content",
      isMobile
        ? "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        : "width=device-width, initial-scale=1, viewport-fit=cover"
    );
  }
}

updateMobileMode();
if (mobileMedia.addEventListener) {
  mobileMedia.addEventListener("change", updateMobileMode);
} else {
  mobileMedia.addListener(updateMobileMode);
}

window.setTimeout(() => {
  appShell.classList.remove("pulse-active");
}, 15000);

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function typeText(type) {
  return type === "show" ? "Serie" : "Film";
}

function compactNumber(value) {
  if (!value) return "";
  return new Intl.NumberFormat("de-DE", { notation: "compact" }).format(value);
}

function applyAccent(service = DEFAULT_SERVICE) {
  document.documentElement.style.setProperty("--accent", service.accent || DEFAULT_SERVICE.accent);
  document.documentElement.style.setProperty("--accent-rgb", service.accentRgb || DEFAULT_SERVICE.accentRgb);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function loadCountries() {
  const payload = await fetchJson("/api/countries");
  countries = payload.countries;
  selectedCountries = new Set(countries.map((country) => country.code));
  renderCountries();
}

function updateRegionSummary() {
  summaryEl.textContent = `${selectedCountries.size} of ${countries.length} regions`;
  selectAllButton.textContent = selectedCountries.size === countries.length ? "None" : "All";
}

function renderCountries() {
  countriesEl.innerHTML = countries.map((country) => `
    <label class="country-chip">
      <input type="checkbox" value="${country.code}" ${selectedCountries.has(country.code) ? "checked" : ""}>
      <span>${escapeHtml(country.flag)}</span>
      ${escapeHtml(country.name)}
    </label>
  `).join("");

  countriesEl.querySelectorAll("input").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedCountries.add(checkbox.value);
      else selectedCountries.delete(checkbox.value);
      updateRegionSummary();
    });
  });
  updateRegionSummary();
}

function renderSearchResults(results) {
  if (!results.length) {
    resultsEl.innerHTML = `<div class="notice">No IMDb match.</div>`;
    return;
  }

  resultsEl.innerHTML = results.map((item, index) => `
    <button class="title-card" type="button" data-index="${index}">
      <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
      <span class="title-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(typeText(item.type))} · ${escapeHtml(item.year || "")}</span>
        <small>${escapeHtml(item.cast || item.imdbId)}</small>
      </span>
    </button>
  `).join("");

  resultsEl.querySelectorAll(".title-card").forEach((button) => {
    button.addEventListener("click", () => scanTitle(results[Number(button.dataset.index)]));
  });
}

function loadingDetail(item, label = "Scanning Netflix regions") {
  appShell.classList.add("is-detail");
  searchView.hidden = true;
  detailView.hidden = false;
  detailContent.innerHTML = `
    <div class="detail-loading">
      <div class="poster-shell">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ""}
      </div>
      <div>
        <span class="eyebrow">${escapeHtml(label)}</span>
        <h2>${escapeHtml(item.title)}</h2>
        <p>Checking regional catalog pages...</p>
      </div>
      <div class="spinner" aria-hidden="true"></div>
    </div>
  `;
}

function formatRuntime(minutes, type) {
  if (!minutes) return "Runtime unknown";
  return `${minutes} min`;
}

function formatSeasonCount(count) {
  if (!count) return "Seasons unknown";
  return `${count} season${count === 1 ? "" : "s"}`;
}

function renderMetaList(meta) {
  const items = [
    meta.year,
    typeText(meta.type),
    meta.type === "show" ? formatSeasonCount(meta.seasonCount) : formatRuntime(meta.runtime, meta.type),
    meta.ageCertification
  ].filter(Boolean);
  return items.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
}

function regionSummary(regions, service) {
  if (!regions.length) return `Not detected on ${service.name} in the selected regions`;
  const names = regions.map((region) => region.name);
  if (names.length <= 8) return names.join(", ");
  return `${names.slice(0, 8).join(", ")} +${names.length - 8} more`;
}

function imdbTitleUrl(imdbId) {
  return imdbId ? `https://www.imdb.com/title/${encodeURIComponent(imdbId)}/` : "https://www.imdb.com/";
}

function justWatchTitleUrl(meta, regions) {
  if (meta.fullPath) return `https://www.justwatch.com${meta.fullPath}`;
  return regions[0]?.sourceUrl || "https://www.justwatch.com/";
}

function providerTitleUrl(regions) {
  for (const region of regions) {
    const offer = (region.offers || []).find((item) => item.url);
    if (offer?.url) return offer.url;
  }
  return "";
}

function renderAvailability(payload) {
  const regions = payload.available || [];
  const errors = payload.errors || [];
  const meta = payload.metadata || payload.selected;
  const service = payload.service || DEFAULT_SERVICE;
  currentService = service;
  applyAccent(service);
  const checkedAt = new Date(payload.checkedAt).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const imdbUrl = imdbTitleUrl(payload.selected?.imdbId);
  const justWatchUrl = justWatchTitleUrl(meta, regions);
  const providerUrl = providerTitleUrl(regions);
  const availabilityText = regions.length
    ? `Available on ${service.name}`
    : service.id === "netflix"
      ? "No Netflix hit"
      : `No ${service.name} hit`;
  const availabilityLabel = regions.length && providerUrl
    ? `<a class="availability-link" href="${escapeHtml(providerUrl)}" target="_blank" rel="noreferrer">${escapeHtml(availabilityText)}</a>`
    : `<span>${escapeHtml(availabilityText)}</span>`;
  const rating = meta.imdbScore
    ? `${meta.imdbScore}/10 <a href="${escapeHtml(imdbUrl)}" target="_blank" rel="noreferrer">IMDb</a>${meta.imdbVotes ? ` (${compactNumber(meta.imdbVotes)})` : ""}`
    : `<a href="${escapeHtml(imdbUrl)}" target="_blank" rel="noreferrer">IMDb</a> score unavailable`;
  currentPosters = Array.isArray(meta.posters) && meta.posters.length ? meta.posters : [meta.poster].filter(Boolean);
  currentPosterIndex = 0;
  const canCyclePoster = currentPosters.length > 1;

  detailContent.innerHTML = `
    <div class="detail-grid">
      <button class="poster-shell poster-button" type="button" ${canCyclePoster ? "" : "disabled"} aria-label="${canCyclePoster ? "Show next cover" : "Cover"}">
        ${currentPosters[0] ? `<img id="detail-poster" src="${escapeHtml(currentPosters[0])}" alt="">` : ""}
      </button>
      <section class="metadata-panel">
        <span class="eyebrow availability-eyebrow">
          ${availabilityLabel}
          ${!regions.length && service.id === "netflix" ? `<button class="where-else-button" type="button">Where else?</button>` : ""}
        </span>
        <h2><a href="${escapeHtml(justWatchUrl)}" target="_blank" rel="noreferrer">${escapeHtml(meta.title || payload.selected.title)}</a></h2>
        <div class="meta-row">${renderMetaList(meta)}</div>
        <p class="description">${escapeHtml(meta.description || "No description found in the regional catalog metadata.")}</p>
        <div class="facts">
          <div><span>Cast</span><strong>${escapeHtml(meta.cast || "Unknown")}</strong></div>
          <div><span>Director</span><strong>${escapeHtml(meta.directors || "Unknown")}</strong></div>
          <div><span>Genre</span><strong>${escapeHtml((meta.genres || []).join(", ") || "Unknown")}</strong></div>
          <div><span>Rating</span><strong>${rating}</strong></div>
        </div>
      </section>
      <aside class="availability-card">
        <span class="eyebrow">${escapeHtml(service.name)} regions</span>
        <strong>${regions.length ? `${regions.length} region${regions.length === 1 ? "" : "s"}` : "No regions"}</strong>
        <p>${escapeHtml(regionSummary(regions, service))}</p>
        <div class="region-pills">
          ${regions.slice(0, 12).map((region) => `<a href="${escapeHtml(region.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(region.flag)} ${escapeHtml(region.name)}</a>`).join("")}
        </div>
        <small>${payload.checked} / ${payload.total} checked · ${checkedAt}${errors.length ? ` · ${errors.length} failed` : ""}</small>
        <small class="data-credit">Data provided by <a href="https://www.imdb.com/" target="_blank" rel="noreferrer">IMDb</a> and <a href="https://www.justwatch.com/" target="_blank" rel="noreferrer">JustWatch</a>. Availability inferred from regional catalog pages.</small>
      </aside>
    </div>
  `;
}

function paramsForItem(item) {
  return new URLSearchParams({
    imdbId: item.imdbId,
    title: item.title,
    year: item.year || "",
    type: item.type,
    cast: item.cast || "",
    image: item.image || "",
    countries: [...selectedCountries].join(",")
  });
}

async function scanTitle(item, service = DEFAULT_SERVICE) {
  if (!selectedCountries.size) {
    regionDrawer.hidden = false;
    regionToggle.setAttribute("aria-expanded", "true");
    return;
  }

  currentItem = item;
  currentService = service;
  applyAccent(service);
  if (currentController) currentController.abort();
  currentController = new AbortController();
  loadingDetail(item, `Scanning ${service.name} regions`);

  const params = paramsForItem(item);
  params.set("service", service.id);

  try {
    const payload = await fetchJson(`/api/availability?${params}`, { signal: currentController.signal });
    renderAvailability(payload);
  } catch (error) {
    if (error.name === "AbortError") return;
    detailContent.innerHTML = `<div class="notice detail-notice">Scan failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function findWhereElse() {
  if (!currentItem) return;
  if (currentController) currentController.abort();
  currentController = new AbortController();
  applyAccent(DEFAULT_SERVICE);
  loadingDetail(currentItem, "Scanning other services");

  try {
    const payload = await fetchJson(`/api/where-else?${paramsForItem(currentItem)}`, { signal: currentController.signal });
    renderAvailability(payload);
  } catch (error) {
    if (error.name === "AbortError") return;
    detailContent.innerHTML = `<div class="notice detail-notice">Scan failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function runSearch() {
  const query = input.value.trim();
  if (query.length < 2) {
    resultsEl.innerHTML = "";
    setStatus("");
    return;
  }
  setStatus("Searching...");
  try {
    const payload = await fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
    renderSearchResults(payload.results);
    setStatus("");
  } catch (error) {
    setStatus(error.message, "warn");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

input.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(runSearch, 260);
});

selectAllButton.addEventListener("click", () => {
  const allSelected = selectedCountries.size === countries.length;
  selectedCountries = new Set(allSelected ? [] : countries.map((country) => country.code));
  renderCountries();
});

regionToggle.addEventListener("click", () => {
  const open = regionDrawer.hidden;
  regionDrawer.hidden = !open;
  regionToggle.setAttribute("aria-expanded", String(open));
});

rescanButton.addEventListener("click", () => {
  if (currentItem) scanTitle(currentItem, currentService || DEFAULT_SERVICE);
});

backButton.addEventListener("click", () => {
  if (currentController) currentController.abort();
  appShell.classList.remove("is-detail");
  detailView.hidden = true;
  searchView.hidden = false;
  applyAccent(DEFAULT_SERVICE);
  input.focus();
});

disclaimerButton.addEventListener("click", () => {
  disclaimerDialog.showModal();
});

closeDisclaimer.addEventListener("click", () => {
  disclaimerDialog.close();
});

infoButton.addEventListener("click", () => {
  if (mobileMedia.matches) infoDialog.showModal();
});

closeInfo.addEventListener("click", () => {
  infoDialog.close();
});

detailContent.addEventListener("click", (event) => {
  if (event.target.closest(".where-else-button")) {
    findWhereElse();
    return;
  }

  const posterButton = event.target.closest(".poster-button");
  if (!posterButton || currentPosters.length < 2) return;
  currentPosterIndex = (currentPosterIndex + 1) % currentPosters.length;
  const image = document.querySelector("#detail-poster");
  if (image) image.src = currentPosters[currentPosterIndex];
});

loadCountries().catch((error) => setStatus(error.message, "warn"));
