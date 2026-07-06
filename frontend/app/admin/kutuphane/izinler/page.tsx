'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  fetchIzinler, createIzin, createBulkIzinler, deleteIzin,
  replaceStudentIzinler,
  type OgrenciIzin, type ExemptionType, type SessionCode,
} from '@/lib/kutuphane-api';
import { searchKutuphaneStudentsForIzin } from '@/lib/kutuphane-student-search';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';

/* ── Portal Modal ── */
function PortalModal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return ReactDOM.createPortal(children, document.body);
}

const DAYS = [
  { key: 0, label: 'Pazartesi', short: 'Pzt' },
  { key: 1, label: 'Salı', short: 'Sal' },
  { key: 2, label: 'Çarşamba', short: 'Çar' },
  { key: 3, label: 'Perşembe', short: 'Per' },
  { key: 4, label: 'Cuma', short: 'Cum' },
  { key: 5, label: 'Cumartesi', short: 'Cmt' },
  { key: 6, label: 'Pazar', short: 'Paz' },
];

const PERIODS: { code: SessionCode; label: string; icon: string; gradient: string }[] = [
  { code: 'MORNING', label: 'Sabah', icon: '🌅', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { code: 'AFTERNOON', label: 'Öğle', icon: '☀️', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  { code: 'EVENING', label: 'Akşam', icon: '🌙', gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
];

const IZIN_TIPI_LABELS: Record<ExemptionType, { label: string; bg: string; color: string }> = {
  PERIOD: { label: 'Periyot Bazlı', bg: '#fef3c7', color: '#d97706' },
  FULL_DAY: { label: 'Tam Gün', bg: '#fee2e2', color: '#dc2626' },
};

interface OgrenciOption { id: number; ad_soyad: string; sinif?: string; }

/* ── Öğrenci arama helper ── */
async function searchOgrenciApi(q: string, coachMode: boolean): Promise<OgrenciOption[]> {
  if (q.length < 2) return [];
  try {
    const list = await searchKutuphaneStudentsForIzin(q, coachMode);
    return list.map((o) => ({
      id: o.id,
      ad_soyad: o.tam_ad || `${o.ad || ''} ${o.soyad || ''}`.trim(),
      sinif: o.sinif_ad || '',
    }));
  } catch { return []; }
}

export default function IzinlerPage() {
  const { href, isCoachMode, portalHomeHref, portalHomeLabel } = useKutuphanePath();
  const [izinler, setIzinler] = useState<OgrenciIzin[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  /* ── Filter state (ayrı) ── */
  const [filterSearch, setFilterSearch] = useState('');
  const [filterOptions, setFilterOptions] = useState<OgrenciOption[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [selectedOgrenci, setSelectedOgrenci] = useState<number | null>(null);

  /* ── Grid state (ayrı) ── */
  const [gridSearch, setGridSearch] = useState('');
  const [gridOptions, setGridOptions] = useState<OgrenciOption[]>([]);
  const [gridSearchLoading, setGridSearchLoading] = useState(false);
  const [gridSelections, setGridSelections] = useState<Record<string, ExemptionType>>({});
  const [gridSebep, setGridSebep] = useState('');
  const [gridOgrenciId, setGridOgrenciId] = useState<number | null>(null);
  const [gridOgrenciAdi, setGridOgrenciAdi] = useState('');
  const [gridSaving, setGridSaving] = useState(false);
  const [gridOriginalSelections, setGridOriginalSelections] = useState<Record<string, ExemptionType>>({});
  const [gridExistingIzinler, setGridExistingIzinler] = useState<OgrenciIzin[]>([]);

  /* ── Add Modal state ── */
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [modalSearch, setModalSearch] = useState('');
  const [modalOptions, setModalOptions] = useState<OgrenciOption[]>([]);
  const [modalSearchLoading, setModalSearchLoading] = useState(false);

  /* Single add form */
  const [formOgrenciId, setFormOgrenciId] = useState(0);
  const [formOgrenciAdi, setFormOgrenciAdi] = useState('');
  const [formIzinTipi, setFormIzinTipi] = useState<ExemptionType>('PERIOD');
  const [formGunler, setFormGunler] = useState<number[]>([0]);
  const [formPeriyotlar, setFormPeriyotlar] = useState<SessionCode[]>(['MORNING']);
  const [formSebep, setFormSebep] = useState('');
  const [formBaslangic, setFormBaslangic] = useState(new Date().toISOString().split('T')[0]);
  const [formBitis, setFormBitis] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  /* Bulk add */
  const [bulkOgrenciler, setBulkOgrenciler] = useState<OgrenciOption[]>([]);
  const [bulkSelections, setBulkSelections] = useState<Record<string, ExemptionType>>({});
  const [bulkSebep, setBulkSebep] = useState('');
  const [bulkBaslangic, setBulkBaslangic] = useState(new Date().toISOString().split('T')[0]);
  const [bulkBitis, setBulkBitis] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4000);
  };

  /* ── Load ── */
  const loadIzinler = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (selectedOgrenci) params.ogrenci_id = selectedOgrenci;
      const res = await fetchIzinler(params);
      if (res.data) setIzinler(res.data as OgrenciIzin[]);
    } catch {}
    setLoading(false);
  }, [selectedOgrenci]);

  useEffect(() => { loadIzinler(); }, [loadIzinler]);

  /* ── Search debounces (3 ayrı) ── */
  useEffect(() => {
    const t = setTimeout(async () => {
      setFilterLoading(true);
      setFilterOptions(await searchOgrenciApi(filterSearch, isCoachMode));
      setFilterLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [filterSearch]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setGridSearchLoading(true);
      setGridOptions(await searchOgrenciApi(gridSearch, isCoachMode));
      setGridSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [gridSearch]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setModalSearchLoading(true);
      setModalOptions(await searchOgrenciApi(modalSearch, isCoachMode));
      setModalSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [modalSearch]);

  /* ── Delete ── */
  const handleDelete = async (id: string) => {
    if (!confirm('Bu izni silmek istediğinize emin misiniz?')) return;
    try {
      const r = await deleteIzin(id);
      if (r.success) { showToast('success', 'İzin silindi'); loadIzinler(); }
      else showToast('error', 'İzin silinemedi');
    } catch { showToast('error', 'Bir hata oluştu'); }
  };

  /* ── Single/Multi Add ── */
  const handleAddSingle = async () => {
    if (!formOgrenciId) { showToast('error', 'Öğrenci seçilmedi'); return; }
    if (formGunler.length === 0) { showToast('error', 'En az bir gün seçin'); return; }
    if (formIzinTipi === 'PERIOD' && formPeriyotlar.length === 0) { showToast('error', 'En az bir periyot seçin'); return; }
    setFormSaving(true);
    try {
      const payloads: any[] = [];
      for (const gun of formGunler) {
        if (formIzinTipi === 'FULL_DAY') {
          payloads.push({
            ogrenci_id: formOgrenciId, izin_tipi: 'FULL_DAY', gun,
            sebep: formSebep || undefined,
            baslangic_tarihi: formBaslangic || undefined,
            bitis_tarihi: formBitis || undefined,
          });
        } else {
          for (const p of formPeriyotlar) {
            payloads.push({
              ogrenci_id: formOgrenciId, izin_tipi: 'PERIOD', gun, periyot_kodu: p,
              sebep: formSebep || undefined,
              baslangic_tarihi: formBaslangic || undefined,
              bitis_tarihi: formBitis || undefined,
            });
          }
        }
      }
      if (payloads.length === 1) {
        const r = await createIzin(payloads[0]);
        if (r.success) { showToast('success', 'İzin oluşturuldu'); }
        else { showToast('error', (r as any).error || 'İzin oluşturulamadı'); setFormSaving(false); return; }
      } else {
        const r = await createBulkIzinler(payloads);
        if (r.success) { showToast('success', `${payloads.length} izin oluşturuldu`); }
        else { showToast('error', (r as any).error || 'Toplu izin oluşturulamadı'); setFormSaving(false); return; }
      }
      setShowAddModal(false); loadIzinler();
      // Eğer grid'de bu öğrenci açıksa yeniden yükle
      if (gridOgrenciId === formOgrenciId) loadGridForStudent(gridOgrenciId, gridOgrenciAdi);
    } catch (err: any) { showToast('error', err.message || 'Hata'); }
    setFormSaving(false);
  };

  /* ── Bulk Add (Grid matris ile) ── */
  const handleBulkAdd = async () => {
    if (bulkOgrenciler.length === 0) { showToast('error', 'En az bir öğrenci seçin'); return; }
    const entries = Object.entries(bulkSelections);
    if (entries.length === 0) { showToast('error', 'En az bir izin hücresi seçin'); return; }
    setBulkSaving(true);
    try {
      const payloads: any[] = [];
      // FULL_DAY deduplication: aynı gün için tek FULL_DAY kaydı gönder
      const fullDayDays = new Set<string>();
      const periodEntries: [string, ExemptionType][] = [];
      for (const [key, izinTipi] of entries) {
        const [gunStr] = key.split('-');
        if (izinTipi === 'FULL_DAY') {
          fullDayDays.add(gunStr);
        } else {
          periodEntries.push([key, izinTipi]);
        }
      }
      for (const ogr of bulkOgrenciler) {
        // FULL_DAY kayıtları (gün başına tek kayıt)
        for (const gunStr of fullDayDays) {
          payloads.push({
            ogrenci_id: ogr.id,
            izin_tipi: 'FULL_DAY',
            gun: parseInt(gunStr),
            sebep: bulkSebep || undefined,
            baslangic_tarihi: bulkBaslangic || undefined,
            bitis_tarihi: bulkBitis || undefined,
          });
        }
        // PERIOD kayıtları
        for (const [key, izinTipi] of periodEntries) {
          const [gunStr, periodCode] = key.split('-');
          // Bu gün zaten FULL_DAY ise PERIOD ekleme
          if (fullDayDays.has(gunStr)) continue;
          const p: any = {
            ogrenci_id: ogr.id,
            izin_tipi: izinTipi,
            gun: parseInt(gunStr),
            sebep: bulkSebep || undefined,
            baslangic_tarihi: bulkBaslangic || undefined,
            bitis_tarihi: bulkBitis || undefined,
          };
          if (periodCode) p.periyot_kodu = periodCode;
          payloads.push(p);
        }
      }
      const r = await createBulkIzinler(payloads);
      if (r.success) {
        showToast('success', `${payloads.length} izin ${bulkOgrenciler.length} öğrenci için oluşturuldu`);
        setShowAddModal(false); loadIzinler();
        if (gridOgrenciId && bulkOgrenciler.some(o => o.id === gridOgrenciId)) {
          loadGridForStudent(gridOgrenciId, gridOgrenciAdi);
        }
      } else { showToast('error', (r as any).error || 'Toplu izin oluşturulamadı'); }
    } catch (err: any) { showToast('error', err.message || 'Hata'); }
    setBulkSaving(false);
  };

  /* ── Grid Save (replace — fallback: delete+create) ── */
  const handleGridSave = async () => {
    if (!gridOgrenciId) { showToast('error', 'Öğrenci seçin'); return; }
    const entries = Object.entries(gridSelections);
    setGridSaving(true);
    try {
      // FULL_DAY deduplication
      const fullDayDays = new Set<string>();
      const periodEntries: [string, ExemptionType][] = [];
      for (const [key, izinTipi] of entries) {
        const [gunStr] = key.split('-');
        if (izinTipi === 'FULL_DAY') {
          fullDayDays.add(gunStr);
        } else {
          periodEntries.push([key, izinTipi]);
        }
      }
      const buildDeduplicatedPayloads = (includeOgrenciId = false) => {
        const result: any[] = [];
        for (const gunStr of fullDayDays) {
          const p: any = { izin_tipi: 'FULL_DAY', gun: parseInt(gunStr), sebep: gridSebep || undefined };
          if (includeOgrenciId) p.ogrenci_id = gridOgrenciId;
          result.push(p);
        }
        for (const [key, izinTipi] of periodEntries) {
          const [gunStr, periodCode] = key.split('-');
          if (fullDayDays.has(gunStr)) continue;
          const p: any = { izin_tipi: izinTipi, gun: parseInt(gunStr), sebep: gridSebep || undefined };
          if (periodCode) p.periyot_kodu = periodCode;
          if (includeOgrenciId) p.ogrenci_id = gridOgrenciId;
          result.push(p);
        }
        return result;
      };

      // Önce replace endpoint'ini dene
      const izinlerPayload = buildDeduplicatedPayloads(false);

      const r = await replaceStudentIzinler(gridOgrenciId, izinlerPayload);
      if (r.success) {
        showToast('success', `${izinlerPayload.length} izin kaydedildi`);
        loadIzinler();
        loadGridForStudent(gridOgrenciId, gridOgrenciAdi);
        setGridSaving(false);
        return;
      }

      // Fallback: replace endpoint çalışmazsa delete + create yöntemi
      console.warn('[İzinler] Replace endpoint başarısız, fallback: delete+create');
      for (const iz of gridExistingIzinler) {
        await deleteIzin(iz.id);
      }
      if (entries.length > 0) {
        const createPayloads = buildDeduplicatedPayloads(true);
        await createBulkIzinler(createPayloads);
      }
      showToast('success', `${izinlerPayload.length} izin kaydedildi`);
      loadIzinler();
      loadGridForStudent(gridOgrenciId, gridOgrenciAdi);
    } catch (err: any) { showToast('error', err.message || 'Hata'); }
    setGridSaving(false);
  };

  const loadGridForStudent = async (ogrenciId: number, ogrenciAdi: string) => {
    setGridOgrenciId(ogrenciId); setGridOgrenciAdi(ogrenciAdi);
    try {
      const r = await fetchIzinler({ ogrenci_id: ogrenciId });
      const mevcut = (r.data as OgrenciIzin[]) || [];
      setGridExistingIzinler(mevcut);
      const sel: Record<string, ExemptionType> = {};
      mevcut.forEach(iz => {
        if (iz.izin_tipi === 'FULL_DAY') PERIODS.forEach(p => { sel[`${iz.gun}-${p.code}`] = 'FULL_DAY'; });
        else if (iz.periyot_kodu) sel[`${iz.gun}-${iz.periyot_kodu}`] = 'PERIOD';
      });
      setGridSelections(sel);
      setGridOriginalSelections(sel);
    } catch { setGridSelections({}); setGridOriginalSelections({}); setGridExistingIzinler([]); }
  };

  const toggleGridCell = (dayKey: number, periodCode: SessionCode) => {
    const key = `${dayKey}-${periodCode}`;
    setGridSelections(prev => { const c = { ...prev }; if (c[key]) delete c[key]; else c[key] = 'PERIOD'; return c; });
  };

  const toggleFullDay = (dayKey: number) => {
    setGridSelections(prev => {
      const c = { ...prev };
      const allSel = PERIODS.every(p => c[`${dayKey}-${p.code}`]);
      PERIODS.forEach(p => { const k = `${dayKey}-${p.code}`; if (allSel) delete c[k]; else c[k] = 'FULL_DAY'; });
      return c;
    });
  };

  /* ── Bulk grid toggle ── */
  const toggleBulkGridCell = (dayKey: number, periodCode: SessionCode) => {
    const key = `${dayKey}-${periodCode}`;
    setBulkSelections(prev => { const c = { ...prev }; if (c[key]) delete c[key]; else c[key] = 'PERIOD'; return c; });
  };

  const toggleBulkFullDay = (dayKey: number) => {
    setBulkSelections(prev => {
      const c = { ...prev };
      const allSel = PERIODS.every(p => c[`${dayKey}-${p.code}`]);
      PERIODS.forEach(p => { const k = `${dayKey}-${p.code}`; if (allSel) delete c[k]; else c[k] = 'FULL_DAY'; });
      return c;
    });
  };

  /* ── Helpers ── */
  const toggleInArray = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const addBulkOgrenci = (o: OgrenciOption) => {
    if (!bulkOgrenciler.find(x => x.id === o.id)) setBulkOgrenciler(prev => [...prev, o]);
    setModalSearch(''); setModalOptions([]);
  };
  const removeBulkOgrenci = (id: number) => setBulkOgrenciler(prev => prev.filter(x => x.id !== id));

  const groupedByStudent = izinler.reduce<Record<number, { adi: string; izinler: OgrenciIzin[] }>>((acc, iz) => {
    if (!acc[iz.ogrenci_id]) acc[iz.ogrenci_id] = { adi: iz.ogrenci_adi || `#${iz.ogrenci_id}`, izinler: [] };
    acc[iz.ogrenci_id].izinler.push(iz);
    return acc;
  }, {});

  const totalIzin = izinler.length;
  const totalOgrenci = Object.keys(groupedByStudent).length;
  const fullDayCount = izinler.filter(i => i.izin_tipi === 'FULL_DAY').length;

  /* ── Gün/Periyot seçici (reusable) ── */
  const renderDaySelector = (selected: number[], setSelected: (v: number[]) => void) => (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
        Günler <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(birden fazla seçilebilir)</span>
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {DAYS.map(d => (
          <button key={d.key} type="button"
            onClick={() => setSelected(toggleInArray(selected, d.key))}
            className={`iz-day-btn ${selected.includes(d.key) ? 'active' : ''}`}>{d.short}</button>
        ))}
        <button type="button"
          onClick={() => setSelected(selected.length === DAYS.length ? [] : DAYS.map(d => d.key))}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px dashed #9ca3af', cursor: 'pointer', fontSize: 11, color: '#6b7280', background: 'none' }}>
          {selected.length === DAYS.length ? 'Hiçbiri' : 'Tümü'}
        </button>
      </div>
    </div>
  );

  const renderPeriodSelector = (selected: SessionCode[], setSelected: (v: SessionCode[]) => void) => (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
        Periyotlar <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(birden fazla seçilebilir)</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        {PERIODS.map(p => (
          <button key={p.code} type="button"
            onClick={() => setSelected(toggleInArray(selected, p.code))}
            className={`iz-period-btn ${selected.includes(p.code) ? 'active' : ''}`}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>
    </div>
  );

  const openAddModal = (mode: 'single' | 'bulk') => {
    setAddMode(mode);
    setShowAddModal(true);
    setModalSearch(''); setModalOptions([]);
    setFormOgrenciId(0); setFormOgrenciAdi('');
    setFormIzinTipi('PERIOD'); setFormGunler([0]); setFormPeriyotlar(['MORNING']);
    setFormSebep(''); setFormBaslangic(new Date().toISOString().split('T')[0]); setFormBitis('');
    setBulkOgrenciler([]);
    setBulkSelections({});
    setBulkSebep(''); setBulkBaslangic(new Date().toISOString().split('T')[0]); setBulkBitis('');
  };

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        @keyframes izFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .iz-section { background: #fff; border-radius: 18px; border: 1.5px solid #e5e7eb; overflow: visible; margin-bottom: 20px; animation: izFadeIn 0.4s ease both; position: relative; }
        .iz-section-header { padding: 18px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 18px 18px 0 0; }
        .iz-section-title { font-size: 16px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; }
        .iz-section-body { padding: 20px 24px; background: #fff; border-radius: 0 0 18px 18px; }
        .iz-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
        .iz-kpi-card { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 16px; background: #fff; border: 1.5px solid #e5e7eb; animation: izFadeIn 0.35s ease both; transition: all 0.2s; }
        .iz-kpi-card:hover { border-color: #c7d2fe; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
        .iz-kpi-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); flex-shrink: 0; color: #fff; }
        .iz-kpi-value { font-size: 26px; font-weight: 800; color: #111827; line-height: 1.1; }
        .iz-kpi-label { font-size: 12px; font-weight: 600; color: #6b7280; margin-top: 2px; }
        .iz-grid-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .iz-grid-table th { padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; background: #f9fafb; border-bottom: 1.5px solid #e5e7eb; }
        .iz-grid-table td { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; }
        .iz-grid-cell { width: 48px; height: 48px; border-radius: 12px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; margin: 0 auto; }
        .iz-grid-cell:hover { border-color: #93c5fd; transform: scale(1.05); }
        .iz-grid-cell.period { background: #fef3c7; border-color: #f59e0b; color: #d97706; }
        .iz-grid-cell.fullday { background: #fee2e2; border-color: #ef4444; color: #dc2626; }
        .iz-btn-primary { padding: 9px 20px; background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,97,166,0.3); transition: all 0.2s; }
        .iz-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,97,166,0.4); }
        .iz-btn-primary:disabled { opacity: 0.5; cursor: default; transform: none; }
        .iz-btn-secondary { padding: 8px 16px; background: #fff; border: 1.5px solid #d1d5db; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer; color: #374151; transition: all 0.15s; }
        .iz-btn-secondary:hover { background: #f3f4f6; border-color: #93c5fd; }
        .iz-btn-success { padding: 9px 24px; background: linear-gradient(135deg, #059669, #047857); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(5,150,105,0.3); transition: all 0.2s; }
        .iz-btn-success:disabled { opacity: 0.5; cursor: default; }
        .iz-search-input { width: 100%; padding: 10px 14px; border: 1.5px solid #d1d5db; border-radius: 10px; font-size: 14px; transition: border-color 0.2s; }
        .iz-search-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .iz-dropdown { position: absolute; z-index: 9999; top: 100%; left: 0; right: 0; margin-top: 4px; background: #fff; border: 1.5px solid #e5e7eb; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); max-height: 200px; overflow-y: auto; }
        .iz-dropdown-item { width: 100%; text-align: left; padding: 10px 14px; border: none; background: none; cursor: pointer; font-size: 13px; transition: background 0.1s; display: block; border-bottom: 1px solid #f3f4f6; }
        .iz-dropdown-item:hover { background: #eff6ff; }
        .iz-dropdown-item:last-child { border-bottom: none; }
        .iz-toast { position: fixed; top: 20px; right: 20px; z-index: 10000; padding: 14px 22px; border-radius: 14px; font-size: 14px; font-weight: 600; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.15); animation: izFadeIn 0.3s ease; }
        .iz-type-btn { flex: 1; padding: 10px 14px; border-radius: 12px; border: 2px solid #e5e7eb; cursor: pointer; transition: all 0.15s; background: #fff; text-align: left; }
        .iz-type-btn.active { border-color: #3b82f6; background: #eff6ff; }
        .iz-day-btn { padding: 8px 14px; border-radius: 10px; border: 1.5px solid #e5e7eb; cursor: pointer; transition: all 0.15s; background: #fff; font-size: 13px; font-weight: 600; color: #374151; }
        .iz-day-btn.active { background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border-color: transparent; }
        .iz-period-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1.5px solid #e5e7eb; cursor: pointer; transition: all 0.15s; background: #fff; font-size: 13px; font-weight: 600; text-align: center; }
        .iz-period-btn.active { background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border-color: transparent; }
        .iz-fullday-btn { padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; border: 1.5px solid #e5e7eb; cursor: pointer; transition: all 0.15s; background: #f9fafb; color: #6b7280; }
        .iz-fullday-btn.active { background: #fee2e2; border-color: #ef4444; color: #dc2626; }
        .iz-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
        .iz-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
        .iz-legend-dot { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid; }
        .iz-tab-btn { padding: 10px 20px; border: none; background: none; font-size: 14px; font-weight: 600; cursor: pointer; border-bottom: 3px solid transparent; color: #6b7280; transition: all 0.15s; }
        .iz-tab-btn.active { color: #0061a6; border-bottom-color: #0061a6; }
        .iz-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 20px; font-size: 12px; font-weight: 600; color: #1d4ed8; }
        .iz-chip button { border: none; background: none; cursor: pointer; color: #6b7280; font-size: 14px; line-height: 1; padding: 0; }
        .iz-chip button:hover { color: #dc2626; }
        .iz-student-list-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f3f4f6; transition: background 0.15s; cursor: pointer; }
        .iz-student-list-item:hover { background: #f0f9ff; }
        .iz-student-list-item:last-child { border-bottom: none; }
        @media (max-width: 768px) { .iz-kpi-grid { grid-template-columns: 1fr; } }
      `}</style>

      {toast && <div className="iz-toast" style={{ background: toast.type === 'success' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>{toast.msg}</div>}

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: 24 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Öğrenci İzin Yönetimi</h1>
            <div className="hero-breadcrumb">
              <a href={portalHomeHref}>{portalHomeLabel}</a><span>/</span><a href={href()}>Kütüphane</a><span>/</span><span>İzinler</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => openAddModal('bulk')}
            style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
            👥 Toplu İzin
          </button>
          <button onClick={() => openAddModal('single')}
            style={{ padding: '10px 22px', background: '#fff', color: '#0061a6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }}>
            + İzin Ekle
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="iz-kpi-grid">
        {[
          { icon: '🎫', label: 'Toplam İzin', value: totalIzin, g: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
          { icon: '👤', label: 'İzinli Öğrenci', value: totalOgrenci, g: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
          { icon: '📅', label: 'Tam Gün İzin', value: fullDayCount, g: 'linear-gradient(135deg, #ef4444, #dc2626)' },
        ].map((k, i) => (
          <div key={k.label} className="iz-kpi-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="iz-kpi-icon" style={{ background: k.g }}>{k.icon}</div>
            <div><div className="iz-kpi-value">{k.value}</div><div className="iz-kpi-label">{k.label}</div></div>
          </div>
        ))}
      </div>

      {/* Öğrenci Filtre — Modern Inline */}
      <div style={{ position: 'relative', zIndex: 100, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, border: '1.5px solid #e5e7eb', padding: '6px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s' }}>
          {/* Search Icon */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>

          {/* Input Area */}
          <div style={{ flex: 1, position: 'relative' }}>
            {selectedOgrenci ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1.5px solid #93c5fd', borderRadius: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                    {filterSearch.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{filterSearch}</span>
                  <button onClick={() => { setSelectedOgrenci(null); setFilterSearch(''); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16, lineHeight: 1, padding: '0 2px', transition: 'color 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#dc2626')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}>✕</button>
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>filtreleniyor</span>
              </div>
            ) : (
              <input type="text" placeholder="Öğrenci adı ile izinleri filtreleyin..." value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 4px', border: 'none', outline: 'none', fontSize: 14, color: '#111827', background: 'transparent' }} />
            )}

            {/* Dropdown */}
            {filterOptions.length > 0 && !selectedOgrenci && (
              <div style={{ position: 'absolute', zIndex: 9999, top: 'calc(100% + 8px)', left: -52, right: -8, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto', animation: 'izFadeIn 0.2s ease' }}>
                <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sonuçlar</div>
                {filterOptions.map(o => (
                  <button key={o.id}
                    onClick={() => { setSelectedOgrenci(o.id); setFilterSearch(o.ad_soyad); setFilterOptions([]); }}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, transition: 'background 0.1s', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {o.ad_soyad.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{o.ad_soyad}</div>
                      {o.sinif && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{o.sinif}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Loading / Clear */}
          {filterLoading && filterSearch.length >= 2 && !selectedOgrenci && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, border: '2.5px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ GRID VIEW (Her zaman göster) ═══ */}
        <div className="iz-section">
          <div className="iz-section-header">
            <div className="iz-section-title">📅 Haftalık İzin Programı</div>
            {gridOgrenciId && JSON.stringify(gridSelections) !== JSON.stringify(gridOriginalSelections) && (
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, background: '#fef3c7', padding: '4px 12px', borderRadius: 20 }}>
                ● Kaydedilmemiş değişiklikler
              </span>
            )}
          </div>
          <div className="iz-section-body">
            <div style={{ marginBottom: 20, position: 'relative' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Öğrenci Seçin</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="text" placeholder="Öğrenci adı yazın..." className="iz-search-input"
                    value={gridOgrenciAdi || gridSearch}
                    onChange={(e) => { setGridSearch(e.target.value); setGridOgrenciAdi(''); }} />
                  {gridOptions.length > 0 && !gridOgrenciId && (
                    <div className="iz-dropdown">
                      {gridOptions.map(o => (
                        <button key={o.id} className="iz-dropdown-item"
                          onClick={() => { loadGridForStudent(o.id, o.ad_soyad); setGridSearch(''); setGridOptions([]); }}>
                          <span style={{ fontWeight: 600 }}>{o.ad_soyad}</span>
                          {o.sinif && <span style={{ marginLeft: 8, color: '#9ca3af' }}>({o.sinif})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {gridSearchLoading && gridSearch.length >= 2 && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>⏳</div>}
                </div>
                {gridOgrenciId && (
                  <button onClick={() => { setGridOgrenciId(null); setGridOgrenciAdi(''); setGridSelections({}); setGridOriginalSelections({}); setGridExistingIzinler([]); }} className="iz-btn-secondary" style={{ fontSize: 12 }}>✕</button>
                )}
              </div>
            </div>

            {gridOgrenciId ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="iz-grid-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Gün</th>
                        {PERIODS.map(p => <th key={p.code} style={{ textAlign: 'center' }}>{p.icon} {p.label}</th>)}
                        <th style={{ textAlign: 'center' }}>Tam Gün</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map(day => {
                        const allSel = PERIODS.every(p => gridSelections[`${day.key}-${p.code}`]);
                        const isFD = allSel && PERIODS.some(p => gridSelections[`${day.key}-${p.code}`] === 'FULL_DAY');
                        return (
                          <tr key={day.key}>
                            <td style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>{day.label}</td>
                            {PERIODS.map(p => {
                              const key = `${day.key}-${p.code}`;
                              const sel = !!gridSelections[key];
                              const fd = gridSelections[key] === 'FULL_DAY';
                              return (
                                <td key={p.code} style={{ textAlign: 'center' }}>
                                  <div className={`iz-grid-cell ${sel ? (fd ? 'fullday' : 'period') : ''}`}
                                    onClick={() => toggleGridCell(day.key, p.code)}>
                                    {sel ? '✓' : ''}
                                  </div>
                                </td>
                              );
                            })}
                            <td style={{ textAlign: 'center' }}>
                              <button onClick={() => toggleFullDay(day.key)}
                                className={`iz-fullday-btn ${isFD ? 'active' : ''}`}>
                                {isFD ? '🔴 Tam Gün' : 'Tam Gün'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="text" placeholder="İzin sebebi (opsiyonel)" value={gridSebep}
                    onChange={(e) => setGridSebep(e.target.value)} className="iz-search-input" style={{ flex: 1 }} />
                  <button onClick={handleGridSave} disabled={gridSaving || JSON.stringify(gridSelections) === JSON.stringify(gridOriginalSelections)}
                    className="iz-btn-success">
                    {gridSaving ? '💾 Kaydediliyor...' : `💾 Kaydet (${Object.keys(gridSelections).length} izin)`}
                  </button>
                </div>

                <div className="iz-legend">
                  <div className="iz-legend-item"><div className="iz-legend-dot" style={{ background: '#fef3c7', borderColor: '#f59e0b' }} />Periyot İzni</div>
                  <div className="iz-legend-item"><div className="iz-legend-dot" style={{ background: '#fee2e2', borderColor: '#ef4444' }} />Tam Gün İzni</div>
                  <div className="iz-legend-item"><div className="iz-legend-dot" style={{ background: '#fff', borderColor: '#d1d5db' }} />İzin Yok</div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👆</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>Haftalık programı düzenlemek için bir öğrenci seçin</div>
              </div>
            )}
          </div>
        </div>

      {/* ═══ İZİNLİ ÖĞRENCİ LİSTESİ (Özet) ═══ */}
      {!loading && Object.keys(groupedByStudent).length > 0 && (
        <div className="iz-section">
          <div className="iz-section-header">
            <div className="iz-section-title">👥 İzinli Öğrenciler ({totalOgrenci})</div>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {Object.entries(groupedByStudent).map(([ogrenciIdStr, group]) => {
              const periodCount = group.izinler.filter(iz => iz.izin_tipi === 'PERIOD').length;
              const fdCount = group.izinler.filter(iz => iz.izin_tipi === 'FULL_DAY').length;
              const isActive = gridOgrenciId === parseInt(ogrenciIdStr);
              return (
                <div key={ogrenciIdStr} className="iz-student-list-item"
                  style={isActive ? { background: '#eff6ff', borderLeft: '3px solid #3b82f6' } : {}}
                  onClick={() => loadGridForStudent(parseInt(ogrenciIdStr), group.adi)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: isActive ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {group.adi.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{group.adi}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        {periodCount > 0 && <span style={{ color: '#d97706' }}>{periodCount} periyot</span>}
                        {periodCount > 0 && fdCount > 0 && <span> · </span>}
                        {fdCount > 0 && <span style={{ color: '#dc2626' }}>{fdCount} tam gün</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', background: '#e0e7ff', padding: '2px 10px', borderRadius: 20 }}>{group.izinler.length}</span>
                    <span style={{ fontSize: 14, color: '#9ca3af' }}>→</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>Yükleniyor...
        </div>
      )}

      {!loading && izinler.length === 0 && (
        <div className="iz-section">
          <div className="iz-section-body" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Henüz İzin Kaydı Yok</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Yeni izin eklemek için yukarıdaki butonu kullanın veya grid&apos;den öğrenci seçerek izin tanımlayın</div>
          </div>
        </div>
      )}

      {/* ═══ ADD / BULK MODAL ═══ */}
      {showAddModal && (
        <PortalModal>
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: addMode === 'bulk' ? 720 : 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.15)', transition: 'max-width 0.3s' }}
            onClick={(e) => e.stopPropagation()}>

            {/* Modal Header with Tabs */}
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ padding: '20px 24px 0 24px' }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
                  {addMode === 'single' ? '🎫 İzin Ekle' : '👥 Toplu İzin Ekle'}
                </h3>
                <div style={{ display: 'flex', gap: 0 }}>
                  <button className={`iz-tab-btn ${addMode === 'single' ? 'active' : ''}`}
                    onClick={() => setAddMode('single')}>Tekli İzin</button>
                  <button className={`iz-tab-btn ${addMode === 'bulk' ? 'active' : ''}`}
                    onClick={() => setAddMode('bulk')}>Toplu İzin</button>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {addMode === 'single' ? (
                /* ── SINGLE MODE ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Öğrenci */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Öğrenci *</label>
                    {formOgrenciId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="iz-chip">
                          {formOgrenciAdi}
                          <button onClick={() => { setFormOgrenciId(0); setFormOgrenciAdi(''); setModalSearch(''); }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <input type="text" placeholder="Öğrenci adı ile arayın..." value={modalSearch}
                          onChange={(e) => setModalSearch(e.target.value)} className="iz-search-input" />
                        {modalOptions.length > 0 && (
                          <div className="iz-dropdown">
                            {modalOptions.map(o => (
                              <button key={o.id} className="iz-dropdown-item"
                                onClick={() => { setFormOgrenciId(o.id); setFormOgrenciAdi(o.ad_soyad); setModalSearch(''); setModalOptions([]); }}>
                                <span style={{ fontWeight: 600 }}>{o.ad_soyad}</span>
                                {o.sinif && <span style={{ marginLeft: 8, color: '#9ca3af' }}>({o.sinif})</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {modalSearchLoading && modalSearch.length >= 2 && <div style={{ position: 'absolute', right: 12, top: 38, fontSize: 12, color: '#9ca3af' }}>⏳</div>}
                      </>
                    )}
                  </div>

                  {/* İzin Tipi */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>İzin Tipi</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['PERIOD', 'FULL_DAY'] as ExemptionType[]).map(tip => (
                        <button key={tip} type="button" onClick={() => setFormIzinTipi(tip)}
                          className={`iz-type-btn ${formIzinTipi === tip ? 'active' : ''}`}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{IZIN_TIPI_LABELS[tip].label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Günler (multi-select) */}
                  {renderDaySelector(formGunler, setFormGunler)}

                  {/* Periyotlar (multi-select) */}
                  {formIzinTipi === 'PERIOD' && renderPeriodSelector(formPeriyotlar, setFormPeriyotlar)}

                  {/* Tarih */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Başlangıç Tarihi</label>
                      <input type="date" value={formBaslangic}
                        onChange={(e) => setFormBaslangic(e.target.value)} className="iz-search-input" />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Bitiş Tarihi</label>
                      <input type="date" value={formBitis}
                        onChange={(e) => setFormBitis(e.target.value)} className="iz-search-input" />
                    </div>
                  </div>

                  {/* Sebep */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Sebep (opsiyonel)</label>
                    <input type="text" value={formSebep}
                      onChange={(e) => setFormSebep(e.target.value)}
                      placeholder="Ör: Dershane dersleri" className="iz-search-input" />
                  </div>

                  {/* Summary */}
                  {formOgrenciId > 0 && formGunler.length > 0 && (
                    <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', fontSize: 13, color: '#15803d' }}>
                      <strong>Özet:</strong> {formOgrenciAdi} için {formGunler.length} gün
                      {formIzinTipi === 'PERIOD' ? ` × ${formPeriyotlar.length} periyot = ${formGunler.length * formPeriyotlar.length} izin` : ` = ${formGunler.length} tam gün izin`}
                    </div>
                  )}
                </div>
              ) : (
                /* ── BULK MODE (Grid matris ile) ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Öğrenci Ekle */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                      Öğrenciler * <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>({bulkOgrenciler.length} seçildi)</span>
                    </label>
                    <input type="text" placeholder="Öğrenci adı ile arayın ve ekleyin..." value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)} className="iz-search-input" />
                    {modalOptions.length > 0 && (
                      <div className="iz-dropdown">
                        {modalOptions.filter(o => !bulkOgrenciler.find(x => x.id === o.id)).map(o => (
                          <button key={o.id} className="iz-dropdown-item" onClick={() => addBulkOgrenci(o)}>
                            <span style={{ fontWeight: 600 }}>{o.ad_soyad}</span>
                            {o.sinif && <span style={{ marginLeft: 8, color: '#9ca3af' }}>({o.sinif})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {modalSearchLoading && modalSearch.length >= 2 && <div style={{ position: 'absolute', right: 12, top: 38, fontSize: 12, color: '#9ca3af' }}>⏳</div>}
                  </div>

                  {/* Selected students chips */}
                  {bulkOgrenciler.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {bulkOgrenciler.map(o => (
                        <div key={o.id} className="iz-chip">
                          {o.ad_soyad}
                          <button onClick={() => removeBulkOgrenci(o.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* İzin Programı Grid (her gün için farklı periyotlar) */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                      📅 İzin Programı <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(her gün için ayrı periyot seçebilirsiniz)</span>
                    </label>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="iz-grid-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11 }}>Gün</th>
                            {PERIODS.map(p => <th key={p.code} style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11 }}>{p.icon} {p.label}</th>)}
                            <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11 }}>Tam Gün</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DAYS.map(day => {
                            const allSel = PERIODS.every(p => bulkSelections[`${day.key}-${p.code}`]);
                            const isFD = allSel && PERIODS.some(p => bulkSelections[`${day.key}-${p.code}`] === 'FULL_DAY');
                            return (
                              <tr key={day.key}>
                                <td style={{ fontWeight: 600, color: '#374151', fontSize: 12, padding: '6px 10px' }}>{day.short}</td>
                                {PERIODS.map(p => {
                                  const key = `${day.key}-${p.code}`;
                                  const sel = !!bulkSelections[key];
                                  const fd = bulkSelections[key] === 'FULL_DAY';
                                  return (
                                    <td key={p.code} style={{ textAlign: 'center', padding: '4px 8px' }}>
                                      <div className={`iz-grid-cell ${sel ? (fd ? 'fullday' : 'period') : ''}`}
                                        style={{ width: 36, height: 36, borderRadius: 8, fontSize: 13 }}
                                        onClick={() => toggleBulkGridCell(day.key, p.code)}>
                                        {sel ? '✓' : ''}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                                  <button onClick={() => toggleBulkFullDay(day.key)}
                                    className={`iz-fullday-btn ${isFD ? 'active' : ''}`}
                                    style={{ padding: '4px 8px', fontSize: 10 }}>
                                    {isFD ? '🔴 Tam Gün' : 'Tam Gün'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="iz-legend" style={{ marginTop: 10 }}>
                      <div className="iz-legend-item"><div className="iz-legend-dot" style={{ background: '#fef3c7', borderColor: '#f59e0b' }} />Periyot İzni</div>
                      <div className="iz-legend-item"><div className="iz-legend-dot" style={{ background: '#fee2e2', borderColor: '#ef4444' }} />Tam Gün İzni</div>
                    </div>
                  </div>

                  {/* Tarih */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Başlangıç Tarihi</label>
                      <input type="date" value={bulkBaslangic}
                        onChange={(e) => setBulkBaslangic(e.target.value)} className="iz-search-input" />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Bitiş Tarihi</label>
                      <input type="date" value={bulkBitis}
                        onChange={(e) => setBulkBitis(e.target.value)} className="iz-search-input" />
                    </div>
                  </div>

                  {/* Sebep */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Sebep (opsiyonel)</label>
                    <input type="text" value={bulkSebep}
                      onChange={(e) => setBulkSebep(e.target.value)}
                      placeholder="Ör: Dershane dersleri" className="iz-search-input" />
                  </div>

                  {/* Summary */}
                  {bulkOgrenciler.length > 0 && Object.keys(bulkSelections).length > 0 && (
                    <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', fontSize: 13, color: '#15803d' }}>
                      <strong>Özet:</strong> {bulkOgrenciler.length} öğrenci × {Object.keys(bulkSelections).length} izin hücresi = {bulkOgrenciler.length * Object.keys(bulkSelections).length} toplam izin
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: 8, borderRadius: '0 0 20px 20px' }}>
              <button onClick={() => setShowAddModal(false)} className="iz-btn-secondary">İptal</button>
              {addMode === 'single' ? (
                <button onClick={handleAddSingle} disabled={formSaving || !formOgrenciId || formGunler.length === 0} className="iz-btn-primary">
                  {formSaving ? '⏳ Kaydediliyor...' : `İzin Ekle (${formIzinTipi === 'PERIOD' ? formGunler.length * formPeriyotlar.length : formGunler.length})`}
                </button>
              ) : (
                <button onClick={handleBulkAdd} disabled={bulkSaving || bulkOgrenciler.length === 0 || Object.keys(bulkSelections).length === 0} className="iz-btn-primary">
                  {bulkSaving ? '⏳ Kaydediliyor...' : `Toplu Ekle (${bulkOgrenciler.length} öğrenci × ${Object.keys(bulkSelections).length} izin)`}
                </button>
              )}
            </div>
          </div>
        </div>
        </PortalModal>
      )}
    </div>
  );
}
