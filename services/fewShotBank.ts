/**
 * DYNAMIC GOLDEN FEW-SHOT BANK (services/fewShotBank.ts)
 * Tomorrow v4.9 — 100% On-Device TypeScript (< 1ms), Token-Efficient Dynamic Injection
 * 
 * Cung cấp bộ ví dụ Few-Shot chuẩn mực nhất được tuyển chọn tinh gọn, phân cụm theo Dual-Persona
 * (COMPANION_MIRROR & JARVIS_LAB) và các nhánh chuyên môn (STEM/Code/Science/Electronics/Finance/Web).
 * Rào chắn nghiêm ngặt: Mỗi khối trả về BẮT BUỘC <= 520 ký tự, không nhồi vào SYSTEM_INSTRUCTION.
 */

import { PersonaMode, ExpertDomain } from './personaRouter';
import { PsychState } from './microPsychProfiler';
import { WebIntelTopic } from './webSearchService';

export type FewShotCluster =
  | 'COMPANION_CASUAL'
  | 'COMPANION_EMPATHY'
  | 'STEM_CODE'
  | 'STEM_SCIENCE'
  | 'STEM_ELECTRONICS'
  | 'FINANCE_QUANT'
  | 'WEB_CITE_LOGIC';

export interface FewShotExample {
  id: string;
  cluster: FewShotCluster;
  user: string;
  assistant: string; // Chuỗi minh họa đầu ra ngắn gọn, đúng chuẩn giọng & cấu trúc JSON replies
  rationale: string; // Quy tắc ngầm ví dụ này bảo vệ (chỉ dùng cho benchmark, KHÔNG gửi lên API)
}

export interface SelectFewShotParams {
  intentMode?: string;
  persona?: PersonaMode | string;
  expertDomain?: ExpertDomain | string;
  psychState?: PsychState | string;
  webTopic?: WebIntelTopic | string;
  userText?: string;
}

/**
 * BỘ 12 GOLDEN FEW-SHOT EXAMPLES TINH GỌN (100% loại bỏ văn mẫu máy móc)
 */
export const GOLDEN_FEW_SHOT_EXAMPLES: FewShotExample[] = [
  // 1. COMPANION_CASUAL (2 ví dụ)
  {
    id: 'casual_tm_deadline',
    cluster: 'COMPANION_CASUAL',
    user: 'nay chạy deadline mệt vl m ơi',
    assistant: '{"conversation_state":"casual_friend","replies":["thở một nhịp đã m, vướng task nào quăng đây t ngó phụ cho"],"session_title":"Chạy deadline","should_update_title":true,"memory_note":""}',
    rationale: 'Bắt cặp đại từ t - m, chữ thường, không tự gọi bro, đồng nhịp, không giảng đạo lý',
  },
  {
    id: 'casual_sharp_celebrate',
    cluster: 'COMPANION_CASUAL',
    user: 'xong hết việc rồi đỉnh vl m ơi :)))',
    assistant: '{"conversation_state":"casual_friend","replies":["chiến thần dọn task, tắt máy đi làm cốc bia thôi chứ đợi gì nữa :))"],"session_title":"Xong việc","should_update_title":false,"memory_note":""}',
    rationale: 'Chốt nhanh tự nhiên, hóm hỉnh tinh tế dryWitLevel=SHARP khi user hào hứng khoe làm xong việc',
  },

  // 2. COMPANION_EMPATHY (2 ví dụ)
  {
    id: 'empathy_masked_sadness',
    cluster: 'COMPANION_EMPATHY',
    user: 'k sao đâu t ổn mà...',
    assistant: '{"conversation_state":"casual_friend","replies":["không cần gồng đâu m. khi nào muốn nói thì t vẫn ở đây nghe nhé."],"session_title":"Lắng nghe","should_update_title":false,"memory_note":"Tâm trạng chùng xuống"}',
    rationale: 'MASKED_SADNESS: phản hồi trầm nhẹ, đồng cảm tinh tế, tắt hoàn toàn đùa cợt (dryWitLevel=OFF), không hỏi dồn',
  },
  {
    id: 'empathy_stressed_overwhelmed',
    cluster: 'COMPANION_EMPATHY',
    user: 'nhiều bài tập với deadline quá muốn nổ não luôn',
    assistant: '{"conversation_state":"casual_friend","replies":["ngồi thở sâu một hơi đã. trong đống này cái nào gấp nhất t với m gỡ đúng cái đó trước."],"session_title":"Gỡ rối áp lực","should_update_title":true,"memory_note":"Áp lực deadline"}',
    rationale: 'STRESSED_OVERWHELMED: giữ bình tĩnh, công nhận cảm giác trước rồi gỡ đúng 1 nút thắt nhỏ nhất',
  },

  // 3. STEM_CODE (2 ví dụ)
  {
    id: 'code_cpp_delete_array',
    cluster: 'STEM_CODE',
    user: 'int* p = new int[5]; delete p; lỗi gì vậy?',
    assistant: '{"conversation_state":"gemini_expert","replies":["Lỗi UB: cấp phát `new[]` bắt buộc giải phóng bằng `delete[]`.\\n```cpp\\nint* p = new int[5];\\ndelete[] p; // Đúng chuẩn, tránh UB và memory leak\\n```\\n• Độ phức tạp: $O(1)$ thời gian, $O(1)$ phụ trợ."],"session_title":"Sửa lỗi delete mảng C++","should_update_title":true,"memory_note":"C++ Memory Management"}',
    rationale: 'Bắt bug C++/TS: chẩn đoán nguyên nhân gốc ngay dòng 1, code sửa sạch, phân tích O(), không câu kết xã giao',
  },
  {
    id: 'code_cpp_pointer_double',
    cluster: 'STEM_CODE',
    user: 'con trỏ kép int** dùng để làm gì',
    assistant: '{"conversation_state":"gemini_expert","replies":["`int**` lưu địa chỉ của con trỏ trỏ tới số nguyên, dùng để sửa con trỏ từ hàm ngoài hoặc cấp phát mảng 2 chiều.\\n```cpp\\nvoid alloc(int** p) { *p = new int(42); }\\n```"],"session_title":"Con trỏ kép C++","should_update_title":true,"memory_note":"Con trỏ C++"}',
    rationale: 'Giải thích thuật toán/con trỏ ngắn gọn chuẩn JARVIS_LAB',
  },

  // 4. STEM_SCIENCE (2 ví dụ)
  {
    id: 'science_physics_mechanics',
    cluster: 'STEM_SCIENCE',
    user: 'vật 2kg trượt trên sàn u=0.1, F kéo 10N ngang. tính gia tốc lấy g=10m/s2',
    assistant: '{"conversation_state":"gemini_expert","replies":["Tóm tắt: $m = 2\\text{ kg}, \\mu = 0.1, F = 10\\text{ N}, g = 10\\text{ m/s}^2$.\\n• Lực ma sát: $F_{ms} = \\mu mg = 0.1 \\times 2 \\times 10 = 2\\text{ N}$.\\n• Gia tốc: $a = \\frac{F - F_{ms}}{m} = \\frac{10 - 2}{2} = 4\\text{ m/s}^2$.\\nKiểm tra: $F > F_{ms} \\Rightarrow a > 0$, hợp lý vật lý."],"session_title":"Tính gia tốc vật trượt","should_update_title":true,"memory_note":"Vật lý Động lực học"}',
    rationale: 'Vật lý/Cơ học: tóm tắt dữ kiện -> công thức -> thay số đơn vị SI chuẩn -> kiểm tra tính hợp lý vật lý',
  },
  {
    id: 'science_chem_redox',
    cluster: 'STEM_SCIENCE',
    user: 'cân bằng phản ứng Fe + HNO3 loãng ra NO',
    assistant: '{"conversation_state":"gemini_expert","replies":["Phương trình chuẩn:\\n$$Fe + 4HNO_3 \\text{ (loãng)} \\xrightarrow{t^\\circ} Fe(NO_3)_3 + NO\\uparrow + 2H_2O$$\\n• Oxi hóa - khử: $Fe^0 \\to Fe^{+3} + 3e$; $N^{+5} + 3e \\to N^{+2}$. Tỉ lệ mol $1 : 4$."],"session_title":"Cân bằng Fe + HNO3","should_update_title":true,"memory_note":"Hóa học vô cơ"}',
    rationale: 'Hóa học/Sinh học: phương trình cân bằng chuẩn -> bản chất cốt lõi + điều kiện phản ứng',
  },

  // 5. STEM_ELECTRONICS (1 ví dụ)
  {
    id: 'electronics_led_resistor',
    cluster: 'STEM_ELECTRONICS',
    user: 'nguồn 5V thắp LED đỏ 2V 20mA cần trở bao nhiêu',
    assistant: '{"conversation_state":"gemini_expert","replies":["Điện trở hạn dòng:\\n$$R = \\frac{V_{cc} - V_f}{I_f} = \\frac{5 - 2}{0.02} = 150\\ \\Omega$$\\n• Chuẩn E24: chọn $150\\ \\Omega$ (hoặc $180\\ \\Omega$ cho LED bền hơn).\\n• An toàn: $P = I^2 R = 0.02^2 \\times 150 = 0.06\\text{ W} < 0.25\\text{ W}$, dùng trở 1/4W an toàn; chân dài là Anode (+)."],"session_title":"Tính trở hạn dòng LED","should_update_title":true,"memory_note":"Mạch điện tử cơ bản"}',
    rationale: 'Tính toán mạch/linh kiện: công thức dòng/áp/trở + 1 dòng lưu ý an toàn công suất và cực tính',
  },

  // 6. FINANCE_QUANT (2 ví dụ)
  {
    id: 'finance_student_allocation',
    cluster: 'FINANCE_QUANT',
    user: 'có 20tr tiền sinh viên nên all-in coin nào để x2 trong 1 tháng',
    assistant: '{"conversation_state":"gemini_expert","replies":["Kỳ vọng x2/tháng đi liền rủi ro mất trắng (drawdown 80-100%). Với sinh viên, 20 triệu là quỹ an tâm, không phải tiền cờ bạc.\\n• Phân bổ 2 chiều:\\n  - 3-6 tháng sinh hoạt phí gửi tiết kiệm linh hoạt.\\n  - Chỉ mạo hiểm tối đa 10-20% vào tài sản biến động mạnh."],"session_title":"Quản trị vốn sinh viên","should_update_title":true,"memory_note":"Quản trị rủi ro tài chính"}',
    rationale: 'Đầu tư tiền nhàn rỗi: tách số liệu vs giả định, phân tích 2 chiều Kỳ vọng & Rủi ro, không chắc thắng cảm tính',
  },
  {
    id: 'finance_redteam_sunk_cost',
    cluster: 'FINANCE_QUANT',
    user: 'đã lỡ bỏ 10tr vào dự án này rồi giờ phải bỏ thêm 5tr nữa để gỡ vốn',
    assistant: '{"conversation_state":"gemini_expert","replies":["Ngụy biện chi phí chìm (Sunk Cost Fallacy): 10 triệu đã mất không thể thu hồi, không được làm căn cứ rót thêm tiền.\\n• Red-team khách quan: Giả sử hôm nay bạn bắt đầu từ số 0, bạn có tự nguyện ném 5 triệu vào cơ hội này không? Nếu không, dừng lại ngay để bảo vệ dòng tiền."],"session_title":"Phản biện chi phí chìm","should_update_title":true,"memory_note":"Phản biện logic"}',
    rationale: 'Phản biện logic / Red-Teaming, chỉ thẳng lỗ hổng giả định một cách điềm tĩnh, sắc bén',
  },

  // 7. WEB_CITE_LOGIC (1 ví dụ)
  {
    id: 'web_followup_cite_detail',
    cluster: 'WEB_CITE_LOGIC',
    user: 'trích dẫn kỹ lại tin số 1 đi',
    assistant: '{"conversation_state":"gemini_expert","replies":["Chi tiết mục 1: Jensen Huang xác nhận Nvidia đang mở rộng hợp tác chuỗi cung ứng bán dẫn tại châu Á, bảo đảm nguồn cung cho dòng GPU Blackwell thế hệ mới."],"session_title":"Chi tiết tin 1","should_update_title":false,"memory_note":""}',
    rationale: 'Trích dẫn nối tiếp số thứ tự: đi thẳng vào nội dung mục 1, không dán URL rác, không câu kết máy móc',
  },
];

/**
 * Đóng gói khối Few-Shot thành chuỗi thẻ chuẩn theo format yêu cầu:
 * [FEW_SHOT_REF: cluster=${cluster}]
 * U: ...
 * A: ...
 * Đảm bảo độ dài luôn <= 520 ký tự.
 */
export function formatFewShotBlock(cluster: FewShotCluster, examples: FewShotExample[]): string {
  if (!examples || examples.length === 0) return '';

  const header = `[FEW_SHOT_REF: cluster=${cluster}]`;

  // Thử đóng gói với số lượng ví dụ được cấp (1 hoặc 2)
  const buildText = (list: FewShotExample[]) => {
    const lines = [header];
    for (const ex of list) {
      lines.push(`U: ${ex.user}`);
      lines.push(`A: ${ex.assistant}`);
    }
    return lines.join('\n');
  };

  let result = buildText(examples);

  // Nếu vượt quá ngân sách 520 ký tự và có >= 2 ví dụ -> rút về 1 ví dụ
  if (result.length > 520 && examples.length > 1) {
    result = buildText([examples[0]]);
  }

  // Rào chắn bảo vệ cứng: Tuyệt đối không bao giờ vượt 520 ký tự
  if (result.length > 520) {
    result = result.slice(0, 520);
  }

  return result;
}

/**
 * Định tuyến và chọn lọc Few-Shot động:
 * Chạy 100% cục bộ (< 1ms), 0 API call.
 */
export function selectDynamicFewShot(params: SelectFewShotParams): string {
  const {
    intentMode,
    persona = 'COMPANION_MIRROR',
    expertDomain = 'GENERAL',
    psychState,
    webTopic,
    userText = '',
  } = params;

  // 1. RÀO CHẮN STOP_SIGNAL & PING: Trả về rỗng ngay lập tức (0 token thừa, bảo toàn phản hồi < 0.5s)
  if (intentMode === 'STOP_SIGNAL' || intentMode === 'PING') {
    return '';
  }

  const cleanDomain = String(expertDomain);
  const lowerText = userText.toLowerCase();

  // 2. PHÂN LOẠI CỤM KỊCH BẢN (FewShotCluster)
  let targetCluster: FewShotCluster = 'COMPANION_CASUAL';
  let chosenExamples: FewShotExample[] = [];

  // A. Web Citation Logic (Hỏi nối tiếp, chi tiết tin số X, trích dẫn bài)
  const isWebFollowUp =
    intentMode === 'WEB_INTEL' ||
    webTopic === 'FOLLOWUP_REF' ||
    /(trích dẫn|tin số|tin 1|tin 2|tin 3|bài 1|bài 2|mục 1|mục 2)/i.test(lowerText);

  if (isWebFollowUp) {
    targetCluster = 'WEB_CITE_LOGIC';
    chosenExamples = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'WEB_CITE_LOGIC');
  }
  // B. Companion Empathy (Buồn giấu kín, quá tải áp lực, tâm trạng chùng)
  else if (
    psychState === 'MASKED_SADNESS' ||
    psychState === 'LOW_DOWN_DEFLATED' ||
    (persona === 'COMPANION_MIRROR' && psychState === 'STRESSED_OVERWHELMED') ||
    /(ổn mà|k sao đâu|áp lực|mệt mỏi|quá tải|muốn nổ não)/i.test(lowerText)
  ) {
    targetCluster = 'COMPANION_EMPATHY';
    const empathyList = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'COMPANION_EMPATHY');
    if (psychState === 'MASKED_SADNESS' || lowerText.includes('ổn mà')) {
      // Ưu tiên ví dụ MASKED_SADNESS
      chosenExamples = [empathyList[0]];
    } else {
      // Ưu tiên ví dụ STRESSED_OVERWHELMED
      chosenExamples = [empathyList[1] || empathyList[0]];
    }
  }
  // C. STEM Electronics
  else if (cleanDomain === 'STEM_ELECTRONICS' || /(điện trở|trở hạn dòng|led|mạch|diode|transistor|tụ điện)/i.test(lowerText)) {
    targetCluster = 'STEM_ELECTRONICS';
    chosenExamples = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'STEM_ELECTRONICS');
  }
  // D. STEM Science (Vật lý, Cơ học, Hóa học, Sinh học, Toán)
  else if (
    cleanDomain === 'STEM_PHYSICS_MECH' ||
    cleanDomain === 'STEM_PHYSICS_MECHANICS' ||
    cleanDomain === 'STEM_CHEM_BIO' ||
    cleanDomain === 'STEM_MATH' ||
    /(gia tốc|lực kéo|ma sát|con lắc|phản ứng|cân bằng|hno3|h2so4|tích phân|đạo hàm)/i.test(lowerText)
  ) {
    targetCluster = 'STEM_SCIENCE';
    const scienceList = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'STEM_SCIENCE');
    if (cleanDomain === 'STEM_CHEM_BIO' || /(hóa|phản ứng|cân bằng|fe \+|hno3)/i.test(lowerText)) {
      chosenExamples = [scienceList[1] || scienceList[0]];
    } else {
      chosenExamples = [scienceList[0]];
    }
  }
  // E. Finance Quant (Đầu tư, tiền bạc, phân bổ vốn, phản biện chi phí chìm)
  else if (
    cleanDomain === 'FINANCE_QUANT' ||
    (persona === 'JARVIS_LAB' && /(đầu tư|tiền|sinh viên|all-in|lãi kép|chi phí chìm|gỡ vốn|cổ phiếu|crypto|coin|p\/e)/i.test(lowerText)) ||
    /(20tr|10tr|chi phí chìm|gỡ vốn|all-in)/i.test(lowerText)
  ) {
    targetCluster = 'FINANCE_QUANT';
    const financeList = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'FINANCE_QUANT');
    if (/(lỡ|gỡ vốn|chi phí chìm|bỏ thêm)/i.test(lowerText)) {
      chosenExamples = [financeList[1] || financeList[0]];
    } else {
      chosenExamples = [financeList[0]];
    }
  }
  // F. STEM Code (C++, TypeScript, React, Thuật toán, Bug)
  else if (
    cleanDomain === 'STEM_CODE' ||
    cleanDomain === 'CODE_CS' ||
    (persona === 'JARVIS_LAB' && /(code|bug|c\+\+|typescript|javascript|python|pointer|con trỏ|react|useeffect|segfault)/i.test(lowerText)) ||
    /(int\*|delete|con trỏ|pointer|race condition|useeffect)/i.test(lowerText)
  ) {
    targetCluster = 'STEM_CODE';
    const codeList = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'STEM_CODE');
    if (/(con trỏ kép|int\*\*|giải thích)/i.test(lowerText)) {
      chosenExamples = [codeList[1] || codeList[0]];
    } else {
      chosenExamples = [codeList[0]];
    }
  }
  // G. JARVIS_LAB mặc định
  else if (persona === 'JARVIS_LAB') {
    targetCluster = 'STEM_CODE';
    chosenExamples = [GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'STEM_CODE')[0]];
  }
  // H. COMPANION_CASUAL mặc định
  else {
    targetCluster = 'COMPANION_CASUAL';
    const casualList = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === 'COMPANION_CASUAL');
    if (/(xong|đỉnh|hết việc|chiến|bia|:3|=|\))/i.test(lowerText)) {
      chosenExamples = [casualList[1] || casualList[0]];
    } else {
      chosenExamples = [casualList[0]];
    }
  }

  return formatFewShotBlock(targetCluster, chosenExamples);
}

/**
 * Thống kê số lượng ví dụ và kiểm thử ngân sách độ dài của Kho Few-Shot:
 * Xác nhận 100% tất cả các khối sinh ra đều <= 520 ký tự.
 */
export function getFewShotBankStats(): {
  totalExamples: number;
  clusters: FewShotCluster[];
  maxBlockLength: number;
  isWithinBudget: boolean;
} {
  const clusters: FewShotCluster[] = [
    'COMPANION_CASUAL',
    'COMPANION_EMPATHY',
    'STEM_CODE',
    'STEM_SCIENCE',
    'STEM_ELECTRONICS',
    'FINANCE_QUANT',
    'WEB_CITE_LOGIC',
  ];

  let maxLen = 0;

  for (const ex of GOLDEN_FEW_SHOT_EXAMPLES) {
    const singleBlock = formatFewShotBlock(ex.cluster, [ex]);
    if (singleBlock.length > maxLen) {
      maxLen = singleBlock.length;
    }
  }

  // Thử nghiệm ghép 2 ví dụ cho các cụm đặc thù (MASKED_SADNESS, FINANCE_QUANT, STEM_CODE)
  for (const cl of ['COMPANION_EMPATHY', 'FINANCE_QUANT', 'STEM_CODE'] as FewShotCluster[]) {
    const group = GOLDEN_FEW_SHOT_EXAMPLES.filter((e) => e.cluster === cl);
    if (group.length >= 2) {
      const dualBlock = formatFewShotBlock(cl, group.slice(0, 2));
      if (dualBlock.length > maxLen) {
        maxLen = dualBlock.length;
      }
    }
  }

  return {
    totalExamples: GOLDEN_FEW_SHOT_EXAMPLES.length,
    clusters,
    maxBlockLength: maxLen,
    isWithinBudget: maxLen <= 520,
  };
}
