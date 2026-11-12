# 💙 Tomorrow — AI Bạn Tri Kỷ & Tâm Sự Như Con Người Thực Thụ

> **Phiên bản "Tomorrow - Ngày 1"**: Ứng dụng di động tâm sự và lắng nghe cảm xúc, sử dụng 100% **Gemini API Free Tier** với cơ chế Model Fallback Chain 3 tầng thông minh, phân tích phong cách cục bộ và giao diện Messenger Multi-Bubble tự nhiên như người thật gõ phím.

---

## ✨ Điểm Nổi Bật (Key Features - Phiên bản Tomorrow)

### 1. 🔄 Cơ Chế Xoay Vòng 3 Tầng Model Miễn Phí (Model Fallback Chain)
- **Tự động vượt hạn mức 15 lượt/phút (lỗi 429 & 503):** Chuyển đổi linh hoạt giữa 3 tầng model miễn phí trên cùng 1 API Key (`process.env.EXPO_PUBLIC_GEMINI_API_KEY`):
  1. **Tầng 1 (Chính - Bắt vibe và tâm lý tốt nhất):** `gemini-3.8-flash` (hoặc `gemini-2.5-flash`)
  2. **Tầng 2 (Dự phòng tốc độ cao - Bể quota độc lập):** `gemini-3.5-flash-lite` (hoặc `gemini-3.1-flash-lite`)
  3. **Tầng 3 (Dự phòng cuối - Mô hình mở tính quota riêng):** `gemma-4-31b-it`
- **Nhận diện Endpoint theo định dạng API Key:**
  - Nếu key bắt đầu bằng `AQ.`: Ưu tiên gọi qua `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${API_KEY}` (Vertex AI / Agent Studio) và tự động fallback sang `generativelanguage` nếu cần.
  - Nếu key bắt đầu bằng `AIza`: Gọi qua `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}` (Google AI Studio).
- **Timeout 10 giây & AbortController:** Mỗi lượt gọi đều được quản lý với thời gian chờ tối đa 10s. Nếu gặp mã `429`, `503`, `404` hoặc lỗi mạng, tự động `console.warn` và nhảy sang model tiếp theo ngay lập tức mà không gây gián đoạn hay báo lỗi lên màn hình người dùng.

### 2. ⚡ Bộ Phân Tích Phong Cách Cục Bộ (extractUserStyleLocal)
- Chạy trực tiếp trên thiết bị (zero latency & zero cost) để đo lường:
  - Có viết hoa đầu câu không
  - Có dùng từ viết tắt / teencode (`t, m, k, r, dc, ko, vl, :3`) không
  - Đo lường độ dài số lượng từ
- Đính kèm dòng gợi ý: `[Gợi ý style: giữ nguyên xưng hô, độ dài tương đương, viết thường/viết tắt giống user]` giúp các model tầng 2 và 3 vẫn nhại giọng cực kỳ tự nhiên.

### 3. 💬 Giao Diện Messenger Tinh Gọn & Hiệu Ứng Multi-Bubble
- **Tên hiển thị:** "Tomorrow" kèm huy hiệu trạng thái Online trực tiếp.
- **Placeholder ô nhập:** `"Nhắn cho Tomorrow..."`.
- **Hiệu ứng Multi-Bubble:** Tách câu trả lời thành từng bong bóng chat độc lập và xuất hiện lần lượt với độ trễ `350ms` giữa các câu để mô phỏng chính xác thao tác gõ từng dòng trên Messenger.
- **Dọn dẹp giao diện:** Đã gỡ bỏ badge "Mức độ: x/5", bỏ suggestion chips và tắt hoàn toàn tính năng tự động chèn meme chó Shiba sai lệch.

### 4. 🧠 Bộ Nhớ Ngữ Cảnh Dài Hạn (AsyncStorage)
- Đọc/ghi ngầm `USER_MEMORY_PROFILE_V1` và `CHAT_HISTORY_V1` vào `AsyncStorage`.
- Khi đóng/mở lại app hoặc kill app hoàn toàn, toàn bộ bối cảnh cuộc trò chuyện và thông tin người dùng vẫn được bảo toàn nguyên vẹn 100%.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Framework** | React Native (Expo SDK 58.0.0, Managed Workflow) |
| **Ngôn ngữ** | TypeScript (Strict mode) |
| **UI Components** | React Native Safe Area Context, Lucide Icons (`lucide-react-native`) |
| **Lưu trữ cục bộ** | `@react-native-async-storage/async-storage` (v2.2.0) |
| **Thư viện ảnh** | `expo-image-picker` (v58.0.10) |
| **AI Engine** | Google Gemini API (Free Tier: `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemma-4-31b-it`) |

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 1. Yêu cầu môi trường
- Node.js >= 18.x (khuyên dùng Node 20+)
- npm hoặc yarn
- Ứng dụng **Expo Go** trên điện thoại iOS / Android

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình biến môi trường (`.env`)
Tạo file `.env` ở thư mục gốc:
```env
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Khởi chạy ứng dụng
```bash
npx expo start
```
Quét mã QR bằng Expo Go trên điện thoại để trải nghiệm trò chuyện mượt mà cùng Tomorrow!

---

## 📄 Bản Quyền & Giấy Phép
Dự án được xây dựng với mục tiêu phi lợi nhuận nhằm hỗ trợ chăm sóc sức khỏe tinh thần cho cộng đồng giới trẻ.
