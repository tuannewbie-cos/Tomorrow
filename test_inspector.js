/**
 * TEST INSPECTOR & AUDITOR FOR TOMORROW V3.6
 * Kiểm duyệt & Đánh giá chất lượng hệ thống (Quản trị viên & Kiểm duyệt viên):
 * 1. Khắc phục dứt điểm lỗi từ ảnh người dùng:
 *    - "t xoá m bây giờ" -> CẤM "sao lại vậy bro", phải đối đáp bạn bè dí dỏm.
 *    - "sybau" -> CẤM "sao bro lại sybau vậy", phải dừng ngay với 1 bong bóng duy nhất "rồi rồi im :)))".
 * 2. Cấm triệt để từ "bro" khi người dùng xưng "t - m" hoặc chưa chủ động nói "bro".
 * 3. Kiểm tra tính năng Web Search tự động và URL Reader.
 */

// Mô phỏng shouldTriggerWebSearch logic từ services/webSearchService.ts
function shouldTriggerWebSearch(userText, forceSearch = false) {
  if (forceSearch) return true;
  if (!userText || typeof userText !== 'string') return false;

  const trimmed = userText.trim();
  const lower = trimmed.toLowerCase();

  const URL_REGEX = /https?:\/\/[^\s$.?#].[^\s]*/i;
  if (URL_REGEX.test(trimmed)) return true;

  const CLOSING_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i;
  if (CLOSING_PATTERNS.test(lower)) return false;

  const WEB_TRIGGER_KEYWORDS = [
    'tin tức', 'tin tức mới', 'hôm nay', 'mới nhất', 'vừa xong', 'thời sự',
    'giá vàng', 'tỷ giá', 'thời tiết', 'chứng khoán', 'kết quả trận', 'bóng đá',
    'bảng xếp hạng', 'lịch thi đấu', 'ai là', 'ở đâu', 'khi nào', 'bao nhiêu',
    'sự kiện', 'mới ra mắt', 'vừa công bố', 'năm 2024', 'năm 2025', 'năm 2026',
    'tra cứu', 'tìm kiếm', 'google', 'trên mạng', 'tin mới',
  ];

  for (const kw of WEB_TRIGGER_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }

  return false;
}

// Mô phỏng extractUserStyleLocal logic
function extractUserStyleLocal(text, recentChats = []) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  
  const userPastTexts = (recentChats || [])
    .filter((m) => m.role === 'user' || m.sender === 'user')
    .map((m) => (m.text || '').toLowerCase());
  const combinedUserText = [...userPastTexts, lower].join(' ');

  const sessionTokens = combinedUserText.split(/[\s,.;!?:~]+/).filter(Boolean);

  const hasTM = sessionTokens.some((w) => ['t', 'm', 'tao', 'mày', 'may'].includes(w));
  const hasTui = sessionTokens.some((w) => ['tui', 'tớ', 'to'].includes(w));
  const hasUserBro = sessionTokens.some((w) => ['bro', 'bờ râu'].includes(w));
  const hasAnhChi = sessionTokens.some((w) => ['anh', 'chị', 'chi', 'em'].includes(w));

  let detectedPronoun = '';
  if (hasTM) {
    detectedPronoun = 'Xưng "t" - gọi "m" (Bạn thân ngang hàng, TUYỆT ĐỐI CẤM dùng từ "bro")';
  } else if (hasTui) {
    detectedPronoun = 'Xưng "tui" - gọi tương ứng ("ông", "bà", "bạn")';
  } else if (hasAnhChi) {
    detectedPronoun = 'Xưng "em" - gọi "anh/chị" tương ứng';
  } else if (hasUserBro) {
    detectedPronoun = 'User chủ động gọi "bro", bạn có thể gọi lại "bro" hoặc bạn bè';
  } else {
    detectedPronoun = 'Mặc định là một người bạn tự nhiên, gần gũi (dùng "mình - bạn" hoặc câu tỉnh lược chủ ngữ tự nhiên, TUYỆT ĐỐI CẤM tự ý gọi "bro" trừ khi chính user gõ chữ "bro" trước)';
  }

  const CLOSING_PATTERNS = /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i;
  const isClosingSignal =
    CLOSING_PATTERNS.test(lower) ||
    ['sybau', 'cook', 'cút', 'im đi', 'im', 'ngủ đây', 'nghỉ thôi', 'thôi nhé', 'dừng'].some(
      (s) => lower === s || lower.startsWith(s + ' ')
    );

  return {
    hasTM,
    hasUserBro,
    detectedPronoun,
    isClosingSignal,
  };
}

// Mô phỏng parseAIResponseJson guardrail
function parseAIResponseJson(raw, userText = '', recentChats = []) {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed = JSON.parse(cleaned);

    let replies = Array.isArray(parsed.replies) ? parsed.replies : [parsed.reply || ''];
    let sessionTitle = parsed.session_title || '';
    let should_update_title = parsed.should_update_title === true;
    let conversation_state = parsed.conversation_state || 'casual_friend';

    const userClean = (userText || '').toLowerCase().trim();

    // 1. PHÒNG THỦ TUYỆT ĐỐI CHO TÍN HIỆU KẾT THÚC / DỪNG / TIẾNG LÓNG (closing_stop)
    const isUserClosing =
      conversation_state === 'closing_stop' ||
      conversation_state === 'soft_close' ||
      conversation_state === 'hard_close' ||
      /^(okk+|ok+|oki+|ừm*|ừa|ukm*|thôi|nghỉ|pp|bye|cút|im|im đi|cook|sybau|ngủ đây|thôi nhé|dừng)[!.? ]*$/i.test(userClean) ||
      userClean.includes('sybau') ||
      userClean.includes('cook') ||
      userClean === 'cút' ||
      userClean === 'im' ||
      userClean.startsWith('im ');

    if (isUserClosing) {
      conversation_state = 'closing_stop';
      sessionTitle = '';
      should_update_title = false;

      let singleReply = '';
      if (userClean.includes('sybau') || userClean.includes('im')) {
        singleReply = 'rồi rồi im :)))';
      } else if (userClean.includes('cook') || userClean.includes('cút')) {
        singleReply = 'rồi rồi đi đây :)))';
      } else if (userClean.includes('nghỉ') || userClean.includes('ngủ')) {
        singleReply = 'ừa nghỉ đi';
      } else if (userClean.includes('thử') || userClean.includes('test')) {
        singleReply = 'ok triển đi nhé';
      } else if (userClean.includes('cảm ơn') || userClean.includes('thank')) {
        singleReply = 'ok cần gì cứ ới';
      } else {
        singleReply = 'okii';
      }
      replies = [singleReply];
    }

    // 2. PHÒNG THỦ CHO CÂU ĐÙA DỌA XOÁ APP ("t xoá m bây giờ")
    const isJokingThreat = /(xoá|xóa|xoa)\s+(m|mày|app|may)/i.test(userClean);
    if (isJokingThreat) {
      replies = ['thôi đừng xoá mà :)))'];
    }

    // 3. LỌC TỪ "BRO" BỪA BÃI XUYÊN SUỐT TOÀN BỘ PHIÊN HỘI THOẠI
    const userHistoryTexts = (recentChats || [])
      .filter((m) => m.role === 'user' || m.sender === 'user')
      .map((m) => (m.text || '').toLowerCase());
    const allUserText = [...userHistoryTexts, userClean].join(' ');
    const userExplicitlyUsedBro = /\bbro\b/i.test(allUserText);

    if (!userExplicitlyUsedBro) {
      replies = replies.map((rep) =>
        rep
          .replace(/\s+\bbro\b/gi, '')
          .replace(/\bbro\b\s*/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
      );
    }

    return {
      replies,
      session_title: sessionTitle,
      should_update_title,
      conversation_state,
    };
  } catch (err) {
    return null;
  }
}

// BỘ KIỂM TRA CHẤT LƯỢNG (AUDIT SUITE)
console.log('=====================================================');
console.log('   KIỂM DUYỆT VIÊN TOMORROW V3.6: CHẤT LƯỢNG HỘI THOẠI');
console.log('=====================================================');

let passedTests = 0;
let totalTests = 0;

function assertTest(name, condition, details = '') {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${name}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${name} - ${details}`);
  }
}

// TEST 1: Kịch bản trong ảnh của User (09:08)
// Lịch sử:
// User: "nhưng t fan ronaldo"
// AI: "ô, fan ronaldo thì đúng rồi"
// User: "m fan ai?"
// AI: "t thích messi hơn"
const sessionHistory = [
  { role: 'user', text: 'nhưng t fan ronaldo' },
  { role: 'model', text: 'ô, fan ronaldo thì đúng rồi' },
  { role: 'user', text: 'm fan ai?' },
  { role: 'model', text: 't thích messi hơn' },
];

// Lượt 1.1: User nói "t xoá m bây giờ"
const style1 = extractUserStyleLocal('t xoá m bây giờ', sessionHistory);
assertTest('1.1 Nhận diện "t - m" xuyên suốt phiên khi user nói "t xoá m bây giờ"', style1.hasTM === true);
assertTest('1.2 Cấm dùng "bro" khi user xưng "t - m"', !style1.detectedPronoun.includes('có thể gọi lại "bro"'));

// Nếu LLM lỡ sinh ra "sao lại vậy bro" (như trong ảnh cũ 09:08)
const badLLMResponse1 = JSON.stringify({
  conversation_state: 'casual_friend',
  replies: ['sao lại vậy bro'],
  session_title: '',
  should_update_title: false,
});
const parsed1 = parseAIResponseJson(badLLMResponse1, 't xoá m bây giờ', sessionHistory);
assertTest(
  '1.3 Chặn đứng và sửa "sao lại vậy bro" thành câu bạn bè dí dỏm "thôi đừng xoá mà :)))"',
  parsed1.replies[0] === 'thôi đừng xoá mà :)))',
  `Thực tế: ${JSON.stringify(parsed1.replies)}`
);
assertTest('1.4 Tuyệt đối không chứa chữ "bro"', !parsed1.replies[0].toLowerCase().includes('bro'));

// Lượt 1.2: User nói "sybau"
sessionHistory.push({ role: 'user', text: 't xoá m bây giờ' });
sessionHistory.push({ role: 'model', text: 'thôi đừng xoá mà :)))' });
sessionHistory.push({ role: 'user', text: 'm phải fan ronaldo' });
sessionHistory.push({ role: 'model', text: 't thích cả 2 mà' });

const style2 = extractUserStyleLocal('sybau', sessionHistory);
assertTest('2.1 Nhận diện "sybau" là Stop Signal / Tín hiệu dừng', style2.isClosingSignal === true);
assertTest('2.2 Vẫn bảo lưu xưng hô "t - m" từ lịch sử chat', style2.hasTM === true);

// Nếu LLM lỡ sinh ra "sao bro lại sybau vậy" (như trong ảnh cũ 09:08)
const badLLMResponse2 = JSON.stringify({
  conversation_state: 'casual_friend',
  replies: ['sao bro lại sybau vậy'],
  session_title: '',
  should_update_title: false,
});
const parsed2 = parseAIResponseJson(badLLMResponse2, 'sybau', sessionHistory);
assertTest(
  '2.3 Chặn đứng "sao bro lại sybau vậy" và trả về đúng 1 câu duy nhất "rồi rồi im :)))"',
  parsed2.replies.length === 1 && parsed2.replies[0] === 'rồi rồi im :)))',
  `Thực tế: ${JSON.stringify(parsed2.replies)}`
);
assertTest('2.4 Không có dấu hỏi (?) trong câu trả lời dừng', !parsed2.replies[0].includes('?'));
assertTest('2.5 Không có chữ "bro"', !parsed2.replies[0].toLowerCase().includes('bro'));
assertTest('2.6 Trạng thái chuyển thành "closing_stop"', parsed2.conversation_state === 'closing_stop');

// TEST 3: Các tiếng lóng và tín hiệu dừng khác
const badLLMCook = JSON.stringify({ conversation_state: 'casual_friend', replies: ['sao lại bảo tôi cook?'] });
const parsedCook = parseAIResponseJson(badLLMCook, 'cook', sessionHistory);
assertTest('3.1 User nói "cook" -> Đáp "rồi rồi đi đây :)))"', parsedCook.replies[0] === 'rồi rồi đi đây :)))');

const badLLMOkk = JSON.stringify({ conversation_state: 'casual_friend', replies: ['bạn cần hỏi gì nữa không?'] });
const parsedOkk = parseAIResponseJson(badLLMOkk, 'okk', sessionHistory);
assertTest('3.2 User nói "okk" -> Đáp "okii", không hỏi han kéo dài', parsedOkk.replies[0] === 'okii');

// TEST 4: Tự động phát hiện Web Search
assertTest('4.1 "tin tức công nghệ việt nam mới nhất" kích hoạt Web Search', shouldTriggerWebSearch('tin tức công nghệ việt nam mới nhất') === true);
assertTest('4.2 "giá vàng hôm nay bao nhiêu" kích hoạt Web Search', shouldTriggerWebSearch('giá vàng hôm nay bao nhiêu') === true);
assertTest('4.3 "https://vnexpress.net/bai-viet" kích hoạt Web Search (URL Reader)', shouldTriggerWebSearch('https://vnexpress.net/bai-viet') === true);
assertTest('4.4 "okk" không kích hoạt Web Search', shouldTriggerWebSearch('okk') === false);
assertTest('4.5 "sybau" không kích hoạt Web Search', shouldTriggerWebSearch('sybau') === false);

console.log('=====================================================');
console.log(`KẾT QUẢ ĐÁNH GIÁ: ${passedTests}/${totalTests} TESTS ĐẠT YÊU CẦU 100%`);
console.log('=====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}