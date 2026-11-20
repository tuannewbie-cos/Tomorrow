import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  type TextInputInstance,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  Search,
  SquarePen,
  Menu,
  Sun,
  Moon,
  MessageSquare,
  Clock,
  SearchX,
  CornerDownLeft,
  Columns2,
  RefreshCw,
} from 'lucide-react-native';
import { ChatSession } from '../types/chat';
import { ThemeColors, ThemeMode } from '../constants/theme';
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';
import { getQuotaSummarySync, resetOpenAICircuitBreaker } from '../services/quotaShield';
import { resetOpenAICircuitBreaker as resetAiBreaker } from '../services/aiService';

export interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
  onCreateNewSession: () => void;
  onNewChat?: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onToggleSplitPanes?: () => void;
  isSplitPanes?: boolean;
  theme: ThemeColors;
  themeMode: ThemeMode;
}

export type PaletteItemType = 'action' | 'session';

export interface PaletteItem {
  id: string;
  type: PaletteItemType;
  title: string;
  subtitle?: string;
  snippet?: string;
  badge?: string;
  iconType: 'new_chat' | 'toggle_sidebar' | 'toggle_theme' | 'session' | 'split_panes' | 'reset_circuit_breaker';
  sessionId?: string;
  action?: () => void;
  group: 'actions' | 'recent' | 'search';
}

function formatSessionTitle(rawTitle?: string): string {
  if (isPlaceholderOrNoiseTitle(rawTitle)) {
    return 'Trò chuyện ngắn';
  }
  return rawTitle?.trim() || 'Cuộc trò chuyện mới';
}

function formatSessionDate(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (isToday) {
    return `Hôm nay, ${hours}:${minutes}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Hôm qua, ${hours}:${minutes}`;
  }

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

function extractSnippet(fullText: string, keyword: string, maxLength: number = 75): string {
  const clean = fullText.replace(/[\r\n]+/g, ' ').trim();
  const idx = clean.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) {
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
  }
  const start = Math.max(0, idx - 22);
  const end = Math.min(clean.length, idx + keyword.length + 45);
  let snippet = clean.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < clean.length) snippet = snippet + '...';
  return snippet;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  visible,
  onClose,
  sessions,
  onSelectSession,
  onCreateNewSession,
  onNewChat,
  onToggleSidebar,
  onToggleTheme,
  onToggleSplitPanes,
  isSplitPanes = false,
  theme,
  themeMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quotaSummary, setQuotaSummary] = useState(getQuotaSummarySync());
  const inputRef = useRef<TextInputInstance>(null);

  // Focus ô tìm kiếm khi mở Modal và đồng bộ Quota Shield
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSelectedIndex(0);
      setQuotaSummary(getQuotaSummarySync());
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Hành động tạo cuộc trò chuyện mới: gọi onNewChat / onCreateNewSession và đóng bảng lệnh ngay
  const handleTriggerNewChat = useCallback(() => {
    if (typeof onNewChat === 'function') {
      onNewChat();
    } else if (typeof onCreateNewSession === 'function') {
      onCreateNewSession();
    }
    onClose();
  }, [onNewChat, onCreateNewSession, onClose]);

  // Nhóm Thao Tác Nhanh (⌘N, ⌘B, Đổi theme, Quota Reset)
  const quickActions: PaletteItem[] = useMemo(
    () => [
      {
        id: 'act-new-chat',
        type: 'action',
        title: 'Cuộc trò chuyện mới (⌘N)',
        subtitle: 'Bắt đầu một phiên trò chuyện mới sạch trên cửa sổ đang hoạt động',
        badge: '⌘N',
        iconType: 'new_chat',
        group: 'actions',
        action: handleTriggerNewChat,
      },
      {
        id: 'act-toggle-sidebar',
        type: 'action',
        title: 'Đóng/Mở Sidebar',
        subtitle: 'Thu gọn hoặc mở rộng thanh lịch sử bên trái',
        badge: '⌘B',
        iconType: 'toggle_sidebar',
        group: 'actions',
        action: () => {
          onToggleSidebar();
          onClose();
        },
      },
      {
        id: 'act-toggle-theme',
        type: 'action',
        title: themeMode === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối',
        subtitle:
          themeMode === 'dark'
            ? 'Bật tông màu trắng nhẹ nhàng'
            : 'Bật tông màu đen sâu bảo vệ mắt',
        badge: themeMode === 'dark' ? 'Light' : 'Dark',
        iconType: 'toggle_theme',
        group: 'actions',
        action: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: 'act-toggle-split',
        type: 'action',
        title: isSplitPanes ? 'Gộp cửa sổ trò chuyện (Toàn màn hình)' : 'Chia đôi cửa sổ trò chuyện (Split Panes)',
        subtitle: isSplitPanes
          ? 'Đóng chế độ chia đôi, trở về 1 cửa sổ chính'
          : 'Mở 2 cửa sổ chat song song kiểu VS Code',
        badge: '⌘↑',
        iconType: 'split_panes',
        group: 'actions',
        action: () => {
          onToggleSplitPanes?.();
          onClose();
        },
      },
      {
        id: 'act-reset-openai',
        type: 'action',
        title: 'Reset cờ OpenAI (Thử kết nối lại)',
        subtitle: 'Khôi phục kết nối gpt-4o-mini sau khi ngắt mạch Circuit Breaker',
        badge: 'API',
        iconType: 'reset_circuit_breaker',
        group: 'actions',
        action: async () => {
          await resetOpenAICircuitBreaker();
          resetAiBreaker();
          setQuotaSummary(getQuotaSummarySync());
          onClose();
        },
      },
    ],
    [themeMode, isSplitPanes, handleTriggerNewChat, onToggleSidebar, onToggleTheme, onToggleSplitPanes, onClose]
  );

  // Nhóm Các Phiên Gần Đây (hiển thị khi chưa tìm kiếm)
  const recentItems: PaletteItem[] = useMemo(() => {
    return sessions.slice(0, 6).map((sess) => {
      const formattedTitle = formatSessionTitle(sess.title);
      const dateStr = formatSessionDate(sess.updatedAt);
      const msgCount = (sess.messages || []).length;
      const lastMsg =
        sess.messages && sess.messages.length > 0
          ? sess.messages[sess.messages.length - 1].text
          : undefined;
      const subtitle = lastMsg
        ? lastMsg.length > 55
          ? `${lastMsg.replace(/[\r\n]+/g, ' ').slice(0, 55)}...`
          : lastMsg.replace(/[\r\n]+/g, ' ')
        : `${msgCount} tin nhắn • ${dateStr}`;

      return {
        id: `sess-${sess.id}`,
        type: 'session',
        title: formattedTitle,
        subtitle,
        badge: dateStr,
        iconType: 'session',
        sessionId: sess.id,
        group: 'recent',
        action: () => {
          onSelectSession(sess.id);
          onClose();
        },
      };
    });
  }, [sessions, onSelectSession, onClose]);

  // Tìm kiếm thông minh: Lọc theo tiêu đề và nội dung tin nhắn bên trong phiên
  const searchResults: PaletteItem[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const matchedActions: PaletteItem[] = [];
    if (
      'tạo cuộc trò chuyện mới new chat'.includes(q) ||
      'tạo mới'.includes(q) ||
      'new'.includes(q)
    ) {
      matchedActions.push(quickActions[0]);
    }
    if (
      'đóng mở sidebar menu thanh bên'.includes(q) ||
      'sidebar'.includes(q) ||
      'menu'.includes(q)
    ) {
      matchedActions.push(quickActions[1]);
    }
    if (
      'đổi giao diện sáng tối theme dark light mode màu nền'.includes(q) ||
      'theme'.includes(q) ||
      'dark'.includes(q) ||
      'light'.includes(q) ||
      'sáng'.includes(q) ||
      'tối'.includes(q)
    ) {
      matchedActions.push(quickActions[2]);
    }
    if (
      'chia đôi gộp cửa sổ song song split panes pane màn hình'.includes(q) ||
      'split'.includes(q) ||
      'pane'.includes(q) ||
      'chia'.includes(q) ||
      'song song'.includes(q)
    ) {
      matchedActions.push(quickActions[3]);
    }

    const matchedSessions: PaletteItem[] = [];

    for (const sess of sessions) {
      if (matchedSessions.length >= 8) break;

      const formattedTitle = formatSessionTitle(sess.title);
      const titleMatches =
        formattedTitle.toLowerCase().includes(q) ||
        (sess.title || '').toLowerCase().includes(q);

      let matchingMsgText: string | undefined;
      if (sess.messages && sess.messages.length > 0) {
        for (const msg of sess.messages) {
          if (msg.text && msg.text.toLowerCase().includes(q)) {
            matchingMsgText = msg.text;
            break;
          }
        }
      }

      if (titleMatches || matchingMsgText) {
        const dateStr = formatSessionDate(sess.updatedAt);
        const snippet = matchingMsgText
          ? extractSnippet(matchingMsgText, q)
          : sess.messages && sess.messages.length > 0
          ? extractSnippet(sess.messages[sess.messages.length - 1].text, q)
          : undefined;

        matchedSessions.push({
          id: `sess-${sess.id}`,
          type: 'session',
          title: formattedTitle,
          subtitle: snippet,
          snippet,
          badge: dateStr,
          iconType: 'session',
          sessionId: sess.id,
          group: 'search',
          action: () => {
            onSelectSession(sess.id);
            onClose();
          },
        });
      }
    }

    return [...matchedActions, ...matchedSessions].slice(0, 8);
  }, [searchQuery, sessions, quickActions, onSelectSession, onClose]);

  // Danh sách hiển thị theo trạng thái tìm kiếm
  const displayList: PaletteItem[] = useMemo(() => {
    if (searchQuery.trim() === '') {
      return [...quickActions, ...recentItems];
    }
    return searchResults;
  }, [searchQuery, quickActions, recentItems, searchResults]);

  // Reset lựa chọn khi thay đổi truy vấn tìm kiếm
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Xử lý điều hướng bàn phím: ArrowUp, ArrowDown, Enter, Escape
  const handleKeyDown = (e: any) => {
    const key = e.key || e.nativeEvent?.key;

    if (key === 'ArrowDown') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.nativeEvent?.preventDefault === 'function') {
        e.nativeEvent.preventDefault();
      }
      setSelectedIndex((prev) =>
        displayList.length > 0 ? (prev + 1) % displayList.length : 0
      );
    } else if (key === 'ArrowUp') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.nativeEvent?.preventDefault === 'function') {
        e.nativeEvent.preventDefault();
      }
      setSelectedIndex((prev) =>
        displayList.length > 0
          ? (prev - 1 + displayList.length) % displayList.length
          : 0
      );
    } else if (key === 'Enter') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.nativeEvent?.preventDefault === 'function') {
        e.nativeEvent.preventDefault();
      }
      if (displayList[selectedIndex]?.action) {
        displayList[selectedIndex].action!();
      }
    } else if (key === 'Escape') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.nativeEvent?.preventDefault === 'function') {
        e.nativeEvent.preventDefault();
      }
      onClose();
    }
  };

  const renderIcon = (item: PaletteItem, isSelected: boolean) => {
    const activeColor = theme.mode === 'dark' ? '#60A5FA' : '#2563EB';
    switch (item.iconType) {
      case 'new_chat':
        return <SquarePen size={16} color={isSelected ? activeColor : '#3B82F6'} />;
      case 'toggle_sidebar':
        return <Menu size={16} color={isSelected ? activeColor : '#8B5CF6'} />;
      case 'toggle_theme':
        return themeMode === 'dark' ? (
          <Sun size={16} color={isSelected ? activeColor : '#F59E0B'} />
        ) : (
          <Moon size={16} color={isSelected ? activeColor : '#6366F1'} />
        );
      case 'split_panes':
        return <Columns2 size={16} color={isSelected ? activeColor : '#10B981'} />;
      case 'reset_circuit_breaker':
        return <RefreshCw size={15} color={isSelected ? activeColor : '#EC4899'} />;
      case 'session':
      default:
        return (
          <MessageSquare
            size={15}
            color={isSelected ? activeColor : theme.textSecondary}
          />
        );
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlayWrapper}>
        {/* Nền mờ Backdrop (bấm ra ngoài để đóng) */}
        <Pressable
          style={[
            styles.backdrop,
            {
              backgroundColor:
                theme.mode === 'dark'
                  ? 'rgba(0, 0, 0, 0.70)'
                  : 'rgba(15, 23, 42, 0.35)',
            },
            Platform.OS === 'web' &&
              ({
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              } as any),
          ]}
          onPress={onClose}
        />

        {/* Khung Command Palette nổi phong cách Spotlight macOS */}
        <View
          style={[
            styles.paletteCard,
            {
              backgroundColor: theme.mode === 'dark' ? '#161922' : '#FFFFFF',
              borderColor:
                theme.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.08)',
              shadowColor: '#000',
              shadowOpacity: theme.mode === 'dark' ? 0.6 : 0.2,
            },
          ]}
        >
          {/* 1. Ô tìm kiếm tự động focus */}
          <View
            style={[
              styles.searchBar,
              { borderBottomColor: theme.borderSubtle },
            ]}
          >
            <Search size={18} color={theme.textSecondary} />
            <TextInput
              ref={inputRef}
              style={[
                styles.searchInput,
                { color: theme.inputText },
                Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
              ]}
              placeholder="Tìm lịch sử chat hoặc gõ lệnh nhanh (Cmd+K)..."
              placeholderTextColor={theme.placeholderText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onKeyPress={handleKeyDown}
              {...(Platform.OS === 'web' ? { onKeyDown: handleKeyDown } : {})}
              autoFocus
            />
            <Pressable
              style={[
                styles.escBadge,
                {
                  backgroundColor:
                    theme.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.06)',
                  borderColor: theme.borderSubtle,
                },
                Platform.OS === 'web' && { cursor: 'pointer' as any },
              ]}
              onPress={onClose}
              hitSlop={6}
            >
              <Text style={[styles.escText, { color: theme.textMuted }]}>
                ESC
              </Text>
            </Pressable>
          </View>

          {/* 2. Danh sách kết quả & Thao tác nhanh */}
          <ScrollView
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {displayList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <SearchX size={32} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                  Không tìm thấy kết quả nào
                </Text>
                <Text
                  style={[styles.emptySubtitle, { color: theme.textSecondary }]}
                >
                  Không có cuộc trò chuyện hoặc lệnh nào khớp với "{searchQuery}"
                </Text>
              </View>
            ) : (
              displayList.map((item, index) => {
                const isSelected = index === selectedIndex;
                const isFirstOfGroup =
                  index === 0 || displayList[index - 1].group !== item.group;
                const groupTitle =
                  item.group === 'actions'
                    ? 'THAO TÁC NHANH'
                    : item.group === 'recent'
                    ? 'GẦN ĐÂY'
                    : `KẾT QUẢ TÌM KIẾM (${displayList.length})`;

                return (
                  <React.Fragment key={item.id}>
                    {isFirstOfGroup && (
                      <View style={styles.groupHeader}>
                        <Text
                          style={[
                            styles.groupHeaderText,
                            { color: theme.textMuted },
                          ]}
                        >
                          {groupTitle}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      style={({ pressed }) => [
                        styles.itemRow,
                        isSelected && {
                          backgroundColor:
                            theme.mode === 'dark'
                              ? 'rgba(59, 130, 246, 0.16)'
                              : 'rgba(37, 99, 235, 0.08)',
                          borderColor:
                            theme.mode === 'dark'
                              ? 'rgba(96, 165, 250, 0.35)'
                              : 'rgba(37, 99, 235, 0.25)',
                        },
                        !isSelected && {
                          borderColor: 'transparent',
                        },
                        pressed && { opacity: 0.85 },
                        Platform.OS === 'web' && ({
                          cursor: 'pointer',
                          transition: 'background-color 0.1s ease',
                        } as any),
                      ]}
                      onPress={() => item.action?.()}
                      onPointerEnter={() => setSelectedIndex(index)}
                    >
                      <View
                        style={[
                          styles.itemIconBox,
                          {
                            backgroundColor:
                              theme.mode === 'dark'
                                ? 'rgba(255, 255, 255, 0.05)'
                                : 'rgba(0, 0, 0, 0.04)',
                          },
                        ]}
                      >
                        {renderIcon(item, isSelected)}
                      </View>

                      <View style={styles.itemTextBox}>
                        <Text
                          style={[
                            styles.itemTitle,
                            {
                              color: isSelected
                                ? theme.mode === 'dark'
                                  ? '#93C5FD'
                                  : '#2563EB'
                                : theme.textPrimary,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        {item.subtitle && (
                          <Text
                            style={[
                              styles.itemSubtitle,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                        )}
                      </View>

                      {item.badge && (
                        <View
                          style={[
                            styles.itemBadge,
                            {
                              backgroundColor:
                                theme.mode === 'dark'
                                  ? 'rgba(255, 255, 255, 0.06)'
                                  : 'rgba(0, 0, 0, 0.05)',
                              borderColor: theme.borderSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.itemBadgeText,
                              { color: theme.textMuted },
                            ]}
                          >
                            {item.badge}
                          </Text>
                        </View>
                      )}

                      {isSelected && (
                        <CornerDownLeft
                          size={14}
                          color={theme.mode === 'dark' ? '#60A5FA' : '#2563EB'}
                          style={{ marginLeft: 6 }}
                        />
                      )}
                    </Pressable>
                  </React.Fragment>
                );
              })
            )}
          </ScrollView>

          {/* 3. Footer hướng dẫn phím tắt */}
          <View
            style={[
              styles.footer,
              {
                borderTopColor: theme.borderSubtle,
                backgroundColor:
                  theme.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'rgba(0, 0, 0, 0.02)',
              },
            ]}
          >
            <View style={styles.footerHints}>
              <View style={styles.footerHintItem}>
                <View
                  style={[
                    styles.footerKey,
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
                    style={[styles.footerKeyText, { color: theme.textMuted }]}
                  >
                    ↑↓
                  </Text>
                </View>
                <Text
                  style={[styles.footerHintText, { color: theme.textMuted }]}
                >
                  di chuyển
                </Text>
              </View>

              <View style={styles.footerHintItem}>
                <View
                  style={[
                    styles.footerKey,
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
                    style={[styles.footerKeyText, { color: theme.textMuted }]}
                  >
                    ↵
                  </Text>
                </View>
                <Text
                  style={[styles.footerHintText, { color: theme.textMuted }]}
                >
                  chọn
                </Text>
              </View>

              <View style={styles.footerHintItem}>
                <View
                  style={[
                    styles.footerKey,
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
                    style={[styles.footerKeyText, { color: theme.textMuted }]}
                  >
                    esc
                  </Text>
                </View>
                <Text
                  style={[styles.footerHintText, { color: theme.textMuted }]}
                >
                  đóng
                </Text>
              </View>
            </View>

            <View style={styles.footerRight}>
              <Text style={[styles.footerQuota, { color: theme.textMuted }]}>
                {quotaSummary.statusText}
              </Text>
              <Text style={[styles.footerBrand, { color: theme.textMuted }]}>
                Tomorrow v4.5.1
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'web' ? 70 : 40,
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  paletteCard: {
    zIndex: 10,
    width: '100%',
    maxWidth: 600,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 28,
    elevation: 20,
    overflow: 'hidden',
  },
  searchBar: {
    height: 56,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15.5,
    paddingHorizontal: 12,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  escBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  listScroll: {
    maxHeight: 380,
    paddingVertical: 6,
  },
  groupHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  groupHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextBox: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  itemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    marginLeft: 8,
  },
  itemBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12.5,
    marginTop: 4,
    textAlign: 'center',
  },
  footer: {
    height: 38,
    width: '100%',
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  footerHints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerKey: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerKeyText: {
    fontSize: 10,
    fontWeight: '700',
  },
  footerHintText: {
    fontSize: 11,
    fontWeight: '500',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerQuota: {
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.85,
  },
  footerBrand: {
    fontSize: 11,
    fontWeight: '600',
  },
});
