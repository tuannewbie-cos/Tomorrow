import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  X,
  Trash2,
  Plus,
  BookOpen,
  DollarSign,
  Star,
  Activity,
} from 'lucide-react-native';
import { ThemeColors, ThemeMode } from '../constants/theme';
import {
  StructuredMemoryVault,
  StudySubject,
  FinanceGoal,
} from '../types/chat';
import {
  saveStructuredVault,
  loadStructuredVault,
  DEFAULT_STRUCTURED_VAULT,
} from '../services/memoryVaultService';

export interface MemoryVaultModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  themeMode: ThemeMode;
  vault?: StructuredMemoryVault;
  onUpdateVault?: (updatedVault: StructuredMemoryVault) => void;
}

type TabType = 'study' | 'finance' | 'core' | 'habits';

export const MemoryVaultModal: React.FC<MemoryVaultModalProps> = ({
  visible,
  onClose,
  theme,
  themeMode,
  vault: initialVault,
  onUpdateVault,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('study');
  const [vault, setVault] = useState<StructuredMemoryVault>(
    initialVault || DEFAULT_STRUCTURED_VAULT
  );

  // Form states cho Học tập
  const [subjectName, setSubjectName] = useState('');
  const [subjectLevel, setSubjectLevel] = useState<'strong' | 'weak' | 'learning'>('learning');
  const [subjectFocus, setSubjectFocus] = useState('');

  // Form states cho Tài chính
  const [financeGoal, setFinanceGoal] = useState('');
  const [financeAmount, setFinanceAmount] = useState('');
  const [financeHorizon, setFinanceHorizon] = useState<'short' | 'mid' | 'long'>('mid');
  const [financeNote, setFinanceNote] = useState('');

  // Form states cho Sở thích & Dự án
  const [newFavorite, setNewFavorite] = useState('');
  const [newProject, setNewProject] = useState('');

  // Form states cho Thói quen
  const [newHabit, setNewHabit] = useState('');

  // Nạp hoặc đồng bộ vault khi mở modal
  useEffect(() => {
    if (visible) {
      if (initialVault) {
        setVault(initialVault);
      } else {
        loadStructuredVault().then((loaded) => setVault(loaded));
      }
    }
  }, [visible, initialVault]);

  // Phím Esc đóng modal trên macOS / Web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const updateAndPersist = async (newVault: StructuredMemoryVault) => {
    setVault(newVault);
    await saveStructuredVault(newVault);
    onUpdateVault?.(newVault);
  };

  // 1. Thao tác Học tập (studySubjects)
  const handleAddSubject = async () => {
    if (!subjectName.trim()) return;
    const cleanName = subjectName.trim();
    const existingIdx = vault.studySubjects.findIndex(
      (s) => s.subject.toLowerCase() === cleanName.toLowerCase()
    );

    let updatedList: StudySubject[];
    if (existingIdx >= 0) {
      updatedList = [...vault.studySubjects];
      updatedList[existingIdx] = {
        ...updatedList[existingIdx],
        level: subjectLevel,
        focusTopic: subjectFocus.trim() || updatedList[existingIdx].focusTopic,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const newSub: StudySubject = {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        subject: cleanName,
        level: subjectLevel,
        focusTopic: subjectFocus.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      updatedList = [newSub, ...vault.studySubjects].slice(0, 6);
    }

    const newVault: StructuredMemoryVault = {
      ...vault,
      studySubjects: updatedList,
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
    setSubjectName('');
    setSubjectFocus('');
    setSubjectLevel('learning');
  };

  const handleDeleteSubject = async (id: string) => {
    const updatedList = vault.studySubjects.filter((s) => s.id !== id);
    const newVault: StructuredMemoryVault = {
      ...vault,
      studySubjects: updatedList,
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  // 2. Thao tác Tài chính (financeGoals)
  const handleAddFinance = async () => {
    if (!financeGoal.trim() && !financeAmount.trim()) return;
    const goalName = financeGoal.trim() || (financeAmount.trim() ? `Tiết kiệm ${financeAmount.trim()}` : 'Mục tiêu tài chính');
    const existingIdx = vault.financeGoals.findIndex(
      (f) => f.goal.toLowerCase() === goalName.toLowerCase()
    );

    let updatedList: FinanceGoal[];
    if (existingIdx >= 0) {
      updatedList = [...vault.financeGoals];
      updatedList[existingIdx] = {
        ...updatedList[existingIdx],
        targetAmount: financeAmount.trim() || updatedList[existingIdx].targetAmount,
        horizon: financeHorizon,
        note: financeNote.trim() || updatedList[existingIdx].note,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const newFin: FinanceGoal = {
        id: `fin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        goal: goalName,
        targetAmount: financeAmount.trim() || undefined,
        horizon: financeHorizon,
        note: financeNote.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      updatedList = [newFin, ...vault.financeGoals].slice(0, 5);
    }

    const newVault: StructuredMemoryVault = {
      ...vault,
      financeGoals: updatedList,
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
    setFinanceGoal('');
    setFinanceAmount('');
    setFinanceNote('');
    setFinanceHorizon('mid');
  };

  const handleDeleteFinance = async (id: string) => {
    const updatedList = vault.financeGoals.filter((f) => f.id !== id);
    const newVault: StructuredMemoryVault = {
      ...vault,
      financeGoals: updatedList,
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  // 3. Thao tác Sở thích & Dự án
  const handleAddFavorite = async () => {
    if (!newFavorite.trim()) return;
    const val = newFavorite.trim();
    if (vault.favorites.includes(val)) return;
    const newVault: StructuredMemoryVault = {
      ...vault,
      favorites: [val, ...vault.favorites].slice(0, 5),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
    setNewFavorite('');
  };

  const handleDeleteFavorite = async (index: number) => {
    const newVault: StructuredMemoryVault = {
      ...vault,
      favorites: vault.favorites.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  const handleAddProject = async () => {
    if (!newProject.trim()) return;
    const val = newProject.trim();
    if (vault.activeProjects.includes(val)) return;
    const newVault: StructuredMemoryVault = {
      ...vault,
      activeProjects: [val, ...vault.activeProjects].slice(0, 5),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
    setNewProject('');
  };

  const handleDeleteProject = async (index: number) => {
    const newVault: StructuredMemoryVault = {
      ...vault,
      activeProjects: vault.activeProjects.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  // 4. Thao tác Thói quen & Gần đây
  const handleAddHabit = async () => {
    if (!newHabit.trim()) return;
    const val = newHabit.trim();
    if (vault.habits.includes(val)) return;
    const newVault: StructuredMemoryVault = {
      ...vault,
      habits: [val, ...vault.habits].slice(0, 5),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
    setNewHabit('');
  };

  const handleDeleteHabit = async (index: number) => {
    const newVault: StructuredMemoryVault = {
      ...vault,
      habits: vault.habits.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  const handleDeleteRecent = async (index: number) => {
    const newVault: StructuredMemoryVault = {
      ...vault,
      recentContext: vault.recentContext.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  const handleDeleteMood = async (index: number) => {
    const newVault: StructuredMemoryVault = {
      ...vault,
      moodHistory: vault.moodHistory.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    };
    await updateAndPersist(newVault);
  };

  if (!visible) return null;

  const isDark = themeMode === 'dark';
  const modalBg = isDark ? '#18181B' : '#FFFFFF';
  const borderColor = isDark ? '#27272A' : '#E4E4E7';
  const subBg = isDark ? '#27272A' : '#F4F4F5';
  const textPrimary = theme.textPrimary;
  const textSecondary = theme.textSecondary;
  const primaryAccent = isDark ? '#3B82F6' : '#2563EB';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContainer,
            { backgroundColor: modalBg, borderColor },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={styles.headerTitleRow}>
              <Text style={[styles.headerTitle, { color: textPrimary }]}>
                🧠 Hồ sơ Tri thức Đa chiều
              </Text>
              <Text style={[styles.headerBadge, { backgroundColor: isDark ? '#312E81' : '#EEF2FF', color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
                Vault v4.7
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
              onPress={onClose}
              hitSlop={8}
            >
              <X size={18} color={textSecondary} />
            </Pressable>
          </View>

          {/* 4 Tabs with counters */}
          <View style={[styles.tabsRow, { borderBottomColor: borderColor }]}>
            <Pressable
              style={[
                styles.tabItem,
                activeTab === 'study' && styles.tabItemActive,
                activeTab === 'study' && { borderBottomColor: primaryAccent },
              ]}
              onPress={() => setActiveTab('study')}
            >
              <BookOpen size={14} color={activeTab === 'study' ? primaryAccent : textSecondary} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === 'study' ? primaryAccent : textSecondary },
                ]}
              >
                Học tập ({vault.studySubjects?.length || 0})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.tabItem,
                activeTab === 'finance' && styles.tabItemActive,
                activeTab === 'finance' && { borderBottomColor: primaryAccent },
              ]}
              onPress={() => setActiveTab('finance')}
            >
              <DollarSign size={14} color={activeTab === 'finance' ? primaryAccent : textSecondary} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === 'finance' ? primaryAccent : textSecondary },
                ]}
              >
                Tài chính ({vault.financeGoals?.length || 0})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.tabItem,
                activeTab === 'core' && styles.tabItemActive,
                activeTab === 'core' && { borderBottomColor: primaryAccent },
              ]}
              onPress={() => setActiveTab('core')}
            >
              <Star size={14} color={activeTab === 'core' ? primaryAccent : textSecondary} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === 'core' ? primaryAccent : textSecondary },
                ]}
              >
                Cốt lõi ({(vault.favorites?.length || 0) + (vault.activeProjects?.length || 0)})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.tabItem,
                activeTab === 'habits' && styles.tabItemActive,
                activeTab === 'habits' && { borderBottomColor: primaryAccent },
              ]}
              onPress={() => setActiveTab('habits')}
            >
              <Activity size={14} color={activeTab === 'habits' ? primaryAccent : textSecondary} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === 'habits' ? primaryAccent : textSecondary },
                ]}
              >
                Tâm lý & Quen ({(vault.habits?.length || 0) + (vault.recentContext?.length || 0) + (vault.moodHistory?.length || 0)})
              </Text>
            </Pressable>
          </View>

          {/* Content Body */}
          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* TAB 1: HỌC TẬP */}
            {activeTab === 'study' && (
              <View style={styles.tabContentContainer}>
                <Text style={[styles.sectionHeading, { color: textPrimary }]}>
                  Môn học & Học phần đại học (Tối đa 6)
                </Text>

                {/* Danh sách môn học */}
                {vault.studySubjects && vault.studySubjects.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.studySubjects.map((item) => {
                      const levelBg =
                        item.level === 'weak'
                          ? isDark ? '#7F1D1D' : '#FEE2E2'
                          : item.level === 'strong'
                          ? isDark ? '#14532D' : '#DCFCE7'
                          : isDark ? '#1E3A8A' : '#DBEAFE';
                      const levelText =
                        item.level === 'weak'
                          ? isDark ? '#FCA5A5' : '#B91C1C'
                          : item.level === 'strong'
                          ? isDark ? '#86EFAC' : '#15803D'
                          : isDark ? '#93C5FD' : '#1D4ED8';
                      const levelLabel =
                        item.level === 'weak' ? 'Yếu' : item.level === 'strong' ? 'Mạnh' : 'Đang học';

                      return (
                        <View
                          key={item.id}
                          style={[styles.itemCard, { backgroundColor: subBg, borderColor }]}
                        >
                          <View style={styles.itemMain}>
                            <View style={styles.itemHeaderRow}>
                              <Text style={[styles.itemTitle, { color: textPrimary }]}>
                                {item.subject}
                              </Text>
                              <View style={[styles.levelBadge, { backgroundColor: levelBg }]}>
                                <Text style={[styles.levelBadgeText, { color: levelText }]}>
                                  {levelLabel}
                                </Text>
                              </View>
                            </View>
                            {Boolean(item.focusTopic) && (
                              <Text style={[styles.itemSubtitle, { color: textSecondary }]}>
                                Trọng tâm: {item.focusTopic}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            style={styles.deleteButton}
                            onPress={() => handleDeleteSubject(item.id)}
                            hitSlop={6}
                          >
                            <Trash2 size={15} color="#EF4444" />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>
                    Chưa có môn học nào được lưu. Bạn có thể thêm thủ công bên dưới hoặc nhắn tin để AI tự nhận diện.
                  </Text>
                )}

                {/* Form thêm môn học */}
                <View style={[styles.addFormCard, { backgroundColor: subBg, borderColor }]}>
                  <Text style={[styles.formTitle, { color: textPrimary }]}>Thêm môn học mới</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Tên môn (VD: Giải tích 2, OOP, C++, Mạch điện...)"
                    placeholderTextColor={textSecondary}
                    value={subjectName}
                    onChangeText={setSubjectName}
                  />

                  {/* Chọn trình độ */}
                  <View style={styles.levelSelectorRow}>
                    <Text style={[styles.selectorLabel, { color: textSecondary }]}>Trình độ:</Text>
                    <Pressable
                      style={[
                        styles.levelOption,
                        subjectLevel === 'weak' && styles.levelOptionWeak,
                      ]}
                      onPress={() => setSubjectLevel('weak')}
                    >
                      <Text style={[styles.levelOptionText, subjectLevel === 'weak' && { color: '#EF4444' }]}>
                        Yếu
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.levelOption,
                        subjectLevel === 'learning' && styles.levelOptionLearning,
                      ]}
                      onPress={() => setSubjectLevel('learning')}
                    >
                      <Text style={[styles.levelOptionText, subjectLevel === 'learning' && { color: '#3B82F6' }]}>
                        Đang học
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.levelOption,
                        subjectLevel === 'strong' && styles.levelOptionStrong,
                      ]}
                      onPress={() => setSubjectLevel('strong')}
                    >
                      <Text style={[styles.levelOptionText, subjectLevel === 'strong' && { color: '#22C55E' }]}>
                        Mạnh
                      </Text>
                    </Pressable>
                  </View>

                  <TextInput
                    style={[styles.input, { backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Chủ đề trọng tâm (VD: Tích phân bội, Kế thừa, Con trỏ...)"
                    placeholderTextColor={textSecondary}
                    value={subjectFocus}
                    onChangeText={setSubjectFocus}
                  />

                  <Pressable
                    style={[styles.submitButton, { backgroundColor: primaryAccent }]}
                    onPress={handleAddSubject}
                  >
                    <Plus size={15} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Thêm / Cập nhật môn</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* TAB 2: TÀI CHÍNH */}
            {activeTab === 'finance' && (
              <View style={styles.tabContentContainer}>
                <Text style={[styles.sectionHeading, { color: textPrimary }]}>
                  Mục tiêu Tài chính & Quỹ dự phòng (Tối đa 5)
                </Text>

                {/* Danh sách mục tiêu tài chính */}
                {vault.financeGoals && vault.financeGoals.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.financeGoals.map((item) => {
                      const horizonBg =
                        item.horizon === 'short'
                          ? isDark ? '#78350F' : '#FEF3C7'
                          : item.horizon === 'long'
                          ? isDark ? '#581C87' : '#F3E8FF'
                          : isDark ? '#1E3A8A' : '#DBEAFE';
                      const horizonText =
                        item.horizon === 'short'
                          ? isDark ? '#FCD34D' : '#B45309'
                          : item.horizon === 'long'
                          ? isDark ? '#D8B4FE' : '#7E22CE'
                          : isDark ? '#93C5FD' : '#1D4ED8';
                      const horizonLabel =
                        item.horizon === 'short' ? 'Ngắn hạn' : item.horizon === 'long' ? 'Dài hạn' : 'Trung hạn';

                      return (
                        <View
                          key={item.id}
                          style={[styles.itemCard, { backgroundColor: subBg, borderColor }]}
                        >
                          <View style={styles.itemMain}>
                            <View style={styles.itemHeaderRow}>
                              <Text style={[styles.itemTitle, { color: textPrimary }]}>
                                {item.goal}
                              </Text>
                              <View style={[styles.levelBadge, { backgroundColor: horizonBg }]}>
                                <Text style={[styles.levelBadgeText, { color: horizonText }]}>
                                  {horizonLabel}
                                </Text>
                              </View>
                            </View>
                            {Boolean(item.targetAmount) && (
                              <Text style={[styles.itemSubtitle, { color: '#10B981', fontWeight: '600' }]}>
                                Số tiền: {item.targetAmount}
                              </Text>
                            )}
                            {Boolean(item.note) && (
                              <Text style={[styles.itemSubtitle, { color: textSecondary }]}>
                                Ghi chú: {item.note}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            style={styles.deleteButton}
                            onPress={() => handleDeleteFinance(item.id)}
                            hitSlop={6}
                          >
                            <Trash2 size={15} color="#EF4444" />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>
                    Chưa có mục tiêu tài chính nào. Hãy thêm mục tiêu tiết kiệm, quỹ khẩn cấp hoặc đầu tư.
                  </Text>
                )}

                {/* Form thêm mục tiêu tài chính */}
                <View style={[styles.addFormCard, { backgroundColor: subBg, borderColor }]}>
                  <Text style={[styles.formTitle, { color: textPrimary }]}>Thêm mục tiêu tài chính</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Mục tiêu (VD: Quỹ dự phòng, Mua laptop, Tích lũy ETF...)"
                    placeholderTextColor={textSecondary}
                    value={financeGoal}
                    onChangeText={setFinanceGoal}
                  />

                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: modalBg, color: textPrimary, borderColor }]}
                      placeholder="Số tiền (VD: 15tr, 500k, 1000$)"
                      placeholderTextColor={textSecondary}
                      value={financeAmount}
                      onChangeText={setFinanceAmount}
                    />
                  </View>

                  <View style={styles.levelSelectorRow}>
                    <Text style={[styles.selectorLabel, { color: textSecondary }]}>Kỳ hạn:</Text>
                    <Pressable
                      style={[styles.levelOption, financeHorizon === 'short' && styles.levelOptionWeak]}
                      onPress={() => setFinanceHorizon('short')}
                    >
                      <Text style={[styles.levelOptionText, financeHorizon === 'short' && { color: '#F59E0B' }]}>
                        Ngắn
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.levelOption, financeHorizon === 'mid' && styles.levelOptionLearning]}
                      onPress={() => setFinanceHorizon('mid')}
                    >
                      <Text style={[styles.levelOptionText, financeHorizon === 'mid' && { color: '#3B82F6' }]}>
                        Trung
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.levelOption, financeHorizon === 'long' && styles.levelOptionStrong]}
                      onPress={() => setFinanceHorizon('long')}
                    >
                      <Text style={[styles.levelOptionText, financeHorizon === 'long' && { color: '#8B5CF6' }]}>
                        Dài
                      </Text>
                    </Pressable>
                  </View>

                  <TextInput
                    style={[styles.input, { backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Ghi chú thêm (tùy chọn)"
                    placeholderTextColor={textSecondary}
                    value={financeNote}
                    onChangeText={setFinanceNote}
                  />

                  <Pressable
                    style={[styles.submitButton, { backgroundColor: primaryAccent }]}
                    onPress={handleAddFinance}
                  >
                    <Plus size={15} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Thêm mục tiêu tài chính</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* TAB 3: CỐT LÕI & DỰ ÁN */}
            {activeTab === 'core' && (
              <View style={styles.tabContentContainer}>
                {/* 1. Sở thích */}
                <Text style={[styles.sectionHeading, { color: textPrimary }]}>
                  Sở thích & Thần tượng cốt lõi ({vault.favorites?.length || 0}/5)
                </Text>
                {vault.favorites && vault.favorites.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.favorites.map((fav, idx) => (
                      <View
                        key={`fav-${idx}`}
                        style={[styles.simpleRowCard, { backgroundColor: subBg, borderColor }]}
                      >
                        <Text style={[styles.simpleRowText, { color: textPrimary }]}>{fav}</Text>
                        <Pressable onPress={() => handleDeleteFavorite(idx)} hitSlop={6}>
                          <Trash2 size={15} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>Chưa có sở thích nào.</Text>
                )}
                <View style={styles.quickAddRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Thêm sở thích mới (VD: Fan Cristiano Ronaldo...)"
                    placeholderTextColor={textSecondary}
                    value={newFavorite}
                    onChangeText={setNewFavorite}
                  />
                  <Pressable
                    style={[styles.quickAddButton, { backgroundColor: primaryAccent }]}
                    onPress={handleAddFavorite}
                  >
                    <Plus size={16} color="#FFFFFF" />
                  </Pressable>
                </View>

                {/* 2. Dự án đang làm */}
                <Text style={[styles.sectionHeading, { color: textPrimary, marginTop: 24 }]}>
                  Dự án đang phát triển ({vault.activeProjects?.length || 0}/5)
                </Text>
                {vault.activeProjects && vault.activeProjects.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.activeProjects.map((proj, idx) => (
                      <View
                        key={`proj-${idx}`}
                        style={[styles.simpleRowCard, { backgroundColor: subBg, borderColor }]}
                      >
                        <Text style={[styles.simpleRowText, { color: textPrimary }]}>{proj}</Text>
                        <Pressable onPress={() => handleDeleteProject(idx)} hitSlop={6}>
                          <Trash2 size={15} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>Chưa có dự án nào.</Text>
                )}
                <View style={styles.quickAddRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Thêm dự án mới (VD: App Tomorrow React Native...)"
                    placeholderTextColor={textSecondary}
                    value={newProject}
                    onChangeText={setNewProject}
                  />
                  <Pressable
                    style={[styles.quickAddButton, { backgroundColor: primaryAccent }]}
                    onPress={handleAddProject}
                  >
                    <Plus size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            )}

            {/* TAB 4: THÓI QUEN & GẦN ĐÂY */}
            {activeTab === 'habits' && (
              <View style={styles.tabContentContainer}>
                {/* 1. Thói quen */}
                <Text style={[styles.sectionHeading, { color: textPrimary }]}>
                  Thói quen sinh hoạt ({vault.habits?.length || 0}/5)
                </Text>
                {vault.habits && vault.habits.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.habits.map((habit, idx) => (
                      <View
                        key={`habit-${idx}`}
                        style={[styles.simpleRowCard, { backgroundColor: subBg, borderColor }]}
                      >
                        <Text style={[styles.simpleRowText, { color: textPrimary }]}>{habit}</Text>
                        <Pressable onPress={() => handleDeleteHabit(idx)} hitSlop={6}>
                          <Trash2 size={15} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>Chưa có thói quen nào.</Text>
                )}
                <View style={styles.quickAddRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: modalBg, color: textPrimary, borderColor }]}
                    placeholder="Thêm thói quen (VD: Làm việc tập trung...)"
                    placeholderTextColor={textSecondary}
                    value={newHabit}
                    onChangeText={setNewHabit}
                  />
                  <Pressable
                    style={[styles.quickAddButton, { backgroundColor: primaryAccent }]}
                    onPress={handleAddHabit}
                  >
                    <Plus size={16} color="#FFFFFF" />
                  </Pressable>
                </View>

                {/* 2. Ngữ cảnh gần đây */}
                <Text style={[styles.sectionHeading, { color: textPrimary, marginTop: 24 }]}>
                  Ngữ cảnh gần đây (Ghi nhận tự động)
                </Text>
                {vault.recentContext && vault.recentContext.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.recentContext.map((ctx, idx) => (
                      <View
                        key={`ctx-${idx}`}
                        style={[styles.simpleRowCard, { backgroundColor: subBg, borderColor }]}
                      >
                        <Text style={[styles.simpleRowText, { color: textPrimary }]}>{ctx}</Text>
                        <Pressable onPress={() => handleDeleteRecent(idx)} hitSlop={6}>
                          <Trash2 size={15} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>Chưa có ngữ cảnh gần đây.</Text>
                )}

                {/* 3. Lịch sử tâm lý */}
                <Text style={[styles.sectionHeading, { color: textPrimary, marginTop: 24 }]}>
                  Lịch sử tâm lý nhận diện ({vault.moodHistory?.length || 0}/5)
                </Text>
                {vault.moodHistory && vault.moodHistory.length > 0 ? (
                  <View style={styles.listContainer}>
                    {vault.moodHistory.map((mood, idx) => (
                      <View
                        key={`mood-${idx}`}
                        style={[styles.simpleRowCard, { backgroundColor: subBg, borderColor }]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[{ fontWeight: '700', fontSize: 13, color: textPrimary }]}>
                              {mood.date}
                            </Text>
                            <Text style={[{ fontSize: 13, color: primaryAccent }]}>
                              {mood.mood}
                            </Text>
                          </View>
                          {Boolean(mood.note) && (
                            <Text style={[{ fontSize: 12, color: textSecondary, marginTop: 2 }]}>
                              {mood.note}
                            </Text>
                          )}
                        </View>
                        <Pressable onPress={() => handleDeleteMood(idx)} hitSlop={6}>
                          <Trash2 size={15} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyHint, { color: textSecondary }]}>
                    Chưa ghi nhận biến động tâm lý nào.
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Plus Jakarta Sans',
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
    borderRadius: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomWidth: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Plus Jakarta Sans',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
  },
  tabContentContainer: {
    gap: 12,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Plus Jakarta Sans',
    marginBottom: 4,
  },
  listContainer: {
    gap: 8,
    marginBottom: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemMain: {
    flex: 1,
    paddingRight: 10,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Plus Jakarta Sans',
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Plus Jakarta Sans',
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Plus Jakarta Sans',
  },
  deleteButton: {
    padding: 6,
    borderRadius: 6,
  },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
    marginVertical: 8,
  },
  addFormCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'Plus Jakarta Sans',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  levelSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  levelOption: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
  },
  levelOptionWeak: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  levelOptionLearning: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  levelOptionStrong: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  levelOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  simpleRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  simpleRowText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingRight: 8,
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  quickAddButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
