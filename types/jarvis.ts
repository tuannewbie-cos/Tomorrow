import { UserMemoryProfile, ChatMessage } from './chat';

/**
 * 4 Nhóm Ý định Chính của Proto-Jarvis Core:
 * - 'chat': Trò chuyện đời thường, chém gió, bầu bạn Messenger
 * - 'work_assist': Trợ lý giải quyết vấn đề, lập trình, kế hoạch, soi bug
 * - 'emotional_support': Chỗ dựa tinh thần, lắng nghe, thấu cảm, xả stress
 * - 'system_command': Chuẩn bị sẵn cổng điều khiển thiết bị / MacBook / IDE
 */
export type JarvisIntent = 'chat' | 'work_assist' | 'emotional_support' | 'system_command';

export type ConversationState = 'ping' | 'active_chat' | 'deep_work' | 'soft_close' | 'hard_close';

export interface JarvisAction {
  type: string;
  payload?: Record<string, any>;
}

export interface ProtoJarvisPayload {
  replies: string[];
  session_title?: string;
  memory_note?: string;
  jarvis_intent?: JarvisIntent;
  conversation_state?: ConversationState | string;
  should_update_title?: boolean;
  actions?: JarvisAction[];
}

/**
 * Cấu trúc mở rộng Hồ sơ Bộ nhớ Người dùng V1 (USER_MEMORY_PROFILE_V1)
 * Giúp Tomorrow nhớ:
 * 1. Dự án đang làm (currentProject)
 * 2. Thói quen sinh hoạt (habits)
 * 3. Tâm trạng gần đây (recentMood)
 */
export interface UserMemoryProfileV1 extends UserMemoryProfile {
  currentProject?: string; // VD: "App Tomorrow React Native", "Đồ án OOP", "Bài tập lớn"
  habits?: string[];       // VD: ["Code đêm", "Nghe nhạc Lo-Fi khi làm việc", "Hay overthinking"]
  recentMood?: string;     // VD: "Hơi căng thẳng vì deadline nhưng vẫn giữ lửa"
}

export interface JarvisContext {
  activeIntent: JarvisIntent;
  currentProject?: string;
  isLabMode: boolean; // Chế độ phòng lab J.A.R.V.I.S. khi bàn về công nghệ / kiến trúc
}
