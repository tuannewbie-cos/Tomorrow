// test_hotfix_v4_2_3.js — Comprehensive Verification for Hotfix v4.2.3
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

console.log('================================================================================');
console.log('🧪 TOMORROW HOTFIX v4.2.3 — VERIFICATION SUITE');
console.log('   Target: Multi-turn History Normalization, Model Fallback, Code Newline');
console.log('           Preservation, UI Smart Auto-Indentation & Domain Responses');
console.log('================================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] Test ${totalTests}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

function loadTsModule(relativePath, mocks = {}) {
  const fullPath = path.join(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;

  const exports = {};
  const moduleObj = { exports };
  const customRequire = (id) => {
    if (mocks[id]) return mocks[id];
    return {};
  };

  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', js);
  fn(customRequire, moduleObj, exports, path.dirname(fullPath), fullPath);
  return moduleObj.exports;
}

// 1. Load aiService
const aiService = loadTsModule('services/aiService.ts', {
  '../types/chat': {},
  '../types/jarvis': {},
  '../storage/chatStorage': {
    isPlaceholderOrNoiseTitle: () => false,
    getVaultFromProfile: () => ({ favorites: [], workingProjects: [], lifeContext: [] }),
    mergeMemoryNoteIntoVault: (v) => v,
    updateProfileWithVault: (p, v) => ({ ...p, vault: v }),
    DEFAULT_USER_MEMORY_VAULT: { favorites: [], workingProjects: [], lifeContext: [] },
  },
  './webSearchService': {
    performSmartWebSearch: async () => ({ searched: false, query: '', formattedContext: '', sources: [] }),
    shouldTriggerWebSearch: () => false,
  },
});

// 2. Load RichMarkdownView
const richMarkdownView = loadTsModule('components/RichMarkdownView.tsx', {
  react: { useState: () => [false, () => {}], useMemo: (fn) => fn() },
  'react-native': {
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (s) => s },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Platform: { OS: 'web' },
  },
  'expo-clipboard': { setStringAsync: async () => true },
  '../constants/theme': { DARK_THEME: {} },
  'lucide-react-native': { Check: 'Check', Copy: 'Copy', Terminal: 'Terminal' },
});

// Test 1: Version Synchronization across App.tsx, version.ts, package.json, app.json
runTest('Version is synchronized to Online • v4.2.3 across all 4 manifest files', () => {
  const appTsx = fs.readFileSync('App.tsx', 'utf8');
  const versionTs = fs.readFileSync('constants/version.ts', 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));

  assert(appTsx.includes('Online • v4.2.3'), 'App.tsx must display Online • v4.2.3');
  assert(versionTs.includes('Online • v4.2.3'), 'version.ts must have APP_VERSION = Online • v4.2.3');
  assert(versionTs.includes("'4.2.3'"), 'version.ts must have APP_VERSION_NUMBER = 4.2.3');
  assert.strictEqual(pkgJson.version, '4.2.3', 'package.json version must be 4.2.3');
  assert.strictEqual(appJson.expo.version, '4.2.3', 'app.json version must be 4.2.3');
});

// Test 2: FREE_MODEL_CHAIN strictly contains only verified Gemini models
runTest('FREE_MODEL_CHAIN strictly contains only verified Gemini models', () => {
  const expectedChain = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
  ];
  assert.deepStrictEqual(aiService.FREE_MODEL_CHAIN, expectedChain, 'FREE_MODEL_CHAIN must match verified 4 models exactly');

  const source = fs.readFileSync('services/aiService.ts', 'utf8');
  assert(!source.includes("'gemini-3.5-flash-lite'"), 'Must not contain fictitious gemini-3.5-flash-lite');
  assert(!source.includes("'gemini-flash-lite-latest'"), 'Must not contain fictitious gemini-flash-lite-latest');
  assert(!source.includes("'gemma-4-31b-it'"), 'Must not contain fictitious gemma-4-31b-it');
});

// Test 3: isNetworkErrorMessage filters stale network error notice strings
runTest('isNetworkErrorMessage correctly detects network/lag error notice strings', () => {
  const isErr = aiService.isNetworkErrorMessage;
  assert(typeof isErr === 'function', 'isNetworkErrorMessage must be exported function');

  assert.strictEqual(isErr('mạng bên t đang hơi lag chút, m nhắn lại câu vừa rồi giúp t nhé'), true);
  assert.strictEqual(isErr('mạng bên mình đang hơi lag chút, bạn nhắn lại câu vừa rồi giúp mình nhé'), true);
  assert.strictEqual(isErr('Hiện tại mình đang gặp trục trặc kết nối mạng một chút, bạn thử bấm gửi lại câu hỏi giúp mình nhé!'), true);
  assert.strictEqual(isErr('Hiện tại mình đang bị gián đoạn kết nối một chút, bạn nhắn lại câu hỏi sau vài giây nhé!'), true);
  assert.strictEqual(isErr('Mạng chập chờn, bạn kiểm tra kết nối nhé'), true);
  assert.strictEqual(isErr('WATCHDOG_TIMEOUT'), true);

  assert.strictEqual(isErr('Xin chào Tomorrow!'), false);
  assert.strictEqual(isErr('Viết hàm quicksort bằng Python giúp mình'), false);
  assert.strictEqual(isErr(''), false);
});

// Test 4: normalizeChatHistory merges consecutive same roles with \n\n and ensures initial role 'user'
runTest('normalizeChatHistory merges consecutive roles with double newlines and drops leading model', () => {
  const normalize = aiService.normalizeChatHistory;
  assert(typeof normalize === 'function', 'normalizeChatHistory must be exported function');

  // Input with leading model greeting, consecutive user bubbles, and consecutive model bubbles
  const rawHistory = [
    { role: 'model', sender: 'ai', text: 'Chào bạn, mình là Tomorrow!' }, // Leading model -> should be dropped
    { role: 'user', sender: 'user', text: 'Chào Tomorrow' },
    { role: 'user', sender: 'user', text: 'Mình có câu hỏi này' },         // Consecutive user -> should merge with \n\n
    { role: 'model', sender: 'ai', text: 'Nghe đây bạn' },
    { role: 'model', sender: 'ai', text: 'Cứ hỏi thoải mái nhé' },         // Consecutive model -> should merge with \n\n
  ];

  const currentText = 'Giải thích cơ chế quang hợp';
  const normalized = normalize(rawHistory, currentText, undefined, 'gemini');

  // 1. Initial turn MUST be role 'user'
  assert.strictEqual(normalized[0].role, 'user', 'First turn must be role user');
  assert.strictEqual(normalized[0].text, 'Chào Tomorrow\n\nMình có câu hỏi này', 'Consecutive user messages must merge with \\n\\n');

  // 2. Second turn MUST be role 'model'
  assert.strictEqual(normalized[1].role, 'model', 'Second turn must be role model');
  assert.strictEqual(normalized[1].text, 'Nghe đây bạn\n\nCứ hỏi thoải mái nhé', 'Consecutive model messages must merge with \\n\\n');

  // 3. Third turn MUST be current user message
  assert.strictEqual(normalized[2].role, 'user', 'Third turn must be role user');
  assert.strictEqual(normalized[2].text, 'Giải thích cơ chế quang hợp');

  // 4. Strict alternating sequence: user -> model -> user
  assert.strictEqual(normalized.length, 3, 'Must have exactly 3 strictly alternating turns');
});

// Test 5: normalizeChatHistory avoids duplicate trailing user message and filters error notices
runTest('normalizeChatHistory deduplicates trailing user message and strips stale network errors', () => {
  const normalize = aiService.normalizeChatHistory;

  const rawHistory = [
    { role: 'user', sender: 'user', text: 'Hôm nay trời đẹp quá' },
    { role: 'model', sender: 'ai', text: 'mạng bên mình đang hơi lag chút, bạn nhắn lại câu vừa rồi giúp mình nhé' }, // Stale error -> filter out
    { role: 'user', sender: 'user', text: 'Viết code Python quicksort' }, // Already appended userMsg
  ];

  const currentText = 'Viết code Python quicksort';
  const normalized = normalize(rawHistory, currentText, undefined, 'gemini');

  // Stale error filtered out, last duplicate user popped and re-attached cleanly
  assert.strictEqual(normalized.length, 1, 'After filtering error and merging user, length should be 1');
  assert.strictEqual(normalized[0].role, 'user');
  assert.strictEqual(normalized[0].text, 'Hôm nay trời đẹp quá\n\nViết code Python quicksort');
});

// Test 6: Code block newline and indentation preservation in parseAIResponseJson
runTest('Code block newlines and indentation are preserved intact through parseAIResponseJson', () => {
  const samplePython = '```python\ndef quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[0]\n    return quicksort([x for x in arr[1:] if x < pivot]) + [pivot] + quicksort([x for x in arr[1:] if x >= pivot])\n```';
  const rawAIResponse = JSON.stringify({
    conversation_state: 'expert_jarvis',
    replies: [
      'Đây là thuật toán quicksort bằng Python:',
      samplePython,
    ],
    session_title: 'Thuật toán Quicksort Python',
    should_update_title: true,
  });

  const parsed = aiService.parseAIResponseJson(rawAIResponse, 'viết quicksort python', []);
  assert(parsed, 'Parsed response must exist');
  assert.strictEqual(parsed.replies.length, 2);

  const codeReply = parsed.replies[1];
  assert(codeReply.includes('\n    if len(arr) <= 1:'), 'Must preserve \\n and 4 spaces indentation');
  assert(codeReply.includes('\n        return arr'), 'Must preserve \\n and 8 spaces indentation');
  assert(codeReply.includes('\n    pivot = arr[0]'), 'Must preserve \\n and 4 spaces indentation');
  assert(!codeReply.includes('def quicksort(arr): if len(arr)'), 'Must NOT collapse code into single line');
});

// Test 7: cleanReplyPreservingCode isolates code blocks and only condenses horizontal whitespace
runTest('cleanReplyPreservingCode leaves code blocks 100% untouched while cleaning conversational text', () => {
  const clean = aiService.cleanReplyPreservingCode;
  assert(typeof clean === 'function', 'cleanReplyPreservingCode must be exported function');

  const input = 'Chào   bạn,  đây là    code:\n```python\ndef test():\n    # bro comment\n    return "bro"\n```\nĐoạn văn   sau code.';
  const output = clean(input, (t) => t.replace(/\bbro\b/gi, ''));

  // Conversational text had 3+ spaces collapsed to 1
  assert(output.includes('Chào bạn, đây là code:'), 'Horizontal spaces outside code collapsed');
  assert(output.includes('Đoạn văn sau code.'), 'Horizontal spaces after code collapsed');

  // Inside code block: # bro comment and return "bro" and 4-space indentation are 100% untouched!
  assert(output.includes('    # bro comment\n'), 'Comment inside code block preserved');
  assert(output.includes('    return "bro"\n'), 'String literal and 4-space indentation inside code preserved');
  assert(output.includes('\ndef test():\n'), 'Newlines preserved');
});

// Test 8: formatCodeForDisplay auto-formats condensed single-line Python (>55 chars) with 4 spaces
runTest('formatCodeForDisplay reformats condensed Python (>55 chars) into multi-line with 4 spaces', () => {
  const format = richMarkdownView.formatCodeForDisplay;
  assert(typeof format === 'function', 'formatCodeForDisplay must be exported function');

  const condensedPython = 'def quicksort(arr): if len(arr) <= 1: return arr; pivot = arr[0]; return quicksort([x for x in arr[1:] if x < pivot]) + [pivot] + quicksort([x for x in arr[1:] if x >= pivot])';
  const formatted = format(condensedPython, 'python');

  const lines = formatted.split('\n');
  assert(lines.length >= 4, `Must format into at least 4 lines, got ${lines.length}`);
  assert(formatted.includes('def quicksort(arr):'), 'Must have def header');
  assert(formatted.includes('    if len(arr) <= 1:'), 'Must have 4-space indented if statement');
  assert(formatted.includes('        return arr'), 'Must have 8-space indented return arr');
  assert(formatted.includes('    pivot = arr[0]'), 'Must have 4-space indented pivot');
});

// Test 9: formatCodeForDisplay auto-formats condensed single-line TypeScript/JavaScript (>55 chars) with 2 spaces
runTest('formatCodeForDisplay reformats condensed TypeScript (>55 chars) into multi-line with 2 spaces', () => {
  const format = richMarkdownView.formatCodeForDisplay;

  const condensedTS = 'function quicksort<T>(arr: T[]): T[] { if (arr.length <= 1) return arr; const pivot = arr[0]; return [...quicksort(arr.slice(1).filter(x => x <= pivot)), pivot, ...quicksort(arr.slice(1).filter(x => x > pivot))]; }';
  const formatted = format(condensedTS, 'typescript');

  const lines = formatted.split('\n');
  assert(lines.length >= 4, `Must format into at least 4 lines, got ${lines.length}`);
  assert(formatted.includes('function quicksort<T>(arr: T[]): T[] {'), 'Must have opening brace line');
  assert(formatted.includes('  if (arr.length <= 1) return arr;'), 'Must have 2-space indented if statement');
  assert(formatted.includes('  const pivot = arr[0];'), 'Must have 2-space indented const statement');
  assert(formatted.endsWith('}'), 'Must close with brace');
});

// Test 10: formatCodeForDisplay shields string literals and restores escaped newlines/tabs
runTest('formatCodeForDisplay shields strings and unescapes literal \\n and \\t', () => {
  const format = richMarkdownView.formatCodeForDisplay;

  const codeWithEscapes = 'def log_msg():\\n\\tmsg = "Hello; world: test"\\n\\tprint(msg)';
  const formatted = format(codeWithEscapes, 'python');

  assert(formatted.includes('\n'), 'Must restore literal \\n to real newlines');
  assert(formatted.includes('    msg = "Hello; world: test"'), 'Must restore \\t to 4 spaces and shield string');
  assert(formatted.includes('    print(msg)'), 'Must preserve print statement');
});

// Test 11: parseMarkdownBlocks integrates formatCodeForDisplay and updates lineCount
runTest('parseMarkdownBlocks parses both single-line and multi-line code blocks and updates lineCount', () => {
  const parse = richMarkdownView.parseMarkdownBlocks;

  const markdown = '```python def quicksort(arr): if len(arr) <= 1: return arr; pivot = arr[0]; return quicksort([x for x in arr[1:] if x < pivot]) + [pivot] + quicksort([x for x in arr[1:] if x >= pivot])```';
  const blocks = parse(markdown);

  assert.strictEqual(blocks.length, 1);
  const block = blocks[0];
  assert.strictEqual(block.type, 'code');
  assert.strictEqual(block.language, 'PYTHON');
  assert(block.lineCount >= 4, `lineCount must reflect formatted lines >= 4, got ${block.lineCount}`);
  assert(block.code.includes('    if len(arr) <= 1:'), 'Code block content must be auto-formatted');
});

// Test 12: Domain Scenario 1 — Natural Science (Photosynthesis & Chemistry Equation)
runTest('Natural Science: Chemical equation and multi-turn biology history parse cleanly', () => {
  const biologyRaw = JSON.stringify({
    conversation_state: 'expert_jarvis',
    replies: [
      'Cơ chế quang hợp ở thực vật diễn ra qua 2 pha: pha sáng và pha tối (chu trình Calvin).',
      'Phương trình hóa học tổng quát của quang hợp:\n6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂',
      'Pha sáng tạo ra ATP và NADPH cung cấp năng lượng để khử CO₂ thành glucose ở pha tối.',
    ],
    session_title: 'Cơ chế quang hợp ở thực vật',
    should_update_title: true,
  });

  const parsed = aiService.parseAIResponseJson(biologyRaw, 'giải thích quang hợp', []);
  assert(parsed && parsed.replies.length === 3);
  assert(parsed.replies[1].includes('6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂'), 'Chemical equation must be intact');
});

// Test 13: Domain Scenario 2 — Programming (Generic Quicksort in TS & Python)
runTest('Programming: Quicksort generic in TypeScript and Python retains clean multi-line layout', () => {
  const tsRaw = JSON.stringify({
    conversation_state: 'expert_jarvis',
    replies: [
      'Dưới đây là hàm quicksort generic bằng TypeScript:',
      '```typescript\nfunction quicksort<T>(arr: T[], compare: (a: T, b: T) => number): T[] {\n  if (arr.length <= 1) return arr;\n  const pivot = arr[0];\n  const left = arr.slice(1).filter((x) => compare(x, pivot) < 0);\n  const right = arr.slice(1).filter((x) => compare(x, pivot) >= 0);\n  return [...quicksort(left, compare), pivot, ...quicksort(right, compare)];\n}\n```',
    ],
    session_title: 'Generic Quicksort TypeScript',
    should_update_title: true,
  });

  const parsed = aiService.parseAIResponseJson(tsRaw, 'quicksort generic typescript', []);
  assert(parsed && parsed.replies.length === 2);
  const code = parsed.replies[1];
  assert(code.includes('\n  if (arr.length <= 1) return arr;\n'), '2-space indentation preserved');
  assert(code.includes('\n  const pivot = arr[0];\n'), 'Pivot assignment preserved');
});

// Test 14: Domain Scenario 3 — Physics (Newton Gravitation & Unicode Math)
runTest('Physics: Newton Gravitation formula parses cleanly with Unicode math', () => {
  const physicsRaw = JSON.stringify({
    conversation_state: 'expert_jarvis',
    replies: [
      'Định luật vạn vật hấp dẫn của Newton phát biểu rằng mọi hạt trong vũ trụ đều hút mọi hạt khác bằng một lực tỉ lệ thuận với tích khối lượng của chúng và tỉ lệ nghịch với bình phương khoảng cách giữa tâm của chúng.',
      'Công thức tính độ lớn lực hấp dẫn:\nF = G · (m₁ · m₂ / r²)\nTrong đó:\n- G ≈ 6.674 × 10⁻¹¹ N·m²/kg² là hằng số hấp dẫn\n- m₁, m₂ là khối lượng hai vật (kg)\n- r là khoảng cách giữa hai tâm khối lượng (m)',
    ],
    session_title: 'Định luật vạn vật hấp dẫn Newton',
    should_update_title: true,
  });

  const parsed = aiService.parseAIResponseJson(physicsRaw, 'định luật vạn vật hấp dẫn newton', []);
  assert(parsed && parsed.replies.length === 2);
  assert(parsed.replies[1].includes('F = G · (m₁ · m₂ / r²)'), 'Formula must be intact');
  assert(parsed.replies[1].includes('6.674 × 10⁻¹¹ N·m²/kg²'), 'Units and superscripts preserved');
});

// Test 15: Domain Scenario 4 — Chemistry (Redox Reaction Balancing & Follow-Up Turns)
runTest('Chemistry: Redox balancing Fe + HNO3 and follow-up multi-turn history', () => {
  const chemistryRaw = JSON.stringify({
    conversation_state: 'expert_jarvis',
    replies: [
      'Phương trình oxi hóa - khử đã cân bằng bằng phương pháp thăng bằng electron:',
      'Fe + 4HNO₃ (loãng) → Fe(NO₃)₃ + NO↑ + 2H₂O',
      'Quá trình oxi hóa: Fe⁰ → Fe⁺³ + 3e (nhân 1)\nQuá trình khử: N⁺⁵ + 3e → N⁺² (NO) (nhân 1)',
    ],
    session_title: 'Cân bằng phản ứng oxi hóa khử Fe + HNO3',
    should_update_title: true,
  });

  const parsed = aiService.parseAIResponseJson(chemistryRaw, 'cân bằng Fe + HNO3 loãng', []);
  assert(parsed && parsed.replies.length === 3);
  assert(parsed.replies[1].includes('Fe + 4HNO₃ (loãng) → Fe(NO₃)₃ + NO↑ + 2H₂O'), 'Balanced equation preserved');

  // Verify multi-turn normalization with follow-up turn
  const history = [
    { role: 'user', sender: 'user', text: 'Cân bằng Fe + HNO3 loãng' },
    { role: 'model', sender: 'ai', text: parsed.replies[1] },
  ];
  const followUpText = 'Nếu dùng HNO3 đặc nóng thì sinh ra khí gì?';
  const normalized = aiService.normalizeChatHistory(history, followUpText, undefined, 'gemini');

  assert.strictEqual(normalized.length, 3);
  assert.strictEqual(normalized[0].role, 'user');
  assert.strictEqual(normalized[1].role, 'model');
  assert.strictEqual(normalized[2].role, 'user');
  assert.strictEqual(normalized[2].text, followUpText);
});

// Test 16: ChatBubble re-exports formatCodeForDisplay
runTest('components/ChatBubble re-exports formatCodeForDisplay', () => {
  const chatBubbleSource = fs.readFileSync('components/ChatBubble.tsx', 'utf8');
  assert(chatBubbleSource.includes('formatCodeForDisplay'), 'ChatBubble must import/export formatCodeForDisplay');
  assert(chatBubbleSource.includes('export { formatCodeForDisplay }'), 'ChatBubble must re-export formatCodeForDisplay');
});

console.log('\n================================================================================');
console.log(`📊 FINAL TEST SUMMARY: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('================================================================================\n');
