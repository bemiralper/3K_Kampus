'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  createClassLessonTeacherAssignment,
  deleteClassLessonTeacherAssignment,
  fetchClassLessonPlanContext,
  fetchClassLessonPlans,
  fetchClassLessonTeacherAssignments,
  fetchTeacherAssignmentRoles,
  fetchTeachersForAvailability,
  updateClassLessonTeacherAssignment,
  type ClassLessonPlan,
  type ClassLessonPlanClassroom,
  type ClassLessonPlanContext,
  type ClassLessonPlanTerm,
  type ClassLessonTeacherAssignment,
  type TeacherAssignmentRole,
  type TeacherListItem,
  type TeacherRoleOption,
} from '@/lib/academic-api';
import './ogretmen-atamalari.css';

const { Title, Text } = Typography;

type FormValues = {
  ogretmen_id: number;
  role: TeacherAssignmentRole;
  priority: number;
  max_hours_for_class?: number | null;
  notes?: string;
};

const ROLE_COLOR: Record<string, string> = {
  PRIMARY: 'blue',
  SECONDARY: 'cyan',
  ASSISTANT: 'geekblue',
  CO_TEACHER: 'purple',
  SUBSTITUTE: 'orange',
};

export default function OgretmenAtamalariClient() {
  const { activeKurum, activeSube, initialized } = useKurum();

  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<number | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const [plans, setPlans] = useState<ClassLessonPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [assignments, setAssignments] = useState<ClassLessonTeacherAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [roles, setRoles] = useState<TeacherRoleOption[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClassLessonTeacherAssignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const selectedClassroom: ClassLessonPlanClassroom | undefined = useMemo(
    () => context?.classrooms.find((c) => c.id === selectedClassroomId),
    [context, selectedClassroomId],
  );

  const selectedTerm: ClassLessonPlanTerm | undefined = useMemo(
    () => context?.terms.find((t) => t.id === selectedTermId),
    [context, selectedTermId],
  );

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId),
    [plans, selectedPlanId],
  );

  const scheduleLocked = Boolean(selectedTerm?.schedule_locked || selectedPlan?.schedule_locked);

  const loadContext = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setContextLoading(true);
    try {
      const [ctx, roleRows] = await Promise.all([
        fetchClassLessonPlanContext(),
        fetchTeacherAssignmentRoles(),
      ]);
      setContext(ctx);
      setRoles(roleRows);
      setSelectedClassroomId((prev) => {
        if (prev && ctx.classrooms.some((c) => c.id === prev)) return prev;
        return ctx.classrooms[0]?.id ?? null;
      });
      setSelectedTermId((prev) => {
        if (prev && ctx.terms.some((t) => t.id === prev)) return prev;
        return ctx.active_term_id ?? ctx.terms[0]?.id ?? null;
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    } finally {
      setContextLoading(false);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const loadTeachers = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    try {
      const data = await fetchTeachersForAvailability({ aktif_only: true });
      setTeachers(data);
    } catch {
      setTeachers([]);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const loadPlans = useCallback(async () => {
    if (!selectedClassroomId || !selectedTermId) {
      setPlans([]);
      setSelectedPlanId(null);
      return;
    }
    setPlansLoading(true);
    try {
      const rows = await fetchClassLessonPlans({
        classroom_id: selectedClassroomId,
        term_id: selectedTermId,
      });
      setPlans(rows);
      setSelectedPlanId((prev) => {
        if (prev && rows.some((p) => p.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (e) {
      setPlans([]);
      setSelectedPlanId(null);
      message.error(e instanceof Error ? e.message : 'Ders planları yüklenemedi');
    } finally {
      setPlansLoading(false);
    }
  }, [selectedClassroomId, selectedTermId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const loadAssignments = useCallback(async () => {
    if (!selectedPlanId) {
      setAssignments([]);
      return;
    }
    setAssignmentsLoading(true);
    try {
      const rows = await fetchClassLessonTeacherAssignments({ plan_id: selectedPlanId });
      setAssignments(rows);
    } catch (e) {
      setAssignments([]);
      message.error(e instanceof Error ? e.message : 'Atamalar yüklenemedi');
    } finally {
      setAssignmentsLoading(false);
    }
  }, [selectedPlanId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const filteredClassrooms = useMemo(() => {
    const rows = context?.classrooms || [];
    const q = classSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return rows;
    return rows.filter((c) => {
      const hay = `${c.ad} ${c.kod} ${c.sinif_seviyesi_ad || ''} ${c.alan_ad || ''}`.toLocaleLowerCase(
        'tr-TR',
      );
      return hay.includes(q);
    });
  }, [classSearch, context?.classrooms]);

  const assignedTeacherIds = useMemo(
    () => new Set(assignments.map((a) => a.ogretmen)),
    [assignments],
  );

  const primaryCount = assignments.filter((a) => a.role === 'PRIMARY').length;
  const withoutPrimary = Boolean(selectedPlan && primaryCount === 0);

  const openCreate = () => {
    if (!selectedPlanId) {
      message.warning('Önce bir ders planı seçin');
      return;
    }
    if (scheduleLocked) {
      message.warning('Bu dönemin programı kilitli');
      return;
    }
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      role: primaryCount === 0 ? 'PRIMARY' : 'SECONDARY',
      priority: assignments.length + 1,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: ClassLessonTeacherAssignment) => {
    if (row.schedule_locked) {
      message.warning('Bu dönemin programı kilitli');
      return;
    }
    setEditing(row);
    form.setFieldsValue({
      ogretmen_id: row.ogretmen,
      role: row.role,
      priority: row.priority,
      max_hours_for_class: row.max_hours_for_class,
      notes: row.notes || undefined,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!selectedPlanId) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await updateClassLessonTeacherAssignment(editing.id, {
          role: values.role,
          priority: values.priority,
          max_hours_for_class: values.max_hours_for_class ?? null,
          notes: values.notes || null,
        });
        message.success('Atama güncellendi');
      } else {
        await createClassLessonTeacherAssignment({
          class_lesson_plan_id: selectedPlanId,
          ogretmen_id: values.ogretmen_id,
          role: values.role,
          priority: values.priority,
          max_hours_for_class: values.max_hours_for_class ?? null,
          notes: values.notes || null,
        });
        message.success('Atama eklendi');
      }
      setDrawerOpen(false);
      setEditing(null);
      await Promise.all([loadAssignments(), loadPlans()]);
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row: ClassLessonTeacherAssignment) => {
    if (row.schedule_locked) {
      message.warning('Bu dönemin programı kilitli');
      return;
    }
    Modal.confirm({
      title: 'Öğretmen ataması silinsin mi?',
      content: `${row.ogretmen_ad || 'Öğretmen'} — ${row.role_display}`,
      okText: 'Sil',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteClassLessonTeacherAssignment(row.id);
          message.success('Atama silindi');
          await Promise.all([loadAssignments(), loadPlans()]);
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Silme başarısız');
          throw e;
        }
      },
    });
  };

  const columns: ColumnsType<ClassLessonTeacherAssignment> = [
    {
      title: 'Öğretmen',
      key: 'ogretmen',
      render: (_, row) => <span style={{ fontWeight: 600 }}>{row.ogretmen_ad || '—'}</span>,
    },
    {
      title: 'Rol',
      key: 'role',
      width: 150,
      render: (_, row) => (
        <Tag color={ROLE_COLOR[row.role] || 'default'}>{row.role_display}</Tag>
      ),
    },
    {
      title: 'Öncelik',
      dataIndex: 'priority',
      width: 80,
      align: 'center',
    },
    {
      title: 'Max saat',
      key: 'max',
      width: 90,
      align: 'center',
      render: (_, row) => row.max_hours_for_class ?? '—',
    },
    {
      title: 'Not',
      dataIndex: 'notes',
      ellipsis: true,
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, row) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            disabled={scheduleLocked}
            onClick={() => openEdit(row)}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={scheduleLocked}
            onClick={() => handleDelete(row)}
          />
        </Space>
      ),
    },
  ];

  const teacherOptions = useMemo(() => {
    return teachers
      .filter((t) => !assignedTeacherIds.has(t.id) || (editing && editing.ogretmen === t.id))
      .map((t) => ({
        value: t.id,
        label: `${t.tam_ad}${t.brans && t.brans !== '—' ? ` · ${t.brans}` : ''}`,
      }));
  }, [assignedTeacherIds, editing, teachers]);

  if (!initialized) {
    return <div className="oa-empty">Bağlam yükleniyor…</div>;
  }

  if (!activeKurum || !activeSube) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Kurum ve şube seçimi gerekli"
        description="Öğretmen atamaları şube bazlıdır. Üst menüden kurum ve şube seçin."
      />
    );
  }

  return (
    <div className="oa-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Öğretmen Atamaları
          </Title>
          <Text type="secondary">
            Sınıf ders planına bir veya birden fazla öğretmen bağlayın. Asıl öğretmen, ders planı
            özeti ve program motoru için kullanılır.
          </Text>
        </div>
        <Space wrap>
          {context?.active_year ? (
            <Tag color="geekblue">Eğitim yılı: {context.active_year.yil_str}</Tag>
          ) : null}
          <Select
            style={{ minWidth: 200 }}
            placeholder="Dönem"
            value={selectedTermId ?? undefined}
            onChange={(v) => setSelectedTermId(v)}
            options={(context?.terms || []).map((t) => ({
              value: t.id,
              label: `${t.name}${t.schedule_locked ? ' (kilitli)' : ''}`,
            }))}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadContext();
              loadPlans();
              loadAssignments();
            }}
          >
            Yenile
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={scheduleLocked || !selectedPlanId}
            onClick={openCreate}
          >
            Öğretmen Ata
          </Button>
        </Space>
      </div>

      {context?.context_year_mismatch ? (
        <Alert
          type="warning"
          showIcon
          message="Üst menüdeki eğitim yılı, planlamanın kullandığı aktif yıldan farklı"
        />
      ) : null}

      <div className="oa-layout">
        <aside className="oa-card">
          <div className="oa-card-head">
            <Text strong>Sınıflar</Text>
            <Text type="secondary">{filteredClassrooms.length}</Text>
          </div>
          <div className="oa-card-body">
            <Input
              allowClear
              placeholder="Sınıf ara…"
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            {contextLoading ? (
              <div className="oa-empty">Yükleniyor…</div>
            ) : filteredClassrooms.length === 0 ? (
              <div className="oa-empty">Aktif yılda sınıf yok.</div>
            ) : (
              <div className="oa-list">
                {filteredClassrooms.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`oa-item${selectedClassroomId === c.id ? ' is-active' : ''}`}
                    onClick={() => setSelectedClassroomId(c.id)}
                  >
                    <span className="oa-item-title">{c.ad}</span>
                    <span className="oa-item-meta">
                      {[c.sinif_seviyesi_ad, c.alan_ad].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <aside className="oa-card">
          <div className="oa-card-head">
            <Text strong>Ders planları</Text>
            <Text type="secondary">{plans.length}</Text>
          </div>
          <div className="oa-card-body">
            {plansLoading ? (
              <div className="oa-empty">Yükleniyor…</div>
            ) : plans.length === 0 ? (
              <div className="oa-empty">
                Bu sınıf/dönem için ders planı yok. Önce Sınıf Ders Planları’ndan ekleyin.
              </div>
            ) : (
              <div className="oa-list">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`oa-item${selectedPlanId === p.id ? ' is-active' : ''}`}
                    onClick={() => setSelectedPlanId(p.id)}
                  >
                    <span className="oa-item-title">{p.ders_ad}</span>
                    <span className="oa-item-meta">
                      {p.weekly_hours} saat
                      {p.ogretmen_ad ? ` · ${p.ogretmen_ad}` : ' · asıl yok'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="oa-card">
          <div className="oa-card-head">
            <div>
              <Text strong>
                {selectedClassroom?.ad || 'Sınıf'}
                {selectedPlan ? ` · ${selectedPlan.ders_ad}` : ''}
              </Text>
              {selectedPlan ? (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Haftalık {selectedPlan.weekly_hours} saat
                    {selectedPlan.ders_kod ? ` · ${selectedPlan.ders_kod}` : ''}
                  </Text>
                </div>
              ) : null}
            </div>
          </div>
          <div className="oa-card-body">
            {scheduleLocked ? (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="Dönem programı kilitli"
                description="Bu dönemde öğretmen ataması eklenemez veya değiştirilemez."
              />
            ) : null}

            {withoutPrimary ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Asıl öğretmen atanmamış"
                description="Program motoru için en az bir PRIMARY (asıl) öğretmen önerilir."
              />
            ) : null}

            {selectedPlan ? (
              <div className="oa-summary-grid">
                <div className="oa-summary-item">
                  <label>Atama</label>
                  <span>{assignments.length}</span>
                </div>
                <div className="oa-summary-item">
                  <label>Asıl</label>
                  <span>{primaryCount}</span>
                </div>
                <div className="oa-summary-item">
                  <label>Haftalık saat</label>
                  <span>{selectedPlan.weekly_hours}</span>
                </div>
              </div>
            ) : null}

            {!selectedPlanId ? (
              <div className="oa-empty">Atamaları görmek için ders planı seçin.</div>
            ) : (
              <Table<ClassLessonTeacherAssignment>
                rowKey="id"
                loading={assignmentsLoading}
                columns={columns}
                dataSource={assignments}
                pagination={false}
                size="middle"
                locale={{ emptyText: 'Bu ders planına henüz öğretmen atanmamış.' }}
              />
            )}
          </div>
        </section>
      </div>

      <Drawer
        title={editing ? 'Atamayı düzenle' : 'Öğretmen ata'}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        width={440}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Vazgeç</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              Kaydet
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="ogretmen_id"
            label="Öğretmen"
            rules={[{ required: true, message: 'Öğretmen seçin' }]}
            extra="Listede yalnızca bu şube ve eğitim yılında öğretmen görevlendirmesi olan personel vardır."
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={Boolean(editing)}
              placeholder="Öğretmen seçin"
              options={teacherOptions}
            />
          </Form.Item>

          <Form.Item
            name="role"
            label="Rol"
            rules={[{ required: true, message: 'Rol seçin' }]}
          >
            <Select
              options={roles.map((r) => ({ value: r.value, label: r.label }))}
              placeholder="Rol"
            />
          </Form.Item>

          <Space style={{ width: '100%' }} size="middle">
            <Form.Item
              name="priority"
              label="Öncelik"
              rules={[{ required: true, message: 'Öncelik girin' }]}
              style={{ flex: 1 }}
              extra="1 = en yüksek"
            >
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="max_hours_for_class"
              label="Max saat (opsiyonel)"
              style={{ flex: 1 }}
              extra={
                selectedPlan
                  ? `Plan: ${selectedPlan.weekly_hours} saat`
                  : undefined
              }
            >
              <InputNumber
                min={1}
                max={selectedPlan?.weekly_hours || 40}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Space>

          <Form.Item name="notes" label="Not">
            <Input.TextArea rows={3} allowClear />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
