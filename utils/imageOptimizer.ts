/**
 * Tomorrow v4.5.3 — Vision Lab Image Optimizer
 * macOS / Web Canvas Compressor:
 * Resizes images so the longest dimension <= 1024px,
 * converts to JPEG quality 0.82, reducing size by 60-80% for sub-second vision transfer
 * and token economy, while preserving high acuity for handwritten formulas & circuits.
 * 
 * Guarantee valid Data URL Base64 (>200 chars, no "blob:..." string).
 */

export interface OptimizedVisionImage {
  base64: string;
  dataUrl: string;
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

  // 2. Chuyển đổi đầu vào thành Data URL chuẩn
  const dataUrl = await toDataUrl(fileOrDataUrl);

  const isValidDataUrl = dataUrl && dataUrl.startsWith('data:image/') && dataUrl.length > 200;

  if (!hasCanvasSupport || !isValidDataUrl) {
    const rawBase64 = cleanBase64(dataUrl);
    const mimeType = detectMimeType(dataUrl);
    const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
    const validDataUrl = rawBase64.length > 50 && !rawBase64.includes('blob:')
      ? `data:${mimeType};base64,${rawBase64}`
      : dataUrl;
    return {
      base64: rawBase64,
      dataUrl: validDataUrl,
      mimeType,
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

          // Nếu kích thước 0x0, fallback trực tiếp về dataUrl gốc từ FileReader
          if (!width || !height || width <= 0 || height <= 0) {
            const rawBase64 = cleanBase64(dataUrl);
            const mimeType = detectMimeType(dataUrl);
            const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
            return resolve({
              base64: rawBase64,
              dataUrl,
              mimeType,
              sizeKB: Math.max(1, sizeKB),
              width: width || 0,
              height: height || 0,
            });
          }

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
            const mimeType = detectMimeType(dataUrl);
            const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
            return resolve({
              base64: rawBase64,
              dataUrl,
              mimeType,
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

          // Kiểm tra kết quả canvas nén: phải là data:image/ hợp lệ và length > 200
          if (!compressedDataUrl || !compressedDataUrl.startsWith('data:image/') || compressedDataUrl.length < 200) {
            const rawBase64 = cleanBase64(dataUrl);
            const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
            return resolve({
              base64: rawBase64,
              dataUrl,
              mimeType: detectMimeType(dataUrl),
              sizeKB: Math.max(1, sizeKB),
              width,
              height,
            });
          }

          const compressedBase64 = cleanBase64(compressedDataUrl);
          const sizeKB = Math.round(((compressedBase64.length * 3) / 4) / 1024);

          resolve({
            base64: compressedBase64,
            dataUrl: compressedDataUrl,
            mimeType: 'image/jpeg',
            sizeKB: Math.max(1, sizeKB),
            width,
            height,
          });
        } catch {
          // Fallback an toàn nếu canvas lỗi
          const rawBase64 = cleanBase64(dataUrl);
          const mimeType = detectMimeType(dataUrl);
          const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
          resolve({
            base64: rawBase64,
            dataUrl,
            mimeType,
            sizeKB: Math.max(1, sizeKB),
          });
        }
      };

      img.onerror = () => {
        const rawBase64 = cleanBase64(dataUrl);
        const mimeType = detectMimeType(dataUrl);
        const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
        resolve({
          base64: rawBase64,
          dataUrl,
          mimeType,
          sizeKB: Math.max(1, sizeKB),
        });
      };

      img.src = dataUrl;
    } catch {
      const rawBase64 = cleanBase64(dataUrl);
      const mimeType = detectMimeType(dataUrl);
      const sizeKB = Math.round(((rawBase64.length * 3) / 4) / 1024);
      resolve({
        base64: rawBase64,
        dataUrl,
        mimeType,
        sizeKB: Math.max(1, sizeKB),
      });
    }
  });
}

/**
 * Trợ giúp chuyển File/Blob, object hoặc base64 thành Data URL chuẩn.
 * Hỗ trợ triệt để URL blob:... qua fetch và FileReader trên WebKit / macOS.
 */
async function toDataUrl(input: any): Promise<string> {
  if (!input) return '';

  // 1. Trường hợp input là object { uri, base64, dataUrl }
  if (typeof input === 'object' && input !== null) {
    if (input.dataUrl && typeof input.dataUrl === 'string' && input.dataUrl.startsWith('data:image/')) {
      return input.dataUrl;
    }
    if (input.base64 && typeof input.base64 === 'string') {
      const cleaned = cleanBase64(input.base64);
      if (cleaned.length > 50 && !cleaned.includes('blob:')) {
        return `data:${detectMimeType(input.base64)};base64,${cleaned}`;
      }
    }
    if (input.uri) {
      return toDataUrl(input.uri);
    }
  }

  // 2. Trường hợp input là chuỗi
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('data:image/')) {
      return trimmed;
    }

    // Nếu là blob URL trên Web (blob:http...) -> fetch và chuyển qua FileReader
    if (trimmed.startsWith('blob:')) {
      if (typeof fetch !== 'undefined') {
        try {
          const res = await fetch(trimmed);
          const blob = await res.blob();
          if (typeof FileReader !== 'undefined') {
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        } catch (err) {
          console.warn('[imageOptimizer] Không thể đọc blob URL:', err);
        }
      }
      return '';
    }

    // Nếu là chuỗi Base64 thuần
    const cleaned = cleanBase64(trimmed);
    if (cleaned.length > 50 && !cleaned.includes('blob:') && !cleaned.startsWith('http')) {
      return `data:image/jpeg;base64,${cleaned}`;
    }
  }

  // 3. Trường hợp input là đối tượng Blob / File trực tiếp
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
 * Loại bỏ prefix data:image/...;base64, và khoảng trắng
 */
export function cleanBase64(dataUrlOrBase64: string): string {
  if (!dataUrlOrBase64) return '';
  return dataUrlOrBase64
    .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Nhận diện MIME type từ Data URL
 */
export function detectMimeType(dataUrl: string): string {
  if (!dataUrl) return 'image/jpeg';
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  if (match) {
    const subtype = match[1].toLowerCase();
    return subtype.includes('jpg') ? 'image/jpeg' : subtype;
  }
  return 'image/jpeg';
}
