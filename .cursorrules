# TOMORROW (PROTO-JARVIS) — ARCHITECTURAL RULES & GUARDRAILS

## 1. MÔI TRƯỜNG & CẤU TRÚC CỐT LÕI
- Hệ điều hành phát triển: **macOS** (Ứng dụng đích chạy tại `/Applications/Tomorrow.app` kết nối Vercel Production). Mọi lệnh script/shell phải dùng chuẩn Unix/macOS, không dùng cú pháp Windows.
- Tech Stack: React Native (Expo, TypeScript), lưu trữ cục bộ `AsyncStorage`, Backend Proxy tại `/api/search.js` trên Vercel.
- Các khóa `AsyncStorage` cố định (CẤM ĐỔI TÊN làm mất dữ liệu cũ):
  + `CHAT_SESSIONS_V2`: Danh sách lịch sử các phiên trò chuyện.
  + `USER_MEMORY_PROFILE_V1`: Hồ sơ trí nhớ đa chiều (`UserMemoryVault`).
  + `TOMORROW_THEME_MODE`: Trạng thái giao diện Sáng / Tối (`dark` | `light`).

## 2. LUẬT BẢO TOÀN GIAO DIỆN DESKTOP & MOBILE (`App.tsx`, `SidebarDrawer.tsx`, `ChatBubble.tsx`, `TypingIndicator.tsx`)
- **Luật Đồng Bộ Kép Sidebar:** Trên màn hình rộng (`width >= 768`), bố cục Split-View có thể render Sidebar trong cả `App.tsx` lẫn `components/SidebarDrawer.tsx`. Khi sửa bất kỳ thành phần nào trên Sidebar (như nút `Cuộc trò chuyện mới` chỉ có duy nhất 1 dấu `+`, hoặc hàm lọc tiêu đề `isPlaceholderOrNoiseTitle`), BẮT BUỘC phải kiểm tra và cập nhật đồng bộ ở CẢ HAI FILE.
- **Kích thước & Phông chữ:** Sidebar Desktop cố định rộng `280px` (thu gọn về `0px` khi đóng), vùng chat căn giữa `maxWidth: 820`, phông chữ `Plus Jakarta Sans` / `Inter` làm mịn chuẩn Retina macOS.
- **Bong bóng đợi chat (`TypingIndicator`):** Phải bật tức thì (`0ms delay`) ngay khi user bấm Gửi (`setIsTomorrowTyping(true)`), hiển thị trạng thái động (`🌐 Đang quét web...` / `💭 Đang suy nghĩ...`) và tách mảng `replies` thành từng bong bóng rời nhau `300ms - 500ms`.
- **Dấu hiệu kiểm chứng Cache trên Header:** Mọi bản cập nhật giao diện hoặc logic phải tăng số phiên bản trên Header (VD: `Online • v3.9` -> `Online • v4.0`) để xác nhận cửa sổ `Tomorrow.app` đã nạp bản build mới.

## 3. LUẬT BỘ NÃO PHẢN XẠ 3 LỚP & ĐỊNH TUYẾN MODEL (`services/aiService.ts`)
- **Lớp 1 (Local Reflex - `buildLocalReflexDirective`):** Chạy cục bộ trước khi gọi AI để gán đúng 1 nhãn `[DIRECTIVE: MODE=...]`:
  + `STOP_SIGNAL` (khi user nhắn `"okk"`, `"ok"`, `"ừ"`, `"thôi"`, `"sybau"`, `"cook"`, `"cút"`, `"pp"`): Chỉ trả về DUY NHẤT 1 bong bóng ngắn (1-4 chữ), TUYỆT ĐỐI CẤM đặt câu hỏi ngược lại.
  + `PING` (`"yo"`, `"ê"`, `"hello"`): Đáp 1-2 bong bóng cực ngắn, giữ nguyên `session_title: ""`.
  + `WEB_INTEL`: Trả lời trực tiếp kèm link URL thật ngay trong lượt đó, CẤM HỨA SUÔNG / CÂU GIỜ (`"Chờ mình chút"`, `"Đợi xíu nha"`).
  + `EXPERT_JARVIS` & `CASUAL_FRIEND`: Tự động thích ứng giữa trí tuệ chuyên sâu (ChatGPT/Gemini/J.A.R.V.I.S.) và bạn thân đời thường.
- **Luật Đại Từ Xưng Hô:** CẤM tự ý gọi người dùng là `"bro"` trừ khi người dùng chủ động gọi trước. Nếu user xưng `"t - m"`, khóa cứng cặp đại từ `"t - m"` xuyên suốt.
- **Lớp 2 (`UserMemoryVault`):** Giới hạn tối đa 5 mục mỗi mảng (`pronouns`, `favorites`, `activeProjects`, `habits`, `recentContext`) để giữ prompt dưới 120 tokens.
- **Lớp 3 (`SYSTEM_INSTRUCTION` Tinh Gọn):** Giữ dưới 450 từ kèm 6 ví dụ Few-Shot chuẩn xác đã kiểm chứng qua `train_simulator.js`. CẤM nhồi nhét thêm quy tắc văn bản trùng lặp gây hiện tượng "Lost in the Middle".
- **Chuỗi Xoay Vòng Model (Hybrid Router):** Ưu tiên `callOpenAI` (`gpt-4o-mini` với biến ngắt mạch `isOpenAIUnavailable` tự động chuyển êm khi hết hạn 7 ngày) -> Fallback sang chuỗi 3 tầng Gemini miễn phí (`gemini-3.8-flash` / `gemini-2.5-flash` -> `gemini-3.5-flash-lite` -> `gemma-4-31b-it`). Lưu ý: Trên Gemini API, không bật đồng thời `google_search` grounding và `responseMimeType: "application/json"` trong cùng 1 request nếu gây lỗi HTTP 400.

## 4. LUẬT BẢO MẬT & DEPLOY
- Kiểm tra `.gitignore` luôn chặn `.env`, `.env.*`, `training_results.json` trước mọi lệnh `git add`.
- Luôn chạy `npx expo export -p web` đảm bảo 0 lỗi TypeScript trước khi commit, push và chạy `npx vercel --prod --yes`.
