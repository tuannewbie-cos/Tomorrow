/**
 * TOMORROW V4.7 — SERVICES/MEMORY_VAULT_SERVICE.TS
 * HỒ SƠ TRI THỨC ĐA CHIỀU (STRUCTURED KNOWLEDGE VAULT — SCHEMA VERSION 2)
 * 
 * Vận hành 100% cục bộ (< 1ms), quản lý tập trung đọc/ghi/nâng cấp trên khóa USER_MEMORY_PROFILE_V1:
 * 1. Schema v2 đa chiều: studySubjects, financeGoals, moodHistory, favorites, activeProjects, habits, recentContext.
 * 2. migrateAndNormalizeVault: Tương thích ngược 100% với dữ liệu v3.8-v4.6, bảo tồn bộ lọc Ngày 8.
 * 3. mergeMemoryIntoVault: Bộ phân loại & gộp trùng cục bộ (< 1ms) cho môn học, tài chính, thói quen và tâm lý.
 * 4. buildMemoryContextSlice: Bơm trí nhớ chọn lọc theo ngữ cảnh, 0 token cho STOP/PING, <= 480 ký tự.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StructuredMemoryVault,
  StudySubject,
  FinanceGoal,
  MoodEntry,
  UserMemoryProfile,
} from '../types/chat';
import { MicroPsychProfile } from './microPsychProfiler';

export const VAULT_STORAGE_KEY = 'USER_MEMORY_PROFILE_V1';

export const EMPTY_STRUCTURED_VAULT: StructuredMemoryVault = {
  schemaVersion: 2,
  pronouns: 'bạn bè tự nhiên',
  favorites: [],
  activeProjects: [],
  habits: [],
  recentContext: [],
  studySubjects: [],
  financeGoals: [],
  moodHistory: [],
  updatedAt: Date.now(),
};

export const DEFAULT_STRUCTURED_VAULT: StructuredMemoryVault = {
  schemaVersion: 2,
  pronouns: 'bạn bè tự nhiên',
  favorites: ['Fan cứng Cristiano Ronaldo (CR7)', 'Thích giao diện Dark Mode macOS'],
  activeProjects: ['Đang phát triển siêu trợ lý Tomorrow (React Native + Vercel)'],
  habits: ['Làm việc tập trung', 'Ghét chatbot hỏi vặn khi nhắn okk/sybau'],
  recentContext: ['Bắt đầu phiên trò chuyện mới cùng Tomorrow'],
  studySubjects: [],
  financeGoals: [],
  moodHistory: [],
  updatedAt: Date.now(),
};

export interface MemoryPayload {
  memory_note?: string;
  memoryNote?: string;
  memory_update?: {
    category?: string;
    text?: string;
    subject?: string;
    level?: 'strong' | 'weak' | 'learning';
    focusTopic?: string;
    goal?: string;
    targetAmount?: string;
    horizon?: 'short' | 'mid' | 'long';
    note?: string;
  };
  userMessage?: string;
  userText?: string;
}

export interface MemorySliceOptions {
  persona?: 'COMPANION_MIRROR' | 'JARVIS_LAB' | string;
  intentMode?: string;
  domain?: string;
  userText?: string;
}

/**
 * 1. NÂNG CẤP VÀ CHUẨN HÓA BỘ NHỚ (migrateAndNormalizeVault):
 * - Nếu chưa có dữ liệu -> trả về vault rỗng schemaVersion: 2.
 * - Giữ nguyên 100% dữ liệu cũ (favorites, activeProjects, habits, recentContext) và bổ sung mảng đa chiều mới.
 * - Bảo tồn bộ lọc Ngày 8: Xóa ghi chú "thức khuya"/"thức đêm" lưu sai pha; dọn trạng thái nhất thời qua ngày; khóa trần số phần tử.
 */
export function migrateAndNormalizeVault(raw: any, chrono?: any): StructuredMemoryVault {
  if (!raw) {
    return {
      schemaVersion: 2,
      pronouns: 'bạn bè tự nhiên',
      favorites: [],
      activeProjects: [],
      habits: [],
      recentContext: [],
      studySubjects: [],
      financeGoals: [],
      moodHistory: [],
      updatedAt: Date.now(),
    };
  }

  let src = raw;
  if (typeof raw === 'string') {
    try {
      src = JSON.parse(raw);
    } catch {
      src = { recentContext: [raw] };
    }
  }

  // Nếu bọc trong UserMemoryProfile có trường vault
  if (src && typeof src === 'object' && src.vault) {
    const v = src.vault;
    src = {
      ...src,
      ...v,
      favorites: v.favorites || src.interests || src.favorites || [],
      activeProjects: v.activeProjects || (src.currentProject ? [src.currentProject] : []) || [],
      habits: v.habits || src.habits || [],
      recentContext: v.recentContext || src.summary || [],
      studySubjects: v.studySubjects || src.studySubjects || [],
      financeGoals: v.financeGoals || src.financeGoals || [],
      moodHistory: v.moodHistory || src.moodHistory || [],
    };
  }

  // Khôi phục đại từ
  const pronouns = src.pronouns || (src.nickname === 'm' ? 't - m' : 'bạn bè tự nhiên');

  // Khôi phục 100% favorites
  let favorites: string[] = [];
  if (Array.isArray(src.favorites)) {
    favorites = src.favorites.map(String).filter(Boolean);
  } else if (Array.isArray(src.interests)) {
    favorites = src.interests.map(String).filter(Boolean);
  }

  // Khôi phục 100% activeProjects
  let activeProjects: string[] = [];
  if (Array.isArray(src.activeProjects)) {
    activeProjects = src.activeProjects.map(String).filter(Boolean);
  } else if (src.currentProject) {
    activeProjects = [String(src.currentProject)];
  }

  // Khôi phục 100% habits
  let habits: string[] = [];
  if (Array.isArray(src.habits)) {
    habits = src.habits.map(String).filter(Boolean);
  }

  // Khôi phục 100% recentContext
  let recentContext: string[] = [];
  if (Array.isArray(src.recentContext)) {
    recentContext = src.recentContext.map(String).filter(Boolean);
  } else if (typeof src.recentContext === 'string' && src.recentContext.trim()) {
    recentContext = [src.recentContext.trim()];
  } else if (typeof src.summary === 'string' && src.summary.trim()) {
    recentContext = [src.summary.trim()];
  }

  // Khôi phục hoặc khởi tạo mới các mảng đa chiều
  let studySubjects: StudySubject[] = Array.isArray(src.studySubjects) ? [...src.studySubjects] : [];
  let financeGoals: FinanceGoal[] = Array.isArray(src.financeGoals) ? [...src.financeGoals] : [];
  let moodHistory: MoodEntry[] = Array.isArray(src.moodHistory) ? [...src.moodHistory] : [];

  // BỘ LỌC NGÀY 8: Xác định khung giờ đêm khuya (23:00 - 03:59)
  let isLateNight = false;
  let currentDate = new Date();
  if (chrono && typeof chrono === 'object') {
    if ('period' in chrono && typeof chrono.period === 'string') {
      isLateNight = chrono.period === 'LATE_NIGHT';
    } else if ('hour' in chrono && typeof chrono.hour === 'number') {
      isLateNight = chrono.hour >= 23 || chrono.hour < 4;
    }
  } else {
    const h = currentDate.getHours();
    isLateNight = h >= 23 || h < 4;
  }

  const dayStr = String(currentDate.getDate()).padStart(2, '0');
  const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
  const todayDateTag = `(${dayStr}/${monthStr})`;

  // Nếu không phải đêm khuya: loại bỏ ghi chú lệch pha về "thức khuya"/"thức đêm"
  if (!isLateNight) {
    habits = habits.filter((h) => {
      const l = h.toLowerCase();
      return !l.includes('thức khuya') && !l.includes('thức đêm');
    });
    recentContext = recentContext.filter((rc) => {
      const l = rc.toLowerCase();
      return !l.includes('thức khuya') && !l.includes('thức đêm');
    });
  }

  // Tự dọn trạng thái nhất thời qua ngày trong recentContext nếu có chỉ định chrono
  if (chrono) {
    recentContext = recentContext.filter((item) => {
      const tagMatch = item.match(/\((\d{2}\/\d{2})\)/);
      if (tagMatch && tagMatch[0] !== todayDateTag) {
        return false;
      }
      return true;
    });
  }

  // Khóa trần số lượng phần tử theo quy chuẩn Ngày 11
  return {
    schemaVersion: 2,
    pronouns,
    favorites: favorites.slice(0, 5),
    activeProjects: activeProjects.slice(0, 5),
    habits: habits.slice(0, 5),
    recentContext: recentContext.slice(0, 5),
    studySubjects: studySubjects.slice(0, 6),
    financeGoals: financeGoals.slice(0, 5),
    moodHistory: moodHistory.slice(0, 5),
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now(),
  };
}

/**
 * Danh sách mẫu nhận diện các môn học đại học phổ biến
 */
const SUBJECT_PATTERNS: { regex: RegExp; name: string }[] = [
  { regex: /\bgiải tích\s*2\b/i, name: 'Giải tích 2' },
  { regex: /\bgiải tích\s*1\b/i, name: 'Giải tích 1' },
  { regex: /\bgiải tích\s*3\b/i, name: 'Giải tích 3' },
  { regex: /\bgiải tích\b/i, name: 'Giải tích' },
  { regex: /\bđại số tuyến tính\b/i, name: 'Đại số tuyến tính' },
  { regex: /\bđại số\b/i, name: 'Đại số' },
  { regex: /\bxác suất thống kê\b|\bxác suất\b/i, name: 'Xác suất thống kê' },
  { regex: /\bvật lý đại cương\b|\bvật lý\b|\bvật lí\b/i, name: 'Vật lý' },
  { regex: /\bhóa học\b|\bhóa đại cương\b|\bhóa\b/i, name: 'Hóa học' },
  { regex: /\bsinh học\b/i, name: 'Sinh học' },
  { regex: /\bcơ học\b|\bcơ lý thuyết\b|\bsức bền vật liệu\b/i, name: 'Cơ học' },
  { regex: /\bmạch điện\b|\bkỹ thuật điện\b/i, name: 'Mạch điện' },
  { regex: /\bđiện tử cơ bản\b|\bđiện tử số\b|\bđiện tử\b/i, name: 'Điện tử' },
  { regex: /\bcấu trúc dữ liệu và giải thuật\b|\bctdl & gt\b|\bctdl và gt\b|\bctdl\b/i, name: 'Cấu trúc dữ liệu & Giải thuật' },
  { regex: /\bthuật toán\b/i, name: 'Thuật toán' },
  { regex: /\blập trình hướng đối tượng\b|\boop\b/i, name: 'OOP' },
  { regex: /\bc\+\+\b|\bcpp\b/i, name: 'C++' },
  { regex: /\bpython\b/i, name: 'Python' },
  { regex: /\bielts\b/i, name: 'IELTS' },
  { regex: /\btoeic\b/i, name: 'TOEIC' },
];

/**
 * 2. BỘ PHÂN LOẠI & GỘP TRÙNG CỤC BỘ (mergeMemoryIntoVault, < 1ms):
 * Tự động phân loại tín hiệu thành môn học (studySubjects), mục tiêu tài chính (financeGoals),
 * thần tượng/dự án/thói quen và mốc tâm lý (moodHistory) mà không tạo bản sao trùng lặp.
 */
export function mergeMemoryIntoVault(
  vault: StructuredMemoryVault,
  payload: MemoryPayload | string,
  chrono?: any,
  psychProfile?: MicroPsychProfile
): StructuredMemoryVault {
  const current = migrateAndNormalizeVault(vault, chrono);
  const updated: StructuredMemoryVault = {
    ...current,
    favorites: [...current.favorites],
    activeProjects: [...current.activeProjects],
    habits: [...current.habits],
    recentContext: [...current.recentContext],
    studySubjects: [...current.studySubjects],
    financeGoals: [...current.financeGoals],
    moodHistory: [...current.moodHistory],
    updatedAt: Date.now(),
  };

  const payloadObj: MemoryPayload =
    typeof payload === 'string'
      ? { memory_note: payload }
      : payload || {};

  const rawNote = (payloadObj.memory_note || payloadObj.memoryNote || '').trim();
  const userText = (payloadObj.userMessage || payloadObj.userText || '').trim();
  const updateObj = payloadObj.memory_update || {};

  const combined = [rawNote, updateObj.text, updateObj.subject, updateObj.goal, userText]
    .filter(Boolean)
    .join(' ');
  const lower = combined.toLowerCase();

  // Xác định ngày tháng hiện tại
  let isLateNight = false;
  let currentDate = new Date();
  if (chrono && typeof chrono === 'object') {
    if ('period' in chrono && typeof chrono.period === 'string') {
      isLateNight = chrono.period === 'LATE_NIGHT';
    } else if ('hour' in chrono && typeof chrono.hour === 'number') {
      isLateNight = chrono.hour >= 23 || chrono.hour < 4;
    }
  } else {
    const h = currentDate.getHours();
    isLateNight = h >= 23 || h < 4;
  }

  const dayStr = String(currentDate.getDate()).padStart(2, '0');
  const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
  const todayDateTag = `(${dayStr}/${monthStr})`;
  const dateStr = (chrono && typeof chrono.dateStr === 'string') ? chrono.dateStr : `${dayStr}/${monthStr}`;

  // 1. Cập nhật Pronouns
  if (['t', 'm', 'tao', 'mày', 'may'].some((w) => lower.split(/[\s,.;!?:~]+/).includes(w))) {
    updated.pronouns = 't - m';
  } else if (['anh', 'em'].some((w) => lower.split(/[\s,.;!?:~]+/).includes(w))) {
    updated.pronouns = 'anh - em';
  } else if (['tui'].some((w) => lower.split(/[\s,.;!?:~]+/).includes(w))) {
    updated.pronouns = 'tui - bạn';
  }

  // 2. Nhận diện & Upsert Môn học (studySubjects)
  let detectedSubject = updateObj.subject;
  if (!detectedSubject) {
    for (const pat of SUBJECT_PATTERNS) {
      if (pat.regex.test(combined)) {
        detectedSubject = pat.name;
        break;
      }
    }
    if (!detectedSubject) {
      const matchMon = combined.match(/\bmôn\s+([A-Za-z0-9À-ỹ\s]+?)(?=\s+(?:khó|dễ|yếu|kém|giỏi|này|quá|vãi|ơi|nhé|\.|\,|$))/i);
      if (matchMon && matchMon[1].trim().length >= 2) {
        detectedSubject = matchMon[1].trim();
      }
    }
  }

  if (detectedSubject) {
    const hasExplicitLevel =
      Boolean(updateObj.level) ||
      /yếu|kém|mất gốc|hay sai|khó hiểu|sợ môn|sợ|đuối|chưa hiểu|khó quá|không hiểu|lẹt đẹt|giỏi|mạnh|chắc|ổn|điểm cao|master|top|tự tin|chuyên/i.test(lower);

    let level: 'strong' | 'weak' | 'learning' = updateObj.level || 'learning';
    if (!updateObj.level) {
      if (/yếu|kém|mất gốc|hay sai|khó hiểu|sợ môn|sợ|đuối|chưa hiểu|khó quá|không hiểu|lẹt đẹt/i.test(lower)) {
        level = 'weak';
      } else if (/giỏi|mạnh|chắc|ổn|điểm cao|master|top|tự tin|chuyên/i.test(lower)) {
        level = 'strong';
      }
    }

    let focusTopic = updateObj.focusTopic;
    if (!focusTopic) {
      if (lower.includes('kế thừa') || lower.includes('đa hình')) focusTopic = 'Kế thừa & Đa hình';
      else if (lower.includes('tích phân')) focusTopic = 'Tích phân';
      else if (lower.includes('vi phân')) focusTopic = 'Phương trình vi phân';
      else if (lower.includes('con trỏ')) focusTopic = 'Con trỏ & Bộ nhớ';
      else if (lower.includes('ma trận')) focusTopic = 'Đại số ma trận';
      else if (lower.includes('mạch rlc') || lower.includes('định luật ohm')) focusTopic = 'Mạch RLC & Ohm';
    }

    const subIdx = updated.studySubjects.findIndex(
      (s) => s.subject.toLowerCase() === detectedSubject!.toLowerCase()
    );

    if (subIdx >= 0) {
      const existing = updated.studySubjects[subIdx];
      updated.studySubjects[subIdx] = {
        ...existing,
        level: hasExplicitLevel ? level : existing.level,
        focusTopic: focusTopic || existing.focusTopic,
        updatedAt: new Date().toISOString(),
      };
    } else {
      updated.studySubjects.unshift({
        id: `subj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        subject: detectedSubject,
        level,
        focusTopic,
        updatedAt: new Date().toISOString(),
      });
    }
    updated.studySubjects = updated.studySubjects.slice(0, 6);
  }

  // 3. Nhận diện & Upsert Mục tiêu Tài chính (financeGoals)
  const isFinanceRelated =
    /tiết kiệm|quỹ dự phòng|đầu tư|cổ phiếu|etf|vàng|gửi tiết kiệm|mục tiêu tài chính|ngân sách|để dành|triệu|tr\b|k\b|nghìn|usd|\$/i.test(lower);

  if (isFinanceRelated || updateObj.goal || updateObj.targetAmount) {
    let targetAmount = updateObj.targetAmount;
    if (!targetAmount) {
      const amtMatch = combined.match(/\d+(?:[.,]\d+)?\s*(?:tr|triệu|k|nghìn|tỷ|usd|\$)/i);
      if (amtMatch) {
        targetAmount = amtMatch[0].trim();
      }
    }

    let horizon: 'short' | 'mid' | 'long' = updateObj.horizon || 'mid';
    if (!updateObj.horizon) {
      if (/ngắn|tuần|tháng|ngay|gấp|trước mắt|1-3 tháng|vài tháng|trước tết/i.test(lower)) {
        horizon = 'short';
      } else if (/dài|năm|lâu dài|hưu|nghỉ hưu|mua nhà|mua xe|5 năm|10 năm/i.test(lower)) {
        horizon = 'long';
      }
    }

    let goal = updateObj.goal;
    if (!goal) {
      if (/quỹ dự phòng/i.test(lower)) goal = 'Xây dựng quỹ dự phòng';
      else if (/cổ phiếu/i.test(lower)) goal = 'Đầu tư cổ phiếu';
      else if (/etf/i.test(lower)) goal = 'Đầu tư chứng chỉ quỹ ETF';
      else if (/vàng/i.test(lower)) goal = 'Tích lũy vàng';
      else if (/tiết kiệm|để dành/i.test(lower)) {
        goal = targetAmount ? `Tiết kiệm ${targetAmount}` : 'Tiết kiệm tài chính';
      }
    }

    if (goal || targetAmount) {
      const finalGoal = goal || (targetAmount ? `Mục tiêu tài chính ${targetAmount}` : 'Mục tiêu tài chính');
      const finIdx = updated.financeGoals.findIndex((f) => {
        const fg = f.goal.toLowerCase();
        const g = finalGoal.toLowerCase();
        if (fg === g) return true;
        if (g.includes('tiết kiệm') && fg.includes('tiết kiệm')) return true;
        if (g.includes('dự phòng') && fg.includes('dự phòng')) return true;
        if (g.includes('cổ phiếu') && fg.includes('cổ phiếu')) return true;
        if (g.includes('vàng') && fg.includes('vàng')) return true;
        if (g.includes('etf') && fg.includes('etf')) return true;
        return false;
      });

      if (finIdx >= 0) {
        updated.financeGoals[finIdx] = {
          ...updated.financeGoals[finIdx],
          goal: finalGoal,
          targetAmount: targetAmount || updated.financeGoals[finIdx].targetAmount,
          horizon: horizon || updated.financeGoals[finIdx].horizon,
          note: updateObj.note || updated.financeGoals[finIdx].note,
          updatedAt: new Date().toISOString(),
        };
      } else {
        updated.financeGoals.unshift({
          id: `fin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          goal: finalGoal,
          targetAmount,
          horizon,
          note: updateObj.note,
          updatedAt: new Date().toISOString(),
        });
      }
      updated.financeGoals = updated.financeGoals.slice(0, 5);
    }
  }

  // 4. Cập nhật Thần tượng / Sở thích (favorites)
  if (lower.includes('ronaldo') || lower.includes('cr7')) {
    if (!updated.favorites.some((f) => f.toLowerCase().includes('ronaldo'))) {
      updated.favorites.unshift('Fan cứng Cristiano Ronaldo (CR7)');
    }
  } else if (lower.includes('messi') || lower.includes('m10')) {
    if (!updated.favorites.some((f) => f.toLowerCase().includes('messi'))) {
      updated.favorites.unshift('Fan Lionel Messi (M10)');
    }
  } else if (rawNote && (rawNote.toLowerCase().includes('thích') || rawNote.toLowerCase().includes('fan') || rawNote.toLowerCase().includes('mê'))) {
    if (!updated.favorites.includes(rawNote)) {
      updated.favorites.unshift(rawNote);
    }
  }

  // 5. Cập nhật Dự án (activeProjects)
  if (lower.includes('tomorrow')) {
    if (!updated.activeProjects.some((p) => p.toLowerCase().includes('tomorrow'))) {
      updated.activeProjects.unshift('Đang phát triển siêu trợ lý Tomorrow (React Native + Vercel)');
    }
  }
  if (lower.includes('sub-agent') || lower.includes('sub agent')) {
    if (!updated.activeProjects.some((p) => p.toLowerCase().includes('sub-agent'))) {
      updated.activeProjects.unshift('Đang nghiên cứu và tối ưu hệ thống Sub-Agent AI');
    }
  }
  if (rawNote && (rawNote.toLowerCase().includes('dự án') || rawNote.toLowerCase().includes('làm web') || rawNote.toLowerCase().includes('làm app'))) {
    if (!updated.activeProjects.includes(rawNote)) {
      updated.activeProjects.unshift(rawNote);
    }
  }

  // 6. Cập nhật Thói quen (habits)
  if (rawNote && (rawNote.toLowerCase().includes('thói quen') || rawNote.toLowerCase().includes('hay') || rawNote.toLowerCase().includes('ghét'))) {
    const isLateNightNote = rawNote.toLowerCase().includes('thức khuya') || rawNote.toLowerCase().includes('thức đêm');
    if (!isLateNightNote || isLateNight) {
      if (!updated.habits.includes(rawNote)) {
        updated.habits.unshift(rawNote);
      }
    }
  }

  // 7. Cập nhật Ngữ cảnh gần đây (recentContext kèm hậu tố DD/MM)
  if (rawNote && !detectedSubject && !isFinanceRelated && rawNote.length > 3) {
    const isLateNightNote = rawNote.toLowerCase().includes('thức khuya') || rawNote.toLowerCase().includes('thức đêm');
    if (!isLateNightNote || isLateNight) {
      const taggedNote = rawNote.includes('(') ? rawNote : `${rawNote} ${todayDateTag}`;
      updated.recentContext = [taggedNote, ...updated.recentContext.filter((c) => c !== taggedNote)].slice(0, 5);
    }
  } else if (userText && userText.length > 8 && !/^(hello|hi|yo|ê|alo|hú|okk*|sybau)/i.test(userText)) {
    const isLateNightMsg = userText.toLowerCase().includes('thức khuya') || userText.toLowerCase().includes('thức đêm');
    if (!isLateNightMsg || isLateNight) {
      const snippet = userText.slice(0, 55).trim();
      const taggedSnippet = `${snippet} ${todayDateTag}`;
      if (!updated.recentContext.some((c) => c.startsWith(snippet))) {
        updated.recentContext = [taggedSnippet, ...updated.recentContext].slice(0, 5);
      }
    }
  }

  // 8. Cập nhật Mốc Tâm lý (moodHistory) khi phát hiện trạng thái mạnh
  if (psychProfile && psychProfile.psychState) {
    const strongStates: Record<string, string> = {
      STRESSED_OVERWHELMED: 'Áp lực / Quá tải',
      MASKED_SADNESS: 'Buồn bã ngầm',
      EXCITED_HYPED: 'Hào hứng / Phấn khích',
      VULNERABLE: 'Mệt mỏi / Dễ tổn thương',
    };
    const moodLabel = strongStates[psychProfile.psychState];
    if (moodLabel) {
      const existingMoodIdx = updated.moodHistory.findIndex((m) => m.date === dateStr);
      const note = userText ? userText.slice(0, 60) : undefined;
      if (existingMoodIdx >= 0) {
        updated.moodHistory[existingMoodIdx] = { date: dateStr, mood: moodLabel, note };
      } else {
        updated.moodHistory.unshift({ date: dateStr, mood: moodLabel, note });
      }
      updated.moodHistory = updated.moodHistory.slice(0, 5);
    }
  }

  // Dọn dẹp lệch pha Ngày 8
  if (!isLateNight) {
    updated.habits = updated.habits.filter((h) => {
      const l = h.toLowerCase();
      return !l.includes('thức khuya') && !l.includes('thức đêm');
    });
    updated.recentContext = updated.recentContext.filter((rc) => {
      const l = rc.toLowerCase();
      return !l.includes('thức khuya') && !l.includes('thức đêm');
    });
  }

  // Khóa trần mọi mảng
  updated.favorites = updated.favorites.slice(0, 5);
  updated.activeProjects = updated.activeProjects.slice(0, 5);
  updated.habits = updated.habits.slice(0, 5);
  updated.recentContext = updated.recentContext.slice(0, 5);
  updated.studySubjects = updated.studySubjects.slice(0, 6);
  updated.financeGoals = updated.financeGoals.slice(0, 5);
  updated.moodHistory = updated.moodHistory.slice(0, 5);

  return updated;
}

/**
 * 3. BƠM TRÍ NHỚ CHỌN LỌC THEO NGỮ CẢNH (buildMemoryContextSlice):
 * - STOP_SIGNAL hoặc PING: trả về "" (0 token trí nhớ).
 * - JARVIS_LAB + STEM/Code/Vision: ưu tiên bơm studySubjects + activeProjects.
 * - JARVIS_LAB + FINANCE_QUANT: ưu tiên bơm financeGoals + activeProjects.
 * - COMPANION_MIRROR: bơm favorites, activeProjects, habits, recentContext và 2 mốc moodHistory.
 * - Giới hạn cứng: Kết quả thẻ [MEMORY_VAULT: ...] luôn <= 480 ký tự.
 */
export function buildMemoryContextSlice(
  vault: StructuredMemoryVault,
  options: MemorySliceOptions = {}
): string {
  const { persona, intentMode, domain, userText = '' } = options;

  // 1. Nếu là tín hiệu dừng hoặc chào ngắn: tiết kiệm 100% quota bộ nhớ
  if (intentMode === 'STOP_SIGNAL' || intentMode === 'PING') {
    return '';
  }

  if (!vault) return '';

  const isStemOrVision =
    domain === 'VISION_LAB' ||
    (typeof domain === 'string' && (domain.startsWith('STEM_') || domain === 'CODE_CS'));
  const isFinance = domain === 'FINANCE_QUANT';
  const isJarvis = persona === 'JARVIS_LAB' || isStemOrVision || isFinance;

  let sliceContent = '';

  if (isJarvis && isStemOrVision) {
    // Ưu tiên Môn học + Dự án
    const parts: string[] = [];
    if (vault.studySubjects && vault.studySubjects.length > 0) {
      const subjStr = vault.studySubjects
        .slice(0, 4)
        .map((s) => `${s.subject} (${s.level}${s.focusTopic ? `: ${s.focusTopic}` : ''})`)
        .join(', ');
      parts.push(`Môn học: ${subjStr}`);
    }
    if (vault.activeProjects && vault.activeProjects.length > 0) {
      parts.push(`Dự án: ${vault.activeProjects.slice(0, 2).join(', ')}`);
    }
    sliceContent = parts.join(' | ');
  } else if (isJarvis && isFinance) {
    // Ưu tiên Mục tiêu tài chính + Dự án
    const parts: string[] = [];
    if (vault.financeGoals && vault.financeGoals.length > 0) {
      const finStr = vault.financeGoals
        .slice(0, 3)
        .map((f) => `${f.goal}${f.targetAmount ? ` (${f.targetAmount}, ${f.horizon})` : ` (${f.horizon})`}`)
        .join(', ');
      parts.push(`Mục tiêu tài chính: ${finStr}`);
    }
    if (vault.activeProjects && vault.activeProjects.length > 0) {
      parts.push(`Dự án: ${vault.activeProjects.slice(0, 2).join(', ')}`);
    }
    sliceContent = parts.join(' | ');
  } else {
    // COMPANION_MIRROR hoặc hội thoại bạn bè thông thường
    const parts: string[] = [];
    if (vault.favorites && vault.favorites.length > 0) {
      parts.push(`Sở thích: ${vault.favorites.slice(0, 3).join(', ')}`);
    }
    if (vault.activeProjects && vault.activeProjects.length > 0) {
      parts.push(`Dự án: ${vault.activeProjects.slice(0, 2).join(', ')}`);
    }
    if (vault.habits && vault.habits.length > 0) {
      parts.push(`Thói quen: ${vault.habits.slice(0, 2).join(', ')}`);
    }
    if (vault.recentContext && vault.recentContext.length > 0) {
      parts.push(`Gần đây: ${vault.recentContext.slice(0, 2).join('; ')}`);
    }
    if (vault.moodHistory && vault.moodHistory.length > 0) {
      const recentMoods = vault.moodHistory
        .slice(0, 2)
        .map((m) => `${m.date}: ${m.mood}`)
        .join(', ');
      parts.push(`Tâm lý gần đây: ${recentMoods}`);
    }

    // Đính kèm lát cắt môn học hoặc tài chính nếu câu hỏi của user nhắc tới
    const lowerUser = userText.toLowerCase();
    if (
      vault.studySubjects &&
      vault.studySubjects.length > 0 &&
      (lowerUser.includes('học') || lowerUser.includes('môn') || lowerUser.includes('thi'))
    ) {
      const matchSub = vault.studySubjects[0];
      parts.push(`Môn: ${matchSub.subject} (${matchSub.level})`);
    }
    if (
      vault.financeGoals &&
      vault.financeGoals.length > 0 &&
      (lowerUser.includes('tiền') || lowerUser.includes('tiết kiệm') || lowerUser.includes('chi tiêu'))
    ) {
      const matchFin = vault.financeGoals[0];
      parts.push(`Tài chính: ${matchFin.goal}`);
    }

    sliceContent = parts.join(' | ');
  }

  if (!sliceContent.trim()) {
    return '';
  }

  let fullSlice = `[MEMORY_VAULT: ${sliceContent.trim()}]`;

  // GIỚI HẠN CỨNG: Thẻ [MEMORY_VAULT: ...] luôn <= 480 ký tự
  if (fullSlice.length > 480) {
    fullSlice = fullSlice.slice(0, 476) + '...]';
  }

  return fullSlice;
}

/**
 * 4. TẢI VÀ LƯU VAULT TRỰC TIẾP VÀO ASYNCSTORAGE (USER_MEMORY_PROFILE_V1)
 */
export async function loadStructuredVault(chrono?: any): Promise<StructuredMemoryVault> {
  try {
    const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
    return migrateAndNormalizeVault(raw, chrono);
  } catch (err) {
    console.error('[MemoryVaultService] Lỗi khi load vault:', err);
    return DEFAULT_STRUCTURED_VAULT;
  }
}

export async function saveStructuredVault(vault: StructuredMemoryVault): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
    let existingProfile: any = {};
    if (raw) {
      try {
        existingProfile = JSON.parse(raw);
      } catch {}
    }

    const updatedProfile: UserMemoryProfile = {
      ...existingProfile,
      userName: existingProfile.userName || 'Bạn iu',
      nickname: vault.pronouns === 't - m' ? 'm' : (existingProfile.nickname || 'bạn'),
      currentProblem: existingProfile.currentProblem || 'Học tập & cuộc sống',
      moodTrend: existingProfile.moodTrend || 'Thích phong cách tự nhiên',
      interests: vault.favorites,
      currentProject: vault.activeProjects[0] || existingProfile.currentProject || '',
      habits: vault.habits,
      summary: vault.recentContext[0] || existingProfile.summary || '',
      lastActiveDate: new Date().toISOString(),
      vault,
      schemaVersion: 2,
      studySubjects: vault.studySubjects,
      financeGoals: vault.financeGoals,
      moodHistory: vault.moodHistory,
    };

    await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedProfile));
  } catch (err) {
    console.error('[MemoryVaultService] Lỗi khi lưu vault:', err);
  }
}
