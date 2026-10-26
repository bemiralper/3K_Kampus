import { type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Bell, BookOpen, CalendarDays, GraduationCap, House, Monitor } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/store';
import { Icon } from '@/design/icons';
import { Logo } from '@/design/logo';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { band, space } from '@/design/tokens';
import { Press } from '@/flow/motion';
import { Avatar } from '@/flow/ui';
import { useShellWidth } from '@/shell/layout';

const NAVY = '#1E3A5F';
const ON_NAVY = '#FFFFFF';
const ON_NAVY_SOFT = 'rgba(255,255,255,0.72)';
const NAVY_PILL = 'rgba(255,255,255,0.16)';

const TABS: { href: '/ana' | '/program' | '/siniflar' | '/konular' | '/tahta'; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { href: '/ana', label: 'Bugün', shortLabel: 'Bugün', icon: House },
  { href: '/program', label: 'Program', shortLabel: 'Program', icon: CalendarDays },
  { href: '/siniflar', label: 'Sınıflarım', shortLabel: 'Sınıflar', icon: GraduationCap },
  { href: '/konular', label: 'Konular', shortLabel: 'Konular', icon: BookOpen },
  { href: '/tahta', label: 'Tahta', shortLabel: 'Tahta', icon: Monitor },
];

function activeIndex(pathname: string) {
  if (pathname.startsWith('/bildirimler') || pathname.startsWith('/profil')) return -1;
  if (pathname.startsWith('/program')) return 1;
  if (pathname.startsWith('/siniflar') || pathname.startsWith('/ogrenci')) return 2;
  if (pathname.startsWith('/konular')) return 3;
  if (pathname.startsWith('/tahta')) return 4;
  return 0;
}

export function Shell({ children }: { children: ReactNode }) {
  const mode = useShellWidth();
  const { width } = useWindowDimensions();
  const phone = mode === 'phone';
  const expanded = width >= 1120;
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const account = useSession((state) => state.account);
  const current = activeIndex(pathname);
  const onAlerts = pathname.startsWith('/bildirimler');
  const onProfile = pathname.startsWith('/profil');
  const fullName = [account?.ad, account?.soyad].filter(Boolean).join(' ') || 'Profil';

  if (phone) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.paper }}>
        <View style={{ paddingTop: insets.top, backgroundColor: NAVY }}>
          <View style={{ height: 56, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo variant="white" height={32} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Bildirimler"
                accessibilityState={{ selected: onAlerts }}
                onPress={() => router.push('/bildirimler')}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: onAlerts ? NAVY_PILL : 'transparent',
                }}
              >
                <Icon icon={Bell} color={ON_NAVY} size={19} />
              </Press>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Profil"
                accessibilityState={{ selected: onProfile }}
                onPress={() => router.push('/profil')}
                style={{
                  height: 40,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: onProfile ? NAVY_PILL : 'transparent',
                }}
              >
                <Avatar label={fullName} size={26} />
                <AppText variant="caption" weight="semibold" color={ON_NAVY} lines={1} style={{ maxWidth: 96 }}>
                  {account?.ad || 'Profil'}
                </AppText>
              </Press>
            </View>
          </View>
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        <View
          style={{
            backgroundColor: NAVY,
            paddingBottom: Math.max(insets.bottom, 6),
            paddingTop: 6,
            paddingHorizontal: 8,
            flexDirection: 'row',
          }}
        >
          {TABS.map((tab, index) => {
            const selected = current === index;
            return (
              <Press
                key={tab.href}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected }}
                onPress={() => router.push(tab.href)}
                scaleTo={0.98}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 12,
                    height: 26,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? NAVY_PILL : 'transparent',
                  }}
                >
                  <Icon icon={tab.icon} color={selected ? ON_NAVY : ON_NAVY_SOFT} size={18} />
                </View>
                <AppText variant="caption" weight={selected ? 'bold' : 'medium'} color={selected ? ON_NAVY : ON_NAVY_SOFT} lines={1} style={{ fontSize: 11 }}>
                  {tab.shortLabel}
                </AppText>
              </Press>
            );
          })}
        </View>
      </View>
    );
  }

  const railW = expanded ? band.railExpanded : band.rail;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.paper }}>
      <View
        style={{
          width: railW,
          paddingTop: Math.max(insets.top, space.md),
          paddingBottom: Math.max(insets.bottom, space.md),
          paddingHorizontal: expanded ? 14 : 10,
          backgroundColor: NAVY,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: space.lg }}>
          <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
            <Logo variant="white" height={expanded ? 64 : 28} />
          </View>
          <View style={{ gap: 4 }}>
            {TABS.map((tab, index) => {
              const selected = current === index;
              return (
                <Press
                  key={tab.href}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected }}
                  onPress={() => router.push(tab.href)}
                  scaleTo={0.985}
                  style={{
                    height: expanded ? 44 : 52,
                    borderRadius: 12,
                    paddingHorizontal: expanded ? 12 : 4,
                    flexDirection: expanded ? 'row' : 'column',
                    alignItems: 'center',
                    justifyContent: expanded ? 'flex-start' : 'center',
                    gap: expanded ? 12 : 3,
                    backgroundColor: selected ? NAVY_PILL : 'transparent',
                  }}
                >
                  <Icon icon={tab.icon} color={selected ? ON_NAVY : ON_NAVY_SOFT} size={19} />
                  <AppText
                    variant="caption"
                    weight={selected ? 'bold' : 'medium'}
                    color={selected ? ON_NAVY : ON_NAVY_SOFT}
                    lines={1}
                    style={{ fontSize: expanded ? 14 : 10 }}
                  >
                    {expanded ? tab.label : tab.shortLabel}
                  </AppText>
                </Press>
              );
            })}
          </View>
        </View>
        <View style={{ gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 12 }}>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Bildirimler"
            accessibilityState={{ selected: onAlerts }}
            onPress={() => router.push('/bildirimler')}
            scaleTo={0.985}
            style={{
              height: 44,
              borderRadius: 12,
              paddingHorizontal: expanded ? 12 : 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: expanded ? 'flex-start' : 'center',
              gap: 12,
              backgroundColor: onAlerts ? NAVY_PILL : 'transparent',
            }}
          >
            <Icon icon={Bell} color={onAlerts ? ON_NAVY : ON_NAVY_SOFT} size={19} />
            {expanded ? (
              <AppText variant="caption" weight={onAlerts ? 'bold' : 'medium'} color={onAlerts ? ON_NAVY : ON_NAVY_SOFT} style={{ fontSize: 14 }}>
                Bildirimler
              </AppText>
            ) : null}
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Profil"
            accessibilityState={{ selected: onProfile }}
            onPress={() => router.push('/profil')}
            scaleTo={0.985}
            style={{
              minHeight: 48,
              borderRadius: 12,
              paddingHorizontal: expanded ? 10 : 0,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: expanded ? 'flex-start' : 'center',
              gap: 10,
              backgroundColor: onProfile ? NAVY_PILL : 'transparent',
            }}
          >
            <Avatar label={fullName} size={32} />
            {expanded ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="caption" weight="bold" color={ON_NAVY} lines={1}>
                  {fullName}
                </AppText>
                <AppText variant="caption" color={ON_NAVY_SOFT} lines={1} style={{ fontSize: 11 }}>
                  Hesap ve şube
                </AppText>
              </View>
            ) : null}
          </Press>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{children}</View>
    </View>
  );
}
