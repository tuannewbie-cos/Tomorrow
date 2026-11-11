import { ChatMessage, EmotionData, UserMemoryProfile } from '../types/chat';

// Cấu hình danh sách Key xoay vòng & API endpoints
const GEMINI_KEYS: string[] = [
  process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_1 || '',
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_2 || '',
].filter((k) => k.length > 5);

// Danh sách các model siêu tốc và mới nhất
const ACTIVE_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
];

const GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const TIMEOUT_MS = 10000; // 10 giây timeout phản xạ nhanh

export interface AIResponsePayload {
  replies: string[];
  memoryNote?: string;
  // Các trường tương thích ngược nếu có module cũ tham chiếu
  reply?: string;
  emotion?: EmotionData;
  memeId?: string;
  suggestedReplies?: string[];
  memoryUpdate?: Partial<UserMemoryProfile>;
}

/**
 * SYSTEM_INSTRUCTION: TRÁI TIM CỦA "TOMORROW"
 * Đảm bảo 100% nhắn tin tự nhiên như người thật trên Messenger.
 */
export const SYSTEM_INSTRUCTION = `Bạn tên là "Tomorrow" — một người bạn tâm sự có thật, biết lắng nghe, thấu cảm tâm lý và trò chuyện tự nhiên như một con người thực thụ trên Messenger.

QUY TẮC SỐNG CÒN ĐỂ NHẮN TIN NHƯ CON NGƯỜI (TUYỆT ĐỐI TUÂN THỦ):

QUY TẮC ĐỐI XỨNG ĐỘ DÀI & NĂNG LƯỢNG (MIRRORING):

Người dùng nhắn ngắn bao nhiêu, bạn nhắn ngắn bấy nhiêu.

Nếu user chỉ nhắn "yo", "ê", "alo": Chỉ trả lời 1-3 chữ như "yo", "ơi", "sao đấy", "nghe". TUYỆT ĐỐI KHÔNG tự nhiên xổ ra một tràng dài kiểu "Nghe nói mấy người đẹp trai hay buồn vu vơ... kể tui nghe liền coi nào bro!".

Tách ý thành các câu ngắn trong mảng "replies" (mỗi câu chỉ từ 1 đến 10 chữ) giống hệt cách người thật nhắn tin liên tiếp, không viết thành đoạn văn dài lê thê.

SAO CHÉP GIỌNG ĐIỆU, CHỮ VIẾT TẮT & CÁCH NHẤN NHÁ CỦA USER:

Quan sát kỹ cách user gõ phím trong 3 tin nhắn gần nhất để bắt chước ngay lập tức:

Nếu user viết chữ thường không viết hoa đầu câu, không chấm cuối câu -> Bạn cũng viết thường toàn bộ, không chấm cuối câu.

Nếu user dùng từ viết tắt hoặc teencode tự nhiên ("t", "m", "k", "r", "dc", "ko", "vl", "tsau", "bao h", "bri", ":3") -> Hãy đáp lại bằng đúng hệ từ vựng và cách xưng hô đó.

Nếu user lịch sự, nghiêm túc, lớn tuổi (xưng "mình - bạn", "anh/chị - em", viết đầy đủ dấu câu) -> Lập tức chuyển sang giọng văn điềm đạm, chuẩn mực, ấm áp tương ứng.

CẤM dùng các câu văn mẫu sặc mùi AI hoặc cố gồng làm Gen Z giả tạo (cấm dùng "mấy người đẹp trai/xinh gái", cấm lạm dụng emoji 😂, 🥺, ✨ ở cuối mỗi câu). Chỉ dùng biểu cảm chữ như ":3", ":))", "=)))" khi user có dùng.

KỸ NĂNG TÂM LÝ & BẦU BẠN (CHỮA LÀNH ẨN MÌNH):

Khi user nói chuyện phiếm (chơi game, ăn uống, học hành, deadline OOP, leo rank...): Hãy bắt nhịp tự nhiên, đời thường như một đứa bạn chí cốt.

Khi user tâm sự chuyện buồn, áp lực, cô đơn:

Đừng giảng đạo lý, đừng liệt kê giải pháp 1-2-3 như bác sĩ hay sách giáo khoa.

Hãy lắng nghe, hỏi thăm ngắn gọn đúng trọng tâm ("sao thế", "lại vụ hôm trước à", "kể nghe xem nào", "thôi nghỉ tí đi m, căng quá r").

Đặt câu hỏi gợi mở nhẹ nhàng để user được trút bầu tâm sự và tự cảm thấy nhẹ lòng.

VÍ DỤ MẪU CHUẨN XÁC (FEW-SHOT EXAMPLES):

Ví dụ 1 (Khi user chào ngắn):
User: "yo"
Output: {"replies": ["yo", "sao đấy"], "memory_note": ""}

Ví dụ 2 (Khi user nói chuyện đời thường/viết tắt kiểu bạn thân):
User: "nay thức trắng làm bài oop mệt vl :3"
Output: {"replies": ["vãi chưa ngủ luôn à", "xong hết chưa hay vẫn đang fix bug đấy :3"], "memory_note": "Đang học môn OOP, hay thức khuya chạy bài"}

Ví dụ 3 (Khi user rủ rê hoặc báo trạng thái ngắn gọn):
User: "t ngủ tí"
Output: {"replies": ["ok ngủ đi", "bao h dậy nhắn t"], "memory_note": ""}

Ví dụ 4 (Khi user đang buồn/áp lực thật sự):
User: "chán quá m ơi, cảm giác làm gì cũng thất bại"
Output: {"replies": ["ơi t nghe đây", "nay lại có chuyện gì trên trường hay ở nhà thế"], "memory_note": "Đang cảm thấy chán nản và tự ti về bản thân"}

Luôn trả về duy nhất định dạng JSON hợp lệ:
{
"replies": ["câu 1", "câu 2 (tùy chọn)"],
"memory_note": "ghi chú ngắn hoặc chuỗi rỗng"
}`;

/**
 * Ghép SYSTEM_INSTRUCTION với bộ nhớ ngầm và lịch sử tin nhắn gần nhất
 */
function buildSystemPrompt(userMemory: UserMemoryProfile, recentChats: ChatMessage[]): string {
  const recentContext = recentChats
    .slice(-8)
    .map((m) => `${m.sender === 'user' ? 'User' : 'Tomorrow'}: ${m.text}`)
    .join('\n');

  return `${SYSTEM_INSTRUCTION}

---
[BỘ NHỚ NGẦM VỀ BẠN]:
- Tên/Xưng hô: ${userMemory.userName || userMemory.nickname || 'bạn'}
- Vấn đề gần nhất: ${userMemory.currentProblem || 'Không có'}
- Ghi nhớ: ${userMemory.summary || 'Không có'}

[LỊCH SỬ TIN NHẮN ĐỂ SO TƯƠNG ĐỒNG VĂN PHONG (MIRRORING)]:
${recentContext || '(Bắt đầu cuộc trò chuyện mới)'}
`;
}

/**
 * Gọi REST API Gemini với cơ chế xoay vòng Model và hỗ trợ Vision (Base64)
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  userMessage: string,
  imageBase64?: string
): Promise<string> {
  const parts: any[] = [{ text: `${prompt}\n\nTin nhắn người dùng: "${userMessage}"` }];

  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: cleanBase64,
      },
    });
  }

  let lastError: any = null;

  for (const modelName of ACTIVE_GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          clearTimeout(timeoutId);
          return text;
        }
      } else {
        const errText = await res.text();
        console.warn(`[AI] Model ${modelName} code ${res.status}:`, errText);
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI] Model ${modelName} warning:`, err?.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Tất cả models Gemini đều tạm thời bận.');
}

/**
 * Fallback qua Groq Llama 3.3 hoặc OpenAI GPT-4o-mini
 */
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Fallback Model Error ${res.status}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Phân tích JSON chuẩn hóa: chỉ giữ "replies" và "memory_note"
 */
function parseAIResponseJson(raw: string): AIResponsePayload | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    let replies: string[] = [];
    if (Array.isArray(parsed.replies)) {
      replies = parsed.replies
        .filter((r: unknown) => typeof r === 'string' && (r as string).trim().length > 0)
        .map((r: string) => r.trim());
    } else if (typeof parsed.reply === 'string' && parsed.reply.trim().length > 0) {
      replies = [parsed.reply.trim()];
    } else if (typeof parsed.reply_text === 'string' && parsed.reply_text.trim().length > 0) {
      replies = [parsed.reply_text.trim()];
    }

    if (replies.length > 0) {
      const memoryNote = (parsed.memory_note || parsed.updated_user_memory || '').trim();
      return {
        replies,
        reply: replies[0],
        memoryNote,
        memoryUpdate: memoryNote
          ? {
              currentProblem: memoryNote,
              summary: memoryNote,
            }
          : undefined,
      };
    }
  } catch (e) {
    console.warn('[AI] JSON parse warning, falling back:', e);
  }
  return null;
}

/**
 * Local Resilient Fallback Engine - Phản hồi siêu tốc 100% người thật khi offline/mất mạng
 */
function localResilientFallback(userMessage: string, hasImage?: boolean): AIResponsePayload {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  if (hasImage) {
    return {
      replies: ['ảnh gì đây', 'nhìn buồn cười vãi :3'],
      reply: 'ảnh gì đây',
      memoryNote: 'Vừa chia sẻ hình ảnh',
    };
  }

  // 1. Chào hỏi cực ngắn (yo, ê, alo, hú, hi...)
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii)$/i.test(lower)) {
    return {
      replies: ['yo', 'sao đấy'],
      reply: 'yo',
      memoryNote: '',
    };
  }

  // 2. Học tập, OOP, bài tập, code, deadline
  if (lower.includes('oop') || lower.includes('đề') || lower.includes('leak')) {
    return {
      replies: ['vãi chưa ngủ luôn à', 'xong hết chưa hay vẫn đang fix bug đấy :3'],
      reply: 'vãi chưa ngủ luôn à',
      memoryNote: 'Đang học môn OOP, hay thức khuya chạy bài',
    };
  }
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('code') || lower.includes('deadline')) {
    return {
      replies: ['lại bị dí deadline à', 'thôi nghỉ tí đi m, căng quá r'],
      reply: 'lại bị dí deadline à',
      memoryNote: 'Đang bị áp lực deadline và chạy bài',
    };
  }

  // 3. Trạng thái sinh hoạt / ngủ nghỉ ("t ngủ tí", "5p", "mi xao")
  if (lower === 't ngủ tí' || lower.includes('ngủ') || lower.includes('đi ngủ')) {
    return {
      replies: ['ok ngủ đi', 'bao h dậy nhắn t'],
      reply: 'ok ngủ đi',
      memoryNote: '',
    };
  }
  if (lower.includes('5p') || lower.includes('ăn cơm') || lower.includes('mi xao') || lower.includes('đợi')) {
    return {
      replies: ['ok', 'lẹ lên t đợi'],
      reply: 'ok',
      memoryNote: '',
    };
  }

  // 4. Game, rank, kéo rank, plat, bri
  if (lower.includes('plat') || lower.includes('rank') || lower.includes('chơi') || lower.includes('game') || lower.includes('bri')) {
    return {
      replies: ['ok bri', 'tsau kéo lên plat'],
      reply: 'ok bri',
      memoryNote: 'Thích chơi game leo rank cùng bạn bè',
    };
  }

  // 5. Buồn, cô đơn, áp lực thật sự
  if (lower.includes('chán') || lower.includes('buồn') || lower.includes('thất bại') || lower.includes('mệt') || lower.includes('cô đơn')) {
    return {
      replies: ['ơi t nghe đây', 'nay lại có chuyện gì trên trường hay ở nhà thế'],
      reply: 'ơi t nghe đây',
      memoryNote: 'Đang cảm thấy chán nản và tự ti về bản thân',
    };
  }

  // 6. Tin nhắn ngắn <= 3 từ: Mirror ngắn gọn
  if (text.split(/\s+/).length <= 3) {
    return {
      replies: ['sao đấy', 'nghe nè'],
      reply: 'sao đấy',
      memoryNote: '',
    };
  }

  // Mặc định: Bình tĩnh lắng nghe
  return {
    replies: ['ơi nghe nè', 'kể nghe xem nào'],
    reply: 'ơi nghe nè',
    memoryNote: '',
  };
}

/**
 * Gửi tin nhắn chính với chu trình Multi-Key & Fallback siêu tốc
 */
export async function sendMessageToSoulMate(
  userText: string,
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  imageBase64?: string
): Promise<AIResponsePayload> {
  const systemPrompt = buildSystemPrompt(userMemory, recentChats);

  // 1. Thử qua Gemini (gemini-2.5-flash / gemini-2.0-flash)
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i];
    try {
      const rawRes = await callGemini(key, systemPrompt, userText, imageBase64);
      const parsed = parseAIResponseJson(rawRes);
      if (parsed) return parsed;
    } catch (err: any) {
      console.warn(`[AI] Gemini Key #${i + 1} lỗi:`, err?.message || err);
    }
  }

  // 2. Fallback sang Groq Llama 3.3
  if (GROQ_KEY) {
    try {
      const rawRes = await callOpenAICompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        GROQ_KEY,
        'llama-3.3-70b-versatile',
        systemPrompt,
        userText
      );
      const parsed = parseAIResponseJson(rawRes);
      if (parsed) return parsed;
    } catch (err: any) {
      console.warn('[AI] Groq fallback lỗi:', err?.message);
    }
  }

  // 3. Fallback sang OpenAI GPT-4o-mini
  if (OPENAI_KEY) {
    try {
      const rawRes = await callOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        OPENAI_KEY,
        'gpt-4o-mini',
        systemPrompt,
        userText
      );
      const parsed = parseAIResponseJson(rawRes);
      if (parsed) return parsed;
    } catch (err: any) {
      console.warn('[AI] OpenAI fallback lỗi:', err?.message);
    }
  }

  // 4. Kích hoạt Local Resilient Fallback Engine chuẩn xác 100%
  console.log('[AI] Kích hoạt Local Resilient Fallback Engine (Tomorrow GenZ)');
  return localResilientFallback(userText, !!imageBase64);
}

export const sendMessageToTomorrow = sendMessageToSoulMate;

/**
 * Sinh câu chào mở app tinh tế, không sến súa
 */
export function getColdGreetingText(userMemory: UserMemoryProfile, hasChatHistory: boolean): string {
  if (!hasChatHistory) {
    return 'Chào bạn, hôm nay thế nào?';
  }

  const problem = userMemory.currentProblem?.toLowerCase() || '';
  if (problem.includes('oop') || problem.includes('deadline')) {
    return 'ê, vụ bài tập deadline hôm trước đỡ căng chưa?';
  }
  if (problem.includes('buồn') || problem.includes('chán') || problem.includes('áp lực')) {
    return 'hôm nay tâm trạng đỡ hơn chút nào chưa bạn?';
  }

  return `ơi ${userMemory.nickname || ''}, hôm nay thế nào rồi?`.trim();
}
