'use client';

import { useEffect, useState } from 'react';
import { daireSablonApi } from '../../../../components/olcme/daire-dizisi/api';
import type { DaireSablonOzet } from '../../../../components/olcme/daire-dizisi/types';
import { omrApi, type OmrJob, type OmrPage } from '../../../../components/olcme/omr/api';
import { getContextHeaders } from '@/lib/api';
import u from './upload.module.css';

const PAGE_STATUS: Record<OmrPage['status'], string> = {
  PENDING: 'Bekliyor',
  PROCESSING: 'İşleniyor',
  REVIEW: 'İnceleme bekliyor',
  READY: 'Onaylandı',
  ERROR: 'Hata',
};

const JOB_STATUS: Record<OmrJob['status'], string> = {
  PENDING: 'Bekliyor',
  PROCESSING: 'İşleniyor',
  REVIEW: 'İnceleme bekliyor',
  CONFIRMED: 'Sonuçlara aktarıldı',
  ERROR: 'Hata',
};

function AuthenticatedImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!src) {
      setUrl('');
      return;
    }
    let active = true;
    let objectUrl = '';
    fetch(src, { credentials: 'include', headers: getContextHeaders() })
      .then(response => {
        if (!response.ok) throw new Error('Tarama görseli alınamadı.');
        return response.blob();
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (!src) return <div className={u.imgWait}>Sayfa işlenmeyi bekliyor…</div>;
  if (!url) return <div className={u.imgWait}>Görsel yükleniyor…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} style={{ width: '100%', display: 'block' }} />;
}

function answersText(page: OmrPage) {
  const answers = page.decoded.cevaplar || {};
  const max = Math.max(0, ...Object.keys(answers).map(Number).filter(Number.isFinite));
  return Array.from({ length: max }, (_, index) => answers[String(index + 1)] || ' ').join('');
}

function PageReview({ examId, job, page, onSaved }: {
  examId: number;
  job: OmrJob;
  page: OmrPage;
  onSaved: (page: OmrPage) => void;
}) {
  const existing = page.review.values || {};
  const [tc, setTc] = useState(String(existing.tc ?? page.decoded.tc ?? ''));
  const [number, setNumber] = useState(String(existing.ogrenci_no ?? page.decoded.ogrenci_no ?? ''));
  const [name, setName] = useState(String(existing.ad_soyad ?? page.decoded.ad_soyad ?? ''));
  const [booklet, setBooklet] = useState(String(existing.kitapcik ?? page.decoded.kitapcik ?? ''));
  const [answers, setAnswers] = useState(() => answersText(page));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overlay = page.registration.overlay || [];
  const ready = page.status === 'READY';

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const answerMap = Object.fromEntries([...answers].map((value, index) => [String(index + 1), value.trim().toUpperCase()]));
      onSaved(await omrApi.review(examId, job.id, page.id, {
        approved: true,
        values: { tc, ogrenci_no: number, ad_soyad: name, kitapcik: booklet.toUpperCase(), cevaplar: answerMap },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={u.panel}>
      <header className={u.panelHead}>
        <h3>Sayfa {page.sequence} <small>{page.original_filename}</small></h3>
        <span className={ready ? u.pillOk : page.status === 'ERROR' ? u.pillErr : u.pillWait}>
          {PAGE_STATUS[page.status] ?? page.status} · güven %{Math.round(page.confidence * 100)}
        </span>
      </header>
      <div className={u.omrGrid}>
        <div className={u.omrImage}>
          <AuthenticatedImage src={page.image_url} alt={`Tarama sayfa ${page.sequence}`} />
          <svg viewBox={`0 0 ${job.page_width_mm} ${job.page_height_mm}`} preserveAspectRatio="none" className={u.omrOverlay}>
            {overlay.map((cell, index) => (
              <circle
                key={`${cell.alan_id}-${index}`}
                cx={cell.x_mm}
                cy={cell.y_mm}
                r={1.3}
                fill="none"
                stroke={cell.score >= 0.25 ? '#16a34a' : '#f59e0b'}
                strokeWidth={0.28}
              />
            ))}
          </svg>
        </div>
        <div className={u.omrForm}>
          {[...page.critical_warnings, ...page.warnings].map((warning, index) => (
            <p key={`${warning}-${index}`} className={page.critical_warnings.includes(warning) ? u.errText : u.warnLine}>{warning}</p>
          ))}
          <p className={page.match_preview?.student_id ? u.okLine : u.warnLine}>
            {page.match_preview?.student_id
              ? `Eşleşen öğrenci: ${page.match_preview.student_name} · %${Math.round((page.match_preview.score || 0) * 100)}`
              : 'Öğrenci bulunamadı; TC, numara veya adı düzeltin.'}
          </p>
          {page.error_message && <p className={u.errText}>{page.error_message}</p>}
          <div className={u.formRow}>
            <label className={u.fieldLabel}>TC<input value={tc} onChange={e => setTc(e.target.value)} inputMode="numeric" /></label>
            <label className={u.fieldLabel}>Öğrenci no<input value={number} onChange={e => setNumber(e.target.value)} /></label>
            <label className={u.fieldLabel}>Ad soyad<input value={name} onChange={e => setName(e.target.value)} /></label>
            <label className={u.fieldLabel}>Kitapçık<input value={booklet} maxLength={1} onChange={e => setBooklet(e.target.value)} /></label>
          </div>
          <label className={u.fieldLabel}>
            Cevaplar ({answers.length} soru, boş için boşluk)
            <textarea className={u.mono} value={answers} onChange={e => setAnswers(e.target.value)} rows={3} />
          </label>
          {error && <p className={u.errText}>{error}</p>}
          <div>
            <button type="button" className={ready ? u.btnGhost : u.btnPrimary} disabled={busy || page.status === 'ERROR'} onClick={save}>
              {busy ? 'Kaydediliyor…' : ready ? 'Düzeltmeyi yeniden kaydet' : 'Kaydet ve onayla'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function OmrUploadPanel({ examId, onConfirmed }: { examId: number; onConfirmed?: () => void }) {
  const [templates, setTemplates] = useState<DaireSablonOzet[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<OmrJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    daireSablonApi.list().then(rows => {
      const active = rows.filter(row => row.aktif);
      setTemplates(active);
      if (active[0]) setTemplateId(active[0].id);
    }).catch(err => setError(err instanceof Error ? err.message : 'Şablonlar yüklenemedi.'));
  }, []);

  const pages = job?.pages ?? [];
  const readyCount = pages.filter(page => page.status === 'READY').length;
  const allReviewed = pages.length > 0 && readyCount === pages.length;

  const uploadAndProcess = async () => {
    if (!templateId || !files.length) return;
    setBusy(true);
    setError('');
    try {
      let current = await omrApi.create(examId, Number(templateId), files);
      setJob(current);
      while (current.processed_pages < current.total_pages) {
        current = await omrApi.process(examId, current.id, 4);
        setJob(current);
        if (current.error_pages) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama işlenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const confirmJob = async () => {
    if (!job) return;
    if (!confirm(`${pages.length} sayfa sınav sonuçlarına aktarılsın mı?`)) return;
    setBusy(true);
    setError('');
    try {
      setJob(await omrApi.confirm(examId, job.id));
      onConfirmed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama onaylanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setJob(null);
    setFiles([]);
    setError('');
  };

  return (
    <>
      {error && (
        <div className={u.alertErr} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Kapat">×</button>
        </div>
      )}

      {!job && (
        <section className={u.panel}>
          <header className={u.panelHead}><h3>Taranmış optik formlar</h3></header>
          <p className={u.help}>PDF’nin her sayfası ya da her JPG/PNG bir öğrenci sayılır. Sonuçlara aktarmadan önce her sayfayı kontrol edip onaylarsınız.</p>
          <div className={u.formRow}>
            <label className={u.fieldLabel}>
              Daire dizisi şablonu
              <select value={templateId} onChange={e => setTemplateId(Number(e.target.value))} disabled={busy}>
                {templates.length === 0 && <option value="">Aktif şablon yok</option>}
                {templates.map(template => <option key={template.id} value={template.id}>{template.ad}</option>)}
              </select>
            </label>
            <label className={u.fieldLabel}>
              Dosyalar
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFiles(Array.from(e.target.files || []))} disabled={busy} />
            </label>
          </div>
          <div className={u.panelFoot}>
            <span className={u.muted}>{files.length ? `${files.length} dosya seçildi` : ''}</span>
            <button type="button" className={u.btnPrimary} disabled={busy || !templateId || !files.length} onClick={uploadAndProcess}>
              {busy ? 'İşleniyor…' : 'Yükle ve tara'}
            </button>
          </div>
        </section>
      )}

      {job && (
        <section className={u.bar}>
          <div className={u.summary}>
            <p className={u.count}>
              <b>{readyCount}</b>/{pages.length || job.total_pages} sayfa onaylandı
              <span>{job.sablon_adi} · {JOB_STATUS[job.status] ?? job.status}{busy && job.processed_pages < job.total_pages ? ` · ${job.processed_pages}/${job.total_pages} işlendi` : ''}</span>
            </p>
            <div className={u.meter} aria-hidden>
              <i style={{ width: `${pages.length ? Math.round((readyCount / pages.length) * 100) : 0}%` }} />
            </div>
          </div>
          <div className={u.barActions}>
            {job.status !== 'CONFIRMED' && (
              <button type="button" className={u.btnPrimary} disabled={busy || !allReviewed} onClick={confirmJob}
                title={allReviewed ? undefined : 'Önce tüm sayfaları onaylayın'}>
                Sonuçlara aktar
              </button>
            )}
            <button type="button" className={u.btnGhost} onClick={reset} disabled={busy}>Yeni tarama</button>
          </div>
        </section>
      )}

      {job?.status === 'CONFIRMED' && (
        <div className={u.alertOk}>
          <span>Tarama sonuçlara aktarıldı. &quot;Optik okuyucu dosyası&quot; sekmesindeki yüklemeler listesinden açabilirsiniz.</span>
        </div>
      )}

      {pages.map(page => (
        <PageReview
          key={page.id}
          examId={examId}
          job={job!}
          page={page}
          onSaved={saved => setJob(current => current ? {
            ...current,
            pages: current.pages?.map(item => item.id === saved.id ? saved : item),
          } : current)}
        />
      ))}
    </>
  );
}
