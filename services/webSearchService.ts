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
 * 0. NHẬN DIỆN TRUY VẤN HÀN LÂM / KHOA HỌC / THUẬT TOÁN / CODE
 * Nhận diện câu hỏi thuộc khối Toán học, Khoa học tự nhiên, Thuật toán, Lập trình
 * để BỎ QUA tra cứu web ngoài, ưu tiên phản hồi tức thì từ bộ não LLM (không bị watchdog 12s timeout).
 */
export function isAcademicOrCodeQuery(text: string): boolean {
  const lower = (text || '').toLowerCase();

  // 1. Dấu hiệu khối code Markdown hoặc từ khóa cú pháp lập trình
  if (
    lower.includes('```') ||
    lower.includes('function') ||
    lower.includes('def ') ||
    lower.includes('const ') ||
    lower.includes('class ') ||
    lower.includes('import ') ||
    lower.includes('export ')
  ) {
    return true;
  }

  // 2. Từ khóa Toán học & Công thức
  const mathKeywords = [
    'định lý', 'dinh ly', 'định luật', 'dinh luat', 'chứng minh', 'chung minh',
    'công thức', 'cong thuc', 'tính toán', 'tinh toan', 'phương trình', 'phuong trinh',
    'hệ phương trình', 'bất đẳng thức', 'tích phân', 'tich phan', 'đạo hàm', 'dao ham',
    'nguyên hàm', 'nguyen ham', 'giới hạn', 'ma trận', 'ma tran', 'vecto', 'vector',
    'hình học', 'tam giác', 'đại số', 'giải tích', 'xác suất', 'xac suat', 'thống kê',
    'bayes', 'pythagore', 'pythagoras', 'newton', 'euler', 'gauss', 'toán', 'toan',
    'giải toán', 'giai toan', 'phép tính', 'tính nhẩm', 'nhị thức', 'tích vô hướng'
  ];
  if (mathKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  // 3. Từ khóa Khoa học Tự nhiên
  const scienceKeywords = [
    'vật lý', 'vat ly', 'hóa học', 'hoa hoc', 'sinh học', 'sinh hoc',
    'thuyết tương đối', 'nguyên tử', 'phân tử', 'quang hợp', 'hóa trị',
    'bảng tuần hoàn', 'gia tốc', 'vận tốc', 'động năng', 'thế năng', 'quang phổ'
  ];
  if (scienceKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  // 4. Từ khóa Lập trình & Thuật toán
  const codeKeywords = [
    'viết code', 'viet code', 'thuật toán', 'thuat toan', 'algorithm',
    'quicksort', 'mergesort', 'binary search', 'cấu trúc dữ liệu', 'data structure',
    'lập trình', 'lap trinh', 'oop', 'kế thừa', 'đa hình', 'python', 'javascript',
    'typescript', 'c++', 'java', 'sql', 'react', 'vue', 'lỗi code', 'debug code',
    'giải thuật', 'regex', 'biểu thức chính quy'
  ];
  if (codeKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  return false;
}

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

  // CÁC TỪ KHÓA ÉP BUỘC TRA CỨU WEB / KIỂM CHỨNG TIN TỨC RÕ RÀNG
  const explicitSearchKeywords = [
    'check web', 'kiểm tra web', 'kiem tra web', 'đưa đường dẫn', 'dua duong dan',
    'đưa link', 'dua link', 'xin link', 'cho xin link', 'đưa link đi', 'dua link di',
    'tìm lại đi', 'tim lai di', 'check lại xem', 'check lai xem',
    'nguồn đâu', 'nguon dau', 'dẫn chứng', 'dan chung',
    'tìm trên mạng', 'tim tren mang', 'search web', 'tin tức mới nhất', 'hôm nay'
  ];
  const hasExplicitSearch = explicitSearchKeywords.some((kw) => lower.includes(kw));

  // NẾU LÀ CÂU HỎI TOÁN HỌC / KHOA HỌC / CODE VÀ KHÔNG YÊU CẦU TÌM WEB CỤ THỂ:
  // BỎ QUA TRA CỨU WEB ĐỂ TĂNG TỐC PHẢN HỒI SIÊU TỐC VÀ TRÁNH WATCHDOG TIMEOUT
  if (isAcademicOrCodeQuery(text) && !hasExplicitSearch) {
    return false;
  }

  // 1. Có chứa đường dẫn URL
  if (URL_REGEX.test(text)) {
    return true;
  }

  // 2. Từ khóa thời gian thực & tin tức nóng (Đã làm sạch, tránh từ đơn lẻ gây trigger nhầm)
  const realTimeKeywords = [
    'hôm nay', 'hom nay', 'mới nhất', 'moi nhat',
    'vừa mới', 'vua moi', 'tin tức', 'tin tuc', 'tình hình', 'tinh hinh',
    'năm nay', 'nam nay', '2025', '2026', 'bây giờ', 'bay gio',
    'lịch thi đấu', 'lich thi dau', 'kết quả bóng đá', 'kết quả trận đấu', 'tỷ số', 'ty so',
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

  // 4. Câu hỏi tra cứu dữ kiện cụ thể (Đã loại bỏ từ đơn lẻ như 'thống kê', 'cấu hình', 'tìm giúp', 'search')
  const queryQuestions = [
    'bao nhiêu bàn', 'bao nhieu ban', 'trên mạng', 'tren mang', 'trên web', 'tren web',
    'giá bao nhiêu', 'gia bao nhieu', 'người sáng lập', 'CEO của', 'bao nhiêu tuổi'
  ];
  if (queryQuestions.some((q) => lower.includes(q))) {
    return true;
  }

  // 5. Yêu cầu kiểm chứng, xin đường dẫn, tin đồn, xác minh
  const verificationKeywords = [
    'check web', 'kiểm tra web', 'kiem tra web', 'đưa đường dẫn', 'dua duong dan',
    'đưa link', 'dua link', 'xin link', 'cho xin link', 'đưa link đi', 'dua link di',
    'tìm lại đi', 'tim lai di', 'check lại xem', 'check lai xem',
    'nguồn đâu', 'nguon dau', 'source', 'dẫn chứng', 'dan chung',
    'thật không', 'that khong', 'có thật không', 'co that khong',
    'bị sa thải', 'bi sa thai', 'sa thải', 'từ chức',
    'xong chưa', 'xác thực', 'xac thuc', 'kiểm chứng', 'kiem chung'
  ];
  if (verificationKeywords.some((vk) => lower.includes(vk))) {
    return true;
  }

  return false;
}

/**
 * 2. TỐI ƯU HÓA CÂU TRUY VẤN (buildOptimizedSearchQuery)
 * Tự động ghép ngữ cảnh lịch sử 4 tin nhắn gần nhất khi câu hỏi bị thiếu chủ ngữ
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

  // Kiểm tra xem câu hiện tại có phải là câu lệnh ngắn xin link/kiểm chứng không có chủ ngữ
  const lowerClean = clean.toLowerCase();
  const commandPhrases = [
    'check web', 'kiểm tra web', 'đưa đường dẫn', 'đưa link', 'xin link', 'cho xin link',
    'đưa link đi', 'tìm lại đi', 'tim lai di', 'check lại xem', 'check lai xem',
    'tìm lại xem', 'nguồn đâu', 'source', 'dẫn chứng', 'thật không', 'có thật không',
    'xem nào', 'xong chưa', 'link đâu', 'link bài viết', 'link tin tức', 'cho link',
    'gửi link', 'gửi đường dẫn'
  ];
  const isCommandOnly = commandPhrases.some((cp) => lowerClean.includes(cp)) || lowerClean.split(/\s+/).length <= 3;

  if (isCommandOnly && recentHistory && recentHistory.length > 0) {
    // Quét ngược lại 4 tin nhắn gần nhất trong recentHistory (cả user và model)
    const recentMessages = recentHistory.slice(-4).reverse();
    let extractedTopic = '';

    for (const msg of recentMessages) {
      const msgText = (msg.text || '').trim();
      if (!msgText || msgText === userText) continue;

      // 1. Trích xuất các thực thể danh từ riêng viết hoa (VD: "Jensen Huang", "Nvidia", "Ronaldo", "Messi", "Sam Altman", "OpenAI")
      const VIETNAMESE_START_WORDS = new Set([
        'Không', 'Có', 'Thôi', 'Nhưng', 'Vậy', 'Nói', 'Ừ', 'Thì', 'Nếu', 'Vì', 'Do', 'Tại',
        'Khi', 'Lúc', 'Người', 'Bạn', 'Tôi', 'Mình', 'User', 'Tomorrow', 'AI', 'Chat', 'Bot',
        'Để', 'Cho', 'Vừa', 'Đang', 'Sẽ', 'Đã', 'Là', 'Vẫn', 'Được', 'Cũng', 'Này', 'Kia'
      ]);
      const rawWords = msgText.replace(/[.,!?;:"'()]+/g, ' ').split(/\s+/).filter(Boolean);
      const properNouns: string[] = [];
      let currentGroup: string[] = [];

      for (const w of rawWords) {
        const isCap = w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase();
        if (isCap && !VIETNAMESE_START_WORDS.has(w) && w.length > 1) {
          currentGroup.push(w);
        } else {
          if (currentGroup.length > 0) {
            properNouns.push(currentGroup.join(' '));
            currentGroup = [];
          }
        }
      }
      if (currentGroup.length > 0) properNouns.push(currentGroup.join(' '));

      if (properNouns.length > 0) {
        extractedTopic = properNouns.slice(0, 2).join(' ');
        const actionMatch = msgText.toLowerCase().match(/\b(sa thải|từ chức|ra mắt|bán|mua|thắng|vô địch|ghi bàn|ceo)\b/i);
        if (actionMatch && !extractedTopic.toLowerCase().includes(actionMatch[0])) {
          extractedTopic += ` ${actionMatch[0]}`;
        }
        break;
      }

      // 2. Nếu không có danh từ viết hoa, tìm các từ khóa chủ đề thông dụng
      const keySubjects = [
        'jarvis', 'j.a.r.v.i.s', 'iron man', 'ronaldo', 'messi', 'bitcoin', 'btc', 'vàng',
        'supabase', 'iphone', 'nvidia', 'jensen huang', 'sam altman', 'elon musk', 'trump',
        'biden', 'real madrid', 'mu', 'gemini', 'chatgpt', 'openai'
      ];
      const found = keySubjects.find((s) => msgText.toLowerCase().includes(s));
      if (found) {
        extractedTopic = found;
        break;
      }
    }

    if (extractedTopic) {
      clean = `${extractedTopic} tin tức mới nhất`;
    }
  }

  return { query: clean || text, url: targetUrl };
}

/**
 * 3. THỰC HIỆN TÌM KIẾM ĐA TẦNG VỚI CLIENT-SIDE FALLBACK (performSmartWebSearch)
 * Giới hạn tối đa 3.5s và đảm bảo 100% không bao giờ ném lỗi (Graceful Fallback)
 */
export async function performSmartWebSearch(
  userText: string,
  recentHistory: any[] = [],
  forceSearch: boolean = false
): Promise<WebSearchContext> {
  const fallbackEmpty: WebSearchContext = {
    searched: false,
    query: '',
    formattedContext: '',
    sources: [],
  };

  try {
    const needsSearch = shouldTriggerWebSearch(userText, forceSearch);
    if (!needsSearch) {
      return fallbackEmpty;
    }

    const { query, url } = buildOptimizedSearchQuery(userText, recentHistory);

    // 1. Thử gọi API endpoint /api/search (Vercel Serverless Function)
    let endpoint = '/api/search';
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
      endpoint = `${window.location.origin}/api/search`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500); // Timeout 3.5s

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, url }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        const data = await res.json();
        if (data && (Array.isArray(data.results) || data.pageContent)) {
          let sources: WebSource[] = (data.results || []).slice(0, 4).map((r: any) => ({
            title: r.title || 'Nguồn web',
            url: r.url,
            source: r.source || 'Web',
            snippet: r.snippet,
            publishedAt: r.publishedAt,
          }));

          if (sources.length > 0 || data.pageContent) {
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
      }
    } catch (err: any) {
      console.warn('[WebSearchService] Gọi /api/search thất bại hoặc timeout 3.5s, kích hoạt Client Direct Fallback:', err?.message || err);
    }

    // 2. CLIENT DIRECT FALLBACK: Chạy thẳng từ trình duyệt
    try {
      const fallbackSources: WebSource[] = [];

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
        let fallbackText = `[DỮ LIỆU TÌM KIẾM TRỰC TIẾP TỪ WEB - NGÀY ${new Date().toLocaleDateString('vi-VN')}]:\n`;
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

    // Nếu không tìm được nguồn tin hợp lệ nào, quay về dùng kiến thức model
    console.warn('[WebSearch] Không lấy được nguồn tin web, fallback sang kiến thức sẵn có của model.');
    return fallbackEmpty;
  } catch (outerErr) {
    console.warn('[WebSearch] Fallback to model knowledge:', outerErr);
    return fallbackEmpty;
  }
}
