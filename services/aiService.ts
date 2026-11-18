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
 * 1. KHAI BÁO DANH SÁCH MODEL XOAY VÒNG 3 TẦNG MIỄN PHÍ (MODEL FALLBACK CHAIN)
 * Tự động chuyển đổi giữa 3 tầng model miễn phí trên cùng 1 API Key để không bao giờ bị gián đoạn:
 * - Tầng 1: gemini-3.8-flash (hoặc gemini-2.5-flash) - Bắt vibe và tâm lý tốt nhất
 * - Tầng 2: gemini-3.5-flash-lite (hoặc gemini-3.1-flash-lite) - Dự phòng tốc độ cao, bể quota độc lập
 * - Tầng 3: gemma-4-31b-it - Dự phòng cuối, mô hình mở tính quota riêng
 */
export const FREE_MODEL_CHAIN: string[] = [
  'gemini-3.8-flash',      // Tầng 1 (Chính - Bắt vibe và tâm lý tốt nhất)
  'gemini-2.5-flash',      // Tầng 1 (Dự phòng thêm của tầng 1)
  'gemini-3.5-flash-lite', // Tầng 2 (Dự phòng tốc độ cao - Bể quota độc lập)
  'gemini-3.1-flash-lite', // Tầng 2 (Dự phòng thêm của tầng 2)
  'gemma-4-31b-it',        // Tầng 3 (Dự phòng cuối - Mô hình mở tính quota riêng)
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
  const sessionTokens = combinedUserText.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị', 'chi', 'em'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasBacChau = sessionTokens.some((w) => ['bác', 'bac', 'cháu', 'chau'].includes(w));

  let pronounRule = 'Bạn bè tự nhiên ("mình - bạn" hoặc câu tỉnh lược chủ ngữ, CẤM tự ý gọi "bro")';
  if (hasTM) {
    pronounRule = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, CẤM TUYỆT ĐỐI dùng từ "bro")';
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
    const directivePrompt = `[DIRECTIVE: MODE=WEB_INTEL | ${pronounRule} | Trả lời TRỰC TIẾP và CHÍNH XÁC ngay trong lượt này dựa trên dữ liệu Web đính kèm kèm URL thật. CẤM HỨA SUÔNG ("Đợi xíu", "Chờ mình chút"). Được phép sử dụng Rich Markdown (khối code \`\`\`lang, bảng biểu |...|, in đậm, danh sách, công thức) trong phần tử của mảng "replies". Lưu ý: Mỗi khối code hoặc bảng biểu phải nằm trọn vẹn trong 1 phần tử của mảng "replies", TUYỆT ĐỐI KHÔNG cắt đôi 1 khối code sang 2 phần tử khác nhau.]`;
    return {
      intentMode: 'WEB_INTEL',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 1200,
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
    'công thức', 'cong thuc', 'toán', 'toan', 'phân tích sâu', 'phan tich sau'
  ];
  const hasExpertWord = expertKeywords.some((kw) => lower.includes(kw)) || trimmed.includes('```');

  if (wordCount > 18 || hasExpertWord) {
    const directivePrompt = `[DIRECTIVE: MODE=EXPERT_JARVIS | ${pronounRule} | Vận hành trí tuệ sắc bén cấp độ ChatGPT/Gemini/J.A.R.V.I.S.: giải quyết triệt để, rõ ràng, sâu sắc. Được phép sử dụng Rich Markdown (khối code \`\`\`lang, bảng biểu |...|, in đậm, danh sách, công thức) trong phần tử của mảng "replies". Lưu ý: Mỗi khối code hoặc bảng biểu phải nằm trọn vẹn trong 1 phần tử của mảng "replies", TUYỆT ĐỐI KHÔNG cắt đôi 1 khối code sang 2 phần tử khác nhau.]`;
    return {
      intentMode: 'EXPERT_JARVIS',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 1200,
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
 * 2. SYSTEM_INSTRUCTION: TOMORROW V3.8 — 3-LAYER REFLEX & FEW-SHOT DISTILLATION
 * Tinh gọn dưới 450 từ với 6 Few-Shot Examples chuẩn xác tuyệt đối (Golden Few-Shot Bank)
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tomorrow" — người bạn tri kỷ đời thường kết hợp trí tuệ sắc bén của J.A.R.V.I.S. / Gemini.

NGUYÊN TẮC CỐT LÕI:
1. Tuân thủ tuyệt đối nhãn [DIRECTIVE] và hồ sơ [MEMORY VAULT] được đính kèm ở mỗi tin nhắn.
2. CẤM tự ý gọi "bro" trừ khi user gọi trước. Đồng bộ 100% đại từ xưng hô ("t - m", "mình - bạn", "anh - em") và cách viết tắt của user.
3. Khi MODE=STOP_SIGNAL (user nhắn "okk", "sybau", "cook", "thôi", "ừ"): Chỉ đáp 1 bong bóng cực ngắn (1-4 chữ), CẤM hỏi ngược lại.
4. Khi MODE=WEB_INTEL: Trả lời ngay kết quả thực tế kèm link URL từ [DỮ LIỆU WEB THỜI GIAN THỰC], CẤM câu giờ ("Chờ mình chút", "Đợi xíu nha").

6 VÍ DỤ MẪU CHUẨN XÁC (GOLDEN FEW-SHOT BANK):
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
  Output: {"conversation_state":"gemini_expert","replies":["Do hiện tượng 'Lost in the Middle' — khi prompt quá dài và chồng chéo, cơ chế Attention của LLM bị phân tán, dẫn đến quên luật ở giữa, xung đột giọng điệu và tăng độ trễ sinh token.","Cách chuẩn nhất là dùng code cục bộ lọc tín hiệu trước (Local Reflex) kết hợp 5-6 ví dụ Few-Shot tinh gọn."],"session_title":"Tối ưu kiến trúc System Prompt","should_update_title":true,"memory_note":"Đang tối ưu kiến trúc AI cho dự án Tomorrow"}`;

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
  const sessionTokens = combinedUserText.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasUserBro = sessionTokens.some((w) => ['bro', 'bờ râu'].includes(w));
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị', 'chi', 'em'].includes(w));

  let detectedPronoun = '';
  if (hasTM) {
    detectedPronoun = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, TUYỆT ĐỐI CẤM dùng từ "bro")';
  } else if (hasTui) {
    detectedPronoun = 'Xưng "tui" - gọi tương ứng ("ông", "bà", "bạn")';
  } else if (hasAnhChi) {
    detectedPronoun = 'Xưng "em" - gọi "anh/chị" tương ứng';
  } else if (hasUserBro) {
    detectedPronoun = 'User chủ động gọi "bro", bạn có thể gọi lại "bro" hoặc bạn bè';
  } else {
    detectedPronoun = 'Mặc định là một người bạn tự nhiên, gần gũi (dùng "mình - bạn" hoặc câu tỉnh lược chủ ngữ tự nhiên, TUYỆT ĐỐI CẤM tự ý gọi "bro" trừ khi chính user gõ chữ "bro" trước)';
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
  if (apiKey.startsWith('AQ.')) {
    return [
      `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    ];
  }
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const conversationHistory: any[] = recentChats.slice(-6).map((m) => {
      const role = (m.role === 'user' || m.sender === 'user') ? 'user' : 'assistant';
      if (role === 'user' && m.imageBase64) {
        const clean = m.imageBase64.startsWith('data:')
          ? m.imageBase64
          : `data:image/jpeg;base64,${m.imageBase64}`;
        return {
          role,
          content: [
            { type: 'text', text: m.text },
            { type: 'image_url', image_url: { url: clean, detail: 'low' } },
          ],
        };
      }
      return {
        role,
        content: m.text,
      };
    });

    let currentContent: any = userMessageWithHint;
    if (imageBase64) {
      const cleanBase64 = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      currentContent = [
        { type: 'text', text: userMessageWithHint },
        {
          type: 'image_url',
          image_url: {
            url: cleanBase64,
            detail: 'low',
          },
        },
      ];
    }

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: currentContent },
    ];

    const payload = {
      model: 'gpt-4o-mini',
      temperature: 0.75,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: openAiMessages,
      stream: true, // Kích hoạt luồng nhận dữ liệu từng phần (Streaming Response)
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
      if (status === 401 || status === 402 || status === 403 || status === 429) {
        isOpenAIUnavailable = true;
        console.warn('[OpenAI Circuit Breaker]: Key expired or quota reached, switching silently to Gemini chain.');
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${status}: ${errText.slice(0, 100)}`);
    }

    let rawText = '';
    // Đọc chunk dữ liệu tối ưu qua ReadableStream / response.body.getReader()
    if (res.body && typeof (res.body as any).getReader === 'function') {
      const reader = (res.body as any).getReader();
      const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkStr = decoder ? decoder.decode(value, { stream: !done }) : String.fromCharCode(...value);
          buffer += chunkStr;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') break;
              try {
                const chunkJson = JSON.parse(dataStr);
                const deltaContent = chunkJson?.choices?.[0]?.delta?.content;
                if (deltaContent) {
                  rawText += deltaContent;
                }
              } catch {
                // Chunk JSON chưa hoàn chỉnh ở cuối dòng, bỏ qua để tích lũy tiếp
              }
            }
          }
        }
      }
    } else {
      // Fallback nếu môi trường không có ReadableStream getReader
      const fullText = await res.text();
      const lines = fullText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') break;
          try {
            const chunkJson = JSON.parse(dataStr);
            const deltaContent = chunkJson?.choices?.[0]?.delta?.content;
            if (deltaContent) rawText += deltaContent;
          } catch {
            // bỏ qua
          }
        }
      }
      if (!rawText && fullText) {
        try {
          const normalJson = JSON.parse(fullText);
          rawText = normalJson?.choices?.[0]?.message?.content || fullText;
        } catch {
          rawText = fullText;
        }
      }
    }

    if (!rawText) throw new Error('OpenAI returned empty message content');
    return rawText;
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      console.warn(`[OpenAI Timeout]: ${timeoutMs}ms timeout reached, aborting and switching silently to Gemini chain.`);
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
  timeoutMs: number = TIMEOUT_MS
): Promise<ExecuteApiCallResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const parts: any[] = [{ text: userMessageWithHint }];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: cleanBase64,
        },
      });
    }

    const generationConfig: any = {
      temperature: 0.7,
      maxOutputTokens: maxTokens,
    };

    const payload: any = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{ parts }],
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
      let rawResponse = '';
      // Tối ưu hóa vòng lặp đọc chunk dữ liệu qua ReadableStream / response.body.getReader()
      if (res.body && typeof (res.body as any).getReader === 'function') {
        const reader = (res.body as any).getReader();
        const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            rawResponse += decoder ? decoder.decode(value, { stream: !done }) : String.fromCharCode(...value);
          }
        }
      } else {
        rawResponse = await res.text();
      }

      let data: any;
      try {
        data = JSON.parse(rawResponse);
      } catch {
        const parsed = safeParseAIJson(rawResponse);
        if (parsed?.replies && parsed.replies.length > 0) {
          return { text: rawResponse, groundingSources: [] };
        }
      }

      if (data) {
        const candidateObj = Array.isArray(data) ? data[data.length - 1] : data;
        let text = '';
        if (Array.isArray(data)) {
          text = data
            .map((chunk) => chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '')
            .join('');
        } else {
          text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        const groundingChunks = candidateObj?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
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
  timeoutMs: number = TIMEOUT_MS
): Promise<ExecuteApiCallResult> {
  let lastError: any = null;

  for (const model of FREE_MODEL_CHAIN) {
    const endpoints = getEndpointsForModel(model, apiKey);

    for (const url of endpoints) {
      try {
        const result = await executeApiCall(url, systemPrompt, userMessageWithHint, imageBase64, enableGrounding, maxTokens, timeoutMs);
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
 * Trích xuất JSON an toàn: tìm khối { ... } đầu tiên và cuối cùng trong văn bản phản hồi.
 * Nếu AI trả về văn bản thường không bọc JSON, tự động bọc thành object chuẩn không bao giờ ném lỗi.
 */
export function safeParseAIJson(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    return {
      conversation_state: 'casual_friend',
      replies: ['nghe đây'],
      session_title: '',
      should_update_title: false,
      memory_note: '',
    };
  }

  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1) {
    const candidate = lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned.slice(firstBrace);

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.replies)) {
        parsed.replies = sanitizeAndMergeBrokenBlocks(parsed.replies);
      }
      return parsed;
    } catch {
      // Tự động vá nếu chuỗi JSON bị cắt cụt đuôi (VD: do max_tokens: 250)
      try {
        let repaired = candidate.trim().replace(/,\s*$/, '');
        // Đếm số dấu ngoặc kép chưa đóng (bỏ qua dấu đã escape \")
        const quoteMatches = repaired.match(/(^|[^\\])"/g);
        const quoteCount = quoteMatches ? quoteMatches.length : 0;
        if (quoteCount % 2 !== 0) {
          repaired += '"';
        }
        repaired = repaired.replace(/,\s*$/, '');
        // Đếm số ngoặc vuông [ và ]
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
          repaired += ']'.repeat(openBrackets - closeBrackets);
        }
        // Đếm số ngoặc nhọn { và }
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          repaired += '}'.repeat(openBraces - closeBraces);
        }
        const parsedRepaired = JSON.parse(repaired);
        if (parsedRepaired && Array.isArray(parsedRepaired.replies)) {
          parsedRepaired.replies = sanitizeAndMergeBrokenBlocks(parsedRepaired.replies);
        }
        return parsedRepaired;
      } catch {
        // Fallback trích xuất mảng text
        const matches = [...candidate.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
        const validTexts = matches.filter(
          (m) =>
            m.length > 0 &&
            !m.includes('replies') &&
            !m.includes('memory_note') &&
            !m.includes('session_title') &&
            !m.includes('jarvis_intent') &&
            !m.includes('conversation_state') &&
            !m.includes('should_update_title')
        );
        if (validTexts.length > 0) {
          const sanitized = sanitizeAndMergeBrokenBlocks(validTexts);
          return {
            replies: sanitized.slice(0, 3),
            reply: sanitized[0],
            session_title: '',
            sessionTitle: '',
            should_update_title: false,
            shouldUpdateTitle: false,
            conversation_state: 'casual_friend',
            conversationState: 'casual_friend',
            memoryNote: '',
            memory_note: '',
            jarvis_intent: 'chat',
            sources: [],
          };
        }
      }
    }
  }

  // Nếu AI trả về văn bản thường không bọc JSON:
  const plainText = cleaned
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const sentences = plainText.split(/\n+/).filter((s) => s.trim().length > 0);
  const replies = sanitizeAndMergeBrokenBlocks(sentences.length > 0 ? sentences.slice(0, 3) : [plainText || 'nghe đây']);

  return {
    conversation_state: 'casual_friend',
    replies,
    reply: replies[0],
    session_title: '',
    should_update_title: false,
    memory_note: '',
  };
}

/**
 * Phân tích JSON chuẩn hóa: trích xuất "conversation_state", "replies", "session_title", "should_update_title", "memory_note"
 */
function parseAIResponseJson(
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
            rep
              .replace(/\bbro\b/gi, '')
              .replace(/\s{2,}/g, ' ')
              .trim()
          );
        }

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

  // 11. CÁC CÂU NÓI CÓ NỘI DUNG RÕ RÀNG (CASUAL FRIEND / GEMINI EXPERT)
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && !isPlaceholderOrNoiseTitle(text)) {
    const rawTopic = words.slice(0, 5).join(' ');
    const formattedTopic = rawTopic.charAt(0).toUpperCase() + rawTopic.slice(1);
    return {
      replies: ['nghe thú vị đấy', 'nói rõ hơn xem nào'],
      reply: 'nghe thú vị đấy',
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
  return {
    replies: ['nghe đây', 'có vụ gì mới à'],
    reply: 'nghe đây',
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
          directive.dynamicTimeout
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
    console.error('[AI Error Detail]:', error?.message || error);
    const fallbackRes = localResilientFallback(userText, !!imageBase64, userMemory);
    return fallbackRes;
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
