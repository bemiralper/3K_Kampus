'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  ensureClassPeriodAttendance,
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  fetchClassPeriodStudentAttendance,
  fetchLessonSessions,
  fetchLessonStudentAttendance,
  materializeLessonSessions,
  saveClassPeriodStudentAttendance,
  saveLessonStudentAttendance,
  type AcademicScheduleVersion,
  type AttendanceRosterRow,
  type ClassLessonPlanContext,
  type ClassPeriodSession,
  type LessonSession,
} from '@/lib/academic-api';
import ClassAttendanceNotifyModal from '@/components/akademik/ogrenci-yoklamalari/ClassAttendanceNotifyModal';
import '@/components/akademik/ders-operasyonlari/ops-common.css';

dayjs.locale('tr');
const { Title, Text } = Typography;

type Mode = 'lesson' | 'daily';

export default function OgrenciYoklamalariClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [versions, setVersions] = useState<AcademicScheduleVersion[]>([]);
  const [termId, setTermId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
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

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const ctx = await fetchClassLessonPlanContext();
      setContext(ctx);
      setTermId((p) => p ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
      setClassroomId((p) => p ?? ctx.classrooms[0]?.id ?? null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (!termId) return;
    fetchAcademicScheduleVersions({ term_id: termId }).then((rows) => {
      setVersions(rows);
      setVersionId((prev) => prev ?? rows.find((v) => v.is_active)?.id ?? rows[0]?.id ?? null);
    });
  }, [termId]);

  const loadLessonSessions = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    try {
      await materializeLessonSessions({
        term_id: termId,
        date: date.format('YYYY-MM-DD'),
        version_id: versionId ?? undefined,
        classroom_id: classroomId ?? undefined,
      }).catch(() => null);
      const rows = await fetchLessonSessions({
        term_id: termId,
        date: date.format('YYYY-MM-DD'),
        version_id: versionId ?? undefined,
        classroom_id: classroomId ?? undefined,
        session_kind: 'REGULAR',
      });
      setSessions(rows);
      setSessionId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Oturumlar yüklenemedi');
      setSessions([]);
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  }, [classroomId, date, termId, versionId]);

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
        version_id: versionId ?? undefined,
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
  }, [classroomId, date, termId, versionId]);

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
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Yoklama listesi yüklenemedi');
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
      message.success('Yoklama kaydedildi');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
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
          onChange={(status) => {
            setRoster((prev) =>
              prev.map((r) =>
                r.student_id === row.student_id
                  ? {
                      ...r,
                      status: status as AttendanceRosterRow['status'],
                      status_display:
                        statusOptions.find((o) => o.value === status)?.label || status,
                    }
                  : r,
              ),
            );
          }}
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
          onChange={(e) => {
            const note = e.target.value;
            setRoster((prev) =>
              prev.map((r) =>
                r.student_id === row.student_id ? { ...r, note } : r,
              ),
            );
          }}
        />
      ),
    },
  ];

  if (!initialized) return <div className="ops-empty">Bağlam yükleniyor…</div>;
  if (!activeKurum || !activeSube) {
    return <Alert type="warning" showIcon message="Kurum ve şube seçimi gerekli" />;
  }

  const selectedLesson = sessions.find((s) => s.id === sessionId);
  const selectedPeriod = periodSessions.find((s) => s.id === periodSessionId);
  const notifyEligible = roster.some((r) => r.status === 'ABSENT' || r.status === 'LATE');

  return (
    <div className="ops-page">
      <div className="ops-toolbar">
        <div>
          <Title level={3} style={{ margin: 0 }}>Öğrenci Yoklamaları</Title>
          <Text type="secondary">
            Ders bazlı veya günlük (sabah / öğleden sonra) yoklama. Kaydettikten sonra veliye
            bildirebilirsiniz.
          </Text>
        </div>
        <Space wrap>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { label: 'Ders bazlı', value: 'lesson' },
              { label: 'Günlük', value: 'daily' },
            ]}
          />
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
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!activeSourceId}
            onClick={save}
          >
            Kaydet
          </Button>
          <Button
            icon={<SendOutlined />}
            disabled={!activeSourceId || !notifyEligible}
            onClick={() => setNotifyOpen(true)}
          >
            Bildir
          </Button>
        </Space>
      </div>

      <div className="ops-card">
        <div className="ops-filters">
          <div className="ops-filter-item">
            <label>Tarih</label>
            <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD.MM.YYYY" allowClear={false} />
          </div>
          <div className="ops-filter-item">
            <label>Dönem</label>
            <Select
              style={{ minWidth: 160 }}
              value={termId ?? undefined}
              onChange={setTermId}
              options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Versiyon</label>
            <Select
              allowClear
              style={{ minWidth: 160 }}
              value={versionId ?? undefined}
              onChange={(v) => setVersionId(v ?? null)}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.name}${v.is_active ? ' ★' : ''}`,
              }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Sınıf</label>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 160 }}
              value={classroomId ?? undefined}
              onChange={setClassroomId}
              options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
            />
          </div>
          {mode === 'lesson' ? (
            <div className="ops-filter-item" style={{ minWidth: 280 }}>
              <label>Oturum</label>
              <Select
                loading={loading}
                style={{ minWidth: 280 }}
                value={sessionId ?? undefined}
                onChange={setSessionId}
                placeholder="Ders oturumu seçin"
                options={sessions.map((s) => ({
                  value: s.id,
                  label: `${s.start_time || ''} ${s.ders?.name || ''} · ${s.ogretmen?.name || ''}`,
                }))}
              />
            </div>
          ) : (
            <div className="ops-filter-item" style={{ minWidth: 200 }}>
              <label>Periyot</label>
              <Select
                loading={loading}
                style={{ minWidth: 200 }}
                value={periodSessionId ?? undefined}
                onChange={setPeriodSessionId}
                placeholder="Sabah / Öğleden sonra"
                options={periodSessions.map((s) => ({
                  value: s.id,
                  label: s.period_label,
                }))}
              />
            </div>
          )}
        </div>
      </div>

      {mode === 'lesson' && !sessions.length ? (
        <Alert
          type="info"
          showIcon
          message="Bu gün/sınıf için oturum yok"
          description="Ders Oturumları’ndan “Programdan Üret” ile günlük oturum oluşturun. Öğrenci listesi için sınıfa yerleşim gerekir."
        />
      ) : null}

      {mode === 'daily' && !periodSessions.length ? (
        <Alert
          type="info"
          showIcon
          message="Günlük yoklama kapalı"
          description={
            periodInfo
            || 'Bu sınıfın seçilen günde programda dersi yok. Sabah veya öğleden sonra dersi olan günlerde yoklama açılır.'
          }
        />
      ) : null}

      {(mode === 'lesson' ? !!sessionId : !!periodSessionId) ? (
        <div className="ops-card">
          <div className="ops-card-head">
            <Text strong>
              {mode === 'lesson'
                ? selectedLesson
                  ? `${selectedLesson.ders?.name} · ${selectedLesson.sinif?.name} · ${selectedLesson.start_time}`
                  : 'Yoklama listesi'
                : selectedPeriod
                  ? `${selectedPeriod.period_label} · ${selectedPeriod.sinif_name || ''}`
                  : 'Günlük yoklama listesi'}
            </Text>
            <Text type="secondary">{roster.length} öğrenci</Text>
          </div>
          <Table<AttendanceRosterRow>
            rowKey="student_id"
            columns={columns}
            dataSource={roster}
            pagination={false}
            locale={{
              emptyText:
                'Liste boş. Sınıfa öğrenci yerleşimi yoksa yoklama satırı oluşmaz.',
            }}
          />
        </div>
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
    </div>
  );
}
