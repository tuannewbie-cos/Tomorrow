# TOMORROW (PROTO-JARVIS) — ARCHITECTURAL RULES & GUARDRAILS (MASTER PLAN 90 NGÀY / v4.8.2)

## 1. MÔI TRƯỜNG, NỀN TẢNG CỐT LÕI & CÁC KHÓA LƯU TRỮ
- **Hệ điều hành phát triển & vận hành:** macOS (Ứng dụng đích chạy tại `/Applications/Tomorrow.app` kết nối Vercel Production). Mọi script/shell dùng chuẩn Unix/macOS, không dùng cú pháp Windows.
- **Tech Stack:** React Native (Expo, TypeScript strict mode), lưu trữ cục bộ `AsyncStorage`, Backend Serverless Proxy tại `/api/search.js` trên Vercel.
- **Đầy đủ 5 khóa `AsyncStorage` cố định (CẤM ĐỔI TÊN làm mất dữ liệu người dùng):**
  1. `CHAT_SESSIONS_V2`: Danh sách lịch sử các phiên trò chuyện (kèm cơ chế tự động migrate từ `CHAT_HISTORY_V1`).
  2. `USER_MEMORY_PROFILE_V1`: Hồ sơ trí nhớ đa chiều (`StructuredMemoryVault` schema v2 - studySubjects, financeGoals, moodHistory, favorites, activeProjects, habits, recentContext).
  3. `TOMORROW_THEME_MODE`: Trạng thái giao diện Sáng / Tối (`dark` | `light`).
  4. `TOMORROW_QUOTA_STATS_V1`: Thống kê hạn mức và lưu lượng gọi API theo ngày của OpenAI và Gemini (`services/quotaShield.ts`).
  5. `TOMORROW_NOTEBOOKS_V1`: Quản lý danh sách Sổ ghi chú và bộ 1..4 panes Split Screen theo từng sổ (`storage/notebookStorage.ts`).
- **Các module nền tảng của Master Plan 90 Ngày:**
  - `services/semanticRecallService.ts`: Động cơ tìm kiếm ngữ nghĩa cục bộ 100% trên RAM (< 5ms, 0 API cost): BM25 Okapi (k1=1.5, b=0.75) + Concept Keyword Graph (trọng số 0.45x) + Bộ tách từ song ngữ Việt-Anh accent-folding + Thẻ `[RECALL_MEMORY]` <= 520 ký tự + Tích hợp Cmd+K "TRÍ NHỚ & NỘI DUNG CŨ".
  - `services/memoryVaultService.ts`: Lõi quản lý tập trung Hồ sơ Tri thức Đa chiều (`StructuredMemoryVault` schema v2), nâng cấp ngược an toàn (`migrateAndNormalizeVault`), phân loại gộp trùng cục bộ (< 1ms `mergeMemoryIntoVault`), và bơm chọn lọc ngữ cảnh (`buildMemoryContextSlice` <= 480 ký tự).
  - `components/MemoryVaultModal.tsx`: Giao diện quản lý Vault 4 tab gọn gàng chuẩn macOS, tích hợp vào `Cmd + K` (`CommandPalette`).
  - `services/personaRouter.ts`: Bộ điều phối nhân cách kép cục bộ (< 1ms): `COMPANION_MIRROR` (tri kỷ đời thường) vs `JARVIS_LAB` (J.A.R.V.I.S. phòng lab), bộ điều tiết độ hóm hỉnh `dryWitLevel` ('OFF' | 'SUBTLE' | 'SHARP'), và kho chiến thuật `DOMAIN_PLAYBOOKS`.
  - `services/quotaShield.ts`: Lá chắn Quota sinh viên, theo dõi 2 API key độc lập, reset theo ngày `YYYY-MM-DD`, cảnh báo quota và hỗ trợ reset cờ OpenAI.
  - `utils/imageOptimizer.ts`: Bộ nén Canvas Web/macOS cho Vision Lab (tối đa 1024px, JPEG 0.82, giảm 60–80% dung lượng base64).
  - `types/providers.ts`: Cổng định nghĩa trừu tượng sẵn sàng mở rộng đa nhà cung cấp (OpenAI, Gemini, Claude, DeepSeek, Local Ollama).
  - `services/microPsychProfiler.ts`: Bộ giải mã DNA phong cách gõ & 7 trạng thái tâm lý ngầm của người dùng.

## 2. LUẬT BẢO TOÀN GIAO DIỆN DESKTOP & MOBILE (`DESIGN.md`, `App.tsx`, `SidebarDrawer.tsx`, `ChatBubble.tsx`, `RichMarkdownView.tsx`, `TypingIndicator.tsx`)
- **LUẬT THIẾT KẾ CỨNG (`DESIGN.md`):** Trước mọi thay đổi liên quan đến giao diện, bố cục, nút bấm, phím tắt hay hoạt ảnh, BẮT BUỘC đọc và tuân thủ nghiêm ngặt `DESIGN.md`. Cấm tự ý thêm lại các nút/thẻ đã loại bỏ (nhãn sổ trên Header, nút Split Screen, nút Mặt trăng Sáng/Tối, icon Emote/Ngôn ngữ, Footer `Cmd+K`, thẻ gợi ý màn hình trống).
- **Luật Đồng Bộ Kép Sidebar:** Trên màn hình rộng (`width >= 768px`), bố cục Split-View có thể render Sidebar trong cả `App.tsx` lẫn `components/SidebarDrawer.tsx`. Khi sửa bất kỳ thành phần nào trên Sidebar (như nút `Cuộc trò chuyện mới` chỉ có duy nhất 1 dấu `+`, nút xóa thùng rác, hoặc hàm lọc tiêu đề `isPlaceholderOrNoiseTitle`), BẮT BUỘC phải kiểm tra và cập nhật đồng bộ ở CẢ HAI FILE.
- **Kích thước & Phông chữ:** Sidebar Desktop cố định rộng `280px` (thu gọn về `0px` khi đóng), vùng chat căn giữa `maxWidth: 820px`, phông chữ `Plus Jakarta Sans` / `Inter` làm mịn chuẩn Retina macOS.
- **Hệ thống phím tắt & Tiện ích Desktop:**
  + `Cmd + K`: Mở `CommandPalette` tối giản không footer, có tùy chọn `"Reset cờ OpenAI (Thử kết nối lại)"`.
  + `Cmd + B`: Đóng / mở Sidebar mượt mà (animation trượt 240ms).
  + `Cmd + N`: Mở phiên trò chuyện mới tức thì, giữ phiên cũ chạy ngầm không gián đoạn (`typingSessionIds`).
  + `Cmd + R`: Chuyển đổi giao diện Sáng / Tối (`TOMORROW_THEME_MODE`), giữ `Cmd + Shift + R` cho hard reload trình duyệt.
  + `Cmd + ArrowUp`: Luôn mở thêm cửa sổ chat mới (Split Panes kiểu VS Code, tối đa 4 panes theo sổ), không bao giờ gộp lại.
  + `Cmd + ArrowDown`: Bật chế độ chọn tab cần đóng tương tác bằng phím mũi tên `←` / `→` và bấm `Enter` để đóng (`Esc` để hủy).
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
- **Dấu hiệu kiểm chứng Cache trên Header:** Mọi bản cập nhật giao diện hoặc logic phải tăng số phiên bản trên Header (Hiện tại: `Online • v4.8.2`) để xác nhận cửa sổ `Tomorrow.app` đã nạp bản build mới.
- **Quy chuẩn Chia đều 4 Cột 25% & Khởi động 1 Pane Mặc định (`v4.8.2`):**
  + Cấm gán `minWidth` cứng (như `minWidth: 320`) trên `singlePaneWrapper` và `overflowX: 'auto'` trên `panesContainer`. Mọi pane luôn tuân thủ `flex: 1, flexBasis: 0, minWidth: 0, maxWidth: '100%', overflow: 'hidden'` để 4 cột chia đều 25% khít mép không tràn ngang.
  + Chế độ hiển thị mật độ cao (`totalPanes >= 3`): header padding 8px, text co giãn mượt, lời chào fontSize 17–20 không xén chữ "Chào buổi sáng", input pill padding 6–8px và placeholder "Nhắn tin..." gọn gàng.
  + Cold Start / Reload: Luôn mở duy nhất 1 pane trò chuyện trống mặc định (sessionId: null), giữ lịch sử an toàn trong Sidebar.
- **Quy chuẩn Cô lập Split Panes & Điều phối Đồng thời Concurrency Gate (`v4.8.1`):**
  + Tuyệt đối cô lập trạng thái theo `sessionId`: `inFlightSessionsRef` (Set<string>) chặn gửi đúp trên cùng một phiên, cho phép các tab khác gửi song song độc lập.
  + Dọn timer theo `sessionId`: `timersBySessionRef` chỉ xóa timer của chính phiên đó, không xóa timer của 3 tab còn lại.
  + Chuỗi lưu trữ tuần tự hóa (`saveSessionsQueue`): Mọi thao tác ghi `CHAT_SESSIONS_V2` phải qua hàng đợi tuần tự Promise chain, ngăn ngừa race condition ghi đè.
  + Cổng Concurrency Gate (`MAX_CONCURRENT_AI_REQUESTS = 2`): Xếp hàng đợi request thứ 3 và thứ 4 với jitter 150-300ms để chống burst 429 trên OpenAI và Gemini.
  + Phân biệt 429 Burst (RPM/TPM) vs Hard Quota (401, 402, 403, 429 quota): 429 Burst tự động retry sau 900ms + jitter và fallback sang Gemini cho riêng lượt đó, KHÔNG được đánh sập Circuit Breaker toàn cục.
- **Quy chuẩn Kế thừa Ngữ cảnh Chuyên môn & Bong bóng Code Nới Rộng (`v4.7.4`):**
  + Tự động kế thừa chuyên môn `CODE_CS` / `JARVIS_LAB` cho câu hỏi/yêu cầu nối tiếp ngắn (<= 8 từ hoặc các cụm "ví dụ", "đâu", "chi tiết", "giải thích", "tại sao", "code", "innit", "constructor") khi lịch sử gần nhất có code hoặc chuyên môn STEM/Finance/Code. Cấp phát `dynamicMaxTokens = 2000`, `temperature <= 0.35`.
  + Triệt tiêu câu mồi rỗng (`isEmptyTeaserReply`): Tự động gộp câu dẫn mồi ngắn ở phần tử 1 với phần tử 2 trong `sanitizeAndMergeBrokenBlocks`, trả lời 1 bong bóng duy nhất. Tự động retry 1 lần nếu câu trả lời không có code/nội dung.
  + Đính chính chuẩn xác kiến thức nền tảng ngay dòng đầu tiên (như `def` vs constructor `__init__`), cấm hùa theo hoặc giải thích sai lệch.
  + Bong bóng chứa Code/Bảng mở rộng đúng tỷ lệ: `width: compact ? '96%' : '88%'`, `maxWidth: compact ? '98%' : 740`, `minWidth: compact ? 260 : 320`.
  + Header của `CodeBlock`: `flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 8`. Nút `📋 Sao chép` tách biệt rõ ràng, không bao giờ dính sát dòng ngôn ngữ code.
- **Quy chuẩn Split Screen 50/50, Hợp nhất `<ChatPaneView />` & Khóa chiều cao Input Pill (`v4.7.3`):**
  + Hợp nhất toàn bộ các khung chat thành DUY NHẤT một component `ChatPaneView` trong `App.tsx`, đảm bảo khung mặc định bên trái và khung phụ bên phải có cùng 100% cây DOM, props và cấu trúc styling.
  + Khung chia đôi buộc đặt `flex: 1, flexBasis: 0, minWidth: 0, maxWidth: '100%', overflow: 'hidden'` triệt tiêu lỗi phình/xén mép trái. Màn hình `< 1280px` tự động đóng Sidebar khi bật Split Screen.
  + Thẻ `ColdGreeting`, `ChatBubble`, `RichMarkdownView` hỗ trợ cờ `compact` cho mật độ đọc 2 cột.
  + Khóa thanh nhập liệu `FloatingInputBar`: `minHeight: 48`, `alignItems: 'center'`, `rows={1}`, loại bỏ hoàn toàn `alignItems: 'flex-end'` và ngắt `onContentSizeChange` trên Web nhằm ngăn `<textarea>` tự ý phình cao (~85px) khi co giãn layout. Hỗ trợ tính năng `adjustWebTextareaHeight` nội dòng mượt mà từ 24px đến 110px.
  + Chuẩn hóa fence dính liền (`normalizeMarkdownFences`) và bộ phân tích State Machine bảo vệ trọn vẹn comment `#` trong code blocks.

## 3. LUẬT BỘ NÃO PHẢN XẠ NHÂN CÁCH KÉP, ĐỊNH TUYẾN CHUYÊN MÔN CON & CHUẨN HÓA VISION (`services/aiService.ts` & `services/personaRouter.ts`)
- **Lớp 1 (Local Dual-Persona & Reflex Budgeting):**
  - Chạy cục bộ < 1ms thông qua `resolveDualPersona`, `buildLocalReflexDirective`, `detectExpertDomain`, `buildChronoContext`, và `microPsychProfiler`.
  - Phân nhánh 2 chế độ nhân cách cốt lõi:
    + `COMPANION_MIRROR`: Kích hoạt khi chat đời thường, tâm sự, ping hoặc stop signal. Sao chép DNA ngôn ngữ, xưng hô đồng điệu, 1-2 bong bóng ngắn, không giảng đạo lý. TypingIndicator chỉ hiện 3 chấm • • • mượt mà.
    + `JARVIS_LAB`: Kích hoạt tức thì khi gặp câu hỏi STEM / Tài chính / Code / Vision / Web. Điềm tĩnh, chuẩn xác, Markdown/LaTeX sạch đẹp, nạp đúng 1 playbook tương ứng từ `DOMAIN_PLAYBOOKS`. TypingIndicator hiển thị nhãn nhánh chuyên môn tinh tế (`⚡ J.A.R.V.I.S. • Code`, `⚡ J.A.R.V.I.S. • STEM`, `⚡ J.A.R.V.I.S. • Finance`, `👁️ Vision Lab đang đọc ảnh...`, `🌐 Đang quét web...`).
  - **Bộ điều tiết độ hóm hỉnh ngầm (`dryWitLevel`):** Khóa cứng `OFF` khi phát hiện stress, masked sadness, ngập ngừng cao (`hesitation === 'HIGH'`) hoặc stop signal; đặt `SUBTLE` ở Jarvis Lab; `SHARP` khi người dùng hào hứng hoặc trêu đùa.
  - **Rào chắn cứng khử mùi trợ lý máy móc (`stripRoboticClosings`):** Tự động gọt sạch các câu kết rập khuôn vô nghĩa ("Hy vọng giúp ích...", "Nếu cần gì cứ hỏi nhé...", "Chúc bạn học tốt...") nhưng bảo toàn 100% code blocks và công thức.
  - Phân nhánh và cấp phát Token / Dynamic Timeout / Temperature:
    + `STOP_SIGNAL`: `max_tokens: 250`, `timeout: 8000ms`. Trả về DUY NHẤT 1 bong bóng ngắn (1-4 chữ), cấm hỏi ngược, thuần văn bản.
    + `PING`: `max_tokens: 250`, `timeout: 8000ms`. Đáp 1-2 bong bóng cực ngắn, giữ nguyên `session_title: ""`.
    + `CASUAL_FRIEND`: `max_tokens: 250`, `timeout: 8000ms`, `temperature: 0.75`.
    + `WEB_INTEL`: `max_tokens: 1200`, `timeout: 30000ms`. Quét web thật, đưa link nguồn trực tiếp, không hứa suông.
    + **Bộ định tuyến chuyên môn con (`detectExpertDomain`):**
      * `STEM_PHYSICS_MECH` / `STEM_PHYSICS_MECHANICS`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`.
      * `STEM_CHEM_BIO`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`.
      * `STEM_ELECTRONICS`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`.
      * `CODE_CS` / `STEM_CODE`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`.
      * `STEM_MATH`: `max_tokens: 2000`, `timeout: 30000ms`, `temperature: 0.35`.
      * `FINANCE_QUANT`: `max_tokens: 1200 - 1500`, `timeout: 30000ms`, `temperature: 0.35`.
      * `VISION_LAB`: `max_tokens: 2500`, `timeout: 35000ms`, `temperature: 0.25`.
  - **Chuẩn hóa Payload ảnh Vision (`normalizeVisionImage`):** Tách `mimeType` và `pureBase64` sạch sẽ. OpenAI nhận `image_url` với `detail: 'high'`; Gemini nhận `inlineData: { mimeType, data: pureBase64 }`.
  - **Kế thừa ảnh cho câu hỏi nối tiếp (`resolveCarriedOverVisionImage`):** Tự động phát hiện các câu hỏi tham chiếu (`bài trên`, `câu 2`, `giải lại`, `làm lại`) hoặc khi lượt trước bị lỗi để nạp lại ảnh từ 2 tin nhắn gần nhất của user.
  - **Làm sạch lịch sử gửi API (`normalizeHistoryForAPI`):** Lọc bỏ 100% tin nhắn lỗi mạng (`isNetworkErrorMessage`), gộp các tin nhắn cùng role liên tiếp, đảm bảo lịch sử luôn luân phiên chuẩn xác `user <-> model`.
  - **Bảo vệ ngữ cảnh thời gian thực (`buildChronoContext`):** 6 khung nhịp sinh học, cấm nhận xét thức khuya lệch pha khi không phải khung `LATE_NIGHT`.
  - **Bộ ghép nối an toàn (`sanitizeAndMergeBrokenBlocks`):** Tự động phát hiện và nối gộp khối code bị mở ```` ``` ```` mà chưa đóng sang phần tử kế tiếp trong mảng `replies`.
- **Lớp 2 (Hồ sơ Tri thức Đa chiều `StructuredMemoryVault` — Schema v2):**
  - Mở rộng đa chiều: `studySubjects` (tối đa 6), `financeGoals` (tối đa 5), `moodHistory` (tối đa 5), `favorites` (5), `activeProjects` (5), `habits` (5), `recentContext` (5).
  - Bơm chọn lọc ngữ cảnh thông qua `buildMemoryContextSlice`: 0 token cho STOP/PING, ưu tiên môn học cho STEM/Vision, ưu tiên tài chính cho Finance Quant. Luôn `<= 480 ký tự`.
  - **Luật Đại Từ Xưng Hô:** CẤM tự ý gọi người dùng là `"bro"` trừ khi người dùng chủ động gọi trước. Nếu user xưng `"t - m"`, khóa cứng cặp đại từ `"t - m"` xuyên suốt.
- **Lớp 3 (`SYSTEM_INSTRUCTION` Tinh Gọn):**
  - Giữ nghiêm ngặt dưới 450 từ (hiện tại: 439 từ) với bản sắc Dual-Persona rõ rệt kèm 7 ví dụ Golden Few-Shot Bank đã kiểm chứng qua `train_simulator.js`. CẤM nhồi nhét thêm quy tắc văn bản trùng lặp gây hiện tượng "Lost in the Middle".
- **Chuỗi Xoay Vòng Model (Hybrid Router):**
  - Ưu tiên `callOpenAI` (`gpt-4o-mini`). Silent Circuit Breaker chỉ ngắt khi lỗi HTTP 401, 402, 403, 429; AbortError timeout chỉ trượt lượt đó sang Gemini mà KHÔNG khóa vĩnh viễn OpenAI.
  - Fallback sang chuỗi Gemini miễn phí thông minh (`gemini-2.5-flash` / `gemini-2.0-flash` -> `gemini-1.5-flash` / `gemini-1.5-pro` -> `gemma-4-31b-it`).
  - Lưu ý: Trên Gemini API, không bật đồng thời `google_search` grounding và `responseMimeType: "application/json"` trong cùng 1 request nếu gây lỗi HTTP 400.

## 4. QUY TRÌNH KIỂM CHỨNG & DEPLOY
- Kiểm tra `.gitignore` luôn chặn `.env`, `.env.*`, `training_results.json` trước mọi lệnh `git add`.
- Mọi bản cập nhật phải vượt qua:
  1. `npm run typecheck`
  2. `npx expo export -p web` (đảm bảo 0 lỗi biên dịch web)
  3. `node train_simulator.js` (đảm bảo 43/43 kịch bản PASS tuyệt đối 430/430 điểm)
- Chỉ chạy `npx vercel --prod --yes` sau khi đã kiểm tra đầy đủ và được người dùng phê duyệt.
