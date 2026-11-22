import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { ThemeColors } from '../constants/theme';

/**
 * Tiện ích Copy vào Clipboard hoạt động an toàn trên cả Web Desktop và Native
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  } catch (err) {
    console.warn('Copy to clipboard failed:', err);
  }
  return false;
}

/**
 * Chuyển đổi LaTeX thông dụng sang ký tự Toán học Unicode chuẩn xác
 */
export function convertLatexToUnicode(latex: string): string {
  if (!latex) return '';

  let res = latex;

  // 1. Loại bỏ các lệnh bọc dấu ngoặc \left và \right
  res = res.replace(/\\left\s*([(\[{|])/g, '$1');
  res = res.replace(/\\right\s*([)\]}|])/g, '$1');
  res = res.replace(/\\left\./g, '');
  res = res.replace(/\\right\./g, '');

  // 2. Căn bậc hai (xử lý trước để loại bỏ ngoặc nhọn lồng nhau cho phân số)
  while (/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/.test(res)) {
    res = res.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '$1√($2)');
  }
  while (/\\sqrt\{([^{}]+)\}/.test(res)) {
    res = res.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  }

  // 3. Phân số: \frac{a}{b} -> (a / b) (hỗ trợ phân số lồng nhau)
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(res)) {
    res = res.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)');
  }

  // 4. Môi trường ma trận LaTeX: \begin{matrix} ... \end{matrix}
  res = res.replace(/\\begin\{[a-zA-Z]*matrix\}/g, '[');
  res = res.replace(/\\end\{[a-zA-Z]*matrix\}/g, ']');
  res = res.replace(/\\\\/g, '; ');
  res = res.replace(/&/g, ', ');

  // 5. Ký tự Hy Lạp
  const greekMap: Record<string, string> = {
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\Gamma': 'Γ',
    '\\delta': 'δ',
    '\\Delta': 'Δ',
    '\\epsilon': 'ε',
    '\\zeta': 'ζ',
    '\\eta': 'η',
    '\\theta': 'θ',
    '\\Theta': 'Θ',
    '\\lambda': 'λ',
    '\\Lambda': 'Λ',
    '\\mu': 'μ',
    '\\nu': 'ν',
    '\\xi': 'ξ',
    '\\pi': 'π',
    '\\Pi': 'Π',
    '\\rho': 'ρ',
    '\\sigma': 'σ',
    '\\Sigma': 'Σ',
    '\\tau': 'τ',
    '\\phi': 'φ',
    '\\Phi': 'Φ',
    '\\chi': 'χ',
    '\\psi': 'ψ',
    '\\omega': 'ω',
    '\\Omega': 'Ω',
  };

  for (const [k, v] of Object.entries(greekMap)) {
    res = res.split(k).join(v);
  }

  // 6. Toán tử và ký hiệu toán học (Bổ sung \mid cho P(A|B))
  const symbolMap: Record<string, string> = {
    '\\mid': '|',
    '\\sum': '∑',
    '\\prod': '∏',
    '\\int': '∫',
    '\\oint': '∮',
    '\\infty': '∞',
    '\\pm': '±',
    '\\mp': '∓',
    '\\times': '×',
    '\\div': '÷',
    '\\cdot': '·',
    '\\neq': '≠',
    '\\ne': '≠',
    '\\leq': '≤',
    '\\le': '≤',
    '\\geq': '≥',
    '\\ge': '≥',
    '\\approx': '≈',
    '\\equiv': '≡',
    '\\sim': '∼',
    '\\rightarrow': '→',
    '\\to': '→',
    '\\leftarrow': '←',
    '\\Rightarrow': '⇒',
    '\\Leftarrow': '⇐',
    '\\Leftrightarrow': '⇔',
    '\\leftrightarrow': '↔',
    '\\forall': '∀',
    '\\exists': '∃',
    '\\nabla': '∇',
    '\\partial': '∂',
    '\\in': '∈',
    '\\notin': '∉',
    '\\subset': '⊂',
    '\\subseteq': '⊆',
    '\\cap': '∩',
    '\\cup': '∪',
    '\\emptyset': '∅',
    '\\degree': '°',
  };

  for (const [k, v] of Object.entries(symbolMap)) {
    res = res.split(k).join(v);
  }

  // 7. Số mũ (Superscripts)
  const superMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 't': 'ᵗ',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  };

  res = res.replace(/\^\{([^}]+)\}/g, (_, inner) => {
    return inner.split('').map((c: string) => superMap[c] || c).join('');
  });
  res = res.replace(/\^([0-9a-zA-Z+-])/g, (_, c) => superMap[c] || c);

  // 8. Chỉ số dưới (Subscripts)
  const subMap: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
    'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
    'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
    'v': 'ᵥ', 'x': 'ₓ',
  };

  res = res.replace(/_\{([^}]+)\}/g, (_, inner) => {
    return inner.split('').map((c: string) => subMap[c] || c).join('');
  });
  res = res.replace(/_([0-9a-zA-Z+-])/g, (_, c) => subMap[c] || c);

  // 9. Gỡ bỏ vỏ bọc văn bản LaTeX
  res = res.replace(/\\(text|textbf|textit|mathrm|mathbf)\{([^}]+)\}/g, '$2');
  res = res.replace(/\\,/g, ' ');
  res = res.replace(/\\;/g, ' ');
  res = res.replace(/\\quad/g, '   ');

  return res.trim();
}

/**
 * Kiểu dữ liệu các khối Markdown (Block AST)
 */
export type MarkdownBlock =
  | { type: 'code'; language: string; code: string; lineCount: number }
  | { type: 'table'; headers: string[]; rows: string[][]; rawText: string }
  | { type: 'math'; formula: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'numbered_list'; items: { num: string; text: string }[] }
  | { type: 'paragraph'; text: string };

/**
 * Phân tách các ô trong hàng bảng Markdown mà không cắt nhầm dấu | bên trong công thức toán $$...$$ hoặc inline code
 */
export function splitMarkdownTableRow(rowText: string): string[] {
  const trimmed = rowText.trim();
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let inDoubleDollar = false;
  let inSingleDollar = false;
  let inBacktick = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    const next = stripped[i + 1];

    if (ch === '\\' && (next === '|' || next === '$' || next === '`')) {
      current += next;
      i++;
      continue;
    }
    if (ch === '`') {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }
    if (!inBacktick && ch === '$' && next === '$') {
      inDoubleDollar = !inDoubleDollar;
      current += '$$';
      i++;
      continue;
    }
    if (!inBacktick && !inDoubleDollar && ch === '$') {
      inSingleDollar = !inSingleDollar;
      current += '$';
      continue;
    }
    if (!inBacktick && !inDoubleDollar && !inSingleDollar && ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

interface PythonBlock {
  type: string;
  indent: number;
  terminated: boolean;
}

/**
 * Tự động căn lề và định dạng code Python (4 khoảng trắng)
 * Bảo vệ an toàn chuỗi ký tự, comment và cấu trúc lồng nhau
 */
function formatPython(code: string, indentSize = 4): string {
  const indentStr = ' '.repeat(indentSize);
  let res = '';
  let indentLevel = 0;
  let inString = false;
  let stringChar = '';
  let isTriple = false;
  let inComment = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let i = 0;
  const n = code.length;
  let currentLine = '';

  const blockStack: PythonBlock[] = [];

  const getIndent = (lvl = indentLevel) => indentStr.repeat(Math.max(0, lvl));

  const pushLine = (overrideIndent: number | null = null) => {
    const trimmed = currentLine.trim();
    if (trimmed.length > 0) {
      if (res.length > 0 && !res.endsWith('\n')) res += '\n';
      const lvl = overrideIndent !== null ? overrideIndent : indentLevel;
      res += getIndent(lvl) + trimmed + '\n';
    }
    currentLine = '';
  };

  const blockStarters = [
    'def', 'class', 'if', 'elif', 'else', 'for', 'while',
    'try', 'except', 'finally', 'with', 'match', 'case', 'async'
  ];
  const dedentStarters = ['elif', 'else', 'except', 'finally'];

  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : '';
    const next2 = i + 2 < n ? code[i + 2] : '';

    // 1. Comments & Strings Shielding
    if (!inString && !inComment) {
      if (ch === '#') {
        inComment = true;
        currentLine += '#';
        i++;
        continue;
      }
      if ((ch === '"' || ch === "'") && next === ch && next2 === ch) {
        inString = true;
        isTriple = true;
        stringChar = ch;
        currentLine += ch + ch + ch;
        i += 3;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        isTriple = false;
        stringChar = ch;
        currentLine += ch;
        i++;
        continue;
      }
    } else if (inString) {
      currentLine += ch;
      if (ch === '\\' && next) {
        currentLine += next;
        i += 2;
        continue;
      }
      if (isTriple) {
        if (ch === stringChar && next === stringChar && next2 === stringChar) {
          currentLine += stringChar + stringChar;
          inString = false;
          i += 3;
          continue;
        }
      } else {
        if (ch === stringChar) {
          inString = false;
        }
      }
      i++;
      continue;
    } else if (inComment) {
      currentLine += ch;
      if (ch === '\n') {
        inComment = false;
        pushLine();
      }
      i++;
      continue;
    }

    // 2. Depth Tracking (Shielding slices, comprehensions, dicts, tuples)
    if (ch === '(') { parenDepth++; currentLine += ch; i++; continue; }
    if (ch === ')') { if (parenDepth > 0) parenDepth--; currentLine += ch; i++; continue; }
    if (ch === '[') { bracketDepth++; currentLine += ch; i++; continue; }
    if (ch === ']') { if (bracketDepth > 0) bracketDepth--; currentLine += ch; i++; continue; }
    if (ch === '{') { braceDepth++; currentLine += ch; i++; continue; }
    if (ch === '}') { if (braceDepth > 0) braceDepth--; currentLine += ch; i++; continue; }

    // 3. Colon Block Introducer at Depth 0
    if (ch === ':' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      currentLine += ':';
      const lineTrim = currentLine.trim();
      const firstWord = lineTrim.replace(/[:(].*$/, '').trim().split(/\s+/)[0];
      const isStarter = blockStarters.includes(firstWord);

      if (isStarter) {
        let lineIndent = indentLevel;

        if (dedentStarters.includes(firstWord)) {
          // Look for matching compound starter on stack
          if (firstWord === 'except') {
            while (blockStack.length > 0 && !['try', 'except'].includes(blockStack[blockStack.length - 1].type)) {
              blockStack.pop();
            }
            if (blockStack.length > 0) {
              lineIndent = blockStack[blockStack.length - 1].indent;
              blockStack[blockStack.length - 1] = { type: 'except', indent: lineIndent, terminated: false };
            } else {
              lineIndent = Math.max(0, indentLevel - 1);
            }
          } else if (firstWord === 'finally') {
            while (blockStack.length > 0 && !['try', 'except', 'finally'].includes(blockStack[blockStack.length - 1].type)) {
              blockStack.pop();
            }
            if (blockStack.length > 0) {
              lineIndent = blockStack[blockStack.length - 1].indent;
              blockStack[blockStack.length - 1] = { type: 'finally', indent: lineIndent, terminated: false };
            } else {
              lineIndent = Math.max(0, indentLevel - 1);
            }
          } else if (firstWord === 'elif') {
            while (blockStack.length > 0 && !['if', 'elif'].includes(blockStack[blockStack.length - 1].type)) {
              blockStack.pop();
            }
            if (blockStack.length > 0) {
              lineIndent = blockStack[blockStack.length - 1].indent;
              blockStack[blockStack.length - 1] = { type: 'elif', indent: lineIndent, terminated: false };
            } else {
              lineIndent = Math.max(0, indentLevel - 1);
            }
          } else if (firstWord === 'else') {
            while (blockStack.length > 0 && !['if', 'elif', 'for', 'while', 'try'].includes(blockStack[blockStack.length - 1].type)) {
              blockStack.pop();
            }
            if (blockStack.length > 0) {
              lineIndent = blockStack[blockStack.length - 1].indent;
              blockStack[blockStack.length - 1] = { type: 'else', indent: lineIndent, terminated: false };
            } else {
              lineIndent = Math.max(0, indentLevel - 1);
            }
          }
        } else {
          if (firstWord === 'def') {
            // Sibling functions/methods: nếu đang ở trong 1 def trước đó, pop def đó (và các khối con chưa đóng)
            while (blockStack.length > 0 && blockStack[blockStack.length - 1].type !== 'class' && blockStack[blockStack.length - 1].type !== 'def') {
              blockStack.pop();
            }
            if (blockStack.length > 0 && blockStack[blockStack.length - 1].type === 'def') {
              blockStack.pop();
            }
          } else if (firstWord === 'class') {
            // Khối class mới nằm ở cấp cao nhất
            while (blockStack.length > 0) {
              blockStack.pop();
            }
          }

          // Normal block starter: if top block was terminated, pop it
          while (blockStack.length > 0 && blockStack[blockStack.length - 1].terminated) {
            blockStack.pop();
          }
          if (blockStack.length > 0) {
            lineIndent = blockStack[blockStack.length - 1].indent + 1;
          } else {
            lineIndent = 0;
          }
          blockStack.push({ type: firstWord, indent: lineIndent, terminated: false });
        }

        pushLine(lineIndent);
        indentLevel = lineIndent + 1;
      }
      i++;
      while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
      continue;
    }

    // 4. Semicolon Statement Delimiter at Depth 0
    if (ch === ';' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      const lineTrim = currentLine.trim();
      pushLine();

      if (/^(return\b|break\b|continue\b|pass\b|raise\b)/.test(lineTrim)) {
        if (blockStack.length > 0) {
          blockStack[blockStack.length - 1].terminated = true;
          indentLevel = blockStack[blockStack.length - 1].indent;
        } else if (indentLevel > 1) {
          indentLevel--;
        }
      } else {
        while (blockStack.length > 0 && blockStack[blockStack.length - 1].terminated) {
          blockStack.pop();
          if (blockStack.length > 0) {
            indentLevel = blockStack[blockStack.length - 1].indent + 1;
          }
        }
      }

      i++;
      while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
      continue;
    }

    if (ch === '\n') {
      pushLine();
      i++;
      continue;
    }

    currentLine += ch;
    i++;
  }

  pushLine();
  return res.trim();
}

/**
 * Tự động căn lề và định dạng code dạng C-style (TS, JS: 2 spaces; C, Java, C++: 4 spaces)
 * Bảo vệ an toàn chuỗi ký tự, comment và các cặp ngoặc lồng nhau
 */
function formatCStyle(code: string, indentSize = 2): string {
  const indentStr = ' '.repeat(indentSize);
  let res = '';
  let indentLevel = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let i = 0;
  const n = code.length;
  let currentLine = '';

  const getIndent = () => indentStr.repeat(Math.max(0, indentLevel));

  const pushLine = () => {
    const trimmed = currentLine.trim();
    if (trimmed.length > 0) {
      if (res.length > 0 && !res.endsWith('\n')) res += '\n';
      res += getIndent() + trimmed + '\n';
    }
    currentLine = '';
  };

  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : '';

    // 1. Comments & Strings Shielding
    if (!inString && !inLineComment && !inBlockComment) {
      if (ch === '/' && next === '/') {
        inLineComment = true;
        currentLine += '//';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        currentLine += '/*';
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        currentLine += ch;
        i++;
        continue;
      }
    } else if (inString) {
      currentLine += ch;
      if (ch === '\\' && next) {
        currentLine += next;
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i++;
      continue;
    } else if (inLineComment) {
      currentLine += ch;
      if (ch === '\n') {
        inLineComment = false;
        pushLine();
      }
      i++;
      continue;
    } else if (inBlockComment) {
      currentLine += ch;
      if (ch === '*' && next === '/') {
        currentLine += '*/';
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // 2. Depth Tracking
    if (ch === '(') { parenDepth++; currentLine += ch; i++; continue; }
    if (ch === ')') { if (parenDepth > 0) parenDepth--; currentLine += ch; i++; continue; }
    if (ch === '[') { bracketDepth++; currentLine += ch; i++; continue; }
    if (ch === ']') { if (bracketDepth > 0) bracketDepth--; currentLine += ch; i++; continue; }

    // 3. Opening Brace '{'
    if (ch === '{') {
      const lineTrim = currentLine.trim();
      const isImportClause = lineTrim.startsWith('import');
      const isExportClause = /^export(\s+type)?\s*$/.test(lineTrim);

      if (isImportClause || isExportClause) {
        currentLine += ch;
        i++;
        continue;
      }

      let peek = i + 1;
      while (peek < n && (code[peek] === ' ' || code[peek] === '\t')) peek++;
      if (peek < n && code[peek] === '}') {
        currentLine = currentLine.trimEnd() + ' {}';
        i = peek + 1;
        while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
        if (i < n && code[i] === ';') {
          currentLine += ';';
          i++;
          while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
        }
        if (parenDepth === 0) {
          pushLine();
        }
        continue;
      }

      currentLine = currentLine.trimEnd() + ' {';
      pushLine();
      indentLevel++;
      i++;
      while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
      continue;
    }

    // 4. Closing Brace '}'
    if (ch === '}') {
      const lineTrim = currentLine.trim();
      const isImportExportClause =
        currentLine.includes('{') &&
        (lineTrim.startsWith('import') || /^export(\s+type)?\s*\{/.test(lineTrim));

      if (isImportExportClause) {
        currentLine += ch;
        i++;
        continue;
      }

      pushLine();
      if (indentLevel > 0) indentLevel--;
      currentLine = '}';

      let peek = i + 1;
      while (peek < n && (code[peek] === ' ' || code[peek] === '\t')) peek++;

      if (peek < n && (code[peek] === ';' || code[peek] === ',')) {
        currentLine += code[peek];
        i = peek;
      } else if (peek + 4 <= n && code.slice(peek, peek + 4) === 'else') {
        currentLine += ' else';
        i = peek + 3;
      }

      pushLine();
      i++;
      while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
      continue;
    }

    // 5. Semicolon ';' at parenDepth === 0 (preserves for-loop semicolons)
    if (ch === ';' && parenDepth === 0) {
      currentLine += ';';
      pushLine();
      i++;
      while (i < n && (code[i] === ' ' || code[i] === '\t')) i++;
      continue;
    }

    if (ch === '\n') {
      pushLine();
      i++;
      continue;
    }

    currentLine += ch;
    i++;
  }

  pushLine();
  return res.trim();
}

/**
 * Giải mã ký tự escape \\r\\n, \\n, \\t an toàn: chỉ unescape bên ngoài chuỗi string literal.
 * Bảo vệ tuyệt đối chuỗi ký tự trong C, C++, Java, Python, JS không bị biến \\n thành newline vật lý.
 */
function unescapeOutsideQuotes(code: string, language?: string): string {
  let res = '';
  let i = 0;
  const n = code.length;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  const normLang = (language || '').toLowerCase().trim();
  const isHashCommentLang = ['python', 'py', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'ruby', 'rb', 'perl', 'pl', 'r'].includes(normLang);
  const isCStyleLang = ['c', 'cpp', 'c++', 'cc', 'cxx', 'h', 'hpp', 'java', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'cs', 'csharp', 'go', 'rust', 'rs', 'swift', 'kotlin', 'kt'].includes(normLang);

  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : '';
    const next2 = i + 2 < n ? code[i + 2] : '';

    if (!inString && !inLineComment && !inBlockComment) {
      if (ch === '/' && next === '/') {
        inLineComment = true;
        res += '//';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        res += '/*';
        i += 2;
        continue;
      }
      const isPreprocessor = /^#(include|define|pragma|ifdef|ifndef|endif|if|elif|else|error|warning)\b/.test(code.slice(i));
      const shouldTreatHashAsComment = isHashCommentLang || (!isCStyleLang && !isPreprocessor && !code.includes('{') && !code.includes(';'));
      if (ch === '#' && shouldTreatHashAsComment) {
        inLineComment = true;
        res += '#';
        i++;
        continue;
      }
      if ((ch === '"' || ch === "'") && next === ch && next2 === ch) {
        inString = true;
        stringChar = ch + ch + ch;
        res += stringChar;
        i += 3;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        res += ch;
        i++;
        continue;
      }

      // Outside strings & comments: unescape \r\n, \n, \t
      if (ch === '\\') {
        if (next === 'r' && i + 3 < n && code[i + 2] === '\\' && code[i + 3] === 'n') {
          res += '\n';
          i += 4;
          continue;
        }
        if (next === 'n') {
          res += '\n';
          i += 2;
          continue;
        }
        if (next === 't') {
          res += '    ';
          i += 2;
          continue;
        }
        if (next === 'r') {
          i += 2;
          continue;
        }
      }

      if (ch === '\t') {
        res += '    ';
        i++;
        continue;
      }

      res += ch;
      i++;
    } else if (inString) {
      res += ch;
      if (ch === '\\' && next) {
        res += next;
        i += 2;
        continue;
      }
      if (stringChar.length === 3) {
        if (ch === stringChar[0] && next === stringChar[0] && next2 === stringChar[0]) {
          res += stringChar[0] + stringChar[0];
          inString = false;
          i += 3;
          continue;
        }
      } else if (ch === stringChar) {
        inString = false;
      }
      i++;
    } else if (inLineComment) {
      if (ch === '\\' && (next === 'n' || (next === 'r' && i + 3 < n && code[i + 2] === '\\' && code[i + 3] === 'n'))) {
        inLineComment = false;
        res += '\n';
        if (next === 'n') {
          i += 2;
        } else {
          i += 4;
        }
        continue;
      }
      res += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      i++;
    } else if (inBlockComment) {
      res += ch;
      if (ch === '*' && next === '/') {
        res += '/';
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
    }
  }

  return res;
}

/**
 * Tự động giải mã ký tự escape và tái cấu trúc định dạng thụt lề thông minh cho code block
 * Hỗ trợ: Python (4 spaces), TypeScript/JavaScript (2 spaces), C, Java, C++ (4 spaces)
 * Bảo vệ tuyệt đối chuỗi string literal và comment không bị phá vỡ
 */
export function formatCodeForDisplay(rawCode: string, language?: string): string {
  if (!rawCode) return '';

  const rawLines = rawCode.trim().split(/\r?\n/);
  const isSingleLine = rawLines.length === 1;
  const isLongSingleLine = isSingleLine && (rawLines[0].trim().length > 55 || rawLines[0].includes('\\n'));

  // Kiểm tra xem có phải khối code dồn cục (>55 ký tự trên 1 dòng chứa dấu phân tách lệnh) hay không
  const isCondensed = isLongSingleLine || (rawLines.length <= 2 && rawLines.some(l => l.trim().length > 55 && (/[:;{]/.test(l))));

  // Nếu code đã được định dạng nhiều dòng rõ ràng, giữ nguyên 100% để không làm xáo trộn format gốc
  if (!isCondensed && rawLines.length > 2) {
    return rawCode.replace(/\t/g, '    ');
  }

  // 1. Phục hồi các ký tự escape bị mã hóa (chỉ bên ngoài chuỗi string literal)
  const unescaped = unescapeOutsideQuotes(rawCode, language);

  const unescapedLines = unescaped.trim().split('\n');
  const isStillCondensed =
    unescapedLines.length === 1
      ? (unescapedLines[0].trim().length > 55)
      : (unescapedLines.length <= 2 && unescapedLines.some(l => l.trim().length > 55 && /[:;{]/.test(l)));

  if (!isStillCondensed && !isCondensed) {
    return unescaped;
  }

  const normLang = (language || '').toLowerCase().trim();
  const isPython =
    ['python', 'py'].includes(normLang) ||
    (!normLang && (/\bdef\s+\w+\s*\(/.test(unescaped) || /\bclass\s+\w+.*:/.test(unescaped)));

  const isJs = ['javascript', 'js', 'jsx'].includes(normLang);
  const isTs = ['typescript', 'ts', 'tsx'].includes(normLang);
  const isC = ['c'].includes(normLang);
  const isCpp = ['cpp', 'c++', 'cc', 'cxx'].includes(normLang);
  const isJava = ['java'].includes(normLang);

  if (isPython) {
    return formatPython(unescaped, 4);
  }

  if (isTs || isJs) {
    return formatCStyle(unescaped, 2);
  }

  if (isC || isCpp || isJava) {
    return formatCStyle(unescaped, 4);
  }

  // Mặc định: nếu phát hiện cú pháp Python dùng formatPython (4 spaces), ngược lại dùng formatCStyle (2 spaces)
  if (/\bdef\s+\w+\s*\(/.test(unescaped) || (/\bimport\s+\w+/.test(unescaped) && !unescaped.includes('{'))) {
    return formatPython(unescaped, 4);
  }

  return formatCStyle(unescaped, 2);
}

/**
 * Tiền chuẩn hóa Code Fence cho Markdown:
 * - Chuẩn hóa CRLF -> LF
 * - Tách thẻ mở fence dính liền cuối câu (VD: "như sau: ```python" -> "như sau:\n```python")
 * - Đảm bảo sau ```lang luôn có \n tách mã nguồn xuống dòng dưới
 * - Đảm bảo thẻ đóng ``` đứng dòng riêng và nếu dính chữ giải thích phía sau thì tách ra ngoài khối code
 */
export function normalizeMarkdownFences(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Tách thẻ mở fence dính liền cuối câu: "như sau: ```python" -> "như sau:\n```python"
  text = text.replace(/([^\n])[ \t]*```([a-zA-Z0-9_+#.-]*)/g, '$1\n```$2');

  const lines = text.split('\n');
  const normalizedLines: string[] = [];
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inCode) {
      if (trimmed.startsWith('```')) {
        inCode = true;
        const rest = trimmed.slice(3).trim();
        const langMatch = rest.match(/^([a-zA-Z0-9_+#.-]*)(?:[ \t]+([^\n]+))?$/);
        const lang = (langMatch && langMatch[1]) ? langMatch[1] : '';
        const inlineCode = (langMatch && langMatch[2]) ? langMatch[2] : '';
        normalizedLines.push(`\`\`\`${lang}`);
        if (inlineCode.length > 0) {
          normalizedLines.push(inlineCode);
        }
      } else {
        normalizedLines.push(line);
      }
    } else {
      if (trimmed.startsWith('```')) {
        inCode = false;
        const trailing = trimmed.slice(3).trim();
        normalizedLines.push('```');
        if (trailing.length > 0) {
          normalizedLines.push(trailing);
        }
      } else {
        normalizedLines.push(line);
      }
    }
  }

  return normalizedLines.join('\n');
}

/**
 * Bộ phân tích cú pháp khối Markdown tự chủ (Zero External Bundler Dependencies)
 * Sử dụng State Machine tuần tự theo dòng bảo vệ trọn vẹn khối mã
 */
export function parseMarkdownBlocks(rawText: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const normalizedText = normalizeMarkdownFences(rawText || '');
  const lines = normalizedText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Khối Code: ```lang ... ```
    if (trimmed.startsWith('```')) {
      const rest = trimmed.slice(3).trim();
      const langMatch = rest.match(/^([a-zA-Z0-9_+#.-]*)/);
      const language = (langMatch && langMatch[1]) ? langMatch[1] : '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        const trailing = lines[i].trim().slice(3).trim();
        if (trailing.length > 0) {
          lines[i] = trailing; // Lượt lặp sau sẽ phân tích chữ giải thích
        } else {
          i++; // Bỏ qua dòng đóng ```
        }
      }
      const rawCode = codeLines.join('\n');

      // Cấm render khung CODE rỗng nếu không có dòng mã nào
      if (rawCode.trim().length > 0) {
        const formatted = formatCodeForDisplay(rawCode, language);
        const code = formatted.endsWith('\n') ? formatted : formatted + '\n';
        const actualLines = code.split('\n');
        const validLineCount = actualLines.length > 1 && actualLines[actualLines.length - 1] === ''
          ? actualLines.length - 1
          : actualLines.length;

        blocks.push({
          type: 'code',
          language: language.toUpperCase() || 'CODE',
          code,
          lineCount: Math.max(validLineCount, 1),
        });
      }
      continue;
    }

    // 2. Khối Công thức Toán học: $$ ... $$
    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 2 && trimmed.endsWith('$$')) {
        const formula = trimmed.slice(2, -2).trim();
        blocks.push({ type: 'math', formula });
        i++;
        continue;
      } else {
        const mathLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && lines[i].trim().endsWith('$$')) {
          const lastLine = lines[i].trim().replace(/\$\$$/, '');
          if (lastLine) mathLines.push(lastLine);
          i++;
        }
        blocks.push({ type: 'math', formula: mathLines.join(' ').trim() });
        continue;
      }
    }

    // 3. Khối Bảng Biểu: | Cột 1 | Cột 2 | kèm dòng |---|---|
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      /^\|[-:| ]+\|$/.test(lines[i + 1].trim())
    ) {
      const headerLine = trimmed;
      const separatorLine = lines[i + 1].trim();
      const headers = splitMarkdownTableRow(headerLine);
      i += 2; // Bỏ qua header và dòng gạch
      const rows: string[][] = [];
      const tableRawLines = [headerLine, separatorLine];

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const rowLine = lines[i].trim();
        tableRawLines.push(rowLine);
        const cells = splitMarkdownTableRow(rowLine);
        rows.push(cells);
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        rows,
        rawText: tableRawLines.join('\n'),
      });
      continue;
    }

    // 4. Tiêu đề: #, ##, ###
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({
        type: 'heading',
        level,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 5. Khối trích dẫn: > quote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n'),
      });
      continue;
    }

    // 6. Danh sách gạch đầu dòng: - item, * item, • item
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'bullet_list',
        items,
      });
      continue;
    }

    // 7. Danh sách đánh số: 1. item
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (m) {
          items.push({ num: m[1], text: m[2] });
        }
        i++;
      }
      blocks.push({
        type: 'numbered_list',
        items,
      });
      continue;
    }

    // 8. Dòng trống
    if (!trimmed) {
      i++;
      continue;
    }

    // 9. Đoạn văn (Paragraph)
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('$$') &&
      !(
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|') &&
        i + 1 < lines.length &&
        /^\|[-:| ]+\|$/.test(lines[i + 1].trim())
      ) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: 'paragraph',
      text: paraLines.join('\n'),
    });
  }

  return blocks;
}

/**
 * Phân tích phần tử nội dòng: bold, italic, code, math, links
 */
interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'math' | 'link';
  text: string;
  url?: string;
}

export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  if (!text) return tokens;

  // Regex nhận diện các token nội dòng: ưu tiên $$...$$ trước $...$, hỗ trợ cả **...** lẫn __...__
  const INLINE_REGEX = /(\$\$[^$\n]+\$\$|\$[^$\n]+\$|`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(INLINE_REGEX);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      tokens.push({
        type: 'math',
        text: convertLatexToUnicode(part.slice(2, -2)),
      });
    } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      tokens.push({
        type: 'math',
        text: convertLatexToUnicode(part.slice(1, -1)),
      });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push({
        type: 'code',
        text: part.slice(1, -1),
      });
    } else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (match) {
        tokens.push({
          type: 'link',
          text: match[1],
          url: match[2],
        });
      } else {
        tokens.push({ type: 'text', text: part });
      }
    } else if (/^https?:\/\/[^\s)]+$/.test(part)) {
      tokens.push({
        type: 'link',
        text: part,
        url: part,
      });
    } else if (
      (part.startsWith('**') && part.endsWith('**') && part.length > 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length > 4)
    ) {
      tokens.push({
        type: 'bold',
        text: part.slice(2, -2),
      });
    } else if (
      (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    ) {
      tokens.push({
        type: 'italic',
        text: part.slice(1, -1),
      });
    } else {
      tokens.push({
        type: 'text',
        text: part,
      });
    }
  }

  return tokens;
}

// Tô màu nhẹ cho các dòng mã nguồn
function highlightCodeLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
    return <Text style={{ color: '#8B949E', fontStyle: 'italic' }}>{line}</Text>;
  }

  const TOKEN_REGEX = /(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:const|let|var|function|return|import|export|from|if|else|for|while|switch|case|break|async|await|class|type|interface|def|self|print|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)\b|\b(?:true|false|null|undefined|\d+)\b)/g;
  const parts = line.split(TOKEN_REGEX);

  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('//') || part.startsWith('#')) {
      return <Text key={idx} style={{ color: '#8B949E', fontStyle: 'italic' }}>{part}</Text>;
    }
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('`') && part.endsWith('`'))
    ) {
      return <Text key={idx} style={{ color: '#A5D6FF' }}>{part}</Text>;
    }
    if (
      /^(const|let|var|function|return|import|export|from|if|else|for|while|switch|case|break|async|await|class|type|interface|def|self|print|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)$/.test(
        part
      )
    ) {
      return <Text key={idx} style={{ color: '#FF7B72', fontWeight: '600' }}>{part}</Text>;
    }
    if (/^(true|false|null|undefined|\d+)$/.test(part)) {
      return <Text key={idx} style={{ color: '#79C0FF' }}>{part}</Text>;
    }
    return <Text key={idx} style={{ color: '#E6EDF3' }}>{part}</Text>;
  });
}

/**
 * Component Khối Code chuẩn phong cách macOS Terminal kèm Nút Copy 1 Chạm
 */
interface CodeBlockViewProps {
  language: string;
  code: string;
  lineCount: number;
  theme: ThemeColors;
  compact?: boolean;
}

const CodeBlockView: React.FC<CodeBlockViewProps> = ({ language, code, lineCount, compact }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = code.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return (
    <View style={styles.codeBlockWrapper}>
      {/* Header macOS Terminal */}
      <View style={styles.codeHeader}>
        <View style={styles.macOsControls}>
          <View style={[styles.macDot, { backgroundColor: '#FF5F56' }]} />
          <View style={[styles.macDot, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.macDot, { backgroundColor: '#27C93F' }]} />
          <Text
            style={[styles.codeLangText, compact && { fontSize: 10 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {language} • {lineCount} {lineCount > 1 ? 'DÒNG' : 'DÒNG'}
          </Text>
        </View>

        {/* Nút Copy 1 chạm */}
        <Pressable
          style={({ pressed }) => [
            styles.copyCodeBtn,
            pressed && { opacity: 0.75 },
            Platform.OS === 'web' && ({ cursor: 'pointer', transition: 'all 0.15s ease' } as any),
          ]}
          onPress={handleCopy}
          hitSlop={6}
        >
          <Text style={[styles.copyCodeText, copied && { color: '#10B981', fontWeight: '700' }]}>
            {copied ? '✓ Đã chép' : '📋 Sao chép'}
          </Text>
        </Pressable>
      </View>

      {/* Nội dung Code cuộn ngang mượt mà */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        style={styles.codeScrollView}
        contentContainerStyle={styles.codeScrollContent}
      >
        <View style={styles.codeContainer}>
          {/* Cột số dòng */}
          <View style={styles.lineNumbersCol}>
            {lines.map((_, idx) => (
              <Text
                key={`line-num-${idx}`}
                style={[styles.lineNumberText, compact && { fontSize: 11, lineHeight: 19 }]}
              >
                {idx + 1}
              </Text>
            ))}
          </View>

          {/* Các dòng code tô màu */}
          <View style={styles.codeLinesCol}>
            {lines.map((line, idx) => (
              <Text
                key={`code-line-${idx}`}
                style={[styles.codeLineText, compact && { fontSize: 12.5, lineHeight: 19 }]}
              >
                {line.length === 0 ? ' ' : highlightCodeLine(line)}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

/**
 * Component Bảng Biểu Dữ Liệu Grid chuẩn Markdown kèm Nút Copy Bảng (TSV)
 */
interface TableViewProps {
  headers: string[];
  rows: string[][];
  theme: ThemeColors;
  renderInline?: (text: string) => React.ReactNode;
}

const TableView: React.FC<TableViewProps> = ({ headers, rows, theme, renderInline }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyTable = async () => {
    // Chép dưới dạng TSV (Tab Separated Values) chuẩn để dán sang Excel / Google Sheets / Notion
    const tsvLines = [
      headers.join('\t'),
      ...rows.map((r) => r.join('\t')),
    ].join('\n');

    const ok = await copyToClipboard(tsvLines);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isDark = theme.mode === 'dark';
  const tableBorderColor = isDark ? '#30363D' : '#E2E8F0';
  const headerBg = isDark ? '#1E293B' : '#F1F5F9';
  const headerTextColor = isDark ? '#F1F5F9' : '#0F172A';
  const cellTextColor = isDark ? '#E2E8F0' : '#1E293B';

  return (
    <View style={[styles.tableWrapper, { borderColor: tableBorderColor }]}>
      {/* Header bar nhỏ chứa nhãn Bảng và Nút Copy */}
      <View style={[styles.tableTopBar, { backgroundColor: isDark ? '#161B22' : '#F8FAFC', borderColor: tableBorderColor }]}>
        <Text style={[styles.tableLabel, { color: theme.textMuted }]}>BẢNG DỮ LIỆU</Text>
        <Pressable
          style={({ pressed }) => [
            styles.copyTableBtn,
            pressed && { opacity: 0.75 },
            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
          ]}
          onPress={handleCopyTable}
          hitSlop={6}
        >
          <Text style={[styles.copyTableText, copied && { color: '#10B981', fontWeight: '700' }]}>
            {copied ? '✓ Đã chép bảng' : '📋 Copy bảng'}
          </Text>
        </Pressable>
      </View>

      {/* Grid bảng cuộn ngang mượt mà */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScrollView}>
        <View style={styles.tableGrid}>
          {/* Header row */}
          <View style={[styles.tableRow, { backgroundColor: headerBg }]}>
            {headers.map((header, hIdx) => (
              <View key={`th-${hIdx}`} style={[styles.tableHeaderCell, { borderRightColor: tableBorderColor }]}>
                <Text style={[styles.tableHeaderText, { color: headerTextColor }]}>
                  {renderInline ? renderInline(header) : header}
                </Text>
              </View>
            ))}
          </View>

          {/* Data rows kèm zebra striping */}
          {rows.map((row, rIdx) => {
            const rowBg =
              rIdx % 2 === 0
                ? isDark ? '#0D1117' : '#FFFFFF'
                : isDark ? '#161F30' : '#F8FAFC';
            return (
              <View key={`tr-${rIdx}`} style={[styles.tableRow, { backgroundColor: rowBg, borderTopColor: tableBorderColor }]}>
                {row.map((cell, cIdx) => (
                  <View key={`td-${rIdx}-${cIdx}`} style={[styles.tableCell, { borderRightColor: tableBorderColor }]}>
                    <Text style={[styles.tableCellText, { color: cellTextColor }]}>
                      {renderInline ? renderInline(cell) : cell}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

/**
 * Component Khối Công thức Toán học Khoa học ($$...$$)
 */
interface MathBlockViewProps {
  formula: string;
  theme: ThemeColors;
}

const MathBlockView: React.FC<MathBlockViewProps> = ({ formula, theme }) => {
  const isDark = theme.mode === 'dark';
  const unicodeFormula = convertLatexToUnicode(formula);

  return (
    <View
      style={[
        styles.mathBlockWrapper,
        {
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.06)',
          borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)',
        },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mathScrollContent}>
        <Text style={[styles.mathBlockText, { color: isDark ? '#E0E7FF' : '#3730A3' }]}>
          {unicodeFormula}
        </Text>
      </ScrollView>
    </View>
  );
};

/**
 * Component Render Rich Markdown Toàn Diện cho Tomorrow
 */
interface RichMarkdownViewProps {
  content: string;
  theme: ThemeColors;
  defaultTextColor?: string;
  onOpenUrl?: (url: string) => void;
  compact?: boolean;
}

export const RichMarkdownView: React.FC<RichMarkdownViewProps> = ({
  content,
  theme,
  defaultTextColor,
  onOpenUrl,
  compact = false,
}) => {
  const textColor = defaultTextColor || (theme.mode === 'dark' ? theme.textAI : theme.textUser);
  const isDark = theme.mode === 'dark';
  const linkColor = isDark ? '#60A5FA' : '#2563EB';
  const inlineCodeBg = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)';
  const inlineCodeColor = isDark ? '#F472B6' : '#DB2777';

  const handleOpenUrl = (url?: string) => {
    if (!url) return;
    if (onOpenUrl) {
      onOpenUrl(url);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch((err) => console.warn('Không thể mở URL:', err));
    }
  };

  const renderInline = (text: string) => {
    const tokens = parseInlineMarkdown(text);
    return tokens.map((token, idx) => {
      if (token.type === 'bold') {
        return (
          <Text key={`b-${idx}`} style={{ fontWeight: '700' }}>
            {token.text}
          </Text>
        );
      }
      if (token.type === 'italic') {
        return (
          <Text key={`i-${idx}`} style={{ fontStyle: 'italic' }}>
            {token.text}
          </Text>
        );
      }
      if (token.type === 'code') {
        return (
          <Text
            key={`c-${idx}`}
            style={[
              styles.inlineCode,
              compact && { fontSize: 12.5 },
              {
                backgroundColor: inlineCodeBg,
                color: inlineCodeColor,
              },
            ]}
          >
            {token.text}
          </Text>
        );
      }
      if (token.type === 'math') {
        return (
          <Text
            key={`m-${idx}`}
            style={[
              styles.inlineMath,
              compact && { fontSize: 13.5 },
              { color: isDark ? '#C7D2FE' : '#4338CA' },
            ]}
          >
            {token.text}
          </Text>
        );
      }
      if (token.type === 'link') {
        return (
          <Text
            key={`l-${idx}`}
            style={{
              color: linkColor,
              textDecorationLine: 'underline',
              fontWeight: '600',
              fontSize: compact ? 13.5 : 15,
            }}
            onPress={() => handleOpenUrl(token.url || token.text)}
          >
            {token.text}
          </Text>
        );
      }
      return <Text key={`t-${idx}`} style={compact ? { fontSize: 14, lineHeight: 21 } : undefined}>{token.text}</Text>;
    });
  };

  const blocks = parseMarkdownBlocks(content);

  return (
    <View style={styles.richContainer}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <CodeBlockView
              key={`block-code-${bIdx}`}
              language={block.language}
              code={block.code}
              lineCount={block.lineCount}
              theme={theme}
              compact={compact}
            />
          );
        }

        if (block.type === 'table') {
          return (
            <TableView
              key={`block-table-${bIdx}`}
              headers={block.headers}
              rows={block.rows}
              theme={theme}
              renderInline={renderInline}
            />
          );
        }

        if (block.type === 'math') {
          return (
            <MathBlockView
              key={`block-math-${bIdx}`}
              formula={block.formula}
              theme={theme}
            />
          );
        }

        if (block.type === 'heading') {
          const headingStyles = [
            styles.headingBase,
            block.level === 1 && (compact ? { fontSize: 17, lineHeight: 24, marginVertical: 4 } : styles.h1),
            block.level === 2 && (compact ? { fontSize: 15.5, lineHeight: 22, marginVertical: 3 } : styles.h2),
            block.level === 3 && (compact ? { fontSize: 14.5, lineHeight: 21, marginVertical: 2 } : styles.h3),
            { color: textColor },
          ];
          return (
            <Text key={`block-heading-${bIdx}`} style={headingStyles}>
              {renderInline(block.text)}
            </Text>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <View
              key={`block-quote-${bIdx}`}
              style={[
                styles.blockquoteWrapper,
                compact && { paddingHorizontal: 9, paddingVertical: 5, marginVertical: 4 },
                {
                  borderLeftColor: '#3B82F6',
                  backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
                },
              ]}
            >
              <Text style={[styles.blockquoteText, compact && { fontSize: 13.5, lineHeight: 20 }, { color: textColor }]}>
                {renderInline(block.text)}
              </Text>
            </View>
          );
        }

        if (block.type === 'bullet_list') {
          return (
            <View key={`block-blist-${bIdx}`} style={[styles.listWrapper, compact && { marginVertical: 2 }]}>
              {block.items.map((item, itemIdx) => (
                <View key={`bli-${itemIdx}`} style={styles.listItemRow}>
                  <Text style={[styles.bulletDot, { color: linkColor }]}>•</Text>
                  <Text style={[styles.listItemText, compact && { fontSize: 13.5, lineHeight: 20 }, { color: textColor }]}>
                    {renderInline(item)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        if (block.type === 'numbered_list') {
          return (
            <View key={`block-nlist-${bIdx}`} style={[styles.listWrapper, compact && { marginVertical: 2 }]}>
              {block.items.map((item, itemIdx) => (
                <View key={`nli-${itemIdx}`} style={styles.listItemRow}>
                  <Text style={[styles.numberPrefix, compact && { fontSize: 13, lineHeight: 20 }, { color: linkColor }]}>
                    {item.num}.
                  </Text>
                  <Text style={[styles.listItemText, compact && { fontSize: 13.5, lineHeight: 20 }, { color: textColor }]}>
                    {renderInline(item.text)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        // Paragraph mặc định
        return (
          <Text
            key={`block-para-${bIdx}`}
            style={[
              styles.paragraph,
              compact && { fontSize: 14, lineHeight: 21, marginVertical: 2 },
              { color: textColor },
            ]}
          >
            {renderInline(block.text)}
          </Text>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  richContainer: {
    width: '100%',
  },
  paragraph: {
    fontSize: 15.5,
    lineHeight: 23,
    letterSpacing: -0.1,
    marginVertical: 3,
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        : undefined,
  },
  inlineCode: {
    fontFamily:
      Platform.OS === 'web'
        ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
        : undefined,
    fontSize: 13.5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    fontWeight: '500',
  },
  inlineMath: {
    fontFamily:
      Platform.OS === 'web'
        ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
        : undefined,
    fontSize: 14.5,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  headingBase: {
    fontFamily:
      Platform.OS === 'web'
        ? "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        : undefined,
    letterSpacing: -0.3,
  },
  h1: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  h2: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: 7,
    marginBottom: 3,
  },
  h3: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  blockquoteWrapper: {
    borderLeftWidth: 3.5,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginVertical: 6,
  },
  blockquoteText: {
    fontSize: 14.5,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  listWrapper: {
    marginVertical: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 22,
    width: 16,
    textAlign: 'center',
    marginRight: 6,
  },
  numberPrefix: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    minWidth: 20,
    marginRight: 6,
  },
  listItemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22.5,
  },
  codeBlockWrapper: {
    backgroundColor: '#0D1117',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363D',
    marginVertical: 6,
    overflow: 'hidden',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  codeHeader: {
    height: 34,
    backgroundColor: '#161B22',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#30363D',
    minWidth: 0,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as any) : {}),
  },
  macOsControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  macDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  codeLangText: {
    color: '#8B949E',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  copyCodeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  copyCodeText: {
    color: '#C9D1D9',
    fontSize: 11.5,
    fontWeight: '500',
  },
  codeScrollView: {
    width: '100%',
  },
  codeScrollContent: {
    paddingVertical: 10,
  },
  codeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
  },
  lineNumbersCol: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#30363D',
    alignItems: 'flex-end',
    minWidth: 28,
  },
  lineNumberText: {
    color: '#6E7681',
    fontFamily:
      Platform.OS === 'web'
        ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
        : undefined,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'right',
  },
  codeLinesCol: {
    paddingLeft: 12,
    paddingRight: 16,
  },
  codeLineText: {
    fontFamily:
      Platform.OS === 'web'
        ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
        : undefined,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#E6EDF3',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'pre' } as any) : {}),
  },
  tableWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
    overflow: 'hidden',
    width: '100%',
  },
  tableTopBar: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  tableLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  copyTableBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  copyTableText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  tableScrollView: {
    width: '100%',
  },
  tableGrid: {
    minWidth: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
  },
  tableHeaderCell: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRightWidth: 1,
    minWidth: 110,
    justifyContent: 'center',
  },
  tableHeaderText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  tableCell: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRightWidth: 1,
    minWidth: 110,
    justifyContent: 'center',
  },
  tableCellText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  mathBlockWrapper: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#6366F1',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mathScrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  mathBlockText: {
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    textAlign: 'center',
    fontFamily:
      Platform.OS === 'web'
        ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
        : undefined,
  },
});
