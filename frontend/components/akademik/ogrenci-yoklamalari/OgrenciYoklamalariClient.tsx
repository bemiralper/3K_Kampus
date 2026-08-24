'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  ensureClassPeriodAttendance,
  fetchClassLessonPlanContext,
  fetchClassPeriodStudentAttendance,
  fetchLessonSessions,
  fetchLessonStudentAttendance,
  materializeLessonSessions,
  saveClassPeriodStudentAttendance,
  saveLessonStudentAttendance,
  type AttendanceRosterRow,
  type ClassLessonPlanContext,
  type ClassPeriodSession,
  type LessonSession,
} from '@/lib/academic-api';
import ClassAttendanceNotifyModal from '@/components/akademik/ogrenci-yoklamalari/ClassAttendanceNotifyModal';
import {
  ContextRequired,
  EmptyState,
  ErrorState,
  Field,
  Hint,
  LoadingState,
  PageHead,
  PageShell,
  Panel,
  Segmented,
  StatCard,
  StatGrid,
  Toolbar,
  ToolbarActions,
} from '@/components/akademik/ui';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconUsers,
} from '@/components/akademik/ui/icons';
import '@/components/akademik/ders-operasyonlari/ops-common.css';

dayjs.locale('tr');

type Mode = 'lesson' | 'daily';

export default function OgrenciYoklamalariClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [mode, setMode] = useState<Mode>('lesson');

  const [sessions, setSessions] = useState<LessonSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [periodSessions, setPeriodSessions] = useState<ClassPeriodSession[]>([]);
  const [periodSessionId, setPeriodSessionId] = useState<number | null>(null);
  const [periodInfo, setPeriodInfo] = useState<string>('');

  const [roster, setRoster] = useState<AttendanceRosterRow[]>([]);
  const [statusOptions, setStatusOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const boot = useCallback(async () => {
    if (!initialized) return;
    if (!activeKurum || !activeSube) {
      setBooting(false);
      return;
    }
    setBooting(true);
    setError(null);
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((p) => p ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
      setClassroomId((p) => p ?? ctx.classrooms[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    } finally {
      setBooting(false);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  const loadLessonSessions = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    try {
      await materializeLessonSessions({
        term_id: termId,
        date: date.format('YYYY-MM-DD'),
        classroom_id: classroomId ?? undefined,
      }).catch(() => null);
      const rows = await fetchLessonSessions({
        term_id: termId,
        date: date.format('YYYY-MM-DD'),
        classroom_id: classroomId ?? undefined,
        session_kind: 'REGULAR',
      });
      setSessions(rows);
      setSessionId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Oturumlar yüklenemedi');
      setSessions([]);
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  }, [classroomId, date, termId]);

  const loadPeriodSessions = useCallback(async () => {
    if (!termId || !classroomId) {
      setPeriodSessions([]);
      setPeriodSessionId(null);
      setPeriodInfo('');
      return;
    }
    setLoading(true);
    try {
      const data = await ensureClassPeriodAttendance({
        term_id: termId,
        classroom_id: classroomId,
        date: date.format('YYYY-MM-DD'),
      });
      const sessions = data.sessions || [];
      setPeriodSessions(sessions);
      setPeriodInfo(
        data.info
        || (sessions.length === 0
          ? 'Bu sınıfın seçilen günde programda dersi yok. Günlük yoklama kapalı.'
          : ''),
      );
      setPeriodSessionId((prev) => {
        if (prev && sessions.some((s) => s.id === prev)) return prev;
        return sessions[0]?.id ?? null;
      });
    } catch {
      setPeriodSessions([]);
      setPeriodSessionId(null);
      setPeriodInfo(
        'Bu sınıfın seçilen günde programda dersi yok. Günlük yoklama yalnızca dersi olan günlerde açılır.',
      );
    } finally {
      setLoading(false);
    }
  }, [classroomId, date, termId]);

  useEffect(() => {
    if (mode === 'lesson') loadLessonSessions();
    else loadPeriodSessions();
  }, [mode, loadLessonSessions, loadPeriodSessions]);

  const activeSourceId = mode === 'lesson' ? sessionId : periodSessionId;

  const loadRoster = useCallback(async () => {
    if (!activeSourceId) {
      setRoster([]);
      return;
    }
    try {
      const data =
        mode === 'lesson'
          ? await fetchLessonStudentAttendance(activeSourceId)
          : await fetchClassPeriodStudentAttendance(activeSourceId);
      setRoster(data.roster);
      setStatusOptions(data.status_options || []);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yoklama listesi yüklenemedi');
      setRoster([]);
    }
  }, [activeSourceId, mode]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const save = async () => {
    if (!activeSourceId) return;
    setSaving(true);
    try {
      const payload = roster.map((r) => ({
        student_id: r.student_id,
        status: r.status,
        note: r.note,
      }));
      const result =
        mode === 'lesson'
          ? await saveLessonStudentAttendance(activeSourceId, payload)
          : await saveClassPeriodStudentAttendance(activeSourceId, payload);
      setRoster(result.roster);
      setDirty(false);
      message.success('Yoklama kaydedildi');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const patchRow = (studentId: number, patch: Partial<AttendanceRosterRow>) => {
    setRoster((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)),
    );
    setDirty(true);
  };

  /** Yoklamanın normal hâli "herkes geldi"; öğretmen yalnızca istisnaları işaretler. */
  const markAllPresent = () => {
    const label = statusOptions.find((o) => o.value === 'PRESENT')?.label || 'Geldi';
    setRoster((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'PRESENT' as AttendanceRosterRow['status'],
        status_display: label,
      })),
    );
    setDirty(true);
  };

  const columns: ColumnsType<AttendanceRosterRow> = [
    { title: 'Öğrenci', dataIndex: 'student_name' },
    {
      title: 'Durum',
      dataIndex: 'status',
      width: 180,
      render: (v, row) => (
        <Select
          style={{ width: '100%' }}
          value={v}
          options={statusOptions}
          onChange={(status) =>
            patchRow(row.student_id, {
              status: status as AttendanceRosterRow['status'],
              status_display: statusOptions.find((o) => o.value === status)?.label || status,
            })
          }
        />
      ),
    },
    {
      title: 'Özet',
      dataIndex: 'status_display',
      width: 100,
      render: (v, row) => {
        const color =
          row.status === 'PRESENT'
            ? 'green'
            : row.status === 'LATE'
              ? 'orange'
              : row.status === 'EXCUSED'
                ? 'blue'
                : 'red';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: 'Not',
      dataIndex: 'note',
      render: (v, row) => (
        <Input
          size="small"
          value={v || ''}
          placeholder="Opsiyonel"
          onChange={(e) => patchRow(row.student_id, { note: e.target.value })}
        />
      ),
    },
  ];

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    roster.forEach((r) => {
      if (r.status === 'PRESENT') present += 1;
      else if (r.status === 'ABSENT') absent += 1;
      else if (r.status === 'LATE') late += 1;
      else if (r.status === 'EXCUSED') excused += 1;
    });
    return { present, absent, late, excused };
  }, [roster]);

  if (!initialized || booting) return <LoadingState label="Bağlam yükleniyor…" />;
  if (!activeKurum || !activeSube) return <ContextRequired />;

  const selectedLesson = sessions.find((s) => s.id === sessionId);
  const selectedPeriod = periodSessions.find((s) => s.id === periodSessionId);
  const notifyEligible = roster.some((r) => r.status === 'ABSENT' || r.status === 'LATE');
  const rosterVisible = mode === 'lesson' ? !!sessionId : !!periodSessionId;

  const rosterTitle =
    mode === 'lesson'
      ? selectedLesson
        ? `${selectedLesson.ders?.name || 'Ders'} · ${selectedLesson.sinif?.name || ''} · ${selectedLesson.start_time || ''}`
        : 'Yoklama listesi'
      : selectedPeriod
        ? `${selectedPeriod.period_label} · ${selectedPeriod.sinif_name || ''}`
        : 'Günlük yoklama listesi';

  return (
    <PageShell>
      <PageHead
        description="Ders bazlı veya günlük (sabah / öğleden sonra) yoklama. Kaydettikten sonra devamsız ve geç kalan öğrencilerin velisine bildirim gönderebilirsiniz."
        actions={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                boot();
                if (mode === 'lesson') loadLessonSessions();
                else loadPeriodSessions();
              }}
            >
              Yenile
            </Button>
            <Button
              icon={<SendOutlined />}
              disabled={!activeSourceId || !notifyEligible || dirty}
              onClick={() => setNotifyOpen(true)}
            >
              Bildir
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!activeSourceId || !dirty}
              onClick={save}
            >
              Kaydet
            </Button>
          </Space>
        }
      />

      {rosterVisible ? (
        <StatGrid>
          <StatCard icon={<IconUsers />} tone="blue" value={roster.length} label="Öğrenci" />
          <StatCard icon={<IconCheckCircle />} tone="green" value={counts.present} label="Geldi" />
          <StatCard icon={<IconClock />} tone="orange" value={counts.late} label="Geç kaldı" />
          <StatCard
            icon={<IconAlertTriangle />}
            tone="red"
            value={counts.absent}
            label="Gelmedi"
          />
          <StatCard icon={<IconClipboard />} tone="purple" value={counts.excused} label="İzinli" />
        </StatGrid>
      ) : null}

      <Toolbar>
        <Field label="Yoklama türü" width={200}>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel="Yoklama türü"
            options={[
              { value: 'lesson', label: 'Ders bazlı' },
              { value: 'daily', label: 'Günlük' },
            ]}
          />
        </Field>
        <Field label="Tarih">
          <DatePicker
            value={date}
            onChange={(d) => d && setDate(d)}
            format="DD.MM.YYYY"
            allowClear={false}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Dönem" width={170}>
          <Select
            style={{ width: '100%' }}
            value={termId ?? undefined}
            onChange={setTermId}
            options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Sınıf" width={170}>
          <Select
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            value={classroomId ?? undefined}
            onChange={setClassroomId}
            options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
          />
        </Field>
        {mode === 'lesson' ? (
          <Field label="Oturum" grow width={300}>
            <Select
              loading={loading}
              style={{ width: '100%' }}
              value={sessionId ?? undefined}
              onChange={setSessionId}
              placeholder="Ders oturumu seçin"
              options={sessions.map((s) => ({
                value: s.id,
                label: `${s.start_time || ''} ${s.ders?.name || ''} · ${s.ogretmen?.name || ''}`,
              }))}
            />
          </Field>
        ) : (
          <Field label="Periyot" width={220}>
            <Select
              loading={loading}
              style={{ width: '100%' }}
              value={periodSessionId ?? undefined}
              onChange={setPeriodSessionId}
              placeholder="Sabah / Öğleden sonra"
              options={periodSessions.map((s) => ({
                value: s.id,
                label: s.period_label,
              }))}
            />
          </Field>
        )}
        {rosterVisible ? (
          <ToolbarActions>
            <Button onClick={markAllPresent}>Tümü geldi</Button>
          </ToolbarActions>
        ) : null}
      </Toolbar>

      {dirty ? (
        <Hint>
          Kaydedilmemiş değişiklikler var. Bildirim göndermek için önce yoklamayı kaydedin.
        </Hint>
      ) : null}

      {error ? <ErrorState description={error} onRetry={loadRoster} /> : null}

      {mode === 'lesson' && !loading && !sessions.length ? (
        <EmptyState
          icon={<IconClipboard />}
          title="Bu gün ve sınıf için oturum yok"
          description="Seçilen günde bu sınıfın programında ders bulunmuyor. Tarihi veya sınıfı değiştirmeyi deneyin; öğrenci listesi için sınıfa yerleşim de gerekir."
        />
      ) : null}

      {mode === 'daily' && !loading && !periodSessions.length ? (
        <EmptyState
          icon={<IconClipboard />}
          title="Günlük yoklama kapalı"
          description={
            periodInfo ||
            'Bu sınıfın seçilen günde programda dersi yok. Günlük yoklama, sabah veya öğleden sonra dersi olan günlerde açılır.'
          }
        />
      ) : null}

      {rosterVisible ? (
        <Panel title={rosterTitle} count={roster.length} flush>
          <Table<AttendanceRosterRow>
            rowKey="student_id"
            columns={columns}
            dataSource={roster}
            pagination={false}
            scroll={{ x: 700 }}
            locale={{
              emptyText: (
                <EmptyState
                  icon={<IconUsers />}
                  title="Sınıfta öğrenci yok"
                  description="Bu sınıfa dönem içinde yerleşmiş öğrenci bulunmuyor; yoklama satırı oluşmaz."
                />
              ),
            }}
          />
        </Panel>
      ) : null}

      {activeSourceId ? (
        <ClassAttendanceNotifyModal
          open={notifyOpen}
          sourceType={mode === 'lesson' ? 'LESSON' : 'PERIOD'}
          sourceId={activeSourceId}
          title="Yoklama bildirimi"
          onClose={() => setNotifyOpen(false)}
          onSent={(n) => message.success(`${n} bildirim kuyruğa alındı`)}
        />
      ) : null}
    </PageShell>
  );
}
