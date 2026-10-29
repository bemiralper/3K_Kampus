'use client';

import { useEffect, useState } from 'react';
import { daireSablonApi } from '../../../../components/olcme/daire-dizisi/api';
import type { DaireSablonOzet } from '../../../../components/olcme/daire-dizisi/types';
import { getContextHeaders } from '@/lib/api';
import TanimlarTabs from '@/components/olcme/TanimlarTabs';

type OverlayCell = {
  alan_id: string;
  ad: string;
  karakter: number;
  etiket: string;
  okuma_x_mm: number;
  okuma_y_mm: number;
  score: number;
  durum: string;
  karakter_durumu: string;
};

type Field = {
  id: string;
  ad: string;
  veri_kaynagi: string;
  value: string;
  confidence: number;
  states: { index: number; value: string; state: string }[];
};

type PageDetail = {
  id: number;
  sequence: number;
  confidence: number;
  warnings: string[];
  critical_warnings: string[];
  registration: { satir_kaydirma?: number; skor?: number; dropout?: boolean; confidence?: number };
  image_url: string;
  decoded: { alanlar: Record<string, Field>; cevaplar?: Record<string, string>; tc_gecerli?: boolean };
  etkin: Record<string, Field>;
  overlay: OverlayCell[];
  review: { secimler?: Record<string, Record<string, string>> };
  page_width_mm: number;
  page_height_mm: number;
};

type Job = {
  id: number;
  sablon_ad: string;
  status: string;
  total_pages: number;
  processed_pages: number;
  sayfalar?: { id: number; sequence: number; status: string; confidence: number; critical_warnings: string[] }[];
};

const box: React.CSSProperties = { border: '1px solid #d8dee8', borderRadius: 12, padding: 16, background: '#fff' };

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  Object.entries(getContextHeaders()).forEach(([key, value]) => headers.set(key, value));
  const res = await fetch(url, { credentials: 'include', ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function etkinDeger(field: Field, secimler: Record<string, string> | undefined) {
  return (field.states || []).map(state => secimler?.[String(state.index)] ?? state.value).join('');
}

export default function OptikOkumaPage() {
  const [templates, setTemplates] = useState<DaireSablonOzet[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [page, setPage] = useState<PageDetail | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [beklenenTc, setBeklenenTc] = useState('');
  const [beklenenCevap, setBeklenenCevap] = useState('');
  const [dogrulama, setDogrulama] = useState<{ uyumlu: boolean; farklar: { alan: string; basilan: string; okunan: string }[] } | null>(null);

  useEffect(() => {
    daireSablonApi.list().then(rows => {
      const active = rows.filter(row => row.aktif);
      setTemplates(active);
      if (active[0]) setTemplateId(active[0].id);
    }).catch(err => setError(err instanceof Error ? err.message : 'Şablonlar yüklenemedi.'));
  }, []);

  useEffect(() => {
    if (!page?.image_url) {
      setImageUrl('');
      return;
    }
    let active = true;
    let objectUrl = '';
    fetch(page.image_url, { credentials: 'include', headers: getContextHeaders() })
      .then(res => res.blob())
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setImageUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page?.image_url]);

  const openPage = async (id: number) => {
    setPage(await api<PageDetail>(`/api/coaching/olcme-degerlendirme/optik-okuma/sayfalar/${id}/`));
    setDogrulama(null);
  };

  const upload = async () => {
    if (!templateId || !file) return;
    setBusy(true);
    setError('');
    setPage(null);
    try {
      const body = new FormData();
      body.append('sablon_id', String(templateId));
      body.append('dosya', file);
      let current = await api<Job>('/api/coaching/olcme-degerlendirme/optik-okuma/', { method: 'POST', body });
      setJob(current);
      while (current.processed_pages < current.total_pages) {
        current = await api<Job>(`/api/coaching/olcme-degerlendirme/optik-okuma/${current.id}/isle/`, {
          method: 'POST',
          body: JSON.stringify({ batch_size: 1 }),
        });
        setJob(current);
      }
      const first = current.sayfalar?.find(item => item.status === 'REVIEW');
      if (first) await openPage(first.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama okunamadı.');
    } finally {
      setBusy(false);
    }
  };

  const clickCell = async (cell: OverlayCell) => {
    if (!page) return;
    const secimler = { ...(page.review.secimler || {}) };
    const grup = { ...(secimler[cell.alan_id] || {}) };
    grup[String(cell.karakter)] = cell.etiket;
    secimler[cell.alan_id] = grup;
    const next = await api<PageDetail>(`/api/coaching/olcme-degerlendirme/optik-okuma/sayfalar/${page.id}/incele/`, {
      method: 'PATCH',
      body: JSON.stringify({ secimler }),
    });
    setPage(next);
  };

  const verify = async () => {
    if (!page) return;
    setDogrulama(await api(`/api/coaching/olcme-degerlendirme/optik-okuma/sayfalar/${page.id}/dogrula/`, {
      method: 'POST',
      body: JSON.stringify({ beklenen: { tc: beklenenTc, cevaplar: beklenenCevap } }),
    }));
  };

  const fields = page ? Object.values(page.etkin) : [];

  return (
    <div style={{ display: 'grid', gap: 16, padding: 20 }}>
      <TanimlarTabs />
      <header>
        <h1 style={{ marginBottom: 4 }}>Optik Okuma</h1>
        <p style={{ margin: 0, color: '#475569' }}>
          Optik formlar sayfası duruyor. Bu sayfa dolu kâğıdı okur. Daire koordinatı ve yazıcı profili burada değişmez.
          Sonuç sınava yazılmaz.
        </p>
      </header>
      <section style={box}>
        <strong>Tarama kuralı</strong>
        <p style={{ marginBottom: 0 }}>300 DPI, gri tonlama, sayfanın tamamı. Otomatik kırpma ve otomatik eğiklik düzeltme kapalı olsun.</p>
      </section>
      {error && <div style={{ ...box, color: '#b91c1c' }}>{error}</div>}
      <section style={{ ...box, display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(240px, 2fr) auto', gap: 12, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          Şablon
          <select value={templateId} onChange={event => setTemplateId(Number(event.target.value))} style={{ minHeight: 38 }}>
            {templates.map(item => <option key={item.id} value={item.id}>{item.ad}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          PDF, PNG veya JPG
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => setFile(event.target.files?.[0] || null)} />
        </label>
        <button type="button" disabled={busy || !file || !templateId} onClick={upload} style={{ minHeight: 38, border: 0, borderRadius: 8, background: '#1d4ed8', color: '#fff', fontWeight: 700, padding: '0 16px' }}>
          {busy ? 'Okunuyor…' : 'Oku'}
        </button>
      </section>
      {job && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(job.sayfalar || []).map(item => (
            <button key={item.id} type="button" onClick={() => openPage(item.id).catch(err => setError(err.message))} style={{ borderRadius: 8, border: '1px solid #cbd5e1', background: page?.id === item.id ? '#dbeafe' : '#fff', padding: '8px 10px' }}>
              Sayfa {item.sequence} · %{Math.round((item.confidence || 0) * 100)}
              {item.critical_warnings?.length ? ' · incele' : ''}
            </button>
          ))}
        </div>
      )}
      {page && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ position: 'relative', border: '1px solid #e2e8f0', background: '#fff' }}>
            {imageUrl && (
              <>
                <img src={imageUrl} alt={`Sayfa ${page.sequence}`} style={{ width: '100%', display: 'block' }} />
                <svg viewBox={`0 0 ${page.page_width_mm} ${page.page_height_mm}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  {page.overlay.map((cell, index) => {
                    const incele = cell.karakter_durumu === 'multiple' || cell.karakter_durumu === 'ambiguous';
                    const override = page.review.secimler?.[cell.alan_id]?.[String(cell.karakter)];
                    const selected = override ? override === cell.etiket : cell.durum === 'secili';
                    return (
                      <circle
                        key={`${cell.alan_id}-${index}`}
                        cx={cell.okuma_x_mm}
                        cy={cell.okuma_y_mm}
                        r={1.5}
                        fill={selected ? 'rgba(22,163,74,0.45)' : 'transparent'}
                        stroke={incele ? '#d97706' : selected ? '#166534' : '#2563eb'}
                        strokeWidth={incele ? 0.45 : 0.25}
                        style={{ cursor: 'pointer' }}
                        onClick={() => clickCell(cell).catch(err => setError(err instanceof Error ? err.message : 'Seçim kaydedilemedi.'))}
                      >
                        <title>{`${cell.ad} ${cell.etiket} · ${cell.score}`}</title>
                      </circle>
                    );
                  })}
                </svg>
              </>
            )}
          </div>
          <aside style={{ ...box, display: 'grid', gap: 10 }}>
            <strong>Sayfa {page.sequence}</strong>
            <div>Güven %{Math.round(page.confidence * 100)} · satır kaydırma {page.registration.satir_kaydirma ?? 0} · skor {page.registration.skor ?? 0}</div>
            <div>{page.registration.dropout ? 'Basılı halka düşürüldü.' : 'Boş form farkı uygulanmadı.'}</div>
            {page.decoded.tc_gecerli === false && <div style={{ color: '#b91c1c' }}>T.C. kontrol hanesi tutmuyor.</div>}
            {[...page.critical_warnings, ...page.warnings].map(item => <div key={item} style={{ color: '#92400e' }}>{item}</div>)}
            {fields.map(field => (
              <div key={field.id}>
                <div style={{ fontSize: 12, color: '#64748b' }}>{field.ad}</div>
                <strong>{etkinDeger(field, page.review.secimler?.[field.id]) || '—'}</strong>
              </div>
            ))}
            <p style={{ margin: 0, color: '#475569' }}>Yanlış dairenin üstüne tıklayın. Seçilen işaret yeşile döner. Bu düzeltme sınav sonucuna yazılmaz.</p>
            <label style={{ display: 'grid', gap: 4 }}>
              Basılan T.C.
              <input value={beklenenTc} onChange={event => setBeklenenTc(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              Basılan cevap dizisi
              <input value={beklenenCevap} onChange={event => setBeklenenCevap(event.target.value)} />
            </label>
            <button type="button" onClick={() => verify().catch(err => setError(err instanceof Error ? err.message : 'Doğrulama yapılamadı.'))} style={{ minHeight: 36, borderRadius: 8, border: 0, background: '#0f766e', color: '#fff', fontWeight: 700 }}>
              Basılanla karşılaştır
            </button>
            {dogrulama && (
              <div style={{ color: dogrulama.uyumlu ? '#166534' : '#b91c1c' }}>
                {dogrulama.uyumlu ? 'Okuma basılan değerle aynı.' : dogrulama.farklar.map(item => `${item.alan}: basılan ${item.basilan}, okunan ${item.okunan}`).join(' · ')}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
