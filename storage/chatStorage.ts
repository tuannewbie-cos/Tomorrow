import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, UserMemoryProfile, ChatSession } from '../types/chat';

export const STORAGE_KEYS = {
  CHAT_HISTORY: 'CHAT_HISTORY_V1',
  USER_MEMORY_PROFILE: 'USER_MEMORY_PROFILE_V1',
  CHAT_SESSIONS: 'CHAT_SESSIONS_V1',
  ACTIVE_SESSION_ID: 'ACTIVE_SESSION_ID_V1',
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
 * Tải toàn bộ lịch sử tin nhắn từ AsyncStorage
 */
export async function loadChatHistory(): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[Storage] Lỗi khi load Chat History:', error);
    return [];
  }
}

/**
 * Lưu toàn bộ lịch sử tin nhắn vào AsyncStorage
 */
export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages));
  } catch (error) {
    console.error('[Storage] Lỗi khi lưu Chat History:', error);
  }
}

/**
 * Tải hồ sơ tâm lý và ngữ cảnh người dùng
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
 * Cập nhật hồ sơ tâm lý người dùng
 */
export async function saveUserMemoryProfile(profile: UserMemoryProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_MEMORY_PROFILE, JSON.stringify(profile));
  } catch (error) {
    console.error('[Storage] Lỗi khi lưu User Memory Profile:', error);
  }
}

/**
 * Quản lý danh sách các Session tâm sự (dùng cho Navigation Drawer)
 */
export async function loadSessions(): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS);
    if (!raw) {
      const defaultSession: ChatSession = {
        id: 'session-main',
        title: 'Tâm sự đêm muộn 🌙',
        updatedAt: Date.now(),
        messageCount: 0,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify([defaultSession]));
      return [defaultSession];
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error('[Storage] Lỗi khi load Sessions:', error);
    return [];
  }
}

export async function saveSessions(sessions: ChatSession[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
  } catch (error) {
    console.error('[Storage] Lỗi khi lưu Sessions:', error);
  }
}

/**
 * Xóa toàn bộ dữ liệu (Reset ứng dụng về trạng thái ban đầu)
 */
export async function clearAllChatData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CHAT_HISTORY,
      STORAGE_KEYS.USER_MEMORY_PROFILE,
      STORAGE_KEYS.CHAT_SESSIONS,
      STORAGE_KEYS.ACTIVE_SESSION_ID,
    ]);
  } catch (error) {
    console.error('[Storage] Lỗi khi xóa dữ liệu:', error);
  }
}
