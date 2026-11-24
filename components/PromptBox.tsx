import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  TextInput,
  type TextInputInstance,
  StyleSheet,
  Pressable,
  Image,
  Text,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Plus, X, Paperclip, ArrowUp, FileText, Square } from 'lucide-react-native';
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

export interface PromptBoxProps {
  onSendMessage: (
    text: string,
    imageBase64?: string,
    imageUri?: string,
    forceWebSearch?: boolean,
    telemetry?: KeystrokeTelemetry
  ) => void;
  isLoading?: boolean;
  isGenerating?: boolean;
  onStopGeneration?: () => void;
  disabled?: boolean;
  isTomorrowTyping?: boolean;
  theme?: ThemeColors;
  isSplitMode?: boolean;
  isDenseSplit?: boolean;
  placeholder?: string;
  isCentered?: boolean;
  maxWidth?: number;
}

export interface PromptBoxRef {
  focus: () => void;
  clear?: () => void;
  reset?: () => void;
  setInputText?: (text: string) => void;
  setSelectedImage?: (image: { uri: string; base64?: string; sizeKB?: number } | null) => void;
}

// Inject CSS Web chuyên biệt cho Lucian #452 (hỗ trợ @property, conic glow spin, fly-up text và prefers-reduced-motion)
let isWebStylesInjected = false;
function ensureWebStylesInjected() {
  if (Platform.OS !== 'web' || isWebStylesInjected || typeof document === 'undefined') return;
  isWebStylesInjected = true;

  const styleEl = document.createElement('style');
  styleEl.id = 'tomorrow-promptbox-lucian452';
  styleEl.textContent = `
    @property --tmr-glow-a {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }

    @keyframes tmr-glow-spin {
      to {
        --tmr-glow-a: 360deg;
      }
    }

    .tmr-prompt-container {
      position: relative;
      border-radius: 24px;
      transition: box-shadow 0.25s ease, border-color 0.25s ease;
      box-sizing: border-box;
    }

    .tmr-prompt-glow {
      position: absolute;
      inset: -1.5px;
      border-radius: 25.5px;
      padding: 1.5px;
      pointer-events: none;
      background: conic-gradient(from var(--tmr-glow-a, 0deg), transparent 0 58%, var(--tmr-accent-2, #2F8FE0) 76%, var(--tmr-accent, #6A57F2) 88%, transparent 100%);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
      opacity: 0;
      animation: tmr-glow-spin 3.6s linear infinite;
      animation-play-state: paused;
      transition: opacity 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
      z-index: 2;
    }

    .tmr-prompt-glow.is-gen {
      opacity: 1;
      animation-play-state: running;
    }

    .tmr-prompt-textarea {
      transition: height 0.34s cubic-bezier(0.3, 1.25, 0.5, 1);
      scrollbar-width: none;
    }

    .tmr-prompt-textarea::-webkit-scrollbar {
      display: none;
    }

    .tmr-prompt-fly {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      line-height: 24px;
      font-size: 15px;
      z-index: 10;
    }

    .tmr-action-btn-bump {
      transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, opacity 0.2s ease;
    }

    .tmr-action-btn-bump:active {
      transform: scale(0.92);
    }

    .tmr-prompt-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .tmr-prompt-glow {
        animation: none !important;
      }
      .tmr-prompt-textarea {
        transition: none !important;
      }
      .tmr-action-btn-bump {
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

export const PromptBox = forwardRef<PromptBoxRef, PromptBoxProps>(({
  onSendMessage,
  isLoading = false,
  isGenerating: propIsGenerating,
  onStopGeneration,
  disabled = false,
  isTomorrowTyping = false,
  theme = DARK_THEME,
  isSplitMode = false,
  isDenseSplit = false,
  placeholder = 'Nhắn cho Tomorrow...',
  isCentered = false,
  maxWidth,
}, ref) => {
  const { width } = useWindowDimensions();

  // Đảm bảo CSS Web Lucian #452 được nạp 1 lần duy nhất
  useEffect(() => {
    ensureWebStylesInjected();
  }, []);

  const isGenerating = typeof propIsGenerating === 'boolean' ? propIsGenerating : (isLoading || isTomorrowTyping);

  const containerRef = useRef<any>(null);
  const textInputRef = useRef<TextInputInstance>(null);
  const textareaDOMRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<any>(null);
  const actionButtonRef = useRef<any>(null);

  const lastSendTimestampRef = useRef<number>(0);
  const typingStartTimeRef = useRef<number | null>(null);
  const backspaceCountRef = useRef<number>(0);
  const totalKeystrokesRef = useRef<number>(0);
  const recentSendTimestampsRef = useRef<number[]>([]);
  const prevReadyToSendRef = useRef<boolean>(false);

  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(24);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64?: string; sizeKB?: number } | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFileInfo | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Bộ token màu Lucian #452 đồng bộ theo theme
  const isDark = theme.mode === 'dark';
  const tokens = isDark
    ? {
        bg: '#1E1F26',
        text: '#F4F0E8',
        sub: 'rgba(244, 240, 232, 0.68)',
        placeholder: 'rgba(244, 240, 232, 0.42)',
        border: 'rgba(255, 255, 255, 0.16)',
        borderSubtle: 'rgba(255, 255, 255, 0.08)',
        focusRing: 'rgba(255, 255, 255, 0.30)',
        boxShadow: '0 18px 38px -22px rgba(0,0,0,0.72), 0 2px 6px -3px rgba(0,0,0,0.45)',
        sendActiveBg: '#F4F0E8',
        sendActiveFg: '#0B0C12',
        sendDisabledBg: '#252632',
        sendDisabledFg: 'rgba(244, 240, 232, 0.42)',
        accent: '#B7A4FF',
        accent2: '#7DB4FF',
      }
    : {
        bg: '#FFFFFF',
        text: '#16151B',
        sub: '#57535F',
        placeholder: '#8E8A97',
        border: 'rgba(22, 21, 27, 0.17)',
        borderSubtle: 'rgba(22, 21, 27, 0.10)',
        focusRing: 'rgba(22, 21, 27, 0.30)',
        boxShadow: '0 18px 38px -22px rgba(40,30,80,0.30), 0 2px 6px -3px rgba(40,30,80,0.14)',
        sendActiveBg: '#16151B',
        sendActiveFg: '#FFFFFF',
        sendDisabledBg: '#EAE7E1',
        sendDisabledFg: '#8E8A97',
        accent: '#6A57F2',
        accent2: '#2F8FE0',
      };

  // Điều chỉnh chiều cao DOM thực tế trên Web (tự giãn từ 24px đến tối đa 96px ~ 4 dòng)
  const adjustWebTextareaHeight = useCallback(() => {
    if (Platform.OS !== 'web' || !textInputRef.current) return;
    const el = ((textInputRef.current as any)?._node || (textInputRef.current as any)) as HTMLTextAreaElement | null;
    if (el && typeof el.style === 'object') {
      textareaDOMRef.current = el;
      try {
        el.rows = 1;
        el.style.height = '24px';
        const scrollH = el.scrollHeight || 24;
        const nextHeight = Math.min(96, Math.max(24, scrollH));
        el.style.height = `${nextHeight}px`;
        el.style.overflowY = scrollH > 96 ? 'auto' : 'hidden';
        setInputHeight(nextHeight);
      } catch {
        // Safe fallback
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      adjustWebTextareaHeight();
    }
  }, [inputText, isSplitMode, isDenseSplit, adjustWebTextareaHeight]);

  // Đóng popover đính kèm khi bấm ra ngoài trên Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !showAttachMenu) return;
    const handleDocumentClick = () => {
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

  // Spring bump animation trên nút tròn khi chuyển sang trạng thái sẵn sàng gửi
  const hasContentToSend =
    inputText.trim().length > 0 || Boolean(selectedImage) || Boolean(attachedFile);
  const isReadyToSend = hasContentToSend && !isGenerating;

  useEffect(() => {
    if (Platform.OS !== 'web' || !actionButtonRef.current) return;
    const el = ((actionButtonRef.current as any)?._node || actionButtonRef.current as any) as HTMLElement | null;
    if (!el || typeof el.animate !== 'function') return;

    if (!prevReadyToSendRef.current && isReadyToSend) {
      try {
        el.animate(
          [
            { transform: 'scale(0.86)' },
            { transform: 'scale(1.06)' },
            { transform: 'scale(1)' },
          ],
          {
            duration: 300,
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            fill: 'none',
          }
        );
      } catch {
        // Safe fallback
      }
    }
    prevReadyToSendRef.current = isReadyToSend;
  }, [isReadyToSend]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (Platform.OS === 'web' && textareaDOMRef.current) {
        try {
          textareaDOMRef.current.focus({ preventScroll: true });
          return;
        } catch {
          // fallback
        }
      }
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
      if (Platform.OS === 'web' && textareaDOMRef.current) {
        textareaDOMRef.current.rows = 1;
        textareaDOMRef.current.style.height = '24px';
        textareaDOMRef.current.style.overflowY = 'hidden';
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
      if (Platform.OS === 'web' && textareaDOMRef.current) {
        textareaDOMRef.current.rows = 1;
        textareaDOMRef.current.style.height = '24px';
        textareaDOMRef.current.style.overflowY = 'hidden';
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

  // Chọn ảnh trên Mobile Native
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

  // Kích hoạt chọn tệp
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
      console.error('[PromptBox] Lỗi tải tệp:', err);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Hiệu ứng chữ bay lên mờ dần khi gửi (flyTextAnimation)
  const triggerFlyTextAnimation = (textToFly: string) => {
    if (Platform.OS !== 'web' || !textareaDOMRef.current || !textToFly.trim()) return;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      const textarea = textareaDOMRef.current;
      const rect = textarea.getBoundingClientRect();
      const parentRect = textarea.parentElement?.getBoundingClientRect() || rect;

      const flyEl = document.createElement('div');
      flyEl.className = 'tmr-prompt-fly';
      flyEl.textContent = textToFly;
      flyEl.style.position = 'absolute';
      flyEl.style.left = `${rect.left - parentRect.left}px`;
      flyEl.style.top = `${rect.top - parentRect.top}px`;
      flyEl.style.width = `${rect.width}px`;
      flyEl.style.color = tokens.text;
      flyEl.style.font = window.getComputedStyle(textarea).font;

      textarea.parentElement?.appendChild(flyEl);

      const anim = flyEl.animate(
        [
          { opacity: '1', transform: 'none', filter: 'blur(0px)' },
          { opacity: '0', transform: 'translateY(-22px) scale(0.97)', filter: 'blur(3px)' },
        ],
        {
          duration: 420,
          easing: 'cubic-bezier(0.3, 0.6, 0.3, 1)',
          fill: 'forwards',
        }
      );

      anim.onfinish = () => {
        flyEl.remove();
      };
    } catch {
      // Safe fallback
    }
  };

  const handleSend = () => {
    const now = Date.now();
    if (now - lastSendTimestampRef.current < 200) return;
    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage && !attachedFile) return;
    if (isGenerating) return;

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

    // Bắt buộc lưu payload trước khi reset state
    const imagePayload = selectedImage;
    const filePayload = attachedFile;

    let effectiveBase64 = imagePayload?.base64 || (imagePayload?.uri?.startsWith('data:image') ? cleanBase64(imagePayload.uri) : undefined);
    let effectiveUri = imagePayload?.uri?.startsWith('data:image')
      ? imagePayload.uri
      : (effectiveBase64 ? `data:image/jpeg;base64,${effectiveBase64}` : imagePayload?.uri);

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

    // Chạy hiệu ứng chữ bay mờ dần trên Web
    if (trimmed) {
      triggerFlyTextAnimation(trimmed);
    }

    onSendMessage(effectiveText, effectiveBase64, effectiveUri, false, telemetry);

    setInputText('');
    setInputHeight(24);
    setSelectedImage(null);
    setAttachedFile(null);
    setShowAttachMenu(false);

    if (Platform.OS === 'web' && textareaDOMRef.current) {
      textareaDOMRef.current.rows = 1;
      textareaDOMRef.current.style.height = '24px';
      textareaDOMRef.current.style.overflowY = 'hidden';
    }

    typingStartTimeRef.current = null;
    backspaceCountRef.current = 0;
    totalKeystrokesRef.current = 0;
  };

  const handleActionClick = () => {
    if (isGenerating) {
      if (typeof onStopGeneration === 'function') {
        onStopGeneration();
      }
      return;
    }
    handleSend();
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
    const isComposing = (nativeEvent as any).isComposing === true;

    if (key === 'Backspace') {
      backspaceCountRef.current++;
    }

    if (key === 'Escape') {
      if (showAttachMenu) {
        setShowAttachMenu(false);
        return;
      }
      if (isGenerating && typeof onStopGeneration === 'function') {
        onStopGeneration();
        return;
      }
    }

    if (key === 'Enter') {
      if (!isShift && !isComposing) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (typeof nativeEvent.preventDefault === 'function') {
          nativeEvent.preventDefault();
        }
        const trimmed = inputText.trim();
        if ((trimmed || selectedImage || attachedFile) && !isGenerating) {
          handleSend();
        }
      }
    }
  };

  const handlePaste = async (e: any) => {
    if (Platform.OS !== 'web') return;
    const clipboardData = e.clipboardData || (window as any).clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
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
                sizeKB: Math.round(file.size / 1024),
              });
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  const handleContainerClick = (e: any) => {
    // Chỉ focus khi bấm vào vùng đệm rỗng của hộp Prompt Box
    const targetTag = e?.target?.tagName?.toLowerCase();
    if (targetTag !== 'button' && targetTag !== 'svg' && targetTag !== 'path' && targetTag !== 'input' && targetTag !== 'textarea') {
      if (Platform.OS === 'web' && textareaDOMRef.current) {
        try {
          textareaDOMRef.current.focus({ preventScroll: true });
        } catch {
          // ignore
        }
      } else {
        textInputRef.current?.focus();
      }
    }
  };

  return (
    <View
      style={[
        styles.wrapper,
        isCentered
          ? { paddingBottom: 0, paddingTop: 0, paddingHorizontal: 0 }
          : isDenseSplit
          ? { paddingHorizontal: 6, paddingBottom: 6 }
          : {},
      ]}
    >
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

      {/* Hộp Prompt Box 2 tầng Lucian #452 */}
      <View
        ref={containerRef}
        style={[
          styles.boxContainer,
          {
            backgroundColor: tokens.bg,
            borderColor: tokens.border,
            ...(isDark
              ? {
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 18 },
                  shadowOpacity: 0.72,
                  shadowRadius: 22,
                }
              : {
                  shadowColor: '#281E50',
                  shadowOffset: { width: 0, height: 18 },
                  shadowOpacity: 0.28,
                  shadowRadius: 24,
                }),
          },
          Platform.OS === 'web' && ({
            boxShadow: tokens.boxShadow,
            ['--tmr-accent' as any]: tokens.accent,
            ['--tmr-accent-2' as any]: tokens.accent2,
          } as any),
          isDenseSplit && {
            paddingTop: 10,
            paddingBottom: 8,
            paddingHorizontal: 10,
          },
          isCentered && {
            maxWidth: isDenseSplit ? '100%' : (maxWidth || 760),
          },
          !isCentered && maxWidth ? { maxWidth } : {},
          isSplitMode ? { maxWidth: '100%' } : {},
        ]}
        {...(Platform.OS === 'web' ? { className: 'tmr-prompt-container', onClick: handleContainerClick } : {})}
      >
        {/* Viền xoay Conic Glow Spin khi đang sinh phản hồi */}
        {Platform.OS === 'web' && (
          <div
            className={`tmr-prompt-glow ${isGenerating ? 'is-gen' : ''}`}
            aria-hidden="true"
          />
        )}

        {/* TẦNG 1: KHU VỰC PREVIEW ĐÍNH KÈM & Ô NHẬP TEXTAREA */}
        <View style={styles.upperTier}>
          {/* Preview ảnh đính kèm (Vision Lab) */}
          {selectedImage && (
            <View
              style={[
                styles.imagePreviewContainer,
                { backgroundColor: isDark ? '#262833' : '#F3F4F6', borderColor: tokens.borderSubtle },
              ]}
            >
              <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
              <View style={styles.imageLabelBox}>
                <Text style={[styles.imagePreviewLabel, { color: tokens.text }]} numberOfLines={1}>
                  {selectedImage.sizeKB ? `${selectedImage.sizeKB} KB • Vision Lab` : 'Ảnh gửi kèm'}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.removeImageBtn,
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => setSelectedImage(null)}
                hitSlop={6}
              >
                <X size={12} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            </View>
          )}

          {/* Preview tệp văn bản / code / pdf đính kèm */}
          {attachedFile && (
            <View
              style={[
                styles.filePreviewContainer,
                { backgroundColor: isDark ? '#262833' : '#F3F4F6', borderColor: tokens.borderSubtle },
              ]}
            >
              <View
                style={[
                  styles.filePreviewIconBox,
                  { backgroundColor: isDark ? 'rgba(125, 180, 255, 0.18)' : 'rgba(47, 143, 224, 0.12)' },
                ]}
              >
                <FileText size={15} color={tokens.accent2} strokeWidth={2} />
              </View>
              <Text style={[styles.filePreviewLabel, { color: tokens.text }]} numberOfLines={1}>
                {attachedFile.name} ({attachedFile.sizeKB} KB)
              </Text>
              <Pressable
                style={[
                  styles.removeFileBtn,
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => setAttachedFile(null)}
                hitSlop={6}
              >
                <X size={12} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            </View>
          )}

          {/* Text Input / Textarea tự giãn mượt từ 24px đến 96px */}
          <View style={styles.textareaWrapper}>
            <TextInput
              ref={textInputRef}
              rows={1}
              style={[
                styles.textareaInput,
                {
                  color: tokens.text,
                  fontSize: isDenseSplit ? 13 : isSplitMode ? 14 : 15,
                  ...(Platform.OS !== 'web' ? { height: Math.min(96, Math.max(24, inputHeight)) } : {}),
                },
                Platform.OS === 'web' &&
                  ({
                    outlineStyle: 'none',
                    boxSizing: 'border-box',
                    resize: 'none',
                  } as any),
              ]}
              placeholder={placeholder}
              placeholderTextColor={tokens.placeholder}
              value={inputText}
              onChangeText={handleTextChange}
              onKeyPress={handleKeyPress}
              {...(Platform.OS === 'web'
                ? {
                    className: 'tmr-prompt-textarea',
                    onKeyDown: handleKeyPress,
                    onPaste: handlePaste,
                  }
                : {})}
              multiline
              maxLength={4000}
              editable={!disabled}
            />
          </View>
        </View>

        {/* TẦNG 2: THANH CÔNG CỤ PHÍA DƯỚI — TUYỆT ĐỐI KHÔNG CÓ NÚT MODEL */}
        <View style={styles.bottomBar}>
          {/* Bên trái: Nút tròn dấu + duy nhất (34x34px) */}
          <View style={styles.plusContainer}>
            {showAttachMenu && (
              <View
                style={[
                  styles.attachPopover,
                  {
                    backgroundColor: isDark ? '#232530' : '#FFFFFF',
                    borderColor: tokens.border,
                    shadowColor: '#000000',
                    shadowOpacity: isDark ? 0.45 : 0.14,
                  },
                ]}
                onStartShouldSetResponder={() => true}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.attachMenuItem,
                    pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                    Platform.OS === 'web' && ({
                      cursor: 'pointer',
                      transition: 'background-color 0.12s ease',
                    } as any),
                  ]}
                  onPress={handleOpenFilePicker}
                >
                  <Paperclip size={15} color={tokens.text} strokeWidth={2} />
                  <Text style={[styles.attachMenuText, { color: tokens.text }]}>
                    Tệp
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.plusButton,
                {
                  borderColor: tokens.borderSubtle,
                  backgroundColor: showAttachMenu
                    ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                    : 'transparent',
                },
                pressed && { transform: [{ scale: 0.92 }] },
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
              disabled={isGenerating}
              hitSlop={6}
              aria-label="Đính kèm tệp"
            >
              {showAttachMenu ? (
                <X size={16} color={tokens.text} strokeWidth={2} />
              ) : (
                <Plus size={16} color={tokens.sub} strokeWidth={2} />
              )}
            </Pressable>
          </View>

          {/* Ở giữa: ĐỂ TRỐNG HOÀN TOÀN (Zero Model Selector, Zero Emotes, Zero Globe) */}
          <View style={styles.spacerCenter} />

          {/* Bên phải: Nút tròn Gửi / Dừng biến hình (34x34px) */}
          <Pressable
            ref={actionButtonRef}
            style={({ pressed }) => [
              styles.actionButton,
              isGenerating
                ? {
                    backgroundColor: tokens.sendActiveBg,
                    opacity: 1,
                  }
                : isReadyToSend
                ? {
                    backgroundColor: tokens.sendActiveBg,
                    opacity: 1,
                  }
                : {
                    backgroundColor: tokens.sendDisabledBg,
                    opacity: 0.75,
                  },
              pressed && { transform: [{ scale: 0.92 }] },
              Platform.OS === 'web' && ({
                cursor: isGenerating || isReadyToSend ? 'pointer' : 'default',
              } as any),
            ]}
            onPress={handleActionClick}
            disabled={!isGenerating && !isReadyToSend}
            hitSlop={6}
            aria-label={isGenerating ? 'Dừng tạo phản hồi' : 'Gửi tin nhắn'}
            aria-disabled={!isGenerating && !isReadyToSend}
            {...(Platform.OS === 'web' ? { className: 'tmr-action-btn-bump' } : {})}
          >
            {isGenerating ? (
              <Square
                size={11}
                color={tokens.sendActiveFg}
                fill={tokens.sendActiveFg}
                style={{ borderRadius: 2 }}
              />
            ) : (
              <ArrowUp
                size={18}
                color={isReadyToSend ? tokens.sendActiveFg : tokens.sendDisabledFg}
                strokeWidth={2.3}
              />
            )}
          </Pressable>
        </View>

        {/* Trực quan ẩn hỗ trợ Accessibility */}
        {Platform.OS === 'web' && (
          <p className="tmr-prompt-sr-only" role="status">
            {isGenerating ? 'Đang tạo câu trả lời...' : 'Sẵn sàng nhập tin nhắn.'}
          </p>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 4,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  boxContainer: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 14,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  upperTier: {
    width: '100%',
  },
  textareaWrapper: {
    width: '100%',
    minHeight: 24,
    position: 'relative',
  },
  textareaInput: {
    width: '100%',
    minHeight: 24,
    maxHeight: 96,
    lineHeight: 24,
    fontSize: 15,
    letterSpacing: -0.15,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 2,
    margin: 0,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
    position: 'relative',
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachPopover: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    minWidth: 120,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 14,
    zIndex: 100,
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
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
  spacerCenter: {
    flex: 1,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 8,
    width: '100%',
  },
  imagePreview: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  imageLabelBox: {
    flex: 1,
  },
  imagePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  removeImageBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  filePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 8,
    width: '100%',
  },
  filePreviewIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
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
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
