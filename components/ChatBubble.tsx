import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, useWindowDimensions, Platform } from 'react-native';
import { ChatMessage } from '../types/chat';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface ChatBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
  isDesktop?: boolean;
  theme?: ThemeColors;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  onPressImage,
  isDesktop: propIsDesktop,
  theme = DARK_THEME,
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = propIsDesktop ?? width >= 768;
  const isAI = message.role === 'model' || message.sender === 'ai';

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const bubbleBg = isAI ? theme.bubbleAI : theme.bubbleUser;
  const textColor = isAI ? theme.textAI : theme.textUser;
  const borderColor = isAI ? theme.borderAI : 'transparent';
  const timestampColor = isAI ? theme.textMuted : 'rgba(255, 255, 255, 0.8)';

  return (
    <View style={[styles.container, isAI ? styles.containerAI : styles.containerUser]}>
      {/* Khung bong bóng chat phong cách Messenger & Fluid MacBook */}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleBg,
            borderColor: borderColor,
            borderWidth: isAI ? 1 : 0,
            maxWidth: isDesktop ? '76%' : '85%',
          },
          isAI ? styles.bubbleAI : styles.bubbleUser,
        ]}
      >
        {/* Ảnh đính kèm */}
        {message.imageUri && (
          <Pressable
            style={Platform.OS === 'web' ? { cursor: 'pointer' as any } : undefined}
            onPress={() => onPressImage && onPressImage(message.imageUri || '')}
          >
            <Image
              source={{ uri: message.imageUri }}
              style={styles.messageImage}
              resizeMode="cover"
            />
          </Pressable>
        )}

        {/* Nội dung bong bóng tin nhắn text với font chữ thanh thoát */}
        {message.text ? (
          <Text style={[styles.messageText, { color: textColor }]}>
            {message.text}
          </Text>
        ) : null}

        {/* Dấu thời gian tinh tế */}
        <Text style={[styles.timestamp, { color: timestampColor }]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 4,
    width: '100%',
  },
  containerAI: {
    alignItems: 'flex-start',
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleAI: {
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 15.5,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  messageImage: {
    width: 260,
    height: 195,
    borderRadius: 14,
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 10.5,
    marginTop: 4,
    alignSelf: 'flex-end',
    fontWeight: '500',
  },
});
