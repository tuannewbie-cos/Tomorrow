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
  currentProblem: 'Áp lực deadline học tập và đang bị overthinking về các mối quan hệ',
  moodTrend: 'Hay bồn chồn vào đêm muộn, thích phong cách nói chuyện ấm áp nhưng hài hước',
  interests: ['Lướt TikTok/Reels', 'Nghe nhạc Chill', 'Meme mèo'],
  lastActiveDate: new Date().toISOString(),
  summary: 'Sinh viên/Gen Z đang gánh nhiều deadline và cần không gian xả stress không phán xét.',
};

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
        return parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
    }

    // Nếu CHAT_SESSIONS_V2 chưa có, thử migrate từ phiên bản cũ (CHAT_HISTORY_V1)
    const legacyHistoryRaw = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_CHAT_HISTORY);
    if (legacyHistoryRaw) {
      const legacyMsgs: any[] = JSON.parse(legacyHistoryRaw);
      if (Array.isArray(legacyMsgs) && legacyMsgs.length > 0) {
        const firstUserMsg = legacyMsgs.find((m) => m.role === 'user' || m.sender === 'user');
        const titleText = firstUserMsg?.text?.trim() || 'Cuộc trò chuyện trước đó';
        const title = titleText.length > 30 ? titleText.slice(0, 30) + '...' : titleText;

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
    return { ...DEFAULT_USER_MEMORY, ...JSON.parse(raw) };
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
