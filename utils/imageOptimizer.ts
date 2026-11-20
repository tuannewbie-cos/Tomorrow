/**
 * Tomorrow v4.5.1 — Vision Lab Image Optimizer
 * macOS / Web Canvas Compressor:
 * Resizes images so the longest dimension <= 1024px,
 * converts to JPEG quality 0.82, reducing size by 60-80% for sub-second vision transfer
 * and token economy, while preserving high acuity for handwritten formulas & circuits.
 */

export interface OptimizedVisionImage {
  base64: string;
  mimeType: string;
  sizeKB: number;
  width?: number;
  height?: number;
}

/**
 * Safely compresses a File, Blob, or base64/dataURL string for Vision Lab.
 * Fallback gracefully if Canvas API is unavailable.
 */
export async function compressImageForVision(
  fileOrDataUrl: any,
  maxDimension = 1024,
  quality = 0.82
): Promise<OptimizedVisionImage> {
  // 1. Kiểm tra môi trường có hỗ trợ DOM & Canvas
  const hasCanvasSupport =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function';

  // 2. Chuyển đổi đầu vào thành Data URL
  const dataUrl = await toDataUrl(fileOrDataUrl);

  if (!hasCanvasSupport || !dataUrl.startsWith('data:image')) {
    const rawBase64 = cleanBase64(dataUrl);
    const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
    return {
      base64: rawBase64,
      mimeType: detectMimeType(dataUrl),
      sizeKB: Math.max(1, sizeKB),
    };
  }

  // 3. Tải ảnh vào đối tượng Image HTML để tính toán tỷ lệ thu phóng
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          let { width, height } = img;
          const longestSide = Math.max(width, height);

          // Thu phóng giữ nguyên tỷ lệ nếu cạnh dài vượt maxDimension (1024px)
          if (longestSide > maxDimension) {
            const scale = maxDimension / longestSide;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const rawBase64 = cleanBase64(dataUrl);
            const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
            return resolve({
              base64: rawBase64,
              mimeType: 'image/jpeg',
              sizeKB: Math.max(1, sizeKB),
              width: img.width,
              height: img.height,
            });
          }

          // Vẽ nền trắng chống trong suốt khi đổi PNG sang JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const compressedBase64 = cleanBase64(compressedDataUrl);
          const sizeKB = Math.round(((compressedBase64.length * 3) / 4) / 1024);

          resolve({
            base64: compressedBase64,
            mimeType: 'image/jpeg',
            sizeKB: Math.max(1, sizeKB),
            width,
            height,
          });
        } catch {
          // Fallback an toàn nếu canvas lỗi
          const rawBase64 = cleanBase64(dataUrl);
          const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
          resolve({
            base64: rawBase64,
            mimeType: 'image/jpeg',
            sizeKB: Math.max(1, sizeKB),
          });
        }
      };

      img.onerror = () => {
        const rawBase64 = cleanBase64(dataUrl);
        const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
        resolve({
          base64: rawBase64,
          mimeType: 'image/jpeg',
          sizeKB: Math.max(1, sizeKB),
        });
      };

      img.src = dataUrl;
    } catch {
      const rawBase64 = cleanBase64(dataUrl);
      const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
      resolve({
        base64: rawBase64,
        mimeType: 'image/jpeg',
        sizeKB: Math.max(1, sizeKB),
      });
    }
  });
}

/**
 * Trợ giúp chuyển File/Blob hoặc base64 thành Data URL
 */
async function toDataUrl(input: any): Promise<string> {
  if (typeof input === 'string') {
    if (input.startsWith('data:image')) return input;
    // Chuỗi base64 thuần
    return `data:image/jpeg;base64,${input}`;
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(input);
    });
  }

  return '';
}

/**
 * Loại bỏ prefix data:image/...;base64,
 */
export function cleanBase64(dataUrlOrBase64: string): string {
  if (!dataUrlOrBase64) return '';
  return dataUrlOrBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
}

/**
 * Nhận diện MIME type từ Data URL
 */
function detectMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}
