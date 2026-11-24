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
  - Cụm tiêu đề **`Tomorrow`** (`fontSize: 16.5`, `fontWeight: '700'`) đi kèm viên thuốc trạng thái **`Online • v4.9.6`** (chấm tròn xanh dịu + chữ xanh).
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

### C. Thanh Nhập Liệu (Prompt Box) Chuẩn Lucian #452 1 Hàng Ngang (Online • v4.9.5)
- **Bố cục 1 hàng ngang thẳng tâm tuyệt đối (`border-radius: 28px`):** Thiết kế dạng viên thuốc thanh lịch, 3 phần tử `[+]` — `Ô nhập chữ` — `[↑]` nằm trên cùng một hàng ngang duy nhất (`align-items: flex-end`, `gap: 10px`). Chiều cao cơ bản 1 dòng ~`54px` (khung `maxWidth: 760px` ở chế độ 1 cột, `maxWidth: 100%` trong Split Screen 2–4 tab; padding: `10px 10px`, nén nhẹ `9px 10px` ở Split Screen mật độ cao). Nếu có preview ảnh/tệp đính kèm, hiển thị thành hàng riêng phía trên hàng nhập liệu bên trong vỏ hộp.
- **Căn thẳng tâm tuyệt đối giữa 3 phần tử (1 Dòng):**
  + **Bên trái:** Nút tròn `+` cố định `34x34px` kèm popover đính kèm.
  + **Ở giữa:** Ô nhập liệu Textarea khớp chính xác chiều cao `34px` ở 1 dòng (`font-size: 15px`, `line-height: 24px`, `padding: 5px 2px` -> 24px + 5px trên + 5px dưới = đúng `34px`), đảm bảo dòng chữ, placeholder, nút `+` và nút `↑` nằm **thẳng hàng tâm ngang 100%** không lệch 1px.
  + **Khi gõ nhiều dòng (`Shift+Enter` 2–4 dòng):** Textarea tự giãn mượt lên trên đến tối đa `106px` (`4 * 24px + 10px` padding) bằng `transition: height .28s cubic-bezier(.3,1.2,.5,1)`, 2 nút `+` và `↑` neo thẳng gọn theo dòng cuối cùng; chỉ bật `overflow-y: auto` khi vượt quá 4 dòng.
  + **Bên phải:** Nút tròn Gửi / Dừng biến hình `34x34px`.
- **Xử lý dứt điểm độ khựng khi bấm nút dấu `+` (Mượt 60–120fps GPU-only):**
  + **State cục bộ 100%:** Quản lý `showAttachMenu` hoàn toàn bên trong `PromptBox.tsx` (không đẩy lên `App.tsx` hay làm re-render danh sách tin nhắn `FlatList`).
  + **Tách biệt transform:** Vỏ nút `.tmr-add` chỉ co giãn nhẹ khi nhấn `:active` (`scale(0.93)`), icon SVG `<Plus>` bên trong xoay mượt `45deg` thành `×` thuần GPU qua CSS `.tmr-add.is-open svg { transform: rotate(45deg); }` (không unmount/remount SVG DOM).
  + **Keep-Mounted Popover `📎 Tệp`:** Popover luôn tồn tại sẵn trong DOM của `PromptBox` (`.tmr-attach-pop`), đóng/mở siêu tốc bằng class `.is-open` qua `opacity`, `transform: translate3d(0, 6px, 0) scale(0.95)` -> `scale(1)` (0 layout reflow, loại bỏ `backdrop-filter: blur` nặng).
  + **Bắt sự kiện pointerdown:** Dùng `pointerdown` toàn cục để đóng popover khi bấm ra ngoài không có độ trễ `click`, đảm bảo kích hoạt `input[type=file]` mượt mà không bị macOS chặn.
- **Hiệu ứng chữ bay mờ khi gửi (`flyTextAnimation`):** Chạy Web Animations API đẩy phần tử chữ bay lên `-22px` và mờ dần trong `420ms` với tọa độ tính theo bố cục 1 hàng mới (`left = taRect.left - boxRect.left + 2`, `top = taRect.top - boxRect.top + 5`, `width = taRect.width - 4`).
- **Viền xoay sáng Conic Glow Spin (`tmr-prompt-glow`):**
  + Viền gradient xoay 360 độ góc phát sáng (`conic-gradient`) chạy mượt quanh bo góc `28px` bằng CSS `@property --tmr-glow-a` và `@keyframes tmr-glow-spin`.
  + Chỉ hiển thị và chạy khi phiên/pane đang sinh phản hồi (`isGenerating === true`), chuyển mờ êm dịu `0.45s` khi bắt đầu và khi kết thúc.
- **Nút tròn Gửi / Dừng biến hình (`34x34px`):**
  + Có hiệu ứng nảy lò xo (`spring bump`) bằng Web Animations API khi chuyển từ rỗng sang sẵn sàng gửi.
  + Khi chưa có nội dung: Trạng thái disabled, nền xám dịu.
  + Khi có nội dung sẵn sàng gửi: Nền tương phản cao đơn sắc + icon mũi tên hướng lên (`ArrowUp` `18x18`, nét `2.3`).
  + Khi đang sinh phản hồi (`isGenerating === true`): Nút vẫn bấm được, icon mũi tên thu nhỏ bay lên mờ dần, bung ra ô vuông bo góc `11x11px` ở tâm để người dùng bấm **Dừng** phản hồi tức thì (kết nối `AbortController` hủy fetch mạng và vòng lặp bong bóng mà không báo lỗi đỏ).
- **Cơ chế tải tệp lên (File Upload):**
  + Web: Sử dụng thẻ `<input type="file" ... />` ẩn qua ref, kích hoạt ngay trong event handler của mục `📎 Tệp` để không bao giờ bị chặn.
  + Hỗ trợ ảnh (`image/*`): Nén canvas chuẩn qua `utils/imageOptimizer.ts`, hiển thị preview ảnh có nút xóa `×`.
  + Hỗ trợ tệp văn bản / mã nguồn (`.txt`, `.md`, `.csv`, `.json`, `.py`, `.ts`, `.js`, `.cpp`...): Đọc nội dung qua `FileReader.readAsText`, hiển thị chip tệp đính kèm có nút xóa `×`, tự động đính kèm nội dung vào tin nhắn gửi cho AI.
  + Hỗ trợ tệp PDF: Đọc và hiển thị chip tệp, gửi dữ liệu nhị phân/base64 an toàn.
- **NGHIÊM CẤM:**
  + **TUYỆT ĐỐI CẤM** thêm nút chọn model (như `Nova 2`, `Claude`, `GPT`), icon Emote (mặt cười), icon Web/Quả cầu vào thanh Prompt Box.
  + CẤM thanh footer chứa gợi ý hay thông tin ngoài lề.

---

### D. Bảng Lệnh Nhanh (Command Palette — `Cmd + K`)
- **Bố cục:** Hộp thoại modal nổi bật giữa màn hình với backdrop mờ (`backdropFilter: blur(6px)`).
- **Phía trên:** Ô tìm kiếm tức thì (`ESC` badge ở góc phải).
- **Phía dưới:** Danh sách các thao tác nhanh và kết quả tìm kiếm phân nhóm rõ ràng.
- **Khoảng đệm đáy:** `paddingBottom: 10px` cho danh sách.
- **NGHIÊM CẤM:** Thanh chân trang (Footer) chứa mô tả phím (`↑↓ di chuyển`, `↵ chọn`, `esc đóng`) hay dòng thống kê `API hôm nay: ... • Mode: ...`.

---

### E. Thanh Bên Lịch Sử (Sidebar Drawer) Chuẩn Ember Obsidian (Online • v4.9.6)
- **Thiết kế Đơn sắc Tối giản (Minimal Monochrome — Loại bỏ AI Slop):**
  + Tuyệt đối thanh trừng các mảng màu tím (`#8B5CF6`, `#6366F1`) và xanh dương (`#3B82F6`) gây rối mắt trên Sidebar.
  + **Nền Tối (Ember Matte Obsidian):** Nền `#141416` (sâu hơn khung chat chính `#171717`, viền phải `1px solid rgba(255, 255, 255, 0.07)`). Đường phân tách `1px solid rgba(255, 255, 255, 0.06)`. Item active (Active Pill) nền `#222226`, viền `1px solid rgba(255, 255, 255, 0.08)`, chữ `#F4F4F5`, icon `#FFFFFF`. Item hover nền `rgba(255, 255, 255, 0.045)`, chữ `#E4E4E7`. Item thường chữ `#A1A1AA`, icon `#71717A`.
  + **Nền Sáng (Architectural Alabaster Parity khi bấm `Cmd + R`):** Nền `#F7F7F8` (tách biệt rõ với khung chat `#FFFFFF`, viền phải `1px solid #E6E6EA`). Item active nền `#FFFFFF` nổi nhẹ với đổ bóng `0 1px 2px rgba(0, 0, 0, 0.05)`, viền `1px solid rgba(0, 0, 0, 0.08)`, chữ `#111113`, icon `#111113`. Item hover nền `rgba(0, 0, 0, 0.04)`. Item thường chữ `#52525B`, icon `#71717A`.
- **Cấu trúc & Bố cục Trục dọc Chuẩn mực:**
  1. **Brand Bar (Trục chuẩn `52px`):**
     - Đồng trục tuyệt đối với Header, viền đáy `1px solid rgba(255, 255, 255, 0.06)` (Dark) / `rgba(0, 0, 0, 0.06)` (Light).
     - Thay thế icon tím bằng biểu tượng lõi đơn sắc **`TomorrowGlyph`** (`size={18}`, `#F4F4F5` Dark / `#111113` Light).
     - Tiêu đề **`Tomorrow`** (`15px`, `fontWeight: '600'`, `letterSpacing: -0.3`).
     - Góc phải: Thay nút `X` cứng bằng icon thanh mảnh **`PanelLeftClose`** (`16x16`, khung bấm `28x28`, bo góc `7px`, hover êm ái).
  2. **Thanh Nút Thao Tác Đầu Trang (`34px` — Khắc phục lỗi cắt chữ):**
     - Bố cục 2 nút ngang: Nút chính **`+ Trò chuyện mới`** (`flex: 1`, `minWidth: 0`, icon `Plus` `14x14`, chữ `"Trò chuyện mới"` `13px`, `fontWeight: '500'`, không bao giờ bị cắt thành `"Cuộc trò chuyện..."`).
     - Nút phụ **`Sổ mới`** (`flexShrink: 0`, padding `10px`, icon `Folder` `13x13`).
     - Bên dưới có đường kẻ tóc (Hairline Divider) phân cách tự nhiên với danh sách.
  3. **Phân nhóm Sổ ghi chú & Đường Guide Line Dọc:**
     - Nhãn vi mô **`SỔ GHI CHÚ`** (`11px`, `fontWeight: '500'`, `letterSpacing: 0.4`, `#636366` Dark / `#8E8E93` Light).
     - Hàng sổ ghi chú (`34px`): Folder icon đơn sắc, tên sổ gọn gàng, cụm nút hành động (`+`, sửa tên, xóa sổ) ẩn mờ (`opacity: 0.4`) và sáng rõ khi hover (`opacity: 1`).
     - Danh sách đoạn chat thụt lề có **đường kẻ guide line dọc** `1px solid rgba(255, 255, 255, 0.06)` (Dark) / `rgba(0, 0, 0, 0.06)` (Light) định hướng thị giác chuẩn macOS.
     - Icon đoạn chat `MessageSquare` (`13x13`). Chỉ báo phiên phụ mở ở pane Split Screen là chấm tròn đơn sắc trung tính `5px` (`#E4E4E7` Dark / `#18181B` Light), không dùng màu xanh lá nổi cộm.
     - Thời gian tương đối dạng `tabular-nums` (`11px`, `#52525B` Dark / `#9CA3AF` Light), tự động hoán đổi êm dịu sang icon thùng rác `Trash2` đỏ khi di chuột (hover).
  4. **Chân trang Cố định (Sticky Footer Ghost Reset):**
     - Nút **`Xóa toàn bộ lịch sử & Reset`** thiết kế phong cách Ghost (`height: 34px`, `borderRadius: 8px`), nền trong suốt, icon và chữ màu trung tính `#71717A`.
     - Chỉ khi hover mới chuyển sang nền cảnh báo đỏ dịu `rgba(239, 68, 68, 0.09)` (Dark) / `rgba(220, 38, 38, 0.07)` (Light), viền đỏ mảnh và chữ/icon đỏ `#F87171` / `#DC2626`.
- **Tối ưu Hiệu Năng Hoạt Ảnh 60fps & Bảo Toàn `Cmd + R`:**
  + Split-View slide transition: `width 260ms cubic-bezier(0.22, 1, 0.36, 1), transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease`.
  + **TUYỆT ĐỐI KHÔNG** đặt `transition: background-color` trên vỏ Sidebar container để tránh gây lệch pha với View Transition quét sóng tròn khi người dùng nhấn `Cmd + R`.
  + Thanh cuộn Sidebar: Rộng `4px`, trong suốt mặc định, hiện vệt mờ khi rê chuột vào danh sách.

---

## 3. Hệ Thống Phím Tắt Chuẩn macOS (macOS Native Shortcuts)
| Phím tắt | Tác vụ | Ghi chú |
| :--- | :--- | :--- |
| **`Cmd + B`** | Đóng / mở Sidebar | Animation trượt mượt 240ms |
| **`Cmd + K`** | Mở / đóng Command Palette | Animation popup mượt 200ms |
| **`Cmd + N`** | Mở cuộc trò chuyện mới | Giữ các phiên ngầm hoạt động |
| **`Cmd + R`** | Chuyển đổi Sáng ↔ Tối (Circular Radial Wave View Transition) | Bung sóng tròn từ góc trên bên phải (`x = innerWidth - 36`, `y = 28`) trong `600ms`; không giữ Shift; `Cmd+Shift+R` giữ cho hard reload |
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
- **Hiệu Ứng Chuyển Đổi Theme Sóng Tròn (Circular Radial Wave Theme Transition — v4.9.3):**
  - Kích hoạt qua **`Cmd + R`** (toàn cục) hoặc mục **`Chuyển sang giao diện Sáng/Tối ⌘R`** trong Command Palette (`Cmd + K`).
  - **Cơ chế lõi:** Sử dụng Web `View Transitions API` (`document.startViewTransition`) kết hợp `flushSync` (React 19) để ép render khung hình mới tức thì không qua hiệu ứng cross-fade mờ đục.
  - **Tâm phát sóng (`origin`):** Tọa độ góc trên bên phải cửa sổ (`x = window.innerWidth - 36`, `y = 28`), bung ra theo bán kính cực đại `endRadius = hypot(max(x, W-x), max(y, H-y)) + 24`.
  - **Hoạt ảnh hình tròn:** `clip-path: circle(...)` quét mở rộng trên `::view-transition-new(root)` trong `600ms` với đường cong `cubic-bezier(0.22, 1, 0.36, 1)`.
  - **Lớp viền sóng mềm (`.tmr-theme-wave-rim`):** Vòng tròn GPU-scaled với hào quang `blur(16px)` và `box-shadow` nhẹ (`rgba(255,255,255,0.45)` khi sang Light, `rgba(0,0,0,0.45)` khi sang Dark), phóng đồng bộ từ tâm `(x, y)` tạo cảm giác quầng sáng/tối quét êm ái trên toàn bộ Sidebar, Header, nút cơ `⌘K`, Split Screen và `PromptBox`.
  - **Tính hai chiều đối xứng (Two-Way Symmetry):** Cả 2 chiều **Tối → Sáng** và **Sáng → Tối** đều khởi phát từ cùng một tâm góc trên bên phải, quét mượt mà phủ khắp giao diện.
  - **Bảo vệ chống kẹt & Khả năng tiếp cận:** Hỗ trợ `activeTransition.skipTransition()` khi nhấn `Cmd + R` liên tục tốc độ cao; tự động fallback đổi màu ngay khi bật `prefers-reduced-motion` hoặc trên nền tảng không hỗ trợ View Transition.

---

## 5. Bảng Màu & Độ Tương Phản Tách Lớp (Surface Contrast Tokens)
Để đạt chuẩn chiều sâu thị giác macOS, Sidebar và Khung chat chính luôn có độ tương phản tách lớp rõ rệt:

| Thành phần | Nền Tối (Dark Mode) | Nền Sáng (Light Mode) |
| :--- | :--- | :--- |
| **Khung chat chính & Header** | `#171717` (Đen sâu than chì) | `#FFFFFF` (Trắng tinh khiết) |
| **Thanh Sidebar (Cạnh trái)** | `#141416` (Ember Obsidian mờ sâu) | `#F7F7F8` (Architectural Alabaster) |
| **Đường viền phân tách (`borderSubtle`)** | `rgba(255, 255, 255, 0.07)` | `#E6E6EA` |
| **Khung nhập liệu (`inputBg` / `inputBorder`)** | `#262626` / `#363636` | `#FFFFFF` / `#E2E4E8` |
| **Item Sổ / Đoạn chat đang chọn (`activeBg`)** | `#222226` (Active Pill đơn sắc) | `#FFFFFF` (nổi nhẹ bóng 0 1px 2px) |
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
