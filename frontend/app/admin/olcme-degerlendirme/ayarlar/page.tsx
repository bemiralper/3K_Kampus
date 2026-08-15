'use client';

import { useCallback, useEffect, useState } from 'react';
import { puanAyarlariApi } from '../../../../components/olcme/api';
import type { KatsayiKind, PuanAyarlari, PuanYilSeti } from '../../../../components/olcme/types';
import s from '../olcme.module.css';

const KIND_ORDER: KatsayiKind[] = ['TYT', 'AYT_SAY', 'AYT_EA', 'AYT_SOZ'];

function coeffEntries(coefficients: Record<string, number>) {
  const keys = Object.keys(coefficients).filter(k => k !== '_base');
  return [
    ...keys.map(k => [k, coefficients[k]] as const),
    ['_base', coefficients._base ?? 0] as const,
  ];
}

function labelForKey(key: string) {
  return key === '_base' ? 'Başlangıç puanı' : key;
}

export default function PuanKatsayilariPage() {
  const [data, setData] = useState<PuanAyarlari | null>(null);
  const [defaultYear, setDefaultYear] = useState(2025);
  const [activeYear, setActiveYear] = useState(2025);
  const [yearSet, setYearSet] = useState<PuanYilSeti | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingYear, setSavingYear] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const applyPayload = useCallback((payload: PuanAyarlari, year?: number) => {
    setData(payload);
    setDefaultYear(payload.default_puan_yili);
    const y = year ?? payload.default_puan_yili;
    setActiveYear(y);
    const found = payload.years.find(item => item.year === y) || payload.years[0];
    setYearSet(found ? structuredClone(found) : null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await puanAyarlariApi.get();
      applyPayload(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => { load(); }, [load]);

  const selectYear = (year: number) => {
    if (!data) return;
    setActiveYear(year);
    const found = data.years.find(item => item.year === year);
    setYearSet(found ? structuredClone(found) : null);
  };

  const handleSaveDefault = async () => {
    setSavingDefault(true);
    try {
      const payload = await puanAyarlariApi.updateDefault(defaultYear);
      applyPayload(payload, activeYear);
      showToast('Varsayılan puan yılı kaydedildi');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Kaydedilemedi', 'error');
    } finally {
      setSavingDefault(false);
    }
  };

  const updateCoeff = (kind: KatsayiKind, key: string, value: string) => {
    const num = Number(value);
    setYearSet(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.sets[kind].coefficients[key] = Number.isFinite(num) ? num : 0;
      return next;
    });
  };

  const handleSaveYear = async () => {
    if (!yearSet) return;
    setSavingYear(true);
    try {
      const sets = Object.fromEntries(
        KIND_ORDER.map(kind => [kind, { coefficients: yearSet.sets[kind].coefficients }]),
      ) as Parameters<typeof puanAyarlariApi.saveYear>[1];
      const updated = await puanAyarlariApi.saveYear(activeYear, sets);
      setYearSet(structuredClone(updated));
      setData(prev => prev ? {
        ...prev,
        years: prev.years.map(y => y.year === activeYear ? updated : y),
      } : prev);
      showToast(`${activeYear} katsayıları kaydedildi`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Kaydedilemedi', 'error');
    } finally {
      setSavingYear(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`${activeYear} katsayıları ÖSYM varsayılanına sıfırlansın mı?`)) return;
    setResetting(true);
    try {
      const updated = await puanAyarlariApi.resetYear(activeYear);
      setYearSet(structuredClone(updated));
      setData(prev => prev ? {
        ...prev,
        years: prev.years.map(y => y.year === activeYear ? updated : y),
      } : prev);
      showToast(`${activeYear} ÖSYM varsayılanına sıfırlandı`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Sıfırlanamadı', 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="section">
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 50,
          padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: toast.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: toast.type === 'success' ? '#047857' : '#991b1b',
          border: `1px solid ${toast.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {toast.msg}
        </div>
      )}

      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-breadcrumb">
            <span>Ölçme & Değerlendirme</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span>Puan Katsayıları</span>
          </div>
          <h1 className="hero-title">Puan Katsayıları</h1>
          <p className="hero-subtitle">
            Kurumunuzun TYT / AYT puan tablolarını düzenleyin. Yeni denemeler varsayılan yılı alır; tek sınavda değiştirilebilir.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="card-modern" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          Yükleniyor…
        </div>
      )}

      {!loading && data && (
        <>
          <div className="card-modern" style={{ marginBottom: 20 }}>
            <div className="card-modern-header">
              <h3>Varsayılan puan yılı</h3>
            </div>
            <div className={`card-modern-body ${s.cardBody}`}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                Yeni denemeler bu yılı alır. Analizde geçici olarak başka bir yıl seçilebilir.
              </p>
              <div className={s.formGrid} style={{ alignItems: 'end' }}>
                <div className={s.formGroup}>
                  <label>Varsayılan yıl</label>
                  <select value={defaultYear} onChange={e => setDefaultYear(Number(e.target.value))}>
                    {data.managed_years.map(y => (
                      <option key={y} value={y}>{y} YKS{y === 2026 ? ' (henüz resmi değil)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className={s.formGroup}>
                  <button
                    type="button"
                    className="btn-modern btn-primary"
                    onClick={handleSaveDefault}
                    disabled={savingDefault}
                    style={{ opacity: savingDefault ? 0.6 : 1 }}
                  >
                    {savingDefault ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card-modern">
            <div className="card-modern-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h3>Yıl tabloları</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.managed_years.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => selectYear(y)}
                    className="btn-modern"
                    style={{
                      padding: '6px 14px',
                      fontWeight: 600,
                      background: activeYear === y ? 'var(--primary, #0262a7)' : '#fff',
                      color: activeYear === y ? '#fff' : '#334155',
                      border: `1px solid ${activeYear === y ? 'var(--primary, #0262a7)' : '#d1d5db'}`,
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
            <div className={`card-modern-body ${s.cardBody}`}>
              {activeYear === 2026 && (
                <div style={{
                  marginBottom: 16, padding: '12px 14px', borderRadius: 10,
                  background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13,
                }}>
                  Henüz resmi değil — 2025 kopyası, düzenleyebilirsiniz.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  className="btn-modern"
                  onClick={handleReset}
                  disabled={resetting}
                >
                  {resetting ? 'Sıfırlanıyor…' : 'ÖSYM varsayılanına sıfırla'}
                </button>
                <button
                  type="button"
                  className="btn-modern btn-primary"
                  onClick={handleSaveYear}
                  disabled={savingYear || !yearSet}
                >
                  {savingYear ? 'Kaydediliyor…' : `${activeYear} tablosunu kaydet`}
                </button>
              </div>

              {yearSet && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  {KIND_ORDER.map(kind => {
                    const set = yearSet.sets[kind];
                    if (!set) return null;
                    return (
                      <div key={kind} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: '#f8fafc', fontWeight: 700, fontSize: 13 }}>
                          {set.kind_display}
                        </div>
                        <table className="table-modern" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th>Ders</th>
                              <th style={{ width: 110 }}>Katsayı</th>
                            </tr>
                          </thead>
                          <tbody>
                            {coeffEntries(set.coefficients).map(([key, val]) => (
                              <tr key={key}>
                                <td>{labelForKey(key)}</td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={val}
                                    onChange={e => updateCoeff(kind, key, e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
