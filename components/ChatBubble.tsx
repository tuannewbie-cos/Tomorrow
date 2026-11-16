import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, useWindowDimensions, Platform, Linking } from 'react-native';
import { ChatMessage } from '../types/chat';
import { ThemeColors, DARK_THEME } from '../constants/theme';
import { Globe, ExternalLink } from 'lucide-react-native';

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

  const getDomainName = (url: string, sourceName?: string): string => {
    if (sourceName && !['Google News', 'Web Search', 'Google Grounding'].includes(sourceName)) {
      return sourceName;
    }
    try {
      const cleanUrl = url.replace(/^https?:\/\//i, '');
      const domain = cleanUrl.split('/')[0].replace(/^www\./i, '');
      return domain || sourceName || 'Nguồn web';
    } catch {
      return sourceName || 'Nguồn web';
    }
  };

  const handleOpenUrl = (url?: string) => {
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch((err) => console.warn('Không thể mở liên kết:', err));
    }
  };

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
            shadowOpacity: theme.mode === 'light' ? 0.05 : 0.12,
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

      {/* Danh sách các thẻ Nguồn trích dẫn (Source Pills) khi có tra cứu Web */}
      {isAI && message.sources && message.sources.length > 0 && (
        <View style={[styles.sourcesContainer, { maxWidth: isDesktop ? '76%' : '90%' }]}>
          <Text style={[styles.sourcesHeader, { color: theme.textMuted }]}>
            Nguồn trích dẫn ({message.sources.length})
          </Text>
          <View style={styles.sourcesList}>
            {message.sources.slice(0, 4).map((src, idx) => {
              const domain = getDomainName(src.url, src.source);
              return (
                <Pressable
                  key={`src-${idx}-${src.url}`}
                  onPress={() => handleOpenUrl(src.url)}
                  style={({ hovered }: any) => [
                    styles.sourcePill,
                    {
                      backgroundColor: theme.mode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.07)',
                      borderColor: theme.mode === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)',
                    },
                    hovered && {
                      backgroundColor: theme.mode === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.14)',
                    },
                    Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                  ]}
                >
                  <Globe
                    size={12}
                    color={theme.mode === 'light' ? '#2563eb' : '#60a5fa'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sourceTitle,
                      { color: theme.mode === 'light' ? '#1e293b' : '#f1f5f9', maxWidth: isDesktop ? 180 : 130 },
                    ]}
                  >
                    {src.title || domain}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.sourceDomain, { color: theme.textMuted }]}
                  >
                    • {domain}
                  </Text>
                  <ExternalLink
                    size={10}
                    color={theme.textMuted}
                    style={{ marginLeft: 4, opacity: 0.7 }}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
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
    lineHeight: 23,
    letterSpacing: -0.1,
    fontWeight: '400',
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
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
  sourcesContainer: {
    marginTop: 6,
    marginLeft: 4,
  },
  sourcesHeader: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  sourcesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  sourceTitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  sourceDomain: {
    fontSize: 11,
    marginLeft: 3,
  },
});
