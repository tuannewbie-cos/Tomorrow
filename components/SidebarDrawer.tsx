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
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';
import { Notebook, DEFAULT_NOTEBOOK_ID } from '../storage/notebookStorage';
import { NotebookSidebarList } from './NotebookSidebarList';
import {
  X,
  MessageSquare,
  Plus,
  Trash2,
  Sparkles,
  Clock,
} from 'lucide-react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string, notebookId?: string) => void;
  onCreateNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
  userMemory: UserMemoryProfile;
  theme?: ThemeColors;
  notebooks?: Notebook[];
  activeNotebookId?: string;
  openSessionIdsInWorkspace?: string[];
  onSelectNotebook?: (notebookId: string) => void;
  onCreateNotebook?: (name: string) => Promise<void> | void;
  onRenameNotebook?: (notebookId: string, newName: string) => Promise<void> | void;
  onDeleteNotebook?: (notebookId: string) => Promise<void> | void;
  onCreateSessionInNotebook?: (notebookId: string) => void;
}

export const formatSessionTitle = (rawTitle?: string): string => {
  if (isPlaceholderOrNoiseTitle(rawTitle)) {
    return 'Trò chuyện ngắn';
  }
  return rawTitle!;
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
  notebooks = [{ id: DEFAULT_NOTEBOOK_ID, name: 'Ghi chú chung', createdAt: 0, updatedAt: 0 }],
  activeNotebookId = DEFAULT_NOTEBOOK_ID,
  openSessionIdsInWorkspace = [],
  onSelectNotebook = () => {},
  onCreateNotebook = async () => {},
  onRenameNotebook = async () => {},
  onDeleteNotebook = async () => {},
  onCreateSessionInNotebook = () => onCreateNewSession(),
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [isClearHovered, setIsClearHovered] = useState<boolean>(false);

  // Xác nhận xóa toàn bộ
  const handleConfirmClearAll = () => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          const confirmed = window.confirm(
            'Hành động này sẽ xóa vĩnh viễn tất cả các cuộc trò chuyện và thiết lập lại bộ nhớ tâm lý. Bạn có chắc không?'
          );
          if (confirmed) {
            onClearAll();
            if (!isDesktop) onClose();
          }
          return;
        }
      } catch (_) {}
      onClearAll();
      if (!isDesktop) onClose();
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
            if (!isDesktop) onClose();
          },
        },
      ]
    );
  };

  // Nội dung chính của Sidebar (dùng chung cho cả Split-View và Drawer)
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
      {/* Header Sidebar */}
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
            <X size={19} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Danh sách phân nhóm Sổ ghi chú Antigravity */}
        <NotebookSidebarList
          notebooks={notebooks}
          activeNotebookId={activeNotebookId}
          sessions={sessions}
          activeSessionId={activeSessionId}
          openSessionIdsInWorkspace={openSessionIdsInWorkspace}
          theme={theme}
          onSelectNotebook={onSelectNotebook}
          onCreateNotebook={onCreateNotebook}
          onRenameNotebook={onRenameNotebook}
          onDeleteNotebook={onDeleteNotebook}
          onSelectSession={(sessId, nbId) => {
            onSelectSession(sessId, nbId);
            if (!isDesktop) onClose();
          }}
          onCreateSessionInNotebook={(nbId) => {
            onCreateSessionInNotebook(nbId);
            if (!isDesktop) onClose();
          }}
          onDeleteSession={onDeleteSession}
          onCloseSidebarMobile={onClose}
        />
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
          <Trash2 size={15} color="#EF4444" />
          <Text style={styles.clearBtnText}>Xóa toàn bộ lịch sử & Reset</Text>
        </Pressable>
      </View>
    </View>
  );

  // 1. CHẾ ĐỘ SPLIT-VIEW (Desktop width >= 768px):
  if (isDesktop) {
    return (
      <View
        style={[
          styles.splitViewContainer,
          {
            width: visible ? 280 : 0,
            overflow: 'hidden',
            borderRightWidth: visible ? 1 : 0,
            borderRightColor: theme.borderSubtle,
            backgroundColor: theme.bgSidebar,
          },
          Platform.OS === 'web' && ({
            transition: 'width 0.22s cubic-bezier(0.2, 0, 0, 1)',
          } as any),
        ]}
      >
        <View style={styles.splitViewInner}>
          {renderSidebarContent(true)}
        </View>
      </View>
    );
  }

  // 2. CHẾ ĐỘ MODAL DRAWER (Mobile width < 768px):
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
    height: '100%',
    zIndex: 10,
  },
  splitViewInner: {
    width: 280,
    height: '100%',
  },
  drawerInner: {
    width: 280,
    height: '100%',
    borderRightWidth: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  modalDrawerWrapper: {
    width: 280,
    maxWidth: '85%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  backdrop: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
        : undefined,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 12,
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
    gap: 8,
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
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
        : undefined,
  },
  sessionSection: {
    marginBottom: 20,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
        : undefined,
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
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    paddingRight: 4,
  },
  sessionMainClickArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 8,
  },
  sessionItemTitle: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
    flex: 1,
    letterSpacing: -0.1,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
        : undefined,
  },
  sessionDeleteBtn: {
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  clearBtnHovered: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
