// api/search.js — Tomorrow v4.12 Autonomous Web Search & URL Reader Engine
// Vercel Serverless Function (Node.js runtime) powered by shared api/_lib/*
import { applyCorsHeaders, handlePreflight } from './_lib/cors.js';
import {
  applyCacheHeaders,
  getProfileTtlMs,
  getWarmCache,
  setWarmCache,
} from './_lib/cache.js';
import { safeUpstreamFetch } from './_lib/fetcher.js';
import { isPrivateOrLocalHost } from './_lib/security.js';

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSearchCacheProfile(query, targetUrl, topic) {
  if (targetUrl) return 'URL_READER';
  const lowerQuery = (query || '').toLowerCase();
  if (
    topic === 'WEATHER' ||
    /\b(thời tiết|thoi tiet|dự báo thời tiết|nhiệt độ|nhiet do|độ ẩm|weather|mưa|mưa rào|nắng)\b/i.test(
      lowerQuery
    )
  ) {
    return 'WEATHER';
  }
  if (
    topic === 'MARKET_FINANCE' ||
    /\b(bitcoin|btc|crypto|ethereum|eth|solana|sol|tỷ giá|ty gia|usd|ngoại tệ|eur|jpy|giá vàng|sjc)\b/i.test(
      lowerQuery
    )
  ) {
    return 'MARKET_LIVE';
  }
  return 'SEARCH_RESULT';
}

function isSafeExternalReaderUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateOrLocalHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, 'GET, POST, OPTIONS')) {
    return;
  }

  applyCorsHeaders(req, res, 'GET, POST, OPTIONS');

  if (req.method !== 'GET' && req.method !== 'POST') {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
  }

  let body = {};
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      body = {};
    }
  } else {
    body = req.query || {};
  }

  const query = String(body.query || req.query?.query || '').trim();
  const targetUrl = String(body.url || req.query?.url || '').trim();
  const topic = String(body.topic || req.query?.topic || '').trim();

  if (!query && !targetUrl) {
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(200).json({
      success: true,
      query: '',
      targetUrl: '',
      resultsCount: 0,
      results: [],
      pageContent: undefined,
    });
  }

  const cacheProfile = resolveSearchCacheProfile(query, targetUrl, topic);
  const ttlMs = getProfileTtlMs(cacheProfile);
  const cacheKey = `search:${cacheProfile}:${topic}:${query.toLowerCase()}:${targetUrl}`;

  if (ttlMs > 0) {
    const cachedPayload = getWarmCache(cacheKey);
    if (cachedPayload) {
      applyCacheHeaders(res, cacheProfile, 'HIT');
      return res.status(200).json(cachedPayload);
    }
  }

  try {
    // A. NẾU CÓ URL -> TRÍCH XUẤT NỘI DUNG TRANG WEB (Deep URL Reader)
    let pageContent = '';
    if (targetUrl && isSafeExternalReaderUrl(targetUrl)) {
      try {
        // Thử dùng Reader API r.jina.ai trước
        const jinaRes = await safeUpstreamFetch(
          `https://r.jina.ai/${encodeURIComponent(targetUrl)}`,
          {
            timeoutMs: 6000,
            maxBytes: 1500000,
            retries: 1,
            headers: {
              Accept: 'text/plain',
              'User-Agent': 'Mozilla/5.0 (compatible; TomorrowBot/4.12; +https://tomorrow.app)',
            },
          }
        );

        if (jinaRes.ok && jinaRes.text && jinaRes.text.length > 50) {
          pageContent = jinaRes.text.slice(0, 6000);
        }

        // Fallback nếu r.jina.ai lỗi: fetch trực tiếp và bóc tách HTML
        if (!pageContent) {
          const directRes = await safeUpstreamFetch(targetUrl, {
            timeoutMs: 5000,
            maxBytes: 1500000,
            retries: 0,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
          });
          if (directRes.ok && directRes.text) {
            pageContent = stripHtml(directRes.text).slice(0, 6000);
          }
        }
      } catch (e) {
        console.warn('[Search API] Lỗi đọc URL:', e.message);
      }
    }

    // B. NẾU CÓ QUERY -> TÌM KIẾM ĐA NGUỒN THỜI GIAN THỰC (Open-Meteo, CoinGecko, Google News, DuckDuckGo, Wikipedia)
    let results = [];
    if (query) {
      const lowerQuery = query.toLowerCase();

      const streamTasks = [
        // Luồng 0A: Thời tiết thời gian thực qua Open-Meteo (WEATHER topic)
        (async () => {
          const isWeatherTopic =
            topic === 'WEATHER' ||
            /\b(thời tiết|thoi tiet|dự báo thời tiết|nhiệt độ|nhiet do|độ ẩm|weather|mưa|mưa rào|nắng)\b/i.test(
              lowerQuery
            );
          if (!isWeatherTopic) return [];

          try {
            const VN_CITIES = [
              { keys: ['hà nội', 'ha noi', 'hanoi'], name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
              { keys: ['tp.hcm', 'tphcm', 'hồ chí minh', 'ho chi minh', 'sài gòn', 'sai gon'], name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
              { keys: ['đà nẵng', 'da nang'], name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
              { keys: ['hải phòng', 'hai phong'], name: 'Hải Phòng', lat: 20.8449, lon: 106.6881 },
              { keys: ['cần thơ', 'can tho'], name: 'Cần Thơ', lat: 10.0452, lon: 105.7469 },
              { keys: ['nha trang'], name: 'Nha Trang', lat: 12.2388, lon: 109.1967 },
              { keys: ['đà lạt', 'da lat'], name: 'Đà Lạt', lat: 11.9404, lon: 108.4583 },
              { keys: ['huế', 'hue'], name: 'Huế', lat: 16.4637, lon: 107.5909 },
              { keys: ['vũng tàu', 'vung tau'], name: 'Vũng Tàu', lat: 10.3460, lon: 107.0843 },
              { keys: ['sa pa', 'sapa'], name: 'Sa Pa', lat: 22.3364, lon: 103.8438 },
            ];

            const mapWmoCode = (code) => {
              if (code === 0) return 'Trời quang đãng, nắng';
              if ([1, 2, 3].includes(code)) return 'Trời có mây, mây rải rác';
              if ([45, 48].includes(code)) return 'Có sương mù';
              if ([51, 53, 55].includes(code)) return 'Mưa phùn';
              if ([61, 63, 65].includes(code)) return 'Mưa rào / mưa to';
              if ([71, 73, 75].includes(code)) return 'Tuyết rơi';
              if ([80, 81, 82].includes(code)) return 'Mưa rào rải rác';
              if ([95, 96, 99].includes(code)) return 'Mưa dông, có sấm sét';
              return 'Thời tiết biến động';
            };

            let matchedCities = VN_CITIES.filter((c) =>
              c.keys.some((k) => lowerQuery.includes(k))
            );
            if (matchedCities.length === 0) {
              matchedCities = [VN_CITIES[0]];
            }

            const cityForecasts = await Promise.all(
              matchedCities.slice(0, 2).map(async (city) => {
                const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FHo_Chi_Minh&forecast_days=7`;
                const resOm = await safeUpstreamFetch(omUrl, { timeoutMs: 4500, retries: 1 });
                if (!resOm.ok) return null;
                const data = resOm.json();
                const currTemp = data.current?.temperature_2m;
                const humidity = data.current?.relative_humidity_2m;
                const cond = mapWmoCode(data.current?.weather_code);
                const daily = data.daily;
                let forecastSummary = '';
                if (daily && Array.isArray(daily.time)) {
                  forecastSummary = daily.time
                    .slice(0, 5)
                    .map(
                      (d, i) =>
                        `[${d}]: ${daily.temperature_2m_min[i]}°C - ${daily.temperature_2m_max[i]}°C, ${mapWmoCode(daily.weather_code[i])}, mưa ${daily.precipitation_probability_max?.[i] || 0}%`
                    )
                    .join('; ');
                }

                return {
                  title: `Thời tiết ${city.name} (Live Open-Meteo)`,
                  url: `https://open-meteo.com/en/docs#latitude=${city.lat}&longitude=${city.lon}`,
                  snippet: `Nhiệt độ hiện tại: ${currTemp}°C | Độ ẩm: ${humidity}% | Tình trạng: ${cond}. Dự báo 5 ngày tới: ${forecastSummary}`,
                  source: 'Open-Meteo Weather API',
                };
              })
            );

            return cityForecasts.filter(Boolean);
          } catch (e) {
            console.warn('[Search API] Lỗi Open-Meteo:', e.message);
            return [];
          }
        })(),

        // Luồng 0B: Crypto & Forex thời gian thực (CoinGecko & ExchangeRate-API)
        (async () => {
          const isMarketTopic =
            topic === 'MARKET_FINANCE' ||
            /\b(bitcoin|btc|crypto|ethereum|eth|solana|sol|tỷ giá|ty gia|usd|ngoại tệ|eur|jpy|giá vàng|sjc)\b/i.test(
              lowerQuery
            );
          if (!isMarketTopic) return [];

          const financeItems = [];

          if (/\b(bitcoin|btc|crypto|ethereum|eth|solana|sol|bnb|doge|xrp|tiền ảo|giá coin)\b/i.test(lowerQuery)) {
            try {
              const cgUrl =
                'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin&vs_currencies=usd,vnd&include_24hr_change=true';
              const resCg = await safeUpstreamFetch(cgUrl, { timeoutMs: 4500, retries: 1 });
              if (resCg.ok) {
                const data = resCg.json();
                const coins = [
                  { id: 'bitcoin', name: 'Bitcoin (BTC)' },
                  { id: 'ethereum', name: 'Ethereum (ETH)' },
                  { id: 'solana', name: 'Solana (SOL)' },
                  { id: 'binancecoin', name: 'BNB' },
                ];

                const coinSummaries = [];
                for (const c of coins) {
                  if (data[c.id]) {
                    const usd = data[c.id].usd;
                    const vnd = data[c.id].vnd;
                    const chg = data[c.id].usd_24h_change;
                    const chgSign = chg >= 0 ? '+' : '';
                    coinSummaries.push(
                      `• ${c.name}: $${usd?.toLocaleString()} (≈ ${vnd?.toLocaleString()} VND) | 24h: ${chgSign}${chg?.toFixed(2)}%`
                    );
                  }
                }

                if (coinSummaries.length > 0) {
                  financeItems.push({
                    title: 'Giá tiền điện tử trực tiếp (BTC, ETH, SOL) - CoinGecko Live',
                    url: 'https://www.coingecko.com',
                    snippet: coinSummaries.join('\n'),
                    source: 'CoinGecko Live API',
                  });
                }
              }
            } catch (e) {
              console.warn('[Search API] Lỗi CoinGecko:', e.message);
            }
          }

          if (/\b(tỷ giá|ty gia|usd|ngoại tệ|eur|jpy|bảng anh|gbp|forex)\b/i.test(lowerQuery)) {
            try {
              const erUrl = 'https://open.er-api.com/v6/latest/USD';
              const resEr = await safeUpstreamFetch(erUrl, { timeoutMs: 4500, retries: 1 });
              if (resEr.ok) {
                const data = resEr.json();
                if (data && data.rates) {
                  const r = data.rates;
                  const fxSummary = `1 USD = ${r.VND?.toLocaleString()} VND | 1 EUR ≈ ${(1 / r.EUR)?.toFixed(3)} USD (1 USD = ${r.EUR?.toFixed(3)} EUR) | 1 USD = ${r.JPY?.toFixed(1)} JPY | 1 GBP ≈ ${(1 / r.GBP)?.toFixed(3)} USD`;
                  financeItems.push({
                    title: 'Tỷ giá ngoại tệ trực tiếp (USD/VND, EUR, JPY) - Live Exchange Rates',
                    url: 'https://open.er-api.com',
                    snippet: fxSummary,
                    source: 'Open Exchange Rate API',
                  });
                }
              }
            } catch (e) {
              console.warn('[Search API] Lỗi ExchangeRate-API:', e.message);
            }
          }

          return financeItems;
        })(),

        // Luồng 1: Google News RSS (Tin tức cập nhật VN & Quốc tế)
        (async () => {
          try {
            const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
            const resNews = await safeUpstreamFetch(newsUrl, { timeoutMs: 4500, retries: 1 });
            if (resNews.ok) {
              const xml = resNews.text;
              const items = [];
              const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);

              for (const match of itemMatches) {
                const itemContent = match[1];
                const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
                const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
                const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
                const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);

                const rawTitle = titleMatch ? stripHtml(titleMatch[1]) : '';
                const link = linkMatch ? linkMatch[1].trim() : '';
                const source = sourceMatch ? stripHtml(sourceMatch[1]) : 'Google News';
                const publishedAt = pubDateMatch ? pubDateMatch[1].trim() : '';

                if (rawTitle && link) {
                  items.push({
                    title: rawTitle,
                    url: link,
                    snippet: `[Tin tức ${source}] ${rawTitle}`,
                    source,
                    publishedAt,
                  });
                }
              }
              return items;
            }
          } catch (e) {
            console.warn('[Search API] Lỗi Google News:', e.message);
          }
          return [];
        })(),

        // Luồng 2: DuckDuckGo Instant Answer & Web Snippets
        (async () => {
          try {
            const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
            const resDdg = await safeUpstreamFetch(ddgUrl, { timeoutMs: 4000, retries: 1 });
            if (resDdg.ok) {
              const data = resDdg.json();
              const items = [];

              if (data.AbstractText && data.AbstractURL) {
                items.push({
                  title: data.Heading || query,
                  url: data.AbstractURL,
                  snippet: data.AbstractText,
                  source: data.AbstractSource || 'DuckDuckGo',
                });
              }

              if (Array.isArray(data.RelatedTopics)) {
                for (const related of data.RelatedTopics.slice(0, 3)) {
                  if (related.Text && related.FirstURL) {
                    items.push({
                      title: related.Text.slice(0, 80) + '...',
                      url: related.FirstURL,
                      snippet: related.Text,
                      source: 'Web Info',
                    });
                  }
                }
              }
              return items;
            }
          } catch (e) {
            console.warn('[Search API] Lỗi DuckDuckGo API:', e.message);
          }
          return [];
        })(),

        // Luồng 3: Wikipedia Tiếng Việt (Kiến thức bách khoa, sự kiện, nhân vật)
        (async () => {
          try {
            const wikiUrl = `https://vi.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
            const resWiki = await safeUpstreamFetch(wikiUrl, { timeoutMs: 4000, retries: 1 });
            if (resWiki.ok) {
              const data = resWiki.json();
              const items = [];
              const searchResults = data?.query?.search || [];

              for (const item of searchResults.slice(0, 3)) {
                const snippet = stripHtml(item.snippet);
                const articleUrl = `https://vi.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`;
                items.push({
                  title: item.title,
                  url: articleUrl,
                  snippet: snippet,
                  source: 'Wikipedia',
                });
              }
              return items;
            }
          } catch (e) {
            console.warn('[Search API] Lỗi Wikipedia:', e.message);
          }
          return [];
        })(),
      ];

      const settled = await Promise.allSettled(streamTasks);
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
          results.push(...outcome.value);
        }
      }

      const seenUrls = new Set();
      results = results.filter((item) => {
        if (!item.url || seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      });
    }

    const payload = {
      success: true,
      query,
      targetUrl,
      resultsCount: results.length,
      results: results.slice(0, 8),
      pageContent: pageContent || undefined,
    };

    const hasUsableData = results.length > 0 || Boolean(pageContent);
    if (hasUsableData && ttlMs > 0) {
      setWarmCache(cacheKey, payload, ttlMs);
      applyCacheHeaders(res, cacheProfile, 'MISS');
    } else {
      // Never cache empty/failed upstream results onto Edge CDN
      applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.warn('[Search API] Lỗi tổng thể:', err?.message || err);
    applyCacheHeaders(res, 'NO_STORE', 'BYPASS');
    return res.status(200).json({
      success: false,
      query,
      targetUrl,
      resultsCount: 0,
      results: [],
      pageContent: undefined,
    });
  }
}
