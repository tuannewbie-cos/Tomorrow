import React, { useState, useRef } from 'react';
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
} from 'lucide-react-native';
import { ChatSession } from '../types/chat';
import { Notebook, DEFAULT_NOTEBOOK_ID, formatRelativeTime } from '../storage/notebookStorage';
import { ThemeColors } from '../constants/theme';
import { isPlaceholderOrNoiseTitle } from '../storage/chatStorage';

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
  onSelectSession: (sessionId: string, notebookId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCloseSidebarMobile?: () => void;
}

const SidebarSessionRow: React.FC<SidebarSessionRowProps> = React.memo(({
  session,
  notebookId,
  isActive,
  isOpenInWorkspace,
  isDark,
  onSelectSession,
  onDeleteSession,
  onCloseSidebarMobile,
}) => {
  const relativeTime = formatRelativeTime(session.updatedAt);

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
        Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
      ]}
      onPress={() => {
        onSelectSession(session.id, notebookId);
        onCloseSidebarMobile?.();
      }}
      {...(Platform.OS === 'web' && ({
        className: `tmr-sidebar-row${isActive ? ' is-active' : ''}`,
      } as any))}
    >
      {/* Chấm tròn đơn sắc 5px trung tính cho pane phụ Split Screen */}
      {isOpenInWorkspace && !isActive && (
        <View
          pointerEvents="none"
          style={[
            styles.workspaceDotIndicator,
            { backgroundColor: isDark ? '#E4E4E7' : '#18181B' },
          ]}
        />
      )}

      {/* Khu vực tiêu đề phiên giãn đầy 100% */}
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
          {...(Platform.OS === 'web' && ({ className: 'tmr-sb-row-title' } as any))}
        >
          {formatSidebarSessionTitle(session.title)}
        </Text>
      </View>

      {/* Mốc thời gian & Nút Xóa: dùng CSS :hover thuần trên Web, nút xóa mặc định pointerEvents='none' */}
      <View style={styles.sessionRightBox}>
        <Text
          pointerEvents="none"
          style={[
            styles.relativeTimeText,
            { color: isDark ? '#8E8E93' : '#6B7280' },
          ]}
          {...(Platform.OS === 'web' && ({ className: 'tmr-row-time' } as any))}
        >
          {relativeTime}
        </Text>
        {Platform.OS === 'web' && (
          <Pressable
            pointerEvents="none"
            style={({ pressed }) => [
              styles.sessionDeleteIconBtn,
              pressed && { opacity: 0.7 },
              { cursor: 'pointer' } as any,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onDeleteSession(session.id);
            }}
            hitSlop={6}
            accessibilityLabel="Xóa đoạn chat"
            {...({ className: 'tmr-row-delete' } as any)}
          >
            <Trash2 size={14} color="#EF4444" />
          </Pressable>
        )}
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

  // Trạng thái mở rộng danh sách phiên "See all (N)" theo từng notebook
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Record<string, boolean>>({});

  // Palette Antigravity Minimalist
  const dividerLineColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

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
  const handleStartRename = (nb: Notebook, e?: any) => {
    if (e) e.stopPropagation();
    setRenamingNotebookId(nb.id);
    setRenameValue(nb.name);
  };

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
              {/* HÀNG TIÊU ĐỀ SỔ (Folder Row: Flat Minimalist, 0 hover re-render) */}
              {isRenaming ? (
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
                    onKeyPress={(e) => {
                      if (Platform.OS === 'web') {
                        const key = (e.nativeEvent as any).key;
                        if (key === 'Enter') {
                          e.preventDefault();
                          handleConfirmRename(nb.id);
                        } else if (key === 'Escape') {
                          e.preventDefault();
                          handleCancelRename();
                        }
                      }
                    }}
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
              ) : (
                <View
                  style={[
                    styles.folderRow,
                    { backgroundColor: 'transparent' },
                  ]}
                  {...(Platform.OS === 'web' && ({ className: 'tmr-folder-row' } as any))}
                >
                  {/* Bấm vào tiêu đề sổ để chuyển sổ */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.folderMainClick,
                      pressed && { opacity: 0.8 },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
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
                      {...(Platform.OS === 'web' && ({ className: 'tmr-folder-title' } as any))}
                    >
                      {nb.name}
                    </Text>
                  </Pressable>

                  {/* Nút hành động góc phải của Folder: Ẩn khi nghỉ (CSS :hover reveal trên Web) */}
                  <View
                    pointerEvents={Platform.OS === 'web' ? 'none' : 'auto'}
                    style={[
                      styles.folderActionsRight,
                      Platform.OS === 'web' && ({ opacity: 0 } as any),
                    ]}
                    {...(Platform.OS === 'web' && ({ className: 'tmr-folder-actions' } as any))}
                  >
                    {/* Nút + tạo chat trực tiếp trong sổ này */}
                    <Pressable
                      style={({ pressed }) => [
                        styles.folderActionIconBtn,
                        pressed && { opacity: 0.7 },
                        Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
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

                    {/* Nút Sửa tên */}
                    <Pressable
                      style={({ pressed }) => [
                        styles.folderActionIconBtn,
                        pressed && { opacity: 0.7 },
                        Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                      ]}
                      onPress={(e) => handleStartRename(nb, e)}
                      hitSlop={6}
                      accessibilityLabel="Đổi tên sổ"
                    >
                      <Pencil size={13} color={isDark ? '#E4E4E7' : '#27272A'} />
                    </Pressable>

                    {/* Nút Xóa sổ (chỉ hiển thị với sổ tùy chỉnh, không hiển thị default-notebook) */}
                    {nb.id !== DEFAULT_NOTEBOOK_ID && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.folderActionIconBtn,
                          pressed && { opacity: 0.7 },
                          Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
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
                  displayedSessions.map((sess) => (
                    <SidebarSessionRow
                      key={sess.id}
                      session={sess}
                      notebookId={nb.id}
                      isActive={sess.id === activeSessionId}
                      isOpenInWorkspace={openSessionIdsInWorkspace.includes(sess.id)}
                      isDark={isDark}
                      onSelectSession={onSelectSession}
                      onDeleteSession={onDeleteSession}
                      onCloseSidebarMobile={onCloseSidebarMobile}
                    />
                  ))
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
