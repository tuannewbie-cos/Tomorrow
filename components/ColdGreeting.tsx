import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { UserMemoryProfile } from '../types/chat';
import { ThemeColors, DARK_THEME } from '../constants/theme';
import { TomorrowGlyph, getTimeBasedGreeting } from './TomorrowGlyph';

interface ColdGreetingProps {
  greetingText?: string;
  userMemory?: UserMemoryProfile;
  hasHistory?: boolean;
  onSelectSuggestion?: (text: string) => void;
  theme?: ThemeColors;
  compact?: boolean;
}

export const ColdGreeting: React.FC<ColdGreetingProps> = ({
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
      <View style={styles.brandContainer}>
        {/* Biểu tượng lõi không khung TomorrowGlyph thích ứng Dark/Light */}
        <View style={styles.appIconContainer}>
          <TomorrowGlyph
            size={compact ? 28 : 34}
            color={theme.mode === 'dark' ? '#F3F4F6' : '#18181B'}
          />
        </View>

        {/* Lời chào theo khung giờ chuẩn Claude */}
        <Text
          style={[
            styles.greetingTitle,
            { color: theme.mode === 'dark' ? '#ECECEC' : '#1A1A1A' },
            compact && { fontSize: 22, lineHeight: 28 },
          ]}
        >
          {getTimeBasedGreeting()}
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
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 36,
    maxWidth: 620,
    fontFamily:
      Platform.OS === 'web'
        ? 'Georgia, "Times New Roman", "Plus Jakarta Sans", serif'
        : undefined,
  },
});
