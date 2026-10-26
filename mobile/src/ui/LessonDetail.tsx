import { StyleSheet, View } from 'react-native';
import { Plus, RotateCcw, UserRound, Users } from 'lucide-react-native';

import { clock, type LessonCell, type LessonSessionMark } from '@/api/types';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Press } from '@/flow/motion';

export function lessonKey(cell: LessonCell) {
  return `${cell.kind}-${cell.id}`;
}

export function lessonTitle(cell: LessonCell) {
  return cell.lesson?.name || 'Ders';
}

export function lessonPlace(cell: LessonCell) {
  if (cell.kind === 'private') return cell.student?.name || 'Özel ders';
  return cell.classroom?.name || 'Sınıf dersi';
}

export function lessonSpan(cell: LessonCell) {
  const start = clock(cell.start);
  const end = clock(cell.end);
  if (start && end) return `${start}–${end}`;
  return start || end;
}

export function sessionMark(session: LessonSessionMark | null | undefined) {
  if (!session) return null;
  if (session.status !== 'SCHEDULED') return session.status_label;
  if (session.kind === 'MAKEUP' || session.kind === 'EXTRA') return session.kind_label;
  return null;
}

export function sessionQuiet(session: LessonSessionMark | null | undefined) {
  return session?.status === 'CANCELLED' || session?.status === 'POSTPONED' || session?.status === 'NO_SHOW';
}

export type LessonKind = 'class' | 'private' | 'makeup' | 'extra';

export function lessonKind(cell: LessonCell): LessonKind {
  if (cell.session?.kind === 'MAKEUP') return 'makeup';
  if (cell.session?.kind === 'EXTRA') return 'extra';
  if (cell.kind === 'private') return 'private';
  return 'class';
}

export function lessonKindLabel(kind: LessonKind) {
  if (kind === 'makeup') return 'Telafi';
  if (kind === 'extra') return 'Ek ders';
  if (kind === 'private') return 'Özel';
  return 'Sınıf';
}

export function lessonKindIcon(kind: LessonKind) {
  if (kind === 'makeup') return RotateCcw;
  if (kind === 'extra') return Plus;
  if (kind === 'private') return UserRound;
  return Users;
}

export function lessonStatusText(cell: LessonCell, live: boolean) {
  if (cell.session && cell.session.status !== 'SCHEDULED') return cell.session.status_label;
  if (live) return 'Şimdi';
  return null;
}

export function LessonDetail({
  cell,
  onClass,
  onStudent,
  onTopics,
  onClose,
  live = false,
  when,
  teacher,
}: {
  cell: LessonCell;
  onClass?: () => void;
  onStudent?: () => void;
  onTopics: () => void;
  onClose?: () => void;
  live?: boolean;
  when?: string;
  teacher?: string;
}) {
  const palette = usePalette();
  const kind = lessonKind(cell);
  const quiet = sessionQuiet(cell.session);
  const status = lessonStatusText(cell, live);
  const who = cell.kind === 'private' ? cell.student?.name : cell.classroom?.name;
  const destination = onClass ? { label: 'Sınıfa git', onPress: onClass } : onStudent ? { label: 'Öğrenciyi aç', onPress: onStudent } : null;
  const kindColor = kind === 'private' ? palette.teal : palette.midnight;
  const statusColor = status === 'Şimdi' ? palette.ok : quiet ? palette.danger : palette.midnight;
  const facts = [
    when ? { label: 'Tarih', value: when } : null,
    lessonSpan(cell) ? { label: 'Saat', value: lessonSpan(cell) } : null,
    teacher ? { label: 'Öğretmen', value: teacher } : null,
    who ? { label: cell.kind === 'private' ? 'Öğrenci' : 'Sınıf', value: who } : null,
    cell.room?.name ? { label: 'Derslik', value: cell.room.name } : null,
    status ? { label: 'Durum', value: status } : null,
    cell.topic?.name ? { label: 'Konu', value: cell.topic.name } : null,
  ].filter((fact): fact is { label: string; value: string } => fact != null);

  return (
    <View style={{ gap: space.lg, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon icon={lessonKindIcon(kind)} size={16} color={kindColor} />
            <AppText variant="caption" weight="bold" color={kindColor}>
              {lessonKindLabel(kind)}
            </AppText>
          </View>
          <AppText variant="section" weight="bold" color={palette.ink} style={quiet ? { textDecorationLine: 'line-through' } : undefined}>
            {lessonTitle(cell)}
          </AppText>
        </View>
        {onClose ? (
          <Press
            nativeID="ders-ayrinti-kapat"
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={onClose}
            style={{ minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}
          >
            <AppText variant="caption" weight="bold" color={palette.muted}>
              Kapat
            </AppText>
          </Press>
        ) : null}
      </View>
      <View style={{ gap: space.md }}>
        {facts.map((fact) => (
          <View key={fact.label} style={{ gap: 2 }}>
            <AppText variant="caption" weight="medium" color={palette.muted}>
              {fact.label}
            </AppText>
            <AppText variant="support" weight="semibold" color={fact.label === 'Durum' ? statusColor : palette.ink}>
              {fact.value}
            </AppText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {destination ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={destination.label}
            onPress={destination.onPress}
            style={{ flexGrow: 1, flexBasis: 148, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.midnight }}
          >
            <AppText variant="button" weight="bold" color="#FFFFFF">
              {destination.label}
            </AppText>
          </Press>
        ) : null}
        <Press
          accessibilityRole="button"
          accessibilityLabel="Konuyu işle"
          onPress={onTopics}
          style={{
            flexGrow: 1,
            flexBasis: 148,
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: palette.line,
          }}
        >
          <AppText variant="button" weight="bold" color={palette.ink}>
            Konuyu işle
          </AppText>
        </Press>
      </View>
    </View>
  );
}
