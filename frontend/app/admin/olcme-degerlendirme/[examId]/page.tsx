'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { examApi, puanAyarlariApi } from '../../../../components/olcme/api';
import {
  EXAM_TYPES,
  EXAM_STATUS,
  BOOKLET_TYPES,
  SCHEDULE_PREFERENCES,
} from '../../../../components/olcme/types';
import type {
  ExamDetail,
  ExamSection,
  ExamSessionItem,
  LookupItem,
  SessionCreateForm,
  SchedulePreference,
} from '../../../../components/olcme/types';
import AnswerKeyTab from './AnswerKeyTab';
import OutcomesTab from './OutcomesTab';
import UploadTab from './UploadTab';
import AnalysisTab from './AnalysisTab';
import ParticipantsTab from '../../../../components/olcme/roster/ParticipantsTab';
import AudiencePicker from '../../../../components/olcme/roster/AudiencePicker';
import ExamSectionsEditor from '../../../../components/olcme/ExamSectionsEditor';
import r from '../../../../components/olcme/roster/roster.module.css';
import ExamPublishBanner from '../../../../components/olcme/ExamPublishBanner';
import ExamHeader from '../../../../components/olcme/ui/ExamHeader';
import Icon from '../../../../components/olcme/ui/Icon';
import s from '../olcme.module.css';

/* ── Yardımcı ──────────────────────────────────────────────────────────────── */
const labelOf = (list: readonly { readonly value: string; readonly label: string }[], v: string) =>
  list.find(x => x.value === v)?.label ?? v;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const fmtTime = (t: string | null) => t ? t.slice(0, 5) : '';

const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** API hatasını kullanıcıya gösterilebilir metne çevirir. */
const errText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/** İşlem hatalarını gösteren şerit. Hatalar sessizce yutulmamalı. */
function ErrorBar({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{
      padding: '12px 18px', background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: 12, color: '#991b1b', marginBottom: 16, fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Icon name="error" size={18} />
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} aria-label="Kapat"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c',
          display: 'flex', alignItems: 'center', padding: 0,
        }}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** Oturum tarihleri → tek satır özet */
const sessionDateSummary = (sessions: ExamSessionItem[]) => {
  if (!sessions || sessions.length === 0) return '—';
  const dates = sessions
    .filter(s => s.session_date)
    .map(s => fmtDate(s.session_date));
  if (dates.length === 0) return '—';
  const unique = [...new Set(dates)];
  return unique.join(', ');
};

const TABS = [
  { key: 'genel',          label: 'Genel Bilgiler', icon: 'document'  },
  { key: 'katilimcilar',   label: 'Katılımcılar',   icon: 'users'     },
  { key: 'cevap-anahtari', label: 'Cevap Anahtarı', icon: 'answerKey' },
  { key: 'kazanimlar',     label: 'Kazanımlar',     icon: 'outcome'   },
  { key: 'yukle',          label: 'Sonuç Yükle',    icon: 'upload'    },
  { key: 'analiz',         label: 'Analiz',         icon: 'chart'     },
] as const;
type TabKey = typeof TABS[number]['key'];

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ExamDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const examId = Number(params.examId);

  /* Sınav listesindeki hızlı erişim bağlantıları ?tab=… ile doğrudan sekme açar */
  const requestedTab = searchParams.get('tab');
  const initialTab: TabKey = TABS.some(t => t.key === requestedTab)
    ? (requestedTab as TabKey)
    : 'genel';

  /* Sınav oluşturuldu ama bazı oturumlar kaydedilemediyse uyarı gösterilir */
  const sessionError = searchParams.get('sessionError');
  const [sessionWarning, setSessionWarning] = useState(sessionError);

  const [exam, setExam]           = useState<ExamDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  /* Yükle */
  const fetchExam = useCallback(async () => {
    setLoading(true);
    try {
      const data = await examApi.detail(examId);
      setExam(data);
    } catch {
      setError('Sınav verisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { fetchExam(); }, [fetchExam]);

  /* ── Aksiyonlar ──────────────────────────────────────────────────────────── */
  const handleLock = async () => {
    if (!exam) return;
    setActionError('');
    try {
      if (exam.is_locked) await examApi.unlock(examId);
      else await examApi.lock(examId);
      fetchExam();
    } catch (err) {
      setActionError(errText(err, 'Kilit durumu değiştirilemedi.'));
    }
  };
  const handleCopy = async () => {
    setActionError('');
    try {
      const copy = await examApi.copy(examId);
      router.push(`/admin/olcme-degerlendirme/${copy.id}`);
    } catch (err) {
      setActionError(errText(err, 'Sınav kopyalanamadı.'));
    }
  };
  const handleDelete = async () => {
    if (!confirm(
      'Bu sınav listeden kaldırılacak. Öğrenci cevapları ve oturum verileri ' +
      'veritabanında korunur, ancak sınav analiz ekranlarında görünmez. Devam edilsin mi?',
    )) return;
    setActionError('');
    try {
      await examApi.delete(examId);
      router.push('/admin/olcme-degerlendirme');
    } catch (err) {
      setActionError(errText(err, 'Sınav kaldırılamadı.'));
    }
  };

  /* ── Loading / Error ────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="section">
      <div className="card-modern" style={{ textAlign: 'center', padding: 80 }}>
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 14 }}>Yükleniyor…</p>
      </div>
    </div>
  );
  if (error || !exam) return (
    <div className="section">
      <div style={{ padding: '20px 24px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#991b1b' }}>
        <strong>Hata:</strong> {error || 'Sınav bulunamadı.'}
        <button className="btn-modern btn-secondary" style={{ marginLeft: 12 }}
          onClick={() => router.push('/admin/olcme-degerlendirme')}>Geri Dön</button>
      </div>
    </div>
  );

  /* ═══════════ RENDER ═══════════ */

  return (
    <div className="section">

      <ExamHeader
        exam={exam}
        onBack={() => router.push('/admin/olcme-degerlendirme')}
        onTabChange={tab => setActiveTab(tab as TabKey)}
        onToggleLock={handleLock}
        onCopy={handleCopy}
        onDelete={handleDelete}
      />

      {actionError && <ErrorBar message={actionError} onClose={() => setActionError('')} />}

      {sessionWarning && (
        <div style={{
          padding: '14px 20px', background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 12, color: '#92400e', marginBottom: 16, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ flex: 1 }}>
            <strong>Sınav oluşturuldu</strong>, ancak şu oturumlar kaydedilemedi:{' '}
            {sessionWarning}. Aşağıdaki <strong>Sınav Oturumları</strong> bölümünden
            tekrar ekleyebilirsiniz.
          </span>
          <button onClick={() => setSessionWarning(null)} aria-label="Kapat"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#b45309' }}>
            ×
          </button>
        </div>
      )}

      {/* ── Tab Nav ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`tab-modern ${activeTab === t.key ? 'active' : ''}`}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab İçerikleri */}
      {activeTab === 'genel' && <GeneralTab exam={exam} onRefresh={fetchExam} onExamUpdate={setExam} />}
      {activeTab === 'katilimcilar' && <ParticipantsTab exam={exam} />}
      {activeTab === 'cevap-anahtari' && <AnswerKeyTab exam={exam} />}
      {activeTab === 'kazanimlar' && <OutcomesTab exam={exam} />}
      {activeTab === 'yukle' && <UploadTab exam={exam} />}
      {activeTab === 'analiz' && <AnalysisTab exam={exam} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─  GENEL TAB  (Oturumlar + Düzenleme Modu dahil)                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

const EMPTY_SESSION: SessionCreateForm = {
  name: '', order: 0, session_date: '', start_time: '', end_time: '',
  duration_minutes: '', schedule_preference: 'FARKETMEZ', description: '', section_ids: [],
};

function GeneralTab({ exam, onRefresh, onExamUpdate }: { exam: ExamDetail; onRefresh: () => void; onExamUpdate: (e: ExamDetail) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [tabError, setTabError] = useState('');

  // ── Sınıf / deneme seçenekleri (düzenleme modunda gerekir) ──
  const [siniflar, setSiniflar] = useState<LookupItem[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri] = useState<LookupItem[]>([]);
  const [hizmetler, setHizmetler] = useState<LookupItem[]>([]);
  const [paketler, setPaketler] = useState<LookupItem[]>([]);

  // ── TYT Bağlantı State ──
  const [tytExams, setTytExams] = useState<{ id: number; name: string; exam_date: string | null; status: string; already_linked: boolean }[]>([]);
  const [loadingTyt, setLoadingTyt] = useState(false);
  const [linkingTyt, setLinkingTyt] = useState(false);
  const [showTytSelect, setShowTytSelect] = useState(false);
  const [kurumDefaultYear, setKurumDefaultYear] = useState(2025);
  const [managedYears, setManagedYears] = useState<number[]>([2024, 2025, 2026]);

  const isAyt = exam.exam_type === 'YKS_AYT';

  useEffect(() => {
    puanAyarlariApi.get().then(d => {
      setKurumDefaultYear(d.default_puan_yili);
      setManagedYears(d.managed_years);
    }).catch(() => {});
  }, []);

  /* Lookup'lar hem düzenleme formu hem de deneme adlarının gösterimi için gerekir. */
  useEffect(() => {
    Promise.all([
      examApi.siniflar().catch(() => [] as LookupItem[]),
      examApi.sinifSeviyeleri().catch(() => [] as LookupItem[]),
      examApi.denemeHizmetleri().catch(() => [] as LookupItem[]),
      examApi.denemePaketleri().catch(() => [] as LookupItem[]),
    ]).then(([sf, sv, hz, pk]) => {
      setSiniflar(sf);
      setSinifSeviyeleri(sv);
      setHizmetler(hz);
      setPaketler(pk);
    });
  }, []);

  /* ── düzenleme formu state ─── */
  const buildEditForm = () => ({
    name: exam.name,
    description: exam.description || '',
    duration_minutes: exam.duration_minutes?.toString() || '',
    wrong_answer_count: exam.wrong_answer_count?.toString() || '4',
    per_section_penalty: exam.per_section_penalty,
    booklet_type: exam.booklet_type,
    booklet_auto_detect: exam.booklet_auto_detect,
    result_publish_date: exam.result_publish_date?.slice(0, 16) || '',
    answer_key_publish_date: exam.answer_key_publish_date?.slice(0, 16) || '',
    puan_yili: exam.puan_yili ?? ('' as number | ''),
    sinif_ids: exam.sinif_ids ?? [],
    sinif_seviyesi_ids: exam.sinif_seviyesi_ids ?? [],
    deneme_paketi_ids: exam.deneme_paketi_ids ?? [],
    deneme_hizmeti: exam.deneme_hizmeti,
  });
  const [editForm, setEditForm] = useState(buildEditForm);

  /* ── oturum ekleme formu ─── */
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState<SessionCreateForm>({ ...EMPTY_SESSION });

  const wrongText = exam.wrong_answer_count === 0
    ? 'Ceza Yok'
    : `${exam.wrong_answer_count} yanlış → 1 doğruyu götürür`;

  const sessions = exam.exam_sessions ?? [];

  const toggleAudience = (
    key: 'sinif_ids' | 'sinif_seviyesi_ids' | 'deneme_paketi_ids',
    id: number,
  ) => {
    setEditForm(p => ({
      ...p,
      [key]: p[key].includes(id) ? p[key].filter(x => x !== id) : [...p[key], id],
    }));
  };

  /* Lookup gelmeden sinif_display'e düşülür ki satır boş görünmesin. */
  const sinifNames = lookupNames(siniflar, exam.sinif_ids ?? []) || exam.sinif_display;
  const seviyeNames = lookupNames(sinifSeviyeleri, exam.sinif_seviyesi_ids ?? []);
  const paketNames = lookupNames(
    paketler,
    uniqueIds([...(exam.deneme_paketi_ids ?? []), exam.deneme_paketi].filter((x): x is number => x != null)),
  );

  /* Alt bölüm eksik mi? */
  const hasSubSections = (exam.sections || []).some(sec => sec.is_sub_section);
  const hasMainSections = (exam.sections || []).some(sec => !sec.is_sub_section);
  const showEnsureSubBtn = hasMainSections && !hasSubSections;

  /* Durum güncelle */
  const handleStatusChange = async (newStatus: string) => {
    setStatusSaving(true);
    setTabError('');
    try {
      const updated = await examApi.updateStatus(exam.id, newStatus);
      onExamUpdate(updated);
    } catch (err) {
      setTabError(errText(err, 'Sınav durumu güncellenemedi.'));
    }
    finally { setStatusSaving(false); }
  };

  /* Alt dersleri ekle */
  const handleEnsureSubSections = async () => {
    setSubSaving(true);
    setTabError('');
    try {
      const resp = await examApi.ensureSubSections(exam.id);
      onExamUpdate(resp.data);
    } catch (err) {
      setTabError(errText(err, 'Alt dersler eklenemedi.'));
    }
    finally { setSubSaving(false); }
  };

  const handleStartEdit = () => { setEditForm(buildEditForm()); setTabError(''); setEditing(true); };
  const handleCancelEdit = () => { setEditing(false); setTabError(''); };

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      setTabError('Sınav adı boş olamaz.');
      return;
    }
    setSaving(true);
    setTabError('');
    try {
      const audienceChanged =
        !sameIdSet(editForm.sinif_ids, exam.sinif_ids ?? []) ||
        !sameIdSet(editForm.sinif_seviyesi_ids, exam.sinif_seviyesi_ids ?? []) ||
        !sameIdSet(editForm.deneme_paketi_ids, exam.deneme_paketi_ids ?? []);
      await examApi.update(exam.id, {
        name: editForm.name.trim(),
        description: editForm.description,
        duration_minutes: editForm.duration_minutes ? Number(editForm.duration_minutes) : null,
        wrong_answer_count: Number(editForm.wrong_answer_count),
        per_section_penalty: editForm.per_section_penalty,
        booklet_type: editForm.booklet_type,
        booklet_auto_detect: editForm.booklet_auto_detect,
        result_publish_date: editForm.result_publish_date || null,
        answer_key_publish_date: editForm.answer_key_publish_date || null,
        puan_yili: editForm.puan_yili === '' ? null : Number(editForm.puan_yili),
        sinif_ids: editForm.sinif_ids,
        deneme_hizmeti: editForm.deneme_hizmeti,
        deneme_paketi: editForm.deneme_paketi_ids[0] ?? null,
        ...(audienceChanged ? {
          sinif_seviyesi_ids: editForm.sinif_seviyesi_ids,
          deneme_paketi_ids: editForm.deneme_paketi_ids,
        } : {}),
      } as Partial<ExamDetail>);
      setEditing(false);
      onRefresh();
    } catch (err) {
      setTabError(errText(err, 'Değişiklikler kaydedilemedi.'));
    }
    finally { setSaving(false); }
  };

  /* Oturum Ekle */
  const handleAddSession = async () => {
    if (!sessionForm.name.trim()) {
      setTabError('Oturum adı zorunludur.');
      return;
    }
    setTabError('');
    try {
      await examApi.addSession(exam.id, sessionForm);
      setShowSessionForm(false);
      setSessionForm({ ...EMPTY_SESSION });
      onRefresh();
    } catch (err) {
      setTabError(errText(err, 'Oturum eklenemedi.'));
    }
  };

  /* Oturum Sil */
  const handleRemoveSession = async (sid: number) => {
    if (!confirm('Bu oturumu silmek istediğinize emin misiniz?')) return;
    setTabError('');
    try {
      await examApi.removeSession(exam.id, sid);
      onRefresh();
    } catch (err) {
      setTabError(errText(err, 'Oturum kaldırılamadı.'));
    }
  };

  /* Oturum Güncelle */
  const handleUpdateSession = async (sid: number, data: Record<string, unknown>) => {
    setTabError('');
    try {
      await examApi.updateSession(exam.id, sid, data);
      onRefresh();
    } catch (err) {
      setTabError(errText(err, 'Oturum güncellenemedi.'));
    }
  };

  const ef = editForm;
  const setEf = (patch: Partial<typeof editForm>) => setEditForm(p => ({ ...p, ...patch }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {tabError && <ErrorBar message={tabError} onClose={() => setTabError('')} />}

      {/* ── Düzenle / Kaydet Butonları ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {!editing ? (
          <button className="btn-modern btn-primary" onClick={handleStartEdit}
            style={{ padding: '7px 18px', fontSize: 13 }}>
            ✏️ Düzenle
          </button>
        ) : (
          <>
            <button className="btn-modern btn-secondary" onClick={handleCancelEdit}
              style={{ padding: '7px 18px', fontSize: 13 }}>
              İptal
            </button>
            <button className="btn-modern btn-primary" onClick={handleSave} disabled={saving}
              style={{ padding: '7px 18px', fontSize: 13 }}>
              {saving ? '⏳ Kaydediliyor…' : '💾 Kaydet'}
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* ── Sınav Bilgileri ──────────────────────────────────────────── */}
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              Sınav Bilgileri
            </h3>
          </div>
          <div className={`card-modern-body ${s.cardBody}`}>
            {!editing ? (
              <div className={s.infoGrid}>
                <InfoItem label="Sınav Adı" value={exam.name} />
                <InfoItem label="Sınav Türü" value={labelOf(EXAM_TYPES, exam.exam_type)} />
                <div className={s.infoItem}>
                  <span className={s.infoLabel}>Durum</span>
                  <span className={s.infoValue}>
                    <select
                      value={exam.status}
                      onChange={e => handleStatusChange(e.target.value)}
                      disabled={statusSaving}
                      style={{
                        padding: '4px 8px', fontSize: 13, borderRadius: 6,
                        border: '1px solid #d1d5db', background: '#fff',
                        cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      {EXAM_STATUS.map(st => (
                        <option key={st.value} value={st.value}>{st.label}</option>
                      ))}
                    </select>
                  </span>
                </div>
                <InfoItem label="Süre" value={exam.duration_minutes ? `${exam.duration_minutes} dk` : '—'} />
                <InfoItem label="Kitapçık" value={labelOf(BOOKLET_TYPES, exam.booklet_type)} />
                <InfoItem label="Yanlış Düzeltme" value={wrongText} />
                <InfoItem
                  label="Puan yılı"
                  value={exam.puan_yili ? `${exam.puan_yili} YKS` : `Kurum varsayılanı (${kurumDefaultYear})`}
                />
                <InfoItem label="Sınav Tarihleri" value={sessionDateSummary(sessions)} />
                <InfoItem label="Sonuç Yayın Tarihi" value={fmtDateTime(exam.result_publish_date)} />
                <InfoItem label="Cevap Anahtarı Yayın Tarihi" value={fmtDateTime(exam.answer_key_publish_date)} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <ExamPublishBanner
                    examId={exam.id}
                    examName={exam.name}
                    refreshKey={`${exam.result_publish_date || ''}|${exam.answer_key_publish_date || ''}|${exam.status}`}
                    onExamDatesChanged={onRefresh}
                  />
                </div>
              </div>
            ) : (
              <div className={s.formGrid}>
                <div className={s.formGroup}>
                  <label>Sınav Adı</label>
                  <input value={ef.name} onChange={e => setEf({ name: e.target.value })} />
                </div>
                <div className={s.formGroup}>
                  <label>Süre (dk)</label>
                  <input type="number" value={ef.duration_minutes}
                    onChange={e => setEf({ duration_minutes: e.target.value })} placeholder="165" />
                </div>
                <div className={s.formGroup}>
                  <label>Kitapçık</label>
                  <select value={ef.booklet_type} onChange={e => setEf({ booklet_type: e.target.value })}>
                    {BOOKLET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div className={s.formGroup}>
                  <label>Yanlış Sayısı</label>
                  <input type="number" value={ef.wrong_answer_count}
                    onChange={e => setEf({ wrong_answer_count: e.target.value })} min="0" />
                </div>
                <div className={s.formGroup}>
                  <label>Puan yılı</label>
                  <select
                    value={ef.puan_yili}
                    onChange={e => setEf({ puan_yili: e.target.value === '' ? '' : Number(e.target.value) })}
                  >
                    <option value="">Kurum varsayılanı ({kurumDefaultYear})</option>
                    {managedYears.map(y => (
                      <option key={y} value={y}>{y} YKS{y === 2026 ? ' (henüz resmi değil)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className={s.formGroup}>
                  <label>Sonuç Yayın Tarihi <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></label>
                  <input type="datetime-local" value={ef.result_publish_date}
                    onChange={e => setEf({ result_publish_date: e.target.value })} />
                </div>
                <div className={s.formGroup}>
                  <label>Cevap Anahtarı Yayın Tarihi <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></label>
                  <input type="datetime-local" value={ef.answer_key_publish_date}
                    onChange={e => setEf({ answer_key_publish_date: e.target.value })} />
                </div>
                <div className={s.formGroupFull}>
                  <label>Açıklama</label>
                  <textarea rows={3} value={ef.description}
                    onChange={e => setEf({ description: e.target.value })} />
                </div>
                <div className={s.formGroupFull}>
                  <div style={{
                    background: '#f8fafc', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '12px 16px',
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 8,
                    }}>
                      Kayıtlı ayarlar — puanlama motoru henüz uygulamıyor
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <label className={s.checkRow}>
                        <input type="checkbox" checked={ef.per_section_penalty}
                          onChange={e => setEf({ per_section_penalty: e.target.checked })} />
                        Bölüm bazlı ceza
                      </label>
                      <label className={s.checkRow}>
                        <input type="checkbox" checked={ef.booklet_auto_detect}
                          onChange={e => setEf({ booklet_auto_detect: e.target.checked })} />
                        Kitapçık oto-algıla
                      </label>
                    </div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.5 }}>
                      Net hesabı her zaman bölüm içinde yapılır; kitapçık harfi eksikse
                      sistem zaten otomatik tespit dener. Bu tercihler kaydedilir ancak
                      şu an sonucu değiştirmez.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Kurum Bilgileri ──────────────────────────────────────────── */}
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              Kurum Bilgileri
            </h3>
          </div>
          <div className={`card-modern-body ${s.cardBody}`}>
            <div className={s.infoGrid}>
              <InfoItem label="Kurum" value={exam.kurum_adi || '—'} />
              <InfoItem label="Şube" value={exam.sube_adi || '—'} />
              <InfoItem label="Eğitim Yılı" value={exam.egitim_yili_str || '—'} />
              <InfoItem
                label="Katılımcı"
                value={exam.participant_count != null ? String(exam.participant_count) : '—'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Kimler girecek (oluşturma sihirbazıyla aynı seçim) ────────── */}
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            Kimler girecek
          </h3>
        </div>
        <div className={`card-modern-body ${s.cardBody}`}>
          {!editing ? (
            <div className={s.infoGrid}>
              <InfoItem label="Seviye" value={seviyeNames || '—'} />
              <InfoItem label="Sınıflar" value={sinifNames || '—'} />
              <InfoItem label="Deneme paketi" value={paketNames || '—'} />
              {exam.deneme_hizmeti && (
                <InfoItem
                  label="Deneme hizmeti"
                  value={hizmetler.find(h => h.id === exam.deneme_hizmeti)?.ad ?? `#${exam.deneme_hizmeti}`}
                />
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={r.heroCopy}>
                <p style={{ margin: 0 }}>
                  Sınıf, seviye ve deneme paketini dilediğiniz gibi birleştirin.
                  Aynı öğrenci bir kez gelir. Seviye + paket birlikte seçilirse kesişim alınır;
                  konu tarama için yalnız sınıf yeter. Kaydetmek otomatik katılımcı listesini bu kurallara göre günceller.
                </p>
              </div>
              <div className={r.stats} style={{ minWidth: 0 }}>
                <div className={r.stat}><span className={r.statValue}>{ef.sinif_ids.length}</span><span className={r.statLabel}>Sınıf</span></div>
                <div className={r.stat}><span className={r.statValue}>{ef.sinif_seviyesi_ids.length}</span><span className={r.statLabel}>Seviye</span></div>
                <div className={r.stat}><span className={r.statValue}>{ef.deneme_paketi_ids.length}</span><span className={r.statLabel}>Paket</span></div>
              </div>
              <AudiencePicker
                sinifSeviyeleri={sinifSeviyeleri}
                siniflar={siniflar}
                denemePaketleri={paketler}
                sinifSeviyesiIds={ef.sinif_seviyesi_ids}
                sinifIds={ef.sinif_ids}
                denemePaketiIds={ef.deneme_paketi_ids}
                onToggleSeviye={id => toggleAudience('sinif_seviyesi_ids', id)}
                onToggleSinif={id => toggleAudience('sinif_ids', id)}
                onTogglePaket={id => toggleAudience('deneme_paketi_ids', id)}
              />
              <div className={s.formGroup} style={{ maxWidth: 360 }}>
                <label>Deneme hizmeti <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></label>
                <select
                  value={ef.deneme_hizmeti ?? ''}
                  onChange={e => setEf({ deneme_hizmeti: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Seçilmedi</option>
                  {hizmetler.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Oturumlar (Sınav Tarihleri & Saatleri) ────────────────────── */}
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Sınav Oturumları ({sessions.length})
          </h3>
          <div className="card-modern-header-actions">
            <button className="btn-modern btn-primary"
              onClick={() => setShowSessionForm(!showSessionForm)}
              style={{ padding: '6px 14px', fontSize: 12 }}>
              {showSessionForm ? '✕ İptal' : '+ Oturum Ekle'}
            </button>
          </div>
        </div>
        <div className={`card-modern-body ${s.cardBody}`}>

          {/* Yeni Oturum Formu */}
          {showSessionForm && (
            <div className={s.sessionFormWrap} style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-primary)' }}>
                Yeni Oturum
              </h4>
              <div className={s.sessionFormGrid}>
                <div className={s.formGroup}>
                  <label>Ad</label>
                  <input value={sessionForm.name}
                    onChange={e => setSessionForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="1. Oturum" />
                </div>
                <div className={s.formGroup}>
                  <label>Tarih</label>
                  <input type="date" value={sessionForm.session_date}
                    onChange={e => setSessionForm(p => ({ ...p, session_date: e.target.value }))} />
                </div>
                <div className={s.formGroup}>
                  <label>Süre (dk)</label>
                  <input type="number" value={sessionForm.duration_minutes}
                    onChange={e => setSessionForm(p => ({ ...p, duration_minutes: e.target.value }))}
                    placeholder="75" />
                </div>
              </div>
              <div className={s.sessionFormGrid} style={{ marginTop: 10 }}>
                <div className={s.formGroup}>
                  <label>Başlangıç</label>
                  <input type="time" value={sessionForm.start_time}
                    onChange={e => setSessionForm(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div className={s.formGroup}>
                  <label>Bitiş</label>
                  <input type="time" value={sessionForm.end_time}
                    onChange={e => setSessionForm(p => ({ ...p, end_time: e.target.value }))} />
                </div>
                <div className={s.formGroup}>
                  <label>Gün Tercihi</label>
                  <div className={s.prefGroup}>
                    {SCHEDULE_PREFERENCES.map(pref => (
                      <button key={pref.value} type="button"
                        className={sessionForm.schedule_preference === pref.value ? s.prefBtnActive : s.prefBtn}
                        onClick={() => setSessionForm(p => ({ ...p, schedule_preference: pref.value as SchedulePreference }))}>
                        {pref.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button className="btn-modern btn-secondary" onClick={() => setShowSessionForm(false)}>İptal</button>
                <button className="btn-modern btn-primary" onClick={handleAddSession}>Ekle</button>
              </div>
            </div>
          )}

          {/* Oturum listesi */}
          {sessions.length === 0 && !showSessionForm && (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🕐</div>
              <h3>Oturum Tanımlı Değil</h3>
              <p>Sınavın tarih ve saatlerini belirlemek için oturum ekleyin.</p>
            </div>
          )}

          {sessions.map((sess, idx) => (
            <SessionCard
              key={sess.id}
              session={sess}
              index={idx}
              editing={editing}
              onRemove={handleRemoveSession}
              onUpdate={handleUpdateSession}
            />
          ))}
        </div>
      </div>

      {/* ── Bölümler ──────────────────────────────────────────────────── */}
      <ExamSectionsEditor exam={exam} onExamUpdate={onExamUpdate} />
      {showEnsureSubBtn && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -12 }}>
          <button
            className="btn-modern btn-primary"
            onClick={handleEnsureSubSections}
            disabled={subSaving}
            style={{ padding: '7px 16px', fontSize: 12 }}
          >
            {subSaving ? '⏳ Ekleniyor…' : '➕ Alt Dersleri Ekle'}
          </button>
        </div>
      )}

      {/* ── Açıklama (sadece görüntüleme modunda) ──────────────── */}
      {!editing && exam.description && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Açıklama
            </h3>
          </div>
          <div className={`card-modern-body ${s.cardBody}`}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {exam.description}
            </p>
          </div>
        </div>
      )}

      {/* ── TYT-AYT Bağlantısı (sadece AYT sınavları için) ──────── */}
      {isAyt && (
        <TytLinkCard
          exam={exam}
          tytExams={tytExams}
          setTytExams={setTytExams}
          loadingTyt={loadingTyt}
          setLoadingTyt={setLoadingTyt}
          linkingTyt={linkingTyt}
          setLinkingTyt={setLinkingTyt}
          showTytSelect={showTytSelect}
          setShowTytSelect={setShowTytSelect}
          onExamUpdate={onExamUpdate}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

/* ── Session Card ──────────────────────────────────────────────────────────── */
function SessionCard({ session, index, editing, onRemove, onUpdate }: {
  session: ExamSessionItem;
  index: number;
  editing: boolean;
  onRemove: (id: number) => void;
  onUpdate: (id: number, data: Record<string, unknown>) => void;
}) {
  const [inlineEdit, setInlineEdit] = useState(false);
  const [form, setForm] = useState({
    name: session.name,
    session_date: session.session_date || '',
    start_time: session.start_time || '',
    end_time: session.end_time || '',
    duration_minutes: session.duration_minutes?.toString() || '',
    schedule_preference: session.schedule_preference || 'FARKETMEZ',
  });

  const startEdit = () => {
    setForm({
      name: session.name,
      session_date: session.session_date || '',
      start_time: session.start_time || '',
      end_time: session.end_time || '',
      duration_minutes: session.duration_minutes?.toString() || '',
      schedule_preference: session.schedule_preference || 'FARKETMEZ',
    });
    setInlineEdit(true);
  };

  const saveEdit = () => {
    onUpdate(session.id, {
      name: form.name,
      session_date: form.session_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      schedule_preference: form.schedule_preference,
    });
    setInlineEdit(false);
  };

  if (inlineEdit) {
    return (
      <div className={s.sessionFormWrap} style={{ marginTop: index > 0 ? 12 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Oturum Düzenle
          </h4>
        </div>
        <div className={s.sessionFormGrid}>
          <div className={s.formGroup}>
            <label>Ad</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className={s.formGroup}>
            <label>Tarih</label>
            <input type="date" value={form.session_date}
              onChange={e => setForm(p => ({ ...p, session_date: e.target.value }))} />
          </div>
          <div className={s.formGroup}>
            <label>Süre (dk)</label>
            <input type="number" value={form.duration_minutes}
              onChange={e => setForm(p => ({ ...p, duration_minutes: e.target.value }))} />
          </div>
        </div>
        <div className={s.sessionFormGrid} style={{ marginTop: 10 }}>
          <div className={s.formGroup}>
            <label>Başlangıç</label>
            <input type="time" value={form.start_time}
              onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
          </div>
          <div className={s.formGroup}>
            <label>Bitiş</label>
            <input type="time" value={form.end_time}
              onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
          </div>
          <div className={s.formGroup}>
            <label>Gün Tercihi</label>
            <div className={s.prefGroup}>
              {SCHEDULE_PREFERENCES.map(pref => (
                <button key={pref.value} type="button"
                  className={form.schedule_preference === pref.value ? s.prefBtnActive : s.prefBtn}
                  onClick={() => setForm(p => ({ ...p, schedule_preference: pref.value as SchedulePreference }))}>
                  {pref.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn-modern btn-secondary" onClick={() => setInlineEdit(false)}>İptal</button>
          <button className="btn-modern btn-primary" onClick={saveEdit}>Kaydet</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', marginTop: index > 0 ? 12 : 0,
      transition: 'border-color .15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className={s.sessionOrder}>{index + 1}</span>
          <div>
            <span className={s.sessionName}>{session.name}</span>
            <div className={s.sessionMeta}>
              {session.session_date && (
                <span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {fmtDate(session.session_date)}
                </span>
              )}
              {session.start_time && (
                <span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {fmtTime(session.start_time)}{session.end_time && ` – ${fmtTime(session.end_time)}`}
                </span>
              )}
              {session.duration_minutes && (
                <span>⏱ {session.duration_minutes} dk</span>
              )}
              {session.schedule_preference && session.schedule_preference !== 'FARKETMEZ' && (
                <span className={`badge-modern ${session.schedule_preference === 'HAFTA_ICI' ? 'info' : 'warning'}`}
                  style={{ fontSize: 10, padding: '2px 8px' }}>
                  {session.schedule_preference_display}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-modern" onClick={startEdit}
            style={{ color: 'var(--primary)', fontSize: 12, padding: '4px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
            ✏️ Düzenle
          </button>
          <button className="btn-modern" onClick={() => onRemove(session.id)}
            style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 10px', background: 'none', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' }}>
            ✕ Kaldır
          </button>
        </div>
      </div>
      {session.sections_detail && session.sections_detail.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Bölümler:
          </span>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {session.sections_detail.map((sec: ExamSection) => (
              <span key={sec.id} className="badge-modern info">{sec.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─  Ortak Mini Bileşenler                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

function InfoItem({ label: lbl, value }: { label: string; value: string | number }) {
  return (
    <div className={s.infoItem}>
      <span className={s.infoLabel}>{lbl}</span>
      <span className={s.infoValue}>{value}</span>
    </div>
  );
}

function uniqueIds(ids: number[]) {
  return [...new Set(ids)];
}

function sameIdSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function lookupNames(options: LookupItem[], ids: number[]) {
  if (!ids.length) return '';
  const byId = new Map(options.map(o => [o.id, o.ad]));
  return ids.map(id => byId.get(id) ?? `#${id}`).join(', ');
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─  TYT Link Card  (AYT → TYT bağlantısı)                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function TytLinkCard({
  exam, tytExams, setTytExams, loadingTyt, setLoadingTyt,
  linkingTyt, setLinkingTyt, showTytSelect, setShowTytSelect,
  onExamUpdate, onRefresh,
}: {
  exam: ExamDetail;
  tytExams: { id: number; name: string; exam_date: string | null; status: string; already_linked: boolean }[];
  setTytExams: (v: { id: number; name: string; exam_date: string | null; status: string; already_linked: boolean }[]) => void;
  loadingTyt: boolean;
  setLoadingTyt: (v: boolean) => void;
  linkingTyt: boolean;
  setLinkingTyt: (v: boolean) => void;
  showTytSelect: boolean;
  setShowTytSelect: (v: boolean) => void;
  onExamUpdate: (e: ExamDetail) => void;
  onRefresh: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTyt(true);
      try {
        const data = await examApi.tytExams();
        if (!cancelled) setTytExams(data);
      } catch { /* */ }
      finally { if (!cancelled) setLoadingTyt(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [linkError, setLinkError] = useState('');

  const handleLink = async (tytId: number) => {
    setLinkingTyt(true);
    setLinkError('');
    try {
      const resp = await examApi.linkTyt(exam.id, tytId);
      onExamUpdate(resp.data);
      setShowTytSelect(false);
    } catch (err) {
      setLinkError(errText(err, 'TYT sınavı bağlanamadı.'));
    }
    finally { setLinkingTyt(false); }
  };

  const handleUnlink = async () => {
    if (!confirm('TYT bağlantısını kaldırmak istediğinize emin misiniz?')) return;
    setLinkingTyt(true);
    setLinkError('');
    try {
      const resp = await examApi.linkTyt(exam.id, null);
      onExamUpdate(resp.data);
    } catch (err) {
      setLinkError(errText(err, 'TYT bağlantısı kaldırılamadı.'));
    }
    finally { setLinkingTyt(false); }
  };

  const linkedName = exam.linked_tyt_exam_name;

  return (
    <div className="card-modern">
      <div className="card-modern-header">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
          TYT-AYT Bağlantısı
        </h3>
      </div>
      <div className={`card-modern-body ${s.cardBody}`}>
        {/* Bilgi kutusu */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1e40af', lineHeight: 1.6,
        }}>
          <strong>ℹ️ Bilgi:</strong> AYT puan hesabında TYT netleri de kullanılır. Daha önce yapılmış bir TYT sınavını
          bağlayarak öğrenci puanlarının doğru hesaplanmasını sağlayabilirsiniz.
        </div>

        {linkError && <ErrorBar message={linkError} onClose={() => setLinkError('')} />}

        {/* Mevcut bağlantı */}
        {exam.linked_tyt_exam ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#166534' }}>Bağlı TYT Sınavı</div>
                <div style={{ fontSize: 13, color: '#15803d', marginTop: 2 }}>{linkedName}</div>
              </div>
            </div>
            <button
              className="btn-modern btn-secondary"
              onClick={handleUnlink}
              disabled={linkingTyt}
              style={{ padding: '6px 14px', fontSize: 12, color: '#dc2626', borderColor: '#fecaca' }}
            >
              {linkingTyt ? '⏳' : '✕'} Bağlantıyı Kaldır
            </button>
          </div>
        ) : (
          <div>
            {/* Henüz bağlantı yok */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
              padding: '14px 18px', marginBottom: showTytSelect ? 16 : 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#92400e' }}>TYT Bağlantısı Yok</div>
                  <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
                    Puan hesaplaması sadece AYT netleri ile yapılacak.
                  </div>
                </div>
              </div>
              <button
                className="btn-modern btn-primary"
                onClick={() => setShowTytSelect(!showTytSelect)}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                {showTytSelect ? '✕ İptal' : '🔗 TYT Sınavı Bağla'}
              </button>
            </div>

            {/* TYT seçim listesi */}
            {showTytSelect && (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10,
                overflow: 'hidden',
              }}>
                {loadingTyt ? (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                    ⏳ TYT sınavları yükleniyor…
                  </div>
                ) : tytExams.length === 0 ? (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                    Bu kurum/eğitim yılında sonuç yüklenmiş TYT sınavı bulunamadı.
                  </div>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {tytExams.map((tyt) => (
                      <div
                        key={tyt.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 18px',
                          borderBottom: '1px solid var(--border)',
                          background: tyt.already_linked ? '#f8fafc' : '#fff',
                          opacity: tyt.already_linked ? 0.6 : 1,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                            {tyt.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {tyt.exam_date ? fmtDate(tyt.exam_date) : 'Tarih yok'}
                            {tyt.already_linked && <span style={{ color: '#94a3b8', marginLeft: 8 }}>(başka AYT&apos;ye bağlı)</span>}
                          </div>
                        </div>
                        <button
                          className="btn-modern btn-primary"
                          onClick={() => handleLink(tyt.id)}
                          disabled={linkingTyt || tyt.already_linked}
                          style={{ padding: '5px 12px', fontSize: 11 }}
                        >
                          {linkingTyt ? '⏳' : '🔗'} Bağla
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
