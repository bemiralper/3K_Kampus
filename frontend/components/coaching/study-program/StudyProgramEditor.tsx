'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  type WeeklyProgram,
  type WeeklyProgramListItem,
  type HomeworkPoolItem,
  type ProgramBlock,
  type BlockType,
  fetchPrograms,
  fetchProgram,
  createProgram,
  updateProgram,
  autoDistribute,
  fetchHomeworkPool,
  createBlock,
  updateBlock,
  deleteBlock,
  toggleBlockComplete,
  reorderBlocks,
  moveBlock,
  deleteProgram,
  splitBlockToDays,
  splitHomeworkToDays,
  updateDay,
  resetProgram,
  WEEKDAY_LABELS,
} from '@/lib/study-program-api';
import { fetchCoaches, fetchCoachStudents, type Coach, type CoachStudent } from '@/lib/coaching-api';

import HomeworkPoolCard from '@/components/admin/coaching/study-program/HomeworkPoolCard';
import DayColumn from '@/components/admin/coaching/study-program/DayColumn';
import SplitModal from '@/components/admin/coaching/study-program/SplitModal';
import BlockEditModal from '@/components/admin/coaching/study-program/BlockEditModal';
import StudyProgramPrintPreview from '@/components/admin/coaching/study-program/StudyProgramPrintPreview';
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';
import { lessonAccent, primaryBlockLabel } from '@/components/admin/coaching/study-program/blockDisplay';
import { stripCompletionTitleSuffix } from '@/components/odev/odevCompletionHelpers';
import {
  datesFromHomework,
  formatDateLocal as formatDate,
  homeworkOverlapsWeek,
  inclusiveDayCount,
  isControlDay,
  isSevenDayRange,
  rangeFromEnd,
  rangeFromStart,
  studyRangeEnd,
  toDateInputValue,
} from '@/components/coaching/study-program/programDateUtils';
import { getStudyDrag, setStudyDrag } from '@/components/coaching/study-program/studyProgramDrag';
import '@/components/coaching/study-program/study-program.css';

export interface StudyProgramEditorProps {
  lockedStudentId?: number;
  lockedCoachId?: number;
  /** Öğrenci kilitliyken doğrudan bu programı aç */
  initialProgramId?: number;
  /** Ödevden gelen program aralığı (YYYY-MM-DD) */
  initialWeekStart?: string;
  initialWeekEnd?: string;
  /** Tarih kaynağı ödev id — havuzda vurgulanır */
  initialHomeworkId?: number;
  embedded?: boolean;
  /** Koç portalı layout (geniş shell + responsive board) */
  coachLayout?: boolean;
  /** Koç çalışma alanı listesine dön */
  onExit?: () => void;
}

export { datesFromHomework } from '@/components/coaching/study-program/programDateUtils';

/* ═══════════════════════════════════════════════════════
   YARDIMCI FONKSİYONLAR
   ═══════════════════════════════════════════════════════ */

function formatDateTR(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShortTR(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/** Programın süresi dolmuş mu? (week_end < bugün) */
function isProgramExpired(prog: { week_end: string }): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(prog.week_end + 'T23:59:59');
  return end < today;
}

/* ═══════════════════════════════════════════════════════
   ANA BİLEŞEN
   ═══════════════════════════════════════════════════════ */

export default function StudyProgramEditor({
  lockedStudentId,
  lockedCoachId,
  initialProgramId,
  initialWeekStart,
  initialWeekEnd,
  initialHomeworkId,
  embedded = false,
  coachLayout = false,
  onExit,
}: StudyProgramEditorProps) {
  const isCoachUi = embedded || coachLayout;
  /* ─── State ─── */
  // Koç & öğrenci seçimi
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<number | null>(null);
  const [students, setStudents] = useState<CoachStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);

  // Program
  const [program, setProgram] = useState<WeeklyProgram | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Öğrenci için mevcut programlar (öğrenci seçildiğinde yüklenir)
  const [studentPrograms, setStudentPrograms] = useState<WeeklyProgramListItem[]>([]);
  const [studentProgramsLoading, setStudentProgramsLoading] = useState(false);
  const [showCompletedPrograms, setShowCompletedPrograms] = useState(false);

  // Yeni program oluşturma alanları
  const [newWeekStart, setNewWeekStart] = useState('');
  const [newWeekEnd, setNewWeekEnd] = useState('');
  const [dateSourceHomeworkId, setDateSourceHomeworkId] = useState<number | null>(null);

  // Aktif program tarih aralığı düzenleme
  const [editWeekStart, setEditWeekStart] = useState('');
  const [editWeekEnd, setEditWeekEnd] = useState('');
  const [rangeSaving, setRangeSaving] = useState(false);
  const [weekCoachNote, setWeekCoachNote] = useState('');
  const [weekNoteSaving, setWeekNoteSaving] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributeMetric, setDistributeMetric] = useState<'question' | 'test'>('question');
  const [distributeHomeworkId, setDistributeHomeworkId] = useState<number | null>(null);
  const [distributeSaving, setDistributeSaving] = useState(false);
  const [staleOpen, setStaleOpen] = useState(false);

  // Süresi dolmuş program kilidi
  const isExpired = program ? isProgramExpired(program) : false;
  const rangeDirty = !!program && (
    editWeekStart !== program.week_start || editWeekEnd !== program.week_end
  );

  // Ödev havuzu (takvime eklenenler listede görünmez)
  const [homeworkPool, setHomeworkPool] = useState<HomeworkPoolItem[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  /** Program oluşturma ekranı için ham havuz (filtre yok) */
  const [datePickPool, setDatePickPool] = useState<HomeworkPoolItem[]>([]);

  /** Program oluşturma ekranı: ödev başına tek satır */
  const uniqueHomeworkForDates = useMemo(() => {
    const seen = new Set<number>();
    const out: HomeworkPoolItem[] = [];
    for (const hw of datePickPool) {
      if (seen.has(hw.id)) continue;
      seen.add(hw.id);
      out.push(hw);
    }
    return out;
  }, [datePickPool]);

  const currentPool = useMemo(() => {
    if (!program) return homeworkPool;
    return homeworkPool.filter((hw) => homeworkOverlapsWeek(hw, program.week_start, program.week_end));
  }, [homeworkPool, program]);

  const stalePool = useMemo(() => {
    if (!program) return [] as HomeworkPoolItem[];
    return homeworkPool.filter((hw) => !homeworkOverlapsWeek(hw, program.week_start, program.week_end));
  }, [homeworkPool, program]);

  const currentHomeworks = useMemo(() => {
    const seen = new Set<number>();
    const out: HomeworkPoolItem[] = [];
    for (const hw of currentPool) {
      if (seen.has(hw.id)) continue;
      seen.add(hw.id);
      out.push(hw);
    }
    return out;
  }, [currentPool]);

  /** Sol panel: ders başlığı altında grupla */
  const poolByLesson = useMemo(() => {
    const map = new Map<string, HomeworkPoolItem[]>();
    for (const hw of currentPool) {
      const key = hw.lesson_name?.trim() || 'Diğer';
      const list = map.get(key) || [];
      list.push(hw);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [currentPool]);

  /** Programdaki ödev planı başlıkları (panel üstü) */
  const programHomeworkTitles = useMemo(() => {
    if (!program) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of program.days || []) {
      for (const b of d.blocks || []) {
        const t = stripCompletionTitleSuffix(b.source_assignment_title);
        if (!t) continue;
        const key = t.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
    }
    return out;
  }, [program]);

  /** Gün → ders özeti (takvim üstü) — kontrol günü dahil */
  const dayLessonSummary = useMemo(() => {
    if (!program) return [] as Array<{ dayLabel: string; lessons: string[]; date: string }>;
    return [...(program.days || [])]
      .sort((a, b) => a.day_date.localeCompare(b.day_date))
      .map((day) => {
        const lessons: string[] = [];
        const seen = new Set<string>();
        for (const b of [...day.blocks].sort((x, y) => x.order - y.order)) {
          const name = b.lesson_name?.trim();
          if (!name) continue;
          const key = name.toLocaleLowerCase('tr-TR');
          if (seen.has(key)) continue;
          seen.add(key);
          lessons.push(name);
        }
        return {
          dayLabel: WEEKDAY_LABELS[day.weekday] || 'Gün',
          lessons,
          date: day.day_date,
        };
      });
  }, [program]);

  // Mobil/tablet: seçili gün ve aktif bölme (takvim / havuz)
  const [mobilePane, setMobilePane] = useState<'takvim' | 'havuz'>('takvim');
  const [focusedDayId, setFocusedDayId] = useState<number | null>(null);
  const [compactDayMode, setCompactDayMode] = useState(true);

  // Ödev bölme modalı
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitTarget, setSplitTarget] = useState<{
    type: 'block' | 'homework';
    block?: ProgramBlock;
    homework?: HomeworkPoolItem;
    title: string;
    totalQuestions: number;
    currentDayId?: number;
  } | null>(null);

  // Blok düzenleme modalı
  const [editingBlock, setEditingBlock] = useState<ProgramBlock | null>(null);

  // Yazdırma önizleme
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<NodeJS.Timeout>();

  /* ─── Toast helper ─── */
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const isDirty = useMemo(
    () =>
      Boolean(
        selectedStudent &&
          (program ||
            newWeekStart ||
            newWeekEnd ||
            splitModalOpen ||
            editingBlock)
      ),
    [
      selectedStudent,
      program,
      newWeekStart,
      newWeekEnd,
      splitModalOpen,
      editingBlock,
    ]
  );

  const { leaveDialogProps } = useUnsavedChangesGuard({
    isDirty,
    title: 'Program Ekranından Ayrıl',
    message:
      'Çalışma programı üzerinde çalışırken bu sayfadan ayrılmak istediğinize emin misiniz? Devam eden düzenlemeler kaybolabilir.',
  });

  /* ═══════════════════════════════════════════════════════
     VERİ YÜKLEME
     ═══════════════════════════════════════════════════════ */

  // Koç listesi
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchCoaches({ is_active: true });
        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data as any).results || [];
          setCoaches(list);
        } else {
          setError(res.error || 'Koç listesi yüklenemedi. Lütfen giriş yaptığınızdan emin olun.');
        }
      } catch {
        setError('Koç listesi yüklenirken hata oluştu.');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Öğrenci listesi (koç seçilince)
  useEffect(() => {
    if (!selectedCoach) { setStudents([]); if (!lockedStudentId) setSelectedStudent(null); return; }
    (async () => {
      try {
        const res = await fetchCoachStudents(selectedCoach);
        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data as any).results || [];
          setStudents(list);
          if (!lockedStudentId) setSelectedStudent(null);
        }
      } catch {
        /* sessiz */
      }
    })();
  }, [selectedCoach, lockedStudentId]);

  useEffect(() => {
    if (lockedCoachId) {
      setSelectedCoach(lockedCoachId);
    }
  }, [lockedCoachId]);

  useEffect(() => {
    if (lockedStudentId) {
      setSelectedStudent(lockedStudentId);
    }
  }, [lockedStudentId]);

  /* Ödev ver ekranından gelen tarih / ödev ön seçimi */
  useEffect(() => {
    if (initialWeekStart) setNewWeekStart(initialWeekStart);
    if (initialWeekEnd) setNewWeekEnd(initialWeekEnd);
    if (initialHomeworkId) setDateSourceHomeworkId(initialHomeworkId);
  }, [initialWeekStart, initialWeekEnd, initialHomeworkId]);

  // Öğrenci seçildiğinde mevcut programlarını yükle
  const loadStudentPrograms = useCallback(async () => {
    if (!selectedStudent) {
      setStudentPrograms([]);
      setProgram(null);
      return;
    }
    setStudentProgramsLoading(true);
    setError(null);
    try {
      const res = await fetchPrograms({ student_id: selectedStudent, is_template: false });
      if (res.success && res.data) {
        setStudentPrograms(res.data);
      } else {
        setStudentPrograms([]);
      }
    } catch {
      setError('Programlar yüklenirken bir hata oluştu');
    } finally {
      setStudentProgramsLoading(false);
    }
  }, [selectedStudent]);

  useEffect(() => {
    loadStudentPrograms();
    // initialProgramId varsa liste yüklenirken programı silme — aşağıda açılacak
    if (!initialProgramId) setProgram(null);
  }, [loadStudentPrograms, initialProgramId]);

  // Seçili programa ait veriyi yeniden yükle
  const reloadCurrentProgram = useCallback(async () => {
    if (!program) return;
    try {
      const detail = await fetchProgram(program.id);
      if (detail.success && detail.data) {
        setProgram(detail.data);
      }
    } catch { /* ignore */ }
  }, [program?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bir program seç
  const handleSelectProgram = useCallback(async (programId: number) => {
    setLoading(true);
    try {
      const detail = await fetchProgram(programId);
      if (!detail.success || !detail.data) return;
      setProgram(detail.data);
      setEditWeekStart(detail.data.week_start);
      setEditWeekEnd(detail.data.week_end);
    } catch {
      setError('Program yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, []);

  // Student 360: kart / düzenle → doğrudan program
  const autoOpenedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!initialProgramId || !selectedStudent || studentProgramsLoading) return;
    if (autoOpenedRef.current === initialProgramId) return;
    if (program?.id === initialProgramId) {
      autoOpenedRef.current = initialProgramId;
      return;
    }
    autoOpenedRef.current = initialProgramId;
    void handleSelectProgram(initialProgramId);
  }, [
    initialProgramId,
    selectedStudent,
    studentProgramsLoading,
    program?.id,
    handleSelectProgram,
  ]);

  // Program yüklendiğinde tarih aralığı + haftalık not formunu senkronla
  useEffect(() => {
    if (program) {
      setEditWeekStart(program.week_start);
      setEditWeekEnd(program.week_end);
      setWeekCoachNote(program.coach_note || '');
    } else {
      setEditWeekStart('');
      setEditWeekEnd('');
      setWeekCoachNote('');
    }
  }, [program?.id, program?.week_start, program?.week_end, program?.coach_note]);

  // Ödev havuzu yükle — program varken yalnızca planlanmamış içerikler
  const loadHomeworkPool = useCallback(async () => {
    if (!selectedStudent) return;
    setPoolLoading(true);
    try {
      const res = await fetchHomeworkPool({
        student_id: selectedStudent,
        program_id: program?.id,
        status: program?.id ? 'unplanned' : undefined,
      });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : [];
        if (program?.id) {
          setHomeworkPool(items.filter((h) => !h.is_planned));
        } else {
          setDatePickPool(items);
          setHomeworkPool(items);
        }
      }
    } catch { /* ignore */ } finally {
      setPoolLoading(false);
    }
  }, [selectedStudent, program?.id]);

  useEffect(() => { loadHomeworkPool(); }, [loadHomeworkPool]);

  /* ═══════════════════════════════════════════════════════
     AKSİYONLAR
     ═══════════════════════════════════════════════════════ */

  const applyHomeworkDates = useCallback((hw: HomeworkPoolItem) => {
    const { start, end } = datesFromHomework(hw);
    if (start) setNewWeekStart(start);
    if (end) setNewWeekEnd(end);
    setDateSourceHomeworkId(hw.id);
  }, []);

  // Yeni hafta oluştur
  const handleCreateWeek = async () => {
    if (!selectedStudent || !newWeekStart || !newWeekEnd) return;
    setLoading(true);
    try {
      const res = await createProgram({
        student: selectedStudent,
        week_start: newWeekStart,
        week_end: newWeekEnd,
      });
      if (res.success && res.data) {
        setProgram(res.data);
        setEditWeekStart(res.data.week_start);
        setEditWeekEnd(res.data.week_end);
        const isExisting = !!(res.data as { total_block_count?: number }).total_block_count;
        showToast(isExisting ? 'Mevcut program yüklendi!' : 'Yeni çalışma programı oluşturuldu!');
        loadHomeworkPool();
        loadStudentPrograms(); // listeyi güncelle
        setNewWeekStart('');
        setNewWeekEnd('');
        setDateSourceHomeworkId(null);
      } else {
        showToast(res.error || 'Program oluşturulamadı', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Aktif program tarih aralığını güncelle
  const handleUpdateDateRange = async (force = false) => {
    if (!program || !editWeekStart || !editWeekEnd) return;
    if (editWeekEnd < editWeekStart) {
      showToast('Bitiş tarihi başlangıçtan önce olamaz', 'error');
      return;
    }
    setRangeSaving(true);
    try {
      const res = await updateProgram(program.id, {
        week_start: editWeekStart,
        week_end: editWeekEnd,
        force_remove_blocks: force || undefined,
      });
      if (res.success && res.data) {
        setProgram(res.data);
        setEditWeekStart(res.data.week_start);
        setEditWeekEnd(res.data.week_end);
        showToast('Tarih aralığı güncellendi');
        loadHomeworkPool();
        loadStudentPrograms();
      } else {
        const msg = res.error || 'Tarih aralığı güncellenemedi';
        if (/blok/i.test(msg) && !force) {
          const ok = window.confirm(
            `${msg}\n\nAralık dışı günlerdeki blokları silerek devam edilsin mi?`,
          );
          if (ok) {
            await handleUpdateDateRange(true);
            return;
          }
        }
        showToast(msg, 'error');
      }
    } catch {
      showToast('Tarih aralığı güncellenirken hata oluştu', 'error');
    } finally {
      setRangeSaving(false);
    }
  };

  const handleNormalizeWeek = async () => {
    if (!program) return;
    const next = rangeFromStart(program.week_start);
    setEditWeekStart(next.start);
    setEditWeekEnd(next.end);
    setRangeSaving(true);
    try {
      const res = await updateProgram(program.id, {
        week_start: next.start,
        week_end: next.end,
      });
      if (res.success && res.data) {
        setProgram(res.data);
        setEditWeekStart(res.data.week_start);
        setEditWeekEnd(res.data.week_end);
        showToast('Program 7 güne getirildi. Son gün kontrol.');
        loadHomeworkPool();
        loadStudentPrograms();
      } else {
        showToast(res.error || 'Tarih 7 güne getirilemedi', 'error');
      }
    } catch {
      showToast('Tarih güncellenirken hata oluştu', 'error');
    } finally {
      setRangeSaving(false);
    }
  };

  const openDistribute = () => {
    if (!program || isExpired) return;
    if (!isSevenDayRange(program.week_start, program.week_end)) {
      showToast('Önce programı 7 güne getirin. Son gün kontrol günüdür.', 'error');
      return;
    }
    const first = currentHomeworks[0];
    setDistributeHomeworkId(first ? first.id : null);
    setDistributeOpen(true);
  };

  const handleConfirmDistribute = async () => {
    if (!program || isExpired || !distributeHomeworkId) return;
    setDistributeSaving(true);
    try {
      const res = await autoDistribute(program.id, [distributeHomeworkId], distributeMetric);
      if (res.success) {
        const count = res.data?.distributed ?? 0;
        if (count === 0) {
          showToast(res.data?.detail || 'Dağıtılacak konu kalmadı.', 'error');
        } else {
          const label = distributeMetric === 'test' ? 'test sayısına' : 'soru sayısına';
          const dayCount = res.data?.study_days ?? 7;
          showToast(`Her konu ${dayCount} günün her birine kendi ${label} göre bölündü. ${count} blok yazıldı.`);
          setDistributeOpen(false);
        }
        reloadCurrentProgram();
        loadHomeworkPool();
      } else {
        showToast(res.error || 'Dağıtım başarısız', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    } finally {
      setDistributeSaving(false);
    }
  };

  // Program sıfırla
  const handleResetProgram = async () => {
    if (!program || isExpired) return;
    if (!confirm('Tüm bloklar silinecek ve program sıfırlanacak. Emin misiniz?')) return;
    try {
      const res = await resetProgram(program.id);
      if (res.success && res.data) {
        setProgram(res.data.program);
        if (res.data.deleted === 0) {
          showToast('ℹ️ Programda silinecek blok bulunmadı — zaten boş.', 'error');
        } else {
          showToast(`✅ ${res.data.deleted} blok silindi — program sıfırlandı!`);
        }
        loadHomeworkPool();
      } else {
        showToast(res.error || 'Sıfırlama başarısız', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Program sil
  const handleDeleteProgram = async () => {
    if (!program) return;
    if (!confirm('Bu programı silmek istediğinize emin misiniz?')) return;
    try {
      const res = await deleteProgram(program.id);
      if (res.success) {
        setProgram(null);
        showToast('Program silindi');
        loadStudentPrograms(); // listeyi güncelle
      }
    } catch {
      showToast('Silinemedi', 'error');
    }
  };

  // PDF yazdır — profesyonel print preview modal aç
  const handlePrintPDF = () => {
    if (!program) return;
    setShowPrintPreview(true);
  };

  /* ─── Blok aksiyonları ─── */

  // Blok tamamla / geri al
  const handleToggleComplete = async (blockId: number) => {
    try {
      const res = await toggleBlockComplete(blockId);
      if (res.success) {
        showToast(res.data?.is_completed ? '✅ Tamamlandı!' : '↩️ Geri alındı');
        reloadCurrentProgram();
      } else {
        showToast(res.error || 'İşlem başarısız', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Blok sil
  const handleDeleteBlock = async (blockId: number) => {
    try {
      const res = await deleteBlock(blockId);
      if (res.success) {
        showToast('Blok kaldırıldı');
        reloadCurrentProgram();
        loadHomeworkPool();
      }
    } catch { /* ignore */ }
  };

  // Drag & Drop: Ödev havuzundan güne bırak
  const handleDropHomework = async (dayId: number, item: HomeworkPoolItem) => {
    try {
      const topic = item.topic_name?.trim() || '';
      const res = await createBlock({
        day: dayId,
        source_assignment: item.id,
        source_lesson: item.lesson_id,
        lesson: item.ders_id || undefined,
        title: topic || item.lesson_name || item.title,
        topic_name: topic,
        resource_name: item.resource_name || '',
        block_type: 'SORU_COZUMU' as BlockType,
        question_count: item.question_count || 0,
        priority: (item.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') || 'MEDIUM',
      });
      if (res.success) {
        const heavy = (item.question_count || 0) > 80;
        showToast(heavy
          ? `${item.question_count} soru tek güne yazıldı. İsterseniz Böl ile yayın.`
          : 'Ödev takvime eklendi.');
        reloadCurrentProgram();
        loadHomeworkPool();
      } else {
        showToast(res.error || 'Eklenemedi', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Bloğu başka güne taşı
  const handleMoveBlock = async (blockId: number, targetDayId: number) => {
    try {
      const res = await moveBlock(blockId, targetDayId);
      if (res.success) {
        showToast(res.data?.merged ? 'Aynı ödev birleştirildi' : 'Güne taşındı');
        reloadCurrentProgram();
        loadHomeworkPool();
      } else {
        showToast(res.error || 'Taşınamadı', 'error');
      }
    } catch { /* ignore */ }
  };

  // Günlük koç notu kaydet
  const handleCoachNoteSave = async (dayId: number, note: string) => {
    try {
      const res = await updateDay(dayId, { coach_note: note });
      if (res.success) {
        showToast('Koç notu kaydedildi');
        setProgram((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            days: prev.days.map((d) => d.id === dayId ? { ...d, coach_note: note } : d),
          };
        });
      } else {
        showToast('Not kaydedilemedi', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Haftalık koç notu (PDF'te görünür)
  const handleWeekCoachNoteSave = async () => {
    if (!program) return;
    setWeekNoteSaving(true);
    try {
      const res = await updateProgram(program.id, { coach_note: weekCoachNote });
      if (res.success && res.data) {
        setProgram(res.data);
        setWeekCoachNote(res.data.coach_note || '');
        showToast('Haftalık koç notu kaydedildi');
      } else {
        showToast(res.error || 'Not kaydedilemedi', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    } finally {
      setWeekNoteSaving(false);
    }
  };

  // Blok düzenle (modal'dan kaydet)
  const handleSaveEdit = async (blockId: number, data: Partial<ProgramBlock>) => {
    try {
      const res = await updateBlock(blockId, data);
      if (res.success) {
        showToast('Blok güncellendi');
        setEditingBlock(null);
        reloadCurrentProgram();
      } else {
        showToast('Güncellenemedi', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Gün içi blok sıralama
  const handleReorderBlocks = async (dayId: number, orderedBlockIds: number[]) => {
    try {
      const items = orderedBlockIds.map((blockId, idx) => ({
        block_id: blockId,
        day_id: dayId,
        order: idx,
      }));
      const res = await reorderBlocks(items);
      if (res.success) reloadCurrentProgram();
    } catch { /* ignore */ }
  };

  // ✂️ Böl: Takvimde var olan bloğu böl
  const handleOpenSplitBlock = (block: ProgramBlock) => {
    setSplitTarget({
      type: 'block',
      block,
      title: primaryBlockLabel(block),
      totalQuestions: block.question_count,
      currentDayId: block.day,
    });
    setSplitModalOpen(true);
  };

  // ✂️ Böl: Havuzdaki ödevi böl
  const handleOpenSplitHomework = (item: HomeworkPoolItem) => {
    setSplitTarget({
      type: 'homework',
      homework: item,
      title: item.topic_name?.trim() || item.lesson_name || item.title,
      totalQuestions: item.question_count,
    });
    setSplitModalOpen(true);
  };

  // ✂️ Böl onayı
  const handleSplitConfirm = async (dayIds: number[], questionCounts: number[]) => {
    setSplitModalOpen(false);
    if (!splitTarget) return;

    try {
      if (splitTarget.type === 'block' && splitTarget.block) {
        const res = await splitBlockToDays(splitTarget.block.id, { day_ids: dayIds, question_counts: questionCounts });
        if (res.success) {
          showToast(`Ödev ${dayIds.length} güne bölündü!`);
          reloadCurrentProgram();
        } else {
          showToast(res.error || 'Bölme başarısız', 'error');
        }
      } else if (splitTarget.type === 'homework' && splitTarget.homework) {
        const res = await splitHomeworkToDays(splitTarget.homework, dayIds, questionCounts);
        if (res.success) {
          showToast(`Ödev ${dayIds.length} güne bölünerek eklendi!`);
          reloadCurrentProgram();
          loadHomeworkPool();
        } else {
          showToast('Bölme başarısız', 'error');
        }
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
    setSplitTarget(null);
  };

  /* ═══════════════════════════════════════════════════════
     HESAPLANAN DEĞERLER
     ═══════════════════════════════════════════════════════ */

  /* ─── Seçili öğrenci adı ─── */
  const selectedStudentName =
    students.find((s) => (s.student_id ?? s.student) === selectedStudent)?.student_full_name || '';

  // Tamamlanmamış ve tamamlanmış programları ayır
  const incompletePrograms = studentPrograms.filter(p => p.completion_percent < 100);
  const completedPrograms = studentPrograms.filter(p => p.completion_percent >= 100);

  const sortedDays = useMemo(() => {
    if (!program?.days) return [];
    return [...program.days].sort((a, b) => a.day_date.localeCompare(b.day_date));
  }, [program]);

  useEffect(() => {
    if (!sortedDays.length) {
      setFocusedDayId(null);
      return;
    }
    if (focusedDayId == null || !sortedDays.some((d) => d.id === focusedDayId)) {
      const todayIso = formatDate(new Date());
      const todayMatch = sortedDays.find((d) => d.day_date === todayIso);
      setFocusedDayId((todayMatch || sortedDays[0]).id);
    }
  }, [sortedDays, focusedDayId]);

  const activeDayObj = useMemo(
    () => sortedDays.find((d) => d.id === focusedDayId) || sortedDays[0] || null,
    [sortedDays, focusedDayId],
  );

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */

  return (
    <>
      <UnsavedChangesModal {...leaveDialogProps} />
    <div
      className={`sp-root${isCoachUi ? ' sp-coach-root' : ''}`}
      style={{ padding: 0, minHeight: isCoachUi ? 'auto' : '100vh' }}
    >
      {/* ─── ÜST STÜDYO ÇUBUĞU (Başlık + Koç + Öğrenci) ─── */}
      {!(lockedCoachId && lockedStudentId) && (
        <header className="sps-top">
          <div className="sps-brand">
            <span className="sps-brand-icon" aria-hidden>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="18" rx="3" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <div>
              <h1>Çalışma Programı</h1>
              <p>Haftalık çalışma planı ve ödev dağıtım stüdyosu</p>
            </div>
          </div>

          <div className="sps-pickers">
            <label className="sps-field">
              <span className="sps-field-tag">Koç</span>
              <select
                value={selectedCoach ?? ''}
                onChange={(e) => setSelectedCoach(Number(e.target.value) || null)}
              >
                <option value="">Koç seçin</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.teacher_full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="sps-field">
              <span className="sps-field-tag">Öğrenci</span>
              <select
                value={selectedStudent ?? ''}
                onChange={(e) => {
                  setSelectedStudent(Number(e.target.value) || null);
                  setNewWeekStart('');
                  setNewWeekEnd('');
                  setDateSourceHomeworkId(null);
                }}
                disabled={!selectedCoach || students.length === 0}
              >
                <option value="">
                  {!selectedCoach ? 'Önce koç seçin' : students.length === 0 ? 'Öğrenci yok' : 'Öğrenci seçin'}
                </option>
                {students.map((s) => (
                  <option key={s.student_id ?? s.student} value={s.student_id ?? s.student}>
                    {s.student_full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
      )}

      {/* ─── Hata ─── */}
      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* ─── Öğrenci seçili değilse ─── */}
      {!selectedStudent && !error && (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 24px',
            backgroundColor: '#fff',
            borderRadius: '16px',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
            Öğrenci Seçin
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280', maxWidth: '400px', margin: '0 auto' }}>
            Haftalık çalışma programı oluşturmak için önce bir koç ve öğrenci seçin.
          </div>
        </div>
      )}

      {/* ─── Öğrenci seçili ama program seçilmemiş → Program Listesi + Yeni Oluştur ─── */}
      {selectedStudent && !loading && !program && (
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>

          {/* ── Verilmiş ödevler → tarihe tıkla ── */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Verilmiş Ödevler</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>
                  Bir ödeve tıklayın — başlangıç/bitiş tarihleri otomatik dolsun; sonra elle düzenleyebilirsiniz.
                </div>
              </div>
              {poolLoading && <span style={{ fontSize: 12, color: '#94a3b8' }}>Yükleniyor…</span>}
            </div>
            {!poolLoading && uniqueHomeworkForDates.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>
                Bu öğrenciye verilmiş aktif ödev bulunamadı.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {uniqueHomeworkForDates.map((hw) => {
                  const selected = dateSourceHomeworkId === hw.id;
                  const assigned = toDateInputValue(hw.assigned_date);
                  const due = toDateInputValue(hw.due_date);
                  const { start: rangeStart, end: rangeEnd } = datesFromHomework(hw);
                  const studyEnd = rangeEnd ? studyRangeEnd(rangeEnd) : '';
                  const studyDays =
                    rangeStart && studyEnd ? inclusiveDayCount(rangeStart, studyEnd) : 0;
                  return (
                    <button
                      key={hw.id}
                      type="button"
                      onClick={() => applyHomeworkDates(hw)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: selected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                        background: selected ? '#eff6ff' : '#fafafa',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                        {stripCompletionTitleSuffix(hw.title) || 'İsimsiz ödev'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <span>{hw.status_display || hw.status}</span>
                        {assigned && <span>Verilme: {formatDateShortTR(assigned)}</span>}
                        {due && <span>Kontrol: {formatDateShortTR(due)}</span>}
                        {hw.lesson_name && <span>{hw.lesson_name}</span>}
                      </div>
                      {rangeStart && rangeEnd && (
                        <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 6, fontWeight: 600 }}>
                          Program: {formatDateShortTR(rangeStart)} – {formatDateShortTR(rangeEnd)}
                          {' '}· 7 gün, son gün kontrol
                          {studyDays > 0 ? ` · ${studyDays} çalışma` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Yeni Program Oluştur Kartı ── */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            border: '2px dashed #d1d5db',
            padding: '24px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>🗓️</span>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>Yeni Program Oluştur</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Ödeve tıklayın veya bir tarihi seçin. Aralık her zaman 7 gündür; son gün kontrol, verilme günü dışarıda kalır.
                  {dateSourceHomeworkId ? ' Ödevden dolduruldu.' : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  İlk çalışma günü
                </label>
                <input
                  type="date"
                  value={newWeekStart}
                  onChange={(e) => {
                    const next = rangeFromStart(e.target.value);
                    setNewWeekStart(next.start);
                    setNewWeekEnd(next.end);
                    setDateSourceHomeworkId(null);
                  }}
                  style={{
                    padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
                    fontSize: '14px', backgroundColor: '#fff',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  Kontrol günü (son gün)
                </label>
                <input
                  type="date"
                  value={newWeekEnd}
                  onChange={(e) => {
                    const next = rangeFromEnd(e.target.value);
                    setNewWeekStart(next.start);
                    setNewWeekEnd(next.end);
                    setDateSourceHomeworkId(null);
                  }}
                  min={newWeekStart}
                  style={{
                    padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
                    fontSize: '14px', backgroundColor: '#fff',
                  }}
                />
              </div>
              <button
                onClick={handleCreateWeek}
                disabled={!newWeekStart || !newWeekEnd}
                style={{
                  padding: '10px 24px',
                  backgroundColor: (!newWeekStart || !newWeekEnd) ? '#d1d5db' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: (!newWeekStart || !newWeekEnd) ? 'not-allowed' : 'pointer',
                }}
              >
                Oluştur
              </button>
            </div>
          </div>

          {/* ── Mevcut Programlar Listesi ── */}
          {studentProgramsLoading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>⏳ Programlar yükleniyor...</div>
          ) : studentPrograms.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '14px',
              backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb',
            }}>
              Bu öğrenci için henüz program oluşturulmamış.
            </div>
          ) : (
            <>
              {/* Tamamlanmamış Programlar */}
              {incompletePrograms.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                    Devam Eden Programlar ({incompletePrograms.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {incompletePrograms
                      .sort((a, b) => b.week_start.localeCompare(a.week_start))
                      .map((p) => {
                        const expired = isProgramExpired(p);
                        return (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProgram(p.id)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '14px 18px',
                              backgroundColor: expired ? '#fefce8' : '#fff',
                              borderRadius: '10px',
                              border: `1px solid ${expired ? '#fde68a' : '#e5e7eb'}`,
                              cursor: 'pointer',
                              transition: 'all .15s',
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📅 {formatDateShortTR(p.week_start)} — {formatDateShortTR(p.week_end)}
                                {expired && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 700 }}>🔒 Süresi Dolmuş</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                📦 {p.total_block_count} blok · 📝 {p.total_question_count} soru · ✅ %{p.completion_percent}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '40px', height: '6px', backgroundColor: '#f3f4f6',
                                borderRadius: '99px', overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${p.completion_percent}%`, height: '100%',
                                  backgroundColor: p.completion_percent >= 80 ? '#22c55e' : p.completion_percent >= 40 ? '#f59e0b' : '#ef4444',
                                  borderRadius: '99px',
                                }} />
                              </div>
                              <span style={{ fontSize: '18px', color: '#9ca3af' }}>→</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Tamamlanmış Programlar (varsayılan gizli) */}
              {completedPrograms.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompletedPrograms(!showCompletedPrograms)}
                    style={{
                      fontSize: '13px', fontWeight: 700, color: '#6b7280', marginBottom: '8px',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                    Tamamlanmış Programlar ({completedPrograms.length})
                    <span style={{ fontSize: '11px' }}>{showCompletedPrograms ? '▼' : '▶'}</span>
                  </button>
                  {showCompletedPrograms && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {completedPrograms
                        .sort((a, b) => b.week_start.localeCompare(a.week_start))
                        .map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProgram(p.id)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '12px 16px',
                              backgroundColor: '#f0fdf4',
                              borderRadius: '10px',
                              border: '1px solid #bbf7d0',
                              cursor: 'pointer',
                              transition: 'all .15s',
                              opacity: 0.85,
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>
                                ✅ {formatDateShortTR(p.week_start)} — {formatDateShortTR(p.week_end)}
                              </div>
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                📦 {p.total_block_count} blok · 📝 {p.total_question_count} soru
                              </div>
                            </div>
                            <span style={{ fontSize: '16px', color: '#9ca3af' }}>→</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Yükleniyor ─── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⏳</div>
          Yükleniyor...
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
         ANA İÇERİK: SOL PANEL + SAĞ TAKVİM
         ═══════════════════════════════════════════════════════ */}
      {selectedStudent && program && !loading && (
        <>
          {/* ─── Süresi dolmuş uyarısı ─── */}
          {isExpired && (
            <div style={{
              backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px',
              padding: '12px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '24px' }}>🔒</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>Bu programın süresi dolmuş</div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {formatDateShortTR(program.week_start)} – {formatDateShortTR(program.week_end)} aralığı geçmiş.
                  Bitiş tarihini uzatarak yeniden düzenleyebilirsiniz.
                </div>
              </div>
            </div>
          )}

          {/* ─── Birleşik Komut, Tarih ve Metrik Şeridi ─── */}
          <div className="sps-command">
            <div className="sps-range-group">
              <button
                type="button"
                className="sps-btn"
                onClick={() => {
                  if (onExit) onExit();
                  else setProgram(null);
                }}
              >
                ← Programlar
              </button>
              <label className="sps-date-pill">
                <span>Başlangıç</span>
                <input
                  type="date"
                  value={editWeekStart}
                  onChange={(e) => {
                    const next = rangeFromStart(e.target.value);
                    setEditWeekStart(next.start);
                    setEditWeekEnd(next.end);
                  }}
                />
              </label>
              <label className="sps-date-pill">
                <span>Kontrol</span>
                <input
                  type="date"
                  value={editWeekEnd}
                  onChange={(e) => {
                    const next = rangeFromEnd(e.target.value);
                    setEditWeekStart(next.start);
                    setEditWeekEnd(next.end);
                  }}
                />
              </label>
              {rangeDirty && (
                <button
                  type="button"
                  className="sps-btn sps-btn-primary"
                  onClick={() => handleUpdateDateRange(false)}
                  disabled={rangeSaving || !editWeekStart || !editWeekEnd}
                >
                  {rangeSaving ? 'Kaydediliyor…' : 'Tarihi Kaydet'}
                </button>
              )}
            </div>

            <div className="sps-metrics">
              <span className="sps-stat">
                Soru <strong>{program.total_question_count}</strong>
              </span>
              <span className="sps-stat">
                Blok <strong>{program.total_block_count}</strong>
              </span>
            </div>

            <div
              className="sps-actions"
              style={isExpired ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
            >
              <button
                type="button"
                className="sps-btn sps-btn-dark"
                onClick={openDistribute}
                disabled={isExpired}
              >
                Ödevleri Dağıt
              </button>
              <button type="button" className="sps-btn" onClick={handlePrintPDF}>
                Yazdır / PDF
              </button>
              <button
                type="button"
                className="sps-btn sps-btn-danger"
                onClick={handleResetProgram}
                disabled={isExpired}
              >
                Sıfırla
              </button>
              <button
                type="button"
                className="sps-btn sps-btn-danger"
                onClick={handleDeleteProgram}
                title="Programı Sil"
              >
                Sil
              </button>
            </div>
          </div>

          {program && !isSevenDayRange(program.week_start, program.week_end) && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              marginBottom: 10, padding: '10px 12px', borderRadius: 12,
              background: '#fffbeb', border: '1px solid #fde68a', flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                Bu program {inclusiveDayCount(program.week_start, program.week_end)} gün.
                Haftalık program 7 gündür; son gün kontrol günüdür.
              </div>
              <button
                type="button"
                className="sps-btn sps-btn-dark"
                onClick={() => { void handleNormalizeWeek(); }}
                disabled={rangeSaving}
              >
                7 güne getir
              </button>
            </div>
          )}

          {distributeOpen && (
            <div style={{
              marginBottom: 10, padding: '12px 14px', borderRadius: 12,
              background: '#fff', border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                Her konuyu 7 günün her birine böl
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                47 soruluk bir konu yedi güne kendi içinde bölünür. Haftanın toplamından gün doldurulmaz. Kontrol günü de pay alır.
              </div>
              {currentHomeworks.length === 0 ? (
                <div style={{ fontSize: 13, color: '#b45309' }}>Bu haftayla kesişen ödev yok.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {currentHomeworks.map((hw) => (
                    <label key={hw.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#0f172a' }}>
                      <input
                        type="radio"
                        name="distribute-hw"
                        checked={distributeHomeworkId === hw.id}
                        onChange={() => setDistributeHomeworkId(hw.id)}
                      />
                      {stripCompletionTitleSuffix(hw.title) || 'Ödev'}
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button
                  type="button"
                  className={`sps-btn${distributeMetric === 'question' ? ' sps-btn-dark' : ''}`}
                  onClick={() => setDistributeMetric('question')}
                >
                  Soru sayısına göre
                </button>
                <button
                  type="button"
                  className={`sps-btn${distributeMetric === 'test' ? ' sps-btn-dark' : ''}`}
                  onClick={() => setDistributeMetric('test')}
                >
                  Test sayısına göre
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="sps-btn sps-btn-primary"
                  disabled={distributeSaving || !distributeHomeworkId}
                  onClick={() => { void handleConfirmDistribute(); }}
                >
                  {distributeSaving ? 'Dağıtılıyor…' : 'Dağıt'}
                </button>
                <button type="button" className="sps-btn" onClick={() => setDistributeOpen(false)}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {/* Haftalık koç notu — tek satır kompakt bar */}
          <div className="sps-note-bar">
            <label htmlFor="sps-week-note">📌 Haftalık Koç Notu</label>
            <input
              id="sps-week-note"
              type="text"
              value={weekCoachNote}
              onChange={(e) => setWeekCoachNote(e.target.value)}
              disabled={isExpired}
              placeholder="Bu hafta özellikle… (ör. matematik soru hızı, fizik konu tekrarı — PDF'te görünür)"
            />
            <button
              type="button"
              className="sps-btn sps-btn-dark"
              onClick={handleWeekCoachNoteSave}
              disabled={isExpired || weekNoteSaving || weekCoachNote === (program.coach_note || '')}
            >
              {weekNoteSaving ? '…' : 'Kaydet'}
            </button>
          </div>

          {/* Mobil: Takvim / Havuz Sekmesi */}
          <div className="sps-mobile-switcher">
            <div className="sps-mode-tabs" role="tablist" aria-label="Çalışma alanı">
              <button
                type="button"
                className={mobilePane === 'takvim' ? 'is-on' : ''}
                onClick={() => setMobilePane('takvim')}
              >
                Haftalık Takvim ({program.total_block_count})
              </button>
              <button
                type="button"
                className={mobilePane === 'havuz' ? 'is-on' : ''}
                onClick={() => setMobilePane('havuz')}
              >
                Ödev Havuzu ({currentPool.length})
              </button>
            </div>
          </div>

          {/* ─── Split Layout ─── */}
          <div className="sp-board-split" data-mobile-pane={mobilePane}>
            {/* ───── SOL PANEL: ÖDEV HAVUZU ───── */}
            <div
              className="sp-pool-panel"
              style={{
                ...(isExpired ? { opacity: 0.5, pointerEvents: 'none' as const } : {}),
              }}
            >
              <div style={{
                padding: '14px 14px 12px',
                borderBottom: '1px solid #e8eef5',
                background: '#f8fafc',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                    Ödev havuzu
                  </h3>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>
                    {currentPool.length} içerik
                  </span>
                </div>
                {programHomeworkTitles.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#0f766e',
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as const,
                    }}
                    title={programHomeworkTitles.join(' · ')}
                  >
                    {programHomeworkTitles.join(' · ')}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                {poolLoading ? (
                  <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>
                    Yükleniyor…
                  </div>
                ) : currentPool.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 12px', color: '#94a3b8' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                      {stalePool.length > 0 ? 'Bu haftanın ödevi havuzda yok' : 'Tüm içerikler planlandı'}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {stalePool.length > 0
                        ? 'Bu haftayla kesişen ödev kalmadı. Eski ödevler aşağıda.'
                        : 'Takvimden kaldırınca buraya döner.'}
                    </div>
                  </div>
                ) : (
                  poolByLesson.map(([lessonName, items]) => {
                    const accent = lessonAccent(lessonName === 'Diğer' ? null : lessonName);
                    return (
                      <div key={lessonName} style={{ marginBottom: 16 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          margin: '0 2px 8px',
                        }}>
                          <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: accent,
                            flexShrink: 0,
                          }} />
                          <div style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: '#0f172a',
                            letterSpacing: '0.02em',
                          }}>
                            {lessonName}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>
                            {items.length}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {items.map((hw) => {
                            const canQuickAdd = Boolean(activeDayObj);
                            const dayShort = activeDayObj
                              ? WEEKDAY_LABELS[activeDayObj.weekday] || 'Gün'
                              : '';
                            return (
                              <HomeworkPoolCard
                                key={`${hw.id}-${hw.lesson_id ?? 'all'}-${hw.topic_name}`}
                                item={hw}
                                hideLessonName
                                onDragStart={(e, item) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', String(item.id));
                                  setStudyDrag({ kind: 'homework', item });
                                }}
                                onSplit={program ? handleOpenSplitHomework : undefined}
                                onQuickAdd={
                                  canQuickAdd
                                    ? (item) => {
                                        handleDropHomework(activeDayObj.id, item);
                                      }
                                    : undefined
                                }
                                quickAddLabel={dayShort}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
                {stalePool.length > 0 && (
                  <div style={{ marginTop: 8, borderTop: '1px solid #e8eef5', paddingTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setStaleOpen((v) => !v)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '6px 2px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      {staleOpen ? '▾' : '▸'} Eski ödevler ({new Set(stalePool.map((h) => h.id)).size})
                    </button>
                    {staleOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {Array.from(new Set(stalePool.map((h) => h.title))).map((title) => (
                          <div key={title} style={{ fontSize: 12, color: '#94a3b8', padding: '4px 2px' }}>
                            {stripCompletionTitleSuffix(title) || title}
                          </div>
                        ))}
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          Bu haftanın programına karışmasın diye dağıtıma dahil edilmez.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ───── SAĞ PANEL: ÖZET + TAKVİM ───── */}
            <div
              className="sp-calendar-panel"
              style={{ ...(isExpired ? { opacity: 0.7, pointerEvents: 'none' as const } : {}) }}
            >
              {/* Gün–ders özeti (yalnızca geniş ekranda) */}
              <div className="sps-plan-summary-box" style={{
                marginBottom: 10,
                padding: '10px 12px',
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  marginBottom: 8,
                }}>
                  Plan özeti
                </div>
                <div
                  className="sp-plan-summary-grid"
                  style={{
                    ['--sp-summary-count' as string]: Math.max(dayLessonSummary.length, 1),
                  }}
                >
                  {dayLessonSummary.map((row) => (
                    <div
                      key={row.date}
                      style={{
                        minWidth: 0,
                        padding: '6px 8px',
                        borderRadius: 8,
                        background: row.lessons.length ? '#f8fafc' : '#fafafa',
                        border: '1px solid #eef2f7',
                      }}
                    >
                      <div style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#0f172a',
                        marginBottom: 4,
                      }}>
                        {row.dayLabel}
                      </div>
                      {row.lessons.length === 0 ? (
                        <div style={{ fontSize: 10, color: '#cbd5e1' }}>—</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {row.lessons.map((lesson) => (
                            <div
                              key={lesson}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: lessonAccent(lesson),
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={lesson}
                            >
                              {lesson}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tablet & Telefon: 7 Günlük Seçici Şerit */}
              <div
                className="sps-day-ribbon"
                role="tablist"
                aria-label="Program günleri"
                style={{ ['--sp-day-count' as string]: Math.max(sortedDays.length, 1) }}
              >
                {sortedDays.map((d) => {
                  const ctrl = isControlDay(d.day_date, program.week_end);
                  const active = d.id === activeDayObj?.id;
                  const dt = new Date(`${d.day_date}T12:00:00`);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`sps-day-tab${ctrl ? ' is-control' : ''}${active ? ' is-active' : ''}`}
                      onClick={() => {
                        setFocusedDayId(d.id);
                        setCompactDayMode(true);
                      }}
                      onDragOver={(e) => {
                        if (getStudyDrag()?.kind !== 'block') return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        e.currentTarget.classList.add('is-drop');
                      }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('is-drop')}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('is-drop');
                        const payload = getStudyDrag();
                        setStudyDrag(null);
                        if (!payload || payload.kind !== 'block' || payload.fromDayId === d.id) return;
                        handleMoveBlock(payload.block.id, d.id);
                        setFocusedDayId(d.id);
                      }}
                    >
                      <span>{WEEKDAY_LABELS[d.weekday] || 'Gün'}</span>
                      <strong>{dt.getDate()}</strong>
                      <em>{ctrl ? `Knt ${d.total_question_count}` : `${d.total_question_count}s`}</em>
                    </button>
                  );
                })}
              </div>

              <div
                className="sp-day-grid-scroll"
                onDragOver={(e) => {
                  const el = e.currentTarget;
                  const rect = el.getBoundingClientRect();
                  const edge = 56;
                  if (e.clientX < rect.left + edge) el.scrollLeft -= 16;
                  else if (e.clientX > rect.right - edge) el.scrollLeft += 16;
                }}
              >
                <div
                  className={`sp-day-grid${compactDayMode ? ' is-focused-day' : ''}`}
                  style={{
                    ['--sp-day-count' as string]: Math.max(sortedDays.length, 1),
                  }}
                >
                  {sortedDays.map((day) => (
                    <div
                      key={day.id}
                      data-day-active={day.id === activeDayObj?.id ? 'true' : 'false'}
                      style={{ minWidth: 0 }}
                    >
                      <DayColumn
                        day={day}
                        isControlDay={isControlDay(day.day_date, program.week_end)}
                        onToggleComplete={handleToggleComplete}
                        onDeleteBlock={handleDeleteBlock}
                        onEditBlock={(block) => setEditingBlock(block)}
                        onDropHomework={(dayId, item) => handleDropHomework(dayId, item)}
                        onDropBlock={(dayId, block) => handleMoveBlock(block.id, dayId)}
                        onDragBlockStart={() => {
                          /* yük DayColumn içinde tutulur */
                        }}
                        onReorderBlocks={handleReorderBlocks}
                        onCoachNoteChange={handleCoachNoteSave}
                        onSplitBlock={handleOpenSplitBlock}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         MODALLER
         ═══════════════════════════════════════════════════════ */}


      {/* ═══════════════════════════════════════════════════════
         ÖDEV BÖLME MODALI
         ═══════════════════════════════════════════════════════ */}
      {splitTarget && program && (
        <SplitModal
          open={splitModalOpen}
          onClose={() => { setSplitModalOpen(false); setSplitTarget(null); }}
          onConfirm={handleSplitConfirm}
          title={splitTarget.title}
          totalQuestions={splitTarget.totalQuestions}
          days={program.days}
          currentDayId={splitTarget.currentDayId}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
         BLOK DÜZENLEME MODALI
         ═══════════════════════════════════════════════════════ */}
      {editingBlock && (
        <BlockEditModal
          block={editingBlock}
          onSave={handleSaveEdit}
          onClose={() => setEditingBlock(null)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
         PROFESYONEL YAZDIR ÖNİZLEMESİ
         ═══════════════════════════════════════════════════════ */}
      {showPrintPreview && program && (
        <StudyProgramPrintPreview
          program={program}
          onClose={() => setShowPrintPreview(false)}
        />
      )}


      {/* ═══════════════════════════════════════════════════════
         TOAST
         ═══════════════════════════════════════════════════════ */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '14px 24px',
            borderRadius: '12px',
            backgroundColor: toast.type === 'success' ? '#059669' : '#dc2626',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,.2)',
            animation: 'slideUp .3s ease',
          }}
        >
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* keyframe animations */}
      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   STİL YARDIMCILARI
   ═══════════════════════════════════════════════════════ */
