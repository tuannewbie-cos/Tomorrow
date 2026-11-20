# TOMORROW (PROTO-JARVIS) — ARCHITECTURAL RULES & GUARDRAILS (MASTER PLAN 90 NGÀY / v4.5.4)

## 1. MÔI TRƯỜNG, NỀN TẢNG CỐT LÕI & CÁC KHÓA LƯU TRỮ
- **Hệ điều hành phát triển & vận hành:** macOS (Ứng dụng đích chạy tại `/Applications/Tomorrow.app` kết nối Vercel Production). Mọi script/shell dùng chuẩn Unix/macOS, không dùng cú pháp Windows.
- **Tech Stack:** React Native (Expo, TypeScript strict mode), lưu trữ cục bộ `AsyncStorage`, Backend Serverless Proxy tại `/api/search.js` trên Vercel.
- **Đầy đủ 4 khóa `AsyncStorage` cố định (CẤM ĐỔI TÊN làm mất dữ liệu người dùng):**
  1. `CHAT_SESSIONS_V2`: Danh sách lịch sử các phiên trò chuyện (kèm cơ chế tự động migrate từ `CHAT_HISTORY_V1`).
  2. `USER_MEMORY_PROFILE_V1`: Hồ sơ trí nhớ đa chiều (`UserMemoryVault` - đại từ, sở thích, dự án, thói quen, bối cảnh gần đây).
  3. `TOMORROW_THEME_MODE`: Trạng thái giao diện Sáng / Tối (`dark` | `light`).
  4. `TOMORROW_QUOTA_STATS_V1`: Thống kê hạn mức và lưu lượng gọi API theo ngày của OpenAI và Gemini (`services/quotaShield.ts`).
- **Các module nền tảng của Master Plan 90 Ngày:**
  - `services/quotaShield.ts`: Lá chắn Quota sinh viên, theo dõi 2 API key độc lập, reset theo ngày `YYYY-MM-DD`, cảnh báo quota và hỗ trợ reset cờ OpenAI.
  - `utils/imageOptimizer.ts`: Bộ nén Canvas Web/macOS cho Vision Lab (tối đa 1024px, JPEG 0.82, giảm 60–80% dung lượng base64).
  - `types/providers.ts`: Cổng định nghĩa trừu tượng sẵn sàng mở rộng đa nhà cung cấp (OpenAI, Gemini, Claude, DeepSeek, Local Ollama).
  - `services/microPsychProfiler.ts`: Bộ giải mã DNA phong cách gõ & 7 trạng thái tâm lý ngầm của người dùng.

## 2. LUẬT BẢO TOÀN GIAO DIỆN DESKTOP & MOBILE (`App.tsx`, `SidebarDrawer.tsx`, `ChatBubble.tsx`, `RichMarkdownView.tsx`, `TypingIndicator.tsx`)
- **Luật Đồng Bộ Kép Sidebar:** Trên màn hình rộng (`width >= 768px`), bố cục Split-View có thể render Sidebar trong cả `App.tsx` lẫn `components/SidebarDrawer.tsx`. Khi sửa bất kỳ thành phần nào trên Sidebar (như nút `Cuộc trò chuyện mới` chỉ có duy nhất 1 dấu `+`, nút xóa thùng rác, hoặc hàm lọc tiêu đề `isPlaceholderOrNoiseTitle`), BẮT BUỘC phải kiểm tra và cập nhật đồng bộ ở CẢ HAI FILE.
- **Kích thước & Phông chữ:** Sidebar Desktop cố định rộng `280px` (thu gọn về `0px` khi đóng), vùng chat căn giữa `maxWidth: 820px`, phông chữ `Plus Jakarta Sans` / `Inter` làm mịn chuẩn Retina macOS.
- **Hệ thống phím tắt & Tiện ích Desktop:**
  + `Cmd + K`: Mở `CommandPalette` có dòng trạng thái Quota footer và tùy chọn `"Reset cờ OpenAI (Thử kết nối lại)"`.
  + `Cmd + B`: Đóng / mở Sidebar mượt mà.
  + `Cmd + N`: Mở phiên trò chuyện mới tức thì, giữ phiên cũ chạy ngầm không gián đoạn (`typingSessionIds`).
  + `Cmd + ArrowUp`: Chia đa khung chat song song (Split Panes) kiểu VS Code (tối đa 3 panes).
  + `Enter`: Gửi tin nhắn ngay; `Shift + Enter`: Xuống dòng.
  + `Cmd + V` & Kéo-thả (Drag & Drop): Dán ảnh trực tiếp từ clipboard hoặc kéo thả file ảnh vào ô chat kèm viền sáng thông minh.
- **Bong bóng đợi chat (`TypingIndicator`):** Bật tức thì (`0ms delay`) ngay khi bấm Gửi (`setIsTomorrowTyping(true)`), hiển thị trạng thái động và tách mảng `replies` thành từng bong bóng rời nhau `300ms - 450ms` (`Math.min(Math.max(replyText.length * 8, 300), 450)`).
- **Bố cục Bong bóng Thích ứng Kép (Dual-Width Bubble):**
  + Chat ngắn đời thường (`hasRichBlock === false`): `maxWidth: '75%'` (Desktop) / `'85%'` (Mobile).
  + Chứa code/bảng/công thức/STEM/Vision (`hasRichBlock === true`): Mở rộng mượt mà `maxWidth: 760px` (Desktop) / `'92%'` (Mobile) chuẩn J.A.R.V.I.S HUD.
- **Rich Markdown, Khung Code macOS & Bảng Dữ Liệu Tự Chủ (`RichMarkdownView.tsx`):**
  + Tuyệt đối không cài thư viện markdown ngoài gây lỗi bundler trên Expo Web.
  + Khung Code macOS Terminal: 3 chấm tròn macOS, nhãn ngôn ngữ + số dòng, ScrollView ngang, số dòng bên trái, syntax highlighting và nút Copy 1 chạm (`📋 Sao chép` -> `✓ Đã chép` trong 2000ms).
  + Bảng biểu Grid kèm nút Copy TSV sang Excel/Notion, zebra striping.
  + Công thức Toán học LaTeX Unicode (`$$...$$` hộp căn giữa viền Indigo `#6366F1`, `$...$` nội dòng).
  + Nút Quick Copy phản hồi ở góc dưới bên phải cho tin nhắn >120 ký tự hoặc có rich block.
- **Thanh Nhập Liệu Co Giãn Đa Dòng (`FloatingInputBar.tsx`):** Co giãn từ `44px` đến `160px` theo nội dung; thu về `44px` sau khi gửi; đo đạc nhịp gõ ẩn `KeystrokeTelemetry` bằng `useRef` (zero re-render).
- **Dấu hiệu kiểm chứng Cache trên Header:** Mọi bản cập nhật giao diện hoặc logic phải tăng số phiên bản trên Header (Hiện tại: `Online • v4.5.4`) để xác nhận cửa sổ `Tomorrow.app` đã nạp bản build mới.

## 3. LUẬT BỘ NÃO PHẢN XẠ 3 LỚP, ĐỊNH TUYẾN CHUYÊN MÔN CON & CHUẨN HÓA VISION (`services/aiService.ts`)
- **Lớp 1 (Local Reflex & Dynamic Budgeting):**
  - Chạy cục bộ < 1ms thông qua `buildLocalReflexDirective`, `detectExpertDomain`, `buildChronoContext`, và `microPsychProfiler`.
  - Phân nhánh và cấp phát Token / Dynamic Timeout / Temperature:
    + `STOP_SIGNAL` (`"okk"`, `"ok"`, `"ừ"`, `"thôi"`, `"sybau"`, `"cook"`, `"cút"`, `"pp"`): `max_tokens: 250`, `timeout: 8000ms`. Trả về DUY NHẤT 1 bong bóng ngắn (1-4 chữ), cấm hỏi ngược, thuần văn bản.
    + `PING` (`"yo"`, `"ê"`, `"hello"`): `max_tokens: 250`, `timeout: 8000ms`. Đáp 1-2 bong bóng cực ngắn, giữ nguyên `session_title: ""`.
    + `CASUAL_FRIEND`: `max_tokens: 250`, `timeout: 8000ms`, `temperature: 0.75`.
    + `WEB_INTEL`: `max_tokens: 1200`, `timeout: 30000ms`. Quét web thật, đưa link nguồn trực tiếp, không hứa suông.
    + **Bộ định tuyến chuyên môn con (`detectExpertDomain`):**
      * `STEM_PHYSICS_MECH`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`, chỉ đạo LaTeX & thứ nguyên.
      * `STEM_CHEM_BIO`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`, chỉ đạo phương trình LaTeX & cơ chế.
      * `STEM_ELECTRONICS`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`, chỉ đạo an toàn điện áp/chân pin.
      * `CODE_CS`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`, chỉ đạo code sạch & nguyên nhân gốc.
      * `FINANCE_QUANT`: `max_tokens: 1200`, `timeout: 30000ms`, `temperature: 0.35`, chỉ đạo bảng số liệu & rủi ro.
      * `VISION_LAB`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`, chỉ đạo đọc chi tiết chữ viết tay/linh kiện/biểu đồ.
  - **Chuẩn hóa Payload ảnh Vision (`normalizeVisionImage`):** Tách `mimeType` và `pureBase64` sạch sẽ. OpenAI nhận `image_url` với `detail: 'high'`; Gemini nhận `inlineData: { mimeType, data: pureBase64 }`.
  - **Kế thừa ảnh cho câu hỏi nối tiếp (`resolveCarriedOverVisionImage`):** Tự động phát hiện các câu hỏi tham chiếu (`bài trên`, `câu 2`, `giải lại`, `làm lại`) hoặc khi lượt trước bị lỗi để nạp lại ảnh từ 2 tin nhắn gần nhất của user.
  - **Làm sạch lịch sử gửi API (`normalizeHistoryForAPI`):** Lọc bỏ 100% tin nhắn lỗi mạng (`isNetworkErrorMessage`), gộp các tin nhắn cùng role liên tiếp, đảm bảo lịch sử luôn luân phiên chuẩn xác `user <-> model` (loại trừ vĩnh viễn lỗi HTTP 400 Bad Request từ Gemini).
  - **Bảo vệ ngữ cảnh thời gian thực (`buildChronoContext`):** 6 khung nhịp sinh học, cấm nhận xét thức khuya lệch pha khi không phải khung `LATE_NIGHT`.
  - **Bộ ghép nối an toàn (`sanitizeAndMergeBrokenBlocks`):** Tự động phát hiện và nối gộp khối code bị mở ```` ``` ```` mà chưa đóng sang phần tử kế tiếp trong mảng `replies`.
- **Lớp 2 (Hồ sơ Trí nhớ `UserMemoryVault`):**
  - Giới hạn tối đa 5 mục mỗi mảng (`pronouns`, `favorites`, `activeProjects`, `habits`, `recentContext`) để giữ prompt dưới 120 tokens.
  - **Luật Đại Từ Xưng Hô:** CẤM tự ý gọi người dùng là `"bro"` trừ khi người dùng chủ động gọi trước. Nếu user xưng `"t - m"`, khóa cứng cặp đại từ `"t - m"` xuyên suốt.
- **Lớp 3 (`SYSTEM_INSTRUCTION` Tinh Gọn):**
  - Giữ nghiêm ngặt dưới 450 từ (hiện tại: 442 từ) kèm 6 ví dụ Few-Shot chuẩn xác đã kiểm chứng qua `train_simulator.js`. CẤM nhồi nhét thêm quy tắc văn bản trùng lặp gây hiện tượng "Lost in the Middle".
- **Chuỗi Xoay Vòng Model (Hybrid Router):**
  - Ưu tiên `callOpenAI` (`gpt-4o-mini`). Silent Circuit Breaker chỉ ngắt khi lỗi HTTP 401, 402, 403, 429; AbortError timeout chỉ trượt lượt đó sang Gemini mà KHÔNG khóa vĩnh viễn OpenAI.
  - Fallback sang chuỗi Gemini miễn phí thông minh (`gemini-2.5-flash` / `gemini-2.0-flash` -> `gemini-1.5-flash` / `gemini-1.5-pro` -> `gemma-4-31b-it`).
  - Lưu ý: Trên Gemini API, không bật đồng thời `google_search` grounding và `responseMimeType: "application/json"` trong cùng 1 request nếu gây lỗi HTTP 400.

## 4. LUẬT BẢO MẬT & QUY TRÌNH DEPLOY
- Kiểm tra `.gitignore` luôn chặn `.env`, `.env.*`, `training_results.json` trước mọi lệnh `git add`.
- Mọi bản cập nhật phải vượt qua:
  1. `npm run typecheck`
  2. `npx expo export -p web` (đảm bảo 0 lỗi biên dịch web)
  3. `node train_simulator.js` (đảm bảo 17/17 kịch bản PASS tuyệt đối 170/170 điểm)
- Chỉ chạy `npx vercel --prod --yes` sau khi đã kiểm tra đầy đủ và được người dùng phê duyệt.
