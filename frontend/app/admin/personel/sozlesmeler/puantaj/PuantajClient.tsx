'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchHakedisler, topluHakedisOlustur, updateHakedis,
  onaylaHakedis, odendiHakedis, deleteHakedis, fetchHakedisStats,
  fetchAvanslar, createAvans, deleteAvans,
  topluOnayla, topluOdendi,
  getBordroPdfTekilUrl, getBordroPdfTopluUrl,
} from '../services/api';
import type { Hakedis, HakedisStats, AvansKaydi } from '../types';
import { HAKEDIS_DURUM_COLORS, AY_ADLARI } from '../types';

/* ─── CSS ─── */
const inp = 'w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10';
const sel = inp + ' appearance-none cursor-pointer';
const btnPrimary = 'px-4 py-2 bg-indigo-600 text-white text-[13px] font-medium rounded-xl hover:bg-indigo-700 transition-colors';
const btnSecondary = 'px-4 py-2 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors';

const fmtPara = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

/* ═══ Ana Bileşen ═══ */
export default function MaasBordrosuClient() {
  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [hakedisler, setHakedisler] = useState<Hakedis[]>([]);
  const [stats, setStats] = useState<HakedisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [autoCreated, setAutoCreated] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Avans Drawer
  const [avansDrawerOpen, setAvansDrawerOpen] = useState(false);
  const [avansHakedis, setAvansHakedis] = useState<Hakedis | null>(null);
  const [avanslar, setAvanslar] = useState<AvansKaydi[]>([]);
  const [avansLoading, setAvansLoading] = useState(false);
  const [avansForm, setAvansForm] = useState({ tarih: new Date().toISOString().slice(0, 10), tutar: '', aciklama: '' });

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Veri yükleme ──
  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    const [hRes, sRes] = await Promise.all([
      fetchHakedisler(yil, ay),
      fetchHakedisStats(yil, ay),
    ]);
    if (hRes.success && hRes.data) setHakedisler(hRes.data);
    if (sRes.success && sRes.data) setStats(sRes.data);
    setLoading(false);
  }, [yil, ay]);

  useEffect(() => { load(); setAutoCreated(false); }, [load]);

  // ── Toplu oluştur ──
  const handleTopluOlustur = async () => {
    const res = await topluHakedisOlustur(yil, ay);
    if (res.success && res.data) {
      if (res.data.olusturulan > 0) {
        showToast('success', `${res.data.olusturulan} personel için bordro oluşturuldu / güncellendi.`);
      } else {
        showToast('success', 'Tüm bordrolar güncel.');
      }
      load();
    } else {
      showToast('error', (res as { error?: string }).error || 'Hata oluştu.');
    }
  };

  // İlk yüklemede kayıt yoksa otomatik oluştur
  useEffect(() => {
    if (!loading && hakedisler.length === 0 && !autoCreated) {
      setAutoCreated(true);
      handleTopluOlustur();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hakedisler.length, autoCreated]);

  // ── Satır güncelle ──
  const handleInlineUpdate = async (id: number, data: Record<string, unknown>) => {
    const res = await updateHakedis(id, data);
    if (res.success) {
      showToast('success', 'Kaydedildi.');
      load();
      setEditId(null);
    } else {
      showToast('error', (res as { error?: string }).error || 'Güncellenemedi.');
    }
  };

  const handleOnayla = async (id: number) => {
    const res = await onaylaHakedis(id);
    if (res.success) { showToast('success', 'Onaylandı.'); load(); }
    else showToast('error', (res as { error?: string }).error || 'Hata.');
  };

  const handleOdendi = async (id: number) => {
    const tarih = prompt('Ödeme tarihi (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!tarih) return;
    const res = await odendiHakedis(id, tarih);
    if (res.success) { showToast('success', 'Ödendi olarak işaretlendi.'); load(); }
    else showToast('error', (res as { error?: string }).error || 'Hata.');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bu bordro kaydını silmek istediğinize emin misiniz?')) return;
    const res = await deleteHakedis(id);
    if (res.success) { showToast('success', 'Silindi.'); load(); }
    else showToast('error', (res as { error?: string }).error || 'Silinemedi.');
  };

  // ── Toplu seçim ──
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    const eligible = hakedisler.filter(h => h.durum !== 'ODENDI' && h.durum !== 'IPTAL');
    if (selectedIds.size === eligible.length && eligible.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map(h => h.id)));
    }
  };

  // ── Toplu Onayla ──
  const handleTopluOnaylaAction = async () => {
    const ids = [...selectedIds].filter(id => {
      const h = hakedisler.find(x => x.id === id);
      return h?.durum === 'HESAPLANDI';
    });
    if (ids.length === 0) { showToast('error', 'Onaylanacak kayıt yok (sadece "Hesaplandı" durumundakiler).'); return; }
    if (!confirm(`${ids.length} bordro onaylanacak. Devam?`)) return;
    const res = await topluOnayla(ids);
    if (res.success && res.data) {
      showToast('success', `${res.data.onaylanan} bordro onaylandı.`);
      load();
    } else {
      showToast('error', (res as { error?: string }).error || 'Hata.');
    }
  };

  // ── Toplu Ödendi ──
  const handleTopluOdendiAction = async () => {
    const ids = [...selectedIds].filter(id => {
      const h = hakedisler.find(x => x.id === id);
      return h?.durum === 'ONAYLANDI';
    });
    if (ids.length === 0) { showToast('error', 'Ödendi işaretlenecek kayıt yok (sadece "Onaylandı" durumundakiler).'); return; }
    const tarih = prompt('Ödeme tarihi (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!tarih) return;
    const res = await topluOdendi(ids, tarih);
    if (res.success && res.data) {
      showToast('success', `${res.data.odenen} bordro ödendi olarak işaretlendi.`);
      load();
    } else {
      showToast('error', (res as { error?: string }).error || 'Hata.');
    }
  };

  // ── Avans Drawer ──
  const openAvansDrawer = async (h: Hakedis) => {
    setAvansHakedis(h);
    setAvansDrawerOpen(true);
    setAvansLoading(true);
    setAvansForm({ tarih: new Date().toISOString().slice(0, 10), tutar: '', aciklama: '' });
    const res = await fetchAvanslar({ sozlesme_id: h.sozlesme_id, yil: h.yil, ay: h.ay });
    if (res.success && res.data) setAvanslar(res.data);
    setAvansLoading(false);
  };

  const handleAvansEkle = async () => {
    if (!avansHakedis) return;
    if (!avansForm.tutar || parseFloat(avansForm.tutar) <= 0) {
      showToast('error', 'Tutar giriniz.');
      return;
    }
    const res = await createAvans({
      sozlesme_id: avansHakedis.sozlesme_id,
      tarih: avansForm.tarih,
      tutar: parseFloat(avansForm.tutar),
      aciklama: avansForm.aciklama,
      mahsup_yil: avansHakedis.yil,
      mahsup_ay: avansHakedis.ay,
    });
    if (res.success) {
      showToast('success', 'Avans eklendi.');
      setAvansForm({ tarih: new Date().toISOString().slice(0, 10), tutar: '', aciklama: '' });
      const aRes = await fetchAvanslar({ sozlesme_id: avansHakedis.sozlesme_id, yil: avansHakedis.yil, ay: avansHakedis.ay });
      if (aRes.success && aRes.data) setAvanslar(aRes.data);
      load();
    } else {
      showToast('error', (res as { error?: string }).error || 'Avans eklenemedi.');
    }
  };

  const handleAvansSil = async (avansId: number) => {
    if (!confirm('Bu avans kaydını silmek istediğinize emin misiniz?')) return;
    const res = await deleteAvans(avansId);
    if (res.success) {
      showToast('success', 'Avans silindi.');
      if (avansHakedis) {
        const aRes = await fetchAvanslar({ sozlesme_id: avansHakedis.sozlesme_id, yil: avansHakedis.yil, ay: avansHakedis.ay });
        if (aRes.success && aRes.data) setAvanslar(aRes.data);
      }
      load();
    } else {
      showToast('error', (res as { error?: string }).error || 'Silinemedi.');
    }
  };

  // Durum sayıları
  const hesaplandiCount = hakedisler.filter(h => h.durum === 'HESAPLANDI').length;
  const onaylandiCount = hakedisler.filter(h => h.durum === 'ONAYLANDI').length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-lg text-white text-[13px] font-medium ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Başlık ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            💰 Maaş Bordrosu
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Aylık maaş, ders ücreti, prim ve fazla mesai hesaplamalarını yönetin
          </p>
        </div>
        <a href="/admin/personel/sozlesmeler" className={btnSecondary}>
          ← Sözleşmelere Dön
        </a>
      </div>

      {/* ── Ay / Yıl Seçimi + Butonlar ── */}
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
        <button className={btnPrimary} onClick={handleTopluOlustur}>
          ⚡ Bordroları Oluştur / Güncelle
        </button>
        <a
          href={getBordroPdfTopluUrl(yil, ay)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-red-600 text-white text-[13px] font-medium rounded-xl hover:bg-red-700 transition-colors inline-flex items-center gap-1.5"
        >
          📄 PDF İndir (Toplu)
        </a>
      </div>

      {/* ── İstatistik Kartları ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[12px] text-gray-500 mb-1">👥 Personel</div>
            <div className="text-xl font-bold text-indigo-600">{stats.kayit_sayisi}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[12px] text-gray-500 mb-1">💰 Toplam Brüt</div>
            <div className="text-xl font-bold text-amber-600">{fmtPara(stats.toplam_brut)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[12px] text-gray-500 mb-1">💵 Toplam Net</div>
            <div className="text-xl font-bold text-emerald-600">{fmtPara(stats.toplam_net)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[12px] text-gray-500 mb-1">🕐 Toplam Ders Saati</div>
            <div className="text-xl font-bold text-purple-600">{stats.toplam_ders_saat}</div>
          </div>
        </div>
      )}

      {/* ── Toplu İşlem Bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-indigo-50 rounded-xl p-3">
          <span className="text-[13px] text-indigo-700 font-medium">
            {selectedIds.size} kayıt seçili
          </span>
          {hesaplandiCount > 0 && (
            <button
              className="px-3 py-1.5 bg-amber-500 text-white text-[12px] font-medium rounded-lg hover:bg-amber-600 transition-colors"
              onClick={handleTopluOnaylaAction}
            >
              ✅ Toplu Onayla
            </button>
          )}
          {onaylandiCount > 0 && (
            <button
              className="px-3 py-1.5 bg-emerald-500 text-white text-[12px] font-medium rounded-lg hover:bg-emerald-600 transition-colors"
              onClick={handleTopluOdendiAction}
            >
              💰 Toplu Ödendi İşaretle
            </button>
          )}
          <button
            className="ml-auto text-[12px] text-gray-500 hover:text-gray-700"
            onClick={() => setSelectedIds(new Set())}
          >
            Seçimi Temizle ✕
          </button>
        </div>
      )}

      {/* ── Tablo ── */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : hakedisler.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <p className="text-4xl mb-2">💰</p>
          <p className="text-gray-400 text-[14px] mb-4">Bu ay için aktif sözleşme bulunamadı.</p>
          <p className="text-[12px] text-gray-400">Önce personel sözleşmelerini oluşturup aktifleştirin.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="px-2 py-2.5 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedIds.size > 0 && selectedIds.size === hakedisler.filter(h => h.durum !== 'ODENDI' && h.durum !== 'IPTAL').length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-2.5 py-2.5 font-medium sticky left-0 bg-gray-50 z-10 min-w-[140px]">Personel</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[90px]">Aylık Maaş</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[60px]">Ders Saat</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[70px]">Birim ₺</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[90px]">Ders Ücreti</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[80px]">Prim</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[80px]">Fazla Mesai</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[80px]">Ek Ödeme</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[80px]">Avans</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[80px]">Kesintiler</th>
                <th className="px-2.5 py-2.5 font-medium text-right min-w-[100px]">Net Ödeme</th>
                <th className="px-2.5 py-2.5 font-medium min-w-[70px]">Durum</th>
                <th className="px-2.5 py-2.5 font-medium text-center min-w-[110px]">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {hakedisler.map(h => (
                <BordroRow
                  key={h.id}
                  h={h}
                  isEditing={editId === h.id}
                  isSelected={selectedIds.has(h.id)}
                  onToggleSelect={() => toggleSelect(h.id)}
                  onEdit={() => setEditId(h.id)}
                  onCancel={() => setEditId(null)}
                  onSave={(data) => handleInlineUpdate(h.id, data)}
                  onOnayla={() => handleOnayla(h.id)}
                  onOdendi={() => handleOdendi(h.id)}
                  onDelete={() => handleDelete(h.id)}
                  onAvansClick={() => openAvansDrawer(h)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-700 text-[12px]">
                <td className="px-2 py-2.5"></td>
                <td className="px-2.5 py-2.5 sticky left-0 bg-gray-50">TOPLAM ({hakedisler.length} kişi)</td>
                <td className="px-2.5 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.sabit_maas, 0))}</td>
                <td className="px-2.5 py-2.5 text-right">{hakedisler.reduce((a, h) => a + h.toplam_ders_saati, 0).toFixed(1)}</td>
                <td className="px-2.5 py-2.5 text-right">—</td>
                <td className="px-2.5 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.ders_ucreti_toplam, 0))}</td>
                <td className="px-2.5 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.prim, 0))}</td>
                <td className="px-2.5 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.fazla_mesai, 0))}</td>
                <td className="px-2.5 py-2.5 text-right">{fmtPara(hakedisler.reduce((a, h) => a + h.ek_odeme, 0))}</td>
                <td className="px-2.5 py-2.5 text-right text-red-600">{fmtPara(hakedisler.reduce((a, h) => a + h.avans, 0))}</td>
                <td className="px-2.5 py-2.5 text-right text-red-600">{fmtPara(hakedisler.reduce((a, h) => a + h.kesintiler, 0))}</td>
                <td className="px-2.5 py-2.5 text-right text-emerald-700">{fmtPara(hakedisler.reduce((a, h) => a + h.net_hakedis, 0))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Açıklama notu */}
      <div className="mt-4 bg-blue-50 rounded-xl p-3 text-[11px] text-blue-700">
        <strong>💡 İpucu:</strong> Ders saati girildiğinde ders ücreti sözleşmedeki birim ücret üzerinden otomatik hesaplanır.
        Net ödeme = (Maaş + Ders Ücreti + Prim + Fazla Mesai + Ek Ödeme) − Avans − Kesintiler.
        İsme tıklayarak ödeme geçmişine, avans sütununa tıklayarak avans kayıtlarına ulaşabilirsiniz.
      </div>

      {/* ═══ Avans Drawer ═══ */}
      {avansDrawerOpen && avansHakedis && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setAvansDrawerOpen(false)} />
          <div className="relative w-[460px] bg-white shadow-2xl h-full overflow-y-auto">
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">💳 Avans Kayıtları</h2>
                  <p className="text-[13px] text-gray-500 mt-0.5">
                    {avansHakedis.personel_ad} — {AY_ADLARI[avansHakedis.ay]} {avansHakedis.yil}
                  </p>
                </div>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
                  onClick={() => setAvansDrawerOpen(false)}
                >✕</button>
              </div>

              {/* Yeni Avans Formu */}
              <div className="bg-indigo-50/60 rounded-xl p-4 mb-5">
                <h3 className="text-[13px] font-semibold text-indigo-700 mb-3">➕ Yeni Avans Ekle</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Tarih</label>
                    <input
                      type="date"
                      className={inp + ' !text-[12px] !py-2'}
                      value={avansForm.tarih}
                      onChange={e => setAvansForm(p => ({ ...p, tarih: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Tutar (₺)</label>
                    <input
                      type="number"
                      className={inp + ' !text-[12px] !py-2'}
                      placeholder="0.00"
                      value={avansForm.tutar}
                      onChange={e => setAvansForm(p => ({ ...p, tutar: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-[11px] text-gray-500 mb-1">Açıklama</label>
                  <input
                    type="text"
                    className={inp + ' !text-[12px] !py-2'}
                    placeholder="Avans nedeni..."
                    value={avansForm.aciklama}
                    onChange={e => setAvansForm(p => ({ ...p, aciklama: e.target.value }))}
                  />
                </div>
                <button className={btnPrimary + ' !text-[12px] !py-2 w-full'} onClick={handleAvansEkle}>
                  💾 Avans Ekle
                </button>
              </div>

              {/* Avans Listesi */}
              <h3 className="text-[13px] font-semibold text-gray-700 mb-3">
                Kayıtlı Avanslar ({avanslar.length})
              </h3>
              {avansLoading ? (
                <div className="text-center py-8 text-gray-400">Yükleniyor...</div>
              ) : avanslar.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-xl">
                  <p className="text-gray-400 text-[13px]">Bu ay için avans kaydı yok.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {avanslar.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-3">
                      <div>
                        <div className="text-[13px] font-medium text-gray-900">
                          {fmtPara(a.tutar)}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {new Date(a.tarih).toLocaleDateString('tr-TR')}
                          {a.aciklama && ` — ${a.aciklama}`}
                        </div>
                      </div>
                      <button
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 text-[14px]"
                        title="Sil"
                        onClick={() => handleAvansSil(a.id)}
                      >🗑️</button>
                    </div>
                  ))}
                  <div className="bg-gray-50 rounded-xl p-3 text-right">
                    <span className="text-[12px] text-gray-500">Toplam:</span>
                    <span className="ml-2 text-[14px] font-bold text-red-600">
                      {fmtPara(avanslar.reduce((s, a) => s + a.tutar, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════
   Bordro Satırı (Inline Edit — otomatik hesaplama)
   ═══════════════════════════════════════════ */
interface BordroRowProps {
  h: Hakedis;
  isEditing: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onOnayla: () => void;
  onOdendi: () => void;
  onDelete: () => void;
  onAvansClick: () => void;
}

function BordroRow({ h, isEditing, isSelected, onToggleSelect, onEdit, onCancel, onSave, onOnayla, onOdendi, onDelete, onAvansClick }: BordroRowProps) {
  const [dersSaati, setDersSaati] = useState(String(h.toplam_ders_saati));
  const [prim, setPrim] = useState(String(h.prim));
  const [fazlaMesai, setFazlaMesai] = useState(String(h.fazla_mesai));
  const [ekOdeme, setEkOdeme] = useState(String(h.ek_odeme));
  const [avans, setAvans] = useState(String(h.avans));
  const [kesintiler, setKesintiler] = useState(String(h.kesintiler));

  // Ders saati değişince otomatik hesaplanan ders ücreti
  const parsedDersSaati = parseFloat(dersSaati) || 0;
  const hesaplananDersUcreti = h.ders_basi_ucret * parsedDersSaati;

  // Net ödeme canlı hesaplama (düzenleme sırasında)
  const canliNet = h.sabit_maas
    + hesaplananDersUcreti
    + (parseFloat(prim) || 0)
    + (parseFloat(fazlaMesai) || 0)
    + (parseFloat(ekOdeme) || 0)
    - (parseFloat(avans) || 0)
    - (parseFloat(kesintiler) || 0);

  const editInp = 'w-[72px] px-1.5 py-1 text-[11px] border border-indigo-200 rounded-lg text-right outline-none focus:border-indigo-500';
  const canEdit = h.durum === 'HESAPLANDI';

  const handleSave = () => {
    onSave({
      toplam_ders_saati: parsedDersSaati,
      prim: parseFloat(prim) || 0,
      fazla_mesai: parseFloat(fazlaMesai) || 0,
      ek_odeme: parseFloat(ekOdeme) || 0,
      avans: parseFloat(avans) || 0,
      kesintiler: parseFloat(kesintiler) || 0,
    });
  };

  return (
    <tr className={`border-t border-gray-50 transition-colors ${isEditing ? 'bg-indigo-50/30' : isSelected ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'}`}>
      {/* Checkbox */}
      <td className="px-2 py-2.5 text-center">
        {h.durum !== 'ODENDI' && h.durum !== 'IPTAL' ? (
          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={isSelected} onChange={onToggleSelect} />
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* Personel */}
      <td className="px-2.5 py-2.5 sticky left-0 bg-white z-10 font-medium text-[12px]">
        <a
          href={`/admin/personel/sozlesmeler/personel-detay/${h.personel_id}`}
          className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
        >
          {h.personel_ad}
        </a>
        {h.sozlesme_turu !== 'TAM_ZAMANLI' && (
          <span className="ml-1 text-[10px] text-purple-500">({h.sozlesme_turu_display})</span>
        )}
      </td>

      {/* Aylık Maaş — sözleşmeden otomatik (readonly) */}
      <td className="px-2.5 py-2.5 text-right font-mono text-gray-700">{fmtPara(h.sabit_maas)}</td>

      {/* Ders Saati — düzenlenebilir */}
      <td className="px-2.5 py-2.5 text-right">
        {isEditing ? (
          <input className={editInp + ' !w-[56px]'} value={dersSaati} onChange={e => setDersSaati(e.target.value)} />
        ) : (
          <span className="font-mono text-gray-700">{h.toplam_ders_saati || '—'}</span>
        )}
      </td>

      {/* Birim Ders Ücreti — sözleşmeden otomatik (readonly) */}
      <td className="px-2.5 py-2.5 text-right font-mono text-gray-400 text-[11px]">
        {h.ders_basi_ucret > 0 ? `${h.ders_basi_ucret}₺` : '—'}
      </td>

      {/* Ders Ücreti Toplamı — birim × saat otomatik hesaplanır */}
      <td className="px-2.5 py-2.5 text-right font-mono text-gray-700">
        {isEditing ? (
          <span className="text-indigo-600 font-semibold">{fmtPara(hesaplananDersUcreti)}</span>
        ) : (
          h.ders_ucreti_toplam > 0 ? fmtPara(h.ders_ucreti_toplam) : '—'
        )}
      </td>

      {/* Prim */}
      <td className="px-2.5 py-2.5 text-right">
        {isEditing ? (
          <input className={editInp} value={prim} onChange={e => setPrim(e.target.value)} />
        ) : (
          <span className="font-mono text-gray-700">{h.prim > 0 ? fmtPara(h.prim) : '—'}</span>
        )}
      </td>

      {/* Fazla Mesai */}
      <td className="px-2.5 py-2.5 text-right">
        {isEditing ? (
          <input className={editInp} value={fazlaMesai} onChange={e => setFazlaMesai(e.target.value)} />
        ) : (
          <span className="font-mono text-gray-700">{h.fazla_mesai > 0 ? fmtPara(h.fazla_mesai) : '—'}</span>
        )}
      </td>

      {/* Ek Ödeme */}
      <td className="px-2.5 py-2.5 text-right">
        {isEditing ? (
          <input className={editInp} value={ekOdeme} onChange={e => setEkOdeme(e.target.value)} />
        ) : (
          <span className="font-mono text-gray-700">{h.ek_odeme > 0 ? fmtPara(h.ek_odeme) : '—'}</span>
        )}
      </td>

      {/* Avans */}
      <td className="px-2.5 py-2.5 text-right">
        {isEditing ? (
          <input className={editInp} value={avans} onChange={e => setAvans(e.target.value)} />
        ) : (
          <span className={`font-mono ${h.avans > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
            {h.avans > 0 ? fmtPara(h.avans) : '—'}
          </span>
        )}
      </td>

      {/* Kesintiler */}
      <td className="px-2.5 py-2.5 text-right">
        {isEditing ? (
          <input className={editInp} value={kesintiler} onChange={e => setKesintiler(e.target.value)} />
        ) : (
          <span className={`font-mono ${h.kesintiler > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {h.kesintiler > 0 ? fmtPara(h.kesintiler) : '—'}
          </span>
        )}
      </td>

      {/* Net Ödeme — canlı hesaplanan */}
      <td className="px-2.5 py-2.5 text-right font-mono font-semibold text-emerald-700">
        {isEditing ? fmtPara(canliNet) : fmtPara(h.net_hakedis)}
      </td>

      {/* Durum */}
      <td className="px-2.5 py-2.5">
        <span
          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
          style={{ backgroundColor: HAKEDIS_DURUM_COLORS[h.durum] }}
        >
          {h.durum_display}
        </span>
      </td>

      {/* İşlemler */}
      <td className="px-2.5 py-2.5 text-center">
        <div className="flex items-center justify-center gap-0.5">
          {isEditing ? (
            <>
              <button className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600 text-[14px]" onClick={handleSave} title="Kaydet">💾</button>
              <button className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 text-[12px]" onClick={onCancel}>✕</button>
            </>
          ) : (
            <>
              {canEdit && <button className="p-1 rounded-lg hover:bg-indigo-50 text-indigo-500 text-[14px]" title="Düzenle" onClick={onEdit}>✏️</button>}
              {h.durum === 'HESAPLANDI' && <button className="p-1 rounded-lg hover:bg-amber-50 text-amber-600 text-[14px]" title="Onayla" onClick={onOnayla}>✅</button>}
              {h.durum === 'ONAYLANDI' && <button className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600 text-[14px]" title="Ödendi" onClick={onOdendi}>💰</button>}
              <button className="p-1 rounded-lg hover:bg-purple-50 text-purple-500 text-[14px]" title="Avans Kayıtları" onClick={onAvansClick}>📋</button>
              {canEdit && <button className="p-1 rounded-lg hover:bg-red-50 text-red-500 text-[14px]" title="Sil" onClick={onDelete}>🗑️</button>}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
