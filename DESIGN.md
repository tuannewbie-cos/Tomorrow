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
  - Cụm tiêu đề **`Tomorrow`** (`fontSize: 16.5`, `fontWeight: '700'`) đi kèm viên thuốc trạng thái **`Online • vX.X.X`** (chấm tròn xanh dịu + chữ xanh).
  - Sử dụng bố cục căn giữa tuyệt đối (`position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'none'`) để không bao giờ bị lệch tâm dù nhóm nút bên phải dài hơn bên trái.
  - **NGHIÊM CẤM:** Hiển thị thẻ tên Sổ ghi chú (VD: `📁 test`, `📁 Ghi chú chung`) hay dòng trạng thái `"Đang nhớ: ..."` trên Header.
- **Phía bên phải:**
  - **Duy nhất 2 thành phần:**
    1. Thanh **`Tìm kiếm ⌘K`** (trên màn hình rộng `width >= 768px`).
    2. Nút **Tạo cuộc trò chuyện mới** (`SquarePen` icon, 38x38 bo tròn).
  - **NGHIÊM CẤM:** Đặt nút Chia đôi màn hình (Split Screen) và nút Mặt trăng/Mặt trời chuyển Sáng/Tối trên Header (đã chuyển hoàn toàn sang phím tắt).

---

### B. Màn Hình Mở Đầu (EmptyState / Welcome Screen)
- **Cấu trúc tối giản:**
  1. **Icon chính thức của ứng dụng (`T.M.R`):** Khối vuông bo góc chuẩn icon macOS `56x56`, `borderRadius: 14`, nền đen bóng nhẹ `#0B0B0D`, viền mờ tinh tế `1px solid rgba(255, 255, 255, 0.12)`, đổ bóng mềm, 5 cột sóng trắng bên trên và chữ `T.M.R` tinh tế bên dưới.
  2. **Dòng lời chào duy nhất:** Căn giữa, cỡ chữ `22px - 26px`, `fontWeight: '700'`:
     > **`"Chào ${displayName}, chúng ta nên bắt đầu làm việc gì?"`**
     *(với `displayName` lấy từ `USER_MEMORY_PROFILE_V1` nếu đã lưu tên người dùng, mặc định là `"bạn"`).*
- **NGHIÊM CẤM:**
  - CẤM dùng badge tím `✨ Tomorrow`.
  - CẤM dòng gạch chân gradient hoặc lời chào 2 tầng.
  - CẤM dòng phụ kiểu `"Buổi chiều hiệu quả! Tiếp tục dự án..."`.
  - CẤM các thẻ gợi ý tâm sự nhanh / câu hỏi mẫu.

---

### C. Thanh Nhập Liệu (Input Bar) Phong Cách Gemini
- **Bố cục:** Dạng viên thuốc nổi (floating pill) 1 dòng thanh thoát (`maxWidth: 820px`, chiều cao cơ bản `~48px`, tự co giãn khi `Shift + Enter` xuống dòng đến tối đa `110px`).
- **Phía bên trái:**
  - **Duy nhất 1 nút tròn dấu `+`** (kích thước `34x34`, hover có nền tròn dịu nhẹ).
  - Khi bấm `+`:
    + Nút chuyển sang nền tròn xám nhẹ và icon xoay/đổi mượt thành **`×`**.
    + Hiện **menu popover nổi** ngay phía trên nút `+` (bo góc `16px`, nền trắng/tối đồng bộ theme, bóng đổ mềm chuẩn macOS, có animation popup mượt).
    + Trong menu **CHỈ hiển thị duy nhất 1 mục:** **`📎 Tệp`** (icon kẹp giấy `Paperclip` + chữ `Tệp`).
    + Bấm ra ngoài hoặc nhấn `Esc` sẽ tự động đóng menu và đổi `×` về `+`.
  - **NGHIÊM CẤM:** Đặt icon Ảnh cũ, icon Emote (mặt cười), icon Ngôn ngữ / Quả cầu bên trái ô nhập liệu.
- **Phía bên phải:** Nút **Gửi** (mũi tên).
- **Cơ chế tải tệp lên (File Upload):**
  - Web: Sử dụng thẻ `<input type="file" ... />` ẩn qua ref, kích hoạt ngay trong event handler của mục `📎 Tệp` để không bao giờ bị chặn.
  - Hỗ trợ ảnh (`image/*`): Nén canvas chuẩn qua `utils/imageOptimizer.ts`, hiển thị preview ảnh có nút xóa `×`.
  - Hỗ trợ tệp văn bản / mã nguồn (`.txt`, `.md`, `.csv`, `.json`, `.py`, `.ts`, `.js`, `.cpp`...): Đọc nội dung qua `FileReader.readAsText`, hiển thị chip tệp đính kèm có nút xóa `×`, tự động đính kèm nội dung vào tin nhắn gửi cho AI.
  - Hỗ trợ tệp PDF: Đọc và hiển thị chip tệp, gửi dữ liệu nhị phân/base64 an toàn.

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
- **Typography:** Ưu tiên font `Plus Jakarta Sans` / `SF Pro Text` / `SF Pro Display` / `Inter`, hiển thị siêu mịn chuẩn Retina macOS.
- **Đường cong chuyển động (Easing Curves):**
  - Popups & Modals: `cubic-bezier(0.16, 1, 0.3, 1)` (chuẩn macOS App Launch Spring).
  - Trượt Sidebar & Drawer: `cubic-bezier(0.22, 1, 0.36, 1)` trong `240ms`.
  - Hiệu ứng đạt mượt mà 60fps, không giật lag.
