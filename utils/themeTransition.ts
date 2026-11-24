import { Platform } from 'react-native';

/**
 * UTILS/THEMETRANSITION.TS
 * Engine chuyển Theme Sáng ↔ Tối dạng Sóng Tròn (Circular Radial Wave)
 * Sử dụng View Transitions API + CSS clip-path + Lớp viền sóng mềm 60fps
 * Hỗ trợ fallback an toàn khi trình duyệt không hỗ trợ hoặc bật prefers-reduced-motion.
 */

let activeTransition: any = null;
let activeRimEl: HTMLElement | null = null;

/**
 * Inject CSS View Transition chuẩn cho Web
 * Tắt cross-fade mặc định, đặt z-index chuẩn và định nghĩa lớp viền sóng mềm
 */
export function injectThemeTransitionStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('tmr-theme-transition-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'tmr-theme-transition-styles';
  styleEl.innerHTML = `
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation: none !important;
      mix-blend-mode: normal !important;
    }
    ::view-transition-old(root) {
      z-index: 1 !important;
    }
    ::view-transition-new(root) {
      z-index: 9999 !important;
    }
    .tmr-theme-wave-rim {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      border-radius: 50%;
      will-change: transform, opacity;
    }
    html.tmr-theme-in-transition,
    html.tmr-theme-in-transition *,
    html.tmr-theme-in-transition *::before,
    html.tmr-theme-in-transition *::after {
      transition: none !important;
    }
  `;
  document.head.appendChild(styleEl);
}

/**
 * Thực thi hoạt ảnh sóng tròn View Transition khi đổi Theme Sáng ↔ Tối
 * @param nextTheme Theme đích: 'light' hoặc 'dark'
 * @param applyThemeSync Callback đồng bộ React state (bọc trong flushSync)
 * @param origin Tọa độ tâm lan tỏa { x, y } (mặc định góc trên bên phải)
 */
export function runCircularThemeTransition(
  nextTheme: 'light' | 'dark',
  applyThemeSync: () => void,
  origin?: { x: number; y: number }
): void {
  // Đảm bảo CSS View Transition đã được nạp
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    injectThemeTransitionStyles();
  }

  // Fallback an toàn cho Mobile Native hoặc môi trường không hỗ trợ document.startViewTransition
  if (
    Platform.OS !== 'web' ||
    typeof document === 'undefined' ||
    typeof (document as any).startViewTransition !== 'function'
  ) {
    applyThemeSync();
    return;
  }

  // Tọa độ tâm lan tỏa (mặc định góc trên bên phải cửa sổ: x = window.innerWidth - 36, y = 28)
  const x =
    origin?.x ??
    (typeof window !== 'undefined' ? Math.max(window.innerWidth - 36, 0) : 0);
  const y = origin?.y ?? 28;

  // Tính bán kính bao phủ trọn vẹn màn hình từ tâm (x, y)
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const endRadius =
    Math.hypot(Math.max(x, maxW - x), Math.max(y, maxH - y)) + 24;

  // Kiểm tra prefers-reduced-motion: reduce
  const isReduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isReduced) {
    try {
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      const bg = nextTheme === 'dark' ? '#171717' : '#FFFFFF';
      document.body.style.backgroundColor = bg;
      document.documentElement.style.backgroundColor = bg;
      applyThemeSync();
    } catch {
      applyThemeSync();
    }
    return;
  }

  // Chống kẹt khi nhấn Cmd+R liên tục: dọn sạch transition và rim đang chạy dở
  if (activeTransition) {
    try {
      if (typeof activeTransition.skipTransition === 'function') {
        activeTransition.skipTransition();
      }
    } catch {}
    activeTransition = null;
  }
  if (activeRimEl) {
    try {
      activeRimEl.remove();
    } catch {}
    activeRimEl = null;
  }

  const cleanup = () => {
    try {
      document.documentElement.classList.remove('tmr-theme-in-transition');
    } catch {}
    if (activeRimEl) {
      try {
        activeRimEl.remove();
      } catch {}
      activeRimEl = null;
    }
    activeTransition = null;
  };

  try {
    document.documentElement.classList.add('tmr-theme-in-transition');

    const transition = (document as any).startViewTransition(() => {
      // 1. Đồng bộ thuộc tính gốc tức thì trước khi trình duyệt chụp khung hình mới
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      const bg = nextTheme === 'dark' ? '#171717' : '#FFFFFF';
      document.body.style.backgroundColor = bg;
      document.documentElement.style.backgroundColor = bg;

      // 2. Ép React commit DOM ngay lập tức bằng applyThemeSync (chứa flushSync)
      applyThemeSync();
    });

    activeTransition = transition;

    if (transition && transition.ready) {
      transition.ready
        .then(() => {
          // A. Animation mở rộng hình tròn clip-path trên ::view-transition-new(root)
          try {
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
              },
              {
                duration: 600,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                pseudoElement: '::view-transition-new(root)',
              }
            );
          } catch (animErr) {
            console.warn('[ThemeTransition] ClipPath animate error:', animErr);
          }

          // B. Tạo lớp viền sóng mềm đồng bộ .tmr-theme-wave-rim
          try {
            const rim = document.createElement('div');
            rim.className = 'tmr-theme-wave-rim';
            const isLightNext = nextTheme === 'light';
            rim.style.left = `${x}px`;
            rim.style.top = `${y}px`;
            rim.style.width = `${endRadius * 2}px`;
            rim.style.height = `${endRadius * 2}px`;
            rim.style.marginLeft = `-${endRadius}px`;
            rim.style.marginTop = `-${endRadius}px`;
            rim.style.boxShadow = isLightNext
              ? '0 0 50px 10px rgba(255, 255, 255, 0.45), inset 0 0 40px 10px rgba(255, 255, 255, 0.25)'
              : '0 0 50px 10px rgba(0, 0, 0, 0.45), inset 0 0 40px 10px rgba(0, 0, 0, 0.25)';
            rim.style.filter = 'blur(16px)';
            rim.style.border = isLightNext
              ? '1px solid rgba(255, 255, 255, 0.6)'
              : '1px solid rgba(255, 255, 255, 0.15)';

            document.body.appendChild(rim);
            activeRimEl = rim;

            const rimAnim = rim.animate(
              [
                { transform: 'scale(0)', opacity: 0.95 },
                { transform: 'scale(1)', opacity: 0 },
              ],
              {
                duration: 600,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'forwards',
              }
            );

            rimAnim.onfinish = () => {
              if (activeRimEl === rim) {
                try {
                  rim.remove();
                } catch {}
                activeRimEl = null;
              }
            };
          } catch (rimErr) {
            console.warn('[ThemeTransition] Rim animate error:', rimErr);
          }
        })
        .catch((readyErr: any) => {
          console.warn('[ThemeTransition] ready error:', readyErr);
        });
    }

    if (transition && transition.finished) {
      transition.finished
        .then(() => {
          cleanup();
        })
        .catch(() => {
          cleanup();
        });
    } else {
      setTimeout(cleanup, 620);
    }
  } catch (err) {
    console.warn('[ThemeTransition] View transition error:', err);
    cleanup();
    applyThemeSync();
  }
}
