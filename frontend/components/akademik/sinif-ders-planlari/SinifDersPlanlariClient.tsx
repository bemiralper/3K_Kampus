'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useKurum } from '@/lib/contexts/KurumContext';
import {
  bulkDeleteClassLessonPlans,
  copyClassLessonPlans,
  createClassLessonPlan,
  deleteClassLessonPlan,
  fetchClassLessonPlanContext,
  fetchClassLessonPlanDersOptions,
  fetchClassLessonPlanSummary,
  fetchClassLessonPlans,
  fetchTeachersForAvailability,
  seedClassLessonPlansFromAlan,
  emitClassLessonPlanChanged,
  updateClassLessonPlan,
  type ClassLessonPlan,
  type ClassLessonPlanClassroom,
  type ClassLessonPlanContext,
  type ClassLessonPlanDersOption,
  type ClassLessonPlanSummary,
  type ClassLessonPlanTerm,
  type TeacherListItem,
} from '@/lib/academic-api';
import './sinif-ders-planlari.css';

const { Title, Text } = Typography;

function planDisplayDefault(row: ClassLessonPlan): string {
  return (row.ders_kisa_ad || row.ders_ad || '').trim();
}

function planDisplayShown(row: ClassLessonPlan): string {
  const override = (row.gorunen_ad || '').trim();
  if (override) return override;
  return planDisplayDefault(row);
}

export default function SinifDersPlanlariClient() {
  const { activeKurum, activeSube, initialized } = useKurum();

  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<number | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);

  const [plans, setPlans] = useState<ClassLessonPlan[]>([]);
  const [summary, setSummary] = useState<ClassLessonPlanSummary | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);

  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [dersOptions, setDersOptions] = useState<ClassLessonPlanDersOption[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addDersId, setAddDersId] = useState<number | null>(null);
  const [addHours, setAddHours] = useState(2);
  const [adding, setAdding] = useState(false);
  const [rowSavingId, setRowSavingId] = useState<number | null>(null);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);
  const [copyTeachers, setCopyTeachers] = useState(false);
  const [copyOverwrite, setCopyOverwrite] = useState(false);
  const [copying, setCopying] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [gorunenDrafts, setGorunenDrafts] = useState<Record<number, string>>({});

  const selectedClassroom: ClassLessonPlanClassroom | undefined = useMemo(
    () => context?.classrooms.find((c) => c.id === selectedClassroomId),
    [context, selectedClassroomId],
  );

  const selectedTerm: ClassLessonPlanTerm | undefined = useMemo(
    () => context?.terms.find((t) => t.id === selectedTermId),
    [context, selectedTermId],
  );

  const scheduleLocked = Boolean(selectedTerm?.schedule_locked);

  const loadContext = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setContextLoading(true);
    try {
      const data = await fetchClassLessonPlanContext();
      setContext(data);
      setSelectedClassroomId((prev) => {
        if (prev && data.classrooms.some((c) => c.id === prev)) return prev;
        return data.classrooms[0]?.id ?? null;
      });
      setSelectedTermId((prev) => {
        if (prev && data.terms.some((t) => t.id === prev)) return prev;
        return data.active_term_id ?? data.terms[0]?.id ?? null;
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Planlama bağlamı yüklenemedi');
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
      setTeachers(await fetchTeachersForAvailability({ aktif_only: true }));
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
      setSummary(null);
      return;
    }
    setPlansLoading(true);
    try {
      const [planRows, summaryRow] = await Promise.all([
        fetchClassLessonPlans({
          classroom_id: selectedClassroomId,
          term_id: selectedTermId,
        }),
        fetchClassLessonPlanSummary(selectedClassroomId, selectedTermId),
      ]);
      setPlans(planRows);
      setSummary(summaryRow);
    } catch (e) {
      setPlans([]);
      setSummary(null);
      message.error(e instanceof Error ? e.message : 'Planlar yüklenemedi');
    } finally {
      setPlansLoading(false);
    }
  }, [selectedClassroomId, selectedTermId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    setSelectedPlanIds([]);
    setGorunenDrafts({});
    setPlanSearch('');
  }, [selectedClassroomId, selectedTermId]);

  const loadDersOptions = useCallback(async (classroomId: number) => {
    try {
      setDersOptions(await fetchClassLessonPlanDersOptions(classroomId));
    } catch (e) {
      setDersOptions([]);
      message.error(e instanceof Error ? e.message : 'Ders listesi yüklenemedi');
    }
  }, []);

  useEffect(() => {
    if (selectedClassroomId) loadDersOptions(selectedClassroomId);
  }, [loadDersOptions, selectedClassroomId]);

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

  const usedDersIds = useMemo(() => new Set(plans.map((p) => p.ders)), [plans]);

  const addDersOptions = useMemo(
    () =>
      dersOptions
        .filter((d) => !usedDersIds.has(d.id))
        .map((d) => ({
          value: d.id,
          label: d.kod ? `${d.ad} (${d.kod})` : d.ad,
        })),
    [dersOptions, usedDersIds],
  );

  const teacherOptions = useMemo(
    () =>
      teachers.map((t) => ({
        value: t.id,
        label: `${t.tam_ad}${t.brans && t.brans !== '—' ? ` · ${t.brans}` : ''}`,
      })),
    [teachers],
  );

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return plans;
    return plans.filter((p) => {
      const hay = [
        p.ders_ad,
        p.ders_kod,
        p.ders_kisa_ad,
        p.gorunen_ad,
        p.ders_gorunen_ad,
        p.ogretmen_ad,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [planSearch, plans]);

  const patchRow = async (
    row: ClassLessonPlan,
    patch: { weekly_hours?: number; ogretmen?: number | null; gorunen_ad?: string },
  ) => {
    if (scheduleLocked) {
      message.warning('Bu dönemin programı kilitli');
      return;
    }
    setRowSavingId(row.id);
    try {
      const updated = await updateClassLessonPlan(row.id, patch);
      setPlans((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...updated } : p)));
      if (patch.gorunen_ad !== undefined) {
        setGorunenDrafts((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      } else {
        message.success('Kaydedildi');
      }
      emitClassLessonPlanChanged({
        planId: row.id,
        classroomId: selectedClassroomId,
        termId: selectedTermId,
      });
      if (selectedClassroomId && selectedTermId) {
        setSummary(await fetchClassLessonPlanSummary(selectedClassroomId, selectedTermId));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Güncelleme başarısız');
      loadPlans();
    } finally {
      setRowSavingId(null);
    }
  };

  const saveGorunenAd = async (row: ClassLessonPlan, rawValue: string) => {
    const typed = rawValue.trim();
    const catalogDefault = planDisplayDefault(row);
    const toSave = !typed || typed === catalogDefault ? '' : typed;
    const prevStored = (row.gorunen_ad || '').trim();
    if (toSave === prevStored) {
      setGorunenDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }
    await patchRow(row, { gorunen_ad: toSave });
    message.success('Görünen ad kaydedildi');
  };

  const openAddModal = () => {
    if (scheduleLocked || !selectedClassroomId) return;
    setAddDersId(null);
    setAddHours(2);
    setAddOpen(true);
    loadDersOptions(selectedClassroomId);
  };

  const handleAddDers = async () => {
    if (!selectedClassroomId || !selectedTermId || !addDersId) {
      message.warning('Ders seçin');
      return;
    }
    setAdding(true);
    try {
      await createClassLessonPlan({
        term: selectedTermId,
        sinif: selectedClassroomId,
        ders: addDersId,
        weekly_hours: addHours || 2,
        credit: 0,
        is_mandatory: true,
        is_double_block: false,
        priority: 1,
      });
      message.success('Ders eklendi');
      setAddOpen(false);
      setAddDersId(null);
      setAddHours(2);
      loadPlans();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ekleme başarısız');
    } finally {
      setAdding(false);
    }
  };

  const handleSeed = async () => {
    if (!selectedClassroomId || !selectedTermId) return;
    if (!selectedClassroom?.alan_id) {
      message.warning('Bu sınıfa alan atanmamış');
      return;
    }
    setSeeding(true);
    try {
      const result = await seedClassLessonPlansFromAlan({
        classroom_id: selectedClassroomId,
        term_id: selectedTermId,
        default_weekly_hours: 2,
      });
      message.success({
        content: result.created_count
          ? `${result.alan_ad || 'Alan'}: ${result.created_count} ders eklendi`
          : `Yeni ders yok (${result.skipped_existing} zaten mevcut)`,
      });
      loadPlans();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Alandan doldurma başarısız');
    } finally {
      setSeeding(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedClassroomId || !selectedTermId || !copyTargets.length) {
      message.warning('Hedef sınıf seçin');
      return;
    }
    setCopying(true);
    try {
      const result = await copyClassLessonPlans({
        source_classroom_id: selectedClassroomId,
        term_id: selectedTermId,
        target_classroom_ids: copyTargets,
        copy_teachers: copyTeachers,
        mode: copyOverwrite ? 'overwrite_hours' : 'skip_existing',
      });
      message.success({
        content: `${result.created_count} eklendi, ${result.updated_count} güncellendi, ${result.skipped_count} atlandı`,
      });
      setCopyOpen(false);
      setCopyTargets([]);
      setCopyTeachers(false);
      setCopyOverwrite(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kopyalama başarısız');
    } finally {
      setCopying(false);
    }
  };

  const handleBulkDelete = () => {
    if (scheduleLocked) {
      message.warning('Bu dönemin programı kilitli');
      return;
    }
    if (!selectedPlanIds.length) {
      message.warning('Silmek için ders seçin');
      return;
    }
    Modal.confirm({
      title: `${selectedPlanIds.length} ders planı silinsin mi?`,
      content: 'Seçili satırlar plan listesinden kaldırılır.',
      okText: 'Sil',
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        setBulkDeleting(true);
        try {
          const n = await bulkDeleteClassLessonPlans(selectedPlanIds);
          message.success({ content: `${n} plan silindi` });
          setSelectedPlanIds([]);
          await loadPlans();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Toplu silme başarısız');
          throw e;
        } finally {
          setBulkDeleting(false);
        }
      },
    });
  };

  const handleDelete = (row: ClassLessonPlan) => {
    if (scheduleLocked) {
      message.warning('Bu dönemin programı kilitli');
      return;
    }
    Modal.confirm({
      title: 'Ders planı silinsin mi?',
      content: `${row.ders_ad} planı kaldırılır.`,
      okText: 'Sil',
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        try {
          await deleteClassLessonPlan(row.id);
          message.success('Plan silindi');
          setSelectedPlanIds((prev) => prev.filter((id) => id !== row.id));
          await loadPlans();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Silme başarısız');
          throw e;
        }
      },
    });
  };

  const columns: ColumnsType<ClassLessonPlan> = [
    {
      title: 'Ders',
      key: 'ders',
      width: 200,
      sorter: (a, b) => (a.ders_ad || '').localeCompare(b.ders_ad || '', 'tr'),
      render: (_, row) => (
        <div>
          <div className="sdp-ders-cell-title">{row.ders_ad}</div>
          <div className="sdp-ders-cell-sub">
            {row.ders_kod || '—'}
            {row.ders_kisa_ad ? ` · kısa: ${row.ders_kisa_ad}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: (
        <Tooltip title="Program tablosunda görünen ad. Boşaltınca ders kısa adı / tam adı kullanılır.">
          Programda görünen
        </Tooltip>
      ),
      key: 'gorunen_ad',
      width: 180,
      render: (_, row) => {
        const shown = gorunenDrafts[row.id] ?? planDisplayShown(row);
        return (
          <Input
            size="small"
            allowClear
            value={shown}
            disabled={scheduleLocked || rowSavingId === row.id}
            onChange={(e) => {
              setGorunenDrafts((prev) => ({ ...prev, [row.id]: e.target.value }));
            }}
            onBlur={(e) => {
              void saveGorunenAd(row, e.target.value);
            }}
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
          />
        );
      },
    },
    {
      title: 'Haftalık saat',
      dataIndex: 'weekly_hours',
      width: 120,
      sorter: (a, b) => a.weekly_hours - b.weekly_hours,
      render: (v, row) => (
        <InputNumber
          min={1}
          max={40}
          size="small"
          value={v}
          disabled={scheduleLocked || rowSavingId === row.id}
          onChange={(n) => {
            if (n == null || n === v) return;
            patchRow(row, { weekly_hours: Number(n) });
          }}
        />
      ),
    },
    {
      title: 'Öğretmen',
      key: 'ogretmen',
      width: 280,
      sorter: (a, b) => (a.ogretmen_ad || '').localeCompare(b.ogretmen_ad || '', 'tr'),
      render: (_, row) => (
        <div>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            size="small"
            style={{ width: '100%' }}
            placeholder="Öğretmen seçin"
            value={row.ogretmen ?? undefined}
            disabled={scheduleLocked || rowSavingId === row.id}
            options={teacherOptions}
            onChange={(val) => patchRow(row, { ogretmen: val ?? null })}
            status={!row.ogretmen ? 'warning' : undefined}
          />
          {!row.ogretmen ? (
            <div className="sdp-teacher-missing">
              <WarningOutlined /> Öğretmensiz — programda yerleştirilemez
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 52,
      fixed: 'right',
      render: (_, row) => (
        <Tooltip title="Sil">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={scheduleLocked || rowSavingId === row.id}
            onClick={() => handleDelete(row)}
          />
        </Tooltip>
      ),
    },
  ];

  if (!initialized) return <div className="sdp-empty">Bağlam yükleniyor…</div>;

  if (!activeKurum || !activeSube) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Kurum ve şube seçimi gerekli"
        description="Sınıf ders planları şube bazlıdır. Üst menüden kurum ve şube seçin."
      />
    );
  }

  const emptyActions = (
    <div className="sdp-empty-actions">
      {selectedClassroom?.alan_id ? (
        <Button
          icon={<ThunderboltOutlined />}
          loading={seeding}
          disabled={scheduleLocked}
          onClick={handleSeed}
        >
          Alandan doldur
        </Button>
      ) : null}
      <Button
        type="primary"
        icon={<PlusOutlined />}
        disabled={scheduleLocked || !selectedClassroomId}
        onClick={openAddModal}
      >
        Ders Ekle
      </Button>
    </div>
  );

  return (
    <div className="sdp-page">
      <div className="sdp-toolbar">
        <div className="sdp-toolbar-title">
          <Title level={3}>Sınıf Ders Planları</Title>
          <Text className="sdp-toolbar-sub">
            Sınıfın haftalık ders listesi, saatleri ve öğretmenleri. Program tablosuna buradan
            beslenir.
          </Text>
        </div>
        <Space wrap size={8}>
          {context?.active_year ? (
            <Tag color="geekblue">{context.active_year.yil_str}</Tag>
          ) : null}
          {scheduleLocked ? <Tag color="orange">Dönem kilitli</Tag> : null}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadContext();
              loadPlans();
              loadTeachers();
            }}
          >
            Yenile
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

      <div className="sdp-layout">
        <aside className="sdp-card sdp-card--aside">
          <div className="sdp-card-head">
            <div className="sdp-card-head-main">
              <h2 className="sdp-card-head-title">Sınıflar</h2>
              <div className="sdp-card-head-meta">Aktif eğitim yılındaki sınıflar</div>
            </div>
            <span className="sdp-aside-count">{filteredClassrooms.length}</span>
          </div>
          <div className="sdp-card-body">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Sınıf, alan veya seviye ara…"
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
            />
            {contextLoading ? (
              <div className="sdp-empty">Yükleniyor…</div>
            ) : filteredClassrooms.length === 0 ? (
              <div className="sdp-empty">
                <p className="sdp-empty-title">Sınıf bulunamadı</p>
                <p className="sdp-empty-desc">
                  {classSearch
                    ? 'Arama kriterine uygun sınıf yok.'
                    : 'Aktif eğitim yılında sınıf tanımlı değil.'}
                </p>
              </div>
            ) : (
              <div className="sdp-class-list">
                {filteredClassrooms.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`sdp-class-item${selectedClassroomId === c.id ? ' is-active' : ''}`}
                    onClick={() => setSelectedClassroomId(c.id)}
                  >
                    <span className="sdp-class-item-title">{c.ad}</span>
                    <span className="sdp-class-item-badge">{c.ogrenci_sayisi} öğr.</span>
                    <span className="sdp-class-item-meta">
                      {[c.sinif_seviyesi_ad, c.alan_ad || 'Alan yok', c.oda_ad]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="sdp-card">
          <div className="sdp-card-head">
            <div className="sdp-card-head-main">
              <h2 className="sdp-card-head-title">
                {selectedClassroom?.ad || 'Sınıf seçin'}
                {selectedClassroom?.sinif_seviyesi_ad
                  ? ` · ${selectedClassroom.sinif_seviyesi_ad}`
                  : ''}
              </h2>
              <div className="sdp-card-head-meta">
                {selectedClassroom?.alan_ad
                  ? `Alan: ${selectedClassroom.alan_ad}${
                      selectedClassroom.oda_ad ? ` · Oda: ${selectedClassroom.oda_ad}` : ''
                    }`
                  : 'Alan atanmamış — alandan doldurma kullanılamaz'}
              </div>
            </div>
            <div className="sdp-card-head-actions">
              <Select
                style={{ minWidth: 180 }}
                placeholder="Dönem"
                value={selectedTermId ?? undefined}
                onChange={(v) => setSelectedTermId(v)}
                options={(context?.terms || []).map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.schedule_locked ? ' (kilitli)' : ''}`,
                }))}
              />
              <Tooltip
                title={
                  !selectedClassroom?.alan_id
                    ? 'Sınıfa alan atanmalı'
                    : 'Alanın standart derslerini ekler'
                }
              >
                <Button
                  icon={<ThunderboltOutlined />}
                  loading={seeding}
                  disabled={scheduleLocked || !selectedClassroom?.alan_id}
                  onClick={handleSeed}
                >
                  Alandan doldur
                </Button>
              </Tooltip>
              <Button
                icon={<CopyOutlined />}
                disabled={scheduleLocked || !plans.length}
                onClick={() => setCopyOpen(true)}
              >
                Kopyala
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={scheduleLocked || !selectedClassroomId}
                onClick={openAddModal}
              >
                Ders Ekle
              </Button>
            </div>
          </div>

          <div className="sdp-card-body">
            {scheduleLocked ? (
              <Alert
                className="sdp-locked-banner"
                type="info"
                showIcon
                message="Dönem programı kilitli"
                description="Bu dönemde ders planı ekleme, güncelleme ve silme kapalıdır."
              />
            ) : null}

            {summary ? (
              <div className="sdp-summary-grid">
                <div className="sdp-summary-item">
                  <label>Toplam ders</label>
                  <span>{summary.total_lessons}</span>
                </div>
                <div className="sdp-summary-item">
                  <label>Haftalık saat</label>
                  <span>{summary.total_weekly_hours}</span>
                </div>
                <div className="sdp-summary-item">
                  <label>Öğretmenli</label>
                  <span>{summary.lessons_with_teacher}</span>
                </div>
                <div
                  className={`sdp-summary-item${
                    summary.lessons_without_teacher > 0 ? ' is-warn' : ''
                  }`}
                >
                  <label>Öğretmensiz</label>
                  <span>{summary.lessons_without_teacher}</span>
                </div>
              </div>
            ) : null}

            {!selectedClassroomId || !selectedTermId ? (
              <div className="sdp-empty">
                <p className="sdp-empty-title">Sınıf ve dönem seçin</p>
                <p className="sdp-empty-desc">Soldan bir sınıf seçerek plan listesini açın.</p>
              </div>
            ) : (
              <>
                {selectedPlanIds.length > 0 ? (
                  <div className="sdp-selection-bar">
                    <span>
                      <strong>{selectedPlanIds.length}</strong> ders seçili
                    </span>
                    <Space>
                      <Button size="small" onClick={() => setSelectedPlanIds([])}>
                        Seçimi temizle
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={bulkDeleting}
                        disabled={scheduleLocked}
                        onClick={handleBulkDelete}
                      >
                        Seçilenleri sil
                      </Button>
                    </Space>
                  </div>
                ) : null}

                <div className="sdp-table-tools">
                  <Input
                    allowClear
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Ders veya öğretmen ara…"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    style={{ maxWidth: 280 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {filteredPlans.length} / {plans.length} ders
                    {planSearch ? ' (filtreli)' : ''}
                  </Text>
                </div>

                <Table<ClassLessonPlan>
                  className="sdp-main-table"
                  rowKey="id"
                  loading={plansLoading}
                  columns={columns}
                  dataSource={filteredPlans}
                  pagination={false}
                  scroll={{ x: 780 }}
                  rowSelection={
                    scheduleLocked
                      ? undefined
                      : {
                          selectedRowKeys: selectedPlanIds,
                          onChange: (keys) => setSelectedPlanIds(keys.map(Number)),
                          preserveSelectedRowKeys: true,
                        }
                  }
                  locale={{
                    emptyText: (
                      <div className="sdp-empty">
                        <p className="sdp-empty-title">
                          {planSearch ? 'Sonuç yok' : 'Henüz ders planı yok'}
                        </p>
                        <p className="sdp-empty-desc">
                          {planSearch
                            ? 'Aramayı temizleyip tekrar deneyin.'
                            : selectedClassroom?.alan_ad
                              ? 'Alanın standart derslerini tek tıkla ekleyebilir veya tek tek ders ekleyebilirsiniz.'
                              : '“Ders Ekle” ile katalogdan ders seçin.'}
                        </p>
                        {!planSearch ? emptyActions : null}
                      </div>
                    ),
                  }}
                  size="middle"
                />
              </>
            )}
          </div>
        </section>
      </div>

      <Modal
        title="Ders ekle"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAddDers}
        confirmLoading={adding}
        okText="Ekle"
        okButtonProps={{ disabled: !addDersId }}
        centered
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
          {selectedClassroom?.ad} · {selectedTerm?.name}
        </Text>
        <div className="sdp-form-field">
          <label>Ders</label>
          <Select
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            placeholder={
              addDersOptions.length ? 'Ders seçin' : 'Eklenecek ders kalmadı'
            }
            value={addDersId ?? undefined}
            onChange={setAddDersId}
            options={addDersOptions}
            disabled={!addDersOptions.length}
          />
        </div>
        <div className="sdp-form-field" style={{ marginBottom: 0 }}>
          <label>Haftalık saat</label>
          <InputNumber
            min={1}
            max={40}
            style={{ width: '100%' }}
            value={addHours}
            onChange={(n) => setAddHours(Number(n) || 2)}
          />
        </div>
      </Modal>

      <Modal
        title="Planları başka sınıfa kopyala"
        open={copyOpen}
        onCancel={() => {
          setCopyOpen(false);
          setCopyTargets([]);
        }}
        onOk={handleCopy}
        confirmLoading={copying}
        okText="Kopyala"
        okButtonProps={{ disabled: !copyTargets.length }}
        centered
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
          Kaynak: <strong>{selectedClassroom?.ad}</strong> · {selectedTerm?.name}
        </Text>
        <div className="sdp-form-field">
          <label>Hedef sınıflar</label>
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            placeholder="Sınıf seçin"
            value={copyTargets}
            onChange={setCopyTargets}
            options={(context?.classrooms || [])
              .filter((c) => c.id !== selectedClassroomId)
              .map((c) => ({
                value: c.id,
                label: `${c.ad}${c.alan_ad ? ` · ${c.alan_ad}` : ''}`,
              }))}
          />
        </div>
        <Space direction="vertical" size={8}>
          <Checkbox checked={copyTeachers} onChange={(e) => setCopyTeachers(e.target.checked)}>
            Öğretmenleri de kopyala
          </Checkbox>
          <Checkbox checked={copyOverwrite} onChange={(e) => setCopyOverwrite(e.target.checked)}>
            Mevcut derslerde saatleri / görünen adı üzerine yaz
          </Checkbox>
        </Space>
      </Modal>
    </div>
  );
}
