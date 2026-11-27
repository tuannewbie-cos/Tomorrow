// api/_lib/cors.js — Tomorrow v4.12 Edge Proxy Hub
// Unified CORS whitelist & preflight helper (shared inside _lib so Vercel does not count it as a function)

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i,
  /^http:\/\/localhost(?::\d{1,5})?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d{1,5})?$/i,
  /^capacitor:\/\/localhost$/i,
];

/**
 * Checks whether an Origin header is permitted by the Tomorrow Hub whitelist.
 * Requests without an Origin header (native/WKWebView/server-to-server) are allowed without wildcarding.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (typeof origin !== 'string') return false;
  const normalized = origin.trim();
  if (!normalized || normalized.toLowerCase() === 'null') return false;

  const extraOrigins = (process.env.TOMORROW_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (extraOrigins.includes(normalized)) {
    return true;
  }

  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Applies unified CORS and diagnostic headers without falling back to wildcard `*`.
 */
export function applyCorsHeaders(req, res, methods = 'GET, POST, OPTIONS') {
  const rawOrigin = req?.headers?.origin || req?.headers?.Origin || '';
  const origin = typeof rawOrigin === 'string' ? rawOrigin.trim() : '';

  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Tomorrow-Proxy', 'hub-v1');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tomorrow-Client, Authorization');

  if (!origin) {
    return { allowed: true, origin: null };
  }

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return { allowed: true, origin };
  }

  // Reject unknown origins cleanly by omitting Access-Control-Allow-Origin (never use `*`)
  return { allowed: false, origin };
}

/**
 * Handles CORS preflight OPTIONS requests with HTTP 204.
 * Returns true if the request was an OPTIONS preflight and has been ended.
 */
export function handlePreflight(req, res, methods = 'GET, POST, OPTIONS') {
  applyCorsHeaders(req, res, methods);
  if (req?.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
