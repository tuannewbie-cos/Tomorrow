/**
 * Tomorrow v4.5.1 — Student API Quota Shield
 * Quản lý hạn mức và theo dõi sử dụng API cục bộ (AsyncStorage) dưới khóa TOMORROW_QUOTA_STATS_V1
 * Tự động reset theo ngày (YYYY-MM-DD), bảo vệ 2 API Key độc lập (OpenAI gpt-4o-mini & Chuỗi Gemini miễn phí),
 * theo dõi số lần gọi, ước lượng token an toàn, số lần fallback và trạng thái Circuit Breaker.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUOTA_STORAGE_KEY = 'TOMORROW_QUOTA_STATS_V1';

export interface ProviderQuotaData {
  requestsToday: number;
  estimatedTokensToday: number;
  fallbackCount: number;
  lastUsedTimestamp?: number;
  isAvailable: boolean;
  modelsUsage: Record<string, { requestsToday: number; tokensToday: number }>;
}

export interface DailyQuotaStats {
  date: string; // YYYY-MM-DD
  openai: ProviderQuotaData;
  gemini: ProviderQuotaData;
  circuitBreakerTripped: boolean;
  lastUpdated: number;
}

export interface QuotaSummary {
  date: string;
  openaiRequests: number;
  geminiRequests: number;
  totalTokensToday: number;
  fallbackCount: number;
  circuitBreakerTripped: boolean;
  mode: 'Hybrid' | 'Gemini Chain';
  statusText: string;
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createEmptyDailyStats(date = getTodayString()): DailyQuotaStats {
  return {
    date,
    openai: {
      requestsToday: 0,
      estimatedTokensToday: 0,
      fallbackCount: 0,
      isAvailable: true,
      modelsUsage: {},
    },
    gemini: {
      requestsToday: 0,
      estimatedTokensToday: 0,
      fallbackCount: 0,
      isAvailable: true,
      modelsUsage: {},
    },
    circuitBreakerTripped: false,
    lastUpdated: Date.now(),
  };
}

// Bộ nhớ đệm trong RAM để đọc 0ms không độ trễ
let inMemoryQuotaStats: DailyQuotaStats = createEmptyDailyStats();

/**
 * Tải thống kê Quota từ AsyncStorage, tự động reset nếu bước sang ngày mới
 */
export async function loadQuotaStats(): Promise<DailyQuotaStats> {
  const today = getTodayString();
  try {
    const raw = await AsyncStorage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed: DailyQuotaStats = JSON.parse(raw);
      if (parsed && parsed.date === today) {
        inMemoryQuotaStats = parsed;
        return inMemoryQuotaStats;
      }
    }
  } catch (err) {
    console.warn('[QuotaShield] Lỗi đọc AsyncStorage, dùng bộ đếm mới:', err);
  }

  // Khởi tạo ngày mới
  inMemoryQuotaStats = createEmptyDailyStats(today);
  try {
    await AsyncStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(inMemoryQuotaStats));
  } catch {}
  return inMemoryQuotaStats;
}

/**
 * Lưu thống kê Quota vào AsyncStorage
 */
export async function saveQuotaStats(stats: DailyQuotaStats): Promise<void> {
  inMemoryQuotaStats = stats;
  try {
    await AsyncStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(stats));
  } catch (err) {
    console.warn('[QuotaShield] Lỗi lưu AsyncStorage:', err);
  }
}

/**
 * Ghi nhận 1 lượt sử dụng API độc lập (OpenAI hoặc Gemini)
 * Ước lượng an toàn: tokens ≈ Math.ceil(chars / 3.5)
 */
export async function recordApiUsage(
  provider: 'openai' | 'gemini',
  model: string,
  inputChars: number,
  outputChars: number,
  isFallback: boolean = false
): Promise<DailyQuotaStats> {
  const today = getTodayString();
  if (inMemoryQuotaStats.date !== today) {
    await loadQuotaStats();
  }

  const estimatedTokens = Math.ceil(Math.max(1, inputChars + outputChars) / 3.5);
  const target = provider === 'openai' ? inMemoryQuotaStats.openai : inMemoryQuotaStats.gemini;

  target.requestsToday += 1;
  target.estimatedTokensToday += estimatedTokens;
  target.lastUsedTimestamp = Date.now();
  if (isFallback) {
    target.fallbackCount += 1;
  }

  const currentModelUsage = target.modelsUsage[model] || { requestsToday: 0, tokensToday: 0 };
  target.modelsUsage[model] = {
    requestsToday: currentModelUsage.requestsToday + 1,
    tokensToday: currentModelUsage.tokensToday + estimatedTokens,
  };

  inMemoryQuotaStats.lastUpdated = Date.now();
  await saveQuotaStats(inMemoryQuotaStats);
  return inMemoryQuotaStats;
}

/**
 * Cập nhật trạng thái Circuit Breaker của OpenAI
 */
export async function setOpenAICircuitBreakerState(tripped: boolean): Promise<void> {
  inMemoryQuotaStats.circuitBreakerTripped = tripped;
  inMemoryQuotaStats.openai.isAvailable = !tripped;
  inMemoryQuotaStats.lastUpdated = Date.now();
  await saveQuotaStats(inMemoryQuotaStats);
}

/**
 * Khôi phục cờ kết nối OpenAI (Thử kết nối lại)
 */
export async function resetOpenAICircuitBreaker(): Promise<void> {
  await setOpenAICircuitBreakerState(false);
}

/**
 * Trả về tóm tắt quota súc tích phục vụ UI và CommandPalette
 */
export function getQuotaSummarySync(): QuotaSummary {
  const today = getTodayString();
  if (inMemoryQuotaStats.date !== today) {
    inMemoryQuotaStats = createEmptyDailyStats(today);
  }

  const oReq = inMemoryQuotaStats.openai.requestsToday;
  const gReq = inMemoryQuotaStats.gemini.requestsToday;
  const totalTokens =
    inMemoryQuotaStats.openai.estimatedTokensToday +
    inMemoryQuotaStats.gemini.estimatedTokensToday;
  const totalFallback =
    inMemoryQuotaStats.openai.fallbackCount +
    inMemoryQuotaStats.gemini.fallbackCount;
  const isBreaker = inMemoryQuotaStats.circuitBreakerTripped;

  const mode: 'Hybrid' | 'Gemini Chain' = isBreaker ? 'Gemini Chain' : 'Hybrid';
  const statusText = `API hôm nay: OpenAI ${oReq} req • Gemini ${gReq} req • Mode: ${mode}`;

  return {
    date: today,
    openaiRequests: oReq,
    geminiRequests: gReq,
    totalTokensToday: totalTokens,
    fallbackCount: totalFallback,
    circuitBreakerTripped: isBreaker,
    mode,
    statusText,
  };
}

/**
 * Trả về tóm tắt quota async đảm bảo đồng bộ với storage
 */
export async function getQuotaSummary(): Promise<QuotaSummary> {
  await loadQuotaStats();
  return getQuotaSummarySync();
}

// Tự động tải thống kê khi khởi động module
if (typeof window !== 'undefined' || typeof global !== 'undefined') {
  loadQuotaStats().catch(() => {});
}
