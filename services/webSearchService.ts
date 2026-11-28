// services/webSearchService.ts — Tomorrow v4.13.1 Autonomous Web Search & URL Reader Engine
import { ChatMessage, WebSource } from '../types/chat';
import { fetchHubEndpoint } from './edgeProxyService';
import {
  detectNewsRadarIntent,
  fetchNewsRadar,
  formatNewsContextForAI,
} from './newsRadarService';

export interface MatchedQuoteContext {
  quotedText: string;
  itemIndex?: number;
  matchedSource?: { title: string; url: string; domain?: string; source?: string };
}

export type WebIntelTopic =
  | 'FOLLOWUP_REF'
  | 'WEATHER'
  | 'MARKET_FINANCE'
  | 'NEWS_RADAR'
  | 'TECH_DEV'
  | 'COMPARE_BUYING'
  | 'SPORTS_LIVE'
  | 'EDU_POLICY'
  | 'TRAVEL_LOCAL'
  | 'URL_READER';

export interface ReferenceResolution {
  isRef: boolean;
  itemIndex?: number;
  itemIndices?: number[];
  targetText?: string;
  targetUrl?: string;
  targetSource?: string;
  rewrittenQuery?: string;
  directiveTag?: string;
}

export interface WebSearchContext {
  searched: boolean;
  query: string;
  formattedContext: string;
  sources: WebSource[];
  pageContent?: string;
  targetUrl?: string;
  topic?: WebIntelTopic;
  refResolution?: ReferenceResolution;
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
    lower.includes('export ') ||
    lower.includes('hook') ||
    lower.includes('useeffect') ||
    lower.includes('usestate') ||
    lower.includes('bug')
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

  // 3. Từ khóa Khoa học Tự nhiên nền tảng (Lý, Hóa, Sinh)
  const scienceKeywords = [
    'vật lý', 'vat ly', 'hóa học', 'hoa hoc', 'sinh học', 'sinh hoc',
    'thuyết tương đối', 'nguyên tử', 'phân tử', 'quang hợp', 'hóa trị',
    'bảng tuần hoàn', 'gia tốc', 'vận tốc', 'động năng', 'thế năng', 'quang phổ',
    'tế bào', 'te bao', 'phản ứng', 'phan ung', 'axit', 'bazo', 'chất khử', 'chất oxi hóa',
    'di truyền', 'nhiễm sắc thể', 'dna', 'rna', 'quang phổ', 'điện tích', 'từ trường'
  ];
  if (scienceKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  // 4. Từ khóa Lập trình & Thuật toán (kể cả lỗi chính tả 'thuật toàn')
  const codeKeywords = [
    'viết code', 'viet code', 'thuật toán', 'thuat toan', 'thuật toàn', 'thuat toan',
    'algorithm', 'bubble sort', 'bubblesort', 'quicksort', 'mergesort', 'binary search',
    'cấu trúc dữ liệu', 'data structure', 'đệ quy', 'de quy', 'độ phức tạp', 'do phuc tap',
    'lập trình', 'lap trinh', 'oop', 'kế thừa', 'đa hình', 'python', 'javascript',
    'typescript', 'c++', 'java', 'sql', 'react', 'vue', 'lỗi code', 'debug code',
    'giải thuật', 'regex', 'biểu thức chính quy', 'sắp xếp', 'sap xep',
    'ngôn ngữ c', 'ngon ngu c', 'ngôn ngữ lập trình', 'trong c', 'bằng c', 'bang c', 'code c'
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
    'điểm tin', 'diem tin', 'bản tin', 'ban tin', 'tin nóng', 'tin nong',
    'có biến gì', 'co bien gi', 'tin mới', 'tin moi', 'radar',
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

  // 6. Dấu hiệu tham chiếu nối tiếp bài viết/tin tức trước đó (FOLLOWUP_REF)
  if (
    /\b(tin|bài|mục|tin tức|bài báo)\s*(\d+|đầu tiên|thứ nhất|thứ hai|thứ ba|thứ 2|thứ 3|cuối cùng)\b/i.test(lower) ||
    /\b(trích dẫn|chi tiết|nói thêm|nói rõ)\s+(về\s+)?(tin|bài|mục|tin tức|bài báo)\b/i.test(lower) ||
    /\b(bài đó|tin đó|tin trên|bài trên|vụ đó|link gốc|bài này|tin này)\b/i.test(lower) ||
    /\bso sánh\s+(tin|bài)\s*\d+/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * PHÂN LOẠI 10 CHỦ ĐỀ WEB INTEL (classifyWebIntelTopic)
 */
export function classifyWebIntelTopic(query: string): WebIntelTopic {
  const text = (query || '').trim();
  const lower = text.toLowerCase();

  // 1. URL Reader nếu chứa link web
  if (URL_REGEX.test(text)) {
    return 'URL_READER';
  }

  // 2. Followup Ref (Tham chiếu bài viết/tin tức trước đó)
  const refPatterns = [
    /\b(tin|bài|mục|tin tức|bài báo)\s*(\d+|đầu tiên|thứ nhất|thứ hai|thứ ba|thứ 2|thứ 3|cuối cùng)\b/i,
    /\b(trích dẫn|chi tiết|nói thêm|nói rõ)\s+(về\s+)?(tin|bài|mục|tin tức|bài báo)\b/i,
    /\b(bài đó|tin đó|tin trên|bài trên|vụ đó|link gốc|bài này|tin này)\b/i,
    /\bso sánh\s+(tin|bài)\s*\d+/i,
  ];
  if (refPatterns.some((rgx) => rgx.test(lower))) {
    return 'FOLLOWUP_REF';
  }

  // 3. Thời tiết (WEATHER)
  const weatherKeywords = [
    'thời tiết', 'thoi tiet', 'dự báo thời tiết', 'du bao thoi tiet',
    'nhiệt độ', 'nhiet do', 'độ ẩm', 'do am', 'có mưa không', 'co mua khong',
    'trời nắng', 'troi nang', 'mưa rào', 'nhiệt độ hôm nay', 'thời tiết hôm nay',
    'thời tiết ngày mai', 'weather', 'forecast', 'mưa bão'
  ];
  if (weatherKeywords.some((kw) => lower.includes(kw))) {
    return 'WEATHER';
  }

  // 4. Tài chính / Crypto / Forex / Vàng / Chứng khoán (MARKET_FINANCE)
  const financeKeywords = [
    'giá vàng', 'gia vang', 'sjc', 'vàng nhẫn', 'vàng sjc',
    'bitcoin', 'btc', 'crypto', 'ethereum', 'eth', 'solana', 'sol', 'bnb', 'doge', 'xrp',
    'tỷ giá', 'ty gia', 'ngoại tệ', 'usd/vnd', 'usd', 'eur', 'yên nhật', 'jpy',
    'chứng khoán', 'chung khoan', 'cổ phiếu', 'co phieu', 'vn-index', 'vnindex', 'hnx', 'upcom',
    'thị trường chứng khoán', 'giá coin', 'lãi suất ngân hàng'
  ];
  if (financeKeywords.some((kw) => lower.includes(kw))) {
    return 'MARKET_FINANCE';
  }

  // 5. Thể thao / Tỷ số / Lịch thi đấu (SPORTS_LIVE)
  const sportsKeywords = [
    'bóng đá', 'bong da', 'kết quả bóng đá', 'lịch thi đấu', 'lich thi dau',
    'tỷ số', 'ty so', 'tỉ số', 'bảng xếp hạng bóng đá', 'bảng xếp hạng v-league',
    'ngoại hạng anh', 'premier league', 'c1', 'champions league', 'v-league', 'vleague',
    'world cup', 'euro', 'real madrid', 'barcelona', 'man utd', 'manchester united',
    'man city', 'arsenal', 'chelsea', 'liverpool', 'ronaldo', 'messi', 'mbappe',
    'vòng bảng', 'tứ kết', 'bán kết', 'chung kết'
  ];
  if (sportsKeywords.some((kw) => lower.includes(kw))) {
    return 'SPORTS_LIVE';
  }

  // 6. Công nghệ / AI / Phần mềm (TECH_DEV)
  const techKeywords = [
    'openai', 'chatgpt', 'gpt-4', 'gpt-5', 'gemini', 'claude', 'deepseek',
    'nvidia', 'jensen huang', 'sam altman', 'ai chip', 'bán dẫn', 'vi mạch',
    'ra mắt chip', 'công nghệ mới', 'thuật toán ai', 'llm', 'mô hình ngôn ngữ',
    'apple intelligence', 'snapdragon', 'intel', 'amd', 'phần mềm', 'hệ điều hành'
  ];
  if (techKeywords.some((kw) => lower.includes(kw))) {
    return 'TECH_DEV';
  }

  // 7. So sánh / Mua sắm / Đánh giá (COMPARE_BUYING)
  const compareKeywords = [
    'so sánh', 'so sanh', 'nên mua', 'nen mua', 'đánh giá', 'danh gia',
    'review', 'chọn cái nào', 'chon cai nao', 'có nên mua', 'co nen mua',
    'ưu nhược điểm', 'uu nhuoc diem', 'đối chiếu', 'so kè', ' vs '
  ];
  if (compareKeywords.some((kw) => lower.includes(kw))) {
    return 'COMPARE_BUYING';
  }

  // 8. Giáo dục / Quy chế / Điểm chuẩn / Thi cử (EDU_POLICY)
  const eduKeywords = [
    'tốt nghiệp thpt', 'thpt quốc gia', 'thi đại học', 'điểm chuẩn', 'diem chuan',
    'học phí', 'hoc phi', 'bách khoa hà nội', 'đại học quốc gia', 'tuyển sinh',
    'quy chế thi', 'đề minh họa', 'bộ giáo dục', 'bộ gd&đt', 'du học'
  ];
  if (eduKeywords.some((kw) => lower.includes(kw))) {
    return 'EDU_POLICY';
  }

  // 9. Du lịch / Địa điểm / Ẩm thực (TRAVEL_LOCAL)
  const travelKeywords = [
    'du lịch', 'du lich', 'quán ăn', 'quan an', 'món ngon', 'mon ngon',
    'đặc sản', 'dac san', 'địa điểm check-in', 'chỗ chơi', 'choi dau',
    'đi đà lạt', 'đi sapa', 'đi đà nẵng', 'đi phú quốc', 'lịch trình du lịch',
    'khách sạn', 'homestay', 'resort', 'ở đà lạt', 'o da lat'
  ];
  if (travelKeywords.some((kw) => lower.includes(kw))) {
    return 'TRAVEL_LOCAL';
  }

  // 10. Mặc định: Tin tức thời sự tổng hợp (NEWS_RADAR)
  return 'NEWS_RADAR';
}

/**
 * ĐIỀU HƯỚNG THAM CHIẾU NỐI TIẾP ĐA TÌNH HUỐNG (resolveReferenceFromHistory)
 * Xử lý tham chiếu số (tin 1, bài 2), tham chiếu nhiều đối tượng (so sánh tin 1 và 2),
 * và tham chiếu ẩn / đại từ (bài đó, tin trên, link gốc).
 */
export function resolveReferenceFromHistory(
  userText: string,
  recentHistory: any[] = []
): ReferenceResolution {
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  // 1. Nhận diện chỉ số bài viết đơn lẻ
  const singleNumMatch =
    lower.match(/(?:trích dẫn|chi tiết|nói rõ|nói thêm|nội dung|link|về)?\s*(?:tin tức|tin|bài báo|bài|mục|nguồn|số)\s*(\d+)/i) ||
    lower.match(/(?:tin tức|tin|bài báo|bài|mục)\s*(\d+)/i);

  const ordinalWordMap: Record<string, number> = {
    'đầu tiên': 1,
    'thứ nhất': 1,
    'thứ 1': 1,
    'thứ hai': 2,
    'thứ 2': 2,
    'thứ ba': 3,
    'thứ 3': 3,
    'thứ tư': 4,
    'thứ 4': 4,
    'thứ năm': 5,
    'thứ 5': 5,
    'cuối cùng': -1,
  };

  let matchedIndex: number | undefined = undefined;
  if (singleNumMatch && singleNumMatch[1]) {
    matchedIndex = parseInt(singleNumMatch[1], 10);
  } else {
    for (const [word, idx] of Object.entries(ordinalWordMap)) {
      if (lower.includes(word)) {
        matchedIndex = idx;
        break;
      }
    }
  }

  // Nhận diện so sánh nhiều bài viết: "so sánh tin 1 và 2", "so sánh bài 1 và bài 2"
  const multiMatch = lower.match(
    /(?:so sánh|đối chiếu|tổng hợp)\s+(?:tin tức|tin|bài báo|bài|mục)?\s*(\d+)\s*(?:và|với|cùng)\s*(?:tin tức|tin|bài báo|bài|mục)?\s*(\d+)/i
  );
  let multiIndices: number[] | undefined = undefined;
  if (multiMatch) {
    multiIndices = [parseInt(multiMatch[1], 10), parseInt(multiMatch[2], 10)];
  }

  // Nhận diện tham chiếu đại từ / ẩn: "bài đó", "tin trên", "bài báo đó", "link gốc"
  const pronounMatch = /(?:bài đó|tin đó|tin trên|bài trên|bài báo đó|vụ đó|link gốc|bài này|tin này)/i.test(lower);

  const isRef = Boolean(matchedIndex !== undefined || multiIndices || pronounMatch);

  if (!isRef) {
    return { isRef: false };
  }

  // 2. Quét recentHistory tìm tin nhắn model gần nhất có sources hoặc danh sách đánh số
  let foundSources: WebSource[] = [];
  let foundText = '';

  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const msg = recentHistory[i];
    if (!msg) continue;
    const isUser = msg.role === 'user' || msg.sender === 'user';
    if (isUser && (msg.text || '').trim() === text) continue;

    if (!isUser) {
      if (Array.isArray(msg.sources) && msg.sources.length > 0) {
        foundSources = msg.sources;
        foundText = msg.text || '';
        break;
      }
      if (typeof msg.text === 'string' && (msg.text.includes('1. [') || msg.text.includes('1. '))) {
        foundText = msg.text;
        break;
      }
    }
  }

  // Bóc tách từ văn bản có đánh số nếu không có mảng sources
  if (foundSources.length === 0 && foundText) {
    const lines = foundText.split('\n');
    let currentIdx = 0;
    for (const line of lines) {
      const lineMatch = line.match(/^\s*(\d+)\.\s*(?:\[([^\]]+)\])?\s*(.+)$/);
      if (lineMatch) {
        const idx = parseInt(lineMatch[1], 10);
        const sourceName = lineMatch[2] || 'Tin tức';
        const rawTitle = lineMatch[3].trim();
        foundSources.push({
          title: rawTitle,
          url: '',
          source: sourceName,
          snippet: rawTitle,
        });
        currentIdx = idx;
      } else if (currentIdx > 0 && line.includes('http')) {
        const urlM = line.match(/(https?:\/\/[^\s]+)/);
        if (urlM && foundSources[currentIdx - 1]) {
          foundSources[currentIdx - 1].url = urlM[1];
        }
      }
    }
  }

  // Xử lý index cuối cùng (-1)
  if (matchedIndex === -1 && foundSources.length > 0) {
    matchedIndex = foundSources.length;
  }

  // 3. Trích xuất thông tin đối tượng tham chiếu
  if (multiIndices && multiIndices.length >= 2) {
    const [i1, i2] = multiIndices;
    const item1 = foundSources[i1 - 1];
    const item2 = foundSources[i2 - 1];
    const directiveTag = `[REF_TARGET: Item #${i1} = "${item1?.title || 'Tin ' + i1}" (${item1?.url || ''}) | Item #${i2} = "${item2?.title || 'Tin ' + i2}" (${item2?.url || ''})]`;
    const rewrittenQuery = item1 && item2
      ? `so sánh ${item1.title.slice(0, 40)} và ${item2.title.slice(0, 40)}`
      : userText;

    return {
      isRef: true,
      itemIndices: multiIndices,
      directiveTag,
      rewrittenQuery,
    };
  }

  const targetIdx = matchedIndex || (pronounMatch ? 1 : undefined);
  if (targetIdx !== undefined && targetIdx > 0) {
    const item = foundSources[targetIdx - 1];
    if (item) {
      const directiveTag = `[REF_TARGET: Item #${targetIdx} = "${item.title}" | URL: ${item.url || 'N/A'} | Nguồn: ${item.source || 'Web'}]`;
      const rewrittenQuery = item.title ? `${item.title} chi tiết` : userText;

      return {
        isRef: true,
        itemIndex: targetIdx,
        targetText: item.title,
        targetUrl: item.url,
        targetSource: item.source,
        rewrittenQuery,
        directiveTag,
      };
    }
  }

  return {
    isRef: true,
    itemIndex: targetIdx,
    directiveTag: `[REF_TARGET: Người dùng đang yêu cầu tham chiếu tin tức/bài viết #${targetIdx || 'trên'} từ kết quả trước]`,
    rewrittenQuery: userText,
  };
}

/**
 * 2. TỐI ƯU HÓA CÂU TRUY VẤN (buildOptimizedSearchQuery)
 * Tự động phân giải tham chiếu nối tiếp (resolveReferenceFromHistory) hoặc ghép thực thể danh từ riêng
 */
export function buildOptimizedSearchQuery(
  userText: string,
  recentHistory: any[] = []
): { query: string; url?: string; refResolution?: ReferenceResolution } {
  const text = userText.trim();
  const urlMatch = text.match(URL_REGEX);
  let targetUrl = urlMatch ? urlMatch[0] : undefined;

  // 1. Kiểm tra tham chiếu nối tiếp từ lịch sử hội thoại trước tiên
  const refResolution = resolveReferenceFromHistory(userText, recentHistory);
  if (refResolution.isRef) {
    if (refResolution.targetUrl && !targetUrl) {
      targetUrl = refResolution.targetUrl;
    }
    const cleanRefQuery = refResolution.rewrittenQuery || text;
    return {
      query: cleanRefQuery,
      url: targetUrl,
      refResolution,
    };
  }

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

  return { query: clean || text, url: targetUrl, refResolution };
}

/**
 * Chuẩn hóa mốc ngày cho Web Search (resolveTemporalSearchQuery)
 * Nếu câu hỏi chứa "hôm nay", "sáng nay", "trưa nay", "chiều nay", "tối nay", "mới nhất", "hiện tại"
 * mà chưa có ngày/năm cụ thể -> tự động nối thêm ${chrono.dateStr} vào truy vấn để kết quả tìm kiếm bám sát ngày thực tế.
 */
export function resolveTemporalSearchQuery(query: string, chrono?: { dateStr: string }): string {
  if (!query) return query;
  const lower = query.toLowerCase();
  const temporalWords = [
    'hôm nay', 'hom nay',
    'sáng nay', 'sang nay',
    'trưa nay', 'trua nay',
    'chiều nay', 'chieu nay',
    'tối nay', 'toi nay',
    'mới nhất', 'moi nhat',
    'hiện tại', 'hien tai',
  ];
  const hasTemporal = temporalWords.some((w) => lower.includes(w));
  if (!hasTemporal) return query;

  // Kiểm tra xem đã có ngày cụ thể (DD/MM hoặc DD/MM/YYYY) hoặc năm (2024, 2025, 2026,...) chưa
  const hasSpecificDateOrYear = /\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?|20\d{2})\b/.test(query);
  if (hasSpecificDateOrYear) return query;

  let dateStr = chrono?.dateStr;
  if (!dateStr) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    dateStr = `${d}/${m}/${y}`;
  }

  return `${query} ${dateStr}`.trim();
}

const QUOTE_STOPWORDS = new Set([
  'cua', 'va', 'la', 'trong', 'cho', 'voi', 'mot', 'nhung', 'cac', 'da', 'dang', 'se',
  'nay', 'do', 'tai', 'tu', 've', 'theo', 'nhu', 'the', 'khi', 'sau', 'truoc', 'den',
  'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'has', 'have', 'had', 'over', 'into',
]);

function normalizeQuoteMatchText(input: string): string {
  return (input || '')
    .replace(/\*\*|__|`/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuoteWords(normText: string): Set<string> {
  const words = normText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !QUOTE_STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Matches a user-highlighted text excerpt back to the exact source item in sourceMessage.sources.
 * Priority 1: Numbered list index match (1., 2., 3...) inside sourceMessage.text.
 * Priority 2: Title + source-name + entity keyword overlap across sourceMessage.sources.
 */
export function matchQuotedTextToSource(
  quotedText: string,
  sourceMessage?: ChatMessage
): MatchedQuoteContext {
  const clamped = (quotedText || '').trim().slice(0, 500);
  if (!clamped || !sourceMessage) {
    return { quotedText: clamped };
  }

  const sources = Array.isArray(sourceMessage.sources) ? sourceMessage.sources : [];
  if (sources.length === 0) {
    return { quotedText: clamped };
  }

  const normQuoted = normalizeQuoteMatchText(clamped)
    .replace(/^\d+\.\s*/, '')
    .trim();
  const probe = normQuoted.slice(0, 42).trim();

  // Priority 1: Check numbered list items in sourceMessage.text (1., 2., 3...)
  if (sourceMessage.text && probe.length >= 4) {
    const lines = sourceMessage.text.split('\n');
    const listBlocks: Array<{ index: number; text: string }> = [];
    let currentBlock: { index: number; text: string } | null = null;

    for (const line of lines) {
      const listMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (listMatch) {
        if (currentBlock) listBlocks.push(currentBlock);
        currentBlock = {
          index: parseInt(listMatch[1], 10),
          text: listMatch[2],
        };
      } else if (currentBlock && line.trim()) {
        currentBlock.text += ' ' + line.trim();
      }
    }
    if (currentBlock) listBlocks.push(currentBlock);

    for (const blk of listBlocks) {
      const normBlk = normalizeQuoteMatchText(blk.text);
      if (
        normBlk.includes(probe) ||
        (normQuoted.length >= 8 && normQuoted.includes(normBlk.slice(0, 36)))
      ) {
        const matched = sources[blk.index - 1];
        if (matched && matched.url) {
          return {
            quotedText: clamped,
            itemIndex: blk.index,
            matchedSource: {
              title: matched.title,
              url: matched.url,
              domain: matched.domain,
              source: matched.source,
            },
          };
        }
      }
    }
  }

  // Priority 2: Keyword & source-name overlap across sourceMessage.sources
  const bracketMatch = clamped.match(/\[([^\]•]+)(?:•[^\]]*)?\]/);
  const bracketSourceNorm = bracketMatch ? normalizeQuoteMatchText(bracketMatch[1]) : '';
  const quotedTokens = tokenizeQuoteWords(normQuoted);
  const properNouns = (clamped.match(/\b[A-ZÀ-Ỹ][a-zà-ỹ0-9]{2,}\b/g) || []).map((w) =>
    normalizeQuoteMatchText(w)
  );

  let bestScore = 0;
  let bestSource: WebSource | null = null;
  let bestIndex: number | undefined;

  sources.forEach((src, idx) => {
    if (!src || !src.url) return;
    const srcCombinedNorm = normalizeQuoteMatchText(
      `${src.title || ''} ${src.source || ''} ${src.snippet || ''}`
    );
    const srcTokens = tokenizeQuoteWords(srcCombinedNorm);
    const srcTitleTokens = tokenizeQuoteWords(normalizeQuoteMatchText(src.title || ''));
    const srcNameNorm = normalizeQuoteMatchText(src.source || '');

    let overlapCount = 0;
    for (const tok of quotedTokens) {
      if (srcTokens.has(tok) || (tok.length >= 4 && srcCombinedNorm.includes(tok))) {
        overlapCount += 1;
      }
    }

    let titleOverlap = 0;
    for (const tok of quotedTokens) {
      if (srcTitleTokens.has(tok)) titleOverlap += 1;
    }

    const denom = Math.max(1, Math.min(quotedTokens.size, srcTokens.size));
    let score = overlapCount / denom;

    const sourceMatched =
      Boolean(srcNameNorm) &&
      (normQuoted.includes(srcNameNorm) ||
        (bracketSourceNorm &&
          (bracketSourceNorm.includes(srcNameNorm) || srcNameNorm.includes(bracketSourceNorm))));

    if (sourceMatched && overlapCount >= 1) {
      score += 0.3;
    }

    let properHits = 0;
    for (const pn of properNouns) {
      if (pn.length >= 3 && srcCombinedNorm.includes(pn)) {
        properHits += 1;
      }
    }
    if (properHits >= 2) {
      score += 0.25;
    } else if (properHits === 1 && titleOverlap >= 1) {
      score += 0.15;
    }

    if (score > bestScore && (score >= 0.2 || (sourceMatched && titleOverlap >= 1))) {
      bestScore = score;
      bestSource = src;
      bestIndex = idx + 1;
    }
  });

  if (bestSource) {
    const chosen = bestSource as WebSource;
    return {
      quotedText: clamped,
      itemIndex: bestIndex,
      matchedSource: {
        title: chosen.title,
        url: chosen.url,
        domain: chosen.domain,
        source: chosen.source,
      },
    };
  }

  return { quotedText: clamped };
}

/**
 * 3. THỰC HIỆN TÌM KIẾM ĐA TẦNG VỚI CLIENT-SIDE FALLBACK (performSmartWebSearch)
 * Giới hạn tối đa 3.5s và đảm bảo 100% không bao giờ ném lỗi (Graceful Fallback)
 */
export async function performSmartWebSearch(
  userText: string,
  recentHistory: any[] = [],
  forceSearch: boolean = false,
  chrono?: { dateStr: string },
  quotedContext?: MatchedQuoteContext
): Promise<WebSearchContext> {
  const fallbackEmpty: WebSearchContext = {
    searched: false,
    query: '',
    formattedContext: '',
    sources: [],
  };

  try {
    const isAskLinkIntent =
      /\b(link|đường dẫn|duong dan|nguồn|nguon|trích dẫn|trich dan|bài gốc|bai goc|url|ở đâu|o dau|báo nào|bao nao)\b/i.test(
        userText
      );
    const hasQuoted = Boolean(quotedContext && quotedContext.quotedText);

    // Smart routing when user highlighted a quote
    if (hasQuoted && quotedContext) {
      const matched = quotedContext.matchedSource;
      if (matched && matched.url) {
        const isGoogleRss = matched.url.includes('news.google.com/rss/articles/');
        let pageContent = '';
        if (!isGoogleRss) {
          try {
            const readerRes = await fetchHubEndpoint<{ pageContent?: string }>('/api/search', {
              method: 'POST',
              body: { url: matched.url, topic: 'URL_READER' },
              timeoutMs: 3200,
              ttlMs: 180_000,
            });
            if (readerRes.ok && readerRes.data?.pageContent) {
              pageContent = readerRes.data.pageContent;
            }
          } catch {
            // Keep matched source even if deep read times out
          }
        }

        if (isAskLinkIntent || pageContent || isGoogleRss) {
          const sourceEntry: WebSource = {
            title: matched.title,
            url: matched.url,
            domain: matched.domain,
            source: matched.source || matched.domain || 'Nguồn tin',
            snippet: quotedContext.quotedText,
          };
          let formatted = `[NGUỒN BÀI GỐC KHỚP TỪ ĐOẠN TRÍCH DẪN]:\n1. [${sourceEntry.source}] ${sourceEntry.title}\nURL: ${sourceEntry.url}`;
          if (pageContent) {
            formatted += `\n\n[NỘI DUNG BÀI BÁO]:\n${pageContent.slice(0, 2200)}`;
          }
          return {
            searched: true,
            query: matched.title,
            formattedContext: formatted,
            sources: [sourceEntry],
            pageContent: pageContent || undefined,
            targetUrl: matched.url,
            topic: 'URL_READER',
          };
        }
      } else if (isAskLinkIntent) {
        // User asked for link/source from a message without attached sources -> search excerpt
        const entityQuery = quotedContext.quotedText
          .replace(/\[[^\]]+\]/g, ' ')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 90);
        if (entityQuery) {
          const searchRes = await fetchHubEndpoint<{
            results?: Array<{
              title?: string;
              url?: string;
              source?: string;
              snippet?: string;
              publishedAt?: string;
            }>;
          }>('/api/search', {
            method: 'POST',
            body: { query: entityQuery, topic: 'NEWS_RADAR' },
            timeoutMs: 4200,
            ttlMs: 60_000,
          });
          if (searchRes.ok && Array.isArray(searchRes.data?.results) && searchRes.data.results.length > 0) {
            const sources: WebSource[] = searchRes.data.results.slice(0, 4).map((r) => ({
              title: r.title || 'Nguồn web',
              url: r.url || '',
              source: r.source || 'Web',
              snippet: r.snippet,
              publishedAt: r.publishedAt,
            }));
            let formatted = `[KẾT QUẢ TÌM BÀI GỐC CHO ĐOẠN TRÍCH DẪN "${entityQuery}"]:\n`;
            sources.forEach((s, idx) => {
              formatted += `${idx + 1}. [${s.source || 'Web'}] ${s.title}\nLink: ${s.url}\n\n`;
            });
            return {
              searched: true,
              query: entityQuery,
              formattedContext: formatted.trim(),
              sources,
              topic: 'NEWS_RADAR',
            };
          }
        }
      } else {
        // Group B without matchedSource (e.g. STEM/code/math/casual) -> skip unnecessary web search unless forced or explicitly web-triggered
        if (!forceSearch && !shouldTriggerWebSearch(userText, false)) {
          return fallbackEmpty;
        }
      }
    }

    const needsSearch = shouldTriggerWebSearch(userText, forceSearch);
    if (!needsSearch) {
      return fallbackEmpty;
    }

    let { query, url, refResolution } = buildOptimizedSearchQuery(userText, recentHistory);
    query = resolveTemporalSearchQuery(query, chrono);
    const topic: WebIntelTopic = refResolution?.isRef ? 'FOLLOWUP_REF' : classifyWebIntelTopic(query);

    // 0. NEWS RADAR LIVE (/api/news): Ưu tiên nguồn tin RSS + Hacker News đa nguồn cho nhánh NEWS_RADAR
    if (topic === 'NEWS_RADAR' && !url) {
      try {
        const radarIntent = detectNewsRadarIntent(userText);
        const radarRes = await fetchNewsRadar({
          category: radarIntent.category,
          q: radarIntent.keywordFilter || '',
          limit: 12,
        });
        if (radarRes.ok && radarRes.items.length >= 2) {
          const { formattedContext, sources } = formatNewsContextForAI(
            radarRes.items,
            1400,
            radarRes.updatedAt
          );
          if (formattedContext && sources.length >= 2) {
            return {
              searched: true,
              query,
              formattedContext,
              sources,
              topic: 'NEWS_RADAR',
              refResolution,
            };
          }
        }
      } catch (radarErr) {
        console.warn('[WebSearchService] News Radar fallback sang /api/search:', radarErr);
      }
    }

    // 1. Thử gọi API endpoint /api/search qua Edge Proxy Hub (L1 cache + dedup + 4.5s timeout)
    const searchL1TtlMs =
      topic === 'WEATHER' ? 120_000 : topic === 'MARKET_FINANCE' ? 30_000 : 60_000;

    try {
      const hubRes = await fetchHubEndpoint<{
        results?: Array<{
          title?: string;
          url?: string;
          source?: string;
          snippet?: string;
          publishedAt?: string;
        }>;
        pageContent?: string;
        targetUrl?: string;
      }>('/api/search', {
        method: 'POST',
        body: { query, url, topic },
        timeoutMs: 4500,
        ttlMs: searchL1TtlMs,
      });

      if (hubRes.ok && hubRes.data) {
        const data = hubRes.data;
        if (Array.isArray(data.results) || data.pageContent) {
          let sources: WebSource[] = (data.results || []).slice(0, 4).map((r) => ({
            title: r.title || 'Nguồn web',
            url: r.url || '',
            source: r.source || 'Web',
            snippet: r.snippet,
            publishedAt: r.publishedAt,
          }));

          if (sources.length > 0 || data.pageContent || refResolution?.isRef) {
            let formatted = `[DỮ LIỆU WEB THỜI GIAN THỰC ĐƯỢC TÌM KIẾM NGÀY ${new Date().toLocaleDateString('vi-VN')} CHO TRUY VẤN: "${query}"]\n`;
            if (refResolution?.directiveTag) {
              formatted += `\n${refResolution.directiveTag}\n`;
            }
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
              topic,
              refResolution,
            };
          }
        }
      }
    } catch (err: any) {
      console.warn('[WebSearchService] Gọi /api/search thất bại hoặc timeout 4.5s, kích hoạt Client Direct Fallback:', err?.message || err);
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
          topic,
          refResolution,
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
