import React from 'react';
import { View, StyleSheet } from 'react-native';

export interface TomorrowGlyphProps {
  size?: number;
  color?: string;
  themeMode?: 'dark' | 'light';
}

/**
 * Biểu tượng lõi đặc trưng của Tomorrow:
 * - 100% nền trong suốt, không khung viền, không hộp vuông đen bao quanh
 * - Cụm 5 cột sóng cân đối đặc trưng của Tomorrow với 2 đầu bo tròn êm ái
 * - Tự động thích ứng nền Tối (#F3F4F6) và nền Sáng (#18181B)
 */
export const TomorrowGlyph: React.FC<TomorrowGlyphProps> = ({
  size = 30,
  color,
  themeMode = 'dark',
}) => {
  const glyphColor = color || (themeMode === 'light' ? '#18181B' : '#F3F4F6');
  const barWidth = Math.max(2.5, Math.round(size * 0.095));
  const gap = Math.max(3, Math.round(size * 0.1));
  const heights = [
    size * 0.45,
    size * 0.72,
    size * 1.0,
    size * 0.68,
    size * 0.42,
  ];

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.row, { gap }]}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={{
              width: barWidth,
              height: h,
              backgroundColor: glyphColor,
              borderRadius: barWidth / 2,
            }}
          />
        ))}
      </View>
    </View>
  );
};

/**
 * Lời chào theo khung giờ thực tế trong ngày chuẩn Claude:
 * 04:00 – 11:29: "Chào buổi sáng"
 * 11:30 – 13:29: "Chào buổi trưa"
 * 13:30 – 17:59: "Chào buổi chiều"
 * 18:00 – 22:59: "Suy nghĩ buổi tối"
 * 23:00 – 03:59: "Tĩnh lặng đêm khuya"
 */
export function getTimeBasedGreeting(date: Date = new Date()): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes >= 240 && totalMinutes < 690) {
    return 'Chào buổi sáng';
  }
  if (totalMinutes >= 690 && totalMinutes < 810) {
    return 'Chào buổi trưa';
  }
  if (totalMinutes >= 810 && totalMinutes < 1080) {
    return 'Chào buổi chiều';
  }
  if (totalMinutes >= 1080 && totalMinutes < 1380) {
    return 'Suy nghĩ buổi tối';
  }
  return 'Tĩnh lặng đêm khuya';
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});
