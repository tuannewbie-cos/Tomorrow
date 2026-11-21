/**
 * TOMORROW V4.6 — SERVICES/PERSONA_ROUTER.TS
 * BỘ ĐIỀU PHỐI NHÂN CÁCH KÉP CỤC BỘ (DUAL-PERSONA ROUTER) & DOMAIN PLAYBOOKS
 * 
 * Vận hành 100% cục bộ (< 1ms) trước khi gọi LLM:
 * 1. COMPANION_MIRROR (Tri kỷ đời thường): Casual, teencode, xưng hô đồng điệu, ngắn gọn.
 * 2. JARVIS_LAB (J.A.R.V.I.S. Phòng Lab): Điềm tĩnh, sắc bén, chuyên môn STEM & Tài chính, Markdown/LaTeX.
 * 3. Dry-Wit Regulator: OFF (khi buồn/stress/hesitation) | SUBTLE (Jarvis) | SHARP (hào hứng).
 * 4. DOMAIN_PLAYBOOKS: Nạp đúng 1 playbook chuyên môn khi là JARVIS_LAB.
 */

import { MicroPsychProfile } from './microPsychProfiler';

export type ExpertDomain =
  | 'VISION_LAB'
  | 'STEM_PHYSICS_MECH'
  | 'STEM_PHYSICS_MECHANICS'
  | 'STEM_CHEM_BIO'
  | 'STEM_ELECTRONICS'
  | 'STEM_MATH'
  | 'STEM_CODE'
  | 'CODE_CS'
  | 'FINANCE_QUANT'
  | 'GENERAL';

export type PersonaMode = 'COMPANION_MIRROR' | 'JARVIS_LAB';
export type DryWitLevel = 'OFF' | 'SUBTLE' | 'SHARP';

export interface PersonaResolutionInput {
  intentMode: 'STOP_SIGNAL' | 'PING' | 'WEB_INTEL' | 'EXPERT_JARVIS' | 'CASUAL_FRIEND';
  expertDomain?: ExpertDomain | string;
  psychProfile?: MicroPsychProfile;
  chrono?: any;
  hasImage?: boolean;
  userText?: string;
}

export interface DualPersonaResolution {
  persona: PersonaMode;
  domain: ExpertDomain;
  dryWitLevel: DryWitLevel;
  dynamicMaxTokens: number;
  statusHint: string;
  personaDirectiveTag: string;
  domainPlaybook: string;
}

/**
 * BẢNG DOMAIN_PLAYBOOKS CHUYÊN SÂU:
 * Chỉ chèn đúng 1 playbook tương ứng khi persona === 'JARVIS_LAB'.
 * Tuyệt đối không chèn khi chat đời thường để tiết kiệm token và tối ưu độ trễ.
 */
export const DOMAIN_PLAYBOOKS: Record<string, string> = {
  STEM_CODE:
    '[PLAYBOOK: STEM_CODE | Chẩn đoán nguyên nhân gốc trước -> Đưa mã nguồn sạch, chạy được (khối code có ngôn ngữ) -> Phân tích ngắn độ phức tạp Time/Space (O(...)) nếu là thuật toán/cấu trúc dữ liệu.]',
  CODE_CS:
    '[PLAYBOOK: STEM_CODE | Chẩn đoán nguyên nhân gốc trước -> Đưa mã nguồn sạch, chạy được (khối code có ngôn ngữ) -> Phân tích ngắn độ phức tạp Time/Space (O(...)) nếu là thuật toán/cấu trúc dữ liệu.]',
  STEM_PHYSICS_MECHANICS:
    '[PLAYBOOK: STEM_PHYSICS_MECHANICS | Tóm tắt dữ kiện/điều kiện biên -> Trình bày công thức gốc rõ ràng -> Thay số kèm đơn vị SI chuẩn -> Kiểm tra tính hợp lý vật lý của kết quả.]',
  STEM_PHYSICS_MECH:
    '[PLAYBOOK: STEM_PHYSICS_MECHANICS | Tóm tắt dữ kiện/điều kiện biên -> Trình bày công thức gốc rõ ràng -> Thay số kèm đơn vị SI chuẩn -> Kiểm tra tính hợp lý vật lý của kết quả.]',
  STEM_ELECTRONICS:
    '[PLAYBOOK: STEM_ELECTRONICS | Xác định nguyên lý/thông số linh kiện -> Tính toán dòng/áp/trở kháng hoặc chỉ ra điểm sai mạch -> Kèm 1 dòng cảnh báo an toàn linh kiện/nguồn nếu có nguy cơ chập cháy.]',
  STEM_CHEM_BIO:
    '[PLAYBOOK: STEM_CHEM_BIO | Viết chuẩn phương trình phản ứng cân bằng / cơ chế sinh học -> Giải thích ngắn bản chất cốt lõi -> Nêu điều kiện phản ứng hoặc ngoại lệ quan trọng.]',
  STEM_MATH:
    '[PLAYBOOK: STEM_MATH | Xác định hướng giải tối ưu -> Triển khai từng bước mạch lạc -> Chốt kết quả cuối cùng rõ ràng.]',
  FINANCE_QUANT:
    '[PLAYBOOK: FINANCE_QUANT | Tách bạch số liệu xác thực vs giả định tính toán -> Nêu rõ công thức (lãi kép, P/E, ROE, NPV, biên độ rủi ro...) -> Luôn phân tích 2 chiều (Kỳ vọng & Rủi ro), không khẳng định chắc thắng cảm tính.]',
  VISION_LAB:
    '[PLAYBOOK: VISION_LAB | Đọc trực tiếp dữ liệu từ ảnh đính kèm -> Giải thẳng vào yêu cầu người dùng. Nếu chi tiết trong ảnh bị mờ/cắt góc, chỉ rõ phần bị thiếu thay vì tự bịa dữ kiện.]',
  GENERAL_EXPERT:
    '[PLAYBOOK: GENERAL_EXPERT | Điềm tĩnh, sắc bén, chuẩn xác, đi thẳng vào bản chất ngay dòng đầu tiên. Dùng Markdown/Code/LaTeX sạch đẹp, không bị ép viết thường hay cụt lủn theo thói quen chat thường.]',
};

/**
 * Lấy Playbook chuyên môn cho từng nhánh
 */
export function getDomainPlaybook(domain: ExpertDomain | string): string {
  if (DOMAIN_PLAYBOOKS[domain]) {
    return DOMAIN_PLAYBOOKS[domain];
  }
  return DOMAIN_PLAYBOOKS.GENERAL_EXPERT;
}

/**
 * Hàm điều phối nhân cách kép cục bộ:
 * Chạy 100% bằng TypeScript cục bộ (< 1ms), không tốn token mạng.
 */
export function resolveDualPersona(input: PersonaResolutionInput): DualPersonaResolution {
  const {
    intentMode,
    expertDomain = 'GENERAL',
    psychProfile,
    hasImage = false,
    userText = '',
  } = input;

  const domain = (expertDomain as ExpertDomain) || 'GENERAL';
  const cleanDomain = String(domain);

  // 1. KIỂM TRA NHÁNH CHUYÊN MÔN STEM / TÀI CHÍNH / VISION
  const isStemOrFinanceOrVision =
    hasImage ||
    cleanDomain === 'VISION_LAB' ||
    cleanDomain.startsWith('STEM_') ||
    cleanDomain === 'CODE_CS' ||
    cleanDomain === 'FINANCE_QUANT';

  // 2. QUYẾT ĐỊNH NHÂN CÁCH (PersonaMode):
  // - JARVIS_LAB: Khi có ảnh, khi intent là EXPERT_JARVIS/WEB_INTEL, hoặc khi thuộc bất kỳ nhánh STEM / Tài chính nào.
  // - COMPANION_MIRROR: Khi là CASUAL_FRIEND, PING, STOP_SIGNAL, hoặc người dùng đang chia sẻ cảm xúc ngầm.
  let persona: PersonaMode = 'COMPANION_MIRROR';

  if (isStemOrFinanceOrVision || intentMode === 'EXPERT_JARVIS' || intentMode === 'WEB_INTEL') {
    persona = 'JARVIS_LAB';
  } else {
    persona = 'COMPANION_MIRROR';
  }

  // 3. BỘ ĐIỀU TIẾT ĐỘ HÓM HỈNH NGẦM (Dry-Wit Regulator):
  // - Bắt buộc OFF: khi STOP_SIGNAL hoặc hồ sơ tâm lý có MASKED_SADNESS, STRESSED_OVERWHELMED, hesitation === 'HIGH', LOW_DOWN_DEFLATED, VULNERABLE.
  // - SUBTLE: ở chế độ JARVIS_LAB (tối đa 1 câu nhận xét tinh tế kiểu Jarvis).
  // - SHARP: khi CASUAL_FRIEND có năng lượng hào hứng (EXCITED_HYPED) hoặc người dùng dùng teencode trêu đùa (:3, =))), haha).
  const isVulnerableOrStressed =
    psychProfile?.psychState === 'MASKED_SADNESS' ||
    psychProfile?.psychState === 'STRESSED_OVERWHELMED' ||
    psychProfile?.psychState === 'LOW_DOWN_DEFLATED' ||
    psychProfile?.cadence?.hesitationLevel === 'HIGH' ||
    (psychProfile as any)?.hesitation === 'HIGH';

  let dryWitLevel: DryWitLevel = 'OFF';

  if (intentMode === 'STOP_SIGNAL' || isVulnerableOrStressed) {
    dryWitLevel = 'OFF';
  } else if (persona === 'JARVIS_LAB') {
    dryWitLevel = 'SUBTLE';
  } else {
    // COMPANION_MIRROR
    const lowerText = userText.toLowerCase();
    const hasPlayfulMarkers =
      psychProfile?.psychState === 'EXCITED_HYPED' ||
      lowerText.includes(':3') ||
      lowerText.includes('=)))') ||
      lowerText.includes('haha') ||
      lowerText.includes('vl');
    dryWitLevel = hasPlayfulMarkers ? 'SHARP' : 'OFF';
  }

  // 4. CẤP PHÁT TOKEN ĐỘNG (Dynamic Max Tokens):
  // - COMPANION_MIRROR: 250 tokens (nhanh, 1-2 bong bóng).
  // - JARVIS_LAB & VISION_LAB: 1500 - 2000 tokens (lên đến 2500 cho Vision).
  let dynamicMaxTokens = 250;
  if (persona === 'JARVIS_LAB') {
    if (hasImage || cleanDomain === 'VISION_LAB') {
      dynamicMaxTokens = 2500;
    } else if (
      cleanDomain === 'STEM_PHYSICS_MECH' ||
      cleanDomain === 'STEM_PHYSICS_MECHANICS' ||
      cleanDomain === 'STEM_ELECTRONICS' ||
      cleanDomain === 'STEM_CHEM_BIO' ||
      cleanDomain === 'STEM_MATH' ||
      cleanDomain === 'STEM_CODE' ||
      cleanDomain === 'CODE_CS'
    ) {
      dynamicMaxTokens = 2000;
    } else if (cleanDomain === 'FINANCE_QUANT') {
      dynamicMaxTokens = 1500;
    } else {
      dynamicMaxTokens = 1500;
    }
  }

  // 5. GỢI Ý TRẠNG THÁI UI (Status Hint cho TypingIndicator):
  // - COMPANION_MIRROR: "" (chỉ hiện 3 chấm • • • mượt mà như Messenger).
  // - JARVIS_LAB: Hiển thị nhãn nhỏ tinh tế theo nhánh chuyên môn.
  let statusHint = '';
  if (persona === 'JARVIS_LAB') {
    if (hasImage || cleanDomain === 'VISION_LAB') {
      statusHint = '👁️ Vision Lab đang đọc ảnh...';
    } else if (intentMode === 'WEB_INTEL') {
      statusHint = '🌐 Đang quét web...';
    } else if (cleanDomain === 'STEM_CODE' || cleanDomain === 'CODE_CS') {
      statusHint = '⚡ J.A.R.V.I.S. • Code';
    } else if (cleanDomain === 'FINANCE_QUANT') {
      statusHint = '⚡ J.A.R.V.I.S. • Finance';
    } else if (
      cleanDomain === 'STEM_PHYSICS_MECH' ||
      cleanDomain === 'STEM_PHYSICS_MECHANICS' ||
      cleanDomain === 'STEM_ELECTRONICS' ||
      cleanDomain === 'STEM_CHEM_BIO' ||
      cleanDomain === 'STEM_MATH'
    ) {
      statusHint = '⚡ J.A.R.V.I.S. • STEM';
    } else {
      statusHint = '⚡ J.A.R.V.I.S. • Lab';
    }
  }

  // 6. XUẤT THẺ CHỈ DẪN NHÂN CÁCH (Persona Directive Tag):
  // 1 dòng siêu gọn: [PERSONA: ${persona} | DOMAIN=${domain} | WIT=${dryWitLevel} | STYLE=${styleRule}]
  const styleRule =
    persona === 'COMPANION_MIRROR'
      ? 'Casual Vietnamese mirror, no robotic closing, 1-2 bubbles'
      : 'Objective, sharp, concise, Markdown/LaTeX, no robotic closing';

  const personaDirectiveTag = `[PERSONA: ${persona} | DOMAIN=${cleanDomain} | WIT=${dryWitLevel} | STYLE=${styleRule}]`;

  // 7. NẠP PLAYBOOK CHUYÊN MÔN NẾU LÀ JARVIS_LAB:
  const domainPlaybook = persona === 'JARVIS_LAB' ? getDomainPlaybook(cleanDomain) : '';

  return {
    persona,
    domain,
    dryWitLevel,
    dynamicMaxTokens,
    statusHint,
    personaDirectiveTag,
    domainPlaybook,
  };
}
