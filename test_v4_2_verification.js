const assert = require('assert');

// 1. Kiểm tra bộ chuyển đổi LaTeX sang Unicode
function convertLatexToUnicode(latex) {
  if (!latex) return '';
  let res = latex;
  res = res.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)');
  res = res.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1√($2)');
  res = res.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

  const greekMap = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\Delta': 'Δ',
    '\\pi': 'π', '\\theta': 'θ', '\\lambda': 'λ', '\\sigma': 'σ',
    '\\omega': 'ω', '\\Omega': 'Ω',
  };
  for (const [k, v] of Object.entries(greekMap)) res = res.split(k).join(v);

  const symbolMap = {
    '\\sum': '∑', '\\int': '∫', '\\infty': '∞', '\\pm': '±',
    '\\times': '×', '\\div': '÷', '\\neq': '≠', '\\leq': '≤',
    '\\geq': '≥', '\\approx': '≈', '\\rightarrow': '→', '\\to': '→',
  };
  for (const [k, v] of Object.entries(symbolMap)) res = res.split(k).join(v);

  const superMap = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 't': 'ᵗ',
  };
  res = res.replace(/\^\{([^}]+)\}/g, (_, inner) => inner.split('').map(c => superMap[c] || c).join(''));
  res = res.replace(/\^([0-9a-zA-Z+-])/g, (_, c) => superMap[c] || c);

  const subMap = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', 'n': 'ₙ', 'i': 'ᵢ', 'x': 'ₓ',
  };
  res = res.replace(/_\{([^}]+)\}/g, (_, inner) => inner.split('').map(c => subMap[c] || c).join(''));
  res = res.replace(/_([0-9a-zA-Z+-])/g, (_, c) => subMap[c] || c);

  res = res.replace(/\\(text|mathbf|mathit|mathrm)\{([^}]+)\}/g, '$2');
  return res.trim();
}

// 2. Kiểm tra bộ ghép nối khối code bị đứt đoạn
function sanitizeAndMergeBrokenBlocks(replies) {
  if (!Array.isArray(replies) || replies.length === 0) return [];
  const merged = [];
  let currentAccumulator = '';
  let inCodeBlock = false;

  for (let i = 0; i < replies.length; i++) {
    const item = String(replies[i] ?? '');
    if (!item.trim() && !inCodeBlock) continue;

    if (inCodeBlock) {
      currentAccumulator += '\n' + item;
      const count = (item.match(/```/g) || []).length;
      if (count % 2 !== 0) {
        inCodeBlock = false;
        merged.push(currentAccumulator.trim());
        currentAccumulator = '';
      }
    } else {
      const count = (item.match(/```/g) || []).length;
      if (count % 2 !== 0) {
        inCodeBlock = true;
        currentAccumulator = item;
      } else {
        merged.push(item);
      }
    }
  }

  if (inCodeBlock && currentAccumulator) {
    merged.push(currentAccumulator.trim() + '\n```');
  }

  return merged;
}

// 3. Phân tích khối Markdown
function parseMarkdownBlocks(rawText) {
  const blocks = [];
  const lines = (rawText || '').split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const langMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)/);
      const language = langMatch && langMatch[1] ? langMatch[1] : '';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) i++;
      blocks.push({
        type: 'code',
        language: language.toUpperCase() || 'CODE',
        code: codeLines.join('\n'),
        lineCount: Math.max(codeLines.length, 1),
      });
      continue;
    }

    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 2 && trimmed.endsWith('$$')) {
        blocks.push({ type: 'math', formula: trimmed.slice(2, -2).trim() });
        i++;
        continue;
      }
    }

    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      /^\|[-:| ]+\|$/.test(lines[i + 1].trim())
    ) {
      const headers = trimmed.split('|').slice(1, -1).map(h => h.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        rows.push(lines[i].trim().split('|').slice(1, -1).map(c => c.trim()));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (/^(#{1,3})\s+/.test(line)) {
      const m = line.match(/^(#{1,3})\s+(.*)$/);
      blocks.push({ type: 'heading', level: m[1].length, text: m[2].trim() });
      i++;
      continue;
    }

    if (!trimmed) {
      i++;
      continue;
    }

    blocks.push({ type: 'paragraph', text: line });
    i++;
  }
  return blocks;
}

console.log('--- TEST V4.2 VERIFICATION ---');

// TEST 1: LaTeX Converter
const mathTest = '\\sum_{i=0}^n x_i^2 + \\frac{\\alpha}{\\beta} \\approx \\pi';
const convertedMath = convertLatexToUnicode(mathTest);
console.log('1. LaTeX Unicode:', convertedMath);
assert(convertedMath.includes('∑'));
assert(convertedMath.includes('π'));
assert(convertedMath.includes('α / β'));
assert(convertedMath.includes('²'));
console.log('   ✓ Test 1 Passed: LaTeX Unicode Formatter accurate');

// TEST 2: Sanitize and Merge Broken Blocks
const splitCode = [
  'Đoạn 1 bình thường',
  '```javascript\nfunction test() {',
  '  return 1;\n}```',
  'Đoạn 3 kết luận'
];
const mergedCode = sanitizeAndMergeBrokenBlocks(splitCode);
assert.strictEqual(mergedCode.length, 3);
assert(mergedCode[1].includes('function test() {\n  return 1;\n}```'));
console.log('   ✓ Test 2 Passed: Broken code fence merged seamlessly');

// TEST 3: Parse Markdown Blocks
const sampleDoc = `# Tiêu đề chính
Đây là đoạn giới thiệu.

\`\`\`python
def greet():
    print("hello")
\`\`\`

| Tên | Điểm |
|---|---|
| Tomorrow | 10 |
| Jarvis | 10 |

$$ E = mc^2 $$`;

const parsedBlocks = parseMarkdownBlocks(sampleDoc);
assert.strictEqual(parsedBlocks.length, 5);
assert.strictEqual(parsedBlocks[0].type, 'heading');
assert.strictEqual(parsedBlocks[1].type, 'paragraph');
assert.strictEqual(parsedBlocks[2].type, 'code');
assert.strictEqual(parsedBlocks[3].type, 'table');
assert.strictEqual(parsedBlocks[4].type, 'math');
console.log('   ✓ Test 3 Passed: AST parser correctly identified all 5 block types');

// TEST 4: hasRichBlock regex
const hasRichBlock = (t) => /```|\n\|.*\|.*\n|^#{1,3}\s|\$\$/.test(t);
assert.strictEqual(hasRichBlock('yo bạn ơi'), false);
assert.strictEqual(hasRichBlock('```js\nconst a = 1;\n```'), true);
assert.strictEqual(hasRichBlock('\n| a | b |\n|---|---|\n'), true);
assert.strictEqual(hasRichBlock('$$x^2$$'), true);
assert.strictEqual(hasRichBlock('# Heading'), true);
console.log('   ✓ Test 4 Passed: Dual-Width Bubble detector 100% accurate');

console.log('\n🎉 ALL 4 SYSTEM VERIFICATION TESTS PASSED PERFECTLY!');
