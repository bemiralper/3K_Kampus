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
  templateToDrafts,
  totalQuestionsFromDrafts,
  type ManualSectionDraft,
} from '../../../../components/olcme/manual-sections';
import r from '../../../../components/olcme/roster/roster.module.css';
import s from '../olcme.module.css';

const WIZARD = [
  { n: 1, label: 'Sınav bilgisi' },
  { n: 2, label: 'Kimler girecek' },
  { n: 3, label: 'Liste' },
  { n: 4, label: 'Salonlar' },
  { n: 5, label: 'Oturma' },
  { n: 6, label: 'Özet' },
] as const;

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
    examApi.templates().then(setTemplates).catch(() => {});
    examApi.siniflar().then(setSiniflar).catch(() => {});
    examApi.sinifSeviyeleri().then(setSinifSeviyeleri).catch(() => {});
    examApi.denemePaketleri().then(setDenemePaketleri).catch(() => {});
    examApi.list().then(list => setExistingNames(list.map(e => e.name))).catch(() => {});
    puanAyarlariApi.get().then(d => {
      setKurumDefaultYear(d.default_puan_yili);
      setManagedYears(d.managed_years);
    }).catch(() => {});
  }, []);

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
    ? currentTemplate.sections.reduce((a, sec) => a + sec.question_end - sec.question_start + 1, 0)
    : 0;
  const sectionCountLabel = editingTemplate
    ? (rangesFromCounts(manualSections).length
      ? `${rangesFromCounts(manualSections).length} / ${totalQuestionsFromDrafts(manualSections)}`
      : '—')
    : (form.apply_template && currentTemplate
      ? `${currentTemplate.sections.length} / ${templateTotal}`
      : '—');

  const err = (key: string) => (touched ? fieldErrors[key] : undefined);

  const inputStyle = (key: string) =>
    err(key) ? { borderColor: 'var(--danger, #dc2626)' } : undefined;

  const FieldError = ({ name }: { name: string }) =>
    err(name)
      ? <span style={{ fontSize: 11.5, color: 'var(--danger, #dc2626)', marginTop: 4, display: 'block' }}>{err(name)}</span>
      : null;

  /* ═══════════ RENDER ═══════════ */

  return (
    <div className="section">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-breadcrumb">
            <span style={{ cursor: 'pointer' }} onClick={() => router.push('/admin/olcme-degerlendirme')}>
              Ölçme &amp; Değerlendirme
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span>Yeni Sınav</span>
          </div>
          <h1 className="hero-title">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Yeni Sınav Oluştur
          </h1>
          <p className="hero-subtitle">
            TYT, AYT ve LGS bölümleri şablondan gelir. Konu tarama, kazanım ve özel sınavlarda
            ders ile soru sayısını bu adımda girersiniz; sonra Genel Bilgiler’den değiştirirsiniz.
          </p>
        </div>
        <button className="btn-hero" onClick={() => router.push('/admin/olcme-degerlendirme')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Listeye Dön
        </button>
      </div>

      {error && (
        <div style={{
          padding: '14px 20px', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 10, color: '#991b1b', marginBottom: 20, fontSize: 13,
        }}>
          <strong>Hata:</strong> {error}
        </div>
      )}

      <div className={s.wizardNav}>
        {WIZARD.map(w => (
          <button
            key={w.n}
            type="button"
            className={step === w.n ? s.wizardStepOn : step > w.n ? s.wizardStepDone : s.wizardStep}
            onClick={() => {
              if (w.n < step || w.n === step) setStep(w.n);
            }}
          >
            <span className={s.wizardNum}>{w.n}</span>
            {w.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {step === 1 && (
        <div className={s.createStack}>

          <div className={s.createTop}>
          <div className={s.flexCol}>

            {/* ─── Temel Bilgiler ──────────────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Temel Bilgiler
                </h3>
              </div>
              <div className={s.cardBody}>
                <div className={s.formGrid}>
                  <div className={s.formGroupFull}>
                    <label>Sınav Adı *</label>
                    <input
                      placeholder="Örn: TYT Deneme 1"
                      value={form.name}
                      style={inputStyle('name')}
                      onChange={e => setField('name', e.target.value)}
                      onBlur={() => setTouched(true)}
                    />
                    <FieldError name="name" />
                    {duplicateName && !err('name') && (
                      <span style={{ fontSize: 11.5, color: '#b45309', marginTop: 4, display: 'block' }}>
                        Bu adla bir sınav zaten var. Karışmaması için ad ekleyebilirsiniz.
                      </span>
                    )}
                  </div>

                  <div className={s.formGroup}>
                    <label>Sınav Türü *</label>
                    <select
                      value={form.exam_type}
                      style={inputStyle('exam_type')}
                      onChange={e => setField('exam_type', e.target.value as ExamCreateForm['exam_type'])}
                      onBlur={() => setTouched(true)}
                    >
                      <option value="">Seçiniz…</option>
                      {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <FieldError name="exam_type" />
                  </div>

                  <div className={s.formGroup}>
                    <label>Toplam Süre (dk)</label>
                    <input type="number" min={1} placeholder="165" value={form.duration_minutes}
                      style={inputStyle('duration_minutes')}
                      onChange={e => setField('duration_minutes', e.target.value)} />
                    <FieldError name="duration_minutes" />
                  </div>

                  <div className={s.formGroup}>
                    <label>Kitapçık Türü</label>
                    <select value={form.booklet_type}
                      onChange={e => setField('booklet_type', e.target.value)}>
                      {BOOKLET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>

                  <div className={s.formGroup}>
                    <label>Yanlış Cevap Düzeltme</label>
                    <select value={form.wrong_answer_count}
                      onChange={e => setField('wrong_answer_count', e.target.value)}>
                      <option value="0">Ceza Yok</option>
                      <option value="3">3 yanlış → 1 doğruyu götürür</option>
                      <option value="4">4 yanlış → 1 doğruyu götürür</option>
                      <option value="5">5 yanlış → 1 doğruyu götürür</option>
                    </select>
                  </div>

                  <div className={s.formGroupFull}>
                    <label>Açıklama</label>
                    <textarea style={{ minHeight: 56, resize: 'vertical' }}
                      placeholder="Opsiyonel açıklama…" value={form.description}
                      onChange={e => setField('description', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={s.createAside}>
            <div className={s.summaryCard}>
              <h3 className={s.summaryTitle}>Özet</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={s.summaryRow}>
                  <span>Sınav Türü</span>
                  <span className={s.summaryVal}>
                    {form.exam_type ? EXAM_TYPES.find(t => t.value === form.exam_type)?.label : '—'}
                  </span>
                </div>
                <div className={s.summaryRow}>
                  <span>Bölüm / Soru</span>
                  <span className={s.summaryVal}>{sectionCountLabel}</span>
                </div>
                <div className={s.summaryRow}>
                  <span>Süre</span>
                  <span className={s.summaryVal}>{form.duration_minutes || '—'} dk</span>
                </div>
                <div className={s.summaryRow}>
                  <span>Sınav Tarihi</span>
                  <span className={s.summaryVal}>
                    {derivedExamDate ? fmtSessionDate(derivedExamDate) : 'Tarihsiz'}
                  </span>
                </div>
                <div className={s.summaryRow}>
                  <span>Oturum</span>
                  <span className={s.summaryVal}>{sessions.length || '—'}</span>
                </div>
                <div className={s.summaryRow}>
                  <span>Yanlış Düzeltme</span>
                  <span className={s.summaryVal}>
                    {form.wrong_answer_count === '0' ? 'Ceza Yok' : `${form.wrong_answer_count} → 1`}
                  </span>
                </div>
                <div className={s.summaryRow}>
                  <span>Puan Yılı</span>
                  <span className={s.summaryVal}>
                    {form.puan_yili ? `${form.puan_yili} YKS` : `Varsayılan (${kurumDefaultYear})`}
                  </span>
                </div>
              </div>
            </div>

            <button type="button" onClick={goNext} className="btn-modern btn-primary"
              style={{
                width: '100%', justifyContent: 'center', padding: '14px 20px',
                fontSize: 15,
              }}>
              Katılımcılara geç
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              Sonraki adımlarda seviye, paket, salon ve oturma düzenini belirlersiniz.
            </p>
          </div>
          </div>

          <div className={s.flexCol}>
            {/* ─── Oturumlar ───────────────────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Oturumlar &amp; Zamanlama
                </h3>
                <div className="card-modern-header-actions">
                  <button type="button" onClick={addSession} className="btn-modern btn-primary"
                    style={{ padding: '6px 14px', fontSize: 12 }}>
                    + Oturum Ekle
                  </button>
                </div>
              </div>
              <div className={s.cardBody}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Sınav tarihi oturumlardan alınır: en erken oturum günü sınavın tarihi olur ve
                  takvime bu tarihle işlenir.
                  {derivedExamDate && (
                    <strong style={{ color: 'var(--primary)' }}>
                      {' '}Şu anki sınav tarihi: {fmtSessionDate(derivedExamDate)}
                    </strong>
                  )}
                </p>

                {sessions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-secondary)' }}>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      Henüz oturum eklenmedi. Oturum eklemezseniz sınav tarihsiz kaydedilir
                      ve takvimde görünmez.
                    </p>
                    <button type="button" onClick={addSession} className="btn-modern btn-secondary"
                      style={{ marginTop: 12, padding: '8px 16px', fontSize: 12 }}>
                      + İlk Oturumu Ekle
                    </button>
                  </div>
                )}

                {sessions.map((sess, idx) => (
                  <div key={idx} className={s.sessionFormWrap} style={{ marginTop: idx > 0 ? 12 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={s.sessionOrder}>{idx + 1}</span>
                        <span className={s.sessionName}>{sess.name || `${idx + 1}. Oturum`}</span>
                        {sess.session_date && (
                          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                            {fmtSessionDate(sess.session_date)}
                            {sess.start_time && ` · ${sess.start_time}`}
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => removeSession(idx)}
                        style={{
                          background: 'none', border: '1px solid #fecaca', borderRadius: 6,
                          color: 'var(--danger)', cursor: 'pointer', fontSize: 12, padding: '4px 10px',
                        }}>
                        Kaldır
                      </button>
                    </div>

                    <div className={s.sessionFormGrid}>
                      <div className={s.formGroup}>
                        <label>Oturum Adı *</label>
                        <input value={sess.name}
                          onChange={e => updateSession(idx, 'name', e.target.value)}
                          onBlur={() => setTouched(true)}
                          placeholder="1. Oturum" />
                      </div>
                      <div className={s.formGroup}>
                        <label>Tarih</label>
                        <input type="date" value={sess.session_date}
                          onChange={e => updateSession(idx, 'session_date', e.target.value)} />
                      </div>
                      <div className={s.formGroup}>
                        <label>Süre (dk)</label>
                        <input type="number" min={1} value={sess.duration_minutes}
                          onChange={e => updateSession(idx, 'duration_minutes', e.target.value)}
                          placeholder="75" />
                      </div>
                    </div>

                    <div className={s.sessionFormGrid} style={{ marginTop: 10 }}>
                      <div className={s.formGroup}>
                        <label>Başlangıç</label>
                        <input type="time" value={sess.start_time}
                          onChange={e => updateSession(idx, 'start_time', e.target.value)} />
                      </div>
                      <div className={s.formGroup}>
                        <label>Bitiş <span style={{ fontWeight: 400, textTransform: 'none' }}>(otomatik)</span></label>
                        <input type="time" value={sess.end_time}
                          onChange={e => updateSession(idx, 'end_time', e.target.value)} />
                      </div>
                      <div className={s.formGroup}>
                        <label>Gün Tercihi</label>
                        <div className={s.prefGroup}>
                          {SCHEDULE_PREFERENCES.map(pref => (
                            <button key={pref.value} type="button"
                              className={sess.schedule_preference === pref.value ? s.prefBtnActive : s.prefBtn}
                              onClick={() => updateSession(idx, 'schedule_preference', pref.value as SchedulePreference)}>
                              {pref.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <FieldError name={`session_${idx}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* ─── Yayın & Puanlama ────────────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Yayın Tarihleri &amp; Puanlama
                </h3>
              </div>
              <div className={s.cardBody}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Yayın saatleri zorunlu değildir. Otomatik WhatsApp gönderimi için
                  sınav detayında <strong>Zamanlı</strong> anahtarını ayrıca açın.
                  Bu tarihler öğrenci ekranındaki görünürlüğü <strong>kısıtlamaz</strong>;
                  sonuçlar yüklendiği anda öğrenciye açıktır.
                </p>
                <div className={s.formGrid}>
                  <div className={s.formGroup}>
                    <label>Sonuç Yayın Tarihi <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></label>
                    <input type="datetime-local" value={form.result_publish_date}
                      onChange={e => setField('result_publish_date', e.target.value)} />
                  </div>
                  <div className={s.formGroup}>
                    <label>Cevap Anahtarı Yayın Tarihi <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></label>
                    <input type="datetime-local" value={form.answer_key_publish_date}
                      style={inputStyle('answer_key_publish_date')}
                      onChange={e => setField('answer_key_publish_date', e.target.value)} />
                    <FieldError name="answer_key_publish_date" />
                  </div>
                  <div className={s.formGroup}>
                    <label>Puan Yılı</label>
                    <select
                      value={form.puan_yili ?? ''}
                      onChange={e => setField('puan_yili', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Kurum varsayılanı ({kurumDefaultYear})</option>
                      {managedYears.map(y => (
                        <option key={y} value={y}>{y} YKS{y === 2026 ? ' (henüz resmi değil)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14 }}>
                  <label className={s.checkRow}>
                    <input type="checkbox" checked={form.per_section_penalty}
                      onChange={e => setField('per_section_penalty', e.target.checked)} />
                    Bölüm bazlı ceza uygula
                  </label>
                  <label className={s.checkRow}>
                    <input type="checkbox" checked={form.booklet_auto_detect}
                      onChange={e => setField('booklet_auto_detect', e.target.checked)} />
                    Kitapçık otomatik tespit
                  </label>
                </div>
              </div>
            </div>

          </div>

          <div className="card-modern">
            <div className="card-modern-header">
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Bölüm Şablonu
              </h3>
              <div className="card-modern-header-actions">
                {hasBuiltInTemplate && !manualTemplate && !editingTemplate && (
                  <button type="button" className="btn-modern btn-secondary"
                    onClick={startEditingTemplate}
                    style={{ padding: '6px 14px', fontSize: 12 }}>
                    Şablonu düzenle
                  </button>
                )}
                {hasBuiltInTemplate && !manualTemplate && editingTemplate && (
                  <button type="button" className="btn-modern btn-secondary"
                    onClick={resetBuiltInTemplate}
                    style={{ padding: '6px 14px', fontSize: 12 }}>
                    Hazır şablona dön
                  </button>
                )}
              </div>
            </div>
            <div className={s.cardBody}>
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
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Ders seçici ve kazanımlar bu düzeye aittir; YKS ile LGS karışmaz.
                  </span>
                </div>
              )}
              {!form.exam_type ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Sınav türü seçildiğinde bölümler burada görünecek.
                </p>
              ) : editingTemplate ? (
                <>
                  {hasBuiltInTemplate && !manualTemplate && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.55 }}>
                      Hazır şablonu düzenliyorsunuz. Ders ekleyip çıkarabilir, müfredattan bağlayabilirsiniz.
                      Cevap anahtarı, kazanım ve analiz bu derslere göre oluşur.
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
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.55 }}>
                    Süre: {currentTemplate.duration} dk. Alt dersler kazanım eşleştirmesi için müfredat derslerine bağlanır.
                    Ders eklemek veya çıkarmak için şablonu düzenleyin.
                  </p>
                  <TemplatePreview
                    sections={currentTemplate.sections}
                    subSections={currentTemplate.sub_sections}
                  />
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Bu sınav türünde hazır bölüm yok; üst ders ekleyerek başlayın.
                </p>
              )}
            </div>
          </div>
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
              <div className={r.stats} style={{ minWidth: 280 }}>
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
            {capError && <div className={s.capWarn}>{capError}</div>}
            <section className={r.card}>
              <div className={r.cardBody}>
                {rooms.map((room, i) => (
                  <div key={i} className={r.roomEdit}>
                    <div className={s.formGroup}>
                      <label>Salon adı</label>
                      <input value={room.name}
                        onChange={e => setRooms(p => p.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} />
                    </div>
                    <div className={s.formGroup}>
                      <label>Kapasite</label>
                      <input type="number" min={1} value={room.capacity}
                        onChange={e => setRooms(p => p.map((item, j) => j === i ? { ...item, capacity: Number(e.target.value) || 1 } : item))} />
                    </div>
                    <button type="button" className={r.ghost} onClick={() => setRooms(p => p.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <button type="button" className="btn-modern btn-secondary"
                  onClick={() => setRooms(p => [...p, { name: `Salon ${p.length + 1}`, capacity: 30, order: p.length }])}>
                  + Salon ekle
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
              <button type="button" className="btn-modern btn-primary" onClick={() => setSeatingTick(n => n + 1)}>
                Yeniden karıştır
              </button>
            </div>
            {capError && <div className={s.capWarn}>{capError}</div>}
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
          <div className={s.summaryCard}>
            <h3 className={s.summaryTitle}>Kayıt özeti</h3>
            <div className={s.summaryRow}><span>Sınav</span><span className={s.summaryVal}>{form.name || '—'}</span></div>
            <div className={s.summaryRow}><span>Tür</span><span className={s.summaryVal}>{form.exam_type ? EXAM_TYPES.find(t => t.value === form.exam_type)?.label : '—'}</span></div>
            <div className={s.summaryRow}><span>Ders / Soru</span><span className={s.summaryVal}>{sectionCountLabel}</span></div>
            <div className={s.summaryRow}><span>Katılımcı</span><span className={s.summaryVal}>{roster.length}</span></div>
            <div className={s.summaryRow}><span>Sınıf</span><span className={s.summaryVal}>{form.sinif_ids.length || '—'}</span></div>
            <div className={s.summaryRow}><span>Seviye</span><span className={s.summaryVal}>{form.sinif_seviyesi_ids.length || '—'}</span></div>
            <div className={s.summaryRow}><span>Paket</span><span className={s.summaryVal}>{form.deneme_paketi_ids.length || '—'}</span></div>
            <div className={s.summaryRow}><span>Salon</span><span className={s.summaryVal}>{rooms.filter(r => r.name.trim()).length} · {totalCap} kişilik</span></div>
            <div className={s.summaryRow}><span>Oturma</span><span className={s.summaryVal}>{seatingMode === 'cross' ? 'Çapraz' : seatingMode === 'sequential' ? 'Sıralı' : 'Karışık'}</span></div>
            {capError && <div className={s.capWarn} style={{ marginTop: 12 }}>{capError}</div>}
            <button type="submit" disabled={submitting || !!capError} className="btn-modern btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '14px 20px', fontSize: 15, opacity: submitting ? .6 : 1 }}>
              {submitting ? 'Oluşturuluyor…' : 'Sınavı oluştur'}
            </button>
          </div>
        )}

        {step > 1 && (
          <div className={s.wizardActions}>
            <button type="button" className="btn-modern btn-secondary" onClick={() => setStep(n => n - 1)}>
              Geri
            </button>
            {step < 6 && (
              <button type="button" className="btn-modern btn-primary" onClick={goNext}>
                İleri
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
