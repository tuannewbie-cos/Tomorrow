import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
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
  ChevronRight,
} from 'lucide-react-native';

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
  onClearAll: () => void;
  userMemory: UserMemoryProfile;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  visible,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewSession,
  onClearAll,
  userMemory,
}) => {
  const handleConfirmClear = () => {
    Alert.alert(
      'Xóa toàn bộ dữ liệu?',
      'Hành động này sẽ xóa vĩnh viễn toàn bộ tin nhắn và hồ sơ tâm lý đã lưu trong máy. Bạn có chắc không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa sạch',
          style: 'destructive',
          onPress: () => {
            onClearAll();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Vùng bấm ra ngoài để đóng sidebar */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Khung nội dung Sidebar trái */}
        <View style={styles.drawerContainer}>
          {/* Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.brandRow}>
              <Sparkles size={20} color="#0084FF" />
              <Text style={styles.brandTitle}>Tomorrow</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Nút Tạo Phiên Mới */}
            <Pressable
              style={({ pressed }) => [styles.newChatBtn, pressed && styles.btnPressed]}
              onPress={() => {
                onCreateNewSession();
                onClose();
              }}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.newChatText}>Phiên tâm sự mới</Text>
            </Pressable>

            {/* Mục Thẻ Bộ Nhớ Dài Hạn (Minh chứng Kill App) */}
            <View style={styles.memorySection}>
              <View style={styles.sectionHeader}>
                <Brain size={16} color="#8B5CF6" />
                <Text style={styles.sectionTitle}>Bộ nhớ tâm lý dài hạn</Text>
              </View>

              <View style={styles.memoryBox}>
                <Text style={styles.memoryFieldTitle}>Đang xưng hô:</Text>
                <Text style={styles.memoryFieldValue}>
                  {userMemory.userName || userMemory.nickname} ({userMemory.nickname})
                </Text>

                <Text style={styles.memoryFieldTitle}>Vấn đề AI đang theo dõi:</Text>
                <Text style={styles.memoryFieldValue}>{userMemory.currentProblem}</Text>

                <Text style={styles.memoryFieldTitle}>Khí chất & Thói quen:</Text>
                <Text style={styles.memoryFieldValue}>{userMemory.moodTrend}</Text>

                <View style={styles.storageStatus}>
                  <ShieldCheck size={14} color="#10B981" />
                  <Text style={styles.storageStatusText}>
                    Đã sync vào AsyncStorage (chống sập khi kill app)
                  </Text>
                </View>
              </View>
            </View>

            {/* Danh sách các phiên trò chuyện */}
            <View style={styles.sessionSection}>
              <Text style={styles.sectionTitle}>Các phiên tâm sự gần đây</Text>
              {sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                return (
                  <Pressable
                    key={sess.id}
                    style={({ pressed }) => [
                      styles.sessionItem,
                      isActive && styles.sessionItemActive,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={() => {
                      onSelectSession(sess.id);
                      onClose();
                    }}
                  >
                    <MessageSquare
                      size={16}
                      color={isActive ? '#3B82F6' : '#9CA3AF'}
                    />
                    <Text
                      style={[
                        styles.sessionItemTitle,
                        isActive && styles.sessionItemTitleActive,
                      ]}
                      numberOfLines={1}
                    >
                      {sess.title}
                    </Text>
                    <ChevronRight size={14} color="#6B7280" />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Footer nút xóa sạch dữ liệu */}
          <View style={styles.drawerFooter}>
            <Pressable
              style={({ pressed }) => [styles.clearBtn, pressed && styles.btnPressed]}
              onPress={handleConfirmClear}
            >
              <Trash2 size={16} color="#EF4444" />
              <Text style={styles.clearBtnText}>Xóa lịch sử & Reset bộ nhớ</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  backdrop: {
    flex: 1,
  },
  drawerContainer: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: '#131314',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: '#252628',
    paddingTop: 48,
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#202124',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    color: '#F3F4F6',
    fontSize: 17,
    fontWeight: '700',
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
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 20,
  },
  newChatText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  memorySection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memoryBox: {
    backgroundColor: '#1E1F20',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D2E30',
  },
  memoryFieldTitle: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  memoryFieldValue: {
    color: '#E5E7EB',
    fontSize: 12,
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
    borderTopColor: '#2B2C2E',
  },
  storageStatusText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '500',
    flex: 1,
  },
  sessionSection: {
    marginBottom: 20,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1B1C',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: '#242527',
  },
  sessionItemActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: '#3B82F6',
  },
  sessionItemTitle: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  sessionItemTitleActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  btnPressed: {
    opacity: 0.75,
  },
  drawerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#202124',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
