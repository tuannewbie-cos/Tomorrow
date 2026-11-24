# DESIGN.md — Nguồn Sự Thật Duy Nhất Về UI/UX (Tomorrow macOS & Web)

Tài liệu này là **Nguồn Sự Thật Duy Nhất (Single Source of Truth - SSOT)** về chuẩn mực thiết kế giao diện (UI) và trải nghiệm người dùng (UX) của ứng dụng **Tomorrow** (React Native Expo, macOS / Web). Mọi bản cập nhật, tính năng mới hoặc chỉnh sửa code liên quan đến giao diện BẮT BUỘC phải đọc và tuân thủ tuyệt đối các quy định dưới đây.

---

## 1. Triết Lý Thiết Kế Cốt Lõi (Core Philosophy)
- **Minimalist macOS Native + Gemini Minimalism:** Đơn giản tối đa, không nút thừa, không thanh trạng thái rườm rà. Giao diện sạch sẽ như một ứng dụng macOS gốc kết hợp phong cách tối giản thanh lịch của Google Gemini.
- **Keyboard-First (Bàn phím là ưu tiên số 1):** Mọi tác vụ quản lý cửa sổ, chuyển đổi theme, tìm kiếm và tương tác chính đều có phím tắt chuẩn macOS (`Cmd + K`, `Cmd + B`, `Cmd + N`, `Cmd + R`, `Cmd + ArrowUp`, `Cmd + ArrowDown`).
- **Zero Distraction:** Tập trung 100% vào nội dung cuộc đối thoại và tư duy làm việc.

---

## 2. Quy Chuẩn Bố Cục & Thành Phần (Component Standards)

### A. Thanh Header (Đầu Trang)
- **Chiều cao cố định:** `60px`, trải rộng 100% chiều ngang cửa sổ, phân chia rõ ràng với phần thân bằng đường viền mờ `1px` (`borderSubtle`).
- **Phía bên trái:**
  - **Duy nhất 1 nút `☰`** (Menu icon, 38x38 bo tròn) để đóng/mở Sidebar (`Cmd + B`).
- **Chính giữa (Căn giữa tuyệt đối theo chiều ngang):**
  - Cụm tiêu đề **`Tomorrow`** (`fontSize: 16.5`, `fontWeight: '700'`) đi kèm viên thuốc trạng thái **`Online • v4.9.2`** (chấm tròn xanh dịu + chữ xanh).
  - Sử dụng bố cục căn giữa tuyệt đối (`position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'none'`) để không bao giờ bị lệch tâm dù nhóm nút bên phải dài hơn bên trái.
  - **NGHIÊM CẤM:** Hiển thị thẻ tên Sổ ghi chú (VD: `📁 test`, `📁 Ghi chú chung`) hay dòng trạng thái `"Đang nhớ: ..."` trên Header.
- **Phía bên phải:**
  - **Duy nhất 2 thành phần:**
    1. Nút **`Tìm kiếm ⌘K`** chuẩn **Lucian #471** (trên màn hình Desktop `width >= 768px`):
       - Chiều cao cân xứng Header `36px`, bo góc `12px`, nền hòa sắc theme (`#1E1F26` Dark / `#FFFFFF` Light), viền mỏng và đổ bóng sâu.
       - Kính lúp xoay nhẹ và phóng to (`rotate(-14deg) scale(1.14)`) khi kích hoạt (`.is-hit`).
       - Cụm phím cơ nổi 3D gồm đế phím và nắp phím (`⌘` hoặc `Ctrl` tự động nhận diện theo OS và `K`):
         * Trạng thái `.is-down`: nắp phím lún xuống `2.5px`, chữ đổi màu accent, viền sáng accent; nhả ra nảy lò xo về vị trí ban đầu `translateY(0)` trong `0.42s`.
         * Trạng thái `.is-ask`: nhún nhẹ và phát hào quang mềm `var(--tmr-accent-soft)` khi người dùng đang giữ `⌘` / `Ctrl` chờ bấm `K`.
         * Sóng gợn `tmr-kbtn-rp` lan tỏa từ tâm cụm phím `⌘K` ra toàn bộ nút khi nhấn kích hoạt.
       - Đồng bộ phím tắt toàn cục `Cmd/Ctrl + K` (mở Command Palette sau 110ms cho mắt kịp thấy nhịp nhấn phím cơ, hoặc đóng ngay tức thì).
    2. Nút **Tạo cuộc trò chuyện mới** (`SquarePen` icon, 38x38 bo tròn).
  - **NGHIÊM CẤM:** Đặt nút Chia đôi màn hình (Split Screen) và nút Mặt trăng/Mặt trời chuyển Sáng/Tối trên Header (đã chuyển hoàn toàn sang phím tắt).

---

### B. Màn Hình Mở Đầu Chuẩn Claude (EmptyState / Welcome Screen Khi Chưa Có Tin Nhắn)
- **Áp dụng:** Chỉ khi phiên/pane chưa có tin nhắn nào (`messages.length === 0`). Ngay khi gửi tin nhắn đầu tiên (`messages.length > 0`), giao diện tự động chuyển sang chế độ chat tiêu chuẩn với FlatList và thanh nhập liệu cố định ở đáy.
- **Bố cục căn giữa màn hình (Claude Welcome Layout):**
  - Căn giữa tuyệt đối theo cả chiều dọc và chiều ngang, dịch nhẹ lên trên tâm `~6%` cho cân thị giác macOS (`claudeWelcomeCenterContainer`).
  - Trong Split Screen đa tab (`isSplitMode`), mỗi pane trống hiển thị gọn đẹp bố cục này trong phạm vi riêng của pane (`paddingHorizontal: 16`).
  1. **Hàng chào ngang (`claudeGreetingRow`):**
     - **Bên trái — Biểu tượng lõi thích ứng (`TomorrowGlyph`):**
       + Nền trong suốt 100%, không hộp vuông đen, không khung viền bao quanh.
       + Cụm 5 cột sóng cân đối đặc trưng của Tomorrow với 2 đầu bo tròn êm ái, nhịp điệu hài hòa (`size: 26 - 32px`).
       + Tự động đổi màu: `#F3F4F6` trên nền Tối (Dark Mode) và `#18181B` trên nền Sáng (Light Mode).
     - **Bên phải — Lời chào thời gian thực chuẩn Claude:**
       + Cực ngắn gọn theo khung giờ thực tế trong ngày:
         * `04:00 – 11:29`: **`"Chào buổi sáng"`**
         * `11:30 – 13:29`: **`"Chào buổi trưa"`**
         * `13:30 – 17:59`: **`"Chào buổi chiều"`**
         * `18:00 – 22:59`: **`"Suy nghĩ buổi tối"`**
         * `23:00 – 03:59`: **`"Tĩnh lặng đêm khuya"`**
       + Kiểu chữ thanh lịch: `fontSize: 24 - 32px`, `fontWeight: '500'`, `letterSpacing: -0.6`, font `Georgia, "Times New Roman", "Plus Jakarta Sans", serif` (`#ECECEC` Dark / `#1A1A1A` Light).
  2. **Khung nhập liệu Prompt Box Lucian #452 đặt NGAY DƯỚI dòng chào ở chính giữa màn hình:**
     - Hộp Prompt Box 2 tầng bo góc `24px` (`maxWidth: 680px` / split-mode thích ứng, viền mảnh tinh tế, placeholder `"Hôm nay tôi có thể giúp gì cho bạn?"`).
     - Bảo toàn đầy đủ: nút tròn `+` (popover `📎 Tệp`) bên trái và nút tròn Gửi / Dừng biến hình bên phải.
- **NGHIÊM CẤM:**
  - CẤM dùng khung vuông đen bọc ngoài icon.
  - CẤM dùng badge tím `✨ Tomorrow` hay dòng phụ dài dòng.
  - CẤM đặt các thẻ gợi ý tâm sự nhanh / mẫu câu hỏi rườm rà.

---

### C. Thanh Nhập Liệu (Prompt Box) Chuẩn Lucian #452 (Online • v4.9.1)
- **Bố cục 2 tầng bo góc mềm mại (`border-radius: 24px`):** Thiết kế tối giản, thanh thoát (`maxWidth: 760px` ở chế độ 1 cột, `maxWidth: 100%` trong Split Screen 2–4 tab; padding: `14px 14px 10px 16px`, nén nhẹ `10px 8px 8px 12px` ở màn hình mật độ cao).
- **Tầng trên (Input & Attachment Tier):**
  + Khu vực preview đính kèm: Hiển thị gọn gàng các chip tệp (văn bản, code, PDF) hoặc preview ảnh nén Vision Lab kèm nút xóa tròn đỏ `×`.
  + Ô nhập liệu tự giãn mượt: Textarea trên Web (hoặc TextInput trên Native), chiều cao cơ bản 1 dòng `24px`, tự giãn theo nội dung đến tối đa `96px` (4 dòng) với transition mượt mà (`height .34s cubic-bezier(.3,1.25,.5,1)`), ẩn thanh cuộn; chỉ bật `overflow-y: auto` khi vượt quá 4 dòng.
  + Hiệu ứng chữ bay mờ khi gửi (`flyTextAnimation`): Chạy Web Animations API đẩy phần tử chữ bay lên `-22px` và mờ dần trong `420ms cubic-bezier(.3,.6,.3,1)` trước khi biến mất, đồng thời thu ô nhập liệu mượt về lại `24px`.
- **Viền xoay sáng Conic Glow Spin (`tmr-prompt-glow`):**
  + Viền gradient xoay 360 độ góc phát sáng (`conic-gradient`) chạy mượt quanh bo góc `24px` bằng CSS `@property --tmr-glow-a` và `@keyframes tmr-glow-spin`.
  + Chỉ hiển thị và chạy khi phiên/pane đang sinh phản hồi (`isGenerating === true`), chuyển mờ êm dịu `0.45s` khi bắt đầu và khi kết thúc.
- **Tầng dưới (Action Toolbar):**
  + **Bên trái — Nút tròn dấu `+` duy nhất (`34x34px`):**
    * Bo tròn 50%, viền mảnh tinh tế, icon dấu `+` SVG `16x16`.
    * Khi bấm: xoay mượt thành icon `×` và hiển thị popover nổi ngay phía trên nút.
    * Popover CHỈ chứa **duy nhất 1 mục: `📎 Tệp`** (kết nối trực tiếp thẻ `<input type="file" />` để chọn ảnh, PDF, text, code).
    * Nhấn `Esc` hoặc bấm ra ngoài tự động đóng popover.
  + **Ở giữa: ĐỂ TRỐNG HOÀN TOÀN.**
  + **Bên phải (`margin-left: auto`) — Nút tròn Gửi / Dừng biến hình (`34x34px`):**
    * Có hiệu ứng nảy lò xo (`spring bump`) bằng Web Animations API khi chuyển từ rỗng sang sẵn sàng gửi.
    * Khi chưa có nội dung: Trạng thái disabled, nền xám dịu.
    * Khi có nội dung sẵn sàng gửi: Nền tương phản cao đơn sắc + icon mũi tên hướng lên (`ArrowUp` `18x18`, nét `2.3`).
    * Khi đang sinh phản hồi (`isGenerating === true`): Nút vẫn bấm được, icon mũi tên thu nhỏ bay lên mờ dần, bung ra ô vuông bo góc `11x11px` ở tâm để người dùng bấm **Dừng** phản hồi tức thì (kết nối `AbortController` hủy fetch mạng và vòng lặp bong bóng mà không báo lỗi đỏ).
- **Cơ chế tải tệp lên (File Upload):**
  - Web: Sử dụng thẻ `<input type="file" ... />` ẩn qua ref, kích hoạt ngay trong event handler của mục `📎 Tệp` để không bao giờ bị chặn.
  - Hỗ trợ ảnh (`image/*`): Nén canvas chuẩn qua `utils/imageOptimizer.ts`, hiển thị preview ảnh có nút xóa `×`.
  - Hỗ trợ tệp văn bản / mã nguồn (`.txt`, `.md`, `.csv`, `.json`, `.py`, `.ts`, `.js`, `.cpp`...): Đọc nội dung qua `FileReader.readAsText`, hiển thị chip tệp đính kèm có nút xóa `×`, tự động đính kèm nội dung vào tin nhắn gửi cho AI.
  - Hỗ trợ tệp PDF: Đọc và hiển thị chip tệp, gửi dữ liệu nhị phân/base64 an toàn.
- **NGHIÊM CẤM:**
  - **TUYỆT ĐỐI CẤM** thêm nút chọn model (như `Nova 2`, `Claude`, `GPT`), icon Emote (mặt cười), icon Web/Quả cầu vào thanh Prompt Box.
  - CẤM thanh footer chứa gợi ý hay thông tin ngoài lề.

---

### D. Bảng Lệnh Nhanh (Command Palette — `Cmd + K`)
- **Bố cục:** Hộp thoại modal nổi bật giữa màn hình với backdrop mờ (`backdropFilter: blur(6px)`).
- **Phía trên:** Ô tìm kiếm tức thì (`ESC` badge ở góc phải).
- **Phía dưới:** Danh sách các thao tác nhanh và kết quả tìm kiếm phân nhóm rõ ràng.
- **Khoảng đệm đáy:** `paddingBottom: 10px` cho danh sách.
- **NGHIÊM CẤM:** Thanh chân trang (Footer) chứa mô tả phím (`↑↓ di chuyển`, `↵ chọn`, `esc đóng`) hay dòng thống kê `API hôm nay: ... • Mode: ...`.

---

## 3. Hệ Thống Phím Tắt Chuẩn macOS (macOS Native Shortcuts)
| Phím tắt | Tác vụ | Ghi chú |
| :--- | :--- | :--- |
| **`Cmd + B`** | Đóng / mở Sidebar | Animation trượt mượt 240ms |
| **`Cmd + K`** | Mở / đóng Command Palette | Animation popup mượt 200ms |
| **`Cmd + N`** | Mở cuộc trò chuyện mới | Giữ các phiên ngầm hoạt động |
| **`Cmd + R`** | Chuyển đổi Sáng / Tối (`TOMORROW_THEME_MODE`) | Không giữ Shift; `Cmd+Shift+R` giữ cho hard reload |
| **`Cmd + ArrowUp`** | Mở thêm cửa sổ chat (Split Screen) | Tối đa 4 panes theo sổ ghi chú, animation popup 260ms |
| **`Cmd + ArrowDown`** | Bật chế độ chọn đóng tab | Dùng `←`/`→` chọn tab, `Enter` để đóng, `Esc` để hủy |
| **`Cmd + V`** | Dán ảnh từ clipboard | Tự động nén và đính kèm Vision Lab |
| **`Enter`** | Gửi tin nhắn ngay | Gửi tức thì nếu có chữ hoặc tệp/ảnh |
| **`Shift + Enter`** | Xuống dòng | Ô nhập liệu tự giãn dòng đến 110px |
| **`Cmd + C / V / X / A / Z`** | Sao chép, Dán, Cắt, Chọn tất cả, Hoàn tác | Bảo toàn 100% trong WebView và Input |

---

## 4. Hệ Thống Chuyển Động & Kiểu Chữ (Motion & Typography)
- **Typography:** Ưu tiên font `Plus Jakarta Sans` / `SF Pro Text` / `SF Pro Display` / `Inter`, hiển thị siêu mịn chuẩn Retina macOS. Dòng chào mở đầu dùng font serif thanh thoát (`Georgia, "Times New Roman", "Plus Jakarta Sans", serif`).
- **Đường cong chuyển động (Easing Curves):**
  - Popups & Modals: `cubic-bezier(0.16, 1, 0.3, 1)` (chuẩn macOS App Launch Spring).
  - Trượt Sidebar & Drawer: `cubic-bezier(0.22, 1, 0.36, 1)` trong `240ms`.
  - Hiệu ứng đạt mượt mà 60fps, không giật lag.

---

## 5. Bảng Màu & Độ Tương Phản Tách Lớp (Surface Contrast Tokens)
Để đạt chuẩn chiều sâu thị giác macOS, Sidebar và Khung chat chính luôn có độ tương phản tách lớp rõ rệt:

| Thành phần | Nền Tối (Dark Mode) | Nền Sáng (Light Mode) |
| :--- | :--- | :--- |
| **Khung chat chính & Header** | `#171717` (Đen sâu than chì) | `#FFFFFF` (Trắng tinh khiết) |
| **Thanh Sidebar (Cạnh trái)** | `#202020` (Xám đậm tách lớp) | `#F5F5F7` (Xám bạc nhẹ macOS) |
| **Đường viền phân tách (`borderSubtle`)** | `#2E2E2E` | `#E5E7EB` |
| **Khung nhập liệu (`inputBg` / `inputBorder`)** | `#262626` / `#363636` | `#FFFFFF` / `#E2E4E8` |
| **Item Sổ ghi chú đang chọn (`activeBg`)** | `#2C2C2E` | `#EAEAEE` |
| **Biểu tượng lõi (`TomorrowGlyph`)** | `#F3F4F6` (Trắng ngà sắc nét) | `#18181B` (Đen than sang trọng) |
| **Dòng chữ chào (`claudeGreetingText`)** | `#ECECEC` | `#1A1A1A` |
| **Đường line Split Pane active (`activePaneLine`)** | **`#FFFFFF` (Trắng đơn sắc, 1.5–2px)** | **`#000000` (Đen đơn sắc, 1.5–2px)** |

---

## 6. Chỉ Báo Cửa Sổ Chat Đa Tab (Active Split-Pane Indicator)
- **Quy chuẩn đường line active:**
  - **NGHIÊM CẤM** dùng đường line màu tím (`#8B5CF6`, `#6366F1`) hay bất kỳ màu sắc ngoại lai nào khác trên thanh tiêu đề Split Pane.
  - **Bắt buộc dùng đường line đơn sắc tương phản tuyệt đối theo theme:**
    + **Khi giao diện là Theme Tối (Dark Mode):** Đường line đáy của pane đang active có màu **Trắng (`#FFFFFF`)**, độ dày `1.5px`–`2px` sắc nét. Pane không active giữ viền mảnh trung tính `#2E2E2E`.
    + **Khi giao diện là Theme Sáng (Light Mode):** Đường line đáy của pane đang active có màu **Đen (`#000000`)**, độ dày `1.5px`–`2px` sắc nét. Pane không active giữ viền mảnh trung tính `#E5E7EB`.
- **Đồng bộ thanh tiêu đề & Icon:**
  - Nền thanh header pane dùng tông xám trung tính tinh tế (`#1C1C1E` Dark / `#F7F7F8` Light khi active), loại bỏ hoàn toàn ánh xanh/tím.
  - Icon chat (`MessageSquare`) cạnh tên phiên chuyển sang đơn sắc `#F4F4F5` (Dark Mode) / `#18181B` (Light Mode) khi active.
