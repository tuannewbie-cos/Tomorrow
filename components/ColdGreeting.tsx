import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { UserMemoryProfile } from '../types/chat';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface ColdGreetingProps {
  greetingText?: string;
  userMemory: UserMemoryProfile;
  hasHistory: boolean;
  onSelectSuggestion?: (text: string) => void;
  theme?: ThemeColors;
  compact?: boolean;
}

export const ColdGreeting: React.FC<ColdGreetingProps> = ({
  userMemory,
  theme = DARK_THEME,
  compact = false,
}) => {
  const displayName =
    userMemory?.nickname ||
    userMemory?.userName ||
    (userMemory?.vault as any)?.userName ||
    'bạn';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        compact && { paddingHorizontal: 12, paddingVertical: 16 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.brandContainer}>
        {/* Icon ứng dụng chính thức T.M.R khối vuông bo góc chuẩn macOS */}
        <View style={styles.appIconContainer}>
          <View style={styles.appIconBox}>
            {/* 5 cột sóng âm trắng chuẩn biểu tượng Tomorrow */}
            <View style={styles.waveformContainer}>
              <View style={[styles.waveBar, { height: 10 }]} />
              <View style={[styles.waveBar, { height: 16 }]} />
              <View style={[styles.waveBar, { height: 22 }]} />
              <View style={[styles.waveBar, { height: 15 }]} />
              <View style={[styles.waveBar, { height: 9 }]} />
            </View>
            <Text style={styles.appIconText}>T.M.R</Text>
          </View>
        </View>

        {/* 1 dòng lời chào duy nhất căn giữa tinh tế chuẩn DESIGN.md */}
        <Text
          style={[
            styles.greetingTitle,
            { color: theme.textPrimary },
            compact && { fontSize: 20, lineHeight: 28 },
          ]}
        >
          Chào {displayName}, chúng ta nên bắt đầu làm việc gì?
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
  appIconContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#0B0B0D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    paddingTop: 5,
    paddingBottom: 4,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    height: 24,
    marginBottom: 3,
  },
  waveBar: {
    width: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  appIconText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 32,
    maxWidth: 620,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
});
