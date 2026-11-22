# TOMORROW (PROTO-JARVIS) — 90-DAY EXECUTION ROADMAP & STATUS TRACKER
> **File quy chuẩn:** `PLANNING.md` | **Phiên bản hiện tại:** `v4.7.7` | **Trạng thái:** Hoạt động ổn định trên macOS & Vercel Web

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
| **Phase 1** | **Core Foundation, 3-Layer Reflex, Quota Shield & Vision Lab** | Ngày 1 – 15 | 🟡 Đang hoàn thiện (Ngày 1-11 Xong, v4.7.1 Xong) |
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

- [x] **Ngày 9++: `fix/v4.5.2-vision-stem-dynamic-timeout-and-image-carry-over` (Tomorrow v4.5.2 - Dynamic Timeout for Vision/STEM, Vision Image Carry-Over & Clean History Normalization)**
  - **Dynamic Timeout 30s:** Cấp phát `dynamicTimeout = 30000ms` (30s) cho các bài toán phức tạp (`VISION_LAB`, `STEM_*`, `CODE_CS`, `EXPERT_JARVIS`, `WEB_INTEL`); 8s (`8000ms`) cho nhánh chat nhanh. Cởi bỏ hoàn toàn giới hạn cứng 5s trong `callOpenAI` và nâng watchdog `App.tsx` lên 35s.
  - **Silent Circuit Breaker chuẩn xác:** Chỉ khóa cờ `isOpenAIUnavailable = true` khi gặp lỗi 401, 402, 403, 429; nếu chỉ bị AbortError (timeout) thì trượt êm sang chuỗi Gemini dự phòng mà không khóa vĩnh viễn OpenAI ở các lượt chat sau.
  - **Chuẩn hóa Payload ảnh Vision (`normalizeVisionImage`):** Bóc tách chính xác `mimeType` và `pureBase64` (loại bỏ sạch tiền tố `data:image/...;base64,`); gửi `image_url` với `detail: 'high'` cho OpenAI và `inlineData: { mimeType, data: pureBase64 }` cho Gemini.
  - **Tự động kế thừa ảnh nối tiếp (`resolveCarriedOverVisionImage`):** Tự động phát hiện các câu hỏi nối tiếp mang tính tham chiếu (`"bài trên"`, `"câu 2"`, `"giải lại"`, `"làm lại"`, `"tiếp đi"`) hoặc khi lượt trước bị lỗi/timeout để nạp lại ảnh từ 2 tin nhắn gần nhất của user.
  - **Làm sạch lịch sử API (`normalizeHistoryForAPI`):** Lọc bỏ 100% bong bóng lỗi mạng cũ/offline/timeout (`isNetworkErrorMessage`), gộp các tin nhắn cùng role liên tiếp, đảm bảo lịch sử luôn luân phiên chuẩn xác `user <-> model` (loại trừ vĩnh viễn lỗi HTTP 400 Bad Request từ Gemini).
  - **Failover Logging:** Bổ sung `console.warn('[AI Router Failover]:', ...)` minh bạch mọi sự cố trượt model.
  - Cập nhật live badge header: **`Online • v4.5.2`**. Toàn bộ 17/17 scenarios kiểm thử đạt 170/170 điểm hoàn hảo.

- [x] **Ngày 9+++: `fix/v4.5.3-vision-payload-blind-force-expert-and-diagnostic-trace` (Tomorrow v4.5.3 — Fix Blind Vision Payload, Force Vision Expert Mode & Diagnostic Error Code)**
  - **Khóa chặt đường truyền ảnh Base64 từ `Cmd+V` & Picker đến API (`utils/imageOptimizer.ts`, `FloatingInputBar.tsx`, `App.tsx`):**
    + Bộ nén Canvas hỗ trợ triệt để URL `blob:...` qua fetch và `FileReader.readAsDataURL`, trả về Data URL chuẩn (`> 200` ký tự, không bao giờ chứa chuỗi rỗng hay `"blob:"`).
    + Giữ chặt `imagePayload` trước khi `setSelectedImage(null)` để loại trừ hoàn toàn race condition mất payload ảnh khi gửi tin nhắn.
    + Lưu trữ Data URL / pureBase64 đầy đủ vào `ChatMessage` và truyền thẳng vào `sendMessageToTomorrow`.
  - **Chuẩn hóa Payload Đa phương thức (`resolveValidVisionImage` trong `services/aiService.ts`):**
    + Hàm bất đồng bộ phân giải mọi dạng đầu vào (Data URL, pure base64, blob URL, object `{ uri, base64 }`), kiểm tra `pureBase64.length > 100 && !includes('blob:')`.
    + Đính kèm ảnh chuẩn xác vào Turn cuối cùng của Payload API: OpenAI (`image_url` với `detail: 'high'`, cấm stream khi có ảnh); Gemini (`inlineData: { mimeType, data: pureBase64 }`, tắt hoàn toàn `google_search` grounding để triệt tiêu lỗi 400 Bad Request).
    + Danh sách model Vision chuyên dụng: `VISION_MODEL_CHAIN` (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-flash`, `gemini-1.5-pro`), tuyệt đối cấm gọi các model chỉ nhận text thuần.
  - **Ép chế độ Vision Expert Mode (`buildLocalReflexDirective`):**
    + Khi `hasImage === true` (hoặc có ảnh kế thừa `effectiveImage`), ưu tiên tuyệt đối cấp 0: ép `intentMode = 'EXPERT_JARVIS'`, `domain = 'VISION_LAB'`, ngân sách `dynamicMaxTokens = 2500`, `dynamicTimeout = 35000ms`, `temperature = 0.25` (không bị rơi nhầm vào `CASUAL_FRIEND`, `PING` hay `STOP_SIGNAL`).
    + Mở rộng `resolveCarriedOverVisionImage` quét 3 tin nhắn gần nhất với bộ từ khóa tham chiếu toàn diện (`bài 1`, `bài tập`, `làm hộ`, `giải hộ`, `câu 1`, etc.) hoặc khi bot vừa hỏi lại/báo lỗi.
  - **Bảo vệ phản hồi & Mã chẩn đoán Fallback (Diagnostic Trace):**
    + Khi AI sinh cú pháp C/C++ có ký tự đặc biệt (`*q`, `*r`, nháy kép chưa escape) khiến `safeParseAIJson` thất bại: bọc trực tiếp toàn bộ chuỗi text thô của AI vào cấu trúc `replies: [rawClean]` với trạng thái `expert_guidance`, không làm rơi vào màn hình lỗi.
    + Khi tất cả các tầng API đều thất bại: ghi nhận `failoverTrace`, log `[Vision/AI Failover Trace]:`, và đính kèm `[Debug: Failover All Models - {mã lỗi}]` vào cuối câu trả lời fallback.
    + Khi có ảnh đề bài/học tập, `localResilientFallback` trả lời nghiêm túc, chu đáo, không trả lời ngây ngô "ảnh gì đây / giao diện hay bug cần soi à :3".
  - Cập nhật live badge header: **`Online • v4.5.3`**. Nâng cấp bộ kiểm thử lên 19/19 scenarios đạt 190/190 điểm hoàn hảo.

- [x] **Ngày 9++++: `fix/v4.5.4-openai-400-gemini-404-routing-and-image-carry-over` (Tomorrow v4.5.4 — Live Diagnose & Fix OpenAI HTTP 400, Gemini HTTP 404 & Stop Sticky Image Carry-Over)**
  - **Khắc phục triệt để OpenAI HTTP 400:**
    + Chuẩn hóa nghiêm ngặt mảng messages gửi OpenAI: chỉ cho phép role `'system' | 'user' | 'assistant'`.
    + Toàn bộ tin nhắn lịch sử gửi dưới dạng `content: string` thuần túy (không rỗng), loại bỏ hoàn toàn việc nhồi object `image_url` vào các turn lịch sử (đặc biệt role `assistant`) gây lỗi OpenAI 400.
    + Chỉ tin nhắn user cuối cùng mới gắn mảng đa phương thức `image_url` với `detail: 'auto'` và clean base64.
    + Đảm bảo system prompt gửi OpenAI luôn có từ khóa `"JSON"` để tương thích với `response_format: { type: 'json_object' }`.
  - **Khắc phục dứt điểm Gemini HTTP 404 (AI Studio vs Vertex AI Express Mode):**
    + Thay thế toàn bộ các model đã bị Google khai tử (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`) bằng các model đang hoạt động 100%: `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-flash-latest`.
    + Tự động nhận diện định dạng API key: Nếu tiền tố `AQ.` định tuyến sang Vertex AI Express endpoint (`aiplatform.googleapis.com`); nếu tiền tố `AIza` định tuyến sang Google AI Studio endpoint (`generativelanguage.googleapis.com`).
  - **Chấm dứt hiện tượng dính ảnh thừa (Sticky Image Carry-Over):**
    + Loại bỏ hoàn toàn cờ `wasLastError` trong `resolveCarriedOverVisionImage`, tránh việc một câu hỏi thuần văn bản (như "giải thích cho tôi về nhiệt học") bị ép gán ảnh cũ chỉ vì lượt trước bot báo lỗi.
    + Chỉ kế thừa ảnh khi người dùng thật sự dùng từ khóa tham chiếu (`bài trên`, `bài 1`, `câu 1`, `làm hộ bài trên`, etc.).
  - **Chuẩn hóa thông điệp lỗi (Diagnostic Trace):**
    + Bổ sung `extractApiErrorMessage` phân giải trực tiếp `parsed?.error?.message` trong 140 ký tự, chấm dứt việc cắt chuỗi JSON `errText.slice(0, 45)` gây ra chữ `error: message`.
  - Cập nhật live badge header: **`Online • v4.5.4`**. Nâng cấp bộ kiểm thử lên 19/19 scenarios đạt 190/190 điểm hoàn hảo.

- [x] **Ngày 9+++++: `fix/v4.5.5-eliminate-object-object-in-structured-json-replies` (Tomorrow v4.5.5 — Eliminate [object Object] in Structured JSON Replies)**
  - **Làm phẳng triệt để Object lồng nhau thành Markdown (`flattenReplyToMarkdown`):**
    + Hàm đệ quy thông minh tự động trích xuất các object cấu trúc (như `{ title, code, complexity, explanation }`) thành chuỗi Markdown hoàn chỉnh, đóng gói khối mã C/C++ chuẩn ```` ```cpp\n...\n``` ````, in đậm tiêu đề `**...**`, và loại bỏ vĩnh viễn chuỗi `"[object Object]"`.
    + Tự động làm phẳng JSON ngay cả khi AI trả về thiếu key `replies` (như `{ solution: ..., code: ... }`).
  - **Khóa định dạng `string[]` trong `[DIRECTIVE]`:**
    + Yêu cầu rõ ràng LLM chỉ xuất mảng `string[]` thuần, không lồng object `{}` bên trong `replies`.
  - **Chốt chặn an toàn đa tầng (UI & History Filter):**
    + Tại `App.tsx`: lọc bỏ toàn bộ `"[object Object]"` và sanitize từng bong bóng với `flattenReplyToMarkdown`.
    + Tại `ChatBubble.tsx`: ép chuẩn `safeText` với `JSON.stringify` an toàn, ngăn chặn hiển thị `[object Object]`.
    + Tại `normalizeHistoryForAPI`: lọc bỏ hoàn toàn các bong bóng lỗi cũ chứa `"[object Object]"` trước khi gửi lên API.
  - Cập nhật live badge header: **`Online • v4.5.5`**. Nâng cấp bộ kiểm thử lên 20/20 scenarios đạt 200/200 điểm hoàn hảo.

- [x] **Ngày 10 (`ai/proto-jarvis-dual-persona` — Phiên bản `v4.6`): Bộ điều phối Nhân cách Kép Cục bộ & Domain Playbooks**
  - **Mô-đun `services/personaRouter.ts` chạy 100% cục bộ (< 1ms):**
    + Điều phối 2 chế độ nhân cách cốt lõi: `COMPANION_MIRROR` (tri kỷ đời thường, xưng hô đồng điệu, 1-2 bong bóng ngắn) vs `JARVIS_LAB` (J.A.R.V.I.S. phòng lab, điềm tĩnh, chính xác, Markdown/LaTeX).
    + Bộ điều tiết độ hóm hỉnh ngầm `dryWitLevel`: Bắt buộc tắt (`OFF`) khi user gặp stress, buồn ngầm, ngập ngừng cao (`hesitation === 'HIGH'`) hoặc stop signal; đặt `SUBTLE` ở Jarvis Lab; `SHARP` khi hào hứng / vui vẻ.
  - **Kho chiến thuật `DOMAIN_PLAYBOOKS` độc lập:**
    + Nạp đúng 1 playbook chuyên môn tương ứng cho các nhánh: `STEM_CODE`, `STEM_PHYSICS_MECHANICS`, `STEM_ELECTRONICS`, `STEM_CHEM_BIO`, `STEM_MATH`, `FINANCE_QUANT`, `VISION_LAB`. Không chèn khi chat đời thường để tối ưu token và tốc độ.
  - **Tái cấu trúc `SYSTEM_INSTRUCTION` & Rào chắn `stripRoboticClosings`:**
    + Rút gọn `SYSTEM_INSTRUCTION` đạt chuẩn 412 từ (< 450 từ), tuân thủ 4 thẻ đầu lượt `[DIRECTIVE]`, `[PERSONA]`, `[CHRONO]`, `[PSYCH]`.
    + Hàm `stripRoboticClosings` tự động gọt sạch các câu kết rập khuôn vô nghĩa ("Hy vọng giúp ích...", "Nếu bạn cần gì thêm...", "Chúc bạn học tốt...") nhưng bảo toàn 100% code blocks và công thức.
  - **Phản hồi trạng thái chuyên môn tinh tế trên UI:**
    + `TypingIndicator`: COMPANION_MIRROR chỉ hiện bong bóng 3 chấm `• • •` mượt mà như Messenger; JARVIS_LAB hiển thị nhãn nhánh (`⚡ J.A.R.V.I.S. • Code`, `⚡ J.A.R.V.I.S. • STEM`, `⚡ J.A.R.V.I.S. • Finance`, `👁️ Vision Lab đang đọc ảnh...`, `🌐 Đang quét web...`).
  - **Bộ kiểm thử tự động `train_simulator.js`:**
    + Bổ sung 4 scenarios Ngày 10: `Test_Day10_Instant_Persona_Switch`, `Test_Day10_Finance_DualSide`, `Test_Day10_Stress_Disable_Wit`, `Test_Day10_SystemPrompt_Budget`.
    + Đạt điểm tuyệt đối 24/24 scenarios (240/240 điểm). Header cập nhật **`Online • v4.6`**.

- [x] **Ngày 11 (`memory/structured-knowledge-vault` — Phiên bản `v4.7`): Hồ sơ Tri thức Đa chiều (Structured Knowledge Vault) & Cmd+K Vault Manager**
  - **Mô-đun `services/memoryVaultService.ts` quản lý tập trung trên khóa `USER_MEMORY_PROFILE_V1`:**
    + Schema v2 đa chiều cho sinh viên: `studySubjects` (môn học, trình độ strong/weak/learning, focusTopic), `financeGoals` (mục tiêu tài chính, targetAmount, horizon short/mid/long), `moodHistory` (mốc tâm lý theo ngày), `favorites`, `activeProjects`, `habits`, `recentContext`.
    + Hàm `migrateAndNormalizeVault`: Nâng cấp mượt mà từ v3.8/v4.6, bảo tồn 100% dữ liệu cũ, bảo toàn bộ lọc Ngày 8.
    + Hàm `mergeMemoryIntoVault` (< 1ms): Phân loại Heuristic cục bộ, upsert môn học & mục tiêu tài chính không tạo bản sao trùng lặp, tách đúng `targetAmount` và `horizon`.
  - **Bơm trí nhớ chọn lọc theo ngữ cảnh `buildMemoryContextSlice`:**
    + 0 token trí nhớ cho `STOP_SIGNAL` và `PING`.
    + Bơm `studySubjects` + `activeProjects` cho nhánh STEM/Vision; bơm `financeGoals` + `activeProjects` cho FINANCE_QUANT; bơm đời thường + tâm lý cho COMPANION_MIRROR.
    + Giới hạn cứng thẻ `[MEMORY_VAULT: ...]` luôn `<= 480 ký tự`.
  - **Quản lý Hồ sơ Trí nhớ trong Command Palette (`Cmd + K`) & `MemoryVaultModal.tsx`:**
    + Lệnh `🧠 Hồ sơ Trí nhớ (Memory Vault)` tìm được theo `"memory"`, `"trí nhớ"`, `"vault"`, `"môn học"`, `"tài chính"`.
    + Modal macOS tiêu chuẩn 4 tab (Học tập, Tài chính, Cốt lõi & Dự án, Thói quen & Gần đây) với form thêm nhanh & xóa từng mục, đồng bộ trực tiếp xuống `AsyncStorage`.
  - **Bộ kiểm thử tự động `train_simulator.js`:**
    + Bổ sung 4 scenarios Ngày 11: `Test_Day11_Vault_Migration`, `Test_Day11_Study_And_Finance_Upsert`, `Test_Day11_Selective_Context_Slice`, `Test_Day11_SystemPrompt_Budget`.
    + Đạt điểm tuyệt đối 28/28 scenarios (280/280 điểm 100% hoàn hảo).

- [x] **Ngày 11+ (`fix/sessions-split-markdown` — Phiên bản `Online • v4.7.2`): Khắc phục Đơ Đổi Phiên, Chuẩn hóa Split Panes 50/50, Chế độ Đọc Thu gọn & Normalizer Markdown Inline Fence**
  - **Single Source of Truth & Zero-Freeze Session Switching (`App.tsx`, `SidebarDrawer.tsx`, `chatStorage.ts`):**
    + Loại bỏ hoàn toàn vòng lặp đồng bộ `useEffect` giữa `sessions` <-> `messages` <-> `panes`.
    + Tin nhắn mỗi pane dẫn xuất trực tiếp qua `useMemo` từ `sessions.find(s => s.id === pane.sessionId)?.messages ?? []`.
    + Luôn duy trì `sessionsRef.current = sessions` cập nhật tức thì tránh stale closure.
    + Viết lại `handleSelectSession` phản hồi tức thì (`< 16ms`), quản lý `typingSessionIds` độc lập theo từng phiên, xóa sạch ảnh nháp chưa gửi, không bao giờ bị đơ/treo giao diện khi thoát khỏi phiên có ảnh lớn (`"Giải bài tập qua hình ảnh"`).
    + Đồng bộ kép Sidebar Desktop (`App.tsx`) và Mobile Drawer (`components/SidebarDrawer.tsx`), bảo toàn `e.stopPropagation()` trên nút thùng rác xóa phiên.
  - **50/50 Split Panes & Chống Xén Mép Trái (`App.tsx`, `ColdGreeting.tsx`, `FloatingInputBar.tsx`):**
    + Thiết lập quy chuẩn CSS Flexbox nghiêm ngặt: `flex: 1, flexBasis: 0, minWidth: 0, maxWidth: '100%', overflow: 'hidden'` trên `singlePaneWrapper` và `chatAreaWrapper`.
    + Khi bật chia đôi qua `Cmd+ArrowUp` hoặc nút Header trên màn hình `< 1280px`, tự động thu gọn Sidebar (`setIsSidebarOpen(false)`) để nhường toàn bộ không gian cho 2 cột chat.
    + Thẻ gợi ý `ColdGreeting`: đặt `minWidth: 0, flexShrink: 1`, điều chỉnh padding/border-radius trong chế độ `compact`, triệt tiêu hoàn toàn lỗi cắt mất chữ `"G"` trong `"GỢI Ý TÂM SỰ NHANH:"` và bo góc thẻ.
    + Thanh nhập liệu `FloatingInputBar`: nhận prop `isSplitMode={panes.length > 1}`, co gọn `minHeight: 46` (thay vì 52), padding wrapper `12px` (thay vì 20px), icon buttons `30x30`, send button `32x32`, text input font `14px` / line-height `20px`, loại bỏ hiện tượng phình chiều cao và đẩy lệch text giữa 2 khung.
  - **Chế độ Đọc Thu Gọn Cho Split Screen (`compact`):**
    + `ChatBubble`: độ rộng tối đa bong bóng linh hoạt (`hasRichBlock ? '98%' : '95%'`), padding `12px 9px`, pass `compact` cho `RichMarkdownView`.
    + `RichMarkdownView`: cỡ chữ văn bản `14px` (lineHeight `21px`), cỡ chữ code `12.5px` (lineHeight `19px`), căn chỉnh thanh tiêu đề code Space-Between, luôn cố định nút "Sao chép" hiển thị trọn vẹn ở góc phải.
  - **Bộ Phân Tích Markdown State Machine & Inline Fence Normalizer (`components/RichMarkdownView.tsx`, `services/aiService.ts`):**
    + Hàm `normalizeMarkdownFences`: bóc tách chuẩn xác thẻ mở fence dính liền cuối câu (`"như sau: ```python"` -> `"như sau:\n```python"`), tách chữ giải thích phía sau thẻ đóng ra ngoài (`"```tham số `name`..."` -> `"```\ntham số `name`..."`).
    + Thay thế hàm tách chuỗi mong manh bằng Bộ phân tích tuần tự State Machine theo từng dòng (`parseMarkdownBlocks`), bảo vệ trọn vẹn ghi chú comment `#` (không bao giờ bị biến thành Heading), loại bỏ tình trạng nhốt chữ vào code block hoặc sinh code block rỗng.
  - **Bộ kiểm thử tự động `train_simulator.js`:**
    + Bổ sung kịch bản TEST 29: `Test_Day11_Markdown_InlineFence_Normalizer`.
    + Đạt điểm tuyệt đối 29/29 scenarios (290/290 điểm 100% hoàn hảo).

- [x] **Ngày 11++ (`fix/split-ui` — Phiên bản `Online • v4.7.3`): Gom Duy Nhất 1 Component `<ChatPaneView />`, Khóa Cứng Thanh Nhập Liệu Chuẩn 48px & Web Textarea 1 Dòng**
  - **Gom về duy nhất một component `<ChatPaneView />` chung (`App.tsx`):**
    + Chuyển toàn bộ nhánh render `panes.map` về một component duy nhất `<ChatPaneView />` dùng chung cho toàn bộ Pane 0, Pane 1 (và Pane 2 nếu mở tối đa 3 pane).
    + Khung trái (mặc định) và khung phải (split) giống hệt nhau 100% từng pixel, chung cấu trúc Header, Dropdown sessions, EmptyState, FlatList và FloatingInputBar.
  - **Khóa cứng chiều cao thanh nhập liệu & Web Textarea 1 dòng (`FloatingInputBar.tsx`):**
    + Vỏ pill dùng chung 1 style duy nhất cho mọi pane: `minHeight: 48, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 24, gap: 8, alignItems: 'center'`.
    + Xóa sạch toàn bộ logic lệch pha cũ (`alignItems: inputHeight > 36 ? 'flex-end' : 'center'`, `paddingBottom: 8`, `pillContainerSplit`) đã từng làm thanh nhập liệu pane trái phình lên ~85px và đẩy 3 icon + nút Gửi tụt xuống đáy.
    + Nhóm 3 icon trái (ảnh, emoji, web) và nút Gửi bên phải: `flexDirection: 'row', alignItems: 'center', flexShrink: 0`, icon size 16-19, button size 32x32, luôn căn thẳng hàng tâm dọc với dòng chữ.
    + Thẻ `<TextInput>` đặt trực tiếp `rows={1}`, style 1 dòng chuẩn (`minHeight: 24, maxHeight: 110, lineHeight: 22, paddingTop: 1, paddingBottom: 1, paddingHorizontal: 4, margin: 0`).
    + Chặn triệt để `onContentSizeChange` trên Web (nguyên nhân khiến textarea của pane trái tự đo scrollHeight sai và tự phình cao); thay bằng hàm điều chỉnh DOM thực tế: `el.style.height = '24px'; Math.min(110, Math.max(24, el.scrollHeight))`.
    + Đảm bảo khi gõ 1 dòng ở cả 2 bên Split Screen, thanh nhập liệu bên trái và bên phải đều cao bằng nhau đúng ~48px.
  - **Khóa Flexbox chống tràn/xén mép trên macOS & Web (`App.tsx`):**
    + Bổ sung `minWidth: 0, boxSizing: 'border-box'` trên `panesContainer`, `singlePaneWrapper`, `chatAreaWrapper`, `chatListContent`, triệt tiêu hoàn toàn hiện tượng lệch tỷ lệ và xén mép.
  - Header cập nhật: **`Online • v4.7.3`**.

- [x] **Ngày 11+++ (`fix/code-followup-ui` — Phiên bản `Online • v4.7.4`): Kế Thừa Ngữ Cảnh Chuyên Môn Cho Câu Hỏi Nối Tiếp Ngắn, Triệt Tiêu Câu Mồi Rỗng & Nới Rộng Khung Code Block**
  - **Bộ nhận diện Follow-up Domain Inheritance (`services/aiService.ts`, `services/personaRouter.ts`):**
    + Chạy cục bộ < 1ms: Quét 4 tin nhắn gần nhất trong lịch sử khi người dùng gửi câu hỏi/yêu cầu nối tiếp ngắn (<= 8 từ hoặc các cụm "ví dụ", "đâu", "chi tiết", "giải thích", "tại sao", "code", "sửa lại", "thế còn", "là gì", hoặc typo/từ viết tắt OOP như "innit", "contrucstor", "def", "class", "pointer").
    + Tự động kế thừa ngay `MODE = EXPERT_JARVIS`, `domain = CODE_CS`, `persona = JARVIS_LAB`, ép `dynamicMaxTokens = 2000` và `temperature <= 0.35`, chấm dứt việc bị rơi nhầm về `CASUAL_FRIEND` (250 tokens).
  - **Triệt tiêu câu mồi rỗng & Siết độ chính xác kỹ thuật:**
    + Cấm tuyệt đối hùa theo hoặc giải thích sai lệch kiến thức cơ bản (như nhầm `def` với constructor `__init__`); đính chính ngắn gọn, chuẩn xác ngay dòng đầu trước khi đưa code.
    + Cơ chế tự động gộp câu dẫn ngắn (`"như sau nè:"`) ở phần tử 1 với khối code/nội dung ở phần tử 2 trong `sanitizeAndMergeBrokenBlocks`, trả về 1 bong bóng duy nhất, không tách rời câu mồi vô nghĩa.
    + Cơ chế retry 1 lần sau `safeParseAIJson` nếu câu trả lời chỉ là câu dẫn mồi (`isEmptyTeaserReply`) mà không hề có mã nguồn hoặc nội dung chi tiết.
  - **Nới rộng bong bóng chứa Code Block & Tách thoáng Header (`ChatBubble.tsx`, `RichMarkdownView.tsx`):**
    + Khi bong bóng AI chứa khối code (`hasCodeBlock`) hoặc bảng biểu (`hasTable`), áp dụng tỷ lệ: `width: compact ? '96%' : '88%'`, `maxWidth: compact ? '98%' : 740`, `minWidth: compact ? 260 : 320`, `alignSelf: 'flex-start'`, chống co rúm khung code theo chiều ngang.
    + Header của `CodeBlock`: `flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 0`.
    + Nhóm nhãn trái: `flex: 1, minWidth: 0, marginRight: 8`, nhãn `numberOfLines={1}` và `ellipsizeMode="tail"`.
    + Nút `📋 Sao chép`: `flexShrink: 0, paddingHorizontal: 10, paddingVertical: 4`, luôn tách biệt rõ ràng, không bao giờ dính sát vào dòng `PYTHON • 6 DÒNG`.
  - **Bộ kiểm thử tự động `train_simulator.js`:**
    + Bổ sung kịch bản TEST 30: `Test_Day11_Followup_Code_Inheritance`.
    + Đạt điểm tuyệt đối 30/30 scenarios (300/300 điểm 100% hoàn hảo).
  - Header cập nhật: **`Online • v4.7.4`**.

- [x] **Ngày 11++++ (`feat/web-intel-v4.7.5` — Phiên bản `Online • v4.7.5`): Universal Web Intel, Live Free APIs, Smart Follow-up Ref & Multi-Topic Structured Output**
  - **Multi-Scenario Follow-up Reference Resolution (`services/webSearchService.ts`, `services/aiService.ts`):**
    + Hàm `resolveReferenceFromHistory`: nhận diện tham chiếu số ("trích dẫn tin tức 1 đi", "bài 2", "đầu tiên", "thứ hai", "cuối cùng"), so sánh nhiều mục ("so sánh tin 1 và 2"), và tham chiếu đại từ ("bài đó", "tin trên", "link gốc").
    + Quét ngược `recentHistory` trích xuất chính xác `targetText`, `targetUrl`, `targetSource` từ mảng `sources` hoặc danh sách đánh số của model lượt trước.
    + Tự động tạo `[REF_TARGET: Item #N = "..."]`, viết lại truy vấn `rewrittenQuery`, thay thế tìm kiếm mù mờ bằng trích dẫn chuẩn xác.
    + Hàm `normalizeHistoryForAPI`: đính kèm ngữ cảnh nguồn tham chiếu vào các tin nhắn model cũ để bảo toàn bộ nhớ trích dẫn cho OpenAI & Gemini.
  - **Phân loại 10 Chủ đề Web Intel & Tích hợp Live Free APIs (`services/webSearchService.ts`, `api/search.js`):**
    + Hàm `classifyWebIntelTopic`: phân loại chuẩn xác 10 chủ đề: `FOLLOWUP_REF`, `WEATHER`, `MARKET_FINANCE`, `NEWS_RADAR`, `TECH_DEV`, `COMPARE_BUYING`, `SPORTS_LIVE`, `EDU_POLICY`, `TRAVEL_LOCAL`, `URL_READER`.
    + Open-Meteo Weather API: dự báo thời tiết 7 ngày, nhiệt độ, độ ẩm, mã WMO tiếng Việt cho các thành phố lớn tại Việt Nam; hỗ trợ so sánh song song 2 thành phố bằng `Promise.all`.
    + CoinGecko & ExchangeRate-API: cung cấp giá Bitcoin, Ethereum, Solana, BNB trực tiếp kèm quy đổi VND và biến động 24h; cập nhật tỷ giá USD/VND, EUR, JPY thời gian thực mà không cần API key.
  - **Universal Structured Output Formatter (`services/personaRouter.ts`, `services/aiService.ts`):**
    + Hàm `detectOutputFormatIntent`: nhận diện 5 cấu trúc chuyên biệt (`TABLE`, `PROS_CONS`, `TIMELINE`, `DEEP_CITE`, `NEWS_BRIEF`).
    + Tự động khóa `persona = 'JARVIS_LAB'`, tông giọng chuẩn mực, viết hoa đầu câu, `dynamicMaxTokens = 1800 - 2000`, `temperature <= 0.35`.
    + Trả lời trọn vẹn trong 1 bong bóng duy nhất (`replies.length === 1`), triệt tiêu bong bóng mồi và link cụt.
  - **Khử URL Rác Google News RSS & Tinh Gọn Link (`services/aiService.ts`, `components/RichMarkdownView.tsx`):**
    + Hàm `sanitizeWebReplyUrls`: cắt sạch trailing `\nLink: https://...` hoặc URL > 70 ký tự khi đã có `sources` pills hiển thị bên dưới.
    + `RichMarkdownView`: các link trần dài > 60 ký tự tự động hiển thị gọn dạng `🔗 Xem bài viết (${domain})`.
  - **Bộ kiểm thử tự động `train_simulator.js`:**
    + Bổ sung 5 kịch bản TEST 31-35: `Test_Day11_Web_Numbered_And_Pronoun_Ref`, `Test_Day11_MultiTopic_Classifier`, `Test_Day11_Output_Format_Detector`, `Test_Day11_Sanitize_GoogleNews_RSS_Link`, `Test_Day11_SystemPrompt_Budget`.
    + Đạt điểm tuyệt đối 35/35 scenarios (350/350 điểm 100% hoàn hảo).
  - Header cập nhật: **`Online • v4.7.5`**.

- [x] **Ngày 11+++++ (`feat/multi-pane-markdown-v4.7.6` — Phiên bản `Online • v4.7.6`): Nâng Cấp Phím Tắt Quản Lý Đa Tab Split Screen & Resilient Markdown Table/H4 Parser**
  - **Phím tắt Multi-Pane Additive `Cmd + ArrowUp` (macOS):**
    + Bấm `Cmd + ArrowUp` luôn luôn mở thêm tab trống mới (`{ id: paneId, sessionId: null }`), hỗ trợ tối đa 4 tab song song, không bao giờ tự thu gọn về 1 tab.
    + Tự động thu gọn Sidebar nếu `windowWidth < 1280` để tối đa hóa không gian đọc và tự động focus ô nhập liệu của tab mới.
    + Khi có từ 3 đến 4 pane: `panesContainer` kích hoạt `overflowX: 'auto'` trên Web và mỗi pane duy trì `minWidth: 320px`, chống co rút xén mép.
  - **Phím tắt Interactive Pane Close Picker `Cmd + ArrowDown` (macOS):**
    + Bấm `Cmd + ArrowDown` bật chế độ điều hướng trực quan chọn tab cần đóng.
    + Bấm `←` / `→` để di chuyển vùng chọn giữa các tab (hiệu ứng viền đỏ `2px solid #EF4444`, nền đỏ nhạt `rgba(239, 68, 68, 0.06)`, các tab khác làm mờ `opacity: 0.72`, pill header `✕ Enter để đóng`).
    + Bấm `Enter` để xác nhận đóng tab đã chọn; bấm `Esc` để hủy chế độ đóng tab.
    + Tự động blur `TextInput` trên Web khi kích hoạt để mũi tên và phím Enter không bị nhập vào ô chat.
    + Floating instruction banner cố định phía trên: `"Đóng tab: Dùng ← / → chọn cửa sổ • Enter để đóng • Esc để hủy"`.
  - **Resilient Markdown Table & Cell Wrapping (`RichMarkdownView.tsx`, `ChatBubble.tsx`):**
    + Tối ưu regex phân cách bảng `TABLE_SEPARATOR_REGEX` linh hoạt chấp nhận dòng separator có hoặc không có dấu gạch đứng biên (`|`), bảo toàn bảng biểu ngay cả khi thiếu dòng trống phía trước.
    + Bảo vệ an toàn tuyệt đối ký tự tiền tệ `$` (e.g. `$96,500.5 | $96,510.0`), ký tự đặc biệt (`≈`, `%`, `+`, `,`), và trailing empty cell (`| |`), chống nhầm lẫn với inline LaTeX math.
    + Tự động chuẩn hóa độ dài hàng theo `headers.length` (pad `""` hoặc trim dư thừa), hiển thị `—` cho ô trống.
    + Truyền prop `compact={compact}` xuống `TableView`: ở chế độ 2-3 cột, cell áp dụng `minWidth: 88, maxWidth: 150, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12.5` kèm `flexShrink: 1, flexWrap: 'wrap'`, chống cắt chữ mép phải.
  - **Hỗ trợ Tiêu đề H1–H6 Không Sót Dấu `#` (`RichMarkdownView.tsx`, `ChatBubble.tsx`):**
    + Nâng cấp regex tiêu đề lên `/^(#{1,6})\s+(.+)$/`, hỗ trợ đầy đủ H4–H6 với kiểu chữ đậm `fontSize: 14.5, fontWeight: '700'`, triệt tiêu hoàn toàn lỗi hiển thị thô `#### Ngày 2:...`.
    + Cập nhật `hasRichBlock` trong `ChatBubble.tsx` nhận diện multiline `^#{1,6}\s`.
  - **Bộ kiểm thử tự động `train_simulator.js`:**
    + Bổ sung kịch bản TEST 36: `Test_Day11_Markdown_Table_And_H4_Parser`.
    + Đạt điểm tuyệt đối 36/36 scenarios (360/360 điểm 100% hoàn hảo).
  - Header cập nhật: **`Online • v4.7.6`**.

#### ✅ Đã hoàn thành (Bản chuẩn hóa UI/UX v4.7.7):
- [x] **Khởi tạo tệp quy chuẩn thiết kế `DESIGN.md` làm Nguồn Sự Thật Duy Nhất (SSOT):**
  - Khóa chặt vào `.antigravity/rules.md`, `.cursorrules`, và `SKILL.md`.
  - Triết lý: Minimalist macOS Native + Gemini Minimalism, ưu tiên Keyboard-First.
- [x] **Header tối giản căn giữa tuyệt đối theo chiều ngang (`App.tsx`):**
  - Trái: Duy nhất nút `☰` toggle Sidebar (`Cmd + B`).
  - Giữa: Cụm `Tomorrow` + badge `Online • v4.7.7` căn giữa tuyệt đối (`position: absolute, left: 0, right: 0`). Xóa bỏ badge tên sổ ghi chú trên Header.
  - Phải: Duy nhất thanh `Tìm kiếm ⌘K` và nút New Chat (`SquarePen`). Xóa hoàn toàn nút Chia đôi cửa sổ và nút Mặt trăng/Mặt trời trên Header.
- [x] **Màn hình mở đầu EmptyState (`components/ColdGreeting.tsx`):**
  - Thay badge tím bằng icon chính thức của ứng dụng `T.M.R` bo góc chuẩn macOS (`56x56`, `borderRadius: 14`, nền đen `#0B0B0D`, 5 cột sóng trắng bên trên, chữ `T.M.R` bên dưới).
  - Một dòng lời chào duy nhất căn giữa: `"Chào ${displayName}, chúng ta nên bắt đầu làm việc gì?"`. Xóa bỏ hoàn toàn lời chào 2 tầng và dòng phụ.
- [x] **Thanh nhập liệu phong cách Gemini & Sửa triệt để lỗi upload tệp (`components/FloatingInputBar.tsx`):**
  - Bỏ icon ảnh cũ, icon Emote, icon Quả cầu bên trái ô nhập liệu.
  - Đặt duy nhất 1 nút tròn `+` kiểu Gemini (khi bấm chuyển thành `×` và mở menu popover nổi phía trên chỉ chứa mục `📎 Tệp`).
  - Gắn thẻ `<input type="file" />` ẩn kích hoạt trực tiếp trong event handler; hỗ trợ ảnh (nén Vision Lab), tệp văn bản / code (`.txt`, `.md`, `.csv`, `.json`, `.py`, `.ts`, `.js`, `.cpp`...), và PDF (kèm chip đính kèm có nút xóa `×`).
- [x] **Dọn sạch bảng `Cmd + K` & Hoạt ảnh chuẩn macOS (`components/CommandPalette.tsx`, `components/SidebarDrawer.tsx`, `App.tsx`):**
  - Xóa bỏ hoàn toàn thanh footer bảng `Cmd + K` (`↑↓`, `↵`, `esc`, thống kê API), thêm đệm đáy danh sách.
  - Cập nhật nhãn phím tắt mục đổi theme thành `⌘R`.
  - Trượt Sidebar mượt `240ms cubic-bezier(0.22, 1, 0.36, 1)`.
  - Tiêm keyframes hoạt ảnh macOS (`macosPanePop`, `macosPalettePop`, `macosFadeIn`, `macosPopoverSlide`) cho ChatPanes, CommandPalette và Popover.
- [x] **Vá triệt để lỗi Idle Timeout khi để app lâu mới nhắn (`services/aiService.ts`):**
  - Lắng nghe `visibilitychange`, `window.focus`, `window.online` và theo dõi `lastActivityAt`. Nếu nghỉ > 90s hoặc thức dậy từ sleep, kích hoạt `needsFreshConnection`.
  - Cơ chế `fetchWithWakeRetry(url, options, timeoutMs)`: Chống stale TCP socket bằng `cache: 'no-store'`, cộng `+5000ms` grace timeout cho lượt đầu, tự động thử lại âm thầm đúng 1 lần sau 350ms khi gặp lỗi mạng/socket chết lần 1 trước khi fallback.
  - Reset cooldown 10 phút cho OpenAI 429 rate limit, tuyệt đối không khóa vĩnh viễn OpenAI khi chỉ bị `AbortError` / Timeout.
  - Bộ kiểm thử tự động `train_simulator.js` bổ sung TEST 39: `Test_v477_Idle_Wake_Retry_And_PromptBudget` đạt 39/39 (390/390 điểm 100% hoàn hảo).
  - Header cập nhật: **`Online • v4.7.7`**.

- [ ] **Ngày 12 – 15: Hoàn thiện Phase 1**
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
   *Yêu cầu bắt buộc: 39/39 kịch bản phải PASS (390/390 điểm) trước khi tạo commit.*
3. **Tăng Version Header & Deploy Production:**
   - Cập nhật số phiên bản trên `App.tsx` (VD: `Online • v4.7.7`).
   - Kiểm tra `.gitignore` đảm bảo không sót `.env` hoặc file nhạy cảm.
   - Deploy Vercel Production:
     ```bash
     npx vercel --prod --yes
     ```
