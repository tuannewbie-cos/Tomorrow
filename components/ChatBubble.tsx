import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { ChatMessage } from '../types/chat';
import { getMemeById } from '../constants/memes';
import { Sparkles, HeartHandshake } from 'lucide-react-native';

interface ChatBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
  onSelectSuggestion?: (text: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onPressImage, onSelectSuggestion }) => {
  const isAI = message.sender === 'ai';
  const meme = message.memeId ? getMemeById(message.memeId) : undefined;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, isAI ? styles.containerAI : styles.containerUser]}>
      {/* 1. Badge Cảm Xúc Nhận Diện theo thời gian thực (chỉ có ở AI) */}
      {isAI && message.emotion && (
        <View style={[styles.emotionBadge, { borderColor: message.emotion.color || '#8B5CF6' }]}>
          <Text style={styles.emotionEmoji}>{message.emotion.emoji}</Text>
          <Text style={styles.emotionLabel}>{message.emotion.label}</Text>
          <View style={styles.levelDotContainer}>
            <Text style={styles.levelText}>Mức độ: {message.emotion.level}/5</Text>
          </View>
          {message.emotion.adviceTag && (
            <View style={styles.adviceTag}>
              <Text style={styles.adviceTagText}>{message.emotion.adviceTag}</Text>
            </View>
          )}
        </View>
      )}

      {/* 2. Khung bong bóng chat chính */}
      <View style={[styles.bubble, isAI ? styles.bubbleAI : styles.bubbleUser]}>
        {/* Ảnh do người dùng đính kèm (nếu có) */}
        {message.imageUri && (
          <Pressable onPress={() => onPressImage && onPressImage(message.imageUri!)}>
            <Image
              source={{ uri: message.imageUri }}
              style={styles.messageImage}
              resizeMode="cover"
            />
          </Pressable>
        )}

        {/* Nội dung text */}
        <Text style={[styles.messageText, isAI ? styles.textAI : styles.textUser]}>
          {message.text}
        </Text>

        {/* Ảnh Meme / Sticker do AI tự động kèm theo */}
        {isAI && meme && (
          <View style={styles.memeContainer}>
            <View style={styles.memeHeader}>
              <Sparkles size={14} color="#A78BFA" />
              <Text style={styles.memeTitle}>{meme.title}</Text>
            </View>
            <Image
              source={{ uri: meme.url }}
              style={styles.memeImage}
              resizeMode="cover"
            />
            <Text style={styles.memeDesc}>{meme.description}</Text>
          </View>
        )}

        {/* Timestamp */}
        <Text style={[styles.timestamp, isAI ? styles.timestampAI : styles.timestampUser]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>

      {/* 3. Gợi ý câu trả lời nhanh (suggested_replies từ AI) */}
      {isAI && message.suggestedReplies && message.suggestedReplies.length > 0 && (
        <View style={styles.suggestedContainer}>
          {message.suggestedReplies.map((replyText, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [
                styles.suggestionPill,
                pressed && styles.suggestionPillPressed,
              ]}
              onPress={() => onSelectSuggestion && onSelectSuggestion(replyText)}
            >
              <Text style={styles.suggestionPillText}>💬 {replyText}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    paddingHorizontal: 12,
    width: '100%',
  },
  containerAI: {
    alignItems: 'flex-start',
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  emotionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 31, 32, 0.95)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    marginLeft: 4,
  },
  emotionEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  emotionLabel: {
    color: '#E3E3E3',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  levelDotContainer: {
    backgroundColor: '#2A2B2D',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  levelText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
  },
  adviceTag: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adviceTagText: {
    color: '#C4B5FD',
    fontSize: 10,
    fontWeight: '600',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bubbleAI: {
    backgroundColor: '#1E1F20',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2A2B2D',
  },
  bubbleUser: {
    backgroundColor: '#3B82F6',
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  textAI: {
    color: '#F3F4F6',
  },
  textUser: {
    color: '#FFFFFF',
  },
  messageImage: {
    width: 240,
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
  },
  memeContainer: {
    marginTop: 10,
    backgroundColor: '#131314',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2D2E30',
  },
  memeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  memeTitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  memeImage: {
    width: 220,
    height: 150,
    borderRadius: 10,
  },
  memeDesc: {
    color: '#9CA3AF',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timestampAI: {
    color: '#6B7280',
  },
  timestampUser: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  suggestedContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginLeft: 4,
    maxWidth: '90%',
  },
  suggestionPill: {
    backgroundColor: '#1E1F20',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestionPillPressed: {
    backgroundColor: '#2A2B2D',
    transform: [{ scale: 0.97 }],
  },
  suggestionPillText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '500',
  },
});
