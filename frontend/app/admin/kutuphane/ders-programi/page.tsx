'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchDersProgramlari, createDersProgrami, updateDersProgrami,
  type SubeDersProgrami, type PeriyotDersler,
} from '@/lib/kutuphane-api';
import { useKutuphanePath } from '@/components/kutuphane/KutuphanePathProvider';
import { useKurum } from '@/lib/contexts/KurumContext';
import { buildDersProgramiPrintHtml, openKutuphanePrintWindow } from '@/lib/kutuphane-list-print';
import {
  DAY_DEFS, PERIOD_DEFS, PROGRAM_TEMPLATES,
  applyProgramTemplate, copyDaySchedule, countWeeklyStats,
  deriveGunAktiflik, normalizeGunlukDersSaatleri,
  updatePeriodBlock, emptyDaySchedule,
  type GunlukDersSaatleri, type ProgramTemplateId, type DaySessionCode,
} from '@/lib/ders-programi-utils';

function SessionEditor({ label, icon, gradient, lightBg, block, editMode, onChange, compact }: {
  label: string; icon: string; gradient: string; lightBg: string;
  block: PeriyotDersler; editMode: boolean;
  onChange: (b: PeriyotDersler) => void;
  compact?: boolean;
}) {
  return (
    <div className={`dp-session-card${compact ? ' compact' : ''}`} style={{ background: lightBg }}>
      <div className="dp-session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, minWidth: 0 }}>
          <div className="dp-session-icon" style={{ background: gradient }}>{icon}</div>
          <span className="dp-session-label">{label}</span>
        </div>
        {editMode && (
          <button
            type="button"
            className="dp-btn-secondary dp-btn-add-period"
            onClick={() => onChange({ ...block, dersler: [...block.dersler, { ders_no: block.dersler.length + 1, baslangic: '09:00', bitis: '10:00' }] })}
          >
            {compact ? '+' : '+ Periyot Ekle'}
          </button>
        )}
      </div>
      {block.dersler.length === 0 ? (
        <div className="dp-session-empty">—</div>
      ) : (
        <div className="dp-period-list">
          {block.dersler.map((ders, idx) => (
            <div key={idx} className="dp-period-row">
              <span className="dp-period-no">{ders.ders_no}</span>
              {editMode ? (
                <div className="dp-period-edit">
                  <input type="time" value={(ders.baslangic || '09:00').slice(0, 5)}
                    onChange={(e) => onChange({ ...block, dersler: block.dersler.map((d, i) => i === idx ? { ...d, baslangic: e.target.value } : d) })}
                    className="dp-time-input" />
                  <span className="dp-period-sep">—</span>
                  <input type="time" value={(ders.bitis || '10:00').slice(0, 5)}
                    onChange={(e) => onChange({ ...block, dersler: block.dersler.map((d, i) => i === idx ? { ...d, bitis: e.target.value } : d) })}
                    className="dp-time-input" />
                  <button type="button" className="dp-btn-remove" onClick={() => onChange({ ...block, dersler: block.dersler.filter((_, i) => i !== idx).map((d, i) => ({ ...d, ders_no: i + 1 })) })}>✕</button>
                </div>
              ) : (
                <span className="dp-period-time">{(ders.baslangic || '').slice(0, 5)} — {(ders.bitis || '').slice(0, 5)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekScheduleBoard({
  gunluk,
  gunAktiflik,
  editMode,
  activeDay,
  onSelectDay,
  onUpdateSession,
}: {
  gunluk: GunlukDersSaatleri;
  gunAktiflik: ReturnType<typeof deriveGunAktiflik>;
  editMode: boolean;
  activeDay: string;
  onSelectDay: (key: string) => void;
  onUpdateSession: (dayKey: string, code: DaySessionCode, block: PeriyotDersler) => void;
}) {
  return (
    <div className="dp-week-board">
      <div className="dp-week-columns">
        {DAY_DEFS.map((day) => {
          const info = gunAktiflik[day.key];
          const schedule = gunluk[day.key] || emptyDaySchedule();
          const isActive = activeDay === day.key;
          return (
            <div
              key={day.key}
              className={`dp-day-col${info?.aktif ? '' : ' closed'}${isActive && editMode ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className="dp-day-col-head"
                onClick={() => editMode && onSelectDay(day.key)}
                disabled={!editMode}
                title={editMode ? `${day.label} — kopyalama kaynağı` : day.label}
              >
                <span className="dp-day-col-short">{day.short}</span>
                <span className="dp-day-col-name">{day.label}</span>
              </button>
              <div className="dp-day-col-body">
                {!info?.aktif ? (
                  <div className="dp-day-closed">Kapalı</div>
                ) : (
                  PERIOD_DEFS.map((p) => (
                    <SessionEditor
                      key={p.code}
                      label={p.label}
                      icon={p.icon}
                      gradient={p.gradient}
                      lightBg={p.light}
                      block={schedule[p.code]}
                      editMode={editMode}
                      compact
                      onChange={(b) => onUpdateSession(day.key, p.code, b)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DersProgramiPage() {
  const { href, isCoachMode, portalHomeHref, portalHomeLabel } = useKutuphanePath();
  const { activeSube, activeKurum } = useKurum();
  const selectedSube = activeSube?.id ?? null;

  const [program, setProgram] = useState<SubeDersProgrami | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [programAd, setProgramAd] = useState('Varsayılan Program');
  const [gunluk, setGunluk] = useState<GunlukDersSaatleri>(() =>
    Object.fromEntries(DAY_DEFS.map((d) => [d.key, emptyDaySchedule()])) as GunlukDersSaatleri,
  );
  const [activeDay, setActiveDay] = useState('0');
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplateId>('hafta_ici');

  const gunAktiflik = useMemo(() => deriveGunAktiflik(gunluk), [gunluk]);
  const stats = useMemo(() => countWeeklyStats(gunluk), [gunluk]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handlePrintPdf = () => {
    if (!selectedSube) return;
    const html = buildDersProgramiPrintHtml({
      meta: {
        title: 'Haftalık Çalışma Saatleri',
        subtitle: programAd,
        subeAdi: activeSube?.ad,
        kurumBranding: activeKurum,
        orientation: 'landscape',
      },
      programAd,
      dersSaatleri: gunluk,
      gunAktiflik,
    });
    openKutuphanePrintWindow(html);
  };

  const loadProgram = useCallback(async (subeId: number) => {
    setLoading(true);
    try {
      const res = await fetchDersProgramlari({ sube_id: subeId });
      const d = res.data as SubeDersProgrami | null;
      setProgram(d);
      if (d) {
        setProgramAd(d.ad);
        setGunluk(normalizeGunlukDersSaatleri(d.ders_saatleri as Record<string, unknown>, d.gun_bazli_aktiflik));
        setEditMode(false);
      } else {
        setProgramAd('Varsayılan Program');
        setGunluk(applyProgramTemplate('hafta_ici'));
        if (!isCoachMode) setEditMode(true);
      }
    } catch {
      showToast('error', 'Program yüklenemedi');
    }
    setLoading(false);
  }, [isCoachMode]);

  useEffect(() => {
    if (selectedSube) loadProgram(selectedSube);
    else setLoading(false);
  }, [selectedSube, loadProgram]);

  const handleSave = async () => {
    if (!selectedSube) return;
    setSaving(true);
    try {
      const payload = {
        sube_id: selectedSube,
        ad: programAd,
        ders_saatleri: gunluk,
        gun_bazli_aktiflik: gunAktiflik,
        aktif_mi: true,
      };
      if (program) {
        const r = await updateDersProgrami(program.id, payload);
        if (r.data) { setProgram(r.data as SubeDersProgrami); showToast('success', 'Program güncellendi'); }
      } else {
        const r = await createDersProgrami(payload);
        if (r.data) { setProgram(r.data as SubeDersProgrami); showToast('success', 'Program oluşturuldu'); }
      }
      setEditMode(false);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Kaydetme başarısız');
    }
    setSaving(false);
  };

  const handleCopyDay = () => {
    if (copyTargets.length === 0) return;
    setGunluk(copyDaySchedule(gunluk, activeDay, copyTargets));
    setCopyTargets([]);
    showToast('success', `${DAY_DEFS.find((d) => d.key === activeDay)?.label} programı kopyalandı`);
  };

  const handleApplyTemplate = () => {
    setGunluk(applyProgramTemplate(selectedTemplate));
    showToast('success', 'Şablon uygulandı');
  };

  const updateSession = (dayKey: string, periodCode: DaySessionCode, block: PeriyotDersler) => {
    setGunluk(updatePeriodBlock(gunluk, dayKey, periodCode, block));
  };

  const activeDayDef = DAY_DEFS.find((d) => d.key === activeDay)!;

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        @keyframes dpFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .dp-section { background: #fff; border-radius: 18px; border: 1.5px solid #e5e7eb; overflow: hidden; margin-bottom: 20px; animation: dpFadeIn 0.4s ease both; }
        .dp-section-header { padding: 18px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .dp-section-title { font-size: 16px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; }
        .dp-section-body { padding: 20px 24px; }
        .dp-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        .dp-kpi-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; background: #fff; border: 1.5px solid #e5e7eb; }
        .dp-kpi-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; color: #fff; }
        .dp-kpi-value { font-size: 22px; font-weight: 800; color: #111827; line-height: 1.1; }
        .dp-kpi-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-top: 2px; }
        .dp-day-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .dp-day-tab { padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1.5px solid #e5e7eb; background: #fff; color: #374151; cursor: pointer; transition: all 0.15s; }
        .dp-day-tab.active { background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border-color: transparent; }
        .dp-week-board { overflow-x: auto; margin: 0 -4px; padding: 4px 4px 8px; -webkit-overflow-scrolling: touch; }
        .dp-week-columns { display: grid; grid-template-columns: repeat(7, minmax(152px, 1fr)); gap: 10px; min-width: 1100px; align-items: stretch; }
        .dp-day-col { border: 1.5px solid #e5e7eb; border-radius: 12px; background: #fff; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .dp-day-col.closed { background: #f9fafb; }
        .dp-day-col.is-selected { box-shadow: 0 0 0 2px #0061a6; border-color: #0061a6; }
        .dp-day-col-head { width: 100%; padding: 10px 8px; text-align: center; border: none; background: linear-gradient(180deg, #f8fafc, #fff); border-bottom: 1px solid #e5e7eb; cursor: default; }
        .dp-day-col.is-selected .dp-day-col-head { background: linear-gradient(180deg, #eff6ff, #fff); }
        .dp-day-col-head:not(:disabled) { cursor: pointer; }
        .dp-day-col-head:not(:disabled):hover { background: #eff6ff; }
        .dp-day-col-short { display: block; font-size: 15px; font-weight: 800; color: #111827; line-height: 1.1; }
        .dp-day-col-name { display: block; font-size: 10px; font-weight: 600; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dp-day-col-body { padding: 8px; display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 120px; }
        .dp-day-closed { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #9ca3af; font-style: italic; min-height: 80px; }
        .dp-session-card { border: 1.5px solid #e5e7eb; border-radius: 14px; padding: 16px 18px; margin-bottom: 12px; }
        .dp-session-card.compact { padding: 8px; margin-bottom: 0; border-radius: 10px; }
        .dp-session-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 6px; }
        .dp-session-card.compact .dp-session-header { margin-bottom: 6px; flex-direction: column; align-items: stretch; }
        .dp-session-label { font-size: 15px; font-weight: 700; color: #111827; white-space: nowrap; }
        .dp-session-card.compact .dp-session-label { font-size: 12px; }
        .dp-session-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff; flex-shrink: 0; }
        .dp-session-card.compact .dp-session-icon { width: 22px; height: 22px; font-size: 11px; border-radius: 6px; }
        .dp-session-empty { font-size: 11px; color: #cbd5e1; text-align: center; padding: 4px 0; }
        .dp-btn-add-period { align-self: stretch; text-align: center; padding: 4px 8px !important; font-size: 11px !important; }
        .dp-period-list { display: flex; flex-direction: column; gap: 6px; }
        .dp-session-card.compact .dp-period-list { gap: 4px; }
        .dp-period-row { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; min-width: 0; }
        .dp-session-card.compact .dp-period-row { flex-direction: column; align-items: stretch; gap: 4px; padding: 6px; border-radius: 8px; }
        .dp-period-edit { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
        .dp-session-card.compact .dp-period-edit { flex-direction: column; align-items: stretch; }
        .dp-period-sep { color: #9ca3af; font-size: 11px; }
        .dp-session-card.compact .dp-period-sep { display: none; }
        .dp-period-no { font-size: 13px; font-weight: 700; color: #374151; min-width: 24px; }
        .dp-session-card.compact .dp-period-no { font-size: 10px; color: #6b7280; }
        .dp-period-time { font-size: 14px; font-weight: 600; color: #111827; font-family: ui-monospace, monospace; white-space: nowrap; }
        .dp-session-card.compact .dp-period-time { font-size: 11px; line-height: 1.35; white-space: normal; word-break: break-word; }
        .dp-time-input { padding: 5px 8px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 13px; width: 100px; max-width: 100%; box-sizing: border-box; }
        .dp-session-card.compact .dp-time-input { width: 100%; font-size: 11px; padding: 4px 6px; }
        .dp-btn-secondary { padding: 6px 14px; background: #fff; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; color: #374151; }
        .dp-btn-secondary:hover { background: #f3f4f6; border-color: #93c5fd; }
        .dp-btn-primary { padding: 9px 20px; background: linear-gradient(135deg, #0061a6, #004d85); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .dp-btn-primary:disabled { opacity: 0.5; cursor: default; }
        .dp-btn-remove { width: 28px; height: 28px; border-radius: 8px; border: none; background: #fee2e2; color: #dc2626; font-size: 13px; cursor: pointer; margin-left: auto; }
        .dp-copy-panel { background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 14px 16px; margin-top: 16px; }
        .dp-copy-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
        .dp-copy-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; }
        .dp-template-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
        .dp-template-option { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1.5px solid #e5e7eb; border-radius: 10px; cursor: pointer; font-size: 13px; }
        .dp-template-option.selected { border-color: #0061a6; background: #eff6ff; }
        .dp-toast { position: fixed; top: 20px; right: 20px; z-index: 100; padding: 14px 22px; border-radius: 14px; font-size: 14px; font-weight: 600; color: #fff; }
        .dp-status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .dp-board-hint { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
        @media (max-width: 1024px) { .dp-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .dp-kpi-grid { grid-template-columns: 1fr; } .dp-template-grid { grid-template-columns: 1fr; } }
      `}</style>

      {toast && (
        <div className="dp-toast" style={{ background: toast.type === 'success' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
          {toast.msg}
        </div>
      )}

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
              <a href={portalHomeHref}>{portalHomeLabel}</a><span>/</span>
              <a href={href()}>Kütüphane</a><span>/</span><span>Ders Programı</span>
            </div>
          </div>
        </div>
        {editMode && !isCoachMode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setEditMode(false); if (program && selectedSube) loadProgram(selectedSube); }}
              style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>
              İptal
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              style={{ padding: '10px 24px', background: '#fff', color: '#0061a6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        )}
      </div>

      <div className="dp-kpi-grid">
        {[
          { icon: '🏫', label: 'Şube', value: activeSube?.ad || '—', g: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
          { icon: '📅', label: 'Aktif Gün', value: stats.activeDays, g: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
          { icon: '⏰', label: 'Haftalık Oturum', value: stats.totalPeriods, g: 'linear-gradient(135deg, #f59e0b, #d97706)' },
          { icon: '📝', label: 'Toplam Periyot', value: stats.totalDers, g: 'linear-gradient(135deg, #22c55e, #16a34a)' },
        ].map((k) => (
          <div key={k.label} className="dp-kpi-card">
            <div className="dp-kpi-icon" style={{ background: k.g }}>{k.icon}</div>
            <div><div className="dp-kpi-value" style={k.label === 'Şube' ? { fontSize: 16 } : undefined}>{k.value}</div><div className="dp-kpi-label">{k.label}</div></div>
          </div>
        ))}
      </div>

      {!selectedSube && !loading && (
        <div className="dp-section"><div className="dp-section-body" style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Aktif şube seçilmedi.</div></div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>Yükleniyor...</div>}

      {selectedSube && !loading && (
        <>
          <div className="dp-section">
            <div className="dp-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {editMode ? (
                  <input value={programAd} onChange={(e) => setProgramAd(e.target.value)} placeholder="Program adı"
                    style={{ padding: '8px 14px', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 16, fontWeight: 600, width: 250 }} />
                ) : (
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{programAd}</span>
                )}
                <span className="dp-status-badge" style={program ? { background: '#d1fae5', color: '#059669' } : { background: '#fef3c7', color: '#d97706' }}>
                  {program ? 'Aktif' : 'Yeni'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!editMode && !isCoachMode && <button type="button" onClick={() => setEditMode(true)} className="dp-btn-primary">Düzenle</button>}
                {!editMode && program && (
                  <button type="button" onClick={handlePrintPdf} className="dp-btn-secondary">PDF İndir</button>
                )}
              </div>
            </div>
          </div>

          {editMode && (
            <div className="dp-section">
              <div className="dp-section-header"><div className="dp-section-title">Şablonlar</div></div>
              <div className="dp-section-body">
                <div className="dp-template-grid">
                  {PROGRAM_TEMPLATES.map((t) => (
                    <label key={t.id} className={`dp-template-option ${selectedTemplate === t.id ? 'selected' : ''}`}>
                      <input type="radio" name="template" checked={selectedTemplate === t.id} onChange={() => setSelectedTemplate(t.id)} />
                      <div><strong>{t.label}</strong><div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{t.description}</div></div>
                    </label>
                  ))}
                </div>
                <button type="button" className="dp-btn-secondary" onClick={handleApplyTemplate}>Şablonu Uygula</button>
              </div>
            </div>
          )}

          <div className="dp-section">
            <div className="dp-section-header"><div className="dp-section-title">Çalışma Saatleri</div></div>
            <div className="dp-section-body">
              {editMode && (
                <div className="dp-board-hint">
                  Günleri yan yana düzenleyin. Kopyalama için kaynak günün başlığına tıklayın (seçili: <strong>{activeDayDef.label}</strong>).
                </div>
              )}
              <WeekScheduleBoard
                gunluk={gunluk}
                gunAktiflik={gunAktiflik}
                editMode={editMode}
                activeDay={activeDay}
                onSelectDay={setActiveDay}
                onUpdateSession={updateSession}
              />

              {editMode && (
                <div className="dp-copy-panel">
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                    Hızlı Kopyalama — {activeDayDef.label} programını
                  </div>
                  <div className="dp-copy-grid">
                    {DAY_DEFS.filter((d) => d.key !== activeDay).map((day) => (
                      <label key={day.key} className="dp-copy-check">
                        <input type="checkbox" checked={copyTargets.includes(day.key)}
                          onChange={(e) => setCopyTargets(e.target.checked ? [...copyTargets, day.key] : copyTargets.filter((k) => k !== day.key))} />
                        {day.label}
                      </label>
                    ))}
                  </div>
                  <button type="button" className="dp-btn-primary" disabled={copyTargets.length === 0} onClick={handleCopyDay}>
                    Seçilen günlere kopyala
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
