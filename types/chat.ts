export interface EmotionData {
  emoji: string;
  label: string; // VD: "Đang tủi thân 🥺", "Đang tấu hài 😂", "Overthinking 🌀"
  level: number; // 1 -> 5
  color: string; // Accent color hex
  adviceTag?: string; // Tag nhắc nhở nhẹ nhàng
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
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
  title: string;
  updatedAt: number;
  messageCount: number;
}

export interface MemeItem {
  id: string;
  title: string;
  url: string;
  category: 'comfort' | 'funny' | 'shock' | 'relatable' | 'love';
  description: string;
}
