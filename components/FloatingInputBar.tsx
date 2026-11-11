import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  Text,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image as ImageIcon, Send, X, Smile, Plus } from 'lucide-react-native';

interface FloatingInputBarProps {
  onSendMessage: (text: string, imageBase64?: string, imageUri?: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const QUICK_EMOJIS = ['😟', '😭', '💔', '🫠', '😂', '🥰', '✨', '☕'];

export const FloatingInputBar: React.FC<FloatingInputBarProps> = ({
  onSendMessage,
  isLoading,
  disabled,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64?: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Chọn ảnh từ thư viện thiết bị
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Cần cấp quyền',
          'Vui lòng cấp quyền truy cập thư viện ảnh để gửi hình ảnh cho Tomorrow.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64 || undefined,
        });
      }
    } catch (err) {
      console.error('[Picker] Lỗi chọn ảnh:', err);
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh lúc này.');
    }
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage) return;
    if (isLoading) return;

    onSendMessage(trimmed, selectedImage?.base64, selectedImage?.uri);
    setInputText('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
  };

  const handleAddEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <View style={styles.wrapper}>
      {/* Thanh Quick Emoji Popover */}
      {showEmojiPicker && (
        <View style={styles.emojiRow}>
          {QUICK_EMOJIS.map((emoji, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [styles.emojiBtn, pressed && styles.emojiBtnPressed]}
              onPress={() => handleAddEmoji(emoji)}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Preview ảnh đã chọn trước khi gửi */}
      {selectedImage && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
          <Pressable
            style={styles.removeImageBtn}
            onPress={() => setSelectedImage(null)}
          >
            <X size={14} color="#FFF" />
          </Pressable>
          <Text style={styles.imagePreviewLabel}>Ảnh gửi kèm</Text>
        </View>
      )}

      {/* Floating Pill Input Bar phong cách Messenger */}
      <View style={styles.pillContainer}>
        {/* Nút đính kèm ảnh */}
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          onPress={handlePickImage}
          disabled={isLoading}
        >
          <ImageIcon size={22} color={selectedImage ? '#0084FF' : '#9CA3AF'} />
        </Pressable>

        {/* Nút chọn nhanh Emoji */}
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          onPress={() => setShowEmojiPicker((prev) => !prev)}
          disabled={isLoading}
        >
          <Smile size={22} color={showEmojiPicker ? '#0084FF' : '#9CA3AF'} />
        </Pressable>

        {/* TextInput đa dòng */}
        <TextInput
          style={styles.input}
          placeholder="Nhắn cho Tomorrow..."
          placeholderTextColor="#6B7280"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
          editable={!isLoading && !disabled}
        />

        {/* Nút Gửi / Loading Spinner */}
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            (inputText.trim().length > 0 || selectedImage) && styles.sendButtonActive,
            pressed && styles.sendButtonPressed,
          ]}
          onPress={handleSend}
          disabled={isLoading || (!inputText.trim() && !selectedImage)}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Send
              size={18}
              color={
                inputText.trim().length > 0 || selectedImage ? '#FFFFFF' : '#6B7280'
              }
            />
          )}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1E1F20',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2F3033',
  },
  emojiBtn: {
    padding: 6,
    borderRadius: 12,
  },
  emojiBtnPressed: {
    backgroundColor: '#2D2E30',
  },
  emojiText: {
    fontSize: 22,
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1F20',
    padding: 6,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    gap: 8,
  },
  imagePreview: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  imagePreviewLabel: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  removeImageBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1F20',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2D2E30',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
  },
  iconButtonPressed: {
    backgroundColor: '#2A2B2D',
  },
  input: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2A2B2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendButtonActive: {
    backgroundColor: '#0084FF',
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
