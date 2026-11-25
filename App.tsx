import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  flattenReplyToMarkdown,
  detectExpertDomain,
  buildLocalReflexDirective,
  resolveDualPersona,
  buildChronoContext,
} from './services/aiService';
import {
  generateProactiveGreeting,
  ProactiveGreetingPayload,
} from './services/proactiveGreetingService';
import { ChatBubble } from './components/ChatBubble';
import { ColdGreeting } from './components/ColdGreeting';
import { TomorrowGlyph, getTimeBasedGreeting } from './components/TomorrowGlyph';
import { PromptBox, PromptBoxRef } from './components/PromptBox';
import { SidebarDrawer } from './components/SidebarDrawer';
import { TypingIndicator } from './components/TypingIndicator';
import { CommandPalette } from './components/CommandPalette';
import { CommandTriggerButton, CommandTriggerButtonRef } from './components/CommandTriggerButton';
import { MemoryVaultModal } from './components/MemoryVaultModal';
import { StructuredMemoryVault } from './types/chat';
import {
  Notebook,
  loadNotebooks,
  saveNotebooks,
  createNotebook,
  renameNotebook,
  deleteNotebook,
  saveNotebookWorkspace,
  DEFAULT_NOTEBOOK,
  DEFAULT_NOTEBOOK_ID,
} from './storage/notebookStorage';
import {
  Menu,
  Sparkles,
  Dot,
  SquarePen,
  ChevronDown,
  Search,
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
import { injectThemeTransitionStyles, runCircularThemeTransition } from './utils/themeTransition';
import { compressImageForVision, cleanBase64 } from './utils/imageOptimizer';

// Kiểm tra câu chào ngắn xã giao hoặc placeholder (tương thích ngược)
export const isGreetingOrTooShort = (text: string) => {
  return isPlaceholderOrNoiseTitle(text);
};

export interface ChatPane {
  id: string;
  sessionId: string | null;
}

interface ChatPaneViewProps {
  pane: ChatPane;
  paneIndex: number;
  totalPanes: number;
  isActive: boolean;
  isSplitMode: boolean;
  sessions: ChatSession[];
  paneSession: ChatSession | null;
  paneMessages: ChatMessage[];
  isTyping: boolean;
  isSearching: boolean;
  statusText?: string;
  isDropdownOpen: boolean;
  showScrollDown: boolean;
  userMemory: UserMemoryProfile;
  theme: any;
  isDesktop: boolean;
  isCloseMode?: boolean;
  isCloseTarget?: boolean;
  activeNotebookId?: string;
  activeNotebookName?: string;
  onConfirmClose?: () => void;
  onSelectPane: (paneId: string) => void;
  onToggleDropdown: (paneId: string) => void;
  onNewChatInPane: (paneId: string) => void;
  handleAddPane: () => void;
  handleClosePane: (paneId: string) => void;
  handleSwitchSessionInPane: (paneId: string, sessionId: string | null) => void;
  handleSendMessageInPane: (
    paneId: string,
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean,
    telemetry?: KeystrokeTelemetry
  ) => void;
  isGenerating?: boolean;
  onStopGeneration?: () => void;
  proactiveGreeting?: ProactiveGreetingPayload;
  isStorageHydrated?: boolean;
  onResumeSession?: (paneId: string, targetSessionId: string) => void;
  onScroll: (e: any) => void;
  onScrollDownPress: () => void;
  setFlatListRef: (r: FlatList<ChatMessage> | null) => void;
  setInputBarRef: (r: PromptBoxRef | null) => void;
}

// BỘ THÀNH PHẦN CHAT PANE DUY NHẤT CHUNG CHO MỌI KHUNG CHAT (ĐẢM BẢO 100% ĐỒNG NHẤT TỪNG PIXEL)
const ChatPaneView: React.FC<ChatPaneViewProps> = React.memo(({
  pane,
  paneIndex,
  totalPanes,
  isActive,
  isSplitMode,
  isCloseMode,
  isCloseTarget,
  activeNotebookId = DEFAULT_NOTEBOOK_ID,
  activeNotebookName,
  onConfirmClose,
  sessions,
  paneSession,
  paneMessages,
  isTyping,
  isSearching,
  isGenerating = false,
  onStopGeneration,
  proactiveGreeting,
  isStorageHydrated = true,
  onResumeSession,
  statusText,
  isDropdownOpen,
  showScrollDown,
  userMemory,
  theme,
  isDesktop,
  onSelectPane,
  onToggleDropdown,
  onNewChatInPane,
  handleAddPane,
  handleClosePane,
  handleSwitchSessionInPane,
  handleSendMessageInPane,
  onScroll,
  onScrollDownPress,
  setFlatListRef,
  setInputBarRef,
}) => {
  const hasPaneHistory = paneMessages.length > 0;
  const isQuadOrDenseSplit = totalPanes >= 3;

  const rawTitle = paneSession?.title;
  const displayTitle = isPlaceholderOrNoiseTitle(rawTitle)
    ? 'Trò chuyện ngắn'
    : (rawTitle?.trim() || 'Cuộc trò chuyện mới');

  return (
    <View
      key={pane.id}
      style={[
        styles.singlePaneWrapper,
        totalPanes > 1 && {
          borderLeftWidth: paneIndex > 0 ? 1 : 0,
          borderLeftColor: theme.borderSubtle,
        },
        totalPanes > 1 && isActive && !isCloseMode && {
          borderColor: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
        },
        isCloseMode && !isCloseTarget && {
          opacity: 0.72,
        },
        isCloseMode && isCloseTarget && {
          borderColor: '#EF4444',
          borderWidth: 2,
          backgroundColor: theme.mode === 'dark' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
        },
        Platform.OS === 'web' && ({
          animation: 'macosPanePop 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        } as any),
      ]}
      onStartShouldSetResponder={() => {
        if (isCloseMode) {
          return false;
        }
        if (!isActive) {
          onSelectPane(pane.id);
        }
        return false;
      }}
    >
      {/* Header Bar của từng Pane (hiển thị khi có từ 2 panes trở lên) */}
      {totalPanes > 1 && (
        <View
          style={[
            styles.paneHeaderBar,
            isQuadOrDenseSplit && { paddingHorizontal: 8 },
            {
              backgroundColor: isActive
                ? (theme.mode === 'dark' ? '#1C1C1E' : '#F7F7F8')
                : (theme.mode === 'dark' ? '#141414' : '#F1F1F3'),
              borderBottomColor: isActive
                ? (theme.mode === 'dark' ? '#FFFFFF' : '#000000')
                : theme.borderSubtle,
              borderBottomWidth: isActive ? 2 : 1,
            },
          ]}
        >
          {/* Dropdown Selector chọn phiên trong pane này */}
          <Pressable
            style={({ pressed }) => [
              styles.paneDropdownBtn,
              isQuadOrDenseSplit && { flex: 1, minWidth: 0, marginRight: 4, maxWidth: '68%' },
              {
                backgroundColor: isActive
                  ? (theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
                  : 'transparent',
                borderColor: isActive ? theme.borderSubtle : 'transparent',
              },
              pressed && { opacity: 0.8 },
              Platform.OS === 'web' && { cursor: 'pointer' as any },
            ]}
            onPress={() => onToggleDropdown(pane.id)}
            hitSlop={6}
          >
            {isTyping && (
              <View style={styles.typingDotGlow} />
            )}
            <MessageSquare
              size={13}
              color={isActive ? (theme.mode === 'dark' ? '#F4F4F5' : '#18181B') : theme.textMuted}
            />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.paneDropdownText,
                isQuadOrDenseSplit && { fontSize: 11.5, flexShrink: 1 },
                { color: isActive ? theme.textPrimary : theme.textSecondary },
              ]}
            >
              {displayTitle}
            </Text>
            <ChevronDown size={13} color={theme.textMuted} />
          </Pressable>

          {/* Cụm nút hành động góc phải của pane */}
          <View style={[styles.paneActionsRight, isQuadOrDenseSplit && { gap: 4, flexShrink: 0 }]}>
            {isCloseMode && isCloseTarget ? (
              <Pressable
                style={({ pressed }) => [
                  styles.closeTargetPill,
                  pressed && { opacity: 0.8 },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={onConfirmClose}
                hitSlop={6}
              >
                <Text style={styles.closeTargetPillText}>✕ Enter để đóng</Text>
              </Pressable>
            ) : (
              <>
                {/* Nút Tạo chat mới trong pane này */}
                <Pressable
                  style={({ pressed }) => [
                    styles.paneIconBtn,
                    pressed && { backgroundColor: theme.btnHover },
                    Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                  ]}
                  onPress={() => onNewChatInPane(pane.id)}
                  hitSlop={6}
                >
                  <SquarePen size={14} color={theme.textSecondary} />
                </Pressable>

                {/* Nút Thêm pane (+ tối đa 4) */}
                {totalPanes < 4 && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.paneIconBtn,
                      pressed && { backgroundColor: theme.btnHover },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={handleAddPane}
                    hitSlop={6}
                  >
                    <Plus size={15} color={theme.textSecondary} />
                  </Pressable>
                )}

                {/* Nút Đóng pane (×) */}
                {totalPanes > 1 && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.paneIconBtn,
                      pressed && { backgroundColor: theme.btnHover },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={() => handleClosePane(pane.id)}
                    hitSlop={6}
                  >
                    <X size={15} color={theme.textSecondary} />
                  </Pressable>
                )}
              </>
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
              backgroundColor: theme.mode === 'dark' ? '#202020' : '#FFFFFF',
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
            <Plus size={14} color={theme.textPrimary} />
            <Text style={[styles.paneDropdownItemText, { color: theme.textPrimary, fontWeight: '600' }]}>
              + Cuộc trò chuyện mới
            </Text>
          </Pressable>
          <View style={[styles.paneDropdownDivider, { backgroundColor: theme.borderSubtle }]} />
          <ScrollView style={styles.paneDropdownScroll} showsVerticalScrollIndicator={false}>
            {(() => {
              const notebookSessions = sessions.filter(
                (s) => (s.notebookId || DEFAULT_NOTEBOOK_ID) === activeNotebookId
              );
              if (notebookSessions.length === 0) {
                return (
                  <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center' }}>
                      Chưa có cuộc trò chuyện nào trong sổ này
                    </Text>
                  </View>
                );
              }
              return notebookSessions.map((sess) => {
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
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.06)',
                      },
                      pressed && { backgroundColor: theme.btnHover },
                      Platform.OS === 'web' && { cursor: 'pointer' as any },
                    ]}
                    onPress={() => handleSwitchSessionInPane(pane.id, sess.id)}
                  >
                    <MessageSquare size={13} color={isCurrent ? (theme.mode === 'dark' ? '#F4F4F5' : '#18181B') : theme.textSecondary} />
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
                    {isTyping && (
                      <View style={styles.typingDotGlow} />
                    )}
                  </Pressable>
                );
              });
            })()}
          </ScrollView>
        </View>
      )}

      {/* Khu vực Tin nhắn của Pane */}
      <View style={styles.chatAreaWrapper}>
        {paneMessages.length === 0 ? (
          <View
            style={[
              styles.claudeWelcomeCenterContainer,
              isQuadOrDenseSplit && { paddingHorizontal: 6 },
            ]}
          >
            <View
              style={[
                styles.claudeWelcomeBox,
                isQuadOrDenseSplit && { maxWidth: '100%', minWidth: 0, paddingHorizontal: 4 },
              ]}
            >
              {/* Khối chào chủ động tối giản Ember Monochrome chuẩn DESIGN.md */}
              <View
                style={[
                  styles.proactiveWelcomeHeader,
                  isQuadOrDenseSplit && { marginBottom: 14, paddingHorizontal: 4 },
                ]}
              >
                <View style={{ marginBottom: isQuadOrDenseSplit ? 10 : 14 }}>
                  <TomorrowGlyph
                    size={isQuadOrDenseSplit ? (totalPanes === 4 ? 22 : 24) : (isSplitMode ? 28 : 34)}
                    themeMode={theme.mode}
                  />
                </View>

                <View
                  style={[
                    styles.proactiveTextGateWrapper,
                    {
                      minHeight: isQuadOrDenseSplit ? 46 : 62,
                      opacity: isStorageHydrated ? 1 : 0,
                    },
                    Platform.OS === 'web' && ({
                      transition: 'opacity 150ms ease-out',
                      animation: isStorageHydrated ? 'macosFadeIn 150ms ease-out' : undefined,
                    } as any),
                  ]}
                >
                  {isStorageHydrated && (
                    <>
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        adjustsFontSizeToFit
                        style={[
                          styles.proactiveHeadlineText,
                          {
                            fontSize: totalPanes === 4 ? 17 : totalPanes === 3 ? 20 : (isSplitMode ? 22 : 26),
                            lineHeight: totalPanes === 4 ? 22 : totalPanes === 3 ? 26 : (isSplitMode ? 28 : 34),
                            color: theme.mode === 'dark' ? '#F4F4F5' : '#111113',
                          },
                        ]}
                      >
                        {proactiveGreeting?.headline || getTimeBasedGreeting()}
                      </Text>

                      {!!proactiveGreeting?.subline && (
                        <View style={styles.proactiveSublineRow}>
                          <Text
                            numberOfLines={isQuadOrDenseSplit ? 2 : 1}
                            ellipsizeMode="tail"
                            style={[
                              styles.proactiveSublineText,
                              {
                                fontSize: isQuadOrDenseSplit ? 12 : (isSplitMode ? 12.5 : 13.5),
                                lineHeight: isQuadOrDenseSplit ? 17 : 19,
                                color: theme.mode === 'dark' ? '#A1A1AA' : '#52525B',
                              },
                            ]}
                          >
                            {proactiveGreeting.subline}
                          </Text>
                          {!!(proactiveGreeting.targetSessionId && proactiveGreeting.actionLabel) && (
                            <Pressable
                              onPress={() => onResumeSession?.(pane.id, proactiveGreeting.targetSessionId!)}
                              hitSlop={6}
                              style={({ hovered, pressed }: any) => [
                                styles.proactiveActionLink,
                                {
                                  opacity: pressed ? 0.6 : hovered ? 1 : 0.88,
                                },
                                Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                              ]}
                            >
                              {({ hovered }: any) => (
                                <Text
                                  style={[
                                    styles.proactiveActionLinkText,
                                    {
                                      fontSize: isQuadOrDenseSplit ? 12 : (isSplitMode ? 12.5 : 13.5),
                                      lineHeight: isQuadOrDenseSplit ? 17 : 19,
                                      color: theme.mode === 'dark' ? '#F4F4F5' : '#111113',
                                      textDecorationLine: hovered ? 'underline' : 'none',
                                    },
                                  ]}
                                >
                                  {proactiveGreeting.actionLabel}
                                </Text>
                              )}
                            </Pressable>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* Khung nhập liệu PromptBox Lucian #452 đặt NGAY DƯỚI dòng chào ở chính giữa màn hình */}
              <PromptBox
                ref={setInputBarRef}
                onSendMessage={(text, imgBase64, imgUri, forceWebSearch, telemetry) =>
                  handleSendMessageInPane(pane.id, text, imgBase64, imgUri, forceWebSearch, telemetry)
                }
                isLoading={false}
                isGenerating={isGenerating}
                onStopGeneration={onStopGeneration}
                isTomorrowTyping={isTyping}
                theme={theme}
                isSplitMode={isSplitMode}
                isDenseSplit={isQuadOrDenseSplit}
                isCentered={true}
                maxWidth={isQuadOrDenseSplit ? undefined : 680}
                placeholder={isQuadOrDenseSplit ? 'Nhắn tin...' : 'Hôm nay tôi có thể giúp gì cho bạn?'}
              />
            </View>
          </View>
        ) : (
          <>
            <FlatList
              key={`chat-pane-${pane.id}-${pane.sessionId || 'empty'}`}
              ref={setFlatListRef}
              data={paneMessages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ChatBubble
                  message={item}
                  isDesktop={isDesktop}
                  theme={theme}
                  compact={isSplitMode}
                  isSplitMode={isSplitMode}
                />
              )}
              style={styles.flatListStyle}
              contentContainerStyle={[
                styles.chatListContent,
                { paddingHorizontal: isQuadOrDenseSplit ? 8 : (isSplitMode ? 12 : (isDesktop ? 28 : 16)) },
              ]}
              showsVerticalScrollIndicator={false}
              onScroll={onScroll}
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

            {/* Nút tròn nhỏ "↓" cuộn mượt xuống đáy */}
            {showScrollDown && (
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
                onPress={onScrollDownPress}
                hitSlop={8}
              >
                <ChevronDown size={18} color={theme.textPrimary} />
              </Pressable>
            )}

            {/* Prompt Box Lucian #452 cố định ở đáy khi có tin nhắn */}
            <PromptBox
              ref={setInputBarRef}
              onSendMessage={(text, imgBase64, imgUri, forceWebSearch, telemetry) =>
                handleSendMessageInPane(pane.id, text, imgBase64, imgUri, forceWebSearch, telemetry)
              }
              isLoading={false}
              isGenerating={isGenerating}
              onStopGeneration={onStopGeneration}
              isTomorrowTyping={isTyping}
              theme={theme}
              isSplitMode={isSplitMode}
              isDenseSplit={isQuadOrDenseSplit}
              isCentered={false}
              placeholder={isQuadOrDenseSplit ? 'Nhắn tin...' : 'Nhắn cho Tomorrow...'}
            />
          </>
        )}
      </View>
    </View>
  );
});

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isDesktopRef = useRef<boolean>(isDesktop);
  isDesktopRef.current = isDesktop;

  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const themeModeRef = useRef<ThemeMode>(themeMode);
  themeModeRef.current = themeMode;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [userMemory, setUserMemory] = useState<UserMemoryProfile>(DEFAULT_USER_MEMORY);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isStorageHydrated, setIsStorageHydrated] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(width >= 768);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isMemoryVaultOpen, setIsMemoryVaultOpen] = useState<boolean>(false);

  // HỆ THỐNG SỔ GHI CHÚ (NOTEBOOKS) VÀ WORKSPACE ĐA TAB
  const [notebooks, setNotebooks] = useState<Notebook[]>([DEFAULT_NOTEBOOK]);
  const [activeNotebookId, setActiveNotebookId] = useState<string>(DEFAULT_NOTEBOOK_ID);
  const notebooksRef = useRef<Notebook[]>([DEFAULT_NOTEBOOK]);
  notebooksRef.current = notebooks;
  const activeNotebookIdRef = useRef<string>(activeNotebookId);
  activeNotebookIdRef.current = activeNotebookId;

  // HẠNG MỤC 2: Quản lý Split Chat Panes kiểu VS Code (mặc định 1 pane, Cmd+↑ mở thêm, tối đa 4 pane)
  const [panes, setPanes] = useState<ChatPane[]>([{ id: 'pane-1', sessionId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');
  const [openDropdownPaneId, setOpenDropdownPaneId] = useState<string | null>(null);

  // Chế độ chọn đóng tab tương tác bằng mũi tên và Enter (Cmd + ArrowDown)
  const [isPaneCloseMode, setIsPaneCloseMode] = useState<boolean>(false);
  const [closeTargetPaneIndex, setCloseTargetPaneIndex] = useState<number>(0);

  // HẠNG MỤC 1: Cô lập trạng thái typing / status / search theo từng sessionId
  const [typingSessionIds, setTypingSessionIds] = useState<Record<string, boolean>>({});
  const [typingStatusBySession, setTypingStatusBySession] = useState<Record<string, string | undefined>>({});
  const [searchingWebBySession, setSearchingWebBySession] = useState<Record<string, boolean>>({});
  const [scrollDownByPane, setScrollDownByPane] = useState<Record<string, boolean>>({});

  // Concurrency & Session in-flight + Timers isolation across split panes
  const inFlightSessionsRef = useRef<Set<string>>(new Set());
  const timersBySessionRef = useRef<Record<string, Array<ReturnType<typeof setTimeout>>>>({});

  const clearSessionTimers = useCallback((sessId: string) => {
    const list = timersBySessionRef.current[sessId];
    if (list && list.length > 0) {
      list.forEach((t) => clearTimeout(t));
      timersBySessionRef.current[sessId] = [];
    }
  }, []);

  const addSessionTimer = useCallback((sessId: string, timer: ReturnType<typeof setTimeout>) => {
    if (!timersBySessionRef.current[sessId]) {
      timersBySessionRef.current[sessId] = [];
    }
    timersBySessionRef.current[sessId].push(timer);
  }, []);

  // Single Source of Truth: currentSessionId & messages cho pane đang active từ sessions & panes
  const activePane = panes.find((p) => p.id === activePaneId) || panes[0] || { id: 'pane-1', sessionId: null };
  const currentSessionId = activePane.sessionId;
  const activeSession = currentSessionId ? sessions.find((s) => s.id === currentSessionId) : null;
  const messages = activeSession?.messages || [];

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId) || notebooks[0] || DEFAULT_NOTEBOOK;
  const openSessionIdsInWorkspace = panes.map((p) => p.sessionId).filter(Boolean) as string[];

  const isTomorrowTyping = !!(currentSessionId && typingSessionIds[currentSessionId]);
  const isSearchingWeb = !!(currentSessionId && searchingWebBySession[currentSessionId]);
  const typingStatusText = currentSessionId ? typingStatusBySession[currentSessionId] : undefined;
  const showScrollDownBtn = !!scrollDownByPane[activePaneId];

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const inputBarRef = useRef<PromptBoxRef>(null);
  const inputRef = inputBarRef;

  const flatListRefs = useRef<Record<string, FlatList<ChatMessage> | null>>({});
  const inputBarRefs = useRef<Record<string, PromptBoxRef | null>>({});

  // Quản lý trạng thái đang sinh phản hồi & AbortController theo từng pane độc lập
  const [generatingPanes, setGeneratingPanes] = useState<Record<string, boolean>>({});
  const generatingPanesRef = useRef<Record<string, boolean>>({});
  generatingPanesRef.current = generatingPanes;
  const abortControllersByPaneRef = useRef<Record<string, AbortController | null>>({});
  const cancelSequenceRef = useRef<Record<string, boolean>>({});
  const commandTriggerRef = useRef<CommandTriggerButtonRef>(null);

  const prevIsDesktopRef = useRef<boolean>(isDesktop);
  const isCommandPaletteOpenRef = useRef<boolean>(false);
  const currentSessionTurnIdRef = useRef<number>(0);
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);

  const panesRef = useRef<ChatPane[]>(panes);
  panesRef.current = panes;
  const activePaneIdRef = useRef<string>(activePaneId);
  activePaneIdRef.current = activePaneId;
  const isPaneCloseModeRef = useRef<boolean>(isPaneCloseMode);
  isPaneCloseModeRef.current = isPaneCloseMode;
  const closeTargetPaneIndexRef = useRef<number>(closeTargetPaneIndex);
  closeTargetPaneIndexRef.current = closeTargetPaneIndex;
  const sessionsRef = useRef<ChatSession[]>(sessions);
  sessionsRef.current = sessions;
  const userMemoryRef = useRef<UserMemoryProfile>(userMemory);
  userMemoryRef.current = userMemory;

  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;

  // HẠNG MỤC 1 & 2 (Ngày 14): Động cơ chào chủ động cục bộ 0-token & Làm mới theo đồng hồ thực
  const [greetingClockNow, setGreetingClockNow] = useState<Date>(() => new Date());
  const greetingClockNowRef = useRef<Date>(greetingClockNow);
  greetingClockNowRef.current = greetingClockNow;

  const proactiveGreetingByPane = useMemo(() => {
    const map: Record<string, ProactiveGreetingPayload> = {};
    for (const p of panes) {
      const otherOpenSessionIds = panes
        .filter((other) => other.id !== p.id && other.sessionId !== null)
        .map((other) => other.sessionId as string);
      map[p.id] = generateProactiveGreeting({
        sessions,
        activeNotebookId,
        memoryVault: userMemory.vault || userMemory,
        now: greetingClockNow,
        excludeSessionIds: otherOpenSessionIds,
      });
    }
    return map;
  }, [panes, sessions, activeNotebookId, userMemory, greetingClockNow]);
  const proactiveGreetingByPaneRef = useRef<Record<string, ProactiveGreetingPayload>>(proactiveGreetingByPane);
  proactiveGreetingByPaneRef.current = proactiveGreetingByPane;

  const refreshGreetingClockIfPeriodChanged = useCallback(() => {
    const now = new Date();
    const prevChrono = buildChronoContext(greetingClockNowRef.current);
    const nextChrono = buildChronoContext(now);
    if (nextChrono.period !== prevChrono.period || nextChrono.dateStr !== prevChrono.dateStr) {
      setGreetingClockNow(now);
    }
  }, []);

  useEffect(() => {
    const syncGreetingClock = () => {
      // Chỉ cập nhật khi có ít nhất 1 pane trống và đã chuyển sang khung giờ/ngày mới (không gây re-render khi đang chat)
      const hasEmptyPane = panesRef.current.some((p) => {
        if (!p.sessionId) return true;
        const sess = sessionsRef.current.find((s) => s.id === p.sessionId);
        return !sess || !sess.messages || sess.messages.length === 0;
      });
      if (!hasEmptyPane) return;
      refreshGreetingClockIfPeriodChanged();
    };

    const intervalId = setInterval(syncGreetingClock, 10 * 60 * 1000);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleVisibility = () => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          syncGreetingClock();
        }
      };
      window.addEventListener('focus', syncGreetingClock);
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        clearInterval(intervalId);
        window.removeEventListener('focus', syncGreetingClock);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    isCommandPaletteOpenRef.current = isCommandPaletteOpen;
  }, [isCommandPaletteOpen]);

  // Đồng bộ reference flatListRef và inputBarRef sang active pane
  useEffect(() => {
    flatListRef.current = flatListRefs.current[activePaneId] || null;
    inputBarRef.current = inputBarRefs.current[activePaneId] || null;
  }, [activePaneId]);

  // Setters giữ tương thích ngược không nhân bản state
  const setCurrentSessionId = useCallback((id: string | null) => {
    const nextPanes = panesRef.current.map((p) =>
      p.id === activePaneIdRef.current ? { ...p, sessionId: id } : p
    );
    panesRef.current = nextPanes;
    setPanes(nextPanes);
  }, []);

  const setMessages = useCallback((msgs: ChatMessage[]) => {
    const actId = panesRef.current.find((p) => p.id === activePaneIdRef.current)?.sessionId;
    if (actId) {
      setSessions((prev) => {
        const next = prev.map((s) => (s.id === actId ? { ...s, messages: msgs } : s));
        sessionsRef.current = next;
        return next;
      });
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
    injectThemeTransitionStyles();

    async function rehydrateContext() {
      try {
        console.log('[Bootstrap] Đang nạp danh sách phiên trò chuyện, theme và notebooks...');
        const [savedSessions, savedMemory, savedTheme, savedNotebooks] = await Promise.all([
          loadSessions(),
          loadUserMemoryProfile(),
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          loadNotebooks(),
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
          themeModeRef.current = savedTheme;
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.documentElement.dataset.theme = savedTheme;
            document.documentElement.style.colorScheme = savedTheme;
            const bg = savedTheme === 'dark' ? '#171717' : '#FFFFFF';
            document.body.style.backgroundColor = bg;
            document.documentElement.style.backgroundColor = bg;
          }
        }

        // Khôi phục notebooks
        if (savedNotebooks && savedNotebooks.length > 0) {
          setNotebooks(savedNotebooks);
          notebooksRef.current = savedNotebooks;
          const defaultNb = savedNotebooks.find((n) => n.id === DEFAULT_NOTEBOOK_ID) || savedNotebooks[0];
          const initialNbId = defaultNb ? defaultNb.id : DEFAULT_NOTEBOOK_ID;
          setActiveNotebookId(initialNbId);
          activeNotebookIdRef.current = initialNbId;
        }

        // HẠNG MỤC 2 (v4.8.2): Mỗi lần mở lại ứng dụng (Cold Start / Reload) luôn bắt đầu với
        // DUY NHẤT 1 cửa sổ trò chuyện trống mặc định (1 pane, sessionId: null) chuẩn màn hình mở đầu Claude,
        // toàn bộ lịch sử cũ nằm gọn trong Sidebar theo từng Sổ ghi chú.
        const initialDefaultPane: ChatPane = { id: `pane-${Date.now()}`, sessionId: null };
        setPanes([initialDefaultPane]);
        panesRef.current = [initialDefaultPane];
        setActivePaneId(initialDefaultPane.id);
        activePaneIdRef.current = initialDefaultPane.id;
        setCurrentSessionId(null);
      } catch (err) {
        console.error('[Bootstrap] Lỗi khi nạp dữ liệu:', err);
      } finally {
        setIsStorageHydrated(true);
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
        flatListRefs.current[activePaneId]?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages.length, isTomorrowTyping, activePaneId]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Chuyển đổi Theme Sáng / Tối 2 chiều với hiệu ứng sóng tròn View Transition (Online • v4.9.3)
  const toggleThemeWithWave = useCallback((origin?: { x: number; y: number }) => {
    const nextMode: ThemeMode = themeModeRef.current === 'dark' ? 'light' : 'dark';
    themeModeRef.current = nextMode;

    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch((err) => {
      console.warn('[Theme] Không thể lưu theme:', err);
    });

    const applyThemeSync = () => {
      if (Platform.OS === 'web') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { flushSync } = require('react-dom');
          if (typeof flushSync === 'function') {
            flushSync(() => {
              setThemeMode(nextMode);
            });
            return;
          }
        } catch {}
      }
      setThemeMode(nextMode);
    };

    runCircularThemeTransition(nextMode, applyThemeSync, origin);
  }, []);

  const toggleThemeRef = useRef(toggleThemeWithWave);
  toggleThemeRef.current = toggleThemeWithWave;
  const handleToggleTheme = toggleThemeWithWave;

  // Hủy sinh phản hồi AI tức thì bằng AbortController và hủy tách chuỗi bong bóng
  const handleStopGenerationInPane = useCallback((paneId: string) => {
    // 1. Kích hoạt abort trên controller mạng của riêng pane đó
    if (abortControllersByPaneRef.current[paneId]) {
      try {
        abortControllersByPaneRef.current[paneId]?.abort();
      } catch {}
      abortControllersByPaneRef.current[paneId] = null;
    }
    // 2. Bật cờ ngắt chuỗi hiển thị bong bóng
    cancelSequenceRef.current[paneId] = true;

    // 3. Tắt trạng thái typing và web search của phiên thuộc pane
    const targetPane = panesRef.current.find((p) => p.id === paneId);
    if (targetPane?.sessionId) {
      const sId = targetPane.sessionId;
      clearSessionTimers(sId);
      inFlightSessionsRef.current.delete(sId);
      setTypingSessionIds((prev) => {
        const copy = { ...prev };
        delete copy[sId];
        return copy;
      });
      setTypingStatusBySession((prev) => ({ ...prev, [sId]: undefined }));
      setSearchingWebBySession((prev) => ({ ...prev, [sId]: false }));
    }

    // 4. Tắt trạng thái sinh của pane
    setGeneratingPanes((prev) => {
      const next = { ...prev, [paneId]: false };
      generatingPanesRef.current = next;
      return next;
    });
    setIsLoading(false);
  }, []);

  // 2. XỬ LÝ GỬI TIN NHẮN THEO TỪNG PANE (CÔ LẬP THEO TARGET SESSION ID)
  const handleSendMessageInPane = async (
    paneId: string,
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean,
    telemetry?: KeystrokeTelemetry
  ) => {
    const targetPaneId = paneId;
    const pane = panesRef.current.find((p) => p.id === targetPaneId) || panesRef.current[0];
    let targetSessionId = pane?.sessionId;

    const resolvedBase64 = imageBase64 || (imageUri?.startsWith('data:image') ? cleanBase64(imageUri) : undefined);
    const resolvedUri = imageUri?.startsWith('data:image')
      ? imageUri
      : (resolvedBase64 ? `data:image/jpeg;base64,${resolvedBase64}` : imageUri);

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      sender: 'user',
      text,
      timestamp: Date.now(),
      imageUri: resolvedUri,
      imageBase64: resolvedBase64,
    };

    if (!targetSessionId) {
      targetSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Chặn gửi đúp trên chính phiên này nếu đang đợi phản hồi
    if (inFlightSessionsRef.current.has(targetSessionId)) {
      console.warn('[Tomorrow] Phiên đang trong luồng xử lý AI, tránh gửi trùng lặp:', targetSessionId);
      return;
    }
    inFlightSessionsRef.current.add(targetSessionId);

    const currentSess = sessionsRef.current.find((s) => s.id === targetSessionId);
    const existingMessages = currentSess ? currentSess.messages || [] : [];
    const updatedMessages = [...existingMessages, userMsg];

    let sessionTitle = currentSess?.title || 'Cuộc trò chuyện mới';
    if (!currentSess || isPlaceholderOrNoiseTitle(sessionTitle)) {
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
    }

    // Cập nhật pane này gắn với targetSessionId qua functional update
    setPanes((prevPanes) => {
      const nextPanes = prevPanes.map((p) =>
        p.id === targetPaneId ? { ...p, sessionId: targetSessionId } : p
      );
      panesRef.current = nextPanes;
      saveNotebookWorkspace(activeNotebookIdRef.current, nextPanes, targetPaneId);
      return nextPanes;
    });

    // Cập nhật sessions dùng functional state update và đồng bộ tức thì sessionsRef.current
    setSessions((prevSessions) => {
      const sessIndex = prevSessions.findIndex((s) => s.id === targetSessionId);
      let nextSessions: ChatSession[];
      if (sessIndex !== -1) {
        const updatedSess: ChatSession = {
          ...prevSessions[sessIndex],
          title: sessionTitle,
          updatedAt: Date.now(),
          messages: updatedMessages,
          notebookId: prevSessions[sessIndex].notebookId || activeNotebookIdRef.current || DEFAULT_NOTEBOOK_ID,
        };
        nextSessions = [updatedSess, ...prevSessions.filter((s) => s.id !== targetSessionId)];
      } else {
        const newSession: ChatSession = {
          id: targetSessionId,
          title: sessionTitle,
          updatedAt: Date.now(),
          messages: updatedMessages,
          notebookId: activeNotebookIdRef.current || DEFAULT_NOTEBOOK_ID,
        };
        nextSessions = [newSession, ...prevSessions];
      }
      sessionsRef.current = nextSessions;
      saveSessions(nextSessions);
      return nextSessions;
    });

    // Phản hồi trạng thái chuyên môn tinh tế trên UI theo Dual-Persona Router
    const effectiveImg = resolvedBase64 || resolvedUri;
    const preDomain = detectExpertDomain(text, Boolean(effectiveImg));
    const preDirective = buildLocalReflexDirective(
      text,
      updatedMessages,
      forceWebSearch,
      undefined,
      telemetry,
      Boolean(effectiveImg)
    );
    const prePersona = resolveDualPersona({
      intentMode: preDirective.intentMode,
      expertDomain: preDomain,
      psychProfile: preDirective.psych,
      chrono: preDirective.chrono,
      hasImage: Boolean(effectiveImg),
      userText: text,
    });

    // Đặt trạng thái đang gõ/xử lý theo targetSessionId
    setTypingSessionIds((prev) => ({ ...prev, [targetSessionId]: true }));
    const initialStatus = prePersona.persona === 'JARVIS_LAB' ? prePersona.statusHint : undefined;
    setTypingStatusBySession((prev) => ({ ...prev, [targetSessionId]: initialStatus }));
    setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: false }));
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllersByPaneRef.current[targetPaneId] = abortController;
    cancelSequenceRef.current[targetPaneId] = false;
    setGeneratingPanes((prev) => {
      const next = { ...prev, [targetPaneId]: true };
      generatingPanesRef.current = next;
      return next;
    });

    const scrollTimer = setTimeout(() => {
      flatListRefs.current[targetPaneId]?.scrollToEnd({ animated: true });
    }, 20);
    addSessionTimer(targetSessionId, scrollTimer);

    try {
      const previousSession = sessionsRef.current.find((s) => s.id !== targetSessionId);
      const previousSessionMessages = previousSession?.messages?.slice(-3);

      const carriedOverImg = resolveCarriedOverVisionImage(text, updatedMessages, resolvedBase64 || resolvedUri);
      const effectiveImage = resolvedBase64 || carriedOverImg;

      // HẠNG MỤC 3 (Ngày 14): First-Turn Proactive Bridge — chỉ truyền ở lượt đầu (messages.length === 0)
      const firstTurnProactiveTag =
        existingMessages.length === 0
          ? (proactiveGreetingByPaneRef.current[targetPaneId]?.contextTag || '').slice(0, 180)
          : undefined;

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
              ? '🌐 Đang quét web...'
              : (prePersona.persona === 'JARVIS_LAB' ? prePersona.statusHint : undefined),
          }));
        },
        undefined,
        telemetry,
        targetSessionId,
        activeNotebookIdRef.current,
        sessionsRef.current,
        notebooksRef.current,
        abortController.signal,
        firstTurnProactiveTag
      );

      const isDeepOrVision = Boolean(effectiveImage || text.length > 80 || forceWebSearch);
      const watchdogMs = isDeepOrVision ? 35000 : 15000;
      let watchdogTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        watchdogTimeoutId = setTimeout(() => reject(new Error('WATCHDOG_TIMEOUT')), watchdogMs);
        addSessionTimer(targetSessionId, watchdogTimeoutId);
      });

      let aiResponse: any;
      try {
        aiResponse = await Promise.race([aiResponsePromise, timeoutPromise]);
      } catch (err: any) {
        if (cancelSequenceRef.current[targetPaneId] || abortController.signal.aborted || err?.name === 'UserAbortError') {
          return;
        }
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
        if (watchdogTimeoutId) clearTimeout(watchdogTimeoutId);
        setTypingStatusBySession((prev) => ({ ...prev, [targetSessionId]: undefined }));
        setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: false }));
      }

      if (cancelSequenceRef.current[targetPaneId] || abortController.signal.aborted || aiResponse?.isCancelled) {
        return;
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

      const rawReplies =
        aiResponse.replies && aiResponse.replies.length > 0
          ? aiResponse.replies
          : [aiResponse.reply || 'ơi'];

      const sanitizedReplies = rawReplies
        .map((r: any) => (typeof r === 'string' ? r.trim() : flattenReplyToMarkdown(r)))
        .filter((r: string) => r.length > 0 && r !== '[object Object]');

      const replies = sanitizedReplies.length > 0 ? sanitizedReplies : ['nghe đây'];

      let currentHistory = [...updatedMessages];

      for (const [index, replyText] of replies.entries()) {
        if (cancelSequenceRef.current[targetPaneId] || abortController.signal.aborted) {
          break;
        }
        const isLastReply = index === replies.length - 1;
        const cleanReplyText = typeof replyText === 'string' && replyText !== '[object Object]'
          ? replyText
          : (flattenReplyToMarkdown(replyText) || 'nghe đây');

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}-${index}`,
          role: 'model',
          sender: 'ai',
          text: cleanReplyText,
          timestamp: Date.now(),
          jarvisIntent: aiResponse.jarvis_intent,
          sources: isLastReply ? aiResponse.sources : undefined,
          searchQuery: isLastReply ? aiResponse.searchQuery : undefined,
        };

        currentHistory = [...currentHistory, aiMsg];

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
          sessionsRef.current = copy;
          saveSessions(copy);
          return copy;
        });

        const bubbleScrollTimer = setTimeout(() => {
          flatListRefs.current[targetPaneId]?.scrollToEnd({ animated: true });
        }, 50);
        addSessionTimer(targetSessionId, bubbleScrollTimer);

        if (!isLastReply) {
          setTypingSessionIds((prev) => ({ ...prev, [targetSessionId]: true }));
          const typingDelay = Math.min(Math.max(replyText.length * 8, 300), 450);
          await sleep(typingDelay);
          if (cancelSequenceRef.current[targetPaneId] || abortController.signal.aborted) {
            break;
          }
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
    } catch (error: any) {
      if (cancelSequenceRef.current[targetPaneId] || abortController.signal.aborted || error?.name === 'UserAbortError') {
        console.log('[App]: Phản hồi đã được người dùng dừng, không ghi tin nhắn lỗi.');
        return;
      }
      console.error('[App] Lỗi trò chuyện trong phiên:', targetSessionId, error);
      const isTM = userMemoryRef.current.nickname === 'm' || /^(t|m|tao|mày)\b/i.test(text);
      const fallbackText = isTM
        ? 'Mạng hơi chập chờn một chút nên phản hồi chưa tới — m gửi lại câu vừa rồi nhé!'
        : 'Kết nối mạng tạm thời gián đoạn nên phản hồi chưa tới — bạn gửi lại câu vừa rồi nhé!';

      const fallbackMsg: ChatMessage = {
        id: `ai-${Date.now()}-err`,
        role: 'model',
        sender: 'ai',
        text: fallbackText,
        timestamp: Date.now(),
      };

      setSessions((prevSessions) => {
        const sessIndex = prevSessions.findIndex((s) => s.id === targetSessionId);
        if (sessIndex === -1) return prevSessions;
        const copy = [...prevSessions];
        const existingMsgs = copy[sessIndex].messages || [];
        const lastMsg = existingMsgs[existingMsgs.length - 1];
        if (!lastMsg || lastMsg.role === 'user' || (lastMsg as any).sender === 'user') {
          copy[sessIndex] = {
            ...copy[sessIndex],
            updatedAt: Date.now(),
            messages: [...existingMsgs, fallbackMsg],
          };
          sessionsRef.current = copy;
          saveSessions(copy);
        }
        return copy;
      });
    } finally {
      clearSessionTimers(targetSessionId);
      inFlightSessionsRef.current.delete(targetSessionId);
      setTypingSessionIds((prev) => {
        const copy = { ...prev };
        delete copy[targetSessionId];
        return copy;
      });
      setTypingStatusBySession((prev) => ({ ...prev, [targetSessionId]: undefined }));
      setSearchingWebBySession((prev) => ({ ...prev, [targetSessionId]: false }));
      setGeneratingPanes((prev) => {
        const next = { ...prev, [targetPaneId]: false };
        generatingPanesRef.current = next;
        return next;
      });
      abortControllersByPaneRef.current[targetPaneId] = null;
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
    const nextPanes = panesRef.current.map((p) =>
      p.id === activeId ? { ...p, sessionId: null } : p
    );
    panesRef.current = nextPanes;
    setPanes(nextPanes);
    refreshGreetingClockIfPeriodChanged();

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
  }, []);

  const handleNewChatInActivePane = handleNewChat;

  const handleNewChatInPane = useCallback((paneId: string) => {
    const nextPanes = panesRef.current.map((p) =>
      p.id === paneId ? { ...p, sessionId: null } : p
    );
    panesRef.current = nextPanes;
    setPanes(nextPanes);
    setActivePaneId(paneId);
    activePaneIdRef.current = paneId;
    refreshGreetingClockIfPeriodChanged();

    inputBarRefs.current[paneId]?.clear?.();
    inputBarRefs.current[paneId]?.reset?.();
    setTimeout(() => {
      inputBarRefs.current[paneId]?.focus();
    }, 50);
  }, []);

  // Lưu tham chiếu mới nhất để tránh stale closure trong global event listener
  const handleNewChatRef = useRef(handleNewChat);
  handleNewChatRef.current = handleNewChat;

  // Giữ alias handleCreateNewSession để bảo toàn 100% tương thích ngược
  const handleCreateNewSession = handleNewChat;

  // 3.5 CÁC THAO TÁC QUẢN LÝ SỔ GHI CHÚ (NOTEBOOKS)
  const handleSelectNotebook = useCallback(async (targetNotebookId: string) => {
    if (targetNotebookId === activeNotebookIdRef.current) return;

    // 1. Lưu workspace hiện tại của active notebook
    await saveNotebookWorkspace(activeNotebookIdRef.current, panesRef.current, activePaneIdRef.current);

    // 2. Cập nhật active notebook
    setActiveNotebookId(targetNotebookId);
    activeNotebookIdRef.current = targetNotebookId;

    // 3. Khôi phục savedPanes của target notebook
    const currentNbs = await loadNotebooks();
    setNotebooks(currentNbs);
    notebooksRef.current = currentNbs;
    const targetNb = currentNbs.find((n) => n.id === targetNotebookId);

    if (targetNb && targetNb.savedPanes && targetNb.savedPanes.length > 0) {
      setPanes(targetNb.savedPanes);
      panesRef.current = targetNb.savedPanes;
      const targetActive = targetNb.activePaneId || targetNb.savedPanes[0].id;
      setActivePaneId(targetActive);
      activePaneIdRef.current = targetActive;
    } else {
      const nbSessions = sessionsRef.current.filter((s) => (s.notebookId || DEFAULT_NOTEBOOK_ID) === targetNotebookId);
      const latestSessionId = nbSessions.length > 0 ? nbSessions[0].id : null;
      const newPanes: ChatPane[] = [{ id: `pane-${Date.now()}`, sessionId: latestSessionId }];
      setPanes(newPanes);
      panesRef.current = newPanes;
      setActivePaneId(newPanes[0].id);
      activePaneIdRef.current = newPanes[0].id;
    }

    if (!isDesktopRef.current) {
      setIsSidebarOpen(false);
    }
  }, []);

  const handleCreateNotebook = useCallback(async (name: string) => {
    const newNb = await createNotebook(name);
    const updated = await loadNotebooks();
    setNotebooks(updated);
    notebooksRef.current = updated;
    await handleSelectNotebook(newNb.id);
  }, [handleSelectNotebook]);

  const handleRenameNotebook = useCallback(async (id: string, newName: string) => {
    const updated = await renameNotebook(id, newName);
    setNotebooks(updated);
    notebooksRef.current = updated;
  }, []);

  const handleDeleteNotebook = useCallback(async (id: string) => {
    const { updatedNotebooks, updatedSessions } = await deleteNotebook(id, sessionsRef.current);
    setNotebooks(updatedNotebooks);
    notebooksRef.current = updatedNotebooks;
    setSessions(updatedSessions);
    sessionsRef.current = updatedSessions;

    if (activeNotebookIdRef.current === id) {
      await handleSelectNotebook(DEFAULT_NOTEBOOK_ID);
    }
  }, [handleSelectNotebook]);

  const handleCreateSessionInNotebook = useCallback(async (notebookId: string) => {
    if (activeNotebookIdRef.current !== notebookId) {
      await handleSelectNotebook(notebookId);
    }
    handleNewChatInPane(activePaneIdRef.current);
  }, [handleSelectNotebook, handleNewChatInPane]);

  // HẠNG MỤC 2: CÁC THAO TÁC SPLIT PANES (CHIA ĐÔI, THÊM PANE, ĐÓNG PANE, ĐỔI PHIÊN)
  // Cmd+ArrowUp: Luôn mở thêm pane trống mới (tối đa 4), không bao giờ gộp lại
  const handleAddNewSplitPane = useCallback(() => {
    refreshGreetingClockIfPeriodChanged();
    // Thoát chế độ đóng pane nếu đang bật
    if (isPaneCloseModeRef.current) {
      setIsPaneCloseMode(false);
    }
    setPanes((prev) => {
      if (prev.length >= 4) return prev; // Tối đa 4 cửa sổ song song
      if (width < 1280) {
        setIsSidebarOpen(false);
      }
      const newPaneId = `pane-${Date.now()}`;
      const newPane: ChatPane = {
        id: newPaneId,
        sessionId: null, // Cửa sổ chat trống mới hoàn toàn
      };
      const next = [...prev, newPane];
      panesRef.current = next;
      setActivePaneId(newPaneId);
      activePaneIdRef.current = newPaneId;
      saveNotebookWorkspace(activeNotebookIdRef.current, next, newPaneId);
      setTimeout(() => {
        inputBarRefs.current[newPaneId]?.focus?.();
      }, 50);
      return next;
    });
  }, [width]);

  const handleToggleSplitPanes = handleAddNewSplitPane;
  const handleAddPane = handleAddNewSplitPane;

  // Cmd+ArrowDown: Bật chế độ chọn tab cần đóng bằng phím mũi tên ← / → và Enter
  const handleEnterPaneCloseMode = useCallback(() => {
    if (panesRef.current.length <= 1) return; // Không đóng khi chỉ có 1 pane

    if (isPaneCloseModeRef.current) {
      // Nếu đã trong close mode, chuyển tiếp target sang pane tiếp theo (vòng tròn)
      setCloseTargetPaneIndex((prev) => (prev + 1) % panesRef.current.length);
      return;
    }

    setIsPaneCloseMode(true);
    const curIdx = panesRef.current.findIndex((p) => p.id === activePaneIdRef.current);
    const targetIdx = curIdx >= 0 ? curIdx : panesRef.current.length - 1;
    setCloseTargetPaneIndex(targetIdx);

    // Blur ô nhập liệu trên Web để mũi tên/Enter không gõ vào chat
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl && typeof (activeEl as HTMLElement).blur === 'function') {
        (activeEl as HTMLElement).blur();
      }
    }
  }, []);

  const handleClosePane = useCallback((paneId: string) => {
    setPanes((prev) => {
      if (prev.length <= 1) {
        setIsPaneCloseMode(false);
        return prev;
      }
      const remaining = prev.filter((p) => p.id !== paneId);
      panesRef.current = remaining;
      let nextActiveId = activePaneIdRef.current;
      if (remaining.length <= 1) {
        setIsPaneCloseMode(false);
      } else {
        setCloseTargetPaneIndex((cur) => Math.min(cur, remaining.length - 1));
      }
      if (activePaneIdRef.current === paneId) {
        const nextActive = remaining[0];
        setActivePaneId(nextActive.id);
        activePaneIdRef.current = nextActive.id;
        nextActiveId = nextActive.id;
      }
      saveNotebookWorkspace(activeNotebookIdRef.current, remaining, nextActiveId);
      return remaining;
    });
  }, []);

  const handleSwitchSessionInPane = useCallback((paneId: string, sessionId: string | null) => {
    const curPane = panesRef.current.find((p) => p.id === paneId);
    if (curPane?.sessionId === sessionId) {
      setOpenDropdownPaneId(null);
      return;
    }

    const nextPanes = panesRef.current.map((p) =>
      p.id === paneId ? { ...p, sessionId } : p
    );
    panesRef.current = nextPanes;
    setPanes(nextPanes);
    setActivePaneId(paneId);
    activePaneIdRef.current = paneId;
    refreshGreetingClockIfPeriodChanged();
    saveNotebookWorkspace(activeNotebookIdRef.current, nextPanes, paneId);

    inputBarRefs.current[paneId]?.setSelectedImage?.(null);
    setOpenDropdownPaneId(null);
    setTimeout(() => {
      flatListRefs.current[paneId]?.scrollToEnd({ animated: false });
    }, 40);
  }, []);

  const handleAddNewSplitPaneRef = useRef(handleAddNewSplitPane);
  handleAddNewSplitPaneRef.current = handleAddNewSplitPane;
  const handleToggleSplitPanesRef = useRef(handleToggleSplitPanes);
  handleToggleSplitPanesRef.current = handleToggleSplitPanes;
  const handleEnterPaneCloseModeRef = useRef(handleEnterPaneCloseMode);
  handleEnterPaneCloseModeRef.current = handleEnterPaneCloseMode;
  const handleClosePaneRef = useRef(handleClosePane);
  handleClosePaneRef.current = handleClosePane;

  const saveWorkspaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 4. CHỌN 1 PHIÊN TRÒ CHUYỆN CŨ TỪ SIDEBAR HOẶC COMMAND PALETTE (mở trong active pane, < 16ms, giữ Sidebar mở trên Desktop)
  const handleSelectSession = useCallback((sessionId: string, targetNotebookId?: string) => {
    // Nếu session thuộc notebook khác, chuyển active notebook trước
    const foundSession = sessionsRef.current.find((s) => s.id === sessionId);
    const sessionNbId = targetNotebookId || foundSession?.notebookId || DEFAULT_NOTEBOOK_ID;
    if (sessionNbId && sessionNbId !== activeNotebookIdRef.current) {
      setActiveNotebookId(sessionNbId);
      activeNotebookIdRef.current = sessionNbId;
    }

    // 1. Nếu sessionId đã đang mở ở active pane hiện tại -> chỉ đóng mobile drawer nếu màn hình nhỏ
    const curActivePane = panesRef.current.find((p) => p.id === activePaneIdRef.current);
    if (curActivePane?.sessionId === sessionId) {
      if (!isDesktopRef.current) setIsSidebarOpen(false);
      return;
    }

    // 2. Cập nhật panes ngay lập tức trong 1 batch gọn (< 16ms)
    const nextPanes = panesRef.current.map((p) =>
      p.id === activePaneIdRef.current ? { ...p, sessionId } : p
    );
    panesRef.current = nextPanes;
    setPanes(nextPanes);

    // Debounce lưu savedPanes xuống AsyncStorage chạy ngầm sau 150ms (không chặn UI thread)
    if (saveWorkspaceTimerRef.current) {
      clearTimeout(saveWorkspaceTimerRef.current);
    }
    const targetNbSnapshot = activeNotebookIdRef.current;
    const targetPaneSnapshot = activePaneIdRef.current;
    saveWorkspaceTimerRef.current = setTimeout(() => {
      saveNotebookWorkspace(targetNbSnapshot, nextPanes, targetPaneSnapshot);
    }, 150);

    // 3. Xóa ảnh tạm đang soạn nếu chưa gửi
    inputBarRef.current?.setSelectedImage?.(null);
    inputBarRefs.current[activePaneIdRef.current]?.setSelectedImage?.(null);

    // 4. Đóng Command Palette nếu đang mở
    setIsCommandPaletteOpen(false);

    // 5. CHỈ đóng drawer trên màn hình di động hẹp (< 768px); TUYỆT ĐỐI giữ nguyên Sidebar trên Desktop/macOS
    if (!isDesktopRef.current) {
      setIsSidebarOpen(false);
    }

    // 6. Cuộn xuống đáy mượt mà sau khi khung chat mới được mount
    setTimeout(() => {
      flatListRefs.current[activePaneIdRef.current]?.scrollToEnd({ animated: false });
    }, 40);
  }, []);

  // 5. XÓA 1 PHIÊN TRÒ CHUYỆN (tức thì, không confirm chặn, đồng bộ CHAT_SESSIONS_V2 & mọi Split Panes)
  const handleDeleteSession = useCallback((sessionId: string) => {
    // 1. Ngắt luồng AI / stream nếu phiên bị xóa đang sinh phản hồi
    for (const p of panesRef.current) {
      if (p.sessionId === sessionId) {
        cancelSequenceRef.current[p.id] = true;
        if (abortControllersByPaneRef.current[p.id]) {
          try {
            abortControllersByPaneRef.current[p.id]?.abort();
          } catch {}
          abortControllersByPaneRef.current[p.id] = null;
        }
        setGeneratingPanes((prev) => {
          if (!prev[p.id]) return prev;
          const next = { ...prev, [p.id]: false };
          generatingPanesRef.current = next;
          return next;
        });
      }
    }
    clearSessionTimers(sessionId);
    inFlightSessionsRef.current.delete(sessionId);
    setTypingSessionIds((prev) => {
      if (!prev[sessionId]) return prev;
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });
    setTypingStatusBySession((prev) => ({ ...prev, [sessionId]: undefined }));
    setSearchingWebBySession((prev) => ({ ...prev, [sessionId]: false }));

    // 2. Xóa tức thì trong state sessions (functional update) & ghi đè xuống CHAT_SESSIONS_V2
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      sessionsRef.current = next;
      void saveSessions(next);
      return next;
    });

    // 3. Đặt lại sessionId = null trên tất cả các tab Split Screen đang mở phiên này
    const nextPanes = panesRef.current.map((p) =>
      p.sessionId === sessionId ? { ...p, sessionId: null } : p
    );
    panesRef.current = nextPanes;
    setPanes(nextPanes);

    // 4. Dọn sạch sessionId khỏi savedPanes của toàn bộ Sổ trong TOMORROW_NOTEBOOKS_V1
    setNotebooks((prevNotebooks) => {
      const cleanedNotebooks = prevNotebooks.map((nb) => ({
        ...nb,
        savedPanes: nb.savedPanes?.map((sp) =>
          sp.sessionId === sessionId ? { ...sp, sessionId: null } : sp
        ),
      }));
      notebooksRef.current = cleanedNotebooks;
      void saveNotebooks(cleanedNotebooks);
      return cleanedNotebooks;
    });
  }, [clearSessionTimers]);

  // 5.5. ĐỔI TÊN INLINE 1 PHIÊN TRÒ CHUYỆN & LƯU NGAY XUỐNG CHAT_SESSIONS_V2
  const handleRenameSession = useCallback((sessionId: string, newTitle: string) => {
    const cleanTitle = (newTitle || '').trim();
    if (!cleanTitle) return;
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === sessionId ? { ...s, title: cleanTitle, updatedAt: Date.now() } : s
      );
      sessionsRef.current = next;
      void saveSessions(next);
      return next;
    });
  }, []);

  // 6. XÓA TOÀN BỘ LỊCH SỬ & RESET
  const handleClearAll = async () => {
    await clearAllChatData();
    sessionsRef.current = [];
    setSessions([]);
    const resetPanes: ChatPane[] = [{ id: 'pane-1', sessionId: null }];
    panesRef.current = resetPanes;
    setPanes(resetPanes);
    setActivePaneId('pane-1');
    activePaneIdRef.current = 'pane-1';
    setUserMemory(DEFAULT_USER_MEMORY);
    userMemoryRef.current = DEFAULT_USER_MEMORY;
  };

  // 7. LẮNG NGHE PHÍM TẮT TOÀN CỤC CHUẨN MACOS TRÊN WEB (Cmd+K, Cmd+N, Cmd+B, Cmd+ArrowUp, Escape)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';

      // Khi nhấn giữ riêng phím modifier (Meta hoặc Control) mà chưa nhấn phím khác:
      if ((e.key === 'Meta' || e.key === 'Control') && !isCommandPaletteOpenRef.current) {
        commandTriggerRef.current?.setModifierDown(true);
      }

      // Nếu người dùng đang giữ Cmd/Ctrl nhưng nhấn một phím khác KHÔNG PHẢI 'k':
      if (isCmdOrCtrl && key !== 'meta' && key !== 'control' && key !== 'k' && code !== 'KeyK') {
        commandTriggerRef.current?.reset();
      }

      // Cmd/Ctrl + N: Tạo cuộc trò chuyện mới sạch & focus ô nhập liệu
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'n' || code === 'KeyN')) {
        e.preventDefault();
        e.stopPropagation();
        handleNewChatRef.current();
        return;
      }

      // HẠNG MỤC 2: Cmd/Ctrl + ArrowUp: Luôn mở thêm cửa sổ chat mới (tối đa 4), không bao giờ gộp lại
      if (
        isCmdOrCtrl &&
        !e.altKey &&
        !e.shiftKey &&
        (key === 'arrowup' || code === 'ArrowUp')
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleAddNewSplitPaneRef.current();
        return;
      }

      // HẠNG MỤC 2: Cmd/Ctrl + ArrowDown: Bật chế độ chọn tab cần đóng bằng mũi tên ← / → và Enter để đóng
      if (
        isCmdOrCtrl &&
        !e.altKey &&
        !e.shiftKey &&
        (key === 'arrowdown' || code === 'ArrowDown')
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleEnterPaneCloseModeRef.current();
        return;
      }

      // Khi đang trong chế độ chọn đóng tab (isPaneCloseMode === true)
      if (isPaneCloseModeRef.current) {
        if (key === 'arrowleft' || code === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setCloseTargetPaneIndex((prev) => (prev - 1 + panesRef.current.length) % panesRef.current.length);
          return;
        }
        if (key === 'arrowright' || code === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setCloseTargetPaneIndex((prev) => (prev + 1) % panesRef.current.length);
          return;
        }
        if (key === 'enter' || code === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const target = panesRef.current[closeTargetPaneIndexRef.current];
          if (target) {
            handleClosePaneRef.current(target.id);
          }
          setIsPaneCloseMode(false);
          return;
        }
        if (key === 'escape' || code === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setIsPaneCloseMode(false);
          return;
        }
      }

      // Cmd/Ctrl + K: Bật/tắt bảng lệnh nhanh Command Palette kèm hiệu ứng phím cơ 3D Lucian #471
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'k' || code === 'KeyK')) {
        e.preventDefault();
        e.stopPropagation();

        commandTriggerRef.current?.triggerChord();

        const isOpening = !isCommandPaletteOpenRef.current;
        if (isOpening) {
          const isReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (isReduced) {
            setIsCommandPaletteOpen(true);
          } else {
            setTimeout(() => {
              setIsCommandPaletteOpen(true);
            }, 110);
          }
        } else {
          setIsCommandPaletteOpen(false);
        }
        return;
      }

      // Cmd/Ctrl + B: Đóng/Mở Sidebar
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'b' || code === 'KeyB')) {
        e.preventDefault();
        e.stopPropagation();
        setIsSidebarOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl + R: Chuyển đổi Theme Sáng/Tối (không giữ Shift; Cmd+Shift+R giữ cho hard reload trình duyệt)
      if (isCmdOrCtrl && !e.altKey && !e.shiftKey && (key === 'r' || code === 'KeyR')) {
        e.preventDefault();
        e.stopPropagation();
        toggleThemeRef.current();
        return;
      }

      // Escape: Dừng phản hồi nếu đang sinh, đóng dropdown pane nếu đang mở hoặc đóng Command Palette
      if (e.key === 'Escape' || code === 'Escape') {
        const activeId = activePaneIdRef.current;
        if (generatingPanesRef.current[activeId]) {
          e.preventDefault();
          e.stopPropagation();
          handleStopGenerationInPane(activeId);
          return;
        }
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

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        commandTriggerRef.current?.reset();
      }
    };

    const handleWindowBlur = () => {
      commandTriggerRef.current?.reset();
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    window.addEventListener('keyup', handleGlobalKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
      window.removeEventListener('keyup', handleGlobalKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
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

  // 8. TIÊM KEYFRAMES HOẠT ẢNH CHUẨN MACOS TRÊN WEB (macosPanePop, macosPalettePop, macosFadeIn, macosPopoverSlide)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'tomorrow-macos-animations';
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.innerHTML = `
          @keyframes macosPanePop {
            0% {
              opacity: 0;
              transform: scale(0.95) translateY(12px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          @keyframes macosPalettePop {
            0% {
              opacity: 0;
              transform: scale(0.95) translateY(8px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          @keyframes macosFadeIn {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes macosPopoverSlide {
            0% {
              opacity: 0;
              transform: scale(0.92) translateY(6px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
        `;
        document.head.appendChild(styleEl);
      }
    }
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

          {/* Tiêu đề "Tomorrow" căn giữa tuyệt đối theo chiều ngang */}
          <View style={styles.headerCenter} pointerEvents="none">
            <View style={[styles.titleRow, { gap: 6, alignItems: 'center' }]}>
              <Text style={[styles.headerTitle, { color: themeMode === 'dark' ? '#FFFFFF' : '#09090B' }]}>Tomorrow</Text>
              <View style={[styles.liveBadge, { backgroundColor: theme.liveBadgeBg }]}>
                <Dot size={18} color={theme.liveBadgeText} />
                <Text style={[styles.liveText, { color: theme.liveBadgeText }]}>Online • v4.10.4</Text>
              </View>
            </View>
          </View>

          {/* Cụm nút góc phải: Nút Command Palette ⌘K (trên Desktop) + Nút Tạo Cuộc Trò Chuyện Mới */}
          <View style={styles.headerRightActions}>
            {/* Nút Command Palette ⌘K chuẩn Lucian #471 trên Desktop (width >= 768px) */}
            {isDesktop && (
              <CommandTriggerButton
                ref={commandTriggerRef}
                onPress={() => setIsCommandPaletteOpen((prev) => !prev)}
                theme={theme}
                isDesktop={isDesktop}
              />
            )}

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
            onRenameSession={handleRenameSession}
            onClearAll={handleClearAll}
            userMemory={userMemory}
            theme={theme}
            notebooks={notebooks}
            activeNotebookId={activeNotebookId}
            openSessionIdsInWorkspace={openSessionIdsInWorkspace}
            onSelectNotebook={handleSelectNotebook}
            onCreateNotebook={handleCreateNotebook}
            onRenameNotebook={handleRenameNotebook}
            onDeleteNotebook={handleDeleteNotebook}
            onCreateSessionInNotebook={handleCreateSessionInNotebook}
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
              {isPaneCloseMode && (
                <View style={styles.paneCloseFloatingBar} pointerEvents="box-none">
                  <View
                    style={[
                      styles.paneCloseFloatingPill,
                      {
                        backgroundColor: theme.mode === 'dark' ? '#1E2430' : '#FFFFFF',
                        borderColor: '#EF4444',
                        shadowColor: '#000',
                        shadowOpacity: theme.mode === 'dark' ? 0.45 : 0.15,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paneCloseFloatingText,
                        { color: theme.mode === 'dark' ? '#F87171' : '#DC2626' },
                      ]}
                    >
                      Đóng tab: Dùng <Text style={{ fontWeight: '700' }}>←</Text> / <Text style={{ fontWeight: '700' }}>→</Text> chọn cửa sổ • <Text style={{ fontWeight: '700' }}>Enter</Text> để đóng • <Text style={{ fontWeight: '700' }}>Esc</Text> để hủy
                    </Text>
                  </View>
                </View>
              )}
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
                  ? sessions.find((s) => s.id === pane.sessionId) || null
                  : null;
                const paneMessages = paneSession?.messages || [];
                const isTyping = !!(pane.sessionId && typingSessionIds[pane.sessionId]);
                const isSearching = !!(pane.sessionId && searchingWebBySession[pane.sessionId]);
                const statusText = pane.sessionId ? typingStatusBySession[pane.sessionId] : undefined;
                const isCloseTarget = isPaneCloseMode && paneIndex === closeTargetPaneIndex;

                return (
                  <ChatPaneView
                    key={pane.id}
                    pane={pane}
                    paneIndex={paneIndex}
                    totalPanes={panes.length}
                    isActive={isActive}
                    isSplitMode={panes.length > 1}
                    isCloseMode={isPaneCloseMode}
                    isCloseTarget={isCloseTarget}
                    activeNotebookId={activeNotebookId}
                    activeNotebookName={activeNotebook?.name}
                    onConfirmClose={() => {
                      handleClosePane(pane.id);
                      setIsPaneCloseMode(false);
                    }}
                    sessions={sessions}
                    paneSession={paneSession}
                    paneMessages={paneMessages}
                    isTyping={isTyping}
                    isSearching={isSearching}
                    isGenerating={generatingPanes[pane.id] || false}
                    onStopGeneration={() => handleStopGenerationInPane(pane.id)}
                    proactiveGreeting={proactiveGreetingByPane[pane.id]}
                    isStorageHydrated={isStorageHydrated}
                    onResumeSession={(pId, targetSessId) => handleSwitchSessionInPane(pId, targetSessId)}
                    statusText={statusText}
                    isDropdownOpen={openDropdownPaneId === pane.id}
                    showScrollDown={!!scrollDownByPane[pane.id]}
                    userMemory={userMemory}
                    theme={theme}
                    isDesktop={isDesktop}
                    onSelectPane={(paneId) => {
                      if (isPaneCloseMode) {
                        setCloseTargetPaneIndex(paneIndex);
                        return;
                      }
                      if (activePaneId !== paneId) {
                        setActivePaneId(paneId);
                        activePaneIdRef.current = paneId;
                      }
                    }}
                    onToggleDropdown={(paneId) => {
                      if (isPaneCloseMode) return;
                      setOpenDropdownPaneId((prev) => (prev === paneId ? null : paneId));
                    }}
                    onNewChatInPane={handleNewChatInPane}
                    handleAddPane={handleAddPane}
                    handleClosePane={handleClosePane}
                    handleSwitchSessionInPane={handleSwitchSessionInPane}
                    handleSendMessageInPane={handleSendMessageInPane}
                    onScroll={(e) => {
                      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                      setScrollDownByPane((prev) => ({ ...prev, [pane.id]: distanceFromBottom > 250 }));
                    }}
                    onScrollDownPress={() => {
                      flatListRefs.current[pane.id]?.scrollToEnd({ animated: true });
                    }}
                    setFlatListRef={(r) => {
                      flatListRefs.current[pane.id] = r;
                      if (isActive) flatListRef.current = r;
                    }}
                    setInputBarRef={(r) => {
                      inputBarRefs.current[pane.id] = r;
                      if (isActive) inputBarRef.current = r;
                    }}
                  />
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
          notebooks={notebooks}
          activeNotebookId={activeNotebookId}
          userMemory={userMemory}
          onSelectSession={handleSelectSession}
          onCreateNewSession={handleNewChat}
          onNewChat={handleNewChat}
          onCreateNewNotebook={() => {
            setIsSidebarOpen(true);
          }}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onToggleTheme={handleToggleTheme}
          onToggleSplitPanes={handleToggleSplitPanes}
          onOpenMemoryVault={() => setIsMemoryVaultOpen(true)}
          isSplitPanes={panes.length > 1}
          theme={theme}
          themeMode={themeMode}
        />

        {/* Modal Quản lý Hồ sơ Tri thức Đa chiều (Memory Vault) */}
        <MemoryVaultModal
          visible={isMemoryVaultOpen}
          onClose={() => setIsMemoryVaultOpen(false)}
          theme={theme}
          themeMode={themeMode}
          vault={userMemory.vault as StructuredMemoryVault}
          onUpdateVault={(updatedVault) => {
            const newProfile: UserMemoryProfile = {
              ...userMemory,
              vault: updatedVault,
              interests: updatedVault.favorites,
              currentProject: updatedVault.activeProjects[0] || userMemory.currentProject,
              habits: updatedVault.habits,
              summary: Array.isArray(updatedVault.recentContext) ? updatedVault.recentContext[0] || '' : updatedVault.recentContext,
              studySubjects: updatedVault.studySubjects,
              financeGoals: updatedVault.financeGoals,
              moodHistory: updatedVault.moodHistory,
              lastActiveDate: new Date().toISOString(),
            };
            setUserMemory(newProfile);
            userMemoryRef.current = newProfile;
          }}
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
    zIndex: 2,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 1,
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
    zIndex: 2,
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
    minWidth: 0,
    overflow: 'hidden',
  },
  panesContainer: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    minWidth: 0,
    height: '100%',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  singlePaneWrapper: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    height: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
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
  closeTargetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  closeTargetPillText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  paneCloseFloatingBar: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  paneCloseFloatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    elevation: 8,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    ...(Platform.OS === 'web'
      ? ({
          animation: 'macosPalettePop 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        } as any)
      : {}),
  },
  paneCloseFloatingText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
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
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  claudeWelcomeCenterContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: '6%',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  claudeWelcomeBox: {
    width: '100%',
    maxWidth: 680,
    alignItems: 'center',
  },
  claudeGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  claudeGreetingText: {
    fontFamily:
      Platform.OS === 'web'
        ? 'Georgia, "Times New Roman", "Plus Jakarta Sans", serif'
        : undefined,
    fontWeight: '500',
    letterSpacing: -0.6,
  },
  proactiveWelcomeHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    width: '100%',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  proactiveTextGateWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
  },
  proactiveHeadlineText: {
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    maxWidth: '100%',
  },
  proactiveSublineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 7,
    maxWidth: '100%',
  },
  proactiveSublineText: {
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        : undefined,
    fontWeight: '400',
    opacity: 0.85,
    textAlign: 'center',
    flexShrink: 1,
  },
  proactiveActionLink: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    flexShrink: 0,
  },
  proactiveActionLinkText: {
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        : undefined,
    fontWeight: '500',
    letterSpacing: -0.1,
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
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
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
