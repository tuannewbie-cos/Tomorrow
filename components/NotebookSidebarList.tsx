import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  type TextInputInstance,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  Folder,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  MoreVertical,
} from 'lucide-react-native';
import { ChatSession } from '../types/chat';
import { Notebook, DEFAULT_NOTEBOOK_ID, formatRelativeTime } from '../storage/notebookStorage';
import { ThemeColors } from '../constants/theme';
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';

const WEB_FONT_STACK =
  'Be Vietnam Pro, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const getWebCreatePortal = ():
  | ((children: React.ReactNode, container: Element) => React.ReactPortal)
  | null => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reactDom = require('react-dom') as {
      createPortal?: (children: React.ReactNode, container: Element) => React.ReactPortal;
    };
    return reactDom.createPortal ?? null;
  } catch {
    return null;
  }
};

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

type ContextMenuState =
  | {
      kind: 'session';
      id: string;
      notebookId: string;
      title: string;
      anchorRect: AnchorRect;
    }
  | {
      kind: 'notebook';
      id: string;
      title: string;
      canDelete: boolean;
      anchorRect: AnchorRect;
    };

export interface NotebookSidebarListProps {
  notebooks: Notebook[];
  activeNotebookId: string;
  sessions: ChatSession[];
  activeSessionId: string | null;
  openSessionIdsInWorkspace: string[]; // Các sessionId đang mở ở các pane trong workspace
  theme: ThemeColors;
  onSelectNotebook: (notebookId: string) => void;
  onCreateNotebook: (name: string) => Promise<void> | void;
  onRenameNotebook: (notebookId: string, newName: string) => Promise<void> | void;
  onDeleteNotebook: (notebookId: string) => Promise<void> | void;
  onSelectSession: (sessionId: string, notebookId: string) => void;
  onCreateSessionInNotebook: (notebookId: string) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => Promise<void> | void;
  onDeleteSession: (sessionId: string) => void;
  onCloseSidebarMobile?: () => void;
}

export function formatSidebarSessionTitle(rawTitle?: string): string {
  if (isPlaceholderOrNoiseTitle(rawTitle)) {
    return 'Trò chuyện ngắn';
  }
  return rawTitle?.trim() || 'Cuộc trò chuyện mới';
}

interface SidebarSessionRowProps {
  session: ChatSession;
  notebookId: string;
  isActive: boolean;
  isOpenInWorkspace: boolean;
  isDark: boolean;
  isMenuOpen: boolean;
  isRenaming: boolean;
  renameValue: string;
  onChangeRenameValue: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelectSession: (sessionId: string, notebookId: string) => void;
  onToggleMenu: (session: ChatSession, notebookId: string, rect: AnchorRect) => void;
  onDeleteSession: (sessionId: string) => void;
  onCloseSidebarMobile?: () => void;
}

const SidebarSessionRow: React.FC<SidebarSessionRowProps> = React.memo(({
  session,
  notebookId,
  isActive,
  isOpenInWorkspace,
  isDark,
  isMenuOpen,
  isRenaming,
  renameValue,
  onChangeRenameValue,
  onCommitRename,
  onCancelRename,
  onSelectSession,
  onToggleMenu,
  onDeleteSession,
  onCloseSidebarMobile,
}) => {
  const relativeTime = formatRelativeTime(session.updatedAt);
  const displayTitle = formatSidebarSessionTitle(session.title);
  const webRenameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && isRenaming && webRenameInputRef.current) {
      const input = webRenameInputRef.current;
      input.focus();
      input.select();
    }
  }, [isRenaming]);

  if (Platform.OS === 'web') {
    if (isRenaming) {
      return (
        <div
          className="tmr-chat-row is-active"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            height: 38,
            padding: '0 8px 0 32px',
            borderRadius: 10,
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.20)'}`,
            backgroundColor: isDark ? '#242429' : '#FFFFFF',
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        >
          <input
            ref={webRenameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onChangeRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onCommitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancelRename();
              }
            }}
            onBlur={() => {
              if (renameValue.trim()) {
                onCommitRename();
              } else {
                onCancelRename();
              }
            }}
            aria-label="Đổi tên đoạn chat"
            style={{
              width: '100%',
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              padding: 0,
              margin: 0,
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: '-0.2px',
              fontFamily: WEB_FONT_STACK,
              color: isDark ? '#FFFFFF' : '#111113',
            }}
          />
        </div>
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        className={`tmr-chat-row${isActive ? ' is-active' : ''}${isMenuOpen ? ' is-menu-open' : ''}`}
        onClick={() => {
          onSelectSession(session.id, notebookId);
          onCloseSidebarMobile?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectSession(session.id, notebookId);
            onCloseSidebarMobile?.();
          }
        }}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: 38,
          padding: '0 8px 0 32px',
          borderRadius: 10,
          border: `1px solid ${
            isActive
              ? isDark
                ? 'rgba(255, 255, 255, 0.10)'
                : 'rgba(0, 0, 0, 0.09)'
              : 'transparent'
          }`,
          backgroundColor: isActive
            ? isDark
              ? '#242429'
              : '#EBEBED'
            : 'transparent',
          cursor: 'pointer',
          userSelect: 'none',
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      >
        {isOpenInWorkspace && !isActive && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 15,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 5,
              height: 5,
              borderRadius: '9999px',
              backgroundColor: isDark ? '#E4E4E7' : '#18181B',
              pointerEvents: 'none',
            }}
          />
        )}

        <span
          className="tmr-chat-title"
          title={displayTitle}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 14.5,
            lineHeight: '20px',
            letterSpacing: '-0.2px',
            fontFamily: WEB_FONT_STACK,
            fontWeight: isActive ? 600 : 500,
            color: isActive
              ? isDark
                ? '#FFFFFF'
                : '#000000'
              : isDark
              ? '#E4E4E7'
              : '#1F1F23',
          }}
        >
          {displayTitle}
        </span>

        <div
          style={{
            position: 'relative',
            width: 32,
            height: 28,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginLeft: 6,
          }}
        >
          <span
            className="tmr-row-time"
            style={{
              fontSize: 13,
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.1px',
              fontFamily: WEB_FONT_STACK,
              color: isDark ? '#8E8E93' : '#6B7280',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {relativeTime}
          </span>

          <button
            type="button"
            className="tmr-row-more-btn"
            data-tmr-more-trigger={`session:${session.id}`}
            aria-label="Tùy chọn đoạn chat"
            title="Tùy chọn"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onToggleMenu(session, notebookId, {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
              });
            }}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              borderRadius: '9999px',
              border: 'none',
              background: 'transparent',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              opacity: isMenuOpen ? 1 : 0,
              pointerEvents: isMenuOpen ? 'auto' : 'none',
              color: isDark ? '#E4E4E7' : '#27272A',
            }}
          >
            <MoreVertical size={15} strokeWidth={2} color={isDark ? '#E4E4E7' : '#27272A'} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.sessionRowContainer,
        {
          backgroundColor: isActive
            ? (isDark ? '#242429' : '#EBEBED')
            : 'transparent',
          borderColor: isActive
            ? (isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.09)')
            : 'transparent',
        },
        pressed && { opacity: 0.78 },
      ]}
      onPress={() => {
        onSelectSession(session.id, notebookId);
        onCloseSidebarMobile?.();
      }}
    >
      {isOpenInWorkspace && !isActive && (
        <View
          pointerEvents="none"
          style={[
            styles.workspaceDotIndicator,
            { backgroundColor: isDark ? '#E4E4E7' : '#18181B' },
          ]}
        />
      )}

      <View style={styles.sessionMainArea}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.sessionTitleText,
            {
              color: isActive
                ? (isDark ? '#FFFFFF' : '#000000')
                : (isDark ? '#E4E4E7' : '#1F1F23'),
              fontWeight: isActive ? '600' : '500',
            },
          ]}
        >
          {displayTitle}
        </Text>
      </View>

      <View style={styles.sessionRightBox}>
        <Text
          style={[
            styles.relativeTimeText,
            { color: isDark ? '#8E8E93' : '#6B7280' },
          ]}
        >
          {relativeTime}
        </Text>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onDeleteSession(session.id);
          }}
          hitSlop={6}
          accessibilityLabel="Xóa đoạn chat"
          style={({ pressed }) => [
            styles.sessionDeleteIconBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Trash2 size={14} color="#EF4444" />
        </Pressable>
      </View>
    </Pressable>
  );
});

export const NotebookSidebarList: React.FC<NotebookSidebarListProps> = ({
  notebooks,
  activeNotebookId,
  sessions,
  activeSessionId,
  openSessionIdsInWorkspace,
  theme,
  onSelectNotebook,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onSelectSession,
  onCreateSessionInNotebook,
  onRenameSession,
  onDeleteSession,
  onCloseSidebarMobile,
}) => {
  const isDark = theme.mode === 'dark';

  // Trạng thái tạo Sổ mới inline
  const [isCreatingNotebook, setIsCreatingNotebook] = useState<boolean>(false);
  const [newNotebookName, setNewNotebookName] = useState<string>('');
  const newNotebookInputRef = useRef<TextInputInstance>(null);

  // Trạng thái đổi tên Sổ inline
  const [renamingNotebookId, setRenamingNotebookId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const webNotebookRenameInputRef = useRef<HTMLInputElement | null>(null);

  // Trạng thái đổi tên Đoạn chat inline
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameSessionValue, setRenameSessionValue] = useState<string>('');

  // Trạng thái menu 3 chấm nổi kiểu Antigravity (Portal)
  const [openMenu, setOpenMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Trạng thái mở rộng danh sách phiên "See all (N)" theo từng notebook
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Record<string, boolean>>({});

  // Palette Antigravity Minimalist
  const dividerLineColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  useEffect(() => {
    if (Platform.OS === 'web' && renamingNotebookId && webNotebookRenameInputRef.current) {
      webNotebookRenameInputRef.current.focus();
      webNotebookRenameInputRef.current.select();
    }
  }, [renamingNotebookId]);

  // Đóng menu 3 chấm khi bấm ra ngoài, cuộn trang hoặc bấm Esc
  useEffect(() => {
    if (Platform.OS !== 'web' || !openMenu || typeof document === 'undefined') return;

    const handlePointerDown = (ev: PointerEvent) => {
      const target = ev.target as Element | null;
      if (!target) {
        setOpenMenu(null);
        return;
      }
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      if (target.closest('[data-tmr-more-trigger]')) {
        return;
      }
      setOpenMenu(null);
    };

    const handleScrollOrResize = () => {
      setOpenMenu(null);
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  // Xử lý tạo sổ mới
  const handleConfirmCreateNotebook = async () => {
    const trimmed = newNotebookName.trim();
    if (trimmed) {
      await onCreateNotebook(trimmed);
    }
    setNewNotebookName('');
    setIsCreatingNotebook(false);
  };

  const handleCancelCreateNotebook = () => {
    setNewNotebookName('');
    setIsCreatingNotebook(false);
  };

  // Xử lý đổi tên sổ
  const handleStartRename = useCallback((nb: Notebook, e?: any) => {
    if (e) e.stopPropagation();
    setRenamingSessionId(null);
    setRenamingNotebookId(nb.id);
    setRenameValue(nb.name);
  }, []);

  const handleConfirmRename = async (nbId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      await onRenameNotebook(nbId, trimmed);
    }
    setRenamingNotebookId(null);
    setRenameValue('');
  };

  const handleCancelRename = () => {
    setRenamingNotebookId(null);
    setRenameValue('');
  };

  // Xử lý đổi tên đoạn chat inline
  const handleCommitSessionRename = useCallback(async () => {
    if (!renamingSessionId) return;
    const trimmed = renameSessionValue.trim();
    const targetId = renamingSessionId;
    setRenamingSessionId(null);
    setRenameSessionValue('');
    if (trimmed && onRenameSession) {
      await onRenameSession(targetId, trimmed);
    }
  }, [renamingSessionId, renameSessionValue, onRenameSession]);

  const handleCancelSessionRename = useCallback(() => {
    setRenamingSessionId(null);
    setRenameSessionValue('');
  }, []);

  // Mở / đóng menu 3 chấm của đoạn chat
  const handleToggleSessionMenu = useCallback(
    (session: ChatSession, notebookId: string, rect: AnchorRect) => {
      setOpenMenu((prev) =>
        prev?.kind === 'session' && prev.id === session.id
          ? null
          : {
              kind: 'session',
              id: session.id,
              notebookId,
              title: session.title || formatSidebarSessionTitle(session.title),
              anchorRect: rect,
            }
      );
    },
    []
  );

  // Mở / đóng menu 3 chấm của Sổ
  const handleToggleNotebookMenu = useCallback((nb: Notebook, rect: AnchorRect) => {
    setOpenMenu((prev) =>
      prev?.kind === 'notebook' && prev.id === nb.id
        ? null
        : {
            kind: 'notebook',
            id: nb.id,
            title: nb.name,
            canDelete: nb.id !== DEFAULT_NOTEBOOK_ID,
            anchorRect: rect,
          }
    );
  }, []);

  // Xử lý xóa sổ
  const handleDeleteNotebookClick = async (nbId: string, e?: any) => {
    if (e) e.stopPropagation();
    if (nbId === DEFAULT_NOTEBOOK_ID) return;
    await onDeleteNotebook(nbId);
  };

  // Toggle see all
  const toggleSeeAll = (nbId: string) => {
    setExpandedNotebookIds((prev) => ({
      ...prev,
      [nbId]: !prev[nbId],
    }));
  };

  return (
    <View style={styles.container}>
      {/* 1. THANH NÚT TRÊN CÙNG SIDEBAR: + Trò chuyện mới & Sổ mới (34px, không clip chữ) */}
      <View style={styles.topActionsRow}>
        {/* Nút Tạo cuộc trò chuyện mới */}
        <Pressable
          style={({ pressed }) => [
            styles.newChatBtn,
            {
              backgroundColor: isDark ? '#1C1C20' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.10)',
            },
            pressed && { opacity: 0.8 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={() => {
            onCreateSessionInNotebook(activeNotebookId);
            onCloseSidebarMobile?.();
          }}
          {...(Platform.OS === 'web' && ({ className: 'tmr-sb-btn tmr-sb-btn-chat' } as any))}
        >
          <Plus
            size={14}
            strokeWidth={1.8}
            color={isDark ? '#F4F4F5' : '#111113'}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.newChatText,
              { color: isDark ? '#F4F4F5' : '#111113' },
            ]}
          >
            Trò chuyện mới
          </Text>
        </Pressable>

        {/* Nút Sổ mới */}
        <Pressable
          style={({ pressed }) => [
            styles.newNotebookBtn,
            {
              backgroundColor: isDark ? 'transparent' : 'rgba(0, 0, 0, 0.025)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)',
            },
            pressed && { opacity: 0.8 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={() => {
            setIsCreatingNotebook(true);
            setTimeout(() => newNotebookInputRef.current?.focus(), 50);
          }}
          hitSlop={6}
          {...(Platform.OS === 'web' && ({ className: 'tmr-sb-btn tmr-sb-btn-nb' } as any))}
        >
          <Folder
            size={14}
            strokeWidth={1.85}
            color={isDark ? '#E4E4E7' : '#111113'}
          />
          <Text
            style={[
              styles.newNotebookText,
              {
                color: isDark ? '#F4F4F5' : '#111113',
              },
            ]}
          >
            Sổ mới
          </Text>
        </Pressable>
      </View>

      {/* Hairline Divider ngăn cách với danh sách kèm khoảng thở sạch 10px */}
      <View style={[styles.sectionDivider, { backgroundColor: dividerLineColor }]} />

      {/* Ô nhập tạo sổ mới inline (34px) */}
      {isCreatingNotebook && (
        <View
          style={[
            styles.inlineCreateBox,
            {
              backgroundColor: isDark ? '#1C1C20' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.14)',
            },
          ]}
        >
          <Folder size={13} color={isDark ? '#F4F4F5' : '#111113'} style={{ marginRight: 6 }} />
          <TextInput
            ref={newNotebookInputRef}
            style={[
              styles.inlineInput,
              { color: isDark ? '#F4F4F5' : '#111113' },
            ]}
            placeholder="Tên sổ ghi chú mới..."
            placeholderTextColor={isDark ? '#71717A' : '#9CA3AF'}
            value={newNotebookName}
            onChangeText={setNewNotebookName}
            onKeyPress={(e) => {
              if (Platform.OS === 'web') {
                const key = (e.nativeEvent as any).key;
                if (key === 'Enter') {
                  e.preventDefault();
                  handleConfirmCreateNotebook();
                } else if (key === 'Escape') {
                  e.preventDefault();
                  handleCancelCreateNotebook();
                }
              }
            }}
            onSubmitEditing={handleConfirmCreateNotebook}
            returnKeyType="done"
          />
          <Pressable
            style={styles.inlineActionBtn}
            onPress={handleConfirmCreateNotebook}
            hitSlop={4}
          >
            <Check size={14} color="#10B981" />
          </Pressable>
          <Pressable
            style={styles.inlineActionBtn}
            onPress={handleCancelCreateNotebook}
            hitSlop={4}
          >
            <X size={14} color="#EF4444" />
          </Pressable>
        </View>
      )}

      {/* 2. DANH SÁCH SỔ GHI CHÚ PHÂN NHÓM CHUẨN ANTIGRAVITY MINIMALIST */}
      <View style={styles.notebooksContainer}>
        {notebooks.map((nb) => {
          const isNotebookActive = nb.id === activeNotebookId;
          const isRenaming = renamingNotebookId === nb.id;
          const isFolderMenuOpen = openMenu?.kind === 'notebook' && openMenu.id === nb.id;

          // Lọc danh sách phiên thuộc notebook này
          const nbSessions = sessions.filter(
            (s) => (s.notebookId || DEFAULT_NOTEBOOK_ID) === nb.id
          );

          // Phân trang mặc định 5 phiên
          const isExpanded = !!expandedNotebookIds[nb.id];
          const displayedSessions = isExpanded ? nbSessions : nbSessions.slice(0, 5);
          const hasMore = nbSessions.length > 5;

          return (
            <View key={nb.id} style={styles.notebookGroup}>
              {/* HÀNG TIÊU ĐỀ SỔ (Folder Row: Flat Minimalist) */}
              {isRenaming ? (
                Platform.OS === 'web' ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      height: 36,
                      padding: '0 8px 0 10px',
                      borderRadius: 9,
                      marginBottom: 4,
                      border: `1px solid ${
                        isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.18)'
                      }`,
                      backgroundColor: isDark ? '#1C1C20' : '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Folder
                      size={16}
                      strokeWidth={1.75}
                      color={isDark ? '#F4F4F5' : '#111113'}
                      style={{ marginRight: 9, flexShrink: 0 }}
                    />
                    <input
                      ref={webNotebookRenameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleConfirmRename(nb.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCancelRename();
                        }
                      }}
                      onBlur={() => {
                        if (renameValue.trim()) {
                          void handleConfirmRename(nb.id);
                        } else {
                          handleCancelRename();
                        }
                      }}
                      aria-label="Đổi tên sổ"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        padding: 0,
                        margin: 0,
                        fontSize: 14.5,
                        fontWeight: 600,
                        letterSpacing: '-0.15px',
                        fontFamily: WEB_FONT_STACK,
                        color: isDark ? '#F4F4F5' : '#111113',
                      }}
                    />
                  </div>
                ) : (
                  <View
                    style={[
                      styles.inlineRenameBox,
                      {
                        backgroundColor: isDark ? '#1C1C20' : '#FFFFFF',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.14)',
                      },
                    ]}
                  >
                    <Folder size={13} color={isDark ? '#F4F4F5' : '#111113'} style={{ marginRight: 6 }} />
                    <TextInput
                      autoFocus
                      style={[styles.inlineInput, { color: isDark ? '#F4F4F5' : '#111113' }]}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      onSubmitEditing={() => handleConfirmRename(nb.id)}
                      returnKeyType="done"
                    />
                    <Pressable
                      style={styles.inlineActionBtn}
                      onPress={() => handleConfirmRename(nb.id)}
                      hitSlop={4}
                    >
                      <Check size={14} color="#10B981" />
                    </Pressable>
                    <Pressable
                      style={styles.inlineActionBtn}
                      onPress={handleCancelRename}
                      hitSlop={4}
                    >
                      <X size={14} color="#EF4444" />
                    </Pressable>
                  </View>
                )
              ) : Platform.OS === 'web' ? (
                <div
                  role="button"
                  tabIndex={0}
                  className={`tmr-folder-row${isFolderMenuOpen ? ' is-menu-open' : ''}`}
                  onClick={() => onSelectNotebook(nb.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectNotebook(nb.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 36,
                    padding: '0 8px 0 10px',
                    borderRadius: 9,
                    marginBottom: 4,
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Folder
                      size={16}
                      strokeWidth={1.75}
                      color={
                        isNotebookActive
                          ? isDark
                            ? '#F4F4F5'
                            : '#18181B'
                          : isDark
                          ? '#A1A1AA'
                          : '#52525B'
                      }
                      style={{ marginRight: 9, flexShrink: 0 }}
                    />
                    <span
                      className="tmr-folder-title"
                      title={nb.name}
                      style={{
                        fontSize: 14.5,
                        fontWeight: 600,
                        letterSpacing: '-0.15px',
                        fontFamily: WEB_FONT_STACK,
                        color: isNotebookActive
                          ? isDark
                            ? '#F4F4F5'
                            : '#18181B'
                          : isDark
                          ? '#A1A1AA'
                          : '#52525B',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {nb.name}
                    </span>
                  </div>

                  <div
                    className="tmr-folder-actions"
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 2,
                      flexShrink: 0,
                      marginLeft: 4,
                      opacity: isFolderMenuOpen ? 1 : 0,
                      pointerEvents: isFolderMenuOpen ? 'auto' : 'none',
                    }}
                  >
                    <button
                      type="button"
                      className="tmr-folder-icon-btn"
                      aria-label="Tạo đoạn chat trong sổ này"
                      title="Tạo đoạn chat mới trong sổ này"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateSessionInNotebook(nb.id);
                        onCloseSidebarMobile?.();
                      }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '9999px',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} strokeWidth={2} color={isDark ? '#E4E4E7' : '#27272A'} />
                    </button>

                    <button
                      type="button"
                      className="tmr-folder-icon-btn"
                      data-tmr-more-trigger={`notebook:${nb.id}`}
                      aria-label="Tùy chọn sổ"
                      title="Tùy chọn sổ"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleToggleNotebookMenu(nb, {
                          top: rect.top,
                          bottom: rect.bottom,
                          left: rect.left,
                          right: rect.right,
                          width: rect.width,
                          height: rect.height,
                        });
                      }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '9999px',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <MoreVertical
                        size={14}
                        strokeWidth={2}
                        color={isDark ? '#E4E4E7' : '#27272A'}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <View style={[styles.folderRow, { backgroundColor: 'transparent' }]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.folderMainClick,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => onSelectNotebook(nb.id)}
                  >
                    <Folder
                      size={16}
                      strokeWidth={1.75}
                      color={
                        isNotebookActive
                          ? (isDark ? '#F4F4F5' : '#18181B')
                          : (isDark ? '#A1A1AA' : '#52525B')
                      }
                      style={{ marginRight: 9 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.folderTitle,
                        {
                          color: isNotebookActive
                            ? (isDark ? '#F4F4F5' : '#18181B')
                            : (isDark ? '#A1A1AA' : '#52525B'),
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {nb.name}
                    </Text>
                  </Pressable>

                  <View style={styles.folderActionsRight}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.folderActionIconBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        onCreateSessionInNotebook(nb.id);
                        onCloseSidebarMobile?.();
                      }}
                      hitSlop={6}
                      accessibilityLabel="Tạo đoạn chat trong sổ này"
                    >
                      <Plus size={14} color={isDark ? '#E4E4E7' : '#27272A'} />
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.folderActionIconBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={(e) => handleStartRename(nb, e)}
                      hitSlop={6}
                      accessibilityLabel="Đổi tên sổ"
                    >
                      <Pencil size={13} color={isDark ? '#E4E4E7' : '#27272A'} />
                    </Pressable>

                    {nb.id !== DEFAULT_NOTEBOOK_ID && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.folderActionIconBtn,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={(e) => handleDeleteNotebookClick(nb.id, e)}
                        hitSlop={6}
                        accessibilityLabel="Xóa sổ"
                      >
                        <Trash2 size={13} color={isDark ? '#E4E4E7' : '#27272A'} />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {/* DANH SÁCH ĐOẠN CHAT PURE TYPOGRAPHY CHUẨN ANTIGRAVITY (KHÔNG icon 💬, KHÔNG vạch dọc) */}
              <View style={styles.sessionListGroup}>
                {nbSessions.length === 0 ? (
                  <Text style={[styles.emptyNbText, { color: isDark ? '#71717A' : '#71717A' }]}>
                    Chưa có đoạn chat nào
                  </Text>
                ) : (
                  displayedSessions.map((sess) => {
                    const isSessionRenaming = renamingSessionId === sess.id;
                    const isSessionMenuOpen =
                      openMenu?.kind === 'session' && openMenu.id === sess.id;

                    return (
                      <SidebarSessionRow
                        key={sess.id}
                        session={sess}
                        notebookId={nb.id}
                        isActive={sess.id === activeSessionId}
                        isOpenInWorkspace={openSessionIdsInWorkspace.includes(sess.id)}
                        isDark={isDark}
                        isMenuOpen={isSessionMenuOpen}
                        isRenaming={isSessionRenaming}
                        renameValue={isSessionRenaming ? renameSessionValue : ''}
                        onChangeRenameValue={setRenameSessionValue}
                        onCommitRename={() => void handleCommitSessionRename()}
                        onCancelRename={handleCancelSessionRename}
                        onSelectSession={onSelectSession}
                        onToggleMenu={handleToggleSessionMenu}
                        onDeleteSession={onDeleteSession}
                        onCloseSidebarMobile={onCloseSidebarMobile}
                      />
                    );
                  })
                )}

                {/* Nút See all (N) / Thu gọn căn thẳng mép chữ 32px */}
                {hasMore && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.seeAllBtn,
                      pressed && { opacity: 0.7 },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={() => toggleSeeAll(nb.id)}
                    hitSlop={4}
                    {...(Platform.OS === 'web' && ({ className: 'tmr-see-all-btn' } as any))}
                  >
                    <Text
                      style={[
                        styles.seeAllText,
                        { color: isDark ? '#8E8E93' : '#71717A' },
                      ]}
                      {...(Platform.OS === 'web' && ({ className: 'tmr-see-all-text' } as any))}
                    >
                      {isExpanded ? 'Thu gọn' : `See all (${nbSessions.length})`}
                    </Text>
                    {isExpanded ? (
                      <ChevronDown
                        size={13}
                        color={isDark ? '#8E8E93' : '#71717A'}
                        style={{ marginLeft: 4 }}
                      />
                    ) : (
                      <ChevronRight
                        size={13}
                        color={isDark ? '#8E8E93' : '#71717A'}
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* 3. CONTEXT MENU NỔI KIỂU ANTIGRAVITY QUA PORTAL (CHỈ RENAME & DELETE) */}
      {(() => {
        if (Platform.OS !== 'web' || !openMenu || typeof document === 'undefined') {
          return null;
        }
        const createPortalFn = getWebCreatePortal();
        if (!createPortalFn) return null;

        const showDelete =
          openMenu.kind === 'session' || (openMenu.kind === 'notebook' && openMenu.canDelete);
        const MENU_WIDTH = 172;
        const estimatedHeight = showDelete ? 94 : 48;
        const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

        const shouldFlipUp =
          openMenu.anchorRect.bottom + 6 + estimatedHeight > viewportH - 12 &&
          openMenu.anchorRect.top - 6 - estimatedHeight >= 12;

        const topPos = shouldFlipUp
          ? Math.max(12, openMenu.anchorRect.top - 6 - estimatedHeight)
          : Math.min(viewportH - estimatedHeight - 12, openMenu.anchorRect.bottom + 6);

        const leftPos = Math.max(
          12,
          Math.min(viewportW - MENU_WIDTH - 12, openMenu.anchorRect.left)
        );

        const menuCssVars = {
          '--tmr-menu-hover-bg': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          '--tmr-menu-danger-color': isDark ? '#F87171' : '#DC2626',
        } as React.CSSProperties;

        return createPortalFn(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Menu tùy chọn"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              ...menuCssVars,
              position: 'fixed',
              top: topPos,
              left: leftPos,
              width: MENU_WIDTH,
              padding: 6,
              borderRadius: 12,
              backgroundColor: isDark ? '#1E1E22' : '#FFFFFF',
              border: `1px solid ${
                isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)'
              }`,
              boxShadow: isDark
                ? '0 12px 32px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35)'
                : '0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)',
              zIndex: 9999,
              boxSizing: 'border-box',
              fontFamily: WEB_FONT_STACK,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="tmr-menu-item-rename"
              onClick={(e) => {
                e.stopPropagation();
                const current = openMenu;
                setOpenMenu(null);
                if (current.kind === 'session') {
                  setRenamingNotebookId(null);
                  setRenamingSessionId(current.id);
                  setRenameSessionValue(formatSidebarSessionTitle(current.title));
                } else {
                  setRenamingSessionId(null);
                  setRenamingNotebookId(current.id);
                  setRenameValue(current.title);
                }
              }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: isDark ? '#F4F4F5' : '#18181B',
                fontSize: 13.5,
                fontWeight: 500,
                fontFamily: WEB_FONT_STACK,
                textAlign: 'left',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <Pencil size={15} strokeWidth={1.85} />
              <span>Rename</span>
            </button>

            {showDelete && (
              <>
                <div
                  style={{
                    height: 1,
                    margin: '4px 6px',
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.08)',
                  }}
                />
                <button
                  type="button"
                  role="menuitem"
                  className="tmr-menu-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    const current = openMenu;
                    setOpenMenu(null);
                    if (current.kind === 'session') {
                      onDeleteSession(current.id);
                    } else if (current.kind === 'notebook' && current.canDelete) {
                      void handleDeleteNotebookClick(current.id);
                    }
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: isDark ? '#F4F4F5' : '#18181B',
                    fontSize: 13.5,
                    fontWeight: 500,
                    fontFamily: WEB_FONT_STACK,
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  <Trash2 size={15} strokeWidth={1.85} />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>,
          document.body
        );
      })()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  newChatBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  newChatText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.15,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  newNotebookBtn: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  newNotebookText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.15,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  sectionDivider: {
    height: 1,
    width: '100%',
    marginBottom: 10,
  },
  inlineCreateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    marginBottom: 10,
  },
  inlineRenameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    marginVertical: 1,
  },
  inlineInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 2,
    paddingHorizontal: 4,
    outlineStyle: 'none' as any,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  inlineActionBtn: {
    padding: 3,
    marginLeft: 3,
  },
  notebooksContainer: {
    width: '100%',
  },
  notebookGroup: {
    marginBottom: 10,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 9,
    marginVertical: 1,
  },
  folderMainClick: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  folderTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  folderActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  folderActionIconBtn: {
    padding: 3,
    borderRadius: 4,
  },
  sessionListGroup: {
    marginTop: 2,
    gap: 2,
  },
  emptyNbText: {
    fontSize: 13.5,
    fontStyle: 'italic',
    paddingVertical: 6,
    paddingLeft: 32,
    paddingRight: 12,
  },
  sessionRowContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 32,
    paddingRight: 12,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
  },
  sessionMainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
  },
  workspaceDotIndicator: {
    position: 'absolute',
    left: 15,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sessionTitleText: {
    fontSize: 14.5,
    letterSpacing: -0.2,
    flex: 1,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  sessionRightBox: {
    position: 'relative',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 32,
    height: 20,
  },
  relativeTimeText: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  sessionDeleteIconBtn: {
    padding: 2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingLeft: 32,
    paddingRight: 12,
    marginTop: 2,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
});
