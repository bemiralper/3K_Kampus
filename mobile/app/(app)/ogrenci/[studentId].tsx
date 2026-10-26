import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

import { API_URL } from '@/api/client';
import { usePrivateStudents, useStudent, useStudentExams, useTermId } from '@/api/teacher';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Appear, Press } from '@/flow/motion';
import { Avatar, Card, Label, Page, State } from '@/flow/ui';
import { ExamAnalysis } from '@/ui/ExamAnalysis';
import { LessonNotes } from '@/ui/LessonNotes';

function photoUri(photo: string) {
  if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
  return `${API_URL}${photo.startsWith('/') ? '' : '/'}${photo}`;
}

function Pill({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  if (!value.trim()) return null;
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.paper,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.line,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <AppText variant="caption" color={palette.muted}>
        {label}
      </AppText>
      <AppText variant="caption" weight="bold" color={palette.ink}>
        {value}
      </AppText>
    </View>
  );
}

export default function StudentScreen() {
  const router = useRouter();
  const palette = usePalette();
  const params = useLocalSearchParams<{ studentId: string; planId?: string }>();
  const studentId = Number(params.studentId);
  const planId = Number(params.planId);
  const validStudent = Number.isFinite(studentId) ? studentId : null;
  const validPlan = Number.isFinite(planId) && planId > 0 ? planId : null;
  const { termId, terms } = useTermId();
  const card = useStudent(termId, validPlan, validStudent);
  const privates = usePrivateStudents(validPlan == null ? termId : null);
  const exams = useStudentExams(termId, validStudent);
  const fromPrivate = (privates.data?.results ?? []).find((row) => row.student_id === validStudent) ?? null;
  const failure =
    terms.error instanceof Error
      ? terms.error.message
      : card.error instanceof Error
        ? card.error.message
        : privates.error instanceof Error
          ? privates.error.message
          : null;
  const waiting = terms.isLoading || (validPlan != null ? card.isLoading : privates.isLoading);
  const person = card.data
    ? {
        ad: card.data.ad,
        soyad: card.data.soyad,
        okulNo: card.data.okul_no,
        sinif: card.data.sinif,
        grup: card.data.grup,
        photo: card.data.profil_foto,
        lessons: card.data.dersler.map((lesson) => ({
          key: String(lesson.plan_id),
          label: lesson.ders,
          place: [lesson.sinif, lesson.grup].filter(Boolean).join(' · '),
        })),
      }
    : fromPrivate
      ? {
          ad: fromPrivate.ad,
          soyad: fromPrivate.soyad,
          okulNo: fromPrivate.okul_no,
          sinif: fromPrivate.sinif,
          grup: fromPrivate.grup,
          photo: fromPrivate.profil_foto,
          lessons: fromPrivate.dersler.map((lesson, index) => ({ key: `${lesson}-${index}`, label: lesson, place: 'Özel ders' })),
        }
      : null;
  const ready = person != null;

  return (
    <Page>
      <Press
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/siniflar'))}
        style={{
          alignSelf: 'flex-start',
          height: 40,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: palette.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon icon={ArrowLeft} color={palette.ink} size={17} />
        <AppText variant="caption" weight="bold" color={palette.ink}>
          Sınıflara dön
        </AppText>
      </Press>
      <State loading={waiting} error={failure} empty={!waiting && !failure && !ready ? 'Kart açılamadı.' : null}>
        {person ? (
          <View style={{ gap: space.md }}>
            <Appear index={0}>
              <Card style={{ padding: space.lg, gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  {person.photo ? (
                    <Image
                      accessible={false}
                      source={{ uri: photoUri(person.photo) }}
                      style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: palette.primaryContainer }}
                    />
                  ) : (
                    <Avatar label={`${person.ad} ${person.soyad}`} size={68} />
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm }}>
                      <AppText variant="section" weight="bold" color={palette.ink} lines={2} style={{ flex: 1, minWidth: 0 }}>
                        {person.ad} {person.soyad}
                      </AppText>
                      {validPlan == null && fromPrivate ? <LessonNotes planId={null} termId={termId} canWrite={false} /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Pill label="Sınıf" value={person.sinif} />
                      <Pill label="Grup" value={person.grup} />
                      <Pill label="No" value={person.okulNo} />
                    </View>
                  </View>
                </View>
                {person.lessons.length > 0 ? (
                  <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, paddingTop: space.md, gap: 8 }}>
                    <Label>Aldığı dersleriniz</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {person.lessons.map((lesson) => (
                        <View
                          key={lesson.key}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 12,
                            backgroundColor: palette.primaryContainer,
                            gap: 1,
                          }}
                        >
                          <AppText variant="caption" weight="bold" color={palette.midnight}>
                            {lesson.label}
                          </AppText>
                          {lesson.place ? (
                            <AppText variant="caption" color={palette.muted}>
                              {lesson.place}
                            </AppText>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </Card>
            </Appear>
            <Appear index={1}>
              <ExamAnalysis
                ders={person.lessons.map((lesson) => lesson.label).join(' · ')}
                data={exams.data}
                loading={exams.isLoading}
                error={exams.error instanceof Error ? exams.error.message : null}
              />
            </Appear>
          </View>
        ) : null}
      </State>
    </Page>
  );
}
