// services/webSearchService.ts — Tomorrow v3.6 Autonomous Web Search & URL Reader Engine
import { Platform } from 'react-native';
import { WebSource } from '../types/chat';

export interface WebSearchContext {
  searched: boolean;
  query: string;
  formattedContext: string;
  sources: WebSource[];
  pageContent?: string;
  targetUrl?: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

/**
 * 1. PHÁT HIỆN Ý ĐỊNH CẦN TRA CỨU WEB (shouldTriggerWebSearch)
 */
export function shouldTriggerWebSearch(userText: string, forceSearch: boolean = false): boolean {
  if (forceSearch) return true;

  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  // Bỏ qua tin nhắn quá ngắn hoặc các tín hiệu khép mạch / chào hỏi xã giao
  if (
    /^(yo|ê|e|alo|hi|hello|hí|halo|okk+|ok+|oki+|ừ|ừa|uk|sybau|cook|cút|im|im đi|bye|pp|ngủ đây|thôi|mệt vl|chán vl)[!.? ]*$/i.test(
      lower
    )
  ) {
    return false;
  }

  // 1. Có chứa đường dẫn URL
  if (URL_REGEX.test(text)) {
    return true;
  }

  // 2. Từ khóa thời gian thực & tin tức nóng
  const realTimeKeywords = [
    'hôm nay', 'hom nay', 'hiện tại', 'hien tai', 'mới nhất', 'moi nhat',
    'vừa mới', 'vua moi', 'tin tức', 'tin tuc', 'tình hình', 'tinh hinh',
    'năm nay', 'nam nay', '2025', '2026', 'bây giờ', 'bay gio',
    'lịch thi đấu', 'lich thi dau', 'kết quả', 'ket qua', 'tỷ số', 'ty so',
    'bảng xếp hạng', 'bang xep hang', 'vòng bảng', 'chung kết', 'bán kết'
  ];
  if (realTimeKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  // 3. Từ khóa thị trường & đời sống
  const marketKeywords = [
    'giá vàng', 'gia vang', 'tỷ giá', 'ty gia', 'bitcoin', 'btc', 'crypto',
    'cổ phiếu', 'co phieu', 'chứng khoán', 'chung khoan', 'thời tiết', 'thoi tiet',
    'nhiệt độ', 'nhiet do', 'dự báo thời tiết'
  ];
  if (marketKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  // 4. Câu hỏi tra cứu dữ kiện, số liệu, sự thật
  const queryQuestions = [
    'là ai', 'la ai', 'là gì', 'la gi', 'bao nhiêu bàn', 'bao nhieu ban',
    'ở đâu', 'o dau', 'khi nào', 'khi nao', 'tìm giúp', 'tim giup',
    'search', 'tra cứu', 'tra cuu', 'trên mạng', 'tren mang', 'trên web', 'tren web',
    'thống kê', 'thong ke', 'cấu hình', 'cau hinh', 'giá bao nhiêu', 'gia bao nhieu',
    'ai là', 'ai la', 'người sáng lập', 'CEO của', 'bao nhiêu tuổi'
  ];
  if (queryQuestions.some((q) => lower.includes(q))) {
    return true;
  }

  return false;
}

/**
 * 2. TỐI ƯU HÓA CÂU TRUY VẤN (buildOptimizedSearchQuery)
 */
export function buildOptimizedSearchQuery(userText: string, recentHistory: any[] = []): { query: string; url?: string } {
  const text = userText.trim();
  const urlMatch = text.match(URL_REGEX);
  const targetUrl = urlMatch ? urlMatch[0] : undefined;

  let clean = text
    .replace(URL_REGEX, '')
    // Loại bỏ các từ đệm xưng hô tiếng Việt ở đầu/cuối câu
    .replace(/^(ê\s*(m|mày|bạn|bro)?\s*(ơi)?|cho\s*(t|tao|mình)\s*hỏi|hỏi\s*(tý|tí)|hỏi\s*thật\s*nhé|m\s*ơi|bạn\s*ơi)\s*/gi, '')
    .replace(/\s*(nhé|nha|vậy\s*(m|mày|bạn|bro)|hả\s*(m|mày|bạn|bro)|được\s*không|thế\s*nhỉ|ko\s*m|không\s*m)[.?!]*$/gi, '')
    .trim();

  // Nếu câu hỏi quá ngắn (dưới 4 từ) phụ thuộc ngữ cảnh câu trước đó
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 4 && recentHistory && recentHistory.length > 0) {
    const lastUserMsg = [...recentHistory].reverse().find((m) => (m.role === 'user' || m.sender === 'user') && m.text !== userText);
    if (lastUserMsg && lastUserMsg.text) {
      const prevText = lastUserMsg.text.toLowerCase();
      // Trích xuất từ khóa chủ đề (Ronaldo, Messi, Bitcoin, Supabase...)
      const keySubjects = ['ronaldo', 'messi', 'bitcoin', 'btc', 'vàng', 'supabase', 'iphone', 'real madrid', 'mu', 'manchester united'];
      const found = keySubjects.find((s) => prevText.includes(s));
      if (found && !clean.toLowerCase().includes(found)) {
        clean = `${found} ${clean}`;
      }
    }
  }

  return { query: clean || text, url: targetUrl };
}

/**
 * 3. THỰC HIỆN TÌM KIẾM ĐA TẦNG VỚI CLIENT-SIDE FALLBACK (performSmartWebSearch)
 */
export async function performSmartWebSearch(
  userText: string,
  recentHistory: any[] = [],
  forceSearch: boolean = false
): Promise<WebSearchContext> {
  const needsSearch = shouldTriggerWebSearch(userText, forceSearch);
  if (!needsSearch) {
    return {
      searched: false,
      query: '',
      formattedContext: '',
      sources: [],
    };
  }

  const { query, url } = buildOptimizedSearchQuery(userText, recentHistory);

  // 1. Thử gọi API endpoint /api/search (Vercel Serverless Function)
  let endpoint = '/api/search';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    endpoint = `${window.location.origin}/api/search`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, url }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data.results) || data.pageContent)) {
        const sources: WebSource[] = (data.results || []).slice(0, 4).map((r: any) => ({
          title: r.title || 'Nguồn web',
          url: r.url,
          source: r.source || 'Web',
          snippet: r.snippet,
          publishedAt: r.publishedAt,
        }));

        let formatted = `[DỮ LIỆU WEB THỜI GIAN THỰC ĐƯỢC TÌM KIẾM NGÀY ${new Date().toLocaleDateString('vi-VN')} CHO TRUY VẤN: "${query}"]\n`;
        if (data.pageContent) {
          formatted += `\n[NỘI DUNG ĐỌC TỪ LIÊN KẾT ${url || data.targetUrl}]:\n${data.pageContent}\n`;
        }
        if (sources.length > 0) {
          formatted += `\n[KẾT QUẢ TÌM KIẾM WEB CHÍNH THỨC]:\n`;
          sources.forEach((s, idx) => {
            formatted += `${idx + 1}. [${s.source || 'Tin tức'}] ${s.title}\nTrích dẫn: ${s.snippet || s.title}\nLink: ${s.url}\n\n`;
          });
        }

        return {
          searched: true,
          query,
          formattedContext: formatted.trim(),
          sources,
          pageContent: data.pageContent,
          targetUrl: url || data.targetUrl,
        };
      }
    }
  } catch (err: any) {
    console.warn('[WebSearchService] Gọi /api/search thất bại, kích hoạt Client Direct Fallback:', err?.message || err);
  }

  // 2. CLIENT DIRECT FALLBACK: Chạy thẳng từ trình duyệt nếu /api/search chưa sẵn sàng (VD trong môi trường test local)
  try {
    const fallbackSources: WebSource[] = [];
    let fallbackText = '';

    // Direct Wikipedia Tiếng Việt
    try {
      const wikiUrl = `https://vi.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl);
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const items = wikiData?.query?.search || [];
        for (const it of items.slice(0, 2)) {
          const cleanSnippet = (it.snippet || '').replace(/<[^>]+>/g, '');
          const articleUrl = `https://vi.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, '_'))}`;
          fallbackSources.push({
            title: it.title,
            url: articleUrl,
            source: 'Wikipedia',
            snippet: cleanSnippet,
          });
        }
      }
    } catch (e) {
      // Bỏ qua lỗi fallback wiki
    }

    // Direct Google News via rss2json
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
      const jsonRes = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      if (jsonRes.ok) {
        const jsonData = await jsonRes.json();
        if (Array.isArray(jsonData.items)) {
          for (const item of jsonData.items.slice(0, 3)) {
            fallbackSources.push({
              title: item.title,
              url: item.link,
              source: item.author || 'Google News',
              snippet: item.title,
              publishedAt: item.pubDate,
            });
          }
        }
      }
    } catch (e) {
      // Bỏ qua lỗi fallback news
    }

    if (fallbackSources.length > 0) {
      fallbackText = `[DỮ LIỆU TÌM KIẾM TRỰC TIẾP TỪ WEB - NGÀY ${new Date().toLocaleDateString('vi-VN')}]:\n`;
      fallbackSources.forEach((s, idx) => {
        fallbackText += `${idx + 1}. [${s.source}] ${s.title}: ${s.snippet || s.title} (URL: ${s.url})\n`;
      });

      return {
        searched: true,
        query,
        formattedContext: fallbackText.trim(),
        sources: fallbackSources.slice(0, 4),
      };
    }
  } catch (clientErr) {
    console.warn('[WebSearchService] Client Direct Fallback cũng gặp sự cố:', clientErr);
  }

  return {
    searched: false,
    query,
    formattedContext: '',
    sources: [],
  };
}
