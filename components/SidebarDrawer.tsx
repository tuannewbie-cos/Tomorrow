import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { ChatSession, UserMemoryProfile } from '../types/chat';
import {
  X,
  MessageSquare,
  Plus,
  Trash2,
  Sparkles,
  Brain,
  ShieldCheck,
  Clock,
} from 'lucide-react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
  userMemory: UserMemoryProfile;
  theme?: ThemeColors;
}

export const formatSessionTitle = (rawTitle?: string): string => {
  if (!rawTitle) return 'Cuộc trò chuyện mới';
  const clean = rawTitle.trim().toLowerCase();
  const banned = ['hello', 'helo', 'hi', 'hí', 'halo', 'yo', 'ê', 'alo', 'ơi', 'test', 'ok', 'ừ'];
  if (banned.includes(clean) || clean.length <= 4) {
    return 'Trò chuyện ngắn';
  }
  return rawTitle;
};

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  visible,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewSession,
  onDeleteSession,
  onClearAll,
  userMemory,
  theme = DARK_THEME,
}) => {
  const { width } = useWindowDimensions();
  const isDesktopSplitView = width >= 900;

  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [isNewChatHovered, setIsNewChatHovered] = useState<boolean>(false);
  const [isClearHovered, setIsClearHovered] = useState<boolean>(false);

  // Xác nhận xóa toàn bộ
  const handleConfirmClearAll = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Hành động này sẽ xóa vĩnh viễn tất cả các cuộc trò chuyện và thiết lập lại bộ nhớ tâm lý. Bạn có chắc không?'
      );
      if (confirmed) {
        onClearAll();
        if (!isDesktopSplitView) onClose();
      }
      return;
    }

    Alert.alert(
      'Xóa toàn bộ lịch sử?',
      'Hành động này sẽ xóa vĩnh viễn tất cả các cuộc trò chuyện và thiết lập lại bộ nhớ tâm lý. Bạn có chắc không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa sạch',
          style: 'destructive',
          onPress: () => {
            onClearAll();
            if (!isDesktopSplitView) onClose();
          },
        },
      ]
    );
  };

  // Xác nhận xóa 1 phiên
  const handleConfirmDeleteSession = (session: ChatSession) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Bạn có chắc muốn xóa cuộc trò chuyện "${formatSessionTitle(session.title)}" không?`
      );
      if (confirmed) {
        onDeleteSession(session.id);
      }
      return;
    }

    Alert.alert(
      'Xóa cuộc trò chuyện?',
      `Bạn có chắc muốn xóa cuộc trò chuyện "${formatSessionTitle(session.title)}" không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            onDeleteSession(session.id);
          },
        },
      ]
    );
  };

  // Nội dung chính của Sidebar (dùng chung cho cả Split-View và Modal)
  const renderSidebarContent = (showCloseBtn: boolean = true) => (
    <View
      style={[
        styles.drawerInner,
        {
          backgroundColor: theme.bgSidebar,
          borderRightColor: theme.borderSubtle,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.drawerHeader, { borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.brandRow}>
          <Sparkles size={20} color="#8B5CF6" />
          <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>Tomorrow</Text>
        </View>
        {showCloseBtn && (
          <Pressable
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { backgroundColor: theme.btnHover },
              Platform.OS === 'web' && { cursor: 'pointer' as any },
            ]}
            onPress={onClose}
            hitSlop={8}
          >
            <X size={20} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Nút Tạo Phiên Mới (Cuộc trò chuyện mới chuẩn Desktop macOS) */}
        <Pressable
          style={({ pressed }) => [
            styles.newChatBtn,
            {
              backgroundColor: theme.mode === 'dark' ? 'rgba(30, 34, 45, 0.85)' : '#F1F5F9',
              borderColor: isNewChatHovered
                ? (theme.mode === 'dark' ? '#60A5FA' : '#3B82F6')
                : (theme.mode === 'dark' ? 'rgba(96, 165, 250, 0.35)' : 'rgba(37, 99, 235, 0.25)'),
            },
            isNewChatHovered && {
              backgroundColor: theme.mode === 'dark' ? 'rgba(37, 99, 235, 0.16)' : 'rgba(37, 99, 235, 0.08)',
              shadowColor: '#3B82F6',
              shadowOpacity: 0.28,
              shadowRadius: 10,
            },
            pressed && styles.btnPressed,
            Platform.OS === 'web' && ({
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            } as any),
          ]}
          onPress={() => {
            onCreateNewSession();
            if (!isDesktopSplitView) onClose();
          }}
          onHoverIn={() => setIsNewChatHovered(true)}
          onHoverOut={() => setIsNewChatHovered(false)}
        >
          <Plus size={18} color={isNewChatHovered ? '#60A5FA' : theme.textPrimary} />
          <Text
            style={[
              styles.newChatText,
              { color: isNewChatHovered ? (theme.mode === 'dark' ? '#93C5FD' : '#2563EB') : theme.textPrimary },
            ]}
          >
            Cuộc trò chuyện mới
          </Text>
        </Pressable>

        {/* Danh sách Gần đây (Recent Sessions) */}
        <View style={styles.sessionSection}>
          <View style={styles.recentSectionHeader}>
            <Clock size={14} color={theme.textMuted} />
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Gần đây</Text>
          </View>

          {sessions.length === 0 ? (
            <View style={styles.emptySessionBox}>
              <Text style={[styles.emptySessionText, { color: theme.textMuted }]}>
                Chưa có cuộc trò chuyện nào trước đó
              </Text>
            </View>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === activeSessionId;
              const isHovered = hoveredSessionId === sess.id;
              return (
                <View
                  key={sess.id}
                  style={[
                    styles.sessionItemContainer,
                    {
                      backgroundColor: theme.btnBg,
                      borderColor: theme.borderSubtle,
                    },
                    isActive && {
                      backgroundColor:
                        theme.mode === 'dark' ? 'rgba(37, 99, 235, 0.18)' : 'rgba(37, 99, 235, 0.1)',
                      borderColor: theme.bubbleUser,
                    },
                    isHovered && !isActive && { backgroundColor: theme.btnHover },
                  ]}
                  onPointerEnter={() => setHoveredSessionId(sess.id)}
                  onPointerLeave={() => setHoveredSessionId(null)}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.sessionMainClickArea,
                      pressed && styles.btnPressed,
                      Platform.OS === 'web' && { cursor: 'pointer' as any },
                    ]}
                    onPress={() => {
                      onSelectSession(sess.id);
                      if (!isDesktopSplitView) onClose();
                    }}
                  >
                    <MessageSquare
                      size={16}
                      color={isActive ? theme.bubbleUser : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.sessionItemTitle,
                        { color: theme.textPrimary },
                        isActive && { color: theme.bubbleUser, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {formatSessionTitle(sess.title)}
                    </Text>
                  </Pressable>

                  {/* Nút xóa session (icon thùng rác nhỏ) */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.sessionDeleteBtn,
                      pressed && styles.btnPressed,
                      Platform.OS === 'web' && { cursor: 'pointer' as any },
                    ]}
                    onPress={() => handleConfirmDeleteSession(sess)}
                    hitSlop={8}
                  >
                    <Trash2 size={15} color={theme.textMuted} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Footer nút xóa toàn bộ lịch sử */}
      <View style={[styles.drawerFooter, { borderTopColor: theme.borderSubtle }]}>
        <Pressable
          style={({ pressed }) => [
            styles.clearBtn,
            pressed && styles.btnPressed,
            isClearHovered && styles.clearBtnHovered,
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={handleConfirmClearAll}
          onHoverIn={() => setIsClearHovered(true)}
          onHoverOut={() => setIsClearHovered(false)}
        >
          <Trash2 size={16} color="#EF4444" />
          <Text style={styles.clearBtnText}>Xóa toàn bộ lịch sử & Reset</Text>
        </Pressable>
      </View>
    </View>
  );

  // 1. CHẾ ĐỘ SPLIT-VIEW (Desktop width >= 900px):
  // Hiển thị trực tiếp trong flex layout, không dùng Modal overlay
  if (isDesktopSplitView) {
    if (!visible) return null;
    return (
      <View style={styles.splitViewContainer}>
        {renderSidebarContent(true)}
      </View>
    );
  }

  // 2. CHẾ ĐỘ MODAL DRAWER (Mobile / Narrow Desktop):
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalDrawerWrapper}>
          {renderSidebarContent(true)}
        </View>
        <Pressable
          style={[styles.backdrop, Platform.OS === 'web' && { cursor: 'pointer' as any }]}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  splitViewContainer: {
    width: 280,
    height: '100%',
    zIndex: 10,
  },
  drawerInner: {
    width: 280,
    height: '100%',
    borderRightWidth: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  modalDrawerWrapper: {
    width: '82%',
    maxWidth: 320,
    height: '100%',
  },
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 58,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 20,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  newChatText: {
    fontWeight: '600',
    fontSize: 13.5,
    letterSpacing: -0.2,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  sessionSection: {
    marginBottom: 24,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptySessionBox: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  emptySessionText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  sessionItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    paddingRight: 6,
  },
  sessionMainClickArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 6,
    gap: 10,
  },
  sessionItemTitle: {
    fontSize: 13.5,
    fontWeight: '500',
    flex: 1,
  },
  sessionDeleteBtn: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memorySection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  memoryBox: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  memoryFieldTitle: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  memoryFieldValue: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  storageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  storageStatusText: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '500',
    flex: 1,
  },
  btnPressed: {
    opacity: 0.75,
  },
  drawerFooter: {
    padding: 14,
    borderTopWidth: 1,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  clearBtnHovered: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
