import { Platform } from 'react-native';

export function injectWebFonts() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  if (!document.getElementById('tomorrow-web-fonts-preconnect-1')) {
    const fontPreconnect1 = document.createElement('link');
    fontPreconnect1.id = 'tomorrow-web-fonts-preconnect-1';
    fontPreconnect1.rel = 'preconnect';
    fontPreconnect1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(fontPreconnect1);
  }

  if (!document.getElementById('tomorrow-web-fonts-preconnect-2')) {
    const fontPreconnect2 = document.createElement('link');
    fontPreconnect2.id = 'tomorrow-web-fonts-preconnect-2';
    fontPreconnect2.rel = 'preconnect';
    fontPreconnect2.href = 'https://fonts.gstatic.com';
    fontPreconnect2.crossOrigin = 'anonymous';
    document.head.appendChild(fontPreconnect2);
  }

  if (!document.getElementById('tomorrow-web-fonts')) {
    const fontLink = document.createElement('link');
    fontLink.id = 'tomorrow-web-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(fontLink);
  }

  if (!document.getElementById('tomorrow-global-retina-typography')) {
    const globalStyle = document.createElement('style');
    globalStyle.id = 'tomorrow-global-retina-typography';
    globalStyle.innerHTML = `
      html, body, #root {
        height: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        scroll-behavior: smooth !important;
      }
      body, input, textarea, button {
        font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif !important;
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
        text-rendering: optimizeLegibility !important;
      }
      * {
        font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif !important;
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
      }
      /* macOS Slim Scrollbar */
      ::-webkit-scrollbar {
        width: 6px !important;
        height: 6px !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.25) !important;
        border-radius: 999px !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(148, 163, 184, 0.45) !important;
      }
    `;
    document.head.appendChild(globalStyle);
  }
}
