import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UserMemoryProfile } from '../types/chat';
import { Sparkles } from 'lucide-react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface ColdGreetingProps {
  greetingText: string;
  userMemory: UserMemoryProfile;
  hasHistory: boolean;
  onSelectSuggestion?: (text: string) => void;
  theme?: ThemeColors;
  compact?: boolean;
}

export const ColdGreeting: React.FC<ColdGreetingProps> = ({
  greetingText,
  userMemory,
  hasHistory,
  theme = DARK_THEME,
  compact = false,
}) => {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        compact && { paddingHorizontal: 12, paddingVertical: 16 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Brand Header & Minimal Empty State (macOS native style) */}
      <View style={styles.brandContainer}>
        <View style={styles.geminiBadge}>
          <Sparkles size={16} color="#8B5CF6" />
          <Text style={styles.geminiBadgeText}>Tomorrow</Text>
        </View>

        {/* Gradient Greeting Container */}
        <View style={styles.gradientBox}>
          <LinearGradient
            colors={['#8B5CF6', '#6366F1', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientPill}
          />
          <Text
            style={[
              styles.greetingTitle,
              { color: theme.textPrimary },
              compact && { fontSize: 22, lineHeight: 28 },
            ]}
          >
            {hasHistory ? `Chào ${userMemory.nickname || userMemory.userName || 'bạn'},` : 'Chào bạn,'}
          </Text>
        </View>

        <Text
          style={[
            styles.greetingSubtext,
            { color: theme.textSecondary },
            compact && { fontSize: 13.5, lineHeight: 20, marginTop: 4, paddingHorizontal: 4 },
          ]}
        >
          {greetingText}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
    width: '100%',
    minWidth: 0,
    maxWidth: 720,
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  brandContainer: {
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
  },
  geminiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  geminiBadgeText: {
    color: '#A78BFA',
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
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  greetingSubtext: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
});
