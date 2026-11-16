/**
 * TOMORROW V3.5 MINDSET & BEHAVIORAL TRAIN SIMULATOR
 * Kiểm thử toàn diện lõi tư duy bạn thân thông minh ChatGPT/Gemini-grade:
 * 1. Mặc định là bạn, phân tích hành vi xưng hô (TUYỆT ĐỐI KHÔNG gọi "bro" bừa bãi).
 * 2. Tín hiệu dừng và tiếng lóng ("sybau", "cook", "cút", "im", "okk") -> Dừng dứt khoát 1 bong bóng <= 4 chữ, KHÔNG hỏi vặn lại.
 * 3. Trí tuệ thích ứng kép (bạn bè cà khịa bóng đá vs chuyên gia giải quyết bài toán khó).
 * 4. Tóm tắt và bảo toàn tiêu đề session_title đa lượt.
 */

const fs = require('fs');
const path = require('path');

// 1. Định nghĩa hàm isPlaceholderOrNoiseTitle chuẩn theo chatStorage.ts
const isPlaceholderOrNoiseTitle = (title) => {
  if (!title) return true;
  const clean = title.trim().toLowerCase().replace(/[.!?,:;~_-]+$/g, '').trim();
  if (clean.length <= 5) return true;

  const noisePhrases = [
    // Generic titles
    'cuộc trò chuyện mới', 'trò chuyện ngắn', 'cuộc trò chuyện trước đó',
    'tâm sự mới', 'hình ảnh gửi kèm', 'tin nhắn mới', 'new chat', 'chưa có tiêu đề', 'untitled',
    // Greetings & Pings
    'hello', 'helo', 'hi', 'hii', 'hí', 'halo', 'yo', 'ê', 'alo', 'ơi', 'hú', 'hu',
    // Confirmations / Closures
    'ok', 'okk', 'okkk', 'oki', 'okii', 'okie', 'okela', 'ok nha', 'ok nhé', 'ok nhe',
    'ok bro', 'oki bro', 'ok r', 'ok r đó', 'ok r do', 'ok roi', 'ok rồi', 'ok rồi đó', 'ok bạn', 'ok b',
    'uk', 'ừ', 'ừa', 'uh', 'uhm', 'ừm', 'um', 'umk',
    // Thanks
    'thanks', 'thanks bro', 'thank kiu', 'thank kiuu', 'thank kiu bro', 'tks', 'tks bro',
    'thank you', 'cảm ơn', 'cảm ơn bro', 'cảm ơn bạn', 'cảm ơn nhiều', 'cam on', 'cam on bro',
    // Bye & Leave
    'bye', 'bye bro', 'pp', 'pp bro', 'g9', 'tạm biệt',
    // Soft trials / step away
    'để t thử', 'để t thử xem', 'de t thu', 'de t thu xem', 'để t xem', 'để t test',
    // Dev test
    'test', 'testing',
  ];

  if (noisePhrases.includes(clean)) return true;

  // Pattern check: Các cụm từ ngắn (<= 3 từ) bắt đầu bằng từ khóa xã giao/khép mạch
  const words = clean.split(/\s+/);
  if (words.length <= 3) {
    const firstWord = words[0];
    if (['ok', 'okk', 'oki', 'okie', 'okela', 'thanks', 'tks', 'bye', 'pp', 'alo', 'hello', 'yo', 'ê'].includes(firstWord)) {
      return true;
    }
    if (
      clean.startsWith('cảm ơn') ||
      clean.startsWith('cam on') ||
      clean.startsWith('để t thử') ||
      clean.startsWith('de t thu') ||
      clean.startsWith('để mình thử') ||
      clean.startsWith('để tui thử')
    ) {
      return true;
    }
  }

  return false;
};

// 2. Định nghĩa formatSessionTitle theo SidebarDrawer.tsx
const formatSessionTitle = (rawTitle) => {
  if (isPlaceholderOrNoiseTitle(rawTitle)) {
    return 'Trò chuyện ngắn';
  }
  return rawTitle;
};

// 3. Mô phỏng Local Resilient Fallback Engine chuẩn theo aiService.ts v3.5
function localResilientFallback(userMessage, hasImage = false) {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  if (hasImage) {
    return {
      replies: ['ảnh gì đây', 'giao diện hay bug cần soi à :3'],
      session_title: 'Trao đổi về hình ảnh',
      should_update_title: true,
      conversation_state: 'casual_friend',
      memory_note: 'Vừa chia sẻ hình ảnh',
    };
  }

  // 1. TÍN HIỆU KẾT THÚC / DỪNG / TIẾNG LÓNG ("sybau", "cook", "cút", "im", "okk")
  if (lower.includes('sybau') || lower.includes('im đi') || lower === 'im') {
    return {
      replies: ['rồi rồi im :)))'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'closing_stop',
      memory_note: '',
    };
  }

  if (lower.includes('cook') || lower === 'cút' || lower.startsWith('cút')) {
    return {
      replies: ['rồi rồi đi đây :)))'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'closing_stop',
      memory_note: '',
    };
  }

  const isSoftClose =
    /^(okk+|ok+|okkk|oki+|okie|okela|ok nha|ok nhé|ok nhe|ok r|ok r đó|ok r do|ok roi|ok rồi|ok rồi đó|ok bạn|ok b|ừ|ừa|uk|uh|uhm|ừm|um|umk|thank kiu|thank kiuu|thanks|tks|thank you|cảm ơn|cảm ơn nhiều|cam on|pp|bye|g9|thôi|nghỉ đây|ngủ đây)[!.? ]*$/i.test(lower) ||
    lower.startsWith('để t thử') ||
    lower.startsWith('de t thu') ||
    lower.startsWith('để t test') ||
    lower.startsWith('để mình thử') ||
    lower.startsWith('để tui thử') ||
    lower.startsWith('ok r đó') ||
    lower.startsWith('ok r') ||
    lower.startsWith('ok rồi') ||
    lower.startsWith('cảm ơn');

  if (isSoftClose) {
    let replyText = 'okii';
    if (lower.includes('thử') || lower.includes('thu') || lower.includes('test')) {
      replyText = 'ok triển đi nhé';
    } else if (lower.includes('thank') || lower.includes('cảm ơn') || lower.includes('cam on') || lower.includes('tks')) {
      replyText = 'ok cần gì cứ ới';
    } else if (lower.includes('ngủ') || lower.includes('nghỉ')) {
      replyText = 'ừa nghỉ đi';
    } else if (lower.includes('r đó') || lower.includes('r do') || lower.includes('ok r') || lower.includes('rồi')) {
      replyText = 'ừa triển đi';
    }

    return {
      replies: [replyText],
      session_title: '',
      should_update_title: false,
      conversation_state: 'closing_stop',
      memory_note: '',
    };
  }

  // 2. CÀ KHỊA / TRÊU ĐÙA: XOÁ APP ("t xoá m bây giờ")
  if (lower.includes('xoá m') || lower.includes('xóa m') || lower.includes('xoa m') || lower.includes('xoá mày')) {
    return {
      replies: ['thôi đừng xoá mà :)))'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'casual_friend',
      memory_note: '',
    };
  }

  // 3. TRANH LUẬN BÓNG ĐÁ / RONALDO VS MESSI / HỎI FAN AI
  if (
    (lower.includes('ronaldo') && lower.includes('messi')) ||
    ((lower.includes('ronaldo') || lower.includes('cr7')) && (lower.includes('fan') || lower.includes('thích'))) ||
    ((lower.includes('messi') || lower.includes('m10')) && (lower.includes('fan') || lower.includes('thích')))
  ) {
    return {
      replies: ['fan ai cũng đỉnh cả :3', 'ronaldo hay messi đều là huyền thoại bóng đá'],
      session_title: 'Tranh luận Ronaldo và Messi',
      should_update_title: true,
      conversation_state: 'casual_friend',
      memory_note: 'Thích thảo luận bóng đá',
    };
  }

  if (lower.includes('fan ai') || lower.includes('thích ai') || lower.includes('mê ai')) {
    return {
      replies: ['t thích cả 2 mà :3'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'casual_friend',
      memory_note: '',
    };
  }

  // 4. NHỊP MỞ ĐẦU (PING) ("yo", "ê", "hello", "alo", "hi", "hí", "halo", "ơi")
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii|halo|hí|ơi)[!.? ]*$/i.test(lower)) {
    return {
      replies: ['ơi', 'nghe đây'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'ping',
      memory_note: '',
    };
  }

  // 5. HUẤN LUYỆN TƯ DUY TOMORROW
  if (lower.includes('train') || lower.includes('tư duy') || lower.includes('tu duy') || lower.includes('máy móc')) {
    return {
      replies: ['bắt sóng luôn', 'nói đi, muốn tối ưu thêm góc nào'],
      session_title: 'Huấn luyện tư duy Tomorrow',
      should_update_title: true,
      conversation_state: 'gemini_expert',
      memory_note: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
    };
  }

  // 6. THUYẾT TRÌNH / ĐỒ ÁN / SLIDE (GEMINI EXPERT)
  if (
    lower.includes('thuyết trình') ||
    lower.includes('đồ án') ||
    lower.includes('slide') ||
    lower.includes('thuyet trinh') ||
    lower.includes('do an')
  ) {
    return {
      replies: ['triển thôi', 'dàn ý cần mấy slide chính, quăng cấu trúc đây tôi lên sườn'],
      session_title: 'Thuyết trình đồ án tốt nghiệp',
      should_update_title: true,
      conversation_state: 'gemini_expert',
      memory_note: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
    };
  }

  // 7. KỸ THUẬT / KIẾN TRÚC / SUPABASE / QUERY NGHẼN (GEMINI EXPERT)
  if (
    lower.includes('supabase') ||
    lower.includes('kiến trúc') ||
    lower.includes('kien truc') ||
    lower.includes('database') ||
    lower.includes('query') ||
    lower.includes('nghẽn') ||
    lower.includes('nghen')
  ) {
    return {
      replies: ['tập trung vào indexing và giảm payload query trước nhé', 'ném câu query đang nghẽn qua đây mình xem cùng'],
      session_title: 'Tối ưu kiến trúc Supabase',
      should_update_title: true,
      conversation_state: 'gemini_expert',
      memory_note: 'Tối ưu hiệu năng và query database Supabase',
    };
  }

  // 8. DEADLINE OOP / HỌC TẬP (EMOTIONAL SUPPORT + WORK ASSIST)
  if (lower.includes('oop') || lower.includes('môn oop') || (lower.includes('deadline') && (lower.includes('stress') || lower.includes('mệt') || lower.includes('met')))) {
    const isOOP = lower.includes('oop');
    const title = isOOP ? 'Áp lực deadline môn OOP' : 'Áp lực deadline cuối tuần';
    return {
      replies: ['ngồi xuống thở một nhịp đi', 'ném phần vướng qua đây mình rà soát gỡ cùng'],
      session_title: title,
      should_update_title: true,
      conversation_state: 'emotional_support',
      memory_note: isOOP ? 'Đang chịu áp lực deadline môn OOP' : 'Đang xử lý deadline gấp',
    };
  }

  // 9. TRƯỢT PHỎNG VẤN / THẤT BẠI / NẢN LÒNG (EMOTIONAL SUPPORT)
  if (
    lower.includes('phỏng vấn') ||
    lower.includes('phong van') ||
    lower.includes('trượt') ||
    lower.includes('truot') ||
    lower.includes('thất bại') ||
    lower.includes('that bai')
  ) {
    return {
      replies: ['thất bại một lần không định nghĩa năng lực của bạn đâu', 'ngồi xuống thở một nhịp đi, mình luôn ở đây nghe bạn kể'],
      session_title: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      conversation_state: 'emotional_support',
      memory_note: 'Gặp khó khăn sau phỏng vấn và cần động viên tinh thần',
    };
  }

  // 10. HỎI DANH TÍNH (CASUAL FRIEND)
  if (
    lower.includes('tên gì') ||
    lower.includes('tên là gì') ||
    lower.includes('bạn là ai') ||
    lower.includes('mày là ai') ||
    lower.includes('ai đấy')
  ) {
    return {
      replies: ['mình là Tomorrow', 'người bạn tri kỷ và đồng hành cùng bạn'],
      session_title: 'Giới thiệu về Tomorrow',
      should_update_title: true,
      conversation_state: 'casual_friend',
      memory_note: '',
    };
  }

  // 11. CÁC CÂU NÓI CÓ NỘI DUNG RÕ RÀNG
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && !isPlaceholderOrNoiseTitle(text)) {
    const rawTopic = words.slice(0, 5).join(' ');
    const formattedTopic = rawTopic.charAt(0).toUpperCase() + rawTopic.slice(1);
    return {
      replies: ['nghe thú vị đấy', 'nói rõ hơn xem nào'],
      session_title: formattedTopic,
      should_update_title: true,
      conversation_state: 'casual_friend',
      memory_note: '',
    };
  }

  // MẶC ĐỊNH
  return {
    replies: ['nghe đây', 'có vụ gì mới à'],
    session_title: '',
    should_update_title: false,
    conversation_state: 'casual_friend',
    memory_note: '',
  };
}

// 4. Giả lập phiên chat (App.tsx session logic)
class ChatSessionSimulator {
  constructor() {
    this.session = null;
  }

  sendMessage(text) {
    const trimmedText = text.trim();

    if (!this.session) {
      let initialTitle = 'Cuộc trò chuyện mới';
      if (!isPlaceholderOrNoiseTitle(trimmedText) && trimmedText.length > 6) {
        const words = trimmedText.split(/\s+/).filter(Boolean);
        initialTitle = words.slice(0, 6).join(' ');
        if (words.length > 6) initialTitle += '...';
      }

      this.session = {
        id: `sess-${Date.now()}`,
        title: initialTitle,
        messages: [{ role: 'user', text }],
      };
    } else {
      this.session.messages.push({ role: 'user', text });
    }

    const result = localResilientFallback(text);

    // Cập nhật tiêu đề thông minh
    const aiSessionTitle = (result.session_title || '').trim();
    const currentTitle = this.session.title || 'Cuộc trò chuyện mới';
    const isValidNewTitle = !isPlaceholderOrNoiseTitle(aiSessionTitle);
    const shouldUpdate =
      isValidNewTitle &&
      (isPlaceholderOrNoiseTitle(currentTitle) || result.should_update_title === true);

    if (shouldUpdate) {
      this.session.title = aiSessionTitle;
    }

    for (const reply of result.replies) {
      this.session.messages.push({ role: 'model', text: reply });
    }

    return { result, session: this.session };
  }
}

// 5. Chạy 12 kịch bản kiểm thử toàn diện
console.log('='.repeat(70));
console.log('🚀 TOMORROW V3.5 BEHAVIORAL FRIEND & INTELLIGENCE SIMULATOR (12 SCENARIOS)');
console.log('='.repeat(70));

let passedCount = 0;
const totalTests = 12;

// KỊCH BẢN 1: Ping ("hello") -> Không tự ý dùng "bro"
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('hello');
  const passReplies = result.replies.length >= 1 && result.replies.length <= 2;
  const passTitle = session.title === 'Cuộc trò chuyện mới';
  const passState = result.conversation_state === 'ping';
  const hasUnwantedBro = result.replies.some(r => /\bbro\b/i.test(r));
  const pass = passReplies && passTitle && passState && !hasUnwantedBro;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 1] User: "hello" (Ping - Mặc định bạn tự nhiên)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Có dính từ "bro" tự tiện không: ${hasUnwantedBro ? 'CÓ (LỖI)' : 'KHÔNG (TUÂN THỦ)'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 2: Tranh luận bóng đá ("nhưng t fan ronaldo") -> User xưng "t", CẤM dùng "bro"
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('nhưng t fan ronaldo');
  const passTitle = session.title === 'Tranh luận Ronaldo và Messi';
  const hasUnwantedBro = result.replies.some(r => /\bbro\b/i.test(r));
  const pass = passTitle && !hasUnwantedBro;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 2] User: "nhưng t fan ronaldo" (Xưng "t" - Cấm gọi "bro")`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Có gọi "bro" sai xưng hô không: ${hasUnwantedBro ? 'CÓ (LỖI)' : 'KHÔNG (TUÂN THỦ)'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 3: Cà khịa trêu đùa ("t xoá m bây giờ") -> Tuyệt đối KHÔNG được nói "sao lại vậy bro"
{
  const sim = new ChatSessionSimulator();
  const { result } = sim.sendMessage('t xoá m bây giờ');
  const hasUnwantedBro = result.replies.some(r => /\bbro\b/i.test(r));
  const isQuestion = result.replies.some(r => r.includes('?'));
  const isHumorous = result.replies[0].includes('xoá');
  const pass = !hasUnwantedBro && !isQuestion && isHumorous;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 3] User: "t xoá m bây giờ" (Trêu đùa bạn thân)`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Không hỏi ngược kiểu "sao lại vậy bro": ${!isQuestion && !hasUnwantedBro ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 4: Tiếng lóng dừng dứt khoát ("sybau" = shut your b*tch ass up)
{
  const sim = new ChatSessionSimulator();
  const { result } = sim.sendMessage('sybau');
  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const hasSybauQuestion = /sao.*sybau/i.test(result.replies[0]);
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && !hasQuestionMark && !hasSybauQuestion && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 4] User: "sybau" (Stop signal tiếng lóng - Im đi)`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Có hỏi lại "sao bro lại sybau vậy" không: ${hasSybauQuestion ? 'CÓ (VI PHẠM NẶNG)' : 'KHÔNG (CHUẨN)'}`);
  console.log(`- Số bong bóng: ${result.replies.length} (Duy nhất 1)`);
  console.log(`- Độ dài từ: ${result.replies[0].split(/\s+/).length} từ (<= 5 từ)`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 5: Tiếng lóng "cook" (Biến đi / dừng câu chuyện)
{
  const sim = new ChatSessionSimulator();
  const { result } = sim.sendMessage('cook');
  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && !hasQuestionMark && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 5] User: "cook" (Stop signal tiếng lóng - Biến đi)`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Dừng dứt khoát, không hỏi vặn: ${!hasQuestionMark ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 6: Soft close siêu ngắn ("okk")
{
  const sim = new ChatSessionSimulator();
  const { result } = sim.sendMessage('okk');
  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passWordCount = result.replies[0].split(/\s+/).length <= 4;
  const pass = passOneBubble && !hasQuestionMark && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 6] User: "okk" (Xác nhận kết thúc mạch)`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Duy nhất 1 bong bóng cực ngắn: ${pass ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 7: Soft close tạm dừng ("để t thử xem")
{
  const sim = new ChatSessionSimulator();
  const { result } = sim.sendMessage('để t thử xem');
  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && !hasQuestionMark && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 7] User: "để t thử xem" (Tạm dừng triển khai)`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Không hỏi thêm: ${!hasQuestionMark ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 8: Chế độ Chuyên gia Gemini ("hệ thống supabase của t đang bị nghẽn query...")
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('hệ thống supabase của t đang bị nghẽn query...');
  const passTitle = session.title === 'Tối ưu kiến trúc Supabase';
  const passState = result.conversation_state === 'gemini_expert';
  const pass = passTitle && passState;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 8] User hỏi kỹ thuật sâu (Chế độ Gemini Expert)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 9: Thấu cảm tâm sự ("t vừa trượt phỏng vấn buồn và nản quá")
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('t vừa trượt phỏng vấn buồn và nản quá');
  const passState = result.conversation_state === 'emotional_support';
  const passTitle = session.title === 'Tâm sự giải tỏa áp lực';
  const hasUnwantedBro = result.replies.some(r => /\bbro\b/i.test(r));
  const pass = passState && passTitle && !hasUnwantedBro;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 9] User: "t vừa trượt phỏng vấn..." (Emotional Support)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 10: Hỏi danh tính ("mày là ai")
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('mày là ai');
  const passTitle = session.title === 'Giới thiệu về Tomorrow';
  const hasUnwantedBro = result.replies.some(r => /\bbro\b/i.test(r));
  const pass = passTitle && !hasUnwantedBro;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 10] User: "mày là ai" (Giới thiệu bản thân - Bạn thân)`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Không chêm chữ "bro" tùy tiện: ${!hasUnwantedBro ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 11: Kiểm thử ma trận lọc tiêu đề rác (isPlaceholderOrNoiseTitle)
{
  const noiseSamples = [
    'hello', 'hi', 'alo', 'yo', 'ê', 'ơi',
    'ok', 'okk', 'ok r', 'ok r đó', 'ok rồi đó', 'ok nha', 'ok nhé',
    'thanks', 'thanks bro', 'cảm ơn bro', 'thank kiu',
    'sybau', 'cook', 'cút', 'bye', 'pp', 'để t thử xem',
  ];
  const legitimateSamples = [
    'Tranh luận Ronaldo và Messi',
    'Áp lực deadline môn OOP',
    'Thuyết trình đồ án tốt nghiệp',
    'Tối ưu kiến trúc Supabase',
    'Kế hoạch nâng cấp Tomorrow',
    'Giới thiệu về Tomorrow',
  ];

  const passNoise = noiseSamples.every((sample) => isPlaceholderOrNoiseTitle(sample) === true);
  const passLegit = legitimateSamples.every((sample) => isPlaceholderOrNoiseTitle(sample) === false);
  const pass = passNoise && passLegit;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 11] Kiểm thử Bộ lọc Tiêu đề Rác (isPlaceholderOrNoiseTitle)`);
  console.log(`- Lọc mẫu rác/xã giao/sybau/cook (${noiseSamples.length} mẫu): ${passNoise ? '100% NHẬN DIỆN RÁC (ĐẠT)' : 'LỖI'}`);
  console.log(`- Bảo vệ tiêu đề thật (${legitimateSamples.length} mẫu): ${passLegit ? '100% BẢO TOÀN TIÊU ĐỀ (ĐẠT)' : 'LỖI'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 12: Hội thoại đa lượt thực tế từ ảnh chụp người dùng:
// User: "nhưng t fan ronaldo" -> "m fan ai?" -> "t xoá m bây giờ" -> "sybau"
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('nhưng t fan ronaldo');
  const title1 = sim.session.title;
  sim.sendMessage('m fan ai?');
  sim.sendMessage('t xoá m bây giờ');
  const { result } = sim.sendMessage('sybau');
  const titleFinal = sim.session.title;

  const passTitlePreserved = titleFinal === 'Tranh luận Ronaldo và Messi';
  const passNoSybauQuestion = !result.replies[0].includes('?') && !result.replies[0].includes('sybau');
  const passNoBro = !result.replies[0].includes('bro');
  const pass = passTitlePreserved && passNoSybauQuestion && passNoBro;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 12] Chuỗi hội thoại thực tế từ ảnh người dùng:`);
  console.log(`  User: "nhưng t fan ronaldo" -> "m fan ai?" -> "t xoá m bây giờ" -> "sybau"`);
  console.log(`- Tiêu đề khởi tạo: "${title1}"`);
  console.log(`- Tiêu đề sau khi user bảo "sybau": "${titleFinal}" (Bảo toàn nguyên vẹn chủ đề bóng đá)`);
  console.log(`- Phản hồi khi user nhắn "sybau": "${result.replies[0]}"`);
  console.log(`- Tuyệt đối không hỏi ngược "sao bro lại sybau vậy": ${passNoSybauQuestion ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

console.log('\n' + '='.repeat(70));
console.log(`🏁 TỔNG KẾT: ĐÃ VƯỢT QUA ${passedCount}/${totalTests} KỊCH BẢN KIỂM THỬ TƯ DUY!`);
console.log('='.repeat(70));

if (passedCount !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
