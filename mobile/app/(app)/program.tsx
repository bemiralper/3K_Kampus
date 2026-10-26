import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useSchedule, useTermId } from '@/api/teacher';
import { clock, type LessonCell, type ScheduleDay, type ScheduleSlot } from '@/api/types';
import { useSession } from '@/auth/store';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Press } from '@/flow/motion';
import { Segmented, State } from '@/flow/ui';
import { useShellWidth, railWidth } from '@/shell/layout';
import { LessonDetail, lessonKey, lessonTitle } from '@/ui/LessonDetail';
import { LessonCard } from '@/ui/LessonCard';
import { Sheet } from '@/ui/Sheet';
import { WEEK_GUTTER, WEEK_MIN_DAY, WeekBoard, type WeekBoardHandle, type WeekColumn, type WeekEdges } from '@/ui/WeekBoard';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEK_NAMES: [string, string][] = [
  ['Pazartesi', 'Pzt'],
  ['Salı', 'Sal'],
  ['Çarşamba', 'Çar'],
  ['Perşembe', 'Per'],
  ['Cuma', 'Cum'],
  ['Cumartesi', 'Cmt'],
  ['Pazar', 'Paz'],
];
const PANEL = 336;

function weekLabel(start: string, end: string) {
  const startYear = start.slice(0, 4);
  const [startMonth, startDay] = start.split('-').slice(1).map(Number);
  const [endMonth, endDay] = end.split('-').slice(1).map(Number);
  if (startMonth === endMonth) return `${startDay} – ${endDay} ${MONTHS[startMonth - 1]} ${startYear}`;
  return `${startDay} ${MONTHS[startMonth - 1]} – ${endDay} ${MONTHS[endMonth - 1]} ${startYear}`;
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return date;
}

function weekdayIndex(now = new Date()) {
  return now.getDay() === 0 ? 6 : now.getDay() - 1;
}

function minutesOf(value: string | null | undefined) {
  const text = clock(value);
  if (!text || !text.includes(':')) return null;
  const [hour, minute] = text.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function useNowClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return { weekday: weekdayIndex(now), minutes: now.getHours() * 60 + now.getMinutes() };
}

function lessonIsLive(cell: LessonCell, weekday: number, minutes: number) {
  if (cell.day_id !== weekday) return false;
  if (cell.session && cell.session.status !== 'SCHEDULED') return false;
  const start = minutesOf(cell.start);
  const end = minutesOf(cell.end);
  if (start == null || end == null) return false;
  return minutes >= start && minutes < end;
}

function buildColumns(days: ScheduleDay[], weekStart?: string): WeekColumn[] {
  const known = new Map(days.filter((day) => day.id >= 0 && day.id <= 6).map((day) => [day.id, day]));
  const week = WEEK_NAMES.map(([name, short], id) => {
    const found = known.get(id);
    return { id, name: found?.name || name, shortName: found?.short_name || short };
  });
  const extra = days
    .filter((day) => day.id < 0 || day.id > 6)
    .sort((a, b) => a.order - b.order)
    .map((day) => ({ id: day.id, name: day.name, shortName: day.short_name || day.name.slice(0, 3) }));
  return [...week, ...extra].map((day) => {
    if (!weekStart || day.id < 0 || day.id > 6) return { ...day, date: null, month: null };
    const date = shiftDate(weekStart, day.id);
    return { ...day, date: date.getDate(), month: MONTHS[date.getMonth()] ?? null };
  });
}

function rowsFrom(slots: ScheduleSlot[] | undefined, cells: LessonCell[]): ScheduleSlot[] {
  const rows = [...(slots ?? [])];
  const seen = new Set(rows.map((slot) => clock(slot.start)).filter(Boolean));
  for (const cell of cells) {
    const key = clock(cell.start);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: `ders-${key}`, start: cell.start, end: cell.end, order: 1000 + rows.length });
  }
  return rows
    .filter((slot) => clock(slot.start))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || (a.order ?? 0) - (b.order ?? 0));
}

function focusNode(id: string) {
  if (Platform.OS !== 'web') return;
  const node = globalThis.document?.getElementById(id) as { focus?: () => void } | null;
  node?.focus?.();
}

function whenOf(column: WeekColumn | undefined) {
  if (!column) return undefined;
  if (column.date == null) return column.name;
  return `${column.name}, ${column.date} ${column.month ?? ''}`.trim();
}

export default function ScheduleScreen() {
  const router = useRouter();
  const palette = usePalette();
  const mode = useShellWidth();
  const { width: windowWidth } = useWindowDimensions();
  const account = useSession((state) => state.account);
  const teacher = [account?.ad, account?.soyad].filter(Boolean).join(' ');
  const { termId: currentId, termName, terms } = useTermId();
  const [pickedTerm, setPickedTerm] = useState<number | null>(null);
  const termId = pickedTerm ?? currentId;
  const schedule = useSchedule(termId);
  const termList = terms.data?.results ?? [];
  const activeName = termList.find((term) => term.id === termId)?.name || termName;
  const nowClock = useNowClock();
  const today = nowClock.weekday;
  const [day, setDay] = useState(today);
  const [view, setView] = useState<'week' | 'day' | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [edges, setEdges] = useState<WeekEdges>({ overflows: false, atStart: true, atEnd: true });
  const boardRef = useRef<WeekBoardHandle>(null);
  const week = (view ?? (mode === 'phone' ? 'day' : 'week')) === 'week';
  const cells = schedule.data?.cells ?? [];
  const columns = buildColumns(schedule.data?.days ?? [], schedule.data?.week?.start);
  const rows = rowsFrom(schedule.data?.slots, cells);
  const pad = space.md;
  const navRail = mode === 'phone' ? 0 : windowWidth >= 1120 ? 216 : railWidth(mode);
  const contentWidth = Math.max(0, windowWidth - navRail);
  const panelFits = contentWidth - pad * 2 - PANEL - 12 - WEEK_GUTTER >= WEEK_MIN_DAY * Math.max(columns.length, 1);
  const showSide = mode !== 'phone' && (week ? panelFits : contentWidth >= 920);
  const dayCells = cells.filter((cell) => cell.day_id === day).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const picked = cells.find((cell) => lessonKey(cell) === selectedKey) ?? null;
  const activeColumn = columns.find((column) => column.id === day) ?? columns[0];
  const failure = terms.error instanceof Error ? terms.error.message : schedule.error instanceof Error ? schedule.error.message : null;
  const loading = terms.isLoading || schedule.isLoading;
  const emptyTerm = !loading && !failure && termId != null && cells.length === 0;
  const range = schedule.data?.week ? weekLabel(schedule.data.week.start, schedule.data.week.end) : '';
  const detailOpen = picked != null && (showSide || sheetOpen);

  const onEdges = useCallback((next: WeekEdges) => {
    setEdges((current) => (current.overflows === next.overflows && current.atStart === next.atStart && current.atEnd === next.atEnd ? current : next));
  }, []);

  const live = useCallback((cell: LessonCell) => lessonIsLive(cell, nowClock.weekday, nowClock.minutes), [nowClock.minutes, nowClock.weekday]);

  useEffect(() => {
    if (showSide) setSheetOpen(false);
  }, [showSide]);

  useEffect(() => {
    if (!detailOpen) return;
    const timer = setTimeout(() => focusNode('ders-ayrinti-kapat'), 60);
    return () => clearTimeout(timer);
  }, [detailOpen, selectedKey]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !detailOpen) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function dismiss() {
    const key = selectedKey;
    setSheetOpen(false);
    setSelectedKey(null);
    if (key) requestAnimationFrame(() => focusNode(`ders-${key}`));
  }

  function choose(cell: LessonCell) {
    setSelectedKey(lessonKey(cell));
    if (!showSide) {
      setExpanded(false);
      setSheetOpen(true);
    }
  }

  function goToday() {
    setDay(today);
    const index = columns.findIndex((column) => column.id === today);
    if (index >= 0) boardRef.current?.reveal(index);
  }

  const detailFor = (cell: LessonCell) => (
    <LessonDetail
      cell={cell}
      live={live(cell)}
      when={whenOf(columns.find((column) => column.id === cell.day_id))}
      teacher={teacher || undefined}
      onClose={dismiss}
      onClass={cell.kind !== 'private' && cell.class_lesson_plan_id != null ? () => router.push(`/siniflar/${cell.class_lesson_plan_id}`) : undefined}
      onStudent={cell.kind === 'private' && cell.student?.id != null ? () => router.push(`/ogrenci/${cell.student!.id}`) : undefined}
      onTopics={() => router.push('/konular')}
    />
  );

  const controls = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Press
        accessibilityRole="button"
        accessibilityLabel="Bugüne git"
        onPress={goToday}
        style={{
          minWidth: 44,
          height: 44,
          paddingHorizontal: 14,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.line,
        }}
      >
        <AppText variant="caption" weight="bold" color={palette.ink}>
          Bugün
        </AppText>
      </Press>
      {week && edges.overflows ? (
        <>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Önceki günler"
            accessibilityState={{ disabled: edges.atStart }}
            disabled={edges.atStart}
            onPress={() => boardRef.current?.nudge(-1)}
            style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, opacity: edges.atStart ? 0.4 : 1 }}
          >
            <Icon icon={ChevronLeft} size={18} color={palette.ink} />
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Sonraki günler"
            accessibilityState={{ disabled: edges.atEnd }}
            disabled={edges.atEnd}
            onPress={() => boardRef.current?.nudge(1)}
            style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, opacity: edges.atEnd ? 0.4 : 1 }}
          >
            <Icon icon={ChevronRight} size={18} color={palette.ink} />
          </Press>
        </>
      ) : null}
      <View style={{ flexGrow: 1, flexBasis: 168, minWidth: 168, maxWidth: 220 }}>
        <Segmented
          items={[
            { key: 'week', label: 'Hafta' },
            { key: 'day', label: 'Gün' },
          ]}
          value={week ? 'week' : 'day'}
          onChange={(key) => setView(key as 'week' | 'day')}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: palette.paper }}>
      <View style={{ flex: 1, flexDirection: 'row', minWidth: 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ paddingHorizontal: pad, paddingTop: space.md, gap: space.md }}>
            <View style={{ flexDirection: contentWidth < 760 ? 'column' : 'row', justifyContent: 'space-between', alignItems: contentWidth < 760 ? 'stretch' : 'flex-end', gap: space.md }}>
              <View style={{ flexShrink: 1, gap: 4 }}>
                <AppText variant="page" weight="bold" color={palette.ink}>
                  {week ? 'Ders Programım' : 'Derslerim'}
                </AppText>
                <AppText variant="support" color={palette.muted}>
                  {week ? 'Haftalık derslerinizi görüntüleyin ve yönetin.' : activeName || 'Günün dersleri'}
                </AppText>
              </View>
              {week ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {edges.overflows ? (
                    <Press
                      accessibilityRole="button"
                      accessibilityLabel="Önceki günler"
                      accessibilityState={{ disabled: edges.atStart }}
                      disabled={edges.atStart}
                      onPress={() => boardRef.current?.nudge(-1)}
                      style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, opacity: edges.atStart ? 0.4 : 1 }}
                    >
                      <Icon icon={ChevronLeft} size={16} color={palette.ink} />
                    </Press>
                  ) : null}
                  {range ? (
                    <AppText weight="bold" color={palette.ink} style={{ fontVariant: ['tabular-nums'] }}>
                      {range}
                    </AppText>
                  ) : null}
                  {edges.overflows ? (
                    <Press
                      accessibilityRole="button"
                      accessibilityLabel="Sonraki günler"
                      accessibilityState={{ disabled: edges.atEnd }}
                      disabled={edges.atEnd}
                      onPress={() => boardRef.current?.nudge(1)}
                      style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, opacity: edges.atEnd ? 0.4 : 1 }}
                    >
                      <Icon icon={ChevronRight} size={16} color={palette.ink} />
                    </Press>
                  ) : null}
                  <Press
                    accessibilityRole="button"
                    accessibilityLabel="Bugüne git"
                    onPress={goToday}
                    style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line }}
                  >
                    <AppText variant="caption" weight="bold" color={palette.ink}>
                      Bugün
                    </AppText>
                  </Press>
                  <View style={{ minWidth: 168, maxWidth: 200 }}>
                    <Segmented
                      items={[
                        { key: 'week', label: 'Hafta' },
                        { key: 'day', label: 'Gün' },
                      ]}
                      value="week"
                      onChange={(key) => setView(key as 'week' | 'day')}
                    />
                  </View>
                </View>
              ) : (
                controls
              )}
            </View>
            {termList.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {termList.map((term) => {
                  const selected = term.id === termId;
                  return (
                    <Press
                      key={term.id}
                      accessibilityRole="button"
                      accessibilityLabel={term.name}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setPickedTerm(term.id);
                        setSelectedKey(null);
                        setSheetOpen(false);
                      }}
                      style={{
                        height: 44,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        justifyContent: 'center',
                        backgroundColor: selected ? palette.midnight : palette.surface,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: selected ? palette.midnight : palette.line,
                      }}
                    >
                      <AppText variant="caption" weight={selected ? 'bold' : 'medium'} color={selected ? '#FFFFFF' : palette.ink}>
                        {term.name}
                      </AppText>
                    </Press>
                  );
                })}
              </ScrollView>
            ) : null}
            {week ? null : (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {columns.map((column) => {
                  const selected = column.id === day;
                  return (
                    <Press
                      key={column.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${column.name}${column.date != null ? ` ${column.date}` : ''}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setDay(column.id);
                        setSelectedKey(null);
                        setSheetOpen(false);
                      }}
                      style={{ flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <AppText variant="caption" weight={selected ? 'bold' : 'medium'} color={selected ? palette.midnight : palette.muted} lines={1} style={{ fontSize: 11 }}>
                        {column.shortName}
                      </AppText>
                      {column.date != null ? (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: selected ? '#1E3A5F' : 'transparent',
                          }}
                        >
                          <AppText weight="bold" color={selected ? '#FFFFFF' : palette.ink} style={{ fontSize: 15, fontVariant: ['tabular-nums'] }}>
                            {column.date}
                          </AppText>
                        </View>
                      ) : null}
                    </Press>
                  );
                })}
              </View>
            )}
            {week && edges.overflows ? (
              <AppText variant="caption" color={palette.muted}>
                Yana kaydırarak haftanın diğer günlerine geçin.
              </AppText>
            ) : null}
          </View>
          {loading || failure || emptyTerm ? (
            <State loading={loading} error={failure} empty={emptyTerm ? 'Bu dönem için yayınlanmış program yok.' : null} />
          ) : (
            <>
              <View
                style={{ flex: 1, minHeight: 0, display: week ? 'flex' : 'none' }}
                pointerEvents={week ? 'auto' : 'none'}
                accessibilityElementsHidden={!week}
                importantForAccessibility={week ? 'auto' : 'no-hide-descendants'}
              >
                <WeekBoard
                  ref={boardRef}
                  columns={columns}
                  rows={rows}
                  cells={cells}
                  todayId={today}
                  selectedDayId={day}
                  selectedKey={selectedKey}
                  nowMinutes={nowClock.minutes}
                  isLive={live}
                  idPrefix={week ? 'ders' : 'hafta'}
                  onSelectDay={setDay}
                  onSelectCell={choose}
                  onEdges={onEdges}
                />
              </View>
              {week ? null : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: pad, paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <AppText weight="bold" color={palette.ink}>
                      {day === today ? 'Bugünkü Program' : activeColumn?.name || 'Program'}
                    </AppText>
                    <AppText variant="caption" weight="semibold" color={palette.muted}>
                      {dayCells.length} ders
                    </AppText>
                  </View>
                  {dayCells.length === 0 ? (
                    <State empty="Bu günde ders yok." />
                  ) : (
                    dayCells.map((cell) => (
                      <LessonCard
                        key={lessonKey(cell)}
                        cell={cell}
                        dayName={activeColumn?.name || ''}
                        selected={selectedKey === lessonKey(cell)}
                        live={live(cell)}
                        compact={false}
                        layout="agenda"
                        nativeID={`ders-${lessonKey(cell)}`}
                        onPress={() => choose(cell)}
                      />
                    ))
                  )}
                </ScrollView>
              )}
            </>
          )}
        </View>
        {showSide ? (
          <View style={{ width: PANEL, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.line, backgroundColor: palette.paper }}>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
              {picked ? detailFor(picked) : <State empty="Bir ders seçin." />}
            </ScrollView>
          </View>
        ) : null}
      </View>
      {mode === 'phone' ? (
        <Sheet visible={!showSide && sheetOpen && picked != null} title={picked ? lessonTitle(picked) : 'Ders'} bare expanded={expanded} onClose={dismiss} onToggleExpanded={() => setExpanded((value) => !value)}>
          {picked ? detailFor(picked) : null}
        </Sheet>
      ) : (
        <Modal visible={!showSide && sheetOpen && picked != null} transparent animationType="none" onRequestClose={dismiss}>
          <View style={{ flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(11,20,48,0.45)' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ayrıntıyı kapat" onPress={dismiss} style={StyleSheet.absoluteFill} />
            <View
              style={{
                width: '100%',
                maxWidth: 440,
                maxHeight: '80%',
                alignSelf: 'center',
                backgroundColor: palette.surface,
                borderRadius: 20,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.line,
                overflow: 'hidden',
              }}
            >
              <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
                {picked ? detailFor(picked) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
