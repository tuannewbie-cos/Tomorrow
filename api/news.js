// api/news.js — Tomorrow v4.13 Multi-Source World, Tech, Finance & Vietnam News Radar
// Vercel Serverless Function (Node.js runtime) powered by shared api/_lib/*

import { applyCorsHeaders, handlePreflight } from './_lib/cors.js';
import {
  applyCacheHeaders,
  getProfileTtlMs,
  getWarmCache,
  setWarmCache,
} from './_lib/cache.js';
import { safeUpstreamFetch } from './_lib/fetcher.js';
import {
  cleanRssText,
  dedupeAndRankNews,
  extractDomain,
  filterNewsByQuery,
  normalizeMatchText,
  normalizeNewsUrl,
  parseRssXml,
} from './_lib/rssParser.js';

const VALID_CATEGORIES = new Set(['all', 'world', 'vietnam', 'tech', 'finance']);

const FEED_SOURCES = {
  bbc_world: {
    id: 'bbc_world',
    source: 'BBC World',
    category: 'world',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  },
  reuters_world: {
    id: 'reuters_world',
    source: 'Reuters',
    category: 'world',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  vnexpress_world: {
    id: 'vnexpress_world',
    source: 'VnExpress',
    category: 'world',
    type: 'rss',
    url: 'https://vnexpress.net/rss/the-gioi.rss',
  },
  hackernews: {
    id: 'hackernews',
    source: 'Hacker News',
    category: 'tech',
    type: 'hn_json',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10',
  },
  vnexpress_tech: {
    id: 'vnexpress_tech',
    source: 'VnExpress Số hóa',
    category: 'tech',
    type: 'rss',
    url: 'https://vnexpress.net/rss/so-hoa.rss',
  },
  bbc_tech: {
    id: 'bbc_tech',
    source: 'BBC Tech',
    category: 'tech',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  },
  cafef_stocks: {
    id: 'cafef_stocks',
    source: 'CafeF',
    category: 'finance',
    type: 'rss',
    url: 'https://cafef.vn/thi-truong-chung-khoan.rss',
    fallbackUrl: 'https://cafef.vn/trang-chu.rss',
  },
  vnexpress_business: {
    id: 'vnexpress_business',
    source: 'VnExpress Kinh doanh',
    category: 'finance',
    type: 'rss',
    url: 'https://vnexpress.net/rss/kinh-doanh.rss',
  },
  bbc_business: {
    id: 'bbc_business',
    source: 'BBC Business',
    category: 'finance',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  },
  vnexpress_latest: {
    id: 'vnexpress_latest',
    source: 'VnExpress',
    category: 'vietnam',
    type: 'rss',
    url: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
  },
  cafef_home: {
    id: 'cafef_home',
    source: 'CafeF',
    category: 'vietnam',
    type: 'rss',
    url: 'https://cafef.vn/trang-chu.rss',
  },
  tuoitre_latest: {
    id: 'tuoitre_latest',
    source: 'Tuổi Trẻ',
    category: 'vietnam',
    type: 'rss',
    url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss',
  },
};

function getFeedsForCategory(category) {
  switch (category) {
    case 'world':
      return [FEED_SOURCES.bbc_world, FEED_SOURCES.reuters_world, FEED_SOURCES.vnexpress_world];
    case 'tech':
      return [FEED_SOURCES.hackernews, FEED_SOURCES.vnexpress_tech, FEED_SOURCES.bbc_tech];
    case 'finance':
      return [FEED_SOURCES.cafef_stocks, FEED_SOURCES.vnexpress_business, FEED_SOURCES.bbc_business];
    case 'vietnam':
      return [FEED_SOURCES.vnexpress_latest, FEED_SOURCES.cafef_home, FEED_SOURCES.tuoitre_latest];
    case 'all':
    default:
      return [
        FEED_SOURCES.bbc_world,
        FEED_SOURCES.reuters_world,
        FEED_SOURCES.hackernews,
        FEED_SOURCES.vnexpress_latest,
        FEED_SOURCES.cafef_home,
      ];
  }
}

function parseHackerNewsHits(jsonData, nowMs) {
  const hits = Array.isArray(jsonData?.hits) ? jsonData.hits : [];
  const items = [];
  for (const hit of hits) {
    const title = cleanRssText(hit?.title || '');
    const rawUrl = hit?.url || (hit?.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : '');
    const url = normalizeNewsUrl(rawUrl);
    if (!title || !url) continue;

    const ts = hit?.created_at ? Date.parse(hit.created_at) : nowMs;
    const validTs = Number.isFinite(ts) ? Math.min(ts, nowMs) : nowMs;
    const points = Number.isFinite(hit?.points) ? hit.points : 0;
    const comments = Number.isFinite(hit?.num_comments) ? hit.num_comments : 0;

    items.push({
      id: `hn-${hit.objectID || items.length}`,
      title,
      summary: `${points} points • ${comments} comments on Hacker News`,
      url,
      domain: extractDomain(url) || 'news.ycombinator.com',
      source: 'Hacker News',
      category: 'tech',
      publishedAt: new Date(validTs).toISOString(),
      ageMinutes: Math.max(0, Math.round((nowMs - validTs) / 60000)),
    });
  }
  return items;
}

async function fetchSingleFeed(feed, nowMs) {
  const startedAt = Date.now();
  try {
    const acceptHeader =
      feed.type === 'hn_json'
        ? 'application/json'
        : 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8';

    let res = await safeUpstreamFetch(feed.url, {
      timeoutMs: 3800,
      maxBytes: 1200000,
      retries: 0,
      headers: { Accept: acceptHeader },
    });

    if ((!res.ok || !res.text) && feed.fallbackUrl) {
      res = await safeUpstreamFetch(feed.fallbackUrl, {
        timeoutMs: 3800,
        maxBytes: 1200000,
        retries: 0,
        headers: { Accept: acceptHeader },
      });
    }

    if (!res.ok || !res.text) {
      return {
        status: { id: feed.id, ok: false, count: 0, ms: Date.now() - startedAt },
        items: [],
      };
    }

    let items = [];
    if (feed.type === 'hn_json') {
      items = parseHackerNewsHits(res.json(), nowMs);
    } else {
      items = parseRssXml(res.text, {
        source: feed.source,
        category: feed.category,
        nowMs,
      });
      // Retry fallbackUrl if primary RSS returned 0 parsed items
      if (items.length === 0 && feed.fallbackUrl) {
        const fbRes = await safeUpstreamFetch(feed.fallbackUrl, {
          timeoutMs: 3800,
          maxBytes: 1200000,
          retries: 0,
          headers: { Accept: acceptHeader },
        });
        if (fbRes.ok && fbRes.text) {
          items = parseRssXml(fbRes.text, {
            source: feed.source,
            category: feed.category,
            nowMs,
          });
        }
      }
    }

    return {
      status: {
        id: feed.id,
        ok: items.length > 0,
        count: items.length,
        ms: Date.now() - startedAt,
      },
      items,
    };
  } catch {
    return {
      status: { id: feed.id, ok: false, count: 0, ms: Date.now() - startedAt },
      items: [],
    };
  }
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, 'GET, OPTIONS')) {
    return;
  }

  applyCorsHeaders(req, res, 'GET, OPTIONS');

  if (req.method !== 'GET') {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const rawCategory = String(req.query?.category || 'all').trim().toLowerCase();
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'all';
  const query = String(req.query?.q || '').trim();
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(24, Math.floor(rawLimit)))
    : 12;

  const cacheKey = `news:v4.13:${category}:${normalizeMatchText(query).trim()}:${limit}`;
  const ttlMs = getProfileTtlMs('NEWS_RADAR');

  if (ttlMs > 0) {
    const cached = getWarmCache(cacheKey);
    if (cached) {
      applyCacheHeaders(res, 'NEWS_RADAR', 'HIT');
      const sourceHeader = Array.isArray(cached.sourcesStatus)
        ? cached.sourcesStatus.map((s) => `${s.id}:${s.ok ? s.count : 'err'}`).join(',')
        : '';
      if (sourceHeader) res.setHeader('X-Tomorrow-News-Sources', sourceHeader);
      return res.status(200).json(cached);
    }
  }

  const nowMs = Date.now();
  const feeds = getFeedsForCategory(category);
  const settled = await Promise.allSettled(feeds.map((feed) => fetchSingleFeed(feed, nowMs)));

  const sourcesStatus = [];
  let rawItems = [];

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value) {
      sourcesStatus.push(outcome.value.status);
      if (Array.isArray(outcome.value.items)) {
        rawItems.push(...outcome.value.items);
      }
    }
  }

  if (query) {
    rawItems = filterNewsByQuery(rawItems, query);
  }

  const rankedItems = dedupeAndRankNews(rawItems, limit, { category });
  const payload = {
    ok: rankedItems.length > 0,
    version: 'v4.13',
    category,
    query,
    updatedAt: new Date(nowMs).toISOString(),
    total: rankedItems.length,
    sourcesStatus,
    items: rankedItems,
  };

  const sourceHeader = sourcesStatus.map((s) => `${s.id}:${s.ok ? s.count : 'err'}`).join(',');
  if (sourceHeader) {
    res.setHeader('X-Tomorrow-News-Sources', sourceHeader);
  }

  if (rankedItems.length > 0 && ttlMs > 0) {
    setWarmCache(cacheKey, payload, ttlMs);
    applyCacheHeaders(res, 'NEWS_RADAR', 'MISS');
  } else {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
  }

  return res.status(200).json(payload);
}
