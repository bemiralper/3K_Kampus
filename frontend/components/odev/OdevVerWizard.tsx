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
  ScopeCompletionMap,
  RoutineQuotaKind,
} from '@/app/admin/odev/ver/types';
import { isRoutineQuotaResource, routineQuotaKindOf } from '@/app/admin/odev/ver/types';
import {
  fetchOgrenciList,
  fetchStudentResourcesByStudent,
  fetchStudentResourceDetail,
  fetchContentTaskHistory,
  fetchBookStructure,
  createAssignment,
  fetchAssignmentPackage,
  fetchAssignments,
  incrementPackageUsage,
  fetchLastQuotaDefaults,
  fetchRoutineQuotaBooks,
  upsertStudentRoutineQuota,
  type AssignmentPackageItem,
  type ManualAssignment,
  type LastQuotaDefaults,
} from '@/lib/resources-api';
import AssignmentNotifySendModal from '@/components/odev/AssignmentNotifySendModal';
import {
  buildCompletionNote,
  isIncompleteHistory,
  stripCompletionTitleSuffix,
} from '@/components/odev/odevCompletionHelpers';
import {
  clearOdevVerDraft,
  loadOdevVerDraft,
  saveOdevVerDraft,
} from '@/components/odev/odevVerDraftStorage';
import {
  datesFromHomework,
} from '@/components/coaching/study-program/programDateUtils';

export type OdevVerVariant = 'admin' | 'coach';

const PENDING_CONTROL_STATUSES = new Set(['ASSIGNED', 'IN_PROGRESS', 'OVERDUE']);

type PendingControlInfo = {
  id: number;
  title: string;
  studentId: number;
  studentName: string;
};

type ResourceGapInfo = {
  studentId: number;
  studentName: string;
  missingBookNames: string[];
};

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

/** Yerel takvim günü → YYYY-MM-DD (UTC toISOString kayması yok) */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Varsayılan ödev kontrol günü: tam 1 hafta sonra — aynı hafta günü.
 * Örn. Pazartesi verilirse → haftaya Pazartesi.
 * (Yerel takvim; UTC toISOString kullanma.)
 */
function getDefaultDueDate(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 7);
  return formatLocalDate(d);
}

/** date input değerini API için yerel gün sonu ISO'ya çevir */
function dueDateToApi(dateStr: string): string {
  if (!dateStr) return dateStr;
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T23:59:00`;
}

function quotaCartId(kind: RoutineQuotaKind, bookId: number): number {
  return kind === 'PARAGRAF' ? -bookId : -(bookId + 1_000_000_000);
}

function quotaKindLabel(kind: RoutineQuotaKind): string {
  return kind === 'PARAGRAF' ? 'Paragraf' : 'Problem';
}

function buildQuotaCartItem(
  resource: StudentResource,
  daily: number,
): SelectedContent | null {
  const kind = routineQuotaKindOf(resource);
  if (!kind || daily < 1) return null;
  const weekly = daily * 7;
  const label = quotaKindLabel(kind);
  return {
    id: quotaCartId(kind, resource.resource_book),
    contentId: 0,
    contentName: `${label} — ${weekly} soru`,
    contentType: 'QUOTA',
    topicId: kind === 'PARAGRAF' ? -1 : -2,
    topicName: label,
    unitId: 0,
    unitName: '',
    bookId: resource.resource_book,
    bookName: resource.resource_name,
    lessonId: resource.lesson,
    lessonName: resource.lesson_name,
    questionCount: weekly,
    pageCount: null,
    quotaKind: kind,
    dailyQuestionCount: daily,
  };
}

function mapPackageItemsToCart(items: AssignmentPackageItem[]): SelectedContent[] {
  return items.map(item => ({
    id: item.content_id,
    contentId: item.content_id,
    contentName: item.content_name,
    contentType: item.content_type,
    // Eski paketlerde (migrasyon öncesi) topic_id/unit_id boş olabilir — bu durumda
    // 0 kullanılır, yani aynı kitaptaki farklı konular tek ders bloğunda toplanır.
    // Yeni oluşturulan paketlerde gerçek id'ler saklandığı için doğru gruplanır.
    topicId: item.topic_id ?? 0,
    topicName: item.topic_name || '',
    unitId: item.unit_id ?? 0,
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
  const [bookProgress, setBookProgress] = useState<ScopeCompletionMap>({});
  const [unitProgress, setUnitProgress] = useState<ScopeCompletionMap>({});
  const [lastQuotaDefaults, setLastQuotaDefaults] = useState<LastQuotaDefaults>({
    PARAGRAF: null,
    PROBLEM: null,
  });

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
  const [sendStudentName, setSendStudentName] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  /** WhatsApp sonrası: çalışma programı teklifi (ödev tarihleriyle) */
  const [studyProgramOffer, setStudyProgramOffer] = useState<{
    assignmentId: number;
    studentId: number;
    dueDate: string;
    assignedDate: string;
  } | null>(null);
  const [showStudyProgramOffer, setShowStudyProgramOffer] = useState(false);
  const studyProgramOfferRef = useRef<typeof studyProgramOffer>(null);
  const pendingResetAfterOfferRef = useRef(false);

  useEffect(() => {
    studyProgramOfferRef.current = studyProgramOffer;
  }, [studyProgramOffer]);

  /* ─── Toast ─── */
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  /* ─── Kontrolü tamamlanmamış ödev uyarısı ─── */
  const [pendingControls, setPendingControls] = useState<PendingControlInfo[]>([]);

  /* ─── Çoklu öğrenci: sepet, birincil öğrencinin kaynak listesinden kuruluyor —
     diğer öğrencilerde aynı kitap kayıtlı olmayabilir. Bunu uyar. ─── */
  const [resourceGaps, setResourceGaps] = useState<ResourceGapInfo[]>([]);

  const kontrolBase = isCoach ? '/coach/odev/kontrol' : '/admin/odev/kontrol';

  const checkPendingControls = useCallback(async (studentIds: number[], nameById: Map<number, string>) => {
    const found: PendingControlInfo[] = [];
    await Promise.all(
      studentIds.map(async (sid) => {
        try {
          const res = await fetchAssignments({ student_id: sid });
          const list = (res.success && res.data ? res.data : []) as ManualAssignment[];
          for (const a of list) {
            if (PENDING_CONTROL_STATUSES.has(a.status)) {
              found.push({
                id: a.id,
                title: a.title || 'İsimsiz ödev',
                studentId: sid,
                studentName: nameById.get(sid) || `#${sid}`,
              });
            }
          }
        } catch { /* sessiz */ }
      }),
    );
    setPendingControls(found);
  }, []);

  /**
   * Çoklu öğrenci modunda sepet (kitap/içerik seçimi) sadece birincil öğrencinin
   * kaynak listesinden kuruluyor. Diğer öğrencilere aynı sepet kopyalanacağı için,
   * onlarda seçilen kitap(lar) kayıtlı değilse burada uyarı gösteriyoruz — ödev
   * yine de atanabilir, ama koç/admin bilerek onaylasın.
   */
  const checkResourceGaps = useCallback(async (
    otherStudents: Student[],
    bookIds: number[],
    bookNamesById: Map<number, string>,
  ) => {
    if (otherStudents.length === 0 || bookIds.length === 0) {
      setResourceGaps([]);
      return;
    }
    const gaps: ResourceGapInfo[] = [];
    await Promise.all(
      otherStudents.map(async (student) => {
        try {
          const detail = await fetchStudentResourceDetail(student.id);
          const ownedBookIds = new Set<number>();
          if (detail.success && detail.data?.lessons?.length) {
            for (const lesson of detail.data.lessons) {
              for (const r of lesson.resources || []) {
                if (r.resource_book) ownedBookIds.add(r.resource_book);
              }
            }
          }
          const missing = bookIds.filter((id) => !ownedBookIds.has(id));
          if (missing.length > 0) {
            gaps.push({
              studentId: student.id,
              studentName: `${student.ad} ${student.soyad}`.trim(),
              missingBookNames: missing.map((id) => bookNamesById.get(id) || `#${id}`),
            });
          }
        } catch { /* sessiz — uyarı olmadan da atama akışı çalışsın */ }
      }),
    );
    setResourceGaps(gaps);
  }, []);

  useEffect(() => {
    if (!multiSelect || selectedStudents.length < 2 || cart.length === 0) {
      setResourceGaps([]);
      return;
    }
    const primaryId = selectedStudent?.id ?? selectedStudents[0].id;
    const otherStudents = selectedStudents.filter((s) => s.id !== primaryId);
    const bookIds = Array.from(new Set(cart.map((c) => c.bookId)));
    const bookNamesById = new Map(cart.map((c) => [c.bookId, c.bookName]));
    void checkResourceGaps(otherStudents, bookIds, bookNamesById);
  }, [multiSelect, selectedStudents, cart, selectedStudent, checkResourceGaps]);

  /* ─── URL query param ile öğrenci / paket oto-seçimi ─── */
  const searchParams = useSearchParams();
  const preselectedStudentId = searchParams.get('student');
  const packageIdParam = searchParams.get('package_id');
  const fromKontrol = searchParams.get('from') === 'kontrol';
  const kontrolDone = searchParams.get('kontrol_done') === '1';
  const kontrolIdParam = searchParams.get('kontrol_id');
  const kontrolListPath = isCoach ? '/coach/odev/kontrol' : '/admin/odev/kontrol';
  // return bazen kayboluyor; return_to + kontrol_id + liste yedeği
  const returnHref =
    searchParams.get('return_to') ||
    searchParams.get('return') ||
    (kontrolIdParam ? `${kontrolListPath}/${kontrolIdParam}` : null) ||
    (fromKontrol ? kontrolListPath : null);
  const studentLocked = searchParams.get('locked') === '1' || (isCoach && !!preselectedStudentId);
  const sourceKontrolAssignmentId = useMemo(() => {
    if (kontrolIdParam) {
      const n = parseInt(kontrolIdParam, 10);
      return Number.isFinite(n) ? n : null;
    }
    const href = returnHref || '';
    const m = href.match(/\/odev\/kontrol\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }, [kontrolIdParam, returnHref]);
  /** Kontrolden gelinen ödevi 'tamamlanmamış' uyarısından çıkar */
  const visiblePendingControls = useMemo(() => {
    if (!sourceKontrolAssignmentId) return pendingControls;
    return pendingControls.filter((pc) => pc.id !== sourceKontrolAssignmentId);
  }, [pendingControls, sourceKontrolAssignmentId]);
  const preselectedLessonId = (() => {
    const raw = searchParams.get('lesson');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  })();
  const preselectedBookId = (() => {
    const raw = searchParams.get('book');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  })();
  const [autoSelected, setAutoSelected] = useState(false);
  const [packageLoaded, setPackageLoaded] = useState(false);
  const [resourcePrefillDone, setResourcePrefillDone] = useState(false);
  /** Draft restore tamamlanmadan sessionStorage'a boş yazma */
  const draftReadyRef = useRef(false);

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
  const mergeQuotaCatalogBooks = async (sid: number, existing: StudentResource[]) => {
    const [paragraf, problem] = await Promise.all([
      fetchRoutineQuotaBooks('PARAGRAF', sid),
      fetchRoutineQuotaBooks('PROBLEM', sid),
    ]);
    const catalog = [
      ...(paragraf.success && Array.isArray(paragraf.data) ? paragraf.data : []),
      ...(problem.success && Array.isArray(problem.data) ? problem.data : []),
    ];
    const catalogById = new Map(catalog.map((b) => [b.id, b]));
    return existing
      .filter((r) => (r.status || '').toUpperCase() !== 'COMPLETED')
      .map((r) => {
        const cat = catalogById.get(r.resource_book);
        if (!cat) return r;
        return {
          ...r,
          resource_type_kod: r.resource_type_kod || cat.kind,
          publisher: r.publisher || cat.yayinevi,
        };
      });
  };

  const fetchResources = async (sid: number) => {
    setResLoading(true);
    setResources([]);
    try {
      let flat: StudentResource[] = [];
      const detail = await fetchStudentResourceDetail(sid);
      if (detail.success && detail.data?.lessons?.length) {
        for (const lesson of detail.data.lessons) {
          for (const r of lesson.resources || []) {
            if (!r.resource_book) continue;
            flat.push({
              id: r.id,
              resource_book: r.resource_book,
              resource_name: r.resource_name,
              resource_type: r.resource_type,
              resource_type_display: r.resource_type,
              resource_type_kod: r.resource_type_kod,
              publication_year: r.resource_yayin_yili ?? undefined,
              publisher: r.resource_yayinevi,
              lesson: lesson.lesson_id || r.lesson || 0,
              lesson_name: lesson.lesson_name || r.lesson_name || 'Ders',
              status: r.status,
            });
          }
        }
      } else {
        const result = await fetchStudentResourcesByStudent(sid);
        if (result.success && result.data) {
          flat = (result.data as StudentResource[]).map((r) => ({
            ...r,
            lesson: r.lesson || 0,
            lesson_name: r.lesson_name || 'Ders',
          }));
        }
      }
      setResources(await mergeQuotaCatalogBooks(sid, flat));
    } catch { flash('❌ Kaynaklar yüklenemedi'); }
    finally {
      setResLoading(false);
    }
  };

  /* ─── Fetch content task history for student ─── */
  const fetchQuotaDefaults = async (sid: number) => {
    try {
      const result = await fetchLastQuotaDefaults(sid);
      if (result.success && result.data) {
        setLastQuotaDefaults({
          PARAGRAF: result.data.PARAGRAF || null,
          PROBLEM: result.data.PROBLEM || null,
        });
        return;
      }
    } catch { /* varsayılan boş */ }
    setLastQuotaDefaults({ PARAGRAF: null, PROBLEM: null });
  };

  const fetchTaskHistory = async (sid: number) => {
    try {
      const result = await fetchContentTaskHistory(sid);
      if (result.success && result.data) {
        setTaskHistory(result.data.contents || {});
        setBookProgress(result.data.by_book || {});
        setUnitProgress(result.data.by_unit || {});
      }
    } catch { flash('❌ Görev geçmişi yüklenemedi'); }
  };
  const fetchBook = async (bookId: number) => {
    setBookLoading(true);
    setBookDetails(null);
    try {
      const result = await fetchBookStructure(bookId, {
        studentId: selectedStudent?.id || (preselectedStudentId ? parseInt(preselectedStudentId, 10) : undefined),
      });
      if (result.success && result.data) {
        setBookDetails(result.data as BookDetails);
      } else {
        flash(result.error || 'Kitap yapısı yüklenemedi — şube seçimini kontrol edin');
      }
    } catch { flash('❌ Kitap yapısı yüklenemedi'); }
    setBookLoading(false);
  };

  /* ─── Handlers ─── */
  const pickStudent = (s: Student) => {
    draftReadyRef.current = false;
    setSelectedStudent(s);
    setSelectedStudents([s]);
    setMultiSelect(false);
    fetchResources(s.id);
    fetchTaskHistory(s.id);
    void fetchQuotaDefaults(s.id);
    setSelectedResource(null);
    setBookDetails(null);
    setResourcePrefillDone(false);
    void checkPendingControls(
      [s.id],
      new Map([[s.id, `${s.ad} ${s.soyad}`.trim()]]),
    );

    // Paketten gelen bekleyen veriler varsa cart'a yükle
    if (pendingPackageCart && pendingPackageCart.length > 0) {
      setCart(pendingPackageCart);
      setContentNotes({});
      if (pendingPackageTitle) {
        setTitle(pendingPackageTitle);
      }
      setPendingPackageCart(null);
      setPendingPackageTitle(null);
      setCurrentStep(3); // Direkt önizlemeye geç
      draftReadyRef.current = true;
      flash(`${s.ad} ${s.soyad} seçildi · 📦 ${pendingPackageCart.length} içerik paketten yüklendi`);
      return;
    }

    const draft = loadOdevVerDraft(s.id);
    if (draft && draft.cart.length > 0) {
      setCart(draft.cart);
      setContentNotes(draft.contentNotes || {});
      if (draft.title) setTitle(draft.title);
      setNotes(draft.notes || '');
      if (draft.dueDate) setDueDate(draft.dueDate);
      if (draft.priority) setPriority(draft.priority);
      setCurrentStep(draft.currentStep >= 2 && draft.currentStep <= 3 ? draft.currentStep : 2);
      draftReadyRef.current = true;
      flash(`${s.ad} ${s.soyad} · önceki seçimler geri yüklendi (${draft.cart.length} içerik)`);
      return;
    }

    setCart([]);
    setContentNotes({});
    setCurrentStep(2);
    draftReadyRef.current = true;
    flash(`${s.ad} ${s.soyad} seçildi`);
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
        setPendingControls([]);
      } else {
        void checkPendingControls(
          updated.map((x) => x.id),
          new Map(updated.map((x) => [x.id, `${x.ad} ${x.soyad}`.trim()])),
        );
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
    if (isRoutineQuotaResource(r)) {
      setBookDetails(null);
      setBookLoading(false);
      return;
    }
    fetchBook(r.resource_book);
  };

  const addQuotaToCart = (resource: StudentResource, daily: number) => {
    const item = buildQuotaCartItem(resource, daily);
    if (!item || !item.quotaKind) return;
    setCart((prev) => [...prev.filter((c) => c.quotaKind !== item.quotaKind), item]);
    flash(`${item.topicName} ödevi sepete eklendi (${item.questionCount} soru)`);
  };

  /* ─── Kontrolden gelen lesson/book ile kaynak ön seçimi ─── */
  useEffect(() => {
    if (resourcePrefillDone || resLoading || resources.length === 0) return;
    if (preselectedBookId == null && preselectedLessonId == null) {
      setResourcePrefillDone(true);
      return;
    }

    let match: StudentResource | undefined;
    if (preselectedBookId != null) {
      match =
        resources.find(
          (r) =>
            r.resource_book === preselectedBookId &&
            (preselectedLessonId == null || r.lesson === preselectedLessonId),
        ) || resources.find((r) => r.resource_book === preselectedBookId);
    }
    if (!match && preselectedLessonId != null) {
      match = resources.find((r) => r.lesson === preselectedLessonId);
    }
    if (match) {
      pickResource(match);
    }
    setResourcePrefillDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, resLoading, preselectedBookId, preselectedLessonId, resourcePrefillDone]);

  const applyCompletionNotes = useCallback((items: SelectedContent[]) => {
    if (!items.length) return;
    setContentNotes((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (next[item.id]?.trim()) continue;
        const hist = taskHistory[item.contentId];
        if (isIncompleteHistory(hist)) {
          next[item.id] = buildCompletionNote(hist);
        }
      }
      return next;
    });
  }, [taskHistory]);

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
      contentSira: c.sira ?? null,
      startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
    };
    setCart(prev => [...prev, item]);
    applyCompletionNotes([item]);
  }, [bookDetails, selectedResource, cart, applyCompletionNotes]);

  const removeContents = (ids: number[]) => {
    const idSet = new Set(ids);
    setCart((prev) => prev.filter((c) => !idSet.has(c.id)));
    setContentNotes((prev) => {
      const n = { ...prev };
      ids.forEach((id) => { delete n[id]; });
      return n;
    });
  };

  const removeContent = (id: number) => {
    removeContents([id]);
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
          contentSira: c.sira ?? null,
          startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
        });
      }
    }));
    if (newItems.length) {
      setCart(prev => [...prev, ...newItems]);
      applyCompletionNotes(newItems);
      flash(`${newItems.length} görev eklendi`);
    }
  }, [bookDetails, selectedResource, cart, taskHistory, applyCompletionNotes]);

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
          contentSira: c.sira ?? null,
          startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
        });
      }
    });
    if (newItems.length) {
      setCart(prev => [...prev, ...newItems]);
      applyCompletionNotes(newItems);
      flash(`${newItems.length} görev eklendi`);
    }
  }, [bookDetails, selectedResource, cart, taskHistory, applyCompletionNotes]);

  const selectIncompleteFromUnit = useCallback((unit: Unit) => {
    if (!bookDetails || !selectedResource) return;
    const newItems: SelectedContent[] = [];
    unit.topics?.forEach((t: Topic) => t.contents?.forEach((c: Content) => {
      const h = taskHistory[c.id];
      if (!isIncompleteHistory(h)) return;
      if (cart.some(x => x.id === c.id)) return;
      newItems.push({
        id: c.id, contentId: c.id,
        contentName: c.name || c.ad, contentType: c.content_type,
        topicId: t.id, topicName: t.name || t.ad,
        unitId: unit.id, unitName: unit.name || unit.ad,
        bookId: bookDetails.id, bookName: bookDetails.name || bookDetails.ad,
        lessonId: selectedResource.lesson, lessonName: selectedResource.lesson_name,
        questionCount: c.question_count, pageCount: c.page_count,
        contentSira: c.sira ?? null,
        startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
      });
    }));
    if (newItems.length) {
      setCart(prev => [...prev, ...newItems]);
      applyCompletionNotes(newItems);
      flash(`${newItems.length} eksik/yapılmayan görev eklendi`);
    } else {
      flash('Bu ünitede eklenecek eksik yok');
    }
  }, [bookDetails, selectedResource, cart, taskHistory, applyCompletionNotes]);

  const selectIncompleteFromTopic = useCallback((topic: Topic, unit: Unit) => {
    if (!bookDetails || !selectedResource) return;
    const newItems: SelectedContent[] = [];
    topic.contents?.forEach((c: Content) => {
      const h = taskHistory[c.id];
      if (!isIncompleteHistory(h)) return;
      if (cart.some(x => x.id === c.id)) return;
      newItems.push({
        id: c.id, contentId: c.id,
        contentName: c.name || c.ad, contentType: c.content_type,
        topicId: topic.id, topicName: topic.name || topic.ad,
        unitId: unit.id, unitName: unit.name || unit.ad,
        bookId: bookDetails.id, bookName: bookDetails.name || bookDetails.ad,
        lessonId: selectedResource.lesson, lessonName: selectedResource.lesson_name,
        questionCount: c.question_count, pageCount: c.page_count,
        contentSira: c.sira ?? null,
        startPage: c.start_page || c.page_start, endPage: c.end_page || c.page_end,
      });
    });
    if (newItems.length) {
      setCart(prev => [...prev, ...newItems]);
      applyCompletionNotes(newItems);
      flash(`${newItems.length} eksik/yapılmayan görev eklendi`);
    } else {
      flash('Bu konuda eklenecek eksik yok');
    }
  }, [bookDetails, selectedResource, cart, taskHistory, applyCompletionNotes]);

  const clearCart = () => { setCart([]); setContentNotes({}); };

  /* ─── Kontrolden dönüşte sepet kalıcılığı ─── */
  useEffect(() => {
    if (!draftReadyRef.current || !selectedStudent || multiSelect) return;
    saveOdevVerDraft({
      studentId: selectedStudent.id,
      cart,
      contentNotes,
      title,
      notes,
      dueDate,
      priority,
      currentStep,
      updatedAt: Date.now(),
    });
  }, [selectedStudent, multiSelect, cart, contentNotes, title, notes, dueDate, priority, currentStep]);

  const isDirty = useMemo(() => {
    const hasEdits =
      cart.length > 0 ||
      notes.trim().length > 0 ||
      title !== generateWeeklyTitle();

    // Kontrolden / kilitli öğrenci: yalnızca gerçek düzenleme dirty sayılır
    if (studentLocked || fromKontrol) {
      return hasEdits;
    }

    const hasStudent = multiSelect ? selectedStudents.length > 0 : !!selectedStudent;
    return hasStudent || hasEdits || currentStep > 1;
  }, [
    multiSelect,
    selectedStudents.length,
    selectedStudent,
    cart.length,
    currentStep,
    notes,
    title,
    studentLocked,
    fromKontrol,
  ]);

  const { leaveDialogProps, markClean, forceNavigate } = useUnsavedChangesGuard({
    isDirty,
    // Kontrolden gelindiğinde geri dönüşü engelleme; normal Ödev Ver'de uyarı kalsın
    enabled: !fromKontrol,
    safeHrefs: returnHref ? [returnHref] : [],
    title: 'Ödev Ekranından Ayrıl',
    message:
      'Ödev verme işlemi tamamlanmadan bu sayfadan ayrılmak istediğinize emin misiniz? Seçtiğiniz içerikler kaybolabilir.',
  });

  const goBackToKontrol = () => {
    if (!returnHref) return;
    if (selectedStudent && !multiSelect) {
      saveOdevVerDraft({
        studentId: selectedStudent.id,
        cart,
        contentNotes,
        title,
        notes,
        dueDate,
        priority,
        currentStep,
        updatedAt: Date.now(),
      });
    }
    markClean();
    if (typeof window === 'undefined') return;
    // Kontrol bitmişse dönüşte WhatsApp rapor ekranı açılsın
    if (kontrolDone) {
      const sep = returnHref.includes('?') ? '&' : '?';
      window.location.href = `${returnHref}${sep}notify=report`;
      return;
    }
    window.location.href = returnHref;
  };

  const goToKontrolReportWhatsApp = useCallback(() => {
    if (!returnHref || !kontrolDone) return;
    if (selectedStudent && !multiSelect) {
      saveOdevVerDraft({
        studentId: selectedStudent.id,
        cart,
        contentNotes,
        title,
        notes,
        dueDate,
        priority,
        currentStep,
        updatedAt: Date.now(),
      });
    }
    markClean();
    const sep = returnHref.includes('?') ? '&' : '?';
    if (typeof window !== 'undefined') {
      window.location.href = `${returnHref}${sep}notify=report`;
    }
  }, [
    returnHref,
    kontrolDone,
    markClean,
    selectedStudent,
    multiSelect,
    cart,
    contentNotes,
    title,
    notes,
    dueDate,
    priority,
    currentStep,
  ]);

  const buildStudyProgramHref = useCallback(
    (offer: {
      assignmentId: number;
      studentId: number;
      dueDate: string;
      assignedDate: string;
    }) => {
      const { start, end } = datesFromHomework({
        assigned_date: offer.assignedDate,
        due_date: offer.dueDate,
      });
      const params = new URLSearchParams();
      params.set('student_id', String(offer.studentId));
      if (start) params.set('week_start', start);
      if (end) params.set('week_end', end);
      params.set('homework_id', String(offer.assignmentId));
      if (isCoach) {
        return `/coach/odev/calisma-programi?${params.toString()}`;
      }
      return `/admin/coaching/study-program?${params.toString()}`;
    },
    [isCoach],
  );

  const finishAfterWhatsApp = useCallback(() => {
    setShowSendAfterSave(false);
    setSavedAssignmentId(null);
    setSendStudentName('');
    setShowPrint(false);
    // Gönderildi / kapatıldı fark etmez
    const offer = studyProgramOfferRef.current;
    if (offer) {
      setStudyProgramOffer(offer);
      setShowStudyProgramOffer(true);
      return;
    }
    if (kontrolDone) {
      goToKontrolReportWhatsApp();
    }
  }, [kontrolDone, goToKontrolReportWhatsApp]);

  const resetAllRef = useRef<(opts?: { preserveSendState?: boolean }) => void>(() => {});

  const dismissStudyProgramOffer = useCallback(() => {
    setShowStudyProgramOffer(false);
    setStudyProgramOffer(null);
    studyProgramOfferRef.current = null;
    if (pendingResetAfterOfferRef.current) {
      pendingResetAfterOfferRef.current = false;
      resetAllRef.current();
    }
    if (kontrolDone) {
      goToKontrolReportWhatsApp();
    }
  }, [kontrolDone, goToKontrolReportWhatsApp]);

  const goToStudyProgramFromOffer = useCallback(() => {
    const offer = studyProgramOfferRef.current;
    if (!offer) return;
    const href = buildStudyProgramHref(offer);
    setShowStudyProgramOffer(false);
    setStudyProgramOffer(null);
    studyProgramOfferRef.current = null;
    pendingResetAfterOfferRef.current = false;
    markClean();
    if (typeof window !== 'undefined') {
      window.location.assign(href);
    }
  }, [buildStudyProgramHref, markClean]);

  const extractAssignmentId = (data: unknown): number | null => {
    if (!data || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;
    const nested = obj.data;
    if (nested && typeof nested === 'object' && 'id' in (nested as object)) {
      const id = Number((nested as { id: unknown }).id);
      return Number.isFinite(id) ? id : null;
    }
    if ('id' in obj) {
      const id = Number(obj.id);
      return Number.isFinite(id) ? id : null;
    }
    return null;
  };

  const handleSave = async (
    status: 'PUBLISHED' | 'DRAFT',
    options?: { openWhatsApp?: boolean; keepPrintOpen?: boolean },
  ) => {
    const targetStudents = multiSelect ? selectedStudents : (selectedStudent ? [selectedStudent] : []);
    if (targetStudents.length === 0 || cart.length === 0) return;
    const openWhatsApp = options?.openWhatsApp ?? status === 'PUBLISHED';
    const keepPrintOpen = options?.keepPrintOpen ?? false;
    setSaving(true);
    if (openWhatsApp) setSendBusy(true);
    // Backend status mapping: PUBLISHED → ASSIGNED
    const backendStatus: 'ASSIGNED' | 'DRAFT' = status === 'PUBLISHED' ? 'ASSIGNED' : status;
    try {
      // Kitap → Ünite → Konu blokları (konu sınırları korunur; PDF hiyerarşisi bozulmaz)
      const grouped: Record<string, SelectedContent[]> = {};
      cart.forEach((c) => {
        const k = c.quotaKind ? `${c.bookId}:quota:${c.quotaKind}` : `${c.bookId}:${c.unitId}:${c.topicId}`;
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(c);
      });
      const lessons = Object.entries(grouped).map(([, contents], lessonOrder) => {
        const first = contents[0];
        return {
          resource_book: first.bookId,
          topic_name: first.topicName,
          content_mode: 'TOPIC',
          notes: '',
          order: lessonOrder,
          tasks: contents.map((c, taskOrder) => {
            const hist = c.quotaKind ? undefined : taskHistory[c.contentId];
            const isCompletion = isIncompleteHistory(hist);
            const autoNote = isCompletion ? buildCompletionNote(hist) : '';
            return {
              task_type: c.quotaKind ? 'SOLVE_TEST' : c.contentType === 'TEST_SET' ? 'SOLVE_TEST' : c.contentType === 'PAGE_RANGE' ? 'SOLVE_PDF' : c.contentType === 'VIDEO' ? 'WATCH_VIDEO' : 'REVIEW_TOPIC',
              title: c.contentName,
              description: (contentNotes[c.id] || '').trim() || autoNote,
              ...(c.quotaKind
                ? { quota_kind: c.quotaKind, question_count: c.questionCount || null }
                : {
                    content_id: c.contentId,
                    question_count: c.questionCount || null,
                    page_count: c.pageCount || (c.startPage && c.endPage ? c.endPage - c.startPage + 1 : null),
                  }),
              is_required: true,
              order: taskOrder,
              is_completion_task: isCompletion,
              previous_task_completion_percent: isCompletion
                ? (hist.completion_status === 'PARTIAL' ? (hist.task_completion_percent ?? 0) : null)
                : null,
              previous_assignment_title: isCompletion ? (hist.assignment_title ?? '') : '',
            };
          }),
        };
      });

      const finalTitle = stripCompletionTitleSuffix(title || generateWeeklyTitle());

      // Kaynak havuzu ↔ ödev izlenebilirliği: sepet tek bir kitaptan oluşuyorsa
      // (çoğunlukla haftalık ödev senaryosu) ve tekli öğrenci seçiliyse, bu
      // öğrencinin o kitaba ait StudentResourceAssignment kaydını bağla.
      // Toplu (çoklu öğrenci) atamada her öğrencinin kendi kaynak kaydı farklı
      // olacağından — ve burada yalnızca "birincil" öğrencinin kaynakları
      // yüklendiğinden — yanlış eşleştirme riski nedeniyle bağlanmıyor.
      const distinctBookIds = Array.from(new Set(cart.map((c) => c.bookId)));
      const sourceAssignmentId = (targetStudents.length === 1 && distinctBookIds.length === 1)
        ? (resources.find((r) => r.resource_book === distinctBookIds[0])?.id ?? null)
        : null;

      let successCount = 0;
      let failCount = 0;
      let lastCreatedId: number | null = null;
      let lastStudentName = '';
      const quotaItems = cart.filter((c) => c.quotaKind);
      for (const student of targetStudents) {
        const body = {
          student: student.id,
          title: finalTitle,
          description: notes,
          priority: priority,
          due_date: dueDateToApi(dueDate || getDefaultDueDate()),
          status: backendStatus,
          lessons,
          ...(packageTemplateId ? { template_id: packageTemplateId } : {}),
          ...(sourceAssignmentId ? { source_assignment: sourceAssignmentId } : {}),
        };
        try {
          const result = await createAssignment(body);
          if (result.success) {
            successCount++;
            const createdId = extractAssignmentId(result.data) ?? extractAssignmentId(result);
            if (createdId) {
              lastCreatedId = createdId;
              lastStudentName = `${student.ad} ${student.soyad}`.trim();
            }
            await Promise.all(quotaItems.map((item) => {
              const daily = item.dailyQuestionCount
                || Math.max(1, Math.round((item.questionCount || 7) / 7));
              return upsertStudentRoutineQuota({
                student: student.id,
                kind: item.quotaKind as RoutineQuotaKind,
                daily_question_count: daily,
                resource_book: item.bookId,
              }).catch(() => undefined);
            }));
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
          : openWhatsApp && lastCreatedId
            ? (targetStudents.length > 1
              ? `✅ ${successCount} ödev kaydedildi — WhatsApp için son öğrenci açılıyor`
              : `✅ Ödev kaydedildi — WhatsApp gönderimi açılıyor`)
            : `✅ Ödev kaydedildi — ${studentNames}`;
        flash(msg);

        const offerStudentId =
          targetStudents.length === 1
            ? targetStudents[0].id
            : (targetStudents[targetStudents.length - 1]?.id ?? 0);
        const offerPayload =
          status === 'PUBLISHED' && lastCreatedId && offerStudentId
            ? {
                assignmentId: lastCreatedId,
                studentId: offerStudentId,
                dueDate: dueDate || getDefaultDueDate(),
                assignedDate: formatLocalDate(new Date()),
              }
            : null;

        if (offerPayload) {
          studyProgramOfferRef.current = offerPayload;
          setStudyProgramOffer(offerPayload);
          pendingResetAfterOfferRef.current = true;
        }

        for (const student of targetStudents) {
          clearOdevVerDraft(student.id);
        }

        if (openWhatsApp && lastCreatedId) {
          setSavedAssignmentId(lastCreatedId);
          setSendStudentName(lastStudentName || studentNames);
          setShowSendAfterSave(true);
          setShowPrint(false);
          // Formu şimdi sıfırlama — WhatsApp + çalışma programı teklifi bitsin
        } else if (offerPayload) {
          // WhatsApp yoksa doğrudan çalışma programı teklifi
          setShowPrint(false);
          setShowStudyProgramOffer(true);
        } else if (lastCreatedId && kontrolDone && returnHref) {
          const sep = returnHref.includes('?') ? '&' : '?';
          forceNavigate(`${returnHref}${sep}notify=report`, { hard: true });
          return;
        } else if (!keepPrintOpen) {
          resetAll();
        }
      } else {
        flash(`⚠️ ${successCount} başarılı, ${failCount} başarısız — bazı ödevler gönderilemedi`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      flash('❌ Ödev kaydedilemedi: ' + msg);
    }
    setSaving(false);
    setSendBusy(false);
  };

  const resetAll = (opts?: { preserveSendState?: boolean }) => {
    markClean();
    if (selectedStudent) {
      clearOdevVerDraft(selectedStudent.id);
    }
    draftReadyRef.current = false;
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
    setBookProgress({});
    setUnitProgress({});
    if (!opts?.preserveSendState) {
      setShowSendAfterSave(false);
      setSavedAssignmentId(null);
      setSendStudentName('');
    }

    if (studentLocked && selectedStudent) {
      setMultiSelect(false);
      setSelectedStudents([selectedStudent]);
      setCurrentStep(2);
      setResourcePrefillDone(false);
      draftReadyRef.current = true;
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
  resetAllRef.current = resetAll;

  /* ─── Step Navigation ─── */
  const canGoToStep = (step: number): boolean => {
    if (step === 1) return !studentLocked;
    const hasStudent = multiSelect ? selectedStudents.length > 0 : !!selectedStudent;
    if (step === 2) return hasStudent;
    if (step === 3) return hasStudent && cart.length > 0;
    return false;
  };

  const goToStep = (step: number) => {
    if (!canGoToStep(step)) return;
    if (step === 3) {
      setTitle((t) => stripCompletionTitleSuffix(t || generateWeeklyTitle()));
    }
    setCurrentStep(step);
  };

  const isContentSelected = (id: number) => cart.some(c => c.id === id);
  const totalQ = cart.reduce((s, c) => s + (c.questionCount || 0), 0);

  /* ─── RENDER ─── */
  return (
    <>
      <UnsavedChangesModal {...leaveDialogProps} />
    <div
      ref={mainRef}
      className={`odev-ver-root${isCoach ? " odev-ver-coach" : ""}`}
      style={{ padding: 0, fontFamily: "'Poppins', sans-serif" }}
    >
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
            <button
              type="button"
              onClick={goBackToKontrol}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'rgba(255,255,255,0.2)',
                border: 'none', borderRadius: 10, color: '#fff',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              ← Kontrole dön
            </button>
          )}
          <button
            type="button"
            onClick={() => resetAll()}
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
      <div className="wizard-content" style={{ minHeight: 280 }}>
        {fromKontrol && currentStep === 2 && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              borderRadius: 12,
              border: '1.5px solid #a5b4fc',
              background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>
                  {kontrolDone ? 'Kontrol bitti — yeni ödev' : 'Kontrolden devam ediyorsunuz'}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#4338ca', lineHeight: 1.45 }}>
                  Dersleri sepete ekleyip kaydedin. Geri dönmek için yandaki butonu kullanın.
                </p>
              </div>
              {returnHref && (
                <button
                  type="button"
                  onClick={goBackToKontrol}
                  style={{
                    flexShrink: 0,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#4f46e5',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(79,70,229,0.35)',
                  }}
                >
                  ← Kontrole dön
                </button>
              )}
            </div>
          </div>
        )}
        {visiblePendingControls.length > 0 && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              borderRadius: 12,
              border: '1.5px solid #fbbf24',
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
              Kontrolü tamamlanmamış ödev var
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#78350f', lineHeight: 1.45 }}>
              Yeni ödev vermeden önce aşağıdaki ödev(ler)in kontrolünü tamamlamanız önerilir.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visiblePendingControls.map((pc) => (
                <div
                  key={pc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #fde68a',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#78350f' }}>
                    <strong>{pc.studentName}</strong>
                    {' · '}
                    {pc.title}
                  </div>
                  <Link
                    href={`${kontrolBase}/${pc.id}`}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      background: '#d97706',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ödev kontrolüne git
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
        {resourceGaps.length > 0 && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              borderRadius: 12,
              border: '1.5px solid #93c5fd',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
              Bazı öğrencilerin kaynak listesinde bu kitap yok
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#1e3a8a', lineHeight: 1.45 }}>
              Sepet, birincil öğrencinin kaynaklarına göre kuruldu. Aşağıdaki öğrenciler bu
              kitab(ı/ları) kaynak planlarında bulundurmuyor — ödev yine de atanabilir, ancak
              takip için doğru kitap/öğrenci eşleşmesini kontrol edin.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {resourceGaps.map((g) => (
                <div
                  key={g.studentId}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #bfdbfe',
                    fontSize: 13,
                    color: '#1e3a8a',
                  }}
                >
                  <strong>{g.studentName}</strong>
                  {': '}
                  {g.missingBookNames.join(', ')} kayıtlı değil
                </div>
              ))}
            </div>
          </div>
        )}
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
              bookProgress={bookProgress}
              unitProgress={unitProgress}
              initialOpenLessonId={preselectedLessonId}
              onPickResource={pickResource}
              onAddQuota={addQuotaToCart}
              lastQuotaDefaults={lastQuotaDefaults}
              onToggleContent={toggleContent}
              onSelectAllUnit={selectAllUnit}
              onSelectAllTopic={selectAllTopic}
              onSelectIncompleteUnit={selectIncompleteFromUnit}
              onSelectIncompleteTopic={selectIncompleteFromTopic}
              onRemoveContent={removeContent}
              onRemoveContents={removeContents}
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
              onRemoveMany={removeContents}
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
              onClick={() => {
                if (!canGoToStep(currentStep + 1)) return;
                const next = currentStep + 1;
                if (next === 3) {
                  setTitle((t) => stripCompletionTitleSuffix(t || generateWeeklyTitle()));
                }
                setCurrentStep(next);
              }}
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
          sendBusy={sendBusy || saving}
          onRequestSaveAndSend={() => handleSave('PUBLISHED', { openWhatsApp: true, keepPrintOpen: true })}
          onNotifyClose={finishAfterWhatsApp}
          onClose={() => setShowPrint(false)}
        />
      )}

      {showSendAfterSave && savedAssignmentId && (
        <AssignmentNotifySendModal
          assignmentId={savedAssignmentId}
          notifyType="plan"
          studentName={sendStudentName}
          onClose={finishAfterWhatsApp}
        />
      )}

      {showStudyProgramOffer && studyProgramOffer && (
        <>
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              zIndex: 10000,
            }}
            onClick={dismissStudyProgramOffer}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-program-offer-title"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: 20,
              padding: 24,
              zIndex: 10001,
              width: 'min(440px, calc(100vw - 32px))',
              boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>📅</div>
            <h2
              id="study-program-offer-title"
              style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#1e293b' }}
            >
              Bu ödeve çalışma programı hazırla
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Ödevin verilme ve kontrol tarihleri programa aktarılır. İsterseniz şimdi hazırlayın
              veya daha sonra yapın.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={goToStudyProgramFromOffer}
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 14,
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Çalışma programına geç
              </button>
              <button
                type="button"
                onClick={dismissStudyProgramOffer}
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: 13,
                  border: '1.5px solid #e2e8f0',
                  background: 'white',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}
