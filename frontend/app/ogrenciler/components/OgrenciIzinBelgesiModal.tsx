'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useKurum } from '@/lib/contexts/KurumContext';
import { apiGet } from '@/lib/api';
import { brandingFromKurum, getAppLogo } from '@/lib/kurum-branding';
import { useVectorPrint } from '@/lib/useVectorPrint';
import type { OgrenciDetay } from '../[id]/types';
import type { OgrenciRow } from './OgrenciListResults';
import ResmiYaziMeta from './ResmiYaziMeta';

export type ProgramSatiri = {
  id: string;
  gun: string;
  baslangic: string;
  bitis: string;
};

export interface OgrenciIzinBelgesiForm {
  izin_alinacak_kurum: string;
  sayi: string;
  konu: string;
  tc_kimlik_no: string;
  adi_soyadi: string;
  varsayilan_baslangic: string;
  varsayilan_bitis: string;
  program: ProgramSatiri[];
  belge_tarihi: string;
  kurs_muduru: string;
}

interface Props {
  student: OgrenciRow & { dogum_tarihi?: string };
  onClose: () => void;
}

const DEFAULT_KONU = 'Eğitim Programı Kapsamında İzin Talebi';
const DEFAULT_BASLANGIC = '17.00';
const DEFAULT_BITIS = '21.00';

const GUN_SECENEKLERI = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

const DEFAULT_PROGRAM_GUNLER: string[] = [...GUN_SECENEKLERI];

function newProgramRow(gun = '', baslangic = DEFAULT_BASLANGIC, bitis = DEFAULT_BITIS): ProgramSatiri {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    gun,
    baslangic,
    bitis,
  };
}

function defaultProgramRows(): ProgramSatiri[] {
  return DEFAULT_PROGRAM_GUNLER.map((gun) => newProgramRow(gun, DEFAULT_BASLANGIC, DEFAULT_BITIS));
}

function saatAraligi(row: ProgramSatiri): string {
  if (!row.baslangic && !row.bitis) return '';
  return `${row.baslangic || '……'} – ${row.bitis || '……'}`;
}

function studentDisplayName(s: { tam_ad?: string; ad?: string; soyad?: string }): string {
  if (s.tam_ad?.trim()) return s.tam_ad.trim();
  return [s.ad?.trim(), s.soyad?.trim()].filter(Boolean).join(' ');
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

export default function OgrenciIzinBelgesiModal({ student, onClose }: Props) {
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

  const [form, setForm] = useState<OgrenciIzinBelgesiForm>({
    izin_alinacak_kurum: '',
    sayi: '',
    konu: DEFAULT_KONU,
    tc_kimlik_no: student.tc_kimlik_no || '',
    adi_soyadi: studentDisplayName(student),
    varsayilan_baslangic: DEFAULT_BASLANGIC,
    varsayilan_bitis: DEFAULT_BITIS,
    program: defaultProgramRows(),
    belge_tarihi: todayTr(),
    kurs_muduru: activeSube?.kurs_muduru || '',
  });

  const { contentRef, print } = useVectorPrint({
    title: 'Öğrenci İzin Belgesi',
    marginMm: '15mm 18mm',
    extraCss: `
      body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 12pt;
        color: #000;
        line-height: 1.5;
      }
      .resmi-belge { max-width: 100%; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; }
      th { font-weight: 700; }
    `,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<OgrenciDetay>(`/ogrenciler/api/${student.id}/`);
        if (!res.success) throw new Error(res.error || 'Detay alınamadı');
        const detay = unwrapApiPayload<OgrenciDetay>(res);
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          tc_kimlik_no: detay.tc_kimlik_no || prev.tc_kimlik_no,
          adi_soyadi: studentDisplayName(detay) || prev.adi_soyadi,
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
  }, [student.id, activeSube?.kurs_muduru]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const setField = <K extends keyof OgrenciIzinBelgesiForm>(key: K, value: OgrenciIzinBelgesiForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateProgramRow = (id: string, field: keyof Pick<ProgramSatiri, 'gun' | 'baslangic' | 'bitis'>, value: string) => {
    setForm((prev) => ({
      ...prev,
      program: prev.program.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    }));
  };

  const addProgramRow = () => {
    setForm((prev) => ({
      ...prev,
      program: [
        ...prev.program,
        newProgramRow('', prev.varsayilan_baslangic, prev.varsayilan_bitis),
      ],
    }));
  };

  const applyVarsayilanSaatler = () => {
    setForm((prev) => ({
      ...prev,
      program: prev.program.map((r) => ({
        ...r,
        baslangic: prev.varsayilan_baslangic,
        bitis: prev.varsayilan_bitis,
      })),
    }));
  };

  const removeProgramRow = (id: string) => {
    setForm((prev) => ({
      ...prev,
      program: prev.program.length <= 1 ? prev.program : prev.program.filter((r) => r.id !== id),
    }));
  };

  const handleOlustur = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.adi_soyadi.trim() || !form.izin_alinacak_kurum.trim()) return;
    setPhase('preview');
  };

  const handlePrint = useCallback(async () => {
    setPdfBusy(true);
    try {
      await print();
    } finally {
      setPdfBusy(false);
    }
  }, [print]);

  const programTable = (rows: ProgramSatiri[]) => (
    <table style={{ width: '100%', marginTop: 8, marginBottom: 24, fontSize: '12pt' }}>
      <thead>
        <tr>
          <th style={{ border: '1px solid #000', padding: '6px 10px', width: '40%' }}>Gün</th>
          <th style={{ border: '1px solid #000', padding: '6px 10px' }}>Saat</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td style={{ border: '1px solid #000', padding: '6px 10px' }}>{row.gun || '\u00A0'}</td>
            <td style={{ border: '1px solid #000', padding: '6px 10px' }}>{saatAraligi(row) || '\u00A0'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const belgeIcerik = (
    <div className="resmi-belge" style={{ fontFamily: "'Times New Roman', Times, serif", color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={absoluteAssetUrl(logoUrl)}
          alt="Kurum logosu"
          style={{ maxHeight: 64, maxWidth: 160, objectFit: 'contain', marginBottom: 12 }}
        />
        <div style={{ fontSize: '13pt', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {kurumResmiAd}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <ResmiYaziMeta
          sayi={form.sayi}
          konu={form.konu}
          tarih={form.belge_tarihi}
          konuFallback={DEFAULT_KONU}
        />
        <div style={{ height: '4.8em' }} aria-hidden="true" />
        <div style={{ fontSize: '12pt', fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>
          {form.izin_alinacak_kurum.trim().toUpperCase() || '………'}
        </div>
      </div>

      <p style={{ fontSize: '12pt', lineHeight: 1.8, textAlign: 'justify', marginBottom: 16 }}>
        Kurumumuz öğrencilerinden, T.C. Kimlik No:{' '}
        <strong>{form.tc_kimlik_no || '………………'}</strong> olan{' '}
        <strong>{form.adi_soyadi}</strong>, kurumumuzda yürütülen eğitim programına kayıtlı olup, aşağıda
        belirtilen gün ve saatlerde eğitim faaliyetlerine katılmaktadır.
      </p>
      <p style={{ fontSize: '12pt', lineHeight: 1.8, textAlign: 'justify', marginBottom: 8 }}>
        Öğrencimizin eğitim programına düzenli olarak katılım sağlayabilmesi amacıyla, belirtilen gün ve saatlerde
        kurumumuzda bulunmasına izin verilmesi hususunda;
      </p>
      <p style={{ fontSize: '12pt', lineHeight: 1.8, textAlign: 'justify', marginBottom: 8 }}>
        Bilgilerinizi ve gereğini arz ederiz.
      </p>

      {programTable(form.program.filter((r) => r.gun.trim()))}

      <div style={{ marginTop: 48, textAlign: 'right', paddingRight: 24 }}>
        <div style={{ fontSize: '12pt', fontWeight: 600, marginBottom: 8 }}>Kurs Müdürü</div>
        {form.kurs_muduru.trim() && <div style={{ fontSize: '12pt' }}>{form.kurs_muduru}</div>}
      </div>
    </div>
  );

  return (
    <div className="ogrenci-belge-overlay" onClick={onClose}>
      <div
        className={`ogrenci-belge-modal ogrenci-belge-modal--wide`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ogrenci-belge-modal-header">
          <div>
            <h3>Öğrenci İzin Belgesi</h3>
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
              <div className="ogrenci-belge-form-full ogrenci-izin-veren-kurum">
                <span className="ogrenci-belge-field-label">İzin Veren Kurum (Şube resmi adı)</span>
                <div className="ogrenci-izin-veren-kurum-value">{kurumResmiAd}</div>
              </div>

              <label className="ogrenci-belge-form-full">
                <span>İzin Alınacak Kurum *</span>
                <input
                  value={form.izin_alinacak_kurum}
                  onChange={(e) => setField('izin_alinacak_kurum', e.target.value)}
                  placeholder="Örn. ABC Lisesi Okul Müdürlüğüne"
                  required
                />
              </label>

              <label>
                <span>Sayı</span>
                <input
                  value={form.sayi}
                  onChange={(e) => setField('sayi', e.target.value)}
                  placeholder="Örn. 125/2026"
                />
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
                <span>Belge Tarihi</span>
                <input
                  value={form.belge_tarihi}
                  onChange={(e) => setField('belge_tarihi', e.target.value)}
                  placeholder="GG/AA/YYYY"
                />
              </label>
              <label>
                <span>Kurs Müdürü</span>
                <input value={form.kurs_muduru} onChange={(e) => setField('kurs_muduru', e.target.value)} />
              </label>
            </div>

            <div className="ogrenci-izin-program-editor">
              <div className="ogrenci-izin-program-header">
                <span>Eğitim Programı (Gün / Saat)</span>
                <button type="button" className="btn-modern btn-secondary btn-sm" onClick={addProgramRow}>
                  + Satır Ekle
                </button>
              </div>

              <div className="ogrenci-izin-varsayilan-saat">
                <label>
                  <span>Varsayılan Başlangıç</span>
                  <input
                    value={form.varsayilan_baslangic}
                    onChange={(e) => setField('varsayilan_baslangic', e.target.value)}
                    placeholder="17.00"
                  />
                </label>
                <label>
                  <span>Varsayılan Bitiş</span>
                  <input
                    value={form.varsayilan_bitis}
                    onChange={(e) => setField('varsayilan_bitis', e.target.value)}
                    placeholder="21.00"
                  />
                </label>
                <button
                  type="button"
                  className="btn-modern btn-secondary btn-sm ogrenci-izin-saat-uygula"
                  onClick={applyVarsayilanSaatler}
                >
                  Tüm satırlara uygula
                </button>
              </div>

              <div className="ogrenci-izin-program-colhead">
                <span>Gün</span>
                <span>Başlangıç</span>
                <span>Bitiş</span>
                <span />
              </div>
              <div className="ogrenci-izin-program-rows">
                {form.program.map((row) => (
                  <div key={row.id} className="ogrenci-izin-program-row">
                    <select
                      value={row.gun}
                      onChange={(e) => updateProgramRow(row.id, 'gun', e.target.value)}
                      required
                    >
                      <option value="">Gün seçin</option>
                      {GUN_SECENEKLERI.map((gun) => (
                        <option key={gun} value={gun}>
                          {gun}
                        </option>
                      ))}
                    </select>
                    <input
                      value={row.baslangic}
                      onChange={(e) => updateProgramRow(row.id, 'baslangic', e.target.value)}
                      placeholder="17.00"
                    />
                    <input
                      value={row.bitis}
                      onChange={(e) => updateProgramRow(row.id, 'bitis', e.target.value)}
                      placeholder="21.00"
                    />
                    <button
                      type="button"
                      className="ogrenci-izin-program-remove"
                      onClick={() => removeProgramRow(row.id)}
                      title="Satırı sil"
                      aria-label="Satırı sil"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
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
              <button type="button" className="btn-modern btn-secondary" onClick={handlePrint} disabled={pdfBusy}>
                {pdfBusy ? 'Hazırlanıyor…' : 'Yazdır'}
              </button>
              <button type="button" className="btn-modern btn-primary" onClick={handlePrint} disabled={pdfBusy}>
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
