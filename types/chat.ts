export interface EmotionData {
  emoji: string;
  label: string; // VD: "Đang tủi thân 🥺", "Đang tấu hài 😂", "Overthinking 🌀"
  level: number; // 1 -> 5
  color: string; // Accent color hex
  adviceTag?: string; // Tag nhắc nhở nhẹ nhàng
}

export interface WebSource {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
  publishedAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  sender?: 'user' | 'ai'; // Tương thích ngược
  text: string;
  timestamp: number;
  imageUri?: string;
  imageBase64?: string;
  emotion?: EmotionData;
  memeId?: string;
  suggestedReplies?: string[];
  jarvisIntent?: string;
  sources?: WebSource[];
  searchQuery?: string;
}

export interface StudySubject {
  id: string;
  subject: string;
  level: 'strong' | 'weak' | 'learning';
  focusTopic?: string;
  updatedAt: string;
}

export interface FinanceGoal {
  id: string;
  goal: string;
  targetAmount?: string;
  horizon: 'short' | 'mid' | 'long';
  note?: string;
  updatedAt: string;
}

export interface MoodEntry {
  date: string;
  mood: string;
  note?: string;
}

/**
 * Structured Knowledge Vault (Schema Version 2 — Day 11)
 * Mở rộng lõi bộ nhớ thành Hồ sơ Tri thức Đa chiều cho sinh viên
 */
export interface StructuredMemoryVault {
  schemaVersion: 2;
  pronouns?: string;        // VD: "t - m" | "bạn bè tự nhiên"
  favorites: string[];     // VD: ["Fan cứng Ronaldo", "Thích giao diện Dark Mode macOS"], tối đa 5
  activeProjects: string[];// VD: ["Đang phát triển siêu trợ lý Tomorrow (React Native + Vercel)"], tối đa 5
  habits: string[];        // VD: ["Làm việc tập trung", "Ghét chatbot hỏi vặn khi nhắn okk/sybau"], tối đa 5
  recentContext: string[]; // Kèm hậu tố (DD/MM), tối đa 5
  studySubjects: StudySubject[]; // Tối đa 6 môn học
  financeGoals: FinanceGoal[];   // Tối đa 5 mục tiêu tài chính
  moodHistory: MoodEntry[];      // Tối đa 5 mốc tâm lý theo ngày
  updatedAt: number;
}

export interface UserMemoryVault {
  schemaVersion?: number;
  pronouns?: string;        // VD: "t - m"
  favorites: string[];     // VD: ["Fan cứng Ronaldo", "Thích giao diện Dark Mode macOS"]
  activeProjects: string[];// VD: ["Đang phát triển siêu trợ lý Tomorrow (React Native + Vercel)"]
  habits: string[];        // VD: ["Hay code đêm", "Ghét chatbot hỏi vặn khi nhắn okk/sybau"]
  recentContext: string | string[]; // Tương thích cả chuỗi v3.8-v4.6 lẫn mảng v4.7
  studySubjects?: StudySubject[];
  financeGoals?: FinanceGoal[];
  moodHistory?: MoodEntry[];
  updatedAt?: number;
}

export interface UserMemoryProfile {
  userName: string;
  currentProblem: string;
  moodTrend: string;
  interests: string[];
  lastActiveDate: string;
  summary: string;
  nickname: string;
  // Mở cổng kiến trúc Proto-Jarvis Core
  currentProject?: string; // Dự án đang làm
  habits?: string[];       // Thói quen sinh hoạt
  recentMood?: string;     // Tâm trạng gần đây
  vault?: StructuredMemoryVault | UserMemoryVault; // v4.7 Structured Knowledge Vault
  schemaVersion?: number;
  studySubjects?: StudySubject[];
  financeGoals?: FinanceGoal[];
  moodHistory?: MoodEntry[];
}

export interface ChatSession {
  id: string;
  title: string; // Tự động lấy từ tin nhắn đầu tiên hoặc do AI đặt súc tích 3-5 từ
  updatedAt: number;
  messages: ChatMessage[];
  messageCount?: number;
  lastIntent?: string;
}

export interface MemeItem {
  id: string;
  title: string;
  url: string;
  category: 'comfort' | 'funny' | 'shock' | 'relatable' | 'love' | 'exhausted' | 'chill' | 'crying';
  description: string;
  contextTrigger?: string;
  emotionTag?: string;
}
