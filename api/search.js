// api/search.js — Tomorrow v3.6 Autonomous Web Search & URL Reader Engine
// Vercel Serverless Function (Node.js runtime)

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = {};
  if (req.method === 'POST') {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } else {
    body = req.query || {};
  }

  const query = (body.query || req.query?.query || '').trim();
  const targetUrl = (body.url || req.query?.url || '').trim();
  const topic = (body.topic || req.query?.topic || '').trim();

  // Helper fetch with timeout
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(id);
    }
  };

  // HTML tag stripper helper
  const stripHtml = (html) => {
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
  };

  // A. NẾU CÓ URL -> TRÍCH XUẤT NỘI DUNG TRANG WEB (Deep URL Reader)
  let pageContent = '';
  if (targetUrl) {
    try {
      // Thử dùng Reader API r.jina.ai trước
      const jinaRes = await fetchWithTimeout(
        `https://r.jina.ai/${encodeURIComponent(targetUrl)}`,
        {
          headers: {
            Accept: 'text/plain',
            'User-Agent': 'Mozilla/5.0 (compatible; TomorrowBot/3.6; +https://tomorrow.app)',
          },
        },
        6000
      );

      if (jinaRes.ok) {
        const text = await jinaRes.text();
        if (text && text.length > 50) {
          pageContent = text.slice(0, 6000);
        }
      }

      // Fallback nếu r.jina.ai lỗi: fetch trực tiếp và bóc tách HTML
      if (!pageContent) {
        const directRes = await fetchWithTimeout(
          targetUrl,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
          },
          5000
        );
        if (directRes.ok) {
          const rawHtml = await directRes.text();
          pageContent = stripHtml(rawHtml).slice(0, 6000);
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

          // Tìm các thành phố được nhắc đến trong câu hỏi
          let matchedCities = VN_CITIES.filter((c) =>
            c.keys.some((k) => lowerQuery.includes(k))
          );
          if (matchedCities.length === 0) {
            matchedCities = [VN_CITIES[0]]; // Mặc định là Hà Nội
          }

          const cityForecasts = await Promise.all(
            matchedCities.slice(0, 2).map(async (city) => {
              const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FHo_Chi_Minh&forecast_days=7`;
              const res = await fetchWithTimeout(omUrl, {}, 4500);
              if (!res.ok) return null;
              const data = await res.json();
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

        // 1. Crypto Live Price (CoinGecko)
        if (/\b(bitcoin|btc|crypto|ethereum|eth|solana|sol|bnb|doge|xrp|tiền ảo|giá coin)\b/i.test(lowerQuery)) {
          try {
            const cgUrl =
              'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin&vs_currencies=usd,vnd&include_24hr_change=true';
            const res = await fetchWithTimeout(cgUrl, {}, 4500);
            if (res.ok) {
              const data = await res.json();
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

        // 2. Tỷ giá ngoại tệ trực tiếp (ExchangeRate-API)
        if (/\b(tỷ giá|ty gia|usd|ngoại tệ|eur|jpy|bảng anh|gbp|forex)\b/i.test(lowerQuery)) {
          try {
            const erUrl = 'https://open.er-api.com/v6/latest/USD';
            const res = await fetchWithTimeout(erUrl, {}, 4500);
            if (res.ok) {
              const data = await res.json();
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
          const res = await fetchWithTimeout(newsUrl, {}, 4500);
          if (res.ok) {
            const xml = await res.text();
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
          const res = await fetchWithTimeout(ddgUrl, {}, 4000);
          if (res.ok) {
            const data = await res.json();
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
              for (const topic of data.RelatedTopics.slice(0, 3)) {
                if (topic.Text && topic.FirstURL) {
                  items.push({
                    title: topic.Text.slice(0, 80) + '...',
                    url: topic.FirstURL,
                    snippet: topic.Text,
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
          const res = await fetchWithTimeout(wikiUrl, {}, 4000);
          if (res.ok) {
            const data = await res.json();
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

    // Lọc trùng theo URL hoặc Title
    const seenUrls = new Set();
    results = results.filter((item) => {
      if (!item.url || seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    });
  }

  return res.status(200).json({
    success: true,
    query,
    targetUrl,
    resultsCount: results.length,
    results: results.slice(0, 8),
    pageContent: pageContent || undefined,
  });
}
