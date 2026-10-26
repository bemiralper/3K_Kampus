import { useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useClasses, usePrivateStudents, useTermId } from '@/api/teacher';
import type { ClassRow, PrivateStudent } from '@/api/types';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { band, space } from '@/design/tokens';
import { Appear } from '@/flow/motion';
import { Card, Heading, Label, Page, State } from '@/flow/ui';
import { useShellWidth } from '@/shell/layout';
import { ClassCard, Face } from '@/ui/Students';

function Count({ value, label, tone = 'navy' }: { value: number; label: string; tone?: 'navy' | 'teal' }) {
  const palette = usePalette();
  const teal = tone === 'teal';
  return (
    <View
      style={{
        minWidth: 76,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: teal ? palette.tealSurface : palette.primaryContainer,
      }}
    >
      <AppText weight="bold" color={teal ? palette.teal : palette.midnight} style={{ fontSize: 22, lineHeight: 26, fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
      <AppText variant="caption" weight="semibold" color={teal ? palette.teal : palette.midnight}>
        {label}
      </AppText>
    </View>
  );
}

function PrivateCard({ row, index }: { row: PrivateStudent; index: number }) {
  const palette = usePalette();
  const router = useRouter();
  const name = `${row.ad} ${row.soyad}`;
  return (
    <Appear index={index} style={{ flexGrow: 1, flexBasis: 176, maxWidth: 240 }}>
      <Card
        onPress={() => router.push(`/ogrenci/${row.student_id}`)}
        accessibilityLabel={name}
        tone="teal"
        style={{ minHeight: 148, padding: 14, gap: 10, alignItems: 'flex-start' }}
      >
        <Face name={name} photo={row.profil_foto} tone="teal" size={48} />
        <View style={{ gap: 2, alignSelf: 'stretch' }}>
          <AppText weight="bold" color={palette.ink} lines={2}>
            {name}
          </AppText>
          <AppText variant="caption" weight="semibold" color={palette.teal} lines={2}>
            {row.dersler.join(', ') || 'Özel ders'}
          </AppText>
        </View>
      </Card>
    </Appear>
  );
}

export default function ClassesScreen() {
  const router = useRouter();
  const palette = usePalette();
  const mode = useShellWidth();
  const window = useWindowDimensions();
  const { termId, terms } = useTermId();
  const classes = useClasses(termId);
  const privates = usePrivateStudents(termId);
  const rows = classes.data?.results ?? [];
  const privateRows = privates.data?.results ?? [];
  const failure = terms.error instanceof Error ? terms.error.message : classes.error instanceof Error ? classes.error.message : null;
  const rail = mode === 'phone' ? 0 : window.width >= 1120 ? band.railExpanded : band.rail;
  const content = Math.max(280, window.width - rail - space.lg * 2);
  const columns = content >= 720 ? 2 : 1;

  const openClass = (row: ClassRow) => {
    router.push(`/siniflar/${row.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <Page>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Heading title="Sınıflarım" />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {rows.length > 0 ? <Count value={rows.length} label="sınıf" /> : null}
            {privateRows.length > 0 ? <Count value={privateRows.length} label="özel" tone="teal" /> : null}
          </View>
        </View>
        <State
          loading={terms.isLoading || classes.isLoading}
          error={failure}
          empty={!failure && !terms.isLoading && !classes.isLoading && !privates.isLoading && rows.length === 0 && privateRows.length === 0 ? 'Atanmış ders yok.' : null}
        >
          <View style={{ gap: space.lg, width: '100%' }}>
            {rows.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Label>Sınıflar</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {rows.map((row, index) => (
                    <View key={row.id} style={{ flexGrow: 1, flexBasis: columns === 2 ? '46%' : '100%', minWidth: columns === 2 ? 280 : undefined }}>
                      <ClassCard row={row} index={index} selected={false} onPress={() => openClass(row)} />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {privates.error instanceof Error ? <State error={privates.error.message} /> : null}
            {privateRows.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Label>Özel ders</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {privateRows.map((row, index) => (
                    <PrivateCard key={row.student_id} row={row} index={rows.length + index} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </State>
      </Page>
    </View>
  );
}
