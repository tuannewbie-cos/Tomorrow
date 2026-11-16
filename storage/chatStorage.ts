import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, UserMemoryProfile, ChatSession } from '../types/chat';

export const STORAGE_KEYS = {
  CHAT_SESSIONS: 'CHAT_SESSIONS_V2',
  USER_MEMORY_PROFILE: 'USER_MEMORY_PROFILE_V1',
  // Khóa cũ (để migrate nếu có)
  LEGACY_CHAT_HISTORY: 'CHAT_HISTORY_V1',
  LEGACY_CHAT_SESSIONS: 'CHAT_SESSIONS_V1',
  LEGACY_ACTIVE_SESSION: 'ACTIVE_SESSION_ID_V1',
};

export const DEFAULT_USER_MEMORY: UserMemoryProfile = {
  userName: 'Bạn iu',
  nickname: 'bro',
  currentProblem: 'Áp lực học tập/công việc và cần không gian xả stress',
  moodTrend: 'Thích phong cách nói chuyện ấm áp, chân thành nhưng hài hước',
  interests: ['Lướt TikTok/Reels', 'Nghe nhạc Chill', 'Meme mèo'],
  lastActiveDate: new Date().toISOString(),
  summary: 'Người dùng cần không gian trò chuyện tâm sự nhẹ nhàng, không phán xét.',
  currentProject: 'Dự án Tomorrow v3 & Nâng cấp Proto-Jarvis',
  habits: ['Làm việc tập trung', 'Thức đêm khi có dự án gấp'],
  recentMood: 'Tập trung và nhiệt huyết',
};

/**
 * Kiểm tra xem một tiêu đề có phải là placeholder hoặc từ rác không
 */
export const isPlaceholderOrNoiseTitle = (title?: string): boolean => {
  if (!title) return true;
  const clean = title.trim().toLowerCase().replace(/[.!?,:;~_-]+$/g, '').trim();
  if (clean.length <= 5) return true;

  const noisePhrases = [
    // Generic titles
    'cuộc trò chuyện mới', 'trò chuyện ngắn', 'cuộc trò chuyện trước đó',
    'tâm sự mới', 'hình ảnh gửi kèm', 'tin nhắn mới', 'new chat', 'chưa có tiêu đề', 'untitled',
    // Greetings & Pings
    'hello', 'helo', 'hi', 'hii', 'hí', 'halo', 'yo', 'ê', 'alo', 'ơi', 'hú', 'hu',
    // Confirmations / Closures
    'ok', 'okk', 'okkk', 'oki', 'okii', 'okie', 'okela', 'ok nha', 'ok nhé', 'ok nhe',
    'ok bro', 'oki bro', 'ok r', 'ok r đó', 'ok r do', 'ok roi', 'ok rồi', 'ok rồi đó', 'ok bạn', 'ok b',
    'uk', 'ừ', 'ừa', 'uh', 'uhm', 'ừm', 'um', 'umk',
    // Thanks
    'thanks', 'thanks bro', 'thank kiu', 'thank kiuu', 'thank kiu bro', 'tks', 'tks bro',
    'thank you', 'cảm ơn', 'cảm ơn bro', 'cảm ơn bạn', 'cảm ơn nhiều', 'cam on', 'cam on bro',
    // Bye & Leave
    'bye', 'bye bro', 'pp', 'pp bro', 'g9', 'tạm biệt',
    // Soft trials / step away
    'để t thử', 'để t thử xem', 'de t thu', 'de t thu xem', 'để t xem', 'để t test',
    // Dev test
    'test', 'testing',
  ];

  if (noisePhrases.includes(clean)) return true;

  // Pattern check: Các cụm từ ngắn (<= 3 từ) bắt đầu bằng từ khóa xã giao/khép mạch
  const words = clean.split(/\s+/);
  if (words.length <= 3) {
    const firstWord = words[0];
    if (['ok', 'okk', 'oki', 'okie', 'okela', 'thanks', 'tks', 'bye', 'pp', 'alo', 'hello', 'yo', 'ê'].includes(firstWord)) {
      return true;
    }
    if (
      clean.startsWith('cảm ơn') ||
      clean.startsWith('cam on') ||
      clean.startsWith('để t thử') ||
      clean.startsWith('de t thu') ||
      clean.startsWith('để mình thử') ||
      clean.startsWith('để tui thử')
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Kiểm tra xem một chuỗi có phải câu chào ngắn xã giao hoặc quá ngắn không (tương thích ngược)
 */
export const isGreetingOrTooShort = (text: string): boolean => {
  return isPlaceholderOrNoiseTitle(text);
};

/**
 * Danh sách các tiêu đề tạm thời / generic cần được thay thế tự động
 */
export const GENERIC_TITLES = [
  'cuộc trò chuyện mới',
  'cuộc trò chuyện trước đó',
  'tâm sự mới',
  'hình ảnh gửi kèm',
  'trò chuyện ngắn',
  'hello',
  'helo',
  'hi',
  'yo',
  'ê',
  'alo',
  'test',
  'hú',
  '',
];

/**
 * Tự động dọn dẹp các phiên chat cũ đang bị đặt tên là "hello", "helo", "yo" hoặc tiêu đề generic:
 * Tìm trong session.messages tin nhắn đầu tiên của user mà !isGreetingOrTooShort(msg.text) để lấy làm tiêu đề tóm tắt;
 * nếu phiên đó chỉ toàn câu chào "hello" thì đổi tên thành "Trò chuyện ngắn".
 */
export function cleanOldSessionsWithGenericTitles(sessions: ChatSession[]): {
  cleanedSessions: ChatSession[];
  changed: boolean;
} {
  let changed = false;

  const cleanedSessions = sessions.map((session) => {
    const rawTitle = (session.title || '').trim();

    if (!isGreetingOrTooShort(rawTitle)) {
      return session;
    }

    // Tìm trong session.messages tin nhắn đầu tiên của user mà !isGreetingOrTooShort(msg.text)
    const firstMeaningfulUserMsg = (session.messages || []).find(
      (m) => (m.role === 'user' || m.sender === 'user') && !isGreetingOrTooShort(m.text || '')
    );

    let newTitle = 'Trò chuyện ngắn';
    if (firstMeaningfulUserMsg && firstMeaningfulUserMsg.text?.trim()) {
      const cleanMsg = firstMeaningfulUserMsg.text.trim();
      newTitle = cleanMsg.length > 30 ? `${cleanMsg.slice(0, 30)}...` : cleanMsg;
    }

    if (newTitle !== session.title) {
      changed = true;
      return {
        ...session,
        title: newTitle,
      };
    }

    return session;
  });

  return { cleanedSessions, changed };
}

/**
 * Hàm dọn sạch các ghi chú nhầm về đêm muộn / thức khuya nếu trước đó lỡ lưu
 */
export function cleanNightNotesFromMemory(memory: UserMemoryProfile): UserMemoryProfile {
  let changed = false;
  let cleaned = { ...memory };

  const purgeNightWords = (str?: string) => {
    if (!str) return str;
    return str
      .replace(/hay bồn chồn vào đêm muộn/gi, 'Thích trò chuyện thư giãn')
      .replace(/đêm muộn/gi, 'khi rảnh')
      .replace(/thức khuya/gi, 'nghỉ ngơi')
      .trim();
  };

  if (cleaned.moodTrend && cleaned.moodTrend.toLowerCase().includes('đêm muộn')) {
    cleaned.moodTrend = purgeNightWords(cleaned.moodTrend) || 'Thích phong cách ấm áp, hài hước';
    changed = true;
  }
  if (cleaned.currentProblem && cleaned.currentProblem.toLowerCase().includes('đêm muộn')) {
    cleaned.currentProblem = purgeNightWords(cleaned.currentProblem) || 'Áp lực công việc, học tập';
    changed = true;
  }

  return cleaned;
}

/**
 * 1. Tải danh sách toàn bộ phiên trò chuyện từ CHAT_SESSIONS_V2
 * Sắp xếp phiên mới nhất (updatedAt lớn nhất) lên đầu danh sách
 */
export async function loadSessions(): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS);
    if (raw) {
      const parsed: ChatSession[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sorted = parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const { cleanedSessions, changed } = cleanOldSessionsWithGenericTitles(sorted);
        if (changed) {
          await saveSessions(cleanedSessions);
        }
        return cleanedSessions;
      }
    }

    // Nếu CHAT_SESSIONS_V2 chưa có, thử migrate từ phiên bản cũ (CHAT_HISTORY_V1)
    const legacyHistoryRaw = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_CHAT_HISTORY);
    if (legacyHistoryRaw) {
      const legacyMsgs: any[] = JSON.parse(legacyHistoryRaw);
      if (Array.isArray(legacyMsgs) && legacyMsgs.length > 0) {
        const firstUserMsg = legacyMsgs.find((m) => m.role === 'user' || m.sender === 'user');
        const textLower = (firstUserMsg?.text || '').trim().toLowerCase();
        const isGreeting =
          GENERIC_TITLES.includes(textLower) ||
          /^(hello|hi|yo|ê|alo|hú|test|e)[!.? ]*$/i.test(textLower);

        let title = 'Cuộc trò chuyện mới';
        if (!isGreeting && firstUserMsg?.text?.trim()) {
          const rawText = firstUserMsg.text.trim();
          title = rawText.length > 30 ? rawText.slice(0, 30) + '...' : rawText;
        }

        const migratedSession: ChatSession = {
          id: `session-migrated-${Date.now()}`,
          title,
          updatedAt: Date.now(),
          messages: legacyMsgs.map((m) => ({
            id: m.id || `migrated-${Date.now()}-${Math.random()}`,
            role: m.role || (m.sender === 'user' ? 'user' : 'model'),
            sender: m.sender || (m.role === 'model' ? 'ai' : 'user'),
            text: m.text || '',
            timestamp: m.timestamp || Date.now(),
            imageUri: m.imageUri,
            imageBase64: m.imageBase64,
          })),
        };

        await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify([migratedSession]));
        return [migratedSession];
      }
    }

    return [];
  } catch (error) {
    console.error('[Storage] Lỗi khi load Sessions từ CHAT_SESSIONS_V2:', error);
    return [];
  }
}

/**
 * 2. Lưu toàn bộ danh sách phiên trò chuyện vào CHAT_SESSIONS_V2
 */
export async function saveSessions(sessions: ChatSession[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
  } catch (error) {
    console.error('[Storage] Lỗi khi lưu Sessions vào CHAT_SESSIONS_V2:', error);
  }
}

/**
 * 3. Cập nhật hoặc thêm mới 1 phiên trò chuyện (Upsert Session)
 * Tự động đưa phiên này lên đầu danh sách và đồng bộ vào AsyncStorage
 */
export async function upsertSession(session: ChatSession): Promise<ChatSession[]> {
  try {
    const currentSessions = await loadSessions();
    const filtered = currentSessions.filter((s) => s.id !== session.id);
    const updatedSessions = [session, ...filtered];
    await saveSessions(updatedSessions);
    return updatedSessions;
  } catch (error) {
    console.error('[Storage] Lỗi khi upsert session:', error);
    return [];
  }
}

/**
 * 4. Xóa 1 phiên trò chuyện khỏi CHAT_SESSIONS_V2
 */
export async function deleteSession(sessionId: string): Promise<ChatSession[]> {
  try {
    const currentSessions = await loadSessions();
    const updatedSessions = currentSessions.filter((s) => s.id !== sessionId);
    await saveSessions(updatedSessions);
    return updatedSessions;
  } catch (error) {
    console.error('[Storage] Lỗi khi xóa session:', error);
    return [];
  }
}

/**
 * 5. Tải hồ sơ tâm lý và ngữ cảnh người dùng (USER_MEMORY_PROFILE_V1)
 */
export async function loadUserMemoryProfile(): Promise<UserMemoryProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_MEMORY_PROFILE);
    if (!raw) return DEFAULT_USER_MEMORY;
    const parsed = { ...DEFAULT_USER_MEMORY, ...JSON.parse(raw) };
    const cleaned = cleanNightNotesFromMemory(parsed);
    // Nếu có sự thay đổi do dọn dẹp ghi chú đêm muộn sai, lưu lại
    if (JSON.stringify(parsed) !== JSON.stringify(cleaned)) {
      await saveUserMemoryProfile(cleaned);
    }
    return cleaned;
  } catch (error) {
    console.error('[Storage] Lỗi khi load User Memory Profile:', error);
    return DEFAULT_USER_MEMORY;
  }
}

/**
 * 6. Cập nhật hồ sơ tâm lý người dùng (USER_MEMORY_PROFILE_V1)
 */
export async function saveUserMemoryProfile(profile: UserMemoryProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_MEMORY_PROFILE, JSON.stringify(profile));
  } catch (error) {
    console.error('[Storage] Lỗi khi lưu User Memory Profile:', error);
  }
}

/**
 * 7. Xóa toàn bộ dữ liệu trò chuyện (Reset ứng dụng)
 */
export async function clearAllChatData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CHAT_SESSIONS,
      STORAGE_KEYS.USER_MEMORY_PROFILE,
      STORAGE_KEYS.LEGACY_CHAT_HISTORY,
      STORAGE_KEYS.LEGACY_CHAT_SESSIONS,
      STORAGE_KEYS.LEGACY_ACTIVE_SESSION,
    ]);
  } catch (error) {
    console.error('[Storage] Lỗi khi xóa dữ liệu:', error);
  }
}
