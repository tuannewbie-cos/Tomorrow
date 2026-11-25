/**
 * TOMORROW V4.10 — SERVICES/PROACTIVE_GREETING_SERVICE.TS
 * ĐỘNG CƠ CHÀO CHỦ ĐỘNG CỤC BỘ (< 2ms, 0 TOKEN API)
 *
 * Tổng hợp 4 nguồn tín hiệu thực hoàn toàn trên thiết bị:
 * 1. Đồng hồ sinh học (buildChronoContext) — rào chắn tuyệt đối ban ngày không nhắc thức khuya.
 * 2. Quét phiên học/làm việc dang dở trong 72h (findResumableSession), ưu tiên Sổ ghi chú đang mở & lọc rác.
 * 3. Kho trí nhớ đa chiều USER_MEMORY_PROFILE_V1 (moodHistory, studySubjects, activeProjects, financeGoals).
 * 4. Cơ chế Đồng cảm Ưu tiên (Empathy Override) khi mood gần nhất trong 24h là buồn ngầm / tụt mood / quá tải.
 */

import {
  ChatSession,
  MoodEntry,
  StructuredMemoryVault,
  StudySubject,
  UserMemoryProfile,
  UserMemoryVault,
} from '../types/chat';
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';
import { DEFAULT_NOTEBOOK_ID } from '../storage/notebookStorage';
import { migrateAndNormalizeVault } from './memoryVaultService';
import { buildChronoContext, ChronoContext, CircadianPeriod } from './chronoService';

export type ProactiveTone = 'SHARP_LAB' | 'WARM_GENTLE' | 'CASUAL_CRISP' | 'LATE_NIGHT_CALM';

export interface ProactiveGreetingPayload {
  headline: string;           // 1 dòng chính gọn sắc (<= 58 ký tự)
  subline: string;            // 1 dòng phụ tinh tế gợi mở tiếp nối (<= 96 ký tự)
  actionLabel?: string;       // Nhãn hành động siêu gọn nếu có phiên dang dở (VD: "Tiếp tục ↗")
  targetSessionId?: string;   // ID phiên học/làm việc dang dở để mở lại bằng 1 chạm
  contextTag: string;         // Chuỗi siêu gọn <= 180 ký tự dùng cho First-Turn Bridge
  tone: ProactiveTone;
  period: string;             // Khung giờ từ buildChronoContext
}

export interface GenerateProactiveGreetingInput {
  sessions?: ChatSession[];
  activeNotebookId?: string;
  memoryVault?: StructuredMemoryVault | UserMemoryVault | UserMemoryProfile | null;
  now?: Date;
}

export interface ResumableSessionMatch {
  session: ChatSession;
  inActiveNotebook: boolean;
  topic: string;
  relativeTime: string;
  isUnfinished: boolean;
  isTechnical: boolean;
  score: number;
}

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const PERIOD_INDEX: Record<CircadianPeriod, number> = {
  EARLY_MORNING: 0,
  MORNING: 1,
  NOON: 2,
  AFTERNOON: 3,
  EVENING: 4,
  LATE_NIGHT: 5,
};

const STANDARD_HEADLINES: Record<CircadianPeriod, string[]> = {
  EARLY_MORNING: [
    'Sáng sớm tinh mơ.',
    'Khởi động sớm nhé.',
    'Buổi sáng sớm gọn nhẹ.',
  ],
  MORNING: [
    'Buổi sáng tốt lành.',
    'Sáng nay xử lý gì trước?',
    'Chào buổi sáng — bắt nhịp thôi.',
  ],
  NOON: [
    'Nghỉ trưa hay làm tiếp?',
    'Giữa trưa giữ nhịp gọn.',
    'Buổi trưa tỉnh táo nhé.',
  ],
  AFTERNOON: [
    'Vào guồng buổi chiều.',
    'Chiều nay tập trung mảng nào?',
    'Buổi chiều hiệu quả nhé.',
  ],
  EVENING: [
    'Tối nay xử lý tiếp gì nào?',
    'Buổi tối gọn việc nhé.',
    'Suy nghĩ buổi tối.',
  ],
  LATE_NIGHT: [
    'Khuya rồi — chạy gọn rồi nghỉ.',
    'Đêm tĩnh — xử lý gọn một nhịp.',
    'Tĩnh lặng đêm khuya.',
  ],
};

const GENTLE_HEADLINES: Record<CircadianPeriod, string[]> = {
  EARLY_MORNING: [
    'Sáng sớm rồi — cứ đi từng nhịp nhẹ thôi.',
    'Sáng nay không cần vội, cứ chậm rãi nhé.',
  ],
  MORNING: [
    'Chào buổi sáng — hôm nay cứ đi từng nhịp nhẹ thôi.',
    'Sáng nay cứ thong thả, từng bước một thôi.',
  ],
  NOON: [
    'Giữa trưa rồi — nghỉ chút, đi từng nhịp nhẹ thôi.',
    'Trưa nay cứ nhẹ nhàng, không cần gồng đâu.',
  ],
  AFTERNOON: [
    'Chiều nay cứ đi từng nhịp nhẹ thôi.',
    'Buổi chiều thoáng hơn chút nhé — không cần vội.',
  ],
  EVENING: [
    'Tối nay thả lỏng một chút — đi từng nhịp nhẹ thôi.',
    'Buổi tối rồi — cứ nói chuyện nhẹ nhàng nhé.',
  ],
  LATE_NIGHT: [
    'Đêm yên rồi — thả lỏng một nhịp rồi nghỉ nhé.',
    'Khuya rồi — cần xả nhẹ điều gì cứ nhắn.',
  ],
};

function truncateChars(text: string, maxLen: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  if (maxLen <= 3) return clean.slice(0, maxLen);
  const sliced = clean.slice(0, maxLen - 3).trimEnd();
  return `${sliced}...`;
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / TWENTY_FOUR_HOURS_MS));
}

function formatGreetingRelativeTime(updatedAt: number, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - updatedAt);
  const diffMins = Math.floor(diffMs / (60 * 1000));
  if (diffMins < 5) return 'vừa xong';
  if (diffMins < 60) return `${diffMins}m trước`;
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) return `${diffHours}h trước`;
  const diffDays = Math.floor(diffMs / TWENTY_FOUR_HOURS_MS);
  return `${diffDays}d trước`;
}

const TECHNICAL_SIGNAL_REGEX =
  /(\?|code|bug|lỗi|fix|tích phân|đạo hàm|giải tích|đại số|ma trận|vật lý|hóa|mạch|led|c\+\+|cpp|python|typescript|javascript|react|sql|api|tài chính|đầu tư|etf|tiết kiệm|ngân sách|hàm|thuật toán|oop|con trỏ)/i;

/**
 * Tín hiệu 2 — Quét phiên học/làm việc dang dở trong vòng 72 giờ
 * Bỏ qua hoàn toàn các phiên < 2 tin nhắn hoặc tiêu đề rác (isPlaceholderOrNoiseTitle).
 */
export function findResumableSession(
  sessions: ChatSession[] = [],
  activeNotebookId?: string,
  now: Date = new Date()
): ResumableSessionMatch | null {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const nowMs = now.getTime();
  const targetNb = activeNotebookId || DEFAULT_NOTEBOOK_ID;
  let bestMatch: ResumableSessionMatch | null = null;

  for (const session of sessions) {
    if (!session || !Array.isArray(session.messages) || session.messages.length < 2) {
      continue;
    }
    if (isPlaceholderOrNoiseTitle(session.title)) {
      continue;
    }
    const updatedAt = typeof session.updatedAt === 'number' ? session.updatedAt : 0;
    if (!updatedAt || nowMs - updatedAt > SEVENTY_TWO_HOURS_MS) {
      continue;
    }

    const ageMs = Math.max(0, nowMs - updatedAt);
    const ageHours = ageMs / (60 * 60 * 1000);
    const sessionNb = session.notebookId || DEFAULT_NOTEBOOK_ID;
    const inActiveNotebook = sessionNb === targetNb;

    const userMessages = session.messages.filter(
      (m) => m && (m.role === 'user' || m.sender === 'user')
    );
    const lastUserText = (userMessages[userMessages.length - 1]?.text || '').trim();
    const isTechnical =
      TECHNICAL_SIGNAL_REGEX.test(lastUserText) ||
      TECHNICAL_SIGNAL_REGEX.test(session.title || '') ||
      session.lastIntent === 'work_assist';

    const isUnfinished =
      ageHours <= 24 ||
      lastUserText.includes('?') ||
      TECHNICAL_SIGNAL_REGEX.test(lastUserText);

    // Chấm điểm ưu tiên: Sổ đang active (+100), tín hiệu dang dở (+25), độ tươi mới (0..40)
    const recencyScore = ageHours <= 24 ? 40 : ageHours <= 48 ? 20 : 10;
    const fineRecency = 10 / (1 + ageHours);
    const score =
      (inActiveNotebook ? 100 : 0) +
      (isUnfinished ? 25 : 0) +
      recencyScore +
      fineRecency;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        session,
        inActiveNotebook,
        topic: truncateChars(session.title.trim(), 42),
        relativeTime: formatGreetingRelativeTime(updatedAt, nowMs),
        isUnfinished,
        isTechnical,
        score,
      };
    }
  }

  return bestMatch;
}

/**
 * Kiểm tra xem mốc tâm trạng có thuộc 24h gần nhất và là nhóm cần Đồng cảm Ưu tiên không
 */
function detectRecentLowMoodEntry(
  moodHistory: MoodEntry[] = [],
  now: Date
): MoodEntry | null {
  if (!Array.isArray(moodHistory) || moodHistory.length === 0) return null;

  const nowMs = now.getTime();
  const isWithin24h = (dateStr?: string): boolean => {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const clean = dateStr.trim();

    // Dạng DD/MM/YYYY
    const vnMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vnMatch) {
      const day = Number(vnMatch[1]);
      const month = Number(vnMatch[2]) - 1;
      const year = Number(vnMatch[3]);
      const entryDate = new Date(year, month, day);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = (todayStart.getTime() - entryDate.getTime()) / TWENTY_FOUR_HOURS_MS;
      return diffDays >= -0.5 && diffDays <= 1;
    }

    // Dạng ISO hoặc timestamp parseable
    const parsed = Date.parse(clean);
    if (!isNaN(parsed)) {
      const diffMs = nowMs - parsed;
      return diffMs >= -3600_000 && diffMs <= TWENTY_FOUR_HOURS_MS;
    }

    return false;
  };

  for (const entry of moodHistory) {
    if (!entry) continue;
    if (!isWithin24h(entry.date)) continue;

    const rawMood = `${entry.mood || ''} ${entry.note || ''}`.toUpperCase();
    const lowerMood = `${entry.mood || ''} ${entry.note || ''}`.toLowerCase();

    const isLowOrDistressed =
      rawMood.includes('MASKED_SADNESS') ||
      rawMood.includes('LOW_DOWN_DEFLATED') ||
      rawMood.includes('STRESSED_OVERWHELMED') ||
      lowerMood.includes('buồn') ||
      lowerMood.includes('tụt mood') ||
      lowerMood.includes('chán nản') ||
      lowerMood.includes('quá tải') ||
      lowerMood.includes('áp lực') ||
      lowerMood.includes('mệt mỏi');

    if (isLowOrDistressed) {
      return entry;
    }
  }

  return null;
}

function pickPrioritizedSubject(subjects: StudySubject[] = []): StudySubject | null {
  if (!Array.isArray(subjects) || subjects.length === 0) return null;
  return (
    subjects.find((s) => s.level === 'weak' && s.focusTopic) ||
    subjects.find((s) => s.level === 'weak') ||
    subjects.find((s) => s.level === 'learning' && s.focusTopic) ||
    subjects.find((s) => s.level === 'learning') ||
    subjects[0]
  );
}

function sanitizeDaytimeText(text: string, period: CircadianPeriod): string {
  if (period === 'LATE_NIGHT') return text;
  // Rào chắn an toàn kép: tuyệt đối không để lọt từ ngữ thức khuya vào ban ngày
  return text
    .replace(/thức khuya|thức đêm|đêm muộn|ngủ đi|khuya rồi/gi, 'giữ nhịp')
    .trim();
}

/**
 * Hàm chính sinh lời chào chủ động 100% cục bộ (< 2ms, 0 token API)
 */
export function generateProactiveGreeting(
  input: GenerateProactiveGreetingInput = {}
): ProactiveGreetingPayload {
  const {
    sessions = [],
    activeNotebookId = DEFAULT_NOTEBOOK_ID,
    memoryVault,
    now = new Date(),
  } = input;

  const chrono: ChronoContext = buildChronoContext(now);
  const period = chrono.period;
  const variantSeed = getDayOfYear(now) + PERIOD_INDEX[period];

  const normalizedVault: StructuredMemoryVault = migrateAndNormalizeVault(memoryVault, chrono);

  // Tín hiệu 2: Tìm phiên dang dở (ưu tiên sổ đang active)
  const resumable = findResumableSession(sessions, activeNotebookId, now);
  const activeNotebookMatch = resumable && resumable.inActiveNotebook ? resumable : null;

  // Tín hiệu 3 & 4: Kiểm tra Empathy Override từ moodHistory trong 24h
  const lowMood = detectRecentLowMoodEntry(normalizedVault.moodHistory, now);

  if (lowMood) {
    const gentlePool = GENTLE_HEADLINES[period];
    const rawHeadline = gentlePool[variantSeed % gentlePool.length];
    const headline = truncateChars(sanitizeDaytimeText(rawHeadline, period), 58);
    const subline = truncateChars(
      sanitizeDaytimeText(
        'Cần gỡ rối việc gì hay chỉ muốn nói chuyện ngắn đều được.',
        period
      ),
      96
    );
    const target = activeNotebookMatch || resumable;
    const contextTag = truncateChars(
      `period=${period}; tone=WARM_GENTLE; mood=empathy_priority${
        target ? `; recent="${target.topic}"` : ''
      }`,
      180
    );

    return {
      headline,
      subline,
      actionLabel: target ? 'Mở lại ↗' : undefined,
      targetSessionId: target ? target.session.id : undefined,
      contextTag,
      tone: 'WARM_GENTLE',
      period,
    };
  }

  // Ma trận Headline tiêu chuẩn theo 6 khung giờ (xoay deterministic theo dayOfYear + period)
  const headlinePool = STANDARD_HEADLINES[period];
  const rawHeadline = headlinePool[variantSeed % headlinePool.length];
  const headline = truncateChars(sanitizeDaytimeText(rawHeadline, period), 58);

  // Ưu tiên B: Có phiên dang dở trong Sổ đang active
  if (activeNotebookMatch) {
    const tone: ProactiveTone =
      period === 'LATE_NIGHT'
        ? 'LATE_NIGHT_CALM'
        : activeNotebookMatch.isTechnical
        ? 'SHARP_LAB'
        : 'CASUAL_CRISP';

    const prefix = `Đang dở ${activeNotebookMatch.relativeTime}: `;
    const maxTopicFit = Math.max(16, 96 - prefix.length);
    const topicText = truncateChars(activeNotebookMatch.topic, maxTopicFit);
    const subline = truncateChars(
      sanitizeDaytimeText(`${prefix}${topicText}`, period),
      96
    );
    const contextTag = truncateChars(
      `period=${period}; tone=${tone}; resumable="${activeNotebookMatch.topic}" (${activeNotebookMatch.relativeTime})`,
      180
    );

    return {
      headline,
      subline,
      actionLabel: 'Tiếp tục ↗',
      targetSessionId: activeNotebookMatch.session.id,
      contextTag,
      tone,
      period,
    };
  }

  // Ưu tiên C: Chưa có phiên gần đây trong Sổ nhưng có studySubjects / activeProjects / financeGoals
  const topSubject = pickPrioritizedSubject(normalizedVault.studySubjects);
  const topProject = normalizedVault.activeProjects?.[0];
  const topFinance = normalizedVault.financeGoals?.[0];

  if (topSubject) {
    const tone: ProactiveTone = period === 'LATE_NIGHT' ? 'LATE_NIGHT_CALM' : 'SHARP_LAB';
    const focusDetail = topSubject.focusTopic ? ` (${topSubject.focusTopic})` : '';
    const subline = truncateChars(
      sanitizeDaytimeText(`Trọng tâm đang mở: ${topSubject.subject}${focusDetail}.`, period),
      96
    );
    const contextTag = truncateChars(
      `period=${period}; tone=${tone}; study="${topSubject.subject}${focusDetail}" (${topSubject.level})`,
      180
    );

    return {
      headline,
      subline,
      contextTag,
      tone,
      period,
    };
  }

  if (topProject) {
    const tone: ProactiveTone = period === 'LATE_NIGHT' ? 'LATE_NIGHT_CALM' : 'SHARP_LAB';
    const subline = truncateChars(
      sanitizeDaytimeText(`Dự án đang chạy: ${topProject}.`, period),
      96
    );
    const contextTag = truncateChars(
      `period=${period}; tone=${tone}; project="${truncateChars(topProject, 80)}"`,
      180
    );

    return {
      headline,
      subline,
      contextTag,
      tone,
      period,
    };
  }

  if (topFinance) {
    const tone: ProactiveTone = period === 'LATE_NIGHT' ? 'LATE_NIGHT_CALM' : 'SHARP_LAB';
    const amt = topFinance.targetAmount ? ` (${topFinance.targetAmount})` : '';
    const subline = truncateChars(
      sanitizeDaytimeText(`Mục tiêu đang theo dõi: ${topFinance.goal}${amt}.`, period),
      96
    );
    const contextTag = truncateChars(
      `period=${period}; tone=${tone}; finance="${topFinance.goal}${amt}"`,
      180
    );

    return {
      headline,
      subline,
      contextTag,
      tone,
      period,
    };
  }

  // Fallback nhẹ nếu Sổ đang active trống nhưng có phiên gần đây ở sổ khác
  if (resumable) {
    const tone: ProactiveTone =
      period === 'LATE_NIGHT'
        ? 'LATE_NIGHT_CALM'
        : resumable.isTechnical
        ? 'SHARP_LAB'
        : 'CASUAL_CRISP';
    const prefix = `Mạch gần đây (${resumable.relativeTime}): `;
    const maxTopicFit = Math.max(16, 96 - prefix.length);
    const subline = truncateChars(
      sanitizeDaytimeText(`${prefix}${truncateChars(resumable.topic, maxTopicFit)}`, period),
      96
    );
    const contextTag = truncateChars(
      `period=${period}; tone=${tone}; global_resumable="${resumable.topic}" (${resumable.relativeTime})`,
      180
    );

    return {
      headline,
      subline,
      actionLabel: 'Tiếp tục ↗',
      targetSessionId: resumable.session.id,
      contextTag,
      tone,
      period,
    };
  }

  // Ưu tiên D: Người dùng mới tinh / Kho trống
  const defaultTone: ProactiveTone =
    period === 'LATE_NIGHT' ? 'LATE_NIGHT_CALM' : 'CASUAL_CRISP';
  const defaultSublines = [
    'Sẵn sàng cho code, STEM, tài chính hoặc một cuộc trò chuyện nhanh.',
    'Code, toán lý, phân tích nhanh hay chuyện phiếm — cứ bắt đầu.',
  ];
  const subline = truncateChars(
    sanitizeDaytimeText(defaultSublines[variantSeed % defaultSublines.length], period),
    96
  );
  const contextTag = truncateChars(
    `period=${period}; tone=${defaultTone}; fresh_workspace`,
    180
  );

  return {
    headline,
    subline,
    contextTag,
    tone: defaultTone,
    period,
  };
}
