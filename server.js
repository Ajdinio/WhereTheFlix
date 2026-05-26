import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const env = globalThis.process?.env || {};
const port = Number(env.PORT || 3000);

const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 30;

const COUNTRIES = [
  { code: "us", country: "US", name: "United States", locale: "en_US", language: "en", searchPath: "search", flag: "US" },
  { code: "de", country: "DE", name: "Germany", locale: "de_DE", language: "de", searchPath: "Suche", flag: "DE" },
  { code: "uk", country: "GB", name: "United Kingdom", locale: "en_GB", language: "en", searchPath: "search", flag: "GB" },
  { code: "ca", country: "CA", name: "Canada", locale: "en_CA", language: "en", searchPath: "search", flag: "CA" },
  { code: "au", country: "AU", name: "Australia", locale: "en_AU", language: "en", searchPath: "search", flag: "AU" },
  { code: "fr", country: "FR", name: "France", locale: "fr_FR", language: "fr", searchPath: "recherche", flag: "FR" },
  { code: "es", country: "ES", name: "Spain", locale: "es_ES", language: "es", searchPath: "buscar", flag: "ES" },
  { code: "it", country: "IT", name: "Italy", locale: "it_IT", language: "it", searchPath: "cerca", flag: "IT" },
  { code: "nl", country: "NL", name: "Netherlands", locale: "en_NL", language: "en", searchPath: "search", flag: "NL" },
  { code: "at", country: "AT", name: "Austria", locale: "de_AT", language: "de", searchPath: "Suche", flag: "AT" },
  { code: "ch", country: "CH", name: "Switzerland", locale: "de_CH", language: "de", searchPath: "Suche", flag: "CH" },
  { code: "se", country: "SE", name: "Sweden", locale: "en_SE", language: "en", searchPath: "search", flag: "SE" },
  { code: "no", country: "NO", name: "Norway", locale: "en_NO", language: "en", searchPath: "search", flag: "NO" },
  { code: "dk", country: "DK", name: "Denmark", locale: "en_DK", language: "en", searchPath: "search", flag: "DK" },
  { code: "pt", country: "PT", name: "Portugal", locale: "pt_PT", language: "pt", searchPath: "busca", flag: "PT" },
  { code: "br", country: "BR", name: "Brazil", locale: "pt_BR", language: "pt", searchPath: "busca", flag: "BR" },
  { code: "mx", country: "MX", name: "Mexico", locale: "es_MX", language: "es", searchPath: "buscar", flag: "MX" },
  { code: "in", country: "IN", name: "India", locale: "en_IN", language: "en", searchPath: "search", flag: "IN" },
  { code: "jp", country: "JP", name: "Japan", locale: "ja_JP", language: "ja", searchPath: "%E6%A4%9C%E7%B4%A2", flag: "JP" },
  { code: "pl", country: "PL", name: "Poland", locale: "pl_PL", language: "pl", searchPath: "search", flag: "PL" },
  { code: "za", country: "ZA", name: "South Africa", locale: "en_ZA", language: "en", searchPath: "search", flag: "ZA" },
  { code: "ie", country: "IE", name: "Ireland", locale: "en_IE", language: "en", searchPath: "search", flag: "IE" },
  { code: "nz", country: "NZ", name: "New Zealand", locale: "en_NZ", language: "en", searchPath: "search", flag: "NZ" },
  { code: "be", country: "BE", name: "Belgium", locale: "fr_BE", language: "fr", searchPath: "recherche", flag: "BE" }
];

const SERVICES = [
  {
    id: "netflix",
    name: "Netflix",
    accent: "#ff2338",
    accentRgb: "255, 35, 56",
    terms: ["netflix", "nfx", "nfa", "netflixbasicwithads"]
  },
  {
    id: "disney",
    name: "Disney+",
    accent: "#196A7B",
    accentRgb: "25, 106, 123",
    terms: ["disney", "dnp"]
  },
  {
    id: "prime",
    name: "Prime Video",
    accent: "#0779FF",
    accentRgb: "7, 121, 255",
    terms: ["amazon prime", "prime video", "amazonprime", "amp"]
  },
  {
    id: "hulu",
    name: "Hulu",
    accent: "#1CE783",
    accentRgb: "28, 231, 131",
    terms: ["hulu"]
  },
  {
    id: "max",
    name: "Max",
    accent: "#6B38FF",
    accentRgb: "107, 56, 255",
    terms: ["max", "hbo max", "hbomax"]
  },
  {
    id: "apple",
    name: "Apple TV+",
    accent: "#A7ADB4",
    accentRgb: "167, 173, 180",
    terms: ["apple tv plus", "apple tv+", "appletvplus"]
  },
  {
    id: "crunchyroll",
    name: "Crunchyroll",
    accent: "#F47521",
    accentRgb: "244, 117, 33",
    terms: ["crunchyroll", "cru"]
  },
  {
    id: "paramount",
    name: "Paramount+",
    accent: "#0064FF",
    accentRgb: "0, 100, 255",
    terms: ["paramount", "pmp"]
  },
  {
    id: "peacock",
    name: "Peacock",
    accent: "#FCCC12",
    accentRgb: "252, 204, 18",
    terms: ["peacock"]
  },
  {
    id: "mubi",
    name: "MUBI",
    accent: "#E6C95C",
    accentRgb: "230, 201, 92",
    terms: ["mubi"]
  }
];

const DEFAULT_SERVICE = SERVICES[0];
const ALTERNATIVE_SERVICES = SERVICES.filter((service) => service.id !== DEFAULT_SERVICE.id);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function cleanQuery(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function publicService(service) {
  return {
    id: service.id,
    name: service.name,
    accent: service.accent,
    accentRgb: service.accentRgb
  };
}

function serviceById(id) {
  return SERVICES.find((service) => service.id === id) || DEFAULT_SERVICE;
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

async function fetchText(url, timeoutMs = 14000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.8,de;q=0.7",
        "user-agent": "WhereTheFlix/0.1 (+local research app)"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function imdbSuggestUrl(query) {
  const key = query.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 1) || "x";
  return `https://v3.sg.media-imdb.com/suggestion/${key}/${encodeURIComponent(query)}.json`;
}

async function searchImdb(query) {
  const cacheKey = `imdb:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const payload = JSON.parse(await fetchText(imdbSuggestUrl(query), 10000));
  const results = (payload.d || [])
    .filter((item) => item.id && item.l && ["movie", "tvSeries", "tvMiniSeries"].includes(item.qid))
    .slice(0, 8)
    .map((item) => ({
      imdbId: item.id,
      title: item.l,
      year: item.y || null,
      type: item.qid === "movie" ? "movie" : "show",
      typeLabel: item.q || item.qid,
      cast: item.s || "",
      image: item.i?.imageUrl || "",
      rank: item.rank || null
    }));

  return cacheSet(cacheKey, { query, results, source: "IMDb suggestions" });
}

function extractApolloState(html) {
  const marker = "window.__APOLLO_STATE__=";
  const start = html.indexOf(marker);
  if (start >= 0) {
    const end = html.indexOf("</script>", start);
    if (end >= 0) {
      return JSON.parse(html.slice(start + marker.length, end)).defaultClient;
    }
  }
  return extractNuxtApolloState(html);
}

function extractNuxtApolloState(html) {
  const match = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  const payload = JSON.parse(match[1]);
  const apolloIndex = payload.findIndex((entry) => (
    entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    Object.prototype.hasOwnProperty.call(entry, "ROOT_QUERY")
  ));
  if (apolloIndex < 0) return null;

  const memo = new Map();
  function hydrateRef(ref) {
    if (typeof ref !== "number" || ref < 0 || ref >= payload.length) return ref;
    if (memo.has(ref)) return memo.get(ref);

    const node = payload[ref];
    if (Array.isArray(node)) {
      if (typeof node[0] === "string" && ["Reactive", "ShallowReactive", "Ref", "ref"].includes(node[0])) {
        return hydrateRef(node[1]);
      }
      const array = [];
      memo.set(ref, array);
      for (const item of node) array.push(hydrateRef(item));
      return array;
    }

    if (node && typeof node === "object") {
      const object = {};
      memo.set(ref, object);
      for (const [key, value] of Object.entries(node)) object[key] = hydrateRef(value);
      return object;
    }

    return node;
  }

  const root = payload[apolloIndex];
  const state = {};
  for (const [key, value] of Object.entries(root)) state[key] = hydrateRef(value);
  return state;
}

function contentForObject(state, objectKey) {
  const object = state[objectKey];
  if (!object) return null;
  const contentRef = Object.values(object).find((value) => value?.typename?.endsWith("Content") && value.id);
  return contentRef ? state[contentRef.id] : null;
}

function resolveRef(state, value) {
  if (value?.type === "id" && value.id) return state[value.id] || null;
  return value || null;
}

function resolveRefArray(state, values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => resolveRef(state, value)).filter(Boolean);
}

function imageUrl(path, profile = "s718") {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `https://images.justwatch.com${path.replace("{profile}", profile).replace("{format}", "jpg")}`;
}

function uniqueImages(values) {
  const seen = new Set();
  return values
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter((value) => {
      const key = value
        .replace(/\._V1_.*(?=\.)/, "")
        .replace(/\/poster\/(\d+)\/[^/]+\//i, "/poster/$1/")
        .toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function collectPosterUrls(state, node, depth = 0, seenRefs = new Set()) {
  if (!node || depth > 4) return [];

  if (typeof node === "string") return [];

  if (Array.isArray(node)) {
    return node.flatMap((value) => collectPosterUrls(state, value, depth + 1, seenRefs));
  }

  if (node.type === "id" && node.id) {
    if (seenRefs.has(node.id)) return [];
    seenRefs.add(node.id);
    return collectPosterUrls(state, state?.[node.id], depth + 1, seenRefs);
  }

  if (typeof node !== "object") return [];

  const urls = [];
  for (const [key, value] of Object.entries(node)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("poster") && typeof value === "string") {
      urls.push(imageUrl(value));
      continue;
    }
    if (value && (typeof value === "object" || Array.isArray(value))) {
      urls.push(...collectPosterUrls(state, value, depth + 1, seenRefs));
    }
  }
  return urls;
}

function contentMetadata(state, content, selected) {
  if (!content) {
    const posters = uniqueImages([selected.image]);
    return {
      title: selected.title,
      year: selected.year,
      type: selected.type,
      cast: selected.cast || "",
      poster: selected.image || "",
      posters
    };
  }

  const scoring = resolveRef(state, content.scoring) || content.scoring || {};
  const genres = resolveRefArray(state, content.genres)
    .map((genre) => genre['translation({"language":"en"})'] || genre['translation({"language":"de"})'] || genre.shortName)
    .filter(Boolean)
    .slice(0, 5);
  const actorCredits = resolveRefArray(state, content['credits({"first":20,"role":"ACTOR"})'])
    .map((credit) => credit.name)
    .filter(Boolean)
    .slice(0, 6);
  const directorCredits = resolveRefArray(state, content['credits({"role":"DIRECTOR"})'])
    .map((credit) => credit.name)
    .filter(Boolean)
    .slice(0, 3);
  const poster = imageUrl(content['posterUrl({"format":"JPG","profile":"S718"})'] || content.posterUrl) || selected.image || "";
  const posters = uniqueImages([poster, ...collectPosterUrls(state, content), selected.image]);

  return {
    title: content.title || selected.title,
    originalTitle: content.originalTitle || "",
    year: content.originalReleaseYear || selected.year || null,
    type: selected.type,
    runtime: content.runtime || null,
    ageCertification: content.ageCertification || "",
    description: content.shortDescription || "",
    genres,
    cast: actorCredits.length ? actorCredits.join(", ") : selected.cast || "",
    directors: directorCredits.join(", "),
    imdbScore: scoring.imdbScore || null,
    imdbVotes: scoring.imdbVotes || null,
    tomatoMeter: scoring.tomatoMeter || null,
    poster,
    posters,
    fullPath: content.fullPath || ""
  };
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(the|a|an|der|die|das|la|le|les|el|los|las|il|lo|gli|i|de|het)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleScore(a, b) {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.82;
  const xs = new Set(x.split(" "));
  const ys = y.split(" ");
  const overlap = ys.filter((part) => xs.has(part)).length;
  return overlap / Math.max(xs.size, ys.length);
}

function objectTypeFor(imdbType) {
  return imdbType === "show" ? "Show" : "Movie";
}

function findBestJustWatchObject(state, selected) {
  const preferredType = objectTypeFor(selected.type);
  const candidates = Object.entries(state)
    .filter(([key, value]) => key.startsWith(`${preferredType}:`) && value?.objectType)
    .map(([key, object]) => {
      const content = contentForObject(state, key);
      return { key, object, content };
    })
    .filter((entry) => entry.content?.title);

  const ranked = candidates
    .map((entry) => {
      const releaseYear = entry.content.originalReleaseYear || null;
      const yearMatch = selected.year && releaseYear ? Math.abs(Number(selected.year) - Number(releaseYear)) <= 1 : true;
      return {
        ...entry,
        score: titleScore(entry.content.title, selected.title) + (yearMatch ? 0.2 : -0.4)
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 0.72 ? ranked[0] : ranked[0] || null;
}

function findMatchingObject(state, selected, canonicalObjectId) {
  const preferredType = objectTypeFor(selected.type);
  const candidates = Object.entries(state)
    .filter(([key, value]) => key.startsWith(`${preferredType}:`) && value?.objectType)
    .map(([key, object]) => ({ key, object, content: contentForObject(state, key) }))
    .filter((entry) => entry.content?.title);

  const byCanonicalId = candidates.find((entry) => entry.object.id === canonicalObjectId || entry.key.endsWith(canonicalObjectId));
  if (byCanonicalId) return byCanonicalId;

  const ranked = candidates
    .map((entry) => {
      const releaseYear = entry.content.originalReleaseYear || entry.content.original_release_year || null;
      const yearMatch = selected.year && releaseYear ? Math.abs(Number(selected.year) - Number(releaseYear)) <= 1 : true;
      const score = titleScore(entry.content.title, selected.title) + (yearMatch ? 0.2 : -0.4);
      return { ...entry, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 0.72 ? ranked[0] : null;
}

function collectOfferRefs(object) {
  const refs = new Map();
  for (const [key, value] of Object.entries(object)) {
    if (!key.startsWith("offers(") || !Array.isArray(value)) continue;
    for (const ref of value) {
      if (ref?.id?.startsWith("Offer:")) refs.set(ref.id, ref.id);
    }
  }
  return [...refs.values()];
}

function isServicePackage(pkg, service) {
  const haystack = [pkg?.clearName, pkg?.technicalName, pkg?.shortName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return service.terms.some((term) => haystack.includes(term));
}

function offersForService(state, object, service) {
  const offerRefs = collectOfferRefs(object);
  const offers = [];
  for (const ref of offerRefs) {
    const offer = state[ref];
    const pkg = offer?.package?.id ? state[offer.package.id] : null;
    if (!offer || !pkg || !isServicePackage(pkg, service)) continue;
    if (["BUY", "RENT", "CINEMA"].includes(offer.monetizationType)) continue;
    offers.push({
      provider: pkg.clearName || service.name,
      technicalName: pkg.technicalName || "",
      monetizationType: offer.monetizationType,
      presentationType: offer.presentationType,
      url: offer.standardWebURL || offer.streamUrl || null,
      updatedAt: offer.updatedAt || null
    });
  }
  return offers;
}

function serviceOffersFor(state, object, services) {
  return Object.fromEntries(services.map((service) => [service.id, offersForService(state, object, service)]));
}

async function scrapeJustWatchCountry(country, selected, canonicalObjectId, service) {
  const searchUrl = `https://www.justwatch.com/${country.code}/${country.searchPath}?q=${encodeURIComponent(selected.title)}`;
  const html = await fetchText(searchUrl);
  const state = extractApolloState(html);
  if (!state) {
    throw new Error("No JustWatch state found");
  }

  const match = findMatchingObject(state, selected, canonicalObjectId);
  if (!match) {
    return { ...country, available: false, matched: false, offers: [], sourceUrl: searchUrl };
  }

  const offers = offersForService(state, match.object, service);
  return {
    ...country,
    available: offers.length > 0,
    matched: true,
    title: match.content.title,
    fullPath: match.content.fullPath,
    year: match.content.originalReleaseYear || null,
    offers,
    sourceUrl: match.content.fullPath ? `https://www.justwatch.com${match.content.fullPath}` : searchUrl
  };
}

async function scrapeJustWatchCountryForServices(country, selected, canonicalObjectId, services) {
  const searchUrl = `https://www.justwatch.com/${country.code}/${country.searchPath}?q=${encodeURIComponent(selected.title)}`;
  const html = await fetchText(searchUrl);
  const state = extractApolloState(html);
  if (!state) {
    throw new Error("No JustWatch state found");
  }

  const match = findMatchingObject(state, selected, canonicalObjectId);
  if (!match) {
    return { ...country, matched: false, serviceOffers: {}, sourceUrl: searchUrl };
  }

  return {
    ...country,
    matched: true,
    title: match.content.title,
    fullPath: match.content.fullPath,
    year: match.content.originalReleaseYear || null,
    serviceOffers: serviceOffersFor(state, match.object, services),
    sourceUrl: match.content.fullPath ? `https://www.justwatch.com${match.content.fullPath}` : searchUrl
  };
}

async function withConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function scanAvailability(selected, countryCodes) {
  return scanServiceAvailability(selected, countryCodes, DEFAULT_SERVICE);
}

async function getSeedMetadata(selected, countries) {
  let canonicalObjectId = null;
  let metadata = contentMetadata(null, null, selected);
  try {
    const seedCountry = COUNTRIES.find((country) => country.code === "us") || countries[0];
    const seedHtml = await fetchText(`https://www.justwatch.com/${seedCountry.code}/${seedCountry.searchPath}?q=${encodeURIComponent(selected.title)}`);
    const seedState = extractApolloState(seedHtml);
    const seedMatch = seedState ? findBestJustWatchObject(seedState, selected) : null;
    canonicalObjectId = seedMatch?.object?.id || null;
    if (seedMatch?.content?.fullPath) {
      const detailHtml = await fetchText(`https://www.justwatch.com${seedMatch.content.fullPath}`);
      const detailState = extractApolloState(detailHtml);
      const detailMatch = detailState ? findMatchingObject(detailState, selected, canonicalObjectId) : null;
      metadata = contentMetadata(detailState, detailMatch?.content || seedMatch.content, selected);
    } else if (seedMatch?.content) {
      metadata = contentMetadata(seedState, seedMatch.content, selected);
    }
  } catch {
    canonicalObjectId = null;
  }
  return { canonicalObjectId, metadata };
}

async function scanServiceAvailability(selected, countryCodes, service) {
  const cacheKey = `availability:${service.id}:${selected.imdbId}:${countryCodes.join(",")}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const countries = countryCodes.length
    ? COUNTRIES.filter((country) => countryCodes.includes(country.code))
    : COUNTRIES;

  const { canonicalObjectId, metadata } = await getSeedMetadata(selected, countries);

  const regions = await withConcurrency(countries, 5, async (country) => {
    try {
      return await scrapeJustWatchCountry(country, selected, canonicalObjectId, service);
    } catch (error) {
      return {
        ...country,
        available: false,
        matched: false,
        offers: [],
        error: error.message
      };
    }
  });

  const available = regions
    .filter((region) => region.available)
    .sort((a, b) => a.name.localeCompare(b.name));

  const checked = regions.filter((region) => !region.error).length;
  return cacheSet(cacheKey, {
    selected,
    service: publicService(service),
    metadata,
    checkedAt: new Date().toISOString(),
    source: "IMDb suggestions + JustWatch regional pages",
    available,
    unavailable: regions.filter((region) => !region.available && region.matched && !region.error),
    errors: regions.filter((region) => region.error),
    checked,
    total: regions.length
  });
}

async function scanAlternativeAvailability(selected, countryCodes) {
  const cacheKey = `whereelse:${selected.imdbId}:${countryCodes.join(",")}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const countries = countryCodes.length
    ? COUNTRIES.filter((country) => countryCodes.includes(country.code))
    : COUNTRIES;

  const { canonicalObjectId, metadata } = await getSeedMetadata(selected, countries);

  const regions = await withConcurrency(countries, 5, async (country) => {
    try {
      return await scrapeJustWatchCountryForServices(country, selected, canonicalObjectId, ALTERNATIVE_SERVICES);
    } catch (error) {
      return {
        ...country,
        matched: false,
        serviceOffers: {},
        error: error.message
      };
    }
  });

  const checked = regions.filter((region) => !region.error).length;
  const errors = regions.filter((region) => region.error);
  const serviceResults = ALTERNATIVE_SERVICES.map((service) => {
    const available = regions
      .filter((region) => (region.serviceOffers?.[service.id] || []).length > 0)
      .map((region) => ({
        ...region,
        available: true,
        offers: region.serviceOffers[service.id]
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { service, available };
  });

  const hit = serviceResults.find((result) => result.available.length > 0);
  const service = hit?.service || ALTERNATIVE_SERVICES[0];
  const available = hit?.available || [];

  return cacheSet(cacheKey, {
    selected,
    service: publicService(service),
    metadata,
    checkedAt: new Date().toISOString(),
    source: "IMDb suggestions + JustWatch regional pages",
    available,
    unavailable: regions.filter((region) => region.matched && !region.error && !(region.serviceOffers?.[service.id] || []).length),
    errors,
    checked,
    total: regions.length,
    alternatives: serviceResults.map((result) => ({
      service: publicService(result.service),
      availableCount: result.available.length
    }))
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/countries") {
    return json(res, 200, { countries: COUNTRIES });
  }

  if (url.pathname === "/api/search") {
    const query = cleanQuery(url.searchParams.get("q"));
    if (query.length < 2) return json(res, 400, { error: "Bitte gib mindestens zwei Zeichen ein." });
    return json(res, 200, await searchImdb(query));
  }

  if (url.pathname === "/api/availability") {
    const selected = {
      imdbId: cleanQuery(url.searchParams.get("imdbId")),
      title: cleanQuery(url.searchParams.get("title")),
      year: Number(url.searchParams.get("year")) || null,
      type: url.searchParams.get("type") === "show" ? "show" : "movie",
      cast: cleanQuery(url.searchParams.get("cast")),
      image: String(url.searchParams.get("image") || "").trim().slice(0, 500)
    };
    if (!selected.imdbId || !selected.title) {
      return json(res, 400, { error: "IMDb-ID und Titel fehlen." });
    }
    const countryCodes = cleanQuery(url.searchParams.get("countries"))
      .split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    const service = serviceById(cleanQuery(url.searchParams.get("service")) || DEFAULT_SERVICE.id);
    return json(res, 200, await scanServiceAvailability(selected, countryCodes, service));
  }

  if (url.pathname === "/api/where-else") {
    const selected = {
      imdbId: cleanQuery(url.searchParams.get("imdbId")),
      title: cleanQuery(url.searchParams.get("title")),
      year: Number(url.searchParams.get("year")) || null,
      type: url.searchParams.get("type") === "show" ? "show" : "movie",
      cast: cleanQuery(url.searchParams.get("cast")),
      image: String(url.searchParams.get("image") || "").trim().slice(0, 500)
    };
    if (!selected.imdbId || !selected.title) {
      return json(res, 400, { error: "IMDb-ID und Titel fehlen." });
    }
    const countryCodes = cleanQuery(url.searchParams.get("countries"))
      .split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    return json(res, 200, await scanAlternativeAvailability(selected, countryCodes));
  }

  return json(res, 404, { error: "Route nicht gefunden." });
}

async function handleStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await handleStatic(req, res, url);
    }
  } catch (error) {
    json(res, 500, { error: error.message || "Interner Fehler" });
  }
}).listen(port, () => {
  console.log(`WhereTheFlix runs at http://localhost:${port}`);
});
