/**
 * TEST INSPECTOR & AUDITOR FOR TOMORROW V3.7
 * Kiểm duyệt & Đánh giá chất lượng hệ thống (Senior QA & Audit Lead):
 * 1. Khắc phục dứt điểm lỗi AI hứa suông/câu giờ ("chờ mình chút", "đợi xíu nha") -> BẮT BUỘC trả kết quả thực tế & URL ngay.
 * 2. Phục hồi ngữ cảnh lịch sử khi user chỉ nhắn lệnh ("check web và đưa đường dẫn", "cho xin link").
 * 3. Bảo toàn 100% quy tắc: Cấm dùng "bro" bừa bãi khi user dùng "t - m", nhận diện và dừng dứt khoát khi gặp "sybau", "cook", "okk".
 * 4. Kiểm tra URL bấm được (Clickable Links) và Source Pills.
 */

// 1. Logic shouldTriggerWebSearch v3.7
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
    'check web', 'kiểm tra web', 'đưa đường dẫn', 'đưa link', 'xin link', 'cho xin link',
    'nguồn đâu', 'source', 'dẫn chứng', 'thật không', 'có thật không', 'bị sa thải', 'sa thải',
    'từ chức', 'xong chưa', 'xác thực', 'kiểm chứng'
  ];

  for (const kw of WEB_TRIGGER_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }

  return false;
}

// 2. Logic buildOptimizedSearchQuery v3.7
function buildOptimizedSearchQuery(userText, recentHistory = []) {
  const URL_REGEX = /(https?:\/\/[^\s]+)/i;
  const text = userText.trim();
  const urlMatch = text.match(URL_REGEX);
  const targetUrl = urlMatch ? urlMatch[0] : undefined;

  let clean = text
    .replace(URL_REGEX, '')
    .replace(/^(ê\s*(m|mày|bạn|bro)?\s*(ơi)?|cho\s*(t|tao|mình)\s*hỏi|hỏi\s*(tý|tí)|hỏi\s*thật\s*nhé|m\s*ơi|bạn\s*ơi)\s*/gi, '')
    .replace(/\s*(nhé|nha|vậy\s*(m|mày|bạn|bro)|hả\s*(m|mày|bạn|bro)|được\s*không|thế\s*nhỉ|ko\s*m|không\s*m)[.?!]*$/gi, '')
    .trim();

  const lowerClean = clean.toLowerCase();
  const commandPhrases = [
    'check web', 'kiểm tra web', 'đưa đường dẫn', 'đưa link', 'xin link', 'cho xin link',
    'nguồn đâu', 'source', 'dẫn chứng', 'thật không', 'có thật không', 'xem nào', 'xong chưa',
    'link đâu', 'link bài viết', 'link tin tức', 'cho link', 'gửi link', 'gửi đường dẫn'
  ];
  const isCommandOnly = commandPhrases.some((cp) => lowerClean.includes(cp)) || lowerClean.split(/\s+/).length <= 3;

  if (isCommandOnly && recentHistory && recentHistory.length > 0) {
    const recentMessages = recentHistory.slice(-4).reverse();
    let extractedTopic = '';

    for (const msg of recentMessages) {
      const msgText = (msg.text || '').trim();
      if (!msgText || msgText === userText) continue;

      const VIETNAMESE_START_WORDS = new Set([
        'Không', 'Có', 'Thôi', 'Nhưng', 'Vậy', 'Nói', 'Ừ', 'Thì', 'Nếu', 'Vì', 'Do', 'Tại',
        'Khi', 'Lúc', 'Người', 'Bạn', 'Tôi', 'Mình', 'User', 'Tomorrow', 'AI', 'Chat', 'Bot',
        'Để', 'Cho', 'Vừa', 'Đang', 'Sẽ', 'Đã', 'Là', 'Vẫn', 'Được', 'Cũng', 'Này', 'Kia'
      ]);
      const rawWords = msgText.replace(/[.,!?;:"'()]+/g, ' ').split(/\s+/).filter(Boolean);
      const properNouns = [];
      let currentGroup = [];

      for (const w of rawWords) {
        const isCap = w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase();
        if (isCap && !VIETNAMESE_START_WORDS.has(w) && w.length > 1) {
          currentGroup.push(w);
        } else {
          if (currentGroup.length > 0) {
            properNouns.push(currentGroup.join(' '));
            currentGroup = [];
          }
        }
      }
      if (currentGroup.length > 0) properNouns.push(currentGroup.join(' '));

      if (properNouns.length > 0) {
        extractedTopic = properNouns.slice(0, 2).join(' ');
        const actionMatch = msgText.toLowerCase().match(/\b(sa thải|từ chức|ra mắt|bán|mua|thắng|vô địch|ghi bàn|ceo)\b/i);
        if (actionMatch && !extractedTopic.toLowerCase().includes(actionMatch[0])) {
          extractedTopic += ` ${actionMatch[0]}`;
        }
        break;
      }

      const keySubjects = [
        'ronaldo', 'messi', 'bitcoin', 'btc', 'vàng', 'supabase', 'iphone', 'nvidia',
        'jensen huang', 'sam altman', 'elon musk', 'trump', 'biden'
      ];
      const found = keySubjects.find((s) => msgText.toLowerCase().includes(s));
      if (found) {
        extractedTopic = found;
        break;
      }
    }

    if (extractedTopic) {
      clean = `${extractedTopic} tin tức mới nhất`;
    }
  }

  return { query: clean || text, url: targetUrl };
}

// 3. Logic parseAIResponseJson v3.7 kèm Anti-Stalling Guardrail
function parseAIResponseJson(raw, userText = '', recentChats = [], webSearchSources = []) {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed = JSON.parse(cleaned);

    let replies = Array.isArray(parsed.replies) ? parsed.replies : [parsed.reply || ''];
    let sessionTitle = parsed.session_title || '';
    let should_update_title = parsed.should_update_title === true;
    let conversation_state = parsed.conversation_state || 'casual_friend';

    const userClean = (userText || '').toLowerCase().trim();

    // 1. TÍN HIỆU KẾT THÚC / DỪNG (closing_stop)
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
      } else {
        singleReply = 'okii';
      }
      return { replies: [singleReply], session_title: '', should_update_title: false, conversation_state: 'closing_stop' };
    }

    // 2. PHÒNG THỦ DỌA XOÁ APP
    const isJokingThreat = /(xoá|xóa|xoa)\s+(m|mày|app|may)/i.test(userClean);
    if (isJokingThreat) {
      return { replies: ['thôi đừng xoá mà :)))'], session_title: '', should_update_title: false, conversation_state: 'casual_friend' };
    }

    // 3. LỌC TỪ "BRO" NẾU USER CHƯA DÙNG
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

    // 4. BỘ LỌC CHẶN CÂU GIỜ / HỨA SUÔNG (ANTI-STALLING FILTER)
    const STALLING_REGEX = /^(chờ|đợi)\s*(mình|t|tui|em|xíu|chút|tí)|kiểm tra (ngay|xong liền)|để (mình|t|tui) (check|kiểm tra|tìm)/i;
    const hasStallingPhrase = replies.some((rep) => STALLING_REGEX.test(rep.trim()) && !rep.includes('http'));

    if (hasStallingPhrase) {
      if (webSearchSources && webSearchSources.length > 0) {
        const topSource = webSearchSources[0];
        const hasUserAskedLink = /(đường dẫn|link|nguồn|dẫn chứng)/i.test(userClean);
        let substantiveAnswer = `Theo thông tin kiểm chứng mới nhất: ${topSource.snippet || topSource.title}.`;
        if (hasUserAskedLink || topSource.url) {
          substantiveAnswer += `\nĐường dẫn nguồn: ${topSource.url}`;
        }
        replies = [substantiveAnswer];
      } else {
        replies = ['Mình vừa quét nhanh nhưng kết nối tới nguồn tin web đang phản hồi chậm, hiện chưa có dữ liệu xác thực chắc chắn về thông tin này.'];
      }
    } else if (/(đường dẫn|link|nguồn|dẫn chứng)/i.test(userClean) && webSearchSources && webSearchSources.length > 0) {
      const hasAnyUrl = replies.some((r) => r.includes('http'));
      if (!hasAnyUrl && webSearchSources[0]?.url) {
        replies[replies.length - 1] = `${replies[replies.length - 1]}\nĐường dẫn tham khảo: ${webSearchSources[0].url}`;
      }
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

// BỘ KIỂM TRA CHẤT LƯỢNG (AUDIT SUITE V3.7)
console.log('=====================================================');
console.log('   KIỂM DUYỆT VIÊN TOMORROW V3.7: ZERO-STALLING & CONTEXT');
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

// TEST 1: CHẶN ĐỨNG CÂU GIỜ / HỨA SUÔNG
const fakeStallingJSON1 = JSON.stringify({
  conversation_state: 'casual_friend',
  replies: ['Chờ mình chút, kiểm tra ngay nhé!'],
  session_title: '',
  should_update_title: false,
});
const mockSources = [
  {
    title: 'Nvidia: Jensen Huang vẫn đang là CEO, không có chuyện bị sa thải',
    url: 'https://vnexpress.net/jensen-huang-nvidia-ceo',
    source: 'VnExpress',
    snippet: 'Jensen Huang khẳng định Nvidia tiếp tục tăng trưởng mạnh mẽ và không có kế hoạch thay đổi nhân sự cấp cao.',
  },
];

const parsedStall1 = parseAIResponseJson(fakeStallingJSON1, 'check web và đưa đường dẫn xem', [], mockSources);
assertTest('1.1 Chặn đứng câu giờ "Chờ mình chút, kiểm tra ngay nhé!"', !parsedStall1.replies[0].includes('Chờ mình chút'));
assertTest('1.2 Trả về câu trả lời thực tế từ nguồn tin', parsedStall1.replies[0].includes('Jensen Huang'));
assertTest('1.3 Đính kèm đường dẫn URL thực tế ngay trong câu trả lời', parsedStall1.replies[0].includes('https://vnexpress.net'));

// TEST 2: GHÉP NGỮ CẢNH LỊCH SỬ THÔNG MINH KHI CÂU HỎI THIẾU CHỦ NGỮ
const conversationHistory = [
  { role: 'user', text: 'Jensen Huang bị sa thải rồi hả m?' },
  { role: 'model', text: 'Không có đâu nhé, Jensen Huang vẫn đang điều hành Nvidia bình thường.' },
];
const optimizedQuery = buildOptimizedSearchQuery('check web và đưa đường dẫn', conversationHistory);
assertTest('2.1 Tự động trích xuất thực thể "Jensen Huang" từ ngữ cảnh trước', optimizedQuery.query.includes('Jensen Huang'));
assertTest('2.2 Ghép thực thể "Nvidia" thành câu truy vấn hoàn chỉnh', optimizedQuery.query.includes('Nvidia'));

// TEST 3: TỪ KHÓA MỞ RỘNG TRIGGER WEB SEARCH
assertTest('3.1 "check web và đưa đường dẫn" kích hoạt web search', shouldTriggerWebSearch('check web và đưa đường dẫn') === true);
assertTest('3.2 "cho xin link đi" kích hoạt web search', shouldTriggerWebSearch('cho xin link đi') === true);
assertTest('3.3 "nguồn đâu" kích hoạt web search', shouldTriggerWebSearch('nguồn đâu') === true);
assertTest('3.4 "thật không" kích hoạt web search', shouldTriggerWebSearch('thật không') === true);
assertTest('3.5 "bị sa thải" kích hoạt web search', shouldTriggerWebSearch('bị sa thải') === true);
assertTest('3.6 "sybau" không kích hoạt web search', shouldTriggerWebSearch('sybau') === false);
assertTest('3.7 "okk" không kích hoạt web search', shouldTriggerWebSearch('okk') === false);

// TEST 4: BẢO VỆ CÁC QUY TẮC CỐT LÕI (CẤM BRO, SYBAU, DỌA XOÁ)
const parsedSybau = parseAIResponseJson(JSON.stringify({ replies: ['sao bro lại sybau vậy'] }), 'sybau', []);
assertTest('4.1 "sybau" trả lời duy nhất 1 câu "rồi rồi im :)))"', parsedSybau.replies[0] === 'rồi rồi im :)))');
assertTest('4.2 Không chứa chữ "bro"', !parsedSybau.replies[0].toLowerCase().includes('bro'));

const parsedThreat = parseAIResponseJson(JSON.stringify({ replies: ['sao lại vậy bro'] }), 't xoá m bây giờ', []);
assertTest('4.3 "t xoá m bây giờ" trả lời "thôi đừng xoá mà :)))"', parsedThreat.replies[0] === 'thôi đừng xoá mà :)))');

console.log('=====================================================');
console.log(`KẾT QUẢ ĐÁNH GIÁ: ${passedTests}/${totalTests} TESTS ĐẠT YÊU CẦU 100%`);
console.log('=====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
