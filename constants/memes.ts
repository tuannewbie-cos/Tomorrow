import { MemeItem } from '../types/chat';

/**
 * Kho Ảnh Meme & GIF Đời Thực — Tuyển chọn từ Pinterest, Facebook & TikTok
 * Kèm logic phân loại ngữ cảnh cảm xúc để kích hoạt tự nhiên, không bị gượng ép.
 */
export const MEME_LIBRARY: MemeItem[] = [
  {
    id: 'this_is_fine',
    title: "This Is Fine (Ổn Mà, Ổn Lắm Luôn...)",
    url: 'https://i.imgflip.com/wxica.jpg',
    category: 'exhausted',
    emotionTag: 'Bất lực trước deadline / stress ngập đầu',
    contextTrigger: 'deadline, áp lực, ngập task, dồn việc, hỏng bét, toang',
    description: 'Chú chó ngồi uống cà phê giữa biển lửa: "Mọi thứ vẫn ổn trong khi thực ra đã toang".',
  },
  {
    id: 'tired_spongebob',
    title: 'SpongeBob Thở Oxy',
    url: 'https://i.imgflip.com/27cme4.jpg',
    category: 'exhausted',
    emotionTag: 'Kiệt sức / Cày bài thức đêm / Tan ca',
    contextTrigger: 'mệt, kiệt sức, thức trắng, cày đêm, đuối, thở không ra hơi',
    description: 'SpongeBob chống tay thở dốc sau khi cày cuốc kiệt quệ.',
  },
  {
    id: 'crying_cat_thumbs_up',
    title: 'Mèo Khóc Nhè Giơ Thumbs Up',
    url: 'https://i.imgflip.com/49z6rw.png',
    category: 'relatable',
    emotionTag: 'Nuốt nước mắt vào trong / Cười trừ',
    contextTrigger: 'ổn mà :)), k sao đâu, tạch môn, rớt phỏng vấn, cười trừ',
    description: 'Bé mèo nước mắt giàn giụa nhưng vẫn giơ ngón tay cái tỏ vẻ "tôi ổn".',
  },
  {
    id: 'cat_loading',
    title: 'Mèo Não Load 1% (Lú Lẫn)',
    url: 'https://i.imgflip.com/392xtq.jpg',
    category: 'shock',
    emotionTag: 'Lú lẫn / Não đình công / Bug khó hiểu',
    contextTrigger: 'oop, bug, fix mãi không được, lú, không hiểu gì, trầm cảm',
    description: 'Mèo ngơ ngác với vòng xoay loading trên trán: "Ủa đang nói gì vậy?".',
  },
  {
    id: 'side_eye_dog',
    title: 'Chú Chó Liếc Xéo (Side Eye)',
    url: 'https://i.imgflip.com/5c7lwq.png',
    category: 'funny',
    emotionTag: 'Cà khịa / Nghi ngờ nhẹ / Troll bạn bè',
    contextTrigger: 'xạo ke, flex, điêu, nghi ngờ, cà khịa, trêu',
    description: 'Ánh mắt liếc xéo đầy nghi vấn và tính cà khịa cực mạnh.',
  },
  {
    id: 'capybara_chill',
    title: 'Capybara Điềm Nhiên Ngâm Bồn',
    url: 'https://images.unsplash.com/photo-1557053910-d9eadeed1c58?w=600&auto=format&fit=crop&q=80',
    category: 'chill',
    emotionTag: 'Bình tâm / Bỏ ngoài tai sóng gió / Thả lỏng',
    contextTrigger: 'chill, thở tí, kệ đi, thả lỏng, thư giãn, bình yên',
    description: 'Bộ trưởng bộ ngoại giao Capybara ngâm mình tĩnh tại bất chấp thế sự.',
  },
  {
    id: 'warm_hug',
    title: 'Bé Gấu Ôm Nhau Vỗ Về',
    url: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=600&auto=format&fit=crop&q=80',
    category: 'comfort',
    emotionTag: 'Vỗ về / Chia sẻ nỗi buồn / An ủi',
    contextTrigger: 'buồn, thất tình, khóc, cô đơn, tủi thân, muốn biến mất',
    description: 'Một cái ôm ấm áp không lời gửi đến những tâm hồn đang chông chênh.',
  },
  {
    id: 'cat_pat_head',
    title: 'Mèo Xoa Đầu Bạn',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop&q=80',
    category: 'comfort',
    emotionTag: 'Ghi nhận nỗ lực / Xoa dịu',
    contextTrigger: 'cố gắng, vất vả rồi, làm tốt lắm, ngoan, thương thương',
    description: 'Bàn tay mềm mại xoa đầu khích lệ bạn sau những giờ gồng gánh mệt mỏi.',
  },
  {
    id: 'pepe_pray',
    title: 'Pepe Chắp Tay Cầu Nguyện',
    url: 'https://i.imgflip.com/1oo093.jpg',
    category: 'relatable',
    emotionTag: 'Xin vía / Cầu nguyện qua môn',
    contextTrigger: 'xin vía, qua môn, thi cử, phỏng vấn, mong trời phật phù hộ',
    description: 'Cầu mong sự che chở của vũ trụ trước giờ công bố điểm hoặc kết quả.',
  },
  {
    id: 'cheems_bonk',
    title: 'Cheems Gõ Đầu Bonk',
    url: 'https://i.imgflip.com/488vhn.png',
    category: 'funny',
    emotionTag: 'Chặn overthinking / Nhắc đi ngủ',
    contextTrigger: 'overthinking, nghĩ lung tung, 2h sáng, thức khuya, linh tinh',
    description: 'Cheems vung gậy gõ nhẹ: "Bớt nghĩ quẩn lại và đi ngủ ngay!".',
  },
  {
    id: 'cat_sleeping_peace',
    title: 'Mèo Cuộn Tròn Ngủ Say',
    url: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=600&auto=format&fit=crop&q=80',
    category: 'comfort',
    emotionTag: 'Ngủ ngon / Khép lại ngày dài',
    contextTrigger: 't ngủ tí, đi ngủ, ngủ đây, chúc ngủ ngon, mệt ngủ',
    description: 'Bé mèo say giấc nồng nhắc nhở bạn cũng xứng đáng được nghỉ ngơi.',
  },
];

/**
 * Lấy meme theo ID
 */
export function getMemeById(id?: string): MemeItem | undefined {
  if (!id || id === 'none') return undefined;
  const normalized = id.toLowerCase().replace(/-/g, '_');
  return MEME_LIBRARY.find((m) => m.id === normalized || m.id === id);
}

/**
 * Chọn meme thông minh đúng ngữ cảnh người dùng đang nói
 * Chỉ trả về meme khi thật sự có từ khóa khớp mạnh, tránh chèn bừa bãi.
 */
export function getMemeForContext(userText: string): MemeItem | undefined {
  const text = userText.toLowerCase();

  for (const meme of MEME_LIBRARY) {
    const triggers = meme.contextTrigger?.split(',').map((t) => t.trim().toLowerCase()) || [];
    for (const trigger of triggers) {
      if (trigger && text.includes(trigger)) {
        return meme;
      }
    }
  }

  return undefined;
}

/**
 * Lấy ngẫu nhiên meme theo thể loại
 */
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
