// api/_lib/security.js — Tomorrow v4.12 Edge Proxy Hub
// Strict SSRF guard, domain allowlist, and lightweight in-memory rate limiter
import net from 'node:net';

export const ALLOWED_PROXY_DOMAINS = Object.freeze({
  weather: Object.freeze([
    'api.open-meteo.com',
    'geocoding-api.open-meteo.com',
  ]),
  finance: Object.freeze([
    'api.coingecko.com',
    'open.er-api.com',
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
    's.cafef.vn',
    'cafef.vn',
    'vietstock.vn',
  ]),
  news: Object.freeze([
    'news.google.com',
    'feeds.bbci.co.uk',
    'feeds.reuters.com',
    'www.reuters.com',
    'hn.algolia.com',
    'hacker-news.firebaseio.com',
    'vnexpress.net',
    'tuoitre.vn',
    'thanhnien.vn',
  ]),
  science: Object.freeze([
    'en.wikipedia.org',
    'vi.wikipedia.org',
    'export.arxiv.org',
    'api.semanticscholar.org',
    'eutils.ncbi.nlm.nih.gov',
    'pubchem.ncbi.nlm.nih.gov',
  ]),
  reader: Object.freeze([
    'r.jina.ai',
  ]),
});

const INTERNAL_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata.google.internal',
  '0.0.0.0',
  '::1',
  '::',
]);

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    if (net.isIPv4(mapped)) {
      return isPrivateIPv4(mapped);
    }
    // Node URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1
    const hexParts = mapped.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isPrivateIPv4(ipv4);
      }
    }
  }
  return false;
}

/**
 * Checks whether a hostname resolves structurally to a local, internal, or private IP host.
 */
export function isPrivateOrLocalHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const clean = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!clean) return true;

  if (INTERNAL_HOSTNAMES.has(clean)) return true;
  if (
    clean.endsWith('.local') ||
    clean.endsWith('.internal') ||
    clean.endsWith('.localhost')
  ) {
    return true;
  }

  const ipType = net.isIP(clean);
  if (ipType === 4) return isPrivateIPv4(clean);
  if (ipType === 6) return isPrivateIPv6(clean);

  return false;
}

/**
 * Validates that a target URL is safe to fetch and matches the Tomorrow Phase 2 domain allowlist.
 */
export function validateProxyTarget(rawUrl, category) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, reason: 'Missing target url parameter', status: 400 };
  }

  let urlObj;
  try {
    urlObj = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: 'Malformed target URL', status: 400 };
  }

  if (urlObj.protocol !== 'https:') {
    return {
      ok: false,
      reason: `Protocol "${urlObj.protocol}" is blocked; only https: is permitted`,
      status: 403,
    };
  }

  if (urlObj.username || urlObj.password) {
    return {
      ok: false,
      reason: 'Embedded credentials in URL are forbidden',
      status: 403,
    };
  }

  if (urlObj.port && urlObj.port !== '443') {
    return {
      ok: false,
      reason: `Custom port "${urlObj.port}" is not permitted`,
      status: 403,
    };
  }

  const hostname = urlObj.hostname.toLowerCase();
  if (isPrivateOrLocalHost(hostname) || net.isIP(hostname.replace(/^\[|\]$/g, '')) !== 0) {
    return {
      ok: false,
      reason: `Internal or raw IP target "${hostname}" is blocked (SSRF guard)`,
      status: 403,
    };
  }

  if (category) {
    const normalizedCat = String(category).trim().toLowerCase();
    const domainList = ALLOWED_PROXY_DOMAINS[normalizedCat];
    if (!domainList) {
      return { ok: false, reason: `Unknown proxy category "${category}"`, status: 400 };
    }
    if (!domainList.includes(hostname)) {
      return {
        ok: false,
        reason: `Domain "${hostname}" is not allowed under category "${normalizedCat}"`,
        status: 403,
      };
    }
    return {
      ok: true,
      url: urlObj.toString(),
      hostname,
      matchedCategory: normalizedCat,
    };
  }

  for (const [cat, domains] of Object.entries(ALLOWED_PROXY_DOMAINS)) {
    if (domains.includes(hostname)) {
      return {
        ok: true,
        url: urlObj.toString(),
        hostname,
        matchedCategory: cat,
      };
    }
  }

  return {
    ok: false,
    reason: `Domain "${hostname}" is not in ALLOWED_PROXY_DOMAINS`,
    status: 403,
  };
}

const rateLimitStore = new Map();
const MAX_RATE_LIMIT_KEYS = 500;

/**
 * Lightweight per-IP sliding-window rate limiter to protect against parallel split-pane bursts.
 */
export function checkSoftRateLimit(req, options = {}) {
  const windowMs = typeof options.windowMs === 'number' && options.windowMs > 0 ? options.windowMs : 60000;
  const max = typeof options.max === 'number' && options.max > 0 ? options.max : 45;

  const forwarded = req?.headers?.['x-forwarded-for'];
  const clientIp =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req?.headers?.['x-real-ip'] ||
    req?.socket?.remoteAddress ||
    'local-client';

  const now = Date.now();
  const existing = rateLimitStore.get(clientIp);

  if (!existing || now >= existing.resetAt) {
    if (rateLimitStore.size >= MAX_RATE_LIMIT_KEYS) {
      for (const [key, entry] of rateLimitStore.entries()) {
        if (now >= entry.resetAt) {
          rateLimitStore.delete(key);
        }
      }
      if (rateLimitStore.size >= MAX_RATE_LIMIT_KEYS) {
        const oldestKey = rateLimitStore.keys().next().value;
        if (oldestKey !== undefined) rateLimitStore.delete(oldestKey);
      }
    }
    const nextEntry = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(clientIp, nextEntry);
    return { allowed: true, remaining: max - 1, resetAt: nextEntry.resetAt, limit: max };
  }

  existing.count += 1;
  const allowed = existing.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - existing.count),
    resetAt: existing.resetAt,
    limit: max,
  };
}
