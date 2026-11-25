export type CircadianPeriod =
  | 'EARLY_MORNING'
  | 'MORNING'
  | 'NOON'
  | 'AFTERNOON'
  | 'EVENING'
  | 'LATE_NIGHT';

export type ChronoGapType =
  | 'CONTINUOUS'
  | 'SAME_DAY_RETURN'
  | 'NEXT_DAY'
  | 'MULTI_DAY_GAP'
  | 'FIRST_INTERACTION';

export interface ChronoContext {
  formattedDateTime: string;
  weekday: string;
  dateStr: string;
  isoDate: string;
  timeStr: string;
  hour: number;
  minute: number;
  period: CircadianPeriod;
  label: string;
  timeZone?: string;
  gapType: ChronoGapType;
  allowLateNightRemark: boolean;
  directiveTag: string;
}

export const VIETNAMESE_WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

/**
 * BỘ ĐỒNG HỒ THỜI GIAN THỰC & NHỊP SINH HỌC (buildChronoContext)
 * Trích xuất thời gian thực chính xác tại thời điểm tương tác:
 * Thứ, ngày/tháng/năm, giờ:phút, múi giờ và phân loại nhịp sinh học (circadianPeriod).
 */
export function buildChronoContext(now: Date = new Date(), lastTimestamp?: number): ChronoContext {
  const weekday = VIETNAMESE_WEEKDAYS[now.getDay()];
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${day}/${month}/${year}`;
  const isoDate = `${year}-${month}-${day}`;

  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    timeZone = 'Asia/Ho_Chi_Minh';
  }

  const formattedDateTime = `${weekday}, ${dateStr} ${timeStr}`;

  // Phân loại circadianPeriod theo 6 khung giờ chuẩn
  const totalMinutes = hour * 60 + minute;
  let period: CircadianPeriod;
  let label: string;

  if (totalMinutes >= 4 * 60 && totalMinutes < 7 * 60) {
    // 04:00 – 06:59
    period = 'EARLY_MORNING';
    label = 'sáng sớm / tinh mơ';
  } else if (totalMinutes >= 7 * 60 && totalMinutes < 11 * 60 + 30) {
    // 07:00 – 11:29
    period = 'MORNING';
    label = 'buổi sáng';
  } else if (totalMinutes >= 11 * 60 + 30 && totalMinutes < 13 * 60 + 30) {
    // 11:30 – 13:29
    period = 'NOON';
    label = 'buổi trưa';
  } else if (totalMinutes >= 13 * 60 + 30 && totalMinutes < 18 * 60) {
    // 13:30 – 17:59
    period = 'AFTERNOON';
    label = 'buổi chiều';
  } else if (totalMinutes >= 18 * 60 && totalMinutes < 23 * 60) {
    // 18:00 – 22:59
    period = 'EVENING';
    label = 'buổi tối';
  } else {
    // 23:00 – 03:59
    period = 'LATE_NIGHT';
    label = 'đêm khuya';
  }

  // Tính gapType dựa trên lastTimestamp
  let gapType: ChronoGapType = 'FIRST_INTERACTION';
  if (typeof lastTimestamp === 'number' && lastTimestamp > 0) {
    const diffMs = now.getTime() - lastTimestamp;
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const lastDate = new Date(lastTimestamp);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfLast = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
    const calendarDayDiff = Math.round((startOfToday - startOfLast) / (24 * 60 * 60 * 1000));

    if (diffMinutes < 15) {
      gapType = 'CONTINUOUS';
    } else if (calendarDayDiff === 0 || (diffMinutes <= 6 * 60 && now.getDate() === lastDate.getDate())) {
      gapType = 'SAME_DAY_RETURN';
    } else if (calendarDayDiff === 1) {
      gapType = 'NEXT_DAY';
    } else if (calendarDayDiff >= 2) {
      gapType = 'MULTI_DAY_GAP';
    } else {
      gapType = 'CONTINUOUS';
    }
  }

  const allowLateNightRemark = period === 'LATE_NIGHT';
  const directiveTag = `[CHRONO: ${weekday}, ${dateStr} ${timeStr} | PERIOD=${period} (${label}) | GAP=${gapType} | ALLOW_LATE_NIGHT_REMARK=${allowLateNightRemark}]`;

  return {
    formattedDateTime,
    weekday,
    dateStr,
    isoDate,
    timeStr,
    hour,
    minute,
    period,
    label,
    timeZone,
    gapType,
    allowLateNightRemark,
    directiveTag,
  };
}
