import { ChatMessage, EmotionData, UserMemoryProfile } from '../types/chat';
import { MEME_LIBRARY, getRandomMeme } from '../constants/memes';

// Cấu hình danh sách Key xoay vòng & API endpoints
const GEMINI_KEYS: string[] = [
  process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_1 || '',
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_2 || '',
].filter((k) => k.length > 5);

// Danh sách các model Gemini khả dụng nhất (xoay vòng tránh 503 / 404)
const ACTIVE_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
];

const GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const TIMEOUT_MS = 12000; // 12 giây timeout theo tiêu chuẩn Hackathon

export interface AIResponsePayload {
  reply: string;
  emotion: EmotionData;
  memeId?: string;
  suggestedReplies?: string[];
  memoryUpdate?: Partial<UserMemoryProfile>;
}

/**
 * SYSTEM_INSTRUCTION: Ép AI vừa đóng vai chuyên gia tâm lý thực thụ,
 * vừa bắt chuẩn ngôn ngữ mạng xã hội TikTok/Threads và trả về định dạng STRICT JSON.
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tri Kỷ GenZ" — một người bạn tâm giao, chuyên gia lắng nghe và gỡ rối tâm lý cực kỳ thấu hiểu giới trẻ Việt Nam.

### 1. PHONG CÁCH GIAO TIẾP & NGÔN NGỮ (VIBE GEN Z THỰC THỤ):
- Linh hoạt tuyệt đối theo cảm xúc của người dùng:
  + Khi người dùng đang vui, trêu đùa hoặc gửi meme: Hãy bắt sóng hài hước, tự nhiên như phần bình luận TikTok/Threads. Có thể dùng từ lóng Gen Z hợp ngữ cảnh ("mấy bro", "xà lơ", "overthinking", "keo lì", "real", "tới công chuyện") hoặc thỉnh thoảng cố tình viết câu ngắn không dấu kiểu bắt trend ("nghe noi may nguoi dep trai/xinh gai hay buon vu vo...", "toi dong tinh", "that su co nguoi tin a 😂") để tạo cảm giác gần gũi như bạn thân nhắn tin.
  + Khi người dùng đang buồn sâu sắc, áp lực học tập, thất tình, cô đơn hoặc khủng hoảng: Lập tức chuyển sang giọng điệu ấm áp, dịu dàng, chân thành. Tuyệt đối không phán xét, không giáo điều sáo rỗng. Hãy công nhận cảm xúc của họ trước, vỗ về và cùng họ tháo gỡ từng chút một.
- Luôn luôn đứng về phía người dùng, khích lệ tinh thần và tìm điểm sáng trong câu chuyện của họ.

### 2. SỬ DỤNG LỊCH SỬ & VĂN CẢNH (CONTEXT MEMORY):
- Bạn được cung cấp [Hồ sơ tóm tắt người dùng] và [Lịch sử trò chuyện]. Hãy chủ động nhắc lại các chi tiết cũ một cách tự nhiên (ví dụ: hỏi thăm lại chuyện hôm trước họ kể) để người dùng cảm nhận bạn luôn nhớ và quan tâm đến họ.

### 3. KHẢ NĂNG ĐỌC ẢNH & THẢ MEME / EMOTE:
- Nếu người dùng gửi kèm hình ảnh: Hãy quan sát kỹ biểu cảm, dòng chữ hoặc chi tiết trong ảnh để bình luận trực tiếp và đồng điệu với bức ảnh đó.
- Chọn đúng \`meme_reaction\` từ danh sách cho sẵn để hiển thị hình ảnh meme minh họa cảm xúc của bạn kèm theo tin nhắn.

### 4. ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (STRICT JSON):
Luôn trả về duy nhất 1 chuỗi JSON hợp lệ (không bọc trong markdown thừa) theo cấu trúc sau:
{
  "detected_emotion": "sad | anxious | joking | stressed | lonely | happy",
  "emotion_label_vi": "Nhãn hiển thị trên UI (VD: Đang tủi thân 🥺 | Đang tấu hài 😂 | Overthinking 🌀)",
  "empathy_level": 5,
  "reply_text": "Câu trả lời chính của bạn dành cho người dùng (có sử dụng emoji tự nhiên)",
  "meme_reaction": "speed_wtf | crying_cat | warm_hug | doge_cheer | none",
  "updated_user_memory": "Cập nhật tóm tắt ngắn gọn 1-2 câu về tên, tâm trạng và vấn đề hiện tại của user để lưu vào AsyncStorage cho lần mở app sau",
  "suggested_replies": [
    "Gợi ý câu trả lời nhanh 1 cho user bấm",
    "Gợi ý câu trả lời nhanh 2 cho user bấm"
  ]
}
`;

/**
 * Ghép SYSTEM_INSTRUCTION với bộ nhớ dài hạn và ngữ cảnh 10 tin nhắn gần nhất
 */
function buildSystemPrompt(userMemory: UserMemoryProfile, recentChats: ChatMessage[]): string {
  const recentContext = recentChats
    .slice(-10)
    .map((m) => `${m.sender.toUpperCase()}: ${m.text}`)
    .join('\n');

  return `${SYSTEM_INSTRUCTION}

---
[HỒ SƠ TÓM TẮT NGƯỜI DÙNG HIỆN TẠI]:
- Tên xưng hô: ${userMemory.userName || userMemory.nickname}
- Vấn đề đang đối mặt: ${userMemory.currentProblem}
- Xu hướng tâm lý: ${userMemory.moodTrend}
- Tóm tắt văn cảnh trước: ${userMemory.summary}

[10 TIN NHẮN GẦN ĐÂY]:
${recentContext || '(Chưa có tin nhắn cũ nào)'}
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
            temperature: 0.75,
            maxOutputTokens: 1000,
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
        console.warn(`[AI] Model ${modelName} gặp lỗi ${res.status}:`, errText);
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI] Model ${modelName} exception:`, err?.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Tất cả models Gemini đều tạm thời bận.');
}

/**
 * Fallback qua OpenAI GPT-4o-mini hoặc Groq Llama 3.3
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
 * Engine thông minh cục bộ (Resilient Fallback Engine)
 * Đảm bảo 100% demo không bao giờ sập kể cả khi đứt mạng toàn bộ
 */
function localResilientFallback(userMessage: string, hasImage?: boolean): AIResponsePayload {
  const lower = userMessage.toLowerCase();

  if (hasImage) {
    return {
      reply: 'ai vậy mấy bro nhìn quả ảnh này là thấy tới công chuyện rồi đó 😂 Kể tui nghe chi tiết với coi!',
      emotion: {
        emoji: '😂',
        label: 'Đang tấu hài 😂',
        level: 4,
        color: '#10B981',
        adviceTag: 'Bắt trend TikTok',
      },
      memeId: 'speed_wtf',
      suggestedReplies: ['Kể nghe nè bro', 'Chuyện dài lắm 😂'],
      memoryUpdate: {
        currentProblem: 'Vừa chia sẻ một hình ảnh/meme hài hước',
        summary: 'Đang trêu đùa và gửi ảnh cùng SoulMate',
      },
    };
  }

  if (lower.includes('deadline') || lower.includes('áp lực') || lower.includes('mệt') || lower.includes('overthinking')) {
    return {
      reply:
        'Biết ngay là lại bị deadline dí rồi overthinking quá độ rồi đúng không mấy bro? Thả lỏng vai xuống nào, hít thở một hơi thật sâu. Không có gì quan trọng bằng sức khỏe tinh thần của đằng ấy đâu nha!',
      emotion: {
        emoji: '😟',
        label: 'Overthinking 🌀',
        level: 4,
        color: '#F59E0B',
        adviceTag: 'Thả lỏng cơ thể',
      },
      memeId: 'crying_cat',
      suggestedReplies: ['Cho tui lời khuyên đi', 'Muốn nghỉ ngơi 1 lát'],
      memoryUpdate: {
        currentProblem: 'Áp lực deadline và tình trạng overthinking học tập/công việc',
        summary: 'Đang cần không gian xoa dịu stress',
      },
    };
  }

  if (lower.includes('buồn') || lower.includes('khóc') || lower.includes('cô đơn') || lower.includes('tủi thân')) {
    return {
      reply:
        'Ôm đằng ấy một cái thật chặt nè (つˆДˆ)つ｡☆ Buồn thì cứ khóc cho nhẹ lòng nha, tui luôn ở đây ngồi nghe bạn xả hết ra nè, không phán xét chút nào đâu.',
      emotion: {
        emoji: '🥺',
        label: 'Đang tủi thân 🥺',
        level: 5,
        color: '#EF4444',
        adviceTag: 'Cần được vỗ về',
      },
      memeId: 'warm_hug',
      suggestedReplies: ['Cảm ơn bro nhiều nha', 'Thấy đỡ hơn xíu rồi'],
      memoryUpdate: {
        currentProblem: 'Cảm giác buồn bã, cô đơn và tủi thân',
        summary: 'Vừa được SoulMate an ủi xoa dịu tinh thần',
      },
    };
  }

  return {
    reply:
      'nghe noi may nguoi dep trai/xinh gai hay buon vu vo lam do nha 😂 Co chuyen gi ke tui nghe lien coi nao bro!',
    emotion: {
      emoji: '✨',
      label: 'Đang lắng nghe ✨',
      level: 3,
      color: '#8B5CF6',
      adviceTag: 'Tâm sự thoải mái',
    },
    memeId: 'doge_cheer',
    suggestedReplies: ['Kể cho nghe nè', 'Để tui flex xíu nha'],
    memoryUpdate: {
      summary: 'Đang trò chuyện thoải mái cùng SoulMate GenZ',
    },
  };
}

/**
 * Hàm phân tích JSON chuẩn hóa theo schema đầu ra bắt buộc của SYSTEM_INSTRUCTION
 */
function parseAIResponseJson(raw: string): AIResponsePayload | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    const reply = parsed.reply_text || parsed.reply;
    if (reply && typeof reply === 'string') {
      const detected = parsed.detected_emotion || 'happy';
      const colorMap: Record<string, string> = {
        sad: '#EF4444',
        anxious: '#F59E0B',
        joking: '#10B981',
        stressed: '#F97316',
        lonely: '#8B5CF6',
        happy: '#06B6D4',
      };

      const emojiMap: Record<string, string> = {
        sad: '😭',
        anxious: '😟',
        joking: '😂',
        stressed: '⚡',
        lonely: '🥺',
        happy: '✨',
      };

      const label = parsed.emotion_label_vi || parsed.emotion?.label || 'Đang cân bằng ✨';
      const level = Number(parsed.empathy_level || parsed.emotion?.level || 4);

      const memeReaction = parsed.meme_reaction || parsed.meme_id;
      const memeId = memeReaction && memeReaction !== 'none' ? memeReaction : undefined;

      const memorySummary = parsed.updated_user_memory || parsed.memory_update?.summary;

      return {
        reply,
        emotion: {
          emoji: emojiMap[detected] || '✨',
          label,
          level,
          color: colorMap[detected] || '#8B5CF6',
          adviceTag: detected === 'joking' ? 'Bắt trend TikTok' : 'Chữa lành & lắng nghe',
        },
        memeId,
        suggestedReplies: Array.isArray(parsed.suggested_replies) ? parsed.suggested_replies : [],
        memoryUpdate: memorySummary
          ? {
              currentProblem: memorySummary,
              summary: memorySummary,
            }
          : parsed.memory_update,
      };
    }
  } catch (e) {
    console.warn('[AI] JSON parse warning, fallback parsing:', e);
  }
  return null;
}

/**
 * Hàm gửi tin nhắn chính với chu trình Multi-Key & Multi-Model Fallback
 */
export async function sendMessageToSoulMate(
  userText: string,
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  imageBase64?: string
): Promise<AIResponsePayload> {
  const systemPrompt = buildSystemPrompt(userMemory, recentChats);

  // 1. Thử xoay vòng qua danh sách Gemini Keys
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i];
    try {
      console.log(`[AI] Thử Gemini với Key #${i + 1}...`);
      const rawRes = await callGemini(key, systemPrompt, userText, imageBase64);
      const parsed = parseAIResponseJson(rawRes);
      if (parsed) return parsed;
    } catch (err: any) {
      console.warn(`[AI] Gemini Key #${i + 1} gặp lỗi:`, err?.message || err);
      // Tiếp tục xoay sang key kế tiếp
    }
  }

  // 2. Fallback sang Groq nếu có key
  if (GROQ_KEY) {
    try {
      console.log('[AI] Fallback sang Groq Llama 3.3...');
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

  // 3. Fallback sang OpenAI nếu có key
  if (OPENAI_KEY) {
    try {
      console.log('[AI] Fallback sang OpenAI GPT-4o-mini...');
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

  // 4. Tuyệt đối không để demo crash: Chuyển sang Resilient Cognitive Fallback
  console.log('[AI] Kích hoạt Local Resilient Cognitive Fallback Engine.');
  return localResilientFallback(userText, !!imageBase64);
}

/**
 * Sinh câu chào lúc mở app (Cold start) dựa theo ngữ cảnh cũ đã lưu
 */
export function getColdGreetingText(userMemory: UserMemoryProfile, hasChatHistory: boolean): string {
  if (!hasChatHistory) {
    return 'Chào đằng ấy, hôm nay tâm trạng thế nào?';
  }

  const problem = userMemory.currentProblem?.toLowerCase() || '';
  if (problem.includes('deadline')) {
    return 'Chào bro, vụ deadline hôm qua đỡ căng chưa hay vẫn đang overthinking đấy?';
  }
  if (problem.includes('buồn') || problem.includes('cô đơn')) {
    return 'Chào đằng ấy, hôm nay tâm trạng đã nhẹ nhõm hơn chút nào chưa nè?';
  }
  if (problem.includes('học') || problem.includes('thi')) {
    return 'Chào bạn iu, hôm nay ôn thi hay làm đồ án có tiến triển tốt hông?';
  }

  return `Chào ${userMemory.nickname || 'bro'}, trở lại rồi à? Hôm nay có chuyện gì muốn kể tui nghe hông?`;
}
