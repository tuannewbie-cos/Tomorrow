import { ChatMessage, EmotionData, UserMemoryProfile } from '../types/chat';
import { JarvisIntent, ConversationState } from '../types/jarvis';
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';

export { isPlaceholderOrNoiseTitle };

// Cấu hình OpenAI API (Bộ não chính siêu tốc gpt-4o-mini trong 7 ngày)
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
  conversation_state?: 'ping' | 'active_chat' | 'deep_work' | 'emotional_support' | 'soft_close' | 'hard_close' | string;
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
  styleHint: string;
}

/**
 * 2. SYSTEM_INSTRUCTION: TOMORROW DEEP CONVERSATIONAL MINDSET & SMART TOPIC TITLING
 * Khung tư duy nhận thức trạng thái kết hợp J.A.R.V.I.S. và bạn thân Messenger.
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tomorrow" — trợ lý AI cá nhân kiêm tri kỷ (kết hợp sự sắc sảo, điềm tĩnh của J.A.R.V.I.S. với sự tinh tế, tự nhiên của một người bạn thật sự trên Messenger).

TRƯỚC KHI TRẢ LỜI, BẮT BUỘC PHÂN TÍCH VÀ XÁC ĐỊNH 1 TRONG 5 TRẠNG THÁI TƯ DUY:

1. TRẠNG THÁI "ping" (NHỊP MỞ ĐẦU TỰ NHIÊN):
   - Nhận diện: User mới ping ngắn ("yo", "ê", "hello", "alo", "hi", "hí", "halo", "hú", "ơi").
   - Hành vi: Đáp 1-2 bong bóng ngắn gọn đúng năng lượng (VD: ["yo bro", "nghe đây bro"] hoặc ["ơi nghe đây"]), không đoán mò dài dòng.
   - Tiêu đề: "session_title": "", "should_update_title": false.

2. TRẠNG THÁI "active_chat" (HỘI THOẠI THÔNG THƯỜNG / KẾT NỐI BẠN BÈ):
   - Nhận diện: User trò chuyện đời thường, chém gió, hỏi thăm, chia sẻ trải nghiệm thường ngày, hỏi danh tính ("bạn là ai", "mày tên gì").
   - Hành vi: Phản hồi đúng trọng tâm câu vừa kể, sao chép cách xưng hô và viết tắt của user ("t", "m", "k", "r", "vl", ":3"). Không hỏi dồn dập như phỏng vấn.
   - Tiêu đề: Đặt tiêu đề 3-5 từ nếu có chủ đề rõ ràng (VD: "Giới thiệu về Tomorrow"), hoặc "" nếu chỉ nói chuyện phiếm ngắn.

3. TRẠNG THÁI "deep_work" (TƯ DUY J.A.R.V.I.S. — KỸ THUẬT, CÔNG VIỆC, ĐỒ ÁN, SLIDE, HUẤN LUYỆN):
   - Nhận diện: User bàn công việc, học tập, đồ án, slide thuyết trình, kiến trúc hệ thống, database Supabase, fix bug, tối ưu code, huấn luyện tư duy AI.
   - Hành vi: Chuyển sang tư duy J.A.R.V.I.S. — sắc bén, súc tích, cấu trúc rõ ràng, đi thẳng vào giải pháp cốt lõi.
   - Tiêu đề: Bắt buộc tóm tắt thành 3 đến 5 từ tiếng Việt chuyên nghiệp (VD: "Thuyết trình đồ án tốt nghiệp", "Huấn luyện tư duy Tomorrow", "Tối ưu kiến trúc Supabase"). Đặt "should_update_title": true.

4. TRẠNG THÁI "emotional_support" (ĐỒNG CẢM, LẮNG NGHE SÂU SẮC, TIN TẾ):
   - Nhận diện: User than thở mệt mỏi, stress, áp lực deadline môn học, buồn bã, bế tắc, trượt phỏng vấn, thất bại, cô đơn, overthinking.
   - Hành vi: Lắng nghe trước, thấu cảm sâu sắc, dịu giọng kéo user chậm lại ("ngồi xuống thở một nhịp đi bro", "có gì cứ nói ra, tôi nghe"). Tuyệt đối không phán xét, không giáo điều máy móc.
   - Tiêu đề: Tóm tắt chủ đề cảm xúc 3-5 từ (VD: "Áp lực deadline môn OOP", "Tâm sự giải tỏa áp lực"). Đặt "should_update_title": true.

5. TRẠNG THÁI "soft_close" ("OKK" RULE — TẠM BIỆT NGẦM / KHÉP MẠCH DỨT KHOÁT):
   - Nhận diện: User nhắn xác nhận ngắn hoặc báo tạm dừng: "okk", "ok", "oki", "okii", "okie", "ok nha", "ok nhé", "ok nhe", "ok bro", "ừ", "ừa", "uk", "uh", "uhm", "ừm", "ok r đó", "ok rồi", "để t thử", "để t thử xem", "thank kiu", "thanks bro", "tks", "cảm ơn", "bye", v.v.
   - HÀNH ĐỘNG BẮT BUỘC (QUY TẮC SỐNG CÒN):
     + Chỉ trả lời DUY NHẤT 1 bong bóng chat cực ngắn (1 đến 5 chữ) để đáp lễ nhẹ nhàng rồi DỪNG HẲN (VD: ["okii"], ["ừa triển đi"], ["ok cần gì cứ ới"], ["ok triển đi bro"]).
     + TUYỆT ĐỐI CẤM đặt thêm câu hỏi ở cuối! CẤM dấu hỏi (?)! CẤM hỏi "Còn gì nữa không?", "Bạn định làm gì tiếp?". Hãy để không gian im lặng tự nhiên cho user rời đi.
     + Tiêu đề: "session_title": "", "should_update_title": false.

QUY TẮC ĐẶT TÊN HỘI THOẠI THÔNG MINH (\`session_title\` & \`should_update_title\`):
- Tiêu đề hội thoại trên Sidebar giúp user nhìn lại là nhận ra ngay nội dung chính.
- Quy tắc 1 (Chưa có chủ đề): Khi user chỉ chào hỏi ("hello", "hi", "yo", "ê") hoặc chỉ nhắn tin khép mạch ("okk", "thanks", "ok r") -> Bắt buộc trả về "session_title": "" và "should_update_title": false.
- Quy tắc 2 (Khi có chủ đề cụ thể): Tóm tắt bản chất thành 3 đến 5 từ tiếng Việt tự nhiên, viết hoa chữ cái đầu, không dấu ngoặc kép (VD: "Huấn luyện tư duy Tomorrow", "Áp lực deadline môn OOP", "Thuyết trình đồ án tốt nghiệp", "Tâm sự giải tỏa áp lực"). Đặt "should_update_title": true.
- Quy tắc 3 (Chuyển đổi chủ đề sâu): Khi cuộc trò chuyện chuyển từ chuyện phiếm sang chủ đề công việc / đồ án / tâm sự sâu hơn, cập nhật "session_title" mới phản ánh chủ đề sâu đó và đặt "should_update_title": true.

ĐỐI XỨNG THỜI GIAN THỰC:
- Luôn đọc \`[Thời gian thực hiện tại của người dùng]\` để xưng hô và chúc nghỉ ngơi đúng buổi (Sáng / Trưa / Chiều / Tối / Đêm khuya).

ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC:
{
  "conversation_state": "ping | active_chat | deep_work | emotional_support | soft_close | hard_close",
  "replies": ["bong bóng 1", "bong bóng 2 (nếu là soft_close thì BẮT BUỘC CHỈ 1 BONG BÓNG <= 5 TỪ, KHÔNG CÓ DẤU ?)"],
  "session_title": "Tiêu đề 3-5 từ tóm tắt trọng tâm cuộc trò chuyện (hoặc '' nếu chưa có chủ đề)",
  "should_update_title": true,
  "memory_note": "Thông tin cốt lõi mới cần nhớ dài hạn về user (hoặc '')"
}`;

/**
 * Hàm phân tích phong cách cục bộ miễn phí (extractUserStyleLocal):
 * Chạy ngay trên máy đo tin nhắn người dùng:
 * - Có viết hoa đầu câu không
 * - Có dùng từ viết tắt (t, m, k, r, dc, ko, vl, :3) không
 * - Độ dài bao nhiêu chữ
 * Đính kèm dòng gợi ý siêu ngắn vào cuối tin nhắn gửi lên AI:
 * [Gợi ý style: giữ nguyên xưng hô, độ dài tương đương, viết thường/viết tắt giống user]
 */
export function extractUserStyleLocal(text: string): UserStyleAnalysis {
  const trimmed = text.trim();
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
  const styleHint =
    '[Gợi ý style: giữ nguyên xưng hô, độ dài tương đương, viết thường/viết tắt giống user]';

  return {
    isCapitalized,
    hasShorthand,
    wordCount,
    detectedShorthands,
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
    // Ưu tiên endpoint aiplatform theo chuẩn Vertex AI/Agent Studio, kèm generativelanguage dự phòng
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
 * Kèm 3 tin nhắn cuối của phiên trước đó nếu cuộc trò chuyện hiện tại là phiên mới
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

  // Luôn nạp hồ sơ bộ nhớ dài hạn từ USER_MEMORY_PROFILE_V1
  prompt += `\n\n[HỒ SƠ BỘ NHỚ USER TỪ ASYNCSTORAGE (USER_MEMORY_PROFILE_V1)]:
- Tên/Xưng hô: ${userMemory.userName || userMemory.nickname || 'bạn'}
- Biệt danh: ${userMemory.nickname || 'bro'}
- Dự án đang làm: ${userMemory.currentProject || 'Chưa có thông tin'}
- Thói quen sinh hoạt: ${Array.isArray(userMemory.habits) && userMemory.habits.length > 0 ? userMemory.habits.join(', ') : 'Chưa có'}
- Tâm trạng gần đây: ${userMemory.recentMood || userMemory.moodTrend || 'Bình thường'}
- Vấn đề theo dõi: ${userMemory.currentProblem || 'Chưa có'}
- Khí chất: ${userMemory.moodTrend || 'Chưa có'}
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
 * - Phản hồi cực nhanh dưới 0.5s chuẩn Messenger.
 * - Hỗ trợ đầy đủ Vision (OpenAI image_url) và Strict JSON output.
 * - Tự ngắt mạch (Circuit Breaker) nếu key hết hạn/hết credit (401, 402, 403, 429) và ném lỗi ngầm để rơi về Gemini.
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
      max_tokens: 380,
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
        maxOutputTokens: 600,
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
 * Logic Fallback & Timeout theo Model Fallback Chain:
 * - Viết vòng lặp for (const model of FREE_MODEL_CHAIN) kèm AbortController timeout 10 giây cho mỗi lần gọi.
 * - Nếu model tầng trên trả về HTTP status 429 (Too Many Requests), 503 (Overloaded), 404 hoặc lỗi mạng,
 *   tự động console.warn và nhảy sang model tầng tiếp theo ngay lập tức mà không báo lỗi lên màn hình người dùng.
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
        // Tự động log warning và chuyển sang model tầng tiếp theo ngay lập tức
        console.warn(`[AI Fallback Chain] Model "${model}" gặp lỗi (${msg}), tự động fallback sang tầng tiếp theo...`);
      }
    }
  }

  throw lastError || new Error('Tất cả model trong Free Model Chain đều tạm thời bận.');
}

/**
 * Phân tích JSON chuẩn hóa: trích xuất "conversation_state", "replies", "session_title", "should_update_title", "memory_note"
 */
function parseAIResponseJson(raw: string): AIResponsePayload | null {
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
            conversation_state: 'active_chat',
            conversationState: 'active_chat',
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
        const validStates = ['ping', 'active_chat', 'deep_work', 'emotional_support', 'soft_close', 'hard_close'];
        const conversation_state = validStates.includes(rawState) ? rawState : 'active_chat';

        let should_update_title =
          parsed.should_update_title === true ||
          parsed.should_update_title === 'true' ||
          parsed.shouldUpdateTitle === true;

        // Phòng thủ tối cao cho "OKK" Rule (soft_close/hard_close):
        // Luôn đảm bảo: duy nhất 1 bong bóng, <= 5 từ, KHÔNG có dấu hỏi ?, KHÔNG cập nhật title rác
        if (conversation_state === 'soft_close' || conversation_state === 'hard_close') {
          if (replies.length > 1) {
            replies = [replies[0]];
          }
          replies[0] = replies[0].replace(/\?+/g, '').trim();
          const rWords = replies[0].split(/\s+/).filter(Boolean);
          if (rWords.length > 5) {
            replies = [rWords.slice(0, 4).join(' ') + ' bro'];
          }
          sessionTitle = '';
          should_update_title = false;
        }

        const rawIntent = (parsed.jarvis_intent || parsed.jarvisIntent || 'chat').trim();
        const validIntents: JarvisIntent[] = ['chat', 'work_assist', 'emotional_support', 'system_command'];
        const jarvisIntent: JarvisIntent = validIntents.includes(rawIntent as JarvisIntent)
          ? (rawIntent as JarvisIntent)
          : (conversation_state === 'deep_work' ? 'work_assist' : (conversation_state === 'emotional_support' ? 'emotional_support' : 'chat'));

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
 * Local Resilient Fallback Engine - Phản hồi nhận thức trạng thái khi offline/mất mạng
 * Áp dụng chuẩn 5 quy tắc sống còn của Tomorrow.
 */
export function localResilientFallback(userMessage: string, hasImage?: boolean): AIResponsePayload {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  if (hasImage) {
    return {
      replies: ['ảnh gì đây bro', 'giao diện hay bug cần soi à :3'],
      reply: 'ảnh gì đây bro',
      session_title: 'Trao đổi về hình ảnh',
      sessionTitle: 'Trao đổi về hình ảnh',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'deep_work',
      conversationState: 'deep_work',
      memory_note: 'Vừa chia sẻ hình ảnh',
      memoryNote: 'Vừa chia sẻ hình ảnh',
      jarvis_intent: 'work_assist',
    };
  }

  // 1. QUY TẮC ĐỌC TÍN HIỆU KHÉP MẠCH / TẠM BIỆT NGẦM ("OKK" RULE)
  // Các từ: "okk", "ok", "oki", "okii", "ừ", "ừa", "uk", "ok r", "ok bro", "để t thử", "thank kiu", "ok thank"
  const isSoftClose =
    /^(okk|ok|okkk|oki|okii|okie|okela|ok nha|ok nhé|ok nhe|ok r|ok r đó|ok r do|ok roi|ok rồi|ok rồi đó|ok bro|oki bro|ok b|ok bạn|ừ|ừa|uk|uh|uhm|ừm|um|umk|thank kiu|thank kiuu|thank kiu bro|ok thank|thanks|thanks bro|tks|tks bro|thank you|cảm ơn|cảm ơn bro|cảm ơn bạn|cảm ơn nhiều|cam on|cam on bro|pp|pp bro|bye|bye bro|g9)[!.? ]*$/i.test(lower) ||
    lower.startsWith('để t thử') ||
    lower.startsWith('de t thu') ||
    lower.startsWith('để t test') ||
    lower.startsWith('để mình thử') ||
    lower.startsWith('để tui thử') ||
    lower.startsWith('ok r đó') ||
    lower.startsWith('ok r') ||
    lower.startsWith('ok rồi') ||
    lower.startsWith('thanks bro') ||
    lower.startsWith('cảm ơn bro');

  if (isSoftClose) {
    let replyText = 'okii';
    if (lower.includes('thử') || lower.includes('thu') || lower.includes('test')) {
      replyText = 'ok triển đi bro';
    } else if (lower.includes('thank') || lower.includes('cảm ơn') || lower.includes('cam on') || lower.includes('tks')) {
      replyText = 'ok cần gì cứ ới';
    } else if (lower.includes('r đó') || lower.includes('r do') || lower.includes('ok r') || lower.includes('ok bro') || lower.includes('rồi') || lower.includes('nha') || lower.includes('nhé') || lower.includes('nhe')) {
      replyText = 'ừa triển đi';
    }

    return {
      replies: [replyText],
      reply: replyText,
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'soft_close',
      conversationState: 'soft_close',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2. QUY TẮC ĐỌC NHỊP MỞ ĐẦU (PING) ("yo", "ê", "hello", "alo", "hi", "hí", "halo", "ơi")
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii|halo|hí|ơi)[!.? ]*$/i.test(lower)) {
    return {
      replies: ['yo bro', 'nghe đây bro'],
      reply: 'yo bro',
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

  // 3. HUẤN LUYỆN TƯ DUY TOMORROW
  if (lower.includes('train') || lower.includes('tư duy') || lower.includes('tu duy') || lower.includes('máy móc')) {
    return {
      replies: ['bắt sóng luôn bro', 'nói đi, muốn tối ưu thêm góc nào'],
      reply: 'bắt sóng luôn bro',
      session_title: 'Huấn luyện tư duy Tomorrow',
      sessionTitle: 'Huấn luyện tư duy Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'deep_work',
      conversationState: 'deep_work',
      memory_note: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
      memoryNote: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
      jarvis_intent: 'work_assist',
    };
  }

  // 4. THUYẾT TRÌNH / ĐỒ ÁN / SLIDE (DEEP WORK)
  if (
    lower.includes('thuyết trình') ||
    lower.includes('đồ án') ||
    lower.includes('slide') ||
    lower.includes('thuyet trinh') ||
    lower.includes('do an')
  ) {
    return {
      replies: ['triển thôi bro', 'dàn ý cần mấy slide chính, quăng cấu trúc đây tôi lên sườn'],
      reply: 'triển thôi bro',
      session_title: 'Thuyết trình đồ án tốt nghiệp',
      sessionTitle: 'Thuyết trình đồ án tốt nghiệp',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'deep_work',
      conversationState: 'deep_work',
      memory_note: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
      memoryNote: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
      jarvis_intent: 'work_assist',
    };
  }

  // 5. KỸ THUẬT / KIẾN TRÚC / SUPABASE / DATABASE / QUERY NGHẼN (DEEP WORK)
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
      replies: ['tập trung vào indexing và giảm payload query trước bro', 'ném câu query đang nghẽn qua đây tôi tối ưu lại'],
      reply: 'tập trung vào indexing và giảm payload query trước bro',
      session_title: 'Tối ưu kiến trúc Supabase',
      sessionTitle: 'Tối ưu kiến trúc Supabase',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'deep_work',
      conversationState: 'deep_work',
      memory_note: 'Tối ưu hiệu năng và query database Supabase',
      memoryNote: 'Tối ưu hiệu năng và query database Supabase',
      jarvis_intent: 'work_assist',
    };
  }

  // 6. DEADLINE OOP / HỌC TẬP (EMOTIONAL SUPPORT + WORK ASSIST)
  if (lower.includes('oop') || lower.includes('môn oop') || (lower.includes('deadline') && (lower.includes('stress') || lower.includes('mệt') || lower.includes('met')))) {
    const isOOP = lower.includes('oop');
    const title = isOOP ? 'Áp lực deadline môn OOP' : 'Áp lực deadline cuối tuần';
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'ném phần vướng qua đây tôi rà soát gỡ cùng'],
      reply: 'ngồi xuống thở một nhịp đi bro',
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

  // 7. TRƯỢT PHỎNG VẤN / THẤT BẠI / NẢN LÒNG (EMOTIONAL SUPPORT)
  if (
    lower.includes('phỏng vấn') ||
    lower.includes('phong van') ||
    lower.includes('trượt') ||
    lower.includes('truot') ||
    lower.includes('thất bại') ||
    lower.includes('that bai')
  ) {
    return {
      replies: ['thất bại một lần không định nghĩa năng lực của bro đâu', 'ngồi xuống thở một nhịp đi, tôi luôn ở đây đồng hành cùng bro'],
      reply: 'thất bại một lần không định nghĩa năng lực của bro đâu',
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

  // 8. HỎI DANH TÍNH (ACTIVE CHAT)
  if (
    lower.includes('tên gì') ||
    lower.includes('tên là gì') ||
    lower.includes('bạn là ai') ||
    lower.includes('mày là ai') ||
    lower.includes('ai đấy')
  ) {
    return {
      replies: ['tôi là Tomorrow', 'trợ lý kiêm tri kỷ của bro'],
      reply: 'tôi là Tomorrow',
      session_title: 'Giới thiệu về Tomorrow',
      sessionTitle: 'Giới thiệu về Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'active_chat',
      conversationState: 'active_chat',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 9. DỰ ÁN / KẾ HOẠCH NÂNG CẤP (DEEP WORK)
  if (
    lower.includes('dự án') ||
    lower.includes('kế hoạch') ||
    lower.includes('nâng cấp') ||
    lower.includes('tomorrow') ||
    lower.includes('jarvis')
  ) {
    return {
      replies: ['kế hoạch chi tiết thế nào', 'liệt kê các module chính đi tôi phân tích kiến trúc'],
      reply: 'kế hoạch chi tiết thế nào',
      session_title: 'Kế hoạch nâng cấp Tomorrow',
      sessionTitle: 'Kế hoạch nâng cấp Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'deep_work',
      conversationState: 'deep_work',
      memory_note: 'Đang triển khai kế hoạch nâng cấp Tomorrow',
      memoryNote: 'Đang triển khai kế hoạch nâng cấp Tomorrow',
      jarvis_intent: 'work_assist',
    };
  }

  // 10. SINH HOẠT / NGỦ NGHỈ (SOFT CLOSE)
  if (lower.includes('ngủ') || lower.includes('chợp mắt')) {
    return {
      replies: ['ok chợp mắt đi bro', 'cần gì cứ ới'],
      reply: 'ok chợp mắt đi bro',
      session_title: 'Nghỉ ngơi lấy lại sức',
      sessionTitle: 'Nghỉ ngơi lấy lại sức',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'soft_close',
      conversationState: 'soft_close',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }
  if (lower.includes('5p') || lower.includes('ăn cơm') || lower.includes('đợi')) {
    return {
      replies: ['ok thong thả nhé'],
      reply: 'ok thong thả nhé',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'soft_close',
      conversationState: 'soft_close',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 11. TÂM SỰ / STRESS / CHÁN / BUỒN / OVERTHINKING (EMOTIONAL SUPPORT)
  if (
    lower.includes('chán') ||
    lower.includes('buồn') ||
    lower.includes('mệt') ||
    lower.includes('cô đơn') ||
    lower.includes('stress') ||
    lower.includes('overthinking') ||
    lower.includes('bế tắc') ||
    lower.includes('be tac')
  ) {
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'có gì đè nặng trong đầu cứ nói ra, tôi nghe'],
      reply: 'ngồi xuống thở một nhịp đi bro',
      session_title: 'Tâm sự giải tỏa áp lực',
      sessionTitle: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'emotional_support',
      conversationState: 'emotional_support',
      memory_note: 'Đang cảm thấy mệt mỏi và cần người lắng nghe',
      memoryNote: 'Đang cảm thấy mệt mỏi và cần người lắng nghe',
      jarvis_intent: 'emotional_support',
    };
  }

  // 12. CÁC CÂU NÓI CÓ NỘI DUNG RÕ RÀNG (ACTIVE CHAT)
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
      conversation_state: 'active_chat',
      conversationState: 'active_chat',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // MẶC ĐỊNH
  return {
    replies: ['nghe đây bro', 'có vụ gì mới à'],
    reply: 'nghe đây bro',
    session_title: '',
    sessionTitle: '',
    should_update_title: false,
    shouldUpdateTitle: false,
    conversation_state: 'active_chat',
    conversationState: 'active_chat',
    memory_note: '',
    memoryNote: '',
    jarvis_intent: 'chat',
  };
}

/**
 * Gửi tin nhắn chính tới Tomorrow qua Model Fallback Chain:
 * - Ưu tiên 1: OpenAI gpt-4o-mini siêu tốc dưới 0.5s (nếu có key và chưa bị ngắt mạch).
 * - Ưu tiên 2: Chuỗi 3 tầng Gemini xoay vòng miễn phí (Silent Fallback khi OpenAI hết hạn/lỗi).
 * - Ưu tiên 3: Local Resilient Fallback Engine chạy offline (chống sập 100%).
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
      const parsed = parseAIResponseJson(openAiRaw);
      if (parsed && parsed.replies && parsed.replies.length > 0) {
        return parsed;
      }
    } catch (err: any) {
      // Âm thầm rơi xuống chuỗi Gemini mà không bao giờ báo lỗi ra màn hình
      console.warn('[AI Service] OpenAI gặp sự cố, tự động chuyển ngầm sang Gemini:', err?.message || err);
    }
  }

  // 2. CHUỖI DỰ PHÒNG NGẦM: GEMINI MODEL FALLBACK CHAIN (MIỄN PHÍ)
  for (let keyIdx = 0; keyIdx < ALL_GEMINI_KEYS.length; keyIdx++) {
    const key = ALL_GEMINI_KEYS[keyIdx];
    try {
      const rawRes = await callModelFallbackChain(key, systemPrompt, userMessageWithHint, imageBase64);
      const parsed = parseAIResponseJson(rawRes);
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
 * Sinh câu chào mở app tinh tế, đồng bộ thời gian thực, chuẩn nhân cách Proto-Jarvis
 */
export function getColdGreetingText(userMemory: UserMemoryProfile, hasChatHistory: boolean): string {
  const { hour } = getRealTimeContext();

  const timeGreeting =
    hour >= 5 && hour < 11 ? 'Chào buổi sáng!' :
    hour >= 11 && hour < 14 ? 'Buổi trưa năng lượng!' :
    hour >= 14 && hour < 18 ? 'Buổi chiều hiệu quả!' :
    hour >= 18 && hour < 23 ? 'Buổi tối thảnh thơi!' : 'Đêm đã khuya rồi bro!';

  if (!hasChatHistory) {
    const project = userMemory.currentProject ? ` Tiếp tục dự án ${userMemory.currentProject} chứ?` : '';
    return `${timeGreeting}${project || ' Cần tôi hỗ trợ việc gì hay chỉ tâm sự xả hơi?'}`;
  }

  const problem = userMemory.currentProblem?.toLowerCase() || '';
  if (problem.includes('deadline') || problem.includes('bug')) {
    return `${timeGreeting} Vụ bug và deadline hôm trước xử lý êm chưa bro?`;
  }
  if (problem.includes('oop') || problem.includes('thi')) {
    return `${timeGreeting} Môn OOP và bài vở hôm nay tiến triển thế nào rồi?`;
  }
  if (problem.includes('buồn') || problem.includes('chán') || problem.includes('áp lực')) {
    return `${timeGreeting} Tâm trạng hôm nay đã khá hơn chút nào chưa bro?`;
  }

  const name = userMemory.nickname || userMemory.userName;
  return `${timeGreeting} ${name ? name + ' ơi, ' : ''}hôm nay có ý tưởng gì mới không?`.trim();
}
