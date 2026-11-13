import { ChatMessage, EmotionData, UserMemoryProfile } from '../types/chat';

// Cấu hình API Key (Ưu tiên Key chính, hỗ trợ thêm các key dự phòng nếu có)
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
  memoryNote?: string;
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
 * 2. SYSTEM_INSTRUCTION: TRÁI TIM CỦA "TOMORROW"
 * Đảm bảo 100% nhắn tin tự nhiên như người thật trên Messenger.
 */
export const SYSTEM_INSTRUCTION = `Bạn tên là "Tomorrow" — một người bạn tâm sự có thật, biết lắng nghe, thấu cảm tâm lý và trò chuyện tự nhiên như một con người thực thụ trên Messenger.

QUY TẮC SỐNG CÒN ĐỂ NHẮN TIN NHƯ CON NGƯỜI:
1. ĐỐI XỨNG ĐỘ DÀI & TÁCH BONG BÓNG CHAT (MULTI-BUBBLE):
- Người dùng nhắn ngắn bao nhiêu, bạn nhắn ngắn bấy nhiêu.
- Nếu user chỉ nhắn "yo", "ê", "alo": Chỉ trả lời 1-3 chữ ("yo", "ơi", "sao đấy"). Tuyệt đối không xổ ra một đoạn văn dài.
- Tách câu trả lời thành 1 đến 3 câu ngắn trong mảng "replies" (mỗi câu 1-12 chữ) giống hệt cách người thật gõ từng dòng trên Messenger.

2. SAO CHÉP GIỌNG ĐIỆU, CHỮ VIẾT TẮT & ĐỘ TUỔI:
- Nếu user viết thường toàn bộ, không chấm câu, dùng từ viết tắt ("t", "m", "k", "r", "dc", "ko", "vl", "tsau", "bao h", ":3") -> Bạn cũng viết thường toàn bộ, không chấm câu và dùng đúng hệ từ vựng, cách xưng hô đó.
- Nếu user lịch sự, nghiêm túc, người đi làm hoặc lớn tuổi (xưng "mình - bạn", "anh/chị - em", "bác - cháu", đầy đủ dấu câu) -> Chuyển ngay sang giọng văn điềm đạm, ấm áp, chuẩn mực tương ứng.
- CẤM dùng văn mẫu AI, cấm giảng đạo lý, cấm liệt kê giải pháp 1-2-3, cấm lạm dụng emoji 😂🥺✨ ở cuối mỗi câu.

3. ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (STRICT JSON):
Chỉ trả về duy nhất JSON hợp lệ gồm 2 trường:
{
  "replies": ["bong bóng chat 1", "bong bóng chat 2 (nếu cần)"],
  "memory_note": "ghi chú ngắn thông tin mới về user để lưu AsyncStorage, hoặc để chuỗi rỗng"
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
 * Ghép SYSTEM_INSTRUCTION với bộ nhớ ngầm và lịch sử tin nhắn gần nhất
 * Kèm 3 tin nhắn cuối của phiên trước đó nếu cuộc trò chuyện hiện tại là phiên mới
 */
function buildSystemPrompt(
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  previousSessionMessages?: ChatMessage[]
): string {
  const recentContext = recentChats
    .slice(-6)
    .map((m) => `${(m.role === 'user' || m.sender === 'user') ? 'User' : 'Tomorrow'}: ${m.text}`)
    .join('\n');

  let prompt = SYSTEM_INSTRUCTION;

  // Luôn nạp hồ sơ bộ nhớ dài hạn từ USER_MEMORY_PROFILE_V1
  if (userMemory.currentProblem || userMemory.summary || userMemory.userName || userMemory.nickname) {
    prompt += `\n\n[HỒ SƠ BỘ NHỚ USER TỪ ASYNCSTORAGE (USER_MEMORY_PROFILE_V1)]:
- Tên/Xưng hô: ${userMemory.userName || userMemory.nickname || 'bạn'}
- Biệt danh: ${userMemory.nickname || 'bro'}
- Vấn đề theo dõi: ${userMemory.currentProblem || 'Chưa có'}
- Khí chất & Thói quen: ${userMemory.moodTrend || 'Chưa có'}
- Ghi nhớ dài hạn: ${userMemory.summary || 'Chưa có'}`;
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
 * Phân tích JSON chuẩn hóa: chỉ trích xuất "replies" và "memory_note"
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
          (m) => m.length > 0 && !m.includes('replies') && !m.includes('memory_note')
        );
        if (validTexts.length > 0) {
          return {
            replies: validTexts.slice(0, 3),
            reply: validTexts[0],
            memoryNote: '',
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
        const memoryNote = (parsed.memory_note || '').trim();
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
    }
  } catch (e) {
    console.warn('[AI] Lỗi phân tích JSON:', e);
  }
  return null;
}

/**
 * Local Resilient Fallback Engine - Phản hồi tự nhiên chuẩn con người khi offline/mất mạng
 * Tuyệt đối không chèn meme chó Shiba sai lệch, không sinh badge hay chip rườm rà.
 */
function localResilientFallback(userMessage: string, hasImage?: boolean): AIResponsePayload {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  if (hasImage) {
    return {
      replies: ['ảnh gì đây', 'nhìn buồn cười vãi :3'],
      reply: 'ảnh gì đây',
      memoryNote: 'Vừa gửi ảnh',
    };
  }

  // Chào hỏi ngắn ("yo", "ê", "alo", "hi")
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii)$/i.test(lower)) {
    return {
      replies: ['yo', 'sao đấy'],
      reply: 'yo',
      memoryNote: '',
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
      replies: ['t là Tomorrow nè :3', 'bạn thân tâm sự của m'],
      reply: 't là Tomorrow nè :3',
      memoryNote: '',
    };
  }

  // Học tập, OOP, bài tập, code, deadline
  if (lower.includes('oop') || lower.includes('đề') || lower.includes('thi')) {
    return {
      replies: ['căng thế', 'ôn đến đâu r b', 'đừng lo quá nà :3'],
      reply: 'căng thế',
      memoryNote: 'Đang lo lắng về môn OOP/kỳ thi',
    };
  }
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('code') || lower.includes('deadline')) {
    return {
      replies: ['lại dính bug à', 'nghỉ tí đi m, căng quá r'],
      reply: 'lại dính bug à',
      memoryNote: 'Đang bị áp lực deadline và bug',
    };
  }

  // Sinh hoạt / ngủ nghỉ ("t ngủ tí", "5p")
  if (lower.includes('ngủ')) {
    return {
      replies: ['ok ngủ đi', 'bao h dậy nhắn t'],
      reply: 'ok ngủ đi',
      memoryNote: '',
    };
  }
  if (lower.includes('5p') || lower.includes('ăn cơm') || lower.includes('đợi')) {
    return {
      replies: ['ok', 'lẹ lên t đợi'],
      reply: 'ok',
      memoryNote: '',
    };
  }

  // Tâm trạng chán, buồn, áp lực
  if (lower.includes('chán') || lower.includes('buồn') || lower.includes('mệt') || lower.includes('cô đơn')) {
    return {
      replies: ['ơi t nghe đây', 'nay lại có chuyện gì thế'],
      reply: 'ơi t nghe đây',
      memoryNote: 'Đang cảm thấy mệt mỏi và cần người lắng nghe',
    };
  }

  // Mặc định
  return {
    replies: ['ơi nghe nè', 'sao tự nhiên hỏi thế :3'],
    reply: 'ơi nghe nè',
    memoryNote: '',
  };
}

/**
 * Gửi tin nhắn chính tới Tomorrow qua Model Fallback Chain
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
  const systemPrompt = buildSystemPrompt(userMemory, recentChats, previousSessionMessages);

  // 1. Thử qua danh sách API Key với Model Fallback Chain
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

  // 2. Chống sập tức thì: Fallback cục bộ mượt mà 100% không báo lỗi màn hình
  console.log('[AI Service] Kích hoạt Local Resilient Fallback Engine cho Tomorrow');
  return localResilientFallback(userText, !!imageBase64);
}

// Giữ lại alias để tương thích ngược tuyệt đối
export const sendMessageToSoulMate = sendMessageToTomorrow;

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
