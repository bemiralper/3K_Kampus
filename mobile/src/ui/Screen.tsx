import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { radius, space } from '@/design/tokens';

export function Screen({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.paper }}
      contentContainerStyle={{ padding: space.md, gap: space.md, paddingBottom: space.xl }}
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <AppText variant="page" weight="bold" color={palette.ink}>
      {children}
    </AppText>
  );
}

export function Muted({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <AppText variant="support" color={palette.muted}>
      {children}
    </AppText>
  );
}

export function Panel({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={{
        backgroundColor: selected ? palette.primaryContainer : 'transparent',
        borderRadius: selected ? 12 : 0,
        paddingVertical: 14,
        paddingHorizontal: selected ? 12 : 0,
        borderBottomWidth: selected ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: palette.line,
        gap: 2,
      }}
    >
      {children}
    </View>
  );
}

export function Hero({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  const palette = usePalette();
  return (
    <View style={{ backgroundColor: palette.hero, borderRadius: radius.card, padding: space.lg, gap: space.xs }}>
      <View style={{ width: 36, height: 3, borderRadius: 2, backgroundColor: palette.gold }} />
      <AppText variant="caption" weight="semibold" color={palette.gold}>
        {kicker}
      </AppText>
      <AppText variant="section" weight="bold" color={palette.onHero}>
        {title}
      </AppText>
      <AppText variant="body" color={palette.onHero}>
        {detail}
      </AppText>
    </View>
  );
}

export function Status({
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
  if (loading) return <ActivityIndicator color={palette.accent} />;
  if (error) return <Muted>{error}</Muted>;
  if (empty) return <Muted>{empty}</Muted>;
  return <>{children}</>;
}

export function Action({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        borderRadius: radius.control,
        backgroundColor: disabled ? palette.line : palette.hero,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.md,
      }}
    >
      <AppText variant="button" weight="bold" color={palette.onHero}>
        {label}
      </AppText>
    </Pressable>
  );
}
