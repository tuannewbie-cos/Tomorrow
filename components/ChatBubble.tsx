import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { ChatMessage } from '../types/chat';

interface ChatBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
  onSelectSuggestion?: (text: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onPressImage }) => {
  const isAI = message.sender === 'ai';

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, isAI ? styles.containerAI : styles.containerUser]}>
      {/* Khung bong bóng chat chuẩn phong cách Messenger */}
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

        {/* Nội dung tin nhắn text */}
        <Text style={[styles.messageText, isAI ? styles.textAI : styles.textUser]}>
          {message.text}
        </Text>

        {/* Dấu thời gian tinh tế */}
        <Text style={[styles.timestamp, isAI ? styles.timestampAI : styles.timestampUser]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
    width: '100%',
  },
  containerAI: {
    alignItems: 'flex-start',
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleAI: {
    backgroundColor: '#242526',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#303031',
  },
  bubbleUser: {
    backgroundColor: '#0084FF',
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  textAI: {
    color: '#E4E6EB',
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
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timestampAI: {
    color: '#8A8D91',
  },
  timestampUser: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
});

