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
import { Alert, Button, Modal, Select, Typography, message } from 'antd';
import {
  DownloadOutlined,
  LockOutlined,
  ReloadOutlined,
  SendOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { useKurum } from '@/lib/contexts/KurumContext';
import { resolveAkademikBase } from '@/lib/akademik-routes';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  CLASS_LESSON_PLAN_CHANGED_EVENT,
  clearScheduleCell,
  ensureClassroomScheduleGrid,
  fetchAcademicScheduleVersions,
  fetchClassLessonPlanContext,
  fetchClassLessonPlans,
  fetchClassScheduleGrid,
  fetchWorkCalendars,
  fillScheduleCell,
  lockAcademicScheduleVersion,
  swapScheduleCells,
  unlockAcademicScheduleVersion,
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
import {
  Badge,
  Field,
  PageHead,
  PageShell,
  Segmented,
  Toolbar,
  ToolbarActions,
} from '../ui';
import './ders-programi.css';

const { Text } = Typography;

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
  const [plans, setPlans] = useState<ClassLessonPlan[]>([]);

  const [termId, setTermId] = useState<number | null>(urlTermId);
  const [calendarId, setCalendarId] = useState<number | null>(null);
  /** Dönem + çalışma takviminin programı — kullanıcıya gösterilmez, otomatik çözülür. */
  const [program, setProgram] = useState<AcademicScheduleVersion | null>(null);
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
  const visibleClassrooms = useMemo(() => {
    const all = context?.classrooms || [];
    if (!calendarId) return all;
    const assigned = all.filter((c) => (c.weekly_cycle_ids || []).includes(calendarId));
    return assigned.length ? assigned : all;
  }, [calendarId, context?.classrooms]);
  const selectedTerm = useMemo(
    () => context?.terms.find((t) => t.id === termId) || null,
    [context?.terms, termId],
  );

  const versionId = grid?.version?.id ?? program?.id ?? null;
  const readOnly = Boolean(
    program?.is_locked || selectedTerm?.schedule_locked || grid?.version?.is_locked,
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

      const activeCals = cals.filter(calendarIsSchedulable);
      const defaultCalId = (activeCals.find((c) => c.is_default) || activeCals[0])?.id ?? null;
      setTermId((prev) => {
        if (prev && ctx.terms.some((t) => t.id === prev)) return prev;
        return ctx.active_term_id ?? ctx.terms[0]?.id ?? null;
      });
      setCalendarId((prev) => {
        if (prev && activeCals.some((c) => c.id === prev)) return prev;
        return defaultCalId;
      });
      setClassroomId((prev) => {
        if (prev && ctx.classrooms.some((c) => c.id === prev)) return prev;
        const assigned = defaultCalId
          ? ctx.classrooms.filter((c) => (c.weekly_cycle_ids || []).includes(defaultCalId))
          : [];
        const pool = assigned.length ? assigned : ctx.classrooms;
        return pool[0]?.id ?? null;
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

  /**
   * Dönem + çalışma takvimi programını bulur. Kullanıcı program seçmez;
   * program yoksa ızgara hazırlanırken otomatik oluşturulur.
   */
  const loadProgram = useCallback(async () => {
    const templateId = primaryTemplateId(selectedCalendar);
    if (!termId || !templateId || !selectedCalendar) {
      setProgram(null);
      return;
    }
    try {
      const rows = await fetchAcademicScheduleVersions({
        term_id: termId,
        schedule_template_id: templateId,
        weekly_cycle_id: selectedCalendar.id,
      });
      setProgram(rows.find((v) => v.is_active) ?? rows[0] ?? null);
    } catch (e) {
      setProgram(null);
      message.error(e instanceof Error ? e.message : 'Program bilgisi yüklenemedi');
    }
  }, [selectedCalendar, termId]);

  useEffect(() => {
    loadProgram();
  }, [loadProgram]);

  useEffect(() => {
    if (!visibleClassrooms.length) {
      if (classroomId != null) setClassroomId(null);
      return;
    }
    if (classroomId && visibleClassrooms.some((c) => c.id === classroomId)) return;
    setClassroomId(visibleClassrooms[0].id);
  }, [visibleClassrooms, classroomId]);

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
    if (!classroomId || !termId || !calendarId) {
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
    const programLocked = Boolean(program?.is_locked || selectedTerm?.schedule_locked);
    try {
      if (!silent && !programLocked) {
        try {
          // Program yoksa burada oluşur; boş hücre iskeleti de hazırlanır.
          const ensured = await ensureClassroomScheduleGrid({
            classroom_id: classroomId,
            term_id: termId,
            weekly_cycle_id: calendarId,
          });
          if (ensured.schedule_version_id && ensured.schedule_version_id !== program?.id) {
            void loadProgram();
          }
          // Sınıf artık bu takvimde programlı — takvim filtresi onu göstersin
          setContext((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              classrooms: prev.classrooms.map((c) => {
                if (c.id !== classroomId) return c;
                const ids = c.weekly_cycle_ids || [];
                if (ids.includes(calendarId)) return c;
                return { ...c, weekly_cycle_ids: [...ids, calendarId] };
              }),
            };
          });
        } catch {
          // İskelet oluşturma başarısız olsa da mevcut grid'i yüklemeyi dene
          // (örn. program bu arada kilitlendi, hücreler zaten mevcut vb.)
        }
      }
      const data = await fetchClassScheduleGrid({
        classroom_id: classroomId,
        term_id: termId,
        weekly_cycle_id: calendarId,
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
  }, [classroomId, termId, calendarId, program, selectedTerm, loadProgram]);

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

  /**
   * Programı düzenlemeye kapatır/açar. Dönem bazlı kilit "Program
   * Revizyonları" ekranından yönetilir; buradaki sadece hızlı erişim.
   */
  const handleToggleLock = async () => {
    if (!versionId) return;
    try {
      if (readOnly) {
        await unlockAcademicScheduleVersion(versionId);
        message.success('Program düzenlemeye açıldı');
      } else {
        await lockAcademicScheduleVersion(versionId);
        message.success('Program düzenlemeye kapatıldı');
      }
      await loadProgram();
      void loadGrid();
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
    <PageShell>
      <PageHead
        description="Soldaki dersleri hücrelere sürükleyin. Öğretmen bilgisi Sınıf Ders Planları’ndan gelir."
        actions={
          <>
            {context?.active_year ? <Badge tone="info">{context.active_year.yil_str}</Badge> : null}
            {readOnly ? <Badge tone="warning">Salt okunur</Badge> : null}
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
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                boot();
                void loadGrid();
                void loadPlans();
              }}
            >
              Yenile
            </Button>
          </>
        }
      />

      {context?.context_year_mismatch ? (
        <Alert
          type="warning"
          showIcon
          message="Üst menüdeki eğitim yılı, planlamanın aktif yılından farklı"
        />
      ) : null}

      <Toolbar>
        <Field label="Dönem" width={190}>
          <Select
            value={termId ?? undefined}
            onChange={setTermId}
            options={(context?.terms || []).map((t) => ({
              value: t.id,
              label: `${t.name}${t.schedule_locked ? ' (kilitli)' : ''}`,
            }))}
          />
        </Field>
        <Field label="Çalışma Takvimi" width={220}>
          <Select
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
        </Field>
        <Field
          label={
            calendarId && visibleClassrooms.length !== (context?.classrooms.length || 0)
              ? `Sınıf (${visibleClassrooms.length})`
              : 'Sınıf'
          }
          width={180}
        >
          <Select
            value={classroomId ?? undefined}
            onChange={setClassroomId}
            options={visibleClassrooms.map((c) => ({ value: c.id, label: c.ad }))}
            showSearch
            optionFilterProp="label"
          />
        </Field>
        <Field label="Hücre rengi">
          <Segmented
            ariaLabel="Hücre rengi"
            value={colorBy}
            onChange={(v) => {
              setColorBy(v);
              setScheduleColorBy(v);
            }}
            options={[
              { value: 'ders', label: 'Ders' },
              { value: 'ogretmen', label: 'Öğretmen' },
              { value: 'none', label: 'Renksiz' },
            ]}
          />
        </Field>
        <ToolbarActions>
          <Button
            icon={readOnly ? <UnlockOutlined /> : <LockOutlined />}
            disabled={!versionId || selectedTerm?.schedule_locked}
            onClick={handleToggleLock}
            title={
              selectedTerm?.schedule_locked
                ? 'Dönem programı kilitli — kilit dönem ayarlarından açılır'
                : undefined
            }
          >
            {readOnly ? 'Düzenlemeye aç' : 'Düzenlemeyi kapat'}
          </Button>
        </ToolbarActions>
      </Toolbar>

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
              {selectedCalendar ? ` · ${selectedCalendar.name}` : ''}
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
                        : 'Gösterilecek program yok. Dönem, çalışma takvimi ve sınıf seçin.')}
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
        classrooms={visibleClassrooms}
      />

      <ScheduleNotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        termId={termId}
        versionId={versionId}
        currentClassroomId={classroomId}
        classrooms={visibleClassrooms}
      />
    </PageShell>
  );
}
