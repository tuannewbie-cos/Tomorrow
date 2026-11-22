import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, useWindowDimensions, Platform, Linking } from 'react-native';
import { ChatMessage } from '../types/chat';
import { ThemeColors, DARK_THEME } from '../constants/theme';
import { Globe, ExternalLink } from 'lucide-react-native';
import { RichMarkdownView, copyToClipboard, formatCodeForDisplay, normalizeMarkdownFences } from './RichMarkdownView';
export { formatCodeForDisplay, normalizeMarkdownFences };

interface ChatBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
  isDesktop?: boolean;
  theme?: ThemeColors;
  compact?: boolean;
  isSplitMode?: boolean;
}

const ChatBubbleBase: React.FC<ChatBubbleProps> = ({
  message,
  onPressImage,
  isDesktop: propIsDesktop,
  theme = DARK_THEME,
  compact = false,
  isSplitMode = false,
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = propIsDesktop ?? width >= 768;
  const isAI = message.role === 'model' || message.sender === 'ai';

  const [bubbleCopied, setBubbleCopied] = useState(false);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const bubbleBg = isAI ? theme.bubbleAI : theme.bubbleUser;
  const textColor = isAI ? theme.textAI : theme.textUser;
  const borderColor = isAI ? theme.borderAI : 'transparent';
  const timestampColor = isAI ? theme.textMuted : 'rgba(255, 255, 255, 0.8)';

  // 1. Kiểm tra nhanh & Tiền chuẩn hóa nội dung bằng normalizeMarkdownFences
  const safeText = typeof message.text === 'string' ? message.text : (message.text ? JSON.stringify(message.text, null, 2) : '');
  const rawMessageText = safeText === '[object Object]' ? '' : safeText;
  const messageText = normalizeMarkdownFences(rawMessageText);
  const normalizedText = messageText.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  const hasCodeBlock = /```/.test(normalizedText);
  const hasTable = /\|.*\|/.test(normalizedText);
  const hasRichBlock = hasCodeBlock || hasTable || /^#{1,3}\s|\$\$|\$/.test(normalizedText);

  // 2. Tính toán Dual-Width Bubble:
  // - Khi isSplitMode === true: mở rộng AI lên 95% (98% khi có khối code/bảng) và User 85%
  // - Khi bình thường: AI tối đa 760px (92% mobile) khi có rich block, hoặc 75%/85%
  let bubbleMaxWidth: any;
  if (isSplitMode) {
    if (isAI) {
      bubbleMaxWidth = hasRichBlock ? '98%' : '95%';
    } else {
      bubbleMaxWidth = '85%';
    }
  } else {
    bubbleMaxWidth = hasRichBlock
      ? (isDesktop ? 760 : '92%')
      : (isDesktop ? '75%' : '85%');
  }

  // Ép bong bóng chứa Code Block hoặc Bảng mở rộng đúng tỷ lệ thay vì tự co hẹp
  const isCodeOrTable = isAI && (hasCodeBlock || hasTable);
  const codeTableBubbleStyle = isCodeOrTable
    ? {
        width: compact ? ('96%' as any) : ('88%' as any),
        maxWidth: compact ? ('98%' as any) : 740,
        minWidth: compact ? 260 : 320,
        alignSelf: 'flex-start' as const,
      }
    : {
        maxWidth: bubbleMaxWidth,
      };

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

  // Nút Quick Copy toàn bộ phản hồi của bong bóng
  const handleCopyBubble = async () => {
    if (!messageText) return;
    const ok = await copyToClipboard(messageText);
    if (ok) {
      setBubbleCopied(true);
      setTimeout(() => setBubbleCopied(false), 2000);
    }
  };

  return (
    <View style={[styles.container, isAI ? styles.containerAI : styles.containerUser]}>
      {/* Khung bong bóng chat thích ứng kép (Dual-Width Bubble) phong cách Messenger & J.A.R.V.I.S HUD */}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleBg,
            borderColor: borderColor,
            borderWidth: isAI ? 1 : 0,
            paddingHorizontal: compact ? 12 : (hasRichBlock ? 18 : 16),
            paddingVertical: compact ? 9 : (hasRichBlock ? 12 : 10),
            shadowOpacity: theme.mode === 'light' ? 0.05 : 0.12,
          },
          codeTableBubbleStyle,
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

        {/* Nội dung tin nhắn Rich Markdown (Code Blocks, Data Tables, Math, Headings, Links, Lists) */}
        {messageText ? (
          <RichMarkdownView
            content={messageText}
            theme={theme}
            defaultTextColor={textColor}
            onOpenUrl={handleOpenUrl}
            compact={compact}
          />
        ) : null}

        {/* Footer của bong bóng: Nút Sao chép toàn bộ câu trả lời + Dấu thời gian */}
        <View style={styles.bubbleFooter}>
          {isAI && (messageText.length > 120 || hasRichBlock) && (
            <Pressable
              style={({ pressed }) => [
                styles.copyBubbleBtn,
                pressed && { opacity: 0.7 },
                Platform.OS === 'web' && ({ cursor: 'pointer', transition: 'all 0.15s ease' } as any),
              ]}
              onPress={handleCopyBubble}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.copyBubbleText,
                  { color: bubbleCopied ? '#10B981' : theme.textMuted },
                  bubbleCopied && { fontWeight: '700' },
                ]}
              >
                {bubbleCopied ? '✓ Đã chép' : '📋 Sao chép'}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.timestamp, { color: timestampColor }]}>
            {formatTime(message.timestamp)}
          </Text>
        </View>
      </View>

      {/* Danh sách các thẻ Nguồn trích dẫn (Source Pills) khi có tra cứu Web */}
      {isAI && message.sources && message.sources.length > 0 && (
        <View style={[styles.sourcesContainer, { maxWidth: isDesktop ? 760 : '90%' }]}>
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

export const ChatBubble = React.memo(ChatBubbleBase, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.text === nextProps.message.text &&
    prevProps.message.timestamp === nextProps.message.timestamp &&
    prevProps.message.role === nextProps.message.role &&
    prevProps.message.imageUri === nextProps.message.imageUri &&
    prevProps.message.imageBase64 === nextProps.message.imageBase64 &&
    prevProps.isDesktop === nextProps.isDesktop &&
    prevProps.compact === nextProps.compact &&
    prevProps.isSplitMode === nextProps.isSplitMode &&
    prevProps.theme?.mode === nextProps.theme?.mode
  );
});

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
  messageImage: {
    width: 260,
    height: 195,
    borderRadius: 14,
    marginBottom: 8,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 5,
    gap: 8,
  },
  copyBubbleBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  copyBubbleText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 10.5,
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
