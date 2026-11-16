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
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, UserMemoryProfile, ChatSession } from './types/chat';
import {
  loadSessions,
  saveSessions,
  deleteSession,
  loadUserMemoryProfile,
  saveUserMemoryProfile,
  clearAllChatData,
  DEFAULT_USER_MEMORY,
  cleanNightNotesFromMemory,
  isPlaceholderOrNoiseTitle,
} from './storage/chatStorage';
import {
  sendMessageToTomorrow,
  getColdGreetingText,
} from './services/aiService';
import { ChatBubble } from './components/ChatBubble';
import { ColdGreeting } from './components/ColdGreeting';
import { FloatingInputBar } from './components/FloatingInputBar';
import { SidebarDrawer } from './components/SidebarDrawer';
import { TypingIndicator } from './components/TypingIndicator';
import { Menu, Sparkles, Dot, SquarePen, Sun, Moon, ChevronDown } from 'lucide-react-native';
import {
  ThemeMode,
  DARK_THEME,
  LIGHT_THEME,
  THEME_STORAGE_KEY,
} from './constants/theme';
import { injectWebFonts } from './utils/webFont';

// Kiểm tra câu chào ngắn xã giao hoặc placeholder (tương thích ngược)
export const isGreetingOrTooShort = (text: string) => {
  return isPlaceholderOrNoiseTitle(text);
};

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [userMemory, setUserMemory] = useState<UserMemoryProfile>(DEFAULT_USER_MEMORY);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTomorrowTyping, setIsTomorrowTyping] = useState<boolean>(false);
  const [isSearchingWeb, setIsSearchingWeb] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(width >= 768);
  const [showScrollDownBtn, setShowScrollDownBtn] = useState<boolean>(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const prevIsDesktopRef = useRef<boolean>(isDesktop);
  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;

  // 1. KHỞI TẠO WEB FONTS & NẠP DỮ LIỆU ĐA PHIÊN, THEME
  useEffect(() => {
    // Nhúng font Plus Jakarta Sans & Inter và bật antialiasing trên macOS
    injectWebFonts();

    async function rehydrateContext() {
      try {
        console.log('[Bootstrap] Đang nạp danh sách phiên trò chuyện và theme...');
        const [savedSessions, savedMemory, savedTheme] = await Promise.all([
          loadSessions(),
          loadUserMemoryProfile(),
          AsyncStorage.getItem(THEME_STORAGE_KEY),
        ]);

        if (savedSessions && savedSessions.length > 0) {
          let hasUpdatedOldTitles = false;
          const cleanedSessions = savedSessions.map((sess) => {
            const rawTitle = (sess.title || '').trim();
            if (isPlaceholderOrNoiseTitle(rawTitle)) {
              const firstMeaningfulMsg = (sess.messages || []).find(
                (m) => (m.role === 'user' || m.sender === 'user') && !isPlaceholderOrNoiseTitle(m.text || '')
              );
              let newTitle = 'Trò chuyện ngắn';
              if (firstMeaningfulMsg && firstMeaningfulMsg.text?.trim()) {
                const cleanMsg = firstMeaningfulMsg.text.trim();
                newTitle = cleanMsg.length > 30 ? `${cleanMsg.slice(0, 30)}...` : cleanMsg;
              }
              if (newTitle !== sess.title) {
                hasUpdatedOldTitles = true;
                return { ...sess, title: newTitle };
              }
            }
            return sess;
          });

          if (hasUpdatedOldTitles) {
            setSessions(cleanedSessions);
            await saveSessions(cleanedSessions);
          } else {
            setSessions(savedSessions);
          }
        }
        if (savedMemory) {
          const cleaned = cleanNightNotesFromMemory(savedMemory);
          setUserMemory(cleaned);
        }
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeMode(savedTheme);
        }

        // Luôn mở ra màn hình mới hoàn toàn trống
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

  // Cập nhật màu nền body trên Web đồng bộ theo theme
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.bgMain;
    }
  }, [theme.bgMain]);

  // Tự động điều chỉnh trạng thái mặc định của sidebar khi resize qua ngưỡng 768px
  useEffect(() => {
    if (isDesktop && !prevIsDesktopRef.current) {
      setIsSidebarOpen(true);
    } else if (!isDesktop && prevIsDesktopRef.current) {
      setIsSidebarOpen(false);
    }
    prevIsDesktopRef.current = isDesktop;
  }, [isDesktop]);

  // Tự động cuộn xuống cuối khi có tin nhắn mới hoặc Tomorrow đang gõ phím
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages.length, isTomorrowTyping]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Chuyển đổi Theme Sáng / Tối
  const handleToggleTheme = async () => {
    const nextMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch (err) {
      console.warn('[Theme] Không thể lưu theme:', err);
    }
  };

  // Theo dõi cuộn của tin nhắn để hiển thị nút "↓" khi cuộn ngược quá 250px
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollDownBtn(distanceFromBottom > 250);
  };

  // 2. XỬ LÝ GỬI TIN NHẮN MỚI
  const handleSendMessage = async (
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean
  ) => {
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

    if (!activeId) {
      activeId = `session-${Date.now()}`;
      setCurrentSessionId(activeId);

      const trimmedText = text.trim();
      let sessionTitle = 'Cuộc trò chuyện mới';
      if (!isPlaceholderOrNoiseTitle(trimmedText) && trimmedText.length > 6) {
        const words = trimmedText.split(/\s+/).filter(Boolean);
        sessionTitle = words.slice(0, 6).join(' ');
        if (words.length > 6) {
          sessionTitle += '...';
        }
      } else if (imageUri && !trimmedText) {
        sessionTitle = 'Hình ảnh gửi kèm';
      }

      const newSession: ChatSession = {
        id: activeId,
        title: sessionTitle,
        updatedAt: Date.now(),
        messages: updatedMessages,
      };

      nextSessions = [newSession, ...sessions];
      setSessions(nextSessions);
    } else {
      const existing = sessions.find((s) => s.id === activeId);
      const remaining = sessions.filter((s) => s.id !== activeId);
      const updatedSession: ChatSession = {
        id: activeId,
        title: existing?.title || 'Cuộc trò chuyện mới',
        updatedAt: Date.now(),
        messages: updatedMessages,
      };
      nextSessions = [updatedSession, ...remaining];
      setSessions(nextSessions);
    }

    setMessages(updatedMessages);
    setIsLoading(true);

    await saveSessions(nextSessions);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    await sleep(350);
    setIsTomorrowTyping(true);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    try {
      const previousSession = sessions.find((s) => s.id !== activeId);
      const previousSessionMessages = previousSession?.messages?.slice(-3);

      const aiResponse = await sendMessageToTomorrow(
        text,
        userMemory,
        updatedMessages,
        imageBase64,
        previousSessionMessages,
        forceWebSearch,
        (isSearching) => setIsSearchingWeb(isSearching)
      );

      // Bước B: Đồng bộ luồng cập nhật tiêu đề hội thoại thông minh
      const aiSessionTitle = (aiResponse.session_title || aiResponse.sessionTitle || '').trim();
      const currentSess = nextSessions.find((s) => s.id === activeId);
      const currentTitle = currentSess?.title || 'Cuộc trò chuyện mới';

      let updatedTitle = currentTitle;
      const isValidNewTitle = !isPlaceholderOrNoiseTitle(aiSessionTitle);
      const shouldUpdate =
        isValidNewTitle &&
        (isPlaceholderOrNoiseTitle(currentTitle) || aiResponse.should_update_title === true);

      if (shouldUpdate) {
        updatedTitle = aiSessionTitle;
        const currentSessionIndex = nextSessions.findIndex((s) => s.id === activeId);
        if (currentSessionIndex !== -1) {
          nextSessions[currentSessionIndex] = {
            ...nextSessions[currentSessionIndex],
            title: updatedTitle,
            updatedAt: Date.now(),
          };
          setSessions([...nextSessions]);
          await saveSessions(nextSessions);
        }
      }

      const replies =
        aiResponse.replies && aiResponse.replies.length > 0
          ? aiResponse.replies
          : [aiResponse.reply || 'ơi'];

      let currentHistory = [...updatedMessages];

      for (const [index, replyText] of replies.entries()) {
        const typingDuration = Math.min(Math.max(replyText.length * 45, 650), 2200);

        setIsTomorrowTyping(true);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);

        await sleep(typingDuration);

        setIsTomorrowTyping(false);

        const isLastReply = index === replies.length - 1;
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}-${index}`,
          role: 'model',
          sender: 'ai',
          text: replyText,
          timestamp: Date.now(),
          jarvisIntent: aiResponse.jarvis_intent,
          sources: isLastReply ? aiResponse.sources : undefined,
          searchQuery: isLastReply ? aiResponse.searchQuery : undefined,
        };

        currentHistory = [...currentHistory, aiMsg];
        setMessages([...currentHistory]);

        const currentSessionIndex = nextSessions.findIndex((s) => s.id === activeId);
        if (currentSessionIndex !== -1) {
          nextSessions[currentSessionIndex] = {
            ...nextSessions[currentSessionIndex],
            title: updatedTitle,
            updatedAt: Date.now(),
            messages: currentHistory,
            lastIntent: aiResponse.jarvis_intent,
          };
          setSessions([...nextSessions]);
          await saveSessions(nextSessions);
        }

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);

        if (index < replies.length - 1) {
          await sleep(300);
          setIsTomorrowTyping(true);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 50);
        }
      }

      if (aiResponse.memoryUpdate || aiResponse.memory_note) {
        const memoryNote = aiResponse.memory_note || aiResponse.memoryNote;
        const memoryUpdateObj = aiResponse.memoryUpdate || (memoryNote ? {
          currentProblem: memoryNote,
          summary: memoryNote,
        } : {});

        const cleanedUpdate = cleanNightNotesFromMemory({
          ...userMemory,
          ...memoryUpdateObj,
        });
        const newMemory: UserMemoryProfile = {
          ...cleanedUpdate,
          lastActiveDate: new Date().toISOString(),
        };
        setUserMemory(newMemory);
        await saveUserMemoryProfile(newMemory);
      }
    } catch (error) {
      console.error('[App] Lỗi trò chuyện:', error);
    } finally {
      setIsTomorrowTyping(false);
      setIsLoading(false);
    }
  };

  // 3. TẠO CUỘC TRÒ CHUYỆN MỚI
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

  // Màn hình khởi động nhanh chống nháy trắng
  if (!isReady) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: theme.bgMain }]}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <Sparkles size={38} color="#8B5CF6" />
        <Text style={[styles.splashTitle, { color: theme.textPrimary }]}>Tomorrow</Text>
        <Text style={[styles.splashSubtitle, { color: theme.textSecondary }]}>Đang kết nối...</Text>
        <ActivityIndicator size="small" color="#8B5CF6" style={{ marginTop: 20 }} />
      </View>
    );
  }

  const hasHistory = messages.length > 0;
  const greetingText = getColdGreetingText(userMemory, hasHistory);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: theme.bgMain },
          Platform.OS === 'web' && ({
            minHeight: '100vh',
            overflow: 'hidden',
          } as any),
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

        {/* 1. Header Bar: Trải rộng 100% chiều ngang cửa sổ MacBook (height: 60, paddingHorizontal: 24) */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.bgHeader,
              borderBottomColor: theme.borderSubtle,
            },
          ]}
        >
          {/* Nút ☰ bên trái: Toggle Sidebar (hiển thị trên cả Desktop và Mobile) */}
          <Pressable
            style={({ pressed }) => [
              styles.headerBtn,
              { backgroundColor: theme.btnBg },
              pressed && { backgroundColor: theme.btnHover },
              Platform.OS === 'web' && { cursor: 'pointer' as any },
            ]}
            onPress={() => setIsSidebarOpen((prev) => !prev)}
            hitSlop={8}
          >
            <Menu size={20} color={theme.btnIcon} />
          </Pressable>

          {/* Tiêu đề "Tomorrow" ở giữa */}
          <View style={styles.headerCenter}>
            <View style={styles.titleRow}>
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Tomorrow</Text>
              <View style={[styles.liveBadge, { backgroundColor: theme.liveBadgeBg }]}>
                <Dot size={18} color={theme.liveBadgeText} />
                <Text style={[styles.liveText, { color: theme.liveBadgeText }]}>Online • v3.6</Text>
              </View>
            </View>
          </View>

          {/* Cụm nút góc phải: Nút Theme Sáng/Tối + Nút Tạo Cuộc Trò Chuyện Mới */}
          <View style={styles.headerRightActions}>
            {/* Nút chuyển đổi Theme (☀️ / 🌙) */}
            <Pressable
              style={({ pressed }) => [
                styles.headerBtn,
                { backgroundColor: theme.btnBg },
                pressed && { backgroundColor: theme.btnHover },
                Platform.OS === 'web' && { cursor: 'pointer' as any },
              ]}
              onPress={handleToggleTheme}
              hitSlop={8}
            >
              {themeMode === 'dark' ? (
                <Sun size={19} color="#F59E0B" />
              ) : (
                <Moon size={19} color="#6366F1" />
              )}
            </Pressable>

            {/* Nút Cuộc trò chuyện mới */}
            <Pressable
              style={({ pressed }) => [
                styles.headerBtn,
                { backgroundColor: theme.btnBg },
                pressed && { backgroundColor: theme.btnHover },
                Platform.OS === 'web' && { cursor: 'pointer' as any },
              ]}
              onPress={handleCreateNewSession}
              hitSlop={8}
            >
              <SquarePen size={19} color={theme.btnIcon} />
            </Pressable>
          </View>
        </View>

        {/* 2. Thân Màn Hình: Bố cục Split-View 280px co giãn 100% */}
        <View style={styles.mainLayoutBody}>
          {/* Thanh bên Lịch sử 280px (Split-View Desktop / Modal Drawer Mobile) */}
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
            theme={theme}
          />

          {/* Khung chat chính: Co giãn linh hoạt chiếm trọn 100% không gian còn lại */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.keyboardContainer, { backgroundColor: theme.bgMain }]}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={styles.chatAreaWrapper}>
              {messages.length === 0 ? (
                <ColdGreeting
                  greetingText={greetingText}
                  userMemory={userMemory}
                  hasHistory={false}
                  onSelectSuggestion={(text) => handleSendMessage(text)}
                  theme={theme}
                />
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <ChatBubble
                      message={item}
                      isDesktop={isDesktop}
                      theme={theme}
                    />
                  )}
                  style={styles.flatListStyle}
                  contentContainerStyle={[
                    styles.chatListContent,
                    { paddingHorizontal: isDesktop ? 28 : 16 },
                  ]}
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  ListFooterComponent={
                    <TypingIndicator
                      visible={isTomorrowTyping || isSearchingWeb}
                      isSearchingWeb={isSearchingWeb}
                      isDesktop={isDesktop}
                      theme={theme}
                    />
                  }
                />
              )}

              {/* Nút tròn nhỏ "↓" cuộn mượt xuống đáy khi cuộn ngược lên xem lịch sử > 250px */}
              {showScrollDownBtn && (
                <Pressable
                  style={({ pressed }) => [
                    styles.scrollDownBtn,
                    {
                      backgroundColor: theme.mode === 'dark' ? '#1E2433' : '#FFFFFF',
                      borderColor: theme.borderSubtle,
                      shadowColor: '#000',
                      shadowOpacity: theme.mode === 'dark' ? 0.35 : 0.12,
                    },
                    pressed && { transform: [{ scale: 0.92 }] },
                    Platform.OS === 'web' && ({ cursor: 'pointer', transition: 'all 0.15s ease' } as any),
                  ]}
                  onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  hitSlop={8}
                >
                  <ChevronDown size={18} color={theme.textPrimary} />
                </Pressable>
              )}

              {/* 3. Floating Pill Input Bar (maxWidth: 820, alignSelf: 'center') */}
              <FloatingInputBar
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                isTomorrowTyping={isTomorrowTyping}
                theme={theme}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  splashContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 14,
    letterSpacing: -0.3,
  },
  splashSubtitle: {
    fontSize: 13.5,
    marginTop: 6,
  },
  header: {
    height: 60,
    width: '100%',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    zIndex: 20,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
        : undefined,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  liveText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mainLayoutBody: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  keyboardContainer: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  chatAreaWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
  },
  flatListStyle: {
    flex: 1,
    width: '100%',
  },
  chatListContent: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingVertical: 16,
    paddingBottom: 24,
  },
  scrollDownBtn: {
    position: 'absolute',
    right: 28,
    bottom: 82,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    zIndex: 15,
  },
});
