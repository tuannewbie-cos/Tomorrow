# AGENTS.md — Quy Chuẩn Dự Án Mobile Hackathon (Team 4 Người)

Tài liệu này là "Hiến pháp" của dự án. Mọi AI Assistant (Antigravity, Cursor, Copilot) và các thành viên trong team BẮT BUỘC phải đọc và tuân thủ các quy tắc dưới đây trước khi viết bất kỳ dòng code nào.

---

## 1. Tinh Thần Cốt Lõi (Hackathon Mindset)
- **Tốc độ & Tính ổn định của Demo là ưu tiên số 1:** Ưu tiên code chạy được, giao diện mượt, không lỗi crash trên thiết bị thật.
- **Không over-engineering:** Không viết code trừu tượng phức tạp không cần thiết.
- **Resilient Data (Dữ liệu chống sập):** Mọi màn hình phải có **Mock Data Fallback**. Nếu mạng lag hoặc Supabase chưa kịp tạo bảng, App VẪN PHẢI HIỂN THỊ DỮ LIỆU ĐẸP ĐỂ DEMO.
- **Single Theme Rule:** App chỉ dùng **1 Theme duy nhất** (hoặc Dark Mode, hoặc Light Mode được chốt khi nhận đề bài). Tuyệt đối KHÔNG viết logic toggle theme để tránh lỗi màu và mất thời gian.

---

## 2. Tech Stack Cố Định (Approved Tech Stack)

| Hạng mục | Công nghệ & Thư viện quy định |
| :--- | :--- |
| **Framework** | React Native (Expo SDK mới nhất, Managed Workflow) |
| **Language** | TypeScript (Strict mode, cấm dùng `any`) |
| **Navigation** | **Expo Router** (File-based routing tại thư mục `app/`) |
| **Styling** | **NativeWind v4** (Tailwind CSS cho React Native) |
| **Icons** | `lucide-react-native` (Kích thước chuẩn: `size={20}` hoặc `size={24}`) |
| **State Management** | **Zustand** (Client state đơn giản, lưu giỏ hàng, user profile, UI flags) |
| **Server State / Cache** | **TanStack Query (React Query)** (Quản lý fetching, caching, loading/error state) |
| **Backend & Auth** | **Supabase** (`@supabase/supabase-js` + `expo-secure-store` để lưu session) |
| **Animations** | `react-native-reanimated` (Chỉ dùng cho micro-interactions mượt mà) |

> ⚠️ **Quy tắc cài thư viện:** AI không tự ý cài các thư viện lạ nếu trong stack đã có giải pháp tương đương. Nếu thật sự cần thư viện mới (ví dụ: Camera, Audio), AI phải gợi ý lệnh `npx expo install <package>` trước.

---

## 3. Cấu Trúc Thư Mục Chuẩn (Project Structure)

Mọi file phải được đặt đúng vị trí theo quy định sau:

```text
├── app/                  # Expo Router (Màn hình & Navigation)
│   ├── (auth)/           # Route nhóm xác thực: login, register
│   ├── (tabs)/           # Màn hình chính dạng Bottom Tabs
│   ├── _layout.tsx       # Root layout (QueryClientProvider, AuthProvider)
│   └── index.tsx         # Splash / Redirect logic
├── components/           # UI Components
│   ├── ui/               # Component hạt nhân dùng chung (Button, Card, Input, Badge)
│   └── features/         # Component riêng của từng tính năng
├── hooks/                # Custom React Hooks & TanStack Query hooks (e.g. useProducts.ts)
├── store/                # Zustand stores (e.g. useAuthStore.ts, useAppStore.ts)
├── services/             # Supabase client & API integration (AI API calls, Third-party)
│   ├── supabase.ts       # Khởi tạo Supabase client với SecureStore
│   └── api.ts            # Hàm gọi fetch dữ liệu
├── mocks/                # Dữ liệu giả lập phục vụ Demo (mockData.ts)
├── types/                # TypeScript interfaces & Supabase generated types
└── constants/            # Màu sắc, theme tokens, biến môi trường
```

---

## 4. Quy Chuẩn Code Mobile (Mobile-Native Guidelines)

1. **Tuyệt đối KHÔNG dùng thẻ HTML Web:**
   - ❌ Cấm: `<div>`, `<span>`, `<p>`, `<button>`, `<img>`, `<a>`
   - ✅ Dùng: `<View>`, `<Text>`, `<Pressable>`, `<Image>`, `<Link>` (từ `expo-router`)
2. **Xử lý Tai thỏ & Nút Home (Safe Area):**
   - Luôn sử dụng `SafeAreaView` từ `react-native-safe-area-context` hoặc dùng `useSafeAreaInsets` cho header/footer.
3. **Xử lý Bàn phím & Danh sách cuộn:**
   - Màn hình có Input phải bọc trong `KeyboardAvoidingView` hoặc `ScrollView` với `keyboardShouldPersistTaps="handled"`.
   - Danh sách nhiều phần tử phải dùng `FlatList`, không dùng `map()` bên trong `ScrollView`.
4. **Trải nghiệm chạm (Touch Feedback):**
   - Dùng `<Pressable>` kèm hiệu ứng active opacity/scale nhẹ để tạo cảm giác bấm mượt mà.

---

## 5. Quy Chuẩn Xử Lý Dữ Liệu & Mock Data (Phục vụ Demo)

Mọi service gọi API/Database phải tuân theo cấu trúc mẫu sau để không bao giờ bị crash app:

```typescript
// services/exampleService.ts
import { supabase } from './supabase';
import { MOCK_ITEMS } from '@/mocks/mockData';

export async function fetchItems() {
  try {
    const { data, error } = await supabase.from('items').select('*');
    if (error || !data || data.length === 0) {
      console.warn('Dùng Mock Data dự phòng:', error?.message);
      return MOCK_ITEMS; // Fallback ngay lập tức
    }
    return data;
  } catch (err) {
    console.warn('Lỗi mạng, fallback sang Mock Data');
    return MOCK_ITEMS;
  }
}
```

---

## 6. Mẫu Cấu Hình Supabase Client Chuẩn (`services/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## 7. Quy Tắc Phối Hợp Git & Commit
- Nhánh chính: `main` (Luôn phải ở trạng thái build được, không lỗi TS).
- Nhánh tính năng: `feat/<tên-thành-viên>-<tính-năng>` (VD: `feat-hiep-auth`, `feat-nam-dashboard`).
- Khi gặp lỗi TypeScript: Ưu tiên sửa đúng kiểu dữ liệu, không ép kiểu `as any`.
