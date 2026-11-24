import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Search } from 'lucide-react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';

export interface CommandTriggerButtonProps {
  onPress: () => void;
  theme?: ThemeColors;
  isDesktop?: boolean;
}

export interface CommandTriggerButtonRef {
  triggerChord: () => void;
  setModifierDown: (down: boolean) => void;
  reset: () => void;
}

// Inject CSS Web 1 lần cho Lucian #471
let isWebStylesInjected = false;
function ensureWebStylesInjected() {
  if (Platform.OS !== 'web' || isWebStylesInjected || typeof document === 'undefined') return;
  isWebStylesInjected = true;

  const styleEl = document.createElement('style');
  styleEl.id = 'tomorrow-kbtn-lucian471';
  styleEl.textContent = `
    @keyframes tmr-kbtn-ask {
      0%, 100% {
        transform: translateY(0);
        box-shadow: 0 0 0 0 var(--tmr-accent-soft);
      }
      50% {
        transform: translateY(1.2px);
        box-shadow: 0 0 0 3.5px var(--tmr-accent-soft);
      }
    }

    @keyframes tmr-kbtn-rp {
      0% {
        transform: translate(-50%, -50%) scale(0.35);
        opacity: 0.32;
      }
      100% {
        transform: translate(-50%, -50%) scale(26);
        opacity: 0;
      }
    }

    @keyframes tmr-kbtn-pop {
      0% {
        transform: scale(1);
      }
      25% {
        transform: scale(0.972);
      }
      60% {
        transform: scale(1.028);
      }
      100% {
        transform: scale(1);
      }
    }

    .tmr-kbtn {
      position: relative;
      display: inline-flex;
      align-items: center;
      height: 36px;
      min-width: 178px;
      max-width: 196px;
      padding: 0 7px 0 12px;
      border-radius: 12px;
      gap: 8px;
      overflow: hidden;
      isolation: isolate;
      cursor: pointer;
      user-select: none;
      transition: border-color 0.22s ease, box-shadow 0.22s ease, transform 0.15s ease, background-color 0.2s ease;
      box-sizing: border-box;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }

    .tmr-kbtn:hover .tmr-kbtn-label {
      color: var(--tmr-text-hover);
    }

    .tmr-kbtn:hover .tmr-kbtn-icon {
      opacity: 0.95;
    }

    .tmr-kbtn.is-hit {
      border-color: var(--tmr-accent) !important;
      box-shadow: 0 0 0 4px var(--tmr-accent-soft), var(--tmr-shadow) !important;
    }

    .tmr-kbtn.is-pop {
      animation: tmr-kbtn-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .tmr-kbtn-icon {
      flex-shrink: 0;
      opacity: 0.75;
      transition: transform 0.32s cubic-bezier(0.34, 1.8, 0.5, 1), opacity 0.2s ease;
    }

    .tmr-kbtn.is-hit .tmr-kbtn-icon {
      transform: rotate(-14deg) scale(1.14);
      opacity: 1;
    }

    .tmr-kbtn-label {
      flex: 1;
      font-size: 13.5px;
      font-weight: 550;
      letter-spacing: -0.015em;
      white-space: nowrap;
      transition: color 0.18s ease;
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
    }

    .tmr-kbtn-ks {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
      z-index: 2;
    }

    .tmr-key {
      position: relative;
      display: inline-flex;
      align-items: flex-start;
      justify-content: center;
      height: 24px;
      min-width: 23px;
      padding: 0;
      border: none;
      background: transparent;
      box-sizing: border-box;
      user-select: none;
    }

    .tmr-key.is-wide {
      min-width: 33px;
    }

    /* Đế phím 3D chịu lực phía dưới */
    .tmr-key::before {
      content: '';
      position: absolute;
      inset: 0;
      top: 2.5px;
      border-radius: 6.5px;
      background: var(--tmr-k-base);
      z-index: 1;
    }

    /* Nắp phím cơ nổi 3D phía trên */
    .tmr-key-top {
      position: relative;
      z-index: 2;
      height: 21.5px;
      width: 100%;
      min-width: inherit;
      border-radius: 6.5px;
      font-size: 11.5px;
      font-weight: 650;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--tmr-k-top);
      border: 1px solid var(--tmr-k-border);
      color: var(--tmr-k-text);
      box-shadow: var(--tmr-k-shadow);
      padding: 0 3px;
      box-sizing: border-box;
      letter-spacing: -0.02em;
      line-height: 1;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
      transition: transform 0.07s ease, color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
    }

    /* Trạng thái phím lún xuống khi nhấn */
    .tmr-key.is-down .tmr-key-top {
      transform: translateY(2.5px);
      color: var(--tmr-accent);
      border-color: var(--tmr-accent);
    }

    /* Trạng thái nảy lò xo về vị trí ban đầu */
    .tmr-key.is-up .tmr-key-top {
      transform: translateY(0);
      transition: transform 0.42s cubic-bezier(0.3, 1.9, 0.5, 1), color 0.18s ease, border-color 0.18s ease;
    }

    /* Trạng thái gợi ý nhún nhảy khi đang giữ phím modifier */
    .tmr-key.is-ask .tmr-key-top {
      animation: tmr-kbtn-ask 1s ease-in-out infinite;
      color: var(--tmr-accent);
      border-color: var(--tmr-accent);
    }

    /* Sóng gợn lan tỏa từ cụm phím ⌘K */
    .tmr-kbtn-rp {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle, var(--tmr-accent) 0%, transparent 72%);
      animation: tmr-kbtn-rp 0.75s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
      z-index: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      .tmr-kbtn.is-pop {
        animation: none !important;
      }
      .tmr-key.is-ask .tmr-key-top {
        animation: none !important;
      }
      .tmr-key-top {
        transition: none !important;
      }
      .tmr-kbtn-rp {
        display: none !important;
      }
      .tmr-kbtn-icon {
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

// Kiểm tra phím modifier phù hợp hệ điều hành (⌘ trên macOS/iOS, Ctrl trên Windows/Linux)
function getPlatformModifier(): { label: string; isWide: boolean } {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return { label: '⌘', isWide: false };
  }
  const ua = (navigator.userAgent || '').toUpperCase();
  const platform = (navigator.platform || '').toUpperCase();
  const isMac = platform.includes('MAC') || platform.includes('IPHONE') || platform.includes('IPAD') || ua.includes('MACINTOSH');
  return isMac ? { label: '⌘', isWide: false } : { label: 'Ctrl', isWide: true };
}

export const CommandTriggerButton = forwardRef<CommandTriggerButtonRef, CommandTriggerButtonProps>(({
  onPress,
  theme = DARK_THEME,
  isDesktop = true,
}, ref) => {
  useEffect(() => {
    ensureWebStylesInjected();
  }, []);

  const buttonRef = useRef<any>(null);
  const keysContainerRef = useRef<any>(null);
  const downAtRef = useRef<number>(0);
  const isHitTimerRef = useRef<any>(null);
  const isPopTimerRef = useRef<any>(null);

  const [isModDown, setIsModDown] = useState(false);
  const [isKDown, setIsKDown] = useState(false);
  const [isKAsk, setIsKAsk] = useState(false);
  const [isHit, setIsHit] = useState(false);
  const [isPop, setIsPop] = useState(false);

  const isDark = theme.mode === 'dark';
  const modifierInfo = getPlatformModifier();

  // Bộ token màu Lucian #471
  const tokens = isDark
    ? {
        bg: '#1E1F26',
        text: 'rgba(244, 240, 232, 0.68)',
        textHover: '#F4F0E8',
        border: 'rgba(255, 255, 255, 0.16)',
        shadow: '0 1px 2px rgba(0,0,0,.45), 0 10px 22px -16px rgba(0,0,0,.72)',
        accent: '#B7A4FF',
        accentSoft: 'rgba(183, 164, 255, 0.15)',
        kBase: '#08090E',
        kTop: 'linear-gradient(180deg, #2C2D3A, #22232E)',
        kBorder: 'rgba(255, 255, 255, 0.14)',
        kText: '#F4F0E8',
        kShadow: '0 1px 0 rgba(0, 0, 0, 0.35)',
      }
    : {
        bg: '#FFFFFF',
        text: '#57535F',
        textHover: '#16151B',
        border: 'rgba(22, 21, 27, 0.17)',
        shadow: '0 1px 2px rgba(40,30,80,.14), 0 10px 22px -16px rgba(40,30,80,.28)',
        accent: '#6A57F2',
        accentSoft: 'rgba(106, 87, 242, 0.12)',
        kBase: '#D6D2CA',
        kTop: 'linear-gradient(180deg, #FFFFFF, #F3F1EC)',
        kBorder: 'rgba(22, 21, 27, 0.14)',
        kText: '#16151B',
        kShadow: '0 1px 0 rgba(22, 21, 27, 0.06)',
      };

  // Kích hoạt hiệu ứng sóng gợn và va chạm nảy nút (answer)
  const runAnswerAnimation = useCallback(() => {
    if (Platform.OS === 'web') {
      const btnEl = (buttonRef.current?._node || buttonRef.current) as HTMLElement | null;
      const keysEl = (keysContainerRef.current?._node || keysContainerRef.current) as HTMLElement | null;

      if (btnEl) {
        // Tạo ripple xuất phát từ chính tâm cụm phím ⌘K
        try {
          const btnRect = btnEl.getBoundingClientRect();
          let spawnX = btnRect.width - 28;
          let spawnY = btnRect.height / 2;

          if (keysEl) {
            const keysRect = keysEl.getBoundingClientRect();
            spawnX = keysRect.left - btnRect.left + keysRect.width / 2;
            spawnY = keysRect.top - btnRect.top + keysRect.height / 2;
          }

          const ripple = document.createElement('span');
          ripple.className = 'tmr-kbtn-rp';
          ripple.style.left = `${spawnX}px`;
          ripple.style.top = `${spawnY}px`;
          btnEl.appendChild(ripple);

          setTimeout(() => {
            ripple.remove();
          }, 800);
        } catch {
          // Safe fallback
        }
      }
    }

    setIsHit(true);
    setIsPop(true);

    if (isHitTimerRef.current) clearTimeout(isHitTimerRef.current);
    if (isPopTimerRef.current) clearTimeout(isPopTimerRef.current);

    isHitTimerRef.current = setTimeout(() => setIsHit(false), 420);
    isPopTimerRef.current = setTimeout(() => setIsPop(false), 550);
  }, []);

  // Xử lý khi nhấn giữ chuột/touch
  const handlePointerDown = () => {
    downAtRef.current = Date.now();
    setIsModDown(true);
    setTimeout(() => {
      setIsKDown(true);
    }, 50);
  };

  // Xử lý khi nhả chuột/touch với thời gian giữ tối thiểu 150ms
  const handlePointerUpOrLeave = () => {
    const elapsed = Date.now() - downAtRef.current;
    const remaining = Math.max(0, 150 - elapsed);
    setTimeout(() => {
      setIsModDown(false);
      setIsKDown(false);
      setIsKAsk(false);
    }, remaining);
  };

  // Click vào nút
  const handleClick = () => {
    runAnswerAnimation();

    // Trễ rất nhẹ 100ms trên Web để mắt kịp thấy sóng ripple bung ra trước khi modal mở lên
    const isReduced = Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReduced) {
      onPress();
    } else {
      setTimeout(() => {
        onPress();
      }, 100);
    }
  };

  // Cung cấp Imperative Handle cho App.tsx đồng bộ phím tắt toàn cục
  useImperativeHandle(ref, () => ({
    triggerChord: () => {
      setIsModDown(true);
      setIsKDown(true);
      setIsKAsk(false);
      runAnswerAnimation();
      setTimeout(() => {
        setIsModDown(false);
        setIsKDown(false);
      }, 180);
    },
    setModifierDown: (down: boolean) => {
      setIsModDown(down);
      setIsKAsk(down);
      if (!down) {
        setIsKDown(false);
      }
    },
    reset: () => {
      setIsModDown(false);
      setIsKDown(false);
      setIsKAsk(false);
      setIsHit(false);
      setIsPop(false);
    },
  }));

  // Fallback gọn đẹp cho môi trường Native
  if (Platform.OS !== 'web') {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.nativeBtn,
          {
            backgroundColor: tokens.bg,
            borderColor: tokens.border,
          },
          pressed && { opacity: 0.8 },
        ]}
        onPress={onPress}
      >
        <Search size={14} color={tokens.text} />
        <Text style={[styles.nativeLabel, { color: tokens.text }]}>Tìm kiếm</Text>
        <View style={[styles.nativeKeyCaps, { backgroundColor: isDark ? '#2A2B38' : '#ECE8E1' }]}>
          <Text style={[styles.nativeKeyText, { color: tokens.kText }]}>⌘K</Text>
        </View>
      </Pressable>
    );
  }

  // Giao diện Web chuẩn Lucian #471
  const buttonClasses = [
    'tmr-kbtn',
    isHit ? 'is-hit' : '',
    isPop ? 'is-pop' : '',
  ].filter(Boolean).join(' ');

  const modKeyClasses = [
    'tmr-key',
    modifierInfo.isWide ? 'is-wide' : '',
    isModDown ? 'is-down' : 'is-up',
  ].filter(Boolean).join(' ');

  const kKeyClasses = [
    'tmr-key',
    isKDown ? 'is-down' : 'is-up',
    isKAsk && !isKDown ? 'is-ask' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={buttonRef}
      className={buttonClasses}
      style={{
        backgroundColor: tokens.bg,
        border: `1px solid ${tokens.border}`,
        boxShadow: tokens.shadow,
        ['--tmr-accent' as any]: tokens.accent,
        ['--tmr-accent-soft' as any]: tokens.accentSoft,
        ['--tmr-shadow' as any]: tokens.shadow,
        ['--tmr-text-hover' as any]: tokens.textHover,
        ['--tmr-k-base' as any]: tokens.kBase,
        ['--tmr-k-top' as any]: tokens.kTop,
        ['--tmr-k-border' as any]: tokens.kBorder,
        ['--tmr-k-text' as any]: tokens.kText,
        ['--tmr-k-shadow' as any]: tokens.kShadow,
      } as any}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrLeave}
      onPointerLeave={handlePointerUpOrLeave}
      onPointerCancel={handlePointerUpOrLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Tìm kiếm nội dung và lệnh nhanh (⌘K)"
    >
      {/* Kính lúp xoay nhẹ khi bấm */}
      <span className="tmr-kbtn-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
        <Search size={15} color={tokens.text} strokeWidth={2} />
      </span>

      {/* Nhãn chữ Tìm kiếm */}
      <span className="tmr-kbtn-label" style={{ color: tokens.text }}>
        Tìm kiếm
      </span>

      {/* Cụm 2 phím cơ 3D nổi bật: Modifier + K */}
      <div ref={keysContainerRef} className="tmr-kbtn-ks">
        <kbd className={modKeyClasses}>
          <span className="tmr-key-top">{modifierInfo.label}</span>
        </kbd>
        <kbd className={kKeyClasses}>
          <span className="tmr-key-top">K</span>
        </kbd>
      </div>
    </div>
  );
});

const styles = StyleSheet.create({
  nativeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  nativeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  nativeKeyCaps: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  nativeKeyText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
