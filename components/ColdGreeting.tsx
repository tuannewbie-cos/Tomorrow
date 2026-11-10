import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UserMemoryProfile } from '../types/chat';
import { Sparkles, Flame, Smile, Heart, Coffee } from 'lucide-react-native';

interface ColdGreetingProps {
  greetingText: string;
  userMemory: UserMemoryProfile;
  hasHistory: boolean;
  onSelectSuggestion: (text: string) => void;
}

export const ColdGreeting: React.FC<ColdGreetingProps> = ({
  greetingText,
  userMemory,
  hasHistory,
  onSelectSuggestion,
}) => {
  // Sinh các Suggestion Chips theo ngữ cảnh
  const getSuggestionChips = () => {
    const problem = userMemory.currentProblem?.toLowerCase() || '';

    if (problem.includes('deadline')) {
      return [
        { label: 'Cứu tui deadline dí sấp mặt rồi 😭', icon: Flame, color: '#EF4444' },
        { label: 'Làm sao để bớt overthinking bây giờ?', icon: Coffee, color: '#F59E0B' },
        { label: 'Gợi ý bài tập thở 3 phút xả stress', icon: Heart, color: '#8B5CF6' },
        { label: 'Kể một câu chuyện tấu hài nghe coi bro', icon: Smile, color: '#10B981' },
      ];
    }

    if (problem.includes('buồn') || problem.includes('cô đơn')) {
      return [
        { label: 'Tui đang thấy hơi cô đơn và trống rỗng...', icon: Heart, color: '#EC4899' },
        { label: 'Gửi cho tui một meme chữa lành đi!', icon: Sparkles, color: '#A855F7' },
        { label: 'Hôm nay tui lỡ làm hỏng việc rồi 😢', icon: Coffee, color: '#F59E0B' },
        { label: 'Cần một cái ôm tinh thần thật ấm áp', icon: Heart, color: '#3B82F6' },
      ];
    }

    // Default Gen Z chips
    return [
      { label: 'Hôm nay tui có tin vui muốn flex nè! 🎉', icon: Sparkles, color: '#10B981' },
      { label: 'Tâm sự đêm khuya giải tỏa căng thẳng', icon: Coffee, color: '#3B82F6' },
      { label: 'Đang bị mất động lực học tập / làm việc 🫠', icon: Flame, color: '#F59E0B' },
      { label: 'Tâm trạng tui hôm nay 10 điểm không có nhưng ✨', icon: Smile, color: '#8B5CF6' },
    ];
  };

  const chips = getSuggestionChips();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Brand Header Gemini Style */}
      <View style={styles.brandContainer}>
        <View style={styles.geminiBadge}>
          <Sparkles size={16} color="#A78BFA" />
          <Text style={styles.geminiBadgeText}>SoulMate GenZ AI</Text>
        </View>

        {/* Gradient Container giả lập Text Gradient phong cách Gemini */}
        <View style={styles.gradientBox}>
          <LinearGradient
            colors={['#4285F4', '#9B51E0', '#FF4081']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientPill}
          />
          <Text style={styles.greetingTitle}>
            {hasHistory ? `Chào ${userMemory.nickname || 'bro'},` : 'Chào đằng ấy,'}
          </Text>
        </View>

        <Text style={styles.greetingSubtext}>{greetingText}</Text>
      </View>

      {/* Box tóm tắt ngữ cảnh bộ nhớ (Minh chứng lưu trữ qua Kill-App) */}
      {hasHistory && userMemory.currentProblem ? (
        <View style={styles.memoryCard}>
          <View style={styles.memoryCardHeader}>
            <Heart size={14} color="#F43F5E" />
            <Text style={styles.memoryCardTitle}>Ngữ cảnh được AI ghi nhớ</Text>
          </View>
          <Text style={styles.memoryProblemText}>"{userMemory.currentProblem}"</Text>
          <Text style={styles.memoryHint}>
            💡 Đóng app mở lại dữ liệu vẫn nguyên vẹn 100%
          </Text>
        </View>
      ) : null}

      {/* Suggestion Chips */}
      <View style={styles.chipsSection}>
        <Text style={styles.chipsSectionTitle}>Gợi ý tâm sự nhanh:</Text>
        <View style={styles.chipsGrid}>
          {chips.map((chip, idx) => {
            const Icon = chip.icon;
            return (
              <Pressable
                key={idx}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                ]}
                onPress={() => onSelectSuggestion(chip.label)}
              >
                <View style={[styles.chipIconBox, { backgroundColor: `${chip.color}20` }]}>
                  <Icon size={16} color={chip.color} />
                </View>
                <Text style={styles.chipText}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  geminiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  geminiBadgeText: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gradientBox: {
    position: 'relative',
    marginBottom: 8,
  },
  gradientPill: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#E0E7FF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  greetingSubtext: {
    fontSize: 16,
    lineHeight: 24,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  memoryCard: {
    width: '100%',
    backgroundColor: '#1E1F20',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2F3033',
    marginBottom: 24,
  },
  memoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  memoryCardTitle: {
    color: '#F43F5E',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  memoryProblemText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  memoryHint: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 6,
  },
  chipsSection: {
    width: '100%',
  },
  chipsSectionTitle: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsGrid: {
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1F20',
    borderWidth: 1,
    borderColor: '#2A2B2E',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  chipPressed: {
    backgroundColor: '#2A2B2E',
    transform: [{ scale: 0.98 }],
  },
  chipIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
