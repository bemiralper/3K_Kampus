import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useFontState } from './fonts';
import { usePalette } from './theme';
import { font, type as typeScale } from './tokens';

type Variant = 'display' | 'page' | 'section' | 'card' | 'body' | 'support' | 'caption' | 'button' | 'time';
type Weight = keyof typeof font;

const fallbackWeight: Record<Weight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export function AppText({
  children,
  variant = 'body',
  weight = 'regular',
  color,
  lines,
  style,
}: {
  children: ReactNode;
  variant?: Variant;
  weight?: Weight;
  color?: string;
  lines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const palette = usePalette();
  const { active } = useFontState();
  return (
    <Text
      allowFontScaling
      numberOfLines={lines}
      ellipsizeMode="tail"
      style={[
        {
          color: color ?? palette.ink,
          fontSize: typeScale[variant],
          fontFamily: active ? font[weight] : undefined,
          fontWeight: active ? '400' : fallbackWeight[weight],
          fontVariant: variant === 'time' ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
