'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  DownloadOutlined,
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { useKurum } from '@/lib/contexts/KurumContext';
import { resolveAkademikBase } from '@/lib/akademik-routes';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  CLASS_LESSON_PLAN_CHANGED_EVENT,
  activateAcademicScheduleVersion,
  clearScheduleCell,
  createAcademicScheduleVersion,
  ensureVersionClassroomGrid,
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  fetchClassLessonPlans,
  fetchClassScheduleGrid,
  fetchWorkCalendars,
  fillScheduleCell,
  lockAcademicScheduleVersion,
  swapScheduleCells,
  unlockAcademicScheduleVersion,
  updateAcademicScheduleVersion,
  type AcademicScheduleVersion,
  type ClassLessonPlan,
  type ClassLessonPlanChangedDetail,
  type ClassLessonPlanContext,
  type ClassScheduleGrid,
  type ScheduleGridCell,
  type WorkCalendar,
} from '@/lib/academic-api';
import {
  colorForKey,
  getScheduleColorBy,
  setScheduleColorBy,
  type ScheduleColorBy,
} from '@/lib/schedule-color';
import ScheduleExportModal from '@/components/akademik/ders-programi/ScheduleExportModal';
import ScheduleNotifyModal from '@/components/akademik/ders-programi/ScheduleNotifyModal';
import './ders-programi.css';

const { Title, Text } = Typography;

type DragPayload =
  | { kind: 'plan'; planId: number }
  | { kind: 'cell'; cellId: number; planId: number };

/** Yeni takvimlerde şablon gün satırında; cycle.schedule_template çoğu zaman null. */
function calendarIsSchedulable(c: WorkCalendar): boolean {
  return Boolean(
    c.is_active &&
      ((c.total_lesson_count ?? 0) > 0 ||
        c.schedule_template ||
        (c.used_templates?.length ?? 0) > 0),
  );
}

function calendarHasLessonSlots(c: WorkCalendar | null | undefined): boolean {
  return Boolean(c && (c.total_lesson_count ?? 0) > 0);
}

function primaryTemplateId(c: WorkCalendar | null | undefined): number | null {
  if (!c) return null;
  if (c.schedule_template) return c.schedule_template;
  const withLessons = (c.used_templates || []).find((t) => (t.lesson_count ?? 0) > 0);
  return withLessons?.id ?? c.used_templates?.[0]?.id ?? null;
}

function calendarTemplateLabel(c: WorkCalendar): string {
  if (c.template_name) return c.template_name;
  const names = (c.used_templates || []).map((t) => t.name).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return names.join(', ');
  return '';
}

function parseDragPayload(raw: string): DragPayload | null {
  try {
    const data = JSON.parse(raw) as DragPayload;
    if (data?.kind === 'plan' && typeof data.planId === 'number') return data;
    if (
      data?.kind === 'cell' &&
      typeof data.cellId === 'number' &&
      typeof data.planId === 'number'
    ) {
      return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readDragPayload(e: DragEvent): DragPayload | null {
  const json =
    e.dataTransfer.getData('application/json') ||
    e.dataTransfer.getData('text/plain') ||
    '';
  return parseDragPayload(json);
}

function writeDragPayload(e: DragEvent, payload: DragPayload) {
  const raw = JSON.stringify(payload);
  e.dataTransfer.setData('application/json', raw);
  e.dataTransfer.setData('text/plain', raw);
}

export default function DersProgramiClient() {
  const { activeKurum, activeSube, initialized } = useKurum();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const akademikBase = resolveAkademikBase(pathname);
  const DERS_SAATLERI_HREF = `${akademikBase}/tanimlar/ders-saatleri`;

  // Diğer sekmelerden ("Sınıf Ders Planları" vb.) gelen bağlam — ilk yüklemede sınıf/dönem önceçilenir.
  const urlClassroomId = Number(searchParams.get('classroom_id') || 0) || null;
  const urlTermId = Number(searchParams.get('term_id') || 0) || null;

  const [context, setContext] = useState<ClassLessonPlanContext | null>(null);
  const [calendars, setCalendars] = useState<WorkCalendar[]>([]);
  const [versions, setVersions] = useState<AcademicScheduleVersion[]>([]);
  const [plans, setPlans] = useState<ClassLessonPlan[]>([]);

  const [termId, setTermId] = useState<number | null>(urlTermId);
  const [calendarId, setCalendarId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [classroomId, setClassroomId] = useState<number | null>(urlClassroomId);

  const sinifDersPlanlariParams = new URLSearchParams();
  if (classroomId) sinifDersPlanlariParams.set('classroom_id', String(classroomId));
  if (termId) sinifDersPlanlariParams.set('term_id', String(termId));
  const SINIF_DERS_PLANLARI_HREF = `${akademikBase}/planlama/sinif-ders-planlari${
    sinifDersPlanlariParams.toString() ? `?${sinifDersPlanlariParams.toString()}` : ''
  }`;

  const [grid, setGrid] = useState<ClassScheduleGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [poolDropActive, setPoolDropActive] = useState(false);
  const [colorBy, setColorBy] = useState<ScheduleColorBy>('ders');
  const [exportOpen, setExportOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [versionNameDraft, setVersionNameDraft] = useState('');
  const [versionNameModal, setVersionNameModal] = useState<'create' | 'rename' | null>(null);
  const [versionNameSaving, setVersionNameSaving] = useState(false);

  const dragRef = useRef<DragPayload | null>(null);
  /** Sürükleme sonrası sahte click ile temizleme modalını engelle */
  const suppressClickRef = useRef(false);
  const scrollYRef = useRef(0);

  useEffect(() => {
    setColorBy(getScheduleColorBy());
    message.config({ top: 24, duration: 3, maxCount: 3 });
  }, []);

  const plansById = useMemo(() => {
    const map = new Map<number, ClassLessonPlan>();
    plans.forEach((p) => map.set(p.id, p));
    return map;
  }, [plans]);

  const selectedCalendar = useMemo(
    () => calendars.find((c) => c.id === calendarId) || null,
    [calendarId, calendars],
  );
  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === versionId) || null,
    [versionId, versions],
  );
  const selectedTerm = useMemo(
    () => context?.terms.find((t) => t.id === termId) || null,
    [context?.terms, termId],
  );

  const readOnly = Boolean(
    selectedVersion?.is_locked || selectedTerm?.schedule_locked || grid?.version?.is_locked,
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, ScheduleGridCell>();
    (grid?.cells || []).forEach((c) => {
      map.set(`${c.day_id}:${c.timeslot_id}`, c);
    });
    return map;
  }, [grid?.cells]);

  const placedByPlan = useMemo(() => {
    const counts = new Map<number, number>();
    (grid?.cells || []).forEach((c) => {
      if (c.status === 'FILLED' && c.class_lesson_plan_id) {
        counts.set(c.class_lesson_plan_id, (counts.get(c.class_lesson_plan_id) || 0) + 1);
      }
    });
    return counts;
  }, [grid?.cells]);

  const boot = useCallback(async () => {
    if (!initialized || !activeKurum || !activeSube) return;
    setBootLoading(true);
    try {
      const [ctx, cals] = await Promise.all([
        fetchClassLessonPlanContext(),
        fetchWorkCalendars(),
      ]);
      setContext(ctx);
      setCalendars(cals.filter(calendarIsSchedulable));

      setTermId((prev) => {
        if (prev && ctx.terms.some((t) => t.id === prev)) return prev;
        return ctx.active_term_id ?? ctx.terms[0]?.id ?? null;
      });
      setClassroomId((prev) => {
        if (prev && ctx.classrooms.some((c) => c.id === prev)) return prev;
        return ctx.classrooms[0]?.id ?? null;
      });
      setCalendarId((prev) => {
        const active = cals.filter(calendarIsSchedulable);
        if (prev && active.some((c) => c.id === prev)) return prev;
        const def = active.find((c) => c.is_default) || active[0];
        return def?.id ?? null;
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Bağlam yüklenemedi');
    } finally {
      setBootLoading(false);
    }
  }, [activeKurum, activeSube, initialized]);

  useEffect(() => {
    boot();
  }, [boot]);

  const loadVersions = useCallback(async () => {
    const templateId = primaryTemplateId(selectedCalendar);
    if (!termId || !templateId || !selectedCalendar) {
      setVersions([]);
      setVersionId(null);
      return;
    }
    try {
      const rows = await fetchAcademicScheduleVersions({
        term_id: termId,
        schedule_template_id: templateId,
        weekly_cycle_id: selectedCalendar.id,
      });
      setVersions(rows);
      setVersionId((prev) => {
        if (prev && rows.some((v) => v.id === prev)) return prev;
        const active = rows.find((v) => v.is_active);
        return active?.id ?? rows[0]?.id ?? null;
      });
    } catch (e) {
      setVersions([]);
      setVersionId(null);
      message.error(e instanceof Error ? e.message : 'Versiyonlar yüklenemedi');
    }
  }, [selectedCalendar, termId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const loadPlans = useCallback(async () => {
    if (!classroomId || !termId) {
      setPlans([]);
      return;
    }
    try {
      const rows = await fetchClassLessonPlans({
        classroom_id: classroomId,
        term_id: termId,
      });
      setPlans(rows);
    } catch {
      setPlans([]);
    }
  }, [classroomId, termId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const loadGrid = useCallback(async (opts?: { silent?: boolean }) => {
    if (!classroomId || !termId || !versionId) {
      setGrid(null);
      setGridError(null);
      return;
    }
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    setGridError(null);
    if (silent && typeof window !== 'undefined') {
      scrollYRef.current = window.scrollY;
    }
    const versionLocked = Boolean(selectedVersion?.is_locked || selectedTerm?.schedule_locked);
    try {
      if (!silent && !versionLocked) {
        try {
          await ensureVersionClassroomGrid(versionId, classroomId);
        } catch {
          // İskelet oluşturma başarısız olsa da mevcut grid'i yüklemeyi dene
          // (örn. versiyon bu arada kilitlendi, hücreler zaten mevcut vb.)
        }
      }
      const data = await fetchClassScheduleGrid({
        classroom_id: classroomId,
        term_id: termId,
        version_id: versionId,
      });
      setGrid(data);
      if (data.empty_message) setGridError(data.empty_message);
    } catch (e) {
      setGrid(null);
      const msg = e instanceof Error ? e.message : 'Program yüklenemedi';
      setGridError(msg);
      message.error(msg);
    } finally {
      if (!silent) setLoading(false);
      if (silent && typeof window !== 'undefined') {
        const y = scrollYRef.current;
        requestAnimationFrame(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }));
      }
    }
  }, [classroomId, termId, versionId, selectedVersion, selectedTerm]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  // SDP'de öğretmen / görünen ad değişince grid + havuzu sessiz yenile
  useEffect(() => {
    const refreshFromPlan = () => {
      void loadPlans();
      void loadGrid({ silent: true });
    };
    const onPlanChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<ClassLessonPlanChangedDetail>).detail;
      if (
        detail?.classroomId != null &&
        classroomId != null &&
        detail.classroomId !== classroomId
      ) {
        return;
      }
      if (detail?.termId != null && termId != null && detail.termId !== termId) {
        return;
      }
      refreshFromPlan();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshFromPlan();
    };
    window.addEventListener(CLASS_LESSON_PLAN_CHANGED_EVENT, onPlanChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(CLASS_LESSON_PLAN_CHANGED_EVENT, onPlanChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [classroomId, loadGrid, loadPlans, termId]);

  const openCreateVersion = () => {
    const templateId = primaryTemplateId(selectedCalendar);
    if (!termId || !templateId || !selectedCalendar) {
      message.warning('Dönem ve çalışma takvimi seçin');
      return;
    }
    setVersionNameDraft(`Taslak ${new Date().toLocaleDateString('tr-TR')}`);
    setVersionNameModal('create');
  };

  const openRenameVersion = () => {
    if (!versionId || !selectedVersion) return;
    if (selectedVersion.is_locked) {
      message.warning('Kilitli versiyonun adı değiştirilemez. Önce kilidi açın.');
      return;
    }
    setVersionNameDraft(selectedVersion.name);
    setVersionNameModal('rename');
  };

  const submitVersionNameModal = async () => {
    const name = versionNameDraft.trim();
    if (!name) {
      message.warning('Versiyon adı girin');
      return;
    }
    if (versionNameModal === 'create') {
      const templateId = primaryTemplateId(selectedCalendar);
      if (!termId || !templateId || !selectedCalendar) return;
      setVersionNameSaving(true);
      try {
        const v = await createAcademicScheduleVersion({
          name,
          term_id: termId,
          schedule_template_id: templateId,
          weekly_cycle_id: selectedCalendar.id,
        });
        message.success('Versiyon oluşturuldu');
        setVersionNameModal(null);
        await loadVersions();
        setVersionId(v.id);
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Versiyon oluşturulamadı');
      } finally {
        setVersionNameSaving(false);
      }
      return;
    }
    if (versionNameModal === 'rename' && versionId) {
      setVersionNameSaving(true);
      try {
        await updateAcademicScheduleVersion(versionId, { name });
        message.success('Versiyon adı güncellendi');
        setVersionNameModal(null);
        await loadVersions();
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Ad güncellenemedi');
      } finally {
        setVersionNameSaving(false);
      }
    }
  };

  const handleActivate = async () => {
    if (!versionId) return;
    try {
      await activateAcademicScheduleVersion(versionId);
      message.success('Versiyon aktif yapıldı');
      loadVersions();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Aktifleştirme başarısız');
    }
  };

  const handleToggleLock = async () => {
    if (!versionId || !selectedVersion) return;
    try {
      if (selectedVersion.is_locked) {
        await unlockAcademicScheduleVersion(versionId);
        message.success('Kilit açıldı');
      } else {
        await lockAcademicScheduleVersion(versionId);
        message.success('Versiyon kilitlendi');
      }
      loadVersions();
      loadGrid();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'İşlem başarısız');
    }
  };

  const placeOnCell = useCallback(
    async (target: ScheduleGridCell, planId: number, sourceCellId?: number) => {
      if (readOnly || saving) return;
      if (sourceCellId && sourceCellId === target.id) return;

      // Güncel hücreyi grid’den al (stale closure / eksik plan id önlemi)
      const liveTarget =
        (grid?.cells || []).find((c) => c.id === target.id) || target;
      const liveSource = sourceCellId
        ? (grid?.cells || []).find((c) => c.id === sourceCellId)
        : null;

      const plan = plans.find((p) => p.id === planId);
      if (!plan) {
        message.error('Ders planı bulunamadı');
        return;
      }
      if (!plan.ogretmen) {
        message.warning('Bu ders için Sınıf Ders Planları’nda öğretmen seçin.');
        return;
      }

      const targetPlanId =
        liveTarget.status === 'FILLED' && liveTarget.class_lesson_plan_id
          ? liveTarget.class_lesson_plan_id
          : null;
      const sourceIsFilled =
        Boolean(liveSource) &&
        liveSource!.status === 'FILLED' &&
        Boolean(liveSource!.class_lesson_plan_id);

      // İki dolu hücre arasında sürükleme → atomik yer değiştir
      if (sourceCellId && sourceIsFilled && targetPlanId && targetPlanId !== planId) {
        setSaving(true);
        try {
          await swapScheduleCells(sourceCellId, liveTarget.id);
          message.success('Dersler yer değiştirdi');
          await loadGrid({ silent: true });
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Yer değiştirme başarısız');
          await loadGrid({ silent: true });
        } finally {
          setSaving(false);
        }
        return;
      }

      // Taşımada kaynak hücre boşalacağı için limit kontrolü gevşek; yeni yerleştirmede sıkı
      const placed = placedByPlan.get(planId) || 0;
      const releasing =
        sourceCellId &&
        (grid?.cells || []).some(
          (c) => c.id === sourceCellId && c.class_lesson_plan_id === planId,
        )
          ? 1
          : 0;
      const replacingSamePlan =
        liveTarget.status === 'FILLED' && liveTarget.class_lesson_plan_id === planId ? 1 : 0;
      const nextCount = placed - releasing - replacingSamePlan + 1;
      if (nextCount > plan.weekly_hours) {
        message.warning(
          `"${plan.ders_ad}" için haftalık ${plan.weekly_hours} saat tamamlandı; fazla ders eklenemez.`,
        );
        return;
      }

      const doPlace = async () => {
        setSaving(true);
        try {
          if (sourceCellId) {
            await clearScheduleCell(sourceCellId);
          }
          try {
            await fillScheduleCell(liveTarget.id, { class_lesson_plan_id: planId });
          } catch (fillErr) {
            if (sourceCellId) {
              try {
                await fillScheduleCell(sourceCellId, { class_lesson_plan_id: planId });
              } catch {
                /* geri alma başarısız — kullanıcı yenilesin */
              }
            }
            throw fillErr;
          }
          message.success(sourceCellId ? 'Ders taşındı' : 'Ders yerleştirildi');
          await loadGrid({ silent: true });
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Yerleştirme başarısız');
          await loadGrid({ silent: true });
        } finally {
          setSaving(false);
        }
      };

      // Havuzdan dolu hücreye → üzerine yaz onayı
      if (
        !sourceCellId &&
        liveTarget.status === 'FILLED' &&
        liveTarget.class_lesson_plan_id !== planId
      ) {
        Modal.confirm({
          title: 'Hücrenin üzerine yazılsın mı?',
          content: liveTarget.lesson?.name
            ? `"${liveTarget.lesson.name}" kaldırılıp yeni ders konulacak.`
            : 'Mevcut ders kaldırılıp yenisi konulacak.',
          okText: 'Üzerine yaz',
          okButtonProps: { danger: true },
          centered: false,
          onOk: doPlace,
        });
        return;
      }

      await doPlace();
    },
    [grid?.cells, loadGrid, placedByPlan, plans, readOnly, saving],
  );

  const confirmClearCell = useCallback(
    (cell: ScheduleGridCell) => {
      if (readOnly || cell.status !== 'FILLED') return;
      Modal.confirm({
        title: 'Hücre temizlensin mi?',
        content: cell.lesson?.name || 'Dolu hücre boşaltılacak.',
        okText: 'Temizle',
        okButtonProps: { danger: true },
        centered: false,
        onOk: async () => {
          try {
            await clearScheduleCell(cell.id);
            message.success('Hücre temizlendi');
            await loadGrid({ silent: true });
          } catch (e) {
            message.error(e instanceof Error ? e.message : 'Temizleme başarısız');
            throw e;
          }
        },
      });
    },
    [loadGrid, readOnly],
  );

  const onPlanDragStart = (e: DragEvent, planId: number) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    const plan = plans.find((p) => p.id === planId);
    const placed = placedByPlan.get(planId) || 0;
    if (plan && placed >= plan.weekly_hours) {
      e.preventDefault();
      message.warning(
        `"${plan.ders_ad}" için haftalık ${plan.weekly_hours} saat tamamlandı; fazla ders eklenemez.`,
      );
      return;
    }
    const payload: DragPayload = { kind: 'plan', planId };
    dragRef.current = payload;
    writeDragPayload(e, payload);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const onCellDragStart = (e: DragEvent, cell: ScheduleGridCell) => {
    if (readOnly || cell.status !== 'FILLED' || !cell.class_lesson_plan_id) {
      e.preventDefault();
      return;
    }
    const payload: DragPayload = {
      kind: 'cell',
      cellId: cell.id,
      planId: cell.class_lesson_plan_id,
    };
    dragRef.current = payload;
    suppressClickRef.current = true;
    writeDragPayload(e, payload);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

  const onDragEnd = () => {
    // drop’tan sonra dragend; payload’ı hemen silme (bazı tarayıcılarda sıra değişir)
    window.setTimeout(() => {
      dragRef.current = null;
    }, 0);
    setDropTargetKey(null);
    setPoolDropActive(false);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 120);
  };

  const onCellDragOver = (e: DragEvent, key: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragRef.current?.kind === 'cell' ? 'move' : 'copy';
    setDropTargetKey(key);
    setPoolDropActive(false);
  };

  const onCellDrop = async (e: DragEvent, cell: ScheduleGridCell) => {
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = true;
    setDropTargetKey(null);
    setPoolDropActive(false);
    if (readOnly) return;
    const payload = readDragPayload(e) || dragRef.current;
    dragRef.current = null;
    if (!payload) return;

    if (payload.kind === 'plan') {
      await placeOnCell(cell, payload.planId);
      return;
    }
    await placeOnCell(cell, payload.planId, payload.cellId);
  };

  const onPoolDragOver = (e: DragEvent) => {
    if (readOnly || dragRef.current?.kind !== 'cell') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setPoolDropActive(true);
    setDropTargetKey(null);
  };

  const onPoolDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setPoolDropActive(false);
  };

  const onPoolDrop = async (e: DragEvent) => {
    e.preventDefault();
    setPoolDropActive(false);
    if (readOnly || saving) return;
    const payload = readDragPayload(e) || dragRef.current;
    dragRef.current = null;
    if (!payload || payload.kind !== 'cell') return;

    setSaving(true);
    try {
      await clearScheduleCell(payload.cellId);
      message.success('Hücre temizlendi — ders havuza döndü');
      await loadGrid({ silent: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Temizleme başarısız');
      await loadGrid({ silent: true });
    } finally {
      setSaving(false);
    }
  };

  if (!initialized) return <div className="dp-empty">Bağlam yükleniyor…</div>;

  if (!activeKurum || !activeSube) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Kurum ve şube seçimi gerekli"
        description="Ders programı şube bazlıdır. Üst menüden kurum ve şube seçin."
      />
    );
  }

  const hasGrid = Boolean(grid?.days?.length && grid?.slots?.length);

  return (
    <div className="dp-page">
      <div className="dp-toolbar">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Ders Programı
          </Title>
          <Text type="secondary">
            Soldaki dersleri hücrelere sürükleyin. Öğretmen Sınıf Ders Planları’ndan gelir.
          </Text>
        </div>
        <Space wrap size={8}>
          {context?.active_year ? (
            <Tag color="geekblue">{context.active_year.yil_str}</Tag>
          ) : null}
          {selectedVersion?.is_active ? <Tag color="green">Aktif</Tag> : null}
          {readOnly ? <Tag color="orange">Salt okunur</Tag> : null}
          <Button
            icon={<DownloadOutlined />}
            disabled={!termId || !versionId}
            onClick={() => setExportOpen(true)}
          >
            Dışa Aktar
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            disabled={!termId || !versionId}
            onClick={() => setNotifyOpen(true)}
          >
            Programı Bildir
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => { boot(); void loadGrid(); void loadPlans(); }}>
            Yenile
          </Button>
        </Space>
      </div>

      {context?.context_year_mismatch ? (
        <Alert
          type="warning"
          showIcon
          message="Üst menüdeki eğitim yılı, planlamanın aktif yılından farklı"
        />
      ) : null}

      <div className="dp-card">
        <div className="dp-card-body">
          <div className="dp-filters">
            <div className="dp-filter-item">
              <label>Dönem</label>
              <Select
                style={{ minWidth: 180 }}
                value={termId ?? undefined}
                onChange={setTermId}
                options={(context?.terms || []).map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.schedule_locked ? ' (kilitli)' : ''}`,
                }))}
              />
            </div>
            <div className="dp-filter-item">
              <label>Çalışma takvimi</label>
              <Select
                style={{ minWidth: 200 }}
                value={calendarId ?? undefined}
                onChange={setCalendarId}
                options={calendars.map((c) => {
                  const tpl = calendarTemplateLabel(c);
                  const noSlots = (c.total_lesson_count ?? 0) < 1;
                  return {
                    value: c.id,
                    label: `${c.name}${tpl ? ` · ${tpl}` : ''}${noSlots ? ' (saat yok)' : ''}`,
                  };
                })}
                placeholder="Takvim seçin"
              />
            </div>
            <div className="dp-filter-item">
              <label>Sınıf</label>
              <Select
                style={{ minWidth: 160 }}
                value={classroomId ?? undefined}
                onChange={setClassroomId}
                options={(context?.classrooms || []).map((c) => ({
                  value: c.id,
                  label: c.ad,
                }))}
                showSearch
                optionFilterProp="label"
              />
            </div>
            <div className="dp-filter-item dp-filter-item--wide">
              <label title="★ = bu dönem için aktif program">Versiyon</label>
              <Space.Compact>
                <Select
                  style={{ minWidth: 200 }}
                  value={versionId ?? undefined}
                  onChange={setVersionId}
                  options={versions.map((v) => ({
                    value: v.id,
                    label: `${v.name}${v.is_active ? ' ★' : ''}${v.is_locked ? ' 🔒' : ''}`,
                  }))}
                  placeholder="Versiyon"
                  notFoundContent="Versiyon yok"
                />
                <Button
                  icon={<EditOutlined />}
                  onClick={openRenameVersion}
                  disabled={!versionId || selectedVersion?.is_locked}
                  title="Yeniden adlandır"
                />
                <Button icon={<PlusOutlined />} onClick={openCreateVersion} title="Yeni taslak versiyon">
                  Yeni
                </Button>
              </Space.Compact>
            </div>
            <div className="dp-filter-item">
              <label>İşlem</label>
              <Space.Compact>
                <Button
                  disabled={!versionId || selectedVersion?.is_active}
                  onClick={handleActivate}
                  title="Seçili versiyonu bu dönem için aktif yap"
                >
                  Aktif Yap
                </Button>
                <Button
                  icon={selectedVersion?.is_locked ? <UnlockOutlined /> : <LockOutlined />}
                  disabled={!versionId}
                  onClick={handleToggleLock}
                >
                  {selectedVersion?.is_locked ? 'Kilidi Aç' : 'Kilitle'}
                </Button>
              </Space.Compact>
            </div>
            <div className="dp-filter-item">
              <label>Hücre rengi</label>
              <div className="dp-color-toggle" role="group" aria-label="Hücre rengi">
                {(
                  [
                    { value: 'ders', label: 'Ders' },
                    { value: 'ogretmen', label: 'Öğretmen' },
                    { value: 'none', label: 'Renksiz' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`dp-color-toggle-btn${colorBy === opt.value ? ' is-active' : ''}`}
                    onClick={() => {
                      setColorBy(opt.value);
                      setScheduleColorBy(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedCalendar && !calendarHasLessonSlots(selectedCalendar) ? (
        <Alert
          type="warning"
          showIcon
          message="Seçili takvimin ders saati şablonunda saat yok"
          description={
            <span>
              Çalışma takviminiz <strong>{calendarTemplateLabel(selectedCalendar) || 'bir şablona'}</strong>{' '}
              bağlı ama içinde 1. Ders / 2. Ders gibi LESSON saatleri tanımlı değil.{' '}
              <Link href={DERS_SAATLERI_HREF}>Ders Saatleri</Link> sayfasından bu şablonu açıp{' '}
              <strong>Otomatik Oluştur → Oluştur</strong> ile saat ekleyin; sonra buraya dönüp Yenile’ye basın.
            </span>
          }
        />
      ) : gridError ? (
        <Alert
          type="warning"
          showIcon
          message="Program grid’i oluşturulamadı"
          description={
            <span>
              {gridError}{' '}
              {gridError.toLowerCase().includes('ders saati') ? (
                <Link href={DERS_SAATLERI_HREF}>Ders Saatleri’ne git</Link>
              ) : null}
            </span>
          }
        />
      ) : !selectedCalendar ? (
        <Alert
          type="info"
          showIcon
          message="Çalışma takvimi gerekli"
          description="Önce Tanımlar → Çalışma Takvimi’nde aktif günlere ders saati şablonu tanımlı bir takvim oluşturun."
        />
      ) : !versionId ? (
        <Alert
          type="info"
          showIcon
          message="Program versiyonu yok"
          description="“Yeni” ile taslak versiyon oluşturun."
        />
      ) : plans.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="Bu sınıf/dönem için ders planı yok"
          description={
            <span>
              Önce <Link href={SINIF_DERS_PLANLARI_HREF}>Sınıf Ders Planları</Link>’ndan ders ve
              öğretmen ekleyin; ardından buraya sürükleyin.
            </span>
          }
        />
      ) : null}

      <div className="dp-workspace">
        <aside
          className={`dp-pool${poolDropActive ? ' is-drop-target' : ''}`}
          onDragOver={onPoolDragOver}
          onDragLeave={onPoolDragLeave}
          onDrop={onPoolDrop}
        >
          <div className="dp-pool-head">
            <Text strong>Dersler</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {readOnly
                ? 'Kilitli'
                : poolDropActive
                  ? 'Bırak = çıkar'
                  : 'Sürükle → hücre'}
            </Text>
          </div>
          {poolDropActive ? (
            <div className="dp-pool-drop-hint">Buraya bırakarak hücreyi boşaltın</div>
          ) : null}
          <div className="dp-pool-body">
            {bootLoading && plans.length === 0 ? (
              <div className="dp-empty" style={{ padding: 24 }}>Yükleniyor…</div>
            ) : plans.length === 0 ? (
              <div className="dp-empty" style={{ padding: 24 }}>
                Plan yok
              </div>
            ) : (
              plans.map((plan) => {
                const placed = placedByPlan.get(plan.id) || 0;
                const full = placed >= plan.weekly_hours;
                const colorId =
                  colorBy === 'none'
                    ? null
                    : colorBy === 'ogretmen'
                      ? plan.ogretmen
                      : plan.ders;
                const color = colorBy === 'none' ? null : colorForKey(colorId);
                return (
                  <div
                    key={plan.id}
                    className={`dp-plan-chip${full ? ' is-full' : ''}${!plan.ogretmen ? ' is-no-teacher' : ''}`}
                    style={
                      color && plan.ogretmen
                        ? {
                            background: color.bg,
                            borderColor: color.border,
                            color: color.text,
                          }
                        : undefined
                    }
                    draggable={!readOnly && Boolean(plan.ogretmen) && !saving && !full}
                    onDragStart={(e) => onPlanDragStart(e, plan.id)}
                    onDragEnd={onDragEnd}
                    title={
                      !plan.ogretmen
                        ? 'Önce Sınıf Ders Planları’nda öğretmen seçin'
                        : full
                          ? 'Haftalık saat tamamlandı'
                          : 'Hücreye sürükleyin'
                    }
                  >
                    <div className="dp-plan-chip-title" style={color && plan.ogretmen ? { color: color.text } : undefined}>
                      {plan.ders_gorunen_ad || plan.ders_ad}
                    </div>
                    <div className="dp-plan-chip-meta">
                      {plan.ogretmen_ad || 'Öğretmensiz'}
                    </div>
                    <div className="dp-plan-chip-hours">
                      {placed} / {plan.weekly_hours} saat
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <div className="dp-card dp-grid-card">
          <div className="dp-card-head">
            <Text strong>
              {(context?.classrooms.find((c) => c.id === classroomId)?.ad) || 'Sınıf'}
              {selectedVersion ? ` · ${selectedVersion.name}` : ''}
            </Text>
            <Text type="secondary">
              {grid
                ? `${grid.cells.filter((c) => c.status === 'FILLED').length} / ${grid.cells.length} dolu`
                : bootLoading || loading
                  ? 'Yükleniyor…'
                  : '—'}
              {saving ? ' · kaydediliyor…' : ''}
            </Text>
          </div>
          <div className="dp-card-body">
            {!hasGrid ? (
              <div className="dp-empty">
                {loading
                  ? 'Grid yükleniyor…'
                  : grid?.empty_message
                    || (!grid?.days?.length
                      ? 'Çalışma takviminde aktif gün yok. Tanımlar → Çalışma Takvimi’nden günleri aktifleştirip ders saati şablonu seçin.'
                      : !grid?.slots?.length
                        ? 'Ders saati şablonunda saat yok. Tanımlar → Ders Saatleri’nden bu şablona ders saatleri ekleyin veya üretin.'
                        : 'Gösterilecek program yok. Dönem, takvim, sınıf ve versiyon seçin.')}
              </div>
            ) : (
              <table className="dp-grid-table">
                <thead>
                  <tr>
                    <th>Saat</th>
                    {grid!.days.map((d) => (
                      <th key={d.id}>{d.short_name || d.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid!.slots.map((slot) => (
                    <tr key={slot.id}>
                      <td className="dp-slot-label">
                        <strong>{slot.name}</strong>
                        <small>
                          {[slot.start, slot.end].filter(Boolean).join(' – ')}
                        </small>
                      </td>
                      {grid!.days.map((day) => {
                        const key = `${day.id}:${slot.id}`;
                        const cell = cellMap.get(key);
                        if (!cell) {
                          return (
                            <td key={key}>
                              <div className="dp-cell is-empty">—</div>
                            </td>
                          );
                        }
                        const filled = cell.status === 'FILLED';
                        const isDropTarget = dropTargetKey === key;
                        const livePlan = cell.class_lesson_plan_id
                          ? plansById.get(cell.class_lesson_plan_id)
                          : undefined;
                        const lessonName =
                          livePlan?.ders_gorunen_ad ||
                          livePlan?.ders_ad ||
                          cell.lesson?.name ||
                          'Ders';
                        const lessonFull =
                          livePlan?.ders_ad || cell.lesson?.full_name || cell.lesson?.name;
                        const teacherLabel =
                          livePlan?.ogretmen_ad ||
                          cell.teacher?.short_name ||
                          cell.teacher?.name ||
                          'Öğretmensiz';
                        const cellColorId =
                          colorBy === 'none'
                            ? null
                            : colorBy === 'ogretmen'
                              ? livePlan?.ogretmen ?? cell.teacher?.id
                              : livePlan?.ders ?? cell.lesson?.id;
                        const cellColor =
                          filled && colorBy !== 'none' ? colorForKey(cellColorId) : null;
                        return (
                          <td key={cell.id}>
                            <div
                              className={[
                                'dp-cell',
                                filled ? 'is-filled' : 'is-empty',
                                isDropTarget ? 'is-drop-target' : '',
                                !readOnly ? 'is-droppable' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              style={
                                cellColor
                                  ? {
                                      background: cellColor.bg,
                                      borderColor: cellColor.border,
                                    }
                                  : undefined
                              }
                              draggable={!readOnly && filled && Boolean(cell.class_lesson_plan_id)}
                              onDragStart={(e) => onCellDragStart(e, cell)}
                              onDragEnd={onDragEnd}
                              onDragOver={(e) => onCellDragOver(e, key)}
                              onDragLeave={() => {
                                setDropTargetKey((prev) => (prev === key ? null : prev));
                              }}
                              onDrop={(e) => onCellDrop(e, cell)}
                              onClick={() => {
                                if (suppressClickRef.current) return;
                                if (filled) confirmClearCell(cell);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (filled) confirmClearCell(cell);
                                }
                              }}
                            >
                              {filled ? (
                                <>
                                  <div
                                    className="dp-cell-lesson"
                                    style={cellColor ? { color: cellColor.text } : undefined}
                                    title={
                                      lessonFull && lessonFull !== lessonName
                                        ? lessonFull
                                        : undefined
                                    }
                                  >
                                    {lessonName}
                                  </div>
                                  <div className="dp-cell-teacher">{teacherLabel}</div>
                                  {!readOnly ? (
                                    <div className="dp-cell-hint">Sürükle · bırakarak yer değiştir</div>
                                  ) : null}
                                </>
                              ) : (
                                <span className="dp-cell-drop-label">
                                  {readOnly ? 'Boş' : 'Buraya bırak'}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ScheduleExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        termId={termId}
        versionId={versionId}
        currentClassroomId={classroomId}
        classrooms={context?.classrooms || []}
      />

      <ScheduleNotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        termId={termId}
        versionId={versionId}
        currentClassroomId={classroomId}
        classrooms={context?.classrooms || []}
      />

      <Modal
        title={versionNameModal === 'rename' ? 'Versiyonu yeniden adlandır' : 'Yeni program versiyonu'}
        open={versionNameModal != null}
        onCancel={() => setVersionNameModal(null)}
        onOk={submitVersionNameModal}
        confirmLoading={versionNameSaving}
        okText={versionNameModal === 'rename' ? 'Kaydet' : 'Oluştur'}
        centered
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Versiyon, aynı dönem için programın bir kopyasıdır (taslak / yedek / final).
          ★ işaretli olan aktif kullanılan programdır.
        </Text>
        <Input
          autoFocus
          value={versionNameDraft}
          onChange={(e) => setVersionNameDraft(e.target.value)}
          onPressEnter={() => void submitVersionNameModal()}
          placeholder="Örn: Yaz Kursu Programı"
          maxLength={120}
        />
      </Modal>
    </div>
  );
}
