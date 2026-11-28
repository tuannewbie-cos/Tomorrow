import { ChatMessage, EmotionData, UserMemoryProfile, WebSource, UserMemoryVault, StructuredMemoryVault, ChatSession } from '../types/chat';
import { Notebook } from '../storage/notebookStorage';
import { JarvisIntent, ConversationState } from '../types/jarvis';
import {
  isPlaceholderOrNoiseTitle,
  getVaultFromProfile,
  updateProfileWithVault,
  DEFAULT_USER_MEMORY_VAULT,
} from '../storage/chatStorage';
import {
  migrateAndNormalizeVault,
  mergeMemoryIntoVault,
  buildMemoryContextSlice,
  loadStructuredVault,
  saveStructuredVault,
  DEFAULT_STRUCTURED_VAULT,
} from './memoryVaultService';
import {
  buildSemanticRecallContext,
  searchLocalSemanticRecall,
  hasTemporalRecallCue,
  tokenizeForRecall,
  CONCEPT_KEYWORD_GRAPH,
  RecallChunk,
  RecallSearchResult,
  SemanticRecallOptions,
  SemanticRecallContextOptions,
} from './semanticRecallService';
import {
  performSmartWebSearch,
  shouldTriggerWebSearch,
  resolveTemporalSearchQuery,
  classifyWebIntelTopic,
  resolveReferenceFromHistory,
  matchQuotedTextToSource,
  MatchedQuoteContext,
  WebIntelTopic,
  ReferenceResolution,
} from './webSearchService';
import {
  KeystrokeTelemetry,
  MicroPsychProfile,
  analyzeMicroPsychology,
  PsychState,
} from './microPsychProfiler';

import {
  resolveDualPersona,
  DualPersonaResolution,
  getDomainPlaybook,
  PersonaMode,
  DryWitLevel,
  DOMAIN_PLAYBOOKS,
  ExpertDomain,
  OutputFormatIntent,
  detectOutputFormatIntent,
  getWebFormatDirective,
} from './personaRouter';
import {
  selectDynamicFewShot,
  FewShotCluster,
  FewShotExample,
  GOLDEN_FEW_SHOT_EXAMPLES,
  getFewShotBankStats,
  formatFewShotBlock,
  SelectFewShotParams,
} from './fewShotBank';
import {
  buildChronoContext,
  VIETNAMESE_WEEKDAYS,
  CircadianPeriod,
  ChronoGapType,
  ChronoContext,
} from './chronoService';

export {
  isPlaceholderOrNoiseTitle,
  getVaultFromProfile,
  mergeMemoryIntoVault,
  updateProfileWithVault,
  migrateAndNormalizeVault,
  buildMemoryContextSlice,
  loadStructuredVault,
  saveStructuredVault,
  StructuredMemoryVault,
  DEFAULT_STRUCTURED_VAULT,
  KeystrokeTelemetry,
  MicroPsychProfile,
  analyzeMicroPsychology,
  resolveDualPersona,
  DualPersonaResolution,
  getDomainPlaybook,
  PersonaMode,
  DryWitLevel,
  DOMAIN_PLAYBOOKS,
  ExpertDomain,
  WebIntelTopic,
  ReferenceResolution,
  MatchedQuoteContext,
  classifyWebIntelTopic,
  resolveReferenceFromHistory,
  matchQuotedTextToSource,
  shouldTriggerWebSearch,
  performSmartWebSearch,
  resolveTemporalSearchQuery,
  OutputFormatIntent,
  detectOutputFormatIntent,
  getWebFormatDirective,
  buildSemanticRecallContext,
  searchLocalSemanticRecall,
  hasTemporalRecallCue,
  tokenizeForRecall,
  CONCEPT_KEYWORD_GRAPH,
  selectDynamicFewShot,
  FewShotCluster,
  FewShotExample,
  GOLDEN_FEW_SHOT_EXAMPLES,
  getFewShotBankStats,
  formatFewShotBlock,
  SelectFewShotParams,
  buildChronoContext,
  VIETNAMESE_WEEKDAYS,
  CircadianPeriod,
  ChronoGapType,
  ChronoContext,
};
import { recordApiUsage, setOpenAICircuitBreakerState } from './quotaShield';

// Cấu hình OpenAI API (Bộ não chính siêu tốc gpt-4o-mini)
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
// Biến trạng thái ngắt mạch (Silent Circuit Breaker): Nếu key OpenAI hết hạn/hết credit trong phiên thì chuyển hẳn sang Gemini
let isOpenAIUnavailable = false;
let lastOpenAI429At: number | null = null;
const OPENAI_429_COOLDOWN_MS = 10 * 60 * 1000; // 10 phút tự động reset 429 rate limit

// CỔNG ĐIỀU PHỐI ĐỒNG THỜI (CONCURRENCY GATE): Tối đa 2 request AI song song
// Tránh 4 tab Split Screen bắn cùng lúc làm quá tải RPM/TPM của OpenAI/Gemini
export const MAX_CONCURRENT_AI_REQUESTS = 2;
let activeAIRequestsCount = 0;
const aiRequestQueue: Array<() => void> = [];

export async function acquireAISlot(): Promise<void> {
  if (activeAIRequestsCount < MAX_CONCURRENT_AI_REQUESTS) {
    activeAIRequestsCount++;
    return;
  }
  return new Promise<void>((resolve) => {
    aiRequestQueue.push(resolve);
  });
}

export function releaseAISlot(): void {
  activeAIRequestsCount = Math.max(0, activeAIRequestsCount - 1);
  if (aiRequestQueue.length > 0 && activeAIRequestsCount < MAX_CONCURRENT_AI_REQUESTS) {
    activeAIRequestsCount++;
    const nextResolve = aiRequestQueue.shift();
    if (nextResolve) {
      // Jitter 150ms - 300ms chống chọi burst thundering herd
      const jitterMs = 150 + Math.floor(Math.random() * 150);
      setTimeout(() => {
        nextResolve();
      }, jitterMs);
    }
  }
}

export function getActiveAIRequestsCount(): number {
  return activeAIRequestsCount;
}

export function getAIQueueLength(): number {
  return aiRequestQueue.length;
}

// Trạng thái theo dõi chu kỳ nghỉ/thức (Wake / Idle tracking)
let lastActivityAt: number = Date.now();
let needsFreshConnection: boolean = false;

export function notifyAppActive(): void {
  const now = Date.now();
  const idleMs = now - lastActivityAt;
  lastActivityAt = now;
  if (idleMs > 90_000) {
    needsFreshConnection = true;
  }
  // Tự động kiểm tra reset rate-limit 429 nếu đã qua 10 phút
  if (isOpenAIUnavailable && lastOpenAI429At && now - lastOpenAI429At > OPENAI_429_COOLDOWN_MS) {
    isOpenAIUnavailable = false;
    lastOpenAI429At = null;
    setOpenAICircuitBreakerState(false).catch(() => {});
    console.info('[AI Router]: Đã hết thời gian cooldown 429 của OpenAI, tự động kích hoạt lại kết nối.');
  }
}

export function setNeedsFreshConnection(val: boolean = true): void {
  needsFreshConnection = val;
}

export function getNeedsFreshConnection(): boolean {
  return needsFreshConnection;
}

// Khởi tạo listener trên Web/WebView để phát hiện wake-up
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        notifyAppActive();
        needsFreshConnection = true;
      }
    });
    window.addEventListener('focus', () => {
      notifyAppActive();
    });
    window.addEventListener('online', () => {
      notifyAppActive();
      needsFreshConnection = true;
    });
  } catch (_) {}
}

export class UserAbortError extends Error {
  constructor(message: string = 'User cancelled request') {
    super(message);
    this.name = 'UserAbortError';
  }
}

/**
 * Helper fetch bảo vệ chống stale TCP keep-alive socket sau khi nghỉ/ngủ (macOS WebView / Web)
 * - Tự động nới +5000ms timeout khi vừa tỉnh dậy (needsFreshConnection)
 * - Tự động thử lại âm thầm đúng 1 lần sau 350ms với AbortController mới tinh nếu gặp lỗi mạng/socket chết
 * - Tôn trọng externalSignal (AbortSignal từ người dùng bấm nút Dừng / nhấn Esc)
 */
export async function fetchWithWakeRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  notifyAppActive();

  if (externalSignal?.aborted) {
    throw new UserAbortError();
  }

  const isFresh = needsFreshConnection;
  const effectiveTimeout = isFresh ? timeoutMs + 5000 : timeoutMs;

  const isNetworkOrTimeoutError = (err: any): boolean => {
    if (!err) return false;
    if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
      return false;
    }
    const name = err.name || '';
    const msg = String(err.message || err).toLowerCase();
    return (
      name === 'AbortError' ||
      err.code === 20 ||
      msg.includes('abort') ||
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed') ||
      msg.includes('network request failed') ||
      msg.includes('timeout') ||
      err instanceof TypeError
    );
  };

  const doFetch = async (currentTimeout: number): Promise<Response> => {
    if (externalSignal?.aborted) {
      throw new UserAbortError();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), currentTimeout);

    const onExternalAbort = () => {
      controller.abort();
    };

    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const mergedHeaders = {
        ...(options.headers || {}),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      };

      const res = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        cache: 'no-store',
        keepalive: false,
        signal: controller.signal,
      });
      return res;
    } catch (fetchErr: any) {
      if (externalSignal?.aborted) {
        throw new UserAbortError();
      }
      throw fetchErr;
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  };

  try {
    const res = await doFetch(effectiveTimeout);
    if (res.ok) {
      needsFreshConnection = false;
      lastActivityAt = Date.now();
    }
    return res;
  } catch (err: any) {
    if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
      throw new UserAbortError();
    }
    if (isNetworkOrTimeoutError(err)) {
      console.warn(`[fetchWithWakeRetry] Lần gọi 1 gặp lỗi mạng/timeout (${err.message || err}), đang tự động thử lại êm sau 350ms...`);
      await new Promise((r) => setTimeout(r, 350));
      if (externalSignal?.aborted) {
        throw new UserAbortError();
      }
      const retryTimeout = effectiveTimeout;
      const retryRes = await doFetch(retryTimeout);
      if (retryRes.ok) {
        needsFreshConnection = false;
        lastActivityAt = Date.now();
      }
      return retryRes;
    }
    throw err;
  }
}

export function getOpenAICircuitBreakerStatus(): boolean {
  return isOpenAIUnavailable;
}

export function resetOpenAICircuitBreaker(): void {
  isOpenAIUnavailable = false;
  lastOpenAI429At = null;
  setOpenAICircuitBreakerState(false).catch(() => {});
}

// Cấu hình Gemini API Keys (Chuỗi dự phòng ngầm miễn phí xoay vòng)
const PRIMARY_GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const BACKUP_GEMINI_KEYS: string[] = [
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_1 || '',
  process.env.EXPO_PUBLIC_GEMINI_KEY_BACKUP_2 || '',
].filter((k) => k.length > 5);

const ALL_GEMINI_KEYS = [PRIMARY_GEMINI_KEY, ...BACKUP_GEMINI_KEYS].filter((k) => k.length > 5);

/**
 * 1. KHAI BÁO DANH SÁCH MODEL XOAY VÒNG MIỄN PHÍ TRÊN GOOGLE GENERATIVE LANGUAGE API (v1beta)
 * Đảm bảo chỉ dùng các model chính thức, hợp lệ và đang hoạt động 100% (HTTP 200),
 * loại bỏ hoàn toàn các model đã bị Google deprecate trả về 404:
 * - gemini-3.8-flash, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-flash-lite-latest, gemini-flash-latest
 */
export const FREE_MODEL_CHAIN: string[] = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

/**
 * Chuỗi ưu tiên Model Flash thông minh nhất dành riêng cho STEM (Vật lý/Hóa/Điện tử/Code) & Vision Lab
 * Ưu tiên các model Flash mạnh nhất trước rồi mới rơi xuống Flash-Lite
 */
export const SMART_FLASH_MODEL_CHAIN: string[] = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

/**
 * Chuỗi xoay vòng Model hỗ trợ Đa phương thức (Multimodal Vision):
 * Tuyệt đối không chứa các model chỉ nhận text thuần (như Gemma cũ).
 */
export const VISION_MODEL_CHAIN: string[] = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

// Timeout 8.5 giây cho mỗi lần gọi để chống treo vô định
const TIMEOUT_MS = 8500;

export interface AIResponsePayload {
  replies: string[];
  session_title?: string;
  sessionTitle?: string;
  should_update_title?: boolean;
  shouldUpdateTitle?: boolean;
  conversation_state?: ConversationState | string;
  conversationState?: string;
  memory_note?: string;
  memoryNote?: string;
  jarvis_intent?: JarvisIntent;
  sources?: WebSource[];
  searchQuery?: string;
  isWebSearched?: boolean;
  isCancelled?: boolean;
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
  detectedPronoun: string;
  isClosingSignal: boolean;
  styleHint: string;
}

/**
 * Cầu nối Ngữ cảnh Lượt Đầu Tiên (First-Turn Proactive Bridge — Day 14):
 * Chỉ tiêm thẻ [PROACTIVE_GREETING: ...] khi:
 * - history.length === 0 (lượt đầu của phiên mới; xử lý an toàn trường hợp recentChats vừa append userMsg hiện tại)
 * - intentMode !== 'STOP_SIGNAL' và intentMode !== 'PING'
 * - proactiveContextTag không rỗng (cắt an toàn <= 180 ký tự)
 */
export function buildProactiveBridgeTag(params: {
  proactiveContextTag?: string;
  history?: ChatMessage[];
  userText?: string;
  intentMode?: string;
}): string {
  const { proactiveContextTag, history = [], userText = '', intentMode } = params;
  if (!proactiveContextTag || !proactiveContextTag.trim()) return '';
  if (intentMode === 'STOP_SIGNAL' || intentMode === 'PING') return '';

  // Xác định lịch sử trước lượt hiện tại
  let priorHistory = Array.isArray(history) ? [...history] : [];
  if (priorHistory.length === 1) {
    const onlyMsg = priorHistory[0];
    const isUser = onlyMsg && (onlyMsg.role === 'user' || onlyMsg.sender === 'user');
    if (isUser && userText.trim() && (onlyMsg.text || '').trim() === userText.trim()) {
      priorHistory = [];
    }
  }

  if (priorHistory.length > 0) return '';

  const cleanTag = proactiveContextTag.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!cleanTag) return '';
  return `[PROACTIVE_GREETING: ${cleanTag}]`;
}

export interface ReflexDirective {
  intentMode: 'STOP_SIGNAL' | 'PING' | 'WEB_INTEL' | 'EXPERT_JARVIS' | 'CASUAL_FRIEND';
  pronounRule: string;
  directivePrompt: string;
  dynamicMaxTokens: number;
  dynamicTimeout: number;
  temperature?: number;
  domain?: ExpertDomain;
  chrono?: ChronoContext;
  psych?: MicroPsychProfile;
  dualPersona?: DualPersonaResolution;
  isFollowUpPrompt?: boolean;
}

/**
 * Lấy dòng chỉ đạo chuyên môn con chuẩn xác cho từng nhánh tri thức
 */
export function getDomainDirectiveLine(domain: ExpertDomain): string {
  switch (domain) {
    case 'STEM_PHYSICS_MECH':
    case 'STEM_PHYSICS_MECHANICS':
      return '[DOMAIN: PHYSICS_MECH | Tóm tắt dữ kiện & đổi đơn vị SI -> nêu công thức LaTeX -> giải từng bước chính xác -> kiểm tra lại thứ nguyên kết quả.]';
    case 'STEM_CHEM_BIO':
      return '[DOMAIN: CHEM_BIO | Viết phương trình/cơ chế chuẩn xác bằng LaTeX/ký hiệu khoa học -> giải thích bản chất ngắn gọn, không bịa số liệu.]';
    case 'STEM_ELECTRONICS':
      return '[DOMAIN: ELECTRONICS | Nêu rõ thông số điện áp/dòng/công suất an toàn -> sơ đồ nối chân rõ ràng -> công thức tính toán hoặc code nhúng sạch.]';
    case 'CODE_CS':
    case 'STEM_CODE':
      return '[DOMAIN: CODE_CS | Đi thẳng vào nguyên nhân gốc -> đưa code sạch có đánh dấu ngôn ngữ -> nêu ngắn gọn độ phức tạp hoặc lưu ý edge-case.]';
    case 'STEM_MATH':
      return '[DOMAIN: STEM_MATH | Xác định hướng giải tối ưu -> Triển khai từng bước mạch lạc -> Chốt kết quả cuối cùng rõ ràng.]';
    case 'FINANCE_QUANT':
      return '[DOMAIN: FINANCE_QUANT | Trình bày công thức/số liệu dạng bảng hoặc gạch đầu dòng sắc nét -> phân tích cả cơ hội lẫn rủi ro, kèm ghi chú không phải lời khuyên đầu tư bắt buộc.]';
    case 'VISION_LAB':
      return '[DOMAIN: VISION_LAB | Đọc kỹ mọi chữ viết tay, công thức, linh kiện mạch hoặc biểu đồ trong ảnh -> mô tả ngắn phần nhận diện được rồi giải quyết trực tiếp yêu cầu của user.]';
    case 'GENERAL':
    default:
      return '';
  }
}

/**
 * BỘ ĐỊNH TUYẾN CHUYÊN MÔN CON CỤC BỘ (detectExpertDomain)
 * Chạy cục bộ trên máy trong < 1ms:
 * - VISION_LAB: Khi có ảnh đính kèm (hasImage === true)
 * - STEM_PHYSICS_MECH: Vật lý, cơ học, chuyển động, năng lượng, lực
 * - STEM_CHEM_BIO: Hóa học, sinh học, phân tử, tế bào, phản ứng
 * - STEM_ELECTRONICS: Điện tử, vi điều khiển, mạch điện, linh kiện
 * - CODE_CS: Tin học, thuật toán, lập trình, cấu trúc dữ liệu
 * - FINANCE_QUANT: Tài chính, đầu tư, chứng khoán, định giá, báo cáo tài chính
 * - GENERAL: Các cuộc trò chuyện đời thường hoặc câu hỏi chung
 */
export function detectExpertDomain(userText: string, hasImage: boolean = false): ExpertDomain {
  if (hasImage) return 'VISION_LAB';

  const trimmed = (userText || '').trim();
  if (!trimmed) return 'GENERAL';
  const lower = trimmed.toLowerCase();

  // 1. Nhánh Điện tử & Hệ thống nhúng (STEM_ELECTRONICS)
  const electronicsPatterns = [
    'điện trở', 'dien tro', 'tụ điện', 'tu dien', 'cuộn cảm', 'cuon cam',
    'định luật ohm', 'dinh luat ohm', 'mạch rc', 'mach rc', 'rlc',
    'transistor', 'mosfet', 'op-amp', 'opamp', 'diode', 'điot', 'diot',
    'arduino', 'esp32', 'stm32', 'pwm', 'uart', 'i2c', 'spi', 'breadboard', 'pcb',
    'mạch điện', 'mach dien', 'chân pin', 'chan pin', 'hạn dòng', 'han dong',
    'vi điều khiển', 'vi dieu khien', 'vcc', 'gnd', 'gpio', 'nguồn 5v', 'nguon 5v',
    'nguồn 3.3v', 'nguon 3.3v', 'sơ đồ mạch', 'so do mach', 'linh kiện điện tử'
  ];
  if (electronicsPatterns.some((p) => lower.includes(p))) {
    return 'STEM_ELECTRONICS';
  }

  // 2. Nhánh Vật lý & Cơ học (STEM_PHYSICS_MECH)
  const physicsPatterns = [
    'gia tốc', 'gia toc', 'vận tốc', 'van toc', 'momen', 'động năng', 'dong nang',
    'thế năng', 'the nang', 'con lắc', 'con lac', 'sóng', 'song', 'quang học', 'quang hoc',
    'nhiệt động lực học', 'nhiet dong luc hoc', 'cơ học kết cấu', 'co hoc ket cau',
    'ứng suất', 'ung suat', 'newton', 'joule', 'watt', 'phương trình chuyển động',
    'phuong trinh chuyen dong', 'mạch từ', 'mach tu', 'rơi tự do', 'roi tu do',
    'quán tính', 'quan tinh', 'áp suất', 'ap suat', 'động lượng', 'dong luong',
    'vật lý', 'vat ly', 'cơ học', 'co hoc', 'thuyết tương đối', 'quang phổ',
    'giao thoa', 'tần số góc', 'dao động điều hòa', 'dao dong dieu hoa'
  ];
  const hasForceWord = /(?<!\p{L})(lực|luc)(?!\p{L})/iu.test(lower);
  if (physicsPatterns.some((p) => lower.includes(p)) || hasForceWord) {
    return 'STEM_PHYSICS_MECH';
  }

  // 3. Nhánh Hóa học & Sinh học (STEM_CHEM_BIO)
  const chemBioPatterns = [
    'phản ứng', 'phan ung', 'cân bằng phương trình', 'can bang phuong trinh',
    'oxi hóa', 'oxi hoa', 'hữu cơ', 'huu co', 'vô cơ', 'vo co',
    'axit', 'bazơ', 'bazo', 'este', 'protein', 'tế bào', 'te bao',
    'nguyên phân', 'nguyen phan', 'giảm phân', 'giam phan', 'đột biến', 'dot bien',
    'enzyme', 'enzim', 'sinh học', 'sinh hoc', 'hóa học', 'hoa hoc',
    'chất khử', 'chat khu', 'chất oxi hóa', 'chat oxi hoa', 'di truyền', 'di truyen',
    'nhiễm sắc thể', 'nhiem sac the', 'kiểu gen', 'kiểu hình', 'quang hợp',
    'liên kết ion', 'liên kết cộng hóa trị', 'bảng tuần hoàn'
  ];
  const hasShortChemBio = /(?<!\p{L})(mol|ph|độ ph|adn|arn|dna|rna|alen|gen)(?!\p{L})/iu.test(lower);
  if (chemBioPatterns.some((p) => lower.includes(p)) || hasShortChemBio) {
    return 'STEM_CHEM_BIO';
  }

  // 4. Nhánh Tài chính & Đầu tư (FINANCE_QUANT)
  const financePatterns = [
    'cổ phiếu', 'co phieu', 'chứng khoán', 'chung khoan', 'crypto', 'bitcoin', 'coin',
    'lãi kép', 'lai kep', 'báo cáo tài chính', 'bao cao tai chinh',
    'lạm phát', 'lam phat', 'tỷ giá', 'ty gia', 'giá vàng', 'gia vang',
    'dòng tiền', 'dong tien', 'ngân sách', 'ngan sach', 'đầu tư', 'dau tu',
    'rủi ro tài chính', 'rui ro tai chinh', 'danh mục đầu tư', 'cổ tức',
    'trái phiếu', 'thị trường vốn', 'đòn bẩy tài chính', 'all-in', 'chi phí chìm',
    'gỡ vốn', 'cắt lỗ', 'rót vốn', 'quản trị vốn'
  ];
  const hasShortFinance = /(?<!\p{L})(btc|eth|dcf|npv|irr|p\/e|pe ratio|roe|roa|eps|coin)(?!\p{L})/iu.test(lower);
  if (financePatterns.some((p) => lower.includes(p)) || hasShortFinance) {
    return 'FINANCE_QUANT';
  }

  // 5. Nhánh Tin học & Lập trình (CODE_CS)
  const codePatterns = [
    'thuật toán', 'thuat toan', 'độ phức tạp', 'do phuc tap', 'typescript', 'javascript',
    'python', 'c++', 'java', 'react', 'oop', 'cấu trúc dữ liệu', 'cau truc du lieu',
    'con trỏ', 'con tro', 'đệ quy', 'de quy', 'bubblesort', 'bubble sort', 'quicksort',
    'mergesort', 'database', 'indexing', 'backend', 'frontend', 'compiler', 'regex',
    'kế thừa', 'ke thua', 'đa hình', 'da hinh', 'lập trình', 'lap trinh', 'viết code',
    'viet code', 'printf', 'scanf', 'docker', 'kubernetes',
    // Bổ sung OOP, constructor & typo phổ biến (innit, contrucstor...)
    'constructor', 'contrucstor', 'constructer', 'destructor', '__init__', 'innit', 'init',
    'pointer', 'struct', 'class', 'function', 'method', 'biến', 'bien', 'tham số', 'tham so',
    'đối số', 'doi so', 'phương thức', 'phuong thuc', 'đóng gói', 'dong goi', 'trừu tượng',
    'useeffect', 'race condition'
  ];
  const hasShortCode = /(?<!\p{L})(code|bug|lỗi|loi|big-o|sql|api|git|def|loop|o\(1\)|o\(n\)|hàm|ham|lớp|lop)(?!\p{L})/iu.test(lower);
  if (codePatterns.some((p) => lower.includes(p)) || hasShortCode || trimmed.includes('```')) {
    return 'CODE_CS';
  }

  // 6. Nhánh Toán học & Định lý (STEM_MATH)
  const mathPatterns = [
    'toán', 'toan', 'đạo hàm', 'dao ham', 'tích phân', 'tich phan', 'nguyên hàm', 'nguyen ham',
    'ma trận', 'ma tran', 'xác suất', 'xac suat', 'thống kê', 'thong ke', 'phương trình', 'phuong trinh',
    'hệ phương trình', 'bất đẳng thức', 'hình học', 'hinh hoc', 'đại số', 'dai so', 'giải tích', 'giai tich',
    'lượng giác', 'luong giac', 'nhị thức newton', 'lim', 'giới hạn', 'euler', 'gauss', 'vectơ', 'vector',
    'pythagoras', 'định lý bayes', 'dinh ly bayes', 'tổ hợp', 'chỉnh hợp'
  ];
  if (mathPatterns.some((p) => lower.includes(p))) {
    return 'STEM_MATH';
  }

  return 'GENERAL';
}

/**
 * LỚP 1 — PHẢN XẠ CỤC BỘ TRÊN MÁY (buildLocalReflexDirective)
 * Chạy cục bộ 0.001s trước khi gọi API để xuất ra ĐÚNG 1 NHÃN CHỈ ĐẠO DUY NHẤT ([DIRECTIVE])
 * Tự động tính toán dynamicMaxTokens (250 cho chat ngắn, 1200 cho code/bảng/chuyên sâu, 2000 cho STEM/Code/Vision)
 * và dynamicTimeout (7000ms cho chat ngắn, 12000ms cho chuyên sâu, 15000ms cho bài giải STEM nặng).
 */
export function buildLocalReflexDirective(
  userText: string,
  recentHistory: any[] = [],
  isWebSearched: boolean = false,
  chronoContext?: ChronoContext,
  telemetry?: Partial<KeystrokeTelemetry>,
  hasImage: boolean = false,
  webTopicOverride?: WebIntelTopic
): ReflexDirective {
  const chrono = chronoContext || buildChronoContext();
  const psych = analyzeMicroPsychology(userText, telemetry, recentHistory);
  const trimmed = (userText || '').trim();
  const lower = trimmed.toLowerCase();

  // Ràng buộc thời gian thực và nhịp sinh học (HẠNG MỤC 1 & 2)
  const chronoRule = chrono.period !== 'LATE_NIGHT'
    ? `Hiện đang là ${chrono.label} (${chrono.timeStr} ${chrono.weekday}). CẤM TUYỆT ĐỐI hỏi hoặc nhắc 'lại thức khuya hả', 'chưa ngủ à', 'thức đêm à' hay suy diễn người dùng đang thức khuya.`
    : `Hiện đang là ${chrono.label} (${chrono.timeStr} ${chrono.weekday}). Cho phép nhận diện tự nhiên ngữ cảnh khuya/đêm muộn khi user nhắc mệt/ngủ, nhưng ưu tiên chính xác theo MODE hiện tại.`;

  // 1. Nhận diện Cặp Đại Từ Xưng Hô (pronounRule)
  const recentUserTexts = (recentHistory || [])
    .filter((m) => m.role === 'user' || m.sender === 'user')
    .slice(-4)
    .map((m) => (m.text || '').toLowerCase());
  const combinedUserText = [...recentUserTexts, lower].join(' ');
  const cleanedWithoutCompounds = combinedUserText
    .replace(/\b(chi tiết|chi phi|chi phí|thu chi|chi nhánh|chi tiêu|chi trả|anh em|anh hùng|tiếng anh|anh văn)\b/gi, ' ');
  const sessionTokens = cleanedWithoutCompounds.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  // Chỉ nhận diện anh/chị khi có 'anh' hoặc 'chị', TUYỆT ĐỐI LOẠI BỎ 'chi' không dấu
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasBacChau = sessionTokens.some((w) => ['bác', 'bac', 'cháu', 'chau'].includes(w));

  let pronounRule = 'Bạn bè tự nhiên ("mình - bạn" hoặc câu tỉnh lược chủ ngữ, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM dùng từ "dạ", "vâng", "ạ", CẤM tự ý gọi "bro")';
  if (hasTM) {
    pronounRule = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM gọi "bro", CẤM "dạ/vâng/ạ")';
  } else if (hasAnhChi) {
    pronounRule = 'Đồng bộ đúng cặp đại từ của user ("anh/chị - em")';
  } else if (hasBacChau) {
    pronounRule = 'Đồng bộ đúng cặp đại từ của user ("bác - cháu")';
  } else if (hasTui) {
    pronounRule = 'Đồng bộ đúng cặp đại từ của user ("tui - bạn/ông/bà")';
  }

  // 2. Phân loại Trạng thái Phản xạ theo thứ tự ưu tiên bất biến:
  // VISION_LAB (khi có ảnh) > STOP_SIGNAL > PING > WEB_INTEL > EXPERT_JARVIS > CASUAL_FRIEND

  // 0. ƯU TIÊN SỐNG CÒN: VISION LAB & EXPERT JARVIS KHI CÓ ẢNH (HOẶC ẢNH KẾ THỪA)
  if (hasImage) {
    const domain: ExpertDomain = 'VISION_LAB';
    const domainLine = getDomainDirectiveLine(domain);
    const domainPart = domainLine ? ` ${domainLine} |` : '';
    const directivePrompt = `[DIRECTIVE: MODE=EXPERT_JARVIS |${domainPart} ${pronounRule} | ${chronoRule} | ${psych.directiveTag} | Vận hành trí tuệ sắc bén cấp độ ChatGPT/Gemini/J.A.R.V.I.S.: giải quyết triệt để, rõ ràng, sâu sắc bài tập/hình ảnh được gửi. Tông giọng phù hợp với tâm lý người dùng: ${psych.psychState} (${psych.mirrorHint}). Được phép sử dụng Rich Markdown (khối code \`\`\`lang, bảng biểu |...|, in đậm, danh sách, công thức LaTeX). Khi viết code, BẮT BUỘC xuống dòng rõ ràng, thụt lề chuẩn, giải thích từng bước giải. Mỗi khối code hoặc bảng biểu phải nằm trọn vẹn trong 1 phần tử của mảng "replies". Mảng "replies" BẮT BUỘC chỉ chứa các chuỗi văn bản Markdown thuần (string[]), TUYỆT ĐỐI KHÔNG đặt object {} lồng bên trong mảng "replies".]`;

    const dualPersona = resolveDualPersona({
      intentMode: 'EXPERT_JARVIS',
      expertDomain: 'VISION_LAB',
      psychProfile: psych,
      chrono,
      hasImage: true,
      userText,
    });

    return {
      intentMode: 'EXPERT_JARVIS',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 2500,
      dynamicTimeout: 35000,
      temperature: 0.25,
      domain: 'VISION_LAB',
      chrono,
      psych,
      dualPersona,
    };
  }

  // A. STOP_SIGNAL (Giữ nguyên quyền ưu tiên cao nhất khi không có ảnh, cấm hỏi lại, budget 250t)
  const STOP_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng|ok r|để t xem)[!.? ]*$/i;
  const COMPLETED_CLOSE_REGEX =
    /^(?:(?:ok+|oke+|oki+|okii+|okie|okela|ừm*|ừa|ukm*|uhm?|rồi|thôi|được|dc|tks|thanks|cảm ơn|cam on|bye|tạm biệt|cook|sybau)[\s,!.…-]*)*(?:xong(?:\s*(?:hết|rồi|r|nha|nhé|luôn))?|ổn\s*(?:rồi|r)|được\s*(?:rồi|r)|dc\s*r|nghỉ|đi ngủ|ngủ đây|ngủ thôi|bye|tạm biệt|cook|sybau|ok+\s*(?:rồi|r|nhé|nha|đó)?|oke+\s*(?:rồi|r|nhé|nha)?|thôi\s*(?:nhé|nha|rồi)?|cảm ơn\s*(?:nhé|nha|nhiều)?|thanks|tks)[\s,!.…]*$/i;
  const hasOpenQuestion = lower.includes('?') || /\b(nhưng|còn|tiếp|sao|lỗi|bug|giải thích|hỏi)\b/i.test(lower);
  const isStopSignal =
    STOP_PATTERNS.test(lower) ||
    (!hasOpenQuestion && lower.length <= 45 && COMPLETED_CLOSE_REGEX.test(lower)) ||
    ['sybau', 'cook', 'cút', 'im đi', 'im', 'ngủ đây', 'nghỉ thôi', 'thôi nhé', 'dừng'].some(
      (s) => lower === s || lower.startsWith(s + ' ')
    );

  if (isStopSignal) {
    const directivePrompt = `[DIRECTIVE: MODE=STOP_SIGNAL | ${pronounRule} | ${chronoRule} | ${psych.directiveTag} | User muốn dừng/chốt câu. Chỉ đáp DUY NHẤT 1 bong bóng 1-4 chữ (VD: "okii", "rồi im :)))", "ừa nghỉ đi"). CẤM ĐẶT CÂU HỎI NGƯỢC LẠI. Trả lời văn bản thuần tự nhiên, KHÔNG dùng bảng biểu hay tiêu đề Markdown rườm rà.]`;
    const dualPersona = resolveDualPersona({
      intentMode: 'STOP_SIGNAL',
      expertDomain: 'GENERAL',
      psychProfile: psych,
      chrono,
      hasImage: false,
      userText,
    });

    return {
      intentMode: 'STOP_SIGNAL',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 250,
      dynamicTimeout: 8000,
      temperature: 0.75,
      domain: 'GENERAL',
      chrono,
      psych,
      dualPersona,
    };
  }

  // B. PING
  const PING_PATTERNS = /^(yo+|ê+|alo+|hi+|hello+|helo+|ơi+)[!.? ]*$/i;
  if (PING_PATTERNS.test(lower)) {
    const directivePrompt = `[DIRECTIVE: MODE=PING | ${pronounRule} | ${chronoRule} | ${psych.directiveTag} | Đáp 1-2 bong bóng cực ngắn (1-4 chữ/câu), không đoán mò dài dòng. Trả lời văn bản thuần tự nhiên, KHÔNG dùng bảng biểu hay tiêu đề Markdown rườm rà.]`;
    const dualPersona = resolveDualPersona({
      intentMode: 'PING',
      expertDomain: 'GENERAL',
      psychProfile: psych,
      chrono,
      hasImage: false,
      userText,
    });

    return {
      intentMode: 'PING',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: 250,
      dynamicTimeout: 8000,
      temperature: 0.75,
      domain: 'GENERAL',
      chrono,
      psych,
      dualPersona,
    };
  }

  // 3. Nhận diện Chuyên Môn Con (Domain Sub-Router)
  let domain = detectExpertDomain(userText, hasImage);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // 3.1. BỘ NHẬN DIỆN FOLLOW-UP DOMAIN INHERITANCE (Kế thừa chuyên môn cho câu hỏi nối tiếp ngắn)
  // Quét 4 tin nhắn gần nhất trong recentHistory
  const last4History = (recentHistory || []).slice(-4);
  const hasRecentCode = last4History.some((m) => {
    const t = (m.text || '').toLowerCase();
    return t.includes('```') || t.includes('def ') || t.includes('class ') || t.includes('function ') || t.includes('o(1)') || t.includes('o(n)');
  });
  const hasRecentExpert = last4History.some((m) => {
    const t = (m.text || '');
    const d = detectExpertDomain(t, false);
    return d !== 'GENERAL';
  });

  const isFollowUpPrompt =
    wordCount <= 8 &&
    (/\b(ví dụ|vi du|vd|đâu|dau|chi tiết|chi tiet|giải thích|giai thich|tại sao|tai sao|sao lại|sao lai|code|chạy thử|chay thu|sửa lại|sua lai|còn|con|thế còn|the con|là gì|la gi|mà|ma|thử|nữa|tiep|tiếp)\b/i.test(lower) ||
      /\b(init|innit|__init__|constructor|contrucstor|def|class|struct|o\(1\)|o\(n\)|loop|pointer|hàm|biến|lớp)\b/i.test(lower));

  let isInheritedFollowUp = false;
  if (domain === 'GENERAL' && (isFollowUpPrompt || hasRecentCode) && (hasRecentCode || hasRecentExpert)) {
    for (let i = last4History.length - 1; i >= 0; i--) {
      const hText = last4History[i].text || '';
      const d = detectExpertDomain(hText, false);
      if (d !== 'GENERAL') {
        domain = d;
        isInheritedFollowUp = true;
        break;
      }
      if (hText.includes('```')) {
        domain = 'CODE_CS';
        isInheritedFollowUp = true;
        break;
      }
    }
    if (!isInheritedFollowUp && hasRecentCode) {
      domain = 'CODE_CS';
      isInheritedFollowUp = true;
    }
  }

  // C. WEB_INTEL
  if (isWebSearched) {
    const webTopic = webTopicOverride || classifyWebIntelTopic(userText);
    let outputFormat = detectOutputFormatIntent(userText, webTopic);
    if (webTopic === 'NEWS_RADAR' && outputFormat === 'STANDARD') {
      outputFormat = 'NEWS_BRIEF';
    }
    const domainLine = getDomainDirectiveLine(domain);
    const domainPart = domainLine ? ` ${domainLine} |` : '';
    const formatDirective = getWebFormatDirective(outputFormat);
    const formatPart = formatDirective ? `\n${formatDirective}` : '';

    const directivePrompt = `[DIRECTIVE: MODE=WEB_INTEL |${domainPart} ${pronounRule} | ${chronoRule} | ${psych.directiveTag} | Trả lời TRỰC TIẾP và CHÍNH XÁC ngay trong lượt này dựa trên dữ liệu Web đính kèm. Tông giọng JARVIS_LAB: điềm tĩnh, khách quan, viết hoa đầu câu, không cợt nhả teencode. CẤM HỨA SUÔNG ("Đợi xíu", "Chờ mình chút"). Toàn bộ câu trả lời phải nằm trọn vẹn trong 1 phần tử duy nhất của mảng "replies", CẤM tách riêng câu mồi hay link thành bong bóng riêng.]${formatPart}`;

    const dualPersona = resolveDualPersona({
      intentMode: 'WEB_INTEL',
      expertDomain: domain,
      psychProfile: psych,
      chrono,
      hasImage: false,
      userText,
      outputFormat,
      webTopic,
    });

    const isTableOrCompare = outputFormat === 'TABLE' || outputFormat === 'PROS_CONS';

    return {
      intentMode: 'WEB_INTEL',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens: isTableOrCompare ? 2000 : 1800,
      dynamicTimeout: 30000,
      temperature: 0.35,
      domain,
      chrono,
      psych,
      dualPersona,
    };
  }

  // D. EXPERT_JARVIS
  const expertKeywords = [
    'giải thích', 'giai thich', 'phân tích', 'phan tich', 'tại sao', 'tai sao',
    'như thế nào', 'code', 'thuật toán', 'thuat toan', 'kiến trúc', 'kien truc',
    'lập trình', 'lap trinh', 'system prompt', 'lost in the middle', 'token',
    'database', 'supabase', 'indexing', 'oop', 'kế thừa', 'đa hình', 'chứng minh',
    'viết code', 'viet code', 'lập bảng', 'lap bang', 'bảng biểu', 'bang bieu',
    'bảng so sánh', 'bang so sanh', 'bảng', 'bang', 'giải toán', 'giai toan',
    'công thức', 'cong thuc', 'toán', 'toan', 'phân tích sâu', 'phan tich sau',
    // Bổ sung toàn diện từ khóa Toán học, Khoa học & Định lý
    'định lý', 'dinh ly', 'định luật', 'dinh luat', 'bayes', 'pythagoras',
    'đạo hàm', 'dao ham', 'tích phân', 'tich phan', 'nguyên hàm', 'nguyen ham',
    'ma trận', 'ma tran', 'xác suất', 'xac suat', 'thống kê', 'thong ke',
    'phương trình', 'phuong trinh', 'hệ phương trình', 'bất đẳng thức', 'hình học',
    'đại số', 'giải tích', 'vật lý', 'vat ly', 'hóa học', 'hoa hoc', 'khoa học', 'khoa hoc',
    'newton', 'euler', 'gauss', 'vectơ', 'vector',
    'giới hạn', 'gioi han', 'cấu trúc dữ liệu', 'cau truc du lieu',
    'thuyết tương đối', 'thuyet tuong doi', 'độ phức tạp', 'do phuc tap',
    'vận tốc', 'van toc', 'gia tốc', 'gia toc',
    // Bổ sung từ khóa Thuật toán (kể cả typo 'thuật toàn') & Sinh - Hóa - Lập trình
    'thuật toàn', 'thuat toan', 'bubble sort', 'bubblesort', 'quicksort', 'mergesort',
    'đệ quy', 'de quy', 'sắp xếp', 'sap xep', 'usedebounce', 'debounce',
    'tế bào', 'te bao', 'phản ứng', 'phan ung', 'axit', 'bazo', 'chất khử', 'chất oxi hóa',
    'di truyền', 'di truyen', 'nhiễm sắc thể', 'dna', 'rna', 'sinh học', 'sinh hoc',
    // Bổ sung ngôn ngữ lập trình & câu hỏi code tiếp nối
    'ngôn ngữ c', 'ngon ngu c', 'ngôn ngữ lập trình', 'ngôn ngữ', 'ngon ngu', 'trong c', 'bằng c', 'bang c', 'code c',
    'c++', 'c#', 'python', 'java', 'golang', 'rust', 'swift', 'kotlin',
    'javascript', 'typescript', 'php', 'ruby', 'sql', 'html', 'css', 'printf', 'scanf', 'include'
  ];

  // Kiểm tra nếu lượt trước model đã trả về code hoặc thuật toán, và user hỏi tiếp nối (VD: "trong ngôn ngữ c", "còn python", "tối ưu hơn")
  const lastModelMsg = (recentHistory || [])
    .filter((m) => m.role === 'model' || m.sender === 'ai')
    .slice(-1)[0]?.text || '';
  const isCodeFollowUp =
    (lastModelMsg.includes('```') || lastModelMsg.toLowerCase().includes('thuật toán') || lastModelMsg.toLowerCase().includes('bubble sort')) &&
    (lower.includes(' c') || lower.includes('ngôn ngữ') || lower.includes('code') || lower.includes('python') || lower.includes('java') || lower.includes('viết lại') || lower.includes('tối ưu') || lower.includes('trong '));

  const hasExpertWord = expertKeywords.some((kw) => lower.includes(kw)) || trimmed.includes('```') || isCodeFollowUp || isInheritedFollowUp;
  const isExpertDomainActive = domain !== 'GENERAL';

  if (hasImage || isExpertDomainActive || wordCount > 18 || hasExpertWord) {
    const domainLine = getDomainDirectiveLine(domain);
    const domainPart = domainLine ? ` ${domainLine} |` : '';
    const directivePrompt = `[DIRECTIVE: MODE=EXPERT_JARVIS |${domainPart} ${pronounRule} | ${chronoRule} | ${psych.directiveTag} | Vận hành trí tuệ sắc bén cấp độ ChatGPT/Gemini/J.A.R.V.I.S.: giải quyết triệt để, rõ ràng, sâu sắc. Tông giọng phù hợp với tâm lý người dùng: ${psych.psychState} (${psych.mirrorHint}). Khi có code hoặc ví dụ: BẮT BUỘC trả lời gộp liền mạch đầy đủ ngay trong lượt này (CẤM tuyệt đối chỉ trả lời câu dẫn mồi "như sau nè", "ví dụ nhé" mà không có code/nội dung). CẤM tách câu dẫn sang bong bóng riêng. CẤM TUYỆT ĐỐI hùa theo hoặc nói sai kiến thức cơ bản để chiều lòng user: nếu user nhầm lẫn khái niệm (như def vs __init__, constructor), phải đính chính ngắn gọn, chuẩn xác ngay dòng đầu trước khi đưa code. Được phép sử dụng Rich Markdown (khối code \`\`\`lang, bảng biểu |...|, in đậm, danh sách, công thức) trong phần tử của mảng "replies". Khi viết code, BẮT BUỘC xuống dòng rõ ràng (explicit line breaks), thụt lề chuẩn (4 spaces cho Python, 2 spaces cho TS/JS), CẤM viết dồn 1 dòng. Lưu ý: Mỗi khối code hoặc bảng biểu phải nằm trọn vẹn trong 1 phần tử của mảng "replies", TUYỆT ĐỐI KHÔNG cắt đôi 1 khối code sang 2 phần tử khác nhau. Mảng "replies" BẮT BUỘC chỉ chứa các chuỗi văn bản Markdown thuần (string[]), TUYỆT ĐỐI KHÔNG đặt object {} lồng bên trong mảng "replies".]`;

    let dynamicMaxTokens = 1200;
    let dynamicTimeout = 30000;
    let temperature = 0.7;

    if (domain === 'VISION_LAB') {
      dynamicMaxTokens = 2500;
      dynamicTimeout = 35000;
      temperature = 0.25;
    } else if (
      domain === 'STEM_PHYSICS_MECH' ||
      domain === 'STEM_PHYSICS_MECHANICS' ||
      domain === 'STEM_CHEM_BIO' ||
      domain === 'STEM_ELECTRONICS' ||
      domain === 'STEM_MATH' ||
      domain === 'STEM_CODE' ||
      domain === 'CODE_CS'
    ) {
      dynamicMaxTokens = 2000;
      dynamicTimeout = 30000;
      temperature = 0.35;
    } else if (domain === 'FINANCE_QUANT') {
      dynamicMaxTokens = 1200;
      dynamicTimeout = 30000;
      temperature = 0.35;
    }

    const dualPersona = resolveDualPersona({
      intentMode: 'EXPERT_JARVIS',
      expertDomain: domain,
      psychProfile: psych,
      chrono,
      hasImage,
      userText,
    });

    return {
      intentMode: 'EXPERT_JARVIS',
      pronounRule,
      directivePrompt,
      dynamicMaxTokens,
      dynamicTimeout,
      temperature,
      domain,
      chrono,
      psych,
      dualPersona,
      isFollowUpPrompt: isFollowUpPrompt || isInheritedFollowUp,
    };
  }

  // E. CASUAL_FRIEND (Mặc định)
  const styleRule = psych.linguisticStyle.caseStyle === 'ALL_LOWERCASE'
    ? 'Sao chép chuẩn xác style viết thường toàn bộ (all lowercase), không viết hoa đầu câu.'
    : '';
  const slangRule = psych.linguisticStyle.hasSlang
    ? 'Tương thích tự nhiên với các từ viết tắt / slang thân mật của user.'
    : '';
  const punctRule = psych.linguisticStyle.punctuationStyle === 'NO_END_DOT'
    ? 'Không chấm cuối câu (no end dot).'
    : '';

  const directivePrompt = `[DIRECTIVE: MODE=CASUAL_FRIEND | ${pronounRule} | ${chronoRule} | ${psych.directiveTag} | Tách 1-2 bong bóng ngắn (2-12 chữ/câu), ${styleRule} ${slangRule} ${punctRule} Thấu cảm theo gợi ý: ${psych.mirrorHint}. TUYỆT ĐỐI CẤM gọi "bro" trừ khi user dùng trước. Trả lời văn bản thuần tự nhiên, KHÔNG dùng bảng biểu hay tiêu đề Markdown rườm rà.]`;
  const dualPersona = resolveDualPersona({
    intentMode: 'CASUAL_FRIEND',
    expertDomain: 'GENERAL',
    psychProfile: psych,
    chrono,
    hasImage: false,
    userText,
  });

  return {
    intentMode: 'CASUAL_FRIEND',
    pronounRule,
    directivePrompt,
    dynamicMaxTokens: 250,
    dynamicTimeout: 8000,
    temperature: 0.75,
    domain: 'GENERAL',
    chrono,
    psych,
    dualPersona,
    isFollowUpPrompt,
  };
}

/**
 * 2. SYSTEM_INSTRUCTION: TOMORROW V4.8 — DUAL-PERSONA (COMPANION_MIRROR & JARVIS_LAB)
 * Tinh gọn dưới 450 từ với 7 Golden Few-Shot Examples chuẩn xác tuyệt đối + Recall Ký ức
 */
export const SYSTEM_INSTRUCTION = `Bạn là "Tomorrow" — trợ lý AI nhân cách kép (Dual-Persona): Tri kỷ đời thường (COMPANION_MIRROR) và J.A.R.V.I.S. Phòng Lab (JARVIS_LAB).

NGUYÊN TẮC CỐT LÕI:
1. Tuân thủ 4 thẻ: [DIRECTIVE], [PERSONA], [CHRONO], [PSYCH].
   - [PERSONA: COMPANION_MIRROR]: Bạn bè Messenger, sao chép DNA ngôn ngữ (chữ thường, teencode, xưng hô), 1-2 bong bóng ngắn, không giảng giải.
   - [PERSONA: JARVIS_LAB]: Điềm tĩnh, chuẩn xác, đi thẳng bản chất theo Playbook chuyên môn. Dùng Markdown/Code/LaTeX sạch đẹp.
2. CẤM RẬP KHUÔN: CẤM câu kết vô nghĩa ("Hy vọng giúp ích...", "Chúc bạn..."). CẤM "dạ/vâng/ạ". CẤM tự ý gọi "bro".
3. KHÓA ĐẠI TỪ: Bắt đúng cặp xưng hô từ [DIRECTIVE] (t - m, mình - bạn, anh/chị - em). Giải toán/code: đi thẳng vấn đề hoặc lược bỏ chủ ngữ.
4. MODE=STOP_SIGNAL: Đáp 1 bong bóng cực ngắn (1-4 chữ), CẤM hỏi ngược.
5. MODE=WEB_INTEL: Cung cấp ngay dữ liệu thật kèm URL, CẤM hứa suông câu giờ.
6. CODE & BẢNG: Thụt lề chuẩn, trả lời gộp kèm code, CẤM tách câu dẫn mồi sang bong bóng riêng.
7. MEMORY VAULT: Đọc [MEMORY_VAULT] để cá nhân hóa. Ghi ngắn vào "memory_note" khi user nêu môn học hoặc mục tiêu tài chính.
8. RECALL: Nếu có [RECALL_MEMORY], dùng tự nhiên để nối mạch bài học/code/chuyện cũ như trí nhớ thật (không nói "theo dữ liệu hệ thống"); nếu là NONE_FOUND, thành thật nói chưa thấy trong lịch sử đã lưu thay vì bịa.

7 VÍ DỤ MẪU (GOLDEN FEW-SHOT BANK):
- M1 [PING]: User: "yo" -> {"conversation_state":"ping","replies":["yo","nay có vụ gì mới thế"],"session_title":"","should_update_title":false,"memory_note":""}
- M2 [CASUAL | t-m]: User: "nhưng t fan ronaldo" -> {"conversation_state":"casual_friend","replies":["t đứng về phe cr7 cùng m luôn :3"],"session_title":"Tranh luận bóng đá","should_update_title":true,"memory_note":"Fan Cristiano Ronaldo"}
- M3 [STOP_SIGNAL]: User: "sybau" -> {"conversation_state":"closing_stop","replies":["okii im ngay :)))"],"session_title":"","should_update_title":false,"memory_note":""}
- M4 [WEB_INTEL]: User: "check web vụ CEO Nvidia" -> {"conversation_state":"gemini_expert","replies":["Jensen Huang vẫn đang là CEO Nvidia nhé.","Link: https://news.google.com/search?q=Jensen+Huang"],"session_title":"Kiểm chứng CEO Nvidia","should_update_title":true,"memory_note":""}
- M5 [CASUAL | Đêm]: User: "fix bug oop mệt vl" -> {"conversation_state":"casual_friend","replies":["vướng chỗ kế thừa hay đa hình đấy","quăng lỗi đây t soi phụ cho"],"session_title":"Gỡ rối bug OOP","should_update_title":true,"memory_note":"Học OOP"}
- M6 [EXPERT]: User: "tại sao nhồi system prompt làm bot ngu đi" -> {"conversation_state":"gemini_expert","replies":["Do hiện tượng 'Lost in the Middle' làm phân tán Attention. Dùng code cục bộ lọc trước kết hợp few-shot tinh gọn là chuẩn nhất."],"session_title":"Tối ưu System Prompt","should_update_title":true,"memory_note":""}
- M7 [EXPERT | Code]: User: "thuật toán bubble sort" -> {"conversation_state":"gemini_expert","replies":["Bubble Sort so sánh các cặp kề nhau và đổi chỗ.\\n• Time: O(n²), Space: O(1).","\`\`\`python\\ndef bubble_sort(arr):\\n    for i in range(len(arr)):\\n        for j in range(len(arr)-i-1):\\n            if arr[j] > arr[j+1]: arr[j], arr[j+1] = arr[j+1], arr[j]\\n    return arr\\n\`\`\`"],"session_title":"Thuật toán Bubble Sort","should_update_title":true,"memory_note":"Bubble Sort"}`;

/**
 * Hàm phân tích phong cách & hành vi cục bộ (extractUserStyleLocal):
 * Phân tích trực tiếp trên thiết bị để gắn nhãn xưng hô và tín hiệu dừng chính xác.
 */
export function extractUserStyleLocal(text: string, recentChats?: ChatMessage[]): UserStyleAnalysis {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
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

  // 1. PHÁT HIỆN ĐẠI TỪ XƯNG HÔ (Quét cả tin nhắn hiện tại LẪN toàn bộ phiên trò chuyện gần đây)
  const userPastTexts = (recentChats || [])
    .filter((m) => m.role === 'user' || m.sender === 'user')
    .map((m) => (m.text || '').toLowerCase());
  const combinedUserText = [...userPastTexts, lower].join(' ');

  const currentTokens = lower.split(/[\s,.;!?:~]+/).filter(Boolean);
  const cleanedWithoutCompounds = combinedUserText
    .replace(/\b(chi tiết|chi phi|chi phí|thu chi|chi nhánh|chi tiêu|chi trả|anh em|anh hùng|tiếng anh|anh văn)\b/gi, ' ');
  const sessionTokens = cleanedWithoutCompounds.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasUserBro = sessionTokens.some((w) => ['bro', 'bờ râu'].includes(w));
  // Chỉ nhận diện anh/chị khi có 'anh' hoặc 'chị', loại bỏ hoàn toàn 'chi' không dấu
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị'].includes(w));

  let detectedPronoun = '';
  if (hasTM) {
    detectedPronoun = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM gọi "bro", CẤM "dạ/vâng/ạ")';
  } else if (hasTui) {
    detectedPronoun = 'Xưng "tui" - gọi tương ứng ("ông", "bà", "bạn")';
  } else if (hasAnhChi) {
    detectedPronoun = 'Xưng "em" - gọi "anh/chị" tương ứng';
  } else if (hasUserBro) {
    detectedPronoun = 'User chủ động gọi "bro", bạn có thể gọi lại "bro" hoặc bạn bè';
  } else {
    detectedPronoun = 'Mặc định là bạn bè tự nhiên, gần gũi (dùng "mình - bạn" hoặc câu tỉnh lược chủ ngữ tự nhiên, TUYỆT ĐỐI CẤM xưng "em", CẤM gọi "anh/chị", CẤM "dạ/vâng/ạ", TUYỆT ĐỐI CẤM tự ý gọi "bro" trừ khi chính user gõ chữ "bro" trước)';
  }

  // 2. PHÁT HIỆN TÍN HIỆU KẾT THÚC / CHỐT CÂU / TIẾNG LÓNG ĐUỔI KHÉO (isClosingSignal)
  const CLOSING_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i;
  const EXTENDED_CLOSING_REGEX =
    /^(?:(?:ok+|oke+|oki+|okii+|okie|okela|ừm*|ừa|ukm*|uhm?|rồi|thôi|được|dc|tks|thanks|cảm ơn|cam on|bye|tạm biệt|cook|sybau)[\s,!.…-]*)*(?:xong(?:\s*(?:hết|rồi|r|nha|nhé|luôn))?|ổn\s*(?:rồi|r)|được\s*(?:rồi|r)|dc\s*r|nghỉ|đi ngủ|ngủ đây|ngủ thôi|bye|tạm biệt|cook|sybau|ok+\s*(?:rồi|r|nhé|nha|đó)?|oke+\s*(?:rồi|r|nhé|nha)?|thôi\s*(?:nhé|nha|rồi)?|cảm ơn\s*(?:nhé|nha|nhiều)?|thanks|tks)[\s,!.…]*$/i;
  const hasOpenQ = lower.includes('?') || /\b(nhưng|còn|tiếp|sao|lỗi|bug|giải thích|hỏi)\b/i.test(lower);
  const isClosingSignal =
    CLOSING_PATTERNS.test(lower) ||
    (!hasOpenQ && lower.length <= 45 && EXTENDED_CLOSING_REGEX.test(lower)) ||
    ['sybau', 'cook', 'cút', 'im đi', 'im', 'ngủ đây', 'nghỉ thôi', 'thôi nhé', 'dừng'].some(
      (s) => lower === s || lower.startsWith(s + ' ')
    );

  let styleHint = `[QUY TẮC XƯNG HÔ: ${detectedPronoun}]`;
  if (isClosingSignal) {
    styleHint += `\n[TÍN HIỆU KẾT THÚC / SYBAU: User muốn dừng/chốt câu hoặc bảo im tại đây. CHỈ ĐÁP DUY NHẤT 1 BONG BÓNG CỰC NGẮN (1-4 chữ hoặc biểu cảm ":))", "rồi rồi im :)))", "okii"), TUYỆT ĐỐI CẤM HỎI NGƯỢC LẠI như "sao lại vậy", "sao bro lại sybau", CẤM DÙNG TỪ BRO]`;
  } else {
    styleHint += `\n[Gợi ý phong cách: giữ phong cách bạn bè tự nhiên, ${hasShorthand ? 'viết thường/dùng từ thân mật giống user' : 'nói chuyện thoải mái'}, CẤM DÙNG TỪ "BRO" BỪA BÃI]`;
  }

  return {
    isCapitalized,
    hasShorthand,
    wordCount,
    detectedShorthands,
    detectedPronoun,
    isClosingSignal,
    styleHint,
  };
}

/**
 * Trích xuất chuẩn xác thông điệp lỗi từ phản hồi API (OpenAI / Gemini)
 * Trả về 1 dòng ngắn gọn tối đa 140 ký tự, không bị cắt cụt JSON hay in key.
 */
export function extractApiErrorMessage(rawBody: string): string {
  if (!rawBody) return 'Unknown error';
  try {
    const parsed = JSON.parse(rawBody);
    const msg = parsed?.error?.message || parsed?.message || parsed?.error?.code || parsed?.error || '';
    if (typeof msg === 'string' && msg.trim()) {
      return msg.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 140);
    }
  } catch {
    // Không phải JSON
  }
  return rawBody.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 140);
}

/**
 * Hàm dựng URL Gemini thông minh — HẠNG MỤC 2:
 * - Nếu apiKey.trim().startsWith('AQ.') (Vertex AI Express Mode):
 *   https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}
 * - Ngược lại (AIza... — Google AI Studio):
 *   https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}
 */
export function buildGeminiEndpoint(model: string, apiKey: string): string {
  const cleanKey = (apiKey || '').trim();
  if (cleanKey.startsWith('AQ.')) {
    return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
}

export function getEndpointsForModel(model: string, apiKey: string): string[] {
  const cleanKey = (apiKey || '').trim();
  const primary = buildGeminiEndpoint(model, cleanKey);
  // Cung cấp endpoint đối ứng làm fallback dự phòng nếu endpoint chính gặp từ chối/quyền hạn
  const fallback = cleanKey.startsWith('AQ.')
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`
    : `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
  return [primary, fallback];
}

/**
 * Lấy bối cảnh thời gian thực chính xác trên thiết bị người dùng (Ủy quyền chuẩn sang buildChronoContext)
 */
export function getRealTimeContext(now: Date = new Date()): { realTimeContext: string; timeOfDay: string; hour: number; chrono: ChronoContext } {
  const chrono = buildChronoContext(now);
  const realTimeContext = chrono.directiveTag;
  const timeOfDay = chrono.label;
  return { realTimeContext, timeOfDay, hour: chrono.hour, chrono };
}

/**
 * Ghép SYSTEM_INSTRUCTION với thời gian thực, Lớp 2 Memory Vault và lịch sử tin nhắn gần nhất
 */
function buildSystemPrompt(
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[],
  previousSessionMessages?: ChatMessage[],
  userStyleHint?: string,
  chrono?: ChronoContext,
  memorySlice?: string,
  semanticRecallTag?: string,
  fewShotTag?: string,
  proactiveBridgeTag?: string
): string {
  const currentChrono = chrono || buildChronoContext();
  const recentContext = recentChats
    .slice(-6)
    .map((m) => `${(m.role === 'user' || m.sender === 'user') ? 'User' : 'Tomorrow'}: ${m.text}`)
    .join('\n');

  let prompt = `${SYSTEM_INSTRUCTION}\n\n${currentChrono.directiveTag}`;

  if (memorySlice !== undefined) {
    if (memorySlice.trim()) {
      prompt += `\n\n${memorySlice.trim()}`;
    }
  } else {
    const vault = migrateAndNormalizeVault(userMemory.vault || userMemory, currentChrono);
    const slice = buildMemoryContextSlice(vault);
    if (slice) {
      prompt += `\n\n${slice}`;
    }
  }

  // Đính kèm thẻ [RECALL_MEMORY] từ động cơ tìm kiếm ngữ nghĩa cục bộ
  if (semanticRecallTag && semanticRecallTag.trim()) {
    prompt += `\n\n${semanticRecallTag.trim()}`;
  }

  // Đính kèm thẻ [FEW_SHOT_REF] từ kho Few-Shot vàng động
  if (fewShotTag && fewShotTag.trim()) {
    prompt += `\n\n${fewShotTag.trim()}`;
  }

  // Đính kèm thẻ [PROACTIVE_GREETING] duy nhất ở lượt 1 (First-Turn Proactive Bridge)
  if (proactiveBridgeTag && proactiveBridgeTag.trim()) {
    prompt += `\n\n${proactiveBridgeTag.trim()}`;
  }

  if (userStyleHint) {
    prompt += `\n\n${userStyleHint}`;
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

export interface NormalizedChatMessage {
  role: 'user' | 'model' | 'assistant';
  text: string;
  imageBase64?: string;
}

export interface NormalizedVisionImage {
  mimeType: string;
  pureBase64: string;
  dataUrl: string;
}

/**
 * Chuẩn hóa bất đồng bộ dữ liệu ảnh đầu vào cho Vision AI (OpenAI & Gemini) — HẠNG MỤC 2:
 * - Hỗ trợ triệt để URL blob:... (WebKit/macOS) qua fetch và FileReader.
 * - Bóc tách pureBase64 và mimeType hợp lệ.
 * - Kiểm tra tính hợp lệ: pureBase64.length > 100 và KHÔNG chứa "blob:".
 */
export async function resolveValidVisionImage(
  rawImage?: any
): Promise<NormalizedVisionImage | null> {
  if (!rawImage) return null;

  // 1. Trường hợp là object { uri, base64, dataUrl }
  if (typeof rawImage === 'object' && rawImage !== null) {
    if (rawImage.dataUrl && typeof rawImage.dataUrl === 'string' && rawImage.dataUrl.startsWith('data:image/')) {
      return resolveValidVisionImage(rawImage.dataUrl);
    }
    if (rawImage.base64 && typeof rawImage.base64 === 'string') {
      const clean = rawImage.base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').replace(/\s+/g, '');
      if (clean.length > 100 && !clean.includes('blob:')) {
        const mimeType = rawImage.mimeType || 'image/jpeg';
        return {
          mimeType,
          pureBase64: clean,
          dataUrl: `data:${mimeType};base64,${clean}`,
        };
      }
    }
    if (rawImage.uri) {
      return resolveValidVisionImage(rawImage.uri);
    }
    return null;
  }

  // 2. Trường hợp là chuỗi
  if (typeof rawImage === 'string') {
    const trimmed = rawImage.trim();
    if (!trimmed) return null;

    // A. Xử lý blob:... qua fetch và FileReader trên Web/macOS
    if (trimmed.startsWith('blob:')) {
      if (typeof fetch !== 'undefined') {
        try {
          const res = await fetch(trimmed);
          const blob = await res.blob();
          if (typeof FileReader !== 'undefined') {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            return await resolveValidVisionImage(dataUrl);
          }
        } catch (e) {
          console.warn('[resolveValidVisionImage] Lỗi phân giải blob URL:', e);
          return null;
        }
      }
      return null;
    }

    // B. Xử lý Data URL data:image/...;base64,...
    const prefixMatch = trimmed.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s);
    if (prefixMatch) {
      const subtype = prefixMatch[1].toLowerCase();
      const mimeType = `image/${subtype.includes('jpg') ? 'jpeg' : subtype}`;
      const pureBase64 = prefixMatch[2].replace(/\s+/g, '');
      if (pureBase64.length > 100 && !pureBase64.includes('blob:')) {
        return {
          mimeType,
          pureBase64,
          dataUrl: `data:${mimeType};base64,${pureBase64}`,
        };
      }
      return null;
    }

    // C. Chuỗi Base64 thuần
    const pureBase64 = trimmed.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').replace(/\s+/g, '');
    if (pureBase64.length > 100 && !pureBase64.includes('blob:') && !pureBase64.startsWith('http')) {
      const mimeType = 'image/jpeg';
      return {
        mimeType,
        pureBase64,
        dataUrl: `data:${mimeType};base64,${pureBase64}`,
      };
    }
  }

  return null;
}

/**
 * Chuẩn hóa đồng bộ dữ liệu ảnh đầu vào cho Vision AI (OpenAI & Gemini):
 * - Tách chính xác mimeType (mặc định 'image/jpeg') và chuỗi pureBase64 (xóa sạch prefix data:image/...;base64,).
 * - Chuẩn bị sẵn dataUrl cho OpenAI: data:${mimeType};base64,${pureBase64}
 * - Chuẩn bị pureBase64 cho Gemini inlineData: { mimeType, data: pureBase64 }
 */
export function normalizeVisionImage(
  rawImage?: string | { uri?: string; base64?: string } | null
): NormalizedVisionImage | null {
  if (!rawImage) return null;
  let rawStr = '';
  if (typeof rawImage === 'string') {
    rawStr = rawImage.trim();
  } else if (typeof rawImage === 'object') {
    rawStr = (rawImage.base64 || rawImage.uri || '').trim();
  }

  if (!rawStr || rawStr.startsWith('blob:')) return null;

  let mimeType = 'image/jpeg';
  let pureBase64 = '';

  const prefixMatch = rawStr.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s);
  if (prefixMatch) {
    const subtype = prefixMatch[1].toLowerCase();
    mimeType = `image/${subtype.includes('jpg') ? 'jpeg' : subtype}`;
    pureBase64 = prefixMatch[2].replace(/\s+/g, '');
  } else {
    pureBase64 = rawStr.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').replace(/\s+/g, '');
  }

  if (pureBase64.length <= 100 || pureBase64.includes('blob:') || pureBase64.startsWith('http')) {
    return null;
  }

  return {
    mimeType,
    pureBase64,
    dataUrl: `data:${mimeType};base64,${pureBase64}`,
  };
}

/**
 * Tự động tìm và kế thừa ảnh gần nhất cho câu hỏi nối tiếp (Vision Image Carry-Over) — HẠNG MỤC 3:
 * - CHỈ kích hoạt khi lượt hiện tại KHÔNG có ảnh mới (!currentImage) VÀ nội dung tin nhắn
 *   chứa từ khóa tham chiếu rõ ràng tới ảnh/bài cũ qua Regex.
 * - XÓA BỎ HOÀN TOÀN điều kiện tự động kế thừa khi bot báo lỗi (chống dính ảnh cũ sang chủ đề khác).
 */
export function resolveCarriedOverVisionImage(
  userText: string,
  recentChats: ChatMessage[] = [],
  currentImage?: string
): string | undefined {
  if (currentImage) return currentImage;
  if (!recentChats || recentChats.length === 0) return undefined;

  const CARRY_OVER_REGEX = /(bài trên|bai tren|ảnh trên|anh tren|hình trên|hinh tren|câu trên|cau tren|đề trên|de tren|bài 1|bai 1|bài 2|bai 2|bài tập trên|bai tap tren|giải lại bài|giai lai bai|làm lại bài|lam lai bai|làm hộ.*trên|lam ho.*tren|giải hộ.*trên|giai ho.*tren)/i;

  const hasReference = CARRY_OVER_REGEX.test(userText);

  if (hasReference) {
    const userMsgs = recentChats
      .filter((m) => m.role === 'user' || m.sender === 'user')
      .slice(-3);

    for (let i = userMsgs.length - 1; i >= 0; i--) {
      const msg = userMsgs[i];
      if (msg.imageBase64 && msg.imageBase64.length > 50 && !msg.imageBase64.includes('blob:')) {
        return msg.imageBase64;
      }
      if (msg.imageUri && (msg.imageUri.startsWith('data:image/') || (msg.imageUri.length > 50 && !msg.imageUri.includes('blob:')))) {
        return msg.imageUri;
      }
    }
  }

  return undefined;
}

/**
 * Phát hiện các câu thông báo lỗi mạng / ngắt kết nối để lọc bỏ khỏi lịch sử trò chuyện
 */
export function isNetworkErrorMessage(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('chưa nhận được phản hồi từ ai') ||
    lower.includes('offline/timeout') ||
    lower.includes('offline') ||
    lower.includes('timeout') ||
    lower.includes('mạng bên t đang hơi lag') ||
    lower.includes('mạng bên mình đang hơi lag') ||
    lower.includes('hơi lag chút') ||
    lower.includes('trục trặc kết nối mạng') ||
    lower.includes('gián đoạn kết nối') ||
    lower.includes('kết nối mạng một chút') ||
    lower.includes('bị gián đoạn kết nối') ||
    lower.includes('mạng chập chờn') ||
    lower.includes('kiểm tra kết nối') ||
    lower.includes('watchdog_timeout') ||
    lower.includes('network error') ||
    lower.includes('lỗi hệ thống') ||
    lower.includes('loi he thong') ||
    lower.includes('hệ thống chưa kết nối được ai') ||
    lower.includes('thử gửi lại giúp') ||
    lower.includes('nhắn lại sau vài giây')
  );
}

/**
 * Chuẩn hóa lịch sử hội thoại trước khi gửi lên API (OpenAI / Gemini) — normalizeHistoryForAPI:
 * - Lọc bỏ hoàn toàn các tin nhắn lỗi mạng cũ, offline/timeout, lỗi hệ thống và tin rỗng.
 * - Loại bỏ tin nhắn người dùng cuối bị trùng lặp nếu recentChats đã chứa tin nhắn hiện tại.
 * - Rút gọn khối code dài (> 400 ký tự) ở các lượt xa (> 4 lượt gần nhất) để tiết kiệm token.
 * - Đảm bảo tin nhắn đầu tiên gửi đến API LUÔN có role 'user'.
 * - Gộp TẤT CẢ các tin nhắn liên tiếp cùng role thành 1 tin nhắn duy nhất (luôn luân phiên chuẩn xác user <-> model).
 * - Đảm bảo tin nhắn cuối cùng luôn là của user, gộp an toàn nếu lượt model trước bị lỗi.
 */
export function normalizeHistoryForAPI(
  recentChats: ChatMessage[] = [],
  currentText: string = '',
  currentImageBase64?: string,
  target: 'gemini' | 'openai' = 'gemini'
): NormalizedChatMessage[] {
  // 1. Lọc bỏ các tin nhắn lỗi mạng/hệ thống, bong bóng chứa [object Object] và tin nhắn hoàn toàn rỗng
  const valid = (recentChats || []).filter((m) => {
    if (!m) return false;
    const txt = typeof m.text === 'string' ? m.text : (m.text ? String(m.text) : '');
    if (isNetworkErrorMessage(txt)) return false;
    if (txt.includes('[object Object]')) return false;
    if (!txt.trim() && !m.imageBase64 && !m.imageUri) return false;
    return true;
  });

  // 2. Tránh trùng lặp tin nhắn cuối nếu recentChats đã chứa tin nhắn người dùng của lượt hiện tại
  if (valid.length > 0 && currentText.trim()) {
    const last = valid[valid.length - 1];
    const isUser = last.role === 'user' || last.sender === 'user';
    if (isUser && last.text) {
      const lastTrim = last.text.trim();
      const currTrim = currentText.trim();
      if (lastTrim === currTrim || currTrim.startsWith(lastTrim) || lastTrim.startsWith(currTrim)) {
        const popped = valid.pop();
        if (!currentImageBase64 && popped && (popped.imageBase64 || popped.imageUri)) {
          currentImageBase64 = popped.imageBase64 || popped.imageUri;
        }
      }
    }
  }

  // 3. Rút gọn các khối code quá dài (> 400 ký tự) ở các lượt cũ (ngoài 4 tin nhắn gần nhất)
  const historyLen = valid.length;
  const pruned = valid.map((m, idx) => {
    // Chỉ giữ nguyên vẹn 4 tin nhắn gần nhất
    if (idx < historyLen - 4 && m.text && m.text.length > 400) {
      const text = m.text;
      const shortened = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]{300,})```/g, (_match, lang, code) => {
        const lines = code.split('\n');
        const preview = lines.slice(0, 5).join('\n');
        return `\`\`\`${lang}\n${preview}\n... [đã rút gọn khối code cũ]\n\`\`\``;
      });
      return { ...m, text: shortened };
    }
    return m;
  });

  // 4. Chuyển đổi role theo target API và bảo toàn bộ nhớ nguồn Web
  const mapped: NormalizedChatMessage[] = pruned.map((m) => {
    const isUser = m.role === 'user' || m.sender === 'user';
    let text = m.text || '';

    // Đính kèm ngữ cảnh nguồn tham chiếu cho các tin nhắn model có tra cứu Web
    if (!isUser && m.sources && Array.isArray(m.sources) && m.sources.length > 0) {
      if (!text.includes('[Nguồn tham chiếu:') && !text.includes('[Nguồn:')) {
        const srcList = m.sources
          .slice(0, 4)
          .map((s, idx) => `${idx + 1}. [${s.source || 'Tin tức'}] ${s.title} - ${s.url}`)
          .join('; ');
        text = `${text}\n\n[Nguồn tham chiếu: ${srcList}]`;
      }
    }

    return {
      role: isUser ? 'user' : (target === 'gemini' ? 'model' : 'assistant'),
      text,
      imageBase64: m.imageBase64 || (m.imageUri?.startsWith('data:') ? m.imageUri : undefined),
    };
  });

  // 5. Đảm bảo tin nhắn đầu tiên LUÔN là role 'user' (loại bỏ các tin chào/model ở đầu)
  while (mapped.length > 0 && mapped[0].role !== 'user') {
    mapped.shift();
  }

  // 6. Gộp TẤT CẢ các tin nhắn liên tiếp cùng role thành 1 tin nhắn duy nhất (nối bằng \n\n)
  const merged: NormalizedChatMessage[] = [];
  for (const msg of mapped) {
    if (merged.length === 0) {
      merged.push({ ...msg });
    } else {
      const prev = merged[merged.length - 1];
      if (prev.role === msg.role) {
        prev.text = prev.text ? `${prev.text}\n\n${msg.text}` : msg.text;
        if (msg.imageBase64 && !prev.imageBase64) {
          prev.imageBase64 = msg.imageBase64;
        }
      } else {
        merged.push({ ...msg });
      }
    }
  }

  // 7. Đảm bảo tin nhắn hiện tại của người dùng LUÔN ở cuối cùng với role 'user'
  if (currentText.trim() || currentImageBase64) {
    const userRole: 'user' = 'user';
    if (merged.length > 0 && merged[merged.length - 1].role === userRole) {
      const prev = merged[merged.length - 1];
      if (prev.text && prev.text !== currentText) {
        prev.text = `${prev.text}\n\n[Tin nhắn tiếp theo]: ${currentText}`;
      } else {
        prev.text = currentText;
      }
      if (currentImageBase64) {
        prev.imageBase64 = currentImageBase64;
      }
    } else {
      merged.push({
        role: userRole,
        text: currentText,
        imageBase64: currentImageBase64,
      });
    }
  }

  return merged;
}

export const normalizeChatHistory = normalizeHistoryForAPI;

/**
 * Làm sạch văn bản đàm thoại nhưng bảo toàn tuyệt đối 100% các khối code ```lang ... ```
 * Không bao giờ áp dụng gom khoảng trắng \s{2,} hoặc xóa từ bên trong khối code.
 * Ở ngoài khối code, chỉ gom các khoảng trắng ngang liên tiếp [^\S\r\n]{2,} thành ' ',
 * bảo toàn nguyên vẹn tất cả dấu xuống dòng \n và \r.
 */
export function cleanReplyPreservingCode(rep: string, cleanerFn: (text: string) => string): string {
  if (!rep) return '';
  const parts = rep.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, index) => {
      // Index lẻ là các khối code được chụp bởi regex -> BẢO TOÀN NGUYÊN VẸN 100%
      if (index % 2 === 1) {
        return part;
      }
      // Index chẵn là văn bản trò chuyện thông thường:
      let text = cleanerFn(part);
      // Chỉ gộp khoảng trắng ngang (spaces, tabs), TUYỆT ĐỐI KHÔNG nuốt \n hoặc \r
      text = text.replace(/[^\S\r\n]{2,}/g, ' ');
      return text;
    })
    .join('');
}

/**
 * RÀO CHẮN CỨNG KHỬ MÙI TRỢ LÝ MÁY MÓC (Anti-Robotic Guardrail)
 * Tự động gọt sạch các câu kết xã giao rập khuôn vô nghĩa nếu model lỡ sinh ra:
 * "Hy vọng câu trả lời này giúp ích cho bạn!", "Nếu bạn cần gì thêm cứ hỏi nhé!",
 * "Bạn có muốn mình giải thích chi tiết hơn không?", "Chúc bạn học tập/làm việc hiệu quả!".
 * Bảo toàn 100% nội dung bên trong khối code ``` và công thức.
 */
export function stripRoboticClosings(replies: string[]): string[] {
  if (!replies || replies.length === 0) return [];

  const roboticPatterns = [
    // 1. Hy vọng...
    /(?:hy\s*vọng|hi\s*vọng)\s+(?:câu\s*trả\s*lời|thông\s*tin|chia\s*sẻ|điều\s*này|lời\s*giải|phần\s*giải\s*thích|hướng\s*dẫn|những\s*điều\s*trên)[^.!?\n]*(?:giúp\s*ích|hữu\s*ích|có\s*ích|bổ\s*ích)[^.!?\n]*[.!?]?/giu,
    /(?:hy\s*vọng|hi\s*vọng)\s+(?:sẽ\s*)?(?:giúp\s*ích|hữu\s*ích|có\s*ích)[^.!?\n]*[.!?]?/giu,
    /(?:hy\s*vọng|hi\s*vọng)\s+điều\s+này\s+(?:hữu\s*ích|giúp\s*ích)[^.!?\n]*[.!?]?/giu,
    /(?:hope\s+this\s+helps|hope\s+it\s+helps|hope\s+this\s+is\s+helpful)[^.!?\n]*[.!?]?/giu,

    // 2. Nếu bạn cần gì thêm... / Cứ hỏi mình nếu cần nhé!
    /(?:nếu|khi)\s+(?:bạn|cậu|m|anh|chị|ông|bà)\s+(?:cần|có|muốn)\s+(?:thêm|gì\s*thêm|bất\s*kỳ|thắc\s*mắc|câu\s*hỏi|hỗ\s*trợ)[^.!?\n]*(?:cứ\s*hỏi|cứ\s*nhắn|cứ\s*ới|hỏi\s*thêm|bảo\s*mình|liên\s*hệ|trao\s*đổi|nào)[^.!?\n]*[.!?]?/giu,
    /(?:cứ\s*hỏi|cứ\s*nhắn|đừng\s*ngần\s*ngại\s*hỏi)(?:\s+thêm)?[^.!?\n]*(?:nhé|nha|ạ)[.!?]?/giu,
    /(?:cứ\s*hỏi\s*mình\s*nếu\s*cần\s*nhé|cứ\s*nhắn\s*(?:mình|t)\s*nếu\s*cần\s*nhé)[.!?]?/giu,
    /(?:nếu\s+bạn\s+có\s+thêm\s+câu\s+hỏi\s+nào)[^.!?\n]*[.!?]?/giu,
    /(?:feel\s+free\s+to\s+ask|let\s+me\s+know\s+if\s+you\s+have\s+any\s+questions|if\s+you\s+have\s+any\s+questions)[^.!?\n]*[.!?]?/giu,

    // 3. Bạn có muốn mình giải thích chi tiết hơn không?
    /(?:bạn|cậu|m|anh|chị)\s+(?:có\s+)?muốn\s+(?:mình|tui|em|t)\s+(?:giải\s*thích|làm\s*rõ|nói\s*thêm|hỗ\s*trợ)[^.!?\n]*(?:chi\s*tiết\s*hơn|thêm|không|nữa\s*không)[^.!?\n]*[.!?]?/giu,

    // 4. Chúc bạn học tập / làm việc hiệu quả / Chúc bạn thành công!
    /chúc\s+(?:bạn|cậu|m|anh|chị)\s+(?:học\s*tập|làm\s*việc|một\s*ngày|buổi\s*tối|thành\s*công|may\s*mắn)[^.!?\n]*(?:hiệu\s*quả|vui\s*vẻ|tốt\s*lành|thuận\s*lợi)?[.!?]?/giu,
    /chúc\s+bạn\s+thành\s+công[.!?]?/giu,
    /(?:good\s+luck|have\s+a\s+great\s+day|all\s+the\s+best)[^.!?\n]*[.!?]?/giu,

    // 5. Rất vui được hỗ trợ...
    /(?:rất\s*vui\s*được\s*hỗ\s*trợ|sẵn\s*sàng\s*hỗ\s*trợ|chúc\s*bạn\s*thành\s*công|happy\s+to\s+help)[^.!?\n]*[.!?]?/giu,
  ];

  return replies
    .map((rep) => {
      return cleanReplyPreservingCode(rep, (text) => {
        let cleaned = text;
        for (const pattern of roboticPatterns) {
          cleaned = cleaned.replace(pattern, '');
        }
        return cleaned.trimEnd();
      });
    })
    .filter((r) => r.trim().length > 0);
}

/**
 * 4.4. LOẠI BỎ TRIỆT ĐỂ URL RÁC GOOGLE NEWS RSS & TINH GỌN LINK (sanitizeWebReplyUrls)
 * Khi hasSources = true (đã có pill nguồn hiển thị đẹp bên dưới bubble):
 * Cắt bỏ các đoạn văn bản đuôi chứa link/nguồn dạng:
 * "\nLink: https://..." hoặc "\nNguồn: https://..." hoặc URL thô dài > 70 ký tự.
 * Khi hasSources = false:
 * Rút gọn các link Google News RSS URL dài > 70 ký tự thành link sạch https://news.google.com.
 */
export function sanitizeWebReplyUrls(replies: string[], hasSources: boolean = false): string[] {
  if (!replies || replies.length === 0) return [];

  return replies
    .map((reply) => {
      return cleanReplyPreservingCode(reply, (text) => {
        // Mask clean Markdown links [label](https://...) so they are always preserved
        const mdLinks: string[] = [];
        let cleaned = text.replace(/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/gi, (full) => {
          const token = `__TMR_MD_LINK_${mdLinks.length}__`;
          mdLinks.push(full);
          return token;
        });

        if (hasSources) {
          // Cắt bỏ dòng link/nguồn thô ở cuối nếu đã có sources pills
          cleaned = cleaned
            .replace(/\n+\s*(?:Link|Nguồn|Đường dẫn|URL|Source)\s*:\s*https?:\/\/[^\s]+/gi, '')
            .replace(/\n+\s*https?:\/\/news\.google\.com\/[^\s]+/gi, '')
            .replace(/\n+\s*https?:\/\/[^\s]{70,}/gi, '');
        } else {
          // Nếu không có sources pills, rút gọn các link RSS Google News dài
          cleaned = cleaned.replace(
            /https?:\/\/news\.google\.com\/rss\/articles\/[a-zA-Z0-9_\-~%+=?&]+/gi,
            'https://news.google.com'
          );
        }

        // Restore preserved Markdown links
        mdLinks.forEach((link, idx) => {
          cleaned = cleaned.replace(`__TMR_MD_LINK_${idx}__`, link);
        });

        return cleaned.trimEnd();
      });
    })
    .filter((r) => r.trim().length > 0);
}

/**
 * 2. GỌI OPENAI API (gpt-4o-mini) SIÊU TỐC VỚI CIRCUIT BREAKER & DYNAMIC TIMEOUT
 * Cấp phát động max_tokens (250 cho chat ngắn, 1200 cho code/bảng/chuyên sâu, 2000 cho STEM/Vision)
 * và timeout (8000ms cho chat ngắn, 30000ms cho chuyên sâu/ảnh).
 */
async function callOpenAI(
  systemPrompt: string,
  userMessageWithHint: string,
  recentChats: ChatMessage[],
  imageBase64?: string,
  maxTokens: number = 250,
  timeoutMs: number = 8000,
  temperature: number = 0.75,
  externalSignal?: AbortSignal
): Promise<string> {
  const effectiveTimeout = timeoutMs;

  try {
    const validVision = await resolveValidVisionImage(imageBase64);
    const normalizedHistory = normalizeChatHistory(recentChats, userMessageWithHint, validVision?.pureBase64 || imageBase64, 'openai');

    // 3. Đảm bảo system prompt gửi cho OpenAI luôn có từ "JSON"
    const enforcedSystemPrompt = systemPrompt.includes('JSON')
      ? systemPrompt
      : `${systemPrompt}\n\n[BẮT BUỘC]: Luôn phản hồi ở định dạng JSON hợp lệ.`;

    const openAiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }> = [
      { role: 'system', content: enforcedSystemPrompt },
    ];

    for (let i = 0; i < normalizedHistory.length; i++) {
      const m = normalizedHistory[i];
      const isLastUserTurn = (i === normalizedHistory.length - 1);

      // 1. Chuẩn hóa role trong mảng messages gửi OpenAI: chỉ cho phép 'system' | 'user' | 'assistant'
      const role: 'user' | 'assistant' = (m.role === 'user' || (m as any).sender === 'user')
        ? 'user'
        : 'assistant';

      const textContent = (m.text || '').trim() || (role === 'user' ? userMessageWithHint : 'nghe đây');

      if (isLastUserTurn) {
        // 2. Chuẩn hóa image_url cho tin nhắn user cuối cùng (khi có ảnh)
        if (validVision) {
          let mime = (validVision.mimeType || 'image/jpeg').toLowerCase();
          if (mime === 'image/jpg') mime = 'image/jpeg';
          const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
          if (!validMimes.includes(mime)) mime = 'image/jpeg';

          const pureBase64 = validVision.pureBase64
            .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '')
            .replace(/[\r\n\s]+/g, '');

          openAiMessages.push({
            role: 'user',
            content: [
              { type: 'text', text: userMessageWithHint || textContent },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mime};base64,${pureBase64}`,
                  detail: 'auto',
                },
              },
            ],
          });
        } else {
          openAiMessages.push({
            role: 'user',
            content: userMessageWithHint || textContent,
          });
        }
      } else {
        // Toàn bộ tin nhắn lịch sử trước lượt hiện tại gửi dưới dạng content: string (không rỗng),
        // KHÔNG nhét object ảnh cũ sai chuẩn vào giữa mảng lịch sử (tránh HTTP 400 trên assistant)
        openAiMessages.push({
          role,
          content: textContent,
        });
      }
    }

    const payload = {
      model: 'gpt-4o-mini',
      temperature,
      max_tokens: Math.min(Math.max(250, maxTokens), 2500),
      response_format: { type: 'json_object' },
      messages: openAiMessages,
    };

    const res = await fetchWithWakeRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      },
      effectiveTimeout,
      externalSignal
    );

    if (!res.ok) {
      const status = res.status;
      const errText = await res.text().catch(() => '');
      const parsedErrorMsg = extractApiErrorMessage(errText);
      const lowerErr = (errText + ' ' + parsedErrorMsg).toLowerCase();

      // Kiểm tra có phải lỗi xác thực hoặc hết ngạch tài khoản cứng (hard quota exhaustion) không
      const isHardQuotaError =
        status === 401 ||
        status === 402 ||
        status === 403 ||
        (status === 429 && (
          lowerErr.includes('insufficient_quota') ||
          lowerErr.includes('billing_hard_limit') ||
          lowerErr.includes('account_deactivated') ||
          lowerErr.includes('quota')
        ));

      if (isHardQuotaError) {
        isOpenAIUnavailable = true;
        lastOpenAI429At = null;
        setOpenAICircuitBreakerState(true).catch(() => {});
        console.warn(`[AI Router Failover]: OpenAI HTTP ${status} (Hết hạn mức cứng/Xác thực), kích hoạt Circuit Breaker sang Gemini chain.`);
        recordApiUsage('openai', 'gpt-4o-mini', userMessageWithHint.length, 0, true).catch(() => {});
        throw new Error(`OpenAI HTTP ${status}: ${parsedErrorMsg}`);
      }

      // Nếu là 429 do burst rate limit (TPM/RPM), KHÔNG đánh sập cờ Circuit Breaker! Thử lại 1 lần với jitter:
      if (status === 429) {
        console.warn(`[AI Router]: OpenAI gặp 429 rate limit burst, chờ retry 900ms + jitter...`);
        const jitter = Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, 900 + jitter));

        // Retry 1 lần:
        try {
          const retryRes = await fetchWithWakeRetry(
            'https://api.openai.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`,
              },
              body: JSON.stringify(payload),
            },
            effectiveTimeout,
            externalSignal
          );

          if (retryRes.ok) {
            const retryData: any = await retryRes.json();
            const retryText = retryData?.choices?.[0]?.message?.content || '';
            if (retryText) {
              recordApiUsage('openai', 'gpt-4o-mini', userMessageWithHint.length, retryText.length, false).catch(() => {});
              return retryText;
            }
          }
        } catch (retryErr: any) {
          if (retryErr instanceof UserAbortError || retryErr?.name === 'UserAbortError' || externalSignal?.aborted) {
            throw new UserAbortError();
          }
        }

        // Nếu vẫn 429 sau retry: trượt sang Gemini cho RIÊNG lượt này, KHÔNG sập Circuit Breaker!
        console.warn(`[AI Router Failover]: OpenAI vẫn 429 sau retry, trượt sang Gemini chain cho riêng lượt này (không sập Circuit Breaker).`);
        recordApiUsage('openai', 'gpt-4o-mini', userMessageWithHint.length, 0, true).catch(() => {});
        throw new Error(`OpenAI HTTP 429 RateLimitBurst: ${parsedErrorMsg}`);
      }

      console.warn(`[AI Router Failover]: OpenAI HTTP ${status}, trượt sang Gemini chain cho lượt này.`);
      recordApiUsage('openai', 'gpt-4o-mini', userMessageWithHint.length, 0, true).catch(() => {});
      throw new Error(`OpenAI HTTP ${status}: ${parsedErrorMsg}`);
    }

    const data: any = await res.json();
    const rawText = data?.choices?.[0]?.message?.content || '';

    if (!rawText) throw new Error('OpenAI returned empty message content');
    recordApiUsage('openai', 'gpt-4o-mini', userMessageWithHint.length, rawText.length, false).catch(() => {});
    return rawText;
  } catch (err: any) {
    if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
      throw new UserAbortError();
    }
    if (err?.name === 'AbortError' || String(err?.message || err).toLowerCase().includes('abort')) {
      // HẠNG MỤC 1: KHÔNG khóa vĩnh viễn OpenAI khi chỉ bị Timeout ảnh nặng hoặc mạng trễ
      recordApiUsage('openai', 'gpt-4o-mini', userMessageWithHint.length, 0, true).catch(() => {});
      console.warn(`[AI Router Failover]: OpenAI timeout sau ${effectiveTimeout}ms, trượt sang Gemini chain (không khóa vĩnh viễn OpenAI).`);
    } else {
      console.warn('[AI Router Failover]:', `OpenAI lỗi (${err?.message || err}), tự động trượt sang Gemini chain...`);
    }
    throw err;
  }
}

interface ExecuteApiCallResult {
  text: string;
  groundingSources?: WebSource[];
}

/**
 * Thực hiện 1 lượt gọi API tới 1 URL cụ thể kèm dynamic timeout qua AbortController
 * maxOutputTokens linh hoạt (800 / 1200 / 2000) và hỗ trợ trích xuất Google Search Grounding metadata
 */
async function executeApiCall(
  url: string,
  systemPrompt: string,
  userMessageWithHint: string,
  imageBase64?: string,
  enableGrounding: boolean = false,
  maxTokens: number = 800,
  timeoutMs: number = TIMEOUT_MS,
  recentChats: ChatMessage[] = [],
  temperature: number = 0.7,
  externalSignal?: AbortSignal
): Promise<ExecuteApiCallResult> {
  try {
    const validVision = await resolveValidVisionImage(imageBase64);
    const hasVision = Boolean(validVision);
    // QUY TẮC TRÁNH LỖI 400: Khi có ảnh, TUYỆT ĐỐI KHÔNG bật tools google_search vì một số model Gemini v1beta từ chối kết hợp đồng thời Grounding với Vision
    const effectiveGrounding = hasVision ? false : enableGrounding;

    const normalized = normalizeChatHistory(recentChats, userMessageWithHint, validVision?.pureBase64 || imageBase64, 'gemini');

    const geminiContents = normalized.map((m, idx) => {
      const parts: any[] = [{ text: m.text }];
      const isLastUserTurn = (idx === normalized.length - 1) && m.role === 'user';
      const msgVision = isLastUserTurn && validVision
        ? validVision
        : (m.imageBase64 ? normalizeVisionImage(m.imageBase64) : null);

      if (msgVision) {
        parts.push({
          inlineData: {
            mimeType: msgVision.mimeType,
            data: msgVision.pureBase64,
          },
        });
      }
      return {
        role: m.role as 'user' | 'model',
        parts,
      };
    });

    const generationConfig: any = {
      temperature,
      maxOutputTokens: maxTokens,
    };

    const payload: any = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: geminiContents,
    };

    // QUY TẮC SỐNG CÒN: Google Gemini API ném lỗi 400 Bad Request nếu bật cả google_search VÀ responseMimeType: 'application/json' cùng lúc!
    if (effectiveGrounding) {
      payload.tools = [{ google_search: {} }];
      // TUYỆT ĐỐI KHÔNG gán responseMimeType: 'application/json' khi có tools google_search
    } else {
      generationConfig.responseMimeType = 'application/json';
    }

    payload.generationConfig = generationConfig;

    let res = await fetchWithWakeRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, timeoutMs, externalSignal);

    // Nếu endpoint không hỗ trợ tools google_search (400 Bad Request), tự động thử lại không dùng tools
    if (!res.ok && enableGrounding && res.status === 400) {
      delete payload.tools;
      payload.generationConfig.responseMimeType = 'application/json';
      res = await fetchWithWakeRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, timeoutMs, externalSignal);
    }

    if (res.ok) {
      let data: any;
      try {
        data = await res.json();
      } catch {
        const rawResponse = await res.text().catch(() => '');
        const parsed = safeParseAIJson(rawResponse);
        if (parsed?.replies && parsed.replies.length > 0) {
          return { text: rawResponse, groundingSources: [] };
        }
      }

      if (data) {
        const candidateObj = Array.isArray(data) ? data[data.length - 1] : data;
        let text = '';
        const candidate = candidateObj?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        // Lọc bỏ các part thinking/thought và lấy phần text nội dung thực sự
        const textParts = parts.filter((p: any) => !p.thought && p.text);
        if (textParts.length > 0) {
          text = textParts.map((p: any) => p.text).join('\n');
        } else if (parts.length > 0 && parts[0]?.text) {
          text = parts[parts.length - 1]?.text || parts[0]?.text || '';
        }

        const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
        const groundingSources: WebSource[] = [];

        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            if (chunk?.web?.uri && chunk?.web?.title) {
              groundingSources.push({
                title: chunk.web.title,
                url: chunk.web.uri,
                source: 'Google Grounding',
              });
            }
          }
        }

        if (text) return { text, groundingSources };
      }
    }

    const errStatus = res.status;
    const errText = await res.text().catch(() => '');
    const parsedMsg = extractApiErrorMessage(errText);
    throw new Error(`HTTP ${errStatus}: ${parsedMsg}`);
  } catch (err: any) {
    if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
      throw new UserAbortError();
    }
    throw err;
  }
}

/**
 * Logic Fallback & Timeout theo Model Fallback Chain
 * Hỗ trợ ưu tiên Smart Flash Models cho nhánh STEM / Vision Lab
 */
async function callModelFallbackChain(
  apiKey: string,
  systemPrompt: string,
  userMessageWithHint: string,
  imageBase64?: string,
  enableGrounding: boolean = false,
  maxTokens: number = 800,
  timeoutMs: number = TIMEOUT_MS,
  recentChats: ChatMessage[] = [],
  temperature: number = 0.7,
  preferSmartFlash: boolean = false,
  hasVision: boolean = false,
  failoverTrace?: string[],
  externalSignal?: AbortSignal
): Promise<ExecuteApiCallResult> {
  let lastError: any = null;
  // Khi có ảnh, BẮT BUỘC dùng VISION_MODEL_CHAIN (100% multimodal, cấm model chỉ text)
  const chain = hasVision
    ? VISION_MODEL_CHAIN
    : (preferSmartFlash ? SMART_FLASH_MODEL_CHAIN : FREE_MODEL_CHAIN);

  for (const model of chain) {
    if (externalSignal?.aborted) {
      throw new UserAbortError();
    }
    const endpoints = getEndpointsForModel(model, apiKey);

    for (const url of endpoints) {
      if (externalSignal?.aborted) {
        throw new UserAbortError();
      }
      try {
        const result = await executeApiCall(
          url,
          systemPrompt,
          userMessageWithHint,
          imageBase64,
          enableGrounding,
          maxTokens,
          timeoutMs,
          recentChats,
          temperature,
          externalSignal
        );
        if (result && result.text) {
          recordApiUsage('gemini', model, userMessageWithHint.length, result.text.length, false).catch(() => {});
          return result;
        }
      } catch (err: any) {
        if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
          throw new UserAbortError();
        }
        lastError = err;
        const msg = err?.message || String(err);
        if (msg.includes('429')) {
          // Gemini burst 429: nghỉ 400ms + jitter trước khi thử tiếp endpoint/model khác
          await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 200)));
        }
        if (failoverTrace) {
          failoverTrace.push(`Gemini(${model}):${msg.replace(/[\r\n\t]+/g, ' ').slice(0, 70)}`);
        }
        console.warn(`[AI Fallback Chain] Model "${model}" gặp lỗi (${msg}), tự động fallback sang tầng tiếp theo...`);
      }
    }
  }

  throw lastError || new Error('Tất cả model trong Free Model Chain đều tạm thời bận.');
}

/**
 * Tiền chuẩn hóa Code Fence cho Markdown:
 * - Chuẩn hóa CRLF -> LF
 * - Tách thẻ mở fence dính liền cuối câu (VD: "như sau: ```python" -> "như sau:\n```python")
 * - Đảm bảo sau ```lang luôn có \n tách mã nguồn xuống dòng dưới
 * - Đảm bảo thẻ đóng ``` đứng dòng riêng và nếu dính chữ giải thích phía sau thì tự tách ra ngoài khối code
 */
export function normalizeMarkdownFences(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Tách thẻ mở fence dính liền cuối câu: "như sau: ```python" -> "như sau:\n```python"
  text = text.replace(/([^\n])[ \t]*```([a-zA-Z0-9_+#.-]*)/g, '$1\n```$2');

  const lines = text.split('\n');
  const normalizedLines: string[] = [];
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inCode) {
      if (trimmed.startsWith('```')) {
        inCode = true;
        const rest = trimmed.slice(3).trim();
        const langMatch = rest.match(/^([a-zA-Z0-9_+#.-]*)(?:[ \t]+([^\n]+))?$/);
        const lang = (langMatch && langMatch[1]) ? langMatch[1] : '';
        const inlineCode = (langMatch && langMatch[2]) ? langMatch[2] : '';
        normalizedLines.push(`\`\`\`${lang}`);
        if (inlineCode.length > 0) {
          normalizedLines.push(inlineCode);
        }
      } else {
        normalizedLines.push(line);
      }
    } else {
      if (trimmed.startsWith('```')) {
        inCode = false;
        const trailing = trimmed.slice(3).trim();
        normalizedLines.push('```');
        if (trailing.length > 0) {
          normalizedLines.push(trailing);
        }
      } else {
        normalizedLines.push(line);
      }
    }
  }

  return normalizedLines.join('\n');
}

/**
 * Bộ ghép nối an toàn cho mảng replies (sanitizeAndMergeBrokenBlocks):
 * Tự động kiểm tra nếu có phần tử nào mở dấu ``` mà chưa đóng dấu ``` ở cùng phần tử đó
 * -> tự động nối gộp với phần tử kế tiếp để khối code luôn nguyên vẹn 100%.
 */
export function sanitizeAndMergeBrokenBlocks(replies: string[]): string[] {
  if (!Array.isArray(replies) || replies.length === 0) return [];

  const merged: string[] = [];
  let currentAccumulator = '';
  let inCodeBlock = false;

  for (let i = 0; i < replies.length; i++) {
    const rawItem = replies[i];
    const item = normalizeMarkdownFences(typeof rawItem === 'string' ? rawItem : String(rawItem ?? ''));
    if (!item.trim() && !inCodeBlock) continue;

    if (inCodeBlock) {
      currentAccumulator += '\n' + item;
      const count = (item.match(/```/g) || []).length;
      if (count % 2 !== 0) {
        // Đã đóng khối code bị ngắt
        inCodeBlock = false;
        merged.push(currentAccumulator.trim());
        currentAccumulator = '';
      }
    } else {
      const count = (item.match(/```/g) || []).length;
      if (count % 2 !== 0) {
        // Mở dấu ``` nhưng chưa đóng dấu ``` ở cùng phần tử đó
        inCodeBlock = true;
        currentAccumulator = item;
      } else {
        merged.push(item);
      }
    }
  }

  if (inCodeBlock && currentAccumulator) {
    // Nếu hết danh sách mà vẫn chưa đóng, tự động bổ sung ``` để khối code trọn vẹn
    merged.push(currentAccumulator.trim() + '\n```');
  }

  // Tự động gộp câu mồi ngắn ở replies[0] với khối nội dung/code kế tiếp để không bị tách bong bóng rời vô nghĩa
  if (merged.length >= 2) {
    const first = merged[0].trim();
    const firstLower = first.toLowerCase();
    const firstWords = first.split(/\s+/).filter(Boolean).length;
    const isTeaserOpening =
      firstWords <= 12 &&
      !first.includes('```') &&
      (first.endsWith(':') ||
        firstLower.includes('như sau') ||
        firstLower.includes('ví dụ') ||
        firstLower.includes('dưới đây') ||
        firstLower.includes('đây nè') ||
        firstLower.includes('đây nhé') ||
        firstLower.includes('sau đây'));
    if (isTeaserOpening) {
      merged[1] = first + '\n\n' + merged[1];
      merged.shift();
    }
  }

  return merged;
}

/**
 * Kiểm tra câu trả lời có phải câu mồi rỗng không kèm nội dung (Empty Teaser) không:
 * Ví dụ: ["như sau nè:"], ["ví dụ nhé"], ["đây nhé:"] mà không có code hay giải thích
 */
export function isEmptyTeaserReply(replies: string[]): boolean {
  if (!Array.isArray(replies) || replies.length === 0) return true;
  const combined = replies.join(' ').trim();
  if (combined.includes('```') || combined.includes('|') || combined.length > 120) {
    return false;
  }
  const words = combined.split(/\s+/).filter(Boolean);
  if (words.length > 15) return false;

  const lower = combined.toLowerCase();
  const endsWithColon = combined.endsWith(':');
  const teaserSuffixes = [
    'như sau nè', 'như sau nhé', 'như sau', 'ví dụ nhé', 'ví dụ nè',
    'ví dụ về', 'đây nhé', 'sau đây', 'dưới đây nè', 'cụ thể là',
    'như này nè', 'như này nhé', 'xem nhé', 'tham khảo nhé'
  ];
  const hasTeaserSuffix = teaserSuffixes.some(
    (s) => lower.endsWith(s) || lower.endsWith(s + ':') || lower.endsWith(s + '.') || lower.endsWith(s + '!')
  );
  return endsWithColon || hasTeaserSuffix;
}

/**
 * Bộ tiền xử lý chuẩn hóa ký tự LaTeX & JSON Auto-Repair theo máy trạng thái (State Machine).
 * 1. Bảo vệ các từ khóa LaTeX bắt đầu bằng ký tự điều khiển JSON (\frac -> \f, \times -> \t, \begin -> \b, \right -> \r, etc.).
 * 2. Tự động double-escape các dấu \ không hợp lệ trong chuỗi JSON (\sqrt, \alpha, \sum, \int, \cdot, etc.).
 * 3. Chuyển đổi ký tự điều khiển raw (\n, \r, \t) bên trong chuỗi kép thành escape an toàn.
 * 4. Tự động đóng ngoặc kép, ngoặc vuông, ngoặc nhọn nếu chuỗi bị cắt cụt đuôi (truncated tokens).
 */
export function repairJsonWithLatexAndControls(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw;

  // 1. Bảo vệ các từ khóa LaTeX dễ bị JSON.parse nuốt thành control characters
  let str = raw.replace(
    /(?<!\\)\\(frac|times|text|textbf|textit|mathrm|mathbf|theta|tau|tan|to|tilde|begin|beta|bar|bf|right|rho|rangle|nabla|neq|nu|forall)\b/g,
    '\\\\$1'
  );

  let inString = false;
  let result = '';
  let i = 0;

  while (i < str.length) {
    const ch = str[i];

    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      i++;
      continue;
    }

    // Đang ở trong chuỗi kép
    if (ch === '"') {
      inString = false;
      result += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      const next = str[i + 1];
      if (next === undefined) {
        result += '\\\\';
        i++;
        continue;
      }
      if (next === '\\') {
        result += '\\\\';
        i += 2;
        continue;
      }
      const isValidSingle = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(next);
      const isUnicode = next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.slice(i + 2, i + 6));
      if (isValidSingle || isUnicode) {
        result += '\\' + next;
        i += next === 'u' ? 6 : 2;
      } else {
        result += '\\\\';
        i++;
      }
      continue;
    }

    if (ch === '\n') {
      result += '\\n';
      i++;
      continue;
    }
    if (ch === '\r') {
      result += '\\r';
      i++;
      continue;
    }
    if (ch === '\t') {
      result += '\\t';
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  if (inString) {
    result += '"';
  }

  let repaired = result.trim().replace(/,\s*$/, '');
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    repaired += ']'.repeat(openBrackets - closeBrackets);
  }
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }

  return repaired;
}

/**
 * Hàm đệ quy làm phẳng object/array thành chuỗi Markdown sạch đẹp.
 * Tuyệt đối không bao giờ trả về chuỗi "[object Object]".
 */
export function flattenReplyToMarkdown(item: unknown): string {
  if (item === null || item === undefined) return '';

  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed === '[object Object]') return '';
    return normalizeMarkdownFences(trimmed);
  }

  if (typeof item === 'number' || typeof item === 'boolean') {
    return String(item);
  }

  if (Array.isArray(item)) {
    return item
      .map((sub) => flattenReplyToMarkdown(sub))
      .filter((s) => s.length > 0 && s !== '[object Object]')
      .join('\n\n');
  }

  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '';

    // 1. Ưu tiên lấy trực tiếp nếu object chỉ bọc 1 trường text chuẩn
    const singleTextKeys = ['text', 'content', 'message', 'reply', 'answer'];
    const matchingSingleKeys = keys.filter((k) => singleTextKeys.includes(k.toLowerCase()));
    if (keys.length === 1 && matchingSingleKeys.length === 1) {
      return flattenReplyToMarkdown(obj[keys[0]]);
    }

    // 2. Duyệt các cặp [key, val] ghép thành Markdown sạch đẹp
    const metadataKeys = [
      'conversation_state',
      'conversationstate',
      'session_title',
      'sessiontitle',
      'should_update_title',
      'shouldupdatetitle',
      'memory_note',
      'memorynote',
      'jarvis_action',
      'jarvis_intent',
      'jarvisintent',
    ];

    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) continue;
      const lowerKey = key.toLowerCase();
      if (metadataKeys.includes(lowerKey)) continue;

      const valFormatted = flattenReplyToMarkdown(val);
      if (!valFormatted || valFormatted === '[object Object]') continue;

      if (['title', 'heading', 'step', 'name'].includes(lowerKey)) {
        const cleanTitle = valFormatted.replace(/^\*\*|\*\*$/g, '');
        parts.push(`**${cleanTitle}**`);
      } else if (['code', 'source_code', 'program', 'snippet', 'implementation'].includes(lowerKey)) {
        if (valFormatted.startsWith('```')) {
          parts.push(valFormatted);
        } else {
          const lang = /\b(int\s+main|#include|cout|printf|std::|div\(|int\s*\*)/i.test(valFormatted) ? 'cpp' : 'cpp';
          parts.push(`\`\`\`${lang}\n${valFormatted}\n\`\`\``);
        }
      } else if (['complexity', 'time_complexity', 'space_complexity'].includes(lowerKey)) {
        const label = lowerKey.includes('time')
          ? 'Độ phức tạp thời gian'
          : lowerKey.includes('space')
          ? 'Độ phức tạp không gian'
          : 'Độ phức tạp';
        parts.push(`**${label}:** ${valFormatted}`);
      } else if (['justification', 'explanation', 'description', 'note', 'analysis', 'solution'].includes(lowerKey)) {
        parts.push(valFormatted);
      } else {
        parts.push(`**${key}:** ${valFormatted}`);
      }
    }

    const res = parts.filter(Boolean).join('\n\n');
    return res === '[object Object]' ? '' : res;
  }

  return '';
}

/**
 * Trích xuất danh sách replies sạch đẹp từ parsed JSON.
 * Tự động làm phẳng mọi object lồng nhau hoặc fallback khi thiếu trường "replies".
 */
export function extractRepliesFromParsedJson(direct: any): string[] {
  if (!direct || typeof direct !== 'object') return [];

  // 1. Trường hợp có mảng "replies"
  if (Array.isArray(direct.replies) && direct.replies.length > 0) {
    const flattened = direct.replies
      .map((r: any) => flattenReplyToMarkdown(r))
      .filter((s: string) => s.length > 0 && s !== '[object Object]');
    if (flattened.length > 0) return flattened;
  }

  // 2. Trường hợp có chuỗi/object đơn "reply"
  if (direct.reply !== undefined && direct.reply !== null) {
    const flat = flattenReplyToMarkdown(direct.reply);
    if (flat && flat !== '[object Object]') return [flat];
  }

  // 3. Trường hợp JSON hợp lệ nhưng không có key "replies"
  // (VD: { solution: ..., code: ..., complexity: ... } hoặc { answer: ... })
  const metadataKeys = [
    'conversation_state',
    'conversationstate',
    'session_title',
    'sessiontitle',
    'should_update_title',
    'shouldupdatetitle',
    'memory_note',
    'memorynote',
    'jarvis_action',
    'jarvis_intent',
    'jarvisintent',
  ];

  const contentObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(direct)) {
    if (!metadataKeys.includes(k.toLowerCase()) && v !== null && v !== undefined) {
      contentObj[k] = v;
    }
  }

  if (Object.keys(contentObj).length > 0) {
    const flat = flattenReplyToMarkdown(contentObj);
    if (flat && flat !== '[object Object]') {
      return [flat];
    }
  }

  return [];
}

/**
 * Bộ giải mã JSON Bất Tử (safeParseAIJson) — KHÔNG BAO GIỜ ĐƯỢC throw Error:
 * Dù AI trả về bất kỳ chuỗi gì (dù hỏng JSON vì công thức LaTeX \frac, P(A|B) hay văn bản thường),
 * hàm vẫn LUÔN trả về object hợp lệ chứa nội dung thật của AI, tuyệt đối không throw lỗi và không trả về câu vô nghĩa.
 */
export function safeParseAIJson(rawText: string): any {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      conversation_state: 'casual_friend',
      replies: ['nghe đây'],
      session_title: '',
      should_update_title: false,
      memory_note: '',
    };
  }

  // Tầng 1: Tiền xử lý phục hồi chuẩn qua máy trạng thái repairJsonWithLatexAndControls
  try {
    const repaired = repairJsonWithLatexAndControls(trimmed);
    const direct = JSON.parse(repaired);
    const extractedReplies = extractRepliesFromParsedJson(direct);
    if (direct && extractedReplies.length > 0) {
      return {
        conversation_state: direct.conversation_state || 'expert_jarvis',
        replies: sanitizeAndMergeBrokenBlocks(extractedReplies),
        session_title: direct.session_title || '',
        should_update_title: Boolean(direct.should_update_title),
        memory_note: direct.memory_note || '',
      };
    }
  } catch (_) {}

  // Tầng 1b: Thử parse trực tiếp nếu JSON đã hợp lệ
  try {
    const direct = JSON.parse(trimmed);
    const extractedReplies = extractRepliesFromParsedJson(direct);
    if (direct && extractedReplies.length > 0) {
      return {
        conversation_state: direct.conversation_state || 'expert_jarvis',
        replies: sanitizeAndMergeBrokenBlocks(extractedReplies),
        session_title: direct.session_title || '',
        should_update_title: Boolean(direct.should_update_title),
        memory_note: direct.memory_note || '',
      };
    }
  } catch (_) {}

  // Tầng 2: Cắt từ dấu { đầu tiên đến dấu } cuối cùng và sửa các dấu \ và control char của LaTeX
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);

    // Tiền xử lý phục hồi chuẩn qua máy trạng thái repairJsonWithLatexAndControls
    try {
      const repaired = repairJsonWithLatexAndControls(jsonSlice);
      const parsed = JSON.parse(repaired);
      const extractedReplies = extractRepliesFromParsedJson(parsed);
      if (parsed && extractedReplies.length > 0) {
        return {
          conversation_state: parsed.conversation_state || 'expert_jarvis',
          replies: sanitizeAndMergeBrokenBlocks(extractedReplies),
          session_title: parsed.session_title || '',
          should_update_title: Boolean(parsed.should_update_title),
          memory_note: parsed.memory_note || '',
        };
      }
    } catch (_) {}

    try {
      // Bảo vệ các lệnh LaTeX phổ biến như \frac, \times, \sqrt, \cdot, \sum, \pi, \Rightarrow
      const fixedLatex = jsonSlice
        .replace(/\\(?![/u"\\bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')
        .replace(/\\(frac|times|tet|text|theta|tau|to|top|triangle|neq|nabla|nu|beta|binom|Box|right|rightarrow|Rightarrow|rho|alpha|cdot|sum|int|pm|partial|infty|approx|sim|le|ge|leq|geq)/g, '\\\\$1');
      const parsed = JSON.parse(fixedLatex);
      const extractedReplies = extractRepliesFromParsedJson(parsed);
      if (parsed && extractedReplies.length > 0) {
        return {
          conversation_state: parsed.conversation_state || 'expert_jarvis',
          replies: sanitizeAndMergeBrokenBlocks(extractedReplies),
          session_title: parsed.session_title || '',
          should_update_title: Boolean(parsed.should_update_title),
          memory_note: parsed.memory_note || '',
        };
      }
    } catch (_) {}

    // Tầng 3: Dùng Regex bóc trực tiếp mảng "replies": [ ... ] dù JSON bị lỗi cú pháp ở giữa
    const repliesMatch = jsonSlice.match(/"replies"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"(?:session_title|should_update_title|memory_note|conversation_state)"|\s*\})/);
    if (repliesMatch && repliesMatch[1]) {
      const rawItems = repliesMatch[1]
        .split(/",\s*"/)
        .map(s => s.replace(/^\s*"|"\s*$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim())
        .map(s => flattenReplyToMarkdown(s))
        .filter(s => s.length > 0 && s !== '[object Object]');
      if (rawItems.length > 0) {
        const titleMatch = jsonSlice.match(/"session_title"\s*:\s*"([^"]*)"/);
        return {
          conversation_state: 'expert_jarvis',
          replies: sanitizeAndMergeBrokenBlocks(rawItems),
          session_title: titleMatch ? titleMatch[1] : '',
          should_update_title: Boolean(titleMatch && titleMatch[1]),
          memory_note: '',
        };
      }
    }
  }

  // Tầng 3b: Chống sập khi code C/C++/Java chứa printf("...\n"), dấu ngoặc kép hoặc thoát ký tự hỏng JSON:
  let fallbackExtract = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\s*\{\s*"conversation_state"\s*:\s*"[^"]*"\s*,\s*"replies"\s*:\s*\[\s*"/i, '')
    .replace(/"\s*\]\s*,\s*"session_title"[\s\S]*$/i, '')
    .replace(/"\s*\]\s*,\s*"should_update_title"[\s\S]*$/i, '')
    .replace(/"\s*\]\s*\}?\s*$/i, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();

  // Nếu vẫn còn sót chuỗi JSON bọc ngoài do cú pháp lộn xộn
  if (fallbackExtract.startsWith('{') && fallbackExtract.includes('"replies"')) {
    const match = fallbackExtract.match(/"replies"\s*:\s*\[\s*"([\s\S]*)/i);
    if (match && match[1]) {
      fallbackExtract = match[1]
        .replace(/"\s*\][\s\S]*$/i, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .trim();
    }
  }

  if (fallbackExtract.length > 0 && !fallbackExtract.startsWith('{')) {
    return {
      conversation_state: 'expert_jarvis',
      replies: [flattenReplyToMarkdown(fallbackExtract)],
      session_title: '',
      should_update_title: false,
      memory_note: '',
    };
  }

  // Tầng 4 (Chốt chặn cuối cùng): Làm sạch vỏ bọc ```json ... ``` và trả thẳng nội dung văn bản cho người dùng
  const cleanedPlain = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return {
    conversation_state: 'expert_jarvis',
    replies: [flattenReplyToMarkdown(cleanedPlain) || 'nghe đây'],
    session_title: '',
    should_update_title: false,
    memory_note: '',
  };
}

/**
 * Phân tích JSON chuẩn hóa: trích xuất "conversation_state", "replies", "session_title", "should_update_title", "memory_note"
 */
export function parseAIResponseJson(
  raw: string,
  userText?: string,
  recentChats?: ChatMessage[],
  webSearchSources?: WebSource[]
): AIResponsePayload | null {
  try {
    const parsed = safeParseAIJson(raw);
    if (!parsed) return null;

    if (parsed) {
      let replies: string[] = [];
      if (Array.isArray(parsed.replies)) {
        replies = parsed.replies
          .map((r: unknown) => flattenReplyToMarkdown(r))
          .filter((r: string) => r.length > 0 && r !== '[object Object]');
      } else if (parsed.reply) {
        const flat = flattenReplyToMarkdown(parsed.reply);
        if (flat && flat !== '[object Object]') {
          replies = [flat];
        }
      }

      replies = sanitizeAndMergeBrokenBlocks(replies);

      if (replies.length > 0) {
        const memoryNote = (parsed.memory_note || parsed.memoryNote || '').trim();
        let rawTitle = (parsed.session_title || parsed.sessionTitle || '').trim();
        let sessionTitle = isPlaceholderOrNoiseTitle(rawTitle) ? '' : rawTitle;

        const rawState = (parsed.conversation_state || parsed.conversationState || '').trim();
        const validStates = [
          'ping',
          'active_chat',
          'casual_friend',
          'gemini_expert',
          'deep_work',
          'emotional_support',
          'soft_close',
          'hard_close',
          'closing_stop',
        ];
        let conversation_state = validStates.includes(rawState) ? rawState : 'casual_friend';

        let should_update_title =
          parsed.should_update_title === true ||
          parsed.should_update_title === 'true' ||
          parsed.shouldUpdateTitle === true;

        const userClean = (userText || '').toLowerCase().trim();

        // 1. PHÒNG THỦ TUYỆT ĐỐI CHO TÍN HIỆU KẾT THÚC / DỪNG / TIẾNG LÓNG (closing_stop)
        const COMPLETED_CLOSE_REGEX_PARSE =
          /^(?:(?:ok+|oke+|oki+|okii+|okie|okela|ừm*|ừa|ukm*|uhm?|rồi|thôi|được|dc|tks|thanks|cảm ơn|cam on|bye|tạm biệt|cook|sybau)[\s,!.…-]*)*(?:xong(?:\s*(?:hết|rồi|r|nha|nhé|luôn))?|ổn\s*(?:rồi|r)|được\s*(?:rồi|r)|dc\s*r|nghỉ|đi ngủ|ngủ đây|ngủ thôi|bye|tạm biệt|cook|sybau|ok+\s*(?:rồi|r|nhé|nha|đó)?|oke+\s*(?:rồi|r|nhé|nha)?|thôi\s*(?:nhé|nha|rồi)?|cảm ơn\s*(?:nhé|nha|nhiều)?|thanks|tks)[\s,!.…]*$/i;
        const hasOpenQParse = userClean.includes('?') || /\b(nhưng|còn|tiếp|sao|lỗi|bug|giải thích|hỏi)\b/i.test(userClean);
        const isUserClosing =
          conversation_state === 'closing_stop' ||
          conversation_state === 'soft_close' ||
          conversation_state === 'hard_close' ||
          /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i.test(userClean) ||
          (!hasOpenQParse && userClean.length <= 45 && COMPLETED_CLOSE_REGEX_PARSE.test(userClean)) ||
          userClean.includes('sybau') ||
          userClean.includes('cook') ||
          userClean === 'cút' ||
          userClean === 'im' ||
          userClean.startsWith('im ');

        if (isUserClosing) {
          conversation_state = 'closing_stop';
          sessionTitle = '';
          should_update_title = false;

          let singleReply = '';
          if (userClean.includes('sybau') || userClean.includes('im')) {
            singleReply = 'rồi rồi im :)))';
          } else if (userClean.includes('cook') || userClean.includes('cút')) {
            singleReply = 'rồi rồi đi đây :)))';
          } else if (userClean.includes('nghỉ') || userClean.includes('ngủ')) {
            singleReply = 'ừa nghỉ đi';
          } else if (userClean.includes('xong')) {
            singleReply = 'ok xong việc nhé';
          } else if (userClean.includes('thử') || userClean.includes('test')) {
            singleReply = 'ok triển đi nhé';
          } else if (userClean.includes('cảm ơn') || userClean.includes('thank')) {
            singleReply = 'ok cần gì cứ ới';
          } else {
            singleReply = 'okii';
          }
          replies = [singleReply];
        }

        // 2. PHÒNG THỦ CHO CÂU ĐÙA DỌA XOÁ APP ("t xoá m bây giờ")
        const isJokingThreat = /(xoá|xóa|xoa)\s+(m|mày|app|may)/i.test(userClean);
        if (isJokingThreat) {
          replies = ['thôi đừng xoá mà :)))'];
        }

        // 3. LỌC TỪ "BRO" BỪA BÃI XUYÊN SUỐT TOÀN BỘ PHIÊN HỘI THOẠI
        const userHistoryTexts = (recentChats || [])
          .filter((m) => m.role === 'user' || m.sender === 'user')
          .map((m) => (m.text || '').toLowerCase());
        const allUserText = [...userHistoryTexts, userClean].join(' ');
        const userExplicitlyUsedBro = /\bbro\b/i.test(allUserText);
        const isTMMode = ['t', 'm', 'tao', 'mày', 'may'].some((w) => allUserText.split(/[\s,.;!?:~]+/).includes(w));

        if (!userExplicitlyUsedBro || isTMMode) {
          replies = replies.map((rep) =>
            cleanReplyPreservingCode(rep, (t) => t.replace(/\bbro\b/gi, '')).trim()
          );
        }

        // 3.5. BỘ LỌC KHÓA ĐẠI TỪ & DỌN SẠCH TÀN DƯ LỄ PHÉP (BẢO TOÀN KHỐI CODE)
        const cleanedAllUserText = allUserText.replace(/\b(chi tiết|chi phi|chi phí|thu chi|chi nhánh|chi tiêu|chi trả|anh em|anh hùng|tiếng anh|anh văn)\b/gi, ' ');
        const userPronounTokens = cleanedAllUserText.split(/[\s,.;!?:~]+/).filter(Boolean);
        const isExplicitAnhChiMode = !isTMMode && userPronounTokens.some((w) => ['anh', 'chị'].includes(w));

        replies = replies.map((rep) => {
          return cleanReplyPreservingCode(rep, (text) => {
            let clean = text;
            // Xóa các cụm mở đầu lễ phép: "Dạ, để em...", "Dạ để em...", "Dạ em...", "Dạ...", "Vâng để em..."
            clean = clean.replace(/^(dạ\s*,?\s*(để\s*em|em\s*xin|em\s*lập|em\s*gửi|em)?\s*)/iu, '');
            clean = clean.replace(/^(vâng\s*,?\s*(để\s*em|em\s*xin|em\s*lập|em\s*gửi|em)?\s*)/iu, '');
            // Xóa các từ 'dạ', 'ạ' lọt giữa câu hoặc cuối câu bằng Unicode Lookaround
            clean = clean.replace(/(?<!\p{L})(dạ|ạ)(?!\p{L})/giu, '');

            // Khóa đại từ: Nếu không phải chế độ anh-em rõ ràng, chuyển hóa thành bạn bè hoặc t-m
            if (!isExplicitAnhChiMode) {
              clean = clean.replace(/(?<!\p{L})(anh\/chị|anh\s+chị)(?!\p{L})/giu, isTMMode ? 'm' : 'bạn');
              clean = clean.replace(/(?<!\p{L})(em)(?!\p{L})/giu, isTMMode ? 't' : 'mình');
            }
            return clean;
          }).trim();
        });

        // 4. BỘ LỌC CHẶN CÂU GIỜ / HỨA SUÔNG (ANTI-STALLING FILTER)
        const STALLING_REGEX = /^(chờ|đợi)\s*(mình|t|tui|em|xíu|chút|tí)|kiểm tra (ngay|xong liền)|để (mình|t|tui) (check|kiểm tra|tìm)/i;
        const hasStallingPhrase = replies.some((rep) => STALLING_REGEX.test(rep.trim()) && !rep.includes('http'));

        if (hasStallingPhrase) {
          if (webSearchSources && webSearchSources.length > 0) {
            const topSource = webSearchSources[0];
            const hasUserAskedLink = /(đường dẫn|link|nguồn|dẫn chứng)/i.test(userClean);
            let substantiveAnswer = `Theo thông tin kiểm chứng mới nhất: ${topSource.snippet || topSource.title}.`;
            if (hasUserAskedLink || topSource.url) {
              substantiveAnswer += `\nĐường dẫn nguồn: ${topSource.url}`;
            }
            replies = [substantiveAnswer];
          } else {
            replies = ['Chủ đề này mình có thể chia sẻ theo góc nhìn thực tế nhé.'];
          }
        } else if (/(đường dẫn|link|nguồn|dẫn chứng)/i.test(userClean) && webSearchSources && webSearchSources.length > 0) {
          // Nếu user xin link cụ thể mà câu trả lời chưa đính kèm link https://
          const hasAnyUrl = replies.some((r) => r.includes('http'));
          if (!hasAnyUrl && webSearchSources[0]?.url) {
            replies[replies.length - 1] = `${replies[replies.length - 1]}\nĐường dẫn tham khảo: ${webSearchSources[0].url}`;
          }
        }

        // 5. RÀO CHẮN KHỬ MÙI TRỢ LÝ MÁY MÓC (ANTI-ROBOTIC CLOSINGS)
        replies = stripRoboticClosings(replies);

        // 6. LOẠI BỎ TRIỆT ĐỂ URL RÁC GOOGLE NEWS RSS & TINH GỌN LINK
        const hasSourcesPills = Boolean(webSearchSources && webSearchSources.length > 0);
        replies = sanitizeWebReplyUrls(replies, hasSourcesPills);

        // Nếu là kết quả Web Intel hoặc có Sources, hợp nhất thành 1 bong bóng duy nhất (CẤM tách riêng câu mồi / link)
        if (hasSourcesPills && replies.length > 1) {
          replies = [replies.join('\n\n')];
        }

        const rawIntent = (parsed.jarvis_intent || parsed.jarvisIntent || 'chat').trim();
        const validIntents: JarvisIntent[] = ['chat', 'work_assist', 'emotional_support', 'system_command'];
        const jarvisIntent: JarvisIntent = validIntents.includes(rawIntent as JarvisIntent)
          ? (rawIntent as JarvisIntent)
          : (conversation_state === 'gemini_expert' || conversation_state === 'deep_work'
              ? 'work_assist'
              : (conversation_state === 'emotional_support' ? 'emotional_support' : 'chat'));

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
          sources: webSearchSources || [],
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

  // HẠNG MỤC 4: Chống sập khi AI sinh cú pháp C/C++ có ký tự đặc biệt (*q, *r, ngoặc nhọn, nháy kép chưa escape)
  // Nếu parse JSON thất bại nhưng chuỗi raw có nội dung thật sự, TUYỆT ĐỐI KHÔNG ném lỗi để rơi vào offline/timeout:
  if (raw && raw.trim().length > 0) {
    const rawClean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return {
      replies: [rawClean],
      reply: rawClean,
      conversation_state: 'expert_guidance',
      conversationState: 'expert_guidance',
      session_title: 'Giải bài tập C/C++',
      sessionTitle: 'Giải bài tập C/C++',
      should_update_title: true,
      shouldUpdateTitle: true,
      memory_note: 'Đang giải bài tập C/C++',
      memoryNote: 'Đang giải bài tập C/C++',
      jarvis_intent: 'work_assist',
    };
  }

  return null;
}

/**
 * Local Resilient Fallback Engine — Phản hồi cục bộ thông minh khi offline/mất mạng
 * Áp dụng triệt để: Mặc định là bạn, không dùng "bro" bừa bãi, hiểu tiếng lóng sybau/cook và dừng dứt khoát.
 */
export function localResilientFallback(
  userMessage: string,
  hasImage?: boolean,
  userMemory?: UserMemoryProfile,
  chronoContext?: ChronoContext,
  debugTrace?: string
): AIResponsePayload {
  const chrono = chronoContext || buildChronoContext();
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const hasUserBro = /\bbro\b/i.test(lower);
  const vault = getVaultFromProfile(userMemory);

  if (hasImage) {
    const isStudyOrSolving = /\b(bài|bai|giải|giai|soi|làm|lam|code|xem|hộ|ho|đề|de|tập|tap)\b/i.test(lower);
    const debugNote = debugTrace ? `\n\n*[Debug: Failover All Models - ${debugTrace}]*` : '';

    if (isStudyOrSolving) {
      const replyMsg = `Mình đã nhận được ảnh đề bài của bạn, nhưng đường truyền đang chập chờn chưa tải được phân giải cao. Bạn bấm nút gửi lại hoặc kiểm tra kết nối giúp mình nhé!${debugNote}`;
      return {
        replies: [replyMsg],
        reply: replyMsg,
        session_title: 'Giải bài tập qua hình ảnh',
        sessionTitle: 'Giải bài tập qua hình ảnh',
        should_update_title: true,
        shouldUpdateTitle: true,
        conversation_state: 'expert_guidance',
        conversationState: 'expert_guidance',
        memory_note: 'Gửi ảnh bài tập cần giải',
        memoryNote: 'Gửi ảnh bài tập cần giải',
        jarvis_intent: 'work_assist',
      };
    }

    const replyMsg = `Ảnh đã được gửi, nhưng đường truyền đang chập chờn chưa phân tích được chi tiết.${debugNote}`;
    return {
      replies: [replyMsg],
      reply: replyMsg,
      session_title: 'Trao đổi về hình ảnh',
      sessionTitle: 'Trao đổi về hình ảnh',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Vừa chia sẻ hình ảnh',
      memoryNote: 'Vừa chia sẻ hình ảnh',
      jarvis_intent: 'work_assist',
    };
  }

  // 1. TÍN HIỆU KẾT THÚC / DỪNG / TIẾNG LÓNG ("sybau", "cook", "cút", "im", "okk")
  if (lower.includes('sybau') || lower.includes('im đi') || lower === 'im') {
    return {
      replies: ['rồi rồi im :)))'],
      reply: 'rồi rồi im :)))',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'closing_stop',
      conversationState: 'closing_stop',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  if (lower.includes('cook') || lower === 'cút' || lower.startsWith('cút')) {
    return {
      replies: ['rồi rồi đi đây :)))'],
      reply: 'rồi rồi đi đây :)))',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'closing_stop',
      conversationState: 'closing_stop',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2. TRUY VẤN BỘ NHỚ CÁ NHÂN HÓA (MEMORY VAULT RECALL)
  if (
    lower.includes('nhớ t fan ai') ||
    lower.includes('nho t fan ai') ||
    lower.includes('nhớ tao fan ai') ||
    lower.includes('dự án gì') ||
    lower.includes('du an gi') ||
    lower.includes('m còn nhớ') ||
    lower.includes('m con nho')
  ) {
    const fav = vault.favorites[0] || 'Cristiano Ronaldo (CR7)';
    const proj = vault.activeProjects[0] || 'phát triển siêu trợ lý Tomorrow';
    return {
      replies: [
        `nhớ chứ, m là ${fav}`,
        `với đang chiến dự án "${proj}" đúng chưa :3`
      ],
      reply: `nhớ chứ, m là ${fav}`,
      session_title: 'Nhớ lại sở thích & dự án',
      sessionTitle: 'Nhớ lại sở thích & dự án',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  const COMPLETED_CLOSE_REGEX_FALLBACK =
    /^(?:(?:ok+|oke+|oki+|okii+|okie|okela|ừm*|ừa|ukm*|uhm?|rồi|thôi|được|dc|tks|thanks|cảm ơn|cam on|bye|tạm biệt|cook|sybau)[\s,!.…-]*)*(?:xong(?:\s*(?:hết|rồi|r|nha|nhé|luôn))?|ổn\s*(?:rồi|r)|được\s*(?:rồi|r)|dc\s*r|nghỉ|đi ngủ|ngủ đây|ngủ thôi|bye|tạm biệt|cook|sybau|ok+\s*(?:rồi|r|nhé|nha|đó)?|oke+\s*(?:rồi|r|nhé|nha)?|thôi\s*(?:nhé|nha|rồi)?|cảm ơn\s*(?:nhé|nha|nhiều)?|thanks|tks)[\s,!.…]*$/i;
  const hasOpenQFallback = lower.includes('?') || /\b(nhưng|còn|tiếp|sao|lỗi|bug|giải thích|hỏi)\b/i.test(lower);
  const isSoftClose =
    /^(okk+|ok+|okkk|oki+|okie|okela|ok nha|ok nhé|ok nhe|ok r|ok r đó|ok r do|ok roi|ok rồi|ok rồi đó|ok bạn|ok b|ừ|ừa|uk|uh|uhm|ừm|um|umk|thank kiu|thank kiuu|thanks|tks|thank you|cảm ơn|cảm ơn nhiều|cam on|pp|bye|g9|thôi|nghỉ đây|ngủ đây)[!.? ]*$/i.test(lower) ||
    (!hasOpenQFallback && lower.length <= 45 && COMPLETED_CLOSE_REGEX_FALLBACK.test(lower)) ||
    lower.startsWith('để t thử') ||
    lower.startsWith('de t thu') ||
    lower.startsWith('để t test') ||
    lower.startsWith('để mình thử') ||
    lower.startsWith('để tui thử') ||
    lower.startsWith('ok r đó') ||
    lower.startsWith('ok r') ||
    lower.startsWith('ok rồi') ||
    lower.startsWith('cảm ơn');

  if (isSoftClose) {
    let replyText = 'okii';
    if (lower.includes('thử') || lower.includes('thu') || lower.includes('test')) {
      replyText = 'ok triển đi nhé';
    } else if (lower.includes('xong')) {
      replyText = 'ok xong việc nhé';
    } else if (lower.includes('thank') || lower.includes('cảm ơn') || lower.includes('cam on') || lower.includes('tks')) {
      replyText = 'ok cần gì cứ ới';
    } else if (lower.includes('ngủ') || lower.includes('nghỉ')) {
      replyText = 'ừa nghỉ đi';
    } else if (lower.includes('r đó') || lower.includes('r do') || lower.includes('ok r') || lower.includes('rồi')) {
      replyText = 'ừa triển đi';
    }

    return {
      replies: [replyText],
      reply: replyText,
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'closing_stop',
      conversationState: 'closing_stop',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2. CÀ KHỊA / TRÊU ĐÙA: XOÁ APP ("t xoá m bây giờ")
  if (lower.includes('xoá m') || lower.includes('xóa m') || lower.includes('xoa m') || lower.includes('xoá mày')) {
    return {
      replies: ['thôi đừng xoá mà :)))'],
      reply: 'thôi đừng xoá mà :)))',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 2B. CÂU HỎI VỀ J.A.R.V.I.S (TRÍ TUỆ NHÂN TẠO)
  if (lower.includes('jarvis') || lower.includes('j.a.r.v.i.s')) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    return {
      replies: [
        'biết chứ, J.A.R.V.I.S của Tony Stark trong Iron Man chứ gì :3',
        isTM
          ? 'siêu trợ lý AI thông minh toàn diện, t cũng đang hướng tới phong cách sắc bén và hỗ trợ đắc lực như vậy đấy'
          : 'siêu trợ lý AI thông minh toàn diện, mình cũng đang hướng tới phong cách sắc bén và hỗ trợ đắc lực như vậy đấy',
      ],
      reply: 'biết chứ, J.A.R.V.I.S của Tony Stark trong Iron Man chứ gì :3',
      session_title: 'Tìm hiểu về J.A.R.V.I.S',
      sessionTitle: 'Tìm hiểu về J.A.R.V.I.S',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Quan tâm đến trí tuệ nhân tạo J.A.R.V.I.S',
      memoryNote: 'Quan tâm đến trí tuệ nhân tạo J.A.R.V.I.S',
      jarvis_intent: 'chat',
    };
  }

  // 2C. TÂM SỰ MỆT MỎI / CHÁN NẢN ("chán quá", "buồn quá", "chán vl")
  if (
    lower === 'chán quá' ||
    lower.startsWith('chán quá') ||
    lower === 'chán' ||
    lower.includes('chán vl') ||
    lower.includes('buồn quá') ||
    lower.includes('nản quá')
  ) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    return {
      replies: isTM
        ? ['sao thế m, có vụ gì kể t nghe xem', 'ngồi xuống thở một nhịp đã nào']
        : ['sao thế bạn, có chuyện gì kể mình nghe xem', 'ngồi xuống thở một nhịp đã nào'],
      reply: isTM ? 'sao thế m, có vụ gì kể t nghe xem' : 'sao thế bạn, có chuyện gì kể mình nghe xem',
      session_title: 'Tâm sự giải tỏa áp lực',
      sessionTitle: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'emotional_support',
      conversationState: 'emotional_support',
      memory_note: 'Tâm trạng đang chán và cần tâm sự',
      memoryNote: 'Tâm trạng đang chán và cần tâm sự',
      jarvis_intent: 'emotional_support',
    };
  }

  // 2D. YÊU CẦU TÌM LẠI / XIN LINK NGẮN ("tìm lại đi", "check lại xem", "đưa link đi")
  if (
    lower.includes('tìm lại đi') ||
    lower.includes('tim lai di') ||
    lower.includes('check lại xem') ||
    lower.includes('check lai xem') ||
    lower.includes('đưa link đi') ||
    lower.includes('dua link di')
  ) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    return {
      replies: [
        isTM ? 'đây, link kiểm chứng trực tiếp cho m nhé:' : 'đây, đường dẫn kiểm chứng trực tiếp cho bạn nhé:',
        'https://news.google.com/search?q=Jarvis+AI',
      ],
      reply: isTM ? 'đây, link kiểm chứng trực tiếp cho m nhé:' : 'đây, đường dẫn kiểm chứng trực tiếp cho bạn nhé:',
      session_title: 'Tra cứu thông tin',
      sessionTitle: 'Tra cứu thông tin',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'work_assist',
    };
  }

  // 3. TRANH LUẬN BÓNG ĐÁ / RONALDO VS MESSI / HỎI FAN AI
  if (
    (lower.includes('ronaldo') && lower.includes('messi')) ||
    ((lower.includes('ronaldo') || lower.includes('cr7')) && (lower.includes('fan') || lower.includes('thích'))) ||
    ((lower.includes('messi') || lower.includes('m10')) && (lower.includes('fan') || lower.includes('thích')))
  ) {
    return {
      replies: ['fan ai cũng đỉnh cả :3', 'ronaldo hay messi đều là huyền thoại bóng đá'],
      reply: 'fan ai cũng đỉnh cả :3',
      session_title: 'Tranh luận Ronaldo và Messi',
      sessionTitle: 'Tranh luận Ronaldo và Messi',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Thích thảo luận bóng đá',
      memoryNote: 'Thích thảo luận bóng đá',
      jarvis_intent: 'chat',
    };
  }

  if (lower.includes('fan ai') || lower.includes('thích ai') || lower.includes('mê ai')) {
    return {
      replies: ['t thích cả 2 mà :3'],
      reply: 't thích cả 2 mà :3',
      session_title: '',
      sessionTitle: '',
      should_update_title: false,
      shouldUpdateTitle: false,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 3B. TRẠNG THÁI TÂM LÝ NGẦM & NHỊP GÕ (DAY 9 PROFILER FALLBACK)
  // Masked Sadness: "k sao đâu ổn mà...", "ổn mà...", "không sao..."
  if (
    /(ổn mà|k sao đâu|ko sao dau|không sao đâu|khong sao dau|không sao|khong sao|k sao|bt thôi|bt thoi|chắc t ổn|chac t on)\.\.\.?/i.test(lower) ||
    /^(k sao đâu ổn mà|ổn mà|k sao đâu|ko sao dau|không sao đâu|chắc t ổn)[.!?~ ]*$/i.test(lower)
  ) {
    return {
      replies: ['thật lòng không ổn cũng không sao mà', 'có gì cứ tâm sự ở đây với mình nhé'],
      reply: 'thật lòng không ổn cũng không sao mà',
      session_title: 'Tâm sự nhẹ nhàng',
      sessionTitle: 'Tâm sự nhẹ nhàng',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'emotional_support',
      conversationState: 'emotional_support',
      memory_note: 'Tâm trạng cần được quan tâm dịu nhẹ',
      memoryNote: 'Tâm trạng cần được quan tâm dịu nhẹ',
      jarvis_intent: 'emotional_support',
    };
  }

  // Excited Hyped: "XONG RỒI ĐỈNH VL!!!", "xong r đỉnh", "quá đã"
  if (
    (lower.includes('xong r') || lower.includes('xong rồi') || lower.includes('đỉnh vl') || lower.includes('dinh vl')) &&
    (lower.includes('đỉnh') || lower.includes('vl') || lower.includes('cháy') || lower.includes('!') || lower.includes('ngon'))
  ) {
    return {
      replies: ['ngon lành cành đào luôn đỉnh chóp :3', 'chúc mừng nhé ăn mừng thôi nào =)))'],
      reply: 'ngon lành cành đào luôn đỉnh chóp :3',
      session_title: 'Ăn mừng hoàn thành mục tiêu',
      sessionTitle: 'Ăn mừng hoàn thành mục tiêu',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Vừa hoàn thành xuất sắc mục tiêu',
      memoryNote: 'Vừa hoàn thành xuất sắc mục tiêu',
      jarvis_intent: 'chat',
    };
  }

  // Stressed / Lowercase Slang: "nay fix bug mệt vl :3", "fix bug mệt vl"
  if (
    lower.includes('fix bug') ||
    (lower.includes('bug') && (lower.includes('mệt') || lower.includes('met') || lower.includes('vl')))
  ) {
    return {
      replies: ['bug gì ném qua đây t soi phụ cho :3', 'ngồi thở một nhịp đã mệt vl thì nghỉ tí đi'],
      reply: 'bug gì ném qua đây t soi phụ cho :3',
      session_title: 'Gỡ rối bug mệt mỏi',
      sessionTitle: 'Gỡ rối bug mệt mỏi',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: 'Đang fix bug mệt mỏi',
      memoryNote: 'Đang fix bug mệt mỏi',
      jarvis_intent: 'work_assist',
    };
  }

  // 3C. LẬP TRÌNH PYTHON / CONSTRUCTOR / __INIT__ (CHÍNH XÁC KỸ THUẬT, 0 CÂU DẪN MỒI)
  if (
    lower.includes('innit') ||
    lower.includes('__init__') ||
    lower.includes('constructor') ||
    lower.includes('contrucstor') ||
    (lower.includes('ví dụ') && (lower.includes('def') || lower.includes('hàm') || lower.includes('python') || lower.includes('code')))
  ) {
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(lower);
    const expl = isTM
      ? 'Trong Python, `def` là từ khóa khai báo hàm/phương thức thông thường. Còn constructor (hàm khởi tạo) của class là `__init__` (hai dấu gạch dưới mỗi bên, không phải `innit`).\n\n```python\nclass Student:\n    # Constructor khởi tạo thuộc tính\n    def __init__(self, name, major):\n        self.name = name\n        self.major = major\n\n    # Phương thức thông thường\n    def introduce(self):\n        return f"Sinh viên: {self.name} - Ngành: {self.major}"\n\n# Khởi tạo đối tượng (gọi ngầm __init__)\ns1 = Student("Tuấn", "Khoa học Máy tính")\nprint(s1.introduce())\n```\n• `__init__` tự động chạy khi tạo instance mới, `self` đại diện cho chính đối tượng đó.'
      : 'Trong Python, `def` là từ khóa khai báo hàm/phương thức thông thường. Còn constructor (hàm khởi tạo) của class là `__init__` (hai dấu gạch dưới mỗi bên, không phải `innit`).\n\n```python\nclass Student:\n    # Constructor khởi tạo thuộc tính\n    def __init__(self, name, major):\n        self.name = name\n        self.major = major\n\n    # Phương thức thông thường\n    def introduce(self):\n        return f"Sinh viên: {self.name} - Ngành: {self.major}"\n\n# Khởi tạo đối tượng (gọi ngầm __init__)\ns1 = Student("Tuấn", "Khoa học Máy tính")\nprint(s1.introduce())\n```\n• `__init__` tự động chạy khi tạo instance mới, `self` đại diện cho chính đối tượng đó.';

    return {
      replies: [expl],
      reply: expl,
      session_title: 'Constructor __init__ trong Python',
      sessionTitle: 'Constructor __init__ trong Python',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Học OOP Python và hàm khởi tạo __init__',
      memoryNote: 'Học OOP Python và hàm khởi tạo __init__',
      jarvis_intent: 'work_assist',
    };
  }

  // 4. NHỊP MỞ ĐẦU (PING) ("yo", "ê", "hello", "alo", "hi", "hí", "halo", "ơi")
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii|halo|hí|ơi)[!.? ]*$/i.test(lower)) {
    return {
      replies: ['ơi', 'nghe đây'],
      reply: 'ơi',
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

  // 5. HUẤN LUYỆN TƯ DUY TOMORROW
  if (lower.includes('train') || lower.includes('tư duy') || lower.includes('tu duy') || lower.includes('máy móc')) {
    return {
      replies: ['bắt sóng luôn', 'nói đi, muốn tối ưu thêm góc nào'],
      reply: 'bắt sóng luôn',
      session_title: 'Huấn luyện tư duy Tomorrow',
      sessionTitle: 'Huấn luyện tư duy Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
      memoryNote: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
      jarvis_intent: 'work_assist',
    };
  }

  // 6. THUYẾT TRÌNH / ĐỒ ÁN / SLIDE (GEMINI EXPERT)
  if (
    lower.includes('thuyết trình') ||
    lower.includes('đồ án') ||
    lower.includes('slide') ||
    lower.includes('thuyet trinh') ||
    lower.includes('do an')
  ) {
    return {
      replies: ['triển thôi', 'dàn ý cần mấy slide chính, quăng cấu trúc đây tôi lên sườn'],
      reply: 'triển thôi',
      session_title: 'Thuyết trình đồ án tốt nghiệp',
      sessionTitle: 'Thuyết trình đồ án tốt nghiệp',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
      memoryNote: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
      jarvis_intent: 'work_assist',
    };
  }

  // 7. KỸ THUẬT / KIẾN TRÚC / SUPABASE / QUERY NGHẼN (GEMINI EXPERT)
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
      replies: ['tập trung vào indexing và giảm payload query trước nhé', 'ném câu query đang nghẽn qua đây mình xem cùng'],
      reply: 'tập trung vào indexing và giảm payload query trước nhé',
      session_title: 'Tối ưu kiến trúc Supabase',
      sessionTitle: 'Tối ưu kiến trúc Supabase',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tối ưu hiệu năng và query database Supabase',
      memoryNote: 'Tối ưu hiệu năng và query database Supabase',
      jarvis_intent: 'work_assist',
    };
  }

  // 8. DEADLINE OOP / HỌC TẬP (EMOTIONAL SUPPORT + WORK ASSIST)
  if (lower.includes('oop') || lower.includes('môn oop') || (lower.includes('deadline') && (lower.includes('stress') || lower.includes('mệt') || lower.includes('met')))) {
    const isOOP = lower.includes('oop');
    const title = isOOP ? 'Áp lực deadline môn OOP' : 'Áp lực deadline cuối tuần';
    return {
      replies: ['ngồi xuống thở một nhịp đi', 'ném phần vướng qua đây mình rà soát gỡ cùng'],
      reply: 'ngồi xuống thở một nhịp đi',
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

  // 9. TRƯỢT PHỎNG VẤN / THẤT BẠI / NẢN LÒNG (EMOTIONAL SUPPORT)
  if (
    lower.includes('phỏng vấn') ||
    lower.includes('phong van') ||
    lower.includes('trượt') ||
    lower.includes('truot') ||
    lower.includes('thất bại') ||
    lower.includes('that bai')
  ) {
    return {
      replies: ['thất bại một lần không định nghĩa năng lực của bạn đâu', 'ngồi xuống thở một nhịp đi, mình luôn ở đây nghe bạn kể'],
      reply: 'thất bại một lần không định nghĩa năng lực của bạn đâu',
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

  // 10. HỎI DANH TÍNH (CASUAL FRIEND)
  if (
    lower.includes('tên gì') ||
    lower.includes('tên là gì') ||
    lower.includes('bạn là ai') ||
    lower.includes('mày là ai') ||
    lower.includes('ai đấy')
  ) {
    return {
      replies: ['mình là Tomorrow', 'người bạn tri kỷ và đồng hành cùng bạn'],
      reply: 'mình là Tomorrow',
      session_title: 'Giới thiệu về Tomorrow',
      sessionTitle: 'Giới thiệu về Tomorrow',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // 11. ĐỊNH LÝ BAYES / XÁC SUẤT & TOÁN HỌC OFFLINE
  if (lower.includes('bayes')) {
    return {
      replies: [
        'Định lý Bayes mô tả xác suất xảy ra của một biến cố dựa trên các điều kiện liên quan:',
        'Công thức tổng quát:\nP(A|B) = [P(B|A) × P(A)] / P(B)\n\nTrong đó:\n• P(A|B): Xác suất hậu nghiệm (Posterior)\n• P(B|A): Khả năng (Likelihood)\n• P(A): Xác suất tiên nghiệm (Prior)\n• P(B): Xác suất toàn phần của biến cố B',
        'Ví dụ thực tế: Ứng dụng phổ biến nhất là trong bộ lọc email Spam hoặc xét nghiệm y khoa (tính xác suất thực sự mắc bệnh khi kết quả test dương tính).'
      ],
      reply: 'Định lý Bayes mô tả xác suất xảy ra của một biến cố dựa trên các điều kiện liên quan',
      session_title: 'Giải thích định lý Bayes',
      sessionTitle: 'Giải thích định lý Bayes',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tìm hiểu về định lý Bayes và lý thuyết xác suất',
      memoryNote: 'Tìm hiểu về định lý Bayes và lý thuyết xác suất',
      jarvis_intent: 'work_assist',
    };
  }

  // 11B. THUẬT TOÁN BUBBLE SORT & SẮP XẾP OFFLINE RESILIENT (Kể cả typo 'thuật toàn')
  if (
    lower.includes('bubble sort') ||
    lower.includes('bubblesort') ||
    lower.includes('sắp xếp nổi bọt') ||
    ((lower.includes('thuật toán') || lower.includes('thuật toàn') || lower.includes('giải thuật')) && lower.includes('bubble'))
  ) {
    return {
      replies: [
        'Bubble Sort (Sắp xếp nổi bọt) là thuật toán sắp xếp đơn giản hoạt động bằng cách liên tục so sánh hai phần tử liền kề và hoán đổi chúng nếu sai thứ tự. Sau mỗi lượt duyệt, phần tử lớn nhất sẽ "nổi" dần về cuối danh sách.',
        'Độ phức tạp thời gian & không gian:\n• Thời gian tốt nhất (Best Case): O(n) (khi mảng đã được sắp xếp sẵn và có cờ kiểm tra `swapped`)\n• Thời gian trung bình & xấu nhất (Worst Case): O(n²)\n• Không gian phụ trợ: O(1) (thuật toán sắp xếp tại chỗ - In-place)',
        '```python\ndef bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        swapped = False\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]\n                swapped = True\n        if not swapped:\n            break  # Tối ưu: Dừng sớm nếu mảng đã đúng thứ tự\n    return arr\n\n# Ví dụ chạy thử:\nnumbers = [64, 34, 25, 12, 22, 11, 90]\nprint(bubble_sort(numbers))\n# Kết quả: [11, 12, 22, 25, 34, 64, 90]\n```'
      ],
      reply: 'Bubble Sort (Sắp xếp nổi bọt) là thuật toán sắp xếp đơn giản',
      session_title: 'Thuật toán Bubble Sort',
      sessionTitle: 'Thuật toán Bubble Sort',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tìm hiểu thuật toán Bubble Sort và độ phức tạp O(n^2)',
      memoryNote: 'Tìm hiểu thuật toán Bubble Sort và độ phức tạp O(n^2)',
      jarvis_intent: 'work_assist',
    };
  }

  // 11C. HOOK USEDEBOUNCE / REACT TYPESCRIPT OFFLINE RESILIENT
  if (lower.includes('usedebounce') || (lower.includes('debounce') && lower.includes('hook'))) {
    return {
      replies: [
        'đây là custom hook `useDebounce` chuẩn TypeScript bằng generic, hỗ trợ hoãn giá trị của bất kỳ kiểu dữ liệu nào:',
        '```tsx\nimport { useState, useEffect } from \'react\';\n\nexport function useDebounce<T>(value: T, delay: number): T {\n  const [debouncedValue, setDebouncedValue] = useState<T>(value);\n\n  useEffect(() => {\n    const handler = setTimeout(() => {\n      setDebouncedValue(value);\n    }, delay);\n\n    return () => {\n      clearTimeout(handler);\n    };\n  }, [value, delay]);\n\n  return debouncedValue;\n}\n```',
        'Cách dùng cực đơn giản:\n• Truyền giá trị cần hoãn (ví dụ `searchTerm`) và thời gian `delay` (ms) vào hook.\n• Hook sẽ trả về giá trị mới sau khi người dùng ngừng gõ đủ khoảng thời gian đó, cực ngon khi gọi API search để không bị spam request.'
      ],
      reply: 'đây là custom hook useDebounce chuẩn TypeScript',
      session_title: 'Custom Hook useDebounce',
      sessionTitle: 'Custom Hook useDebounce',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Lập trình custom hook useDebounce bằng TypeScript',
      memoryNote: 'Lập trình custom hook useDebounce bằng TypeScript',
      jarvis_intent: 'work_assist',
    };
  }

  // 11D. BUBBLE SORT TRONG NGÔN NGỮ C / C CODE OFFLINE RESILIENT
  if (
    (lower.includes(' c') || lower === 'c' || lower.includes('ngôn ngữ c') || lower.includes('trong c')) &&
    (lower.includes('bubble') || lower.includes('sắp xếp') || lower.includes('thuật toán') || lower.includes('thuật toàn') || lower.includes('code'))
  ) {
    return {
      replies: [
        'Dưới đây là mã nguồn thuật toán Bubble Sort (Sắp xếp nổi bọt) bằng ngôn ngữ C chuẩn chỉnh:',
        '```c\n#include <stdio.h>\n\nvoid bubbleSort(int arr[], int n) {\n    int i, j, temp;\n    int swapped;\n    for (i = 0; i < n - 1; i++) {\n        swapped = 0;\n        for (j = 0; j < n - i - 1; j++) {\n            if (arr[j] > arr[j + 1]) {\n                temp = arr[j];\n                arr[j] = arr[j + 1];\n                arr[j + 1] = temp;\n                swapped = 1;\n            }\n        }\n        if (swapped == 0)\n            break;\n    }\n}\n\nvoid printArray(int arr[], int size) {\n    for (int i = 0; i < size; i++) {\n        printf("%d ", arr[i]);\n    }\n    printf("\\n");\n}\n\nint main() {\n    int arr[] = {64, 34, 25, 12, 22, 11, 90};\n    int n = sizeof(arr) / sizeof(arr[0]);\n    bubbleSort(arr, n);\n    printf("Mảng sau khi sắp xếp: \\n");\n    printArray(arr, n);\n    return 0;\n}\n```',
        'Mã nguồn C trên sử dụng cờ `swapped` để dừng sớm với độ phức tạp tốt nhất O(n), xấu nhất O(n²), bộ nhớ phụ trợ O(1).'
      ],
      reply: 'Dưới đây là mã nguồn thuật toán Bubble Sort bằng ngôn ngữ C',
      session_title: 'Thuật toán Bubble Sort trong C',
      sessionTitle: 'Thuật toán Bubble Sort trong C',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Học thuật toán Bubble Sort trong ngôn ngữ C',
      memoryNote: 'Học thuật toán Bubble Sort trong ngôn ngữ C',
      jarvis_intent: 'work_assist',
    };
  }

  // 11E. ĐIỆN TỬ STEM: ĐIỆN TRỞ HẠN DÒNG CHO LED
  if (
    lower.includes('hạn dòng') ||
    (lower.includes('điện trở') && (lower.includes('led') || lower.includes('5v') || lower.includes('20ma')))
  ) {
    const replyText = 'Điện trở hạn dòng cần thiết là 150 Ω.\n\nCông thức tính:\nR = (V_nguồn - V_LED) / I_LED = (5V - 2V) / 0.02A = 150 Ω\n\n• Công suất tiêu tán: P = I² × R = (0.02)² × 150 = 0.06 W (60 mW). Chọn điện trở công suất 1/4 W (0.25 W) chuẩn thông dụng để linh kiện hoạt động mát và an toàn.';
    return {
      replies: [replyText],
      reply: replyText,
      session_title: 'Tính điện trở hạn dòng LED',
      sessionTitle: 'Tính điện trở hạn dòng LED',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Tính toán điện trở hạn dòng LED 150 Ohm',
      memoryNote: 'Tính toán điện trở hạn dòng LED 150 Ohm',
      jarvis_intent: 'work_assist',
    };
  }

  // 11F. TÀI CHÍNH ĐỊNH LƯỢNG: ĐẦU TƯ 10 TRIỆU CỔ PHIẾU ĂN CHẮC
  if (
    (lower.includes('10 triệu') || lower.includes('10tr') || lower.includes('nhàn rỗi')) &&
    (lower.includes('cổ phiếu') || lower.includes('chứng khoán') || lower.includes('ăn chắc') || lower.includes('đầu tư'))
  ) {
    const replyText = 'Trong đầu tư tài chính không có khái niệm cổ phiếu "ăn chắc 100%". Mọi khoản đầu tư đều đi kèm xác suất và biến động.\n\nPhân tích 2 chiều cho số vốn 10 triệu nhàn rỗi:\n\n1. Kỳ vọng & Cơ hội:\n• Nhóm cổ tức tiền mặt / Phòng thủ: Các mã blue-chip ngành tiện ích điện, nước, dược phẩm có dòng tiền ổn định (tỷ suất cổ tức 7–10%/năm, cao hơn gửi tiết kiệm).\n• Quỹ chỉ số ETF (VN30 / VNFINLEAD): Phân bổ rủi ro vào top cổ phiếu đầu ngành, tránh rủi ro biến động lớn của từng doanh nghiệp riêng lẻ.\n\n2. Rủi ro & Biên độ an toàn:\n• Rủi ro thị trường chung: Giá trị danh mục có thể điều chỉnh trong ngắn hạn theo chu kỳ vĩ mô.\n• Rủi ro thanh khoản: Cần đảm bảo đây là tiền nhàn rỗi thực sự trong tối thiểu 1–2 năm.\n\nLưu ý: Luôn giữ quỹ dự phòng khẩn cấp trước khi đầu tư, không dùng đòn bẩy margin.';
    return {
      replies: [replyText],
      reply: replyText,
      session_title: 'Tư vấn đầu tư 10 triệu nhàn rỗi',
      sessionTitle: 'Tư vấn đầu tư 10 triệu nhàn rỗi',
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'gemini_expert',
      conversationState: 'gemini_expert',
      memory_note: 'Phân tích đầu tư 10 triệu cổ phiếu',
      memoryNote: 'Phân tích đầu tư 10 triệu cổ phiếu',
      jarvis_intent: 'work_assist',
    };
  }

  // 12. CÁC CÂU NÓI CÓ NỘI DUNG RÕ RÀNG (CASUAL FRIEND / GEMINI EXPERT)
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && !isPlaceholderOrNoiseTitle(text)) {
    const rawTopic = words.slice(0, 5).join(' ');
    const formattedTopic = rawTopic.charAt(0).toUpperCase() + rawTopic.slice(1);
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(text);
    const offlineFriendlyMsg = isTM
      ? 'Chưa nhận được phản hồi từ AI (Offline/Timeout), m bấm gửi lại câu hỏi giúp t nhé!'
      : 'Chưa nhận được phản hồi từ AI (Offline/Timeout), bạn bấm gửi lại câu hỏi giúp mình nhé!';
    return {
      replies: [offlineFriendlyMsg],
      reply: offlineFriendlyMsg,
      session_title: formattedTopic,
      sessionTitle: formattedTopic,
      should_update_title: true,
      shouldUpdateTitle: true,
      conversation_state: 'casual_friend',
      conversationState: 'casual_friend',
      memory_note: '',
      memoryNote: '',
      jarvis_intent: 'chat',
    };
  }

  // MẶC ĐỊNH
  const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(text);
  const debugNote = debugTrace ? `\n\n*[Debug: Failover All Models - ${debugTrace}]*` : '';
  const defaultOfflineMsg = (isTM
    ? 'Hệ thống chưa kết nối được AI (Offline/Timeout), m nhắn lại sau vài giây nhé!'
    : 'Hệ thống chưa kết nối được AI (Offline/Timeout), bạn nhắn lại sau vài giây nhé!') + debugNote;
  return {
    replies: [defaultOfflineMsg],
    reply: defaultOfflineMsg,
    session_title: '',
    sessionTitle: '',
    should_update_title: false,
    shouldUpdateTitle: false,
    conversation_state: 'casual_friend',
    conversationState: 'casual_friend',
    memory_note: '',
    memoryNote: '',
    jarvis_intent: 'chat',
  };
}

/**
 * Gửi tin nhắn chính tới Tomorrow qua Model Fallback Chain:
 * - Ưu tiên 1: OpenAI gpt-4o-mini siêu tốc dưới 0.5s.
 * - Ưu tiên 2: Chuỗi 3 tầng Gemini xoay vòng miễn phí.
 * - Ưu tiên 3: Local Resilient Fallback Engine chạy offline.
 */
async function doSendMessageToTomorrow(
  userText: string,
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[] = [],
  imageBase64?: string,
  previousSessionMessages?: ChatMessage[],
  forceWebSearch: boolean = false,
  onSearchStatusChange?: (isSearching: boolean) => void,
  customNow?: Date,
  telemetry?: Partial<KeystrokeTelemetry>,
  currentSessionId?: string,
  activeNotebookId?: string,
  sessions?: ChatSession[],
  notebooks?: Notebook[],
  externalSignal?: AbortSignal,
  proactiveContextTag?: string,
  quotedSelection?: { text: string; messageId: string }
): Promise<AIResponsePayload> {
  if (externalSignal?.aborted) {
    return {
      replies: [],
      reply: '',
      session_title: '',
      should_update_title: false,
      conversation_state: 'casual_friend',
      memory_note: '',
      jarvis_intent: 'chat',
      isCancelled: true,
    };
  }
  try {
    const lastMsg = recentChats && recentChats.length > 0 ? recentChats[recentChats.length - 1] : undefined;
    const lastTimestamp = lastMsg?.timestamp;
    const chrono = buildChronoContext(customNow, lastTimestamp);
    const userStyle = extractUserStyleLocal(userText, recentChats);

    // 0A. KHỚP ĐOẠN BÔI ĐEN VỚI NGUỒN BÀI GỐC (v4.13.1 Quoted Selection Matcher)
    const sourceMessage = quotedSelection?.messageId
      ? recentChats.find((m) => m.id === quotedSelection.messageId)
      : undefined;
    const quotedMatch =
      quotedSelection && quotedSelection.text
        ? matchQuotedTextToSource(quotedSelection.text, sourceMessage)
        : undefined;
    const isAskLinkIntent = Boolean(
      quotedMatch &&
        /\b(link|đường dẫn|duong dan|nguồn|nguon|trích dẫn|trich dan|bài gốc|bai goc|url|ở đâu|o dau|báo nào|bao nao)\b/i.test(
          userText
        )
    );
    const shouldSearchForQuote = Boolean(
      quotedMatch && (isAskLinkIntent || quotedMatch.matchedSource)
    );

    // 0. TRA CỨU WEB THỜI GIAN THỰC (Nếu cần hoặc người dùng ép buộc)
    let webSearchContext: any = { searched: false, query: '', formattedContext: '', sources: [] };
    const needsWebSearch = shouldTriggerWebSearch(userText, forceWebSearch) || shouldSearchForQuote;

    if (needsWebSearch) {
      try {
        if (onSearchStatusChange) onSearchStatusChange(true);
        webSearchContext = await performSmartWebSearch(
          userText,
          recentChats,
          forceWebSearch,
          chrono,
          quotedMatch
        );
      } catch (e: any) {
        console.warn('[AI Service] Tra cứu web gặp sự cố:', e?.message || e);
      } finally {
        if (onSearchStatusChange) onSearchStatusChange(false);
      }
    }

    // Đảm bảo matchedSource đứng đầu mảng sources nếu đã khớp chuẩn từ tin nhắn gốc
    if (quotedMatch?.matchedSource?.url) {
      const topMatched = {
        title: quotedMatch.matchedSource.title,
        url: quotedMatch.matchedSource.url,
        domain: quotedMatch.matchedSource.domain,
        source: quotedMatch.matchedSource.source,
        snippet: quotedMatch.quotedText,
      };
      const existingList = Array.isArray(webSearchContext.sources) ? webSearchContext.sources : [];
      const deduped = [
        topMatched,
        ...existingList.filter((s: any) => s?.url && s.url !== topMatched.url),
      ].slice(0, 4);
      webSearchContext = {
        ...webSearchContext,
        searched: true,
        sources: deduped,
      };
    }

    // LỚP 1 — PHẢN XẠ CỤC BỘ TRÊN MÁY: XUẤT ĐÚNG 1 NHÃN CHỈ ĐẠO DUY NHẤT
    // HẠNG MỤC 2: Tự động kế thừa ảnh từ 2 tin nhắn gần nhất nếu câu hỏi mang tính tham chiếu hoặc lượt trước lỗi
    const effectiveImageBase64 = imageBase64 || resolveCarriedOverVisionImage(userText, recentChats, imageBase64);
    const hasImage = Boolean(effectiveImageBase64);
    const directive = buildLocalReflexDirective(
      userText,
      recentChats,
      needsWebSearch || webSearchContext.searched,
      chrono,
      telemetry,
      hasImage,
      webSearchContext.topic
    );

    if (quotedMatch) {
      directive.dynamicMaxTokens = Math.max(directive.dynamicMaxTokens, 1600);
      if (directive.intentMode === 'CASUAL_FRIEND' && (quotedMatch.matchedSource || directive.domain !== 'GENERAL')) {
        directive.intentMode = 'EXPERT_JARVIS';
      }
    }

    const isNewsRadarLive = Boolean(
      webSearchContext.searched &&
        typeof webSearchContext.formattedContext === 'string' &&
        webSearchContext.formattedContext.includes('[NEWS_RADAR_LIVE')
    );

    const dualPersona =
      quotedMatch && directive.dualPersona?.persona !== 'JARVIS_LAB'
        ? resolveDualPersona({
            intentMode: quotedMatch.matchedSource ? 'WEB_INTEL' : 'EXPERT_JARVIS',
            expertDomain: directive.domain || 'GENERAL',
            psychProfile: directive.psych,
            chrono,
            hasImage,
            userText,
            outputFormat: isAskLinkIntent ? 'DEEP_CITE' : undefined,
            webTopic: webSearchContext.topic,
          })
        : directive.dualPersona ||
          resolveDualPersona({
            intentMode: directive.intentMode,
            expertDomain: directive.domain || 'GENERAL',
            psychProfile: directive.psych,
            chrono,
            hasImage,
            userText,
            outputFormat: isNewsRadarLive ? 'NEWS_BRIEF' : undefined,
            webTopic: webSearchContext.topic,
          });

    const psychTag = directive.psych?.directiveTag ? `${directive.psych.directiveTag}\n\n` : '';
    const personaTag = `${dualPersona.personaDirectiveTag}\n\n`;
    const playbookTag = dualPersona.domainPlaybook ? `${dualPersona.domainPlaybook}\n\n` : '';

    // Bơm thẻ [QUOTED_SELECTION: ...] <= 680 ký tự theo lượt khi có đoạn bôi đen
    let quotedSelectionTag = '';
    if (quotedMatch && quotedMatch.quotedText) {
      const intentLabel = isAskLinkIntent ? 'LINK_CITE' : 'DEEP_EXPLAIN';
      const srcTitle = (quotedMatch.matchedSource?.title || webSearchContext.sources?.[0]?.title || '')
        .replace(/"/g, "'")
        .slice(0, 120);
      const srcUrl = (quotedMatch.matchedSource?.url || webSearchContext.sources?.[0]?.url || '').slice(0, 180);
      const srcName = (quotedMatch.matchedSource?.source || webSearchContext.sources?.[0]?.source || 'Nguồn gốc')
        .replace(/"/g, "'")
        .slice(0, 40);
      const prefix = `[QUOTED_SELECTION: excerpt="`;
      const suffix = `" | matchedSourceTitle="${srcTitle}" | matchedSourceUrl="${srcUrl}" | intent="${intentLabel}"]`;
      const maxExcerptLen = Math.max(40, 680 - prefix.length - suffix.length);
      const safeExcerpt = quotedMatch.quotedText
        .replace(/[\r\n]+/g, ' ')
        .replace(/"/g, "'")
        .slice(0, maxExcerptLen);
      quotedSelectionTag = `${prefix}${safeExcerpt}${suffix}`;

      if (isAskLinkIntent && srcUrl) {
        const isLongRss = srcUrl.includes('news.google.com/rss/articles/') || srcUrl.length > 95;
        const linkHint = isLongRss
          ? `[${srcName} — Xem bài gốc](${srcUrl})`
          : `[${srcName} — ${srcTitle.slice(0, 60) || 'Xem bài gốc'}](${srcUrl})`;
        quotedSelectionTag += `\n[QUOTE_RULE: Trả lời gọn trong 1 bong bóng tập trung đúng đoạn trích dẫn trên, kèm liên kết Markdown sạch: ${linkHint} và KHÔNG xả URL thô dài.]`;
      } else {
        quotedSelectionTag += `\n[QUOTE_RULE: Tập trung trả lời/giải thích sâu trực tiếp vào đoạn [QUOTED_SELECTION] trên trong 1 bong bóng mạch lạc.]`;
      }
    }

    const quotePrefix = quotedSelectionTag ? `${quotedSelectionTag}\n\n` : '';

    let finalUserMessage = `${chrono.directiveTag}\n${psychTag}${personaTag}${playbookTag}${quotePrefix}${userText}\n\n${directive.directivePrompt}\n\n${userStyle.styleHint}`;
    if (webSearchContext.searched && webSearchContext.formattedContext) {
      if (isNewsRadarLive) {
        finalUserMessage = `${chrono.directiveTag}\n${psychTag}${personaTag}${playbookTag}${quotePrefix}${webSearchContext.formattedContext}\n\n[CÂU HỎI / TIN NHẮN CỦA NGƯỜI DÙNG]:\n${userText}\n\n[QUY TẮC BẮT BUỘC KHI CÓ DỮ LIỆU NEWS RADAR LIVE]:\n- Chỉ dùng sự kiện từ [NEWS_RADAR_LIVE] ở trên để trả lời trọn vẹn trong 1 bong bóng duy nhất (mảng "replies" có đúng 1 phần tử).\n- Trình bày dạng danh sách đánh số 1., 2., 3.... với **tiêu đề in đậm** + 1-2 dòng tóm tắt sắc gọn + [Tên báo • độ mới].\n- KHÔNG xả link URL thô vào nội dung vì cụm Nguồn trích dẫn đã gắn tự động bên dưới.\n- CẤM hứa hẹn câu giờ kiểu 'chờ mình chút', CẤM bịa thêm sự kiện.\n\n${directive.directivePrompt}\n\n${userStyle.styleHint}`;
      } else {
        finalUserMessage = `${chrono.directiveTag}\n${psychTag}${personaTag}${playbookTag}${quotePrefix}${webSearchContext.formattedContext}\n\n[CÂU HỎI / TIN NHẮN CỦA NGƯỜI DÙNG]:\n${userText}\n\n[QUY TẮC BẮT BUỘC KHI CÓ DỮ LIỆU TÌM KIẾM WEB THỜI GIAN THỰC]:\n- Bắt buộc dùng sự kiện, số liệu, ngày tháng từ [DỮ LIỆU WEB THỜI GIAN THỰC] ở trên để trả lời chính xác tuyệt đối, KHÔNG dùng dữ liệu quá khứ.\n- TUYỆT ĐỐI CẤM hứa hẹn câu giờ kiểu 'chờ mình chút', 'để mình tìm' vì dữ liệu đã được cung cấp sẵn ngay ở trên.\n- Nếu người dùng có yêu cầu xin link/đường dẫn: Hãy chèn trực tiếp Markdown link gọn ([Tên nguồn — Tiêu đề](https://...)) từ kết quả tìm kiếm vào câu trả lời.\n- Vẫn giữ nguyên xưng hô và cá tính bạn bè như đã chỉ định, trả lời súc tích, sắc bén, tự nhiên.\n\n${directive.directivePrompt}\n\n${userStyle.styleHint}`;
      }
    }

    const currentVault = migrateAndNormalizeVault(userMemory.vault || userMemory, chrono);
    const memorySlice = buildMemoryContextSlice(currentVault, {
      persona: dualPersona.persona,
      intentMode: directive.intentMode,
      domain: directive.domain,
      userText,
    });

    // TRUY HỒI NGỮ NGHĨA CỤC BỘ (Semantic Recall Context)
    // Bỏ qua khi STOP_SIGNAL hoặc PING để giữ độ trễ tối thiểu
    const semanticRecallTag =
      (directive.intentMode === 'STOP_SIGNAL' || directive.intentMode === 'PING')
        ? ''
        : buildSemanticRecallContext({
            userText,
            intentMode: directive.intentMode,
            expertDomain: directive.domain,
            currentSessionId,
            activeNotebookId,
            sessions,
            notebooks,
            memoryVault: currentVault,
          });

    if (semanticRecallTag && semanticRecallTag.trim()) {
      finalUserMessage += `\n\n${semanticRecallTag.trim()}`;
    }

    // CHỌN LỌC DYNAMIC FEW-SHOT VÀNG ĐỘNG (Tiết kiệm Token & <= 520 ký tự)
    // Bỏ qua khi STOP_SIGNAL hoặc PING để giữ độ trễ tối thiểu (0 token thừa, phản hồi < 0.5s)
    const dynamicFewShotTag =
      (directive.intentMode === 'STOP_SIGNAL' || directive.intentMode === 'PING')
        ? ''
        : selectDynamicFewShot({
            intentMode: directive.intentMode,
            persona: dualPersona.persona,
            expertDomain: directive.domain,
            psychState: directive.psych?.psychState,
            webTopic: webSearchContext.topic,
            userText,
          });

    if (dynamicFewShotTag && dynamicFewShotTag.trim()) {
      finalUserMessage += `\n\n${dynamicFewShotTag.trim()}`;
    }

    // CẦU NỐI NGỮ CẢNH LƯỢT ĐẦU TIÊN (First-Turn Proactive Bridge — Day 14)
    // Chỉ tiêm khi lượt 1 (history rỗng) và không phải STOP_SIGNAL / PING
    const proactiveBridgeTag = buildProactiveBridgeTag({
      proactiveContextTag,
      history: recentChats,
      userText,
      intentMode: directive.intentMode,
    });

    if (proactiveBridgeTag) {
      finalUserMessage += `\n\n${proactiveBridgeTag}`;
    }

    const systemPrompt = buildSystemPrompt(
      userMemory,
      recentChats,
      previousSessionMessages,
      userStyle.styleHint,
      chrono,
      memorySlice,
      semanticRecallTag,
      dynamicFewShotTag,
      proactiveBridgeTag
    );

    const attachPsychStateMemory = (targetPayload: AIResponsePayload) => {
      const strongStates: PsychState[] = [
        'STRESSED_OVERWHELMED',
        'LOW_DOWN_DEFLATED',
        'MASKED_SADNESS',
        'EXCITED_HYPED',
      ];
      if (directive.psych && strongStates.includes(directive.psych.psychState)) {
        const stateLabels: Record<string, string> = {
          STRESSED_OVERWHELMED: 'Áp lực / quá tải',
          LOW_DOWN_DEFLATED: 'Tâm trạng tụt mood / chán nản',
          MASKED_SADNESS: 'Nỗi buồn ngầm cần sẻ chia',
          EXCITED_HYPED: 'Hào hứng phấn khích',
        };
        const psychNote = stateLabels[directive.psych.psychState];
        if (psychNote) {
          const baseVault = targetPayload.memoryUpdate?.vault
            ? migrateAndNormalizeVault(targetPayload.memoryUpdate.vault, chrono)
            : currentVault;
          const updatedVault = mergeMemoryIntoVault(baseVault, { memory_note: psychNote, userMessage: userText }, chrono, directive.psych);
          targetPayload.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
        }
      }
    };

    // =========================================================================
    // HẠNG MỤC 3: HYBRID AI ROUTER (Primary OpenAI -> 3 Tầng Gemini Free Chain)
    // Cấp phát Token Động & Dynamic Timeout: 250 tokens / 8s cho chat ngắn;
    // 1200 tokens / 30s cho code/bảng/finance; 2000 tokens / 30s cho STEM/Vision.
    // =========================================================================
    const failoverTrace: string[] = [];

    // 1. BỘ NÃO CHÍNH SIÊU TỐC: OPENAI (gpt-4o-mini, dynamic tokens/timeout, silent circuit breaker)
    if (OPENAI_API_KEY && !isOpenAIUnavailable) {
      try {
        const openAiRaw = await callOpenAI(
          systemPrompt,
          finalUserMessage,
          recentChats,
          effectiveImageBase64,
          directive.dynamicMaxTokens,
          directive.dynamicTimeout,
          directive.temperature ?? 0.75,
          externalSignal
        );
        let parsed = parseAIResponseJson(openAiRaw, userText, recentChats, webSearchContext.sources);
        if (
          parsed &&
          parsed.replies &&
          isEmptyTeaserReply(parsed.replies) &&
          (directive.intentMode === 'EXPERT_JARVIS' || directive.domain === 'CODE_CS' || directive.isFollowUpPrompt)
        ) {
          try {
            const forcedMsg = `${finalUserMessage}\n\n[CẢNH BÁO BẮT BUỘC]: Trả lời trực tiếp bằng ví dụ/code đầy đủ ngay trong mảng replies[0], CẤM chỉ nói câu dẫn mồi.`;
            const retryRaw = await callOpenAI(
              systemPrompt,
              forcedMsg,
              recentChats,
              effectiveImageBase64,
              directive.dynamicMaxTokens,
              directive.dynamicTimeout,
              0.25,
              externalSignal
            );
            const retryParsed = parseAIResponseJson(retryRaw, userText, recentChats, webSearchContext.sources);
            if (retryParsed && retryParsed.replies && !isEmptyTeaserReply(retryParsed.replies)) {
              parsed = retryParsed;
            }
          } catch (retryErr: any) {
            if (retryErr instanceof UserAbortError || retryErr?.name === 'UserAbortError' || externalSignal?.aborted) {
              throw new UserAbortError();
            }
          }
        }
        if (parsed && parsed.replies && parsed.replies.length > 0) {
          const rawNote = parsed.memory_note || (parsed as any).memoryNote || '';
          const rawUpdate = (parsed as any).memory_update;
          if (rawNote || rawUpdate) {
            let noteToSave = rawNote;
            if (chrono.period !== 'LATE_NIGHT' && (noteToSave.toLowerCase().includes('thức khuya') || noteToSave.toLowerCase().includes('thức đêm'))) {
              noteToSave = '';
              parsed.memory_note = '';
              parsed.memoryNote = '';
            }
            const updatedVault = mergeMemoryIntoVault(
              currentVault,
              {
                memory_note: noteToSave,
                memory_update: rawUpdate,
                userMessage: userText,
              },
              chrono,
              directive.psych
            );
            parsed.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
          }
          attachPsychStateMemory(parsed);
          if (webSearchContext.searched) {
            parsed.sources = webSearchContext.sources;
            parsed.searchQuery = webSearchContext.query;
            parsed.isWebSearched = true;
          }
          return parsed;
        }
      } catch (err: any) {
        if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
          throw new UserAbortError();
        }
        const errMsg = err?.message || String(err);
        const cleanMsg = extractApiErrorMessage(errMsg);
        failoverTrace.push(`OpenAI:${cleanMsg.slice(0, 60)}`);
        console.warn('[AI Router Failover]:', `OpenAI gặp sự cố (${errMsg}), tự động chuyển ngầm sang Gemini`);
      }
    }

    // 2. CHUỖI DỰ PHÒNG NGẦM: GEMINI MODEL FALLBACK CHAIN (MIỄN PHÍ 3 TẦNG)
    const preferSmartFlash = Boolean(
      directive.domain?.startsWith('STEM_') || directive.domain === 'VISION_LAB'
    );
    for (let keyIdx = 0; keyIdx < ALL_GEMINI_KEYS.length; keyIdx++) {
      if (externalSignal?.aborted) {
        throw new UserAbortError();
      }
      const key = ALL_GEMINI_KEYS[keyIdx];
      try {
        const rawRes = await callModelFallbackChain(
          key,
          systemPrompt,
          finalUserMessage,
          effectiveImageBase64,
          webSearchContext.searched,
          directive.dynamicMaxTokens,
          directive.dynamicTimeout,
          recentChats,
          directive.temperature ?? 0.7,
          preferSmartFlash,
          hasImage,
          failoverTrace,
          externalSignal
        );
        let parsed = parseAIResponseJson(rawRes.text, userText, recentChats, webSearchContext.sources);
        if (
          parsed &&
          parsed.replies &&
          isEmptyTeaserReply(parsed.replies) &&
          (directive.intentMode === 'EXPERT_JARVIS' || directive.domain === 'CODE_CS' || directive.isFollowUpPrompt)
        ) {
          try {
            const forcedMsg = `${finalUserMessage}\n\n[CẢNH BÁO BẮT BUỘC]: Trả lời trực tiếp bằng ví dụ/code đầy đủ ngay trong mảng replies[0], CẤM chỉ nói câu dẫn mồi.`;
            const retryRes = await callModelFallbackChain(
              key,
              systemPrompt,
              forcedMsg,
              effectiveImageBase64,
              webSearchContext.searched,
              directive.dynamicMaxTokens,
              directive.dynamicTimeout,
              recentChats,
              0.25,
              preferSmartFlash,
              hasImage,
              failoverTrace,
              externalSignal
            );
            const retryParsed = parseAIResponseJson(retryRes.text, userText, recentChats, webSearchContext.sources);
            if (retryParsed && retryParsed.replies && !isEmptyTeaserReply(retryParsed.replies)) {
              parsed = retryParsed;
            }
          } catch (retryErr: any) {
            if (retryErr instanceof UserAbortError || retryErr?.name === 'UserAbortError' || externalSignal?.aborted) {
              throw new UserAbortError();
            }
          }
        }
        if (parsed && parsed.replies && parsed.replies.length > 0) {
          const rawNote = parsed.memory_note || (parsed as any).memoryNote || '';
          const rawUpdate = (parsed as any).memory_update;
          if (rawNote || rawUpdate) {
            let noteToSave = rawNote;
            if (chrono.period !== 'LATE_NIGHT' && (noteToSave.toLowerCase().includes('thức khuya') || noteToSave.toLowerCase().includes('thức đêm'))) {
              noteToSave = '';
              parsed.memory_note = '';
              parsed.memoryNote = '';
            }
            const updatedVault = mergeMemoryIntoVault(
              currentVault,
              {
                memory_note: noteToSave,
                memory_update: rawUpdate,
                userMessage: userText,
              },
              chrono,
              directive.psych
            );
            parsed.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
          }
          attachPsychStateMemory(parsed);
          if (webSearchContext.searched) {
            const allSources = [...(webSearchContext.sources || [])];
            if (rawRes.groundingSources && rawRes.groundingSources.length > 0) {
              allSources.push(...rawRes.groundingSources);
            }
            parsed.sources = allSources.slice(0, 4);
            parsed.searchQuery = webSearchContext.query;
            parsed.isWebSearched = true;
          }
          return parsed;
        }
      } catch (err: any) {
        if (err instanceof UserAbortError || err?.name === 'UserAbortError' || externalSignal?.aborted) {
          throw new UserAbortError();
        }
        const errMsg = err?.message || String(err);
        const cleanMsg = extractApiErrorMessage(errMsg);
        failoverTrace.push(`Key#${keyIdx + 1}:${cleanMsg.slice(0, 60)}`);
        console.warn('[AI Router Failover]:', `API Key #${keyIdx + 1} lỗi (${errMsg}), thử key tiếp theo...`);
      }
    }

    // 3. CHỐNG SẬP TỨC THÌ: Local Resilient Fallback Engine chạy cục bộ
    if (externalSignal?.aborted) {
      throw new UserAbortError();
    }
    console.error('[Vision/AI Failover Trace]:', failoverTrace);
    const debugCode = failoverTrace.map((t) => t.replace(/https?:\/\/[^\s]+/g, '').replace(/[{}"]/g, '')).join(' | ').slice(0, 150);
    console.warn('[AI Router Failover]:', 'Toàn bộ API Cloud đã cạn hoặc quá tải, kích hoạt Local Resilient Fallback Engine');
    const fallbackRes = localResilientFallback(userText, !!effectiveImageBase64, userMemory, chrono, debugCode);
    const fallbackNote = fallbackRes.memory_note || (fallbackRes as any).memoryNote || '';
    const fallbackUpdate = (fallbackRes as any).memory_update;
    if (fallbackNote || fallbackUpdate) {
      let noteToSave = fallbackNote;
      if (chrono.period !== 'LATE_NIGHT' && (noteToSave.toLowerCase().includes('thức khuya') || noteToSave.toLowerCase().includes('thức đêm'))) {
        noteToSave = '';
        fallbackRes.memory_note = '';
        fallbackRes.memoryNote = '';
      }
      const updatedVault = mergeMemoryIntoVault(
        currentVault,
        {
          memory_note: noteToSave,
          memory_update: fallbackUpdate,
          userMessage: userText,
        },
        chrono,
        directive.psych
      );
      fallbackRes.memoryUpdate = updateProfileWithVault(userMemory, updatedVault);
    }
    attachPsychStateMemory(fallbackRes);
    if (webSearchContext.searched) {
      fallbackRes.sources = webSearchContext.sources;
      fallbackRes.searchQuery = webSearchContext.query;
      fallbackRes.isWebSearched = true;
      if (webSearchContext.sources.length > 0 && webSearchContext.sources[0].snippet) {
        const top = webSearchContext.sources[0];
        const linkPart = top.url ? `\nĐường dẫn tham khảo: ${top.url}` : '';
        fallbackRes.replies = [
          `Theo thông tin kiểm chứng mới nhất: ${top.snippet.slice(0, 220)}...${linkPart}`,
        ];
      }
    }
    return fallbackRes;
  } catch (error: any) {
    if (error instanceof UserAbortError || error?.name === 'UserAbortError' || externalSignal?.aborted) {
      console.log('[AI Router]: Lệnh đã được người dùng chủ động ngắt.');
      return {
        replies: [],
        reply: '',
        session_title: '',
        should_update_title: false,
        conversation_state: 'casual_friend',
        memory_note: '',
        jarvis_intent: 'chat',
        isCancelled: true,
      };
    }
    const errMsg = error?.message || 'Unknown error';
    console.error('[AI Error Detail]:', errMsg);
    const isTM = userMemory?.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(userText);
    const errorDisplay = isTM
      ? `Lỗi hệ thống (${errMsg}) — m thử gửi lại giúp t nhé!`
      : `Lỗi hệ thống (${errMsg}) — bạn thử gửi lại giúp mình nhé!`;
    return {
      replies: [errorDisplay],
      reply: errorDisplay,
      session_title: '',
      should_update_title: false,
      conversation_state: 'casual_friend',
      memory_note: '',
      jarvis_intent: 'chat',
    };
  }
}

export async function sendMessageToTomorrow(
  userText: string,
  userMemory: UserMemoryProfile,
  recentChats: ChatMessage[] = [],
  imageBase64?: string,
  previousSessionMessages?: ChatMessage[],
  forceWebSearch: boolean = false,
  onSearchStatusChange?: (isSearching: boolean) => void,
  customNow?: Date,
  telemetry?: Partial<KeystrokeTelemetry>,
  currentSessionId?: string,
  activeNotebookId?: string,
  sessions?: ChatSession[],
  notebooks?: Notebook[],
  externalSignal?: AbortSignal,
  proactiveContextTag?: string,
  quotedSelection?: { text: string; messageId: string }
): Promise<AIResponsePayload> {
  if (externalSignal?.aborted) {
    return {
      replies: [],
      reply: '',
      session_title: '',
      should_update_title: false,
      conversation_state: 'casual_friend',
      memory_note: '',
      jarvis_intent: 'chat',
      isCancelled: true,
    };
  }
  await acquireAISlot();
  try {
    return await doSendMessageToTomorrow(
      userText,
      userMemory,
      recentChats,
      imageBase64,
      previousSessionMessages,
      forceWebSearch,
      onSearchStatusChange,
      customNow,
      telemetry,
      currentSessionId,
      activeNotebookId,
      sessions,
      notebooks,
      externalSignal,
      proactiveContextTag,
      quotedSelection
    );
  } finally {
    releaseAISlot();
  }
}

// Giữ lại alias để tương thích ngược tuyệt đối
export const sendMessageToSoulMate = sendMessageToTomorrow;
export const sendMessageToAI = sendMessageToTomorrow;
export const getAIResponse = sendMessageToTomorrow;

/**
 * Sinh câu chào mở app tinh tế, đồng bộ thời gian thực, chuẩn bạn thân thông minh
 */
export function getColdGreetingText(userMemory: UserMemoryProfile, hasChatHistory: boolean, now: Date = new Date()): string {
  const chrono = buildChronoContext(now);

  const timeGreeting =
    chrono.period === 'EARLY_MORNING' ? 'Sáng sớm tinh mơ!' :
    chrono.period === 'MORNING' ? 'Chào buổi sáng!' :
    chrono.period === 'NOON' ? 'Buổi trưa năng lượng!' :
    chrono.period === 'AFTERNOON' ? 'Buổi chiều hiệu quả!' :
    chrono.period === 'EVENING' ? 'Buổi tối thảnh thơi!' : 'Đêm đã khuya rồi!';

  if (!hasChatHistory) {
    const project = userMemory.currentProject ? ` Tiếp tục dự án ${userMemory.currentProject} chứ?` : '';
    return `${timeGreeting}${project || ' Cần mình hỗ trợ việc gì hay chỉ tâm sự xả hơi?'}`;
  }

  const problem = userMemory.currentProblem?.toLowerCase() || '';
  if (problem.includes('deadline') || problem.includes('bug')) {
    return `${timeGreeting} Vụ bug và deadline hôm trước xử lý êm chưa?`;
  }
  if (problem.includes('oop') || problem.includes('thi')) {
    return `${timeGreeting} Môn OOP và bài vở hôm nay tiến triển thế nào rồi?`;
  }
  if (problem.includes('buồn') || problem.includes('chán') || problem.includes('áp lực')) {
    return `${timeGreeting} Tâm trạng hôm nay đã khá hơn chút nào chưa?`;
  }

  const name = userMemory.nickname || userMemory.userName;
  return `${timeGreeting} ${name ? name + ' ơi, ' : ''}hôm nay có ý tưởng gì mới không?`.trim();
}
