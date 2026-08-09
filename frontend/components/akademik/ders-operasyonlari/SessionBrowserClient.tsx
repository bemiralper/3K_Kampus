'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckOutlined,
  CloseOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/tr';
import { useKurum } from '@/lib/contexts/KurumContext';
import { searchKutuphaneStudents, type KutuphaneStudentOption } from '@/lib/kutuphane-student-search';
import {
  createLessonSession,
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  fetchClassLessonPlanDersOptions,
  fetchLessonOpsMeta,
  fetchLessonSessions,
  fetchScheduleTemplate,
  fetchScheduleTemplates,
  lessonSessionAction,
  materializeLessonSessions,
  setLessonTeacherAttendance,
  type AcademicScheduleVersion,
  type ClassLessonPlanContext,
  type ClassLessonPlanDersOption,
  type LessonOpsMeta,
  type LessonSession,
  type SessionKind,
  type TimeSlot,
} from '@/lib/academic-api';
import './ops-common.css';

dayjs.locale('tr');

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'blue',
  IN_PROGRESS: 'processing',
  COMPLETED: 'green',
  CANCELLED: 'default',
  POSTPONED: 'orange',
  NO_SHOW: 'red',
};

type Props = {
  title: string;
  description: string;
  /** Sabit oturum türü — yoksa tümü */
  fixedKind?: SessionKind;
  /** Günlük görünüm (tek tarih) */
  dailyMode?: boolean;
  /** Programdan oturum üret butonu */
  showMaterialize?: boolean;
  /** Günlük modda ilk yüklemede otomatik üret */
  autoMaterialize?: boolean;
  allowCreate?: boolean;
  /** Öğretmen yoklaması odaklı ekran: varsayılan "bekleyen" filtresi + aksiyon gruplarını ayır */
  attendanceFocus?: boolean;
};

export default function SessionBrowserClient({
  title,
  description,
  fixedKind,
  dailyMode = false,
  showMaterialize = false,
  autoMaterialize = false,
  allowCreate = false,
  attendanceFocus = false,
}: Props) {
  const { activeKurum, activeSube, initialized } = useKurum();
  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [versions, setVersions] = useState<AcademicScheduleVersion[]>([]);
  const [meta, setMeta] = useState<LessonOpsMeta | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [dersOptions, setDersOptions] = useState<ClassLessonPlanDersOption[]>([]);
  const [termId, setTermId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('week'),
    dayjs().endOf('week'),
  ]);
  const [sessions, setSessions] = useState<LessonSession[]>([]);
  const [makeupCandidates, setMakeupCandidates] = useState<LessonSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentOptions, setStudentOptions] = useState<KutuphaneStudentOption[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [substituteFor, setSubstituteFor] = useState<LessonSession | null>(null);
  const [substituteId, setSubstituteId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [lastMaterializedKey, setLastMaterializedKey] = useState('');
  const [attendanceQuickFilter, setAttendanceQuickFilter] = useState<'PENDING' | 'ALL'>('PENDING');

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const [ctx, opsMeta] = await Promise.all([
        fetchClassLessonPlanContext(),
        fetchLessonOpsMeta(),
      ]);
      setContext(ctx);
      setMeta(opsMeta);
      setTermId((prev) => prev ?? ctx.active_term_id ?? ctx.terms[0]?.id ?? null);
      setDersOptions(opsMeta.dersler || []);

      const templates = await fetchScheduleTemplates();
      const activeTpl = templates.find((t) => t.is_active) || templates[0];
      if (activeTpl) {
        const detail = await fetchScheduleTemplate(activeTpl.id);
        setSlots((detail.time_slots || []).filter((s) => s.slot_type === 'LESSON' && s.is_active));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (!termId) return;
    fetchAcademicScheduleVersions({ term_id: termId })
      .then((rows) => {
        setVersions(rows);
        setVersionId((prev) => {
          if (prev && rows.some((v) => v.id === prev)) return prev;
          return rows.find((v) => v.is_active)?.id ?? rows[0]?.id ?? null;
        });
      })
      .catch(() => setVersions([]));
  }, [termId]);

  const loadClassroomDers = useCallback(async (sinifId: number | null) => {
    if (!sinifId) {
      setDersOptions(meta?.dersler || []);
      return;
    }
    try {
      const dersler = await fetchClassLessonPlanDersOptions(sinifId);
      setDersOptions(dersler.length ? dersler : meta?.dersler || []);
    } catch {
      setDersOptions(meta?.dersler || []);
    }
  }, [meta?.dersler]);

  const load = useCallback(async () => {
    if (!termId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchLessonSessions({
        term_id: termId,
        date: dailyMode ? date.format('YYYY-MM-DD') : undefined,
        date_from: !dailyMode ? range[0].format('YYYY-MM-DD') : undefined,
        date_to: !dailyMode ? range[1].format('YYYY-MM-DD') : undefined,
        version_id: versionId ?? undefined,
        classroom_id: classroomId ?? undefined,
        teacher_id: teacherId ?? undefined,
        session_kind: fixedKind,
        status: status ?? undefined,
      });
      setSessions(rows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Oturumlar yüklenemedi');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [classroomId, dailyMode, date, fixedKind, range, status, teacherId, termId, versionId]);

  useEffect(() => {
    load();
  }, [load]);

  const materializeKey = termId
    ? `${termId}|${date.format('YYYY-MM-DD')}|${versionId ?? ''}|${classroomId ?? ''}`
    : '';

  useEffect(() => {
    if (!autoMaterialize || !dailyMode || !showMaterialize || !materializeKey) return;
    if (lastMaterializedKey === materializeKey) return;
    setLastMaterializedKey(materializeKey);
    const [tid, d, vid, cid] = materializeKey.split('|');
    materializeLessonSessions({
      term_id: Number(tid),
      date: d,
      version_id: vid ? Number(vid) : undefined,
      classroom_id: cid ? Number(cid) : undefined,
    })
      .then(() => load())
      .catch(() => null);
  }, [
    autoMaterialize,
    dailyMode,
    lastMaterializedKey,
    load,
    materializeKey,
    showMaterialize,
  ]);

  const loadMakeupCandidates = useCallback(async () => {
    if (!termId || fixedKind !== 'MAKEUP') {
      setMakeupCandidates([]);
      return;
    }
    try {
      const [cancelled, postponed, noShow] = await Promise.all([
        fetchLessonSessions({ term_id: termId, status: 'CANCELLED' }),
        fetchLessonSessions({ term_id: termId, status: 'POSTPONED' }),
        fetchLessonSessions({ term_id: termId, status: 'NO_SHOW' }),
      ]);
      const map = new Map<number, LessonSession>();
      [...cancelled, ...postponed, ...noShow].forEach((s) => map.set(s.id, s));
      setMakeupCandidates(
        Array.from(map.values()).sort((a, b) => b.session_date.localeCompare(a.session_date)),
      );
    } catch {
      setMakeupCandidates([]);
    }
  }, [fixedKind, termId]);

  useEffect(() => {
    if (createOpen && fixedKind === 'MAKEUP') loadMakeupCandidates();
  }, [createOpen, fixedKind, loadMakeupCandidates]);

  const runMaterialize = async () => {
    if (!termId) return;
    try {
      const result = await materializeLessonSessions({
        term_id: termId,
        date: date.format('YYYY-MM-DD'),
        version_id: versionId ?? undefined,
        classroom_id: classroomId ?? undefined,
      });
      message.success(
        result.info || `${result.created_count} yeni, ${result.existing_count} mevcut oturum`,
      );
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Üretim başarısız');
    }
  };

  const runAction = async (
    row: LessonSession,
    action: 'start' | 'complete' | 'cancel' | 'no_show',
  ) => {
    if (action === 'cancel') {
      Modal.confirm({
        title: 'Oturum iptal edilsin mi?',
        content: `${row.ders?.name || 'Ders'} · ${row.sinif?.name || 'Özel'}`,
        okText: 'İptal et',
        okButtonProps: { danger: true },
        onOk: async () => {
          await lessonSessionAction(row.id, 'cancel');
          message.success('Oturum iptal edildi');
          load();
        },
      });
      return;
    }
    try {
      await lessonSessionAction(row.id, action);
      message.success('Güncellendi');
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'İşlem başarısız');
    }
  };

  const markTeacher = async (row: LessonSession, teacherStatus: 'PRESENT' | 'ABSENT') => {
    try {
      await setLessonTeacherAttendance(row.id, { status: teacherStatus });
      message.success('Öğretmen yoklaması kaydedildi');
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    }
  };

  const saveSubstitute = async () => {
    if (!substituteFor || !substituteId) {
      message.warning('Yedek öğretmen seçin');
      return;
    }
    try {
      await setLessonTeacherAttendance(substituteFor.id, {
        status: 'SUBSTITUTE',
        substitute_ogretmen_id: substituteId,
      });
      message.success('Yedek öğretmen atandı');
      setSubstituteFor(null);
      setSubstituteId(null);
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Atama başarısız');
    }
  };

  const searchStudents = async (q: string) => {
    if (q.trim().length < 2) {
      setStudentOptions([]);
      return;
    }
    setStudentSearching(true);
    try {
      setStudentOptions(await searchKutuphaneStudents(q));
    } finally {
      setStudentSearching(false);
    }
  };

  const handleCreate = async () => {
    if (!termId) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await createLessonSession({
        term_id: termId,
        schedule_version_id: versionId,
        session_date: (values.session_date as Dayjs).format('YYYY-MM-DD'),
        timeslot_id: values.timeslot_id,
        ders_id: values.ders_id,
        ogretmen_id: values.ogretmen_id,
        sinif_id: values.sinif_id ? Number(values.sinif_id) : undefined,
        private_student_id: values.private_student_id
          ? Number(values.private_student_id)
          : undefined,
        replaces_session_id: values.replaces_session_id
          ? Number(values.replaces_session_id)
          : undefined,
        session_kind: fixedKind || values.session_kind || 'EXTRA',
        notes: values.notes || '',
        payable: true,
      });
      message.success('Oturum oluşturuldu');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : 'Oluşturma başarısız');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<LessonSession> = useMemo(() => {
    const cols: ColumnsType<LessonSession> = [
      {
        title: 'Tarih',
        dataIndex: 'session_date',
        width: 110,
        render: (v: string) => dayjs(v).format('DD.MM.YYYY'),
      },
      {
        title: 'Saat',
        key: 'time',
        width: 120,
        render: (_, r) => (
          <span className="ops-time">
            {[r.start_time, r.end_time].filter(Boolean).join(' – ')}
          </span>
        ),
      },
      {
        title: 'Ders',
        key: 'ders',
        render: (_, r) => r.ders?.name || '—',
      },
      {
        title: 'Sınıf',
        key: 'sinif',
        render: (_, r) =>
          r.sinif?.name || (r.private_student ? `Özel · ${r.private_student.name}` : '—'),
      },
      {
        title: 'Öğretmen',
        key: 'teacher',
        render: (_, r) => r.effective_teacher?.name || r.ogretmen?.name || '—',
      },
    ];

    if (!fixedKind) {
      cols.push({
        title: 'Tür',
        dataIndex: 'session_kind_display',
        width: 110,
      });
    }

    cols.push(
      {
        title: 'Durum',
        key: 'status',
        width: 120,
        render: (_, r) => (
          <Tag color={STATUS_COLOR[r.status] || 'default'}>{r.status_display}</Tag>
        ),
      },
      {
        title: 'Öğrt. Yoklama',
        dataIndex: 'teacher_attendance_display',
        width: 120,
      },
      {
        title: 'İşlem',
        key: 'actions',
        width: 280,
        render: (_, r) => {
          const showLifecycle = !attendanceFocus && (r.status === 'SCHEDULED' || r.status === 'IN_PROGRESS');
          const showAttendance = r.teacher_attendance === 'PENDING' && r.status !== 'CANCELLED';
          return (
            <div className="ops-actions">
              {showLifecycle ? (
                <span className="ops-action-group">
                  {r.status === 'SCHEDULED' ? (
                    <Button size="small" icon={<PlayCircleOutlined />} onClick={() => runAction(r, 'start')}>
                      Başlat
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={() => runAction(r, 'complete')}
                  >
                    Bitir
                  </Button>
                  <Button size="small" danger icon={<CloseOutlined />} onClick={() => runAction(r, 'cancel')}>
                    İptal
                  </Button>
                </span>
              ) : null}
              {showLifecycle && showAttendance ? <span className="ops-action-divider" /> : null}
              {showAttendance ? (
                <span className="ops-action-group">
                  <Button size="small" onClick={() => markTeacher(r, 'PRESENT')}>
                    Geldi
                  </Button>
                  <Button size="small" danger onClick={() => markTeacher(r, 'ABSENT')}>
                    Gelmedi
                  </Button>
                  <Button
                    size="small"
                    icon={<UserSwitchOutlined />}
                    onClick={() => {
                      setSubstituteFor(r);
                      setSubstituteId(null);
                    }}
                  >
                    Yedek
                  </Button>
                </span>
              ) : null}
            </div>
          );
        },
      },
    );

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions use latest load/runAction closures
  }, [fixedKind, attendanceFocus]);

  const visibleSessions = useMemo(() => {
    if (!attendanceFocus || attendanceQuickFilter !== 'PENDING') return sessions;
    return sessions.filter((s) => s.teacher_attendance === 'PENDING' && s.status !== 'CANCELLED');
  }, [attendanceFocus, attendanceQuickFilter, sessions]);

  const pendingCount = useMemo(
    () => sessions.filter((s) => s.teacher_attendance === 'PENDING' && s.status !== 'CANCELLED').length,
    [sessions],
  );

  if (!initialized) return <div className="ops-empty">Bağlam yükleniyor…</div>;
  if (!activeKurum || !activeSube) {
    return <Alert type="warning" showIcon message="Kurum ve şube seçimi gerekli" />;
  }

  return (
    <div className="ops-page">
      <div className="ops-toolbar">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {title}
          </Title>
          <Text type="secondary">{description}</Text>
        </div>
        <Space wrap>
          {showMaterialize ? (
            <Button type="primary" onClick={runMaterialize}>
              Programdan Üret
            </Button>
          ) : null}
          {allowCreate ? (
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                form.setFieldsValue({
                  session_date: dailyMode ? date : dayjs(),
                  session_kind: fixedKind || 'EXTRA',
                  sinif_id: classroomId ?? undefined,
                });
                loadClassroomDers(classroomId);
                setCreateOpen(true);
              }}
            >
              Yeni Oturum
            </Button>
          ) : null}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              boot();
              load();
            }}
          >
            Yenile
          </Button>
        </Space>
      </div>

      <div className="ops-card">
        <div className="ops-filters">
          {dailyMode ? (
            <div className="ops-filter-item">
              <label>Tarih</label>
              <DatePicker
                value={date}
                onChange={(d) => d && setDate(d)}
                format="DD.MM.YYYY"
                allowClear={false}
              />
            </div>
          ) : (
            <div className="ops-filter-item" style={{ minWidth: 260 }}>
              <label>Tarih aralığı</label>
              <RangePicker
                value={range}
                onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
                format="DD.MM.YYYY"
                allowClear={false}
              />
            </div>
          )}
          <div className="ops-filter-item">
            <label>Dönem</label>
            <Select
              style={{ minWidth: 170 }}
              value={termId ?? undefined}
              onChange={setTermId}
              options={(context?.terms || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Versiyon</label>
            <Select
              allowClear
              style={{ minWidth: 170 }}
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
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 150 }}
              value={classroomId ?? undefined}
              onChange={(v) => setClassroomId(v ?? null)}
              options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Öğretmen</label>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 160 }}
              value={teacherId ?? undefined}
              onChange={(v) => setTeacherId(v ?? null)}
              options={(meta?.teachers || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div className="ops-filter-item">
            <label>Durum</label>
            <Select
              allowClear
              style={{ minWidth: 140 }}
              value={status ?? undefined}
              onChange={(v) => setStatus(v ?? null)}
              options={meta?.session_statuses || []}
            />
          </div>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <Text strong>{visibleSessions.length} oturum</Text>
          {fixedKind ? <Tag>{fixedKind}</Tag> : null}
          {attendanceFocus ? (
            <Segmented
              size="small"
              value={attendanceQuickFilter}
              onChange={(v) => setAttendanceQuickFilter(v as 'PENDING' | 'ALL')}
              options={[
                { label: `Bekleyenler (${pendingCount})`, value: 'PENDING' },
                { label: 'Tümü', value: 'ALL' },
              ]}
              style={{ marginLeft: 'auto' }}
            />
          ) : null}
        </div>
        <Table<LessonSession>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={visibleSessions}
          pagination={{ pageSize: 30, showSizeChanger: true }}
          size="middle"
          locale={{
            emptyText:
              attendanceFocus && attendanceQuickFilter === 'PENDING'
                ? 'Bekleyen öğretmen yoklaması yok — tüm oturumlar için yoklama alınmış.'
                : showMaterialize
                  ? 'Kayıt yok. “Programdan Üret” ile günlük oturumları oluşturun.'
                  : 'Kayıt yok. “Yeni Oturum” ile ekleyin.',
          }}
          scroll={{ x: 1100 }}
        />
      </div>

      <Drawer
        title="Yeni oturum"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        width={460}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button type="primary" loading={saving} onClick={handleCreate}>
              Kaydet
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ session_date: dayjs(), session_kind: fixedKind || 'EXTRA' }}
        >
          <Form.Item name="session_date" label="Tarih" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item
            name="timeslot_id"
            label="Ders saati"
            rules={[{ required: true, message: 'Saat seçin' }]}
          >
            <Select
              options={slots.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.start_time_display || s.start_time} – ${s.end_time_display || s.end_time})`,
              }))}
            />
          </Form.Item>
          {fixedKind !== 'PRIVATE' ? (
            <Form.Item
              name="sinif_id"
              label="Sınıf"
              rules={[{ required: true, message: 'Sınıf seçin' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={(context?.classrooms || []).map((c) => ({ value: c.id, label: c.ad }))}
                onChange={(v) => {
                  form.setFieldValue('ders_id', undefined);
                  loadClassroomDers(v ?? null);
                }}
              />
            </Form.Item>
          ) : (
            <Form.Item
              name="private_student_id"
              label="Öğrenci"
              rules={[{ required: true, message: 'Öğrenci seçin' }]}
            >
              <Select
                showSearch
                filterOption={false}
                onSearch={searchStudents}
                loading={studentSearching}
                placeholder="En az 2 karakter yazın"
                options={studentOptions.map((s) => ({
                  value: s.id,
                  label: s.tam_ad || `${s.ad} ${s.soyad}`.trim(),
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="ders_id" label="Ders" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={dersOptions.map((d) => ({
                value: d.id,
                label: d.kod ? `${d.ad} (${d.kod})` : d.ad,
              }))}
            />
          </Form.Item>
          <Form.Item name="ogretmen_id" label="Öğretmen" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(meta?.teachers || []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          {fixedKind === 'MAKEUP' ? (
            <Form.Item
              name="replaces_session_id"
              label="Telafi edilen oturum"
              rules={[{ required: true, message: 'Kaynak oturum seçin' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="İptal / ertelenmiş / gelinmedi"
                options={makeupCandidates.map((s) => ({
                  value: s.id,
                  label: `${dayjs(s.session_date).format('DD.MM.YYYY')} ${s.start_time || ''} · ${s.ders?.name || ''} · ${s.sinif?.name || ''} (${s.status_display})`,
                }))}
              />
            </Form.Item>
          ) : null}
          {!fixedKind ? (
            <Form.Item name="session_kind" label="Tür" rules={[{ required: true }]}>
              <Select options={meta?.session_kinds || []} />
            </Form.Item>
          ) : null}
          <Form.Item name="notes" label="Not">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="Yedek öğretmen ata"
        open={Boolean(substituteFor)}
        onCancel={() => {
          setSubstituteFor(null);
          setSubstituteId(null);
        }}
        onOk={saveSubstitute}
        okText="Ata"
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {substituteFor
            ? `${substituteFor.ders?.name || 'Ders'} · ${substituteFor.sinif?.name || 'Özel'} · ${substituteFor.ogretmen?.name || ''}`
            : ''}
        </Text>
        <Select
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          placeholder="Yedek öğretmen"
          value={substituteId ?? undefined}
          onChange={setSubstituteId}
          options={(meta?.teachers || [])
            .filter((t) => t.id !== substituteFor?.ogretmen?.id)
            .map((t) => ({ value: t.id, label: t.name }))}
        />
      </Modal>
    </div>
  );
}
