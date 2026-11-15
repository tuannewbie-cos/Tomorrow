/**
 * TOMORROW MINDSET TRAIN SIMULATOR
 * Kiểm thử 6 kịch bản tư duy hội thoại và cập nhật tiêu đề thông minh
 */

const fs = require('fs');
const path = require('path');

// Định nghĩa hàm isPlaceholderOrNoiseTitle chuẩn theo chatStorage.ts
const isPlaceholderOrNoiseTitle = (title) => {
  if (!title) return true;
  const clean = title.trim().toLowerCase();
  const noiseWords = [
    'cuộc trò chuyện mới', 'trò chuyện ngắn', 'hello', 'helo', 'hi', 'hí', 'halo',
    'yo', 'ê', 'alo', 'ơi', 'ok', 'okk', 'oki', 'okii', 'uk', 'ừ', 'ừa', 'test', 'pp', 'bye'
  ];
  return noiseWords.includes(clean) || clean.length <= 5;
};

// Định nghĩa formatSessionTitle theo SidebarDrawer.tsx
const formatSessionTitle = (rawTitle) => {
  if (isPlaceholderOrNoiseTitle(rawTitle)) {
    return 'Trò chuyện ngắn';
  }
  return rawTitle;
};

// Mô phỏng Local Resilient Fallback Engine chuẩn theo aiService.ts
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
    /^(okk|ok|oki|okii|ừ|ừa|uk|ok r|ok r đó|ok r do|ok bro|để t thử|để t thử xem|de t thu|de t thu xem|thank kiu|ok thank|thanks|tks|cảm ơn|cam on|pp|bye)[!.? ]*$/i.test(lower) ||
    lower.startsWith('để t thử') ||
    lower.startsWith('de t thu') ||
    lower.startsWith('ok r đó') ||
    lower.startsWith('ok r');

  if (isSoftClose) {
    let replyText = 'okii';
    if (lower.includes('thử') || lower.includes('thu')) {
      replyText = 'ok triển đi bro';
    } else if (lower.includes('thank') || lower.includes('cảm ơn') || lower.includes('cam on') || lower.includes('tks')) {
      replyText = 'ok cần gì cứ ới';
    } else if (lower.includes('r đó') || lower.includes('r do') || lower.includes('ok r') || lower.includes('ok bro')) {
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
  if (/^(yo|ê|e|alo|hú|hu|helo|hello|hi|hii|halo|hí)[!.? ]*$/i.test(lower)) {
    return {
      replies: ['yo bro', 'nghe đây bro'],
      session_title: '',
      should_update_title: false,
      conversation_state: 'ping',
      memory_note: '',
    };
  }

  // 3. HUẤN LUYỆN TƯ DUY TOMORROW
  if (lower.includes('train') || lower.includes('tư duy') || lower.includes('tu duy') || lower.includes('máy móc')) {
    return {
      replies: ['bắt sóng luôn bro', 'nói đi, muốn tối ưu thêm góc nào'],
      session_title: 'Huấn luyện tư duy Tomorrow',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Đang huấn luyện và tối ưu tư duy hội thoại cho Tomorrow',
    };
  }

  // 4. DEADLINE OOP / HỌC TẬP
  if (lower.includes('oop') || lower.includes('môn oop') || (lower.includes('deadline') && (lower.includes('stress') || lower.includes('mệt') || lower.includes('met')))) {
    const isOOP = lower.includes('oop');
    const title = isOOP ? 'Áp lực deadline môn OOP' : 'Áp lực deadline cuối tuần';
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'ném phần vướng qua đây tôi rà soát gỡ cùng'],
      session_title: title,
      should_update_title: true,
      conversation_state: 'active_chat',
      memory_note: isOOP ? 'Đang chịu áp lực deadline môn OOP' : 'Đang xử lý deadline gấp',
    };
  }

  // 5. THUYẾT TRÌNH / DỰ ÁN / CHỦ ĐỀ SÂU
  if (lower.includes('thuyết trình') || lower.includes('đồ án') || lower.includes('slide')) {
    return {
      replies: ['triển thôi bro', 'dàn ý cần mấy slide chính, quăng cấu trúc đây tôi lên sườn'],
      session_title: 'Thuyết trình đồ án tốt nghiệp',
      should_update_title: true,
      conversation_state: 'deep_work',
      memory_note: 'Chuẩn bị bài thuyết trình đồ án tốt nghiệp',
    };
  }

  // 6. TÂM TRẠNG
  if (lower.includes('chán') || lower.includes('buồn') || lower.includes('mệt') || lower.includes('stress')) {
    return {
      replies: ['ngồi xuống thở một nhịp đi bro', 'có gì đè nặng trong đầu cứ nói ra, tôi nghe'],
      session_title: 'Tâm sự giải tỏa áp lực',
      should_update_title: true,
      conversation_state: 'emotional_support',
      memory_note: 'Đang mệt mỏi và cần xả stress',
    };
  }

  // Mặc định
  return {
    replies: ['nghe đây bro', 'có vụ gì mới à'],
    session_title: '',
    should_update_title: false,
    conversation_state: 'active_chat',
    memory_note: '',
  };
}

// Giả lập phiên chat (App.tsx session logic)
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

// Chạy 6 kịch bản kiểm thử
console.log('='.repeat(65));
console.log('🚀 TOMORROW DEEP CONVERSATIONAL MINDSET SIMULATOR');
console.log('='.repeat(65));

let passedCount = 0;
const totalTests = 6;

// KỊCH BẢN 1: Ping ngắn ("hello")
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('hello');
  const passReplies = result.replies.length >= 1 && result.replies.length <= 2;
  const passTitle = session.title === 'Cuộc trò chuyện mới';
  const passState = result.conversation_state === 'ping';
  const pass = passReplies && passTitle && passState;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 1] User: "hello" (Ping)`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Phản hồi Tomorrow (${result.replies.length} bong bóng): ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}" (Sidebar: "${formatSessionTitle(session.title)}")`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 2: Huấn luyện tư duy ("nay t ngồi train lại tư duy cho m đỡ máy móc hơn đấy")
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('nay t ngồi train lại tư duy cho m đỡ máy móc hơn đấy');
  const passTitle = session.title === 'Huấn luyện tư duy Tomorrow';
  const passShouldUpdate = result.should_update_title === true;
  const passReplies = result.replies.length > 0;
  const pass = passTitle && passShouldUpdate && passReplies;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 2] User: "nay t ngồi train lại tư duy cho m đỡ máy móc hơn đấy"`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- should_update_title: ${result.should_update_title}`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 3: Tín hiệu khép mạch "okk" / "ok r đó"
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

// KỊCH BẢN 4: Than mệt/stress vì deadline OOP
{
  const sim = new ChatSessionSimulator();
  const { result, session } = sim.sendMessage('nay t mệt và stress quá vì deadline môn oop ngập đầu');
  const passTitle = session.title === 'Áp lực deadline môn OOP';
  const passEmp = result.replies.length > 0;
  const pass = passTitle && passEmp;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 4] User: "nay t mệt và stress quá vì deadline môn oop ngập đầu"`);
  console.log(`- Phản hồi Tomorrow: ${JSON.stringify(result.replies)}`);
  console.log(`- Tiêu đề Session: "${session.title}"`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 5: User nhắn "để t thử xem"
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('nay t mệt và stress quá vì deadline môn oop ngập đầu');
  const { result } = sim.sendMessage('để t thử xem');

  const passOneBubble = result.replies.length === 1;
  const hasQuestionMark = result.replies[0].includes('?');
  const passNoQuestion = !hasQuestionMark;
  const passState = result.conversation_state === 'soft_close';
  const pass = passOneBubble && passNoQuestion && passState;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 5] User: "để t thử xem" (Tạm dừng triển khai)`);
  console.log(`- Phản hồi Tomorrow: "${result.replies[0]}"`);
  console.log(`- Trạng thái AI: ${result.conversation_state}`);
  console.log(`- Không hỏi thêm: ${passNoQuestion ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

// KỊCH BẢN 6: Đổi chủ đề sâu hơn (AI cập nhật session_title mới)
{
  const sim = new ChatSessionSimulator();
  sim.sendMessage('hello');
  const prevTitle = sim.session.title;
  const { result, session } = sim.sendMessage('mai thuyết trình đồ án tốt nghiệp rồi, lên dàn ý slide giúp t với');

  const passNewTitle = session.title === 'Thuyết trình đồ án tốt nghiệp';
  const passUpdated = session.title !== prevTitle;
  const passShouldUpdate = result.should_update_title === true;
  const pass = passNewTitle && passUpdated && passShouldUpdate;

  if (pass) passedCount++;
  console.log(`\n[KỊCH BẢN 6] User đổi chủ đề sâu hơn: "mai thuyết trình đồ án tốt nghiệp..."`);
  console.log(`- Tiêu đề trước đó: "${prevTitle}"`);
  console.log(`- Tiêu đề mới cập nhật: "${session.title}"`);
  console.log(`- should_update_title: ${result.should_update_title}`);
  console.log(`=> Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}`);
}

console.log('\n' + '='.repeat(65));
console.log(`🏁 TỔNG KẾT: ĐÃ VƯỢT QUA ${passedCount}/${totalTests} KỊCH BẢN KIỂM THỬ TƯ DUY!`);
console.log('='.repeat(65));

if (passedCount !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
