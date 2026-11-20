// services/microPsychProfiler.ts — Tomorrow Day 9 On-Device Micro-Psychology Profiler
// Chạy cục bộ 100% trên thiết bị (< 1ms), giải mã DNA ngôn ngữ & nhịp gõ để phản hồi thấu cảm

export interface KeystrokeTelemetry {
  typingDurationMs: number;
  charsPerSecond: number;
  backspaceCount: number;
  backspaceRatio: number; // backspaceCount / max(1, totalKeystrokes)
  burstCount: number;     // số tin nhắn user gửi liên tiếp trong 12 giây gần nhất
}

export type CaseStyle = 'ALL_LOWERCASE' | 'ALL_CAPS' | 'STANDARD';
export type PunctuationStyle = 'NO_END_DOT' | 'ELLIPSIS_HEAVY' | 'EXCLAMATION_BURST' | 'FORMAL';
export type DiacriticsMode = 'UNACCENTED' | 'ACCENTED';
export type BrevityLevel = 'ULTRA_SHORT' | 'SHORT' | 'MEDIUM' | 'LONG_VENT';
export type HesitationLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type PsychState =
  | 'STRESSED_OVERWHELMED'
  | 'MASKED_SADNESS'
  | 'LOW_DOWN_DEFLATED'
  | 'IRRITATED_BLUNT'
  | 'EXCITED_HYPED'
  | 'FOCUSED_ANALYTICAL'
  | 'NEUTRAL_CASUAL';

export interface LinguisticStyle {
  caseStyle: CaseStyle;
  punctuationStyle: PunctuationStyle;
  diacriticsMode: DiacriticsMode;
  slangHits: string[];
  hasSlang: boolean;
  brevityLevel: BrevityLevel;
  wordCount: number;
}

export interface CadenceMetrics {
  speedLabel: string;
  hesitationLevel: HesitationLevel;
  burstCount: number;
  charsPerSecond: number;
  typingDurationMs: number;
  backspaceRatio: number;
}

export interface MicroPsychProfile {
  linguisticStyle: LinguisticStyle;
  cadence: CadenceMetrics;
  psychState: PsychState;
  mirrorHint: string;
  directiveTag: string;
}

const COMMON_SLANGS = [
  't', 'm', 'k', 'ko', 'r', 'dc', 'đc', 'vl', 'vcl', 'bt', 'ntn',
  'oke', 'okie', 'okii', ':3', ':)', ':(', ':))', '=)))', 'haiz', 'hic',
  'uk', 'ừa', 'cl', 'vch', 'vc', 'dmm', 'dit', 'ngon', 'cháy', 'đỉnh'
];

const UNACCENTED_INDICATORS = [
  'khong', 'ko', 'duoc', 'met qua', 'chan vl', 'sao the', 'the nao',
  'dang lam', 'dung roi', 'chua ngu', 'buon qua', 'thuc khuya', 'on ma',
  'k sao', 'k sao dau', 'biet roi', 'co gi', 'gi do', 'chac la', 'nay gio'
];

/**
 * 1. GIẢI MÃ DNA NGÔN NGỮ (Linguistic Style)
 */
export function extractLinguisticStyle(text: string): LinguisticStyle {
  const trimmed = (text || '').trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // A. Brevity Level
  let brevityLevel: BrevityLevel = 'SHORT';
  if (wordCount <= 4) brevityLevel = 'ULTRA_SHORT';
  else if (wordCount <= 15) brevityLevel = 'SHORT';
  else if (wordCount <= 35) brevityLevel = 'MEDIUM';
  else brevityLevel = 'LONG_VENT';

  // B. Case Style
  const lettersOnly = trimmed.replace(/[^a-zA-Zà-ỹÀ-ỸđĐ]/g, '');
  let caseStyle: CaseStyle = 'STANDARD';
  if (lettersOnly.length > 0) {
    if (lettersOnly === lettersOnly.toLowerCase()) {
      caseStyle = 'ALL_LOWERCASE';
    } else if (lettersOnly.length >= 3 && lettersOnly === lettersOnly.toUpperCase()) {
      caseStyle = 'ALL_CAPS';
    }
  }

  // C. Punctuation Style
  let punctuationStyle: PunctuationStyle = 'NO_END_DOT';
  if (/!{2,}/.test(trimmed) || /!$/.test(trimmed)) {
    punctuationStyle = 'EXCLAMATION_BURST';
  } else if (/\.{2,}/.test(trimmed) || /\.\.$/.test(trimmed)) {
    punctuationStyle = 'ELLIPSIS_HEAVY';
  } else if (/\.$/.test(trimmed) && trimmed[0] && trimmed[0] === trimmed[0].toUpperCase()) {
    punctuationStyle = 'FORMAL';
  } else if (!/\.$/.test(trimmed)) {
    punctuationStyle = 'NO_END_DOT';
  }

  // D. Diacritics Mode
  const hasAccents = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/.test(trimmed);
  let diacriticsMode: DiacriticsMode = 'ACCENTED';
  if (!hasAccents && lettersOnly.length > 0) {
    const lowerTrimmed = trimmed.toLowerCase();
    const isUnaccentedVietnamese = UNACCENTED_INDICATORS.some((w) => lowerTrimmed.includes(w)) ||
      words.some((w) => ['k', 'ko', 'dc', 't', 'm', 'r', 'vl', 'bt', 'ngon', 'chan', 'met'].includes(w.toLowerCase()));
    if (isUnaccentedVietnamese || words.length >= 3) {
      diacriticsMode = 'UNACCENTED';
    }
  }

  // E. Slang Hits
  const lowerWords = trimmed.toLowerCase().split(/[\s,.;!?~()]+/);
  const slangHits: string[] = [];
  const lowerTrimmed = trimmed.toLowerCase();

  for (const s of COMMON_SLANGS) {
    if (s.startsWith(':') || s.startsWith('=')) {
      if (trimmed.includes(s)) slangHits.push(s);
    } else {
      if (lowerWords.includes(s) || lowerTrimmed.includes(` ${s} `) || lowerTrimmed.startsWith(`${s} `) || lowerTrimmed.endsWith(` ${s}`)) {
        if (!slangHits.includes(s)) slangHits.push(s);
      }
    }
  }

  return {
    caseStyle,
    punctuationStyle,
    diacriticsMode,
    slangHits,
    hasSlang: slangHits.length > 0,
    brevityLevel,
    wordCount,
  };
}

/**
 * 2. GIẢI MÃ NHỊP GÕ & TÂM LÝ NGẦM (< 1ms)
 */
export function analyzeMicroPsychology(
  userText: string,
  telemetry?: Partial<KeystrokeTelemetry>,
  recentHistory: any[] = []
): MicroPsychProfile {
  const trimmed = (userText || '').trim();
  const lower = trimmed.toLowerCase();
  const style = extractLinguisticStyle(trimmed);

  // Chuẩn hóa chỉ số nhịp gõ
  const typingDurationMs = telemetry?.typingDurationMs ?? 1500;
  const backspaceCount = telemetry?.backspaceCount ?? 0;
  const backspaceRatio = telemetry?.backspaceRatio ?? 0;
  const burstCount = telemetry?.burstCount ?? 1;
  const charsPerSecond = telemetry?.charsPerSecond ?? (
    typingDurationMs > 0 ? Number(((trimmed.length / (typingDurationMs / 1000))).toFixed(1)) : 4.0
  );

  // Hesitation Level
  let hesitationLevel: HesitationLevel = 'LOW';
  if (backspaceRatio >= 0.25 || (typingDurationMs > 8000 && trimmed.length < 35)) {
    hesitationLevel = 'HIGH';
  } else if (backspaceRatio >= 0.12) {
    hesitationLevel = 'MEDIUM';
  }

  // Speed Label
  let speedLabel = 'NORMAL_PACE';
  if (charsPerSecond >= 7.5) {
    speedLabel = 'BURST_FAST';
  } else if (charsPerSecond <= 2.2) {
    speedLabel = 'SLOW_HESITANT';
  }

  // Quét lịch sử 2 tin gần nhất tìm sắc thái tiêu cực/buồn/mệt
  const last2UserMessages = (recentHistory || [])
    .filter((m: any) => m.role === 'user' || m.sender === 'user')
    .slice(-2);
  const pastSadnessOrFatigue = last2UserMessages.some((m: any) => {
    const txt = ((m.text || '') as string).toLowerCase();
    return /buồn|chán|mệt|haiz|nản|áp lực|tụt mood|khóc|\:\(|\:\(\(/i.test(txt);
  });

  // PHÂN LOẠI 7 TRẠNG THÁI TÂM LÝ (psychState)
  let psychState: PsychState = 'NEUTRAL_CASUAL';
  let mirrorHint = 'Trò chuyện tự nhiên, tinh tế, bắt chước style chữ thường và slang.';

  // 1. MASKED SADNESS (Phòng vệ cảm xúc / buồn ngầm)
  const isMaskedSadPhrase =
    /^(ổn mà|on ma|k sao đâu|k sao dau|ko sao dau|không sao đâu|khong sao dau|không sao|khong sao|k sao|bt thôi|bt thoi|bình thường thôi|chắc t ổn|chac t on|t ổn|t on)[.!?~ ]*$/i.test(lower) ||
    /(ổn mà|k sao đâu|không sao|bt thôi|chắc t ổn)\.\.\.?/i.test(lower);

  if (
    isMaskedSadPhrase &&
    (hesitationLevel === 'HIGH' || style.punctuationStyle === 'ELLIPSIS_HEAVY' || charsPerSecond <= 2.8 || pastSadnessOrFatigue)
  ) {
    psychState = 'MASKED_SADNESS';
    mirrorHint = 'Nhẹ nhàng bên cạnh, nhận diện nỗi buồn ẩn, không dồn dập phỏng vấn.';
  }
  // 2. STRESSED OVERWHELMED (Áp lực / quá tải / deadline)
  else if (
    /\b(deadline|bug|áp lực|ap luc|nổ não|no nao|căng|cang|quá tải|qua tai|mệt vl|met vl|stress|cháy deadline)\b/i.test(lower) ||
    (burstCount >= 3 && /mệt|chán|lo|sợ|gấp|áp lực/i.test(lower)) ||
    (style.brevityLevel === 'LONG_VENT' && /mệt|áp lực|lo|sợ|không kịp|bất lực/i.test(lower))
  ) {
    psychState = 'STRESSED_OVERWHELMED';
    mirrorHint = 'Bình tĩnh, dịu giọng, thẳng vào giải pháp thực tế, giảm áp lực.';
  }
  // 3. LOW DOWN DEFLATED (Tụt mood, kiệt sức, buồn)
  else if (
    /\b(chán|buồn|mệt mỏi|haiz|cô đơn|tụt mood|nản|mệt quá|đuối|bất lực)\b/i.test(lower) ||
    lower.includes(':(') ||
    lower.includes(':-( ') ||
    (style.punctuationStyle === 'ELLIPSIS_HEAVY' && charsPerSecond <= 2.2 && /mệt|thôi|chán/i.test(lower))
  ) {
    psychState = 'LOW_DOWN_DEFLATED';
    mirrorHint = 'Ấm áp, thấu cảm, xoa dịu ngắn gọn, không giáo điều lý thuyết.';
  }
  // 4. EXCITED HYPED (Phấn khích, vui vẻ, thành công)
  else if (
    /\b(xong r|xong roi|ngon|đỉnh|dinh|cháy|chay|quá đã|qua da|hehe|haha|siêu phẩm|vcl đỉnh|đỉnh vl|dinh vl)\b/i.test(lower) ||
    lower.includes('=)))') ||
    lower.includes(':))') ||
    (style.punctuationStyle === 'EXCLAMATION_BURST' && (charsPerSecond >= 6.0 || /xong|được rồi|thắng|chiến|ổn rồi/i.test(lower)))
  ) {
    psychState = 'EXCITED_HYPED';
    mirrorHint = 'Hào hứng chung vui, dùng nhịp tươi sáng, tương thích năng lượng tích cực.';
  }
  // 5. IRRITATED BLUNT (Bực bội, gắt gỏng, cay cú)
  else if (
    /\b(bực|cay|tức|điên|ức chế|tức vl|cay vl|khó chịu|cút|sybau)\b/i.test(lower) ||
    (style.caseStyle === 'ALL_CAPS' && (style.punctuationStyle === 'EXCLAMATION_BURST' || /BỰC|CAY|TỨC|ĐIÊN|ỨC CHẾ/.test(trimmed)))
  ) {
    psychState = 'IRRITATED_BLUNT';
    mirrorHint = 'Bình tĩnh, đứng về phía họ giải tỏa ức chế, không lý sự cùn.';
  }
  // 6. FOCUSED ANALYTICAL (Tập trung chuyên môn kỹ thuật / code / logic)
  else if (
    /```|function|const |class |import |def |thuật toán|toán|công thức|phương trình|kiến trúc|tối ưu|database|sql|api|backend/i.test(trimmed)
  ) {
    psychState = 'FOCUSED_ANALYTICAL';
    mirrorHint = 'Sắc bén, logic cao, trực diện cấu trúc kỹ thuật, mạch lạc chính xác.';
  }
  // 7. NEUTRAL CASUAL (Mặc định)
  else {
    psychState = 'NEUTRAL_CASUAL';
    mirrorHint = 'Trò chuyện tự nhiên, tinh tế, bắt chước style chữ thường và slang.';
  }

  // Thẻ directive Tag 1 dòng gọn đẹp
  const directiveTag = `[PSYCH: STATE=${psychState} | STYLE=${style.caseStyle},${style.punctuationStyle},slang=${style.hasSlang},unaccented=${style.diacriticsMode === 'UNACCENTED'} | CADENCE=${speedLabel},hesitation=${hesitationLevel},burst=${burstCount} | HINT=${mirrorHint}]`;

  return {
    linguisticStyle: style,
    cadence: {
      speedLabel,
      hesitationLevel,
      burstCount,
      charsPerSecond,
      typingDurationMs,
      backspaceRatio,
    },
    psychState,
    mirrorHint,
    directiveTag,
  };
}
