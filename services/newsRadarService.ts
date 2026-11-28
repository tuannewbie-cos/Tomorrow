// services/newsRadarService.ts — Tomorrow v4.13 Multi-Source News Radar Client
// Uses L1 RAM cache + in-flight deduplication from edgeProxyService.ts

import { WebSource } from '../types/chat';
import { fetchHubEndpoint } from './edgeProxyService';

export type NewsCategory = 'all' | 'world' | 'vietnam' | 'tech' | 'finance';

export interface NewsRadarItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  domain: string;
  source: string;
  category: string;
  publishedAt: string;
  ageMinutes: number;
}

export interface NewsSourceStatus {
  id: string;
  ok: boolean;
  count: number;
  ms: number;
}

export interface NewsRadarResponse {
  ok: boolean;
  version?: string;
  category: NewsCategory;
  query: string;
  updatedAt: string;
  total: number;
  sourcesStatus?: NewsSourceStatus[];
  items: NewsRadarItem[];
  fromL1Cache?: boolean;
  error?: string;
}

export interface NewsRadarIntent {
  isNewsIntent: boolean;
  category: NewsCategory;
  keywordFilter?: string;
}

export interface FetchNewsRadarParams {
  category?: NewsCategory;
  q?: string;
  limit?: number;
  bypassCache?: boolean;
}

export interface FormattedNewsContext {
  formattedContext: string;
  sources: WebSource[];
}

const NEWS_L1_TTL_MS = 300_000; // 5 minutes

function normalizeVi(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

const TECH_REGEX =
  /\b(cong nghe|ai|hackernews|hacker news|hn|startup|chip|nvidia|apple|google|openai|lap trinh|tech)\b/i;
const FINANCE_REGEX =
  /\b(kinh te|tai chinh|chung khoan|thi truong|cafef|lai suat|fed|lam phat|vang|bat dong san|vn-index|vnindex)\b/i;
const VIETNAM_REGEX =
  /\b(viet nam|trong nuoc|ha noi|tp\.?\s*hcm|tphcm|vnexpress|tuoi tre|xa hoi viet)\b/i;
const WORLD_REGEX =
  /\b(the gioi|quoc te|reuters|bbc|dia chinh tri|my|trung quoc|chau au|trung dong|chien su)\b/i;
const GENERAL_NEWS_REGEX =
  /\b(tin tuc|diem tin|ban tin|tin nong|tin moi|thoi su|radar|co bien gi|tin gi|noi bat)\b/i;

const GENERIC_BOILERPLATE_WORDS = new Set([
  'tin',
  'tuc',
  'moi',
  'nhat',
  'diem',
  'ban',
  'nong',
  'nhanh',
  'thoi',
  'su',
  'tinh',
  'hinh',
  'the',
  'gioi',
  'quoc',
  'te',
  'trong',
  'nuoc',
  'viet',
  'nam',
  'cong',
  'nghe',
  'kinh',
  'tai',
  'chinh',
  'chung',
  'khoan',
  'thi',
  'truong',
  'hom',
  'nay',
  'sang',
  'trua',
  'chieu',
  'toi',
  'dem',
  'co',
  'gi',
  'bien',
  'noi',
  'bat',
  'khong',
  'ko',
  've',
  'cua',
  'o',
  'tai',
  'cho',
  'minh',
  'xem',
  'quet',
  'radar',
  'tong',
  'hop',
  'cap',
  'vnexpress',
  'cafef',
  'tuoi',
  'tre',
  'bbc',
  'reuters',
  'hackernews',
  'hacker',
  'news',
  'hn',
  'va',
  'voi',
  'di',
  'nhe',
  'nha',
]);

function extractKeywordFilter(rawQuery: string): string | undefined {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) return undefined;

  // Prefer explicit "về <topic>" capture (e.g. "tin mới về AI hôm nay" -> "AI")
  const aboutMatch = trimmed.match(/(?:về|ve)\s+(.+)$/i);
  if (aboutMatch && aboutMatch[1]) {
    const candidate = aboutMatch[1]
      .replace(/\b(hôm nay|hom nay|sáng nay|sang nay|chiều nay|chieu nay|tối nay|toi nay|mới nhất|moi nhat|nổi bật|noi bat|gần đây|gan day|nhé|nha|đi|di)\b/gi, ' ')
      .replace(/[?!.,]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate.length >= 2 && candidate.length <= 45) {
      return candidate;
    }
  }

  // Fallback token filter: keep non-boilerplate entities/keywords if a narrow topic is present
  const rawTokens = trimmed.replace(/[?!.,:;()[\]"']/g, ' ').split(/\s+/).filter(Boolean);
  const meaningful = rawTokens.filter((tok) => !GENERIC_BOILERPLATE_WORDS.has(normalizeVi(tok)));

  // Only emit keywordFilter when the remaining terms look like a focused topic (1-3 tokens)
  if (meaningful.length >= 1 && meaningful.length <= 3) {
    const joined = meaningful.join(' ').trim();
    if (joined.length >= 2 && joined.length <= 40) {
      return joined;
    }
  }

  return undefined;
}

/**
 * Classifies user news intent into one of 5 categories in < 1ms.
 */
export function detectNewsRadarIntent(query: string): NewsRadarIntent {
  const norm = normalizeVi(query);
  if (!norm) {
    return { isNewsIntent: false, category: 'all' };
  }

  const isTech = TECH_REGEX.test(norm);
  const isFinance = FINANCE_REGEX.test(norm);
  const isVietnam = VIETNAM_REGEX.test(norm);
  const isWorld = WORLD_REGEX.test(norm);
  const isGeneralNews =
    GENERAL_NEWS_REGEX.test(norm) ||
    (/\b(hom nay|sang nay|chieu nay|toi nay)\b/i.test(norm) && /\b(tin|bien|gi moi|noi bat)\b/i.test(norm));

  const isNewsIntent = isTech || isFinance || isVietnam || isWorld || isGeneralNews;
  if (!isNewsIntent) {
    return { isNewsIntent: false, category: 'all' };
  }

  let category: NewsCategory = 'all';
  if (isTech) {
    category = 'tech';
  } else if (isFinance) {
    category = 'finance';
  } else if (isVietnam && isWorld) {
    category = 'all';
  } else if (isVietnam) {
    category = 'vietnam';
  } else if (isWorld) {
    category = 'world';
  } else {
    category = 'all';
  }

  const keywordFilter = extractKeywordFilter(query);
  return {
    isNewsIntent: true,
    category,
    keywordFilter,
  };
}

/**
 * Fetches live aggregated news from GET /api/news through edgeProxyService (L1 5-min cache + dedup).
 * Never throws; safely returns { ok: false, items: [] } when offline or in local dev without Vercel API.
 */
export async function fetchNewsRadar(params: FetchNewsRadarParams = {}): Promise<NewsRadarResponse> {
  const category: NewsCategory = params.category || 'all';
  const q = (params.q || '').trim();
  const limit = Math.max(1, Math.min(24, Math.floor(params.limit || 12)));

  const searchParams = new URLSearchParams();
  searchParams.set('category', category);
  searchParams.set('limit', String(limit));
  if (q) {
    searchParams.set('q', q);
  }

  const res = await fetchHubEndpoint<NewsRadarResponse>(`/api/news?${searchParams.toString()}`, {
    method: 'GET',
    timeoutMs: 5000,
    ttlMs: NEWS_L1_TTL_MS,
    bypassCache: Boolean(params.bypassCache),
  });

  if (!res.ok || !res.data || !Array.isArray(res.data.items)) {
    return {
      ok: false,
      category,
      query: q,
      updatedAt: new Date().toISOString(),
      total: 0,
      items: [],
      fromL1Cache: false,
      error: res.error || 'News radar unavailable',
    };
  }

  return {
    ...res.data,
    fromL1Cache: res.fromL1Cache,
  };
}

function formatAgeLabel(ageMinutes: number): string {
  if (!Number.isFinite(ageMinutes) || ageMinutes <= 1) return 'vừa xong';
  if (ageMinutes < 60) return `${Math.round(ageMinutes)} phút trước`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

function stripUrlsFromText(text: string): string {
  return (text || '')
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats top 6-8 news items into a compact <= 1400-char context block without raw URLs,
 * paired with an aligned sources[] array (1..N) for UI pills & follow-up citation resolution.
 */
export function formatNewsContextForAI(
  items: NewsRadarItem[],
  maxChars: number = 1400,
  updatedAt?: string
): FormattedNewsContext {
  if (!Array.isArray(items) || items.length === 0) {
    return { formattedContext: '', sources: [] };
  }

  const safeBudget = Math.max(200, maxChars);
  const stamp = updatedAt ? updatedAt.slice(0, 16).replace('T', ' ') : new Date().toISOString().slice(0, 16).replace('T', ' ');
  const header = `[NEWS_RADAR_LIVE | Updated: ${stamp}]`;
  let buffer = header;
  const sources: WebSource[] = [];

  for (const item of items.slice(0, 8)) {
    const idx = sources.length + 1;
    const cleanTitle = stripUrlsFromText(item.title || '');
    if (!cleanTitle) continue;

    let cleanSummary = stripUrlsFromText(item.summary || '');
    if (cleanSummary.length > 110) {
      cleanSummary = `${cleanSummary.slice(0, 107).trim()}...`;
    }
    const ageLabel = formatAgeLabel(item.ageMinutes);
    const sourceLabel = stripUrlsFromText(item.source || item.domain || 'News');

    const hasDistinctSummary =
      cleanSummary.length > 0 &&
      cleanSummary.toLowerCase() !== cleanTitle.toLowerCase() &&
      !cleanTitle.toLowerCase().includes(cleanSummary.toLowerCase().slice(0, 24));

    const line = hasDistinctSummary
      ? `\n${idx}. [${sourceLabel} • ${ageLabel}] ${cleanTitle} — ${cleanSummary}`
      : `\n${idx}. [${sourceLabel} • ${ageLabel}] ${cleanTitle}`;

    if (buffer.length + line.length > safeBudget) {
      if (sources.length === 0) {
        const remaining = Math.max(20, safeBudget - buffer.length);
        buffer += line.slice(0, remaining);
        sources.push({
          title: item.title,
          url: item.url,
          domain: item.domain,
          source: item.source,
          snippet: item.summary,
          publishedAt: item.publishedAt,
        });
      }
      break;
    }

    buffer += line;
    sources.push({
      title: item.title,
      url: item.url,
      domain: item.domain,
      source: item.source,
      snippet: item.summary,
      publishedAt: item.publishedAt,
    });
  }

  return {
    formattedContext: buffer.slice(0, safeBudget),
    sources,
  };
}
