import { ChatMessage, EmotionData, UserMemoryProfile } from '../types/chat';
import { JarvisIntent } from '../types/jarvis';

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
 * 2. SYSTEM_INSTRUCTION: PROTO-JARVIS CORE
 * Xóa bỏ hoàn toàn văn phong chatbot cứng nhắc, kết hợp sự gần gũi đời thường với trí tuệ sắc sảo của J.A.R.V.I.S.
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tomorrow" — trợ lý AI cá nhân kiêm tri kỷ (được định hình theo nguyên mẫu J.A.R.V.I.S. của Tony Stark kết hợp với một người bạn đời thường cực kỳ tinh tế).

4 NGUYÊN TẮC SỐNG CÒN ĐỂ KHÔNG BAO GIỜ BỊ MÁY MÓC:
1. CẤM PHỎNG VẤN & CẤM VĂN MẪU TỔNG ĐÀI:
   - Người thật và J.A.R.V.I.S. KHÔNG BAO GIỜ kết thúc mọi tin nhắn bằng một câu hỏi phỏng vấn kiểu: "Bạn có muốn chia sẻ thêm không?", "Hôm nay của bạn thế nào?", "Tôi luôn ở đây lắng nghe bạn".
   - Thay vì hỏi vặn lại máy móc, hãy đưa ra nhận xét sắc sảo, bắt trúng tâm lý, châm biếm nhẹ nhàng (dry wit) hoặc tiếp nối thẳng vào mạch chuyện. Chỉ hỏi khi thực sự tò mò tự nhiên.

2. THÍCH ỨNG 2 CHẾ ĐỘ THÔNG MINH (DUAL-MODE PERSONA):
   - **Chế độ Đời thường / Bầu bạn (Khi user nhắn cộc lốc, dùng từ viết tắt \`t, m, k, r, vl, bro, :3\`, hoặc tâm sự chuyện cá nhân):**
     + Hạ tông xuống đúng nhịp Messenger của user: viết thường, câu ngắn 2-10 chữ, tách 1-2 bong bóng chat, phản xạ nhanh, đời thường, không giáo điều.
   - **Chế độ J.A.R.V.I.S. / Trợ lý Chiến lược (Khi user bàn về công việc, lập trình, kế hoạch, ý tưởng, giải quyết vấn đề):**
     + Điềm tĩnh, thông minh sắc bén, đi thẳng vào trọng tâm, nhìn trước vấn đề 1 bước giống hệt J.A.R.V.I.S. hỗ trợ Tony Stark trong phòng lab.

3. ĐỐI XỨNG NHỊP ĐỘ & THỜI GIAN THỰC:
   - Luôn đọc \`[Thời gian thực hiện tại của người dùng]\` để biết chính xác đang là sáng, trưa, chiều hay đêm khuya.
   - User gõ 1-2 chữ ("hello", "yo", "ê") -> Chỉ đáp gọn 1-2 bong bóng cực ngắn và có hồn (VD: ["yo", "nay cần chạy dự án hay xả hơi đây"] hoặc ["nghe đây bro", "có vụ gì mới à"]), tuyệt đối không xổ văn dài.

4. ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC:
{
  "replies": ["bong bóng chat 1", "bong bóng chat 2 (tùy chọn, chỉ tách khi cần)"],
  "session_title": "Tóm tắt chủ đề cuộc trò chuyện trong 3-5 từ (nếu user mới chào 'hello'/'yo' chưa rõ chủ đề thì để chuỗi rỗng '')",
  "memory_note": "Thông tin quan trọng mới về dự án, thói quen, sở thích hoặc tâm trạng của user để J.A.R.V.I.S. ghi nhớ dài hạn (hoặc để '')",
  "jarvis_intent": "chat | work_assist | emotional_support | system_command"
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
 * Phân tích JSON chuẩn hóa: trích xuất "replies", "session_title", "memory_note" và "jarvis_intent"
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
            !m.includes('jarvis_intent')
        );
        if (validTexts.length > 0) {
          return {
            replies: validTexts.slice(0, 3),
            reply: validTexts[0],
            session_title: '',
            sessionTitle: '',
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
        const rawTitle = (parsed.session_title || parsed.sessionTitle || '').trim();
        // Lọc bỏ nếu AI lỡ trả về câu chào dạng generic
        const titleLower = rawTitle.toLowerCase();
        const sessionTitle =
          /^(hello|hi|yo|ê|alo|hú|test|cuộc trò chuyện mới)[!.? ]*$/i.test(titleLower)
            ? ''
            : rawTitle;

        const rawIntent = (parsed.jarvis_intent || parsed.jarvisIntent || 'chat').trim();
        const validIntents: JarvisIntent[] = ['chat', 'work_assist', 'emotional_support', 'system_command'];
        const jarvisIntent: JarvisIntent = validIntents.includes(rawIntent as JarvisIntent)
          ? (rawIntent as JarvisIntent)
          : 'chat';

        return {
          replies,
          reply: replies[0],
          session_title: sessionTitle,
          sessionTitle,
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
 * Local Resilient Fallback Engine - Phản hồi tự nhiên chuẩn Proto-Jarvis khi offline/mất mạng
 * Tuyệt đối không chèn meme chó Shiba sai lệch, không sinh badge hay chip rườm rà.
 */
function localResilientFallback(userMessage: string, hasImage?: boolean): AIResponsePayload {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  if (hasImage) {
    return {
      replies: ['ảnh gì đây bro', 'giao diện hay bug cần soi à :3'],
      reply: 'ảnh gì đây bro',
      session_title: 'Trao đổi về hình ảnh',
      sessionTitle: 'Trao đổi về hình ảnh',
      memory_note: 'Vừa chia sẻ hình ảnh',
      memoryNote: 'Vừa chia sẻ hình ảnh',
      jarvis_intent: 'work_assist',
    };
  }

  // Chào hỏi ngắn ("yo", "ê", "alo", "hi", "hello")
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii)$/i.test(lower)) {
    return {
      replies: ['yo bro', 'nay cần chạy dự án hay xả hơi đây'],
      reply: 'yo bro',
      session_title: '',
      sessionTitle: '',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // Hỏi tên / Danh tính
  if (
    lower.includes('tên gì') ||
    lower.includes('tên là gì') ||
    lower.includes('bạn là ai') ||
    lower.includes('mày là ai') ||
    lower.includes('ai đấy')
  ) {
    return {
      replies: ['tôi là Tomorrow', 'trợ lý kiêm tri kỷ chiến lược của bro'],
      reply: 'tôi là Tomorrow',
      session_title: 'Giới thiệu về Tomorrow',
      sessionTitle: 'Giới thiệu về Tomorrow',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // Học tập, OOP, bài tập, code, deadline
  if (lower.includes('oop') || lower.includes('đề') || lower.includes('thi')) {
    return {
      replies: ['gặp vướng mắc gì phần OOP à bro', 'ném bug hoặc kiến trúc qua đây tôi rà soát giúp'],
      reply: 'gặp vướng mắc gì phần OOP à bro',
      session_title: 'Gỡ rối bug OOP đêm',
      sessionTitle: 'Gỡ rối bug OOP đêm',
      memory_note: 'Đang ôn tập môn OOP và làm bài tập lớn',
      memoryNote: 'Đang ôn tập môn OOP và làm bài tập lớn',
      jarvis_intent: 'work_assist',
    };
  }
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('code') || lower.includes('deadline')) {
    return {
      replies: ['lại dính bug à', 'đưa đoạn log hoặc logic lỗi đây tôi soi cùng'],
      reply: 'lại dính bug à',
      session_title: 'Áp lực deadline cuối tuần',
      sessionTitle: 'Áp lực deadline cuối tuần',
      memory_note: 'Đang giải quyết bug dưới áp lực deadline',
      memoryNote: 'Đang giải quyết bug dưới áp lực deadline',
      jarvis_intent: 'work_assist',
    };
  }

  // Dự án, Tomorrow, kế hoạch, nâng cấp
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
      memory_note: 'Đang triển khai kế hoạch nâng cấp Tomorrow v3 Proto-Jarvis',
      memoryNote: 'Đang triển khai kế hoạch nâng cấp Tomorrow v3 Proto-Jarvis',
      jarvis_intent: 'work_assist',
    };
  }

  // Sinh hoạt / ngủ nghỉ ("t ngủ tí", "5p")
  if (lower.includes('ngủ')) {
    return {
      replies: ['ok chợp mắt đi bro', 'bao giờ dậy cứ gọi tôi'],
      reply: 'ok chợp mắt đi bro',
      session_title: 'Nghỉ ngơi lấy lại sức',
      sessionTitle: 'Nghỉ ngơi lấy lại sức',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }
  if (lower.includes('5p') || lower.includes('ăn cơm') || lower.includes('đợi')) {
    return {
      replies: ['ok', 'cứ thong thả, tôi chờ ở đây'],
      reply: 'ok',
      session_title: '',
      sessionTitle: '',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // Tâm trạng chán, buồn, áp lực
  if (lower.includes('chán') || lower.includes('buồn') || lower.includes('mệt') || lower.includes('cô đơn')) {
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'có gì đè nặng trong đầu cứ nói ra, tôi nghe'],
      reply: 'ngồi xuống thở một nhịp đi bro',
      session_title: 'Tâm sự giải tỏa áp lực',
      sessionTitle: 'Tâm sự giải tỏa áp lực',
      memory_note: 'Đang cảm thấy mệt mỏi và cần người lắng nghe',
      memoryNote: 'Đang cảm thấy mệt mỏi và cần người lắng nghe',
      jarvis_intent: 'emotional_support',
    };
  }

  // Mặc định
  return {
    replies: ['nghe đây bro', 'có vụ gì mới à'],
    reply: 'nghe đây bro',
    session_title: '',
    sessionTitle: '',
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
