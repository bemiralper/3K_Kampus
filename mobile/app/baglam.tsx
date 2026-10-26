import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Building2, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { loadProfile } from '@/auth/profile';
import { useSession, type SubeRow } from '@/auth/store';
import { Icon } from '@/design/icons';
import { Logo } from '@/design/logo';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Appear } from '@/flow/motion';
import { Button, Card, Heading, Page, State } from '@/flow/ui';

export default function ContextScreen() {
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const access = useSession((state) => state.access);
  const subeler = useSession((state) => state.subeler);
  const yillar = useSession((state) => state.yillar);
  const kurumlar = useSession((state) => state.kurumlar);
  const portals = useSession((state) => state.portals);
  const setContext = useSession((state) => state.setContext);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (subeler.length !== 1) return;
    const row = subeler[0];
    setContext(row.kurum_id, row.id, row.egitim_yili_id).then(() => router.replace('/ana'));
  }, [router, setContext, subeler]);

  useEffect(() => {
    if (!access || subeler.length) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadProfile()
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Şubeler alınamadı.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [access, subeler.length]);

  if (!access) return <Redirect href="/login" />;

  async function choose(row: SubeRow) {
    await setContext(row.kurum_id, row.id, row.egitim_yili_id);
    router.replace('/ana');
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <View style={{ paddingTop: insets.top + space.lg, paddingBottom: space.md, paddingHorizontal: space.lg, gap: space.md }}>
        <Logo height={32} />
        <Heading title="Şube seçin" sub="Devam etmek için bir şube seçin." />
      </View>
      <Page>
        {portals
          .filter((portal) => !portal.enterable)
          .map((portal) => (
            <AppText key={portal.code} variant="caption" color={palette.muted}>
              {`${portal.label} bu sürümde açılmaz.`}
            </AppText>
          ))}
        <State loading={loading} error={loadError} empty={!loading && !loadError && subeler.length === 0 ? 'Bu hesapta seçilecek şube yok.' : null}>
          <View style={{ gap: space.sm }}>
            {subeler.map((row, index) => {
              const kurum = kurumlar.find((item) => item.id === row.kurum_id);
              const yil = yillar.find((item) => item.id === row.egitim_yili_id);
              return (
                <Appear key={`${row.kurum_id}-${row.id}-${row.egitim_yili_id}`} index={index}>
                  <Card onPress={() => choose(row)} accessibilityLabel={`${kurum?.ad ?? 'Kurum'} · ${row.ad} · ${yil?.ad ?? ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon icon={Building2} color={palette.midnight} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText weight="bold" color={palette.ink} lines={1}>
                        {row.ad}
                      </AppText>
                      <AppText variant="caption" color={palette.muted} lines={1}>
                        {[kurum?.ad, yil?.ad].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                    <Icon icon={ChevronRight} color={palette.muted} />
                  </Card>
                </Appear>
              );
            })}
          </View>
        </State>
        <Button label="Profil" tone="ghost" onPress={() => router.push('/profil')} />
      </Page>
    </View>
  );
}
