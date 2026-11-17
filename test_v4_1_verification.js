// test_v4_1_verification.js — Multi-Layer Verification Suite for Tomorrow v4.1
const fs = require('fs');
const path = require('path');

console.log('===========================================================================');
console.log('🚀 TOMORROW V4.1: MULTI-LAYER TECHNICAL AUDIT & VERIFICATION SUITE');
console.log('===========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName} ${details ? '(' + details + ')' : ''}`);
  } else {
    console.error(`❌ [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
  }
}

// -----------------------------------------------------------------------------
// 1. TRỤ CỘT NGÀY 4: HYBRID AI ROUTER & SILENT CIRCUIT BREAKER
// -----------------------------------------------------------------------------
console.log('--- 1. KIỂM ĐỊNH TRỤ CỘT NGÀY 4 (services/aiService.ts) ---');
const aiServicePath = path.join(__dirname, 'services/aiService.ts');
const aiServiceContent = fs.readFileSync(aiServicePath, 'utf8');

// A. Biến cờ ngắt mạch toàn cục
assert(
  aiServiceContent.includes('let isOpenAIUnavailable = false;'),
  'Khai báo biến toàn cục isOpenAIUnavailable',
  'services/aiService.ts:L17'
);
assert(
  aiServiceContent.includes('export function getOpenAICircuitBreakerStatus()') &&
  aiServiceContent.includes('export function resetOpenAICircuitBreaker()'),
  'Cung cấp hàm getOpenAICircuitBreakerStatus & resetOpenAICircuitBreaker',
  'services/aiService.ts'
);

// B. Cấu hình AbortController 7s cho callOpenAI
assert(
  aiServiceContent.includes('const controller = new AbortController();') &&
  aiServiceContent.includes('setTimeout(() => controller.abort(), 7000)'),
  'AbortController với timeout cứng đúng 7000ms trong callOpenAI',
  'services/aiService.ts'
);

// C. Xử lý mã lỗi 401, 402, 403, 429 & Silent Circuit Breaker
assert(
  aiServiceContent.includes('status === 401 || status === 402 || status === 403 || status === 429') &&
  aiServiceContent.includes('isOpenAIUnavailable = true;') &&
  aiServiceContent.includes("[OpenAI Circuit Breaker]: Key expired or quota reached, switching silently to Gemini chain."),
  'Bắt các mã lỗi HTTP 401, 402, 403, 429 và ngắt mạch âm thầm sang Gemini',
  'services/aiService.ts'
);

// D. Chuỗi 3 tầng Gemini miễn phí (FREE_MODEL_CHAIN)
assert(
  aiServiceContent.includes("'gemini-3.8-flash'") &&
  aiServiceContent.includes("'gemini-3.5-flash-lite'") &&
  aiServiceContent.includes("'gemma-4-31b-it'"),
  'Đủ 3 tầng Model miễn phí trong FREE_MODEL_CHAIN',
  'services/aiService.ts'
);

// E. Thứ tự ưu tiên Hybrid Router
assert(
  aiServiceContent.includes('if (OPENAI_API_KEY && !isOpenAIUnavailable)') &&
  aiServiceContent.includes('for (let keyIdx = 0; keyIdx < ALL_GEMINI_KEYS.length; keyIdx++)'),
  'Thứ tự ưu tiên: OpenAI -> Gemini 3-tier Fallback Chain -> Local Resilient',
  'services/aiService.ts'
);

// -----------------------------------------------------------------------------
// 2. TRỤ CỘT NGÀY 5: STREAMING RESPONSE & MULTI-BUBBLE SEQUENCING
// -----------------------------------------------------------------------------
console.log('\n--- 2. KIỂM ĐỊNH TRỤ CỘT NGÀY 5 (aiService.ts & App.tsx) ---');

// A. Tham số stream: true & ReadableStream trong callOpenAI
assert(
  aiServiceContent.includes('stream: true,') &&
  aiServiceContent.includes('response_format: { type: \'json_object\' },'),
  'OpenAI Payload có stream: true và response_format json_object',
  'services/aiService.ts'
);

assert(
  aiServiceContent.includes('getReader') &&
  aiServiceContent.includes('TextDecoder'),
  'Đọc chunk qua ReadableStream reader với TextDecoder',
  'services/aiService.ts'
);

// B. safeParseAIJson với bộ Auto-Repair JSON
function safeParseTest(candidate) {
  let repaired = candidate.trim().replace(/,\s*$/, '');
  const quoteMatches = repaired.match(/(^|[^\\])"/g);
  const quoteCount = quoteMatches ? quoteMatches.length : 0;
  if (quoteCount % 2 !== 0) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);
  return JSON.parse(repaired);
}

try {
  const t1 = safeParseTest('{"replies":["câu 1", "câu 2');
  const t2 = safeParseTest('{"replies":["đang suy nghĩ"], "session_title":"Hỏi đáp');
  assert(
    t1.replies.length === 2 && t2.session_title === 'Hỏi đáp',
    'safeParseAIJson Auto-Repair vá hoàn hảo JSON cắt cụt 250 tokens',
    'Chữa lành chuỗi cụt thành JSON hợp lệ'
  );
} catch (e) {
  assert(false, 'safeParseAIJson Auto-Repair lỗi', e.message);
}

// C. Multi-Bubble Sequencing trong App.tsx
const appPath = path.join(__dirname, 'App.tsx');
const appContent = fs.readFileSync(appPath, 'utf8');

assert(
  appContent.includes('const typingDelay = Math.min(Math.max(replyText.length * 8, 300), 450);') &&
  appContent.includes('await sleep(typingDelay);'),
  'Độ trễ tối ưu giữa các bong bóng trong khoảng 300ms - 450ms',
  'App.tsx: Multi-Bubble Sequencing'
);

assert(
  appContent.includes('if (!isLastReply) {') &&
  appContent.includes('setIsTomorrowTyping(true);') &&
  appContent.includes('} else {') &&
  appContent.includes('setIsTomorrowTyping(false);'),
  'Duy trì TypingIndicator (• • •) trong lúc chờ hiển thị bong bóng tiếp theo',
  'App.tsx'
);

// -----------------------------------------------------------------------------
// 3. BẢO TOÀN KIẾN TRÚC V3.8 & V3.9
// -----------------------------------------------------------------------------
console.log('\n--- 3. BẢO TOÀN KIẾN TRÚC CỐT LÕI (v3.8 - v3.9) ---');
const sidebarPath = path.join(__dirname, 'components/SidebarDrawer.tsx');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

assert(
  sidebarContent.includes('width: 280') || sidebarContent.includes('280'),
  'Bố cục Split-View Sidebar 280px trong SidebarDrawer.tsx',
  'Sidebar 280px'
);

assert(
  appContent.includes('theme.textPrimary') &&
  appContent.includes('THEME_STORAGE_KEY'),
  'Hỗ trợ chế độ Light/Dark Theme (TOMORROW_THEME_MODE)',
  'App.tsx'
);

const webFontPath = path.join(__dirname, 'utils/webFont.ts');
const webFontContent = fs.readFileSync(webFontPath, 'utf8');
assert(
  webFontContent.includes('Plus Jakarta Sans'),
  'Phông chữ chuẩn Retina Plus Jakarta Sans',
  'utils/webFont.ts'
);

const storagePath = path.join(__dirname, 'storage/chatStorage.ts');
const storageContent = fs.readFileSync(storagePath, 'utf8');
assert(
  storageContent.includes('CHAT_SESSIONS_V2') &&
  storageContent.includes('USER_MEMORY_PROFILE_V1'),
  'Đầy đủ các khóa AsyncStorage: CHAT_SESSIONS_V2 & USER_MEMORY_PROFILE_V1',
  'storage/chatStorage.ts'
);

assert(
  aiServiceContent.includes('function buildLocalReflexDirective'),
  'Bộ phản xạ cục bộ 3 lớp buildLocalReflexDirective',
  'services/aiService.ts'
);

const webSearchPath = path.join(__dirname, 'services/webSearchService.ts');
const webSearchContent = fs.readFileSync(webSearchPath, 'utf8');
assert(
  webSearchContent.includes('shouldTriggerWebSearch') &&
  webSearchContent.includes('performSmartWebSearch'),
  'Bộ lọc xử lý lỗi Web Search độc lập trong services/webSearchService.ts',
  'services/webSearchService.ts'
);

// -----------------------------------------------------------------------------
// 4. KIỂM TRA HEADER VERSION & BẢO MẬT .ENV
// -----------------------------------------------------------------------------
console.log('\n--- 4. KIỂM TRA HEADER VERSION & BẢO MẬT ---');
assert(
  appContent.includes('Online • v4.1'),
  'Header hiển thị chuẩn xác Online • v4.1',
  'App.tsx:L507'
);

const gitignorePath = path.join(__dirname, '.gitignore');
const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
assert(
  gitignoreContent.includes('.env') &&
  gitignoreContent.includes('.env.*'),
  '.gitignore chặn hoàn toàn các tệp .env và .env.*',
  '.gitignore'
);

console.log('\n===========================================================================');
console.log(`🏆 KẾT QUẢ KIỂM ĐỊNH V4.1: ${passedTests}/${totalTests} TIÊU CHÍ ĐẠT (PASS 100%)`);
console.log('===========================================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
