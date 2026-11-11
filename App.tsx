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
  loadChatHistory,
  saveChatHistory,
  loadUserMemoryProfile,
  saveUserMemoryProfile,
  loadSessions,
  saveSessions,
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
import { Menu, Sparkles, Plus, Dot } from 'lucide-react-native';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userMemory, setUserMemory] = useState<UserMemoryProfile>(DEFAULT_USER_MEMORY);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('session-main');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // 1. KHÔI PHỤC NGỮ CẢNH TỨC THÌ KHI MỞ APP (TIÊU CHÍ KILL APP 40 ĐIỂM)
  useEffect(() => {
    async function rehydrateContext() {
      try {
        console.log('[Bootstrap] Đang nạp dữ liệu từ AsyncStorage...');
        const [savedHistory, savedMemory, savedSessions] = await Promise.all([
          loadChatHistory(),
          loadUserMemoryProfile(),
          loadSessions(),
        ]);

        if (savedHistory && savedHistory.length > 0) {
          setMessages(savedHistory);
        }
        if (savedMemory) {
          setUserMemory(savedMemory);
        }
        if (savedSessions && savedSessions.length > 0) {
          setSessions(savedSessions);
        }
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

  // Xử lý gửi tin nhắn mới
  const handleSendMessage = async (text: string, imageBase64?: string, imageUri?: string) => {
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now(),
      imageUri,
      imageBase64,
    };

    // 1. Cập nhật state UI ngay lập tức
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    // 2. Lưu ngay vào AsyncStorage để đảm bảo dù bị kill app lúc này tin nhắn vẫn còn
    await saveChatHistory(updatedMessages);

    try {
      // 3. Gửi sang AI Service (Kèm bộ nhớ dài hạn & lịch sử gần nhất)
      const aiResponse = await sendMessageToTomorrow(
        text,
        userMemory,
        updatedMessages,
        imageBase64
      );

      const replies =
        aiResponse.replies && aiResponse.replies.length > 0
          ? aiResponse.replies
          : [aiResponse.reply || 'ơi'];

      let currentHistory = [...updatedMessages];

      // Hiệu ứng tách tin nhắn (Multi-Bubble) tuần tự như người thật gõ phím
      for (let i = 0; i < replies.length; i++) {
        const replyText = replies[i];
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}-${i}`,
          sender: 'ai',
          text: replyText,
          timestamp: Date.now(),
        };

        currentHistory = [...currentHistory, aiMsg];
        setMessages(currentHistory);
        await saveChatHistory(currentHistory);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);

        if (i < replies.length - 1) {
          await sleep(380); // Độ trễ tự nhiên giữa các bong bóng tin nhắn (300ms - 500ms)
        }
      }

      // Cập nhật ngầm User Memory Profile nếu có ghi chú mới
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

  // Tạo phiên trò chuyện mới
  const handleCreateNewSession = async () => {
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: `Tâm sự mới ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
      updatedAt: Date.now(),
      messageCount: 0,
    };

    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    setActiveSessionId(newSessionId);
    setMessages([]);
    await saveSessions(updatedSessions);
    await saveChatHistory([]);
  };

  // Xóa toàn bộ lịch sử
  const handleClearAll = async () => {
    await clearAllChatData();
    setMessages([]);
    setUserMemory(DEFAULT_USER_MEMORY);
    setSessions([
      {
        id: 'session-main',
        title: 'Tâm sự đêm muộn 🌙',
        updatedAt: Date.now(),
        messageCount: 0,
      },
    ]);
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

        {/* 1. Header Bar chuẩn Messenger */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            onPress={() => setIsDrawerOpen(true)}
          >
            <Menu size={22} color="#D1D5DB" />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Tomorrow</Text>
              <View style={styles.liveBadge}>
                <Dot size={18} color="#10B981" />
                <Text style={styles.liveText}>Online</Text>
              </View>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            onPress={handleCreateNewSession}
          >
            <Plus size={22} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* 2. Thân Màn Hình: Cold Greeting hoặc Tin Nhắn Chat */}
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

        {/* Sidebar Drawer */}
        <SidebarDrawer
          visible={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => setActiveSessionId(id)}
          onCreateNewSession={handleCreateNewSession}
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
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 1,
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
