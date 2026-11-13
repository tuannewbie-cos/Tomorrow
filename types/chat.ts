export interface EmotionData {
  emoji: string;
  label: string; // VD: "Đang tủi thân 🥺", "Đang tấu hài 😂", "Overthinking 🌀"
  level: number; // 1 -> 5
  color: string; // Accent color hex
  adviceTag?: string; // Tag nhắc nhở nhẹ nhàng
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
}

export interface UserMemoryProfile {
  userName: string;
  currentProblem: string;
  moodTrend: string;
  interests: string[];
  lastActiveDate: string;
  summary: string;
  nickname: string;
}

export interface ChatSession {
  id: string;
  title: string; // Tự động lấy từ tin nhắn đầu tiên của user (cắt ngắn 30 ký tự)
  updatedAt: number;
  messages: ChatMessage[];
  messageCount?: number;
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
