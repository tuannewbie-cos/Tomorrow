import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
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
import { Plus, X, Paperclip, Send, FileText } from 'lucide-react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';
import { KeystrokeTelemetry } from '../services/microPsychProfiler';
import { compressImageForVision, cleanBase64 } from '../utils/imageOptimizer';

export { KeystrokeTelemetry };

export interface AttachedFileInfo {
  name: string;
  sizeKB: number;
  content?: string;
  base64?: string;
  mimeType?: string;
  ext?: string;
  type: 'text' | 'image' | 'pdf' | 'other';
}

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

export const FloatingInputBar = forwardRef<FloatingInputBarRef, FloatingInputBarProps>(({
  onSendMessage,
  isLoading,
  disabled,
  isTomorrowTyping = false,
  theme = DARK_THEME,
  isSplitMode = false,
}, ref) => {
  const { width } = useWindowDimensions();

  const textInputRef = useRef<TextInputInstance>(null);
  const fileInputRef = useRef<any>(null);
  const lastSendTimestampRef = useRef<number>(0);
  const typingStartTimeRef = useRef<number | null>(null);
  const backspaceCountRef = useRef<number>(0);
  const totalKeystrokesRef = useRef<number>(0);
  const recentSendTimestampsRef = useRef<number[]>([]);

  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(24);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64?: string; sizeKB?: number } | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFileInfo | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Điều chỉnh chiều cao DOM thực tế trên Web (chuẩn 1 dòng 24px, tự giãn đến tối đa 110px)
  const adjustWebTextareaHeight = useCallback(() => {
    if (Platform.OS !== 'web' || !textInputRef.current) return;
    const el = (textInputRef.current as any)?._node || (textInputRef.current as any);
    if (el && typeof el.style === 'object') {
      try {
        el.rows = 1;
        el.style.height = '24px';
        const nextHeight = Math.min(110, Math.max(24, el.scrollHeight || 24));
        el.style.height = `${nextHeight}px`;
        el.style.overflowY = nextHeight >= 110 ? 'auto' : 'hidden';
      } catch (err) {
        // Safe fallback
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      adjustWebTextareaHeight();
    }
  }, [inputText, isSplitMode, adjustWebTextareaHeight]);

  // Đóng attach menu khi bấm ra ngoài trên Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !showAttachMenu) return;
    const handleDocumentClick = (e: MouseEvent) => {
      setShowAttachMenu(false);
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', handleDocumentClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleDocumentClick);
    };
  }, [showAttachMenu]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      textInputRef.current?.focus();
    },
    clear: () => {
      setInputText('');
      setSelectedImage(null);
      setAttachedFile(null);
      setShowAttachMenu(false);
      setInputHeight(24);
      typingStartTimeRef.current = null;
      backspaceCountRef.current = 0;
      totalKeystrokesRef.current = 0;
      if (Platform.OS === 'web') {
        const el = (textInputRef.current as any)?._node || (textInputRef.current as any);
        if (el && el.style) {
          el.rows = 1;
          el.style.height = '24px';
          el.style.overflowY = 'hidden';
        }
      }
    },
    reset: () => {
      setInputText('');
      setSelectedImage(null);
      setAttachedFile(null);
      setShowAttachMenu(false);
      setInputHeight(24);
      typingStartTimeRef.current = null;
      backspaceCountRef.current = 0;
      totalKeystrokesRef.current = 0;
      if (Platform.OS === 'web') {
        const el = (textInputRef.current as any)?._node || (textInputRef.current as any);
        if (el && el.style) {
          el.rows = 1;
          el.style.height = '24px';
          el.style.overflowY = 'hidden';
        }
      }
    },
    setInputText: (text: string) => {
      setInputText(text);
      if (Platform.OS === 'web') {
        setTimeout(adjustWebTextareaHeight, 10);
      }
    },
    setSelectedImage: (img: { uri: string; base64?: string; sizeKB?: number } | null) => {
      setSelectedImage(img);
    },
  }));

  // Chọn ảnh trên Mobile Native (fallback an toàn)
  const handlePickImageNative = async () => {
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
        mediaTypes: ['images'],
        allowsEditing: false,
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
      console.error('[Picker Native] Lỗi chọn ảnh:', err);
    }
  };

  // Kích hoạt chọn tệp (Web click input trực tiếp trong handler)
  const handleOpenFilePicker = (e?: any) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    setShowAttachMenu(false);

    if (Platform.OS === 'web') {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } else {
      handlePickImageNative();
    }
  };

  // Xử lý tệp được chọn trên Web qua thẻ <input type="file" />
  const handleFileInputChange = async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    const fileName: string = file.name || 'file';
    const fileSizeKB = Math.round(file.size / 1024);
    const fileExt = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

    try {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const rawResult = (ev.target?.result as string) || '';
          try {
            const opt = await compressImageForVision(rawResult);
            setSelectedImage({
              uri: opt.dataUrl || `data:${opt.mimeType};base64,${opt.base64}`,
              base64: opt.base64,
              sizeKB: opt.sizeKB,
            });
          } catch {
            const rawBase64 = cleanBase64(rawResult);
            setSelectedImage({
              uri: rawResult,
              base64: rawBase64,
              sizeKB: fileSizeKB,
            });
          }
        };
        reader.readAsDataURL(file);
      } else {
        const isTextCode =
          file.type.startsWith('text/') ||
          ['txt', 'md', 'csv', 'json', 'js', 'ts', 'tsx', 'py', 'cpp', 'c', 'java', 'html', 'css'].includes(fileExt || '');

        if (isTextCode) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const textContent = (ev.target?.result as string) || '';
            setAttachedFile({
              name: fileName,
              sizeKB: fileSizeKB,
              content: textContent,
              ext: fileExt,
              type: 'text',
            });
          };
          reader.readAsText(file);
        } else if (file.type === 'application/pdf' || fileExt === 'pdf') {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const rawResult = (ev.target?.result as string) || '';
            const base64Data = cleanBase64(rawResult);
            setAttachedFile({
              name: fileName,
              sizeKB: fileSizeKB,
              base64: base64Data,
              mimeType: 'application/pdf',
              type: 'pdf',
            });
          };
          reader.readAsDataURL(file);
        } else {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const textContent = (ev.target?.result as string) || '';
            setAttachedFile({
              name: fileName,
              sizeKB: fileSizeKB,
              content: textContent,
              ext: fileExt,
              type: 'text',
            });
          };
          reader.readAsText(file);
        }
      }
    } catch (err) {
      console.error('[FloatingInputBar] Lỗi tải tệp:', err);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleSend = () => {
    const now = Date.now();
    if (now - lastSendTimestampRef.current < 200) return;
    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage && !attachedFile) return;
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

    // Bắt buộc lưu payload trước khi reset state tránh mất do race condition
    const imagePayload = selectedImage;
    const filePayload = attachedFile;

    let effectiveBase64 = imagePayload?.base64 || (imagePayload?.uri?.startsWith('data:image') ? cleanBase64(imagePayload.uri) : undefined);
    let effectiveUri = imagePayload?.uri?.startsWith('data:image')
      ? imagePayload.uri
      : (effectiveBase64 ? `data:image/jpeg;base64,${effectiveBase64}` : imagePayload?.uri);

    // Nếu gửi file PDF và chưa có ảnh, truyền base64 của PDF vào để hỗ trợ Gemini InlineData
    if (!effectiveBase64 && filePayload && filePayload.type === 'pdf' && filePayload.base64) {
      effectiveBase64 = filePayload.base64;
      effectiveUri = `data:application/pdf;base64,${filePayload.base64}`;
    }

    let effectiveText = trimmed;
    if (filePayload) {
      if (filePayload.type === 'text' && filePayload.content) {
        const fileBlock = `[Tệp đính kèm: ${filePayload.name}]\n\`\`\`${filePayload.ext || ''}\n${filePayload.content}\n\`\`\`\n\n`;
        effectiveText = fileBlock + (trimmed || 'Hãy phân tích nội dung tệp đính kèm này giúp mình.');
      } else if (filePayload.type === 'pdf') {
        const fileBlock = `[Tệp PDF đính kèm: ${filePayload.name} (~${filePayload.sizeKB} KB)]\n\n`;
        effectiveText = fileBlock + (trimmed || 'Hãy phân tích nội dung tệp PDF này giúp mình.');
      }
    } else if (imagePayload && (!trimmed || trimmed === 'Hãy phân tích nội dung trong ảnh này giúp mình')) {
      effectiveText = 'Hãy phân tích nội dung trong ảnh này giúp mình';
    }

    onSendMessage(effectiveText, effectiveBase64, effectiveUri, false, telemetry);

    setInputText('');
    setInputHeight(24);
    setSelectedImage(null);
    setAttachedFile(null);
    setShowAttachMenu(false);

    if (Platform.OS === 'web') {
      const el = (textInputRef.current as any)?._node || (textInputRef.current as any);
      if (el && el.style) {
        el.rows = 1;
        el.style.height = '24px';
        el.style.overflowY = 'hidden';
      }
    }

    typingStartTimeRef.current = null;
    backspaceCountRef.current = 0;
    totalKeystrokesRef.current = 0;
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (!text.trim()) {
      setInputHeight(24);
      typingStartTimeRef.current = null;
      backspaceCountRef.current = 0;
      totalKeystrokesRef.current = 0;
    } else {
      if (typingStartTimeRef.current === null) {
        typingStartTimeRef.current = Date.now();
      }
      totalKeystrokesRef.current++;
    }
  };

  const handleKeyPress = (e: any) => {
    const nativeEvent = e.nativeEvent || e;
    const key = nativeEvent.key;
    const isShift = nativeEvent.shiftKey;

    if (key === 'Backspace') {
      backspaceCountRef.current++;
    }

    if (key === 'Escape') {
      if (showAttachMenu) {
        setShowAttachMenu(false);
      }
      return;
    }

    if (key === 'Enter') {
      if (!isShift) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (typeof nativeEvent.preventDefault === 'function') {
          nativeEvent.preventDefault();
        }
        const trimmed = inputText.trim();
        if ((trimmed || selectedImage || attachedFile) && !isLoading && !isTomorrowTyping) {
          handleSend();
        }
      }
    }
  };

  const hasContentToSend =
    inputText.trim().length > 0 || Boolean(selectedImage) || Boolean(attachedFile);

  return (
    <View style={styles.wrapper}>
      {/* Hidden Web File Input */}
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.py,.cpp,.c,.java,.html,.css"
          onChange={handleFileInputChange}
        />
      )}

      {/* Preview ảnh đính kèm (Vision Lab) */}
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

      {/* Preview tệp văn bản / code / pdf đính kèm */}
      {attachedFile && (
        <View
          style={[
            styles.filePreviewContainer,
            { backgroundColor: theme.inputBg, borderColor: theme.bubbleUser },
          ]}
        >
          <View
            style={[
              styles.filePreviewIconBox,
              { backgroundColor: theme.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)' },
            ]}
          >
            <FileText size={16} color={theme.bubbleUser} />
          </View>
          <Text style={[styles.filePreviewLabel, { color: theme.textPrimary }]} numberOfLines={1}>
            {attachedFile.name} ({attachedFile.sizeKB} KB)
          </Text>
          <Pressable
            style={[
              styles.removeFileBtn,
              Platform.OS === 'web' && { cursor: 'pointer' as any },
            ]}
            onPress={() => setAttachedFile(null)}
          >
            <X size={14} color="#FFF" />
          </Pressable>
        </View>
      )}

      {/* Floating Pill Input Bar chuẩn 1 dòng tối giản phong cách Gemini */}
      <View
        style={[
          styles.pillContainer,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
          },
        ]}
      >
        {/* Nút tròn dấu + kiểu Gemini & Popover Tệp */}
        <View style={styles.plusContainer}>
          {showAttachMenu && (
            <View
              style={[
                styles.attachPopover,
                {
                  backgroundColor: theme.mode === 'dark' ? '#1E2330' : '#FFFFFF',
                  borderColor: theme.borderSubtle,
                  shadowColor: '#000',
                  shadowOpacity: theme.mode === 'dark' ? 0.4 : 0.12,
                },
                Platform.OS === 'web' && ({
                  animation: 'macosPopoverSlide 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                } as any),
              ]}
              onStartShouldSetResponder={() => true}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.attachMenuItem,
                  pressed && { backgroundColor: theme.btnHover },
                  Platform.OS === 'web' && ({
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                  } as any),
                ]}
                onPress={handleOpenFilePicker}
              >
                <Paperclip size={16} color={theme.textPrimary} />
                <Text style={[styles.attachMenuText, { color: theme.textPrimary }]}>
                  Tệp
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.plusButton,
              showAttachMenu
                ? {
                    backgroundColor:
                      theme.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.12)'
                        : 'rgba(0, 0, 0, 0.08)',
                  }
                : { backgroundColor: 'transparent' },
              pressed && { backgroundColor: theme.btnHover },
              Platform.OS === 'web' && ({
                cursor: 'pointer',
                transition: 'transform 0.15s ease, background-color 0.15s ease',
              } as any),
            ]}
            onPress={(e) => {
              if (e && typeof (e as any).stopPropagation === 'function') {
                (e as any).stopPropagation();
              }
              setShowAttachMenu((prev) => !prev);
            }}
            disabled={isLoading || isTomorrowTyping}
            hitSlop={6}
          >
            {showAttachMenu ? (
              <X size={18} color={theme.textPrimary} />
            ) : (
              <Plus size={19} color={theme.textSecondary} />
            )}
          </Pressable>
        </View>

        {/* TextInput chuẩn 1 dòng trên Web, tự động mở rộng theo DOM thực tế */}
        <TextInput
          ref={textInputRef}
          rows={1}
          style={[
            styles.input,
            {
              color: theme.inputText,
              fontSize: isSplitMode ? 14 : 15,
              ...(Platform.OS !== 'web' ? { height: Math.min(110, Math.max(24, inputHeight)) } : {}),
            },
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
          onChangeText={handleTextChange}
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
            { backgroundColor: theme.btnBg },
            hasContentToSend &&
              !isLoading &&
              !isTomorrowTyping && {
                backgroundColor: theme.bubbleUser,
              },
            pressed && styles.sendButtonPressed,
            Platform.OS === 'web' && { cursor: 'pointer' as any },
          ]}
          onPress={handleSend}
          disabled={isLoading || isTomorrowTyping || !hasContentToSend}
          hitSlop={6}
        >
          {isLoading || isTomorrowTyping ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Send
              size={16}
              color={hasContentToSend ? '#FFFFFF' : theme.textMuted}
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
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
  filePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    gap: 10,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  filePreviewIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  removeFileBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContainer: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  plusContainer: {
    position: 'relative',
    flexShrink: 0,
    zIndex: 50,
  },
  plusButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  attachPopover: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    minWidth: 130,
    borderRadius: 16,
    padding: 5,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 14,
    zIndex: 100,
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  attachMenuText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        : undefined,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 24,
    maxHeight: 110,
    lineHeight: 22,
    fontSize: 15,
    paddingTop: 1,
    paddingBottom: 1,
    paddingHorizontal: 4,
    margin: 0,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
    flexShrink: 0,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
