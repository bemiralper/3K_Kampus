import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, BookOpen, CalendarDays } from 'lucide-react-native';

import { useHome, useTermId } from '@/api/teacher';
import { WEEKDAYS, clock, type LessonCell } from '@/api/types';
import { useSession } from '@/auth/store';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { band, space } from '@/design/tokens';
import { Appear, Press, Progress } from '@/flow/motion';
import { Card, Label, Page, State } from '@/flow/ui';
import { useMeasuredWidth } from '@/shell/layout';
import {
  LessonDetail,
  lessonKey,
  lessonKind,
  lessonKindIcon,
  lessonKindLabel,
  lessonPlace,
  lessonSpan,
  lessonStatusText,
  lessonTitle,
  sessionQuiet,
} from '@/ui/LessonDetail';
import { Sheet } from '@/ui/Sheet';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function minutes(value: string | null | undefined) {
  const text = clock(value);
  if (!text || !text.includes(':')) return null;
  const [h, m] = text.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now.getHours() * 60 + now.getMinutes();
}

function humanDate(iso: string | undefined, weekday: number | undefined) {
  if (!iso) return 'Bugün';
  const parts = iso.split('-').map(Number);
  const day = parts[2];
  const month = MONTHS[(parts[1] ?? 1) - 1] ?? '';
  const dayName = weekday != null ? WEEKDAYS[weekday] ?? '' : '';
  return [day && month ? `${day} ${month}` : iso, dayName].filter(Boolean).join(', ');
}

export default function HomeScreen() {
  const router = useRouter();
  const palette = usePalette();
  const account = useSession((state) => state.account);
  const teacher = [account?.ad, account?.soyad].filter(Boolean).join(' ');
  const { termId, terms } = useTermId();
  const home = useHome(termId);
  const measured = useMeasuredWidth();
  const now = useNow();
  const split = measured.width >= band.listMin + 340 + space.lg * 3;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const today = home.data?.today ?? [];
  const next = home.data?.next ?? null;
  const picked = today.find((cell) => lessonKey(cell) === selectedKey) ?? (next && lessonKey(next) === selectedKey ? next : null);
  const failure = terms.error instanceof Error ? terms.error.message : home.error instanceof Error ? home.error.message : null;
  const live = today.find((cell) => {
    if (sessionQuiet(cell.session)) return false;
    const s = minutes(cell.start);
    const e = minutes(cell.end);
    return s != null && e != null && now >= s && now < e;
  });
  const activeToday = today.filter((cell) => !sessionQuiet(cell.session));
  const done = activeToday.filter((cell) => (minutes(cell.end) ?? 0) <= now).length;
  const focusCell = live ?? next;
  const dateLabel = humanDate(home.data?.date, home.data?.weekday);

  function open(cell: LessonCell) {
    const key = lessonKey(cell);
    if (selectedKey === key && (!split ? sheetOpen : true)) {
      setSelectedKey(null);
      setSheetOpen(false);
      return;
    }
    setSelectedKey(key);
    if (!split) {
      setExpanded(false);
      setSheetOpen(true);
    }
  }

  const detailFor = (cell: LessonCell, onClose?: () => void) => (
    <LessonDetail
      cell={cell}
      live={live != null && lessonKey(live) === lessonKey(cell)}
      when={dateLabel}
      teacher={teacher || undefined}
      onClose={onClose}
      onClass={cell.kind !== 'private' && cell.class_lesson_plan_id != null ? () => router.push(`/siniflar/${cell.class_lesson_plan_id}`) : undefined}
      onStudent={cell.kind === 'private' && cell.student?.id != null ? () => router.push(`/ogrenci/${cell.student!.id}`) : undefined}
      onTopics={() => router.push('/konular')}
    />
  );

  const focusCard = focusCell ? (
    <Appear index={0}>
      <Card
        style={{
          padding: space.lg,
          gap: space.md,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: live ? palette.ok : palette.line,
          backgroundColor: palette.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: live ? palette.ok : palette.midnight }} />
            <AppText variant="caption" weight="bold" color={live ? palette.ok : palette.midnight} style={{ letterSpacing: 0.7, textTransform: 'uppercase' }}>
              {live ? 'Şu an derstesiniz' : 'Sıradaki ders'}
            </AppText>
          </View>
          <AppText variant="caption" weight="semibold" color={palette.muted} style={{ fontVariant: ['tabular-nums'] }}>
            {lessonSpan(focusCell)}
          </AppText>
        </View>
        <View style={{ gap: 4 }}>
          <AppText variant="section" weight="bold" color={palette.ink} lines={2}>
            {lessonTitle(focusCell)}
          </AppText>
          <AppText variant="support" weight="medium" color={palette.muted} lines={1}>
            {[lessonPlace(focusCell), focusCell.room?.name].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        {live ? (
          <Progress
            value={(now - (minutes(live.start) ?? now)) / Math.max(1, (minutes(live.end) ?? now + 1) - (minutes(live.start) ?? now))}
            color={palette.ok}
            track={palette.primaryContainer}
          />
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Dersi aç"
            onPress={() => open(focusCell)}
            style={{
              height: 44,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: palette.midnight,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AppText variant="caption" weight="bold" color="#FFFFFF">
              Dersi aç
            </AppText>
            <Icon icon={ArrowRight} color="#FFFFFF" size={16} />
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Konuyu işle"
            onPress={() => router.push('/konular')}
            style={{
              height: 44,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: palette.paper,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.line,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon icon={BookOpen} color={palette.ink} size={16} />
            <AppText variant="caption" weight="bold" color={palette.ink}>
              Konuyu işle
            </AppText>
          </Press>
        </View>
      </Card>
    </Appear>
  ) : (
    <Appear index={0}>
      <Card style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="caption" weight="bold" color={palette.muted} style={{ letterSpacing: 0.7, textTransform: 'uppercase' }}>
            Bugün
          </AppText>
          <AppText variant="card" weight="bold" color={palette.ink}>
            {today.length > 0 ? 'Bugünkü dersler tamamlandı' : 'Bugün planlanmış ders yok'}
          </AppText>
          <AppText variant="caption" color={palette.muted}>
            Haftalık programdan diğer günlerin derslerine bakabilirsiniz.
          </AppText>
        </View>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Programa git"
          onPress={() => router.push('/program')}
          style={{
            height: 44,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: palette.primaryContainer,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon icon={CalendarDays} color={palette.midnight} size={16} />
          <AppText variant="caption" weight="bold" color={palette.midnight}>
            Program
          </AppText>
        </Press>
      </Card>
    </Appear>
  );

  const timeline = (
    <View style={{ gap: 10 }}>
      {today.map((cell, index) => {
        const start = minutes(cell.start) ?? 0;
        const end = minutes(cell.end) ?? start;
        const quiet = sessionQuiet(cell.session);
        const past = !quiet && end <= now;
        const current = live != null && lessonKey(live) === lessonKey(cell);
        const active = picked != null && lessonKey(picked) === lessonKey(cell);
        const kind = lessonKind(cell);
        const kindColor = kind === 'private' ? palette.teal : palette.midnight;
        const status = lessonStatusText(cell, current);
        const statusColor = status === 'Şimdi' ? palette.ok : quiet ? palette.danger : palette.midnight;

        return (
          <Appear key={lessonKey(cell)} index={index + 1}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={`${lessonSpan(cell)} ${lessonTitle(cell)} ${lessonPlace(cell)}`}
              accessibilityState={{ selected: active }}
              onPress={() => open(cell)}
              scaleTo={0.99}
              style={{
                flexDirection: 'row',
                alignItems: 'stretch',
                borderRadius: 16,
                backgroundColor: palette.surface,
                borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                borderColor: active ? palette.midnight : current ? palette.ok : palette.line,
                paddingVertical: 14,
                paddingHorizontal: 16,
                gap: 14,
                opacity: (past || quiet) && !active ? 0.62 : 1,
              }}
            >
              <View style={{ width: 58, justifyContent: 'center', gap: 2 }}>
                <AppText weight="bold" color={palette.ink} style={{ fontSize: 16, fontVariant: ['tabular-nums'] }}>
                  {clock(cell.start)}
                </AppText>
                <AppText variant="caption" color={palette.muted} style={{ fontVariant: ['tabular-nums'] }}>
                  {clock(cell.end)}
                </AppText>
              </View>
              <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: palette.line }} />
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon icon={lessonKindIcon(kind)} size={13} color={kindColor} />
                    <AppText variant="caption" weight="bold" color={kindColor}>
                      {lessonKindLabel(kind)}
                    </AppText>
                  </View>
                  {status ? (
                    <AppText variant="caption" weight="bold" color={statusColor}>
                      · {status}
                    </AppText>
                  ) : null}
                </View>
                <AppText weight="bold" color={palette.ink} lines={1} style={quiet ? { textDecorationLine: 'line-through' } : undefined}>
                  {lessonTitle(cell)}
                </AppText>
                <AppText variant="caption" color={palette.muted} lines={1}>
                  {[lessonPlace(cell), cell.room?.name].filter(Boolean).join(' · ')}
                </AppText>
                {cell.topic?.name ? (
                  <AppText variant="caption" weight="semibold" color={palette.ink} lines={1}>
                    {cell.topic.name}
                  </AppText>
                ) : null}
              </View>
            </Press>
          </Appear>
        );
      })}
    </View>
  );

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm }}>
      <View style={{ gap: 2 }}>
        <AppText variant="caption" weight="semibold" color={palette.muted}>
          {dateLabel}
        </AppText>
        <AppText variant="page" weight="bold" color={palette.ink}>
          {account?.ad ? `${hello}, ${account.ad}` : hello}
        </AppText>
      </View>
      {home.data ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppText variant="caption" weight="semibold" color={palette.muted} style={{ fontVariant: ['tabular-nums'] }}>
            {activeToday.length} ders · {done} tamamlandı
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }} onLayout={measured.onLayout}>
      <View style={{ flex: 1, flexDirection: 'row', minWidth: 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Page>
            {header}
            <State loading={terms.isLoading || home.isLoading} error={failure} empty={!terms.isLoading && !termId ? 'Bu şubede aktif dönem yok.' : null}>
              {focusCard}
              {today.length > 0 ? (
                <View style={{ gap: space.sm, marginTop: 4 }}>
                  <Label>Günlük akış</Label>
                  {timeline}
                </View>
              ) : null}
            </State>
          </Page>
        </View>
        {split && picked ? (
          <View style={{ width: 340, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.line, backgroundColor: palette.surface }}>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
              {detailFor(picked, () => setSelectedKey(null))}
            </ScrollView>
          </View>
        ) : null}
      </View>
      <Sheet
        visible={!split && sheetOpen && picked != null}
        title={picked ? lessonTitle(picked) : 'Ders'}
        bare
        expanded={expanded}
        onClose={() => setSheetOpen(false)}
        onToggleExpanded={() => setExpanded((value) => !value)}
      >
        {picked ? detailFor(picked, () => setSheetOpen(false)) : null}
      </Sheet>
    </View>
  );
}
