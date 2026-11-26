/**
 * TOMORROW V4.11 — SERVICES/BACKUP_SERVICE.TS
 * DỊCH VỤ SAO LƯU & KHÔI PHỤC JSON CỤC BỘ (NGÀY 15 — GIAI ĐOẠN 1)
 *
 * Vận hành 100% cục bộ bằng TypeScript, không cài thư viện ngoài:
 * 1. Đọc đồng bộ 5 khóa AsyncStorage bất biến (không bao giờ đính kèm .env hay API key).
 * 2. Tính mã kiểm tra toàn vẹn (FNV-1a + DJB2 checksum) từ JSON.stringify(data).
 * 3. Xuất tệp tomorrow-backup-YYYY-MM-DD-HHmm.json chuẩn Web/macOS.
 * 4. Kiểm định & xem trước thống kê gói sao lưu (validateAndPreviewBackup).
 * 5. Khôi phục an toàn chế độ MERGE (gộp thông minh) hoặc REPLACE (ghi đè toàn bộ).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChatSession,
  StructuredMemoryVault,
  UserMemoryProfile,
} from '../types/chat';
import { ThemeMode, THEME_STORAGE_KEY } from '../constants/theme';
import {
  STORAGE_KEYS,
  DEFAULT_USER_MEMORY,
  isPlaceholderOrNoiseTitle,
} from '../storage/chatStorage';
import {
  NOTEBOOKS_STORAGE_KEY,
  DEFAULT_NOTEBOOK,
  DEFAULT_NOTEBOOK_ID,
  Notebook,
} from '../storage/notebookStorage';
import { QUOTA_STORAGE_KEY } from './quotaShield';
import {
  VAULT_STORAGE_KEY,
  migrateAndNormalizeVault,
} from './memoryVaultService';
import { buildChronoContext } from './chronoService';

export const BACKUP_APP_NAME = 'Tomorrow' as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;
export const CURRENT_APP_VERSION = 'v4.11';

export const IMMUTABLE_STORAGE_KEYS = [
  STORAGE_KEYS.CHAT_SESSIONS,
  VAULT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  QUOTA_STORAGE_KEY,
  NOTEBOOKS_STORAGE_KEY,
] as const;

export interface TomorrowBackupData {
  CHAT_SESSIONS_V2: ChatSession[];
  USER_MEMORY_PROFILE_V1: any;
  TOMORROW_THEME_MODE: 'dark' | 'light';
  TOMORROW_QUOTA_STATS_V1: any;
  TOMORROW_NOTEBOOKS_V1: Notebook[];
}

export interface TomorrowBackupBundleV1 {
  app: 'Tomorrow';
  schemaVersion: 1;
  exportedAt: string;
  appVersion: string;
  checksum: string;
  data: TomorrowBackupData;
}

export interface BackupPreviewStats {
  notebookCount: number;
  sessionCount: number;
  messageCount: number;
  studySubjectCount: number;
  financeGoalCount: number;
  memoryCount: number;
  exportedAt: string;
  appVersion: string;
  checksumValid: boolean;
}

export interface BackupValidationResult {
  valid: boolean;
  checksumValid: boolean;
  error?: string;
  warning?: string;
  bundle?: TomorrowBackupBundleV1;
  preview?: BackupPreviewStats;
}

export interface RestoreBackupResult {
  sessions: ChatSession[];
  notebooks: Notebook[];
  memoryVault: StructuredMemoryVault;
  memoryProfile: UserMemoryProfile;
  themeMode: ThemeMode;
}

/**
 * Tính mã băm toàn vẹn FNV-1a 32-bit kết hợp DJB2 32-bit từ JSON.stringify(data)
 * Bảo đảm phát hiện chính xác mọi sai lệch/chỉnh sửa thủ công trên tệp JSON.
 */
export function computeBackupChecksum(data: TomorrowBackupData | Record<string, any>): string {
  const serialized = JSON.stringify(data);

  // FNV-1a 32-bit
  let fnv = 0x811c9dc5;
  // DJB2 32-bit
  let djb2 = 5381;

  for (let i = 0; i < serialized.length; i++) {
    const code = serialized.charCodeAt(i);
    fnv ^= code;
    fnv = Math.imul(fnv, 0x01000193) >>> 0;

    djb2 = ((djb2 << 5) + djb2 + code) >>> 0;
  }

  const fnvHex = fnv.toString(16).padStart(8, '0');
  const djbHex = djb2.toString(16).padStart(8, '0');
  return `fnv1a-${fnvHex}-${djbHex}`;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Loại bỏ đệ quy mọi trường nhạy cảm dạng apiKey / token nếu vô tình tồn tại trong object lưu trữ
 */
function stripSensitiveFields<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveFields(item)) as unknown as T;
  }
  const cleanObj: Record<string, any> = {};
  for (const [key, val] of Object.entries(value as Record<string, any>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('apikey') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('secret') ||
      lowerKey === 'env'
    ) {
      continue;
    }
    cleanObj[key] = stripSensitiveFields(val);
  }
  return cleanObj as T;
}

/**
 * Làm sạch tiêu đề phiên qua bộ lọc isPlaceholderOrNoiseTitle
 */
function cleanSessionTitle(sess: ChatSession): ChatSession {
  const rawTitle = (sess.title || '').trim();
  let title = rawTitle;
  if (isPlaceholderOrNoiseTitle(rawTitle)) {
    const firstMeaningfulMsg = (sess.messages || []).find(
      (m) => (m.role === 'user' || m.sender === 'user') && !isPlaceholderOrNoiseTitle(m.text || '')
    );
    if (firstMeaningfulMsg && firstMeaningfulMsg.text?.trim()) {
      const cleanMsg = firstMeaningfulMsg.text.trim();
      title = cleanMsg.length > 30 ? `${cleanMsg.slice(0, 30)}...` : cleanMsg;
    } else {
      title = 'Trò chuyện ngắn';
    }
  }
  return {
    ...sess,
    title,
    notebookId: sess.notebookId || DEFAULT_NOTEBOOK_ID,
    messages: Array.isArray(sess.messages) ? sess.messages : [],
  };
}

/**
 * Đóng gói StructuredMemoryVault thành UserMemoryProfile tương thích AsyncStorage
 */
function buildProfileFromVault(
  vault: StructuredMemoryVault,
  baseProfile?: Partial<UserMemoryProfile> | null
): UserMemoryProfile {
  const base = baseProfile && typeof baseProfile === 'object' ? baseProfile : {};
  return {
    ...DEFAULT_USER_MEMORY,
    ...base,
    userName: base.userName && base.userName !== 'bro' ? base.userName : DEFAULT_USER_MEMORY.userName,
    nickname: vault.pronouns === 't - m' ? 'm' : base.nickname && base.nickname !== 'bro' ? base.nickname : 'bạn',
    interests: vault.favorites,
    currentProject: vault.activeProjects[0] || base.currentProject || '',
    habits: vault.habits,
    summary: vault.recentContext[0] || base.summary || '',
    lastActiveDate: new Date().toISOString(),
    vault,
    schemaVersion: 2,
    studySubjects: vault.studySubjects,
    financeGoals: vault.financeGoals,
    moodHistory: vault.moodHistory,
  };
}

/**
 * 1. Xây dựng gói sao lưu TomorrowBackupBundleV1 từ 5 khóa AsyncStorage
 */
export async function buildBackupBundle(
  appVersion: string = CURRENT_APP_VERSION
): Promise<TomorrowBackupBundleV1> {
  const [rawSessions, rawMemory, rawTheme, rawQuota, rawNotebooks] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS),
    AsyncStorage.getItem(VAULT_STORAGE_KEY),
    AsyncStorage.getItem(THEME_STORAGE_KEY),
    AsyncStorage.getItem(QUOTA_STORAGE_KEY),
    AsyncStorage.getItem(NOTEBOOKS_STORAGE_KEY),
  ]);

  const parsedSessions = safeParseJson<ChatSession[]>(rawSessions, []);
  const sessions = Array.isArray(parsedSessions) ? stripSensitiveFields(parsedSessions) : [];

  const chrono = buildChronoContext();
  const parsedMemory = safeParseJson<any>(rawMemory, null);
  const memoryData = parsedMemory
    ? stripSensitiveFields(parsedMemory)
    : migrateAndNormalizeVault(null, chrono);

  const themeMode: 'dark' | 'light' = rawTheme === 'light' ? 'light' : 'dark';

  const parsedQuota = safeParseJson<Record<string, any>>(rawQuota, {});
  const quotaData =
    parsedQuota && typeof parsedQuota === 'object' && !Array.isArray(parsedQuota)
      ? stripSensitiveFields(parsedQuota)
      : {};

  const parsedNotebooks = safeParseJson<Notebook[]>(rawNotebooks, []);
  const notebooks = Array.isArray(parsedNotebooks) ? stripSensitiveFields(parsedNotebooks) : [];

  const data: TomorrowBackupData = {
    CHAT_SESSIONS_V2: sessions,
    USER_MEMORY_PROFILE_V1: memoryData,
    TOMORROW_THEME_MODE: themeMode,
    TOMORROW_QUOTA_STATS_V1: quotaData,
    TOMORROW_NOTEBOOKS_V1: notebooks,
  };

  const checksum = computeBackupChecksum(data);

  return {
    app: BACKUP_APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    checksum,
    data,
  };
}

/**
 * Tạo tên tệp sao lưu chuẩn tomorrow-backup-YYYY-MM-DD-HHmm.json
 */
export function formatBackupFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `tomorrow-backup-${yyyy}-${mm}-${dd}-${hh}${min}.json`;
}

/**
 * 2. Kích hoạt tải tệp JSON đẹp xuống trình duyệt / macOS Web
 */
export function triggerJsonDownload(bundle: TomorrowBackupBundleV1): {
  ok: boolean;
  filename: string;
} {
  const filename = formatBackupFilename();
  if (
    typeof document === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return { ok: false, filename };
  }

  try {
    const jsonString = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);

    return { ok: true, filename };
  } catch (err) {
    console.warn('[BackupService] Lỗi tải xuống JSON:', err);
    return { ok: false, filename };
  }
}

/**
 * 3. Kiểm định tính hợp lệ, toàn vẹn checksum và trả về thống kê xem trước
 */
export function validateAndPreviewBackup(rawText: string): BackupValidationResult {
  try {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return {
        valid: false,
        checksumValid: false,
        error: 'Tệp trống hoặc không có nội dung văn bản JSON.',
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        valid: false,
        checksumValid: false,
        error: 'Tệp JSON bị lỗi cú pháp, không thể đọc dữ liệu. Vui lòng kiểm tra lại tệp sao lưu.',
      };
    }

    if (!parsed || typeof parsed !== 'object' || parsed.app !== BACKUP_APP_NAME) {
      return {
        valid: false,
        checksumValid: false,
        error: 'Tệp JSON này không thuộc ứng dụng Tomorrow (trường app phải là "Tomorrow").',
      };
    }

    if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      return {
        valid: false,
        checksumValid: false,
        error: `Phiên bản sao lưu không tương thích (nhận được schemaVersion: ${String(parsed.schemaVersion)}, yêu cầu: 1).`,
      };
    }

    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      return {
        valid: false,
        checksumValid: false,
        error: 'Gói sao lưu thiếu đối tượng dữ liệu (data) hợp lệ.',
      };
    }

    const expectedChecksum = computeBackupChecksum(parsed.data);
    const checksumValid =
      typeof parsed.checksum === 'string' && parsed.checksum === expectedChecksum;

    const sessions: ChatSession[] = Array.isArray(parsed.data.CHAT_SESSIONS_V2)
      ? parsed.data.CHAT_SESSIONS_V2
      : [];
    const notebooks: Notebook[] = Array.isArray(parsed.data.TOMORROW_NOTEBOOKS_V1)
      ? parsed.data.TOMORROW_NOTEBOOKS_V1
      : [];

    const messageCount = sessions.reduce(
      (sum, s) => sum + (Array.isArray(s?.messages) ? s.messages.length : 0),
      0
    );

    const normalizedVault = migrateAndNormalizeVault(
      parsed.data.USER_MEMORY_PROFILE_V1,
      buildChronoContext()
    );

    const studySubjectCount = normalizedVault.studySubjects.length;
    const financeGoalCount = normalizedVault.financeGoals.length;
    const memoryCount =
      normalizedVault.favorites.length +
      normalizedVault.activeProjects.length +
      normalizedVault.habits.length +
      normalizedVault.recentContext.length +
      studySubjectCount +
      financeGoalCount +
      normalizedVault.moodHistory.length;

    const preview: BackupPreviewStats = {
      notebookCount: notebooks.length,
      sessionCount: sessions.length,
      messageCount,
      studySubjectCount,
      financeGoalCount,
      memoryCount,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
      appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : 'v4.11',
      checksumValid,
    };

    const sanitizedBundle: TomorrowBackupBundleV1 = {
      app: 'Tomorrow',
      schemaVersion: 1,
      exportedAt: preview.exportedAt || new Date().toISOString(),
      appVersion: preview.appVersion,
      checksum: typeof parsed.checksum === 'string' ? parsed.checksum : '',
      data: {
        CHAT_SESSIONS_V2: sessions,
        USER_MEMORY_PROFILE_V1: parsed.data.USER_MEMORY_PROFILE_V1 ?? null,
        TOMORROW_THEME_MODE: parsed.data.TOMORROW_THEME_MODE === 'light' ? 'light' : 'dark',
        TOMORROW_QUOTA_STATS_V1: parsed.data.TOMORROW_QUOTA_STATS_V1 ?? {},
        TOMORROW_NOTEBOOKS_V1: notebooks,
      },
    };

    return {
      valid: true,
      checksumValid,
      warning: checksumValid
        ? undefined
        : 'Cảnh báo: Mã checksum không khớp — tệp có thể đã bị chỉnh sửa tay hoặc hỏng trong lúc tải.',
      bundle: sanitizedBundle,
      preview,
    };
  } catch {
    return {
      valid: false,
      checksumValid: false,
      error: 'Không thể phân tích tệp sao lưu. Vui lòng thử lại với tệp JSON hợp lệ.',
    };
  }
}

/**
 * Gộp chuỗi chống trùng lặp không phân biệt hoa thường, giữ nguyên thứ tự ưu tiên
 */
function mergeUniqueStrings(primary: string[], incoming: string[], limit: number): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...primary, ...incoming]) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
    if (merged.length >= limit) break;
  }
  return merged;
}

/**
 * Gộp 2 StructuredMemoryVault ở chế độ MERGE, khóa đúng trần phần tử
 */
function mergeVaults(
  currentVault: StructuredMemoryVault,
  backupVault: StructuredMemoryVault
): StructuredMemoryVault {
  const pronouns =
    currentVault.pronouns && currentVault.pronouns !== 'bạn bè tự nhiên'
      ? currentVault.pronouns
      : backupVault.pronouns || 'bạn bè tự nhiên';

  // Gộp studySubjects theo tên môn học (lowercase), tối đa 6
  const subjectMap = new Map<string, (typeof currentVault.studySubjects)[number]>();
  for (const subj of [...currentVault.studySubjects, ...backupVault.studySubjects]) {
    if (!subj || !subj.subject) continue;
    const key = subj.subject.trim().toLowerCase();
    const existing = subjectMap.get(key);
    if (!existing) {
      subjectMap.set(key, subj);
    } else {
      const existingTime = Date.parse(existing.updatedAt || '') || 0;
      const nextTime = Date.parse(subj.updatedAt || '') || 0;
      subjectMap.set(key, nextTime > existingTime ? { ...existing, ...subj } : existing);
    }
  }
  const studySubjects = Array.from(subjectMap.values()).slice(0, 6);

  // Gộp financeGoals theo mục tiêu (lowercase), tối đa 5
  const financeMap = new Map<string, (typeof currentVault.financeGoals)[number]>();
  for (const goal of [...currentVault.financeGoals, ...backupVault.financeGoals]) {
    if (!goal || !goal.goal) continue;
    const key = goal.goal.trim().toLowerCase();
    const existing = financeMap.get(key);
    if (!existing) {
      financeMap.set(key, goal);
    } else {
      const existingTime = Date.parse(existing.updatedAt || '') || 0;
      const nextTime = Date.parse(goal.updatedAt || '') || 0;
      financeMap.set(key, nextTime > existingTime ? { ...existing, ...goal } : existing);
    }
  }
  const financeGoals = Array.from(financeMap.values()).slice(0, 5);

  // Gộp moodHistory theo date + mood, tối đa 5
  const moodSeen = new Set<string>();
  const moodHistory: typeof currentVault.moodHistory = [];
  for (const m of [...currentVault.moodHistory, ...backupVault.moodHistory]) {
    if (!m || !m.mood) continue;
    const key = `${m.date || ''}|${m.mood.trim().toLowerCase()}`;
    if (moodSeen.has(key)) continue;
    moodSeen.add(key);
    moodHistory.push(m);
    if (moodHistory.length >= 5) break;
  }

  return {
    schemaVersion: 2,
    pronouns,
    favorites: mergeUniqueStrings(currentVault.favorites, backupVault.favorites, 5),
    activeProjects: mergeUniqueStrings(currentVault.activeProjects, backupVault.activeProjects, 5),
    habits: mergeUniqueStrings(currentVault.habits, backupVault.habits, 5),
    recentContext: mergeUniqueStrings(currentVault.recentContext, backupVault.recentContext, 5),
    studySubjects,
    financeGoals,
    moodHistory,
    updatedAt: Math.max(currentVault.updatedAt || 0, backupVault.updatedAt || 0, Date.now()),
  };
}

/**
 * 4. Khôi phục gói sao lưu an toàn xuống AsyncStorage (MERGE hoặc REPLACE)
 * Trả về state mới nhất để App.tsx cập nhật tức thì không cần khởi động lại.
 */
export async function restoreBackupBundle(
  bundle: TomorrowBackupBundleV1,
  mode: 'MERGE' | 'REPLACE' = 'MERGE'
): Promise<RestoreBackupResult> {
  const chrono = buildChronoContext();
  const backupData = bundle.data;

  const backupNotebooksRaw: Notebook[] = Array.isArray(backupData.TOMORROW_NOTEBOOKS_V1)
    ? backupData.TOMORROW_NOTEBOOKS_V1
    : [];
  const backupSessionsRaw: ChatSession[] = Array.isArray(backupData.CHAT_SESSIONS_V2)
    ? backupData.CHAT_SESSIONS_V2.map(cleanSessionTitle)
    : [];
  const backupVault = migrateAndNormalizeVault(backupData.USER_MEMORY_PROFILE_V1, chrono);

  let finalNotebooks: Notebook[] = [];
  let finalSessions: ChatSession[] = [];
  let finalVault: StructuredMemoryVault = backupVault;
  let finalMemoryProfile: UserMemoryProfile;
  let finalThemeMode: ThemeMode = backupData.TOMORROW_THEME_MODE === 'light' ? 'light' : 'dark';
  let finalQuotaRaw: string | null = null;

  if (mode === 'MERGE') {
    const [curSessionsRaw, curMemoryRaw, curThemeRaw, curNotebooksRaw, curQuotaRaw] =
      await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS),
        AsyncStorage.getItem(VAULT_STORAGE_KEY),
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(NOTEBOOKS_STORAGE_KEY),
        AsyncStorage.getItem(QUOTA_STORAGE_KEY),
      ]);

    // 1. Gộp TOMORROW_NOTEBOOKS_V1 theo id (giữ bản hiện tại nếu trùng)
    const curNotebooks = safeParseJson<Notebook[]>(curNotebooksRaw, []);
    const nbMap = new Map<string, Notebook>();
    for (const nb of Array.isArray(curNotebooks) ? curNotebooks : []) {
      if (nb && nb.id) nbMap.set(nb.id, nb);
    }
    for (const nb of backupNotebooksRaw) {
      if (nb && nb.id && !nbMap.has(nb.id)) {
        nbMap.set(nb.id, nb);
      }
    }
    if (!nbMap.has(DEFAULT_NOTEBOOK_ID)) {
      nbMap.set(DEFAULT_NOTEBOOK_ID, DEFAULT_NOTEBOOK);
    }
    finalNotebooks = Array.from(nbMap.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    // 2. Gộp CHAT_SESSIONS_V2 theo id (giữ bản nhiều tin nhắn hơn hoặc updatedAt mới hơn)
    const curSessionsParsed = safeParseJson<ChatSession[]>(curSessionsRaw, []);
    const curSessions = Array.isArray(curSessionsParsed)
      ? curSessionsParsed.map(cleanSessionTitle)
      : [];
    const sessMap = new Map<string, ChatSession>();
    for (const s of curSessions) {
      if (s && s.id) sessMap.set(s.id, s);
    }
    for (const bakSess of backupSessionsRaw) {
      if (!bakSess || !bakSess.id) continue;
      const existing = sessMap.get(bakSess.id);
      if (!existing) {
        sessMap.set(bakSess.id, bakSess);
      } else {
        const curLen = existing.messages?.length || 0;
        const bakLen = bakSess.messages?.length || 0;
        const preferBackup =
          bakLen > curLen || (bakLen === curLen && (bakSess.updatedAt || 0) > (existing.updatedAt || 0));
        const chosen = preferBackup ? bakSess : existing;
        const other = preferBackup ? existing : bakSess;
        const cleanTitle = !isPlaceholderOrNoiseTitle(chosen.title)
          ? chosen.title
          : !isPlaceholderOrNoiseTitle(other.title)
          ? other.title
          : cleanSessionTitle(chosen).title;
        sessMap.set(bakSess.id, cleanSessionTitle({ ...chosen, title: cleanTitle }));
      }
    }
    finalSessions = Array.from(sessMap.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    // 3. Gộp USER_MEMORY_PROFILE_V1 qua migrateAndNormalizeVault + chống trùng lặp + giữ trần
    const curMemoryParsed = safeParseJson<any>(curMemoryRaw, null);
    const curVault = migrateAndNormalizeVault(curMemoryParsed, chrono);
    finalVault = mergeVaults(curVault, backupVault);
    finalMemoryProfile = buildProfileFromVault(
      finalVault,
      curMemoryParsed || backupData.USER_MEMORY_PROFILE_V1
    );

    // 4. Giữ nguyên TOMORROW_QUOTA_STATS_V1 hiện tại trên máy
    finalQuotaRaw = curQuotaRaw;

    // 5. Giữ nguyên theme hiện tại trên máy nếu đã có
    finalThemeMode = curThemeRaw === 'light' || curThemeRaw === 'dark' ? curThemeRaw : finalThemeMode;
  } else {
    // CHẾ ĐỘ REPLACE: Ghi đè sạch toàn bộ 5 khóa từ bundle.data
    finalNotebooks =
      backupNotebooksRaw.length > 0 ? [...backupNotebooksRaw] : [DEFAULT_NOTEBOOK];
    if (!finalNotebooks.some((n) => n.id === DEFAULT_NOTEBOOK_ID)) {
      finalNotebooks = [DEFAULT_NOTEBOOK, ...finalNotebooks];
    }
    finalNotebooks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    finalSessions = [...backupSessionsRaw].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    finalVault = backupVault;
    finalMemoryProfile = buildProfileFromVault(finalVault, backupData.USER_MEMORY_PROFILE_V1);

    finalThemeMode = backupData.TOMORROW_THEME_MODE === 'light' ? 'light' : 'dark';
    finalQuotaRaw = JSON.stringify(backupData.TOMORROW_QUOTA_STATS_V1 ?? {});
  }

  // Ghi tuần tự xuống 5 khóa AsyncStorage
  await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(finalSessions));
  await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(finalMemoryProfile));
  await AsyncStorage.setItem(THEME_STORAGE_KEY, finalThemeMode);
  await AsyncStorage.setItem(NOTEBOOKS_STORAGE_KEY, JSON.stringify(finalNotebooks));
  if (finalQuotaRaw !== null) {
    await AsyncStorage.setItem(QUOTA_STORAGE_KEY, finalQuotaRaw);
  }

  return {
    sessions: finalSessions,
    notebooks: finalNotebooks,
    memoryVault: finalVault,
    memoryProfile: finalMemoryProfile,
    themeMode: finalThemeMode,
  };
}
