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

  // Trạng thái hover thanh nút trên cùng
  const [hoveredTopAction, setHoveredTopAction] = useState<'chat' | 'notebook' | null>(null);

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

  // Palette Ember Obsidian (Dark) & Architectural Alabaster (Light)
  const dividerLineColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const sectionLabelColor = isDark ? '#636366' : '#8E8E93';

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
              backgroundColor: isDark
                ? (hoveredTopAction === 'chat' ? '#25252B' : '#1C1C20')
                : (hoveredTopAction === 'chat' ? '#F1F1F4' : '#FFFFFF'),
              borderColor: isDark
                ? (hoveredTopAction === 'chat' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.10)')
                : (hoveredTopAction === 'chat' ? 'rgba(0, 0, 0, 0.14)' : 'rgba(0, 0, 0, 0.10)'),
            },
            pressed && { opacity: 0.8 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={() => {
            onCreateSessionInNotebook(activeNotebookId);
            onCloseSidebarMobile?.();
          }}
          onHoverIn={() => setHoveredTopAction('chat')}
          onHoverOut={() => setHoveredTopAction(null)}
          {...(Platform.OS === 'web' && ({ className: 'tmr-sb-btn' } as any))}
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
              backgroundColor: isDark
                ? (hoveredTopAction === 'notebook' ? '#222226' : 'transparent')
                : (hoveredTopAction === 'notebook' ? 'rgba(0, 0, 0, 0.055)' : 'rgba(0, 0, 0, 0.025)'),
              borderColor: isDark
                ? (hoveredTopAction === 'notebook' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.07)')
                : (hoveredTopAction === 'notebook' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
            },
            pressed && { opacity: 0.8 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={() => {
            setIsCreatingNotebook(true);
            setTimeout(() => newNotebookInputRef.current?.focus(), 50);
          }}
          onHoverIn={() => setHoveredTopAction('notebook')}
          onHoverOut={() => setHoveredTopAction(null)}
          hitSlop={6}
          {...(Platform.OS === 'web' && ({ className: 'tmr-sb-btn' } as any))}
        >
          <Folder
            size={13}
            color={isDark ? (hoveredTopAction === 'notebook' ? '#F4F4F5' : '#A1A1AA') : (hoveredTopAction === 'notebook' ? '#111113' : '#71717A')}
          />
          <Text
            style={[
              styles.newNotebookText,
              {
                color: isDark
                  ? (hoveredTopAction === 'notebook' ? '#F4F4F5' : '#A1A1AA')
                  : (hoveredTopAction === 'notebook' ? '#111113' : '#52525B'),
              },
            ]}
          >
            Sổ mới
          </Text>
        </Pressable>
      </View>

      {/* Hairline Divider ngăn cách với danh sách */}
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

      {/* Micro Label: SỔ GHI CHÚ */}
      <View style={styles.sectionLabelRow}>
        <Text style={[styles.sectionLabelText, { color: sectionLabelColor }]}>
          SỔ GHI CHÚ
        </Text>
      </View>

      {/* 2. DANH SÁCH SỔ GHI CHÚ PHÂN NHÓM CHUẨN EMBER OBSIDIAN */}
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
              {/* HÀNG TIÊU ĐỀ SỔ (Folder Row: 34px, Minimal Monochrome) */}
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
                    {
                      backgroundColor: isNotebookActive
                        ? (isDark ? '#222226' : '#FFFFFF')
                        : isNbHovered
                        ? (isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.04)')
                        : 'transparent',
                      borderColor: isNotebookActive
                        ? (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)')
                        : 'transparent',
                    },
                    !isDark && isNotebookActive && styles.folderRowLightActive,
                  ]}
                  onPointerEnter={() => setHoveredNotebookId(nb.id)}
                  onPointerLeave={() => setHoveredNotebookId(null)}
                  {...(Platform.OS === 'web' && ({ className: 'tmr-sb-row' } as any))}
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
                      size={14}
                      color={
                        isNotebookActive
                          ? (isDark ? '#FFFFFF' : '#111113')
                          : isNbHovered
                          ? (isDark ? '#D4D4D8' : '#3F3F46')
                          : (isDark ? '#71717A' : '#71717A')
                      }
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.folderTitle,
                        {
                          color: isNotebookActive
                            ? (isDark ? '#F4F4F5' : '#111113')
                            : isNbHovered
                            ? (isDark ? '#E4E4E7' : '#18181B')
                            : (isDark ? '#A1A1AA' : '#52525B'),
                          fontWeight: isNotebookActive ? '600' : '500',
                        },
                      ]}
                      {...(Platform.OS === 'web' && ({ className: 'tmr-sb-row-title' } as any))}
                    >
                      {nb.name}
                    </Text>
                  </Pressable>

                  {/* Nút hành động góc phải của Folder (hover hoặc active) */}
                  <View
                    style={[
                      styles.folderActionsRight,
                      { opacity: (isNbHovered || isNotebookActive) ? 1 : 0.4 },
                    ]}
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
                      <Plus size={13} color={isDark ? '#A1A1AA' : '#71717A'} />
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
                      <Pencil size={12} color={isDark ? '#A1A1AA' : '#71717A'} />
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
                        <Trash2 size={12} color={isDark ? '#A1A1AA' : '#71717A'} />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {/* DANH SÁCH ĐOẠN CHAT CÓ ĐƯỜNG GUIDE LINE DỌC (borderLeftWidth: 1) */}
              <View
                style={[
                  styles.sessionListIndented,
                  { borderLeftColor: dividerLineColor },
                ]}
              >
                {nbSessions.length === 0 ? (
                  <Text style={[styles.emptyNbText, { color: isDark ? '#52525B' : '#9CA3AF' }]}>
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
                              ? (isDark ? '#222226' : '#FFFFFF')
                              : isHovered
                              ? (isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.04)')
                              : 'transparent',
                            borderColor: isActive
                              ? (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)')
                              : 'transparent',
                          },
                          !isDark && isActive && styles.sessionRowLightActive,
                        ]}
                        onPointerEnter={() => setHoveredSessionId(sess.id)}
                        onPointerLeave={() => setHoveredSessionId(null)}
                        {...(Platform.OS === 'web' && ({ className: 'tmr-sb-row' } as any))}
                      >
                        {/* Khu vực bấm chọn phiên */}
                        <Pressable
                          style={({ pressed }) => [
                            styles.sessionMainArea,
                            pressed && { opacity: 0.8 },
                            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                          ]}
                          onPress={() => {
                            onSelectSession(sess.id, nb.id);
                            onCloseSidebarMobile?.();
                          }}
                        >
                          {/* Chấm tròn đơn sắc 5px trung tính cho pane phụ */}
                          {isOpenInWorkspace && !isActive && (
                            <View
                              style={[
                                styles.workspaceDotIndicator,
                                { backgroundColor: isDark ? '#E4E4E7' : '#18181B' },
                              ]}
                            />
                          )}

                          <MessageSquare
                            size={13}
                            color={
                              isActive
                                ? (isDark ? '#FFFFFF' : '#111113')
                                : isHovered
                                ? (isDark ? '#D4D4D8' : '#3F3F46')
                                : (isDark ? '#71717A' : '#71717A')
                            }
                            style={{ marginRight: 7 }}
                          />

                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[
                              styles.sessionTitleText,
                              {
                                color: isActive
                                  ? (isDark ? '#F4F4F5' : '#111113')
                                  : isHovered
                                  ? (isDark ? '#E4E4E7' : '#18181B')
                                  : (isDark ? '#A1A1AA' : '#52525B'),
                                fontWeight: isActive ? '600' : '400',
                              },
                            ]}
                            {...(Platform.OS === 'web' && ({ className: 'tmr-sb-row-title' } as any))}
                          >
                            {formatSidebarSessionTitle(sess.title)}
                          </Text>
                        </Pressable>

                        {/* Mốc thời gian tương đối tabular-nums, hover hoán đổi sang thùng rác */}
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
                              accessibilityLabel="Xóa đoạn chat"
                              {...(Platform.OS === 'web' && ({ className: 'tmr-sb-trash' } as any))}
                            >
                              <Trash2 size={12} color="#EF4444" />
                            </Pressable>
                          ) : (
                            <Text
                              style={[
                                styles.relativeTimeText,
                                { color: isDark ? '#52525B' : '#9CA3AF' },
                              ]}
                              {...(Platform.OS === 'web' && ({ className: 'tmr-sb-time' } as any))}
                            >
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
                    <Text style={[styles.seeAllText, { color: isDark ? '#71717A' : '#71717A' }]}>
                      {isExpanded ? 'Thu gọn' : `See all (${nbSessions.length})`}
                    </Text>
                    {isExpanded ? (
                      <ChevronDown size={12} color={isDark ? '#71717A' : '#71717A'} style={{ marginLeft: 3 }} />
                    ) : (
                      <ChevronRight size={12} color={isDark ? '#71717A' : '#71717A'} style={{ marginLeft: 3 }} />
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
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  newChatText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
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
    gap: 5,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  newNotebookText: {
    fontSize: 13,
    fontWeight: '500',
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
  sectionLabelRow: {
    paddingLeft: 4,
    marginBottom: 6,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
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
    borderRadius: 7,
    borderWidth: 1,
    marginBottom: 10,
  },
  inlineRenameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    marginVertical: 1,
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
    marginBottom: 8,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 1,
  },
  folderRowLightActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  folderMainClick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  folderTitle: {
    fontSize: 13,
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
  sessionListIndented: {
    marginLeft: 14,
    paddingLeft: 10,
    borderLeftWidth: 1,
    marginTop: 2,
  },
  emptyNbText: {
    fontSize: 11.5,
    fontStyle: 'italic',
    paddingVertical: 4,
    paddingLeft: 2,
  },
  sessionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    marginVertical: 1,
  },
  sessionRowLightActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sessionMainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 6,
  },
  workspaceDotIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 6,
  },
  sessionTitleText: {
    fontSize: 12.5,
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
    fontSize: 11,
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
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  seeAllText: {
    fontSize: 11.5,
    fontWeight: '500',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        : undefined,
  },
});
