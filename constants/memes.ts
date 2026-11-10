import { MemeItem } from '../types/chat';

export const MEME_LIBRARY: MemeItem[] = [
  {
    id: 'speed_wtf',
    title: 'IShowSpeed Hoang Mang Vãi Chưởng',
    url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80',
    category: 'shock',
    description: 'Biểu cảm hoang mang: "Ai vậy mấy bro???"',
  },
  {
    id: 'crying_cat',
    title: 'Mèo Khóc Nhè Rưng Rưng',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop&q=80',
    category: 'comfort',
    description: 'Bé mèo mắt ngấn lệ cần được vỗ về ngay lập tức',
  },
  {
    id: 'warm_hug',
    title: 'Gấu Ôm Chữa Lành',
    url: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=600&auto=format&fit=crop&q=80',
    category: 'comfort',
    description: 'Một cái ôm ấm áp gửi đến đằng ấy',
  },
  {
    id: 'doge_cheer',
    title: 'Doge / Shiba Cười Cà Khịa',
    url: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&auto=format&fit=crop&q=80',
    category: 'funny',
    description: 'Nụ cười thâm thúy khi cuộc đời thử thách bạn',
  },
  {
    id: 'capybara_calm',
    title: 'Capybara Điềm Nhiên',
    url: 'https://images.unsplash.com/photo-1557053910-d9eadeed1c58?w=600&auto=format&fit=crop&q=80',
    category: 'relatable',
    description: 'Mọi chuyện rồi cũng sẽ qua, cứ chill như Capybara',
  },
];

export function getMemeById(id?: string): MemeItem | undefined {
  if (!id || id === 'none') return undefined;
  const normalized = id.toLowerCase().replace(/-/g, '_');
  return MEME_LIBRARY.find((m) => m.id === normalized || m.id === id);
}

export function getRandomMeme(category?: MemeItem['category']): MemeItem {
  if (category) {
    const filtered = MEME_LIBRARY.filter((m) => m.category === category);
    if (filtered.length > 0) {
      const idx = Math.floor(Math.random() * filtered.length);
      return filtered[idx];
    }
  }
  const idx = Math.floor(Math.random() * MEME_LIBRARY.length);
  return MEME_LIBRARY[idx];
}
