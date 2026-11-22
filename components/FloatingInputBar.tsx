import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  TextInput,
  type TextInputInstance,
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
import { KeystrokeTelemetry } from '../services/microPsychProfiler';
import { compressImageForVision, cleanBase64 } from '../utils/imageOptimizer';

export { KeystrokeTelemetry };

export interface FloatingInputBarProps {
  onSendMessage: (
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean,
    telemetry?: KeystrokeTelemetry
  ) => void;
  isLoading: boolean;
  disabled?: boolean;
  isTomorrowTyping?: boolean;
  theme?: ThemeColors;
  isSplitMode?: boolean;
}

export interface FloatingInputBarRef {
  focus: () => void;
  clear?: () => void;
  reset?: () => void;
  setInputText?: (text: string) => void;
  setSelectedImage?: (image: { uri: string; base64?: string; sizeKB?: number } | null) => void;
}

const QUICK_EMOJIS = ['😟', '😭', '💔', '🫠', '😂', '🥰', '✨', '☕'];

export const FloatingInputBar = forwardRef<FloatingInputBarRef, FloatingInputBarProps>(({
  onSendMessage,
  isLoading,
  disabled,
  isTomorrowTyping = false,
  theme = DARK_THEME,
  isSplitMode = false,
}, ref) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const textInputRef = useRef<TextInputInstance>(null);
  const lastSendTimestampRef = useRef<number>(0);
  const typingStartTimeRef = useRef<number | null>(null);
  const backspaceCountRef = useRef<number>(0);
  const totalKeystrokesRef = useRef<number>(0);
  const recentSendTimestampsRef = useRef<number[]>([]);

  const defaultMinHeight = isSplitMode ? 32 : 44;
  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(defaultMinHeight);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64?: string; sizeKB?: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forceWebSearch, setForceWebSearch] = useState(false);

  useEffect(() => {
    if (!inputText) {
      setInputHeight(isSplitMode ? 32 : 44);
    }
  }, [inputText, isSplitMode]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      textInputRef.current?.focus();
    },
    clear: () => {
      setInputText('');
      setSelectedImage(null);
      setShowEmojiPicker(false);
      setInputHeight(isSplitMode ? 32 : 44);
      typingStartTimeRef.current = null;
      backspaceCountRef.current = 0;
      totalKeystrokesRef.current = 0;
    },
    reset: () => {
      setInputText('');
      setSelectedImage(null);
      setShowEmojiPicker(false);
      setInputHeight(isSplitMode ? 32 : 44);
      typingStartTimeRef.current = null;
      backspaceCountRef.current = 0;
      totalKeystrokesRef.current = 0;
    },
    setInputText: (text: string) => {
      setInputText(text);
    },
    setSelectedImage: (img: { uri: string; base64?: string; sizeKB?: number } | null) => {
      setSelectedImage(img);
    },
  }));

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
        quality: 0.82,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const opt = await compressImageForVision(asset.base64 || asset.uri);
          setSelectedImage({
            uri: opt.dataUrl || `data:${opt.mimeType};base64,${opt.base64}`,
            base64: opt.base64,
            sizeKB: opt.sizeKB,
          });
        } catch {
          const rawBase64 = asset.base64 ? cleanBase64(asset.base64) : undefined;
          const uri = rawBase64 ? `data:image/jpeg;base64,${rawBase64}` : asset.uri;
          setSelectedImage({
            uri,
            base64: rawBase64,
          });
        }
      }
    } catch (err) {
      console.error('[Picker] Lỗi chọn ảnh:', err);
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh lúc này.');
    }
  };

  const handleSend = () => {
    const now = Date.now();
    if (now - lastSendTimestampRef.current < 200) return;
    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage) return;
    if (isLoading || isTomorrowTyping) return;

    lastSendTimestampRef.current = now;

    // Đo lường nhịp gõ KeystrokeTelemetry cục bộ 100%
    recentSendTimestampsRef.current = recentSendTimestampsRef.current.filter((t) => now - t <= 12000);
    recentSendTimestampsRef.current.push(now);
    const burstCount = recentSendTimestampsRef.current.length;

    const typingDurationMs = typingStartTimeRef.current
      ? Math.max(100, now - typingStartTimeRef.current)
      : 1200;
    const charsPerSecond = typingDurationMs > 0
      ? Number(((trimmed.length / (typingDurationMs / 1000))).toFixed(1))
      : 4.0;
    const totalKeys = Math.max(1, totalKeystrokesRef.current);
    const backspaceRatio = Number((backspaceCountRef.current / totalKeys).toFixed(3));

    const telemetry: KeystrokeTelemetry = {
      typingDurationMs,
      charsPerSecond,
      backspaceCount: backspaceCountRef.current,
      backspaceRatio,
      burstCount,
    };

    // Bắt buộc lưu imagePayload trước khi reset state tránh mất payload do race condition
    const imagePayload = selectedImage;
    const effectiveBase64 = imagePayload?.base64 || (imagePayload?.uri?.startsWith('data:image') ? cleanBase64(imagePayload.uri) : undefined);
    const effectiveUri = imagePayload?.uri?.startsWith('data:image')
      ? imagePayload.uri
      : (effectiveBase64 ? `data:image/jpeg;base64,${effectiveBase64}` : imagePayload?.uri);
    const effectiveText = trimmed || (imagePayload ? 'Hãy phân tích nội dung trong ảnh này giúp mình' : '');

    onSendMessage(effectiveText, effectiveBase64, effectiveUri, forceWebSearch, telemetry);
    setInputText('');
    setInputHeight(44); // Thu chiều cao ô nhập về 44px ngay lập tức khi gửi
    setSelectedImage(null);
    setShowEmojiPicker(false);
    setForceWebSearch(false);

    // Reset bộ đo sau khi gửi
    typingStartTimeRef.current = null;
    backspaceCountRef.current = 0;
    totalKeystrokesRef.current = 0;
  };

  const minAllowedH = isSplitMode ? 32 : 44;
  const maxAllowedH = isSplitMode ? 120 : 160;

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (!text.trim()) {
      setInputHeight(minAllowedH);
      typingStartTimeRef.current = null;
      backspaceCountRef.current = 0;
      totalKeystrokesRef.current = 0;
      return;
    }
    if (typingStartTimeRef.current === null) {
      typingStartTimeRef.current = Date.now();
    }
    totalKeystrokesRef.current++;
    if (Platform.OS === 'web') {
      const lines = text.split('\n').length;
      const estimated = Math.min(Math.max(minAllowedH, lines * (isSplitMode ? 20 : 22) + (isSplitMode ? 8 : 16)), maxAllowedH);
      setInputHeight(estimated);
    }
  };

  const handleContentSizeChange = (e: any) => {
    const h = e.nativeEvent?.contentSize?.height;
    if (h && typeof h === 'number') {
      const clamped = Math.min(Math.max(minAllowedH, Math.round(h)), maxAllowedH);
      setInputHeight(clamped);
    }
  };

  // Phím tắt macOS: Enter để gửi (ngăn xuống dòng), Shift + Enter để xuống dòng
  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web') {
      const nativeEvent = e.nativeEvent || e;
      const key = nativeEvent?.key || e.key;
      const shiftKey = nativeEvent?.shiftKey ?? e.shiftKey;

      if (key === 'Backspace') {
        backspaceCountRef.current++;
        totalKeystrokesRef.current++;
      } else if (key && key.length === 1 && !nativeEvent?.metaKey && !nativeEvent?.ctrlKey) {
        totalKeystrokesRef.current++;
        if (typingStartTimeRef.current === null) {
          typingStartTimeRef.current = Date.now();
        }
      }

      // BẢO VỆ TUYỆT ĐỐI CHO CMD+C, CMD+V, CMD+A, CMD+X, CMD+Z:
      // Nếu e.metaKey hoặc e.ctrlKey đang được nhấn, TUYỆT ĐỐI KHÔNG can thiệp để WKWebView/Browser copy/paste bình thường
      if (nativeEvent?.metaKey || nativeEvent?.ctrlKey) {
        return;
      }
      if (key === 'Enter' && !shiftKey) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (typeof nativeEvent.preventDefault === 'function') {
          nativeEvent.preventDefault();
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
    <View style={[styles.wrapper, isSplitMode && styles.wrapperSplit]}>
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
          <Text style={[styles.imagePreviewLabel, { color: theme.bubbleUser }]}>
            {selectedImage.sizeKB ? `${selectedImage.sizeKB} KB • Vision Lab` : 'Ảnh gửi kèm'}
          </Text>
        </View>
      )}

      {/* Floating Pill Input Bar co giãn đa dòng tự động (minHeight: 44, maxHeight: 160) */}
      <View
        style={[
          styles.pillContainer,
          isSplitMode && styles.pillContainerSplit,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            alignItems: inputHeight > (isSplitMode ? 36 : 48) ? 'flex-end' : 'center',
            paddingBottom: inputHeight > (isSplitMode ? 36 : 48) ? (isSplitMode ? 6 : 8) : (isSplitMode ? 4 : 6),
          },
        ]}
      >
        {/* Nút đính kèm ảnh */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            isSplitMode && styles.iconButtonSplit,
            pressed && { backgroundColor: theme.btnHover },
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={handlePickImage}
          disabled={isLoading || isTomorrowTyping}
        >
          <ImageIcon size={isSplitMode ? 17 : 21} color={selectedImage ? theme.bubbleUser : theme.textSecondary} />
        </Pressable>

        {/* Nút chọn nhanh Emoji */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            isSplitMode && styles.iconButtonSplit,
            pressed && { backgroundColor: theme.btnHover },
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={() => setShowEmojiPicker((prev) => !prev)}
          disabled={isLoading || isTomorrowTyping}
        >
          <Smile size={isSplitMode ? 17 : 21} color={showEmojiPicker ? theme.bubbleUser : theme.textSecondary} />
        </Pressable>

        {/* Nút bật/tắt Ép buộc Tìm kiếm Web (🌐 Web) */}
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            isSplitMode && styles.iconButtonSplit,
            forceWebSearch && { backgroundColor: '#2563EB' },
            !forceWebSearch && pressed && { backgroundColor: theme.btnHover },
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={() => setForceWebSearch((prev) => !prev)}
          disabled={isLoading || isTomorrowTyping}
          hitSlop={6}
        >
          <Globe size={isSplitMode ? 16 : 19} color={forceWebSearch ? '#FFFFFF' : theme.textSecondary} />
        </Pressable>

        {/* TextInput co giãn đa dòng mượt mà theo nội dung */}
        <TextInput
          ref={textInputRef}
          style={[
            styles.input,
            isSplitMode && styles.inputSplit,
            {
              color: theme.inputText,
              height: Math.min(Math.max(minAllowedH, inputHeight), maxAllowedH),
            },
            Platform.OS === 'web' &&
              ({
                outlineStyle: 'none',
                boxSizing: 'border-box',
                resize: 'none',
                overflowY: inputHeight >= (isSplitMode ? 115 : 155) ? 'auto' : 'hidden',
              } as any),
          ]}
          placeholder="Nhắn cho Tomorrow..."
          placeholderTextColor={theme.placeholderText}
          value={inputText}
          onChangeText={handleTextChange}
          onContentSizeChange={handleContentSizeChange}
          onKeyPress={handleKeyPress}
          {...(Platform.OS === 'web' ? { onKeyDown: handleKeyPress } : {})}
          multiline
          maxLength={4000}
          editable={!isLoading && !disabled}
        />

        {/* Nút Gửi / Loading Spinner */}
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            isSplitMode && styles.sendButtonSplit,
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
              size={isSplitMode ? 15 : 18}
              color={
                inputText.trim().length > 0 || selectedImage ? '#FFFFFF' : theme.textMuted
              }
            />
          )}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  wrapperSplit: {
    paddingHorizontal: 12,
    paddingBottom: 12,
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
  pillContainerSplit: {
    minHeight: 46,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 4,
    maxWidth: 780,
    gap: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconButtonSplit: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15.5,
    lineHeight: 22,
    minHeight: 44,
    maxHeight: 160,
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  inputSplit: {
    fontSize: 14,
    lineHeight: 20,
    minHeight: 32,
    maxHeight: 120,
    paddingHorizontal: 6,
    paddingTop: Platform.OS === 'web' ? 6 : 4,
    paddingBottom: Platform.OS === 'web' ? 6 : 4,
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
  sendButtonSplit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 4,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
