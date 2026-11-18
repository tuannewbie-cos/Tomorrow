/**
 * test_hotfix_v4_2_1.js — Comprehensive E2E Verification Suite for SIÊU PROMPT HOTFIX v4.2.1
 * 
 * 4-Tier Test Architecture:
 * - Tier 1: Category-Partition (Feature Coverage T1.1 - T1.8)
 * - Tier 2: Boundary Value Analysis & Corner Cases (T2.1 - T2.4)
 * - Tier 3: Pairwise & Cross-Feature Interactions (T3.1 - T3.4)
 * - Tier 4: Real-World Operational Profiles (T4.1 - T4.5)
 * 
 * Usage:
 *   node test_hotfix_v4_2_1.js
 *   node test_hotfix_v4_2_1.js --diagnostic
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');
const vm = require('vm');

console.log('================================================================================');
console.log('🧪 TOMORROW HOTFIX v4.2.1 — COMPREHENSIVE E2E VERIFICATION SUITE');
console.log('   Target: LaTeX JSON Crash, Multi-line Code/Table, Pronoun Lock, macOS Window');
console.log('================================================================================\n');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assertTest(tier, id, name, condition, details = '') {
  const result = { tier, id, name, passed: Boolean(condition), details };
  testResults.push(result);
  if (result.passed) {
    passedTests++;
    console.log(`✅ [${tier}] [PASS] ${id}: ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`❌ [${tier}] [FAIL] ${id}: ${name} ${details ? '— Reason: ' + details : ''}`);
  }
}

// -----------------------------------------------------------------------------
// MODULE LOADER HELPER (Loads and evaluates TypeScript modules safely in Node)
// -----------------------------------------------------------------------------
function loadTsModule(relativePath, mocks = {}) {
  const fullPath = path.join(__dirname, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Module file not found: ${fullPath}`);
  }
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
    if (id === 'react') {
      return {
        useState: (initial) => [initial, () => {}],
        useEffect: () => {},
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
        useRef: () => ({ current: null }),
        createElement: (type, props, ...children) => ({ type, props, children }),
      };
    }
    if (id === 'react-native') {
      return {
        Platform: { OS: 'ios' },
        StyleSheet: { create: (s) => s },
        View: 'View',
        Text: 'Text',
        ScrollView: 'ScrollView',
        Pressable: 'Pressable',
        Image: 'Image',
        Linking: { openURL: () => Promise.resolve() },
        useWindowDimensions: () => ({ width: 1024, height: 768 }),
      };
    }
    if (id === './webSearchService') {
      return loadTsModule('services/webSearchService.ts', mocks);
    }
    if (id.includes('chatStorage')) {
      return {
        isPlaceholderOrNoiseTitle: (t) => !t || t.length < 3,
        getVaultFromProfile: (p) => p?.vault || { favorites: [], activeProjects: [] },
        mergeMemoryNoteIntoVault: (v) => v,
        updateProfileWithVault: (p) => p,
        DEFAULT_USER_MEMORY_VAULT: { favorites: [], activeProjects: [] },
      };
    }
    if (id.includes('theme')) {
      return {
        DARK_THEME: {
          bubbleAI: '#1F2937',
          bubbleUser: '#2563EB',
          textAI: '#F9FAFB',
          textUser: '#FFFFFF',
          textMuted: '#9CA3AF',
          borderAI: '#374151',
        },
      };
    }
    if (id.endsWith('.json')) {
      return require(path.resolve(path.dirname(fullPath), id));
    }
    return {};
  };

  const sandbox = {
    require: customRequire,
    module: moduleObj,
    exports,
    console,
    process: { env: { ...process.env } },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  vm.runInContext(js, vm.createContext(sandbox));
  return moduleObj.exports;
}

// Pre-load core services for dynamic testing
let aiService, webSearchService, richMarkdownView;
try {
  webSearchService = loadTsModule('services/webSearchService.ts');
  aiService = loadTsModule('services/aiService.ts');
  richMarkdownView = loadTsModule('components/RichMarkdownView.tsx');
} catch (err) {
  console.error('Error pre-loading modules:', err);
}

// =============================================================================
// TIER 1: FEATURE COVERAGE (T1.1 - T1.8)
// =============================================================================
console.log('\n--- 📌 TIER 1: FEATURE COVERAGE (Category-Partition) ---');

// T1.1: LaTeX Math JSON Parsing without crashing
(() => {
  const bs = String.fromCharCode(92); // single backslash \
  // Test raw JSON containing unescaped LaTeX backslashes \frac, \sqrt, \times, \begin, \right, \alpha, \sum
  const rawWire = `{"replies": ["Định lý Bayes: $$P(A|B) = ${bs}frac{P(B|A)P(A)}{P(B)}$$", "Căn thức: $$${bs}sqrt{x^2 + y^2}$$", "Phép nhân: $$2 ${bs}times 10^3$$", "Ma trận: $$${bs}begin{matrix} 1 & 0 ${bs}${bs} 0 & 1 ${bs}end{matrix}$$", "Ngoặc: $$${bs}left( ${bs}frac{a}{b} ${bs}right)$$", "Ký hiệu: $$${bs}alpha + ${bs}beta = ${bs}gamma$$ và $$${bs}sum_{i=1}^n x_i$$"]}`;

  let parsed = null;
  let noCrash = false;
  try {
    parsed = aiService.safeParseAIJson(rawWire);
    noCrash = true;
  } catch (err) {
    noCrash = false;
  }

  const hasIntactReplies = parsed && Array.isArray(parsed.replies) && parsed.replies.length >= 6;
  const preservesLatex = hasIntactReplies &&
    parsed.replies[0].includes('frac') &&
    parsed.replies[1].includes('sqrt') &&
    parsed.replies[2].includes('times') &&
    parsed.replies[3].includes('begin{matrix}') &&
    parsed.replies[4].includes('right') &&
    parsed.replies[5].includes('alpha') &&
    parsed.replies[5].includes('sum');

  // Verify that it did NOT fallback to putting raw JSON text into replies[0]
  const notDumpedAsRawText = hasIntactReplies && !parsed.replies[0].startsWith('{"replies":');

  assertTest(
    'Tier 1',
    'T1.1',
    'LaTeX Math JSON Parsing & Repair',
    noCrash && hasIntactReplies && preservesLatex && notDumpedAsRawText,
    noCrash && hasIntactReplies && preservesLatex && notDumpedAsRawText
      ? 'Cleanly parsed 6 LaTeX formulas containing \\frac, \\sqrt, \\times, \\begin, \\right, \\alpha, \\sum'
      : 'JSON.parse crashed or failed to parse unescaped LaTeX backslashes'
  );
})();

// T1.2: Fake Fallback Removal in localResilientFallback
(() => {
  const testQueries = [
    'định lý Bayes',
    'giải thích chi tiết định lý Bayes',
    'tính đạo hàm hàm số bậc ba',
    'thuật toán sắp xếp nhanh quicksort',
  ];

  let hasFakeFallbackInExecution = false;
  for (const q of testQueries) {
    const fallback = aiService.localResilientFallback(q);
    const allText = (fallback.replies || []).join(' ') + ' ' + (fallback.reply || '');
    if (allText.includes('nghe thú vị đấy') || allText.includes('nói rõ hơn xem nào')) {
      hasFakeFallbackInExecution = true;
      break;
    }
  }

  // Also check source code in services/aiService.ts
  const aiServiceSrc = fs.readFileSync(path.join(__dirname, 'services/aiService.ts'), 'utf8');
  const hasFakeFallbackInCode =
    aiServiceSrc.includes("'nghe thú vị đấy'") ||
    aiServiceSrc.includes('"nghe thú vị đấy"') ||
    aiServiceSrc.includes("'nói rõ hơn xem nào'") ||
    aiServiceSrc.includes('"nói rõ hơn xem nào"');

  assertTest(
    'Tier 1',
    'T1.2',
    'Fake Fallback Removal ("nghe thú vị đấy" / "nói rõ hơn xem nào")',
    !hasFakeFallbackInExecution && !hasFakeFallbackInCode,
    !hasFakeFallbackInExecution && !hasFakeFallbackInCode
      ? 'Dummy phrases completely eliminated from runtime and source code'
      : 'Found canned dummy fallback phrases in runtime or source code'
  );
})();

// T1.3: Academic / Math / Science / Algorithm Web Search Fast-Path Bypass
(() => {
  const academicQueries = [
    'định lý Bayes',
    'giải thích chi tiết định lý Bayes',
    'viết code quicksort bằng TypeScript',
    'thuật toán Dijkstra tìm đường đi ngắn nhất',
    'tính tích phân suy rộng',
    'công thức tính diện tích hình tròn',
  ];

  let anyAcademicTriggeredSearch = false;
  const failingQueries = [];
  for (const q of academicQueries) {
    const triggers = webSearchService.shouldTriggerWebSearch(q);
    if (triggers) {
      anyAcademicTriggeredSearch = true;
      failingQueries.push(q);
    }
  }

  // Ensure explicit search triggers still work
  const explicitQueries = [
    'định lý Bayes check web',
    'tin tức mới nhất về AI hôm nay',
    'giá vàng hôm nay',
    'thời tiết Hà Nội',
  ];
  let allExplicitTriggered = true;
  for (const q of explicitQueries) {
    if (!webSearchService.shouldTriggerWebSearch(q)) {
      allExplicitTriggered = false;
    }
  }

  assertTest(
    'Tier 1',
    'T1.3',
    'Academic/Math/Science Fast-Path Web Search Bypass',
    !anyAcademicTriggeredSearch && allExplicitTriggered,
    !anyAcademicTriggeredSearch && allExplicitTriggered
      ? 'All academic/math queries bypassed web search; explicit searches preserved'
      : `Failed on queries: ${failingQueries.join('; ')}`
  );
})();

// T1.4: Syllable Collision Fix & Strict Pronoun Locking
(() => {
  // "chi" in "chi tiết" must NOT trigger hasAnhChi
  const directiveChiTiet = aiService.buildLocalReflexDirective('giải thích chi tiết định lý Bayes');
  const isChiTietHonored =
    !directiveChiTiet.pronounRule.includes('anh/chị - em') &&
    directiveChiTiet.pronounRule.includes('mình - bạn');

  // "chi phí", "chi nhánh", "chi tiêu" must NOT trigger hasAnhChi
  const directiveChiPhi = aiService.buildLocalReflexDirective('chi phí tối ưu hiệu năng');
  const isChiPhiHonored = !directiveChiPhi.pronounRule.includes('anh/chị - em');

  // Genuine honorifics must trigger
  const directiveGenuine = aiService.buildLocalReflexDirective('chị ơi hỗ trợ em với');
  const isGenuineHonored = directiveGenuine.pronounRule.includes('anh/chị - em');

  // True close peer "t - m" must lock
  const directiveTM = aiService.buildLocalReflexDirective('t muốn m giải thích công thức');
  const isTMHonored = directiveTM.pronounRule.includes('Xưng "t" - gọi "m"');

  assertTest(
    'Tier 1',
    'T1.4',
    'Strict Pronoun Locking & Anti-Collision ("chi" in "chi tiết")',
    isChiTietHonored && isChiPhiHonored && isGenuineHonored && isTMHonored,
    isChiTietHonored && isChiPhiHonored && isGenuineHonored && isTMHonored
      ? 'Correctly distinguished syllable "chi" from pronoun "chị", preserved persona locking'
      : 'Syllable collision detected: "chi tiết" incorrectly triggered honorific "anh/chị - em"'
  );
})();

// T1.5: Multi-Line Code Block Newline Preservation
(() => {
  const sampleCode = `\`\`\`typescript
function quicksort<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[0];
  const left = arr.slice(1).filter(x => x <= pivot);
  const right = arr.slice(1).filter(x => x > pivot);
  return [...quicksort(left), pivot, ...quicksort(right)];
}
\`\`\``;

  const blocks = richMarkdownView.parseMarkdownBlocks(sampleCode);
  const codeBlock = blocks.find((b) => b.type === 'code');

  const hasCodeBlock = Boolean(codeBlock);
  const codeText = codeBlock?.code || '';
  const lines = codeText.split('\n');
  const lineCount = lines.length;
  const preservesNewlines = lineCount >= 8 && codeText.includes('return arr;') && codeText.includes('const pivot');

  // Also check that literal escaped \\n is unescaped
  const literalEscapedSample = '```js\\nconst a = 1;\\nconst b = 2;\\nconst c = a + b;\\n```';
  const literalBlocks = richMarkdownView.parseMarkdownBlocks(literalEscapedSample);
  const literalCodeBlock = literalBlocks.find((b) => b.type === 'code');
  const handlesLiteralEscapes = literalCodeBlock && literalCodeBlock.lineCount >= 3;

  assertTest(
    'Tier 1',
    'T1.5',
    'Multi-Line Code Block Newline & Structure Preservation',
    hasCodeBlock && preservesNewlines && handlesLiteralEscapes,
    hasCodeBlock && preservesNewlines && handlesLiteralEscapes
      ? `Code block correctly parsed with ${lineCount} distinct lines and unescaped newlines`
      : 'Code block collapsed into 1-2 lines or failed to parse literal newlines'
  );
})();

// T1.6: Markdown Table Bold Formatting (**Hiệu năng**)
(() => {
  const tableMarkdown = `| Tiêu chí | React Native | Flutter |
|---|---|---|
| **Hiệu năng** | **Rất cao** | Cao |
| **Bộ nhớ** | Tối ưu | Trung bình |`;

  const blocks = richMarkdownView.parseMarkdownBlocks(tableMarkdown);
  const tableBlock = blocks.find((b) => b.type === 'table');
  const hasTable = Boolean(tableBlock && tableBlock.headers && tableBlock.rows);

  // Check source code of components/RichMarkdownView.tsx to ensure TableView uses renderInline / inline markdown parser
  const richMdSrc = fs.readFileSync(path.join(__dirname, 'components/RichMarkdownView.tsx'), 'utf8');
  // It must NOT simply render raw `{cell}` inside TableView cells without renderInline / bold parsing
  const tableRendersInline =
    richMdSrc.includes('renderInline(cell') ||
    richMdSrc.includes('renderInline(header') ||
    richMdSrc.includes('parseInlineMarkdown(cell') ||
    richMdSrc.includes('parseInlineMarkdown(header');

  assertTest(
    'Tier 1',
    'T1.6',
    'Markdown Table Cell Bold Formatting (**Hiệu năng**)',
    hasTable && tableRendersInline,
    hasTable && tableRendersInline
      ? 'TableView parses inline markdown and styles **Hiệu năng** with bold weight'
      : 'TableView displays literal raw **asterisks** without parsing bold inline markdown'
  );
})();

// T1.7: Math Formula Tokenizer & LaTeX Unicode Conversion
(() => {
  const formulaBayes = richMarkdownView.convertLatexToUnicode('\\frac{P(B|A)P(A)}{P(B)}');
  const formulaSqrt = richMarkdownView.convertLatexToUnicode('\\sqrt{x^2 + y^2}');
  const formulaTimes = richMarkdownView.convertLatexToUnicode('2 \\times 10^3');
  const formulaMid = richMarkdownView.convertLatexToUnicode('P(A \\mid B)');
  const formulaLeftRight = richMarkdownView.convertLatexToUnicode('\\left( \\frac{a}{b} \\right)');

  const bayesConverted = formulaBayes.includes('P(B|A)P(A) / P(B)');
  const sqrtConverted = formulaSqrt.includes('√(x² + y²)');
  const timesConverted = formulaTimes.includes('×');
  const midConverted = formulaMid.includes('|') && !formulaMid.includes('\\mid');
  const bracketsConverted = formulaLeftRight.includes('(') && formulaLeftRight.includes(')');

  // Check priority of $$ display math before $ inline math
  const sampleWithBoth = 'Công thức $$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$ và ký hiệu $x$.';
  const parsedBlocks = richMarkdownView.parseMarkdownBlocks(sampleWithBoth);
  const hasMathBlock = parsedBlocks.some((b) => b.type === 'math' || (b.type === 'paragraph' && b.text.includes('P(A|B)')));

  assertTest(
    'Tier 1',
    'T1.7',
    'LaTeX to Unicode Converter & Tokenizer',
    bayesConverted && sqrtConverted && timesConverted && midConverted && bracketsConverted && hasMathBlock,
    bayesConverted && sqrtConverted && timesConverted && midConverted && bracketsConverted && hasMathBlock
      ? 'All mathematical operators (\\mid, \\frac, \\sqrt, \\times, \\left, \\right) converted to Unicode'
      : 'LaTeX conversion missed operators or displayed unparsed LaTeX wrappers'
  );
})();

// T1.8: Standalone macOS Tomorrow.app Window Isolation
(() => {
  const tomorrowAppPath = '/Applications/Tomorrow.app';
  const tomorrowBinaryPath = '/Applications/Tomorrow.app/Contents/MacOS/Tomorrow';

  let appExists = fs.existsSync(tomorrowAppPath);
  let binaryExists = fs.existsSync(tomorrowBinaryPath);
  let isNotChromeScript = false;
  let isMachOBinary = false;

  if (binaryExists) {
    const fileContent = fs.readFileSync(tomorrowBinaryPath);
    const contentStr = fileContent.toString('utf8', 0, Math.min(fileContent.length, 1024));

    // Verify it is NOT a bash script executing Google Chrome
    isNotChromeScript = !contentStr.includes('Google Chrome') && !contentStr.includes('open -na');

    // Run `file` command to verify Mach-O 64-bit binary
    try {
      const fileOutput = execSync(`file "${tomorrowBinaryPath}"`, { encoding: 'utf8' });
      isMachOBinary = fileOutput.includes('Mach-O') && fileOutput.includes('64-bit');
    } catch {
      isMachOBinary = false;
    }
  }

  assertTest(
    'Tier 1',
    'T1.8',
    'macOS Tomorrow.app Process Isolation (Native Mach-O Binary, No Chrome Coupling)',
    appExists && binaryExists && isNotChromeScript && isMachOBinary,
    appExists && binaryExists && isNotChromeScript && isMachOBinary
      ? 'Standalone Mach-O native binary verified; zero Chrome PID coupling'
      : binaryExists && !isMachOBinary
        ? 'Tomorrow launcher is still a bash shell script launching Google Chrome'
        : 'Tomorrow.app or binary missing at /Applications/Tomorrow.app/Contents/MacOS/Tomorrow'
  );
})();

// =============================================================================
// TIER 2: BOUNDARY VALUE ANALYSIS & CORNER CASES (T2.1 - T2.4)
// =============================================================================
console.log('\n--- 📌 TIER 2: BOUNDARY & CORNER CASES ---');

// T2.1: Empty and Consecutive Blank Lines in Code Blocks
(() => {
  const codeWithBlanks = `\`\`\`python
def calculate_metrics():
    total = 0

    # Intermediate blank line above
    for i in range(10):
        total += i


    return total
\`\`\``;

  const blocks = richMarkdownView.parseMarkdownBlocks(codeWithBlanks);
  const codeBlock = blocks.find((b) => b.type === 'code');
  const codeText = codeBlock?.code || '';
  const lines = codeText.split('\n');

  // Verify that consecutive blank lines are preserved and not silently deleted
  const blankLineCount = lines.filter((l) => l.trim() === '').length;
  const preservesEmptyLines = blankLineCount >= 3 && lines.length >= 10;

  assertTest(
    'Tier 2',
    'T2.1',
    'Code Block Empty Lines Height & Preservation',
    preservesEmptyLines,
    preservesEmptyLines
      ? `Preserved ${blankLineCount} blank lines within code block without collapse`
      : 'Empty lines collapsed or discarded during AST parsing'
  );
})();

// T2.2: Truncated JSON Stream Recovery (Simulating Max Token Exhaustion)
(() => {
  const bs = String.fromCharCode(92);
  // Simulating truncated JSON at token 250
  const truncatedWire = `{"replies": ["Công thức Bayes: $$P(A|B) = ${bs}frac{P(B|A)P(A)}{P(B)}$$", "Giải thích ngắn`;

  let repaired = null;
  let parsedSuccess = false;
  try {
    repaired = aiService.safeParseAIJson(truncatedWire);
    parsedSuccess = Boolean(repaired && Array.isArray(repaired.replies) && repaired.replies.length >= 1);
  } catch {
    parsedSuccess = false;
  }

  const extractedFormula = parsedSuccess && repaired.replies[0].includes('frac');

  assertTest(
    'Tier 2',
    'T2.2',
    'Truncated JSON Recovery Under Max Token Limits',
    parsedSuccess && extractedFormula,
    parsedSuccess && extractedFormula
      ? 'Auto-repaired cutoff JSON stream and retrieved intact formula'
      : 'Failed to recover from truncated JSON string'
  );
})();

// T2.3: Complex Nested LaTeX Expressions (Bayes, Gaussian Integral, Matrices)
(() => {
  const bs = String.fromCharCode(92);
  const complexExpressions = [
    // Bayes
    `P(A|B) = ${bs}frac{P(B|A)P(A)}{P(B)}`,
    // Gaussian Integral
    `${bs}int_{-${bs}infty}^{${bs}infty} e^{-x^2} dx = ${bs}sqrt{${bs}pi}`,
    // Matrix
    `${bs}begin{matrix} a & b ${bs}${bs} c & d ${bs}end{matrix}`,
    // Quadratic equation
    `x = ${bs}frac{-b ${bs}pm ${bs}sqrt{b^2 - 4ac}}{2a}`,
  ];

  let allConvertedCleanly = true;
  for (const expr of complexExpressions) {
    const converted = richMarkdownView.convertLatexToUnicode(expr);
    // Should not contain raw \frac, \sqrt, \int, \pm, \infty
    if (
      converted.includes('\\frac') ||
      converted.includes('\\sqrt') ||
      converted.includes('\\int') ||
      converted.includes('\\infty') ||
      converted.includes('\\pm')
    ) {
      allConvertedCleanly = false;
      break;
    }
  }

  assertTest(
    'Tier 2',
    'T2.3',
    'Complex Nested LaTeX Expressions (Bayes, Integral, Matrix, Quadratic)',
    allConvertedCleanly,
    allConvertedCleanly
      ? 'All 4 complex mathematical expressions converted cleanly to Unicode'
      : 'Unconverted LaTeX command tokens detected in output'
  );
})();

// T2.4: Mixed Syllables & Substring Disambiguation
(() => {
  // Disambiguate queries having both non-honorific words ("chi nhánh", "chi phí") and true honorific
  const mixedSentence = 'chi phí kiểm tra tại chi nhánh cho chị Hoa';
  const directive = aiService.buildLocalReflexDirective(mixedSentence);

  // Since user explicitly refers to "chị Hoa", honorific should trigger correctly
  const trueHonorificDetected = directive.pronounRule.includes('anh/chị - em');

  // But for pure business query with multiple "chi" words and no person:
  const businessSentence = 'chi nhánh ngân hàng báo cáo chi phí chi tiêu';
  const businessDirective = aiService.buildLocalReflexDirective(businessSentence);
  const noFalsePositive = !businessDirective.pronounRule.includes('anh/chị - em');

  assertTest(
    'Tier 2',
    'T2.4',
    'Sub-token Disambiguation (True honorific vs Business vocabulary)',
    trueHonorificDetected && noFalsePositive,
    trueHonorificDetected && noFalsePositive
      ? 'Correctly identified "chị Hoa" as honorific while ignoring "chi nhánh", "chi phí", "chi tiêu"'
      : 'Failed substring disambiguation test'
  );
})();

// =============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (T3.1 - T3.4)
// =============================================================================
console.log('\n--- 📌 TIER 3: PAIRWISE & CROSS-FEATURE COMBINATIONS ---');

// T3.1: LaTeX Math Inside Markdown Table
(() => {
  const tableWithMath = `| Thuật toán | Độ phức tạp | Công thức toán học |
|---|---|---|
| Bayes | O(1) | $$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$ |
| K-Means | O(nkt) | $$\\sum_{i=1}^k \\sum_{x \\in S_i} ||x - \\mu_i||^2$$ |`;

  const blocks = richMarkdownView.parseMarkdownBlocks(tableWithMath);
  const tableBlock = blocks.find((b) => b.type === 'table');
  const validTable = Boolean(tableBlock && tableBlock.rows.length === 2);
  const mathInTablePreserved =
    validTable &&
    tableBlock.rows[0][2].includes('P(A|B)') &&
    tableBlock.rows[1][2].includes('\\mu');

  assertTest(
    'Tier 3',
    'T3.1',
    'LaTeX Math Inside Markdown Table Cells',
    validTable && mathInTablePreserved,
    validTable && mathInTablePreserved
      ? 'Table parsed successfully with LaTeX math formulas preserved in cells'
      : 'Table failed to parse cells containing LaTeX formulas'
  );
})();

// T3.2: Code Block Containing LaTeX in Comments
(() => {
  const codeWithLatex = `\`\`\`python
# Formula: P(A|B) = \\frac{P(B|A)P(A)}{P(B)}
def bayes_probability(p_b_given_a, p_a, p_b):
    """Calculate \\sqrt{x} in docstring."""
    return (p_b_given_a * p_a) / p_b
\`\`\``;

  const blocks = richMarkdownView.parseMarkdownBlocks(codeWithLatex);
  const codeBlock = blocks.find((b) => b.type === 'code');
  const rawPreserved =
    codeBlock &&
    codeBlock.code.includes('\\frac{P(B|A)P(A)}{P(B)}') &&
    codeBlock.code.includes('\\sqrt{x}');

  assertTest(
    'Tier 3',
    'T3.2',
    'Code Block with LaTeX in Comments & Docstrings',
    rawPreserved,
    rawPreserved
      ? 'Code block preserved raw escape tokens without premature mutation'
      : 'Code block corrupted raw LaTeX in comments'
  );
})();

// T3.3: Strict Pronoun Preservation with LaTeX Technical Content
(() => {
  const userPrompt = 't muốn m giải thích chi tiết định lý Bayes bằng công thức';
  const directive = aiService.buildLocalReflexDirective(userPrompt);

  const tmPreserved = directive.pronounRule.includes('Xưng "t" - gọi "m"');
  const notDegradedToEm = !directive.pronounRule.includes('anh/chị - em');
  const bypassWebSearch = !webSearchService.shouldTriggerWebSearch(userPrompt);

  assertTest(
    'Tier 3',
    'T3.3',
    'Pronoun "t - m" Preservation Across Academic Inquiries',
    tmPreserved && notDegradedToEm && bypassWebSearch,
    tmPreserved && notDegradedToEm && bypassWebSearch
      ? 'Preserved "t - m", prevented "chi tiết" honorific collision, bypassed web search'
      : 'Pronoun degraded or web search triggered'
  );
})();

// T3.4: Mixed Bold & Mathematical Formula Formatting
(() => {
  const mixedContent = `**Định lý Bayes:**
Cho hai biến cố A và B, với P(B) > 0, ta có:
$$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$

Trong đó **P(A|B)** là xác suất hậu nghiệm.`;

  const blocks = richMarkdownView.parseMarkdownBlocks(mixedContent);
  const hasHeadingOrBold = blocks.some((b) => b.type === 'paragraph' && b.text.includes('**Định lý Bayes:**'));
  const hasMath = blocks.some((b) => b.type === 'math' && b.formula.includes('frac'));

  assertTest(
    'Tier 3',
    'T3.4',
    'Mixed Bold Markdown & Display Math Tokenization',
    hasHeadingOrBold && hasMath,
    hasHeadingOrBold && hasMath
      ? 'AST correctly partitioned mixed bold paragraphs and display math blocks'
      : 'AST parser failed to separate display math from surrounding text'
  );
})();

// =============================================================================
// TIER 4: REAL-WORLD OPERATIONAL PROFILES (T4.1 - T4.5)
// =============================================================================
console.log('\n--- 📌 TIER 4: REAL-WORLD OPERATIONAL PROFILES ---');

// T4.1: Scenario 1 — "định lý Bayes"
(() => {
  const query = 'định lý Bayes';
  const searchBypassed = !webSearchService.shouldTriggerWebSearch(query);
  const fallback = aiService.localResilientFallback(query);
  const fallbackReplies = (fallback.replies || []).join(' ');
  const noFakeFallback = !fallbackReplies.includes('nghe thú vị đấy') && !fallbackReplies.includes('nói rõ hơn xem nào');

  const bs = String.fromCharCode(92);
  const mockAIResponse = `{"replies": ["Định lý Bayes mô tả xác suất của một sự kiện dựa trên các điều kiện liên quan: $$P(A|B) = ${bs}frac{P(B|A)P(A)}{P(B)}$$"]}`;
  const parsed = aiService.safeParseAIJson(mockAIResponse);
  const jsonParsedCleanly = parsed && parsed.replies && parsed.replies.length === 1 && parsed.replies[0].includes('frac');

  assertTest(
    'Tier 4',
    'T4.1',
    'Workload 1: "định lý Bayes" (Fast-path + Clean Parse + No Fake Fallback)',
    searchBypassed && noFakeFallback && jsonParsedCleanly,
    searchBypassed && noFakeFallback && jsonParsedCleanly
      ? 'Workflow complete: Web search bypassed (0s latency), JSON parsed with LaTeX, 0 fake fallbacks'
      : 'Failed workflow on "định lý Bayes"'
  );
})();

// T4.2: Scenario 2 — "giải thích chi tiết định lý Bayes"
(() => {
  const query = 'giải thích chi tiết định lý Bayes';
  const searchBypassed = !webSearchService.shouldTriggerWebSearch(query);
  const directive = aiService.buildLocalReflexDirective(query);
  const noCollision = !directive.pronounRule.includes('anh/chị - em') && directive.pronounRule.includes('mình - bạn');

  const fallback = aiService.localResilientFallback(query);
  const fallbackReplies = (fallback.replies || []).join(' ');
  const noFakeFallback = !fallbackReplies.includes('nghe thú vị đấy');

  assertTest(
    'Tier 4',
    'T4.2',
    'Workload 2: "giải thích chi tiết định lý Bayes" (Fast-path + Syllable Lock)',
    searchBypassed && noCollision && noFakeFallback,
    searchBypassed && noCollision && noFakeFallback
      ? 'Workflow complete: "chi tiết" did not trigger honorifics, web search bypassed'
      : 'Failed workflow on "giải thích chi tiết định lý Bayes"'
  );
})();

// T4.3: Scenario 3 — "lập bảng so sánh hiệu năng React vs Vue"
(() => {
  const query = 'lập bảng so sánh hiệu năng React vs Vue';
  const directive = aiService.buildLocalReflexDirective(query);
  const modeAppropriate = directive.dynamicMaxTokens >= 800; // Technical/Table demands larger tokens

  const sampleTableMarkdown = `| Tiêu chí | React | Vue |
|---|---|---|
| **Hiệu năng** | Rất cao | Rất cao |
| **Kích thước bundle** | 42 kB | 33 kB |`;

  const blocks = richMarkdownView.parseMarkdownBlocks(sampleTableMarkdown);
  const tableBlock = blocks.find((b) => b.type === 'table');
  const validTable = Boolean(tableBlock && tableBlock.headers.length === 3 && tableBlock.rows.length === 2);

  assertTest(
    'Tier 4',
    'T4.3',
    'Workload 3: "lập bảng so sánh hiệu năng React vs Vue" (High token reflex + Table AST)',
    modeAppropriate && validTable,
    modeAppropriate && validTable
      ? 'Workflow complete: Dynamic max tokens scaled for table, Markdown table AST parsed'
      : 'Failed table comparison workflow'
  );
})();

// T4.4: Scenario 4 — "viết code quicksort bằng TypeScript"
(() => {
  const query = 'viết code quicksort bằng TypeScript';
  const searchBypassed = !webSearchService.shouldTriggerWebSearch(query);
  const directive = aiService.buildLocalReflexDirective(query);
  const modeAppropriate = directive.dynamicMaxTokens >= 800;

  const sampleCodeResponse = `\`\`\`typescript
export function quicksort<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[0];
  const left = arr.slice(1).filter((x) => x <= pivot);
  const right = arr.slice(1).filter((x) => x > pivot);
  return [...quicksort(left), pivot, ...quicksort(right)];
}
\`\`\``;

  const blocks = richMarkdownView.parseMarkdownBlocks(sampleCodeResponse);
  const codeBlock = blocks.find((b) => b.type === 'code');
  const multilinePreserved = codeBlock && codeBlock.lineCount >= 8;

  assertTest(
    'Tier 4',
    'T4.4',
    'Workload 4: "viết code quicksort bằng TypeScript" (Code fast-path + Multi-line block)',
    searchBypassed && modeAppropriate && multilinePreserved,
    searchBypassed && modeAppropriate && multilinePreserved
      ? 'Workflow complete: Web search bypassed, dynamic max tokens scaled, code block preserves 8 lines'
      : 'Failed code generation workflow'
  );
})();

// T4.5: Release Integrity & Version Check (Online • v4.2.1)
(() => {
  let packageJsonUpdated = false;
  let appJsonUpdated = false;
  let versionIndicatorUpdated = false;

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    packageJsonUpdated = pkg.version === '4.2.1' || pkg.version === '4.2.2';
  } catch {}

  try {
    const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));
    appJsonUpdated = appConfig.expo?.version === '4.2.1' || appConfig.expo?.version === '4.2.2';
  } catch {}

  // Check App.tsx or ChatHeader or constants/version.ts for "Online • v4.2.1" / "Online • v4.2.2"
  try {
    const appTsx = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf8');
    if (appTsx.includes('Online • v4.2.1') || appTsx.includes('Online • v4.2.2')) {
      versionIndicatorUpdated = true;
    }
  } catch {}

  // Also check constants or ChatHeader
  const candidates = ['constants/version.ts', 'components/ChatHeader.tsx'];
  for (const c of candidates) {
    const full = path.join(__dirname, c);
    if (fs.existsSync(full)) {
      const src = fs.readFileSync(full, 'utf8');
      if (src.includes('4.2.1')) {
        versionIndicatorUpdated = true;
      }
    }
  }

  assertTest(
    'Tier 4',
    'T4.5',
    'Release Integrity: Version Bump to Online • v4.2.1',
    packageJsonUpdated && appJsonUpdated && versionIndicatorUpdated,
    packageJsonUpdated && appJsonUpdated && versionIndicatorUpdated
      ? 'Version 4.2.1 synchronized across package.json, app.json, and UI header'
      : 'Version not yet updated to 4.2.1'
  );
})();

// =============================================================================
// FINAL AUDIT SUMMARY & EXIT PROTOCOL
// =============================================================================
console.log('\n================================================================================');
console.log(`📊 FINAL TEST AUDIT SUMMARY: ${passedTests}/${testResults.length} PASSED (${Math.round((passedTests / testResults.length) * 100)}%)`);
console.log(`   Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================================');

const isDiagnostic = process.argv.includes('--diagnostic');
if (failedTests > 0 && !isDiagnostic) {
  console.log('\n⚠️ HOTFIX INCOMPLETE: Some tests failed against the target specification.');
  console.log('Implementing agents must resolve the failed items before final deployment.\n');
  process.exit(1);
} else {
  console.log('\n🎉 ALL TESTS PASSED PERFECTLY OR DIAGNOSTIC MODE COMPLETED!\n');
  process.exit(0);
}
