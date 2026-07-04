'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  type WeeklyProgram,
  type WeeklyProgramListItem,
  type HomeworkPoolItem,
  type ProgramDay,
  type ProgramBlock,
  type WeeklySummary,
  type BlockType,
  type GoalType,
  type Priority,
  BLOCK_TYPE_META,
  GOAL_TYPE_META,
  PRIORITY_META,
  fetchPrograms,
  fetchProgram,
  createProgram,
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
} from '@/lib/study-program-api';
import { fetchCoaches, fetchCoachStudents, type Coach, type CoachStudent } from '@/lib/coaching-api';

import HomeworkPoolCard from '@/components/admin/coaching/study-program/HomeworkPoolCard';
import DayColumn from '@/components/admin/coaching/study-program/DayColumn';
import DailyFeedbackForm from '@/components/admin/coaching/study-program/DailyFeedbackForm';
import BadgeDisplay from '@/components/admin/coaching/study-program/BadgeDisplay';
import WeeklySummaryCard from '@/components/admin/coaching/study-program/WeeklySummaryCard';
import SplitModal from '@/components/admin/coaching/study-program/SplitModal';
import BlockEditModal from '@/components/admin/coaching/study-program/BlockEditModal';
import StudyProgramPrintPreview from '@/components/admin/coaching/study-program/StudyProgramPrintPreview';
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';

export interface StudyProgramEditorProps {
  lockedStudentId?: number;
  lockedCoachId?: number;
  embedded?: boolean;
}

/* ═══════════════════════════════════════════════════════
   YARDIMCI FONKSİYONLAR
   ═══════════════════════════════════════════════════════ */

function formatDate(d: Date): string {
  // toISOString() UTC kullanır ve timezone farkı yüzünden 1 gün geri kayabilir
  // Yerel tarih kullan
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShortTR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
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
  embedded = false,
}: StudyProgramEditorProps) {
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

  // Süresi dolmuş program kilidi
  const isExpired = program ? isProgramExpired(program) : false;

  // Ödev havuzu
  const [homeworkPool, setHomeworkPool] = useState<HomeworkPoolItem[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolFilter, setPoolFilter] = useState<{ status: string; search: string }>({
    status: '',
    search: '',
  });

  // Haftalık özet
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Şablon
  const [templates, setTemplates] = useState<WeeklyProgramListItem[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Feedback paneli
  const [feedbackDayId, setFeedbackDayId] = useState<number | null>(null);

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

  // Drag state
  const [draggingHomework, setDraggingHomework] = useState<HomeworkPoolItem | null>(null);

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
            showTemplateModal ||
            feedbackDayId !== null)
      ),
    [
      selectedStudent,
      program,
      newWeekStart,
      newWeekEnd,
      splitModalOpen,
      editingBlock,
      showTemplateModal,
      feedbackDayId,
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
        console.log('[StudyProgram] fetchCoaches response:', res);
        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data as any).results || [];
          setCoaches(list);
        } else {
          console.warn('[StudyProgram] fetchCoaches failed:', res.error);
          setError(res.error || 'Koç listesi yüklenemedi. Lütfen giriş yaptığınızdan emin olun.');
        }
      } catch (err) {
        console.error('[StudyProgram] fetchCoaches exception:', err);
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
        console.log('[StudyProgram] fetchCoachStudents response:', res);
        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data as any).results || [];
          setStudents(list);
          if (!lockedStudentId) setSelectedStudent(null);
        } else {
          console.warn('[StudyProgram] fetchCoachStudents failed:', res.error);
        }
      } catch (err) {
        console.error('[StudyProgram] fetchCoachStudents exception:', err);
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
    setProgram(null);
  }, [loadStudentPrograms]);

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
  const handleSelectProgram = async (programId: number) => {
    setLoading(true);
    try {
      const detail = await fetchProgram(programId);
      if (detail.success && detail.data) {
        setProgram(detail.data);
      }
    } catch {
      setError('Program yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Ödev havuzu yükle
  const loadHomeworkPool = useCallback(async () => {
    if (!selectedStudent) return;
    setPoolLoading(true);
    try {
      const res = await fetchHomeworkPool({
        student_id: selectedStudent,
        program_id: program?.id,
        status: poolFilter.status || undefined,
      });
      if (res.success && res.data) {
        let items = Array.isArray(res.data) ? res.data : [];
        if (poolFilter.search) {
          const q = poolFilter.search.toLowerCase();
          items = items.filter(
            (h) =>
              h.title.toLowerCase().includes(q) ||
              (h.lesson_name || '').toLowerCase().includes(q) ||
              h.topic_name.toLowerCase().includes(q)
          );
        }
        setHomeworkPool(items);
      }
    } catch { /* ignore */ } finally {
      setPoolLoading(false);
    }
  }, [selectedStudent, program?.id, poolFilter]);

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
        const isExisting = !!(res.data as any).total_block_count;
        showToast(isExisting ? 'Mevcut program yüklendi!' : 'Yeni çalışma programı oluşturuldu!');
        loadHomeworkPool();
        loadStudentPrograms(); // listeyi güncelle
        setNewWeekStart('');
        setNewWeekEnd('');
      } else {
        showToast(res.error || 'Program oluşturulamadı', 'error');
      }
    } catch {
      showToast('Bir hata oluştu', 'error');
    } finally {
      setLoading(false);
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
      const res = await createBlock({
        day: dayId,
        source_assignment: item.id,
        source_lesson: item.lesson_id,
        title: item.title,
        topic_name: item.topic_name || '',
        resource_name: item.resource_name || '',
        block_type: 'SORU_COZUMU' as BlockType,
        question_count: item.question_count || 0,
        priority: (item.priority as any) || 'MEDIUM',
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

  // Koç notu kaydet
  const handleCoachNoteSave = async (dayId: number, note: string) => {
    try {
      const res = await updateDay(dayId, { coach_note: note });
      if (res.success) {
        showToast('Koç notu kaydedildi');
        // Lokal program state'ini güncelle (tam reload gerekmez)
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
      title: block.title,
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
      title: item.title,
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
    <div style={{ padding: 0, minHeight: embedded ? 'auto' : '100vh' }}>
      {/* ─── HERO HEADER ─── */}
      {!embedded && (
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
            onChange={(e) => setSelectedStudent(Number(e.target.value) || null)}
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

        {/* Aktif program tarih aralığı göstergesi */}
        {program && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginLeft: 'auto' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                📅 Aktif Program
              </label>
              <div style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: isExpired ? '2px solid #fca5a5' : '1px solid #e5e7eb',
                backgroundColor: isExpired ? '#fef2f2' : '#fff',
                fontSize: '13px',
                fontWeight: 600,
                color: isExpired ? '#dc2626' : '#374151',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                {isExpired && <span>🔒</span>}
                {formatDateShortTR(program.week_start)} — {formatDateShortTR(program.week_end)}
                {isExpired && <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>SÜRESİ DOLMUŞ</span>}
                <button
                  onClick={() => setProgram(null)}
                  style={{
                    background: 'none', border: 'none', fontSize: '16px',
                    cursor: 'pointer', color: '#9ca3af', marginLeft: '4px',
                  }}
                  title="Programa dön"
                >×</button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ─── Hata ─── */}
      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
          ❌ {error}
          {error.includes('giriş') && (
            <div style={{ marginTop: '8px' }}>
              <a
                href="http://localhost:8000/admin/"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'underline' }}
              >
                Django Admin&apos;den giriş yapın →
              </a>
            </div>
          )}
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
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Ödev verilme ve kontrol tarihlerine göre başlangıç/bitiş belirleyin</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  Başlangıç Tarihi
                </label>
                <input
                  type="date"
                  value={newWeekStart}
                  onChange={(e) => {
                    setNewWeekStart(e.target.value);
                    if (!newWeekEnd || e.target.value > newWeekEnd) {
                      // Otomatik 6 gün ekle
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
                  Bitiş Tarihi
                </label>
                <input
                  type="date"
                  value={newWeekEnd}
                  onChange={(e) => setNewWeekEnd(e.target.value)}
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
                ＋ Oluştur
              </button>
              {templates.length > 0 && (
                <button
                  onClick={() => setShowTemplateModal(true)}
                  style={{
                    fontSize: '12px', color: '#3b82f6', background: 'none',
                    border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  📋 Şablondan
                </button>
              )}
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
                  {formatDateShortTR(program.week_start)} – {formatDateShortTR(program.week_end)} aralığı geçmiş. Düzenleme devre dışı.
                </div>
              </div>
            </div>
          )}

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
            <button onClick={handleAutoDistribute} disabled={isExpired} style={toolbarBtnStyle('#8b5cf6')}>
              🎯 Ödevleri Dağıt
            </button>
            <button onClick={handleRedistribute} disabled={isExpired} style={toolbarBtnStyle('#7c3aed')}>
              ⚖️ Dengeli Dağıt
            </button>
            <button onClick={handleResetProgram} disabled={isExpired} style={toolbarBtnStyle('#ef4444')}>
              🔄 Sıfırla
            </button>
            <button onClick={handleCalcBadges} style={toolbarBtnStyle('#f59e0b')}>
              🏆 Rozet Hesapla
            </button>
            <button onClick={handleShowSummary} style={toolbarBtnStyle('#06b6d4')}>
              📊 Haftalık Özet
            </button>
            <button onClick={() => setShowTemplateModal(true)} style={toolbarBtnStyle('#22c55e')}>
              📋 Şablon
            </button>
            <button onClick={handleShowPastPrograms} style={toolbarBtnStyle('#64748b')}>
              📜 Geçmiş
            </button>
            <button onClick={handlePrintPDF} style={toolbarBtnStyle('#0ea5e9')}>
              🖨️ Yazdır
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* İstatistik chip'ler */}
              <span style={chipStyle('#eff6ff', '#3b82f6')}>
                📝 {program.total_question_count} soru
              </span>
              <span style={chipStyle('#f0fdf4', '#22c55e')}>
                ✅ %{program.completion_percent}
              </span>
              <span style={chipStyle('#fef3c7', '#f59e0b')}>
                📦 {program.total_block_count} blok
              </span>
              <button onClick={handleDeleteProgram} style={{ ...toolbarBtnStyle('#ef4444'), padding: '6px 12px' }} title="Programı Sil">
                🗑️
              </button>
            </div>
          </div>

          {/* ─── Split Layout ─── */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {/* ───── SOL PANEL: ÖDEV HAVUZU ───── */}
            <div
              style={{
                width: '280px',
                minWidth: '260px',
                flexShrink: 0,
                backgroundColor: '#fff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                maxHeight: 'calc(100vh - 260px)',
                display: 'flex',
                flexDirection: 'column',
                ...(isExpired ? { opacity: 0.5, pointerEvents: 'none' as const } : {}),
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid #e5e7eb',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>📚 Ödev Havuzu</h3>
                <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px' }}>
                  Sürükle → Takvime bırak
                </div>
              </div>

              {/* Filtreler */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
                <input
                  type="text"
                  placeholder="Ara..."
                  value={poolFilter.search}
                  onChange={(e) => setPoolFilter((f) => ({ ...f, search: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    fontSize: '12px',
                    outline: 'none',
                    marginBottom: '6px',
                  }}
                />
                <select
                  value={poolFilter.status}
                  onChange={(e) => setPoolFilter((f) => ({ ...f, status: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    fontSize: '12px',
                    backgroundColor: '#fff',
                  }}
                >
                  <option value="">Tüm Durumlar</option>
                  <option value="unplanned">Planlanmamış</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="PENDING">Beklemede</option>
                  <option value="OVERDUE">Gecikmiş</option>
                </select>
              </div>

              {/* Ödev listesi */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {poolLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>
                    Yükleniyor...
                  </div>
                ) : homeworkPool.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 12px', color: '#9ca3af' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
                    <div style={{ fontSize: '12px' }}>Havuzda ödev yok</div>
                  </div>
                ) : (
                  homeworkPool.map((hw) => (
                    <HomeworkPoolCard
                      key={`${hw.id}-${hw.lesson_id ?? 'all'}`}
                      item={hw}
                      onDragStart={(e, item) => {
                        e.dataTransfer.setData('homework-pool-item', JSON.stringify(item));
                        setDraggingHomework(item);
                      }}
                      onSplit={program ? handleOpenSplitHomework : undefined}
                    />
                  ))
                )}
              </div>

              <div style={{ padding: '8px 12px', borderTop: '1px solid #f3f4f6', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
                {homeworkPool.length} ödev
              </div>
            </div>

            {/* ───── SAĞ PANEL: GÜNLÜK TAKVİM ───── */}
            <div style={{ flex: 1, overflowX: 'auto', ...(isExpired ? { opacity: 0.7, pointerEvents: 'none' as const } : {}) }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min((program.days || []).length, 7)}, minmax(150px, 1fr))`,
                  gap: '8px',
                }}
              >
                {(program.days || [])
                  .sort((a, b) => new Date(a.day_date).getTime() - new Date(b.day_date).getTime())
                  .map((day) => (
                    <DayColumn
                      key={day.id}
                      day={day}
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
            </div>
          </div>

          {/* ───── ALT PANEL: ROZETLER + ÖNCELİK DAĞILIMI ───── */}
          <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <BadgeDisplay
              badges={program.badges || []}
              completionPercent={program.completion_percent}
            />
            {showSummary && (
              <WeeklySummaryCard summary={summary} loading={summaryLoading} />
            )}

            {/* Öncelik Dağılımı Kartı */}
            {(() => {
              const allBlocks = (program.days || []).flatMap((d) => d.blocks);
              const priCounts: Record<string, number> = {};
              for (const b of allBlocks) {
                const key = b.priority || 'MEDIUM';
                priCounts[key] = (priCounts[key] || 0) + 1;
              }
              const total = allBlocks.length || 1;
              return (
                <div style={{
                  backgroundColor: '#fff', borderRadius: '12px',
                  border: '1px solid #e5e7eb', padding: '16px',
                }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                    📊 Haftalık Öncelik Dağılımı
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                      const pm = PRIORITY_META[p];
                      const count = priCounts[p] || 0;
                      const pctVal = Math.round((count / total) * 100);
                      return (
                        <div key={p}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: pm.color }}>
                              {pm.icon} {pm.label}
                            </span>
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>
                              {count} blok ({pctVal}%)
                            </span>
                          </div>
                          <div style={{
                            width: '100%', height: '6px', backgroundColor: '#f3f4f6',
                            borderRadius: '99px', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${pctVal}%`, height: '100%',
                              backgroundColor: pm.color, borderRadius: '99px',
                              transition: 'width .4s',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         MODALLER
         ═══════════════════════════════════════════════════════ */}

      {/* Feedback paneli */}
      {feedbackDayId && program && (
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
          onClick={() => setFeedbackDayId(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              width: '420px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px rgba(0,0,0,.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>📝 Günlük Geri Bildirim</h3>
              <button onClick={() => setFeedbackDayId(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            {(() => {
              const day = program.days.find((d) => d.id === feedbackDayId);
              if (!day) return <div>Gün bulunamadı</div>;
              return (
                <DailyFeedbackForm
                  dayId={day.id}
                  feedback={day.feedback}
                  onSave={(dId, data) => {
                    import('@/lib/study-program-api').then(({ saveFeedback }) => {
                      saveFeedback({ day: dId, ...data }).then(() => {
                        reloadCurrentProgram();
                        showToast('Geri bildirim kaydedildi!');
                      });
                    });
                  }}
                />
              );
            })()}
          </div>
        </div>
      )}

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
