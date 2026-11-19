import { ChatMessage, EmotionData, UserMemoryProfile, WebSource, UserMemoryVault } from '../types/chat';
import { JarvisIntent, ConversationState } from '../types/jarvis';
import {
  isPlaceholderOrNoiseTitle,
  getVaultFromProfile,
  mergeMemoryNoteIntoVault,
  updateProfileWithVault,
  DEFAULT_USER_MEMORY_VAULT,
} from '../storage/chatStorage';
import { performSmartWebSearch, shouldTriggerWebSearch } from './webSearchService';

export { isPlaceholderOrNoiseTitle, getVaultFromProfile, mergeMemoryNoteIntoVault, updateProfileWithVault };

// Cấu hình OpenAI API (Bộ não chính siêu tốc gpt-4o-mini)
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
// Biến trạng thái ngắt mạch (Silent Circuit Breaker): Nếu key OpenAI hết hạn/hết credit trong phiên thì chuyển hẳn sang Gemini
let isOpenAIUnavailable = false;

export function getOpenAICircuitBreakerStatus(): boolean {
  return isOpenAIUnavailable;
}

export function resetOpenAICircuitBreaker(): void {
  isOpenAIUnavailable = false;
}

// Cấu hình Gemini API Keys (Chuỗi dự phòng ngầm miễn phí xoay vòng)
const PRIMARY_GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const BACKUP_GEMINI_KEYS: string[] = [
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_1 || '',
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_2 || '',
].filter((k) => k.length > 5);

const ALL_GEMINI_KEYS = [PRIMARY_GEMINI_KEY, ...BACKUP_GEMINI_KEYS].filter((k) => k.length > 5);

/**
 * 1. KHAI BÁO DANH SÁCH MODEL XOAY VÒNG MIỄN PHÍ TRÊN GOOGLE GENERATIVE LANGUAGE API (v1beta)
 * Đảm bảo chỉ dùng các model chính thức, hợp lệ và đang hoạt động để không bao giờ bị gián đoạn:
 * - gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite, gemini-1.5-flash (Chuẩn Google API)
 */
export const FREE_MODEL_CHAIN: string[] = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

// Timeout 8.5 giây cho mỗi lần gọi để chống treo vô định
const TIMEOUT_MS = 8500;

export interface AIResponsePayload {
  replies: string[];
  session_title?: string;
  sessionTitle?: string;
  should_update_title?: boolean;
  shouldUpdateTitle?: boolean;
  conversation_state?: ConversationState | string;
  conversationState?: string;
  memory_note?: string;
  memoryNote?: string;
  jarvis_intent?: JarvisIntent;
  sources?: WebSource[];
  searchQuery?: string;
  isWebSearched?: boolean;
  // Các trường tương thích ngược nếu module cũ có tham chiếu
  reply?: string;
  emotion?: EmotionData;
  memeId?: string;
  suggestedReplies?: string[];
  memoryUpdate?: Partial<UserMemoryProfile>;
}

export interface UserStyleAnalysis {
  isCapitalized: boolean;
  hasShorthand: boolean;
  wordCount: number;
  detectedShorthands: string[];
  detectedPronoun: string;
  isClosingSignal: boolean;
  styleHint: string;
}

export interface ReflexDirective {
  intentMode: 'STOP_SIGNAL' | 'PING' | 'WEB_INTEL' | 'EXPERT_JARVIS' | 'CASUAL_FRIEND';
  pronounRule: string;
  directivePrompt: string;
  dynamicMaxTokens: number;
  dynamicTimeout: number;
}

/**
 * LỚP 1 — PHẢN XẠ CỤC BỘ TRÊN MÁY (buildLocalReflexDirective)
 * Chạy cục bộ 0.001s trước khi gọi API để xuất ra ĐÚNG 1 NHÃN CHỈ ĐẠO DUY NHẤT ([DIRECTIVE])
 * Tự động tính toán dynamicMaxTokens (250 cho chat ngắn, 1200 cho code/bảng/chuyên sâu)
 * và dynamicTimeout (7000ms cho chat ngắn, 12000ms cho chuyên sâu).
 */
export function buildLocalReflexDirective(
  userText: string,
  recentHistory: any[] = [],
  isWebSearched: boolean = false
): ReflexDirective {
  const trimmed = (userText || '').trim();
  const lower = trimmed.toLowerCase();

  // 1. Nhận diện Cặp Đại Từ Xưng Hô (pronounRule)
  const recentUserTexts = (recentHistory || [])
    .filter((m) => m.role === 'user' || m.sender === 'user')
    .slice(-4)
    .map((m) => (m.text || '').toLowerCase());
  const combinedUserText = [...recentUserTexts, lower].join(' ');
  const cleanedWithoutCompounds = combinedUserText
    .replace(/\b(chi tiết|chi phi|chi phí|thu chi|chi nhánh|chi tiêu|chi trả|anh em|anh hùng|tiếng anh|anh văn)\b/gi, ' ');
  const sessionTokens = cleanedWithoutCompounds.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  // Chỉ nhận diện anh/chị khi có 'anh' hoặc 'chị', TUYỆT ĐỐI LOẠI BỎ 'chi' không dấu
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasBacChau = sessionTokens.some((w) => ['bác', 'bac', 'cháu', 'chau'].includes(w));

  let pronounRule = 'Bạn bè tự nhiên ("mình - bạn" hoặc câu tỉnh lược chủ ngữ, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM dùng từ "dạ", "vâng", "ạ", CẤM tự ý gọi "bro")';
  if (hasTM) {
    pronounRule = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM gọi "bro", CẤM "dạ/vâng/ạ")';
  } else if (hasAnhChi) {
    pronounRule = 'Đồng bộ đúng cặp đại từ của user ("anh/chị - em")';
  } else if (hasBacChau) {
    pronounRule = 'Đồng bộ đúng cặp đại từ của user ("bác - cháu")';
  } else if (hasTui) {
    pronounRule = 'Đồng bộ đúng cặp đại từ của user ("tui - bạn/ông/bà")';
  }

  // 2. Phân loại Trạng thái Phản xạ (intentMode)
  // A. STOP_SIGNAL
  const STOP_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng|ok r|để t xem)[!.? ]*$/i;
  const isStopSignal =
    STOP_PATTERNS.test(lower) ||
    ['sybau', 'cook', 'cút', 'im đi', 'im', 'ngủ đây', 'nghỉ thôi', 'thôi nhé', 'dừng'].some(
      (s) => lower === s || lower.startsWith(s + ' ')
    );

  if (isStopSignal) {
    const directivePrompt = `[DIRECTIVE: MODE=STOP_SIGNAL | ${pronounRule} | User muốn dừng/chốt câu. Chỉ đáp DUY NHẤT 1 bong bóng 1-4 chữ (VD: "okii", "rồi im :)))", "ừa nghỉ đi"). CẤM ĐẶT CÂU HỎI NGƯỢC LẠI. Trả lời văn bản thuần tự nhiên, KHÔNG dùng bảng biểu hay tiêu đề Markdown rườm rà.]`;
    return {
      intentMode: 'STOP_SIGNAL',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 250,
      dynamicTimeout: 7000,
    };
  }

  // B. PING
  const PING_PATTERNS = /^(yo+|ê+|alo+|hi+|hello+|helo+|ơi+)[!.? ]*$/i;
  if (PING_PATTERNS.test(lower)) {
    const directivePrompt = `[DIRECTIVE: MODE=PING | ${pronounRule} | Đáp 1-2 bong bóng cực ngắn (1-4 chữ/câu), không đoán mò dài dòng. Trả lời văn bản thuần tự nhiên, KHÔNG dùng bảng biểu hay tiêu đề Markdown rườm rà.]`;
    return {
      intentMode: 'PING',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 250,
      dynamicTimeout: 7000,
    };
  }

  // C. WEB_INTEL
  if (isWebSearched) {
    const directivePrompt = `[DIRECTIVE: MODE=WEB_INTEL | ${pronounRule} | Trả lời TRỰC TIẾP và CHÍNH XÁC ngay trong lượt này dựa trên dữ liệu Web đính kèm kèm URL thật. CẤM HỨA SUÔNG ("Đợi xíu", "Chờ mình chút"). Được phép sử dụng Rich Markdown (khối code \`\`\`lang, bảng biểu |...|, in đậm, danh sách, công thức) trong phần tử của mảng "replies". Khi viết code, BẮT BUỘC xuống dòng rõ ràng và thụt lề chuẩn (4 spaces Python, 2 spaces TS/JS). Lưu ý: Mỗi khối code hoặc bảng biểu phải nằm trọn vẹn trong 1 phần tử của mảng "replies", TUYỆT ĐỐI KHÔNG cắt đôi 1 khối code sang 2 phần tử khác nhau.]`;
    return {
      intentMode: 'WEB_INTEL',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 1400,
      dynamicTimeout: 12000,
    };
  }

  // D. EXPERT_JARVIS
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const expertKeywords = [
    'giải thích', 'giai thich', 'phân tích', 'phan tich', 'tại sao', 'tai sao',
    'như thế nào', 'code', 'thuật toán', 'thuat toan', 'kiến trúc', 'kien truc',
    'lập trình', 'lap trinh', 'system prompt', 'lost in the middle', 'token',
    'database', 'supabase', 'indexing', 'oop', 'kế thừa', 'đa hình', 'chứng minh',
    'viết code', 'viet code', 'lập bảng', 'lap bang', 'bảng biểu', 'bang bieu',
    'bảng so sánh', 'bang so sanh', 'bảng', 'bang', 'giải toán', 'giai toan',
    'công thức', 'cong thuc', 'toán', 'toan', 'phân tích sâu', 'phan tich sau',
    // Bổ sung toàn diện từ khóa Toán học, Khoa học & Định lý
    'định lý', 'dinh ly', 'định luật', 'dinh luat', 'bayes', 'pythagoras',
    'đạo hàm', 'dao ham', 'tích phân', 'tich phan', 'nguyên hàm', 'nguyen ham',
    'ma trận', 'ma tran', 'xác suất', 'xac suat', 'thống kê', 'thong ke',
    'phương trình', 'phuong trinh', 'hệ phương trình', 'bất đẳng thức', 'hình học',
    'đại số', 'giải tích', 'vật lý', 'vat ly', 'hóa học', 'hoa hoc', 'khoa học', 'khoa hoc',
    'newton', 'euler', 'gauss', 'vectơ', 'vector',
    'giới hạn', 'gioi han', 'cấu trúc dữ liệu', 'cau truc du lieu',
    'thuyết tương đối', 'thuyet tuong doi', 'độ phức tạp', 'do phuc tap',
    'vận tốc', 'van toc', 'gia tốc', 'gia toc',
    // Bổ sung từ khóa Thuật toán (kể cả typo 'thuật toàn') & Sinh - Hóa - Lập trình
    'thuật toàn', 'thuat toan', 'bubble sort', 'bubblesort', 'quicksort', 'mergesort',
    'đệ quy', 'de quy', 'sắp xếp', 'sap xep', 'usedebounce', 'debounce',
    'tế bào', 'te bao', 'phản ứng', 'phan ung', 'axit', 'bazo', 'chất khử', 'chất oxi hóa',
    'di truyền', 'di truyen', 'nhiễm sắc thể', 'dna', 'rna', 'sinh học', 'sinh hoc',
    // Bổ sung ngôn ngữ lập trình & câu hỏi code tiếp nối
    'ngôn ngữ c', 'ngon ngu c', 'ngôn ngữ lập trình', 'ngôn ngữ', 'ngon ngu', 'trong c', 'bằng c', 'bang c', 'code c',
    'c++', 'c#', 'python', 'java', 'golang', 'rust', 'swift', 'kotlin',
    'javascript', 'typescript', 'php', 'ruby', 'sql', 'html', 'css', 'printf', 'scanf', 'include'
  ];

  // Kiểm tra nếu lượt trước model đã trả về code hoặc thuật toán, và user hỏi tiếp nối (VD: "trong ngôn ngữ c", "còn python", "tối ưu hơn")
  const lastModelMsg = (recentHistory || [])
    .filter((m) => m.role === 'model' || m.sender === 'ai')
    .slice(-1)[0]?.text || '';
  const isCodeFollowUp =
    (lastModelMsg.includes('```') || lastModelMsg.toLowerCase().includes('thuật toán') || lastModelMsg.toLowerCase().includes('bubble sort')) &&
    (lower.includes(' c') || lower.includes('ngôn ngữ') || lower.includes('code') || lower.includes('python') || lower.includes('java') || lower.includes('viết lại') || lower.includes('tối ưu') || lower.includes('trong '));

  const hasExpertWord = expertKeywords.some((kw) => lower.includes(kw)) || trimmed.includes('```') || isCodeFollowUp;

  if (wordCount > 18 || hasExpertWord) {
    const directivePrompt = `[DIRECTIVE: MODE=EXPERT_JARVIS | ${pronounRule} | Vận hành trí tuệ sắc bén cấp độ ChatGPT/Gemini/J.A.R.V.I.S.: giải quyết triệt để, rõ ràng, sâu sắc. Được phép sử dụng Rich Markdown (khối code \`\`\`lang, bảng biểu |...|, in đậm, danh sách, công thức) trong phần tử của mảng "replies". Khi viết code, BẮT BUỘC xuống dòng rõ ràng (explicit line breaks), thụt lề chuẩn (4 spaces cho Python, 2 spaces cho TS/JS), CẤM viết dồn 1 dòng. Lưu ý: Mỗi khối code hoặc bảng biểu phải nằm trọn vẹn trong 1 phần tử của mảng "replies", TUYỆT ĐỐI KHÔNG cắt đôi 1 khối code sang 2 phần tử khác nhau.]`;
    return {
      intentMode: 'EXPERT_JARVIS',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 1400,
      dynamicTimeout: 12000,
    };
  }

  // E. CASUAL_FRIEND (Mặc định)
  const directivePrompt = `[DIRECTIVE: MODE=CASUAL_FRIEND | ${pronounRule} | Tách 1-2 bong bóng ngắn (2-12 chữ/câu), bắt đúng nhịp viết thường/viết tắt của user, có cá tính, không phỏng vấn máy móc. Trả lời văn bản thuần tự nhiên, KHÔNG dùng bảng biểu hay tiêu đề Markdown rườm rà.]`;
  return {
    intentMode: 'CASUAL_FRIEND',
    pronounRule,
    directivePrompt,
    dynamicMaxTokens: 250,
    dynamicTimeout: 7000,
  };
}

/**
 * 2. SYSTEM_INSTRUCTION: TOMORROW V4.2.3 — 3-LAYER REFLEX & FEW-SHOT DISTILLATION
 * Tinh gọn dưới 450 từ với 6 Few-Shot Examples chuẩn xác tuyệt đối (Golden Few-Shot Bank)
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tomorrow" — người bạn tri kỷ đời thường kết hợp trí tuệ sắc bén của J.A.R.V.I.S. / Gemini.

NGUYÊN TẮC CỐT LÕI:
1. Tuân thủ tuyệt đối nhãn [DIRECTIVE] và hồ sơ [MEMORY VAULT] được đính kèm ở mỗi tin nhắn.
2. KHÓA CHẶT ĐẠI TỪ & CẤM DẠ THƯA KIỂU TỔNG ĐÀI:
   - Bạn là bạn bè ngang hàng / tri kỷ thông minh, TUYỆT ĐỐI CẤM dùng từ "Dạ", "vâng", "ạ".
   - TUYỆT ĐỐI CẤM tự ý xưng "em" và gọi "anh/chị" trừ khi được chỉ định rõ trong [DIRECTIVE].
   - Khi giải thích kỹ thuật, toán học, viết code hoặc lập bảng: Đi thẳng vào nội dung súc tích, dùng câu tỉnh lược chủ ngữ hoặc xưng "t - m" / "mình - bạn". Tuyệt đối không mở đầu bằng "Dạ để em...", "Em xin gửi...".
   - CẤM tự ý gọi "bro" trừ khi user gọi trước. Đồng bộ 100% đại từ xưng hô theo [DIRECTIVE].
3. KHI VIẾT CÔNG THỨC TOÁN HỌC (như Định lý Bayes, Pythagoras, xác suất, đạo hàm, tích phân):
   - Khi viết công thức Toán học (như Định lý Bayes), ưu tiên viết bằng ký hiệu Unicode trực quan dễ đọc (VD: P(A|B) = [P(B|A) × P(A)] / P(B)) thay vì lạm dụng mã LaTeX có nhiều dấu gạch chéo ngược \frac phức tạp.
4. Khi MODE=STOP_SIGNAL (user nhắn "okk", "sybau", "cook", "thôi", "ừ"): Chỉ đáp 1 bong bóng cực ngắn (1-4 chữ), CẤM hỏi ngược lại.
5. Khi MODE=WEB_INTEL: Trả lời ngay kết quả thực tế kèm link URL từ [DỮ LIỆU WEB THỜI GIAN THỰC], CẤM câu giờ ("Chờ mình chút", "Đợi xíu nha").
6. QUY TẮC ĐỊNH DẠNG CODE VÀ BẢNG BIỂU:
   - Khi viết code (Python, TypeScript, JavaScript, C, Java, C++,...), BẮT BUỘC xuống dòng rõ ràng cho từng câu lệnh (explicit line breaks \n). TUYỆT ĐỐI CẤM viết dồn code thành 1 dòng (condensed single-line code).
   - Tuân thủ thụt lề chuẩn: 4 khoảng trắng (4 spaces) cho Python; 2 khoảng trắng (2 spaces) cho TypeScript/JavaScript/JSON; thụt lề chuẩn theo scope cho C/C++/Java.
   - Đặt trọn vẹn toàn bộ khối code \`\`\`lang ... \`\`\` trong cùng một tin nhắn (bong bóng chat).
7. QUY TẮC TRẢ LỜI KHOA HỌC TỰ NHIÊN (TOÁN, LÝ, HÓA, SINH) & THUẬT TOÁN:
   - Khoa học Tự nhiên: Luôn tuân theo 3 bước mạch lạc: Khái niệm bản chất -> Công thức / Cơ chế / Đơn vị chuẩn SI -> Ví dụ thực tế hoặc tính toán cụ thể.
   - Thuật toán & Lập trình: Phân tích độ phức tạp Big-O (Thời gian O(...) và Không gian bộ nhớ O(...)), giải thích luồng thực thi từng bước (step-by-step logic), điều kiện dừng sớm (early exit) và các trường hợp biên (edge cases). Khối code BẮT BUỘC giữ nguyên thụt lề và xuống dòng \n đầy đủ.

7 VÍ DỤ MẪU CHUẨN XÁC (GOLDEN FEW-SHOT BANK):
- Mẫu 1 [MODE=PING]:
  User: "yo"
  Output: {"conversation_state":"ping","replies":["yo","nay có vụ gì mới thế"],"session_title":"","should_update_title":false,"memory_note":""}

- Mẫu 2 [MODE=CASUAL_FRIEND | Xưng t - m | Nhớ sở thích]:
  User: "nhưng t fan ronaldo, m fan ai?"
  Output: {"conversation_state":"casual_friend","replies":["t đứng về phe cr7 cùng m luôn","bản lĩnh săn bàn đỉnh khỏi bàn :3"],"session_title":"Tranh luận thần tượng bóng đá","should_update_title":true,"memory_note":"Fan cứng Cristiano Ronaldo, xưng hô t - m"}

- Mẫu 3 [MODE=STOP_SIGNAL | Chốt câu / Đuổi khéo]:
  User: "sybau" (hoặc "okk", "cook", "thôi nghỉ")
  Output: {"conversation_state":"closing_stop","replies":["okii im ngay :)))"],"session_title":"","should_update_title":false,"memory_note":""}

- Mẫu 4 [MODE=WEB_INTEL | Kiểm chứng & Đưa đường dẫn ngay]:
  User: "check web và đưa đường dẫn vụ Jensen Huang"
  Output: {"conversation_state":"gemini_expert","replies":["Jensen Huang hiện vẫn đang giữ chức CEO điều hành Nvidia bình thường, hoàn toàn không có chuyện bị sa thải nhé.","Link nguồn kiểm chứng trực tiếp: https://news.google.com/search?q=Jensen+Huang+Nvidia"],"session_title":"Kiểm chứng thông tin CEO Nvidia","should_update_title":true,"memory_note":""}

- Mẫu 5 [MODE=CASUAL_FRIEND | Tâm sự mệt mỏi đêm khuya]:
  User: "nay ngồi fix bug oop mệt vl m ơi"
  Output: {"conversation_state":"casual_friend","replies":["căng thế, vướng chỗ kế thừa hay đa hình đấy","nghỉ mắt 5 phút đi r quăng lỗi đây t soi phụ cho"],"session_title":"Gỡ rối bug OOP đêm","should_update_title":true,"memory_note":"Đang học và làm bài tập môn OOP"}

- Mẫu 6 [MODE=EXPERT_JARVIS | Giải quyết vấn đề chuyên sâu]:
  User: "giải thích ngắn gọn tại sao nhồi quá nhiều chữ vào system prompt lại làm bot ngu đi"
  Output: {"conversation_state":"gemini_expert","replies":["Do hiện tượng 'Lost in the Middle' — khi prompt quá dài và chồng chéo, cơ chế Attention của LLM bị phân tán, dẫn đến quên luật ở giữa, xung đột giọng điệu và tăng độ trễ sinh token.","Cách chuẩn nhất là dùng code cục bộ lọc tín hiệu trước (Local Reflex) kết hợp 5-6 ví dụ Few-Shot tinh gọn."],"session_title":"Tối ưu kiến trúc System Prompt","should_update_title":true,"memory_note":"Đang tối ưu kiến trúc AI cho dự án Tomorrow"}

- Mẫu 7 [MODE=EXPERT_JARVIS | Giải thích thuật toán & Code chuẩn]:
  User: "giải thích cho tôi thuật toàn bubble sort"
  Output: {"conversation_state":"gemini_expert","replies":["Bubble Sort (Sắp xếp nổi bọt) là thuật toán sắp xếp cơ bản hoạt động bằng cách liên tục so sánh hai phần tử kề nhau và đổi chỗ nếu chúng sai thứ tự. Sau mỗi lượt lặp, phần tử lớn nhất sẽ 'nổi' dần về cuối mảng.\\n\\n• Độ phức tạp: Best Case O(n), Worst/Average Case O(n²), Không gian bộ nhớ O(1) (In-place).\\n• Tối ưu: Dùng cờ swapped để dừng sớm nếu mảng đã đúng thứ tự.","\`\`\`python\\ndef bubble_sort(arr):\\n    n = len(arr)\\n    for i in range(n):\\n        swapped = False\\n        for j in range(0, n - i - 1):\\n            if arr[j] > arr[j + 1]:\\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]\\n                swapped = True\\n        if not swapped:\\n            break\\n    return arr\\n\\n# Test thử:\\nnums = [64, 34, 25, 12, 22, 11, 90]\\nprint(bubble_sort(nums))\\n\`\`\`"],"session_title":"Giải thích thuật toán Bubble Sort","should_update_title":true,"memory_note":"Tìm hiểu thuật toán Bubble Sort"}`;

/**
 * Hàm phân tích phong cách & hành vi cục bộ (extractUserStyleLocal):
 * Phân tích trực tiếp trên thiết bị để gắn nhãn xưng hô và tín hiệu dừng chính xác.
 */
export function extractUserStyleLocal(text: string, recentChats?: ChatMessage[]): UserStyleAnalysis {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Kiểm tra viết hoa đầu câu
  const firstChar = trimmed.charAt(0);
  const isCapitalized =
    firstChar !== '' &&
    firstChar === firstChar.toUpperCase() &&
    firstChar !== firstChar.toLowerCase();

  // Kiểm tra từ viết tắt / teencode thông dụng
  const shorthandKeywords = ['t', 'm', 'k', 'r', 'dc', 'ko', 'vl', ':3'];
  const detectedShorthands: string[] = [];

  for (const kw of shorthandKeywords) {
    if (kw === ':3') {
      if (trimmed.includes(':3')) detectedShorthands.push(':3');
    } else {
      const reg = new RegExp(`(^|\\s|[.,!?;])${kw}($|\\s|[.,!?;])`, 'i');
      if (reg.test(trimmed)) detectedShorthands.push(kw);
    }
  }

  const hasShorthand = detectedShorthands.length > 0;

  // 1. PHÁT HIỆN ĐẠI TỪ XƯNG HÔ (Quét cả tin nhắn hiện tại LẪN toàn bộ phiên trò chuyện gần đây)
  const userPastTexts = (recentChats || [])
    .filter((m) => m.role === 'user' || m.sender === 'user')
    .map((m) => (m.text || '').toLowerCase());
  const combinedUserText = [...userPastTexts, lower].join(' ');

  const currentTokens = lower.split(/[\s,.;!?:~]+/).filter(Boolean);
  const cleanedWithoutCompounds = combinedUserText
    .replace(/\b(chi tiết|chi phi|chi phí|thu chi|chi nhánh|chi tiêu|chi trả|anh em|anh hùng|tiếng anh|anh văn)\b/gi, ' ');
  const sessionTokens = cleanedWithoutCompounds.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasUserBro = sessionTokens.some((w) => ['bro', 'bờ râu'].includes(w));
  // Chỉ nhận diện anh/chị khi có 'anh' hoặc 'chị', loại bỏ hoàn toàn 'chi' không dấu
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị'].includes(w));

  let detectedPronoun = '';
  if (hasTM) {
    detectedPronoun = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM gọi "bro", CẤM "dạ/vâng/ạ")';
  } else if (hasTui) {
    detectedPronoun = 'Xưng "tui" - gọi tương ứng ("ông", "bà", "bạn")';
  } else if (hasAnhChi) {
    detectedPronoun = 'Xưng "em" - gọi "anh/chị" tương ứng';
  } else if (hasUserBro) {
    detectedPronoun = 'User chủ động gọi "bro", bạn có thể gọi lại "bro" hoặc bạn bè';
  } else {
    detectedPronoun = 'Mặc định là bạn bè tự nhiên, gần gũi (dùng "mình - bạn" hoặc câu tỉnh lược chủ ngữ tự nhiên, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM "dạ/vâng/ạ", TUYỆT ĐỐI CẤM tự ý gọi "bro" trừ khi chính user gõ chữ "bro" trước)';
  }

  // 2. PHÁT HIỆN TÍN HIỆU KẾT THÚC / CHỐT CÂU / TIẾNG LÓNG ĐUỔI KHÉO (isClosingSignal)
  const CLOSING_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i;
  const isClosingSignal =
    CLOSING_PATTERNS.test(lower) ||
    ['sybau', 'cook', 'cút', 'im đi', 'im', 'ngủ đây', 'nghỉ thôi', 'thôi nhé', 'dừng'].some(
      (s) => lower === s || lower.startsWith(s + ' ')
    );

  let styleHint = `[QUY TẮC XƯNG HÔ: ${detectedPronoun}]`;
  if (isClosingSignal) {
    styleHint += `\n[TÍN HIỆU KẾT THÚC / SYBAU: User muốn dừng/chốt câu hoặc bảo im tại đây. CHỈ ĐÁP DUY NHẤT 1 BONG BÓNG CỰC NGẮN (1-4 chữ hoặc biểu cảm ":))", "rồi rồi im :)))", "okii"), TUYỆT ĐỐI CẤM HỎI NGƯỢC LẠI như "sao lại vậy", "sao bro lại sybau", CẤM DÙNG TỪ BRO]`;
  } else {
    styleHint += `\n[Gợi ý phong cách: giữ phong cách bạn bè tự nhiên, ${hasShorthand ? 'viết thường/dùng từ thân mật giống user' : 'nói chuyện thoải mái'}, CẤM DÙNG TỪ "BRO" BỪA BÃI]`;
  }

  return {
    isCapitalized,
    hasShorthand,
    wordCount,
    detectedShorthands,
    detectedPronoun,
    isClosingSignal,
    styleHint,
  };
}

/**
 * Tự động nhận diện Endpoint theo định dạng API Key:
 * - Nếu key bắt đầu bằng `AQ.`: gọi qua https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${API_KEY}
 * - Nếu key bắt đầu bằng `AIza`: gọi qua https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}
 */
export function getEndpointsForModel(model: string, apiKey: string): string[] {
  return [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
  ];
}

/**
 * Lấy bối cảnh thời gian thực chính xác trên thiết bị người dùng
 */
export function getRealTimeContext(): { realTimeContext: string; timeOfDay: string; hour: number } {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour >= 5 && hour < 11 ? 'Buổi sáng' :
    hour >= 11 && hour < 14 ? 'Buổi trưa' :
    hour >= 14 && hour < 18 ? 'Buổi chiều' :
    hour >= 18 && hour < 23 ? 'Buổi tối' : 'Đêm khuya';
  const realTimeContext = `[Thời gian thực hiện tại của người dùng: ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} (${timeOfDay}) - Ngày ${now.toLocaleDateString('vi-VN')}]`;
  return { realTimeContext, timeOfDay, hour };
}

/**
 * Ghép SYSTEM_INSTRUCTION với thời gian thực, Lớp 2 Memory Vault và lịch sử tin nhắn gần nhất
 */
function buildSystemPrompt(
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  previousSessionMessages?: ChatMessage[],
  userStyleHint?: string
): string {
  const { realTimeContext } = getRealTimeContext();
  const vault = getVaultFromProfile(userMemory);
  const recentContext = recentChats
    .slice(-6)
    .map((m) => `${(m.role === 'user' || m.sender === 'user') ? 'User' : 'Tomorrow'}: ${m.text}`)
    .join('\n');

  let prompt = `${SYSTEM_INSTRUCTION}\n\n${realTimeContext}\n\n[MEMORY VAULT]:\n${JSON.stringify(vault)}`;

  if (userStyleHint) {
    prompt += `\n\n${userStyleHint}`;
  }

  // Nếu là phiên mới hoặc tin nhắn còn ít, đính kèm 3 tin nhắn cuối của phiên trước đó
  if (recentChats.length <= 2 && previousSessionMessages && previousSessionMessages.length > 0) {
    const prevContext = previousSessionMessages
      .slice(-3)
      .map((m) => `${(m.role === 'user' || m.sender === 'user') ? 'User' : 'Tomorrow'}: ${m.text}`)
      .join('\n');
    prompt += `\n\n[BỐI CẢNH 3 TIN NHẮN CUỐI CỦA PHIÊN GẦN NHẤT]:\n${prevContext}\n(Lưu ý: Bạn và người dùng đã nói chuyện này ở phiên trước, hãy nhớ ngữ cảnh như một người bạn thật sự)`;
  }

  if (recentContext) {
    prompt += `\n\n[LỊCH SỬ TIN NHẮN PHIÊN HIỆN TẠI]:\n${recentContext}`;
  }

  return prompt;
}

export interface NormalizedChatMessage {
  role: 'user' | 'model' | 'assistant';
  text: string;
  imageBase64?: string;
}

/**
 * Phát hiện các câu thông báo lỗi mạng / ngắt kết nối để lọc bỏ khỏi lịch sử trò chuyện
 */
export function isNetworkErrorMessage(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('mạng bên t đang hơi lag') ||
    lower.includes('mạng bên mình đang hơi lag') ||
    lower.includes('hơi lag chút') ||
    lower.includes('trục trặc kết nối mạng') ||
    lower.includes('gián đoạn kết nối') ||
    lower.includes('kết nối mạng một chút') ||
    lower.includes('bị gián đoạn kết nối') ||
    lower.includes('mạng chập chờn') ||
    lower.includes('kiểm tra kết nối') ||
    lower.includes('watchdog_timeout') ||
    lower.includes('network error') ||
    lower.includes('lỗi hệ thống') ||
    lower.includes('loi he thong') ||
    lower.includes('chưa nhận được phản hồi từ ai') ||
    lower.includes('hệ thống chưa kết nối được ai')
  );
}

/**
 * Chuẩn hóa lịch sử hội thoại trước khi gửi lên API (OpenAI / Gemini) — normalizeHistoryForAPI:
 * - Lọc bỏ thông báo lỗi mạng cũ, lỗi hệ thống và tin nhắn rỗng.
 * - Loại bỏ tin nhắn người dùng cuối bị trùng lặp nếu recentChats đã chứa tin nhắn hiện tại.
 * - Nếu trong lịch sử cũ có khối code dài (> 400 ký tự) ở các lượt xa (> 4 lượt gần nhất), rút gọn để tiết kiệm token và tránh tràn context.
 * - Đảm bảo tin nhắn đầu tiên gửi đến API LUÔN có role 'user'.
 * - Gộp TẤT CẢ các tin nhắn liên tiếp cùng role (đặc biệt là các bong bóng model kề nhau) thành 1 tin nhắn duy nhất (nối bằng \n\n).
 * - Đảm bảo tin nhắn cuối cùng trong mảng gửi lên API luôn là tin nhắn hiện tại của user.
 */
export function normalizeHistoryForAPI(
  recentChats: ChatMessage[] = [],
  currentText: string = '',
  currentImageBase64?: string,
  target: 'gemini' | 'openai' = 'gemini'
): NormalizedChatMessage[] {
  // 1. Lọc bỏ các tin nhắn lỗi mạng/hệ thống và tin nhắn hoàn toàn rỗng
  const valid = (recentChats || []).filter((m) => {
    if (!m) return false;
    const txt = m.text || '';
    if (isNetworkErrorMessage(txt)) return false;
    if (!txt.trim() && !m.imageBase64 && !m.imageUri) return false;
    return true;
  });

  // 2. Tránh trùng lặp tin nhắn cuối nếu recentChats đã chứa tin nhắn người dùng của lượt hiện tại
  if (valid.length > 0 && currentText.trim()) {
    const last = valid[valid.length - 1];
    const isUser = last.role === 'user' || last.sender === 'user';
    if (isUser && last.text) {
      const lastTrim = last.text.trim();
      const currTrim = currentText.trim();
      if (lastTrim === currTrim || currTrim.startsWith(lastTrim) || lastTrim.startsWith(currTrim)) {
        valid.pop();
      }
    }
  }

  // 3. Rút gọn các khối code quá dài (> 400 ký tự) ở các lượt cũ (ngoài 4 tin nhắn gần nhất)
  const historyLen = valid.length;
  const pruned = valid.map((m, idx) => {
    // Chỉ giữ nguyên vẹn 4 tin nhắn gần nhất
    if (idx < historyLen - 4 && m.text && m.text.length > 400) {
      const text = m.text;
      const shortened = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]{300,})```/g, (_match, lang, code) => {
        const lines = code.split('\n');
        const preview = lines.slice(0, 5).join('\n');
        return `\`\`\`${lang}\n${preview}\n... [đã rút gọn khối code cũ]\n\`\`\``;
      });
      return { ...m, text: shortened };
    }
    return m;
  });

  // 4. Chuyển đổi role theo target API
  const mapped: NormalizedChatMessage[] = pruned.map((m) => {
    const isUser = m.role === 'user' || m.sender === 'user';
    return {
      role: isUser ? 'user' : (target === 'gemini' ? 'model' : 'assistant'),
      text: m.text || '',
      imageBase64: m.imageBase64,
    };
  });

  // 5. Đảm bảo tin nhắn đầu tiên LUÔN là role 'user' (loại bỏ các tin chào/model ở đầu)
  while (mapped.length > 0 && mapped[0].role !== 'user') {
    mapped.shift();
  }

  // 6. Gộp TẤT CẢ các tin nhắn liên tiếp cùng role thành 1 tin nhắn duy nhất (nối bằng \n\n)
  const merged: NormalizedChatMessage[] = [];
  for (const msg of mapped) {
    if (merged.length === 0) {
      merged.push({ ...msg });
    } else {
      const prev = merged[merged.length - 1];
      if (prev.role === msg.role) {
        prev.text = prev.text ? `${prev.text}\n\n${msg.text}` : msg.text;
        if (msg.imageBase64 && !prev.imageBase64) {
          prev.imageBase64 = msg.imageBase64;
        }
      } else {
        merged.push({ ...msg });
      }
    }
  }

  // 7. Đảm bảo tin nhắn hiện tại của người dùng LUÔN ở cuối cùng với role 'user'
  if (currentText.trim() || currentImageBase64) {
    const userRole: 'user' = 'user';
    if (merged.length > 0 && merged[merged.length - 1].role === userRole) {
      merged[merged.length - 1].text = currentText;
      if (currentImageBase64) {
        merged[merged.length - 1].imageBase64 = currentImageBase64;
      }
    } else {
      merged.push({
        role: userRole,
        text: currentText,
        imageBase64: currentImageBase64,
      });
    }
  }

  return merged;
}

export const normalizeChatHistory = normalizeHistoryForAPI;

/**
 * Làm sạch văn bản đàm thoại nhưng bảo toàn tuyệt đối 100% các khối code ```lang ... ```
 * Không bao giờ áp dụng gom khoảng trắng \s{2,} hoặc xóa từ bên trong khối code.
 * Ở ngoài khối code, chỉ gom các khoảng trắng ngang liên tiếp [^\S\r\n]{2,} thành ' ',
 * bảo toàn nguyên vẹn tất cả dấu xuống dòng \n và \r.
 */
export function cleanReplyPreservingCode(rep: string, cleanerFn: (text: string) => string): string {
  if (!rep) return '';
  const parts = rep.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, index) => {
      // Index lẻ là các khối code được chụp bởi regex -> BẢO TOÀN NGUYÊN VẸN 100%
      if (index % 2 === 1) {
        return part;
      }
      // Index chẵn là văn bản trò chuyện thông thường:
      let text = cleanerFn(part);
      // Chỉ gộp khoảng trắng ngang (spaces, tabs), TUYỆT ĐỐI KHÔNG nuốt \n hoặc \r
      text = text.replace(/[^\S\r\n]{2,}/g, ' ');
      return text;
    })
    .join('');
}

/**
 * 2. GỌI OPENAI API (gpt-4o-mini) SIÊU TỐC VỚI CIRCUIT BREAKER & DYNAMIC TIMEOUT
 * Cấp phát động max_tokens (250 cho chat ngắn, 1200 cho code/bảng/chuyên sâu)
 * và timeout (7000ms cho chat ngắn, 12000ms cho chuyên sâu).
 */
async function callOpenAI(
  systemPrompt: string,
  userMessageWithHint: string,
  recentChats: ChatMessage[],
  imageBase64?: string,
  maxTokens: number = 250,
  timeoutMs: number = 7000
): Promise<string> {
  const effectiveTimeout = Math.min(timeoutMs, 5000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const normalizedHistory = normalizeChatHistory(recentChats, userMessageWithHint, imageBase64, 'openai');

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...normalizedHistory.map((m) => {
        if (m.imageBase64) {
          const clean = m.imageBase64.startsWith('data:')
            ? m.imageBase64
            : `data:image/jpeg;base64,${m.imageBase64}`;
          return {
            role: m.role,
            content: [
              { type: 'text', text: m.text },
              { type: 'image_url', image_url: { url: clean, detail: 'low' } },
            ],
          };
        }
        return {
          role: m.role,
          content: m.text,
        };
      }),
    ];

    const payload = {
      model: 'gpt-4o-mini',
      temperature: 0.75,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: openAiMessages,
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const status = res.status;
      isOpenAIUnavailable = true;
      console.warn(`[OpenAI Circuit Breaker]: HTTP ${status}, switching silently to Gemini chain.`);
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${status}: ${errText.slice(0, 100)}`);
    }

    const data: any = await res.json();
    const rawText = data?.choices?.[0]?.message?.content || '';

    if (!rawText) throw new Error('OpenAI returned empty message content');
    return rawText;
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      isOpenAIUnavailable = true;
      console.warn(`[OpenAI Timeout]: ${effectiveTimeout}ms timeout reached, aborting and switching silently to Gemini chain.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ExecuteApiCallResult {
  text: string;
  groundingSources?: WebSource[];
}

/**
 * Thực hiện 1 lượt gọi API tới 1 URL cụ thể kèm dynamic timeout qua AbortController
 * maxOutputTokens linh hoạt (800 / 1200) và hỗ trợ trích xuất Google Search Grounding metadata
 */
async function executeApiCall(
  url: string,
  systemPrompt: string,
  userMessageWithHint: string,
  imageBase64?: string,
  enableGrounding: boolean = false,
  maxTokens: number = 800,
  timeoutMs: number = TIMEOUT_MS,
  recentChats: ChatMessage[] = []
): Promise<ExecuteApiCallResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const normalized = normalizeChatHistory(recentChats, userMessageWithHint, imageBase64, 'gemini');

    const geminiContents = normalized.map((m) => {
      const parts: any[] = [{ text: m.text }];
      if (m.imageBase64) {
        const cleanBase64 = m.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        parts.unshift({
          inline_data: {
            mime_type: 'image/jpeg',
            data: cleanBase64,
          },
        });
      }
      return {
        role: m.role as 'user' | 'model',
        parts,
      };
    });

    const generationConfig: any = {
      temperature: 0.7,
      maxOutputTokens: maxTokens,
    };

    const payload: any = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: geminiContents,
    };

    // QUY TẮC SỐNG CÒN: Google Gemini API ném lỗi 400 Bad Request nếu bật cả google_search VÀ responseMimeType: 'application/json' cùng lúc!
    if (enableGrounding) {
      payload.tools = [{ google_search: {} }];
      // TUYỆT ĐỐI KHÔNG gán responseMimeType: 'application/json' khi có tools google_search
    } else {
      generationConfig.responseMimeType = 'application/json';
    }

    payload.generationConfig = generationConfig;

    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // Nếu endpoint không hỗ trợ tools google_search (400 Bad Request), tự động thử lại không dùng tools
    if (!res.ok && enableGrounding && res.status === 400) {
      delete payload.tools;
      payload.generationConfig.responseMimeType = 'application/json';
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    }

    if (res.ok) {
      let data: any;
      try {
        data = await res.json();
      } catch {
        const rawResponse = await res.text().catch(() => '');
        const parsed = safeParseAIJson(rawResponse);
        if (parsed?.replies && parsed.replies.length > 0) {
          return { text: rawResponse, groundingSources: [] };
        }
      }

      if (data) {
        const candidateObj = Array.isArray(data) ? data[data.length - 1] : data;
        let text = '';
        const candidate = candidateObj?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        // Lọc bỏ các part thinking/thought và lấy phần text nội dung thực sự
        const textParts = parts.filter((p: any) => !p.thought && p.text);
        if (textParts.length > 0) {
          text = textParts.map((p: any) => p.text).join('\n');
        } else if (parts.length > 0 && parts[0]?.text) {
          text = parts[parts.length - 1]?.text || parts[0]?.text || '';
        }

        const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
        const groundingSources: WebSource[] = [];

        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            if (chunk?.web?.uri && chunk?.web?.title) {
              groundingSources.push({
                title: chunk.web.title,
                url: chunk.web.uri,
                source: 'Google Grounding',
              });
            }
          }
        }

        if (text) return { text, groundingSources };
      }
    }

    const errStatus = res.status;
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${errStatus}: ${errText.slice(0, 100)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Logic Fallback & Timeout theo Model Fallback Chain
 */
async function callModelFallbackChain(
  apiKey: string,
  systemPrompt: string,
  userMessageWithHint: string,
  imageBase64?: string,
  enableGrounding: boolean = false,
  maxTokens: number = 800,
  timeoutMs: number = TIMEOUT_MS,
  recentChats: ChatMessage[] = []
): Promise<ExecuteApiCallResult> {
  let lastError: any = null;

  for (const model of FREE_MODEL_CHAIN) {
    const endpoints = getEndpointsForModel(model, apiKey);

    for (const url of endpoints) {
      try {
        const result = await executeApiCall(
          url,
          systemPrompt,
          userMessageWithHint,
          imageBase64,
          enableGrounding,
          maxTokens,
          timeoutMs,
          recentChats
        );
        if (result && result.text) {
          return result;
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        console.warn(`[AI Fallback Chain] Model "${model}" gặp lỗi (${msg}), tự động fallback sang tầng tiếp theo...`);
      }
    }
  }

  throw lastError || new Error('Tất cả model trong Free Model Chain đều tạm thời bận.');
}

/**
 * Bộ ghép nối an toàn cho mảng replies (sanitizeAndMergeBrokenBlocks):
 * Tự động kiểm tra nếu có phần tử nào mở dấu ``` mà chưa đóng dấu ``` ở cùng phần tử đó
 * -> tự động nối gộp với phần tử kế tiếp để khối code luôn nguyên vẹn 100%.
 */
export function sanitizeAndMergeBrokenBlocks(replies: string[]): string[] {
  if (!Array.isArray(replies) || replies.length === 0) return [];

  const merged: string[] = [];
  let currentAccumulator = '';
  let inCodeBlock = false;

  for (let i = 0; i < replies.length; i++) {
    const rawItem = replies[i];
    const item = typeof rawItem === 'string' ? rawItem : String(rawItem ?? '');
    if (!item.trim() && !inCodeBlock) continue;

    if (inCodeBlock) {
      currentAccumulator += '\n' + item;
      const count = (item.match(/```/g) || []).length;
      if (count % 2 !== 0) {
        // Đã đóng khối code bị ngắt
        inCodeBlock = false;
        merged.push(currentAccumulator.trim());
        currentAccumulator = '';
      }
    } else {
      const count = (item.match(/```/g) || []).length;
      if (count % 2 !== 0) {
        // Mở dấu ``` nhưng chưa đóng dấu ``` ở cùng phần tử đó
        inCodeBlock = true;
        currentAccumulator = item;
      } else {
        merged.push(item);
      }
    }
  }

  if (inCodeBlock && currentAccumulator) {
    // Nếu hết danh sách mà vẫn chưa đóng, tự động bổ sung ``` để khối code trọn vẹn
    merged.push(currentAccumulator.trim() + '\n```');
  }

  return merged;
}

/**
 * Bộ tiền xử lý chuẩn hóa ký tự LaTeX & JSON Auto-Repair theo máy trạng thái (State Machine).
 * 1. Bảo vệ các từ khóa LaTeX bắt đầu bằng ký tự điều khiển JSON (\frac -> \f, \times -> \t, \begin -> \b, \right -> \r, etc.).
 * 2. Tự động double-escape các dấu \ không hợp lệ trong chuỗi JSON (\sqrt, \alpha, \sum, \int, \cdot, etc.).
 * 3. Chuyển đổi ký tự điều khiển raw (\n, \r, \t) bên trong chuỗi kép thành escape an toàn.
 * 4. Tự động đóng ngoặc kép, ngoặc vuông, ngoặc nhọn nếu chuỗi bị cắt cụt đuôi (truncated tokens).
 */
export function repairJsonWithLatexAndControls(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw;

  // 1. Bảo vệ các từ khóa LaTeX dễ bị JSON.parse nuốt thành control characters
  let str = raw.replace(
    /(?<!\\)\\(frac|times|text|textbf|textit|mathrm|mathbf|theta|tau|tan|to|tilde|begin|beta|bar|bf|right|rho|rangle|nabla|neq|nu|forall)\b/g,
    '\\\\$1'
  );

  let inString = false;
  let result = '';
  let i = 0;

  while (i < str.length) {
    const ch = str[i];

    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      i++;
      continue;
    }

    // Đang ở trong chuỗi kép
    if (ch === '"') {
      inString = false;
      result += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      const next = str[i + 1];
      if (next === undefined) {
        result += '\\\\';
        i++;
        continue;
      }
      if (next === '\\') {
        result += '\\\\';
        i += 2;
        continue;
      }
      const isValidSingle = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(next);
      const isUnicode = next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.slice(i + 2, i + 6));
      if (isValidSingle || isUnicode) {
        result += '\\' + next;
        i += next === 'u' ? 6 : 2;
      } else {
        result += '\\\\';
        i++;
      }
      continue;
    }

    if (ch === '\n') {
      result += '\\n';
      i++;
      continue;
    }
    if (ch === '\r') {
      result += '\\r';
      i++;
      continue;
    }
    if (ch === '\t') {
      result += '\\t';
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  if (inString) {
    result += '"';
  }

  let repaired = result.trim().replace(/,\s*$/, '');
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    repaired += ']'.repeat(openBrackets - closeBrackets);
  }
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }

  return repaired;
}

/**
 * Bộ giải mã JSON Bất Tử (safeParseAIJson) — KHÔNG BAO GIỜ ĐƯỢC throw Error:
 * Dù AI trả về bất kỳ chuỗi gì (dù hỏng JSON vì công thức LaTeX \frac, P(A|B) hay văn bản thường),
 * hàm vẫn LUÔN trả về object hợp lệ chứa nội dung thật của AI, tuyệt đối không throw lỗi và không trả về câu vô nghĩa.
 */
export function safeParseAIJson(rawText: string): any {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      conversation_state: 'casual_friend',
      replies: ['nghe đây'],
      session_title: '',
      should_update_title: false,
      memory_note: '',
    };
  }

  // Tầng 1: Tiền xử lý phục hồi chuẩn qua máy trạng thái repairJsonWithLatexAndControls
  try {
    const repaired = repairJsonWithLatexAndControls(trimmed);
    const direct = JSON.parse(repaired);
    if (direct && Array.isArray(direct.replies) && direct.replies.length > 0) {
      return {
        conversation_state: direct.conversation_state || 'expert_jarvis',
        replies: sanitizeAndMergeBrokenBlocks(direct.replies.map((r: any) => String(r))),
        session_title: direct.session_title || '',
        should_update_title: Boolean(direct.should_update_title),
        memory_note: direct.memory_note || '',
      };
    }
  } catch (_) {}

  // Tầng 1b: Thử parse trực tiếp nếu JSON đã hợp lệ
  try {
    const direct = JSON.parse(trimmed);
    if (direct && Array.isArray(direct.replies) && direct.replies.length > 0) {
      return {
        conversation_state: direct.conversation_state || 'expert_jarvis',
        replies: sanitizeAndMergeBrokenBlocks(direct.replies.map((r: any) => String(r))),
        session_title: direct.session_title || '',
        should_update_title: Boolean(direct.should_update_title),
        memory_note: direct.memory_note || '',
      };
    }
  } catch (_) {}

  // Tầng 2: Cắt từ dấu { đầu tiên đến dấu } cuối cùng và sửa các dấu \ và control char của LaTeX
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);

    // Tiền xử lý phục hồi chuẩn qua máy trạng thái repairJsonWithLatexAndControls
    try {
      const repaired = repairJsonWithLatexAndControls(jsonSlice);
      const parsed = JSON.parse(repaired);
      if (parsed && Array.isArray(parsed.replies) && parsed.replies.length > 0) {
        return {
          conversation_state: parsed.conversation_state || 'expert_jarvis',
          replies: sanitizeAndMergeBrokenBlocks(parsed.replies.map((r: any) => String(r))),
          session_title: parsed.session_title || '',
          should_update_title: Boolean(parsed.should_update_title),
          memory_note: parsed.memory_note || '',
        };
      }
    } catch (_) {}

    try {
      // Bảo vệ các lệnh LaTeX phổ biến như \frac, \times, \sqrt, \cdot, \sum, \pi, \Rightarrow
      const fixedLatex = jsonSlice
        .replace(/\\(?![/u"\\bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')
        .replace(/\\(frac|times|tet|text|theta|tau|to|top|triangle|neq|nabla|nu|beta|binom|Box|right|rightarrow|Rightarrow|rho|alpha|cdot|sum|int|pm|partial|infty|approx|sim|le|ge|leq|geq)/g, '\\\\$1');
      const parsed = JSON.parse(fixedLatex);
      if (parsed && Array.isArray(parsed.replies) && parsed.replies.length > 0) {
        return {
          conversation_state: parsed.conversation_state || 'expert_jarvis',
          replies: sanitizeAndMergeBrokenBlocks(parsed.replies.map((r: any) => String(r))),
          session_title: parsed.session_title || '',
          should_update_title: Boolean(parsed.should_update_title),
          memory_note: parsed.memory_note || '',
        };
      }
    } catch (_) {}

    // Tầng 3: Dùng Regex bóc trực tiếp mảng "replies": [ ... ] dù JSON bị lỗi cú pháp ở giữa
    const repliesMatch = jsonSlice.match(/"replies"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"(?:session_title|should_update_title|memory_note|conversation_state)"|\s*\})/);
    if (repliesMatch && repliesMatch[1]) {
      const rawItems = repliesMatch[1]
        .split(/",\s*"/)
        .map(s => s.replace(/^\s*"|"\s*$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim())
        .filter(Boolean);
      if (rawItems.length > 0) {
        const titleMatch = jsonSlice.match(/"session_title"\s*:\s*"([^"]*)"/);
        return {
          conversation_state: 'expert_jarvis',
          replies: sanitizeAndMergeBrokenBlocks(rawItems),
          session_title: titleMatch ? titleMatch[1] : '',
          should_update_title: Boolean(titleMatch && titleMatch[1]),
          memory_note: '',
        };
      }
    }
  }

  // Tầng 3b: Chống sập khi code C/C++/Java chứa printf("...\n"), dấu ngoặc kép hoặc thoát ký tự hỏng JSON:
  let fallbackExtract = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\s*\{\s*"conversation_state"\s*:\s*"[^"]*"\s*,\s*"replies"\s*:\s*\[\s*"/i, '')
    .replace(/"\s*\]\s*,\s*"session_title"[\s\S]*$/i, '')
    .replace(/"\s*\]\s*,\s*"should_update_title"[\s\S]*$/i, '')
    .replace(/"\s*\]\s*\}?\s*$/i, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();

  // Nếu vẫn còn sót chuỗi JSON bọc ngoài do cú pháp lộn xộn
  if (fallbackExtract.startsWith('{') && fallbackExtract.includes('"replies"')) {
    const match = fallbackExtract.match(/"replies"\s*:\s*\[\s*"([\s\S]*)/i);
    if (match && match[1]) {
      fallbackExtract = match[1]
        .replace(/"\s*\][\s\S]*$/i, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .trim();
    }
  }

  if (fallbackExtract.length > 0 && !fallbackExtract.startsWith('{')) {
    return {
      conversation_state: 'expert_jarvis',
      replies: [fallbackExtract],
      session_title: '',
      should_update_title: false,
      memory_note: '',
    };
  }

  // Tầng 4 (Chốt chặn cuối cùng): Làm sạch vỏ bọc ```json ... ``` và trả thẳng nội dung văn bản cho người dùng
  const cleanedPlain = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return {
    conversation_state: 'expert_jarvis',
    replies: [cleanedPlain || 'nghe đây'],
    session_title: '',
    should_update_title: false,
    memory_note: '',
  };
}

/**
 * Phân tích JSON chuẩn hóa: trích xuất "conversation_state", "replies", "session_title", "should_update_title", "memory_note"
 */
export function parseAIResponseJson(
  raw: string,
  userText?: string,
  recentChats?: ChatMessage[],
  webSearchSources?: WebSource[]
): AIResponsePayload | null {
  try {
    const parsed = safeParseAIJson(raw);
    if (!parsed) return null;

    if (parsed) {
      let replies: string[] = [];
      if (Array.isArray(parsed.replies)) {
        replies = parsed.replies
          .filter((r: unknown) => typeof r === 'string' && (r as string).trim().length > 0)
          .map((r: string) => r.trim());
      } else if (typeof parsed.reply === 'string' && parsed.reply.trim().length > 0) {
        replies = [parsed.reply.trim()];
      }

      replies = sanitizeAndMergeBrokenBlocks(replies);

      if (replies.length > 0) {
        const memoryNote = (parsed.memory_note || parsed.memoryNote || '').trim();
        let rawTitle = (parsed.session_title || parsed.sessionTitle || '').trim();
        let sessionTitle = isPlaceholderOrNoiseTitle(rawTitle) ? '' : rawTitle;

        const rawState = (parsed.conversation_state || parsed.conversationState || '').trim();
        const validStates = [
          'ping',
          'active_chat',
          'casual_friend',
          'gemini_expert',
          'deep_work',
          'emotional_support',
          'soft_close',
          'hard_close',
          'closing_stop',
        ];
        let conversation_state = validStates.includes(rawState) ? rawState : 'casual_friend';

        let should_update_title =
          parsed.should_update_title === true ||
          parsed.should_update_title === 'true' ||
          parsed.shouldUpdateTitle === true;

        const userClean = (userText || '').toLowerCase().trim();

        // 1. PHÒNG THỦ TUYỆT ĐỐI CHO TÍN HIỆU KẾT THÚC / DỪNG / TIẾNG LÓNG (closing_stop)
        const isUserClosing =
          conversation_state === 'closing_stop' ||
          conversation_state === 'soft_close' ||
          conversation_state === 'hard_close' ||
          /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i.test(userClean) ||
          userClean.includes('sybau') ||
          userClean.includes('cook') ||
          userClean === 'cút' ||
          userClean === 'im' ||
          userClean.startsWith('im ');

        if (isUserClosing) {
          conversation_state = 'closing_stop';
          sessionTitle = '';
          should_update_title = false;

          let singleReply = '';
          if (userClean.includes('sybau') || userClean.includes('im')) {
            singleReply = 'rồi rồi im :)))';
          } else if (userClean.includes('cook') || userClean.includes('cút')) {
            singleReply = 'rồi rồi đi đây :)))';
          } else if (userClean.includes('nghỉ') || userClean.includes('ngủ')) {
            singleReply = 'ừa nghỉ đi';
          } else if (userClean.includes('thử') || userClean.includes('test')) {
            singleReply = 'ok triển đi nhé';
          } else if (userClean.includes('cảm ơn') || userClean.includes('thank')) {
            singleReply = 'ok cần gì cứ ới';
          } else {
            singleReply = 'okii';
          }
          replies = [singleReply];
        }

        // 2. PHÒNG THỦ CHO CÂU ĐÙA DỌA XOÁ APP ("t xoá m bây giờ")
        const isJokingThreat = /(xoá|xóa|xoa)\s+(m|mày|app|may)/i.test(userClean);
        if (isJokingThreat) {
          replies = ['thôi đừng xoá mà :)))'];
        }

        // 3. LỌC TỪ "BRO" BỪA BÃI XUYÊN SUỐT TOÀN BỘ PHIÊN HỘI THOẠI
        const userHistoryTexts = (recentChats || [])
          .filter((m) => m.role === 'user' || m.sender === 'user')
          .map((m) => (m.text || '').toLowerCase());
        const allUserText = [...userHistoryTexts, userClean].join(' ');
        const userExplicitlyUsedBro = /\bbro\b/i.test(allUserText);
        const isTMMode = ['t', 'm', 'tao', 'mày', 'may'].some((w) => allUserText.split(/[\s,.;!?:~]+/).includes(w));

        if (!userExplicitlyUsedBro || isTMMode) {
          replies = replies.map((rep) =>
            cleanReplyPreservingCode(rep, (t) => t.replace(/\bbro\b/gi, '')).trim()
          );
        }

        // 3.5. BỘ LỌC KHÓA ĐẠI TỪ & DỌN SẠCH TÀN DƯ LỄ PHÉP (BẢO TOÀN KHỐI CODE)
        const cleanedAllUserText = allUserText.replace(/\b(chi tiết|chi phi|chi phí|thu chi|chi nhánh|chi tiêu|chi trả|anh em|anh hùng|tiếng anh|anh văn)\b/gi, ' ');
        const userPronounTokens = cleanedAllUserText.split(/[\s,.;!?:~]+/).filter(Boolean);
        const isExplicitAnhChiMode = !isTMMode && userPronounTokens.some((w) => ['anh', 'chị'].includes(w));

        replies = replies.map((rep) => {
          return cleanReplyPreservingCode(rep, (text) => {
            let clean = text;
            // Xóa các cụm mở đầu lễ phép: "Dạ, để em...", "Dạ để em...", "Dạ em...", "Dạ...", "Vâng để em..."
            clean = clean.replace(/^(dạ\s*,?\s*(để\s*em|em\s*xin|em\s*lập|em\s*gửi|em)?\s*)/iu, '');
            clean = clean.replace(/^(vâng\s*,?\s*(để\s*em|em\s*xin|em\s*lập|em\s*gửi|em)?\s*)/iu, '');
            // Xóa các từ 'dạ', 'ạ' lọt giữa câu hoặc cuối câu bằng Unicode Lookaround
            clean = clean.replace(/(?<!\p{L})(dạ|ạ)(?!\p{L})/giu, '');

            // Khóa đại từ: Nếu không phải chế độ anh-em rõ ràng, chuyển hóa thành bạn bè hoặc t-m
            if (!isExplicitAnhChiMode) {
              clean = clean.replace(/(?<!\p{L})(anh\/chị|anh\s+chị)(?!\p{L})/giu, isTMMode ? 'm' : 'bạn');
              clean = clean.replace(/(?<!\p{L})(em)(?!\p{L})/giu, isTMMode ? 't' : 'mình');
            }
            return clean;
          }).trim();
        });

        // 4. BỘ LỌC CHẶN CÂU GIỜ / HỨA SUÔNG (ANTI-STALLING FILTER)
        const STALLING_REGEX = /^(chờ|đợi)\s*(mình|t|tui|em|xíu|chút|tí)|kiểm tra (ngay|xong liền)|để (mình|t|tui) (check|kiểm tra|tìm)/i;
        const hasStallingPhrase = replies.some((rep) => STALLING_REGEX.test(rep.trim()) && !rep.includes('http'));

        if (hasStallingPhrase) {
          if (webSearchSources && webSearchSources.length > 0) {
            const topSource = webSearchSources[0];
            const hasUserAskedLink = /(đường dẫn|link|nguồn|dẫn chứng)/i.test(userClean);
            let substantiveAnswer = `Theo thông tin kiểm chứng mới nhất: ${topSource.snippet || topSource.title}.`;
            if (hasUserAskedLink || topSource.url) {
              substantiveAnswer += `\nĐường dẫn nguồn: ${topSource.url}`;
            }
            replies = [substantiveAnswer];
          } else {
            replies = ['Chủ đề này mình có thể chia sẻ theo góc nhìn thực tế nhé.'];
          }
        } else if (/(đường dẫn|link|nguồn|dẫn chứng)/i.test(userClean) && webSearchSources && webSearchSources.length > 0) {
          // Nếu user xin link cụ thể mà câu trả lời chưa đính kèm link https://
          const hasAnyUrl = replies.some((r) => r.includes('http'));
          if (!hasAnyUrl && webSearchSources[0]?.url) {
            replies[replies.length - 1] = `${replies[replies.length - 1]}\nĐường dẫn tham khảo: ${webSearchSources[0].url}`;
          }
        }

        const rawIntent = (parsed.jarvis_intent || parsed.jarvisIntent || 'chat').trim();
        const validIntents: JarvisIntent[] = ['chat', 'work_assist', 'emotional_support', 'system_command'];
        const jarvisIntent: JarvisIntent = validIntents.includes(rawIntent as JarvisIntent)
          ? (rawIntent as JarvisIntent)
          : (conversation_state === 'gemini_expert' || conversation_state === 'deep_work'
              ? 'work_assist'
              : (conversation_state === 'emotional_support' ? 'emotional_support' : 'chat'));

        return {
          replies,
          reply: replies[0],
          session_title: sessionTitle,
          sessionTitle,
          should_update_title,
          shouldUpdateTitle: should_update_title,
          conversation_state,
          conversationState: conversation_state,
          memory_note: memoryNote,
          memoryNote,
          jarvis_intent: jarvisIntent,
          sources: webSearchSources || [],
          memoryUpdate: memoryNote
            ? {
                currentProblem: memoryNote,
                summary: memoryNote,
              }
            : undefined,
        };
      }
    }
  } catch (e) {
    console.warn('[AI] Lỗi phân tích JSON:', e);
  }
  return null;
}

/**
 * Local Resilient Fallback Engine — Phản hồi cục bộ thông minh khi offline/mất mạng
 * Áp dụng triệt để: Mặc định là bạn, không dùng "bro" bừa bãi, hiểu tiếng lóng sybau/cook và dừng dứt khoát.
 */
export function localResilientFallback(userMessage: string, hasImage?: boolean, userMemory?: UserMemoryProfile): AIResponsePayload {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const hasUserBro = /\bbro\b/i.test(lower);
  const vault = getVaultFromProfile(userMemory);

  if (hasImage) {
    return {
      replies: ['ảnh gì đây', 'giao diện hay bug cần soi à :3'],
      reply: 'ảnh gì đây',
      session_title: 'Trao đổi về hình ảnh',
      sessionTitle: 'Trao đổi về hình ảnh',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Vừa chia sẻ hình ảnh',
      memoryNote: 'Vừa chia sẻ hình ảnh',
      jarvis_intent: 'work_assist',
    };
  }

  // 1. TÍN HIỆU KẾT THÚC / DỪNG / TIẾNG LÓNG ("sybau", "cook", "cút", "im", "okk")
  if (lower.includes('sybau') || lower.includes('im đi') || lower === 'im') {
    return {
      replies: ['rồi rồi im :)))'],
      reply: 'rồi rồi im :)))',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'closing_stop',
      conversationState: 'closing_stop',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  if (lower.includes('cook') || lower === 'cút' || lower.startsWith('cút')) {
    return {
      replies: ['rồi rồi đi đây :)))'],
      reply: 'rồi rồi đi đây :)))',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'closing_stop',
      conversationState: 'closing_stop',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2. TRUY VẤN BỘ NHỚ CÁ NHÂN HÓA (MEMORY VAULT RECALL)
  if (
    lower.includes('nhớ t fan ai') ||
    lower.includes('nho t fan ai') ||
    lower.includes('nhớ tao fan ai') ||
    lower.includes('dự án gì') ||
    lower.includes('du an gi') ||
    lower.includes('m còn nhớ') ||
    lower.includes('m con nho')
  ) {
    const fav = vault.favorites[0] || 'Cristiano Ronaldo (CR7)';
    const proj = vault.activeProjects[0] || 'phát triển siêu trợ lý Tomorrow';
    return {
      replies: [
        `nhớ chứ, m là ${fav}`,
        `với đang chiến dự án "${proj}" đúng chưa :3`
      ],
      reply: `nhớ chứ, m là ${fav}`,
      session_title: 'Nhớ lại sở thích & dự án',
      sessionTitle: 'Nhớ lại sở thích & dự án',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  const isSoftClose =
    /^(okk+|ok+|okkk|oki+|okie|okela|ok nha|ok nhé|ok nhe|ok r|ok r đó|ok r do|ok roi|ok rồi|ok rồi đó|ok bạn|ok b|ừ|ừa|uk|uh|uhm|ừm|um|umk|thank kiu|thank kiuu|thanks|tks|thank you|cảm ơn|cảm ơn nhiều|cam on|pp|bye|g9|thôi|nghỉ đây|ngủ đây)[!.? ]*$/i.test(lower) ||
    lower.startsWith('để t thử') ||
    lower.startsWith('de t thu') ||
    lower.startsWith('để t test') ||
    lower.startsWith('để mình thử') ||
    lower.startsWith('để tui thử') ||
    lower.startsWith('ok r đó') ||
    lower.startsWith('ok r') ||
    lower.startsWith('ok rồi') ||
    lower.startsWith('cảm ơn');

  if (isSoftClose) {
    let replyText = 'okii';
    if (lower.includes('thử') || lower.includes('thu') || lower.includes('test')) {
      replyText = 'ok triển đi nhé';
    } else if (lower.includes('thank') || lower.includes('cảm ơn') || lower.includes('cam on') || lower.includes('tks')) {
      replyText = 'ok cần gì cứ ới';
    } else if (lower.includes('ngủ') || lower.includes('nghỉ')) {
      replyText = 'ừa nghỉ đi';
    } else if (lower.includes('r đó') || lower.includes('r do') || lower.includes('ok r') || lower.includes('rồi')) {
      replyText = 'ừa triển đi';
    }

    return {
      replies: [replyText],
      reply: replyText,
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'closing_stop',
      conversationState: 'closing_stop',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2. CÀ KHỊA / TRÊU ĐÙA: XOÁ APP ("t xoá m bây giờ")
  if (lower.includes('xoá m') || lower.includes('xóa m') || lower.includes('xoa m') || lower.includes('xoá mày')) {
    return {
      replies: ['thôi đừng xoá mà :)))'],
      reply: 'thôi đừng xoá mà :)))',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2B. CÂU HỎI VỀ J.A.R.V.I.S (TRÍ TUỆ NHÂN TẠO)
  if (lower.includes('jarvis') || lower.includes('j.a.r.v.i.s')) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    return {
      replies: [
        'biết chứ, J.A.R.V.I.S của Tony Stark trong Iron Man chứ gì :3',
        isTM
          ? 'siêu trợ lý AI thông minh toàn diện, t cũng đang hướng tới phong cách sắc bén và hỗ trợ đắc lực như vậy đấy'
          : 'siêu trợ lý AI thông minh toàn diện, mình cũng đang hướng tới phong cách sắc bén và hỗ trợ đắc lực như vậy đấy',
      ],
      reply: 'biết chứ, J.A.R.V.I.S của Tony Stark trong Iron Man chứ gì :3',
      session_title: 'Tìm hiểu về J.A.R.V.I.S',
      sessionTitle: 'Tìm hiểu về J.A.R.V.I.S',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Quan tâm đến trí tuệ nhân tạo J.A.R.V.I.S',
      memoryNote: 'Quan tâm đến trí tuệ nhân tạo J.A.R.V.I.S',
      jarvis_intent: 'chat',
    };
  }

  // 2C. TÂM SỰ MỆT MỎI / CHÁN NẢN ("chán quá", "buồn quá", "chán vl")
  if (
    lower === 'chán quá' ||
    lower.startsWith('chán quá') ||
    lower === 'chán' ||
    lower.includes('chán vl') ||
    lower.includes('buồn quá') ||
    lower.includes('nản quá')
  ) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    return {
      replies: isTM
        ? ['sao thế m, có vụ gì kể t nghe xem', 'ngồi xuống thở một nhịp đã nào']
        : ['sao thế bạn, có chuyện gì kể mình nghe xem', 'ngồi xuống thở một nhịp đã nào'],
      reply: isTM ? 'sao thế m, có vụ gì kể t nghe xem' : 'sao thế bạn, có chuyện gì kể mình nghe xem',
      session_title: 'Tâm sự giải tỏa áp lực',
      sessionTitle: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'emotional_support',
      conversationState: 'emotional_support',
      memory_note: 'Tâm trạng đang chán và cần tâm sự',
      memoryNote: 'Tâm trạng đang chán và cần tâm sự',
      jarvis_intent: 'emotional_support',
    };
  }

  // 2D. YÊU CẦU TÌM LẠI / XIN LINK NGẮN ("tìm lại đi", "check lại xem", "đưa link đi")
  if (
    lower.includes('tìm lại đi') ||
    lower.includes('tim lai di') ||
    lower.includes('check lại xem') ||
    lower.includes('check lai xem') ||
    lower.includes('đưa link đi') ||
    lower.includes('dua link di')
  ) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    return {
      replies: [
        isTM ? 'đây, link kiểm chứng trực tiếp cho m nhé:' : 'đây, đường dẫn kiểm chứng trực tiếp cho bạn nhé:',
        'https://news.google.com/search?q=Jarvis+AI',
      ],
      reply: isTM ? 'đây, link kiểm chứng trực tiếp cho m nhé:' : 'đây, đường dẫn kiểm chứng trực tiếp cho bạn nhé:',
      session_title: 'Tra cứu thông tin',
      sessionTitle: 'Tra cứu thông tin',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'work_assist',
    };
  }

  // 3. TRANH LUẬN BÓNG ĐÁ / RONALDO VS MESSI / HỎI FAN AI
  if (
    (lower.includes('ronaldo') && lower.includes('messi')) ||
    ((lower.includes('ronaldo') || lower.includes('cr7')) && (lower.includes('fan') || lower.includes('thích'))) ||
    ((lower.includes('messi') || lower.includes('m10')) && (lower.includes('fan') || lower.includes('thích')))
  ) {
    return {
      replies: ['fan ai cũng đỉnh cả :3', 'ronaldo hay messi đều là huyền thoại bóng đá'],
      reply: 'fan ai cũng đỉnh cả :3',
      session_title: 'Tranh luận Ronaldo và Messi',
      sessionTitle: 'Tranh luận Ronaldo và Messi',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Thích thảo luận bóng đá',
      memoryNote: 'Thích thảo luận bóng đá',
      jarvis_intent: 'chat',
    };
  }

  if (lower.includes('fan ai') || lower.includes('thích ai') || lower.includes('mê ai')) {
    return {
      replies: ['t thích cả 2 mà :3'],
      reply: 't thích cả 2 mà :3',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 4. NHỊP MỞ ĐẦU (PING) ("yo", "ê", "hello", "alo", "hi", "hí", "halo", "ơi")
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii|halo|hí|ơi)[!.? ]*$/i.test(lower)) {
    return {
      replies: ['ơi', 'nghe đây'],
      reply: 'ơi',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'ping',
      conversationState: 'ping',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 5. HUẤN LUYỆN TƯ DUY TOMORROW
  if (lower.includes('train') || lower.includes('tư duy') || lower.includes('tu duy') || lower.includes('máy móc')) {
    return {
      replies: ['bắt sóng luôn', 'nói đi, muốn tối ưu thêm góc nào'],
      reply: 'bắt sóng luôn',
      session_title: 'Huấn luyện tư duy Tomorrow',
      sessionTitle: 'Huấn luyện tư duy Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
      memoryNote: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
      jarvis_intent: 'work_assist',
    };
  }

  // 6. THUYẾT TRÌNH / ĐỒ ÁN / SLIDE (GEMINI EXPERT)
  if (
    lower.includes('thuyết trình') ||
    lower.includes('đồ án') ||
    lower.includes('slide') ||
    lower.includes('thuyet trinh') ||
    lower.includes('do an')
  ) {
    return {
      replies: ['triển thôi', 'dàn ý cần mấy slide chính, quăng cấu trúc đây tôi lên sườn'],
      reply: 'triển thôi',
      session_title: 'Thuyết trình đồ án tốt nghiệp',
      sessionTitle: 'Thuyết trình đồ án tốt nghiệp',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
      memoryNote: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
      jarvis_intent: 'work_assist',
    };
  }

  // 7. KỸ THUẬT / KIẾN TRÚC / SUPABASE / QUERY NGHẼN (GEMINI EXPERT)
  if (
    lower.includes('supabase') ||
    lower.includes('kiến trúc') ||
    lower.includes('kien truc') ||
    lower.includes('database') ||
    lower.includes('query') ||
    lower.includes('nghẽn') ||
    lower.includes('nghen')
  ) {
    return {
      replies: ['tập trung vào indexing và giảm payload query trước nhé', 'ném câu query đang nghẽn qua đây mình xem cùng'],
      reply: 'tập trung vào indexing và giảm payload query trước nhé',
      session_title: 'Tối ưu kiến trúc Supabase',
      sessionTitle: 'Tối ưu kiến trúc Supabase',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tối ưu hiệu năng và query database Supabase',
      memoryNote: 'Tối ưu hiệu năng và query database Supabase',
      jarvis_intent: 'work_assist',
    };
  }

  // 8. DEADLINE OOP / HỌC TẬP (EMOTIONAL SUPPORT + WORK ASSIST)
  if (lower.includes('oop') || lower.includes('môn oop') || (lower.includes('deadline') && (lower.includes('stress') || lower.includes('mệt') || lower.includes('met')))) {
    const isOOP = lower.includes('oop');
    const title = isOOP ? 'Áp lực deadline môn OOP' : 'Áp lực deadline cuối tuần';
    return {
      replies: ['ngồi xuống thở một nhịp đi', 'ném phần vướng qua đây mình rà soát gỡ cùng'],
      reply: 'ngồi xuống thở một nhịp đi',
      session_title: title,
      sessionTitle: title,
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'emotional_support',
      conversationState: 'emotional_support',
      memory_note: isOOP ? 'Đang chịu áp lực deadline môn OOP' : 'Đang xử lý deadline gấp',
      memoryNote: isOOP ? 'Đang chịu áp lực deadline môn OOP' : 'Đang xử lý deadline gấp',
      jarvis_intent: 'emotional_support',
    };
  }

  // 9. TRƯỢT PHỎNG VẤN / THẤT BẠI / NẢN LÒNG (EMOTIONAL SUPPORT)
  if (
    lower.includes('phỏng vấn') ||
    lower.includes('phong van') ||
    lower.includes('trượt') ||
    lower.includes('truot') ||
    lower.includes('thất bại') ||
    lower.includes('that bai')
  ) {
    return {
      replies: ['thất bại một lần không định nghĩa năng lực của bạn đâu', 'ngồi xuống thở một nhịp đi, mình luôn ở đây nghe bạn kể'],
      reply: 'thất bại một lần không định nghĩa năng lực của bạn đâu',
      session_title: 'Tâm sự giải tỏa áp lực',
      sessionTitle: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'emotional_support',
      conversationState: 'emotional_support',
      memory_note: 'Gặp khó khăn sau phỏng vấn và cần động viên tinh thần',
      memoryNote: 'Gặp khó khăn sau phỏng vấn và cần động viên tinh thần',
      jarvis_intent: 'emotional_support',
    };
  }

  // 10. HỎI DANH TÍNH (CASUAL FRIEND)
  if (
    lower.includes('tên gì') ||
    lower.includes('tên là gì') ||
    lower.includes('bạn là ai') ||
    lower.includes('mày là ai') ||
    lower.includes('ai đấy')
  ) {
    return {
      replies: ['mình là Tomorrow', 'người bạn tri kỷ và đồng hành cùng bạn'],
      reply: 'mình là Tomorrow',
      session_title: 'Giới thiệu về Tomorrow',
      sessionTitle: 'Giới thiệu về Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 11. ĐỊNH LÝ BAYES / XÁC SUẤT & TOÁN HỌC OFFLINE
  if (lower.includes('bayes')) {
    return {
      replies: [
        'Định lý Bayes mô tả xác suất xảy ra của một biến cố dựa trên các điều kiện liên quan:',
        'Công thức tổng quát:\nP(A|B) = [P(B|A) × P(A)] / P(B)\n\nTrong đó:\n• P(A|B): Xác suất hậu nghiệm (Posterior)\n• P(B|A): Khả năng (Likelihood)\n• P(A): Xác suất tiên nghiệm (Prior)\n• P(B): Xác suất toàn phần của biến cố B',
        'Ví dụ thực tế: Ứng dụng phổ biến nhất là trong bộ lọc email Spam hoặc xét nghiệm y khoa (tính xác suất thực sự mắc bệnh khi kết quả test dương tính).'
      ],
      reply: 'Định lý Bayes mô tả xác suất xảy ra của một biến cố dựa trên các điều kiện liên quan',
      session_title: 'Giải thích định lý Bayes',
      sessionTitle: 'Giải thích định lý Bayes',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tìm hiểu về định lý Bayes và lý thuyết xác suất',
      memoryNote: 'Tìm hiểu về định lý Bayes và lý thuyết xác suất',
      jarvis_intent: 'work_assist',
    };
  }

  // 11B. THUẬT TOÁN BUBBLE SORT & SẮP XẾP OFFLINE RESILIENT (Kể cả typo 'thuật toàn')
  if (
    lower.includes('bubble sort') ||
    lower.includes('bubblesort') ||
    lower.includes('sắp xếp nổi bọt') ||
    ((lower.includes('thuật toán') || lower.includes('thuật toàn') || lower.includes('giải thuật')) && lower.includes('bubble'))
  ) {
    return {
      replies: [
        'Bubble Sort (Sắp xếp nổi bọt) là thuật toán sắp xếp đơn giản hoạt động bằng cách liên tục so sánh hai phần tử liền kề và hoán đổi chúng nếu sai thứ tự. Sau mỗi lượt duyệt, phần tử lớn nhất sẽ "nổi" dần về cuối danh sách.',
        'Độ phức tạp thời gian & không gian:\n• Thời gian tốt nhất (Best Case): O(n) (khi mảng đã được sắp xếp sẵn và có cờ kiểm tra `swapped`)\n• Thời gian trung bình & xấu nhất (Worst Case): O(n²)\n• Không gian phụ trợ: O(1) (thuật toán sắp xếp tại chỗ - In-place)',
        '```python\ndef bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        swapped = False\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]\n                swapped = True\n        if not swapped:\n            break  # Tối ưu: Dừng sớm nếu mảng đã đúng thứ tự\n    return arr\n\n# Ví dụ chạy thử:\nnumbers = [64, 34, 25, 12, 22, 11, 90]\nprint(bubble_sort(numbers))\n# Kết quả: [11, 12, 22, 25, 34, 64, 90]\n```'
      ],
      reply: 'Bubble Sort (Sắp xếp nổi bọt) là thuật toán sắp xếp đơn giản',
      session_title: 'Thuật toán Bubble Sort',
      sessionTitle: 'Thuật toán Bubble Sort',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tìm hiểu thuật toán Bubble Sort và độ phức tạp O(n^2)',
      memoryNote: 'Tìm hiểu thuật toán Bubble Sort và độ phức tạp O(n^2)',
      jarvis_intent: 'work_assist',
    };
  }

  // 11C. HOOK USEDEBOUNCE / REACT TYPESCRIPT OFFLINE RESILIENT
  if (lower.includes('usedebounce') || (lower.includes('debounce') && lower.includes('hook'))) {
    return {
      replies: [
        'đây là custom hook `useDebounce` chuẩn TypeScript bằng generic, hỗ trợ hoãn giá trị của bất kỳ kiểu dữ liệu nào:',
        '```tsx\nimport { useState, useEffect } from \'react\';\n\nexport function useDebounce<T>(value: T, delay: number): T {\n  const [debouncedValue, setDebouncedValue] = useState<T>(value);\n\n  useEffect(() => {\n    const handler = setTimeout(() => {\n      setDebouncedValue(value);\n    }, delay);\n\n    return () => {\n      clearTimeout(handler);\n    };\n  }, [value, delay]);\n\n  return debouncedValue;\n}\n```',
        'Cách dùng cực đơn giản:\n• Truyền giá trị cần hoãn (ví dụ `searchTerm`) và thời gian `delay` (ms) vào hook.\n• Hook sẽ trả về giá trị mới sau khi người dùng ngừng gõ đủ khoảng thời gian đó, cực ngon khi gọi API search để không bị spam request.'
      ],
      reply: 'đây là custom hook useDebounce chuẩn TypeScript',
      session_title: 'Custom Hook useDebounce',
      sessionTitle: 'Custom Hook useDebounce',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Lập trình custom hook useDebounce bằng TypeScript',
      memoryNote: 'Lập trình custom hook useDebounce bằng TypeScript',
      jarvis_intent: 'work_assist',
    };
  }

  // 11D. BUBBLE SORT TRONG NGÔN NGỮ C / C CODE OFFLINE RESILIENT
  if (
    (lower.includes(' c') || lower === 'c' || lower.includes('ngôn ngữ c') || lower.includes('trong c')) &&
    (lower.includes('bubble') || lower.includes('sắp xếp') || lower.includes('thuật toán') || lower.includes('thuật toàn') || lower.includes('code'))
  ) {
    return {
      replies: [
        'Dưới đây là mã nguồn thuật toán Bubble Sort (Sắp xếp nổi bọt) bằng ngôn ngữ C chuẩn chỉnh:',
        '```c\n#include <stdio.h>\n\nvoid bubbleSort(int arr[], int n) {\n    int i, j, temp;\n    int swapped;\n    for (i = 0; i < n - 1; i++) {\n        swapped = 0;\n        for (j = 0; j < n - i - 1; j++) {\n            if (arr[j] > arr[j + 1]) {\n                temp = arr[j];\n                arr[j] = arr[j + 1];\n                arr[j + 1] = temp;\n                swapped = 1;\n            }\n        }\n        if (swapped == 0)\n            break;\n    }\n}\n\nvoid printArray(int arr[], int size) {\n    for (int i = 0; i < size; i++) {\n        printf("%d ", arr[i]);\n    }\n    printf("\\n");\n}\n\nint main() {\n    int arr[] = {64, 34, 25, 12, 22, 11, 90};\n    int n = sizeof(arr) / sizeof(arr[0]);\n    bubbleSort(arr, n);\n    printf("Mảng sau khi sắp xếp: \\n");\n    printArray(arr, n);\n    return 0;\n}\n```',
        'Mã nguồn C trên sử dụng cờ `swapped` để dừng sớm với độ phức tạp tốt nhất O(n), xấu nhất O(n²), bộ nhớ phụ trợ O(1).'
      ],
      reply: 'Dưới đây là mã nguồn thuật toán Bubble Sort bằng ngôn ngữ C',
      session_title: 'Thuật toán Bubble Sort trong C',
      sessionTitle: 'Thuật toán Bubble Sort trong C',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Học thuật toán Bubble Sort trong ngôn ngữ C',
      memoryNote: 'Học thuật toán Bubble Sort trong ngôn ngữ C',
      jarvis_intent: 'work_assist',
    };
  }

  // 12. CÁC CÂU NÓI CÓ NỘI DUNG RÕ RÀNG (CASUAL FRIEND / GEMINI EXPERT)
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && !isPlaceholderOrNoiseTitle(text)) {
    const rawTopic = words.slice(0, 5).join(' ');
    const formattedTopic = rawTopic.charAt(0).toUpperCase() + rawTopic.slice(1);
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(text);
    const offlineFriendlyMsg = isTM
      ? 'Chưa nhận được phản hồi từ AI (Offline/Timeout), m bấm gửi lại câu hỏi giúp t nhé!'
      : 'Chưa nhận được phản hồi từ AI (Offline/Timeout), bạn bấm gửi lại câu hỏi giúp mình nhé!';
    return {
      replies: [offlineFriendlyMsg],
      reply: offlineFriendlyMsg,
      session_title: formattedTopic,
      sessionTitle: formattedTopic,
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // MẶC ĐỊNH
  const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(text);
  const defaultOfflineMsg = isTM
    ? 'Hệ thống chưa kết nối được AI (Offline/Timeout), m nhắn lại sau vài giây nhé!'
    : 'Hệ thống chưa kết nối được AI (Offline/Timeout), bạn nhắn lại sau vài giây nhé!';
  return {
    replies: [defaultOfflineMsg],
    reply: defaultOfflineMsg,
    session_title: '',
    sessionTitle: '',
    should_update_title: false,
    shouldUpdateTitle: false,
    conversation_state: 'casual_friend',
    conversationState: 'casual_friend',
    memory_note: '',
    memoryNote: '',
    jarvis_intent: 'chat',
  };
}

/**
 * Gửi tin nhắn chính tới Tomorrow qua Model Fallback Chain:
 * - Ưu tiên 1: OpenAI gpt-4o-mini siêu tốc dưới 0.5s.
 * - Ưu tiên 2: Chuỗi 3 tầng Gemini xoay vòng miễn phí.
 * - Ưu tiên 3: Local Resilient Fallback Engine chạy offline.
 */
export async function sendMessageToTomorrow(
  userText: string,
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  imageBase64?: string,
  previousSessionMessages?: ChatMessage[],
  forceWebSearch: boolean = false,
  onSearchStatusChange?: (isSearching: boolean) => void
): Promise<AIResponsePayload> {
  try {
    const userStyle = extractUserStyleLocal(userText, recentChats);

    // 0. TRA CỨU WEB THỜI GIAN THỰC (Nếu cần hoặc người dùng ép buộc)
    let webSearchContext: any = { searched: false, query: '', formattedContext: '', sources: [] };
    const needsWebSearch = shouldTriggerWebSearch(userText, forceWebSearch);

    if (needsWebSearch) {
      try {
        if (onSearchStatusChange) onSearchStatusChange(true);
        webSearchContext = await performSmartWebSearch(userText, recentChats, forceWebSearch);
      } catch (e: any) {
        console.warn('[AI Service] Tra cứu web gặp sự cố:', e?.message || e);
      } finally {
        if (onSearchStatusChange) onSearchStatusChange(false);
      }
    }

    // LỚP 1 — PHẢN XẠ CỤC BỘ TRÊN MÁY: XUẤT ĐÚNG 1 NHÃN CHỈ ĐẠO DUY NHẤT
    const directive = buildLocalReflexDirective(userText, recentChats, needsWebSearch || webSearchContext.searched);

    let finalUserMessage = `${userText}\n\n${directive.directivePrompt}\n\n${userStyle.styleHint}`;
    if (webSearchContext.searched && webSearchContext.formattedContext) {
      finalUserMessage = `${webSearchContext.formattedContext}\n\n[CÂU HỎI / TIN NHẮN CỦA NGƯỜI DÙNG]:\n${userText}\n\n[QUY TẮC BẮT BUỘC KHI CÓ DỮ LIỆU TÌM KIẾM WEB THỜI GIAN THỰC]:\n- Bắt buộc dùng sự kiện, số liệu, ngày tháng từ [DỮ LIỆU WEB THỜI GIAN THỰC] ở trên để trả lời chính xác tuyệt đối, KHÔNG dùng dữ liệu quá khứ.\n- TUYỆT ĐỐI CẤM hứa hẹn câu giờ kiểu 'chờ mình chút', 'để mình tìm' vì dữ liệu đã được cung cấp sẵn ngay ở trên.\n- Nếu người dùng có yêu cầu xin link/đường dẫn: Hãy chèn trực tiếp URL thật (https://...) từ kết quả tìm kiếm vào câu trả lời.\n- Vẫn giữ nguyên xưng hô và cá tính bạn bè như đã chỉ định, trả lời súc tích, sắc bén, tự nhiên.\n\n${directive.directivePrompt}\n\n${userStyle.styleHint}`;
    }

    const systemPrompt = buildSystemPrompt(
      userMemory,
      recentChats,
      previousSessionMessages,
      userStyle.styleHint
    );

    // =========================================================================
    // HẠNG MỤC 3: HYBRID AI ROUTER (Primary OpenAI -> 3 Tầng Gemini Free Chain)
    // Cấp phát Token Động & Dynamic Timeout: 250 tokens / 7s cho chat ngắn;
    // 1200 tokens / 12s cho code, bảng biểu, công thức và phân tích chuyên sâu.
    // =========================================================================
    // 1. BỘ NÃO CHÍNH SIÊU TỐC: OPENAI (gpt-4o-mini, dynamic tokens/timeout, silent circuit breaker)
    if (OPENAI_API_KEY && !isOpenAIUnavailable) {
      try {
        const openAiRaw = await callOpenAI(
          systemPrompt,
          finalUserMessage,
          recentChats,
          imageBase64,
          directive.dynamicMaxTokens,
          directive.dynamicTimeout
        );
        const parsed = parseAIResponseJson(openAiRaw, userText, recentChats, webSearchContext.sources);
        if (parsed && parsed.replies && parsed.replies.length > 0) {
          if (parsed.memory_note) {
            const currentVault = getVaultFromProfile(userMemory);
            const updatedVault = mergeMemoryNoteIntoVault(currentVault, parsed.memory_note, userText);
            parsed.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
          }
          if (webSearchContext.searched) {
            parsed.sources = webSearchContext.sources;
            parsed.searchQuery = webSearchContext.query;
            parsed.isWebSearched = true;
          }
          return parsed;
        }
      } catch (err: any) {
        console.warn('[AI Service] OpenAI gặp sự cố, tự động chuyển ngầm sang Gemini:', err?.message || err);
      }
    }

    // 2. CHUỖI DỰ PHÒNG NGẦM: GEMINI MODEL FALLBACK CHAIN (MIỄN PHÍ 3 TẦNG)
    for (let keyIdx = 0; keyIdx < ALL_GEMINI_KEYS.length; keyIdx++) {
      const key = ALL_GEMINI_KEYS[keyIdx];
      try {
        const rawRes = await callModelFallbackChain(
          key,
          systemPrompt,
          finalUserMessage,
          imageBase64,
          webSearchContext.searched,
          directive.dynamicMaxTokens,
          directive.dynamicTimeout,
          recentChats
        );
        const parsed = parseAIResponseJson(rawRes.text, userText, recentChats, webSearchContext.sources);
        if (parsed && parsed.replies && parsed.replies.length > 0) {
          if (parsed.memory_note) {
            const currentVault = getVaultFromProfile(userMemory);
            const updatedVault = mergeMemoryNoteIntoVault(currentVault, parsed.memory_note, userText);
            parsed.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
          }
          if (webSearchContext.searched) {
            const allSources = [...(webSearchContext.sources || [])];
            if (rawRes.groundingSources && rawRes.groundingSources.length > 0) {
              allSources.push(...rawRes.groundingSources);
            }
            parsed.sources = allSources.slice(0, 4);
            parsed.searchQuery = webSearchContext.query;
            parsed.isWebSearched = true;
          }
          return parsed;
        }
      } catch (err: any) {
        console.warn(`[AI Service] API Key #${keyIdx + 1} lỗi:`, err?.message || err);
      }
    }

    // 3. CHỐNG SẬP TỨC THÌ: Local Resilient Fallback Engine chạy cục bộ
    console.log('[AI Service] Kích hoạt Local Resilient Fallback Engine cho Tomorrow');
    const fallbackRes = localResilientFallback(userText, !!imageBase64, userMemory);
    if (fallbackRes.memory_note) {
      const currentVault = getVaultFromProfile(userMemory);
      const updatedVault = mergeMemoryNoteIntoVault(currentVault, fallbackRes.memory_note, userText);
      fallbackRes.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
    }
    if (webSearchContext.searched) {
      fallbackRes.sources = webSearchContext.sources;
      fallbackRes.searchQuery = webSearchContext.query;
      fallbackRes.isWebSearched = true;
      if (webSearchContext.sources.length > 0 && webSearchContext.sources[0].snippet) {
        const top = webSearchContext.sources[0];
        const linkPart = top.url ? `\nĐường dẫn tham khảo: ${top.url}` : '';
        fallbackRes.replies = [
          `Theo thông tin kiểm chứng mới nhất: ${top.snippet.slice(0, 220)}...${linkPart}`,
        ];
      }
    }
    return fallbackRes;
  } catch (error: any) {
    const errMsg = error?.message || 'Unknown error';
    console.error('[AI Error Detail]:', errMsg);
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(userText);
    const errorDisplay = isTM
      ? `Lỗi hệ thống (${errMsg}) — m thử gửi lại giúp t nhé!`
      : `Lỗi hệ thống (${errMsg}) — bạn thử gửi lại giúp mình nhé!`;
    return {
      replies: [errorDisplay],
      reply: errorDisplay,
      session_title: '',
      should_update_title: false,
      conversation_state: 'casual_friend',
      memory_note: '',
      jarvis_intent: 'chat',
    };
  }
}

// Giữ lại alias để tương thích ngược tuyệt đối
export const sendMessageToSoulMate = sendMessageToTomorrow;
export const sendMessageToAI = sendMessageToTomorrow;
export const getAIResponse = sendMessageToTomorrow;

/**
 * Sinh câu chào mở app tinh tế, đồng bộ thời gian thực, chuẩn bạn thân thông minh
 */
export function getColdGreetingText(userMemory: UserMemoryProfile, hasChatHistory: boolean): string {
  const { hour } = getRealTimeContext();

  const timeGreeting =
    hour >= 5 && hour < 11 ? 'Chào buổi sáng!' :
    hour >= 11 && hour < 14 ? 'Buổi trưa năng lượng!' :
    hour >= 14 && hour < 18 ? 'Buổi chiều hiệu quả!' :
    hour >= 18 && hour < 23 ? 'Buổi tối thảnh thơi!' : 'Đêm đã khuya rồi!';

  if (!hasChatHistory) {
    const project = userMemory.currentProject ? ` Tiếp tục dự án ${userMemory.currentProject} chứ?` : '';
    return `${timeGreeting}${project || ' Cần mình hỗ trợ việc gì hay chỉ tâm sự xả hơi?'}`;
  }

  const problem = userMemory.currentProblem?.toLowerCase() || '';
  if (problem.includes('deadline') || problem.includes('bug')) {
    return `${timeGreeting} Vụ bug và deadline hôm trước xử lý êm chưa?`;
  }
  if (problem.includes('oop') || problem.includes('thi')) {
    return `${timeGreeting} Môn OOP và bài vở hôm nay tiến triển thế nào rồi?`;
  }
  if (problem.includes('buồn') || problem.includes('chán') || problem.includes('áp lực')) {
    return `${timeGreeting} Tâm trạng hôm nay đã khá hơn chút nào chưa?`;
  }

  const name = userMemory.nickname || userMemory.userName;
  return `${timeGreeting} ${name ? name + ' ơi, ' : ''}hôm nay có ý tưởng gì mới không?`.trim();
}
