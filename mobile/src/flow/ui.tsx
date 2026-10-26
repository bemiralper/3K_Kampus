import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Press, Slider } from '@/flow/motion';

export function Page({ children, pad = space.lg }: { children: ReactNode; pad?: number }) {
  const palette = usePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.paper }}
      contentContainerStyle={{ paddingHorizontal: pad, paddingTop: space.md, paddingBottom: space.xxl, gap: space.md }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Heading({ title, sub, light = false }: { title: string; sub?: string; light?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="page" weight="bold" color={light ? '#FFFFFF' : palette.ink} lines={2}>
        {title}
      </AppText>
      {sub ? (
        <AppText variant="support" color={light ? 'rgba(255,255,255,0.72)' : palette.muted} lines={2}>
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  selected = false,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  tone?: 'surface' | 'navy' | 'gold' | 'teal';
}) {
  const palette = usePalette();
  const bg =
    tone === 'navy' ? palette.midnight : tone === 'gold' ? palette.goldSurface : tone === 'teal' ? palette.tealSurface : palette.surface;
  const body = (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: 20,
          padding: space.md,
          gap: 6,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          borderColor: selected ? palette.midnight : tone === 'surface' ? palette.line : 'transparent',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected }} onPress={onPress}>
      {body}
    </Press>
  );
}

export function Segmented({
  items,
  value,
  onChange,
  dark = false,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  dark?: boolean;
}) {
  const palette = usePalette();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex((item) => item.key === value));
  const itemWidth = items.length > 0 ? width / items.length : 0;
  const height = 40;
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{
        height,
        flexDirection: 'row',
        borderRadius: 999,
        backgroundColor: dark ? 'rgba(255,255,255,0.12)' : palette.primaryContainer,
        overflow: 'hidden',
      }}
    >
      <Slider index={index} itemWidth={itemWidth} height={height} color={dark ? palette.gold : palette.surface} inset={3} />
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Press
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            scaleTo={0.98}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText
              variant="caption"
              weight={selected ? 'bold' : 'medium'}
              lines={1}
              color={selected ? (dark ? palette.navyDeep : palette.midnight) : dark ? 'rgba(255,255,255,0.8)' : palette.muted}
            >
              {item.label}
            </AppText>
          </Press>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: selected ? palette.midnight : palette.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? palette.midnight : palette.line,
      }}
    >
      <AppText variant="caption" weight={selected ? 'bold' : 'medium'} color={selected ? '#FFFFFF' : palette.ink}>
        {label}
      </AppText>
    </Press>
  );
}

export function Avatar({ label, tone = 'navy', size = 40 }: { label: string; tone?: 'navy' | 'gold' | 'teal'; size?: number }) {
  const palette = usePalette();
  const bg = tone === 'gold' ? palette.gold : tone === 'teal' ? palette.teal : palette.midnight;
  const fg = tone === 'gold' ? palette.navyDeep : '#FFFFFF';
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="caption" weight="bold" color={fg}>
        {initials || '•'}
      </AppText>
    </View>
  );
}

export function Row({
  title,
  sub,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  selected = false,
  titleLines = 1,
  subLines = 1,
}: {
  title: string;
  sub?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  titleLines?: number;
  subLines?: number;
}) {
  const palette = usePalette();
  const body = (
    <View
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: 10,
        paddingHorizontal: selected ? 12 : 0,
        borderRadius: 16,
        backgroundColor: selected ? palette.primaryContainer : 'transparent',
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText weight="semibold" color={palette.ink} lines={titleLines}>
          {title}
        </AppText>
        {sub ? (
          <AppText variant="caption" color={palette.muted} lines={subLines}>
            {sub}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return body;
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ selected }} onPress={onPress} scaleTo={0.985}>
      {body}
    </Press>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  tone = 'navy',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'navy' | 'gold' | 'ghost';
}) {
  const palette = usePalette();
  const bg = disabled ? palette.line : tone === 'gold' ? palette.gold : tone === 'ghost' ? 'transparent' : palette.midnight;
  const fg = disabled ? palette.muted : tone === 'gold' ? palette.navyDeep : tone === 'ghost' ? palette.midnight : '#FFFFFF';
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ height: 52, borderRadius: 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg }}
    >
      <AppText variant="button" weight="bold" color={fg}>
        {label}
      </AppText>
    </Press>
  );
}

export function State({
  loading,
  error,
  empty,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: string | null;
  children?: ReactNode;
}) {
  const palette = usePalette();
  if (loading) {
    return (
      <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
        <ActivityIndicator color={palette.midnight} />
      </View>
    );
  }
  const message = error || empty;
  if (message) {
    return (
      <View style={{ paddingVertical: space.xl, alignItems: 'center', gap: 6 }}>
        <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: error ? palette.danger : palette.midnight }} />
        <AppText variant="support" color={palette.muted} style={{ textAlign: 'center' }}>
          {message}
        </AppText>
      </View>
    );
  }
  return <>{children}</>;
}

export function Label({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <AppText variant="caption" weight="bold" color={palette.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
      {children}
    </AppText>
  );
}
