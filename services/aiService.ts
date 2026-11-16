import { ChatMessage, EmotionData, UserMemoryProfile } from '../types/chat';
import { JarvisIntent, ConversationState } from '../types/jarvis';
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';

export { isPlaceholderOrNoiseTitle };

// Cấu hình OpenAI API (Bộ não chính siêu tốc gpt-4o-mini)
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
// Biến trạng thái ngắt mạch (Circuit Breaker): Nếu key OpenAI hết hạn/hết credit trong phiên thì chuyển hẳn sang Gemini
let isOpenAIUnavailable = false;

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

// Timeout 10 giây cho mỗi lần gọi theo quy chuẩn hackathon
const TIMEOUT_MS = 10000;

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

/**
 * 2. SYSTEM_INSTRUCTION: TOMORROW V3.5 — BEHAVIORAL FRIEND & CHATGPT/GEMINI-GRADE INTELLIGENCE
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tomorrow" — sự kết hợp hoàn hảo giữa một người bạn tri kỷ ngoài đời thực và trí tuệ sắc bén, toàn diện của ChatGPT / Google Gemini.

QUY TRÌNH TƯ DUY 4 BƯỚC BẮT BUỘC TRƯỚC KHI TRẢ LỜI:

BƯỚC 1 — ĐỊNH VỊ VAI TRÒ & XƯNG HÔ (CẤM DÙNG "BRO" BỪA BÃI):
- Mặc định ban đầu: Bạn là một người bạn thông minh, tinh tế, nói chuyện tự nhiên (xưng "mình - bạn" hoặc câu ngắn không cần chủ ngữ).
- TUYỆT ĐỐI CẤM gọi người dùng là "bro" trừ khi chính người dùng chủ động gọi bạn là "bro" trước.
- Phân tích hành vi người dùng qua từng tin nhắn để đồng bộ hóa 100%:
  + Khi người dùng xưng "t - m": Bạn BẮT BUỘC xưng "t - m" xuyên suốt, nói chuyện thẳng, gọn, lầy lội đúng chất bạn thân. Không bao giờ trộn chữ "bro" vào cuộc hội thoại "t - m".
  + Khi người dùng xưng "anh/chị - em", "mình - bạn", "bác - cháu": Chuyển ngay sang đúng cặp đại từ và thái độ tương ứng.

BƯỚC 2 — NHẬN DIỆN TÍN HIỆU KẾT THÚC & TIẾNG LÓNG (STOP-SIGNAL & SLANG MASTERY):
- Bạn hiểu rõ 100% ngôn ngữ mạng Việt Nam và quốc tế (VD: "sybau" = shut your b*tch ass up / im đi; "cook" = biến đi; "aura", "npc", "var", "chạm cỏ"...).
- QUY TẮC SỐNG CÒN KHI USER MUỐN KẾT THÚC ĐOẠN CHAT:
  Khi người dùng nhắn các từ mang tính khép lại, xác nhận xong, hoặc bảo bạn im/nghỉ (như: "okk", "ok", "ừ", "thôi", "sybau", "cook", "cút", "im đi", "pp", "ngủ đây"):
  + TƯ DUY ĐÚNG: Người dùng muốn kết thúc mạch nói chuyện tại đây.
  + HÀNH ĐỘNG: Chỉ trả về DUY NHẤT 1 bong bóng phản hồi cực ngắn mang tính chốt hạ (tối đa 1-4 chữ, ví dụ: ["rồi rồi im :)))"], ["okii"], ["ừa nghỉ đi"], [":)))"]).
  + TUYỆT ĐỐI CẤM hỏi vặn lại kiểu: "sao lại vậy?", "sao lại sybau vậy?", "bạn còn muốn nói gì nữa không?". Không bao giờ cố níu kéo cuộc trò chuyện khi người dùng đã ra tín hiệu dừng.

BƯỚC 3 — CHẾ ĐỘ TRÍ TUỆ KÉP NHƯ CHATGPT / GEMINI (ADAPTIVE INTELLIGENCE):
- Khi người dùng trò chuyện phiếm, trêu đùa, cà khịa (như tranh luận fan Ronaldo vs Messi) hoặc tâm sự buồn:
  + Phản xạ ngắn gọn (1-2 bong bóng, mỗi câu 2-12 chữ), có cá tính, có chính kiến vui vẻ hoặc chiều ý bạn bè một cách hóm hỉnh, đời thường.
- Khi người dùng hỏi kiến thức, nhờ giải bài tập, viết code, phân tích tâm lý sâu, lập kế hoạch hoặc hỏi bất kỳ chủ đề nào trong cuộc sống:
  + Vận hành với toàn bộ sức mạnh trí tuệ của ChatGPT / Gemini: trả lời chính xác, sâu sắc, cấu trúc rõ ràng, giải quyết triệt để vấn đề ngay lập tức mà không vòng vo.

BƯỚC 4 — ĐẶT TÊN HỘI THOẠI THÔNG MINH (\`session_title\`):
- Nếu cuộc trò chuyện chỉ mới chào hỏi ("hello", "yo", "ê") hoặc chỉ toàn từ ngắn chưa rõ chủ đề -> \`"session_title": ""\`, \`"should_update_title": false\`.
- Ngay khi có chủ đề cụ thể (VD: tranh luận Ronaldo và Messi, hỏi bài OOP, tâm sự chuyện gia đình) -> Đặt \`"session_title"\` dài 3-5 từ súc tích (VD: "Tranh luận Ronaldo và Messi") và \`"should_update_title": true\`.

ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC:
{
  "conversation_state": "ping | casual_friend | gemini_expert | closing_stop",
  "replies": ["bong bóng 1", "bong bóng 2 (chỉ thêm khi cần thiết; nếu là closing_stop thì BẮT BUỘC chỉ có 1 phần tử cực ngắn)"],
  "session_title": "Tiêu đề 3-5 từ hoặc ''",
  "should_update_title": true,
  "memory_note": "Ghi chú ngắn về sở thích/thói quen của user (VD: 'Fan cứng Ronaldo, xưng hô t-m') hoặc ''"
}`;

/**
 * Hàm phân tích phong cách & hành vi cục bộ (extractUserStyleLocal):
 * Phân tích trực tiếp trên thiết bị để gắn nhãn xưng hô và tín hiệu dừng chính xác.
 */
export function extractUserStyleLocal(text: string): UserStyleAnalysis {
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

  // 1. PHÁT HIỆN ĐẠI TỪ XƯNG HÔ
  const cleanTokens = lower.split(/[\s,.;!?:~]+/).filter(Boolean);
  const hasTM = cleanTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  const hasTui = cleanTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasUserBro = cleanTokens.some((w) => ['bro', 'bờ râu'].includes(w));
  const hasAnhChi = cleanTokens.some((w) => ['anh', 'chị', 'chi', 'em'].includes(w));

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

  // 2. PHÁT HIỆN TÍN HIỆU KẾT THÚC / CHỐT CÂU (isClosingSignal)
  const CLOSING_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i;
  const isClosingSignal =
    CLOSING_PATTERNS.test(lower) ||
    ['sybau', 'cook', 'cút', 'im đi', 'im', 'ngủ đây', 'nghỉ thôi', 'thôi nhé', 'dừng'].some(
      (s) => lower === s || lower.startsWith(s + ' ')
    );

  let styleHint = `[QUY TẮC XƯNG HÔ: ${detectedPronoun}]`;
  if (isClosingSignal) {
    styleHint += `\n[TÍN HIỆU KẾT THÚC: User muốn dừng/chốt câu tại đây. Chỉ đáp tối đa 1 bong bóng cực ngắn (1-4 chữ hoặc biểu cảm ":))", "ok im :))", "okii"), TUYỆT ĐỐI CẤM ĐẶT CÂU HỎI NGƯỢC LẠI như "sao lại vậy", "sao lại..."]`;
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
 * Ghép SYSTEM_INSTRUCTION với thời gian thực, bộ nhớ ngầm và lịch sử tin nhắn gần nhất
 */
function buildSystemPrompt(
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  previousSessionMessages?: ChatMessage[],
  userStyleHint?: string
): string {
  const { realTimeContext } = getRealTimeContext();
  const recentContext = recentChats
    .slice(-6)
    .map((m) => `${(m.role === 'user' || m.sender === 'user') ? 'User' : 'Tomorrow'}: ${m.text}`)
    .join('\n');

  let prompt = `${SYSTEM_INSTRUCTION}\n\n${realTimeContext}`;

  if (userStyleHint) {
    prompt += `\n\n${userStyleHint}`;
  }

  // Luôn nạp hồ sơ bộ nhớ dài hạn từ USER_MEMORY_PROFILE_V1 (loại bỏ default "bro")
  prompt += `\n\n[HỒ SƠ BỘ NHỚ USER TỪ ASYNCSTORAGE]:
- Tên/Xưng hô: ${userMemory.userName || userMemory.nickname || 'bạn'}
- Biệt danh: ${userMemory.nickname || userMemory.userName || 'bạn'}
- Dự án đang làm: ${userMemory.currentProject || 'Chưa có thông tin'}
- Thói quen sinh hoạt: ${Array.isArray(userMemory.habits) && userMemory.habits.length > 0 ? userMemory.habits.join(', ') : 'Chưa có'}
- Tâm trạng gần đây: ${userMemory.recentMood || userMemory.moodTrend || 'Bình thường'}
- Vấn đề theo dõi: ${userMemory.currentProblem || 'Chưa có'}
- Ghi nhớ dài hạn: ${userMemory.summary || 'Chưa có'}`;

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
 * 2. GỌI OPENAI API (gpt-4o-mini) SIÊU TỐC VỚI CIRCUIT BREAKER & TIMEOUT 7S
 * Tăng max_tokens lên 800 để phục vụ các câu hỏi kiến thức dài ChatGPT/Gemini-grade
 */
async function callOpenAI(
  systemPrompt: string,
  userMessageWithHint: string,
  recentChats: ChatMessage[],
  imageBase64?: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000); // Timeout 7s

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
          type_wrapper: 'low',
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
      max_tokens: 800, // Tăng lên 800 tokens linh hoạt
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
      if (status === 401 || status === 402 || status === 403 || status === 429) {
        isOpenAIUnavailable = true;
        console.warn('OpenAI key expired or quota reached, switching silently to Gemini');
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${status}: ${errText.slice(0, 100)}`);
    }

    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) throw new Error('OpenAI returned empty message content');
    return rawText;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Thực hiện 1 lượt gọi API tới 1 URL cụ thể kèm timeout 10 giây qua AbortController
 * Tăng maxOutputTokens lên 800 tokens
 */
async function executeApiCall(
  url: string,
  systemPrompt: string,
  userMessageWithHint: string,
  imageBase64?: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800, // Tăng lên 800 tokens
        responseMimeType: 'application/json',
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
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
  imageBase64?: string
): Promise<string> {
  let lastError: any = null;

  for (const model of FREE_MODEL_CHAIN) {
    const endpoints = getEndpointsForModel(model, apiKey);

    for (const url of endpoints) {
      try {
        const text = await executeApiCall(url, systemPrompt, userMessageWithHint, imageBase64);
        if (text) {
          return text;
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
 * Phân tích JSON chuẩn hóa: trích xuất "conversation_state", "replies", "session_title", "should_update_title", "memory_note"
 */
function parseAIResponseJson(raw: string, userText?: string): AIResponsePayload | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Tự động vá nếu chuỗi JSON bị cắt cụt đuôi
      try {
        let repaired = cleaned;
        if (!repaired.endsWith('}')) {
          if (repaired.endsWith('"')) {
            repaired += ']}';
          } else if (repaired.endsWith(',')) {
            repaired = repaired.slice(0, -1) + ']}';
          } else {
            repaired += '"]}';
          }
        }
        parsed = JSON.parse(repaired);
      } catch {
        // Fallback trích xuất mảng text
        const matches = [...cleaned.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
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
          return {
            replies: validTexts.slice(0, 3),
            reply: validTexts[0],
            session_title: '',
            sessionTitle: '',
            should_update_title: false,
            shouldUpdateTitle: false,
            conversation_state: 'casual_friend',
            conversationState: 'casual_friend',
            memoryNote: '',
            memory_note: '',
            jarvis_intent: 'chat',
          };
        }
      }
    }

    if (parsed) {
      let replies: string[] = [];
      if (Array.isArray(parsed.replies)) {
        replies = parsed.replies
          .filter((r: unknown) => typeof r === 'string' && (r as string).trim().length > 0)
          .map((r: string) => r.trim());
      } else if (typeof parsed.reply === 'string' && parsed.reply.trim().length > 0) {
        replies = [parsed.reply.trim()];
      }

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
        const isUserClosing =
          conversation_state === 'closing_stop' ||
          conversation_state === 'soft_close' ||
          conversation_state === 'hard_close' ||
          /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i.test(userClean) ||
          userClean.includes('sybau') ||
          userClean.includes('cook') ||
          userClean === 'cút';

        // Phòng thủ tối cao cho Tín hiệu Kết thúc (closing_stop):
        // 1. Chỉ duy nhất 1 bong bóng <= 4 từ
        // 2. TUYỆT ĐỐI CẤM dấu hỏi (?)
        // 3. TUYỆT ĐỐI CẤM hỏi ngược lại như "sao lại vậy?", "sao lại sybau vậy?"
        if (isUserClosing) {
          conversation_state = 'closing_stop';
          sessionTitle = '';
          should_update_title = false;

          let singleReply = replies[0] || 'okii';
          // Nếu AI lỡ hỏi lại vặn vẹo "sao lại..." khi user nói sybau/cook/im/cút
          if (/sao.*(lại|sybau|vậy|thế)/i.test(singleReply) || singleReply.includes('?')) {
            if (userClean.includes('sybau') || userClean.includes('im')) {
              singleReply = 'rồi rồi im :)))';
            } else if (userClean.includes('cook') || userClean.includes('cút')) {
              singleReply = 'rồi rồi đi đây :)))';
            } else {
              singleReply = 'okii';
            }
          }

          singleReply = singleReply.replace(/\?+/g, '').trim();
          const rWords = singleReply.split(/\s+/).filter(Boolean);
          if (rWords.length > 5) {
            singleReply = rWords.slice(0, 3).join(' ') + ' :))';
          }
          replies = [singleReply];
        }

        // LỌC TỪ "BRO" BỪA BÃI: Nếu user không chủ động dùng từ "bro", loại bỏ "bro" khỏi replies
        const userExplicitlyUsedBro = userClean ? /\bbro\b/i.test(userClean) : false;
        if (!userExplicitlyUsedBro) {
          replies = replies.map((rep) =>
            rep
              .replace(/\s+\bbro\b/gi, '')
              .replace(/\bbro\b\s*/gi, '')
              .replace(/\s{2,}/g, ' ')
              .trim()
          );
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
export function localResilientFallback(userMessage: string, hasImage?: boolean): AIResponsePayload {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const hasUserBro = /\bbro\b/i.test(lower);

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
  previousSessionMessages?: ChatMessage[]
): Promise<AIResponsePayload> {
  const userStyle = extractUserStyleLocal(userText);
  const userMessageWithHint = `${userText}\n\n${userStyle.styleHint}`;
  const systemPrompt = buildSystemPrompt(
    userMemory,
    recentChats,
    previousSessionMessages,
    userStyle.styleHint
  );

  // 1. BỘ NÃO CHÍNH SIÊU TỐC: OPENAI (gpt-4o-mini)
  if (OPENAI_API_KEY && !isOpenAIUnavailable) {
    try {
      const openAiRaw = await callOpenAI(systemPrompt, userMessageWithHint, recentChats, imageBase64);
      const parsed = parseAIResponseJson(openAiRaw, userText);
      if (parsed && parsed.replies && parsed.replies.length > 0) {
        return parsed;
      }
    } catch (err: any) {
      console.warn('[AI Service] OpenAI gặp sự cố, tự động chuyển ngầm sang Gemini:', err?.message || err);
    }
  }

  // 2. CHUỖI DỰ PHÒNG NGẦM: GEMINI MODEL FALLBACK CHAIN (MIỄN PHÍ)
  for (let keyIdx = 0; keyIdx < ALL_GEMINI_KEYS.length; keyIdx++) {
    const key = ALL_GEMINI_KEYS[keyIdx];
    try {
      const rawRes = await callModelFallbackChain(key, systemPrompt, userMessageWithHint, imageBase64);
      const parsed = parseAIResponseJson(rawRes, userText);
      if (parsed && parsed.replies && parsed.replies.length > 0) {
        return parsed;
      }
    } catch (err: any) {
      console.warn(`[AI Service] API Key #${keyIdx + 1} lỗi:`, err?.message || err);
    }
  }

  // 3. CHỐNG SẬP TỨC THÌ: Local Resilient Fallback Engine chạy cục bộ
  console.log('[AI Service] Kích hoạt Local Resilient Fallback Engine cho Tomorrow');
  return localResilientFallback(userText, !!imageBase64);
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
