# 💜 SoulMate GenZ — AI Bạn Tri Kỷ & Chữa Lành Tâm Lý

> **Dự án ứng dụng di động hỗ trợ sức khỏe tinh thần cho giới trẻ Gen Z**, kết hợp chuyên môn tâm lý học đường với phong cách trò chuyện gần gũi, dí dỏm chuẩn văn hóa mạng xã hội (TikTok, Threads). Ứng dụng tích hợp mô hình ngôn ngữ lớn đa phương thức (Multimodal AI), nhận diện cảm xúc thời gian thực và lưu trữ ngữ cảnh dài hạn chống sập khi đóng ứng dụng.

---

## ✨ Điểm Nổi Bật (Key Features)

### 1. 🧠 Bộ Nhớ Ngữ Cảnh Dài Hạn (Cold Start & Kill-App Resilience)
- **Lưu trữ tức thì qua AsyncStorage:** Mọi cuộc hội thoại và hồ sơ tâm lý người dùng (`CHAT_HISTORY_V1`, `USER_MEMORY_PROFILE_V1`) được đồng bộ liên tục.
- **Không nháy trắng (Zero White-Flash):** Khi mở lại app (kể cả sau khi kill app hoàn toàn), hệ thống nạp dữ liệu song song trước khi ẩn Splash Screen.
- **Lời chào thông minh theo ngữ cảnh cũ:**
  - Nếu là người mới: *"Chào đằng ấy, hôm nay tâm trạng thế nào?"*
  - Nếu đã từng chia sẻ: AI tự động nhớ và hỏi thăm lại vấn đề cũ (VD: *"Chào bro, vụ deadline hôm qua đỡ căng chưa hay vẫn đang overthinking đấy?"*).

### 2. 🎭 Vibe Gen Z Thực Thụ & Nhận Diện Cảm Xúc Thời Gian Thực
- **Linh hoạt tuyệt đối:** Chuyển đổi mượt mà giữa chế độ an ủi, lắng nghe chân thành khi người dùng khủng hoảng/áp lực, và chế độ tấu hài, bắt trend TikTok khi người dùng trêu đùa/gửi meme.
- **Badge Cảm Xúc:** Mỗi câu trả lời của AI đều gắn kèm huy hiệu phân tích cảm xúc (VD: `😟 Overthinking 🌀 - Mức độ: 4/5` hoặc `😂 Tự luyến tấu hài - Mức độ: 5/5`).
- **Gợi ý phản hồi nhanh (Suggested Replies):** Tự động sinh các chip phản hồi (ví dụ: `💬 Bắt bài nhanh vậy bà zà! 🤣`) để người dùng tương tác chỉ bằng một chạm.

### 3. 🖼️ Đa Phương Thức (AI Vision & Meme Gen Z)
- **Hỗ trợ gửi ảnh:** Người dùng có thể đính kèm ảnh bài kiểm tra, tin nhắn crush, hoặc ảnh chụp màn hình; AI Vision sẽ phân tích chi tiết hình ảnh và đưa ra lời bình đồng điệu.
- **Kho Meme Nội Bộ (`MEME_LIBRARY`):** Tự động render các meme kinh điển tương ứng với cảm xúc (IShowSpeed hoang mang `speed_wtf`, mèo khóc `crying_cat`, gấu ôm `warm_hug`, Doge cà khịa `doge_cheer`).

### 4. 🛡️ Cơ Chế Xoay Vòng Multi-Key & Multi-Model Fallback
- Tự động xoay vòng qua danh sách API Key và các model thế hệ mới nhất của Google (`gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.6-flash`).
- Hỗ trợ chuyển tiếp sang Groq (`llama-3.3-70b-versatile`) và OpenAI (`gpt-4o-mini`).
- **Resilient Cognitive Mock Engine:** Trong trường hợp mất kết nối mạng hoàn toàn hoặc hết quota toàn bộ key, bộ suy luận cục bộ vẫn hoạt động ổn định, đảm bảo ứng dụng không bao giờ bị gián đoạn hay crash.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Framework** | React Native (Expo SDK 58.0.0, Managed Workflow) |
| **Ngôn ngữ** | TypeScript (Strict mode) |
| **UI Components** | React Native Safe Area Context, Expo Linear Gradient, Lucide Icons |
| **Lưu trữ cục bộ** | `@react-native-async-storage/async-storage` (v2.2.0) |
| **Thư viện ảnh** | `expo-image-picker` (v58.0.10) |
| **AI Engine** | Google Generative AI REST API (Gemini 3.x Flash Multimodal) |
| **Build & Deploy** | EAS Build (`eas.json` cấu hình sẵn APK Android & iOS) |

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 1. Yêu cầu môi trường
- Node.js >= 18.x (khuyên dùng Node 20+)
- npm hoặc yarn
- Ứng dụng **Expo Go** trên điện thoại (iOS / Android)

### 2. Cài đặt dependencies
```bash
git clone https://github.com/tuannewbie-cos/mental-health.git
cd mental-health
npm install --legacy-peer-deps
```

### 3. Cấu hình biến môi trường
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Điền khóa API của bạn vào file `.env`:
```env
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Khởi chạy ứng dụng
```bash
npx expo start
```
- Mở **Camera** (trên iPhone) hoặc ứng dụng **Expo Go** (trên Android) và quét mã QR trên terminal để trải nghiệm.

### 5. Build file APK độc lập qua EAS Build
```bash
npx eas-cli build -p android --profile preview
```

---

## 📁 Cấu Trúc Thư Mục

```text
mental-health/
├── app.json                  # Cấu hình Expo SDK 58 & quyền truy cập Media
├── eas.json                  # Cấu hình build APK Android & iOS qua EAS
├── package.json              # Quản lý dependencies dự án
├── tsconfig.json             # Cấu hình TypeScript Strict Mode
├── App.tsx                   # Điểm khởi chạy gốc & khôi phục AsyncStorage
├── types/
│   └── chat.ts               # Interface TypeScript (ChatMessage, EmotionData, MemoryProfile)
├── constants/
│   └── memes.ts              # Kho từ điển MEME_LIBRARY Gen Z
├── storage/
│   └── chatStorage.ts        # Quản lý AsyncStorage bền vững (Kill-app resilience)
├── services/
│   └── aiService.ts          # SYSTEM_INSTRUCTION & Multi-Key Multi-Model Fallback Engine
└── components/
    ├── ChatBubble.tsx        # Bong bóng chat kèm Badge Cảm xúc & Meme reaction
    ├── ColdGreeting.tsx      # Lời chào Gradient Gemini + Suggestion Chips
    ├── FloatingInputBar.tsx  # Thanh nhập nổi (chọn ảnh, emoji, text đa dòng)
    └── SidebarDrawer.tsx     # Quản lý phiên tâm sự & theo dõi bộ nhớ AI
```

---

## 🗺️ Lộ Trình Phát Triển Dài Hạn (Roadmap)

- [x] Giao diện chuẩn Google Gemini Dark Mode (`#131314` & `#1E1F20`).
- [x] Khôi phục ngữ cảnh sau khi kill app hoàn toàn với AsyncStorage.
- [x] Nhận diện cảm xúc thời gian thực kèm Badge Cảm Xúc & Suggested Replies.
- [x] Hỗ trợ AI Vision đọc ảnh và phản hồi Meme Gen Z.
- [ ] **Gửi tin nhắn thoại (Voice Notes & Speech-to-Text):** Cho phép người dùng nói chuyện trực tiếp với AI khi quá mệt mỏi không muốn gõ chữ.
- [ ] **Nhật ký cảm xúc (Mood Tracker & Analytics):** Biểu đồ theo dõi tâm trạng theo tuần/tháng.
- [ ] **Góc chia sẻ ẩn danh (Safe Space Community):** Không gian kết nối người dùng có cùng nỗi niềm.
- [ ] **Bài tập thở & Âm thanh chữa lành (Soundscapes / White Noise):** Tích hợp âm thanh mưa rơi, sóng biển giúp ngủ ngon.

---

## 📄 Bản Quyền & Giấy Phép
Dự án được xây dựng với mục tiêu phi lợi nhuận nhằm hỗ trợ chăm sóc sức khỏe tinh thần cho cộng đồng trẻ em và thanh thiếu niên.
MIT License © 2026 SoulMate GenZ Team.
