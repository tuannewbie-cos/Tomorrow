/**
 * TOMORROW V4.8 — SERVICES/SEMANTIC_RECALL_SERVICE.TS
 * ĐỘNG CƠ TÌM KIẾM NGỮ NGHĨA CỤC BỘ (LOCAL SEMANTIC RECALL ENGINE)
 * 
 * Vận hành 100% cục bộ trên RAM (< 5ms, 0 API cost):
 * 1. tokenizeForRecall: Tách từ & chuẩn hóa song ngữ Việt-Anh, accent-folding (có/không dấu) + bảo toàn code/tech/finance.
 * 2. CONCEPT_KEYWORD_GRAPH: Đồ thị liên tưởng từ khóa cục bộ (35-50 khái niệm cốt lõi STEM, Code, Finance, Tomorrow).
 * 3. RecallChunk & RAM Index: Lập chỉ mục cặp hội thoại (User + Assistant) và Memory Vault, loại trừ nhiễu/lỗi mạng.
 * 4. searchLocalSemanticRecall: Thuật toán Okapi BM25 + trọng số sổ ghi chú, định dạng code và độ tươi nhẹ.
 * 5. buildSemanticRecallContext: Đóng gói thẻ [RECALL_MEMORY] súc tích <= 520 ký tự cho bộ não AI.
 */

import {
  ChatSession,
  ChatMessage,
  StructuredMemoryVault,
  UserMemoryVault,
  UserMemoryProfile,
  StudySubject,
  FinanceGoal,
} from '../types/chat';
import { Notebook, formatRelativeTime } from '../storage/notebookStorage';

export interface RecallChunk {
  id: string;
  sourceType: 'session_turn' | 'memory_vault';
  sessionId?: string;
  notebookId?: string;
  notebookName?: string;
  sessionTitle: string;
  timestamp: number;
  text: string;          // Bản rút gọn sạch (đã lọc bong bóng lỗi Offline/Timeout, tối đa ~320 ký tự)
  snippet: string;       // Trích đoạn hiển thị gọn (tối đa 140 ký tự)
  hasCodeOrFormula: boolean;
  tokens: string[];
}

export interface RecallSearchResult {
  chunk: RecallChunk;
  score: number;
  isDirectMatch: boolean;
}

export interface SemanticRecallOptions {
  currentSessionId?: string;
  activeNotebookId?: string;
  notebooks?: Notebook[];
  isJarvisLab?: boolean;
  limit?: number;
  minScore?: number;
}

export interface SemanticRecallContextOptions {
  userText: string;
  intentMode?: string;
  expertDomain?: string;
  currentSessionId?: string;
  activeNotebookId?: string;
  sessions?: ChatSession[];
  notebooks?: Notebook[];
  memoryVault?: StructuredMemoryVault | UserMemoryVault | UserMemoryProfile;
}

// =============================================================================
// 1. BỘ TÁCH TỪ & CHUẨN HÓA SONG NGỮ VIỆT - ANH + STEM/CODE (tokenizeForRecall)
// =============================================================================

export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const STOP_WORDS = new Set([
  'la', 'cua', 'va', 'thi', 'ma', 'cho', 'toi', 'minh', 'ban', 'cai',
  'nay', 'kia', 'voi', 'duoc', 'the', 'is', 'in', 'to', 'of', 'a', 'an',
  'on', 'at', 'for', 'co', 'da', 'dang', 'se', 'nhe', 'nha', 'oi', 'a',
  'vay', 'nao', 'gi', 'sao', 'cac', 'nhung', 'nhu', 've', 'trong', 'tu',
  'ra', 'vao', 'lai', 'no', 'chung', 'hay', 'hoac', 'thi', 'con', 'neu'
]);

/**
 * Tách từ & chuẩn hóa:
 * - Giữ song song dạng có dấu + không dấu (accent-folding)
 * - Bigrams ghép: "tich_phan", "con_tro", "de_quy"...
 * - Bảo toàn cụm kỹ thuật: c++, c#, o(n), o(n^2), p/e, p/b, roe, dca, led, div(a,b)...
 * - Tách camelCase & snake_case
 */
export function tokenizeForRecall(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const tokenSet = new Set<string>();

  // 1. Bóc tách các cụm kỹ thuật / công thức đặc biệt
  const techRegex = /\b(c\+\+|c#|o\(n\^2\)|o\(n\)|o\(log\s*n\)|o\(n\s*log\s*n\)|p\/e|p\/b|roe|dca|led|div\([a-z0-9_,\s]+\)|bubble_sort|big_o|big\s*o)\b/gi;
  const techMatches = lower.match(techRegex);
  if (techMatches) {
    for (const tm of techMatches) {
      const clean = tm.replace(/\s+/g, '');
      tokenSet.add(clean);
      if (clean === 'bigo') tokenSet.add('big_o');
    }
  }

  // 2. Tách từ ngữ thông thường (bảo toàn chữ cái, tiếng Việt có dấu, số)
  const rawWords = lower
    .replace(/[^\w\s\u00C0-\u1EF9+/#^()-]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const cleanWords: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const w = rawWords[i];

    // Tách camelCase: useDebounce -> use, debounce, usedebounce
    const camelParts = w.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ');
    if (camelParts.length > 1) {
      for (const p of camelParts) {
        if (p.length > 1) tokenSet.add(p);
      }
      tokenSet.add(w.toLowerCase());
    }

    // Tách snake_case: bubble_sort -> bubble, sort, bubble_sort
    if (w.includes('_')) {
      const snakeParts = w.split('_');
      for (const sp of snakeParts) {
        if (sp.length > 1) tokenSet.add(sp);
      }
      tokenSet.add(w);
    }

    const unaccented = removeVietnameseAccents(w);
    if (!STOP_WORDS.has(unaccented) && w.length > 1) {
      tokenSet.add(w);
      tokenSet.add(unaccented);
      cleanWords.push(unaccented);
    } else if (w.length > 1) {
      cleanWords.push(unaccented);
    }

    // Bigrams ghép (VD: tich_phan, giai_tich, con_tro, de_quy)
    if (i < rawWords.length - 1) {
      const nextW = rawWords[i + 1];
      const nextUnacc = removeVietnameseAccents(nextW);
      if (!STOP_WORDS.has(unaccented) || !STOP_WORDS.has(nextUnacc)) {
        tokenSet.add(`${unaccented}_${nextUnacc}`);
        tokenSet.add(`${w}_${nextW}`);
      }
    }
  }

  return Array.from(tokenSet).filter((t) => t.length > 1);
}

// =============================================================================
// 2. ĐỒ THỊ LIÊN TƯỞNG TỪ KHÓA CỤC BỘ (CONCEPT_KEYWORD_GRAPH)
// =============================================================================

export const CONCEPT_KEYWORD_GRAPH: Record<string, string[]> = {
  // --- Toán & STEM ---
  'giai_tich': ['tich_phan', 'tích phân', 'dao_ham', 'đạo hàm', 'chuoi_so', 'chuỗi số', 'vi_phan', 'vi phân', 'gioi_han', 'giới hạn'],
  'giải tích': ['tích phân', 'tich_phan', 'đạo hàm', 'dao_ham', 'chuỗi số', 'chuoi_so', 'vi phân', 'vi_phan'],
  'tich_phan': ['giai_tich', 'giải tích', 'dao_ham', 'chuoi_so', 'vi_phan', 'nguyen_ham'],
  'tích phân': ['giải tích', 'giai_tich', 'đạo hàm', 'chuỗi số', 'vi phân'],
  'chuoi_so': ['giai_tich', 'giải tích', 'hoi_tu', 'phan_ky', 'tich_phan'],
  'chuỗi số': ['giải tích', 'giai_tich', 'hội tụ', 'phân kỳ', 'tích phân'],
  'vat_ly': ['co_hoc', 'cơ học', 'nhiet_hoc', 'nhiệt học', 'dien_tu', 'điện từ', 'dong_luc_hoc', 'động lực học'],
  'vật lý': ['cơ học', 'nhiệt học', 'điện từ', 'động lực học'],
  'mach_dien': ['dien_tro', 'điện trở', 'led', 'ohm', 'dong_dien', 'dòng điện', 'nguon', 'nguồn'],
  'mạch điện': ['điện trở', 'led', 'ohm', 'dòng điện', 'nguồn'],
  'dien_tro': ['mach_dien', 'mạch điện', 'led', 'ohm', 'dong_dien'],
  'điện trở': ['mạch điện', 'led', 'ohm', 'dòng điện'],
  'hoa_hoc': ['phuong_trinh', 'phương trình', 'mol', 'phan_ung', 'phản ứng', 'can_bang', 'cân bằng'],
  'hóa học': ['phương trình', 'mol', 'phản ứng', 'cân bằng'],

  // --- Tin học & Code ---
  'de_quy': ['recursion', 'base_case', 'con_tro', 'con trỏ', 'pointer', 'div'],
  'đệ quy': ['recursion', 'base case', 'con trỏ', 'pointer', 'c++', 'div'],
  'recursion': ['de_quy', 'đệ quy', 'base_case', 'pointer', 'con_tro'],
  'con_tro': ['de_quy', 'đệ quy', 'pointer', 'c++', 'dia_chi', 'div'],
  'con trỏ': ['đệ quy', 'de_quy', 'pointer', 'c++', 'div'],
  'pointer': ['con_tro', 'con trỏ', 'c++', 'de_quy', 'recursion', 'div'],
  'thuat_toan': ['sort', 'bubble', 'dp', 'do_phuc_tap', 'độ phức tạp', 'big_o', 'big o', 'o(n)', 'o(n^2)'],
  'thuật toán': ['sort', 'bubble', 'dp', 'độ phức tạp', 'big o', 'o(n)', 'o(n^2)'],
  'sort': ['bubble', 'bubble_sort', 'thuat_toan', 'thuật toán', 'do_phuc_tap'],
  'bubble': ['sort', 'bubble_sort', 'thuat_toan', 'thuật toán'],
  'react': ['expo', 'hook', 'state', 'typescript', 'asyncstorage'],
  'expo': ['react', 'hook', 'state', 'mobile', 'router'],
  'loi': ['bug', 'fix', 'timeout', 'crash', 'exception'],
  'lỗi': ['bug', 'fix', 'timeout', 'crash', 'exception'],
  'bug': ['loi', 'lỗi', 'fix', 'debug', 'crash'],

  // --- Tài chính cá nhân & Đầu tư ---
  'tiet_kiem': ['quy_du_phong', 'quỹ dự phòng', 'ngan_sach', 'ngân sách', 'chi_tieu', 'chi tiêu', 'de_danh', 'để dành'],
  'tiết kiệm': ['quỹ dự phòng', 'ngân sách', 'chi tiêu', 'để dành'],
  'de_danh': ['quy_du_phong', 'quỹ dự phòng', 'tiet_kiem', 'tiết kiệm', 'ngan_sach', 'chi_tieu'],
  'để dành': ['quỹ dự phòng', 'tiết kiệm', 'ngân sách', 'chi tiêu'],
  'quy_du_phong': ['tiet_kiem', 'tiết kiệm', 'de_danh', 'để dành', 'ngan_sach'],
  'quỹ dự phòng': ['tiết kiệm', 'để dành', 'ngân sách'],
  'dau_tu': ['co_phieu', 'cổ phiếu', 'chung_khoan', 'chứng khoán', 'dca', 'lai_kep', 'lãi kép', 'p/e', 'roe', 'crypto'],
  'đầu tư': ['cổ phiếu', 'chứng khoán', 'dca', 'lãi kép', 'p/e', 'roe', 'crypto'],
  'co_phieu': ['dau_tu', 'đầu tư', 'chung_khoan', 'chứng khoán', 'dca', 'lai_kep', 'p/e', 'roe'],
  'cổ phiếu': ['đầu tư', 'chứng khoán', 'dca', 'lãi kép', 'p/e', 'roe'],
  'chung_khoan': ['dau_tu', 'đầu tư', 'co_phieu', 'cổ phiếu', 'p/e', 'roe'],
  'chứng khoán': ['đầu tư', 'cổ phiếu', 'p/e', 'roe'],

  // --- Dự án Tomorrow & Ký ức ---
  'tomorrow': ['jarvis', 'sidebar', 'split screen', 'memory vault', 'design.md'],
  'jarvis': ['tomorrow', 'lab', 'hud', 'expert', 'stem'],
  'lich_su': ['hom_truoc', 'tuan_truoc', 'bai_cu', 'nho_khong'],
  'lịch sử': ['hôm trước', 'tuần trước', 'bài cũ', 'nhớ không'],
};

/**
 * Mở rộng từ khóa thông qua CONCEPT_KEYWORD_GRAPH:
 * Trả về danh sách token mở rộng kèm trọng số 0.45x
 */
export function expandConceptKeywords(tokens: string[]): string[] {
  const expandedSet = new Set<string>();

  for (const token of tokens) {
    const unaccented = removeVietnameseAccents(token);
    const related = CONCEPT_KEYWORD_GRAPH[token] || CONCEPT_KEYWORD_GRAPH[unaccented];
    if (related && Array.isArray(related)) {
      for (const rel of related) {
        const subTokens = tokenizeForRecall(rel);
        for (const st of subTokens) {
          if (!tokens.includes(st)) {
            expandedSet.add(st);
          }
        }
      }
    }
  }

  return Array.from(expandedSet);
}

// =============================================================================
// 3. BỘ NHẬN DIỆN TÍN HIỆU THỜI GIAN & CHẾ ĐỘ SĂN KÝ ỨC (hasTemporalRecallCue)
// =============================================================================

export function hasTemporalRecallCue(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const unaccented = removeVietnameseAccents(lower);
  const cues = [
    'hôm trước', 'tuần trước', 'lần trước', 'hồi trước', 'hôm nọ', 'mấy hôm trước',
    'nhớ không', 'bài cũ', 'đoạn code cũ', 'lúc trước mình bàn', 'đã nói trước đó',
    'nhắc lại', 'trước đây', 'trước đó', 'bài hôm qua', 'code hôm trước', 'vụ trước',
    'hom truoc', 'tuan truoc', 'lan truoc', 'hoi truoc', 'hom no', 'may hom truoc',
    'nho khong', 'bai cu', 'doan code cu', 'luc truoc minh ban', 'da noi truoc do',
    'nhac lai', 'truoc day', 'truoc do', 'bai hom qua', 'code hom truoc'
  ];
  return cues.some((c) => lower.includes(c) || unaccented.includes(c));
}

// =============================================================================
// 4. LẬP CHỈ MỤC THEO CẶP HỘI THOẠI & CACHE TRÊN RAM
// =============================================================================

function isNetworkErrorMessage(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('offline/timeout') ||
    lower.includes('[object object]') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('watchdog_timeout') ||
    lower.includes('lỗi mạng') ||
    lower.includes('mất kết nối')
  );
}

function checkHasCodeOrFormula(text: string): boolean {
  if (!text) return false;
  return (
    text.includes('```') ||
    text.includes('$$') ||
    text.includes('def ') ||
    text.includes('function ') ||
    text.includes('class ') ||
    text.includes('return ') ||
    text.includes('#include') ||
    text.includes('std::') ||
    text.includes('int ') ||
    text.includes('cout') ||
    text.includes('nullptr') ||
    text.includes('div(') ||
    text.includes('->') ||
    text.includes('O(n') ||
    text.includes('o(n')
  );
}

export interface RecallIndexCache {
  signature: string;
  chunks: RecallChunk[];
  idfMap: Map<string, number>;
  avgdl: number;
}

let ramIndexCache: RecallIndexCache | null = null;

export function clearRecallIndexCache(): void {
  ramIndexCache = null;
}

function getVaultTimestamp(vault?: StructuredMemoryVault | UserMemoryVault | UserMemoryProfile): number {
  if (!vault) return 0;
  if ('updatedAt' in vault && typeof vault.updatedAt === 'number') {
    return vault.updatedAt;
  }
  if ('lastActiveDate' in vault && vault.lastActiveDate) {
    const t = new Date(vault.lastActiveDate).getTime();
    if (!isNaN(t)) return t;
  }
  return Date.now();
}

export function buildRecallIndex(
  sessions: ChatSession[] = [],
  vault?: StructuredMemoryVault | UserMemoryVault | UserMemoryProfile,
  notebooks?: Notebook[],
  currentSessionId?: string
): RecallIndexCache {
  const latestSessionUpdate = sessions.reduce((max, s) => Math.max(max, s.updatedAt || 0), 0);
  const vaultUpdate = getVaultTimestamp(vault);
  const sessionSig = sessions.map((s) => `${s.id}:${s.updatedAt || 0}`).join('|');
  const signature = `${sessions.length}_${sessionSig}_${latestSessionUpdate}_${vaultUpdate}_${currentSessionId || 'none'}`;

  if (ramIndexCache && ramIndexCache.signature === signature) {
    return ramIndexCache;
  }

  const chunks: RecallChunk[] = [];
  const nbMap = new Map<string, string>();
  if (notebooks && Array.isArray(notebooks)) {
    for (const nb of notebooks) {
      nbMap.set(nb.id, nb.name);
    }
  }

  // 1. Chỉ mục từ CHAT_SESSIONS_V2
  for (const sess of sessions) {
    if (!sess || !sess.messages || sess.messages.length === 0) continue;

    const isCurrent = sess.id === currentSessionId;
    // Nếu là phiên đang mở: loại trừ 6 tin nhắn gần nhất
    const candidateMsgs = isCurrent ? sess.messages.slice(0, -6) : sess.messages;
    if (candidateMsgs.length === 0) continue;

    const nbName = nbMap.get(sess.notebookId || 'default-notebook') || 'Ghi chú chung';

    // Gom từng cặp (User turn + Assistant reply)
    for (let i = 0; i < candidateMsgs.length; i++) {
      const curMsg = candidateMsgs[i];
      if (curMsg.role === 'user' || curMsg.sender === 'user') {
        const userText = (curMsg.text || '').trim();
        if (isNetworkErrorMessage(userText)) continue;

        // Tìm assistant reply kế tiếp
        let assistantText = '';
        if (i + 1 < candidateMsgs.length) {
          const nextMsg = candidateMsgs[i + 1];
          if (nextMsg.role === 'model' || nextMsg.sender === 'ai') {
            assistantText = (nextMsg.text || '').trim();
          }
        }

        if (isNetworkErrorMessage(assistantText)) {
          assistantText = '';
        }

        const totalLength = userText.length + assistantText.length;
        // Bỏ qua lượt nhiễu quá ngắn (< 12 ký tự)
        if (totalLength < 12) continue;

        const combinedText = assistantText
          ? `User: ${userText} | Tomorrow: ${assistantText}`
          : userText;

        // Rút gọn sạch <= 320 ký tự
        const cleanText = combinedText.replace(/[\r\n]+/g, ' ').slice(0, 320);
        // Trích đoạn gọn <= 140 ký tự
        const snippet = assistantText
          ? assistantText.replace(/[\r\n]+/g, ' ').slice(0, 140)
          : userText.replace(/[\r\n]+/g, ' ').slice(0, 140);

        const hasCodeOrFormula = checkHasCodeOrFormula(combinedText);
        const tokens = tokenizeForRecall(cleanText);

        if (tokens.length > 0) {
          chunks.push({
            id: `turn-${sess.id}-${curMsg.id || i}`,
            sourceType: 'session_turn',
            sessionId: sess.id,
            notebookId: sess.notebookId || 'default-notebook',
            notebookName: nbName,
            sessionTitle: sess.title || 'Cuộc trò chuyện',
            timestamp: curMsg.timestamp || sess.updatedAt || Date.now(),
            text: cleanText,
            snippet,
            hasCodeOrFormula,
            tokens,
          });
        }
      }
    }
  }

  // 2. Chỉ mục từ USER_MEMORY_PROFILE_V1 (Memory Vault)
  if (vault) {
    const vaultTs = getVaultTimestamp(vault);
    const studySubs = (vault as any).studySubjects as StudySubject[] | undefined;
    if (studySubs && Array.isArray(studySubs)) {
      for (let idx = 0; idx < studySubs.length; idx++) {
        const sub = studySubs[idx];
        const text = `Môn học: ${sub.subject} (Trình độ: ${sub.level}${sub.focusTopic ? `, trọng tâm: ${sub.focusTopic}` : ''})`;
        const tokens = tokenizeForRecall(text);
        chunks.push({
          id: `vault-sub-${sub.id || idx}`,
          sourceType: 'memory_vault',
          sessionTitle: 'Hồ sơ Môn học',
          timestamp: vaultTs,
          text,
          snippet: text.slice(0, 140),
          hasCodeOrFormula: false,
          tokens,
        });
      }
    }

    const finGoals = (vault as any).financeGoals as FinanceGoal[] | undefined;
    if (finGoals && Array.isArray(finGoals)) {
      for (let idx = 0; idx < finGoals.length; idx++) {
        const fin = finGoals[idx];
        const text = `Mục tiêu tài chính: ${fin.goal}${fin.targetAmount ? ` - Số tiền: ${fin.targetAmount}` : ''}${fin.note ? ` (${fin.note})` : ''}`;
        const tokens = tokenizeForRecall(text);
        chunks.push({
          id: `vault-fin-${fin.id || idx}`,
          sourceType: 'memory_vault',
          sessionTitle: 'Mục tiêu Tài chính',
          timestamp: vaultTs,
          text,
          snippet: text.slice(0, 140),
          hasCodeOrFormula: false,
          tokens,
        });
      }
    }

    const activeProjs = (vault as any).activeProjects as string[] | undefined;
    if (activeProjs && Array.isArray(activeProjs)) {
      for (let idx = 0; idx < activeProjs.length; idx++) {
        const text = `Dự án: ${activeProjs[idx]}`;
        const tokens = tokenizeForRecall(text);
        chunks.push({
          id: `vault-proj-${idx}`,
          sourceType: 'memory_vault',
          sessionTitle: 'Dự án Đang làm',
          timestamp: vaultTs,
          text,
          snippet: text.slice(0, 140),
          hasCodeOrFormula: false,
          tokens,
        });
      }
    }

    const favs = (vault as any).favorites as string[] | undefined;
    if (favs && Array.isArray(favs)) {
      for (let idx = 0; idx < favs.length; idx++) {
        const text = `Sở thích: ${favs[idx]}`;
        const tokens = tokenizeForRecall(text);
        chunks.push({
          id: `vault-fav-${idx}`,
          sourceType: 'memory_vault',
          sessionTitle: 'Sở thích & Phong cách',
          timestamp: vaultTs,
          text,
          snippet: text.slice(0, 140),
          hasCodeOrFormula: false,
          tokens,
        });
      }
    }

    const habits = (vault as any).habits as string[] | undefined;
    if (habits && Array.isArray(habits)) {
      for (let idx = 0; idx < habits.length; idx++) {
        const text = `Thói quen: ${habits[idx]}`;
        const tokens = tokenizeForRecall(text);
        chunks.push({
          id: `vault-habit-${idx}`,
          sourceType: 'memory_vault',
          sessionTitle: 'Thói quen',
          timestamp: vaultTs,
          text,
          snippet: text.slice(0, 140),
          hasCodeOrFormula: false,
          tokens,
        });
      }
    }
  }

  // 3. Tính toán thông số BM25 (IDF và avgdl)
  const N = chunks.length;
  const docFreq = new Map<string, number>();
  let totalDocLen = 0;

  for (const chunk of chunks) {
    totalDocLen += chunk.tokens.length;
    const uniqueTokens = new Set(chunk.tokens);
    for (const t of uniqueTokens) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }

  const avgdl = N > 0 ? Math.max(1, totalDocLen / N) : 1;
  const idfMap = new Map<string, number>();

  for (const [t, df] of docFreq.entries()) {
    // Robertson-Spärck Jones IDF có làm mịn
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    idfMap.set(t, Math.max(0.05, idf));
  }

  const result: RecallIndexCache = {
    signature,
    chunks,
    idfMap,
    avgdl,
  };

  ramIndexCache = result;
  return result;
}

// =============================================================================
// 5. THUẬT TOÁN CHẤM ĐIỂM OKAPI BM25 + TRỌNG SỐ NGỮ CẢNH (searchLocalSemanticRecall)
// =============================================================================

export function searchLocalSemanticRecall(
  query: string,
  options: SemanticRecallOptions & {
    sessions?: ChatSession[];
    memoryVault?: StructuredMemoryVault | UserMemoryVault | UserMemoryProfile;
  } = {}
): RecallSearchResult[] {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return [];
  }

  const {
    currentSessionId,
    activeNotebookId,
    notebooks,
    isJarvisLab,
    limit = 5,
    minScore,
    sessions = [],
    memoryVault,
  } = options;

  const index = buildRecallIndex(sessions, memoryVault, notebooks, currentSessionId);
  if (!index || index.chunks.length === 0) return [];

  const directTokens = tokenizeForRecall(query);
  if (directTokens.length === 0) return [];

  const expandedTokens = expandConceptKeywords(directTokens);
  const directTokenSet = new Set(directTokens);

  const hasTemporalCue = hasTemporalRecallCue(query);
  const effectiveMinScore = hasTemporalCue ? 0.5 : (minScore ?? 1.0);

  const k1 = 1.5;
  const b = 0.75;
  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const isCodeQuery =
    isJarvisLab ||
    directTokens.some((t) =>
      ['code', 'pointer', 'con_tro', 'de_quy', 'recursion', 'div', 'c++', 'c#', 'sort', 'bubble', 'ham', 'class', 'struct'].includes(t)
    );

  const results: RecallSearchResult[] = [];

  for (const chunk of index.chunks) {
    // Tính tần suất từ trong chunk
    const termFreq = new Map<string, number>();
    for (const t of chunk.tokens) {
      termFreq.set(t, (termFreq.get(t) || 0) + 1);
    }

    const docLen = chunk.tokens.length;
    let score = 0;
    let directHit = false;

    // 1. Chấm điểm token trực tiếp (trọng số 1.0)
    for (const dt of directTokens) {
      const f = termFreq.get(dt) || 0;
      if (f > 0) {
        directHit = true;
        const idf = index.idfMap.get(dt) || 0.8;
        const bm25Term = (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + b * (docLen / index.avgdl)));
        score += 1.0 * bm25Term;
      }
    }

    // 2. Chấm điểm token mở rộng từ Concept Graph (trọng số 0.45)
    for (const et of expandedTokens) {
      if (directTokenSet.has(et)) continue;
      const f = termFreq.get(et) || 0;
      if (f > 0) {
        const idf = index.idfMap.get(et) || 0.6;
        const bm25Term = (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + b * (docLen / index.avgdl)));
        score += 0.45 * bm25Term;
      }
    }

    if (score <= 0) continue;

    // 3. Hệ số cộng hưởng thông minh:
    // A. Cùng Sổ ghi chú: x1.20
    if (activeNotebookId && chunk.notebookId && chunk.notebookId === activeNotebookId) {
      score *= 1.20;
    }

    // B. Khớp định dạng STEM / Code: x1.15
    if (isCodeQuery && chunk.hasCodeOrFormula) {
      score *= 1.15;
    }

    // C. Độ tươi nhẹ (Mild Recency): trong 14 ngày cộng tối đa 1.08x
    const ageMs = Math.max(0, now - chunk.timestamp);
    if (ageMs < fourteenDaysMs) {
      const freshnessRatio = 1 - ageMs / fourteenDaysMs;
      score *= (1.0 + 0.08 * freshnessRatio);
    }

    if (score >= effectiveMinScore) {
      results.push({
        chunk,
        score,
        isDirectMatch: directHit,
      });
    }
  }

  // Sắp xếp giảm dần theo điểm số
  results.sort((a, b) => b.score - a.score);

  // Lọc trùng nội dung (Mỗi session lấy kết quả cao điểm nhất, tránh lặp lại nhiều turn cùng 1 session)
  const uniqueResults: RecallSearchResult[] = [];
  const seenKeys = new Set<string>();

  for (const r of results) {
    const itemKey = r.chunk.sessionId ? `sess-${r.chunk.sessionId}` : `vault-${r.chunk.text.slice(0, 60).toLowerCase()}`;
    if (!seenKeys.has(itemKey)) {
      seenKeys.add(itemKey);
      uniqueResults.push(r);
      if (uniqueResults.length >= limit) break;
    }
  }

  return uniqueResults;
}

// =============================================================================
// 6. ĐÓNG GÓI THẺ TRÍ NHỚ SIÊU GỌN CHO BỘ NÃO AI (buildSemanticRecallContext)
// =============================================================================

export function buildSemanticRecallContext(options: SemanticRecallContextOptions): string {
  const {
    userText,
    intentMode,
    expertDomain,
    currentSessionId,
    activeNotebookId,
    sessions = [],
    notebooks = [],
    memoryVault,
  } = options;

  if (!userText || typeof userText !== 'string') return '';

  const trimmed = userText.trim();
  const hasCue = hasTemporalRecallCue(trimmed);

  // Rào chắn tốc độ & chống nhiễu:
  // Trả về "" ngay (0ms) nếu là STOP_SIGNAL hoặc PING, hoặc câu quá ngắn (< 6 ký tự) và không có tín hiệu thời gian
  if (intentMode === 'STOP_SIGNAL' || intentMode === 'PING') {
    return '';
  }
  if (trimmed.length < 6 && !hasCue) {
    return '';
  }

  const isJarvisLab =
    intentMode === 'EXPERT_JARVIS' ||
    Boolean(expertDomain && expertDomain !== 'GENERAL' && expertDomain !== 'CASUAL');

  const searchResults = searchLocalSemanticRecall(trimmed, {
    currentSessionId,
    activeNotebookId,
    notebooks,
    isJarvisLab,
    limit: 3,
    minScore: hasCue ? 0.45 : 1.1,
    sessions,
    memoryVault,
  });

  if (searchResults.length === 0) {
    // Nếu người dùng chủ động hỏi chuyện cũ nhưng không tìm thấy -> báo NONE_FOUND để AI thành thật
    if (hasCue) {
      return '[RECALL_MEMORY: NONE_FOUND]';
    }
    return '';
  }

  // Đóng gói tối đa 3 kết quả
  const parts: string[] = [];
  for (let i = 0; i < searchResults.length; i++) {
    const r = searchResults[i];
    const c = r.chunk;
    const nbLabel = c.sourceType === 'memory_vault' ? 'Vault' : (c.notebookName || 'Ghi chú chung');
    const relTime = formatRelativeTime(c.timestamp);
    const title = c.sessionTitle.replace(/["\r\n]/g, '').slice(0, 30);
    const snippet = c.snippet.replace(/[\r\n]+/g, ' ').slice(0, 100);

    parts.push(`(${i + 1}) [${nbLabel} • ${relTime} trước • "${title}"] ${snippet}`);
  }

  let fullCard = `[RECALL_MEMORY: ${parts.join(' | ')}]`;

  // KHÓA CỨNG NGÂN SÁCH KÝ TỰ: Luôn <= 520 ký tự
  if (fullCard.length > 520) {
    fullCard = fullCard.slice(0, 516) + '...]';
  }

  return fullCard;
}
