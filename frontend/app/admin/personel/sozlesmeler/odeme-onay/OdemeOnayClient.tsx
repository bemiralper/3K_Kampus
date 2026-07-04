'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchHakedisler, onaylaHakedis, odendiHakedis, fetchHakedisStats,
} from '../services/api';
import type { Hakedis, HakedisStats } from '../types';
import { HAKEDIS_DURUM_COLORS, AY_ADLARI } from '../types';

/* ─── CSS ─── */
const inp = 'w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10';
const sel = inp + ' appearance-none cursor-pointer';
const btnPrimary = 'px-4 py-2 bg-indigo-600 text-white text-[13px] font-medium rounded-xl hover:bg-indigo-700 transition-colors';
const btnSecondary = 'px-4 py-2 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors';

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtTarih = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/* ═══ Ana Bileşen ═══ */
export default function OdemeOnayClient() {
  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [durumFiltre, setDurumFiltre] = useState('');
  const [hakedisler, setHakedisler] = useState<Hakedis[]>([]);
  const [stats, setStats] = useState<HakedisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    const [hRes, sRes] = await Promise.all([
      fetchHakedisler(yil, ay, durumFiltre || undefined),
      fetchHakedisStats(yil, ay),
    ]);
    if (hRes.success && hRes.data) setHakedisler(hRes.data);
    if (sRes.success && sRes.data) setStats(sRes.data);
    setLoading(false);
  }, [yil, ay, durumFiltre]);

  useEffect(() => { load(); }, [load]);

  // Toplu seçim
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    const eligible = hakedisler.filter(h => h.durum === 'HESAPLANDI' || h.durum === 'ONAYLANDI');
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map(h => h.id)));
    }
  };

  // Tekil onayla
  const handleOnayla = async (id: number) => {
    const res = await onaylaHakedis(id);
    if (res.success) { showToast('success', 'Onaylandı.'); load(); }
    else showToast('error', (res as { error?: string }).error || 'Hata.');
  };

  // Tekil ödendi
  const handleOdendi = async (id: number) => {
    const tarih = prompt('Ödeme tarihi (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!tarih) return;
    const res = await odendiHakedis(id, tarih);
    if (res.success) { showToast('success', 'Ödendi olarak işaretlendi.'); load(); }
    else showToast('error', (res as { error?: string }).error || 'Hata.');
  };

  // Toplu onayla
  const handleTopluOnayla = async () => {
    const ids = [...selectedIds];
    const eligible = ids.filter(id => {
      const h = hakedisler.find(x => x.id === id);
      return h?.durum === 'HESAPLANDI';
    });
    if (eligible.length === 0) { showToast('error', 'Onaylanacak kayıt seçilmedi.'); return; }
    if (!confirm(`${eligible.length} hakediş onaylanacak. Devam?`)) return;
    let ok = 0;
    for (const id of eligible) {
      const res = await onaylaHakedis(id);
      if (res.success) ok++;
    }
    showToast('success', `${ok}/${eligible.length} hakediş onaylandı.`);
    load();
  };

  // Toplu ödendi
  const handleTopluOdendi = async () => {
    const ids = [...selectedIds];
    const eligible = ids.filter(id => {
      const h = hakedisler.find(x => x.id === id);
      return h?.durum === 'ONAYLANDI';
    });
    if (eligible.length === 0) { showToast('error', 'Ödendi işaretlenecek kayıt seçilmedi.'); return; }
    const tarih = prompt('Ödeme tarihi (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!tarih) return;
    let ok = 0;
    for (const id of eligible) {
      const res = await odendiHakedis(id, tarih);
      if (res.success) ok++;
    }
    showToast('success', `${ok}/${eligible.length} hakediş ödendi olarak işaretlendi.`);
    load();
  };

  // Durum sayıları
  const hesaplandiCount = hakedisler.filter(h => h.durum === 'HESAPLANDI').length;
  const onaylandiCount = hakedisler.filter(h => h.durum === 'ONAYLANDI').length;
  const odendiCount = hakedisler.filter(h => h.durum === 'ODENDI').length;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-lg text-white text-[13px] font-medium ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            ✅ Ödeme Onay
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Hakedişleri onaylayın ve ödeme durumunu yönetin
          </p>
        </div>
        <a href="/admin/personel/sozlesmeler" className={btnSecondary}>
          ← Sözleşmelere Dön
        </a>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-end gap-4 mb-6 bg-white rounded-2xl border border-gray-100 p-4">
        <div>
          <label className="block text-[12px] text-gray-500 font-medium mb-1">Yıl</label>
          <input type="number" className={inp + ' !w-28'} value={yil} onChange={e => setYil(Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-[12px] text-gray-500 font-medium mb-1">Ay</label>
          <select className={sel + ' !w-40'} value={ay} onChange={e => setAy(Number(e.target.value))}>
            {Object.entries(AY_ADLARI).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[12px] text-gray-500 font-medium mb-1">Durum</label>
          <select className={sel + ' !w-44'} value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}>
            <option value="">Tümü</option>
            <option value="HESAPLANDI">Hesaplandı ({hesaplandiCount})</option>
            <option value="ONAYLANDI">Onaylandı ({onaylandiCount})</option>
            <option value="ODENDI">Ödendi ({odendiCount})</option>
          </select>
        </div>
      </div>

      {/* Durum kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[12px] text-gray-500 mb-1">🔵 Hesaplandı</div>
          <div className="text-xl font-bold text-blue-600">{hesaplandiCount}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[12px] text-gray-500 mb-1">🟡 Onaylandı</div>
          <div className="text-xl font-bold text-amber-600">{onaylandiCount}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[12px] text-gray-500 mb-1">🟢 Ödendi</div>
          <div className="text-xl font-bold text-emerald-600">{odendiCount}</div>
        </div>
        {stats && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[12px] text-gray-500 mb-1">💰 Toplam Net</div>
            <div className="text-xl font-bold text-indigo-600">{fmtPara(stats.toplam_net)}</div>
          </div>
        )}
      </div>

      {/* Toplu işlem butonları */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-indigo-50 rounded-xl p-3">
          <span className="text-[13px] text-indigo-700 font-medium">
            {selectedIds.size} kayıt seçili
          </span>
          <button
            className="px-3 py-1.5 bg-amber-500 text-white text-[12px] font-medium rounded-lg hover:bg-amber-600 transition-colors"
            onClick={handleTopluOnayla}
          >
            ✅ Toplu Onayla
          </button>
          <button
            className="px-3 py-1.5 bg-emerald-500 text-white text-[12px] font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            onClick={handleTopluOdendi}
          >
            💰 Toplu Ödendi İşaretle
          </button>
        </div>
      )}

      {/* Tablo */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : hakedisler.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-gray-400 text-[14px]">Bu ay için hakediş kaydı bulunamadı.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedIds.size > 0 && selectedIds.size === hakedisler.filter(h => h.durum === 'HESAPLANDI' || h.durum === 'ONAYLANDI').length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-3 font-medium">Personel</th>
                <th className="px-3 py-3 font-medium text-right">Sabit Maaş</th>
                <th className="px-3 py-3 font-medium text-right">Ders Ücreti</th>
                <th className="px-3 py-3 font-medium text-right">Prim</th>
                <th className="px-3 py-3 font-medium text-right">Fazla Mesai</th>
                <th className="px-3 py-3 font-medium text-right">Ek Ödeme</th>
                <th className="px-3 py-3 font-medium text-right">Avans</th>
                <th className="px-3 py-3 font-medium text-right">Kesintiler</th>
                <th className="px-3 py-3 font-medium text-right">Brüt Toplam</th>
                <th className="px-3 py-3 font-medium text-right">Net Hakediş</th>
                <th className="px-3 py-3 font-medium">Durum</th>
                <th className="px-3 py-3 font-medium">Ödeme Tarihi</th>
                <th className="px-3 py-3 font-medium text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {hakedisler.map(h => {
                const canSelect = h.durum === 'HESAPLANDI' || h.durum === 'ONAYLANDI';
                return (
                  <tr key={h.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-3">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.has(h.id)}
                          onChange={() => toggleSelect(h.id)}
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900">{h.personel_ad}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{fmtPara(h.sabit_maas)}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{fmtPara(h.ders_ucreti_toplam)}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{h.prim > 0 ? fmtPara(h.prim) : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{h.fazla_mesai > 0 ? fmtPara(h.fazla_mesai) : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{fmtPara(h.ek_odeme)}</td>
                    <td className="px-3 py-3 text-right font-mono text-red-600">{h.avans > 0 ? fmtPara(h.avans) : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{fmtPara(h.kesintiler)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-gray-900">{fmtPara(h.brut_toplam)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-700">{fmtPara(h.net_hakedis)}</td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                        style={{ backgroundColor: HAKEDIS_DURUM_COLORS[h.durum] }}
                      >
                        {h.durum_display}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-500">{fmtTarih(h.odeme_tarihi)}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {h.durum === 'HESAPLANDI' && (
                          <button
                            className="px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[11px] font-medium hover:bg-amber-100 transition-colors"
                            onClick={() => handleOnayla(h.id)}
                          >
                            Onayla
                          </button>
                        )}
                        {h.durum === 'ONAYLANDI' && (
                          <button
                            className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-medium hover:bg-emerald-100 transition-colors"
                            onClick={() => handleOdendi(h.id)}
                          >
                            Ödendi
                          </button>
                        )}
                        {h.durum === 'ODENDI' && (
                          <span className="text-[11px] text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-700">
                <td className="px-3 py-3" colSpan={2}>TOPLAM</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.sabit_maas, 0))}</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.ders_ucreti_toplam, 0))}</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.prim, 0))}</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.fazla_mesai, 0))}</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.ek_odeme, 0))}</td>
                <td className="px-3 py-3 text-right text-red-600">{fmtPara(hakedisler.reduce((a, h) => a + h.avans, 0))}</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.kesintiler, 0))}</td>
                <td className="px-3 py-3 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.brut_toplam, 0))}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{fmtPara(hakedisler.reduce((a, h) => a + h.net_hakedis, 0))}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
