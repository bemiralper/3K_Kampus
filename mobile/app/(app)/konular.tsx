import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';

import { ApiError } from '@/api/client';
import { saveTopic, useClasses, useSchedule, useTermId, useTopicCatalog, useTopics } from '@/api/teacher';
import { WEEKDAYS, clock, type CatalogTopic } from '@/api/types';
import { useSession } from '@/auth/store';
import { useFontState } from '@/design/fonts';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { font, space } from '@/design/tokens';
import { Appear, Press } from '@/flow/motion';
import { SearchField } from '@/flow/SearchField';
import { Button, Card, Heading, Label, Page, Segmented, State } from '@/flow/ui';
import { useMeasuredWidth, useShellWidth } from '@/shell/layout';
import { dateForWeekday, newRequestKey, readTopicDraft, writeTopicDraft } from '@/topics/draft';
import { Sheet } from '@/ui/Sheet';

const SHORT_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const EMPTY_DAY = 'Bu tarih için işlenen konu yok.';
const EMPTY_CATALOG = 'Bu ders için konu eşlemesi yok. Not yazabilirsiniz.';

function shownDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

const SMALL_WORDS = new Set(['ve', 'ile', 'veya', 'ya', 'da', 'de']);

function titleCaseIfShouting(value: string) {
  const sample = value.replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  if (!sample || sample !== sample.toLocaleUpperCase('tr-TR')) return value;
  return value
    .toLocaleLowerCase('tr-TR')
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      if (index > 0 && SMALL_WORDS.has(part)) return part;
      const head = part.charAt(0).toLocaleUpperCase('tr-TR');
      return head + part.slice(1);
    })
    .join('');
}

function topicFace(item: { name: string; code?: string }) {
  const raw = item.name.trim();
  const maarif = /^maarif\b/i.test(raw);
  const title = titleCaseIfShouting(
    raw
      .replace(/^maarif\s*·\s*/i, '')
      .replace(/^\d{1,2}\.\s*sınıf\s*·\s*/i, '')
      .trim(),
  );
  return {
    title: title || raw,
    program: maarif ? 'Maarif modeli' : '2018 programı',
    code: (item.code ?? '').trim(),
  };
}

function catalogGroups(items: CatalogTopic[]) {
  const subjects = new Set(items.map((item) => item.subject).filter(Boolean));
  const groups = new Map<string, CatalogTopic[]>();
  for (const item of items) {
    const face = topicFace(item);
    const key = subjects.size > 1 && item.subject ? `${item.subject} · ${face.program}` : face.program;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

function topicMatches(item: CatalogTopic, needle: string) {
  const face = topicFace(item);
  const blob = [face.title, face.code, item.name, ...(item.outcomes ?? []).flatMap((outcome) => [outcome.code, outcome.text])]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  return blob.includes(needle);
}

export default function TopicsScreen() {
  const palette = usePalette();
  const fonts = useFontState();
  const mode = useShellWidth();
  const measured = useMeasuredWidth();
  const queryClient = useQueryClient();
  const account = useSession((state) => state.account);
  const kurumId = useSession((state) => state.kurumId);
  const subeId = useSession((state) => state.subeId);
  const { termId, terms } = useTermId();
  const classes = useClasses(termId);
  const schedule = useSchedule(termId);
  const [planId, setPlanId] = useState<number | null>(null);
  const [day, setDay] = useState(() => (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
  const [cellId, setCellId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [outcomeIds, setOutcomeIds] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [draftReady, setDraftReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formExpanded, setFormExpanded] = useState(false);
  const sessionDate = dateForWeekday(day);
  const catalog = useTopicCatalog(termId, planId);
  const topics = useTopics(termId, planId, cellId, sessionDate);
  const rows = classes.data?.results ?? [];
  const selected = rows.find((row) => row.id === planId) ?? null;
  const canWrite = selected?.rol === 'PRIMARY';
  const cells = (schedule.data?.cells ?? []).filter((cell) => cell.kind === 'class' && cell.class_lesson_plan_id === planId && cell.day_id === day);
  const recorded = topics.data?.results ?? [];
  const catalogItems = catalog.data?.results ?? [];
  const phone = mode === 'phone';
  const sideBySide = !phone && measured.width >= 760;

  useEffect(() => {
    if (planId != null || !classes.data?.results.length) return;
    setPlanId(classes.data.results[0].id);
  }, [classes.data, planId]);

  useEffect(() => {
    const next = (schedule.data?.cells ?? []).filter((cell) => cell.kind === 'class' && cell.class_lesson_plan_id === planId && cell.day_id === day);
    if (cellId != null && next.some((cell) => cell.id === cellId)) return;
    setCellId(next[0]?.id ?? null);
  }, [schedule.data, planId, day, cellId]);

  useEffect(() => {
    if (!account || kurumId == null || subeId == null || planId == null || cellId == null) return;
    let cancelled = false;
    setDraftReady(false);
    readTopicDraft(account.id, kurumId, subeId, planId, cellId, sessionDate).then((draft) => {
      if (cancelled) return;
      setTopicId(draft?.topicId ?? null);
      setOutcomeIds(draft?.outcomeIds ?? []);
      setNote(draft?.note ?? '');
      setRequestKey(draft?.key ?? newRequestKey());
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [account, kurumId, subeId, planId, cellId, sessionDate]);

  useEffect(() => {
    if (!draftReady || !account || kurumId == null || subeId == null || planId == null || cellId == null) return;
    const hasText = note.trim() !== '' || topicId != null;
    writeTopicDraft(
      account.id,
      kurumId,
      subeId,
      planId,
      cellId,
      sessionDate,
      hasText ? { topicId, outcomeIds, note, key: requestKey } : null,
    );
  }, [draftReady, account, kurumId, subeId, planId, cellId, sessionDate, topicId, outcomeIds, note, requestKey]);

  async function submit() {
    if (!canWrite || termId == null || planId == null || cellId == null) return;
    setPending(true);
    setMessage(null);
    try {
      await saveTopic({ planId, termId, cellId, sessionDate, topicId, outcomeIds, note, idempotencyKey: requestKey });
      setTopicId(null);
      setOutcomeIds([]);
      setNote('');
      setRequestKey(newRequestKey());
      setMessage('Kaydedildi.');
      setFormOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher-topics'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-schedule'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-home'] }),
      ]);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Kayıt gönderilemedi. Metin taslak olarak duruyor.');
    } finally {
      setPending(false);
    }
  }

  const catalogList = (
    <CatalogList
      key={planId ?? 'none'}
      items={catalogItems}
      loading={catalog.isLoading}
      empty={!catalog.isLoading && catalogItems.length === 0}
      error={catalog.error instanceof Error ? catalog.error.message : null}
      topicId={topicId}
      outcomeIds={outcomeIds}
      onTopic={(id) => {
        setTopicId(id);
        setOutcomeIds([]);
      }}
      onOutcome={(id) => setOutcomeIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
    />
  );

  const noteBox = (
    <NoteBox note={note} onNote={setNote} message={message} pending={pending} fontsActive={fonts.active} topicId={topicId} ready={cellId != null} onSubmit={submit} />
  );

  const chooseClass = (id: number) => {
    setPlanId(id);
    setCellId(null);
    setMessage(null);
    setFormOpen(false);
  };

  const classStrip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {rows.map((row) => {
        const active = planId === row.id;
        return (
          <Press
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`${row.sinif.ad} ${row.ders.ad}`}
            accessibilityState={{ selected: active }}
            onPress={() => chooseClass(row.id)}
            style={{ minWidth: 148, maxWidth: 220, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, backgroundColor: active ? palette.midnight : palette.surface, borderWidth: 1, borderColor: active ? palette.midnight : palette.line, gap: 2 }}
          >
            <AppText weight="bold" color={active ? '#FFFFFF' : palette.ink} lines={1}>
              {row.sinif.ad}
            </AppText>
            <AppText variant="caption" color={active ? 'rgba(255,255,255,0.75)' : palette.muted} lines={1}>
              {row.ders.ad}
            </AppText>
          </Press>
        );
      })}
    </ScrollView>
  );

  const dayPicker = (
    <Segmented
      items={WEEKDAYS.map((name, index) => ({ key: String(index), label: SHORT_DAYS[index] ?? name.slice(0, 3) }))}
      value={String(day)}
      onChange={(key) => {
        setDay(Number(key));
        setCellId(null);
        setMessage(null);
        setFormOpen(false);
      }}
    />
  );

  const lessonSlots = (
    <View style={{ gap: space.sm }}>
      <Label>Ders saati</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {cells.map((cell, index) => {
          const active = cellId === cell.id;
          return (
            <Appear key={cell.id} index={index}>
              <Press
                accessibilityRole="button"
                accessibilityLabel={`${clock(cell.start)} ${cell.classroom?.name ?? ''}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setCellId(cell.id);
                  setMessage(null);
                }}
                style={{ minWidth: 120, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: active ? palette.midnight : palette.surface, borderWidth: 1, borderColor: active ? palette.midnight : palette.line, gap: 2 }}
              >
                <AppText variant="time" weight="bold" color={active ? '#FFFFFF' : palette.ink}>
                  {clock(cell.start)}
                </AppText>
                {cell.classroom?.name ? (
                  <AppText variant="caption" color={active ? 'rgba(255,255,255,0.78)' : palette.muted} lines={1}>
                    {cell.classroom.name}
                  </AppText>
                ) : null}
              </Press>
            </Appear>
          );
        })}
      </View>
    </View>
  );

  const recordedList = cellId == null ? null : recorded.length === 0 && !topics.isLoading && !(topics.error instanceof Error) ? (
    <AppText variant="support" color={palette.muted}>
      {EMPTY_DAY}
    </AppText>
  ) : (
    <View style={{ gap: space.sm }}>
      <Label>İşlenenler</Label>
      <State loading={cellId != null && topics.isLoading} error={topics.error instanceof Error ? topics.error.message : null}>
        {recorded.map((row, index) => (
          <Appear key={row.id} index={index}>
            <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                <Icon icon={Check} color={palette.midnight} size={15} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AppText weight="bold" color={palette.ink} lines={2}>
                  {row.topic ? topicFace(row.topic).title : 'Not'}
                </AppText>
                {row.topic?.code ? (
                  <AppText variant="caption" color={palette.muted}>
                    {topicFace(row.topic).program} · {row.topic.code}
                  </AppText>
                ) : null}
                {row.outcomes && row.outcomes.length > 0 ? (
                  <AppText variant="caption" color={palette.muted} lines={3}>
                    {row.outcomes.map((item) => (item.code ? `${item.code} ${item.text}` : item.text)).join(' · ')}
                  </AppText>
                ) : null}
                {row.note ? (
                  <AppText variant="caption" color={palette.muted} lines={3}>
                    {row.note}
                  </AppText>
                ) : null}
              </View>
            </Card>
          </Appear>
        ))}
      </State>
    </View>
  );

  const assistantNote = selected && !canWrite ? <State empty="Bu dersi yardımcı öğretmen olarak görüyorsunuz. Kayıt asıl öğretmene açıktır." /> : null;

  const sheetForm = (
    <View style={{ gap: space.md }}>
      {catalogList}
      {noteBox}
    </View>
  );

  const formCard = canWrite && cellId != null ? (
    <Card style={{ padding: space.lg, gap: space.md }}>
      <Label>Konu işle</Label>
      {sheetForm}
    </Card>
  ) : null;

  return (
    <View style={{ flex: 1 }} onLayout={measured.onLayout}>
      <Page>
        <Heading title="İşlenen konular" sub={selected ? `${selected.ders.ad} · ${selected.sinif.ad}` : 'Ders seçin, saati işaretleyin, konuyu kaydedin'} />
        <State
          loading={terms.isLoading || classes.isLoading}
          error={terms.error instanceof Error ? terms.error.message : classes.error instanceof Error ? classes.error.message : null}
          empty={!classes.isLoading && rows.length === 0 ? 'Atanmış ders yok.' : null}
        >
          <View style={{ gap: space.lg }}>
            {classStrip}
            <View style={{ gap: space.sm }}>
              {dayPicker}
              <AppText variant="caption" weight="semibold" color={palette.muted}>
                {WEEKDAYS[day]} · {shownDate(sessionDate)}
              </AppText>
            </View>
            {cells.length === 0 ? (
              <Card style={{ paddingVertical: space.xl }}>
                <State empty={`${WEEKDAYS[day]} günü bu derste saat yok.`} />
              </Card>
            ) : (
              <View style={{ gap: space.lg }}>
                {lessonSlots}
                {assistantNote}
                {phone && canWrite && cellId != null ? <Button label="Konu işle" onPress={() => setFormOpen(true)} /> : null}
                {phone && message && !formOpen ? <State empty={message} /> : null}
                {sideBySide && formCard && recorded.length > 0 ? (
                  <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>{formCard}</View>
                    <View style={{ width: 320 }}>{recordedList}</View>
                  </View>
                ) : (
                  <View style={{ gap: space.lg }}>
                    {phone ? null : formCard}
                    {recordedList}
                  </View>
                )}
              </View>
            )}
          </View>
        </State>
      </Page>
      {phone ? (
        <Sheet visible={formOpen} title="Konu işle" expanded={formExpanded} onClose={() => setFormOpen(false)} onToggleExpanded={() => setFormExpanded((value) => !value)}>
          {sheetForm}
        </Sheet>
      ) : null}
    </View>
  );
}

function CatalogList({
  items,
  loading,
  empty,
  error,
  topicId,
  outcomeIds,
  onTopic,
  onOutcome,
}: {
  items: CatalogTopic[];
  loading: boolean;
  empty: boolean;
  error: string | null;
  topicId: number | null;
  outcomeIds: number[];
  onTopic: (id: number | null) => void;
  onOutcome: (id: number) => void;
}) {
  const palette = usePalette();
  const [query, setQuery] = useState('');
  if (empty && !loading && !error) {
    return (
      <AppText variant="support" color={palette.muted}>
        {EMPTY_CATALOG}
      </AppText>
    );
  }
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const visible = needle ? items.filter((item) => topicMatches(item, needle)) : items;
  const pinned = items.find((item) => item.id === topicId && !visible.some((row) => row.id === item.id)) ?? null;
  return (
    <State loading={loading} error={error}>
      <View style={{ gap: space.md }}>
        {items.length > 6 ? <SearchField value={query} onChange={setQuery} placeholder="Konu ara" label="Konu ara" /> : null}
        {pinned ? (
          <View style={{ gap: 8 }}>
            <AppText variant="caption" weight="semibold" color={palette.muted}>
              Seçili konu
            </AppText>
            <TopicChoice item={pinned} active outcomeIds={outcomeIds} onTopic={onTopic} onOutcome={onOutcome} span />
          </View>
        ) : null}
        {visible.length === 0 ? (
          <AppText variant="support" color={palette.muted}>
            Bu aramada konu yok.
          </AppText>
        ) : (
          catalogGroups(visible).map(([program, topics]) => (
            <View key={program} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <AppText variant="caption" weight="semibold" color={palette.muted}>
                  {program}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {topics.length}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {topics.map((item) => (
                  <TopicChoice
                    key={item.id}
                    item={item}
                    active={topicId === item.id}
                    outcomeIds={outcomeIds}
                    onTopic={onTopic}
                    onOutcome={onOutcome}
                  />
                ))}
                <View style={{ flexGrow: 1, flexBasis: 220, minWidth: 200 }} />
              </View>
            </View>
          ))
        )}
      </View>
    </State>
  );
}

function TopicChoice({
  item,
  active,
  outcomeIds,
  onTopic,
  onOutcome,
  span = false,
}: {
  item: CatalogTopic;
  active: boolean;
  outcomeIds: number[];
  onTopic: (id: number | null) => void;
  onOutcome: (id: number) => void;
  span?: boolean;
}) {
  const palette = usePalette();
  const face = topicFace(item);
  const outcomes = item.outcomes ?? [];
  const wide = span || (active && outcomes.length > 0);
  return (
    <View
      style={{
        flexGrow: wide ? 0 : 1,
        flexBasis: wide ? '100%' : 220,
        minWidth: wide ? '100%' : 200,
        maxWidth: '100%',
        borderRadius: 16,
        borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
        borderColor: active ? palette.midnight : palette.line,
        backgroundColor: active ? palette.primaryContainer : palette.paper,
        overflow: 'hidden',
      }}
    >
      <Press
        accessibilityRole="button"
        accessibilityLabel={face.code ? `${face.code} ${item.name}` : item.name}
        accessibilityState={{ selected: active }}
        onPress={() => onTopic(active ? null : item.id)}
        scaleTo={0.985}
        style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        {face.code ? (
          <View style={{ minWidth: 44, paddingHorizontal: 8, height: 28, borderRadius: 8, backgroundColor: active ? palette.surface : palette.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="caption" weight="semibold" color={palette.midnight}>
              {face.code}
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText weight="semibold" color={palette.ink}>
            {face.title}
          </AppText>
          {!active && outcomes.length > 0 ? (
            <AppText variant="caption" color={palette.muted}>
              {outcomes.length} kazanım
            </AppText>
          ) : null}
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? palette.midnight : palette.line, backgroundColor: active ? palette.midnight : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {active ? <Icon icon={Check} color="#FFFFFF" size={14} /> : null}
        </View>
      </Press>
      {active && outcomes.length > 0 ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={palette.muted}>
            Kazanımlar · isteğe bağlı
          </AppText>
          <OutcomeList outcomes={outcomes} outcomeIds={outcomeIds} onOutcome={onOutcome} />
        </View>
      ) : null}
    </View>
  );
}

function OutcomeList({
  outcomes,
  outcomeIds,
  onOutcome,
}: {
  outcomes: NonNullable<CatalogTopic['outcomes']>;
  outcomeIds: number[];
  onOutcome: (id: number) => void;
}) {
  const palette = usePalette();
  const rows = outcomes.map((outcome) => {
    const marked = outcomeIds.includes(outcome.id);
    const label = outcome.code ? `${outcome.code} ${outcome.text}` : outcome.text;
    return (
      <Press
        key={outcome.id}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: marked }}
        onPress={() => onOutcome(outcome.id)}
        scaleTo={0.985}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}
      >
        <View style={{ width: 20, height: 20, marginTop: 1, borderRadius: 6, borderWidth: 2, borderColor: marked ? palette.midnight : palette.line, backgroundColor: marked ? palette.midnight : palette.surface, alignItems: 'center', justifyContent: 'center' }}>
          {marked ? <Icon icon={Check} color="#FFFFFF" size={12} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {outcome.code ? (
            <AppText variant="caption" weight="semibold" color={palette.midnight}>
              {outcome.code}
            </AppText>
          ) : null}
          <AppText variant="support" weight={marked ? 'semibold' : 'regular'} color={palette.ink}>
            {outcome.text}
          </AppText>
        </View>
      </Press>
    );
  });
  return <View style={{ gap: 4 }}>{rows}</View>;
}

function NoteBox({
  note,
  onNote,
  message,
  pending,
  fontsActive,
  topicId,
  ready,
  onSubmit,
}: {
  note: string;
  onNote: (value: string) => void;
  message: string | null;
  pending: boolean;
  fontsActive: boolean;
  topicId: number | null;
  ready: boolean;
  onSubmit: () => void;
}) {
  const palette = usePalette();
  const saved = message === 'Kaydedildi.';
  return (
    <View style={{ gap: space.sm }}>
      <TextInput
        accessibilityLabel="Serbest not"
        value={note}
        onChangeText={onNote}
        placeholder="Serbest not"
        placeholderTextColor={palette.muted}
        multiline
        style={{
          minHeight: 96,
          color: palette.ink,
          fontFamily: fontsActive ? font.regular : undefined,
          fontSize: 16,
          backgroundColor: palette.paper,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: palette.line,
          paddingHorizontal: space.md,
          paddingVertical: space.md,
          textAlignVertical: 'top',
        }}
      />
      {message ? (
        <AppText variant="support" weight="semibold" color={saved ? palette.ok : palette.danger}>
          {message}
        </AppText>
      ) : null}
      <Button label={pending ? 'Kaydediliyor' : 'Kaydet'} disabled={pending || !ready || (topicId == null && note.trim() === '')} onPress={onSubmit} />
    </View>
  );
}
