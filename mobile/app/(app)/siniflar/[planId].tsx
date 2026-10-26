import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

import { useClasses, useStudents, useTermId } from '@/api/teacher';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Press } from '@/flow/motion';
import { Heading, Page } from '@/flow/ui';
import { LessonNotes } from '@/ui/LessonNotes';
import { StudentColumn } from '@/ui/Students';

export default function ClassStudentsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const id = Number(planId);
  const valid = Number.isFinite(id) ? id : null;
  const { termId, terms } = useTermId();
  const classes = useClasses(termId);
  const plan = (classes.data?.results ?? []).find((row) => row.id === valid) ?? null;
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const students = useStudents(termId, valid, query, groupId, page);
  const failure = terms.error instanceof Error ? terms.error.message : students.error instanceof Error ? students.error.message : null;

  const title = plan ? plan.sinif.ad : 'Öğrenciler';
  const lesson = plan ? [plan.ders.ad, `${plan.weekly_hours} saat`].filter(Boolean).join(' · ') : '';
  const count = students.data?.count ?? 0;

  return (
    <Page>
      <Press
        accessibilityRole="button"
        accessibilityLabel="Sınıflara dön"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/siniflar'))}
        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
      >
        <Icon icon={ArrowLeft} color={palette.midnight} size={17} />
        <AppText variant="caption" weight="bold" color={palette.midnight}>
          Sınıflara dön
        </AppText>
      </Press>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Heading title={title} />
          {lesson ? (
            <AppText weight="semibold" color={palette.midnight} lines={2}>
              {lesson}
            </AppText>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {count > 0 ? (
            <View style={{ minWidth: 76, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: palette.primaryContainer }}>
              <AppText weight="bold" color={palette.midnight} style={{ fontSize: 22, lineHeight: 26, fontVariant: ['tabular-nums'] }}>
                {count}
              </AppText>
              <AppText variant="caption" weight="semibold" color={palette.midnight}>
                öğrenci
              </AppText>
            </View>
          ) : null}
          {plan && valid != null ? <LessonNotes planId={valid} termId={termId} canWrite={plan.rol === 'PRIMARY'} /> : null}
        </View>
      </View>
      <View>
        <StudentColumn
          plan={plan}
          query={query}
          onQuery={(value) => {
            setQuery(value);
            setPage(1);
          }}
          groupId={groupId}
          onGroup={(value) => {
            setGroupId(value);
            setPage(1);
          }}
          page={page}
          onPage={setPage}
          loading={terms.isLoading || students.isLoading}
          error={failure}
          count={students.data?.count ?? 0}
          pageSize={students.data?.page_size ?? 0}
          rows={students.data?.results ?? []}
          selectedId={null}
          onOpen={(studentId, lessonPlan) => router.push(`/ogrenci/${studentId}?planId=${lessonPlan}`)}
        />
      </View>
    </Page>
  );
}
