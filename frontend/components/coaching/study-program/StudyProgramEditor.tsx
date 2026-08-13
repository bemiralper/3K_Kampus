'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  type WeeklyProgram,
  type WeeklyProgramListItem,
  type HomeworkPoolItem,
  type ProgramBlock,
  type WeeklySummary,
  type BlockType,
  fetchPrograms,
  fetchProgram,
  createProgram,
  updateProgram,
  autoDistribute,
  fetchHomeworkPool,
  fetchSummary,
  calculateBadges,
  saveAsTemplate,
  applyTemplate,
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
  redistributeBlocks,
  WEEKDAY_LABELS,
} from '@/lib/study-program-api';
import { fetchCoaches, fetchCoachStudents, type Coach, type CoachStudent } from '@/lib/coaching-api';

import HomeworkPoolCard from '@/components/admin/coaching/study-program/HomeworkPoolCard';
import DayColumn from '@/components/admin/coaching/study-program/DayColumn';
import BadgeDisplay from '@/components/admin/coaching/study-program/BadgeDisplay';
import WeeklySummaryCard from '@/components/admin/coaching/study-program/WeeklySummaryCard';
import SplitModal from '@/components/admin/coaching/study-program/SplitModal';
import BlockEditModal from '@/components/admin/coaching/study-program/BlockEditModal';
import StudyProgramPrintPreview from '@/components/admin/coaching/study-program/StudyProgramPrintPreview';
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';
import { lessonAccent, primaryBlockLabel } from '@/components/admin/coaching/study-program/blockDisplay';
import { stripCompletionTitleSuffix } from '@/components/odev/odevCompletionHelpers';
import {
  addDays,
  datesFromHomework,
  formatDateLocal as formatDate,
  inclusiveDayCount,
  isControlDay,
  studyRangeEnd,
  toDateInputValue,
} from '@/components/coaching/study-program/programDateUtils';
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

  /** Sol panel: ders başlığı altında grupla */
  const poolByLesson = useMemo(() => {
    const map = new Map<string, HomeworkPoolItem[]>();
    for (const hw of homeworkPool) {
      const key = hw.lesson_name?.trim() || 'Diğer';
      const list = map.get(key) || [];
      list.push(hw);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [homeworkPool]);

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
    if (out.length === 0) {
      for (const hw of homeworkPool) {
        const t = stripCompletionTitleSuffix(hw.title);
        if (!t) continue;
        const key = t.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
    }
    return out;
  }, [program, homeworkPool]);

  /** Gün → ders özeti (takvim üstü) — yalnızca ders adı; kontrol günü yok */
  const dayLessonSummary = useMemo(() => {
    if (!program) return [] as Array<{ dayLabel: string; lessons: string[]; date: string }>;
    return [...(program.days || [])]
      .sort((a, b) => a.day_date.localeCompare(b.day_date))
      .filter((day) => !isControlDay(day.day_date, program.week_end))
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

  // Haftalık özet
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Şablon
  const [templates, setTemplates] = useState<WeeklyProgramListItem[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // İkincil araçlar (şablon, rozet, özet, geçmiş)
  const [showMoreActions, setShowMoreActions] = useState(false);

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

  // Geçmiş programlar
  const [showPastPrograms, setShowPastPrograms] = useState(false);
  const [pastPrograms, setPastPrograms] = useState<WeeklyProgramListItem[]>([]);
  const [pastProgramsLoading, setPastProgramsLoading] = useState(false);

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
            editingBlock ||
            showTemplateModal)
      ),
    [
      selectedStudent,
      program,
      newWeekStart,
      newWeekEnd,
      splitModalOpen,
      editingBlock,
      showTemplateModal,
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

  // Şablonları yükle
  useEffect(() => {
    (async () => {
      const res = await fetchPrograms({ is_template: true });
      if (res.success && res.data) setTemplates(res.data);
    })();
  }, []);

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

  // Dengeli dağıt
  const handleAutoDistribute = async () => {
    if (!program || isExpired) return;
    try {
      const res = await autoDistribute(program.id);
      if (res.success) {
        const count = (res.data as any)?.distributed ?? 0;
        if (count === 0) {
          showToast('ℹ️ Dağıtılacak yeni ödev bulunamadı — tüm ödevler zaten programa atanmış.', 'error');
        } else {
          showToast(`✅ ${count} ödev günlere dengeli şekilde dağıtıldı!`);
        }
        reloadCurrentProgram();
        loadHomeworkPool();
      } else {
        showToast(res.error || 'Dağıtım başarısız', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
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

  // Dengeli yeniden dağıt (mevcut blokları dengele)
  const handleRedistribute = async () => {
    if (!program || isExpired) return;
    if (!confirm('Mevcut bloklar günlere dengeli şekilde yeniden dağıtılacak. Devam?')) return;
    try {
      const res = await redistributeBlocks(program.id);
      if (res.success && res.data) {
        setProgram(res.data.program);
        if (res.data.redistributed === 0) {
          showToast('ℹ️ Yeniden dağıtılacak blok bulunamadı — program boş.', 'error');
        } else {
          showToast(`✅ ${res.data.redistributed} blok dengeli şekilde yeniden dağıtıldı!`);
        }
      } else {
        showToast(res.error || 'Dağıtım başarısız', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Haftalık özet
  const handleShowSummary = async () => {
    if (!program) return;
    setSummaryLoading(true);
    setShowSummary(true);
    try {
      const res = await fetchSummary(program.id);
      if (res.success && res.data) setSummary(res.data);
    } catch { /* ignore */ } finally {
      setSummaryLoading(false);
    }
  };

  // Rozet hesapla
  const handleCalcBadges = async () => {
    if (!program) return;
    try {
      const res = await calculateBadges(program.id);
      if (res.success) {
        showToast('Rozetler hesaplandı!');
        reloadCurrentProgram();
      }
    } catch { /* ignore */ }
  };

  // Şablon kaydet
  const handleSaveTemplate = async () => {
    if (!program || !templateName.trim()) return;
    try {
      const res = await saveAsTemplate(program.id, templateName.trim());
      if (res.success) {
        showToast('Şablon kaydedildi!');
        setShowTemplateModal(false);
        setTemplateName('');
        // Şablon listesini güncelle
        const tRes = await fetchPrograms({ is_template: true });
        if (tRes.success && tRes.data) setTemplates(tRes.data);
      } else {
        showToast(res.error || 'Şablon kaydedilemedi', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    }
  };

  // Şablon uygula
  const handleApplyTemplate = async (templateId: number) => {
    if (!program) return;
    try {
      const res = await applyTemplate(program.id, templateId);
      if (res.success && res.data) {
        setProgram(res.data);
        showToast('Şablon başarıyla uygulandı!');
      } else {
        showToast(res.error || 'Şablon uygulanamadı', 'error');
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

  // Geçmiş programları yükle ve göster
  const handleShowPastPrograms = async () => {
    if (!selectedStudent) return;
    setShowPastPrograms(true);
    setPastProgramsLoading(true);
    try {
      const res = await fetchPrograms({ student_id: selectedStudent });
      if (res.success && res.data) {
        setPastPrograms(res.data.filter(p => !p.is_template));
      }
    } catch { /* ignore */ } finally {
      setPastProgramsLoading(false);
    }
  };

  // Geçmiş programa git
  const handleGoToPastProgram = (p: WeeklyProgramListItem) => {
    handleSelectProgram(p.id);
    setShowPastPrograms(false);
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
        showToast('Ödev takvime eklendi!');
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
      if (res.success) reloadCurrentProgram();
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
      {/* ─── HERO HEADER ─── */}
      {!embedded && !coachLayout && (
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Çalışma Programı</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <a href="/admin/coaching/coaches">Koçluk</a>
              <span>/</span>
              <span>Çalışma Programı</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ─── KOÇ + ÖĞRENCİ SEÇİCİ ─── */}
      {!(lockedCoachId && lockedStudentId) && (
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Koç seçici */}
        <div style={{ minWidth: '200px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            👨‍🏫 Koç
          </label>
          <select
            value={selectedCoach ?? ''}
            onChange={(e) => setSelectedCoach(Number(e.target.value) || null)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">Koç seçin</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.teacher_full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Öğrenci seçici */}
        <div style={{ minWidth: '220px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            🎓 Öğrenci
          </label>
          <select
            value={selectedStudent ?? ''}
            onChange={(e) => {
              setSelectedStudent(Number(e.target.value) || null);
              setNewWeekStart('');
              setNewWeekEnd('');
              setDateSourceHomeworkId(null);
            }}
            disabled={!selectedCoach || students.length === 0}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '14px',
              backgroundColor: !selectedCoach ? '#f3f4f6' : '#fff',
            }}
          >
            <option value="">{!selectedCoach ? 'Önce koç seçin' : students.length === 0 ? 'Öğrenci yok' : 'Öğrenci seçin'}</option>
            {students.map((s) => (
              <option key={s.student_id ?? s.student} value={s.student_id ?? s.student}>
                {s.student_full_name}
              </option>
            ))}
          </select>
        </div>

        {program && (
          <div style={{
            marginLeft: 'auto', padding: '8px 12px', borderRadius: '8px',
            border: isExpired ? '2px solid #fca5a5' : '1px solid #e5e7eb',
            backgroundColor: isExpired ? '#fef2f2' : '#fff',
            fontSize: '13px', fontWeight: 600, color: isExpired ? '#dc2626' : '#374151',
          }}>
            📅 {formatDateShortTR(program.week_start)} — {formatDateShortTR(program.week_end)}
            {isExpired && ' · süresi dolmuş'}
          </div>
        )}
      </div>
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
                          {' '}(son gün kontrol
                          {assigned ? `; verilme ${formatDateShortTR(assigned)} ertesi başlar` : ''})
                          {studyDays > 0 ? ` · ${studyDays} çalışma + 1 kontrol` : ''}
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
                  Ödeve tıklayarak doldurun veya tarihleri manuel seçin
                  {dateSourceHomeworkId ? ' · ödevden dolduruldu' : ''}
                  {' · '}Ödev Pzt → program Salı başlar, kontrol haftaya Pzt
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
                    setNewWeekStart(e.target.value);
                    setDateSourceHomeworkId(null);
                    if (!newWeekEnd || e.target.value > newWeekEnd) {
                      // Salı…Pzt → kontrol = ilk çalışma + 6
                      const d = new Date(e.target.value + 'T12:00:00');
                      setNewWeekEnd(formatDate(addDays(d, 6)));
                    }
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
                    setNewWeekEnd(e.target.value);
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

          {/* ─── Tarih aralığı (koç portalı / gömülü görünümde de görünür) ─── */}
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'flex-end',
            padding: '12px 14px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0',
          }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                İlk çalışma günü
              </label>
              <input
                type="date"
                value={editWeekStart}
                onChange={(e) => setEditWeekStart(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                Kontrol günü (son gün)
              </label>
              <input
                type="date"
                value={editWeekEnd}
                onChange={(e) => setEditWeekEnd(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
              />
            </div>
            <button
              onClick={() => handleUpdateDateRange(false)}
              disabled={!rangeDirty || rangeSaving || !editWeekStart || !editWeekEnd}
              style={{
                padding: '8px 14px', borderRadius: '8px', border: 'none',
                backgroundColor: rangeDirty ? '#2563eb' : '#e5e7eb',
                color: rangeDirty ? '#fff' : '#9ca3af',
                fontSize: '12px', fontWeight: 600,
                cursor: rangeDirty && !rangeSaving ? 'pointer' : 'not-allowed',
              }}
            >
              {rangeSaving ? 'Kaydediliyor…' : 'Aralığı Kaydet'}
            </button>
            <button
              onClick={() => setProgram(null)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
                backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#6b7280', cursor: 'pointer',
              }}
            >
              ← Programlar
            </button>
          </div>

          {/* ─── Toolbar ─── */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              flexWrap: 'wrap',
              alignItems: 'center',
              ...(isExpired ? { opacity: 0.5, pointerEvents: 'none' as const } : {}),
            }}
          >
            <button onClick={handleAutoDistribute} disabled={isExpired} style={toolbarBtnStyle('#1f3c88')}>
              Ödevleri Dağıt
            </button>
            <button onClick={handlePrintPDF} style={toolbarBtnStyle('#0ea5e9')}>
              Yazdır
            </button>
            <button
              type="button"
              onClick={() => setShowMoreActions((v) => !v)}
              style={toolbarBtnStyle('#64748b')}
            >
              {showMoreActions ? 'Daha az' : 'Daha fazla'}
            </button>
            {showMoreActions && (
              <>
                <button onClick={handleRedistribute} disabled={isExpired} style={toolbarBtnStyle('#7c3aed')}>
                  Dengeli Dağıt
                </button>
                <button onClick={handleResetProgram} disabled={isExpired} style={toolbarBtnStyle('#ef4444')}>
                  Sıfırla
                </button>
                <button onClick={handleCalcBadges} style={toolbarBtnStyle('#f59e0b')}>
                  Rozet Hesapla
                </button>
                <button onClick={handleShowSummary} style={toolbarBtnStyle('#06b6d4')}>
                  Haftalık Özet
                </button>
                <button onClick={() => setShowTemplateModal(true)} style={toolbarBtnStyle('#22c55e')}>
                  Şablon
                </button>
                <button onClick={handleShowPastPrograms} style={toolbarBtnStyle('#64748b')}>
                  Geçmiş
                </button>
              </>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={chipStyle('#eff6ff', '#3b82f6')}>
                {program.total_question_count} soru
              </span>
              <span style={chipStyle('#f0fdf4', '#22c55e')}>
                %{program.completion_percent}
              </span>
              <span style={chipStyle('#fef3c7', '#f59e0b')}>
                {program.total_block_count} çalışma
              </span>
              <button onClick={handleDeleteProgram} style={{ ...toolbarBtnStyle('#ef4444'), padding: '6px 12px' }} title="Programı Sil">
                Sil
              </button>
            </div>
          </div>

          {/* Haftalık koç notu — PDF'te görünür */}
          <div
            style={{
              marginBottom: 12,
              padding: '10px 14px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                📌 Haftalık Koç Notu
                <span style={{ fontWeight: 500, color: '#b45309', marginLeft: 6 }}>
                  (PDF&apos;te görünür)
                </span>
              </div>
              <textarea
                value={weekCoachNote}
                onChange={(e) => setWeekCoachNote(e.target.value)}
                disabled={isExpired}
                rows={2}
                placeholder="Bu hafta özellikle… (ör. matematik soru hızı, fizik konu tekrarı)"
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: 52,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #fcd34d',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: '#78350f',
                  background: '#fffef7',
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleWeekCoachNoteSave}
              disabled={isExpired || weekNoteSaving || weekCoachNote === (program.coach_note || '')}
              style={{
                ...toolbarBtnStyle('#b45309'),
                alignSelf: 'flex-end',
                opacity:
                  isExpired || weekNoteSaving || weekCoachNote === (program.coach_note || '')
                    ? 0.5
                    : 1,
                cursor:
                  isExpired || weekNoteSaving || weekCoachNote === (program.coach_note || '')
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {weekNoteSaving ? '…' : 'Kaydet'}
            </button>
          </div>

          {/* ─── Split Layout ─── */}
          <div className="sp-board-split">
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
                    {homeworkPool.length} içerik
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
                ) : homeworkPool.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 12px', color: '#94a3b8' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                      Tüm içerikler planlandı
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Takvimden kaldırınca buraya döner.
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
                          {items.map((hw) => (
                            <HomeworkPoolCard
                              key={`${hw.id}-${hw.lesson_id ?? 'all'}-${hw.topic_name}`}
                              item={hw}
                              hideLessonName
                              onDragStart={(e, item) => {
                                e.dataTransfer.setData('homework-pool-item', JSON.stringify(item));
                              }}
                              onSplit={program ? handleOpenSplitHomework : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ───── SAĞ PANEL: ÖZET + TAKVİM ───── */}
            <div
              className="sp-calendar-panel"
              style={{ ...(isExpired ? { opacity: 0.7, pointerEvents: 'none' as const } : {}) }}
            >
              {/* Gün–ders özeti */}
              <div style={{
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

              <div className="sp-day-grid-scroll">
                {(() => {
                  const daysForBoard = [...(program.days || [])].sort((a, b) =>
                    a.day_date.localeCompare(b.day_date),
                  );
                  return (
                    <div
                      className="sp-day-grid"
                      style={{
                        ['--sp-day-count' as string]: Math.max(daysForBoard.length, 1),
                      }}
                    >
                      {daysForBoard.map((day) => (
                        <DayColumn
                          key={day.id}
                          day={day}
                          isControlDay={isControlDay(day.day_date, program.week_end)}
                          onToggleComplete={handleToggleComplete}
                          onDeleteBlock={handleDeleteBlock}
                          onEditBlock={(block) => setEditingBlock(block)}
                          onDropHomework={(dayId, item) => handleDropHomework(dayId, item)}
                          onDropBlock={(dayId, block) => handleMoveBlock(block.id, dayId)}
                          onDragBlockStart={(e, block) => {
                            e.dataTransfer.setData('program-block', JSON.stringify(block));
                          }}
                          onReorderBlocks={handleReorderBlocks}
                          onCoachNoteChange={handleCoachNoteSave}
                          onSplitBlock={handleOpenSplitBlock}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Alt: yalnızca rozet/özet istendiğinde */}
          {((program.badges && program.badges.length > 0) || showSummary) && (
            <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {(program.badges?.length ?? 0) > 0 && (
                <BadgeDisplay
                  badges={program.badges || []}
                  completionPercent={program.completion_percent}
                />
              )}
              {showSummary && (
                <WeeklySummaryCard summary={summary} loading={summaryLoading} />
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         MODALLER
         ═══════════════════════════════════════════════════════ */}

      {/* Şablon modal */}
      {showTemplateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              width: '460px',
              maxWidth: '90vw',
              boxShadow: '0 25px 50px rgba(0,0,0,.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>📋 Şablon Yönetimi</h3>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>

            {/* Şablon kaydet (program varsa) */}
            {program && (
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#059669', marginBottom: '8px' }}>
                  Mevcut Haftayı Şablon Olarak Kaydet
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Şablon adı..."
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: templateName.trim() ? '#22c55e' : '#d1d5db',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: templateName.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            )}

            {/* Mevcut şablonlar */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                Kayıtlı Şablonlar
              </div>
              {templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>
                  Henüz şablon yok
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                          {t.template_name || 'İsimsiz Şablon'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {t.total_block_count} blok · {t.total_question_count} soru
                        </div>
                      </div>
                      {program && (
                        <button
                          onClick={() => handleApplyTemplate(t.id)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#3b82f6',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Uygula
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
         GEÇMİŞ PROGRAMLAR PANELİ
         ═══════════════════════════════════════════════════════ */}
      {showPastPrograms && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowPastPrograms(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              width: '520px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px rgba(0,0,0,.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>📜 Geçmiş Programlar</h3>
              <button onClick={() => setShowPastPrograms(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>

            {pastProgramsLoading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>⏳ Yükleniyor...</div>
            ) : pastPrograms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '14px' }}>
                Bu öğrenci için henüz program oluşturulmamış.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pastPrograms
                  .sort((a, b) => b.week_start.localeCompare(a.week_start))
                  .map((p) => {
                    const isCurrentProgram = program?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          backgroundColor: isCurrentProgram ? '#eff6ff' : '#f9fafb',
                          borderRadius: '10px',
                          border: `1px solid ${isCurrentProgram ? '#93c5fd' : '#e5e7eb'}`,
                          cursor: 'pointer',
                          transition: 'all .15s',
                        }}
                        onClick={() => handleGoToPastProgram(p)}
                      >
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                            📅 {formatDateShortTR(p.week_start)} — {formatDateShortTR(p.week_end)}
                            {isCurrentProgram && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#3b82f6', fontWeight: 700 }}>← Aktif</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            📦 {p.total_block_count} blok · 📝 {p.total_question_count} soru · ✅ %{p.completion_percent}
                          </div>
                        </div>
                        <span style={{ fontSize: '18px', color: '#9ca3af' }}>→</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
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

function toolbarBtnStyle(color: string): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: color,
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'opacity .15s',
  };
}

function chipStyle(bg: string, clr: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: '20px',
    backgroundColor: bg,
    color: clr,
    fontSize: '12px',
    fontWeight: 600,
  };
}
