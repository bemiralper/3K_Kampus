'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchSubeler, fetchDersProgramlari, createDersProgrami,
  updateDersProgrami,
  type SubeDersProgrami, type SubeInfo, type PeriyotDersler,
  type GunAktiflik, type DersSaati, type MolaTanimi, type SessionCode
} from '@/lib/kutuphane-api';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';

const DAYS = [
  { key: '0', label: 'Pazartesi', short: 'Pzt' },
  { key: '1', label: 'Salı', short: 'Sal' },
  { key: '2', label: 'Çarşamba', short: 'Çar' },
  { key: '3', label: 'Perşembe', short: 'Per' },
  { key: '4', label: 'Cuma', short: 'Cum' },
  { key: '5', label: 'Cumartesi', short: 'Cmt' },
  { key: '6', label: 'Pazar', short: 'Paz' },
];

const PERIODS: { code: SessionCode; label: string; gradient: string; icon: string; light: string }[] = [
  { code: 'MORNING', label: 'Sabah', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', icon: '🌅', light: '#fffbeb' },
  { code: 'AFTERNOON', label: 'Öğle', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', icon: '☀️', light: '#eff6ff' },
  { code: 'EVENING', label: 'Akşam', gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)', icon: '🌙', light: '#eef2ff' },
];

function defaultPeriyotDersler(): PeriyotDersler {
  return {
    ders_sayisi: 4,
    ders_suresi_dk: 40,
    dersler: [
      { ders_no: 1, baslangic: '08:30', bitis: '09:10' },
      { ders_no: 2, baslangic: '09:20', bitis: '10:00' },
      { ders_no: 3, baslangic: '10:10', bitis: '10:50' },
      { ders_no: 4, baslangic: '11:00', bitis: '11:40' },
    ],
    molalar: [
      { sonra_ders_no: 1, sure_dk: 10 },
      { sonra_ders_no: 2, sure_dk: 10 },
      { sonra_ders_no: 3, sure_dk: 10 },
    ],
  };
}

function defaultGunBazliAktiflik(): Record<string, GunAktiflik> {
  const result: Record<string, GunAktiflik> = {};
  for (let i = 0; i <= 6; i++) {
    result[String(i)] = {
      aktif: i < 6,
      periyotlar: i < 6 ? ['MORNING', 'AFTERNOON', 'EVENING'] as SessionCode[] : [],
    };
  }
  return result;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ── Ders Saati Editör ──
function PeriyotEditor({ periodLabel, data, onChange, gradient, lightBg }: {
  periodLabel: string; data: PeriyotDersler; onChange: (d: PeriyotDersler) => void; gradient: string; lightBg: string;
}) {
  const addDers = () => {
    const last = data.dersler[data.dersler.length - 1];
    const no = (last?.ders_no ?? 0) + 1;
    const start = last ? addMinutes(last.bitis, 10) : '08:00';
    const end = addMinutes(start, data.ders_suresi_dk);
    onChange({
      ...data, ders_sayisi: data.dersler.length + 1,
      dersler: [...data.dersler, { ders_no: no, baslangic: start, bitis: end }],
      molalar: [...data.molalar, { sonra_ders_no: data.dersler.length, sure_dk: 10 }],
    });
  };

  const removeDers = (idx: number) => {
    if (data.dersler.length <= 1) return;
    const nd = data.dersler.filter((_, i) => i !== idx).map((d, i) => ({ ...d, ders_no: i + 1 }));
    const nm = data.molalar.filter((_, i) => i !== idx).slice(0, nd.length - 1);
    onChange({ ...data, ders_sayisi: nd.length, dersler: nd, molalar: nm });
  };

  const autoCalc = () => {
    const dl: DersSaati[] = [];
    const ml: MolaTanimi[] = [];
    let cur = data.dersler[0]?.baslangic || '08:00';
    for (let i = 0; i < data.ders_sayisi; i++) {
      const b = addMinutes(cur, data.ders_suresi_dk);
      dl.push({ ders_no: i + 1, baslangic: cur, bitis: b });
      if (i < data.ders_sayisi - 1) {
        const ms = data.molalar[i]?.sure_dk ?? 10;
        ml.push({ sonra_ders_no: i + 1, sure_dk: ms });
        cur = addMinutes(b, ms);
      }
    }
    onChange({ ...data, dersler: dl, molalar: ml });
  };

  return (
    <div className="dp-periyot-card" style={{ background: lightBg }}>
      <div className="dp-periyot-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dp-periyot-icon" style={{ background: gradient }}>{periodLabel.split(' ')[0]}</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{periodLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Ders süresi:</span>
            <input type="number" min={10} max={120} value={data.ders_suresi_dk}
              onChange={(e) => onChange({ ...data, ders_suresi_dk: Number(e.target.value) })}
              style={{ width: 60, padding: '5px 8px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>dk</span>
          </div>
          <button onClick={autoCalc} className="dp-btn-secondary">♻️ Hesapla</button>
        </div>
      </div>
      <div className="dp-ders-list">
        {data.dersler.map((ders, idx) => (
          <React.Fragment key={idx}>
            <div className="dp-ders-row">
              <div className="dp-ders-no">{ders.ders_no}. Ders</div>
              <input type="time" value={ders.baslangic}
                onChange={(e) => onChange({ ...data, dersler: data.dersler.map((d, i) => i === idx ? { ...d, baslangic: e.target.value } : d) })}
                className="dp-time-input" />
              <span style={{ color: '#9ca3af', fontSize: 14 }}>—</span>
              <input type="time" value={ders.bitis}
                onChange={(e) => onChange({ ...data, dersler: data.dersler.map((d, i) => i === idx ? { ...d, bitis: e.target.value } : d) })}
                className="dp-time-input" />
              <span className="dp-ders-duration">{diffMinutes(ders.baslangic, ders.bitis)} dk</span>
              {data.dersler.length > 1 && (
                <button onClick={() => removeDers(idx)} className="dp-btn-remove">✕</button>
              )}
            </div>
            {idx < data.dersler.length - 1 && (
              <div className="dp-mola-row">
                <span style={{ color: '#9ca3af', fontSize: 12 }}>☕ Mola:</span>
                <input type="number" min={1} max={60} value={data.molalar[idx]?.sure_dk ?? 10}
                  onChange={(e) => onChange({ ...data, molalar: data.molalar.map((m, i) => i === idx ? { ...m, sure_dk: Number(e.target.value) } : m) })}
                  style={{ width: 50, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, textAlign: 'center' }} />
                <span style={{ color: '#9ca3af', fontSize: 12 }}>dk</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <button onClick={addDers} className="dp-btn-add-ders">+ Ders Ekle</button>
    </div>
  );
}

// ══════════════════════════════════════════════
export default function DersProgramiPage() {
  const { href, isCoachMode } = useKutuphanePath();
  const [subeler, setSubeler] = useState<SubeInfo[]>([]);
  const [selectedSube, setSelectedSube] = useState<number | null>(null);
  const [program, setProgram] = useState<SubeDersProgrami | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [programAd, setProgramAd] = useState('Varsayılan Program');
  const [dersSaatleri, setDersSaatleri] = useState<Record<string, PeriyotDersler>>({});
  const [gunAktiflik, setGunAktiflik] = useState<Record<string, GunAktiflik>>(defaultGunBazliAktiflik());

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 4000);
  };

  const loadSubeler = useCallback(async () => {
    try { const r = await fetchSubeler(); if (r.data) setSubeler(r.data as SubeInfo[]); } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { loadSubeler(); }, [loadSubeler]);

  const loadProgram = useCallback(async (subeId: number) => {
    setLoading(true);
    try {
      const res = await fetchDersProgramlari({ sube_id: subeId });
      const d = res.data as SubeDersProgrami | null;
      setProgram(d);
      if (d) {
        setProgramAd(d.ad); setDersSaatleri(d.ders_saatleri || {}); setGunAktiflik(d.gun_bazli_aktiflik || defaultGunBazliAktiflik()); setEditMode(false);
      } else {
        setProgramAd('Varsayılan Program');
        setDersSaatleri({
          MORNING: defaultPeriyotDersler(),
          AFTERNOON: { ...defaultPeriyotDersler(), dersler: defaultPeriyotDersler().dersler.map((dd, i) => ({ ...dd, ders_no: i + 1, baslangic: addMinutes('13:00', i * 50), bitis: addMinutes('13:40', i * 50) })) },
          EVENING: { ...defaultPeriyotDersler(), ders_sayisi: 3, dersler: [
            { ders_no: 1, baslangic: '18:00', bitis: '18:40' },
            { ders_no: 2, baslangic: '18:50', bitis: '19:30' },
            { ders_no: 3, baslangic: '19:40', bitis: '20:20' },
          ], molalar: [{ sonra_ders_no: 1, sure_dk: 10 }, { sonra_ders_no: 2, sure_dk: 10 }] },
        });
        setGunAktiflik(defaultGunBazliAktiflik());
        if (!isCoachMode) setEditMode(true);
      }
    } catch { showToast('error', 'Program yüklenemedi'); }
    setLoading(false);
  }, [isCoachMode]);

  useEffect(() => { if (selectedSube) loadProgram(selectedSube); }, [selectedSube, loadProgram]);

  const handleSave = async () => {
    if (!selectedSube) return;
    setSaving(true);
    try {
      const payload = { sube_id: selectedSube, ad: programAd, ders_saatleri: dersSaatleri, gun_bazli_aktiflik: gunAktiflik, aktif_mi: true };
      if (program) {
        const r = await updateDersProgrami(program.id, payload);
        if (r.data) { setProgram(r.data as SubeDersProgrami); showToast('success', 'Program güncellendi'); }
      } else {
        const r = await createDersProgrami(payload);
        if (r.data) { setProgram(r.data as SubeDersProgrami); showToast('success', 'Program oluşturuldu'); loadSubeler(); }
      }
      setEditMode(false);
    } catch (err: any) { showToast('error', err.message || 'Kaydetme başarısız'); }
    setSaving(false);
  };

  const toggleDayPeriod = (dayKey: string, periodCode: SessionCode) => {
    const cur = gunAktiflik[dayKey] || { aktif: true, periyotlar: [] };
    const has = cur.periyotlar.includes(periodCode);
    const np = has ? cur.periyotlar.filter(p => p !== periodCode) : [...cur.periyotlar, periodCode];
    setGunAktiflik({ ...gunAktiflik, [dayKey]: { ...cur, aktif: np.length > 0, periyotlar: np } });
  };

  const toggleDayActive = (dayKey: string) => {
    const cur = gunAktiflik[dayKey] || { aktif: false, periyotlar: [] };
    setGunAktiflik({ ...gunAktiflik, [dayKey]: cur.aktif
      ? { aktif: false, periyotlar: [] }
      : { aktif: true, periyotlar: ['MORNING', 'AFTERNOON', 'EVENING'] as SessionCode[] }
    });
  };

  const totalPeriods = Object.values(gunAktiflik).reduce((s, g) => s + (g.aktif ? g.periyotlar.length : 0), 0);
  const totalDers = Object.values(dersSaatleri).reduce((s, p) => s + (p.dersler?.length || 0), 0);

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        @keyframes dpFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .dp-section { background: #fff; border-radius: 18px; border: 1.5px solid #e5e7eb; overflow: hidden; margin-bottom: 20px; animation: dpFadeIn 0.4s ease both; }
        .dp-section-header { padding: 18px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .dp-section-title { font-size: 16px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; }
        .dp-section-body { padding: 20px 24px; }
        .dp-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
        .dp-kpi-card { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 16px; background: #fff; border: 1.5px solid #e5e7eb; animation: dpFadeIn 0.35s ease both; transition: all 0.2s; }
        .dp-kpi-card:hover { border-color: #c7d2fe; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
        .dp-kpi-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); flex-shrink: 0; color: #fff; }
        .dp-kpi-value { font-size: 26px; font-weight: 800; color: #111827; line-height: 1.1; }
        .dp-kpi-label { font-size: 12px; font-weight: 600; color: #6b7280; margin-top: 2px; }
        .dp-sube-btn { padding: 10px 18px; border-radius: 12px; font-size: 13px; font-weight: 600; border: 1.5px solid #e5e7eb; cursor: pointer; transition: all 0.2s; background: #fff; color: #374151; }
        .dp-sube-btn:hover { border-color: #93c5fd; background: #f0f4ff; transform: translateY(-1px); }
        .dp-sube-btn.active { background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(0,97,166,0.3); }
        .dp-sube-btn.has-program { background: #f0fdf4; color: #059669; border-color: #6ee7b7; }
        .dp-day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
        .dp-day-card { border: 1.5px solid #e5e7eb; border-radius: 14px; padding: 14px; text-align: center; transition: all 0.2s; background: #fff; }
        .dp-day-card.inactive { background: #f9fafb; opacity: 0.5; }
        .dp-day-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .dp-period-toggle { width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; border: 1.5px solid #e5e7eb; cursor: pointer; transition: all 0.15s; background: #f9fafb; color: #9ca3af; margin-bottom: 4px; }
        .dp-period-toggle.active { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
        .dp-period-toggle:disabled { cursor: default; }
        .dp-periyot-card { border: 1.5px solid #e5e7eb; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .dp-periyot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .dp-periyot-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; }
        .dp-ders-list { display: flex; flex-direction: column; gap: 6px; }
        .dp-ders-row { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 14px; transition: all 0.15s; }
        .dp-ders-row:hover { border-color: #93c5fd; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .dp-ders-no { font-size: 13px; font-weight: 600; color: #374151; min-width: 60px; }
        .dp-time-input { padding: 5px 8px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 13px; width: 100px; }
        .dp-ders-duration { font-size: 12px; color: #9ca3af; min-width: 45px; }
        .dp-mola-row { display: flex; align-items: center; gap: 6px; margin-left: 32px; padding: 4px 0; }
        .dp-btn-secondary { padding: 6px 14px; background: #fff; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; color: #374151; transition: all 0.15s; }
        .dp-btn-secondary:hover { background: #f3f4f6; border-color: #93c5fd; }
        .dp-btn-primary { padding: 9px 20px; background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,97,166,0.3); transition: all 0.2s; }
        .dp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,97,166,0.4); }
        .dp-btn-primary:disabled { opacity: 0.5; cursor: default; transform: none; }
        .dp-btn-remove { width: 28px; height: 28px; border-radius: 8px; border: none; background: #fee2e2; color: #dc2626; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: auto; transition: all 0.15s; }
        .dp-btn-remove:hover { background: #fca5a5; }
        .dp-btn-add-ders { width: 100%; margin-top: 12px; padding: 10px; border: 2px dashed #d1d5db; border-radius: 10px; background: transparent; color: #6b7280; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .dp-btn-add-ders:hover { border-color: #93c5fd; background: #f0f4ff; color: #1d4ed8; }
        .dp-readonly-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
        .dp-readonly-card { background: #fff; border: 1.5px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; text-align: center; transition: all 0.2s; }
        .dp-readonly-card:hover { border-color: #93c5fd; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .dp-toast { position: fixed; top: 20px; right: 20px; z-index: 100; padding: 14px 22px; border-radius: 14px; font-size: 14px; font-weight: 600; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.15); animation: dpFadeIn 0.3s ease; }
        .dp-status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        @media (max-width: 1024px) { .dp-kpi-grid { grid-template-columns: repeat(2, 1fr); } .dp-day-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 640px) { .dp-kpi-grid { grid-template-columns: 1fr; } .dp-day-grid { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      {toast && <div className="dp-toast" style={{ background: toast.type === 'success' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>{toast.msg}</div>}

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: 24 }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Ders Programı Yönetimi</h1>
            <div className="hero-breadcrumb">
              <a href={isCoachMode ? href() : '/dashboard'}>{isCoachMode ? 'Koç Portalı' : 'Ana Sayfa'}</a><span>/</span><a href={href()}>Kütüphane</a><span>/</span><span>Ders Programı</span>
            </div>
          </div>
        </div>
        {editMode && !isCoachMode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setEditMode(false); if (program && selectedSube) loadProgram(selectedSube); }} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>İptal</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: '#fff', color: '#0061a6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', opacity: saving ? 0.6 : 1 }}>
              {saving ? '💾 Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="dp-kpi-grid">
        {[
          { icon: '📚', label: 'Toplam Şube', value: subeler.length, g: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
          { icon: '📅', label: 'Aktif Periyot', value: totalPeriods, g: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
          { icon: '📝', label: 'Toplam Ders', value: totalDers, g: 'linear-gradient(135deg, #22c55e, #16a34a)' },
        ].map((k, i) => (
          <div key={k.label} className="dp-kpi-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="dp-kpi-icon" style={{ background: k.g }}>{k.icon}</div>
            <div><div className="dp-kpi-value">{k.value}</div><div className="dp-kpi-label">{k.label}</div></div>
          </div>
        ))}
      </div>

      {/* Şube Seçimi */}
      <div className="dp-section">
        <div className="dp-section-header">
          <div className="dp-section-title">📚 Şube Seçimi</div>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{subeler.filter(s => s.program_var).length}/{subeler.length} tanımlı</span>
        </div>
        <div className="dp-section-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {subeler.map(s => (
              <button key={s.id} onClick={() => setSelectedSube(s.id)}
                className={`dp-sube-btn ${selectedSube === s.id ? 'active' : s.program_var ? 'has-program' : ''}`}>
                {s.ad}{s.program_var && selectedSube !== s.id && <span style={{ marginLeft: 6 }}>✓</span>}
              </button>
            ))}
            {subeler.length === 0 && !loading && <div style={{ padding: 20, color: '#9ca3af', fontSize: 14 }}>Henüz şube tanımlanmamış</div>}
          </div>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}><div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>Yükleniyor...</div>}

      {selectedSube && !loading && (
        <>
          {/* Program Başlık */}
          <div className="dp-section">
            <div className="dp-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {editMode ? (
                  <input value={programAd} onChange={(e) => setProgramAd(e.target.value)} placeholder="Program adı"
                    style={{ padding: '8px 14px', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 16, fontWeight: 600, width: 250 }} />
                ) : (
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{programAd}</span>
                )}
                <span className="dp-status-badge" style={program ? { background: '#d1fae5', color: '#059669' } : { background: '#fef3c7', color: '#d97706' }}>
                  {program ? 'Aktif' : 'Yeni'}
                </span>
              </div>
              {!editMode && !isCoachMode && <button onClick={() => setEditMode(true)} className="dp-btn-primary">✏️ Düzenle</button>}
            </div>
          </div>

          {/* Haftalık Program */}
          <div className="dp-section">
            <div className="dp-section-header"><div className="dp-section-title">📅 Haftalık Program</div></div>
            <div className="dp-section-body">
              <div className="dp-day-grid">
                {DAYS.map(day => {
                  const di = gunAktiflik[day.key] || { aktif: false, periyotlar: [] };
                  return (
                    <div key={day.key} className={`dp-day-card ${!di.aktif ? 'inactive' : ''}`}>
                      <div className="dp-day-name">
                        {editMode && <input type="checkbox" checked={di.aktif} onChange={() => toggleDayActive(day.key)} style={{ width: 16, height: 16, accentColor: '#0061a6' }} />}
                        {day.short}
                      </div>
                      {di.aktif && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {PERIODS.map(p => (
                            <button key={p.code} disabled={!editMode} onClick={() => editMode && toggleDayPeriod(day.key, p.code)}
                              className={`dp-period-toggle ${di.periyotlar.includes(p.code) ? 'active' : ''}`}>
                              {p.icon} {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ders Saatleri — Düzenleme */}
          {editMode && (
            <div className="dp-section">
              <div className="dp-section-header"><div className="dp-section-title">⏰ Periyot Ders Saatleri</div></div>
              <div className="dp-section-body">
                {PERIODS.map(p => (
                  <PeriyotEditor key={p.code} periodLabel={`${p.icon} ${p.label}`}
                    data={dersSaatleri[p.code] || defaultPeriyotDersler()}
                    onChange={(d) => setDersSaatleri({ ...dersSaatleri, [p.code]: d })}
                    gradient={p.gradient} lightBg={p.light} />
                ))}
              </div>
            </div>
          )}

          {/* Ders Saatleri — Salt Okunur */}
          {!editMode && program && (
            <div className="dp-section">
              <div className="dp-section-header"><div className="dp-section-title">⏰ Ders Saatleri</div></div>
              <div className="dp-section-body">
                {PERIODS.map(p => {
                  const pd = dersSaatleri[p.code];
                  if (!pd || !pd.dersler?.length) return null;
                  return (
                    <div key={p.code} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div className="dp-periyot-icon" style={{ background: p.gradient, width: 32, height: 32, fontSize: 16 }}>{p.icon}</div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{p.label}</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{pd.dersler.length} ders · {pd.ders_suresi_dk} dk</span>
                      </div>
                      <div className="dp-readonly-grid">
                        {pd.dersler.map((ders, idx) => (
                          <div key={idx} className="dp-readonly-card">
                            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>{ders.ders_no}. Ders</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{ders.baslangic}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>— {ders.bitis}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{diffMinutes(ders.baslangic, ders.bitis)} dk</div>
                            {idx < pd.dersler.length - 1 && pd.molalar[idx] && (
                              <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6, borderTop: '1px dashed #e5e7eb', paddingTop: 4 }}>☕ {pd.molalar[idx].sure_dk} dk mola</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
