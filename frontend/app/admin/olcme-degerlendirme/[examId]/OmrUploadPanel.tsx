'use client';

import { useEffect, useMemo, useState } from 'react';
import { daireSablonApi } from '../../../../components/olcme/daire-dizisi/api';
import type { DaireSablonOzet } from '../../../../components/olcme/daire-dizisi/types';
import { omrApi, type OmrJob, type OmrPage } from '../../../../components/olcme/omr/api';
import { getContextHeaders } from '@/lib/api';

const box: React.CSSProperties = { border: '1px solid #d8dee8', borderRadius: 12, padding: 16, background: '#fff' };
const field: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 };
const input: React.CSSProperties = { minHeight: 38, border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' };
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: '10px 14px', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' };

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
  if (!src) return <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>Sayfa işlenmeyi bekliyor…</div>;
  if (!url) return <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>Görsel yükleniyor…</div>;
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
  const overlay = page.registration.overlay || [];

  const save = async () => {
    setBusy(true);
    try {
      const answerMap = Object.fromEntries([...answers].map((value, index) => [String(index + 1), value.trim().toUpperCase()]));
      onSaved(await omrApi.review(examId, job.id, page.id, {
        approved: true,
        values: { tc, ogrenci_no: number, ad_soyad: name, kitapcik: booklet.toUpperCase(), cevaplar: answerMap },
      }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article style={{ ...box, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>Sayfa {page.sequence} · {page.original_filename}</strong>
        <span>Güven %{Math.round(page.confidence * 100)} · {page.status}</span>
      </div>
      <div style={{ position: 'relative', maxWidth: 620, border: '1px solid #e2e8f0' }}>
        <AuthenticatedImage src={page.image_url} alt={`Tarama sayfa ${page.sequence}`} />
        <svg viewBox={`0 0 ${job.page_width_mm} ${job.page_height_mm}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
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
      {[...page.critical_warnings, ...page.warnings].map((warning, index) => (
        <div key={`${warning}-${index}`} style={{ color: page.critical_warnings.includes(warning) ? '#b91c1c' : '#92400e' }}>{warning}</div>
      ))}
      <div style={{ color: page.match_preview?.student_id ? '#166534' : '#92400e' }}>
        {page.match_preview?.student_id
          ? `Eşleşen öğrenci: ${page.match_preview.student_name} · %${Math.round((page.match_preview.score || 0) * 100)}`
          : 'Öğrenci eşleşmesi bulunamadı; T.C., numara veya adı düzeltin.'}
      </div>
      {page.error_message && <div style={{ color: '#b91c1c' }}>{page.error_message}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <label style={field}>T.C.<input style={input} value={tc} onChange={event => setTc(event.target.value)} /></label>
        <label style={field}>Öğrenci no<input style={input} value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label style={field}>Ad soyad<input style={input} value={name} onChange={event => setName(event.target.value)} /></label>
        <label style={field}>Kitapçık<input style={input} value={booklet} maxLength={1} onChange={event => setBooklet(event.target.value)} /></label>
      </div>
      <label style={field}>
        Cevap dizisi (boş cevap için boşluk)
        <textarea style={{ ...input, minHeight: 72, fontFamily: 'monospace' }} value={answers} onChange={event => setAnswers(event.target.value)} />
      </label>
      <div><button type="button" style={button} disabled={busy || page.status === 'ERROR'} onClick={save}>{busy ? 'Kaydediliyor…' : 'Düzeltmeleri kaydet ve onayla'}</button></div>
    </article>
  );
}

export default function OmrUploadPanel({ examId }: { examId: number }) {
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

  const allReviewed = useMemo(() => Boolean(job?.pages?.length)
    && job?.pages?.every(page => page.status === 'READY'), [job]);

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

  const confirm = async () => {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      setJob(await omrApi.confirm(examId, job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama onaylanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Optik tarama yükle</h3>
        <p>PDF’nin her sayfası veya seçtiğiniz her JPG/PNG bir öğrenci olarak işlenir. Sonuçlara aktarılmadan önce aşağıda kontrol edilir.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(260px, 2fr)', gap: 12 }}>
          <label style={field}>
            Daire Dizisi şablonu
            <select style={input} value={templateId} onChange={event => setTemplateId(Number(event.target.value))}>
              {templates.map(template => <option key={template.id} value={template.id}>{template.ad}</option>)}
            </select>
          </label>
          <label style={field}>
            PDF / JPG / PNG
            <input style={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={event => setFiles(Array.from(event.target.files || []))} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" style={button} disabled={busy || !templateId || !files.length} onClick={uploadAndProcess}>
            {busy ? 'İşleniyor…' : 'Yükle ve tara'}
          </button>
        </div>
      </div>
      {error && <div style={{ ...box, color: '#b91c1c' }}>{error}</div>}
      {job && (
        <div style={box}>
          <strong>{job.sablon_adi}</strong> · {job.processed_pages}/{job.total_pages} sayfa · {job.status}
        </div>
      )}
      {job?.pages?.map(page => (
        <PageReview
          key={page.id}
          examId={examId}
          job={job}
          page={page}
          onSaved={saved => setJob(current => current ? {
            ...current,
            pages: current.pages?.map(item => item.id === saved.id ? saved : item),
          } : current)}
        />
      ))}
      {job && job.status !== 'CONFIRMED' && (
        <div style={box}>
          <button type="button" style={button} disabled={busy || !allReviewed} onClick={confirm}>Onayla ve sınav sonuçlarına aktar</button>
          {!allReviewed && <p style={{ marginBottom: 0 }}>Aktarım için tüm sayfaları inceleyip onaylayın.</p>}
        </div>
      )}
      {job?.status === 'CONFIRMED' && <div style={{ ...box, color: '#166534' }}>OMR sonuçları oturum #{job.result_session_id} olarak aktarıldı.</div>}
    </section>
  );
}
