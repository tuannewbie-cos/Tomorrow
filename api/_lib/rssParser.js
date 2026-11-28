// api/_lib/rssParser.js — Tomorrow v4.13 Zero-Dependency RSS 2.0 / Atom XML Parser & Ranker

const TRACKING_PARAM_EXACT = new Set([
  'fbclid',
  'gclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'igshid',
]);

/**
 * Removes Vietnamese diacritics and lowercases for matching & deduplication.
 */
export function normalizeMatchText(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/**
 * Decodes basic named and numeric HTML/XML entities without external dependencies.
 */
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    });
}

/**
 * Unwraps CDATA blocks, strips HTML tags, decodes entities, and optionally truncates cleanly.
 */
export function cleanRssText(raw, maxChars = 0) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // Decode twice if RSS wrapped escaped HTML inside description (e.g. &lt;p&gt;...&lt;/p&gt;)
  text = decodeHtmlEntities(text);
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, ' ').trim();

  if (maxChars > 0 && text.length > maxChars) {
    const sliced = text.slice(0, Math.max(1, maxChars - 3));
    const lastSpace = sliced.lastIndexOf(' ');
    const base = lastSpace > Math.floor(maxChars * 0.5) ? sliced.slice(0, lastSpace) : sliced;
    return `${base.trim()}...`;
  }
  return text;
}

/**
 * Strips tracking query parameters (utm_*, fbclid, gclid, etc.) from article URLs.
 */
export function normalizeNewsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const cleaned = cleanRssText(rawUrl);
  if (!cleaned) return '';

  try {
    const parsed = new URL(cleaned);
    const keysToDelete = [];
    for (const key of parsed.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAM_EXACT.has(lower)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return cleaned;
  }
}

export function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizePublishedAt(rawDate, nowMs) {
  const cleaned = cleanRssText(rawDate);
  const parsedMs = cleaned ? Date.parse(cleaned) : NaN;
  const ts = Number.isFinite(parsedMs) ? Math.min(parsedMs, nowMs) : nowMs;
  return {
    publishedAt: new Date(ts).toISOString(),
    ageMinutes: Math.max(0, Math.round((nowMs - ts) / 60000)),
  };
}

function extractTagContent(block, tagName) {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(regex);
  return match ? match[1] : '';
}

function extractAtomLink(block) {
  const altMatch =
    block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i) ||
    block.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i);
  if (altMatch && altMatch[1]) return altMatch[1];

  const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch && hrefMatch[1]) return hrefMatch[1];

  return extractTagContent(block, 'link');
}

function buildItemId(url, title) {
  const input = `${url}|${title}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `news-${(hash >>> 0).toString(36)}`;
}

/**
 * Parses RSS 2.0 (<item>) or Atom (<entry>) XML into normalized news items.
 */
export function parseRssXml(xmlText, meta = {}) {
  if (!xmlText || typeof xmlText !== 'string') return [];

  const nowMs = typeof meta.nowMs === 'number' ? meta.nowMs : Date.now();
  const defaultCategory = meta.category || 'all';
  const blocks = [];

  for (const m of xmlText.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    blocks.push({ isAtom: false, body: m[1] });
  }
  if (blocks.length === 0) {
    for (const m of xmlText.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
      blocks.push({ isAtom: true, body: m[1] });
    }
  }

  const items = [];
  for (const { isAtom, body } of blocks) {
    const rawTitle = extractTagContent(body, 'title');
    let title = cleanRssText(rawTitle);

    const rawLink = isAtom
      ? extractAtomLink(body)
      : extractTagContent(body, 'link') || extractTagContent(body, 'guid');
    const url = normalizeNewsUrl(rawLink);
    if (!title || !url) continue;

    const rawDesc =
      extractTagContent(body, 'description') ||
      extractTagContent(body, 'summary') ||
      extractTagContent(body, 'content:encoded') ||
      extractTagContent(body, 'content');
    let summary = cleanRssText(rawDesc, 180);

    const rawSource = extractTagContent(body, 'source');
    const sourceFromTag = cleanRssText(rawSource);

    // Google News titles often end with " - Reuters" -> trim redundant suffix if source matches
    if (sourceFromTag && title.endsWith(` - ${sourceFromTag}`)) {
      title = title.slice(0, -(` - ${sourceFromTag}`.length)).trim();
    } else if (meta.source && title.endsWith(` - ${meta.source}`)) {
      title = title.slice(0, -(` - ${meta.source}`.length)).trim();
    }

    if (!summary || summary === title) {
      summary = title.length > 180 ? `${title.slice(0, 177)}...` : title;
    }

    const rawDate =
      extractTagContent(body, 'pubDate') ||
      extractTagContent(body, 'published') ||
      extractTagContent(body, 'updated') ||
      extractTagContent(body, 'dc:date');
    const { publishedAt, ageMinutes } = normalizePublishedAt(rawDate, nowMs);

    const domain = extractDomain(url);
    const source = meta.source || sourceFromTag || domain || 'News';

    items.push({
      id: buildItemId(url, title),
      title,
      summary,
      url,
      domain,
      source,
      category: defaultCategory,
      publishedAt,
      ageMinutes,
    });
  }

  return items;
}

function tokenizeTitle(title) {
  const norm = normalizeMatchText(title)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return new Set();
  const tokens = norm.split(' ').filter((w) => w.length >= 2);
  return new Set(tokens.length > 0 ? tokens : norm.split(' ').filter(Boolean));
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Deduplicates by normalized URL and title Jaccard similarity (>= 0.62),
 * sorts by recency, and enforces multi-source balance (<= 40% per source when category='all').
 */
export function dedupeAndRankNews(items, limit = 12, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(24, Number(limit) || 12));
  const category = options.category || 'all';

  // Sort newest first; prefer non-Google-News direct links on timestamp tie
  const sorted = [...items]
    .filter((item) => item && item.title && item.url)
    .map((item) => {
      const url = normalizeNewsUrl(item.url);
      const domain = item.domain || extractDomain(url);
      return {
        ...item,
        url,
        domain,
        source: item.source || domain || 'News',
      };
    })
    .sort((a, b) => {
      const tDiff = (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0);
      if (tDiff !== 0) return tDiff;
      const aGoogle = a.domain === 'news.google.com' ? 1 : 0;
      const bGoogle = b.domain === 'news.google.com' ? 1 : 0;
      return aGoogle - bGoogle;
    });

  const seenUrls = new Set();
  const accepted = [];
  const acceptedTokens = [];

  for (const item of sorted) {
    if (seenUrls.has(item.url)) continue;

    const tokens = tokenizeTitle(item.title);
    const isDuplicateTitle = acceptedTokens.some(
      (existing) => jaccardSimilarity(existing, tokens) >= 0.62
    );
    if (isDuplicateTitle) continue;

    seenUrls.add(item.url);
    accepted.push(item);
    acceptedTokens.push(tokens);
  }

  if (category !== 'all' || accepted.length <= 2) {
    return accepted.slice(0, safeLimit);
  }

  // Balance multi-source representation so no single source exceeds 40% of results
  const maxPerSource = Math.max(1, Math.floor(safeLimit * 0.4));
  const sourceCounts = new Map();
  const balanced = [];
  const overflow = [];

  for (const item of accepted) {
    const srcKey = String(item.source || item.domain || 'other').toLowerCase();
    const count = sourceCounts.get(srcKey) || 0;
    if (count < maxPerSource) {
      balanced.push(item);
      sourceCounts.set(srcKey, count + 1);
      if (balanced.length >= safeLimit) break;
    } else {
      overflow.push(item);
    }
  }

  // Only fill remaining slots from overflow if distinct sources couldn't fill safeLimit
  // and overflow won't violate if there are very few sources
  if (balanced.length < safeLimit && overflow.length > 0) {
    const distinctSources = new Set(accepted.map((it) => String(it.source || it.domain).toLowerCase())).size;
    if (distinctSources <= 2) {
      return balanced;
    }
    for (const item of overflow) {
      if (balanced.length >= safeLimit) break;
      balanced.push(item);
    }
  }

  return balanced.slice(0, safeLimit);
}

/**
 * Accent-insensitive keyword filter for news items.
 */
export function filterNewsByQuery(items, query) {
  if (!query || typeof query !== 'string' || !query.trim()) return items;
  const normQuery = normalizeMatchText(query).trim();
  const queryTokens = normQuery.split(/\s+/).filter((t) => t.length >= 2);

  return items.filter((item) => {
    const haystack = normalizeMatchText(
      `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.domain || ''}`
    );
    if (haystack.includes(normQuery)) return true;
    if (queryTokens.length > 1) {
      return queryTokens.every((tok) => haystack.includes(tok));
    }
    return false;
  });
}
