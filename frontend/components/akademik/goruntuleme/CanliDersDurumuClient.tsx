'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/tr';
import {
  fetchDailyScheduleFlow,
  fetchTeachersForAvailability,
  type DailyFlowItem,
  type TeacherListItem,
} from '@/lib/academic-api';
import { useGoruntulemeContext } from './useGoruntulemeContext';
import {
  ContextRequired,
  EmptyState,
  ErrorState,
  Field,
  Hint,
  LoadingState,
  PageShell,
  Panel,
  StatCard,
  StatGrid,
  Toolbar,
  ToolbarActions,
} from '../ui';
import { IconBookOpen, IconClock, IconUser, IconUsers } from '../ui/icons';
import './goruntuleme.css';

dayjs.locale('tr');

function statusClass(status: string) {
  if (status === 'EXAM') return 'gv-status gv-status--exam';
  if (status === 'HOLIDAY') return 'gv-status gv-status--holiday';
  return 'gv-status';
}

function itemPhase(item: DailyFlowItem, date: Dayjs) {
  if (!item.start || !item.end || !date.isSame(dayjs(), 'day')) return 'idle';
  const start = dayjs(`${date.format('YYYY-MM-DD')} ${item.start}`);
  const end = dayjs(`${date.format('YYYY-MM-DD')} ${item.end}`);
  const now = dayjs();
  if (now.isBefore(start)) return 'upcoming';
  if (now.isAfter(end) || now.isSame(end)) return 'past';
  return 'now';
}

export default function CanliDersDurumuClient() {
  const {
    context,
    calendarOptions,
    calendarId,
    setCalendarId,
    termId,
    setTermId,
    termOptions,
    ready,
    error: contextError,
  } = useGoruntulemeContext();
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [classroomId, setClassroomId] = useState<number | undefined>();
  const [teacherId, setTeacherId] = useState<number | undefined>();
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [items, setItems] = useState<DailyFlowItem[]>([]);
  const [dayName, setDayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!ready) return;
    fetchTeachersForAvailability({ aktif_only: true })
      .then(setTeachers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Öğretmenler yüklenemedi'));
  }, [ready]);

  useEffect(() => {
    if (!ready || !termId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    fetchDailyScheduleFlow({
      term_id: termId,
      date: date.format('YYYY-MM-DD'),
      weekly_cycle_id: calendarId ?? undefined,
      classroom_id: classroomId,
      teacher_id: teacherId,
    })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setDayName(data.day_name || null);
        if (data.error) setError(data.error);
        else if (data.info) setInfo(data.info);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Günlük akış yüklenemedi');
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, termId, calendarId, date, classroomId, teacherId, reloadKey]);

  const nowCount = useMemo(
    () => items.filter((item) => itemPhase(item, date) === 'now').length,
    [items, date],
  );
  const isToday = date.isSame(dayjs(), 'day');

  if (!ready) return <ContextRequired />;

  const shownError = error || contextError;

  return (
    <PageShell>
      <Hint>
        Seçili günün dersleri saat sırasıyla.{dayName ? ` ${dayName}.` : ''}
        {isToday ? ' Şu an işlenen ders vurgulanır.' : ''}
      </Hint>

      <Toolbar>
        <Field label="Tarih" width={170}>
          <DatePicker
            value={date}
            onChange={(v) => v && setDate(v)}
            format="DD.MM.YYYY"
            allowClear={false}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Dönem" width={180}>
          <Select
            value={termId ?? undefined}
            onChange={setTermId}
            options={termOptions}
            placeholder="Dönem"
          />
        </Field>
        <Field label="Çalışma Takvimi" width={190}>
          <Select
            value={calendarId ?? undefined}
            onChange={setCalendarId}
            options={calendarOptions}
            placeholder="Takvim"
            notFoundContent="Program yok"
          />
        </Field>
        <Field label="Sınıf" width={180}>
          <Select
            value={classroomId}
            onChange={setClassroomId}
            allowClear
            showSearch
            optionFilterProp="label"
            options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
            placeholder="Tüm sınıflar"
          />
        </Field>
        <Field label="Öğretmen" grow>
          <Select
            value={teacherId}
            onChange={setTeacherId}
            allowClear
            showSearch
            optionFilterProp="label"
            options={teachers.map((t) => ({
              value: t.id,
              label: t.tam_ad || `${t.ad} ${t.soyad}`,
            }))}
            placeholder="Tüm öğretmenler"
          />
        </Field>
        <ToolbarActions>
          {!isToday && (
            <Button onClick={() => setDate(dayjs())} size="small">
              Bugüne dön
            </Button>
          )}
        </ToolbarActions>
      </Toolbar>

      {shownError && items.length > 0 && (
        <div className="gv-banner gv-banner--warn">{shownError}</div>
      )}
      {info && !shownError && <div className="gv-banner">{info}</div>}

      <StatGrid>
        <StatCard
          icon={<IconBookOpen size={18} />}
          tone="blue"
          value={items.length}
          label="Toplam ders"
        />
        <StatCard
          icon={<IconClock size={18} />}
          tone={nowCount ? 'green' : 'slate'}
          value={nowCount}
          label={isToday ? 'Şu an işleniyor' : 'Şu an (bugün değil)'}
        />
        <StatCard
          icon={<IconUsers size={18} />}
          tone="purple"
          value={new Set(items.map((i) => i.classroom?.id).filter(Boolean)).size}
          label="Sınıf"
        />
        <StatCard
          icon={<IconUser size={18} />}
          tone="orange"
          value={new Set(items.map((i) => i.teacher?.id).filter(Boolean)).size}
          label="Öğretmen"
        />
      </StatGrid>

      <Panel flush>
        <div className={`gv-body${loading ? ' is-loading' : ''}`}>
          {loading && !items.length ? (
            <LoadingState label="Günlük akış yükleniyor…" />
          ) : shownError && !items.length ? (
            <ErrorState description={shownError} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : !items.length ? (
            <EmptyState
              title="Bu tarihte ders yok"
              description={
                info ||
                'Seçili gün için programda ders bulunmuyor. Tarihi veya çalışma takvimini değiştirmeyi deneyin.'
              }
            />
          ) : (
            <ul className="gv-live-list">
              {items.map((item, index) => {
                const phase = itemPhase(item, date);
                return (
                  <li
                    key={`${item.id ?? item.timeslot_id}-${item.classroom?.id ?? index}`}
                    className={`gv-live-item${phase === 'now' ? ' is-now' : ''}${phase === 'past' ? ' is-past' : ''}`}
                  >
                    <div className="gv-live-time">
                      {item.start}
                      <small>{item.end}</small>
                    </div>
                    <div className="gv-live-main">
                      <strong>{item.lesson?.name || '—'}</strong>
                      <span>
                        {[item.classroom?.name, item.teacher?.name, item.room?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span className={phase === 'now' ? 'gv-status gv-status--now' : statusClass(item.status)}>
                      {phase === 'now' ? 'İşleniyor' : item.status_display}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
