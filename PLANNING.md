# TOMORROW (PROTO-JARVIS) — 90-DAY EXECUTION ROADMAP & STATUS TRACKER
> **File quy chuẩn:** `PLANNING.md` | **Phiên bản hiện tại:** `v4.5.1` | **Trạng thái:** Hoạt động ổn định trên macOS & Vercel Web

Tài liệu này theo dõi toàn bộ tiến trình phát triển 90 ngày của dự án **Tomorrow (Proto-Jarvis)**, bảo đảm mọi phiên làm việc duy trì tính nhất quán kiến trúc, không suy giảm hiệu năng và bám sát lộ trình từ Core Chatbot đến Trợ lý Cá nhân AI Đa phương tiện thế hệ mới.

---

## 1. TỔNG QUAN DỰ ÁN & KIẾN TRÚC MỤC TIÊU
- **Tên dự án:** Tomorrow (Proto-Jarvis)
- **Môi trường hoạt động:** macOS (`/Applications/Tomorrow.app` qua Expo Web & WebKit Wrapper) đồng bộ Vercel Serverless Proxy.
- **Tech Stack:** React Native (Expo SDK, TypeScript strict mode), NativeWind / React Native StyleSheets, AsyncStorage, Vercel Serverless Functions (`/api/search.js`), Gemini API & OpenAI API.
- **Quy tắc bảo toàn kiến trúc:** Bắt buộc tuân thủ [.antigravity/rules.md](file:///.antigravity/rules.md) (và đồng bộ tại [.cursorrules](file:///.cursorrules), [SKILL.md](file:///SKILL.md)).

---

## 2. BẢNG TIẾN ĐỘ TỔNG QUAN (90 NGÀY - 6 GIAI ĐOẠN)

| Giai đoạn | Nội dung trọng tâm | Thời gian | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Core Foundation, 3-Layer Reflex, Quota Shield & Vision Lab** | Ngày 1 – 15 | 🟡 Đang hoàn thiện (Ngày 1-9 Xong, v4.5.1 Xong) |
| **Phase 2** | **Tri thức Chuyên sâu, Khoa học & Thị trường** | Ngày 16 – 30 | ⚪ Chưa bắt đầu |
| **Phase 3** | **Voice HUD, Realtime Waveform & Voiceprint** | Ngày 31 – 45 | ⚪ Chưa bắt đầu |
| **Phase 4** | **Camera MediaPipe Nội bộ (100% Private RAM)** | Ngày 46 – 60 | ⚪ Chưa bắt đầu |
| **Phase 5** | **Autonomous Local Memory & Knowledge Synthesis** | Ngày 61 – 75 | ⚪ Chưa bắt đầu |
| **Phase 6** | **Multi-Provider Gateway & Desktop Native Matrix** | Ngày 76 – 90 | ⚪ Đã khởi tạo cổng nền tảng `types/providers.ts` |

---

## 3. CHI TIẾT TRẠNG THÁI TỪNG GIAI ĐOẠN

### GIAI ĐOẠN 1: CORE FOUNDATION & BỘ NÃO PHẢN XẠ 3 LỚP (NGÀY 1 – 15)

#### ✅ Đã hoàn thành (Ngày 1 đến Ngày 3 + Nâng cấp vượt cấp v3.8 / v3.9):
- [x] **Core UI & Navigation:**
  - Layout Split-View tối ưu cho macOS Desktop (`width >= 768px`, Sidebar `280px`) và Mobile Drawer.
  - Đồng bộ kép giữa `App.tsx` và `components/SidebarDrawer.tsx` (nút New Chat `+`, hàm lọc tiêu đề `isPlaceholderOrNoiseTitle`).
  - Giao diện Dark/Light mode thích ứng, phông chữ `Plus Jakarta Sans` / `Inter` chuẩn Retina.
- [x] **Lưu trữ Cục bộ Bền vững (AsyncStorage):**
  - Khóa `CHAT_SESSIONS_V2`: Lịch sử các phiên hội thoại kèm lọc tiêu đề rác tự động.
  - Khóa `USER_MEMORY_PROFILE_V1`: `UserMemoryVault` lưu đa chiều (đại từ, sở thích, dự án, thói quen).
  - Khóa `TOMORROW_THEME_MODE`: Quản lý theme độc lập.
- [x] **Bộ não Phản xạ 3 Lớp (3-Layer Reflex Brain) trong `services/aiService.ts`:**
  - **Lớp 1 (Local Reflex):** Hàm `buildLocalReflexDirective` nhận diện tín hiệu 0ms:
    + `STOP_SIGNAL` (`okk`, `sybau`, `cook`, `cút`, `pp`): Trả lời 1 bong bóng <= 4 chữ, cấm hỏi lại.
    + `PING` (`yo`, `ê`, `hello`): 1-2 bong bóng ngắn, không đổi tiêu đề rác.
    + `WEB_INTEL`: Quét và đưa nguồn thật kèm URL trực tiếp, 0% hứa suông câu giờ.
    + `EXPERT_JARVIS` & `CASUAL_FRIEND`: Chuyển đổi linh hoạt giữa trí tuệ kỹ thuật sâu và trò chuyện tự nhiên.
  - **Luật Đại từ:** Khóa cứng `t - m` khi người dùng xưng hô, triệt tiêu 100% từ `"bro"` tự ý.
  - **Lớp 2 (Memory Vault Context):** Tối ưu giới hạn 5 mục/mảng, token budget < 120 tokens.
  - **Lớp 3 (System Prompt Tinh gọn):** Dưới 450 từ kèm 6 Few-Shot chuẩn.
- [x] **Web Search Grounding & Serverless Proxy:**
  - Route `/api/search.js` chạy trên Vercel Serverless Function, tích hợp fallback chống timeout.
  - Xử lý xung đột Gemini API giữa grounding search và `responseMimeType: "application/json"`.
- [x] **Bộ Tự Luyện & Kiểm Chứng Tự Động (`train_simulator.js`):**
  - Đạt 8/8 kịch bản kiểm thử (Pronoun, Stop Signal, Web No Stalling, Memory Recall, Title Clean, Jarvis Expert, Jarvis No Web Trigger, Emotional Empathy).
  - Đánh dấu phiên bản kiểm chứng: `Online • v3.9` trên Header.

---

#### 🎯 Các bước nâng cấp đã hoàn thành:

- [x] **Ngày 4: `perf/hybrid-ai-router` (Tomorrow v4.0 - Hybrid AI Router, 7s OpenAI Timeout & Silent Circuit Breaker)**
  - Tích hợp chuỗi xoay vòng Model tự động:
    1. Ưu tiên `callOpenAI` (`gpt-4o-mini`, max_tokens: 250, timeout cứng 7000ms AbortController).
    2. Tự động kích hoạt mạch ngắt `isOpenAIUnavailable = true` khi gặp lỗi 401/402/403/429 mà không văng lỗi đỏ ra UI.
    3. Chuyển ngầm sang chuỗi 3 tầng Gemini: `gemini-3.8-flash` / `gemini-2.5-flash` -> `gemini-3.5-flash-lite` -> `gemma-4-31b-it`.
  - Bộ Auto-Repair JSON vá chuỗi JSON cắt cụt 250 tokens thành công 100%.

- [x] **Ngày 5: `feat/streaming` (Tomorrow v4.1 - Real-time Streaming Response & Smart Multi-Bubble Sequencing)**
  - Kích hoạt stream dữ liệu từng phần qua `ReadableStream` (`res.body.getReader()`) với TextDecoder cho cả OpenAI (`stream: true`) và Gemini.
  - Bộ phân tích cú pháp an toàn `safeParseAIJson` tự động trích xuất cấu trúc dữ liệu hoàn chỉnh.
  - Cơ chế tách bong bóng thông minh (Multi-Bubble Sequencing) trong `App.tsx`: hiển thị câu đầu tức thì, các câu tiếp theo xuất hiện theo nhịp người gõ với độ trễ tối ưu `300ms - 450ms` (`Math.min(Math.max(replyText.length * 8, 300), 450)`).
  - Duy trì bong bóng chờ gõ (`• • •` / `TypingIndicator`) giữa các nhịp bong bóng như người thật gõ phím trên Messenger.
  - Cập nhật phiên bản Header: `Online • v4.1`. Hoàn thành bộ kiểm thử 19/19 tiêu chí và simulator 8/8 kịch bản.

- [x] **Ngày 6: `ui/rich-markdown-and-code` (Tomorrow v4.2 - Rich Markdown Engine, 1-Click Copy Code/Table HUD, Scientific Math Formatter & Dynamic Token Budgeting)**
  - Cơ chế cấp phát Token & Timeout động (`dynamicMaxTokens`: 250 tokens / 7s cho chat ngắn, 1200 tokens / 12s cho `EXPERT_JARVIS` / `WEB_INTEL` / code blocks / bảng biểu).
  - Bộ ghép nối an toàn `sanitizeAndMergeBrokenBlocks` bảo vệ 100% khối code không bao giờ bị cắt cụt hay gãy đôi sang hai bong bóng khác nhau.
  - Bộ Render Rich Markdown tự chủ `RichMarkdownView.tsx` thuần TypeScript/React Native:
    + Khung Code macOS Terminal (3 chấm tròn macOS, nhãn ngôn ngữ + số dòng, cuộn ngang, syntax highlighting, số dòng mờ).
    + Nút Copy 1 chạm cho khối code (`📋 Sao chép` -> `✓ Đã chép` trong 2000ms).
    + Bảng biểu Grid chuẩn Markdown kèm nút `📋 Copy bảng` xuất dữ liệu TSV dán ngay vào Excel, Google Sheets, Notion.
    + Bộ định dạng toán học LaTeX Unicode (`convertLatexToUnicode`) hiển thị công thức sắc nét cho cả khối `$$...$$` (hộp căn giữa viền Indigo `#6366F1`) và `$..$` nội dòng.
    + Định dạng văn bản phong phú: H1, H2, H3, bold, italic, inline code pill `#F472B6`, blockquote thanh dọc `#3B82F6`, bullet & numbered lists, clickable links.
  - Bố cục Bong bóng Thích ứng Kép (Dual-Width Bubble): Gọn gàng 75% cho casual chat, mở rộng 760px (92% trên mobile) cho Rich HUD.
  - Nút Quick Copy phản hồi ở góc dưới bên phải cho tin nhắn AI >120 ký tự hoặc có rich block.
  - Khung nhập liệu co giãn đa dòng tự động `44px - 160px` (`FloatingInputBar.tsx`), phím `Enter` gửi ngay thu về `44px`, `Shift + Enter` xuống dòng.
  - Cập nhật phiên bản Header: `Online • v4.2`. Bộ kiểm thử 8/8 kịch bản đạt 80/80 điểm tuyệt đối.

- [x] **Ngày 7: `feat/clean-consecutive-history-and-code-streaming` (Tomorrow v4.3 - Consecutive Model Turn Merging & Markdown Code Streaming Guard)**
  - Cơ chế gộp các tin nhắn `role: 'model'` liên tiếp trong lịch sử hội thoại gửi lên Gemini/OpenAI để triệt tiêu vĩnh viễn lỗi 400 Bad Request.
  - Bảo vệ khối code và bảng biểu trong luồng phân tách bong bóng streaming, loại trừ hoàn toàn hiện tượng vỡ thẻ Markdown khi hiển thị đa bong bóng.

- [x] **Ngày 8: `ai/realtime-chrono-context` (Tomorrow v4.4 & v4.4.1 - Realtime Chrono Pro, Circadian Rhythms & VS Code Split Chat Panes Cmd+↑ with Background Cmd+N Continuity)**
  - Hoàn thiện hệ thống thời gian thực `buildChronoContext(now, lastTimestamp)`: 6 khung nhịp sinh học (`EARLY_MORNING`, `MORNING`, `NOON`, `AFTERNOON`, `EVENING`, `LATE_NIGHT`), tính `gapType` (`CONTINUOUS`, `SAME_DAY_RETURN`, `NEXT_DAY`, `MULTI_DAY_GAP`, `FIRST_INTERACTION`), và nhãn `[CHRONO: ... | ALLOW_LATE_NIGHT_REMARK=...]`.
  - Khóa chặt guard chống hỏi "thức khuya" / "chưa ngủ à" khi không phải khung `LATE_NIGHT`.
  - Tự động gắn mốc ngày cho Web Search (`resolveTemporalSearchQuery`), dọn sạch ghi chú thức khuya lệch pha trong `UserMemoryVault`, gắn nhãn ngày `(DD/MM)` cho `recentContext`.
  - Cô lập trạng thái gõ theo từng `sessionId` (`typingSessionIds`), hỗ trợ Background Continuity: AI tiếp tục trả lời và lưu bền vững khi người dùng bấm `Cmd+N` hoặc chuyển chat.
  - Bắt phím toàn cục `Cmd/Ctrl + N` với `{ capture: true }`, mở phiên mới trên pane đang active và focus ô nhập sau 50ms.
  - Chia đôi cửa sổ chat song song kiểu VS Code bằng `Cmd/Ctrl + ArrowUp` (`panes`, `activePaneId`), hỗ trợ tối đa 3 pane trên Desktop, độc lập ô nhập, cuộn và thanh công cụ.

- [x] **Ngày 9: `ai/micro-psychology-profiler` (Tomorrow v4.5 - On-Device Micro-Psychology Profiler, Keystroke Telemetry & Emotional Cadence Mirroring)**
  - Bộ đo nhịp gõ cục bộ `KeystrokeTelemetry` (`typingDurationMs`, `charsPerSecond`, `backspaceRatio`, `burstCount`) qua `useRef` trong `FloatingInputBar.tsx` / `App.tsx` (không re-render, bảo mật 100%).
  - Module `services/microPsychProfiler.ts` thực thi < 1ms:
    + Giải mã DNA ngôn ngữ: `caseStyle`, `punctuationStyle`, `diacriticsMode`, `hasSlang`, `brevityLevel`.
    + 7 trạng thái tâm lý ngầm: `STRESSED_OVERWHELMED`, `MASKED_SADNESS`, `LOW_DOWN_DEFLATED`, `IRRITATED_BLUNT`, `EXCITED_HYPED`, `FOCUSED_ANALYTICAL`, `NEUTRAL_CASUAL`.
    + Đo lường độ ngập ngừng `hesitationLevel` (`HIGH`, `MEDIUM`, `LOW`).
    + Định dạng nhãn chỉ đạo: `[PSYCH: STATE=... | STYLE=... | CADENCE=... | HINT=...]`.
  - Tích hợp vào `buildLocalReflexDirective`, `SYSTEM_INSTRUCTION` (442 từ < 450 từ), `localResilientFallback`, và cập nhật `recentContext` trong `UserMemoryVault`.
  - Cập nhật live badge header: `Online • v4.5`. Bộ kiểm thử 13/13 scenarios đạt 130/130 điểm hoàn hảo.

- [x] **Ngày 9+ (Foundation 90 Ngày): `feat/day9-plus-90d-foundation` (Tomorrow v4.5.1 — 90-Day Jarvis Foundation: Domain Sub-Router (STEM/Finance/Code/Vision), Student Quota Shield & Instant Vision Paste)**
  - **Bộ định tuyến chuyên môn con cục bộ (`detectExpertDomain` trong `services/aiService.ts`):** Chạy trong `< 1ms`, phân loại 7 nhánh: `VISION_LAB`, `STEM_PHYSICS_MECH`, `STEM_CHEM_BIO`, `STEM_ELECTRONICS`, `CODE_CS`, `FINANCE_QUANT`, `GENERAL`.
  - **Chỉ đạo chuyên môn con 1 dòng tinh gọn:** Gắn đúng 1 dòng chỉ đạo đặc thù vào `buildLocalReflexDirective` (công thức LaTeX cho Lý/Hóa, an toàn điện áp/chân pin cho Điện tử, code sạch cho CS, bảng số liệu & cảnh báo rủi ro cho Tài chính, đọc chữ viết tay/linh kiện cho Vision Lab), giữ nguyên 100% quyền ưu tiên của `STOP_SIGNAL` và `CASUAL_FRIEND`.
  - **Cấp phát token động & nhiệt độ chính xác:** `dynamicMaxTokens` 2000 / 15s (`temperature: 0.35`) cho STEM/Code/Vision; 1200 / 12s (`temperature: 0.35`) cho Tài chính; giữ nguyên 250 tokens (`temperature: 0.75`) cho chat bạn bè. Ưu tiên chuỗi Smart Flash Models (`gemini-2.5-flash`, `gemini-2.0-flash`) cho STEM/Vision.
  - **Lá chắn Quota sinh viên (`services/quotaShield.ts`):** Quản lý lưu trữ AsyncStorage khóa `TOMORROW_QUOTA_STATS_V1`, tự động reset theo ngày `YYYY-MM-DD`, theo dõi độc lập 2 key OpenAI & Gemini, ước lượng token an toàn `tokens ≈ Math.ceil(chars / 3.5)`, hiển thị dòng trạng thái tinh gọn ở footer của `CommandPalette` (`Cmd+K`) kèm tùy chọn nhanh `"Reset cờ OpenAI (Thử kết nối lại)"`.
  - **Nâng cấp Vision Lab trên MacBook:** Bộ nén Canvas `utils/imageOptimizer.ts` tự động thu phóng giữ nguyên tỷ lệ <= 1024px JPEG 0.82 (giảm 60–80% dung lượng base64); hỗ trợ dán ảnh `Cmd+V`, kéo-thả (Drag & Drop) trực tiếp với viền sáng macOS; gửi ảnh độc lập tự động gán ngữ cảnh phân tích.
  - **Cổng Provider tương lai:** Tạo file chuẩn `types/providers.ts` sẵn sàng mở rộng cho Claude, DeepSeek, Local Ollama.
  - Cập nhật live badge header: **`Online • v4.5.1`**. Bộ kiểm thử tự luyện 17/17 scenarios đạt 170/170 điểm hoàn hảo.

- [ ] **Ngày 10 – 15: Hoàn thiện Phase 1**
  - Tối ưu bộ nhớ đệm `UserMemoryVault` tự động nén khi vượt quá 30 ngày.
  - Tìm kiếm toàn văn (Full-text search) trên danh sách phiên trò chuyện trong Sidebar.
  - Đóng gói chuẩn ứng dụng Desktop macOS thông qua WebKit / Electron / PWA Wrapper nâng cao.

---

### GIAI ĐOẠN 2: TRI THỨC KHOA HỌC & THỊ TRƯỜNG CHUYÊN SÂU (NGÀY 16 – 30)
- [ ] **Deep Research Mode:** Khả năng tự động tổng hợp tài liệu nhiều bước (multi-hop web queries).
- [ ] **Market & Financial Intel:** Tích hợp dữ liệu thời gian thực cho tỷ giá, mã cổ phiếu, xu hướng công nghệ qua Serverless API caching.
- [ ] **Code Sandbox & Visual Artifacts:** Hỗ trợ render trực tiếp sơ đồ Mermaid, biểu đồ dữ liệu và khối mã có syntax highlighting chuẩn macOS.

---

### GIAI ĐOẠN 3: VOICE HUD & VOICEPRINT AUDIO INTERFACE (NGÀY 31 – 45)
- [ ] **Realtime Waveform Visualizer:** Hiển thị HUD sóng âm dạng Jarvis động trên Header/Footer khi kích hoạt Micro.
- [ ] **Audio Streaming & Whisper/Gemini Audio:** Chuyển đổi giọng nói thành văn bản cực nhanh (Sub-500ms latency).
- [ ] **Voiceprint Verification:** Nhận diện và xác thực giọng nói của chủ nhân để mở khóa các lệnh hệ thống nhạy cảm.
- [ ] **Text-To-Speech (TTS) Tự nhiên:** Tích hợp giọng đọc AI tiếng Việt tự nhiên, ngắt nghỉ đúng ngữ điệu.

---

### GIAI ĐOẠN 4: CAMERA MEDIAPIPE NỘI BỘ (100% PRIVATE TRÊN RAM MACBOOK) (NGÀY 46 – 60)
- [ ] **MediaPipe Local Vision Engine:** Nhận diện cử chỉ tay (Hand Gestures) và hướng mắt (Gaze/Attention) trực tiếp trên Client.
- [ ] **Bảo mật tuyệt đối (Zero External Upload):** Khung hình từ webcam xử lý 100% trong bộ nhớ RAM của MacBook, không gửi bất kỳ frame hình ảnh nào lên Vercel hay Cloud API.
- [ ] **Air-Gesture Control:**
  - Đưa tay tạo cử chỉ dừng -> Tomorrow kích hoạt `STOP_SIGNAL`.
  - Vẫy tay chuyển tab / mở Sidebar mà không cần chạm chuột hay bàn phím.
- [ ] **Tối ưu hóa tài nguyên:** Sử dụng WebGL / WebGPU acceleration trên Apple Silicon (M1/M2/M3/M4), CPU usage < 5%.

---

### GIAI ĐOẠN 5: AUTONOMOUS LOCAL MEMORY & KNOWLEDGE SYNTHESIS (NGÀY 61 – 75)
- [ ] **Autonomous Memory Compactor:** Tự động hợp nhất và tối ưu hóa các ghi chú mâu thuẫn trong `UserMemoryVault` trong lúc máy nhàn rỗi (idle state).
- [ ] **Local Vector Store / Semantic Graph:** Tạo đồ thị ngữ nghĩa cục bộ lưu trữ thói quen, bài tập và dự án cá nhân với độ trễ tìm kiếm < 5ms.
- [ ] **Cross-Session Reasoning:** Khả năng kết nối tri thức giữa các phiên làm việc cách xa nhiều ngày mà không làm tràn Context Window.

---

### GIAI ĐOẠN 6: MULTI-PROVIDER GATEWAY & DESKTOP NATIVE MATRIX (NGÀY 76 – 90)
- [ ] **Multi-Provider Dynamic Engine (dựa trên `types/providers.ts`):** Kích hoạt Claude 3.5 Sonnet cho STEM sâu, DeepSeek cho Quant/Code, và Local Ollama khi offline hoàn toàn.
- [ ] **Apple Silicon Hardware Acceleration (CoreML / Metal):** Nhúng model lượng tử hóa (Quantized GGUF/CoreML) chạy trực tiếp trên Neural Engine của Mac (M1/M2/M3/M4).
- [ ] **Full Desktop Native Matrix:** Menu bar tray icon, system global hotkeys, Touch Bar HUD visualizer, và tự khởi động cùng macOS.

---

## 4. QUY TRÌNH KIỂM CHỨNG TRƯỚC MỌI BẢN DEPLOY
Mỗi bước cập nhật tính năng mới phải tuân thủ nghiêm ngặt 3 bước sau:

1. **Kiểm tra TypeScript & Export Web:**
   ```bash
   npm run typecheck
   npx expo export -p web
   ```
2. **Chạy Bộ Giả Lập Tự Luyện (Simulator Suite):**
   ```bash
   node train_simulator.js
   ```
   *Yêu cầu bắt buộc: 17/17 kịch bản phải PASS (170/170 điểm) trước khi tạo commit.*
3. **Tăng Version Header & Deploy Production:**
   - Cập nhật số phiên bản trên `App.tsx` (VD: `Online • v4.5` -> `Online • v4.5.1`).
   - Kiểm tra `.gitignore` đảm bảo không sót `.env` hoặc file nhạy cảm.
   - Deploy Vercel Production:
     ```bash
     npx vercel --prod --yes
     ```
