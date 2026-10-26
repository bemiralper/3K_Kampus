import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Press } from '@/flow/motion';

export function Sheet({
  visible,
  title,
  expanded,
  onClose,
  onToggleExpanded,
  bare = false,
  children,
}: {
  visible: boolean;
  title: string;
  expanded: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
  bare?: boolean;
  children: ReactNode;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={reduce ? undefined : FadeIn.duration(180)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,20,48,0.55)' }}>
        {expanded ? null : <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={onClose} style={{ flex: 1 }} />}
        <Animated.View
          entering={reduce ? undefined : SlideInDown.springify().damping(22).stiffness(200)}
          style={{
            flex: expanded ? 1 : undefined,
            maxHeight: expanded ? undefined : '78%',
            backgroundColor: palette.paper,
            borderTopLeftRadius: expanded ? 0 : 28,
            borderTopRightRadius: expanded ? 0 : 28,
            paddingTop: expanded ? insets.top + space.md : space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: Math.max(insets.bottom, space.md),
            gap: space.md,
          }}
        >
          {expanded && bare ? (
            <Press
              accessibilityRole="button"
              accessibilityLabel="Küçült"
              onPress={onToggleExpanded}
              style={{ height: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
            >
              <AppText variant="caption" weight="bold" color={palette.muted}>
                Küçült
              </AppText>
            </Press>
          ) : null}
          {expanded ? null : bare ? (
            <Press
              accessibilityRole="button"
              accessibilityLabel="Ayrıntıyı büyüt"
              onPress={onToggleExpanded}
              style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.line }} />
            </Press>
          ) : (
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.line }} />
          )}
          {bare ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
              <AppText variant="section" weight="bold" color={palette.ink} lines={2} style={{ flex: 1, minWidth: 0 }}>
                {title}
              </AppText>
              <Press
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Kısa ayrıntı' : 'Tam ekran'}
                onPress={onToggleExpanded}
                style={{ height: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.primaryContainer }}
              >
                <AppText variant="caption" weight="bold" color={palette.midnight}>
                  {expanded ? 'Kısa ayrıntı' : 'Tam ekran'}
                </AppText>
              </Press>
            </View>
          )}
          <ScrollView contentContainerStyle={{ gap: space.md }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {bare ? null : (
            <Press
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              onPress={onClose}
              style={{ height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primaryContainer }}
            >
              <AppText variant="button" weight="bold" color={palette.midnight}>
                Kapat
              </AppText>
            </Press>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
