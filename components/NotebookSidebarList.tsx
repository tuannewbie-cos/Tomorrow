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
  MessageSquare,
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

  // Trạng thái hover dòng sổ & hover dòng chat trên Web
  const [hoveredNotebookId, setHoveredNotebookId] = useState<string | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

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

  const folderIconColor = isDark ? '#9CA3AF' : '#6B7280';
  const folderActiveColor = isDark ? '#818CF8' : '#4F46E5';

  return (
    <View style={styles.container}>
      {/* 1. THANH NÚT TRÊN CÙNG SIDEBAR: + Cuộc trò chuyện mới & 📁 Sổ mới */}
      <View style={styles.topActionsRow}>
        {/* Nút Tạo cuộc trò chuyện mới (duy nhất 1 dấu +) */}
        <Pressable
          style={({ pressed }) => [
            styles.newChatBtn,
            {
              backgroundColor: isDark ? 'rgba(30, 34, 45, 0.85)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(96, 165, 250, 0.35)' : 'rgba(37, 99, 235, 0.25)',
            },
            pressed && { opacity: 0.8 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={() => {
            onCreateSessionInNotebook(activeNotebookId);
            onCloseSidebarMobile?.();
          }}
        >
          <Plus size={16} color={isDark ? '#60A5FA' : '#2563EB'} />
          <Text
            numberOfLines={1}
            style={[
              styles.newChatText,
              { color: isDark ? '#93C5FD' : '#2563EB' },
            ]}
          >
            Cuộc trò chuyện mới
          </Text>
        </Pressable>

        {/* Nút 📁 Sổ mới */}
        <Pressable
          style={({ pressed }) => [
            styles.newNotebookBtn,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: theme.borderSubtle,
            },
            pressed && { opacity: 0.8 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={() => {
            setIsCreatingNotebook(true);
            setTimeout(() => newNotebookInputRef.current?.focus(), 50);
          }}
          hitSlop={6}
        >
          <Folder size={14} color={folderIconColor} />
          <Text style={[styles.newNotebookText, { color: theme.textSecondary }]}>
            Sổ mới
          </Text>
        </Pressable>
      </View>

      {/* Ô nhập tạo sổ mới inline */}
      {isCreatingNotebook && (
        <View
          style={[
            styles.inlineCreateBox,
            {
              backgroundColor: isDark ? '#1A1E29' : '#F1F5F9',
              borderColor: isDark ? '#818CF8' : '#6366F1',
            },
          ]}
        >
          <Folder size={14} color={folderActiveColor} style={{ marginRight: 6 }} />
          <TextInput
            ref={newNotebookInputRef}
            style={[
              styles.inlineInput,
              { color: theme.textPrimary },
            ]}
            placeholder="Tên sổ ghi chú mới..."
            placeholderTextColor={theme.textMuted}
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

      {/* 2. DANH SÁCH SỔ GHI CHÚ PHÂN NHÓM CHUẨN ANTIGRAVITY */}
      <View style={styles.notebooksContainer}>
        {notebooks.map((nb) => {
          const isNotebookActive = nb.id === activeNotebookId;
          const isNbHovered = hoveredNotebookId === nb.id;
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
              {/* HÀNG TIÊU ĐỀ SỔ (Folder Row) */}
              {isRenaming ? (
                <View
                  style={[
                    styles.inlineRenameBox,
                    {
                      backgroundColor: isDark ? '#1A1E29' : '#F1F5F9',
                      borderColor: isDark ? '#818CF8' : '#6366F1',
                    },
                  ]}
                >
                  <Folder size={14} color={folderActiveColor} style={{ marginRight: 6 }} />
                  <TextInput
                    autoFocus
                    style={[styles.inlineInput, { color: theme.textPrimary }]}
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
                    isNotebookActive && {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(79, 70, 229, 0.05)',
                    },
                    isNbHovered && !isNotebookActive && {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                    },
                  ]}
                  onPointerEnter={() => setHoveredNotebookId(nb.id)}
                  onPointerLeave={() => setHoveredNotebookId(null)}
                >
                  {/* Bấm vào tiêu đề sổ để chuyển sổ */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.folderMainClick,
                      pressed && { opacity: 0.75 },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={() => onSelectNotebook(nb.id)}
                  >
                    <Folder
                      size={15}
                      color={isNotebookActive ? folderActiveColor : folderIconColor}
                      style={{ marginRight: 7 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.folderTitle,
                        {
                          color: isNotebookActive
                            ? (isDark ? '#E0E7FF' : '#312E81')
                            : theme.textPrimary,
                          fontWeight: isNotebookActive ? '600' : '500',
                        },
                      ]}
                    >
                      {nb.name}
                    </Text>
                  </Pressable>

                  {/* Nút hành động góc phải của Folder (hover hoặc active) */}
                  <View style={styles.folderActionsRight}>
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
                    >
                      <Plus size={13} color={theme.textMuted} />
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
                    >
                      <Pencil size={12} color={theme.textMuted} />
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
                      >
                        <Trash2 size={12} color="#EF4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {/* DANH SÁCH ĐOẠN CHAT THỤT LỀ (paddingLeft: 20) */}
              <View style={styles.sessionListIndented}>
                {nbSessions.length === 0 ? (
                  <Text style={[styles.emptyNbText, { color: theme.textMuted }]}>
                    Chưa có đoạn chat nào trong sổ này
                  </Text>
                ) : (
                  displayedSessions.map((sess) => {
                    const isActive = sess.id === activeSessionId;
                    const isOpenInWorkspace = openSessionIdsInWorkspace.includes(sess.id);
                    const isHovered = hoveredSessionId === sess.id;
                    const relativeTime = formatRelativeTime(sess.updatedAt);

                    return (
                      <View
                        key={sess.id}
                        style={[
                          styles.sessionRowContainer,
                          {
                            backgroundColor: isActive
                              ? (isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.07)')
                              : isHovered
                              ? (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)')
                              : 'transparent',
                          },
                        ]}
                        onPointerEnter={() => setHoveredSessionId(sess.id)}
                        onPointerLeave={() => setHoveredSessionId(null)}
                      >
                        {/* Khu vực bấm chọn phiên */}
                        <Pressable
                          style={({ pressed }) => [
                            styles.sessionMainArea,
                            pressed && { opacity: 0.75 },
                            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                          ]}
                          onPress={() => {
                            onSelectSession(sess.id, nb.id);
                            onCloseSidebarMobile?.();
                          }}
                        >
                          {/* Chấm tròn xanh 6px nếu đang mở ở một pane khác trong workspace */}
                          {isOpenInWorkspace && !isActive && (
                            <View style={styles.workspaceDotIndicator} />
                          )}

                          <MessageSquare
                            size={13}
                            color={
                              isActive
                                ? (isDark ? '#818CF8' : '#4F46E5')
                                : isOpenInWorkspace
                                ? '#10B981'
                                : theme.textMuted
                            }
                            style={{ marginRight: 6 }}
                          />

                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[
                              styles.sessionTitleText,
                              {
                                color: isActive
                                  ? (isDark ? '#F1F5F9' : '#0F172A')
                                  : theme.textSecondary,
                                fontWeight: isActive ? '600' : '400',
                              },
                            ]}
                          >
                            {formatSidebarSessionTitle(sess.title)}
                          </Text>
                        </Pressable>

                        {/* Mốc thời gian tương đối kiểu Antigravity (hover chuyển sang thùng rác xóa) */}
                        <View style={styles.sessionRightBox}>
                          {isHovered && Platform.OS === 'web' ? (
                            <Pressable
                              style={({ pressed }) => [
                                styles.sessionDeleteIconBtn,
                                pressed && { opacity: 0.7 },
                                Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                              ]}
                              onPress={(e) => {
                                e.stopPropagation();
                                onDeleteSession(sess.id);
                              }}
                              hitSlop={6}
                            >
                              <Trash2 size={12} color="#EF4444" />
                            </Pressable>
                          ) : (
                            <Text style={[styles.relativeTimeText, { color: theme.textMuted }]}>
                              {relativeTime}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}

                {/* Nút See all (N) / Thu gọn */}
                {hasMore && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.seeAllBtn,
                      pressed && { opacity: 0.7 },
                      Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={() => toggleSeeAll(nb.id)}
                    hitSlop={4}
                  >
                    <Text style={[styles.seeAllText, { color: theme.textMuted }]}>
                      {isExpanded ? 'Thu gọn' : `See all (${nbSessions.length})`}
                    </Text>
                    {isExpanded ? (
                      <ChevronDown size={12} color={theme.textMuted} style={{ marginLeft: 3 }} />
                    ) : (
                      <ChevronRight size={12} color={theme.textMuted} style={{ marginLeft: 3 }} />
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
    marginBottom: 12,
  },
  newChatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  newChatText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  newNotebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  newNotebookText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  inlineCreateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  inlineRenameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginVertical: 2,
  },
  inlineInput: {
    flex: 1,
    fontSize: 12.5,
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
    marginBottom: 12,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  folderMainClick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  folderTitle: {
    fontSize: 13.5,
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
    padding: 4,
    borderRadius: 4,
  },
  sessionListIndented: {
    paddingLeft: 20,
    marginTop: 2,
  },
  emptyNbText: {
    fontSize: 11.5,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  sessionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 1,
  },
  sessionMainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 6,
  },
  workspaceDotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  sessionTitleText: {
    fontSize: 13,
    flex: 1,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
  sessionRightBox: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 28,
  },
  relativeTimeText: {
    fontSize: 11.5,
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
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
});
