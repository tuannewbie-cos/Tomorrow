/**
 * TOMORROW MINDSET TRAIN SIMULATOR (EXPANDED V2)
 * Kiểm thử toàn diện 5 trạng thái tư duy, độ nhạy tâm lý, biến thể "OKK" rule,
 * và thuật toán tóm tắt / bảo toàn tiêu đề session_title.
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

// 3. Mô phỏng Local Resilient Fallback Engine chuẩn theo aiService.ts
function localResilientFallback(userMessage, hasImage = false) {
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  if (hasImage) {
    return {
      replies: ['ảnh gì đây bro', 'giao diện hay bug cần soi à :3'],
      session_title: 'Trao đổi về hình ảnh',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Vừa chia sẻ hình ảnh',
    };
  }

  // 1. QUY TẮC ĐỌC TÍN HIỆU KHÉP MẠCH / TẠM BIỆT NGẦM ("OKK" RULE)
  const isSoftClose =
    /^(okk|ok|okkk|oki|okii|okie|okela|ok nha|ok nhé|ok nhe|ok r|ok r đó|ok r do|ok roi|ok rồi|ok rồi đó|ok bro|oki bro|ok b|ok bạn|ừ|ừa|uk|uh|uhm|ừm|um|umk|thank kiu|thank kiuu|thank kiu bro|ok thank|thanks|thanks bro|tks|tks bro|thank you|cảm ơn|cảm ơn bro|cảm ơn bạn|cảm ơn nhiều|cam on|cam on bro|pp|pp bro|bye|bye bro|g9)[!.? ]*$/i.test(lower) ||
    lower.startsWith('để t thử') ||
    lower.startsWith('de t thu') ||
    lower.startsWith('để t test') ||
    lower.startsWith('để mình thử') ||
    lower.startsWith('để tui thử') ||
    lower.startsWith('ok r đó') ||
    lower.startsWith('ok r') ||
    lower.startsWith('ok rồi') ||
    lower.startsWith('thanks bro') ||
    lower.startsWith('cảm ơn bro');

  if (isSoftClose) {
    let replyText = 'okii';
    if (lower.includes('thử') || lower.includes('thu') || lower.includes('test')) {
      replyText = 'ok triển đi bro';
    } else if (lower.includes('thank') || lower.includes('cảm ơn') || lower.includes('cam on') || lower.includes('tks')) {
      replyText = 'ok cần gì cứ ới';
    } else if (lower.includes('r đó') || lower.includes('r do') || lower.includes('ok r') || lower.includes('ok bro') || lower.includes('rồi') || lower.includes('nha') || lower.includes('nhé') || lower.includes('nhe')) {
      replyText = 'ừa triển đi';
    }

    return {
      replies: [replyText],
      session_title: '',
      should_update_title: false,
      conversation_state: 'soft_close',
      memory_note: '',
    };
  }

  // 2. QUY TẮC ĐỌC NHỊP MỞ ĐẦU (PING)
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii|halo|hí|ơi)[!.? ]*$/i.test(lower)) {
    return {
      replies: ['yo bro', 'nghe đây bro'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'ping',
      memory_note: '',
    };
  }

  // 3. HUẤN LUYỆN TƯ DUY TOMORROW (DEEP WORK)
  if (lower.includes('train') || lower.includes('tư duy') || lower.includes('tu duy') || lower.includes('máy móc')) {
    return {
      replies: ['bắt sóng luôn bro', 'nói đi, muốn tối ưu thêm góc nào'],
      session_title: 'Huấn luyện tư duy Tomorrow',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
    };
  }

  // 4. THUYẾT TRÌNH / ĐỒ ÁN / SLIDE (DEEP WORK)
  if (
    lower.includes('thuyết trình') ||
    lower.includes('đồ án') ||
    lower.includes('slide') ||
    lower.includes('thuyet trinh') ||
    lower.includes('do an')
  ) {
    return {
      replies: ['triển thôi bro', 'dàn ý cần mấy slide chính, quăng cấu trúc đây tôi lên sườn'],
      session_title: 'Thuyết trình đồ án tốt nghiệp',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
    };
  }

  // 5. KỸ THUẬT / KIẾN TRÚC / SUPABASE / DATABASE / QUERY NGHẼN (DEEP WORK)
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
      replies: ['tập trung vào indexing và giảm payload query trước bro', 'ném câu query đang nghẽn qua đây tôi tối ưu lại'],
      session_title: 'Tối ưu kiến trúc Supabase',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Tối ưu hiệu năng và query database Supabase',
    };
  }

  // 6. DEADLINE OOP / HỌC TẬP (EMOTIONAL SUPPORT)
  if (lower.includes('oop') || lower.includes('môn oop') || (lower.includes('deadline') && (lower.includes('stress') || lower.includes('mệt') || lower.includes('met')))) {
    const isOOP = lower.includes('oop');
    const title = isOOP ? 'Áp lực deadline môn OOP' : 'Áp lực deadline cuối tuần';
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'ném phần vướng qua đây tôi rà soát gỡ cùng'],
      session_title: title,
      should_update_title: true,
      conversation_state: 'emotional_support',
      memory_note: isOOP ? 'Đang chịu áp lực deadline môn OOP' : 'Đang xử lý deadline gấp',
    };
  }

  // 7. TRƯỢT PHỎNG VẤN / THẤT BẠI / NẢN LÒNG (EMOTIONAL SUPPORT)
  if (
    lower.includes('phỏng vấn') ||
    lower.includes('phong van') ||
    lower.includes('trượt') ||
    lower.includes('truot') ||
    lower.includes('thất bại') ||
    lower.includes('that bai')
  ) {
    return {
      replies: ['thất bại một lần không định nghĩa năng lực của bro đâu', 'ngồi xuống thở một nhịp đi, tôi luôn ở đây đồng hành cùng bro'],
      session_title: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      conversation_state: 'emotional_support',
      memory_note: 'Gặp khó khăn sau phỏng vấn và cần động viên tinh thần',
    };
  }

  // 8. HỎI DANH TÍNH (ACTIVE CHAT)
  if (
    lower.includes('tên gì') ||
    lower.includes('tên là gì') ||
    lower.includes('bạn là ai') ||
    lower.includes('mày là ai') ||
    lower.includes('ai đấy')
  ) {
    return {
      replies: ['tôi là Tomorrow', 'trợ lý kiêm tri kỷ của bro'],
      session_title: 'Giới thiệu về Tomorrow',
      should_update_title: true,
      conversation_state: 'active_chat',
      memory_note: '',
    };
  }

  // 9. DỰ ÁN / KẾ HOẠCH NÂNG CẤP (DEEP WORK)
  if (
    lower.includes('dự án') ||
    lower.includes('kế hoạch') ||
    lower.includes('nâng cấp') ||
    lower.includes('tomorrow') ||
    lower.includes('jarvis')
  ) {
    return {
      replies: ['kế hoạch chi tiết thế nào', 'liệt kê các module chính đi tôi phân tích kiến trúc'],
      session_title: 'Kế hoạch nâng cấp Tomorrow',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Đang triển khai kế hoạch nâng cấp Tomorrow',
    };
  }

  // 10. SINH HOẠT / NGỦ NGHỈ (SOFT CLOSE)
  if (lower.includes('ngủ') || lower.includes('chợp mắt')) {
    return {
      replies: ['ok chợp mắt đi bro', 'cần gì cứ ới'],
      session_title: 'Nghỉ ngơi lấy lại sức',
      should_update_title: true,
      conversation_state: 'soft_close',
      memory_note: '',
    };
  }
  if (lower.includes('5p') || lower.includes('ăn cơm') || lower.includes('đợi')) {
    return {
      replies: ['ok thong thả nhé'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'soft_close',
      memory_note: '',
    };
  }

  // 11. TÂM SỰ / STRESS / CHÁN / BUỒN (EMOTIONAL SUPPORT)
  if (
    lower.includes('chán') ||
    lower.includes('buồn') ||
    lower.includes('mệt') ||
    lower.includes('cô đơn') ||
    lower.includes('stress') ||
    lower.includes('overthinking') ||
    lower.includes('bế tắc') ||
    lower.includes('be tac')
  ) {
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'có gì đè nặng trong đầu cứ nói ra, tôi nghe'],
      session_title: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      conversation_state: 'emotional_support',
      memory_note: 'Đang mệt mỏi và cần xả stress',
    };
  }

  // Mặc định (ACTIVE CHAT)
  return {
    replies: ['nghe đây bro', 'có vụ gì mới à'],
    session_title: '',
    should_update_title: false,
    conversation_state: 'active_chat',
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

    // 1. Logic tạo session ở tin nhắn đầu tiên trong App.tsx
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

    // 2. Gọi AI
    const result = localResilientFallback(text);

    // 3. Logic cập nhật tiêu đề thông minh trong App.tsx
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

// ==========================================
// BỘ 12 KỊCH BẢN KIỂM THỬ TƯ DUY & ĐỘ NHẠY
// ==========================================
console.log('='.repeat(70));
console.log('🚀 TOMORROW DEEP CONVERSATIONAL MINDSET SIMULATOR (12 SCENARIOS)');
console.log('='.repeat(70));

let passedCount = 0;
const totalTests = 12;

// KỊCH BẢN 1: Ping ngắn ("hello")
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('hello');
  const passReplies = result.replies.length >= 1 && result.replies.length <= 2;
  const passTitle = session.title === 'Cuộc trò chuyện mới';
  const passSidebar = formatSessionTitle(session.title) === 'Trò chuyện ngắn';
  const passState = result.conversation_state === 'ping';
  const pass = passReplies && passTitle && passSidebar && passState;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 1] User: "hello" (Trạng thái Ping)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow (${result.replies.length} bong bóng): ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}" (Sidebar: "${formatSessionTitle(session.title)}")`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 2: Deep Work - Huấn luyện tư duy
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('nay t ngồi train lại tư duy cho m đỡ máy móc hơn đấy');
  const passTitle = session.title === 'Huấn luyện tư duy Tomorrow';
  const passShouldUpdate = result.should_update_title === true;
  const passState = result.conversation_state === 'deep_work';
  const passReplies = result.replies.length > 0;
  const pass = passTitle && passShouldUpdate && passState && passReplies;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 2] User: "nay t ngồi train lại tư duy cho m đỡ máy móc hơn đấy" (Deep Work)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- should_update_title: ${result.should_update_title}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 3: Soft Close cơ bản ("ok r đó")
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('nay t ngồi train lại tư duy cho m đỡ máy móc hơn đấy');
  const { result, session } = sim.sendMessage('ok r đó');

  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passNoQuestion = !hasQuestionMark;
  const passState = result.conversation_state === 'soft_close';
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && passNoQuestion && passState && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 3] User: "ok r đó" ("OKK" Rule - Khép mạch ngầm)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Số bong bóng: ${result.replies.length} (Bong bóng duy nhất: "${result.replies[0]}")`);
  console.log(`- Có chứa dấu hỏi không: ${hasQuestionMark ? 'CÓ (VI PHẠM)' : 'KHÔNG (TUÂN THỦ)'}`);
  console.log(`- Độ dài từ: ${result.replies[0].split(/\s+/).length} từ (<= 5 từ)`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 4: Emotional Support - Áp lực deadline OOP
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('nay t mệt và stress quá vì deadline môn oop ngập đầu');
  const passTitle = session.title === 'Áp lực deadline môn OOP';
  const passState = result.conversation_state === 'emotional_support';
  const passEmp = result.replies.length > 0;
  const pass = passTitle && passState && passEmp;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 4] User: "nay t mệt và stress quá vì deadline môn oop ngập đầu" (Emotional Support)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 5: Soft Close biến thể 1 ("để t thử xem")
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('nay t mệt và stress quá vì deadline môn oop ngập đầu');
  const { result } = sim.sendMessage('để t thử xem');

  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passNoQuestion = !hasQuestionMark;
  const passState = result.conversation_state === 'soft_close';
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && passNoQuestion && passState && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 5] User: "để t thử xem" (Soft Close - Tạm dừng triển khai)`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Không hỏi thêm: ${passNoQuestion ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`- Độ dài từ: ${result.replies[0].split(/\s+/).length} từ (<= 5 từ)`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 6: Chuyển đổi chủ đề sâu (Topic Shift)
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('hello');
  const prevTitle = sim.session.title;
  const { result, session } = sim.sendMessage('mai thuyết trình đồ án tốt nghiệp rồi, lên dàn ý slide giúp t với');

  const passNewTitle = session.title === 'Thuyết trình đồ án tốt nghiệp';
  const passUpdated = session.title !== prevTitle;
  const passShouldUpdate = result.should_update_title === true;
  const passState = result.conversation_state === 'deep_work';
  const pass = passNewTitle && passUpdated && passShouldUpdate && passState;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 6] Chuyển chủ đề sâu: "mai thuyết trình đồ án tốt nghiệp..." (Topic Shift)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Tiêu đề trước đó: "${prevTitle}"`);
  console.log(`- Tiêu đề mới cập nhật: "${session.title}"`);
  console.log(`- should_update_title: ${result.should_update_title}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 7: Soft Close biến thể 2 ("thanks bro")
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('mai thuyết trình đồ án tốt nghiệp rồi, lên dàn ý slide giúp t với');
  const { result, session } = sim.sendMessage('thanks bro');

  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passNoQuestion = !hasQuestionMark;
  const passState = result.conversation_state === 'soft_close';
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && passNoQuestion && passState && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 7] User: "thanks bro" (Soft Close - Cảm ơn kết thúc)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Không hỏi thêm: ${passNoQuestion ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`- Độ dài từ: ${result.replies[0].split(/\s+/).length} từ (<= 5 từ)`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 8: Soft Close biến thể 3 ("okk" / "ok nha")
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('mai thuyết trình đồ án tốt nghiệp rồi, lên dàn ý slide giúp t với');
  const { result } = sim.sendMessage('okk');

  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passNoQuestion = !hasQuestionMark;
  const passState = result.conversation_state === 'soft_close';
  const passWordCount = result.replies[0].split(/\s+/).length <= 5;
  const pass = passOneBubble && passNoQuestion && passState && passWordCount;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 8] User: "okk" (Soft Close - Xác nhận siêu ngắn)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Không hỏi thêm: ${passNoQuestion ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`- Độ dài từ: ${result.replies[0].split(/\s+/).length} từ (<= 5 từ)`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 9: Emotional Support - Nỗi buồn trượt phỏng vấn
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('t vừa trượt phỏng vấn buồn và nản quá bro ơi');

  const passState = result.conversation_state === 'emotional_support';
  const passTitle = session.title === 'Tâm sự giải tỏa áp lực';
  const passReplies = result.replies.length > 0;
  const pass = passState && passTitle && passReplies;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 9] User: "t vừa trượt phỏng vấn buồn và nản quá bro ơi" (Emotional Support)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 10: Deep Work - Tối ưu kiến trúc Database Supabase
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('hệ thống supabase của t đang bị nghẽn query, tối ưu thế nào bro');

  const passState = result.conversation_state === 'deep_work';
  const passTitle = session.title === 'Tối ưu kiến trúc Supabase';
  const passShouldUpdate = result.should_update_title === true;
  const pass = passState && passTitle && passShouldUpdate;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 10] User: "hệ thống supabase của t đang bị nghẽn query..." (Deep Work)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 11: Kiểm thử toàn diện Bộ lọc Tiêu đề Rác (isPlaceholderOrNoiseTitle)
{
  const noiseSamples = [
    'hello', 'yo', 'ê', 'alo', 'ok', 'okk', 'okii', 'ok nha', 'ok nhé',
    'ok bro', 'thanks', 'thanks bro', 'cảm ơn', 'tks bro', 'để t thử xem',
    'test', 'cuộc trò chuyện mới', 'trò chuyện ngắn',
  ];
  const validSamples = [
    'Huấn luyện tư duy Tomorrow',
    'Áp lực deadline môn OOP',
    'Thuyết trình đồ án tốt nghiệp',
    'Tâm sự giải tỏa áp lực',
    'Tối ưu kiến trúc Supabase',
    'Kế hoạch nâng cấp Tomorrow',
  ];

  const allNoisePassed = noiseSamples.every((title) => isPlaceholderOrNoiseTitle(title) === true);
  const allValidPassed = validSamples.every((title) => isPlaceholderOrNoiseTitle(title) === false);
  const pass = allNoisePassed && allValidPassed;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 11] Kiểm thử Bộ lọc Tiêu đề Rác (isPlaceholderOrNoiseTitle)`);
  console.log(`- Lọc mẫu rác/xã giao (${noiseSamples.length} mẫu): ${allNoisePassed ? '100% NHẬN DIỆN RÁC (ĐẠT)' : 'CÓ MẪU BỎ SÓT (LỖI)'}`);
  console.log(`- Bảo vệ tiêu đề thật (${validSamples.length} mẫu): ${allValidPassed ? '100% BẢO TOÀN TIÊU ĐỀ (ĐẠT)' : 'BỊ LỌC NHẦM (LỖI)'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 12: Chuỗi hội thoại phức hợp & Bảo toàn tiêu đề (End-to-End Flow)
{
  const sim = new ChatSessionSimulator();
  
  // Bước 1: Ping
  sim.sendMessage('alo');
  const title1 = sim.session.title;
  const pass1 = title1 === 'Cuộc trò chuyện mới';

  // Bước 2: Hỏi danh tính
  sim.sendMessage('mày là ai thế');
  const title2 = sim.session.title;
  const pass2 = title2 === 'Giới thiệu về Tomorrow';

  // Bước 3: Đồ án gấp
  sim.sendMessage('mai thuyết trình đồ án tốt nghiệp rồi, lên dàn ý slide giúp t với');
  const title3 = sim.session.title;
  const pass3 = title3 === 'Thuyết trình đồ án tốt nghiệp';

  // Bước 4: Soft close kết thúc
  const { result } = sim.sendMessage('thanks bro để t thử xem');
  const title4 = sim.session.title;
  const pass4 = title4 === 'Thuyết trình đồ án tốt nghiệp'; // Phải giữ nguyên tiêu đề đồ án!
  const passSoft = result.conversation_state === 'soft_close' && result.replies.length === 1;

  const pass = pass1 && pass2 && pass3 && pass4 && passSoft;
  if (pass) passedCount++;

  console.log(`\n[KỊCH BẢN 12] Chuỗi hội thoại 4 bước (Multi-turn Title Preservation)`);
  console.log(`- Bước 1 ("alo"): Tiêu đề = "${title1}" (Khởi tạo chuẩn)`);
  console.log(`- Bước 2 ("mày là ai thế"): Tiêu đề = "${title2}" (Cập nhật danh tính)`);
  console.log(`- Bước 3 ("mai thuyết trình..."): Tiêu đề = "${title3}" (Cập nhật đồ án sâu)`);
  console.log(`- Bước 4 ("thanks bro để t thử xem"): Tiêu đề = "${title4}" (Bảo toàn, KHÔNG bị ghi đè bởi soft_close)`);
  console.log(`- Phản hồi bước 4: "${result.replies[0]}" (State: ${result.conversation_state})`);
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
