import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChatMessage, UserMemoryProfile, ChatSession } from './types/chat';
import {
  loadSessions,
  saveSessions,
  deleteSession,
  loadUserMemoryProfile,
  saveUserMemoryProfile,
  clearAllChatData,
  DEFAULT_USER_MEMORY,
} from './storage/chatStorage';
import {
  sendMessageToTomorrow,
  getColdGreetingText,
} from './services/aiService';
import { ChatBubble } from './components/ChatBubble';
import { ColdGreeting } from './components/ColdGreeting';
import { FloatingInputBar } from './components/FloatingInputBar';
import { SidebarDrawer } from './components/SidebarDrawer';
import { Menu, Sparkles, Plus, Dot, SquarePen } from 'lucide-react-native';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [userMemory, setUserMemory] = useState<UserMemoryProfile>(DEFAULT_USER_MEMORY);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // 1. MỖI LẦN MỞ LẠI APP (COLD START / KILL APP):
  // Màn hình chính LUÔN LUÔN là một cuộc trò chuyện mới hoàn toàn trống
  // Toàn bộ các đoạn chat từ những lần trước đã lưu trong CHAT_SESSIONS_V2
  useEffect(() => {
    async function rehydrateContext() {
      try {
        console.log('[Bootstrap] Đang nạp danh sách phiên trò chuyện từ CHAT_SESSIONS_V2...');
        const [savedSessions, savedMemory] = await Promise.all([
          loadSessions(),
          loadUserMemoryProfile(),
        ]);

        if (savedSessions && savedSessions.length > 0) {
          setSessions(savedSessions);
        }
        if (savedMemory) {
          setUserMemory(savedMemory);
        }

        // Quy tắc trải nghiệm giống Google Gemini:
        // Luôn mở ra màn hình trống để bắt đầu phiên mới
        setMessages([]);
        setCurrentSessionId(null);
      } catch (err) {
        console.error('[Bootstrap] Lỗi khi nạp dữ liệu:', err);
      } finally {
        setIsReady(true);
      }
    }

    rehydrateContext();
  }, []);

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages.length, isLoading]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // 2. XỬ LÝ GỬI TIN NHẮN MỚI
  const handleSendMessage = async (text: string, imageBase64?: string, imageUri?: string) => {
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      sender: 'user',
      text,
      timestamp: Date.now(),
      imageUri,
      imageBase64,
    };

    let activeId = currentSessionId;
    let nextSessions = [...sessions];
    const updatedMessages = [...messages, userMsg];

    // Nếu đang ở màn hình trống (currentSessionId === null):
    // Tự động khởi tạo một session mới, lấy tin nhắn đầu tiên (cắt 30 ký tự) làm tiêu đề
    if (!activeId) {
      activeId = `session-${Date.now()}`;
      setCurrentSessionId(activeId);

      const rawTitle = text.trim() || (imageUri ? 'Hình ảnh gửi kèm' : 'Tâm sự mới');
      const sessionTitle = rawTitle.length > 30 ? `${rawTitle.slice(0, 30)}...` : rawTitle;

      const newSession: ChatSession = {
        id: activeId,
        title: sessionTitle,
        updatedAt: Date.now(),
        messages: updatedMessages,
      };

      nextSessions = [newSession, ...sessions];
      setSessions(nextSessions);
    } else {
      // Cập nhật session hiện tại và đưa lên đầu danh sách
      const existing = sessions.find((s) => s.id === activeId);
      const remaining = sessions.filter((s) => s.id !== activeId);
      const updatedSession: ChatSession = {
        id: activeId,
        title: existing?.title || (text.trim().slice(0, 30) + '...'),
        updatedAt: Date.now(),
        messages: updatedMessages,
      };
      nextSessions = [updatedSession, ...remaining];
      setSessions(nextSessions);
    }

    // Cập nhật UI ngay lập tức
    setMessages(updatedMessages);
    setIsLoading(true);

    // Đồng bộ session vào AsyncStorage (CHAT_SESSIONS_V2)
    await saveSessions(nextSessions);

    try {
      // Tìm 3 tin nhắn cuối của phiên trước đó (nếu đây là phiên vừa tạo)
      const previousSession = sessions.find((s) => s.id !== activeId);
      const previousSessionMessages = previousSession?.messages?.slice(-3);

      // Gửi sang AI Service với Model Fallback Chain và Trí nhớ xuyên suốt
      const aiResponse = await sendMessageToTomorrow(
        text,
        userMemory,
        updatedMessages,
        imageBase64,
        previousSessionMessages
      );

      const replies =
        aiResponse.replies && aiResponse.replies.length > 0
          ? aiResponse.replies
          : [aiResponse.reply || 'ơi'];

      let currentHistory = [...updatedMessages];

      // Hiệu ứng Multi-bubble: Hiển thị lần lượt từng bong bóng chat với độ trễ 350ms
      for (let i = 0; i < replies.length; i++) {
        const replyText = replies[i];
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}-${i}`,
          role: 'model',
          sender: 'ai',
          text: replyText,
          timestamp: Date.now(),
        };

        currentHistory = [...currentHistory, aiMsg];
        setMessages(currentHistory);

        // Cập nhật lại session trong storage với messages mới
        const currentSessionIndex = nextSessions.findIndex((s) => s.id === activeId);
        if (currentSessionIndex !== -1) {
          nextSessions[currentSessionIndex] = {
            ...nextSessions[currentSessionIndex],
            updatedAt: Date.now(),
            messages: currentHistory,
          };
          setSessions([...nextSessions]);
          await saveSessions(nextSessions);
        }

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);

        if (i < replies.length - 1) {
          await sleep(350);
        }
      }

      // Cập nhật ngầm User Memory Profile nếu có thông tin mới
      if (aiResponse.memoryUpdate) {
        const newMemory = {
          ...userMemory,
          ...aiResponse.memoryUpdate,
          lastActiveDate: new Date().toISOString(),
        };
        setUserMemory(newMemory);
        await saveUserMemoryProfile(newMemory);
      }
    } catch (error) {
      console.error('[App] Lỗi trò chuyện:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. TẠO CUỘC TRÒ CHUYỆN MỚI (+ Cuộc trò chuyện mới)
  const handleCreateNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
  };

  // 4. CHỌN 1 PHIÊN TRÒ CHUYỆN CŨ TỪ SIDEBAR
  const handleSelectSession = (sessionId: string) => {
    const selected = sessions.find((s) => s.id === sessionId);
    if (selected) {
      setCurrentSessionId(selected.id);
      setMessages(selected.messages || []);
    }
  };

  // 5. XÓA 1 PHIÊN TRÒ CHUYỆN
  const handleDeleteSession = async (sessionId: string) => {
    const updated = await deleteSession(sessionId);
    setSessions(updated);
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  // 6. XÓA TOÀN BỘ LỊCH SỬ & RESET
  const handleClearAll = async () => {
    await clearAllChatData();
    setSessions([]);
    setCurrentSessionId(null);
    setMessages([]);
    setUserMemory(DEFAULT_USER_MEMORY);
  };

  // Màn hình khởi động nhanh chống nháy trắng (Dark Splash)
  if (!isReady) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar style="light" />
        <Sparkles size={36} color="#0084FF" />
        <Text style={styles.splashTitle}>Tomorrow</Text>
        <Text style={styles.splashSubtitle}>Đang kết nối...</Text>
        <ActivityIndicator size="small" color="#0084FF" style={{ marginTop: 20 }} />
      </View>
    );
  }

  const hasHistory = messages.length > 0;
  const greetingText = getColdGreetingText(userMemory, hasHistory);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />

        {/* 1. Header Bar chuẩn phong cách Gemini Mobile */}
        <View style={styles.header}>
          {/* Nút ☰ bên trái mở Sidebar */}
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            onPress={() => setIsSidebarOpen(true)}
            hitSlop={8}
          >
            <Menu size={22} color="#D1D5DB" />
          </Pressable>

          {/* Tiêu đề "Tomorrow" ở giữa */}
          <View style={styles.headerCenter}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Tomorrow</Text>
              <View style={styles.liveBadge}>
                <Dot size={18} color="#10B981" />
                <Text style={styles.liveText}>Online</Text>
              </View>
            </View>
          </View>

          {/* Nút Cuộc trò chuyện mới bên phải */}
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            onPress={handleCreateNewSession}
            hitSlop={8}
          >
            <SquarePen size={20} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* 2. Thân Màn Hình: Màn hình chào ColdGreeting (khi trống) hoặc Bong bóng Chat */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          {messages.length === 0 ? (
            <ColdGreeting
              greetingText={greetingText}
              userMemory={userMemory}
              hasHistory={false}
              onSelectSuggestion={(text) => handleSendMessage(text)}
            />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ChatBubble
                  message={item}
                />
              )}
              contentContainerStyle={styles.chatListContent}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                isLoading ? (
                  <View style={styles.typingIndicator}>
                    <ActivityIndicator size="small" color="#0084FF" />
                    <Text style={styles.typingText}>Tomorrow đang nhắn...</Text>
                  </View>
                ) : undefined
              }
            />
          )}

          {/* 3. Floating Pill Input Bar */}
          <FloatingInputBar
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
          />
        </KeyboardAvoidingView>

        {/* 4. Thanh bên Lịch sử (Sidebar / Drawer phong cách Gemini) */}
        <SidebarDrawer
          visible={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          sessions={sessions}
          activeSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onCreateNewSession={handleCreateNewSession}
          onDeleteSession={handleDeleteSession}
          onClearAll={handleClearAll}
          userMemory={userMemory}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#131314',
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#131314',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    color: '#F3F4F6',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
  },
  splashSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 6,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#202124',
    backgroundColor: '#131314',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1F20',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '700',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  liveText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#131314',
  },
  chatListContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  typingText: {
    color: '#0084FF',
    fontSize: 12,
  },
  btnPressed: {
    opacity: 0.7,
  },
});
