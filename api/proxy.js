// api/proxy.js — Tomorrow v4.12 Edge Proxy Hub Gateway
// Vercel Serverless Function (Node.js runtime)
import { applyCorsHeaders, handlePreflight } from './_lib/cors.js';
import {
  ALLOWED_PROXY_DOMAINS,
  checkSoftRateLimit,
  validateProxyTarget,
} from './_lib/security.js';
import {
  CACHE_PROFILES,
  applyCacheHeaders,
  getProfileTtlMs,
  getWarmCache,
  setWarmCache,
} from './_lib/cache.js';
import { safeUpstreamFetch } from './_lib/fetcher.js';

const DEFAULT_PROFILE_BY_CATEGORY = {
  weather: 'WEATHER',
  finance: 'MARKET_LIVE',
  news: 'NEWS_FEED',
  science: 'SCIENCE_STATIC',
  reader: 'URL_READER',
};

const MAX_TEXT_DATA_CHARS = 250000;

function resolveProfile(requestedProfile, matchedCategory) {
  if (
    typeof requestedProfile === 'string' &&
    Object.prototype.hasOwnProperty.call(CACHE_PROFILES, requestedProfile)
  ) {
    return requestedProfile;
  }
  return DEFAULT_PROFILE_BY_CATEGORY[matchedCategory] || 'NEWS_FEED';
}

function parseProxyData(rawText, contentType, requestedFormat) {
  const format = typeof requestedFormat === 'string' ? requestedFormat.trim().toLowerCase() : '';
  const looksJson =
    format === 'json' ||
    (!format && typeof contentType === 'string' && contentType.toLowerCase().includes('json'));

  if (looksJson) {
    try {
      return JSON.parse(rawText);
    } catch {
      if (format === 'json') {
        throw new Error('Upstream response is not valid JSON');
      }
    }
  }

  return String(rawText || '').slice(0, MAX_TEXT_DATA_CHARS);
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, 'GET, OPTIONS')) {
    return;
  }

  applyCorsHeaders(req, res, 'GET, OPTIONS');

  if (req.method !== 'GET') {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(405).json({
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
      reason: 'Only GET and OPTIONS are supported on /api/proxy',
    });
  }

  const query = req.query || {};
  const action = typeof query.action === 'string' ? query.action.trim().toLowerCase() : '';

  // 1. Health Check Mode
  if (action === 'health') {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(200).json({
      ok: true,
      service: 'tomorrow-edge-proxy-hub',
      version: 'v4.12',
      cacheProfiles: Object.keys(CACHE_PROFILES).filter((p) => p !== 'NO_STORE'),
      allowedCategories: Object.keys(ALLOWED_PROXY_DOMAINS),
      timestamp: new Date().toISOString(),
    });
  }

  const startedAt = Date.now();

  // 2. Soft Rate Limit (protect against concurrent 4-pane bursts)
  const rate = checkSoftRateLimit(req, { windowMs: 60000, max: 45 });
  if (!rate.allowed) {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(429).json({
      ok: false,
      error: 'RATE_LIMITED',
      reason: 'Too many proxy requests; please retry shortly',
      resetAt: rate.resetAt,
    });
  }

  // 3. Strict SSRF + Domain Allowlist Validation
  const rawUrl = typeof query.url === 'string' ? query.url : '';
  const requestedCategory = typeof query.category === 'string' ? query.category : undefined;
  const validation = validateProxyTarget(rawUrl, requestedCategory);

  if (!validation.ok) {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(validation.status || 403).json({
      ok: false,
      error: 'TARGET_NOT_ALLOWED',
      reason: validation.reason,
    });
  }

  const profile = resolveProfile(query.profile, validation.matchedCategory);
  const requestedFormat = typeof query.format === 'string' ? query.format.trim().toLowerCase() : '';
  const cacheKey = `proxy:${profile}:${requestedFormat || 'auto'}:${validation.url}`;
  const ttlMs = getProfileTtlMs(profile);

  // 4. L2 Warm Cache Lookup
  if (ttlMs > 0) {
    const cachedEntry = getWarmCache(cacheKey);
    if (cachedEntry) {
      applyCacheHeaders(res, profile, 'HIT');
      return res.status(200).json({
        ok: true,
        meta: {
          source: validation.hostname,
          category: validation.matchedCategory,
          profile,
          cached: true,
          fetchedAt: cachedEntry.fetchedAt,
          latencyMs: Date.now() - startedAt,
        },
        contentType: cachedEntry.contentType,
        data: cachedEntry.data,
      });
    }
  }

  // 5. Upstream Fetch with Timeout & Byte Limit
  try {
    const acceptHeader =
      requestedFormat === 'json'
        ? 'application/json, text/plain;q=0.9, */*;q=0.8'
        : 'text/plain, application/json, application/xml, text/xml;q=0.9, */*;q=0.8';

    const upstream = await safeUpstreamFetch(validation.url, {
      timeoutMs: 4500,
      maxBytes: 1500000,
      retries: 1,
      headers: { Accept: acceptHeader },
    });

    if (!upstream.ok) {
      applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
      return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502).json({
        ok: false,
        error: 'UPSTREAM_ERROR',
        status: upstream.status,
        reason: `Upstream returned HTTP ${upstream.status}`,
      });
    }

    const parsedData = parseProxyData(upstream.text, upstream.contentType, requestedFormat);
    const fetchedAt = new Date().toISOString();

    if (ttlMs > 0) {
      setWarmCache(
        cacheKey,
        {
          contentType: upstream.contentType,
          data: parsedData,
          fetchedAt,
        },
        ttlMs
      );
    }

    applyCacheHeaders(res, profile, ttlMs > 0 ? 'MISS' : 'BYPASS');
    return res.status(200).json({
      ok: true,
      meta: {
        source: validation.hostname,
        category: validation.matchedCategory,
        profile,
        cached: false,
        fetchedAt,
        latencyMs: Date.now() - startedAt,
      },
      contentType: upstream.contentType,
      data: parsedData,
    });
  } catch (err) {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(502).json({
      ok: false,
      error: 'UPSTREAM_FETCH_FAILED',
      reason: err?.message || 'Upstream fetch failed',
    });
  }
}
