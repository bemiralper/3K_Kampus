'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';
import { StudentStep, AssignmentStep, ReviewStep, PrintPreview } from '@/app/admin/odev/ver/components';
import type {
  Student,
  StudentResource,
  BookDetails,
  Content,
  Topic,
  Unit,
  SelectedContent,
  ContentTaskHistory,
} from '@/app/admin/odev/ver/types';
import {
  fetchOgrenciList,
  fetchStudentResourcesByStudent,
  fetchStudentResourceDetail,
  fetchContentTaskHistory,
  fetchBookStructure,
  createAssignment,
  fetchAssignmentPackage,
  incrementPackageUsage,
  type AssignmentPackageItem,
} from '@/lib/resources-api';
import AssignmentNotifySendModal from '@/components/odev/AssignmentNotifySendModal';

export type OdevVerVariant = 'admin' | 'coach';

interface OdevVerWizardProps {
  variant?: OdevVerVariant;
}

/* ─── Full photo URL helper ─── */
function getPhotoUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return path;
}

/* ─── Auto weekly title helper ─── */
function generateWeeklyTitle(): string {
  const now = new Date();
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  const month = months[now.getMonth()];
  const day = now.getDate();
  const weekNum = Math.ceil(day / 7);
  return `${month} Ayı ${weekNum}. Hafta Ödevi`;
}

/* ─── Default due date: 1 week from now ─── */
function getDefaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

function mapPackageItemsToCart(items: AssignmentPackageItem[]): SelectedContent[] {
  return items.map(item => ({
    id: item.content_id,
    contentId: item.content_id,
    contentName: item.content_name,
    contentType: item.content_type,
    topicId: 0,
    topicName: item.topic_name || '',
    unitId: 0,
    unitName: item.unit_name || '',
    bookId: item.book_id,
    bookName: item.book_name,
    lessonId: 0,
    lessonName: '',
    questionCount: item.question_count || null,
    pageCount: item.page_start && item.page_end ? item.page_end - item.page_start + 1 : null,
    startPage: item.page_start || null,
    endPage: item.page_end || null,
  }));
}

/* ─── Step Definitions ─── */
const STEPS = [
  { id: 1, label: 'Öğrenci Seçimi', icon: '👤' },
  { id: 2, label: 'Ödev İçeriği', icon: '📚' },
  { id: 3, label: 'Önizleme & Gönder', icon: '📋' },
];

export default function OdevVerWizard({ variant = 'admin' }: OdevVerWizardProps) {
  const { user } = useAuth();
  const coachName = user ? `${user.first_name} ${user.last_name}` : '';
  const mainRef = useRef<HTMLDivElement>(null);
  const isCoach = variant === 'coach';

  /* ─── Step State ─── */
  const [currentStep, setCurrentStep] = useState(1);

  /* ─── Data ─── */
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [resources, setResources] = useState<StudentResource[]>([]);
  const [selectedResource, setSelectedResource] = useState<StudentResource | null>(null);
  const [bookDetails, setBookDetails] = useState<BookDetails | null>(null);
  const [cart, setCart] = useState<SelectedContent[]>([]);
  const [contentNotes, setContentNotes] = useState<Record<number, string>>({});
  const [resLoading, setResLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [taskHistory, setTaskHistory] = useState<ContentTaskHistory>({});

  /* ─── Paketten gelen bekleyen veriler ─── */
  const [pendingPackageCart, setPendingPackageCart] = useState<SelectedContent[] | null>(null);
  const [pendingPackageTitle, setPendingPackageTitle] = useState<string | null>(null);
  const [packageTemplateId, setPackageTemplateId] = useState<number | null>(null);

  /* ─── Review Form ─── */
  const [title, setTitle] = useState(generateWeeklyTitle());
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [priority, setPriority] = useState('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [savedAssignmentId, setSavedAssignmentId] = useState<number | null>(null);
  const [showSendAfterSave, setShowSendAfterSave] = useState(false);

  /* ─── Toast ─── */
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  /* ─── URL query param ile öğrenci / paket oto-seçimi ─── */
  const searchParams = useSearchParams();
  const preselectedStudentId = searchParams.get('student');
  const packageIdParam = searchParams.get('package_id');
  const returnHref = searchParams.get('return');
  const studentLocked = searchParams.get('locked') === '1' || (isCoach && !!preselectedStudentId);
  const [autoSelected, setAutoSelected] = useState(false);
  const [packageLoaded, setPackageLoaded] = useState(false);

  /* ─── Fetch students on mount ─── */
  useEffect(() => {
    (async () => {
      try {
        const result = await fetchOgrenciList();
        if (result.success && result.data) {
          setStudents(result.data as Student[]);
        }
      } catch { /* silent */ }
      finally {
        setStudentsLoaded(true);
      }
    })();
  }, []);

  /* ─── Paketten ödev verme: API'den paket verilerini oku ─── */
  useEffect(() => {
    if (!packageIdParam || packageLoaded) return;
    const id = parseInt(packageIdParam, 10);
    if (Number.isNaN(id)) return;

    (async () => {
      try {
        const result = await fetchAssignmentPackage(id);
        if (!result.success || !result.data?.items?.length) {
          flash('❌ Paket verileri okunamadı');
          return;
        }
        await incrementPackageUsage(id);
        const cartItems = mapPackageItemsToCart(result.data.items);
        setPendingPackageCart(cartItems);
        setPendingPackageTitle(result.data.name);
        setPackageTemplateId(id);
        setPackageLoaded(true);
        flash(`📦 ${cartItems.length} içerik paketten yüklendi — öğrenci seçin`);
      } catch {
        flash('❌ Paket verileri okunamadı');
      }
    })();
  }, [packageIdParam, packageLoaded]);

  /* ─── URL'den gelen student parametresiyle oto-seçim ─── */
  useEffect(() => {
    if (!preselectedStudentId || autoSelected || !studentsLoaded) return;
    const sid = parseInt(preselectedStudentId, 10);
    if (Number.isNaN(sid)) return;

    const fromList = students.find((s) => s.id === sid);
    if (fromList) {
      setAutoSelected(true);
      pickStudent(fromList);
      return;
    }

    (async () => {
      try {
        const detail = await fetchStudentResourceDetail(sid);
        if (detail.success && detail.data?.student) {
          const s = detail.data.student;
          setAutoSelected(true);
          pickStudent({
            id: s.id,
            ad: s.ad,
            soyad: s.soyad,
            profil_foto: s.profil_foto || undefined,
          });
          return;
        }
      } catch { /* fall through */ }

      setAutoSelected(true);
      pickStudent({ id: sid, ad: 'Öğrenci', soyad: `#${sid}` });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedStudentId, students, studentsLoaded, autoSelected]);

  /* ─── Fetch student resources ─── */
  const fetchResources = async (sid: number) => {
    setResLoading(true);
    setResources([]);
    try {
      const detail = await fetchStudentResourceDetail(sid);
      if (detail.success && detail.data?.lessons?.length) {
        const flat: StudentResource[] = [];
        for (const lesson of detail.data.lessons) {
          for (const r of lesson.resources || []) {
            if (!r.resource_book) continue;
            flat.push({
              id: r.id,
              resource_book: r.resource_book,
              resource_name: r.resource_name,
              resource_type: r.resource_type,
              resource_type_display: r.resource_type,
              publication_year: r.resource_yayin_yili ?? undefined,
              lesson: lesson.lesson_id || r.lesson || 0,
              lesson_name: lesson.lesson_name || r.lesson_name || 'Ders',
            });
          }
        }
        setResources(flat);
        return;
      }

      const result = await fetchStudentResourcesByStudent(sid);
      if (result.success && result.data) {
        setResources(
          (result.data as StudentResource[]).map((r) => ({
            ...r,
            lesson: r.lesson || 0,
            lesson_name: r.lesson_name || 'Ders',
          }))
        );
      }
    } catch { flash('❌ Kaynaklar yüklenemedi'); }
    finally {
      setResLoading(false);
    }
  };

  /* ─── Fetch content task history for student ─── */
  const fetchTaskHistory = async (sid: number) => {
    try {
      const result = await fetchContentTaskHistory(sid);
      if (result.success && result.data) {
        setTaskHistory(result.data as ContentTaskHistory);
      }
    } catch { flash('❌ Görev geçmişi yüklenemedi'); }
  };
  const fetchBook = async (bookId: number) => {
    setBookLoading(true);
    try {
      const result = await fetchBookStructure(bookId);
      if (result.success && result.data) {
        setBookDetails(result.data as BookDetails);
      }
    } catch { flash('❌ Kitap yapısı yüklenemedi'); }
    setBookLoading(false);
  };

  /* ─── Handlers ─── */
  const pickStudent = (s: Student) => {
    setSelectedStudent(s);
    setSelectedStudents([s]);
    setMultiSelect(false);
    fetchResources(s.id);
    fetchTaskHistory(s.id);
    setSelectedResource(null);
    setBookDetails(null);
    setContentNotes({});

    // Paketten gelen bekleyen veriler varsa cart'a yükle, yoksa sıfırla
    if (pendingPackageCart && pendingPackageCart.length > 0) {
      setCart(pendingPackageCart);
      if (pendingPackageTitle) {
        setTitle(pendingPackageTitle);
      }
      setPendingPackageCart(null);
      setPendingPackageTitle(null);
      setCurrentStep(3); // Direkt önizlemeye geç
      flash(`${s.ad} ${s.soyad} seçildi · 📦 ${pendingPackageCart.length} içerik paketten yüklendi`);
    } else {
      setCart([]);
      setCurrentStep(2);
      flash(`${s.ad} ${s.soyad} seçildi`);
    }
  };

  const toggleStudentMulti = (s: Student) => {
    setSelectedStudents(prev => {
      const exists = prev.some(ss => ss.id === s.id);
      const updated = exists ? prev.filter(ss => ss.id !== s.id) : [...prev, s];
      // İlk seçili öğrenciyi primary olarak ayarla
      if (updated.length > 0 && (!selectedStudent || !updated.some(ss => ss.id === selectedStudent.id))) {
        setSelectedStudent(updated[0]);
        fetchResources(updated[0].id);
        fetchTaskHistory(updated[0].id);
      }
      if (updated.length === 0) {
        setSelectedStudent(null);
      }

      // Paketten gelen bekleyen veriler varsa ilk öğrenci eklendiğinde cart'a yükle
      if (!exists && pendingPackageCart && pendingPackageCart.length > 0) {
        setCart(pendingPackageCart);
        if (pendingPackageTitle) {
          setTitle(pendingPackageTitle);
        }
        setPendingPackageCart(null);
        setPendingPackageTitle(null);
        flash(`📦 ${pendingPackageCart.length} içerik paketten yüklendi`);
      }

      return updated;
    });
  };

  const toggleMultiMode = () => {
    setMultiSelect(prev => {
      if (!prev && selectedStudent) {
        // Tekli → çoklu: mevcut seçili öğrenciyi listeye ekle
        setSelectedStudents([selectedStudent]);
      }
      if (prev) {
        // Çoklu → tekli: ilk seçili öğrenciyi koru
        if (selectedStudents.length > 0) {
          setSelectedStudent(selectedStudents[0]);
          setSelectedStudents([selectedStudents[0]]);
        }
      }
      return !prev;
    });
  };

  const pickResource = (r: StudentResource) => {
    setSelectedResource(r);
    fetchBook(r.resource_book);
  };

  const addContent = useCallback((c: Content, t: Topic, u: Unit) => {
    if (!bookDetails || !selectedResource) return;
    if (cart.some(x => x.id === c.id)) return;
    const item: SelectedContent = {
      id: c.id, contentId: c.id,
      contentName: c.name || c.ad, contentType: c.content_type,
      topicId: t.id, topicName: t.name || t.ad,
      unitId: u.id, unitName: u.name || u.ad,
      bookId: bookDetails.id, bookName: bookDetails.name || bookDetails.ad,
      lessonId: selectedResource.lesson, lessonName: selectedResource.lesson_name,
      questionCount: c.question_count, pageCount: c.page_count,
      startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
    };
    setCart(prev => [...prev, item]);
  }, [bookDetails, selectedResource, cart]);

  const removeContent = (id: number) => {
    setCart(prev => prev.filter(c => c.id !== id));
    setContentNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const toggleContent = useCallback((c: Content, t: Topic, u: Unit) => {
    if (cart.some(x => x.id === c.id)) removeContent(c.id);
    else addContent(c, t, u);
  }, [cart, addContent]);

  const selectAllUnit = useCallback((unit: Unit) => {
    if (!bookDetails || !selectedResource) return;
    const newItems: SelectedContent[] = [];
    unit.topics?.forEach((t: Topic) => t.contents?.forEach((c: Content) => {
      // Tamamlanmış (DONE) görevleri atla
      const h = taskHistory[c.id];
      if (h?.completion_status === 'DONE') return;
      if (!cart.some(x => x.id === c.id)) {
        newItems.push({
          id: c.id, contentId: c.id,
          contentName: c.name || c.ad, contentType: c.content_type,
          topicId: t.id, topicName: t.name || t.ad,
          unitId: unit.id, unitName: unit.name || unit.ad,
          bookId: bookDetails.id, bookName: bookDetails.name || bookDetails.ad,
          lessonId: selectedResource.lesson, lessonName: selectedResource.lesson_name,
          questionCount: c.question_count, pageCount: c.page_count,
          startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
        });
      }
    }));
    if (newItems.length) { setCart(prev => [...prev, ...newItems]); flash(`${newItems.length} içerik eklendi`); }
  }, [bookDetails, selectedResource, cart, taskHistory]);

  const selectAllTopic = useCallback((topic: Topic, unit: Unit) => {
    if (!bookDetails || !selectedResource) return;
    const newItems: SelectedContent[] = [];
    topic.contents?.forEach((c: Content) => {
      // Tamamlanmış (DONE) görevleri atla
      const h = taskHistory[c.id];
      if (h?.completion_status === 'DONE') return;
      if (!cart.some(x => x.id === c.id)) {
        newItems.push({
          id: c.id, contentId: c.id,
          contentName: c.name || c.ad, contentType: c.content_type,
          topicId: topic.id, topicName: topic.name || topic.ad,
          unitId: unit.id, unitName: unit.name || unit.ad,
          bookId: bookDetails.id, bookName: bookDetails.name || bookDetails.ad,
          lessonId: selectedResource.lesson, lessonName: selectedResource.lesson_name,
          questionCount: c.question_count, pageCount: c.page_count,
          startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
        });
      }
    });
    if (newItems.length) { setCart(prev => [...prev, ...newItems]); flash(`${newItems.length} içerik eklendi`); }
  }, [bookDetails, selectedResource, cart, taskHistory]);

  const clearCart = () => { setCart([]); setContentNotes({}); };

  const isDirty = useMemo(() => {
    const hasStudent = multiSelect ? selectedStudents.length > 0 : !!selectedStudent;
    return (
      hasStudent ||
      cart.length > 0 ||
      currentStep > 1 ||
      notes.trim().length > 0 ||
      title !== generateWeeklyTitle()
    );
  }, [multiSelect, selectedStudents.length, selectedStudent, cart.length, currentStep, notes, title]);

  const { leaveDialogProps, markClean } = useUnsavedChangesGuard({
    isDirty,
    title: 'Ödev Ekranından Ayrıl',
    message:
      'Ödev verme işlemi tamamlanmadan bu sayfadan ayrılmak istediğinize emin misiniz? Seçtiğiniz içerikler kaybolabilir.',
  });

  const handleSave = async (status: 'PUBLISHED' | 'DRAFT') => {
    const targetStudents = multiSelect ? selectedStudents : (selectedStudent ? [selectedStudent] : []);
    if (targetStudents.length === 0 || cart.length === 0) return;
    setSaving(true);
    // Backend status mapping: PUBLISHED → ASSIGNED
    const backendStatus: 'ASSIGNED' | 'DRAFT' = status === 'PUBLISHED' ? 'ASSIGNED' : status;
    try {
      const grouped: Record<string, SelectedContent[]> = {};
      cart.forEach(c => { const k = String(c.bookId); if (!grouped[k]) grouped[k] = []; grouped[k].push(c); });
      const lessons = Object.entries(grouped).map(([bookId, contents]) => {
        const first = contents[0];
        return {
          resource_book: parseInt(bookId),
          topic_name: first.topicName,
          content_mode: 'TOPIC',
          notes: '',
          tasks: contents.map(c => {
            const hist = taskHistory[c.contentId];
            const isCompletion = hist?.completion_status === 'PARTIAL' || hist?.completion_status === 'NOT_DONE';
            return {
              task_type: c.contentType === 'TEST_SET' ? 'SOLVE_TEST' : c.contentType === 'PAGE_RANGE' ? 'SOLVE_PDF' : c.contentType === 'VIDEO' ? 'WATCH_VIDEO' : 'REVIEW_TOPIC',
              title: c.contentName,
              description: contentNotes[c.id] || '',
              content_id: c.contentId,
              question_count: c.questionCount || null,
              page_count: c.pageCount || (c.startPage && c.endPage ? c.endPage - c.startPage + 1 : null),
              is_required: true,
              is_completion_task: isCompletion,
              previous_task_completion_percent: isCompletion ? (hist?.task_completion_percent ?? 0) : null,
              previous_assignment_title: isCompletion ? (hist?.assignment_title ?? '') : '',
            };
          }),
        };
      });

      let successCount = 0;
      let failCount = 0;
      let lastCreatedId: number | null = null;
      for (const student of targetStudents) {
        const body = {
          student: student.id,
          title: title || generateWeeklyTitle(),
          description: notes,
          priority: priority,
          due_date: dueDate || getDefaultDueDate(),
          status: backendStatus,
          lessons,
          ...(packageTemplateId ? { template_id: packageTemplateId } : {}),
        };
        try {
          const result = await createAssignment(body);
          if (result.success) {
            successCount++;
            if (result.data?.id) lastCreatedId = result.data.id;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        const studentNames = targetStudents.length === 1
          ? `${targetStudents[0].ad} ${targetStudents[0].soyad}`
          : `${successCount} öğrenci`;
        const msg = status === 'DRAFT'
          ? `✅ Taslak kaydedildi — ${studentNames}`
          : `✅ Ödev gönderildi — ${studentNames}`;
        flash(msg);
        if (failCount === 0 && targetStudents.length === 1 && lastCreatedId && status === 'PUBLISHED') {
          setSavedAssignmentId(lastCreatedId);
          setShowSendAfterSave(true);
        }
        resetAll();
      } else {
        flash(`⚠️ ${successCount} başarılı, ${failCount} başarısız — bazı ödevler gönderilemedi`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      flash('❌ Ödev kaydedilemedi: ' + msg);
    }
    setSaving(false);
  };

  const resetAll = () => {
    markClean();
    setCart([]);
    setSelectedResource(null);
    setBookDetails(null);
    setTitle(generateWeeklyTitle());
    setNotes('');
    setDueDate(getDefaultDueDate());
    setPriority('MEDIUM');
    setContentNotes({});
    setShowPrint(false);
    setPendingPackageCart(null);
    setPendingPackageTitle(null);
    setPackageTemplateId(null);
    setPackageLoaded(false);
    setTaskHistory({});

    if (studentLocked && selectedStudent) {
      setMultiSelect(false);
      setSelectedStudents([selectedStudent]);
      setCurrentStep(2);
      void fetchResources(selectedStudent.id);
      void fetchTaskHistory(selectedStudent.id);
      return;
    }

    setSelectedStudent(null);
    setSelectedStudents([]);
    setMultiSelect(false);
    setResources([]);
    setCurrentStep(1);
  };

  /* ─── Step Navigation ─── */
  const canGoToStep = (step: number): boolean => {
    if (step === 1) return !studentLocked;
    const hasStudent = multiSelect ? selectedStudents.length > 0 : !!selectedStudent;
    if (step === 2) return hasStudent;
    if (step === 3) return hasStudent && cart.length > 0;
    return false;
  };

  const goToStep = (step: number) => {
    if (canGoToStep(step)) setCurrentStep(step);
  };

  const isContentSelected = (id: number) => cart.some(c => c.id === id);
  const totalQ = cart.reduce((s, c) => s + (c.questionCount || 0), 0);

  /* ─── RENDER ─── */
  return (
    <>
      <UnsavedChangesModal {...leaveDialogProps} />
    <div ref={mainRef} style={{ padding: 0, fontFamily: "'Poppins', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#172b4c', color: '#fff', padding: '10px 24px',
          borderRadius: 100, fontSize: 13, fontWeight: 600,
          zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.25)',
          animation: 'fadeIn 0.3s ease',
        }}>
          {toast}
        </div>
      )}

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: 24 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Ödev Oluştur</h1>
            <div className="hero-breadcrumb">
              {isCoach ? (
                <>
                  <Link href="/coach/dashboard">Koç</Link>
                  <span>/</span>
                  <Link href="/coach/odev/kontrol">Ödev</Link>
                  <span>/</span>
                  <span>Ödev Oluştur</span>
                </>
              ) : (
                <>
                  <a href="/dashboard">Ana Sayfa</a>
                  <span>/</span>
                  <span>Koçluk</span>
                  <span>/</span>
                  <span>Ödev Oluştur</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {(selectedStudent || selectedStudents.length > 0) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', background: 'rgba(255,255,255,0.2)',
              borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 500,
            }}>
              {multiSelect && selectedStudents.length > 1 ? (
                <span>👥 {selectedStudents.length} öğrenci seçili</span>
              ) : (
                <span>👤 {selectedStudent?.ad} {selectedStudent?.soyad}</span>
              )}
              {cart.length > 0 && (
                <span style={{
                  background: 'rgba(255,255,255,0.3)',
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 11,
                }}>
                  📦 {cart.length} içerik · {totalQ} soru
                </span>
              )}
            </div>
          )}
          {returnHref && (
            <Link
              href={returnHref}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'rgba(255,255,255,0.2)',
                borderRadius: 10, color: '#fff',
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
              }}
            >
              ← Geri
            </Link>
          )}
          <button
            onClick={resetAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'rgba(255,255,255,0.2)',
              border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          >
            ↻ Sıfırla
          </button>
        </div>
      </div>

      {/* Step Navigation */}
      <div className="wizard-steps-nav" style={{ marginBottom: 24 }}>
        {(studentLocked ? STEPS.filter((s) => s.id !== 1) : STEPS).map((step, idx, arr) => {
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          const canGo = canGoToStep(step.id);
          const displayNum = studentLocked ? idx + 1 : step.id;
          return (
            <React.Fragment key={step.id}>
              <div
                className={`wizard-step-item ${isActive ? 'active' : isCompleted ? 'completed' : 'pending'}`}
                onClick={() => canGo && goToStep(step.id)}
                style={{ cursor: canGo ? 'pointer' : 'not-allowed' }}
              >
                <div className="step-indicator">
                  {isCompleted ? '✓' : displayNum}
                </div>
                <div className="step-info">
                  <span style={{ fontSize: 16, marginRight: 4 }}>{step.icon}</span>
                  <span className="step-label">{step.label}</span>
                </div>
              </div>
              {idx < arr.length - 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '0 4px',
                  color: isCompleted ? 'var(--success)' : 'var(--border-color)',
                  fontSize: 14,
                }}>
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="wizard-content" style={{ minHeight: 500 }}>
        <div className="wizard-step-content">
          {/* Step 1: Student */}
          {currentStep === 1 && !studentLocked && (
            <StudentStep
              students={students}
              selectedStudent={selectedStudent}
              selectedStudents={selectedStudents}
              multiSelect={multiSelect}
              onSelect={pickStudent}
              onToggleMulti={toggleStudentMulti}
              onToggleMode={toggleMultiMode}
              getPhotoUrl={getPhotoUrl}
            />
          )}

          {/* Step 2: Assignment */}
          {currentStep === 2 && selectedStudent && (
            <AssignmentStep
              resources={resources}
              selectedResource={selectedResource}
              bookDetails={bookDetails}
              cart={cart}
              contentNotes={contentNotes}
              resLoading={resLoading}
              bookLoading={bookLoading}
              taskHistory={taskHistory}
              onPickResource={pickResource}
              onToggleContent={toggleContent}
              onSelectAllUnit={selectAllUnit}
              onSelectAllTopic={selectAllTopic}
              onRemoveContent={removeContent}
              onClearCart={clearCart}
              onNoteChange={(id: number, v: string) => setContentNotes(p => ({ ...p, [id]: v }))}
              isSelected={isContentSelected}
            />
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && selectedStudent && (
            <ReviewStep
              student={selectedStudent}
              selectedStudents={selectedStudents}
              cart={cart}
              contentNotes={contentNotes}
              title={title}
              notes={notes}
              dueDate={dueDate}
              priority={priority}
              coachName={coachName}
              saving={saving}
              taskHistory={taskHistory}
              onTitleChange={setTitle}
              onNotesChange={setNotes}
              onDueDateChange={setDueDate}
              onPriorityChange={setPriority}
              onRemove={removeContent}
              onSave={handleSave}
              onPrint={() => setShowPrint(true)}
              getPhotoUrl={getPhotoUrl}
            />
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="wizard-footer">
        <div className="wizard-step-counter">
          Adım {studentLocked ? currentStep - 1 : currentStep} / {studentLocked ? 2 : STEPS.length}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {currentStep > 1 && !(studentLocked && currentStep === 2) && (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="wizard-btn-secondary"
            >
              ← Geri
            </button>
          )}
          {currentStep < 3 && (
            <button
              onClick={() => canGoToStep(currentStep + 1) && setCurrentStep(currentStep + 1)}
              disabled={!canGoToStep(currentStep + 1)}
              className="wizard-btn-primary"
            >
              İleri →
            </button>
          )}
        </div>
      </div>

      {/* Print Preview */}
      {showPrint && selectedStudent && (
        <PrintPreview
          studentName={`${selectedStudent.ad} ${selectedStudent.soyad}`}
          studentPhoto={getPhotoUrl(selectedStudent.profil_foto)}
          coachName={coachName}
          title={title}
          notes={notes}
          dueDate={dueDate}
          items={cart}
          contentNotes={contentNotes}
          taskHistory={taskHistory}
          assignmentId={savedAssignmentId ?? undefined}
          onClose={() => setShowPrint(false)}
        />
      )}

      {showSendAfterSave && savedAssignmentId && (
        <AssignmentNotifySendModal
          assignmentId={savedAssignmentId}
          notifyType="plan"
          onClose={() => { setShowSendAfterSave(false); setSavedAssignmentId(null); }}
          onSent={() => { setShowSendAfterSave(false); setSavedAssignmentId(null); }}
        />
      )}
    </div>
    </>
  );
}
