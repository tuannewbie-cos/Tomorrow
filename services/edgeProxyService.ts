// services/edgeProxyService.ts — Tomorrow v4.12 Edge Proxy Client Hub
// Unified API base URL resolution, L1 RAM cache (<= 60 entries), and in-flight deduplication

export type EdgeCacheProfile =
  | 'MARKET_LIVE'
  | 'NEWS_FEED'
  | 'SEARCH_RESULT'
  | 'WEATHER'
  | 'SCIENCE_STATIC'
  | 'URL_READER'
  | 'NO_STORE';

export interface EdgeProxyMeta {
  source: string;
  category: string;
  profile: string;
  cached: boolean;
  fetchedAt: string;
  latencyMs: number;
}

export interface EdgeProxyResult<T> {
  ok: boolean;
  data?: T;
  meta?: EdgeProxyMeta;
  contentType?: string;
  fromL1Cache: boolean;
  status?: number;
  error?: string;
}

export interface HubEndpointResult<T> {
  ok: boolean;
  data?: T;
  fromL1Cache: boolean;
  status?: number;
  error?: string;
}

export interface ProxyHubHealthResponse {
  ok: boolean;
  service?: string;
  version?: string;
  cacheProfiles?: string[];
  allowedCategories?: string[];
  timestamp?: string;
  error?: string;
}

export interface FetchViaEdgeProxyOptions {
  profile?: EdgeCacheProfile;
  format?: 'json' | 'text';
  category?: string;
  timeoutMs?: number;
  ttlMs?: number;
  bypassCache?: boolean;
}

export interface FetchHubEndpointOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  ttlMs?: number;
  bypassCache?: boolean;
  cacheKey?: string;
}

interface ProxyEnvelope<T> {
  ok: boolean;
  meta?: EdgeProxyMeta;
  contentType?: string;
  data?: T;
  error?: string;
  reason?: string;
}

interface L1CacheEntry {
  value: unknown;
  expiresAt: number;
}

const L1_MAX_ENTRIES = 60;
const DEFAULT_L1_TTL_BY_PROFILE: Record<EdgeCacheProfile, number> = {
  MARKET_LIVE: 30 * 1000,
  NEWS_FEED: 90 * 1000,
  SEARCH_RESULT: 60 * 1000,
  WEATHER: 180 * 1000,
  SCIENCE_STATIC: 300 * 1000,
  URL_READER: 180 * 1000,
  NO_STORE: 0,
};

const l1Cache = new Map<string, L1CacheEntry>();
const inFlightRequests = new Map<string, Promise<HubEndpointResult<unknown>>>();

/**
 * Resolves the API Hub base URL cleanly across macOS WKWebView, Web Production, and local Expo dev.
 * Never returns a trailing slash.
 */
export function resolveApiBaseUrl(): string {
  const envUrl =
    typeof process !== 'undefined' && process.env
      ? (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim()
      : '';
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location && typeof window.location.origin === 'string') {
    const origin = window.location.origin.trim().replace(/\/+$/, '');
    if (
      origin.startsWith('https://') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1')
    ) {
      return origin;
    }
  }

  return '';
}

/**
 * Safely joins resolveApiBaseUrl() and a relative API path without double slashes.
 */
export function buildHubUrl(pathWithQuery: string): string {
  const normalizedPath = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  const base = resolveApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function pruneL1Cache(now: number = Date.now()): void {
  for (const [key, entry] of l1Cache.entries()) {
    if (now >= entry.expiresAt) {
      l1Cache.delete(key);
    }
  }
}

function readL1Cache<T>(key: string): T | null {
  const entry = l1Cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    l1Cache.delete(key);
    return null;
  }
  l1Cache.delete(key);
  l1Cache.set(key, entry);
  return entry.value as T;
}

function writeL1Cache(key: string, value: unknown, ttlMs: number): void {
  if (!key || ttlMs <= 0) return;
  const now = Date.now();
  pruneL1Cache(now);

  if (l1Cache.size >= L1_MAX_ENTRIES && !l1Cache.has(key)) {
    const oldestKey = l1Cache.keys().next().value;
    if (oldestKey !== undefined) {
      l1Cache.delete(oldestKey);
    }
  }

  l1Cache.set(key, {
    value,
    expiresAt: now + ttlMs,
  });
}

export function clearEdgeProxyCache(): void {
  l1Cache.clear();
  inFlightRequests.clear();
}

export function getEdgeProxyCacheStats(): { l1Size: number; inFlightCount: number } {
  pruneL1Cache();
  return {
    l1Size: l1Cache.size,
    inFlightCount: inFlightRequests.size,
  };
}

/**
 * Calls any Tomorrow Hub endpoint (/api/search, /api/proxy, /api/news, /api/market)
 * with L1 RAM caching and concurrent in-flight request deduplication.
 */
export async function fetchHubEndpoint<T>(
  pathWithQuery: string,
  options: FetchHubEndpointOptions = {}
): Promise<HubEndpointResult<T>> {
  const method = options.method || 'GET';
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 4500;
  const ttlMs = typeof options.ttlMs === 'number' && options.ttlMs >= 0 ? options.ttlMs : 0;
  const bypassCache = Boolean(options.bypassCache);
  const fullUrl = buildHubUrl(pathWithQuery);

  const dedupKey =
    options.cacheKey ||
    (method === 'POST'
      ? `POST:${fullUrl}:${JSON.stringify(options.body || {})}`
      : `GET:${fullUrl}`);

  if (!bypassCache && ttlMs > 0) {
    const cached = readL1Cache<T>(dedupKey);
    if (cached !== null) {
      return {
        ok: true,
        data: cached,
        fromL1Cache: true,
        status: 200,
      };
    }
  }

  if (!bypassCache) {
    const existingFlight = inFlightRequests.get(dedupKey);
    if (existingFlight) {
      return (await existingFlight) as HubEndpointResult<T>;
    }
  }

  const requestPromise = (async (): Promise<HubEndpointResult<unknown>> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const fetchFn = globalThis.fetch;
      if (typeof fetchFn !== 'function') {
        return {
          ok: false,
          fromL1Cache: false,
          error: 'Global fetch is unavailable',
        };
      }

      const headers: Record<string, string> = {
        'X-Tomorrow-Client': 'tomorrow-app-v4.12',
        ...(options.headers || {}),
      };
      if (method === 'POST' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetchFn(fullUrl, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(options.body || {}) : undefined,
        signal: controller ? controller.signal : undefined,
      });

      const status = response.status;
      if (!response.ok) {
        return {
          ok: false,
          fromL1Cache: false,
          status,
          error: `HTTP ${status}`,
        };
      }

      const parsed = (await response.json()) as T;
      if (!bypassCache && ttlMs > 0) {
        writeL1Cache(dedupKey, parsed, ttlMs);
      }

      return {
        ok: true,
        data: parsed,
        fromL1Cache: false,
        status,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Hub request failed';
      return {
        ok: false,
        fromL1Cache: false,
        error: message,
      };
    } finally {
      if (timer) clearTimeout(timer);
      inFlightRequests.delete(dedupKey);
    }
  })();

  if (!bypassCache) {
    inFlightRequests.set(dedupKey, requestPromise);
  }

  return (await requestPromise) as HubEndpointResult<T>;
}

/**
 * Fetches an allowlisted upstream target through /api/proxy with normalized envelope & L1 cache.
 */
export async function fetchViaEdgeProxy<T = unknown>(
  targetUrl: string,
  options: FetchViaEdgeProxyOptions = {}
): Promise<EdgeProxyResult<T>> {
  const profile: EdgeCacheProfile = options.profile || 'NEWS_FEED';
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  params.set('profile', profile);
  if (options.format) {
    params.set('format', options.format);
  }
  if (options.category) {
    params.set('category', options.category);
  }

  const effectiveTtl =
    typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_L1_TTL_BY_PROFILE[profile];

  const hubRes = await fetchHubEndpoint<ProxyEnvelope<T>>(
    `/api/proxy?${params.toString()}`,
    {
      method: 'GET',
      timeoutMs: options.timeoutMs ?? 5000,
      ttlMs: effectiveTtl,
      bypassCache: options.bypassCache,
    }
  );

  if (!hubRes.ok || !hubRes.data) {
    return {
      ok: false,
      fromL1Cache: false,
      status: hubRes.status,
      error: hubRes.error || 'Proxy hub request failed',
    };
  }

  const envelope = hubRes.data;
  if (!envelope.ok) {
    return {
      ok: false,
      fromL1Cache: false,
      status: hubRes.status,
      error: envelope.reason || envelope.error || 'Proxy target rejected',
    };
  }

  return {
    ok: true,
    data: envelope.data,
    meta: envelope.meta,
    contentType: envelope.contentType,
    fromL1Cache: hubRes.fromL1Cache,
    status: hubRes.status ?? 200,
  };
}

/**
 * Queries GET /api/proxy?action=health to diagnose the Edge Proxy Hub status.
 */
export async function checkProxyHubHealth(): Promise<ProxyHubHealthResponse> {
  const res = await fetchHubEndpoint<ProxyHubHealthResponse>('/api/proxy?action=health', {
    method: 'GET',
    timeoutMs: 3500,
    bypassCache: true,
  });

  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error || 'Health check failed',
    };
  }

  return res.data;
}
