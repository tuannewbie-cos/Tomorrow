// test_hotfix_v4_2_2.js — Verification for Hotfix v4.2.2
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');

console.log('================================================================================');
console.log('🧪 TOMORROW HOTFIX v4.2.2 — VERIFICATION SUITE');
console.log('   Target: macOS Cmd+C/Cmd+V, Titlebar overlap, Bayes Math Parser & Fallback');
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

// Load aiService
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

// Test 1: Check safeParseAIJson implementation exists and is exported
runTest('safeParseAIJson implementation verification', () => {
  assert(typeof aiService.safeParseAIJson === 'function', 'safeParseAIJson must be a function');
});

// Test 2: Evaluate safeParseAIJson with exact Bayes LaTeX payload
runTest('safeParseAIJson handles Bayes formula with raw backslashes without crashing', () => {
  const rawBayesJson = '{"replies": ["Định lý Bayes: $P(A|B) = \\frac{P(B|A) \\cdot P(A)}{P(B)}$"], "session_title": "Giải thích định lý Bayes", "should_update_title": true}';
  const result = aiService.safeParseAIJson(rawBayesJson);
  assert(result, 'Result must exist');
  assert(Array.isArray(result.replies), 'replies must be array');
  assert.strictEqual(result.replies.length, 1, 'Should have 1 reply');
  assert(result.replies[0].includes('Định lý Bayes'), 'Reply must include Bayes theorem');
  assert.strictEqual(result.session_title, 'Giải thích định lý Bayes');
  assert.strictEqual(result.should_update_title, true);
});

// Test 3: safeParseAIJson handles broken JSON or plain text with Bayes formula
runTest('safeParseAIJson recovers from malformed JSON containing Bayes theorem', () => {
  // Raw text without JSON
  const plainText = 'Định lý Bayes cho biết P(A|B) = [P(B|A) * P(A)] / P(B)';
  const plainResult = aiService.safeParseAIJson(plainText);
  assert(plainResult && Array.isArray(plainResult.replies), 'Must handle plain text');
  assert.strictEqual(plainResult.replies[0], plainText);

  // Truncated/corrupted JSON
  const brokenJson = '{"replies": ["Định lý Bayes: P(A|B) = [P(B|A)*P(A)]/P(B)"';
  const brokenResult = aiService.safeParseAIJson(brokenJson);
  assert(brokenResult && Array.isArray(brokenResult.replies), 'Must recover from broken JSON');
  assert(brokenResult.replies[0].includes('Bayes'), 'Must contain Bayes formula');
});

// Test 4: FREE_MODEL_CHAIN configuration contains valid models
runTest('FREE_MODEL_CHAIN includes valid Google Generative Language models', () => {
  const aiServiceSource = fs.readFileSync('services/aiService.ts', 'utf8');
  assert(aiServiceSource.includes("'gemini-2.5-flash'"), 'Must include gemini-2.5-flash');
  assert(aiServiceSource.includes("'gemini-2.0-flash'"), 'Must include gemini-2.0-flash');
  assert(aiServiceSource.includes("'gemini-1.5-flash'"), 'Must include gemini-1.5-flash');
  assert(aiServiceSource.includes("'gemini-3.5-flash-lite'"), 'Must include gemini-3.5-flash-lite');
});

// Test 5: OpenAI streaming disabled & await response.json() used
runTest('OpenAI call disables stream: true and uses response.json()', () => {
  const aiServiceSource = fs.readFileSync('services/aiService.ts', 'utf8');
  assert(!aiServiceSource.includes('stream: true'), 'stream: true must NOT be present in OpenAI payload');
  assert(aiServiceSource.includes('const data: any = await res.json();'), 'Must use await res.json()');
});

// Test 6: SYSTEM_INSTRUCTION includes math/Unicode guidance
runTest('SYSTEM_INSTRUCTION includes Unicode guidance for Bayes & Math', () => {
  const aiServiceSource = fs.readFileSync('services/aiService.ts', 'utf8');
  assert(aiServiceSource.includes('Định lý Bayes'), 'SYSTEM_INSTRUCTION must mention Định lý Bayes');
  assert(aiServiceSource.includes('ký hiệu Unicode'), 'SYSTEM_INSTRUCTION must advise using Unicode math');
});

// Test 7: FloatingInputBar protects Cmd+C / Cmd+V
runTest('FloatingInputBar protects Cmd+C/Cmd+V/Cmd+A from preventDefault', () => {
  const inputBarSource = fs.readFileSync('components/FloatingInputBar.tsx', 'utf8');
  assert(inputBarSource.includes('nativeEvent?.metaKey || nativeEvent?.ctrlKey'), 'Must check metaKey/ctrlKey');
  assert(inputBarSource.includes('BẢO VỆ TUYỆT ĐỐI CHO CMD+C, CMD+V'), 'Comment/logic protecting shortcuts must exist');
});

// Test 8: desktop/TomorrowApp.swift includes Edit Menu (Cut, Copy, Paste, Select All)
runTest('desktop/TomorrowApp.swift implements macOS Edit Menu for WKWebView', () => {
  const swiftSource = fs.readFileSync('desktop/TomorrowApp.swift', 'utf8');
  assert(swiftSource.includes('setupMainMenu()'), 'setupMainMenu must be called');
  assert(swiftSource.includes('#selector(NSText.copy(_:))'), 'Must include Copy selector');
  assert(swiftSource.includes('#selector(NSText.paste(_:))'), 'Must include Paste selector');
  assert(swiftSource.includes('#selector(NSText.cut(_:))'), 'Must include Cut selector');
  assert(swiftSource.includes('#selector(NSText.selectAll(_:))'), 'Must include Select All selector');
  assert(!swiftSource.includes('.fullSizeContentView'), 'Must NOT use .fullSizeContentView to prevent button overlap');
});

// Test 9: Native Mach-O arm64 binary exists in /Applications/Tomorrow.app
runTest('Tomorrow macOS app is a compiled native Mach-O 64-bit arm64 executable', () => {
  const fileOut = execSync('file /Applications/Tomorrow.app/Contents/MacOS/Tomorrow').toString();
  assert(fileOut.includes('Mach-O 64-bit executable arm64'), 'Must be arm64 Mach-O binary');
});

// Test 10: Version synchronized to Online • v4.2.2
runTest('Version is synchronized to Online • v4.2.2 across App.tsx, version.ts, package.json, app.json', () => {
  const appTsx = fs.readFileSync('App.tsx', 'utf8');
  const versionTs = fs.readFileSync('constants/version.ts', 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));

  assert(appTsx.includes('Online • v4.2.2'), 'App.tsx must have Online • v4.2.2');
  assert(versionTs.includes('Online • v4.2.2'), 'version.ts must have Online • v4.2.2');
  assert.strictEqual(pkgJson.version, '4.2.2', 'package.json version must be 4.2.2');
  assert.strictEqual(appJson.expo.version, '4.2.2', 'app.json version must be 4.2.2');
});

console.log('\n================================================================================');
console.log(`📊 FINAL TEST SUMMARY: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('================================================================================\n');
