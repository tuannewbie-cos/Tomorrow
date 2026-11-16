import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { ThemeColors, DARK_THEME } from '../constants/theme';

interface TypingIndicatorProps {
  visible: boolean;
  isDesktop?: boolean;
  theme?: ThemeColors;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  visible,
  isDesktop,
  theme = DARK_THEME,
}) => {
  const [shouldRender, setShouldRender] = useState<boolean>(visible);

  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(visible ? 1 : 0.85)).current;

  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  const loopAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);

      // Hiệu ứng FadeIn / Scale nhẹ nhàng khi bong bóng xuất hiện
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Dừng vòng lặp cũ nếu có trước khi tạo vòng lặp mới
      if (loopAnimationRef.current) {
        loopAnimationRef.current.stop();
      }

      // Tạo nhịp nảy cho từng chấm: translateY (0 -> -5 -> 0), opacity (0.4 -> 1 -> 0.4) trong 300ms
      const createDotAnimation = (anim: Animated.Value) => {
        return Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]);
      };

      // Sử dụng Animated.loop và Animated.stagger(150, ...) để 3 chấm lần lượt nảy mượt mà
      const staggerLoop = Animated.loop(
        Animated.stagger(150, [
          createDotAnimation(dot1Anim),
          createDotAnimation(dot2Anim),
          createDotAnimation(dot3Anim),
        ])
      );

      loopAnimationRef.current = staggerLoop;
      staggerLoop.start();
    } else {
      // Hiệu ứng FadeOut / Scale nhẹ nhàng khi bong bóng biến mất
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.85,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShouldRender(false);
          if (loopAnimationRef.current) {
            loopAnimationRef.current.stop();
          }
          dot1Anim.setValue(0);
          dot2Anim.setValue(0);
          dot3Anim.setValue(0);
        }
      });
    }

    return () => {
      if (loopAnimationRef.current) {
        loopAnimationRef.current.stop();
      }
    };
  }, [visible, fadeAnim, scaleAnim, dot1Anim, dot2Anim, dot3Anim]);

  if (!shouldRender) {
    return null;
  }

  const getDotStyle = (anim: Animated.Value) => ({
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -5],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.bubbleAI,
            borderColor: theme.borderAI,
            shadowOpacity: theme.mode === 'light' ? 0.05 : 0.12,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Animated.View
          style={[styles.dot, { backgroundColor: theme.textSecondary }, getDotStyle(dot1Anim)]}
        />
        <Animated.View
          style={[styles.dot, { backgroundColor: theme.textSecondary }, getDotStyle(dot2Anim)]}
        />
        <Animated.View
          style={[styles.dot, { backgroundColor: theme.textSecondary }, getDotStyle(dot3Anim)]}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    width: '100%',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginHorizontal: 2.5,
  },
});

export default TypingIndicator;
