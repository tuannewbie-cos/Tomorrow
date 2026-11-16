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
  Platform,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image as ImageIcon, Send, X, Smile, Globe } from 'lucide-react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface FloatingInputBarProps {
  onSendMessage: (text: string, imageBase64?: string, imageUri?: string, forceWebSearch?: boolean) => void;
  isLoading: boolean;
  disabled?: boolean;
  isTomorrowTyping?: boolean;
  theme?: ThemeColors;
}

const QUICK_EMOJIS = ['😟', '😭', '💔', '🫠', '😂', '🥰', '✨', '☕'];

export const FloatingInputBar: React.FC<FloatingInputBarProps> = ({
  onSendMessage,
  isLoading,
  disabled,
  isTomorrowTyping = false,
  theme = DARK_THEME,
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64?: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forceWebSearch, setForceWebSearch] = useState(false);

  // Chọn ảnh từ thư viện thiết bị (an toàn trên cả Mobile lẫn Web Desktop)
  const handlePickImage = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Cần cấp quyền',
            'Vui lòng cấp quyền truy cập thư viện ảnh để gửi hình ảnh cho Tomorrow.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Platform.OS !== 'web',
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
    if (isLoading || isTomorrowTyping) return;

    onSendMessage(trimmed, selectedImage?.base64, selectedImage?.uri, forceWebSearch);
    setInputText('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
    setForceWebSearch(false);
  };

  // Phím tắt macOS: Enter để gửi (ngăn xuống dòng), Shift + Enter để xuống dòng
  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web') {
      const nativeEvent = e.nativeEvent;
      if (nativeEvent?.key === 'Enter' && !nativeEvent?.shiftKey) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        const trimmed = inputText.trim();
        if ((trimmed || selectedImage) && !isLoading && !isTomorrowTyping) {
          handleSend();
        }
      }
    }
  };

  const handleAddEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <View style={styles.wrapper}>
      {/* Thanh Quick Emoji Popover */}
      {showEmojiPicker && (
        <View
          style={[
            styles.emojiRow,
            { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
          ]}
        >
          {QUICK_EMOJIS.map((emoji, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [
                styles.emojiBtn,
                pressed && { backgroundColor: theme.btnHover },
                Platform.OS === 'web' && { cursor: 'pointer' as any },
              ]}
              onPress={() => handleAddEmoji(emoji)}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Preview ảnh đã chọn trước khi gửi */}
      {selectedImage && (
        <View
          style={[
            styles.imagePreviewContainer,
            { backgroundColor: theme.inputBg, borderColor: theme.bubbleUser },
          ]}
        >
          <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
          <Pressable
            style={[
              styles.removeImageBtn,
              Platform.OS === 'web' && { cursor: 'pointer' as any },
            ]}
            onPress={() => setSelectedImage(null)}
          >
            <X size={14} color="#FFF" />
          </Pressable>
          <Text style={[styles.imagePreviewLabel, { color: theme.bubbleUser }]}>Ảnh gửi kèm</Text>
        </View>
      )}

      {/* Floating Pill Input Bar căn giữa đối xứng hoàn hảo, không bị tràn lề */}
      <View
        style={[
          styles.pillContainer,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
          },
        ]}
      >
        {/* Nút đính kèm ảnh */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: theme.btnHover },
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={handlePickImage}
          disabled={isLoading || isTomorrowTyping}
        >
          <ImageIcon size={21} color={selectedImage ? theme.bubbleUser : theme.textSecondary} />
        </Pressable>

        {/* Nút chọn nhanh Emoji */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: theme.btnHover },
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={() => setShowEmojiPicker((prev) => !prev)}
          disabled={isLoading || isTomorrowTyping}
        >
          <Smile size={21} color={showEmojiPicker ? theme.bubbleUser : theme.textSecondary} />
        </Pressable>

        {/* Nút bật/tắt Ép buộc Tìm kiếm Web (🌐 Web) */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            forceWebSearch && { backgroundColor: '#2563EB' },
            !forceWebSearch && pressed && { backgroundColor: theme.btnHover },
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={() => setForceWebSearch((prev) => !prev)}
          disabled={isLoading || isTomorrowTyping}
          hitSlop={6}
        >
          <Globe size={19} color={forceWebSearch ? '#FFFFFF' : theme.textSecondary} />
        </Pressable>

        {/* TextInput đa dòng hỗ trợ phím tắt macOS & xóa viền outline xanh mặc định */}
        <TextInput
          style={[
            styles.input,
            { color: theme.inputText },
            Platform.OS === 'web' &&
              ({
                outlineStyle: 'none',
                boxSizing: 'border-box',
                resize: 'none',
              } as any),
          ]}
          placeholder="Nhắn cho Tomorrow..."
          placeholderTextColor={theme.placeholderText}
          value={inputText}
          onChangeText={setInputText}
          onKeyPress={handleKeyPress}
          multiline
          numberOfLines={1}
          maxLength={1000}
          editable={!isLoading && !disabled}
        />

        {/* Nút Gửi / Loading Spinner */}
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: theme.btnBg },
            (inputText.trim().length > 0 || selectedImage) &&
              !isLoading &&
              !isTomorrowTyping && {
                backgroundColor: theme.bubbleUser,
              },
            pressed && styles.sendButtonPressed,
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={handleSend}
          disabled={isLoading || isTomorrowTyping || (!inputText.trim() && !selectedImage)}
        >
          {isLoading || isTomorrowTyping ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Send
              size={18}
              color={
                inputText.trim().length > 0 || selectedImage ? '#FFFFFF' : theme.textMuted
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
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  emojiBtn: {
    padding: 6,
    borderRadius: 12,
  },
  emojiText: {
    fontSize: 22,
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    gap: 8,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  imagePreview: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  imagePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
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
    borderRadius: 26,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 52,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15.5,
    lineHeight: 22,
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'web' ? 6 : 4,
    paddingBottom: Platform.OS === 'web' ? 6 : 4,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    flexShrink: 0,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
