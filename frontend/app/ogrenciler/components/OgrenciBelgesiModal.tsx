'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import { apiGet } from '@/lib/api';
import { brandingFromKurum, getAppLogo } from '@/lib/kurum-branding';
import { useVectorPrint } from '@/lib/useVectorPrint';
import type { OgrenciDetay, OgrenciVeli } from '../[id]/types';
import type { OgrenciRow } from './OgrenciListResults';
import ResmiYaziMeta from './ResmiYaziMeta';

export interface OgrenciBelgesiForm {
  sayi: string;
  konu: string;
  tc_kimlik_no: string;
  adi_soyadi: string;
  baba_adi: string;
  anne_adi: string;
  dogum_yeri: string;
  dogum_tarihi: string;
  alan_bolum: string;
  belge_tarihi: string;
  kurs_muduru: string;
}

interface Props {
  student: OgrenciRow & {
    veli_ad_soyad?: string;
    veli_yakinlik?: string;
    dogum_tarihi?: string;
  };
  onClose: () => void;
}

function studentDisplayName(s: {
  tam_ad?: string;
  ad?: string;
  soyad?: string;
}): string {
  if (s.tam_ad?.trim()) return s.tam_ad.trim();
  const parts = [s.ad?.trim(), s.soyad?.trim()].filter(Boolean);
  return parts.join(' ');
}

function veliAdi(veliler: OgrenciVeli[] | undefined, tur: 'baba' | 'anne'): string {
  const v = veliler?.find((x) => x.veli_turu === tur);
  if (!v) return '';
  return v.tam_ad || `${v.ad || ''} ${v.soyad || ''}`.trim();
}

function resolveVeliAdlari(
  veliler: OgrenciVeli[] | undefined,
  fallback?: { veli_ad_soyad?: string; veli_yakinlik?: string },
): { baba: string; anne: string } {
  let baba = veliAdi(veliler, 'baba');
  let anne = veliAdi(veliler, 'anne');

  const fbAd = fallback?.veli_ad_soyad?.trim();
  const fbTur = fallback?.veli_yakinlik?.trim();
  if (fbAd && fbTur === 'baba' && !baba) baba = fbAd;
  if (fbAd && fbTur === 'anne' && !anne) anne = fbAd;

  return { baba, anne };
}

function unwrapApiPayload<T>(res: { data?: T; success?: boolean } & Partial<T>): T {
  if (res.data !== undefined && res.data !== null) return res.data as T;
  return res as T;
}

function formatDateTr(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
    return iso;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayTr(): string {
  return formatDateTr(new Date().toISOString());
}

function absoluteAssetUrl(path: string): string {
  if (path.startsWith('http')) return path;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function fieldLine(label: string, value: string) {
  return (
    <div style={{ marginBottom: 6, fontSize: '12pt', lineHeight: 1.6 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {' : '}
      <span>{value || '\u00A0'}</span>
    </div>
  );
}

export default function OgrenciBelgesiModal({ student, onClose }: Props) {
  const { activeKurum, activeSube } = useKurum();
  const branding = useMemo(
    () => (activeKurum ? brandingFromKurum(activeKurum) : null),
    [activeKurum],
  );
  const logoUrl = branding ? getAppLogo(branding) : '/img/3k-logo.png';
  const kurumResmiAd = (activeSube?.resmi_ad || activeSube?.ad || activeKurum?.ad || 'KURUM').toUpperCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'preview'>('form');
  const [pdfBusy, setPdfBusy] = useState(false);

  const listVeli = resolveVeliAdlari(undefined, {
    veli_ad_soyad: student.veli_ad_soyad,
    veli_yakinlik: student.veli_yakinlik,
  });

  const [form, setForm] = useState<OgrenciBelgesiForm>({
    sayi: '',
    konu: '',
    tc_kimlik_no: student.tc_kimlik_no || '',
    adi_soyadi: studentDisplayName(student),
    baba_adi: listVeli.baba,
    anne_adi: listVeli.anne,
    dogum_yeri: '',
    dogum_tarihi: formatDateTr(student.dogum_tarihi),
    alan_bolum: student.sinif_seviyesi || '',
    belge_tarihi: todayTr(),
    kurs_muduru: activeSube?.kurs_muduru || '',
  });

  const { contentRef, print } = useVectorPrint({
    title: 'Öğrenci Belgesi',
    marginMm: '15mm 18mm',
    extraCss: `
      body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 12pt;
        color: #000;
        line-height: 1.5;
      }
      .resmi-belge { max-width: 100%; }
    `,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<OgrenciDetay>(`/ogrenciler/api/${student.id}/`);
        if (!res.success) {
          throw new Error(res.error || 'Detay alınamadı');
        }
        const detay = unwrapApiPayload<OgrenciDetay>(res);
        if (cancelled) return;

        const veli = resolveVeliAdlari(detay.veliler, {
          veli_ad_soyad: detay.veli_ad_soyad || student.veli_ad_soyad,
          veli_yakinlik: student.veli_yakinlik,
        });

        setForm((prev) => ({
          ...prev,
          tc_kimlik_no: detay.tc_kimlik_no || prev.tc_kimlik_no,
          adi_soyadi: studentDisplayName(detay) || prev.adi_soyadi,
          baba_adi: veli.baba || prev.baba_adi,
          anne_adi: veli.anne || prev.anne_adi,
          dogum_tarihi: formatDateTr(detay.dogum_tarihi_iso || detay.dogum_tarihi) || prev.dogum_tarihi,
          alan_bolum:
            detay.sinif_seviyesi?.ad ||
            (typeof detay.sinif_seviyesi === 'string' ? detay.sinif_seviyesi : '') ||
            student.sinif_seviyesi ||
            prev.alan_bolum,
          kurs_muduru: activeSube?.kurs_muduru || prev.kurs_muduru,
        }));
      } catch {
        if (!cancelled) setError('Öğrenci detayları yüklenemedi. Alanları elle doldurabilirsiniz.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student.id, student.sinif_seviyesi, activeSube?.kurs_muduru]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const setField = (key: keyof OgrenciBelgesiForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleOlustur = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.adi_soyadi.trim()) return;
    setPhase('preview');
  };

  const handlePdf = useCallback(async () => {
    setPdfBusy(true);
    try {
      await print();
    } finally {
      setPdfBusy(false);
    }
  }, [print]);

  const belgeIcerik = (
    <div className="resmi-belge" style={{ fontFamily: "'Times New Roman', Times, serif", color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={absoluteAssetUrl(logoUrl)}
          alt="Kurum logosu"
          style={{ maxHeight: 72, maxWidth: 180, objectFit: 'contain', marginBottom: 16 }}
        />
        <div style={{ fontSize: '13pt', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {kurumResmiAd}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: '14pt', fontWeight: 700, textDecoration: 'underline' }}>Öğrenci Belgesi</div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <ResmiYaziMeta sayi={form.sayi} konu={form.konu} tarih={form.belge_tarihi} />
        <div style={{ height: '4.8em' }} aria-hidden="true" />
        {fieldLine('T.C. Kimlik No', form.tc_kimlik_no)}
        {fieldLine('Adı Soyadı', form.adi_soyadi)}
        {fieldLine('Baba Adı', form.baba_adi)}
        {fieldLine('Anne Adı', form.anne_adi)}
        {fieldLine('Doğum Yeri', form.dogum_yeri)}
        {fieldLine('Doğum Tarihi', form.dogum_tarihi)}
        {fieldLine('Alan / Bölüm', form.alan_bolum)}
      </div>

      <p style={{ fontSize: '12pt', lineHeight: 1.8, textAlign: 'justify', marginBottom: 48 }}>
        Yukarıda açık kimliği yazılı <strong>{form.adi_soyadi}</strong> kursumuzun devamlı öğrencisidir.
      </p>

      <div style={{ marginTop: 64, textAlign: 'right', paddingRight: 24 }}>
        <div style={{ fontSize: '12pt', fontWeight: 600, marginBottom: 8 }}>Kurs Müdürü</div>
        {form.kurs_muduru.trim() && (
          <div style={{ fontSize: '12pt' }}>{form.kurs_muduru}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="ogrenci-belge-overlay" onClick={onClose}>
      <div
        className={`ogrenci-belge-modal ${phase === 'preview' ? 'ogrenci-belge-modal--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ogrenci-belge-modal-header">
          <div>
            <h3>Öğrenci Belgesi</h3>
            <p>{form.adi_soyadi || studentDisplayName(student)}</p>
          </div>
          <button type="button" className="ogrenci-belge-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="ogrenci-belge-loading">Öğrenci bilgileri yükleniyor…</div>
        ) : phase === 'form' ? (
          <form className="ogrenci-belge-form" onSubmit={handleOlustur}>
            {error && <div className="ogrenci-belge-error">{error}</div>}
            <div className="ogrenci-belge-form-grid">
              <label>
                <span>Sayı</span>
                <input value={form.sayi} onChange={(e) => setField('sayi', e.target.value)} placeholder="Örn. 25" />
              </label>
              <label>
                <span>Konu</span>
                <input value={form.konu} onChange={(e) => setField('konu', e.target.value)} />
              </label>
              <label>
                <span>T.C. Kimlik No</span>
                <input value={form.tc_kimlik_no} onChange={(e) => setField('tc_kimlik_no', e.target.value)} />
              </label>
              <label>
                <span>Adı Soyadı *</span>
                <input value={form.adi_soyadi} onChange={(e) => setField('adi_soyadi', e.target.value)} required />
              </label>
              <label>
                <span>Baba Adı</span>
                <input value={form.baba_adi} onChange={(e) => setField('baba_adi', e.target.value)} />
              </label>
              <label>
                <span>Anne Adı</span>
                <input value={form.anne_adi} onChange={(e) => setField('anne_adi', e.target.value)} />
              </label>
              <label>
                <span>Doğum Yeri</span>
                <input value={form.dogum_yeri} onChange={(e) => setField('dogum_yeri', e.target.value)} />
              </label>
              <label>
                <span>Doğum Tarihi</span>
                <input
                  value={form.dogum_tarihi}
                  onChange={(e) => setField('dogum_tarihi', e.target.value)}
                  placeholder="GG/AA/YYYY"
                />
              </label>
              <label>
                <span>Alan / Bölüm</span>
                <input value={form.alan_bolum} onChange={(e) => setField('alan_bolum', e.target.value)} />
              </label>
              <label>
                <span>Belge Tarihi (Düzenlenme)</span>
                <input
                  value={form.belge_tarihi}
                  onChange={(e) => setField('belge_tarihi', e.target.value)}
                  placeholder="GG/AA/YYYY"
                />
              </label>
              <label className="ogrenci-belge-form-full">
                <span>Kurs Müdürü</span>
                <input value={form.kurs_muduru} onChange={(e) => setField('kurs_muduru', e.target.value)} />
              </label>
            </div>
            <div className="ogrenci-belge-form-actions">
              <button type="button" className="btn-modern btn-secondary" onClick={onClose}>
                İptal
              </button>
              <button type="submit" className="btn-modern btn-primary">
                Oluştur
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="ogrenci-belge-preview-toolbar">
              <button type="button" className="btn-modern btn-secondary" onClick={() => setPhase('form')}>
                Düzenle
              </button>
              <button type="button" className="btn-modern btn-secondary" onClick={handlePdf} disabled={pdfBusy}>
                {pdfBusy ? 'Hazırlanıyor…' : 'Yazdır'}
              </button>
              <button type="button" className="btn-modern btn-primary" onClick={handlePdf} disabled={pdfBusy}>
                {pdfBusy ? 'Hazırlanıyor…' : 'PDF İndir'}
              </button>
            </div>
            <div className="ogrenci-belge-preview-wrap">
              <div ref={contentRef} className="ogrenci-belge-preview-paper">
                {belgeIcerik}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
