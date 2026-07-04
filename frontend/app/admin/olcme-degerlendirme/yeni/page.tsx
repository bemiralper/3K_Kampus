'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { examApi } from '../../../../components/olcme/api';
import {
  EXAM_TYPES,
  BOOKLET_TYPES,
  SCHEDULE_PREFERENCES,
  EXAM_CREATE_FORM_DEFAULT,
} from '../../../../components/olcme/types';
import type {
  ExamCreateForm,
  LookupItem,
  SessionCreateForm,
  SchedulePreference,
} from '../../../../components/olcme/types';
import s from '../olcme.module.css';

/* ── Oturum boş form ──────────────────────────────────────────────────────── */
const EMPTY_SESSION: SessionCreateForm = {
  name: '', order: 0, session_date: '', start_time: '', end_time: '',
  duration_minutes: '', schedule_preference: 'FARKETMEZ', description: '', section_ids: [],
};

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function YeniSinavPage() {
  const router = useRouter();

  const [form, setForm]             = useState<ExamCreateForm>({ ...EXAM_CREATE_FORM_DEFAULT });
  const [sessions, setSessions]     = useState<SessionCreateForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  /* Lookup verileri */
  const [siniflar, setSiniflar]                 = useState<LookupItem[]>([]);
  const [sinifSeviyeleri, setSinifSeviyeleri]    = useState<LookupItem[]>([]);
  const [denemeHizmetleri, setDenemeHizmetleri]  = useState<LookupItem[]>([]);
  const [denemePaketleri, setDenemePaketleri]    = useState<LookupItem[]>([]);
  const [seviyeFilter, setSeviyeFilter]          = useState<number | ''>('');

  /* Şablon */
  type TemplateSec = { name: string; question_start: number; question_end: number; question_count: number; order: number };
  const [templates, setTemplates] = useState<
    Record<string, {
      label: string;
      duration: number;
      sections: TemplateSec[];
      sub_sections?: Record<string, TemplateSec[]>;
    }>
  >({});

  /* ── Veri yükleme ────────────────────────────────────────────────────────── */
  useEffect(() => {
    examApi.templates().then(setTemplates).catch(() => {});
    examApi.siniflar().then(setSiniflar).catch(() => {});
    examApi.sinifSeviyeleri().then(setSinifSeviyeleri).catch(() => {});
    examApi.denemeHizmetleri().then(setDenemeHizmetleri).catch(() => {});
    examApi.denemePaketleri().then(setDenemePaketleri).catch(() => {});
  }, []);

  /* Sınav türü → süre otomatik */
  useEffect(() => {
    if (form.exam_type && templates[form.exam_type]) {
      const t = templates[form.exam_type];
      if (!form.duration_minutes) {
        setForm(p => ({ ...p, duration_minutes: String(t.duration) }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.exam_type, templates]);

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  const setField = useCallback(
    <K extends keyof ExamCreateForm>(key: K, value: ExamCreateForm[K]) =>
      setForm(p => ({ ...p, [key]: value })), [],
  );

  const toggleSinif = (id: number) =>
    setForm(p => ({
      ...p,
      sinif_ids: p.sinif_ids.includes(id)
        ? p.sinif_ids.filter(x => x !== id)
        : [...p.sinif_ids, id],
    }));

  const addSession = () =>
    setSessions(p => [...p, {
      ...EMPTY_SESSION,
      name: `${p.length + 1}. Oturum`,
      order: p.length,
      duration_minutes: form.duration_minutes || (currentTemplate ? String(currentTemplate.duration) : ''),
    }]);

  const updateSession = (i: number, field: keyof SessionCreateForm, value: unknown) =>
    setSessions(p => p.map((ss, j) => j === i ? { ...ss, [field]: value } : ss));

  const removeSession = (i: number) => setSessions(p => p.filter((_, j) => j !== i));

  /* Filtrelenmiş sınıflar */
  const filteredSiniflar = seviyeFilter
    ? siniflar.filter(si => si.seviye_id === seviyeFilter)
    : siniflar;

  /* ── Submit ──────────────────────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Sınav adı zorunludur.');
    if (!form.exam_type)   return setError('Sınav türü seçiniz.');

    setSubmitting(true);
    setError('');
    try {
      const exam = await examApi.create(form);
      for (const sess of sessions) {
        if (sess.name.trim()) await examApi.addSession(exam.id, sess);
      }
      router.push(`/admin/olcme-degerlendirme/${exam.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  const currentTemplate = form.exam_type ? templates[form.exam_type] : null;

  /* ═══════════ RENDER ═══════════ */

  return (
    <div className="section">

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-breadcrumb">
            <span style={{ cursor: 'pointer' }} onClick={() => router.push('/admin/olcme-degerlendirme')}>
              Ölçme & Değerlendirme
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
          <p className="hero-subtitle">Sınav bilgilerini doldurun, bölümler şablondan otomatik oluşturulur.</p>
        </div>
        <button className="btn-hero" onClick={() => router.push('/admin/olcme-degerlendirme')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Listeye Dön
        </button>
      </div>

      {error && (
        <div style={{ padding: '14px 20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', marginBottom: 20, fontSize: 13 }}>
          <strong>Hata:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={s.twoCol}>

          {/* ═══ SOL KOLON ═══════════════════════════════════════════════════ */}
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
                    <input placeholder="Örn: TYT Deneme 1" value={form.name}
                      onChange={e => setField('name', e.target.value)} required />
                  </div>
                  <div className={s.formGroup}>
                    <label>Sınav Türü *</label>
                    <select value={form.exam_type}
                      onChange={e => setField('exam_type', e.target.value as ExamCreateForm['exam_type'])} required>
                      <option value="">Seçiniz…</option>
                      {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className={s.formGroup}>
                    <label>Kitapçık Türü</label>
                    <select value={form.booklet_type}
                      onChange={e => setField('booklet_type', e.target.value)}>
                      {BOOKLET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className={s.formGroup}>
                    <label>Toplam Süre (dk)</label>
                    <input type="number" placeholder="135" value={form.duration_minutes}
                      onChange={e => setField('duration_minutes', e.target.value)} />
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

            {/* ─── Yayın Tarihleri ─────────────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Yayın Tarihleri
                </h3>
              </div>
              <div className={s.cardBody}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Sınav ve cevap anahtarı bu tarihlerde öğrencilere otomatik paylaşılacaktır.
                </p>
                <div className={s.formGrid}>
                  <div className={s.formGroup}>
                    <label>Sınav Yayın Tarihi</label>
                    <input type="datetime-local" value={form.result_publish_date}
                      onChange={e => setField('result_publish_date', e.target.value)} />
                  </div>
                  <div className={s.formGroup}>
                    <label>Cevap Anahtarı Yayın Tarihi</label>
                    <input type="datetime-local" value={form.answer_key_publish_date}
                      onChange={e => setField('answer_key_publish_date', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Oturumlar ───────────────────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Oturumlar & Zamanlama
                </h3>
                <div className="card-modern-header-actions">
                  <button type="button" onClick={addSession} className="btn-modern btn-primary"
                    style={{ padding: '6px 14px', fontSize: 12 }}>
                    + Oturum Ekle
                  </button>
                </div>
              </div>
              <div className={s.cardBody}>

                {sessions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🕐</div>
                    <p style={{ fontSize: 13, margin: 0, fontStyle: 'italic' }}>
                      Henüz oturum eklenmedi. Sınav tarihleri ve saatleri oturum bazında belirlenir.
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
                      </div>
                      <button type="button" onClick={() => removeSession(idx)}
                        style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, color: 'var(--danger)', cursor: 'pointer', fontSize: 12, padding: '4px 10px' }}>
                        ✕ Kaldır
                      </button>
                    </div>

                    {/* Satır 1: Ad, Tarih, Süre */}
                    <div className={s.sessionFormGrid}>
                      <div className={s.formGroup}>
                        <label>Oturum Adı</label>
                        <input value={sess.name} onChange={e => updateSession(idx, 'name', e.target.value)}
                          placeholder="1. Oturum" />
                      </div>
                      <div className={s.formGroup}>
                        <label>Tarih</label>
                        <input type="date" value={sess.session_date}
                          onChange={e => updateSession(idx, 'session_date', e.target.value)} />
                      </div>
                      <div className={s.formGroup}>
                        <label>Süre (dk)</label>
                        <input type="number" value={sess.duration_minutes}
                          onChange={e => updateSession(idx, 'duration_minutes', e.target.value)} placeholder="75" />
                      </div>
                    </div>

                    {/* Satır 2: Başlangıç, Bitiş, Tercih */}
                    <div className={s.sessionFormGrid} style={{ marginTop: 10 }}>
                      <div className={s.formGroup}>
                        <label>Başlangıç</label>
                        <input type="time" value={sess.start_time}
                          onChange={e => updateSession(idx, 'start_time', e.target.value)} />
                      </div>
                      <div className={s.formGroup}>
                        <label>Bitiş</label>
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
                  </div>
                ))}
              </div>
            </div>

            {/* ─── Sınıf / Grup Seçimi ─────────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  Sınıf / Grup Seçimi
                </h3>
                {form.sinif_ids.length > 0 && (
                  <div className="card-modern-header-actions">
                    <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                      {form.sinif_ids.length} seçili
                    </span>
                  </div>
                )}
              </div>
              <div className={s.cardBody}>
                {/* Seviye Filtresi */}
                {sinifSeviyeleri.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                      Sınıf Düzeyi Filtresi
                    </label>
                    <div className={s.chipGroup}>
                      <button type="button"
                        className={seviyeFilter === '' ? s.chipActive : s.chip}
                        onClick={() => setSeviyeFilter('')}>
                        Tümü
                      </button>
                      {sinifSeviyeleri.map(sv => (
                        <button type="button" key={sv.id}
                          className={seviyeFilter === sv.id ? s.chipActive : s.chip}
                          onClick={() => setSeviyeFilter(sv.id)}>
                          {sv.ad}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSiniflar.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                    Aktif dönemde tanımlı sınıf bulunamadı.
                  </p>
                ) : (
                  <>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                      Sınıflar <span style={{ fontWeight: 400, textTransform: 'none' }}>(birden fazla seçilebilir)</span>
                    </label>
                    <div className={s.chipGroup}>
                      {filteredSiniflar.map(si => (
                        <button key={si.id} type="button"
                          className={form.sinif_ids.includes(si.id) ? s.chipActive : s.chip}
                          onClick={() => toggleSinif(si.id)}>
                          {si.ad}
                          {si.seviye_ad && <span style={{ fontSize: 10, opacity: .7, marginLeft: 4 }}>({si.seviye_ad})</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ─── Deneme Hizmeti / Paketi ─────────────────────────────── */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  Deneme Hizmeti & Paketi
                </h3>
              </div>
              <div className={s.cardBody}>
                <div className={s.formGrid}>
                  <div className={s.formGroup}>
                    <label>Deneme Hizmeti</label>
                    <select value={form.deneme_hizmeti ?? ''}
                      onChange={e => setField('deneme_hizmeti', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Seçilmedi</option>
                      {denemeHizmetleri.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
                    </select>
                  </div>
                  <div className={s.formGroup}>
                    <label>Deneme Paketi</label>
                    <select value={form.deneme_paketi ?? ''}
                      onChange={e => setField('deneme_paketi', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Seçilmedi</option>
                      {denemePaketleri.map(p => (
                        <option key={p.id} value={p.id}>{p.ad} ({p.deneme_sayisi} sınav)</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ═══ SAĞ KOLON (Sidebar) ═════════════════════════════════════════ */}
          <div className={s.sidebar}>

            {/* Şablon Önizleme */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Şablon Önizleme
                </h3>
              </div>
              <div className={s.cardBody}>
                <label className={s.checkRow} style={{ marginBottom: 14 }}>
                  <input type="checkbox" checked={form.apply_template}
                    onChange={e => setField('apply_template', e.target.checked)} />
                  Şablonu otomatik uygula
                </label>

                {currentTemplate && currentTemplate.sections.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, padding: '0 2px', textTransform: 'uppercase', letterSpacing: '.3px', fontWeight: 600 }}>
                      <span>Toplam: {currentTemplate.sections.reduce((a, sec) => a + sec.question_end - sec.question_start + 1, 0)} soru</span>
                      <span>Süre: {currentTemplate.duration} dk</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {currentTemplate.sections.map((sec, i) => {
                        const subs = currentTemplate.sub_sections?.[sec.name];
                        return (
                          <div key={i}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '7px 12px', background: 'var(--bg-alt, #f0f4f9)', borderRadius: 8,
                              border: '1px solid var(--border)', fontSize: 12.5,
                            }}>
                              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{sec.name}</span>
                              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                {sec.question_start}–{sec.question_end} ({sec.question_end - sec.question_start + 1})
                              </span>
                            </div>
                            {subs && subs.map((sub, j) => (
                              <div key={j} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '5px 12px 5px 28px', fontSize: 11.5, color: 'var(--text-secondary)',
                                marginTop: 2,
                              }}>
                                <span>↳ {sub.name}</span>
                                <span style={{ fontSize: 10.5 }}>
                                  {sub.question_start}–{sub.question_end} ({sub.question_end - sub.question_start + 1})
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                    {form.exam_type
                      ? 'Bu sınav türü için özel şablon yok.'
                      : 'Sınav türü seçildiğinde bölümler burada görünecek.'}
                  </p>
                )}
              </div>
            </div>

            {/* Puanlama */}
            <div className="card-modern">
              <div className="card-modern-header">
                <h3>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
                  Puanlama
                </h3>
              </div>
              <div className={s.cardBody}>
                <label className={s.checkRow}>
                  <input type="checkbox" checked={form.per_section_penalty}
                    onChange={e => setField('per_section_penalty', e.target.checked)} />
                  Bölüm bazlı ceza uygula
                </label>
                <label className={s.checkRow} style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={form.booklet_auto_detect}
                    onChange={e => setField('booklet_auto_detect', e.target.checked)} />
                  Kitapçık otomatik tespit
                </label>
              </div>
            </div>

            {/* Özet */}
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
                  <span>Süre</span>
                  <span className={s.summaryVal}>{form.duration_minutes || '—'} dk</span>
                </div>
                <div className={s.summaryRow}>
                  <span>Sınıflar</span>
                  <span className={s.summaryVal}>{form.sinif_ids.length || '—'}</span>
                </div>
                <div className={s.summaryRow}>
                  <span>Oturumlar</span>
                  <span className={s.summaryVal}>{sessions.length || 'Tek oturum'}</span>
                </div>
                <div className={s.summaryRow}>
                  <span>Yanlış Düzeltme</span>
                  <span className={s.summaryVal}>
                    {form.wrong_answer_count === '0' ? 'Ceza Yok' : `${form.wrong_answer_count} yanlış → 1 doğru`}
                  </span>
                </div>
              </div>
            </div>

            {/* Gönder */}
            <button type="submit" disabled={submitting} className="btn-modern btn-primary"
              style={{
                width: '100%', justifyContent: 'center', padding: '14px 20px',
                fontSize: 15, opacity: submitting ? .6 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
              {submitting ? 'Oluşturuluyor…' : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  Sınavı Oluştur
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
