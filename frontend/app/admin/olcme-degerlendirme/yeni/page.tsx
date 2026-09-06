'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { curriculumApi, examApi, puanAyarlariApi } from '../../../../components/olcme/api';
import {
  EXAM_TYPES,
  BOOKLET_TYPES,
  SCHEDULE_PREFERENCES,
  EXAM_CREATE_FORM_DEFAULT,
} from '../../../../components/olcme/types';
import type {
  ExamCreateForm,
  ExamRoomItem,
  LookupItem,
  PreviewStudent,
  SchedulePreference,
  SeatingMode,
  SessionCreateForm,
  SubjectItem,
} from '../../../../components/olcme/types';
import {
  BAND_LGS,
  BAND_YKS,
  bandIsLocked,
  bandLabel,
  resolveBand,
} from '../../../../components/olcme/curriculum-band';
import { matchSubjectId } from '../../../../components/olcme/SubjectPicker';
import tree from '../../../../components/olcme/section-tree.module.css';
import { groupSeated, previewSeating } from '../../../../components/olcme/roster/seating';
import AudiencePicker from '../../../../components/olcme/roster/AudiencePicker';
import ManualSectionsEditor, { TemplatePreview } from '../../../../components/olcme/ManualSectionsEditor';
import {
  isManualSectionExamType,
  rangesFromCounts,
  templateOpticalTotal,
  templateToDrafts,
  totalQuestionsFromDrafts,
  type ManualSectionDraft,
} from '../../../../components/olcme/manual-sections';
import r from '../../../../components/olcme/roster/roster.module.css';
import Icon from '../../../../components/olcme/ui/Icon';
import y from './yeni.module.css';

const WIZARD = [
  { n: 1, label: 'Bilgi', full: 'Sınav bilgisi' },
  { n: 2, label: 'Kitle', full: 'Kimler girecek' },
  { n: 3, label: 'Liste', full: 'Katılımcı listesi' },
  { n: 4, label: 'Salon', full: 'Salonlar' },
  { n: 5, label: 'Oturma', full: 'Oturma düzeni' },
  { n: 6, label: 'Özet', full: 'Kayıt özeti' },
] as const;

const TYPE_META: Record<string, { short: string; hint: string }> = {
  YKS_TYT: { short: 'TYT', hint: 'Temel yeterlilik' },
  YKS_AYT: { short: 'AYT', hint: 'Alan yeterlilik' },
  LGS: { short: 'LGS', hint: 'Liselere geçiş' },
  DENEME: { short: 'Deneme', hint: 'Kurum denemesi' },
  KURUM_ICI: { short: 'Kurum', hint: 'İç sınav' },
  KONU_TARAMA: { short: 'Tarama', hint: 'Dersi sen seç' },
  KAZANIM: { short: 'Kazanım', hint: 'Kazanım ölç' },
  OZEL: { short: 'Özel', hint: 'Serbest şablon' },
};

/* ── Oturum boş form ──────────────────────────────────────────────────────── */
const EMPTY_SESSION: SessionCreateForm = {
  name: '', order: 0, session_date: '', start_time: '', end_time: '',
  duration_minutes: '', schedule_preference: 'FARKETMEZ', description: '', section_ids: [],
};

type TemplateSec = {
  name: string; question_start: number; question_end: number;
  question_count: number; order: number;
};
type TemplateMap = Record<string, {
  label: string;
  duration: number;
  sections: TemplateSec[];
  sub_sections?: Record<string, TemplateSec[]>;
}>;

/** "10:00" + 135dk → "12:15" */
function addMinutes(time: string, minutes: number): string {
  if (!/^\d{2}:\d{2}$/.test(time) || !minutes) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const fmtSessionDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function YeniSinavPage() {
  const router = useRouter();

  const [form, setForm]             = useState<ExamCreateForm>({ ...EXAM_CREATE_FORM_DEFAULT });
  const [sessions, setSessions]     = useState<SessionCreateForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched]       = useState(false);

  /* Lookup verileri */
  const [siniflar, setSiniflar]                 = useState<LookupItem[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri]   = useState<LookupItem[]>([]);
  const [denemePaketleri, setDenemePaketleri]   = useState<LookupItem[]>([]);
  const [kurumDefaultYear, setKurumDefaultYear] = useState(2025);
  const [managedYears, setManagedYears]         = useState<number[]>([2024, 2025, 2026]);
  const [existingNames, setExistingNames]       = useState<string[]>([]);

  const [templates, setTemplates] = useState<TemplateMap>({});
  const [manualSections, setManualSections] = useState<ManualSectionDraft[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<SubjectItem[]>([]);
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<PreviewStudent[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [removedAutoIds, setRemovedAutoIds] = useState<number[]>([]);
  const [manuals, setManuals] = useState<PreviewStudent[]>([]);
  const [rooms, setRooms] = useState<ExamRoomItem[]>([{ name: 'Salon 1', capacity: 30, order: 0 }]);
  const [seatingMode, setSeatingMode] = useState<SeatingMode>('shuffle');
  const [seatingTick, setSeatingTick] = useState(0);

  /* ── Veri yükleme ────────────────────────────────────────────────────────── */
  useEffect(() => {
    examApi.siniflar().then(setSiniflar).catch(() => {});
    examApi.sinifSeviyeleri().then(setSinifSeviyeleri).catch(() => {});
    examApi.denemePaketleri().then(setDenemePaketleri).catch(() => {});
    examApi.list().then(list => setExistingNames(list.map(e => e.name))).catch(() => {});
    puanAyarlariApi.get().then(d => {
      setKurumDefaultYear(d.default_puan_yili);
      setManagedYears(d.managed_years);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    examApi.templates(form.include_optional_philosophy).then(setTemplates).catch(() => {});
  }, [form.include_optional_philosophy]);

  const currentTemplate = form.exam_type ? templates[form.exam_type] : null;
  const manualTemplate = isManualSectionExamType(form.exam_type);

  /* Sınav türü seçilince süre şablondan gelir; konu tarama/kazanım/özelde şablon kapalı */
  useEffect(() => {
    if (!form.exam_type) return;
    const tpl = templates[form.exam_type];
    setForm(p => ({
      ...p,
      duration_minutes: tpl ? String(tpl.duration) : p.duration_minutes,
      apply_template: !isManualSectionExamType(form.exam_type),
      curriculum_band: resolveBand(form.exam_type, p.curriculum_band),
    }));
    setManualSections([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.exam_type, templates]);

  const activeBand = resolveBand(form.exam_type, form.curriculum_band);

  useEffect(() => {
    if (!form.exam_type) {
      setCurriculumSubjects([]);
      return;
    }
    curriculumApi.listSubjects(undefined, activeBand)
      .then(setCurriculumSubjects)
      .catch(() => setCurriculumSubjects([]));
  }, [form.exam_type, activeBand]);

  useEffect(() => {
    if (!curriculumSubjects.length) return;
    const allowed = new Set(curriculumSubjects.map(item => item.id));
    setManualSections(prev => {
      let changed = false;
      const nextId = (current: number | null, name: string) => {
        if (current && allowed.has(current)) return current;
        const matched = matchSubjectId(curriculumSubjects, name);
        if (matched !== current) changed = true;
        return matched;
      };
      const next = prev.map(row => {
        const subject_id = nextId(row.subject_id, row.name);
        const sub_sections = row.sub_sections.map(sub => {
          const subId = nextId(sub.subject_id, sub.name);
          return subId === sub.subject_id ? sub : { ...sub, subject_id: subId };
        });
        if (subject_id === row.subject_id && sub_sections.every((sub, i) => sub === row.sub_sections[i])) {
          return row;
        }
        return { ...row, subject_id, sub_sections };
      });
      return changed ? next : prev;
    });
  }, [curriculumSubjects]);

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  const setField = useCallback(
    <K extends keyof ExamCreateForm>(key: K, value: ExamCreateForm[K]) =>
      setForm(p => ({ ...p, [key]: value })), [],
  );

  const templatesReady = Object.keys(templates).length > 0;
  const hasBuiltInTemplate = !!(currentTemplate && currentTemplate.sections.length > 0);
  const editingTemplate = manualTemplate
    || !form.apply_template
    || (templatesReady && !!form.exam_type && !hasBuiltInTemplate);

  const seedDrafts = (sections: TemplateSec[], subSections?: Record<string, TemplateSec[]>) =>
    templateToDrafts(sections, subSections).map(row => ({
      ...row,
      subject_id: matchSubjectId(curriculumSubjects, row.name),
      sub_sections: row.sub_sections.map(sub => ({
        ...sub,
        subject_id: matchSubjectId(curriculumSubjects, sub.name),
      })),
    }));

  const startEditingTemplate = () => {
    if (currentTemplate) setManualSections(seedDrafts(currentTemplate.sections, currentTemplate.sub_sections));
    setField('apply_template', false);
  };
  const resetBuiltInTemplate = () => {
    setManualSections([]);
    setField('apply_template', true);
  };

  const toggleSinif = (id: number) =>
    setForm(p => ({
      ...p,
      sinif_ids: p.sinif_ids.includes(id)
        ? p.sinif_ids.filter(x => x !== id)
        : [...p.sinif_ids, id],
    }));

  const toggleSeviye = (id: number) =>
    setForm(p => ({
      ...p,
      sinif_seviyesi_ids: p.sinif_seviyesi_ids.includes(id)
        ? p.sinif_seviyesi_ids.filter(x => x !== id)
        : [...p.sinif_seviyesi_ids, id],
    }));

  const togglePaket = (id: number) =>
    setForm(p => ({
      ...p,
      deneme_paketi_ids: p.deneme_paketi_ids.includes(id)
        ? p.deneme_paketi_ids.filter(x => x !== id)
        : [...p.deneme_paketi_ids, id],
    }));

  const addSession = () =>
    setSessions(p => [...p, {
      ...EMPTY_SESSION,
      name: `${p.length + 1}. Oturum`,
      order: p.length,
      // Aynı gün içinde ard arda oturumlar sık olduğu için tarih önceki oturumdan kopyalanır
      session_date: p.length > 0 ? p[p.length - 1].session_date : '',
      duration_minutes: form.duration_minutes || (currentTemplate ? String(currentTemplate.duration) : ''),
    }]);

  const updateSession = (i: number, field: keyof SessionCreateForm, value: unknown) =>
    setSessions(p => p.map((ss, j) => {
      if (j !== i) return ss;
      const next = { ...ss, [field]: value } as SessionCreateForm;
      // Başlangıç saati veya süre değişince bitiş saatini otomatik hesapla
      if (field === 'start_time' || field === 'duration_minutes') {
        const computed = addMinutes(next.start_time, Number(next.duration_minutes));
        if (computed) next.end_time = computed;
      }
      return next;
    }));

  const removeSession = (i: number) =>
    setSessions(p => p
      .filter((_, j) => j !== i)
      .map((ss, j) => ({ ...ss, order: j })));

  /* ── Doğrulama ───────────────────────────────────────────────────────────── */
  const validate = useCallback((): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (!form.name.trim()) errs.name = 'Sınav adı zorunludur.';
    if (!form.exam_type)   errs.exam_type = 'Sınav türü seçiniz.';
    if ((isManualSectionExamType(form.exam_type) || !form.apply_template)
      && rangesFromCounts(manualSections).length === 0) {
      errs.sections = 'En az bir üst ders giriniz veya hazır şablona dönün.';
    }

    if (form.duration_minutes && Number(form.duration_minutes) <= 0) {
      errs.duration_minutes = 'Süre 0’dan büyük olmalıdır.';
    }

    if (form.result_publish_date && form.answer_key_publish_date
      && form.answer_key_publish_date < form.result_publish_date) {
      errs.answer_key_publish_date =
        'Cevap anahtarı yayın tarihi, sınav yayın tarihinden önce olamaz.';
    }

    const names = new Set<string>();
    sessions.forEach((ss, i) => {
      const label = ss.name.trim();
      if (!label) {
        errs[`session_${i}`] = 'Oturum adı zorunludur.';
      } else if (names.has(label.toLowerCase())) {
        errs[`session_${i}`] = 'Aynı sınavda iki oturum aynı adı taşıyamaz.';
      } else {
        names.add(label.toLowerCase());
      }
      if (ss.start_time && ss.end_time && ss.end_time <= ss.start_time) {
        errs[`session_${i}`] = 'Bitiş saati başlangıç saatinden sonra olmalıdır.';
      }
      if (ss.duration_minutes && Number(ss.duration_minutes) <= 0) {
        errs[`session_${i}`] = 'Oturum süresi 0’dan büyük olmalıdır.';
      }
    });

    return errs;
  }, [form, sessions, manualSections]);

  useEffect(() => {
    if (touched) setFieldErrors(validate());
  }, [touched, validate]);

  const duplicateName = useMemo(
    () => form.name.trim().length > 0
      && existingNames.some(n => n.toLowerCase() === form.name.trim().toLowerCase()),
    [form.name, existingNames],
  );

  /* Oturumlardan türetilen sınav tarihi — backend de aynı kuralı uygular */
  const derivedExamDate = useMemo(() => {
    const dates = sessions.map(ss => ss.session_date).filter(Boolean).sort();
    return dates[0] ?? '';
  }, [sessions]);

  const loadPreview = useCallback(async () => {
    if (!form.sinif_ids.length && !form.sinif_seviyesi_ids.length && !form.deneme_paketi_ids.length) {
      setPreview([]);
      return;
    }
    setPreviewLoading(true);
    try {
      const data = await examApi.previewParticipants({
        sinif_ids: form.sinif_ids,
        sinif_seviyesi_ids: form.sinif_seviyesi_ids,
        deneme_paketi_ids: form.deneme_paketi_ids,
      });
      setPreview(data.students);
    } catch {
      setPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [form.sinif_ids, form.sinif_seviyesi_ids, form.deneme_paketi_ids]);

  useEffect(() => {
    if (step >= 3) loadPreview();
  }, [step, loadPreview]);

  const roster = useMemo(() => {
    const removed = new Set(removedAutoIds);
    const auto = preview.filter(p => !removed.has(p.student_id));
    const taken = new Set(auto.map(p => p.student_id));
    return [...auto, ...manuals.filter(m => !taken.has(m.student_id))];
  }, [preview, removedAutoIds, manuals]);

  const totalCap = rooms.reduce((a, r) => a + (Number(r.capacity) || 0), 0);
  const capError = rooms.some(r => r.name.trim()) && roster.length > totalCap
    ? `${roster.length} öğrenci için toplam salon kapasitesi ${totalCap}.`
    : '';

  const seated = useMemo(
    () => previewSeating(roster, rooms, seatingMode),
    // seatingTick yeniden karıştırmayı tetikler
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, rooms, seatingMode, seatingTick],
  );
  const seatedByRoom = useMemo(() => groupSeated(seated), [seated]);

  const goNext = () => {
    if (step === 1) {
      setTouched(true);
      const errs = validate();
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) {
        setError('Lütfen işaretli alanları düzeltin.');
        return;
      }
      setError('');
    }
    if (step === 4 && capError) {
      setError(capError);
      return;
    }
    if (step === 5 && capError) {
      setError(capError);
      return;
    }
    setError('');
    setStep(n => Math.min(6, n + 1));
  };

  /* ── Submit ──────────────────────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Lütfen işaretli alanları düzeltin.');
      setStep(1);
      return;
    }
    if (capError) {
      setError(capError);
      setStep(4);
      return;
    }

    setSubmitting(true);
    setError('');

    let examId: number | null = null;
    try {
      const exam = await examApi.create({
        ...form,
        apply_template: editingTemplate ? false : form.apply_template,
        sections: editingTemplate ? rangesFromCounts(manualSections) : undefined,
        deneme_paketi: form.deneme_paketi_ids[0] ?? form.deneme_paketi,
        rooms: rooms.filter(r => r.name.trim()),
        manual_student_ids: manuals.map(m => m.student_id),
        removed_auto_ids: removedAutoIds,
        seating_mode: rooms.some(r => r.name.trim()) ? seatingMode : undefined,
        seat_assignments: seated.map(x => ({
          student_id: x.student_id,
          room_name: x.room_name,
          room_index: x.room_index,
          seat_no: x.seat_no,
        })),
        sessions,
      });
      examId = exam.id;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sınav oluşturulamadı.');
      setSubmitting(false);
      return;
    }

    router.push(`/admin/olcme-degerlendirme/${examId}`);
  };

  const templateTotal = currentTemplate
    ? templateOpticalTotal(currentTemplate.sections, currentTemplate.sub_sections)
    : 0;
  const questionTotal = editingTemplate
    ? totalQuestionsFromDrafts(manualSections)
    : (form.apply_template && currentTemplate ? templateTotal : 0);
  const sectionTotal = editingTemplate
    ? rangesFromCounts(manualSections).length
    : (form.apply_template && currentTemplate ? currentTemplate.sections.length : 0);
  const sectionCountLabel = questionTotal
    ? `${sectionTotal} üst · ${questionTotal} soru`
    : '—';

  const err = (key: string) => (touched ? fieldErrors[key] : undefined);
  const typeMeta = form.exam_type ? TYPE_META[form.exam_type] : null;

  /* ═══════════ RENDER ═══════════ */

  return (
    <div className={`section ${y.page}`}>

      <header className={y.header}>
        <div className={y.headerTop}>
          <div style={{ minWidth: 0 }}>
            <nav className={y.breadcrumb} aria-label="Konum">
              <button type="button" className={y.crumbLink} onClick={() => router.push('/admin/olcme-degerlendirme')}>
                Sınav Yönetimi
              </button>
              <Icon name="chevronRight" size={13} />
              <span className={y.crumbCurrent}>Yeni Sınav</span>
            </nav>
            <div className={y.titleBlock}>
              <span className={y.titleIcon}><Icon name="plus" size={22} /></span>
              <div style={{ minWidth: 0 }}>
                <h1 className={y.title}>Yeni Sınav Oluştur</h1>
                <p className={y.subtitle}>
                  Türü seç, şablonu kontrol et, kitle ve salonu sonraki adımlarda ayarla.
                </p>
              </div>
            </div>
          </div>
          <button type="button" className={y.action} onClick={() => router.push('/admin/olcme-degerlendirme')}>
            <Icon name="back" size={15} />
            <span className={y.actionLabel}>Listeye dön</span>
          </button>
        </div>
        <div className={y.metrics}>
          <div className={y.metric}>
            <span className={y.metricValue}>{typeMeta?.short || '—'}</span>
            <span className={y.metricLabel}><Icon name="exam" size={12} />Tür</span>
          </div>
          <div className={y.metric}>
            <span className={y.metricValue}>{questionTotal || '—'}</span>
            <span className={y.metricLabel}><Icon name="layers" size={12} />Soru</span>
          </div>
          <div className={y.metric}>
            <span className={y.metricValue}>{form.duration_minutes || '—'}</span>
            <span className={y.metricLabel}><Icon name="clock" size={12} />Süre (dk)</span>
          </div>
          <div className={y.metric}>
            <span className={y.metricValue}>{derivedExamDate ? fmtSessionDate(derivedExamDate) : 'Tarihsiz'}</span>
            <span className={y.metricLabel}><Icon name="calendar" size={12} />Tarih</span>
          </div>
          <div className={y.metric}>
            <span className={y.metricValue}>{sessions.length || '—'}</span>
            <span className={y.metricLabel}><Icon name="document" size={12} />Oturum</span>
          </div>
        </div>
      </header>

      {error && (
        <div className={`${y.notice} ${y.noticeError}`} role="alert">
          <Icon name="error" size={18} />
          <div>{error}</div>
        </div>
      )}

      <nav className={y.stepper} aria-label="Oluşturma adımları">
        <div className={y.stepperTrack}>
          {WIZARD.map(w => (
            <button
              key={w.n}
              type="button"
              className={`${y.stepBtn} ${step === w.n ? y.stepOn : ''} ${step > w.n ? y.stepDone : ''}`}
              onClick={() => { if (w.n <= step) setStep(w.n); }}
              disabled={w.n > step}
            >
              <span className={y.stepDot}>
                {step > w.n ? <Icon name="check" size={13} strokeWidth={3} /> : w.n}
              </span>
              <span className={y.stepLabel}>{w.label}</span>
            </button>
          ))}
        </div>
        <p className={y.stepperNow}>{WIZARD[step - 1]?.full}</p>
      </nav>

      <form onSubmit={handleSubmit} noValidate>
        {step === 1 && (
        <div className={y.stack}>
          <section className={y.card}>
            <div className={y.cardHead}>
              <div>
                <h2>Temel bilgiler</h2>
              </div>
            </div>
            <div className={y.cardBody}>
              <div className={y.fields}>
                <label className={y.field}>
                  <span>Sınav adı *</span>
                  <input
                    placeholder="Örn: TYT Deneme 1"
                    value={form.name}
                    data-invalid={err('name') ? 'true' : undefined}
                    onChange={e => setField('name', e.target.value)}
                    onBlur={() => setTouched(true)}
                  />
                  {err('name') && <em className={y.fieldErr}>{err('name')}</em>}
                  {duplicateName && !err('name') && (
                    <em className={y.fieldErr} style={{ color: '#b45309' }}>Bu adla bir sınav zaten var.</em>
                  )}
                </label>
                <div className={y.fields3}>
                  <label className={y.field}>
                    <span>Sınav türü *</span>
                    <select
                      value={form.exam_type}
                      data-invalid={err('exam_type') ? 'true' : undefined}
                      onChange={e => setField('exam_type', e.target.value as ExamCreateForm['exam_type'])}
                      onBlur={() => setTouched(true)}
                    >
                      <option value="">Seçiniz…</option>
                      {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {err('exam_type') && <em className={y.fieldErr}>{err('exam_type')}</em>}
                  </label>
                  <label className={y.field}>
                    <span>Toplam süre (dk)</span>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="165"
                      value={form.duration_minutes}
                      data-invalid={err('duration_minutes') ? 'true' : undefined}
                      onChange={e => setField('duration_minutes', e.target.value)}
                    />
                    {err('duration_minutes') && <em className={y.fieldErr}>{err('duration_minutes')}</em>}
                  </label>
                  <label className={y.field}>
                    <span>Kitapçık türü</span>
                    <select value={form.booklet_type} onChange={e => setField('booklet_type', e.target.value)}>
                      {BOOKLET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className={y.fields2}>
                  <label className={y.field}>
                    <span>Yanlış cevap düzeltme</span>
                    <select value={form.wrong_answer_count} onChange={e => setField('wrong_answer_count', e.target.value)}>
                      <option value="0">Ceza yok</option>
                      <option value="3">3 yanlış → 1 doğruyu götürür</option>
                      <option value="4">4 yanlış → 1 doğruyu götürür</option>
                      <option value="5">5 yanlış → 1 doğruyu götürür</option>
                    </select>
                  </label>
                  <label className={y.field}>
                    <span>Açıklama</span>
                    <textarea
                      placeholder="Opsiyonel açıklama…"
                      value={form.description}
                      onChange={e => setField('description', e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className={y.card}>
            <div className={y.cardHead}>
              <div>
                <h2>Oturumlar &amp; zamanlama</h2>
                <p>
                  Sınav tarihi oturumlardan alınır: en erken oturum günü takvime işlenir.
                  {derivedExamDate && <> Şu anki tarih: <strong>{fmtSessionDate(derivedExamDate)}</strong></>}
                </p>
              </div>
              <button type="button" className={y.ghost} onClick={addSession}>+ Oturum ekle</button>
            </div>
            <div className={y.cardBody}>
              {sessions.length === 0 ? (
                <div className={y.empty}>
                  Henüz oturum eklenmedi. Oturum yoksa sınav tarihsiz kaydedilir ve takvimde görünmez.
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className={y.ghost} onClick={addSession}>+ İlk oturumu ekle</button>
                  </div>
                </div>
              ) : sessions.map((sess, idx) => (
                <div key={idx} className={y.session}>
                  <div className={y.sessionTop}>
                    <div className={y.sessionWho}>
                      <span className={y.sessionNum}>{idx + 1}</span>
                      <div>
                        <div className={y.sessionTitle}>{sess.name || `${idx + 1}. Oturum`}</div>
                        <div className={y.sessionMeta}>
                          {sess.session_date ? fmtSessionDate(sess.session_date) : 'Tarih yok'}
                          {sess.start_time ? ` · ${sess.start_time}` : ''}
                        </div>
                      </div>
                    </div>
                    <button type="button" className={y.danger} onClick={() => removeSession(idx)}>Kaldır</button>
                  </div>
                  <div className={y.fields3}>
                    <label className={y.field}>
                      <span>Oturum adı *</span>
                      <input value={sess.name} placeholder="1. Oturum"
                        onChange={e => updateSession(idx, 'name', e.target.value)}
                        onBlur={() => setTouched(true)} />
                    </label>
                    <label className={y.field}>
                      <span>Tarih</span>
                      <input type="date" value={sess.session_date}
                        onChange={e => updateSession(idx, 'session_date', e.target.value)} />
                    </label>
                    <label className={y.field}>
                      <span>Süre (dk)</span>
                      <input type="number" min={1} inputMode="numeric" value={sess.duration_minutes} placeholder="75"
                        onChange={e => updateSession(idx, 'duration_minutes', e.target.value)} />
                    </label>
                  </div>
                  <div className={y.fields3}>
                    <label className={y.field}>
                      <span>Başlangıç</span>
                      <input type="time" value={sess.start_time}
                        onChange={e => updateSession(idx, 'start_time', e.target.value)} />
                    </label>
                    <label className={y.field}>
                      <span>Bitiş (otomatik)</span>
                      <input type="time" value={sess.end_time}
                        onChange={e => updateSession(idx, 'end_time', e.target.value)} />
                    </label>
                    <div className={y.field}>
                      <span>Gün tercihi</span>
                      <div className={y.prefs}>
                        {SCHEDULE_PREFERENCES.map(pref => (
                          <button key={pref.value} type="button"
                            className={sess.schedule_preference === pref.value ? y.prefOn : y.pref}
                            onClick={() => updateSession(idx, 'schedule_preference', pref.value as SchedulePreference)}>
                            {pref.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {err(`session_${idx}`) && <em className={y.fieldErr}>{err(`session_${idx}`)}</em>}
                </div>
              ))}
            </div>
          </section>

          <section className={y.card}>
            <div className={y.cardHead}>
              <div>
                <h2>Yayın tarihleri &amp; puanlama</h2>
                <p>
                  Yayın saatleri zorunlu değildir. Otomatik WhatsApp için sınav detayında
                  Zamanlı anahtarını ayrıca açın. Bu tarihler öğrenci ekranını kısıtlamaz.
                </p>
              </div>
            </div>
            <div className={y.cardBody}>
              <div className={y.fields3}>
                <label className={y.field}>
                  <span>Sonuç yayın tarihi</span>
                  <input type="datetime-local" value={form.result_publish_date}
                    onChange={e => setField('result_publish_date', e.target.value)} />
                </label>
                <label className={y.field}>
                  <span>Cevap anahtarı yayın tarihi</span>
                  <input
                    type="datetime-local"
                    value={form.answer_key_publish_date}
                    data-invalid={err('answer_key_publish_date') ? 'true' : undefined}
                    onChange={e => setField('answer_key_publish_date', e.target.value)}
                  />
                  {err('answer_key_publish_date') && <em className={y.fieldErr}>{err('answer_key_publish_date')}</em>}
                </label>
                <label className={y.field}>
                  <span>Puan yılı</span>
                  <select
                    value={form.puan_yili ?? ''}
                    onChange={e => setField('puan_yili', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Kurum varsayılanı ({kurumDefaultYear})</option>
                    {managedYears.map(yr => (
                      <option key={yr} value={yr}>{yr} YKS{yr === 2026 ? ' (henüz resmi değil)' : ''}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={y.toggles} style={{ marginTop: 12 }}>
                <label className={y.toggle}>
                  <input type="checkbox" checked={form.per_section_penalty}
                    onChange={e => setField('per_section_penalty', e.target.checked)} />
                  <span>Bölüm bazlı ceza uygula</span>
                </label>
                <label className={y.toggle}>
                  <input type="checkbox" checked={form.booklet_auto_detect}
                    onChange={e => setField('booklet_auto_detect', e.target.checked)} />
                  <span>Kitapçık otomatik tespit</span>
                </label>
                {(form.exam_type === 'YKS_TYT' || form.exam_type === 'DENEME') && (
                  <label className={y.toggle}>
                    <input type="checkbox" checked={form.include_optional_philosophy}
                      onChange={e => setField('include_optional_philosophy', e.target.checked)} />
                    <span>Felsefe (Seçmeli) dahil — Sosyal Bilimler içinde, Din Kültürü sonrası</span>
                  </label>
                )}
              </div>
            </div>
          </section>

          <section className={y.card}>
            <div className={y.cardHead}>
              <div>
                <h2>Bölüm şablonu</h2>
                <p>
                  {questionTotal
                    ? `${questionTotal} soru · ${sectionTotal} üst ders`
                    : 'Sınav türü seçildiğinde bölümler burada görünür.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {hasBuiltInTemplate && !manualTemplate && !editingTemplate && (
                  <button type="button" className={y.ghost} onClick={startEditingTemplate}>Şablonu düzenle</button>
                )}
                {hasBuiltInTemplate && !manualTemplate && editingTemplate && (
                  <button type="button" className={y.ghost} onClick={resetBuiltInTemplate}>Hazır şablona dön</button>
                )}
              </div>
            </div>
            <div className={y.cardBody}>
              {form.exam_type && (
                <div className={tree.bandRow}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 650 }}>Müfredat</span>
                  {bandIsLocked(form.exam_type) ? (
                    <span className={tree.bandBtnOn}>{bandLabel(activeBand)}</span>
                  ) : (
                    <>
                      <button type="button" className={activeBand === BAND_YKS ? tree.bandBtnOn : tree.bandBtn}
                        onClick={() => setField('curriculum_band', BAND_YKS)}>
                        {bandLabel(BAND_YKS)}
                      </button>
                      <button type="button" className={activeBand === BAND_LGS ? tree.bandBtnOn : tree.bandBtn}
                        onClick={() => setField('curriculum_band', BAND_LGS)}>
                        {bandLabel(BAND_LGS)}
                      </button>
                    </>
                  )}
                </div>
              )}
              {!form.exam_type ? (
                <p className={y.hint}>Sınav türü seçildiğinde bölümler burada görünecek.</p>
              ) : editingTemplate ? (
                <>
                  {hasBuiltInTemplate && !manualTemplate && (
                    <p className={y.hint}>
                      Hazır şablonu düzenliyorsunuz. Ders ekleyip çıkarabilir, müfredattan bağlayabilirsiniz.
                    </p>
                  )}
                  <ManualSectionsEditor
                    drafts={manualSections}
                    onChange={setManualSections}
                    subjects={curriculumSubjects}
                    error={err('sections')}
                  />
                </>
              ) : currentTemplate && currentTemplate.sections.length > 0 ? (
                <>
                  <p className={y.hint}>
                    Süre: {currentTemplate.duration} dk. Ders eklemek veya çıkarmak için şablonu düzenleyin.
                  </p>
                  <TemplatePreview
                    sections={currentTemplate.sections}
                    subSections={currentTemplate.sub_sections}
                  />
                </>
              ) : (
                <p className={y.hint}>Bu sınav türünde hazır bölüm yok; üst ders ekleyerek başlayın.</p>
              )}
            </div>
          </section>

          <button type="button" className={y.primaryWide} onClick={goNext}>
            Katılımcılara geç
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        )}

        {step === 2 && (
          <div className={r.page}>
            <div className={r.hero}>
              <div className={r.heroCopy}>
                <h2>Kimler girecek?</h2>
                <p>
                  Sınıf, seviye ve deneme paketini dilediğiniz gibi birleştirin.
                  Aynı öğrenci bir kez gelir. Seviye + paket birlikte seçilirse kesişim alınır;
                  konu tarama için yalnız sınıf yeter.
                </p>
              </div>
              <div className={r.stats}>
                <div className={r.stat}><span className={r.statValue}>{form.sinif_ids.length}</span><span className={r.statLabel}>Sınıf</span></div>
                <div className={r.stat}><span className={r.statValue}>{form.sinif_seviyesi_ids.length}</span><span className={r.statLabel}>Seviye</span></div>
                <div className={r.stat}><span className={r.statValue}>{form.deneme_paketi_ids.length}</span><span className={r.statLabel}>Paket</span></div>
              </div>
            </div>
            <AudiencePicker
              sinifSeviyeleri={sinifSeviyeleri}
              siniflar={siniflar}
              denemePaketleri={denemePaketleri}
              sinifSeviyesiIds={form.sinif_seviyesi_ids}
              sinifIds={form.sinif_ids}
              denemePaketiIds={form.deneme_paketi_ids}
              onToggleSeviye={toggleSeviye}
              onToggleSinif={toggleSinif}
              onTogglePaket={togglePaket}
            />
          </div>
        )}

        {step === 3 && (
          <div className={r.page}>
            <div className={r.hero}>
              <div className={r.heroCopy}>
                <h2>Katılımcı listesi</h2>
                <p>
                  Kitle kurallarına uyan öğrenciler. Çıkardığınız kayıtlar oluşturulmaz;
                  eksik kalanı sınav kaydından sonra Katılımcılar sekmesinden eklersiniz.
                </p>
              </div>
              <div className={r.stat}>
                <span className={r.statValue}>{roster.length}</span>
                <span className={r.statLabel}>öğrenci</span>
              </div>
            </div>
            <section className={r.card}>
              <div className={r.cardBody}>
                {previewLoading ? <p className={r.meta}>Liste hazırlanıyor…</p> : roster.length === 0 ? (
                  <div className={r.empty}>
                    <b>Henüz öğrenci yok</b>
                    Bir önceki adımda sınıf, seviye veya paket seçin.
                  </div>
                ) : (
                  <div className={r.list}>
                    {roster.map((st, idx) => (
                      <div key={st.student_id} className={r.row}>
                        <span className={r.seat}>{idx + 1}</span>
                        <div>
                          <div className={r.name}>{st.full_name}</div>
                          <div className={r.meta}>{st.okul_no ? `#${st.okul_no} · ` : ''}{st.sinif || st.sinif_seviyesi || 'Sınıfsız'}</div>
                        </div>
                        <span className={r.meta}>{st.source === 'manual' ? 'Manuel' : 'Otomatik'}</span>
                        <button type="button" className={r.ghost} onClick={() => {
                          if (manuals.some(m => m.student_id === st.student_id)) {
                            setManuals(p => p.filter(m => m.student_id !== st.student_id));
                          } else {
                            setRemovedAutoIds(p => [...new Set([...p, st.student_id])]);
                          }
                        }}>Çıkar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {step === 4 && (
          <div className={r.page}>
            <div className={r.hero}>
              <div className={r.heroCopy}>
                <h2>Salonlar</h2>
                <p>{roster.length} öğrenci yerleştirilecek. Toplam kapasite {totalCap} olmalı.</p>
              </div>
              <div className={r.stat}>
                <span className={r.statValue}>{totalCap}</span>
                <span className={r.statLabel}>kişilik</span>
              </div>
            </div>
            {capError && <div className={`${y.notice} ${y.noticeError}`}>{capError}</div>}
            <section className={r.card}>
              <div className={r.cardBody}>
                {rooms.map((room, i) => (
                  <div key={i} className={y.roomEdit}>
                    <label className={y.field}>
                      <span>Salon adı</span>
                      <input value={room.name}
                        onChange={e => setRooms(p => p.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} />
                    </label>
                    <label className={y.field}>
                      <span>Kapasite</span>
                      <input type="number" min={1} inputMode="numeric" value={room.capacity}
                        onChange={e => setRooms(p => p.map((item, j) => j === i ? { ...item, capacity: Number(e.target.value) || 1 } : item))} />
                    </label>
                    <button type="button" className={y.danger} onClick={() => setRooms(p => p.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <button type="button" className={y.ghost}
                  onClick={() => setRooms(p => [...p, { name: `Salon ${p.length + 1}`, capacity: 30, order: p.length }])}>
                  <Icon name="plus" size={14} /> Salon ekle
                </button>
              </div>
            </section>
          </div>
        )}

        {step === 5 && (
          <div className={r.page}>
            <div className={r.hero}>
              <div className={r.heroCopy}>
                <h2>Oturma düzeni</h2>
                <p>Kuralı seçin, listeyi görün. Beğenmezseniz yeniden karıştırın — kayıtta bu düzen kullanılır.</p>
              </div>
              <button type="button" className={y.primary} onClick={() => setSeatingTick(n => n + 1)}>
                Yeniden karıştır
              </button>
            </div>
            {capError && <div className={`${y.notice} ${y.noticeError}`}>{capError}</div>}
            <div className={r.modeGrid}>
              {([
                ['shuffle', 'Karışık', 'Salonlara rastgele dağıtılır.'],
                ['cross', 'Çapraz', 'Seviye / paket karışık oturur.'],
                ['sequential', 'Sıralı', 'Ada göre A’dan Z’ye.'],
              ] as const).map(([mode, title, desc]) => (
                <button key={mode} type="button"
                  className={seatingMode === mode ? r.modeOn : r.mode}
                  onClick={() => setSeatingMode(mode)}>
                  <b>{title}</b>
                  <small>{desc}</small>
                </button>
              ))}
            </div>
            {seatedByRoom.length === 0 ? (
              <div className={r.empty}><b>Yerleşecek öğrenci yok</b>Önce liste ve salon ekleyin.</div>
            ) : seatedByRoom.map(([roomName, items]) => (
              <section key={roomName} className={r.roomBlock}>
                <div className={r.roomHead}>
                  <strong>{roomName}</strong>
                  <span>{items.length} öğrenci</span>
                </div>
                <div className={r.list}>
                  {items.map(st => (
                    <div key={st.student_id} className={r.row}>
                      <span className={r.seat}>{st.seat_no}</span>
                      <div>
                        <div className={r.name}>{st.full_name}</div>
                        <div className={r.meta}>{st.sinif || st.sinif_seviyesi || '—'}</div>
                      </div>
                      <span className={r.meta}>{roomName}</span>
                      <span />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {step === 6 && (
          <div className={y.summary}>
            <h3>Kayıt özeti</h3>
            <div className={y.summaryRow}><span>Sınav</span><span className={y.summaryVal}>{form.name || '—'}</span></div>
            <div className={y.summaryRow}><span>Tür</span><span className={y.summaryVal}>{form.exam_type ? EXAM_TYPES.find(t => t.value === form.exam_type)?.label : '—'}</span></div>
            <div className={y.summaryRow}><span>Ders / Soru</span><span className={y.summaryVal}>{sectionCountLabel}</span></div>
            <div className={y.summaryRow}><span>Katılımcı</span><span className={y.summaryVal}>{roster.length}</span></div>
            <div className={y.summaryRow}><span>Sınıf</span><span className={y.summaryVal}>{form.sinif_ids.length || '—'}</span></div>
            <div className={y.summaryRow}><span>Seviye</span><span className={y.summaryVal}>{form.sinif_seviyesi_ids.length || '—'}</span></div>
            <div className={y.summaryRow}><span>Paket</span><span className={y.summaryVal}>{form.deneme_paketi_ids.length || '—'}</span></div>
            <div className={y.summaryRow}><span>Salon</span><span className={y.summaryVal}>{rooms.filter(room => room.name.trim()).length} · {totalCap} kişilik</span></div>
            <div className={y.summaryRow}><span>Oturma</span><span className={y.summaryVal}>{seatingMode === 'cross' ? 'Çapraz' : seatingMode === 'sequential' ? 'Sıralı' : 'Karışık'}</span></div>
            {capError && <div className={`${y.notice} ${y.noticeError}`} style={{ marginTop: 12 }}>{capError}</div>}
            <button type="submit" disabled={submitting || !!capError} className={y.primaryWide} style={{ marginTop: 16 }}>
              {submitting ? 'Oluşturuluyor…' : 'Sınavı oluştur'}
            </button>
          </div>
        )}

        {step > 1 && (
          <div className={y.nav}>
            <button type="button" className={y.ghost} onClick={() => setStep(n => n - 1)}>
              Geri
            </button>
            {step < 6 && (
              <button type="button" className={y.primary} onClick={goNext}>
                İleri
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
