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

export interface UserMemoryVault {
  pronouns: string;        // VD: "t - m"
  favorites: string[];     // VD: ["Fan cứng Ronaldo", "Thích giao diện Dark Mode macOS"]
  activeProjects: string[];// VD: ["Đang phát triển siêu trợ lý Tomorrow (React Native + Vercel)"]
  habits: string[];        // VD: ["Hay code đêm", "Ghét chatbot hỏi vặn khi nhắn okk/sybau"]
  recentContext: string;   // Tóm tắt 1 câu về chủ đề vừa bàn gần nhất
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
  vault?: UserMemoryVault; // v3.8 JSON Memory Vault siêu nén
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
