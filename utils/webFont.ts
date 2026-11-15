import { Platform } from 'react-native';

export function injectWebFonts() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  if (document.getElementById('tomorrow-web-fonts')) return;

  const fontPreconnect1 = document.createElement('link');
  fontPreconnect1.rel = 'preconnect';
  fontPreconnect1.href = 'https://fonts.googleapis.com';
  document.head.appendChild(fontPreconnect1);

  const fontPreconnect2 = document.createElement('link');
  fontPreconnect2.rel = 'preconnect';
  fontPreconnect2.href = 'https://fonts.gstatic.com';
  fontPreconnect2.crossOrigin = 'anonymous';
  document.head.appendChild(fontPreconnect2);

  const fontLink = document.createElement('link');
  fontLink.id = 'tomorrow-web-fonts';
  fontLink.rel = 'stylesheet';
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(fontLink);

  const globalStyle = document.createElement('style');
  globalStyle.id = 'tomorrow-global-typography';
  globalStyle.innerHTML = `
    html, body, #root {
      height: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
    }
    * {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
    }
  `;
  document.head.appendChild(globalStyle);
}
