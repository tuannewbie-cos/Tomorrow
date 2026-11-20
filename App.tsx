import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ScrollView,
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
  localResilientFallback,
  KeystrokeTelemetry,
  resolveCarriedOverVisionImage,
} from './services/aiService';
import { ChatBubble } from './components/ChatBubble';
import { ColdGreeting } from './components/ColdGreeting';
import { FloatingInputBar, FloatingInputBarRef } from './components/FloatingInputBar';
import { SidebarDrawer } from './components/SidebarDrawer';
import { TypingIndicator } from './components/TypingIndicator';
import { CommandPalette } from './components/CommandPalette';
import {
  Menu,
  Sparkles,
  Dot,
  SquarePen,
  Sun,
  Moon,
  ChevronDown,
  Search,
  Columns2,
  Plus,
  X,
  MessageSquare,
} from 'lucide-react-native';
import {
  ThemeMode,
  DARK_THEME,
  LIGHT_THEME,
  THEME_STORAGE_KEY,
} from './constants/theme';
import { injectWebFonts } from './utils/webFont';
import { compressImageForVision, cleanBase64 } from './utils/imageOptimizer';

// Kiểm tra câu chào ngắn xã giao hoặc placeholder (tương thích ngược)
export const isGreetingOrTooShort = (text: string) => {
  return isPlaceholderOrNoiseTitle(text);
};

export interface ChatPane {
  id: string;
  sessionId: string | null;
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [userMemory, setUserMemory] = useState<UserMemoryProfile>(DEFAULT_USER_MEMORY);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(width >= 768);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // HẠNG MỤC 2: Quản lý Split Chat Panes kiểu VS Code (mặc định 1 pane, Cmd+↑ mở 2 pane, tối đa 3 pane)
  const [panes, setPanes] = useState<ChatPane[]>([{ id: 'pane-1', sessionId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');
  const [openDropdownPaneId, setOpenDropdownPaneId] = useState<string | null>(null);

  // HẠNG MỤC 1: Cô lập trạng thái typing / status / search theo từng sessionId
  const [typingSessionIds, setTypingSessionIds] = useState<Record<string, boolean>>({});
  const [typingStatusBySession, setTypingStatusBySession] = useState<Record<string, string | undefined>>({});
  const [searchingWebBySession, setSearchingWebBySession] = useState<Record<string, boolean>>({});
  const [scrollDownByPane, setScrollDownByPane] = useState<Record<string, boolean>>({});

  // Tương thích ngược: currentSessionId & messages cho pane đang active
  const activePane = panes.find((p) => p.id === activePaneId) || panes[0] || { id: 'pane-1', sessionId: null };
  const currentSessionId = activePane.sessionId;
  const activeSession = currentSessionId ? sessions.find((s) => s.id === currentSessionId) : null;
  const messages = activeSession?.messages || [];
  const [, setMessagesState] = useState<ChatMessage[]>(messages);
  const [, setCurrentSessionIdState] = useState<string | null>(currentSessionId);

  const isTomorrowTyping = !!(currentSessionId && typingSessionIds[currentSessionId]);
  const isSearchingWeb = !!(currentSessionId && searchingWebBySession[currentSessionId]);
  const typingStatusText = currentSessionId ? typingStatusBySession[currentSessionId] : undefined;
  const showScrollDownBtn = !!scrollDownByPane[activePaneId];

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const inputBarRef = useRef<FloatingInputBarRef>(null);
  const inputRef = inputBarRef;

  const flatListRefs = useRef<Record<string, FlatList<ChatMessage> | null>>({});
  const inputBarRefs = useRef<Record<string, FloatingInputBarRef | null>>({});

  const prevIsDesktopRef = useRef<boolean>(isDesktop);
  const isCommandPaletteOpenRef = useRef<boolean>(false);
  const currentSessionTurnIdRef = useRef<number>(0);
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);

  const panesRef = useRef<ChatPane[]>(panes);
  panesRef.current = panes;
  const activePaneIdRef = useRef<string>(activePaneId);
  activePaneIdRef.current = activePaneId;
  const sessionsRef = useRef<ChatSession[]>(sessions);
  sessionsRef.current = sessions;
  const userMemoryRef = useRef<UserMemoryProfile>(userMemory);
  userMemoryRef.current = userMemory;

  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;

  useEffect(() => {
    isCommandPaletteOpenRef.current = isCommandPaletteOpen;
  }, [isCommandPaletteOpen]);

  // Đồng bộ reference flatListRef và inputBarRef sang active pane
  useEffect(() => {
    flatListRef.current = flatListRefs.current[activePaneId] || null;
    inputBarRef.current = inputBarRefs.current[activePaneId] || null;
  }, [activePaneId]);

  // Đồng bộ messages state và currentSessionId state tương thích ngược
  useEffect(() => {
    const actSess = currentSessionId ? sessions.find((s) => s.id === currentSessionId) : null;
    setMessagesState(actSess?.messages || []);
    setCurrentSessionIdState(currentSessionId);
  }, [currentSessionId, sessions]);

  // Setters giữ tương thích ngược
  const setCurrentSessionId = useCallback((id: string | null) => {
    setCurrentSessionIdState(id);
    setPanes((prev) =>
      prev.map((p) => (p.id === activePaneIdRef.current ? { ...p, sessionId: id } : p))
    );
  }, []);

  const setMessages = useCallback((msgs: ChatMessage[]) => {
    setMessagesState(msgs);
    const actId = panesRef.current.find((p) => p.id === activePaneIdRef.current)?.sessionId;
    if (actId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === actId ? { ...s, messages: msgs } : s))
      );
    }
  }, []);

  const setIsTomorrowTyping = useCallback((val: boolean) => {
    const actId = panesRef.current.find((p) => p.id === activePaneIdRef.current)?.sessionId;
    if (actId) {
      setTypingSessionIds((prev) => ({ ...prev, [actId]: val }));
    }
  }, []);

  const setTypingStatusText = useCallback((val: string | undefined | ((prev: string | undefined) => string | undefined)) => {
    const actId = panesRef.current.find((p) => p.id === activePaneIdRef.current)?.sessionId;
    if (actId) {
      setTypingStatusBySession((prev) => {
        const nextVal = typeof val === 'function' ? val(prev[actId]) : val;
        return { ...prev, [actId]: nextVal };
      });
    }
  }, []);

  const setIsSearchingWeb = useCallback((val: boolean) => {
    const actId = panesRef.current.find((p) => p.id === activePaneIdRef.current)?.sessionId;
    if (actId) {
      setSearchingWebBySession((prev) => ({ ...prev, [actId]: val }));
    }
  }, []);

  // 1. KHỞI TẠO WEB FONTS & NẠP DỮ LIỆU ĐA PHIÊN, THEME
  useEffect(() => {
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
        setPanes([{ id: 'pane-1', sessionId: null }]);
        setActivePaneId('pane-1');
        setCurrentSessionId(null);
        setMessages([]);
      } catch (err) {
        console.error('[Bootstrap] Lỗi khi nạp dữ liệu:', err);
      } finally {
        setIsReady(true);
      }
    }

    rehydrateContext();
  }, [setCurrentSessionId, setMessages]);

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
        flatListRefs.current[activePaneId]?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages.length, isTomorrowTyping, activePaneId]);

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

  // 2. XỬ LÝ GỬI TIN NHẮN THEO TỪNG PANE (CÔ LẬP THEO TARGET SESSION ID)
  const handleSendMessageInPane = async (
    paneId: string,
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean,
    telemetry?: KeystrokeTelemetry
  ) => {
    const pane = panesRef.current.find((p) => p.id === paneId) || panesRef.current[0];
    let targetSessionId = pane?.sessionId;

    const resolvedBase64 = imageBase64 || (imageUri?.startsWith('data:image') ? cleanBase64(imageUri) : undefined);
    const resolvedUri = imageUri?.startsWith('data:image')
      ? imageUri
      : (resolvedBase64 ? `data:image/jpeg;base64,${resolvedBase64}` : imageUri);

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      sender: 'user',
      text,
      timestamp: Date.now(),
      imageUri: resolvedUri,
      imageBase64: resolvedBase64,
    };

    let currentSess = targetSessionId
      ? sessionsRef.current.find((s) => s.id === targetSessionId)
      : null;
    const existingMessages = currentSess ? currentSess.messages || [] : [];
    const updatedMessages = [...existingMessages, userMsg];

    let sessionTitle = currentSess?.title || 'Cuộc trò chuyện mới';

    if (!targetSessionId) {
      // HẠNG MỤC 1: Tạo ngay sessionId mới cho phiên này để luồng async ghi đúng vào sessionId gốc của chính nó
      targetSessionId = `session-${Date.now()}`;

      const trimmedText = text.trim();
      if (!isPlaceholderOrNoiseTitle(trimmedText) && trimmedText.length > 6) {
        const words = trimmedText.split(/\s+/).filter(Boolean);
        sessionTitle = words.slice(0, 6).join(' ');
        if (words.length > 6) {
          sessionTitle += '...';
        }
      } else if ((imageUri || imageBase64) && (!trimmedText || trimmedText === 'Hãy phân tích nội dung trong ảnh này giúp mình')) {
        sessionTitle = 'Hình ảnh gửi kèm';
      }

      const newSession: ChatSession = {
        id: targetSessionId,
        title: sessionTitle,
        updatedAt: Date.now(),
        messages: updatedMessages,
      };

      // Cập nhật pane này gắn với targetSessionId
      setPanes((prev) =>
        prev.map((p) => (p.id === paneId ? { ...p, sessionId: targetSessionId } : p))
      );
      if (paneId === activePaneIdRef.current) {
        setCurrentSessionIdState(targetSessionId);
      }

      const nextSessions = [newSession, ...sessionsRef.current];
      setSessions(nextSessions);
      await saveSessions(nextSessions);
    } else {
      const updatedSession: ChatSession = {
        id: targetSessionId,
        title: sessionTitle,
        updatedAt: Date.now(),
        messages: updatedMessages,
      };
      const remaining = sessionsRef.current.filter((s) => s.id !== targetSessionId);
      const nextSessions = [updatedSession, ...remaining];
      setSessions(nextSessions);
      await saveSessions(nextSessions);
    }

    // Đặt trạng thái đang gõ/xử lý theo targetSessionId
    setTypingSessionIds((prev) => ({ ...prev, [targetSessionId]: true }));
    setTypingStatusBySession((prev) => ({ ...prev, [targetSessionId]: undefined }));
    setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: false }));
    setIsLoading(true);

    setTimeout(() => {
      flatListRefs.current[paneId]?.scrollToEnd({ animated: true });
    }, 20);

    const deepThinkingTimer = setTimeout(() => {
      setTypingStatusBySession((prev) => ({
        ...prev,
        [targetSessionId]: !prev[targetSessionId] ? '💭 Đang suy nghĩ...' : prev[targetSessionId],
      }));
    }, 2000);

    try {
      const previousSession = sessionsRef.current.find((s) => s.id !== targetSessionId);
      const previousSessionMessages = previousSession?.messages?.slice(-3);

      // HẠNG MỤC 2: Kiểm tra carry-over ảnh từ các tin nhắn gần nhất nếu câu hỏi mang tính tham chiếu hoặc lượt trước lỗi
      const carriedOverImg = resolveCarriedOverVisionImage(text, updatedMessages, resolvedBase64 || resolvedUri);
      const effectiveImage = resolvedBase64 || carriedOverImg;

      const aiResponsePromise = sendMessageToTomorrow(
        text,
        userMemoryRef.current,
        updatedMessages,
        effectiveImage,
        previousSessionMessages,
        forceWebSearch,
        (isSearching) => {
          setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: isSearching }));
          setTypingStatusBySession((prev) => ({
            ...prev,
            [targetSessionId]: isSearching
              ? '🌐 Đang quét web & lấy đường dẫn...'
              : '💭 Đang suy nghĩ...',
          }));
        },
        undefined,
        telemetry
      );

      // HẠNG MỤC 1: Timeout Watchdog linh hoạt: 35s cho tác vụ Vision/STEM/Chuyên sâu/Web search, 15s cho chat nhanh
      const isDeepOrVision = Boolean(effectiveImage || text.length > 80 || forceWebSearch);
      const watchdogMs = isDeepOrVision ? 35000 : 15000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('WATCHDOG_TIMEOUT')), watchdogMs)
      );

      let aiResponse: any;
      try {
        aiResponse = await Promise.race([aiResponsePromise, timeoutPromise]);
      } catch (err: any) {
        const errMsg = err?.message || 'Unknown error';
        console.error('[AI Error Detail]:', errMsg);
        aiResponse = localResilientFallback(text, Boolean(effectiveImage), userMemoryRef.current);
        if (!aiResponse || !aiResponse.replies || aiResponse.replies.length === 0) {
          const isTM =
            userMemoryRef.current.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(text);
          const errorDisplay = isTM
            ? `Lỗi hệ thống (${errMsg}) — m thử gửi lại giúp t nhé!`
            : `Lỗi hệ thống (${errMsg}) — bạn thử gửi lại giúp mình nhé!`;
          aiResponse = {
            replies: [errorDisplay],
            conversation_state: 'casual_friend',
            should_update_title: false,
          };
        }
      } finally {
        clearTimeout(deepThinkingTimer);
        setTypingStatusBySession((prev) => ({ ...prev, [targetSessionId]: undefined }));
        setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: false }));
      }

      // Cập nhật tiêu đề nếu có
      const aiSessionTitle = (aiResponse.session_title || aiResponse.sessionTitle || '').trim();
      let updatedTitle = sessionTitle;
      const isValidNewTitle = !isPlaceholderOrNoiseTitle(aiSessionTitle);
      const shouldUpdate =
        isValidNewTitle &&
        (isPlaceholderOrNoiseTitle(sessionTitle) || aiResponse.should_update_title === true);

      if (shouldUpdate) {
        updatedTitle = aiSessionTitle;
      }

      const replies =
        aiResponse.replies && aiResponse.replies.length > 0
          ? aiResponse.replies
          : [aiResponse.reply || 'ơi'];

      let currentHistory = [...updatedMessages];

      // HẠNG MỤC 1 & 2: TÁCH BONG BÓNG VÀ LƯU VÀO targetSessionId KHÔNG BỊ HỦY BỞI Cmd+N
      for (const [index, replyText] of replies.entries()) {
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

        // Tự động cập nhật messages và updatedAt của đúng targetSessionId trong sessions và CHAT_SESSIONS_V2
        setSessions((prevSessions) => {
          const sessIndex = prevSessions.findIndex((s) => s.id === targetSessionId);
          if (sessIndex === -1) return prevSessions;
          const copy = [...prevSessions];
          copy[sessIndex] = {
            ...copy[sessIndex],
            title: updatedTitle,
            updatedAt: Date.now(),
            messages: currentHistory,
            lastIntent: aiResponse.jarvis_intent,
          };
          saveSessions(copy);
          return copy;
        });

        setTimeout(() => {
          flatListRefs.current[paneId]?.scrollToEnd({ animated: true });
        }, 50);

        if (!isLastReply) {
          setTypingSessionIds((prev) => ({ ...prev, [targetSessionId]: true }));
          const typingDelay = Math.min(Math.max(replyText.length * 8, 300), 450);
          await sleep(typingDelay);
        } else {
          setTypingSessionIds((prev) => {
            const copy = { ...prev };
            delete copy[targetSessionId];
            return copy;
          });
        }
      }

      if (aiResponse.memoryUpdate || aiResponse.memory_note) {
        const memoryNote = aiResponse.memory_note || aiResponse.memoryNote;
        const memoryUpdateObj =
          aiResponse.memoryUpdate ||
          (memoryNote
            ? {
                currentProblem: memoryNote,
                summary: memoryNote,
              }
            : {});

        const cleanedUpdate = cleanNightNotesFromMemory({
          ...userMemoryRef.current,
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
      console.error('[App] Lỗi trò chuyện trong phiên:', targetSessionId, error);
    } finally {
      setTypingSessionIds((prev) => {
        const copy = { ...prev };
        delete copy[targetSessionId];
        return copy;
      });
      setTypingStatusBySession((prev) => ({ ...prev, [targetSessionId]: undefined }));
      setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: false }));
      setIsLoading(false);
    }
  };

  // Wrapper gửi tin nhắn cho active pane
  const handleSendMessage = async (
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean,
    telemetry?: KeystrokeTelemetry
  ) => {
    return handleSendMessageInPane(activePaneIdRef.current, text, imageBase64, imageUri, forceWebSearch, telemetry);
  };

  // 3. TẠO CUỘC TRÒ CHUYỆN MỚI TRÊN PANE ĐANG ACTIVE (handleNewChat / handleNewChatInActivePane)
  const handleNewChat = useCallback(() => {
    // A. Tăng số UI turn để quản lý phiên giao diện nhưng KHÔNG hủy luồng async của phiên cũ
    currentSessionTurnIdRef.current++;

    // B. Chuyển focus giao diện chính sang phiên mới trống trên pane đang active (sessionId = null)
    const activeId = activePaneIdRef.current;
    setPanes((prev) =>
      prev.map((p) => (p.id === activeId ? { ...p, sessionId: null } : p))
    );
    setCurrentSessionId(null);
    setMessages([]);

    // C. Dọn ô nhập / ảnh tạm của khung đang soạn trong pane đó
    inputBarRef.current?.clear?.();
    inputBarRef.current?.reset?.();
    inputBarRefs.current[activeId]?.clear?.();
    inputBarRefs.current[activeId]?.reset?.();

    // D. Đóng Command Palette nếu đang mở
    setIsCommandPaletteOpen(false);

    // E. Focus ô nhập liệu sau 50ms để sẵn sàng gõ ngay
    setTimeout(() => {
      inputBarRef.current?.focus();
      inputBarRefs.current[activeId]?.focus();
    }, 50);
  }, [setCurrentSessionId, setMessages]);

  const handleNewChatInActivePane = handleNewChat;

  const handleNewChatInPane = useCallback((paneId: string) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === paneId ? { ...p, sessionId: null } : p))
    );
    setActivePaneId(paneId);
    if (paneId === activePaneIdRef.current) {
      setCurrentSessionId(null);
      setMessages([]);
    }
    inputBarRefs.current[paneId]?.clear?.();
    inputBarRefs.current[paneId]?.reset?.();
    setTimeout(() => {
      inputBarRefs.current[paneId]?.focus();
    }, 50);
  }, [setCurrentSessionId, setMessages]);

  // Lưu tham chiếu mới nhất để tránh stale closure trong global event listener
  const handleNewChatRef = useRef(handleNewChat);
  handleNewChatRef.current = handleNewChat;

  // Giữ alias handleCreateNewSession để bảo toàn 100% tương thích ngược
  const handleCreateNewSession = handleNewChat;

  // HẠNG MỤC 2: CÁC THAO TÁC SPLIT PANES (CHIA ĐÔI, THÊM PANE, ĐÓNG PANE, ĐỔI PHIÊN)
  const handleToggleSplitPanes = useCallback(() => {
    setPanes((prev) => {
      if (prev.length <= 1) {
        // Đang 1 pane: Mở chia đôi 2 pane 50/50 kiểu VS Code
        const firstPane = prev[0] || { id: 'pane-1', sessionId: null };
        const otherSession = sessionsRef.current.find((s) => s.id !== firstPane.sessionId);
        const newPane: ChatPane = {
          id: `pane-${Date.now()}`,
          sessionId: otherSession ? otherSession.id : null,
        };
        setActivePaneId(newPane.id);
        return [firstPane, newPane];
      } else {
        // Đang chia pane: Gộp lại còn 1 pane chính (pane đang active)
        const currentActive =
          prev.find((p) => p.id === activePaneIdRef.current) || prev[0];
        return [currentActive];
      }
    });
  }, []);

  const handleAddPane = useCallback(() => {
    setPanes((prev) => {
      if (prev.length >= 3) return prev; // Hỗ trợ tối đa 3 cửa sổ
      const newPaneId = `pane-${Date.now()}`;
      setActivePaneId(newPaneId);
      return [
        ...prev,
        {
          id: newPaneId,
          sessionId: null,
        },
      ];
    });
  }, []);

  const handleClosePane = useCallback((paneId: string) => {
    setPanes((prev) => {
      if (prev.length <= 1) return prev; // Giữ ít nhất 1 pane
      const remaining = prev.filter((p) => p.id !== paneId);
      if (activePaneIdRef.current === paneId) {
        const nextActive = remaining[0];
        setActivePaneId(nextActive.id);
        setCurrentSessionId(nextActive.sessionId);
      }
      return remaining;
    });
  }, [setCurrentSessionId]);

  const handleSwitchSessionInPane = useCallback((paneId: string, sessionId: string | null) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === paneId ? { ...p, sessionId } : p))
    );
    setActivePaneId(paneId);
    if (paneId === activePaneIdRef.current) {
      setCurrentSessionId(sessionId);
    }
    setOpenDropdownPaneId(null);
    setTimeout(() => {
      flatListRefs.current[paneId]?.scrollToEnd({ animated: true });
    }, 50);
  }, [setCurrentSessionId]);

  const handleToggleSplitPanesRef = useRef(handleToggleSplitPanes);
  handleToggleSplitPanesRef.current = handleToggleSplitPanes;

  // 4. CHỌN 1 PHIÊN TRÒ CHUYỆN CŨ TỪ SIDEBAR HOẶC COMMAND PALETTE (mở trong active pane)
  const handleSelectSession = (sessionId: string) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === activePaneId ? { ...p, sessionId } : p))
    );
    setCurrentSessionId(sessionId);
    const selected = sessions.find((s) => s.id === sessionId);
    if (selected) {
      setMessages(selected.messages || []);
      setTimeout(() => {
        flatListRefs.current[activePaneId]?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  // 5. XÓA 1 PHIÊN TRÒ CHUYỆN
  const handleDeleteSession = async (sessionId: string) => {
    const updated = await deleteSession(sessionId);
    setSessions(updated);
    setPanes((prev) =>
      prev.map((p) => (p.sessionId === sessionId ? { ...p, sessionId: null } : p))
    );
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  // 6. XÓA TOÀN BỘ LỊCH SỬ & RESET
  const handleClearAll = async () => {
    await clearAllChatData();
    setSessions([]);
    setPanes([{ id: 'pane-1', sessionId: null }]);
    setActivePaneId('pane-1');
    setCurrentSessionId(null);
    setMessages([]);
    setUserMemory(DEFAULT_USER_MEMORY);
  };

  // 7. LẮNG NGHE PHÍM TẮT TOÀN CỤC CHUẨN MACOS TRÊN WEB (Cmd+K, Cmd+N, Cmd+B, Cmd+ArrowUp, Escape)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';

      // Cmd/Ctrl + N: Tạo cuộc trò chuyện mới sạch & focus ô nhập liệu
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'n' || code === 'KeyN')) {
        e.preventDefault();
        e.stopPropagation();
        handleNewChatRef.current();
        return;
      }

      // HẠNG MỤC 2: Cmd/Ctrl + ArrowUp: Bật / Tắt chia đôi cửa sổ chat (Split Panes) kiểu VS Code
      if (
        isCmdOrCtrl &&
        !e.altKey &&
        !e.shiftKey &&
        (key === 'arrowup' || code === 'ArrowUp')
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleToggleSplitPanesRef.current();
        return;
      }

      // Cmd/Ctrl + K: Bật/tắt bảng lệnh nhanh Command Palette
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'k' || code === 'KeyK')) {
        e.preventDefault();
        e.stopPropagation();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl + B: Đóng/Mở Sidebar
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'b' || code === 'KeyB')) {
        e.preventDefault();
        e.stopPropagation();
        setIsSidebarOpen((prev) => !prev);
        return;
      }

      // Escape: Đóng dropdown pane nếu đang mở hoặc đóng Command Palette
      if (e.key === 'Escape' || code === 'Escape') {
        if (openDropdownPaneId) {
          e.preventDefault();
          e.stopPropagation();
          setOpenDropdownPaneId(null);
          return;
        }
        if (isCommandPaletteOpenRef.current) {
          e.preventDefault();
          e.stopPropagation();
          setIsCommandPaletteOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, [openDropdownPaneId]);

  // HẠNG MỤC 3: DÁN ẢNH Cmd+V & KÉO-THẢ (DRAG & DROP) CHO VISION LAB TRÊN MACBOOK / WEB
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            try {
              const opt = await compressImageForVision(file);
              const imgObj = {
                uri: opt.dataUrl || `data:${opt.mimeType};base64,${opt.base64}`,
                base64: opt.base64,
                sizeKB: opt.sizeKB,
              };
              const activeId = activePaneIdRef.current;
              inputBarRefs.current[activeId]?.setSelectedImage?.(imgObj);
            } catch (err) {
              console.warn('[Vision Paste] Lỗi nén ảnh:', err);
            }
            break;
          }
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDraggingImage(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        setIsDraggingImage(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingImage(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          try {
            const opt = await compressImageForVision(file);
            const imgObj = {
              uri: opt.dataUrl || `data:${opt.mimeType};base64,${opt.base64}`,
              base64: opt.base64,
              sizeKB: opt.sizeKB,
            };
            const activeId = activePaneIdRef.current;
            inputBarRefs.current[activeId]?.setSelectedImage?.(imgObj);
          } catch (err) {
            console.warn('[Vision Drop] Lỗi nén ảnh:', err);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

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

  // Trên Mobile chỉ hiển thị 1 pane (active pane), trên Desktop hỗ trợ Split Panes song song
  const displayedPanes = isDesktop ? panes : panes.filter((p) => p.id === activePaneId);

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
                <Text style={[styles.liveText, { color: theme.liveBadgeText }]}>Online • v4.5.3</Text>
              </View>
            </View>
          </View>

          {/* Cụm nút góc phải: Nút Command Palette ⌘K (trên Desktop) + Nút Split Panes (⌘↑) + Nút Theme Sáng/Tối + Nút Tạo Cuộc Trò Chuyện Mới */}
          <View style={styles.headerRightActions}>
            {/* Nút Command Palette ⌘K tinh tế trên Desktop (width >= 768px) */}
            {isDesktop && (
              <Pressable
                style={({ pressed }) => [
                  styles.commandPaletteBtn,
                  {
                    backgroundColor:
                      theme.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.04)',
                    borderColor: theme.borderSubtle,
                  },
                  pressed && { backgroundColor: theme.btnHover },
                  Platform.OS === 'web' && { cursor: 'pointer' as any },
                ]}
                onPress={() => setIsCommandPaletteOpen(true)}
                hitSlop={6}
              >
                <Search size={14} color={theme.textMuted} />
                <Text
                  style={[
                    styles.commandPaletteBtnText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Tìm kiếm
                </Text>
                <View
                  style={[
                    styles.shortcutKbd,
                    {
                      backgroundColor:
                        theme.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(0, 0, 0, 0.06)',
                      borderColor: theme.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[styles.shortcutKbdText, { color: theme.textMuted }]}
                  >
                    ⌘K
                  </Text>
                </View>
              </Pressable>
            )}

            {/* HẠNG MỤC 2: Nút Chia đôi cửa sổ chat (⌘↑) trên Desktop (width >= 768px) */}
            {isDesktop && (
              <Pressable
                style={({ pressed }) => [
                  styles.headerBtn,
                  {
                    backgroundColor:
                      panes.length > 1
                        ? (theme.mode === 'dark'
                            ? 'rgba(139, 92, 246, 0.25)'
                            : 'rgba(99, 102, 241, 0.18)')
                        : theme.btnBg,
                    borderColor:
                      panes.length > 1
                        ? (theme.mode === 'dark' ? '#8B5CF6' : '#6366F1')
                        : 'transparent',
                    borderWidth: panes.length > 1 ? 1 : 0,
                  },
                  pressed && { backgroundColor: theme.btnHover },
                  Platform.OS === 'web' && { cursor: 'pointer' as any },
                ]}
                onPress={handleToggleSplitPanes}
                hitSlop={8}
              >
                <Columns2
                  size={19}
                  color={panes.length > 1 ? (theme.mode === 'dark' ? '#A78BFA' : '#4F46E5') : theme.btnIcon}
                />
              </Pressable>
            )}

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

          {/* Khung chat chính: Hỗ trợ Split Chat Panes kiểu VS Code song song */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.keyboardContainer, { backgroundColor: theme.bgMain }]}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View
              style={[
                styles.panesContainer,
                isDraggingImage && {
                  borderColor: '#3B82F6',
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  backgroundColor:
                    themeMode === 'dark'
                      ? 'rgba(59, 130, 246, 0.08)'
                      : 'rgba(59, 130, 246, 0.04)',
                },
              ]}
            >
              {isDraggingImage && (
                <View style={styles.dragDropBadgeContainer} pointerEvents="none">
                  <View style={[styles.dragDropBadge, { backgroundColor: '#2563EB' }]}>
                    <Text style={styles.dragDropBadgeText}>
                      Thả ảnh vào đây để nén và đính kèm Vision Lab
                    </Text>
                  </View>
                </View>
              )}
              {displayedPanes.map((pane, paneIndex) => {
                const isActive = pane.id === activePaneId;
                const paneSession = pane.sessionId
                  ? sessions.find((s) => s.id === pane.sessionId)
                  : null;
                const paneMessages = paneSession?.messages || [];
                const isTyping = !!(pane.sessionId && typingSessionIds[pane.sessionId]);
                const isSearching = !!(pane.sessionId && searchingWebBySession[pane.sessionId]);
                const statusText = pane.sessionId ? typingStatusBySession[pane.sessionId] : undefined;
                const isDropdownOpen = openDropdownPaneId === pane.id;
                const showPaneScrollDown = !!scrollDownByPane[pane.id];
                const hasPaneHistory = paneMessages.length > 0;
                const paneGreeting = getColdGreetingText(userMemory, hasPaneHistory);

                const rawTitle = paneSession?.title;
                const displayTitle = isPlaceholderOrNoiseTitle(rawTitle)
                  ? 'Trò chuyện ngắn'
                  : (rawTitle?.trim() || 'Cuộc trò chuyện mới');

                return (
                  <View
                    key={pane.id}
                    style={[
                      styles.singlePaneWrapper,
                      panes.length > 1 && {
                        flex: 1,
                        borderLeftWidth: paneIndex > 0 ? 1 : 0,
                        borderLeftColor: theme.borderSubtle,
                      },
                      panes.length > 1 && isActive && {
                        borderColor: theme.mode === 'dark' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(99, 102, 241, 0.4)',
                      },
                    ]}
                    onStartShouldSetResponder={() => {
                      if (activePaneId !== pane.id) {
                        setActivePaneId(pane.id);
                        setCurrentSessionIdState(pane.sessionId);
                      }
                      return false;
                    }}
                  >
                    {/* Header Bar của từng Pane (hiển thị khi có từ 2 panes trở lên) */}
                    {panes.length > 1 && (
                      <View
                        style={[
                          styles.paneHeaderBar,
                          {
                            backgroundColor: isActive
                              ? (theme.mode === 'dark' ? '#141824' : '#F8FAFC')
                              : (theme.mode === 'dark' ? '#0F121B' : '#F1F5F9'),
                            borderBottomColor: isActive
                              ? (theme.mode === 'dark' ? '#8B5CF6' : '#6366F1')
                              : theme.borderSubtle,
                            borderBottomWidth: isActive ? 2 : 1,
                          },
                        ]}
                      >
                        {/* Dropdown Selector chọn phiên trong pane này */}
                        <Pressable
                          style={({ pressed }) => [
                            styles.paneDropdownBtn,
                            {
                              backgroundColor: isActive
                                ? (theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)')
                                : 'transparent',
                              borderColor: isActive ? theme.borderSubtle : 'transparent',
                            },
                            pressed && { opacity: 0.8 },
                            Platform.OS === 'web' && { cursor: 'pointer' as any },
                          ]}
                          onPress={() => setOpenDropdownPaneId(isDropdownOpen ? null : pane.id)}
                          hitSlop={6}
                        >
                          {isTyping && (
                            <View style={styles.typingDotGlow} />
                          )}
                          <MessageSquare
                            size={13}
                            color={isActive ? (theme.mode === 'dark' ? '#A78BFA' : '#4F46E5') : theme.textMuted}
                          />
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.paneDropdownText,
                              { color: isActive ? theme.textPrimary : theme.textSecondary },
                            ]}
                          >
                            {displayTitle}
                          </Text>
                          <ChevronDown size={13} color={theme.textMuted} />
                        </Pressable>

                        {/* Cụm nút hành động góc phải của pane */}
                        <View style={styles.paneActionsRight}>
                          {/* Nút Tạo chat mới trong pane này */}
                          <Pressable
                            style={({ pressed }) => [
                              styles.paneIconBtn,
                              pressed && { backgroundColor: theme.btnHover },
                              Platform.OS === 'web' && { cursor: 'pointer' as any },
                            ]}
                            onPress={() => handleNewChatInPane(pane.id)}
                            hitSlop={6}
                          >
                            <SquarePen size={14} color={theme.textSecondary} />
                          </Pressable>

                          {/* Nút Thêm pane (+ tối đa 3) */}
                          {panes.length < 3 && (
                            <Pressable
                              style={({ pressed }) => [
                                styles.paneIconBtn,
                                pressed && { backgroundColor: theme.btnHover },
                                Platform.OS === 'web' && { cursor: 'pointer' as any },
                              ]}
                              onPress={handleAddPane}
                              hitSlop={6}
                            >
                              <Plus size={15} color={theme.textSecondary} />
                            </Pressable>
                          )}

                          {/* Nút Đóng pane (×) */}
                          {panes.length > 1 && (
                            <Pressable
                              style={({ pressed }) => [
                                styles.paneIconBtn,
                                pressed && { backgroundColor: theme.btnHover },
                                Platform.OS === 'web' && { cursor: 'pointer' as any },
                              ]}
                              onPress={() => handleClosePane(pane.id)}
                              hitSlop={6}
                            >
                              <X size={15} color={theme.textSecondary} />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    )}

                    {/* Popover Dropdown chọn phiên trong pane này */}
                    {isDropdownOpen && (
                      <View
                        style={[
                          styles.paneDropdownPopover,
                          {
                            backgroundColor: theme.mode === 'dark' ? '#181C28' : '#FFFFFF',
                            borderColor: theme.borderSubtle,
                            shadowColor: '#000',
                            shadowOpacity: theme.mode === 'dark' ? 0.45 : 0.15,
                          },
                        ]}
                      >
                        <Pressable
                          style={({ pressed }) => [
                            styles.paneDropdownItem,
                            pressed && { backgroundColor: theme.btnHover },
                            Platform.OS === 'web' && { cursor: 'pointer' as any },
                          ]}
                          onPress={() => handleSwitchSessionInPane(pane.id, null)}
                        >
                          <Plus size={14} color="#8B5CF6" />
                          <Text style={[styles.paneDropdownItemText, { color: '#8B5CF6', fontWeight: '600' }]}>
                            + Cuộc trò chuyện mới
                          </Text>
                        </Pressable>
                        <View style={[styles.paneDropdownDivider, { backgroundColor: theme.borderSubtle }]} />
                        <ScrollView style={styles.paneDropdownScroll} showsVerticalScrollIndicator={false}>
                          {sessions.map((sess) => {
                            const isCurrent = sess.id === pane.sessionId;
                            const sTitle = isPlaceholderOrNoiseTitle(sess.title)
                              ? 'Trò chuyện ngắn'
                              : (sess.title || 'Cuộc trò chuyện mới');
                            return (
                              <Pressable
                                key={sess.id}
                                style={({ pressed }) => [
                                  styles.paneDropdownItem,
                                  isCurrent && {
                                    backgroundColor:
                                      theme.mode === 'dark'
                                        ? 'rgba(139, 92, 246, 0.15)'
                                        : 'rgba(99, 102, 241, 0.08)',
                                  },
                                  pressed && { backgroundColor: theme.btnHover },
                                  Platform.OS === 'web' && { cursor: 'pointer' as any },
                                ]}
                                onPress={() => handleSwitchSessionInPane(pane.id, sess.id)}
                              >
                                <MessageSquare size={13} color={isCurrent ? '#8B5CF6' : theme.textSecondary} />
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.paneDropdownItemText,
                                    {
                                      color: isCurrent ? theme.textPrimary : theme.textSecondary,
                                      fontWeight: isCurrent ? '700' : '500',
                                    },
                                  ]}
                                >
                                  {sTitle}
                                </Text>
                                {typingSessionIds[sess.id] && (
                                  <View style={styles.typingDotGlow} />
                                )}
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}

                    {/* Khu vực Tin nhắn của Pane */}
                    <View style={styles.chatAreaWrapper}>
                      {paneMessages.length === 0 ? (
                        <ColdGreeting
                          greetingText={paneGreeting}
                          userMemory={userMemory}
                          hasHistory={false}
                          onSelectSuggestion={(text) => handleSendMessageInPane(pane.id, text)}
                          theme={theme}
                        />
                      ) : (
                        <FlatList
                          ref={(r) => {
                            flatListRefs.current[pane.id] = r;
                            if (isActive) flatListRef.current = r;
                          }}
                          data={paneMessages}
                          keyExtractor={(item) => item.id}
                          renderItem={({ item }) => (
                            <ChatBubble message={item} isDesktop={isDesktop} theme={theme} />
                          )}
                          style={styles.flatListStyle}
                          contentContainerStyle={[
                            styles.chatListContent,
                            { paddingHorizontal: panes.length > 1 ? 16 : (isDesktop ? 28 : 16) },
                          ]}
                          showsVerticalScrollIndicator={false}
                          onScroll={(e) => {
                            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                            setScrollDownByPane((prev) => ({ ...prev, [pane.id]: distanceFromBottom > 250 }));
                          }}
                          scrollEventThrottle={16}
                          ListFooterComponent={
                            <TypingIndicator
                              visible={isTyping || isSearching}
                              isSearchingWeb={isSearching}
                              statusText={statusText}
                              isDesktop={isDesktop}
                              theme={theme}
                            />
                          }
                        />
                      )}

                      {/* Nút tròn nhỏ "↓" cuộn mượt xuống đáy */}
                      {showPaneScrollDown && (
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
                          onPress={() => flatListRefs.current[pane.id]?.scrollToEnd({ animated: true })}
                          hitSlop={8}
                        >
                          <ChevronDown size={18} color={theme.textPrimary} />
                        </Pressable>
                      )}

                      {/* Floating Input Bar độc lập cho từng Pane */}
                      <FloatingInputBar
                        ref={(r) => {
                          inputBarRefs.current[pane.id] = r;
                          if (isActive) inputBarRef.current = r;
                        }}
                        onSendMessage={(text, imgBase64, imgUri, forceWebSearch, telemetry) =>
                          handleSendMessageInPane(pane.id, text, imgBase64, imgUri, forceWebSearch, telemetry)
                        }
                        isLoading={false}
                        isTomorrowTyping={isTyping}
                        theme={theme}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </KeyboardAvoidingView>
        </View>

        {/* Bảng lệnh nhanh Command Palette macOS Spotlight (Cmd+K) */}
        <CommandPalette
          visible={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onCreateNewSession={handleNewChat}
          onNewChat={handleNewChat}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onToggleTheme={handleToggleTheme}
          onToggleSplitPanes={handleToggleSplitPanes}
          isSplitPanes={panes.length > 1}
          theme={theme}
          themeMode={themeMode}
        />
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
  commandPaletteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  commandPaletteBtnText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        : undefined,
  },
  shortcutKbd: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  shortcutKbdText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  panesContainer: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  singlePaneWrapper: {
    flex: 1,
    height: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  paneHeaderBar: {
    height: 40,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  paneDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: '70%',
  },
  paneDropdownText: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  typingDotGlow: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  paneActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paneIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paneDropdownPopover: {
    position: 'absolute',
    top: 42,
    left: 12,
    width: 260,
    maxHeight: 280,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    zIndex: 99,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  paneDropdownScroll: {
    maxHeight: 220,
  },
  paneDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  paneDropdownItemText: {
    fontSize: 12.5,
    flex: 1,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  paneDropdownDivider: {
    height: 1,
    marginVertical: 4,
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
  dragDropBadgeContainer: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  dragDropBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  dragDropBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
