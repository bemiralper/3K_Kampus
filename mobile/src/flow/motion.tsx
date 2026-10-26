import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const spring = { damping: 18, stiffness: 220, mass: 0.8 };

export function Appear({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(Math.min(index, 12) * 40).springify().damping(20).stiffness(180)} style={style}>
      {children}
    </Animated.View>
  );
}

export function Fade({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.delay(delay).duration(260)} style={style}>
      {children}
    </Animated.View>
  );
}

export function Press({
  children,
  style,
  scaleTo = 0.97,
  ...rest
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        if (!reduce) scale.value = withSpring(scaleTo, spring);
        rest.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduce) scale.value = withSpring(1, spring);
        rest.onPressOut?.(event);
      }}
      style={[animated, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Slider({
  index,
  itemWidth,
  height,
  color,
  radius = 999,
  inset = 0,
}: {
  index: number;
  itemWidth: number;
  height: number;
  color: string;
  radius?: number;
  inset?: number;
}) {
  const reduce = useReducedMotion();
  const x = useSharedValue(index * itemWidth);
  x.value = reduce ? index * itemWidth : withSpring(index * itemWidth, spring);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (itemWidth <= 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: inset,
          top: inset,
          width: itemWidth - inset * 2,
          height: height - inset * 2,
          borderRadius: radius,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function VSlider({
  index,
  itemHeight,
  width,
  color,
  radius = 18,
  inset = 0,
}: {
  index: number;
  itemHeight: number;
  width: number;
  color: string;
  radius?: number;
  inset?: number;
}) {
  const reduce = useReducedMotion();
  const y = useSharedValue(index * itemHeight);
  y.value = reduce ? index * itemHeight : withSpring(index * itemHeight, spring);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: inset,
          top: inset,
          width: width - inset * 2,
          height: itemHeight - inset * 2,
          borderRadius: radius,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function Progress({ value, color, track, height = 4 }: { value: number; color: string; track: string; height?: number }) {
  const reduce = useReducedMotion();
  const width = useSharedValue(0);
  width.value = reduce ? value : withTiming(value, { duration: 600 });
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(100, width.value * 100))}%` }));
  return (
    <Animated.View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color }, style]} />
    </Animated.View>
  );
}
