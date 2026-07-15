'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchSozlesme,
  fetchHelperData,
  createSozlesme,
  updateSozlesme,
  saveTaslak,
  fetchPrintToken,
  getPrintTokenUrl,
  downloadSozlesmePdf,
} from '../services/api';
import type {
  Sozlesme,
  SozlesmeFormData,
  HelperData,
  MaasPlaniSatiri,
  MesaiSaati,
  SozlesmeMadde,
  OzetMetrikleri,
  SozlesmeTuru,
  DersUcret,
  UcretTipi,
} from '../types';
import {
  SOZLESME_TURU_COLORS,
  DURUM_COLORS,
  DURUM_LABELS,
} from '../types';
import {
  deriveMonthDates,
  defaultMesaiSaatleri,
  generateDefaultMaasPlani,
  GUN_ADLARI,
  fmtTL,
  fmtTLDec,
  fmtTarih,
  fmtAySuresi,
} from '../lib/contractCalc';
import { useMaasPlaniChainFill } from '../hooks/useMaasPlaniChainFill';
import { useSozlesmeHesap } from '../hooks/useSozlesmeHesap';
import { useSozlesmeForm } from '../hooks/useSozlesmeForm';
import '../sozlesme-editor.css';

type EditorTab =
  | 'genel'
  | 'calisma-modeli'
  | 'maas-plani'
  | 'ders-ucreti'
  | 'calisma-duzeni'
  | 'mesai'
  | 'maddeler';

const TABS: { id: EditorTab; label: string; icon: string }[] = [
  { id: 'genel', label: 'Genel', icon: '📋' },
  { id: 'calisma-modeli', label: 'Çalışma Modeli', icon: '⚙️' },
  { id: 'maas-plani', label: 'Maaş Planı', icon: '💰' },
  { id: 'ders-ucreti', label: 'Ders Ücreti', icon: '💎' },
  { id: 'calisma-duzeni', label: 'Çalışma Düzeni', icon: '📅' },
  { id: 'mesai', label: 'Mesai', icon: '🕐' },
  { id: 'maddeler', label: 'Maddeler', icon: '📝' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultBitis(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function emptyForm(): SozlesmeFormData {
  const bas = todayIso();
  const bit = defaultBitis();
  return {
    personel_id: 0,
    sozlesme_turu: 'TAM_ZAMANLI',
    durum: 'TASLAK',
    baslangic_tarihi: bas,
    bitis_tarihi: bit,
    duzenlenme_tarihi: bas,
    brut_maas: 0,
    net_maas: 0,
    sgk_gun: 30,
    ders_ucreti_aktif: false,
    notlar: '',
    ders_ucretleri: [],
    ucret_donemleri: [],
    haftalik_calisma_gun_sayisi: 5,
    haftalik_izin_gunleri: [6, 7],
    ders_ucret_tipi: '',
    ders_birim_ucret: 0,
    maas_plani: generateDefaultMaasPlani(bas, bit, 0),
    mesai_saatleri: defaultMesaiSaatleri(),
    maddeler: [],
  };
}

function sozlesmeToForm(s: Sozlesme): SozlesmeFormData {
  return {
    personel_id: s.personel_id,
    sozlesme_turu: s.sozlesme_turu,
    durum: s.durum,
    baslangic_tarihi: s.baslangic_tarihi,
    bitis_tarihi: s.bitis_tarihi,
    duzenlenme_tarihi: s.duzenlenme_tarihi || s.baslangic_tarihi,
    brut_maas: s.brut_maas,
    net_maas: s.net_maas,
    sgk_gun: s.sgk_gun,
    ders_ucreti_aktif: s.ders_ucreti_aktif,
    notlar: s.notlar,
    ders_ucretleri: s.ders_ucretleri || [],
    ucret_donemleri: s.ucret_donemleri || [],
    sube_id: s.sube_id,
    gorevlendirme_id: s.gorevlendirme_id,
    personel_no_snapshot: s.personel_no_snapshot,
    brans_snapshot: s.brans_snapshot,
    gorev_snapshot: s.gorev_snapshot,
    departman_snapshot: s.departman_snapshot,
    haftalik_calisma_gun_sayisi: s.haftalik_calisma_gun_sayisi ?? 5,
    haftalik_izin_gunleri: s.haftalik_izin_gunleri ?? [6, 7],
    ders_ucret_tipi: s.ders_ucret_tipi || '',
    ders_birim_ucret: s.ders_birim_ucret ?? 0,
    maas_plani: s.maas_plani?.length
      ? s.maas_plani
      : generateDefaultMaasPlani(s.baslangic_tarihi, s.bitis_tarihi, s.net_maas || s.brut_maas),
    mesai_saatleri: s.mesai_saatleri?.length ? s.mesai_saatleri : defaultMesaiSaatleri(),
    maddeler: s.maddeler || [],
  };
}

/* ═══ Özet Paneli ═══ */
function SozlesmeOzetiPanel({ ozet }: { ozet: OzetMetrikleri }) {
  return (
    <div className="sozlesme-editor__ozet-panel">
      <div className="sozlesme-editor__ozet-header">
        <h3>Sözleşme Özeti</h3>
        <p>Canlı hesaplama</p>
      </div>
      <div className="sozlesme-editor__ozet-body">
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">Toplam Net Maaş</span>
          <span className="sozlesme-editor__ozet-value">{fmtTL(ozet.toplam_maas)}</span>
        </div>
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">Çalışma Süresi</span>
          <span className="sozlesme-editor__ozet-value">{fmtAySuresi(ozet.toplam_calisma_suresi_ay)}</span>
        </div>
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">Haftalık Saat</span>
          <span className="sozlesme-editor__ozet-value">{ozet.haftalik_calisma_saati.toFixed(1)} saat</span>
        </div>
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">Günlük Ücret</span>
          <span className="sozlesme-editor__ozet-value">{fmtTLDec(ozet.gunluk_ucret)}</span>
        </div>
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">Saatlik Ücret</span>
          <span className="sozlesme-editor__ozet-value">{fmtTLDec(ozet.saatlik_ucret)}</span>
        </div>
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">Tahmini Aylık</span>
          <span className="sozlesme-editor__ozet-value">{fmtTL(ozet.tahmini_aylik_maliyet)}</span>
        </div>
        {ozet.ders_ucreti > 0 && (
          <div className="sozlesme-editor__ozet-row">
            <span className="sozlesme-editor__ozet-label">Ders Ücreti</span>
            <span className="sozlesme-editor__ozet-value">{fmtTLDec(ozet.ders_ucreti)}</span>
          </div>
        )}
        <div className="sozlesme-editor__ozet-row">
          <span className="sozlesme-editor__ozet-label">SGK Gün</span>
          <span className="sozlesme-editor__ozet-value">{ozet.sgk_gun}</span>
        </div>
        {ozet.kalan_gun > 0 && (
          <div className="sozlesme-editor__ozet-row">
            <span className="sozlesme-editor__ozet-label">Kalan Gün</span>
            <span className="sozlesme-editor__ozet-value">{ozet.kalan_gun} gün</span>
          </div>
        )}
        <div className="sozlesme-editor__ozet-highlight">
          <div className="sozlesme-editor__ozet-row">
            <span className="sozlesme-editor__ozet-label">Toplam Net Bedel</span>
            <span className="sozlesme-editor__ozet-value">{fmtTL(ozet.toplam_maas)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Maaş Planı Grid ═══ */
function MaasPlaniGrid({
  rows,
  contractStart,
  onChange,
}: {
  rows: MaasPlaniSatiri[];
  contractStart: string;
  onChange: (rows: MaasPlaniSatiri[]) => void;
}) {
  const { applyChainFill } = useMaasPlaniChainFill();

  const updateRow = (idx: number, field: keyof MaasPlaniSatiri, val: string | number) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
    if (field === 'maas') {
      onChange(applyChainFill(next, idx, 'maas'));
    } else if (field === 'baslangic_tarihi' || field === 'bitis_tarihi') {
      onChange(deriveMonthDates(next, contractStart));
    } else {
      onChange(deriveMonthDates(next, contractStart));
    }
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const newRow: MaasPlaniSatiri = {
      sira_no: rows.length + 1,
      baslangic_tarihi: '',
      bitis_tarihi: '',
      calisilan_gun: 0,
      maas: last?.maas ?? 0,
      aciklama: '',
    };
    onChange(deriveMonthDates([...rows, newRow], contractStart));
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    const next = rows.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sira_no: i + 1 }));
    onChange(deriveMonthDates(next, contractStart));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Maaş değişikliği sonraki aylara kopyalanır. Son ay kısmi ise bitiş tarihini kısaltın (ör. 15 gün).
        </span>
        <button type="button" className="se-btn se-btn-secondary se-btn-sm" onClick={addRow}>
          + Ay Ekle
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="se-maas-grid">
          <thead>
            <tr>
              <th>Ay</th>
              <th>Başlangıç</th>
              <th>Bitiş</th>
              <th>Gün</th>
              <th>Net Maaş (₺)</th>
              <th>Açıklama</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td>{row.sira_no}</td>
                <td>
                  <input
                    type="date"
                    className="se-input"
                    value={row.baslangic_tarihi}
                    onChange={(e) => updateRow(idx, 'baslangic_tarihi', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="se-input"
                    value={row.bitis_tarihi}
                    onChange={(e) => updateRow(idx, 'bitis_tarihi', e.target.value)}
                  />
                </td>
                <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.calisilan_gun}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="se-input"
                    value={row.maas || ''}
                    onChange={(e) => updateRow(idx, 'maas', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="se-input"
                    value={row.aciklama}
                    onChange={(e) => updateRow(idx, 'aciklama', e.target.value)}
                    placeholder="Opsiyonel"
                  />
                </td>
                <td>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="se-btn se-btn-ghost se-btn-sm"
                      onClick={() => removeRow(idx)}
                      title="Satırı sil"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══ Mesai Hafta Grid ═══ */
function MesaiHaftaGrid({
  rows,
  onChange,
}: {
  rows: MesaiSaati[];
  onChange: (rows: MesaiSaati[]) => void;
}) {
  const updateRow = (idx: number, field: keyof MesaiSaati, val: string | number | boolean | null) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
    onChange(next);
  };

  const copyToAll = () => {
    const source = rows.find((r) => r.aktif && r.baslangic && r.bitis);
    if (!source) return;
    onChange(
      rows.map((r) =>
        r.aktif
          ? { ...r, baslangic: source.baslangic, bitis: source.bitis, mola_dakika: source.mola_dakika }
          : r,
      ),
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="se-btn se-btn-secondary se-btn-sm" onClick={copyToAll}>
          📋 Aktif günlere kopyala
        </button>
      </div>
      <div className="se-mesai-grid">
        {rows.map((row, idx) => (
          <div key={row.gun} className={`se-mesai-row${row.aktif ? '' : ' is-off'}`}>
            <div className="se-mesai-day">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={row.aktif}
                  onChange={(e) => updateRow(idx, 'aktif', e.target.checked)}
                />
                {GUN_ADLARI[row.gun]}
              </label>
            </div>
            <input
              type="time"
              className="se-input"
              value={row.baslangic || ''}
              disabled={!row.aktif}
              onChange={(e) => updateRow(idx, 'baslangic', e.target.value || null)}
            />
            <input
              type="time"
              className="se-input"
              value={row.bitis || ''}
              disabled={!row.aktif}
              onChange={(e) => updateRow(idx, 'bitis', e.target.value || null)}
            />
            <input
              type="number"
              min={0}
              className="se-input"
              value={row.mola_dakika}
              disabled={!row.aktif}
              onChange={(e) => updateRow(idx, 'mola_dakika', parseInt(e.target.value, 10) || 0)}
              title="Mola (dk)"
            />
            <span style={{ fontSize: 11, color: '#64748b' }}>dk mola</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ Maddeler Listesi ═══ */
function MaddelerList({
  maddeler,
  onChange,
}: {
  maddeler: SozlesmeMadde[];
  onChange: (maddeler: SozlesmeMadde[]) => void;
}) {
  const addMadde = () => {
    onChange([...maddeler, { sira: maddeler.length + 1, metin: '' }]);
  };

  const updateMadde = (idx: number, metin: string) => {
    onChange(maddeler.map((m, i) => (i === idx ? { ...m, metin } : m)));
  };

  const removeMadde = (idx: number) => {
    onChange(
      maddeler
        .filter((_, i) => i !== idx)
        .map((m, i) => ({ ...m, sira: i + 1 })),
    );
  };

  const moveMadde = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= maddeler.length) return;
    const next = [...maddeler];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((m, i) => ({ ...m, sira: i + 1 })));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="se-btn se-btn-secondary se-btn-sm" onClick={addMadde}>
          + Madde Ekle
        </button>
      </div>
      {maddeler.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 24 }}>
          Henüz sözleşme maddesi eklenmedi.
        </p>
      ) : (
        maddeler.map((madde, idx) => (
          <div key={idx} className="se-madde-item">
            <div className="se-madde-order">
              <button
                type="button"
                className="se-btn se-btn-ghost se-btn-sm"
                disabled={idx === 0}
                onClick={() => moveMadde(idx, -1)}
                title="Yukarı"
              >
                ▲
              </button>
              <button
                type="button"
                className="se-btn se-btn-ghost se-btn-sm"
                disabled={idx === maddeler.length - 1}
                onClick={() => moveMadde(idx, 1)}
                title="Aşağı"
              >
                ▼
              </button>
            </div>
            <span className="se-madde-num">{madde.sira}.</span>
            <textarea
              className="se-textarea"
              style={{ flex: 1, minHeight: 64 }}
              value={madde.metin}
              onChange={(e) => updateMadde(idx, e.target.value)}
              placeholder="Sözleşme maddesi metni..."
            />
            <button
              type="button"
              className="se-btn se-btn-danger se-btn-sm"
              onClick={() => removeMadde(idx)}
              title="Sil"
            >
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/* ═══ Ana Editör ═══ */
export interface SozlesmeEditorClientProps {
  mode: 'create' | 'edit';
  sozlesmeId?: number;
}

export default function SozlesmeEditorClient({ mode, sozlesmeId }: SozlesmeEditorClientProps) {
  const router = useRouter();
  const isEdit = mode === 'edit';

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [helper, setHelper] = useState<HelperData | null>(null);
  const [sozlesme, setSozlesme] = useState<Sozlesme | null>(null);
  const [form, setForm] = useState<SozlesmeFormData>(emptyForm);
  const [activeTab, setActiveTab] = useState<EditorTab>('genel');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [serverOzet, setServerOzet] = useState<OzetMetrikleri | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const buildPayload = useCallback((durum?: string): SozlesmeFormData => {
    const dersAktif = form.sozlesme_turu === 'DERS_UCRETLI' || form.sozlesme_turu === 'KARMA';
    const firstMaas = form.maas_plani?.[0]?.maas ?? form.net_maas ?? 0;
    return {
      ...form,
      durum: (durum || form.durum || 'TASLAK') as SozlesmeFormData['durum'],
      ders_ucreti_aktif: dersAktif,
      ders_ucretleri: dersAktif ? form.ders_ucretleri : [],
      net_maas: firstMaas,
      brut_maas: 0,
    };
  }, [form]);

  const { setDirty, markClean } = useSozlesmeForm(form, {
    isEdit,
    sozlesmeId,
    buildPayload,
  });

  const patchForm = useCallback((patch: Partial<SozlesmeFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, [setDirty]);

  const { ozet } = useSozlesmeHesap(
    {
      maas_plani: form.maas_plani || [],
      mesai_saatleri: form.mesai_saatleri || [],
      ders_birim_ucret: form.ders_birim_ucret ?? 0,
      ders_ucret_tipi: form.ders_ucret_tipi ?? '',
      sgk_gun: form.sgk_gun,
      haftalik_calisma_gun_sayisi: form.haftalik_calisma_gun_sayisi ?? 5,
      baslangic_tarihi: form.baslangic_tarihi,
      bitis_tarihi: form.bitis_tarihi,
    },
    serverOzet,
  );

  useEffect(() => {
    (async () => {
      const hRes = await fetchHelperData(isEdit && sozlesmeId ? sozlesmeId : undefined);
      if (hRes.success && hRes.data) setHelper(hRes.data);

      if (isEdit && sozlesmeId) {
        setLoading(true);
        const sRes = await fetchSozlesme(sozlesmeId);
        if (sRes.success && sRes.data) {
          setSozlesme(sRes.data);
          const loaded = sozlesmeToForm(sRes.data);
          setForm(loaded);
          markClean(loaded);
          if (sRes.data.ozet) setServerOzet(sRes.data.ozet);
        } else {
          showToast('error', sRes.error || 'Sözleşme yüklenemedi.');
        }
        setLoading(false);
      }
    })();
  }, [isEdit, sozlesmeId, markClean]);

  const selectedPersonel = helper?.personeller.find((p) => p.id === form.personel_id);
  const personelAd = sozlesme?.personel_ad || selectedPersonel?.tam_ad || 'Yeni Sözleşme';
  const personelFoto = sozlesme?.personel_foto || selectedPersonel?.fotograf || null;

  const showDersUcreti =
    form.sozlesme_turu === 'DERS_UCRETLI' || form.sozlesme_turu === 'KARMA';

  const handlePersonelChange = (personelId: number) => {
    const p = helper?.personeller.find((x) => x.id === personelId);
    const g = helper?.gorevlendirmeler?.find((x) => x.personel_id === personelId);
    patchForm({
      personel_id: personelId,
      personel_no_snapshot: p?.personel_no || '',
      sube_id: g?.sube_id ?? p?.sube_id ?? null,
      gorevlendirme_id: g?.id ?? null,
      brans_snapshot: g?.brans_ad || '',
      gorev_snapshot: g?.gorev_ad || '',
      departman_snapshot: g?.sube_ad || '',
    });
  };

  const handleTarihChange = (field: 'baslangic_tarihi' | 'bitis_tarihi', val: string) => {
    const bas = field === 'baslangic_tarihi' ? val : form.baslangic_tarihi;
    const bit = field === 'bitis_tarihi' ? val : form.bitis_tarihi;
    const firstMaas = form.maas_plani?.[0]?.maas ?? form.brut_maas;
    patchForm({
      [field]: val,
      maas_plani: generateDefaultMaasPlani(bas, bit, firstMaas),
    });
  };

  const handleSave = async (asTaslak = false) => {
    if (!form.personel_id) {
      showToast('error', 'Personel seçimi zorunludur.');
      setActiveTab('genel');
      return;
    }
    if (!form.baslangic_tarihi || !form.bitis_tarihi) {
      showToast('error', 'Başlangıç ve bitiş tarihleri zorunludur.');
      setActiveTab('genel');
      return;
    }

    setSaving(true);
    const payload = buildPayload(asTaslak ? 'TASLAK' : 'AKTIF');

    try {
      let res;
      if (isEdit && sozlesmeId) {
        res = asTaslak
          ? await saveTaslak(sozlesmeId, payload)
          : await updateSozlesme(sozlesmeId, payload);
      } else {
        res = await createSozlesme(payload);
      }

      if (res.success && res.data) {
        markClean(payload);
        showToast('success', isEdit ? 'Sözleşme güncellendi.' : 'Sözleşme oluşturuldu.');
        router.push(`/admin/personel/sozlesmeler/${res.data.id}`);
      } else {
        showToast('error', res.error || 'Kayıt başarısız.');
      }
    } catch {
      showToast('error', 'Sunucu hatası.');
    }
    setSaving(false);
  };

  const handlePdfPreview = async () => {
    if (!sozlesmeId) {
      showToast('error', 'Önce sözleşmeyi kaydedin.');
      return;
    }
    const res = await fetchPrintToken(sozlesmeId);
    if (res.success && res.token) {
      window.open(getPrintTokenUrl(sozlesmeId, res.token), '_blank');
    } else {
      showToast('error', res.error || 'PDF token alınamadı.');
    }
  };

  const handlePdfDownload = async () => {
    if (!sozlesmeId) {
      showToast('error', 'Önce sözleşmeyi kaydedin.');
      return;
    }
    const res = await downloadSozlesmePdf(sozlesmeId);
    if (!res.success) showToast('error', res.error || 'PDF indirilemedi.');
  };

  const addDersUcret = () => {
    const row: DersUcret = {
      brans_id: null,
      ucret_tipi: 'SAAT_BASI' as UcretTipi,
      birim_ucret: 0,
      haftalik_saat: 0,
      min_saat: null,
      max_saat: null,
      notlar: '',
    };
    patchForm({ ders_ucretleri: [...form.ders_ucretleri, row] });
  };

  const updateDersUcret = (idx: number, field: string, val: unknown) => {
    const arr = [...form.ders_ucretleri];
    (arr[idx] as unknown as Record<string, unknown>)[field] = val;
    patchForm({ ders_ucretleri: arr });
  };

  const toggleIzinGunu = (gun: number) => {
    const current = form.haftalik_izin_gunleri || [];
    const next = current.includes(gun)
      ? current.filter((g) => g !== gun)
      : [...current, gun].sort();
    patchForm({ haftalik_izin_gunleri: next });
  };

  if (loading) {
    return <div className="se-loading">Yükleniyor...</div>;
  }

  return (
    <div className="sozlesme-editor">
      {toast && (
        <div className={`se-toast se-toast--${toast.type}`}>{toast.msg}</div>
      )}

      {/* Header */}
      <header className="sozlesme-editor__header">
        <div className="sozlesme-editor__header-left">
          {personelFoto ? (
            <img src={personelFoto} alt="" className="sozlesme-editor__avatar" />
          ) : (
            <div className="sozlesme-editor__avatar-fallback">
              {personelAd.charAt(0)}
            </div>
          )}
          <div className="sozlesme-editor__title-block">
            <h1>{isEdit ? 'Sözleşme Düzenle' : 'Yeni Sözleşme'}</h1>
            <p>{personelAd}{sozlesme?.sozlesme_no ? ` · ${sozlesme.sozlesme_no}` : ''}</p>
            <div className="sozlesme-editor__badges">
              <span
                className="sozlesme-editor__badge"
                style={{ backgroundColor: SOZLESME_TURU_COLORS[form.sozlesme_turu] }}
              >
                {helper?.sozlesme_turleri.find((t) => t.value === form.sozlesme_turu)?.label || form.sozlesme_turu}
              </span>
              <span
                className="sozlesme-editor__badge"
                style={{ backgroundColor: DURUM_COLORS[form.durum || 'TASLAK'] || '#6b7280' }}
              >
                {DURUM_LABELS[form.durum || 'TASLAK'] || form.durum}
              </span>
            </div>
          </div>
        </div>
        <div className="sozlesme-editor__header-actions">
          <button
            type="button"
            className="se-btn se-btn-secondary"
            onClick={() => router.push('/admin/personel/sozlesmeler')}
          >
            ← Listeye Dön
          </button>
          {isEdit && (
            <>
              <button type="button" className="se-btn se-btn-secondary" onClick={handlePdfPreview}>
                👁 Önizle
              </button>
              <button type="button" className="se-btn se-btn-secondary" onClick={handlePdfDownload}>
                ⬇ PDF
              </button>
            </>
          )}
          <button
            type="button"
            className="se-btn se-btn-ghost"
            disabled={saving}
            onClick={() => handleSave(true)}
          >
            Taslak Kaydet
          </button>
          <button
            type="button"
            className="se-btn se-btn-primary"
            disabled={saving}
            onClick={() => handleSave(false)}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </header>

      <div className="sozlesme-editor__body">
        {/* Main column */}
        <div className="sozlesme-editor__main-col">
          <nav className="sozlesme-editor__tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`sozlesme-editor__tab-btn${activeTab === tab.id ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="sozlesme-editor__content">
            {/* Genel */}
            {activeTab === 'genel' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">📋 Genel Bilgiler</h2>
                <div className="se-field">
                  <label>Personel *</label>
                  <select
                    className="se-select"
                    value={form.personel_id || ''}
                    onChange={(e) => handlePersonelChange(Number(e.target.value))}
                    disabled={isEdit}
                  >
                    <option value="">Seçiniz...</option>
                    {helper?.personeller.map((p) => (
                      <option key={p.id} value={p.id}>{p.tam_ad}</option>
                    ))}
                  </select>
                </div>
                <div className="se-grid-2">
                  <div className="se-field">
                    <label>Sözleşme Türü *</label>
                    <select
                      className="se-select"
                      value={form.sozlesme_turu}
                      onChange={(e) => {
                        const tur = e.target.value as SozlesmeTuru;
                        patchForm({
                          sozlesme_turu: tur,
                          ders_ucreti_aktif: tur !== 'TAM_ZAMANLI',
                        });
                      }}
                    >
                      {helper?.sozlesme_turleri.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="se-field">
                    <label>Düzenlenme Tarihi</label>
                    <input
                      type="date"
                      className="se-input"
                      value={form.duzenlenme_tarihi || ''}
                      onChange={(e) => patchForm({ duzenlenme_tarihi: e.target.value })}
                    />
                  </div>
                </div>
                <div className="se-grid-2">
                  <div className="se-field">
                    <label>Başlangıç Tarihi *</label>
                    <input
                      type="date"
                      className="se-input"
                      value={form.baslangic_tarihi}
                      onChange={(e) => handleTarihChange('baslangic_tarihi', e.target.value)}
                    />
                  </div>
                  <div className="se-field">
                    <label>Bitiş Tarihi *</label>
                    <input
                      type="date"
                      className="se-input"
                      value={form.bitis_tarihi}
                      onChange={(e) => handleTarihChange('bitis_tarihi', e.target.value)}
                    />
                  </div>
                </div>
                <div className="se-grid-2">
                  <div className="se-field">
                    <label>Personel No</label>
                    <input
                      className="se-input"
                      value={form.personel_no_snapshot || ''}
                      onChange={(e) => patchForm({ personel_no_snapshot: e.target.value })}
                      placeholder="Otomatik doldurulur"
                    />
                  </div>
                  <div className="se-field">
                    <label>Branş</label>
                    <input
                      className="se-input"
                      value={form.brans_snapshot || ''}
                      onChange={(e) => patchForm({ brans_snapshot: e.target.value })}
                    />
                  </div>
                </div>
                <div className="se-grid-2">
                  <div className="se-field">
                    <label>Görev</label>
                    <input
                      className="se-input"
                      value={form.gorev_snapshot || ''}
                      onChange={(e) => patchForm({ gorev_snapshot: e.target.value })}
                    />
                  </div>
                  <div className="se-field">
                    <label>Departman / Şube</label>
                    <input
                      className="se-input"
                      value={form.departman_snapshot || ''}
                      onChange={(e) => patchForm({ departman_snapshot: e.target.value })}
                    />
                  </div>
                </div>
                <div className="se-field">
                  <label>Notlar</label>
                  <textarea
                    className="se-textarea"
                    rows={3}
                    value={form.notlar}
                    onChange={(e) => patchForm({ notlar: e.target.value })}
                    placeholder="Opsiyonel notlar..."
                  />
                </div>
              </div>
            )}

            {/* Çalışma Modeli */}
            {activeTab === 'calisma-modeli' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">⚙️ Çalışma Modeli</h2>
                <div className="se-grid-3">
                  <div className="se-field">
                    <label>SGK Gün Sayısı</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      className="se-input"
                      value={form.sgk_gun}
                      onChange={(e) => patchForm({ sgk_gun: parseInt(e.target.value, 10) || 30 })}
                    />
                  </div>
                  <div className="se-field">
                    <label>Haftalık Çalışma Günü</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      className="se-input"
                      value={form.haftalik_calisma_gun_sayisi}
                      onChange={(e) =>
                        patchForm({ haftalik_calisma_gun_sayisi: parseInt(e.target.value, 10) || 5 })
                      }
                    />
                  </div>
                  <div className="se-field">
                    <label>Net Maaş (₺)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="se-input"
                      value={form.net_maas || ''}
                      onChange={(e) => {
                        const net = parseFloat(e.target.value) || 0;
                        const plan = [...(form.maas_plani || [])];
                        if (plan.length > 0) plan[0] = { ...plan[0], maas: net };
                        patchForm({ net_maas: net, maas_plani: plan.length ? plan : form.maas_plani });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Maaş Planı */}
            {activeTab === 'maas-plani' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">💰 Maaş Planı</h2>
                <MaasPlaniGrid
                  rows={form.maas_plani || []}
                  contractStart={form.baslangic_tarihi}
                  onChange={(rows) => {
                    const lastEnd = rows[rows.length - 1]?.bitis_tarihi;
                    patchForm({
                      maas_plani: rows,
                      net_maas: rows[0]?.maas ?? form.net_maas ?? 0,
                      ...(lastEnd ? { bitis_tarihi: lastEnd } : {}),
                    });
                  }}
                />
              </div>
            )}

            {/* Ders Ücreti */}
            {activeTab === 'ders-ucreti' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">💎 Ders Ücreti</h2>
                {!showDersUcreti ? (
                  <p style={{ color: '#94a3b8', fontSize: 13 }}>
                    Ders ücreti yalnızca &quot;Ders Ücretli&quot; veya &quot;Karma&quot; sözleşmelerde aktiftir.
                  </p>
                ) : (
                  <>
                    <div className="se-grid-2">
                      <div className="se-field">
                        <label>Ders Ücret Tipi</label>
                        <select
                          className="se-select"
                          value={form.ders_ucret_tipi || ''}
                          onChange={(e) => patchForm({ ders_ucret_tipi: e.target.value })}
                        >
                          <option value="">Seçiniz...</option>
                          {(helper?.ders_ucret_tipleri || helper?.ucret_tipleri || []).map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="se-field">
                        <label>Birim Ücret (₺)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="se-input"
                          value={form.ders_birim_ucret || ''}
                          onChange={(e) =>
                            patchForm({ ders_birim_ucret: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Branş Bazlı Tanımlar</span>
                      <button type="button" className="se-btn se-btn-secondary se-btn-sm" onClick={addDersUcret}>
                        + Ekle
                      </button>
                    </div>
                    {form.ders_ucretleri.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>
                        Henüz ders ücreti tanımı yok.
                      </p>
                    ) : (
                      form.ders_ucretleri.map((du, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#f8fafc',
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 8,
                            position: 'relative',
                          }}
                        >
                          <button
                            type="button"
                            style={{ position: 'absolute', top: 8, right: 8 }}
                            className="se-btn se-btn-ghost se-btn-sm"
                            onClick={() =>
                              patchForm({
                                ders_ucretleri: form.ders_ucretleri.filter((_, i) => i !== idx),
                              })
                            }
                          >
                            ✕
                          </button>
                          <div className="se-grid-2">
                            <div className="se-field">
                              <label>Branş</label>
                              <select
                                className="se-select"
                                value={du.brans_id || ''}
                                onChange={(e) =>
                                  updateDersUcret(idx, 'brans_id', e.target.value ? Number(e.target.value) : null)
                                }
                              >
                                <option value="">Genel</option>
                                {helper?.branslar.map((b) => (
                                  <option key={b.id} value={b.id}>{b.ad}</option>
                                ))}
                              </select>
                            </div>
                            <div className="se-field">
                              <label>Ücret Tipi</label>
                              <select
                                className="se-select"
                                value={du.ucret_tipi}
                                onChange={(e) => updateDersUcret(idx, 'ucret_tipi', e.target.value)}
                              >
                                {helper?.ucret_tipleri.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="se-field">
                              <label>Birim Ücret (₺)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="se-input"
                                value={du.birim_ucret || ''}
                                onChange={(e) =>
                                  updateDersUcret(idx, 'birim_ucret', parseFloat(e.target.value) || 0)
                                }
                              />
                            </div>
                            <div className="se-field">
                              <label>Haftalık Saat</label>
                              <input
                                type="number"
                                step="0.5"
                                className="se-input"
                                value={du.haftalik_saat || ''}
                                onChange={(e) =>
                                  updateDersUcret(idx, 'haftalik_saat', parseFloat(e.target.value) || 0)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}

            {/* Çalışma Düzeni */}
            {activeTab === 'calisma-duzeni' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">📅 Çalışma Düzeni</h2>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                  Haftalık izin günlerini işaretleyin. İşaretli günler izin günüdür.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[1, 2, 3, 4, 5, 6, 7].map((gun) => {
                    const isIzin = (form.haftalik_izin_gunleri || []).includes(gun);
                    return (
                      <button
                        key={gun}
                        type="button"
                        className="se-btn se-btn-sm"
                        style={{
                          background: isIzin ? '#fef3c7' : '#ecfdf5',
                          borderColor: isIzin ? '#fcd34d' : '#6ee7b7',
                          color: isIzin ? '#92400e' : '#047857',
                        }}
                        onClick={() => toggleIzinGunu(gun)}
                      >
                        {GUN_ADLARI[gun]}{isIzin ? ' (İzin)' : ' (Çalışma)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mesai */}
            {activeTab === 'mesai' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">🕐 Mesai Saatleri</h2>
                <MesaiHaftaGrid
                  rows={form.mesai_saatleri || defaultMesaiSaatleri()}
                  onChange={(rows) => patchForm({ mesai_saatleri: rows })}
                />
              </div>
            )}

            {/* Maddeler */}
            {activeTab === 'maddeler' && (
              <div className="sozlesme-editor__section">
                <h2 className="sozlesme-editor__section-title">📝 Sözleşme Maddeleri</h2>
                <MaddelerList
                  maddeler={form.maddeler || []}
                  onChange={(maddeler) => patchForm({ maddeler })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Summary column */}
        <aside className="sozlesme-editor__summary-col">
          <SozlesmeOzetiPanel ozet={ozet} />
        </aside>
      </div>
    </div>
  );
}
