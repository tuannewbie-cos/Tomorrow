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

  // B. NẾU CÓ QUERY -> TÌM KIẾM ĐA NGUỒN THỜI GIAN THỰC (Google News, DuckDuckGo, Wikipedia)
  let results = [];
  if (query) {
    const streamTasks = [
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
