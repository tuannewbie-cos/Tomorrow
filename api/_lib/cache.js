// api/_lib/cache.js — Tomorrow v4.12 Edge Proxy Hub
// Layered Edge CDN Cache-Control profiles + bounded L2 warm container RAM cache

export const CACHE_PROFILES = Object.freeze({
  MARKET_LIVE: 'public, s-maxage=60, stale-while-revalidate=120',
  NEWS_FEED: 'public, s-maxage=180, stale-while-revalidate=300',
  NEWS_RADAR: 'public, s-maxage=300, stale-while-revalidate=600',
  SEARCH_RESULT: 'public, s-maxage=180, stale-while-revalidate=360',
  WEATHER: 'public, s-maxage=600, stale-while-revalidate=900',
  SCIENCE_STATIC: 'public, s-maxage=1800, stale-while-revalidate=3600',
  URL_READER: 'public, s-maxage=600, stale-while-revalidate=1200',
  NO_STORE: 'no-store',
});

export const CACHE_TTL_MS = Object.freeze({
  MARKET_LIVE: 60 * 1000,
  NEWS_FEED: 180 * 1000,
  NEWS_RADAR: 300 * 1000,
  SEARCH_RESULT: 180 * 1000,
  WEATHER: 600 * 1000,
  SCIENCE_STATIC: 1800 * 1000,
  URL_READER: 600 * 1000,
  NO_STORE: 0,
});

const MAX_WARM_CACHE_ENTRIES = 80;
const warmCache = new Map();

export function getProfileTtlMs(profile) {
  if (!profile || typeof profile !== 'string') return 0;
  return CACHE_TTL_MS[profile] ?? 0;
}

export function resolveCacheHeader(profile) {
  if (!profile || typeof profile !== 'string') return CACHE_PROFILES.NO_STORE;
  return CACHE_PROFILES[profile] || CACHE_PROFILES.NO_STORE;
}

/**
 * Sets Cache-Control and X-Tomorrow-Cache diagnostic headers on the HTTP response.
 */
export function applyCacheHeaders(res, profile = 'NO_STORE', cacheStatus = 'BYPASS') {
  const headerValue = resolveCacheHeader(profile);
  const safeStatus = headerValue === CACHE_PROFILES.NO_STORE ? 'BYPASS' : cacheStatus;
  res.setHeader('Cache-Control', headerValue);
  res.setHeader('X-Tomorrow-Cache', safeStatus);
  return headerValue;
}

function pruneWarmCache(now = Date.now()) {
  for (const [key, entry] of warmCache.entries()) {
    if (now >= entry.expiresAt) {
      warmCache.delete(key);
    }
  }
}

export function getWarmCache(key) {
  if (!key) return null;
  const entry = warmCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    warmCache.delete(key);
    return null;
  }
  // Refresh LRU order
  warmCache.delete(key);
  warmCache.set(key, entry);
  return entry.value;
}

export function setWarmCache(key, value, ttlMs) {
  if (!key || !ttlMs || ttlMs <= 0) return;
  const now = Date.now();
  pruneWarmCache(now);

  if (warmCache.size >= MAX_WARM_CACHE_ENTRIES && !warmCache.has(key)) {
    const oldestKey = warmCache.keys().next().value;
    if (oldestKey !== undefined) {
      warmCache.delete(oldestKey);
    }
  }

  warmCache.set(key, {
    value,
    expiresAt: now + ttlMs,
  });
}

export function clearWarmCache() {
  warmCache.clear();
}

export function getWarmCacheSize() {
  pruneWarmCache();
  return warmCache.size;
}

/**
 * Reads from L2 warm cache or computes & stores the value when profile allows caching.
 */
export async function getOrSetWarmCache(key, profile, producerFn) {
  const ttlMs = getProfileTtlMs(profile);
  if (!key || ttlMs <= 0) {
    const value = await producerFn();
    return { value, cached: false, cacheStatus: 'BYPASS' };
  }

  const hit = getWarmCache(key);
  if (hit !== null) {
    return { value: hit, cached: true, cacheStatus: 'HIT' };
  }

  const value = await producerFn();
  if (value !== null && value !== undefined) {
    setWarmCache(key, value, ttlMs);
  }
  return { value, cached: false, cacheStatus: 'MISS' };
}
