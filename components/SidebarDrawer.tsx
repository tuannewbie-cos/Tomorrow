import React, { useState, useEffect } from 'react';
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
import { TomorrowGlyph } from './TomorrowGlyph';
import {
  PanelLeftClose,
  Trash2,
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
  const isDark = theme.mode === 'dark';
  const borderDivider = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const borderRightColor = isDark ? 'rgba(255, 255, 255, 0.07)' : '#E6E6EA';

  // Inject Web CSS for scrollbar and 60fps micro-animations without background lag
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'tmr-sidebar-ember-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        .tmr-sidebar-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .tmr-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .tmr-sidebar-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 4px;
        }
        .tmr-sidebar-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(120, 120, 128, 0.28);
        }
        .tmr-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(120, 120, 128, 0.5);
        }
        .tmr-sb-btn {
          transition: border-color 140ms ease, transform 120ms ease;
        }
        .tmr-sb-btn:active {
          transform: scale(0.985);
        }
        .tmr-sb-dark .tmr-sb-btn-chat:hover {
          background-color: #25252B !important;
          border-color: rgba(255, 255, 255, 0.16) !important;
        }
        .tmr-sb-light .tmr-sb-btn-chat:hover {
          background-color: #F1F1F4 !important;
          border-color: rgba(0, 0, 0, 0.14) !important;
        }
        .tmr-sb-dark .tmr-sb-btn-nb:hover {
          background-color: #222226 !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
        }
        .tmr-sb-light .tmr-sb-btn-nb:hover {
          background-color: rgba(0, 0, 0, 0.055) !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .tmr-sb-dark .tmr-folder-row:hover {
          background-color: rgba(255, 255, 255, 0.05) !important;
        }
        .tmr-sb-light .tmr-folder-row:hover {
          background-color: rgba(0, 0, 0, 0.04) !important;
        }
        .tmr-sb-dark .tmr-folder-row:hover .tmr-folder-title {
          color: #F4F4F5 !important;
        }
        .tmr-sb-light .tmr-folder-row:hover .tmr-folder-title {
          color: #18181B !important;
        }
        .tmr-folder-actions {
          opacity: 0;
          pointer-events: none;
          transition: opacity 140ms ease;
        }
        .tmr-folder-row:hover .tmr-folder-actions {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        .tmr-sb-dark .tmr-sidebar-row:not(.is-active):hover {
          background-color: rgba(255, 255, 255, 0.05) !important;
        }
        .tmr-sb-light .tmr-sidebar-row:not(.is-active):hover {
          background-color: rgba(0, 0, 0, 0.04) !important;
        }
        .tmr-sb-dark .tmr-sidebar-row:hover .tmr-sb-row-title {
          color: #FFFFFF !important;
        }
        .tmr-sb-light .tmr-sidebar-row:hover .tmr-sb-row-title {
          color: #000000 !important;
        }
        .tmr-sidebar-row .tmr-row-time {
          opacity: 1;
          pointer-events: auto;
          transition: opacity 120ms ease;
        }
        .tmr-sidebar-row .tmr-row-delete {
          opacity: 0;
          pointer-events: none;
          position: absolute;
          right: 0;
          transition: opacity 120ms ease;
        }
        .tmr-sidebar-row:hover .tmr-row-time {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .tmr-sidebar-row:hover .tmr-row-delete {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        .tmr-sb-dark .tmr-see-all-btn:hover .tmr-see-all-text {
          color: #E4E4E7 !important;
        }
        .tmr-sb-light .tmr-see-all-btn:hover .tmr-see-all-text {
          color: #18181B !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

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
          borderRightColor: borderRightColor,
        },
      ]}
      {...(Platform.OS === 'web' && ({ className: isDark ? 'tmr-sb-dark' : 'tmr-sb-light' } as any))}
    >
      {/* Brand Bar Header Sidebar: 52px trục chuẩn */}
      <View style={[styles.drawerHeader, { borderBottomColor: borderDivider }]}>
        <View style={styles.brandRow}>
          <TomorrowGlyph size={18} themeMode={theme.mode} color={isDark ? '#FFFFFF' : '#09090B'} />
          <Text style={[styles.brandTitle, { color: isDark ? '#FFFFFF' : '#09090B' }]}>Tomorrow</Text>
        </View>
        {showCloseBtn && (
          <Pressable
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
              Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
            ]}
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Đóng sidebar"
          >
            <PanelLeftClose size={16} color={isDark ? '#A1A1AA' : '#71717A'} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        {...(Platform.OS === 'web' && ({ className: 'tmr-sidebar-scroll' } as any))}
      >
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
          onCloseSidebarMobile={isDesktop ? undefined : onClose}
        />
      </ScrollView>

      {/* Footer nút xóa toàn bộ lịch sử: Ghost style, hover đỏ dịu */}
      <View style={[styles.drawerFooter, { borderTopColor: borderDivider }]}>
        <Pressable
          style={({ pressed }) => [
            styles.clearBtn,
            {
              backgroundColor: isClearHovered
                ? (isDark ? 'rgba(239, 68, 68, 0.09)' : 'rgba(220, 38, 38, 0.07)')
                : 'transparent',
              borderColor: isClearHovered
                ? (isDark ? 'rgba(239, 68, 68, 0.22)' : 'rgba(220, 38, 38, 0.18)')
                : 'transparent',
            },
            pressed && styles.btnPressed,
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={handleConfirmClearAll}
          onHoverIn={() => setIsClearHovered(true)}
          onHoverOut={() => setIsClearHovered(false)}
        >
          <Trash2
            size={14}
            color={
              isClearHovered
                ? (isDark ? '#F87171' : '#DC2626')
                : '#71717A'
            }
          />
          <Text
            style={[
              styles.clearBtnText,
              {
                color: isClearHovered
                  ? (isDark ? '#F87171' : '#DC2626')
                  : '#71717A',
              },
            ]}
          >
            Xóa toàn bộ lịch sử & Reset
          </Text>
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
            opacity: visible ? 1 : 0,
            overflow: 'hidden',
            borderRightWidth: visible ? 1 : 0,
            borderRightColor: borderRightColor,
            backgroundColor: theme.bgSidebar,
          },
          Platform.OS === 'web' && ({
            transition:
              'width 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
            transform: visible ? 'translateX(0)' : 'translateX(-10px)',
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
    paddingHorizontal: 14,
    height: 52,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
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
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 16,
  },
  btnPressed: {
    opacity: 0.75,
  },
  drawerFooter: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
        : undefined,
  },
});
